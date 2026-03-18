import { decodeJwt } from "./auth";

const API_BASE_URL = "http://localhost:9999";

function getToken(): string {
  return (
    localStorage.getItem("accessToken") || localStorage.getItem("token") || ""
  );
}

function getHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${getToken()}`,
  };
}

function getCurrentUserId(): string | null {
  const token = getToken();
  if (!token) return null;
  const payload = decodeJwt(token) as { userId?: string; sub?: string } | null;
  return payload?.userId ?? payload?.sub ?? null;
}

export type ServerTemplate =
  | "custom"
  | "gaming"
  | "friends"
  | "study-group"
  | "school-club"
  | "local-community"
  | "artists-creators";

export type ServerPurpose = "club-community" | "me-and-friends";

export interface Server {
  _id: string;
  name: string;
  description?: string;
  avatarUrl?: string;
  template?: ServerTemplate;
  purpose?: ServerPurpose;
  ownerId: string;
  members: Array<{
    userId: string;
    role: "owner" | "moderator" | "member";
    joinedAt: string;
  }>;
  channels: Channel[];
  memberCount: number;
  isActive: boolean;
  isPublic?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Channel {
  _id: string;
  name: string;
  type: "text" | "voice" | "thread";
  description?: string;
  serverId: string;
  createdBy: string;
  isDefault: boolean;
  isPrivate?: boolean;
  parentChannelId?: string;
  threads?: string[];
  messageCount: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  _id: string;
  channelId: string;
  senderId: {
    _id: string;
    email: string;
    displayName?: string;
    username?: string;
    avatarUrl?: string;
  };
  content: string;
  attachments: string[];
  reactions: Array<{
    userId: string;
    emoji: string;
  }>;
  isEdited?: boolean;
  editedAt?: string;
  isDeleted?: boolean;
  createdAt: string;
  updatedAt: string;
  replyTo?: string | {
    _id: string;
    content: string;
    senderId?: { _id: string; email?: string; displayName?: string; username?: string };
  };
}

export interface Friend {
  _id: string;
  displayName: string;
  username: string;
  avatarUrl: string;
  email: string;
  bio?: string;
}

// Servers
export async function createServer(
  name: string,
  description?: string,
  avatarUrl?: string,
  template?: ServerTemplate,
  purpose?: ServerPurpose,
): Promise<Server> {
  const response = await fetch(`${API_BASE_URL}/servers`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ name, description, avatarUrl, template, purpose }),
  });

  if (!response.ok) {
    throw new Error("Không tạo được máy chủ");
  }

  return response.json();
}

export async function getMyServers(): Promise<Server[]> {
  const response = await fetch(`${API_BASE_URL}/servers`, {
    headers: getHeaders(),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error("API Error:", response.status, errorData);
    throw new Error(errorData.message || "Không tải được danh sách máy chủ");
  }

  return response.json();
}

export async function getServer(serverId: string): Promise<Server> {
  const response = await fetch(`${API_BASE_URL}/servers/${serverId}`, {
    headers: getHeaders(),
  });

  if (!response.ok) {
    throw new Error("Không tải được thông tin máy chủ");
  }

  return response.json();
}

export async function updateServer(
  serverId: string,
  name?: string,
  description?: string,
  avatarUrl?: string,
): Promise<Server> {
  const response = await fetch(`${API_BASE_URL}/servers/${serverId}`, {
    method: "PATCH",
    headers: getHeaders(),
    body: JSON.stringify({ name, description, avatarUrl }),
  });

  if (!response.ok) {
    throw new Error("Không cập nhật được máy chủ");
  }

  return response.json();
}

export async function deleteServer(serverId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/servers/${serverId}`, {
    method: "DELETE",
    headers: getHeaders(),
  });

  if (!response.ok) {
    throw new Error("Không xóa được máy chủ");
  }
}

export type ServerMemberRow = {
  userId: string;
  displayName: string;
  username: string;
  avatarUrl: string;
  joinedAt: string;
  joinedCordigramAt: string;
  joinMethod: "owner" | "invited" | "link";
  invitedBy?: { id: string; username: string };
  role: string;
};

