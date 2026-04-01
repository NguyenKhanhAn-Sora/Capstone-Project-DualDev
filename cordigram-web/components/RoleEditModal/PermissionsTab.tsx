"use client";

import React, { useState, useCallback, useEffect } from "react";
import styles from "./PermissionsTab.module.css";
import type { Role, RolePermissions } from "@/lib/servers-api";
import * as serversApi from "@/lib/servers-api";

interface PermissionItem {
  key: keyof RolePermissions;
  label: string;
  description: string;
  warning?: string;
}

interface PermissionSection {
  title: string;
  permissions: PermissionItem[];
}

const PERMISSION_SECTIONS: PermissionSection[] = [
  {
    title: "Quyền Quản Lý Máy Chủ",
    permissions: [
      {
        key: "manageServer",
        label: "Quản Lý Máy Chủ",
        description: "Cho phép thành viên chỉnh sửa tên, hình ảnh và các cài đặt cơ bản của máy chủ.",
        warning: "Đây là quyền quản trị viên mạnh mẽ. Hãy cân nhắc kỹ trước khi cấp.",
      },
      {
        key: "manageChannels",
        label: "Quản Lý Kênh",
        description: "Cho phép thành viên tạo, chỉnh sửa và xóa kênh trong máy chủ.",
        warning: "Đây là quyền quản trị viên mạnh mẽ. Hãy cân nhắc kỹ trước khi cấp.",
      },
      {
        key: "manageEvents",
        label: "Quản Lý Sự Kiện",
        description: "Cho phép thành viên tạo, chỉnh sửa và xóa sự kiện của máy chủ.",
      },
    ],
  },
  {
    title: "Quyền Thành Viên",
    permissions: [
      {
        key: "createInvite",
        label: "Tạo Lời Mời",
        description: "Cho phép thành viên mời người mới vào máy chủ này.",
      },
      {
        key: "changeNickname",
        label: "Đổi Biệt Danh",
        description: "Cho phép thành viên tùy ý thay đổi biệt danh trong máy chủ này.",
      },
      {
        key: "manageNicknames",
        label: "Quản Lý Biệt Danh",
        description: "Cho phép thành viên thay đổi biệt danh của thành viên khác.",
      },
      {
        key: "kickMembers",
        label: "Đuổi, Chấp thuận và Từ chối Thành viên",
        description:
          "Tính năng Đuổi sẽ xóa các thành viên khác khỏi máy chủ này. Thành viên bị đuổi có thể tham gia lại nếu nhận được lời mời khác. Nếu máy chủ kích hoạt Yêu Cầu Đối Với Thành Viên, quyền này cho phép chấp thuận hoặc từ chối các thành viên yêu cầu tham gia vào máy chủ.",
      },
      {
        key: "banMembers",
        label: "Cấm Thành Viên",
        description:
          "Cho phép thành viên cấm vĩnh viễn và xóa lịch sử tin nhắn của các thành viên khác từ máy chủ này.",
      },
      {
        key: "timeoutMembers",
        label: "Hạn chế thành viên",
        description:
          "Khi bạn đặt một người dùng về trạng thái chờ (timeout) thì họ sẽ không thể gửi tin nhắn trò chuyện, trả lời chủ đề thảo luận, tương tác với tin nhắn, hoặc nói trong kênh thoại hoặc kênh Sân Khấu.",
      },
    ],
  },
  {
    title: "Quyền Kênh Tin Nhắn",
    permissions: [
      {
        key: "mentionEveryone",
        label: "Đề cập @everyone, @here và Tất Cả Vai Trò",
        description:
          "Cho phép thành viên dùng @everyone và @here để thông báo tới mọi người trong kênh, và đề cập các vai trò được bật “cho phép đề cập”.",
        warning: "Chỉ nên cấp cho người đáng tin cậy.",
      },
      {
        key: "sendMessages",
        label: "Gửi tin nhắn và tạo bài đăng",
        description:
          "Cho phép thành viên gửi tin nhắn trong các kênh văn bản và tạo bài đăng trong các kênh diễn đàn.",
      },
      {
        key: "sendMessagesInThreads",
        label: "Gửi tin nhắn trong chủ đề và bài đăng",
        description:
          "Cho phép các thành viên gửi tin nhắn trong chủ đề và trong bài đăng trên các kênh diễn đàn.",
      },
      {
        key: "createPublicThreads",
        label: "Tạo Chủ Đề Công Khai",
        description:
          "Cho phép thành viên được tạo chủ đề mà mọi người trong kênh đều có thể xem.",
      },
      {
        key: "createPrivateThreads",
        label: "Tạo Các Chủ Đề Riêng Tư",
        description: "Cho phép thành viên được tạo chủ đề theo chỉ được mời.",
      },
      {
        key: "embedLinks",
        label: "Nhúng liên kết",
        description:
          "Cho phép hiển thị nội dung nhúng của liên kết do thành viên chia sẻ trong các kênh chat.",
      },
      {
        key: "attachFiles",
        label: "Đính kèm tập tin",
        description: "Cho phép thành viên tải lên tệp hoặc tệp media trong kênh chat.",
      },
      {
        key: "addReactions",
        label: "Thêm Biểu Cảm",
        description:
          "Cho phép thành viên thêm hiệu ứng tương tác emoji mới vào tin nhắn. Nếu không cấp quyền này, thành viên vẫn có thể sử dụng các tương tác có sẵn trong tin nhắn.",
      },
      {
        key: "manageMessages",
        label: "Quản lý tin nhắn",
        description:
          "Cho phép thành viên xóa hoặc gỡ bỏ các nội dung nhúng khối tin nhắn của thành viên khác.",
        warning: "Quyền hạn này không còn cho phép ghim tin nhắn hoặc bỏ qua chế độ chậm nữa.",
      },
      {
        key: "pinMessages",
        label: "Ghim Tin Nhắn",
        description: "Cho phép thành viên ghim hoặc bỏ ghim tin nhắn bất kỳ.",
      },
      {
        key: "bypassSlowMode",
        label: "Bỏ Qua Chế Độ Chậm",
        description:
          "Cho phép thành viên gửi tin nhắn mà không chịu ảnh hưởng từ chế độ chậm.",
      },
      {
        key: "manageThreads",
        label: "Quản lý chủ đề và bài đăng",
        description:
          "Cho phép các thành viên đổi tên, xóa, đóng và bật chế độ chậm cho chủ đề và bài đăng. Họ cũng có thể xem các chủ đề riêng tư.",
        warning: "Quyền hạn này không còn cho phép bỏ qua chế độ chậm nữa.",
      },
      {
        key: "viewMessageHistory",
        label: "Xem lịch sử tin nhắn",
        description:
          "Cho phép thành viên đọc các tin nhắn đã được gửi trước đó trong kênh. Nếu không cấp quyền này, thành viên sẽ chỉ nhìn thấy các tin nhắn được gửi khi họ đang trực tuyến. Tùy chọn này không áp dụng hoàn toàn với các bài đăng chủ đề và diễn đàn.",
      },
      {
        key: "sendTTS",
        label: "Gửi Tin Nhắn Văn Bản Thành Giọng Nói",
        description:
          'Cho phép thành viên gửi tin nhắn "văn bản thành giọng nói" bằng cách nhập lệnh /tts vào đầu tin nhắn. Tất cả thành viên đang hoạt động trong kênh đều có thể nghe được tin nhắn này.',
      },
      {
        key: "sendVoiceMessages",
        label: "Gửi tin nhắn thoại",
        description: "Cho phép thành viên gửi tin nhắn thoại.",
      },
      {
        key: "createPolls",
        label: "Tạo khảo sát",
        description: "Cho phép thành viên tạo khảo sát.",
      },
    ],
  },
  {
    title: "Quyền Kênh Thoại",
    permissions: [
      {
        key: "connect",
        label: "Kết nối",
        description: "Cho phép thành viên tham gia kênh thoại và nghe các thành viên khác nói.",
      },
      {
        key: "speak",
        label: "Nói",
        description:
          'Cho phép thành viên trò chuyện trong kênh thoại. Nếu không cấp quyền này, thành viên đó sẽ bị mặc định tắt âm cho đến khi một thành viên nào đó có quyền "Tắt Âm Thành Viên" bỏ tắt mic cho họ.',
      },
      {
        key: "video",
        label: "Video",
        description:
          "Cho phép thành viên chia sẻ video, chia sẻ màn hình, hoặc stream game trong máy chủ này.",
      },
      {
        key: "muteMembers",
        label: "Tắt âm thành viên",
        description:
          "Cho phép thành viên tắt âm của thành viên khác trong các kênh thoại dành cho tất cả mọi người.",
      },
      {
        key: "deafenMembers",
        label: "Tắt nghe thành viên",
        description:
          "Cho phép thành viên tắt âm của thành viên khác trong kênh thoại khiến họ không thể nói hoặc nghe thấy người khác nói.",
      },
      {
        key: "moveMembers",
        label: "Di chuyển thành viên",
        description:
          "Cho phép thành viên ngắt kết nối hoặc di chuyển các thành viên khác qua lại giữa các kênh thoại mà thành viên giữ quyền này có quyền truy cập.",
      },
      {
        key: "setVoiceChannelStatus",
        label: "Đặt trạng thái Kênh Thoại",
        description: "Cho phép thành viên tạo và chỉnh sửa trạng thái kênh thoại.",
      },
    ],
  },
];

