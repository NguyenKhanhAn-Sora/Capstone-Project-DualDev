"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import styles from "./review.module.css";
import { getApiBaseUrl, getWebBaseUrl } from "@/lib/api";
import ImageViewerOverlay from "../../image-viewer-overlay";

type ReportType = "post" | "comment" | "user";
type SeverityLevel = "low" | "medium" | "high";
type DecisionMode = "enforcement" | "dismiss";
type DecisionActionKey =
  | "violation"
  | "remove_post"
  | "restrict_post"
  | "delete_comment"
  | "warn"
  | "mute_interaction"
  | "suspend_user"
  | "limit_account"
  | "no_violation";
type MuteDurationOption = {
  key: string;
  label: string;
  minutes: number | null;
  untilTurnOn?: boolean;
};

type ModerationHistoryItem = {
  note: string | null;
  action: string;
  severity: SeverityLevel | null;
  moderatorDisplayName: string | null;
  moderatorUsername: string | null;
  moderatorEmail: string | null;
  resolvedAt: string | null;
};

type ReporterSummaryItem = {
  reporterId: string;
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
  trustWeight: number;
  reportsForTarget30d: number;
  latestReportAt: string | null;
};

type ReportDetailPayload = {
  targetId: string;
  score: number;
  uniqueReporters: number;
  topReason: string;
  categories: string[];
  categoryBreakdown: Array<{
    category: string;
    count: number;
    percent: number;
  }>;
  totalReports: number;
  velocity: {
    reportsLast1h: number;
    reportsLast24h: number;
    perHourLast24h: number;
  };
  reporterMix: {
    weightedAverage: number | null;
    highTrustCount: number;
    highTrustRatio: number | null;
  };
  moderationHistory: ModerationHistoryItem[];
  reporterSummary: ReporterSummaryItem[];
  postPreview?: {
    authorDisplayName: string | null;
    authorUsername: string | null;
    authorAvatarUrl: string | null;
    authorIsCreator: boolean;
    content: string;
    media: Array<{ type: "image" | "video"; url: string }>;
    createdAt: string | null;
    visibility: string;
  } | null;
  commentPreview?: {
    authorDisplayName: string | null;
    authorUsername: string | null;
    authorAvatarUrl: string | null;
    authorIsCreator: boolean;
    content: string;
    media: { type: "image" | "video"; url: string } | null;
    createdAt: string | null;
    postId: string | null;
    postExcerpt: string | null;
    postMedia: Array<{ type: "image" | "video"; url: string }>;
    postCreatedAt: string | null;
    postAuthorAvatarUrl: string | null;
    postAuthorUsername: string | null;
    postAuthorDisplayName: string | null;
    postAuthorIsCreator: boolean;
  } | null;
  userPreview?: {
    displayName: string | null;
    username: string | null;
    avatarUrl: string | null;
    isCreator: boolean;
    bio: string | null;
    location: string | null;
    workplace: string | null;
    joinedAt: string | null;
    status: string | null;
    stats: {
      postsCount: number;
      followersCount: number;
      followingCount: number;
    } | null;
  } | null;
  latestModeration?: ModerationHistoryItem | null;
  autoModeration?: {
    pendingReview: boolean;
    hiddenAt: string | null;
    hiddenUntil: string | null;
    escalatedPriority: boolean;
    escalatedAt: string | null;
  };
};

const MODAL_CLOSE_ANIMATION_MS = 180;
const RESOLVE_RELOAD_DELAY_MS = 2000;

type AdminPayload = {
  roles?: string[];
  exp?: number;
};

const decodeJwt = (token: string): AdminPayload | null => {
  try {
    const payload = token.split(".")[1];
    const json = JSON.parse(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/")),
    );
    return json as AdminPayload;
  } catch {
    return null;
  }
};

const getTypeLabel = (value: string): ReportType => {
  if (value === "comment" || value === "user" || value === "post") {
    return value;
  }
  return "post";
};

const getSuggestedSeverity = (category: string | null): SeverityLevel => {
  if (!category) return "medium";
  if (["violence", "illegal", "privacy"].includes(category)) {
    return "high";
  }
  if (["abuse", "sensitive", "misinfo"].includes(category)) {
    return "medium";
  }
  return "low";
};

