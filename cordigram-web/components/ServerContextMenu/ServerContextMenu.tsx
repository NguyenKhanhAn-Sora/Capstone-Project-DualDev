"use client";

import React, { useEffect, useRef, useState } from "react";
import styles from "./ServerContextMenu.module.css";

export interface ServerContextMenuServer {
  _id: string;
  name: string;
  ownerId?: string;
}

export interface ServerContextMenuProps {
  x: number;
  y: number;
  server: ServerContextMenuServer;
  /** True = chủ máy chủ → hiện Cài đặt máy chủ, Tạo kênh/Danh mục/Sự kiện. False = thành viên → hiện Hiện tất cả kênh, Rời khỏi phòng */
  isOwner: boolean;
  onClose: () => void;
  onMarkAsRead: () => void;
  onInviteToServer: () => void;
  onMuteServer: (duration: "15m" | "1h" | "3h" | "8h" | "24h" | "until") => void;
  onNotificationSettings: () => void;
  hideMutedChannels: boolean;
  onToggleHideMutedChannels: () => void;
  /** Chỉ khi !isOwner */
  showAllChannels?: boolean;
  onToggleShowAllChannels?: () => void;
  onServerSettings: () => void;
  onSecuritySettings: () => void;
  onEditServerProfile: () => void;
  onCreateChannel: () => void;
  onCreateCategory: () => void;
  onCreateEvent: () => void;
  /** Chỉ khi !isOwner. Rời khỏi máy chủ */
  onLeaveServer?: () => void;
  /** Current notification level for display: "all" | "mentions" | "none" */
  notificationLevel?: "all" | "mentions" | "none";
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
  isOwner,
  onClose,
  onMarkAsRead,
  onInviteToServer,
  onMuteServer,
  onNotificationSettings,
  hideMutedChannels,
  onToggleHideMutedChannels,
  showAllChannels = false,
  onToggleShowAllChannels,
  onServerSettings,
  onSecuritySettings,
  onEditServerProfile,
  onCreateChannel,
  onCreateCategory,
  onCreateEvent,
  onLeaveServer,
  notificationLevel = "all",
}: ServerContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [submenu, setSubmenu] = useState<"mute" | "notifications" | null>(null);
  const [submenuPos, setSubmenuPos] = useState({ top: 0, left: 0 });

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

  useEffect(() => {
    if (!submenu || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    setSubmenuPos({
      top: 0,
      left: rect.width + 4,
    });
  }, [submenu]);

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
        <button type="button" className={styles.menuItem} onClick={onMarkAsRead} role="menuitem">
          Đánh Dấu Đã Đọc
        </button>
        <div className={styles.divider} />
        <button type="button" className={styles.menuItem} onClick={onInviteToServer} role="menuitem">
          Mời Vào Máy Chủ
        </button>
        <div className={styles.divider} />
        <div
          className={`${styles.menuItem} ${styles.menuItemWithSub}`}
          onMouseEnter={() => setSubmenu("mute")}
          onMouseLeave={() => setSubmenu(null)}
          role="menuitem"
        >
          <span>Tắt âm Máy chủ</span>
          <span className={styles.arrow}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </span>
        </div>
        <div
          className={`${styles.menuItem} ${styles.menuItemWithSub}`}
          onMouseEnter={() => setSubmenu("notifications")}
          onMouseLeave={() => setSubmenu(null)}
          onClick={onNotificationSettings}
          role="menuitem"
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
        </div>
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
        {isOwner && (
          <>
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
            <button type="button" className={styles.menuItem} onClick={onSecuritySettings} role="menuitem">
              Cài Đặt Bảo Mật
            </button>
            <button type="button" className={styles.menuItem} onClick={onEditServerProfile} role="menuitem">
              Chỉnh Sửa Hồ Sơ Theo Máy Chủ
            </button>
            <div className={styles.divider} />
            <button type="button" className={styles.menuItem} onClick={onCreateChannel} role="menuitem">
              Tạo kênh
            </button>
            <button type="button" className={styles.menuItem} onClick={onCreateCategory} role="menuitem">
              Tạo Danh Mục
            </button>
            <button type="button" className={styles.menuItem} onClick={onCreateEvent} role="menuitem">
              Tạo Sự kiện
            </button>
          </>
        )}
        {!isOwner && (
          <>
            <button type="button" className={styles.menuItem} onClick={onSecuritySettings} role="menuitem">
              Cài Đặt Bảo Mật
            </button>
            <button type="button" className={styles.menuItem} onClick={onEditServerProfile} role="menuitem">
              Chỉnh Sửa Hồ Sơ Theo Máy Chủ
            </button>
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

      {submenu === "mute" && menuRef.current && (
        <div
          data-server-context-submenu
          className={styles.submenu}
          style={{
            left: x + menuRef.current.offsetWidth + 4,
            top: y,
          }}
          role="menu"
        >
          {MUTE_OPTIONS.map((opt) => (
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
          ))}
        </div>
      )}

      {submenu === "notifications" && menuRef.current && (
        <div
          data-server-context-submenu
          className={styles.submenu}
          style={{
            left: x + menuRef.current.offsetWidth + 4,
            top: y,
          }}
          role="menu"
        >
          <button
            type="button"
            className={`${styles.submenuItem} ${notificationLevel === "all" ? styles.selected : ""}`}
            onClick={() => {
              onNotificationSettings();
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
              onNotificationSettings();
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
              onNotificationSettings();
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
