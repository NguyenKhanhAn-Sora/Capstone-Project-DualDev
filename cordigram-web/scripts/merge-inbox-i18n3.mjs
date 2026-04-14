/**
 * Adds chat.dmList.seen key to locale files.
 * Run: node scripts/merge-inbox-i18n3.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.join(__dirname, "..", "locales");

const KEYS = {
  vi: "Đã xem",
  en: "Seen",
  ja: "既読",
  zh: "已读",
};

for (const [code, seen] of Object.entries(KEYS)) {
  const p = path.join(localesDir, `${code}.json`);
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  j.chat.dmList.seen = seen;
  fs.writeFileSync(p, JSON.stringify(j, null, 2));
  console.log(`added dmList.seen -> ${code}.json`);
}
