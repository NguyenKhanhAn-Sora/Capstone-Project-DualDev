import { API_BASE_URL, getHeaders } from "./servers-api";

export interface ModeratorMemberRow {
  userId: string;
  displayName: string;
  username: string;
  avatarUrl: string;
  joinedAt: string;
  accountCreatedAt: string;
  accountAgeDays: number;
  joinMethod: "owner" | "invited" | "link";
  invitedBy?: { id: string; username: string };
  roles: Array<{ _id: string; name: string; color: string; position: number }>;
  flags: Array<"new-account" | "spam" | "suspicious-invite">;
}

export interface ModeratorMemberDetail {
  basic: {
    userId: string;
    displayName: string;
    username: string;
    avatarUrl: string;
    joinedAt: string;
    accountCreatedAt: string;
    joinMethod: "owner" | "invited" | "link";
    invitedBy?: { id: string; username: string };
  };
  activity: {
    messageCountLast30d: number;
    linkCountLast30d: number;
    mediaCountLast30d: number;
  };
  permissions: any;
  roles: {
    assigned: Array<{ _id: string; name: string; color: string; position: number }>;
    allServerRoles: Array<{ _id: string; name: string; color: string; position: number }>;
  };
}

export async function getModeratorMembers(serverId: string): Promise<ModeratorMemberRow[]> {
  const response = await fetch(`${API_BASE_URL}/servers/${serverId}/mod-view/members`, {
    headers: getHeaders(),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "Không tải được danh sách Moderator View");
  }
  return response.json();
}

export async function getModeratorMemberDetail(
  serverId: string,
  memberId: string,
): Promise<ModeratorMemberDetail> {
  const response = await fetch(
    `${API_BASE_URL}/servers/${serverId}/mod-view/members/${memberId}`,
    {
      headers: getHeaders(),
    },
  );
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "Không tải được chi tiết thành viên");
  }
  return response.json();
}

