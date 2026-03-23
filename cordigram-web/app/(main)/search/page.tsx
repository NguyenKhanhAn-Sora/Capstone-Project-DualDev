"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import styles from "./search.module.css";
import {
  addSearchHistory,
  searchProfiles,
  searchPosts,
  suggestHashtags,
  type FeedItem,
  type ProfileSearchItem,
} from "@/lib/api";
import { getStoredAccessToken } from "@/lib/auth";
import HomePage from "../page";
import {
  formatCount,
  HashTile,
  IconClear,
  IconView,
} from "./_components/search-shared";
import VerifiedBadge from "@/ui/verified-badge/verified-badge";

const DEFAULT_AVATAR_URL =
  "https://res.cloudinary.com/doicocgeo/image/upload/v1765850274/user-avatar-default_gfx5bs.jpg";

function useDebouncedUrlQueryParam(param: string, delayMs: number) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const initial = searchParams?.get(param) ?? "";
  const [value, setValue] = useState<string>(initial);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    setValue(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  const setValueAndUrl = (next: string) => {
    setValue(next);
    if (timerRef.current) window.clearTimeout(timerRef.current);

    timerRef.current = window.setTimeout(() => {
      const sp = new URLSearchParams(searchParams?.toString() ?? "");
      const trimmed = next.trim();
      if (trimmed) sp.set(param, trimmed);
      else sp.delete(param);
      router.replace(`${pathname}?${sp.toString()}`);
    }, delayMs);
  };

  return { value, setValueAndUrl };
}

