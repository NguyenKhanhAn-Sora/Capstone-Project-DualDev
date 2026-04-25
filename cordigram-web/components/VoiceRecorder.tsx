"use client";

import React, { useState, useRef, useEffect } from "react";
import styles from "./VoiceRecorder.module.css";

interface VoiceRecorderProps {
  onRecordComplete: (audioBlob: Blob, duration: number) => void;
  onCancel: () => void;
}

export default function VoiceRecorder({
  onRecordComplete,
  onCancel,
}: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);
  const pausedTimeRef = useRef<number>(0);
  /** Why `stop()` was called — `onstop` always fires; without this, cancel (X) still uploads/sends. */
  const stopIntentRef = useRef<"send" | "cancel" | null>(null);

  // Start recording on mount
  useEffect(() => {
    startRecording();
    return () => {
      stopIntentRef.current = "cancel";
      if (timerRef.current) clearInterval(timerRef.current);
      stopRecording();
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Use webm format (widely supported)
      const mimeType = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/ogg")
          ? "audio/ogg"
          : "audio/mp4";

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());

        const intent = stopIntentRef.current;
        stopIntentRef.current = null;

        if (intent === "cancel") {
          onCancel();
          return;
        }

        // "send" (or legacy null — treat as send only if we have chunks)
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        const duration = Math.floor(recordingTime / 1000);
        onRecordComplete(audioBlob, duration);
      };

      mediaRecorder.start();
      setIsRecording(true);
      startTimeRef.current = Date.now();

      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime(
          Date.now() - startTimeRef.current + pausedTimeRef.current,
        );
      }, 100);
    } catch (error) {
      console.error("Failed to access microphone:", error);
      alert("Unable to access the microphone. Please allow microphone access.");
      onCancel();
    }
  };

  const stopRecording = () => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }
  };

  const handlePauseResume = () => {
    if (!mediaRecorderRef.current) return;

    if (isPaused) {
      // Resume
      mediaRecorderRef.current.resume();
      startTimeRef.current = Date.now();
      timerRef.current = setInterval(() => {
        setRecordingTime(
          Date.now() - startTimeRef.current + pausedTimeRef.current,
        );
      }, 100);
      setIsPaused(false);
    } else {
      // Pause
      mediaRecorderRef.current.pause();
      pausedTimeRef.current = recordingTime;
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      setIsPaused(true);
    }
  };

  const handleCancel = () => {
    stopIntentRef.current = "cancel";
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== "inactive") {
      stopRecording();
    } else {
      stopIntentRef.current = null;
      onCancel();
    }
    // When recorder stops normally, `onCancel` runs from `onstop` (not `onRecordComplete`).
  };

  const handleSend = () => {
    stopIntentRef.current = "send";
    stopRecording();
  };

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  };

  return (
    <div className={styles.voiceRecorder}>
      <div className={styles.recorderContent}>
        {/* Cancel Button */}
        <button
          className={styles.cancelButton}
          onClick={handleCancel}
          title="Cancel"
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>

        {/* Waveform Animation */}
        <div className={styles.waveformContainer}>
          <div
            className={`${styles.waveBar} ${!isPaused ? styles.animating : ""}`}
          ></div>
          <div
            className={`${styles.waveBar} ${!isPaused ? styles.animating : ""}`}
          ></div>
          <div
            className={`${styles.waveBar} ${!isPaused ? styles.animating : ""}`}
          ></div>
          <div
            className={`${styles.waveBar} ${!isPaused ? styles.animating : ""}`}
          ></div>
          <div
            className={`${styles.waveBar} ${!isPaused ? styles.animating : ""}`}
          ></div>
        </div>

        {/* Timer */}
        <div className={styles.timer}>{formatTime(recordingTime)}</div>

        {/* Pause/Resume Button */}
        <button
          className={styles.pauseButton}
          onClick={handlePauseResume}
          title={isPaused ? "Resume" : "Pause"}
        >
          {isPaused ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16"></rect>
              <rect x="14" y="4" width="4" height="16"></rect>
            </svg>
          )}
        </button>

        {/* Send Button */}
        <button
          className={styles.sendButton}
          onClick={handleSend}
          disabled={recordingTime < 1000}
          title="Send"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M16.6915026,12.4744748 L3.50612381,13.2599618 C3.19218622,13.2599618 3.03521743,13.4170592 3.03521743,13.5741566 L1.15159189,20.0151496 C0.8376543,20.8006365 0.99,21.89 1.77946707,22.52 C2.41,22.99 3.50612381,23.1 4.13399899,22.8429026 L21.714504,14.0454487 C22.6563168,13.5741566 23.1272231,12.6315722 22.9702544,11.6889879 L4.13399899,1.16346272 C3.34915502,0.9 2.40734225,0.9 1.77946707,1.4071521 C0.994623095,2.0605983 0.837654326,3.0031827 1.15159189,3.7886696 L3.03521743,10.2296625 C3.03521743,10.3867599 3.19218622,10.5438573 3.50612381,10.5438573 L16.6915026,11.3293442 C16.6915026,11.3293442 17.1624089,11.3293442 17.1624089,10.8580521 L17.1624089,12.4744748 C17.1624089,12.4744748 17.1624089,12.9457669 16.6915026,12.4744748 Z"></path>
          </svg>
        </button>
      </div>

      {/* Recording Indicator */}
      {isRecording && !isPaused && (
        <div className={styles.recordingIndicator}>
          <div className={styles.recordingDot}></div>
          <span>Recording...</span>
        </div>
      )}

      {isPaused && (
        <div className={styles.pausedIndicator}>
          <span>Paused</span>
        </div>
      )}
    </div>
  );
}
