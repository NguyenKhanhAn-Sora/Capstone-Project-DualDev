"use client";

import React, { useState } from "react";
import styles from "./ServerSettingsPanel.module.css";
import DeleteServerModal from "@/components/DeleteServerModal";

export type ServerSettingsSection =
  | "profile"
  | "interactions"
  | "privileges"
  | "emoji"
  | "sticker"
  | "members"
  | "roles"
  | "invites"
  | "access"
  | "safety"
  | "audit-log"
  | "bans"
  | "automod"
  | "community"
  | "template"
  | "delete-server";

interface SidebarEntry {
  id: ServerSettingsSection;
  label: string;
  external?: boolean;
  danger?: boolean;
}

const SIDEBAR_SECTIONS: { title: string; items: SidebarEntry[]; key: string }[] = [
  {
    key: "group-profile",
    title: "",
    items: [
      { id: "profile", label: "Hồ sơ máy chủ" },
      { id: "interactions", label: "Tương Tác" },
      { id: "privileges", label: "Đặc Quyền Nâng Cấp" },
    ],
  },
  {
    key: "group-bieu-cam",
    title: "BIỂU CẢM",
    items: [
      { id: "emoji", label: "Emoji" },
      { id: "sticker", label: "Sticker" },
    ],
  },
  {
    key: "group-moi-nguoi",
    title: "MỌI NGƯỜI",
    items: [
      { id: "members", label: "Thành viên" },
      { id: "roles", label: "Vai trò" },
      { id: "invites", label: "Lời mời" },
      { id: "access", label: "Truy cập" },
    ],
  },
  {
    key: "group-dieu-chinh",
    title: "ĐIỀU CHỈNH",
    items: [
      { id: "safety", label: "Thiết lập An toàn" },
      { id: "audit-log", label: "Nhật Ký Chỉnh Sửa" },
      { id: "bans", label: "Chặn" },
      { id: "automod", label: "AutoMod" },
    ],
  },
  {
    key: "group-community",
    title: "",
    items: [
      { id: "community", label: "Cài Đặt Cộng Đồng" },
      { id: "template", label: "Mẫu Máy Chủ" },
    ],
  },
  {
    key: "group-delete",
    title: "",
    items: [{ id: "delete-server", label: "Xóa máy chủ", danger: true }],
  },
];

const SECTION_LABELS: Record<ServerSettingsSection, string> = {
  profile: "Hồ sơ máy chủ",
  interactions: "Tương Tác",
  privileges: "Đặc Quyền Nâng Cấp",
  emoji: "Emoji",
  sticker: "Sticker",
  members: "Thành viên",
  roles: "Vai trò",
  invites: "Lời mời",
  access: "Truy cập",
  safety: "Thiết lập An toàn",
  "audit-log": "Nhật Ký Chỉnh Sửa",
  bans: "Chặn",
  automod: "AutoMod",
  community: "Cài Đặt Cộng Đồng",
  template: "Mẫu Máy Chủ",
  "delete-server": "Xóa máy chủ",
};

export interface ServerSettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  serverName: string;
  serverId: string;
  /** Chỉ người tạo (chủ sở hữu) máy chủ mới xóa được. Khi false sẽ ẩn mục "Xóa máy chủ". */
  isOwner?: boolean;
  /** Render nội dung cho từng mục (Hồ Sơ Máy Chủ, v.v.). Nếu không truyền thì hiển thị placeholder. */
  renderSection?: (section: ServerSettingsSection) => React.ReactNode;
  /** Gọi khi người dùng xác nhận xóa máy chủ. Sau khi xóa xong nên đóng panel và cập nhật danh sách. */
  onDeleteServer?: (serverId: string) => Promise<void>;
}

export default function ServerSettingsPanel({
  isOpen,
  onClose,
  serverName,
  serverId,
  isOwner = true,
  renderSection,
  onDeleteServer,
}: ServerSettingsPanelProps) {
  const [activeSection, setActiveSection] = useState<ServerSettingsSection>("profile");
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const handleSidebarClick = (section: ServerSettingsSection) => {
    if (section === "delete-server") {
      setActiveSection("delete-server");
      setShowDeleteModal(true);
    } else {
      setActiveSection(section);
    }
  };

  const handleDeleteConfirm = async (id: string) => {
    if (onDeleteServer) await onDeleteServer(id);
    setShowDeleteModal(false);
    onClose();
  };

  if (!isOpen) return null;

  const defaultPlaceholder = (
    <div className={styles.placeholderNote}>
      {activeSection === "profile"
        ? "Trang chỉnh sửa Hồ Sơ Máy Chủ sẽ được minh họa từng mục sau."
        : `Nội dung cho mục "${SECTION_LABELS[activeSection]}" sẽ được bổ sung sau.`}
    </div>
  );

  const sectionContent = renderSection
    ? (renderSection(activeSection) ?? defaultPlaceholder)
    : defaultPlaceholder;

  return (
    <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal aria-label="Cài đặt máy chủ">
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <aside className={styles.sidebar}>
          <div className={styles.sidebarTitle} style={{ paddingTop: 8 }}>
            MÁY CHỦ CỦA {serverName.toUpperCase()}
          </div>
          {SIDEBAR_SECTIONS.filter((group) => (group.key === "group-delete" ? isOwner : true)).map((group) => (
            <div key={group.key}>
              {group.title ? (
                <div className={styles.sidebarTitle}>{group.title}</div>
              ) : null}
              {group.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`${styles.sidebarItem} ${activeSection === item.id ? styles.active : ""} ${item.danger ? styles.sidebarItemDanger : ""}`}
                  onClick={() => handleSidebarClick(item.id)}
                >
                  {item.label}
                  {item.external && (
                    <span className={styles.sidebarItemExternal} aria-hidden>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                        <polyline points="15 3 21 3 21 9" />
                        <line x1="10" y1="14" x2="21" y2="3" />
                      </svg>
                    </span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </aside>
        <div className={styles.contentWrapper}>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Đóng"
          >
            ×
          </button>
          <div className={styles.content}>
            <div className={styles.contentHeader}>
              <h2 className={styles.contentTitle}>{SECTION_LABELS[activeSection]}</h2>
              {activeSection === "profile" && (
                <p className={styles.contentDesc}>
                  Tùy chỉnh cách máy chủ của bạn xuất hiện trong liên kết mời và, nếu được bật, trong Khám Phá Máy Chủ và tin nhắn Kênh Thông Báo
                </p>
              )}
            </div>
            {sectionContent}
          </div>
        </div>
      </div>

      {showDeleteModal && (
        <DeleteServerModal
          isOpen={showDeleteModal}
          onClose={() => setShowDeleteModal(false)}
          serverName={serverName}
          serverId={serverId}
          onConfirm={handleDeleteConfirm}
        />
      )}
    </div>
  );
}
