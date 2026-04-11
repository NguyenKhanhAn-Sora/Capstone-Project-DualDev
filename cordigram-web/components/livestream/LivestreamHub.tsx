"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  VideoTrack,
  useLocalParticipant,
  useRoomContext,
  useTracks,
} from "@livekit/components-react";
import { RoomEvent, Track } from "livekit-client";
import {
  endLivestream,
  joinLivestreamToken,
  listLiveLivestreams,
  type LivestreamLatencyMode,
  type LivestreamItem,
} from "@/lib/livestream-api";
import hubStyles from "./livestream-hub.module.css";

type LiveComment = {
  id: string;
  author: string;
  text: string;
};

type LivestreamMetaPatch = {
  title?: string;
  description?: string;
  pinnedComment?: string;
  latencyMode?: LivestreamLatencyMode;
};

type ShareVideoConstraints = {
  width: { ideal: number; max: number };
  height: { ideal: number; max: number };
  frameRate: { ideal: number; max: number };
};

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
  return { adaptiveStream: true, dynacast: true };
}

function StreamStage({ hostName }: { hostName: string }) {
  const screenTracks = useTracks(
    [{ source: Track.Source.ScreenShare, withPlaceholder: false }],
    { onlySubscribed: false },
  );
  const hostTrack = screenTracks.find((track) =>
    (track.participant.identity || "").includes("-host-"),
  );

  return (
    <div className={hubStyles.stageGrid}>
      {hostTrack?.publication ? (
        <div className={hubStyles.tile}>
          <VideoTrack trackRef={hostTrack} className={hubStyles.video} />
          <div className={hubStyles.caption}>{hostName || "Host"}</div>
        </div>
      ) : (
        <div className={hubStyles.emptyStage}>Host has not started screen sharing yet...</div>
      )}
    </div>
  );
}

function LiveComments({
  canComment,
  pinnedComment,
  onMetaPatch,
}: {
  canComment: boolean;
  pinnedComment?: string;
  onMetaPatch?: (patch: LivestreamMetaPatch) => void;
}) {
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();
  const [comments, setComments] = useState<LiveComment[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const onDataReceived = (payload: Uint8Array, participant?: { name?: string }) => {
      try {
        const text = new TextDecoder().decode(payload);
        const parsed = JSON.parse(text) as {
          type?: "comment" | "meta_update";
          text?: string;
          author?: string;
          patch?: LivestreamMetaPatch;
        };

        if (parsed.type === "meta_update" && parsed.patch) {
          onMetaPatch?.(parsed.patch);
          return;
        }

        if (parsed.type !== "comment" || !parsed.text?.trim()) return;

        const author = parsed.author?.trim() || participant?.name || "Viewer";
        const message: LiveComment = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          author,
          text: parsed.text.trim(),
        };
        setComments((prev) => [...prev.slice(-59), message]);
      } catch {
        // Ignore non-comment data packets.
      }
    };

    room.on(RoomEvent.DataReceived, onDataReceived);
    return () => {
      room.off(RoomEvent.DataReceived, onDataReceived);
    };
  }, [room]);

  const onSend = async () => {
    const content = draft.trim();
    if (!content || !canComment) return;
    try {
      setSending(true);
      const payload = new TextEncoder().encode(
        JSON.stringify({
          type: "comment",
          text: content,
          author: localParticipant.name || "Viewer",
        }),
      );
      await localParticipant.publishData(payload, { reliable: true });
      setDraft("");
    } finally {
      setSending(false);
    }
  };

  return (
    <aside className={hubStyles.commentPanel}>
      <h3 className={hubStyles.commentTitle}>Live comments</h3>
      {pinnedComment?.trim() ? (
        <div className={hubStyles.pinnedComment}>
          <span className={hubStyles.pinnedBadge}>Pinned</span>
          <p className={hubStyles.pinnedText}>{pinnedComment.trim()}</p>
        </div>
      ) : null}
      <div className={hubStyles.commentList}>
        {!comments.length ? (
          <p className={hubStyles.commentEmpty}>No comments yet.</p>
        ) : (
          comments.map((item) => (
            <p key={item.id} className={hubStyles.commentItem}>
              <strong>{item.author}: </strong>
              {item.text}
            </p>
          ))
        )}
      </div>

      <div className={hubStyles.commentComposer}>
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={canComment ? "Write a comment..." : "You cannot comment"}
          className={hubStyles.commentInput}
          disabled={!canComment || sending}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void onSend();
            }
          }}
        />
        <button
          type="button"
          className={hubStyles.commentSend}
          onClick={() => void onSend()}
          disabled={!canComment || sending || !draft.trim()}
        >
          Send
        </button>
      </div>
    </aside>
  );
}

