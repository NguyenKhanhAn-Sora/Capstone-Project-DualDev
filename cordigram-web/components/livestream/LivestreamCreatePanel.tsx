"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import EmojiPicker from "emoji-picker-react";
import {
  createLivestream,
  type LivestreamLatencyMode,
} from "@/lib/livestream-api";
import {
  clearPendingScreenShareStream,
  setPendingScreenShareStream,
} from "@/lib/livestream-screen-share-cache";
import { searchProfiles, type ProfileSearchItem } from "@/lib/api";
import panelStyles from "./livestream-create-panel.module.css";

const visibilityOptions: Array<{
  value: "public" | "followers" | "private";
  label: string;
}> = [
  { value: "public", label: "Public" },
  { value: "followers", label: "Friends / Following" },
  { value: "private", label: "Private" },
];

const latencyOptions: Array<{
  value: LivestreamLatencyMode;
  label: string;
  note: string;
}> = [
  {
    value: "adaptive",
    label: "Adaptive latency",
    note: "Auto-tunes bitrate and quality based on network and device performance.",
  },
  {
    value: "balanced",
    label: "Balanced latency",
    note: "Keeps a stable stream with moderate delay and consistent quality.",
  },
  {
    value: "low",
    label: "Low latency",
    note: "Minimizes delay for near real-time interaction, with more aggressive quality trade-offs.",
  },
];

const MIC_LEVEL_MULTIPLIER = 1.5;
const MIC_MONITOR_DELAY_SECONDS = 0.2;

function getHighQualityScreenCaptureConstraints(mode: LivestreamLatencyMode) {
  if (mode === "low") {
    return {
      width: { ideal: 1280, max: 1920 },
      height: { ideal: 720, max: 1080 },
      frameRate: { ideal: 24, max: 30 },
      cursor: "always",
    } as MediaTrackConstraints;
  }

  if (mode === "balanced") {
    return {
      width: { ideal: 1920, max: 2560 },
      height: { ideal: 1080, max: 1440 },
      frameRate: { ideal: 30, max: 30 },
      cursor: "always",
    } as MediaTrackConstraints;
  }

  return {
    width: { ideal: 2560, max: 3840 },
    height: { ideal: 1440, max: 2160 },
    frameRate: { ideal: 30, max: 60 },
    cursor: "always",
  } as MediaTrackConstraints;
}

async function optimizeScreenVideoTrack(
  track: MediaStreamTrack,
  mode: LivestreamLatencyMode,
) {
  try {
    (track as MediaStreamTrack & { contentHint?: string }).contentHint = "detail";
  } catch {
    // Ignore unsupported contentHint assignment.
  }

  try {
    await track.applyConstraints(getHighQualityScreenCaptureConstraints(mode));
  } catch {
    // Some browsers reject strict constraints after picker selection; keep original track.
  }
}

