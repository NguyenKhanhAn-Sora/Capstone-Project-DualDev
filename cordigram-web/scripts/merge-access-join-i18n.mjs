/**
 * Merges i18n keys for:
 * - Rule templates (ServerAccessSection)
 * - Question templates (ServerAccessSection)
 * - Age restriction popup (messages/page.tsx)
 * - Join Applications Panel (ServerJoinApplicationsPanel)
 *
 * Run: node scripts/merge-access-join-i18n.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.join(__dirname, "..", "locales");

const PACKS = {
  vi: {
    serverAccess: {
      ruleTemplate1: "Lich su va van minh",
      ruleTemplate2: "Khong spam hoac tu quang ba ban than (moi tham gia may chu, quang cao, v.v) khi chua duoc su cho phep cua ban quan tri may chu. Bao gom ca hanh vi nhan tin truc tiep cho cac thanh vien trong may chu.",
      ruleTemplate3: "Khong co hanh dong bao luc hoac noi dung phan cam",
      ruleTemplate4: "Giup dam bao moi truong lanh manh",
      questionTemplate1: "Ban co choi tro choi nao giong voi chung toi khong?",
      questionTemplate2: "Ban tim thay chung toi bang cach nao?",
      questionTemplate3: "Dau la diem doc nhat vo nhi cua ban?",
      defaultQuestion: "Tai sao ban muon tham gia may chu cua chung toi?",
    },
    ageRestrict: {
      bannerNotice: "May chu nay co noi dung duoc gan nhan gioi han do tuoi (18+). Hay cu xu phu hop.",
      title: "May chu gioi han do tuoi",
      under18Body: "May chu nay yeu cau tu du 18 tuoi. Tai khoan cua ban chua du dieu kien hoac chua co ngay sinh tren ho so, nen khong the xem tin nhan trong cac kenh.",
      goBack: "Quay lai",
      ackBody: "May chu nay co chua noi dung nhay cam dan nhan gioi han do tuoi. Ban co muon tiep tuc khong?",
      processing: "Dang xu ly...",
      continue: "Tiep tuc",
      moreOptions: "Tuy chon khac",
    },
    joinApplications: {
      title: "Thanh vien — {serverName}",
      tabAll: "Tat Ca Thanh Vien",
      tabPending: "Dang cho xu ly",
      tabRejected: "Bi tu choi",
      tabApproved: "Duoc chap thuan",
      loading: "Dang tai...",
      empty: "Khong co muc nao.",
      errorLoad: "Khong tai duoc danh sach",
      colName: "TEN",
      colRegistered: "DA DANG KY",
      optionsBtn: "Tuy chon",
      closeMenu: "Dong menu",
      close: "Dong",
      menuProfile: "Ho so",
      menuMessage: "Nhan tin",
      menuTimeout: "Han che",
      menuTimeoutPrompt: "Han che trong bao lau (phut)?",
      menuReasonPrompt: "Ly do (khong bat buoc):",
      menuTimeoutError: "Khong han che duoc",
      menuKick: "Duoi",
      menuKickConfirm: "Ban chac chan muon duoi nguoi nay khoi may chu?",
      menuKickError: "Khong duoi duoc",
      menuBan: "Cam",
      menuBanConfirm: "Ban chac chan muon cam nguoi nay khoi may chu?",
      menuBanError: "Khong cam duoc",
      approveTitle: "Chap thuan",
      rejectTitle: "Tu choi",
      approveError: "Khong chap thuan duoc",
      rejectError: "Khong tu choi duoc",
      accountLabel: "Tai khoan",
      joinedCordigram: "Ngay tham gia Cordigram",
      submittedAt: "Ngay gui don dang ky",
      detailLoading: "Dang tai...",
    },
  },
  en: {
    serverAccess: {
      ruleTemplate1: "Be respectful and civil",
      ruleTemplate2: "No spam or self-promotion (server invites, ads, etc.) without permission from the server admins. This includes sending direct messages to server members.",
      ruleTemplate3: "No violence or offensive content",
      ruleTemplate4: "Help maintain a healthy environment",
      questionTemplate1: "Do you play any games similar to ours?",
      questionTemplate2: "How did you find us?",
      questionTemplate3: "What makes you unique?",
      defaultQuestion: "Why do you want to join our server?",
    },
    ageRestrict: {
      bannerNotice: "This server contains age-restricted content (18+). Please behave accordingly.",
      title: "Age-Restricted Server",
      under18Body: "This server requires users to be at least 18 years old. Your account does not meet the requirements or does not have a date of birth on your profile, so you cannot view messages in the channels.",
      goBack: "Go back",
      ackBody: "This server contains sensitive content labeled as age-restricted. Do you want to continue?",
      processing: "Processing...",
      continue: "Continue",
      moreOptions: "More options",
    },
    joinApplications: {
      title: "Members — {serverName}",
      tabAll: "All Members",
      tabPending: "Pending",
      tabRejected: "Rejected",
      tabApproved: "Approved",
      loading: "Loading...",
      empty: "No items.",
      errorLoad: "Failed to load list",
      colName: "NAME",
      colRegistered: "REGISTERED",
      optionsBtn: "Options",
      closeMenu: "Close menu",
      close: "Close",
      menuProfile: "Profile",
      menuMessage: "Message",
      menuTimeout: "Timeout",
      menuTimeoutPrompt: "Timeout duration (minutes)?",
      menuReasonPrompt: "Reason (optional):",
      menuTimeoutError: "Failed to timeout member",
      menuKick: "Kick",
      menuKickConfirm: "Are you sure you want to kick this person from the server?",
      menuKickError: "Failed to kick member",
      menuBan: "Ban",
      menuBanConfirm: "Are you sure you want to ban this person from the server?",
      menuBanError: "Failed to ban member",
      approveTitle: "Approve",
      rejectTitle: "Reject",
      approveError: "Failed to approve",
      rejectError: "Failed to reject",
      accountLabel: "Account",
      joinedCordigram: "Joined Cordigram",
      submittedAt: "Application submitted",
      detailLoading: "Loading...",
    },
  },
  ja: {
    serverAccess: {
      ruleTemplate1: "礼儀正しく接する",
      ruleTemplate2: "サーバー管理者の許可なく、スパムや自己宣伝（サーバー招待、広告など）を行わない。サーバーメンバーへのDMも含む。",
      ruleTemplate3: "暴力的または不快なコンテンツを投稿しない",
      ruleTemplate4: "健全な環境を維持する",
      questionTemplate1: "私たちと似たゲームをプレイしていますか？",
      questionTemplate2: "どのようにして私たちを見つけましたか？",
      questionTemplate3: "あなたのユニークな点は何ですか？",
      defaultQuestion: "なぜ私たちのサーバーに参加したいのですか？",
    },
    ageRestrict: {
      bannerNotice: "このサーバーには年齢制限コンテンツ（18+）が含まれています。適切に行動してください。",
      title: "年齢制限サーバー",
      under18Body: "このサーバーは18歳以上を対象としています。アカウントが条件を満たしていないか、プロフィールに生年月日が登録されていないため、チャンネルのメッセージを閲覧できません。",
      goBack: "戻る",
      ackBody: "このサーバーには年齢制限の感度の高いコンテンツが含まれています。続けますか？",
      processing: "処理中...",
      continue: "続ける",
      moreOptions: "その他のオプション",
    },
    joinApplications: {
      title: "メンバー — {serverName}",
      tabAll: "全メンバー",
      tabPending: "保留中",
      tabRejected: "拒否済み",
      tabApproved: "承認済み",
      loading: "読み込み中...",
      empty: "項目がありません。",
      errorLoad: "リストの読み込みに失敗しました",
      colName: "名前",
      colRegistered: "登録日",
      optionsBtn: "オプション",
      closeMenu: "メニューを閉じる",
      close: "閉じる",
      menuProfile: "プロフィール",
      menuMessage: "メッセージ",
      menuTimeout: "タイムアウト",
      menuTimeoutPrompt: "タイムアウト時間（分）？",
      menuReasonPrompt: "理由（任意）：",
      menuTimeoutError: "タイムアウトに失敗しました",
      menuKick: "キック",
      menuKickConfirm: "このユーザーをサーバーからキックしてよろしいですか？",
      menuKickError: "キックに失敗しました",
      menuBan: "バン",
      menuBanConfirm: "このユーザーをサーバーからバンしてよろしいですか？",
      menuBanError: "バンに失敗しました",
      approveTitle: "承認",
      rejectTitle: "拒否",
      approveError: "承認に失敗しました",
      rejectError: "拒否に失敗しました",
      accountLabel: "アカウント",
      joinedCordigram: "Cordigram参加日",
      submittedAt: "申請送信日",
      detailLoading: "読み込み中...",
    },
  },
  zh: {
    serverAccess: {
      ruleTemplate1: "礼貌和文明",
      ruleTemplate2: "未经服务器管理员许可，不得发送垃圾信息或自我推广（服务器邀请、广告等），包括向服务器成员发送私信。",
      ruleTemplate3: "不得发布暴力或冒犯性内容",
      ruleTemplate4: "帮助维护健康的环境",
      questionTemplate1: "您是否玩过与我们类似的游戏？",
      questionTemplate2: "您是如何找到我们的？",
      questionTemplate3: "您有什么独特之处？",
      defaultQuestion: "您为什么想加入我们的服务器？",
    },
    ageRestrict: {
      bannerNotice: "此服务器包含年龄限制内容（18+）。请适当行事。",
      title: "年龄限制服务器",
      under18Body: "此服务器要求用户年满18岁。您的账户不符合要求或个人资料中未设置生日，因此无法查看频道中的消息。",
      goBack: "返回",
      ackBody: "此服务器包含标记为年龄限制的敏感内容。您要继续吗？",
      processing: "处理中...",
      continue: "继续",
      moreOptions: "更多选项",
    },
    joinApplications: {
      title: "成员 — {serverName}",
      tabAll: "所有成员",
      tabPending: "待处理",
      tabRejected: "已拒绝",
      tabApproved: "已批准",
      loading: "加载中...",
      empty: "没有条目。",
      errorLoad: "加载列表失败",
      colName: "名称",
      colRegistered: "注册日期",
      optionsBtn: "选项",
      closeMenu: "关闭菜单",
      close: "关闭",
      menuProfile: "个人资料",
      menuMessage: "发消息",
      menuTimeout: "禁言",
      menuTimeoutPrompt: "禁言时长（分钟）？",
      menuReasonPrompt: "原因（可选）：",
      menuTimeoutError: "禁言失败",
      menuKick: "踢出",
      menuKickConfirm: "您确定要将此人踢出服务器吗？",
      menuKickError: "踢出失败",
      menuBan: "封禁",
      menuBanConfirm: "您确定要封禁此人吗？",
      menuBanError: "封禁失败",
      approveTitle: "批准",
      rejectTitle: "拒绝",
      approveError: "批准失败",
      rejectError: "拒绝失败",
      accountLabel: "账户",
      joinedCordigram: "加入Cordigram日期",
      submittedAt: "申请提交日期",
      detailLoading: "加载中...",
    },
  },
};

// Actual Vietnamese strings (the ones above were ASCII-safe placeholders)
PACKS.vi.serverAccess.ruleTemplate1 = "Lịch sự và văn minh";
PACKS.vi.serverAccess.ruleTemplate2 = "Không spam hoặc tự quảng bá bản thân (mời tham gia máy chủ, quảng cáo, v.v) khi chưa được sự cho phép của ban quản trị máy chủ. Bao gồm cả hành vi nhắn tin trực tiếp cho các thành viên trong máy chủ.";
PACKS.vi.serverAccess.ruleTemplate3 = "Không có hành động bạo lực hoặc nội dung phản cảm";
PACKS.vi.serverAccess.ruleTemplate4 = "Giúp đảm bảo môi trường lành mạnh";
PACKS.vi.serverAccess.questionTemplate1 = "Bạn có chơi trò chơi nào giống với chúng tôi không?";
PACKS.vi.serverAccess.questionTemplate2 = "Bạn tìm thấy chúng tôi bằng cách nào?";
PACKS.vi.serverAccess.questionTemplate3 = "Đâu là điểm độc nhất vô nhị của bạn?";
PACKS.vi.serverAccess.defaultQuestion = "Tại sao bạn muốn tham gia máy chủ của chúng tôi?";

PACKS.vi.ageRestrict = {
  bannerNotice: "Máy chủ này có nội dung được gắn nhãn giới hạn độ tuổi (18+). Hãy cư xử phù hợp.",
  title: "Máy chủ giới hạn độ tuổi",
  under18Body: "Máy chủ này yêu cầu từ đủ 18 tuổi. Tài khoản của bạn chưa đủ điều kiện hoặc chưa có ngày sinh trên hồ sơ, nên không thể xem tin nhắn trong các kênh.",
  goBack: "Quay lại",
  ackBody: "Máy chủ này có chứa nội dung nhạy cảm dán nhãn giới hạn độ tuổi. Bạn có muốn tiếp tục không?",
  processing: "Đang xử lý...",
  continue: "Tiếp tục",
  moreOptions: "Tùy chọn khác",
};

PACKS.vi.joinApplications = {
  title: "Thành viên — {serverName}",
  tabAll: "Tất Cả Thành Viên",
  tabPending: "Đang chờ xử lý",
  tabRejected: "Bị từ chối",
  tabApproved: "Được chấp thuận",
  loading: "Đang tải…",
  empty: "Không có mục nào.",
  errorLoad: "Không tải được danh sách",
  colName: "TÊN",
  colRegistered: "ĐÃ ĐĂNG KÝ",
  optionsBtn: "Tùy chọn",
  closeMenu: "Đóng menu",
  close: "Đóng",
  menuProfile: "Hồ sơ",
  menuMessage: "Nhắn tin",
  menuTimeout: "Hạn chế",
  menuTimeoutPrompt: "Hạn chế trong bao lâu (phút)?",
  menuReasonPrompt: "Lý do (không bắt buộc):",
  menuTimeoutError: "Không hạn chế được",
  menuKick: "Đuổi",
  menuKickConfirm: "Bạn chắc chắn muốn đuổi người này khỏi máy chủ?",
  menuKickError: "Không đuổi được",
  menuBan: "Cấm",
  menuBanConfirm: "Bạn chắc chắn muốn cấm người này khỏi máy chủ?",
  menuBanError: "Không cấm được",
  approveTitle: "Chấp thuận",
  rejectTitle: "Từ chối",
  approveError: "Không chấp thuận được",
  rejectError: "Không từ chối được",
  accountLabel: "Tài khoản",
  joinedCordigram: "Ngày tham gia Cordigram",
  submittedAt: "Ngày gửi đơn đăng ký",
  detailLoading: "Đang tải…",
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
  console.log(`merged access+join i18n -> ${code}.json`);
}
