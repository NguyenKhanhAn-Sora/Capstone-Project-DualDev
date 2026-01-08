"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import type { JSX, MutableRefObject } from "react";
import { createPortal } from "react-dom";
import { formatDistanceToNow } from "date-fns";
import EmojiPicker from "emoji-picker-react";
import {
  createComment,
  fetchComments,
  likeComment,
  type CommentItem,
  unlikeComment,
  updateComment,
  deleteComment,
  reportComment,
  blockUser,
} from "@/lib/api";
import postStyles from "../post/post.module.css";
import styles from "./reel.module.css";

const COMMENT_POLL_INTERVAL = 4000;
const COMMENT_PAGE_SIZE = 20;

const formatCompactDistance = (value?: string | number | Date) => {
  if (!value) return "Just now";
  const raw = formatDistanceToNow(new Date(value), { addSuffix: true });
  return raw.replace(/^about\s+/i, "").replace(/\s+ago$/i, "");
};

type ReelCommentsProps = {
  postId?: string;
  token: string | null;
  open: boolean;
  onClose: () => void;
  panelRef?: MutableRefObject<HTMLElement | null>;
  viewerId?: string;
  postAuthorId?: string;
  initialCount?: number;
  onTotalChange?: (postId: string, total: number) => void;
};

type ReplyState = {
  items: CommentItem[];
  page: number;
  hasMore: boolean;
  loading: boolean;
  expanded: boolean;
  error?: string;
};

const ensureId = (item: CommentItem): string =>
  item.id || `${item.postId}-${item.createdAt ?? Date.now()}`;

type ReportCategory = {
  key:
    | "abuse"
    | "violence"
    | "sensitive"
    | "misinfo"
    | "spam"
    | "ip"
    | "illegal"
    | "privacy"
    | "other";
  label: string;
  accent: string;
  reasons: Array<{ key: string; label: string }>;
};

const REPORT_GROUPS: ReportCategory[] = [
  {
    key: "abuse",
    label: "Harassment / Hate speech",
    accent: "#f59e0b",
    reasons: [
      { key: "harassment", label: "Targets an individual to harass" },
      { key: "hate_speech", label: "Hate speech or discrimination" },
      { key: "offensive_discrimination", label: "Attacks vulnerable groups" },
    ],
  },
  {
    key: "violence",
    label: "Violence / Threats",
    accent: "#ef4444",
    reasons: [
      { key: "violence_threats", label: "Threatens or promotes violence" },
      { key: "graphic_violence", label: "Graphic violent imagery" },
      { key: "extremism", label: "Extremism or terrorism" },
      { key: "self_harm", label: "Self-harm or suicide" },
    ],
  },
  {
    key: "sensitive",
    label: "Sensitive content",
    accent: "#a855f7",
    reasons: [
      { key: "nudity", label: "Nudity or adult content" },
      { key: "minor_nudity", label: "Minor safety risk" },
      { key: "sexual_solicitation", label: "Sexual solicitation" },
    ],
  },
  {
    key: "misinfo",
    label: "Impersonation / Misinformation",
    accent: "#22c55e",
    reasons: [
      { key: "fake_news", label: "False or misleading information" },
      { key: "impersonation", label: "Impersonation of a person or org" },
    ],
  },
  {
    key: "spam",
    label: "Spam / Scam",
    accent: "#14b8a6",
    reasons: [
      { key: "spam", label: "Spam or irrelevant content" },
      { key: "financial_scam", label: "Financial scam" },
      { key: "unsolicited_ads", label: "Unwanted advertising" },
    ],
  },
  {
    key: "ip",
    label: "Intellectual property",
    accent: "#3b82f6",
    reasons: [
      { key: "copyright", label: "Copyright infringement" },
      { key: "trademark", label: "Trademark violation" },
      { key: "brand_impersonation", label: "Brand impersonation" },
    ],
  },
  {
    key: "illegal",
    label: "Illegal activity",
    accent: "#f97316",
    reasons: [
      { key: "contraband", label: "Contraband" },
      { key: "illegal_transaction", label: "Illegal transaction" },
    ],
  },
  {
    key: "privacy",
    label: "Privacy violation",
    accent: "#06b6d4",
    reasons: [
      { key: "doxxing", label: "Doxxing private information" },
      {
        key: "nonconsensual_intimate",
        label: "Non-consensual intimate content",
      },
    ],
  },
  {
    key: "other",
    label: "Other",
    accent: "#94a3b8",
    reasons: [{ key: "other", label: "Other reason" }],
  },
];

