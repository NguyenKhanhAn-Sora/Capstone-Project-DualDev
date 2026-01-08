"use client";

import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import {
  fetchReelsFeed,
  fetchReelDetail,
  likePost,
  unlikePost,
  savePost,
  unsavePost,
  repostPost,
  unrepostPost,
  followUser,
  unfollowUser,
  viewPost,
  type FeedItem,
} from "@/lib/api";
import { useRequireAuth } from "@/hooks/use-require-auth";
import ReelComments from "./ReelComments";
import styles from "./reel.module.css";

const formatCount = (value?: number) => {
  const n = value ?? 0;
  if (n >= 1_000_000)
    return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return `${n}`;
};

const REEL_STATS_POLL_INTERVAL = 5000;

type ReelItem = FeedItem & { durationSeconds?: number };

const getUserIdFromToken = (token: string | null): string | undefined => {
  if (!token) return undefined;
  try {
    const parts = token.split(".");
    if (parts.length < 2) return undefined;
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(atob(payload));
    if (json && typeof json.userId === "string") return json.userId;
    if (json && typeof json.sub === "string") return json.sub;
  } catch {
    return undefined;
  }
};

type ReelVideoProps = {
  item: ReelItem;
  autoplay: boolean;
  onViewed?: (msWatched?: number) => void;
};

const IconPlay = ({ size = 56 }: { size?: number }) => (
  <svg aria-hidden width={size} height={size} viewBox="0 0 64 64" fill="none">
    <circle cx="32" cy="32" r="32" fill="rgba(0,0,0,0.45)" />
    <path d="M26 20l18 12-18 12V20Z" fill="#f8fafc" />
  </svg>
);

const IconPause = ({ size = 56 }: { size?: number }) => (
  <svg aria-hidden width={size} height={size} viewBox="0 0 64 64" fill="none">
    <circle cx="32" cy="32" r="32" fill="rgba(0,0,0,0.45)" />
    <rect x="22" y="19" width="8" height="26" rx="3" fill="#f8fafc" />
    <rect x="34" y="19" width="8" height="26" rx="3" fill="#f8fafc" />
  </svg>
);

