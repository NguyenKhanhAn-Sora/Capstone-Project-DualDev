import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pagePath = path.join(__dirname, "..", "app", "(main)", "messages", "page.tsx");

let c = fs.readFileSync(pagePath, "utf8");

const REPLACEMENTS = [
  // Title
  [/Tổng quan cộng đồng/, `{t("chat.communityOverview.title")}`],
  // Subtitle
  [/Thiết lập kênh quy tắc\/hướng dẫn, ngôn ngữ chính của máy chủ và mô tả máy chủ\./, `{t("chat.communityOverview.subtitle")}`],
  // Loading
  [/<div style=\{\{ color: "var\(--color-text-muted\)" \}\}>Đang tải…<\/div>/, `<div style={{ color: "var(--color-text-muted)" }}>{t("chat.communityOverview.loading")}</div>`],
  // Rules channel label
  [/Kênh quy tắc hoặc hướng dẫn/, `{t("chat.communityOverview.rulesChannelLabel")}`],
  // Rules channel hint — note code tag inside
  [/Chọn kênh sẽ hiển thị quy tắc\/hướng dẫn cho thành viên[^<]*/, `{t("chat.communityOverview.rulesChannelHint")}`],
  // No channel option
  [/— Không chọn —/, `{t("chat.communityOverview.noChannel")}`],
  // Lang label
  [/Ngôn ngữ chính của máy chủ/, `{t("chat.communityOverview.langLabel")}`],
  // Lang hint
  [/Chỉ hỗ trợ <b>Tiếng Việt<\/b> và <b>English<\/b>\./, `{t("chat.communityOverview.langHint")}`],
  // Lang options
  [/<option value="vi">Tiếng Việt<\/option>/, `<option value="vi">{t("chat.communityOverview.langVi")}</option>`],
  [/<option value="en">English<\/option>/, `<option value="en">{t("chat.communityOverview.langEn")}</option>`],
  // Desc label
  [/Mô tả máy chủ/, `{t("chat.communityOverview.descLabel")}`],
  // Desc hint
  [/Mô tả này sẽ hiển thị bên dưới link mời trong thẻ invite\./, `{t("chat.communityOverview.descHint")}`],
  // Desc placeholder
  [/placeholder="Hãy giới thiệu một chút về máy chủ này với thế giới\."/, `placeholder={t("chat.communityOverview.descPlaceholder")}`],
  // Error save
  [/: "Không lưu được"\s*\}/, `: t("chat.communityOverview.errorSave")}`],
  // Save button
  [/\{saving \? "Đang lưu…" : "Lưu thay đổi"\}/, `{saving ? t("chat.communityOverview.saving") : t("chat.communityOverview.save")}`],
];

let changed = 0;
for (const [pattern, replacement] of REPLACEMENTS) {
  const before = c;
  c = c.replace(pattern, replacement);
  if (c !== before) {
    changed++;
    console.log("patched:", pattern.source.slice(0, 60));
  } else {
    console.warn("NOT FOUND:", pattern.source.slice(0, 60));
  }
}

fs.writeFileSync(pagePath, c);
console.log(`\nDone. ${changed}/${REPLACEMENTS.length} applied.`);
