import { decodeJwt } from "./auth";

export const API_BASE_URL = "http://localhost:9999";

function getToken(): string {
  return (
    localStorage.getItem("accessToken") || localStorage.getItem("token") || ""
  );
}

export function getHeaders() {
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
  primaryLanguage?: "vi" | "en";
  avatarUrl?: string;
  bannerUrl?: string;
  profileTraits?: Array<{ emoji: string; text: string }>;
  template?: ServerTemplate;
  purpose?: ServerPurpose;
  ownerId: string;
  members: Array<{
    userId: string;
    role: "owner" | "moderator" | "member";
    joinedAt: string;
    nickname?: string | null;
  }>;
  channels: Channel[];
  memberCount: number;
  isActive: boolean;
  isPublic?: boolean;
  isAgeRestricted?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ServerProfileStats {
  onlineCount: number;
  memberCount: number;
  createdAt: string;
}

export interface ServerAuditLogRow {
  _id: string;
  actorUserId?: string;
  action: string;
  targetType?: "server" | "channel" | "member";
  targetId?: string;
  targetName?: string;
  changes?: Array<{ field: string; from?: string | null; to?: string | null }>;
  createdAt: string;
}

export type ServerVerificationLevel = "none" | "low" | "medium" | "high";

export type ContentFilterLevel = "none" | "all_members" | "no_role_members";

export interface MentionSpamFilter {
  enabled: boolean;
  mentionLimit: number;
  responses: {
    blockMessage: boolean;
    sendWarning: boolean;
    restrictMember: boolean;
  };
  customNotification: string;
  blockDurationHours: number;
  exemptRoleIds: string[];
  exemptChannelIds: string[];
}

export interface ServerSafetySettings {
  spamProtection: {
    verificationLevel: ServerVerificationLevel;
    hideMutedDm: boolean;
    filterDmSpam: boolean;
    warnExternalLinks: boolean;
    hideSpamMessages: boolean;
    deleteSpammerMessages: boolean;
  };
  contentFilter: {
    level: ContentFilterLevel;
  };
  automod: {
    bannedWords: string[];
    blockInUsername: boolean;
    bannedWordResponse: "warn" | "delete";
    exemptRoleIds: string[];
    mentionSpamFilter: MentionSpamFilter;
  };
  privileges: {
    bypassRoleIds: string[];
    managerRoleIds: string[];
  };
}

export interface ServerCategory {
  _id: string;
  name: string;
  position: number;
  isPrivate: boolean;
  type?: "text" | "voice" | "mixed";
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
  /** null = bình thường, 'info' = Thông Tin */
  category?: string | null;
  /** ID danh mục người dùng tạo */
  categoryId?: string | null;
  position?: number;
  isRulesChannel?: boolean;
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
  mentions?: string[];
  messageType?: string;
  giphyId?: string;
  voiceUrl?: string;
  voiceDuration?: number;
  stickerReplyWelcomeEnabled?: boolean;
  contentModerationResult?: "none" | "blurred" | "rejected";
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

export async function getServerProfileStats(serverId: string): Promise<ServerProfileStats> {
  const response = await fetch(`${API_BASE_URL}/servers/${serverId}/profile-stats`, {
    headers: getHeaders(),
  });
  if (!response.ok) throw new Error("Không tải được thống kê máy chủ");
  return response.json();
}

export async function getServerAuditLogs(
  serverId: string,
  query?: { action?: string; actorUserId?: string; limit?: number; before?: string },
): Promise<ServerAuditLogRow[]> {
  const params = new URLSearchParams();
  if (query?.action) params.set("action", query.action);
  if (query?.actorUserId) params.set("actorUserId", query.actorUserId);
  if (query?.limit) params.set("limit", String(query.limit));
  if (query?.before) params.set("before", query.before);
  const qs = params.toString();
  const response = await fetch(`${API_BASE_URL}/servers/${serverId}/audit-logs${qs ? `?${qs}` : ""}`, {
    headers: getHeaders(),
  });
  if (!response.ok) throw new Error("Không tải được nhật ký chỉnh sửa");
  return response.json();
}

export async function getServerSafetySettings(serverId: string): Promise<ServerSafetySettings> {
  const response = await fetch(`${API_BASE_URL}/servers/${serverId}/safety-settings`, {
    headers: getHeaders(),
  });
  if (!response.ok) throw new Error("Không tải được thiết lập an toàn");
  return response.json();
}

export async function updateServerSafetySettings(
  serverId: string,
  patch: Partial<ServerSafetySettings>,
): Promise<ServerSafetySettings> {
  const response = await fetch(`${API_BASE_URL}/servers/${serverId}/safety-settings`, {
    method: "PATCH",
    headers: getHeaders(),
    body: JSON.stringify(patch),
  });
  if (!response.ok) throw new Error("Không cập nhật được thiết lập an toàn");
  return response.json();
}

export async function updateServer(
  serverId: string,
  name?: string | null,
  description?: string | null,
  avatarUrl?: string | null,
  extra?: {
    bannerUrl?: string | null;
    profileTraits?: Array<{ emoji: string; text: string }>;
  },
): Promise<Server> {
  const response = await fetch(`${API_BASE_URL}/servers/${serverId}`, {
    method: "PATCH",
    headers: getHeaders(),
    body: JSON.stringify({
      name,
      description,
      avatarUrl,
      bannerUrl: extra?.bannerUrl,
      profileTraits: extra?.profileTraits,
    }),
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
  mentionEveryone: boolean;
  sendMessages: boolean;
  sendMessagesInThreads: boolean;
  createPublicThreads: boolean;
  createPrivateThreads: boolean;
  embedLinks: boolean;
  attachFiles: boolean;
  addReactions: boolean;
  manageMessages: boolean;
  pinMessages: boolean;
  viewMessageHistory: boolean;
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
  nickname?: string | null;
  displayName: string;
  username: string;
  avatarUrl: string;
  joinedAt: string;
  isOwner: boolean;
  serverMemberRole: "owner" | "moderator" | "member";
  roles: Array<{
    _id: string;
    name: string;
    color: string;
    position: number;
  }>;
  highestRolePosition: number;
  displayColor: string; // Màu hiển thị username (từ role cao nhất)
  accountCreatedAt: string;
  accountAgeDays: number;
  messagesLast10Min: number;
  messagesLast30d: number;
  lastMessageAt: string | null;
  isOnline: boolean;
  joinMethod: "owner" | "invited" | "link";
  invitedBy?: { id: string; username: string };
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
  /** Được dùng đề cập (@) — không ảnh hưởng việc nhận tin khi người khác @ bạn. */
  mentionEveryone?: boolean;
}

export interface ServerInteractionSettings {
  systemMessagesEnabled: boolean;
  welcomeMessageEnabled: boolean;
  stickerReplyWelcomeEnabled: boolean;
  defaultNotificationLevel: "all" | "mentions";
  systemChannelId: string | null;
  canEdit: boolean;
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
        hasCustomRole: membersResponse.currentUserPermissions.isOwner, // Fallback: chỉ owner có quyền
        canKick: membersResponse.currentUserPermissions.canKick,
        canBan: membersResponse.currentUserPermissions.canBan,
        canTimeout: membersResponse.currentUserPermissions.canTimeout,
        canManageServer: membersResponse.currentUserPermissions.isOwner,
        canManageChannels: membersResponse.currentUserPermissions.isOwner,
        canManageEvents: membersResponse.currentUserPermissions.isOwner,
        canCreateInvite: true,
        mentionEveryone: membersResponse.currentUserPermissions.isOwner,
      };
    } catch {
      return {
        isOwner: false,
        hasCustomRole: false,
        canKick: false,
        canBan: false,
        canTimeout: false,
        canManageServer: false,
        canManageChannels: false,
        canManageEvents: false,
        canCreateInvite: true,
        mentionEveryone: false,
      };
    }
  }
  return response.json();
}

export async function getInteractionSettings(
  serverId: string,
): Promise<ServerInteractionSettings> {
  const response = await fetch(
    `${API_BASE_URL}/servers/${serverId}/interaction-settings`,
    { headers: getHeaders() },
  );
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "Không tải được cài đặt tương tác");
  }
  return response.json();
}

