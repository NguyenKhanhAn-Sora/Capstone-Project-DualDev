import { useEffect, useRef } from "react";

/**
 * Hook to manage call sounds (ringtone/dialing tone)
 *
 * @param soundType - 'incoming' for ringtone (receiver), 'outgoing' for dialing tone (caller)
 * @param shouldPlay - Whether to play the sound
 */
export function useCallSound(
  soundType: "incoming" | "outgoing",
  shouldPlay: boolean,
) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const prevShouldPlay = useRef(false);
  /** Missing file / decode error — skip until the next ring/dial session */
  const fileMissingRef = useRef(false);

  useEffect(() => {
    if (shouldPlay && !prevShouldPlay.current) {
      fileMissingRef.current = false;
    }
    prevShouldPlay.current = shouldPlay;

    if (fileMissingRef.current) return;

    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.loop = true;
      audioRef.current.volume = 0.5;

      const audioSrc =
        soundType === "incoming"
          ? "/sounds/universfield-ringtone-090-496416.mp3"
          : "/sounds/outgoing-call.mp3";

      audioRef.current.src = audioSrc;

      audioRef.current.onerror = () => {
        console.warn(`⚠️ [Sound] ${soundType} audio file not found`);
        fileMissingRef.current = true;
      };
    }

    const audio = audioRef.current;

    if (shouldPlay) {
      const playPromise = audio.play();

      if (playPromise !== undefined) {
        playPromise.catch((error: DOMException) => {
          if (error.name === "NotAllowedError" || error.name === "AbortError") {
            return;
          }
          console.warn(`⚠️ [Sound] ${soundType} playback error:`, error.name);
        });
      }
    } else {
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch {
        // ignore
      }
    }

    return () => {
      if (!shouldPlay && audioRef.current) {
        try {
          audioRef.current.pause();
          audioRef.current.currentTime = 0;
        } catch {
          // ignore
        }
      }
    };
  }, [soundType, shouldPlay]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        try {
          audioRef.current.pause();
          audioRef.current.src = "";
          audioRef.current = null;
        } catch {
          // ignore
        }
      }
    };
  }, []);
}
