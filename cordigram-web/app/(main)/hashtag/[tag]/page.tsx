"use client";

import type React from "react";
import { JSX, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  blockUser,
  createPost,
  createReel,
  deletePost,
  fetchPostsByHashtag,
  fetchReelsByHashtag,
  followUser,
  hidePost,
  likePost,
  repostPost,
  reportPost,
  savePost,
  setPostAllowComments,
  setPostHideLikeCount,
  updatePostNotificationMute,
  unfollowUser,
  unlikePost,
  unsavePost,
  updatePostVisibility,
  type FeedItem,
} from "@/lib/api";
import { getStoredAccessToken } from "@/lib/auth";
import {
  addBlockedUserIdLocally,
  filterFeedItemsByBlockedAuthors,
  refreshBlockedUserIds,
} from "@/lib/blocked-users";
import { useRequireAuth } from "@/hooks/use-require-auth";
import styles from "./hashtag.module.css";
import feedStyles from "../../home-feed.module.css";
import PostEditOverlay from "@/ui/post-edit-overlay";
import ImageViewerOverlay from "@/ui/image-viewer-overlay/image-viewer-overlay";
import { DateSelect } from "@/ui/date-select/date-select";
import { TimeSelect } from "@/ui/time-select/time-select";
import RepostOverlay, {
  type QuoteInput,
  type RepostTarget,
} from "@/ui/repost-overlay/repost-overlay";
import {
  getInteractionMutedMessage,
  INTERACTION_MUTED_FALLBACK_MESSAGE,
} from "@/lib/interaction-mute";
import { formatRelativeTime } from "@/lib/relative-time";
import { useLanguage } from "@/component/language-provider";
import VerifiedBadge from "@/ui/verified-badge/verified-badge";
import { useTranslations } from "next-intl";

const REPORT_ANIMATION_MS = 200;
const QUOTE_CHAR_LIMIT = 500;

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
    />
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

const buildLocalDateTimeIso = (date: string, time: string) => {
  if (!date || !time) return null;
  const dt = new Date(`${date}T${time}:00`);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
};