export async function updateInteractionSettings(
  serverId: string,
  payload: Partial<
    Pick<
      ServerInteractionSettings,
      | "systemMessagesEnabled"
      | "welcomeMessageEnabled"
      | "stickerReplyWelcomeEnabled"
      | "defaultNotificationLevel"
      | "systemChannelId"
    >
  >,
): Promise<ServerInteractionSettings> {
  const response = await fetch(
    `${API_BASE_URL}/servers/${serverId}/interaction-settings`,
    {
      method: "PATCH",
      headers: getHeaders(),
      body: JSON.stringify(payload),
    },
  );
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "Không lưu được cài đặt tương tác");
  }
  return response.json();
}

export async function createRoleNotification(
  serverId: string,
  payload: {
    title: string;
    content: string;
    targetType: "everyone" | "role";
    roleId?: string | null;
  },
): Promise<{ success: boolean; recipients: number; notificationId: string }> {
  const response = await fetch(
    `${API_BASE_URL}/servers/${serverId}/role-notifications`,
    {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(payload),
    },
  );
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "Không gửi được thông báo theo vai trò");
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

// Mention Spam Restricted Members
export interface MentionRestrictedMember {
  userId: string;
  displayName: string;
  username: string;
  avatarUrl: string;
  mentionBlockedUntil: string | null;
  mentionRestricted: boolean;
}

