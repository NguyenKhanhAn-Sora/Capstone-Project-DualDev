import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pagePath = path.join(__dirname, "..", "app", "(main)", "messages", "page.tsx");

let c = fs.readFileSync(pagePath, "utf8");

const REPLACEMENTS = [
  [/Đang Diễn Ra\n/g, `{t("chat.sidebar.liveEvent")}\n`],
  [/Chi Tiết Sự Kiện/, `{t("chat.sidebar.eventDetail")}`],
  [/(<span>)Sự Kiện(<\/span>)/, `$1{t("chat.sidebar.events")}$2`],
  [/(<span className={styles\.eventCountBadge}>)\{serverEventsTotalCount\} Sự kiện(<\/span>)/, `$1{serverEventsTotalCount} {t("chat.sidebar.events")}$2`],
  [/(<span>)Nâng Cấp Máy Chủ(<\/span>)/, `$1{t("chat.sidebar.boostServer")}$2`],
  [/(<span>)Thành viên(<\/span>)/, `$1{t("chat.sidebar.members")}$2`],
  [/Chưa có kênh\n/, `{t("chat.sidebar.noChannels")}\n`],
  [/>Chưa có kênh chat<\/div>/, `>{t("chat.sidebar.noChatChannels")}</div>`],
  [/>Chưa có kênh đàm thoại<\/div>/, `>{t("chat.sidebar.noVoiceChannels")}</div>`],
  // close aria in the active event banner
  [/(aria-label=)"Đóng"\s*(>\s*×\s*<\/button>\s*<\/div>\s*<div className={styles\.activeEventTitle}>)/,
   `$1{t("chat.sidebar.closeAria")}$2`],
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
