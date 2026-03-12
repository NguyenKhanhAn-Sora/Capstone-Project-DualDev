"use client";

import type React from "react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import styles from "../profile.module.css";
import type { FeedItem } from "@/lib/api";
import { useProfileContext } from "./profile-context";

const PROFILE_POST_NAV_KEY_PREFIX = "profile-post-nav:";

const saveProfilePostNav = (profileId: string, items: FeedItem[]) => {
  if (typeof window === "undefined") return;
  const ids = items
    .filter((item) => item.kind !== "reel")
    .map((item) => item.id)
    .filter((id) => !!id);
  if (!ids.length) return;
  const key = `${PROFILE_POST_NAV_KEY_PREFIX}${profileId}`;
  const payload = JSON.stringify({
    ids,
    createdAt: Date.now(),
  });
  window.sessionStorage.setItem(key, payload);
};

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
  const { profile, tabs, prefetchTab } = useProfileContext();
  const tab = tabs?.posts;

  useEffect(() => {
    prefetchTab?.("posts");
  }, [prefetchTab]);

  const error = tab?.error ?? "";
  const items = tab?.items ?? [];
  const showSkeleton = !!(
    tab &&
    (tab.loading || (!tab.loaded && !tab.error)) &&
    items.length === 0
  );
  const showEmpty = !!(
    tab &&
    tab.loaded &&
    !tab.loading &&
    !error &&
    items.length === 0
  );
  const suppressGrid = Boolean(error) && items.length === 0 && !showSkeleton;

  return (
    <>
      {error ? <div className={styles.errorBox}>{error}</div> : null}
      {suppressGrid ? null : showEmpty ? (
        <div className={styles.errorBox}>No posts yet.</div>
      ) : (
        <PostGrid
          items={items}
          loading={showSkeleton}
          onSelect={(item) => {
            const targetPath =
              item.kind === "reel" ? `/reels/${item.id}` : `/post/${item.id}`;

            if (item.kind === "reel") {
              router.push(targetPath);
              return;
            }

            if (profile.id) {
              saveProfilePostNav(profile.id, items);
            }

            const query = new URLSearchParams();
            query.set("fromProfile", "1");
            if (profile.id) {
              query.set("profileId", profile.id);
            }
            router.push(`${targetPath}?${query.toString()}`);
          }}
        />
      )}
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
  onSelect: (item: FeedItem) => void;
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
            onClick={() => onSelect(item)}
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
