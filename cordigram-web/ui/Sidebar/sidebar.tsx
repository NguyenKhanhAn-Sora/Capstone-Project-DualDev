"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./sidebar.module.css";
import { fetchCurrentProfile, type CurrentProfileResponse } from "@/lib/api";

const navItems = [
  { label: "Home", href: "/", icon: IconHome },
  { label: "Search", href: "/search", icon: IconSearch },
  { label: "Message", href: "/messages", icon: IconMessage },
  {
    label: "Following",
    href: "/following",
    icon: IconFollowing,
    hasAvatar: true,
  },
  { label: "Explore", href: "/explore", icon: IconCompass },
  { label: "Notification", href: "/notifications", icon: IconBell },
  { label: "Create", href: "/create", icon: IconPlus },
  { label: "Reels", href: "/reels", icon: IconReel },
];

export default function Sidebar() {
  const router = useRouter();
  const [profile, setProfile] = useState<CurrentProfileResponse | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let active = true;

    const loadProfile = async () => {
      const token =
        typeof window !== "undefined"
          ? localStorage.getItem("accessToken")
          : null;

      if (!token) {
        if (active) setProfile(null);
        return;
      }

      try {
        const result = await fetchCurrentProfile({ token });
        if (active) setProfile(result);
      } catch (_err) {
        if (active) setProfile(null);
      }
    };

    loadProfile();

    const onStorage = (event: StorageEvent) => {
      if (event.key === "accessToken") {
        loadProfile();
      }
    };

    window.addEventListener("storage", onStorage);
    return () => {
      active = false;
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [menuOpen]);

  const avatarLetter = useMemo(() => {
    const source = profile?.displayName || profile?.username || "";
    const letter = source.trim().charAt(0);
    return letter ? letter.toUpperCase() : "U";
  }, [profile]);

  const displayName = profile?.displayName;
  const username = profile?.username ? `@${profile.username}` : null;

  const handleLogout = useCallback(() => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("accessToken");
    }
    setProfile(null);
    setMenuOpen(false);
    router.replace("/login");
  }, [router]);

  return (
    <aside className={styles.sidebar}>
      <Link href="/" className={styles.brand}>
        <Image
          src="/logo.png" // đã có trong public
          alt="Cordigram logo"
          width={52}
          height={52}
          className={styles.logo}
          priority
        />
        <span className={styles.brandName}>CORDIGRAM</span>
      </Link>

      <nav className={styles.nav}>
        {navItems.map(({ label, href, icon: Icon, hasAvatar }) => (
          <Link key={label} href={href} className={styles.item}>
            <span className={styles.icon}>
              {hasAvatar ? (
                <div className={styles.avatarFallback}>S</div>
              ) : (
                <Icon />
              )}
            </span>
            <span className={styles.label}>{label}</span>
          </Link>
        ))}
      </nav>

      {profile ? (
        <div
          className={styles.userCard}
          onClick={() => setMenuOpen((prev) => !prev)}
          ref={menuRef}
        >
          <div className={styles.userAvatar}>
            {profile.avatarUrl ? (
              <Image
                src={profile.avatarUrl}
                alt={`${displayName ?? ""} avatar`}
                width={44}
                height={44}
                className={styles.userAvatarImg}
              />
            ) : (
              <span>{avatarLetter}</span>
            )}
          </div>
          <div className={styles.userMeta}>
            {displayName ? (
              <span className={styles.userDisplay}>{displayName}</span>
            ) : null}
            {username ? (
              <span className={styles.userUsername}>{username}</span>
            ) : null}
          </div>

          {menuOpen ? (
            <div className={styles.userMenu}>
              <MenuItem label="Trang cá nhân" icon={<IconProfile />} />
              <MenuItem label="Cài đặt" icon={<IconSettings />} />
              <MenuItem label="Đã lưu" icon={<IconSaved />} />
              <MenuItem label="Chuyển chế độ" icon={<IconTheme />} />
              <MenuItem label="Báo cáo sự cố" icon={<IconReport />} />
              <MenuItem label="Chuyển tài khoản" icon={<IconSwitchAccount />} />
              <MenuItem
                label="Đăng xuất"
                icon={<IconLogout />}
                onClick={handleLogout}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}

function MenuItem({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  onClick?: () => void;
}) {
  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onClick?.();
  };

  return (
    <button className={styles.menuItem} type="button" onClick={handleClick}>
      <span className={styles.menuIcon}>{icon}</span>
      <span className={styles.menuLabel}>{label}</span>
    </button>
  );
}

function IconHome() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 3 2 12h3v8h5v-5h4v5h5v-8h3z" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      stroke="currentColor"
      fill="none"
      strokeWidth="2"
    >
      <circle cx="11" cy="11" r="6" />
      <line x1="16.5" y1="16.5" x2="21" y2="21" />
    </svg>
  );
}

function IconMessage() {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      stroke="currentColor"
      fill="none"
      strokeWidth="2"
    >
      <path d="M4 5h16v10H6l-2 2z" strokeLinejoin="round" />
    </svg>
  );
}

