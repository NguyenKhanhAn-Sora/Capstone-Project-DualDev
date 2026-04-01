"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import styles from "./ServerContextMenu.module.css";

export interface ServerContextMenuServer {
  _id: string;
  name: string;
  ownerId?: string;
}

/**
 * Permissions props để xác định hiển thị options
 */
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
  /** Permissions của user hiện tại - dùng để hiển thị options */
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
  /** Chỉ khi không phải owner */
  showAllChannels?: boolean;
  onToggleShowAllChannels?: () => void;
  onServerSettings: () => void;
  onCreateChannel: () => void;
  onCreateCategory: () => void;
  onCreateEvent: () => void;
  /** Rời khỏi máy chủ - chỉ hiện khi không phải owner */
  onLeaveServer?: () => void;
  /** Current notification level for display: "all" | "mentions" | "none" */
  notificationLevel?: "all" | "mentions" | "none";
  /** Mute state for display */
  serverMuted?: boolean;
}

const MUTE_OPTIONS: { key: "15m" | "1h" | "3h" | "8h" | "24h" | "until"; label: string }[] = [
  { key: "15m", label: "Trong vòng 15 Phút" },
  { key: "1h", label: "Trong vòng 1 Giờ" },
  { key: "3h", label: "Trong vòng 3 Giờ" },
  { key: "8h", label: "Trong vòng 8 Giờ" },
  { key: "24h", label: "Trong vòng 24 Giờ" },
  { key: "until", label: "Cho đến khi bật lại" },
];

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
}: ServerContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const [submenu, setSubmenu] = useState<"mute" | "notifications" | null>(null);
  const [submenuPos, setSubmenuPos] = useState({ top: 0, left: 0 });

  // Sử dụng permissions, fallback về isOwner prop cũ nếu có
  const isOwner = permissions?.isOwner ?? isOwnerProp ?? false;
  const canManageServer = permissions?.canManageServer ?? isOwner;
  const canManageChannels = permissions?.canManageChannels ?? isOwner;
  const canManageEvents = permissions?.canManageEvents ?? isOwner;
  const canCreateInvite = permissions?.canCreateInvite ?? true;

  // Kiểm tra có quyền quản lý nào không
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
    if (!submenu || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const gap = 4;
    const subW = submenuRef.current?.offsetWidth ?? 220;
    let left = rect.right + gap;
    if (left + subW > window.innerWidth - 8) {
      left = Math.max(8, rect.left - subW - gap);
    }
    const subH = submenuRef.current?.offsetHeight ?? 220;
    let top = rect.top;
    if (top + subH > window.innerHeight - 8) {
      top = Math.max(8, window.innerHeight - 8 - subH);
    }
    setSubmenuPos({ top, left });
  }, [submenu, x, y]);

  const notificationLabel =
    notificationLevel === "all"
      ? "Tất cả các tin nhắn"
      : notificationLevel === "mentions"
        ? "Chỉ @mentions"
        : "Không có";

  return (
    <>
      <div className={styles.overlay} onClick={onClose} aria-hidden />
      <div
        ref={menuRef}
        className={styles.menu}
        style={{ left: x, top: y }}
        role="menu"
        aria-label="Menu máy chủ"
      >
        {/* Đánh dấu đã đọc - hiển thị cho tất cả */}
        <button type="button" className={styles.menuItem} onClick={onMarkAsRead} role="menuitem">
          Đánh Dấu Đã Đọc
        </button>
        <div className={styles.divider} />

        {/* Mời vào máy chủ - hiển thị nếu có quyền createInvite */}
        {canCreateInvite && (
          <>
            <button type="button" className={styles.menuItem} onClick={onInviteToServer} role="menuitem">
              Mời Vào Máy Chủ
            </button>
            <div className={styles.divider} />
          </>
        )}

        {/* Tắt âm máy chủ - hiển thị cho tất cả */}
        <button
          type="button"
          className={`${styles.menuItem} ${styles.menuItemWithSub} ${submenu === "mute" ? styles.menuItemOpen : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            setSubmenu((s) => (s === "mute" ? null : "mute"));
          }}
          role="menuitem"
          aria-expanded={submenu === "mute"}
        >
          <span>Tắt âm Máy chủ</span>
          <span className={styles.arrow}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </span>
        </button>

        {/* Cài đặt thông báo - hiển thị cho tất cả */}
        <button
          type="button"
          className={`${styles.menuItem} ${styles.menuItemWithSub} ${submenu === "notifications" ? styles.menuItemOpen : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            setSubmenu((s) => (s === "notifications" ? null : "notifications"));
          }}
          role="menuitem"
          aria-expanded={submenu === "notifications"}
        >
          <div>
            <span>Cài đặt thông báo</span>
            <span className={styles.subLabel}>{notificationLabel}</span>
          </div>
          <span className={styles.arrow}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </span>
        </button>

        {/* Ẩn kênh bị tắt âm - hiển thị cho tất cả */}
        <button
          type="button"
          className={styles.menuItem}
          onClick={onToggleHideMutedChannels}
          role="menuitem"
        >
          <span className={styles.checkboxWrap}>
            <span>Ẩn Các Kênh Bị Tắt Âm</span>
            <span className={`${styles.checkbox} ${hideMutedChannels ? styles.checked : ""}`} />
          </span>
        </button>

        {/* Hiện tất cả kênh - chỉ hiện cho non-owner */}
        {!isOwner && (
          <button
            type="button"
            className={styles.menuItem}
            onClick={onToggleShowAllChannels}
            role="menuitem"
          >
            <span className={styles.checkboxWrap}>
              <span>Hiện tất cả kênh</span>
              <span className={`${styles.checkbox} ${showAllChannels ? styles.checked : ""}`} />
            </span>
          </button>
        )}

        <div className={styles.divider} />

        {/* === Phần quản lý máy chủ - hiển thị nếu có quyền === */}
        {hasAnyManagePermission && (
          <>
            {/* Cài đặt máy chủ - yêu cầu quyền manageServer */}
            {canManageServer && (
              <button
                type="button"
                className={`${styles.menuItem} ${styles.menuItemWithSub}`}
                onClick={onServerSettings}
                role="menuitem"
              >
                <span>Cài đặt máy chủ</span>
                <span className={styles.arrow}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </span>
              </button>
            )}
          </>
        )}

        {/* === Phần tạo mới - hiển thị nếu có quyền === */}
        {(canManageChannels || canManageEvents) && (
          <>
            <div className={styles.divider} />

            {/* Tạo kênh - yêu cầu quyền manageChannels */}
            {canManageChannels && (
              <button type="button" className={styles.menuItem} onClick={onCreateChannel} role="menuitem">
                Tạo kênh
              </button>
            )}

            {/* Tạo danh mục - yêu cầu quyền manageChannels */}
            {canManageChannels && (
              <button type="button" className={styles.menuItem} onClick={onCreateCategory} role="menuitem">
                Tạo Danh Mục
              </button>
            )}

            {/* Tạo sự kiện - yêu cầu quyền manageEvents */}
            {canManageEvents && (
              <button type="button" className={styles.menuItem} onClick={onCreateEvent} role="menuitem">
                Tạo Sự kiện
              </button>
            )}
          </>
        )}

        {/* Rời khỏi phòng - chỉ hiện cho non-owner */}
        {!isOwner && (
          <>
            <div className={styles.divider} />
            <button
              type="button"
              className={`${styles.menuItem} ${styles.menuItemDanger}`}
              onClick={() => {
                onLeaveServer?.();
                onClose();
              }}
              role="menuitem"
            >
              Rời khỏi phòng
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
          style={{
            left: submenuPos.left,
            top: submenuPos.top,
          }}
          role="menu"
        >
          {serverMuted && onUnmuteServer ? (
            <button
              type="button"
              className={styles.submenuItem}
              onClick={() => {
                onUnmuteServer();
                onClose();
              }}
              role="menuitem"
            >
              Bỏ tắt âm máy chủ
            </button>
          ) : (
            MUTE_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                className={styles.submenuItem}
                onClick={() => {
                  onMuteServer(opt.key);
                  onClose();
                }}
                role="menuitem"
              >
                {opt.label}
              </button>
            ))
          )}
        </div>
      )}

      {/* Submenu: Thông báo */}
      {submenu === "notifications" && menuRef.current && (
        <div
          ref={submenuRef}
          data-server-context-submenu
          className={styles.submenu}
          style={{
            left: submenuPos.left,
            top: submenuPos.top,
          }}
          role="menu"
        >
          <button
            type="button"
            className={`${styles.submenuItem} ${notificationLevel === "all" ? styles.selected : ""}`}
            onClick={() => {
              onSetNotificationLevel("all");
              onClose();
            }}
            role="menuitem"
          >
            <span className={styles.radio} />
            Tất cả các tin nhắn
          </button>
          <button
            type="button"
            className={`${styles.submenuItem} ${notificationLevel === "mentions" ? styles.selected : ""}`}
            onClick={() => {
              onSetNotificationLevel("mentions");
              onClose();
            }}
            role="menuitem"
          >
            <span className={styles.radio} />
            Chỉ @mentions
          </button>
          <button
            type="button"
            className={`${styles.submenuItem} ${notificationLevel === "none" ? styles.selected : ""}`}
            onClick={() => {
              onSetNotificationLevel("none");
              onClose();
            }}
            role="menuitem"
          >
            <span className={styles.radio} />
            Không có
          </button>
          <div className={styles.submenuDivider} />
          <label className={styles.submenuCheckbox}>
            <input type="checkbox" />
            Cấm @everyone và @here
          </label>
          <label className={styles.submenuCheckbox}>
            <input type="checkbox" />
            Bỏ Tất Cả Vai Trò @mentions
          </label>
          <label className={styles.submenuCheckbox}>
            <input type="checkbox" />
            Ẩn các tin tức nổi bật
          </label>
          <label className={styles.submenuCheckbox}>
            <input type="checkbox" />
            Tắt âm báo sự kiện mới
          </label>
          <label className={styles.submenuCheckbox}>
            <input type="checkbox" defaultChecked />
            Thông báo nhắc nhở trên di động
          </label>
        </div>
      )}
    </>
  );
}
