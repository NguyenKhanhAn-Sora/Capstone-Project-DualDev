"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./poll-voters-overlay.module.css";
import {
  fetchPollVoters,
  followUser,
  unfollowUser,
  type PostLikeItem,
} from "@/lib/api";
import { getStoredAccessToken } from "@/lib/auth";
import { useLanguage } from "@/component/language-provider";

type Props = {
  open: boolean;
  closing?: boolean;
  pollId: string;
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

function toProfileHref(item: { userId: string }) {
  return `/profile/${encodeURIComponent(item.userId)}`;
}

export default function PollVotersOverlay(props: Props) {
  const { open, closing, pollId, viewerId, onClose } = props;
  const { t } = useLanguage();
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

  const loadMore = async (cursor: string) => {
    const token = getStoredAccessToken();
    if (!token) return;
    setState((p) => ({ ...p, loadingMore: true, error: "" }));
    try {
      const res = await fetchPollVoters({ token, pollId, limit: PAGE_SIZE, cursor });
      setState((p) => ({
        ...p,
        items: [...p.items, ...(res.items ?? [])],
        nextCursor: res.nextCursor ?? null,
        loadingMore: false,
      }));
    } catch (err: any) {
      setState((p) => ({
        ...p,
        loadingMore: false,
        error: err?.message || t("pollVotersOverlay.failedToLoadMore"),
      }));
    }
  };

  // Reset + load in a single effect to avoid state-flip race between two separate effects
  useEffect(() => {
    if (!open) return;
    setSearch("");
    setState({ items: [], nextCursor: null, loading: true, error: "", loadingMore: false });
    let cancelled = false;
    const token = getStoredAccessToken();
    if (!token) {
      setState((p) => ({ ...p, loading: false, error: t("pollVotersOverlay.sessionExpired") }));
      return;
    }
    fetchPollVoters({ token, pollId, limit: PAGE_SIZE })
      .then((res) => {
        if (cancelled) return;
        setState({
          items: res.items ?? [],
          nextCursor: res.nextCursor ?? null,
          loading: false,
          error: "",
          loadingMore: false,
        });
      })
      .catch((err: any) => {
        if (cancelled) return;
        setState((p) => ({
          ...p,
          loading: false,
          error: err?.message || t("pollVotersOverlay.failedToLoad"),
        }));
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pollId]);

  useEffect(() => {
    if (!open || !state.nextCursor || state.loading || state.loadingMore) return;
    const root = scrollRef.current;
    const target = sentinelRef.current;
    if (!root || !target) return;
    const cursor = state.nextCursor;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadMore(cursor);
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
    } catch {
      setState((p) => ({
        ...p,
        items: p.items.map((u) =>
          u.userId === item.userId ? { ...u, isFollowing: !next } : u,
        ),
      }));
    }
  };

  if (!open) return null;

  return createPortal(
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
          <div className={styles.title}>{t("pollVotersOverlay.title")}</div>
          <button
            className={styles.close}
            type="button"
            onClick={onClose}
            aria-label={t("pollVotersOverlay.close")}
          >
            <IconClose />
          </button>
        </div>

        <div className={styles.searchRow}>
          <input
            className={styles.searchInput}
            type="search"
            placeholder={t("pollVotersOverlay.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label={t("pollVotersOverlay.searchPlaceholder")}
          />
        </div>

        <div className={styles.list} ref={scrollRef}>
          {state.loading ? (
            <div className={styles.loading}>{t("pollVotersOverlay.loading")}</div>
          ) : null}
          {state.error && !state.loading ? (
            <div className={styles.error}>{state.error}</div>
          ) : null}
          {!state.loading && !state.error && !filteredItems.length ? (
            <div className={styles.loading}>
              {search.trim() ? t("pollVotersOverlay.noMatchingUsers") : t("pollVotersOverlay.noVotesYet")}
            </div>
          ) : null}

          {filteredItems.map((item) => (
            <div key={item.userId} className={styles.row}>
              <Link href={toProfileHref(item)} aria-label={t("pollVotersOverlay.viewProfile", { username: item.username ?? "" })}>
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
                  ? t("pollVotersOverlay.you")
                  : item.isFollowing
                    ? t("pollVotersOverlay.following")
                    : t("pollVotersOverlay.follow")}
              </button>
            </div>
          ))}

          {state.loadingMore ? (
            <div className={styles.loading}>{t("pollVotersOverlay.loadingMore")}</div>
          ) : null}
          <div ref={sentinelRef} className={styles.sentinel} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
