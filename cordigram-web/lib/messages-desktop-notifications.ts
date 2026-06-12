import type { InboxForYouItem } from "@/lib/inbox-api";

const DEDUPE_MS = 8000;
const recentKeys = new Map<string, number>();

export type MessagesDesktopNotificationCopy = {
  eventTitle: (topic: string) => string;
  eventBody: (serverName: string) => string;
  roleTitle: (title: string) => string;
  roleBody: (serverName: string, excerpt: string) => string;
};

function pruneRecent(now: number): void {
  for (const [key, ts] of recentKeys) {
    if (now - ts > DEDUPE_MS) recentKeys.delete(key);
  }
}

function shouldDedupe(type: string, id: string): boolean {
  const now = Date.now();
  pruneRecent(now);
  const key = `${type}:${id}`;
  if (recentKeys.has(key)) return true;
  recentKeys.set(key, now);
  return false;
}

export function isMessagesDesktopNotificationsEnabled(
  settings?: { chatDesktopNotificationsEnabled?: boolean } | null,
): boolean {
  return settings?.chatDesktopNotificationsEnabled !== false;
}

export function getDesktopNotificationPermission(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || typeof Notification === "undefined") {
    return "unsupported";
  }
  return Notification.permission;
}

export async function requestDesktopNotificationPermission(): Promise<
  NotificationPermission | "unsupported"
> {
  if (typeof window === "undefined" || typeof Notification === "undefined") {
    return "unsupported";
  }
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export function shouldShowMessagesDesktopNotification(): boolean {
  if (typeof document === "undefined") return false;
  return document.visibilityState === "hidden" || !document.hasFocus();
}

export function formatInboxForYouDesktopNotification(
  item: InboxForYouItem,
  copy: MessagesDesktopNotificationCopy,
): { title: string; body: string } | null {
  if (item.type === "server_invite") return null;
  if (item.type === "event") {
    const topic = item.topic?.trim() || "Sự kiện";
    return {
      title: copy.eventTitle(topic),
      body: copy.eventBody(item.serverName?.trim() || "Máy chủ"),
    };
  }
  const title = item.title?.trim() || "Thông báo";
  const excerpt = (item.content || "").trim().slice(0, 180);
  return {
    title: copy.roleTitle(title),
    body: copy.roleBody(item.serverName?.trim() || "Máy chủ", excerpt),
  };
}

export function showInboxForYouDesktopNotification(opts: {
  item: InboxForYouItem;
  copy: MessagesDesktopNotificationCopy;
  enabled?: boolean;
  iconUrl?: string | null;
  onNavigate?: (item: InboxForYouItem) => void;
}): boolean {
  const { item, copy, enabled = true, iconUrl, onNavigate } = opts;
  if (!enabled) return false;
  if (item.type === "server_invite") return false;
  if (typeof window === "undefined" || typeof Notification === "undefined") {
    return false;
  }
  if (Notification.permission !== "granted") return false;
  if (!shouldShowMessagesDesktopNotification()) return false;
  if (shouldDedupe(item.type, item._id)) return false;

  const formatted = formatInboxForYouDesktopNotification(item, copy);
  if (!formatted) return false;

  try {
    const notification = new Notification(formatted.title, {
      body: formatted.body,
      icon: iconUrl || "/favicon.ico",
      tag: `${item.type}:${item._id}`,
      silent: false,
    });
    notification.onclick = () => {
      try {
        window.focus();
      } catch {
        // ignore
      }
      notification.close();
      onNavigate?.(item);
    };
    return true;
  } catch {
    return false;
  }
}
