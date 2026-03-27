"use client";

import React, { useEffect, useRef } from "react";
import styles from "./MemberContextMenu.module.css";
import type { ServerMemberRow } from "@/lib/servers-api";

/**
 * Props cho MemberContextMenu component
 * Hỗ trợ hiển thị moderation actions dựa trên permission
 */
export interface MemberContextMenuProps {
  x: number;
  y: number;
  member: ServerMemberRow;
  isServerOwner: boolean;
  /** Quyền kick members - true thì hiện nút Đuổi */
  canKick?: boolean;
  /** Quyền ban members - true thì hiện nút Cấm */
  canBan?: boolean;
  /** Quyền timeout members - true thì hiện nút Tạm khóa */
  canTimeout?: boolean;
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
  onTimeout?: () => void;
  onTransferOwnership?: () => void;
}

export default function MemberContextMenu({
  x,
  y,
  member,
  isServerOwner,
  canKick = false,
  canBan = false,
  canTimeout = false,
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
  onTimeout,
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

  // Kiểm tra có bất kỳ moderation action nào để hiển thị không
  const hasAnyModerationAction = canKick || canBan || canTimeout || onModView || onRestrict;

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
        {/* Basic actions */}
        <button type="button" className={styles.menuItem} onClick={onProfile} role="menuitem">
          Hồ sơ
        </button>
        <button type="button" className={styles.menuItem} onClick={onMessage} role="menuitem">
          Nhắn tin
        </button>
        <div className={styles.divider} />

        {/* User management */}
        <button type="button" className={styles.menuItem} onClick={onNickname} role="menuitem">
          Đổi Biệt Danh
        </button>
        <button type="button" className={styles.menuItem} onClick={onIgnore} role="menuitem">
          Bỏ qua
        </button>
        <button type="button" className={`${styles.menuItem} ${styles.danger}`} onClick={onBlock} role="menuitem">
          Chặn
        </button>

        {/* Moderation actions - hiển thị dựa trên permission, không chỉ isServerOwner */}
        {hasAnyModerationAction && (
          <>
            <div className={styles.divider} />
            
            {/* Mod View - chỉ owner */}
            {onModView && (
              <button type="button" className={styles.menuItem} onClick={onModView} role="menuitem">
                Mở trong Chế Độ Hiển Thị Mod
              </button>
            )}

            {/* Timeout - yêu cầu quyền timeoutMembers */}
            {canTimeout && onTimeout && (
              <button 
                type="button" 
                className={`${styles.menuItem} ${styles.warning}`} 
                onClick={onTimeout} 
                role="menuitem"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 8 }}>
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                Tạm khóa {member.username}
              </button>
            )}

            {/* Restrict */}
            {onRestrict && (
              <button type="button" className={`${styles.menuItem} ${styles.danger}`} onClick={onRestrict} role="menuitem">
                Hạn chế {member.username}
              </button>
            )}

            {/* Kick - yêu cầu quyền kickMembers */}
            {canKick && onKick && (
              <button type="button" className={`${styles.menuItem} ${styles.danger}`} onClick={onKick} role="menuitem">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 8 }}>
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                  <line x1="18" y1="9" x2="23" y2="14" />
                  <line x1="23" y1="9" x2="18" y2="14" />
                </svg>
                Đuổi {member.username}
              </button>
            )}

            {/* Ban - yêu cầu quyền banMembers */}
            {canBan && onBan && (
              <button type="button" className={`${styles.menuItem} ${styles.danger}`} onClick={onBan} role="menuitem">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 8 }}>
                  <circle cx="12" cy="12" r="10" />
                  <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                </svg>
                Cấm {member.username}
              </button>
            )}
          </>
        )}

        {/* Transfer ownership - chỉ owner */}
        {onTransferOwnership && (
          <>
            <div className={styles.divider} />
            <button type="button" className={`${styles.menuItem} ${styles.danger}`} onClick={onTransferOwnership} role="menuitem">
              Chuyển Quyền Sở Hữu
            </button>
          </>
        )}
      </div>
    </>
  );
}
