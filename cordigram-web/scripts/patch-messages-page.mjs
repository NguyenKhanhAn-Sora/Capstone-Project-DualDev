/**
 * Patches explore/communityOverview strings in messages/page.tsx
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pagePath = path.join(__dirname, "..", "app", "(main)", "messages", "page.tsx");

let c = fs.readFileSync(pagePath, "utf8");

const REPLACEMENTS = [
  // Explore hero
  [
    /<h2 className={styles\.exploreHeroTitle}>[^<]+<\/h2>/,
    `<h2 className={styles.exploreHeroTitle}>{t("chat.explore.title")}</h2>`,
  ],
  [
    /<p className={styles\.exploreHeroSub}>[\s\S]*?<\/p>/m,
    `<p className={styles.exploreHeroSub}>{t("chat.explore.subtitle")}</p>`,
  ],
  // Loading/empty explore
  [
    /\{loading \? \(\s*<div style=\{\{ padding: 28, color: "var\(--color-text-muted\)" \}\}>[^<]+<\/div>/m,
    `{loading ? (\n        <div style={{ padding: 28, color: "var(--color-text-muted)" }}>{t("chat.explore.loading")}</div>`,
  ],
  [
    /<div style=\{\{ padding: 28, color: "var\(--color-text-muted\)" \}\}>\s*Chưa có máy chủ nào[^<]*<\/div>/m,
    `<div style={{ padding: 28, color: "var(--color-text-muted)" }}>{t("chat.explore.empty")}</div>`,
  ],
  // Member count row
  [
    /\.toLocaleString\("vi-VN"\) \} thành viên/,
    `.toLocaleString(language === "vi" ? "vi-VN" : language === "ja" ? "ja-JP" : language === "zh" ? "zh-CN" : "en-US")} {t("chat.explore.memberCountSuffix")}`,
  ],
  // Access mode badges
  [
    /s\.accessMode === "apply" \? " • Đăng ký tham gia" : s\.accessMode === "invite_only" \? " • Chỉ mời" : ""/,
    `s.accessMode === "apply" ? " • " + t("chat.explore.badgeApply") : s.accessMode === "invite_only" ? " • " + t("chat.explore.badgeInviteOnly") : ""`,
  ],
  // Join button title
  [
    /title=\{s\.accessMode === "invite_only" \? "Máy chủ này chỉ tham gia bằng lời mời" : "Tham gia"\}/,
    `title={s.accessMode === "invite_only" ? t("chat.explore.inviteOnlyTitle") : t("chat.explore.join")}`,
  ],
  // Join button label
  [
    /\{s\.accessMode === "invite_only" \? "Chỉ mời" : "Tham gia"\}/,
    `{s.accessMode === "invite_only" ? t("chat.explore.inviteOnly") : t("chat.explore.join")}`,
  ],
];

let changed = 0;
for (const [pattern, replacement] of REPLACEMENTS) {
  const before = c;
  c = c.replace(pattern, replacement);
  if (c !== before) {
    changed++;
    console.log("patched:", typeof pattern === "string" ? pattern.slice(0, 60) : pattern.source.slice(0, 60));
  } else {
    console.warn("NOT FOUND:", typeof pattern === "string" ? pattern.slice(0, 60) : pattern.source.slice(0, 60));
  }
}

fs.writeFileSync(pagePath, c);
console.log(`\nDone. ${changed}/${REPLACEMENTS.length} replacements applied.`);