/** Danh sách thành viên máy chủ (chỉ chủ server). */
export async function getServerMembers(
  serverId: string,
): Promise<ServerMemberRow[]> {
  const response = await fetch(
    `${API_BASE_URL}/servers/${serverId}/members`,
    { headers: getHeaders() },
  );
  if (!response.ok) {
    if (response.status === 403) {
      throw new Error("Chỉ chủ máy chủ mới xem được danh sách thành viên");
    }
    throw new Error("Không tải được danh sách thành viên");
  }
  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

/** Chuyển quyền sở hữu máy chủ: chỉ chủ hiện tại mới gọi được. newOwnerId trở thành chủ, chủ cũ trở thành thành viên. */
export async function transferServerOwnership(
  serverId: string,
  newOwnerId: string,
): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/servers/${serverId}/transfer-ownership`,
    {
      method: "PATCH",
      headers: getHeaders(),
      body: JSON.stringify({ newOwnerId }),
    },
  );
  if (!response.ok) {
    const text = await response.text();
    let msg = "Không chuyển được quyền sở hữu";
    try {
      const j = JSON.parse(text);
      if (j.message) msg = j.message;
    } catch (_) {}
    throw new Error(msg);
  }
}

export type PruneRoleFilter = "all" | "none" | "member" | "moderator";

// ===================== ROLES API =====================

/**
 * Interface định nghĩa tất cả permissions cho một role
 */
export interface RolePermissions {
  // Quyền Quản Lý Máy Chủ
  manageServer: boolean;
  manageChannels: boolean;
  manageEvents: boolean;

  // Quyền Thành Viên
  createInvite: boolean;
  changeNickname: boolean;
  manageNicknames: boolean;
  kickMembers: boolean;
  banMembers: boolean;
  timeoutMembers: boolean;

  // Quyền Kênh Tin Nhắn
  sendMessages: boolean;
  sendMessagesInThreads: boolean;
  createPublicThreads: boolean;
  createPrivateThreads: boolean;
  embedLinks: boolean;
  attachFiles: boolean;
  addReactions: boolean;
  manageMessages: boolean;
  pinMessages: boolean;
  bypassSlowMode: boolean;
  manageThreads: boolean;
  viewMessageHistory: boolean;
  sendTTS: boolean;
  sendVoiceMessages: boolean;
  createPolls: boolean;

  // Quyền Kênh Thoại
  connect: boolean;
  speak: boolean;
  video: boolean;
  muteMembers: boolean;
  deafenMembers: boolean;
  moveMembers: boolean;
  setVoiceChannelStatus: boolean;
}

export interface Role {
  _id: string;
  name: string;
  color: string;
  icon: string | null;
  serverId: string;
  position: number;
  displaySeparately: boolean;
  mentionable: boolean;
  isDefault: boolean;
  permissions: RolePermissions;
  memberIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateRolePayload {
  name: string;
  color?: string;
  icon?: string;
  position?: number;
  displaySeparately?: boolean;
  mentionable?: boolean;
  permissions?: Partial<RolePermissions>;
}

export interface UpdateRolePayload {
  name?: string;
  color?: string;
  icon?: string;
  position?: number;
  displaySeparately?: boolean;
  mentionable?: boolean;
  permissions?: Partial<RolePermissions>;
}

/** Lấy danh sách tất cả roles của server */
export async function getRoles(serverId: string): Promise<Role[]> {
  const response = await fetch(
    `${API_BASE_URL}/servers/${serverId}/roles`,
    { headers: getHeaders() },
  );
  if (!response.ok) {
    throw new Error("Không tải được danh sách vai trò");
  }
  return response.json();
}

/** Lấy chi tiết một role */
export async function getRole(serverId: string, roleId: string): Promise<Role> {
  const response = await fetch(
    `${API_BASE_URL}/servers/${serverId}/roles/${roleId}`,
    { headers: getHeaders() },
  );
  if (!response.ok) {
    throw new Error("Không tải được thông tin vai trò");
  }
  return response.json();
}

/** Tạo role mới */
export async function createRole(
  serverId: string,
  payload: CreateRolePayload,
): Promise<Role> {
  const response = await fetch(
    `${API_BASE_URL}/servers/${serverId}/roles`,
    {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(payload),
    },
  );
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "Không tạo được vai trò");
  }
  return response.json();
}

/** Cập nhật role */
export async function updateRole(
  serverId: string,
  roleId: string,
  payload: UpdateRolePayload,
): Promise<Role> {
  const response = await fetch(
    `${API_BASE_URL}/servers/${serverId}/roles/${roleId}`,
    {
      method: "PATCH",
      headers: getHeaders(),
      body: JSON.stringify(payload),
    },
  );
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "Không cập nhật được vai trò");
  }
  return response.json();
}

/** Xóa role */
export async function deleteRole(
  serverId: string,
  roleId: string,
): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/servers/${serverId}/roles/${roleId}`,
    {
      method: "DELETE",
      headers: getHeaders(),
    },
  );
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "Không xóa được vai trò");
  }
}

