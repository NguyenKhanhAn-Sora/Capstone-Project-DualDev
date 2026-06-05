"use client";

import styles from "./confirm-action-overlay.module.css";

type Props = {
  open: boolean;
  closing?: boolean;
  onClose: () => void;
  variant?: "danger" | "warning";
  title: string;
  body?: string;
  error?: string;
  submitting?: boolean;
  onConfirm: () => void;
  labelConfirm?: string;
  labelConfirming?: string;
  labelCancel?: string;
};

export default function ConfirmActionOverlay({
  open,
  closing = false,
  onClose,
  variant = "danger",
  title,
  body,
  error,
  submitting = false,
  onConfirm,
  labelConfirm = "Confirm",
  labelConfirming = "Processing...",
  labelCancel = "Cancel",
}: Props) {
  if (!open) return null;

  const cardVariantClass =
    variant === "warning" ? styles.cardWarning : styles.cardDanger;
  const btnConfirmClass =
    variant === "warning" ? styles.btnWarning : styles.btnDanger;

  return (
    <div
      className={`${styles.backdrop} ${closing ? styles.backdropClosing : ""}`}
      role="dialog"
      aria-modal="true"
      onClick={(e) => { e.stopPropagation(); onClose(); }}
    >
      <div
        className={`${styles.card} ${cardVariantClass} ${closing ? styles.cardClosing : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <button className={styles.closeBtn} aria-label="Close" onClick={onClose}>
          ×
        </button>

        <h3 className={styles.title}>{title}</h3>
        {body ? <p className={styles.body}>{body}</p> : null}
        {error ? <div className={styles.error}>{error}</div> : null}

        <div className={styles.actions}>
          <button
            className={styles.btnSecondary}
            onClick={onClose}
            disabled={submitting}
          >
            {labelCancel}
          </button>
          <button
            className={btnConfirmClass}
            onClick={onConfirm}
            disabled={submitting}
          >
            {submitting ? labelConfirming : labelConfirm}
          </button>
        </div>
      </div>
    </div>
  );
}
