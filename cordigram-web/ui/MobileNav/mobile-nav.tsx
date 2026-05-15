"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { io, type Socket } from "socket.io-client";
import styles from "./mobile-nav.module.css";
import {
  apiFetch,
  getApiBaseUrl,
  fetchCurrentProfile,
  type CurrentProfileResponse,
  fetchNotifications,
  fetchNotificationSeenAt,
  updateNotificationSeenAt,
  type NotificationItem,
  fetchDmUnreadCount,
} from "@/lib/api";
import {
  CURRENT_PROFILE_UPDATED_EVENT,
  emitNotificationDeleted,
  emitNotificationReceived,
  emitNotificationStateChanged,
  NOTIFICATION_READ_EVENT,
  type NotificationReadDetail,
} from "@/lib/events";
import { useTheme } from "@/component/theme-provider";
import { useLanguage, SUPPORTED_LANGUAGE_CODES } from "@/component/language-provider";
import { useNavigationGuard } from "@/context/navigation-guard-context";
import SearchOverlay from "@/ui/search-overlay/search-overlay";
import NotificationsOverlay from "@/ui/notifications-overlay/notifications-overlay";
import { clearStoredAccessToken, getStoredAccessToken, isAccessTokenValid } from "@/lib/auth";
import { useTranslations } from "next-intl";

const LANG_LABELS: Record<string, string> = { vi: "Tiếng Việt", en: "English", ja: "日本語", zh: "中文" };

const bottomTabs = [
  { key: "home", href: "/", icon: IconHome },
  { key: "following", href: "/following", icon: IconFollowing },
  { key: "explore", href: "/explore", icon: IconCompass },
  { key: "reels", href: "/reels", icon: IconReel },
  { key: "create", href: "/create", icon: IconPlus },
];

