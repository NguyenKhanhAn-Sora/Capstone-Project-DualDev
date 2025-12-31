"use client";

import { JSX, useCallback, useEffect, useMemo, useRef, useState } from "react";
import EmojiPicker from "emoji-picker-react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import styles from "./post.module.css";
import {
  createComment,
  fetchComments,
  fetchCurrentProfile,
  fetchPostDetail,
  followUser,
  reportPost,
  setPostAllowComments,
  setPostHideLikeCount,
  savePost,
  likeComment,
  likePost,
  unlikeComment,
  unlikePost,
  unfollowUser,
  unsavePost,
  type CommentItem,
  type CommentListResponse,
  type CurrentProfileResponse,
  type FeedItem,
} from "@/lib/api";

function upsertById(list: CommentItem[], incoming: CommentItem): CommentItem[] {
  const idx = list.findIndex((c) => c.id === incoming.id);
  if (idx === -1) return [...list, incoming];
  const next = [...list];
  next[idx] = incoming;
  return next;
}

function ensureId(item: CommentItem): string {
  return item.id || `${item.postId}-${item.createdAt ?? Date.now()}`;
}

type ReplyState = {
  items: CommentItem[];
  page: number;
  hasMore: boolean;
  loading: boolean;
  expanded: boolean;
  error?: string;
};

type PostViewProps = {
  postId: string;
  asModal?: boolean;
};

type IconProps = { size?: number; filled?: boolean };

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

