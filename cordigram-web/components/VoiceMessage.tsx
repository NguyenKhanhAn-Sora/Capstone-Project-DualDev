'use client';

import React, { useState, useRef, useEffect } from 'react';
import styles from './VoiceMessage.module.css';

interface VoiceMessageProps {
  voiceUrl: string;
  duration: number;
  isFromCurrentUser?: boolean;
}

export default function VoiceMessage({ voiceUrl, duration, isFromCurrentUser = false }: VoiceMessageProps) {
  console.log('🎤 [VOICE-COMPONENT] Rendering with:', { voiceUrl, duration, isFromCurrentUser });
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    console.log('🎤 [VOICE-COMPONENT] useEffect loading audio:', voiceUrl);
    // Create audio element
    const audio = new Audio(voiceUrl);
    audioRef.current = audio;

    audio.addEventListener('loadeddata', () => {
      setIsLoading(false);
    });

    audio.addEventListener('error', () => {
      setIsLoading(false);
      setError(true);
      console.error('Failed to load voice message');
    });

    audio.addEventListener('ended', () => {
      setIsPlaying(false);
      setCurrentTime(0);
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    });

    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
      audio.pause();
      audio.src = '';
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
      audioRef.current.play().catch(err => {
        console.error('Failed to play audio:', err);
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
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  if (error) {
    return (
      <div className={`${styles.voiceMessage} ${isFromCurrentUser ? styles.sent : styles.received}`}>
        <div className={styles.errorIcon}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5zm1 16h-2v-2h2v2zm0-4h-2V7h2v7z"/>
          </svg>
        </div>
        <span className={styles.errorText}>Không thể phát</span>
      </div>
    );
  }

  return (
    <div className={`${styles.voiceMessage} ${isFromCurrentUser ? styles.sent : styles.received}`}>
      {/* Play/Pause Button */}
      <button
        className={styles.playButton}
        onClick={handlePlayPause}
        disabled={isLoading}
        title={isPlaying ? 'Tạm dừng' : 'Phát'}
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
