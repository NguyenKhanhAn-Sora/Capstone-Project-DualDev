"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./image-viewer-overlay.module.css";

export type ImageViewerOverlayProps = {
  url: string;
  alt?: string;
  onClose: () => void;
};

export default function ImageViewerOverlay({
  url,
  alt = "Image",
  onClose,
}: ImageViewerOverlayProps) {
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
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

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
        aria-label="Close image"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        ×
      </button>
      <div className={styles.figure} onClick={(e) => e.stopPropagation()}>
        <img
          className={styles.preview}
          src={url}
          alt={alt}
          onContextMenu={(e) => e.preventDefault()}
        />
      </div>
    </div>
  );

  if (mounted && typeof document !== "undefined") {
    return createPortal(overlay, document.body);
  }

  return overlay;
}
