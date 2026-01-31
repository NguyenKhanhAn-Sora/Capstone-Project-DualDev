"use client";

import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { FeedItem } from "@/lib/api";
import { fetchExploreFeed, recordExploreImpression } from "@/lib/api";
import styles from "./explore.module.css";

const PAGE_SIZE = 30;

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

const IconReel = () => (
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
    <rect x="3" y="3" width="18" height="18" rx="4" />
    <path d="M8 3l3 6" />
    <path d="M13 3l3 6" />
    <path d="M18 3l3 6" />
    <path d="M10 10.5l6 3.5-6 3.5v-7z" fill="currentColor" stroke="none" />
  </svg>
);

const getToken = () =>
  typeof window === "undefined" ? null : localStorage.getItem("accessToken");

const makeSessionId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export default function ExplorePage() {
  const router = useRouter();

  const [token, setToken] = useState<string | null>(null);
  const [items, setItems] = useState<FeedItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const sessionIdRef = useRef<string>(makeSessionId());
  const sentImpressionsRef = useRef<Set<string>>(new Set());
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setToken(getToken());
  }, []);

  const loadPage = useCallback(
    async (nextPage: number) => {
      if (!token) return;
      setLoading(true);
      setError("");
      try {
        const data =
          (await fetchExploreFeed({
            token,
            limit: PAGE_SIZE,
            page: nextPage,
          })) || [];

        setHasMore(data.length >= PAGE_SIZE);

        setItems((prev) => {
          if (nextPage === 1) return data;
          const seen = new Set(prev.map((it) => it.id));
          const merged = [...prev];
          data.forEach((it) => {
            if (!seen.has(it.id)) {
              seen.add(it.id);
              merged.push(it);
            }
          });
          return merged;
        });

        setPage(nextPage);
      } catch (err) {
        const msg =
          typeof err === "object" && err && "message" in err
            ? String((err as { message?: string }).message)
            : "Unable to load explore";
        setError(msg || "Unable to load explore");
      } finally {
        setLoading(false);
      }
    },
    [token],
  );

  useEffect(() => {
    if (!token) return;
    void loadPage(1);
  }, [loadPage, token]);

  const handleLoadMore = useCallback(() => {
    if (loading || !hasMore) return;
    void loadPage(page + 1);
  }, [hasMore, loadPage, loading, page]);

  useEffect(() => {
    const anchor = loadMoreRef.current;
    if (!anchor) return;
    if (!hasMore) return;
    if (typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        const isVisible = entries.some((e) => e.isIntersecting);
        if (!isVisible) return;
        handleLoadMore();
      },
      { root: null, rootMargin: "900px 0px", threshold: 0 },
    );

    observer.observe(anchor);
    return () => observer.disconnect();
  }, [handleLoadMore, hasMore]);

  // Impression tracking (true viewport impressions, de-duped per session).
  useEffect(() => {
    if (!token) return;
    if (typeof IntersectionObserver === "undefined") return;

    const tiles = Array.from(
      document.querySelectorAll<HTMLElement>("[data-explore-tile='1']"),
    );

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const el = entry.target as HTMLElement;
          const postId = el.dataset.postId || "";
          const pos = el.dataset.pos ? Number(el.dataset.pos) : null;
          if (!postId) return;
          if (sentImpressionsRef.current.has(postId)) return;
          sentImpressionsRef.current.add(postId);

          void recordExploreImpression({
            token,
            postId,
            sessionId: sessionIdRef.current,
            position: typeof pos === "number" ? pos : null,
            source: "explore-grid",
          }).catch(() => undefined);
        });
      },
      { root: null, rootMargin: "500px 0px", threshold: 0.2 },
    );

    tiles.forEach((t) => observer.observe(t));
    return () => observer.disconnect();
  }, [items.length, token]);

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

  const subtitle = useMemo(() => {
    if (loading && items.length === 0) return "Loading...";
    if (error) return "";
    return items.length ? `${items.length} items` : "";
  }, [error, items.length, loading]);

  return (
    <div className={styles.page}>
      {error ? <div className={styles.errorBox}>{error}</div> : null}

      <div className={styles.grid}>
        {loading && items.length === 0
          ? Array.from({ length: 12 }).map((_, i) => (
              <div
                key={`s-${i}`}
                className={`${styles.tile} ${styles.skeleton}`}
              />
            ))
          : items.map((item, idx) => {
              const media = item.media?.[0];
              if (!media) return null;

              const targetPath =
                item.kind === "reel"
                  ? `/reels/${item.id}?single=1`
                  : `/post/${item.id}`;

              const viewCount = item.stats?.views ?? 0;

              const tileClass =
                item.kind === "reel"
                  ? `${styles.tile} ${styles.tileTall}`
                  : styles.tile;

              return (
                <button
                  key={item.id}
                  type="button"
                  className={tileClass}
                  data-explore-tile="1"
                  data-post-id={item.id}
                  data-pos={idx}
                  onClick={() => router.push(targetPath)}
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
                      alt="media"
                      loading="lazy"
                    />
                  )}

                  {item.kind === "reel" ? (
                    <div className={styles.kindBadge} aria-hidden>
                      <IconReel />
                    </div>
                  ) : null}

                  <div className={styles.viewBadge}>
                    <IconView />
                    {formatCount(viewCount)}
                  </div>
                </button>
              );
            })}
      </div>

      <div ref={loadMoreRef} className={styles.loadMoreSentinel} />
    </div>
  );
}
