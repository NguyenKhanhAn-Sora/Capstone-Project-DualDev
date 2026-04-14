import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.join(__dirname, "..", "locales");

const EXTRA = {
  en: {
    sidebar: {
      liveEvent: "Live",
      eventDetail: "Event Details",
      events: "Events",
      eventsCount: "{count} Events",
      boostServer: "Boost Server",
      members: "Members",
      noChannels: "No channels",
      noChatChannels: "No text channels",
      noVoiceChannels: "No voice channels",
      closeAria: "Close",
    },
  },
  vi: {
    sidebar: {
      liveEvent: "Đang Diễn Ra",
      eventDetail: "Chi Tiết Sự Kiện",
      events: "Sự Kiện",
      eventsCount: "{count} Sự kiện",
      boostServer: "Nâng Cấp Máy Chủ",
      members: "Thành viên",
      noChannels: "Chưa có kênh",
      noChatChannels: "Chưa có kênh chat",
      noVoiceChannels: "Chưa có kênh đàm thoại",
      closeAria: "Đóng",
    },
  },
  ja: {
    sidebar: {
      liveEvent: "開催中",
      eventDetail: "イベント詳細",
      events: "イベント",
      eventsCount: "{count} イベント",
      boostServer: "サーバーをブースト",
      members: "メンバー",
      noChannels: "チャンネルがありません",
      noChatChannels: "テキストチャンネルがありません",
      noVoiceChannels: "ボイスチャンネルがありません",
      closeAria: "閉じる",
    },
  },
  zh: {
    sidebar: {
      liveEvent: "进行中",
      eventDetail: "活动详情",
      events: "活动",
      eventsCount: "{count} 活动",
      boostServer: "助力服务器",
      members: "成员",
      noChannels: "暂无频道",
      noChatChannels: "暂无文字频道",
      noVoiceChannels: "暂无语音频道",
      closeAria: "关闭",
    },
  },
};

for (const [code, pack] of Object.entries(EXTRA)) {
  const p = path.join(localesDir, `${code}.json`);
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  // Merge each top-level key (sidebar) into existing
  for (const [key, val] of Object.entries(pack)) {
    j.chat[key] = { ...(j.chat[key] || {}), ...val };
  }
  fs.writeFileSync(p, JSON.stringify(j, null, 2));
  console.log(`merged sidebar extras → ${code}.json`);
}
