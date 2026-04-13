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
  useRoomContext,
  useTracks,
} from "@livekit/components-react";
import { ConnectionState, RoomEvent, Track, VideoQuality } from "livekit-client";
import {
  endLivestream,
  getIvsIngest,
  joinLivestreamToken,
  listLiveLivestreams,
  type LivestreamLatencyMode,
  type LivestreamItem,
  updateLivestream,
} from "@/lib/livestream-api";
import { fetchCurrentProfile, fetchProfileDetail, searchProfiles, type ProfileSearchItem } from "@/lib/api";
import { getStoredAccessToken } from "@/lib/auth";
import {
  clearPendingScreenShareStream,
  getPendingScreenShareStream,
} from "@/lib/livestream-screen-share-cache";
import hubStyles from "./livestream-hub.module.css";

type LiveComment = {
  id: string;
  authorHandle: string;
  isHost: boolean;
  text: string;
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
  isHost: boolean;
  text: string;
};

type ShareVideoConstraints = {
  width: { ideal: number; max: number };
  height: { ideal: number; max: number };
  frameRate: { ideal: number; max: number };
};

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

function getScreenShareConstraints(mode: LivestreamLatencyMode): ShareVideoConstraints {
  if (mode === "low") {
    return {
      width: { ideal: 960, max: 1280 },
      height: { ideal: 540, max: 720 },
      frameRate: { ideal: 20, max: 24 },
    };
  }

  if (mode === "balanced") {
    return {
      width: { ideal: 1280, max: 1280 },
      height: { ideal: 720, max: 720 },
      frameRate: { ideal: 24, max: 30 },
    };
  }

  return {
    width: { ideal: 1920, max: 1920 },
    height: { ideal: 1080, max: 1080 },
    frameRate: { ideal: 30, max: 30 },
  };
}

function getRoomPerfConfig(mode: LivestreamLatencyMode): {
  adaptiveStream: boolean;
  dynacast: boolean;
} {
  if (mode === "low") {
    return { adaptiveStream: true, dynacast: true };
  }
  if (mode === "balanced") {
    return { adaptiveStream: true, dynacast: true };
  }

  // Adaptive mode in this app is quality-priority for screen share readability.
  // Disable downscaling heuristics to keep full-resolution detail whenever possible.
  return { adaptiveStream: false, dynacast: false };
}

function getScreenSharePublishOptions(mode: LivestreamLatencyMode) {
  if (mode === "low") {
    return {
      source: Track.Source.ScreenShare,
      videoEncoding: {
        maxBitrate: 2_500_000,
        maxFramerate: 24,
      },
    };
  }

  if (mode === "balanced") {
    return {
      source: Track.Source.ScreenShare,
      videoEncoding: {
        maxBitrate: 4_000_000,
        maxFramerate: 30,
      },
    };
  }

  return {
    source: Track.Source.ScreenShare,
    videoEncoding: {
      maxBitrate: 12_000_000,
      maxFramerate: 30,
    },
    simulcast: false,
  };
}

