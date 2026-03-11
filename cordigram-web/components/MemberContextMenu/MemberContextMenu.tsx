"use client";

import React, { useEffect, useRef } from "react";
import styles from "./MemberContextMenu.module.css";
import type { ServerMemberRow } from "@/lib/servers-api";

export interface MemberContextMenuProps {
  x: number;
  y: number;
  member: ServerMemberRow;
  isServerOwner: boolean;
  onClose: () => void;
  onProfile: () => void;
  onMessage: () => void;
  onNickname: () => void;
  onIgnore: () => void;
  onBlock: () => void;
  onModView?: () => void;
  onRestrict?: () => void;
  onKick?: () => void;
  onBan?: () => void;
  onTransferOwnership?: () => void;
}

export default function MemberContextMenu({
  x,
  y,
  member,
  isServerOwner,
  onClose,
  onProfile,
  onMessage,
  onNickname,
  onIgnore,
  onBlock,
  onModView,
  onRestrict,
  onKick,
  onBan,
  onTransferOwnership,
}: MemberContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  return (
    <>
      <div className={styles.overlay} onClick={onClose} aria-hidden />
      <div
        ref={menuRef}
        className={styles.menu}
        style={{ left: x, top: y }}
        role="menu"
        aria-label="Menu thành viên"
      >
        <button type="button" className={styles.menuItem} onClick={onProfile} role="menuitem">
          Hồ sơ
        </button>
        <button type="button" className={styles.menuItem} onClick={onMessage} role="menuitem">
          Nhắn tin
        </button>
        <div className={styles.divider} />
        <button type="button" className={styles.menuItem} onClick={onNickname} role="menuitem">
          Đổi Biệt Danh
        </button>
        <button type="button" className={styles.menuItem} onClick={onIgnore} role="menuitem">
          Bỏ qua
        </button>
        <button type="button" className={`${styles.menuItem} ${styles.danger}`} onClick={onBlock} role="menuitem">
          Chặn
        </button>

        {isServerOwner && (
          <>
            <div className={styles.divider} />
            {onModView && (
              <button type="button" className={styles.menuItem} onClick={onModView} role="menuitem">
                Mở trong Chế Độ Hiển Thị Mod
              </button>
            )}
            {onRestrict && (
              <button type="button" className={`${styles.menuItem} ${styles.danger}`} onClick={onRestrict} role="menuitem">
                Hạn chế {member.username}
              </button>
            )}
            {onKick && (
              <button type="button" className={`${styles.menuItem} ${styles.danger}`} onClick={onKick} role="menuitem">
                Đuổi {member.username}
              </button>
            )}
            {onBan && (
              <button type="button" className={`${styles.menuItem} ${styles.danger}`} onClick={onBan} role="menuitem">
                Cấm {member.username}
              </button>
            )}
            <div className={styles.divider} />
            {onTransferOwnership && (
              <button type="button" className={`${styles.menuItem} ${styles.danger}`} onClick={onTransferOwnership} role="menuitem">
                Chuyển Quyền Sở Hữu
              </button>
            )}
          </>
        )}
      </div>
    </>
  );
}
