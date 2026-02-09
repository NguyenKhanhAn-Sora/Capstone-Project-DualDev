"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./post-likes-overlay.module.css";
import {
  fetchPostLikes,
  followUser,
  unfollowUser,
  type PostLikeItem,
} from "@/lib/api";
import { getStoredAccessToken } from "@/lib/auth";

type Props = {
  open: boolean;
  closing?: boolean;
  postId: string;
  viewerId?: string;
  onClose: () => void;
};

type ListState = {
  items: PostLikeItem[];
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

export default function PostLikesOverlay(props: Props) {
  const { open, closing, postId, viewerId, onClose } = props;
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const [state, setState] = useState<ListState>({
    items: [],
    nextCursor: null,
    loading: false,
    error: "",
    loadingMore: false,
  });
  const [search, setSearch] = useState("");

  const title = useMemo(() => "Likes", []);
  const filteredItems = useMemo(() => {
    const trimmed = search.trim().toLowerCase();
    if (!trimmed) return state.items;
    return state.items.filter((item) => {
      const display = item.displayName?.toLowerCase() ?? "";
      const username = item.username?.toLowerCase() ?? "";
      return display.includes(trimmed) || username.includes(trimmed);
    });
  }, [search, state.items]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const loadFirstPage = async () => {
    const token = getStoredAccessToken();
    if (!token) {
      setState((p) => ({ ...p, loading: false, error: "Session expired." }));
      return;
    }

    setState((p) => ({ ...p, loading: true, error: "" }));
    try {
      const res = await fetchPostLikes({
        token,
        postId,
        limit: PAGE_SIZE,
      });
      setState({
        items: res.items ?? [],
        nextCursor: res.nextCursor ?? null,
        loading: false,
        error: "",
        loadingMore: false,
      });
    } catch (err: any) {
      console.error(err);
      setState((p) => ({
        ...p,
        loading: false,
        error: err?.message || "Failed to load likes",
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
      const res = await fetchPostLikes({
        token,
        postId,
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
    if (state.items.length || state.loading) return;
    void loadFirstPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, postId]);

  useEffect(() => {
    if (!open) return;
    setSearch("");
  }, [open, postId]);

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
  }, [open, state.nextCursor, state.loading, state.loadingMore]);

  const toggleFollow = async (item: PostLikeItem) => {
    const token = getStoredAccessToken();
    if (!token) return;
    if (viewerId && item.userId === viewerId) return;

    const next = !item.isFollowing;
    setState((p) => ({
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
      setState((p) => ({
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
        e.stopPropagation();
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className={styles.card}
        data-closing={closing ? "1" : "0"}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <div className={styles.title}>{title}</div>
          <button
            className={styles.close}
            type="button"
            onClick={onClose}
            aria-label="Close"
          >
            <IconClose />
          </button>
        </div>

        <div className={styles.searchRow}>
          <input
            className={styles.searchInput}
            type="search"
            placeholder="Search username"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search username"
          />
        </div>

        <div className={styles.list} ref={scrollRef}>
          {state.loading ? (
            <div className={styles.loading}>Loading…</div>
          ) : null}
          {state.error && !state.loading ? (
            <div className={styles.error}>{state.error}</div>
          ) : null}

          {!state.loading && !state.error && !filteredItems.length ? (
            <div className={styles.loading}>
              {search.trim() ? "No matching users" : "No likes yet"}
            </div>
          ) : null}

          {filteredItems.map((item) => (
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
                className={`${styles.followBtn} ${
                  item.isFollowing ? "" : styles.followBtnPrimary
                }`}
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
