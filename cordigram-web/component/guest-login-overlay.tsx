"use client";

import Link from "next/link";
import { useEffect } from "react";
import styles from "./guest-login-overlay.module.css";

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function GuestLoginOverlay({ open, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="guest-login-title"
      onClick={onClose}
    >
      <div className={styles.card} onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className={styles.closeBtn}
          aria-label="Close"
          onClick={onClose}
        >
          <IconClose />
        </button>

        <div className={styles.lockIcon} aria-hidden>
          <IconLock />
        </div>

        <h2 className={styles.title} id="guest-login-title">
          Log in to Cordigram
        </h2>
        <p className={styles.subtitle}>
          Create an account or log in to like, comment, follow and more.
        </p>

        <div className={styles.actions}>
          <Link href="/login" className={styles.btnPrimary} onClick={onClose}>
            Log in
          </Link>
          <Link href="/signup" className={styles.btnSecondary} onClick={onClose}>
            Sign up
          </Link>
        </div>

        <button type="button" className={styles.guestBtn} onClick={onClose}>
          Continue browsing
        </button>
      </div>
    </div>
  );
}

function IconClose() {
  return (
    <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M6 6l12 12M18 6L6 18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconLock() {
  return (
    <svg
      aria-hidden
      width="40"
      height="40"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    >
      <rect x="4.5" y="10" width="15" height="10" rx="2" />
      <path d="M8 10V7.5a4 4 0 0 1 8 0V10" />
      <circle cx="12" cy="15" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}
