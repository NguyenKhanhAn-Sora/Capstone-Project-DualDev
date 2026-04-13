"use client";

import React, { useEffect, useState } from "react";
import styles from "./ServerSettingsPanel.module.css";
import DeleteServerModal from "@/components/DeleteServerModal";
import { useLanguage, type LanguageCode } from "@/component/language-provider";

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
  external?: boolean;
  danger?: boolean;
}

export interface ServerSettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  serverName: string;
  serverId: string;
  /** Khi mở panel, nhảy thẳng tới mục này (ví dụ sticker / emoji). Không truyền thì mặc định Hồ sơ máy chủ. */
  initialSection?: ServerSettingsSection;
  locale?: LanguageCode;
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
  locale,
  isOwner = true,
  communityEnabled = false,
  renderSection,
  onCommunityActivated,
  onDeleteServer,
}: ServerSettingsPanelProps) {
  const { t: tt, language } = useLanguage();
  const t = tt;
  const effectiveLocale = (locale ?? language) as LanguageCode;
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

  const groups: Array<{ key: string; titleKey?: string; items: SidebarEntry[] }> = [
    {
      key: "group-profile",
      items: [
        { id: "profile" },
        { id: "interactions" },
        { id: "privileges" },
      ],
    },
    {
      key: "group-expressions",
      titleKey: "chat.serverSettings.groups.expressions",
      items: [{ id: "emoji" }, { id: "sticker" }],
    },
    {
      key: "group-people",
      titleKey: "chat.serverSettings.groups.people",
      items: [{ id: "members" }, { id: "roles" }, { id: "invites" }, { id: "access" }],
    },
    {
      key: "group-moderation",
      titleKey: "chat.serverSettings.groups.moderation",
      items: [{ id: "safety" }, { id: "bans" }, { id: "automod" }],
    },
    {
      key: "group-community",
      items: [{ id: "community" }],
    },
    {
      key: "group-delete",
      items: [{ id: "delete-server", danger: true }],
    },
  ];

  const sectionLabelKey = (section: ServerSettingsSection) =>
    `chat.serverSettings.sections.${section}`;

  const defaultPlaceholder = (
    <div className={styles.placeholderNote}>
      {activeSection === "profile"
        ? t("chat.serverSettings.placeholder.profile")
        : t("chat.serverSettings.placeholder.section", {
            label: t(sectionLabelKey(activeSection)),
          })}
    </div>
  );

  const sectionContent = renderSection
    ? (renderSection(activeSection) ?? defaultPlaceholder)
    : defaultPlaceholder;

  return (
    <div
      className={styles.overlay}
      onClick={onClose}
      role="dialog"
      aria-modal
      aria-label={t("chat.serverSettings.ariaLabel")}
      data-locale={effectiveLocale}
    >
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <aside className={styles.sidebar}>
          <div className={styles.sidebarTitle} style={{ paddingTop: 8 }}>
            {t("chat.serverSettings.sidebarTitlePrefix")} {serverName.toUpperCase()}
          </div>
          {groups
            .filter((group) => (group.key === "group-delete" ? isOwner : true))
            .map((group) => {
            let items = group.items;
            if (group.key === "group-community") {
              if (localCommunityEnabled) {
                items = [
                  { id: "community-overview" as ServerSettingsSection },
                  { id: "community-onboarding" as ServerSettingsSection },
                ];
              }
            }
            return (
            <div key={group.key}>
              {group.titleKey ? (
                <div className={styles.sidebarTitle}>{t(group.titleKey)}</div>
              ) : null}
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`${styles.sidebarItem} ${activeSection === item.id ? styles.active : ""} ${item.danger ? styles.sidebarItemDanger : ""}`}
                  onClick={() => handleSidebarClick(item.id)}
                >
                  {t(sectionLabelKey(item.id))}
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
            aria-label={t("settings.close")}
          >
            ×
          </button>
          <div className={styles.content}>
            <div className={styles.contentHeader}>
              <h2 className={styles.contentTitle}>{t(sectionLabelKey(activeSection))}</h2>
              {activeSection === "profile" && (
                <p className={styles.contentDesc}>
                  {t("chat.serverSettings.profileDesc")}
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
