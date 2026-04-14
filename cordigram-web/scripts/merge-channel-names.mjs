/**
 * Merges chat.channels (system channel/category names) into all locale files.
 * Run: node scripts/merge-channel-names.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.join(__dirname, "..", "locales");

const PACKS = {
  en: {
    channels: {
      // Category names
      catInfo: "Information",
      catText: "Text Channels",
      catVoice: "Voice Channels",
      // Common channels
      general: "general",
      highlights: "highlights",
      lobby: "Lobby",
      gaming: "gaming",
      music: "music",
      waitingRoom: "Waiting Room",
      streamingRoom: "Streaming",
      welcomeAndRules: "welcome-and-rules",
      notesResources: "notes-and-resources",
      homeworkHelp: "homework-help",
      sessionPlanning: "session-planning",
      offTopic: "off-topic",
      studyRoom1: "Study Room 1",
      studyRoom2: "Study Room 2",
      announcements: "announcements",
      resources: "resources",
      meetingPlan: "meeting-plan",
      meetingRoom1: "Meeting Room 1",
      meetingRoom2: "Meeting Room 2",
      events: "events",
      feedback: "feedback",
      communityHub: "Community Hub",
    },
  },
  vi: {
    channels: {
      catInfo: "Thông Tin",
      catText: "Kênh Chat",
      catVoice: "Kênh Thoại",
      general: "chung",
      highlights: "khoảnh-khắc-đỉnh-cao",
      lobby: "Sảnh",
      gaming: "trò-chơi",
      music: "âm-nhạc",
      waitingRoom: "Phòng Chờ",
      streamingRoom: "Phòng Stream",
      welcomeAndRules: "chào-mừng-và-nội-quy",
      notesResources: "ghi-chú-tài-nguyên",
      homeworkHelp: "trợ-giúp-làm-bài-tập-về-nhà",
      sessionPlanning: "lên-kế-hoạch-phiên",
      offTopic: "lạc-đề",
      studyRoom1: "Phòng Học 1",
      studyRoom2: "Phòng Học 2",
      announcements: "thông-báo",
      resources: "tài-nguyên",
      meetingPlan: "kế-hoạch-buổi-họp",
      meetingRoom1: "Phòng Họp 1",
      meetingRoom2: "Phòng Họp 2",
      events: "sự-kiện",
      feedback: "ý-kiến-và-phản-hồi",
      communityHub: "Nơi Tập Trung Cộng Đồng",
    },
  },
  ja: {
    channels: {
      catInfo: "情報",
      catText: "テキストチャンネル",
      catVoice: "ボイスチャンネル",
      general: "一般",
      highlights: "ハイライト",
      lobby: "ロビー",
      gaming: "ゲーム",
      music: "音楽",
      waitingRoom: "待機室",
      streamingRoom: "配信",
      welcomeAndRules: "ようこそ-ルール",
      notesResources: "ノート-リソース",
      homeworkHelp: "宿題サポート",
      sessionPlanning: "セッション計画",
      offTopic: "雑談",
      studyRoom1: "学習室-1",
      studyRoom2: "学習室-2",
      announcements: "お知らせ",
      resources: "リソース",
      meetingPlan: "会議計画",
      meetingRoom1: "会議室-1",
      meetingRoom2: "会議室-2",
      events: "イベント",
      feedback: "フィードバック",
      communityHub: "コミュニティハブ",
    },
  },
  zh: {
    channels: {
      catInfo: "信息",
      catText: "文字频道",
      catVoice: "语音频道",
      general: "综合",
      highlights: "精彩时刻",
      lobby: "大厅",
      gaming: "游戏",
      music: "音乐",
      waitingRoom: "等待室",
      streamingRoom: "直播",
      welcomeAndRules: "欢迎-规则",
      notesResources: "笔记-资源",
      homeworkHelp: "作业帮助",
      sessionPlanning: "学习计划",
      offTopic: "闲聊",
      studyRoom1: "学习室-1",
      studyRoom2: "学习室-2",
      announcements: "公告",
      resources: "资源",
      meetingPlan: "会议计划",
      meetingRoom1: "会议室-1",
      meetingRoom2: "会议室-2",
      events: "活动",
      feedback: "反馈",
      communityHub: "社区中心",
    },
  },
};

for (const [code, pack] of Object.entries(PACKS)) {
  const p = path.join(localesDir, `${code}.json`);
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  Object.assign(j.chat, pack);
  fs.writeFileSync(p, JSON.stringify(j, null, 2));
  console.log(`merged channels → ${code}.json`);
}
