"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { StoryMusic } from "@/lib/api";
import styles from "./music-trimmer.module.css";

const SEGMENT_SEC = 20;
const NUM_BARS = 100;

function seededBars(trackId: string): number[] {
  let h = 0;
  for (let i = 0; i < trackId.length; i++) h = (Math.imul(31, h) + trackId.charCodeAt(i)) | 0;
  return Array.from({ length: NUM_BARS }, () => {
    h ^= h << 13; h ^= h >> 17; h ^= h << 5;
    return ((h >>> 0) / 4294967296) * 0.75 + 0.15;
  });
}

function fmtSec(s: number) {
  return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, "0")}`;
}

type Props = {
  music: StoryMusic;
  onUpdate: (startTime: number) => void;
};

// Module-level cache: survives component unmount/remount (e.g. opening music picker).
// Keyed by audioUrl so switching tracks re-fetches but same track is instant.
type CachedAudio = { bars: number[]; duration: number; blobUrl: string };
const audioCache = new Map<string, CachedAudio>();

export default function MusicTrimmer({ music, onUpdate }: Props) {
  const cached = audioCache.get(music.audioUrl);

  const [bars, setBars] = useState<number[]>(cached?.bars ?? []);
  const [totalDuration, setTotalDuration] = useState(cached?.duration ?? 0);
  const [startOffset, setStartOffset] = useState(music.startTime ?? 0);
  const [playing, setPlaying] = useState(false);
  // loading = full audio not yet decoded; waveform is hidden until done
  const [loading, setLoading] = useState(!cached);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(cached?.blobUrl ?? null);
  const waveRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const segDur = Math.min(SEGMENT_SEC, totalDuration || SEGMENT_SEC);
  const maxOffset = Math.max(0, totalDuration - segDur);

  // ── Load + decode full audio ──────────────────────────────────────────────
  useEffect(() => {
    const hit = audioCache.get(music.audioUrl);
    if (hit) {
      setBars(hit.bars);
      setTotalDuration(hit.duration);
      blobUrlRef.current = hit.blobUrl;
      setStartOffset(0);
      setLoading(false);
      return;
    }

    setLoading(true);
    setBars([]);
    setStartOffset(0);
    let cancelled = false;

    (async () => {
      let blobUrl: string | null = null;
      try {
        const res = await fetch(music.audioUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = await res.arrayBuffer();
        if (cancelled) return;

        // Create blob URL first (decodeAudioData may detach the buffer).
        const blob = new Blob([buf], { type: "audio/mpeg" });
        blobUrl = URL.createObjectURL(blob);

        const ctx = new AudioContext();
        const audioBuf = await ctx.decodeAudioData(buf.slice(0));
        ctx.close();
        if (cancelled) { URL.revokeObjectURL(blobUrl); return; }

        const data = audioBuf.getChannelData(0);
        const dur = audioBuf.duration;
        const blockSize = Math.max(1, Math.floor(data.length / NUM_BARS));
        const raw = Array.from({ length: NUM_BARS }, (_, i) => {
          let sum = 0;
          for (let j = 0; j < blockSize; j++) sum += Math.abs(data[i * blockSize + j]);
          return sum / blockSize;
        });
        const peak = Math.max(...raw, 0.001);
        const realBars = raw.map((b) => b / peak);

        audioCache.set(music.audioUrl, { bars: realBars, duration: dur, blobUrl });
        blobUrlRef.current = blobUrl;

        setBars(realBars);
        setTotalDuration(dur);
        setLoading(false);
      } catch {
        if (cancelled) return;
        // fetch/decode failed — try at least getting duration from an <audio> element,
        // then show seeded fallback bars so the UI is usable.
        let dur = 180; // safe default (3 min)
        try {
          dur = await new Promise<number>((resolve, reject) => {
            const a = new Audio();
            a.preload = "metadata";
            a.onloadedmetadata = () => resolve(isFinite(a.duration) ? a.duration : 180);
            a.onerror = reject;
            a.src = music.audioUrl;
            setTimeout(() => reject(new Error("timeout")), 6000);
          });
        } catch { /* keep default */ }
        if (cancelled) return;
        setBars(seededBars(music.trackId));
        setTotalDuration(dur);
        setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [music.trackId, music.audioUrl]);

  // ── Sync startTime to parent ──────────────────────────────────────────────
  useEffect(() => { onUpdate(startOffset); }, [startOffset, onUpdate]);

  // ── Audio preview ─────────────────────────────────────────────────────────
  const stopAudio = useCallback(() => {
    audioRef.current?.pause();
    if (audioRef.current) { audioRef.current.src = ""; audioRef.current = null; }
    setPlaying(false);
  }, []);

  useEffect(() => () => stopAudio(), [stopAudio]);

  const togglePlay = () => {
    if (playing) { stopAudio(); return; }
    // Prefer cached blob URL (instant, no re-fetch), fall back to original URL.
    const src = blobUrlRef.current ?? music.audioUrl;
    const audio = new Audio(src);
    audio.currentTime = startOffset;
    audio.volume = 0.8;
    audio.play().catch(() => {});
    const end = startOffset + segDur;
    const check = () => {
      if (!audioRef.current) return;
      if (audio.currentTime >= end) { stopAudio(); return; }
      requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
    audio.onended = () => setPlaying(false);
    audioRef.current = audio;
    setPlaying(true);
  };

  // ── Drag to reposition selection window ──────────────────────────────────
  const calcOffset = useCallback((clientX: number) => {
    const rect = waveRef.current?.getBoundingClientRect();
    if (!rect || totalDuration <= 0) return;
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const halfSeg = segDur / totalDuration / 2;
    const raw = (pct - halfSeg) * totalDuration;
    setStartOffset(parseFloat(Math.max(0, Math.min(maxOffset, raw)).toFixed(1)));
  }, [totalDuration, segDur, maxOffset]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (loading) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    draggingRef.current = true;
    calcOffset(e.clientX);
    stopAudio();
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    calcOffset(e.clientX);
  };
  const onPointerUp = () => { draggingRef.current = false; };

  const selLeft = totalDuration > 0 ? (startOffset / totalDuration) * 100 : 0;
  const selWidth = totalDuration > 0 ? (segDur / totalDuration) * 100 : 100;

  return (
    <div className={styles.trimmer}>
      <button
        className={`${styles.playBtn} ${playing ? styles.playBtnActive : ""}`}
        onClick={togglePlay}
        disabled={loading}
        aria-label={playing ? "Dừng" : "Nghe thử đoạn nhạc"}
      >
        {playing ? <IconPause /> : <IconPlay />}
      </button>

      <div
        ref={waveRef}
        className={`${styles.wave} ${loading ? styles.waveLoading : ""}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        {loading ? (
          // Skeleton shimmer while fetching + decoding full audio
          <div className={styles.skeleton}>
            <div className={styles.skeletonGlow} />
          </div>
        ) : (
          <>
            {bars.map((h, i) => {
              const t = (i / NUM_BARS) * totalDuration;
              const inSel = t >= startOffset && t < startOffset + segDur;
              return (
                <div
                  key={i}
                  className={`${styles.bar} ${inSel ? styles.barActive : ""}`}
                  style={{ height: `${Math.max(h * 100, 8)}%` }}
                />
              );
            })}
            <div
              className={styles.selWindow}
              style={{ left: `${selLeft}%`, width: `${selWidth}%` }}
            />
          </>
        )}
      </div>

      <span className={styles.timeLabel}>
        {loading
          ? "Đang tải..."
          : `${fmtSec(startOffset)}–${fmtSec(Math.min(startOffset + segDur, totalDuration))}`}
      </span>
    </div>
  );
}

function IconPlay() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 4.75v14.5L19.5 12z" />
    </svg>
  );
}
function IconPause() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
      <rect x="5" y="4" width="4" height="16" rx="1" />
      <rect x="15" y="4" width="4" height="16" rx="1" />
    </svg>
  );
}
