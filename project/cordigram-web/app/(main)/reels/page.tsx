"use client";

import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import EmojiPicker from "emoji-picker-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  fetchReelsFeed,
  fetchReelDetail,
  fetchFeed,
  fetchUserPosts,
  likePost,
  unlikePost,
  savePost,
  unsavePost,
  repostPost,
  createPost,
  createReel,
  followUser,
  unfollowUser,
  viewPost,
  type FeedItem,
  reportPost,
  setPostAllowComments,
  setPostHideLikeCount,
  updatePostVisibility,
  updatePost,
  deletePost,
  searchProfiles,
  type ProfileSearchItem,
} from "@/lib/api";
import { useRequireAuth } from "@/hooks/use-require-auth";
import ReelComments from "./ReelComments";
import styles from "./reel.module.css";
import postStyles from "../post/post.module.css";
import feedStyles from "../home-feed.module.css";

const formatCount = (value?: number) => {
  const n = value ?? 0;
  if (n >= 1_000_000)
    return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return `${n}`;
};

const REEL_STATS_POLL_INTERVAL = 5000;
const VIEW_THRESHOLD = 0.5;
const VIEW_DWELL_MS = 2000;
const VIEW_COOLDOWN_MS = 5 * 60 * 1000;
const COMMENT_PANEL_WIDTH = "clamp(320px, 28vw, 420px)";

type ReelItem = FeedItem & { durationSeconds?: number };

const isRepostOfReel = (item: FeedItem): boolean => {
  const duration = (item as any)?.durationSeconds as number | undefined;
  const mediaIsVideo = item.media?.some((m) => m?.type === "video");
  return Boolean(
    item.repostOf &&
    (item.kind === "reel" || typeof duration === "number" || mediaIsVideo),
  );
};

const coerceReelKind = (item: ReelItem): ReelItem => {
  if (item.kind === "reel") return item;
  if (isRepostOfReel(item)) {
    return { ...item, kind: "reel" } as ReelItem;
  }
  return item;
};

type ReportCategory = {
  key:
    | "abuse"
    | "violence"
    | "sensitive"
    | "misinfo"
    | "spam"
    | "ip"
    | "illegal"
    | "privacy"
    | "other";
  label: string;
  accent: string;
  reasons: Array<{ key: string; label: string }>;
};

const REPORT_GROUPS: ReportCategory[] = [
  {
    key: "abuse",
    label: "Harassment / Hate speech",
    accent: "#f59e0b",
    reasons: [
      { key: "harassment", label: "Targets an individual to harass" },
      { key: "hate_speech", label: "Hate speech or discrimination" },
      { key: "offensive_discrimination", label: "Attacks vulnerable groups" },
    ],
  },
  {
    key: "violence",
    label: "Violence / Threats",
    accent: "#ef4444",
    reasons: [
      { key: "violence_threats", label: "Threatens or promotes violence" },
      { key: "graphic_violence", label: "Graphic violent imagery" },
      { key: "extremism", label: "Extremism or terrorism" },
      { key: "self_harm", label: "Self-harm or suicide" },
    ],
  },
  {
    key: "sensitive",
    label: "Sensitive content",
    accent: "#a855f7",
    reasons: [
      { key: "nudity", label: "Nudity or adult content" },
      { key: "minor_nudity", label: "Minor safety risk" },
      { key: "sexual_solicitation", label: "Sexual solicitation" },
    ],
  },
  {
    key: "misinfo",
    label: "Impersonation / Misinformation",
    accent: "#22c55e",
    reasons: [
      { key: "fake_news", label: "False or misleading information" },
      { key: "impersonation", label: "Impersonation of a person or org" },
    ],
  },
  {
    key: "spam",
    label: "Spam / Scam",
    accent: "#14b8a6",
    reasons: [
      { key: "spam", label: "Spam or irrelevant content" },
      { key: "financial_scam", label: "Financial scam" },
      { key: "unsolicited_ads", label: "Unwanted advertising" },
    ],
  },
  {
    key: "ip",
    label: "Intellectual property",
    accent: "#3b82f6",
    reasons: [
      { key: "copyright", label: "Copyright infringement" },
      { key: "trademark", label: "Trademark violation" },
      { key: "brand_impersonation", label: "Brand impersonation" },
    ],
  },
  {
    key: "illegal",
    label: "Illegal activity",
    accent: "#f97316",
    reasons: [
      { key: "contraband", label: "Contraband" },
      { key: "illegal_transaction", label: "Illegal transaction" },
    ],
  },
  {
    key: "privacy",
    label: "Privacy violation",
    accent: "#06b6d4",
    reasons: [
      { key: "doxxing", label: "Doxxing private information" },
      {
        key: "nonconsensual_intimate",
        label: "Non-consensual intimate content",
      },
    ],
  },
  {
    key: "other",
    label: "Other",
    accent: "#94a3b8",
    reasons: [{ key: "other", label: "Other reason" }],
  },
];

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

