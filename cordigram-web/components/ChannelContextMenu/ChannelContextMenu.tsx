"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CategoryNotifyMode, ChannelNotifyMode, NotifyLevel } from "@/lib/sidebar-prefs";
import { notifyLabelChannel } from "@/lib/sidebar-prefs";
import styles from "./ChannelContextMenu.module.css";

export type MuteDurationKey = "15m" | "1h" | "3h" | "8h" | "24h" | "until";

const MUTE_OPTIONS: { key: MuteDurationKey; label: string }[] = [
  { key: "15m", label: "Trong vòng 15 Phút" },
  { key: "1h", label: "Trong vòng 1 Giờ" },
  { key: "3h", label: "Trong vòng 3 Giờ" },
  { key: "8h", label: "Trong vòng 8 Giờ" },
  { key: "24h", label: "Trong vòng 24 Giờ" },
  { key: "until", label: "Cho đến khi bật lại" },
];

export interface ChannelContextMenuProps {
  x: number;
  y: number;
  /** null = không thuộc danh mục tùy chỉnh */
  categoryId: string | null;
  channel: { _id: string; name: string; isDefault?: boolean };
  canManageChannelsStructure: boolean;
  serverNotificationLevel: NotifyLevel;
  categoryNotifyMode: CategoryNotifyMode;
  channelNotifyMode: ChannelNotifyMode;
  channelMuted: boolean;
  isMemberOfServer: boolean;
  onClose: () => void;
  onInviteToChannel: () => void | Promise<void>;
  onCopyChannelLink: () => void;
  onMarkAsRead: () => void | Promise<void>;
  onMuteChannel: (duration: MuteDurationKey) => void;
  onUnmuteChannel: () => void;
  onSetChannelNotify: (mode: ChannelNotifyMode) => void;
  onEditChannel: (channelId: string, newName: string) => Promise<void>;
  onDeleteChannel: (channelId: string) => Promise<void>;
  /** Khi chưa là thành viên server (hiếm trên sidebar) */
  onJoinServerThenOpenChannel?: () => Promise<void>;
}