export async function getMentionRestrictedMembers(
  serverId: string,
): Promise<MentionRestrictedMember[]> {
  const response = await fetch(
    `${API_BASE_URL}/servers/${serverId}/mention-restricted`,
    { headers: getHeaders() },
  );
  if (!response.ok) return [];
  return response.json();
}

export async function unrestrictMember(
  serverId: string,
  memberId: string,
): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/servers/${serverId}/unrestrict/${memberId}`,
    { method: "POST", headers: getHeaders() },
  );
  if (!response.ok) throw new Error("Không mở hạn chế được");
}

// ===================== COMMUNITY SETTINGS =====================

export interface CommunitySettings {
  enabled: boolean;
  rulesChannelId: string | null;
  updatesChannelId: string | null;
  activatedAt: string | null;
}

export interface DiscoveryCheck {
  id: string;
  label: string;
  description: string;
  passed: boolean;
  warning?: boolean;
}

export interface DiscoveryEligibility {
  eligible: boolean;
  communityEnabled: boolean;
  memberCount: number;
  serverAgeMinutes: number;
  checks: DiscoveryCheck[];
}

export async function getDiscoveryEligibility(
  serverId: string,
): Promise<DiscoveryEligibility> {
  const response = await fetch(
    `${API_BASE_URL}/servers/${serverId}/discovery-eligibility`,
    { headers: getHeaders() },
  );
  if (!response.ok) throw new Error("Không tải được điều kiện khám phá");
  return response.json();
}

export async function getCommunitySettings(
  serverId: string,
): Promise<CommunitySettings> {
  const response = await fetch(
    `${API_BASE_URL}/servers/${serverId}/community`,
    { headers: getHeaders() },
  );
  if (!response.ok) throw new Error("Không tải được cài đặt cộng đồng");
  return response.json();
}

export async function activateCommunity(
  serverId: string,
  body: {
    rulesChannelId?: string | null;
    updatesChannelId?: string | null;
    createRulesChannel?: boolean;
    createUpdatesChannel?: boolean;
  },
): Promise<CommunitySettings> {
  const response = await fetch(
    `${API_BASE_URL}/servers/${serverId}/community/activate`,
    {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(body),
    },
  );
  if (!response.ok) throw new Error("Không kích hoạt được cộng đồng");
  return response.json();
}

export type CommunityOverviewUpdate = {
  rulesChannelId?: string | null;
  primaryLanguage?: "vi" | "en";
  description?: string | null;
};

export async function updateCommunityOverview(
  serverId: string,
  body: CommunityOverviewUpdate,
): Promise<{ ok: true; description: string | null; primaryLanguage: "vi" | "en"; rulesChannelId: string | null }> {
  const response = await fetch(
    `${API_BASE_URL}/servers/${serverId}/community/overview`,
    {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(body),
    },
  );
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "Không cập nhật được tổng quan cộng đồng");
  }
  return response.json();
}

// Mentions
export interface MentionSuggestion {
  id: string;
  name: string;
  type: "special" | "role" | "user";
  description: string;
  avatarUrl?: string;
  color?: string;
}

export async function getMentionSuggestions(
  serverId: string,
  keyword: string = "",
): Promise<MentionSuggestion[]> {
  const url = new URL(`${API_BASE_URL}/servers/${serverId}/mentions`);
  if (keyword) url.searchParams.set("keyword", keyword);
  const response = await fetch(url.toString(), { headers: getHeaders() });
  if (!response.ok) return [];
  return response.json();
}

// Channels
export async function createChannel(
  serverId: string,
  name: string,
  type: "text" | "voice",
  description?: string,
  isPrivate?: boolean,
  categoryId?: string,
): Promise<Channel> {
  const response = await fetch(`${API_BASE_URL}/servers/${serverId}/channels`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ name, type, description, isPrivate, categoryId }),
  });

  if (!response.ok) {
    throw new Error("Không tạo được kênh");
  }

  return response.json();
}

// Categories
export async function createCategory(
  serverId: string,
  name: string,
  isPrivate?: boolean,
  type?: "text" | "voice" | "mixed",
): Promise<ServerCategory> {
  const response = await fetch(
    `${API_BASE_URL}/servers/${serverId}/channels/categories`,
    {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ name, type: type || "mixed" }),
    },
  );
  if (!response.ok) throw new Error("Không tạo được danh mục");
  return response.json();
}

export async function updateCategory(
  serverId: string,
  categoryId: string,
  name: string,
): Promise<ServerCategory> {
  const response = await fetch(
    `${API_BASE_URL}/servers/${serverId}/channels/categories/${categoryId}`,
    {
      method: "PATCH",
      headers: getHeaders(),
      cache: "no-store",
      body: JSON.stringify({ name }),
    },
  );
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.message || "Không đổi tên được danh mục");
  }
  return response.json();
}

export async function deleteCategory(
  serverId: string,
  categoryId: string,
): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/servers/${serverId}/channels/categories/${categoryId}`,
    {
      method: "DELETE",
      headers: getHeaders(),
    },
  );
  if (!response.ok) throw new Error("Không xóa được danh mục");
}

