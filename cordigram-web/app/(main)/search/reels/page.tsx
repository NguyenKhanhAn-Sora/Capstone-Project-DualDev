"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import styles from "../search.module.css";
import { addSearchHistory, searchPosts, type FeedItem } from "@/lib/api";
import { getStoredAccessToken } from "@/lib/auth";
import {
  filterFeedItemsByBlockedAuthors,
  refreshBlockedUserIds,
} from "@/lib/blocked-users";
import { IconClear, IconView, formatCount } from "../_components/search-shared";

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

export default function SearchReelsPage() {
  const t = useTranslations("search");
  const router = useRouter();
  const searchParams = useSearchParams();

  const { value: query, setValueAndUrl: setQuery } = useDebouncedUrlQueryParam(
    "q",
    250,
  );
  const normalized = useMemo(() => query.trim(), [query]);

  const [items, setItems] = useState<FeedItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
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
    setItems([]);
    setPage(1);
    setHasMore(false);
    setError("");
  }, [normalized]);

  useEffect(() => {
    const token = getStoredAccessToken();

    if (!normalized) {
      setItems([]);
      setHasMore(false);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");
    searchPosts({ token, query: normalized, limit: 24, page, kinds: ["reel"] })
      .then((res) => {
        if (cancelled) return;
        const filtered = filterFeedItemsByBlockedAuthors(
          res.items ?? [],
          blockedIds,
        );
        setItems((prev) =>
          page === 1 ? filtered : [...prev, ...filtered],
        );
        setHasMore(Boolean(res.hasMore));
      })
      .catch((err: any) => {
        if (cancelled) return;
        setError(err?.message || t("status.searchFailed"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [blockedIds, normalized, page]);

  const qParam = encodeURIComponent(searchParams?.get("q") || normalized);

  const addToHistory = async (reel: FeedItem, targetId: string) => {
    const token = getStoredAccessToken();
    if (!token) return;
    const first = reel.media?.[0];
    const mediaUrl = typeof first?.url === "string" ? first.url : "";
    const mediaType =
      first?.type === "video"
        ? "video"
        : first?.type === "image"
          ? "image"
          : "";
    try {
      await addSearchHistory({
        token,
        item: {
          kind: "reel",
          postId: targetId,
          content: reel.content,
          mediaUrl,
          mediaType,
          authorUsername: reel.authorUsername,
        },
      });
    } catch {
      /* best-effort */
    }
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
            placeholder={t("placeholder.reels")}
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
          <Link className={styles.tab} href={`/search?q=${qParam}`}>
            {t("tabs.all")}
          </Link>
          <Link className={styles.tab} href={`/search/people?q=${qParam}`}>
            {t("tabs.people")}
          </Link>
          <Link
            className={`${styles.tab} ${styles.tabActive}`}
            href={`/search/reels?q=${qParam}`}
          >
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
        {loading && page === 1 ? (
          <div className={styles.muted}>{t("status.searching")}</div>
        ) : null}
        <Link className={styles.tab} href={`/search/hashtags?q=${qParam}`}>
          {t("tabs.hashtags")}
        </Link>
        {error ? <div className={styles.error}>{error}</div> : null}

        {items.length ? (
          <div className={styles.reelsGrid}>
            {items.map((item) => {
              const media = item.media?.[0];
              if (!media) return null;
              const targetId = (item as any)?.repostOf || item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={styles.reelTile}
                  onClick={async () => {
                    await addToHistory(item, targetId);
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
                    onMouseEnter={handleEnter}
                    onMouseLeave={handleLeave}
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
        ) : !loading && !error && normalized ? (
          <div className={styles.muted}>{t("status.noReels")}</div>
        ) : null}

        {hasMore ? (
          <button
            className={styles.loadMore}
            type="button"
            disabled={loading}
            onClick={() => setPage((p) => p + 1)}
          >
            {loading ? t("status.loading") : t("loadMore")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