function getDisplayMediaCaptureOptions(mode: LivestreamLatencyMode): DisplayMediaStreamOptions {
  const base = getScreenShareConstraints(mode);
  const maxFrameRate = mode === "adaptive" ? 60 : base.frameRate.max;

  return {
    video: {
      width: base.width,
      height: base.height,
      frameRate: {
        ideal: base.frameRate.ideal,
        max: maxFrameRate,
      },
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

function StreamStage({
  hostName,
  viewerCount,
  allowFullscreen,
}: {
  hostName: string;
  viewerCount: number;
  allowFullscreen: boolean;
}) {
  const tileRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const screenTracks = useTracks(
    [{ source: Track.Source.ScreenShare, withPlaceholder: false }],
    { onlySubscribed: false },
  );
  const hostTrack = screenTracks.find((track) =>
    (track.participant.identity || "").includes("-host-"),
  );
  const isLocalSelfSharePreview = Boolean(hostTrack?.participant?.isLocal);
  const canUseFullscreen = allowFullscreen && !isLocalSelfSharePreview;

  useEffect(() => {
    const publication: any = hostTrack?.publication;
    if (!publication || typeof publication.setVideoQuality !== "function") {
      return;
    }

    try {
      publication.setVideoQuality(VideoQuality.HIGH);
      publication.setSubscribed(true);
    } catch {
      // Ignore quality pinning errors on unsupported publication types.
    }
  }, [hostTrack?.publication]);

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
      {hostTrack?.publication ? (
        <div className={hubStyles.tile} ref={tileRef}>
          <VideoTrack trackRef={hostTrack} className={hubStyles.video} />
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
            <span className={hubStyles.feedStatsValue}>{Math.max(viewerCount - 1, 0)}</span>
          </p>
        </div>
      ) : (
        <div className={hubStyles.emptyStage}>Host has not started screen sharing yet...</div>
      )}
    </div>
  );
}

function IvsPlaybackStage({
  playbackUrl,
  viewerCount,
}: {
  playbackUrl: string;
  viewerCount: number;
}) {
  const tileRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

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
          <span className={hubStyles.feedStatsValue}>{Math.max(viewerCount - 1, 0)}</span>
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
  const hostTrack = screenTracks.find((track) =>
    (track.participant.identity || "").includes("-host-"),
  );

  if (!hostTrack?.publication) {
    return <div className={hubStyles.feedPreviewEmpty}>Waiting for live screen...</div>;
  }

  return <VideoTrack trackRef={hostTrack} className={hubStyles.feedPreviewVideo} />;
}

function FeedCardPreview({ streamId }: { streamId: string }) {
  const [joinToken, setJoinToken] = useState("");
  const [joinUrl, setJoinUrl] = useState("");

  useEffect(() => {
    let disposed = false;

    const connectPreview = async () => {
      try {
        const response = await joinLivestreamToken(streamId, {
          asHost: false,
          participantName: `preview-${Math.random().toString(36).slice(2, 8)}`,
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
      className={hubStyles.feedPreviewRoom}
    >
      <FeedCardStage />
    </LiveKitRoom>
  );
}

function LiveComments({
  canComment,
  pinnedComment,
  onMetaPatch,
  onTransportReset,
}: {
  canComment: boolean;
  pinnedComment?: string;
  onMetaPatch?: (patch: LivestreamMetaPatch) => void;
  onTransportReset?: (reason: string, err?: unknown) => void;
}) {
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();
  const [comments, setComments] = useState<LiveComment[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [showCommentEmojiPicker, setShowCommentEmojiPicker] = useState(false);
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

  useEffect(() => {
    onMetaPatchRef.current = onMetaPatch;
  }, [onMetaPatch]);

  const publishCommentPacket = useCallback(
    async ({
      commentId,
      text,
      author,
      isHost,
    }: {
      commentId: string;
      text: string;
      author: string;
      isHost: boolean;
    }) => {
      const payload = new TextEncoder().encode(
        JSON.stringify({
          type: "comment",
          commentId,
          text,
          author,
          isHost,
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
            console.debug(`${debugPrefix} pending publish resolved`, { commentId: item.commentId });
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
    console.debug(`${debugPrefix} mounted`, {
      localIdentity: localParticipant.identity,
      localName: localParticipant.name,
    });
    return () => {
      console.debug(`${debugPrefix} unmounted`, {
        localIdentity: localParticipant.identity,
      });
    };
  }, [localParticipant.identity, localParticipant.name]);

  const sendCommentHistoryToParticipant = useCallback(
    async (participant?: any) => {
      if (!participant) return;

      const snapshot: HistoryWireComment[] = comments
        .map((item) => ({
          id: item.id,
          authorHandle: item.authorHandle,
          isHost: item.isHost,
          text: item.text,
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
          type?: "comment" | "meta_update" | "comment_history" | "comment_history_request";
          text?: string;
          author?: string;
          patch?: LivestreamMetaPatch;
          commentId?: string;
          isHost?: boolean;
          comments?: HistoryWireComment[];
        };

        console.debug(`${debugPrefix} data received`, {
          type: parsed.type,
          fromIdentity: participant?.identity,
          fromName: participant?.name,
          commentId: parsed.commentId,
        });

        if (parsed.type === "comment_history" && Array.isArray(parsed.comments)) {
          parsed.comments.forEach((item) => {
            if (!item?.text?.trim()) return;
            appendComment({
              id: item.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              authorHandle: toHandle(item.authorHandle),
              isHost: Boolean(item.isHost),
              text: item.text.trim(),
            });
          });
          return;
        }

        if (parsed.type === "comment_history_request") {
          void sendCommentHistoryToParticipant(participant as any);
          return;
        }

        if (parsed.type === "meta_update" && parsed.patch) {
          onMetaPatchRef.current?.(parsed.patch);
          return;
        }

        if (parsed.type !== "comment" || !parsed.text?.trim()) return;

        const author = parsed.author?.trim() || participant?.name || "Viewer";
        appendComment({
          id: parsed.commentId || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          authorHandle: toHandle(author),
          isHost:
            typeof parsed.isHost === "boolean"
              ? parsed.isHost
              : Boolean(participant?.identity?.includes("-host-")),
          text: parsed.text.trim(),
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
      console.debug(`${debugPrefix} participant connected`, {
        identity: participant?.identity,
        name: participant?.name,
        remoteParticipants: room.remoteParticipants.size,
      });
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

  const onSend = async (contentOverride?: string) => {
    const content = (contentOverride ?? draft).trim();
    if (!content || !canComment) return;

    const commentId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const author = toHandle(localParticipant.name || "Viewer");
    const isHost = Boolean(localParticipant.identity?.includes("-host-"));

    // Optimistic: clear input and show comment immediately before network call.
    setDraft("");
    setShowCommentEmojiPicker(false);
    appendComment({
      id: commentId,
      authorHandle: author,
      isHost,
      text: content,
    });

    try {
      setSending(true);

      if (room.state !== ConnectionState.Connected) {
        throw new Error("Livestream room is reconnecting. Please try again.");
      }

      console.debug(`${debugPrefix} sending comment`, {
        commentId,
        textLength: content.length,
        localIdentity: localParticipant.identity,
        localName: localParticipant.name,
        remoteParticipants: room.remoteParticipants.size,
      });
      await publishCommentPacket({
        commentId,
        text: content,
        author,
        isHost,
      });
      console.debug(`${debugPrefix} publishData resolved`, { commentId });
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
        {comments.map((item) => (
          <p key={item.id} className={hubStyles.commentItem}>
            <span className={hubStyles.commentAuthorWrap}>
              <strong className={hubStyles.commentAuthor}>{item.authorHandle}</strong>
              {item.isHost ? (
                <span className={hubStyles.commentHostBadge} title="Host" aria-label="Host">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path
                      d="M4 7.5 8.5 12l3.5-5 3.5 5L20 7.5 18.5 17h-13L4 7.5Z"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              ) : null}
            </span>
            <span className={hubStyles.commentText}>{item.text}</span>
          </p>
        ))}
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
            placeholder={canComment ? "Write a comment..." : "Comments disabled"}
            className={hubStyles.commentInput}
            disabled={!canComment || sending}
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
          disabled={!canComment || sending || !draft.trim()}
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
    </aside>
  );
}

function HostMediaControls({
  visible,
  connected,
  latencyMode,
  onEndLive,
  ending,
}: {
  visible: boolean;
  connected: boolean;
  latencyMode: LivestreamLatencyMode;
  onEndLive: () => void;
  ending: boolean;
}) {
  const { localParticipant } = useLocalParticipant();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [autoTried, setAutoTried] = useState(false);
  const pendingScreenShareAttemptedRef = useRef(false);

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
    const pending = getPendingScreenShareStream();
    const pendingVideoTrack = pending?.getVideoTracks()?.[0];
    const pendingAudioTrack = pending?.getAudioTracks()?.[0];

    if (!pending || !pendingVideoTrack || pendingVideoTrack.readyState === "ended") {
      clearPendingScreenShareStream();
      return false;
    }

    try {
      await optimizePublishedScreenTrack(pendingVideoTrack, latencyMode);
      await (localParticipant as any).publishTrack(
        pendingVideoTrack,
        getScreenSharePublishOptions(latencyMode),
      );
      if (pendingAudioTrack && pendingAudioTrack.readyState !== "ended") {
        await (localParticipant as any).publishTrack(pendingAudioTrack, {
          source: Track.Source.ScreenShareAudio,
        });
      }
      clearPendingScreenShareStream();
      return true;
    } catch {
      return false;
    }
  };

  const unpublishScreenTracks = async () => {
    const publications = Array.from(
      ((localParticipant as any)?.trackPublications?.values?.() || []) as Iterable<any>,
    );

    for (const pub of publications) {
      const source = pub?.source;
      if (source !== Track.Source.ScreenShare && source !== Track.Source.ScreenShareAudio) {
        continue;
      }

      const mediaTrack = pub?.track?.mediaStreamTrack;
      if (!mediaTrack) continue;

      try {
        await (localParticipant as any).unpublishTrack(mediaTrack, false);
      } catch {
        // Ignore unpublish race errors.
      }
    }
  };

  const captureAndPublishFromPicker = async () => {
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
    await unpublishScreenTracks();
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
      void unpublishScreenTracks();
    };
  };

  const enableScreenShare = async (forcePicker: boolean) => {
    try {
      if (!connected) {
        setError("Connecting to livestream room. Please retry in 1-2 seconds.");
        return;
      }
      setBusy(true);
      setError("");

      if (forcePicker) {
        // User explicitly requested changing source: close current share and force browser picker.
        clearPendingScreenShareStream();
        pendingScreenShareAttemptedRef.current = true;
        await captureAndPublishFromPicker();
        return;
      }

      if (!forcePicker && !pendingScreenShareAttemptedRef.current) {
        pendingScreenShareAttemptedRef.current = true;
        const appliedPending = await tryApplyPendingScreenShare();
        if (appliedPending) {
          return;
        }

        // Do not auto-open browser picker on first room entry if no pending stream exists.
        setError("No pre-selected screen source found. Click Change screen share to choose one.");
        return;
      }

      // Auto path only attempts pending stream handoff and never opens browser picker.
      return;
    } catch (err) {
      setError(mapMediaError(err));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!visible || !connected || autoTried) return;
    setAutoTried(true);
    void enableScreenShare(false);
  }, [autoTried, connected, visible]);

  return (
    <div className={hubStyles.hostControls}>
      <button
        type="button"
        className={hubStyles.hostControlBtn}
        onClick={() => void enableScreenShare(true)}
        disabled={busy}
      >
        Change screen share
      </button>
      <button
        type="button"
        className={hubStyles.hostControlEnd}
        onClick={onEndLive}
        disabled={ending}
      >
        {ending ? "Ending..." : "End live"}
      </button>
    </div>
  );
}

function HostStreamAdminPanel({
  visible,
  streamId,
  meta,
  onMetaPatch,
}: {
  visible: boolean;
  streamId: string;
  meta: LivestreamItem;
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

  return (
    <aside className={hubStyles.hostAdminPanel}>
      <div className={hubStyles.hostAdminHeader}>
        <h3 className={hubStyles.hostAdminTitle}>Host controls</h3>
      </div>

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
        />
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
  const [viewerRoomNonce, setViewerRoomNonce] = useState(0);
  const [hostProfiles, setHostProfiles] = useState<
    Record<string, { username: string; avatarUrl?: string }>
  >({});
  const [viewerHostProfile, setViewerHostProfile] = useState<{ username: string; avatarUrl?: string } | null>(null);
  const [viewerTitleMentionMap, setViewerTitleMentionMap] = useState<Record<string, string>>({});
  const lastTransportResetAtRef = useRef(0);
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
        console.debug("[LivestreamHub] join token payload", {
          role: response.role,
          videoGrant: tokenPayload?.video,
          payload: tokenPayload,
        });
        setActiveStreamId(streamId);
        setActiveStreamMeta(response.stream);
        setJoinToken(response.token);
        setJoinUrl(response.url);
        setRole(response.role);
        setMediaError("");
        setRoomConnected(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to join livestream.");
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

      {isViewerPage ? (
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
                      viewerCount={activeStreamMeta.viewerCount}
                    />
                  ) : (
                    <StreamStage
                      hostName={activeStreamMeta.hostName}
                      viewerCount={activeStreamMeta.viewerCount}
                      allowFullscreen={!isHostSession}
                    />
                  )}
                  <LiveComments
                    canComment={roomConnected}
                    pinnedComment={activeStreamMeta.pinnedComment}
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
                  <div className={hubStyles.viewerHostAvatar} aria-hidden>
                    {hostAvatarUrl ? (
                      <img src={hostAvatarUrl} alt={`${toHandle(hostUsername)} avatar`} className={hubStyles.viewerHostAvatarImage} />
                    ) : (
                      getAvatarInitial(hostUsername)
                    )}
                  </div>
                  <div className={hubStyles.viewerHostMetaWrap}>
                    <p className={hubStyles.viewerHostName}>{toHandle(hostUsername)}</p>
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
    </section>
  );
}