const IconLike = ({ filled }: { filled?: boolean }) => (
  <svg
    aria-hidden
    width="16"
    height="16"
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

const IconMoreHorizontal = ({ size = 18 }: { size?: number }) => (
  <svg
    aria-hidden
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <circle cx="5" cy="12" r="2" fill="currentColor" />
    <circle cx="12" cy="12" r="2" fill="currentColor" />
    <circle cx="19" cy="12" r="2" fill="currentColor" />
  </svg>
);

export default function ReelComments({
  postId,
  token,
  open,
  onClose,
  panelRef,
  viewerId,
  postAuthorId,
  initialCount,
  onTotalChange,
}: ReelCommentsProps) {
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [totalCount, setTotalCount] = useState<number>(initialCount ?? 0);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [replyTarget, setReplyTarget] = useState<{
    id: string;
    username?: string;
  } | null>(null);
  const [replyState, setReplyState] = useState<Record<string, ReplyState>>({});
  const [openCommentMenuId, setOpenCommentMenuId] = useState<string | null>(
    null
  );
  const [commentMenuClosingId, setCommentMenuClosingId] = useState<
    string | null
  >(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [reportingCommentId, setReportingCommentId] = useState<string | null>(
    null
  );
  const [deleteTarget, setDeleteTarget] = useState<CommentItem | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [blockTarget, setBlockTarget] = useState<{
    id: string;
    label: string;
  } | null>(null);
  const [blocking, setBlocking] = useState(false);
  const [reportCategory, setReportCategory] = useState<
    ReportCategory["key"] | null
  >(null);
  const [reportReason, setReportReason] = useState<string | null>(null);
  const [reportNote, setReportNote] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportError, setReportError] = useState("");
  const [reportClosing, setReportClosing] = useState(false);
  const emojiRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const commentMenuCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const commentRefs = useRef<Record<string, HTMLElement | null>>({});
  const hasDOM = typeof document !== "undefined";

  const updateTotal = useCallback(
    (next: number | ((prev: number) => number)) => {
      setTotalCount((prev) =>
        typeof next === "function"
          ? (next as (p: number) => number)(prev)
          : next
      );
    },
    [onTotalChange, postId]
  );

  useEffect(() => {
    if (!postId || !onTotalChange) return;
    onTotalChange(postId, totalCount);
  }, [onTotalChange, postId, totalCount]);

  const canInteract = useMemo(
    () => Boolean(open && token && postId),
    [open, postId, token]
  );

  const topLevelComments = useMemo(
    () => comments.filter((c) => !c.parentId),
    [comments]
  );

  const selectedReportGroup = useMemo(
    () => REPORT_GROUPS.find((g) => g.key === reportCategory),
    [reportCategory]
  );

  const scrollToComment = useCallback((commentId?: string | null) => {
    if (!commentId) return;
    requestAnimationFrame(() => {
      const el = commentRefs.current[commentId];
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
  }, []);

  const removeCommentSubtree = useCallback((targetId: string) => {
    setComments((prev) =>
      prev.filter(
        (c) =>
          c.id !== targetId &&
          c.parentId !== targetId &&
          c.rootCommentId !== targetId
      )
    );

    setReplyState((prev) => {
      const next: Record<string, ReplyState> = {};
      for (const [parentId, state] of Object.entries(prev)) {
        const filtered = state.items.filter(
          (c) =>
            c.id !== targetId &&
            c.parentId !== targetId &&
            c.rootCommentId !== targetId
        );
        if (parentId === targetId) continue;
        next[parentId] =
          filtered.length !== state.items.length
            ? { ...state, items: filtered }
            : state;
      }
      return next;
    });
  }, []);

  const focusInput = useCallback(() => {
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    });
  }, []);

  const closeCommentMenu = useCallback(() => {
    if (commentMenuCloseTimerRef.current)
      clearTimeout(commentMenuCloseTimerRef.current);
    if (!openCommentMenuId) return;
    const closingId = openCommentMenuId;
    setCommentMenuClosingId(closingId);
    commentMenuCloseTimerRef.current = setTimeout(() => {
      setOpenCommentMenuId(null);
      setCommentMenuClosingId(null);
      commentMenuCloseTimerRef.current = null;
    }, 160);
  }, [openCommentMenuId]);

  const startEditComment = (comment: CommentItem) => {
    if (!token) return;
    closeCommentMenu();
    setReplyTarget(null);
    setEditingCommentId(comment.id);
    setText(comment.content || "");
    focusInput();
  };

  const handleDeleteComment = (comment: CommentItem) => {
    if (!token || !postId) return;
    closeCommentMenu();
    setDeleteTarget(comment);
    setDeleteError("");
  };

  const closeDeleteConfirm = () => {
    if (deleteSubmitting) return;
    setDeleteTarget(null);
    setDeleteError("");
  };

  const confirmDeleteComment = async () => {
    if (!token || !postId || !deleteTarget) return;
    setDeleteSubmitting(true);
    setDeleteError("");
    try {
      const res = await deleteComment({
        token,
        postId,
        commentId: deleteTarget.id,
      });
      removeCommentSubtree(deleteTarget.id);
      const removed = res?.count ?? 1;
      updateTotal((prev) => Math.max(0, prev - removed));
      setDeleteTarget(null);
    } catch (err) {
      setDeleteError(
        (err as { message?: string })?.message || "Failed to delete comment"
      );
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const handleBlockUser = (comment: CommentItem) => {
    if (!token) return;
    const userId = comment.author?.id || comment.authorId;
    const label = comment.author?.username || "this user";
    if (!userId) return;
    closeCommentMenu();
    setBlockTarget({ id: userId, label });
  };

  const closeBlockUserModal = () => {
    if (blocking) return;
    setBlockTarget(null);
  };

  const confirmBlockUser = async () => {
    if (!token || !blockTarget) return;
    setBlocking(true);
    let removed = 0;
    try {
      await blockUser({ token, userId: blockTarget.id });
      setComments((prev) =>
        prev.filter((c) => {
          const keep = (c.author?.id || c.authorId) !== blockTarget.id;
          if (!keep) removed += 1;
          return keep;
        })
      );
      setReplyState((prev) => {
        const next: Record<string, ReplyState> = {};
        for (const [parentId, state] of Object.entries(prev)) {
          const filtered = state.items.filter((c) => {
            const keep = (c.author?.id || c.authorId) !== blockTarget.id;
            if (!keep) removed += 1;
            return keep;
          });
          next[parentId] = { ...state, items: filtered };
        }
        return next;
      });
      if (removed > 0) {
        updateTotal((prev) => Math.max(0, prev - removed));
      }
      setBlockTarget(null);
    } catch (err) {
      setError(
        (err as { message?: string })?.message || "Failed to block user"
      );
    } finally {
      setBlocking(false);
    }
  };

  const handleReportComment = (comment: CommentItem) => {
    closeCommentMenu();
    setReportingCommentId(comment.id);
    setReportCategory(null);
    setReportReason(null);
    setReportNote("");
    setReportClosing(false);
    setReportError("");
  };

  const closeReportModal = () => {
    setReportClosing(true);
    setTimeout(() => {
      setReportingCommentId(null);
      setReportCategory(null);
      setReportReason(null);
      setReportNote("");
      setReportClosing(false);
      setReportError("");
    }, 200);
  };

  const submitReport = async () => {
    if (!token || !reportingCommentId || !postId || !reportReason) return;
    setReportSubmitting(true);
    setReportError("");
    try {
      await reportComment({
        token,
        commentId: reportingCommentId,
        category: reportCategory ?? "other",
        reason: reportReason,
        note: reportNote || undefined,
      });
      setReportSubmitting(false);
      setReportClosing(true);
      setTimeout(() => {
        setReportingCommentId(null);
        setReportCategory(null);
        setReportReason(null);
        setReportNote("");
        setReportClosing(false);
      }, 200);
    } catch (err) {
      setReportSubmitting(false);
      setReportError(
        (err as { message?: string })?.message || "Failed to report comment"
      );
    }
  };

  const handleReplyClick = (targetId: string, username?: string) => {
    setReplyTarget({ id: targetId, username });
    focusInput();
  };

  const renderCommentThread = (
    comment: CommentItem,
    depth = 0
  ): JSX.Element => {
    const replies = replyState[comment.id]?.items ?? [];
    const hasMoreReplies = replyState[comment.id]?.hasMore ?? false;
    const loadingReplies = replyState[comment.id]?.loading ?? false;
    const expanded = replyState[comment.id]?.expanded ?? false;
    const replyCount = comment.repliesCount ?? replies.length;
    const replyCountLabel = replyCount ? ` (${replyCount})` : "";
    const shouldShowRepliesButton =
      loadingReplies || hasMoreReplies || replyCount > 0 || replies.length > 0;

    const fallbackLabel = comment.author?.username;
    const initials = fallbackLabel?.slice(0, 2).toUpperCase();
    const timeAgo = formatCompactDistance(comment.createdAt);
    const authorId = comment.author?.id || comment.authorId;
    const isCommentOwner = Boolean(
      viewerId && authorId && viewerId === authorId
    );
    const isPostOwner = Boolean(
      viewerId && postAuthorId && viewerId === postAuthorId
    );

    const toggleRepliesVisibility = () => {
      const nextExpanded = !expanded;
      setReplyState((prev) => ({
        ...prev,
        [comment.id]: {
          ...(prev[comment.id] ?? {
            items: [],
            page: 0,
            hasMore: true,
            loading: false,
            expanded: false,
          }),
          expanded: nextExpanded,
        },
      }));

      const needsRefresh =
        replies.length === 0 ||
        (loadingReplies === false &&
          ((typeof replyCount === "number" && replyCount > replies.length) ||
            hasMoreReplies));

      if (nextExpanded && !loadingReplies && needsRefresh) {
        loadReplies(comment.id, 1);
      }
    };

    return (
      <div
        key={comment.id}
        className={postStyles.commentRow}
        data-comment-id={comment.id}
        ref={(el) => {
          if (el) {
            commentRefs.current[comment.id] = el;
          } else {
            delete commentRefs.current[comment.id];
          }
        }}
      >
        <div
          className={
            depth > 0 ? postStyles.commentAvatarSmall : postStyles.commentAvatar
          }
        >
          {comment.author?.avatarUrl ? (
            <img
              src={comment.author.avatarUrl}
              alt={fallbackLabel}
              loading="lazy"
            />
          ) : (
            <span>{initials}</span>
          )}
        </div>
        <div className={postStyles.commentBody}>
          <div className={postStyles.commentHeader}>
            <span className={postStyles.commentAuthor}>
              @{fallbackLabel || "user"}
            </span>
          </div>
          <div className={postStyles.commentText}>{comment.content}</div>
          <div className={postStyles.commentActions}>
            <span className={postStyles.commentMeta}>{timeAgo}</span>
            <button
              className={postStyles.linkBtn}
              onClick={() =>
                handleReplyClick(comment.id, comment.author?.username)
              }
              disabled={!token}
            >
              Reply
            </button>
            <button
              className={postStyles.linkBtn}
              onClick={() => toggleLike(comment.id, Boolean(comment.liked))}
              disabled={!token}
              aria-pressed={comment.liked}
            >
              <IconLike filled={comment.liked} />
              <span>{comment.likesCount ?? 0}</span>
            </button>
            <div
              className={postStyles.commentMoreWrap}
              data-comment-menu="true"
            >
              <button
                className={postStyles.commentMoreBtn}
                aria-expanded={openCommentMenuId === comment.id}
                onClick={(e) => {
                  e.stopPropagation();
                  if (commentMenuCloseTimerRef.current)
                    clearTimeout(commentMenuCloseTimerRef.current);
                  setCommentMenuClosingId(null);
                  setOpenCommentMenuId((prev) => {
                    if (prev === comment.id) {
                      setCommentMenuClosingId(comment.id);
                      commentMenuCloseTimerRef.current = setTimeout(() => {
                        setOpenCommentMenuId(null);
                        setCommentMenuClosingId(null);
                        commentMenuCloseTimerRef.current = null;
                      }, 160);
                      return prev;
                    }
                    return comment.id;
                  });
                }}
              >
                <IconMoreHorizontal size={16} />
              </button>
            </div>
            {openCommentMenuId === comment.id && hasDOM
              ? createPortal(
                  <div
                    className={`${postStyles.commentMenuOverlay} ${
                      commentMenuClosingId === comment.id
                        ? postStyles.commentMenuOverlayClosing
                        : postStyles.commentMenuOverlayOpen
                    }`}
                    role="dialog"
                    aria-modal="true"
                    data-comment-menu="true"
                    onClick={closeCommentMenu}
                  >
                    <div
                      className={`${postStyles.commentMenuCard} ${
                        commentMenuClosingId === comment.id
                          ? postStyles.commentMenuCardClosing
                          : postStyles.commentMenuCardOpen
                      }`}
                      data-comment-menu="true"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className={postStyles.commentMenuList}>
                        {isCommentOwner ? (
                          <>
                            <button
                              className={postStyles.commentMoreItem}
                              onClick={() => startEditComment(comment)}
                            >
                              Edit comment
                            </button>
                            <button
                              className={`${postStyles.commentMoreItem} ${postStyles.commentDanger}`}
                              onClick={() => handleDeleteComment(comment)}
                            >
                              Delete comment
                            </button>
                          </>
                        ) : isPostOwner ? (
                          <>
                            <button
                              className={postStyles.commentMoreItem}
                              onClick={() => handleDeleteComment(comment)}
                            >
                              Delete comment
                            </button>
                            <button
                              className={postStyles.commentMoreItem}
                              onClick={() => handleReportComment(comment)}
                            >
                              Report comment
                            </button>
                            <button
                              className={`${postStyles.commentMoreItem} ${postStyles.commentDanger}`}
                              onClick={() => handleBlockUser(comment)}
                            >
                              Block this user
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              className={postStyles.commentMoreItem}
                              onClick={() => handleReportComment(comment)}
                            >
                              Report comment
                            </button>
                            <button
                              className={`${postStyles.commentMoreItem} ${postStyles.commentDanger}`}
                              onClick={() => handleBlockUser(comment)}
                            >
                              Block this user
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>,
                  document.body
                )
              : null}
          </div>

          {shouldShowRepliesButton ? (
            <button
              className={postStyles.linkBtn}
              onClick={toggleRepliesVisibility}
              disabled={loadingReplies}
            >
              {loadingReplies
                ? "Loading..."
                : expanded
                ? "Hide replies"
                : `View replies${replyCountLabel}`}
            </button>
          ) : null}

          {expanded && replies.length ? (
            <div className={postStyles.replyList}>
              {replies.map((child) => renderCommentThread(child, depth + 1))}
              {hasMoreReplies ? (
                <button
                  className={postStyles.linkBtn}
                  onClick={() =>
                    loadReplies(
                      comment.id,
                      (replyState[comment.id]?.page ?? 1) + 1
                    )
                  }
                  disabled={loadingReplies}
                >
                  {loadingReplies ? "Loading..." : "Load more replies"}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    );
  };

  useEffect(() => {
    if (!open || !token || !postId) return;
    setComments([]);
    setPage(1);
    setHasMore(true);
    setError("");
    setReplyState({});
    setReplyTarget(null);
    setEditingCommentId(null);
    setOpenCommentMenuId(null);
    setReportingCommentId(null);
    setReportNote("");
    setTotalCount(initialCount ?? 0);
    setLoading(true);

    fetchComments({ token, postId, page: 1, limit: COMMENT_PAGE_SIZE })
      .then((res) => {
        setComments(res?.items ?? []);
        setPage(res?.page ?? 1);
        setHasMore(Boolean(res?.hasMore));
        const baseTotal =
          typeof res?.total === "number"
            ? res.total
            : Math.max(initialCount ?? 0, res?.items?.length ?? 0);
        updateTotal(baseTotal);
      })
      .catch((err) => setError(err?.message || "Failed to load comments"))
      .finally(() => setLoading(false));
  }, [open, postId, token, updateTotal]);

  useEffect(() => {
    setTotalCount(initialCount ?? 0);
  }, [initialCount, postId]);

  useEffect(() => {
    if (!emojiOpen) return;
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (!emojiRef.current) return;
      if (!emojiRef.current.contains(event.target as Node)) {
        setEmojiOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [emojiOpen]);

  useEffect(() => {
    if (!open) setEmojiOpen(false);
  }, [open]);

  const loadMore = async () => {
    if (!token || !postId || loading || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const res = await fetchComments({
        token,
        postId,
        page: page + 1,
        limit: COMMENT_PAGE_SIZE,
      });
      setComments((prev) => [...prev, ...(res?.items ?? [])]);
      setPage(res?.page ?? page + 1);
      setHasMore(Boolean(res?.hasMore));
      const added = res?.items?.length ?? 0;
      const newLength = comments.length + added;
      if (typeof res?.total === "number") {
        updateTotal(res.total);
      } else if (added > 0) {
        updateTotal((prev) => Math.max(prev, newLength));
      }
    } catch (err) {
      setError(
        (err as { message?: string })?.message || "Failed to load more comments"
      );
    } finally {
      setLoadingMore(false);
    }
  };

  const updateCommentEverywhere = useCallback(
    (targetId: string, updater: (c: CommentItem) => CommentItem) => {
      setComments((prev) =>
        prev.map((c) => (c.id === targetId ? updater(c) : c))
      );

      setReplyState((prev) => {
        const next: Record<string, ReplyState> = {};
        let changed = false;
        for (const [parentId, state] of Object.entries(prev)) {
          const items = state.items.map((c) =>
            c.id === targetId ? updater(c) : c
          );
          const mutated = items.some((c, idx) => c !== state.items[idx]);
          next[parentId] = mutated ? { ...state, items } : state;
          changed = changed || mutated;
        }
        return changed ? next : prev;
      });
    },
    []
  );

  const mergeLatestComments = useCallback((latest: CommentItem[]) => {
    setComments((prev) => {
      const normalize = (items: CommentItem[]) =>
        items.map((c) => ({ ...c, id: ensureId(c) }));

      const latestNormalized = normalize(latest);
      const latestMap = new Map(latestNormalized.map((c) => [c.id, c]));
      const prevNormalized = normalize(prev);

      // Keep order: latest first, then any previous top-level not in latest
      const mergedLatest = latestNormalized.map((c) => {
        const prevMatch = prevNormalized.find((p) => p.id === c.id);
        return prevMatch ? { ...prevMatch, ...c } : c;
      });

      const trailing = prevNormalized
        .filter((c) => c.parentId || !latestMap.has(c.id))
        .map((c) => {
          const refreshed = latestMap.get(c.id);
          return refreshed ? { ...c, ...refreshed } : c;
        });

      return [...mergedLatest, ...trailing];
    });
  }, []);

  const loadReplies = useCallback(
    async (parentId: string, nextPage = 1) => {
      if (!token || !postId) return;
      setReplyState((prev) => ({
        ...prev,
        [parentId]: {
          ...(prev[parentId] ?? {
            items: [],
            page: 0,
            hasMore: true,
            loading: false,
            expanded: true,
          }),
          loading: true,
          expanded: true,
          error: undefined,
        },
      }));

      try {
        const res = await fetchComments({
          token,
          postId,
          page: nextPage,
          limit: 10,
          parentId,
        });
        setReplyState((prev) => {
          const current = prev[parentId] ?? {
            items: [],
            page: 0,
            hasMore: true,
            loading: false,
            expanded: true,
          };
          return {
            ...prev,
            [parentId]: {
              items:
                nextPage > 1 ? [...current.items, ...res.items] : res.items,
              page: res.page,
              hasMore: res.hasMore,
              loading: false,
              expanded: current.expanded ?? true,
            },
          };
        });
      } catch (err) {
        setReplyState((prev) => ({
          ...prev,
          [parentId]: {
            ...(prev[parentId] ?? {
              items: [],
              page: 0,
              hasMore: true,
              loading: false,
              expanded: true,
            }),
            loading: false,
            error:
              (err as { message?: string })?.message ||
              "Failed to load replies",
          },
        }));
      }
    },
    [postId, token]
  );

  useEffect(() => {
    if (!token || !postId || !open) return;
    let cancelled = false;
    let inFlight = false;

    const refreshRepliesIfNeeded = async (latestRoots: CommentItem[]) => {
      const index = new Map<string, CommentItem>();
      const addToIndex = (item: CommentItem) => {
        const id = ensureId(item);
        index.set(id, { ...item, id });
      };

      latestRoots.forEach(addToIndex);
      Object.values(replyState).forEach((state) => {
        state.items.forEach(addToIndex);
      });

      const candidateMap = new Map<string, ReplyState>();

      const ensureCandidate = (id: string, state?: ReplyState) => {
        if (candidateMap.has(id)) return;
        candidateMap.set(
          id,
          state ?? {
            items: [],
            page: 0,
            hasMore: true,
            loading: false,
            expanded: false,
          }
        );
      };

      latestRoots.forEach((root) => {
        const id = ensureId(root);
        ensureCandidate(id, replyState[id]);
      });

      Object.entries(replyState).forEach(([parentId, state]) => {
        ensureCandidate(parentId, state);
      });

      index.forEach((comment) => {
        const id = ensureId(comment);
        if (
          typeof comment.repliesCount === "number" &&
          comment.repliesCount > 0
        ) {
          ensureCandidate(id, replyState[id]);
        }
      });

      const targets = Array.from(candidateMap.entries())
        .map(([parentId, state]) => ({ parentId, state }))
        .filter(({ parentId, state }) => {
          if (!state.expanded) return false;
          const parent = index.get(parentId);
          const replyCount = parent?.repliesCount;
          const loaded = state.items.length;
          const hasCount = typeof replyCount === "number";
          return (
            (hasCount ? replyCount !== loaded : true) ||
            state.hasMore ||
            (hasCount ? replyCount > 0 && !loaded : loaded === 0)
          );
        });

      if (!targets.length) return;

      await Promise.all(
        targets.map(async ({ parentId, state }) => {
          try {
            const res = await fetchComments({
              token,
              postId,
              page: 1,
              limit: 10,
              parentId,
            });

            setReplyState((prev) => ({
              ...prev,
              [parentId]: {
                ...(prev[parentId] ?? state),
                items: res.items,
                page: res.page,
                hasMore: res.hasMore,
                loading: false,
                expanded: prev[parentId]?.expanded ?? state.expanded ?? false,
              },
            }));
          } catch {
            /* ignore per-thread errors */
          }
        })
      );
    };

    const tick = async () => {
      if (cancelled || inFlight) return;
      if (
        typeof document !== "undefined" &&
        document.visibilityState !== "visible"
      ) {
        return;
      }

      inFlight = true;
      try {
        const res = await fetchComments({
          token,
          postId,
          page: 1,
          limit: COMMENT_PAGE_SIZE,
        });

        if (!cancelled && res?.items) {
          mergeLatestComments(res.items);
          void refreshRepliesIfNeeded(res.items);
          setHasMore(Boolean(res.hasMore));
          if (typeof res.total === "number") {
            updateTotal(res.total);
          } else {
            updateTotal((prev) => Math.max(prev, res.items.length));
          }
        }
      } catch {
        /* silent */
      } finally {
        inFlight = false;
      }
    };

    const intervalId = setInterval(tick, COMMENT_POLL_INTERVAL);
    void tick();

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [mergeLatestComments, open, postId, replyState, token, updateTotal]);

  const toggleLike = async (commentId: string, liked: boolean) => {
    if (!token || !postId) return;

    updateCommentEverywhere(commentId, (c) => ({
      ...c,
      liked: !liked,
      likesCount: Math.max(0, (c.likesCount ?? 0) + (liked ? -1 : 1)),
    }));

    try {
      const res = liked
        ? await unlikeComment({ token, postId, commentId })
        : await likeComment({ token, postId, commentId });

      updateCommentEverywhere(commentId, (c) => ({
        ...c,
        liked: res?.liked ?? !liked,
        likesCount:
          typeof res?.likesCount === "number"
            ? res.likesCount
            : c.likesCount ?? 0,
      }));
    } catch (err) {
      updateCommentEverywhere(commentId, (c) => ({
        ...c,
        liked,
        likesCount: Math.max(0, (c.likesCount ?? 0) + (liked ? 1 : -1)),
      }));
      setError(
        (err as { message?: string })?.message || "Unable to update like"
      );
    }
  };

  const handleSubmit = async () => {
    if (!token || !postId || submitting) return;
    const content = text.trim();
    if (!content) return;

    if (editingCommentId) {
      setSubmitting(true);
      try {
        const updated = await updateComment({
          token,
          postId,
          commentId: editingCommentId,
          content,
        });

        updateCommentEverywhere(editingCommentId, (c) => ({
          ...c,
          content: updated.content,
          updatedAt: updated.updatedAt ?? c.updatedAt,
        }));

        setText("");
        setEditingCommentId(null);
        setReplyTarget(null);
      } catch (err) {
        setError(
          (err as { message?: string })?.message || "Failed to update comment"
        );
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const parentId = replyTarget?.id ?? null;

    const optimistic: CommentItem = {
      id: `tmp-${Date.now()}`,
      postId,
      content,
      parentId,
      rootCommentId: parentId,
      likesCount: 0,
      liked: false,
      repliesCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (parentId) {
      setReplyState((prev) => {
        const state = prev[parentId] ?? {
          items: [],
          page: 1,
          hasMore: false,
          loading: false,
          expanded: true,
        };
        return {
          ...prev,
          [parentId]: {
            ...state,
            items: [...state.items, optimistic],
          },
        };
      });
      scrollToComment(parentId);
    } else {
      setComments((prev) => [...prev, optimistic]);
      scrollToComment(optimistic.id);
    }

    setText("");
    setSubmitting(true);

    const incrementRepliesCount = (targetId: string | null | undefined) => {
      if (!targetId) return;
      updateCommentEverywhere(targetId, (c) => ({
        ...c,
        repliesCount:
          typeof c.repliesCount === "number" ? c.repliesCount + 1 : 1,
      }));
    };

    try {
      const saved = await createComment({
        token,
        postId,
        content,
        parentId: parentId ?? undefined,
      });

      if (parentId) {
        setReplyState((prev) => {
          const state = prev[parentId] ?? {
            items: [],
            page: 1,
            hasMore: false,
            loading: false,
            expanded: true,
          };
          const items = state.items.map((c) =>
            c.id === optimistic.id ? saved : c
          );
          return { ...prev, [parentId]: { ...state, items } };
        });
        incrementRepliesCount(parentId);
        if (saved.rootCommentId && saved.rootCommentId !== parentId) {
          incrementRepliesCount(saved.rootCommentId);
        }
      } else {
        setComments((prev) =>
          prev.map((c) => (c.id === optimistic.id ? saved : c))
        );
      }
      updateTotal((prev) => prev + 1);
    } catch (err) {
      if (parentId) {
        setReplyState((prev) => {
          const state = prev[parentId];
          if (!state) return prev;
          return {
            ...prev,
            [parentId]: {
              ...state,
              items: state.items.filter((c) => c.id !== optimistic.id),
            },
          };
        });
      } else {
        setComments((prev) => prev.filter((c) => c.id !== optimistic.id));
      }
      setError(
        (err as { message?: string })?.message || "Unable to send comment"
      );
    } finally {
      setSubmitting(false);
      setReplyTarget(null);
      setEditingCommentId(null);
    }
  };

  const cancelEditComment = () => {
    if (submitting) return;
    setEditingCommentId(null);
    setText("");
  };

  const insertEmoji = (emoji: string) => {
    if (!emoji) return;
    const target = textareaRef.current;
    if (!target) {
      setText((prev) => prev + emoji);
      return;
    }

    const start = target.selectionStart ?? text.length;
    const end = target.selectionEnd ?? text.length;
    const nextValue = text.slice(0, start) + emoji + text.slice(end);
    setText(nextValue);
    requestAnimationFrame(() => {
      const caret = start + emoji.length;
      target.selectionStart = caret;
      target.selectionEnd = caret;
      target.focus();
    });
  };

  if (!postId) return null;

  const sidebarAnimClass = open
    ? styles.commentSidebarEnter
    : styles.commentSidebarExit;

  return (
    <aside
      className={`${styles.commentSidebar} ${sidebarAnimClass}`}
      role="complementary"
      aria-label="Comments"
      ref={(node) => {
        if (panelRef) panelRef.current = node;
      }}
    >
      <div className={styles.commentSidebarHeader}>
        <div>
          <div className={styles.commentSidebarTitle}>
            Comments ({Math.max(0, totalCount)})
          </div>
        </div>
        <button
          className={styles.commentCloseBtn}
          onClick={onClose}
          aria-label="Close comments"
        >
          ×
        </button>
      </div>

      <div className={`${postStyles.infoScrollArea} ${styles.commentScroll}`}>
        {error ? <div className={postStyles.errorBox}>{error}</div> : null}
        <div className={postStyles.commentList}>
          {topLevelComments.map((comment) => renderCommentThread(comment))}
          {loading ? (
            <div className={postStyles.stateBox}>Loading comments...</div>
          ) : null}
          {!loading && !comments.length && !error ? (
            <div className={postStyles.stateBox}>No comments yet.</div>
          ) : null}
        </div>
        {hasMore ? (
          <button
            className={postStyles.loadMoreBtn}
            onClick={loadMore}
            disabled={loading || loadingMore}
          >
            {loadingMore ? "Loading..." : "Load more"}
          </button>
        ) : null}
      </div>

      {replyTarget ? (
        <div className={postStyles.replyBadge}>
          Replying to @{replyTarget.username || "comment"}
          <button
            onClick={() => setReplyTarget(null)}
            aria-label="Cancel reply"
          >
            ×
          </button>
        </div>
      ) : null}

      {editingCommentId ? (
        <div className={postStyles.replyBadge}>
          Editing your comment
          <button
            onClick={cancelEditComment}
            aria-label="Cancel edit"
            disabled={submitting}
          >
            ×
          </button>
        </div>
      ) : null}

      <div
        className={postStyles.formRow}
        style={{ paddingBottom: 12, paddingRight: 12 }}
      >
        <div className={postStyles.emojiWrap} ref={emojiRef}>
          <button
            type="button"
            className={postStyles.emojiButton}
            onClick={() => setEmojiOpen((prev) => !prev)}
            aria-label="Add emoji"
            disabled={!canInteract}
          >
            <svg
              aria-label="Emoji icon"
              fill="currentColor"
              height="22"
              role="img"
              viewBox="0 0 24 24"
              width="22"
            >
              <title>Emoji icon</title>
              <path d="M15.83 10.997a1.167 1.167 0 1 0 1.167 1.167 1.167 1.167 0 0 0-1.167-1.167Zm-6.5 1.167a1.167 1.167 0 1 0-1.166 1.167 1.167 1.167 0 0 0 1.166-1.167Zm5.163 3.24a3.406 3.406 0 0 1-4.982.007 1 1 0 1 0-1.557 1.256 5.397 5.397 0 0 0 8.09 0 1 1 0 0 0-1.55-1.263ZM12 .503a11.5 11.5 0 1 0 11.5 11.5A11.513 11.513 0 0 0 12 .503Zm0 21a9.5 9.5 0 1 1 9.5-9.5 9.51 9.51 0 0 1-9.5 9.5Z"></path>
            </svg>
          </button>
          {emojiOpen ? (
            <div className={postStyles.emojiPopover}>
              <EmojiPicker
                onEmojiClick={(emojiData) => {
                  insertEmoji(emojiData.emoji || "");
                }}
                searchDisabled={false}
                skinTonesDisabled={false}
                lazyLoadEmojis
              />
            </div>
          ) : null}
        </div>
        <textarea
          className={postStyles.input}
          placeholder="Add a comment..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          ref={textareaRef}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          disabled={!canInteract || submitting}
        />
        <button
          className={postStyles.submitBtn}
          onClick={handleSubmit}
          disabled={!canInteract || submitting || !text.trim()}
        >
          {submitting ? "Sending..." : "Post"}
        </button>
      </div>

      {reportingCommentId ? (
        <div
          className={`${postStyles.reportOverlay} ${
            reportClosing
              ? postStyles.reportOverlayClosing
              : postStyles.reportOverlayOpen
          }`}
          role="dialog"
          aria-modal="true"
          onClick={closeReportModal}
        >
          <div
            className={`${postStyles.reportCard} ${
              reportClosing
                ? postStyles.reportCardClosing
                : postStyles.reportCardOpen
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={postStyles.reportHeader}>
              <div>
                <h3 className={postStyles.reportTitle}>Report this comment</h3>
                <p className={postStyles.reportBody}>
                  Help us understand what is wrong with this comment.
                </p>
              </div>
              <button
                className={postStyles.reportClose}
                aria-label="Close"
                onClick={closeReportModal}
              >
                ×
              </button>
            </div>

            <div className={postStyles.reportGrid}>
              <div className={postStyles.reportCategoryGrid}>
                {REPORT_GROUPS.map((group) => {
                  const isActive = reportCategory === group.key;
                  return (
                    <button
                      key={group.key}
                      className={`${postStyles.reportCategoryCard} ${
                        isActive ? postStyles.reportCategoryCardActive : ""
                      }`}
                      style={{
                        borderColor: isActive ? group.accent : undefined,
                        boxShadow: isActive
                          ? `0 0 0 1px ${group.accent}`
                          : undefined,
                      }}
                      onClick={() => {
                        setReportCategory(group.key);
                        setReportReason(
                          group.reasons.length === 1
                            ? group.reasons[0].key
                            : null
                        );
                      }}
                    >
                      <span
                        className={postStyles.reportCategoryDot}
                        style={{ background: group.accent }}
                      />
                      <span className={postStyles.reportCategoryLabel}>
                        {group.label}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className={postStyles.reportReasonPanel}>
                <div className={postStyles.reportReasonHeader}>
                  Select a specific reason
                </div>
                {selectedReportGroup ? (
                  <div className={postStyles.reportReasonList}>
                    {selectedReportGroup.reasons.map((reason) => {
                      const checked = reportReason === reason.key;
                      return (
                        <button
                          key={reason.key}
                          className={`${postStyles.reportReasonRow} ${
                            checked ? postStyles.reportReasonRowActive : ""
                          }`}
                          onClick={() => setReportReason(reason.key)}
                        >
                          <span
                            className={postStyles.reportReasonRadio}
                            aria-checked={checked}
                          >
                            {checked ? (
                              <span
                                className={postStyles.reportReasonRadioDot}
                              />
                            ) : null}
                          </span>
                          <span>{reason.label}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className={postStyles.reportReasonPlaceholder}>
                    Pick a category first.
                  </div>
                )}

                <label className={postStyles.reportNoteLabel}>
                  Additional notes (optional)
                  <textarea
                    className={postStyles.reportNoteInput}
                    placeholder="Add brief context if needed..."
                    value={reportNote}
                    onChange={(e) => setReportNote(e.target.value)}
                    maxLength={500}
                  />
                </label>
                {reportError ? (
                  <div className={postStyles.reportInlineError}>
                    {reportError}
                  </div>
                ) : null}
              </div>
            </div>

            <div className={postStyles.reportActions}>
              <button
                className={postStyles.reportSecondary}
                onClick={closeReportModal}
                disabled={reportSubmitting}
              >
                Cancel
              </button>
              <button
                className={postStyles.reportPrimary}
                onClick={submitReport}
                disabled={
                  !reportReason || reportSubmitting || !reportingCommentId
                }
              >
                {reportSubmitting ? "Submitting..." : "Submit report"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div
          className={`${postStyles.reportOverlay} ${postStyles.reportOverlayOpen}`}
          role="dialog"
          aria-modal="true"
          onClick={closeDeleteConfirm}
        >
          <div
            className={postStyles.reportCard}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={postStyles.reportHeader}>
              <div>
                <h3 className={postStyles.reportTitle}>Delete this comment?</h3>
                <p className={postStyles.reportBody}>
                  Removing this comment will also delete its replies. This
                  action cannot be undone.
                </p>
              </div>
              <button
                className={postStyles.reportClose}
                aria-label="Close"
                onClick={closeDeleteConfirm}
                disabled={deleteSubmitting}
              >
                ×
              </button>
            </div>

            {deleteError ? (
              <div className={postStyles.reportInlineError}>{deleteError}</div>
            ) : null}

            <div className={postStyles.reportActions}>
              <button
                className={postStyles.reportSecondary}
                onClick={closeDeleteConfirm}
                disabled={deleteSubmitting}
              >
                Cancel
              </button>
              <button
                className={`${postStyles.reportPrimary} ${postStyles.blockDanger}`}
                onClick={confirmDeleteComment}
                disabled={deleteSubmitting}
              >
                {deleteSubmitting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {blockTarget ? (
        <div
          className={`${postStyles.reportOverlay} ${postStyles.reportOverlayOpen}`}
          role="dialog"
          aria-modal="true"
          onClick={closeBlockUserModal}
        >
          <div
            className={postStyles.reportCard}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={postStyles.reportHeader}>
              <div>
                <h3 className={postStyles.reportTitle}>Block this account?</h3>
                <p className={postStyles.reportBody}>
                  {`You are about to block @${blockTarget.label}. They will no longer be able to interact with you.`}
                </p>
              </div>
            </div>

            <div className={postStyles.reportActions}>
              <button
                className={postStyles.reportSecondary}
                onClick={closeBlockUserModal}
                disabled={blocking}
              >
                Cancel
              </button>
              <button
                className={`${postStyles.reportPrimary} ${postStyles.blockDanger}`}
                onClick={confirmBlockUser}
                disabled={blocking}
              >
                {blocking ? "Blocking..." : "Block"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </aside>
  );
}
