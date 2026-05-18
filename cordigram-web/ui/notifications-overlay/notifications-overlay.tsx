"use client";

import Image from "next/image";
import { JSX, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import styles from "./notifications-overlay.module.css";
import {
  deleteNotification,
  fetchNotifications,
  logoutLoginDevice,
  markAllNotificationsRead,
  markNotificationRead,
  markNotificationUnread,
  updatePostNotificationMute,
  type NotificationCategoryKey,
  type NotificationItem,
} from "@/lib/api";
import { getStoredAccessToken } from "@/lib/auth";
import {
  NOTIFICATION_DELETED_EVENT,
  NOTIFICATION_RECEIVED_EVENT,
  NOTIFICATION_STATE_CHANGED_EVENT,
  emitNotificationRead,
  type NotificationDeletedDetail,
  type NotificationReceivedDetail,
  type NotificationStateChangedDetail,
} from "@/lib/events";
import { DateSelect } from "@/ui/date-select/date-select";
import { TimeSelect } from "@/ui/time-select/time-select";

type TabKey = "all" | NotificationCategoryKey;

type TabConfig = {
  key: TabKey;
  label: string;
  emptyTitle: string;
  emptyText: string;
  icon: JSX.Element;
};

function IconClose() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M18 6 6 18M6 6l12 12"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconBell() {
  return (
    <svg width="44" height="44" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm6-6V11a6 6 0 0 0-5-5.91V4a1 1 0 1 0-2 0v1.09A6 6 0 0 0 6 11v5l-2 2v1h16v-1Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconHeart() {
  return (
    <svg width="44" height="44" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 20s-7-4.4-7-9a4 4 0 0 1 7-2 4 4 0 0 1 7 2c0 4.6-7 9-7 9Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconChat() {
  return (
    <svg width="44" height="44" viewBox="0 0 24 24" fill="none">
      <path
        d="M4 6a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H9l-5 4v-4a3 3 0 0 1-3-3Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconTag() {
  return (
    <svg width="44" height="44" viewBox="0 0 24 24" fill="none">
      <path
        d="M3 12 12 3h7l2 2v7l-9 9-9-9Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="17" cy="7" r="1.6" fill="currentColor" />
    </svg>
  );
}

function IconUser() {
  return (
    <svg width="44" height="44" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-3.3 0-8 1.7-8 5v1h16v-1c0-3.3-4.7-5-8-5Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconDots() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}

function IconChevronDown() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function IconCheckMark() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path d="M5 12l5 5L19 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function IconTune() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M4 6h16M4 12h10M4 18h7" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"/>
      <circle cx="20" cy="12" r="2.2" stroke="currentColor" strokeWidth="1.9"/>
      <circle cx="14" cy="18" r="2.2" stroke="currentColor" strokeWidth="1.9"/>
      <circle cx="17" cy="6" r="2.2" stroke="currentColor" strokeWidth="1.9"/>
    </svg>
  );
}

function IconCheckDouble() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M2 12.5l4.5 4.5L16 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M9 12.5l4 4L22 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.5"/>
    </svg>
  );
}

function IconTrash() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"/>
    </svg>
  );
}

function IconSeverityInfo() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 10.4v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="7.6" r="1" fill="currentColor" />
    </svg>
  );
}

function IconSeverityWarning() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3.8 20 18a1.2 1.2 0 0 1-1.04 1.8H5.04A1.2 1.2 0 0 1 4 18L12 3.8Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M12 9v4.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="16.4" r="1" fill="currentColor" />
    </svg>
  );
}

function IconSeverityCritical() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 7.8v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="16.8" r="1" fill="currentColor" />
    </svg>
  );
}

const TAB_FILTER: Record<TabKey, Array<NotificationItem["type"]>> = {
  all: [
    "post_like",
    "comment_like",
    "comment_reply",
    "post_comment",
    "post_mention",
    "follow",
    "login_alert",
    "post_moderation",
    "report",
    "system_notice",
  ],
  like: ["post_like", "comment_like"],
  comment: ["post_comment", "comment_reply"],
  mentions: ["post_mention"],
  follow: ["follow"],
  system: ["system_notice"],
};

function formatExactTime(value: string): string {
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "";
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(dt);
  const date = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(dt);
  return `${date} · ${time}`;
}

