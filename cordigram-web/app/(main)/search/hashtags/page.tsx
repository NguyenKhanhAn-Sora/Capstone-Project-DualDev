"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import styles from "../search.module.css";
import { IconClear, HashTile } from "../_components/search-shared";
import { getStoredAccessToken } from "@/lib/auth";
import { searchHashtags } from "@/lib/api";

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

export default function SearchHashtagsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const { value: query, setValueAndUrl: setQuery } = useDebouncedUrlQueryParam(
    "q",
    250,
  );
  const normalized = useMemo(() => query.trim(), [query]);

  const [items, setItems] = useState<
    Array<{ id: string; name: string; usageCount: number }>
  >([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const autoLoadLockRef = useRef(false);

  useEffect(() => {
    setItems([]);
    setPage(1);
    setHasMore(false);
    setError("");
  }, [normalized]);

  useEffect(() => {
    const token = getStoredAccessToken();
    if (!token) {
      setError("Session expired.");
      return;
    }

    if (!normalized) {
      setItems([]);
      setHasMore(false);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    setError("");

    searchHashtags({ token, query: normalized, limit: 20, page, signal: controller.signal })
      .then((res) => {
        if (cancelled) return;
        const nextItems = res.items ?? [];
        setItems((prev) => (page === 1 ? nextItems : [...prev, ...nextItems]));
        setHasMore(Boolean(res.hasMore));
      })
      .catch((err: any) => {
        if (cancelled) return;
        setError(err?.message || "Search failed");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [normalized, page]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const anchor = loadMoreRef.current;
    if (!anchor) return;
    if (!hasMore) return;
    if (typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        const isVisible = entries.some((entry) => entry.isIntersecting);
        if (!isVisible) return;
        if (autoLoadLockRef.current) return;
        if (loading || !hasMore) return;
        autoLoadLockRef.current = true;
        setPage((p) => p + 1);
      },
      { rootMargin: "600px 0px", threshold: 0 },
    );

    observer.observe(anchor);
    return () => observer.disconnect();
  }, [hasMore, loading, items.length]);

  useEffect(() => {
    if (!loading) autoLoadLockRef.current = false;
  }, [loading]);

  const qParam = encodeURIComponent(searchParams?.get("q") || normalized);

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
            placeholder="Search hashtags"
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
          <Link className={styles.tab} href={`/search?q=${qParam}`}>
            All
          </Link>
          <Link className={styles.tab} href={`/search/people?q=${qParam}`}>
            People
          </Link>
          <Link className={`${styles.tab} ${styles.tabActive}`} href={`/search/hashtags?q=${qParam}`}>
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
        {!normalized ? <div className={styles.muted}>Type to search.</div> : null}
        {loading && page === 1 ? <div className={styles.muted}>Searching…</div> : null}
        {error ? <div className={styles.error}>{error}</div> : null}

        {items.map((t) => (
          <div
            key={t.id}
            className={styles.row}
            onClick={() => router.push(`/hashtag/${encodeURIComponent(t.name)}`)}
          >
            <HashTile className={styles.hashTile} />
            <div className={styles.meta}>
              <div className={styles.label}>#{t.name}</div>
              <div className={styles.subtitle}>{t.usageCount} posts</div>
            </div>
          </div>
        ))}

        {loading && page > 1 ? <div className={styles.muted}>Loading more…</div> : null}
        <div ref={loadMoreRef} style={{ height: 1 }} aria-hidden />
        {!loading && !error && normalized && items.length === 0 ? (
          <div className={styles.muted}>No results.</div>
        ) : null}
      </div>
    </div>
  );
}
