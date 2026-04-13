"use client";

import React, { useEffect, useState } from "react";
import styles from "./IgnoreUserPopup.module.css";
import { checkIgnoreStatus, unignoreUser } from "@/lib/api";
import { useLanguage } from "@/component/language-provider";

export interface IgnoreUserPopupProps {
  displayName: string;
  /** Nếu có: kiểm tra đã bỏ qua chưa và hiện chế độ Khôi phục khi đã bỏ qua. */
  userId?: string;
  token?: string;
  onClose: () => void;
  onConfirm: (options: { hideProfile: boolean; muteNotifications: boolean }) => void;
  onBlock: () => void;
  /** Gọi sau khi khôi phục (unignore) thành công. */
  onRestore?: () => void;
}

export default function IgnoreUserPopup({
  displayName,
  userId,
  token,
  onClose,
  onConfirm,
  onBlock,
  onRestore,
}: IgnoreUserPopupProps) {
  const { t } = useLanguage();
  const [hideProfile, setHideProfile] = useState(true);
  const [muteNotifications, setMuteNotifications] = useState(true);
  const [alreadyIgnored, setAlreadyIgnored] = useState<boolean | null>(null);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    if (!userId || !token) {
      setAlreadyIgnored(false);
      return;
    }
    let cancelled = false;
    checkIgnoreStatus({ token, targetUserId: userId })
      .then((res) => { if (!cancelled) setAlreadyIgnored(res.isIgnored); })
      .catch(() => { if (!cancelled) setAlreadyIgnored(false); });
    return () => { cancelled = true; };
  }, [userId, token]);

  const handleRestore = async () => {
    if (!token || !userId) return;
    setRestoring(true);
    try {
      await unignoreUser({ token, userId });
      onRestore?.();
      onClose();
    } catch (err) {
      console.error("Unignore failed", err);
    } finally {
      setRestoring(false);
    }
  };

  if (alreadyIgnored === null && userId && token) {
    return (
      <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal aria-label={t("chat.popups.ignoreUser.ariaIgnore")}>
        <div className={styles.popup} onClick={(e) => e.stopPropagation()}>
          <div className={styles.loading}>{t("chat.popups.loading")}</div>
        </div>
      </div>
    );
  }

  if (alreadyIgnored === true) {
    return (
      <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal aria-label={t("chat.popups.ignoreUser.ariaIgnored")}>
        <div className={styles.popup} onClick={(e) => e.stopPropagation()}>
          <div className={styles.iconWrap}>
            <svg className={styles.icon} width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M4.93 4.93l14.14 14.14" />
            </svg>
          </div>
          <h2 className={styles.title}>{t("chat.popups.ignoreUser.titleIgnored", { name: displayName })}</h2>
          <p className={styles.subtitle}>
            {t("chat.popups.ignoreUser.subtitleIgnored")}
          </p>
          <div className={styles.footer}>
            <button type="button" className={styles.btnCancel} onClick={onClose}>
              {t("chat.common.cancel")}
            </button>
            <button
              type="button"
              className={styles.btnIgnore}
              onClick={handleRestore}
              disabled={restoring}
            >
              {restoring ? t("chat.popups.ignoreUser.restoring") : t("chat.popups.ignoreUser.restore")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal aria-label={t("chat.popups.ignoreUser.ariaIgnore")}>
      <div className={styles.popup} onClick={(e) => e.stopPropagation()}>
        <div className={styles.iconWrap}>
          <svg className={styles.icon} width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M4.93 4.93l14.14 14.14" />
          </svg>
        </div>
        <h2 className={styles.title}>{t("chat.popups.ignoreUser.title", { name: displayName })}</h2>
        <p className={styles.subtitle}>{t("chat.popups.ignoreUser.subtitle")}</p>

        <label className={styles.checkRow}>
          <input
            type="checkbox"
            checked={hideProfile}
            onChange={(e) => setHideProfile(e.target.checked)}
          />
          <span className={styles.checkLabel}>{t("chat.popups.ignoreUser.hideProfile")}</span>
        </label>
        <p className={styles.checkDesc}>{t("chat.popups.ignoreUser.hideProfileDesc")}</p>

        <label className={styles.checkRow}>
          <input
            type="checkbox"
            checked={muteNotifications}
            onChange={(e) => setMuteNotifications(e.target.checked)}
          />
          <span className={styles.checkLabel}>{t("chat.popups.ignoreUser.muteNotif")}</span>
        </label>
        <p className={styles.checkDesc}>{t("chat.popups.ignoreUser.muteNotifDesc")}</p>

        <p className={styles.info}>
          <span className={styles.infoIcon} aria-hidden>ℹ</span>
          {t("chat.popups.ignoreUser.info")}
        </p>

        <div className={styles.blockSection}>
          <p className={styles.blockTitle}>{t("chat.popups.ignoreUser.blockTitle")}</p>
          <div className={styles.blockBox}>
            <p className={styles.blockText}>{t("chat.popups.ignoreUser.blockText")}</p>
            <p className={styles.blockDesc}>{t("chat.popups.ignoreUser.blockDesc")}</p>
            <button type="button" className={styles.blockBtn} onClick={onBlock}>
              {t("chat.popups.ignoreUser.block")}
            </button>
          </div>
        </div>

        <div className={styles.footer}>
          <button type="button" className={styles.btnCancel} onClick={onClose}>
            {t("chat.common.cancel")}
          </button>
          <button
            type="button"
            className={styles.btnIgnore}
            onClick={() => onConfirm({ hideProfile, muteNotifications })}
          >
            {t("chat.popups.ignoreUser.ignore")}
          </button>
        </div>
      </div>
    </div>
  );
}
