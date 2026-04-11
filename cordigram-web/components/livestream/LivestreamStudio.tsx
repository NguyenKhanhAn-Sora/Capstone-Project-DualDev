"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import EmojiPicker from "emoji-picker-react";
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
  getLivestreamById,
  joinLivestreamToken,
  updateLivestream,
  type LivestreamItem,
  type LivestreamLatencyMode,
} from "@/lib/livestream-api";
import {
  clearPendingScreenShareStream,
  takePendingScreenShareStream,
} from "@/lib/livestream-screen-share-cache";
import styles from "./livestream-studio.module.css";

type LiveComment = {
  id: string;
  author: string;
  text: string;
};

type MetaPatch = {
  title?: string;
  description?: string;
  pinnedComment?: string;
  latencyMode?: LivestreamLatencyMode;
};

const TITLE_WORD_LIMIT = 300;

function getLatencyLabel(mode: LivestreamLatencyMode): string {
  if (mode === "low") return "Low latency";
  if (mode === "balanced") return "Balanced latency";
  return "Adaptive latency";
}

function getScreenShareConstraints(mode: LivestreamLatencyMode) {
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

function StreamStage({ hostName }: { hostName: string }) {
  const tracks = useTracks([{ source: Track.Source.ScreenShare, withPlaceholder: false }], {
    onlySubscribed: false,
  });

  const hostTrack = tracks.find((track) => (track.participant.identity || "").includes("-host-"));

  return (
    <div className={styles.stageWrap}>
      {hostTrack?.publication ? (
        <div className={styles.stageTile}>
          <VideoTrack trackRef={hostTrack} className={styles.stageVideo} />
          <div className={styles.stageCaption}>{hostName || "Host"}</div>
        </div>
      ) : (
        <div className={styles.stageEmpty}>Screen share has not started yet.</div>
      )}
    </div>
  );
}

function StudioComments({
  canComment,
  pinnedComment,
  onMetaPatch,
}: {
  canComment: boolean;
  pinnedComment?: string;
  onMetaPatch: (patch: MetaPatch) => void;
}) {
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();
  const [comments, setComments] = useState<LiveComment[]>([]);
  const [draft, setDraft] = useState("");
  const [showCommentEmojiPicker, setShowCommentEmojiPicker] = useState(false);
  const commentEmojiRef = useRef<HTMLDivElement | null>(null);
  const commentInputRef = useRef<HTMLInputElement | null>(null);
  const seenCommentIdsRef = useRef<Set<string>>(new Set());

  const appendComment = useCallback((comment: LiveComment) => {
    setComments((prev) => {
      const safeId = comment.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      if (seenCommentIdsRef.current.has(safeId)) return prev;
      seenCommentIdsRef.current.add(safeId);
      return [...prev.slice(-89), { ...comment, id: safeId }];
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
          type?: "comment" | "meta_update";
          text?: string;
          author?: string;
          patch?: MetaPatch;
          commentId?: string;
        };

        if (parsed.type === "comment" && parsed.text?.trim()) {
          if (participant?.identity === localParticipant.identity) {
            return;
          }
          const author = parsed.author?.trim() || participant?.name || "Viewer";
          appendComment({
            id: parsed.commentId || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            author,
            text: parsed.text.trim(),
          });
          return;
        }

        if (parsed.type === "meta_update" && parsed.patch) {
          onMetaPatch(parsed.patch);
        }
      } catch {
        // Ignore invalid data packets.
      }
    };

    room.on(RoomEvent.DataReceived, onDataReceived);
    return () => {
      room.off(RoomEvent.DataReceived, onDataReceived);
    };
  }, [appendComment, localParticipant.identity, onMetaPatch, room]);

  const onSend = async () => {
    const content = draft.trim();
    if (!content || !canComment) return;
    const commentId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    appendComment({
      id: commentId,
      author: localParticipant.name || "Host",
      text: content,
    });

    const payload = new TextEncoder().encode(
      JSON.stringify({
        type: "comment",
        commentId,
        text: content,
        author: localParticipant.name || "Host",
      }),
    );
    try {
      await localParticipant.publishData(payload, { reliable: true });
      setDraft("");
      setShowCommentEmojiPicker(false);
    } catch {
      seenCommentIdsRef.current.delete(commentId);
      setComments((prev) => prev.filter((item) => item.id !== commentId));
    }
  };

  const insertCommentEmoji = (emoji: string) => {
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
  };

  return (
    <aside className={styles.comments}>
      <h3 className={styles.commentsTitle}>Live comments</h3>
      {pinnedComment?.trim() ? (
        <div className={styles.pinnedBox}>
          <div className={styles.pinnedRow}>
            <span className={styles.pinnedIcon} aria-hidden>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M8 3.5h8l-1.2 6.3 3.7 3.7v1H13v5.8l-1 1-1-1V14.5H5.5v-1l3.7-3.7L8 3.5Z"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <p className={styles.pinnedText}>{pinnedComment.trim()}</p>
          </div>
        </div>
      ) : null}
      <div className={`${styles.commentList} ${!comments.length ? styles.commentListEmpty : ""}`}>
        {!comments.length ? <p className={styles.commentEmpty}>No comments yet.</p> : null}
        {comments.map((item) => (
          <p key={item.id} className={styles.commentItem}>
            <strong>{item.author}: </strong>
            {item.text}
          </p>
        ))}
      </div>
      <div className={styles.commentComposer}>
        <div className={styles.commentInputWrap}>
          <input
            ref={commentInputRef}
            className={styles.commentInput}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={canComment ? "Write a comment..." : "Comments disabled"}
            disabled={!canComment}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void onSend();
              }
            }}
          />

          <div className={styles.commentEmojiWrap} ref={commentEmojiRef}>
            <button
              type="button"
              className={styles.commentEmojiButton}
              onClick={() => canComment && setShowCommentEmojiPicker((prev) => !prev)}
              aria-label="Add emoji"
              disabled={!canComment}
            >
              <svg
                aria-hidden
                fill="currentColor"
                height="18"
                viewBox="0 0 24 24"
                width="18"
              >
                <path d="M15.83 10.997a1.167 1.167 0 1 0 1.167 1.167 1.167 1.167 0 0 0-1.167-1.167Zm-6.5 1.167a1.167 1.167 0 1 0-1.166 1.167 1.167 1.167 0 0 0 1.166-1.167Zm5.163 3.24a3.406 3.406 0 0 1-4.982.007 1 1 0 1 0-1.557 1.256 5.397 5.397 0 0 0 8.09 0 1 1 0 0 0-1.55-1.263ZM12 .503a11.5 11.5 0 1 0 11.5 11.5A11.513 11.513 0 0 0 12 .503Zm0 21a9.5 9.5 0 1 1 9.5-9.5 9.51 9.51 0 0 1-9.5 9.5Z" />
              </svg>
            </button>

            {showCommentEmojiPicker ? (
              <div className={styles.commentEmojiPicker}>
                <EmojiPicker
                  width={300}
                  height={360}
                  previewConfig={{ showPreview: false }}
                  onEmojiClick={(emojiData) => insertCommentEmoji(emojiData.emoji)}
                />
              </div>
            ) : null}
          </div>
        </div>

        <button
          className={styles.commentSend}
          type="button"
          onClick={() => void onSend()}
          disabled={!draft.trim() || !canComment}
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
      </div>
    </aside>
  );
}

