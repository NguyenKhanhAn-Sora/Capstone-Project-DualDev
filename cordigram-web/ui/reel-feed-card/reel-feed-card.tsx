"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { FeedItem } from "@/lib/api";
import { formatRelativeTime } from "@/lib/relative-time";
import { useLanguage } from "@/component/language-provider";
import VerifiedBadge from "@/ui/verified-badge/verified-badge";
import styles from "./reel-feed-card.module.css";

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function ReelFeedCard({ item }: { item: FeedItem }) {
  const { language } = useLanguage();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const displayName =
    item.authorDisplayName ||
    item.author?.displayName ||
    item.authorUsername ||
    item.author?.username ||
    "Unknown";
  const username = item.authorUsername || item.author?.username || "";
  const avatarUrl = item.authorAvatarUrl || item.author?.avatarUrl;
  const isVerified =
    item.authorIsCreatorVerified || item.author?.isCreatorVerified;

  const mediaItem = item.media?.[0] ?? null;
  const mediaUrl = mediaItem?.url ?? null;
  const isVideo = mediaItem?.type === "video";
  const duration = (item as any).durationSeconds as number | undefined;
  const hearts = item.stats?.hearts ?? 0;
  const comments = item.stats?.comments ?? 0;

  const timeAgo = item.createdAt
    ? formatRelativeTime(item.createdAt, language)
    : "";

  // Auto-play when ≥50% visible, pause when scrolled out — mirrors CustomVideoPlayer
  useEffect(() => {
    if (!isVideo || !mediaUrl) return;
    const v = videoRef.current;
    if (!v) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const p = v.play();
            if (p?.catch) p.catch(() => undefined);
            setIsPlaying(true);
          } else {
            v.pause();
            setIsPlaying(false);
          }
        });
      },
      { threshold: 0.5 },
    );

    observer.observe(v);
    return () => {
      observer.disconnect();
      try { v.pause(); } catch {}
    };
  }, [isVideo, mediaUrl]);

  return (
    <Link href={`/reels/${item.id}`} className={styles.card}>
      {/* Header */}
      <div className={styles.header}>
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={displayName}
            className={styles.avatar}
            loading="lazy"
          />
        ) : (
          <div className={styles.avatarFallback} aria-hidden>
            {(displayName[0] ?? "?").toUpperCase()}
          </div>
        )}
        <div className={styles.authorInfo}>
          <div className={styles.displayName}>
            <span>{displayName}</span>
            {isVerified && <VerifiedBadge size={14} />}
          </div>
          {timeAgo && <div className={styles.username}>{timeAgo}</div>}
        </div>
      </div>

      {/* Media: outer strip tối full-width, inner khung 9:16 portrait */}
      <div className={styles.mediaArea}>
      <div className={styles.thumbnailWrap}>
        {mediaUrl && isVideo ? (
          <video
            ref={videoRef}
            src={mediaUrl}
            className={styles.videoThumb}
            preload="metadata"
            muted
            playsInline
            loop
            tabIndex={-1}
          />
        ) : mediaUrl ? (
          <img
            src={mediaUrl}
            alt={item.content || "Reel"}
            className={styles.thumbnail}
            loading="lazy"
          />
        ) : (
          <div className={styles.thumbnailPlaceholder} />
        )}

        {/* Play overlay — ẩn khi đang play */}
        <div
          className={`${styles.playOverlay} ${isPlaying ? styles.playOverlayHidden : ""}`}
        >
          <div className={styles.playBtn}>
            <svg
              width={22}
              height={22}
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden
            >
              <path d="M8 5.14v14l11-7-11-7z" />
            </svg>
          </div>
        </div>

        {/* Reel badge */}
        <div className={styles.reelBadge}>
          <svg
            width={12}
            height={12}
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden
          >
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z" />
          </svg>
          Reel
        </div>

        {/* Duration */}
        {duration != null && duration > 0 && (
          <div className={styles.duration}>{formatDuration(duration)}</div>
        )}

        {/* Caption overlay */}
        {item.content && (
          <div className={styles.captionOverlay}>{item.content}</div>
        )}
      </div>
      </div>

      {/* Footer */}
      <div className={styles.footer}>
        <span className={styles.stat}>
          <svg
            width={15}
            height={15}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.2}
            aria-hidden
          >
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
          {hearts.toLocaleString()}
        </span>
        <span className={styles.dot} />
        <span className={styles.stat}>
          <svg
            width={15}
            height={15}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.2}
            aria-hidden
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          {comments.toLocaleString()}
        </span>
        {username && <span className={styles.time}>@{username}</span>}
      </div>
    </Link>
  );
}
