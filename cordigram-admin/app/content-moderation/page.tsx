"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getApiBaseUrl } from "@/lib/api";
import styles from "./content-moderation.module.css";

type AdminPayload = {
  roles?: string[];
  exp?: number;
};

type TargetType = "post" | "comment" | "user";

type PostMediaItem = {
  type: "image" | "video";
  url: string;
  originalUrl?: string | null;
};

type PostItem = {
  postId: string;
  authorId: string;
  authorDisplayName: string | null;
  authorUsername: string | null;
  contentPreview: string;
  media: PostMediaItem[];
  visibility: string;
  moderationState: string;
  autoHiddenPendingReview: boolean;
  createdAt: string | null;
};

type CommentItem = {
  commentId: string;
  postId: string;
  authorId: string;
  authorDisplayName: string | null;
  authorUsername: string | null;
  contentPreview: string;
  moderationState: string;
  autoHiddenPendingReview: boolean;
  createdAt: string | null;
};

type UserItem = {
  userId: string;
  email: string | null;
  status: string;
  strikeCount: number;
  interactionMutedUntil: string | null;
  interactionMutedIndefinitely: boolean;
  accountLimitedUntil: string | null;
  accountLimitedIndefinitely: boolean;
  suspendedUntil: string | null;
  suspendedIndefinitely: boolean;
  createdAt: string | null;
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
};

type ListState<T> = {
  items: T[];
  hasMore: boolean;
  loading: boolean;
  initialized: boolean;
  offset: number;
};

type ModalState = {
  open: boolean;
  type: TargetType;
  targetId: string;
  targetLabel: string;
  initialAction: string;
};

type MediaViewerState = {
  open: boolean;
  postId: string;
  media: PostMediaItem[];
  index: number;
};

type ReviewOverlayState = {
  open: boolean;
  type: TargetType;
  targetId: string;
  loading: boolean;
  error: string | null;
  detail: any;
};

type SelectOption = {
  value: string;
  label: string;
};

type ModerationReason = {
  key: string;
  label: string;
};

type ModerationCategoryGroup = {
  key: string;
  label: string;
  accent: string;
  reasons: ModerationReason[];
};

const PAGE_SIZE = 30;

const ACTIONS: Record<TargetType, Array<{ value: string; label: string }>> = {
  post: [
    { value: "no_violation", label: "No violation" },
    { value: "warn", label: "Warn owner" },
    { value: "violation", label: "Violation strike" },
    { value: "restrict_post", label: "Restrict post" },
    { value: "remove_post", label: "Remove post" },
  ],
  comment: [
    { value: "no_violation", label: "No violation" },
    { value: "warn", label: "Warn owner" },
    { value: "violation", label: "Violation strike" },
    { value: "mute_interaction", label: "Mute interaction" },
    { value: "delete_comment", label: "Delete comment" },
  ],
  user: [
    { value: "no_violation", label: "No violation" },
    { value: "warn", label: "Warn user" },
    { value: "violation", label: "Violation strike" },
    { value: "mute_interaction", label: "Mute interaction" },
    { value: "limit_account", label: "Limit account" },
    { value: "suspend_user", label: "Suspend user" },
  ],
};

const REPORT_STYLE_CATEGORY_GROUPS: ModerationCategoryGroup[] = [
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
      { key: "nonconsensual_intimate", label: "Non-consensual intimate content" },
    ],
  },
];

const CATEGORY_KEYS_BY_TYPE: Record<TargetType, string[]> = {
  post: ["abuse", "violence", "sensitive", "misinfo", "spam", "ip", "illegal", "privacy"],
  comment: ["abuse", "violence", "sensitive", "misinfo", "spam", "illegal", "privacy"],
  user: ["abuse", "sensitive", "misinfo", "spam", "illegal", "privacy"],
};

const CATEGORY_GROUPS_BY_TYPE: Record<TargetType, ModerationCategoryGroup[]> = {
  post: REPORT_STYLE_CATEGORY_GROUPS.filter((group) => CATEGORY_KEYS_BY_TYPE.post.includes(group.key)),
  comment: REPORT_STYLE_CATEGORY_GROUPS.filter((group) => CATEGORY_KEYS_BY_TYPE.comment.includes(group.key)),
  user: REPORT_STYLE_CATEGORY_GROUPS.filter((group) => CATEGORY_KEYS_BY_TYPE.user.includes(group.key)),
};

const getDefaultCategoryForType = (type: TargetType) => CATEGORY_GROUPS_BY_TYPE[type][0]?.key ?? "abuse";

const decodeJwt = (token: string): AdminPayload | null => {
  try {
    const payload = token.split(".")[1];
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return json as AdminPayload;
  } catch {
    return null;
  }
};

const emptyListState = <T,>(): ListState<T> => ({
  items: [],
  hasMore: true,
  loading: false,
  initialized: false,
  offset: 0,
});

const formatDate = (value: string | null) => {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString();
};

const getStateToneClass = (state: string) => {
  const normalized = state.toLowerCase();
  if (["removed", "delete", "deleted", "banned", "suspended"].some((x) => normalized.includes(x))) {
    return styles.toneCritical;
  }
  if (["restricted", "limited", "mute", "pending"].some((x) => normalized.includes(x))) {
    return styles.toneWarning;
  }
  return styles.toneNeutral;
};

const getSuggestedSeverity = (category: string | null): "low" | "medium" | "high" => {
  if (!category) return "medium";
  if (["violence", "illegal", "privacy"].includes(category)) return "high";
  if (["abuse", "sensitive", "misinfo"].includes(category)) return "medium";
  return "low";
};

const getMediaDisplayUrl = (item: PostMediaItem | undefined) => {
  if (!item) return "";
  return (item.originalUrl || item.url || "").trim();
};

const mergeUniqueById = <T,>(
  existing: T[],
  incoming: T[],
  getId: (item: T) => string,
): T[] => {
  const seen = new Set(existing.map((item) => getId(item)));
  const merged = [...existing];
  for (const item of incoming) {
    const id = getId(item);
    if (seen.has(id)) continue;
    seen.add(id);
    merged.push(item);
  }
  return merged;
};

