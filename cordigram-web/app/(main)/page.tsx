"use client";

import { JSX, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import EmojiPicker from "emoji-picker-react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import styles from "./home-feed.module.css";
import {
  fetchFeed,
  hidePost,
  likePost,
  unlikePost,
  savePost,
  unsavePost,
  repostPost,
  createPost,
  createReel,
  setPostAllowComments,
  setPostHideLikeCount,
  deletePost,
  fetchPostDetail,
  reportPost,
  viewPost,
  blockUser,
  followUser,
  unfollowUser,
  updatePostVisibility,
  updatePost,
  searchProfiles,
  type ProfileSearchItem,
  type FeedItem,
} from "@/lib/api";
import { formatDistanceToNow } from "date-fns";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { useScrollRestoration } from "@/hooks/use-scroll-restoration";
type LocalFlags = {
  liked?: boolean;
  saved?: boolean;
  following?: boolean;
};
type PostViewState = {
  item: FeedItem;
  flags: LocalFlags;
};

const onlyPostItems = (items: FeedItem[]): FeedItem[] =>
  items.filter((item) => item.kind === "post");

const onlyPostViews = (items: PostViewState[]): PostViewState[] =>
  items.filter((item) => item.item?.kind === "post");

type FeedRemotePatch = Partial<FeedItem> & {
  liked?: boolean;
  saved?: boolean;
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
const VIEW_COOLDOWN_MS = 300000;
const REPORT_ANIMATION_MS = 200;
const FEED_POLL_MS = 7000;
const FEED_CACHE_KEY = "feedCache:v1";
const FEED_CACHE_INTENT_KEY = "feedCache:intent";

const normalizeHashtag = (value: string) =>
  value
    .replace(/^#/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "")
    .replace(/[^a-zA-Z0-9_]/g, "")
    .toLowerCase();

const cleanLocationLabel = (label: string) =>
  label
    .replace(/\b\d{4,6}\b/g, "")
    .replace(/,\s*,+/g, ", ")
    .replace(/\s{2,}/g, " ")
    .replace(/\s*,\s*$/g, "")
    .replace(/^\s*,\s*/g, "")
    .trim();

const extractMentionsFromCaption = (value: string) => {
  const handles = new Set<string>();
  const regex = /@([a-zA-Z0-9_.]{1,30})/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(value))) {
    handles.add(match[1].toLowerCase());
  }
  return Array.from(handles);
};

const findActiveMention = (value: string, caret: number) => {
  const beforeCaret = value.slice(0, caret);
  const match = /(^|[\s([{.,!?])@([a-zA-Z0-9_.]{0,30})$/i.exec(beforeCaret);
  if (!match) return null;
  const handle = match[2];
  const start = caret - handle.length - 1;
  return { handle, start, end: caret };
};

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

export default function HomePage() {
  const canRender = useRequireAuth();
  const pathname = usePathname();
  const [items, setItems] = useState<PostViewState[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [error, setError] = useState<string>("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [blockTarget, setBlockTarget] = useState<{
    userId: string;
    label: string;
  }>();
  const [blocking, setBlocking] = useState(false);
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
  const [repostTarget, setRepostTarget] = useState<{
    postId: string;
    label: string;
    kind: "post" | "reel";
  } | null>(null);
  const [repostMode, setRepostMode] = useState<"quote" | "repost" | null>(null);
  const [repostNote, setRepostNote] = useState("");
  const [repostSubmitting, setRepostSubmitting] = useState(false);
  const [repostError, setRepostError] = useState("");
  const [repostClosing, setRepostClosing] = useState(false);
  const reportHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repostHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [viewerId, setViewerId] = useState<string | undefined>(() =>
    typeof window === "undefined"
      ? undefined
      : getUserIdFromToken(localStorage.getItem("accessToken"))
  );
  const viewTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map()
  );
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const getScrollTarget = useCallback(() => {
    if (typeof document === "undefined") return null;
    const el = document.querySelector<HTMLElement>("[data-scroll-root]");
    if (el) return el;
    return (document.scrollingElement as HTMLElement | null) ?? null;
  }, []);

  const token = useMemo(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("accessToken");
  }, []);

  useScrollRestoration(
    "feed-scroll",
    initialized && !loading,
    getScrollTarget,
    pathname === "/"
  );

  const selectedReportGroup = useMemo(
    () => REPORT_GROUPS.find((g) => g.key === reportCategory),
    [reportCategory]
  );

  const persistFeedCache = useCallback(
    (payload?: {
      items?: PostViewState[];
      page?: number;
      hasMore?: boolean;
    }) => {
      if (typeof window === "undefined") return;
      const data = payload ?? {
        items,
        page,
        hasMore,
      };
      try {
        sessionStorage.setItem(
          FEED_CACHE_KEY,
          JSON.stringify({
            items: data.items,
            page: data.page,
            hasMore: data.hasMore,
            viewerId,
            ts: Date.now(),
          })
        );
      } catch {}
    },
    [hasMore, items, page, viewerId]
  );

  const tryHydrateFromCache = useCallback(() => {
    if (typeof window === "undefined") return false;
    const raw = sessionStorage.getItem(FEED_CACHE_KEY);
    if (!raw) return false;
    try {
      const cached = JSON.parse(raw) as {
        items?: PostViewState[];
        page?: number;
        hasMore?: boolean;
        viewerId?: string;
      };
      if (cached.viewerId && viewerId && cached.viewerId !== viewerId) {
        return false;
      }
      if (!Array.isArray(cached.items) || !cached.items.length) return false;
      const filteredItems = onlyPostViews(cached.items || []);
      if (!filteredItems.length) return false;
      setItems(filteredItems);
      setPage(cached.page ?? 1);
      setHasMore(cached.hasMore ?? true);
      setInitialized(true);
      setLoading(false);
      sessionStorage.removeItem(FEED_CACHE_INTENT_KEY);
      return true;
    } catch {
      return false;
    }
  }, [viewerId]);

  const showToast = useCallback((message: string, duration = 1600) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMessage(message);
    toastTimerRef.current = setTimeout(() => setToastMessage(null), duration);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setViewerId(getUserIdFromToken(localStorage.getItem("accessToken")));
  }, [token]);

  useEffect(() => {
    return () => {
      if (reportHideTimerRef.current) clearTimeout(reportHideTimerRef.current);
      if (repostHideTimerRef.current) clearTimeout(repostHideTimerRef.current);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!initialized) return;
    persistFeedCache();
  }, [initialized, items, page, hasMore, persistFeedCache]);

  const syncStats = useCallback(async () => {
    if (!token) return;
    try {
      const limit = page * PAGE_SIZE;
      const data = await fetchFeed({ token, limit });
      const posts = onlyPostItems(data);
      const map = new Map(posts.map((item) => [item.id, item]));
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
      setError("Sign in to view the feed");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const limit = nextPage * PAGE_SIZE;
      const data = await fetchFeed({ token, limit });
      const posts = onlyPostItems(data);
      setHasMore(data.length >= limit);
      const mapped = posts.map((item) => ({
        item,
        flags: {
          liked: item.liked,
          saved: item.saved,
          following:
            (item as unknown as { following?: boolean }).following ?? false,
        },
      }));
      setItems(mapped);
      persistFeedCache({
        items: mapped,
        page: nextPage,
        hasMore: data.length >= limit,
      });
      setPage(nextPage);
    } catch (err) {
      const msg =
        typeof err === "object" && err && "message" in err
          ? (err as { message?: string }).message || "Unable to load feed"
          : "Unable to load feed";
      setError(msg);
    } finally {
      setInitialized(true);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!canRender) return;
    const shouldHydrate = sessionStorage.getItem(FEED_CACHE_INTENT_KEY);
    if (shouldHydrate && tryHydrateFromCache()) return;
    if (tryHydrateFromCache()) return;
    load(1);
  }, [canRender, tryHydrateFromCache]);

  const onLike = async (postId: string, liked: boolean) => {
    if (!token) return;
    const targetItem = items.find((p) => p.item.id === postId)?.item;
    const targetId = targetItem?.repostOf || postId;
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
        await likePost({ token, postId: targetId });
      } else {
        await unlikePost({ token, postId: targetId });
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

  const onRepostIntent = (
    postId: string,
    label: string,
    kind: "post" | "reel"
  ) => {
    if (!token) {
      showToast("Sign in to repost");
      return;
    }
    if (repostHideTimerRef.current) clearTimeout(repostHideTimerRef.current);
    setRepostClosing(false);
    setRepostTarget({ postId, label, kind });
    setRepostMode(null);
    setRepostNote("");
    setRepostError("");
    setRepostSubmitting(false);
  };

  const closeRepostModal = () => {
    if (repostHideTimerRef.current) clearTimeout(repostHideTimerRef.current);
    setRepostClosing(true);
    repostHideTimerRef.current = setTimeout(() => {
      setRepostTarget(null);
      setRepostMode(null);
      setRepostNote("");
      setRepostError("");
      setRepostSubmitting(false);
      setRepostClosing(false);
    }, REPORT_ANIMATION_MS);
  };

  const submitRepost = async () => {
    if (!token || !repostTarget || !repostMode) {
      setRepostError("Choose an option to continue");
      return;
    }
    setRepostSubmitting(true);
    setRepostError("");
    try {
      if (repostMode === "repost") {
        await repostPost({ token, postId: repostTarget.postId });
        setItems((prev) =>
          prev.map((p) =>
            p.item.id === repostTarget.postId
              ? {
                  ...p,
                  item: {
                    ...p.item,
                    stats: {
                      ...p.item.stats,
                      shares: (p.item.stats.shares ?? 0) + 1,
                    },
                  },
                  flags: { ...p.flags, reposted: true },
                }
              : p
          )
        );
        showToast("Reposted");
        closeRepostModal();
        return;
      }

      const note = repostNote.trim();
      const payload = {
        repostOf: repostTarget.postId,
        content: note || undefined,
      };
      const created =
        repostTarget.kind === "reel"
          ? await createReel({ token, payload: payload as any })
          : await createPost({ token, payload });
      setItems((prev) => [{ item: created, flags: {} }, ...prev]);
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

  const onHide = async (postId: string) => {
    if (!token) return;
    setItems((prev) => prev.filter((p) => p.item.id !== postId));
    try {
      await hidePost({ token, postId });
    } catch {}
  };

  const onToggleComments = async (postId: string, allowComments: boolean) => {
    if (!token) return;
    setItems((prev) =>
      prev.map((p) =>
        p.item.id === postId ? { ...p, item: { ...p.item, allowComments } } : p
      )
    );
    try {
      await setPostAllowComments({ token, postId, allowComments });
      showToast(allowComments ? "Comments turned on" : "Comments turned off");
    } catch {
      setItems((prev) =>
        prev.map((p) =>
          p.item.id === postId
            ? { ...p, item: { ...p.item, allowComments: !allowComments } }
            : p
        )
      );
      showToast("Failed to update comments");
    }
  };

  const onToggleHideLikeCount = async (
    postId: string,
    hideLikeCount: boolean
  ) => {
    if (!token) return;
    setItems((prev) =>
      prev.map((p) =>
        p.item.id === postId ? { ...p, item: { ...p.item, hideLikeCount } } : p
      )
    );
    try {
      await setPostHideLikeCount({ token, postId, hideLikeCount });
      showToast(hideLikeCount ? "Like count hidden" : "Like count visible");
    } catch {
      setItems((prev) =>
        prev.map((p) =>
          p.item.id === postId
            ? { ...p, item: { ...p.item, hideLikeCount: !hideLikeCount } }
            : p
        )
      );
      showToast("Failed to update like count visibility");
    }
  };

  const onRemoteUpdate = useCallback(
    (postId: string, patch: FeedRemotePatch) => {
      setItems((prev) =>
        prev.map((p) =>
          p.item.id === postId
            ? {
                ...p,
                item: {
                  ...p.item,
                  content: patch.content ?? p.item.content,
                  hashtags: patch.hashtags ?? p.item.hashtags,
                  mentions: patch.mentions ?? p.item.mentions,
                  topics: patch.topics ?? p.item.topics,
                  location: patch.location ?? p.item.location,
                  allowDownload: patch.allowDownload ?? p.item.allowDownload,
                  visibility: patch.visibility ?? p.item.visibility,
                  allowComments: patch.allowComments ?? p.item.allowComments,
                  hideLikeCount: patch.hideLikeCount ?? p.item.hideLikeCount,
                  stats: patch.stats ?? p.item.stats,
                },
                flags: {
                  ...p.flags,
                  liked: patch.liked ?? p.flags.liked,
                  saved: patch.saved ?? p.flags.saved,
                },
              }
            : p
        )
      );
    },
    []
  );

  const onCopyLink = useCallback(
    async (postId: string) => {
      if (typeof window === "undefined") return;
      const origin = window.location.origin;
      const permalink = `${origin}/post/${postId}`;
      try {
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
        showToast("Link copied to clipboard");
      } catch {
        showToast("Failed to copy link");
      }
    },
    [showToast]
  );

  const onDeleteIntent = (postId: string, label: string) => {
    if (!token) {
      showToast("Please sign in to delete posts");
      return;
    }
    setDeleteTarget({ postId, label });
    setDeleteError("");
  };

  const closeDeleteModal = () => {
    if (deleteSubmitting) return;
    setDeleteTarget(null);
    setDeleteError("");
  };

  const confirmDelete = async () => {
    if (!token || !deleteTarget) {
      setDeleteError("Please sign in to delete posts");
      return;
    }
    setDeleteSubmitting(true);
    setDeleteError("");
    try {
      await deletePost({ token, postId: deleteTarget.postId });
      setItems((prev) => {
        const next = prev.filter((p) => p.item.id !== deleteTarget.postId);
        persistFeedCache({ items: next, page, hasMore });
        return next;
      });
      setDeleteTarget(null);
      showToast("Deleted post");
    } catch (err) {
      const message =
        typeof err === "object" && err && "message" in err
          ? (err as { message?: string }).message || "Failed to delete post"
          : "Failed to delete post";
      setDeleteError(message);
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const onReportIntent = (postId: string, label: string) => {
    if (!token) return;
    if (reportHideTimerRef.current) clearTimeout(reportHideTimerRef.current);
    setReportClosing(false);
    setReportTarget({ postId, label });
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
      setReportTarget(undefined);
      setReportCategory(null);
      setReportReason(null);
      setReportNote("");
      setReportError("");
      setReportSubmitting(false);
      setReportClosing(false);
    }, REPORT_ANIMATION_MS);
  };

  const submitReport = async () => {
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
    const targetItem = items.find((p) => p.item.id === postId)?.item;
    const targetId = targetItem?.repostOf || postId;
    const existing = viewTimers.current.get(postId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      viewPost({ token, postId: targetId, durationMs }).catch(() => undefined);
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

  if (!canRender) return null;

  return (
    <div className={styles.page}>
      <div className={styles.centerColumn}>
        {error && <div className={styles.errorBox}>{error}</div>}

        {!items.length && !loading && (
          <div className={styles.empty}>No posts yet.</div>
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
            onShare={(id) =>
              onRepostIntent(
                id,
                item.authorUsername || item.author?.username || "this user",
                item.kind
              )
            }
            onHide={onHide}
            onToggleComments={onToggleComments}
            onToggleHideLikeCount={onToggleHideLikeCount}
            onCopyLink={onCopyLink}
            onReportIntent={onReportIntent}
            onDeleteIntent={onDeleteIntent}
            onView={onView}
            onBlockUser={onBlockIntent}
            viewerId={viewerId}
            onFollow={onFollow}
            token={token}
            onRemoteUpdate={onRemoteUpdate}
            onPersistFeedCache={persistFeedCache}
          />
        ))}

        {loading && <SkeletonList count={3} />}
        <div ref={loadMoreRef} style={{ height: 1 }} aria-hidden />
        {hasMore && !loading && (
          <button className={styles.loadMore} onClick={handleLoadMore}>
            Load more
          </button>
        )}
      </div>

      {deleteTarget ? (
        <div
          className={`${styles.modalOverlay} ${styles.modalOverlayOpen}`}
          role="dialog"
          aria-modal="true"
          onClick={closeDeleteModal}
        >
          <div
            className={styles.modalCard}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className={styles.modalTitle}>Delete this post?</h3>
            <p className={styles.modalBody}>
              {`${deleteTarget.label}'s post will be removed for everyone. This action cannot be undone.`}
            </p>
            {deleteError ? (
              <div className={styles.inlineError}>{deleteError}</div>
            ) : null}
            <div className={styles.modalActions}>
              <button
                className={styles.modalSecondary}
                onClick={closeDeleteModal}
                disabled={deleteSubmitting}
              >
                Cancel
              </button>
              <button
                className={styles.modalDanger}
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

      {reportTarget ? (
        <div
          className={`${styles.modalOverlay} ${
            reportClosing ? styles.modalOverlayClosing : styles.modalOverlayOpen
          }`}
          role="dialog"
          aria-modal="true"
        >
          <div
            className={`${styles.modalCard} ${styles.reportCard} ${
              reportClosing ? styles.modalCardClosing : styles.modalCardOpen
            }`}
          >
            <div className={styles.modalHeader}>
              <div>
                <h3 className={styles.modalTitle}>Report this post</h3>
                <p className={styles.modalBody}>
                  {`Reporting @${reportTarget.label} post. Please pick the most accurate reason.`}
                </p>
              </div>
              <button
                className={styles.closeBtn}
                aria-label="Close"
                onClick={closeReportModal}
              >
                <IconClose size={24} />
              </button>
            </div>

            <div className={styles.reportGrid}>
              <div className={styles.categoryGrid}>
                {REPORT_GROUPS.map((group) => {
                  const isActive = reportCategory === group.key;
                  return (
                    <button
                      key={group.key}
                      className={`${styles.categoryCard} ${
                        isActive ? styles.categoryCardActive : ""
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
                        className={styles.categoryDot}
                        style={{ background: group.accent }}
                      />
                      <span className={styles.categoryLabel}>
                        {group.label}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className={styles.reasonPanel}>
                <div className={styles.reasonHeader}>
                  Select a specific reason
                </div>
                {selectedReportGroup ? (
                  <div className={styles.reasonList}>
                    {selectedReportGroup.reasons.map((r) => {
                      const checked = reportReason === r.key;
                      return (
                        <button
                          key={r.key}
                          className={`${styles.reasonRow} ${
                            checked ? styles.reasonRowActive : ""
                          }`}
                          onClick={() => setReportReason(r.key)}
                        >
                          <span
                            className={styles.reasonRadio}
                            aria-checked={checked}
                          >
                            {checked ? (
                              <span className={styles.reasonRadioDot} />
                            ) : null}
                          </span>
                          <span>{r.label}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className={styles.reasonPlaceholder}>
                    Pick a category first.
                  </div>
                )}

                <label className={styles.noteLabel}>
                  Additional notes (optional)
                  <textarea
                    className={styles.noteInput}
                    placeholder="Add brief context if needed..."
                    value={reportNote}
                    onChange={(e) => setReportNote(e.target.value)}
                    maxLength={500}
                  />
                </label>
                {reportError ? (
                  <div className={styles.inlineError}>{reportError}</div>
                ) : null}
              </div>
            </div>

            <div className={styles.modalActions}>
              <button
                className={styles.modalSecondary}
                onClick={closeReportModal}
                disabled={reportSubmitting}
              >
                Cancel
              </button>
              <button
                className={styles.modalPrimary}
                disabled={!reportReason || reportSubmitting}
                onClick={submitReport}
              >
                {reportSubmitting ? "Submitting..." : "Submit report"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {repostTarget ? (
        <div
          className={`${styles.modalOverlay} ${
            repostClosing ? styles.modalOverlayClosing : styles.modalOverlayOpen
          }`}
          role="dialog"
          aria-modal="true"
          onClick={closeRepostModal}
        >
          <div
            className={`${styles.modalCard} ${styles.repostCard} ${
              repostClosing ? styles.modalCardClosing : styles.modalCardOpen
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <div>
                <h3 className={styles.modalTitle}>Repost</h3>
                <p className={styles.modalBody}>
                  {`Choose how to share @${repostTarget.label}'s ${repostTarget.kind}.`}
                </p>
              </div>
              <button
                className={styles.closeBtn}
                onClick={closeRepostModal}
                aria-label="Close"
              >
                <IconClose size={18} />
              </button>
            </div>

            <div className={styles.repostGrid}>
              <button
                type="button"
                className={`${styles.repostOption} ${
                  repostMode === "repost" ? styles.repostOptionActive : ""
                }`}
                onClick={() => setRepostMode("repost")}
              >
                <span className={styles.repostTitle}>
                  <svg
                    viewBox="0 0 24 24"
                    width="20"
                    height="20"
                    fill="currentColor"
                  >
                    <path d="M23.615 15.485a.75.75 0 0 1-.75.75h-2.25a.75.75 0 0 1-.75-.75 2.25 2.25 0 0 0-2.25-2.25h-5.46l3.47 3.47a.75.75 0 0 1-1.06 1.06l-4.75-4.75a.75.75 0 0 1 0-1.06l4.75-4.75a.75.75 0 0 1 1.06 1.06l-3.47 3.47h5.46a3.75 3.75 0 0 1 3.75 3.750 0 1 3.75 3.75ZM6.135 15.485h5.46a.75.75 0 0 1 0 1.5h-5.46a3.75 3.75 0 0 1-3.75-3.75 3.75 3.75 0 0 1 3.75-3.75h2.25a.75.75 0 0 1 .75.75v5.25a.75.75 0 0 1-1.28.53l-2.25-2.25a.75.75 0 0 1 1.06-1.06l.97.97v-3.44h-1.5a2.25 2.25 0 0 0-2.25 2.25 2.25 2.25 0 0 0 2.25 2.25Z"></path>
                  </svg>
                  Repost only
                </span>
                <span className={styles.repostDesc}>
                  Share the original post without a caption. Likes/Views will be
                  credited to the original post.
                </span>
              </button>
              <button
                type="button"
                className={`${styles.repostOption} ${
                  repostMode === "quote" ? styles.repostOptionActive : ""
                }`}
                onClick={() => setRepostMode("quote")}
              >
                <span className={styles.repostTitle}>
                  <svg
                    viewBox="0 0 24 24"
                    width="20"
                    height="20"
                    fill="currentColor"
                  >
                    <path d="M4.5 7.5a3 3 0 0 1 3-3h9a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3h-9a3 3 0 0 1-3-3v-9Z" opacity="0.1"></path>
                    <path d="M15.75 2.25H8.25a5.25 5.25 0 0 0-5.25 5.25v8.25a5.25 5.25 0 0 0 5.25 5.25h7.5a5.25 5.25 0 0 0 5.25-5.25V7.5a5.25 5.25 0 0 0-5.25-5.25Zm3.75 13.5a3.75 3.75 0 0 1-3.75 3.75H8.25a3.75 3.75 0 0 1-3.75-3.75V7.5a3.75 3.75 0 0 1 3.75-3.75h7.5a3.75 3.75 0 0 1 3.75 3.75v8.25Z"></path>
                    <path d="M10.28 11.47a.75.75 0 0 0-1.06-1.06l-1.5 1.5a.75.75 0 0 0 0 1.06l1.5 1.5a.75.75 0 0 0 1.06-1.06l-.97-.97h4.09l-.97.97a.75.75 0 0 0 1.06 1.06l1.5-1.5a.75.75 0 0 0 0-1.06l-1.5-1.5a.75.75 0 0 0-1.06 1.06l.97.97H9.31l.97-.97Z"></path>
                  </svg>
                  Quote
                </span>
                <span className={styles.repostDesc}>
                  Add your own caption; comments belong to the quote, but
                  likes/views still count for the original post.
                </span>
              </button>
            </div>

            {repostMode === "quote" ? (
              <label className={styles.repostNoteLabel}>
                Caption (optional)
                <textarea
                  className={styles.repostTextarea}
                  value={repostNote}
                  onChange={(e) => setRepostNote(e.target.value)}
                  maxLength={500}
                  placeholder="Add a few thoughts..."
                />
              </label>
            ) : null}

            {repostError ? (
              <div className={styles.inlineError}>{repostError}</div>
            ) : null}

            <div className={styles.modalActions}>
              <button
                className={styles.modalSecondary}
                onClick={closeRepostModal}
                disabled={repostSubmitting}
              >
                Cancel
              </button>
              <button
                className={styles.modalPrimary}
                onClick={submitRepost}
                disabled={!repostMode || repostSubmitting}
              >
                {repostSubmitting ? "Sharing..." : "Share"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toastMessage ? <div className={styles.toast}>{toastMessage}</div> : null}
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
  onToggleComments,
  onToggleHideLikeCount,
  onCopyLink,
  onReportIntent,
  onDeleteIntent,
  onView,
  onBlockUser,
  viewerId,
  onFollow,
  token,
  onRemoteUpdate,
  onPersistFeedCache,
}: {
  data: FeedItem;
  liked: boolean;
  saved: boolean;
  flags: LocalFlags;
  onLike: (postId: string, liked: boolean) => void;
  onSave: (postId: string, saved: boolean) => void;
  onShare: (postId: string) => void;
  onHide: (postId: string) => void;
  onToggleComments: (postId: string, allowComments: boolean) => void;
  onToggleHideLikeCount: (postId: string, hideLikeCount: boolean) => void;
  onCopyLink: (postId: string) => void | Promise<void>;
  onReportIntent: (postId: string, label: string) => void;
  onDeleteIntent: (postId: string, label: string) => void;
  onView: (postId: string, durationMs?: number) => void;
  onBlockUser: (userId?: string, label?: string) => void | Promise<void>;
  viewerId?: string;
  onFollow: (authorId: string, nextFollow: boolean) => void;
  token: string | null;
  onRemoteUpdate: (postId: string, patch: FeedRemotePatch) => void;
  onPersistFeedCache?: () => void;
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
    visibility,
    allowComments,
    allowDownload,
    hideLikeCount,
  } = data;

  const displayName = authorDisplayName || author?.displayName;
  const username = authorUsername || author?.username;
  const avatarUrl = authorAvatarUrl || author?.avatarUrl;
  const cardRef = useRef<HTMLDivElement | null>(null);
  const dwellTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastViewAt = useRef<number>(0);
  const router = useRouter();
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const pollOnce = useCallback(async () => {
    if (!token) return;
    if (
      typeof document !== "undefined" &&
      document.visibilityState !== "visible"
    )
      return;
    try {
      const latest = await fetchPostDetail({ token, postId: id });
      onRemoteUpdate(id, {
        allowComments: latest.allowComments,
        hideLikeCount: (latest as any).hideLikeCount,
        stats: latest.stats,
        liked: (latest as any).liked,
        saved: (latest as any).saved,
      });
    } catch {}
  }, [id, onRemoteUpdate, token]);

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

  useEffect(() => {
    const el = cardRef.current;
    if (!el || !token) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.target !== el) return;
          if (entry.isIntersecting) {
            void pollOnce();
            stopPolling();
            pollTimerRef.current = setInterval(() => {
              void pollOnce();
            }, FEED_POLL_MS);
          } else {
            stopPolling();
          }
        });
      },
      { threshold: 0.25 }
    );

    observer.observe(el);
    return () => {
      stopPolling();
      observer.disconnect();
    };
  }, [pollOnce, stopPolling, token]);

  const initials = useMemo(() => {
    const base = displayName?.trim() || username?.trim() || authorId || "?";
    return base.slice(0, 2).toUpperCase();
  }, [displayName, username, authorId]);

  const [collapsed, setCollapsed] = useState(true);
  const [canExpand, setCanExpand] = useState(false);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editCaption, setEditCaption] = useState(content || "");
  const editCaptionRef = useRef<HTMLTextAreaElement | null>(null);
  const editEmojiRef = useRef<HTMLDivElement | null>(null);
  const [editEmojiOpen, setEditEmojiOpen] = useState(false);
  const [editHashtags, setEditHashtags] = useState<string[]>(hashtags || []);
  const [hashtagDraft, setHashtagDraft] = useState("");
  const [editMentions, setEditMentions] = useState<string[]>(mentions || []);
  const [mentionDraft, setMentionDraft] = useState("");
  const [mentionSuggestions, setMentionSuggestions] = useState<
    ProfileSearchItem[]
  >([]);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionLoading, setMentionLoading] = useState(false);
  const [mentionError, setMentionError] = useState("");
  const [mentionHighlight, setMentionHighlight] = useState(-1);
  const [activeMentionRange, setActiveMentionRange] = useState<{
    start: number;
    end: number;
  } | null>(null);
  const [editLocation, setEditLocation] = useState(location || "");
  const [locationQuery, setLocationQuery] = useState(location || "");
  const [locationSuggestions, setLocationSuggestions] = useState<
    Array<{ label: string; lat: string; lon: string }>
  >([]);
  const [locationOpen, setLocationOpen] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [locationHighlight, setLocationHighlight] = useState(-1);
  const [editAllowComments, setEditAllowComments] = useState(allowComments);
  const [editAllowDownload, setEditAllowDownload] = useState(
    allowDownload ?? false
  );
  const [editHideLikeCount, setEditHideLikeCount] = useState(hideLikeCount);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [editSuccess, setEditSuccess] = useState("");
  const [visibilityModalOpen, setVisibilityModalOpen] = useState(false);
  const [visibilitySelected, setVisibilitySelected] = useState<
    "public" | "followers" | "private"
  >(visibility ?? "public");
  const [visibilitySaving, setVisibilitySaving] = useState(false);
  const [visibilityError, setVisibilityError] = useState<string>("");
  const visibilityOptions: Array<{
    value: "public" | "followers" | "private";
    title: string;
    description: string;
  }> = [
    {
      value: "public",
      title: "Public",
      description: "Anyone can view this post",
    },
    {
      value: "followers",
      title: "Friends / Following",
      description: "Only followers can view this post",
    },
    {
      value: "private",
      title: "Private",
      description: "Only you can view this post",
    },
  ];

  useEffect(() => {
    setVisibilitySelected(visibility ?? "public");
  }, [visibility]);

  useEffect(() => {
    setMounted(true);
  }, []);

  const resetEditState = useCallback(() => {
    setEditCaption(content || "");
    setEditHashtags(hashtags || []);
    setHashtagDraft("");
    setEditMentions(mentions || []);
    setMentionDraft("");
    setMentionSuggestions([]);
    setMentionOpen(false);
    setMentionLoading(false);
    setMentionError("");
    setMentionHighlight(-1);
    setActiveMentionRange(null);
    setEditLocation(location || "");
    setLocationQuery(location || "");
    setLocationSuggestions([]);
    setLocationOpen(false);
    setLocationLoading(false);
    setLocationError("");
    setLocationHighlight(-1);
    setEditAllowComments(allowComments);
    setEditAllowDownload(allowDownload ?? false);
    setEditHideLikeCount(hideLikeCount);
    setEditError("");
    setEditSuccess("");
  }, [
    allowComments,
    allowDownload,
    content,
    hashtags,
    hideLikeCount,
    location,
    mentions,
  ]);

  useEffect(() => {
    resetEditState();
  }, [resetEditState, id]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!editEmojiRef.current) return;
      if (!editEmojiRef.current.contains(event.target as Node)) {
        setEditEmojiOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setEditEmojiOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!editOpen) setEditEmojiOpen(false);
  }, [editOpen]);

  const openEditModal = () => {
    resetEditState();
    setEditOpen(true);
  };

  const closeEditModal = () => {
    if (editSaving) return;
    setEditOpen(false);
  };

  const handleCaptionChange = (
    event: React.ChangeEvent<HTMLTextAreaElement>
  ) => {
    const value = event.target.value;
    const caret = event.target.selectionStart ?? value.length;
    setEditCaption(value);

    const active = findActiveMention(value, caret);
    if (active) {
      setActiveMentionRange({ start: active.start, end: active.end });
      setMentionDraft(active.handle);
      setMentionOpen(true);
      setMentionError("");
      setMentionHighlight(0);
    } else {
      setActiveMentionRange(null);
      setMentionDraft("");
      setMentionSuggestions([]);
      setMentionOpen(false);
      setMentionHighlight(-1);
      setMentionError("");
    }
  };

  const insertEditEmoji = (emoji: string) => {
    const el = editCaptionRef.current;
    const caret = el?.selectionStart ?? editCaption.length;
    setEditCaption((prev) => {
      const value = prev || "";
      if (!el || typeof el.selectionStart !== "number") {
        return value + emoji;
      }
      const start = el.selectionStart;
      const end = el.selectionEnd ?? start;
      return value.slice(0, start) + emoji + value.slice(end);
    });

    setTimeout(() => {
      if (!el) return;
      const nextPos = caret + emoji.length;
      el.focus();
      el.setSelectionRange(nextPos, nextPos);
    }, 0);
  };

  const onCaptionKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!mentionOpen) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!mentionSuggestions.length) return;
      setMentionHighlight((prev) =>
        prev + 1 < mentionSuggestions.length ? prev + 1 : 0
      );
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!mentionSuggestions.length) return;
      setMentionHighlight((prev) =>
        prev - 1 >= 0 ? prev - 1 : mentionSuggestions.length - 1
      );
      return;
    }
    if (e.key === "Enter") {
      if (mentionSuggestions.length && mentionHighlight >= 0) {
        e.preventDefault();
        const opt = mentionSuggestions[mentionHighlight];
        if (opt) selectMention(opt);
      }
    }
    if (e.key === "Escape") {
      setMentionOpen(false);
      setMentionHighlight(-1);
      setActiveMentionRange(null);
    }
  };

  useEffect(() => {
    if (!editOpen) return;
    const cleaned = mentionDraft.trim().replace(/^@/, "");
    if (!cleaned) {
      setMentionSuggestions([]);
      setMentionOpen(false);
      setMentionHighlight(-1);
      setMentionError("");
      return;
    }

    if (!token) {
      setMentionSuggestions([]);
      setMentionOpen(false);
      setMentionHighlight(-1);
      setMentionError("Sign in to mention users");
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setMentionLoading(true);
      setMentionError("");
      try {
        const res = await searchProfiles({
          token,
          query: cleaned,
          limit: 8,
        });
        if (cancelled) return;
        setMentionSuggestions(res.items);
        setMentionOpen(res.items.length > 0);
        setMentionHighlight(res.items.length ? 0 : -1);
        if (!res.items.length) {
          setMentionError("User not found");
        }
      } catch (err) {
        if (cancelled) return;
        setMentionSuggestions([]);
        setMentionOpen(false);
        setMentionHighlight(-1);
        setMentionError("User not found");
      } finally {
        if (!cancelled) setMentionLoading(false);
      }
    }, 320);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [editOpen, mentionDraft, token]);

  const selectMention = (opt: ProfileSearchItem) => {
    const handle = opt.username.toLowerCase();
    const caption = editCaption || "";
    const range = activeMentionRange ?? {
      start: caption.length,
      end: caption.length,
    };
    const before = caption.slice(0, range.start);
    const after = caption.slice(range.end);
    const insertion = `@${handle}`;
    const needsSpaceAfter = after.startsWith(" ") || after === "" ? "" : " ";
    const nextCaption = `${before}${insertion}${needsSpaceAfter}${after}`;
    const nextMentions = editMentions.includes(handle)
      ? editMentions
      : [...editMentions, handle];

    setEditCaption(nextCaption);
    setEditMentions(nextMentions);

    setMentionDraft("");
    setMentionSuggestions([]);
    setMentionOpen(false);
    setMentionHighlight(-1);
    setActiveMentionRange(null);

    setTimeout(() => {
      const el = editCaptionRef.current;
      if (!el) return;
      const caret = range.start + insertion.length + (needsSpaceAfter ? 1 : 0);
      el.focus?.();
      el.setSelectionRange?.(caret, caret);
    }, 0);
  };

  const addHashtag = () => {
    const cleaned = normalizeHashtag(hashtagDraft);
    if (!cleaned) return;
    if (editHashtags.includes(cleaned)) {
      setHashtagDraft("");
      return;
    }
    if (editHashtags.length >= 30) return;
    setEditHashtags((prev) => [...prev, cleaned]);
    setHashtagDraft("");
  };

  const removeHashtag = (tag: string) => {
    setEditHashtags((prev) => prev.filter((t) => t !== tag));
  };

  useEffect(() => {
    if (!editOpen) return;
    if (!locationQuery.trim()) {
      setLocationSuggestions([]);
      setLocationOpen(false);
      setLocationHighlight(-1);
      setLocationError("");
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLocationLoading(true);
      setLocationError("");
      try {
        const url = new URL("https://nominatim.openstreetmap.org/search");
        url.searchParams.set("q", locationQuery);
        url.searchParams.set("format", "jsonv2");
        url.searchParams.set("addressdetails", "1");
        url.searchParams.set("limit", "8");
        url.searchParams.set("countrycodes", "vn");
        const res = await fetch(url.toString(), {
          headers: {
            Accept: "application/json",
            "Accept-Language": "vi",
          },
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("search failed");
        const data = await res.json();
        const mapped = Array.isArray(data)
          ? data.map((item: any) => ({
              label: cleanLocationLabel(item.display_name as string),
              lat: item.lat as string,
              lon: item.lon as string,
            }))
          : [];
        setLocationSuggestions(mapped);
        setLocationOpen(true);
        setLocationHighlight(mapped.length ? 0 : -1);
      } catch (err) {
        if (controller.signal.aborted) return;
        setLocationSuggestions([]);
        setLocationOpen(false);
        setLocationHighlight(-1);
        setLocationError("No suggestions found, try different keywords.");
      } finally {
        if (!controller.signal.aborted) setLocationLoading(false);
      }
    }, 350);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [editOpen, locationQuery]);

  const pickLocation = (label: string) => {
    setEditLocation(label);
    setLocationQuery(label);
    setLocationSuggestions([]);
    setLocationOpen(false);
    setLocationHighlight(-1);
    setLocationError("");
  };

  const onLocationKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!locationSuggestions.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setLocationHighlight((prev) =>
        prev + 1 < locationSuggestions.length ? prev + 1 : 0
      );
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setLocationHighlight((prev) =>
        prev - 1 >= 0 ? prev - 1 : locationSuggestions.length - 1
      );
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const chosen = locationSuggestions[locationHighlight];
      if (chosen) pickLocation(chosen.label);
    }
  };

  const handleEditSubmit = async (event?: React.FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    setEditError("");
    setEditSuccess("");

    if (!token) {
      setEditError("Please sign in to edit posts");
      return;
    }

    const normalizedHashtags = Array.from(
      new Set(editHashtags.map((t) => normalizeHashtag(t.toString())))
    ).filter(Boolean);

    const normalizedMentions = Array.from(
      new Set(
        [
          ...extractMentionsFromCaption(editCaption || ""),
          ...editMentions.map((t) =>
            t.toString().trim().replace(/^@/, "").toLowerCase()
          ),
        ].filter(Boolean)
      )
    );

    const trimmedLocation = editLocation.trim();

    const payload = {
      content: editCaption || "",
      hashtags: normalizedHashtags,
      mentions: normalizedMentions,
      location: trimmedLocation || undefined,
      allowComments: editAllowComments,
      allowDownload: editAllowDownload,
      hideLikeCount: editHideLikeCount,
    } as const;

    try {
      setEditSaving(true);
      const updated = await updatePost({ token, postId: id, payload });
      onRemoteUpdate(id, updated);
      setEditSuccess("Post updated");
      setEditOpen(false);
    } catch (err: any) {
      const message =
        (err && typeof err === "object" && "message" in err
          ? (err as { message?: string }).message
          : null) || "Failed to update post";
      setEditError(message);
    } finally {
      setEditSaving(false);
    }
  };
  const [mediaIndex, setMediaIndex] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [soundOn, setSoundOn] = useState(false);
  const lastTimeRef = useRef(0);
  const lastSoundRef = useRef(false);
  const resumeTimeRef = useRef<number | null>(null);
  const resumeAppliedRef = useRef(false);
  const persistResume = useCallback(() => {
    if (typeof window === "undefined") return;
    const videoEl = videoRef.current;
    const time = videoEl
      ? videoEl.currentTime || lastTimeRef.current || 0
      : lastTimeRef.current || 0;
    const sound = videoEl
      ? !videoEl.muted || soundOn || lastSoundRef.current
      : soundOn || lastSoundRef.current;
    if (time <= 0.05) return;
    try {
      const payload = {
        mediaIndex,
        time,
        soundOn: sound,
      };
      sessionStorage.setItem(`postVideoResume:${id}`, JSON.stringify(payload));
    } catch {}
  }, [id, mediaIndex, soundOn]);

  const goToPost = useCallback(() => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem(FEED_CACHE_INTENT_KEY, "1");
      onPersistFeedCache?.();
    }
    setMenuOpen(false);
    persistResume();

    if (typeof window !== "undefined") {
      window.location.href = `/post/${id}`;
    } else {
      router.push(`/post/${id}`);
    }
  }, [id, router, persistResume, onPersistFeedCache]);

  const quickOpenPost = useCallback(() => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem(FEED_CACHE_INTENT_KEY, "1");
      onPersistFeedCache?.();
    }
    persistResume();
    router.push(`/post/${id}`);
  }, [id, router, persistResume, onPersistFeedCache]);

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
    setSoundOn(false);
  }, [id]);

  useEffect(() => {
    const mediaCount = media?.length ?? 0;
    if (mediaCount === 0) {
      setMediaIndex(0);
      setSoundOn(false);
      return;
    }
    setMediaIndex((prev) => (prev >= mediaCount ? 0 : prev));
    setSoundOn(false);
  }, [media]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = `postVideoResume:${id}`;
    const raw = sessionStorage.getItem(key);
    if (!raw) return;
    try {
      const data = JSON.parse(raw) as {
        mediaIndex?: number;
        time?: number;
        soundOn?: boolean;
      };
      const mediaCount = media?.length ?? 0;
      if (
        typeof data.mediaIndex === "number" &&
        data.mediaIndex >= 0 &&
        data.mediaIndex < mediaCount
      ) {
        setMediaIndex(data.mediaIndex);
      }
      if (typeof data.time === "number") {
        resumeTimeRef.current = Math.max(0, data.time);
      }
      if (data.soundOn) setSoundOn(true);
      resumeAppliedRef.current = true;
    } catch {}
    sessionStorage.removeItem(key);
  }, [id, media]);

  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;
    videoEl.muted = !soundOn;
  }, [soundOn, mediaIndex]);

  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;
    const applyResume = () => {
      if (resumeTimeRef.current == null) return;
      const duration = videoEl.duration;
      const safe = Number.isFinite(duration)
        ? Math.min(
            Math.max(resumeTimeRef.current, 0),
            Math.max(duration - 0.2, 0)
          )
        : Math.max(resumeTimeRef.current, 0);
      try {
        videoEl.currentTime = safe;
      } catch {}
      resumeTimeRef.current = null;
    };
    videoEl.addEventListener("loadedmetadata", applyResume);
    if (videoEl.readyState >= 1) applyResume();
    return () => {
      videoEl.removeEventListener("loadedmetadata", applyResume);
    };
  }, [mediaIndex]);

  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    const handleEntries = (entries: IntersectionObserverEntry[]) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const playPromise = videoEl.play();
          if (playPromise?.catch) playPromise.catch(() => undefined);
        } else {
          videoEl.pause();
        }
      });
    };

    const observer = new IntersectionObserver(handleEntries, {
      threshold: 0.6,
    });

    observer.observe(videoEl);

    return () => {
      observer.disconnect();
      videoEl.pause();
    };
  }, [mediaIndex, media]);

  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;
    const handler = () => persistResume();
    videoEl.addEventListener("timeupdate", handler);
    videoEl.addEventListener("pause", handler);
    videoEl.addEventListener("ended", handler);
    const updateRefs = () => {
      lastTimeRef.current = videoEl.currentTime || 0;
      lastSoundRef.current = !videoEl.muted;
    };
    videoEl.addEventListener("timeupdate", updateRefs);
    videoEl.addEventListener("volumechange", updateRefs);
    videoEl.addEventListener("pause", updateRefs);
    return () => {
      videoEl.removeEventListener("timeupdate", handler);
      videoEl.removeEventListener("pause", handler);
      videoEl.removeEventListener("ended", handler);
      videoEl.removeEventListener("timeupdate", updateRefs);
      videoEl.removeEventListener("volumechange", updateRefs);
      videoEl.removeEventListener("pause", updateRefs);
    };
  }, [persistResume]);

  useEffect(() => {
    return () => {
      persistResume();
    };
  }, [persistResume]);

  const enableSound = useCallback(() => {
    setSoundOn(true);
    const videoEl = videoRef.current;
    if (!videoEl) return;
    videoEl.muted = false;
    const playPromise = videoEl.play();
    if (playPromise?.catch) playPromise.catch(() => undefined);
  }, []);

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
  const shouldHideLikeStat = Boolean(hideLikeCount) && !isSelf;
  const isFollowing = Boolean(flags?.following);
  const initialFollowingRef = useRef(isFollowing);
  const followToggledRef = useRef(false);
  const commentsToggleLabel = allowComments
    ? "Turn off comments"
    : "Turn on comments";
  const hideLikeToggleLabel = hideLikeCount ? "Show like" : "Hide like";
  const showInlineFollow =
    !isSelf &&
    Boolean(authorOwnerId) &&
    (!initialFollowingRef.current || followToggledRef.current || !isFollowing);

  const disableVisibilityUpdate =
    visibilitySaving || visibilitySelected === (visibility ?? "public");

  const submitVisibilityUpdate = async () => {
    if (!token) {
      setVisibilityError("Please sign in");
      return;
    }
    if (disableVisibilityUpdate) return;

    setVisibilitySaving(true);
    setVisibilityError("");
    try {
      await updatePostVisibility({
        token,
        postId: id,
        visibility: visibilitySelected,
      });

      onRemoteUpdate(id, { visibility: visibilitySelected });
      setVisibilityModalOpen(false);
    } catch (err: any) {
      setVisibilityError(err?.message || "Failed to update visibility");
    } finally {
      setVisibilitySaving(false);
    }
  };

  const closeVisibilityModal = () => {
    if (visibilitySaving) return;
    setVisibilityModalOpen(false);
  };

  const editModal = (
    <div
      className={`${styles.modalOverlay} ${styles.modalOverlayOpen}`}
      role="dialog"
      aria-modal="true"
      onClick={closeEditModal}
    >
      <div
        className={`${styles.modalCard} ${styles.editCard}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.modalHeader}>
          <div>
            <h3 className={styles.modalTitle}>Edit post</h3>
          </div>
          <button
            className={styles.closeBtn}
            aria-label="Close"
            onClick={closeEditModal}
            type="button"
          >
            <IconClose size={18} />
          </button>
        </div>

        <form className={styles.editForm} onSubmit={handleEditSubmit}>
          <label className={styles.editLabel}>
            <div className={styles.editLabelRow}>
              <span className={styles.editLabelText}>Caption</span>
              <div className={styles.emojiWrap} ref={editEmojiRef}>
                <button
                  type="button"
                  className={styles.emojiButton}
                  onClick={() => setEditEmojiOpen((prev) => !prev)}
                  aria-label="Add emoji"
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
                {editEmojiOpen ? (
                  <div className={styles.emojiPopover}>
                    <EmojiPicker
                      onEmojiClick={(emojiData) => {
                        insertEditEmoji(emojiData.emoji || "");
                        setEditEmojiOpen(false);
                      }}
                      searchDisabled={false}
                      skinTonesDisabled={false}
                      lazyLoadEmojis
                    />
                  </div>
                ) : null}
              </div>
            </div>
            <div
              className={`${styles.editTextareaShell} ${styles.mentionCombo}`}
            >
              <textarea
                ref={editCaptionRef}
                className={styles.editTextarea}
                value={editCaption}
                onChange={handleCaptionChange}
                onKeyDown={onCaptionKeyDown}
                onBlur={() => {
                  setTimeout(() => {
                    setMentionOpen(false);
                    setMentionHighlight(-1);
                    setActiveMentionRange(null);
                  }, 120);
                }}
                rows={4}
                maxLength={2200}
                placeholder="Write something..."
              />
              <span className={styles.charCount}>
                {editCaption.length}/2200
              </span>
            </div>
          </label>

          {mentionOpen ? (
            <div className={styles.mentionDropdown}>
              {mentionLoading ? (
                <div className={styles.mentionItem}>Searching...</div>
              ) : null}
              {!mentionLoading && mentionSuggestions.length === 0 ? (
                <div className={styles.mentionItem}>
                  {mentionError || "No matches"}
                </div>
              ) : null}
              {mentionSuggestions.map((opt, idx) => {
                const active = idx === mentionHighlight;
                const avatarInitials = (opt.displayName || opt.username || "?")
                  .slice(0, 2)
                  .toUpperCase();
                return (
                  <button
                    type="button"
                    key={opt.id || opt.username}
                    className={`${styles.mentionItem} ${
                      active ? styles.mentionItemActive : ""
                    }`}
                    onClick={() => selectMention(opt)}
                  >
                    <span className={styles.mentionAvatar} aria-hidden>
                      {opt.avatarUrl ? (
                        <img
                          src={opt.avatarUrl}
                          alt={opt.displayName || opt.username}
                          className={styles.mentionAvatarImg}
                        />
                      ) : (
                        <span className={styles.mentionAvatarFallback}>
                          {avatarInitials}
                        </span>
                      )}
                    </span>
                    <span className={styles.mentionCopy}>
                      <span className={styles.mentionHandle}>
                        @{opt.username}
                      </span>
                      {opt.displayName ? (
                        <span className={styles.mentionName}>
                          {opt.displayName}
                        </span>
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}

          <div className={styles.editField}>
            <div className={styles.editLabelRow}>
              <span className={styles.editLabelText}>Hashtags</span>
            </div>
            <div className={styles.chipRow}>
              {editHashtags.map((tag) => (
                <span key={tag} className={styles.chip}>
                  #{tag}
                  <button
                    type="button"
                    className={styles.chipRemove}
                    onClick={() => removeHashtag(tag)}
                    aria-label={`Remove ${tag}`}
                  >
                    ×
                  </button>
                </span>
              ))}
              <input
                className={styles.editInput}
                placeholder="Add hashtag"
                value={hashtagDraft}
                onChange={(e) => setHashtagDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addHashtag();
                  }
                }}
              />
            </div>
          </div>

          <div className={styles.editField}>
            <div className={styles.editLabelRow}>
              <span className={styles.editLabelText}>Location</span>
            </div>
            <input
              className={styles.editInput}
              placeholder="Add a place"
              value={locationQuery}
              onChange={(e) => {
                setEditLocation(e.target.value);
                setLocationQuery(e.target.value);
              }}
              onFocus={() =>
                setLocationOpen(Boolean(locationSuggestions.length))
              }
              onKeyDown={onLocationKeyDown}
            />
            {locationOpen ? (
              <div className={styles.locationDropdown}>
                {locationLoading ? (
                  <div className={styles.locationItem}>Searching...</div>
                ) : null}
                {!locationLoading && locationSuggestions.length === 0 ? (
                  <div className={styles.locationItem}>
                    {locationError || "No suggestions"}
                  </div>
                ) : null}
                {locationSuggestions.map((opt, idx) => {
                  const active = idx === locationHighlight;
                  return (
                    <button
                      type="button"
                      key={`${opt.label}-${opt.lat}-${opt.lon}`}
                      className={`${styles.locationItem} ${
                        active ? styles.locationItemActive : ""
                      }`}
                      onClick={() => pickLocation(opt.label)}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>

          <div className={styles.switchGroup}>
            <label className={styles.switchRow}>
              <input
                type="checkbox"
                checked={editAllowComments}
                onChange={() => setEditAllowComments((prev) => !prev)}
              />
              <div>
                <p className={styles.switchTitle}>Allow comments</p>
                <p className={styles.switchHint}>
                  Enable to receive feedback from everyone
                </p>
              </div>
            </label>

            <label className={styles.switchRow}>
              <input
                type="checkbox"
                checked={editAllowDownload}
                onChange={() => setEditAllowDownload((prev) => !prev)}
              />
              <div>
                <p className={styles.switchTitle}>Allow downloads</p>
                <p className={styles.switchHint}>
                  Share the original file with people you trust
                </p>
              </div>
            </label>

            <label className={styles.switchRow}>
              <input
                type="checkbox"
                checked={editHideLikeCount}
                onChange={() => setEditHideLikeCount((prev) => !prev)}
              />
              <div>
                <p className={styles.switchTitle}>Hide like</p>
                <p className={styles.switchHint}>
                  Viewers won’t see the number of likes on this post
                </p>
              </div>
            </label>
          </div>

          {editError ? (
            <div className={styles.inlineError}>{editError}</div>
          ) : null}
          {editSuccess ? (
            <div className={styles.editSuccess}>{editSuccess}</div>
          ) : null}

          <div className={styles.modalActions}>
            <button
              type="button"
              className={styles.modalSecondary}
              onClick={closeEditModal}
              disabled={editSaving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={styles.modalPrimary}
              disabled={editSaving}
            >
              {editSaving ? "Saving..." : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  const visibilityModal = (
    <div
      className={`${styles.modalOverlay} ${styles.modalOverlayOpen}`}
      role="dialog"
      aria-modal="true"
      onClick={closeVisibilityModal}
    >
      <div
        className={`${styles.modalCard} ${styles.modalCardOpen}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.modalHeader}>
          <div>
            <h3 className={styles.modalTitle}>Edit visibility</h3>
            <p className={styles.modalBody}>Choose who can see this post.</p>
          </div>
          <button
            className={styles.closeBtn}
            aria-label="Close"
            onClick={closeVisibilityModal}
          >
            <IconClose size={18} />
          </button>
        </div>

        <div className={styles.visibilityList}>
          {visibilityOptions.map((opt) => {
            const active = visibilitySelected === opt.value;
            return (
              <button
                key={opt.value}
                className={`${styles.visibilityOption} ${
                  active ? styles.visibilityOptionActive : ""
                }`}
                onClick={() => setVisibilitySelected(opt.value)}
              >
                <span className={styles.visibilityRadio}>
                  {active ? "✓" : ""}
                </span>
                <span className={styles.visibilityCopy}>
                  <span className={styles.visibilityTitle}>{opt.title}</span>
                  <span className={styles.visibilityDesc}>
                    {opt.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {visibilityError ? (
          <div className={styles.inlineError}>{visibilityError}</div>
        ) : null}

        <div className={styles.modalActions}>
          <button
            className={styles.modalSecondary}
            onClick={closeVisibilityModal}
            disabled={visibilitySaving}
          >
            Cancel
          </button>
          <button
            className={styles.modalPrimary}
            onClick={submitVisibilityUpdate}
            disabled={disableVisibilityUpdate}
          >
            {visibilitySaving ? "Updating..." : "Update visibility"}
          </button>
        </div>
      </div>
    </div>
  );

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
              {authorOwnerId ? (
                <Link
                  href={`/profile/${authorOwnerId}`}
                  className={`${styles.authorName} ${styles.authorNameLink}`}
                >
                  {authorLine}
                </Link>
              ) : (
                <span className={styles.authorName}>{authorLine}</span>
              )}

              {showInlineFollow ? (
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
                    onClick={() => {
                      followToggledRef.current = true;
                      onFollow(authorOwnerId as string, !isFollowing);
                    }}
                  >
                    {isFollowing ? "Following" : "Follow"}
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
                      onClick={() => {
                        setMenuOpen(false);
                        openEditModal();
                      }}
                    >
                      Edit post
                    </button>
                    <button
                      className={styles.menuItem}
                      onClick={() => {
                        setMenuOpen(false);
                        setVisibilityError("");
                        setVisibilitySelected(visibility ?? "public");
                        setVisibilityModalOpen(true);
                      }}
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
                      onClick={() => {
                        setMenuOpen(false);
                        onToggleComments(id, !allowComments);
                      }}
                    >
                      {commentsToggleLabel}
                    </button>
                    <button
                      className={styles.menuItem}
                      onClick={() => {
                        setMenuOpen(false);
                        onToggleHideLikeCount(id, !hideLikeCount);
                      }}
                    >
                      {hideLikeToggleLabel}
                    </button>
                    <button className={styles.menuItem} onClick={goToPost}>
                      Go to post
                    </button>
                    <button
                      className={styles.menuItem}
                      onClick={() => {
                        setMenuOpen(false);
                        onCopyLink(id);
                      }}
                    >
                      Copy link
                    </button>
                    <button
                      className={`${styles.menuItem} ${styles.menuItemDanger}`}
                      onClick={() => {
                        setMenuOpen(false);
                        onDeleteIntent(id, authorLine);
                      }}
                    >
                      Delete post
                    </button>
                  </div>
                ) : (
                  <div className={styles.menuContent}>
                    <button className={styles.menuItem} onClick={goToPost}>
                      Go to post
                    </button>
                    <button
                      className={styles.menuItem}
                      onClick={() => {
                        setMenuOpen(false);
                        onCopyLink(id);
                      }}
                    >
                      Copy link
                    </button>
                    {authorOwnerId ? (
                      <button
                        className={styles.menuItem}
                        onClick={() => {
                          setMenuOpen(false);
                          followToggledRef.current = true;
                          onFollow(authorOwnerId, !isFollowing);
                        }}
                      >
                        {isFollowing ? "Unfollow" : "Follow"}
                      </button>
                    ) : null}
                    <button
                      className={styles.menuItem}
                      onClick={() => {
                        setMenuOpen(false);
                        onSave(id, !saved);
                      }}
                    >
                      {saved ? "Unsave this post" : "Save this post"}
                    </button>
                    <button
                      className={styles.menuItem}
                      onClick={() => {
                        setMenuOpen(false);
                        onHide(id);
                      }}
                    >
                      Hide this post
                    </button>
                    <button
                      className={styles.menuItem}
                      onClick={() => {
                        setMenuOpen(false);
                        onReportIntent(id, authorLine);
                      }}
                    >
                      Report
                    </button>
                    <button
                      className={`${styles.menuItem} ${styles.menuItemDanger}`}
                      onClick={() => {
                        setMenuOpen(false);
                        onBlockUser(authorId || author?.id, authorLine);
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
                <>
                  <video
                    key={`${id}-${mediaIndex}`}
                    ref={videoRef}
                    src={current.url}
                    controls
                    controlsList="nodownload noremoteplayback"
                    muted={!soundOn}
                    playsInline
                    preload="metadata"
                    onContextMenu={(e) => e.preventDefault()}
                    onPlay={() => onView(id, 1000)}
                    className={styles.mediaVisual}
                  />
                  {!soundOn ? (
                    <button
                      type="button"
                      className={styles.soundToggle}
                      onClick={enableSound}
                      aria-pressed={false}
                    >
                      Tap for sound
                    </button>
                  ) : null}
                </>
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
        <div>
          {!shouldHideLikeStat ? (
            <div className={styles.statItem}>
              <span className={styles.statIcon}>
                <IconLike size={18} />
              </span>
              <span>{stats.hearts ?? 0}</span>
            </div>
          ) : null}
          <div className={styles.statItem}>
            <span className={styles.statIcon}>
              <IconComment size={18} />
            </span>
            <span>{stats.comments ?? 0}</span>
          </div>
        </div>
        <div>
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
        <button className={styles.actionBtn} onClick={quickOpenPost}>
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
          <span>Repost</span>
        </button>
      </div>

      {editOpen
        ? mounted && typeof document !== "undefined"
          ? createPortal(editModal, document.body)
          : editModal
        : null}

      {visibilityModalOpen
        ? mounted && typeof document !== "undefined"
          ? createPortal(visibilityModal, document.body)
          : visibilityModal
        : null}
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
