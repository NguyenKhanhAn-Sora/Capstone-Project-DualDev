"use client";

import React, { useEffect, useRef } from "react";
import styles from "./MessageActionsMenu.module.css";
import { useLanguage } from "@/component/language-provider";

interface MessageActionsMenuProps {
  /**
   * Legacy generic "remove" action (kept for channel messages that still
   * go through the DeleteMessageDialog flow). DM bubbles should use the
   * split `onDeleteForMe` / `onDeleteForEveryone` handlers instead.
   */
  onRemove?: () => void;
  onForward?: () => void;
  onPin?: () => void;
  onReport?: () => void;
  /** Direct delete actions for DMs — each one fires immediately. */
  onDeleteForMe?: () => void;
  onDeleteForEveryone?: () => void;
  onClose: () => void;
  position?: { top?: number; bottom?: number; left?: number; right?: number };
  isOwnMessage?: boolean;
  isPinned?: boolean;
}

export default function MessageActionsMenu({
  onRemove,
  onForward,
  onPin,
  onReport,
  onDeleteForMe,
  onDeleteForEveryone,
  onClose,
  position,
  isOwnMessage = false,
  isPinned = false,
}: MessageActionsMenuProps) {
  const { t } = useLanguage();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  const handleAction = (action: () => void) => {
    action();
    onClose();
  };

  const labelDeleteForMe = t("chat.actions.deleteForMe") || "Xóa ở phía tôi";
  const labelDeleteForEveryone =
    t("chat.actions.deleteForEveryone") || "Xóa với mọi người";

  return (
    <div className={styles.overlay} style={position}>
      <div className={styles.menu} ref={menuRef}>
        {isOwnMessage && onRemove && (
          <button
            className={styles.menuItem}
            onClick={() => handleAction(onRemove)}
          >
            <span className={styles.icon}>🗑️</span>
            <span>Gỡ</span>
          </button>
        )}
        {onDeleteForMe && (
          <button
            className={styles.menuItem}
            onClick={() => handleAction(onDeleteForMe)}
          >
            <span className={styles.icon}>🧹</span>
            <span>{labelDeleteForMe}</span>
          </button>
        )}
        {isOwnMessage && onDeleteForEveryone && (
          <button
            className={`${styles.menuItem} ${styles.danger}`}
            onClick={() => handleAction(onDeleteForEveryone)}
          >
            <span className={styles.icon}>🗑️</span>
            <span>{labelDeleteForEveryone}</span>
          </button>
        )}
        {onForward && (
          <button
            className={styles.menuItem}
            onClick={() => handleAction(onForward)}
          >
            <span className={styles.icon}>➡️</span>
            <span>Chuyển tiếp</span>
          </button>
        )}
        {onPin && (
          <button
            className={styles.menuItem}
            onClick={() => handleAction(onPin)}
          >
            <span className={styles.icon}>📌</span>
            <span>{isPinned ? "Bỏ ghim" : "Ghim"}</span>
          </button>
        )}
        {onReport && !isOwnMessage && (
          <button
            className={`${styles.menuItem} ${styles.danger}`}
            onClick={() => handleAction(onReport)}
          >
            <span className={styles.icon}>⚠️</span>
            <span>Báo cáo</span>
          </button>
        )}
      </div>
    </div>
  );
}