function HostMediaControls({
  visible,
  connected,
  latencyMode,
}: {
  visible: boolean;
  connected: boolean;
  latencyMode: LivestreamLatencyMode;
}) {
  const { localParticipant } = useLocalParticipant();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [autoTried, setAutoTried] = useState(false);

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

  const enableScreenShare = async () => {
    try {
      if (!connected) {
        setError("Connecting to livestream room. Please retry in 1-2 seconds.");
        return;
      }
      setBusy(true);
      setError("");
      await localParticipant.setScreenShareEnabled(true, {
        video: getScreenShareConstraints(latencyMode),
        audio: true,
      } as any);
    } catch (err) {
      setError(mapMediaError(err));
    } finally {
      setBusy(false);
    }
  };

  const disableScreenShare = async () => {
    try {
      setBusy(true);
      setError("");
      await localParticipant.setScreenShareEnabled(false);
    } catch (err) {
      setError(mapMediaError(err));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!visible || !connected || autoTried) return;
    setAutoTried(true);
    void enableScreenShare();
  }, [autoTried, connected, visible]);

  const enableMic = async () => {
    try {
      setBusy(true);
      setError("");
      await localParticipant.setMicrophoneEnabled(true);
    } catch {
      setError("Unable to enable microphone. Please allow microphone permission.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={hubStyles.hostControls}>
      <button
        type="button"
        className={hubStyles.hostControlBtn}
        onClick={() => void enableScreenShare()}
        disabled={busy}
      >
        Start screen share ({getLatencyLabel(latencyMode)})
      </button>
      <button
        type="button"
        className={hubStyles.hostControlGhost}
        onClick={() => void disableScreenShare()}
        disabled={busy}
      >
        Stop sharing
      </button>
      <button
        type="button"
        className={hubStyles.hostControlGhost}
        onClick={() => void enableMic()}
        disabled={busy}
      >
        Enable mic
      </button>
      {error ? <p className={hubStyles.hostControlError}>{error}</p> : null}
    </div>
  );
}

export default function LivestreamHub({ viewerId }: { viewerId?: string }) {
  const searchParams = useSearchParams();
  const router = useRouter();
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
  const [roomConnected, setRoomConnected] = useState(false);

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
    void loadStreams();
    const timer = setInterval(() => {
      void loadStreams();
    }, 8000);
    return () => clearInterval(timer);
  }, [loadStreams]);

  const openStream = useCallback(
    async (streamId: string, asHost: boolean) => {
      try {
        setBusy(true);
        setError("");
        const response = await joinLivestreamToken(streamId, {
          asHost,
          participantName: asHost ? "Host" : "Viewer",
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
    const streamId = searchParams.get("liveStreamId");
    const asHost = searchParams.get("host") === "1";
    if (!streamId) return;
    if (activeStreamId === streamId && joinToken) return;
    void openStream(streamId, asHost);
  }, [activeStreamId, joinToken, openStream, searchParams]);

  const closePlayer = () => {
    setJoinToken("");
    setJoinUrl("");
    setActiveStreamId(null);
    setActiveStreamMeta(null);
    setRoomConnected(false);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("liveStreamId");
    params.delete("host");
    const next = params.toString();
    router.replace(next ? `/?${next}` : "/");
  };

  const onEnd = async () => {
    if (!activeStreamId) return;
    try {
      setBusy(true);
      await endLivestream(activeStreamId);
      closePlayer();
      await loadStreams();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to end livestream.");
    } finally {
      setBusy(false);
    }
  };

  const canEnd = useMemo(() => {
    if (!activeStreamMeta || !viewerId) return role === "host";
    return role === "host" || activeStreamMeta.hostUserId === viewerId;
  }, [activeStreamMeta, role, viewerId]);

  const roomPerf = useMemo(() => {
    const mode = activeStreamMeta?.latencyMode ?? "adaptive";
    return getRoomPerfConfig(mode);
  }, [activeStreamMeta?.latencyMode]);

  const roomOptions = useMemo(
    () => ({
      adaptiveStream: roomPerf.adaptiveStream,
      dynacast: roomPerf.dynacast,
    }),
    [roomPerf.adaptiveStream, roomPerf.dynacast],
  );

  return (
    <section className={hubStyles.wrap}>
      <div className={hubStyles.header}>
        <div>
          <p className={hubStyles.label}>Live now</p>
          <h2 className={hubStyles.title}>Homepage livestream</h2>
        </div>
        <button onClick={() => void loadStreams()} className={hubStyles.refresh}>
          Refresh
        </button>
      </div>

      {error ? <p className={hubStyles.error}>{error}</p> : null}

      <div className={hubStyles.list}>
        {loading && !streams.length ? <div className={hubStyles.muted}>Loading livestreams...</div> : null}
        {!loading && !streams.length ? <div className={hubStyles.muted}>No livestream is currently active.</div> : null}
        {streams.map((stream) => (
          <article key={stream.id} className={hubStyles.card}>
            <div>
              <p className={hubStyles.cardTitle}>{stream.title}</p>
              <p className={hubStyles.cardSub}>
                Host: {stream.hostName} | Viewers: {Math.max(stream.viewerCount - 1, 0)}/{stream.maxViewers}
              </p>
            </div>
            <button
              onClick={() => {
                if (viewerId && stream.hostUserId === viewerId) {
                  router.push(`/livestream/${encodeURIComponent(stream.id)}`);
                  return;
                }
                void openStream(stream.id, false);
              }}
              className={hubStyles.watch}
              disabled={busy}
            >
              {viewerId && stream.hostUserId === viewerId
                ? "Join as host"
                : "Watch"}
            </button>
          </article>
        ))}
      </div>

      {joinToken && joinUrl && activeStreamMeta ? (
        <div className={hubStyles.playerWrap}>
          <div className={hubStyles.playerHeader}>
            <div>
              <p className={hubStyles.playerTitle}>{activeStreamMeta.title}</p>
              <p className={hubStyles.playerMeta}>
                Host: {activeStreamMeta.hostName} | Mode: {getLatencyLabel(activeStreamMeta.latencyMode ?? "adaptive")}
              </p>
            </div>
            <div className={hubStyles.playerActions}>
              {canEnd ? (
                <button onClick={() => void onEnd()} className={hubStyles.endBtn} disabled={busy}>
                  End live
                </button>
              ) : null}
              <button onClick={closePlayer} className={hubStyles.closeBtn}>Close</button>
            </div>
          </div>

          <LiveKitRoom
            token={joinToken}
            serverUrl={joinUrl}
            connect={true}
            audio={false}
            video={false}
            options={roomOptions}
            className={hubStyles.room}
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
            <HostMediaControls
              visible={role === "host"}
              connected={roomConnected}
              latencyMode={activeStreamMeta.latencyMode ?? "adaptive"}
            />
            {mediaError ? <p className={hubStyles.mediaError}>{mediaError}</p> : null}
            <div className={hubStyles.liveLayout}>
              <StreamStage hostName={activeStreamMeta.hostName} />
              <LiveComments
                canComment={true}
                pinnedComment={activeStreamMeta.pinnedComment}
                onMetaPatch={(patch) => {
                  setActiveStreamMeta((prev) => {
                    if (!prev) return prev;
                    return {
                      ...prev,
                      title: patch.title ?? prev.title,
                      description: patch.description ?? prev.description,
                      pinnedComment: patch.pinnedComment ?? prev.pinnedComment,
                      latencyMode: patch.latencyMode ?? prev.latencyMode,
                    };
                  });
                }}
              />
            </div>
            <RoomAudioRenderer />
          </LiveKitRoom>
        </div>
      ) : null}
    </section>
  );
}
