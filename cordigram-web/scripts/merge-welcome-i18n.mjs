/**
 * Merges i18n keys for welcome messages and chat empty states.
 * Run: node scripts/merge-welcome-i18n.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.join(__dirname, "..", "locales");

const PACKS = {
  vi: {
    noMessages: "Chưa có tin nhắn. Hãy bắt đầu trò chuyện!",
    loadingMessages: "Đang tải tin nhắn...",
    welcome: {
      title: "Chào mừng đến với",
      serverOf: "Máy chủ của {name}",
      channelBegin: "Đây là khởi đầu của kênh",
      startTalking: ". Hãy bắt đầu cuộc trò chuyện!",
      greeting: "Rất vui được gặp bạn, {name}!",
      unknownUser: "Ai đó",
      waving: "Đang gửi...",
      waveBtn: "Vẫy tay chào {name}!",
    },
  },
  en: {
    noMessages: "No messages yet. Start a conversation!",
    loadingMessages: "Loading messages...",
    welcome: {
      title: "Welcome to",
      serverOf: "{name}'s Server",
      channelBegin: "This is the beginning of the",
      startTalking: " channel. Start chatting!",
      greeting: "Nice to meet you, {name}!",
      unknownUser: "Someone",
      waving: "Sending...",
      waveBtn: "Wave to {name}!",
    },
  },
  ja: {
    noMessages: "まだメッセージがありません。会話を始めましょう！",
    loadingMessages: "メッセージを読み込み中...",
    welcome: {
      title: "ようこそ",
      serverOf: "{name}のサーバーへ",
      channelBegin: "これが",
      startTalking: "チャンネルの最初です。チャットを始めましょう！",
      greeting: "はじめまして、{name}！",
      unknownUser: "誰か",
      waving: "送信中...",
      waveBtn: "{name}に手を振る！",
    },
  },
  zh: {
    noMessages: "暂无消息。开始聊天吧！",
    loadingMessages: "正在加载消息...",
    welcome: {
      title: "欢迎来到",
      serverOf: "{name}的服务器",
      channelBegin: "这是",
      startTalking: "频道的开始。开始聊天吧！",
      greeting: "很高兴认识你，{name}！",
      unknownUser: "某人",
      waving: "发送中...",
      waveBtn: "向{name}挥手！",
    },
  },
};

for (const [code, pack] of Object.entries(PACKS)) {
  const p = path.join(localesDir, `${code}.json`);
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  j.chat.noMessages = pack.noMessages;
  j.chat.loadingMessages = pack.loadingMessages;
  j.chat.welcome = { ...(j.chat.welcome || {}), ...pack.welcome };
  fs.writeFileSync(p, JSON.stringify(j, null, 2));
  console.log(`merged welcome → ${code}.json`);
}
