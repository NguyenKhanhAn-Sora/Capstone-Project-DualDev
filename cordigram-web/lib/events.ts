export const CURRENT_PROFILE_UPDATED_EVENT =
  "cordigram:current-profile-updated" as const;

export const NOTIFICATION_RECEIVED_EVENT =
  "cordigram:notification-received" as const;

export const NOTIFICATION_READ_EVENT = "cordigram:notification-read" as const;

export type NotificationReceivedDetail = {
  notification: {
    id: string;
    type:
      | "post_like"
      | "comment_like"
      | "comment_reply"
      | "post_comment"
      | "post_mention"
      | "follow"
      | "login_alert"
      | "report";
    actor: {
      id: string;
      displayName: string;
      username: string;
      avatarUrl: string;
    };
    postId: string | null;
    commentId: string | null;
    postKind: "post" | "reel";
    likeCount: number;
    commentCount: number;
    mentionCount: number;
    mentionSource: "post" | "comment";
    reportOutcome?: "no_violation" | "action_taken" | null;
    reportAudience?: "reporter" | "offender" | null;
    reportTargetType?: "post" | "comment" | "user" | null;
    reportAction?: string | null;
    reportTargetId?: string | null;
    reportSeverity?: "low" | "medium" | "high" | null;
    reportStrikeDelta?: number | null;
    reportStrikeTotal?: number | null;
    reportReason?: string | null;
    reportActionExpiresAt?: string | null;
    readAt: string | null;
    createdAt: string;
    activityAt: string;
    deviceInfo?: string;
    deviceType?: string;
    os?: string;
    browser?: string;
    location?: string;
    ip?: string;
    deviceIdHash?: string;
    loginAt?: string | null;
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