export async function getCategories(serverId: string): Promise<ServerCategory[]> {
  const response = await fetch(
    `${API_BASE_URL}/servers/${serverId}/channels/categories/list`,
    { headers: getHeaders(), cache: "no-store" },
  );
  if (!response.ok) return [];
  return response.json();
}

export async function reorderCategories(
  serverId: string,
  orderedIds: string[],
): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/servers/${serverId}/channels/reorder/categories`,
    {
      method: "PATCH",
      headers: getHeaders(),
      body: JSON.stringify({ orderedIds }),
    },
  );
  if (!response.ok) throw new Error("Không sắp xếp được danh mục");
}

export async function reorderChannels(
  serverId: string,
  categoryId: string | null,
  orderedChannelIds: string[],
): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/servers/${serverId}/channels/reorder/channels`,
    {
      method: "PATCH",
      headers: getHeaders(),
      body: JSON.stringify({ categoryId, orderedChannelIds }),
    },
  );
  if (!response.ok) throw new Error("Không sắp xếp được kênh");
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
    cache: "no-store",
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
      cache: "no-store",
      body: JSON.stringify({ name, description }),
    },
  );

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.message || "Không cập nhật được kênh");
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
export async function joinServer(
  serverId: string,
  opts?: {
    rulesAccepted?: boolean;
    nickname?: string;
    applicationAnswers?: Array<{
      questionId: string;
      text?: string;
      selectedOption?: string;
    }>;
  },
): Promise<Server> {
  const res = await fetch(`${API_BASE_URL}/servers/${serverId}/join`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(opts ?? {}),
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
export type ChatGateBlockReason = "verification" | "age_under_18" | "age_ack";

export async function createMessage(
  channelId: string,
  content: string,
  attachments?: string[],
  replyTo?: string,
  mentions?: string[],
  messageType?: string,
  giphyId?: string,
  voiceUrl?: string,
  voiceDuration?: number,
): Promise<Message> {
  const body: Record<string, unknown> = {
    content,
    ...(attachments?.length ? { attachments } : {}),
    ...(replyTo ? { replyTo } : {}),
    ...(mentions?.length ? { mentions } : {}),
    ...(messageType && messageType !== "text" ? { messageType } : {}),
    ...(giphyId ? { giphyId } : {}),
    ...(voiceUrl ? { voiceUrl } : {}),
    ...(voiceDuration != null ? { voiceDuration } : {}),
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
    let message = "Không tạo được tin nhắn";
    try {
      const data = await response.json();
      if (data?.message) {
        message = Array.isArray(data.message) ? data.message.join(", ") : String(data.message);
      }
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return response.json();
}

export async function sendWaveSticker(
  channelId: string,
  replyTo?: string,
  giphyId?: string,
): Promise<Message> {
  const body: Record<string, string> = {};
  if (replyTo) body.replyTo = replyTo;
  if (giphyId) body.giphyId = giphyId;
  const response = await fetch(
    `${API_BASE_URL}/channels/${channelId}/messages/wave-sticker`,
    {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(body),
    },
  );
  if (!response.ok) {
    throw new Error("Không gửi được sticker vẫy tay");
  }
  return response.json();
}

export interface GetChannelMessagesResponse {
  messages: Message[];
  chatViewBlocked: boolean;
  chatBlockReason: ChatGateBlockReason | null;
}

export async function getMessages(
  channelId: string,
  limit: number = 50,
  skip: number = 0,
): Promise<GetChannelMessagesResponse> {
  const url = new URL(`${API_BASE_URL}/channels/${channelId}/messages`);
  url.searchParams.append("limit", limit.toString());
  url.searchParams.append("skip", skip.toString());

  const response = await fetch(url.toString(), {
    headers: getHeaders(),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "Không tải được tin nhắn");
  }

  const raw = await response.json();
  if (Array.isArray(raw)) {
    return {
      messages: raw as Message[],
      chatViewBlocked: false,
      chatBlockReason: null,
    };
  }
  return raw as GetChannelMessagesResponse;
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

// Message Search
export interface SearchMessageResult {
  _id: string;
  channelId: { _id: string; name: string; type: string; serverId: string } | string;
  senderId: {
    _id: string;
    email: string;
    displayName?: string;
    username?: string;
    avatarUrl?: string;
  };
  content: string;
  attachments: string[];
  createdAt: string;
  updatedAt: string;
}

export interface SearchResponse {
  results: SearchMessageResult[];
  totalCount: number;
}

export async function searchMessages(params: {
  q?: string;
  serverId?: string;
  channelId?: string;
  senderId?: string;
  before?: string;
  after?: string;
  hasFile?: boolean;
  limit?: number;
  offset?: number;
}): Promise<SearchResponse> {
  const url = new URL(`${API_BASE_URL}/messages/search`);
  if (params.q) url.searchParams.append("q", params.q);
  if (params.serverId) url.searchParams.append("serverId", params.serverId);
  if (params.channelId) url.searchParams.append("channelId", params.channelId);
  if (params.senderId) url.searchParams.append("senderId", params.senderId);
  if (params.before) url.searchParams.append("before", params.before);
  if (params.after) url.searchParams.append("after", params.after);
  if (params.hasFile) url.searchParams.append("hasFile", "true");
  if (params.limit) url.searchParams.append("limit", params.limit.toString());
  if (params.offset) url.searchParams.append("offset", params.offset.toString());

  const response = await fetch(url.toString(), { headers: getHeaders() });
  if (!response.ok) throw new Error("Không tìm kiếm được tin nhắn");
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

// =========================================================
// Server Access Control (Discord tab "Truy cập")
// =========================================================

export type ServerAccessMode = "invite_only" | "apply" | "discoverable";

export interface ServerAccessRule {
  id: string;
  content: string;
}

export interface ServerAccessSettings {
  accessMode: ServerAccessMode;
  isAgeRestricted: boolean;
  hasRules: boolean;
  rules: ServerAccessRule[];
  joinApplicationForm?: {
    enabled: boolean;
    questions: Array<{
      id: string;
      title: string;
      type: "short" | "paragraph" | "multiple_choice";
      required: boolean;
      options?: string[];
    }>;
  };
}

export type MyServerAccessStatusValue = "pending" | "accepted" | "rejected" | null;

export interface MyServerAccessStatus {
  status: MyServerAccessStatusValue;
  acceptedRules: boolean;
  hasRules: boolean;
  accessMode: ServerAccessMode;
  isAgeRestricted: boolean;
  ageRestrictedAcknowledged: boolean;
  ageYears: number | null;
  verificationLevel: ServerVerificationLevel;
  verificationChecks?: {
    emailVerified: boolean;
    accountOver5Min: boolean;
    memberOver10Min: boolean;
  };
  verificationWait?: {
    waitAccountSec: number | null;
    waitMemberSec: number | null;
  };
  chatViewBlocked: boolean;
  chatBlockReason: ChatGateBlockReason | null;
  showAgeRestrictedChannelNotice: boolean;
}

export async function getServerAccessSettings(serverId: string): Promise<ServerAccessSettings> {
  const response = await fetch(`${API_BASE_URL}/servers/${serverId}/access/settings`, {
    headers: getHeaders(),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "Không tải được cài đặt truy cập");
  }

  return response.json();
}

export async function updateServerAccessSettings(
  serverId: string,
  patch: Partial<Pick<ServerAccessSettings, "accessMode" | "isAgeRestricted" | "hasRules">>,
): Promise<Pick<ServerAccessSettings, "accessMode" | "isAgeRestricted" | "hasRules">> {
  const response = await fetch(`${API_BASE_URL}/servers/${serverId}/access/settings`, {
    method: "PATCH",
    headers: getHeaders(),
    body: JSON.stringify(patch),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "Không lưu được cài đặt truy cập");
  }

  return response.json();
}

export async function updateJoinApplicationForm(
  serverId: string,
  body: {
    enabled?: boolean;
    questions?: Array<{
      id: string;
      title: string;
      type: "short" | "paragraph" | "multiple_choice";
      required?: boolean;
      options?: string[];
    }>;
  },
): Promise<{
  enabled: boolean;
  questions: Array<{
    id: string;
    title: string;
    type: "short" | "paragraph" | "multiple_choice";
    required: boolean;
    options?: string[];
  }>;
}> {
  const response = await fetch(`${API_BASE_URL}/servers/${serverId}/access/join-form`, {
    method: "PATCH",
    headers: getHeaders(),
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "Không lưu được đơn đăng ký tham gia");
  }
  return response.json();
}

export async function getJoinApplicationForm(serverId: string): Promise<{
  enabled: boolean;
  questions: Array<{
    id: string;
    title: string;
    type: "short" | "paragraph" | "multiple_choice";
    required: boolean;
    options?: string[];
  }>;
}> {
  const response = await fetch(`${API_BASE_URL}/servers/${serverId}/access/join-form`, {
    headers: getHeaders(),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "Không tải được đơn đăng ký tham gia");
  }
  return response.json();
}

export type JoinApplicationListStatus = "all" | "pending" | "rejected" | "approved";

export interface JoinApplicationListItem {
  userId: string;
  displayName: string;
  username: string;
  avatarUrl?: string;
  status: "pending" | "accepted" | "rejected";
  registeredAt: string;
  acceptedRules: boolean;
}

export async function listJoinApplications(
  serverId: string,
  status: JoinApplicationListStatus = "pending",
): Promise<{ pendingCount: number; items: JoinApplicationListItem[] }> {
  const response = await fetch(
    `${API_BASE_URL}/servers/${serverId}/access/join-applications?status=${encodeURIComponent(status)}`,
    { headers: getHeaders() },
  );
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "Không tải được danh sách đơn");
  }
  return response.json();
}

export interface JoinApplicationDetail {
  userId: string;
  displayName: string;
  username: string;
  avatarUrl?: string;
  status: "pending" | "accepted" | "rejected";
  acceptedRules: boolean;
  accountCreatedAt: string | null;
  applicationSubmittedAt: string | null;
  questionsWithAnswers: Array<{
    questionId: string;
    title: string;
    type: string;
    answerText?: string;
    selectedOption?: string;
  }>;
}

export async function getJoinApplicationDetail(
  serverId: string,
  applicantUserId: string,
): Promise<JoinApplicationDetail> {
  const response = await fetch(
    `${API_BASE_URL}/servers/${serverId}/access/join-applications/${encodeURIComponent(applicantUserId)}`,
    { headers: getHeaders() },
  );
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "Không tải được chi tiết đơn");
  }
  return response.json();
}

export async function rejectAccessUser(serverId: string, userId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/servers/${serverId}/access/reject`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ userId }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "Không từ chối được");
  }
}

export async function withdrawMyJoinApplication(serverId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/servers/${serverId}/access/withdraw`, {
    method: "POST",
    headers: getHeaders(),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "Không thu hồi được đơn đăng ký");
  }
}

export async function addServerAccessRule(serverId: string, content: string): Promise<ServerAccessRule> {
  const response = await fetch(`${API_BASE_URL}/servers/${serverId}/access/rules`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ content }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "Không thêm được quy định");
  }

  return response.json();
}

