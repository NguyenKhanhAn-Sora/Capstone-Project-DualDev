import { useEffect, useRef, useState } from 'react';

/**
 * Hook to manage call sounds (ringtone/dialing tone)
 * 
 * @param soundType - 'incoming' for ringtone (receiver), 'outgoing' for dialing tone (caller)
 * @param shouldPlay - Whether to play the sound
 */
export function useCallSound(
  soundType: 'incoming' | 'outgoing',
  shouldPlay: boolean
) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioError, setAudioError] = useState<boolean>(false);

  useEffect(() => {
    // If audio failed to load, don't try again
    if (audioError) return;

    // Create audio element on mount
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.loop = true;
      audioRef.current.volume = 0.5;
      
      // Set src immediately
      const audioSrc = soundType === 'incoming' 
        ? '/sounds/incoming-call.mp3'
        : '/sounds/outgoing-call.mp3';
      
      audioRef.current.src = audioSrc;
      
      // Handle errors gracefully
      audioRef.current.onerror = () => {
        console.warn(`⚠️ [Sound] ${soundType} audio file not found`);
        setAudioError(true);
      };
    }

    const audio = audioRef.current;

    // Play/pause control
    if (shouldPlay && !audioError) {
      const playPromise = audio.play();
      
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          // Silently handle autoplay and abort errors (normal behavior)
          if (error.name === 'NotAllowedError' || error.name === 'AbortError') {
            // Autoplay blocked or interrupted - ignore
          } else {
            // Real error
            console.warn(`⚠️ [Sound] ${soundType} playback error:`, error.name);
            setAudioError(true);
          }
        });
      }
    } else if (!shouldPlay) {
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch (e) {
        // Ignore pause errors
      }
    }

    // Cleanup
    return () => {
      if (!shouldPlay && audioRef.current) {
        try {
          audioRef.current.pause();
          audioRef.current.currentTime = 0;
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    };
  }, [soundType, shouldPlay, audioError]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        try {
          audioRef.current.pause();
          audioRef.current.src = '';
          audioRef.current = null;
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    };
  }, []);
}
