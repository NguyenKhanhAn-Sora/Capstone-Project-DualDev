"use client";

import styles from "./report-overlay.module.css";

export type ReportGroup = {
  key: string;
  label: string;
  accent: string;
  reasons: Array<{ key: string; label: string }>;
};

type Props = {
  open: boolean;
  closing: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  groups: ReportGroup[];
  category: string | null;
  reason: string | null;
  note: string;
  submitting: boolean;
  error?: string;
  onSelectCategory: (key: string) => void;
  onSelectReason: (key: string) => void;
  onNoteChange: (value: string) => void;
  onSubmit: () => void;
  labelCancel?: string;
  labelSubmit?: string;
  labelSubmitting?: string;
  labelSelectReason?: string;
  labelPickCategory?: string;
  labelNotes?: string;
  labelNotesPlaceholder?: string;
};

export default function ReportOverlay({
  open,
  closing,
  onClose,
  title = "Report this post",
  subtitle,
  groups,
  category,
  reason,
  note,
  submitting,
  error,
  onSelectCategory,
  onSelectReason,
  onNoteChange,
  onSubmit,
  labelCancel = "Cancel",
  labelSubmit = "Submit report",
  labelSubmitting = "Submitting...",
  labelSelectReason = "Select a specific reason",
  labelPickCategory = "Pick a category first.",
  labelNotes = "Additional notes (optional)",
  labelNotesPlaceholder = "Add brief context if needed...",
}: Props) {
  if (!open) return null;

  const selectedGroup = groups.find((g) => g.key === category) ?? null;
  const step = category ? "reasons" : "categories";

  return (
    <div
      className={`${styles.backdrop} ${closing ? styles.backdropClosing : styles.backdropOpen}`}
      role="dialog"
      aria-modal="true"
      onClick={(e) => { e.stopPropagation(); onClose(); }}
    >
      <div
        className={`${styles.card} ${closing ? styles.cardClosing : styles.cardOpen}`}
        data-step={step}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          {category ? (
            <button
              className={styles.backBtn}
              aria-label="Back"
              onClick={() => { onSelectCategory(""); onSelectReason(""); }}
            >
              <svg aria-hidden width={16} height={16} viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Back
            </button>
          ) : null}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 className={styles.title}>{title}</h3>
            {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
          </div>
          <button className={styles.closeBtn} aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className={styles.grid}>
          {/* Category list */}
          <div className={styles.categoryList}>
            {groups.map((group) => {
              const isActive = category === group.key;
              return (
                <button
                  key={group.key}
                  className={`${styles.categoryBtn} ${isActive ? styles.categoryBtnActive : ""}`}
                  onClick={() => {
                    onSelectCategory(group.key);
                    onSelectReason(group.reasons.length === 1 ? group.reasons[0].key : "");
                  }}
                >
                  <span className={styles.categoryDot} style={{ background: group.accent }} />
                  <span>{group.label}</span>
                </button>
              );
            })}
          </div>

          {/* Reason panel */}
          <div className={styles.reasonPanel}>
            <div className={styles.reasonHeader}>{labelSelectReason}</div>

            {selectedGroup ? (
              <div className={styles.reasonList}>
                {selectedGroup.reasons.map((r) => {
                  const checked = reason === r.key;
                  return (
                    <button
                      key={r.key}
                      className={`${styles.reasonBtn} ${checked ? styles.reasonBtnActive : ""}`}
                      onClick={() => onSelectReason(r.key)}
                    >
                      <span className={styles.reasonRadio} aria-checked={checked}>
                        {checked ? <span className={styles.reasonDot} /> : null}
                      </span>
                      <span>{r.label}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className={styles.reasonPlaceholder}>{labelPickCategory}</div>
            )}

            <label className={styles.noteLabel}>
              {labelNotes}
              <textarea
                className={styles.noteInput}
                placeholder={labelNotesPlaceholder}
                value={note}
                onChange={(e) => onNoteChange(e.target.value)}
                maxLength={500}
              />
            </label>

            {error ? <div className={styles.inlineError}>{error}</div> : null}
          </div>
        </div>

        <div className={styles.actions}>
          <button className={styles.btnSecondary} onClick={onClose} disabled={submitting}>
            {labelCancel}
          </button>
          <button
            className={styles.btnPrimary}
            onClick={onSubmit}
            disabled={!reason || submitting}
          >
            {submitting ? labelSubmitting : labelSubmit}
          </button>
        </div>
      </div>
    </div>
  );
}