export async function getMyServerAccessStatus(serverId: string): Promise<MyServerAccessStatus> {
  const response = await fetch(`${API_BASE_URL}/servers/${serverId}/access/my-status`, {
    headers: getHeaders(),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "Không tải được trạng thái truy cập");
  }

  return response.json();
}

export async function acceptServerRules(serverId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/servers/${serverId}/access/accept-rules`, {
    method: "POST",
    headers: getHeaders(),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "Không thể đồng ý quy định");
  }
}

export async function acknowledgeServerAgeRestriction(serverId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/servers/${serverId}/access/acknowledge-age`, {
    method: "POST",
    headers: getHeaders(),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "Không thể xác nhận");
  }
}

export async function requestServerEmailOtp(serverId: string): Promise<{ ok: boolean; retryAfterSec?: number }> {
  const response = await fetch(`${API_BASE_URL}/servers/${serverId}/access/request-email-otp`, {
    method: "POST",
    headers: getHeaders(),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "Không thể gửi mã xác minh");
  }

  return response.json();
}

export async function verifyServerEmailOtp(serverId: string, code: string): Promise<{ ok: boolean }> {
  const response = await fetch(`${API_BASE_URL}/servers/${serverId}/access/verify-email-otp`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ code }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "Mã xác minh không hợp lệ");
  }

  return response.json();
}

