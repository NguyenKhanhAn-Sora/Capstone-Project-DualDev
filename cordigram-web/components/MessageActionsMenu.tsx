"use client";

import React, { useEffect, useRef } from "react";
import styles from "./MessageActionsMenu.module.css";

interface MessageActionsMenuProps {
  onRemove?: () => void;
  onForward?: () => void;
  onPin?: () => void;
  onReport?: () => void;
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
  onClose,
  position,
  isOwnMessage = false,
  isPinned = false,
}: MessageActionsMenuProps) {
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
