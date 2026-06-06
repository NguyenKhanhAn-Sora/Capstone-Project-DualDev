"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import styles from "./video-trimmer.module.css";

const THUMB_COUNT = 18;
const MIN_TRIM_SECS = 1;
const DEFAULT_MAX_SECS = 20;

type Props = {
  videoUrl: string;
  duration: number;
  initialStartSec?: number;
  initialEndSec?: number;
  /** Max allowed trim duration in seconds (default 20) */
  maxDurationSec?: number;
  previewVideoRef?: React.RefObject<HTMLVideoElement | null>;
  onConfirm: (startSec: number, endSec: number) => void;
  onCancel: () => void;
};

export default function VideoTrimmer({
  videoUrl,
  duration,
  initialStartSec,
  initialEndSec,
  maxDurationSec = DEFAULT_MAX_SECS,
  previewVideoRef,
  onConfirm,
  onCancel,
}: Props) {
  const getVid = () => previewVideoRef?.current ?? null;
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [thumbsReady, setThumbsReady] = useState(false);
  // Convert saved seconds → fraction; fall back to 0/1 if not set
  const [trimStart, setTrimStart] = useState(() =>
    initialStartSec != null && duration > 0 ? initialStartSec / duration : 0,
  );
  const [trimEnd, setTrimEnd] = useState(() =>
    initialEndSec != null && duration > 0 ? initialEndSec / duration : 1,
  );
  const [playFrac, setPlayFrac] = useState(() =>
    initialStartSec != null && duration > 0 ? initialStartSec / duration : 0,
  );
  const [playing, setPlaying] = useState(false);

  const railRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const playingRef = useRef(false);

  /* ── Extract thumbnails ──────────────────────────── */
  useEffect(() => {
    if (!videoUrl || !duration) return;
    let cancelled = false;
    const vid = document.createElement("video");
    vid.src = videoUrl;
    vid.muted = true;
    vid.preload = "auto";
    vid.crossOrigin = "anonymous";
    vid.playsInline = true;

    const canvas = document.createElement("canvas");
    canvas.width = 60;
    canvas.height = 107;
    const ctx = canvas.getContext("2d")!;
    const frames: string[] = [];
    let idx = 0;

    const grab = () => {
      if (cancelled) return;
      try {
        ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
        frames.push(canvas.toDataURL("image/jpeg", 0.55));
      } catch {
        frames.push("");
      }
      idx++;
      if (idx < THUMB_COUNT) {
        vid.currentTime = (idx / (THUMB_COUNT - 1)) * duration;
      } else {
        if (!cancelled) { setThumbs([...frames]); setThumbsReady(true); }
        vid.src = "";
      }
    };

    vid.addEventListener("loadedmetadata", () => { vid.currentTime = 0; });
    vid.addEventListener("seeked", grab);
    return () => { cancelled = true; vid.src = ""; };
  }, [videoUrl, duration]);

  /* ── Sync preview video when playing ────────────── */
  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  const stopPlayback = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    getVid()?.pause();
    setPlaying(false);
    playingRef.current = false;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewVideoRef]);

  const tick = useCallback(() => {
    const vid = getVid();
    if (!vid || !playingRef.current) return;
    const endSec = trimEnd * duration;
    if (vid.currentTime >= endSec) {
      vid.currentTime = trimStart * duration;
      setPlayFrac(trimStart);
      stopPlayback();
      return;
    }
    const frac = vid.currentTime / duration;
    setPlayFrac(frac);
    rafRef.current = requestAnimationFrame(tick);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewVideoRef, trimStart, trimEnd, duration, stopPlayback]);

  const togglePlay = useCallback(() => {
    const vid = getVid();
    if (!vid) return;
    if (playing) {
      stopPlayback();
    } else {
      const startSec = trimStart * duration;
      const endSec = trimEnd * duration;
      if (vid.currentTime < startSec || vid.currentTime >= endSec) {
        vid.currentTime = startSec;
        setPlayFrac(trimStart);
      }
      vid.play().catch(() => {});
      setPlaying(true);
      playingRef.current = true;
      rafRef.current = requestAnimationFrame(tick);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, stopPlayback, tick, trimStart, trimEnd, duration, previewVideoRef]);

  /* ── Stop on unmount ─────────────────────────────── */
  useEffect(() => () => stopPlayback(), [stopPlayback]);

  /* ── Rail fraction helper ────────────────────────── */
  const getRailFrac = useCallback((clientX: number) => {
    const rail = railRef.current;
    if (!rail) return 0;
    const rect = rail.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }, []);

  /* ── Seek preview video ──────────────────────────── */
  const seekTo = useCallback((frac: number) => {
    const vid = getVid();
    if (!vid) return;
    vid.currentTime = frac * duration;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewVideoRef, duration]);

  /* ── Drag: trim handles ──────────────────────────── */
  const onHandleMouseDown = useCallback(
    (which: "start" | "end", e: React.MouseEvent | React.TouchEvent) => {
      e.stopPropagation();
      stopPlayback();

      const onMove = (me: MouseEvent | TouchEvent) => {
        const cx = "touches" in me ? me.touches[0].clientX : me.clientX;
        const frac = getRailFrac(cx);

        if (which === "start") {
          const maxStart = trimEnd - MIN_TRIM_SECS / duration;
          const newStart = Math.min(Math.max(0, frac), maxStart);
          setTrimStart(newStart);
          setPlayFrac((prev) => {
            const clamped = Math.max(prev, newStart);
            seekTo(clamped);
            return clamped;
          });
        } else {
          const minEnd = trimStart + MIN_TRIM_SECS / duration;
          const newEnd = Math.max(Math.min(1, frac), minEnd);
          setTrimEnd(newEnd);
          setPlayFrac((prev) => {
            const clamped = Math.min(prev, newEnd);
            seekTo(clamped);
            return clamped;
          });
        }
      };

      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.removeEventListener("touchmove", onMove);
        document.removeEventListener("touchend", onUp);
      };

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
      document.addEventListener("touchmove", onMove, { passive: true });
      document.addEventListener("touchend", onUp);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trimStart, trimEnd, duration, getRailFrac, seekTo, stopPlayback],
  );

  /* ── Drag: playhead ──────────────────────────────── */
  const onPlayheadMouseDown = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      e.stopPropagation();
      stopPlayback();

      const onMove = (me: MouseEvent | TouchEvent) => {
        const cx = "touches" in me ? me.touches[0].clientX : me.clientX;
        const frac = getRailFrac(cx);
        // clamp strictly inside trim range
        const clamped = Math.max(trimStart, Math.min(trimEnd, frac));
        setPlayFrac(clamped);
        seekTo(clamped);
      };

      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.removeEventListener("touchmove", onMove);
        document.removeEventListener("touchend", onUp);
      };

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
      document.addEventListener("touchmove", onMove, { passive: true });
      document.addEventListener("touchend", onUp);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trimStart, trimEnd, getRailFrac, seekTo, stopPlayback],
  );

  /* ── Click on rail to seek ───────────────────────── */
  const onRailClick = useCallback(
    (e: React.MouseEvent) => {
      // ignore if clicking on handles or playhead
      if ((e.target as HTMLElement).closest("[data-handle]")) return;
      const frac = getRailFrac(e.clientX);
      const clamped = Math.max(trimStart, Math.min(trimEnd, frac));
      setPlayFrac(clamped);
      seekTo(clamped);
    },
    [trimStart, trimEnd, getRailFrac, seekTo],
  );

  const trimStartSec = trimStart * duration;
  const trimEndSec = trimEnd * duration;
  const trimDuration = trimEndSec - trimStartSec;

  // Cap at maxDurationSec only when user's selection exceeds it
  const effectiveEndSec = Math.min(trimEndSec, trimStartSec + maxDurationSec, duration);
  const effectiveEndFrac = effectiveEndSec / duration;
  const effectiveDuration = effectiveEndSec - trimStartSec;
  // Warn only when the end handle goes past the 20s cap
  const endExceedsMax = trimEndSec > trimStartSec + maxDurationSec + 0.05;

  const fmt = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = (sec % 60).toFixed(1);
    return m > 0 ? `${m}:${s.padStart(4, "0")}` : `${s} giây`;
  };

  return (
    <div className={styles.trimmerRoot}>
      {/* Header */}
      <div className={styles.trimmerHeader}>
        <button className={styles.trimmerCancel} onClick={onCancel} aria-label="Hủy">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M19 12H5M5 12l7-7M5 12l7 7" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <span className={styles.trimmerTitle}>Cắt video</span>
        <button className={styles.trimmerConfirm}
          onClick={() => onConfirm(trimStartSec, effectiveEndSec)} aria-label="Xác nhận">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.2"
              strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* Filmstrip row */}
      <div className={styles.trimmerWrap}>
        {/* Play button */}
        <button className={styles.playBtn} onClick={togglePlay}
          aria-label={playing ? "Tạm dừng" : "Phát"}>
          {playing ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <rect x="5" y="4" width="4" height="16" rx="1" />
              <rect x="15" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        {/* Rail */}
        <div className={styles.rail} ref={railRef} onClick={onRailClick}>
          {/* Filmstrip thumbnails */}
          <div className={styles.filmstrip}>
            {thumbsReady
              ? thumbs.map((src, i) => (
                  <div key={i} className={styles.thumb}
                    style={{ backgroundImage: src ? `url(${src})` : undefined }} />
                ))
              : Array.from({ length: THUMB_COUNT }).map((_, i) => (
                  <div key={i} className={styles.thumbSkeleton} />
                ))}
          </div>

          {/* Dim regions outside trim */}
          <div className={styles.dimLeft} style={{ width: `${trimStart * 100}%` }} />
          <div className={styles.dimRight} style={{ width: `${(1 - trimEnd) * 100}%` }} />

          {/* Trim highlight border (full selected range, dimmed if exceeds 20s) */}
          <div className={styles.trimHighlight}
            style={{ left: `${trimStart * 100}%`, width: `${(trimEnd - trimStart) * 100}%` }} />

          {/* Effective 20s window highlight — shown only when end handle exceeds it */}
          {endExceedsMax && (
            <div className={styles.trimEffectiveHighlight}
              style={{ left: `${trimStart * 100}%`, width: `${(effectiveEndFrac - trimStart) * 100}%` }} />
          )}

          {/* Left trim handle */}
          <div data-handle="start" className={`${styles.handle} ${styles.handleLeft}`}
            style={{ left: `${trimStart * 100}%` }}
            onMouseDown={(e) => onHandleMouseDown("start", e)}
            onTouchStart={(e) => onHandleMouseDown("start", e)}>
            <div className={styles.handleGrip}><span /><span /><span /></div>
          </div>

          {/* Right trim handle */}
          <div data-handle="end" className={`${styles.handle} ${styles.handleRight}`}
            style={{ left: `${trimEnd * 100}%` }}
            onMouseDown={(e) => onHandleMouseDown("end", e)}
            onTouchStart={(e) => onHandleMouseDown("end", e)}>
            <div className={styles.handleGrip}><span /><span /><span /></div>
          </div>

          {/* Playhead — draggable, clamped to trim range */}
          <div
            data-handle="playhead"
            className={styles.playhead}
            style={{ left: `${playFrac * 100}%` }}
            onMouseDown={onPlayheadMouseDown}
            onTouchStart={onPlayheadMouseDown}
            aria-label="Kéo để tua video"
          >
            <div className={styles.playheadLine} />
            <div className={styles.playheadHandle} />
          </div>
        </div>

        {/* Duration label — always shows effective 20s window */}
        <div className={`${styles.trimDuration} ${endExceedsMax ? styles.trimDurationMax : ""}`}>
          {fmt(effectiveDuration)}
          {endExceedsMax && <span className={styles.trimMaxBadge}>max</span>}
        </div>
      </div>

      {/* Time indicators */}
      <div className={styles.trimInfo}>
        <span>{fmt(trimStartSec)}</span>
        <span style={{ color: "var(--color-text-muted,#888)", fontSize: 11 }}>
          tổng: {fmt(duration)}
        </span>
        <span className={endExceedsMax ? styles.trimInfoEffective : undefined}>
          {fmt(effectiveEndSec)}
          {endExceedsMax && <span className={styles.trimInfoEffectiveLabel}> (sẽ dùng)</span>}
        </span>
      </div>
    </div>
  );
}
