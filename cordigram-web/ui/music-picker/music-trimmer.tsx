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

export default function MusicTrimmer({ music, onUpdate }: Props) {
  const [bars, setBars] = useState<number[]>(() => seededBars(music.trackId));
  const [totalDuration, setTotalDuration] = useState(30);
  const [startOffset, setStartOffset] = useState(music.startTime ?? 0);
  const [playing, setPlaying] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waveRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const segDur = Math.min(SEGMENT_SEC, totalDuration);
  const maxOffset = Math.max(0, totalDuration - segDur);

  // Load real waveform via Web Audio API
  useEffect(() => {
    setBars(seededBars(music.trackId));
    setStartOffset(0);
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(music.audioUrl, { mode: "cors" });
        const buf = await res.arrayBuffer();
        const ctx = new AudioContext();
        const audioBuf = await ctx.decodeAudioData(buf);
        if (cancelled) return;
        const data = audioBuf.getChannelData(0);
        setTotalDuration(audioBuf.duration);
        const blockSize = Math.floor(data.length / NUM_BARS);
        const raw = Array.from({ length: NUM_BARS }, (_, i) => {
          let sum = 0;
          for (let j = 0; j < blockSize; j++) sum += Math.abs(data[i * blockSize + j]);
          return sum / blockSize;
        });
        const peak = Math.max(...raw, 0.001);
        setBars(raw.map((b) => b / peak));
        ctx.close();
      } catch {
        // keep seeded fallback
      }
    })();
    return () => { cancelled = true; };
  }, [music.trackId, music.audioUrl]);

  // Push startTime to parent
  useEffect(() => { onUpdate(startOffset); }, [startOffset, onUpdate]);

  // Audio preview
  const stopAudio = useCallback(() => {
    audioRef.current?.pause();
    if (audioRef.current) { audioRef.current.src = ""; audioRef.current = null; }
    setPlaying(false);
  }, []);

  useEffect(() => () => stopAudio(), [stopAudio]);

  const togglePlay = () => {
    if (playing) { stopAudio(); return; }
    const audio = new Audio(music.audioUrl);
    audio.currentTime = startOffset;
    audio.volume = 0.8;
    audio.play().catch(() => {});
    const check = () => {
      if (!audioRef.current) return;
      if (audio.currentTime >= startOffset + segDur) { stopAudio(); return; }
      requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
    audio.onended = () => setPlaying(false);
    audioRef.current = audio;
    setPlaying(true);
  };

  // Drag to reposition selection window
  const calcOffset = useCallback((clientX: number) => {
    const rect = waveRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const halfSeg = segDur / totalDuration / 2;
    const raw = (pct - halfSeg) * totalDuration;
    setStartOffset(parseFloat(Math.max(0, Math.min(maxOffset, raw)).toFixed(1)));
  }, [totalDuration, segDur, maxOffset]);

  const onPointerDown = (e: React.PointerEvent) => {
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
        aria-label={playing ? "Dừng" : "Nghe thử đoạn nhạc"}
      >
        {playing ? <IconPause /> : <IconPlay />}
      </button>

      <div
        ref={waveRef}
        className={styles.wave}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        {/* Bars */}
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

        {/* Selection window overlay */}
        <div
          className={styles.selWindow}
          style={{ left: `${selLeft}%`, width: `${selWidth}%` }}
        />
      </div>

      <span className={styles.timeLabel}>
        {fmtSec(startOffset)}–{fmtSec(Math.min(startOffset + segDur, totalDuration))}
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
