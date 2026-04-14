"use client";

import React, { useState, useEffect } from "react";
import styles from "./DeleteServerModal.module.css";
import { useLanguage } from "@/component/language-provider";

export interface DeleteServerModalProps {
  isOpen: boolean;
  onClose: () => void;
  serverName: string;
  serverId: string;
  onConfirm: (serverId: string) => Promise<void>;
}

export default function DeleteServerModal({
  isOpen,
  onClose,
  serverName,
  serverId,
  onConfirm,
}: DeleteServerModalProps) {
  const { t } = useLanguage();
  const [confirmName, setConfirmName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canDelete = confirmName.trim() === serverName && !isSubmitting;

  useEffect(() => {
    if (isOpen) {
      setConfirmName("");
      setError(null);
    }
  }, [isOpen]);

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canDelete) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await onConfirm(serverId);
      onClose(); // Đóng modal sau khi xóa thành công (panel đã được parent đóng)
    } catch (err) {
      setError(err instanceof Error ? err.message : t("chat.popups.deleteServer.error"));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal aria-labelledby="delete-server-title">
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className={styles.closeBtn}
          onClick={onClose}
          aria-label={t("chat.popups.closeAria")}
        >
          ×
        </button>
        <h2 id="delete-server-title" className={styles.title}>
          {t("chat.popups.deleteServer.title", { serverName })}
        </h2>
        <p className={styles.message}>
          {t("chat.popups.deleteServer.message", { serverName })}
        </p>
        <form onSubmit={handleConfirm}>
          <label className={styles.label} htmlFor="delete-server-confirm-name">
            {t("chat.popups.deleteServer.confirmLabel")}
          </label>
          <input
            id="delete-server-confirm-name"
            type="text"
            className={styles.input}
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            placeholder={serverName}
            autoComplete="off"
            disabled={isSubmitting}
          />
          {error && <p className={styles.error}>{error}</p>}
          <div className={styles.footer}>
            <button type="button" className={styles.cancelBtn} onClick={onClose} disabled={isSubmitting}>
              {t("chat.common.cancel")}
            </button>
            <button type="submit" className={styles.deleteBtn} disabled={!canDelete}>
              {isSubmitting ? t("chat.popups.deleteServer.deleting") : t("chat.popups.deleteServer.deleteBtn")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
