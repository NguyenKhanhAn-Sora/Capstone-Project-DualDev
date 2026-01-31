"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import styles from "./people-you-may-know.module.css";
import {
  fetchPeopleSuggestions,
  followUser,
  unfollowUser,
  type ApiError,
  type PeopleSuggestionItem,
} from "@/lib/api";

export default function PeopleYouMayKnow({
  token,
  limit = 8,
}: {
  token: string | null;
  limit?: number;
}) {
  const expandedLimit = 20;
  const collapsedLimit = Math.min(limit, 8);
  const [items, setItems] = useState<PeopleSuggestionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [followingIds, setFollowingIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [expanded, setExpanded] = useState(false);

  const canLoad = Boolean(token);

  const mergedItems = useMemo(() => {
    if (!items.length) return [];
    if (!followingIds.size) return items;
    return items.map((it) => ({
      ...it,
      isFollowing: it.isFollowing || followingIds.has(it.userId),
    }));
  }, [items, followingIds]);

  const load = useCallback(
    async (nextLimit?: number) => {
      if (!token) return;
      setLoading(true);
      setError("");
      try {
        const res = await fetchPeopleSuggestions({
          token,
          limit: nextLimit ?? limit,
        });
        setItems(res.items || []);
      } catch (e) {
        const err = e as ApiError;
        setError(err?.message || "Failed to load suggestions");
        setItems([]);
      } finally {
        setLoading(false);
      }
    },
    [token, limit],
  );

  useEffect(() => {
    if (!canLoad) return;
    load();
  }, [canLoad, load]);

  const visibleItems = useMemo(() => {
    if (expanded) return mergedItems;
    return mergedItems.slice(0, collapsedLimit);
  }, [collapsedLimit, expanded, mergedItems]);

  const onToggleExpanded = useCallback(async () => {
    const nextExpanded = !expanded;
    setExpanded(nextExpanded);
    await load(nextExpanded ? expandedLimit : limit);
  }, [expanded, expandedLimit, limit, load]);

  const onToggleFollow = useCallback(
    async (userId: string, isFollowing: boolean) => {
      if (!token) return;
      setError("");
      try {
        if (isFollowing) {
          await unfollowUser({ token, userId });
          setFollowingIds((prev) => {
            const next = new Set(prev);
            next.delete(userId);
            return next;
          });
        } else {
          await followUser({ token, userId });
          setFollowingIds((prev) => {
            const next = new Set(prev);
            next.add(userId);
            return next;
          });
        }
      } catch (e) {
        const err = e as ApiError;
        setError(err?.message || "Failed to update follow");
      }
    },
    [token],
  );

  if (!token) return null;

  return (
    <section className={styles.card} aria-label="People you may know">
      <div className={styles.header}>
        <div className={styles.title}>People you may know</div>
        <div className={styles.headerActions}>
          {mergedItems.length > 0 ? (
            <button
              type="button"
              className={styles.seeAllBtn}
              onClick={onToggleExpanded}
              disabled={loading}
            >
              {expanded ? "Show less" : "See all"}
            </button>
          ) : null}
        </div>
      </div>

      {error ? <div className={styles.error}>{error}</div> : null}

      {loading && !mergedItems.length ? (
        <div className={styles.skeletonList}>
          {Array.from({ length: Math.min(collapsedLimit, 6) }).map((_, i) => (
            <div key={i} className={styles.skeletonRow} />
          ))}
        </div>
      ) : null}

      {!loading && !mergedItems.length ? (
        <div className={styles.empty}>No suggestions right now.</div>
      ) : null}

      <div className={styles.list}>
        {visibleItems.map((u) => (
          <div key={u.userId} className={styles.row}>
            <Link href={`/profile/${u.userId}`} className={styles.userLink}>
              <div className={styles.avatar}>
                {u.avatarUrl ? (
                  <Image
                    src={u.avatarUrl}
                    alt={u.displayName}
                    width={40}
                    height={40}
                    className={styles.avatarImg}
                  />
                ) : (
                  <span className={styles.avatarFallback}>
                    {(u.displayName || u.username || "U")
                      .trim()
                      .charAt(0)
                      .toUpperCase()}
                  </span>
                )}
              </div>

              <div className={styles.meta}>
                <div className={styles.displayName}>{u.displayName}</div>
                <div className={styles.subLine}>
                  <span className={styles.username}>@{u.username}</span>
                </div>
              </div>
            </Link>

            <button
              className={styles.followBtn}
              onClick={() => onToggleFollow(u.userId, Boolean(u.isFollowing))}
            >
              {u.isFollowing ? "Following" : "Follow"}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
