"use client";

import { JSX, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./home-feed.module.css";
import {
  fetchFeed,
  hidePost,
  likePost,
  unlikePost,
  savePost,
  unsavePost,
  sharePost,
  reportPost,
  viewPost,
  blockUser,
  followUser,
  unfollowUser,
  type FeedItem,
} from "@/lib/api";
import { formatDistanceToNow } from "date-fns";
import { useRequireAuth } from "@/hooks/use-require-auth";
type LocalFlags = {
  liked?: boolean;
  saved?: boolean;
  following?: boolean;
};
type PostViewState = {
  item: FeedItem;
  flags: LocalFlags;
};

const getUserIdFromToken = (token: string | null): string | undefined => {
  if (!token) return undefined;
  try {
    const parts = token.split(".");
    if (parts.length < 2) return undefined;
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(atob(payload));
    if (json && typeof json.userId === "string") return json.userId;
    if (json && typeof json.sub === "string") return json.sub;
  } catch {
    return undefined;
  }
};

const PAGE_SIZE = 12;
const VIEW_DEBOUNCE_MS = 800;
const VIEW_DWELL_MS = 2000;
const VIEW_COOLDOWN_MS = 60000;

type IconProps = { size?: number; filled?: boolean };

const IconLike = ({ size = 20, filled }: IconProps) => (
  <svg
    aria-hidden
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={filled ? "currentColor" : "none"}
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M6 10h3.2V6.6a2.1 2.1 0 0 1 2.1-2.1c.46 0 .91.16 1.27.45l.22.18c.32.26.51.66.51 1.07V10h3.6a2 2 0 0 1 1.97 2.35l-1 5.3A2.2 2.2 0 0 1 15.43 20H8.2A2.2 2.2 0 0 1 6 17.8Z"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M4 10h2v10H4a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Z"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill={filled ? "currentColor" : "none"}
    />
  </svg>
);

const IconComment = ({ size = 20 }: IconProps) => (
  <svg
    aria-hidden
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M5.5 5.5h13a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H10l-3.6 2.8a.6.6 0 0 1-.96-.48V7.5a2 2 0 0 1 2-2Z"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const IconReup = ({ size = 20 }: IconProps) => (
  <svg
    aria-hidden
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="var(--color-text-muted)"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      stroke="none"
      strokeWidth={1}
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M4.5 3.88l4.432 4.14-1.364 1.46L5.5 7.55V16c0 1.1.896 2 2 2H13v2H7.5c-2.209 0-4-1.79-4-4V7.55L1.432 9.48.068 8.02 4.5 3.88zM16.5 6H11V4h5.5c2.209 0 4 1.79 4 4v8.45l2.068-1.93 1.364 1.46-4.432 4.14-4.432-4.14 1.364-1.46 2.068 1.93V8c0-1.1-.896-2-2-2z"
    ></path>
  </svg>
);

const IconSave = ({ size = 20, filled }: IconProps) => (
  <svg
    aria-hidden
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={filled ? "currentColor" : "none"}
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M7 4.8A1.8 1.8 0 0 1 8.8 3h8.4A1.8 1.8 0 0 1 19 4.8v15.1l-6-3.6-6 3.6Z"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill={filled ? "currentColor" : "none"}
    />
  </svg>
);

const IconEye = ({ size = 20 }: IconProps) => (
  <svg
    aria-hidden
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M2.8 12.4C4.5 8.7 7.7 6.2 12 6.2s7.5 2.5 9.2 6.2c-1.7 3.7-4.9 6.2-9.2 6.2s-7.5-2.5-9.2-6.2Z"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M12 15.4a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8Z"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="12" cy="12" r="1.2" fill="currentColor" />
  </svg>
);

const IconClose = ({ size = 18 }: IconProps) => (
  <svg
    aria-hidden
    width={size}
    height={size}
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M6 6l12 12M18 6 6 18"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
    />
  </svg>
);

const IconDots = ({ size = 18 }: IconProps) => (
  <svg
    aria-hidden
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
  >
    <circle cx="5" cy="12" r="1.8" />
    <circle cx="12" cy="12" r="1.8" />
    <circle cx="19" cy="12" r="1.8" />
  </svg>
);

export default function HomePage() {
  const canRender = useRequireAuth();
  const [items, setItems] = useState<PostViewState[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [blockTarget, setBlockTarget] = useState<{
    userId: string;
    label: string;
  }>();
  const [blocking, setBlocking] = useState(false);
  const [viewerId, setViewerId] = useState<string | undefined>(() =>
    typeof window === "undefined"
      ? undefined
      : getUserIdFromToken(localStorage.getItem("accessToken"))
  );
  const viewTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map()
  );
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const token = useMemo(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("accessToken");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setViewerId(getUserIdFromToken(localStorage.getItem("accessToken")));
  }, [token]);

  const syncStats = useCallback(async () => {
    if (!token) return;
    try {
      const limit = page * PAGE_SIZE;
      const data = await fetchFeed({ token, limit });
      const map = new Map(data.map((item) => [item.id, item]));
      setItems((prev) =>
        prev.map((p) => {
          const updated = map.get(p.item.id);
          if (!updated) return p;
          return {
            ...p,
            item: { ...p.item, stats: updated.stats },
            flags: {
              ...p.flags,
              liked: updated.liked ?? p.flags.liked,
              saved: updated.saved ?? p.flags.saved,
            },
          };
        })
      );
    } catch {}
  }, [page, token]);

  const load = async (nextPage: number) => {
    if (!token) {
      setError("Bạn cần đăng nhập để xem feed");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const limit = nextPage * PAGE_SIZE;
      const data = await fetchFeed({ token, limit });
      setHasMore(data.length >= limit);
      setItems(
        data.map((item) => ({
          item,
          flags: {
            liked: item.liked,
            saved: item.saved,
            following:
              (item as unknown as { following?: boolean }).following ?? false,
          },
        }))
      );
      setPage(nextPage);
    } catch (err) {
      const msg =
        typeof err === "object" && err && "message" in err
          ? (err as { message?: string }).message || "Không tải được feed"
          : "Không tải được feed";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canRender) {
      load(1);
    }
  }, [canRender]);

  const onLike = async (postId: string, liked: boolean) => {
    if (!token) return;
    setItems((prev) =>
      prev.map((p) =>
        p.item.id === postId
          ? {
              ...p,
              item: {
                ...p.item,
                stats: {
                  ...p.item.stats,
                  hearts: Math.max(
                    0,
                    (p.item.stats.hearts ?? 0) + (liked ? 1 : -1)
                  ),
                },
              },
              flags: { ...p.flags, liked },
            }
          : p
      )
    );
    try {
      if (liked) {
        await likePost({ token, postId });
      } else {
        await unlikePost({ token, postId });
      }
      void syncStats();
    } catch {
      setItems((prev) =>
        prev.map((p) =>
          p.item.id === postId
            ? {
                ...p,
                item: {
                  ...p.item,
                  stats: {
                    ...p.item.stats,
                    hearts: Math.max(
                      0,
                      (p.item.stats.hearts ?? 0) + (liked ? -1 : 1)
                    ),
                  },
                },
                flags: { ...p.flags, liked: !liked },
              }
            : p
        )
      );
    }
  };

  const onSave = async (postId: string, saved: boolean) => {
    if (!token) return;
    setItems((prev) =>
      prev.map((p) =>
        p.item.id === postId
          ? {
              ...p,
              flags: { ...p.flags, saved },
              item: {
                ...p.item,
                stats: {
                  ...p.item.stats,
                  saves: Math.max(
                    0,
                    (p.item.stats.saves ?? 0) + (saved ? 1 : -1)
                  ),
                },
              },
            }
          : p
      )
    );
    try {
      if (saved) {
        await savePost({ token, postId });
      } else {
        await unsavePost({ token, postId });
      }
    } catch {
      setItems((prev) =>
        prev.map((p) =>
          p.item.id === postId
            ? {
                ...p,
                flags: { ...p.flags, saved: !saved },
                item: {
                  ...p.item,
                  stats: {
                    ...p.item.stats,
                    saves: Math.max(
                      0,
                      (p.item.stats.saves ?? 0) + (saved ? -1 : 1)
                    ),
                  },
                },
              }
            : p
        )
      );
    }
  };

  const onShare = async (postId: string) => {
    if (!token) return;
    setItems((prev) =>
      prev.map((p) =>
        p.item.id === postId
          ? {
              ...p,
              item: {
                ...p.item,
                stats: {
                  ...p.item.stats,
                  shares: (p.item.stats.shares ?? 0) + 1,
                },
              },
            }
          : p
      )
    );
    try {
      await sharePost({ token, postId });
    } catch {
      setItems((prev) =>
        prev.map((p) =>
          p.item.id === postId
            ? {
                ...p,
                item: {
                  ...p.item,
                  stats: {
                    ...p.item.stats,
                    shares: Math.max(0, (p.item.stats.shares ?? 0) - 1),
                  },
                },
              }
            : p
        )
      );
    }
  };

  const onHide = async (postId: string) => {
    if (!token) return;
    setItems((prev) => prev.filter((p) => p.item.id !== postId));
    try {
      await hidePost({ token, postId });
    } catch {}
  };

  const onReport = async (postId: string) => {
    if (!token) return;
    try {
      await reportPost({ token, postId });
    } catch {}
  };

  const onFollow = async (authorId: string, nextFollow: boolean) => {
    if (!token || !authorId) return;
    setItems((prev) =>
      prev.map((p) =>
        p.item.authorId === authorId
          ? { ...p, flags: { ...p.flags, following: nextFollow } }
          : p
      )
    );
    try {
      if (nextFollow) {
        await followUser({ token, userId: authorId });
      } else {
        await unfollowUser({ token, userId: authorId });
      }
    } catch (err) {
      setItems((prev) =>
        prev.map((p) =>
          p.item.authorId === authorId
            ? { ...p, flags: { ...p.flags, following: !nextFollow } }
            : p
        )
      );
      const message =
        typeof err === "object" && err && "message" in err
          ? (err as { message?: string }).message || "Action failed"
          : "Action failed";
      setError(message);
    }
  };

  const onBlockIntent = (userId?: string, label?: string) => {
    if (!token || !userId) return;
    setBlockTarget({ userId, label: label || "this user" });
  };

  const confirmBlock = async () => {
    if (!token || !blockTarget) return;
    setBlocking(true);
    try {
      await blockUser({ token, userId: blockTarget.userId });
      setItems((prev) =>
        prev.filter(
          (p) => p.item.authorId && p.item.authorId !== blockTarget.userId
        )
      );
      setBlockTarget(undefined);
    } catch (err) {
      const message =
        typeof err === "object" && err && "message" in err
          ? (err as { message?: string }).message || "Block failed"
          : "Block failed";
      setError(message);
    } finally {
      setBlocking(false);
    }
  };

  const onView = (postId: string, durationMs?: number) => {
    if (!token) return;
    const existing = viewTimers.current.get(postId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      viewPost({ token, postId, durationMs }).catch(() => undefined);
    }, VIEW_DEBOUNCE_MS);
    viewTimers.current.set(postId, timer);
  };

  const handleLoadMore = useCallback(() => {
    if (!hasMore || loading) return;
    load(page + 1);
  }, [hasMore, loading, page]);

  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            handleLoadMore();
          }
        });
      },
      { root: null, rootMargin: "200px 0px", threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [handleLoadMore]);

  useEffect(() => {
    if (!canRender || !token) return;
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      void syncStats();
    };
    const intervalId = setInterval(tick, 5000);
    tick();
    return () => clearInterval(intervalId);
  }, [canRender, token, syncStats]);

  if (!canRender) return null;

  return (
    <div className={styles.page}>
      <div className={styles.centerColumn}>
        {error && <div className={styles.errorBox}>{error}</div>}

        {!items.length && !loading && (
          <div className={styles.empty}>Chưa có bài viết nào.</div>
        )}

        {items.map(({ item, flags }) => (
          <FeedCard
            key={item.id}
            data={item}
            liked={Boolean(flags.liked)}
            saved={Boolean(flags.saved)}
            flags={flags}
            onLike={onLike}
            onSave={onSave}
            onShare={onShare}
            onHide={onHide}
            onReport={onReport}
            onView={onView}
            onBlockUser={onBlockIntent}
            viewerId={viewerId}
            onFollow={onFollow}
          />
        ))}

        {loading && <SkeletonList count={3} />}
        <div ref={loadMoreRef} style={{ height: 1 }} aria-hidden />
        {hasMore && !loading && (
          <button className={styles.loadMore} onClick={handleLoadMore}>
            Tải thêm
          </button>
        )}
      </div>

      {blockTarget ? (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true">
          <div className={styles.modalCard}>
            <h3 className={styles.modalTitle}>Block this account?</h3>
            <p className={styles.modalBody}>
              {`You are about to block ${blockTarget.label}. They will no longer be able to interact with you.`}
            </p>
            <div className={styles.modalActions}>
              <button
                className={styles.modalSecondary}
                onClick={() => setBlockTarget(undefined)}
                disabled={blocking}
              >
                Cancel
              </button>
              <button
                className={styles.modalDanger}
                onClick={confirmBlock}
                disabled={blocking}
              >
                {blocking ? "Blocking..." : "Block"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FeedCard({
  data,
  liked,
  saved,
  flags,
  onLike,
  onSave,
  onShare,
  onHide,
  onReport,
  onView,
  onBlockUser,
  viewerId,
  onFollow,
}: {
  data: FeedItem;
  liked: boolean;
  saved: boolean;
  flags: LocalFlags;
  onLike: (postId: string, liked: boolean) => void;
  onSave: (postId: string, saved: boolean) => void;
  onShare: (postId: string) => void;
  onHide: (postId: string) => void;
  onReport: (postId: string) => void;
  onView: (postId: string, durationMs?: number) => void;
  onBlockUser: (userId?: string, label?: string) => void | Promise<void>;
  viewerId?: string;
  onFollow: (authorId: string, nextFollow: boolean) => void;
}) {
  const {
    id,
    authorId,
    authorUsername,
    authorDisplayName,
    authorAvatarUrl,
    author,
    content,
    createdAt,
    media,
    stats,
    mentions,
    hashtags,
    topics,
    location,
  } = data;

  const displayName = authorDisplayName || author?.displayName;
  const username = authorUsername || author?.username;
  const avatarUrl = authorAvatarUrl || author?.avatarUrl;
  const cardRef = useRef<HTMLDivElement | null>(null);
  const dwellTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastViewAt = useRef<number>(0);
  const router = useRouter();

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            if (Date.now() - lastViewAt.current < VIEW_COOLDOWN_MS) return;
            dwellTimer.current = setTimeout(() => {
              lastViewAt.current = Date.now();
              onView(id);
            }, VIEW_DWELL_MS);
          } else if (dwellTimer.current) {
            clearTimeout(dwellTimer.current);
            dwellTimer.current = null;
          }
        });
      },
      { threshold: 0.5 }
    );
    observer.observe(el);
    return () => {
      if (dwellTimer.current) {
        clearTimeout(dwellTimer.current);
      }
      observer.disconnect();
    };
  }, [id, onView]);

  const initials = useMemo(() => {
    const base = displayName?.trim() || username?.trim() || authorId || "?";
    return base.slice(0, 2).toUpperCase();
  }, [displayName, username, authorId]);

  const [collapsed, setCollapsed] = useState(true);
  const [canExpand, setCanExpand] = useState(false);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [mediaIndex, setMediaIndex] = useState(0);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (!menuRef.current) return;
      if (menuRef.current.contains(event.target as Node)) return;
      setMenuOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  useEffect(() => {
    setMediaIndex(0);
  }, [id]);

  useEffect(() => {
    const mediaCount = media?.length ?? 0;
    if (mediaCount === 0) {
      setMediaIndex(0);
      return;
    }
    setMediaIndex((prev) => (prev >= mediaCount ? 0 : prev));
  }, [media]);

  const captionNodes = useMemo(() => {
    if (!content) return null;
    const parts: Array<string | JSX.Element> = [];
    const normalizedMentions = new Set(
      (mentions || []).map((m) => m.toLowerCase())
    );
    const pushText = (text: string, keyBase: string) => {
      const chunks = text.split("\n");
      chunks.forEach((chunk, idx) => {
        if (idx > 0) {
          parts.push(<br key={`${keyBase}-br-${idx}`} />);
        }
        if (chunk) parts.push(chunk);
      });
    };

    const regex = /@([a-zA-Z0-9_.]+)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content))) {
      const start = match.index;
      if (start > lastIndex) {
        pushText(content.slice(lastIndex, start), `text-${start}`);
      }
      const handle = match[1];
      const display = `@${handle}`;
      const canLink =
        normalizedMentions.size === 0 ||
        normalizedMentions.has(handle.toLowerCase());
      if (canLink) {
        parts.push(
          <a
            key={`${handle}-${start}`}
            href={`/profiles/${handle}`}
            className={styles.mentionLink}
          >
            {display}
          </a>
        );
      } else {
        pushText(display, `text-${start}-plain`);
      }
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < content.length) {
      pushText(content.slice(lastIndex), `text-tail-${lastIndex}`);
    }
    return parts;
  }, [content, mentions]);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const measure = () => {
      const lineHeight = parseFloat(getComputedStyle(el).lineHeight || "0");
      if (!lineHeight) return;
      const lines = el.scrollHeight / lineHeight;
      const shouldCollapse = lines > 3.2;
      setCanExpand(shouldCollapse);
      setCollapsed((prev) => (shouldCollapse ? true : false));
    };
    measure();
  }, [content, captionNodes]);

  const authorLine = useMemo(() => {
    if (displayName) return displayName;
    if (username) return `@${username}`;
    if (authorId) return authorId;
    return "Cordigram";
  }, [displayName, username, authorId]);

  const authorOwnerId = authorId || author?.id;
  const isSelf = Boolean(viewerId && authorOwnerId === viewerId);
  const isFollowing = Boolean(flags?.following);

  return (
    <article className={styles.feedCard} ref={cardRef}>
      <header className={styles.feedHeader}>
        <div className={styles.author}>
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={authorLine}
              className={styles.avatarImg}
            />
          ) : (
            <div className={styles.avatar}>{initials}</div>
          )}
          <div className={styles.authorMeta}>
            <div>
              <span className={styles.authorName}>{authorLine}</span>

              {!isSelf && authorOwnerId ? (
                <>
                  <span aria-hidden="true" className={`${styles.followBtn}`}>
                    {" "}
                    ·{" "}
                  </span>
                  <button
                    className={`${styles.followBtn} ${
                      isFollowing
                        ? styles.followBtnMuted
                        : styles.followBtnPrimary
                    }`}
                    onClick={() => onFollow(authorOwnerId, !isFollowing)}
                  >
                    {isFollowing ? "Followed" : "Follow"}
                  </button>
                </>
              ) : null}
            </div>
            <span className={styles.authorSub}>
              {formatDistanceToNow(new Date(createdAt), { addSuffix: true })}
            </span>
          </div>
        </div>
        <div className={styles.headerActions}>
          <div className={styles.menuWrapper} ref={menuRef}>
            <button
              className={`${styles.actionBtn} ${styles.actionBtnGhost}`}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((prev) => !prev)}
            >
              <IconDots size={20} />
            </button>
            {menuOpen ? (
              <div className={styles.menuPopover} role="menu">
                {isSelf ? (
                  <div className={styles.menuContent}>
                    <button
                      className={styles.menuItem}
                      onClick={() => setMenuOpen(false)}
                    >
                      Edit post
                    </button>
                    <button
                      className={styles.menuItem}
                      onClick={() => setMenuOpen(false)}
                    >
                      Edit visibility
                    </button>
                    <button
                      className={styles.menuItem}
                      onClick={() => setMenuOpen(false)}
                    >
                      Mute notifications
                    </button>
                    <button
                      className={styles.menuItem}
                      onClick={() => setMenuOpen(false)}
                    >
                      Copy link
                    </button>
                    <button
                      className={`${styles.menuItem} ${styles.menuItemDanger}`}
                      onClick={() => setMenuOpen(false)}
                    >
                      Delete post
                    </button>
                  </div>
                ) : (
                  <div className={styles.menuContent}>
                    <button
                      className={`${styles.menuItem} ${styles.menuItemDanger}`}
                      onClick={() => {
                        setMenuOpen(false);
                        onBlockUser(authorId || author?.id, authorLine);
                      }}
                    >
                      Block this account
                    </button>
                    <div className={styles.menuHint} aria-hidden>
                      Other actions coming soon.
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>
          <button
            className={`${styles.actionBtn} ${styles.actionBtnGhost}`}
            aria-label="Hide post"
            onClick={() => onHide(id)}
          >
            <IconClose size={22} />
          </button>
        </div>
      </header>

      {content && (
        <div className={styles.contentSection}>
          <div
            ref={contentRef}
            className={`${styles.content} ${styles.contentRich} ${
              styles.contentCollapsible
            } ${collapsed && canExpand ? styles.contentCollapsed : ""}`}
          >
            {captionNodes}
          </div>
          {canExpand && (
            <button
              type="button"
              className={styles.seeMore}
              onClick={() => setCollapsed((prev) => !prev)}
            >
              {collapsed ? "See more" : "Collapse"}
            </button>
          )}
        </div>
      )}

      {(location ||
        Boolean((hashtags?.length || 0) + (topics?.length || 0))) && (
        <div className={styles.contentBlock}>
          {location && (
            <div className={styles.metaRow}>
              <span className={styles.metaLabel}>{location}</span>
            </div>
          )}
          {Boolean((hashtags?.length || 0) + (topics?.length || 0)) && (
            <div className={styles.tags}>
              {hashtags?.map((tag) => (
                <span key={tag} className={styles.tag}>
                  #{tag}
                </span>
              ))}
              {topics?.map((tag) => (
                <span key={tag} className={styles.tag}>
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {media?.length ? (
        <div className={styles.mediaCarousel}>
          {(() => {
            const current = media[mediaIndex];
            if (!current) return null;
            if (current.type === "video") {
              return (
                <video
                  key={`${id}-${mediaIndex}`}
                  src={current.url}
                  controls
                  onPlay={() => onView(id, 1000)}
                  className={styles.mediaVisual}
                />
              );
            }
            return (
              <img
                key={`${id}-${mediaIndex}`}
                src={current.url}
                alt="media"
                className={styles.mediaVisual}
              />
            );
          })()}

          {media.length > 1 ? (
            <>
              <button
                className={`${styles.mediaNavBtn} ${styles.mediaNavLeft}`}
                aria-label="Previous media"
                onClick={() =>
                  setMediaIndex((prev) =>
                    media.length ? (prev - 1 + media.length) % media.length : 0
                  )
                }
              >
                <svg
                  viewBox="0 0 24 24"
                  width="24"
                  height="24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M14.791 5.207 8 12l6.793 6.793a1 1 0 1 1-1.415 1.414l-7.5-7.5a1 1 0 0 1 0-1.414l7.5-7.5a1 1 0 1 1 1.415 1.414z"></path>
                </svg>
              </button>
              <button
                className={`${styles.mediaNavBtn} ${styles.mediaNavRight}`}
                aria-label="Next media"
                onClick={() =>
                  setMediaIndex((prev) =>
                    media.length ? (prev + 1) % media.length : 0
                  )
                }
              >
                <svg
                  viewBox="0 0 24 24"
                  width="24"
                  height="24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M9.209 5.207 16 12l-6.791 6.793a1 1 0 1 0 1.415 1.414l7.5-7.5a1 1 0 0 0 0-1.414l-7.5-7.5a1 1 0 1 0-1.415 1.414z"></path>
                </svg>
              </button>
              <div className={styles.mediaCounter}>
                {mediaIndex + 1}/{media.length}
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      <div className={styles.statRow}>
        <div className={styles.statItem}>
          <span className={styles.statIcon}>
            <IconLike size={18} />
          </span>
          <span>{stats.hearts ?? 0}</span>
        </div>
        <div className={styles.statItem}>
          <span className={styles.statIcon}>
            <IconComment size={18} />
          </span>
          <span>{stats.comments ?? 0}</span>
        </div>
        <div className={styles.statItem}>
          <span className={styles.statIcon}>
            <IconEye size={18} />
          </span>
          <span>{stats.views ?? stats.impressions ?? 0}</span>
        </div>
        <div className={styles.statItem}>
          <span className={styles.statIcon}>
            <IconReup size={18} />
          </span>
          <span>{stats.shares ?? 0}</span>
        </div>
      </div>

      <div className={styles.actionRow}>
        <button
          className={`${styles.actionBtn} ${
            liked ? styles.actionBtnActive : ""
          }`}
          onClick={() => onLike(id, !liked)}
        >
          <IconLike size={20} filled={liked} />
          <span>{liked ? "Liked" : "Like"}</span>
        </button>
        <button
          className={styles.actionBtn}
          onClick={() => router.push(`/post/${id}`)}
        >
          <IconComment size={20} />
          <span>Comment</span>
        </button>
        <button
          className={`${styles.actionBtn} ${
            saved ? styles.actionBtnActive : ""
          }`}
          onClick={() => onSave(id, !saved)}
        >
          <IconSave size={20} filled={saved} />
          <span>{saved ? "Saved" : "Save"}</span>
        </button>
        <button className={styles.actionBtn} onClick={() => onShare(id)}>
          <IconReup size={20} />
          <span>Reup</span>
        </button>
      </div>
    </article>
  );
}

function SkeletonList({ count }: { count: number }) {
  return (
    <div className={styles.loaderRow}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={`${styles.skeleton} ${styles.skeletonCard}`}>
          <div className={styles.topBar}>
            <div className={`${styles.skeleton} ${styles.topBarCircle}`} />
            <div
              className={`${styles.skeleton} ${styles.topBarLine}`}
              style={{ width: "120px" }}
            />
          </div>
          <div
            className={`${styles.skeleton} ${styles.contentLine}`}
            style={{ width: "90%" }}
          />
          <div
            className={`${styles.skeleton} ${styles.contentLine}`}
            style={{ width: "70%" }}
          />
          <div className={`${styles.skeleton} ${styles.mediaPh}`} />
        </div>
      ))}
    </div>
  );
}