export default function HashtagPage() {
  const canRender = useRequireAuth({ guestAllowed: true });
  const t = useTranslations("home");
  const tHashtag = useTranslations("hashtag");
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
  const [repostTarget, setRepostTarget] = useState<RepostTarget | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());
  const [interactionMuteOverlayMessage, setInteractionMuteOverlayMessage] =
    useState<string | null>(null);

  const updatePost = (
    postId: string,
    updater: (item: FeedItem) => FeedItem,
  ) => {
    setPosts((prev) =>
      prev.map((item) => (item.id === postId ? updater(item) : item)),
    );
  };

  const updatePostMute = (
    postId: string,
    patch: {
      notificationsMutedUntil?: string | null;
      notificationsMutedIndefinitely?: boolean;
    },
  ) => {
    updatePost(postId, (item) => ({
      ...item,
      notificationsMutedUntil:
        patch.notificationsMutedUntil ?? item.notificationsMutedUntil,
      notificationsMutedIndefinitely:
        patch.notificationsMutedIndefinitely ??
        item.notificationsMutedIndefinitely,
    }));
  };

  const showToast = (message: string) => {
    setToastMessage(message);
    window.setTimeout(() => setToastMessage(null), 2200);
  };

  const reportGroups = useMemo<ReportCategory[]>(
    () => [
      {
        key: "abuse",
        label: t("report.groups.abuse.label"),
        accent: "#f59e0b",
        reasons: [
          { key: "harassment", label: t("report.groups.abuse.reasons.harassment") },
          { key: "hate_speech", label: t("report.groups.abuse.reasons.hateSpeech") },
          { key: "offensive_discrimination", label: t("report.groups.abuse.reasons.offensiveDiscrimination") },
        ],
      },
      {
        key: "violence",
        label: t("report.groups.violence.label"),
        accent: "#ef4444",
        reasons: [
          { key: "violence_threats", label: t("report.groups.violence.reasons.violenceThreats") },
          { key: "graphic_violence", label: t("report.groups.violence.reasons.graphicViolence") },
          { key: "extremism", label: t("report.groups.violence.reasons.extremism") },
          { key: "self_harm", label: t("report.groups.violence.reasons.selfHarm") },
        ],
      },
      {
        key: "sensitive",
        label: t("report.groups.sensitive.label"),
        accent: "#a855f7",
        reasons: [
          { key: "nudity", label: t("report.groups.sensitive.reasons.nudity") },
          { key: "minor_nudity", label: t("report.groups.sensitive.reasons.minorNudity") },
          { key: "sexual_solicitation", label: t("report.groups.sensitive.reasons.sexualSolicitation") },
        ],
      },
      {
        key: "misinfo",
        label: t("report.groups.misinfo.label"),
        accent: "#22c55e",
        reasons: [
          { key: "fake_news", label: t("report.groups.misinfo.reasons.fakeNews") },
          { key: "impersonation", label: t("report.groups.misinfo.reasons.impersonation") },
        ],
      },
      {
        key: "spam",
        label: t("report.groups.spam.label"),
        accent: "#14b8a6",
        reasons: [
          { key: "spam", label: t("report.groups.spam.reasons.spam") },
          { key: "financial_scam", label: t("report.groups.spam.reasons.financialScam") },
          { key: "unsolicited_ads", label: t("report.groups.spam.reasons.unsolicitedAds") },
        ],
      },
      {
        key: "ip",
        label: t("report.groups.ip.label"),
        accent: "#3b82f6",
        reasons: [
          { key: "copyright", label: t("report.groups.ip.reasons.copyright") },
          { key: "trademark", label: t("report.groups.ip.reasons.trademark") },
          { key: "brand_impersonation", label: t("report.groups.ip.reasons.brandImpersonation") },
        ],
      },
      {
        key: "illegal",
        label: t("report.groups.illegal.label"),
        accent: "#f97316",
        reasons: [
          { key: "contraband", label: t("report.groups.illegal.reasons.contraband") },
          { key: "illegal_transaction", label: t("report.groups.illegal.reasons.illegalTransaction") },
        ],
      },
      {
        key: "privacy",
        label: t("report.groups.privacy.label"),
        accent: "#06b6d4",
        reasons: [
          { key: "doxxing", label: t("report.groups.privacy.reasons.doxxing") },
          { key: "nonconsensual_intimate", label: t("report.groups.privacy.reasons.nonconsensualIntimate") },
        ],
      },
      {
        key: "other",
        label: t("report.groups.other.label"),
        accent: "#94a3b8",
        reasons: [{ key: "other", label: t("report.groups.other.reasons.other") }],
      },
    ],
    [t],
  );

  const selectedReportGroup = useMemo(
    () => reportGroups.find((g) => g.key === reportCategory),
    [reportCategory, reportGroups],
  );

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

  const handleQuickRepost = async (target: RepostTarget) => {
    const token = getStoredAccessToken();
    if (!token) return;
    try {
      const originalId = resolveOriginalPostId(target.postId);
      const targetId = target.postId;
      await createPost({ token, payload: { repostOf: originalId } });
      incrementRepostStat(originalId);
      if (originalId !== targetId) {
        incrementRepostStat(targetId);
        try {
          await repostPost({ token, postId: targetId });
        } catch {}
      }
      showToast(t("toast.reposted"));
    } catch (err) {
      const mutedMessage = getInteractionMutedMessage(err);
      if (mutedMessage) {
        setInteractionMuteOverlayMessage(
          mutedMessage || INTERACTION_MUTED_FALLBACK_MESSAGE,
        );
        return;
      }
      throw err;
    }
  };

  const handleShareQuote = async (target: RepostTarget, input: QuoteInput) => {
    const token = getStoredAccessToken();
    if (!token) return;
    try {
      const originalId = resolveOriginalPostId(target.postId);
      const targetId = target.postId;

      const note = input.content.trim();
      const mentions = extractMentionsFromCaption(note);
      const payload = {
        repostOf: originalId,
        content: note || undefined,
        hashtags: input.hashtags.length ? input.hashtags : undefined,
        location: input.location.trim() || undefined,
        allowComments: input.allowComments,
        allowDownload: Boolean(target.originalAllowDownload),
        hideLikeCount: input.hideLikeCount,
        visibility: input.visibility,
        mentions: mentions.length ? mentions : undefined,
      };

      if (target.kind === "reel") {
        await createReel({ token, payload: payload as any });
      } else {
        await createPost({ token, payload });
      }

      incrementRepostStat(originalId);
      if (originalId !== targetId) {
        incrementRepostStat(targetId);
        try {
          await repostPost({ token, postId: targetId });
        } catch {}
      }

      showToast(t("toast.repostedWithQuote"));
    } catch (err) {
      const mutedMessage = getInteractionMutedMessage(err);
      if (mutedMessage) {
        setInteractionMuteOverlayMessage(
          mutedMessage || INTERACTION_MUTED_FALLBACK_MESSAGE,
        );
        return;
      }
      throw err;
    }
  };

  const onRepostIntent = (
    postId: string,
    label: string,
    kindOverride?: "post" | "reel",
  ) => {
    const token = getStoredAccessToken();
    if (!token) return;
    const kind = kindOverride ?? (tab === "reels" ? "reel" : "post");
    const source = posts.find((item) => item.id === postId);
    setRepostTarget({
      postId,
      label,
      kind,
      originalAllowDownload: Boolean(source?.allowDownload),
    });
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
      showToast(t("toast.reportSubmitted"));
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
      showToast(t("toast.deletedPost"));
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
      const nextBlocked = addBlockedUserIdLocally(blockTarget.userId);
      setBlockedIds(nextBlocked);
      setPosts((prev) =>
        prev.filter((item) => item.authorId !== blockTarget.userId),
      );
      setReels((prev) =>
        prev.filter((item) => item.authorId !== blockTarget.userId),
      );
      setBlockTarget(undefined);
    } catch (err) {
      showToast(t("toast.blockFailed"));
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
      showToast(allowComments ? t("toast.commentsOn") : t("toast.commentsOff"));
    } catch {
      updatePost(postId, (item) => ({
        ...item,
        allowComments: !allowComments,
      }));
      showToast(t("toast.commentsUpdateFailed"));
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
      showToast(hideLikeCount ? t("toast.likeCountHidden") : t("toast.likeCountVisible"));
    } catch {
      updatePost(postId, (item) => ({
        ...item,
        hideLikeCount: !hideLikeCount,
      }));
      showToast(t("toast.likeCountUpdateFailed"));
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
    try {
      if (liked) {
        await likePost({ token, postId: targetId });
      } else {
        await unlikePost({ token, postId: targetId });
      }
      updatePost(postId, (item) => ({
        ...item,
        liked,
        stats: {
          ...item.stats,
          hearts: Math.max(0, (item.stats?.hearts ?? 0) + (liked ? 1 : -1)),
        },
      }));
    } catch (err) {
      const mutedMessage = getInteractionMutedMessage(err);
      if (mutedMessage) {
        setInteractionMuteOverlayMessage(
          mutedMessage || INTERACTION_MUTED_FALLBACK_MESSAGE,
        );
        return;
      }
      updatePost(postId, (item) => ({
        ...item,
        liked: !liked,
        stats: {
          ...item.stats,
          hearts: Math.max(0, (item.stats?.hearts ?? 0) + (liked ? -1 : 1)),
        },
      }));
      setError(t("toast.actionFailed"));
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
      setError(t("toast.actionFailed"));
    }
  };

  const onHide = async (postId: string) => {
    const token = getStoredAccessToken();
    if (!token) return;
    setPosts((prev) => prev.filter((item) => item.id !== postId));
    try {
      await hidePost({ token, postId });
      showToast(t("toast.postHidden"));
    } catch {
      showToast(t("toast.postHideFailed"));
    }
  };

  const onCopyLink = async (postId: string) => {
    const url = `${window.location.origin}/post/${postId}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast(t("toast.linkCopied"));
    } catch {
      showToast(t("toast.linkCopyFailed"));
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
        const filtered = filterFeedItemsByBlockedAuthors(items || [], blockedIds);
        if (tab === "posts") setPosts(filtered);
        else setReels(filtered);
      })
      .catch((err: unknown) => {
        const message =
          typeof err === "object" && err && "message" in err
            ? String((err as { message?: string }).message)
            : "Unable to load posts";
        setError(message || "Unable to load posts");
      })
      .finally(() => setLoading(false));
  }, [blockedIds, canRender, tab, tag]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setViewerId(getUserIdFromToken(localStorage.getItem("accessToken")));
    setEditToken(getStoredAccessToken());
  }, [canRender]);

  useEffect(() => {
    if (!canRender) return;
    const token = getStoredAccessToken();
    if (!token) return;
    refreshBlockedUserIds(token)
      .then((ids) => setBlockedIds(ids))
      .catch(() => undefined);
  }, [canRender]);

  if (!canRender) return null;

  const activeCount = tab === "posts" ? posts.length : reels.length;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>{tHashtag("eyebrow")}</p>
          <h1 className={styles.title}>#{tag}</h1>
        </div>
        <div className={styles.meta}>
          {loading
            ? tHashtag("loading")
            : tab === "posts"
              ? tHashtag("countPosts", { count: activeCount })
              : tHashtag("countReels", { count: activeCount })}
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
            {tHashtag("tabs.posts")}
          </button>
          <button
            type="button"
            className={`${styles.tabBtn} ${
              tab === "reels" ? styles.tabBtnActive : ""
            }`}
            onClick={() => setTab("reels")}
          >
            {tHashtag("tabs.reels")}
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
            {tHashtag("empty.posts")}
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
                onUpdateMute={updatePostMute}
              />
            ))}
          </div>
        )
      ) : reels.length === 0 ? (
        <div className={styles.emptyState}>
          {tHashtag("empty.reels")}
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

      <RepostOverlay
        target={repostTarget}
        onRequestClose={() => setRepostTarget(null)}
        onQuickRepost={handleQuickRepost}
        onShareQuote={handleShareQuote}
        quoteCharLimit={QUOTE_CHAR_LIMIT}
        animationMs={REPORT_ANIMATION_MS}
      />

      {interactionMuteOverlayMessage ? (
        <div className={feedStyles.modalOverlay} role="dialog" aria-modal="true">
          <div className={feedStyles.modalCard}>
            <div className={feedStyles.modalHeader}>
              <div>
                <h3 className={feedStyles.modalTitle}>Interaction muted</h3>
                <p className={feedStyles.modalBody}>{interactionMuteOverlayMessage}</p>
              </div>
              <button
                className={feedStyles.closeBtn}
                aria-label="Close"
                onClick={() => setInteractionMuteOverlayMessage(null)}
              >
                ×
              </button>
            </div>
            <div className={feedStyles.modalActions}>
              <button
                type="button"
                className={feedStyles.modalPrimary}
                onClick={() => setInteractionMuteOverlayMessage(null)}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div
          className={feedStyles.modalOverlay}
          role="dialog"
          aria-modal="true"
        >
          <div className={feedStyles.modalCard}>
            <h3 className={feedStyles.modalTitle}>{t("delete.title")}</h3>
            <p className={feedStyles.modalBody}>
              {t("delete.body", { name: deleteTarget.label })}
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
                {t("delete.cancel")}
              </button>
              <button
                className={feedStyles.modalDanger}
                onClick={confirmDelete}
                disabled={deleteSubmitting}
              >
                {deleteSubmitting ? t("delete.deleting") : t("delete.confirm")}
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
            <h3 className={feedStyles.modalTitle}>{t("block.title")}</h3>
            <p className={feedStyles.modalBody}>
              {t("block.body", { name: blockTarget.label })}
            </p>
            <div className={feedStyles.modalActions}>
              <button
                className={feedStyles.modalSecondary}
                onClick={() => setBlockTarget(undefined)}
                disabled={blocking}
              >
                {t("block.cancel")}
              </button>
              <button
                className={feedStyles.modalDanger}
                onClick={confirmBlock}
                disabled={blocking}
              >
                {blocking ? t("block.blocking") : t("block.confirm")}
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
                <h3 className={feedStyles.modalTitle}>{t("report.title")}</h3>
                <p className={feedStyles.modalBody}>
                  {t("report.description", { name: reportTarget.label })}
                </p>
              </div>
              <button
                className={feedStyles.closeBtn}
                aria-label={t("report.title")}
                onClick={closeReportModal}
              >
                <IconClose size={24} />
              </button>
            </div>

            <div className={feedStyles.reportGrid}>
              <div className={feedStyles.categoryGrid}>
                {reportGroups.map((group) => {
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
                  {t("report.selectReason")}
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
                    {t("report.pickCategory")}
                  </div>
                )}

                <label className={feedStyles.noteLabel}>
                  {t("report.notes.label")}
                  <textarea
                    className={feedStyles.noteInput}
                    placeholder={t("report.notes.placeholder")}
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
                {t("report.cancel")}
              </button>
              <button
                className={feedStyles.modalPrimary}
                disabled={!reportReason || reportSubmitting}
                onClick={submitReport}
              >
                {reportSubmitting ? t("report.submitting") : t("report.submit")}
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
                <h3 className={feedStyles.modalTitle}>{t("visibility.title")}</h3>
                <p className={feedStyles.modalBody}>
                  {t("visibility.description")}
                </p>
              </div>
              <button
                className={feedStyles.closeBtn}
                aria-label={t("visibility.cancel")}
                onClick={() => setVisibilityModalOpen(false)}
              >
                <IconClose size={20} />
              </button>
            </div>
            <div className={feedStyles.visibilityList}>
              {[
                {
                  value: "public" as const,
                  title: t("visibility.options.public.title"),
                  description: t("visibility.options.public.description"),
                },
                {
                  value: "followers" as const,
                  title: t("visibility.options.followers.title"),
                  description: t("visibility.options.followers.description"),
                },
                {
                  value: "private" as const,
                  title: t("visibility.options.private.title"),
                  description: t("visibility.options.private.description"),
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
                {t("visibility.cancel")}
              </button>
              <button
                className={feedStyles.modalPrimary}
                onClick={submitVisibility}
              >
                {t("visibility.update")}
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
  onUpdateMute,
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
  onUpdateMute: (
    postId: string,
    patch: {
      notificationsMutedUntil?: string | null;
      notificationsMutedIndefinitely?: boolean;
    },
  ) => void;
}) {
  const router = useRouter();
  const t = useTranslations("home");
  const { language } = useLanguage();
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

    const regex = /(https?:\/\/[^\s<>()\[\]{}"']+|@[a-zA-Z0-9_.]+|#[a-zA-Z0-9_]+)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content))) {
      const start = match.index;
      if (start > lastIndex) {
        pushText(content.slice(lastIndex, start), `text-${start}`);
      }
      const token = match[0];
      if (token.startsWith("http://") || token.startsWith("https://")) {
        const url = token.replace(/[),.;!?]+$/g, "");
        const trailing = token.slice(url.length);

        parts.push(
          <a
            key={`url-${start}`}
            href={url}
            target="_blank"
            rel="noreferrer noopener"
            className={feedStyles.mentionLink}
          >
            {url}
          </a>,
        );

        if (trailing) {
          pushText(trailing, `text-${start}-url-tail`);
        }
      } else if (token.startsWith("@")) {
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
    item.authorDisplayName || item.author?.displayName || t("block.thisUser");
  const commentsToggleLabel = item.allowComments
    ? t("menu.turnOffComments")
    : t("menu.turnOnComments");
  const hideLikeToggleLabel = item.hideLikeCount
    ? t("menu.showLike")
    : t("menu.hideLike");
  const [muteModalOpen, setMuteModalOpen] = useState(false);
  const [muteOption, setMuteOption] = useState("5m");
  const [muteCustomDate, setMuteCustomDate] = useState("");
  const [muteCustomTime, setMuteCustomTime] = useState("");
  const [muteSaving, setMuteSaving] = useState(false);
  const [muteError, setMuteError] = useState("");

  const muteOptions = useMemo(
    () => [
      { key: "5m", label: t("mute.options.5m"), ms: 5 * 60 * 1000 },
      { key: "10m", label: t("mute.options.10m"), ms: 10 * 60 * 1000 },
      { key: "15m", label: t("mute.options.15m"), ms: 15 * 60 * 1000 },
      { key: "30m", label: t("mute.options.30m"), ms: 30 * 60 * 1000 },
      { key: "1h", label: t("mute.options.1h"), ms: 60 * 60 * 1000 },
      { key: "1d", label: t("mute.options.1d"), ms: 24 * 60 * 60 * 1000 },
      { key: "until", label: t("mute.options.until"), ms: null },
      { key: "custom", label: t("mute.options.custom"), ms: null },
    ],
    [t],
  );

  const isMutedForPost = useMemo(() => {
    if (!isSelf) return false;
    if (item.notificationsMutedIndefinitely) return true;
    if (item.notificationsMutedUntil) {
      const dt = new Date(item.notificationsMutedUntil);
      if (!Number.isNaN(dt.getTime()) && dt.getTime() > Date.now()) {
        return true;
      }
    }
    return false;
  }, [
    isSelf,
    item.notificationsMutedIndefinitely,
    item.notificationsMutedUntil,
  ]);

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

  const openMuteModal = () => {
    setMuteError("");
    setMuteOption("5m");
    setMuteCustomDate("");
    setMuteCustomTime("");
    setMuteModalOpen(true);
  };

  const closeMuteModal = () => {
    if (muteSaving) return;
    setMuteModalOpen(false);
  };

  const handleEnablePostNotifications = async () => {
    const token = getStoredAccessToken();
    if (!token) return;
    setMuteSaving(true);
    setMuteError("");
    try {
      const res = await updatePostNotificationMute({
        token,
        postId: item.id,
        enabled: true,
      });
      onUpdateMute(item.id, {
        notificationsMutedUntil: res.mutedUntil ?? null,
        notificationsMutedIndefinitely: res.mutedIndefinitely ?? false,
      });
      setMuteModalOpen(false);
    } catch (err: any) {
      setMuteError(err?.message || "Failed to update notifications");
    } finally {
      setMuteSaving(false);
    }
  };

  const handleSavePostMute = async () => {
    const token = getStoredAccessToken();
    if (!token) return;
    setMuteSaving(true);
    setMuteError("");

    try {
      let mutedUntil: string | null = null;
      let mutedIndefinitely = false;
      const selected = muteOptions.find((opt) => opt.key === muteOption);

      if (muteOption === "until") {
        mutedIndefinitely = true;
      } else if (muteOption === "custom") {
        const iso = buildLocalDateTimeIso(muteCustomDate, muteCustomTime);
        if (!iso) {
          setMuteError("Please select a valid date and time.");
          setMuteSaving(false);
          return;
        }
        const dt = new Date(iso);
        if (dt.getTime() <= Date.now()) {
          setMuteError("Please choose a future time.");
          setMuteSaving(false);
          return;
        }
        mutedUntil = iso;
      } else if (selected?.ms) {
        mutedUntil = new Date(Date.now() + selected.ms).toISOString();
      } else {
        mutedIndefinitely = true;
      }

      const res = await updatePostNotificationMute({
        token,
        postId: item.id,
        mutedUntil,
        mutedIndefinitely,
      });

      onUpdateMute(item.id, {
        notificationsMutedUntil: res.mutedUntil ?? null,
        notificationsMutedIndefinitely: res.mutedIndefinitely ?? false,
      });
      setMuteModalOpen(false);
    } catch (err: any) {
      setMuteError(err?.message || "Failed to update notifications");
    } finally {
      setMuteSaving(false);
    }
  };

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
              <span className={feedStyles.nameWithBadge}>
                {item.authorDisplayName || item.author?.displayName || "User"}
                {Boolean(
                  (item as any).authorIsCreatorVerified ??
                    item.author?.isCreatorVerified,
                ) ? (
                  <VerifiedBadge />
                ) : null}
              </span>
            </a>
            <span className={feedStyles.authorSub}>
              {formatRelativeTime(item.createdAt, language, {
                addSuffix: true,
              })}
            </span>
          </div>
        </div>
        <div className={feedStyles.headerActions}>
          {isMutedForPost ? (
            <span
              className={feedStyles.muteBadge}
              title="Notifications muted"
              aria-label="Notifications muted"
            >
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
                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                <line x1="3" y1="3" x2="21" y2="21" />
              </svg>
            </span>
          ) : null}
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
                      {t("menu.editPost")}
                    </button>
                    <button
                      className={feedStyles.menuItem}
                      onClick={() => {
                        setMenuOpen(false);
                        onOpenVisibility(item.id, item.visibility || "public");
                      }}
                    >
                      {t("menu.editVisibility")}
                    </button>
                    <button
                      className={feedStyles.menuItem}
                      onClick={() => {
                        setMenuOpen(false);
                        if (isMutedForPost) {
                          handleEnablePostNotifications();
                        } else {
                          openMuteModal();
                        }
                      }}
                    >
                      {isMutedForPost
                        ? t("menu.turnOnNotifications")
                        : t("menu.muteNotifications")}
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
                        {t("menu.goToPost")}
                      </button>
                    ) : null}
                    <button
                      className={feedStyles.menuItem}
                      onClick={() => {
                        setMenuOpen(false);
                        onCopyLink(item.id);
                      }}
                    >
                      {t("menu.copyLink")}
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
                      {t("menu.deletePost")}
                    </button>
                  </div>
                ) : (
                  <div className={feedStyles.menuContent}>
                    {item.repostOf ? (
                      <button
                        className={feedStyles.menuItem}
                        onClick={() => router.push(`/post/${item.id}`)}
                      >
                        {t("menu.goToPost")}
                      </button>
                    ) : null}
                    <button
                      className={feedStyles.menuItem}
                      onClick={() => {
                        setMenuOpen(false);
                        onCopyLink(item.id);
                      }}
                    >
                      {t("menu.copyLink")}
                    </button>
                    {authorOwnerId ? (
                      <button
                        className={feedStyles.menuItem}
                        onClick={() => {
                          setMenuOpen(false);
                          onFollow(authorOwnerId, !isFollowing);
                        }}
                      >
                        {isFollowing ? t("menu.unfollow") : t("menu.follow")}
                      </button>
                    ) : null}
                    <button
                      className={feedStyles.menuItem}
                      onClick={() => {
                        setMenuOpen(false);
                        onSave(item.id, !saved);
                      }}
                    >
                      {saved ? t("menu.unsave") : t("menu.save")}
                    </button>
                    <button
                      className={feedStyles.menuItem}
                      onClick={() => {
                        setMenuOpen(false);
                        onHide(item.id);
                      }}
                    >
                      {t("menu.hidePost")}
                    </button>
                    <button
                      className={feedStyles.menuItem}
                      onClick={() => {
                        setMenuOpen(false);
                        onReportIntent(item.id, authorLabel);
                      }}
                    >
                      {t("menu.report")}
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
                      {t("menu.blockAccount")}
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
          <span>{liked ? t("actions.liked") : t("actions.like")}</span>
        </button>
        <button className={feedStyles.actionBtn} onClick={quickOpenPost}>
          <IconComment size={20} />
          <span>{t("actions.comment")}</span>
        </button>
        <button
          className={`${feedStyles.actionBtn} ${
            saved ? feedStyles.actionBtnActive : ""
          }`}
          onClick={() => onSave(item.id, !saved)}
        >
          <IconSave size={20} filled={saved} />
          <span>{saved ? t("actions.saved") : t("actions.save")}</span>
        </button>
        <button
          className={`${feedStyles.actionBtn} ${
            reposted ? feedStyles.actionBtnActive : ""
          }`}
          onClick={() =>
            onShare(
              item.id,
              item.authorUsername || item.author?.username || t("block.thisUser"),
            )
          }
        >
          <IconReup size={20} />
          <span>{reposted ? t("actions.reposted") : t("actions.repost")}</span>
        </button>
      </div>

      {muteModalOpen ? (
        <div
          className={`${feedStyles.modalOverlay} ${feedStyles.modalOverlayOpen}`}
          role="dialog"
          aria-modal="true"
          onClick={closeMuteModal}
        >
          <div
            className={`${feedStyles.modalCard} ${feedStyles.modalCardOpen}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={feedStyles.modalHeader}>
              <div>
                <h3 className={feedStyles.modalTitle}>{t("mute.title")}</h3>
                <p className={feedStyles.modalBody}>
                  {t("mute.body")}
                </p>
              </div>
              <button
                className={feedStyles.closeBtn}
                aria-label={t("mute.title")}
                onClick={closeMuteModal}
              >
                <IconClose size={18} />
              </button>
            </div>

            <div className={feedStyles.muteOptionGrid}>
              {muteOptions.map((option) => (
                <button
                  key={option.key}
                  className={`${feedStyles.muteOption} ${
                    muteOption === option.key ? feedStyles.muteOptionActive : ""
                  }`}
                  onClick={() => setMuteOption(option.key)}
                  type="button"
                >
                  <span className={feedStyles.muteOptionTitle}>
                    {option.label}
                  </span>
                </button>
              ))}
            </div>

            {muteOption === "custom" ? (
              <div className={feedStyles.muteCustomRow}>
                <div className={feedStyles.mutePicker}>
                  <label className={feedStyles.editLabel}>Date</label>
                  <DateSelect
                    value={muteCustomDate}
                    onChange={setMuteCustomDate}
                    minDate={new Date()}
                    maxDate={null}
                    placeholder="yyyy-mm-dd"
                  />
                </div>
                <div className={feedStyles.mutePicker}>
                  <label className={feedStyles.editLabel}>Time</label>
                  <TimeSelect
                    value={muteCustomTime}
                    onChange={setMuteCustomTime}
                    selectedDate={muteCustomDate}
                    minDateTime={new Date()}
                    disabled={!muteCustomDate}
                    placeholder="hh:mm"
                  />
                </div>
              </div>
            ) : null}

            {muteError ? (
              <div className={feedStyles.inlineError}>{muteError}</div>
            ) : null}

            <div className={feedStyles.modalActions}>
              <button
                type="button"
                className={feedStyles.modalPrimary}
                onClick={handleSavePostMute}
                disabled={muteSaving}
              >
                {muteSaving ? t("mute.saving") : t("mute.save")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </article>
  );
}
