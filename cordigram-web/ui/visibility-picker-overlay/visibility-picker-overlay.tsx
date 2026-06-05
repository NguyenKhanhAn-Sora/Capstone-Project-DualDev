"use client";

import styles from "./visibility-picker-overlay.module.css";

export type VisibilityOption = {
  value: string;
  title: string;
  description?: string;
  icon?: string;
};

type Props = {
  open: boolean;
  closing?: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  options: VisibilityOption[];
  selected: string;
  onChange: (value: string) => void;
  onSave: () => void;
  submitting?: boolean;
  error?: string;
  labelSave?: string;
  labelSaving?: string;
  labelCancel?: string;
};

export default function VisibilityPickerOverlay({
  open,
  closing = false,
  onClose,
  title = "Edit visibility",
  subtitle = "Choose who can see this post.",
  options,
  selected,
  onChange,
  onSave,
  submitting = false,
  error,
  labelSave = "Update",
  labelSaving = "Updating...",
  labelCancel = "Cancel",
}: Props) {
  if (!open) return null;

  return (
    <div
      className={`${styles.backdrop} ${closing ? styles.backdropClosing : ""}`}
      role="dialog"
      aria-modal="true"
      onClick={(e) => { e.stopPropagation(); onClose(); }}
    >
      <div
        className={`${styles.card} ${closing ? styles.cardClosing : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <div>
            <h3 className={styles.title}>{title}</h3>
            {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
          </div>
          <button className={styles.closeBtn} aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className={styles.optionList}>
          {options.map((opt) => {
            const isActive = selected === opt.value;
            return (
              <button
                key={opt.value}
                className={`${styles.optionBtn} ${isActive ? styles.optionBtnActive : ""}`}
                onClick={() => onChange(opt.value)}
              >
                <span className={styles.radioRing} aria-checked={isActive}>
                  {isActive ? <span className={styles.radioDot} /> : null}
                </span>
                {opt.icon ? <span className={styles.optionIcon}>{opt.icon}</span> : null}
                <span className={styles.optionCopy}>
                  <span className={styles.optionTitle}>{opt.title}</span>
                  {opt.description ? (
                    <span className={styles.optionDesc}>{opt.description}</span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>

        {error ? <div className={styles.error}>{error}</div> : null}

        <div className={styles.actions}>
          <button className={styles.btnSecondary} onClick={onClose} disabled={submitting}>
            {labelCancel}
          </button>
          <button className={styles.btnPrimary} onClick={onSave} disabled={submitting}>
            {submitting ? labelSaving : labelSave}
          </button>
        </div>
      </div>
    </div>
  );
}