/** Sắp xếp lại thứ tự roles */
export async function reorderRoles(
  serverId: string,
  roleIds: string[],
): Promise<Role[]> {
  const response = await fetch(
    `${API_BASE_URL}/servers/${serverId}/roles/reorder`,
    {
      method: "PATCH",
      headers: getHeaders(),
      body: JSON.stringify({ roleIds }),
    },
  );
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "Không sắp xếp được thứ tự vai trò");
  }
  return response.json();
}

/** Lấy danh sách member IDs của role */
export async function getRoleMembers(
  serverId: string,
  roleId: string,
): Promise<string[]> {
  const response = await fetch(
    `${API_BASE_URL}/servers/${serverId}/roles/${roleId}/members`,
    { headers: getHeaders() },
  );
  if (!response.ok) {
    throw new Error("Không tải được danh sách thành viên của vai trò");
  }
  return response.json();
}

/** Thêm member vào role */
export async function addMemberToRole(
  serverId: string,
  roleId: string,
  memberId: string,
): Promise<Role> {
  const response = await fetch(
    `${API_BASE_URL}/servers/${serverId}/roles/${roleId}/members/${memberId}`,
    {
      method: "POST",
      headers: getHeaders(),
    },
  );
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "Không thêm được thành viên vào vai trò");
  }
  return response.json();
}

/** Xóa member khỏi role */
export async function removeMemberFromRole(
  serverId: string,
  roleId: string,
  memberId: string,
): Promise<Role> {
  const response = await fetch(
    `${API_BASE_URL}/servers/${serverId}/roles/${roleId}/members/${memberId}`,
    {
      method: "DELETE",
      headers: getHeaders(),
    },
  );
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "Không xóa được thành viên khỏi vai trò");
  }
  return response.json();
}

// ===================== END ROLES API =====================

// ===================== MEMBERS WITH ROLES API =====================

/**
 * Thông tin member với roles (dùng cho UI hiển thị)
 */
export interface MemberWithRoles {
  userId: string;
  displayName: string;
  username: string;
  avatarUrl: string;
  joinedAt: string;
  isOwner: boolean;
  roles: Array<{
    _id: string;
    name: string;
    color: string;
    position: number;
  }>;
  highestRolePosition: number;
  displayColor: string; // Màu hiển thị username (từ role cao nhất)
}

/**
 * Response từ API getServerMembersWithRoles
 */
export interface MembersWithRolesResponse {
  members: MemberWithRoles[];
  currentUserPermissions: {
    canKick: boolean;
    canBan: boolean;
    canTimeout: boolean;
    isOwner: boolean;
  };
}

/**
 * Lấy danh sách thành viên với thông tin roles (PUBLIC - cho tất cả members)
 * Trả về: members với role info + quyền của user hiện tại
 */
export async function getServerMembersWithRoles(
  serverId: string,
): Promise<MembersWithRolesResponse> {
  const response = await fetch(
    `${API_BASE_URL}/servers/${serverId}/members-with-roles`,
    { headers: getHeaders() },
  );
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "Không tải được danh sách thành viên");
  }
  return response.json();
}

// ===================== MODERATION API =====================

/**
 * Kick thành viên khỏi server
 */
export async function kickMember(
  serverId: string,
  memberId: string,
  reason?: string,
): Promise<{ success: boolean; message: string }> {
  const response = await fetch(
    `${API_BASE_URL}/servers/${serverId}/kick/${memberId}`,
    {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ reason }),
    },
  );
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "Không kick được thành viên");
  }
  return response.json();
}

/**
 * Ban thành viên khỏi server
 */
export async function banMember(
  serverId: string,
  memberId: string,
  reason?: string,
  deleteMessageDays?: number,
): Promise<{ success: boolean; message: string }> {
  const response = await fetch(
    `${API_BASE_URL}/servers/${serverId}/ban/${memberId}`,
    {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ reason, deleteMessageDays }),
    },
  );
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "Không ban được thành viên");
  }
  return response.json();
}

/**
 * Unban thành viên
 */
