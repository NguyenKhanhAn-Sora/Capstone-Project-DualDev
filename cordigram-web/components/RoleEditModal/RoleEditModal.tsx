"use client";

import React, { useState, useEffect, useRef } from "react";
import styles from "./RoleEditModal.module.css";
import type { Role } from "@/lib/servers-api";
import * as serversApi from "@/lib/servers-api";
import DisplayTab from "./DisplayTab";
import PermissionsTab from "./PermissionsTab";
import MembersTab from "./MembersTab";
import { useLanguage } from "@/component/language-provider";

type TabType = "display" | "permissions" | "members";

interface ContextMenuState {
  x: number;
  y: number;
  role: Role;
}

interface RoleEditModalProps {
  serverId: string;
  role: Role;
  roles: Role[];
  isOwner: boolean;
  onClose: () => void;
  onUpdate: (role: Role) => void;
  onDelete: (roleId: string) => void;
  onCreate: (role: Role) => void;
}

export default function RoleEditModal({
  serverId,
  role,
  roles,
  isOwner,
  onClose,
  onUpdate,
  onDelete,
  onCreate,
}: RoleEditModalProps) {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<TabType>("display");
  const [selectedRoleId, setSelectedRoleId] = useState<string>(role._id);
  const [localRoles, setLocalRoles] = useState<Role[]>(roles);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  /** Chỉ đếm memberIds còn thật sự trong server (tránh ghost ID sau khi user rời). */
  const [serverMemberIdSet, setServerMemberIdSet] = useState<Set<string> | null>(null);

  const selectedRole = localRoles.find((r) => r._id === selectedRoleId) || role;

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    if (contextMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [contextMenu]);

  useEffect(() => {
    let cancelled = false;
    serversApi
      .getServerMembers(serverId)
      .then((rows) => {
        if (!cancelled) setServerMemberIdSet(new Set(rows.map((m) => m.userId)));
      })
      .catch(() => {
        if (!cancelled) setServerMemberIdSet(null);
      });
    return () => {
      cancelled = true;
    };
  }, [serverId]);

  const handleRoleContextMenu = (e: React.MouseEvent, r: Role) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      role: r,
    });
  };

  const handleContextMenuDelete = async () => {
    if (!contextMenu || !isOwner || contextMenu.role.isDefault) return;
    const roleToDelete = contextMenu.role;
    setContextMenu(null);
    
    if (!window.confirm(t("chat.roleEditor.confirmDeleteRole", { name: roleToDelete.name }))) {
      return;
    }
    try {
      await serversApi.deleteRole(serverId, roleToDelete._id);
      setLocalRoles((prev) => prev.filter((r) => r._id !== roleToDelete._id));
      onDelete(roleToDelete._id);
      if (selectedRoleId === roleToDelete._id) {
        const remaining = localRoles.filter((r) => r._id !== roleToDelete._id);
        if (remaining.length > 0) {
          setSelectedRoleId(remaining[0]._id);
        }
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : t("chat.roleEditor.errorDeleteRole"));
    }
  };

  const handleRoleSelect = (roleId: string) => {
    setSelectedRoleId(roleId);
  };

  const handleCreateRole = async () => {
    if (!isOwner) return;
    try {
      const newRole = await serversApi.createRole(serverId, {
        name: t("chat.roleEditor.newRoleName"),
        color: "#99AAB5",
      });
      setLocalRoles((prev) => [newRole, ...prev]);
      setSelectedRoleId(newRole._id);
      onCreate(newRole);
    } catch (err) {
      alert(err instanceof Error ? err.message : t("chat.roleEditor.errorCreateRole"));
    }
  };

  const handleRoleUpdate = (updatedRole: Role) => {
    setLocalRoles((prev) =>
      prev.map((r) => (r._id === updatedRole._id ? updatedRole : r))
    );
    onUpdate(updatedRole);
  };

  const handleRoleDelete = async () => {
    if (!isOwner || selectedRole.isDefault) return;
    if (!window.confirm(t("chat.roleEditor.confirmDeleteRole", { name: selectedRole.name }))) {
      return;
    }
    try {
      await serversApi.deleteRole(serverId, selectedRole._id);
      setLocalRoles((prev) => prev.filter((r) => r._id !== selectedRole._id));
      onDelete(selectedRole._id);
      const remaining = localRoles.filter((r) => r._id !== selectedRole._id);
      if (remaining.length > 0) {
        setSelectedRoleId(remaining[0]._id);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : t("chat.roleEditor.errorDeleteRole"));
    }
  };

  const customRoles = localRoles.filter((r) => !r.isDefault);
  const defaultRole = localRoles.find((r) => r.isDefault);

  const rawMemberIds = selectedRole.memberIds || [];
  const memberCount =
    serverMemberIdSet !== null
      ? rawMemberIds.filter((id) => serverMemberIdSet.has(id)).length
      : rawMemberIds.length;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Sidebar */}
        <aside className={styles.sidebar}>
          <div className={styles.sidebarHeader}>
            <button className={styles.backBtn} onClick={onClose}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
              </svg>
              {t("chat.roleEditor.back")}
            </button>
            {isOwner && (
              <button className={styles.addRoleBtn} onClick={handleCreateRole}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
                </svg>
              </button>
            )}
          </div>

          <div className={styles.rolesList}>
            {customRoles.map((r) => (
              <button
                key={r._id}
                className={`${styles.roleItem} ${
                  selectedRoleId === r._id ? styles.roleItemActive : ""
                }`}
                onClick={() => handleRoleSelect(r._id)}
                onContextMenu={(e) => handleRoleContextMenu(e, r)}
              >
                <span
                  className={styles.roleColor}
                  style={{ backgroundColor: r.color }}
                />
                <span className={styles.roleName}>{r.name}</span>
              </button>
            ))}
            {defaultRole && (
              <button
                className={`${styles.roleItem} ${
                  selectedRoleId === defaultRole._id ? styles.roleItemActive : ""
                }`}
                onClick={() => handleRoleSelect(defaultRole._id)}
                onContextMenu={(e) => handleRoleContextMenu(e, defaultRole)}
              >
                <span className={styles.roleColor} style={{ backgroundColor: "#99AAB5" }} />
                <span className={styles.roleName}>@everyone</span>
              </button>
            )}
          </div>

          {/* Context Menu */}
          {contextMenu && (
            <div
              ref={contextMenuRef}
              className={styles.contextMenu}
              style={{
                position: "fixed",
                left: contextMenu.x,
                top: contextMenu.y,
              }}
            >
              <button className={styles.contextMenuItem} disabled>
                <span>{t("chat.roleEditor.viewServerByRole")}</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
                </svg>
              </button>
              {!contextMenu.role.isDefault && isOwner && (
                <button
                  className={`${styles.contextMenuItem} ${styles.contextMenuItemDanger}`}
                  onClick={handleContextMenuDelete}
                >
                  <span>{t("chat.roleEditor.delete")}</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
                  </svg>
                </button>
              )}
            </div>
          )}
        </aside>

        {/* Content */}
        <div className={styles.content}>
          {/* Header */}
          <div className={styles.header}>
            <div className={styles.headerTitle}>
              <span className={styles.editLabel}>{t("chat.roleEditor.editTitle")}</span>
              <span className={styles.roleNameHeader}>{selectedRole.name.toUpperCase()}</span>
            </div>
            <div className={styles.headerActions}>
              {!selectedRole.isDefault && isOwner && (
                <button
                  className={styles.moreBtn}
                  onClick={handleRoleDelete}
                  title={t("chat.roleEditor.deleteRoleAria")}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className={styles.tabs}>
            <button
              className={`${styles.tab} ${activeTab === "display" ? styles.tabActive : ""}`}
              onClick={() => setActiveTab("display")}
            >
              {t("chat.roleEditor.tabDisplay")}
            </button>
            <button
              className={`${styles.tab} ${activeTab === "permissions" ? styles.tabActive : ""}`}
              onClick={() => setActiveTab("permissions")}
            >
              {t("chat.roleEditor.tabPermissions")}
            </button>
            <button
              className={`${styles.tab} ${activeTab === "members" ? styles.tabActive : ""}`}
              onClick={() => setActiveTab("members")}
            >
              {t("chat.roleEditor.tabMembers", { count: memberCount })}
            </button>
          </div>

          {/* Close button */}
          <button className={styles.closeBtn} onClick={onClose}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M15 9l-6 6M9 9l6 6" />
            </svg>
            <span className={styles.escLabel}>{t("chat.roleEditor.esc")}</span>
          </button>

          {/* Tab Content */}
          <div className={styles.tabContent}>
            {activeTab === "display" && (
              <DisplayTab
                serverId={serverId}
                role={selectedRole}
                isOwner={isOwner}
                onUpdate={handleRoleUpdate}
              />
            )}
            {activeTab === "permissions" && (
              <PermissionsTab
                serverId={serverId}
                role={selectedRole}
                isOwner={isOwner}
                onUpdate={handleRoleUpdate}
              />
            )}
            {activeTab === "members" && (
              <MembersTab
                serverId={serverId}
                role={selectedRole}
                isOwner={isOwner}
                onUpdate={handleRoleUpdate}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
