"use client";

import Image from "next/image";
import { JSX, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./notifications-overlay.module.css";
import {
  deleteNotification,
  fetchNotifications,
  logoutLoginDevice,
  markNotificationRead,
  markNotificationUnread,
  updatePostNotificationMute,
  type NotificationCategoryKey,
  type NotificationItem,
} from "@/lib/api";
import { getStoredAccessToken } from "@/lib/auth";
import {
  NOTIFICATION_RECEIVED_EVENT,
  emitNotificationRead,
  type NotificationReceivedDetail,
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

const TABS: TabConfig[] = [
  {
    key: "all",
    label: "All activity",
    emptyTitle: "Nothing here yet",
    emptyText: "When you get notifications, they will appear here.",
    icon: <IconBell />,
  },
  {
    key: "like",
    label: "Likes",
    emptyTitle: "Likes on your posts",
    emptyText: "When someone likes your content, you’ll see it here.",
    icon: <IconHeart />,
  },
  {
    key: "comment",
    label: "Comments",
    emptyTitle: "Comments on your posts",
    emptyText: "When someone comments, you’ll see it here.",
    icon: <IconChat />,
  },
  {
    key: "mentions",
    label: "Mentions and tags",
    emptyTitle: "Mentions and tags",
    emptyText: "When someone mentions or tags you, you’ll see it here.",
    icon: <IconTag />,
  },
  {
    key: "follow",
    label: "Followers",
    emptyTitle: "New followers",
    emptyText: "When someone follows you, you’ll see it here.",
    icon: <IconUser />,
  },
];

const TAB_FILTER: Record<TabKey, Array<NotificationItem["type"]>> = {
  all: [
    "post_like",
    "comment_like",
    "comment_reply",
    "post_comment",
    "post_mention",
    "follow",
    "login_alert",
  ],
  like: ["post_like", "comment_like"],
  comment: ["post_comment", "comment_reply"],
  mentions: ["post_mention"],
  follow: ["follow"],
};

function formatRelativeTime(value: string): string {
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return "";
  const diff = Date.now() - time;
  const seconds = Math.max(0, Math.floor(diff / 1000));
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hours`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} days`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks} weeks`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} months`;
  const years = Math.floor(days / 365);
  return `${years} years`;
}

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

function buildMessage(item: NotificationItem): JSX.Element {
  if (item.type === "post_like") {
    const name = item.actor.username
      ? `@${item.actor.username}`
      : item.actor.displayName || "Someone";
    const othersCount = Math.max(0, (item.likeCount ?? 1) - 1);
    const othersLabel = othersCount === 1 ? "1 other" : `${othersCount} others`;
    const targetLabel = item.postKind === "reel" ? "reel" : "post";
    return (
      <>
        <span className={styles.itemName}>{name}</span>
        {othersCount > 0 ? ` and ${othersLabel}` : ""} liked your {targetLabel}
      </>
    );
  }
  if (item.type === "post_comment") {
    const name = item.actor.username
      ? `@${item.actor.username}`
      : item.actor.displayName || "Someone";
    const othersCount = Math.max(0, (item.commentCount ?? 1) - 1);
    const othersLabel = othersCount === 1 ? "1 other" : `${othersCount} others`;
    const targetLabel = item.postKind === "reel" ? "reel" : "post";
    return (
      <>
        <span className={styles.itemName}>{name}</span>
        {othersCount > 0 ? ` and ${othersLabel}` : ""} commented on your{" "}
        {targetLabel}
      </>
    );
  }
  if (item.type === "comment_like") {
    const name = item.actor.username
      ? `@${item.actor.username}`
      : item.actor.displayName || "Someone";
    const othersCount = Math.max(0, (item.likeCount ?? 1) - 1);
    const othersLabel = othersCount === 1 ? "1 other" : `${othersCount} others`;
    return (
      <>
        <span className={styles.itemName}>{name}</span>
        {othersCount > 0 ? ` and ${othersLabel}` : ""} liked your comment
      </>
    );
  }
  if (item.type === "post_mention") {
    const name = item.actor.username
      ? `@${item.actor.username}`
      : item.actor.displayName || "Someone";
    const sourceLabel = item.mentionSource === "comment" ? "comment" : "post";
    return (
      <>
        <span className={styles.itemName}>{name}</span>
        {` mentioned you in a ${sourceLabel}`}
      </>
    );
  }
  if (item.type === "comment_reply") {
    const name = item.actor.username
      ? `@${item.actor.username}`
      : item.actor.displayName || "Someone";
    const othersCount = Math.max(0, (item.commentCount ?? 1) - 1);
    const othersLabel = othersCount === 1 ? "1 other" : `${othersCount} others`;
    return (
      <>
        <span className={styles.itemName}>{name}</span>
        {othersCount > 0 ? ` and ${othersLabel}` : ""} replied to your comment
      </>
    );
  }
  if (item.type === "follow") {
    const name = item.actor.username
      ? `@${item.actor.username}`
      : item.actor.displayName || "Someone";
    return (
      <>
        <span className={styles.itemName}>{name}</span> followed you
      </>
    );
  }
  if (item.type === "login_alert") {
    return <>You're signing in on a new device</>;
  }
  return <>New notification</>;
}

export default function NotificationsOverlay(props: {
  open: boolean;
  closing?: boolean;
  onClose: () => void;
}) {
  const { open, closing, onClose } = props;
  const router = useRouter();
  const [entered, setEntered] = useState(false);
  const [active, setActive] = useState<TabKey>("all");
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [loginAlertItem, setLoginAlertItem] = useState<NotificationItem | null>(
    null,
  );
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

  const activeTab = useMemo(
    () => TABS.find((tab) => tab.key === active) ?? TABS[0],
    [active],
  );

  const filteredItems = useMemo(() => {
    const allowed = TAB_FILTER[active];
    if (!allowed.length) return [];
    return items.filter((item) => allowed.includes(item.type));
  }, [items, active]);

  const muteOptions = useMemo(
    () => [
      { key: "5m", label: "5 minutes", ms: 5 * 60 * 1000 },
      { key: "10m", label: "10 minutes", ms: 10 * 60 * 1000 },
      { key: "15m", label: "15 minutes", ms: 15 * 60 * 1000 },
      { key: "30m", label: "30 minutes", ms: 30 * 60 * 1000 },
      { key: "1h", label: "1 hour", ms: 60 * 60 * 1000 },
      { key: "1d", label: "1 day", ms: 24 * 60 * 60 * 1000 },
      { key: "until", label: "Until I turn it back on", ms: null },
      { key: "custom", label: "Choose date & time", ms: null },
    ],
    [],
  );

  const muteTarget = useMemo(
    () =>
      muteTargetId ? items.find((item) => item.id === muteTargetId) : null,
    [items, muteTargetId],
  );

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
      setError("Session expired. Please sign in again.");
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
            : "Unable to load notifications";
        setError(message);
      })
      .finally(() => setLoading(false));
  }, [open]);

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
    return () =>
      window.removeEventListener(
        NOTIFICATION_RECEIVED_EVENT,
        handleNotification,
      );
  }, [open]);

  useEffect(() => {
    if (!openMenuId) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest(`[data-notification-menu-root="${openMenuId}"]`)) {
        return;
      }
      setOpenMenuId(null);
    };

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [openMenuId]);

  useEffect(() => {
    if (!loginAlertItem) {
      setNotMeOpen(false);
      setNotMeError(null);
      setNotMeSubmitting(false);
    }
  }, [loginAlertItem]);

  const showToast = (message: string, duration = 1800) => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    setToastMessage(message);
    toastTimerRef.current = setTimeout(() => setToastMessage(null), duration);
  };

  const handleItemClick = (item: NotificationItem) => {
    setOpenMenuId(null);
    if (item.type === "login_alert") {
      if (!item.readAt) {
        const token = getStoredAccessToken();
        if (token) {
          void markNotificationRead({
            token,
            notificationId: item.id,
          }).catch(() => undefined);
        }
        setItems((prev) =>
          prev.map((entry) =>
            entry.id === item.id
              ? { ...entry, readAt: new Date().toISOString() }
              : entry,
          ),
        );
        emitNotificationRead({ id: item.id });
      }
      setLoginAlertItem(item);
      return;
    }
    const targetUrl = item.postId
      ? `/post/${item.postId}`
      : item.type === "follow" && item.actor?.id
        ? `/profile/${item.actor.id}`
        : null;
    if (!targetUrl) return;
    if (!item.readAt) {
      const token = getStoredAccessToken();
      if (token) {
        void markNotificationRead({
          token,
          notificationId: item.id,
        }).catch(() => undefined);
      }
      setItems((prev) =>
        prev.map((entry) =>
          entry.id === item.id
            ? { ...entry, readAt: new Date().toISOString() }
            : entry,
        ),
      );
      emitNotificationRead({ id: item.id });
    }
    onClose();
    router.push(targetUrl);
  };

  const isMutedForItem = (item: NotificationItem) => {
    if (item.postMutedIndefinitely) return true;
    if (item.postMutedUntil) {
      const dt = new Date(item.postMutedUntil);
      if (!Number.isNaN(dt.getTime()) && dt.getTime() > Date.now()) {
        return true;
      }
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
      void markNotificationUnread({
        token,
        notificationId: item.id,
      }).catch(() => undefined);
      setItems((prev) =>
        prev.map((entry) =>
          entry.id === item.id ? { ...entry, readAt: null } : entry,
        ),
      );
    } else {
      void markNotificationRead({
        token,
        notificationId: item.id,
      }).catch(() => undefined);
      setItems((prev) =>
        prev.map((entry) =>
          entry.id === item.id
            ? { ...entry, readAt: new Date().toISOString() }
            : entry,
        ),
      );
      emitNotificationRead({ id: item.id });
    }
    setOpenMenuId(null);
  };

  const handleDeleteNotification = (item: NotificationItem) => {
    const token = getStoredAccessToken();
    if (!token) return;
    void deleteNotification({ token, notificationId: item.id }).catch(
      () => undefined,
    );
    setItems((prev) => prev.filter((entry) => entry.id !== item.id));
    if (loginAlertItem?.id === item.id) {
      setLoginAlertItem(null);
    }
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
          : "Failed to update notifications";
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
    return item.deviceType ? `${item.deviceType} device` : "Unknown device";
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
      setNotMeError("Unable to identify the device for logout.");
      return;
    }
    const token = getStoredAccessToken();
    if (!token) {
      setNotMeError("Session expired. Please sign in again.");
      return;
    }

    setNotMeSubmitting(true);
    setNotMeError(null);
    try {
      await logoutLoginDevice({
        token,
        deviceIdHash: loginAlertItem.deviceIdHash,
      });
      showToast("Device signed out");
      setNotMeOpen(false);
      setLoginAlertItem(null);
    } catch (err) {
      const message =
        typeof err === "object" && err && "message" in err
          ? String((err as { message?: string }).message)
          : "Unable to log out the device.";
      setNotMeError(message);
    } finally {
      setNotMeSubmitting(false);
    }
  };

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
            <p className={styles.kicker}>Notifications</p>
            <h2 className={styles.title}>Activity</h2>
          </div>
          <button className={styles.close} type="button" onClick={onClose}>
            <IconClose />
          </button>
        </div>

        <div className={styles.tabs}>
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`${styles.tab} ${
                tab.key === active ? styles.tabActive : ""
              }`}
              onClick={() => setActive(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className={styles.body}>
          {loading ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>{activeTab.icon}</div>
              <h3 className={styles.emptyTitle}>Loading</h3>
              <p className={styles.emptyText}>Fetching notifications...</p>
            </div>
          ) : error ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>{activeTab.icon}</div>
              <h3 className={styles.emptyTitle}>Unable to load</h3>
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
                  } ${openMenuId === item.id ? styles.listItemMenuOpen : ""}`}
                  onClick={() => handleItemClick(item)}
                  role={
                    item.postId || item.type === "follow" ? "button" : undefined
                  }
                  tabIndex={
                    item.postId || item.type === "follow" ? 0 : undefined
                  }
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
                      src={item.actor.avatarUrl}
                      alt={item.actor.displayName}
                      width={44}
                      height={44}
                      className={styles.avatar}
                    />
                  </div>
                  <div className={styles.itemContent}>
                    <p className={styles.itemText}>{buildMessage(item)}</p>
                    <span className={styles.itemTime}>
                      {formatRelativeTime(item.activityAt || item.createdAt)}
                    </span>
                  </div>
                  <div
                    className={styles.itemActions}
                    data-notification-menu-root={item.id}
                    onClick={(event) => {
                      event.stopPropagation();
                      setOpenMenuId((prev) =>
                        prev === item.id ? null : item.id,
                      );
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                  >
                    <button
                      type="button"
                      className={`${styles.itemMenuButton} ${
                        openMenuId === item.id
                          ? styles.itemMenuButtonVisible
                          : ""
                      }`}
                      aria-haspopup="true"
                      aria-expanded={openMenuId === item.id}
                    >
                      <IconDots />
                    </button>
                    {!item.readAt ? (
                      <span className={styles.itemDot} aria-hidden="true" />
                    ) : null}
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
                          {item.readAt ? "Mark as unread" : "Mark as read"}
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
                            {item.postKind === "reel"
                              ? "Mute this reel"
                              : "Mute this post"}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className={`${styles.itemMenuItem} ${
                            styles.itemMenuDanger
                          }`}
                          role="menuitem"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleDeleteNotification(item);
                          }}
                        >
                          Delete notification
                        </button>
                      </div>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
      {loginAlertItem ? (
        <div className={styles.detailBackdrop}>
          <div
            className={styles.detailCard}
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.detailHeader}>
              <h3 className={styles.detailTitle}>New device sign-in</h3>
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
                <span>Device</span>
                <span>{resolveLoginDeviceName(loginAlertItem)}</span>
              </div>
              <div className={styles.detailRow}>
                <span>Location</span>
                <span>
                  {loginAlertItem.location?.trim()
                    ? loginAlertItem.location
                    : "Unknown location"}
                </span>
              </div>
              <div className={styles.detailRow}>
                <span>Time</span>
                <span>
                  {formatExactTime(
                    loginAlertItem.loginAt || loginAlertItem.createdAt,
                  )}
                </span>
              </div>
            </div>
            <div className={styles.detailActions}>
              <button
                type="button"
                className={styles.detailSecondary}
                onClick={handleConfirmLogin}
              >
                This was me
              </button>
              <button
                type="button"
                className={styles.detailDanger}
                onClick={handleNotMe}
              >
                This wasn't me
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
              <h3 className={styles.notMeTitle}>Secure your account</h3>
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
            <p className={styles.notMeBody}>
              If this wasn't you, log out the device and update your password.
            </p>
            {notMeError ? (
              <div className={styles.notMeError}>{notMeError}</div>
            ) : null}
            <div className={styles.notMeActions}>
              <button
                type="button"
                className={styles.notMeSecondary}
                onClick={handleLogoutSuspiciousDevice}
                disabled={notMeSubmitting}
              >
                {notMeSubmitting ? "Logging out..." : "Logout this device"}
              </button>
              <button
                type="button"
                className={styles.notMePrimary}
                onClick={() => {
                  setNotMeOpen(false);
                  setLoginAlertItem(null);
                  showToast("Opening password settings");
                  router.push("/settings?section=privacy&changePassword=1");
                }}
                disabled={notMeSubmitting}
              >
                Change your password
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
          <div
            className={styles.muteCard}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.muteHeader}>
              <div>
                <h3 className={styles.muteTitle}>Mute notifications</h3>
                <p className={styles.muteBody}>
                  Choose how long to pause alerts for this{" "}
                  {muteTarget.postKind === "reel" ? "reel" : "post"}.
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
                  className={`${styles.muteOption} ${
                    muteOption === option.key ? styles.muteOptionActive : ""
                  }`}
                  onClick={() => setMuteOption(option.key)}
                >
                  <span className={styles.muteOptionTitle}>{option.label}</span>
                </button>
              ))}
            </div>

            {muteOption === "custom" ? (
              <div className={styles.muteCustomRow}>
                <div className={styles.mutePicker}>
                  <label className={styles.muteLabel}>Date</label>
                  <DateSelect
                    value={muteCustomDate}
                    onChange={setMuteCustomDate}
                    minDate={new Date()}
                    maxDate={null}
                    placeholder="yyyy-mm-dd"
                  />
                </div>
                <div className={styles.mutePicker}>
                  <label className={styles.muteLabel}>Time</label>
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
              <div className={styles.muteError}>{muteError}</div>
            ) : null}

            <div className={styles.muteActions}>
              <button
                type="button"
                className={styles.muteSecondary}
                onClick={closeMuteModal}
                disabled={muteSaving}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.mutePrimary}
                onClick={handleSaveMute}
                disabled={muteSaving}
              >
                {muteSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
