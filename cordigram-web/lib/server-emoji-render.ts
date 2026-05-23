import type { EmojiPickerGroup } from "@/lib/servers-api";

/** Map `emojiName` (lowercase) → image URL for rendering `:name:` in chat. */
export function buildServerEmojiRenderMapFromPickerGroups(
  groups: EmojiPickerGroup[] | undefined | null,
): Record<string, string> {
  const m: Record<string, string> = {};
  for (const g of groups || []) {
    for (const e of g.emojis || []) {
      const k = (e.name || "").trim().toLowerCase();
      const url = (e.imageUrl || "").trim();
      if (k && url) m[k] = url;
    }
  }
  return m;
}

/**
 * Khớp logic backend `getEmojiPickerData` / `getStickerPickerData`:
 * Boost (basic/boost) mở emoji & sticker máy chủ khác; không Boost chỉ máy chủ ngữ cảnh.
 */
export function isPickerServerMediaLocked(
  serverId: string,
  contextServerId: string | null | undefined,
  hasCrossServerMediaAccess: boolean,
): boolean {
  if (hasCrossServerMediaAccess) return false;
  const ctx = (contextServerId || "").trim();
  if (!ctx) return true;
  return String(serverId) !== ctx;
}
