"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./DisplayNameStyleModal.module.css";

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
  onClose: () => void;
  onChange: (next: DisplayNameStyleValue) => void;
  onToast?: (message: string) => void;
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
  onClose,
  onChange,
  onToast,
}: Props) {
  const [draft, setDraft] = useState<DisplayNameStyleValue>(value || DEFAULT_VALUE);

  useEffect(() => {
    if (!open) return;
    setDraft(value || DEFAULT_VALUE);
  }, [open, value]);

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
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.card} onMouseDown={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div>
            <div className={styles.title}>Kiểu Tên Hiển Thị</div>
            {locked ? (
              <div className={styles.subTitle}>
                Bị khóa — bạn có thể dùng thử trong preview, nhưng không lưu thật.
              </div>
            ) : null}
          </div>
          <button type="button" className={styles.closeX} aria-label="Đóng" onClick={onClose}>
            ×
          </button>
        </div>

        <div className={styles.body}>
          <div className={styles.left}>
            <div className={styles.sectionLabel}>Font</div>
            <div className={styles.pills}>
              {([
                { id: "default", label: "Mặc định" },
                { id: "rounded", label: "Bo tròn" },
                { id: "mono", label: "Mono" },
              ] as const).map((it) => (
                <button
                  key={it.id}
                  type="button"
                  className={`${styles.pill} ${draft.fontId === it.id ? styles.pillActive : ""}`}
                  onClick={() => setDraft((p) => ({ ...p, fontId: it.id }))}
                >
                  {it.label}
                </button>
              ))}
            </div>

            <div className={styles.sectionLabel} style={{ marginTop: 14 }}>
              Hiệu ứng
            </div>
            <div className={styles.pills}>
              {([
                { id: "solid", label: "Đơn sắc" },
                { id: "gradient", label: "Chuyển màu" },
                { id: "neon", label: "Neon" },
              ] as const).map((it) => (
                <button
                  key={it.id}
                  type="button"
                  className={`${styles.pill} ${draft.effectId === it.id ? styles.pillActive : ""}`}
                  onClick={() => setDraft((p) => ({ ...p, effectId: it.id }))}
                >
                  {it.label}
                </button>
              ))}
            </div>

            <div className={styles.sectionLabel} style={{ marginTop: 14 }}>
              Màu
            </div>
            <div className={styles.colorGrid}>
              <label className={styles.colorRow}>
                <span className={styles.colorLabel}>Primary</span>
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
                <span className={styles.colorLabel}>Accent</span>
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
            <div className={styles.previewTitle}>Preview</div>
            <div className={styles.previewCard}>
              <div className={`${styles.previewName} ${fontPreviewClass}`} style={namePreviewStyle(draft)}>
                Cordigram
              </div>
              <div className={styles.previewSub}>@cordigram • they/them</div>
            </div>
          </div>
        </div>

        <div className={styles.footer}>
          <button type="button" className={styles.btnMuted} onClick={onClose}>
            Hủy
          </button>
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={() => {
              if (locked) {
                onToast?.("Cần Boost để lưu kiểu tên hiển thị.");
              }
              onChange(draft);
              onClose();
            }}
          >
            {locked ? "Dùng thử" : "Dùng"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

