"use client";

import React, { useState, useRef, useEffect } from "react";
import styles from "./VoiceMessage.module.css";

interface VoiceMessageProps {
  voiceUrl: string;
  duration: number;
  isFromCurrentUser?: boolean;
}

export default function VoiceMessage({
  voiceUrl,
  duration,
  isFromCurrentUser = false,
}: VoiceMessageProps) {
  console.log("🎤 [VOICE-COMPONENT] Rendering with:", {
    voiceUrl,
    duration,
    isFromCurrentUser,
  });

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // isCancelled prevents state updates after cleanup (fixes React StrictMode double-mount)
    let isCancelled = false;
    let objectUrl: string | null = null;
    let audio: HTMLAudioElement | null = null;

    // Reset state on each effect run
    setError(false);
    setIsLoading(true);

    console.log("🎤 [VOICE] useEffect triggered, URL:", voiceUrl);

    if (!voiceUrl || voiceUrl.trim() === "") {
      console.error("❌ [VOICE] Empty or invalid voice URL");
      setIsLoading(false);
      setError(true);
      return;
    }

    // Ensure HTTPS for Cloudinary URLs (avoids mixed content blocking)
    const safeUrl = voiceUrl.startsWith("http://res.cloudinary.com")
      ? voiceUrl.replace("http://", "https://")
      : voiceUrl;

    if (safeUrl !== voiceUrl) {
      console.log("🎤 [VOICE] Upgraded to HTTPS:", safeUrl);
    }

    const loadAudio = async () => {
      try {
        let audioSrc = safeUrl;

        // For Cloudinary URLs, fetch as blob to guarantee correct MIME type
        if (safeUrl.includes("cloudinary.com")) {
          console.log("🎤 [VOICE] Fetching Cloudinary audio as blob from:", safeUrl);

          const response = await fetch(safeUrl);
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          if (isCancelled) return;

          const blob = await response.blob();
          console.log("🎤 [VOICE] Blob loaded:", blob.size, "bytes, type:", blob.type);

          if (isCancelled) return;

          // Create object URL from blob - browser gets correct MIME from blob
          objectUrl = URL.createObjectURL(blob);
          audioSrc = objectUrl;
          console.log("🎤 [VOICE] Object URL created from blob");
        }

        if (isCancelled) return;

        // Create Audio element ONLY after we have the source ready
        audio = new Audio();
        audioRef.current = audio;

        // Add event listeners BEFORE setting src
        audio.addEventListener("loadeddata", () => {
          if (!isCancelled) {
            console.log("✅ [VOICE] Audio loaded successfully");
            setIsLoading(false);
          }
        });

        audio.addEventListener("error", () => {
          // Ignore errors if cancelled or if src is empty (cleanup triggered this)
          if (isCancelled) return;
          if (!audio || !audio.src || audio.src === "" || audio.src === window.location.href) {
            console.log("🎤 [VOICE] Ignoring error on empty src (likely cleanup)");
            return;
          }
          console.error("❌ [VOICE] Audio playback error, code:", audio.error?.code, "msg:", audio.error?.message);
          setIsLoading(false);
          setError(true);
        });

        audio.addEventListener("ended", () => {
          if (!isCancelled) {
            setIsPlaying(false);
            setCurrentTime(0);
            if (progressIntervalRef.current) {
              clearInterval(progressIntervalRef.current);
            }
          }
        });

        // Set src and load - src is guaranteed to be valid at this point
        audio.src = audioSrc;
        audio.load();
        console.log("🎤 [VOICE] Audio.src set and load() called");
      } catch (err) {
        if (!isCancelled) {
          console.error("❌ [VOICE] Failed to load audio:", err);
          setIsLoading(false);
          setError(true);
        }
      }
    };

    loadAudio();

    return () => {
      isCancelled = true;
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
      if (audio) {
        audio.pause();
        // Remove src without triggering error (isCancelled = true handles it)
        audio.removeAttribute("src");
        audio.load();
      }
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [voiceUrl]);

  const handlePlayPause = () => {
    if (!audioRef.current || error) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    } else {
      audioRef.current.play().catch((err) => {
        console.error("Failed to play audio:", err);
        setError(true);
      });
      setIsPlaying(true);

      // Update progress
      progressIntervalRef.current = setInterval(() => {
        if (audioRef.current) {
          setCurrentTime(audioRef.current.currentTime);
        }
      }, 100);
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || error) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const seekTime = percent * duration;

    audioRef.current.currentTime = seekTime;
    setCurrentTime(seekTime);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  if (error) {
    return (
      <div
        className={`${styles.voiceMessage} ${isFromCurrentUser ? styles.sent : styles.received}`}
      >
        <div className={styles.errorIcon}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5zm1 16h-2v-2h2v2zm0-4h-2V7h2v7z" />
          </svg>
        </div>
        <span className={styles.errorText}>Unable to play</span>
      </div>
    );
  }

  return (
    <div
      className={`${styles.voiceMessage} ${isFromCurrentUser ? styles.sent : styles.received}`}
    >
      {/* Play/Pause Button */}
      <button
        className={styles.playButton}
        onClick={handlePlayPause}
        disabled={isLoading}
        title={isPlaying ? "Pause" : "Play"}
      >
        {isLoading ? (
          <div className={styles.loadingSpinner}></div>
        ) : isPlaying ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="4" width="4" height="16"></rect>
            <rect x="14" y="4" width="4" height="16"></rect>
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
        )}
      </button>

      {/* Progress Bar */}
      <div className={styles.progressContainer}>
        <div className={styles.waveform} onClick={handleSeek}>
          <div className={styles.progressBar} style={{ width: `${progress}%` }}>
            <div className={styles.progressHandle}></div>
          </div>

          {/* Waveform bars */}
          <div className={styles.waveformBars}>
            {Array.from({ length: 30 }).map((_, i) => (
              <div
                key={i}
                className={styles.waveformBar}
                style={{
                  height: `${20 + Math.random() * 60}%`,
                  opacity: i < (progress / 100) * 30 ? 1 : 0.3,
                }}
              ></div>
            ))}
          </div>
        </div>

        {/* Time Display */}
        <div className={styles.timeDisplay}>
          {isPlaying ? formatTime(currentTime) : formatTime(duration)}
        </div>
      </div>
    </div>
  );
}