function CustomSelect(props: {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
}) {
  const { value, options, onChange, ariaLabel } = props;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDocumentClick = (event: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", onDocumentClick);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onDocumentClick);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  const selected = options.find((item) => item.value === value) ?? options[0];

  return (
    <div className={`${styles.customSelect} ${open ? styles.customSelectOpen : ""}`} ref={rootRef}>
      <button
        type="button"
        className={styles.customSelectTrigger}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span>{selected?.label ?? ""}</span>
        <span className={styles.selectCaret} aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path
              d="M7 10l5 5 5-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>

      {open ? (
        <div className={styles.customSelectMenu} role="listbox" aria-label={ariaLabel}>
          {options.map((option) => {
            const isActive = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isActive}
                className={`${styles.customSelectOption} ${isActive ? styles.customSelectOptionActive : ""}`}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export default function ContentModerationPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const listEndRef = useRef<HTMLDivElement | null>(null);
  const tableWrapRef = useRef<HTMLDivElement | null>(null);
  const captionRefs = useRef<Record<string, HTMLParagraphElement | null>>({});
  const postStateRef = useRef<ListState<PostItem>>(emptyListState<PostItem>());
  const commentStateRef = useRef<ListState<CommentItem>>(emptyListState<CommentItem>());
  const userStateRef = useRef<ListState<UserItem>>(emptyListState<UserItem>());

  const [ready, setReady] = useState(false);
  const [activeType, setActiveType] = useState<TargetType>("post");
  const [query, setQuery] = useState("");
  const [listError, setListError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [expandedCaptionMap, setExpandedCaptionMap] = useState<Record<string, boolean>>({});
  const [collapsibleCaptionMap, setCollapsibleCaptionMap] = useState<Record<string, boolean>>({});

  const [postState, setPostState] = useState<ListState<PostItem>>(emptyListState<PostItem>());
  const [commentState, setCommentState] = useState<ListState<CommentItem>>(emptyListState<CommentItem>());
  const [userState, setUserState] = useState<ListState<UserItem>>(emptyListState<UserItem>());

  const [postFilterState, setPostFilterState] = useState("all");
  const [postFilterType, setPostFilterType] = useState("all");
  const [postFilterVisibility, setPostFilterVisibility] = useState("all");
  const [postFilterAutoHidden, setPostFilterAutoHidden] = useState("all");

  const [commentFilterState, setCommentFilterState] = useState("all");
  const [commentFilterAutoHidden, setCommentFilterAutoHidden] = useState("all");

  const [userFilterStatus, setUserFilterStatus] = useState("all");
  const [userFilterRisk, setUserFilterRisk] = useState("all");

  const [modal, setModal] = useState<ModalState>({
    open: false,
    type: "post",
    targetId: "",
    targetLabel: "",
    initialAction: "violation",
  });

  const [action, setAction] = useState("violation");
  const [category, setCategory] = useState(getDefaultCategoryForType("post"));
  const [selectedReasonKey, setSelectedReasonKey] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [severity, setSeverity] = useState<"low" | "medium" | "high">("medium");

  const [muteDurationMinutes, setMuteDurationMinutes] = useState("120");
  const [muteUntilTurnOn, setMuteUntilTurnOn] = useState(false);

  const [suspendDurationMinutes, setSuspendDurationMinutes] = useState("1440");
  const [suspendUntilTurnOn, setSuspendUntilTurnOn] = useState(false);

  const [limitDurationMinutes, setLimitDurationMinutes] = useState("1440");
  const [limitUntilTurnOn, setLimitUntilTurnOn] = useState(false);
  const [mediaViewer, setMediaViewer] = useState<MediaViewerState>({
    open: false,
    postId: "",
    media: [],
    index: 0,
  });
  const [reviewOverlay, setReviewOverlay] = useState<ReviewOverlayState>({
    open: false,
    type: "post",
    targetId: "",
    loading: false,
    error: null,
    detail: null,
  });
  const [reviewPostMediaIndex, setReviewPostMediaIndex] = useState(0);
  const [reviewCommentMediaIndex, setReviewCommentMediaIndex] = useState(0);
  const [reviewContextMediaIndex, setReviewContextMediaIndex] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = localStorage.getItem("adminAccessToken") || "";
    if (!token) {
      router.replace("/login");
      return;
    }

    const payload = decodeJwt(token);
    const roles = payload?.roles || [];
    const exp = payload?.exp ? payload.exp * 1000 : 0;
    if (!roles.includes("admin") || (exp && Date.now() > exp)) {
      router.replace("/login");
      return;
    }

    setReady(true);
  }, [router]);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "post" || tab === "comment" || tab === "user") {
      setActiveType(tab);
    }
  }, [searchParams]);

  useEffect(() => {
    postStateRef.current = postState;
  }, [postState]);

  useEffect(() => {
    commentStateRef.current = commentState;
  }, [commentState]);

  useEffect(() => {
    userStateRef.current = userState;
  }, [userState]);

  useEffect(() => {
    if (activeType !== "post") return;
    const nextMap: Record<string, boolean> = {};
    for (const item of postState.items) {
      const node = captionRefs.current[item.postId];
      if (!node) continue;
      const lineHeightValue = window.getComputedStyle(node).lineHeight;
      const lineHeight = Number.parseFloat(lineHeightValue);
      if (!Number.isFinite(lineHeight) || lineHeight <= 0) continue;
      const maxCollapsedHeight = lineHeight * 3;
      nextMap[item.postId] = node.scrollHeight > maxCollapsedHeight + 1;
    }
    setCollapsibleCaptionMap(nextMap);
  }, [activeType, postState.items]);

  const currentFilters = useMemo(() => {
    if (activeType === "post") {
      return {
        state: postFilterState,
        type: postFilterType,
        visibility: postFilterVisibility,
        autoHidden: postFilterAutoHidden,
      };
    }

    if (activeType === "comment") {
      return {
        state: commentFilterState,
        autoHidden: commentFilterAutoHidden,
      };
    }

    return {
      status: userFilterStatus,
      risk: userFilterRisk,
    };
  }, [
    activeType,
    postFilterAutoHidden,
    postFilterState,
    postFilterType,
    postFilterVisibility,
    commentFilterAutoHidden,
    commentFilterState,
    userFilterRisk,
    userFilterStatus,
  ]);

  const fetchPage = useCallback(
    async (reset: boolean) => {
      if (!ready || typeof window === "undefined") return;
      const token = localStorage.getItem("adminAccessToken") || "";
      if (!token) return;

      const state =
        activeType === "post"
          ? postStateRef.current
          : activeType === "comment"
            ? commentStateRef.current
            : userStateRef.current;
      if (!reset && (!state.hasMore || state.loading)) return;

      const offset = reset ? 0 : state.offset;

      if (activeType === "post") {
        setPostState((prev) => ({ ...prev, loading: true }));
      } else if (activeType === "comment") {
        setCommentState((prev) => ({ ...prev, loading: true }));
      } else {
        setUserState((prev) => ({ ...prev, loading: true }));
      }
      setListError(null);

      try {
        const endpoint =
          activeType === "post"
            ? "posts"
            : activeType === "comment"
              ? "comments"
              : "users";

        const params = new URLSearchParams();
        params.set("limit", String(PAGE_SIZE));
        params.set("offset", String(offset));
        if (query.trim()) params.set("q", query.trim());

        Object.entries(currentFilters).forEach(([key, value]) => {
          if (value && value !== "all") {
            params.set(key, value);
          }
        });

        const res = await fetch(
          `${getApiBaseUrl()}/admin/moderation/content/${endpoint}?${params.toString()}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );

        if (!res.ok) {
          throw new Error("Failed to load moderation targets");
        }

        const payload = (await res.json()) as { items?: unknown[]; hasMore?: boolean };
        const hasMore = Boolean(payload.hasMore);

        if (activeType === "post") {
          const fetchedItems = Array.isArray(payload.items) ? (payload.items as PostItem[]) : [];
          setPostState((prev) => ({
            items: reset
              ? fetchedItems
              : mergeUniqueById(prev.items, fetchedItems, (item) => item.postId),
            hasMore,
            loading: false,
            initialized: true,
            offset: (reset ? 0 : prev.offset) + fetchedItems.length,
          }));
        } else if (activeType === "comment") {
          const fetchedItems = Array.isArray(payload.items)
            ? (payload.items as CommentItem[])
            : [];
          setCommentState((prev) => ({
            items: reset
              ? fetchedItems
              : mergeUniqueById(prev.items, fetchedItems, (item) => item.commentId),
            hasMore,
            loading: false,
            initialized: true,
            offset: (reset ? 0 : prev.offset) + fetchedItems.length,
          }));
        } else {
          const fetchedItems = Array.isArray(payload.items) ? (payload.items as UserItem[]) : [];
          setUserState((prev) => ({
            items: reset
              ? fetchedItems
              : mergeUniqueById(prev.items, fetchedItems, (item) => item.userId),
            hasMore,
            loading: false,
            initialized: true,
            offset: (reset ? 0 : prev.offset) + fetchedItems.length,
          }));
        }
      } catch {
        if (activeType === "post") {
          setPostState((prev) => ({ ...prev, loading: false, initialized: true }));
        } else if (activeType === "comment") {
          setCommentState((prev) => ({ ...prev, loading: false, initialized: true }));
        } else {
          setUserState((prev) => ({ ...prev, loading: false, initialized: true }));
        }
        setListError("Could not load moderation targets.");
      }
    },
    [activeType, currentFilters, query, ready],
  );

  useEffect(() => {
    if (!ready) return;
    if (tableWrapRef.current) {
      tableWrapRef.current.scrollTop = 0;
    }
    void fetchPage(true);
  }, [ready, activeType, query, currentFilters, fetchPage]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        void fetchPage(false);
      },
      {
        root: null,
        rootMargin: "220px",
        threshold: 0,
      },
    );

    const node = listEndRef.current;
    if (node) observer.observe(node);

    return () => observer.disconnect();
  }, [fetchPage]);

  useEffect(() => {
    if (!modal.open) return;
    const defaultCategory = getDefaultCategoryForType(modal.type);
    setAction(modal.initialAction);
    setCategory(defaultCategory);
    setSelectedReasonKey(null);
    setReason("");
    setSeverity(getSuggestedSeverity(defaultCategory));
    setMuteDurationMinutes("120");
    setMuteUntilTurnOn(false);
    setSuspendDurationMinutes("1440");
    setSuspendUntilTurnOn(false);
    setLimitDurationMinutes("1440");
    setLimitUntilTurnOn(false);
    setActionError(null);
    setActionSuccess(null);
  }, [modal]);

  const currentState =
    activeType === "post" ? postState : activeType === "comment" ? commentState : userState;

  const requiresSeverity = useMemo(
    () => !["no_violation", "warn", "mute_interaction", "suspend_user"].includes(action),
    [action],
  );

  const categoryGroups = useMemo(() => CATEGORY_GROUPS_BY_TYPE[modal.type], [modal.type]);
  const selectedCategoryGroup = useMemo(
    () => categoryGroups.find((group) => group.key === category) ?? categoryGroups[0],
    [category, categoryGroups],
  );

  const openActionModal = (
    type: TargetType,
    targetId: string,
    targetLabel: string,
    initialAction: string,
  ) => {
    setModal({
      open: true,
      type,
      targetId,
      targetLabel,
      initialAction,
    });
  };

  const openReviewOverlay = useCallback(async (type: TargetType, targetId: string) => {
    setReviewPostMediaIndex(0);
    setReviewCommentMediaIndex(0);
    setReviewContextMediaIndex(0);
    setReviewOverlay({
      open: true,
      type,
      targetId,
      loading: true,
      error: null,
      detail: null,
    });

    const token = localStorage.getItem("adminAccessToken") || "";
    if (!token) {
      setReviewOverlay((prev) => ({ ...prev, loading: false, error: "Missing admin token" }));
      return;
    }

    try {
      const res = await fetch(`${getApiBaseUrl()}/admin/moderation/content/${type}/${targetId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) {
        throw new Error("Failed to load target detail");
      }
      const payload = (await res.json()) as any;
      setReviewOverlay((prev) => ({ ...prev, loading: false, detail: payload }));
    } catch {
      setReviewOverlay((prev) => ({ ...prev, loading: false, error: "Could not load target detail." }));
    }
  }, []);

  const closeReviewOverlay = useCallback(() => {
    setReviewOverlay({
      open: false,
      type: "post",
      targetId: "",
      loading: false,
      error: null,
      detail: null,
    });
  }, []);

  const handleMakeViolationFromReview = useCallback(() => {
    const detail = reviewOverlay.detail as any;
    let targetLabel = `${reviewOverlay.type} ${reviewOverlay.targetId.slice(0, 8)}...`;

    if (reviewOverlay.type === "post") {
      targetLabel = `Post ${reviewOverlay.targetId.slice(0, 8)}...`;
    } else if (reviewOverlay.type === "comment") {
      targetLabel = `Comment ${reviewOverlay.targetId.slice(0, 8)}...`;
    } else if (reviewOverlay.type === "user") {
      targetLabel = `@${detail?.user?.username || reviewOverlay.targetId.slice(0, 8)}`;
    }

    closeReviewOverlay();
    openActionModal(reviewOverlay.type, reviewOverlay.targetId, targetLabel, "violation");
  }, [closeReviewOverlay, openActionModal, reviewOverlay.detail, reviewOverlay.targetId, reviewOverlay.type]);

  const closeMediaViewer = useCallback(() => {
    setMediaViewer({ open: false, postId: "", media: [], index: 0 });
  }, []);

  const showPrevMedia = useCallback(() => {
    setMediaViewer((prev) => {
      if (!prev.open || prev.media.length <= 1) return prev;
      return {
        ...prev,
        index: (prev.index - 1 + prev.media.length) % prev.media.length,
      };
    });
  }, []);

  const showNextMedia = useCallback(() => {
    setMediaViewer((prev) => {
      if (!prev.open || prev.media.length <= 1) return prev;
      return {
        ...prev,
        index: (prev.index + 1) % prev.media.length,
      };
    });
  }, []);

  useEffect(() => {
    if (!mediaViewer.open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMediaViewer();
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        showPrevMedia();
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        showNextMedia();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [mediaViewer.open, closeMediaViewer, showNextMedia, showPrevMedia]);

  const submitModeration = async () => {
    if (!modal.targetId.trim()) {
      setActionError("Target ID is required.");
      return;
    }
    if (!category.trim() || !reason.trim()) {
      setActionError("Category and reason are required.");
      return;
    }

    const token = localStorage.getItem("adminAccessToken") || "";
    if (!token) return;

    try {
      setSubmitLoading(true);
      setActionError(null);
      setActionSuccess(null);

      const body: Record<string, unknown> = {
        type: modal.type,
        targetId: modal.targetId,
        action,
        category: category.trim(),
        reason: reason.trim(),
        note: "Direct content moderation",
      };

      if (requiresSeverity) body.severity = severity;

      if (action === "mute_interaction") {
        if (!muteUntilTurnOn) body.muteDurationMinutes = Number(muteDurationMinutes);
        body.muteUntilTurnOn = muteUntilTurnOn;
      }

      if (action === "suspend_user") {
        if (!suspendUntilTurnOn) body.suspendDurationMinutes = Number(suspendDurationMinutes);
        body.suspendUntilTurnOn = suspendUntilTurnOn;
      }

      if (action === "limit_account") {
        if (!limitUntilTurnOn) body.limitDurationMinutes = Number(limitDurationMinutes);
        body.limitUntilTurnOn = limitUntilTurnOn;
      }

      const res = await fetch(`${getApiBaseUrl()}/admin/moderation/content/action`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { message?: string | string[] };
        const messageText = Array.isArray(payload.message)
          ? payload.message.join("; ")
          : payload.message || "Moderation action failed";
        throw new Error(messageText);
      }

      setActionSuccess("Moderation action applied successfully.");

      if (modal.type === "post") setPostState(emptyListState<PostItem>());
      if (modal.type === "comment") setCommentState(emptyListState<CommentItem>());
      if (modal.type === "user") setUserState(emptyListState<UserItem>());

      void fetchPage(true);

      window.setTimeout(() => {
        setModal((prev) => ({ ...prev, open: false }));
      }, 500);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Moderation action failed");
    } finally {
      setSubmitLoading(false);
    }
  };

  if (!ready) return null;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>Content Moderation Console</h1>
          <p className={styles.subtitle}>
            Infinite moderation queue with per-target filters and row-level action workflow.
          </p>
        </div>
      </header>

      <section className={styles.toolbar}>
        <div className={styles.tabs}>
          {(["post", "comment", "user"] as TargetType[]).map((tab) => (
            <button
              key={tab}
              type="button"
              className={`${styles.tab} ${activeType === tab ? styles.tabActive : ""}`}
              onClick={() => setActiveType(tab)}
            >
              {tab}
            </button>
          ))}
        </div>

        <input
          className={styles.search}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by ID, username, display name, email, or content"
        />
      </section>

      <section className={styles.filters}>
        {activeType === "post" ? (
          <>
            <label className={styles.filterItem}>
              <span className={styles.filterLabel}>State: </span>
              <CustomSelect
                value={postFilterState}
                onChange={setPostFilterState}
                ariaLabel="Post state filter"
                options={[
                  { value: "all", label: "all" },
                  { value: "normal", label: "normal" },
                  { value: "restricted", label: "restricted" },
                  { value: "removed", label: "removed" },
                ]}
              />
            </label>
            <label className={styles.filterItem}>
              <span className={styles.filterLabel}>Type: </span>
              <CustomSelect
                value={postFilterType}
                onChange={setPostFilterType}
                ariaLabel="Post type filter"
                options={[
                  { value: "all", label: "all" },
                  { value: "post", label: "post" },
                  { value: "reel", label: "reel" },
                ]}
              />
            </label>
            <label className={styles.filterItem}>
              <span className={styles.filterLabel}>Visibility: </span>
              <CustomSelect
                value={postFilterVisibility}
                onChange={setPostFilterVisibility}
                ariaLabel="Post visibility filter"
                options={[
                  { value: "all", label: "all" },
                  { value: "public", label: "public" },
                  { value: "followers", label: "followers" },
                  { value: "private", label: "private" },
                ]}
              />
            </label>
            <label className={styles.filterItem}>
              <span className={styles.filterLabel}>Auto Hidden: </span>
              <CustomSelect
                value={postFilterAutoHidden}
                onChange={setPostFilterAutoHidden}
                ariaLabel="Post auto hidden filter"
                options={[
                  { value: "all", label: "all" },
                  { value: "yes", label: "yes" },
                  { value: "no", label: "no" },
                ]}
              />
            </label>
          </>
        ) : null}

        {activeType === "comment" ? (
          <>
            <label className={styles.filterItem}>
              <span className={styles.filterLabel}>State: </span>
              <CustomSelect
                value={commentFilterState}
                onChange={setCommentFilterState}
                ariaLabel="Comment state filter"
                options={[
                  { value: "all", label: "all" },
                  { value: "normal", label: "normal" },
                  { value: "restricted", label: "restricted" },
                  { value: "removed", label: "removed" },
                ]}
              />
            </label>
            <label className={styles.filterItem}>
              <span className={styles.filterLabel}>Auto Hidden: </span>
              <CustomSelect
                value={commentFilterAutoHidden}
                onChange={setCommentFilterAutoHidden}
                ariaLabel="Comment auto hidden filter"
                options={[
                  { value: "all", label: "all" },
                  { value: "yes", label: "yes" },
                  { value: "no", label: "no" },
                ]}
              />
            </label>
          </>
        ) : null}

        {activeType === "user" ? (
          <>
            <label className={styles.filterItem}>
              <span className={styles.filterLabel}>Status: </span>
              <CustomSelect
                value={userFilterStatus}
                onChange={setUserFilterStatus}
                ariaLabel="User status filter"
                options={[
                  { value: "all", label: "all" },
                  { value: "active", label: "active" },
                  { value: "pending", label: "pending" },
                  { value: "banned", label: "banned" },
                ]}
              />
            </label>
            <label className={styles.filterItem}>
              <span className={styles.filterLabel}>Risk: </span>
              <CustomSelect
                value={userFilterRisk}
                onChange={setUserFilterRisk}
                ariaLabel="User risk filter"
                options={[
                  { value: "all", label: "all" },
                  { value: "high_strike", label: "high strike" },
                  { value: "muted", label: "muted" },
                  { value: "limited", label: "limited" },
                  { value: "suspended", label: "suspended" },
                ]}
              />
            </label>
          </>
        ) : null}
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2>Moderation Targets</h2>
        </div>

        {listError ? <p className={styles.error}>{listError}</p> : null}

        <div className={styles.tableWrap} ref={tableWrapRef}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Target</th>
                <th>Owner</th>
                <th>State</th>
                <th>{activeType === "comment" ? "ID" : "Meta"}</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {activeType === "post"
                ? postState.items.map((item) => (
                    <tr key={item.postId}>
                      <td>
                        <p
                          ref={(node) => {
                            captionRefs.current[item.postId] = node;
                          }}
                          className={`${styles.captionText} ${
                            expandedCaptionMap[item.postId] ? "" : styles.captionCollapsed
                          }`}
                        >
                          {item.contentPreview || "(No caption)"}
                        </p>
                        {collapsibleCaptionMap[item.postId] ? (
                          <button
                            type="button"
                            className={styles.captionToggleButton}
                            onClick={() =>
                              setExpandedCaptionMap((prev) => ({
                                ...prev,
                                [item.postId]: !prev[item.postId],
                              }))
                            }
                          >
                            {expandedCaptionMap[item.postId] ? "Collapse" : "See more"}
                          </button>
                        ) : null}
                        <div className={styles.targetDivider} />
                        <p className={styles.targetIdLabel}>Post ID</p>
                        <p className={`${styles.subText} ${styles.targetIdValue}`}>{item.postId}</p>
                      </td>
                      <td>
                        <p className={`${styles.mainText} ${styles.ownerName}`}>{item.authorDisplayName || "Unknown"}</p>
                        <p className={styles.subText}>@{item.authorUsername || "unknown"}</p>
                      </td>
                      <td>
                        <span className={`${styles.badge} ${getStateToneClass(item.moderationState)}`}>
                          {item.moderationState}
                        </span>
                      </td>
                      <td>
                        <p className={styles.subText}>{item.visibility}</p>
                        {item.media?.length ? (
                          <button
                            type="button"
                            className={styles.mediaPreviewButton}
                            onClick={() =>
                              setMediaViewer({
                                open: true,
                                postId: item.postId,
                                media: item.media,
                                index: 0,
                              })
                            }
                          >
                            {item.media[0].type === "video" ? (
                              <video
                                src={getMediaDisplayUrl(item.media[0])}
                                muted
                                playsInline
                                className={styles.mediaPreview}
                              />
                            ) : (
                              <img
                                src={getMediaDisplayUrl(item.media[0])}
                                alt="Post media preview"
                                className={styles.mediaPreview}
                              />
                            )}
                            {item.media.length > 1 ? (
                              <span className={styles.mediaCountBadge}>+{item.media.length - 1}</span>
                            ) : null}
                          </button>
                        ) : null}
                      </td>
                      <td className={`${styles.subText} ${styles.createdCell}`}>{formatDate(item.createdAt)}</td>
                      <td>
                        <button
                          type="button"
                          className={styles.reviewActionButton}
                          onClick={() => void openReviewOverlay("post", item.postId)}
                        >
                          Review
                        </button>
                      </td>
                    </tr>
                  ))
                : null}

              {activeType === "comment"
                ? commentState.items.map((item) => (
                    <tr key={item.commentId}>
                      <td>
                        <p className={styles.mainText}>{item.contentPreview || "(No content)"}</p>
                      </td>
                      <td>
                        <p className={`${styles.mainText} ${styles.ownerName}`}>{item.authorDisplayName || "Unknown"}</p>
                        <p className={styles.subText}>@{item.authorUsername || "unknown"}</p>
                      </td>
                      <td>
                        <span className={`${styles.badge} ${getStateToneClass(item.moderationState)}`}>
                          {item.moderationState}
                        </span>
                      </td>
                      <td className={styles.subText}>{item.commentId}</td>
                      <td className={`${styles.subText} ${styles.createdCell}`}>{formatDate(item.createdAt)}</td>
                      <td>
                        <button
                          type="button"
                          className={styles.reviewActionButton}
                          onClick={() => void openReviewOverlay("comment", item.commentId)}
                        >
                          Review
                        </button>
                      </td>
                    </tr>
                  ))
                : null}

              {activeType === "user"
                ? userState.items.map((item) => (
                    <tr key={item.userId}>
                      <td>
                        <div className={styles.userCell}>
                          <div className={styles.avatarWrap}>
                            {item.avatarUrl ? (
                              <img src={item.avatarUrl} alt={item.username || "avatar"} className={styles.avatar} />
                            ) : (
                              <span className={styles.avatarFallback}>
                                {(item.displayName || item.email || "U").slice(0, 1).toUpperCase()}
                              </span>
                            )}
                          </div>
                          <div>
                            <p className={`${styles.mainText} ${styles.ownerName}`}>{item.displayName || item.email || "Unknown"}</p>
                            <p className={styles.subText}>{item.userId}</p>
                          </div>
                        </div>
                      </td>
                      <td>
                        <p className={styles.mainText}>@{item.username || "unknown"}</p>
                        <p className={styles.subText}>{item.email || "No email"}</p>
                      </td>
                      <td>
                        <span className={`${styles.badge} ${getStateToneClass(item.status)}`}>{item.status}</span>
                      </td>
                      <td className={styles.subText}>
                        strikes: {item.strikeCount}
                        <br />
                        muted: {item.interactionMutedIndefinitely || item.interactionMutedUntil ? "yes" : "no"}
                        <br />
                        limited: {item.accountLimitedIndefinitely || item.accountLimitedUntil ? "yes" : "no"}
                      </td>
                      <td className={`${styles.subText} ${styles.createdCell}`}>{formatDate(item.createdAt)}</td>
                      <td>
                        <button
                          type="button"
                          className={styles.reviewActionButton}
                          onClick={() => void openReviewOverlay("user", item.userId)}
                        >
                          Review
                        </button>
                      </td>
                    </tr>
                  ))
                : null}

              {!currentState.loading && currentState.items.length === 0 ? (
                <tr>
                  <td colSpan={6} className={styles.emptyCell}>
                    No targets found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div ref={listEndRef} className={styles.loadMoreZone}>
          {currentState.loading ? "Loading more targets..." : currentState.hasMore ? "Scroll to load more" : "No more targets"}
        </div>
      </section>

      {reviewOverlay.open ? (
        <div className={styles.reviewOverlay} onClick={closeReviewOverlay}>
          <div className={styles.reviewCard} onClick={(event) => event.stopPropagation()}>
            <div className={styles.reviewHeader}>
              <div>
                <p className={styles.reviewTitle}>Review target detail</p>
                <p className={styles.reviewSubtitle}>
                  Type: {reviewOverlay.type.toUpperCase()} · ID: {reviewOverlay.targetId}
                </p>
              </div>
              <button type="button" className={styles.reviewClose} onClick={closeReviewOverlay} aria-label="Close review overlay">
                x
              </button>
            </div>

            {reviewOverlay.loading ? <p className={styles.subText}>Loading target detail...</p> : null}
            {reviewOverlay.error ? <p className={styles.error}>{reviewOverlay.error}</p> : null}

            {!reviewOverlay.loading && !reviewOverlay.error && reviewOverlay.detail ? (
              <div className={styles.reviewBody}>
                {reviewOverlay.type === "post" ? (
                  <>
                    <div className={styles.reviewAuthorRow}>
                      <div className={styles.avatarWrap}>
                        {(reviewOverlay.detail as any)?.author?.avatarUrl ? (
                          <img src={(reviewOverlay.detail as any).author.avatarUrl} alt="author avatar" className={styles.avatar} />
                        ) : (
                          <span className={styles.avatarFallback}>
                            {((reviewOverlay.detail as any)?.author?.displayName || "U").slice(0, 1).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div>
                        <p className={styles.mainText}>{(reviewOverlay.detail as any)?.author?.displayName || "Unknown"}</p>
                        <p className={styles.subText}>@{(reviewOverlay.detail as any)?.author?.username || "unknown"}</p>
                      </div>
                    </div>

                    <div className={styles.reviewInfoBlock}>
                      <p className={styles.reviewInfoLabel}>Caption</p>
                      <p className={styles.reviewInfoValue}>{(reviewOverlay.detail as any)?.post?.caption || "(No caption)"}</p>
                    </div>

                    {Array.isArray((reviewOverlay.detail as any)?.post?.media) &&
                    (reviewOverlay.detail as any).post.media.length > 0 ? (
                      <div className={styles.reviewMediaCarousel}>
                        <div className={styles.reviewMediaViewport}>
                          {(reviewOverlay.detail as any).post.media.length > 1 ? (
                            <button
                              type="button"
                              className={`${styles.reviewMediaNav} ${styles.reviewMediaNavLeft}`}
                              onClick={() =>
                                setReviewPostMediaIndex((prev) =>
                                  (prev - 1 + (reviewOverlay.detail as any).post.media.length) %
                                  (reviewOverlay.detail as any).post.media.length,
                                )
                              }
                              aria-label="Previous post media"
                            >
                              <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M15 18l-6-6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </button>
                          ) : null}

                          <button
                            type="button"
                            className={styles.reviewMediaStageButton}
                            onClick={() =>
                              setMediaViewer({
                                open: true,
                                postId: reviewOverlay.targetId,
                                media: ((reviewOverlay.detail as any)?.post?.media || []) as PostMediaItem[],
                                index: reviewPostMediaIndex,
                              })
                            }
                          >
                            {((reviewOverlay.detail as any).post.media[reviewPostMediaIndex] as PostMediaItem).type === "video" ? (
                              <video
                                src={getMediaDisplayUrl((reviewOverlay.detail as any).post.media[reviewPostMediaIndex] as PostMediaItem)}
                                muted
                                playsInline
                                className={styles.reviewMediaImageLarge}
                              />
                            ) : (
                              <img
                                src={getMediaDisplayUrl((reviewOverlay.detail as any).post.media[reviewPostMediaIndex] as PostMediaItem)}
                                alt="Post media"
                                className={styles.reviewMediaImageLarge}
                              />
                            )}
                          </button>

                          {(reviewOverlay.detail as any).post.media.length > 1 ? (
                            <button
                              type="button"
                              className={`${styles.reviewMediaNav} ${styles.reviewMediaNavRight}`}
                              onClick={() =>
                                setReviewPostMediaIndex((prev) =>
                                  (prev + 1) % (reviewOverlay.detail as any).post.media.length,
                                )
                              }
                              aria-label="Next post media"
                            >
                              <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </button>
                          ) : null}
                        </div>
                        <p className={styles.reviewMediaPager}>
                          {reviewPostMediaIndex + 1}/{(reviewOverlay.detail as any).post.media.length}
                        </p>
                      </div>
                    ) : null}
                  </>
                ) : null}

                {reviewOverlay.type === "comment" ? (
                  <>
                    <div className={styles.reviewAuthorRow}>
                      <div className={styles.avatarWrap}>
                        {(reviewOverlay.detail as any)?.author?.avatarUrl ? (
                          <img src={(reviewOverlay.detail as any).author.avatarUrl} alt="author avatar" className={styles.avatar} />
                        ) : (
                          <span className={styles.avatarFallback}>
                            {((reviewOverlay.detail as any)?.author?.displayName || "U").slice(0, 1).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div>
                        <p className={styles.mainText}>{(reviewOverlay.detail as any)?.author?.displayName || "Unknown"}</p>
                        <p className={styles.subText}>@{(reviewOverlay.detail as any)?.author?.username || "unknown"}</p>
                      </div>
                    </div>
                    <div className={styles.reviewInfoBlock}>
                      <p className={styles.reviewInfoLabel}>Comment content</p>
                      <p className={styles.reviewInfoValue}>{(reviewOverlay.detail as any)?.comment?.content || "(No content)"}</p>
                    </div>
                    {Array.isArray((reviewOverlay.detail as any)?.comment?.media) &&
                    (reviewOverlay.detail as any).comment.media.length > 0 ? (
                      <div className={styles.reviewInfoBlock}>
                        <p className={styles.reviewInfoLabel}>Comment media</p>
                        <div className={styles.reviewMediaCarousel}>
                          <div className={styles.reviewMediaViewport}>
                            {(reviewOverlay.detail as any).comment.media.length > 1 ? (
                              <button
                                type="button"
                                className={`${styles.reviewMediaNav} ${styles.reviewMediaNavLeft}`}
                                onClick={() =>
                                  setReviewCommentMediaIndex((prev) =>
                                    (prev - 1 + (reviewOverlay.detail as any).comment.media.length) %
                                    (reviewOverlay.detail as any).comment.media.length,
                                  )
                                }
                                aria-label="Previous comment media"
                              >
                                <svg viewBox="0 0 24 24" aria-hidden="true">
                                  <path d="M15 18l-6-6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className={styles.reviewMediaStageButton}
                              onClick={() =>
                                setMediaViewer({
                                  open: true,
                                  postId: reviewOverlay.targetId,
                                  media: ((reviewOverlay.detail as any)?.comment?.media || []) as PostMediaItem[],
                                  index: reviewCommentMediaIndex,
                                })
                              }
                            >
                              {((reviewOverlay.detail as any).comment.media[reviewCommentMediaIndex] as PostMediaItem).type === "video" ? (
                                <video
                                  src={getMediaDisplayUrl((reviewOverlay.detail as any).comment.media[reviewCommentMediaIndex] as PostMediaItem)}
                                  muted
                                  playsInline
                                  className={styles.reviewMediaImageLarge}
                                />
                              ) : (
                                <img
                                  src={getMediaDisplayUrl((reviewOverlay.detail as any).comment.media[reviewCommentMediaIndex] as PostMediaItem)}
                                  alt="Comment media"
                                  className={styles.reviewMediaImageLarge}
                                />
                              )}
                            </button>
                            {(reviewOverlay.detail as any).comment.media.length > 1 ? (
                              <button
                                type="button"
                                className={`${styles.reviewMediaNav} ${styles.reviewMediaNavRight}`}
                                onClick={() =>
                                  setReviewCommentMediaIndex((prev) =>
                                    (prev + 1) % (reviewOverlay.detail as any).comment.media.length,
                                  )
                                }
                                aria-label="Next comment media"
                              >
                                <svg viewBox="0 0 24 24" aria-hidden="true">
                                  <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              </button>
                            ) : null}
                          </div>
                          <p className={styles.reviewMediaPager}>
                            {reviewCommentMediaIndex + 1}/{(reviewOverlay.detail as any).comment.media.length}
                          </p>
                        </div>
                      </div>
                    ) : null}
                    {(reviewOverlay.detail as any)?.contextPost?.caption ? (
                      <div className={styles.reviewInfoBlock}>
                        <p className={styles.reviewInfoLabel}>Parent post caption</p>
                        <p className={styles.reviewInfoValue}>{(reviewOverlay.detail as any)?.contextPost?.caption}</p>
                      </div>
                    ) : null}
                    {Array.isArray((reviewOverlay.detail as any)?.contextPost?.media) &&
                    (reviewOverlay.detail as any).contextPost.media.length > 0 ? (
                      <div className={styles.reviewInfoBlock}>
                        <p className={styles.reviewInfoLabel}>Parent post media</p>
                        <div className={styles.reviewMediaCarousel}>
                          <div className={styles.reviewMediaViewport}>
                            {(reviewOverlay.detail as any).contextPost.media.length > 1 ? (
                              <button
                                type="button"
                                className={`${styles.reviewMediaNav} ${styles.reviewMediaNavLeft}`}
                                onClick={() =>
                                  setReviewContextMediaIndex((prev) =>
                                    (prev - 1 + (reviewOverlay.detail as any).contextPost.media.length) %
                                    (reviewOverlay.detail as any).contextPost.media.length,
                                  )
                                }
                                aria-label="Previous parent post media"
                              >
                                <svg viewBox="0 0 24 24" aria-hidden="true">
                                  <path d="M15 18l-6-6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className={styles.reviewMediaStageButton}
                              onClick={() =>
                                setMediaViewer({
                                  open: true,
                                  postId: (reviewOverlay.detail as any)?.contextPost?.postId || reviewOverlay.targetId,
                                  media: ((reviewOverlay.detail as any)?.contextPost?.media || []) as PostMediaItem[],
                                  index: reviewContextMediaIndex,
                                })
                              }
                            >
                              {((reviewOverlay.detail as any).contextPost.media[reviewContextMediaIndex] as PostMediaItem).type === "video" ? (
                                <video
                                  src={getMediaDisplayUrl((reviewOverlay.detail as any).contextPost.media[reviewContextMediaIndex] as PostMediaItem)}
                                  muted
                                  playsInline
                                  className={styles.reviewMediaImageLarge}
                                />
                              ) : (
                                <img
                                  src={getMediaDisplayUrl((reviewOverlay.detail as any).contextPost.media[reviewContextMediaIndex] as PostMediaItem)}
                                  alt="Parent post media"
                                  className={styles.reviewMediaImageLarge}
                                />
                              )}
                            </button>
                            {(reviewOverlay.detail as any).contextPost.media.length > 1 ? (
                              <button
                                type="button"
                                className={`${styles.reviewMediaNav} ${styles.reviewMediaNavRight}`}
                                onClick={() =>
                                  setReviewContextMediaIndex((prev) =>
                                    (prev + 1) % (reviewOverlay.detail as any).contextPost.media.length,
                                  )
                                }
                                aria-label="Next parent post media"
                              >
                                <svg viewBox="0 0 24 24" aria-hidden="true">
                                  <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              </button>
                            ) : null}
                          </div>
                          <p className={styles.reviewMediaPager}>
                            {reviewContextMediaIndex + 1}/{(reviewOverlay.detail as any).contextPost.media.length}
                          </p>
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : null}

                {reviewOverlay.type === "user" ? (
                  <>
                    <div className={styles.reviewAuthorRow}>
                      <div className={styles.avatarWrap}>
                        {(reviewOverlay.detail as any)?.user?.avatarUrl ? (
                          <img src={(reviewOverlay.detail as any).user.avatarUrl} alt="user avatar" className={styles.avatar} />
                        ) : (
                          <span className={styles.avatarFallback}>
                            {((reviewOverlay.detail as any)?.user?.displayName || "U").slice(0, 1).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div>
                        <p className={styles.mainText}>{(reviewOverlay.detail as any)?.user?.displayName || "Unknown"}</p>
                        <p className={styles.subText}>@{(reviewOverlay.detail as any)?.user?.username || "unknown"}</p>
                        <p className={styles.subText}>{(reviewOverlay.detail as any)?.user?.email || "No email"}</p>
                      </div>
                    </div>
                    <div className={styles.reviewStatsGrid}>
                      <article>
                        <p className={styles.reviewInfoLabel}>Status</p>
                        <p className={styles.reviewInfoValue}>{(reviewOverlay.detail as any)?.user?.status || "active"}</p>
                      </article>
                      <article>
                        <p className={styles.reviewInfoLabel}>Strikes</p>
                        <p className={styles.reviewInfoValue}>{String((reviewOverlay.detail as any)?.user?.strikeCount ?? 0)}</p>
                      </article>
                      <article>
                        <p className={styles.reviewInfoLabel}>Muted</p>
                        <p className={styles.reviewInfoValue}>
                          {(reviewOverlay.detail as any)?.user?.interactionMutedIndefinitely || (reviewOverlay.detail as any)?.user?.interactionMutedUntil
                            ? "Yes"
                            : "No"}
                        </p>
                      </article>
                      <article>
                        <p className={styles.reviewInfoLabel}>Limited</p>
                        <p className={styles.reviewInfoValue}>
                          {(reviewOverlay.detail as any)?.user?.accountLimitedIndefinitely || (reviewOverlay.detail as any)?.user?.accountLimitedUntil
                            ? "Yes"
                            : "No"}
                        </p>
                      </article>
                    </div>
                  </>
                ) : null}
              </div>
            ) : null}

            <div className={styles.reviewFooter}>
              <button type="button" className={styles.modalGhost} onClick={closeReviewOverlay}>
                Close
              </button>
              <button type="button" className={styles.modalPrimary} onClick={handleMakeViolationFromReview} disabled={reviewOverlay.loading || Boolean(reviewOverlay.error)}>
                Make as violation
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {modal.open ? (
        <div className={styles.modalOverlay} onClick={() => setModal((prev) => ({ ...prev, open: false }))}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <p className={styles.modalTitle}>Select moderation action</p>
                <p className={styles.modalSubtitle}>Choose reason and action to apply. Severity is optional for warning and suspend.</p>
              </div>
              <button type="button" className={styles.modalClose} onClick={() => setModal((prev) => ({ ...prev, open: false }))} aria-label="Close">
                x
              </button>
            </div>

            <p className={styles.modalTarget}>{modal.targetLabel} · {modal.targetId}</p>

            <div className={styles.reasonLayout}>
              <div className={styles.reasonCategoryGrid}>
                {categoryGroups.map((group) => {
                  const isActive = category === group.key;
                  return (
                    <button
                      key={group.key}
                      className={`${styles.reasonCategoryCard} ${isActive ? styles.reasonCategoryCardActive : ""}`}
                      type="button"
                      onClick={() => {
                        setCategory(group.key);
                        setSeverity(getSuggestedSeverity(group.key));
                        setSelectedReasonKey(group.reasons.length === 1 ? group.reasons[0].key : null);
                        setReason(group.reasons.length === 1 ? group.reasons[0].label : "");
                      }}
                      style={{
                        borderColor: isActive ? group.accent : undefined,
                        boxShadow: isActive ? `0 0 0 1px ${group.accent}` : undefined,
                      }}
                    >
                      <span className={styles.reasonCategoryDot} style={{ background: group.accent }} />
                      <span className={styles.reasonCategoryLabel}>{group.label}</span>
                    </button>
                  );
                })}
              </div>

              <div className={styles.reasonPanel}>
                <div className={styles.reasonPanelHeader}>Select a specific reason</div>
                {selectedCategoryGroup ? (
                  <div className={styles.reasonList}>
                    {selectedCategoryGroup.reasons.map((item) => {
                      const checked = selectedReasonKey === item.key;
                      return (
                        <button
                          key={item.key}
                          className={`${styles.reasonRow} ${checked ? styles.reasonRowActive : ""}`}
                          type="button"
                          onClick={() => {
                            setSelectedReasonKey(item.key);
                            setReason(item.label);
                          }}
                        >
                          <span className={styles.reasonRadio} aria-checked={checked}>
                            {checked ? <span className={styles.reasonRadioDot} /> : null}
                          </span>
                          <span>{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className={styles.reasonPlaceholder}>Pick a category first.</div>
                )}
              </div>
            </div>

            <div className={styles.decisionPanel}>
              <div className={styles.decisionHeader}>Confirm action</div>

              <div className={styles.decisionOptions}>
                {ACTIONS[modal.type].map((option) => (
                  <button
                    key={option.value}
                    className={`${styles.decisionChip} ${action === option.value ? styles.decisionChipActive : ""}`}
                    type="button"
                    onClick={() => setAction(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              {requiresSeverity ? (
                <div className={styles.severitySection}>
                  <div className={styles.severityHeader}>
                    <span className={styles.severityTitle}>Severity level</span>
                    <span className={styles.severityHint}>Suggested: {getSuggestedSeverity(category)} based on selected category</span>
                  </div>
                  <div className={styles.severityGrid}>
                    <button
                      className={`${styles.severityCard} ${styles.severityLow} ${severity === "low" ? styles.severityCardActive : ""}`}
                      type="button"
                      onClick={() => setSeverity("low")}
                    >
                      <span className={styles.severityCardTitle}>Low</span>
                      <span className={styles.severityCardDesc}>Minor impact, keep under observation.</span>
                    </button>
                    <button
                      className={`${styles.severityCard} ${styles.severityMedium} ${severity === "medium" ? styles.severityCardActive : ""}`}
                      type="button"
                      onClick={() => setSeverity("medium")}
                    >
                      <span className={styles.severityCardTitle}>Medium</span>
                      <span className={styles.severityCardDesc}>Harmful behavior, needs stricter moderation action.</span>
                    </button>
                    <button
                      className={`${styles.severityCard} ${styles.severityHigh} ${severity === "high" ? styles.severityCardActive : ""}`}
                      type="button"
                      onClick={() => setSeverity("high")}
                    >
                      <span className={styles.severityCardTitle}>High</span>
                      <span className={styles.severityCardDesc}>Critical risk, immediate and strong enforcement.</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className={styles.reasonPlaceholder}>Warning, mute, and suspend do not require severity selection.</div>
              )}

              <label className={styles.decisionNoteLabel}>
                Moderation reason
                <textarea
                  className={styles.decisionNoteInput}
                  value={reason}
                  onChange={(event) => {
                    setReason(event.target.value);
                    setSelectedReasonKey(null);
                  }}
                  rows={3}
                  placeholder="Add final moderation reasoning for audit logs"
                />
              </label>

              {action === "mute_interaction" ? (
                <div className={styles.durationBox}>
                  <label className={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={muteUntilTurnOn}
                      onChange={(event) => setMuteUntilTurnOn(event.target.checked)}
                    />
                    Mute until manually turned on
                  </label>
                  {!muteUntilTurnOn ? (
                    <input
                      value={muteDurationMinutes}
                      onChange={(event) => setMuteDurationMinutes(event.target.value)}
                      placeholder="Duration in minutes"
                    />
                  ) : null}
                </div>
              ) : null}

              {action === "suspend_user" ? (
                <div className={styles.durationBox}>
                  <label className={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={suspendUntilTurnOn}
                      onChange={(event) => setSuspendUntilTurnOn(event.target.checked)}
                    />
                    Suspend until manually turned on
                  </label>
                  {!suspendUntilTurnOn ? (
                    <input
                      value={suspendDurationMinutes}
                      onChange={(event) => setSuspendDurationMinutes(event.target.value)}
                      placeholder="Duration in minutes"
                    />
                  ) : null}
                </div>
              ) : null}

              {action === "limit_account" ? (
                <div className={styles.durationBox}>
                  <label className={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={limitUntilTurnOn}
                      onChange={(event) => setLimitUntilTurnOn(event.target.checked)}
                    />
                    Limit until manually turned on
                  </label>
                  {!limitUntilTurnOn ? (
                    <input
                      value={limitDurationMinutes}
                      onChange={(event) => setLimitDurationMinutes(event.target.value)}
                      placeholder="Duration in minutes"
                    />
                  ) : null}
                </div>
              ) : null}
            </div>

            {actionSuccess ? <p className={styles.success}>{actionSuccess}</p> : null}
            {actionError ? <p className={styles.error}>{actionError}</p> : null}

            <div className={styles.modalActions}>
              <button type="button" className={styles.modalGhost} onClick={() => setModal((prev) => ({ ...prev, open: false }))}>
                Cancel
              </button>
              <button type="button" className={styles.modalPrimary} onClick={submitModeration} disabled={submitLoading}>
                {submitLoading ? "Saving..." : "Confirm action"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {mediaViewer.open ? (
        <div className={styles.mediaOverlay} onClick={closeMediaViewer}>
          <p className={styles.mediaCounter}>Post media · {mediaViewer.index + 1}/{mediaViewer.media.length}</p>
          <button type="button" className={styles.mediaClose} onClick={closeMediaViewer} aria-label="Close media viewer">
            x
          </button>

          {mediaViewer.media.length > 1 ? (
            <button
              type="button"
              className={`${styles.mediaNavButton} ${styles.mediaNavLeft}`}
              onClick={(event) => {
                event.stopPropagation();
                showPrevMedia();
              }}
              aria-label="Previous media"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M15 18l-6-6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ) : null}

          <div className={styles.mediaStage} onClick={(event) => event.stopPropagation()}>
            {mediaViewer.media[mediaViewer.index]?.type === "video" ? (
              <video
                key={`${mediaViewer.postId}-${mediaViewer.index}`}
                src={getMediaDisplayUrl(mediaViewer.media[mediaViewer.index])}
                className={styles.mediaExpanded}
                controls
                autoPlay
              />
            ) : (
              <img
                key={`${mediaViewer.postId}-${mediaViewer.index}`}
                src={getMediaDisplayUrl(mediaViewer.media[mediaViewer.index])}
                alt="Expanded post media"
                className={styles.mediaExpanded}
              />
            )}
          </div>

          {mediaViewer.media.length > 1 ? (
            <button
              type="button"
              className={`${styles.mediaNavButton} ${styles.mediaNavRight}`}
              onClick={(event) => {
                event.stopPropagation();
                showNextMedia();
              }}
              aria-label="Next media"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