export async function unbanMember(
  serverId: string,
  memberId: string,
): Promise<{ success: boolean; message: string }> {
  const response = await fetch(
    `${API_BASE_URL}/servers/${serverId}/unban/${memberId}`,
    {
      method: "POST",
      headers: getHeaders(),
    },
  );
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "Không unban được thành viên");
  }
  return response.json();
}

/**
 * Thông tin người bị ban
 */
export interface BannedUser {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  bannedAt: string;
  reason: string | null;
}

/**
 * Lấy danh sách người bị ban
 */
export async function getBannedUsers(
  serverId: string,
): Promise<BannedUser[]> {
  const response = await fetch(
    `${API_BASE_URL}/servers/${serverId}/bans`,
    { headers: getHeaders() },
  );
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "Không tải được danh sách ban");
  }
  return response.json();
}

/**
 * Timeout thành viên
 */
export async function timeoutMember(
  serverId: string,
  memberId: string,
  durationSeconds: number,
  reason?: string,
): Promise<{ success: boolean; message: string; timeoutUntil: string }> {
  const response = await fetch(
    `${API_BASE_URL}/servers/${serverId}/timeout/${memberId}`,
    {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ durationSeconds, reason }),
    },
  );
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "Không timeout được thành viên");
  }
  return response.json();
}

/**
 * Gỡ timeout
 */
export async function removeTimeout(
  serverId: string,
  memberId: string,
): Promise<{ success: boolean; message: string }> {
  const response = await fetch(
    `${API_BASE_URL}/servers/${serverId}/remove-timeout/${memberId}`,
    {
      method: "POST",
      headers: getHeaders(),
    },
  );
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "Không gỡ timeout được");
  }
  return response.json();
}

// ===================== END MODERATION API =====================

/**
 * Permissions response của user hiện tại
 */
export interface CurrentUserServerPermissions {
  isOwner: boolean;
  hasCustomRole: boolean; // User có vai trò nào ngoài @everyone không
  canKick: boolean;
  canBan: boolean;
  canTimeout: boolean;
  canManageServer: boolean;
  canManageChannels: boolean;
  canManageEvents: boolean;
  canCreateInvite: boolean;
}

/**
 * Lấy permissions của user hiện tại trong server
 */
export async function getCurrentUserPermissions(
  serverId: string,
): Promise<CurrentUserServerPermissions> {
  const response = await fetch(
    `${API_BASE_URL}/servers/${serverId}/my-permissions`,
    { headers: getHeaders() },
  );
  if (!response.ok) {
    // Fallback: lấy từ members-with-roles
    try {
      const membersResponse = await getServerMembersWithRoles(serverId);
      return {
        isOwner: membersResponse.currentUserPermissions.isOwner,
        canKick: membersResponse.currentUserPermissions.canKick,
        canBan: membersResponse.currentUserPermissions.canBan,
        canTimeout: membersResponse.currentUserPermissions.canTimeout,
        canManageServer: membersResponse.currentUserPermissions.isOwner,
        canManageChannels: membersResponse.currentUserPermissions.isOwner,
        canManageEvents: membersResponse.currentUserPermissions.isOwner,
        canCreateInvite: true,
      };
    } catch {
      return {
        isOwner: false,
        canKick: false,
        canBan: false,
        canTimeout: false,
        canManageServer: false,
        canManageChannels: false,
        canManageEvents: false,
        canCreateInvite: true,
      };
    }
  }
  return response.json();
}

/** Preview số lượng thành viên sẽ bị lược bỏ theo điều kiện. (Chỉ chủ server) */
export async function getPruneCount(params: {
  serverId: string;
  days: number;
  role?: PruneRoleFilter;
}): Promise<number> {
  const { serverId, days, role } = params;
  const url = new URL(`${API_BASE_URL}/servers/${serverId}/prune/count`);
  url.searchParams.set("days", String(days));
  if (role) url.searchParams.set("role", role);
  const res = await fetch(url.toString(), { headers: getHeaders() });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || "Không tính được số lượng lược bỏ");
  }
  const payload = await res.json().catch(() => ({}));
  return typeof payload?.count === "number" ? payload.count : 0;
}

