"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import EmojiPicker from "emoji-picker-react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  VideoTrack,
  useLocalParticipant,
  useParticipants,
  useRoomContext,
  useTracks,
} from "@livekit/components-react";
import { ConnectionState, RoomEvent, Track, VideoQuality } from "livekit-client";
import {
  endLivestream,
  endLivestreamBeacon,
  getIvsIngest,
  joinLivestreamToken,
  listLiveLivestreams,
  muteUserInLivestream,
  type LivestreamLatencyMode,
  type LivestreamItem,
  updateLivestream,
} from "@/lib/livestream-api";
import { blockUser, fetchCurrentProfile, fetchProfileDetail, searchProfiles, type ProfileSearchItem } from "@/lib/api";
import ReportUserOverlay from "@/ui/report-user-overlay/ReportUserOverlay";
import { getStoredAccessToken } from "@/lib/auth";
import {
  type LivestreamCameraPosition,
  type LivestreamCameraSize,
  type LivestreamHostVideoMode,
  clearPendingLivestreamMedia,
  clearPendingCameraStream,
  getPendingCameraStream,
  getPendingHostVideoConfig,
  clearPendingScreenShareStream,
  getPendingScreenShareStream,
} from "@/lib/livestream-screen-share-cache";
import hubStyles from "./livestream-hub.module.css";

type LiveComment = {
  id: string;
  authorHandle: string;
  authorId?: string;
  isHost: boolean;
  text: string;
  avatarUrl?: string;
  isSystem?: boolean;
};

type LivestreamMetaPatch = {
  title?: string;
  description?: string;
  pinnedComment?: string;
  location?: string;
  latencyMode?: LivestreamLatencyMode;
};

const hostLatencyOptions: Array<{
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

type HistoryWireComment = {
  id: string;
  authorHandle: string;
  authorId?: string;
  isHost: boolean;
  text: string;
  avatarUrl?: string;
};

function formatPauseDuration(minutes: number): string {
  if (minutes >= 1440) return "1 day";
  if (minutes >= 60) {
    const h = minutes / 60;
    return `${h} hour${h === 1 ? "" : "s"}`;
  }
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

type ModerationTarget = {
  commentId: string;
  authorId?: string;
  authorHandle: string;
};

type PauseDuration = 5 | 10 | 15 | 30 | 60 | 1440;


const PAUSE_OPTIONS: Array<{ value: PauseDuration; label: string }> = [
  { value: 5, label: "5 minutes" },
  { value: 10, label: "10 minutes" },
  { value: 15, label: "15 minutes" },
  { value: 30, label: "30 minutes" },
  { value: 60, label: "1 hour" },
  { value: 1440, label: "1 day" },
];


function toHandle(raw?: string): string {
  const base = (raw || "").trim().replace(/^@+/, "");
  if (!base) return "@unknown";
  const token = base.split(/\s+/)[0];
  return `@${token}`;
}

function getAvatarInitial(raw?: string): string {
  const base = (raw || "").trim().replace(/^@+/, "");
  if (!base) return "?";
  return base[0].toUpperCase();
}

function decodeJwtPayload(token?: string): Record<string, unknown> | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;

  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function toErrorLog(err: unknown): { name?: string; message?: string; stack?: string } {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack,
    };
  }
  if (typeof err === "string") {
    return { message: err };
  }
  return { message: "Unknown error", stack: JSON.stringify(err) };
}

function isPcManagerClosedError(err: unknown): boolean {
  const parsed = toErrorLog(err);
  const message = `${parsed.name || ""} ${parsed.message || ""}`.toLowerCase();
  return message.includes("unexpectedconnectionstate") || message.includes("pc manager is closed");
}

function formatLiveStartedAgo(startedAt?: string): string {
  if (!startedAt) return "just now";

  const timestamp = new Date(startedAt).getTime();
  if (Number.isNaN(timestamp)) return "just now";

  const diffMs = Date.now() - timestamp;
  if (diffMs <= 0) return "just now";

  const minuteMs = 60_000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;

  if (diffMs < hourMs) {
    const minutes = Math.max(1, Math.floor(diffMs / minuteMs));
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }

  if (diffMs < dayMs) {
    const hours = Math.floor(diffMs / hourMs);
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }

  const days = Math.floor(diffMs / dayMs);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function getLatencyLabel(mode: LivestreamLatencyMode): string {
  if (mode === "low") return "Low latency";
  if (mode === "balanced") return "Balanced latency";
  return "Adaptive latency";
}


function getRoomPerfConfig(_mode: LivestreamLatencyMode): {
  adaptiveStream: boolean;
  dynacast: boolean;
} {
  // Always disable adaptive stream and dynacast so LiveKit never auto-downgrades
  // resolution/bitrate based on viewport size or bandwidth estimates.
  return { adaptiveStream: false, dynacast: false };
}

function getScreenSharePublishOptions(mode: LivestreamLatencyMode) {
  // simulcast: false + scalabilityMode L1T1 → single quality layer, no temporal
  // scaling. SFU forwards exactly what the host encodes to every viewer.
  if (mode === "low") {
    return {
      source: Track.Source.ScreenShare,
      simulcast: false,
      scalabilityMode: "L1T1",
      videoEncoding: {
        maxBitrate: 3_000_000,
        maxFramerate: 24,
      },
    };
  }

  if (mode === "balanced") {
    return {
      source: Track.Source.ScreenShare,
      simulcast: false,
      scalabilityMode: "L1T1",
      videoEncoding: {
        maxBitrate: 6_000_000,
        maxFramerate: 30,
      },
    };
  }

  return {
    source: Track.Source.ScreenShare,
    simulcast: false,
    scalabilityMode: "L1T1",
    videoEncoding: {
      maxBitrate: 15_000_000,
      maxFramerate: 30,
    },
  };
}

function getCameraPublishOptions(mode: LivestreamLatencyMode) {
  if (mode === "low") {
    return {
      source: Track.Source.Camera,
      simulcast: false,
      scalabilityMode: "L1T1",
      videoEncoding: {
        maxBitrate: 1_500_000,
        maxFramerate: 24,
      },
    };
  }

  if (mode === "balanced") {
    return {
      source: Track.Source.Camera,
      simulcast: false,
      scalabilityMode: "L1T1",
      videoEncoding: {
        maxBitrate: 3_000_000,
        maxFramerate: 30,
      },
    };
  }

  return {
    source: Track.Source.Camera,
    simulcast: false,
    scalabilityMode: "L1T1",
    videoEncoding: {
      maxBitrate: 6_000_000,
      maxFramerate: 30,
    },
  };
}

function getDisplayMediaCaptureOptions(mode: LivestreamLatencyMode): DisplayMediaStreamOptions {
  // Match constraints with LivestreamCreatePanel so the Hub "share screen" button
  // and the pending track from CreatePanel both use the same resolution ceiling.
  if (mode === "low") {
    return {
      video: {
        width: { ideal: 1280, max: 1920 },
        height: { ideal: 720, max: 1080 },
        frameRate: { ideal: 24, max: 30 },
        cursor: "always",
      } as MediaTrackConstraints,
      audio: true,
    };
  }

  if (mode === "balanced") {
    return {
      video: {
        width: { ideal: 1920, max: 2560 },
        height: { ideal: 1080, max: 1440 },
        frameRate: { ideal: 30, max: 30 },
        cursor: "always",
      } as MediaTrackConstraints,
      audio: true,
    };
  }

  return {
    video: {
      width: { ideal: 2560, max: 3840 },
      height: { ideal: 1440, max: 2160 },
      frameRate: { ideal: 30, max: 60 },
      cursor: "always",
    } as MediaTrackConstraints,
    audio: true,
  };
}

async function optimizePublishedScreenTrack(track: MediaStreamTrack, mode: LivestreamLatencyMode) {
  try {
    (track as MediaStreamTrack & { contentHint?: string }).contentHint = "detail";
  } catch {
    // Ignore contentHint assignment errors.
  }

  try {
    await track.applyConstraints((getDisplayMediaCaptureOptions(mode).video || {}) as MediaTrackConstraints);
  } catch {
    // Keep original track when constraints are partially unsupported.
  }
}

function findActiveMention(value: string, caret: number) {
  const beforeCaret = value.slice(0, caret);
  const match = /(^|[\s([{.,!?])@([a-zA-Z0-9_.]{0,30})$/i.exec(beforeCaret);
  if (!match) return null;
  const handle = match[2];
  const start = caret - handle.length - 1;
  return { handle, start, end: caret };
}

function extractMentionHandles(value: string): string[] {
  const found = value.match(/@[a-zA-Z0-9_.]+/g) || [];
  return Array.from(new Set(found.map((token) => token.slice(1).toLowerCase())));
}

type HostCameraLayout = {
  cameraPosition: LivestreamCameraPosition;
  cameraSize: LivestreamCameraSize;
};

const DEFAULT_HOST_CAMERA_LAYOUT: HostCameraLayout = {
  cameraPosition: "bottom-right",
  cameraSize: "medium",
};

function getCameraPositionClass(position: LivestreamCameraPosition) {
  if (position === "top-left") return hubStyles.stageCameraTopLeft;
  if (position === "top-right") return hubStyles.stageCameraTopRight;
  if (position === "bottom-left") return hubStyles.stageCameraBottomLeft;
  return hubStyles.stageCameraBottomRight;
}

function getCameraSizeClass(size: LivestreamCameraSize) {
  if (size === "small") return hubStyles.stageCameraSmall;
  if (size === "large") return hubStyles.stageCameraLarge;
  return hubStyles.stageCameraMedium;
}

function StreamStage({
  hostName,
  allowFullscreen,
  cameraLayout,
  hostVideoMode,
}: {
  hostName: string;
  allowFullscreen: boolean;
  cameraLayout?: HostCameraLayout;
  hostVideoMode?: LivestreamHostVideoMode;
}) {
  const tileRef = useRef<HTMLDivElement | null>(null);
  const room = useRoomContext();
  const allParticipants = useParticipants();
  const liveViewerCount = allParticipants.filter(
    (p) => !p.identity.startsWith("preview-") && !p.identity.includes("-host-"),
  ).length;
  const [isFullscreen, setIsFullscreen] = useState(false);
  const tracks = useTracks(
    [{ source: Track.Source.ScreenShare, withPlaceholder: false }],
    { onlySubscribed: false },
  );
  const cameraTracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: false }],
    { onlySubscribed: false },
  );

  const hostScreenTrack = tracks.find((track) =>
    (track.participant.identity || "").includes("-host-"),
  );
  const hostCameraTrack = cameraTracks.find((track) =>
    (track.participant.identity || "").includes("-host-"),
  );
  const preferredMode = hostVideoMode || "screen-only";
  const stageTrack =
    preferredMode === "camera-only"
      ? hostCameraTrack || hostScreenTrack
      : hostScreenTrack || hostCameraTrack;
  const isLocalSelfSharePreview = Boolean(stageTrack?.participant?.isLocal);
  const canUseFullscreen = allowFullscreen && !isLocalSelfSharePreview;
  const layout = cameraLayout || DEFAULT_HOST_CAMERA_LAYOUT;
  const hasScreen = Boolean(hostScreenTrack?.publication) && preferredMode !== "camera-only";
  const hasCamera = Boolean(hostCameraTrack?.publication);

  useEffect(() => {
    const publication: any = stageTrack?.publication;
    if (!publication || typeof publication.setVideoQuality !== "function") {
      return;
    }

    try {
      publication.setVideoQuality(VideoQuality.HIGH);
      publication.setSubscribed(true);
    } catch {
      // Ignore quality pinning errors on unsupported publication types.
    }
  }, [stageTrack?.publication, isFullscreen]);

  useEffect(() => {
    const onFullscreenChange = () => {
      const active = document.fullscreenElement;
      setIsFullscreen(Boolean(active && tileRef.current && active === tileRef.current));
    };

    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, []);

  const toggleFullscreen = async () => {
    if (!canUseFullscreen) return;
    const el = tileRef.current;
    if (!el) return;

    try {
      if (document.fullscreenElement === el) {
        await document.exitFullscreen();
      } else {
        await el.requestFullscreen();
      }
    } catch {
      // Ignore fullscreen API errors (browser permissions / unsupported states).
    }
  };

  return (
    <div className={hubStyles.stageGrid}>
      {stageTrack?.publication ? (
        <div className={hubStyles.tile} ref={tileRef}>
          {hasScreen && hostScreenTrack ? (
            <VideoTrack trackRef={hostScreenTrack as any} className={hubStyles.video} />
          ) : hostCameraTrack ? (
            <VideoTrack
              trackRef={hostCameraTrack as any}
              className={hubStyles.video}
            />
          ) : null}

          {hasScreen && hasCamera && hostCameraTrack ? (
            <VideoTrack
              trackRef={hostCameraTrack as any}
              className={`${hubStyles.stageCameraOverlay} ${getCameraPositionClass(layout.cameraPosition)} ${getCameraSizeClass(layout.cameraSize)}`}
            />
          ) : null}

          {canUseFullscreen ? (
            <button
              type="button"
              className={hubStyles.stageFullscreenBtn}
              onClick={() => void toggleFullscreen()}
              aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            >
              {isFullscreen ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path
                    d="M9 4v4H5M15 4v4h4M9 20v-4H5M15 20v-4h4"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path
                    d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </button>
          ) : null}
          <p className={hubStyles.stageViewerStats}>
            <span className={hubStyles.feedStatsIcon} aria-hidden>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                />
                <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
              </svg>
            </span>
            <span className={hubStyles.feedStatsValue}>{liveViewerCount}</span>
          </p>
        </div>
      ) : (
        <div className={hubStyles.emptyStage}>Host has not started video yet...</div>
      )}
    </div>
  );
}

function IvsPlaybackStage({
  playbackUrl,
}: {
  playbackUrl: string;
}) {
  const tileRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const allParticipants = useParticipants();
  const liveViewerCount = allParticipants.filter(
    (p) => !p.identity.startsWith("preview-") && !p.identity.includes("-host-"),
  ).length;

  useEffect(() => {
    const onFullscreenChange = () => {
      const active = document.fullscreenElement;
      setIsFullscreen(Boolean(active && tileRef.current && active === tileRef.current));
    };

    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !playbackUrl) return;

    let detached = false;
    let hlsInstance: any = null;

    const attach = async () => {
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = playbackUrl;
        await video.play().catch(() => undefined);
        return;
      }

      try {
        const mod = await import('hls.js');
        const HlsCtor = mod.default;
        if (detached || !HlsCtor?.isSupported?.()) return;

        hlsInstance = new HlsCtor({
          enableWorker: true,
          lowLatencyMode: false,
          maxBufferLength: 45,
          maxMaxBufferLength: 90,
          backBufferLength: 60,
          capLevelToPlayerSize: false,
          startLevel: -1,
        });

        hlsInstance.loadSource(playbackUrl);
        hlsInstance.attachMedia(video);
        hlsInstance.on(HlsCtor.Events.MANIFEST_PARSED, () => {
          void video.play().catch(() => undefined);
        });
      } catch {
        // Ignore dynamic import / playback errors here and keep fallback UI.
      }
    };

    void attach();

    return () => {
      detached = true;
      if (hlsInstance && typeof hlsInstance.destroy === 'function') {
        hlsInstance.destroy();
      }
      if (videoRef.current) {
        videoRef.current.removeAttribute('src');
        videoRef.current.load();
      }
    };
  }, [playbackUrl]);

  const toggleFullscreen = async () => {
    const el = tileRef.current;
    if (!el) return;

    try {
      if (document.fullscreenElement === el) {
        await document.exitFullscreen();
      } else {
        await el.requestFullscreen();
      }
    } catch {
      // Ignore fullscreen API errors.
    }
  };

  return (
    <div className={hubStyles.stageGrid}>
      <div className={hubStyles.tile} ref={tileRef}>
        <video
          ref={videoRef}
          className={hubStyles.ivsVideo}
          playsInline
          autoPlay
          controls={false}
        />
        <button
          type="button"
          className={hubStyles.stageFullscreenBtn}
          onClick={() => void toggleFullscreen()}
          aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        >
          {isFullscreen ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M9 4v4H5M15 4v4h4M9 20v-4H5M15 20v-4h4"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </button>
        <p className={hubStyles.stageViewerStats}>
          <span className={hubStyles.feedStatsIcon} aria-hidden>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
              <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
            </svg>
          </span>
          <span className={hubStyles.feedStatsValue}>{liveViewerCount}</span>
        </p>
      </div>
    </div>
  );
}

function FeedCardStage() {
  const screenTracks = useTracks(
    [{ source: Track.Source.ScreenShare, withPlaceholder: false }],
    { onlySubscribed: false },
  );
  const cameraTracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: false }],
    { onlySubscribed: false },
  );
  const hostTrack = screenTracks.find((track) =>
    (track.participant.identity || "").includes("-host-"),
  );
  const hostCameraTrack = cameraTracks.find((track) =>
    (track.participant.identity || "").includes("-host-"),
  );

  if (!hostTrack?.publication && !hostCameraTrack?.publication) {
    return <div className={hubStyles.feedPreviewEmpty}>Waiting for live video...</div>;
  }

  return (
    <div className={hubStyles.feedPreviewComposite}>
      {hostTrack?.publication ? (
        <VideoTrack trackRef={hostTrack as any} className={hubStyles.feedPreviewVideo} />
      ) : hostCameraTrack?.publication ? (
        <VideoTrack
          trackRef={hostCameraTrack as any}
          className={hubStyles.feedPreviewVideo}
        />
      ) : null}
      {hostTrack?.publication && hostCameraTrack?.publication ? (
        <VideoTrack
          trackRef={hostCameraTrack as any}
          className={`${hubStyles.feedPreviewCameraOverlay} ${hubStyles.feedPreviewCameraBottomRight}`}
        />
      ) : null}
    </div>
  );
}

