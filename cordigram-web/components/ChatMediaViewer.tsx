"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { createPortal } from "react-dom";
import styles from "./ChatMediaViewer.module.css";

export interface ChatMediaItem {
  url: string;
  mediaType: "image" | "video";
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
  const days = Math.floor((now.getTime() - date.getTime()) / 86400000);
  if (days === 0) return "Hôm nay";
  if (days === 1) return "Hôm qua";
  return date.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

const ZOOM_MIN = 1;
const ZOOM_MAX = 5;
const ZOOM_STEP = 0.25;

export default function ChatMediaViewer({
  items,
  initialIndex,
  onClose,
}: ChatMediaViewerProps) {
  const [index, setIndex] = useState(initialIndex);
  const [showSidebar, setShowSidebar] = useState(true);
  const [mounted, setMounted] = useState(false);

  // zoom / pan state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const dragStart = useRef({ mx: 0, my: 0, px: 0, py: 0 });

  const thumbRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  const current = items[index];
  const hasPrev = index > 0;
  const hasNext = index < items.length - 1;

  // reset zoom/pan when item changes
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [index]);

  const goPrev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);
  const goNext = useCallback(
    () => setIndex((i) => Math.min(items.length - 1, i + 1)),
    [items.length],
  );

  // keyboard
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (zoom <= 1) {
        if (e.key === "ArrowLeft") goPrev();
        if (e.key === "ArrowRight") goNext();
      }
      if (e.key === "+" || e.key === "=")
        setZoom((z) => Math.min(ZOOM_MAX, z + ZOOM_STEP));
      if (e.key === "-")
        setZoom((z) => {
          const nz = Math.max(ZOOM_MIN, z - ZOOM_STEP);
          if (nz <= 1) setPan({ x: 0, y: 0 });
          return nz;
        });
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose, goPrev, goNext, zoom]);

  // auto-scroll sidebar thumbnail into view
  useEffect(() => {
    thumbRef.current
      ?.querySelector(`[data-idx="${index}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [index]);

  // ── Wheel zoom ──
  const handleWheel = useCallback((e: ReactWheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
    setZoom((z) => {
      const nz = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z + delta));
      if (nz <= 1) setPan({ x: 0, y: 0 });
      return nz;
    });
  }, []);

  // ── Mouse drag ──
  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (zoom <= 1) return;
      dragging.current = true;
      dragStart.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y };
      e.preventDefault();
    },
    [zoom, pan],
  );

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging.current) return;
    setPan({
      x: dragStart.current.px + e.clientX - dragStart.current.mx,
      y: dragStart.current.py + e.clientY - dragStart.current.my,
    });
  }, []);

  const onMouseUp = useCallback(() => { dragging.current = false; }, []);

  // download
  const handleDownload = useCallback(async () => {
    if (!current) return;
    try {
      const res = await fetch(current.url);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      const extMatch = current.url.match(/\.(jpe?g|png|gif|webp|mp4|webm|mov)/i);
      const ext = extMatch?.[1] ?? (current.mediaType === "video" ? "mp4" : "jpg");
      a.download = `cordigram-${Date.now()}.${ext}`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      window.open(current.url, "_blank");
    }
  }, [current]);

  // sidebar grouping
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

  const isVideo = current.mediaType === "video";
  const imgStyle: React.CSSProperties = {
    transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
    cursor: zoom > 1 ? "grab" : "default",
    transition: dragging.current ? "none" : "transform 0.15s ease",
  };

  const overlay = (
    <div
      className={styles.overlay}
      onClick={onClose}
      onWheel={isVideo ? undefined : (handleWheel as any)}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      {/* ── Main area ── */}
      <div
        className={styles.mainArea}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Toolbar */}
        <div className={styles.toolbar}>
          <div className={styles.toolbarLeft}>
            <button className={styles.iconBtn} onClick={onClose} aria-label="Đóng">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
            {/* sender / time info */}
            {current.senderName && (
              <span className={styles.senderLabel}>{current.senderName}</span>
            )}
          </div>
          <div className={styles.toolbarRight}>
            {/* zoom buttons — only for images */}
            {!isVideo && (
              <>
                <button
                  className={styles.iconBtn}
                  onClick={() =>
                    setZoom((z) => Math.min(ZOOM_MAX, z + ZOOM_STEP))
                  }
                  aria-label="Phóng to"
                  title="Phóng to (+)"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.35-4.35M11 8v6M8 11h6" />
                  </svg>
                </button>
                <button
                  className={styles.iconBtn}
                  onClick={() =>
                    setZoom((z) => {
                      const nz = Math.max(ZOOM_MIN, z - ZOOM_STEP);
                      if (nz <= 1) setPan({ x: 0, y: 0 });
                      return nz;
                    })
                  }
                  aria-label="Thu nhỏ"
                  title="Thu nhỏ (-)"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.35-4.35M8 11h6" />
                  </svg>
                </button>
                {zoom !== 1 && (
                  <button
                    className={styles.iconBtn}
                    onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
                    aria-label="Reset zoom"
                    title="Reset (1:1)"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                      <path d="M3 3v5h5" />
                    </svg>
                  </button>
                )}
              </>
            )}
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

        {/* Prev / Next nav */}
        {hasPrev && (
          <button
            className={`${styles.navBtn} ${styles.navLeft}`}
            onClick={(e) => { e.stopPropagation(); goPrev(); }}
            aria-label="Ảnh trước"
          >
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
              <path d="M14.791 5.207 8 12l6.793 6.793a1 1 0 1 1-1.415 1.414l-7.5-7.5a1 1 0 0 1 0-1.414l7.5-7.5a1 1 0 1 1 1.415 1.414z" />
            </svg>
          </button>
        )}
        {hasNext && (
          <button
            className={`${styles.navBtn} ${styles.navRight}`}
            onClick={(e) => { e.stopPropagation(); goNext(); }}
            aria-label="Ảnh sau"
          >
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
              <path d="M9.209 5.207 16 12l-6.791 6.793a1 1 0 1 0 1.415 1.414l7.5-7.5a1 1 0 0 0 0-1.414l-7.5-7.5a1 1 0 1 0-1.415 1.414z" />
            </svg>
          </button>
        )}

        {/* Media */}
        <div className={styles.mediaWrap} onClick={(e) => e.stopPropagation()}>
          {isVideo ? (
            <video
              key={current.url}
              className={styles.preview}
              src={current.url}
              autoPlay
              controls
              playsInline
              preload="metadata"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <img
              key={current.url}
              className={styles.preview}
              src={current.url}
              alt="Ảnh"
              style={imgStyle}
              onMouseDown={onMouseDown}
              draggable={false}
              onClick={(e) => e.stopPropagation()}
            />
          )}
        </div>

        {/* Counter */}
        {items.length > 1 && (
          <div className={styles.counter}>
            {index + 1} / {items.length}
          </div>
        )}

        {/* Zoom hint */}
        {!isVideo && zoom > 1 && (
          <div className={styles.zoomBadge}>{Math.round(zoom * 100)}%</div>
        )}
      </div>

      {/* ── Sidebar ── */}
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
                  {group.indices.map((i) => {
                    const item = items[i];
                    return item.mediaType === "video" ? (
                      <div
                        key={i}
                        data-idx={i}
                        className={`${styles.sidebarThumb} ${styles.sidebarVideoThumb} ${i === index ? styles.sidebarThumbActive : ""}`}
                        onClick={() => setIndex(i)}
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                          <polygon points="5,3 19,12 5,21" />
                        </svg>
                      </div>
                    ) : (
                      <img
                        key={i}
                        data-idx={i}
                        src={item.url}
                        alt=""
                        className={`${styles.sidebarThumb} ${i === index ? styles.sidebarThumbActive : ""}`}
                        onClick={() => setIndex(i)}
                        draggable={false}
                      />
                    );
                  })}
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
