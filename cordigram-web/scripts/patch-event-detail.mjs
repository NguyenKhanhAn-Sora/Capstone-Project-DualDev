import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pagePath = path.join(__dirname, "..", "app", "(main)", "messages", "page.tsx");

let c = fs.readFileSync(pagePath, "utf8");

const REPLACEMENTS = [
  // Live banner in event detail
  [
    /Đang Diễn Ra – Kết thúc \{endTimeStr\}/,
    `{t("chat.sidebar.eventDetailLive", { time: endTimeStr })}`,
  ],
  // Hosted by
  [
    /Máy chủ của \{currentServer\?\.name\}/,
    `{t("chat.sidebar.eventDetailHostedBy", { name: currentServer?.name ?? "" })}`,
  ],
  // Copy link button
  [/>Sao Chép Link<\/button>/, `>{t("chat.sidebar.eventDetailCopyLink")}</button>`],
  // Interested button
  [/>Quan tâm<\/button>/, `>{t("chat.sidebar.eventDetailInterested")}</button>`],
  // Start event
  [/>Bắt đầu\s*<\/button>/, `>{t("chat.sidebar.eventDetailStart")}</button>`],
  // End event
  [/>Kết Thúc Sự Kiện\s*<\/button>/, `>{t("chat.sidebar.eventDetailEnd")}</button>`],
];

let changed = 0;
for (const [pattern, replacement] of REPLACEMENTS) {
  const before = c;
  c = c.replace(pattern, replacement);
  if (c !== before) {
    changed++;
    console.log("patched:", pattern.source.slice(0, 70));
  } else {
    console.warn("NOT FOUND:", pattern.source.slice(0, 70));
  }
}

fs.writeFileSync(pagePath, c);
console.log(`\nDone. ${changed}/${REPLACEMENTS.length} applied.`);