/** Thực thi lược bỏ thành viên hàng loạt theo điều kiện. (Chỉ chủ server) */
export async function pruneMembers(params: {
  serverId: string;
  days: number;
  role?: PruneRoleFilter;
}): Promise<number> {
  const { serverId, days, role } = params;
  const res = await fetch(`${API_BASE_URL}/servers/${serverId}/prune`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ days, role: role ?? "all" }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || "Không lược bỏ được thành viên");
  }
  const payload = await res.json().catch(() => ({}));
  return typeof payload?.removed === "number" ? payload.removed : 0;
}

/** Tạo lời mời vào máy chủ (chỉ mời được người follow hoặc đang follow mình). */
export async function createServerInvite(
  serverId: string,
  toUserId: string,
): Promise<{ _id: string }> {
  const response = await fetch(`${API_BASE_URL}/server-invites`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ serverId, toUserId }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Không gửi được lời mời");
  }
  return response.json();
}

/** Chấp nhận lời mời vào máy chủ (dùng khi vào từ link /invite/server/[serverId]). */
export async function acceptServerInviteByServer(serverId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/server-invites/accept-by-server`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ serverId }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Không chấp nhận được lời mời");
  }
}

/** Chấp nhận lời mời theo id lời mời (dùng trong hộp thư). */
export async function acceptServerInvite(inviteId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/server-invites/${inviteId}/accept`, {
    method: "POST",
    headers: getHeaders(),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Không chấp nhận được lời mời");
  }
}

/** Từ chối lời mời theo id lời mời (dùng trong hộp thư). */
export async function declineServerInvite(inviteId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/server-invites/${inviteId}/decline`, {
    method: "POST",
    headers: getHeaders(),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Không từ chối được lời mời");
  }
}

// Channels
export async function createChannel(
  serverId: string,
  name: string,
  type: "text" | "voice",
  description?: string,
  isPrivate?: boolean,
): Promise<Channel> {
  const response = await fetch(`${API_BASE_URL}/servers/${serverId}/channels`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ name, type, description, isPrivate }),
  });

  if (!response.ok) {
    throw new Error("Không tạo được kênh");
  }

  return response.json();
}

export async function getChannels(
  serverId: string,
  type?: "text" | "voice",
): Promise<Channel[]> {
  const url = new URL(`${API_BASE_URL}/servers/${serverId}/channels`);
  if (type) {
    url.searchParams.append("type", type);
  }

  const response = await fetch(url.toString(), {
    headers: getHeaders(),
  });

  if (!response.ok) {
    throw new Error("Không tải được danh sách kênh");
  }

  return response.json();
}

export async function getChannel(
  serverId: string,
  channelId: string,
): Promise<Channel> {
  const response = await fetch(
    `${API_BASE_URL}/servers/${serverId}/channels/${channelId}`,
    {
      headers: getHeaders(),
    },
  );

  if (!response.ok) {
    throw new Error("Không tải được thông tin kênh");
  }

  return response.json();
}

export async function updateChannel(
  serverId: string,
  channelId: string,
  name?: string,
  description?: string,
): Promise<Channel> {
  const response = await fetch(
    `${API_BASE_URL}/servers/${serverId}/channels/${channelId}`,
    {
      method: "PATCH",
      headers: getHeaders(),
      body: JSON.stringify({ name, description }),
    },
  );

  if (!response.ok) {
    throw new Error("Không cập nhật được kênh");
  }

  return response.json();
}

export async function deleteChannel(
  serverId: string,
  channelId: string,
): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/servers/${serverId}/channels/${channelId}`,
    {
      method: "DELETE",
      headers: getHeaders(),
    },
  );

  if (!response.ok) {
    throw new Error("Không xóa được kênh");
  }
}

// Server Events
export type EventFrequency =
  | "none"
  | "weekly"
  | "biweekly"
  | "monthly"
  | "yearly";
export type EventLocationType = "voice" | "other";

export type EventStatus = "scheduled" | "live" | "ended";