interface PermissionsTabProps {
  serverId: string;
  role: Role;
  isOwner: boolean;
  onUpdate: (role: Role) => void;
}

export default function PermissionsTab({
  serverId,
  role,
  isOwner,
  onUpdate,
}: PermissionsTabProps) {
  const mergeRolePermissions = (r: Role): RolePermissions => ({
    ...r.permissions,
    mentionEveryone: r.permissions.mentionEveryone ?? false,
  });

  const [permissions, setPermissions] = useState<RolePermissions>(mergeRolePermissions(role));
  const [searchQuery, setSearchQuery] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setPermissions(mergeRolePermissions(role));
  }, [role]);

  const hasChanges =
    JSON.stringify(permissions) !== JSON.stringify(mergeRolePermissions(role));

  const handleToggle = (key: keyof RolePermissions) => {
    if (!isOwner) return;
    setPermissions((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleSave = useCallback(async () => {
    if (!isOwner || !hasChanges) return;
    setSaving(true);
    try {
      const updated = await serversApi.updateRole(serverId, role._id, {
        permissions,
      });
      onUpdate(updated);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Không lưu được thay đổi");
    } finally {
      setSaving(false);
    }
  }, [serverId, role._id, permissions, isOwner, hasChanges, onUpdate]);

  const handleReset = () => {
    setPermissions(mergeRolePermissions(role));
  };

  const filteredSections = PERMISSION_SECTIONS.map((section) => ({
    ...section,
    permissions: section.permissions.filter(
      (p) =>
        p.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.description.toLowerCase().includes(searchQuery.toLowerCase())
    ),
  })).filter((section) => section.permissions.length > 0);

  return (
    <div className={styles.container}>
      {/* Search */}
      <div className={styles.searchWrapper}>
        <svg
          className={styles.searchIcon}
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
        </svg>
        <input
          type="text"
          className={styles.searchInput}
          placeholder="Quyền tìm kiếm"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Permission Sections */}
      {filteredSections.map((section) => (
        <div key={section.title} className={styles.section}>
          <h3 className={styles.sectionTitle}>{section.title}</h3>
          <div className={styles.permissionsList}>
            {section.permissions.map((perm) => (
              <div key={perm.key} className={styles.permissionItem}>
                <div className={styles.permissionInfo}>
                  <span className={styles.permissionLabel}>{perm.label}</span>
                  <span className={styles.permissionDesc}>{perm.description}</span>
                  {perm.warning && (
                    <div className={styles.permissionWarning}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
                      </svg>
                      {perm.warning}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={permissions[perm.key]}
                  className={`${styles.toggle} ${
                    permissions[perm.key] ? styles.toggleOn : ""
                  }`}
                  onClick={() => handleToggle(perm.key)}
                  disabled={!isOwner}
                >
                  <span className={styles.toggleThumb} />
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}

      {filteredSections.length === 0 && (
        <div className={styles.noResults}>
          Không tìm thấy quyền hạn nào phù hợp với "{searchQuery}"
        </div>
      )}

      {/* Save/Reset Bar */}
      {hasChanges && (
        <div className={styles.saveBar}>
          <span className={styles.saveBarText}>Cẩn thận - bạn có thay đổi chưa lưu!</span>
          <div className={styles.saveBarActions}>
            <button
              className={styles.resetBtn}
              onClick={handleReset}
              disabled={saving}
            >
              Đặt lại
            </button>
            <button
              className={styles.saveBtn}
              onClick={handleSave}
              disabled={saving || !isOwner}
            >
              {saving ? "Đang lưu..." : "Lưu thay đổi"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
