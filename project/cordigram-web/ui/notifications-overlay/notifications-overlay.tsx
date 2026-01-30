"use client";

import Image from "next/image";
import { JSX, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./notifications-overlay.module.css";
import {
  fetchNotifications,
  markNotificationRead,
  type NotificationItem,
} from "@/lib/api";
import { getStoredAccessToken } from "@/lib/auth";
import {
  NOTIFICATION_RECEIVED_EVENT,
  emitNotificationRead,
  type NotificationReceivedDetail,
} from "@/lib/events";

type TabKey = "all" | "likes" | "comments" | "mentions" | "followers";

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

const TABS: TabConfig[] = [
  {
    key: "all",
    label: "All activity",
    emptyTitle: "Nothing here yet",
    emptyText: "When you get notifications, they will appear here.",
    icon: <IconBell />,
  },
  {
    key: "likes",
    label: "Likes",
    emptyTitle: "Likes on your posts",
    emptyText: "When someone likes your content, you’ll see it here.",
    icon: <IconHeart />,
  },
  {
    key: "comments",
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
    key: "followers",
    label: "Followers",
    emptyTitle: "New followers",
    emptyText: "When someone follows you, you’ll see it here.",
    icon: <IconUser />,
  },
];

const TAB_FILTER: Record<TabKey, Array<NotificationItem["type"]>> = {
  all: ["post_like", "post_comment"],
  likes: ["post_like"],
  comments: ["post_comment"],
  mentions: [],
  followers: [],
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

function buildMessage(item: NotificationItem): JSX.Element {
  if (item.type === "post_like") {
    const name = item.actor.username
      ? `@${item.actor.username}`
      : item.actor.displayName || "Someone";
    const othersCount = Math.max(0, (item.likeCount ?? 1) - 1);
    const othersLabel =
      othersCount === 1 ? "1 other" : `${othersCount} others`;
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
    const othersLabel =
      othersCount === 1 ? "1 other" : `${othersCount} others`;
    const targetLabel = item.postKind === "reel" ? "reel" : "post";
    return (
      <>
        <span className={styles.itemName}>{name}</span>
        {othersCount > 0 ? ` and ${othersLabel}` : ""} commented on your {targetLabel}
      </>
    );
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

  const activeTab = useMemo(
    () => TABS.find((tab) => tab.key === active) ?? TABS[0],
    [active],
  );

  const filteredItems = useMemo(() => {
    const allowed = TAB_FILTER[active];
    if (!allowed.length) return [];
    return items.filter((item) => allowed.includes(item.type));
  }, [items, active]);

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

  const handleItemClick = (item: NotificationItem) => {
    if (!item.postId) return;
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
    router.push(`/post/${item.postId}`);
  };

  if (!open) return null;

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
                  }`}
                  onClick={() => handleItemClick(item)}
                  role={item.postId ? "button" : undefined}
                  tabIndex={item.postId ? 0 : undefined}
                  onKeyDown={(event) => {
                    if (!item.postId) return;
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
                      {formatRelativeTime(item.createdAt)}
                    </span>
                  </div>
                  {!item.readAt ? (
                    <span className={styles.itemDot} aria-hidden="true" />
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}
