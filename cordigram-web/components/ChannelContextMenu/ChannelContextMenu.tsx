"use client";

import React, { useEffect, useRef, useState } from "react";
import styles from "./ChannelContextMenu.module.css";

export interface ChannelContextMenuProps {
  x: number;
  y: number;
  channel: { _id: string; name: string; isDefault?: boolean };
  onClose: () => void;
  onEditChannel: (channelId: string, newName: string) => Promise<void>;
  onDeleteChannel: (channelId: string) => Promise<void>;
}

export default function ChannelContextMenu({
  x,
  y,
  channel,
  onClose,
  onEditChannel,
  onDeleteChannel,
}: ChannelContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [editName, setEditName] = useState(channel.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
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
        <div className={styles.editBox} onClick={(e) => e.stopPropagation()}>
          <h3 className={styles.editTitle}>Sửa tên kênh</h3>
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
            <button
              type="button"
              className={styles.editCancelBtn}
              onClick={() => { setShowEdit(false); onClose(); }}
            >
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
        <div className={styles.confirmBox} onClick={(e) => e.stopPropagation()}>
          <h3 className={styles.confirmTitle}>Xóa kênh</h3>
          <p className={styles.confirmDesc}>
            Bạn có chắc chắn muốn xóa kênh <strong>#{channel.name}</strong>? Hành động này không thể hoàn tác và tất cả tin nhắn trong kênh sẽ bị mất.
          </p>
          {error && <p className={styles.errorMsg}>{error}</p>}
          <div className={styles.confirmActions}>
            <button
              type="button"
              className={styles.confirmCancelBtn}
              onClick={() => { setShowDelete(false); onClose(); }}
            >
              Hủy
            </button>
            <button
              type="button"
              className={styles.confirmDeleteBtn}
              disabled={saving}
              onClick={handleDelete}
            >
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
          onClick={() => {
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
          Sửa tên kênh
        </button>

        <div className={styles.divider} />

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
            onClick={() => { setError(null); setShowDelete(true); }}
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
      </div>
    </>
  );
}
