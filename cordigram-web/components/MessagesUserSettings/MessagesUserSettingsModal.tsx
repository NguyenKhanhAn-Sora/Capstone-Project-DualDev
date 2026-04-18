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
import { useLanguage } from "@/component/language-provider";
import {
  getMessagesShellTheme,
  setMessagesShellTheme as persistMessagesShellTheme,
  type MessagesShellTheme,
} from "@/lib/messages-shell-theme";
import {
  DEFAULT_MESSAGES_CHROME_HEX,
  flushMessagesChromeToRoot,
  migrateMessagesChromeStorageOnce,
  normalizeMessagesChromeHex,
  persistMessagesAppearanceSource,
  persistMessagesChromeHex,
  readMessagesAppearanceSource,
  readMessagesChromeHex,
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
  const [messagesShellTheme, setMessagesShellTheme] = useState<MessagesShellTheme>("dark");

  useEffect(() => {
    if (typeof window === "undefined") return;
    setMessagesShellTheme(getMessagesShellTheme());
    const onShell = () => setMessagesShellTheme(getMessagesShellTheme());
    window.addEventListener("cordigram-messages-shell-theme", onShell);
    return () => window.removeEventListener("cordigram-messages-shell-theme", onShell);
  }, []);

  const commitMessagesShellTheme = useCallback((mode: MessagesShellTheme) => {
    persistMessagesShellTheme(mode);
    setMessagesShellTheme(mode);
  }, []);

  const backgroundThemeOptions = useMemo(
    () =>
      [
        {
          id: "default" as const,
          color: "#5865F2",
          labelKey: "settings.appearanceBg.presetDefault" as const,
        },
        {
          id: "social-dark" as const,
          color: "#0C1220",
          labelKey: "settings.appearanceBg.presetSocialDark" as const,
        },
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
    setChromeHex(readMessagesChromeHex(currentUserId));
    setAppearanceSource(readMessagesAppearanceSource(currentUserId));
    setMessagesShellTheme(getMessagesShellTheme());
  }, [open, currentUserId]);

  const cardClass = `${styles.card} ${messagesShellTheme === "dark" ? styles.cardDark : ""}`;

  const loadCore = useCallback(async () => {
    try {
      const [u, n, b] = await Promise.all([
        fetchUserSettings({ token }),
        fetchNotificationSettings({ token }),
        fetchBoostStatus({ token }).catch(() => null),
      ]);
      setUserSettings(u);
      setNotif(n);
      const unlocked =
        Boolean(b?.active) || Boolean(b?.unlocked) || Boolean(b?.accountBoost);
      setBoostUnlocked(unlocked);
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

  const nav = useMemo(
    () =>
      [
        {
          id: "general" as const,
          label: t("settings.sections.general"),
          icon: "⚙",
        },
        {
          id: "privacy" as const,
          label: t("settings.sections.privacy"),
          icon: "🔒",
        },
        {
          id: "messages" as const,
          label: t("settings.sections.messages"),
          icon: "💬",
        },
        {
          id: "appearance" as const,
          label: t("settings.sections.appearance"),
          icon: "🎨",
        },
        {
          id: "notifications" as const,
          label: t("settings.sections.notifications"),
          icon: "🔔",
        },
        { id: "profile" as const, label: t("settings.sections.profile"), icon: "👤" },
      ] as const,
    [t],
  );

  if (!open || typeof document === "undefined") return null;

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
              <span aria-hidden>{item.icon}</span>
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
              ×
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
                    <select
                      className={styles.select}
                      value={language}
                      onChange={(e) =>
                        setLanguage(e.target.value as any)
                      }
                    >
                      <option value="vi">
                        {t("settings.general.languageNames.vi")}
                      </option>
                      <option value="en">
                        {t("settings.general.languageNames.en")}
                      </option>
                      <option value="ja">
                        {t("settings.general.languageNames.ja")}
                      </option>
                      <option value="zh">
                        {t("settings.general.languageNames.zh")}
                      </option>
                    </select>
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
                  <select
                    className={styles.select}
                    style={{ width: "100%", marginBottom: 12 }}
                    value={userSettings?.dmListFrom ?? "everyone"}
                    onChange={(e) =>
                      void saveUserPatch({
                        dmListFrom: e.target.value as
                          | "everyone"
                          | "followers_only",
                      })
                    }
                  >
                    <option value="everyone">{t("settings.messages.everyone")}</option>
                    <option value="followers_only">
                      {t("settings.messages.followersOnly")}
                    </option>
                  </select>
                  <label className={styles.fieldLabel}>
                    {t("settings.messages.allowCallLabel")}
                  </label>
                  <select
                    className={styles.select}
                    style={{ width: "100%" }}
                    value={userSettings?.dmCallFrom ?? "everyone"}
                    onChange={(e) =>
                      void saveUserPatch({
                        dmCallFrom: e.target.value as
                          | "everyone"
                          | "followers_only",
                      })
                    }
                  >
                    <option value="everyone">{t("settings.messages.everyone")}</option>
                    <option value="followers_only">
                      {t("settings.messages.followersOnly")}
                    </option>
                  </select>
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
                        style={{ background: "#4e5058" }}
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
                <p className={styles.appearanceMutualHint}>
                  {t("settings.appearance.mutualHint")}
                </p>
                <p className={styles.appearanceModeBadge} aria-live="polite">
                  {appearanceSource === "accent" && boostUnlocked
                    ? t("settings.appearance.modeAccent")
                    : t("settings.appearance.modeBackground")}
                </p>

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
