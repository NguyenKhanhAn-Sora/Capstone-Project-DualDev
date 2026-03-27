import type { NotificationItem } from "@/lib/api";

export const CURRENT_PROFILE_UPDATED_EVENT =
  "cordigram:current-profile-updated" as const;

export const NOTIFICATION_RECEIVED_EVENT =
  "cordigram:notification-received" as const;

export const NOTIFICATION_READ_EVENT = "cordigram:notification-read" as const;

export type NotificationReceivedDetail = {
  notification: NotificationItem;
};

export type NotificationReadDetail = {
  id: string;
};

export function emitCurrentProfileUpdated(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CURRENT_PROFILE_UPDATED_EVENT));
}

export function emitNotificationReceived(
  detail: NotificationReceivedDetail,
): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(NOTIFICATION_RECEIVED_EVENT, { detail }),
  );
}

export function emitNotificationRead(detail: NotificationReadDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(NOTIFICATION_READ_EVENT, { detail }));
}
