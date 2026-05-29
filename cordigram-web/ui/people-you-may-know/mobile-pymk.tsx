"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import styles from "./mobile-pymk.module.css";
import {
  fetchPeopleSuggestions,
  followUser,
  unfollowUser,
  type PeopleSuggestionItem,
} from "@/lib/api";

const CACHE_KEY = "mobilePymk:v1";
const CACHE_TTL_MS = 30 * 60 * 1000;

type CacheEntry = { items: PeopleSuggestionItem[]; ts: number };

function readCache(): PeopleSuggestionItem[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry;
    if (Date.now() - entry.ts > CACHE_TTL_MS) { localStorage.removeItem(CACHE_KEY); return null; }
    return entry.items;
  } catch { return null; }
}

function writeCache(items: PeopleSuggestionItem[]) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ items, ts: Date.now() })); } catch {}
}

export default function MobilePymk({ token }: { token: string | null }) {
  const t = useTranslations("peopleSuggestions");

  const [items, setItems] = useState<PeopleSuggestionItem[]>(() => readCache() ?? []);
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [followingIds, setFollowingIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!token || dismissed) return;
    const cached = readCache();
    if (cached) { setItems(cached); return; }
    setLoading(true);
    fetchPeopleSuggestions({ token, limit: 12 })
      .then((res) => {
        const next = res.items ?? [];
        setItems(next);
        writeCache(next);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token, dismissed]);

  const handleFollow = useCallback(async (userId: string, isFollowing: boolean) => {
    if (!token) return;
    setFollowingIds((prev) => {
      const next = new Set(prev);
      isFollowing ? next.delete(userId) : next.add(userId);
      return next;
    });
    try {
      if (isFollowing) { await unfollowUser({ token, userId }); }
      else { await followUser({ token, userId }); }
    } catch {
      setFollowingIds((prev) => {
        const next = new Set(prev);
        isFollowing ? next.add(userId) : next.delete(userId);
        return next;
      });
    }
  }, [token]);

  if (dismissed || (!loading && !items.length)) return null;

  const SKELETONS = 5;

  return (
    <div className={styles.root}>
      {/* Header — "People You May Know" + dismiss X */}
      <div className={styles.header}>
        <span className={styles.title}>{t("title")}</span>
        <button
          type="button"
          className={styles.dismiss}
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
        >
          <svg aria-hidden width={18} height={18} viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      {/* Horizontal scroll strip — 132px wide cards giống Flutter */}
      <div className={styles.scroll}>
        {loading && !items.length
          ? Array.from({ length: SKELETONS }).map((_, i) => (
              <div key={i} className={`${styles.card} ${styles.skeletonCard}`}>
                <div className={styles.skeletonAvatar} />
                <div className={styles.skeletonLine} />
                <div className={styles.skeletonLineShort} />
                <div className={styles.skeletonBtn} />
              </div>
            ))
          : items.map((item) => {
              const name = item.displayName || item.username || "User";
              const initial = name.trim().charAt(0).toUpperCase();
              const isFollowing = item.isFollowing || followingIds.has(item.userId);

              return (
                <div key={item.userId} className={styles.card}>
                  <Link
                    href={`/profile/${item.userId}`}
                    style={{ display: "contents", textDecoration: "none" }}
                  >
                    <div className={styles.avatarWrap}>
                      {item.avatarUrl ? (
                        <Image
                          src={item.avatarUrl}
                          alt={name}
                          width={60}
                          height={60}
                          className={styles.avatar}
                        />
                      ) : (
                        <span className={styles.avatarFallback}>{initial}</span>
                      )}
                    </div>
                    <p className={styles.name}>{name}</p>
                    <p className={styles.username}>@{item.username}</p>
                  </Link>

                  <button
                    type="button"
                    className={`${styles.followBtn} ${isFollowing ? styles.followBtnActive : ""}`}
                    onClick={(e) => {
                      e.preventDefault();
                      handleFollow(item.userId, isFollowing);
                    }}
                  >
                    {isFollowing ? t("following") : `+ ${t("follow")}`}
                  </button>
                </div>
              );
            })}
      </div>

      <div className={styles.divider} />
    </div>
  );
}
