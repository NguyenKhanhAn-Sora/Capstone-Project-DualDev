"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import * as serversApi from "@/lib/servers-api";
import styles from "./ServerMembersSidebar.module.css";

// =====================================================
// TYPES
// =====================================================

interface MemberWithRoles extends serversApi.MemberWithRoles {}

interface CurrentUserPermissions {
  canKick: boolean;
  canBan: boolean;
  canTimeout: boolean;
  isOwner: boolean;
}

interface MemberGroup {
  roleName: string;
  roleColor: string;
  rolePosition: number;
  members: MemberWithRoles[];
}

// =====================================================
// CONTEXT MENU STATE
// =====================================================

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  member: MemberWithRoles | null;
}

// =====================================================
// MODERATION MODAL STATE
// =====================================================

type ModerationAction = "kick" | "ban" | "timeout" | null;

interface ModerationModalState {
  action: ModerationAction;
  member: MemberWithRoles | null;
}

// =====================================================
// TIMEOUT DURATION OPTIONS
// =====================================================

const TIMEOUT_DURATIONS = [
  { label: "60 giây", seconds: 60 },
  { label: "5 phút", seconds: 5 * 60 },
  { label: "10 phút", seconds: 10 * 60 },
  { label: "1 giờ", seconds: 60 * 60 },
  { label: "1 ngày", seconds: 24 * 60 * 60 },
  { label: "1 tuần", seconds: 7 * 24 * 60 * 60 },
];

// =====================================================
// MAIN COMPONENT
// =====================================================

export interface ServerMembersSidebarProps {
  serverId: string;
  currentUserId: string;
  /** Callback khi click vào member để mở DM */
  onNavigateToDM?: (
    userId: string,
    displayName: string,
    username: string,
    avatarUrl?: string
  ) => void;
  /** Callback khi click vào member để xem profile */
  onViewProfile?: (member: MemberWithRoles) => void;
}

