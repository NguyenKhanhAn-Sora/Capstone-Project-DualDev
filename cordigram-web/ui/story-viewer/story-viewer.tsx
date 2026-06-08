"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  markStoryViewed,
  reactToStory,
  removeStoryReaction,
  deleteStory,
  fetchStoryViewers,
  type StoryFeedGroup,
  type StoryItem,
} from "@/lib/api";
import { formatRelativeTime } from "@/lib/relative-time";
import styles from "./story-viewer.module.css";

const STORY_DURATION_MS = 6000;
const QUICK_REACTIONS = ["❤️", "😮", "😂", "😢", "😡", "👍"];

type Props = {
  groups: StoryFeedGroup[];
  initialGroupIndex: number;
  viewerId?: string;
  token: string | null;
  onClose: () => void;
  onStoryDeleted?: (storyId: string) => void;
};

export default function StoryViewer({
  groups,
  initialGroupIndex,
  viewerId,
  token,
  onClose,
  onStoryDeleted,
}: Props) {
  const [groupIdx, setGroupIdx] = useState(initialGroupIndex);
  const [storyIdx, setStoryIdx] = useState(0);
  const [progress, setProgress] = useState(0); // 0-100
  const [paused, setPaused] = useState(false);
  const [reply, setReply] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showViewers, setShowViewers] = useState(false);
  const [viewers, setViewers] = useState<any[]>([]);
  const [loadingViewers, setLoadingViewers] = useState(false);
  const [reactionLocal, setReactionLocal] = useState<string | null>(null);

  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressValRef = useRef(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const viewedRef = useRef<Set<string>>(new Set());
  const mountedRef = useRef(true);
  const storyContentRef = useRef<HTMLDivElement>(null);
  const [contentH, setContentH] = useState(844);

  const group = groups[groupIdx];
  const story: StoryItem | undefined = group?.stories[storyIdx];
  const isOwner = viewerId && group?.userId === viewerId;

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    const el = storyContentRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setContentH(entry.contentRect.height));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Khi story thay đổi
  useEffect(() => {
    if (!story) return;
    progressValRef.current = 0;
    setProgress(0);
    setReply("");
    setShowEmoji(false);
    setShowMenu(false);
    setReactionLocal(story.myReaction);

    // Mark viewed
    if (token && !viewedRef.current.has(story.id)) {
      viewedRef.current.add(story.id);
      markStoryViewed({ token, storyId: story.id }).catch(() => undefined);
    }
  }, [story?.id, token]);

  // Progress bar timer
  useEffect(() => {
    if (!story) return;
    if (paused) {
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
      return;
    }

    const duration = story.mediaDurationMs && story.type === 'media' && story.mediaType === 'video'
      ? Math.min(story.mediaDurationMs, 30000)
      : STORY_DURATION_MS;

    const step = 100 / (duration / 50);
    progressTimerRef.current = setInterval(() => {
      const next = progressValRef.current + step;
      if (next >= 100) {
        clearInterval(progressTimerRef.current!);
        progressValRef.current = 100;
        setProgress(100);
        goNext(); // safe: outside state updater
      } else {
        progressValRef.current = next;
        setProgress(next);
      }
    }, 50);

    return () => { if (progressTimerRef.current) clearInterval(progressTimerRef.current); };
  }, [story?.id, paused]);

  const resetProgress = () => { progressValRef.current = 0; setProgress(0); };

  const goNext = useCallback(() => {
    const grp = groups[groupIdx];
    if (!grp) { onClose(); return; }
    if (storyIdx < grp.stories.length - 1) {
      setStoryIdx((i) => i + 1);
      resetProgress();
    } else if (groupIdx < groups.length - 1) {
      setGroupIdx((g) => g + 1);
      setStoryIdx(0);
      resetProgress();
    } else {
      onClose();
    }
  }, [groupIdx, storyIdx, groups, onClose]);

  const goPrev = useCallback(() => {
    if (storyIdx > 0) {
      setStoryIdx((i) => i - 1);
      resetProgress();
    } else if (groupIdx > 0) {
      const prevGroup = groups[groupIdx - 1];
      setGroupIdx((g) => g - 1);
      setStoryIdx(prevGroup ? prevGroup.stories.length - 1 : 0);
      resetProgress();
    }
  }, [groupIdx, storyIdx, groups]);

  const goPrevGroup = useCallback(() => {
    if (groupIdx > 0) {
      setGroupIdx((g) => g - 1);
      setStoryIdx(0);
      resetProgress();
    }
  }, [groupIdx]);

  const goNextGroup = useCallback(() => {
    if (groupIdx < groups.length - 1) {
      setGroupIdx((g) => g + 1);
      setStoryIdx(0);
      resetProgress();
    } else {
      onClose();
    }
  }, [groupIdx, groups, onClose]);

  // Keyboard nav
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") goNext();
      else if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "Escape") onClose();
      else if (e.key === " ") setPaused((p) => !p);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [goNext, goPrev, onClose]);

  // Video pause/play
  useEffect(() => {
    if (!videoRef.current) return;
    if (paused) videoRef.current.pause();
    else videoRef.current.play().catch(() => undefined);
  }, [paused]);

  // Seek to trimStartMs when story changes, enforce trimEndMs
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid || story?.mediaType !== "video") return;
    const startSec = story.trimStartMs != null ? story.trimStartMs / 1000 : 0;
    const endSec = story.trimEndMs != null ? story.trimEndMs / 1000 : null;

    const onLoaded = () => {
      vid.currentTime = startSec;
      vid.play().catch(() => undefined);
    };

    const onTimeUpdate = () => {
      if (endSec !== null && vid.currentTime >= endSec) {
        vid.pause();
        goNext();
      }
    };

    vid.addEventListener("loadedmetadata", onLoaded);
    vid.addEventListener("timeupdate", onTimeUpdate);
    // if already loaded, seek immediately
    if (vid.readyState >= 1) {
      vid.currentTime = startSec;
    }
    return () => {
      vid.removeEventListener("loadedmetadata", onLoaded);
      vid.removeEventListener("timeupdate", onTimeUpdate);
    };
  }, [story?.id, story?.trimStartMs, story?.trimEndMs]);

  const handleReact = async (emoji: string) => {
    if (!token || !story) return;
    setShowEmoji(false);
    const prev = reactionLocal;
    setReactionLocal(emoji);
    try {
      await reactToStory({ token, storyId: story.id, emoji });
    } catch {
      setReactionLocal(prev);
    }
  };

  const handleUnreact = async () => {
    if (!token || !story) return;
    setReactionLocal(null);
    try {
      await removeStoryReaction({ token, storyId: story.id });
    } catch {
      setReactionLocal(story.myReaction);
    }
  };

  const handleDelete = async () => {
    if (!token || !story) return;
    setShowMenu(false);
    try {
      await deleteStory({ token, storyId: story.id });
      onStoryDeleted?.(story.id);
      goNext();
    } catch {}
  };

  const handleShowViewers = async () => {
    if (!token || !story) return;
    setShowMenu(false);
    setShowViewers(true);
    setPaused(true);
    setLoadingViewers(true);
    try {
      const res = await fetchStoryViewers({ token, storyId: story.id });
      setViewers(res.viewers);
    } catch {
      setViewers([]);
    } finally {
      setLoadingViewers(false);
    }
  };

  const closeViewers = () => {
    setShowViewers(false);
    setPaused(false);
  };

  if (!group || !story) return null;

  const content = (
    <div className={styles.overlay} role="dialog" aria-modal>
      {/* Desktop nav buttons */}
      {groupIdx > 0 && (
        <button className={styles.navPrev} onClick={goPrevGroup} aria-label="Nhóm trước">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
      )}

      <div className={styles.container}>
        {/* Progress bars */}
        <div className={styles.progressBars}>
          {group.stories.map((s, i) => (
            <div key={s.id} className={styles.progressBar}>
              <div
                className={styles.progressFill}
                style={{
                  width: i < storyIdx ? "100%" : i === storyIdx ? `${progress}%` : "0%",
                }}
              />
            </div>
          ))}
        </div>

        {/* Header */}
        <div className={styles.header}>
          {group.avatarUrl ? (
            <img src={group.avatarUrl} alt="" className={styles.authorAvatar} />
          ) : (
            <div className={styles.authorAvatarPlaceholder}>
              {(group.displayName || group.username || "U")[0].toUpperCase()}
            </div>
          )}
          <div className={styles.authorInfo}>
            <div className={styles.authorName}>{group.displayName || group.username}</div>
            <div className={styles.timeAgo}>{formatRelativeTime(story.createdAt)}</div>
          </div>
          <div className={styles.headerActions}>
            <button
              className={styles.iconBtn}
              onClick={() => setPaused((p) => !p)}
              aria-label={paused ? "Tiếp tục" : "Tạm dừng"}
            >
              {paused ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
              )}
            </button>
            <button
              className={styles.iconBtn}
              onClick={() => { setShowMenu((m) => !m); setPaused(true); }}
              aria-label="Tùy chọn"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/>
              </svg>
            </button>
            <button className={styles.iconBtn} onClick={onClose} aria-label="Đóng">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            </button>
          </div>
        </div>

        {/* Story content */}
        <div ref={storyContentRef} className={styles.storyContent}>
          {story.type === "media" && story.mediaUrl && story.mediaType === "image" && (
            <img src={story.mediaUrl} alt="" className={styles.storyImage} />
          )}
          {story.type === "media" && story.mediaUrl && story.mediaType === "video" && (
            <video
              ref={videoRef}
              src={story.mediaUrl}
              className={styles.storyVideo}
              autoPlay
              muted={false}
              playsInline
              loop={false}
              onEnded={goNext}
            />
          )}
          {story.type === "text" && (
            <div
              className={styles.textStory}
              style={{ background: story.backgroundStyle ?? "linear-gradient(135deg,#6366f1,#8b5cf6)" }}
            >
              <div className={styles.textStoryContent}>{story.textContent}</div>
            </div>
          )}

          {/* Text overlays */}
          {story.textOverlays?.map((ov, i) => (
            <div
              key={i}
              className={styles.textOverlay}
              style={{
                left: `${ov.x ?? 50}%`,
                top: `${ov.y ?? 50}%`,
                color: ov.color ?? "#fff",
                fontSize: `${((ov.fontSize ?? 5) / 100) * contentH}px`,
                textAlign: ov.align ?? "center",
                backgroundColor: (ov.backgroundColor && ov.backgroundColor !== '#000000') ? ov.backgroundColor : "transparent",
                padding: (ov.backgroundColor && ov.backgroundColor !== '#000000') ? "4px 10px" : undefined,
                borderRadius: (ov.backgroundColor && ov.backgroundColor !== '#000000') ? "6px" : undefined,
              }}
            >
              {ov.text}
            </div>
          ))}

          {/* Stickers */}
          {story.stickers?.map((st, i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                left: `${st.x ?? 50}%`,
                top: `${st.y ?? 50}%`,
                transform: "translate(-50%,-50%)",
                fontSize: `${st.size ?? 40}px`,
                pointerEvents: "none",
                userSelect: "none",
              }}
            >
              {st.emoji}
            </div>
          ))}
        </div>

        {/* Tap zones */}
        <div className={styles.tapZones}>
          <div
            className={styles.tapLeft}
            onPointerDown={() => setPaused(true)}
            onPointerUp={() => { setPaused(false); goPrev(); }}
            onPointerLeave={() => setPaused(false)}
            aria-label="Story trước"
          />
          <div
            className={styles.tapRight}
            onPointerDown={() => setPaused(true)}
            onPointerUp={() => { setPaused(false); goNext(); }}
            onPointerLeave={() => setPaused(false)}
            aria-label="Story tiếp theo"
          />
        </div>

        {/* Location tag */}
        {story.location && (
          <div className={styles.locationTag}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-6-5.5-6-10a6 6 0 1 1 12 0c0 4.5-6 10-6 10Z"/><circle cx="12" cy="11" r="2.5"/></svg>
            {story.location}
          </div>
        )}

        {/* Footer */}
        {!isOwner && (
          <div className={styles.footer}>
            <input
              className={styles.replyInput}
              placeholder={`Trả lời ${group.displayName || group.username}...`}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onFocus={() => setPaused(true)}
              onBlur={() => setPaused(false)}
            />
            <button
              className={`${styles.reactionBtn} ${reactionLocal ? styles.active : ""}`}
              onClick={() => { setShowEmoji((v) => !v); setPaused(true); }}
              aria-label="React"
            >
              {reactionLocal ?? "😊"}
            </button>
          </div>
        )}

        {isOwner && (
          <div className={styles.footer}>
            <button
              className={styles.replyInput}
              style={{ cursor: "pointer", textAlign: "left" }}
              onClick={handleShowViewers}
            >
              <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 13 }}>
                👁 {story.viewCount} lượt xem
              </span>
            </button>
          </div>
        )}

        {/* Emoji picker */}
        {showEmoji && (
          <div className={styles.emojiPicker}>
            {reactionLocal && (
              <span className={styles.emojiOption} onClick={handleUnreact} title="Bỏ react">✕</span>
            )}
            {QUICK_REACTIONS.map((em) => (
              <span
                key={em}
                className={styles.emojiOption}
                onClick={() => handleReact(em)}
              >
                {em}
              </span>
            ))}
          </div>
        )}

        {/* Dots menu */}
        {showMenu && (
          <div className={styles.dotsMenu}>
            {isOwner && (
              <>
                <button className={styles.dotsMenuItem} onClick={handleShowViewers}>
                  👁 Xem người đã xem
                </button>
                <button className={`${styles.dotsMenuItem} ${styles.danger}`} onClick={handleDelete}>
                  🗑 Xóa story
                </button>
              </>
            )}
            {!isOwner && (
              <button className={`${styles.dotsMenuItem} ${styles.danger}`} onClick={() => setShowMenu(false)}>
                🚩 Báo cáo
              </button>
            )}
            <button className={styles.dotsMenuItem} onClick={() => { setShowMenu(false); setPaused(false); }}>
              Đóng
            </button>
          </div>
        )}

        {/* Viewers panel */}
        {showViewers && (
          <div className={styles.viewersPanel}>
            <div className={styles.viewersPanelHeader}>
              <span className={styles.viewersPanelTitle}>
                Người đã xem ({viewers.length})
              </span>
              <button className={styles.iconBtn} onClick={closeViewers} aria-label="Đóng">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
              </button>
            </div>
            <div className={styles.viewersList}>
              {loadingViewers && (
                <div style={{ padding: 24, textAlign: "center", color: "rgba(255,255,255,0.5)" }}>Đang tải...</div>
              )}
              {!loadingViewers && viewers.length === 0 && (
                <div style={{ padding: 24, textAlign: "center", color: "rgba(255,255,255,0.5)" }}>Chưa có ai xem</div>
              )}
              {viewers.map((v) => (
                <div key={v.userId} className={styles.viewerRow}>
                  {v.avatarUrl ? (
                    <img src={v.avatarUrl} alt="" className={styles.viewerAvatar} />
                  ) : (
                    <div className={styles.viewerAvatarPlaceholder}>
                      {(v.displayName || v.username || "U")[0]?.toUpperCase()}
                    </div>
                  )}
                  <span className={styles.viewerName}>{v.displayName || v.username || "Người dùng"}</span>
                  <span className={styles.viewerTime}>{formatRelativeTime(v.viewedAt)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {groupIdx < groups.length - 1 && (
        <button className={styles.navNext} onClick={goNextGroup} aria-label="Nhóm tiếp">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
      )}
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(content, document.body);
}