function FeedCardPreview({ streamId }: { streamId: string }) {
  const [joinToken, setJoinToken] = useState("");
  const [joinUrl, setJoinUrl] = useState("");
  const feedPreviewRoomOptions = useMemo(
    () => ({
      adaptiveStream: true,
      dynacast: true,
    }),
    [],
  );

  useEffect(() => {
    let disposed = false;

    const connectPreview = async () => {
      try {
        const response = await joinLivestreamToken(streamId, {
          asHost: false,
          participantName: `preview-${Math.random().toString(36).slice(2, 8)}`,
          isPreview: true,
        });
        if (disposed) return;
        setJoinToken(response.token);
        setJoinUrl(response.url);
      } catch {
        if (disposed) return;
        setJoinToken("");
        setJoinUrl("");
      }
    };

    void connectPreview();
    return () => {
      disposed = true;
    };
  }, [streamId]);

  if (!joinToken || !joinUrl) {
    return <div className={hubStyles.feedPreviewEmpty}>Connecting preview...</div>;
  }

  return (
    <LiveKitRoom
      token={joinToken}
      serverUrl={joinUrl}
      connect={true}
      audio={false}
      video={false}
      options={feedPreviewRoomOptions}
      className={hubStyles.feedPreviewRoom}
    >
      <FeedCardStage />
    </LiveKitRoom>
  );
}