export default function LivestreamCreatePanel() {
  const router = useRouter();
  type PermissionState = "unknown" | "granted" | "denied" | "unsupported";
  type PreviewAttempt = "screen" | null;
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [pinnedComment, setPinnedComment] = useState("");
  const [location, setLocation] = useState("");
  const [visibility, setVisibility] = useState<"public" | "followers" | "private">("public");
  const [latencyMode, setLatencyMode] = useState<LivestreamLatencyMode>("adaptive");
  const [visibilityOpen, setVisibilityOpen] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [mentionSuggestions, setMentionSuggestions] = useState<ProfileSearchItem[]>([]);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionHighlight, setMentionHighlight] = useState(-1);
  const [activeMentionRange, setActiveMentionRange] = useState<{ start: number; end: number } | null>(null);
  const [locationSuggestions, setLocationSuggestions] = useState<
    Array<{ label: string; lat: string; lon: string }>
  >([]);
  const [locationOpen, setLocationOpen] = useState(false);
  const [locationHighlight, setLocationHighlight] = useState(-1);
  const [locationLoading, setLocationLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [titleError, setTitleError] = useState("");
  const [micPermission, setMicPermission] = useState<PermissionState>("unknown");
  const [screenPermission, setScreenPermission] = useState<PermissionState>("unknown");
  const [permissionBusy, setPermissionBusy] = useState<"microphone" | "screen" | null>(null);
  const [permissionError, setPermissionError] = useState("");
  const [previewMode, setPreviewMode] = useState<"none" | "screen">("none");
  const [lastPreviewAttempt, setLastPreviewAttempt] = useState<PreviewAttempt>(null);
  const [microphoneDevices, setMicrophoneDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicrophoneId, setSelectedMicrophoneId] = useState("");
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [isMicTesting, setIsMicTesting] = useState(false);
  const [micOverlayOpen, setMicOverlayOpen] = useState(false);
  const [micOverlayState, setMicOverlayState] = useState<"prompt" | "blocked" | "granted">("prompt");
  const titleRef = useRef<HTMLTextAreaElement | null>(null);
  const visibilityRef = useRef<HTMLDivElement | null>(null);
  const emojiRef = useRef<HTMLDivElement | null>(null);
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const previewStreamRef = useRef<MediaStream | null>(null);
  const keepScreenPreviewOnUnmountRef = useRef(false);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micAudioContextRef = useRef<AudioContext | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const micMonitorGainRef = useRef<GainNode | null>(null);
  const micRafRef = useRef<number | null>(null);
  const micOverlayTimerRef = useRef<number | null>(null);

  const selectedVisibility = useMemo(
    () =>
      visibilityOptions.find((option) => option.value === visibility) ||
      visibilityOptions[0],
    [visibility],
  );

  const titleWordCount = useMemo(() => {
    const trimmed = title.trim();
    if (!trimmed) return 0;
    return trimmed.split(/\s+/).filter(Boolean).length;
  }, [title]);

  const permissionLabel = (state: PermissionState) => {
    if (state === "granted") return "Granted";
    if (state === "denied") return "Blocked";
    if (state === "unsupported") return "Unsupported";
    return "Not requested";
  };

  const stopMicMeter = () => {
    if (micRafRef.current) {
      cancelAnimationFrame(micRafRef.current);
      micRafRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
    }
    if (micAudioContextRef.current) {
      void micAudioContextRef.current.close().catch(() => {
        // Ignore close errors.
      });
      micAudioContextRef.current = null;
    }
    micAnalyserRef.current = null;
    micMonitorGainRef.current = null;
    setMicLevel(0);
    setIsMicTesting(false);
  };

  const closeMicOverlay = () => {
    setMicOverlayOpen(false);
    if (micOverlayTimerRef.current) {
      window.clearTimeout(micOverlayTimerRef.current);
      micOverlayTimerRef.current = null;
    }
  };

  const startMicTest = (stream: MediaStream) => {
    stopMicMeter();
    micStreamRef.current = stream;

    const AudioContextCtor =
      typeof window !== "undefined"
        ? window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        : null;

    if (!AudioContextCtor) {
      return;
    }

    const audioCtx = new AudioContextCtor();
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.82;
    const delayNode = audioCtx.createDelay(1);
    delayNode.delayTime.value = MIC_MONITOR_DELAY_SECONDS;

    const source = audioCtx.createMediaStreamSource(stream);
    const monitorGain = audioCtx.createGain();
    monitorGain.gain.value = 0.9;

    source.connect(analyser);
    source.connect(delayNode);
    delayNode.connect(monitorGain);
    monitorGain.connect(audioCtx.destination);

    micAudioContextRef.current = audioCtx;
    micAnalyserRef.current = analyser;
    micMonitorGainRef.current = monitorGain;

    const data = new Uint8Array(analyser.fftSize);
    setIsMicTesting(true);

    const tick = () => {
      const activeAnalyser = micAnalyserRef.current;
      if (!activeAnalyser) return;
      activeAnalyser.getByteTimeDomainData(data);
      let sumSquares = 0;
      for (let i = 0; i < data.length; i += 1) {
        const sample = (data[i] - 128) / 128;
        sumSquares += sample * sample;
      }
      const rms = Math.sqrt(sumSquares / data.length);
      const nextLevel = Math.max(0, Math.min(100, Math.round(rms * 170 * MIC_LEVEL_MULTIPLIER)));
      setMicLevel(nextLevel);
      micRafRef.current = requestAnimationFrame(tick);
    };

    micRafRef.current = requestAnimationFrame(tick);
  };

  const loadMediaDevices = async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
      return;
    }
    try {
      setDevicesLoading(true);
      const devices = await navigator.mediaDevices.enumerateDevices();
      const microphones = devices.filter((device) => device.kind === "audioinput");
      setMicrophoneDevices(microphones);

      setSelectedMicrophoneId((prev) => {
        if (prev && microphones.some((device) => device.deviceId === prev)) return prev;
        return microphones[0]?.deviceId || "";
      });
    } finally {
      setDevicesLoading(false);
    }
  };

  const stopPreview = () => {
    if (previewStreamRef.current) {
      previewStreamRef.current.getTracks().forEach((track) => track.stop());
      previewStreamRef.current = null;
    }
    clearPendingScreenShareStream();
    if (previewRef.current) {
      previewRef.current.srcObject = null;
    }
    setPreviewMode("none");
  };

  const attachPreviewStream = (stream: MediaStream, mode: "screen") => {
    if (previewStreamRef.current) {
      previewStreamRef.current.getTracks().forEach((track) => track.stop());
    }
    previewStreamRef.current = stream;
    setPendingScreenShareStream(stream);
    setPreviewMode(mode);
    if (previewRef.current) {
      previewRef.current.srcObject = stream;
      void previewRef.current.play().catch(() => {
        // Browser may require additional user interaction before playback.
      });
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!visibilityRef.current) return;
      if (!visibilityRef.current.contains(event.target as Node)) {
        setVisibilityOpen(false);
      }

      if (emojiRef.current && !emojiRef.current.contains(event.target as Node)) {
        setShowEmojiPicker(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setVisibilityOpen(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    const loadPermissions = async () => {
      if (typeof navigator === "undefined" || !("permissions" in navigator)) {
        return;
      }

      const permissionsApi = navigator.permissions;

      try {
        const mic = await permissionsApi.query({ name: "microphone" as PermissionName });
        setMicPermission(
          mic.state === "granted" ? "granted" : mic.state === "denied" ? "denied" : "unknown",
        );
      } catch {
        setMicPermission("unsupported");
      }
    };

    void loadPermissions();
    void loadMediaDevices();

    return () => {
      if (!keepScreenPreviewOnUnmountRef.current) {
        stopPreview();
      }
      stopMicMeter();
      if (micOverlayTimerRef.current) {
        window.clearTimeout(micOverlayTimerRef.current);
        micOverlayTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!previewRef.current) return;
    if (!previewStreamRef.current) {
      previewRef.current.srcObject = null;
      return;
    }
    previewRef.current.srcObject = previewStreamRef.current;
    void previewRef.current.play().catch(() => {
      // Browser may require additional user interaction before playback.
    });
  }, [previewMode]);

  const requestMicrophonePermission = async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setMicPermission("unsupported");
      setPermissionError("Microphone API is not supported in this browser.");
      return;
    }

    try {
      setMicOverlayOpen(true);
      setMicOverlayState("prompt");
      setPermissionBusy("microphone");
      setPermissionError("");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: selectedMicrophoneId ? { deviceId: { exact: selectedMicrophoneId } } : true,
      });
      setMicPermission("granted");
      setMicOverlayState("granted");
      void loadMediaDevices();
      stream.getTracks().forEach((track) => track.stop());
      if (micOverlayTimerRef.current) {
        window.clearTimeout(micOverlayTimerRef.current);
      }
      micOverlayTimerRef.current = window.setTimeout(() => {
        setMicOverlayOpen(false);
        micOverlayTimerRef.current = null;
      }, 1200);
    } catch {
      setMicPermission("denied");
      setMicOverlayState("blocked");
      setPermissionError("Cannot access microphone. Please allow microphone permission in browser settings.");
    } finally {
      setPermissionBusy(null);
    }
  };

  const startMicTesting = async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setMicPermission("unsupported");
      setPermissionError("Microphone API is not supported in this browser.");
      return;
    }

    try {
      setMicOverlayOpen(true);
      setMicOverlayState("prompt");
      setPermissionBusy("microphone");
      setPermissionError("");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: {
          deviceId: selectedMicrophoneId ? { exact: selectedMicrophoneId } : undefined,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      setMicPermission("granted");
      setMicOverlayState("granted");
      void loadMediaDevices();
      startMicTest(stream);
      if (micOverlayTimerRef.current) {
        window.clearTimeout(micOverlayTimerRef.current);
      }
      micOverlayTimerRef.current = window.setTimeout(() => {
        setMicOverlayOpen(false);
        micOverlayTimerRef.current = null;
      }, 900);
    } catch {
      setMicPermission("denied");
      setMicOverlayState("blocked");
      setPermissionError("Cannot start mic test. Please allow microphone permission in browser settings.");
      stopMicMeter();
    } finally {
      setPermissionBusy(null);
    }
  };

  const stopMicTesting = () => {
    stopMicMeter();
  };

  const requestScreenPreview = async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getDisplayMedia) {
      setScreenPermission("unsupported");
      setPermissionError("Screen sharing is not supported in this browser.");
      return;
    }

    try {
      setPermissionBusy("screen");
      setLastPreviewAttempt("screen");
      setPermissionError("");
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: getHighQualityScreenCaptureConstraints(latencyMode),
        audio: true,
      } as DisplayMediaStreamOptions);

      const [videoTrack] = stream.getVideoTracks();
      if (videoTrack) {
        await optimizeScreenVideoTrack(videoTrack, latencyMode);
      }

      setScreenPermission("granted");
      attachPreviewStream(stream, "screen");
      if (videoTrack) {
        videoTrack.onended = () => {
          stopPreview();
        };
      }
    } catch {
      setScreenPermission("denied");
      setPermissionError("Screen share was blocked or cancelled. Please try again.");
    } finally {
      setPermissionBusy(null);
    }
  };

  const retryPreview = async () => {
    await requestScreenPreview();
  };

  const extractMentionsFromTitle = (value: string) => {
    const handles = new Set<string>();
    const regex = /@([a-zA-Z0-9_.]{1,30})/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(value))) {
      handles.add(match[1].toLowerCase());
    }
    return Array.from(handles);
  };

  const findActiveMention = (value: string, caret: number) => {
    const beforeCaret = value.slice(0, caret);
    const match = /(^|[\s([{.,!?])@([a-zA-Z0-9_.]{0,30})$/i.exec(beforeCaret);
    if (!match) return null;
    const handle = match[2];
    const start = caret - handle.length - 1;
    return { handle, start, end: caret };
  };

  const cleanLocationLabel = (label: string) =>
    label
      .replace(/\b\d{4,6}\b/g, "")
      .replace(/,\s*,+/g, ", ")
      .replace(/\s{2,}/g, " ")
      .replace(/\s*,\s*$/g, "")
      .replace(/^\s*,\s*/g, "")
      .trim();

  useEffect(() => {
    const token =
      typeof window !== "undefined" ? localStorage.getItem("accessToken") || "" : "";
    if (!token) {
      setMentionOpen(false);
      return;
    }

    const el = titleRef.current;
    const caret = el?.selectionStart ?? title.length;
    const active = findActiveMention(title, caret);
    if (!active || !active.handle.trim()) {
      setMentionOpen(false);
      setMentionSuggestions([]);
      setMentionHighlight(-1);
      setActiveMentionRange(null);
      return;
    }

    setActiveMentionRange({ start: active.start, end: active.end });
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await searchProfiles({ token, query: active.handle, limit: 8 });
        if (cancelled) return;
        setMentionSuggestions(res.items || []);
        setMentionOpen((res.items || []).length > 0);
        setMentionHighlight((res.items || []).length ? 0 : -1);
      } catch {
        if (cancelled) return;
        setMentionSuggestions([]);
        setMentionOpen(false);
      }
    }, 260);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [title]);

  useEffect(() => {
    if (!location.trim()) {
      setLocationSuggestions([]);
      setLocationOpen(false);
      setLocationHighlight(-1);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLocationLoading(true);
      try {
        const url = new URL("https://nominatim.openstreetmap.org/search");
        url.searchParams.set("q", location);
        url.searchParams.set("format", "jsonv2");
        url.searchParams.set("addressdetails", "1");
        url.searchParams.set("limit", "8");
        const res = await fetch(url.toString(), {
          headers: {
            Accept: "application/json",
            "Accept-Language": "en",
          },
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("location search failed");
        const data = await res.json();
        const mapped = Array.isArray(data)
          ? data.map((item: any) => ({
              label: cleanLocationLabel(item.display_name as string),
              lat: item.lat as string,
              lon: item.lon as string,
            }))
          : [];
        setLocationSuggestions(mapped);
        setLocationOpen(mapped.length > 0);
        setLocationHighlight(mapped.length ? 0 : -1);
      } catch {
        if (controller.signal.aborted) return;
        setLocationSuggestions([]);
        setLocationOpen(false);
      } finally {
        if (!controller.signal.aborted) setLocationLoading(false);
      }
    }, 320);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [location]);

  const insertEmoji = (emoji: string) => {
    const el = titleRef.current;
    const value = title || "";
    if (!el || typeof el.selectionStart !== "number") {
      setTitle(`${value}${emoji}`);
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd ?? start;
    const next = value.slice(0, start) + emoji + value.slice(end);
    setTitle(next);
    setTimeout(() => {
      const caret = start + emoji.length;
      el.focus();
      el.setSelectionRange(caret, caret);
    }, 0);
  };

  const selectMention = (opt: ProfileSearchItem) => {
    const handle = opt.username.toLowerCase();
    const range = activeMentionRange ?? { start: title.length, end: title.length };
    const before = title.slice(0, range.start);
    const after = title.slice(range.end);
    const insertion = `@${handle}`;
    const needsSpaceAfter = after.startsWith(" ") ? "" : " ";
    const next = `${before}${insertion}${needsSpaceAfter}${after}`;
    setTitle(next);
    setMentionSuggestions([]);
    setMentionOpen(false);
    setMentionHighlight(-1);
    setActiveMentionRange(null);

    setTimeout(() => {
      const el = titleRef.current;
      if (!el) return;
      const caret = range.start + insertion.length + (needsSpaceAfter ? 1 : 0);
      el.focus();
      el.setSelectionRange(caret, caret);
    }, 0);
  };

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setTitleError("");

    const trimmedTitle = title.trim();

    if (!trimmedTitle) {
      setError("Please enter a livestream title.");
      return;
    }

    if (titleWordCount > 300) {
      setTitleError("Livestream title supports up to 300 words.");
      return;
    }

    const hasScreenPreview =
      previewMode === "screen" &&
      Boolean(previewStreamRef.current?.getVideoTracks()?.[0]) &&
      previewStreamRef.current?.getVideoTracks()?.[0]?.readyState !== "ended";

    if (!hasScreenPreview) {
      setError("Please choose a screen share source before creating livestream.");
      return;
    }

    try {
      setLoading(true);
      const data = await createLivestream({
        title: trimmedTitle,
        description: description.trim(),
        pinnedComment: pinnedComment.trim(),
        visibility,
        latencyMode,
        location: location.trim(),
        mentions: extractMentionsFromTitle(trimmedTitle),
      });
      keepScreenPreviewOnUnmountRef.current = true;
      setPendingScreenShareStream(previewStreamRef.current);
      router.push(`/livestream/${encodeURIComponent(data.stream.id)}?host=1`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create livestream.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className={panelStyles.panel}>
      <div className={panelStyles.header}>
        <p className={panelStyles.tag}>Livestream</p>
        <h2 className={panelStyles.title}>Create a livestream</h2>
      </div>

      <div className={panelStyles.contentGrid}>
      <form onSubmit={onSubmit} className={panelStyles.form}>
        <label className={panelStyles.label}>
          <span className={panelStyles.titleLabelRow}>
            <span>Livestream title</span>
            <div className={panelStyles.emojiWrap} ref={emojiRef}>
              <button
                type="button"
                className={panelStyles.emojiButton}
                onClick={() => setShowEmojiPicker((prev) => !prev)}
                aria-label="Open emoji picker"
              >
                <svg
                  aria-hidden
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
                  <circle cx="9" cy="10" r="1.1" fill="currentColor" />
                  <circle cx="15" cy="10" r="1.1" fill="currentColor" />
                  <path
                    d="M8.5 14.2C9.4 15.4 10.6 16 12 16c1.4 0 2.6-.6 3.5-1.8"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                  />
                </svg>
              </button>

              {showEmojiPicker && (
                <div className={panelStyles.emojiPickerPanel}>
                  <EmojiPicker
                    width={300}
                    height={360}
                    previewConfig={{ showPreview: false }}
                    onEmojiClick={(emojiData) => insertEmoji(emojiData.emoji)}
                  />
                </div>
              )}
            </div>
          </span>

          <div className={panelStyles.titleShell}>
            <textarea
              ref={titleRef}
              value={title}
              onChange={(e) => {
                const next = e.target.value;
                const nextWordCount = next.trim()
                  ? next.trim().split(/\s+/).filter(Boolean).length
                  : 0;
                if (nextWordCount <= 300) {
                  setTitle(next);
                  if (titleError) setTitleError("");
                } else {
                  setTitleError("Livestream title supports up to 300 words.");
                }
              }}
              className={panelStyles.titleInput}
              placeholder="Write a title and tag users with @username"
              onKeyDown={(e) => {
                if (!mentionOpen) return;
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  if (!mentionSuggestions.length) return;
                  setMentionHighlight((prev) =>
                    prev + 1 < mentionSuggestions.length ? prev + 1 : 0,
                  );
                  return;
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  if (!mentionSuggestions.length) return;
                  setMentionHighlight((prev) =>
                    prev - 1 >= 0 ? prev - 1 : mentionSuggestions.length - 1,
                  );
                  return;
                }
                if (e.key === "Enter" && mentionHighlight >= 0) {
                  e.preventDefault();
                  const selected = mentionSuggestions[mentionHighlight];
                  if (selected) selectMention(selected);
                }
                if (e.key === "Escape") {
                  setMentionOpen(false);
                }
              }}
            />
          </div>

          <span className={panelStyles.titleCounter}>{titleWordCount}/300</span>
          {titleError ? <span className={panelStyles.inlineError}>{titleError}</span> : null}

          {mentionOpen ? (
            <div className={panelStyles.mentionSuggestions}>
              {mentionSuggestions.map((opt, idx) => (
                <button
                  type="button"
                  key={opt.id}
                  className={`${panelStyles.mentionOption} ${
                    idx === mentionHighlight ? panelStyles.mentionOptionActive : ""
                  }`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    selectMention(opt);
                  }}
                  onMouseEnter={() => setMentionHighlight(idx)}
                >
                  <img src={opt.avatarUrl} alt="" className={panelStyles.mentionAvatar} />
                  <div className={panelStyles.mentionMeta}>
                    <span className={panelStyles.mentionName}>{opt.displayName}</span>
                    <span className={panelStyles.mentionUsername}>@{opt.username}</span>
                  </div>
                </button>
              ))}
            </div>
          ) : null}
        </label>

        <label className={panelStyles.label}>
          Location (optional)
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            maxLength={160}
            className={panelStyles.input}
            placeholder="Add a location"
            onBlur={() => setTimeout(() => setLocationOpen(false), 120)}
            onFocus={() => {
              if (locationSuggestions.length) setLocationOpen(true);
            }}
            onKeyDown={(e) => {
              if (!locationOpen) return;
              if (e.key === "ArrowDown") {
                e.preventDefault();
                if (!locationSuggestions.length) return;
                setLocationHighlight((prev) =>
                  prev + 1 < locationSuggestions.length ? prev + 1 : 0,
                );
                return;
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                if (!locationSuggestions.length) return;
                setLocationHighlight((prev) =>
                  prev - 1 >= 0 ? prev - 1 : locationSuggestions.length - 1,
                );
                return;
              }
              if (e.key === "Enter" && locationHighlight >= 0) {
                e.preventDefault();
                const option = locationSuggestions[locationHighlight];
                if (option) {
                  setLocation(option.label);
                  setLocationOpen(false);
                }
              }
            }}
          />

          {locationOpen && (
            <div className={panelStyles.locationSuggestions}>
              {locationLoading ? (
                <div className={panelStyles.locationMuted}>Searching...</div>
              ) : locationSuggestions.length ? (
                locationSuggestions.map((option, idx) => (
                  <button
                    type="button"
                    key={`${option.lat}-${option.lon}-${idx}`}
                    className={`${panelStyles.locationOption} ${
                      idx === locationHighlight ? panelStyles.locationOptionActive : ""
                    }`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setLocation(option.label);
                      setLocationOpen(false);
                    }}
                    onMouseEnter={() => setLocationHighlight(idx)}
                  >
                    {option.label}
                  </button>
                ))
              ) : (
                <div className={panelStyles.locationMuted}>No suggestions found.</div>
              )}
            </div>
          )}
        </label>

        <label className={panelStyles.label}>
          Visibility
          <div className={panelStyles.dropdownShell} ref={visibilityRef}>
            <button
              type="button"
              className={`${panelStyles.dropdownButton} ${
                visibilityOpen ? panelStyles.dropdownButtonOpen : ""
              }`}
              aria-haspopup="listbox"
              aria-expanded={visibilityOpen}
              onClick={() => setVisibilityOpen((prev) => !prev)}
            >
              <div className={panelStyles.dropdownText}>
                <span className={panelStyles.dropdownLabel}>
                  {selectedVisibility.label}
                </span>
              </div>
              <span
                className={`${panelStyles.dropdownChevron} ${
                  visibilityOpen ? panelStyles.dropdownChevronOpen : ""
                }`}
                aria-hidden
              >
                ▼
              </span>
            </button>

            {visibilityOpen && (
              <div
                className={panelStyles.dropdownMenu}
                role="listbox"
                aria-label="Select livestream visibility"
              >
                {visibilityOptions.map((option) => (
                  <button
                    type="button"
                    key={option.value}
                    className={`${panelStyles.dropdownOption} ${
                      visibility === option.value
                        ? panelStyles.dropdownOptionActive
                        : ""
                    }`}
                    role="option"
                    aria-selected={visibility === option.value}
                    onClick={() => {
                      setVisibility(option.value);
                      setVisibilityOpen(false);
                    }}
                  >
                    <span>{option.label}</span>
                    <span
                      className={`${panelStyles.dropdownCheck} ${
                        visibility === option.value
                          ? panelStyles.dropdownCheckActive
                          : ""
                      }`}
                      aria-hidden
                    >
                      {visibility === option.value ? "✓" : ""}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </label>

        <div className={panelStyles.label}>
          <span>Livestream latency</span>
          <div className={panelStyles.latencyGroup} role="radiogroup" aria-label="Livestream latency mode">
            {latencyOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={latencyMode === option.value}
                className={`${panelStyles.latencyCard} ${
                  latencyMode === option.value ? panelStyles.latencyCardActive : ""
                }`}
                onClick={() => setLatencyMode(option.value)}
              >
                <span className={panelStyles.latencyTitle}>{option.label}</span>
                <span className={panelStyles.latencyNote}>{option.note}</span>
              </button>
            ))}
          </div>
        </div>

        <label className={panelStyles.label}>
          Short description (optional)
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            className={panelStyles.textarea}
            placeholder="Share what this stream is about"
          />
        </label>

        <label className={panelStyles.label}>
          Pinned comment (optional)
          <input
            value={pinnedComment}
            onChange={(e) => setPinnedComment(e.target.value)}
            maxLength={180}
            className={panelStyles.input}
            placeholder="Example: Ask your questions in the chat"
          />
        </label>

        {error ? <p className={panelStyles.error}>{error}</p> : null}

        <button
          type="submit"
          className={panelStyles.button}
          disabled={
            loading ||
            previewMode !== "screen" ||
            !previewStreamRef.current?.getVideoTracks()?.[0] ||
            previewStreamRef.current?.getVideoTracks()?.[0]?.readyState === "ended"
          }
        >
          {loading ? "Creating..." : "Create livestream"}
        </button>
      </form>

      <aside className={panelStyles.sideColumn}>
        <section className={panelStyles.permissionCard}>
          <h3 className={panelStyles.sideTitle}>Permission setup</h3>
          <p className={panelStyles.sideNote}>
            Before going live, verify browser access for microphone and screen sharing.
          </p>

          <div className={panelStyles.permissionList}>
            <div className={panelStyles.deviceRow}>
              <span>Microphone source</span>
              <select
                className={panelStyles.deviceSelect}
                value={selectedMicrophoneId}
                onChange={(event) => setSelectedMicrophoneId(event.target.value)}
                disabled={devicesLoading || !microphoneDevices.length}
              >
                {microphoneDevices.length ? (
                  microphoneDevices.map((device, index) => (
                    <option key={device.deviceId || `mic-${index}`} value={device.deviceId}>
                      {device.label || `Microphone ${index + 1}`}
                    </option>
                  ))
                ) : (
                  <option value="">No microphone detected</option>
                )}
              </select>
            </div>

            <div className={panelStyles.permissionRow}>
              <span>Microphone</span>
              <span
                className={`${panelStyles.permissionBadge} ${
                  micPermission === "granted"
                    ? panelStyles.permissionGranted
                    : micPermission === "denied"
                      ? panelStyles.permissionDenied
                      : ""
                }`}
              >
                {permissionLabel(micPermission)}
              </span>
            </div>
            <button
              type="button"
              className={panelStyles.sideButton}
              onClick={() => void requestMicrophonePermission()}
              disabled={permissionBusy !== null}
            >
              {permissionBusy === "microphone" ? "Requesting microphone..." : "Allow microphone"}
            </button>

            <button
              type="button"
              className={`${panelStyles.sideButton} ${isMicTesting ? panelStyles.sideButtonStop : ""}`}
              onClick={() => {
                if (isMicTesting) {
                  stopMicTesting();
                  return;
                }
                void startMicTesting();
              }}
              disabled={permissionBusy !== null}
            >
              {isMicTesting ? "Stop testing" : "Mic test"}
            </button>

            {isMicTesting ? (
              <div className={panelStyles.micMeterWrap}>
                <div className={panelStyles.micMeterHead}>
                  <span>Microphone level</span>
                  <span className={panelStyles.micMeterValue}>{`${micLevel}%`}</span>
                </div>
                <div className={panelStyles.micMeterTrack}>
                  <div
                    className={panelStyles.micMeterFill}
                    style={{ width: `${micLevel}%` }}
                  />
                </div>
                <p className={panelStyles.micTestHint}>
                  Mic test is active. You should hear your own voice in real-time.
                </p>
              </div>
            ) : null}

            <div className={panelStyles.permissionRow}>
              <span>Screen share</span>
              <span
                className={`${panelStyles.permissionBadge} ${
                  screenPermission === "granted"
                    ? panelStyles.permissionGranted
                    : screenPermission === "denied"
                      ? panelStyles.permissionDenied
                      : ""
                }`}
              >
                {permissionLabel(screenPermission)}
              </span>
            </div>
            <button
              type="button"
              className={panelStyles.sideButton}
              onClick={() => void requestScreenPreview()}
              disabled={permissionBusy !== null}
            >
              {permissionBusy === "screen" ? "Starting preview..." : "Choose screen share"}
            </button>
          </div>

          {permissionError ? <p className={panelStyles.sideError}>{permissionError}</p> : null}
        </section>

        <section className={panelStyles.previewCard}>
          <div className={panelStyles.previewHeader}>
            <h3 className={panelStyles.sideTitle}>Livestream preview</h3>
          </div>

          <div className={panelStyles.previewStage}>
            {previewMode === "none" ? (
              <div className={panelStyles.previewEmpty}>
                <p className={panelStyles.previewEmptyTitle}>No preview started</p>
                {(permissionError || screenPermission === "denied") ? (
                  <button
                    type="button"
                    className={panelStyles.previewRetryBtn}
                    onClick={() => void retryPreview()}
                    disabled={permissionBusy !== null}
                  >
                    {permissionBusy ? "Retrying..." : "Retry"}
                  </button>
                ) : null}
              </div>
            ) : (
              <video
                ref={previewRef}
                className={panelStyles.previewVideo}
                autoPlay
                muted
                playsInline
              />
            )}
          </div>

          <p className={panelStyles.sideNote}>
            Current preview source: {previewMode === "none" ? "None" : "Screen share"}
          </p>
        </section>
      </aside>
      </div>

      {micOverlayOpen ? (
        <div className={panelStyles.micCoachmark} role="dialog" aria-live="polite" aria-label="Microphone permission helper">
          <div className={panelStyles.micCoachmarkArrow} aria-hidden />
          <h3 className={panelStyles.micCoachmarkTitle}>Enable microphone</h3>

          {micOverlayState === "prompt" ? (
            <p className={panelStyles.micCoachmarkText}>
              Check the lock icon near the URL and choose <strong>Allow</strong> for Microphone if a prompt does not appear.
            </p>
          ) : null}

          {micOverlayState === "blocked" ? (
            <p className={panelStyles.micCoachmarkText}>
              Microphone is blocked. Click the lock icon, switch Microphone to <strong>Allow</strong>, then press Retry.
            </p>
          ) : null}

          {micOverlayState === "granted" ? (
            <p className={panelStyles.micCoachmarkSuccess}>Microphone access granted.</p>
          ) : null}

          <div className={panelStyles.micCoachmarkActions}>
            {micOverlayState !== "granted" ? (
              <button
                type="button"
                className={panelStyles.micCoachmarkPrimary}
                onClick={() => void requestMicrophonePermission()}
                disabled={permissionBusy !== null}
              >
                {permissionBusy === "microphone" ? "Requesting..." : "Retry"}
              </button>
            ) : null}
            <button
              type="button"
              className={panelStyles.micCoachmarkGhost}
              onClick={closeMicOverlay}
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