export default function ChannelContextMenu({
  x,
  y,
  channel,
  categoryId,
  canManageChannelsStructure,
  serverNotificationLevel,
  categoryNotifyMode,
  channelNotifyMode,
  channelMuted,
  isMemberOfServer,
  onClose,
  onInviteToChannel,
  onCopyChannelLink,
  onMarkAsRead,
  onMuteChannel,
  onUnmuteChannel,
  onSetChannelNotify,
  onEditChannel,
  onDeleteChannel,
  onJoinServerThenOpenChannel,
}: ChannelContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [submenu, setSubmenu] = useState<"mute" | "notify" | null>(null);
  const [submenuPos, setSubmenuPos] = useState({ left: 0, top: 0 });
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [editName, setEditName] = useState(channel.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  const notifySubLabel = notifyLabelChannel(
    channelNotifyMode,
    categoryNotifyMode,
    serverNotificationLevel,
  );

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t)) return;
      if (dialogRef.current?.contains(t)) return;
      const sub = document.querySelector("[data-channel-context-submenu]");
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

  useEffect(() => {
    if (showEdit && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [showEdit]);

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

  const handleInvite = async () => {
    if (isMemberOfServer) {
      await onInviteToChannel();
      onClose();
      return;
    }
    if (
      typeof window !== "undefined" &&
      window.confirm("Bạn chưa tham gia máy chủ này. Tham gia ngay để vào kênh?")
    ) {
      try {
        await onJoinServerThenOpenChannel?.();
        await onInviteToChannel();
      } catch (e) {
        alert((e as Error)?.message || "Không thể tham gia máy chủ");
      }
    }
    onClose();
  };

  const handleCopyLink = async () => {
    if (!isMemberOfServer) {
      if (
        typeof window !== "undefined" &&
        window.confirm("Bạn chưa tham gia máy chủ. Tham gia trước khi dùng link đầy đủ?")
      ) {
        try {
          await onJoinServerThenOpenChannel?.();
        } catch (e) {
          alert((e as Error)?.message || "Không thể tham gia");
        }
      }
    }
    onCopyChannelLink();
    onClose();
  };

  const handleEdit = async () => {
    const trimmed = editName.trim();
    if (!trimmed || trimmed === channel.name) {
      setShowEdit(false);
      onClose();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onEditChannel(channel._id, trimmed);
      setShowEdit(false);
      onClose();
    } catch (err) {
      setError((err as Error)?.message || "Không sửa được tên kênh");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    setError(null);
    try {
      await onDeleteChannel(channel._id);
      setShowDelete(false);
      onClose();
    } catch (err) {
      setError((err as Error)?.message || "Không xóa được kênh");
    } finally {
      setSaving(false);
    }
  };

  if (showEdit) {
    return (
      <div className={styles.editOverlay} onClick={() => { setShowEdit(false); onClose(); }}>
        <div ref={dialogRef} className={styles.editBox} onClick={(e) => e.stopPropagation()}>
          <h3 className={styles.editTitle}>Chỉnh sửa kênh</h3>
          <input
            ref={editInputRef}
            type="text"
            className={styles.editInput}
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleEdit();
              if (e.key === "Escape") { setShowEdit(false); onClose(); }
            }}
            maxLength={100}
          />
          {error && <p className={styles.errorMsg}>{error}</p>}
          <div className={styles.editActions}>
            <button type="button" className={styles.editCancelBtn} onClick={() => { setShowEdit(false); onClose(); }}>
              Hủy
            </button>
            <button
              type="button"
              className={styles.editSaveBtn}
              disabled={saving || !editName.trim() || editName.trim() === channel.name}
              onClick={handleEdit}
            >
              {saving ? "Đang lưu..." : "Lưu"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (showDelete) {
    return (
      <div className={styles.confirmOverlay} onClick={() => { setShowDelete(false); onClose(); }}>
        <div ref={dialogRef} className={styles.confirmBox} onClick={(e) => e.stopPropagation()}>
          <h3 className={styles.confirmTitle}>Xóa kênh</h3>
          <p className={styles.confirmDesc}>
            Bạn có chắc chắn muốn xóa kênh <strong>#{channel.name}</strong>? Hành động này không thể hoàn tác và tất cả tin nhắn trong kênh sẽ bị mất.
          </p>
          {error && <p className={styles.errorMsg}>{error}</p>}
          <div className={styles.confirmActions}>
            <button type="button" className={styles.confirmCancelBtn} onClick={() => { setShowDelete(false); onClose(); }}>
              Hủy
            </button>
            <button type="button" className={styles.confirmDeleteBtn} disabled={saving} onClick={handleDelete}>
              {saving ? "Đang xóa..." : "Xóa kênh"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={styles.overlay} onClick={onClose} aria-hidden />
      <div
        ref={menuRef}
        className={styles.menu}
        style={{ left: x, top: y }}
        role="menu"
        aria-label="Menu kênh"
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
        <div className={styles.divider} />

        <button
          type="button"
          className={styles.menuItem}
          onClick={() => {
            setSubmenu(null);
            void handleInvite();
          }}
          role="menuitem"
        >
          Mời vào kênh
        </button>
        <button
          type="button"
          className={styles.menuItem}
          onClick={() => {
            setSubmenu(null);
            handleCopyLink();
          }}
          role="menuitem"
        >
          Sao Chép Link
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
          <span>Tắt Âm Kênh</span>
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
                setEditName(channel.name);
                setError(null);
                setShowEdit(true);
              }}
              role="menuitem"
            >
              <svg className={styles.menuIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              Chỉnh sửa kênh
            </button>

            {channel.isDefault ? (
              <div className={`${styles.menuItem} ${styles.menuItemDisabled}`} title="Không thể xóa kênh mặc định">
                <svg className={styles.menuIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  <path d="M10 11v6M14 11v6" />
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                </svg>
                <span>Xóa kênh</span>
                <span className={styles.menuItemNote}>(mặc định)</span>
              </div>
            ) : (
              <button
                type="button"
                className={`${styles.menuItem} ${styles.menuItemDanger}`}
                onClick={() => {
                  setSubmenu(null);
                  setError(null);
                  setShowDelete(true);
                }}
                role="menuitem"
              >
                <svg className={styles.menuIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  <path d="M10 11v6M14 11v6" />
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                </svg>
                Xóa kênh
              </button>
            )}
          </>
        )}
      </div>

      {submenu === "mute" && (
        <div
          ref={submenuRef}
          data-channel-context-submenu
          className={styles.submenu}
          style={{ left: submenuPos.left, top: submenuPos.top }}
          role="menu"
        >
          {channelMuted ? (
            <button
              type="button"
              className={styles.submenuItem}
              onClick={() => {
                onUnmuteChannel();
                onClose();
              }}
              role="menuitem"
            >
              Bỏ tắt âm kênh
            </button>
          ) : (
            MUTE_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                className={styles.submenuItem}
                onClick={() => {
                  onMuteChannel(opt.key);
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
          data-channel-context-submenu
          className={styles.submenu}
          style={{ left: submenuPos.left, top: submenuPos.top }}
          role="menu"
        >
          <button
            type="button"
            className={`${styles.submenuItem} ${channelNotifyMode === "inherit_category" ? styles.selected : ""}`}
            onClick={() => {
              onSetChannelNotify("inherit_category");
              onClose();
            }}
            role="menuitem"
          >
            <span className={styles.radio} />
            <span className={styles.submenuStack}>
              <span>Mặc định cho danh mục</span>
              <span className={styles.subLabel}>
                {categoryId
                  ? notifyLabelChannel("inherit_category", categoryNotifyMode, serverNotificationLevel)
                  : notifyLabelChannel("inherit_category", "inherit_server", serverNotificationLevel)}
              </span>
            </span>
          </button>
          <button
            type="button"
            className={`${styles.submenuItem} ${channelNotifyMode === "all" ? styles.selected : ""}`}
            onClick={() => {
              onSetChannelNotify("all");
              onClose();
            }}
            role="menuitem"
          >
            <span className={styles.radio} />
            Tất cả các tin nhắn
          </button>
          <button
            type="button"
            className={`${styles.submenuItem} ${channelNotifyMode === "mentions" ? styles.selected : ""}`}
            onClick={() => {
              onSetChannelNotify("mentions");
              onClose();
            }}
            role="menuitem"
          >
            <span className={styles.radio} />
            Chỉ @mentions
          </button>
          <button
            type="button"
            className={`${styles.submenuItem} ${channelNotifyMode === "none" ? styles.selected : ""}`}
            onClick={() => {
              onSetChannelNotify("none");
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