const IconVolume = ({ muted }: { muted: boolean }) =>
  muted ? (
    <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path
        d="M11.60 2.08L11.48 2.14L3.91 6.68C3.02 7.21 2.28 7.97 1.77 8.87C1.26 9.77 1.00 10.79 1 11.83V12.16L1.01 12.56C1.07 13.52 1.37 14.46 1.87 15.29C2.38 16.12 3.08 16.81 3.91 17.31L11.48 21.85C11.63 21.94 11.80 21.99 11.98 21.99C12.16 22.00 12.33 21.95 12.49 21.87C12.64 21.78 12.77 21.65 12.86 21.50C12.95 21.35 13 21.17 13 21V3C12.99 2.83 12.95 2.67 12.87 2.52C12.80 2.37 12.68 2.25 12.54 2.16C12.41 2.07 12.25 2.01 12.08 2.00C11.92 1.98 11.75 2.01 11.60 2.08ZM4.94 8.4V8.40L11 4.76V19.23L4.94 15.6C4.38 15.26 3.92 14.80 3.58 14.25C3.24 13.70 3.05 13.07 3.00 12.43L3 12.17V11.83C2.99 11.14 3.17 10.46 3.51 9.86C3.85 9.25 4.34 8.75 4.94 8.4ZM21.29 8.29L19 10.58L16.70 8.29L16.63 8.22C16.43 8.07 16.19 7.99 15.95 8.00C15.70 8.01 15.47 8.12 15.29 8.29C15.12 8.47 15.01 8.70 15.00 8.95C14.99 9.19 15.07 9.43 15.22 9.63L15.29 9.70L17.58 12L15.29 14.29C15.19 14.38 15.12 14.49 15.06 14.61C15.01 14.73 14.98 14.87 14.98 15.00C14.98 15.13 15.01 15.26 15.06 15.39C15.11 15.51 15.18 15.62 15.28 15.71C15.37 15.81 15.48 15.88 15.60 15.93C15.73 15.98 15.86 16.01 15.99 16.01C16.12 16.01 16.26 15.98 16.38 15.93C16.50 15.87 16.61 15.80 16.70 15.70L19 13.41L21.29 15.70L21.36 15.77C21.56 15.93 21.80 16.01 22.05 15.99C22.29 15.98 22.53 15.88 22.70 15.70C22.88 15.53 22.98 15.29 22.99 15.05C23.00 14.80 22.93 14.56 22.77 14.36L22.70 14.29L20.41 12L22.70 9.70C22.80 9.61 22.87 9.50 22.93 9.38C22.98 9.26 23.01 9.12 23.01 8.99C23.01 8.86 22.98 8.73 22.93 8.60C22.88 8.48 22.81 8.37 22.71 8.28C22.62 8.18 22.51 8.11 22.39 8.06C22.26 8.01 22.13 7.98 22.00 7.98C21.87 7.98 21.73 8.01 21.61 8.06C21.49 8.12 21.38 8.19 21.29 8.29Z"
        fill="currentColor"
      />
    </svg>
  ) : (
    <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path
        d="M 11.60 2.08 L 11.48 2.14 L 3.91 6.68 C 3.02 7.21 2.28 7.97 1.77 8.87 C 1.26 9.77 1.00 10.79 1 11.83 V 12.16 L 1.01 12.56 C 1.07 13.52 1.37 14.46 1.87 15.29 C 2.38 16.12 3.08 16.81 3.91 17.31 L 11.48 21.85 C 11.63 21.94 11.80 21.99 11.98 21.99 C 12.16 22.00 12.33 21.95 12.49 21.87 C 12.64 21.78 12.77 21.65 12.86 21.50 C 12.95 21.35 13 21.17 13 21 V 3 C 12.99 2.83 12.95 2.67 12.87 2.52 C 12.80 2.37 12.68 2.25 12.54 2.16 C 12.41 2.07 12.25 2.01 12.08 2.00 C 11.92 1.98 11.75 2.01 11.60 2.08 Z"
        fill="currentColor"
      />
      <path
        className="volumeRippleSmall"
        d=" M 15.53 7.05 C 15.35 7.22 15.25 7.45 15.24 7.70 C 15.23 7.95 15.31 8.19 15.46 8.38 L 15.53 8.46 L 15.70 8.64 C 16.09 9.06 16.39 9.55 16.61 10.08 L 16.70 10.31 C 16.90 10.85 17 11.42 17 12 L 16.99 12.24 C 16.96 12.73 16.87 13.22 16.70 13.68 L 16.61 13.91 C 16.36 14.51 15.99 15.07 15.53 15.53 C 15.35 15.72 15.25 15.97 15.26 16.23 C 15.26 16.49 15.37 16.74 15.55 16.92 C 15.73 17.11 15.98 17.21 16.24 17.22 C 16.50 17.22 16.76 17.12 16.95 16.95 C 17.6 16.29 18.11 15.52 18.46 14.67 L 18.59 14.35 C 18.82 13.71 18.95 13.03 18.99 12.34 L 19 12 C 18.99 11.19 18.86 10.39 18.59 9.64 L 18.46 9.32 C 18.15 8.57 17.72 7.89 17.18 7.3 L 16.95 7.05 L 16.87 6.98 C 16.68 6.82 16.43 6.74 16.19 6.75 C 15.94 6.77 15.71 6.87 15.53 7.05"
        fill="currentColor"
        transform="translate(18, 12) scale(1) translate(-18,-12)"
      />
      <path
        className="volumeRippleBig"
        d="M18.36 4.22C18.18 4.39 18.08 4.62 18.07 4.87C18.05 5.12 18.13 5.36 18.29 5.56L18.36 5.63L18.66 5.95C19.36 6.72 19.91 7.60 20.31 8.55L20.47 8.96C20.82 9.94 21 10.96 21 11.99L20.98 12.44C20.94 13.32 20.77 14.19 20.47 15.03L20.31 15.44C19.86 16.53 19.19 17.52 18.36 18.36C18.17 18.55 18.07 18.80 18.07 19.07C18.07 19.33 18.17 19.59 18.36 19.77C18.55 19.96 18.80 20.07 19.07 20.07C19.33 20.07 19.59 19.96 19.77 19.77C20.79 18.75 21.61 17.54 22.16 16.20L22.35 15.70C22.72 14.68 22.93 13.62 22.98 12.54L23 12C22.99 10.73 22.78 9.48 22.35 8.29L22.16 7.79C21.67 6.62 20.99 5.54 20.15 4.61L19.77 4.22L19.70 4.15C19.51 3.99 19.26 3.91 19.02 3.93C18.77 3.94 18.53 4.04 18.36 4.22 Z"
        fill="currentColor"
        transform="translate(22, 12) scale(1) translate(-22, -12)"
      />
    </svg>
  );

