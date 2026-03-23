"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import styles from "../search.module.css";
import {
  addSearchHistory,
  searchProfiles,
  type ProfileSearchItem,
} from "@/lib/api";
import { getStoredAccessToken } from "@/lib/auth";
import { IconClear } from "../_components/search-shared";
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

export default function SearchPeoplePage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const { value: query, setValueAndUrl: setQuery } = useDebouncedUrlQueryParam(
    "q",
    250,
  );
  const normalized = useMemo(() => query.trim(), [query]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [items, setItems] = useState<ProfileSearchItem[]>([]);

  useEffect(() => {
    const token = getStoredAccessToken();
    if (!token) {
      setError("Session expired.");
      return;
    }

    if (!normalized) {
      setItems([]);
      setError("");
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");
    searchProfiles({ token, query: normalized, limit: 50 })
      .then((res) => {
        if (cancelled) return;
        setItems(res.items ?? []);
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
    };
  }, [normalized]);

  const qParam = encodeURIComponent(searchParams?.get("q") || normalized);

  const addToHistory = async (p: ProfileSearchItem) => {
    const token = getStoredAccessToken();
    if (!token) return;
    try {
      await addSearchHistory({
        token,
        item: {
          kind: "profile",
          userId: p.userId,
          username: p.username,
          displayName: p.displayName,
          avatarUrl: p.avatarUrl,
        },
      });
    } catch {
      /* best-effort */
    }
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
            placeholder="Search people"
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
          <Link
            className={`${styles.tab} ${styles.tabActive}`}
            href={`/search/people?q=${qParam}`}
          >
            People
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

        <Link className={styles.tab} href={`/search/hashtags?q=${qParam}`}>
          Hashtags
        </Link>
        {items.map((p) => (
          <div
            key={p.userId}
            className={styles.row}
            onClick={async () => {
              await addToHistory(p);
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

        {!loading && !error && normalized && items.length === 0 ? (
          <div className={styles.muted}>No people found.</div>
        ) : null}
      </div>
    </div>
  );
}
