export const CURRENT_PROFILE_UPDATED_EVENT =
  "cordigram:current-profile-updated" as const;

export const NOTIFICATION_RECEIVED_EVENT =
  "cordigram:notification-received" as const;

export const NOTIFICATION_READ_EVENT = "cordigram:notification-read" as const;

export type NotificationReceivedDetail = {
  notification: {
    id: string;
    type: "post_like" | "post_comment" | "post_mention" | "follow";
    actor: {
      id: string;
      displayName: string;
      username: string;
      avatarUrl: string;
    };
    postId: string | null;
    postKind: "post" | "reel";
    likeCount: number;
    commentCount: number;
    mentionCount: number;
    mentionSource: "post" | "comment";
    readAt: string | null;
    createdAt: string;
    activityAt: string;
  };
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