const IconHeart = ({ filled }: { filled?: boolean }) => (
  <svg aria-hidden width="26" height="26" viewBox="0 0 24 24">
    <path
      d="M11.6 20.6c.2.2.6.2.8 0l6.6-6.6a4.7 4.7 0 0 0-6.6-6.6l-.4.4-.4-.4a4.7 4.7 0 0 0-6.6 6.6l6.6 6.6Z"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
  </svg>
);

const IconComment = () => (
  <svg aria-hidden width="26" height="26" viewBox="0 0 24 24">
    <path
      d="M5 18v-1c-1.1-.8-2-2.3-2-4V9a6 6 0 0 1 6-6h6a6 6 0 0 1 6 6v4a6 6 0 0 1-6 6H7l-2 2Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
  </svg>
);

const IconSave = ({ filled }: { filled?: boolean }) => (
  <svg aria-hidden width="26" height="26" viewBox="0 0 24 24">
    <path
      d="M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1Z"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
  </svg>
);

const IconRepost = ({ filled }: { filled?: boolean }) => (
  <svg aria-hidden width="26" height="26" viewBox="0 0 24 24">
    {filled ? (
      <>
        <path
          d="M7 7h10.5L15 4.5M17.5 7 15 9.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M17 17H6.5L9 19.5M6.5 17 9 14.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </>
    ) : (
      <>
        <path
          d="M7 7h10.5L15 4.5M17.5 7 15 9.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M17 17H6.5L9 19.5M6.5 17 9 14.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </>
    )}
  </svg>
);

const IconArrow = ({ up }: { up?: boolean }) => (
  <svg aria-hidden width="30" height="30" viewBox="0 0 24 24" fill="none">
    <path
      d={up ? "M7 14l5-5 5 5" : "M7 10l5 5 5-5"}
      stroke="#0f172a"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </svg>
);

