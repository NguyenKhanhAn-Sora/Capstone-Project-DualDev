"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import EmojiPicker from "emoji-picker-react";
import {
  createComment,
  fetchComments,
  likeComment,
  type CommentItem,
  unlikeComment,
} from "@/lib/api";
import postStyles from "../post/post.module.css";
import styles from "./reel.module.css";

type ReelCommentsProps = {
  postId?: string;
  token: string | null;
  open: boolean;
  onClose: () => void;
};

export default function ReelComments({
  postId,
  token,
  open,
  onClose,
}: ReelCommentsProps) {
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const emojiRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const canInteract = useMemo(
    () => Boolean(open && token && postId),
    [open, postId, token]
  );

  useEffect(() => {
    if (!open || !token || !postId) return;
    setComments([]);
    setPage(1);
    setHasMore(true);
    setError("");
    setLoading(true);

    fetchComments({ token, postId, page: 1, limit: 20 })
      .then((res) => {
        setComments(res?.items ?? []);
        setPage(res?.page ?? 1);
        setHasMore(Boolean(res?.hasMore));
      })
      .catch((err) => setError(err?.message || "Failed to load comments"))
      .finally(() => setLoading(false));
  }, [open, postId, token]);

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
        limit: 20,
      });
      setComments((prev) => [...prev, ...(res?.items ?? [])]);
      setPage(res?.page ?? page + 1);
      setHasMore(Boolean(res?.hasMore));
    } catch (err) {
      setError(
        (err as { message?: string })?.message || "Failed to load more comments"
      );
    } finally {
      setLoadingMore(false);
    }
  };

  const toggleLike = async (commentId: string, liked: boolean) => {
    if (!token || !postId) return;
    setComments((prev) =>
      prev.map((c) =>
        c.id === commentId
          ? {
              ...c,
              liked: !liked,
              likesCount: Math.max(0, (c.likesCount ?? 0) + (liked ? -1 : 1)),
            }
          : c
      )
    );
    try {
      if (liked) await unlikeComment({ token, postId, commentId });
      else await likeComment({ token, postId, commentId });
    } catch (err) {
      setComments((prev) =>
        prev.map((c) =>
          c.id === commentId
            ? {
                ...c,
                liked,
                likesCount: Math.max(0, (c.likesCount ?? 0) + (liked ? 1 : -1)),
              }
            : c
        )
      );
      setError(
        (err as { message?: string })?.message || "Unable to update like"
      );
    }
  };

  const handleSubmit = async () => {
    if (!token || !postId || submitting) return;
    const content = text.trim();
    if (!content) return;

    const optimistic: CommentItem = {
      id: `tmp-${Date.now()}`,
      postId,
      content,
      parentId: null,
      rootCommentId: null,
      likesCount: 0,
      liked: false,
      repliesCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setComments((prev) => [...prev, optimistic]);
    setText("");
    setSubmitting(true);

    try {
      const saved = await createComment({ token, postId, content });
      setComments((prev) =>
        prev.map((c) => (c.id === optimistic.id ? saved : c))
      );
    } catch (err) {
      setComments((prev) => prev.filter((c) => c.id !== optimistic.id));
      setError(
        (err as { message?: string })?.message || "Unable to send comment"
      );
    } finally {
      setSubmitting(false);
    }
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

  if (!open || !postId) return null;

  return (
    <aside
      className={styles.commentSidebar}
      role="complementary"
      aria-label="Comments"
    >
      <div className={styles.commentSidebarHeader}>
        <div>
          <div className={styles.commentSidebarTitle}>Comments</div>
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
          {comments.map((comment) => {
            const fallbackLabel = comment.author?.username;
            const initials = fallbackLabel?.slice(0, 2).toUpperCase();
            const timeAgo = comment.createdAt
              ? formatDistanceToNow(new Date(comment.createdAt), {
                  addSuffix: true,
                })
              : "Just now";

            return (
              <div key={comment.id} className={postStyles.commentRow}>
                <div className={postStyles.commentAvatar}>
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
                      @{fallbackLabel}
                    </span>
                    <span className={postStyles.commentMeta}>{timeAgo}</span>
                  </div>
                  <div className={postStyles.commentText}>
                    {comment.content}
                  </div>
                  <div className={postStyles.commentActions}>
                    <button
                      className={postStyles.linkBtn}
                      onClick={() =>
                        toggleLike(comment.id, Boolean(comment.liked))
                      }
                      disabled={!token}
                      aria-pressed={comment.liked}
                    >
                      {comment.liked ? "Liked" : "Like"}
                    </button>
                    <span className={postStyles.commentMeta}>
                      {comment.likesCount ?? 0} likes
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
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

      <div className={postStyles.formRow}>
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
                  setEmojiOpen(false);
                }}
                searchDisabled={false}
                skinTonesDisabled={false}
                lazyLoadEmojis
              />
            </div>
          ) : null}
        </div>
        <button
          className={postStyles.submitBtn}
          onClick={handleSubmit}
          disabled={!canInteract || submitting || !text.trim()}
        >
          {submitting ? "Sending..." : "Post"}
        </button>
      </div>
    </aside>
  );
}
