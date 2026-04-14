"use client";

import React, { useRef } from "react";
import { createPortal } from "react-dom";
import styles from "./ProfileImagePickerModal.module.css";
import { useLanguage } from "@/component/language-provider";

export type ProfileImagePickerMode = "avatar" | "banner";

type Props = {
  open: boolean;
  mode: ProfileImagePickerMode;
  recentAvatarUrls: string[];
  onClose: () => void;
  onPickFile: (file: File) => void;
  onPickRecentAvatar: (url: string) => void;
};

export default function ProfileImagePickerModal({
  open,
  mode,
  recentAvatarUrls,
  onClose,
  onPickFile,
  onPickRecentAvatar,
}: Props) {
  const { t } = useLanguage();
  const uploadRef = useRef<HTMLInputElement>(null);
  const gifRef = useRef<HTMLInputElement>(null);

  if (!open || typeof document === "undefined") return null;

  const title =
    mode === "banner" ? t("chat.profileImagePicker.titleBanner") : t("chat.profileImagePicker.titleAvatar");

  return createPortal(
    <div
      className={styles.overlay}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={styles.card}
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-img-picker-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <h2 id="profile-img-picker-title" className={styles.title}>
            {title}
          </h2>
          <button
            type="button"
            className={styles.close}
            aria-label={t("chat.profileImagePicker.closeAria")}
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <input
          ref={uploadRef}
          type="file"
          accept="image/*"
          className={styles.hiddenInput}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPickFile(f);
            e.target.value = "";
          }}
        />
        <input
          ref={gifRef}
          type="file"
          accept="image/gif,image/*"
          className={styles.hiddenInput}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPickFile(f);
            e.target.value = "";
          }}
        />
        <div className={styles.grid2}>
          <button
            type="button"
            className={styles.pickCard}
            onClick={() => uploadRef.current?.click()}
          >
            <span className={styles.pickIcon} aria-hidden>
              🖼+
            </span>
            {t("chat.profileImagePicker.uploadImage")}
          </button>
          <button
            type="button"
            className={`${styles.pickCard} ${styles.gifPreview}`}
            onClick={() => gifRef.current?.click()}
          >
            <span className={styles.gifBadge}>GIF</span>
            <span className={styles.pickIcon} aria-hidden>
              🎬
            </span>
            {t("chat.profileImagePicker.pickGif")}
          </button>
        </div>
        {mode === "avatar" ? (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>{t("chat.profileImagePicker.recentTitle")}</h3>
            <p className={styles.sectionHint}>{t("chat.profileImagePicker.recentHint")}</p>
            <div className={styles.recentRow}>
              {Array.from({ length: 6 }).map((_, i) => {
                const url = recentAvatarUrls[i];
                return (
                  <button
                    key={i}
                    type="button"
                    className={styles.recentSlot}
                    disabled={!url}
                    onClick={() => {
                      if (url) onPickRecentAvatar(url);
                    }}
                    aria-label={url ? t("chat.profileImagePicker.selectRecentAria") : t("chat.profileImagePicker.emptySlotAria")}
                  >
                    {url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={url} alt="" />
                    ) : (
                      <span className={styles.recentEmpty}>👤</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
