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
  theme?: string;
};

export default function ProfileImagePickerModal({
  open,
  mode,
  recentAvatarUrls,
  onClose,
  onPickFile,
  onPickRecentAvatar,
  theme,
}: Props) {
  const { t } = useLanguage();
  const uploadRef = useRef<HTMLInputElement>(null);

  if (!open || typeof document === "undefined") return null;

  const title =
    mode === "banner"
      ? t("chat.profileImagePicker.titleBanner")
      : t("chat.profileImagePicker.titleAvatar");

  return createPortal(
    <div
      className={styles.overlay}
      role="presentation"
      data-messages-theme={theme ?? "dark"}
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
        {/* ── Header ── */}
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
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div className={styles.body}>
          {/* hidden file input */}
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

          {/* ── Upload card ── */}
          <div className={styles.grid}>
            <button
              type="button"
              className={styles.pickCard}
              onClick={() => uploadRef.current?.click()}
            >
              <div className={styles.pickIconWrap} aria-hidden>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="16 16 12 12 8 16" />
                  <line x1="12" y1="12" x2="12" y2="21" />
                  <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
                </svg>
              </div>
              <span className={styles.pickLabel}>
                {t("chat.profileImagePicker.uploadImage")}
              </span>
              <span className={styles.pickSub}>
                {t("chat.profileImagePicker.uploadSub") || "PNG, JPG, GIF · tối đa 8 MB"}
              </span>
            </button>
          </div>

          {/* ── Recent avatars ── */}
          {mode === "avatar" ? (
            <div className={styles.section}>
              <div className={styles.sectionHeader}>
                <h3 className={styles.sectionTitle}>
                  {t("chat.profileImagePicker.recentTitle")}
                </h3>
                <span className={styles.sectionLine} aria-hidden />
              </div>
              <p className={styles.sectionHint}>
                {t("chat.profileImagePicker.recentHint")}
              </p>
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
                      aria-label={
                        url
                          ? t("chat.profileImagePicker.selectRecentAria")
                          : t("chat.profileImagePicker.emptySlotAria")
                      }
                    >
                      {url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={url} alt="" />
                      ) : (
                        <span className={styles.recentEmpty}>
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                            <circle cx="12" cy="7" r="4" />
                          </svg>
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