const formatModerationKey = (value: string | null | undefined): string => {
  if (!value) return "--";
  return value
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

function CollapsibleCaption({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);
  const textRef = useRef<HTMLParagraphElement | null>(null);

  useEffect(() => {
    setExpanded(false);
    const element = textRef.current;
    if (!element) {
      setHasOverflow(false);
      return;
    }

    // Measure overflow while text is clamped to 3 lines.
    const overflow = element.scrollHeight > element.clientHeight + 1;
    setHasOverflow(overflow);
  }, [text]);

  return (
    <>
      <p
        ref={textRef}
        className={`${className ?? ""} ${
          expanded ? styles.collapsibleTextExpanded : styles.collapsibleText
        }`}
      >
        {text}
      </p>
      {hasOverflow ? (
        <button
          type="button"
          className={styles.textToggle}
          onClick={() => setExpanded((prev) => !prev)}
        >
          {expanded ? "Collapse" : "See more"}
        </button>
      ) : null}
    </>
  );
}

function DisplayNameWithCreator({
  name,
  isCreator,
  className,
}: {
  name: string;
  isCreator?: boolean;
  className: string;
}) {
  return (
    <p className={`${className} ${styles.nameWithCreator}`}>
      <span>{name}</span>
      {isCreator ? (
        <span className={styles.creatorTick} aria-label="Creator account" />
      ) : null}
    </p>
  );
}

export default function ReportReviewPage() {
  const router = useRouter();
  const params = useParams();
  const type = getTypeLabel(String(params?.type ?? "post"));
  const targetId = String(params?.id ?? "unknown");
  const [ready, setReady] = useState(false);
  const [reasonOpen, setReasonOpen] = useState(false);
  const [reasonClosing, setReasonClosing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const [selectedSeverity, setSelectedSeverity] =
    useState<SeverityLevel | null>(null);
  const [decisionMode, setDecisionMode] =
    useState<DecisionMode>("enforcement");
  const [decisionNote, setDecisionNote] = useState("");
  const [selectedMuteDurationMinutes, setSelectedMuteDurationMinutes] =
    useState<number>(24 * 60);
  const [muteUntilTurnOn, setMuteUntilTurnOn] = useState(false);
  const [selectedSuspendDurationMinutes, setSelectedSuspendDurationMinutes] =
    useState<number>(24 * 60);
  const [suspendUntilTurnOn, setSuspendUntilTurnOn] = useState(false);
  const [selectedLimitDurationMinutes, setSelectedLimitDurationMinutes] =
    useState<number>(24 * 60);
  const [limitUntilTurnOn, setLimitUntilTurnOn] = useState(false);
  const [decisionSubmitting, setDecisionSubmitting] = useState(false);
  const [rollbackSubmitting, setRollbackSubmitting] = useState(false);
  const [resolveToast, setResolveToast] = useState<string | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [detail, setDetail] = useState<ReportDetailPayload | null>(null);
  const [imageViewerUrl, setImageViewerUrl] = useState<string | null>(null);
  const [historyFilter, setHistoryFilter] = useState<"all" | "severe">("all");

  const headerTitle =
    type === "post"
      ? "Post review"
      : type === "comment"
        ? "Comment review"
        : "User review";

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
    if (!ready || typeof window === "undefined") return;
    const token = localStorage.getItem("adminAccessToken") || "";
    if (!token) return;

    const loadDetail = async () => {
      try {
        const response = await fetch(
          `${getApiBaseUrl()}/admin/reports/${type}/${targetId}`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );

        if (!response.ok) {
          throw new Error("Failed to load report detail");
        }

        const payload = (await response.json()) as ReportDetailPayload;
        setDetail(payload);
      } catch (_err) {
        setDetail(null);
      }
    };

    loadDetail();
  }, [ready, type, targetId]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
      if (reloadTimerRef.current) {
        clearTimeout(reloadTimerRef.current);
      }
    };
  }, []);

  if (!ready) return null;

  const formatNumber = (value?: number) =>
    typeof value === "number" ? value.toLocaleString() : "--";

  const formatScore = (value?: number) =>
    typeof value === "number" ? value.toFixed(1) : "--";

  const formatPercent = (value?: number | null) =>
    typeof value === "number" ? `${value.toFixed(1)}%` : "--";

  const formatTime = (value?: string | null) => {
    if (!value) return "--";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "--";
    return date.toLocaleString();
  };

  const webBaseUrl = getWebBaseUrl();
  const buildPostUrl = (postId?: string | null) =>
    postId ? `${webBaseUrl}/post/${postId}` : null;
  const buildProfileUrl = (userId?: string | null) =>
    userId ? `${webBaseUrl}/profile/${userId}` : null;
  const topCategoryBreakdown = detail?.categoryBreakdown?.[0] ?? null;
  const categorySignal = topCategoryBreakdown
    ? `${formatModerationKey(topCategoryBreakdown.category)} (${formatPercent(topCategoryBreakdown.percent)})`
    : "--";
  const reporterSignal = detail?.reporterMix
    ? `W.avg ${
        detail.reporterMix.weightedAverage !== null
          ? detail.reporterMix.weightedAverage.toFixed(2)
          : "--"
      } · ${formatPercent(detail.reporterMix.highTrustRatio)} high-trust`
    : `${formatNumber(detail?.uniqueReporters)} unique reporters`;
  const velocitySignal = detail?.velocity
    ? `${formatNumber(detail.velocity.reportsLast1h)} reports / 1h`
    : "--";
  const getReporterTrustLabel = (trustWeight: number) => {
    if (trustWeight >= 0.8) return "high";
    if (trustWeight >= 0.6) return "medium";
    return "low";
  };
  const severeHistoryActions = new Set([
    "suspend_user",
    "limit_account",
    "delete_comment",
    "remove_post",
    "restrict_post",
  ]);
  const historyItems = detail?.moderationHistory ?? [];
  const filteredHistoryItems =
    historyFilter === "severe"
      ? historyItems.filter((item) => severeHistoryActions.has(item.action))
      : historyItems;
  const reportGroups = [
    {
      key: "abuse",
      label: "Harassment / Hate speech",
      accent: "#f59e0b",
      reasons: [
        { key: "harassment", label: "Targets an individual to harass" },
        { key: "hate_speech", label: "Hate speech or discrimination" },
        {
          key: "offensive_discrimination",
          label: "Attacks vulnerable groups",
        },
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
  ];
  const activeGroup = reportGroups.find(
    (group) => group.key === selectedCategory,
  );
  const dismissReasons = [
    { key: "no_violation", label: "No policy violation found" },
    { key: "duplicate_report", label: "Duplicate report" },
    { key: "out_of_scope", label: "Out of moderation scope" },
    { key: "insufficient_evidence", label: "Insufficient evidence" },
  ];
  const decisionActions =
    type === "post"
      ? [
          { key: "violation", label: "Mark as violation" },
          { key: "remove_post", label: "Remove post" },
          { key: "restrict_post", label: "Restrict reach" },
          { key: "warn", label: "Warn author" },
        ]
      : type === "comment"
        ? [
            { key: "violation", label: "Mark as violation" },
            { key: "delete_comment", label: "Delete comment" },
            { key: "warn", label: "Warn author" },
            { key: "mute_interaction", label: "Mute interaction" },
          ]
        : [
            { key: "violation", label: "Mark as violation" },
            { key: "suspend_user", label: "Suspend account" },
            { key: "limit_account", label: "Limit account" },
            { key: "warn", label: "Warn user" },
            { key: "mute_interaction", label: "Mute interaction" },
          ];
  const muteDurationOptions: MuteDurationOption[] = [
    { key: "1h", label: "1 hour", minutes: 60 },
    { key: "6h", label: "6 hours", minutes: 6 * 60 },
    { key: "12h", label: "12 hours", minutes: 12 * 60 },
    { key: "24h", label: "24 hours", minutes: 24 * 60 },
    { key: "3d", label: "3 days", minutes: 3 * 24 * 60 },
    { key: "7d", label: "7 days", minutes: 7 * 24 * 60 },
    {
      key: "until_turn_on",
      label: "Until turn on",
      minutes: null,
      untilTurnOn: true,
    },
  ];
  const requiresSeverity =
    decisionMode === "enforcement" &&
    selectedAction !== "warn" &&
    selectedAction !== "mute_interaction" &&
    selectedAction !== "suspend_user";
  const requiresMuteDuration =
    decisionMode === "enforcement" && selectedAction === "mute_interaction";
  const requiresSuspendDuration =
    decisionMode === "enforcement" && selectedAction === "suspend_user";
  const requiresLimitDuration =
    decisionMode === "enforcement" && selectedAction === "limit_account";
  const selectedReasonLabel = (() => {
    if (!selectedReason) return "--";
    const dismissMatch = dismissReasons.find((item) => item.key === selectedReason);
    if (dismissMatch) return dismissMatch.label;
    for (const group of reportGroups) {
      const reasonMatch = group.reasons.find((item) => item.key === selectedReason);
      if (reasonMatch) return reasonMatch.label;
    }
    return formatModerationKey(selectedReason);
  })();
  const openReasonPicker = (preferredAction?: DecisionActionKey) => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setReasonClosing(false);
    setDecisionMode("enforcement");
    const initialCategory = reportGroups.find(
      (group) => group.key === detail?.topReason,
    )?.key;
    const nextCategory = initialCategory ?? reportGroups[0]?.key ?? null;
    setSelectedCategory(nextCategory);
    const nextGroup = reportGroups.find((group) => group.key === nextCategory);
    setSelectedReason(
      nextGroup && nextGroup.reasons.length === 1
        ? nextGroup.reasons[0].key
        : null,
    );
    setSelectedSeverity(getSuggestedSeverity(nextCategory));
    const resolvedAction =
      preferredAction && decisionActions.some((item) => item.key === preferredAction)
        ? preferredAction
        : (decisionActions[0]?.key ?? null);
    setSelectedAction(resolvedAction);
    setSelectedMuteDurationMinutes(24 * 60);
    setMuteUntilTurnOn(false);
    setSelectedSuspendDurationMinutes(24 * 60);
    setSuspendUntilTurnOn(false);
    setSelectedLimitDurationMinutes(24 * 60);
    setLimitUntilTurnOn(false);
    setDecisionNote("");
    setReasonOpen(true);
  };
  const openDismissPicker = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setReasonClosing(false);
    setDecisionMode("dismiss");
    setSelectedCategory("other");
    setSelectedReason("no_violation");
    setSelectedSeverity(null);
    setSelectedAction("no_violation");
    setSelectedSuspendDurationMinutes(24 * 60);
    setSuspendUntilTurnOn(false);
    setSelectedLimitDurationMinutes(24 * 60);
    setLimitUntilTurnOn(false);
    setDecisionNote("");
    setReasonOpen(true);
  };
  const closeReasonPicker = () => {
    if (!reasonOpen || reasonClosing) return;
    setReasonClosing(true);
    closeTimerRef.current = setTimeout(() => {
      setReasonOpen(false);
      setReasonClosing(false);
      closeTimerRef.current = null;
    }, MODAL_CLOSE_ANIMATION_MS);
  };
  const confirmReason = async () => {
    if (!selectedAction) return;
    if (
      decisionMode === "enforcement" &&
      (!selectedCategory || !selectedReason || (requiresSeverity && !selectedSeverity))
    ) {
      return;
    }
    if (requiresMuteDuration && !selectedMuteDurationMinutes && !muteUntilTurnOn) {
      return;
    }
    if (
      requiresSuspendDuration &&
      !selectedSuspendDurationMinutes &&
      !suspendUntilTurnOn
    ) {
      return;
    }
    if (decisionMode === "dismiss" && !selectedReason) return;
    if (
      requiresLimitDuration &&
      !selectedLimitDurationMinutes &&
      !limitUntilTurnOn
    ) {
      return;
    }

    const token =
      typeof window !== "undefined"
        ? localStorage.getItem("adminAccessToken") || ""
        : "";
    if (!token) return;

    try {
      setDecisionSubmitting(true);
      const response = await fetch(
        `${getApiBaseUrl()}/admin/reports/${type}/${targetId}/resolve`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            action: selectedAction,
            category:
              decisionMode === "dismiss"
                ? "other"
                : (selectedCategory ?? "other"),
            reason: selectedReason,
            severity:
              decisionMode === "dismiss" || !requiresSeverity
                ? null
                : selectedSeverity ?? null,
            muteDurationMinutes:
              decisionMode === "dismiss" || !requiresMuteDuration
                ? null
                : (muteUntilTurnOn ? null : selectedMuteDurationMinutes),
            muteUntilTurnOn:
              decisionMode === "dismiss" || !requiresMuteDuration
                ? null
                : muteUntilTurnOn,
            suspendDurationMinutes:
              decisionMode === "dismiss" || !requiresSuspendDuration
                ? null
                : (suspendUntilTurnOn ? null : selectedSuspendDurationMinutes),
            suspendUntilTurnOn:
              decisionMode === "dismiss" || !requiresSuspendDuration
                ? null
                : suspendUntilTurnOn,
            limitDurationMinutes:
              decisionMode === "dismiss" || !requiresLimitDuration
                ? null
                : (limitUntilTurnOn ? null : selectedLimitDurationMinutes),
            limitUntilTurnOn:
              decisionMode === "dismiss" || !requiresLimitDuration
                ? null
                : limitUntilTurnOn,
            note: decisionNote?.trim() || null,
          }),
        },
      );

      if (!response.ok) {
        throw new Error("Failed to resolve report");
      }

      const result = (await response.json()) as {
        status?: "ok" | "already_resolved";
      };

      if (result.status === "already_resolved") {
        closeReasonPicker();
        setResolveToast("No open reports left for this target.");
        if (reloadTimerRef.current) {
          clearTimeout(reloadTimerRef.current);
        }
        reloadTimerRef.current = setTimeout(() => {
          if (typeof window !== "undefined") {
            window.location.reload();
          }
        }, RESOLVE_RELOAD_DELAY_MS);
        return;
      }

      closeReasonPicker();
      setResolveToast("Report resolved successfully. Refreshing...");
      if (reloadTimerRef.current) {
        clearTimeout(reloadTimerRef.current);
      }
      reloadTimerRef.current = setTimeout(() => {
        if (typeof window !== "undefined") {
          window.location.reload();
        }
      }, RESOLVE_RELOAD_DELAY_MS);
    } finally {
      setDecisionSubmitting(false);
    }
  };

  const rollbackAutoHide = async () => {
    const token =
      typeof window !== "undefined"
        ? localStorage.getItem("adminAccessToken") || ""
        : "";
    if (!token) return;

    try {
      setRollbackSubmitting(true);
      const response = await fetch(
        `${getApiBaseUrl()}/admin/reports/${type}/${targetId}/rollback-auto-hide`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            note: "Rollback auto-hidden content and mark no violation",
          }),
        },
      );

      if (!response.ok) {
        throw new Error("Failed to rollback auto-hidden item");
      }

      setResolveToast("Content restored and marked as no violation. Refreshing...");
      if (reloadTimerRef.current) {
        clearTimeout(reloadTimerRef.current);
      }
      reloadTimerRef.current = setTimeout(() => {
        if (typeof window !== "undefined") {
          window.location.reload();
        }
      }, RESOLVE_RELOAD_DELAY_MS);
    } finally {
      setRollbackSubmitting(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.topbar}>
          <div className={styles.titleGroup}>
            <span className={styles.eyebrow}>Moderation</span>
            <h1 className={styles.title}>{headerTitle}</h1>
            <p className={styles.subtitle}>
              Review context, decide next actions, and document outcomes.
            </p>
          </div>
          <div className={styles.topActions}>
            <Link href="/report" className={styles.ghostButton}>
              Back to report center
            </Link>
          </div>
        </header>

        <section className={styles.summaryBar}>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Report type</span>
            <span className={styles.summaryValue}>{type}</span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Target ID</span>
            <span className={styles.summaryValue}>
              {detail?.targetId ?? targetId}
            </span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Severity score</span>
            <span className={styles.summaryValue}>
              {formatScore(detail?.score)}
            </span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Unique reporters</span>
            <span className={styles.summaryValue}>
              {formatNumber(detail?.uniqueReporters)}
            </span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Top reason</span>
            <span className={styles.summaryValue}>
              {formatModerationKey(detail?.topReason)}
            </span>
          </div>
        </section>

        <section className={styles.layout}>
          <div className={styles.mainColumn}>
            {type === "post" && (
              <section className={styles.panel}>
                <div className={styles.panelHeader}>
                  <h2 className={styles.panelTitle}>Post preview</h2>
                  <div className={styles.panelActions}>
                    <span
                      className={`${styles.panelTag} ${
                        detail?.postPreview?.visibility === "private"
                          ? styles.tagPrivate
                          : detail?.postPreview?.visibility === "followers"
                            ? styles.tagFollowers
                            : styles.tagPublic
                      }`}
                    >
                      {detail?.postPreview?.visibility ?? "public"}
                    </span>
                    {buildPostUrl(detail?.targetId ?? targetId) ? (
                      <a
                        className={styles.linkButton}
                        href={buildPostUrl(detail?.targetId ?? targetId) ?? "#"}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open post
                      </a>
                    ) : null}
                  </div>
                </div>
                <div className={styles.postCard}>
                  <div className={styles.postHeader}>
                    {detail?.postPreview?.authorAvatarUrl ? (
                      <img
                        className={styles.avatarImage}
                        src={detail.postPreview.authorAvatarUrl}
                        alt="Author avatar"
                      />
                    ) : (
                      <div className={styles.avatar}></div>
                    )}
                    <div>
                      <DisplayNameWithCreator
                        className={styles.postAuthor}
                        name={detail?.postPreview?.authorDisplayName ?? "--"}
                        isCreator={detail?.postPreview?.authorIsCreator}
                      />
                      <p className={styles.postMeta}>
                        @{detail?.postPreview?.authorUsername ?? "unknown"} ·
                        Posted {formatTime(detail?.postPreview?.createdAt)}
                      </p>
                    </div>
                  </div>
                  {detail?.postPreview?.content?.trim() ? (
                    <CollapsibleCaption
                      className={styles.postContent}
                      text={detail.postPreview.content}
                    />
                  ) : null}
                  {(detail?.postPreview?.media ?? []).length > 0 ? (
                    <div className={styles.mediaGrid}>
                      {(detail?.postPreview?.media ?? []).map((item) => (
                        <div className={styles.mediaItem} key={item.url}>
                          {item.type === "image" ? (
                            <img
                              className={styles.mediaImage}
                              src={item.url}
                              alt="Post media"
                              loading="lazy"
                              onClick={() => setImageViewerUrl(item.url)}
                            />
                          ) : (
                            <video
                              className={styles.mediaVideo}
                              controls
                              preload="metadata"
                            >
                              <source src={item.url} />
                            </video>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </section>
            )}

            {type === "comment" && (
              <section className={styles.panel}>
                <div className={styles.panelHeader}>
                  <h2 className={styles.panelTitle}>Comment context</h2>
                  <div className={styles.panelActions}>
                    <span className={styles.panelTag}>Thread</span>
                    {buildPostUrl(detail?.commentPreview?.postId) ? (
                      <a
                        className={styles.linkButton}
                        href={
                          buildPostUrl(detail?.commentPreview?.postId) ?? "#"
                        }
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open post
                      </a>
                    ) : null}
                  </div>
                </div>
                <div className={styles.threadBlock}>
                  <h3 className={styles.contextTitle}>Parent post</h3>
                  <div className={styles.postCard}>
                    <div className={styles.postHeader}>
                      {detail?.commentPreview?.postAuthorAvatarUrl ? (
                        <img
                          className={styles.avatarImage}
                          src={detail.commentPreview.postAuthorAvatarUrl}
                          alt="Author avatar"
                        />
                      ) : (
                        <div className={styles.avatar}></div>
                      )}
                      <div>
                        <DisplayNameWithCreator
                          className={styles.postAuthor}
                          name={
                            detail?.commentPreview?.postAuthorDisplayName ??
                            "--"
                          }
                          isCreator={detail?.commentPreview?.postAuthorIsCreator}
                        />
                        <p className={styles.postMeta}>
                          @
                          {detail?.commentPreview?.postAuthorUsername ??
                            "unknown"}
                          · Posted{" "}
                          {formatTime(detail?.commentPreview?.postCreatedAt)}
                        </p>
                      </div>
                    </div>
                    {detail?.commentPreview?.postExcerpt?.trim() ? (
                      <CollapsibleCaption
                        className={styles.postContent}
                        text={detail.commentPreview.postExcerpt}
                      />
                    ) : null}
                    {(detail?.commentPreview?.postMedia ?? []).length > 0 ? (
                      <div className={styles.mediaGrid}>
                        {(detail?.commentPreview?.postMedia ?? []).map(
                          (item) => (
                            <div className={styles.mediaItem} key={item.url}>
                              {item.type === "image" ? (
                                <img
                                  className={styles.mediaImage}
                                  src={item.url}
                                  alt="Parent post media"
                                  loading="lazy"
                                  onClick={() => setImageViewerUrl(item.url)}
                                />
                              ) : (
                                <video
                                  className={styles.mediaVideo}
                                  controls
                                  preload="metadata"
                                >
                                  <source src={item.url} />
                                </video>
                              )}
                            </div>
                          ),
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className={styles.postCard}>
                  <div className={styles.postHeader}>
                    {detail?.commentPreview?.authorAvatarUrl ? (
                      <img
                        className={styles.avatarImage}
                        src={detail.commentPreview.authorAvatarUrl}
                        alt="Comment author avatar"
                      />
                    ) : (
                      <div className={styles.avatar}></div>
                    )}
                    <div>
                      <DisplayNameWithCreator
                        className={styles.postAuthor}
                        name={
                          detail?.commentPreview?.authorDisplayName ?? "--"
                        }
                        isCreator={detail?.commentPreview?.authorIsCreator}
                      />
                      <p className={styles.postMeta}>
                        @{detail?.commentPreview?.authorUsername ?? "unknown"} ·
                        Commented{" "}
                        {formatTime(detail?.commentPreview?.createdAt)}
                      </p>
                    </div>
                  </div>
                  {detail?.commentPreview?.content?.trim() ? (
                    <p className={styles.postContent}>
                      {detail.commentPreview.content}
                    </p>
                  ) : null}
                  {detail?.commentPreview?.media ? (
                    <div className={styles.mediaGrid}>
                      <div className={styles.mediaItem}>
                        {detail.commentPreview.media.type === "image" ? (
                          <img
                            className={styles.mediaImage}
                            src={detail.commentPreview.media.url}
                            alt="Comment media"
                            loading="lazy"
                            onClick={() =>
                              setImageViewerUrl(
                                detail.commentPreview?.media?.url ?? null,
                              )
                            }
                          />
                        ) : (
                          <video
                            className={styles.mediaVideo}
                            controls
                            preload="metadata"
                          >
                            <source src={detail.commentPreview.media.url} />
                          </video>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              </section>
            )}

            {type === "user" && (
              <section className={styles.panel}>
                <div className={styles.panelHeader}>
                  <h2 className={styles.panelTitle}>User profile</h2>
                  <div className={styles.panelActions}>
                    <span className={styles.panelTag}>Account</span>
                    {buildProfileUrl(detail?.targetId ?? targetId) ? (
                      <a
                        className={styles.linkButton}
                        href={
                          buildProfileUrl(detail?.targetId ?? targetId) ?? "#"
                        }
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open profile
                      </a>
                    ) : null}
                  </div>
                </div>
                <div className={styles.userCard}>
                  <div className={styles.userHeader}>
                    {detail?.userPreview?.avatarUrl ? (
                      <img
                        className={styles.avatarLargeImage}
                        src={detail.userPreview.avatarUrl}
                        alt="User avatar"
                      />
                    ) : (
                      <div className={styles.avatarLarge}></div>
                    )}
                    <div>
                      <DisplayNameWithCreator
                        className={styles.userName}
                        name={detail?.userPreview?.displayName ?? "--"}
                        isCreator={detail?.userPreview?.isCreator}
                      />
                      <p className={styles.userHandle}>
                        @{detail?.userPreview?.username ?? "unknown"}
                      </p>
                      <p className={styles.userMeta}>
                        Joined {formatTime(detail?.userPreview?.joinedAt)}
                      </p>
                      {detail?.userPreview?.status ? (
                        <span className={styles.userStatus}>
                          {detail.userPreview.status}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  {detail?.userPreview?.bio?.trim() ? (
                    <p className={styles.userBio}>{detail.userPreview.bio}</p>
                  ) : null}
                  <div className={styles.userStats}>
                    <div>
                      <span className={styles.userStatValue}>
                        {formatNumber(detail?.userPreview?.stats?.postsCount)}
                      </span>
                      <span className={styles.userStatLabel}> Posts</span>
                    </div>
                    <div>
                      <span className={styles.userStatValue}>
                        {formatNumber(
                          detail?.userPreview?.stats?.followersCount,
                        )}
                      </span>
                      <span className={styles.userStatLabel}> Followers</span>
                    </div>
                    <div>
                      <span className={styles.userStatValue}>
                        {formatNumber(
                          detail?.userPreview?.stats?.followingCount,
                        )}
                      </span>
                      <span className={styles.userStatLabel}> Following</span>
                    </div>
                  </div>
                </div>
              </section>
            )}

            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <h2 className={styles.panelTitle}>Report signals</h2>
                <span className={styles.panelTag}>Weighted</span>
              </div>
              <div className={styles.signalGrid}>
                <div className={styles.signalCard}>
                  <span className={styles.signalLabel}>Categories</span>
                  <span className={styles.signalValue}>{categorySignal}</span>
                  <span className={styles.signalMeta}>
                    {detail?.categoryBreakdown?.length
                      ? `${formatNumber(detail.categoryBreakdown[0].count)} / ${formatNumber(detail.totalReports)} open reports`
                      : "No open reports in the last 30 days"}
                  </span>
                </div>
                <div className={styles.signalCard}>
                  <span className={styles.signalLabel}>Reporter mix</span>
                  <span className={styles.signalValue}>{reporterSignal}</span>
                  <span className={styles.signalMeta}>
                    {formatNumber(detail?.uniqueReporters)} unique reporters
                  </span>
                </div>
                <div className={styles.signalCard}>
                  <span className={styles.signalLabel}>Velocity</span>
                  <span className={styles.signalValue}>{velocitySignal}</span>
                  <span className={styles.signalMeta}>
                    {detail?.velocity
                      ? `${formatNumber(detail.velocity.reportsLast24h)} reports / 24h · ${detail.velocity.perHourLast24h.toFixed(2)} avg per hour`
                      : "No open reports in the last 24 hours"}
                  </span>
                </div>
              </div>
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <h2 className={styles.panelTitle}>History</h2>
                <div className={styles.panelActions}>
                  <span className={styles.panelTag}>Last 10 actions</span>
                  <div className={styles.historyFilterGroup}>
                    <button
                      type="button"
                      className={`${styles.historyFilterButton} ${
                        historyFilter === "all"
                          ? styles.historyFilterButtonActive
                          : ""
                      }`}
                      onClick={() => setHistoryFilter("all")}
                    >
                      All
                    </button>
                    <button
                      type="button"
                      className={`${styles.historyFilterButton} ${
                        historyFilter === "severe"
                          ? styles.historyFilterButtonActive
                          : ""
                      }`}
                      onClick={() => setHistoryFilter("severe")}
                    >
                      Severe only
                    </button>
                  </div>
                </div>
              </div>
              <div className={styles.historyList}>
                {filteredHistoryItems.length > 0 ? (
                  filteredHistoryItems.map((item, index) => (
                    <div className={styles.historyItem} key={`${item.action}-${item.resolvedAt ?? index}`}>
                      <span className={styles.historyActor}>
                        {item.moderatorDisplayName ||
                          (item.moderatorUsername
                            ? `@${item.moderatorUsername}`
                            : item.moderatorEmail || "--")}
                      </span>
                      <span>
                        {formatModerationKey(item.action)}
                        {item.severity ? ` (${item.severity.toUpperCase()})` : ""}
                        {item.note?.trim() ? ` · ${item.note.trim()}` : ""}
                      </span>
                      <span className={styles.historyTime}>
                        {formatTime(item.resolvedAt)}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className={styles.noteHint}>
                    {historyFilter === "severe"
                      ? "No severe moderation actions found for this target."
                      : "No moderation history available yet for this target."}
                  </div>
                )}
              </div>
            </section>
          </div>

          <aside className={styles.sideColumn}>
            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <h2 className={styles.panelTitle}>Decision</h2>
                <span className={styles.panelTag}>Required</span>
              </div>
              {detail?.autoModeration?.pendingReview ? (
                <div className={styles.noteHint}>
                  Auto-hidden pending review until {formatTime(detail.autoModeration.hiddenUntil)}
                  {detail.autoModeration.escalatedPriority
                    ? " · Escalated priority"
                    : ""}
                </div>
              ) : null}
              <div className={styles.actionStack}>
                <button
                  className={styles.actionPrimary}
                  type="button"
                  onClick={() => openReasonPicker()}
                >
                  Resolve report
                </button>
                <button
                  className={styles.actionGhost}
                  type="button"
                  onClick={openDismissPicker}
                >
                  Dismiss report
                </button>
                {(type === "post" || type === "comment") &&
                detail?.autoModeration?.pendingReview ? (
                  <button
                    className={styles.actionRestore}
                    type="button"
                    onClick={rollbackAutoHide}
                    disabled={rollbackSubmitting}
                  >
                    {rollbackSubmitting
                      ? "Restoring..."
                      : "Restore + mark no_violation"}
                  </button>
                ) : null}
                {type === "post" && (
                  <button
                    className={styles.actionMuted}
                    type="button"
                    onClick={() => openReasonPicker("remove_post")}
                  >
                    Quick remove post
                  </button>
                )}
                {type === "comment" && (
                  <button
                    className={styles.actionMuted}
                    type="button"
                    onClick={() => openReasonPicker("delete_comment")}
                  >
                    Quick delete comment
                  </button>
                )}
                {type === "user" && (
                  <button
                    className={styles.actionMuted}
                    type="button"
                    onClick={() => openReasonPicker("suspend_user")}
                  >
                    Quick suspend account
                  </button>
                )}
              </div>
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <h2 className={styles.panelTitle}>Latest moderation note</h2>
                <span className={styles.panelTag}>Audit</span>
              </div>
              {detail?.latestModeration ? (
                <div className={styles.reporterList}>
                  <div className={styles.reporterRow}>
                    <span>Action</span>
                    <span className={styles.reporterMeta}>
                      {detail.latestModeration.action
                        .replace(/_/g, " ")
                        .replace(/\b\w/g, (char) => char.toUpperCase())}
                    </span>
                  </div>
                  <div className={styles.reporterRow}>
                    <span>Severity</span>
                    <span className={styles.reporterMeta}>
                      {detail.latestModeration.severity
                        ? detail.latestModeration.severity.toUpperCase()
                        : "N/A"}
                    </span>
                  </div>
                  <div className={styles.reporterRow}>
                    <span>Moderator</span>
                    <span className={styles.reporterMeta}>
                      {detail.latestModeration.moderatorDisplayName ||
                        (detail.latestModeration.moderatorUsername
                          ? `@${detail.latestModeration.moderatorUsername}`
                          : detail.latestModeration.moderatorEmail || "--")}
                    </span>
                  </div>
                  <div className={styles.reporterRow}>
                    <span>Handled at</span>
                    <span className={styles.reporterMeta}>
                      {formatTime(detail.latestModeration.resolvedAt)}
                    </span>
                  </div>
                  <div className={styles.noteHint}>
                    {detail.latestModeration.note?.trim() ||
                      "No internal moderation note was added."}
                  </div>
                </div>
              ) : (
                <div className={styles.noteHint}>
                  No moderation note available yet for this target.
                </div>
              )}
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <h2 className={styles.panelTitle}>Reporter summary</h2>
                <span className={styles.panelTag}>Signals</span>
              </div>
              {(detail?.reporterSummary ?? []).length > 0 ? (
                <div className={styles.reporterList}>
                  {(detail?.reporterSummary ?? []).map((item) => (
                    <div className={styles.reporterRow} key={item.reporterId}>
                      <span>
                        {item.username
                          ? `@${item.username}`
                          : item.displayName || item.reporterId}
                      </span>
                      <span className={styles.reporterMeta}>
                        {item.reportsForTarget30d} reports / 30d · trust {item.trustWeight.toFixed(2)} ({getReporterTrustLabel(item.trustWeight)})
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={styles.noteHint}>
                  No reporter profile data available for this target.
                </div>
              )}
            </section>
          </aside>
        </section>
      </div>
      {imageViewerUrl ? (
        <ImageViewerOverlay
          url={imageViewerUrl}
          onClose={() => setImageViewerUrl(null)}
        />
      ) : null}
      {reasonOpen ? (
        <div
          className={`${styles.modalOverlay} ${
            reasonClosing ? styles.modalOverlayClosing : styles.modalOverlayOpen
          }`}
        >
          <div
            className={`${styles.modalCard} ${
              reasonClosing ? styles.modalCardClosing : styles.modalCardOpen
            }`}
          >
            <div className={styles.modalHeader}>
              <div>
                <p className={styles.modalTitle}>
                  {decisionMode === "dismiss"
                    ? "Dismiss report"
                    : "Select moderation action"}
                </p>
                <p className={styles.modalSubtitle}>
                  {decisionMode === "dismiss"
                    ? "Confirm no-violation outcome and record reason for audit."
                    : "Choose reason and action to apply. Severity is optional for warning and suspend."}
                </p>
              </div>
              <button
                className={styles.modalClose}
                type="button"
                onClick={closeReasonPicker}
                aria-label="Close"
              />
            </div>
            {decisionMode === "dismiss" ? (
              <div className={styles.reasonPanel}>
                <div className={styles.reasonPanelHeader}>
                  Select dismiss reason
                </div>
                <div className={styles.reasonList}>
                  {dismissReasons.map((reason) => {
                    const checked = selectedReason === reason.key;
                    return (
                      <button
                        key={reason.key}
                        className={`${styles.reasonRow} ${
                          checked ? styles.reasonRowActive : ""
                        }`}
                        type="button"
                        onClick={() => setSelectedReason(reason.key)}
                      >
                        <span className={styles.reasonRadio} aria-checked={checked}>
                          {checked ? <span className={styles.reasonRadioDot} /> : null}
                        </span>
                        <span>{reason.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className={styles.reasonLayout}>
                <div className={styles.reasonCategoryGrid}>
                  {reportGroups.map((group) => {
                    const isActive = selectedCategory === group.key;
                    return (
                      <button
                        key={group.key}
                        className={`${styles.reasonCategoryCard} ${
                          isActive ? styles.reasonCategoryCardActive : ""
                        }`}
                        type="button"
                        onClick={() => {
                          setSelectedCategory(group.key);
                          setSelectedSeverity(getSuggestedSeverity(group.key));
                          setSelectedReason(
                            group.reasons.length === 1
                              ? group.reasons[0].key
                              : null,
                          );
                        }}
                        style={{
                          borderColor: isActive ? group.accent : undefined,
                          boxShadow: isActive
                            ? `0 0 0 1px ${group.accent}`
                            : undefined,
                        }}
                      >
                        <span
                          className={styles.reasonCategoryDot}
                          style={{ background: group.accent }}
                        />
                        <span className={styles.reasonCategoryLabel}>
                          {group.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className={styles.reasonPanel}>
                  <div className={styles.reasonPanelHeader}>
                    Select a specific reason
                  </div>
                  {activeGroup ? (
                    <div className={styles.reasonList}>
                      {activeGroup.reasons.map((reason) => {
                        const checked = selectedReason === reason.key;
                        return (
                          <button
                            key={reason.key}
                            className={`${styles.reasonRow} ${
                              checked ? styles.reasonRowActive : ""
                            }`}
                            type="button"
                            onClick={() => setSelectedReason(reason.key)}
                          >
                            <span
                              className={styles.reasonRadio}
                              aria-checked={checked}
                            >
                              {checked ? (
                                <span className={styles.reasonRadioDot} />
                              ) : null}
                            </span>
                            <span>{reason.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className={styles.reasonPlaceholder}>
                      Pick a category first.
                    </div>
                  )}
                </div>
              </div>
            )}
            <div className={styles.decisionPanel}>
              <div className={styles.decisionHeader}>Confirm action</div>
              {decisionMode === "enforcement" ? (
                <>
                  <div className={styles.decisionOptions}>
                    {decisionActions.map((action) => (
                      <button
                        key={action.key}
                        className={`${styles.decisionChip} ${
                          selectedAction === action.key
                            ? styles.decisionChipActive
                            : ""
                        }`}
                        type="button"
                        onClick={() => setSelectedAction(action.key)}
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                  {requiresSeverity ? (
                    <div className={styles.severitySection}>
                      <div className={styles.severityHeader}>
                        <span className={styles.severityTitle}>Severity level</span>
                        <span className={styles.severityHint}>
                          Suggested: {getSuggestedSeverity(selectedCategory)} based on
                          selected category
                        </span>
                      </div>
                      <div className={styles.severityGrid}>
                        <button
                          className={`${styles.severityCard} ${styles.severityLow} ${
                            selectedSeverity === "low"
                              ? styles.severityCardActive
                              : ""
                          }`}
                          type="button"
                          onClick={() => setSelectedSeverity("low")}
                        >
                          <span className={styles.severityCardTitle}>Low</span>
                          <span className={styles.severityCardDesc}>
                            Minor impact, keep under observation.
                          </span>
                        </button>
                        <button
                          className={`${styles.severityCard} ${styles.severityMedium} ${
                            selectedSeverity === "medium"
                              ? styles.severityCardActive
                              : ""
                          }`}
                          type="button"
                          onClick={() => setSelectedSeverity("medium")}
                        >
                          <span className={styles.severityCardTitle}>Medium</span>
                          <span className={styles.severityCardDesc}>
                            Harmful behavior, needs stricter moderation action.
                          </span>
                        </button>
                        <button
                          className={`${styles.severityCard} ${styles.severityHigh} ${
                            selectedSeverity === "high"
                              ? styles.severityCardActive
                              : ""
                          }`}
                          type="button"
                          onClick={() => setSelectedSeverity("high")}
                        >
                          <span className={styles.severityCardTitle}>High</span>
                          <span className={styles.severityCardDesc}>
                            Critical risk, immediate and strong enforcement.
                          </span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className={styles.reasonPlaceholder}>
                      {requiresMuteDuration
                        ? "Choose how long interaction mute should remain active."
                        : requiresSuspendDuration
                          ? "Choose how long suspension should remain active."
                        : requiresLimitDuration
                          ? "Choose how long account limit should remain active."
                        : selectedAction === "suspend_user"
                          ? "Suspend account does not require severity selection."
                          : "Warning action does not add strike and does not require severity."}
                    </div>
                  )}
                  {requiresMuteDuration ? (
                    <div className={styles.decisionOptions}>
                      {muteDurationOptions.map((option) => (
                        <button
                          key={option.key}
                          className={`${styles.decisionChip} ${
                            (option.untilTurnOn
                              ? muteUntilTurnOn
                              : !muteUntilTurnOn &&
                                selectedMuteDurationMinutes === option.minutes)
                              ? styles.decisionChipActive
                              : ""
                          }`}
                          type="button"
                          onClick={() => {
                            if (option.untilTurnOn) {
                              setMuteUntilTurnOn(true);
                              return;
                            }
                            setMuteUntilTurnOn(false);
                            setSelectedMuteDurationMinutes(option.minutes ?? 24 * 60);
                          }}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {requiresSuspendDuration ? (
                    <div className={styles.decisionOptions}>
                      {muteDurationOptions.map((option) => (
                        <button
                          key={`suspend-${option.key}`}
                          className={`${styles.decisionChip} ${
                            (option.untilTurnOn
                              ? suspendUntilTurnOn
                              : !suspendUntilTurnOn &&
                                selectedSuspendDurationMinutes === option.minutes)
                              ? styles.decisionChipActive
                              : ""
                          }`}
                          type="button"
                          onClick={() => {
                            if (option.untilTurnOn) {
                              setSuspendUntilTurnOn(true);
                              return;
                            }
                            setSuspendUntilTurnOn(false);
                            setSelectedSuspendDurationMinutes(option.minutes ?? 24 * 60);
                          }}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {requiresLimitDuration ? (
                    <div className={styles.decisionOptions}>
                      {muteDurationOptions.map((option) => (
                        <button
                          key={`limit-${option.key}`}
                          className={`${styles.decisionChip} ${
                            (option.untilTurnOn
                              ? limitUntilTurnOn
                              : !limitUntilTurnOn &&
                                selectedLimitDurationMinutes === option.minutes)
                              ? styles.decisionChipActive
                              : ""
                          }`}
                          type="button"
                          onClick={() => {
                            if (option.untilTurnOn) {
                              setLimitUntilTurnOn(true);
                              return;
                            }
                            setLimitUntilTurnOn(false);
                            setSelectedLimitDurationMinutes(option.minutes ?? 24 * 60);
                          }}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </>
              ) : (
                <div className={styles.reasonPlaceholder}>
                  Report will be resolved as no policy violation and removed from
                  pending queue.
                </div>
              )}
              <label className={styles.decisionNoteLabel}>
                Internal note (optional)
                <textarea
                  className={styles.decisionNoteInput}
                  placeholder="Add brief context or policy reference..."
                  value={decisionNote}
                  onChange={(event) => setDecisionNote(event.target.value)}
                  maxLength={500}
                />
              </label>
              <div className={styles.decisionSummary}>
                <span>Reason: {selectedReasonLabel}</span>
                <span>Action: {selectedAction ?? "--"}</span>
                <span>
                  Severity: {decisionMode === "dismiss" || !requiresSeverity ? "N/A" : (selectedSeverity ?? "--")}
                </span>
                <span>
                  Duration: {(requiresMuteDuration || requiresSuspendDuration || requiresLimitDuration)
                    ? (requiresMuteDuration
                        ? (muteUntilTurnOn
                            ? "Until turn on"
                            : `${selectedMuteDurationMinutes} minutes`)
                        : requiresSuspendDuration
                          ? (suspendUntilTurnOn
                              ? "Until turn on"
                              : `${selectedSuspendDurationMinutes} minutes`)
                        : (limitUntilTurnOn
                            ? "Until turn on"
                            : `${selectedLimitDurationMinutes} minutes`))
                    : "N/A"}
                </span>
              </div>
            </div>
            <div className={styles.modalActions}>
              <button
                className={styles.modalGhost}
                type="button"
                onClick={closeReasonPicker}
              >
                Cancel
              </button>
              <button
                className={styles.modalPrimary}
                type="button"
                onClick={confirmReason}
                disabled={
                  !selectedAction ||
                  !selectedReason ||
                  (decisionMode === "enforcement" &&
                    (!selectedCategory ||
                      (requiresSeverity && !selectedSeverity) ||
                      (requiresMuteDuration &&
                        !selectedMuteDurationMinutes &&
                        !muteUntilTurnOn) ||
                      (requiresSuspendDuration &&
                        !selectedSuspendDurationMinutes &&
                        !suspendUntilTurnOn) ||
                      (requiresLimitDuration &&
                        !selectedLimitDurationMinutes &&
                        !limitUntilTurnOn))) ||
                  decisionSubmitting
                }
              >
                {decisionSubmitting ? "Saving..." : "Confirm action"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {resolveToast ? <div className={styles.resolveToast}>{resolveToast}</div> : null}
    </div>
  );
}
