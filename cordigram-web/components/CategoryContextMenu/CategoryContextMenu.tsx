"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CategoryNotifyMode, NotifyLevel } from "@/lib/sidebar-prefs";
import { notifyLabelCategory } from "@/lib/sidebar-prefs";
import type { MuteDurationKey } from "@/components/ChannelContextMenu/ChannelContextMenu";
import styles from "./CategoryContextMenu.module.css";

const MUTE_OPTIONS: { key: MuteDurationKey; label: string }[] = [
  { key: "15m", label: "Trong vòng 15 Phút" },
  { key: "1h", label: "Trong vòng 1 Giờ" },
  { key: "3h", label: "Trong vòng 3 Giờ" },
  { key: "8h", label: "Trong vòng 8 Giờ" },
  { key: "24h", label: "Trong vòng 24 Giờ" },
  { key: "until", label: "Cho đến khi bật lại" },
];

export interface CategoryContextMenuProps {
  x: number;
  y: number;
  category: { _id: string; name: string };
  canManageChannelsStructure: boolean;
  serverNotificationLevel: NotifyLevel;
  categoryNotifyMode: CategoryNotifyMode;
  collapseUiEnabled: boolean;
  categoryMuted: boolean;
  onClose: () => void;
  onMarkAsRead: () => void | Promise<void>;
  onToggleCollapseUi: (enabled: boolean) => void;
  onCollapseAllCategories: () => void;
  onMuteCategory: (duration: MuteDurationKey) => void;
  onUnmuteCategory: () => void;
  onSetCategoryNotify: (mode: CategoryNotifyMode) => void;
  onEditCategory: () => void;
  onDeleteCategory: () => void;
}

