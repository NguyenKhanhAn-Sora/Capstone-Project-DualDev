import {
  resolveServerDisplayLanguage,
  translateCategoryName,
  translateChannelName,
} from "./system-names";

type Lang = "vi" | "en" | "ja" | "zh";

const UI: Record<
  Lang,
  {
    back: string;
    viewOnly: string;
    textChannels: string;
    voiceChannels: string;
    selectChannel: string;
    noTextChannel: string;
    loadingMessages: string;
    noMessages: string;
    voiceListOnly: string;
    replyPrefix: string;
  }
> = {
  vi: {
    back: "← Quay lại Khám phá cộng đồng",
    viewOnly: "Chỉ xem",
    textChannels: "Kênh chat",
    voiceChannels: "Kênh thoại",
    selectChannel: "Chọn một kênh chat để xem nội dung.",
    noTextChannel: "Không có kênh chat",
    loadingMessages: "Đang tải tin nhắn…",
    noMessages: "Chưa có tin nhắn.",
    voiceListOnly: "Chỉ xem danh sách kênh — không có lịch sử chat",
    replyPrefix: "Trả lời:",
  },
  en: {
    back: "← Back to Community Discovery",
    viewOnly: "View only",
    textChannels: "Text channels",
    voiceChannels: "Voice channels",
    selectChannel: "Select a text channel to view messages.",
    noTextChannel: "No text channels",
    loadingMessages: "Loading messages…",
    noMessages: "No messages yet.",
    voiceListOnly: "Channel list only — no chat history",
    replyPrefix: "Reply:",
  },
  ja: {
    back: "← コミュニティ発見に戻る",
    viewOnly: "閲覧のみ",
    textChannels: "テキストチャンネル",
    voiceChannels: "ボイスチャンネル",
    selectChannel: "メッセージを表示するテキストチャンネルを選択してください。",
    noTextChannel: "テキストチャンネルがありません",
    loadingMessages: "メッセージを読み込み中…",
    noMessages: "メッセージはまだありません。",
    voiceListOnly: "チャンネル一覧のみ — チャット履歴なし",
    replyPrefix: "返信:",
  },
  zh: {
    back: "← 返回社区发现",
    viewOnly: "仅查看",
    textChannels: "文字频道",
    voiceChannels: "语音频道",
    selectChannel: "选择一个文字频道以查看消息。",
    noTextChannel: "没有文字频道",
    loadingMessages: "正在加载消息…",
    noMessages: "暂无消息。",
    voiceListOnly: "仅频道列表 — 无聊天记录",
    replyPrefix: "回复:",
  },
};

export function resolveAdminViewLanguage(server: {
  primaryLanguage?: string | null;
  communitySettings?: { primaryLanguageConfigured?: boolean } | null;
}): Lang {
  return resolveServerDisplayLanguage(server, "vi");
}

export function adminViewUi(lang: Lang) {
  return UI[lang] ?? UI.vi;
}

export { translateChannelName, translateCategoryName };
