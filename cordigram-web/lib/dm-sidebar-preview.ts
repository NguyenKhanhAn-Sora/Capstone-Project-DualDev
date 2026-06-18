/** DM sidebar / inbox last-message preview — parity mobile `MessagesI18n.localizeSidebarPreview`. */
export function formatDmSidebarPreview(
  raw: string,
  t: (key: string) => string,
  opts?: {
    messageType?: string | null;
  },
): string {
  const type = (opts?.messageType ?? "").trim().toLowerCase();
  const text = raw.trim();

  if (type === "voice" || looksLikeVoicePreview(text)) {
    return t("chat.composer.replyVoice");
  }
  if (type === "sticker") return t("chat.composer.replySticker");
  if (type === "gif") return t("chat.composer.replyGif");
  if (type === "image" || looksLikeImagePreview(text)) {
    return t("chat.composer.replyImage");
  }
  if (type === "video" || looksLikeVideoPreview(text)) {
    return t("chat.composer.replyVideo");
  }
  if (looksLikeFilePreview(text)) return t("chat.composer.replyFile");
  if (looksLikePollPreview(text)) return t("chat.createPoll.title");
  if (looksLikeInvitePreview(text)) return t("chat.composer.replyServerInvite");
  if (looksLikeEmojiToken(text)) return t("chat.composer.replyEmoji");

  return text;
}

function looksLikeVoicePreview(raw: string): boolean {
  const lower = raw.toLowerCase().replaceAll("🔊", "").trim();
  const needles = [
    "tin nhắn thoại",
    "voice message",
    "ボイスメッセージ",
    "语音消息",
  ];
  return needles.some((n) => lower === n || lower.startsWith(`${n} `));
}

function looksLikeImagePreview(raw: string): boolean {
  return (
    raw.includes("📷 [Image]:") ||
    /^https?:\/\/\S+\.(png|jpe?g|gif|webp)(\?|$)/i.test(raw)
  );
}

function looksLikeVideoPreview(raw: string): boolean {
  return (
    raw.includes("🎬 [Video]:") ||
    /^https?:\/\/\S+\.(mp4|mov|webm|m4v)(\?|$)/i.test(raw)
  );
}

function looksLikeFilePreview(raw: string): boolean {
  return raw.includes("📎 [File]:");
}

function looksLikePollPreview(raw: string): boolean {
  return /📊\s*\[Poll\]:/i.test(raw);
}

function looksLikeInvitePreview(raw: string): boolean {
  const s = raw.toLowerCase();
  return s.includes("/invite/server/") || s.includes("cordigram.com/invite/server");
}

function looksLikeEmojiToken(raw: string): boolean {
  const s = raw.trim();
  if (s.length < 3 || !s.startsWith(":") || !s.endsWith(":")) return false;
  const inner = s.slice(1, -1);
  return inner.length > 0 && !inner.includes(" ");
}
