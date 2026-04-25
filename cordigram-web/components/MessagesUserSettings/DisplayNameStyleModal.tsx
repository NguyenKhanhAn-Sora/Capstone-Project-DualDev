"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./DisplayNameStyleModal.module.css";
import { useLanguage } from "@/component/language-provider";

export type DisplayNameFontId = "default" | "rounded" | "mono";
export type DisplayNameEffectId = "solid" | "gradient" | "neon";

export type DisplayNameStyleValue = {
  fontId: DisplayNameFontId;
  effectId: DisplayNameEffectId;
  primaryHex: string;
  accentHex: string;
};

type Props = {
  open: boolean;
  locked: boolean;
  value: DisplayNameStyleValue;
  /** Giá trị đã lưu / trước khi mở modal — dùng khi Hủy để hoàn tác preview realtime. */
  revertValue: DisplayNameStyleValue;
  onClose: () => void;
  onChange: (next: DisplayNameStyleValue) => void;
  onToast?: (message: string) => void;
  /** Gọi khi draft đổi (debounce) để cập nhật DM/sidebar không cần lưu API. */
  onDraftPreview?: (next: DisplayNameStyleValue) => void;
};

const DEFAULT_VALUE: DisplayNameStyleValue = {
  fontId: "default",
  effectId: "solid",
  primaryHex: "#f2f3f5",
  accentHex: "#5865f2",
};

