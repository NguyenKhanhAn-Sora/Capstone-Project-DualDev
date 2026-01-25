"use client";

import type React from "react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../profile.module.css";
import { fetchUserPosts, type FeedItem } from "@/lib/api";
import { getStoredAccessToken } from "@/lib/auth";
import { useProfileContext } from "./profile-context";

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

export default function ProfilePostsPage() {
  const router = useRouter();
  const { profile } = useProfileContext();
  const [posts, setPosts] = useState<FeedItem[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    const token = getStoredAccessToken();
    if (!token || !profile) return;
    setPostsLoading(true);
    setError("");
    fetchUserPosts({ token, userId: profile.userId, limit: 30 })
      .then((items) => setPosts(items.filter((item) => !item.repostOf)))
      .catch((err: unknown) => {
        const message =
          typeof err === "object" && err && "message" in err
            ? String((err as { message?: string }).message)
            : "Unable to load posts";
        setError(message || "Unable to load posts");
      })
      .finally(() => setPostsLoading(false));
  }, [profile]);

  return (
    <>
      {error ? <div className={styles.errorBox}>{error}</div> : null}
      <PostGrid
        items={posts}
        loading={postsLoading}
        onSelect={(path) => router.push(path)}
      />
    </>
  );
}

function PostGrid({
  items,
  loading,
  onSelect,
}: {
  items: FeedItem[];
  loading: boolean;
  onSelect: (path: string) => void;
}) {
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
    return <div className={styles.errorBox}>No posts yet.</div>;
  }

  return (
    <div className={styles.grid}>
      {items.map((item) => {
        const media = item.media?.[0];
        if (!media) return null;
        const targetPath =
          item.kind === "reel" ? `/reels/${item.id}` : `/post/${item.id}`;
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
                alt="post media"
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
