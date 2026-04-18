/**
 * Logic tách riêng: search, filter, sort cho danh sách thành viên (tab Thành viên).
 */

export type SortKey = "joinedAt" | "username" | "activity" | "role";

export interface MemberListRow {
  userId: string;
  username: string;
  displayName: string;
  joinedAt: string;
  isOwner: boolean;
  serverMemberRole: "owner" | "moderator" | "member";
  highestRolePosition: number;
  accountAgeDays: number;
  messagesLast10Min: number;
  messagesLast30d: number;
  lastMessageAt?: string | null;
  isOnline?: boolean;
}

export interface MemberListFilters {
  /** Lọc theo vai trò hệ thống (owner/mod/member) */
  serverRole: "all" | "owner" | "moderator" | "member";
  /** Tài khoản mới: tuổi tài khoản < 7 ngày */
  newAccountOnly: boolean;
  /** Spam: > 50 tin trong 10 phút */
  spamOnly: boolean;
}

const MS_DAY = 24 * 60 * 60 * 1000;

/** Chuẩn hóa chuỗi để tìm kiếm: thường hóa, bỏ dấu kết hợp (NFD), đ→d, gộp khoảng trắng. */
function foldMemberSearchText(raw: string): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0111/g, "d")
    .replace(/\s+/g, " ");
}

function joinedWithinDays(joinedAt: string, days: number): boolean {
  const t = new Date(joinedAt).getTime();
  return Number.isFinite(t) && Date.now() - t < days * MS_DAY;
}

function lastMessageWithinDays(lastMessageAt: string | null | undefined, days: number): boolean {
  if (!lastMessageAt) return false;
  const t = new Date(lastMessageAt).getTime();
  return Number.isFinite(t) && Date.now() - t < days * MS_DAY;
}

/**
 * Tìm theo displayName, nickname, username, userId (realtime trên client).
 * Gõ không dấu / thiếu dấu vẫn khớp tên tiếng Việt (ví dụ "Ho" → "Hồ").
 */
export function filterMembersBySearch<
  T extends { username: string; userId: string; displayName?: string; nickname?: string | null },
>(members: T[], rawQuery: string): T[] {
  const qFold = foldMemberSearchText(rawQuery);
  if (!qFold) return members;
  return members.filter((m) => {
    const u = foldMemberSearchText(m.username);
    const id = foldMemberSearchText(m.userId);
    const dn = foldMemberSearchText(m.displayName ?? "");
    const nick = foldMemberSearchText(m.nickname ?? "");
    return u.includes(qFold) || id.includes(qFold) || dn.includes(qFold) || nick.includes(qFold);
  });
}

export function filterMembersByAdvanced<T extends MemberListRow>(
  members: T[],
  filters: MemberListFilters,
): T[] {
  return members.filter((m) => {
    if (filters.serverRole !== "all" && m.serverMemberRole !== filters.serverRole) {
      return false;
    }
    if (filters.newAccountOnly && m.accountAgeDays >= 7) {
      return false;
    }
    if (filters.spamOnly && m.messagesLast10Min <= 50) {
      return false;
    }
    return true;
  });
}

/**
 * Toggle "hiển thị trong danh sách kênh": chỉ online, tài khoản mới, hoạt động gần đây — tối đa 50.
 */
export function applyChannelListSidebar<T extends MemberListRow & { lastMessageAt?: string | null }>(
  members: T[],
  enabled: boolean,
  max = 50,
): T[] {
  if (!enabled) return members;

  const scored = members
    .filter((m) => {
      const newAcc = m.accountAgeDays < 7;
      const newToServer = joinedWithinDays(m.joinedAt, 7);
      const active = lastMessageWithinDays(m.lastMessageAt ?? null, 7);
      return Boolean(m.isOnline) || newAcc || newToServer || active;
    })
    .map((m) => ({
      m,
      score:
        (m.isOnline ? 1000 : 0) +
        (m.messagesLast30d ?? 0) +
        (joinedWithinDays(m.joinedAt, 7) ? 100 : 0),
    }))
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, max).map((x) => x.m);
}

export function sortMembers<T extends MemberListRow>(
  members: T[],
  sortBy: SortKey,
  order: "asc" | "desc" = "desc",
): T[] {
  const arr = [...members];
  arr.sort((a, b) => {
    switch (sortBy) {
      case "username": {
        const ca = (a.username || a.displayName).toLowerCase();
        const cb = (b.username || b.displayName).toLowerCase();
        const cmp = ca.localeCompare(cb);
        return order === "asc" ? cmp : -cmp;
      }
      case "joinedAt": {
        const ta = new Date(a.joinedAt).getTime();
        const tb = new Date(b.joinedAt).getTime();
        if (order === "asc") return ta - tb;
        return tb - ta;
      }
      case "activity": {
        const va = a.messagesLast30d ?? 0;
        const vb = b.messagesLast30d ?? 0;
        if (order === "asc") return va - vb;
        return vb - va;
      }
      case "role":
      default: {
        if (a.isOwner !== b.isOwner) return a.isOwner ? -1 : 1;
        return b.highestRolePosition - a.highestRolePosition;
      }
    }
  });
  return arr;
}

/** Cờ hiển thị cột Tín hiệu: New (<7 ngày tuổi tài khoản), Spam (>50 msg / 10 phút). */
export function computeSignalLabels(m: MemberListRow): Array<"New" | "Spam"> {
  const out: Array<"New" | "Spam"> = [];
  if (m.accountAgeDays < 7) out.push("New");
  if (m.messagesLast10Min > 50) out.push("Spam");
  return out;
}
