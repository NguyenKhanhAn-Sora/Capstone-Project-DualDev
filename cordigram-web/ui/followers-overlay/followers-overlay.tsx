"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./followers-overlay.module.css";
import {
  fetchFollowers,
  fetchFollowing,
  followUser,
  unfollowUser,
  type FollowListItem,
} from "@/lib/api";
import { getStoredAccessToken } from "@/lib/auth";

export type FollowersOverlayTab = "followers" | "following";

type Props = {
  open: boolean;
  closing?: boolean;
  ownerUserId: string;
  ownerUsername?: string;
  initialTab: FollowersOverlayTab;
  viewerId?: string;
  onClose: () => void;
};

type TabState = {
  items: FollowListItem[];
  nextCursor: string | null;
  loading: boolean;
  error: string;
  loadingMore: boolean;
};

const PAGE_SIZE = 20;
const DEFAULT_AVATAR_URL =
  "https://res.cloudinary.com/doicocgeo/image/upload/v1765850274/user-avatar-default_gfx5bs.jpg";

function IconClose() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M18 6 6 18M6 6l12 12"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  );
}

function toProfileHref(item: { userId: string; username?: string }) {
  return `/profile/${encodeURIComponent(item.userId)}`;
}

export default function FollowersOverlay(props: Props) {
  const {
    open,
    closing,
    ownerUserId,
    ownerUsername,
    initialTab,
    viewerId,
    onClose,
  } = props;

  const [tab, setTab] = useState<FollowersOverlayTab>(initialTab);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const [followers, setFollowers] = useState<TabState>({
    items: [],
    nextCursor: null,
    loading: false,
    error: "",
    loadingMore: false,
  });
  const [following, setFollowing] = useState<TabState>({
    items: [],
    nextCursor: null,
    loading: false,
    error: "",
    loadingMore: false,
  });

  const state = tab === "followers" ? followers : following;
  const setState = tab === "followers" ? setFollowers : setFollowing;

  const title = useMemo(() => {
    const handle = ownerUsername ? `@${ownerUsername}` : "Profile";
    return handle;
  }, [ownerUsername]);

  useEffect(() => {
    if (!open) return;
    setTab(initialTab);
  }, [open, initialTab]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const loadFirstPage = async (which: FollowersOverlayTab) => {
    const token = getStoredAccessToken();
    if (!token) {
      const setter = which === "followers" ? setFollowers : setFollowing;
      setter((p) => ({ ...p, loading: false, error: "Session expired." }));
      return;
    }

    const setter = which === "followers" ? setFollowers : setFollowing;
    setter((p) => ({ ...p, loading: true, error: "" }));

    try {
      const res =
        which === "followers"
          ? await fetchFollowers({
              token,
              userId: ownerUserId,
              limit: PAGE_SIZE,
            })
          : await fetchFollowing({
              token,
              userId: ownerUserId,
              limit: PAGE_SIZE,
            });

      setter({
        items: res.items ?? [],
        nextCursor: res.nextCursor ?? null,
        loading: false,
        error: "",
        loadingMore: false,
      });
    } catch (err: any) {
      console.error(err);
      setter((p) => ({
        ...p,
        loading: false,
        error: err?.message || "Failed to load list",
      }));
    }
  };

  const loadMore = async () => {
    if (!open) return;
    if (state.loading || state.loadingMore) return;
    if (!state.nextCursor) return;

    const token = getStoredAccessToken();
    if (!token) {
      setState((p) => ({ ...p, error: "Session expired." }));
      return;
    }

    const cursor = state.nextCursor;
    setState((p) => ({ ...p, loadingMore: true, error: "" }));

    try {
      const res =
        tab === "followers"
          ? await fetchFollowers({
              token,
              userId: ownerUserId,
              limit: PAGE_SIZE,
              cursor,
            })
          : await fetchFollowing({
              token,
              userId: ownerUserId,
              limit: PAGE_SIZE,
              cursor,
            });

      setState((p) => ({
        ...p,
        items: [...p.items, ...(res.items ?? [])],
        nextCursor: res.nextCursor ?? null,
        loadingMore: false,
      }));
    } catch (err: any) {
      console.error(err);
      setState((p) => ({
        ...p,
        loadingMore: false,
        error: err?.message || "Failed to load more",
      }));
    }
  };

  useEffect(() => {
    if (!open) return;
    const current = tab === "followers" ? followers : following;
    if (current.items.length || current.loading) return;
    loadFirstPage(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tab]);

  useEffect(() => {
    if (!open) return;
    const root = scrollRef.current;
    const target = sentinelRef.current;
    if (!root || !target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          loadMore();
        }
      },
      { root, rootMargin: "700px 0px", threshold: 0.01 },
    );

    observer.observe(target);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tab, state.nextCursor, state.loading, state.loadingMore]);

  const toggleFollow = async (item: FollowListItem) => {
    const token = getStoredAccessToken();
    if (!token) return;
    if (viewerId && item.userId === viewerId) return;

    const next = !item.isFollowing;

    setFollowers((p) => ({
      ...p,
      items: p.items.map((u) =>
        u.userId === item.userId ? { ...u, isFollowing: next } : u,
      ),
    }));
    setFollowing((p) => ({
      ...p,
      items: p.items.map((u) =>
        u.userId === item.userId ? { ...u, isFollowing: next } : u,
      ),
    }));

    try {
      if (next) {
        await followUser({ token, userId: item.userId });
      } else {
        await unfollowUser({ token, userId: item.userId });
      }
    } catch (err) {
      console.error(err);
      // revert
      setFollowers((p) => ({
        ...p,
        items: p.items.map((u) =>
          u.userId === item.userId ? { ...u, isFollowing: !next } : u,
        ),
      }));
      setFollowing((p) => ({
        ...p,
        items: p.items.map((u) =>
          u.userId === item.userId ? { ...u, isFollowing: !next } : u,
        ),
      }));
    }
  };

  if (!open) return null;

  return (
    <div
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.card} data-closing={closing ? "1" : "0"}>
        <div className={styles.header}>
          <div className={styles.titleWrap}>
            <div className={styles.title}>{title}</div>
          </div>
          <button
            className={styles.close}
            type="button"
            onClick={onClose}
            aria-label="Close"
          >
            <IconClose />
          </button>
        </div>

        <div className={styles.tabs}>
          <button
            type="button"
            className={`${styles.tab} ${tab === "followers" ? styles.tabActive : ""}`}
            onClick={() => setTab("followers")}
          >
            Followers
          </button>
          <button
            type="button"
            className={`${styles.tab} ${tab === "following" ? styles.tabActive : ""}`}
            onClick={() => setTab("following")}
          >
            Following
          </button>
        </div>

        <div className={styles.list} ref={scrollRef}>
          {state.loading ? (
            <div className={styles.loading}>Loading…</div>
          ) : null}
          {state.error && !state.loading ? (
            <div className={styles.error}>{state.error}</div>
          ) : null}

          {!state.loading && !state.error && !state.items.length ? (
            <div className={styles.loading}>No users yet</div>
          ) : null}

          {state.items.map((item) => (
            <div key={item.userId} className={styles.row}>
              <Link
                href={toProfileHref(item)}
                aria-label={`View ${item.username} profile`}
              >
                <img
                  className={styles.avatar}
                  src={item.avatarUrl || DEFAULT_AVATAR_URL}
                  alt=""
                  loading="lazy"
                />
              </Link>
              <div className={styles.identity}>
                <Link href={toProfileHref(item)} className={styles.displayName}>
                  {item.displayName || item.username}
                </Link>
                <div className={styles.username}>@{item.username}</div>
              </div>
              <button
                type="button"
                className={`${styles.followBtn} ${item.isFollowing ? "" : styles.followBtnPrimary}`}
                onClick={() => toggleFollow(item)}
                disabled={Boolean(viewerId && item.userId === viewerId)}
              >
                {viewerId && item.userId === viewerId
                  ? "You"
                  : item.isFollowing
                    ? "Following"
                    : "Follow"}
              </button>
            </div>
          ))}

          {state.loadingMore ? (
            <div className={styles.loading}>Loading more…</div>
          ) : null}
          <div ref={sentinelRef} className={styles.sentinel} />
        </div>
      </div>
    </div>
  );
}
