"use client";

import type React from "react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../../profile.module.css";
import { fetchUserPosts, fetchUserReels, type FeedItem } from "@/lib/api";
import { getStoredAccessToken } from "@/lib/auth";
import { useProfileContext } from "../profile-context";

const formatCount = (value?: number) => {
  const n = value ?? 0;
  if (n >= 1_000_000)
    return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return `${n}`;
};

const IconView = () => (
  <svg
    aria-hidden
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M1.5 12s4-7.5 10.5-7.5S22.5 12 22.5 12 18.5 19.5 12 19.5 1.5 12 1.5 12Z" />
    <circle cx="12" cy="12" r="3.2" fill="currentColor" />
  </svg>
);

export default function ProfileRepostPage() {
  const router = useRouter();
  const { profile } = useProfileContext();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    const token = getStoredAccessToken();
    if (!token || !profile) return;

    setLoading(true);
    setError("");

    Promise.all([
      fetchUserPosts({ token, userId: profile.userId, limit: 60 }),
      fetchUserReels({ token, userId: profile.userId, limit: 60 }),
    ])
      .then(([posts, reels]) => {
        const combined = [...(posts || []), ...(reels || [])];
        const deduped = new Map<string, FeedItem>();
        combined.forEach((item) => {
          if (!item) return;
          if (!deduped.has(item.id)) deduped.set(item.id, item);
        });
        const reposts = Array.from(deduped.values()).filter((item) =>
          Boolean((item as any)?.repostOf),
        );
        reposts.sort((a, b) => {
          const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return bTime - aTime;
        });
        setItems(reposts);
      })
      .catch((err: unknown) => {
        const message =
          typeof err === "object" && err && "message" in err
            ? String((err as { message?: string }).message)
            : "Unable to load reposts";
        setError(message || "Unable to load reposts");
      })
      .finally(() => setLoading(false));
  }, [profile]);

  return (
    <>
      {error ? <div className={styles.errorBox}>{error}</div> : null}
      <RepostGrid
        items={items}
        loading={loading}
        onSelect={(path) => router.push(path)}
      />
    </>
  );
}

function RepostGrid({
  items,
  loading,
  onSelect,
}: {
  items: FeedItem[];
  loading: boolean;
  onSelect: (path: string) => void;
}) {
  const resolveTargetPath = (item: FeedItem) => {
    const kind = (item as any)?.repostKind || item.kind;
    const isReel = kind === "reel" || item.media?.[0]?.type === "video";
    if (isReel) {
      const originId = (item as any)?.repostOf as string | undefined;
      const query = originId ? `?single=1&origin=${originId}` : "?single=1";
      return `/reels/${item.id}${query}`;
    }
    return `/post/${item.id}`;
  };

  const handleEnter = (e: React.MouseEvent<HTMLVideoElement>) => {
    const el = e.currentTarget;
    el.currentTime = 0;
    void el.play().catch(() => undefined);
  };

  const handleLeave = (e: React.MouseEvent<HTMLVideoElement>) => {
    const el = e.currentTarget;
    el.pause();
    el.currentTime = 0;
  };

  if (loading) {
    return (
      <div className={styles.grid}>
        {Array.from({ length: 9 }).map((_, idx) => (
          <div key={idx} className={`${styles.tile} ${styles.skeleton}`} />
        ))}
      </div>
    );
  }

  if (!items.length) {
    return <div className={styles.errorBox}>No reposts yet.</div>;
  }

  return (
    <div className={styles.grid}>
      {items.map((item) => {
        const media = item.media?.[0];
        if (!media) return null;
        const targetPath = resolveTargetPath(item);
        return (
          <button
            key={item.id}
            type="button"
            className={styles.tile}
            onClick={() => onSelect(targetPath)}
          >
            {media.type === "video" ? (
              <video
                className={styles.tileMedia}
                src={media.url}
                muted
                playsInline
                preload="metadata"
                onMouseEnter={handleEnter}
                onMouseLeave={handleLeave}
              />
            ) : (
              <img
                className={styles.tileMedia}
                src={media.url}
                alt="repost media"
                loading="lazy"
              />
            )}
            <div className={styles.viewBadge}>
              <IconView />
              {formatCount(item.stats?.views)}
            </div>
          </button>
        );
      })}
    </div>
  );
}
