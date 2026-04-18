import type { ServerSidebarPrefs } from "@/lib/sidebar-prefs";
import {
  getEffectiveNotifyLevel,
  isChannelOrCategoryMuted,
  isServerMuted,
} from "@/lib/sidebar-prefs";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Quyết định có phát âm thanh khi có tin mới trong kênh server hay không.
 * Đồng bộ với mức thông báo + tắt âm + «Cấm @everyone/@here» + «Bỏ vai trò @mention» (lưu localStorage).
 */
export function shouldPlayChannelMessageNotificationSound(opts: {
  content: string;
  /** mentions đã resolve từ backend (ObjectId hoặc string) */
  mentionIds: string[];
  currentUserId: string;
  /** username hiện tại (để nhận diện @username trực tiếp) */
  currentUsername: string | null | undefined;
  prefs: ServerSidebarPrefs;
  channelId: string;
  categoryId: string | null | undefined;
  /** Tên vai trò (không gồm @), role không mặc định — khớp resolveMentions trên backend */
  roleNames: string[];
}): boolean {
  const { prefs: sp, channelId, categoryId, content: raw, mentionIds, currentUserId, currentUsername, roleNames } =
    opts;

  if (isServerMuted(sp)) return false;
  if (isChannelOrCategoryMuted(sp, channelId, categoryId)) return false;

  const level = getEffectiveNotifyLevel(sp, channelId, categoryId);
  if (level === "none") return false;

  const content = raw || "";
  const uid = String(currentUserId);
  const ids = mentionIds.map((x) => String(x));
  const userInMentions = ids.includes(uid);

  if (level === "mentions" && !userInMentions) return false;

  const hasEveryone = /@everyone\b/i.test(content);
  const hasHere = /@here\b/i.test(content);
  const uname = (currentUsername || "").trim().toLowerCase();
  const hasDirectUsername =
    !!uname &&
    new RegExp(`@${escapeRegExp(uname)}(?:\\s|$|[\\n\\r.,!?])`, "i").test(content);

  if (sp.suppressEveryoneHere && (hasEveryone || hasHere) && !hasDirectUsername) {
    return false;
  }

  if (sp.suppressRoleMentions && roleNames.length > 0) {
    let hitRole = false;
    for (const rn of roleNames) {
      const t = rn.trim();
      if (!t) continue;
      const esc = escapeRegExp(t);
      if (new RegExp(`@${esc}(?:\\s|$|[\\n\\r.,!?])`, "i").test(content)) {
        hitRole = true;
        break;
      }
    }
    if (hitRole && !hasDirectUsername && !hasEveryone && !hasHere) {
      return false;
    }
  }

  return true;
}