function clampHex(v: string) {
  const s = String(v || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
  return null;
}

function namePreviewStyle(v: DisplayNameStyleValue): React.CSSProperties {
  const primary = clampHex(v.primaryHex) ?? DEFAULT_VALUE.primaryHex;
  const accent = clampHex(v.accentHex) ?? DEFAULT_VALUE.accentHex;
  if (v.effectId === "gradient") {
    return {
      backgroundImage: `linear-gradient(0deg, ${primary}, ${accent})`,
      WebkitBackgroundClip: "text",
      backgroundClip: "text",
      color: "transparent",
    };
  }
  if (v.effectId === "neon") {
    return {
      color: primary,
      textShadow: `0 0 10px ${accent}, 0 0 18px ${accent}`,
    };
  }
  return { color: primary };
}

export default function DisplayNameStyleModal({
  open,
  locked,
  value,
  revertValue,
  onClose,
  onChange,
  onToast,
  onDraftPreview,
}: Props) {
  const { t } = useLanguage();
  const [draft, setDraft] = useState<DisplayNameStyleValue>(value || DEFAULT_VALUE);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(value || DEFAULT_VALUE);
  }, [open, value]);

  useEffect(() => {
    if (!open || !onDraftPreview) return;
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    previewTimerRef.current = setTimeout(() => {
      previewTimerRef.current = null;
      onDraftPreview(draft);
    }, 90);
    return () => {
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    };
  }, [draft, open, onDraftPreview]);

  const handleCancel = () => {
    onDraftPreview?.(revertValue);
    onClose();
  };

  const fontPreviewClass = useMemo(() => {
    if (draft.fontId === "mono") return styles.fontMono;
    if (draft.fontId === "rounded") return styles.fontRounded;
    return styles.fontDefault;
  }, [draft.fontId]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className={styles.backdrop}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) handleCancel();
      }}
    >
      <div className={styles.card} onMouseDown={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div>
            <div className={styles.title}>{t("chat.displayNameStyleModal.title")}</div>
            {locked ? (
              <div className={styles.subTitle}>
                {t("chat.displayNameStyleModal.subtitleLocked")}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className={styles.closeX}
            aria-label={t("chat.displayNameStyleModal.closeAria")}
            onClick={handleCancel}
          >
            ×
          </button>
        </div>

        <div className={styles.body}>
          <div className={styles.left}>
            <div className={styles.sectionLabel}>{t("chat.displayNameStyleModal.sectionFont")}</div>
            <div className={styles.pills}>
              {(
                [
                  { id: "default" as const, labelKey: "chat.displayNameStyleModal.fontDefault" },
                  { id: "rounded" as const, labelKey: "chat.displayNameStyleModal.fontRounded" },
                  { id: "mono" as const, labelKey: "chat.displayNameStyleModal.fontMono" },
                ] as const
              ).map((it) => (
                <button
                  key={it.id}
                  type="button"
                  className={`${styles.pill} ${draft.fontId === it.id ? styles.pillActive : ""}`}
                  onClick={() => setDraft((p) => ({ ...p, fontId: it.id }))}
                >
                  {t(it.labelKey)}
                </button>
              ))}
            </div>

            <div className={styles.sectionLabel} style={{ marginTop: 14 }}>
              {t("chat.displayNameStyleModal.sectionEffect")}
            </div>
            <div className={styles.pills}>
              {(
                [
                  { id: "solid" as const, labelKey: "chat.displayNameStyleModal.effectSolid" },
                  { id: "gradient" as const, labelKey: "chat.displayNameStyleModal.effectGradient" },
                  { id: "neon" as const, labelKey: "chat.displayNameStyleModal.effectNeon" },
                ] as const
              ).map((it) => (
                <button
                  key={it.id}
                  type="button"
                  className={`${styles.pill} ${draft.effectId === it.id ? styles.pillActive : ""}`}
                  onClick={() => setDraft((p) => ({ ...p, effectId: it.id }))}
                >
                  {t(it.labelKey)}
                </button>
              ))}
            </div>

            <div className={styles.sectionLabel} style={{ marginTop: 14 }}>
              {t("chat.displayNameStyleModal.sectionColor")}
            </div>
            <div className={styles.colorGrid}>
              <label className={styles.colorRow}>
                <span className={styles.colorLabel}>{t("chat.displayNameStyleModal.colorPrimary")}</span>
                <input
                  type="color"
                  className={styles.colorInput}
                  value={clampHex(draft.primaryHex) ?? DEFAULT_VALUE.primaryHex}
                  onChange={(e) => setDraft((p) => ({ ...p, primaryHex: e.target.value }))}
                />
                <input
                  type="text"
                  className={styles.hexInput}
                  value={draft.primaryHex}
                  onChange={(e) => setDraft((p) => ({ ...p, primaryHex: e.target.value }))}
                />
              </label>
              <label className={styles.colorRow}>
                <span className={styles.colorLabel}>{t("chat.displayNameStyleModal.colorAccent")}</span>
                <input
                  type="color"
                  className={styles.colorInput}
                  value={clampHex(draft.accentHex) ?? DEFAULT_VALUE.accentHex}
                  onChange={(e) => setDraft((p) => ({ ...p, accentHex: e.target.value }))}
                />
                <input
                  type="text"
                  className={styles.hexInput}
                  value={draft.accentHex}
                  onChange={(e) => setDraft((p) => ({ ...p, accentHex: e.target.value }))}
                />
              </label>
            </div>
          </div>

          <div className={styles.right}>
            <div className={styles.previewTitle}>{t("chat.displayNameStyleModal.previewTitle")}</div>
            <div className={styles.previewCard}>
              <div className={`${styles.previewName} ${fontPreviewClass}`} style={namePreviewStyle(draft)}>
                Cordigram
              </div>
              <div className={styles.previewSub}>{t("chat.displayNameStyleModal.previewSub")}</div>
            </div>
          </div>
        </div>

        <div className={styles.footer}>
          <button type="button" className={styles.btnMuted} onClick={handleCancel}>
            {t("chat.displayNameStyleModal.cancel")}
          </button>
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={() => {
              if (locked) {
                onToast?.(t("chat.displayNameStyleModal.toastNeedBoost"));
              }
              onChange(draft);
              onClose();
            }}
          >
            {locked ? t("chat.displayNameStyleModal.applyTry") : t("chat.displayNameStyleModal.apply")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
