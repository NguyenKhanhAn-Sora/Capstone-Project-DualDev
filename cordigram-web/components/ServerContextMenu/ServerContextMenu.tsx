"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import styles from "./ServerContextMenu.module.css";
import { useLanguage } from "@/component/language-provider";

export interface ServerContextMenuServer {
  _id: string;
  name: string;
  ownerId?: string;
}

export interface ServerContextMenuPermissions {
  isOwner: boolean;
  canManageServer: boolean;
  canManageChannels: boolean;
  canManageEvents: boolean;
  canCreateInvite: boolean;
}

export interface ServerContextMenuProps {
  x: number;
  y: number;
  server: ServerContextMenuServer;
  permissions: ServerContextMenuPermissions;
  /** @deprecated Sử dụng permissions.isOwner thay thế */
  isOwner?: boolean;
  onClose: () => void;
  onMarkAsRead: () => void;
  onInviteToServer: () => void;
  onMuteServer: (duration: "15m" | "1h" | "3h" | "8h" | "24h" | "until") => void;
  onUnmuteServer?: () => void;
  onSetNotificationLevel: (level: "all" | "mentions" | "none") => void;
  hideMutedChannels: boolean;
  onToggleHideMutedChannels: () => void;
  showAllChannels?: boolean;
  onToggleShowAllChannels?: () => void;
  onServerSettings: () => void;
  onCreateChannel: () => void;
  onCreateCategory: () => void;
  onCreateEvent: () => void;
  onLeaveServer?: () => void;
  notificationLevel?: "all" | "mentions" | "none";
  serverMuted?: boolean;
  suppressEveryoneHere?: boolean;
  suppressRoleMentions?: boolean;
  onSetSuppressEveryoneHere?: (value: boolean) => void;
  onSetSuppressRoleMentions?: (value: boolean) => void;
}

const MUTE_KEYS: Array<"15m" | "1h" | "3h" | "8h" | "24h" | "until"> = [
  "15m", "1h", "3h", "8h", "24h", "until",
];

/* ── Icons ─────────────────────────────────────────────────────────────────── */

const IcoCheck = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const IcoUserPlus = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="8.5" cy="7" r="4" />
    <line x1="20" y1="8" x2="20" y2="14" />
    <line x1="23" y1="11" x2="17" y2="11" />
  </svg>
);

const IcoBellOff = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    <path d="M18.63 13A17.89 17.89 0 0 1 18 8" />
    <path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14" />
    <path d="M18 8a6 6 0 0 0-9.33-5" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);

const IcoBell = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);

const IcoEyeOff = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);

const IcoEye = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const IcoSettings = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const IcoHash = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="4" y1="9" x2="20" y2="9" />
    <line x1="4" y1="15" x2="20" y2="15" />
    <line x1="10" y1="3" x2="8" y2="21" />
    <line x1="16" y1="3" x2="14" y2="21" />
  </svg>
);

const IcoFolder = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    <line x1="12" y1="11" x2="12" y2="17" />
    <line x1="9" y1="14" x2="15" y2="14" />
  </svg>
);

const IcoCalendarPlus = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
    <line x1="12" y1="14" x2="12" y2="18" />
    <line x1="10" y1="16" x2="14" y2="16" />
  </svg>
);

const IcoLogOut = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

const IcoChevron = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 18l6-6-6-6" />
  </svg>
);

/* ── Component ──────────────────────────────────────────────────────────────── */