export interface ServerEvent {
  _id: string;
  serverId: string;
  channelId?: { _id: string; name: string; type: string } | null;
  locationType: EventLocationType;
  topic: string;
  startAt: string;
  endAt: string;
  frequency: EventFrequency;
  description?: string | null;
  coverImageUrl?: string | null;
  createdBy: string;
  inviteCode?: string | null;
  inviteExpiresAt?: string | null;
  status?: EventStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEventPayload {
  topic: string;
  startAt: string; // ISO date string
  frequency: EventFrequency;
  locationType: EventLocationType;
  endAt?: string; // ISO date string - dùng khi chọn "Một nơi khác"
  channelId?: string;
  description?: string;
  coverImageUrl?: string;
}

/** Base URL for event share links (production: https://cordigram.com) */
export function getEventsBaseUrl(): string {
  if (typeof window !== "undefined") return window.location.origin;
  return process.env.NEXT_PUBLIC_APP_URL || "https://cordigram.com";
}

/** Build event share link: /events/{serverId}/{eventId} */
export function getEventShareLink(serverId: string, eventId: string): string {
  return `${getEventsBaseUrl()}/events/${serverId}/${eventId}`;
}

export async function getServerEvents(serverId: string): Promise<{
  active: ServerEvent[];
  upcoming: ServerEvent[];
}> {
  const response = await fetch(
    `${API_BASE_URL}/servers/${serverId}/events`,
    { headers: getHeaders() },
  );
  if (!response.ok) throw new Error("Không tải được sự kiện");
  return response.json();
}

export async function startServerEvent(
  serverId: string,
  eventId: string,
): Promise<ServerEvent> {
  const res = await fetch(
    `${API_BASE_URL}/servers/${serverId}/events/${eventId}/start`,
    { method: "POST", headers: getHeaders() },
  );
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || "Không bắt đầu được sự kiện");
  }
  return res.json();
}

export async function endServerEvent(
  serverId: string,
  eventId: string,
): Promise<ServerEvent> {
  const res = await fetch(
    `${API_BASE_URL}/servers/${serverId}/events/${eventId}/end`,
    { method: "POST", headers: getHeaders() },
  );
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || "Không kết thúc được sự kiện");
  }
  return res.json();
}

export interface EventPreviewResponse {
  event: {
    _id: string;
    topic: string;
    startAt: string;
    endAt: string;
    coverImageUrl: string | null;
    description: string | null;
    channelId: { name: string; type: string } | null;
  };
  server: { _id: string; name: string; isPublic: boolean; avatarUrl?: string | null };
  isMember: boolean;
}

/** Public (optional auth): get event preview by serverId + eventId */
export async function getEventPreview(
  serverId: string,
  eventId: string,
): Promise<EventPreviewResponse> {
  const url = `${API_BASE_URL}/events/${serverId}/${eventId}`;
  const res = await fetch(url, {
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error("Không tải được sự kiện");
  return res.json();
}

/** Join a public server (requires auth) */
export async function joinServer(serverId: string): Promise<Server> {
  const res = await fetch(`${API_BASE_URL}/servers/${serverId}/join`, {
    method: "POST",
    headers: getHeaders(),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || "Không tham gia được máy chủ");
  }
  return res.json();
}

export async function leaveServer(serverId: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/servers/${serverId}/leave`, {
    method: "POST",
    headers: getHeaders(),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || "Không thể rời máy chủ");
  }
}

export async function createServerEvent(
  serverId: string,
  payload: CreateEventPayload,
): Promise<ServerEvent> {
  const body: Record<string, unknown> = {
    topic: payload.topic,
    startAt: payload.startAt,
    frequency: payload.frequency,
    locationType: payload.locationType,
  };
  if (payload.endAt != null && payload.endAt !== "") body.endAt = payload.endAt;
  if (payload.channelId != null && payload.channelId !== "") body.channelId = payload.channelId;
  if (payload.description != null && payload.description !== "") body.description = payload.description;
  if (payload.coverImageUrl != null && payload.coverImageUrl !== "") body.coverImageUrl = payload.coverImageUrl;

  const response = await fetch(
    `${API_BASE_URL}/servers/${serverId}/events`,
    {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(body),
    },
  );
  if (!response.ok) {
    let message = "Failed to create event";
    try {
      const data = await response.json();
      if (data.message) {
        message = Array.isArray(data.message) ? data.message.join(", ") : data.message;
      }
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  return response.json();
}

// Messages
export async function createMessage(
  channelId: string,
  content: string,
  attachments?: string[],
  replyTo?: string,
): Promise<Message> {
  const body: { content: string; attachments?: string[]; replyTo?: string } = {
    content,
    ...(attachments?.length ? { attachments } : {}),
    ...(replyTo ? { replyTo } : {}),
  };
  const response = await fetch(
    `${API_BASE_URL}/channels/${channelId}/messages`,
    {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    throw new Error("Không tạo được tin nhắn");
  }

  return response.json();
}

export async function getMessages(
  channelId: string,
  limit: number = 50,
  skip: number = 0,
): Promise<Message[]> {
  const url = new URL(`${API_BASE_URL}/channels/${channelId}/messages`);
  url.searchParams.append("limit", limit.toString());
  url.searchParams.append("skip", skip.toString());

  const response = await fetch(url.toString(), {
    headers: getHeaders(),
  });

  if (!response.ok) {
    throw new Error("Không tải được tin nhắn");
  }

  return response.json();
}

/** Đánh dấu toàn bộ tin nhắn trong kênh là đã đọc (để thông báo chưa đọc trong Hộp thư biến mất). */
export async function markChannelAsRead(channelId: string): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/channels/${channelId}/messages/read`,
    { method: "POST", headers: getHeaders() },
  );
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "Không đánh dấu đã đọc được");
  }
}

