import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.join(__dirname, "..", "locales");

const EXTRA = {
  en: {
    errorLoadBlocked: "Could not load blocked list.",
    errorLoadIgnored: "Could not load ignored list.",
    errorUpdate: "Could not update.",
    errorSave: "Could not save.",
    unblockedToast: "Unblocked.",
    errorUnblock: "Could not unblock.",
    unignoredToast: "Ignore removed.",
    errorUnignore: "Could not remove ignore.",
    ariaShowMemberSince: "Toggle join date",
    ariaSharePresence: "Toggle presence",
  },
  vi: {
    errorLoadBlocked: "Không tải danh sách chặn.",
    errorLoadIgnored: "Không tải danh sách bỏ qua.",
    errorUpdate: "Không cập nhật được.",
    errorSave: "Không lưu được.",
    unblockedToast: "Đã bỏ chặn.",
    errorUnblock: "Không bỏ chặn được.",
    unignoredToast: "Đã gỡ bỏ qua.",
    errorUnignore: "Không gỡ được.",
    ariaShowMemberSince: "Bật tắt ngày tham gia",
    ariaSharePresence: "Bật tắt trạng thái",
  },
  ja: {
    errorLoadBlocked: "ブロックリストを読み込めませんでした。",
    errorLoadIgnored: "無視リストを読み込めませんでした。",
    errorUpdate: "更新できませんでした。",
    errorSave: "保存できませんでした。",
    unblockedToast: "ブロックを解除しました。",
    errorUnblock: "ブロックを解除できませんでした。",
    unignoredToast: "無視を解除しました。",
    errorUnignore: "無視を解除できませんでした。",
    ariaShowMemberSince: "参加日の表示を切り替え",
    ariaSharePresence: "ステータスの共有を切り替え",
  },
  zh: {
    errorLoadBlocked: "无法加载黑名单。",
    errorLoadIgnored: "无法加载屏蔽列表。",
    errorUpdate: "无法更新。",
    errorSave: "无法保存。",
    unblockedToast: "已取消拉黑。",
    errorUnblock: "无法取消拉黑。",
    unignoredToast: "已取消屏蔽。",
    errorUnignore: "无法取消屏蔽。",
    ariaShowMemberSince: "切换加入日期显示",
    ariaSharePresence: "切换在线状态共享",
  },
};

for (const [code, pack] of Object.entries(EXTRA)) {
  const p = path.join(localesDir, `${code}.json`);
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  // Add to settings top-level
  Object.assign(j.settings, pack);
  fs.writeFileSync(p, JSON.stringify(j, null, 2));
  console.log(`merged settings errors → ${code}.json`);
}
