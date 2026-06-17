"use client";

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import styles from "./custom-video-player.module.css";
import { videoVolumeStore } from "@/hooks/use-video-volume";
import { useLanguage } from "@/component/language-provider";
import { useTranslations } from "next-intl";

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;
const HIDE_DELAY = 3000;

export interface VideoQuality {
  label: string;
  height: number;
  url: string;
}

export interface CaptionTrack {
  lang: string;
  url: string;
}

const CAPTION_LANG_T_KEYS: Record<string, string> = {
  vi: "player.captionLangVi",
  en: "player.captionLangEn",
  zh: "player.captionLangZh",
  ja: "player.captionLangJa",
};

interface Props {
  src: string;
  className?: string;
  allowDownload?: boolean;
  onDownload?: () => void;
  onPlay?: () => void;
  playsInline?: boolean;
  /** Quality variants from backend (240p–1080p Cloudinary URLs) */
  qualities?: VideoQuality[] | null;
  /** Known duration in seconds (used to keep quality-switch spinner until fully transcoded) */
  expectedDuration?: number | null;
  /** Auto-play when ≥60% visible in viewport (feed mode) */
  autoPlayOnIntersect?: boolean;
  /** Auto-play on mount (post detail mode) */
  autoPlay?: boolean;
  /** Multi-language caption tracks */
  captionTracks?: CaptionTrack[] | null;
  /** Legacy single-track props (used as fallback when captionTracks is empty) */
  captionUrl?: string | null;
  captionLang?: string | null;
  /** Caption pipeline state from backend */
  captionStatus?: "pending" | "done" | "failed" | null;
}

function formatTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) return "0:00";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const CustomVideoPlayer = forwardRef<HTMLVideoElement, Props>(
  function CustomVideoPlayer(
    {
      src,
      className,
      allowDownload,
      onDownload,
      onPlay,
      playsInline,
      qualities,
      expectedDuration,
      autoPlayOnIntersect,
      autoPlay,
      captionTracks,
      captionUrl,
      captionLang,
      captionStatus,
    },
    forwardedRef,
  ) {
    const { t } = useLanguage();
    const tUI = useTranslations("ui");
    const getLangLabel = (lang: string) =>
      t(CAPTION_LANG_T_KEYS[lang] ?? "") || lang.toUpperCase();

    const internalRef = useRef<HTMLVideoElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const progressRef = useRef<HTMLInputElement | null>(null);
    const volumeSliderRef = useRef<HTMLInputElement | null>(null);
    const isScrubbing = useRef(false);
    const seekOnLoadRef = useRef<number | null>(null);
    const resumeAfterQualityRef = useRef(false);
    const userPausedRef = useRef(false);
    const expectedDurationRef = useRef(expectedDuration ?? null);

    const [currentSrc, setCurrentSrc] = useState(src);
    const [selectedQuality, setSelectedQuality] = useState<VideoQuality | null>(null);
    const [qualityLoading, setQualityLoading] = useState(false);
    const [playing, setPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [buffered, setBuffered] = useState(0);
    const [volume, setVolume] = useState(videoVolumeStore.get().volume);
    const [muted, setMuted] = useState(videoVolumeStore.get().muted);
    const [showVolume, setShowVolume] = useState(false);
    const [speed, setSpeed] = useState(1);
    const [showSpeed, setShowSpeed] = useState(false);
    const [showQuality, setShowQuality] = useState(false);
    const [showControls, setShowControls] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    // Caption state: null = off, string = selected lang
    const [selectedCaptionLang, setSelectedCaptionLang] = useState<string | null>(null);
    const [showCaptionMenu, setShowCaptionMenu] = useState(false);

    // Merge captionTracks prop with legacy single-track props
    const effectiveTracks = useMemo<CaptionTrack[]>(() => {
      if (captionTracks && captionTracks.length > 0) return captionTracks;
      if (captionUrl) return [{ lang: captionLang ?? "und", url: captionUrl }];
      return [];
    }, [captionTracks, captionUrl, captionLang]);

    const hasTracks = effectiveTracks.length > 0;

    // Keep expectedDurationRef in sync
    useEffect(() => {
      expectedDurationRef.current = expectedDuration ?? null;
    }, [expectedDuration]);

    // Reset state when src changes (e.g. carousel navigation)
    useEffect(() => {
      setCurrentSrc(src);
      setSelectedQuality(null);
      setQualityLoading(false);
      seekOnLoadRef.current = null;
      resumeAfterQualityRef.current = false;
      userPausedRef.current = false;
      setSelectedCaptionLang(null);
      setShowCaptionMenu(false);
    }, [src]);

    // Merge forwarded ref with internal ref
    const setRef = useCallback(
      (el: HTMLVideoElement | null) => {
        internalRef.current = el;
        if (typeof forwardedRef === "function") {
          forwardedRef(el);
        } else if (forwardedRef) {
          (forwardedRef as React.MutableRefObject<HTMLVideoElement | null>).current = el;
        }
      },
      [forwardedRef],
    );

    // Apply global volume to video element
    useEffect(() => {
      const apply = () => {
        const v = internalRef.current;
        if (!v) return;
        const s = videoVolumeStore.get();
        v.volume = s.volume;
        v.muted = s.muted;
        setVolume(s.volume);
        setMuted(s.muted);
      };
      apply();
      return videoVolumeStore.subscribe((s) => {
        const v = internalRef.current;
        if (!v) return;
        v.volume = s.volume;
        v.muted = s.muted;
        setVolume(s.volume);
        setMuted(s.muted);
      });
    }, []);

    // Video event listeners
    useEffect(() => {
      const v = internalRef.current;
      if (!v) return;

      const onPlayEvt = () => setPlaying(true);
      const onPauseEvt = () => setPlaying(false);
      const onTimeUpdate = () => {
        if (!isScrubbing.current) setCurrentTime(v.currentTime);
        if (v.buffered.length > 0) {
          setBuffered(v.buffered.end(v.buffered.length - 1));
        }
      };
      const isDurationReady = (d: number) => {
        const exp = expectedDurationRef.current;
        if (!exp || exp <= 0) return true;
        return isFinite(d) && d >= exp * 0.9;
      };

      const applyQualityReady = () => {
        if (seekOnLoadRef.current !== null) {
          v.currentTime = seekOnLoadRef.current;
          seekOnLoadRef.current = null;
        }
        setQualityLoading(false);
        if (resumeAfterQualityRef.current) {
          resumeAfterQualityRef.current = false;
          const p = v.play();
          if (p?.catch) p.catch(() => undefined);
        }
      };

      const onLoaded = () => {
        setDuration(v.duration);
        if (isDurationReady(v.duration)) applyQualityReady();
      };
      const onDurationChange = () => {
        setDuration(v.duration);
        if (isDurationReady(v.duration)) applyQualityReady();
      };
      const onEnded = () => setPlaying(false);
      const onRateChange = () => setSpeed(v.playbackRate);

      v.addEventListener("play", onPlayEvt);
      v.addEventListener("pause", onPauseEvt);
      v.addEventListener("timeupdate", onTimeUpdate);
      v.addEventListener("loadedmetadata", onLoaded);
      v.addEventListener("durationchange", onDurationChange);
      v.addEventListener("ended", onEnded);
      v.addEventListener("ratechange", onRateChange);

      if (v.readyState >= 1) {
        setDuration(v.duration);
        setCurrentTime(v.currentTime);
      }

      return () => {
        v.removeEventListener("play", onPlayEvt);
        v.removeEventListener("pause", onPauseEvt);
        v.removeEventListener("timeupdate", onTimeUpdate);
        v.removeEventListener("loadedmetadata", onLoaded);
        v.removeEventListener("durationchange", onDurationChange);
        v.removeEventListener("ended", onEnded);
        v.removeEventListener("ratechange", onRateChange);
      };
    }, [currentSrc]);

    // Auto-play on intersect (feed mode)
    useEffect(() => {
      if (!autoPlayOnIntersect) return;
      const v = internalRef.current;
      if (!v) return;

      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              if (!userPausedRef.current) {
                const p = v.play();
                if (p?.catch) p.catch(() => undefined);
                onPlay?.();
              }
            } else {
              v.pause();
            }
          });
        },
        { threshold: 0.6 },
      );

      observer.observe(v);
      return () => {
        observer.disconnect();
        try {
          v.pause();
        } catch {}
      };
    }, [autoPlayOnIntersect, currentSrc, onPlay]);

    // Auto-play on mount (post detail mode)
    useEffect(() => {
      if (!autoPlay) return;
      const v = internalRef.current;
      if (!v) return;
      const tryPlay = () => {
        const p = v.play();
        if (p?.catch) p.catch(() => undefined);
        onPlay?.();
      };
      if (v.readyState >= 3) {
        tryPlay();
      } else {
        v.addEventListener("canplay", tryPlay, { once: true });
        return () => v.removeEventListener("canplay", tryPlay);
      }
    }, [autoPlay, currentSrc, onPlay]);

    // Fullscreen change
    useEffect(() => {
      const handler = () => setIsFullscreen(!!document.fullscreenElement);
      document.addEventListener("fullscreenchange", handler);
      return () => document.removeEventListener("fullscreenchange", handler);
    }, []);

    // Sync all caption tracks with selected language
    useEffect(() => {
      const v = internalRef.current;
      if (!v) return;
      const syncTracks = () => {
        const tl = v.textTracks;
        for (let i = 0; i < tl.length; i++) {
          const track = tl[i];
          const trackLang = track.language || effectiveTracks[i]?.lang || "";
          track.mode =
            selectedCaptionLang && trackLang === selectedCaptionLang
              ? "showing"
              : "hidden";
        }
      };
      syncTracks();
      const timer = setTimeout(syncTracks, 100);
      return () => clearTimeout(timer);
    }, [selectedCaptionLang, effectiveTracks, currentSrc]);

    // Controls auto-hide
    const scheduleHide = useCallback(() => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      hideTimerRef.current = setTimeout(
        () => setShowControls(false),
        HIDE_DELAY,
      );
    }, []);

    const revealControls = useCallback(() => {
      setShowControls(true);
      scheduleHide();
    }, [scheduleHide]);

    const handleMouseMove = useCallback(
      () => revealControls(),
      [revealControls],
    );
    const handleMouseLeave = useCallback(() => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      setShowControls(false);
      setShowVolume(false);
      setShowSpeed(false);
      setShowQuality(false);
      setShowCaptionMenu(false);
    }, []);
    const handleTouchStart = useCallback(
      () => revealControls(),
      [revealControls],
    );

    // Close popups when clicking outside controls area
    useEffect(() => {
      const onDocClick = (e: MouseEvent) => {
        const controls = containerRef.current?.querySelector(
          `.${styles.controls}`,
        );
        if (controls && !controls.contains(e.target as Node)) {
          setShowVolume(false);
          setShowSpeed(false);
          setShowQuality(false);
          setShowCaptionMenu(false);
        }
      };
      document.addEventListener("mousedown", onDocClick);
      return () => document.removeEventListener("mousedown", onDocClick);
    }, []);

    // Play/pause toggle
    const togglePlay = useCallback(() => {
      const v = internalRef.current;
      if (!v) return;
      if (v.paused) {
        userPausedRef.current = false;
        const p = v.play();
        if (p?.catch) p.catch(() => undefined);
      } else {
        userPausedRef.current = true;
        v.pause();
      }
    }, []);

    // Seek
    const handleSeekChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const v = internalRef.current;
        if (!v) return;
        const t = parseFloat(e.target.value);
        v.currentTime = t;
        setCurrentTime(t);
      },
      [],
    );
    const handleSeekMouseDown = useCallback(() => {
      isScrubbing.current = true;
    }, []);
    const handleSeekMouseUp = useCallback(() => {
      isScrubbing.current = false;
    }, []);

    // Volume
    const toggleMute = useCallback(() => {
      videoVolumeStore.set({ muted: !muted });
    }, [muted]);

    const handleVolumeChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const v = parseFloat(e.target.value);
        videoVolumeStore.set({ volume: v, muted: v === 0 });
      },
      [],
    );

    // Speed
    const handleSpeed = useCallback((s: number) => {
      const v = internalRef.current;
      if (!v) return;
      v.playbackRate = s;
      setSpeed(s);
      setShowSpeed(false);
    }, []);

    // Quality
    const handleQualityChange = useCallback(
      (q: VideoQuality | null) => {
        const v = internalRef.current;
        seekOnLoadRef.current = v?.currentTime ?? 0;
        resumeAfterQualityRef.current = v ? !v.paused : false;
        v?.pause();
        setSelectedQuality(q);
        setCurrentSrc(q ? q.url : src);
        setQualityLoading(true);
        setShowQuality(false);
      },
      [src],
    );

    // Fullscreen
    const toggleFullscreen = useCallback(() => {
      const container = containerRef.current;
      const v = internalRef.current;
      if (!container) return;
      if (!document.fullscreenElement) {
        container.requestFullscreen().catch(() => {
          if (v && (v as any).webkitEnterFullscreen) {
            (v as any).webkitEnterFullscreen();
          }
        });
      } else {
        document.exitFullscreen().catch(() => undefined);
      }
    }, []);

    const progressPercent =
      duration > 0 ? (currentTime / duration) * 100 : 0;
    const bufferedPercent =
      duration > 0 ? (buffered / duration) * 100 : 0;
    const volumeIcon =
      muted || volume === 0 ? "muted" : volume < 0.5 ? "low" : "high";
    const hasQualities = qualities && qualities.length > 0;
    const qualityLabel = selectedQuality ? selectedQuality.label : "Auto";

    return (
      <div
        ref={containerRef}
        className={`${styles.playerWrap} ${className ?? ""}`}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleTouchStart}
      >
        <video
          ref={setRef}
          src={currentSrc}
          className={styles.videoEl}
          playsInline={playsInline}
          preload="metadata"
          crossOrigin="anonymous"
          onContextMenu={(e) => e.preventDefault()}
        >
          {effectiveTracks.map((track) => (
            <track
              key={track.lang}
              kind="subtitles"
              src={track.url}
              srcLang={track.lang}
              label={getLangLabel(track.lang)}
            />
          ))}
        </video>

        {/* Click area to toggle play/pause */}
        <div className={styles.clickArea} onClick={togglePlay} aria-hidden />

        {/* Quality switching overlay */}
        {qualityLoading && (
          <div className={styles.qualityLoadingOverlay}>
            <div className={styles.qualitySpinner} />
          </div>
        )}

        {/* Controls overlay */}
        <div
          className={`${styles.controls} ${showControls || !playing ? styles.controlsVisible : ""}`}
        >
          {/* Progress bar */}
          <div className={styles.progressWrap}>
            <div className={styles.progressTrack}>
              <div
                className={styles.progressBuffered}
                style={{ width: `${bufferedPercent}%` }}
              />
              <div
                className={styles.progressFill}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <input
              ref={progressRef}
              type="range"
              className={styles.progressInput}
              min={0}
              max={duration || 100}
              step={0.01}
              value={currentTime}
              onChange={handleSeekChange}
              onMouseDown={handleSeekMouseDown}
              onMouseUp={handleSeekMouseUp}
              onTouchStart={handleSeekMouseDown}
              onTouchEnd={handleSeekMouseUp}
              aria-label={tUI("videoPlayer.progress")}
            />
          </div>

          {/* Bottom bar */}
          <div className={styles.bottomBar}>
            {/* Left: play + time */}
            <div className={styles.leftGroup}>
              <button
                type="button"
                className={styles.iconBtn}
                onClick={togglePlay}
                aria-label={playing ? "Pause" : "Play"}
              >
                {playing ? <PauseIcon /> : <PlayIcon />}
              </button>
              <span className={styles.timeDisplay}>
                {formatTime(currentTime)}
                <span className={styles.timeSep}>/</span>
                {formatTime(duration)}
              </span>
            </div>

            {/* Right: volume, quality, speed, captions, download, fullscreen */}
            <div className={styles.rightGroup}>
              {/* Volume */}
              <div className={styles.volumeGroup}>
                <button
                  type="button"
                  className={styles.iconBtn}
                  onClick={() => {
                    setShowVolume((p) => !p);
                    setShowSpeed(false);
                    setShowQuality(false);
                    setShowCaptionMenu(false);
                  }}
                  aria-label={muted ? "Unmute" : "Mute"}
                >
                  {volumeIcon === "muted" ? (
                    <MuteIcon />
                  ) : volumeIcon === "low" ? (
                    <VolumeLowIcon />
                  ) : (
                    <VolumeHighIcon />
                  )}
                </button>
                {showVolume && (
                  <div
                    className={styles.volumeSliderWrap}
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <input
                      ref={volumeSliderRef}
                      type="range"
                      className={styles.volumeSlider}
                      min={0}
                      max={1}
                      step={0.02}
                      value={muted ? 0 : volume}
                      onChange={handleVolumeChange}
                      aria-label={tUI("videoPlayer.volume")}
                    />
                  </div>
                )}
              </div>

              {/* Quality selector */}
              {hasQualities && (
                <div className={styles.speedGroup}>
                  <button
                    type="button"
                    className={styles.iconBtn}
                    onClick={() => {
                      setShowQuality((p) => !p);
                      setShowSpeed(false);
                      setShowVolume(false);
                      setShowCaptionMenu(false);
                    }}
                    aria-label={tUI("videoPlayer.quality")}
                  >
                    <span className={styles.speedLabel}>{qualityLabel}</span>
                  </button>
                  {showQuality && (
                    <div
                      className={styles.speedMenu}
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        className={`${styles.speedItem} ${selectedQuality === null ? styles.speedItemActive : ""}`}
                        onClick={() => handleQualityChange(null)}
                      >
                        Auto
                      </button>
                      {qualities.map((q) => (
                        <button
                          key={q.label}
                          type="button"
                          className={`${styles.speedItem} ${selectedQuality?.label === q.label ? styles.speedItemActive : ""}`}
                          onClick={() => handleQualityChange(q)}
                        >
                          {q.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Speed */}
              <div className={styles.speedGroup}>
                <button
                  type="button"
                  className={styles.iconBtn}
                  onClick={() => {
                    setShowSpeed((p) => !p);
                    setShowVolume(false);
                    setShowQuality(false);
                    setShowCaptionMenu(false);
                  }}
                  aria-label="Playback speed"
                >
                  <span className={styles.speedLabel}>{speed}x</span>
                </button>
                {showSpeed && (
                  <div
                    className={styles.speedMenu}
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    {SPEEDS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        className={`${styles.speedItem} ${s === speed ? styles.speedItemActive : ""}`}
                        onClick={() => handleSpeed(s)}
                      >
                        {s}x
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Captions — pending spinner when still generating */}
              {!hasTracks && captionStatus === "pending" && (
                <button
                  type="button"
                  className={styles.iconBtn}
                  disabled
                  title={t("player.captionGenerating")}
                  aria-label={t("player.captionGenerating")}
                >
                  <CcSpinnerIcon />
                </button>
              )}

              {/* Captions — language dropdown (only when caption tracks exist) */}
              {hasTracks && (
                <div className={styles.speedGroup}>
                  <button
                    type="button"
                    className={`${styles.iconBtn} ${selectedCaptionLang !== null ? styles.ccActive : ""}`}
                    onClick={() => {
                      setShowCaptionMenu((p) => !p);
                      setShowVolume(false);
                      setShowSpeed(false);
                      setShowQuality(false);
                    }}
                    aria-label={tUI("videoPlayer.captions")}
                    aria-pressed={selectedCaptionLang !== null}
                  >
                    <CcIcon />
                  </button>
                  {showCaptionMenu && (
                    <div
                      className={styles.speedMenu}
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      {/* Off option */}
                      <button
                        type="button"
                        className={`${styles.speedItem} ${selectedCaptionLang === null ? styles.speedItemActive : ""}`}
                        onClick={() => {
                          setSelectedCaptionLang(null);
                          setShowCaptionMenu(false);
                        }}
                      >
                        {t("player.captionOff")}
                      </button>
                      {effectiveTracks.map((track) => (
                        <button
                          key={track.lang}
                          type="button"
                          className={`${styles.speedItem} ${selectedCaptionLang === track.lang ? styles.speedItemActive : ""}`}
                          onClick={() => {
                            setSelectedCaptionLang(track.lang);
                            setShowCaptionMenu(false);
                          }}
                        >
                          {getLangLabel(track.lang)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Download (conditional) */}
              {allowDownload && onDownload ? (
                <button
                  type="button"
                  className={styles.iconBtn}
                  onClick={onDownload}
                  aria-label={tUI("videoPlayer.download")}
                >
                  <DownloadIcon />
                </button>
              ) : null}

              {/* Fullscreen */}
              <button
                type="button"
                className={styles.iconBtn}
                onClick={toggleFullscreen}
                aria-label={
                  isFullscreen ? "Exit fullscreen" : "Enter fullscreen"
                }
              >
                {isFullscreen ? <ExitFullscreenIcon /> : <FullscreenIcon />}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  },
);

export default CustomVideoPlayer;

// ─── SVG Icons ───────────────────────────────────────────────────────────────

function PlayIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="5,3 19,12 5,21" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </svg>
  );
}

function MuteIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M11 5L6 9H2v6h4l5 4V5z" />
      <line
        x1="23"
        y1="9"
        x2="17"
        y2="15"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <line
        x1="17"
        y1="9"
        x2="23"
        y2="15"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function VolumeLowIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M11 5L6 9H2v6h4l5 4V5z" />
      <path
        d="M15.54 8.46a5 5 0 0 1 0 7.07"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

function VolumeHighIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M11 5L6 9H2v6h4l5 4V5z" />
      <path
        d="M15.54 8.46a5 5 0 0 1 0 7.07"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M19.07 4.93a10 10 0 0 1 0 14.14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function FullscreenIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="15 3 21 3 21 9" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="21" y1="3" x2="14" y2="10" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  );
}

function ExitFullscreenIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="4 14 10 14 10 20" />
      <polyline points="20 10 14 10 14 4" />
      <line x1="10" y1="14" x2="3" y2="21" />
      <line x1="21" y1="3" x2="14" y2="10" />
    </svg>
  );
}

function CcIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <rect
        x="2"
        y="5"
        width="20"
        height="14"
        rx="2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <text
        x="5"
        y="16"
        fontSize="8"
        fontWeight="700"
        fontFamily="Arial,sans-serif"
        fill="currentColor"
        stroke="none"
      >
        CC
      </text>
    </svg>
  );
}

function CcSpinnerIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <rect
        x="2"
        y="5"
        width="20"
        height="14"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.8"
        opacity="0.4"
      />
      <circle
        cx="12"
        cy="12"
        r="4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeDasharray="16"
        strokeDashoffset="8"
        strokeLinecap="round"
        opacity="0.7"
      >
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 12 12"
          to="360 12 12"
          dur="1s"
          repeatCount="indefinite"
        />
      </circle>
    </svg>
  );
}