export default function CategoryContextMenu({
  x,
  y,
  category,
  canManageChannelsStructure,
  serverNotificationLevel,
  categoryNotifyMode,
  collapseUiEnabled,
  categoryMuted,
  onClose,
  onMarkAsRead,
  onToggleCollapseUi,
  onCollapseAllCategories,
  onMuteCategory,
  onUnmuteCategory,
  onSetCategoryNotify,
  onEditCategory,
  onDeleteCategory,
}: CategoryContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const [submenu, setSubmenu] = useState<"mute" | "notify" | null>(null);
  const [submenuPos, setSubmenuPos] = useState({ left: 0, top: 0 });

  const notifySubLabel = notifyLabelCategory(categoryNotifyMode, serverNotificationLevel);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t)) return;
      const sub = document.querySelector("[data-category-context-submenu]");
      if (sub?.contains(t)) return;
      onClose();
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (rect.right > vw) {
      menuRef.current.style.left = `${Math.max(4, vw - rect.width - 8)}px`;
    }
    if (rect.bottom > vh) {
      menuRef.current.style.top = `${Math.max(4, vh - rect.height - 8)}px`;
    }
  }, [x, y]);

  useLayoutEffect(() => {
    if (!submenu || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const gap = 4;
    const subW = submenuRef.current?.offsetWidth ?? 240;
    let left = rect.right + gap;
    if (left + subW > window.innerWidth - 8) {
      left = Math.max(8, rect.left - subW - gap);
    }
    let top = rect.top;
    const subH = submenuRef.current?.offsetHeight ?? 200;
    if (top + subH > window.innerHeight - 8) {
      top = Math.max(8, window.innerHeight - 8 - subH);
    }
    setSubmenuPos({ left, top });
  }, [submenu, x, y]);

  return (
    <>
      <div className={styles.overlay} onClick={onClose} aria-hidden />
      <div
        ref={menuRef}
        className={styles.menu}
        style={{ left: x, top: y }}
        role="menu"
        aria-label="Menu danh mục"
      >
        <button
          type="button"
          className={styles.menuItem}
          onClick={async () => {
            setSubmenu(null);
            await onMarkAsRead();
            onClose();
          }}
          role="menuitem"
        >
          Đánh Dấu Đã Đọc
        </button>

        <button
          type="button"
          className={styles.menuItem}
          onClick={() => {
            setSubmenu(null);
            onToggleCollapseUi(!collapseUiEnabled);
          }}
          role="menuitem"
        >
          <span>Thu gọn danh mục</span>
          <span className={`${styles.checkboxBlue} ${collapseUiEnabled ? styles.checked : ""}`}>
            {collapseUiEnabled ? "✓" : ""}
          </span>
        </button>

        <button
          type="button"
          className={styles.menuItem}
          onClick={() => {
            setSubmenu(null);
            onCollapseAllCategories();
            onClose();
          }}
          role="menuitem"
        >
          Thu gọn tất cả danh mục
        </button>

        <div className={styles.divider} />

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
          <span>Tắt âm danh mục</span>
          <span className={styles.arrow}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </span>
        </button>

        <button
          type="button"
          className={`${styles.menuItem} ${styles.menuItemWithSub} ${submenu === "notify" ? styles.menuItemOpen : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            setSubmenu((s) => (s === "notify" ? null : "notify"));
          }}
          role="menuitem"
          aria-expanded={submenu === "notify"}
        >
          <div>
            <span>Cài đặt thông báo</span>
            <span className={styles.subLabel}>{notifySubLabel}</span>
          </div>
          <span className={styles.arrow}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </span>
        </button>

        {canManageChannelsStructure && (
          <>
            <div className={styles.divider} />
            <button
              type="button"
              className={styles.menuItem}
              onClick={() => {
                setSubmenu(null);
                onEditCategory();
                onClose();
              }}
              role="menuitem"
            >
              Chỉnh sửa danh mục
            </button>
            <button
              type="button"
              className={`${styles.menuItem} ${styles.menuItemDanger}`}
              onClick={() => {
                setSubmenu(null);
                onDeleteCategory();
                onClose();
              }}
              role="menuitem"
            >
              Xóa danh mục
            </button>
          </>
        )}
      </div>

      {submenu === "mute" && (
        <div
          ref={submenuRef}
          data-category-context-submenu
          className={styles.submenu}
          style={{ left: submenuPos.left, top: submenuPos.top }}
          role="menu"
        >
          {categoryMuted ? (
            <button
              type="button"
              className={styles.submenuItem}
              onClick={() => {
                onUnmuteCategory();
                onClose();
              }}
              role="menuitem"
            >
              Bỏ tắt âm danh mục
            </button>
          ) : (
            MUTE_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                className={styles.submenuItem}
                onClick={() => {
                  onMuteCategory(opt.key);
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

      {submenu === "notify" && (
        <div
          ref={submenuRef}
          data-category-context-submenu
          className={styles.submenu}
          style={{ left: submenuPos.left, top: submenuPos.top }}
          role="menu"
        >
          <button
            type="button"
            className={`${styles.submenuItem} ${categoryNotifyMode === "inherit_server" ? styles.selected : ""}`}
            onClick={() => {
              onSetCategoryNotify("inherit_server");
              onClose();
            }}
            role="menuitem"
          >
            <span className={styles.radio} />
            <span className={styles.submenuStack}>
              <span>Sử dụng mặc định của máy chủ</span>
              <span className={styles.subLabel}>
                {notifyLabelCategory("inherit_server", serverNotificationLevel)}
              </span>
            </span>
          </button>
          <button
            type="button"
            className={`${styles.submenuItem} ${categoryNotifyMode === "all" ? styles.selected : ""}`}
            onClick={() => {
              onSetCategoryNotify("all");
              onClose();
            }}
            role="menuitem"
          >
            <span className={styles.radio} />
            Tất cả các tin nhắn
          </button>
          <button
            type="button"
            className={`${styles.submenuItem} ${categoryNotifyMode === "mentions" ? styles.selected : ""}`}
            onClick={() => {
              onSetCategoryNotify("mentions");
              onClose();
            }}
            role="menuitem"
          >
            <span className={styles.radio} />
            Chỉ @mentions
          </button>
          <button
            type="button"
            className={`${styles.submenuItem} ${categoryNotifyMode === "none" ? styles.selected : ""}`}
            onClick={() => {
              onSetCategoryNotify("none");
              onClose();
            }}
            role="menuitem"
          >
            <span className={styles.radio} />
            Không có
          </button>
        </div>
      )}
    </>
  );
}
