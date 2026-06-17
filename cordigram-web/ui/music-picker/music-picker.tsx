"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import type { JamendoTrack, StoryMusic } from "@/lib/api";
import styles from "./music-picker.module.css";

const JAMENDO_CLIENT_ID = "7a016a16";
const JAMENDO_API = "https://api.jamendo.com/v3.0";

async function jamendoFetch(params: Record<string, string | number>): Promise<JamendoTrack[]> {
  const q = new URLSearchParams({
    client_id: JAMENDO_CLIENT_ID,
    format: "json",
    imagesize: "200",
    ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
  });
  const url = `${JAMENDO_API}/tracks/?${q}`;
  console.log("[MusicPicker] fetching:", url);
  const res = await fetch(url);
  console.log("[MusicPicker] status:", res.status);
  const data = await res.json();
  console.log("[MusicPicker] response:", data);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (data.results ?? []) as JamendoTrack[];
}

function fmtDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function IconSearch() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="11" cy="11" r="7.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M20 20l-3-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
function IconClose() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
function IconPlay() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M6 4.75v14.5L19.5 12 6 4.75z" />
    </svg>
  );
}
function IconPause() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <rect x="5" y="4" width="4" height="16" rx="1" />
      <rect x="15" y="4" width="4" height="16" rx="1" />
    </svg>
  );
}
function IconNote() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M9 18V6l12-2v12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="6" cy="18" r="2.5" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="18" cy="16" r="2.5" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}
function IconCheck() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 12l5 5 9-9" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type Props = {
  token?: string;
  selected: StoryMusic | null;
  onSelect: (music: StoryMusic | null) => void;
  onClose: () => void;
};

export default function MusicPicker({ token, selected, onSelect, onClose }: Props) {
  const t = useTranslations("ui");
  const [tab, setTab] = useState<"trending" | "search">("trending");
  const [query, setQuery] = useState("");
  const [tracks, setTracks] = useState<JamendoTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    setPlayingId(null);
  }, []);

  const loadTrending = useCallback(async () => {
    setLoading(true);
    try {
      const result = await jamendoFetch({ order: "popularity_total", limit: 20 });
      setTracks(result);
    } catch (err) {
      console.error("[MusicPicker] trending error:", err);
      setTracks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSearch = useCallback(async (q: string) => {
    if (!q.trim()) { loadTrending(); return; }
    setLoading(true);
    try {
      const result = await jamendoFetch({ search: q, limit: 20 });
      setTracks(result);
    } catch (err) {
      console.error("[MusicPicker] search error:", err);
      setTracks([]);
    } finally {
      setLoading(false);
    }
  }, [loadTrending]);

  useEffect(() => {
    loadTrending();
    return () => { stopAudio(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (tab === "trending") { setQuery(""); loadTrending(); stopAudio(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setQuery(q);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => loadSearch(q), 400);
  };

  const handlePreview = (track: JamendoTrack) => {
    if (playingId === track.id) { stopAudio(); return; }
    stopAudio();
    const audio = new Audio(track.audio);
    audio.volume = 0.8;
    audio.play().catch(() => {});
    audio.onended = () => setPlayingId(null);
    audioRef.current = audio;
    setPlayingId(track.id);
  };

  const handleSelect = (track: JamendoTrack) => {
    stopAudio();
    if (selected?.trackId === track.id) {
      onSelect(null);
    } else {
      onSelect({
        trackId: track.id,
        title: track.name,
        artist: track.artist_name,
        coverUrl: track.image,
        audioUrl: track.audio,
        startTime: 0,
        stickerX: 5,
        stickerY: 72,
        stickerWidth: 90,
      });
    }
  };

  return (
    <div className={styles.panel}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.searchBar}>
          <span className={styles.searchIcon}><IconSearch /></span>
          <input
            className={styles.searchInput}
            placeholder={t("musicPicker.searchPlaceholder")}
            value={query}
            onChange={handleSearch}
            onFocus={() => setTab("search")}
          />
          {query && (
            <button className={styles.searchClear} onClick={() => { setQuery(""); setTab("trending"); loadTrending(); }}>
              <IconClose />
            </button>
          )}
        </div>
        <button className={styles.closeBtn} onClick={() => { stopAudio(); onClose(); }}>
          <IconClose />
        </button>
      </div>

      {/* Tabs */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${tab === "trending" ? styles.tabActive : ""}`}
          onClick={() => setTab("trending")}
        >
          Dành cho bạn
        </button>
        <button
          className={`${styles.tab} ${tab === "search" ? styles.tabActive : ""}`}
          onClick={() => setTab("search")}
        >
          Kết quả tìm kiếm
        </button>
        {selected && (
          <button className={styles.removeBtn} onClick={() => { stopAudio(); onSelect(null); }}>
            Gỡ nhạc
          </button>
        )}
      </div>

      {/* Selected preview */}
      {selected && (
        <div className={styles.selectedBar}>
          <div className={styles.selectedCover}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={selected.coverUrl} alt={selected.title} className={styles.selectedCoverImg} />
            <span className={styles.selectedNoteIcon}><IconNote /></span>
          </div>
          <div className={styles.selectedInfo}>
            <span className={styles.selectedTitle}>{selected.title}</span>
            <span className={styles.selectedArtist}>{selected.artist}</span>
          </div>
          <span className={styles.selectedCheck}><IconCheck /></span>
        </div>
      )}

      {/* Track list */}
      <div className={styles.trackList}>
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className={styles.skeletonRow}>
              <div className={styles.skeletonCover} />
              <div className={styles.skeletonText}>
                <div className={styles.skeletonLine} style={{ width: "60%" }} />
                <div className={styles.skeletonLine} style={{ width: "40%" }} />
              </div>
            </div>
          ))
        ) : tracks.length === 0 ? (
          <div className={styles.empty}>Không tìm thấy bài nhạc nào</div>
        ) : (
          tracks.map((track) => {
            const isSelected = selected?.trackId === track.id;
            const isPlaying = playingId === track.id;
            return (
              <div
                key={track.id}
                className={`${styles.trackRow} ${isSelected ? styles.trackRowSelected : ""}`}
                onClick={() => handleSelect(track)}
              >
                <div className={styles.trackCover}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={track.image}
                    alt={track.name}
                    className={styles.trackCoverImg}
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                  />
                  {isSelected && (
                    <div className={styles.trackCoverOverlay}>
                      <IconCheck />
                    </div>
                  )}
                </div>
                <div className={styles.trackInfo}>
                  <span className={styles.trackTitle}>{track.name}</span>
                  <span className={styles.trackArtist}>{track.artist_name}</span>
                </div>
                <span className={styles.trackDuration}>{fmtDuration(track.duration)}</span>
                <button
                  className={`${styles.previewBtn} ${isPlaying ? styles.previewBtnPlaying : ""}`}
                  onClick={(e) => { e.stopPropagation(); handlePreview(track); }}
                  aria-label={isPlaying ? "Dừng preview" : "Nghe thử"}
                >
                  {isPlaying ? <IconPause /> : <IconPlay />}
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
