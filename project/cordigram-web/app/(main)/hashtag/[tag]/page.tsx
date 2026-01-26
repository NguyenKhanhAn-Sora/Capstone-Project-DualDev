"use client";

import { JSX, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import styles from "./hashtag.module.css";
import feedStyles from "../../home-feed.module.css";
import {
  fetchPostsByHashtag,
  fetchReelsByHashtag,
  createPost,
  deletePost,
  hidePost,
  likePost,
  unlikePost,
  followUser,
  unfollowUser,
  reportPost,
  blockUser,
  savePost,
  unsavePost,
  repostPost,
  setPostAllowComments,
  setPostHideLikeCount,
  updatePostVisibility,
  type FeedItem,
} from "@/lib/api";
import { getStoredAccessToken } from "@/lib/auth";
import { useRequireAuth } from "@/hooks/use-require-auth";
import PostEditOverlay from "@/ui/post-edit-overlay";
import ImageViewerOverlay from "@/ui/image-viewer-overlay/image-viewer-overlay";

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

const IconView = () => (
  <svg
    aria-hidden
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M1.5 12s4-7.5 10.5-7.5S22.5 12 22.5 12 18.5 19.5 12 19.5 1.5 12 1.5 12Z" />
    <circle cx="12" cy="12" r="3.2" fill="currentColor" />
  </svg>
);

const REPORT_ANIMATION_MS = 200;
const QUOTE_CHAR_LIMIT = 500;

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

const normalizeHashtag = (value: string) =>
  value
    .replace(/^#/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "")
    .replace(/[^a-zA-Z0-9_]/g, "")
    .toLowerCase();

const extractMentionsFromCaption = (value: string) => {
  const handles = new Set<string>();
  const regex = /@([a-zA-Z0-9_.]{1,30})/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(value))) {
    handles.add(match[1].toLowerCase());
  }
  return Array.from(handles);
};

const formatCount = (value?: number) => {
  const n = value ?? 0;
  if (n >= 1_000_000)
    return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return `${n}`;
};

