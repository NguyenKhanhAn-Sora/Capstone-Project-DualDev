const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE?.replace(/\/$/, "") ?? "https://cordigram-api.onrender.com";

function getHeaders(): Record<string, string> {
  const token = localStorage.getItem("accessToken") || localStorage.getItem("token") || "";
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

export interface InboxEventItem {
  type: "event";
  _id: string;
  serverId: string;
  serverName: string;
  serverAvatarUrl?: string | null;
  channelId?: { _id: string; name: string; type: string } | null;
  topic: string;
  startAt: string;
  endAt: string;
  status?: string;
  description?: string | null;
  coverImageUrl?: string | null;
  createdAt: string;
  seen?: boolean;
}

export interface InboxServerInviteItem {
  type: "server_invite";
  _id: string;
  serverId: string;
  serverName: string;
  serverAvatarUrl?: string | null;
  inviterId: string;
  inviterDisplay: string;
  createdAt: string;
  seen?: boolean;
}

export interface InboxServerNotificationItem {
  type: "server_notification";
  _id: string;
  serverId: string;
  serverName: string;
  serverAvatarUrl?: string | null;
  title: string;
  content: string;
  targetRoleName?: string | null;
  createdAt: string;
  seen?: boolean;
}

export type InboxForYouItem =
  | InboxEventItem
  | InboxServerInviteItem
  | InboxServerNotificationItem;

export interface InboxForYouResponse {
  items: InboxForYouItem[];
}

export interface InboxUnreadDmItem {
  type: "dm";
  userId: string;
  displayName: string;
  username: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
}

export interface InboxUnreadChannelItem {
  type: "channel";
  channelId: string;
  channelName: string;
  serverId: string;
  serverName: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount?: number;
}

export type InboxUnreadItem = InboxUnreadDmItem | InboxUnreadChannelItem;

export interface InboxUnreadResponse {
  items: InboxUnreadItem[];
}

export interface InboxMentionItem {
  id: string;
  channelId: string;
  channelName: string;
  serverId: string;
  serverName: string;
  messageId: string;
  actorName: string;
  excerpt?: string;
  createdAt: string;
}

export interface InboxMentionsResponse {
  items: InboxMentionItem[];
}

export async function fetchInboxForYou(): Promise<InboxForYouResponse> {
  const res = await fetch(`${API_BASE_URL}/inbox/for-you`, { headers: getHeaders() });
  if (!res.ok) throw new Error("Không tải được mục dành cho bạn");
  return res.json();
}

/** Đánh dấu một mục (Dành cho Bạn / đề cập kênh) là đã xem. */
export async function markInboxSeen(
  sourceType:
    | "event"
    | "server_invite"
    | "server_notification"
    | "channel_mention",
  sourceId: string,
): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/inbox/seen`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ sourceType, sourceId }),
  });
  if (!res.ok) throw new Error("Không đánh dấu được đã xem");
}

export async function fetchInboxUnread(): Promise<InboxUnreadResponse> {
  const res = await fetch(`${API_BASE_URL}/inbox/unread`, { headers: getHeaders() });
  if (!res.ok) throw new Error("Không tải được tin chưa đọc");
  return res.json();
}

export async function fetchInboxMentions(): Promise<InboxMentionsResponse> {
  const res = await fetch(`${API_BASE_URL}/inbox/mentions`, { headers: getHeaders() });
  if (!res.ok) throw new Error("Không tải được đề cập");
  return res.json();
}