export default function PostView({ postId, asModal }: PostViewProps) {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [post, setPost] = useState<FeedItem | null>(null);
  const [followingAuthor, setFollowingAuthor] = useState(false);
  const [postError, setPostError] = useState<string>("");
  const [loadingPost, setLoadingPost] = useState(true);

  const [comments, setComments] = useState<CommentItem[]>([]);
  const [commentsPage, setCommentsPage] = useState(1);
  const [hasMoreComments, setHasMoreComments] = useState(true);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState<string>("");

  const [replyTarget, setReplyTarget] = useState<{
    id: string;
    username?: string;
  } | null>(null);
  const [replyState, setReplyState] = useState<Record<string, ReplyState>>({});
  const [reportOpen, setReportOpen] = useState(false);
  const [reportClosing, setReportClosing] = useState(false);
  const reportHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [reportCategory, setReportCategory] = useState<
    ReportCategory["key"] | null
  >(null);
  const [reportReason, setReportReason] = useState<string | null>(null);
  const [reportNote, setReportNote] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportError, setReportError] = useState("");

  const updateCommentEverywhere = useCallback(
    (id: string, updater: (comment: CommentItem) => CommentItem) => {
      setComments((prev) => prev.map((c) => (c.id === id ? updater(c) : c)));

      setReplyState((prev) => {
        const next: Record<string, ReplyState> = {};
        Object.entries(prev).forEach(([key, state]) => {
          next[key] = {
            ...state,
            items: state.items.map((c) => (c.id === id ? updater(c) : c)),
          };
        });
        return next;
      });
    },
    []
  );

  const [viewer, setViewer] = useState<CurrentProfileResponse | null>(null);
  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const commentInputRef = useRef<HTMLTextAreaElement | null>(null);
  const emojiRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commentRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [mediaIndex, setMediaIndex] = useState(0);
  const [mediaDirection, setMediaDirection] = useState<"next" | "prev">("next");
  const mediaVideoRef = useRef<HTMLVideoElement | null>(null);
  const [soundOn, setSoundOn] = useState(false);
  const mediaTimeRef = useRef<Map<string, number>>(new Map());
  const lastMediaKeyRef = useRef<string | null>(null);
  const resumeAppliedRef = useRef(false);
  const [resumeReady, setResumeReady] = useState(false);
  const resumePendingRef = useRef<{
    mediaIndex?: number;
    time?: number;
    soundOn?: boolean;
  } | null>(null);
  const bodyLockRef = useRef<string | null>(null);
  const captionRef = useRef<HTMLDivElement | null>(null);
  const [captionCollapsed, setCaptionCollapsed] = useState(true);
  const [captionCanExpand, setCaptionCanExpand] = useState(false);
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const scrollToComment = useCallback((commentId: string) => {
    if (!commentId) return;
    requestAnimationFrame(() => {
      const el = commentRefs.current[commentId];
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
  }, []);
  const selectedReportGroup = useMemo(
    () => REPORT_GROUPS.find((g) => g.key === reportCategory),
    [reportCategory]
  );

  const persistResume = useCallback(() => {
    if (typeof window === "undefined") return;
    if (!post) return;
    const mediaList = post.media ?? [];
    const current = mediaList[mediaIndex];
    if (!current || current.type !== "video") return;
    const keyMedia = current.url || `media-${mediaIndex}`;
    const videoEl = mediaVideoRef.current;
    const time =
      videoEl?.currentTime ?? mediaTimeRef.current.get(keyMedia) ?? 0;
    const sound = videoEl ? !videoEl.muted || soundOn : soundOn;
    if (time <= 0.05) return;
    try {
      const payload = { mediaIndex, time, soundOn: sound };
      sessionStorage.setItem(
        `postVideoResume:${post.id}`,
        JSON.stringify(payload)
      );
    } catch {}
  }, [mediaIndex, post, soundOn]);

  const goToPostPage = useCallback(() => {
    setShowMoreMenu(false);
    persistResume();

    if (typeof window !== "undefined") {
      window.location.href = `/post/${postId}`;
    } else {
      router.push(`/post/${postId}`);
    }
  }, [persistResume, postId, router]);

  const isAuthor = useMemo(() => {
    if (!post || !viewer) return false;
    const sameId = viewer.id && post.authorId && viewer.id === post.authorId;
    const sameUsername =
      viewer.username &&
      post.authorUsername &&
      viewer.username.toLowerCase() === post.authorUsername.toLowerCase();
    return Boolean(sameId || sameUsername);
  }, [post, viewer]);

  const showToast = useCallback((message: string, duration = 1600) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMessage(message);
    toastTimerRef.current = setTimeout(() => setToastMessage(null), duration);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const accessToken = localStorage.getItem("accessToken");
    setToken(accessToken);
  }, []);

  useEffect(() => {
    if (!token) return;
    fetchCurrentProfile({ token })
      .then(setViewer)
      .catch(() => undefined);
  }, [token]);

  useEffect(() => {
    if (!token) return;
    setLoadingPost(true);
    setPostError("");
    fetchPostDetail({ token, postId })
      .then((data) => {
        setPost(data);
        const flagsFollowing = Boolean(
          (data as any)?.flags?.following ?? (data as any)?.following
        );
        setFollowingAuthor(flagsFollowing);
        setMediaIndex(0);
        setLiked(Boolean((data as any).liked));
        const initialSaved = Boolean(
          (data as any)?.flags?.saved ?? (data as any)?.saved
        );
        setSaved(initialSaved);
      })
      .catch((err: { message?: string }) => {
        setPostError(err?.message || "Failed to load post");
      })
      .finally(() => setLoadingPost(false));
  }, [postId, token]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      if (
        typeof document !== "undefined" &&
        document.visibilityState !== "visible"
      ) {
        return;
      }
      try {
        const latest = await fetchPostDetail({ token, postId });
        if (cancelled || !latest) return;
        setPost((prev) =>
          prev
            ? {
                ...prev,
                allowComments:
                  (latest as any).allowComments ?? (prev as any).allowComments,
                hideLikeCount:
                  (latest as any).hideLikeCount ?? (prev as any).hideLikeCount,
                stats: latest.stats ?? prev.stats,
                flags: (latest as any).flags ?? (prev as any).flags,
              }
            : latest
        );
      } catch {}
    };

    const intervalId = setInterval(tick, 5000);
    void tick();
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [postId, token]);

  const loadComments = useCallback(
    async (nextPage: number) => {
      if (!token) return;
      setCommentsLoading(true);
      setCommentsError("");
      try {
        const res = await fetchComments({
          token,
          postId,
          page: nextPage,
          limit: 20,
        });
        applyCommentPage(res, nextPage > 1);
      } catch (err: any) {
        setCommentsError(err?.message || "Failed to load comments");
      } finally {
        setCommentsLoading(false);
      }
    },
    [postId, token]
  );

  useEffect(() => {
    if (!token) return;
    loadComments(1);
  }, [token, loadComments]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (
        emojiRef.current &&
        !emojiRef.current.contains(event.target as Node)
      ) {
        setShowEmojiPicker(false);
      }
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMoreMenu(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowEmojiPicker(false);
        setShowMoreMenu(false);
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
    const el = captionRef.current;
    if (!el) return;
    const measure = () => {
      const lineHeight = parseFloat(getComputedStyle(el).lineHeight || "0");
      if (!lineHeight) return;
      const lines = el.scrollHeight / lineHeight;
      const shouldCollapse = lines > 3.2;
      setCaptionCanExpand(shouldCollapse);
      setCaptionCollapsed((prev) => (shouldCollapse ? true : prev));
    };
    measure();
  }, [post?.content]);

  useEffect(() => {
    return () => {
      if (reportHideTimerRef.current) clearTimeout(reportHideTimerRef.current);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const applyCommentPage = (res: CommentListResponse, append: boolean) => {
    setComments((prev) => (append ? [...prev, ...res.items] : res.items));
    setCommentsPage(res.page);
    setHasMoreComments(res.hasMore);
  };

  const loadReplies = useCallback(
    async (parentId: string, nextPage = 1) => {
      if (!token) return;
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
      } catch (err: any) {
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
            error: err?.message || "Failed to load replies",
          },
        }));
      }
    },
    [postId, token]
  );

  const handleSubmit = async () => {
    if (!token) return;
    if (commentsLocked) return;
    const content = commentText.trim();
    if (!content) return;

    const parentId = replyTarget?.id ?? null;
    const optimisticId = `tmp-${Date.now()}`;
    const optimistic: CommentItem = {
      id: optimisticId,
      postId,
      content,
      parentId,
      rootCommentId: parentId,
      likesCount: 0,
      liked: false,
      author: viewer
        ? {
            id: viewer.id,
            displayName: viewer.displayName,
            username: viewer.username,
            avatarUrl: viewer.avatarUrl,
          }
        : undefined,
      createdAt: new Date().toISOString(),
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
      scrollToComment(optimisticId);
    }

    setCommentText("");
    setSubmitting(true);

    try {
      const saved = await createComment({
        token,
        postId,
        content,
        parentId: parentId ?? undefined,
      });

      const incrementRepliesCount = (targetId: string | null | undefined) => {
        if (!targetId) return;
        setComments((prev) =>
          prev.map((comment) =>
            comment.id === targetId
              ? {
                  ...comment,
                  repliesCount:
                    typeof comment.repliesCount === "number"
                      ? comment.repliesCount + 1
                      : 1,
                }
              : comment
          )
        );

        setReplyState((prev) => {
          const next = Object.fromEntries(
            Object.entries(prev).map(([key, state]) => {
              const items = state.items.map((comment) =>
                comment.id === targetId
                  ? {
                      ...comment,
                      repliesCount:
                        typeof comment.repliesCount === "number"
                          ? comment.repliesCount + 1
                          : 1,
                    }
                  : comment
              );
              return [key, { ...state, items }];
            })
          );
          return next;
        });
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
          const items = upsertById(
            state.items
              .filter((c) => c.id !== optimisticId)
              .map((c) => ({ ...c, id: ensureId(c) })),
            { ...saved, id: saved.id }
          );
          return { ...prev, [parentId]: { ...state, items } };
        });

        const targetRootId = saved.rootCommentId || parentId;
        incrementRepliesCount(parentId);
        if (targetRootId && targetRootId !== parentId) {
          incrementRepliesCount(targetRootId);
        }
      } else {
        setComments((prev) => {
          const filtered = prev
            .filter((c) => c.id !== optimisticId)
            .map((c) => ({ ...c, id: ensureId(c) }));
          return upsertById(filtered, saved);
        });
      }

      setPost((prev) =>
        prev
          ? {
              ...prev,
              stats: {
                ...prev.stats,
                comments: Math.max(0, (prev.stats?.comments ?? 0) + 1),
              },
            }
          : prev
      );
    } catch (err: any) {
      setCommentsError(err?.message || "Failed to comment");
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
              items: state.items.filter((c) => c.id !== optimisticId),
            },
          };
        });
      } else {
        setComments((prev) => prev.filter((c) => c.id !== optimisticId));
      }
    } finally {
      setSubmitting(false);
      setReplyTarget(null);
    }
  };

  useEffect(() => {
    if (!asModal || typeof document === "undefined") return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    bodyLockRef.current = previous;
    return () => {
      document.body.style.overflow = previous;
      bodyLockRef.current = null;
    };
  }, [asModal]);

  const goClose = () => {
    persistResume();
    if (asModal) {
      router.back();
    } else {
      router.push("/");
    }
  };

  const copyPermalink = async () => {
    try {
      const origin =
        typeof window !== "undefined" ? window.location.origin : "";
      const permalink = `${origin}/post/${postId}`;
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(permalink);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = permalink;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setShowMoreMenu(false);
      showToast("Link copied to clipboard");
    } catch (err) {
      setShowMoreMenu(false);
      showToast("Failed to copy link");
    }
  };

  const openReportModal = () => {
    if (!token) return;
    if (reportHideTimerRef.current) clearTimeout(reportHideTimerRef.current);
    setReportClosing(false);
    setReportOpen(true);
    setReportCategory(null);
    setReportReason(null);
    setReportNote("");
    setReportError("");
    setReportSubmitting(false);
  };

  const closeReportModal = () => {
    if (reportHideTimerRef.current) clearTimeout(reportHideTimerRef.current);
    setReportClosing(true);
    reportHideTimerRef.current = setTimeout(() => {
      setReportOpen(false);
      setReportCategory(null);
      setReportReason(null);
      setReportNote("");
      setReportError("");
      setReportSubmitting(false);
      setReportClosing(false);
    }, 200);
  };

  const submitReport = async () => {
    if (!token || !post || !reportCategory || !reportReason) return;
    setReportSubmitting(true);
    setReportError("");
    try {
      await reportPost({
        token,
        postId: post.id,
        category: reportCategory,
        reason: reportReason,
        note: reportNote.trim() || undefined,
      });
      closeReportModal();
      showToast("Report submitted");
    } catch (err) {
      const message =
        typeof err === "object" && err && "message" in err
          ? (err as { message?: string }).message || "Could not submit report"
          : "Could not submit report";
      setReportError(message);
    } finally {
      setReportSubmitting(false);
    }
  };

  const allowDownloads = Boolean(
    (post as any)?.allowDownloads ??
      (post as any)?.allowDownload ??
      (post as any)?.flags?.allowDownloads ??
      (post as any)?.flags?.allowDownload ??
      (post as any)?.permissions?.allowDownloads ??
      (post as any)?.permissions?.allowDownload
  );

  const handleDownloadCurrentMedia = async () => {
    const media = post?.media ?? [];
    const current = media[mediaIndex];
    if (!current) return;
    try {
      const sameOrigin =
        typeof window !== "undefined" &&
        current.url?.startsWith(window.location.origin);

      const res = await fetch(current.url, {
        credentials: sameOrigin ? "include" : "omit",
        mode: "cors",
      });
      if (!res.ok) throw new Error(`Download failed (${res.status})`);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);

      const link = document.createElement("a");
      const fallbackName = `media-${mediaIndex + 1}`;
      const nameFromUrl = current.url?.split("/").pop()?.split("?")[0];
      link.href = objectUrl;
      link.download = (current as any)?.filename || nameFromUrl || fallbackName;

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(objectUrl);

      setShowMoreMenu(false);
      showToast("Download started");
    } catch (err) {
      setShowMoreMenu(false);
      showToast("Failed to download");
    }
  };

  const media = post?.media ?? [];
  const currentMedia = media[mediaIndex];

  useEffect(() => {
    const videoEl = mediaVideoRef.current;
    if (!videoEl) return;
    if (!currentMedia || currentMedia.type !== "video") return;

    const key = currentMedia.url || `media-${mediaIndex}`;
    lastMediaKeyRef.current = key;

    const applySavedTime = () => {
      const saved = mediaTimeRef.current.get(key);
      if (saved == null) return;
      const duration = videoEl.duration;
      const safeTime = Number.isFinite(duration)
        ? Math.min(Math.max(saved, 0), Math.max(0, duration - 0.2))
        : Math.max(saved, 0);
      try {
        videoEl.currentTime = safeTime;
      } catch {}
    };

    const handleLoaded = () => applySavedTime();
    const handleTimeUpdate = () => {
      mediaTimeRef.current.set(key, videoEl.currentTime || 0);
    };
    const handlePause = () => {
      mediaTimeRef.current.set(key, videoEl.currentTime || 0);
    };

    videoEl.addEventListener("loadedmetadata", handleLoaded);
    videoEl.addEventListener("timeupdate", handleTimeUpdate);
    videoEl.addEventListener("pause", handlePause);

    if (videoEl.readyState >= 1) {
      applySavedTime();
    }

    const playCurrent = () => {
      try {
        videoEl.muted = !soundOn;
        const p = videoEl.play();
        if (p?.catch) p.catch(() => undefined);
      } catch {}
    };

    playCurrent();

    return () => {
      try {
        mediaTimeRef.current.set(key, videoEl.currentTime || 0);
        videoEl.pause();
      } catch {}
      videoEl.removeEventListener("loadedmetadata", handleLoaded);
      videoEl.removeEventListener("timeupdate", handleTimeUpdate);
      videoEl.removeEventListener("pause", handlePause);
    };
  }, [currentMedia, mediaIndex, soundOn]);

  useEffect(() => {
    if (!post) return;
    if (resumeAppliedRef.current) return;
    if (typeof window === "undefined") return;

    const key = `postVideoResume:${post.id}`;
    const raw = sessionStorage.getItem(key);
    if (!raw) return;

    try {
      const data = JSON.parse(raw) as {
        mediaIndex?: number;
        time?: number;
        soundOn?: boolean;
      };

      const mediaList = post.media ?? [];
      const targetIndex =
        typeof data.mediaIndex === "number" &&
        data.mediaIndex >= 0 &&
        data.mediaIndex < mediaList.length
          ? data.mediaIndex
          : 0;

      resumePendingRef.current = {
        mediaIndex: targetIndex,
        time:
          typeof data.time === "number" ? Math.max(0, data.time) : undefined,
        soundOn: data.soundOn,
      };

      if (targetIndex !== mediaIndex) {
        setMediaIndex(targetIndex);
      }

      resumeAppliedRef.current = true;
      sessionStorage.removeItem(key);
    } catch {}
  }, [post, mediaIndex]);
  useEffect(() => {
    if (!post) return;
    if (resumeAppliedRef.current) {
      setResumeReady(true);
      return;
    }
    if (typeof window === "undefined") return;

    const key = `postVideoResume:${post.id}`;
    const raw = sessionStorage.getItem(key);

    if (raw) {
      try {
        const data = JSON.parse(raw) as {
          mediaIndex?: number;
          time?: number;
          soundOn?: boolean;
        };

        const mediaList = post.media ?? [];
        const targetIndex =
          typeof data.mediaIndex === "number" &&
          data.mediaIndex >= 0 &&
          data.mediaIndex < mediaList.length
            ? data.mediaIndex
            : 0;

        resumePendingRef.current = {
          mediaIndex: targetIndex,
          time:
            typeof data.time === "number" ? Math.max(0, data.time) : undefined,
          soundOn: data.soundOn,
        };

        if (targetIndex !== mediaIndex) {
          setMediaIndex(targetIndex);
        }
      } catch {}
    }

    resumeAppliedRef.current = true;
    setResumeReady(true);
    sessionStorage.removeItem(key);
  }, [post, mediaIndex]);

  useEffect(() => {
    if (!resumePendingRef.current) return;
    if (!post) return;

    const mediaList = post.media ?? [];
    const pendingIndex = resumePendingRef.current.mediaIndex ?? 0;
    const target = mediaList[pendingIndex];
    const time = resumePendingRef.current.time;
    const sound = resumePendingRef.current.soundOn;

    if (target?.type === "video" && typeof time === "number") {
      const keyMedia = target.url || `media-${pendingIndex}`;
      mediaTimeRef.current.set(keyMedia, Math.max(0, time));
    }

    if (sound) setSoundOn(true);

    resumePendingRef.current = null;
  }, [post, mediaIndex]);

  useEffect(() => {
    return () => {
      persistResume();
    };
  }, [persistResume]);

  const renderMedia = () => {
    const transitionClass = `${styles.mediaEnter} ${
      mediaDirection === "next" ? styles.mediaEnterNext : styles.mediaEnterPrev
    }`;
    if (!currentMedia)
      return (
        <div className={`${styles.mediaPlaceholder} ${transitionClass}`}>
          No media
        </div>
      );
    if (currentMedia.type === "video") {
      if (!resumeReady) return null;
      return (
        <video
          key={currentMedia.url}
          className={`${styles.mediaVisual} ${transitionClass}`}
          controls
          controlsList="nodownload noremoteplayback"
          onContextMenu={(e) => e.preventDefault()}
          src={currentMedia.url}
          ref={mediaVideoRef}
          playsInline
          preload="metadata"
          muted={!soundOn}
          onVolumeChange={(e) => {
            const target = e.currentTarget;
            const userUnmuted = !target.muted && target.volume > 0;
            if (userUnmuted) {
              setSoundOn(true);
            }
          }}
        />
      );
    }
    return (
      <img
        key={currentMedia.url}
        className={`${styles.mediaVisual} ${transitionClass}`}
        src={currentMedia.url}
        alt="Post media"
      />
    );
  };

  const topLevelComments = useMemo(() => {
    const seen = new Set<string>();
    const roots = [] as CommentItem[];
    for (const c of comments) {
      const id = c.id || ensureId(c);
      if (seen.has(id)) continue;
      seen.add(id);
      if (!c.parentId) roots.push({ ...c, id });
    }
    return roots;
  }, [comments]);

  const toggleCommentLike = useCallback(
    async (comment: CommentItem) => {
      if (!token) return;
      const targetId = comment.id;
      const nextLiked = !comment.liked;
      const delta = nextLiked ? 1 : -1;

      updateCommentEverywhere(targetId, (c) => ({
        ...c,
        liked: nextLiked,
        likesCount: Math.max(0, (c.likesCount ?? 0) + delta),
      }));

      try {
        const res = nextLiked
          ? await likeComment({ token, postId, commentId: targetId })
          : await unlikeComment({ token, postId, commentId: targetId });

        updateCommentEverywhere(targetId, (c) => ({
          ...c,
          liked: res.liked ?? nextLiked,
          likesCount:
            typeof res.likesCount === "number"
              ? res.likesCount
              : c.likesCount ?? 0,
        }));
      } catch (err) {
        updateCommentEverywhere(targetId, (c) => ({
          ...c,
          liked: comment.liked ?? false,
          likesCount: Math.max(0, (c.likesCount ?? 0) - delta),
        }));
        setCommentsError(
          (err as { message?: string })?.message || "Failed to like comment"
        );
      }
    },
    [postId, token, updateCommentEverywhere]
  );

  const renderComment = (item: CommentItem) => {
    const renderCommentThread = (
      comment: CommentItem,
      depth = 0
    ): JSX.Element => {
      const replies = replyState[comment.id]?.items ?? [];
      const hasMore = replyState[comment.id]?.hasMore ?? false;
      const loading = replyState[comment.id]?.loading ?? false;
      const expanded = replyState[comment.id]?.expanded ?? false;
      const replyCount = comment.repliesCount ?? replies.length;
      const replyCountLabel = replyCount ? ` (${replyCount})` : "";
      const avatarClass =
        depth > 0 ? styles.commentAvatarSmall : styles.commentAvatar;
      const shouldShowRepliesButton =
        loading || hasMore || replyCount > 0 || replies.length > 0;

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

        if (nextExpanded && replies.length === 0 && !loading) {
          loadReplies(comment.id, (replyState[comment.id]?.page ?? 0) + 1);
        }
      };

      return (
        <div
          key={comment.id}
          className={styles.commentRow}
          ref={(el) => {
            if (el) {
              commentRefs.current[comment.id] = el;
            } else {
              delete commentRefs.current[comment.id];
            }
          }}
        >
          <div className={avatarClass}>
            {comment.author?.avatarUrl ? (
              <img
                src={comment.author.avatarUrl}
                alt={comment.author.username || "avatar"}
              />
            ) : (
              <span>
                {(
                  comment.author?.displayName ||
                  comment.author?.username ||
                  "?"
                )
                  .slice(0, 2)
                  .toUpperCase()}
              </span>
            )}
          </div>
          <div className={styles.commentBody}>
            <div className={styles.commentHeader}>
              <div className={styles.commentAuthor}>
                @{comment.author?.username || "User"}
              </div>
              <div className={styles.commentMeta}>
                {comment.createdAt
                  ? formatDistanceToNow(new Date(comment.createdAt), {
                      addSuffix: true,
                    })
                  : "just now"}
              </div>
            </div>
            <div className={styles.commentText}>{comment.content}</div>
            <div className={styles.commentActions}>
              {!commentsLocked ? (
                <button
                  className={styles.linkBtn}
                  onClick={() =>
                    setReplyTarget({
                      id: comment.id,
                      username: comment.author?.username,
                    })
                  }
                >
                  Reply
                </button>
              ) : null}
              <button
                className={styles.linkBtn}
                onClick={() => toggleCommentLike(comment)}
                aria-pressed={comment.liked}
              >
                <IconLike size={14} filled={comment.liked} />
                <span>{comment.likesCount ?? 0}</span>
              </button>
            </div>
            {shouldShowRepliesButton ? (
              <button
                className={styles.linkBtn}
                onClick={toggleRepliesVisibility}
                disabled={loading}
              >
                {loading
                  ? "Loading..."
                  : expanded
                  ? "Hide replies"
                  : `View replies${replyCountLabel}`}
              </button>
            ) : null}
            {expanded && replies.length ? (
              <div className={styles.replyList}>
                {replies.map((child) => renderCommentThread(child, depth + 1))}
                {hasMore ? (
                  <button
                    className={styles.linkBtn}
                    onClick={() =>
                      loadReplies(
                        comment.id,
                        (replyState[comment.id]?.page ?? 1) + 1
                      )
                    }
                    disabled={loading}
                  >
                    {loading ? "Loading..." : "Load more replies"}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      );
    };

    return renderCommentThread(item, 0);
  };

  const insertEmoji = (emoji: string) => {
    const el = commentInputRef.current;
    if (el && typeof el.selectionStart === "number") {
      const start = el.selectionStart;
      const end = el.selectionEnd ?? start;
      setCommentText((prev) => prev.slice(0, start) + emoji + prev.slice(end));
      setTimeout(() => {
        if (!commentInputRef.current) return;
        const caret = start + emoji.length;
        commentInputRef.current.focus();
        commentInputRef.current.setSelectionRange(caret, caret);
      }, 0);
    } else {
      setCommentText((prev) => prev + emoji);
    }
  };

  const toEmojiChar = (emojiData: { emoji?: string; unified?: string }) => {
    if (emojiData.emoji) return emojiData.emoji;
    if (emojiData.unified) {
      return emojiData.unified
        .split("-")
        .map((u) => String.fromCodePoint(parseInt(u, 16)))
        .join("");
    }
    return "";
  };

  const hideLikeCount = Boolean((post as any)?.hideLikeCount);
  const commentsLocked = Boolean(post && post.allowComments === false);
  const commentsToggleLabel =
    post?.allowComments === false ? "Turn on comments" : "Turn off comments";
  const hideLikeToggleLabel = hideLikeCount
    ? "Show like"
    : "Hide like";

  useEffect(() => {
    if (commentsLocked) {
      setCommentsError("");
      setReplyTarget(null);
      setShowEmojiPicker(false);
    }
  }, [commentsLocked]);

  useEffect(() => {
    if (!replyTarget || commentsLocked) return;
    requestAnimationFrame(() => {
      const el = commentInputRef.current;
      if (!el) return;
      el.focus();
      const caret = el.value.length;
      el.setSelectionRange(caret, caret);
    });
  }, [replyTarget, commentsLocked]);

  const toggleLike = async () => {
    if (!token || !post) return;
    const nextLiked = !liked;
    setLiked(nextLiked);
    setPost((prev) =>
      prev
        ? {
            ...prev,
            liked: nextLiked,
            stats: {
              ...prev.stats,
              hearts: Math.max(
                0,
                (prev.stats?.hearts ?? 0) + (nextLiked ? 1 : -1)
              ),
            },
          }
        : prev
    );
    try {
      if (nextLiked) {
        await likePost({ token, postId });
      } else {
        await unlikePost({ token, postId });
      }
    } catch (err) {
      setLiked(!nextLiked);
      setPost((prev) =>
        prev
          ? {
              ...prev,
              liked: !nextLiked,
              stats: {
                ...prev.stats,
                hearts: Math.max(
                  0,
                  (prev.stats?.hearts ?? 0) + (nextLiked ? -1 : 1)
                ),
              },
            }
          : prev
      );
    }
  };

  const toggleSave = async () => {
    if (!token || !post) return;
    const nextSaved = !saved;
    setSaved(nextSaved);
    setPost((prev) =>
      prev
        ? {
            ...prev,
            flags: { ...(prev as any).flags, saved: nextSaved },
            stats: {
              ...prev.stats,
              saves: Math.max(
                0,
                (prev.stats?.saves ?? 0) + (nextSaved ? 1 : -1)
              ),
            },
          }
        : prev
    );
    try {
      if (nextSaved) {
        await savePost({ token, postId });
        showToast("Saved");
      } else {
        await unsavePost({ token, postId });
        showToast("Removed from saved");
      }
    } catch (err) {
      setSaved(!nextSaved);
      setPost((prev) =>
        prev
          ? {
              ...prev,
              flags: { ...(prev as any).flags, saved: !nextSaved },
              stats: {
                ...prev.stats,
                saves: Math.max(
                  0,
                  (prev.stats?.saves ?? 0) + (nextSaved ? -1 : 1)
                ),
              },
            }
          : prev
      );
      showToast("Failed to update save");
    }
  };

  const toggleAllowComments = async () => {
    if (!token || !post) return;
    const currentAllowed = post.allowComments !== false;
    const nextAllowed = !currentAllowed;
    setPost((prev) => (prev ? { ...prev, allowComments: nextAllowed } : prev));
    setShowMoreMenu(false);
    try {
      await setPostAllowComments({
        token,
        postId,
        allowComments: nextAllowed,
      });
      showToast(nextAllowed ? "Comments turned on" : "Comments turned off");
    } catch (err) {
      setPost((prev) =>
        prev ? { ...prev, allowComments: currentAllowed } : prev
      );
      showToast("Failed to update comments");
    }
  };

  const toggleHideLikeCount = async () => {
    if (!token || !post) return;
    const currentHidden = Boolean(post.hideLikeCount);
    const nextHidden = !currentHidden;
    setPost((prev) => (prev ? { ...prev, hideLikeCount: nextHidden } : prev));
    setShowMoreMenu(false);
    try {
      await setPostHideLikeCount({
        token,
        postId,
        hideLikeCount: nextHidden,
      });
      showToast(nextHidden ? "Like count hidden" : "Like count visible");
    } catch (err) {
      setPost((prev) =>
        prev ? { ...prev, hideLikeCount: currentHidden } : prev
      );
      showToast("Failed to update like count visibility");
    }
  };

  const initialFollowingRef = useRef(Boolean(post?.flags?.following));
  const followToggledRef = useRef(false);

  const toggleFollowAuthor = async () => {
    if (!token || !post?.authorId) return;
    const next = !followingAuthor;
    followToggledRef.current = true;
    setFollowingAuthor(next);
    try {
      if (next) {
        await followUser({ token, userId: post.authorId });
      } else {
        await unfollowUser({ token, userId: post.authorId });
      }
    } catch (err) {
      setFollowingAuthor(!next);
      setPost((prev) =>
        prev
          ? { ...prev, flags: { ...(prev as any).flags, following: !next } }
          : prev
      );
    }
  };

  const header = (
    <div className={styles.headerRow}>
      <div className={styles.authorBlock}>
        <div className={styles.avatarLarge}>
          {post?.authorAvatarUrl ? (
            <img
              src={post.authorAvatarUrl}
              alt={post.authorUsername || "avatar"}
            />
          ) : (
            <span>
              {(post?.authorDisplayName || post?.authorUsername || "?")
                .slice(0, 2)
                .toUpperCase()}
            </span>
          )}
        </div>
        <div className={`${styles.authorMeta} flex flex-row`}>
          <span>
            {post?.authorUsername ? (
              <div className={styles.authorHandle}>@{post.authorUsername}</div>
            ) : null}
          </span>
          <span>
            {post?.authorId &&
            viewer?.id &&
            !isAuthor &&
            (!initialFollowingRef.current ||
              followToggledRef.current ||
              !followingAuthor) ? (
              <>
                <span aria-hidden="true" className="mr-2 ml-2">
                  {" "}
                  ·{" "}
                </span>
                <button
                  type="button"
                  className={styles.followBtn}
                  onClick={toggleFollowAuthor}
                >
                  {followingAuthor ? "Following" : "Follow"}
                </button>
              </>
            ) : null}
          </span>
        </div>
      </div>
      <div className={styles.headerActions}>
        <div className={styles.moreMenuWrap} ref={menuRef}>
          <button
            type="button"
            className={styles.moreBtn}
            aria-haspopup="true"
            aria-expanded={showMoreMenu}
            onClick={() => setShowMoreMenu((prev) => !prev)}
          >
            <svg
              aria-hidden="true"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <circle cx="5" cy="12" r="1.5" />
              <circle cx="12" cy="12" r="1.5" />
              <circle cx="19" cy="12" r="1.5" />
            </svg>
          </button>
          {showMoreMenu ? (
            <div className={styles.moreMenu} role="menu">
              {isAuthor ? (
                <>
                  <button
                    type="button"
                    className={styles.moreMenuItem}
                    role="menuitem"
                    onClick={toggleAllowComments}
                  >
                    {commentsToggleLabel}
                  </button>
                  <button
                    type="button"
                    className={styles.moreMenuItem}
                    role="menuitem"
                    onClick={toggleHideLikeCount}
                  >
                    {hideLikeToggleLabel}
                  </button>
                  <button
                    type="button"
                    className={styles.moreMenuItem}
                    role="menuitem"
                    onClick={goToPostPage}
                  >
                    Go to post
                  </button>
                  <button
                    type="button"
                    className={styles.moreMenuItem}
                    role="menuitem"
                    onClick={copyPermalink}
                  >
                    Copy link
                  </button>
                  <button
                    type="button"
                    className={`${styles.moreMenuItem} ${styles.moreMenuDanger}`}
                    role="menuitem"
                    onClick={() => setShowMoreMenu(false)}
                  >
                    Delete post
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className={styles.moreMenuItem}
                    role="menuitem"
                    onClick={() => {
                      setShowMoreMenu(false);
                      toggleSave();
                    }}
                  >
                    {saved ? "Unsave this post" : "Save this post"}
                  </button>
                  {post?.authorId ? (
                    <button
                      type="button"
                      className={styles.moreMenuItem}
                      role="menuitem"
                      onClick={() => {
                        setShowMoreMenu(false);
                        toggleFollowAuthor();
                      }}
                    >
                      {followingAuthor ? "Unfollow" : "Follow"}
                    </button>
                  ) : null}
                  {allowDownloads && currentMedia ? (
                    <button
                      type="button"
                      className={styles.moreMenuItem}
                      role="menuitem"
                      onClick={handleDownloadCurrentMedia}
                    >
                      Download this media
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className={styles.moreMenuItem}
                    role="menuitem"
                    onClick={() => {
                      setShowMoreMenu(false);
                      openReportModal();
                    }}
                  >
                    Report
                  </button>
                  <div className={styles.moreMenuDivider} />
                  <button
                    type="button"
                    className={styles.moreMenuItem}
                    role="menuitem"
                    onClick={goToPostPage}
                  >
                    Go to post
                  </button>
                  <button
                    type="button"
                    className={styles.moreMenuItem}
                    role="menuitem"
                    onClick={copyPermalink}
                  >
                    Copy link
                  </button>
                  <button
                    type="button"
                    className={styles.moreMenuItem}
                    role="menuitem"
                    onClick={() => setShowMoreMenu(false)}
                  >
                    Go to this account
                  </button>
                </>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );

  return (
    <div
      className={asModal ? styles.modalOverlay : styles.pageShell}
      onClick={asModal ? goClose : undefined}
    >
      <div
        className={asModal ? styles.modalCard : styles.pageCard}
        onClick={(e) => asModal && e.stopPropagation()}
      >
        {loadingPost ? (
          <div className={styles.stateBox}>Loading post...</div>
        ) : postError ? (
          <div className={styles.stateBox}>{postError}</div>
        ) : post ? (
          <div className={styles.contentGrid}>
            <div className={styles.mediaPane}>
              <div className={styles.mediaCarousel}>
                {renderMedia()}
                {media.length > 1 ? (
                  <>
                    <button
                      className={`${styles.mediaNavBtn} ${styles.mediaNavLeft}`}
                      onClick={() => {
                        setMediaDirection("prev");
                        setMediaIndex(
                          (prev) => (prev - 1 + media.length) % media.length
                        );
                      }}
                      aria-label="Previous media"
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
                      onClick={() => {
                        setMediaDirection("next");
                        setMediaIndex((prev) => (prev + 1) % media.length);
                      }}
                      aria-label="Next media"
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
                  </>
                ) : null}
              </div>
            </div>

            <div className={styles.infoPane}>
              <div className={styles.infoScrollArea}>
                {header}
                <div className={styles.infoContent}>
                  <div
                    ref={captionRef}
                    className={`${styles.captionBlock} ${
                      styles.captionCollapsible
                    } ${
                      captionCollapsed && captionCanExpand
                        ? styles.captionCollapsed
                        : ""
                    }`}
                  >
                    {post.content || "No caption"}
                  </div>
                  {captionCanExpand ? (
                    <button
                      className={styles.seeMore}
                      onClick={() => setCaptionCollapsed((prev) => !prev)}
                    >
                      {captionCollapsed ? "See more" : "Collapse"}
                    </button>
                  ) : null}

                  <div className={styles.commentsSection}>
                    <div className={styles.commentsHeader}>Comments</div>
                    {commentsError ? (
                      <div className={styles.errorBox}>{commentsError}</div>
                    ) : null}
                    <div className={styles.commentList}>
                      {topLevelComments.map(renderComment)}
                      {commentsLoading && !topLevelComments.length ? (
                        <div className={styles.stateBox}>
                          Loading comments...
                        </div>
                      ) : null}
                      {!commentsLoading &&
                      !topLevelComments.length &&
                      !commentsError ? (
                        <div className={styles.stateBox}>No comments yet.</div>
                      ) : null}
                    </div>
                    {hasMoreComments ? (
                      <button
                        className={styles.loadMoreBtn}
                        onClick={() => loadComments(commentsPage + 1)}
                        disabled={commentsLoading}
                      >
                        {commentsLoading ? "Loading..." : "Load more"}
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className={styles.statsRow}>
                <button
                  type="button"
                  className={`${styles.statButton} ${
                    liked ? styles.statButtonActive : ""
                  }`}
                  onClick={toggleLike}
                  aria-label={liked ? "Unlike" : "Like"}
                >
                  <IconLike size={18} filled={liked} />
                  {!(hideLikeCount && !isAuthor) ? (
                    <span>{post.stats?.hearts ?? 0}</span>
                  ) : null}
                </button>
                <span className={styles.statItem}>
                  <svg
                    aria-hidden="true"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M5.5 5.5h13a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H10l-3.6 2.8a.6.6 0 0 1-.96-.48V7.5a2 2 0 0 1 2-2Z"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    ></path>
                  </svg>
                  <span>{post.stats?.comments ?? 0}</span>
                </span>
                <span className={styles.statItem}>
                  <svg
                    aria-hidden="true"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M2.8 12.4C4.5 8.7 7.7 6.2 12 6.2s7.5 2.5 9.2 6.2c-1.7 3.7-4.9 6.2-9.2 6.2s-7.5-2.5-9.2-6.2Z"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    ></path>
                    <path
                      d="M12 15.4a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8Z"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    ></path>
                    <circle
                      cx="12"
                      cy="12"
                      r="1.2"
                      fill="currentColor"
                    ></circle>
                  </svg>{" "}
                  <span>
                    {post.stats?.views ?? post.stats?.impressions ?? 0}
                  </span>
                </span>
              </div>
              {commentsLocked ? (
                <div className={styles.commentsLockedNotice}>
                  The post owner has turned off comments.
                </div>
              ) : (
                <>
                  {replyTarget ? (
                    <div className={styles.replyBadge}>
                      Replying to @{replyTarget.username || "comment"}
                      <button
                        onClick={() => setReplyTarget(null)}
                        aria-label="Cancel reply"
                      >
                        ×
                      </button>
                    </div>
                  ) : null}
                  <div className={styles.formRow}>
                    <div className={styles.emojiWrap} ref={emojiRef}>
                      <button
                        type="button"
                        className={styles.emojiButton}
                        onClick={() =>
                          !commentsLocked && setShowEmojiPicker((prev) => !prev)
                        }
                        aria-label="Add emoji"
                        disabled={commentsLocked}
                      >
                        <svg
                          aria-label="Emoji icon"
                          fill="currentColor"
                          height="20"
                          role="img"
                          viewBox="0 0 24 24"
                          width="20"
                        >
                          <title>Emoji icon</title>
                          <path d="M15.83 10.997a1.167 1.167 0 1 0 1.167 1.167 1.167 1.167 0 0 0-1.167-1.167Zm-6.5 1.167a1.167 1.167 0 1 0-1.166 1.167 1.167 1.167 0 0 0 1.166-1.167Zm5.163 3.24a3.406 3.406 0 0 1-4.982.007 1 1 0 1 0-1.557 1.256 5.397 5.397 0 0 0 8.09 0 1 1 0 0 0-1.55-1.263ZM12 .503a11.5 11.5 0 1 0 11.5 11.5A11.513 11.513 0 0 0 12 .503Zm0 21a9.5 9.5 0 1 1 9.5-9.5 9.51 9.51 0 0 1-9.5 9.5Z"></path>
                        </svg>
                      </button>
                      {showEmojiPicker ? (
                        <div className={styles.emojiPopover}>
                          <EmojiPicker
                            onEmojiClick={(emojiData) => {
                              insertEmoji(toEmojiChar(emojiData));
                              setShowEmojiPicker(false);
                            }}
                            searchDisabled={false}
                            skinTonesDisabled={false}
                            lazyLoadEmojis
                          />
                        </div>
                      ) : null}
                    </div>
                    <textarea
                      ref={commentInputRef}
                      className={styles.input}
                      placeholder={
                        commentsLocked
                          ? "Comments are turned off"
                          : "Add a comment..."
                      }
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          if (
                            !submitting &&
                            !commentsLocked &&
                            commentText.trim()
                          ) {
                            handleSubmit();
                          }
                        }
                      }}
                      rows={3}
                      disabled={commentsLocked}
                    />
                    <button
                      className={styles.submitBtn}
                      onClick={handleSubmit}
                      disabled={
                        commentsLocked || submitting || !commentText.trim()
                      }
                    >
                      {submitting ? "Posting..." : "Post"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className={styles.stateBox}>Post not found</div>
        )}
      </div>
      {toastMessage ? (
        <div
          className={styles.toast}
          role="status"
          aria-live="polite"
          onClick={(e) => e.stopPropagation()}
        >
          {toastMessage}
        </div>
      ) : null}

      {reportOpen ? (
        <div
          className={`${styles.reportOverlay} ${
            reportClosing
              ? styles.reportOverlayClosing
              : styles.reportOverlayOpen
          }`}
          role="dialog"
          aria-modal="true"
          onClick={closeReportModal}
        >
          <div
            className={`${styles.reportCard} ${
              reportClosing ? styles.reportCardClosing : styles.reportCardOpen
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.reportHeader}>
              <div>
                <h3 className={styles.reportTitle}>Report this post</h3>
                <p className={styles.reportBody}>
                  Help us understand what is wrong with this content.
                </p>
              </div>
              <button
                className={styles.reportClose}
                aria-label="Close"
                onClick={closeReportModal}
              >
                ×
              </button>
            </div>

            <div className={styles.reportGrid}>
              <div className={styles.reportCategoryGrid}>
                {REPORT_GROUPS.map((group) => {
                  const isActive = reportCategory === group.key;
                  return (
                    <button
                      key={group.key}
                      className={`${styles.reportCategoryCard} ${
                        isActive ? styles.reportCategoryCardActive : ""
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
                        className={styles.reportCategoryDot}
                        style={{ background: group.accent }}
                      />
                      <span className={styles.reportCategoryLabel}>
                        {group.label}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className={styles.reportReasonPanel}>
                <div className={styles.reportReasonHeader}>
                  Select a specific reason
                </div>
                {selectedReportGroup ? (
                  <div className={styles.reportReasonList}>
                    {selectedReportGroup.reasons.map((reason) => {
                      const checked = reportReason === reason.key;
                      return (
                        <button
                          key={reason.key}
                          className={`${styles.reportReasonRow} ${
                            checked ? styles.reportReasonRowActive : ""
                          }`}
                          onClick={() => setReportReason(reason.key)}
                        >
                          <span
                            className={styles.reportReasonRadio}
                            aria-checked={checked}
                          >
                            {checked ? (
                              <span className={styles.reportReasonRadioDot} />
                            ) : null}
                          </span>
                          <span>{reason.label}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className={styles.reportReasonPlaceholder}>
                    Pick a category first.
                  </div>
                )}

                <label className={styles.reportNoteLabel}>
                  Additional notes (optional)
                  <textarea
                    className={styles.reportNoteInput}
                    placeholder="Add brief context if needed..."
                    value={reportNote}
                    onChange={(e) => setReportNote(e.target.value)}
                    maxLength={500}
                  />
                </label>
                {reportError ? (
                  <div className={styles.reportInlineError}>{reportError}</div>
                ) : null}
              </div>
            </div>

            <div className={styles.reportActions}>
              <button
                className={styles.reportSecondary}
                onClick={closeReportModal}
                disabled={reportSubmitting}
              >
                Cancel
              </button>
              <button
                className={styles.reportPrimary}
                onClick={submitReport}
                disabled={!reportReason || reportSubmitting}
              >
                {reportSubmitting ? "Submitting..." : "Submit report"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