export async function approveServerAccessUser(
  serverId: string,
  userId: string,
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/servers/${serverId}/access/approve`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ userId }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "Không thể duyệt yêu cầu gia nhập");
  }
}

// ── Admin read-only view APIs ──

function adminHeaders(adminToken: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${adminToken}`,
  };
}

export async function adminGetServerView(
  serverId: string,
  adminToken: string,
): Promise<{ server: Server; channels: Channel[]; categories: ServerCategory[] }> {
  const res = await fetch(
    `${API_BASE_URL}/admin/community-discovery/${serverId}/view`,
    { headers: adminHeaders(adminToken) },
  );
  if (!res.ok) throw new Error("Không tải được thông tin server");
  return res.json();
}

export async function adminGetChannelMessages(
  serverId: string,
  channelId: string,
  adminToken: string,
  limit = 50,
  skip = 0,
): Promise<GetChannelMessagesResponse> {
  const url = new URL(
    `${API_BASE_URL}/admin/community-discovery/${serverId}/channels/${channelId}/messages`,
  );
  url.searchParams.append("limit", limit.toString());
  url.searchParams.append("skip", skip.toString());
  const res = await fetch(url.toString(), {
    headers: adminHeaders(adminToken),
  });
  if (!res.ok) throw new Error("Không tải được tin nhắn");
  const raw = await res.json();
  if (Array.isArray(raw)) {
    return { messages: raw, chatViewBlocked: false, chatBlockReason: null };
  }
  return raw as GetChannelMessagesResponse;
}

export async function adminLeaveServer(
  serverId: string,
  adminToken: string,
): Promise<void> {
  try {
    const res = await fetch(
      `${API_BASE_URL}/admin/community-discovery/${serverId}/leave`,
      { method: "POST", headers: adminHeaders(adminToken) },
    );
    if (!res.ok) {
      console.error("[adminLeaveServer] Failed:", res.status, await res.text().catch(() => ""));
    }
  } catch (err) {
    console.error("[adminLeaveServer] Network error:", err);
  }
}

export type ExploreServer = {
  id: string;
  name: string;
  description: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  memberCount: number;
  accessMode: "invite_only" | "apply" | "discoverable";
  isPublic: boolean;
};

export async function listExploreServers(): Promise<ExploreServer[]> {
  const res = await fetch(`${API_BASE_URL}/servers/explore`, {
    headers: getHeaders(),
    cache: "no-store",
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || "Không tải được danh sách khám phá");
  }
  return res.json();
}