"use client";

import React, { useEffect, useState } from "react";
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
  | "bans"
  | "automod"
  | "community"
  | "community-overview"
  | "community-onboarding"
  | "delete-server";

interface SidebarEntry {
  id: ServerSettingsSection;
  label: string;
  external?: boolean;
  danger?: boolean;
}

type ServerLocale = "vi" | "en";

const I18N: Record<
  ServerLocale,
  {
    sidebarTitlePrefix: string;
    groups: { title: string; key: string; items: SidebarEntry[] }[];
    sectionLabels: Record<ServerSettingsSection, string>;
    profileDesc: string;
    placeholderProfile: string;
    placeholderSection: (label: string) => string;
  }
> = {
  vi: {
    sidebarTitlePrefix: "MÁY CHỦ CỦA",
    groups: [
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
          { id: "bans", label: "Chặn" },
          { id: "automod", label: "AutoMod" },
        ],
      },
      {
        key: "group-community",
        title: "",
        items: [{ id: "community", label: "Cài Đặt Cộng Đồng" }],
      },
      {
        key: "group-delete",
        title: "",
        items: [{ id: "delete-server", label: "Xóa máy chủ", danger: true }],
      },
    ],
    sectionLabels: {
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
      bans: "Chặn",
      automod: "AutoMod",
      community: "Cài Đặt Cộng Đồng",
      "community-overview": "Tổng Quan Cộng Đồng",
      "community-onboarding": "Hướng Dẫn Làm Quen",
      "delete-server": "Xóa máy chủ",
    },
    profileDesc:
      "Tùy chỉnh cách máy chủ của bạn xuất hiện trong liên kết mời và, nếu được bật, trong Khám Phá Máy Chủ và tin nhắn Kênh Thông Báo",
    placeholderProfile:
      "Trang chỉnh sửa Hồ Sơ Máy Chủ sẽ được minh họa từng mục sau.",
    placeholderSection: (label) =>
      `Nội dung cho mục "${label}" sẽ được bổ sung sau.`,
  },
  en: {
    sidebarTitlePrefix: "SERVER OF",
    groups: [
      {
        key: "group-profile",
        title: "",
        items: [
          { id: "profile", label: "Server Profile" },
          { id: "interactions", label: "Interactions" },
          { id: "privileges", label: "Boosting Privileges" },
        ],
      },
      {
        key: "group-bieu-cam",
        title: "EXPRESSIONS",
        items: [
          { id: "emoji", label: "Emoji" },
          { id: "sticker", label: "Stickers" },
        ],
      },
      {
        key: "group-moi-nguoi",
        title: "PEOPLE",
        items: [
          { id: "members", label: "Members" },
          { id: "roles", label: "Roles" },
          { id: "invites", label: "Invites" },
          { id: "access", label: "Access" },
        ],
      },
      {
        key: "group-dieu-chinh",
        title: "MODERATION",
        items: [
          { id: "safety", label: "Safety Setup" },
          { id: "bans", label: "Bans" },
          { id: "automod", label: "AutoMod" },
        ],
      },
      {
        key: "group-community",
        title: "",
        items: [{ id: "community", label: "Community Settings" }],
      },
      {
        key: "group-delete",
        title: "",
        items: [{ id: "delete-server", label: "Delete Server", danger: true }],
      },
    ],
    sectionLabels: {
      profile: "Server Profile",
      interactions: "Interactions",
      privileges: "Boosting Privileges",
      emoji: "Emoji",
      sticker: "Stickers",
      members: "Members",
      roles: "Roles",
      invites: "Invites",
      access: "Access",
      safety: "Safety Setup",
      bans: "Bans",
      automod: "AutoMod",
      community: "Community Settings",
      "community-overview": "Community Overview",
      "community-onboarding": "Onboarding",
      "delete-server": "Delete Server",
    },
    profileDesc:
      "Customize how your server appears in invite links and, if enabled, in Server Discovery and Safety Alerts channel messages.",
    placeholderProfile: "Server Profile editor will be added here.",
    placeholderSection: (label) => `Content for "${label}" will be added later.`,
  },
};

export interface ServerSettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  serverName: string;
  serverId: string;
  /** Khi mở panel, nhảy thẳng tới mục này (ví dụ sticker / emoji). Không truyền thì mặc định Hồ sơ máy chủ. */
  initialSection?: ServerSettingsSection;
  locale?: ServerLocale;
  /** Chỉ người tạo (chủ sở hữu) máy chủ mới xóa được. Khi false sẽ ẩn mục "Xóa máy chủ". */
  isOwner?: boolean;
  communityEnabled?: boolean;
  /** Render nội dung cho từng mục (Hồ Sơ Máy Chủ, v.v.). Nếu không truyền thì hiển thị placeholder. */
  renderSection?: (section: ServerSettingsSection) => React.ReactNode;
  onCommunityActivated?: () => void;
  /** Gọi khi người dùng xác nhận xóa máy chủ. Sau khi xóa xong nên đóng panel và cập nhật danh sách. */
  onDeleteServer?: (serverId: string) => Promise<void>;
}

export default function ServerSettingsPanel({
  isOpen,
  onClose,
  serverName,
  serverId,
  initialSection,
  locale = "vi",
  isOwner = true,
  communityEnabled = false,
  renderSection,
  onCommunityActivated,
  onDeleteServer,
}: ServerSettingsPanelProps) {
  const [activeSection, setActiveSection] = useState<ServerSettingsSection>("profile");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [localCommunityEnabled, setLocalCommunityEnabled] = useState(communityEnabled);
  useEffect(() => setLocalCommunityEnabled(communityEnabled), [communityEnabled]);

  useEffect(() => {
    if (!isOpen) return;
    if (initialSection) setActiveSection(initialSection);
    else setActiveSection("profile");
  }, [isOpen, initialSection]);

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

  const t = I18N[locale] ?? I18N.vi;

  const defaultPlaceholder = (
    <div className={styles.placeholderNote}>
      {activeSection === "profile"
        ? t.placeholderProfile
        : t.placeholderSection(t.sectionLabels[activeSection])}
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
            {t.sidebarTitlePrefix} {serverName.toUpperCase()}
          </div>
          {t.groups.filter((group) => (group.key === "group-delete" ? isOwner : true)).map((group) => {
            let items = group.items;
            if (group.key === "group-community") {
              if (localCommunityEnabled) {
                items = [
                  { id: "community-overview" as ServerSettingsSection, label: t.sectionLabels["community-overview"] },
                  { id: "community-onboarding" as ServerSettingsSection, label: t.sectionLabels["community-onboarding"] },
                ];
              }
            }
            return (
            <div key={group.key}>
              {group.title ? (
                <div className={styles.sidebarTitle}>{group.title}</div>
              ) : null}
              {items.map((item) => (
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
            );
          })}
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
              <h2 className={styles.contentTitle}>{t.sectionLabels[activeSection]}</h2>
              {activeSection === "profile" && (
                <p className={styles.contentDesc}>
                  {t.profileDesc}
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
