"use client";

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import styles from "./MessagesUserSettingsModal.module.css";
import GalaxySelect from "@/components/GalaxySelect/GalaxySelect";
import { useLanguage } from "@/component/language-provider";
import {
  clearMessagesShellThemeOverride,
  getMessagesShellTheme,
  setMessagesShellTheme as persistMessagesShellTheme,
  type MessagesShellTheme,
} from "@/lib/messages-shell-theme";
import {
  DEFAULT_MESSAGES_CHROME_HEX,
  flushMessagesChromeToRoot,
  isMessagesFollowingSocialAppearance,
  migrateMessagesChromeStorageOnce,
  normalizeMessagesChromeHex,
  persistMessagesAppearanceSource,
  persistMessagesChromeHex,
  readMessagesAppearanceSource,
  readMessagesChromeHex,
  resetMessagesToSocialAppearance,
  type MessagesAppearanceSource,
} from "@/lib/messages-appearance-chrome";
import {
  fetchUserSettings,
  updateUserSettings,
  fetchNotificationSettings,
  updateNotificationSettings,
  fetchBlockedUsers,
  unblockUser,
  fetchBoostStatus,
  type UserSettingsResponse,
  type NotificationSettingsResponse,
} from "@/lib/api";
import MessagesProfileEditor from "./MessagesProfileEditor";
import ThemePanel from "./ThemePanel";
import {
  getDmSidebarPeersMode,
  setDmSidebarPeersMode,
  type DmSidebarPeersMode,
} from "@/lib/messages-dm-sidebar-prefs";

type Section =
  | "general"
  | "privacy"
  | "messages"
  | "appearance"
  | "notifications"
  | "profile";

type Props = {
  open: boolean;
  onClose: () => void;
  token: string;
  currentUserId: string;
  servers: Array<{ _id: string; name: string }>;
  onToast?: (message: string) => void;
};

function getMessagesRoot(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.getElementById("cordigram-messages-root");
}

function dispatchChatSettingsRefresh() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("cordigram-chat-settings"));
  }
}

