import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.join(__dirname, "..", "locales");

const EXTRA = {
  en: {
    sidebar: {
      eventDetailLive: "Live – Ending {time}",
      eventDetailHostedBy: "Server of {name}",
      eventDetailCopyLink: "Copy Link",
      eventDetailInterested: "Interested",
      eventDetailStart: "Start",
      eventDetailEnd: "End Event",
    },
  },
  vi: {
    sidebar: {
      eventDetailLive: "Đang Diễn Ra – Kết thúc {time}",
      eventDetailHostedBy: "Máy chủ của {name}",
      eventDetailCopyLink: "Sao Chép Link",
      eventDetailInterested: "Quan tâm",
      eventDetailStart: "Bắt đầu",
      eventDetailEnd: "Kết Thúc Sự Kiện",
    },
  },
  ja: {
    sidebar: {
      eventDetailLive: "開催中 – 終了: {time}",
      eventDetailHostedBy: "{name} のサーバー",
      eventDetailCopyLink: "リンクをコピー",
      eventDetailInterested: "興味あり",
      eventDetailStart: "開始",
      eventDetailEnd: "イベントを終了",
    },
  },
  zh: {
    sidebar: {
      eventDetailLive: "进行中 – 结束于 {time}",
      eventDetailHostedBy: "{name} 的服务器",
      eventDetailCopyLink: "复制链接",
      eventDetailInterested: "感兴趣",
      eventDetailStart: "开始",
      eventDetailEnd: "结束活动",
    },
  },
};

for (const [code, pack] of Object.entries(EXTRA)) {
  const p = path.join(localesDir, `${code}.json`);
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  for (const [key, val] of Object.entries(pack)) {
    j.chat[key] = { ...(j.chat[key] || {}), ...val };
  }
  fs.writeFileSync(p, JSON.stringify(j, null, 2));
  console.log(`merged event strings → ${code}.json`);
}
