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
import { useTheme } from "@/component/theme-provider";
import {
  fetchUserSettings,
  updateUserSettings,
  fetchNotificationSettings,
  updateNotificationSettings,
  fetchBlockedUsers,
  fetchIgnoredUserIds,
  unblockUser,
  unignoreUser,
  type UserSettingsResponse,
  type NotificationSettingsResponse,
} from "@/lib/api";
import MessagesProfileEditor from "./MessagesProfileEditor";
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
  const { theme, setTheme } = useTheme();
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
  const [ignoredIds, setIgnoredIds] = useState<string[]>([]);
  const [listOpen, setListOpen] = useState<"none" | "blocked" | "ignored">(
    "none",
  );

  const isDark = theme === "dark";
  const cardClass = `${styles.card} ${isDark ? styles.cardDark : ""}`;

  const loadCore = useCallback(async () => {
    try {
      const [u, n] = await Promise.all([
        fetchUserSettings({ token }),
        fetchNotificationSettings({ token }),
      ]);
      setUserSettings(u);
      setNotif(n);
    } catch {
      onToastRef.current?.(t("settings.failedToLoad"));
    }
  }, [token]);

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

  const loadIgnored = async () => {
    try {
      const res = await fetchIgnoredUserIds({ token });
      setIgnoredIds(res.ignoredUserIds ?? []);
    } catch {
      onToast?.(t("settings.errorLoadIgnored"));
    }
  };

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
                  <button
                    type="button"
                    className={styles.linkRow}
                    onClick={() => {
                      setListOpen("ignored");
                      void loadIgnored();
                    }}
                  >
                    {t("settings.messages.ignoredList")}
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
                {listOpen === "ignored" ? (
                  <div className={styles.panel}>
                    <div className={styles.row}>
                      <strong>{t("settings.messages.ignoredHeading")}</strong>
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
                      {ignoredIds.length === 0 ? (
                        <li>{t("settings.messages.empty")}</li>
                      ) : (
                        ignoredIds.map((id) => (
                          <li key={id} className={styles.listItem}>
                            <span>{id}</span>
                            <button
                              type="button"
                              className={styles.smallBtn}
                              onClick={async () => {
                                try {
                                  await unignoreUser({ token, userId: id });
                                  await loadIgnored();
                                  onToast?.(t("settings.unignoredToast"));
                                } catch {
                                  onToast?.(t("settings.errorUnignore"));
                                }
                              }}
                            >
                              {t("settings.messages.unignored")}
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
                <h3 className={styles.sectionTitle}>
                  {t("settings.appearance.title")}
                </h3>
                <p className={styles.hint}>{t("settings.appearance.hint")}</p>
                <div className={styles.themeGrid}>
                  <button
                    type="button"
                    className={`${styles.themeCard} ${theme === "light" ? styles.themeCardActive : ""}`}
                    onClick={() => {
                      setTheme("light");
                      void updateUserSettings({ token, theme: "light" }).catch(
                        () => undefined,
                      );
                    }}
                  >
                    <div className={`${styles.themeSwatch} ${styles.swLight}`} />
                    <span>{t("settings.appearance.light")}</span>
                  </button>
                  <button
                    type="button"
                    className={`${styles.themeCard} ${theme === "dark" ? styles.themeCardActive : ""}`}
                    onClick={() => {
                      setTheme("dark");
                      void updateUserSettings({ token, theme: "dark" }).catch(
                        () => undefined,
                      );
                    }}
                  >
                    <div className={`${styles.themeSwatch} ${styles.swDark}`} />
                    <span>{t("settings.appearance.dark")}</span>
                  </button>
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
                />
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
