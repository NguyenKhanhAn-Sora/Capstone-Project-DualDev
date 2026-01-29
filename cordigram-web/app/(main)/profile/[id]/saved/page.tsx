"use client";

import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../../profile.module.css";
import { fetchSavedItems, type FeedItem } from "@/lib/api";
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

export default function ProfileSavedPage() {
  const router = useRouter();
  const { profile, viewerId } = useProfileContext();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  const isOwner = useMemo(
    () => Boolean(profile && viewerId && profile.userId === viewerId),
    [profile, viewerId]
  );

  useEffect(() => {
    if (!isOwner) return;
    const token = getStoredAccessToken();
    if (!token) return;
    setLoading(true);
    setError("");
    fetchSavedItems({ token, limit: 60 })
      .then((data) =>
        setItems(
          data
            .slice()
            .sort(
              (a, b) =>
                (b.createdAt ? new Date(b.createdAt).getTime() : 0) -
                (a.createdAt ? new Date(a.createdAt).getTime() : 0)
            )
        )
      )
      .catch((err: unknown) => {
        const message =
          typeof err === "object" && err && "message" in err
            ? String((err as { message?: string }).message)
            : "Unable to load saved";
        setError(message || "Unable to load saved");
      })
      .finally(() => setLoading(false));
  }, [isOwner]);

  if (!isOwner) {
    return (
      <div className={styles.errorBox}>You cannot view saved items here.</div>
    );
  }

  return (
    <>
      {error ? <div className={styles.errorBox}>{error}</div> : null}
      <SavedGrid
        items={items}
        loading={loading}
        onSelect={(path) => router.push(path)}
      />
    </>
  );
}

function SavedGrid({
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
    return <div className={styles.errorBox}>No saved yet.</div>;
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
                alt="saved media"
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
