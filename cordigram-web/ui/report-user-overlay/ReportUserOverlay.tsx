"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { reportUser } from "@/lib/api";
import { getStoredAccessToken } from "@/lib/auth";
import styles from "./report-user-overlay.module.css";

type ReportCategoryKey = "abuse" | "violence" | "misinfo" | "spam" | "privacy" | "other";

const REASON_KEYS: Record<ReportCategoryKey, Array<{ key: string; accent: string }>> = {
  abuse: [
    { key: "harassment", accent: "#f59e0b" },
    { key: "hate_speech", accent: "#f59e0b" },
    { key: "offensive_discrimination", accent: "#f59e0b" },
  ],
  violence: [
    { key: "violence_threats", accent: "#ef4444" },
    { key: "graphic_violence", accent: "#ef4444" },
    { key: "self_harm", accent: "#ef4444" },
    { key: "extremism", accent: "#ef4444" },
  ],
  misinfo: [
    { key: "impersonation", accent: "#22c55e" },
    { key: "fake_news", accent: "#22c55e" },
  ],
  spam: [
    { key: "spam", accent: "#14b8a6" },
    { key: "financial_scam", accent: "#14b8a6" },
    { key: "unsolicited_ads", accent: "#14b8a6" },
  ],
  privacy: [
    { key: "doxxing", accent: "#06b6d4" },
    { key: "nonconsensual_intimate", accent: "#06b6d4" },
  ],
  other: [{ key: "other", accent: "#94a3b8" }],
};

const CATEGORY_ACCENTS: Record<ReportCategoryKey, string> = {
  abuse: "#f59e0b",
  violence: "#ef4444",
  misinfo: "#22c55e",
  spam: "#14b8a6",
  privacy: "#06b6d4",
  other: "#94a3b8",
};

const CATEGORY_KEYS: ReportCategoryKey[] = ["abuse", "violence", "misinfo", "spam", "privacy", "other"];

const ANIM_MS = 180;

type Props = {
  open: boolean;
  targetUserId?: string;
  targetHandle: string;
  onClose: () => void;
};

export default function ReportUserOverlay({ open, targetUserId, targetHandle, onClose }: Props) {
  const t = useTranslations("reportUser");
  const [isVisible, setIsVisible] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const visTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [category, setCategory] = useState<ReportCategoryKey | "">("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (open) {
      if (visTimer.current) clearTimeout(visTimer.current);
      setIsVisible(true);
      setIsClosing(false);
      setCategory("");
      setReason("");
      setNote("");
      setError("");
      setDone(false);
      setSubmitting(false);
    } else if (isVisible) {
      setIsClosing(true);
      visTimer.current = setTimeout(() => {
        setIsVisible(false);
        setIsClosing(false);
      }, ANIM_MS);
    }
    return () => {
      if (visTimer.current) clearTimeout(visTimer.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!isVisible) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isVisible, onClose]);

  const selectedReasons = useMemo(
    () => (category ? REASON_KEYS[category] : null),
    [category],
  );

  const handleSubmit = useCallback(async () => {
    if (!targetUserId || !category || !reason) return;
    const token = getStoredAccessToken();
    if (!token) { setError(t("sessionExpired")); return; }
    setSubmitting(true);
    setError("");
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await reportUser({ token, userId: targetUserId, category: category as any, reason, note: note.trim() || undefined });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errorFallback"));
    } finally {
      setSubmitting(false);
    }
  }, [targetUserId, category, reason, note, t]);

  if (!isVisible) return null;

  const displayHandle = targetHandle
    ? targetHandle.startsWith("@") ? targetHandle : `@${targetHandle}`
    : "";

  return (
    <div
      className={`${styles.overlay} ${isClosing ? styles.overlayClosing : styles.overlayVisible}`}
      role="dialog"
      aria-modal="true"
      aria-label={t("ariaLabel")}
      onClick={onClose}
    >
      <div
        className={`${styles.card} ${isClosing ? styles.cardClosing : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        {done ? (
          <div className={styles.doneWrap}>
            <h3 className={styles.title}>{t("doneTitle")}</h3>
            <p className={styles.sub}>{t("doneText")}</p>
            <div className={styles.actions}>
              <button type="button" className={styles.btnPrimary} onClick={onClose}>
                {t("close")}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className={styles.header}>
              <div className={styles.headerText}>
                <h3 className={styles.title}>{t("title")}</h3>
                <p className={styles.sub}>{t("subtitle", { handle: displayHandle })}</p>
              </div>
              <button type="button" className={styles.closeBtn} aria-label={t("close")} onClick={onClose}>
                <IconClose />
              </button>
            </div>

            <div className={styles.reportGrid}>
              <div className={styles.categoryGrid}>
                {CATEGORY_KEYS.map((key) => {
                  const isActive = category === key;
                  const accent = CATEGORY_ACCENTS[key];
                  return (
                    <button
                      key={key}
                      type="button"
                      className={`${styles.categoryCard} ${isActive ? styles.categoryCardActive : ""}`}
                      style={{
                        borderColor: isActive ? accent : undefined,
                        boxShadow: isActive ? `0 0 0 1px ${accent}` : undefined,
                      }}
                      onClick={() => {
                        setCategory(key);
                        const reasons = REASON_KEYS[key];
                        setReason(reasons.length === 1 ? reasons[0].key : "");
                      }}
                    >
                      <span
                        className={styles.categoryDot}
                        style={{ background: accent }}
                        aria-hidden
                      />
                      <span>{t(`categories.${key}`)}</span>
                    </button>
                  );
                })}
              </div>

              <div className={styles.reasonPanel}>
                <div className={styles.reasonHeader}>{t("selectReason")}</div>
                {selectedReasons ? (
                  <div className={styles.reasonList}>
                    {selectedReasons.map((r) => {
                      const checked = reason === r.key;
                      return (
                        <button
                          key={r.key}
                          type="button"
                          className={`${styles.reasonRow} ${checked ? styles.reasonRowActive : ""}`}
                          onClick={() => setReason(r.key)}
                        >
                          <span className={styles.reasonRadio} aria-checked={checked}>
                            {checked ? <span className={styles.reasonRadioDot} /> : null}
                          </span>
                          <span>{t(`reasons.${r.key}`)}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className={styles.reasonPlaceholder}>{t("pickCategory")}</div>
                )}

                <label className={styles.noteLabel}>
                  {t("notesLabel")}
                  <textarea
                    className={styles.noteInput}
                    placeholder={t("notesPlaceholder")}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    maxLength={500}
                  />
                </label>
                {error ? <p className={styles.error}>{error}</p> : null}
              </div>
            </div>

            <div className={styles.actions}>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={onClose}
                disabled={submitting}
              >
                {t("cancel")}
              </button>
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={() => void handleSubmit()}
                disabled={!category || !reason || submitting}
              >
                {submitting ? t("submitting") : t("submit")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function IconClose() {
  return (
    <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path
        d="M6 6l12 12M18 6L6 18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
