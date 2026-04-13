/**
 * Adds mentionSpamTitle key to locale files.
 * Run: node scripts/merge-inbox-i18n2.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.join(__dirname, "..", "locales");

const KEYS = {
  vi: { mentionSpamTitle: "\u26a0\ufe0f C\u1ea3nh b\u00e1o spam \u0111\u1ec1 c\u1eadp" },
  en: { mentionSpamTitle: "\u26a0\ufe0f Mention Spam Warning" },
  ja: { mentionSpamTitle: "\u26a0\ufe0f \u30e1\u30f3\u30b7\u30e7\u30f3\u30b9\u30d1\u30e0\u8b66\u544a" },
  zh: { mentionSpamTitle: "\u26a0\ufe0f \u63d0\u53ca\u523a\u5237\u8b66\u544a" },
};

for (const [code, keys] of Object.entries(KEYS)) {
  const p = path.join(localesDir, `${code}.json`);
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  Object.assign(j.chat.popups.inbox, keys);
  fs.writeFileSync(p, JSON.stringify(j, null, 2));
  console.log(`added mentionSpamTitle \u2192 ${code}.json`);
}
