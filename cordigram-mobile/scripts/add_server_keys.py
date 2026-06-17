import json, codecs, os

base = r"F:\VTC\Capstone Project\Capstone-Project-DualDev\cordigram-mobile\assets\locales"

server_keys = {
    "en": {
        "iconUpdated": "Icon updated (tap Save to apply)",
        "bannerSelected": "Banner image selected (tap Save to apply)",
        "nameRequired": "Server name cannot be empty",
        "changesSaved": "Changes saved",
        "noPermissionManageEmoji": "You don't have permission to manage expressions.",
        "createRole": "Create role",
        "reject": "Reject",
        "approve": "Approve",
        "approveFailed": "Approval failed",
        "rejectFailed": "Rejection failed",
        "loadDetailFailed": "Failed to load details",
        "noChatChannel": "Server has no chat channel to open.",
        "members": {
            "days7": "7 days",
            "days14": "14 days",
            "days30": "30 days",
            "allRoles": "All roles",
            "noRole": "No role",
            "memberRole": "Member"
        }
    },
    "vi": {
        "iconUpdated": "Đã cập nhật biểu tượng (nhấn Lưu để gửi máy chủ)",
        "bannerSelected": "Đã chọn ảnh biểu ngữ (nhấn Lưu để gửi máy chủ)",
        "nameRequired": "Tên máy chủ không được để trống",
        "changesSaved": "Đã lưu thay đổi",
        "noPermissionManageEmoji": "Bạn không có quyền quản lý biểu cảm.",
        "createRole": "Tạo vai trò",
        "reject": "Từ chối",
        "approve": "Duyệt",
        "approveFailed": "Duyệt thất bại",
        "rejectFailed": "Từ chối thất bại",
        "loadDetailFailed": "Không tải chi tiết",
        "noChatChannel": "Server chưa có kênh chat để mở.",
        "members": {
            "days7": "7 ngày",
            "days14": "14 ngày",
            "days30": "30 ngày",
            "allRoles": "Mọi vai trò",
            "noRole": "Không có vai trò",
            "memberRole": "Thành viên"
        }
    },
    "ja": {
        "iconUpdated": "アイコンを更新しました（保存を押して適用）",
        "bannerSelected": "バナー画像を選択しました（保存を押して適用）",
        "nameRequired": "サーバー名を空にできません",
        "changesSaved": "変更を保存しました",
        "noPermissionManageEmoji": "表現を管理する権限がありません。",
        "createRole": "ロールを作成",
        "reject": "拒否",
        "approve": "承認",
        "approveFailed": "承認に失敗しました",
        "rejectFailed": "拒否に失敗しました",
        "loadDetailFailed": "詳細を読み込めませんでした",
        "noChatChannel": "サーバーに開くチャットチャンネルがありません。",
        "members": {
            "days7": "7日間",
            "days14": "14日間",
            "days30": "30日間",
            "allRoles": "すべてのロール",
            "noRole": "ロールなし",
            "memberRole": "メンバー"
        }
    },
    "zh": {
        "iconUpdated": "图标已更新（点击保存以应用）",
        "bannerSelected": "已选择横幅图片（点击保存以应用）",
        "nameRequired": "服务器名称不能为空",
        "changesSaved": "更改已保存",
        "noPermissionManageEmoji": "您没有管理表情的权限。",
        "createRole": "创建角色",
        "reject": "拒绝",
        "approve": "批准",
        "approveFailed": "批准失败",
        "rejectFailed": "拒绝失败",
        "loadDetailFailed": "无法加载详情",
        "noChatChannel": "服务器没有可打开的聊天频道。",
        "members": {
            "days7": "7天",
            "days14": "14天",
            "days30": "30天",
            "allRoles": "所有角色",
            "noRole": "无角色",
            "memberRole": "成员"
        }
    }
}

for lang, keys in server_keys.items():
    path = os.path.join(base, f"{lang}.json")
    with codecs.open(path, 'r', 'utf-8') as f:
        data = json.load(f)
    data['server'] = keys
    with codecs.open(path, 'w', 'utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"Done {lang}.json")

print("All locale files updated.")