export default function ServerMembersSidebar({
  serverId,
  currentUserId,
  onNavigateToDM,
  onViewProfile,
}: ServerMembersSidebarProps) {
  // State
  const [members, setMembers] = useState<MemberWithRoles[]>([]);
  const [permissions, setPermissions] = useState<CurrentUserPermissions>({
    canKick: false,
    canBan: false,
    canTimeout: false,
    isOwner: false,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    member: null,
  });

  // Moderation modal state
  const [moderationModal, setModerationModal] = useState<ModerationModalState>({
    action: null,
    member: null,
  });
  const [moderationReason, setModerationReason] = useState("");
  const [timeoutDuration, setTimeoutDuration] = useState(TIMEOUT_DURATIONS[0].seconds);
  const [moderationLoading, setModerationLoading] = useState(false);

  // Refs
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // =====================================================
  // DATA FETCHING
  // =====================================================

  const fetchMembers = useCallback(async () => {
    if (!serverId) return;
    setLoading(true);
    setError(null);

    try {
      const response = await serversApi.getServerMembersWithRoles(serverId);
      setMembers(response.members);
      setPermissions(response.currentUserPermissions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được danh sách thành viên");
    } finally {
      setLoading(false);
    }
  }, [serverId]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  // =====================================================
  // GROUP MEMBERS BY ROLE
  // Nhóm members theo role (giống Discord)
  // =====================================================

  const groupedMembers = useMemo((): MemberGroup[] => {
    // Map để lưu trữ groups theo role name
    const groupMap = new Map<string, MemberGroup>();

    // Tạo group "Online" cho members không có role đặc biệt
    const onlineGroup: MemberGroup = {
      roleName: "Trực tuyến",
      roleColor: "#99AAB5",
      rolePosition: -1,
      members: [],
    };

    for (const member of members) {
      // Nếu member có role với displaySeparately = true (sẽ cần check từ API)
      // Tạm thời nhóm theo role có position cao nhất
      if (member.roles.length > 0) {
        const highestRole = member.roles[0]; // Roles đã được sort theo position DESC

        const key = highestRole._id;
        if (!groupMap.has(key)) {
          groupMap.set(key, {
            roleName: highestRole.name,
            roleColor: highestRole.color,
            rolePosition: highestRole.position,
            members: [],
          });
        }
        groupMap.get(key)!.members.push(member);
      } else {
        // Members không có role (chỉ có @everyone)
        onlineGroup.members.push(member);
      }
    }

    // Sort groups by position (cao nhất lên trước)
    const groups = Array.from(groupMap.values()).sort(
      (a, b) => b.rolePosition - a.rolePosition
    );

    // Thêm group "Trực tuyến" vào cuối nếu có members
    if (onlineGroup.members.length > 0) {
      groups.push(onlineGroup);
    }

    return groups;
  }, [members]);

  // =====================================================
  // CONTEXT MENU HANDLERS
  // =====================================================

  const handleContextMenu = (e: React.MouseEvent, member: MemberWithRoles) => {
    e.preventDefault();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      member,
    });
  };

  const closeContextMenu = () => {
    setContextMenu({ visible: false, x: 0, y: 0, member: null });
  };

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        contextMenuRef.current &&
        !contextMenuRef.current.contains(e.target as Node)
      ) {
        closeContextMenu();
      }
    };

    if (contextMenu.visible) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [contextMenu.visible]);

  // =====================================================
  // MODERATION ACTIONS
  // =====================================================

  /**
   * Kiểm tra xem current user có thể tác động target không
   * Dựa trên role hierarchy
   */
  const canAffectMember = (target: MemberWithRoles): boolean => {
    // Không thể tác động chính mình
    if (target.userId === currentUserId) return false;

    // Không thể tác động owner
    if (target.isOwner) return false;

    // Owner có thể tác động bất kỳ ai
    if (permissions.isOwner) return true;

    // So sánh role position
    const currentMember = members.find((m) => m.userId === currentUserId);
    if (!currentMember) return false;

    // User có position cao hơn mới có thể tác động
    return currentMember.highestRolePosition > target.highestRolePosition;
  };

  const openModerationModal = (action: ModerationAction, member: MemberWithRoles) => {
    setModerationModal({ action, member });
    setModerationReason("");
    setTimeoutDuration(TIMEOUT_DURATIONS[0].seconds);
    closeContextMenu();
  };

  const closeModerationModal = () => {
    setModerationModal({ action: null, member: null });
    setModerationReason("");
  };

  const executeModerationAction = async () => {
    if (!moderationModal.member || !moderationModal.action) return;

    setModerationLoading(true);

    try {
      const { member, action } = moderationModal;

      switch (action) {
        case "kick":
          await serversApi.kickMember(serverId, member.userId, moderationReason || undefined);
          break;
        case "ban":
          await serversApi.banMember(serverId, member.userId, moderationReason || undefined);
          break;
        case "timeout":
          await serversApi.timeoutMember(
            serverId,
            member.userId,
            timeoutDuration,
            moderationReason || undefined
          );
          break;
      }

      // Refresh danh sách sau khi thực hiện action
      await fetchMembers();
      closeModerationModal();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Không thực hiện được hành động");
    } finally {
      setModerationLoading(false);
    }
  };

  // =====================================================
  // RENDER FUNCTIONS
  // =====================================================

  const renderMemberItem = (member: MemberWithRoles) => {
    const isSelf = member.userId === currentUserId;

    return (
      <div
        key={member.userId}
        className={styles.memberItem}
        onContextMenu={(e) => handleContextMenu(e, member)}
        onClick={() => onViewProfile?.(member)}
        role="button"
        tabIndex={0}
      >
        {/* Avatar */}
        <div
          className={styles.avatar}
          style={{
            backgroundImage: member.avatarUrl ? `url(${member.avatarUrl})` : undefined,
            backgroundColor: !member.avatarUrl ? "#5865f2" : undefined,
          }}
        >
          {!member.avatarUrl && (
            <span>{(member.displayName || member.username || "?").charAt(0).toUpperCase()}</span>
          )}
          {/* Owner crown icon */}
          {member.isOwner && <span className={styles.ownerBadge}>👑</span>}
        </div>

        {/* Name - Màu theo role cao nhất */}
        <span
          className={styles.memberName}
          style={{ color: member.displayColor }}
        >
          {member.displayName || member.username}
          {isSelf && <span className={styles.selfBadge}> (bạn)</span>}
        </span>
      </div>
    );
  };

  const renderRoleGroup = (group: MemberGroup) => (
    <div key={group.roleName} className={styles.roleGroup}>
      {/* Role header */}
      <div className={styles.roleHeader}>
        <span
          className={styles.roleColorDot}
          style={{ backgroundColor: group.roleColor }}
        />
        <span className={styles.roleName}>{group.roleName}</span>
        <span className={styles.memberCount}>— {group.members.length}</span>
      </div>

      {/* Members in group */}
      <div className={styles.membersList}>
        {group.members.map(renderMemberItem)}
      </div>
    </div>
  );

  const renderContextMenu = () => {
    if (!contextMenu.visible || !contextMenu.member) return null;

    const member = contextMenu.member;
    const isSelf = member.userId === currentUserId;
    const canAffect = canAffectMember(member);

    return (
      <div
        ref={contextMenuRef}
        className={styles.contextMenu}
        style={{ left: contextMenu.x, top: contextMenu.y }}
        role="menu"
      >
        {/* Profile */}
        <button
          type="button"
          className={styles.contextMenuItem}
          onClick={() => {
            onViewProfile?.(member);
            closeContextMenu();
          }}
        >
          Hồ sơ
        </button>

        {/* Nhắn tin */}
        {!isSelf && (
          <button
            type="button"
            className={styles.contextMenuItem}
            onClick={() => {
              onNavigateToDM?.(
                member.userId,
                member.displayName || member.username,
                member.username,
                member.avatarUrl
              );
              closeContextMenu();
            }}
          >
            Nhắn tin
          </button>
        )}

        <div className={styles.contextMenuDivider} />

        {/* Role badges */}
        {member.roles.length > 0 && (
          <>
            <div className={styles.contextMenuLabel}>Vai trò</div>
            <div className={styles.roleBadges}>
              {member.roles.map((role) => (
                <span
                  key={role._id}
                  className={styles.roleBadge}
                  style={{ backgroundColor: role.color }}
                >
                  {role.name}
                </span>
              ))}
            </div>
            <div className={styles.contextMenuDivider} />
          </>
        )}

        {/* Moderation actions - chỉ hiện nếu có quyền VÀ có thể tác động */}
        {!isSelf && canAffect && (
          <>
            {/* Timeout - Yêu cầu quyền timeoutMembers */}
            {permissions.canTimeout && (
              <button
                type="button"
                className={`${styles.contextMenuItem} ${styles.contextMenuItemWarning}`}
                onClick={() => openModerationModal("timeout", member)}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                Tạm khóa {member.displayName || member.username}
              </button>
            )}

            {/* Kick - Yêu cầu quyền kickMembers */}
            {permissions.canKick && (
              <button
                type="button"
                className={`${styles.contextMenuItem} ${styles.contextMenuItemDanger}`}
                onClick={() => openModerationModal("kick", member)}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                  <line x1="18" y1="9" x2="23" y2="14" />
                  <line x1="23" y1="9" x2="18" y2="14" />
                </svg>
                Đuổi {member.displayName || member.username}
              </button>
            )}

            {/* Ban - Yêu cầu quyền banMembers */}
            {permissions.canBan && (
              <button
                type="button"
                className={`${styles.contextMenuItem} ${styles.contextMenuItemDanger}`}
                onClick={() => openModerationModal("ban", member)}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                </svg>
                Cấm {member.displayName || member.username}
              </button>
            )}
          </>
        )}
      </div>
    );
  };

  const renderModerationModal = () => {
    if (!moderationModal.action || !moderationModal.member) return null;

    const { action, member } = moderationModal;

    const titles: Record<ModerationAction & string, string> = {
      kick: `Đuổi ${member.displayName || member.username}`,
      ban: `Cấm ${member.displayName || member.username}`,
      timeout: `Tạm khóa ${member.displayName || member.username}`,
    };

    const descriptions: Record<ModerationAction & string, string> = {
      kick: "Người này sẽ bị loại khỏi server nhưng có thể tham gia lại nếu được mời.",
      ban: "Người này sẽ bị cấm vĩnh viễn và không thể tham gia lại server.",
      timeout: "Người này sẽ bị tạm khóa và không thể gửi tin nhắn trong khoảng thời gian đã chọn.",
    };

    return (
      <div className={styles.modalOverlay} onClick={closeModerationModal}>
        <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
          <h3 className={styles.modalTitle}>{titles[action]}</h3>
          <p className={styles.modalDescription}>{descriptions[action]}</p>

          {/* Timeout duration selector */}
          {action === "timeout" && (
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Thời gian tạm khóa</label>
              <select
                className={styles.formSelect}
                value={timeoutDuration}
                onChange={(e) => setTimeoutDuration(Number(e.target.value))}
              >
                {TIMEOUT_DURATIONS.map((opt) => (
                  <option key={opt.seconds} value={opt.seconds}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Reason input */}
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Lý do (không bắt buộc)</label>
            <textarea
              className={styles.formTextarea}
              value={moderationReason}
              onChange={(e) => setModerationReason(e.target.value)}
              placeholder="Nhập lý do..."
              rows={3}
            />
          </div>

          {/* Actions */}
          <div className={styles.modalActions}>
            <button
              type="button"
              className={styles.btnCancel}
              onClick={closeModerationModal}
              disabled={moderationLoading}
            >
              Hủy
            </button>
            <button
              type="button"
              className={
                action === "timeout" ? styles.btnWarning : styles.btnDanger
              }
              onClick={executeModerationAction}
              disabled={moderationLoading}
            >
              {moderationLoading ? "Đang xử lý..." : titles[action]}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // =====================================================
  // MAIN RENDER
  // =====================================================

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Đang tải...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>{error}</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <h3 className={styles.sidebarTitle}>Thành viên — {members.length}</h3>

      {/* Grouped members list */}
      <div className={styles.groupsContainer}>
        {groupedMembers.map(renderRoleGroup)}
      </div>

      {/* Context menu */}
      {renderContextMenu()}

      {/* Moderation modal */}
      {renderModerationModal()}
    </div>
  );
}