function HostMetaPublisher({
  onReady,
}: {
  onReady: (fn: ((patch: MetaPatch) => Promise<void>) | null) => void;
}) {
  const { localParticipant } = useLocalParticipant();

  useEffect(() => {
    onReady(async (patch: MetaPatch) => {
      const payload = new TextEncoder().encode(
        JSON.stringify({
          type: "meta_update",
          patch,
        }),
      );
      await localParticipant.publishData(payload, { reliable: true });
    });

    return () => {
      onReady(null);
    };
  }, [localParticipant, onReady]);

  return null;
}

function HostControls({ connected, latencyMode }: { connected: boolean; latencyMode: LivestreamLatencyMode }) {
  const { localParticipant } = useLocalParticipant();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [published, setPublished] = useState(false);

  const publishPreparedScreen = useCallback(async () => {
    const prepared = takePendingScreenShareStream();
    if (!prepared) {
      setError("No prepared screen share found from Create step. Start screen share once to continue.");
      return;
    }

    const [videoTrack] = prepared.getVideoTracks();
    if (!videoTrack) {
      setError("Prepared screen share track is unavailable.");
      return;
    }

    try {
      setBusy(true);
      setError("");
      await localParticipant.publishTrack(videoTrack, {
        source: Track.Source.ScreenShare,
      } as any);

      const [audioTrack] = prepared.getAudioTracks();
      if (audioTrack) {
        await localParticipant.publishTrack(audioTrack, {
          source: Track.Source.ScreenShareAudio,
        } as any);
      }

      setPublished(true);
      videoTrack.onended = () => {
        setPublished(false);
        setError("Screen share ended from browser controls.");
      };
    } catch {
      setError("Unable to publish prepared screen share.");
    } finally {
      setBusy(false);
    }
  }, [localParticipant]);

  useEffect(() => {
    if (!connected || published || busy) return;
    void publishPreparedScreen();
  }, [busy, connected, publishPreparedScreen, published]);

  const onFallbackStartShare = async () => {
    if (!connected) {
      setError("Room is connecting. Please retry in a moment.");
      return;
    }
    try {
      setBusy(true);
      setError("");
      await localParticipant.setScreenShareEnabled(true, {
        video: getScreenShareConstraints(latencyMode),
        audio: true,
      } as any);
      setPublished(true);
    } catch {
      setError("Unable to start screen share. Check browser permissions and retry.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.hostControls}>
      {error ? <p className={styles.inlineError}>{error}</p> : null}
    </div>
  );
}

export default function LivestreamStudio({ streamId }: { streamId: string }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [streamMeta, setStreamMeta] = useState<LivestreamItem | null>(null);
  const [joinToken, setJoinToken] = useState("");
  const [joinUrl, setJoinUrl] = useState("");
  const [roomConnected, setRoomConnected] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [pinnedComment, setPinnedComment] = useState("");
  const [latencyMode, setLatencyMode] = useState<LivestreamLatencyMode>("adaptive");
  const [titleError, setTitleError] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [exitBusy, setExitBusy] = useState(false);

  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [pendingHref, setPendingHref] = useState("");
  const skipBlockRef = useRef(false);
  const publishMetaPatchRef = useRef<((patch: MetaPatch) => Promise<void>) | null>(null);
  const titleRef = useRef<HTMLTextAreaElement | null>(null);
  const emojiRef = useRef<HTMLDivElement | null>(null);

  const hydrateForm = useCallback((meta: LivestreamItem) => {
    setTitle(meta.title || "");
    setDescription(meta.description || "");
    setPinnedComment(meta.pinnedComment || "");
    setLatencyMode(meta.latencyMode || "adaptive");
  }, []);

  const loadStudio = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const detail = await getLivestreamById(streamId);
      const joined = await joinLivestreamToken(streamId, { asHost: true, participantName: "Host" });
      setStreamMeta(detail.stream);
      hydrateForm(detail.stream);
      setJoinToken(joined.token);
      setJoinUrl(joined.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to open livestream studio.");
    } finally {
      setLoading(false);
    }
  }, [hydrateForm, streamId]);

  useEffect(() => {
    void loadStudio();
  }, [loadStudio]);

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
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (skipBlockRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };

    const onDocumentClick = (event: MouseEvent) => {
      if (skipBlockRef.current) return;
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      if (anchor.target && anchor.target !== "_self") return;
      const href = anchor.getAttribute("href") || "";
      if (!href || href.startsWith("#")) return;

      const nextUrl = new URL(anchor.href, window.location.origin);
      const currentUrl = new URL(window.location.href);
      if (nextUrl.pathname === currentUrl.pathname && nextUrl.search === currentUrl.search) {
        return;
      }

      event.preventDefault();
      setPendingHref(nextUrl.pathname + nextUrl.search + nextUrl.hash);
      setLeaveConfirmOpen(true);
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onDocumentClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onDocumentClick, true);
    };
  }, []);

  const applyMetaPatch = useCallback((patch: MetaPatch) => {
    setStreamMeta((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        title: patch.title ?? prev.title,
        description: patch.description ?? prev.description,
        pinnedComment: patch.pinnedComment ?? prev.pinnedComment,
        latencyMode: patch.latencyMode ?? prev.latencyMode,
      };
    });

    if (typeof patch.title === "string") setTitle(patch.title);
    if (typeof patch.description === "string") setDescription(patch.description);
    if (typeof patch.pinnedComment === "string") setPinnedComment(patch.pinnedComment);
    if (typeof patch.latencyMode === "string") setLatencyMode(patch.latencyMode);
  }, []);

  const titleWordCount = useMemo(() => {
    const trimmed = title.trim();
    if (!trimmed) return 0;
    return trimmed.split(/\s+/).filter(Boolean).length;
  }, [title]);

  const hasChanges = useMemo(() => {
    if (!streamMeta) return false;
    const currentTitle = title.trim();
    const currentDescription = description.trim();
    const currentPinned = pinnedComment.trim();
    return (
      currentTitle !== (streamMeta.title || "") ||
      currentDescription !== (streamMeta.description || "") ||
      currentPinned !== (streamMeta.pinnedComment || "") ||
      latencyMode !== (streamMeta.latencyMode || "adaptive")
    );
  }, [description, latencyMode, pinnedComment, streamMeta, title]);

  const canSave = hasChanges && !saving && titleWordCount <= TITLE_WORD_LIMIT && Boolean(title.trim());

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

  const onSaveMetadata = async () => {
    try {
      setSaving(true);
      setError("");
      setTitleError("");

      const trimmedTitle = title.trim();
      if (!trimmedTitle) {
        setTitleError("Title cannot be empty.");
        return;
      }

      if (titleWordCount > TITLE_WORD_LIMIT) {
        setTitleError(`Title supports up to ${TITLE_WORD_LIMIT} words.`);
        return;
      }

      const payload: MetaPatch = {
        title: trimmedTitle,
        description: description.trim(),
        pinnedComment: pinnedComment.trim(),
        latencyMode,
      };

      const response = await updateLivestream(streamId, payload);
      setStreamMeta(response.stream);
      hydrateForm(response.stream);

      if (publishMetaPatchRef.current) {
        await publishMetaPatchRef.current({
          title: response.stream.title,
          description: response.stream.description,
          pinnedComment: response.stream.pinnedComment,
          latencyMode: response.stream.latencyMode,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update livestream.");
    } finally {
      setSaving(false);
    }
  };

  const onEndLive = async () => {
    try {
      setExitBusy(true);
      await endLivestream(streamId);
      clearPendingScreenShareStream();
      skipBlockRef.current = true;
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to end livestream.");
    } finally {
      setExitBusy(false);
    }
  };

  const onConfirmLeave = () => {
    if (!pendingHref) return;
    skipBlockRef.current = true;
    window.location.href = pendingHref;
  };

  const roomOptions = useMemo(
    () => ({
      adaptiveStream: true,
      dynacast: true,
    }),
    [],
  );

  return (
    <section className={styles.wrap}>
      <div className={styles.header}>
        <div>
          <p className={styles.label}>Livestream Studio</p>
          <h1 className={styles.title}>Manage your live stream</h1>
        </div>
        <button type="button" className={styles.endButton} onClick={() => void onEndLive()} disabled={exitBusy}>
          {exitBusy ? "Ending..." : "End live"}
        </button>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.grid}>
        <div className={styles.mainPane}>
          {loading ? <div className={styles.muted}>Opening studio...</div> : null}

          {joinToken && joinUrl && streamMeta ? (
            <LiveKitRoom
              token={joinToken}
              serverUrl={joinUrl}
              connect={true}
              audio={false}
              video={false}
              options={roomOptions}
              className={styles.room}
              onConnected={() => setRoomConnected(true)}
              onDisconnected={() => setRoomConnected(false)}
            >
              <HostMetaPublisher
                onReady={(fn) => {
                  publishMetaPatchRef.current = fn;
                }}
              />
              <HostControls connected={roomConnected} latencyMode={latencyMode} />
              <div className={styles.liveShell}>
                <StreamStage hostName={streamMeta.hostName} />
                <StudioComments
                  canComment={true}
                  pinnedComment={streamMeta.pinnedComment}
                  onMetaPatch={applyMetaPatch}
                />
              </div>
              <RoomAudioRenderer />
            </LiveKitRoom>
          ) : null}
        </div>

        <aside className={styles.settingsPane}>
          <h2 className={styles.settingsTitle}>Live settings</h2>

          <label className={styles.field}>
            <span className={styles.titleLabelRow}>
              <span>Title</span>
              <div className={styles.emojiWrap} ref={emojiRef}>
                <button
                  type="button"
                  className={styles.emojiButton}
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
                  <div className={styles.emojiPickerPanel}>
                    <EmojiPicker
                      width={300}
                      height={360}
                      previewConfig={{ showPreview: false }}
                      onEmojiClick={(emojiData) => insertEmoji(emojiData.emoji)}
                    />
                  </div>
                ) : null}
              </div>
            </span>
            <textarea
              ref={titleRef}
              value={title}
              onChange={(event) => {
                const next = event.target.value;
                const nextCount = next.trim() ? next.trim().split(/\s+/).filter(Boolean).length : 0;
                if (nextCount <= TITLE_WORD_LIMIT) {
                  setTitle(next);
                  if (titleError) setTitleError("");
                } else {
                  setTitleError(`Title supports up to ${TITLE_WORD_LIMIT} words.`);
                }
              }}
              className={styles.titleTextarea}
              placeholder="Write your livestream title"
            />
            <span className={styles.titleCounter}>{titleWordCount}/{TITLE_WORD_LIMIT} words</span>
            {titleError ? <span className={styles.fieldError}>{titleError}</span> : null}
          </label>

          <label className={styles.field}>
            <span>Description</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className={styles.textarea}
            />
          </label>

          <label className={styles.field}>
            <span>Pinned comment</span>
            <input
              value={pinnedComment}
              onChange={(event) => setPinnedComment(event.target.value)}
              className={styles.input}
            />
          </label>

          <label className={styles.field}>
            <span>Livestream latency</span>
            <div className={styles.latencyGroup} role="radiogroup" aria-label="Livestream latency mode">
              {[
                {
                  value: "adaptive" as LivestreamLatencyMode,
                  label: "Adaptive latency",
                  note: "Auto-tunes bitrate and quality based on network and device performance.",
                },
                {
                  value: "balanced" as LivestreamLatencyMode,
                  label: "Balanced latency",
                  note: "Keeps a stable stream with moderate delay and consistent quality.",
                },
                {
                  value: "low" as LivestreamLatencyMode,
                  label: "Low latency",
                  note: "Minimizes delay for near real-time interaction, with more aggressive quality trade-offs.",
                },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={latencyMode === option.value}
                  className={`${styles.latencyCard} ${latencyMode === option.value ? styles.latencyCardActive : ""}`}
                  onClick={() => setLatencyMode(option.value)}
                >
                  <span className={styles.latencyTitle}>{option.label}</span>
                  <span className={styles.latencyNote}>{option.note}</span>
                </button>
              ))}
            </div>
          </label>

          <button type="button" className={styles.saveButton} onClick={() => void onSaveMetadata()} disabled={!canSave}>
            {saving ? "Saving..." : "Save changes"}
          </button>
        </aside>
      </div>

      {leaveConfirmOpen ? (
        <div className={styles.navOverlay}>
          <div className={styles.navDialog}>
            <h3>Leave livestream studio?</h3>
            <p>
              Navigating to another section can interrupt your live session. Do you want to continue?
            </p>
            <div className={styles.navActions}>
              <button type="button" className={styles.navStay} onClick={() => setLeaveConfirmOpen(false)}>
                Stay here
              </button>
              <button type="button" className={styles.navLeave} onClick={onConfirmLeave}>
                Leave anyway
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