export default function ServerContextMenu({
  x,
  y,
  server,
  permissions,
  isOwner: isOwnerProp,
  onClose,
  onMarkAsRead,
  onInviteToServer,
  onMuteServer,
  onUnmuteServer,
  onSetNotificationLevel,
  hideMutedChannels,
  onToggleHideMutedChannels,
  showAllChannels = false,
  onToggleShowAllChannels,
  onServerSettings,
  onCreateChannel,
  onCreateCategory,
  onCreateEvent,
  onLeaveServer,
  notificationLevel = "all",
  serverMuted = false,
  suppressEveryoneHere = false,
  suppressRoleMentions = false,
  onSetSuppressEveryoneHere,
  onSetSuppressRoleMentions,
}: ServerContextMenuProps) {
  const { t } = useLanguage();
  const menuRef = useRef<HTMLDivElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const [submenu, setSubmenu] = useState<"mute" | "notifications" | null>(null);
  const [submenuPos, setSubmenuPos] = useState({ top: 0, left: 0 });
  const [menuPos, setMenuPos] = useState({ left: x, top: y });

  const isOwner = permissions?.isOwner ?? isOwnerProp ?? false;
  const canManageServer = permissions?.canManageServer ?? isOwner;
  const canManageChannels = permissions?.canManageChannels ?? isOwner;
  const canManageEvents = permissions?.canManageEvents ?? isOwner;
  const canCreateInvite = permissions?.canCreateInvite ?? false;
  const hasAnyManagePermission = canManageServer || canManageChannels || canManageEvents;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current && !menuRef.current.contains(target)) {
        const subEl = document.querySelector("[data-server-context-submenu]");
        if (!subEl?.contains(target)) onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  useLayoutEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const pad = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = x;
    let top = y;
    if (left + rect.width > vw - pad) {
      left = Math.max(pad, vw - pad - rect.width);
    }
    // Lật lên trên nếu không đủ chỗ phía dưới mà phía trên còn chỗ.
    const spaceBelow = vh - y - pad;
    const spaceAbove = y - pad;
    if (rect.height > spaceBelow && spaceAbove > spaceBelow) {
      top = Math.max(pad, y - rect.height);
    } else if (top + rect.height > vh - pad) {
      top = Math.max(pad, vh - pad - rect.height);
    }
    setMenuPos({ left, top });
  }, [x, y, submenu, canManageServer, canManageChannels, canManageEvents, canCreateInvite, isOwner]);

  useLayoutEffect(() => {
    if (!submenu || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const gap = 4;
    const subW = submenuRef.current?.offsetWidth ?? 220;
    let left = rect.right + gap;
    if (left + subW > window.innerWidth - 8) left = Math.max(8, rect.left - subW - gap);
    const subH = submenuRef.current?.offsetHeight ?? 220;
    let top = rect.top;
    if (top + subH > window.innerHeight - 8) top = Math.max(8, window.innerHeight - 8 - subH);
    setSubmenuPos({ top, left });
  }, [submenu, x, y]);

  const notificationLabel =
    notificationLevel === "all"
      ? t("chat.serverContextMenu.notifAll")
      : notificationLevel === "mentions"
        ? t("chat.serverContextMenu.notifMentions")
        : t("chat.serverContextMenu.notifNone");

  return (
    <>
      <div className={styles.overlay} onClick={onClose} aria-hidden />
      <div
        ref={menuRef}
        className={styles.menu}
        style={{ left: menuPos.left, top: menuPos.top }}
        role="menu"
        aria-label={t("chat.serverContextMenu.aria")}
      >
        {/* Server name header */}
        <div className={styles.menuHeader}>
          <span className={styles.menuHeaderDot} />
          <span className={styles.menuHeaderName}>{server.name}</span>
        </div>

        <button type="button" className={styles.menuItem} onClick={onMarkAsRead} role="menuitem">
          <span className={styles.itemIcon}><IcoCheck /></span>
          <span className={styles.itemLabel}>{t("chat.serverContextMenu.markAsRead")}</span>
        </button>

        <div className={styles.divider} />

        {canCreateInvite && (
          <button type="button" className={styles.menuItem} onClick={onInviteToServer} role="menuitem">
            <span className={styles.itemIcon}><IcoUserPlus /></span>
            <span className={styles.itemLabel}>{t("chat.serverContextMenu.inviteToServer")}</span>
          </button>
        )}

        <div className={styles.divider} />

        {/* Tắt âm máy chủ */}
        <button
          type="button"
          className={`${styles.menuItem} ${styles.menuItemWithSub} ${submenu === "mute" ? styles.menuItemOpen : ""}`}
          onClick={(e) => { e.stopPropagation(); setSubmenu((s) => (s === "mute" ? null : "mute")); }}
          role="menuitem"
          aria-expanded={submenu === "mute"}
        >
          <span className={styles.itemIcon}><IcoBellOff /></span>
          <span className={styles.itemLabel}>{t("chat.serverContextMenu.muteServer")}</span>
          <span className={`${styles.arrow} ${submenu === "mute" ? styles.arrowOpen : ""}`}><IcoChevron /></span>
        </button>

        {/* Cài đặt thông báo */}
        <button
          type="button"
          className={`${styles.menuItem} ${styles.menuItemWithSub} ${submenu === "notifications" ? styles.menuItemOpen : ""}`}
          onClick={(e) => { e.stopPropagation(); setSubmenu((s) => (s === "notifications" ? null : "notifications")); }}
          role="menuitem"
          aria-expanded={submenu === "notifications"}
        >
          <span className={styles.itemIcon}><IcoBell /></span>
          <div className={styles.itemContent}>
            <span className={styles.itemLabel}>{t("chat.serverContextMenu.notificationSettings")}</span>
            <span className={styles.subLabel}>{notificationLabel}</span>
          </div>
          <span className={`${styles.arrow} ${submenu === "notifications" ? styles.arrowOpen : ""}`}><IcoChevron /></span>
        </button>

        {/* Ẩn kênh bị tắt âm */}
        <button type="button" className={styles.menuItem} onClick={onToggleHideMutedChannels} role="menuitem">
          <span className={styles.itemIcon}><IcoEyeOff /></span>
          <span className={styles.itemLabel}>{t("chat.serverContextMenu.hideVoiceChannels")}</span>
          <span className={`${styles.checkbox} ${hideMutedChannels ? styles.checked : ""}`} />
        </button>

        {/* Hiện tất cả kênh - non-owner */}
        {!isOwner && (
          <button type="button" className={styles.menuItem} onClick={onToggleShowAllChannels} role="menuitem">
            <span className={styles.itemIcon}><IcoEye /></span>
            <span className={styles.itemLabel}>{t("chat.serverContextMenu.showAllChannels")}</span>
            <span className={`${styles.checkbox} ${showAllChannels ? styles.checked : ""}`} />
          </button>
        )}

        {/* === Quản lý máy chủ === */}
        {hasAnyManagePermission && (
          <>
            <div className={styles.divider} />
            {canManageServer && (
              <button
                type="button"
                className={`${styles.menuItem} ${styles.menuItemWithSub}`}
                onClick={onServerSettings}
                role="menuitem"
              >
                <span className={styles.itemIcon}><IcoSettings /></span>
                <span className={styles.itemLabel}>{t("chat.serverContextMenu.serverSettings")}</span>
                <span className={styles.arrow}><IcoChevron /></span>
              </button>
            )}
          </>
        )}

        {/* === Tạo mới === */}
        {(canManageChannels || canManageEvents) && (
          <>
            <div className={styles.divider} />
            {canManageChannels && (
              <button type="button" className={styles.menuItem} onClick={onCreateChannel} role="menuitem">
                <span className={styles.itemIcon}><IcoHash /></span>
                <span className={styles.itemLabel}>{t("chat.serverContextMenu.createChannel")}</span>
              </button>
            )}
            {canManageChannels && (
              <button type="button" className={styles.menuItem} onClick={onCreateCategory} role="menuitem">
                <span className={styles.itemIcon}><IcoFolder /></span>
                <span className={styles.itemLabel}>{t("chat.serverContextMenu.createCategory")}</span>
              </button>
            )}
            {canManageEvents && (
              <button type="button" className={styles.menuItem} onClick={onCreateEvent} role="menuitem">
                <span className={styles.itemIcon}><IcoCalendarPlus /></span>
                <span className={styles.itemLabel}>{t("chat.serverContextMenu.createEvent")}</span>
              </button>
            )}
          </>
        )}

        {/* Rời khỏi máy chủ - non-owner */}
        {!isOwner && (
          <>
            <div className={styles.divider} />
            <button
              type="button"
              className={`${styles.menuItem} ${styles.menuItemDanger}`}
              onClick={() => { onLeaveServer?.(); onClose(); }}
              role="menuitem"
            >
              <span className={styles.itemIcon}><IcoLogOut /></span>
              <span className={styles.itemLabel}>{t("chat.serverContextMenu.leaveServer")}</span>
            </button>
          </>
        )}
      </div>

      {/* Submenu: Tắt âm */}
      {submenu === "mute" && menuRef.current && (
        <div
          ref={submenuRef}
          data-server-context-submenu
          className={styles.submenu}
          style={{ left: submenuPos.left, top: submenuPos.top }}
          role="menu"
        >
          {serverMuted && onUnmuteServer ? (
            <button
              type="button"
              className={styles.submenuItem}
              onClick={() => { onUnmuteServer(); onClose(); }}
              role="menuitem"
            >
              {t("chat.serverContextMenu.unmuteServer")}
            </button>
          ) : (
            MUTE_KEYS.map((key) => {
              const labelKey =
                key === "15m" ? "muteFor15m"
                : key === "1h" ? "muteFor1h"
                : key === "3h" ? "muteFor3h"
                : key === "8h" ? "muteFor8h"
                : key === "24h" ? "muteFor24h"
                : "muteUntilReenable";
              return (
                <button
                  key={key}
                  type="button"
                  className={styles.submenuItem}
                  onClick={() => { onMuteServer(key); onClose(); }}
                  role="menuitem"
                >
                  {t(`chat.serverContextMenu.${labelKey}`)}
                </button>
              );
            })
          )}
        </div>
      )}

      {/* Submenu: Thông báo */}
      {submenu === "notifications" && menuRef.current && (
        <div
          ref={submenuRef}
          data-server-context-submenu
          className={styles.submenu}
          style={{ left: submenuPos.left, top: submenuPos.top }}
          role="menu"
        >
          {(["all", "mentions", "none"] as const).map((level) => (
            <button
              key={level}
              type="button"
              className={`${styles.submenuItem} ${notificationLevel === level ? styles.selected : ""}`}
              onClick={() => { onSetNotificationLevel(level); onClose(); }}
              role="menuitem"
            >
              <span className={styles.radio} />
              {t(`chat.serverContextMenu.notif${level.charAt(0).toUpperCase() + level.slice(1)}`)}
            </button>
          ))}
          <div className={styles.submenuDivider} />
          <label className={styles.submenuCheckbox} onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
            <input type="checkbox" checked={suppressEveryoneHere} onChange={(e) => onSetSuppressEveryoneHere?.(e.target.checked)} />
            {t("chat.serverContextMenu.suppressEveryone")}
          </label>
          <label className={styles.submenuCheckbox} onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
            <input type="checkbox" checked={suppressRoleMentions} onChange={(e) => onSetSuppressRoleMentions?.(e.target.checked)} />
            {t("chat.serverContextMenu.suppressRoles")}
          </label>
          <label className={styles.submenuCheckbox} onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
            <input type="checkbox" />
            {t("chat.serverContextMenu.muteNewEvents")}
          </label>
        </div>
      )}
    </>
  );
}
