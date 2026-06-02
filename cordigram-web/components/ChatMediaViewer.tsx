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
import { useLanguage } from "@/component/language-provider";

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

// ── Theme definitions ──
type ViewerTheme = "dark" | "blur" | "dim" | "light";
const STORAGE_KEY_THEME = "cordigram-viewer-theme";

const THEME_STYLES: Record<ViewerTheme, React.CSSProperties> = {
  dark:  { background: "rgba(0, 0, 0, 0.95)" },
  blur:  { background: "rgba(0, 0, 0, 0.72)", backdropFilter: "blur(24px) saturate(1.2)", WebkitBackdropFilter: "blur(24px) saturate(1.2)" },
  dim:   { background: "rgba(16, 18, 38, 0.97)" },
  light: { background: "rgba(230, 232, 240, 0.97)" },
};

const THEME_TEXT_COLOR: Record<ViewerTheme, string> = {
  dark:  "#ffffff",
  blur:  "#ffffff",
  dim:   "#e8eaf6",
  light: "#1a1a2e",
};

export default function ChatMediaViewer({
  items,
  initialIndex,
  onClose,
}: ChatMediaViewerProps) {
  const { t, language } = useLanguage();

  const [index, setIndex] = useState(initialIndex);
  const [showSidebar, setShowSidebar] = useState(true);
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState<ViewerTheme>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(STORAGE_KEY_THEME) as ViewerTheme | null;
      if (saved && saved in THEME_STYLES) return saved;
    }
    return "dark";
  });

  // zoom / pan
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const dragStart = useRef({ mx: 0, my: 0, px: 0, py: 0 });

  const thumbRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  const current = items[index];
  const hasPrev = index > 0;
  const hasNext = index < items.length - 1;

  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [index]);

  const changeTheme = useCallback((t: ViewerTheme) => {
    setTheme(t);
    setShowThemePicker(false);
    localStorage.setItem(STORAGE_KEY_THEME, t);
  }, []);

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
        setZoom((z) => Math.min(5, z + 0.25));
      if (e.key === "-")
        setZoom((z) => {
          const nz = Math.max(1, z - 0.25);
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

  useEffect(() => {
    thumbRef.current
      ?.querySelector(`[data-idx="${index}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [index]);

  // wheel zoom
  const handleWheel = useCallback((e: ReactWheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.25 : -0.25;
    setZoom((z) => {
      const nz = Math.min(5, Math.max(1, z + delta));
      if (nz <= 1) setPan({ x: 0, y: 0 });
      return nz;
    });
  }, []);

  // drag
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
      const now = new Date();
      const days = Math.floor((now.getTime() - item.timestamp.getTime()) / 86400000);
      const key =
        days === 0 ? t("chat.mediaViewer.today") || "Hôm nay" :
        days === 1 ? t("chat.mediaViewer.yesterday") || "Hôm qua" :
        item.timestamp.toLocaleDateString(
          language === "vi" ? "vi-VN" : language === "ja" ? "ja-JP" : language === "zh" ? "zh-CN" : "en-US",
          { day: "2-digit", month: "2-digit", year: "numeric" },
        );
      if (!map.has(key)) map.set(key, { label: key, indices: [] });
      map.get(key)!.indices.push(i);
    });
    return Array.from(map.values());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, language]);

  // Don't render anything until client-side mount so we can use createPortal safely.
  // Rendering inline (non-portal) with position:fixed can get clipped when any
  // ancestor has `transform` / `will-change` / `filter` applied (common in chat UIs).
  if (!mounted || !current) return null;

  const isVideo = current.mediaType === "video";
  const textColor = THEME_TEXT_COLOR[theme];

  const imgStyle: React.CSSProperties = {
    transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
    cursor: zoom > 1 ? "grab" : "default",
    transition: dragging.current ? "none" : "transform 0.15s ease",
  };

  const themeLabels: Record<ViewerTheme, string> = {
    dark:  t("chat.mediaViewer.themeDark")  || "Tối",
    blur:  t("chat.mediaViewer.themeBlur")  || "Mờ",
    dim:   t("chat.mediaViewer.themeDim")   || "Xám",
    light: t("chat.mediaViewer.themeLight") || "Sáng",
  };

  const overlay = (
    <div
      className={styles.overlay}
      style={THEME_STYLES[theme]}
      onClick={onClose}
      onWheel={isVideo ? undefined : (handleWheel as any)}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      {/* ── Main area ── */}
      <div className={styles.mainArea} onClick={(e) => e.stopPropagation()}>

        {/* Toolbar */}
        <div className={styles.toolbar} style={{ color: textColor }}>
          <div className={styles.toolbarLeft}>
            <button
              className={styles.iconBtn}
              style={{ color: textColor, borderColor: `${textColor}30` }}
              onClick={onClose}
              aria-label={t("chat.mediaViewer.close") || "Đóng"}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
            {current.senderName && (
              <span className={styles.senderLabel} style={{ color: textColor }}>
                {current.senderName}
              </span>
            )}
          </div>
          <div className={styles.toolbarRight}>
            {/* Zoom — images only */}
            {!isVideo && (
              <>
                <button
                  className={styles.iconBtn}
                  style={{ color: textColor, borderColor: `${textColor}30` }}
                  onClick={() => setZoom((z) => Math.min(5, z + 0.25))}
                  title={t("chat.mediaViewer.zoomIn") || "Phóng to"}
                >
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35M11 8v6M8 11h6" />
                  </svg>
                </button>
                <button
                  className={styles.iconBtn}
                  style={{ color: textColor, borderColor: `${textColor}30` }}
                  onClick={() => setZoom((z) => { const nz = Math.max(1, z - 0.25); if (nz <= 1) setPan({ x: 0, y: 0 }); return nz; })}
                  title={t("chat.mediaViewer.zoomOut") || "Thu nhỏ"}
                >
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35M8 11h6" />
                  </svg>
                </button>
                {zoom !== 1 && (
                  <button
                    className={styles.iconBtn}
                    style={{ color: textColor, borderColor: `${textColor}30` }}
                    onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
                    title={t("chat.mediaViewer.resetZoom") || "Reset"}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" />
                    </svg>
                  </button>
                )}
              </>
            )}

            {/* Download */}
            <button
              className={styles.iconBtn}
              style={{ color: textColor, borderColor: `${textColor}30` }}
              onClick={handleDownload}
              title={t("chat.mediaViewer.download") || "Tải xuống"}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
              </svg>
            </button>

            {/* Theme picker */}
            <div style={{ position: "relative" }}>
              <button
                className={styles.iconBtn}
                style={{ color: textColor, borderColor: `${textColor}30` }}
                onClick={(e) => { e.stopPropagation(); setShowThemePicker((v) => !v); }}
                title={t("chat.mediaViewer.theme") || "Nền"}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                </svg>
              </button>
              {showThemePicker && (
                <div className={styles.themePicker} onClick={(e) => e.stopPropagation()}>
                  {(["dark", "blur", "dim", "light"] as ViewerTheme[]).map((th) => (
                    <button
                      key={th}
                      className={`${styles.themeOption} ${theme === th ? styles.themeOptionActive : ""}`}
                      onClick={() => changeTheme(th)}
                    >
                      <span className={styles.themeSwatchWrap}>
                        <span
                          className={styles.themeSwatch}
                          style={{
                            background:
                              th === "dark"  ? "#000000" :
                              th === "blur"  ? "linear-gradient(135deg,rgba(30,30,60,0.8),rgba(80,80,120,0.6))" :
                              th === "dim"   ? "#10121e" :
                                              "#e6e8f0",
                          }}
                        />
                      </span>
                      {themeLabels[th]}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Sidebar toggle */}
            <button
              className={styles.iconBtn}
              style={{ color: textColor, borderColor: `${textColor}30` }}
              onClick={() => setShowSidebar((v) => !v)}
              title={showSidebar
                ? (t("chat.mediaViewer.hideSidebar") || "Ẩn danh sách")
                : (t("chat.mediaViewer.showSidebar") || "Hiện danh sách")}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
              </svg>
            </button>
          </div>
        </div>

        {/* Nav */}
        {hasPrev && (
          <button
            className={`${styles.navBtn} ${styles.navLeft}`}
            style={{ color: textColor }}
            onClick={(e) => { e.stopPropagation(); goPrev(); }}
            aria-label={t("chat.mediaViewer.prev") || "Ảnh trước"}
          >
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
              <path d="M14.791 5.207 8 12l6.793 6.793a1 1 0 1 1-1.415 1.414l-7.5-7.5a1 1 0 0 1 0-1.414l7.5-7.5a1 1 0 1 1 1.415 1.414z" />
            </svg>
          </button>
        )}
        {hasNext && (
          <button
            className={`${styles.navBtn} ${styles.navRight}`}
            style={{ color: textColor }}
            onClick={(e) => { e.stopPropagation(); goNext(); }}
            aria-label={t("chat.mediaViewer.next") || "Ảnh sau"}
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
              alt="media"
              style={imgStyle}
              onMouseDown={onMouseDown}
              draggable={false}
              onClick={(e) => e.stopPropagation()}
            />
          )}
        </div>

        {/* Counter */}
        {items.length > 1 && (
          <div className={styles.counter} style={{ color: textColor }}>
            {(t("chat.mediaViewer.counter") || "{cur} / {total}")
              .replace("{cur}", String(index + 1))
              .replace("{total}", String(items.length))}
          </div>
        )}

        {/* Zoom % badge */}
        {!isVideo && zoom > 1 && (
          <div className={styles.zoomBadge}>{Math.round(zoom * 100)}%</div>
        )}
      </div>

      {/* ── Sidebar ── */}
      {showSidebar && (
        <div
          className={styles.sidebar}
          style={{ background: theme === "light" ? "rgba(240,242,250,0.98)" : "rgba(14,17,26,0.98)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className={styles.sidebarHeader} style={{ borderBottomColor: theme === "light" ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.07)" }}>
            <h3 className={styles.sidebarTitle} style={{ color: theme === "light" ? "#1a1a2e" : "#fff" }}>
              {t("chat.mediaViewer.title") || "Ảnh/Video"}
            </h3>
            <button
              className={styles.iconBtn}
              style={{ color: theme === "light" ? "#1a1a2e" : "#fff" }}
              onClick={() => setShowSidebar(false)}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className={styles.sidebarList} ref={thumbRef}>
            {groupedByDate.map((group) => (
              <div key={group.label} className={styles.sidebarDateGroup}>
                <div className={styles.sidebarDateLabel} style={{ color: theme === "light" ? "rgba(26,26,46,0.45)" : "rgba(255,255,255,0.38)" }}>
                  {group.label}
                </div>
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
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
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

  return createPortal(overlay, document.body);
}