function IconFollowing() {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      stroke="currentColor"
      fill="none"
      strokeWidth="2"
    >
      <circle cx="9" cy="8" r="4" />
      <path d="M17 11v6M14 14h6" />
      <path d="M3 19c.8-2.5 3-4 6-4" />
    </svg>
  );
}

function IconCompass() {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      stroke="currentColor"
      fill="none"
      strokeWidth="2"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M14.5 9.5 11 11l-1.5 3.5L13 13z" strokeLinejoin="round" />
    </svg>
  );
}

function IconBell() {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      stroke="currentColor"
      fill="none"
      strokeWidth="2"
    >
      <path d="M6 10a6 6 0 1 1 12 0c0 3 1 5 2 6H4c1-1 2-3 2-6Z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      stroke="currentColor"
      fill="none"
      strokeWidth="2"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function IconReel() {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      stroke="currentColor"
      fill="none"
      strokeWidth="2"
    >
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path d="M8 5v14M16 5v14M4 9h16M4 15h16" />
    </svg>
  );
}

function IconProfile() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c1.5-3 4.5-5 8-5s6.5 2 8 5" strokeLinecap="round" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <circle cx="12" cy="12" r="3" />
      <path
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 8 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 8a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 8 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09A1.65 1.65 0 0 0 16 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 8a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconSaved() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path
        d="M6 4h12a1 1 0 0 1 1 1v14l-7-4-7 4V5a1 1 0 0 1 1-1Z"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconTheme() {
  return (
    <svg
      aria-label="Biểu tượng chủ đề"
      fill="currentColor"
      height="18"
      role="img"
      viewBox="0 0 24 24"
      width="18"
    >
      <path d="M12.00018,4.5a1,1,0,0,0,1-1V2a1,1,0,0,0-2,0V3.5A1.00005,1.00005,0,0,0,12.00018,4.5ZM5.28241,6.69678A.99989.99989,0,1,0,6.69647,5.28271l-1.06054-1.061A.99989.99989,0,0,0,4.22186,5.63574ZM4.50018,12a1,1,0,0,0-1-1h-1.5a1,1,0,0,0,0,2h1.5A1,1,0,0,0,4.50018,12Zm.78223,5.30322-1.06055,1.061a.99989.99989,0,1,0,1.41407,1.41406l1.06054-1.061a.99989.99989,0,0,0-1.41406-1.41407ZM12.00018,19.5a1.00005,1.00005,0,0,0-1,1V22a1,1,0,0,0,2,0V20.5A1,1,0,0,0,12.00018,19.5Zm6.71729-2.19678a.99989.99989,0,0,0-1.41406,1.41407l1.06054,1.061A.99989.99989,0,0,0,19.778,18.36426ZM22.00018,11h-1.5a1,1,0,0,0,0,2h1.5a1,1,0,0,0,0-2ZM18.01044,6.98975a.996.996,0,0,0,.707-.293l1.06055-1.061A.99989.99989,0,0,0,18.364,4.22168l-1.06054,1.061a1,1,0,0,0,.707,1.707ZM12.00018,6a6,6,0,1,0,6,6A6.00657,6.00657,0,0,0,12.00018,6Zm0,10a4,4,0,1,1,4-4A4.00458,4.00458,0,0,1,12.00018,16Z"></path>
    </svg>
  );
}

function IconReport() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path d="M4 4h10l6 6v10H4Z" />
      <path d="M14 4v6h6" />
      <path d="M12 11v4" strokeLinecap="round" />
      <circle cx="12" cy="17" r="0.9" fill="currentColor" />
    </svg>
  );
}

function IconSwitchAccount() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2 19c1-3 3.5-5 7-5" strokeLinecap="round" />
      <path d="M14 9h6m0 0-2-2m2 2-2 2" strokeLinecap="round" />
      <path d="M14 15h6m0 0-2-2m2 2-2 2" strokeLinecap="round" />
    </svg>
  );
}

function IconLogout() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path d="M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4" />
      <path d="M16 16l4-4-4-4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11 12h9" />
    </svg>
  );
}