export default function MessagesUserSettingsModal({
  open,
  onClose,
  token,
  currentUserId,
  servers,
  onToast,
}: Props) {
  const onToastRef = useRef(onToast);
  useLayoutEffect(() => {
    onToastRef.current = onToast;
  }, [onToast]);

  const { language, setLanguage, t } = useLanguage();
  const [section, setSection] = useState<Section>("general");
  const [profileSub, setProfileSub] = useState<"main" | "server">("main");

  const [userSettings, setUserSettings] = useState<UserSettingsResponse | null>(
    null,
  );
  const [notif, setNotif] = useState<NotificationSettingsResponse | null>(null);
  const [dmSidebarPeers, setDmSidebarPeers] = useState<DmSidebarPeersMode>(() =>
    getDmSidebarPeersMode(),
  );

  const [blocked, setBlocked] = useState<
    Array<{ userId: string; displayName?: string; username?: string }>
  >([]);
  const [listOpen, setListOpen] = useState<"none" | "blocked">("none");
  const [boostUnlocked, setBoostUnlocked] = useState(false);
  const [boostStatus, setBoostStatus] = useState<{
    tier?: "basic" | "boost" | null;
    active?: boolean;
    expiresAt?: string | null;
    billingCycle?: "monthly" | "yearly" | null;
    source?: "purchase" | "gift" | null;
  } | null>(null);
  const [messagesShellTheme, setMessagesShellTheme] = useState<MessagesShellTheme>("dark");

  useEffect(() => {
    if (typeof window === "undefined") return;
    setMessagesShellTheme(getMessagesShellTheme());
    const onShell = () => setMessagesShellTheme(getMessagesShellTheme());
    const onChatSettings = () => setMessagesShellTheme(getMessagesShellTheme());
    window.addEventListener("cordigram-messages-shell-theme", onShell);
    window.addEventListener("cordigram-chat-settings", onChatSettings);
    return () => {
      window.removeEventListener("cordigram-messages-shell-theme", onShell);
      window.removeEventListener("cordigram-chat-settings", onChatSettings);
    };
  }, []);

  const commitMessagesShellTheme = useCallback((mode: MessagesShellTheme) => {
    persistMessagesShellTheme(mode);
    setMessagesShellTheme(mode);
  }, []);

  const backgroundThemeOptions = useMemo(
    () =>
      [
        {
          id: "graphite" as const,
          color: "#3A3D49",
          labelKey: "settings.appearanceBg.presetGraphite" as const,
        },
        {
          id: "charcoal" as const,
          color: "#24262E",
          labelKey: "settings.appearanceBg.presetCharcoal" as const,
        },
        {
          id: "indigo" as const,
          color: "#111827",
          labelKey: "settings.appearanceBg.presetIndigo" as const,
        },
      ] as const,
    [],
  );
  const accentOptions = useMemo(
    () => [
      { id: "blurple", color: "#5865F2", label: "Blurple" },
      { id: "green", color: "#57F287", label: "Green" },
      { id: "yellow", color: "#FEE75C", label: "Yellow" },
      { id: "pink", color: "#EB459E", label: "Pink" },
      { id: "red", color: "#ED4245", label: "Red" },
      { id: "orange", color: "#F59E0B", label: "Orange" },
      { id: "cyan", color: "#22D3EE", label: "Cyan" },
      { id: "violet", color: "#8B5CF6", label: "Violet" },
      { id: "neon-green", color: "#39FF14", label: "Neon Green" },
      { id: "neon-pink", color: "#FF2BD6", label: "Neon Pink" },
      { id: "neon-blue", color: "#00E5FF", label: "Neon Blue" },
      { id: "gradient1", color: "#7C3AED", secondary: "#22D3EE", label: "Gradient 1" },
      { id: "gradient2", color: "#2563EB", secondary: "#EC4899", label: "Gradient 2" },
      { id: "gradient3", color: "#F97316", secondary: "#EF4444", label: "Gradient 3" },
    ],
    [],
  );
  const [chromeHex, setChromeHex] = useState(() =>
    typeof window === "undefined"
      ? DEFAULT_MESSAGES_CHROME_HEX
      : readMessagesChromeHex(currentUserId),
  );
  const [appearanceSource, setAppearanceSource] = useState<MessagesAppearanceSource>(() =>
    readMessagesAppearanceSource(currentUserId),
  );

  useEffect(() => {
    setAppearanceSource(readMessagesAppearanceSource(currentUserId));
  }, [currentUserId]);

  useEffect(() => {
    if (!open) return;
    if (typeof window === "undefined") return;
    migrateMessagesChromeStorageOnce(currentUserId);
    const nextChromeHex = readMessagesChromeHex(currentUserId);
    const nextSource = readMessagesAppearanceSource(currentUserId);
    setChromeHex(nextChromeHex);
    setAppearanceSource(nextSource);
    // Legacy presets "default"/"social-dark" giờ được xem là trạng thái follow Social.
    if (
      nextSource === "background" &&
      (nextChromeHex === "#5865F2" || nextChromeHex === "#0C1220")
    ) {
      clearMessagesShellThemeOverride();
    }
    setMessagesShellTheme(getMessagesShellTheme());
  }, [open, currentUserId]);

  const cardClass = `${styles.card} ${
    messagesShellTheme === "dark" || messagesShellTheme === "galaxy"
      ? styles.cardDark
      : ""
  }`;

  const loadCore = useCallback(async () => {
    try {
      const [u, n, b] = await Promise.all([
        fetchUserSettings({ token }),
        fetchNotificationSettings({ token }),
        fetchBoostStatus({ token, scope: "messages" }).catch(() => null),
      ]);
      setUserSettings(u);
      setNotif(n);
      const unlocked =
        Boolean(b?.active) || Boolean(b?.unlocked) || Boolean(b?.accountBoost);
      setBoostUnlocked(unlocked);
      setBoostStatus(b);
      if (!unlocked) {
        setAppearanceSource((prev) => {
          if (prev === "accent") {
            persistMessagesAppearanceSource(currentUserId, "background");
            flushMessagesChromeToRoot(currentUserId);
            return "background";
          }
          return prev;
        });
      }
    } catch {
      onToastRef.current?.(t("settings.failedToLoad"));
    }
  }, [token, currentUserId]);

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      void loadCore();
    });
  }, [open, loadCore]);

  const saveUserPatch = async (patch: Partial<UserSettingsResponse>) => {
    try {
      const next = await updateUserSettings({ token, ...patch });
      setUserSettings(next);
      dispatchChatSettingsRefresh();
      onToast?.(t("settings.saved"));
    } catch (e) {
      onToast?.(e instanceof Error ? e.message : t("settings.errorSave"));
    }
  };

  const loadBlocked = async () => {
    try {
      const res = await fetchBlockedUsers({ token, limit: 100 });
      setBlocked(res.items ?? []);
    } catch {
      onToast?.(t("settings.errorLoadBlocked"));
    }
  };

  // Ignored users UI removed.

  const notifEnabled = Boolean(notif?.enabled && !notif?.mutedIndefinitely);

  const setMasterNotif = async (enabled: boolean) => {
    try {
      const next = await updateNotificationSettings({
        token,
        enabled,
      });
      setNotif(next);
      onToast?.(
        enabled
          ? t("settings.notifications.enabledToast")
          : t("settings.notifications.disabledToast"),
      );
    } catch (e) {
      onToast?.(e instanceof Error ? e.message : t("settings.errorUpdate"));
    }
  };

  const navIcons: Record<string, React.ReactNode> = {
    general: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
      </svg>
    ),
    privacy: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
      </svg>
    ),
    messages: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    ),
    appearance: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="13.5" cy="6.5" r="0.5" fill="currentColor"/>
        <circle cx="17.5" cy="10.5" r="0.5" fill="currentColor"/>
        <circle cx="8.5" cy="7.5" r="0.5" fill="currentColor"/>
        <circle cx="6.5" cy="12.5" r="0.5" fill="currentColor"/>
        <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10a1 1 0 0 0 1-1c0-.5-.2-1-.4-1.4a.9.9 0 0 1 .7-1.6H16a4 4 0 0 0 4-4C20 6.3 16.4 2 12 2z"/>
      </svg>
    ),
    notifications: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
        <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
      </svg>
    ),
    profile: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
        <circle cx="12" cy="7" r="4"/>
      </svg>
    ),
  };

  const nav = useMemo(
    () =>
      [
        { id: "general" as const,       label: t("settings.sections.general") },
        { id: "privacy" as const,        label: t("settings.sections.privacy") },
        { id: "messages" as const,       label: t("settings.sections.messages") },
        { id: "appearance" as const,     label: t("settings.sections.appearance") },
        { id: "notifications" as const,  label: t("settings.sections.notifications") },
        { id: "profile" as const,        label: t("settings.sections.profile") },
      ] as const,
    [t],
  );

  if (!open || typeof document === "undefined") return null;

  const boostTierLabel =
    boostStatus?.tier === "boost"
      ? "Boost"
      : boostStatus?.tier === "basic"
        ? "Boost cơ bản"
        : "Chưa có gói";
  const boostCycleLabel =
    boostStatus?.billingCycle === "yearly"
      ? "Năm"
      : boostStatus?.billingCycle === "monthly"
        ? "Tháng"
        : null;

  const portalHost = getMessagesRoot() ?? document.body;

  return createPortal(
    <div
      className={styles.backdrop}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={cardClass} onMouseDown={(e) => e.stopPropagation()}>
        <aside className={styles.sidebar}>
          <h2 className={styles.sidebarTitle}>{t("settings.title")}</h2>
          {nav.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`${styles.navBtn} ${section === item.id ? styles.navActive : ""}`}
              onClick={() => setSection(item.id)}
            >
              <span className={styles.navIcon} aria-hidden>{navIcons[item.id]}</span>
              {item.label}
            </button>
          ))}
        </aside>
        <div className={styles.main}>
          <div className={styles.mainHeader}>
            <button
              type="button"
              className={styles.closeX}
              aria-label={t("settings.close")}
              onClick={onClose}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
          <div className={styles.body}>
            {section === "general" ? (
              <>
                <h3 className={styles.sectionTitle}>
                  {t("settings.general.dmDirectoryTitle")}
                </h3>
                <p className={styles.hint}>
                  {t("settings.general.dmDirectoryHint")}
                </p>
                <div className={styles.panel}>
                  <div className={styles.radioGroup}>
                    <label className={styles.radio}>
                      <input
                        type="radio"
                        name="dmPeers"
                        checked={dmSidebarPeers === "all"}
                        onChange={() => {
                          setDmSidebarPeers("all");
                          setDmSidebarPeersMode("all");
                        }}
                      />
                      {t("settings.general.dmDirectoryAllFriends")}
                    </label>
                    <label className={styles.radio}>
                      <input
                        type="radio"
                        name="dmPeers"
                        checked={dmSidebarPeers === "online"}
                        onChange={() => {
                          setDmSidebarPeers("online");
                          setDmSidebarPeersMode("online");
                        }}
                      />
                      {t("settings.general.dmDirectoryOnlineFriends")}
                    </label>
                  </div>
                </div>
                <h3 className={styles.sectionTitle}>
                  {t("settings.general.languageTitle")}
                </h3>
                <p className={styles.hint}>
                  {t("settings.general.languageHint")}
                </p>
                <div className={styles.panel}>
                  <div className={styles.row}>
                    <span className={styles.rowLabel}>
                      {t("settings.general.languageLabel")}
                    </span>
                    <GalaxySelect
                      style={{ minWidth: 180 }}
                      value={language}
                      onChange={(val) => setLanguage(val as any)}
                      options={[
                        { value: "vi", label: t("settings.general.languageNames.vi") },
                        { value: "en", label: t("settings.general.languageNames.en") },
                        { value: "ja", label: t("settings.general.languageNames.ja") },
                        { value: "zh", label: t("settings.general.languageNames.zh") },
                      ]}
                    />
                  </div>
                </div>
              </>
            ) : null}

            {section === "privacy" ? (
              <>
                <h3 className={styles.sectionTitle}>
                  {t("settings.privacy.title")}
                </h3>
                <p className={styles.hint}>
                  {t("settings.privacy.hint")}
                </p>
                <div className={styles.panel}>
                  <div className={styles.row}>
                    <span className={styles.rowLabel}>
                      {t("settings.privacy.showMemberSince")}
                    </span>
                    <button
                      type="button"
                      className={`${styles.toggle} ${
                        userSettings?.showCordigramMemberSince !== false
                          ? styles.toggleOn
                          : styles.toggleOff
                      }`}
                      aria-label={t("settings.ariaShowMemberSince")}
                      onClick={() =>
                        void saveUserPatch({
                          showCordigramMemberSince: !(
                            userSettings?.showCordigramMemberSince !== false
                          ),
                        })
                      }
                    />
                  </div>
                  <div className={styles.row}>
                    <span className={styles.rowLabel}>
                      {t("settings.privacy.sharePresence")}
                    </span>
                    <button
                      type="button"
                      className={`${styles.toggle} ${
                        userSettings?.sharePresence !== false
                          ? styles.toggleOn
                          : styles.toggleOff
                      }`}
                      aria-label={t("settings.ariaSharePresence")}
                      onClick={() =>
                        void saveUserPatch({
                          sharePresence: !(userSettings?.sharePresence !== false),
                        })
                      }
                    />
                  </div>
                </div>
              </>
            ) : null}

            {section === "messages" ? (
              <>
                <h3 className={styles.sectionTitle}>
                  {t("settings.messages.title")}
                </h3>
                <div className={styles.panel}>
                  <label className={styles.fieldLabel}>
                    {t("settings.messages.allowMessageLabel")}
                  </label>
                  <GalaxySelect
                    style={{ marginBottom: 12 }}
                    value={userSettings?.dmListFrom ?? "everyone"}
                    onChange={(val) =>
                      void saveUserPatch({
                        dmListFrom: val as "everyone" | "followers_only",
                      })
                    }
                    options={[
                      { value: "everyone",        label: t("settings.messages.everyone") },
                      { value: "followers_only",  label: t("settings.messages.followersOnly") },
                    ]}
                  />
                  <label className={styles.fieldLabel}>
                    {t("settings.messages.allowCallLabel")}
                  </label>
                  <GalaxySelect
                    value={userSettings?.dmCallFrom ?? "everyone"}
                    onChange={(val) =>
                      void saveUserPatch({
                        dmCallFrom: val as "everyone" | "followers_only",
                      })
                    }
                    options={[
                      { value: "everyone",        label: t("settings.messages.everyone") },
                      { value: "followers_only",  label: t("settings.messages.followersOnly") },
                    ]}
                  />
                </div>
                <h3 className={styles.sectionTitle}>
                  {t("settings.messages.blockTitle")}
                </h3>
                <div className={styles.panel}>
                  <button
                    type="button"
                    className={styles.linkRow}
                    onClick={() => {
                      setListOpen("blocked");
                      void loadBlocked();
                    }}
                  >
                    {t("settings.messages.blockedList")}
                  </button>
                </div>
                {listOpen === "blocked" ? (
                  <div className={styles.panel}>
                    <div className={styles.row}>
                      <strong>{t("settings.messages.blockedHeading")}</strong>
                      <button
                        type="button"
                        className={styles.smallBtnGhost}
                        onClick={() => setListOpen("none")}
                      >
                        {t("settings.close")}
                      </button>
                    </div>
                    <ul className={styles.list}>
                      {blocked.length === 0 ? (
                        <li>{t("settings.messages.empty")}</li>
                      ) : (
                        blocked.map((b) => (
                          <li key={b.userId} className={styles.listItem}>
                            <span>
                              {b.displayName || b.username || b.userId}
                            </span>
                            <button
                              type="button"
                              className={styles.smallBtn}
                              onClick={async () => {
                                try {
                                  await unblockUser({
                                    token,
                                    userId: b.userId,
                                  });
                                  await loadBlocked();
                                  onToast?.(t("settings.unblockedToast"));
                                } catch {
                                  onToast?.(t("settings.errorUnblock"));
                                }
                              }}
                            >
                              {t("settings.messages.unblock")}
                            </button>
                          </li>
                        ))
                      )}
                    </ul>
                  </div>
                ) : null}
              </>
            ) : null}

            {section === "appearance" ? (
              <>
                <div className={styles.panel} style={{ marginBottom: 12 }}>
                  <div className={styles.row}>
                    <span className={styles.rowLabel}>Gói Boost đã mua</span>
                    <strong>
                      {boostStatus?.active ? boostTierLabel : "Không hoạt động"}
                    </strong>
                  </div>
                  {boostStatus?.active ? (
                    <div className={styles.hint} style={{ marginTop: 8, marginBottom: 0 }}>
                      {boostCycleLabel ? `Chu kỳ: ${boostCycleLabel}. ` : ""}
                      {boostStatus?.expiresAt
                        ? `Hết hạn: ${new Date(boostStatus.expiresAt).toLocaleDateString()}`
                        : ""}
                    </div>
                  ) : null}
                </div>
                <p className={styles.appearanceMutualHint}>
                  {t("settings.appearance.mutualHint")}
                </p>
                <p className={styles.appearanceModeBadge} aria-live="polite">
                  {isMessagesFollowingSocialAppearance(currentUserId)
                    ? t("settings.appearance.modeFollowSocial")
                    : appearanceSource === "accent" && boostUnlocked
                      ? t("settings.appearance.modeAccent")
                      : t("settings.appearance.modeBackground")}
                </p>

                <div className={styles.appearanceBlock}>
                  <div className={styles.appearanceBgSection}>
                    <div className={styles.appearanceBgHeader}>
                      <div>
                        <div className={styles.appearanceBgTitle}>
                          {t("settings.appearance.followSocialTitle")}
                        </div>
                        <div className={styles.hint} style={{ margin: 0 }}>
                          {t("settings.appearance.followSocialHint")}
                        </div>
                      </div>
                    </div>
                    <div className={styles.appearanceBgLockedWrap}>
                      <div className={styles.appearanceBgRow}>
                        <div className={styles.appearanceBgSwatches}>
                          <button
                            type="button"
                            className={`${styles.appearanceBgSwatch} ${styles.appearanceBgSwatchSocial} ${
                              isMessagesFollowingSocialAppearance(currentUserId)
                                ? styles.appearanceBgSwatchActive
                                : ""
                            }`}
                            title={t("settings.appearance.followSocialPick")}
                            aria-label={t("settings.appearance.followSocialPick")}
                            onClick={() => {
                              resetMessagesToSocialAppearance(currentUserId);
                              setAppearanceSource("background");
                              setChromeHex(DEFAULT_MESSAGES_CHROME_HEX);
                              setMessagesShellTheme(getMessagesShellTheme());
                              flushMessagesChromeToRoot(currentUserId);
                            }}
                          >
                            <span className={styles.appearanceBgSocialIcon} aria-hidden>
                              ↻
                            </span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className={styles.appearanceBlock}>
                  <div className={styles.appearanceBgSection}>
                    <div className={styles.appearanceBgHeader}>
                      <div>
                        <div className={styles.appearanceBgTitle}>
                          {t("settings.appearanceBg.title")}
                        </div>
                        <div className={styles.hint} style={{ margin: 0 }}>
                          {t("settings.appearanceBg.hintShort")}
                        </div>
                      </div>
                    </div>

                    <div className={styles.appearanceBgLockedWrap}>
                      <div className={styles.appearanceBgRow}>
                        <div className={styles.appearanceBgSwatches}>
                          {backgroundThemeOptions.map((option) => {
                            const active =
                              appearanceSource === "background" &&
                              messagesShellTheme === "dark" &&
                              normalizeMessagesChromeHex(chromeHex) ===
                                option.color.toUpperCase();
                            return (
                              <button
                                key={option.id}
                                type="button"
                                className={`${styles.appearanceBgSwatch} ${
                                  active ? styles.appearanceBgSwatchActive : ""
                                }`}
                                title={t(option.labelKey)}
                                aria-label={t("settings.appearanceBg.pickPreset")}
                                style={{
                                  background: option.color,
                                }}
                                onClick={() => {
                                  persistMessagesAppearanceSource(
                                    currentUserId,
                                    "background",
                                  );
                                  setAppearanceSource("background");
                                  // User custom nền Messages => tách khỏi Social mode.
                                  commitMessagesShellTheme("dark");
                                  const h = normalizeMessagesChromeHex(option.color);
                                  persistMessagesChromeHex(currentUserId, h);
                                  setChromeHex(h);
                                  flushMessagesChromeToRoot(currentUserId);
                                }}
                              />
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className={styles.appearanceBlock}>
                  <ThemePanel
                    accentColor={chromeHex}
                    options={accentOptions}
                    locked={!boostUnlocked}
                    showAccentSelection={
                      boostUnlocked && appearanceSource === "accent"
                    }
                    onSelectColor={(color) => {
                      if (!boostUnlocked) return;
                      commitMessagesShellTheme("dark");
                      persistMessagesAppearanceSource(currentUserId, "accent");
                      setAppearanceSource("accent");
                      const h = normalizeMessagesChromeHex(color);
                      persistMessagesChromeHex(currentUserId, h);
                      setChromeHex(h);
                      flushMessagesChromeToRoot(currentUserId);
                    }}
                  />
                </div>
              </>
            ) : null}

            {section === "notifications" ? (
              <>
                <h3 className={styles.sectionTitle}>
                  {t("settings.notifications.title")}
                </h3>
                <div className={styles.panel}>
                  <div className={styles.row}>
                    <div>
                      <div className={styles.rowLabel}>
                        {t("settings.notifications.masterLabel")}
                      </div>
                      <div className={styles.hint} style={{ margin: 0 }}>
                        {t("settings.notifications.masterHint")}
                      </div>
                    </div>
                    <button
                      type="button"
                      className={`${styles.toggle} ${notifEnabled ? styles.toggleOn : styles.toggleOff}`}
                      onClick={() => void setMasterNotif(!notifEnabled)}
                    />
                  </div>
                  <div className={styles.row}>
                    <span className={styles.rowLabel}>
                      {t("settings.notifications.soundLabel")}
                    </span>
                    <button
                      type="button"
                      className={`${styles.toggle} ${
                        userSettings?.chatSoundEnabled !== false
                          ? styles.toggleOn
                          : styles.toggleOff
                      }`}
                      onClick={() =>
                        void saveUserPatch({
                          chatSoundEnabled: !(
                            userSettings?.chatSoundEnabled !== false
                          ),
                        })
                      }
                    />
                  </div>
                </div>
              </>
            ) : null}

            {section === "profile" ? (
              <>
                <h3 className={styles.sectionTitle}>
                  {t("settings.profile.title")}
                </h3>
                <div className={styles.profileTabs}>
                  <button
                    type="button"
                    className={`${styles.profileTab} ${profileSub === "main" ? styles.profileTabActive : ""}`}
                    onClick={() => setProfileSub("main")}
                  >
                    {t("settings.profile.main")}
                  </button>
                  <button
                    type="button"
                    className={`${styles.profileTab} ${profileSub === "server" ? styles.profileTabActive : ""}`}
                    onClick={() => setProfileSub("server")}
                  >
                    {t("settings.profile.server")}
                  </button>
                </div>
                <MessagesProfileEditor
                  active={open && section === "profile"}
                  token={token}
                  currentUserId={currentUserId}
                  tab={profileSub}
                  servers={servers}
                  onToast={onToast}
                  boostUnlocked={boostUnlocked}
                />
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>,
    portalHost,
  );
}
