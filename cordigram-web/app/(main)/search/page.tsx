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
import { useTranslations } from "next-intl";
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
import {
  filterFeedItemsByBlockedAuthors,
  filterProfilesByBlockedUsers,
  refreshBlockedUserIds,
} from "@/lib/blocked-users";
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
  const t = useTranslations("search");
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
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const token = getStoredAccessToken();
    if (!token) {
      setBlockedIds(new Set());
      return;
    }
    refreshBlockedUserIds(token)
      .then((ids) => setBlockedIds(ids))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const token = getStoredAccessToken();

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
        setPeople(filterProfilesByBlockedUsers(p.items ?? [], blockedIds));
        setHashtags((t.items ?? []).slice(0, 10));
        setPosts(filterFeedItemsByBlockedAuthors(po.items ?? [], blockedIds));
        setReels(filterFeedItemsByBlockedAuthors(r.items ?? [], blockedIds));
      } catch (err: any) {
        if (cancelled) return;
        setError(err?.message || t("status.searchFailed"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [blockedIds, normalized]);

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
          <div className={styles.title}>{t("title")}</div>
        </div>

        <div className={styles.inputWrap}>
          <input
            className={styles.input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleEnterToSearch}
            placeholder={t("placeholder.all")}
            spellCheck={false}
          />
          {query.trim() ? (
            <button
              className={styles.clearBtn}
              type="button"
              aria-label={t("aria.clear")}
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
            {t("tabs.all")}
          </Link>
          <Link className={styles.tab} href={`/search/people?q=${qParam}`}>
            {t("tabs.people")}
          </Link>
          <Link className={styles.tab} href={`/search/hashtags?q=${qParam}`}>
            {t("tabs.hashtags")}
          </Link>
          <Link className={styles.tab} href={`/search/reels?q=${qParam}`}>
            {t("tabs.reels")}
          </Link>
          <Link className={styles.tab} href={`/search/post?q=${qParam}`}>
            {t("tabs.posts")}
          </Link>
        </div>
      </div>

      <div className={styles.body}>
        {!normalized ? (
          <div className={styles.muted}>{t("status.typeToSearch")}</div>
        ) : null}
        {loading ? <div className={styles.muted}>{t("status.searching")}</div> : null}
        {error ? <div className={styles.error}>{error}</div> : null}

        {normalized ? (
          <>
            {people.length ? (
              <>
                <div className={styles.sectionHeader}>
                  <div className={styles.sectionTitle}>{t("sections.people")}</div>
                  <Link
                    className={styles.tab}
                    href={`/search/people?q=${qParam}`}
                  >
                    {t("seeAll")}
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
                  <div className={styles.sectionTitle}>{t("sections.hashtags")}</div>
                  <Link
                    className={styles.tab}
                    href={`/search/hashtags?q=${qParam}`}
                  >
                    {t("seeAll")}
                  </Link>
                </div>
                {hashtags.slice(0, 10).map((tag) => (
                  <div
                    key={tag.id}
                    className={styles.row}
                    onClick={async () => {
                      await addToHistory({ kind: "hashtag", tag: tag.name });
                      router.push(`/hashtag/${encodeURIComponent(tag.name)}`);
                    }}
                  >
                    <HashTile className={styles.hashTile} />
                    <div className={styles.meta}>
                      <div className={styles.label}>#{tag.name}</div>
                      <div className={styles.subtitle}>
                        {t("usageCount", { count: tag.usageCount })}
                      </div>
                    </div>
                  </div>
                ))}
              </>
            ) : null}

            {posts.length ? (
              <>
                <div className={styles.sectionHeader}>
                  <div className={styles.sectionTitle}>{t("sections.posts")}</div>
                  <Link
                    className={styles.tab}
                    href={`/search/post?q=${qParam}`}
                  >
                    {t("seeAll")}
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
                  <div className={styles.sectionTitle}>{t("sections.reels")}</div>
                  <Link
                    className={styles.tab}
                    href={`/search/reels?q=${qParam}`}
                  >
                    {t("seeAll")}
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
              <div className={styles.muted}>{t("status.noResults")}</div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