function buildLocalDateTimeIso(date: string, time: string) {
  if (!date || !time) return null;
  const dt = new Date(`${date}T${time}:00`);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

function formatRemainingHourMinute(value?: string | null): string | null {
  if (!value) return null;
  const expiresAt = new Date(value);
  if (Number.isNaN(expiresAt.getTime())) return null;
  const totalMinutes = Math.max(
    0,
    Math.floor((expiresAt.getTime() - Date.now()) / 60000),
  );
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export default function NotificationsOverlay(props: {
  open: boolean;
  closing?: boolean;
  onClose: () => void;
}) {
  const { open, closing, onClose } = props;
  const router = useRouter();
  const t = useTranslations("notifications");

  const tabs = useMemo<TabConfig[]>(
    () => [
      {
        key: "all",
        label: t("tabs.all"),
        emptyTitle: t("empty.all.title"),
        emptyText: t("empty.all.text"),
        icon: <IconBell />,
      },
      {
        key: "like",
        label: t("tabs.like"),
        emptyTitle: t("empty.like.title"),
        emptyText: t("empty.like.text"),
        icon: <IconHeart />,
      },
      {
        key: "comment",
        label: t("tabs.comment"),
        emptyTitle: t("empty.comment.title"),
        emptyText: t("empty.comment.text"),
        icon: <IconChat />,
      },
      {
        key: "mentions",
        label: t("tabs.mentions"),
        emptyTitle: t("empty.mentions.title"),
        emptyText: t("empty.mentions.text"),
        icon: <IconTag />,
      },
      {
        key: "follow",
        label: t("tabs.follow"),
        emptyTitle: t("empty.follow.title"),
        emptyText: t("empty.follow.text"),
        icon: <IconUser />,
      },
    ],
    [t],
  );

  const [entered, setEntered] = useState(false);
  const [active, setActive] = useState<TabKey>("all");
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [loginAlertItem, setLoginAlertItem] = useState<NotificationItem | null>(null);
  const [notMeOpen, setNotMeOpen] = useState(false);
  const [notMeSubmitting, setNotMeSubmitting] = useState(false);
  const [notMeError, setNotMeError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [muteModalOpen, setMuteModalOpen] = useState(false);
  const [muteTargetId, setMuteTargetId] = useState<string | null>(null);
  const [muteOption, setMuteOption] = useState("5m");
  const [muteCustomDate, setMuteCustomDate] = useState("");
  const [muteCustomTime, setMuteCustomTime] = useState("");
  const [muteSaving, setMuteSaving] = useState(false);
  const [muteError, setMuteError] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [manageMenuOpen, setManageMenuOpen] = useState(false);
  const [deleteMode, setDeleteMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [markAllConfirmOpen, setMarkAllConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [markingAllRead, setMarkingAllRead] = useState(false);
  const [deletingBulk, setDeletingBulk] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const manageMenuRef = useRef<HTMLDivElement>(null);

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.key === active) ?? tabs[0],
    [tabs, active],
  );

  const filteredItems = useMemo(() => {
    const allowed = TAB_FILTER[active];
    if (!allowed.length) return [];
    return items.filter((item) => allowed.includes(item.type));
  }, [items, active]);

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

  const muteTarget = useMemo(
    () => (muteTargetId ? items.find((item) => item.id === muteTargetId) : null),
    [items, muteTargetId],
  );

  const formatRelativeTime = (value: string): string => {
    const time = new Date(value).getTime();
    if (Number.isNaN(time)) return "";
    const diff = Date.now() - time;
    const seconds = Math.max(0, Math.floor(diff / 1000));
    if (seconds < 60) return t("timeJustNow");
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return t("timeMinutes", { count: minutes });
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return t("timeHours", { count: hours });
    const days = Math.floor(hours / 24);
    if (days < 7) return t("timeDays", { count: days });
    const weeks = Math.floor(days / 7);
    if (weeks < 5) return t("timeWeeks", { count: weeks });
    const months = Math.floor(days / 30);
    if (months < 12) return t("timeMonths", { count: months });
    const years = Math.floor(days / 365);
    return t("timeYears", { count: years });
  };

  const renderSystemNoticeBadge = (item: NotificationItem): ReactNode => {
    if (item.type !== "system_notice") return null;
    const level = item.systemNoticeLevel ?? "info";

    if (level === "critical") {
      return (
        <span className={`${styles.noticeBadge} ${styles.noticeBadgeCritical}`}>
          <IconSeverityCritical />
          <span>{t("badgeCritical")}</span>
        </span>
      );
    }

    if (level === "warning") {
      return (
        <span className={`${styles.noticeBadge} ${styles.noticeBadgeWarning}`}>
          <IconSeverityWarning />
          <span>{t("badgeWarning")}</span>
        </span>
      );
    }

    return (
      <span className={`${styles.noticeBadge} ${styles.noticeBadgeInfo}`}>
        <IconSeverityInfo />
        <span>{t("badgeInfo")}</span>
      </span>
    );
  };

  const buildMessage = (item: NotificationItem): ReactNode => {
    const bold = (chunks: ReactNode) => (
      <span className={styles.itemName}>{chunks}</span>
    );

    if (item.type === "post_like") {
      const name = item.actor.username
        ? `@${item.actor.username}`
        : item.actor.displayName || t("msg.someone");
      const othersCount = Math.max(0, (item.likeCount ?? 1) - 1);
      const othersLabel = othersCount === 1 ? t("msg.oneOther") : t("msg.nOthers", { count: othersCount });
      const isReel = item.postKind === "reel";
      if (othersCount > 0) {
        return isReel
          ? t.rich("msg.reelLikeOthers", { name, others: othersLabel, bold })
          : t.rich("msg.postLikeOthers", { name, others: othersLabel, bold });
      }
      return isReel
        ? t.rich("msg.reelLike", { name, bold })
        : t.rich("msg.postLike", { name, bold });
    }

    if (item.type === "post_comment") {
      const name = item.actor.username
        ? `@${item.actor.username}`
        : item.actor.displayName || t("msg.someone");
      const othersCount = Math.max(0, (item.commentCount ?? 1) - 1);
      const othersLabel = othersCount === 1 ? t("msg.oneOther") : t("msg.nOthers", { count: othersCount });
      const isReel = item.postKind === "reel";
      if (othersCount > 0) {
        return isReel
          ? t.rich("msg.reelCommentOthers", { name, others: othersLabel, bold })
          : t.rich("msg.postCommentOthers", { name, others: othersLabel, bold });
      }
      return isReel
        ? t.rich("msg.reelComment", { name, bold })
        : t.rich("msg.postComment", { name, bold });
    }

    if (item.type === "comment_like") {
      const name = item.actor.username
        ? `@${item.actor.username}`
        : item.actor.displayName || t("msg.someone");
      const othersCount = Math.max(0, (item.likeCount ?? 1) - 1);
      const othersLabel = othersCount === 1 ? t("msg.oneOther") : t("msg.nOthers", { count: othersCount });
      if (othersCount > 0) {
        return t.rich("msg.commentLikeOthers", { name, others: othersLabel, bold });
      }
      return t.rich("msg.commentLike", { name, bold });
    }

    if (item.type === "post_mention") {
      const name = item.actor.username
        ? `@${item.actor.username}`
        : item.actor.displayName || t("msg.someone");
      return item.mentionSource === "comment"
        ? t.rich("msg.mentionComment", { name, bold })
        : t.rich("msg.mentionPost", { name, bold });
    }

    if (item.type === "comment_reply") {
      const name = item.actor.username
        ? `@${item.actor.username}`
        : item.actor.displayName || t("msg.someone");
      const othersCount = Math.max(0, (item.commentCount ?? 1) - 1);
      const othersLabel = othersCount === 1 ? t("msg.oneOther") : t("msg.nOthers", { count: othersCount });
      if (othersCount > 0) {
        return t.rich("msg.commentReplyOthers", { name, others: othersLabel, bold });
      }
      return t.rich("msg.commentReply", { name, bold });
    }

    if (item.type === "follow") {
      const name = item.actor.username
        ? `@${item.actor.username}`
        : item.actor.displayName || t("msg.someone");
      return t.rich("msg.followed", { name, bold });
    }

    if (item.type === "login_alert") {
      return <>{t("msg.loginAlert")}</>;
    }

    if (item.type === "post_moderation") {
      const isReel = item.postKind === "reel";
      if (item.moderationDecision === "approve" || item.moderationDecision === "blur") {
        return <>{isReel ? t("msg.reelPublished") : t("msg.postPublished")}</>;
      }
      if (item.moderationDecision === "reject") {
        return <>{isReel ? t("msg.reelRejected") : t("msg.postRejected")}</>;
      }
      return <>{isReel ? t("msg.reelPublished") : t("msg.postPublished")}</>;
    }

    if (item.type === "report") {
      const severityStr = item.reportSeverity
        ? item.reportSeverity.charAt(0).toUpperCase() + item.reportSeverity.slice(1)
        : t("msg.severityUnknown");

      const strikePart =
        typeof item.reportStrikeDelta === "number"
          ? typeof item.reportStrikeTotal === "number"
            ? t("msg.strikeDelta", { delta: `+${item.reportStrikeDelta}`, total: item.reportStrikeTotal })
            : t("msg.strikeDeltaNoTotal", { delta: `+${item.reportStrikeDelta}` })
          : "";

      if (item.reportAudience === "offender") {
        if (item.reportAction === "remove_post") {
          const targetPart = item.reportTargetId ? ` Post #${item.reportTargetId.slice(-8)}.` : "";
          return <>{t("msg.reportRemovePost", { target: targetPart, severity: severityStr, strike: strikePart })}</>;
        }
        if (item.reportAction === "restrict_post") {
          return <>{t("msg.reportRestrictPost", { severity: severityStr, strike: strikePart })}</>;
        }
        if (item.reportAction === "warn" || item.reportAction === "warn_user") {
          const targetType = item.reportTargetType ?? "content";
          const targetLabel =
            targetType === "post" ? t("msg.targetPost")
            : targetType === "comment" ? t("msg.targetComment")
            : targetType === "user" ? t("msg.targetAccount")
            : t("msg.targetContent");
          return <>{t("msg.reportWarn", { target: targetLabel })}</>;
        }
        if (item.reportAction === "delete_comment") {
          return <>{t("msg.reportDeleteComment", { severity: severityStr, strike: strikePart })}</>;
        }
        if (item.reportAction === "violation") {
          const targetType = item.reportTargetType ?? "content";
          const targetLabel =
            targetType === "post" ? t("msg.targetPost")
            : targetType === "comment" ? t("msg.targetComment")
            : targetType === "user" ? t("msg.targetAccount")
            : t("msg.targetContent");
          return <>{t("msg.reportViolation", { target: targetLabel, severity: severityStr, strike: strikePart })}</>;
        }
        if (item.reportAction === "mute_interaction") {
          const remaining = formatRemainingHourMinute(item.reportActionExpiresAt);
          const remainingPart = remaining
            ? t("msg.reportMuteRemaining", { time: remaining })
            : t("msg.reportMuteManual");
          return <>{t("msg.reportMuteInteraction", { remaining: remainingPart })}</>;
        }
        return <>{t("msg.reportActionTaken")}</>;
      }
      if (item.reportOutcome === "action_taken") {
        return <>{t("msg.reportReviewed")}</>;
      }
      return <>{t("msg.reportNoViolation")}</>;
    }

    if (item.type === "system_notice") {
      const title = item.systemNoticeTitle?.trim() || "";
      const body = item.systemNoticeBody?.trim() || "";
      if (!title) {
        return <>{body || t("msg.systemNotice")}</>;
      }
      return (
        <>
          <span className={styles.itemName}>{title}</span>
          {body ? `: ${body}` : ""}
        </>
      );
    }

    return <>{t("msg.newNotification")}</>;
  };

  useEffect(() => {
    if (!open) {
      setEntered(false);
      return;
    }
    setEntered(false);
    const raf = window.requestAnimationFrame(() => setEntered(true));
    return () => window.cancelAnimationFrame(raf);
  }, [open]);

  useEffect(() => {
    if (!open) {
      setDeleteMode(false);
      setSelectedIds(new Set());
      setDropdownOpen(false);
      setManageMenuOpen(false);
      setMarkAllConfirmOpen(false);
      setDeleteConfirmOpen(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setActive("all");
    setError("");
    setLoading(true);
    const token = getStoredAccessToken();
    if (!token) {
      setItems([]);
      setLoading(false);
      setError(t("sessionExpired"));
      return;
    }

    fetchNotifications({ token, limit: 50 })
      .then((res) => {
        setItems(res.items ?? []);
      })
      .catch((err) => {
        const message =
          typeof err === "object" && err && "message" in err
            ? String((err as { message?: string }).message)
            : t("loadFailed");
        setError(message);
      })
      .finally(() => setLoading(false));
  }, [open, t]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const handleNotification = (event: Event) => {
      const detail = (event as CustomEvent<NotificationReceivedDetail>).detail;
      if (!detail?.notification) return;
      setItems((prev) => {
        const next = prev.filter((item) => item.id !== detail.notification.id);
        return [detail.notification, ...next];
      });
    };
    window.addEventListener(NOTIFICATION_RECEIVED_EVENT, handleNotification);
    return () => window.removeEventListener(NOTIFICATION_RECEIVED_EVENT, handleNotification);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handleStateChanged = (event: Event) => {
      const detail = (event as CustomEvent<NotificationStateChangedDetail>).detail;
      if (!detail?.id) return;
      setItems((prev) =>
        prev.map((entry) =>
          entry.id === detail.id ? { ...entry, readAt: detail.readAt } : entry,
        ),
      );
    };

    const handleDeleted = (event: Event) => {
      const detail = (event as CustomEvent<NotificationDeletedDetail>).detail;
      if (!detail?.id) return;
      setItems((prev) => prev.filter((entry) => entry.id !== detail.id));
    };

    window.addEventListener(NOTIFICATION_STATE_CHANGED_EVENT, handleStateChanged);
    window.addEventListener(NOTIFICATION_DELETED_EVENT, handleDeleted);

    return () => {
      window.removeEventListener(NOTIFICATION_STATE_CHANGED_EVENT, handleStateChanged);
      window.removeEventListener(NOTIFICATION_DELETED_EVENT, handleDeleted);
    };
  }, [open]);

  useEffect(() => {
    if (!openMenuId) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest(`[data-notification-menu-root="${openMenuId}"]`)) return;
      setOpenMenuId(null);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [openMenuId]);

  useEffect(() => {
    if (!dropdownOpen) return;
    const handle = (e: MouseEvent) => {
      if (!dropdownRef.current?.contains(e.target as Node)) setDropdownOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [dropdownOpen]);

  useEffect(() => {
    if (!manageMenuOpen) return;
    const handle = (e: MouseEvent) => {
      if (!manageMenuRef.current?.contains(e.target as Node)) setManageMenuOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [manageMenuOpen]);

  useEffect(() => {
    if (!loginAlertItem) {
      setNotMeOpen(false);
      setNotMeError(null);
      setNotMeSubmitting(false);
    }
  }, [loginAlertItem]);

  const showToast = (message: string, duration = 1800) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMessage(message);
    toastTimerRef.current = setTimeout(() => setToastMessage(null), duration);
  };

  const toggleSelectId = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleMarkAllRead = async () => {
    const token = getStoredAccessToken();
    if (!token) return;
    setMarkingAllRead(true);
    try {
      await markAllNotificationsRead({ token });
      const now = new Date().toISOString();
      setItems((prev) => prev.map((item) => ({ ...item, readAt: item.readAt ?? now })));
      setMarkAllConfirmOpen(false);
      showToast(t("toast.markedAllRead"));
    } catch {
      showToast(t("toast.markAllReadFailed"));
    } finally {
      setMarkingAllRead(false);
    }
  };

  const handleBulkDelete = async () => {
    const token = getStoredAccessToken();
    if (!token) return;
    setDeletingBulk(true);
    const ids = Array.from(selectedIds);
    try {
      await Promise.all(
        ids.map((id) => deleteNotification({ token, notificationId: id }).catch(() => undefined)),
      );
      setItems((prev) => prev.filter((item) => !selectedIds.has(item.id)));
      setSelectedIds(new Set());
      setDeleteMode(false);
      setDeleteConfirmOpen(false);
      showToast(
        ids.length === 1
          ? t("toast.deleted", { count: ids.length })
          : t("toast.deletedPlural", { count: ids.length }),
      );
    } finally {
      setDeletingBulk(false);
    }
  };

  const handleItemClick = (item: NotificationItem) => {
    setOpenMenuId(null);
    if (item.type === "login_alert") {
      if (!item.readAt) {
        const token = getStoredAccessToken();
        if (token) {
          void markNotificationRead({ token, notificationId: item.id }).catch(() => undefined);
        }
        setItems((prev) =>
          prev.map((entry) =>
            entry.id === item.id ? { ...entry, readAt: new Date().toISOString() } : entry,
          ),
        );
        emitNotificationRead({ id: item.id });
      }
      setLoginAlertItem(item);
      return;
    }
    const targetUrl =
      item.type === "report" && item.reportAudience === "offender"
        ? "/settings?section=violations"
        : item.type === "post_moderation" && item.moderationDecision === "reject"
          ? "/settings?section=violations"
          : item.type === "post_moderation" && item.postId
            ? `/post/${item.postId}`
            : item.type === "system_notice" && item.systemNoticeActionUrl
              ? item.systemNoticeActionUrl
              : item.postId
                ? `/post/${item.postId}`
                : item.type === "follow" && item.actor?.id
                  ? `/profile/${item.actor.id}`
                  : null;
    if (!targetUrl) return;
    if (!item.readAt) {
      const token = getStoredAccessToken();
      if (token) {
        void markNotificationRead({ token, notificationId: item.id }).catch(() => undefined);
      }
      setItems((prev) =>
        prev.map((entry) =>
          entry.id === item.id ? { ...entry, readAt: new Date().toISOString() } : entry,
        ),
      );
      emitNotificationRead({ id: item.id });
    }
    onClose();
    if (/^https?:\/\//i.test(targetUrl)) {
      window.open(targetUrl, "_blank", "noopener,noreferrer");
      return;
    }
    router.push(targetUrl);
  };

  const isMutedForItem = (item: NotificationItem) => {
    if (item.postMutedIndefinitely) return true;
    if (item.postMutedUntil) {
      const dt = new Date(item.postMutedUntil);
      if (!Number.isNaN(dt.getTime()) && dt.getTime() > Date.now()) return true;
    }
    return false;
  };

  const canMuteItem = (item: NotificationItem) =>
    Boolean(item.postId && item.isOwnPost && !isMutedForItem(item));

  const openMuteModal = (item: NotificationItem) => {
    if (!item.postId) return;
    setMuteTargetId(item.id);
    setMuteError("");
    setMuteOption("5m");
    setMuteCustomDate("");
    setMuteCustomTime("");
    setMuteModalOpen(true);
  };

  const closeMuteModal = () => {
    if (muteSaving) return;
    setMuteModalOpen(false);
    setMuteTargetId(null);
  };

  const handleToggleRead = (item: NotificationItem) => {
    const token = getStoredAccessToken();
    if (!token) return;
    if (item.readAt) {
      void markNotificationUnread({ token, notificationId: item.id }).catch(() => undefined);
      setItems((prev) =>
        prev.map((entry) => (entry.id === item.id ? { ...entry, readAt: null } : entry)),
      );
    } else {
      void markNotificationRead({ token, notificationId: item.id }).catch(() => undefined);
      setItems((prev) =>
        prev.map((entry) =>
          entry.id === item.id ? { ...entry, readAt: new Date().toISOString() } : entry,
        ),
      );
      emitNotificationRead({ id: item.id });
    }
    setOpenMenuId(null);
  };

  const handleDeleteNotification = (item: NotificationItem) => {
    const token = getStoredAccessToken();
    if (!token) return;
    void deleteNotification({ token, notificationId: item.id }).catch(() => undefined);
    setItems((prev) => prev.filter((entry) => entry.id !== item.id));
    if (loginAlertItem?.id === item.id) setLoginAlertItem(null);
    setOpenMenuId(null);
  };

  const handleSaveMute = async () => {
    if (!muteTarget?.postId) return;
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
          setMuteError(t("mute.invalidDateTime"));
          setMuteSaving(false);
          return;
        }
        const dt = new Date(iso);
        if (dt.getTime() <= Date.now()) {
          setMuteError(t("mute.pastTime"));
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
        postId: muteTarget.postId,
        mutedUntil,
        mutedIndefinitely,
      });

      setItems((prev) =>
        prev.map((entry) =>
          entry.id === muteTarget.id
            ? {
                ...entry,
                postMutedUntil: res.mutedUntil ?? null,
                postMutedIndefinitely: res.mutedIndefinitely ?? false,
              }
            : entry,
        ),
      );

      setMuteModalOpen(false);
      setMuteTargetId(null);
    } catch (err) {
      const message =
        typeof err === "object" && err && "message" in err
          ? String((err as { message?: string }).message)
          : t("mute.updateFailed");
      setMuteError(message);
    } finally {
      setMuteSaving(false);
    }
  };

  if (!open) return null;

  const resolveLoginDeviceName = (item: NotificationItem) => {
    if (item.deviceInfo?.trim()) return item.deviceInfo.trim();
    const parts = [item.browser, item.os].filter(Boolean);
    if (parts.length) return parts.join(" on ");
    return item.deviceType
      ? t("loginAlert.deviceWithType", { type: item.deviceType })
      : t("loginAlert.unknownDevice");
  };

  const handleConfirmLogin = () => {
    setLoginAlertItem(null);
  };

  const handleNotMe = () => {
    setNotMeError(null);
    setNotMeOpen(true);
  };

  const handleLogoutSuspiciousDevice = async () => {
    if (!loginAlertItem?.deviceIdHash) {
      setNotMeError(t("notMe.noDeviceError"));
      return;
    }
    const token = getStoredAccessToken();
    if (!token) {
      setNotMeError(t("sessionExpired"));
      return;
    }

    setNotMeSubmitting(true);
    setNotMeError(null);
    try {
      await logoutLoginDevice({
        token,
        deviceIdHash: loginAlertItem.deviceIdHash,
      });
      showToast(t("toast.deviceSignedOut"));
      setNotMeOpen(false);
      setLoginAlertItem(null);
    } catch (err) {
      const message =
        typeof err === "object" && err && "message" in err
          ? String((err as { message?: string }).message)
          : t("notMe.logoutError");
      setNotMeError(message);
    } finally {
      setNotMeSubmitting(false);
    }
  };

  const unreadCount = items.filter((i) => !i.readAt).length;

  return (
    <div
      className={styles.backdrop}
      data-entered={entered ? "1" : "0"}
      onClick={onClose}
    >
      <aside
        className={styles.sheet}
        data-entered={entered ? "1" : "0"}
        data-closing={closing ? "1" : "0"}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.header}>
          <div>
            <p className={styles.kicker}>{t("kicker")}</p>
            <h2 className={styles.title}>{t("title")}</h2>
          </div>
          <button className={styles.close} type="button" onClick={onClose}>
            <IconClose />
          </button>
        </div>

        <div className={styles.toolbar}>
          <div className={styles.filterDropdownWrap} ref={dropdownRef}>
            <button
              type="button"
              className={styles.filterTrigger}
              onClick={() => setDropdownOpen((prev) => !prev)}
              aria-haspopup="listbox"
              aria-expanded={dropdownOpen}
            >
              <span className={styles.filterTriggerLabel}>{activeTab.label}</span>
              <span className={`${styles.filterChevron} ${dropdownOpen ? styles.filterChevronOpen : ""}`}>
                <IconChevronDown />
              </span>
            </button>
            {dropdownOpen && (
              <div className={styles.filterMenu} role="listbox">
                {tabs.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    role="option"
                    aria-selected={tab.key === active}
                    className={`${styles.filterMenuItem} ${tab.key === active ? styles.filterMenuItemActive : ""}`}
                    onClick={() => {
                      setActive(tab.key);
                      setDropdownOpen(false);
                    }}
                  >
                    <span className={styles.filterMenuItemCheck}>
                      {tab.key === active ? <IconCheckMark /> : null}
                    </span>
                    {tab.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {deleteMode ? (
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={() => {
                setDeleteMode(false);
                setSelectedIds(new Set());
              }}
            >
              {t("cancel")}
            </button>
          ) : (
            <div className={styles.manageWrap} ref={manageMenuRef}>
              <button
                type="button"
                className={`${styles.manageBtn} ${manageMenuOpen ? styles.manageBtnActive : ""}`}
                onClick={() => setManageMenuOpen((prev) => !prev)}
                title={t("manageTitle")}
                aria-haspopup="true"
                aria-expanded={manageMenuOpen}
              >
                <IconTune />
              </button>
              {manageMenuOpen && (
                <div className={styles.manageMenu} role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    className={styles.manageMenuItem}
                    onClick={() => {
                      setManageMenuOpen(false);
                      setMarkAllConfirmOpen(true);
                    }}
                  >
                    <IconCheckDouble />
                    {t("markAllRead")}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className={`${styles.manageMenuItem} ${styles.manageMenuItemDanger}`}
                    onClick={() => {
                      setManageMenuOpen(false);
                      setDeleteMode(true);
                      setSelectedIds(new Set());
                    }}
                  >
                    <IconTrash />
                    {t("deleteNotifications")}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {deleteMode && (
          <div className={styles.deleteModeBar}>
            <span className={styles.deleteModeCount}>
              {selectedIds.size > 0 ? t("selected", { count: selectedIds.size }) : t("tapToSelect")}
            </span>
            {selectedIds.size > 0 && (
              <button
                type="button"
                className={styles.deleteModeDeleteBtn}
                onClick={() => setDeleteConfirmOpen(true)}
              >
                {t("deleteCount", { count: selectedIds.size })}
              </button>
            )}
          </div>
        )}

        <div className={styles.body}>
          {loading ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>{activeTab.icon}</div>
              <h3 className={styles.emptyTitle}>{t("loading")}</h3>
              <p className={styles.emptyText}>{t("loadingText")}</p>
            </div>
          ) : error ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>{activeTab.icon}</div>
              <h3 className={styles.emptyTitle}>{t("errorTitle")}</h3>
              <p className={styles.emptyText}>{error}</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>{activeTab.icon}</div>
              <h3 className={styles.emptyTitle}>{activeTab.emptyTitle}</h3>
              <p className={styles.emptyText}>{activeTab.emptyText}</p>
            </div>
          ) : (
            <ul className={styles.list}>
              {filteredItems.map((item) => (
                <li
                  key={item.id}
                  className={`${styles.listItem} ${
                    item.readAt ? "" : styles.listItemUnread
                  } ${openMenuId === item.id ? styles.listItemMenuOpen : ""} ${
                    deleteMode && selectedIds.has(item.id) ? styles.listItemSelected : ""
                  }`}
                  onClick={() => {
                    if (deleteMode) {
                      toggleSelectId(item.id);
                      return;
                    }
                    handleItemClick(item);
                  }}
                  role={item.postId || item.type === "follow" ? "button" : undefined}
                  tabIndex={item.postId || item.type === "follow" ? 0 : undefined}
                  onKeyDown={(event) => {
                    if (!item.postId && item.type !== "follow") return;
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      handleItemClick(item);
                    }
                  }}
                >
                  <div className={styles.avatarWrap}>
                    <Image
                      src={
                        item.type === "report" ||
                        item.type === "post_moderation" ||
                        item.type === "system_notice"
                          ? "/logo.png"
                          : item.actor.avatarUrl
                      }
                      alt={
                        item.type === "report" ||
                        item.type === "post_moderation" ||
                        item.type === "system_notice"
                          ? "Cordigram"
                          : item.actor.displayName
                      }
                      width={44}
                      height={44}
                      className={styles.avatar}
                    />
                  </div>
                  <div className={styles.itemContent}>
                    {renderSystemNoticeBadge(item)}
                    <p className={styles.itemText}>{buildMessage(item)}</p>
                    <span className={styles.itemTime}>
                      {formatRelativeTime(item.activityAt || item.createdAt)}
                    </span>
                  </div>
                  {deleteMode ? (
                    <div className={styles.checkboxWrap} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className={styles.checkboxInput}
                        checked={selectedIds.has(item.id)}
                        onChange={() => toggleSelectId(item.id)}
                        aria-label="Select notification"
                      />
                    </div>
                  ) : (
                    <div
                      className={styles.itemActions}
                      data-notification-menu-root={item.id}
                      onClick={(event) => {
                        event.stopPropagation();
                        setOpenMenuId((prev) => (prev === item.id ? null : item.id));
                      }}
                      onMouseDown={(event) => event.stopPropagation()}
                    >
                      <button
                        type="button"
                        className={`${styles.itemMenuButton} ${openMenuId === item.id ? styles.itemMenuButtonVisible : ""}`}
                        aria-haspopup="true"
                        aria-expanded={openMenuId === item.id}
                      >
                        <IconDots />
                      </button>
                      {!item.readAt ? <span className={styles.itemDot} aria-hidden="true" /> : null}
                      {openMenuId === item.id ? (
                        <div className={styles.itemMenu} role="menu">
                          <button
                            type="button"
                            className={styles.itemMenuItem}
                            role="menuitem"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleToggleRead(item);
                            }}
                          >
                            {item.readAt ? t("markUnread") : t("markRead")}
                          </button>
                          {canMuteItem(item) ? (
                            <button
                              type="button"
                              className={styles.itemMenuItem}
                              role="menuitem"
                              onClick={(event) => {
                                event.stopPropagation();
                                openMuteModal(item);
                                setOpenMenuId(null);
                              }}
                            >
                              {item.postKind === "reel" ? t("muteReel") : t("mutePost")}
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className={`${styles.itemMenuItem} ${styles.itemMenuDanger}`}
                            role="menuitem"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleDeleteNotification(item);
                            }}
                          >
                            {t("deleteNotification")}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      {markAllConfirmOpen && (
        <div
          className={styles.confirmBackdrop}
          role="dialog"
          aria-modal="true"
          onClick={() => { if (!markingAllRead) setMarkAllConfirmOpen(false); }}
        >
          <div className={styles.confirmCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.confirmHeader}>
              <h3 className={styles.confirmTitle}>{t("markAllConfirm.title")}</h3>
              <button
                type="button"
                className={styles.confirmClose}
                onClick={() => setMarkAllConfirmOpen(false)}
                disabled={markingAllRead}
                aria-label="Close"
              >
                <IconClose />
              </button>
            </div>
            <p className={styles.confirmBody}>
              {unreadCount === 1
                ? t("markAllConfirm.body", { count: unreadCount })
                : t("markAllConfirm.bodyPlural", { count: unreadCount })}
            </p>
            <div className={styles.confirmActions}>
              <button
                type="button"
                className={styles.confirmSecondary}
                onClick={() => setMarkAllConfirmOpen(false)}
                disabled={markingAllRead}
              >
                {t("cancel")}
              </button>
              <button
                type="button"
                className={styles.confirmPrimary}
                onClick={() => void handleMarkAllRead()}
                disabled={markingAllRead}
              >
                {markingAllRead ? t("markAllConfirm.marking") : t("markAllConfirm.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirmOpen && (
        <div
          className={styles.confirmBackdrop}
          role="dialog"
          aria-modal="true"
          onClick={() => { if (!deletingBulk) setDeleteConfirmOpen(false); }}
        >
          <div className={styles.confirmCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.confirmHeader}>
              <h3 className={styles.confirmTitle}>{t("deleteConfirm.title")}</h3>
              <button
                type="button"
                className={styles.confirmClose}
                onClick={() => setDeleteConfirmOpen(false)}
                disabled={deletingBulk}
                aria-label="Close"
              >
                <IconClose />
              </button>
            </div>
            <p className={styles.confirmBody}>
              {selectedIds.size === 1
                ? t("deleteConfirm.body", { count: selectedIds.size })
                : t("deleteConfirm.bodyPlural", { count: selectedIds.size })}
            </p>
            <div className={styles.confirmActions}>
              <button
                type="button"
                className={styles.confirmSecondary}
                onClick={() => setDeleteConfirmOpen(false)}
                disabled={deletingBulk}
              >
                {t("cancel")}
              </button>
              <button
                type="button"
                className={styles.confirmDanger}
                onClick={() => void handleBulkDelete()}
                disabled={deletingBulk}
              >
                {deletingBulk ? t("deleteConfirm.deleting") : t("deleteConfirm.confirm", { count: selectedIds.size })}
              </button>
            </div>
          </div>
        </div>
      )}

      {loginAlertItem ? (
        <div className={styles.detailBackdrop}>
          <div
            className={styles.detailCard}
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.detailHeader}>
              <h3 className={styles.detailTitle}>{t("loginAlert.title")}</h3>
              <button
                type="button"
                className={styles.detailClose}
                onClick={() => setLoginAlertItem(null)}
                aria-label="Close"
              >
                <IconClose />
              </button>
            </div>
            <div className={styles.detailBody}>
              <div className={styles.detailRow}>
                <span>{t("loginAlert.device")}</span>
                <span>{resolveLoginDeviceName(loginAlertItem)}</span>
              </div>
              <div className={styles.detailRow}>
                <span>{t("loginAlert.location")}</span>
                <span>
                  {loginAlertItem.location?.trim()
                    ? loginAlertItem.location
                    : t("loginAlert.unknownLocation")}
                </span>
              </div>
              <div className={styles.detailRow}>
                <span>{t("loginAlert.time")}</span>
                <span>{formatExactTime(loginAlertItem.loginAt || loginAlertItem.createdAt)}</span>
              </div>
            </div>
            <div className={styles.detailActions}>
              <button
                type="button"
                className={styles.detailSecondary}
                onClick={handleConfirmLogin}
              >
                {t("loginAlert.thisWasMe")}
              </button>
              <button
                type="button"
                className={styles.detailDanger}
                onClick={handleNotMe}
              >
                {t("loginAlert.thisWasntMe")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {loginAlertItem && notMeOpen ? (
        <div
          className={styles.notMeBackdrop}
          onClick={() => (notMeSubmitting ? null : setNotMeOpen(false))}
        >
          <div
            className={styles.notMeCard}
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.notMeHeader}>
              <h3 className={styles.notMeTitle}>{t("notMe.title")}</h3>
              <button
                type="button"
                className={styles.notMeClose}
                onClick={() => (notMeSubmitting ? null : setNotMeOpen(false))}
                aria-label="Close"
                disabled={notMeSubmitting}
              >
                <IconClose />
              </button>
            </div>
            <p className={styles.notMeBody}>{t("notMe.body")}</p>
            {notMeError ? <div className={styles.notMeError}>{notMeError}</div> : null}
            <div className={styles.notMeActions}>
              <button
                type="button"
                className={styles.notMeSecondary}
                onClick={handleLogoutSuspiciousDevice}
                disabled={notMeSubmitting}
              >
                {notMeSubmitting ? t("notMe.loggingOut") : t("notMe.logout")}
              </button>
              <button
                type="button"
                className={styles.notMePrimary}
                onClick={() => {
                  setNotMeOpen(false);
                  setLoginAlertItem(null);
                  showToast(t("toast.openingPasswordSettings"));
                  router.push("/settings?section=privacy&changePassword=1");
                }}
                disabled={notMeSubmitting}
              >
                {t("notMe.changePassword")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toastMessage ? (
        <div className={styles.toast} role="status" aria-live="polite">
          {toastMessage}
        </div>
      ) : null}

      {muteModalOpen && muteTarget ? (
        <div
          className={styles.muteBackdrop}
          role="dialog"
          aria-modal="true"
          onClick={closeMuteModal}
        >
          <div className={styles.muteCard} onClick={(event) => event.stopPropagation()}>
            <div className={styles.muteHeader}>
              <div>
                <h3 className={styles.muteTitle}>{t("mute.title")}</h3>
                <p className={styles.muteBody}>
                  {muteTarget.postKind === "reel" ? t("mute.bodyReel") : t("mute.bodyPost")}
                </p>
              </div>
              <button
                type="button"
                className={styles.muteClose}
                onClick={closeMuteModal}
                aria-label="Close"
                disabled={muteSaving}
              >
                ×
              </button>
            </div>

            <div className={styles.muteOptionGrid}>
              {muteOptions.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  className={`${styles.muteOption} ${muteOption === option.key ? styles.muteOptionActive : ""}`}
                  onClick={() => setMuteOption(option.key)}
                >
                  <span className={styles.muteOptionTitle}>{option.label}</span>
                </button>
              ))}
            </div>

            {muteOption === "custom" ? (
              <div className={styles.muteCustomRow}>
                <div className={styles.mutePicker}>
                  <label className={styles.muteLabel}>{t("mute.dateLabel")}</label>
                  <DateSelect
                    value={muteCustomDate}
                    onChange={setMuteCustomDate}
                    minDate={new Date()}
                    maxDate={null}
                    placeholder="yyyy-mm-dd"
                  />
                </div>
                <div className={styles.mutePicker}>
                  <label className={styles.muteLabel}>{t("mute.timeLabel")}</label>
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

            {muteError ? <div className={styles.muteError}>{muteError}</div> : null}

            <div className={styles.muteActions}>
              <button
                type="button"
                className={styles.muteSecondary}
                onClick={closeMuteModal}
                disabled={muteSaving}
              >
                {t("cancel")}
              </button>
              <button
                type="button"
                className={styles.mutePrimary}
                onClick={handleSaveMute}
                disabled={muteSaving}
              >
                {muteSaving ? t("mute.saving") : t("mute.save")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