export default function HashtagPage() {
  const canRender = useRequireAuth();
  const params = useParams<{ tag?: string }>();
  const router = useRouter();
  const tag = useMemo(() => {
    const raw = Array.isArray(params?.tag) ? params.tag[0] : params?.tag;
    return raw ? decodeURIComponent(raw) : "";
  }, [params]);

  const [tab, setTab] = useState<"posts" | "reels">("posts");
  const [posts, setPosts] = useState<FeedItem[]>([]);
  const [reels, setReels] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editTarget, setEditTarget] = useState<FeedItem | null>(null);
  const [editToken, setEditToken] = useState<string | null>(null);
  const [viewerId, setViewerId] = useState<string | undefined>(() =>
    typeof window === "undefined"
      ? undefined
      : getUserIdFromToken(localStorage.getItem("accessToken")),
  );
  const [reportTarget, setReportTarget] = useState<{
    postId: string;
    label: string;
  }>();
  const [reportCategory, setReportCategory] = useState<
    ReportCategory["key"] | null
  >(null);
  const [reportReason, setReportReason] = useState<string | null>(null);
  const [reportNote, setReportNote] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportError, setReportError] = useState("");
  const [reportClosing, setReportClosing] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    postId: string;
    label: string;
  } | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [blockTarget, setBlockTarget] = useState<{
    userId: string;
    label: string;
  }>();
  const [blocking, setBlocking] = useState(false);
  const [visibilityModalOpen, setVisibilityModalOpen] = useState(false);
  const [visibilityTarget, setVisibilityTarget] = useState<{
    postId: string;
    current: "public" | "followers" | "private";
  } | null>(null);
  const [visibilitySelected, setVisibilitySelected] = useState<
    "public" | "followers" | "private"
  >("public");
  const [visibilityError, setVisibilityError] = useState("");
  const [repostTarget, setRepostTarget] = useState<{
    postId: string;
    label: string;
  } | null>(null);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [repostMode, setRepostMode] = useState<"quote" | "repost" | null>(null);
  const [repostNote, setRepostNote] = useState("");
  const [quoteVisibility, setQuoteVisibility] = useState<
    "public" | "followers" | "private"
  >("public");
  const [quoteAllowComments, setQuoteAllowComments] = useState(true);
  const [quoteAllowDownload, setQuoteAllowDownload] = useState(true);
  const [quoteHideLikeCount, setQuoteHideLikeCount] = useState(false);
  const [quoteLocation, setQuoteLocation] = useState("");
  const [quoteHashtags, setQuoteHashtags] = useState<string[]>([]);
  const [quoteHashtagDraft, setQuoteHashtagDraft] = useState("");
  const [repostSubmitting, setRepostSubmitting] = useState(false);
  const [repostError, setRepostError] = useState("");
  const [repostClosing, setRepostClosing] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const updatePost = (
    postId: string,
    updater: (item: FeedItem) => FeedItem,
  ) => {
    setPosts((prev) =>
      prev.map((item) => (item.id === postId ? updater(item) : item)),
    );
  };

  const showToast = (message: string) => {
    setToastMessage(message);
    window.setTimeout(() => setToastMessage(null), 2200);
  };

  const selectedReportGroup = useMemo(
    () => REPORT_GROUPS.find((g) => g.key === reportCategory),
    [reportCategory],
  );

  const quoteVisibilityOptions = useMemo(
    () => [
      {
        value: "public" as const,
        title: "Public",
        description: "Anyone can view this repost",
      },
      {
        value: "followers" as const,
        title: "Followers",
        description: "Only followers can view this repost",
      },
      {
        value: "private" as const,
        title: "Private",
        description: "Only you can view this repost",
      },
    ],
    [],
  );

  const resetQuoteState = () => {
    setRepostMode(null);
    setRepostNote("");
    setQuoteVisibility("public");
    setQuoteAllowComments(true);
    setQuoteAllowDownload(true);
    setQuoteHideLikeCount(false);
    setQuoteLocation("");
    setQuoteHashtags([]);
    setQuoteHashtagDraft("");
    setRepostError("");
    setRepostSubmitting(false);
    setQuoteOpen(false);
  };

  const addQuoteHashtag = () => {
    const clean = normalizeHashtag(quoteHashtagDraft);
    if (!clean) return;
    setQuoteHashtags((prev) =>
      prev.includes(clean) ? prev : [...prev, clean].slice(0, 12),
    );
    setQuoteHashtagDraft("");
  };

  const removeQuoteHashtag = (tag: string) => {
    setQuoteHashtags((prev) => prev.filter((item) => item !== tag));
  };

  const incrementRepostStat = (postId: string) => {
    updatePost(postId, (item) => {
      const current = item.stats?.reposts ?? item.stats?.shares ?? 0;
      const next = current + 1;
      return {
        ...item,
        reposted: true,
        stats: {
          ...item.stats,
          shares: next,
          reposts: next,
        },
      };
    });
  };

  const resolveOriginalPostId = (postId: string) => {
    const target = posts.find((item) => item.id === postId);
    return target?.repostOf || postId;
  };

  const submitRepost = async (modeOverride?: "quote" | "repost") => {
    const token = getStoredAccessToken();
    const mode = modeOverride ?? repostMode;
    if (!token || !repostTarget || !mode) {
      setRepostError("Choose an option to continue");
      return;
    }
    const originalId = resolveOriginalPostId(repostTarget.postId);
    const targetId = repostTarget.postId;
    setRepostSubmitting(true);
    setRepostError("");
    try {
      if (mode === "repost") {
        await createPost({ token, payload: { repostOf: originalId } });
        incrementRepostStat(originalId);
        if (originalId !== targetId) {
          incrementRepostStat(targetId);
          try {
            await repostPost({ token, postId: targetId });
          } catch {}
        }
        showToast("Reposted");
        closeRepostModal();
        return;
      }

      const note = repostNote.trim();
      const mentions = extractMentionsFromCaption(note);
      const payload = {
        repostOf: originalId,
        content: note || undefined,
        hashtags: quoteHashtags.length ? quoteHashtags : undefined,
        location: quoteLocation.trim() || undefined,
        allowComments: quoteAllowComments,
        allowDownload: quoteAllowDownload,
        hideLikeCount: quoteHideLikeCount,
        visibility: quoteVisibility,
        mentions: mentions.length ? mentions : undefined,
      };
      await createPost({ token, payload });
      incrementRepostStat(originalId);
      if (originalId !== targetId) {
        incrementRepostStat(targetId);
        try {
          await repostPost({ token, postId: targetId });
        } catch {}
      }
      showToast("Reposted with quote");
      closeRepostModal();
    } catch (err) {
      const message =
        typeof err === "object" && err && "message" in err
          ? String((err as { message?: string }).message)
          : "Could not repost";
      setRepostError(message || "Could not repost");
    } finally {
      setRepostSubmitting(false);
    }
  };

  const closeRepostModal = () => {
    setRepostClosing(true);
    window.setTimeout(() => {
      setRepostTarget(null);
      resetQuoteState();
      setRepostClosing(false);
    }, REPORT_ANIMATION_MS);
  };

  const handleQuickRepost = () => {
    if (!repostTarget) return;
    setRepostMode("repost");
    void submitRepost("repost");
  };

  const openQuoteComposer = () => {
    if (!repostTarget) return;
    setRepostMode("quote");
    setQuoteOpen(true);
    setRepostError("");
  };

  const onRepostIntent = (postId: string, label: string) => {
    const token = getStoredAccessToken();
    if (!token) return;
    setRepostClosing(false);
    setRepostTarget({ postId, label });
    setRepostMode(null);
    setRepostNote("");
    setQuoteOpen(false);
    setQuoteVisibility("public");
    setQuoteAllowComments(true);
    setQuoteAllowDownload(true);
    setQuoteHideLikeCount(false);
    setQuoteLocation("");
    setQuoteHashtags([]);
    setQuoteHashtagDraft("");
    setRepostError("");
    setRepostSubmitting(false);
  };

  const onReportIntent = (postId: string, label: string) => {
    setReportTarget({ postId, label });
    setReportCategory(null);
    setReportReason(null);
    setReportNote("");
    setReportError("");
    setReportSubmitting(false);
    setReportClosing(false);
  };

  const closeReportModal = () => {
    setReportClosing(true);
    window.setTimeout(() => {
      setReportTarget(undefined);
      setReportClosing(false);
    }, REPORT_ANIMATION_MS);
  };

  const submitReport = async () => {
    const token = getStoredAccessToken();
    if (!token || !reportTarget || !reportCategory || !reportReason) return;
    setReportSubmitting(true);
    setReportError("");
    try {
      await reportPost({
        token,
        postId: reportTarget.postId,
        category: reportCategory,
        reason: reportReason,
        note: reportNote.trim() || undefined,
      });
      showToast("Report submitted");
      closeReportModal();
    } catch (err) {
      const message =
        typeof err === "object" && err && "message" in err
          ? String((err as { message?: string }).message)
          : "Failed to submit report";
      setReportError(message || "Failed to submit report");
    } finally {
      setReportSubmitting(false);
    }
  };

  const onDeleteIntent = (postId: string, label: string) => {
    setDeleteTarget({ postId, label });
    setDeleteError("");
  };

  const confirmDelete = async () => {
    const token = getStoredAccessToken();
    if (!token || !deleteTarget) return;
    setDeleteSubmitting(true);
    setDeleteError("");
    try {
      await deletePost({ token, postId: deleteTarget.postId });
      setPosts((prev) =>
        prev.filter((item) => item.id !== deleteTarget.postId),
      );
      setDeleteTarget(null);
      showToast("Post deleted");
    } catch (err) {
      const message =
        typeof err === "object" && err && "message" in err
          ? String((err as { message?: string }).message)
          : "Failed to delete post";
      setDeleteError(message || "Failed to delete post");
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const confirmBlock = async () => {
    const token = getStoredAccessToken();
    if (!token || !blockTarget) return;
    setBlocking(true);
    try {
      await blockUser({ token, userId: blockTarget.userId });
      setPosts((prev) =>
        prev.filter((item) => item.authorId !== blockTarget.userId),
      );
      setBlockTarget(undefined);
    } catch (err) {
      showToast("Block failed");
    } finally {
      setBlocking(false);
    }
  };

  const onFollow = async (authorId: string, nextFollow: boolean) => {
    const token = getStoredAccessToken();
    if (!token) return;
    setPosts((prev) =>
      prev.map((item) =>
        item.authorId === authorId ? { ...item, following: nextFollow } : item,
      ),
    );
    try {
      if (nextFollow) await followUser({ token, userId: authorId });
      else await unfollowUser({ token, userId: authorId });
    } catch {
      setPosts((prev) =>
        prev.map((item) =>
          item.authorId === authorId
            ? { ...item, following: !nextFollow }
            : item,
        ),
      );
    }
  };

  const onToggleComments = async (postId: string, allowComments: boolean) => {
    const token = getStoredAccessToken();
    if (!token) return;
    updatePost(postId, (item) => ({ ...item, allowComments }));
    try {
      await setPostAllowComments({ token, postId, allowComments });
      showToast(allowComments ? "Comments turned on" : "Comments turned off");
    } catch {
      updatePost(postId, (item) => ({
        ...item,
        allowComments: !allowComments,
      }));
      showToast("Failed to update comments");
    }
  };

  const onToggleHideLikeCount = async (
    postId: string,
    hideLikeCount: boolean,
  ) => {
    const token = getStoredAccessToken();
    if (!token) return;
    updatePost(postId, (item) => ({ ...item, hideLikeCount }));
    try {
      await setPostHideLikeCount({ token, postId, hideLikeCount });
      showToast(hideLikeCount ? "Like count hidden" : "Like count visible");
    } catch {
      updatePost(postId, (item) => ({
        ...item,
        hideLikeCount: !hideLikeCount,
      }));
      showToast("Failed to update like count visibility");
    }
  };

  const openVisibilityModal = (
    postId: string,
    current: "public" | "followers" | "private",
  ) => {
    setVisibilityTarget({ postId, current });
    setVisibilitySelected(current);
    setVisibilityError("");
    setVisibilityModalOpen(true);
  };

  const submitVisibility = async () => {
    const token = getStoredAccessToken();
    if (!token || !visibilityTarget) return;
    try {
      await updatePostVisibility({
        token,
        postId: visibilityTarget.postId,
        visibility: visibilitySelected,
      });
      updatePost(visibilityTarget.postId, (item) => ({
        ...item,
        visibility: visibilitySelected,
      }));
      setVisibilityModalOpen(false);
    } catch (err) {
      const message =
        typeof err === "object" && err && "message" in err
          ? String((err as { message?: string }).message)
          : "Failed to update visibility";
      setVisibilityError(message || "Failed to update visibility");
    }
  };

  const onLike = async (postId: string, liked: boolean) => {
    const token = getStoredAccessToken();
    if (!token) return;
    const targetItem = posts.find((item) => item.id === postId);
    const targetId = targetItem?.repostOf || postId;
    updatePost(postId, (item) => ({
      ...item,
      liked,
      stats: {
        ...item.stats,
        hearts: Math.max(0, (item.stats?.hearts ?? 0) + (liked ? 1 : -1)),
      },
    }));
    try {
      if (liked) {
        await likePost({ token, postId: targetId });
      } else {
        await unlikePost({ token, postId: targetId });
      }
    } catch {
      updatePost(postId, (item) => ({
        ...item,
        liked: !liked,
        stats: {
          ...item.stats,
          hearts: Math.max(0, (item.stats?.hearts ?? 0) + (liked ? -1 : 1)),
        },
      }));
      setError("Action failed");
    }
  };

  const onSave = async (postId: string, saved: boolean) => {
    const token = getStoredAccessToken();
    if (!token) return;
    updatePost(postId, (item) => ({
      ...item,
      saved,
      stats: {
        ...item.stats,
        saves: Math.max(0, (item.stats?.saves ?? 0) + (saved ? 1 : -1)),
      },
    }));
    try {
      if (saved) {
        await savePost({ token, postId });
      } else {
        await unsavePost({ token, postId });
      }
    } catch {
      updatePost(postId, (item) => ({
        ...item,
        saved: !saved,
        stats: {
          ...item.stats,
          saves: Math.max(0, (item.stats?.saves ?? 0) + (saved ? -1 : 1)),
        },
      }));
      setError("Action failed");
    }
  };

  const onHide = async (postId: string) => {
    const token = getStoredAccessToken();
    if (!token) return;
    setPosts((prev) => prev.filter((item) => item.id !== postId));
    try {
      await hidePost({ token, postId });
      showToast("Post hidden");
    } catch {
      showToast("Failed to hide post");
    }
  };

  const onCopyLink = async (postId: string) => {
    const url = `${window.location.origin}/post/${postId}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast("Link copied");
    } catch {
      showToast("Copy failed");
    }
  };

  useEffect(() => {
    if (!canRender || !tag) return;
    const token = getStoredAccessToken();
    if (!token) return;
    setLoading(true);
    setError("");
    const fetcher =
      tab === "posts"
        ? fetchPostsByHashtag({ token, tag, limit: 36 })
        : fetchReelsByHashtag({ token, tag, limit: 36 });
    fetcher
      .then((items) => {
        if (tab === "posts") setPosts(items);
        else setReels(items);
      })
      .catch((err: unknown) => {
        const message =
          typeof err === "object" && err && "message" in err
            ? String((err as { message?: string }).message)
            : "Unable to load posts";
        setError(message || "Unable to load posts");
      })
      .finally(() => setLoading(false));
  }, [canRender, tab, tag]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setViewerId(getUserIdFromToken(localStorage.getItem("accessToken")));
    setEditToken(getStoredAccessToken());
  }, [canRender]);

  if (!canRender) return null;

  const activeCount = tab === "posts" ? posts.length : reels.length;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Hashtag</p>
          <h1 className={styles.title}>#{tag}</h1>
        </div>
        <div className={styles.meta}>
          {loading ? "Loading..." : `${activeCount} ${tab}`}
        </div>
      </div>

      <div className={`${styles.tabWrapper} `}>
        <div className={`${styles.tabs} `}>
          <button
            type="button"
            className={`${styles.tabBtn} ${
              tab === "posts" ? styles.tabBtnActive : ""
            }`}
            onClick={() => setTab("posts")}
          >
            Posts
          </button>
          <button
            type="button"
            className={`${styles.tabBtn} ${
              tab === "reels" ? styles.tabBtnActive : ""
            }`}
            onClick={() => setTab("reels")}
          >
            Reels
          </button>
        </div>
      </div>
      {error ? <div className={styles.errorBox}>{error}</div> : null}

      {loading ? (
        <div className={styles.grid}>
          {Array.from({ length: 9 }).map((_, idx) => (
            <div key={idx} className={`${styles.card} ${styles.skeleton}`} />
          ))}
        </div>
      ) : tab === "posts" ? (
        posts.length === 0 ? (
          <div className={styles.emptyState}>
            No posts found for this hashtag.
          </div>
        ) : (
          <div className={styles.feedList}>
            {posts.map((item) => (
              <HashtagPostCard
                key={item.id}
                item={item}
                liked={Boolean(item.liked)}
                saved={Boolean(item.saved)}
                reposted={Boolean(item.reposted)}
                viewerId={viewerId}
                onEdit={setEditTarget}
                onLike={onLike}
                onSave={onSave}
                onShare={onRepostIntent}
                onHide={onHide}
                onCopyLink={onCopyLink}
                onReportIntent={onReportIntent}
                onDeleteIntent={onDeleteIntent}
                onBlockUser={(userId, label) =>
                  userId ? setBlockTarget({ userId, label: label || "" }) : null
                }
                onFollow={onFollow}
                onToggleComments={onToggleComments}
                onToggleHideLikeCount={onToggleHideLikeCount}
                onOpenVisibility={openVisibilityModal}
              />
            ))}
          </div>
        )
      ) : reels.length === 0 ? (
        <div className={styles.emptyState}>
          No reels found for this hashtag.
        </div>
      ) : (
        <div className={styles.reelGrid}>
          {reels.map((item) => {
            const media = item.media?.[0];
            if (!media) return null;
            const targetId = (item as any)?.repostOf || item.id;
            const handleEnter = (e: React.MouseEvent<HTMLVideoElement>) => {
              const el = e.currentTarget;
              el.currentTime = 0;
              void el.play().catch(() => undefined);
            };
            const handleLeave = (e: React.MouseEvent<HTMLVideoElement>) => {
              const el = e.currentTarget;
              el.pause();
              el.currentTime = 0;
            };
            return (
              <button
                key={item.id}
                type="button"
                className={styles.reelTile}
                onClick={() => router.push(`/reels/${targetId}?single=1`)}
              >
                <video
                  className={styles.reelTileMedia}
                  src={media.url}
                  muted
                  playsInline
                  preload="metadata"
                  onMouseEnter={handleEnter}
                  onMouseLeave={handleLeave}
                />
                <div className={styles.reelViewBadge}>
                  <IconView />
                  {formatCount(item.stats?.views ?? item.stats?.impressions)}
                </div>
              </button>
            );
          })}
        </div>
      )}

      <PostEditOverlay
        open={Boolean(editTarget)}
        post={editTarget}
        token={editToken}
        onClose={() => setEditTarget(null)}
        onUpdated={(updated) => {
          updatePost(updated.id, () => updated);
          setEditTarget(null);
        }}
      />

      {deleteTarget ? (
        <div
          className={feedStyles.modalOverlay}
          role="dialog"
          aria-modal="true"
        >
          <div className={feedStyles.modalCard}>
            <h3 className={feedStyles.modalTitle}>Delete this post?</h3>
            <p className={feedStyles.modalBody}>
              {`You are about to delete ${deleteTarget.label}'s post. This can't be undone.`}
            </p>
            {deleteError ? (
              <div className={feedStyles.inlineError}>{deleteError}</div>
            ) : null}
            <div className={feedStyles.modalActions}>
              <button
                className={feedStyles.modalSecondary}
                onClick={() => setDeleteTarget(null)}
                disabled={deleteSubmitting}
              >
                Cancel
              </button>
              <button
                className={feedStyles.modalDanger}
                onClick={confirmDelete}
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
          className={feedStyles.modalOverlay}
          role="dialog"
          aria-modal="true"
        >
          <div className={feedStyles.modalCard}>
            <h3 className={feedStyles.modalTitle}>Block this account?</h3>
            <p className={feedStyles.modalBody}>
              {`You are about to block ${blockTarget.label}. They will no longer be able to interact with you.`}
            </p>
            <div className={feedStyles.modalActions}>
              <button
                className={feedStyles.modalSecondary}
                onClick={() => setBlockTarget(undefined)}
                disabled={blocking}
              >
                Cancel
              </button>
              <button
                className={feedStyles.modalDanger}
                onClick={confirmBlock}
                disabled={blocking}
              >
                {blocking ? "Blocking..." : "Block"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {reportTarget ? (
        <div
          className={`${feedStyles.modalOverlay} ${
            reportClosing
              ? feedStyles.modalOverlayClosing
              : feedStyles.modalOverlayOpen
          }`}
          role="dialog"
          aria-modal="true"
        >
          <div
            className={`${feedStyles.modalCard} ${feedStyles.reportCard} ${
              reportClosing
                ? feedStyles.modalCardClosing
                : feedStyles.modalCardOpen
            }`}
          >
            <div className={feedStyles.modalHeader}>
              <div>
                <h3 className={feedStyles.modalTitle}>Report this post</h3>
                <p className={feedStyles.modalBody}>
                  {`Reporting @${reportTarget.label} post. Please pick the most accurate reason.`}
                </p>
              </div>
              <button
                className={feedStyles.closeBtn}
                aria-label="Close"
                onClick={closeReportModal}
              >
                <IconClose size={24} />
              </button>
            </div>

            <div className={feedStyles.reportGrid}>
              <div className={feedStyles.categoryGrid}>
                {REPORT_GROUPS.map((group) => {
                  const isActive = reportCategory === group.key;
                  return (
                    <button
                      key={group.key}
                      className={`${feedStyles.categoryCard} ${
                        isActive ? feedStyles.categoryCardActive : ""
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
                            : null,
                        );
                      }}
                    >
                      <span
                        className={feedStyles.categoryDot}
                        style={{ background: group.accent }}
                      />
                      <span className={feedStyles.categoryLabel}>
                        {group.label}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className={feedStyles.reasonPanel}>
                <div className={feedStyles.reasonHeader}>
                  Select a specific reason
                </div>
                {selectedReportGroup ? (
                  <div className={feedStyles.reasonList}>
                    {selectedReportGroup.reasons.map((r) => {
                      const checked = reportReason === r.key;
                      return (
                        <button
                          key={r.key}
                          className={`${feedStyles.reasonRow} ${
                            checked ? feedStyles.reasonRowActive : ""
                          }`}
                          onClick={() => setReportReason(r.key)}
                        >
                          <span
                            className={feedStyles.reasonRadio}
                            aria-checked={checked}
                          >
                            {checked ? (
                              <span className={feedStyles.reasonRadioDot} />
                            ) : null}
                          </span>
                          <span>{r.label}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className={feedStyles.reasonPlaceholder}>
                    Pick a category first.
                  </div>
                )}

                <label className={feedStyles.noteLabel}>
                  Additional notes (optional)
                  <textarea
                    className={feedStyles.noteInput}
                    placeholder="Add brief context if needed..."
                    value={reportNote}
                    onChange={(e) => setReportNote(e.target.value)}
                    maxLength={500}
                  />
                </label>
                {reportError ? (
                  <div className={feedStyles.inlineError}>{reportError}</div>
                ) : null}
              </div>
            </div>

            <div className={feedStyles.modalActions}>
              <button
                className={feedStyles.modalSecondary}
                onClick={closeReportModal}
                disabled={reportSubmitting}
              >
                Cancel
              </button>
              <button
                className={feedStyles.modalPrimary}
                disabled={!reportReason || reportSubmitting}
                onClick={submitReport}
              >
                {reportSubmitting ? "Submitting..." : "Submit report"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {visibilityModalOpen && visibilityTarget ? (
        <div
          className={feedStyles.modalOverlay}
          role="dialog"
          aria-modal="true"
        >
          <div className={feedStyles.modalCard}>
            <div className={feedStyles.modalHeader}>
              <div>
                <h3 className={feedStyles.modalTitle}>Post visibility</h3>
                <p className={feedStyles.modalBody}>
                  Choose who can see this post.
                </p>
              </div>
              <button
                className={feedStyles.closeBtn}
                aria-label="Close"
                onClick={() => setVisibilityModalOpen(false)}
              >
                <IconClose size={20} />
              </button>
            </div>
            <div className={feedStyles.visibilityList}>
              {[
                {
                  value: "public" as const,
                  title: "Public",
                  description: "Anyone can view this post",
                },
                {
                  value: "followers" as const,
                  title: "Followers",
                  description: "Only followers can view this post",
                },
                {
                  value: "private" as const,
                  title: "Private",
                  description: "Only you can view this post",
                },
              ].map((opt) => {
                const active = visibilitySelected === opt.value;
                return (
                  <button
                    key={opt.value}
                    className={`${feedStyles.visibilityOption} ${
                      active ? feedStyles.visibilityOptionActive : ""
                    }`}
                    onClick={() => setVisibilitySelected(opt.value)}
                  >
                    <span className={feedStyles.visibilityRadio}>
                      {active ? "✓" : ""}
                    </span>
                    <span className={feedStyles.visibilityCopy}>
                      <span className={feedStyles.visibilityTitle}>
                        {opt.title}
                      </span>
                      <span className={feedStyles.visibilityDesc}>
                        {opt.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            {visibilityError ? (
              <div className={feedStyles.inlineError}>{visibilityError}</div>
            ) : null}
            <div className={feedStyles.modalActions}>
              <button
                className={feedStyles.modalSecondary}
                onClick={() => setVisibilityModalOpen(false)}
              >
                Cancel
              </button>
              <button
                className={feedStyles.modalPrimary}
                onClick={submitVisibility}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {quoteOpen && repostTarget ? (
        <div
          className={`${feedStyles.modalOverlay} ${
            repostClosing
              ? feedStyles.modalOverlayClosing
              : feedStyles.modalOverlayOpen
          }`}
          role="dialog"
          aria-modal="true"
          onClick={closeRepostModal}
        >
          <div
            className={`${feedStyles.modalCard} ${feedStyles.repostCard} ${
              repostClosing
                ? feedStyles.modalCardClosing
                : feedStyles.modalCardOpen
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className={`${feedStyles.modalHeader} ${feedStyles.repostHeader}`}
            >
              <div>
                <h3 className={feedStyles.modalTitle}>Quote</h3>
                <p className={feedStyles.repostSub}>
                  {`Quoting @${repostTarget.label}'s post`}
                </p>
              </div>
              <button
                className={feedStyles.closeBtn}
                onClick={closeRepostModal}
                aria-label="Close"
              >
                <IconClose size={18} />
              </button>
            </div>

            <label className={feedStyles.repostNoteLabel}>
              Caption
              <div className={feedStyles.editTextareaShell}>
                <textarea
                  className={feedStyles.repostTextarea}
                  value={repostNote}
                  onChange={(e) => setRepostNote(e.target.value)}
                  maxLength={QUOTE_CHAR_LIMIT}
                  placeholder="Add your thoughts..."
                />
                <span className={feedStyles.charCount}>
                  {repostNote.length}/{QUOTE_CHAR_LIMIT}
                </span>
              </div>
            </label>

            <div className={feedStyles.editField}>
              <div className={feedStyles.editLabelRow}>
                <span className={feedStyles.editLabelText}>Visibility</span>
              </div>
              <div className={feedStyles.visibilityList}>
                {quoteVisibilityOptions.map((opt) => {
                  const active = quoteVisibility === opt.value;
                  return (
                    <button
                      key={opt.value}
                      className={`${feedStyles.visibilityOption} ${
                        active ? feedStyles.visibilityOptionActive : ""
                      }`}
                      onClick={() => setQuoteVisibility(opt.value)}
                    >
                      <span className={feedStyles.visibilityRadio}>
                        {active ? "✓" : ""}
                      </span>
                      <span className={feedStyles.visibilityCopy}>
                        <span className={feedStyles.visibilityTitle}>
                          {opt.title}
                        </span>
                        <span className={feedStyles.visibilityDesc}>
                          {opt.description}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className={feedStyles.switchGroup}>
              <label className={feedStyles.switchRow}>
                <input
                  type="checkbox"
                  checked={quoteAllowComments}
                  onChange={() => setQuoteAllowComments((prev) => !prev)}
                />
                <div>
                  <p className={feedStyles.switchTitle}>Allow comments</p>
                  <p className={feedStyles.switchHint}>
                    People can reply to your quote
                  </p>
                </div>
              </label>

              <label className={feedStyles.switchRow}>
                <input
                  type="checkbox"
                  checked={quoteAllowDownload}
                  onChange={() => setQuoteAllowDownload((prev) => !prev)}
                />
                <div>
                  <p className={feedStyles.switchTitle}>Allow downloads</p>
                  <p className={feedStyles.switchHint}>
                    Let followers save the media from the original post
                  </p>
                </div>
              </label>

              <label className={feedStyles.switchRow}>
                <input
                  type="checkbox"
                  checked={quoteHideLikeCount}
                  onChange={() => setQuoteHideLikeCount((prev) => !prev)}
                />
                <div>
                  <p className={feedStyles.switchTitle}>Hide like</p>
                  <p className={feedStyles.switchHint}>
                    Only you will see like counts on this quote
                  </p>
                </div>
              </label>
            </div>

            <div className={feedStyles.editField}>
              <div className={feedStyles.editLabelRow}>
                <span className={feedStyles.editLabelText}>Location</span>
              </div>
              <input
                className={feedStyles.editInput}
                placeholder="Add a place"
                value={quoteLocation}
                onChange={(e) => setQuoteLocation(e.target.value)}
              />
            </div>

            <div className={feedStyles.editField}>
              <div className={feedStyles.editLabelRow}>
                <span className={feedStyles.editLabelText}>Hashtags</span>
              </div>
              <div className={feedStyles.chipRow}>
                {quoteHashtags.map((tag) => (
                  <span key={tag} className={feedStyles.chip}>
                    #{tag}
                    <button
                      type="button"
                      className={feedStyles.chipRemove}
                      onClick={() => removeQuoteHashtag(tag)}
                      aria-label={`Remove ${tag}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
                <input
                  className={feedStyles.editInput}
                  placeholder="Add hashtag"
                  value={quoteHashtagDraft}
                  onChange={(e) => setQuoteHashtagDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      addQuoteHashtag();
                    }
                  }}
                />
              </div>
            </div>

            {repostError ? (
              <div className={feedStyles.inlineError}>{repostError}</div>
            ) : null}

            <div className={feedStyles.modalActions}>
              <button
                className={feedStyles.modalSecondary}
                onClick={closeRepostModal}
                disabled={repostSubmitting}
              >
                Cancel
              </button>
              <button
                className={feedStyles.modalPrimary}
                onClick={() => submitRepost("quote")}
                disabled={repostSubmitting}
              >
                {repostSubmitting ? "Sharing..." : "Share quote"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {repostTarget && !quoteOpen ? (
        <div
          className={`${feedStyles.modalOverlay} ${feedStyles.modalOverlayOpen}`}
          role="dialog"
          aria-modal="true"
          onClick={closeRepostModal}
        >
          <div
            className={feedStyles.repostSheet}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={feedStyles.repostSheetHeader}>
              <p className={feedStyles.repostSheetTitle}>Repost</p>
              <p className={feedStyles.repostSheetSubtitle}>
                {`@${repostTarget.label} · post`}
              </p>
            </div>
            <div className={feedStyles.repostSheetList} role="menu">
              <button
                className={`${feedStyles.repostSheetItem} ${
                  feedStyles.repostSheetPrimary
                }`}
                onClick={handleQuickRepost}
                disabled={repostSubmitting}
              >
                Repost
              </button>
              <button
                className={feedStyles.repostSheetItem}
                onClick={openQuoteComposer}
                disabled={repostSubmitting}
              >
                Quote
              </button>
              <button
                className={feedStyles.repostSheetItem}
                onClick={closeRepostModal}
                disabled={repostSubmitting}
              >
                Hủy
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toastMessage ? (
        <div className={feedStyles.toast}>{toastMessage}</div>
      ) : null}
    </div>
  );
}

function HashtagPostCard({
  item,
  liked,
  saved,
  reposted,
  viewerId,
  onEdit,
  onLike,
  onSave,
  onShare,
  onHide,
  onCopyLink,
  onReportIntent,
  onDeleteIntent,
  onBlockUser,
  onFollow,
  onToggleComments,
  onToggleHideLikeCount,
  onOpenVisibility,
}: {
  item: FeedItem;
  liked: boolean;
  saved: boolean;
  reposted: boolean;
  viewerId?: string;
  onEdit: (item: FeedItem) => void;
  onLike: (postId: string, liked: boolean) => void;
  onSave: (postId: string, saved: boolean) => void;
  onShare: (postId: string, label: string) => void;
  onHide: (postId: string) => void;
  onCopyLink: (postId: string) => void;
  onReportIntent: (postId: string, label: string) => void;
  onDeleteIntent: (postId: string, label: string) => void;
  onBlockUser: (userId?: string, label?: string) => void;
  onFollow: (authorId: string, nextFollow: boolean) => void;
  onToggleComments: (postId: string, allowComments: boolean) => void;
  onToggleHideLikeCount: (postId: string, hideLikeCount: boolean) => void;
  onOpenVisibility: (
    postId: string,
    current: "public" | "followers" | "private",
  ) => void;
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [mediaIndex, setMediaIndex] = useState(0);
  const [imageViewerUrl, setImageViewerUrl] = useState<string | null>(null);

  const captionNodes = useMemo(() => {
    const content = item.content || "";
    if (!content) return null;
    const parts: Array<string | JSX.Element> = [];
    const pushText = (text: string, keyBase: string) => {
      const chunks = text.split("\n");
      chunks.forEach((chunk, idx) => {
        if (idx > 0) {
          parts.push(<br key={`${keyBase}-br-${idx}`} />);
        }
        if (chunk) parts.push(chunk);
      });
    };

    const regex = /(@[a-zA-Z0-9_.]+|#[a-zA-Z0-9_]+)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content))) {
      const start = match.index;
      if (start > lastIndex) {
        pushText(content.slice(lastIndex, start), `text-${start}`);
      }
      const token = match[0];
      if (token.startsWith("@")) {
        const handle = token.slice(1);
        parts.push(
          <a
            key={`${handle}-${start}`}
            href={`/profiles/${handle}`}
            className={feedStyles.mentionLink}
          >
            {token}
          </a>,
        );
      } else {
        const tag = token.replace(/^#/, "");
        parts.push(
          <a
            key={`${tag}-${start}`}
            href={`/hashtag/${encodeURIComponent(tag)}`}
            className={feedStyles.hashtagLink}
          >
            {token}
          </a>,
        );
      }
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < content.length) {
      pushText(content.slice(lastIndex), `text-tail-${lastIndex}`);
    }
    return parts;
  }, [item.content]);

  const current = item.media?.[mediaIndex];
  const hasMultiple = (item.media?.length || 0) > 1;
  const quickOpenPost = () => router.push(`/post/${item.id}`);
  const stats = item.stats ?? {
    hearts: 0,
    comments: 0,
    saves: 0,
    reposts: 0,
    shares: 0,
    impressions: 0,
    views: 0,
  };
  const shareCount = stats.reposts ?? stats.shares ?? 0;
  const shouldHideLikeStat = Boolean(item.hideLikeCount);
  const authorOwnerId = item.authorId || item.author?.id;
  const isSelf = Boolean(
    viewerId && authorOwnerId && viewerId === authorOwnerId,
  );
  const isFollowing = Boolean(item.following);
  const authorLabel =
    item.authorDisplayName || item.author?.displayName || "this user";
  const commentsToggleLabel = item.allowComments
    ? "Turn off comments"
    : "Turn on comments";
  const hideLikeToggleLabel = item.hideLikeCount
    ? "Show like counts"
    : "Hide like counts";

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (!menuRef.current) return;
      if (menuRef.current.contains(event.target as Node)) return;
      setMenuOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  return (
    <article className={feedStyles.feedCard}>
      <div className={feedStyles.feedHeader}>
        <div className={feedStyles.author}>
          {item.authorAvatarUrl || item.author?.avatarUrl ? (
            <img
              src={item.authorAvatarUrl || item.author?.avatarUrl}
              alt=""
              className={feedStyles.avatarImg}
            />
          ) : (
            <span className={feedStyles.avatar}>
              {(item.authorDisplayName || item.authorUsername || "U")
                .slice(0, 2)
                .toUpperCase()}
            </span>
          )}
          <div className={feedStyles.authorMeta}>
            <a
              className={`${feedStyles.authorName} ${feedStyles.authorNameLink}`}
              href={`/profile/${item.authorId}`}
            >
              {item.authorDisplayName || item.author?.displayName || "User"}
            </a>
            <span className={feedStyles.authorSub}>
              {formatDistanceToNow(new Date(item.createdAt), {
                addSuffix: true,
              })}
            </span>
          </div>
        </div>
        <div className={feedStyles.headerActions}>
          <div className={feedStyles.menuWrapper} ref={menuRef}>
            <button
              className={`${feedStyles.actionBtn} ${feedStyles.actionBtnGhost}`}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((prev) => !prev)}
            >
              <IconDots size={20} />
            </button>
            {menuOpen ? (
              <div className={feedStyles.menuPopover} role="menu">
                {isSelf ? (
                  <div className={feedStyles.menuContent}>
                    <button
                      className={feedStyles.menuItem}
                      onClick={() => {
                        setMenuOpen(false);
                        onEdit(item);
                      }}
                    >
                      Edit post
                    </button>
                    <button
                      className={feedStyles.menuItem}
                      onClick={() => {
                        setMenuOpen(false);
                        onOpenVisibility(item.id, item.visibility || "public");
                      }}
                    >
                      Edit visibility
                    </button>
                    <button
                      className={feedStyles.menuItem}
                      onClick={() => setMenuOpen(false)}
                    >
                      Mute notifications
                    </button>
                    <button
                      className={feedStyles.menuItem}
                      onClick={() => {
                        setMenuOpen(false);
                        onToggleComments(item.id, !item.allowComments);
                      }}
                    >
                      {commentsToggleLabel}
                    </button>
                    <button
                      className={feedStyles.menuItem}
                      onClick={() => {
                        setMenuOpen(false);
                        onToggleHideLikeCount(item.id, !item.hideLikeCount);
                      }}
                    >
                      {hideLikeToggleLabel}
                    </button>
                    {item.repostOf ? (
                      <button
                        className={feedStyles.menuItem}
                        onClick={() => router.push(`/post/${item.id}`)}
                      >
                        Go to post
                      </button>
                    ) : null}
                    <button
                      className={feedStyles.menuItem}
                      onClick={() => {
                        setMenuOpen(false);
                        onCopyLink(item.id);
                      }}
                    >
                      Copy link
                    </button>
                    <button
                      className={`${feedStyles.menuItem} ${
                        feedStyles.menuItemDanger
                      }`}
                      onClick={() => {
                        setMenuOpen(false);
                        onDeleteIntent(item.id, authorLabel);
                      }}
                    >
                      Delete post
                    </button>
                  </div>
                ) : (
                  <div className={feedStyles.menuContent}>
                    {item.repostOf ? (
                      <button
                        className={feedStyles.menuItem}
                        onClick={() => router.push(`/post/${item.id}`)}
                      >
                        Go to post
                      </button>
                    ) : null}
                    <button
                      className={feedStyles.menuItem}
                      onClick={() => {
                        setMenuOpen(false);
                        onCopyLink(item.id);
                      }}
                    >
                      Copy link
                    </button>
                    {authorOwnerId ? (
                      <button
                        className={feedStyles.menuItem}
                        onClick={() => {
                          setMenuOpen(false);
                          onFollow(authorOwnerId, !isFollowing);
                        }}
                      >
                        {isFollowing ? "Unfollow" : "Follow"}
                      </button>
                    ) : null}
                    <button
                      className={feedStyles.menuItem}
                      onClick={() => {
                        setMenuOpen(false);
                        onSave(item.id, !saved);
                      }}
                    >
                      {saved ? "Unsave this post" : "Save this post"}
                    </button>
                    <button
                      className={feedStyles.menuItem}
                      onClick={() => {
                        setMenuOpen(false);
                        onHide(item.id);
                      }}
                    >
                      Hide this post
                    </button>
                    <button
                      className={feedStyles.menuItem}
                      onClick={() => {
                        setMenuOpen(false);
                        onReportIntent(item.id, authorLabel);
                      }}
                    >
                      Report
                    </button>
                    <button
                      className={`${feedStyles.menuItem} ${
                        feedStyles.menuItemDanger
                      }`}
                      onClick={() => {
                        setMenuOpen(false);
                        onBlockUser(authorOwnerId, authorLabel);
                      }}
                    >
                      Block this account
                    </button>
                  </div>
                )}
              </div>
            ) : null}
          </div>
          <button
            className={`${feedStyles.actionBtn} ${feedStyles.actionBtnGhost}`}
            aria-label="Hide post"
            onClick={() => onHide(item.id)}
          >
            <IconClose size={22} />
          </button>
        </div>
      </div>

      {item.content ? (
        <div className={`${feedStyles.content} ${feedStyles.contentRich}`}>
          {captionNodes}
        </div>
      ) : null}

      {(item.location || (item.hashtags?.length || 0) > 0) && (
        <div className={feedStyles.contentBlock}>
          {item.location ? (
            <div className={feedStyles.metaRow}>
              <a
                className={`${feedStyles.metaLabel} ${feedStyles.metaLink}`}
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                  item.location,
                )}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {item.location}
              </a>
            </div>
          ) : null}
          {item.hashtags?.length ? (
            <div className={feedStyles.tags}>
              {item.hashtags.map((tag) => (
                <a
                  key={tag}
                  href={`/hashtag/${encodeURIComponent(tag)}`}
                  className={`${feedStyles.tag} ${feedStyles.tagLink}`}
                >
                  #{tag}
                </a>
              ))}
            </div>
          ) : null}
        </div>
      )}

      {current ? (
        <div className={feedStyles.mediaCarousel}>
          {current.type === "video" ? (
            <video
              className={feedStyles.mediaVisual}
              src={current.url}
              muted
              playsInline
              controls
              controlsList="nodownload noremoteplayback"
              onContextMenu={(e) => e.preventDefault()}
              onClick={() => router.push(`/post/${item.id}`)}
            />
          ) : (
            <img
              className={feedStyles.mediaVisual}
              src={current.url}
              alt="post media"
              onContextMenu={(e) => e.preventDefault()}
              onClick={() => setImageViewerUrl(current.url)}
            />
          )}
          {hasMultiple ? (
            <>
              <button
                type="button"
                className={`${feedStyles.mediaNavBtn} ${feedStyles.mediaNavLeft}`}
                onClick={() =>
                  setMediaIndex((prev) =>
                    prev - 1 >= 0 ? prev - 1 : (item.media?.length || 1) - 1,
                  )
                }
              >
                ‹
              </button>
              <button
                type="button"
                className={`${feedStyles.mediaNavBtn} ${feedStyles.mediaNavRight}`}
                onClick={() =>
                  setMediaIndex((prev) =>
                    prev + 1 < (item.media?.length || 1) ? prev + 1 : 0,
                  )
                }
              >
                ›
              </button>
              <div className={feedStyles.mediaCounter}>
                {mediaIndex + 1}/{item.media?.length}
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {imageViewerUrl ? (
        <ImageViewerOverlay
          url={imageViewerUrl}
          alt="Post media"
          onClose={() => setImageViewerUrl(null)}
        />
      ) : null}

      <div className={feedStyles.statRow}>
        <div>
          {!shouldHideLikeStat ? (
            <div className={feedStyles.statItem}>
              <span className={feedStyles.statIcon}>
                <IconLike size={18} />
              </span>
              <span>{formatCount(stats.hearts)}</span>
            </div>
          ) : null}
          <div className={feedStyles.statItem}>
            <span className={feedStyles.statIcon}>
              <IconComment size={18} />
            </span>
            <span>{formatCount(stats.comments)}</span>
          </div>
        </div>
        <div>
          <div className={feedStyles.statItem}>
            <span className={feedStyles.statIcon}>
              <IconEye size={18} />
            </span>
            <span>{formatCount(stats.views ?? stats.impressions)}</span>
          </div>
          <div className={feedStyles.statItem}>
            <span className={feedStyles.statIcon}>
              <IconReup size={18} />
            </span>
            <span>{formatCount(shareCount)}</span>
          </div>
        </div>
      </div>

      <div className={feedStyles.actionRow}>
        <button
          className={`${feedStyles.actionBtn} ${
            liked ? feedStyles.actionBtnActive : ""
          }`}
          onClick={() => onLike(item.id, !liked)}
        >
          <IconLike size={20} filled={liked} />
          <span>{liked ? "Liked" : "Like"}</span>
        </button>
        <button className={feedStyles.actionBtn} onClick={quickOpenPost}>
          <IconComment size={20} />
          <span>Comment</span>
        </button>
        <button
          className={`${feedStyles.actionBtn} ${
            saved ? feedStyles.actionBtnActive : ""
          }`}
          onClick={() => onSave(item.id, !saved)}
        >
          <IconSave size={20} filled={saved} />
          <span>{saved ? "Saved" : "Save"}</span>
        </button>
        <button
          className={`${feedStyles.actionBtn} ${
            reposted ? feedStyles.actionBtnActive : ""
          }`}
          onClick={() =>
            onShare(
              item.id,
              item.authorUsername || item.author?.username || "this user",
            )
          }
        >
          <IconReup size={20} />
          <span>{reposted ? "Reposted" : "Repost"}</span>
        </button>
      </div>
    </article>
  );
}
