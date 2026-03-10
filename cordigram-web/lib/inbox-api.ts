const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE?.replace(/\/$/, "") ?? "http://localhost:9999";

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

export type InboxForYouItem = InboxEventItem | InboxServerInviteItem;

export interface InboxForYouResponse {
  items: InboxForYouItem[];
}

export interface InboxUnreadItem {
  channelId: string;
  channelName: string;
  serverId: string;
  serverName: string;
  unreadCount: number;
  lastMessageAt?: string;
}

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

/** Đánh dấu một mục (event hoặc server_invite) trong Dành cho Bạn là đã xem. */
export async function markInboxSeen(
  sourceType: "event" | "server_invite",
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