function LiveComments({
  canComment,
  isHost,
  hostUserId,
  pinnedComment,
  commentPaused: initialCommentPaused,
  commentPausedUntil: initialPausedUntil,
  onMetaPatch,
  onTransportReset,
}: {
  canComment: boolean;
  isHost?: boolean;
  hostUserId?: string;
  pinnedComment?: string;
  commentPaused?: boolean;
  commentPausedUntil?: string | null;
  onMetaPatch?: (patch: LivestreamMetaPatch) => void;
  onTransportReset?: (reason: string, err?: unknown) => void;
}) {
  const room = useRoomContext();
  const router = useRouter();
  const { localParticipant } = useLocalParticipant();
  const [comments, setComments] = useState<LiveComment[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [myAvatarUrl, setMyAvatarUrl] = useState("");
  const [showCommentEmojiPicker, setShowCommentEmojiPicker] = useState(false);
  // Moderation state
  const [hoveredCommentId, setHoveredCommentId] = useState<string | null>(null);
  const [activeMenuCommentId, setActiveMenuCommentId] = useState<string | null>(null);
  const [hiddenCommentIds, setHiddenCommentIds] = useState<Set<string>>(new Set());
  const [blockedUserIds, setBlockedUserIds] = useState<Set<string>>(new Set());
  const menuRef = useRef<HTMLDivElement | null>(null);
  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<ModerationTarget | null>(null);
  // Report overlay
  const [reportTarget, setReportTarget] = useState<ModerationTarget | null>(null);
  // Block overlay
  const [blockTarget, setBlockTarget] = useState<ModerationTarget | null>(null);
  const [blocking, setBlocking] = useState(false);
  const [blockError, setBlockError] = useState("");
  // Pause overlay
  const [pauseTarget, setPauseTarget] = useState<ModerationTarget | null>(null);
  const [pauseDuration, setPauseDuration] = useState<PauseDuration>(5);
  const [pausing, setPausing] = useState(false);
  const [pauseError, setPauseError] = useState("");
  // Viewer pause state (self muted by host)
  const [commentPaused, setCommentPaused] = useState(Boolean(initialCommentPaused));
  const [pausedUntil, setPausedUntil] = useState<Date | null>(
    initialPausedUntil ? new Date(initialPausedUntil) : null,
  );
  const [pauseSecondsLeft, setPauseSecondsLeft] = useState(0);
  const commentEmojiRef = useRef<HTMLDivElement | null>(null);
  const commentInputRef = useRef<HTMLInputElement | null>(null);
  const seenCommentIdsRef = useRef<Set<string>>(new Set());
  const onMetaPatchRef = useRef(onMetaPatch);
  const pendingCommentsRef = useRef<
    Array<{
      commentId: string;
      text: string;
      author: string;
      isHost: boolean;
      retries: number;
    }>
  >([]);
  const flushTimerRef = useRef<number | null>(null);

  const debugPrefix = "[LiveComments:viewer]";

  // Countdown timer for viewer pause state
  useEffect(() => {
    if (!pausedUntil) { setCommentPaused(false); setPauseSecondsLeft(0); return; }
    const tick = () => {
      const left = Math.max(0, Math.ceil((pausedUntil.getTime() - Date.now()) / 1000));
      setPauseSecondsLeft(left);
      if (left === 0) { setCommentPaused(false); setPausedUntil(null); }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [pausedUntil]);

  // Close 3-dot menu on outside click
  useEffect(() => {
    if (!activeMenuCommentId) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setActiveMenuCommentId(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [activeMenuCommentId]);


  useEffect(() => {
    onMetaPatchRef.current = onMetaPatch;
  }, [onMetaPatch]);

  const publishCommentPacket = useCallback(
    async ({
      commentId,
      text,
      author,
      authorId,
      isHost,
      avatarUrl,
    }: {
      commentId: string;
      text: string;
      author: string;
      authorId?: string;
      isHost: boolean;
      avatarUrl?: string;
    }) => {
      const payload = new TextEncoder().encode(
        JSON.stringify({
          type: "comment",
          commentId,
          text,
          author,
          authorId,
          isHost,
          avatarUrl,
        }),
      );

      if (room.state !== ConnectionState.Connected) {
        throw new Error("Livestream data channel is reconnecting");
      }

      await localParticipant.publishData(payload, { reliable: true });
    },
    [localParticipant, room.state],
  );

  const scheduleFlushPendingComments = useCallback(() => {
    if (flushTimerRef.current !== null) return;

    flushTimerRef.current = window.setTimeout(() => {
      flushTimerRef.current = null;

      const run = async () => {
        if (room.state !== ConnectionState.Connected) {
          scheduleFlushPendingComments();
          return;
        }

        const queued = [...pendingCommentsRef.current];
        pendingCommentsRef.current = [];

        for (const item of queued) {
          try {
            await publishCommentPacket(item);
          } catch (err) {
            const next = { ...item, retries: item.retries + 1 };
            if (next.retries < 4) {
              pendingCommentsRef.current.push(next);
            }

            if (isPcManagerClosedError(err)) {
              onTransportReset?.("pending_publish_pc_manager_closed", err);
            }

            console.warn(`${debugPrefix} pending publish failed`, {
              commentId: item.commentId,
              retries: next.retries,
              error: toErrorLog(err),
              rawError: err,
              roomState: (room as any)?.state,
            });
          }
        }

        if (pendingCommentsRef.current.length > 0) {
          scheduleFlushPendingComments();
        }
      };

      void run();
    }, 700);
  }, [onTransportReset, publishCommentPacket, room]);

  useEffect(() => {
    return () => {
      if (flushTimerRef.current !== null) {
        window.clearTimeout(flushTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    return () => {
    };
  }, [localParticipant.identity, localParticipant.name]);

  useEffect(() => {
    const token = getStoredAccessToken();
    if (!token) {
      setMyAvatarUrl("");
      return;
    }

    let disposed = false;
    const loadMe = async () => {
      try {
        const me = await fetchCurrentProfile({ token });
        if (disposed) return;
        setMyAvatarUrl((me.avatarUrl || "").trim());
      } catch {
        if (disposed) return;
        setMyAvatarUrl("");
      }
    };

    void loadMe();
    return () => {
      disposed = true;
    };
  }, []);

  const sendCommentHistoryToParticipant = useCallback(
    async (participant?: any) => {
      if (!participant) return;

      const snapshot: HistoryWireComment[] = comments
        .map((item) => ({
          id: item.id,
          authorHandle: item.authorHandle,
          authorId: item.authorId,
          isHost: item.isHost,
          text: item.text,
          avatarUrl: item.avatarUrl,
        }))
        .filter((item) => item.id && item.text?.trim());

      if (!snapshot.length) return;

      try {
        const payload = new TextEncoder().encode(
          JSON.stringify({
            type: "comment_history",
            comments: snapshot,
          }),
        );
        await localParticipant.publishData(payload, {
          reliable: true,
          destination: [participant],
        } as any);
      } catch {
        // Ignore transient publish errors for history sync.
      }
    },
    [comments, localParticipant],
  );

  const appendComment = useCallback((comment: LiveComment) => {
    const safeId = comment.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    if (seenCommentIdsRef.current.has(safeId)) {
      return;
    }

    seenCommentIdsRef.current.add(safeId);
    setComments((prev) => {
      return [...prev, { ...comment, id: safeId }];
    });
  }, []);

  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      if (!commentEmojiRef.current) return;
      if (!commentEmojiRef.current.contains(event.target as Node)) {
        setShowCommentEmojiPicker(false);
      }
    };

    document.addEventListener("mousedown", onMouseDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, []);

  useEffect(() => {
    const onDataReceived = (payload: Uint8Array, participant?: { name?: string; identity?: string }) => {
      try {
        const text = new TextDecoder().decode(payload);
        const parsed = JSON.parse(text) as {
          type?: "comment" | "meta_update" | "comment_history" | "comment_history_request" | "comment_delete" | "user_pause" | "pause_notice";
          text?: string;
          author?: string;
          authorId?: string;
          avatarUrl?: string;
          patch?: LivestreamMetaPatch;
          commentId?: string;
          isHost?: boolean;
          comments?: HistoryWireComment[];
          userId?: string;
          expiresAt?: string;
        };


        if (parsed.type === "comment_history" && Array.isArray(parsed.comments)) {
          parsed.comments.forEach((item) => {
            if (!item?.text?.trim()) return;
            appendComment({
              id: item.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              authorHandle: toHandle(item.authorHandle),
              authorId: item.authorId || undefined,
              isHost: Boolean(item.isHost),
              text: item.text.trim(),
              avatarUrl: (item.avatarUrl || "").trim(),
            });
          });
          return;
        }

        if (parsed.type === "comment_history_request") {
          void sendCommentHistoryToParticipant(participant as any);
          return;
        }

        if (parsed.type === "comment_delete" && parsed.commentId) {
          const id = parsed.commentId;
          setComments((prev) => prev.filter((c) => c.id !== id));
          return;
        }

        if (parsed.type === "pause_notice" && (parsed as any).noticeText) {
          const noticeId = typeof (parsed as any).noticeId === "string" ? (parsed as any).noticeId : `sys-${Date.now()}`;
          setComments((prev) => [
            ...prev,
            { id: noticeId, authorHandle: "", isHost: false, text: String((parsed as any).noticeText), isSystem: true },
          ]);
          return;
        }

        if (parsed.type === "user_pause" && parsed.userId && parsed.expiresAt) {
          const myId = localParticipant.identity?.split("-")[0];
          if (myId && myId === parsed.userId) {
            const until = new Date(parsed.expiresAt);
            setCommentPaused(true);
            setPausedUntil(until);
          }
          return;
        }

        if (parsed.type === "meta_update" && parsed.patch) {
          onMetaPatchRef.current?.(parsed.patch);
          return;
        }

        if (parsed.type !== "comment" || !parsed.text?.trim()) return;

        const author = parsed.author?.trim() || participant?.name || "Viewer";
        const incomingAuthorId =
          parsed.authorId?.trim() ||
          participant?.identity?.split("-")[0] ||
          undefined;
        appendComment({
          id: parsed.commentId || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          authorHandle: toHandle(author),
          authorId: incomingAuthorId,
          isHost:
            typeof parsed.isHost === "boolean"
              ? parsed.isHost
              : Boolean(participant?.identity?.includes("-host-")),
          text: parsed.text.trim(),
          avatarUrl: (parsed.avatarUrl || "").trim(),
        });
      } catch {
        // Ignore non-comment data packets.
      }
    };

    room.on(RoomEvent.DataReceived, onDataReceived);
    return () => {
      room.off(RoomEvent.DataReceived, onDataReceived);
    };
  }, [appendComment, room, sendCommentHistoryToParticipant]);

  useEffect(() => {
    const onParticipantConnected = (participant: any) => {
      void sendCommentHistoryToParticipant(participant);
    };

    room.on(RoomEvent.ParticipantConnected, onParticipantConnected);
    return () => {
      room.off(RoomEvent.ParticipantConnected, onParticipantConnected);
    };
  }, [room, sendCommentHistoryToParticipant]);

  useEffect(() => {
    const onConnectionStateChanged = (state: ConnectionState) => {
      if (state === ConnectionState.Connected && pendingCommentsRef.current.length > 0) {
        scheduleFlushPendingComments();
      }
    };

    room.on(RoomEvent.ConnectionStateChanged, onConnectionStateChanged);
    return () => {
      room.off(RoomEvent.ConnectionStateChanged, onConnectionStateChanged);
    };
  }, [room, scheduleFlushPendingComments]);

  useEffect(() => {
    const askForHistory = async () => {
      if (room.state !== ConnectionState.Connected) {
        return;
      }

      try {
        const payload = new TextEncoder().encode(
          JSON.stringify({
            type: "comment_history_request",
          }),
        );
        await localParticipant.publishData(payload, { reliable: true });
      } catch (err) {
        if (isPcManagerClosedError(err)) {
          onTransportReset?.("history_request_pc_manager_closed", err);
        }
      }
    };

    void askForHistory();
  }, [localParticipant, onTransportReset, room, room.state]);

  const publishControlPacket = useCallback(async (packet: Record<string, unknown>) => {
    try {
      const payload = new TextEncoder().encode(JSON.stringify(packet));
      await localParticipant.publishData(payload, { reliable: true } as any);
    } catch { /* ignore */ }
  }, [localParticipant]);

  const confirmDelete = useCallback(async (target: ModerationTarget) => {
    setDeleteTarget(null);
    setComments((prev) => prev.filter((c) => c.id !== target.commentId));
    await publishControlPacket({ type: "comment_delete", commentId: target.commentId });
  }, [publishControlPacket]);

  const handleHideComment = useCallback((target: ModerationTarget) => {
    setActiveMenuCommentId(null);
    setHiddenCommentIds((prev) => new Set([...prev, target.commentId]));
  }, []);

  const openReportOverlay = useCallback((target: ModerationTarget) => {
    setActiveMenuCommentId(null);
    setReportTarget(target);
  }, []);

  const openBlockOverlay = useCallback((target: ModerationTarget) => {
    setActiveMenuCommentId(null);
    setBlockTarget(target);
    setBlockError("");
  }, []);

  const confirmBlock = useCallback(async () => {
    if (!blockTarget?.authorId) return;
    const token = getStoredAccessToken();
    if (!token) return;
    setBlocking(true);
    setBlockError("");
    try {
      await blockUser({ token, userId: blockTarget.authorId });
      const blockedId = blockTarget.authorId;
      if (hostUserId && blockedId === hostUserId) {
        router.push("/");
        return;
      }
      setBlockedUserIds((prev) => new Set([...prev, blockedId]));
      setBlockTarget(null);
    } catch (err) {
      setBlockError(err instanceof Error ? err.message : "Failed to block user.");
    } finally {
      setBlocking(false);
    }
  }, [blockTarget, hostUserId, router]);

  const openPauseOverlay = useCallback((target: ModerationTarget) => {
    setActiveMenuCommentId(null);
    setPauseTarget(target);
    setPauseDuration(5);
    setPauseError("");
  }, []);

  const confirmPause = useCallback(async () => {
    if (!pauseTarget?.authorId) return;
    setPausing(true);
    setPauseError("");
    try {
      const result = await muteUserInLivestream({ userId: pauseTarget.authorId, durationMinutes: pauseDuration });
      await publishControlPacket({ type: "user_pause", userId: pauseTarget.authorId, expiresAt: result.expiresAt });
      const hostHandle = toHandle(localParticipant.name || localParticipant.identity);
      const targetHandle = toHandle(pauseTarget.authorHandle);
      const durationLabel = formatPauseDuration(pauseDuration);
      const noticeId = `pause-notice-${Date.now()}`;
      const noticeText = `${hostHandle} put ${targetHandle} on a ${durationLabel} timeout.`;
      setComments((prev) => [...prev, { id: noticeId, authorHandle: "", isHost: false, text: noticeText, isSystem: true }]);
      await publishControlPacket({ type: "pause_notice", noticeId, noticeText });
      setPauseTarget(null);
    } catch (err) {
      setPauseError(err instanceof Error ? err.message : "Failed to pause user.");
    } finally {
      setPausing(false);
    }
  }, [pauseTarget, pauseDuration, publishControlPacket, localParticipant]);

  const onSend = async (contentOverride?: string) => {
    const content = (contentOverride ?? draft).trim();
    if (!content || !canComment) return;

    const commentId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const author = toHandle(localParticipant.name || "Viewer");
    const isHost = Boolean(localParticipant.identity?.includes("-host-"));
    const authorId = localParticipant.identity?.split("-")[0] || undefined;

    // Optimistic: clear input and show comment immediately before network call.
    setDraft("");
    setShowCommentEmojiPicker(false);
    appendComment({
      id: commentId,
      authorHandle: author,
      authorId,
      isHost,
      text: content,
      avatarUrl: myAvatarUrl,
    });

    try {
      setSending(true);

      if (room.state !== ConnectionState.Connected) {
        throw new Error("Livestream room is reconnecting. Please try again.");
      }

      await publishCommentPacket({
        commentId,
        text: content,
        author,
        authorId,
        isHost,
        avatarUrl: myAvatarUrl,
      });
    } catch (err) {
      // Publish failed — keep the local comment visible (optimistic update).
      pendingCommentsRef.current.push({
        commentId,
        text: content,
        author,
        isHost,
        retries: 0,
      });
      scheduleFlushPendingComments();

      if (isPcManagerClosedError(err)) {
        onTransportReset?.("send_comment_pc_manager_closed", err);
      }

      console.warn(`${debugPrefix} publishData failed`, {
        commentId,
        error: toErrorLog(err),
        rawError: err,
        roomState: (room as any)?.state,
        localPermissions:
          (localParticipant as any)?.permissions ??
          (localParticipant as any)?.participantInfo?.permission ??
          null,
        queuedForRetry: true,
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <aside className={hubStyles.commentPanel}>
      <h3 className={hubStyles.commentTitle}>Live comments</h3>
      {pinnedComment?.trim() ? (
        <div className={hubStyles.pinnedComment}>
          <div className={hubStyles.pinnedRow}>
            <span className={hubStyles.pinnedIcon} aria-hidden>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M8 3.5h8l-1.2 6.3 3.7 3.7v1H13v5.8l-1 1-1-1V14.5H5.5v-1l3.7-3.7L8 3.5Z"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <p className={hubStyles.pinnedText}>{pinnedComment.trim()}</p>
          </div>
        </div>
      ) : null}
      <div className={`${hubStyles.commentList} ${!comments.length ? hubStyles.commentListEmpty : ""}`}>
        {!comments.length ? <p className={hubStyles.commentEmpty}>No comments yet.</p> : null}
        {comments.filter((item) => !hiddenCommentIds.has(item.id) && !(item.authorId && blockedUserIds.has(item.authorId))).map((item) => {
          if (item.isSystem) {
            return (
              <div key={item.id} className={hubStyles.commentItemSystem}>
                <span className={hubStyles.commentSystemText}>{item.text}</span>
              </div>
            );
          }
          return (
          <div
            key={item.id}
            className={hubStyles.commentItem}
            onMouseEnter={() => setHoveredCommentId(item.id)}
            onMouseLeave={() => setHoveredCommentId(null)}
          >
            <Link
              href={item.authorId ? `/profile/${item.authorId}` : `/profile/${item.authorHandle.replace(/^@/, "")}`}
              className={hubStyles.commentAvatarLink}
              target="_blank"
              rel="noopener noreferrer"
              tabIndex={-1}
              aria-label={`View ${item.authorHandle}'s profile`}
            >
              <span className={hubStyles.commentAvatar} aria-hidden>
                {item.avatarUrl ? (
                  <img src={item.avatarUrl} alt="" className={hubStyles.commentAvatarImage} />
                ) : (
                  getAvatarInitial(item.authorHandle)
                )}
              </span>
            </Link>
            <div className={hubStyles.commentBody}>
              <span className={hubStyles.commentAuthorWrap}>
                <Link
                  href={item.authorId ? `/profile/${item.authorId}` : `/profile/${item.authorHandle.replace(/^@/, "")}`}
                  className={hubStyles.commentAuthorLink}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <strong className={hubStyles.commentAuthor}>{item.authorHandle}</strong>
                </Link>
                {item.isHost ? (
                  <span className={hubStyles.commentHostBadge} title="Host" aria-label="Host">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M4 7.5 8.5 12l3.5-5 3.5 5L20 7.5 18.5 17h-13L4 7.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                    </svg>
                  </span>
                ) : null}
              </span>
              <span className={hubStyles.commentText}>{item.text}</span>
            </div>
            {(() => {
              const myAuthorId = localParticipant.identity?.split("-")[0] || "";
              const isOwnComment = Boolean(myAuthorId && item.authorId === myAuthorId);
              if (isOwnComment) return null;
              const target = { commentId: item.id, authorId: item.authorId, authorHandle: item.authorHandle };
              const menuVisible = hoveredCommentId === item.id || activeMenuCommentId === item.id;
              if (isHost && !item.isHost) {
                return (
                  <div className={hubStyles.commentMenuWrap} ref={activeMenuCommentId === item.id ? menuRef : null}>
                    <button
                      type="button"
                      className={`${hubStyles.commentMenuTrigger}${menuVisible ? ` ${hubStyles.commentMenuTriggerVisible}` : ""}`}
                      onClick={() => setActiveMenuCommentId((prev) => prev === item.id ? null : item.id)}
                      aria-label="Comment options"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
                    </button>
                    {activeMenuCommentId === item.id ? (
                      <div className={hubStyles.commentMenu}>
                        <Link
                          href={item.authorId ? `/profile/${item.authorId}` : `/profile/${item.authorHandle.replace(/^@/, "")}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={hubStyles.commentMenuItem}
                          onClick={() => setActiveMenuCommentId(null)}
                        >
                          Go to profile
                        </Link>
                        <button type="button" className={hubStyles.commentMenuItem} onClick={() => handleHideComment(target)}>
                          Hide this comment
                        </button>
                        <button type="button" className={`${hubStyles.commentMenuItem} ${hubStyles.commentMenuItemDanger}`} onClick={() => { setActiveMenuCommentId(null); setDeleteTarget(target); }}>
                          Delete
                        </button>
                        <div className={hubStyles.commentMenuDivider} />
                        <button type="button" className={hubStyles.commentMenuItem} onClick={() => openReportOverlay(target)}>
                          Report this user
                        </button>
                        <button type="button" className={hubStyles.commentMenuItem} onClick={() => openPauseOverlay(target)}>
                          Put user in a paused state
                        </button>
                        <button type="button" className={`${hubStyles.commentMenuItem} ${hubStyles.commentMenuItemDanger}`} onClick={() => openBlockOverlay(target)}>
                          Block this user
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              }
              if (!isHost) {
                return (
                  <div className={hubStyles.commentMenuWrap} ref={activeMenuCommentId === item.id ? menuRef : null}>
                    <button
                      type="button"
                      className={`${hubStyles.commentMenuTrigger}${menuVisible ? ` ${hubStyles.commentMenuTriggerVisible}` : ""}`}
                      onClick={() => setActiveMenuCommentId((prev) => prev === item.id ? null : item.id)}
                      aria-label="Comment options"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
                    </button>
                    {activeMenuCommentId === item.id ? (
                      <div className={hubStyles.commentMenu}>
                        <Link
                          href={item.authorId ? `/profile/${item.authorId}` : `/profile/${item.authorHandle.replace(/^@/, "")}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={hubStyles.commentMenuItem}
                          onClick={() => setActiveMenuCommentId(null)}
                        >
                          Go to profile
                        </Link>
                        <button type="button" className={hubStyles.commentMenuItem} onClick={() => handleHideComment(target)}>
                          Hide this comment
                        </button>
                        <div className={hubStyles.commentMenuDivider} />
                        <button type="button" className={hubStyles.commentMenuItem} onClick={() => openReportOverlay(target)}>
                          Report this user
                        </button>
                        <button type="button" className={`${hubStyles.commentMenuItem} ${hubStyles.commentMenuItemDanger}`} onClick={() => openBlockOverlay(target)}>
                          Block this user
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              }
              return null;
            })()}
          </div>
          );
        })}
      </div>

      <form
        className={hubStyles.commentComposer}
        onSubmit={(event) => {
          event.preventDefault();
          if (sending) return;
          void onSend(commentInputRef.current?.value);
        }}
      >
        <div className={hubStyles.commentInputWrap}>
          <input
            ref={commentInputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={
              commentPaused
                ? `Paused ${pauseSecondsLeft > 0 ? `(${pauseSecondsLeft}s)` : ""}…`
                : canComment ? "Write a comment..." : "Comments disabled"
            }
            className={hubStyles.commentInput}
            disabled={!canComment || sending || commentPaused}
          />

          <div className={hubStyles.commentEmojiWrap} ref={commentEmojiRef}>
            <button
              type="button"
              className={hubStyles.commentEmojiButton}
              onClick={() => canComment && setShowCommentEmojiPicker((prev) => !prev)}
              aria-label="Add emoji"
              disabled={!canComment}
            >
              <svg aria-hidden fill="currentColor" height="18" viewBox="0 0 24 24" width="18">
                <path d="M15.83 10.997a1.167 1.167 0 1 0 1.167 1.167 1.167 1.167 0 0 0-1.167-1.167Zm-6.5 1.167a1.167 1.167 0 1 0-1.166 1.167 1.167 1.167 0 0 0 1.166-1.167Zm5.163 3.24a3.406 3.406 0 0 1-4.982.007 1 1 0 1 0-1.557 1.256 5.397 5.397 0 0 0 8.09 0 1 1 0 0 0-1.55-1.263ZM12 .503a11.5 11.5 0 1 0 11.5 11.5A11.513 11.513 0 0 0 12 .503Zm0 21a9.5 9.5 0 1 1 9.5-9.5 9.51 9.51 0 0 1-9.5 9.5Z" />
              </svg>
            </button>

            {showCommentEmojiPicker ? (
              <div className={hubStyles.commentEmojiPicker}>
                <EmojiPicker
                  width={300}
                  height={360}
                  previewConfig={{ showPreview: false }}
                  onEmojiClick={(emojiData) => {
                    const emoji = emojiData.emoji;
                    const input = commentInputRef.current;
                    if (!input) {
                      setDraft((prev) => `${prev}${emoji}`);
                      return;
                    }

                    const start = input.selectionStart ?? draft.length;
                    const end = input.selectionEnd ?? draft.length;
                    const next = draft.slice(0, start) + emoji + draft.slice(end);
                    setDraft(next);

                    const caret = start + emoji.length;
                    setTimeout(() => {
                      input.focus();
                      input.setSelectionRange(caret, caret);
                    }, 0);
                  }}
                />
              </div>
            ) : null}
          </div>
        </div>
        <button
          type="submit"
          className={hubStyles.commentSend}
          disabled={!canComment || sending || !draft.trim() || commentPaused}
          aria-label="Send comment"
        >
          <svg
            aria-hidden
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M4 12l16-7-4.8 14-4.2-5.2L4 12Z"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <path d="M10.5 13.8 20 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </form>

      {/* ── Report overlay ── */}
      <ReportUserOverlay
        open={reportTarget !== null}
        targetUserId={reportTarget?.authorId}
        targetHandle={reportTarget?.authorHandle ?? ""}
        onClose={() => setReportTarget(null)}
      />

      {/* ── Delete confirmation overlay ── */}
      {deleteTarget ? (
        <div className={hubStyles.modOverlay}>
          <div className={hubStyles.modCard}>
            <div className={hubStyles.modHeader}>
              <p className={hubStyles.modTitle}>Delete comment?</p>
              <button className={hubStyles.modClose} onClick={() => setDeleteTarget(null)} aria-label="Close">×</button>
            </div>
            <p className={hubStyles.modSub}>This will remove the comment for all viewers and cannot be undone.</p>
            <div className={hubStyles.modActions}>
              <button className={hubStyles.modBtnSecondary} onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button className={hubStyles.modBtnDanger} onClick={() => void confirmDelete(deleteTarget)}>Delete</button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Block overlay ── */}
      {blockTarget ? (
        <div className={hubStyles.modOverlay}>
          <div className={hubStyles.modCard}>
            <div className={hubStyles.modHeader}>
              <p className={hubStyles.modTitle}>Block {blockTarget.authorHandle}?</p>
              <button className={hubStyles.modClose} onClick={() => setBlockTarget(null)} aria-label="Close">×</button>
            </div>
            <p className={hubStyles.modSub}>They will no longer be able to see your livestreams or interact with you.</p>
            {blockError ? <p className={hubStyles.modError}>{blockError}</p> : null}
            <div className={hubStyles.modActions}>
              <button className={hubStyles.modBtnSecondary} onClick={() => setBlockTarget(null)}>Cancel</button>
              <button className={`${hubStyles.modBtn} ${hubStyles.modBtnDanger}`} disabled={blocking} onClick={() => void confirmBlock()}>
                {blocking ? "Blocking…" : "Block"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Pause overlay ── */}
      {pauseTarget ? (
        <div className={hubStyles.modOverlay}>
          <div className={hubStyles.modCard}>
            <div className={hubStyles.modHeader}>
              <p className={hubStyles.modTitle}>Pause {pauseTarget.authorHandle}</p>
              <button className={hubStyles.modClose} onClick={() => setPauseTarget(null)} aria-label="Close">×</button>
            </div>
            <p className={hubStyles.modSub}>Select how long to prevent this user from commenting in your livestreams.</p>
            <div className={hubStyles.pauseGrid}>
              {PAUSE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`${hubStyles.pauseOption}${pauseDuration === opt.value ? ` ${hubStyles.pauseOptionActive}` : ""}`}
                  onClick={() => setPauseDuration(opt.value)}
                >{opt.label}</button>
              ))}
            </div>
            {pauseError ? <p className={hubStyles.modError}>{pauseError}</p> : null}
            <div className={hubStyles.modActions}>
              <button className={hubStyles.modBtnSecondary} onClick={() => setPauseTarget(null)}>Cancel</button>
              <button className={hubStyles.modBtn} disabled={pausing} onClick={() => void confirmPause()}>
                {pausing ? "Applying…" : "Pause user"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </aside>
  );
}

function HostMediaControls({
  visible,
  connected,
  latencyMode,
  onHostVideoConfigChange,
  onEndLive,
  ending,
}: {
  visible: boolean;
  connected: boolean;
  latencyMode: LivestreamLatencyMode;
  onHostVideoConfigChange: (config: {
    mode: LivestreamHostVideoMode;
    cameraPosition: LivestreamCameraPosition;
    cameraSize: LivestreamCameraSize;
  }) => void;
  onEndLive: () => void;
  ending: boolean;
}) {
  const { localParticipant } = useLocalParticipant();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [autoTried, setAutoTried] = useState(false);
  const [selectedShareMode, setSelectedShareMode] = useState<LivestreamHostVideoMode>(
    "screen-camera",
  );
  const [cameraPosition, setCameraPosition] = useState<LivestreamCameraPosition>(
    DEFAULT_HOST_CAMERA_LAYOUT.cameraPosition,
  );
  const [cameraSize, setCameraSize] = useState<LivestreamCameraSize>(
    DEFAULT_HOST_CAMERA_LAYOUT.cameraSize,
  );
  const [showModeOptions, setShowModeOptions] = useState(false);
  const pendingPublishAttemptedRef = useRef(false);
  const modeSelectorRef = useRef<HTMLDivElement | null>(null);

  if (!visible) return null;

  const mapMediaError = (err: unknown) => {
    const raw =
      err instanceof Error
        ? `${err.name}: ${err.message}`
        : "Unknown error";
    const lower = raw.toLowerCase();
    if (lower.includes("notallowed") || lower.includes("permission")) {
      return `Browser is blocking screen sharing permission. Details: ${raw}`;
    }
    if (lower.includes("notfound") || lower.includes("devices not found")) {
      return `No display source found to share. Details: ${raw}`;
    }
    if (lower.includes("notreadable") || lower.includes("could not start")) {
      return `Screen sharing cannot start right now. Close other capture apps and try again. Details: ${raw}`;
    }
    if (lower.includes("trackinvaliderror") || lower.includes("invalidstate")) {
      return `Invalid screen track state. Refresh and rejoin the livestream. Details: ${raw}`;
    }
    return `Unable to start screen sharing. Details: ${raw}`;
  };

  const tryApplyPendingScreenShare = async (): Promise<boolean> => {
    const config = getPendingHostVideoConfig() || {
      mode: "screen-camera" as LivestreamHostVideoMode,
      cameraPosition: DEFAULT_HOST_CAMERA_LAYOUT.cameraPosition,
      cameraSize: DEFAULT_HOST_CAMERA_LAYOUT.cameraSize,
    };
    const pendingScreen = getPendingScreenShareStream();
    const pendingCamera = getPendingCameraStream();
    const pendingScreenVideoTrack = pendingScreen?.getVideoTracks()?.[0];
    const pendingScreenAudioTrack = pendingScreen?.getAudioTracks()?.[0];
    const pendingCameraTrack = pendingCamera?.getVideoTracks()?.[0];

    const needsScreen = config.mode !== "camera-only";
    const needsCamera = config.mode !== "screen-only";

    if (
      (needsScreen && (!pendingScreenVideoTrack || pendingScreenVideoTrack.readyState === "ended")) ||
      (needsCamera && (!pendingCameraTrack || pendingCameraTrack.readyState === "ended"))
    ) {
      clearPendingLivestreamMedia();
      return false;
    }

    try {
      await unpublishVideoTracks();

      if (needsScreen && pendingScreenVideoTrack) {
        await optimizePublishedScreenTrack(pendingScreenVideoTrack, latencyMode);
        await (localParticipant as any).publishTrack(
          pendingScreenVideoTrack,
          getScreenSharePublishOptions(latencyMode),
        );
      }

      if (needsScreen && pendingScreenAudioTrack && pendingScreenAudioTrack.readyState !== "ended") {
        await (localParticipant as any).publishTrack(pendingScreenAudioTrack, {
          source: Track.Source.ScreenShareAudio,
        });
      }

      if (needsCamera && pendingCameraTrack) {
        await (localParticipant as any).publishTrack(
          pendingCameraTrack,
          getCameraPublishOptions(latencyMode),
        );
      }

      setSelectedShareMode(config.mode);
      setCameraPosition(config.cameraPosition);
      setCameraSize(config.cameraSize);
      onHostVideoConfigChange(config);

      clearPendingLivestreamMedia();
      return true;
    } catch {
      return false;
    }
  };

  const unpublishVideoTracks = async () => {
    await unpublishTracksBySources([
      Track.Source.ScreenShare,
      Track.Source.ScreenShareAudio,
      Track.Source.Camera,
    ]);
  };

  const unpublishTracksBySources = async (sources: Track.Source[]) => {
    const publications = Array.from(
      ((localParticipant as any)?.trackPublications?.values?.() || []) as Iterable<any>,
    );

    for (const pub of publications) {
      const source = pub?.source;
      if (!sources.includes(source)) {
        continue;
      }

      try {
        const localTrack = pub?.track;
        if (localTrack) {
          await (localParticipant as any).unpublishTrack(localTrack, false);
          continue;
        }

        const mediaTrack = pub?.track?.mediaStreamTrack;
        if (mediaTrack) {
          await (localParticipant as any).unpublishTrack(mediaTrack, false);
        }
      } catch {
        // Ignore unpublish race errors.
      }
    }
  };

  const publishScreenShare = async (mode: LivestreamHostVideoMode) => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getDisplayMedia) {
      throw new Error("Screen sharing is not supported in this browser");
    }

    const stream = await navigator.mediaDevices.getDisplayMedia(
      getDisplayMediaCaptureOptions(latencyMode),
    );
    const videoTrack = stream.getVideoTracks()?.[0];
    const audioTrack = stream.getAudioTracks()?.[0];

    if (!videoTrack || videoTrack.readyState === "ended") {
      throw new Error("No valid screen track selected");
    }

    await optimizePublishedScreenTrack(videoTrack, latencyMode);

    if (mode === "screen-only") {
      await unpublishVideoTracks();
    } else {
      await unpublishTracksBySources([Track.Source.ScreenShare, Track.Source.ScreenShareAudio]);
    }

    await (localParticipant as any).publishTrack(
      videoTrack,
      getScreenSharePublishOptions(latencyMode),
    );

    if (audioTrack && audioTrack.readyState !== "ended") {
      await (localParticipant as any).publishTrack(audioTrack, {
        source: Track.Source.ScreenShareAudio,
      });
    }

    videoTrack.onended = () => {
      void unpublishTracksBySources([Track.Source.ScreenShare, Track.Source.ScreenShareAudio]);
    };

    setSelectedShareMode(mode);
    onHostVideoConfigChange({
      mode,
      cameraPosition,
      cameraSize,
    });
  };

  const publishCamera = async (mode: LivestreamHostVideoMode) => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      throw new Error("Camera is not supported in this browser");
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: true,
    });
    const videoTrack = stream.getVideoTracks()?.[0];

    if (!videoTrack || videoTrack.readyState === "ended") {
      throw new Error("No valid camera track selected");
    }

    if (mode === "camera-only") {
      await unpublishVideoTracks();
    } else {
      await unpublishTracksBySources([Track.Source.Camera]);
    }

    await (localParticipant as any).publishTrack(
      videoTrack,
      getCameraPublishOptions(latencyMode),
    );

    videoTrack.onended = () => {
      void unpublishTracksBySources([Track.Source.Camera]);
    };

    setSelectedShareMode(mode);
    onHostVideoConfigChange({
      mode,
      cameraPosition,
      cameraSize,
    });
  };

  const applyShareMode = (mode: LivestreamHostVideoMode) => {
    setSelectedShareMode(mode);
    setShowModeOptions(false);
    setError("");
    onHostVideoConfigChange({
      mode,
      cameraPosition,
      cameraSize,
    });
  };

  const applyCameraPosition = (position: LivestreamCameraPosition) => {
    setCameraPosition(position);
    onHostVideoConfigChange({
      mode: selectedShareMode,
      cameraPosition: position,
      cameraSize,
    });
  };

  const applyCameraSize = (size: LivestreamCameraSize) => {
    setCameraSize(size);
    onHostVideoConfigChange({
      mode: selectedShareMode,
      cameraPosition,
      cameraSize: size,
    });
  };

  const tryAutoApplyPendingMedia = async () => {
    try {
      if (!connected) {
        setError("Connecting to livestream room. Please retry in 1-2 seconds.");
        return;
      }
      setBusy(true);
      setError("");

      if (pendingPublishAttemptedRef.current) {
        return;
      }

      pendingPublishAttemptedRef.current = true;
      const appliedPending = await tryApplyPendingScreenShare();
      if (appliedPending) {
        return;
      }

      setError("No pre-selected media source found. Choose screen share or camera to go live.");
    } catch (err) {
      setError(mapMediaError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleChooseScreenShare = async () => {
    try {
      if (!connected) {
        setError("Connecting to livestream room. Please retry in 1-2 seconds.");
        return;
      }

      setBusy(true);
      setError("");
      clearPendingScreenShareStream();

      const modeForAction = selectedShareMode === "screen-camera" ? "screen-camera" : "screen-only";
      await publishScreenShare(modeForAction);
    } catch (err) {
      setError(mapMediaError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleEnableCamera = async () => {
    try {
      if (!connected) {
        setError("Connecting to livestream room. Please retry in 1-2 seconds.");
        return;
      }

      setBusy(true);
      setError("");
      clearPendingCameraStream();

      const modeForAction = selectedShareMode === "camera-only" ? "camera-only" : "screen-camera";
      await publishCamera(modeForAction);
    } catch (err) {
      setError(mapMediaError(err));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!visible || !connected || autoTried) return;
    setAutoTried(true);
    void tryAutoApplyPendingMedia();
  }, [autoTried, connected, visible]);

  useEffect(() => {
    if (!showModeOptions) return;

    const handlePointerDownOutside = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (modeSelectorRef.current?.contains(target)) return;
      setShowModeOptions(false);
    };

    document.addEventListener("mousedown", handlePointerDownOutside);
    return () => {
      document.removeEventListener("mousedown", handlePointerDownOutside);
    };
  }, [showModeOptions]);

  const selectedShareModeLabel =
    selectedShareMode === "screen-only"
      ? "Screen only"
      : selectedShareMode === "camera-only"
        ? "Camera only"
        : "Screen + camera";

  return (
    <>
      <div className={hubStyles.hostControls}>
        <div className={hubStyles.hostControlsLeft}>
          <div className={hubStyles.hostModeSelector} ref={modeSelectorRef}>
            <button
              type="button"
              className={hubStyles.hostControlBtn}
              onClick={() => setShowModeOptions((prev) => !prev)}
              disabled={busy}
              aria-expanded={showModeOptions}
              aria-label={`Current share mode: ${selectedShareModeLabel}`}
            >
              {selectedShareModeLabel}
            </button>

            {showModeOptions ? (
              <div className={hubStyles.hostModeOptions}>
                <button
                  type="button"
                  className={`${hubStyles.hostControlGhost} ${
                    selectedShareMode === "screen-only" ? hubStyles.hostModeOptionActive : ""
                  }`}
                  onClick={() => applyShareMode("screen-only")}
                  disabled={busy}
                >
                  Screen only
                </button>
                <button
                  type="button"
                  className={`${hubStyles.hostControlGhost} ${
                    selectedShareMode === "screen-camera" ? hubStyles.hostModeOptionActive : ""
                  }`}
                  onClick={() => applyShareMode("screen-camera")}
                  disabled={busy}
                >
                  Screen + camera
                </button>
                <button
                  type="button"
                  className={`${hubStyles.hostControlGhost} ${
                    selectedShareMode === "camera-only" ? hubStyles.hostModeOptionActive : ""
                  }`}
                  onClick={() => applyShareMode("camera-only")}
                  disabled={busy}
                >
                  Camera only
                </button>
              </div>
            ) : null}
          </div>

          {selectedShareMode !== "camera-only" ? (
            <button
              type="button"
              className={hubStyles.hostControlBtn}
              onClick={() => void handleChooseScreenShare()}
              disabled={busy}
            >
              Choose screen share
            </button>
          ) : null}

          {selectedShareMode !== "screen-only" ? (
            <button
              type="button"
              className={hubStyles.hostControlBtn}
              onClick={() => void handleEnableCamera()}
              disabled={busy}
            >
              Enable camera
            </button>
          ) : null}
        </div>

        <div className={hubStyles.hostControlsRight}>
          <button
            type="button"
            className={hubStyles.hostControlEnd}
            onClick={onEndLive}
            disabled={ending}
          >
            {ending ? "Ending..." : "End live"}
          </button>
        </div>
      </div>

      {error ? <p className={hubStyles.hostControlError}>{error}</p> : null}
    </>
  );
}

const cleanLocationLabel = (label: string) =>
  label
    .replace(/\b\d{4,6}\b/g, "")
    .replace(/,\s*,+/g, ", ")
    .replace(/\s{2,}/g, " ")
    .replace(/\s*,\s*$/g, "")
    .trim();

function HostStreamAdminPanel({
  visible,
  streamId,
  meta,
  hostVideoMode,
  hostCameraLayout,
  onHostVideoConfigChange,
  onMetaPatch,
}: {
  visible: boolean;
  streamId: string;
  meta: LivestreamItem;
  hostVideoMode: LivestreamHostVideoMode;
  hostCameraLayout: HostCameraLayout;
  onHostVideoConfigChange: (config: {
    mode: LivestreamHostVideoMode;
    cameraPosition: LivestreamCameraPosition;
    cameraSize: LivestreamCameraSize;
  }) => void;
  onMetaPatch: (patch: LivestreamMetaPatch) => void;
}) {
  const { localParticipant } = useLocalParticipant();
  const [title, setTitle] = useState(meta.title || "");
  const [description, setDescription] = useState(meta.description || "");
  const [pinnedComment, setPinnedComment] = useState(meta.pinnedComment || "");
  const [location, setLocation] = useState(meta.location || "");
  const [latencyMode, setLatencyMode] = useState<LivestreamLatencyMode>(meta.latencyMode || "adaptive");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [mentionSuggestions, setMentionSuggestions] = useState<ProfileSearchItem[]>([]);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionHighlight, setMentionHighlight] = useState(-1);
  const [activeMentionRange, setActiveMentionRange] = useState<{ start: number; end: number } | null>(null);
  const [ivsInfo, setIvsInfo] = useState<{ ingestEndpoint: string; streamKey: string; playbackUrl: string } | null>(null);
  const [locationSuggestions, setLocationSuggestions] = useState<{ label: string; lat: string; lon: string }[]>([]);
  const [locationOpen, setLocationOpen] = useState(false);
  const [locationHighlight, setLocationHighlight] = useState(-1);
  const [locationLoading, setLocationLoading] = useState(false);
  const titleRef = useRef<HTMLTextAreaElement | null>(null);
  const emojiRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setTitle(meta.title || "");
    setDescription(meta.description || "");
    setPinnedComment(meta.pinnedComment || "");
    setLocation(meta.location || "");
    setLatencyMode(meta.latencyMode || "adaptive");
  }, [meta.description, meta.latencyMode, meta.location, meta.pinnedComment, meta.title]);

  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      if (!emojiRef.current) return;
      if (!emojiRef.current.contains(event.target as Node)) {
        setShowEmojiPicker(false);
      }
    };

    document.addEventListener("mousedown", onMouseDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, []);

  useEffect(() => {
    const token = getStoredAccessToken();
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
    const timer = window.setTimeout(async () => {
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
      window.clearTimeout(timer);
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
          headers: { Accept: "application/json", "Accept-Language": "en" },
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

  useEffect(() => {
    if (!visible || meta.provider !== 'ivs') {
      setIvsInfo(null);
      return;
    }

    let disposed = false;
    const loadIvsInfo = async () => {
      try {
        const info = await getIvsIngest(streamId);
        if (disposed) return;
        setIvsInfo({
          ingestEndpoint: info.ingestEndpoint,
          streamKey: info.streamKey,
          playbackUrl: info.playbackUrl,
        });
      } catch {
        if (disposed) return;
        setIvsInfo(null);
      }
    };

    void loadIvsInfo();
    return () => {
      disposed = true;
    };
  }, [meta.provider, streamId, visible]);

  if (!visible) return null;

  const normalizedTitle = title.trim();
  const normalizedDescription = description.trim();
  const normalizedPinnedComment = pinnedComment.trim();
  const normalizedLocation = location.trim();

  const hasChanges =
    normalizedTitle !== (meta.title || "").trim() ||
    normalizedDescription !== (meta.description || "").trim() ||
    normalizedPinnedComment !== (meta.pinnedComment || "").trim() ||
    normalizedLocation !== (meta.location || "").trim() ||
    latencyMode !== (meta.latencyMode || "adaptive");

  const publishMetaPatch = async (patch: LivestreamMetaPatch) => {
    try {
      const payload = new TextEncoder().encode(
        JSON.stringify({
          type: "meta_update",
          patch,
        }),
      );
      await localParticipant.publishData(payload, { reliable: true });
    } catch {
      // Ignore transient data channel issues; API update remains source of truth.
    }
  };

  const handleSave = async () => {
    const safeTitle = normalizedTitle;
    if (!safeTitle) {
      setError("Title is required.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      const payload: LivestreamMetaPatch = {
        title: safeTitle,
        description: normalizedDescription,
        pinnedComment: normalizedPinnedComment,
        location: normalizedLocation,
        latencyMode,
      };

      const result = await updateLivestream(streamId, payload);
      const patch: LivestreamMetaPatch = {
        title: result.stream.title,
        description: result.stream.description,
        pinnedComment: result.stream.pinnedComment,
        location: result.stream.location,
        latencyMode: result.stream.latencyMode,
      };

      onMetaPatch(patch);
      await publishMetaPatch(patch);

      setSuccess("Livestream settings updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update livestream settings.");
    } finally {
      setSaving(false);
    }
  };

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

  const applyCameraPosition = (position: LivestreamCameraPosition) => {
    onHostVideoConfigChange({
      mode: hostVideoMode,
      cameraPosition: position,
      cameraSize: hostCameraLayout.cameraSize,
    });
  };

  const applyCameraSize = (size: LivestreamCameraSize) => {
    onHostVideoConfigChange({
      mode: hostVideoMode,
      cameraPosition: hostCameraLayout.cameraPosition,
      cameraSize: size,
    });
  };

  return (
    <aside className={hubStyles.hostAdminPanel}>
      <div className={hubStyles.hostAdminHeader}>
        <h3 className={hubStyles.hostAdminTitle}>Host controls</h3>
      </div>

      <div className={hubStyles.hostAdminLayout}>
        <div className={hubStyles.hostAdminContent}>
          <label className={hubStyles.hostField}>
            <span>Title</span>
            <div className={hubStyles.hostTitleShell}>
              <textarea
                ref={titleRef}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (!mentionOpen) return;
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    if (!mentionSuggestions.length) return;
                    setMentionHighlight((prev) =>
                      prev + 1 < mentionSuggestions.length ? prev + 1 : 0,
                    );
                    return;
                  }
                  if (event.key === "ArrowUp") {
                    event.preventDefault();
                    if (!mentionSuggestions.length) return;
                    setMentionHighlight((prev) =>
                      prev - 1 >= 0 ? prev - 1 : mentionSuggestions.length - 1,
                    );
                    return;
                  }
                  if (event.key === "Enter" && mentionHighlight >= 0) {
                    event.preventDefault();
                    const selected = mentionSuggestions[mentionHighlight];
                    if (selected) selectMention(selected);
                  }
                  if (event.key === "Escape") {
                    setMentionOpen(false);
                  }
                }}
                maxLength={300}
                className={hubStyles.hostTextarea}
                placeholder="Enter livestream title and tag with @username"
              />
              <div className={hubStyles.hostEmojiWrapInField} ref={emojiRef}>
                <button
                  type="button"
                  className={hubStyles.hostEmojiButton}
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

                {showEmojiPicker ? (
                  <div className={hubStyles.hostEmojiPickerPanel}>
                    <EmojiPicker
                      width={300}
                      height={360}
                      previewConfig={{ showPreview: false }}
                      onEmojiClick={(emojiData) => insertEmoji(emojiData.emoji)}
                    />
                  </div>
                ) : null}
              </div>

              {mentionOpen ? (
                <div className={hubStyles.hostMentionSuggestions}>
                  {mentionSuggestions.map((opt, idx) => (
                    <button
                      type="button"
                      key={opt.id}
                      className={`${hubStyles.hostMentionOption} ${
                        idx === mentionHighlight ? hubStyles.hostMentionOptionActive : ""
                      }`}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        selectMention(opt);
                      }}
                      onMouseEnter={() => setMentionHighlight(idx)}
                    >
                      <img src={opt.avatarUrl} alt="" className={hubStyles.hostMentionAvatar} />
                      <div className={hubStyles.hostMentionMeta}>
                        <span className={hubStyles.hostMentionName}>{opt.displayName}</span>
                        <span className={hubStyles.hostMentionUsername}>@{opt.username}</span>
                      </div>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </label>

          <label className={hubStyles.hostField}>
            <span>Description</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={500}
              className={hubStyles.hostTextarea}
              placeholder="Write a short description"
            />
          </label>

          <label className={hubStyles.hostField}>
            <span>Pinned comment</span>
            <input
              value={pinnedComment}
              onChange={(event) => setPinnedComment(event.target.value)}
              maxLength={200}
              className={hubStyles.hostInput}
              placeholder="Type a pinned comment"
            />
          </label>

          <label className={hubStyles.hostField}>
            <span>Location</span>
            <input
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              maxLength={150}
              className={hubStyles.hostInput}
              placeholder="Add a location"
              onBlur={() => setTimeout(() => setLocationOpen(false), 120)}
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
              <div className={hubStyles.locationSuggestions}>
                {locationLoading ? (
                  <div className={hubStyles.locationMuted}>Searching...</div>
                ) : locationSuggestions.length ? (
                  locationSuggestions.map((option, idx) => (
                    <button
                      type="button"
                      key={`${option.lat}-${option.lon}-${idx}`}
                      className={`${hubStyles.locationOption} ${
                        idx === locationHighlight ? hubStyles.locationOptionActive : ""
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
                  <div className={hubStyles.locationMuted}>No suggestions found.</div>
                )}
              </div>
            )}
          </label>

          <label className={hubStyles.hostField}>
            <span>Latency mode</span>
            <div className={hubStyles.hostLatencyGroup}>
              {hostLatencyOptions.map((option) => {
                const active = latencyMode === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={`${hubStyles.hostLatencyCard} ${
                      active ? hubStyles.hostLatencyCardActive : ""
                    }`}
                    onClick={() => setLatencyMode(option.value)}
                  >
                    <span className={hubStyles.hostLatencyTitle}>{option.label}</span>
                    <span className={hubStyles.hostLatencyNote}>{option.note}</span>
                  </button>
                );
              })}
            </div>
          </label>

          <button
            type="button"
            className={hubStyles.hostSaveBtn}
            onClick={() => void handleSave()}
            disabled={saving || !hasChanges}
          >
            {saving ? "Saving..." : "Save changes"}
          </button>

          {meta.provider === 'ivs' ? (
            <div className={hubStyles.ivsCard}>
              <p className={hubStyles.ivsTitle}>AWS IVS ingest (HQ mode)</p>
              <p className={hubStyles.ivsText}>
                Use OBS/ffmpeg with RTMPS ingest to stream in high quality.
              </p>
              <p className={hubStyles.ivsField}><strong>Ingest endpoint:</strong> {ivsInfo?.ingestEndpoint || "Loading..."}</p>
              <p className={hubStyles.ivsField}><strong>Stream key:</strong> {ivsInfo?.streamKey || "Loading..."}</p>
              <p className={hubStyles.ivsField}><strong>Playback URL:</strong> {ivsInfo?.playbackUrl || meta.ivsPlaybackUrl || "N/A"}</p>
            </div>
          ) : null}

          {error ? <p className={hubStyles.hostAdminError}>{error}</p> : null}
          {success ? <p className={hubStyles.hostAdminSuccess}>{success}</p> : null}
        </div>

        {hostVideoMode === "screen-camera" ? (<aside className={hubStyles.hostAdminCameraPanel}>
          <p className={hubStyles.hostAdminCameraTitle}>Camera overlay</p>

          {hostVideoMode === "screen-camera" ? (
            <div className={hubStyles.hostCameraConfig}>
              <div className={hubStyles.hostOptionGroup}>
                <span className={hubStyles.hostControlLabel}>Position</span>
                <button
                  type="button"
                  className={`${hubStyles.hostOptionBtn} ${
                    hostCameraLayout.cameraPosition === "top-left" ? hubStyles.hostOptionBtnActive : ""
                  }`}
                  onClick={() => applyCameraPosition("top-left")}
                >
                  Top left
                </button>
                <button
                  type="button"
                  className={`${hubStyles.hostOptionBtn} ${
                    hostCameraLayout.cameraPosition === "top-right" ? hubStyles.hostOptionBtnActive : ""
                  }`}
                  onClick={() => applyCameraPosition("top-right")}
                >
                  Top right
                </button>
                <button
                  type="button"
                  className={`${hubStyles.hostOptionBtn} ${
                    hostCameraLayout.cameraPosition === "bottom-left" ? hubStyles.hostOptionBtnActive : ""
                  }`}
                  onClick={() => applyCameraPosition("bottom-left")}
                >
                  Bottom left
                </button>
                <button
                  type="button"
                  className={`${hubStyles.hostOptionBtn} ${
                    hostCameraLayout.cameraPosition === "bottom-right" ? hubStyles.hostOptionBtnActive : ""
                  }`}
                  onClick={() => applyCameraPosition("bottom-right")}
                >
                  Bottom right
                </button>
              </div>

              <div className={hubStyles.hostOptionGroup}>
                <span className={hubStyles.hostControlLabel}>Size</span>
                <button
                  type="button"
                  className={`${hubStyles.hostOptionBtn} ${
                    hostCameraLayout.cameraSize === "small" ? hubStyles.hostOptionBtnActive : ""
                  }`}
                  onClick={() => applyCameraSize("small")}
                >
                  Small
                </button>
                <button
                  type="button"
                  className={`${hubStyles.hostOptionBtn} ${
                    hostCameraLayout.cameraSize === "medium" ? hubStyles.hostOptionBtnActive : ""
                  }`}
                  onClick={() => applyCameraSize("medium")}
                >
                  Medium
                </button>
                <button
                  type="button"
                  className={`${hubStyles.hostOptionBtn} ${
                    hostCameraLayout.cameraSize === "large" ? hubStyles.hostOptionBtnActive : ""
                  }`}
                  onClick={() => applyCameraSize("large")}
                >
                  Large
                </button>
              </div>
            </div>
          ) : (
            <p className={hubStyles.hostAdminCameraEmpty}>
              Enable Screen + camera mode in Change share mode to customize overlay.
            </p>
          )}
        </aside>) : null}
      </div>
    </aside>
  );
}

export default function LivestreamHub({
  viewerId,
  streamId,
  forceHost = false,
}: {
  viewerId?: string;
  streamId?: string;
  forceHost?: boolean;
}) {
  const router = useRouter();
  const isViewerPage = Boolean(streamId);
  const [streams, setStreams] = useState<LivestreamItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeStreamId, setActiveStreamId] = useState<string | null>(null);
  const [activeStreamMeta, setActiveStreamMeta] = useState<LivestreamItem | null>(null);
  const [joinToken, setJoinToken] = useState("");
  const [joinUrl, setJoinUrl] = useState("");
  const [role, setRole] = useState<"host" | "viewer">("viewer");
  const [busy, setBusy] = useState(false);
  const [mediaError, setMediaError] = useState("");
  const [endingLive, setEndingLive] = useState(false);
  const [endOverlayOpen, setEndOverlayOpen] = useState(false);
  const [endOverlayClosing, setEndOverlayClosing] = useState(false);
  const [roomConnected, setRoomConnected] = useState(false);
  const [hostVideoMode, setHostVideoMode] = useState<LivestreamHostVideoMode>("screen-only");
  const [hostCameraLayout, setHostCameraLayout] = useState<HostCameraLayout>(DEFAULT_HOST_CAMERA_LAYOUT);
  const [viewerRoomNonce, setViewerRoomNonce] = useState(0);
  const [hostProfiles, setHostProfiles] = useState<
    Record<string, { username: string; avatarUrl?: string }>
  >({});
  const [viewerHostProfile, setViewerHostProfile] = useState<{ username: string; avatarUrl?: string } | null>(null);
  const [viewerTitleMentionMap, setViewerTitleMentionMap] = useState<Record<string, string>>({});
  const [livestreamEnded, setLivestreamEnded] = useState(false);
  const [showEndedModal, setShowEndedModal] = useState(false);
  const [isBlockedByHost, setIsBlockedByHost] = useState(false);
  const [commentPaused, setCommentPaused] = useState(false);
  const [commentPausedUntil, setCommentPausedUntil] = useState<string | null>(null);
  const lastTransportResetAtRef = useRef(0);
  const wasViewerConnectedRef = useRef(false);
  const isHostSession = forceHost || role === "host";

  const loadHostProfileByUserId = useCallback(
    async (hostUserId: string, fallbackName: string) => {
      const token = getStoredAccessToken();
      if (!token) {
        return { username: fallbackName, avatarUrl: "" };
      }

      try {
        const profile = await fetchProfileDetail({ token, id: hostUserId });
        return {
          username: profile.username || fallbackName,
          avatarUrl: profile.avatarUrl || "",
        };
      } catch {
        try {
          const result = await searchProfiles({ token, query: fallbackName || hostUserId, limit: 8 });
          const exact = result.items.find((item) => item.userId === hostUserId);
          const picked = exact || result.items[0];
          return {
            username: picked?.username || fallbackName,
            avatarUrl: picked?.avatarUrl || "",
          };
        } catch {
          return { username: fallbackName, avatarUrl: "" };
        }
      }
    },
    [],
  );

  // Auto-end livestream when host closes the tab or navigates away
  useEffect(() => {
    if (!isHostSession || !activeStreamMeta?.id) return;

    const streamId = activeStreamMeta.id;
    let ended = false;

    const endStream = () => {
      if (ended) return;
      ended = true;
      // keepalive: true guarantees the request is sent even after the page unloads
      endLivestreamBeacon(streamId);
    };

    window.addEventListener("beforeunload", endStream);

    return () => {
      window.removeEventListener("beforeunload", endStream);
      endStream();
    };
  }, [isHostSession, activeStreamMeta?.id]);

  // Track viewer connection and show modal only when viewer was connected and then disconnected
  useEffect(() => {
    if (!isViewerPage || isHostSession) return;

    // Update whether viewer has ever been connected
    if (roomConnected) {
      wasViewerConnectedRef.current = true;
    }

    // Show ended modal only if:
    // 1. Viewer is NOT currently connected
    // 2. Viewer WAS previously connected (not the initial state)
    if (!roomConnected && wasViewerConnectedRef.current) {
      setLivestreamEnded(true);
      setShowEndedModal(true);
    }
  }, [isViewerPage, isHostSession, roomConnected]);

  const loadStreams = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const data = await listLiveLivestreams();
      setStreams(data.items || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load livestream list.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isViewerPage) return;
    void loadStreams();
    const timer = setInterval(() => {
      void loadStreams();
    }, 8000);
    return () => clearInterval(timer);
  }, [isViewerPage, loadStreams]);

  useEffect(() => {
    if (!isViewerPage || !activeStreamMeta) {
      setViewerHostProfile(null);
      return;
    }

    let disposed = false;

    const loadViewerHostProfile = async () => {
      const profile = await loadHostProfileByUserId(
        activeStreamMeta.hostUserId,
        activeStreamMeta.hostName,
      );
      if (disposed) return;
      setViewerHostProfile(profile);
    };

    void loadViewerHostProfile();
    return () => {
      disposed = true;
    };
  }, [activeStreamMeta, isViewerPage, loadHostProfileByUserId]);

  useEffect(() => {
    if (!isViewerPage || !activeStreamMeta?.title) {
      setViewerTitleMentionMap({});
      return;
    }

    const token = getStoredAccessToken();
    if (!token) {
      setViewerTitleMentionMap({});
      return;
    }

    const handles = extractMentionHandles(activeStreamMeta.title);
    if (!handles.length) {
      setViewerTitleMentionMap({});
      return;
    }

    let disposed = false;

    const resolveMentionTargets = async () => {
      const entries = await Promise.all(
        handles.map(async (handle) => {
          try {
            const result = await searchProfiles({ token, query: handle, limit: 8 });
            const exact = result.items.find((item) => item.username.toLowerCase() === handle);
            return [handle, exact?.userId || ""] as const;
          } catch {
            return [handle, ""] as const;
          }
        }),
      );

      if (disposed) return;
      const next = Object.fromEntries(entries.filter(([, userId]) => Boolean(userId)));
      setViewerTitleMentionMap(next);
    };

    void resolveMentionTargets();
    return () => {
      disposed = true;
    };
  }, [activeStreamMeta?.title, isViewerPage]);

  const viewerTitleNodes = useMemo(() => {
    const title = activeStreamMeta?.title || "";
    if (!title) return null;

    const parts: ReactNode[] = [];
    const regex = /@[a-zA-Z0-9_.]+/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(title))) {
      const start = match.index;
      if (start > lastIndex) {
        parts.push(title.slice(lastIndex, start));
      }

      const token = match[0];
      const handle = token.slice(1).toLowerCase();
      const targetUserId = viewerTitleMentionMap[handle];

      if (targetUserId) {
        parts.push(
          <Link
            key={`mention-${handle}-${start}`}
            href={`/profile/${encodeURIComponent(targetUserId)}`}
            className={hubStyles.viewerMentionLink}
          >
            {token}
          </Link>,
        );
      } else {
        parts.push(
          <span key={`mention-text-${handle}-${start}`} className={hubStyles.viewerMentionText}>
            {token}
          </span>,
        );
      }

      lastIndex = regex.lastIndex;
    }

    if (lastIndex < title.length) {
      parts.push(title.slice(lastIndex));
    }

    return parts;
  }, [activeStreamMeta?.title, viewerTitleMentionMap]);

  useEffect(() => {
    if (isViewerPage) return;
    if (!streams.length) {
      setHostProfiles({});
      return;
    }

    let disposed = false;

    const loadHostProfiles = async () => {
      const uniqueHosts = Array.from(
        new Map(
          streams
            .filter((stream) => stream.hostUserId)
            .map((stream) => [stream.hostUserId, stream.hostName || "unknown"]),
        ).entries(),
      );

      const entries = await Promise.all(
        uniqueHosts.map(async ([hostUserId, fallbackName]) => {
          const profile = await loadHostProfileByUserId(hostUserId, fallbackName);
          return [hostUserId, profile] as const;
        }),
      );

      if (disposed) return;
      setHostProfiles(Object.fromEntries(entries));
    };

    void loadHostProfiles();
    return () => {
      disposed = true;
    };
  }, [isViewerPage, loadHostProfileByUserId, streams]);

  const openStream = useCallback(
    async (streamId: string, asHost: boolean) => {
      try {
        setBusy(true);
        setError("");

        let myUserId = "";
        let participantName = asHost ? "Host" : "Viewer";
        const token = getStoredAccessToken();
        if (token) {
          try {
            const me = await fetchCurrentProfile({ token });
            myUserId = me.userId || me.id || "";
            if (me.username?.trim()) {
              participantName = me.username.trim();
            }
          } catch {
            // Fallback to role label if profile lookup fails.
          }
        }

        let response = await joinLivestreamToken(streamId, {
          asHost,
          participantName,
        });

        // If this user is the owner of the stream, force a host token even when URL lacks host=1.
        if (!asHost && response.role !== "host" && myUserId && response.stream.hostUserId === myUserId) {
          response = await joinLivestreamToken(streamId, {
            asHost: true,
            participantName,
          });
        }

        const tokenPayload = decodeJwtPayload(response.token);
        setActiveStreamId(streamId);
        setActiveStreamMeta(response.stream);
        setJoinToken(response.token);
        setJoinUrl(response.url);
        setRole(response.role);
        setCommentPaused(Boolean(response.commentPaused));
        setCommentPausedUntil(response.commentPausedUntil ?? null);
        setIsBlockedByHost(false);
        setMediaError("");
        setRoomConnected(false);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        if (msg === "BLOCKED_BY_HOST") { setIsBlockedByHost(true); return; }
        setError(msg || "Unable to join livestream.");
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!isViewerPage || !streamId) return;
    if (activeStreamId === streamId && joinToken) return;
    void openStream(streamId, forceHost);
  }, [activeStreamId, forceHost, isViewerPage, joinToken, openStream, streamId]);

  const resetViewerTransport = useCallback(
    (reason: string, err?: unknown) => {
      if (!isViewerPage || !streamId) return;

      const now = Date.now();
      if (now - lastTransportResetAtRef.current < 2500) {
        return;
      }
      lastTransportResetAtRef.current = now;

      console.warn("[LivestreamHub] resetting viewer transport", {
        streamId,
        reason,
        error: toErrorLog(err),
      });

      setRoomConnected(false);
      setJoinToken("");
      setJoinUrl("");
      setActiveStreamId(null);
      setViewerRoomNonce((prev) => prev + 1);
      void openStream(streamId, forceHost);
    },
    [forceHost, isViewerPage, openStream, streamId],
  );

  const roomPerf = useMemo(() => {
    const mode = activeStreamMeta?.latencyMode ?? "adaptive";
    return getRoomPerfConfig(mode);
  }, [activeStreamMeta?.latencyMode]);

  const useIvsPlayback =
    Boolean(activeStreamMeta?.ivsPlaybackUrl?.trim()) &&
    (activeStreamMeta?.provider === 'ivs') &&
    !isHostSession;

  const roomOptions = useMemo(
    () => ({
      adaptiveStream: roomPerf.adaptiveStream,
      dynacast: roomPerf.dynacast,
    }),
    [roomPerf.adaptiveStream, roomPerf.dynacast],
  );

  const closeEndOverlay = useCallback(() => {
    setEndOverlayClosing(true);
    window.setTimeout(() => {
      setEndOverlayOpen(false);
      setEndOverlayClosing(false);
    }, 180);
  }, []);

  const confirmEndLive = useCallback(async () => {
    if (!activeStreamMeta?.id) return;

    try {
      setEndingLive(true);
      setError("");
      await endLivestream(activeStreamMeta.id);
      router.push("/create");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to end livestream.");
    } finally {
      setEndingLive(false);
    }
  }, [activeStreamMeta?.id, router]);

  return (
    <section className={hubStyles.wrap}>
      {error ? <p className={hubStyles.error}>{error}</p> : null}

      {isBlockedByHost ? (
        <div className={hubStyles.blockedOverlay}>
          <div className={hubStyles.blockedCard}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.6"/>
              <path d="M4.93 4.93l14.14 14.14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
            <p className={hubStyles.blockedTitle}>You can&apos;t view this livestream</p>
            <p className={hubStyles.blockedSub}>The host has blocked you from viewing their content.</p>
          </div>
        </div>
      ) : null}

      {isViewerPage && !isBlockedByHost ? (
        <div className={hubStyles.viewerWrap}>
          {!joinToken || !joinUrl || !activeStreamMeta ? (
            <div className={hubStyles.viewerLoading}>Loading livestream...</div>
          ) : (
            <>


              <LiveKitRoom
                key={`viewer-room-${activeStreamMeta.id}-${viewerRoomNonce}`}
                token={joinToken}
                serverUrl={joinUrl}
                connect={true}
                audio={false}
                video={false}
                options={roomOptions}
                className={hubStyles.viewerRoom}
                onConnected={() => {
                  setRoomConnected(true);
                  setMediaError("");
                }}
                onDisconnected={() => {
                  setRoomConnected(false);
                  // Show ended modal to viewers if they were connected
                  if (!isHostSession) {
                    setLivestreamEnded(true);
                    setShowEndedModal(true);
                  }
                }}
                onMediaDeviceFailure={() => {
                  setMediaError("Browser blocked screen share or microphone. Please allow device permissions.");
                }}
              >
                {mediaError ? <p className={hubStyles.mediaError}>{mediaError}</p> : null}
                <HostMediaControls
                  visible={isHostSession}
                  connected={roomConnected}
                  latencyMode={activeStreamMeta.latencyMode}
                  onHostVideoConfigChange={(config) => {
                    setHostVideoMode(config.mode);
                    setHostCameraLayout({
                      cameraPosition: config.cameraPosition,
                      cameraSize: config.cameraSize,
                    });
                  }}
                  onEndLive={() => {
                    if (endingLive) return;
                    setEndOverlayOpen(true);
                    setEndOverlayClosing(false);
                  }}
                  ending={endingLive}
                />
                <div className={hubStyles.viewerLayout}>
                  {useIvsPlayback ? (
                    <IvsPlaybackStage
                      playbackUrl={activeStreamMeta.ivsPlaybackUrl || ''}
                    />
                  ) : (
                    <StreamStage
                      hostName={activeStreamMeta.hostName}
                      allowFullscreen={!isHostSession}
                      cameraLayout={hostCameraLayout}
                      hostVideoMode={hostVideoMode}
                    />
                  )}
                  <LiveComments
                    canComment={roomConnected}
                    isHost={isHostSession}
                    hostUserId={activeStreamMeta.hostUserId}
                    pinnedComment={activeStreamMeta.pinnedComment}
                    commentPaused={commentPaused}
                    commentPausedUntil={commentPausedUntil}
                    onTransportReset={resetViewerTransport}
                    onMetaPatch={(patch) => {
                      setActiveStreamMeta((prev) => {
                        if (!prev) return prev;
                        return {
                          ...prev,
                          title: patch.title ?? prev.title,
                          description: patch.description ?? prev.description,
                          pinnedComment: patch.pinnedComment ?? prev.pinnedComment,
                          location: patch.location ?? prev.location,
                          latencyMode: patch.latencyMode ?? prev.latencyMode,
                        };
                      });
                    }}
                  />
                </div>
                <HostStreamAdminPanel
                  visible={isHostSession}
                  streamId={activeStreamMeta.id}
                  meta={activeStreamMeta}
                  hostVideoMode={hostVideoMode}
                  hostCameraLayout={hostCameraLayout}
                  onHostVideoConfigChange={(config) => {
                    setHostVideoMode(config.mode);
                    setHostCameraLayout({
                      cameraPosition: config.cameraPosition,
                      cameraSize: config.cameraSize,
                    });
                  }}
                  onMetaPatch={(patch) => {
                    setActiveStreamMeta((prev) => {
                      if (!prev) return prev;
                      return {
                        ...prev,
                        title: patch.title ?? prev.title,
                        description: patch.description ?? prev.description,
                        pinnedComment: patch.pinnedComment ?? prev.pinnedComment,
                        location: patch.location ?? prev.location,
                        latencyMode: patch.latencyMode ?? prev.latencyMode,
                      };
                    });
                  }}
                />
                <RoomAudioRenderer />
              </LiveKitRoom>
                            {!isHostSession
                ? (() => {
                const hostUsername = viewerHostProfile?.username || activeStreamMeta.hostName;
                const hostAvatarUrl = viewerHostProfile?.avatarUrl;
                return (
              <div className={hubStyles.viewerInfo}>
                <div className={hubStyles.viewerHostRow}>
                  <Link
                    href={`/profile/${activeStreamMeta.hostUserId}`}
                    className={hubStyles.viewerHostAvatar}
                    aria-label={`View ${toHandle(hostUsername)}'s profile`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {hostAvatarUrl ? (
                      <img src={hostAvatarUrl} alt={`${toHandle(hostUsername)} avatar`} className={hubStyles.viewerHostAvatarImage} />
                    ) : (
                      getAvatarInitial(hostUsername)
                    )}
                  </Link>
                  <div className={hubStyles.viewerHostMetaWrap}>
                    <Link href={`/profile/${activeStreamMeta.hostUserId}`} className={hubStyles.viewerHostNameLink} target="_blank" rel="noopener noreferrer">
                      <p className={hubStyles.viewerHostName}>{toHandle(hostUsername)}</p>
                    </Link>
                    <p className={hubStyles.viewerMeta}>Went live {formatLiveStartedAgo(activeStreamMeta.startedAt)}</p>
                  </div>
                </div>

                <p className={hubStyles.viewerTitle}>{viewerTitleNodes || activeStreamMeta.title}</p>
                {activeStreamMeta.description?.trim() ? (
                  <p className={hubStyles.viewerDescription}>{activeStreamMeta.description.trim()}</p>
                ) : null}

                {activeStreamMeta.location?.trim() ? (
                  <a
                    className={hubStyles.viewerLocation}
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(activeStreamMeta.location.trim())}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <span className={hubStyles.viewerLocationIcon} aria-hidden>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path
                          d="M12 21s6-4.7 6-10a6 6 0 1 0-12 0c0 5.3 6 10 6 10Z"
                          stroke="currentColor"
                          strokeWidth="1.7"
                          strokeLinejoin="round"
                        />
                        <circle cx="12" cy="11" r="2.4" stroke="currentColor" strokeWidth="1.6" />
                      </svg>
                    </span>
                    <span className={hubStyles.viewerLocationLink}>{activeStreamMeta.location.trim()}</span>
                  </a>
                ) : null}
              </div>
                );
              })()
                : null}
            </>
          )}
        </div>
      ) : (
        <div className={hubStyles.list}>
          {streams.map((stream) => {
            const hostSnapshot = hostProfiles[stream.hostUserId];
            const hostUsername = hostSnapshot?.username || stream.hostName;
            const hostAvatarUrl = hostSnapshot?.avatarUrl;

            return (
            <article key={stream.id} className={hubStyles.feedCard}>
              <div className={hubStyles.feedHeaderRow}>
                <div className={hubStyles.feedIdentity}>
                  <div className={hubStyles.feedAvatar} aria-hidden>
                    {hostAvatarUrl ? (
                      <img src={hostAvatarUrl} alt={`${toHandle(hostUsername)} avatar`} className={hubStyles.feedAvatarImage} />
                    ) : (
                      getAvatarInitial(hostUsername)
                    )}
                  </div>
                  <div>
                    <p className={hubStyles.feedHandle}>{toHandle(hostUsername)}</p>
                    <p className={hubStyles.feedTime}>Went live {formatLiveStartedAgo(stream.startedAt)}</p>
                  </div>
                </div>
              </div>

              <button
                type="button"
                className={hubStyles.feedMedia}
                onClick={() => {
                  if (viewerId && stream.hostUserId === viewerId) {
                    router.push(`/livestream/${encodeURIComponent(stream.id)}?host=1`);
                    return;
                  }
                  router.push(`/livestream/${encodeURIComponent(stream.id)}`);
                }}
                disabled={busy}
              >
                <div className={hubStyles.feedPreviewLayer}>
                  <FeedCardPreview streamId={stream.id} />
                </div>
                <span className={hubStyles.liveBadge}>LIVE</span>
                <div className={hubStyles.feedMediaShade} />
                <div className={hubStyles.feedMediaText}>
                  <p className={hubStyles.feedTitle}>{stream.title}</p>
                  <p className={hubStyles.feedStats}>
                    <span className={hubStyles.feedStatsIcon} aria-hidden>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path
                          d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinejoin="round"
                        />
                        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
                      </svg>
                    </span>
                    <span className={hubStyles.feedStatsValue}>{Math.max(stream.viewerCount - 1, 0)}</span>
                  </p>
                </div>
              </button>
            </article>
            );
          })}
        </div>
      )}

      {endOverlayOpen ? (
        <div
          className={`${hubStyles.endOverlay} ${
            endOverlayClosing ? hubStyles.endOverlayClosing : hubStyles.endOverlayOpen
          }`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="end-live-title"
          onClick={closeEndOverlay}
        >
          <div
            className={`${hubStyles.endOverlayCard} ${
              endOverlayClosing ? hubStyles.endOverlayCardClosing : hubStyles.endOverlayCardOpen
            }`}
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="end-live-title" className={hubStyles.endOverlayTitle}>
              End this livestream?
            </h3>
            <p className={hubStyles.endOverlayText}>
              Your livestream will stop for all viewers immediately.
            </p>
            <div className={hubStyles.endOverlayActions}>
              <button
                type="button"
                className={hubStyles.endOverlayCancel}
                onClick={closeEndOverlay}
                disabled={endingLive}
              >
                Cancel
              </button>
              <button
                type="button"
                className={hubStyles.endOverlayConfirm}
                onClick={() => {
                  void confirmEndLive();
                }}
                disabled={endingLive}
              >
                {endingLive ? "Ending..." : "End live"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showEndedModal && livestreamEnded ? (
        <div
          className={hubStyles.endOverlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby="livestream-ended-title"
        >
          <div className={hubStyles.endOverlayCard} onClick={(event) => event.stopPropagation()}>
            <h3 id="livestream-ended-title" className={hubStyles.endOverlayTitle}>
              Livestream Ended
            </h3>
            <p className={hubStyles.endOverlayText}>
              This livestream has ended. Thank you for watching!
            </p>
            <div className={hubStyles.endOverlayActions}>
              <button
                type="button"
                className={hubStyles.endOverlayConfirm}
                onClick={() => {
                  router.push("/");
                }}
                style={{ width: "100%" }}
              >
                Back to Home
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