function ReelVideo({ item, autoplay, onViewed }: ReelVideoProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.72);
  const [muted, setMuted] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [canExpand, setCanExpand] = useState(false);
  const captionRef = useRef<HTMLDivElement | null>(null);
  const viewSentRef = useRef(false);

  useEffect(() => {
    setExpanded(false);
    setCanExpand(false);
  }, [item.id]);

  useEffect(() => {
    const el = captionRef.current;
    if (!el) return;
    const checkOverflow = () => {
      const computed = getComputedStyle(el);
      const lineHeight = parseFloat(computed.lineHeight || "0") || 16;
      const lines = el.scrollHeight / lineHeight;
      const shouldCollapse =
        lines > 2.05 || (el.textContent?.length ?? 0) > 160;
      setCanExpand(shouldCollapse);
      setExpanded((prev) => (shouldCollapse ? prev : true));
    };

    const id = requestAnimationFrame(checkOverflow);
    const timeoutId = setTimeout(checkOverflow, 80);

    const observer = new ResizeObserver(() => checkOverflow());
    observer.observe(el);

    return () => {
      cancelAnimationFrame(id);
      clearTimeout(timeoutId);
      observer.disconnect();
    };
  }, [item.content, item.content?.length, item.hashtags?.length]);

  useEffect(() => {
    viewSentRef.current = false;
    setCurrent(0);
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = 0;
    video.pause();
    if (autoplay) {
      video
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
    }
  }, [item.id, autoplay]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = muted || volume <= 0.01;
    video.volume = muted ? 0 : volume;
  }, [volume, muted]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoaded = () => {
      setDuration(video.duration || 0);
    };
    const handleTime = () => {
      const t = video.currentTime;
      setCurrent(t);
      if (!viewSentRef.current && t >= 2) {
        viewSentRef.current = true;
        onViewed?.(Math.round(t * 1000));
      }
    };
    const handleEnded = () => {
      video.currentTime = 0;
      video
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
    };
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    video.addEventListener("loadedmetadata", handleLoaded);
    video.addEventListener("timeupdate", handleTime);
    video.addEventListener("ended", handleEnded);
    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);

    return () => {
      video.removeEventListener("loadedmetadata", handleLoaded);
      video.removeEventListener("timeupdate", handleTime);
      video.removeEventListener("ended", handleEnded);
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
    };
  }, [onViewed]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMuted((m) => !m);
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(
      1,
      Math.max(0, (e.clientX - rect.left) / Math.max(rect.width, 1))
    );
    const video = videoRef.current;
    if (video && duration) {
      video.currentTime = ratio * duration;
      setCurrent(video.currentTime);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    setVolume(Number(e.target.value));
    if (muted && Number(e.target.value) > 0.01) {
      setMuted(false);
    }
  };

  const percent = duration ? Math.min(100, (current / duration) * 100) : 0;
  const hashtags = useMemo(
    () => item.hashtags?.map((tag) => `#${tag}`) ?? [],
    [item.hashtags]
  );
  const shellClass = [
    styles.videoShell,
    !isPlaying ? styles.videoShellPaused : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={shellClass} onClick={togglePlay}>
      <video
        ref={videoRef}
        className={styles.video}
        src={item.media?.[0]?.url}
        playsInline
        preload="metadata"
        muted={muted}
        controls={false}
      />
      <button
        className={styles.volumeBtn}
        onClick={toggleMute}
        aria-label="Toggle volume"
      >
        <IconVolume muted={muted || volume <= 0.01} />
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={muted ? 0 : volume}
          onClick={(e) => e.stopPropagation()}
          onChange={handleVolumeChange}
          className="pt-4 pb-4 pr-3 pl-2"
        />
      </button>
      <div className={styles.progressWrap} onClick={handleSeek}>
        <div className={styles.progressTrack}>
          <div
            className={styles.progressFill}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
      <div className={styles.playOverlay} aria-hidden>
        {isPlaying ? <IconPause /> : <IconPlay />}
      </div>
      <div className={styles.captionCard}>
        <div className={styles.captionHeader}>
          {item.authorUsername ? (
            <div className={styles.captionHandle}>@{item.authorUsername}</div>
          ) : null}
        </div>
        <div
          ref={captionRef}
          className={`${styles.captionText} ${
            canExpand && !expanded
              ? styles.captionCollapsed
              : styles.captionExpanded
          } ${canExpand ? styles.captionTextClickable : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            if (canExpand) setExpanded((v) => !v);
          }}
        >
          <span>{item.content || ""}</span>
          {hashtags.length ? " " : ""}
          {hashtags.map((tag) => (
            <span key={tag} className={styles.hashtagInline}>
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function ReelActions({
  item,
  onLike,
  onSave,
  onRepost,
  onComment,
  onFollow,
  viewerId,
}: {
  item: ReelItem;
  onLike: (id: string, liked: boolean) => void;
  onSave: (id: string, saved: boolean) => void;
  onRepost: (id: string, reposted: boolean) => void;
  onComment: (id: string) => void;
  onFollow: (authorId: string, nextFollow: boolean) => void;
  viewerId?: string;
}) {
  const following = Boolean(
    item.flags?.following ??
      (item as unknown as { following?: boolean }).following
  );
  const isSelf = Boolean(viewerId && item.authorId === viewerId);
  return (
    <div className={styles.actionBar}>
      <div className={styles.avatarShell}>
        <div className={styles.avatarWrap}>
          {item.authorAvatarUrl ? (
            <img
              src={item.authorAvatarUrl}
              alt={item.authorDisplayName || item.authorUsername || "avatar"}
            />
          ) : (
            <span>
              {(item.authorDisplayName || item.authorUsername || "?")
                .slice(0, 2)
                .toUpperCase()}
            </span>
          )}
        </div>
        {item.authorId && !isSelf ? (
          <button
            className={`${styles.followBadge} ${
              following ? styles.followBadgeOn : styles.followBadgeOff
            }`}
            onClick={() => onFollow(item.authorId!, !following)}
            aria-label={following ? "Đang theo dõi" : "Theo dõi"}
          >
            {following ? (
              <span className={styles.tickIcon}>✓</span>
            ) : (
              <span className={styles.plusIcon}>+</span>
            )}
          </button>
        ) : null}
      </div>
      <button
        className={`${styles.actionBtn} ${
          item.liked ? styles.actionActive : ""
        }`}
        onClick={() => onLike(item.id, Boolean(item.liked))}
        aria-label="Like reel"
      >
        <span className={`${styles.actionBtnWrap}`}>
          <IconHeart filled={item.liked} />
        </span>
        <span>{formatCount(item.stats?.hearts)}</span>
      </button>
      <button
        className={styles.actionBtn}
        onClick={() => onComment(item.id)}
        aria-label="Open comments"
      >
        <span className={`${styles.actionBtnWrap}`}>
          <IconComment />
        </span>
        <span>{formatCount(item.stats?.comments)}</span>
      </button>
      <button
        className={`${styles.actionBtn} ${
          item.saved ? styles.actionActive : ""
        }`}
        onClick={() => onSave(item.id, Boolean(item.saved))}
        aria-label="Save reel"
      >
        <span className={`${styles.actionBtnWrap}`}>
          <IconSave filled={item.saved} />
        </span>
        <span>{formatCount(item.stats?.saves)}</span>
      </button>
      <button
        className={`${styles.actionBtn} ${
          item.reposted ? styles.actionActive : ""
        }`}
        onClick={() => onRepost(item.id, Boolean(item.reposted))}
        aria-label="Repost reel"
      >
        <span className={`${styles.actionBtnWrap}`}>
          <IconRepost filled={item.reposted} />
        </span>
        <span>{formatCount(item.stats?.reposts)}</span>
      </button>
    </div>
  );
}

export default function ReelPage() {
  const canRender = useRequireAuth();
  const router = useRouter();
  const params = useParams<{ id?: string | string[] }>();
  const pathname = usePathname();
  const requestedReelId = useMemo(() => {
    if (!params?.id) return undefined;
    return Array.isArray(params.id) ? params.id[0] : params.id;
  }, [params]);
  const [token, setToken] = useState<string | null>(null);
  const [viewerId, setViewerId] = useState<string | undefined>(() =>
    typeof window === "undefined"
      ? undefined
      : getUserIdFromToken(localStorage.getItem("accessToken"))
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [items, setItems] = useState<ReelItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [transition, setTransition] = useState<"next" | "prev" | null>(null);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentReelId, setCommentReelId] = useState<string | null>(null);
  const [commentsRender, setCommentsRender] = useState(false);
  const wheelLockRef = useRef(false);
  const commentPanelRef = useRef<HTMLElement | null>(null);
  const commentCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  useEffect(() => {
    if (!canRender) return;
    const stored = localStorage.getItem("accessToken");
    setToken(stored);
    setViewerId(getUserIdFromToken(stored));
  }, [canRender]);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    fetchReelsFeed({ token })
      .then((data) => {
        const nextItems = data || [];
        setItems(nextItems);
        const initialIndex = requestedReelId
          ? nextItems.findIndex((it) => it.id === requestedReelId)
          : 0;
        setActiveIndex(initialIndex >= 0 ? initialIndex : 0);
        setError("");
      })
      .catch((err) => setError(err?.message || "Không tải được danh sách reel"))
      .finally(() => setLoading(false));
  }, [token]);

  const updateItem = (id: string, patch: Partial<ReelItem>) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, ...patch } : it))
    );
  };

  const updateStats = (
    id: string,
    field: keyof NonNullable<FeedItem["stats"]>,
    delta: number
  ) => {
    setItems((prev) =>
      prev.map((it) =>
        it.id === id
          ? {
              ...it,
              stats: {
                ...it.stats,
                [field]: Math.max(0, (it.stats?.[field] ?? 0) + delta),
              },
            }
          : it
      )
    );
  };

  const syncStats = useCallback(
    (id: string, patch: Partial<NonNullable<FeedItem["stats"]>>) => {
      setItems((prev) =>
        prev.map((it) =>
          it.id === id
            ? {
                ...it,
                stats: {
                  ...it.stats,
                  ...patch,
                },
              }
            : it
        )
      );
    },
    []
  );

  const handleLike = async (id: string, liked: boolean) => {
    if (!token) return;
    updateItem(id, {
      liked: !liked,
      flags: {
        ...(items.find((x) => x.id === id)?.flags || {}),
        liked: !liked,
      },
    });
    updateStats(id, "hearts", liked ? -1 : 1);
    try {
      if (liked) await unlikePost({ token, postId: id });
      else await likePost({ token, postId: id });
    } catch (err) {
      updateItem(id, {
        liked,
        flags: { ...(items.find((x) => x.id === id)?.flags || {}), liked },
      });
      updateStats(id, "hearts", liked ? 1 : -1);
      setError(
        (err as { message?: string })?.message || "Không thể cập nhật like"
      );
    }
  };

  const handleSave = async (id: string, saved: boolean) => {
    if (!token) return;
    updateItem(id, {
      saved: !saved,
      flags: {
        ...(items.find((x) => x.id === id)?.flags || {}),
        saved: !saved,
      },
    });
    updateStats(id, "saves", saved ? -1 : 1);
    try {
      if (saved) await unsavePost({ token, postId: id });
      else await savePost({ token, postId: id });
    } catch (err) {
      updateItem(id, {
        saved,
        flags: { ...(items.find((x) => x.id === id)?.flags || {}), saved },
      });
      updateStats(id, "saves", saved ? 1 : -1);
      setError((err as { message?: string })?.message || "Không thể lưu reel");
    }
  };

  const handleRepost = async (id: string, reposted: boolean) => {
    if (!token) return;
    updateItem(id, {
      reposted: !reposted,
      flags: {
        ...(items.find((x) => x.id === id)?.flags || {}),
        reposted: !reposted,
      },
    });
    updateStats(id, "reposts", reposted ? -1 : 1);
    try {
      if (reposted) await unrepostPost({ token, postId: id });
      else await repostPost({ token, postId: id });
    } catch (err) {
      updateItem(id, {
        reposted,
        flags: { ...(items.find((x) => x.id === id)?.flags || {}), reposted },
      });
      updateStats(id, "reposts", reposted ? 1 : -1);
      setError((err as { message?: string })?.message || "Không thể repost");
    }
  };

  const handleViewed = (id: string, ms?: number) => {
    if (!token) return;
    viewPost({ token, postId: id, durationMs: ms }).catch(() => undefined);
  };

  const active = items[activeIndex];

  useEffect(() => {
    if (!transition) return;
    const id = setTimeout(() => setTransition(null), 420);
    return () => clearTimeout(id);
  }, [transition]);

  const goNext = () => {
    if (activeIndex + 1 < items.length) {
      setTransition("next");
      setActiveIndex(activeIndex + 1);
    }
  };

  const goPrev = () => {
    if (activeIndex - 1 >= 0) {
      setTransition("prev");
      setActiveIndex(activeIndex - 1);
    }
  };

  useEffect(() => {
    if (!requestedReelId || !items.length) return;
    const idx = items.findIndex((it) => it.id === requestedReelId);
    if (idx >= 0 && idx !== activeIndex) {
      setActiveIndex(idx);
    }
  }, [requestedReelId, items, activeIndex]);

  useEffect(() => {
    if (commentReelId && !items.some((it) => it.id === commentReelId)) {
      setCommentsOpen(false);
      setCommentReelId(null);
    }
  }, [commentReelId, items]);

  useEffect(() => {
    if (commentsOpen) {
      if (commentCloseTimerRef.current) {
        clearTimeout(commentCloseTimerRef.current);
        commentCloseTimerRef.current = null;
      }
      setCommentsRender(true);
      return;
    }

    commentCloseTimerRef.current = setTimeout(() => {
      setCommentsRender(false);
      setCommentReelId(null);
      commentCloseTimerRef.current = null;
    }, 260);

    return () => {
      if (commentCloseTimerRef.current) {
        clearTimeout(commentCloseTimerRef.current);
        commentCloseTimerRef.current = null;
      }
    };
  }, [commentsOpen]);

  useEffect(() => {
    const current = items[activeIndex];
    if (!commentsOpen || !current) return;
    setCommentReelId((prev) => (prev === current.id ? prev : current.id));
  }, [commentsOpen, items, activeIndex]);

  useEffect(() => {
    const current = items[activeIndex];
    if (!current) return;
    const target = `/reels/${current.id}`;
    if (pathname !== target) {
      router.replace(target);
    }
  }, [activeIndex, items, pathname, router]);

  useEffect(() => {
    if (!token) return;
    const reelId = active?.id;
    if (!reelId) return;
    let cancelled = false;
    let inFlight = false;

    const tick = async () => {
      if (cancelled || inFlight) return;
      if (
        typeof document !== "undefined" &&
        document.visibilityState !== "visible"
      ) {
        return;
      }

      inFlight = true;
      try {
        const detail = await fetchReelDetail({ token, reelId });
        if (cancelled || !detail) return;
        setItems((prev) =>
          prev.map((it) =>
            it.id === detail.id
              ? {
                  ...it,
                  ...detail,
                  stats: detail.stats ?? it.stats,
                  flags: detail.flags ?? it.flags,
                  liked: detail.liked ?? it.liked,
                  saved: detail.saved ?? it.saved,
                  reposted: detail.reposted ?? it.reposted,
                }
              : it
          )
        );
      } catch {
        /* silent */
      } finally {
        inFlight = false;
      }
    };

    const intervalId = setInterval(tick, REEL_STATS_POLL_INTERVAL);
    void tick();

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [active?.id, token]);

  const toggleComments = (id: string) => {
    if (commentsOpen && commentReelId === id) {
      setCommentsOpen(false);
      return;
    }
    setCommentsOpen(true);
    setCommentReelId(id);
  };

  const onFollow = async (authorId: string, nextFollow: boolean) => {
    if (!token || !authorId) return;
    setItems((prev) =>
      prev.map((p) =>
        p.authorId === authorId
          ? { ...p, flags: { ...p.flags, following: nextFollow } }
          : p
      )
    );
    try {
      if (nextFollow) await followUser({ token, userId: authorId });
      else await unfollowUser({ token, userId: authorId });
    } catch (err) {
      setItems((prev) =>
        prev.map((p) =>
          p.authorId === authorId
            ? { ...p, flags: { ...p.flags, following: !nextFollow } }
            : p
        )
      );
      setError(
        (err as { message?: string })?.message || "Không thể cập nhật follow"
      );
    }
  };

  const handleCommentTotal = useCallback(
    (reelId: string, total: number) => {
      syncStats(reelId, { comments: total });
    },
    [syncStats]
  );

  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (
        commentsOpen &&
        commentPanelRef.current &&
        (commentPanelRef.current.contains(e.target as Node) ||
          (typeof e.composedPath === "function" &&
            e.composedPath().includes(commentPanelRef.current)))
      ) {
        return;
      }
      if (wheelLockRef.current) return;
      if (Math.abs(e.deltaY) < 24) return;
      wheelLockRef.current = true;
      if (e.deltaY > 0) {
        goNext();
      } else {
        goPrev();
      }
      setTimeout(() => {
        wheelLockRef.current = false;
      }, 480);
    };
    window.addEventListener("wheel", onWheel, { passive: true });
    return () => window.removeEventListener("wheel", onWheel);
  }, [activeIndex, items.length, commentsOpen]);

  if (!canRender) return null;

  return (
    <div className={styles.page}>
      <div className={styles.rail}>
        {loading ? (
          <div className={styles.stateCard}>Loading reels...</div>
        ) : error ? (
          <div className={styles.stateCard}>{error}</div>
        ) : !active ? (
          <div className={styles.stateCard}>No reels yet.</div>
        ) : (
          <div className={styles.stageShell}>
            <div
              className={`${styles.stage} ${
                commentsRender ? styles.stageWithComments : ""
              } ${commentsOpen ? styles.stageShifted : ""}`}
            >
              <div className={styles.videoColumn}>
                <div
                  key={active.id}
                  className={`${styles.reelWrapper} ${
                    transition === "next"
                      ? styles.slideNext
                      : transition === "prev"
                      ? styles.slidePrev
                      : ""
                  }`}
                >
                  <ReelVideo
                    item={active}
                    autoplay
                    onViewed={(ms) => handleViewed(active.id, ms)}
                  />
                  <ReelActions
                    item={active}
                    onLike={handleLike}
                    onSave={handleSave}
                    onRepost={handleRepost}
                    onComment={toggleComments}
                    onFollow={onFollow}
                    viewerId={viewerId}
                  />
                </div>
              </div>
              <div className={styles.navColumn}>
                <button
                  className={styles.navBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    goPrev();
                  }}
                  disabled={activeIndex <= 0}
                  aria-label="Previous reel"
                >
                  <IconArrow up />
                </button>
                <button
                  className={styles.navBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    goNext();
                  }}
                  disabled={activeIndex >= items.length - 1}
                  aria-label="Next reel"
                >
                  <IconArrow />
                </button>
              </div>
              {commentsRender && commentReelId ? (
                <ReelComments
                  open={commentsOpen}
                  postId={commentReelId}
                  token={token}
                  panelRef={commentPanelRef}
                  viewerId={viewerId}
                  postAuthorId={active.authorId}
                  initialCount={active.stats?.comments}
                  onTotalChange={handleCommentTotal}
                  onClose={() => {
                    setCommentsOpen(false);
                  }}
                />
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