const normalizeHashtag = (value: string) =>
  value
    .replace(/^#/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "")
    .replace(/[^a-zA-Z0-9_]/g, "")
    .toLowerCase();

const cleanLocationLabel = (label: string) =>
  label
    .replace(/\b\d{4,6}\b/g, "")
    .replace(/,\s*,+/g, ", ")
    .replace(/\s{2,}/g, " ")
    .replace(/\s*,\s*$/g, "")
    .replace(/^\s*,\s*/g, "")
    .trim();

const extractMentionsFromCaption = (value: string) => {
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

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const QUOTE_CHAR_LIMIT = 500;
const REPOST_ANIMATION_MS = 200;

type ReelVideoProps = {
  item: ReelItem;
  autoplay: boolean;
  onViewed?: (msWatched?: number) => void;
  children?: React.ReactNode;
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

const IconRepost = () => (
  <svg aria-hidden width="26" height="26" viewBox="0 0 48 48" fill="none">
    <path
      fill="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      d="M21.68 3.18a2 2 0 0 1 2.14.32l21.5 19a2 2 0 0 1-.02 3.02l-21.5 18.5a2 2 0 0 1-3.3-1.52v-9.97c-5.68.28-11.95 1.75-16.09 5.88A2 2 0 0 1 1 37c0-11.68 7.7-21.05 19.5-21.94V5a2 2 0 0 1 1.18-1.82ZM24.5 30.5v7.64l16.46-14.16L24.5 9.44V17a2 2 0 0 1-2.05 2c-8.4-.21-15.62 5.34-17.09 13.66 4.47-2.7 9.8-3.87 14.98-4.13.68-.03 1.22-.04 1.6-.04 1.19 0 2.56.26 2.56 2.01Z"
    />
  </svg>
);

const IconReup = ({ size = 16 }: { size?: number }) => (
  <svg
    aria-hidden
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      stroke="none"
      strokeWidth={1}
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M4.5 3.88l4.432 4.14-1.364 1.46L5.5 7.55V16c0 1.1.896 2 2 2H13v2H7.5c-2.209 0-4-1.79-4-4V7.55L1.432 9.48.068 8.02 4.5 3.88zM16.5 6H11V4h5.5c2.209 0 4 1.79 4 4v8.45l2.068-1.93 1.364 1.46-4.432 4.14-4.432-4.14 1.364-1.46 2.068 1.93V8c0-1.1-.896-2-2-2z"
    />
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

function ReelVideo({ item, autoplay, onViewed, children }: ReelVideoProps) {
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
  }, [item.id, item.content, item.content?.length, item.hashtags?.length]);

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
      if (!viewSentRef.current && t * 1000 >= VIEW_DWELL_MS) {
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
      Math.max(0, (e.clientX - rect.left) / Math.max(rect.width, 1)),
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
  const hashtags = useMemo(() => item.hashtags ?? [], [item.hashtags]);
  const shellClass = [
    styles.videoShell,
    !isPlaying ? styles.videoShellPaused : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={shellClass} onClick={togglePlay}>
      {children}
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
          {item.repostOfAuthorUsername ? (
            <div className={styles.captionRepostBanner}>
              <span className={styles.captionRepostIcon}>
                <IconReup size={14} />
              </span>
              <span className={styles.captionRepostText}>
                Reposted from{" "}
                {item.repostOfAuthorId ? (
                  <Link
                    href={`/profile/${item.repostOfAuthorId}`}
                    className={styles.captionRepostLink}
                  >
                    @{item.repostOfAuthorUsername}
                  </Link>
                ) : (
                  <span className={styles.captionRepostLink}>
                    @{item.repostOfAuthorUsername}
                  </span>
                )}
              </span>
            </div>
          ) : null}
          {item.authorUsername ? (
            item.authorId ? (
              <Link
                href={`/profile/${item.authorId}`}
                className={`${styles.captionHandle} ${styles.captionHandleLink}`}
              >
                @{item.authorUsername}
              </Link>
            ) : (
              <div className={styles.captionHandle}>@{item.authorUsername}</div>
            )
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
            <Link
              key={tag}
              href={`/hashtag/${encodeURIComponent(tag)}`}
              className={styles.hashtagInline}
              onClick={(e) => e.stopPropagation()}
            >
              #{tag}
            </Link>
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
  onRepost: (id: string, reposted: boolean, anchor?: DOMRect | null) => void;
  onComment: (id: string) => void;
  onFollow: (authorId: string, nextFollow: boolean) => void;
  viewerId?: string;
}) {
  const following = Boolean(
    item.flags?.following ??
    (item as unknown as { following?: boolean }).following,
  );
  const isSelf = Boolean(viewerId && item.authorId === viewerId);
  const hideLikeCount =
    (item as any)?.hideLikeCount ??
    (item.flags as any)?.hideLikeCount ??
    (item as any)?.permissions?.hideLikeCount;
  const likeCountHidden = Boolean(hideLikeCount) && !isSelf;
  const likeCountLabel = likeCountHidden ? "" : formatCount(item.stats?.hearts);
  return (
    <div className={styles.actionBar}>
      <div className={styles.avatarShell}>
        {item.authorId ? (
          <Link
            href={`/profile/${item.authorId}`}
            className={styles.avatarWrap}
            aria-label="View author profile"
          >
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
          </Link>
        ) : (
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
        )}
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
        aria-label={likeCountHidden ? "Like reel (count hidden)" : "Like reel"}
      >
        <span className={`${styles.actionBtnWrap}`}>
          <IconHeart filled={item.liked} />
        </span>
        <span>{likeCountLabel}</span>
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
        onClick={(e) =>
          onRepost(
            item.id,
            Boolean(item.reposted),
            e.currentTarget.getBoundingClientRect(),
          )
        }
        aria-label="Repost reel"
      >
        <span className={`${styles.actionBtnWrap}`}>
          <IconRepost />
        </span>
        <span>{formatCount(item.stats?.reposts)}</span>
      </button>
    </div>
  );
}

export default function ReelPage() {
  const REELS_PAGE_SIZE = 10;
  const canRender = useRequireAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams<{ id?: string | string[] }>();
  const [viewerId, setViewerId] = useState<string | undefined>(() =>
    typeof window === "undefined"
      ? undefined
      : getUserIdFromToken(localStorage.getItem("accessToken")),
  );
  const requestedReelId = useMemo(() => {
    const fromPath = params?.id
      ? Array.isArray(params.id)
        ? params.id[0]
        : params.id
      : undefined;

    if (fromPath) return fromPath;

    if (typeof window !== "undefined" && viewerId) {
      try {
        const raw = localStorage.getItem("lastOwnedReelId");
        if (raw) {
          const parsed = JSON.parse(raw) as { id?: string; ownerId?: string };
          if (parsed?.id && parsed.ownerId === viewerId) return parsed.id;
        }
      } catch {
        /* ignore stored parse errors */
      }
    }

    return undefined;
  }, [params, viewerId]);
  const singleMode = useMemo(
    () => searchParams?.get("single") === "1",
    [searchParams],
  );
  const originReelId = useMemo(
    () => searchParams?.get("origin") || undefined,
    [searchParams],
  );
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string>("");
  const [items, setItems] = useState<ReelItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const activeIndexRef = useRef(0);
  const listRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const autoLoadLockRef = useRef(false);
  const visibleReelsRef = useRef<Set<string>>(new Set());
  const viewCooldownRef = useRef<Map<string, number>>(new Map());
  const [transition, setTransition] = useState<"next" | "prev" | null>(null);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentReelId, setCommentReelId] = useState<string | null>(null);
  const [commentsRender, setCommentsRender] = useState(false);
  const commentPanelRef = useRef<HTMLElement | null>(null);
  const commentCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const missingDetailRef = useRef<Set<string>>(new Set());
  const [openMoreMenuId, setOpenMoreMenuId] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportClosing, setReportClosing] = useState(false);
  const reportHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [reportCategory, setReportCategory] = useState<
    ReportCategory["key"] | null
  >(null);
  const [reportReason, setReportReason] = useState<string | null>(null);
  const [reportNote, setReportNote] = useState("");
  const [reportError, setReportError] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [repostTarget, setRepostTarget] = useState<{
    postId: string;
    label: string;
    kind: "reel" | "post";
  } | null>(null);
  const [repostMenuAnchor, setRepostMenuAnchor] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [repostMode, setRepostMode] = useState<"quote" | "repost" | null>(null);
  const [repostNote, setRepostNote] = useState("");
  const [quoteVisibility, setQuoteVisibility] = useState<
    "public" | "followers" | "private"
  >("public");
  const [quoteAllowComments, setQuoteAllowComments] = useState(true);
  const [quoteAllowDownload, setQuoteAllowDownload] = useState(true);
  const [quoteHideLikeCount, setQuoteHideLikeCount] = useState(false);
  const [quoteLocation, setQuoteLocation] = useState("");
  const [quoteHashtags, setQuoteHashtags] = useState<string[]>([]);
  const [quoteHashtagDraft, setQuoteHashtagDraft] = useState("");
  const [repostSubmitting, setRepostSubmitting] = useState(false);
  const [repostError, setRepostError] = useState("");
  const [repostClosing, setRepostClosing] = useState(false);
  const [visibilityModalOpen, setVisibilityModalOpen] = useState(false);
  const [visibilitySaving, setVisibilitySaving] = useState(false);
  const [visibilitySelected, setVisibilitySelected] = useState<
    "public" | "followers" | "private"
  >("public");
  const [visibilityError, setVisibilityError] = useState("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editCaption, setEditCaption] = useState("");
  const editCaptionRef = useRef<HTMLTextAreaElement | null>(null);
  const editEmojiRef = useRef<HTMLDivElement | null>(null);
  const [editEmojiOpen, setEditEmojiOpen] = useState(false);
  const [editHashtags, setEditHashtags] = useState<string[]>([]);
  const [hashtagDraft, setHashtagDraft] = useState("");
  const [editMentions, setEditMentions] = useState<string[]>([]);
  const [mentionDraft, setMentionDraft] = useState("");
  const [mentionSuggestions, setMentionSuggestions] = useState<
    ProfileSearchItem[]
  >([]);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionLoading, setMentionLoading] = useState(false);
  const [mentionError, setMentionError] = useState("");
  const [mentionHighlight, setMentionHighlight] = useState(-1);
  const [activeMentionRange, setActiveMentionRange] = useState<{
    start: number;
    end: number;
  } | null>(null);
  const [editLocation, setEditLocation] = useState("");
  const [locationQuery, setLocationQuery] = useState("");
  const [locationSuggestions, setLocationSuggestions] = useState<
    Array<{ label: string; lat: string; lon: string }>
  >([]);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [locationOpen, setLocationOpen] = useState(false);
  const [locationHighlight, setLocationHighlight] = useState(-1);
  const [editAllowComments, setEditAllowComments] = useState(true);
  const [editAllowDownload, setEditAllowDownload] = useState(false);
  const [editHideLikeCount, setEditHideLikeCount] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [editSuccess, setEditSuccess] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const repostHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!openMoreMenuId) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest(`[data-more-menu-id="${openMoreMenuId}"]`)) {
        setOpenMoreMenuId(null);
      }
    };

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [openMoreMenuId]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!editEmojiRef.current) return;
      if (!editEmojiRef.current.contains(event.target as Node)) {
        setEditEmojiOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setEditEmojiOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (reportHideTimerRef.current) clearTimeout(reportHideTimerRef.current);
      if (repostHideTimerRef.current) clearTimeout(repostHideTimerRef.current);
      if (commentCloseTimerRef.current)
        clearTimeout(commentCloseTimerRef.current);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!editOpen) return;
    const cleaned = mentionDraft.trim().replace(/^@/, "");
    if (!cleaned) {
      setMentionSuggestions([]);
      setMentionOpen(false);
      setMentionHighlight(-1);
      setMentionError("");
      return;
    }

    if (!token) {
      setMentionSuggestions([]);
      setMentionOpen(false);
      setMentionHighlight(-1);
      setMentionError("Sign in to mention users");
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setMentionLoading(true);
      setMentionError("");
      try {
        const res = await searchProfiles({
          token,
          query: cleaned,
          limit: 8,
        });
        if (cancelled) return;
        setMentionSuggestions(res.items);
        setMentionOpen(res.items.length > 0);
        setMentionHighlight(res.items.length ? 0 : -1);
        if (!res.items.length) {
          setMentionError("User not found");
        }
      } catch (err) {
        if (cancelled) return;
        setMentionSuggestions([]);
        setMentionOpen(false);
        setMentionHighlight(-1);
        setMentionError("User not found");
      } finally {
        if (!cancelled) setMentionLoading(false);
      }
    }, 320);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [editOpen, mentionDraft, token]);

  useEffect(() => {
    if (!editOpen) return;
    if (!locationQuery.trim()) {
      setLocationSuggestions([]);
      setLocationOpen(false);
      setLocationHighlight(-1);
      setLocationError("");
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLocationLoading(true);
      setLocationError("");
      try {
        const url = new URL("https://nominatim.openstreetmap.org/search");
        url.searchParams.set("q", locationQuery);
        url.searchParams.set("format", "jsonv2");
        url.searchParams.set("addressdetails", "1");
        url.searchParams.set("limit", "8");
        url.searchParams.set("countrycodes", "vn");
        const res = await fetch(url.toString(), {
          headers: {
            Accept: "application/json",
            "Accept-Language": "vi",
          },
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("search failed");
        const data = await res.json();
        const mapped = Array.isArray(data)
          ? data.map((item: any) => ({
              label: cleanLocationLabel(item.display_name as string),
              lat: item.lat as string,
              lon: item.lon as string,
            }))
          : [];
        setLocationSuggestions(mapped);
        setLocationOpen(true);
        setLocationHighlight(mapped.length ? 0 : -1);
      } catch (err) {
        if (controller.signal.aborted) return;
        setLocationSuggestions([]);
        setLocationOpen(false);
        setLocationHighlight(-1);
        setLocationError("No suggestions found, try different keywords.");
      } finally {
        if (!controller.signal.aborted) setLocationLoading(false);
      }
    }, 350);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [editOpen, locationQuery]);

  useEffect(() => {
    if (!canRender) return;
    const stored = localStorage.getItem("accessToken");
    setToken(stored);
    setViewerId(getUserIdFromToken(stored));
  }, [canRender]);

  const loadPage = useCallback(
    async (nextPage: number, opts?: { initial?: boolean }) => {
      if (!token) return;
      const isInitial = Boolean(opts?.initial);
      if (isInitial) setLoading(true);
      else setLoadingMore(true);

      try {
        const limit = nextPage * REELS_PAGE_SIZE;

        let base = ((await fetchReelsFeed({ token, limit })) || []).map(
          coerceReelKind,
        );
        let nextItems = [...base];
        let nextHasMore = base.length >= limit;

        // Bring in reposted reels that may only be delivered via main feed
        try {
          const repostCandidates = (
            (await fetchFeed({ token, limit: 40 })) || []
          )
            .filter(isRepostOfReel)
            .map(coerceReelKind);
          if (repostCandidates.length) {
            const seen = new Set(nextItems.map((it) => it.id));
            repostCandidates.forEach((it) => {
              if (!seen.has(it.id)) {
                seen.add(it.id);
                nextItems.push(it);
              }
            });
          }
        } catch {}

        if (!nextItems.length && viewerId) {
          const ownedBase = (
            (await fetchReelsFeed({
              token,
              authorId: viewerId,
              includeOwned: true,
              limit,
            })) || []
          ).map(coerceReelKind);
          nextHasMore = ownedBase.length >= limit;
          const owned = [...ownedBase];
          try {
            const repostOwned = (
              (await fetchUserPosts({ token, userId: viewerId, limit: 40 })) ||
              []
            )
              .filter(isRepostOfReel)
              .map(coerceReelKind);
            const seenOwned = new Set(owned.map((it) => it.id));
            repostOwned.forEach((it) => {
              if (!seenOwned.has(it.id)) {
                seenOwned.add(it.id);
                owned.push(it);
              }
            });
          } catch {}
          if (owned.length) nextItems = owned;
        }

        nextItems = nextItems.slice(0, limit);

        setItems(nextItems);
        setHasMore(nextHasMore);
        setPage(nextPage);

        if (isInitial) {
          const initialIndex = requestedReelId
            ? nextItems.findIndex((it) => it.id === requestedReelId)
            : 0;
          setActiveIndex(initialIndex >= 0 ? initialIndex : 0);
        }

        setError("");
      } catch (err) {
        setError(
          (err as { message?: string })?.message ||
            "Không tải được danh sách reel",
        );
      } finally {
        if (isInitial) setLoading(false);
        else setLoadingMore(false);
      }
    },
    [REELS_PAGE_SIZE, requestedReelId, token, viewerId],
  );

  const loadMore = useCallback(() => {
    if (!token) return;
    if (singleMode) return;
    if (loading || loadingMore) return;
    if (!hasMore) return;
    void loadPage(page + 1);
  }, [hasMore, loadPage, loading, loadingMore, page, singleMode, token]);

  useEffect(() => {
    if (!token) return;
    if (singleMode && requestedReelId) return;
    void loadPage(1, { initial: true });
  }, [loadPage, requestedReelId, singleMode, token, viewerId]);

  useEffect(() => {
    if (!loadingMore) autoLoadLockRef.current = false;
  }, [loadingMore]);

  useEffect(() => {
    const container = listRef.current;
    if (!container) return;
    if (singleMode) return;
    if (!items.length) return;
    if (!hasMore) return;
    if (loading || loadingMore) return;
    if (typeof IntersectionObserver === "undefined") return;

    const triggerIndex = Math.max(0, items.length - 2);
    const triggerItem = items[triggerIndex];
    const triggerEl = triggerItem ? itemRefs.current[triggerItem.id] : null;
    if (!triggerEl) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const isVisible = entries.some((entry) => entry.isIntersecting);
        if (!isVisible) return;
        if (autoLoadLockRef.current) return;
        autoLoadLockRef.current = true;
        loadMore();
      },
      {
        root: container,
        threshold: 0.6,
      },
    );

    observer.observe(triggerEl);
    return () => observer.disconnect();
  }, [hasMore, items, loadMore, loading, loadingMore, singleMode]);

  useEffect(() => {
    if (!singleMode || !token || !requestedReelId) return;
    let cancelled = false;
    setLoading(true);
    const load = async () => {
      try {
        const detail = await fetchReelDetail({
          token,
          reelId: requestedReelId,
        });
        if (cancelled || !detail) return;
        setItems([coerceReelKind(detail as ReelItem)]);
        setActiveIndex(0);
        setError("");
      } catch (err) {
        if (cancelled) return;
        if (originReelId && originReelId !== requestedReelId) {
          try {
            const fallback = await fetchReelDetail({
              token,
              reelId: originReelId,
            });
            if (cancelled || !fallback) return;
            setItems([coerceReelKind(fallback as ReelItem)]);
            setActiveIndex(0);
            setError("");
            return;
          } catch (fallbackErr) {
            setError(
              (fallbackErr as { message?: string })?.message ||
                (err as { message?: string })?.message ||
                "Không tải được reel",
            );
            return;
          }
        }
        setError(
          (err as { message?: string })?.message || "Không tải được reel",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [singleMode, token, requestedReelId, originReelId]);

  useEffect(() => {
    if (!token || !viewerId) return;
    const ownedPresent = items.some((it) => it.authorId === viewerId);
    if (ownedPresent) return;

    try {
      const raw = localStorage.getItem("lastOwnedReelId");
      if (!raw) return;
      const parsed = JSON.parse(raw) as { id?: string; ownerId?: string };
      if (!parsed?.id || parsed.ownerId !== viewerId) return;
      const reelId = parsed.id;
      if (items.some((it) => it.id === reelId)) return;
      if (missingDetailRef.current.has(reelId)) return;

      missingDetailRef.current.add(reelId);
      let cancelled = false;

      fetchReelDetail({ token, reelId })
        .then((detail) => {
          if (cancelled || !detail) return;
          setItems((prev) => {
            if (prev.some((it) => it.id === detail.id)) return prev;
            const next = [detail, ...prev];
            return next;
          });
          setActiveIndex((prev) => 0);
        })
        .catch(() => undefined);

      return () => {
        cancelled = true;
      };
    } catch {
      /* ignore storage parse errors */
    }
  }, [items, token, viewerId]);

  useEffect(() => {
    if (!token || !requestedReelId) return;
    if (items.some((it) => it.id === requestedReelId)) return;
    if (missingDetailRef.current.has(requestedReelId)) return;

    missingDetailRef.current.add(requestedReelId);
    let cancelled = false;

    fetchReelDetail({ token, reelId: requestedReelId })
      .then((detail) => {
        if (cancelled || !detail) return;
        setItems((prev) => {
          if (prev.some((it) => it.id === detail.id)) return prev;
          return [detail, ...prev];
        });
        setActiveIndex(0);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          (err as { message?: string })?.message || "Không tải được reel",
        );
      });

    return () => {
      cancelled = true;
    };
  }, [items, requestedReelId, token]);

  const updateItem = (id: string, patch: Partial<ReelItem>) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    );
  };

  const updateStats = (
    id: string,
    field: keyof NonNullable<FeedItem["stats"]>,
    delta: number,
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
          : it,
      ),
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
            : it,
        ),
      );
    },
    [],
  );

  const showToast = useCallback((message: string, duration = 1600) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMessage(message);
    toastTimerRef.current = setTimeout(() => setToastMessage(null), duration);
  }, []);

  const applyEditSeed = useCallback((seed?: ReelItem | null) => {
    const current = seed;
    const content = current?.content || "";

    setEditCaption(content);
    setEditHashtags(current?.hashtags || []);
    setHashtagDraft("");
    setEditMentions(current?.mentions || []);
    setMentionDraft("");
    setMentionSuggestions([]);
    setMentionOpen(false);
    setMentionLoading(false);
    setMentionError("");
    setMentionHighlight(-1);
    setActiveMentionRange(null);
    setEditLocation(current?.location || "");
    setLocationQuery(current?.location || "");
    setLocationSuggestions([]);
    setLocationOpen(false);
    setLocationLoading(false);
    setLocationError("");
    setLocationHighlight(-1);
    setEditAllowComments(current?.allowComments !== false);
    setEditAllowDownload(
      Boolean(
        (current as any)?.allowDownload ??
        (current as any)?.allowDownloads ??
        (current as any)?.flags?.allowDownload ??
        (current as any)?.permissions?.allowDownload,
      ),
    );
    setEditHideLikeCount(Boolean(current?.hideLikeCount));
    setEditError("");
    setEditSuccess("");
  }, []);

  const openEditModal = () => {
    if (!active) return;
    applyEditSeed(active);
    setEditOpen(true);
    setOpenMoreMenuId(null);
  };

  const closeEditModal = () => {
    if (editSaving) return;
    setEditOpen(false);
  };

  const handleCaptionChange = (
    event: React.ChangeEvent<HTMLTextAreaElement>,
  ) => {
    const value = event.target.value;
    const caret = event.target.selectionStart ?? value.length;
    setEditCaption(value);

    const activeMention = findActiveMention(value, caret);
    if (activeMention) {
      setActiveMentionRange({
        start: activeMention.start,
        end: activeMention.end,
      });
      setMentionDraft(activeMention.handle);
      setMentionOpen(true);
      setMentionError("");
      setMentionHighlight(0);
    } else {
      setActiveMentionRange(null);
      setMentionDraft("");
      setMentionSuggestions([]);
      setMentionOpen(false);
      setMentionHighlight(-1);
      setMentionError("");
    }
  };

  const insertEditEmoji = (emoji: string) => {
    const el = editCaptionRef.current;
    const caret = el?.selectionStart ?? editCaption.length;
    setEditCaption((prev) => {
      const value = prev || "";
      if (!el || typeof el.selectionStart !== "number") {
        return value + emoji;
      }
      const start = el.selectionStart;
      const end = el.selectionEnd ?? start;
      return value.slice(0, start) + emoji + value.slice(end);
    });

    setTimeout(() => {
      if (!el) return;
      const nextPos = caret + emoji.length;
      el.focus();
      el.setSelectionRange(nextPos, nextPos);
    }, 0);
  };

  const selectMention = (opt: ProfileSearchItem) => {
    const handle = opt.username.toLowerCase();
    const caption = editCaption || "";
    const range = activeMentionRange ?? {
      start: caption.length,
      end: caption.length,
    };
    const before = caption.slice(0, range.start);
    const after = caption.slice(range.end);
    const insertion = `@${handle}`;
    const needsSpaceAfter = after.startsWith(" ") || after === "" ? "" : " ";
    const nextCaption = `${before}${insertion}${needsSpaceAfter}${after}`;
    const nextMentions = editMentions.includes(handle)
      ? editMentions
      : [...editMentions, handle];
    setEditCaption(nextCaption);
    setEditMentions(nextMentions);
    setMentionOpen(false);
    setMentionHighlight(-1);
    setActiveMentionRange(null);
  };

  const onCaptionKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
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
    if (e.key === "Enter") {
      if (mentionSuggestions.length && mentionHighlight >= 0) {
        e.preventDefault();
        const opt = mentionSuggestions[mentionHighlight];
        if (opt) selectMention(opt);
      }
    }
    if (e.key === "Escape") {
      setMentionOpen(false);
      setMentionHighlight(-1);
      setActiveMentionRange(null);
    }
  };

  const addHashtag = () => {
    const cleaned = normalizeHashtag(hashtagDraft);
    if (!cleaned) {
      setHashtagDraft("");
      return;
    }
    if (editHashtags.includes(cleaned)) {
      setHashtagDraft("");
      return;
    }
    setEditHashtags((prev) => [...prev, cleaned]);
    setHashtagDraft("");
  };

  const removeHashtag = (tag: string) => {
    setEditHashtags((prev) => prev.filter((t) => t !== tag));
  };

  const pickLocation = (label: string) => {
    setEditLocation(label);
    setLocationQuery(label);
    setLocationOpen(false);
    setLocationSuggestions([]);
    setLocationHighlight(-1);
  };

  const onLocationKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!locationOpen) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setLocationHighlight((prev) =>
        prev + 1 < locationSuggestions.length ? prev + 1 : 0,
      );
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setLocationHighlight((prev) =>
        prev - 1 >= 0 ? prev - 1 : locationSuggestions.length - 1,
      );
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const chosen = locationSuggestions[locationHighlight];
      if (chosen) pickLocation(chosen.label);
    }
  };

  const handleEditSubmit = async (event?: React.FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    setEditError("");
    setEditSuccess("");

    if (!token || !active) {
      setEditError("Please sign in to edit reels");
      return;
    }

    const normalizedHashtags = Array.from(
      new Set(editHashtags.map((t) => normalizeHashtag(t.toString()))),
    ).filter(Boolean);

    const normalizedMentions = Array.from(
      new Set(
        [
          ...extractMentionsFromCaption(editCaption || ""),
          ...editMentions.map((t) =>
            t.toString().trim().replace(/^@/, "").toLowerCase(),
          ),
        ].filter(Boolean),
      ),
    );

    const trimmedLocation = editLocation.trim();

    const payload = {
      content: editCaption || "",
      hashtags: normalizedHashtags,
      mentions: normalizedMentions,
      location: trimmedLocation || undefined,
      allowComments: editAllowComments,
      allowDownload: editAllowDownload,
      hideLikeCount: editHideLikeCount,
    } as const;

    try {
      setEditSaving(true);
      const updated = await updatePost({
        token,
        postId: active.id,
        payload,
      });
      setItems((prev) =>
        prev.map((it) => (it.id === active.id ? { ...it, ...updated } : it)),
      );
      setEditSuccess("Reel updated");
      setEditOpen(false);
      showToast("Reel updated");
    } catch (err: any) {
      const message =
        (err && typeof err === "object" && "message" in err
          ? (err as { message?: string }).message
          : null) || "Failed to update reel";
      setEditError(message);
    } finally {
      setEditSaving(false);
    }
  };

  const closeDeleteConfirm = () => {
    if (deleteSubmitting) return;
    setDeleteConfirmOpen(false);
  };

  const confirmDelete = async () => {
    if (!token || !active) {
      setDeleteError("Please sign in to delete reels");
      return;
    }
    setDeleteSubmitting(true);
    setDeleteError("");
    const targetId = active.id;
    try {
      await deletePost({ token, postId: targetId });
      missingDetailRef.current.add(targetId);
      let nextTargetId: string | null = null;
      setItems((prev) => {
        const idx = prev.findIndex((it) => it.id === targetId);
        const next = prev.filter((it) => it.id !== targetId);
        const plannedIndex =
          next.length === 0
            ? 0
            : Math.max(
                0,
                Math.min(idx === -1 ? activeIndex : idx, next.length - 1),
              );
        nextTargetId = next[plannedIndex]?.id ?? null;
        setActiveIndex(plannedIndex);
        return next;
      });
      setCommentsOpen(false);
      setDeleteConfirmOpen(false);
      if (nextTargetId) {
        router.push(`/reels/${nextTargetId}`);
      } else {
        router.push(`/reels`);
      }
      showToast("Deleted reel");
    } catch (err: any) {
      const message =
        (err && typeof err === "object" && "message" in err
          ? (err as { message?: string }).message
          : null) || "Failed to delete reel";
      setDeleteError(message);
    } finally {
      setDeleteSubmitting(false);
    }
  };

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
        (err as { message?: string })?.message || "Không thể cập nhật like",
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

  const incrementRepostStat = useCallback((postId: string) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== postId) return it;
        const currentShares = it.stats?.reposts ?? it.stats?.shares ?? 0;
        const nextShares = currentShares + 1;
        return {
          ...it,
          stats: {
            ...it.stats,
            shares: nextShares,
            reposts: nextShares,
          },
          reposted: true,
          flags: { ...(it.flags || {}), reposted: true },
        };
      }),
    );
  }, []);

  const openRepostMenuForItem = (
    postId: string,
    label: string,
    kind: "reel" | "post",
    anchor?: DOMRect | null,
  ) => {
    if (!token) {
      showToast("Sign in to repost");
      return;
    }
    if (repostHideTimerRef.current) clearTimeout(repostHideTimerRef.current);
    setRepostClosing(false);
    setRepostTarget({ postId, label, kind });
    resetQuoteState();
    setQuoteOpen(false);
    if (anchor) {
      setRepostMenuAnchor({
        x: anchor.left + anchor.width / 2,
        y: anchor.bottom,
      });
    } else {
      setRepostMenuAnchor(
        typeof window !== "undefined"
          ? { x: window.innerWidth / 2, y: window.innerHeight / 2 }
          : null,
      );
    }
  };

  const closeRepostModal = () => {
    if (repostHideTimerRef.current) clearTimeout(repostHideTimerRef.current);
    setRepostClosing(true);
    repostHideTimerRef.current = setTimeout(() => {
      setRepostTarget(null);
      resetQuoteState();
      setRepostClosing(false);
    }, REPOST_ANIMATION_MS);
  };

  const closeRepostMenu = () => {
    setRepostMenuAnchor(null);
  };

  const handleQuickRepost = () => {
    if (!repostTarget) return;
    setRepostMode("repost");
    closeRepostMenu();
    void submitRepost("repost");
  };

  const openQuoteComposer = () => {
    if (!repostTarget) return;
    setRepostMode("quote");
    setQuoteOpen(true);
    setRepostError("");
    closeRepostMenu();
  };

  const submitRepost = async (modeOverride?: "quote" | "repost") => {
    const mode = modeOverride ?? repostMode;
    if (!token || !repostTarget || !mode) {
      setRepostError("Choose an option to continue");
      return;
    }
    const originalId = resolveOriginalPostId(repostTarget.postId);
    const targetId = repostTarget.postId;
    setRepostSubmitting(true);
    setRepostError("");
    try {
      if (mode === "repost") {
        await createPost({ token, payload: { repostOf: originalId } });
        incrementRepostStat(originalId);
        if (originalId !== targetId) {
          incrementRepostStat(targetId);
          try {
            await repostPost({ token, postId: targetId });
          } catch {}
        }
        showToast("Reposted");
        closeRepostModal();
        return;
      }

      const note = repostNote.trim();
      const mentions = extractMentionsFromCaption(note);
      const payload = {
        repostOf: originalId,
        content: note || undefined,
        hashtags: quoteHashtags.length ? quoteHashtags : undefined,
        location: quoteLocation.trim() || undefined,
        allowComments: quoteAllowComments,
        allowDownload: quoteAllowDownload,
        hideLikeCount: quoteHideLikeCount,
        visibility: quoteVisibility,
        mentions: mentions.length ? mentions : undefined,
      } as const;

      if (repostTarget.kind === "reel") {
        await createReel({ token, payload: payload as any });
      } else {
        await createPost({ token, payload: payload as any });
      }

      incrementRepostStat(originalId);
      if (originalId !== targetId) {
        incrementRepostStat(targetId);
        try {
          await repostPost({ token, postId: targetId });
        } catch {}
      }
      showToast("Reposted with quote");
      closeRepostModal();
    } catch (err) {
      const message =
        typeof err === "object" && err && "message" in err
          ? String((err as { message?: string }).message)
          : "Could not repost";
      setRepostError(message || "Could not repost");
    } finally {
      setRepostSubmitting(false);
    }
  };

  const handleRepost = (
    id: string,
    _reposted: boolean,
    anchor?: DOMRect | null,
  ) => {
    const target = items.find((x) => x.id === id);
    if (!target) return;
    const label =
      target.authorUsername ||
      target.authorDisplayName ||
      target.authorId ||
      "creator";
    const kind = (target as any)?.kind === "post" ? "post" : "reel";
    openRepostMenuForItem(id, label, kind, anchor);
  };

  const handleViewed = (id: string, ms?: number) => {
    if (!token) return;
    if (!visibleReelsRef.current.has(id)) return;

    const now = Date.now();
    const last = viewCooldownRef.current.get(id) ?? 0;
    if (now - last < VIEW_COOLDOWN_MS) return;

    viewPost({ token, postId: id, durationMs: ms })
      .then(() => {
        viewCooldownRef.current.set(id, Date.now());
      })
      .catch(() => undefined);
  };

  const active = items[activeIndex];
  const isAuthor = useMemo(
    () => Boolean(active?.authorId && viewerId && active.authorId === viewerId),
    [active?.authorId, viewerId],
  );

  const selectedReportGroup = useMemo(
    () => REPORT_GROUPS.find((g) => g.key === reportCategory),
    [reportCategory],
  );

  const repostMenuStyle = useMemo(() => {
    if (!repostMenuAnchor || typeof window === "undefined") return null;
    const width = 240;
    const height = 132;
    const margin = 12;
    const left = clamp(
      repostMenuAnchor.x - width / 2,
      margin,
      window.innerWidth - width - margin,
    );
    const top = clamp(
      repostMenuAnchor.y + 10,
      margin,
      window.innerHeight - height - margin,
    );
    return { left, top, width };
  }, [repostMenuAnchor]);

  const quoteVisibilityOptions = useMemo(
    () => [
      {
        value: "public" as const,
        title: "Public",
        description: "Anyone can view this repost",
      },
      {
        value: "followers" as const,
        title: "Followers",
        description: "Only followers can view this repost",
      },
      {
        value: "private" as const,
        title: "Private",
        description: "Only you can view this repost",
      },
    ],
    [],
  );

  const resolveOriginalPostId = useCallback(
    (postId: string) => {
      const target = items.find((it) => it.id === postId);
      return (target as any)?.repostOf || postId;
    },
    [items],
  );

  const resetQuoteState = useCallback(() => {
    setRepostMode(null);
    setRepostNote("");
    setQuoteVisibility("public");
    setQuoteAllowComments(true);
    setQuoteAllowDownload(true);
    setQuoteHideLikeCount(false);
    setQuoteLocation("");
    setQuoteHashtags([]);
    setQuoteHashtagDraft("");
    setRepostError("");
    setRepostSubmitting(false);
    setQuoteOpen(false);
    setRepostMenuAnchor(null);
  }, []);

  const addQuoteHashtag = useCallback(() => {
    const clean = normalizeHashtag(quoteHashtagDraft);
    if (!clean) return;
    setQuoteHashtags((prev) =>
      prev.includes(clean) ? prev : [...prev, clean].slice(0, 12),
    );
    setQuoteHashtagDraft("");
  }, [quoteHashtagDraft]);

  const removeQuoteHashtag = useCallback((tag: string) => {
    setQuoteHashtags((prev) => prev.filter((item) => item !== tag));
  }, []);

  const commentsToggleLabel =
    active?.allowComments === false ? "Turn on comments" : "Turn off comments";

  const hideLikeToggleLabel = active?.hideLikeCount
    ? "Show like count"
    : "Hide like count";

  const allowDownloads = useMemo(
    () =>
      Boolean(
        active &&
        ((active as any)?.allowDownloads ??
          (active as any)?.allowDownload ??
          (active as any)?.flags?.allowDownloads ??
          (active as any)?.flags?.allowDownload ??
          (active as any)?.permissions?.allowDownloads ??
          (active as any)?.permissions?.allowDownload),
      ),
    [active],
  );

  const activeFollowing = Boolean(
    active?.flags?.following ?? (active as any)?.following,
  );

  const activeSaved = Boolean(active?.flags?.saved ?? active?.saved);

  useEffect(() => {
    if (!editOpen) return;
    applyEditSeed(active);
  }, [active, applyEditSeed, editOpen]);

  useEffect(() => {
    if (!active) return;
    const nextVisibility =
      ((active as any)?.visibility as "public" | "followers" | "private") ||
      "public";
    setVisibilitySelected(nextVisibility);
  }, [active]);

  useEffect(() => {
    setOpenMoreMenuId(null);
  }, [active?.id]);

  useEffect(() => {
    if (!transition) return;
    const id = setTimeout(() => {
      setTransition(null);
      transitionRef.current = null;
      // Force update state after transition ends
      computeNearestRef.current?.();
    }, 600);
    return () => clearTimeout(id);
  }, [transition]);

  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  const goNext = () => {
    const nextIndex = Math.min(items.length - 1, activeIndex + 1);
    if (nextIndex <= activeIndex) return;
    const target = items[nextIndex];
    const el = target ? itemRefs.current[target.id] : null;
    const container = listRef.current;

    transitionRef.current = "next";

    // Manually apply noSnap class immediately to prevent snap fighting
    if (container && styles.noSnap) {
      container.classList.add(styles.noSnap);
    }

    setTransition("next");
    if (el && container) {
      const targetTop = el.offsetTop;
      container.scrollTo({ top: targetTop, behavior: "smooth" });
    } else if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      setActiveIndex(nextIndex);
    }
  };

  const goPrev = () => {
    const nextIndex = Math.max(0, activeIndex - 1);
    if (nextIndex >= activeIndex) return;
    const target = items[nextIndex];
    const el = target ? itemRefs.current[target.id] : null;
    const container = listRef.current;

    transitionRef.current = "prev";

    // Manually apply noSnap class immediately to prevent snap fighting
    if (container && styles.noSnap) {
      container.classList.add(styles.noSnap);
    }

    setTransition("prev");
    if (el && container) {
      // Use element offset relative to the scroll container to avoid layout transforms and page offsets
      const targetTop = el.offsetTop;
      container.scrollTo({ top: targetTop, behavior: "smooth" });
    } else if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      setActiveIndex(nextIndex);
    }
  };

  const initialSyncRef = useRef<string | null>(null);

  useEffect(() => {
    if (!items.length) return;

    const currentRequested = requestedReelId ?? null;
    const hasSyncedForCurrentRequest =
      initialSyncRef.current === currentRequested;

    if (hasSyncedForCurrentRequest) return;

    const idx = currentRequested
      ? items.findIndex((it) => it.id === currentRequested)
      : 0;

    if (idx >= 0) {
      setActiveIndex(idx);
      activeIndexRef.current = idx;
      initialSyncRef.current = currentRequested;
    }
  }, [requestedReelId, items]);

  const scrollRafRef = useRef<number | null>(null);
  const scrollTickingRef = useRef(false);
  const urlSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSyncedIdRef = useRef<string | null>(null);

  const lastSyncedPathRef = useRef<string | null>(null);
  const transitionRef = useRef<"next" | "prev" | null>(null);
  const computeNearestRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const container = listRef.current;
    if (!container || !items.length) return;

    const computeNearest = () => {
      if (transitionRef.current) return;
      if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
      scrollRafRef.current = requestAnimationFrame(() => {
        const rect = container.getBoundingClientRect();
        const centerY = rect.top + rect.height / 2;

        let bestIdx = activeIndexRef.current;
        let bestDist = Number.POSITIVE_INFINITY;

        items.forEach((it, idx) => {
          const el = itemRefs.current[it.id];
          if (!el) return;
          const b = el.getBoundingClientRect();
          const itemCenter = (b.top + b.bottom) / 2;
          const dist = Math.abs(itemCenter - centerY);
          if (dist < bestDist) {
            bestDist = dist;
            bestIdx = idx;
          }
        });

        if (bestIdx !== activeIndexRef.current) {
          activeIndexRef.current = bestIdx;
          setActiveIndex(bestIdx);
        }
      });
    };

    computeNearestRef.current = computeNearest;

    const handleScroll = () => {
      if (scrollTickingRef.current) return;
      scrollTickingRef.current = true;
      scrollRafRef.current = requestAnimationFrame(() => {
        scrollTickingRef.current = false;
        computeNearest();
      });
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    computeNearest();

    return () => {
      if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
      container.removeEventListener("scroll", handleScroll);
      scrollTickingRef.current = false;
    };
  }, [items]);

  useEffect(() => {
    const container = listRef.current;
    if (!container || !items.length) return;
    if (typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const target = entry.target as HTMLElement;
          const id = target?.dataset?.reelId;
          if (!id) return;

          if (
            entry.isIntersecting &&
            entry.intersectionRatio >= VIEW_THRESHOLD
          ) {
            visibleReelsRef.current.add(id);
          } else {
            visibleReelsRef.current.delete(id);
          }
        });
      },
      { root: container, threshold: [VIEW_THRESHOLD] },
    );

    items.forEach((it) => {
      const el = itemRefs.current[it.id];
      if (el) observer.observe(el);
    });

    return () => {
      visibleReelsRef.current.clear();
      observer.disconnect();
    };
  }, [items]);

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

  const currentReelId = items[activeIndex]?.id;

  useEffect(() => {
    if (!currentReelId) return;
    if (singleMode) return;

    if (urlSyncTimerRef.current) clearTimeout(urlSyncTimerRef.current);
    urlSyncTimerRef.current = setTimeout(() => {
      const target = `/reels/${currentReelId}`;
      if (lastSyncedIdRef.current === currentReelId) return;
      lastSyncedIdRef.current = currentReelId;

      if (typeof window === "undefined") return;
      if (lastSyncedPathRef.current === target) return;
      if (window.location.pathname === target) {
        lastSyncedPathRef.current = target;
        return;
      }

      window.history.replaceState({}, "", target);
      lastSyncedPathRef.current = target;
    }, 200);

    return () => {
      if (urlSyncTimerRef.current) clearTimeout(urlSyncTimerRef.current);
    };
  }, [currentReelId, singleMode]);

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
              : it,
          ),
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

  const copyLink = async () => {
    if (!active) return;
    try {
      const origin =
        typeof window !== "undefined" ? window.location.origin : "";
      const permalink = `${origin}/reels/${active.id}`;

      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(permalink);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = permalink;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }

      setOpenMoreMenuId(null);
      showToast("Link copied to clipboard");
    } catch (err) {
      setOpenMoreMenuId(null);
      showToast("Failed to copy link");
    }
  };

  const toggleAllowComments = async () => {
    if (!token || !active) return;
    const currentAllowed = active.allowComments !== false;
    const nextAllowed = !currentAllowed;
    updateItem(active.id, { allowComments: nextAllowed });
    setOpenMoreMenuId(null);
    try {
      await setPostAllowComments({
        token,
        postId: active.id,
        allowComments: nextAllowed,
      });
      showToast(nextAllowed ? "Comments turned on" : "Comments turned off");
    } catch (err) {
      updateItem(active.id, { allowComments: currentAllowed });
      showToast("Failed to update comments");
    }
  };

  const toggleHideLikeCount = async () => {
    if (!token || !active) return;
    const currentHidden = Boolean(active.hideLikeCount);
    const nextHidden = !currentHidden;
    updateItem(active.id, { hideLikeCount: nextHidden });
    setOpenMoreMenuId(null);
    try {
      await setPostHideLikeCount({
        token,
        postId: active.id,
        hideLikeCount: nextHidden,
      });
      showToast(nextHidden ? "Like count hidden" : "Like count visible");
    } catch (err) {
      updateItem(active.id, { hideLikeCount: currentHidden });
      showToast("Failed to update like count");
    }
  };

  const visibilityOptions: Array<{
    value: "public" | "followers" | "private";
    title: string;
    description: string;
  }> = [
    {
      value: "public",
      title: "Public",
      description: "Anyone can view this reel",
    },
    {
      value: "followers",
      title: "Friends / Following",
      description: "Only followers can view this reel",
    },
    {
      value: "private",
      title: "Private",
      description: "Only you can view this reel",
    },
  ];

  const openVisibilityModal = () => {
    if (!active) return;
    const currentVisibility =
      ((active as any)?.visibility as "public" | "followers" | "private") ||
      "public";
    setVisibilitySelected(currentVisibility);
    setVisibilityError("");
    setOpenMoreMenuId(null);
    setVisibilityModalOpen(true);
  };

  const closeVisibilityModal = () => {
    if (visibilitySaving) return;
    setVisibilityModalOpen(false);
  };

  const submitVisibilityUpdate = async () => {
    if (!token || !active) {
      setVisibilityError("Please sign in to update visibility");
      return;
    }

    const currentVisibility =
      ((active as any)?.visibility as "public" | "followers" | "private") ||
      "public";

    if (visibilitySelected === currentVisibility) {
      setVisibilityModalOpen(false);
      return;
    }

    setVisibilitySaving(true);
    setVisibilityError("");
    try {
      const res = await updatePostVisibility({
        token,
        postId: active.id,
        visibility: visibilitySelected,
      });
      updateItem(active.id, { visibility: res.visibility as any });
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(
            "lastOwnedReelId",
            JSON.stringify({ id: active.id, ownerId: active.authorId }),
          );
        } catch {
          /* ignore storage errors */
        }
      }
      setVisibilityModalOpen(false);
      showToast("Visibility updated");
    } catch (err) {
      const message =
        typeof err === "object" && err && "message" in err
          ? (err as { message?: string }).message || "Failed to update"
          : "Failed to update";
      setVisibilityError(message);
    } finally {
      setVisibilitySaving(false);
    }
  };

  const openReportModal = () => {
    if (!token) return;
    if (reportHideTimerRef.current) clearTimeout(reportHideTimerRef.current);
    setReportClosing(false);
    setReportOpen(true);
    setReportCategory(null);
    setReportReason(null);
    setReportNote("");
    setReportError("");
    setReportSubmitting(false);
  };

  const closeReportModal = () => {
    if (reportHideTimerRef.current) clearTimeout(reportHideTimerRef.current);
    setReportClosing(true);
    reportHideTimerRef.current = setTimeout(() => {
      setReportOpen(false);
      setReportCategory(null);
      setReportReason(null);
      setReportNote("");
      setReportError("");
      setReportSubmitting(false);
      setReportClosing(false);
    }, 200);
  };

  const submitReport = async () => {
    if (!token || !active || !reportCategory || !reportReason) return;
    setReportSubmitting(true);
    setReportError("");
    try {
      await reportPost({
        token,
        postId: active.id,
        category: reportCategory,
        reason: reportReason,
        note: reportNote.trim() || undefined,
      });
      closeReportModal();
      showToast("Report submitted");
    } catch (err) {
      const message =
        typeof err === "object" && err && "message" in err
          ? (err as { message?: string }).message || "Could not submit report"
          : "Could not submit report";
      setReportError(message);
    } finally {
      setReportSubmitting(false);
    }
  };

  const handleDownloadCurrentMedia = async () => {
    const media = active?.media ?? [];
    const current = media[0];
    if (!current?.url) return;
    try {
      const sameOrigin =
        typeof window !== "undefined" &&
        current.url?.startsWith(window.location.origin);

      const res = await fetch(current.url, {
        credentials: sameOrigin ? "include" : "omit",
        mode: "cors",
      });
      if (!res.ok) throw new Error(`Download failed (${res.status})`);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);

      const link = document.createElement("a");
      const fallbackName =
        (current.metadata as { filename?: string } | undefined)?.filename ||
        "reel";
      const nameFromUrl = current.url?.split("/").pop()?.split("?")[0];
      link.href = objectUrl;
      link.download = fallbackName || nameFromUrl || "reel";

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(objectUrl);

      setOpenMoreMenuId(null);
      showToast("Download started");
    } catch (err) {
      setOpenMoreMenuId(null);
      showToast("Failed to download");
    }
  };

  const handleEditPost = () => {
    if (!active) return;
    openEditModal();
  };

  const handleMuteNotifications = () => {
    setOpenMoreMenuId(null);
    showToast("Notifications muted for this reel");
  };

  const handleDeletePost = () => {
    if (!active) return;
    setDeleteError("");
    setOpenMoreMenuId(null);
    setDeleteConfirmOpen(true);
  };

  const handleSaveFromMenu = () => {
    if (!active) return;
    handleSave(active.id, Boolean(activeSaved));
    setOpenMoreMenuId(null);
  };

  const handleFollowFromMenu = () => {
    if (!active?.authorId) return;
    const currentFollowing = Boolean(
      active.flags?.following ?? (active as any)?.following,
    );
    onFollow(active.authorId, !currentFollowing);
    setOpenMoreMenuId(null);
  };

  const handleReportFromMenu = () => {
    setOpenMoreMenuId(null);
    openReportModal();
  };

  const handleGoProfile = () => {
    if (!active?.authorId) return;
    const target = `/profile/${active.authorId}`;
    setOpenMoreMenuId(null);
    router.push(target);
  };

  const handleGoReel = () => {
    const targetId = active?.repostOf || active?.id;
    if (!targetId) return;
    const target = `/reels/${targetId}?single=1`;
    setOpenMoreMenuId(null);
    router.push(target);
  };

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
          : p,
      ),
    );
    try {
      if (nextFollow) await followUser({ token, userId: authorId });
      else await unfollowUser({ token, userId: authorId });
    } catch (err) {
      setItems((prev) =>
        prev.map((p) =>
          p.authorId === authorId
            ? { ...p, flags: { ...p.flags, following: !nextFollow } }
            : p,
        ),
      );
      setError(
        (err as { message?: string })?.message || "Không thể cập nhật follow",
      );
    }
  };

  const handleCommentTotal = useCallback(
    (reelId: string, total: number) => {
      syncStats(reelId, { comments: total });
    },
    [syncStats],
  );

  const commentTarget = useMemo(
    () => items.find((it) => it.id === commentReelId),
    [commentReelId, items],
  );

  const showComments = commentsRender && commentReelId;

  const commentDockStyle = useMemo(
    () =>
      ({
        "--sidebar-width": COMMENT_PANEL_WIDTH,
        width: COMMENT_PANEL_WIDTH,
        maxWidth: COMMENT_PANEL_WIDTH,
        minWidth: COMMENT_PANEL_WIDTH,
      }) as React.CSSProperties,
    [],
  );

  if (!canRender) return null;

  return (
    <>
      <div className={styles.page}>
        <div className={styles.rail}>
          {loading ? (
            <div className={styles.stateCard}>Loading reels...</div>
          ) : error ? (
            <div className={styles.stateCard}>{error}</div>
          ) : !items.length ? (
            <div className={styles.stateCard}>No reels yet.</div>
          ) : (
            <div className={styles.stageShell}>
              <div
                className={`${styles.feedScroll} ${
                  transition ? styles.noSnap : ""
                }`}
                ref={listRef}
              >
                {items.map((item) => {
                  const isActive = active?.id === item.id;
                  return (
                    <div
                      key={item.id}
                      ref={(el) => {
                        itemRefs.current[item.id] = el;
                      }}
                      data-reel-id={item.id}
                      className={styles.feedItem}
                    >
                      <div
                        className={`${styles.stage} ${
                          !isActive ? styles.stageInactive : ""
                        }`}
                      >
                        <div className={styles.videoColumn}>
                          <div
                            className={`${styles.reelWrapper} ${
                              transition === "next" && isActive
                                ? styles.slideNext
                                : transition === "prev" && isActive
                                  ? styles.slidePrev
                                  : ""
                            }`}
                          >
                            <ReelVideo
                              item={item}
                              autoplay={isActive}
                              onViewed={(ms) => handleViewed(item.id, ms)}
                            >
                              <div
                                className={`${styles.moreMenuWrap} ${
                                  openMoreMenuId === item.id
                                    ? styles.moreMenuWrapVisible
                                    : ""
                                }`}
                                style={{
                                  opacity: isActive ? undefined : 0,
                                  pointerEvents: isActive ? undefined : "none",
                                }}
                                data-more-menu-id={item.id}
                              >
                                <button
                                  type="button"
                                  className={styles.moreBtn}
                                  aria-haspopup="true"
                                  aria-expanded={openMoreMenuId === item.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setOpenMoreMenuId((prev) =>
                                      prev === item.id ? null : item.id,
                                    );
                                  }}
                                >
                                  <svg
                                    aria-hidden="true"
                                    width="22"
                                    height="22"
                                    viewBox="0 0 24 24"
                                    fill="currentColor"
                                  >
                                    <circle cx="5" cy="12" r="1.5" />
                                    <circle cx="12" cy="12" r="1.5" />
                                    <circle cx="19" cy="12" r="1.5" />
                                  </svg>
                                </button>
                                {openMoreMenuId === item.id ? (
                                  <div className={styles.moreMenu} role="menu">
                                    {isAuthor ? (
                                      <>
                                        <button
                                          type="button"
                                          className={styles.moreMenuItem}
                                          role="menuitem"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleEditPost();
                                          }}
                                        >
                                          Edit Reel
                                        </button>
                                        <button
                                          type="button"
                                          className={styles.moreMenuItem}
                                          role="menuitem"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            openVisibilityModal();
                                          }}
                                        >
                                          Edit visibility
                                        </button>
                                        <button
                                          type="button"
                                          className={styles.moreMenuItem}
                                          role="menuitem"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleMuteNotifications();
                                          }}
                                        >
                                          Mute notifications
                                        </button>
                                        <button
                                          type="button"
                                          className={styles.moreMenuItem}
                                          role="menuitem"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            toggleAllowComments();
                                          }}
                                        >
                                          {commentsToggleLabel}
                                        </button>
                                        <button
                                          type="button"
                                          className={styles.moreMenuItem}
                                          role="menuitem"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            toggleHideLikeCount();
                                          }}
                                        >
                                          {hideLikeToggleLabel}
                                        </button>
                                        <button
                                          type="button"
                                          className={styles.moreMenuItem}
                                          role="menuitem"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            copyLink();
                                          }}
                                        >
                                          Copy link
                                        </button>
                                        {item.repostOf ? (
                                          <button
                                            type="button"
                                            className={styles.moreMenuItem}
                                            role="menuitem"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleGoReel();
                                            }}
                                          >
                                            Go to this reel
                                          </button>
                                        ) : null}
                                        <button
                                          type="button"
                                          className={`${styles.moreMenuItem} ${styles.moreMenuDanger}`}
                                          role="menuitem"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleDeletePost();
                                          }}
                                        >
                                          Delete reel
                                        </button>
                                      </>
                                    ) : (
                                      <>
                                        <button
                                          type="button"
                                          className={styles.moreMenuItem}
                                          role="menuitem"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleSaveFromMenu();
                                          }}
                                        >
                                          {activeSaved
                                            ? "Unsave this reel"
                                            : "Save this reel"}
                                        </button>
                                        {item.authorId ? (
                                          <button
                                            type="button"
                                            className={styles.moreMenuItem}
                                            role="menuitem"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleFollowFromMenu();
                                            }}
                                          >
                                            {activeFollowing
                                              ? "Unfollow"
                                              : "Follow"}
                                          </button>
                                        ) : null}
                                        {allowDownloads ? (
                                          <button
                                            type="button"
                                            className={styles.moreMenuItem}
                                            role="menuitem"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleDownloadCurrentMedia();
                                            }}
                                          >
                                            Download
                                          </button>
                                        ) : null}
                                        <button
                                          type="button"
                                          className={styles.moreMenuItem}
                                          role="menuitem"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleReportFromMenu();
                                          }}
                                        >
                                          Report
                                        </button>
                                        <button
                                          type="button"
                                          className={styles.moreMenuItem}
                                          role="menuitem"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            copyLink();
                                          }}
                                        >
                                          Copy link
                                        </button>
                                        {item.repostOf ? (
                                          <button
                                            type="button"
                                            className={styles.moreMenuItem}
                                            role="menuitem"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleGoReel();
                                            }}
                                          >
                                            Go to this reel
                                          </button>
                                        ) : null}
                                        <button
                                          type="button"
                                          className={styles.moreMenuItem}
                                          role="menuitem"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleGoProfile();
                                          }}
                                        >
                                          Go to this profile
                                        </button>
                                      </>
                                    )}
                                  </div>
                                ) : null}
                              </div>
                            </ReelVideo>
                            <div
                              style={{
                                opacity: isActive ? 1 : 0,
                                transition: "opacity 0.2s",
                                pointerEvents: isActive ? "auto" : "none",
                              }}
                            >
                              <ReelActions
                                item={item}
                                onLike={handleLike}
                                onSave={handleSave}
                                onRepost={handleRepost}
                                onComment={toggleComments}
                                onFollow={onFollow}
                                viewerId={viewerId}
                              />
                            </div>
                          </div>
                        </div>
                        <div
                          className={styles.navColumn}
                          style={{
                            opacity: isActive ? 1 : 0,
                            transition: "opacity 0.2s",
                            pointerEvents: isActive ? "auto" : "none",
                          }}
                        >
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
                      </div>
                    </div>
                  );
                })}
              </div>
              {showComments && commentTarget ? (
                <ReelComments
                  open={Boolean(commentsOpen)}
                  postId={commentTarget.id}
                  token={token}
                  panelRef={commentPanelRef}
                  viewerId={viewerId}
                  postAuthorId={commentTarget.authorId}
                  allowComments={commentTarget.allowComments}
                  initialCount={commentTarget.stats?.comments}
                  onTotalChange={handleCommentTotal}
                  style={commentDockStyle}
                  onClose={() => {
                    setCommentsOpen(false);
                  }}
                />
              ) : null}
            </div>
          )}
        </div>
      </div>

      {quoteOpen && repostTarget ? (
        <div
          className={`${feedStyles.modalOverlay} ${
            repostClosing
              ? feedStyles.modalOverlayClosing
              : feedStyles.modalOverlayOpen
          }`}
          role="dialog"
          aria-modal="true"
          onClick={closeRepostModal}
        >
          <div
            className={`${feedStyles.modalCard} ${feedStyles.repostCard} ${
              repostClosing
                ? feedStyles.modalCardClosing
                : feedStyles.modalCardOpen
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className={`${feedStyles.modalHeader} ${feedStyles.repostHeader}`}
            >
              <div>
                <h3 className={feedStyles.modalTitle}>Quote</h3>
                <p className={feedStyles.repostSub}>
                  {`Quoting @${repostTarget.label}'s ${repostTarget.kind}`}
                </p>
              </div>
              <button
                className={feedStyles.closeBtn}
                onClick={closeRepostModal}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <label className={feedStyles.repostNoteLabel}>
              Caption
              <div className={feedStyles.editTextareaShell}>
                <textarea
                  className={feedStyles.repostTextarea}
                  value={repostNote}
                  onChange={(e) => setRepostNote(e.target.value)}
                  maxLength={QUOTE_CHAR_LIMIT}
                  placeholder="Add your thoughts..."
                />
                <span className={feedStyles.charCount}>
                  {repostNote.length}/{QUOTE_CHAR_LIMIT}
                </span>
              </div>
            </label>

            <div className={feedStyles.editField}>
              <div className={feedStyles.editLabelRow}>
                <span className={feedStyles.editLabelText}>Visibility</span>
              </div>
              <div className={feedStyles.visibilityList}>
                {quoteVisibilityOptions.map((opt) => {
                  const active = quoteVisibility === opt.value;
                  return (
                    <button
                      key={opt.value}
                      className={`${feedStyles.visibilityOption} ${
                        active ? feedStyles.visibilityOptionActive : ""
                      }`}
                      onClick={() => setQuoteVisibility(opt.value)}
                    >
                      <span className={feedStyles.visibilityRadio}>
                        {active ? "✓" : ""}
                      </span>
                      <span className={feedStyles.visibilityCopy}>
                        <span className={feedStyles.visibilityTitle}>
                          {opt.title}
                        </span>
                        <span className={feedStyles.visibilityDesc}>
                          {opt.description}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className={feedStyles.switchGroup}>
              <label className={feedStyles.switchRow}>
                <input
                  type="checkbox"
                  checked={quoteAllowComments}
                  onChange={() => setQuoteAllowComments((prev) => !prev)}
                />
                <div>
                  <p className={feedStyles.switchTitle}>Allow comments</p>
                  <p className={feedStyles.switchHint}>
                    People can reply to your quote
                  </p>
                </div>
              </label>

              <label className={feedStyles.switchRow}>
                <input
                  type="checkbox"
                  checked={quoteAllowDownload}
                  onChange={() => setQuoteAllowDownload((prev) => !prev)}
                />
                <div>
                  <p className={feedStyles.switchTitle}>Allow downloads</p>
                  <p className={feedStyles.switchHint}>
                    Let followers save the media from the original post
                  </p>
                </div>
              </label>

              <label className={feedStyles.switchRow}>
                <input
                  type="checkbox"
                  checked={quoteHideLikeCount}
                  onChange={() => setQuoteHideLikeCount((prev) => !prev)}
                />
                <div>
                  <p className={feedStyles.switchTitle}>Hide like</p>
                  <p className={feedStyles.switchHint}>
                    Only you will see like counts on this quote
                  </p>
                </div>
              </label>
            </div>

            <div className={feedStyles.editField}>
              <div className={feedStyles.editLabelRow}>
                <span className={feedStyles.editLabelText}>Location</span>
              </div>
              <input
                className={feedStyles.editInput}
                placeholder="Add a place"
                value={quoteLocation}
                onChange={(e) => setQuoteLocation(e.target.value)}
              />
            </div>

            <div className={feedStyles.editField}>
              <div className={feedStyles.editLabelRow}>
                <span className={feedStyles.editLabelText}>Hashtags</span>
              </div>
              <div className={feedStyles.chipRow}>
                {quoteHashtags.map((tag) => (
                  <span key={tag} className={feedStyles.chip}>
                    #{tag}
                    <button
                      type="button"
                      className={feedStyles.chipRemove}
                      onClick={() => removeQuoteHashtag(tag)}
                      aria-label={`Remove ${tag}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
                <input
                  className={feedStyles.editInput}
                  placeholder="Add hashtag"
                  value={quoteHashtagDraft}
                  onChange={(e) => setQuoteHashtagDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      addQuoteHashtag();
                    }
                  }}
                />
              </div>
            </div>

            {repostError ? (
              <div className={feedStyles.inlineError}>{repostError}</div>
            ) : null}

            <div className={feedStyles.modalActions}>
              <button
                className={feedStyles.modalSecondary}
                onClick={closeRepostModal}
                disabled={repostSubmitting}
              >
                Cancel
              </button>
              <button
                className={feedStyles.modalPrimary}
                onClick={() => submitRepost("quote")}
                disabled={repostSubmitting}
              >
                {repostSubmitting ? "Sharing..." : "Share quote"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {repostTarget && !quoteOpen ? (
        <div
          className={`${feedStyles.modalOverlay} ${feedStyles.modalOverlayOpen}`}
          role="dialog"
          aria-modal="true"
          onClick={closeRepostModal}
        >
          <div
            className={feedStyles.repostSheet}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={feedStyles.repostSheetHeader}>
              <p className={feedStyles.repostSheetTitle}>Repost</p>
              <p className={feedStyles.repostSheetSubtitle}>
                {`@${repostTarget.label} · ${repostTarget.kind}`}
              </p>
            </div>
            <div className={feedStyles.repostSheetList} role="menu">
              <button
                className={`${feedStyles.repostSheetItem} ${feedStyles.repostSheetPrimary}`}
                onClick={handleQuickRepost}
                disabled={repostSubmitting}
              >
                Repost
              </button>
              <button
                className={feedStyles.repostSheetItem}
                onClick={openQuoteComposer}
                disabled={repostSubmitting}
              >
                Quote
              </button>
              <button
                className={feedStyles.repostSheetItem}
                onClick={closeRepostModal}
                disabled={repostSubmitting}
              >
                Hủy
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toastMessage ? (
        <div className={postStyles.toast} role="status" aria-live="polite">
          {toastMessage}
        </div>
      ) : null}

      {editOpen ? (
        <div
          className={`${feedStyles.modalOverlay} ${feedStyles.modalOverlayOpen}`}
          role="dialog"
          aria-modal="true"
          onClick={closeEditModal}
        >
          <div
            className={`${feedStyles.modalCard} ${feedStyles.editCard}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={feedStyles.modalHeader}>
              <div>
                <h3 className={feedStyles.modalTitle}>Edit reel</h3>
                <p className={feedStyles.modalBody}>
                  Update caption, hashtags, mentions, location, and reel
                  controls.
                </p>
              </div>
              <button
                className={feedStyles.closeBtn}
                aria-label="Close"
                onClick={closeEditModal}
                type="button"
              >
                ×
              </button>
            </div>

            <form className={feedStyles.editForm} onSubmit={handleEditSubmit}>
              <label className={feedStyles.editLabel}>
                <div className={feedStyles.editLabelRow}>
                  <span className={feedStyles.editLabelText}>Caption</span>
                  <div className={feedStyles.emojiWrap} ref={editEmojiRef}>
                    <button
                      type="button"
                      className={feedStyles.emojiButton}
                      onClick={() => setEditEmojiOpen((prev) => !prev)}
                      aria-label="Add emoji"
                    >
                      <svg
                        aria-label="Emoji icon"
                        fill="currentColor"
                        height="20"
                        role="img"
                        viewBox="0 0 24 24"
                        width="20"
                      >
                        <title>Emoji icon</title>
                        <path d="M15.83 10.997a1.167 1.167 0 1 0 1.167 1.167 1.167 1.167 0 0 0-1.167-1.167Zm-6.5 1.167a1.167 1.167 0 1 0-1.166 1.167 1.167 1.167 0 0 0 1.166-1.167Zm5.163 3.24a3.406 3.406 0 0 1-4.982.007 1 1 0 1 0-1.557 1.256 5.397 5.397 0 0 0 8.09 0 1 1 0 0 0-1.55-1.263ZM12 .503a11.5 11.5 0 1 0 11.5 11.5A11.513 11.513 0 0 0 12 .503Zm0 21a9.5 9.5 0 1 1 9.5-9.5 9.51 9.51 0 0 1-9.5 9.5Z"></path>
                      </svg>
                    </button>
                    {editEmojiOpen ? (
                      <div className={feedStyles.emojiPopover}>
                        <EmojiPicker
                          onEmojiClick={(emojiData) => {
                            insertEditEmoji(emojiData.emoji || "");
                            setEditEmojiOpen(false);
                          }}
                          searchDisabled={false}
                          skinTonesDisabled={false}
                          lazyLoadEmojis
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
                <div
                  className={`${feedStyles.editTextareaShell} ${feedStyles.mentionCombo}`}
                >
                  <textarea
                    ref={editCaptionRef}
                    className={feedStyles.editTextarea}
                    value={editCaption}
                    onChange={handleCaptionChange}
                    onKeyDown={onCaptionKeyDown}
                    onBlur={() => {
                      setTimeout(() => {
                        setMentionOpen(false);
                        setMentionHighlight(-1);
                        setActiveMentionRange(null);
                      }, 120);
                    }}
                    rows={4}
                    maxLength={2200}
                    placeholder="Write something..."
                  />
                  <span className={feedStyles.charCount}>
                    {editCaption.length}/2200
                  </span>
                </div>
              </label>

              {mentionOpen ? (
                <div className={feedStyles.mentionDropdown}>
                  {mentionLoading ? (
                    <div className={feedStyles.mentionItem}>Searching...</div>
                  ) : null}
                  {!mentionLoading && mentionSuggestions.length === 0 ? (
                    <div className={feedStyles.mentionItem}>
                      {mentionError || "No matches"}
                    </div>
                  ) : null}
                  {mentionSuggestions.map((opt, idx) => {
                    const activeOpt = idx === mentionHighlight;
                    const avatarInitials = (
                      opt.displayName ||
                      opt.username ||
                      "?"
                    )
                      .slice(0, 2)
                      .toUpperCase();
                    return (
                      <button
                        type="button"
                        key={opt.id || opt.username}
                        className={`${feedStyles.mentionItem} ${
                          activeOpt ? feedStyles.mentionItemActive : ""
                        }`}
                        onClick={() => selectMention(opt)}
                      >
                        <span className={feedStyles.mentionAvatar} aria-hidden>
                          {opt.avatarUrl ? (
                            <img
                              src={opt.avatarUrl}
                              alt={opt.displayName || opt.username}
                              className={feedStyles.mentionAvatarImg}
                            />
                          ) : (
                            <span className={feedStyles.mentionAvatarFallback}>
                              {avatarInitials}
                            </span>
                          )}
                        </span>
                        <span className={feedStyles.mentionCopy}>
                          <span className={feedStyles.mentionHandle}>
                            @{opt.username}
                          </span>
                          {opt.displayName ? (
                            <span className={feedStyles.mentionName}>
                              {opt.displayName}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : null}

              <div className={feedStyles.editField}>
                <div className={feedStyles.editLabelRow}>
                  <span className={feedStyles.editLabelText}>Hashtags</span>
                </div>
                <div className={feedStyles.chipRow}>
                  {editHashtags.map((tag) => (
                    <span key={tag} className={feedStyles.chip}>
                      #{tag}
                      <button
                        type="button"
                        className={feedStyles.chipRemove}
                        onClick={() => removeHashtag(tag)}
                        aria-label={`Remove ${tag}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  <input
                    className={feedStyles.editInput}
                    placeholder="Add hashtag"
                    value={hashtagDraft}
                    onChange={(e) => setHashtagDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === ",") {
                        e.preventDefault();
                        addHashtag();
                      }
                    }}
                  />
                </div>
              </div>

              <div className={feedStyles.editField}>
                <div className={feedStyles.editLabelRow}>
                  <span className={feedStyles.editLabelText}>Location</span>
                </div>
                <input
                  className={feedStyles.editInput}
                  placeholder="Add a place"
                  value={locationQuery}
                  onChange={(e) => {
                    setEditLocation(e.target.value);
                    setLocationQuery(e.target.value);
                  }}
                  onFocus={() =>
                    setLocationOpen(Boolean(locationSuggestions.length))
                  }
                  onKeyDown={onLocationKeyDown}
                />
                {locationOpen ? (
                  <div className={feedStyles.locationDropdown}>
                    {locationLoading ? (
                      <div className={feedStyles.locationItem}>
                        Searching...
                      </div>
                    ) : null}
                    {!locationLoading && locationSuggestions.length === 0 ? (
                      <div className={feedStyles.locationItem}>
                        {locationError || "No suggestions"}
                      </div>
                    ) : null}
                    {locationSuggestions.map((opt, idx) => {
                      const activeOpt = idx === locationHighlight;
                      return (
                        <button
                          type="button"
                          key={`${opt.label}-${opt.lat}-${opt.lon}`}
                          className={`${feedStyles.locationItem} ${
                            activeOpt ? feedStyles.locationItemActive : ""
                          }`}
                          onClick={() => pickLocation(opt.label)}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>

              <div className={feedStyles.switchGroup}>
                <label className={feedStyles.switchRow}>
                  <input
                    type="checkbox"
                    checked={editAllowComments}
                    onChange={() => setEditAllowComments((prev) => !prev)}
                  />
                  <div>
                    <p className={feedStyles.switchTitle}>Allow comments</p>
                    <p className={feedStyles.switchHint}>
                      Enable to receive feedback from everyone
                    </p>
                  </div>
                </label>

                <label className={feedStyles.switchRow}>
                  <input
                    type="checkbox"
                    checked={editAllowDownload}
                    onChange={() => setEditAllowDownload((prev) => !prev)}
                  />
                  <div>
                    <p className={feedStyles.switchTitle}>Allow downloads</p>
                    <p className={feedStyles.switchHint}>
                      Share the original file with people you trust
                    </p>
                  </div>
                </label>

                <label className={feedStyles.switchRow}>
                  <input
                    type="checkbox"
                    checked={editHideLikeCount}
                    onChange={() => setEditHideLikeCount((prev) => !prev)}
                  />
                  <div>
                    <p className={feedStyles.switchTitle}>Hide like</p>
                    <p className={feedStyles.switchHint}>
                      Viewers won’t see the number of likes on this reel
                    </p>
                  </div>
                </label>
              </div>

              {editError ? (
                <div className={feedStyles.inlineError}>{editError}</div>
              ) : null}
              {editSuccess ? (
                <div className={feedStyles.editSuccess}>{editSuccess}</div>
              ) : null}

              <div className={feedStyles.modalActions}>
                <button
                  type="button"
                  className={feedStyles.modalSecondary}
                  onClick={closeEditModal}
                  disabled={editSaving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={feedStyles.modalPrimary}
                  disabled={editSaving}
                >
                  {editSaving ? "Saving..." : "Save changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {deleteConfirmOpen ? (
        <div
          className={`${postStyles.reportOverlay} ${postStyles.reportOverlayOpen}`}
          role="dialog"
          aria-modal="true"
          onClick={closeDeleteConfirm}
        >
          <div
            className={postStyles.reportCard}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={postStyles.reportHeader}>
              <div>
                <h3 className={postStyles.reportTitle}>Delete this reel?</h3>
                <p className={postStyles.reportBody}>
                  Removing this reel cannot be undone. It will disappear
                  immediately.
                </p>
              </div>
              <button
                className={postStyles.reportClose}
                aria-label="Close"
                onClick={closeDeleteConfirm}
                disabled={deleteSubmitting}
              >
                ×
              </button>
            </div>

            {deleteError ? (
              <div className={postStyles.reportInlineError}>{deleteError}</div>
            ) : null}

            <div className={postStyles.reportActions}>
              <button
                className={postStyles.reportSecondary}
                onClick={closeDeleteConfirm}
                disabled={deleteSubmitting}
              >
                Cancel
              </button>
              <button
                className={`${postStyles.reportPrimary} ${postStyles.blockDanger}`}
                onClick={confirmDelete}
                disabled={deleteSubmitting}
              >
                {deleteSubmitting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {visibilityModalOpen ? (
        <div
          className={`${feedStyles.modalOverlay} ${feedStyles.modalOverlayOpen}`}
          role="dialog"
          aria-modal="true"
          onClick={closeVisibilityModal}
        >
          <div
            className={feedStyles.modalCard}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={feedStyles.modalHeader}>
              <div>
                <h3 className={feedStyles.modalTitle}>Edit visibility</h3>
                <p className={feedStyles.modalBody}>
                  Choose who can view this reel.
                </p>
              </div>
              <button
                className={feedStyles.closeBtn}
                aria-label="Close"
                onClick={closeVisibilityModal}
              >
                ×
              </button>
            </div>

            <div className={feedStyles.visibilityGrid}>
              {visibilityOptions.map((opt) => {
                const activeOpt = visibilitySelected === opt.value;
                return (
                  <button
                    key={opt.value}
                    className={`${feedStyles.visibilityOption} ${
                      activeOpt ? feedStyles.visibilityOptionActive : ""
                    }`}
                    onClick={() => setVisibilitySelected(opt.value)}
                  >
                    <span className={feedStyles.visibilityRadio}>
                      {activeOpt ? "✓" : ""}
                    </span>
                    <span className={feedStyles.visibilityCopy}>
                      <span className={feedStyles.visibilityTitle}>
                        {opt.title}
                      </span>
                      <span className={feedStyles.visibilityDesc}>
                        {opt.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            {visibilityError ? (
              <div className={feedStyles.inlineError}>{visibilityError}</div>
            ) : null}

            <div className={feedStyles.modalActions}>
              <button
                className={feedStyles.modalSecondary}
                onClick={closeVisibilityModal}
                disabled={visibilitySaving}
              >
                Cancel
              </button>
              <button
                className={feedStyles.modalPrimary}
                onClick={submitVisibilityUpdate}
                disabled={visibilitySaving}
              >
                {visibilitySaving ? "Updating..." : "Update visibility"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {reportOpen ? (
        <div
          className={`${postStyles.reportOverlay} ${
            reportClosing
              ? postStyles.reportOverlayClosing
              : postStyles.reportOverlayOpen
          }`}
          role="dialog"
          aria-modal="true"
          onClick={closeReportModal}
        >
          <div
            className={`${postStyles.reportCard} ${
              reportClosing
                ? postStyles.reportCardClosing
                : postStyles.reportCardOpen
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={postStyles.reportHeader}>
              <div>
                <h3 className={postStyles.reportTitle}>Report this reel</h3>
                <p className={postStyles.reportBody}>
                  Help us understand what is wrong with this content.
                </p>
              </div>
              <button
                className={postStyles.reportClose}
                aria-label="Close"
                onClick={closeReportModal}
              >
                ×
              </button>
            </div>

            <div className={postStyles.reportGrid}>
              <div className={postStyles.reportCategoryGrid}>
                {REPORT_GROUPS.map((group) => {
                  const isActive = reportCategory === group.key;
                  return (
                    <button
                      key={group.key}
                      className={`${postStyles.reportCategoryCard} ${
                        isActive ? postStyles.reportCategoryCardActive : ""
                      }`}
                      style={{
                        borderColor: isActive ? group.accent : undefined,
                        boxShadow: isActive
                          ? `0 0 0 1px ${group.accent}`
                          : undefined,
                      }}
                      onClick={() => {
                        setReportCategory(group.key);
                        setReportReason(
                          group.reasons.length === 1
                            ? group.reasons[0].key
                            : null,
                        );
                      }}
                    >
                      <span
                        className={postStyles.reportCategoryDot}
                        style={{ background: group.accent }}
                      />
                      <span className={postStyles.reportCategoryLabel}>
                        {group.label}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className={postStyles.reportReasonPanel}>
                <div className={postStyles.reportReasonHeader}>
                  Select a specific reason
                </div>
                {selectedReportGroup ? (
                  <div className={postStyles.reportReasonList}>
                    {selectedReportGroup.reasons.map((reason) => {
                      const checked = reportReason === reason.key;
                      return (
                        <button
                          key={reason.key}
                          className={`${postStyles.reportReasonRow} ${
                            checked ? postStyles.reportReasonRowActive : ""
                          }`}
                          onClick={() => setReportReason(reason.key)}
                        >
                          <span
                            className={postStyles.reportReasonRadio}
                            aria-checked={checked}
                          >
                            {checked ? (
                              <span
                                className={postStyles.reportReasonRadioDot}
                              />
                            ) : null}
                          </span>
                          <span>{reason.label}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className={postStyles.reportReasonPlaceholder}>
                    Pick a category first.
                  </div>
                )}

                <label className={postStyles.reportNoteLabel}>
                  Additional notes (optional)
                  <textarea
                    className={postStyles.reportNoteInput}
                    placeholder="Add brief context if needed..."
                    value={reportNote}
                    onChange={(e) => setReportNote(e.target.value)}
                    maxLength={500}
                  />
                </label>
                {reportError ? (
                  <div className={postStyles.reportInlineError}>
                    {reportError}
                  </div>
                ) : null}
              </div>
            </div>

            <div className={postStyles.reportActions}>
              <button
                className={postStyles.reportSecondary}
                onClick={closeReportModal}
                disabled={reportSubmitting}
              >
                Cancel
              </button>
              <button
                className={postStyles.reportPrimary}
                onClick={submitReport}
                disabled={!reportReason || reportSubmitting}
              >
                {reportSubmitting ? "Submitting..." : "Submit report"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
