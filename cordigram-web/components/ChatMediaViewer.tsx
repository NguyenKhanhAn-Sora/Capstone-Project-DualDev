"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./ChatMediaViewer.module.css";

export interface ChatMediaItem {
  url: string;
  timestamp: Date;
  senderName?: string;
}

interface ChatMediaViewerProps {
  items: ChatMediaItem[];
  initialIndex: number;
  onClose: () => void;
}

function formatDateLabel(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Hôm nay";
  if (days === 1) return "Hôm qua";
  return date.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function ChatMediaViewer({
  items,
  initialIndex,
  onClose,
}: ChatMediaViewerProps) {
  const [index, setIndex] = useState(initialIndex);
  const [showSidebar, setShowSidebar] = useState(true);
  const [mounted, setMounted] = useState(false);
  const thumbRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  const current = items[index];
  const hasPrev = index > 0;
  const hasNext = index < items.length - 1;

  const goPrev = useCallback(() => {
    setIndex((i) => Math.max(0, i - 1));
  }, []);

  const goNext = useCallback(() => {
    setIndex((i) => Math.min(items.length - 1, i + 1));
  }, [items.length]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose, goPrev, goNext]);

  useEffect(() => {
    const el = thumbRef.current?.querySelector(`[data-idx="${index}"]`);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [index]);

  const handleDownload = useCallback(async () => {
    if (!current) return;
    try {
      const res = await fetch(current.url);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      const ext = current.url.match(/\.(jpe?g|png|gif|webp)/i)?.[1] || "jpg";
      a.download = `cordigram-${Date.now()}.${ext}`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      window.open(current.url, "_blank");
    }
  }, [current]);

  const groupedByDate = useMemo(() => {
    const map = new Map<string, { label: string; indices: number[] }>();
    items.forEach((item, i) => {
      const key = formatDateLabel(item.timestamp);
      if (!map.has(key)) map.set(key, { label: key, indices: [] });
      map.get(key)!.indices.push(i);
    });
    return Array.from(map.values());
  }, [items]);

  if (!current) return null;

  const overlay = (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.mainArea} onClick={(e) => e.stopPropagation()}>
        {/* Toolbar */}
        <div className={styles.toolbar}>
          <div className={styles.toolbarLeft}>
            <button
              className={styles.iconBtn}
              onClick={onClose}
              aria-label="Đóng"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className={styles.toolbarRight}>
            <button
              className={styles.iconBtn}
              onClick={handleDownload}
              aria-label="Tải xuống"
              title="Tải xuống"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
              </svg>
            </button>
            <button
              className={styles.iconBtn}
              onClick={() => setShowSidebar((v) => !v)}
              aria-label={showSidebar ? "Ẩn danh sách" : "Hiện danh sách"}
              title={showSidebar ? "Ẩn danh sách" : "Hiện danh sách"}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
              </svg>
            </button>
          </div>
        </div>

        {/* Nav buttons */}
        {hasPrev && (
          <button className={`${styles.navBtn} ${styles.navLeft}`} onClick={goPrev} aria-label="Trước">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
              <path d="M14.791 5.207 8 12l6.793 6.793a1 1 0 1 1-1.415 1.414l-7.5-7.5a1 1 0 0 1 0-1.414l7.5-7.5a1 1 0 1 1 1.415 1.414z" />
            </svg>
          </button>
        )}
        {hasNext && (
          <button className={`${styles.navBtn} ${styles.navRight}`} onClick={goNext} aria-label="Sau">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
              <path d="M9.209 5.207 16 12l-6.791 6.793a1 1 0 1 0 1.415 1.414l7.5-7.5a1 1 0 0 0 0-1.414l-7.5-7.5a1 1 0 1 0-1.415 1.414z" />
            </svg>
          </button>
        )}

        {/* Main image */}
        <img
          className={styles.preview}
          src={current.url}
          alt="Ảnh"
          onClick={(e) => e.stopPropagation()}
          draggable={false}
        />

        {/* Counter */}
        {items.length > 1 && (
          <div className={styles.counter}>
            {index + 1} / {items.length}
          </div>
        )}
      </div>

      {/* Sidebar */}
      {showSidebar && (
        <div className={styles.sidebar} onClick={(e) => e.stopPropagation()}>
          <div className={styles.sidebarHeader}>
            <h3 className={styles.sidebarTitle}>Ảnh/Video</h3>
            <button
              className={styles.iconBtn}
              onClick={() => setShowSidebar(false)}
              aria-label="Ẩn"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className={styles.sidebarList} ref={thumbRef}>
            {groupedByDate.map((group) => (
              <div key={group.label} className={styles.sidebarDateGroup}>
                <div className={styles.sidebarDateLabel}>{group.label}</div>
                <div className={styles.sidebarGrid}>
                  {group.indices.map((i) => (
                    <img
                      key={i}
                      data-idx={i}
                      src={items[i].url}
                      alt=""
                      className={`${styles.sidebarThumb} ${i === index ? styles.sidebarThumbActive : ""}`}
                      onClick={() => setIndex(i)}
                      draggable={false}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  if (mounted && typeof document !== "undefined") {
    return createPortal(overlay, document.body);
  }
  return overlay;
}
