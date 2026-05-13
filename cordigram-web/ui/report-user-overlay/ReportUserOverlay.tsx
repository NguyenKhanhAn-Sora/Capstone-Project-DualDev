"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { reportUser } from "@/lib/api";
import { getStoredAccessToken } from "@/lib/auth";
import styles from "./report-user-overlay.module.css";

type ReportCategoryKey = "abuse" | "violence" | "misinfo" | "spam" | "privacy" | "other";

type ReportCategory = {
  key: ReportCategoryKey;
  label: string;
  accent: string;
  reasons: Array<{ key: string; label: string }>;
};

const REPORT_GROUPS: ReportCategory[] = [
  {
    key: "abuse",
    label: "Harassment / Hate",
    accent: "#f59e0b",
    reasons: [
      { key: "harassment", label: "Harassment or bullying" },
      { key: "hate_speech", label: "Hate speech or slurs" },
      { key: "offensive_discrimination", label: "Offensive discrimination" },
    ],
  },
  {
    key: "violence",
    label: "Threats / Safety",
    accent: "#ef4444",
    reasons: [
      { key: "violence_threats", label: "Violence or physical threats" },
      { key: "graphic_violence", label: "Graphic violence" },
      { key: "self_harm", label: "Encouraging self-harm" },
      { key: "extremism", label: "Extremism or terrorism" },
    ],
  },
  {
    key: "misinfo",
    label: "Impersonation / Misleading",
    accent: "#22c55e",
    reasons: [
      { key: "impersonation", label: "Pretending to be someone else" },
      { key: "fake_news", label: "Fake news or misinformation" },
    ],
  },
  {
    key: "spam",
    label: "Spam / Scam",
    accent: "#14b8a6",
    reasons: [
      { key: "spam", label: "Spam or mass mentions" },
      { key: "financial_scam", label: "Scam or fraud" },
      { key: "unsolicited_ads", label: "Unwanted promotions" },
    ],
  },
  {
    key: "privacy",
    label: "Privacy violation",
    accent: "#06b6d4",
    reasons: [
      { key: "doxxing", label: "Sharing private information" },
      { key: "nonconsensual_intimate", label: "Non-consensual intimate content" },
    ],
  },
  {
    key: "other",
    label: "Other",
    accent: "#94a3b8",
    reasons: [{ key: "other", label: "Other reason" }],
  },
];

const ANIM_MS = 180;

type Props = {
  open: boolean;
  targetUserId?: string;
  targetHandle: string;
  onClose: () => void;
};

export default function ReportUserOverlay({ open, targetUserId, targetHandle, onClose }: Props) {
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

  const selectedGroup = useMemo(
    () => REPORT_GROUPS.find((g) => g.key === category),
    [category],
  );

  const handleSubmit = useCallback(async () => {
    if (!targetUserId || !category || !reason) return;
    const token = getStoredAccessToken();
    if (!token) { setError("Session expired. Please sign in again."); return; }
    setSubmitting(true);
    setError("");
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await reportUser({ token, userId: targetUserId, category: category as any, reason, note: note.trim() || undefined });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit report.");
    } finally {
      setSubmitting(false);
    }
  }, [targetUserId, category, reason, note]);

  if (!isVisible) return null;

  const displayHandle = targetHandle
    ? targetHandle.startsWith("@") ? targetHandle : `@${targetHandle}`
    : "";

  return (
    <div
      className={`${styles.overlay} ${isClosing ? styles.overlayClosing : styles.overlayVisible}`}
      role="dialog"
      aria-modal="true"
      aria-label="Report user"
      onClick={onClose}
    >
      <div
        className={`${styles.card} ${isClosing ? styles.cardClosing : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        {done ? (
          <div className={styles.doneWrap}>
            <h3 className={styles.title}>Report submitted</h3>
            <p className={styles.sub}>Thank you. We&apos;ll review this report and take appropriate action.</p>
            <div className={styles.actions}>
              <button type="button" className={styles.btnPrimary} onClick={onClose}>Close</button>
            </div>
          </div>
        ) : (
          <>
            <div className={styles.header}>
              <div className={styles.headerText}>
                <h3 className={styles.title}>Report this account</h3>
                <p className={styles.sub}>
                  Reporting {displayHandle}. Please choose the closest reason.
                </p>
              </div>
              <button type="button" className={styles.closeBtn} aria-label="Close" onClick={onClose}>
                <IconClose />
              </button>
            </div>

            <div className={styles.reportGrid}>
              <div className={styles.categoryGrid}>
                {REPORT_GROUPS.map((group) => {
                  const isActive = category === group.key;
                  return (
                    <button
                      key={group.key}
                      type="button"
                      className={`${styles.categoryCard} ${isActive ? styles.categoryCardActive : ""}`}
                      style={{
                        borderColor: isActive ? group.accent : undefined,
                        boxShadow: isActive ? `0 0 0 1px ${group.accent}` : undefined,
                      }}
                      onClick={() => {
                        setCategory(group.key);
                        setReason(group.reasons.length === 1 ? group.reasons[0].key : "");
                      }}
                    >
                      <span
                        className={styles.categoryDot}
                        style={{ background: group.accent }}
                        aria-hidden
                      />
                      <span>{group.label}</span>
                    </button>
                  );
                })}
              </div>

              <div className={styles.reasonPanel}>
                <div className={styles.reasonHeader}>Select a specific reason</div>
                {selectedGroup ? (
                  <div className={styles.reasonList}>
                    {selectedGroup.reasons.map((r) => {
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
                          <span>{r.label}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className={styles.reasonPlaceholder}>Pick a category first.</div>
                )}

                <label className={styles.noteLabel}>
                  Additional notes (optional)
                  <textarea
                    className={styles.noteInput}
                    placeholder="Add brief context if needed..."
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
                Cancel
              </button>
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={() => void handleSubmit()}
                disabled={!category || !reason || submitting}
              >
                {submitting ? "Submitting..." : "Submit report"}
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
