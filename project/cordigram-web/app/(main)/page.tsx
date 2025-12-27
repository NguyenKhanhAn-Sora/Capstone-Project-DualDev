"use client";

import { JSX, useEffect, useMemo, useRef, useState } from "react";
import styles from "./home-feed.module.css";
import {
  fetchFeed,
  likePost,
  unlikePost,
  savePost,
  unsavePost,
  sharePost,
  hidePost,
  reportPost,
  viewPost,
  type FeedItem,
} from "@/lib/api";
import { formatDistanceToNow } from "date-fns";
import { useRequireAuth } from "@/hooks/use-require-auth";

type LocalFlags = {
  liked?: boolean;
  saved?: boolean;
};

type PostViewState = {
  item: FeedItem;
  flags: LocalFlags;
};

const PAGE_SIZE = 12;
const VIEW_DEBOUNCE_MS = 800;

export default function HomePage() {
  const canRender = useRequireAuth();
  const [items, setItems] = useState<PostViewState[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const viewTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map()
  );

  const token = useMemo(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("accessToken");
  }, []);

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
          flags: {},
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

  const onView = (postId: string, durationMs?: number) => {
    if (!token) return;
    const existing = viewTimers.current.get(postId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      viewPost({ token, postId, durationMs }).catch(() => undefined);
    }, VIEW_DEBOUNCE_MS);
    viewTimers.current.set(postId, timer);
  };

  const loadMore = () => {
    if (!hasMore || loading) return;
    load(page + 1);
  };

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
            onLike={onLike}
            onSave={onSave}
            onShare={onShare}
            onHide={onHide}
            onReport={onReport}
            onView={onView}
          />
        ))}

        {loading && <SkeletonList count={3} />}

        {hasMore && !loading && (
          <button className={styles.loadMore} onClick={loadMore}>
            Tải thêm
          </button>
        )}
      </div>
    </div>
  );
}

function FeedCard({
  data,
  liked,
  saved,
  onLike,
  onSave,
  onShare,
  onHide,
  onReport,
  onView,
}: {
  data: FeedItem;
  liked: boolean;
  saved: boolean;
  onLike: (postId: string, liked: boolean) => void;
  onSave: (postId: string, saved: boolean) => void;
  onShare: (postId: string) => void;
  onHide: (postId: string) => void;
  onReport: (postId: string) => void;
  onView: (postId: string, durationMs?: number) => void;
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

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            onView(id);
          }
        });
      },
      { threshold: 0.5 }
    );
    observer.observe(el);
    return () => {
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
            <span className={styles.authorName}>{authorLine}</span>
            <span className={styles.authorSub}>
              {formatDistanceToNow(new Date(createdAt), { addSuffix: true })}
            </span>
          </div>
        </div>
        <button
          className={`${styles.actionBtn} ${styles.actionBtnGhost}`}
          onClick={() => onHide(id)}
        >
          Ẩn
        </button>
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
        <div className={styles.mediaGrid}>
          {media.map((m, idx) => (
            <div key={`${m.url}-${idx}`} className={styles.mediaItem}>
              {m.type === "video" ? (
                <video
                  src={m.url}
                  controls
                  onPlay={() => onView(id, 1000)}
                  style={{ borderRadius: 12 }}
                />
              ) : (
                <img src={m.url} alt="media" />
              )}
            </div>
          ))}
        </div>
      ) : null}

      <div className={styles.actions}>
        <button
          className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
          onClick={() => onLike(id, !liked)}
        >
          {liked ? "♥" : "♡"} {stats.hearts ?? 0}
        </button>
        <button className={styles.actionBtn} onClick={() => onSave(id, !saved)}>
          {saved ? "Đã lưu" : "Lưu"} {stats.saves ?? 0}
        </button>
        <button className={styles.actionBtn} onClick={() => onShare(id)}>
          Chia sẻ {stats.shares ?? 0}
        </button>
        <button className={styles.actionBtnGhost} onClick={() => onReport(id)}>
          Báo cáo
        </button>
      </div>

      <div className={styles.counters}>
        <span>💬 {stats.comments ?? 0}</span>
        <span>👁 {stats.views ?? stats.impressions ?? 0}</span>
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