export async function updateMessage(
  channelId: string,
  messageId: string,
  content: string,
): Promise<Message> {
  const response = await fetch(
    `${API_BASE_URL}/channels/${channelId}/messages/${messageId}`,
    {
      method: "PATCH",
      headers: getHeaders(),
      body: JSON.stringify({ content }),
    },
  );

  if (!response.ok) {
    throw new Error("Không cập nhật được tin nhắn");
  }

  return response.json();
}

export async function deleteMessage(
  channelId: string,
  messageId: string,
): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/channels/${channelId}/messages/${messageId}`,
    {
      method: "DELETE",
      headers: getHeaders(),
    },
  );

  if (!response.ok) {
    throw new Error("Không xóa được tin nhắn");
  }
}

export async function addMessageReaction(
  channelId: string,
  messageId: string,
  emoji: string,
): Promise<Message> {
  const response = await fetch(
    `${API_BASE_URL}/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`,
    {
      method: "POST",
      headers: getHeaders(),
    },
  );

  if (!response.ok) {
    throw new Error("Không thêm được cảm xúc");
  }

  return response.json();
}

// Friends/Followers
export async function getMyFollowers(): Promise<Friend[]> {
  try {
    const userId = getCurrentUserId();
    if (!userId) return [];
    const response = await fetch(`${API_BASE_URL}/users/${userId}/followers`, {
      headers: getHeaders(),
    });

    if (!response.ok) {
      return [];
    }

    const payload = await response.json();
    if (Array.isArray(payload)) return payload as Friend[];
    const items = (payload?.items ?? []) as Array<{
      userId: string;
      username: string;
      displayName: string;
      avatarUrl: string;
    }>;
    return items.map((item) => ({
      _id: item.userId,
      displayName: item.displayName,
      username: item.username,
      avatarUrl: item.avatarUrl,
      email: "",
      bio: "",
    }));
  } catch (err) {
    console.error("Failed to fetch followers", err);
    return [];
  }
}

// Get following list
export async function getFollowing(): Promise<Friend[]> {
  try {
    const userId = getCurrentUserId();
    if (!userId) return [];
    const response = await fetch(`${API_BASE_URL}/users/${userId}/following`, {
      headers: getHeaders(),
    });

    if (!response.ok) {
      return [];
    }

    const payload = await response.json();
    if (Array.isArray(payload)) return payload as Friend[];
    const items = (payload?.items ?? []) as Array<{
      userId: string;
      username: string;
      displayName: string;
      avatarUrl: string;
    }>;
    return items.map((item) => ({
      _id: item.userId,
      displayName: item.displayName,
      username: item.username,
      avatarUrl: item.avatarUrl,
      email: "",
      bio: "",
    }));
  } catch (err) {
    console.error("Failed to fetch following", err);
    return [];
  }
}

// Follow a user
export async function followUser(userId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/users/${userId}/follow`, {
    method: "POST",
    headers: getHeaders(),
  });

  if (!response.ok) {
    throw new Error("Không theo dõi được người dùng");
  }
}

// Unfollow a user
export async function unfollowUser(userId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/users/${userId}/follow`, {
    method: "DELETE",
    headers: getHeaders(),
  });

  if (!response.ok) {
    throw new Error("Không bỏ theo dõi được người dùng");
  }
}

// Check if following a user
export async function isFollowing(userId: string): Promise<boolean> {
  try {
    const response = await fetch(
      `${API_BASE_URL}/users/${userId}/is-following`,
      {
        headers: getHeaders(),
      },
    );

    if (!response.ok) {
      return false;
    }

    const data = await response.json();
    return data.isFollowing;
  } catch (err) {
    console.error("Failed to check following status", err);
    return false;
  }
}