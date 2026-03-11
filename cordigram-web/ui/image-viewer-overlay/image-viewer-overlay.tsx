"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./image-viewer-overlay.module.css";
import { useTranslations } from "next-intl";

export type ImageViewerOverlayProps = {
  url: string;
  mediaType?: "image" | "video" | string;
  alt?: string;
  onClose: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  previousLabel?: string;
  nextLabel?: string;
  counterText?: string;
};

export default function ImageViewerOverlay({
  url,
  mediaType,
  alt,
  onClose,
  onPrevious,
  onNext,
  previousLabel,
  nextLabel,
  counterText,
}: ImageViewerOverlayProps) {
  const t = useTranslations("home.imageViewer");
  const resolvedAlt = alt ?? t("alt");
  const resolvedPreviousLabel = previousLabel ?? "Previous media";
  const resolvedNextLabel = nextLabel ?? "Next media";
  const canNavigate = Boolean(onPrevious || onNext);
  const isVideo = mediaType === "video";
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft" && onPrevious) {
        event.preventDefault();
        onPrevious();
      }
      if (event.key === "ArrowRight" && onNext) {
        event.preventDefault();
        onNext();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, onNext, onPrevious]);

  const overlay = (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <button
        type="button"
        className={styles.close}
        aria-label={t("close")}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        ×
      </button>
      {canNavigate ? (
        <>
          <button
            type="button"
            className={`${styles.nav} ${styles.navLeft}`}
            aria-label={resolvedPreviousLabel}
            onClick={(event) => {
              event.stopPropagation();
              onPrevious?.();
            }}
          >
            <svg
              viewBox="0 0 24 24"
              width="24"
              height="24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M14.791 5.207 8 12l6.793 6.793a1 1 0 1 1-1.415 1.414l-7.5-7.5a1 1 0 0 1 0-1.414l7.5-7.5a1 1 0 1 1 1.415 1.414z"></path>
            </svg>
          </button>
          <button
            type="button"
            className={`${styles.nav} ${styles.navRight}`}
            aria-label={resolvedNextLabel}
            onClick={(event) => {
              event.stopPropagation();
              onNext?.();
            }}
          >
            <svg
              viewBox="0 0 24 24"
              width="24"
              height="24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M9.209 5.207 16 12l-6.791 6.793a1 1 0 1 0 1.415 1.414l7.5-7.5a1 1 0 0 0 0-1.414l-7.5-7.5a1 1 0 1 0-1.415 1.414z"></path>
            </svg>
          </button>
        </>
      ) : null}
      <div className={styles.figure} onClick={(e) => e.stopPropagation()}>
        {isVideo ? (
          <video
            className={styles.preview}
            src={url}
            controls
            controlsList="nodownload noremoteplayback"
            playsInline
            preload="metadata"
            onContextMenu={(e) => e.preventDefault()}
          />
        ) : (
          <img
            className={styles.preview}
            src={url}
            alt={resolvedAlt}
            onContextMenu={(e) => e.preventDefault()}
          />
        )}
      </div>
      {counterText ? (
        <div className={styles.counter} aria-live="polite">
          {counterText}
        </div>
      ) : null}
    </div>
  );

  if (mounted && typeof document !== "undefined") {
    return createPortal(overlay, document.body);
  }

  return overlay;
}