export default function MobileNav() {
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("sidebar");
  const { theme, toggleTheme } = useTheme();
  const { language, setLanguage } = useLanguage();
  const { getGuard } = useNavigationGuard();

  const [profile, setProfile] = useState<CurrentProfileResponse | null>(null);
  const [isGuest, setIsGuest] = useState(true);
  const [mounted, setMounted] = useState(false);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchClosing, setSearchClosing] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notificationClosing, setNotificationClosing] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  const [unreadCount, setUnreadCount] = useState(0);
  const [dmUnreadCount, setDmUnreadCount] = useState(0);
  const [lastSeenAt, setLastSeenAt] = useState<number | null>(null);
  const [lastSeenReady, setLastSeenReady] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const dmSocketRef = useRef<Socket | null>(null);
  const notificationOpenRef = useRef(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    notificationOpenRef.current = notificationOpen;
  }, [notificationOpen]);

  useEffect(() => {
    let active = true;
    const loadProfile = async () => {
      const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
      if (!token || !isAccessTokenValid(token)) {
        if (active) { setProfile(null); setIsGuest(true); }
        return;
      }
      try {
        const result = await fetchCurrentProfile({ token });
        if (active) { setProfile(result); setIsGuest(false); }
      } catch {
        if (active) { setProfile(null); setIsGuest(true); }
      }
    };

    loadProfile();

    const onStorage = (e: StorageEvent) => { if (e.key === "accessToken") loadProfile(); };
    const onProfileUpdated = () => loadProfile();
    window.addEventListener("storage", onStorage);
    window.addEventListener(CURRENT_PROFILE_UPDATED_EVENT, onProfileUpdated);
    return () => {
      active = false;
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(CURRENT_PROFILE_UPDATED_EVENT, onProfileUpdated);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let active = true;
    const token = getStoredAccessToken();
    if (!token) { setLastSeenAt(null); setLastSeenReady(true); return; }

    setLastSeenReady(false);
    fetchNotificationSeenAt({ token })
      .then((res) => {
        if (!active) return;
        const parsed = res.lastSeenAt ? new Date(res.lastSeenAt).getTime() : NaN;
        setLastSeenAt(Number.isFinite(parsed) ? parsed : null);
      })
      .catch(() => { if (active) setLastSeenAt(null); })
      .finally(() => { if (active) setLastSeenReady(true); });

    return () => { active = false; };
  }, [profile?.id, profile?.userId]);

  const connectNotifications = useCallback(
    (token: string) => {
      socketRef.current?.disconnect();
      const deviceId = typeof window !== "undefined"
        ? (window.localStorage.getItem("cordigramDeviceId") ?? undefined)
        : undefined;
      const socket = io(`${getApiBaseUrl()}/notifications`, {
        auth: { token },
        query: deviceId ? { deviceId } : {},
        transports: ["websocket"],
      });

      socket.on("notification:new", (payload: { notification: NotificationItem; unreadCount?: number }) => {
        if (!payload?.notification) return;
        emitNotificationReceived({ notification: payload.notification });
        const createdAt = new Date(payload.notification.createdAt).getTime();
        const cutoff = lastSeenAt ?? 0;
        if (createdAt > cutoff) setUnreadCount((prev) => prev + 1);
      });

      socket.on("notification:seen", (payload: { lastSeenAt?: string; unreadCount?: number }) => {
        const parsed = payload?.lastSeenAt ? new Date(payload.lastSeenAt).getTime() : NaN;
        if (Number.isFinite(parsed)) setLastSeenAt(parsed);
        setUnreadCount(typeof payload?.unreadCount === "number" ? payload.unreadCount : 0);
      });

      socket.on("notification:state", (payload: { id?: string; readAt?: string | null }) => {
        if (!payload?.id) return;
        emitNotificationStateChanged({ id: payload.id, readAt: payload.readAt ?? null });
      });

      socket.on("notification:deleted", (payload: { id?: string }) => {
        if (!payload?.id) return;
        emitNotificationDeleted({ id: payload.id });
        setUnreadCount((prev) => Math.max(0, prev - 1));
      });

      socket.on("auth:force_logout", () => {
        socket.disconnect();
        socketRef.current = null;
        clearStoredAccessToken();
        if (typeof window !== "undefined") {
          try { window.sessionStorage.setItem("skipSessionRestore", "1"); } catch {}
          window.location.href = "/login?loggedOut=1";
        }
      });

      socketRef.current = socket;
    },
    [lastSeenAt],
  );

  const connectDirectMessages = useCallback((token: string) => {
    dmSocketRef.current?.disconnect();
    const socket = io(`${getApiBaseUrl()}/direct-messages`, {
      auth: { token },
      transports: ["websocket"],
    });
    socket.on("dm-unread-count", (payload: { totalUnread?: number } | null) => {
      const next = payload?.totalUnread;
      if (typeof next === "number" && Number.isFinite(next)) setDmUnreadCount(next);
    });
    dmSocketRef.current = socket;
  }, []);

  useEffect(() => {
    if (!lastSeenReady) return;
    const token = getStoredAccessToken();
    if (!token) {
      setUnreadCount(0);
      setDmUnreadCount(0);
      socketRef.current?.disconnect();
      socketRef.current = null;
      dmSocketRef.current?.disconnect();
      dmSocketRef.current = null;
      return;
    }

    fetchNotifications({ token, limit: 50 })
      .then((res) => {
        const cutoff = lastSeenAt ?? 0;
        const count = (res.items ?? []).filter((item) => new Date(item.createdAt).getTime() > cutoff).length;
        setUnreadCount(count);
      })
      .catch(() => setUnreadCount(0));

    connectNotifications(token);
    connectDirectMessages(token);

    fetchDmUnreadCount({ token })
      .then((res) => setDmUnreadCount(res.unreadCount ?? 0))
      .catch(() => setDmUnreadCount(0));

    return () => {
      socketRef.current?.disconnect();
      socketRef.current = null;
      dmSocketRef.current?.disconnect();
      dmSocketRef.current = null;
    };
  }, [connectNotifications, connectDirectMessages, profile?.id, profile?.userId, lastSeenAt, lastSeenReady]);

  useEffect(() => {
    const handleRead = (event: Event) => {
      const detail = (event as CustomEvent<NotificationReadDetail>).detail;
      if (!detail?.id) return;
      setUnreadCount((prev) => Math.max(0, prev - 1));
    };
    window.addEventListener(NOTIFICATION_READ_EVENT, handleRead);
    return () => window.removeEventListener(NOTIFICATION_READ_EVENT, handleRead);
  }, []);

  useEffect(() => {
    if (!profileMenuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setProfileMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [profileMenuOpen]);

  const avatarLetter = useMemo(() => {
    const source = profile?.displayName || profile?.username || "";
    const letter = source.trim().charAt(0);
    return letter ? letter.toUpperCase() : "U";
  }, [profile]);

  const handleLogout = useCallback(async () => {
    setProfileMenuOpen(false);
    try {
      await apiFetch<{ success: boolean }>({ path: "/auth/logout", method: "POST", credentials: "include" });
    } catch {}
    if (typeof window !== "undefined") {
      localStorage.removeItem("accessToken");
      localStorage.removeItem("ui-theme");
    }
    setProfile(null);
    router.replace("/login?loggedOut=1");
  }, [router]);

  const handleGuardedNav = useCallback(
    (href: string, e: React.MouseEvent) => {
      const guard = getGuard();
      if (guard) { e.preventDefault(); guard(href); }
    },
    [getGuard],
  );

  const isMessagesPage = pathname?.startsWith("/messages");
  const isReelsPage = pathname?.startsWith("/reels");

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname?.startsWith(href);
  };

  const openNotifications = () => {
    setNotificationClosing(false);
    const now = Date.now();
    setLastSeenAt(now);
    setUnreadCount(0);
    setNotificationOpen(true);
    const token = getStoredAccessToken();
    if (token) {
      updateNotificationSeenAt({ token })
        .then((res) => {
          const parsed = res.lastSeenAt ? new Date(res.lastSeenAt).getTime() : NaN;
          if (Number.isFinite(parsed)) setLastSeenAt(parsed);
        })
        .catch(() => undefined);
    }
  };

  return (
    <>
      {/* ── Mobile Top Bar ───────────────────────────────────────────── */}
      <header className={styles.topBar}>
        <Link href="/" className={styles.brand}>
          <Image src="/logo.png" alt="Cordigram" width={32} height={32} className={styles.logo} priority />
          <span className={styles.brandName}>CORDIGRAM</span>
        </Link>

        <div className={styles.topActions}>
          {/* Search */}
          <button
            type="button"
            className={styles.topAction}
            onClick={() => setSearchOpen(true)}
            aria-label="Search"
          >
            <IconSearch />
          </button>

          {/* Notifications */}
          <button
            type="button"
            className={styles.topAction}
            onClick={openNotifications}
            aria-label="Notifications"
          >
            <span className={styles.actionWrap}>
              <IconBell />
              {unreadCount > 0 && (
                <span className={styles.actionBadge}>{unreadCount > 99 ? "99+" : unreadCount}</span>
              )}
            </span>
          </button>

          {/* Messages */}
          <Link
            href="/messages"
            className={styles.topAction}
            onClick={(e) => handleGuardedNav("/messages", e)}
            aria-label="Messages"
          >
            <span className={styles.actionWrap}>
              <IconMessage />
              {dmUnreadCount > 0 && (
                <span className={styles.actionBadge}>{dmUnreadCount > 99 ? "99+" : dmUnreadCount}</span>
              )}
            </span>
          </Link>

          {/* Profile avatar */}
          {isGuest ? (
            <Link href="/login" className={styles.guestLoginLink}>
              {t("menu.profile")}
            </Link>
          ) : (
            <div ref={menuRef} className={styles.avatarWrap}>
              <button
                type="button"
                className={styles.avatarBtn}
                onClick={() => setProfileMenuOpen((v) => !v)}
                aria-label="Profile"
              >
                {profile?.avatarUrl ? (
                  <Image
                    src={profile.avatarUrl}
                    alt={profile.displayName ?? "avatar"}
                    width={32}
                    height={32}
                    className={styles.avatarImg}
                  />
                ) : (
                  <span className={styles.avatarFallback}>{avatarLetter}</span>
                )}
              </button>

              {profileMenuOpen && (
                <div className={styles.profileSheet}>
                  <div className={styles.profileSheetHeader}>
                    <div className={styles.profileSheetAvatar}>
                      {profile?.avatarUrl ? (
                        <Image
                          src={profile.avatarUrl}
                          alt={profile.displayName ?? ""}
                          width={48}
                          height={48}
                          className={styles.avatarImg}
                        />
                      ) : (
                        <span className={styles.sheetAvatarFallback}>{avatarLetter}</span>
                      )}
                    </div>
                    <div>
                      {profile?.displayName && <p className={styles.sheetName}>{profile.displayName}</p>}
                      {profile?.username && <p className={styles.sheetUsername}>@{profile.username}</p>}
                    </div>
                  </div>

                  <div className={styles.profileSheetMenu}>
                    <button
                      type="button"
                      className={styles.sheetItem}
                      onClick={() => {
                        setProfileMenuOpen(false);
                        const id = profile?.id || profile?.userId;
                        if (id) router.push(`/profile/${id}`);
                      }}
                    >
                      <IconProfile /> {t("menu.profile")}
                    </button>
                    <button
                      type="button"
                      className={styles.sheetItem}
                      onClick={() => { setProfileMenuOpen(false); router.push("/settings"); }}
                    >
                      <IconSettings /> {t("menu.settings")}
                    </button>
                    <button
                      type="button"
                      className={styles.sheetItem}
                      onClick={() => {
                        setProfileMenuOpen(false);
                        const id = profile?.id || profile?.userId;
                        if (id) router.push(`/profile/${id}/saved`);
                      }}
                    >
                      <IconSaved /> {t("menu.saved")}
                    </button>
                    <button
                      type="button"
                      className={styles.sheetItem}
                      onClick={() => { setProfileMenuOpen(false); router.push("/ads"); }}
                    >
                      <IconAds /> {t("nav.ads")}
                    </button>
                    <button
                      type="button"
                      className={styles.sheetItem}
                      onClick={() => {
                        toggleTheme();
                        setProfileMenuOpen(false);
                      }}
                    >
                      <IconTheme />
                      {mounted ? (theme === "dark" ? t("menu.switchToLight") : t("menu.switchToDark")) : t("menu.switchToDark")}
                    </button>
                    <div className={styles.sheetLangRow}>
                      <IconLanguage />
                      <span className={styles.sheetLangLabel}>
                        {mounted ? LANG_LABELS[language] : "Lang"}
                      </span>
                      <div className={styles.sheetLangBtns}>
                        {SUPPORTED_LANGUAGE_CODES.map((code) => (
                          <button
                            key={code}
                            type="button"
                            className={`${styles.langChip} ${language === code ? styles.langChipActive : ""}`}
                            onClick={() => { setLanguage(code); setProfileMenuOpen(false); }}
                          >
                            {code.toUpperCase()}
                          </button>
                        ))}
                      </div>
                    </div>
                    <button
                      type="button"
                      className={styles.sheetItem}
                      onClick={() => { setProfileMenuOpen(false); router.push("/report-problem"); }}
                    >
                      <IconReport /> {t("menu.reportProblem")}
                    </button>
                    <button
                      type="button"
                      className={`${styles.sheetItem} ${styles.sheetItemDanger}`}
                      onClick={handleLogout}
                    >
                      <IconLogout /> {t("menu.logout")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {/* ── Mobile Bottom Tab Bar ────────────────────────────────────── */}
      <nav className={`${styles.bottomNav}${isMessagesPage || isReelsPage ? ` ${styles.bottomNavHidden}` : ""}`}>
        {bottomTabs.map(({ key, href, icon: Icon }) => (
          <Link
            key={key}
            href={href}
            className={`${styles.tabItem} ${isActive(href) ? styles.tabItemActive : ""}`}
            onClick={(e) => handleGuardedNav(href, e)}
            aria-label={t(`nav.${key}`)}
          >
            <Icon />
          </Link>
        ))}
      </nav>

      {/* Overlays */}
      <SearchOverlay
        open={searchOpen}
        closing={searchClosing}
        onClose={() => {
          setSearchClosing(true);
          window.setTimeout(() => { setSearchOpen(false); setSearchClosing(false); }, 180);
        }}
      />
      <NotificationsOverlay
        open={notificationOpen}
        closing={notificationClosing}
        onClose={() => {
          setNotificationClosing(true);
          window.setTimeout(() => { setNotificationOpen(false); setNotificationClosing(false); }, 180);
        }}
      />
    </>
  );
}

/* ── Icons ────────────────────────────────────────────────────────────── */
function IconHome() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 3 2 12h3v8h5v-5h4v5h5v-8h3z" />
    </svg>
  );
}
function IconFollowing() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" stroke="currentColor" fill="none" strokeWidth="2">
      <circle cx="9" cy="8" r="4" />
      <path d="M14.2 15.2l1.4 1.4 3-3" strokeLinecap="round" />
      <path d="M3 19c.8-2.5 3-4 6-4" />
    </svg>
  );
}
function IconCompass() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" stroke="currentColor" fill="none" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <path d="M14.5 9.5 11 11l-1.5 3.5L13 13z" strokeLinejoin="round" />
    </svg>
  );
}
function IconReel() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" stroke="currentColor" fill="none" strokeWidth="2">
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path d="M8 5v14M16 5v14M4 9h16M4 15h16" />
    </svg>
  );
}
function IconPlus() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" stroke="currentColor" fill="none" strokeWidth="2">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function IconSearch() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" stroke="currentColor" fill="none" strokeWidth="2">
      <circle cx="11" cy="11" r="6" />
      <line x1="16.5" y1="16.5" x2="21" y2="21" />
    </svg>
  );
}
function IconBell() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" stroke="currentColor" fill="none" strokeWidth="2">
      <path d="M6 10a6 6 0 1 1 12 0c0 3 1 5 2 6H4c1-1 2-3 2-6Z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </svg>
  );
}
function IconMessage() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" stroke="currentColor" fill="none" strokeWidth="2">
      <path d="M4 5h16v10H6l-2 2z" strokeLinejoin="round" />
    </svg>
  );
}
function IconProfile() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c1.5-3 4.5-5 8-5s6.5 2 8 5" strokeLinecap="round" />
    </svg>
  );
}
function IconSettings() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 8 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 8a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 8 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09A1.65 1.65 0 0 0 16 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 8a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconSaved() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M6 4h12a1 1 0 0 1 1 1v14l-7-4-7 4V5a1 1 0 0 1 1-1Z" strokeLinejoin="round" />
    </svg>
  );
}
function IconAds() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" stroke="currentColor" fill="none" strokeWidth="1.8">
      <path d="M4 14.5V7.8A1.8 1.8 0 0 1 5.8 6h7.4A1.8 1.8 0 0 1 15 7.8v8.4A1.8 1.8 0 0 1 13.2 18H9" />
      <path d="M15 9h3.2a1.8 1.8 0 0 1 1.8 1.8V15" />
      <path d="M18 18h.01" strokeLinecap="round" />
      <path d="M3 18h3" strokeLinecap="round" />
      <path d="M6 16.5V19.5" strokeLinecap="round" />
      <path d="M20.5 18a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Z" />
    </svg>
  );
}
function IconTheme() {
  return (
    <svg aria-hidden fill="currentColor" height="20" viewBox="0 0 24 24" width="20">
      <path d="M12.00018,4.5a1,1,0,0,0,1-1V2a1,1,0,0,0-2,0V3.5A1.00005,1.00005,0,0,0,12.00018,4.5ZM5.28241,6.69678A.99989.99989,0,1,0,6.69647,5.28271l-1.06054-1.061A.99989.99989,0,0,0,4.22186,5.63574ZM4.50018,12a1,1,0,0,0-1-1h-1.5a1,1,0,0,0,0,2h1.5A1,1,0,0,0,4.50018,12Zm.78223,5.30322-1.06055,1.061a.99989.99989,0,1,0,1.41407,1.41406l1.06054-1.061a.99989.99989,0,0,0-1.41406-1.41407ZM12.00018,19.5a1.00005,1.00005,0,0,0-1,1V22a1,1,0,0,0,2,0V20.5A1,1,0,0,0,12.00018,19.5Zm6.71729-2.19678a.99989.99989,0,0,0-1.41406,1.41407l1.06054,1.061A.99989.99989,0,0,0,19.778,18.36426ZM22.00018,11h-1.5a1,1,0,0,0,0,2h1.5a1,1,0,0,0,0-2ZM18.01044,6.98975a.996.996,0,0,0,.707-.293l1.06055-1.061A.99989.99989,0,0,0,18.364,4.22168l-1.06054,1.061a1,1,0,0,0,.707,1.707ZM12.00018,6a6,6,0,1,0,6,6A6.00657,6.00657,0,0,0,12.00018,6Zm0,10a4,4,0,1,1,4-4A4.00458,4.00458,0,0,1,12.00018,16Z" />
    </svg>
  );
}
function IconReport() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 4h10l6 6v10H4Z" />
      <path d="M14 4v6h6" />
      <path d="M12 11v4" strokeLinecap="round" />
      <circle cx="12" cy="17" r="0.9" fill="currentColor" />
    </svg>
  );
}
function IconLogout() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4" />
      <path d="M16 16l4-4-4-4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11 12h9" />
    </svg>
  );
}
function IconLanguage() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10A15.3 15.3 0 0 1 12 2z" />
    </svg>
  );
}
