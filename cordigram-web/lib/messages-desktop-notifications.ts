import type { InboxForYouItem } from "@/lib/inbox-api";

const DEDUPE_MS = 8000;
const APP_ICON = "/logo.png";
const recentKeys = new Map<string, number>();

export type MessagesDesktopNotificationKind =
  | "mention"
  | "event"
  | "role_notification";

export type MessagesDesktopNotificationPayload = {
  id: string;
  kind: MessagesDesktopNotificationKind;
  /** Dòng tiêu đề đậm (giống Discord: user + kênh + server). */
  titleLine: string;
  body: string;
  avatarUrl?: string | null;
  onNavigate?: () => void;
};

export type MessagesDesktopNotificationCopy = {
  eventTitleLine: (topic: string, serverName: string) => string;
  eventBody: (topic: string, startAt?: string) => string;
  roleTitleLine: (serverName: string) => string;
  roleBody: (title: string, content: string) => string;
  mentionTitleLine: (
    senderName: string,
    channelName: string,
    serverName: string,
  ) => string;
};

export const MESSAGES_DESKTOP_NOTIFICATION_EVENT =
  "cordigram-messages-desktop-notification";

function pruneRecent(now: number): void {
  for (const [key, ts] of recentKeys) {
    if (now - ts > DEDUPE_MS) recentKeys.delete(key);
  }
}

function shouldDedupe(id: string): boolean {
  const now = Date.now();
  pruneRecent(now);
  if (recentKeys.has(id)) return true;
  recentKeys.set(id, now);
  return false;
}

export function isMessagesDesktopNotificationsEnabled(
  settings?: { chatDesktopNotificationsEnabled?: boolean } | null,
): boolean {
  return settings?.chatDesktopNotificationsEnabled !== false;
}

export function getDesktopNotificationPermission():
  | NotificationPermission
  | "unsupported" {
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

export function formatMentionDesktopNotification(input: {
  messageId: string;
  senderName: string;
  channelName: string;
  serverName: string;
  excerpt: string;
  senderAvatarUrl?: string | null;
}): MessagesDesktopNotificationPayload {
  const senderName = input.senderName?.trim() || "Ai đó";
  const channelName = input.channelName?.trim() || "general";
  const serverName = input.serverName?.trim() || "Máy chủ";
  return {
    id: `mention:${input.messageId}`,
    kind: "mention",
    titleLine: `${senderName} (#${channelName}, ${serverName})`,
    body: (input.excerpt || "").trim().slice(0, 240) || "Bạn được đề cập.",
    avatarUrl: input.senderAvatarUrl ?? null,
  };
}

export function formatInboxForYouDesktopNotification(
  item: InboxForYouItem,
  copy: MessagesDesktopNotificationCopy,
): MessagesDesktopNotificationPayload | null {
  if (item.type === "server_invite") return null;
  if (item.type === "event") {
    const topic = item.topic?.trim() || "Sự kiện";
    const serverName = item.serverName?.trim() || "Máy chủ";
    return {
      id: `event:${item._id}`,
      kind: "event",
      titleLine: copy.eventTitleLine(topic, serverName),
      body: copy.eventBody(topic, item.startAt),
      avatarUrl: item.serverAvatarUrl ?? item.coverImageUrl ?? null,
    };
  }
  const title = item.title?.trim() || "Thông báo";
  const content = (item.content || "").trim();
  const serverName = item.serverName?.trim() || "Máy chủ";
  return {
    id: `role:${item._id}`,
    kind: "role_notification",
    titleLine: copy.roleTitleLine(serverName),
    body: copy.roleBody(title, content),
    avatarUrl: item.serverAvatarUrl ?? null,
  };
}

function dispatchCustomToast(payload: MessagesDesktopNotificationPayload): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(
      new CustomEvent(MESSAGES_DESKTOP_NOTIFICATION_EVENT, { detail: payload }),
    );
  } catch {
    // ignore
  }
}

function showNativeNotification(
  payload: MessagesDesktopNotificationPayload,
): boolean {
  if (typeof window === "undefined" || typeof Notification === "undefined") {
    return false;
  }
  if (Notification.permission !== "granted") return false;

  try {
    const icon = payload.avatarUrl || APP_ICON;
    const notification = new Notification(payload.titleLine, {
      body: payload.body,
      icon,
      badge: APP_ICON,
      tag: payload.id,
      silent: false,
    });
    notification.onclick = () => {
      try {
        window.focus();
      } catch {
        // ignore
      }
      notification.close();
      payload.onNavigate?.();
    };
    return true;
  } catch {
    return false;
  }
}

export function showMessagesDesktopNotification(opts: {
  payload: MessagesDesktopNotificationPayload;
  enabled?: boolean;
}): boolean {
  const { payload, enabled = true } = opts;
  if (!enabled) return false;
  if (shouldDedupe(payload.id)) return false;

  dispatchCustomToast(payload);
  showNativeNotification(payload);
  return true;
}

export function showInboxForYouDesktopNotification(opts: {
  item: InboxForYouItem;
  copy: MessagesDesktopNotificationCopy;
  enabled?: boolean;
  onNavigate?: (item: InboxForYouItem) => void;
}): boolean {
  const { item, copy, enabled = true, onNavigate } = opts;
  const payload = formatInboxForYouDesktopNotification(item, copy);
  if (!payload) return false;
  payload.onNavigate = () => onNavigate?.(item);
  return showMessagesDesktopNotification({ payload, enabled });
}

export function showMentionDesktopNotification(opts: {
  messageId: string;
  senderName: string;
  channelName: string;
  serverName: string;
  excerpt: string;
  senderAvatarUrl?: string | null;
  enabled?: boolean;
  onNavigate?: () => void;
}): boolean {
  const payload = formatMentionDesktopNotification(opts);
  payload.onNavigate = opts.onNavigate;
  return showMessagesDesktopNotification({
    payload,
    enabled: opts.enabled,
  });
}