export default function SearchAllPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const { value: query, setValueAndUrl: setQuery } = useDebouncedUrlQueryParam(
    "q",
    250,
  );

  const normalized = useMemo(() => query.trim(), [query]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  const [people, setPeople] = useState<ProfileSearchItem[]>([]);
  const [hashtags, setHashtags] = useState<
    Array<{ id: string; name: string; usageCount: number }>
  >([]);
  const [posts, setPosts] = useState<FeedItem[]>([]);
  const [reels, setReels] = useState<FeedItem[]>([]);

  useEffect(() => {
    const token = getStoredAccessToken();
    if (!token) {
      setError("Session expired.");
      return;
    }

    if (!normalized) {
      setPeople([]);
      setHashtags([]);
      setPosts([]);
      setReels([]);
      setError("");
      setLoading(false);
      return;
    }

    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError("");
      try {
        const [p, t, po, r] = await Promise.all([
          searchProfiles({ token, query: normalized, limit: 12 }),
          suggestHashtags({ token, query: normalized, limit: 10 }),
          searchPosts({
            token,
            query: normalized,
            limit: 3,
            page: 1,
            kinds: ["post"],
          }),
          searchPosts({
            token,
            query: normalized,
            limit: 12,
            page: 1,
            kinds: ["reel"],
          }),
        ]);
        if (cancelled) return;
        setPeople(p.items ?? []);
        setHashtags((t.items ?? []).slice(0, 10));
        setPosts(po.items ?? []);
        setReels(r.items ?? []);
      } catch (err: any) {
        if (cancelled) return;
        setError(err?.message || "Search failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [normalized]);

  const addToHistory = async (
    item: Parameters<typeof addSearchHistory>[0]["item"],
  ) => {
    const token = getStoredAccessToken();
    if (!token) return;
    try {
      await addSearchHistory({ token, item });
    } catch {
      /* best-effort */
    }
  };

  const qParam = encodeURIComponent(searchParams?.get("q") || normalized);

  const handleReelEnter = (e: MouseEvent<HTMLVideoElement>) => {
    const el = e.currentTarget;
    el.currentTime = 0;
    void el.play().catch(() => undefined);
  };
  const handleReelLeave = (e: MouseEvent<HTMLVideoElement>) => {
    const el = e.currentTarget;
    el.pause();
    el.currentTime = 0;
  };

  const handleEnterToSearch = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    const trimmed = query.trim();
    if (!trimmed) return;
    e.preventDefault();
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <div className={styles.title}>Search</div>
        </div>

        <div className={styles.inputWrap}>
          <input
            className={styles.input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleEnterToSearch}
            placeholder="Search people, #hashtags, posts, reels"
            spellCheck={false}
          />
          {query.trim() ? (
            <button
              className={styles.clearBtn}
              type="button"
              aria-label="Clear"
              onClick={() => setQuery("")}
            >
              <IconClear />
            </button>
          ) : null}
        </div>

        <div className={styles.tabs}>
          <Link
            className={`${styles.tab} ${styles.tabActive}`}
            href={`/search?q=${qParam}`}
          >
            All
          </Link>
          <Link className={styles.tab} href={`/search/people?q=${qParam}`}>
            People
          </Link>
          <Link className={styles.tab} href={`/search/hashtags?q=${qParam}`}>
            Hashtags
          </Link>
          <Link className={styles.tab} href={`/search/reels?q=${qParam}`}>
            Reels
          </Link>
          <Link className={styles.tab} href={`/search/post?q=${qParam}`}>
            Posts
          </Link>
        </div>
      </div>

      <div className={styles.body}>
        {!normalized ? (
          <div className={styles.muted}>Type to search.</div>
        ) : null}
        {loading ? <div className={styles.muted}>Searching…</div> : null}
        {error ? <div className={styles.error}>{error}</div> : null}

        {normalized ? (
          <>
            {people.length ? (
              <>
                <div className={styles.sectionHeader}>
                  <div className={styles.sectionTitle}>People</div>
                  <Link
                    className={styles.tab}
                    href={`/search/people?q=${qParam}`}
                  >
                    See all
                  </Link>
                </div>
                {people.slice(0, 12).map((p) => (
                  <div
                    key={p.userId}
                    className={styles.row}
                    onClick={async () => {
                      await addToHistory({
                        kind: "profile",
                        userId: p.userId,
                        username: p.username,
                        displayName: p.displayName,
                        avatarUrl: p.avatarUrl,
                      });
                      router.push(`/profile/${encodeURIComponent(p.userId)}`);
                    }}
                  >
                    <Image
                      src={p.avatarUrl || DEFAULT_AVATAR_URL}
                      alt=""
                      width={42}
                      height={42}
                      className={styles.avatar}
                    />
                    <div className={styles.meta}>
                      <div className={styles.label}>
                        <span className={styles.nameWithBadge}>
                          {p.displayName}
                          <VerifiedBadge visible={p.isCreatorVerified} />
                        </span>
                      </div>
                      <div className={styles.subtitle}>@{p.username}</div>
                    </div>
                  </div>
                ))}
              </>
            ) : null}

            {hashtags.length ? (
              <>
                <div className={styles.sectionHeader}>
                  <div className={styles.sectionTitle}>Hashtags</div>
                  <Link
                    className={styles.tab}
                    href={`/search/hashtags?q=${qParam}`}
                  >
                    See all
                  </Link>
                </div>
                {hashtags.slice(0, 10).map((t) => (
                  <div
                    key={t.id}
                    className={styles.row}
                    onClick={async () => {
                      await addToHistory({ kind: "hashtag", tag: t.name });
                      router.push(`/hashtag/${encodeURIComponent(t.name)}`);
                    }}
                  >
                    <HashTile className={styles.hashTile} />
                    <div className={styles.meta}>
                      <div className={styles.label}>#{t.name}</div>
                      <div className={styles.subtitle}>
                        {t.usageCount} posts
                      </div>
                    </div>
                  </div>
                ))}
              </>
            ) : null}

            {posts.length ? (
              <>
                <div className={styles.sectionHeader}>
                  <div className={styles.sectionTitle}>Posts</div>
                  <Link
                    className={styles.tab}
                    href={`/search/post?q=${qParam}`}
                  >
                    See all
                  </Link>
                </div>
                <div className={styles.compactFeedWrap}>
                  <HomePage
                    scopeOverride="all"
                    kindsOverride={["post"]}
                    searchQueryOverride={normalized}
                    pageSizeOverride={3}
                    maxItems={3}
                    embedded
                    hideSidebar
                    hideLoadMore
                    cardClassName={styles.compactFeedCard}
                  />
                </div>
              </>
            ) : null}

            {reels.length ? (
              <>
                <div className={styles.sectionHeader}>
                  <div className={styles.sectionTitle}>Reels</div>
                  <Link
                    className={styles.tab}
                    href={`/search/reels?q=${qParam}`}
                  >
                    See all
                  </Link>
                </div>
                <div className={styles.reelsGrid}>
                  {reels.slice(0, 12).map((item) => {
                    const media = item.media?.[0];
                    if (!media) return null;
                    const targetId = (item as any)?.repostOf || item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={styles.reelTile}
                        onClick={async () => {
                          const first = item.media?.[0];
                          const mediaUrl =
                            typeof first?.url === "string" ? first.url : "";
                          const mediaType =
                            first?.type === "video"
                              ? "video"
                              : first?.type === "image"
                                ? "image"
                                : "";
                          await addToHistory({
                            kind: "reel",
                            postId: targetId,
                            content: item.content,
                            mediaUrl,
                            mediaType,
                            authorUsername: item.authorUsername,
                          });
                          router.push(
                            `/reels/${encodeURIComponent(targetId)}?single=1`,
                          );
                        }}
                      >
                        <video
                          className={styles.reelMedia}
                          src={media.url}
                          muted
                          playsInline
                          preload="metadata"
                          onMouseEnter={handleReelEnter}
                          onMouseLeave={handleReelLeave}
                        />
                        <div className={styles.reelBadge}>
                          <IconView />
                          {formatCount(
                            (item.stats as any)?.views ??
                              (item.stats as any)?.impressions,
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : null}

            {!loading &&
            !error &&
            !people.length &&
            !hashtags.length &&
            !posts.length &&
            !reels.length ? (
              <div className={styles.muted}>No results.</div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
