/**
 * Merges i18n keys for verification modal and remaining page strings.
 * Run: node scripts/merge-verify-i18n.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.join(__dirname, "..", "locales");

function deepMerge(target, source) {
  for (const [k, v] of Object.entries(source)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      target[k] = (target[k] && typeof target[k] === "object") ? target[k] : {};
      deepMerge(target[k], v);
    } else {
      target[k] = v;
    }
  }
  return target;
}

const PACKS = {
  vi: {
    chatPage: {
      loadingSelectServer: "Đang tải...",
      selectServerPrompt: "Chọn máy chủ và kênh để bắt đầu nhắn tin",
      memberCount: "{count} thành viên",
      foundedMonth: "Thành lập từ tháng {date}",
    },
    verify: {
      dialogLabel: "Trước khi bạn bắt đầu trò chuyện",
      title: "Trước khi bạn bắt đầu trò chuyện ở đây...",
      subtitle: "Bạn sẽ phải hoàn thành các bước dưới đây.",
      agreeRules: "Đồng ý với quy định",
      agreeCheckbox: "Tôi đã đọc và đồng ý với các quy định",
      verificationLevel: "Xác minh máy chủ — Mức {level}",
      levelLow: "Thấp",
      levelMedium: "Trung bình",
      levelHigh: "Cao",
      emailVerify: "Xác minh email đăng ký",
      sendOtpSending: "Đang gửi...",
      sendOtpCooldown: "Gửi lại ({sec}s)",
      sendOtpBtn: "Gửi mã xác minh",
      otpPlaceholder: "Nhập mã OTP",
      verifyOtpSending: "Đang xác minh...",
      verifyOtpBtn: "Xác minh",
      resendOtp: "Gửi lại mã",
      resendAfter: "Gửi lại sau {sec}s",
      otpError: "Không thể gửi mã",
      otpInvalid: "Mã không hợp lệ",
      resendError: "Không thể gửi lại",
      waitRetry: "Vui lòng đợi {sec}s",
      account5min: "Tài khoản đã đăng ký Cordigram trên 5 phút",
      member10min: "Đã là thành viên máy chủ trên 10 phút",
      waitApprox: "Còn khoảng {time}",
      submitBtn: "Gửi",
      submitting: "Đang gửi…",
    },
  },
  en: {
    chatPage: {
      loadingSelectServer: "Loading...",
      selectServerPrompt: "Select a server and channel to start messaging",
      memberCount: "{count} members",
      foundedMonth: "Founded {date}",
    },
    verify: {
      dialogLabel: "Before you start chatting",
      title: "Before you start chatting here...",
      subtitle: "You'll need to complete the steps below.",
      agreeRules: "Agree to rules",
      agreeCheckbox: "I have read and agree to the rules",
      verificationLevel: "Server verification — Level {level}",
      levelLow: "Low",
      levelMedium: "Medium",
      levelHigh: "High",
      emailVerify: "Verify your registration email",
      sendOtpSending: "Sending...",
      sendOtpCooldown: "Resend ({sec}s)",
      sendOtpBtn: "Send verification code",
      otpPlaceholder: "Enter OTP",
      verifyOtpSending: "Verifying...",
      verifyOtpBtn: "Verify",
      resendOtp: "Resend code",
      resendAfter: "Resend after {sec}s",
      otpError: "Failed to send code",
      otpInvalid: "Invalid code",
      resendError: "Failed to resend",
      waitRetry: "Please wait {sec}s",
      account5min: "Cordigram account older than 5 minutes",
      member10min: "Server member for more than 10 minutes",
      waitApprox: "About {time} remaining",
      submitBtn: "Submit",
      submitting: "Submitting…",
    },
  },
  ja: {
    chatPage: {
      loadingSelectServer: "読み込み中...",
      selectServerPrompt: "サーバーとチャンネルを選択してメッセージを開始",
      memberCount: "{count}人のメンバー",
      foundedMonth: "設立: {date}",
    },
    verify: {
      dialogLabel: "会話を始める前に",
      title: "ここでの会話を始める前に...",
      subtitle: "以下のステップを完了する必要があります。",
      agreeRules: "ルールに同意する",
      agreeCheckbox: "ルールを読んで同意します",
      verificationLevel: "サーバー認証 — レベル {level}",
      levelLow: "低",
      levelMedium: "中",
      levelHigh: "高",
      emailVerify: "登録メールを確認する",
      sendOtpSending: "送信中...",
      sendOtpCooldown: "再送信 ({sec}s)",
      sendOtpBtn: "確認コードを送信",
      otpPlaceholder: "OTPを入力",
      verifyOtpSending: "確認中...",
      verifyOtpBtn: "確認",
      resendOtp: "コードを再送信",
      resendAfter: "{sec}秒後に再送信",
      otpError: "コードを送信できません",
      otpInvalid: "無効なコード",
      resendError: "再送信できません",
      waitRetry: "{sec}秒お待ちください",
      account5min: "Cordigramアカウントを5分以上前に登録",
      member10min: "サーバーメンバーとして10分以上",
      waitApprox: "残り約{time}",
      submitBtn: "送信",
      submitting: "送信中…",
    },
  },
  zh: {
    chatPage: {
      loadingSelectServer: "加载中...",
      selectServerPrompt: "选择服务器和频道开始聊天",
      memberCount: "{count} 位成员",
      foundedMonth: "创建于 {date}",
    },
    verify: {
      dialogLabel: "开始聊天前",
      title: "在这里开始聊天前...",
      subtitle: "您需要完成以下步骤。",
      agreeRules: "同意规则",
      agreeCheckbox: "我已阅读并同意规则",
      verificationLevel: "服务器验证 — 等级 {level}",
      levelLow: "低",
      levelMedium: "中",
      levelHigh: "高",
      emailVerify: "验证注册邮箱",
      sendOtpSending: "发送中...",
      sendOtpCooldown: "重新发送 ({sec}s)",
      sendOtpBtn: "发送验证码",
      otpPlaceholder: "输入OTP",
      verifyOtpSending: "验证中...",
      verifyOtpBtn: "验证",
      resendOtp: "重新发送代码",
      resendAfter: "{sec}秒后重新发送",
      otpError: "无法发送代码",
      otpInvalid: "无效代码",
      resendError: "无法重新发送",
      waitRetry: "请等待{sec}秒",
      account5min: "Cordigram账户注册超过5分钟",
      member10min: "成为服务器成员超过10分钟",
      waitApprox: "还剩约{time}",
      submitBtn: "提交",
      submitting: "提交中…",
    },
  },
};

for (const [code, pack] of Object.entries(PACKS)) {
  const p = path.join(localesDir, `${code}.json`);
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  deepMerge(j.chat, pack);
  fs.writeFileSync(p, JSON.stringify(j, null, 2));
  console.log(`merged verify i18n -> ${code}.json`);
}
