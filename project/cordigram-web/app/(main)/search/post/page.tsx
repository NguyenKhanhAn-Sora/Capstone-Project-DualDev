"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import styles from "../search.module.css";
import { IconClear } from "../_components/search-shared";
import HomePage from "../../page";

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

export default function SearchPostsPage() {
  const searchParams = useSearchParams();

  const { value: query, setValueAndUrl: setQuery } = useDebouncedUrlQueryParam(
    "q",
    250,
  );
  const normalized = useMemo(() => query.trim(), [query]);
  const qParam = encodeURIComponent(searchParams?.get("q") || normalized);
  const kindsOverride = useMemo(() => ["post"] as Array<"post" | "reel">, []);

  const header = (
    <div className={styles.header}>
      <div className={styles.titleRow}>
        <div className={styles.title}>Search</div>
      </div>

      <div className={styles.inputWrap}>
        <input
          className={styles.input}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search posts"
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
        <Link className={styles.tab} href={`/search/reels?q=${qParam}`}>
          Reels
        </Link>
        <Link
          className={`${styles.tab} ${styles.tabActive}`}
          href={`/search/post?q=${qParam}`}
        >
          Posts
        </Link>
      </div>
    </div>
  );

  if (!normalized) {
    return (
      <div className={styles.page}>
        {header}
        <div className={styles.body}>
          <div className={styles.muted}>Type to search.</div>
        </div>
      </div>
    );
  }

  // Reuse the exact Home newfeed UI + interactions.
  // HomePage already supports searchQueryOverride and uses trending sort.
  return (
    <HomePage
      scopeOverride="all"
      kindsOverride={kindsOverride}
      searchQueryOverride={normalized}
      headerSlot={header}
    />
  );
}
