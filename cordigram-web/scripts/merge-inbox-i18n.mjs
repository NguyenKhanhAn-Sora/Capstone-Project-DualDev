/**
 * Merges i18n keys for inbox notifications and chat page strings.
 * Run: node scripts/merge-inbox-i18n.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.join(__dirname, "..", "locales");

const PACKS = {
  vi: {
    dmList: { sent: "Đã gửi" },
    mention: { tooltip: "Đề cập (@mention)" },
    applyPending: {
      title: "Đơn đăng ký tham gia {server} của bạn đang được xem xét!",
      desc: "Bạn sẽ nhận được thông báo khi có bản cập nhật.",
      withdraw: "Thu hồi",
      withdrawError: "Không thu hồi được",
      joinError: "Không tham gia được máy chủ",
    },
    popups: {
      inbox: {
        adminViewTitle: "Quản trị viên hệ thống đang xem máy chủ",
        adminViewContent: "Quản trị viên hệ thống đang kiểm tra máy chủ \"{server}\" của bạn. Đây là hoạt động kiểm duyệt định kỳ.",
        mentionSpamWarning: "Bạn đã bị cảnh báo vì spam đề cập trong kênh của máy chủ \"{server}\". Vui lòng giảm số lần đề cập trong tin nhắn.",
      },
    },
  },
  en: {
    dmList: { sent: "Sent" },
    mention: { tooltip: "Mention (@mention)" },
    applyPending: {
      title: "Your application to join {server} is under review!",
      desc: "You will receive a notification when there is an update.",
      withdraw: "Withdraw",
      withdrawError: "Could not withdraw application",
      joinError: "Could not join server",
    },
    popups: {
      inbox: {
        adminViewTitle: "System administrator is viewing the server",
        adminViewContent: "The system administrator is reviewing your server \"{server}\". This is a periodic moderation activity.",
        mentionSpamWarning: "You have been warned for mention spam in a channel of server \"{server}\". Please reduce the number of mentions in your messages.",
      },
    },
  },
  ja: {
    dmList: { sent: "送信済み" },
    mention: { tooltip: "メンション (@mention)" },
    applyPending: {
      title: "{server}への参加申請が審査中です！",
      desc: "更新があれば通知が届きます。",
      withdraw: "取り下げ",
      withdrawError: "申請を取り下げられませんでした",
      joinError: "サーバーに参加できませんでした",
    },
    popups: {
      inbox: {
        adminViewTitle: "システム管理者がサーバーを閲覧中",
        adminViewContent: "システム管理者があなたのサーバー「{server}」を確認しています。これは定期的なモデレーション活動です。",
        mentionSpamWarning: "サーバー「{server}」のチャンネルでメンションスパムをしたとして警告されました。メッセージ内のメンション数を減らしてください。",
      },
    },
  },
  zh: {
    dmList: { sent: "已发送" },
    mention: { tooltip: "提及 (@mention)" },
    applyPending: {
      title: "您加入 {server} 的申请正在审核中！",
      desc: "有更新时您将收到通知。",
      withdraw: "撤回",
      withdrawError: "无法撤回申请",
      joinError: "无法加入服务器",
    },
    popups: {
      inbox: {
        adminViewTitle: "系统管理员正在查看服务器",
        adminViewContent: "系统管理员正在审核您的服务器「{server}」。这是定期审核活动。",
        mentionSpamWarning: "您因在服务器「{server}」的频道中滥发提及而受到警告。请减少消息中的提及次数。",
      },
    },
  },
};

function deepMerge(target, source) {
  for (const [k, v] of Object.entries(source)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      target[k] = target[k] && typeof target[k] === "object" ? target[k] : {};
      deepMerge(target[k], v);
    } else {
      target[k] = v;
    }
  }
  return target;
}

for (const [code, pack] of Object.entries(PACKS)) {
  const p = path.join(localesDir, `${code}.json`);
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  deepMerge(j.chat, pack);
  fs.writeFileSync(p, JSON.stringify(j, null, 2));
  console.log(`merged inbox i18n → ${code}.json`);
}
