/**
 * Merges chat.* keys (explore → rolePermissions) from extension JSON files into vi/ja/zh.
 * Run: node scripts/merge-chat-extensions.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.join(__dirname, "..", "locales");

function mergeLocale(code, fileName) {
  const extPath = path.join(localesDir, fileName);
  if (!fs.existsSync(extPath)) {
    console.warn("skip (no file):", fileName);
    return;
  }
  const pack = JSON.parse(fs.readFileSync(extPath, "utf8"));
  const mainPath = path.join(localesDir, `${code}.json`);
  const j = JSON.parse(fs.readFileSync(mainPath, "utf8"));
  Object.assign(j.chat, pack);
  fs.writeFileSync(mainPath, JSON.stringify(j, null, 2));
  console.log("merged", fileName, "→", `${code}.json`);
}

mergeLocale("vi", "chat-vi-extension.json");
mergeLocale("ja", "chat-ja-extension.json");
mergeLocale("zh", "chat-zh-extension.json");
