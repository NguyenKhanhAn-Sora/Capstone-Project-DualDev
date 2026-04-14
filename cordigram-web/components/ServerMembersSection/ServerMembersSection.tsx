"use client";

import React, { useState, useEffect, useCallback } from "react";
import * as serversApi from "@/lib/servers-api";
import { blockUser, ignoreUser } from "@/lib/api";
import MemberContextMenu from "@/components/MemberContextMenu/MemberContextMenu";
import MemberProfilePopup from "@/components/MemberProfilePopup/MemberProfilePopup";
import IgnoreUserPopup from "@/components/IgnoreUserPopup/IgnoreUserPopup";
import styles from "./ServerMembersSection.module.css";

/** Hiển thị "X ngày trước" hoặc "X năm" nếu >= 365 ngày */
function formatDaysOrYears(date: Date | string): string {
  const days = Math.floor(
    (Date.now() - new Date(date).getTime()) / 86400000,
  );
  if (days >= 365) return `${Math.floor(days / 365)} năm`;
  if (days <= 0) return "Hôm nay";
  return `${days} ngày trước`;
}

// Extended member type với thông tin role
interface ExtendedMember extends serversApi.MemberWithRoles {
  // Thêm các trường từ ServerMemberRow để tương thích ngược
  joinedCordigramAt?: string;
  joinMethod?: "owner" | "invited" | "link";
  invitedBy?: { id: string; username: string };
  role?: string; // Tương thích ngược
}

function joinMethodLabel(row: ExtendedMember): string {
  if (row.joinMethod === "owner" || row.isOwner) return "Chủ máy chủ";
  if (row.joinMethod === "invited" && row.invitedBy) {
    return `Mời bởi ${row.invitedBy.username}`;
  }
  return "Tham gia bằng URL";
}

// Timeout duration options
const TIMEOUT_DURATIONS = [
  { label: "60 giây", seconds: 60 },
  { label: "5 phút", seconds: 5 * 60 },
  { label: "10 phút", seconds: 10 * 60 },
  { label: "1 giờ", seconds: 60 * 60 },
  { label: "1 ngày", seconds: 24 * 60 * 60 },
  { label: "1 tuần", seconds: 7 * 24 * 60 * 60 },
];

export interface ServerMembersSectionProps {
  serverId: string;
  isOwner: boolean;
  currentUserId: string;
  token: string | null;
  /** Gọi khi user chọn "Nhắn tin" → đóng panel và mở DM với thành viên đó */
  onNavigateToDM?: (userId: string, displayName: string, username: string, avatarUrl?: string) => void;
  /** Gọi sau khi chuyển quyền sở hữu thành công (để parent đóng panel / refresh) */
  onOwnershipTransferred?: () => void;
}

export default function ServerMembersSection({
  serverId,
  isOwner,
  currentUserId,
  token,
  onNavigateToDM,
  onOwnershipTransferred,
}: ServerMembersSectionProps) {
  const [members, setMembers] = useState<ExtendedMember[]>([]);
  // Quyền của user hiện tại
  const [permissions, setPermissions] = useState<{
    canKick: boolean;
    canBan: boolean;
    canTimeout: boolean;
    isOwner: boolean;
  }>({ canKick: false, canBan: false, canTimeout: false, isOwner: false });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "joinedAt" | "role">("joinedAt");
  const [showInChannelList, setShowInChannelList] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [filterDays, setFilterDays] = useState<7 | 30 | null>(null);
  const [filterRole, setFilterRole] = useState<serversApi.PruneRoleFilter>("all");
  const [pruneCount, setPruneCount] = useState<number | null>(null);
  const [pruneLoading, setPruneLoading] = useState(false);
  const [pruneError, setPruneError] = useState<string | null>(null);
  const [memberMenu, setMemberMenu] = useState<{ row: ExtendedMember; x: number; y: number } | null>(null);
  const [profileMember, setProfileMember] = useState<ExtendedMember | null>(null);
  const [ignoreMember, setIgnoreMember] = useState<ExtendedMember | null>(null);
  const [transferConfirmMember, setTransferConfirmMember] = useState<ExtendedMember | null>(null);
  const [transferring, setTransferring] = useState(false);

  // Moderation modal state
  const [moderationModal, setModerationModal] = useState<{
    action: "kick" | "ban" | "timeout" | null;
    member: ExtendedMember | null;
  }>({ action: null, member: null });
  const [moderationReason, setModerationReason] = useState("");
  const [timeoutDuration, setTimeoutDuration] = useState(TIMEOUT_DURATIONS[0].seconds);
  const [moderationLoading, setModerationLoading] = useState(false);

  // Fetch members với role info
  const fetchMembers = useCallback(async () => {
    if (!serverId) return;

    setLoading(true);
    setError(null);

    try {
      // Sử dụng API mới trả về role info
      const response = await serversApi.getServerMembersWithRoles(serverId);
      // DEBUG: Log để kiểm tra displayColor
      setMembers(response.members as ExtendedMember[]);
      setPermissions(response.currentUserPermissions);
    } catch (err) {
      // Fallback to old API nếu API mới fail
      console.error("[ServerMembersSection] ❌ NEW API FAILED:", err);
      try {
        const oldList = await serversApi.getServerMembers(serverId);
        // Convert sang ExtendedMember format
        const converted: ExtendedMember[] = oldList.map((m) => ({
          userId: m.userId,
          displayName: m.displayName,
          username: m.username,
          avatarUrl: m.avatarUrl,
          joinedAt: m.joinedAt,
          joinedCordigramAt: m.joinedCordigramAt,
          joinMethod: m.joinMethod,
          invitedBy: m.invitedBy,
          isOwner: m.role === "owner",
          roles: [],
          highestRolePosition: 0,
          displayColor: "#99AAB5",
          role: m.role,
        }));
        setMembers(converted);
        setPermissions({ canKick: isOwner, canBan: isOwner, canTimeout: isOwner, isOwner });
      } catch (fallbackErr) {
        setError(fallbackErr instanceof Error ? fallbackErr.message : "Không tải được danh sách");
      }
    } finally {
      setLoading(false);
    }
  }, [serverId, isOwner]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  // Preview prune count when filter conditions change.
  useEffect(() => {
    if (!filterModalOpen) return;
    if (!filterDays) {
      setPruneCount(null);
      setPruneError(null);
      return;
    }
    let cancelled = false;
    setPruneLoading(true);
    setPruneError(null);
    serversApi
      .getPruneCount({ serverId, days: filterDays, role: filterRole })
      .then((count) => {
        if (!cancelled) setPruneCount(count);
      })
      .catch((err) => {
        if (!cancelled) {
          setPruneCount(null);
          setPruneError(err instanceof Error ? err.message : "Không tính được");
        }
      })
      .finally(() => {
        if (!cancelled) setPruneLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filterModalOpen, filterDays, filterRole, serverId]);

  const filtered = members.filter((m) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      m.displayName.toLowerCase().includes(q) ||
      m.username.toLowerCase().includes(q) ||
      m.userId.toLowerCase().includes(q)
    );
  });

  const sorted = [...filtered].sort((a, b) => {
    switch (sortBy) {
      case "name":
        return (a.displayName || a.username).localeCompare(b.displayName || b.username);
      case "joinedAt":
        return new Date(b.joinedAt).getTime() - new Date(a.joinedAt).getTime();
      case "role":
        // Sắp xếp theo position role cao nhất
        return b.highestRolePosition - a.highestRolePosition;
      default:
        return 0;
    }
  });

  /**
   * Kiểm tra current user có thể tác động target không
   * Dựa trên role hierarchy
   */
  const canAffectMember = (target: ExtendedMember): boolean => {
    // Không thể tác động chính mình
    if (target.userId === currentUserId) return false;

    // Không thể tác động owner
    if (target.isOwner) return false;

    // Owner có thể tác động bất kỳ ai
    if (permissions.isOwner) return true;

    // Tìm current member để so sánh position
    const currentMember = members.find((m) => m.userId === currentUserId);
    if (!currentMember) return false;

    // User có position cao hơn mới có thể tác động
    return currentMember.highestRolePosition > target.highestRolePosition;
  };

  // Moderation actions
  const openModerationModal = (action: "kick" | "ban" | "timeout", member: ExtendedMember) => {
    setModerationModal({ action, member });
    setModerationReason("");
    setTimeoutDuration(TIMEOUT_DURATIONS[0].seconds);
    setMemberMenu(null);
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

  const toggleSelectAll = () => {
    if (selectedIds.size === sorted.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sorted.map((r) => r.userId)));
    }
  };
  const toggleSelect = (userId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  // Render role badges
  const renderRoleBadges = (member: ExtendedMember) => {
    if (member.roles && member.roles.length > 0) {
      return (
        <div className={styles.roleBadges}>
          {member.roles.map((role) => (
            <span
              key={role._id}
              className={styles.roleBadge}
              style={{ backgroundColor: role.color }}
              title={role.name}
            >
              {role.name}
            </span>
          ))}
        </div>
      );
    }
    // Fallback for old data
    if (member.isOwner) return <span className={styles.ownerBadge}>Chủ</span>;
    if (member.role === "moderator") return <span className={styles.modBadge}>Mod</span>;
    return <span className={styles.memberBadge}>Thành viên</span>;
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.toggleRow}>
        <span className={styles.toggleLabel}>Hiện thành viên trong danh sách kênh</span>
        <button
          type="button"
          role="switch"
          aria-checked={showInChannelList}
          className={styles.toggle}
          onClick={() => setShowInChannelList((v) => !v)}
        >
          <span className={styles.toggleTrack}>
            <span className={styles.toggleThumb} data-on={showInChannelList} />
          </span>
        </button>
      </div>
      <p className={styles.desc}>
        Tùy chọn này sẽ hiển thị trang thành viên trong danh sách kênh, cho phép bạn nhanh chóng xem những người vừa mới tham gia vào máy chủ và tìm kiếm những người dùng bị gắn cờ vì hoạt động bất thường.
      </p>

      <h3 className={styles.sectionTitle}>Kết quả tìm kiếm</h3>
      <div className={styles.toolbar}>
        <input
          type="text"
          className={styles.search}
          placeholder="Tìm theo tên người dùng hoặc id"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className={styles.sortSelect}
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          title="Sắp xếp"
        >
          <option value="joinedAt">Gia nhập server</option>
          <option value="name">Tên</option>
          <option value="role">Vai trò</option>
        </select>
        {isOwner && (
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={() => setFilterModalOpen(true)}
          >
            Lược bỏ
          </button>
        )}
      </div>

      {error && <p className={styles.error}>{error}</p>}
      {loading && <p className={styles.loading}>Đang tải...</p>}

      {!loading && !error && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.thCheck}>
                  <input
                    type="checkbox"
                    checked={sorted.length > 0 && selectedIds.size === sorted.length}
                    onChange={toggleSelectAll}
                    aria-label="Chọn tất cả"
                  />
                </th>
                <th className={styles.thName}>TÊN</th>
                <th className={styles.th}>GIA NHẬP TỪ</th>
                <th className={styles.th}>VAI TRÒ</th>
                <th className={styles.thSignal}>TÍN HIỆU</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => (
                <tr key={row.userId} className={styles.row}>
                  <td className={styles.tdCheck}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(row.userId)}
                      onChange={() => toggleSelect(row.userId)}
                      aria-label={`Chọn ${row.displayName || row.username}`}
                    />
                  </td>
                  <td className={styles.tdName}>
                    <div
                      className={styles.avatar}
                      style={{
                        backgroundImage: row.avatarUrl ? `url(${row.avatarUrl})` : undefined,
                        backgroundColor: !row.avatarUrl ? "#5865f2" : undefined,
                      }}
                    >
                      {!row.avatarUrl && (
                        <span>{(row.displayName || row.username || "?").charAt(0).toUpperCase()}</span>
                      )}
                    </div>
                    <div className={styles.nameBlock}>
                      {/* Tên hiển thị màu theo role cao nhất */}
                      <span 
                        className={styles.displayName}
                        style={{ color: row.displayColor || "#fff" }}
                      >
                        {row.displayName || row.username}
                        {row.isOwner && <span className={styles.ownerCrown}> 👑</span>}
                      </span>
                      <span className={styles.username}>{row.username}</span>
                    </div>
                  </td>
                  <td className={styles.td}>{formatDaysOrYears(row.joinedAt)}</td>
                  <td className={styles.td}>{renderRoleBadges(row)}</td>
                  <td className={styles.tdSignal}>
                    <button
                      type="button"
                      className={styles.iconBtn}
                      title="Hồ sơ"
                      aria-label="Hồ sơ"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setProfileMember(row);
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className={styles.iconBtn}
                      title="Tùy chọn"
                      aria-label="Tùy chọn"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        setMemberMenu({ row, x: rect.left, y: rect.bottom + 4 });
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <circle cx="12" cy="6" r="1.5" />
                        <circle cx="12" cy="12" r="1.5" />
                        <circle cx="12" cy="18" r="1.5" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className={styles.resultCount}>
            Đang hiển thị {sorted.length} thành viên
          </p>
        </div>
      )}

      {filterModalOpen && (
        <div className={styles.filterOverlay} role="dialog" aria-modal>
          <div className={styles.filterModal}>
            <div className={styles.filterHeader}>
              <h3 className={styles.filterTitle}>Lọc thành viên — Máy chủ</h3>
              <button
                type="button"
                className={styles.filterClose}
                onClick={() => setFilterModalOpen(false)}
                aria-label="Đóng"
              >
                ×
              </button>
            </div>

            <div className={styles.filterBody}>
              <div className={styles.filterGroup}>
                <div className={styles.filterLabel}>Lần cuối nhìn thấy</div>
                <label className={styles.radioRow}>
                  <input
                    type="radio"
                    name="days"
                    checked={filterDays === 7}
                    onChange={() => setFilterDays(7)}
                  />
                  <span>hơn 7 ngày trước</span>
                </label>
                <label className={styles.radioRow}>
                  <input
                    type="radio"
                    name="days"
                    checked={filterDays === 30}
                    onChange={() => setFilterDays(30)}
                  />
                  <span>hơn 30 ngày trước</span>
                </label>
              </div>

              <div className={styles.filterGroup}>
                <div className={styles.filterLabel}>
                  Đồng thời bao gồm thành viên giữ vai trò
                </div>
                <select
                  className={styles.filterSelect}
                  value={filterRole}
                  onChange={(e) => setFilterRole(e.target.value as typeof filterRole)}
                >
                  <option value="all">Tất cả vai trò</option>
                  <option value="none">Không có vai trò (thành viên)</option>
                  <option value="member">Thành viên</option>
                  <option value="moderator">Mod (quản lý server)</option>
                </select>
              </div>

              <p className={styles.filterHint}>
                Việc thanh lọc sẽ loại bỏ thành viên ít hoạt động trong khoảng thời gian đã chọn. Họ có thể vào lại máy chủ nếu được mời lại.
              </p>

              <div className={styles.filterHint} style={{ marginTop: -4 }}>
                {pruneError ? (
                  <span style={{ color: "#f23f43" }}>{pruneError}</span>
                ) : pruneCount == null ? (
                  <span>
                    Chọn điều kiện để xem trước số lượng thành viên sẽ bị lược bỏ.
                  </span>
                ) : (
                  <span>
                    Sẽ lược bỏ <b>{pruneCount}</b> thành viên.
                  </span>
                )}
              </div>
            </div>

            <div className={styles.filterFooter}>
              <button
                type="button"
                className={styles.filterCancel}
                onClick={() => setFilterModalOpen(false)}
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                className={styles.filterApply}
                disabled={!filterDays || pruneLoading || !pruneCount}
                onClick={async () => {
                  if (!filterDays) return;
                  setPruneError(null);
                  setPruneLoading(true);
                  try {
                    const count =
                      pruneCount ??
                      (await serversApi.getPruneCount({
                        serverId,
                        days: filterDays,
                        role: filterRole,
                      }));
                    if (count <= 0) {
                      setPruneCount(0);
                      return;
                    }
                    const ok = window.confirm(
                      `Bạn chắc chắn muốn lược bỏ ${count} thành viên không hoạt động hơn ${filterDays} ngày?`,
                    );
                    if (!ok) return;
                    const removed = await serversApi.pruneMembers({
                      serverId,
                      days: filterDays,
                      role: filterRole,
                    });
                    // Refresh members list after prune
                    await fetchMembers();
                    setFilterModalOpen(false);
                    setPruneCount(null);
                    alert(`Đã lược bỏ ${removed} thành viên.`);
                  } catch (err) {
                    setPruneError(
                      err instanceof Error ? err.message : "Không lược bỏ được",
                    );
                  } finally {
                    setPruneLoading(false);
                  }
                }}
              >
                {pruneLoading ? "Đang lược bỏ..." : "Lược bỏ"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Context Menu - truyền đầy đủ moderation actions */}
      {memberMenu && (
        <MemberContextMenu
          x={memberMenu.x}
          y={memberMenu.y}
          member={{
            userId: memberMenu.row.userId,
            displayName: memberMenu.row.displayName,
            username: memberMenu.row.username,
            avatarUrl: memberMenu.row.avatarUrl,
            joinedAt: memberMenu.row.joinedAt,
            joinedCordigramAt: memberMenu.row.joinedCordigramAt || memberMenu.row.joinedAt,
            joinMethod: memberMenu.row.joinMethod || (memberMenu.row.isOwner ? "owner" : "link"),
            invitedBy: memberMenu.row.invitedBy,
            role: memberMenu.row.isOwner ? "owner" : (memberMenu.row.role || "member"),
          }}
          isServerOwner={permissions.isOwner}
          // Truyền permissions để context menu biết có hiện moderation options không
          canKick={permissions.canKick && canAffectMember(memberMenu.row)}
          canBan={permissions.canBan && canAffectMember(memberMenu.row)}
          canTimeout={permissions.canTimeout && canAffectMember(memberMenu.row)}
          onClose={() => setMemberMenu(null)}
          onProfile={() => {
            setProfileMember(memberMenu.row);
            setMemberMenu(null);
          }}
          onMessage={() => {
            if (onNavigateToDM) {
              onNavigateToDM(
                memberMenu.row.userId,
                memberMenu.row.displayName || memberMenu.row.username,
                memberMenu.row.username,
                memberMenu.row.avatarUrl,
              );
            }
            setMemberMenu(null);
          }}
          onNickname={() => {
            const name = memberMenu.row.displayName || memberMenu.row.username;
            alert(`Đổi biệt danh cho ${name} - tính năng sẽ được bổ sung.`);
            setMemberMenu(null);
          }}
          onIgnore={() => {
            setIgnoreMember(memberMenu.row);
            setMemberMenu(null);
          }}
          onBlock={async () => {
            if (!token) return;
            try {
              await blockUser({ token, userId: memberMenu.row.userId });
              setMembers((prev) => prev.filter((m) => m.userId !== memberMenu.row.userId));
            } catch (err) {
              console.error(err);
            }
            setMemberMenu(null);
          }}
          // Moderation actions - chỉ truyền nếu có quyền và có thể tác động
          onKick={
            permissions.canKick && canAffectMember(memberMenu.row)
              ? () => openModerationModal("kick", memberMenu.row)
              : undefined
          }
          onBan={
            permissions.canBan && canAffectMember(memberMenu.row)
              ? () => openModerationModal("ban", memberMenu.row)
              : undefined
          }
          onTimeout={
            permissions.canTimeout && canAffectMember(memberMenu.row)
              ? () => openModerationModal("timeout", memberMenu.row)
              : undefined
          }
          onTransferOwnership={
            permissions.isOwner && !memberMenu.row.isOwner && memberMenu.row.userId !== currentUserId
              ? () => {
                  setTransferConfirmMember(memberMenu.row);
                  setMemberMenu(null);
                }
              : undefined
          }
        />
      )}

      {/* Moderation Modal */}
      {moderationModal.action && moderationModal.member && (
        <div className={styles.filterOverlay} role="dialog" aria-modal onClick={closeModerationModal}>
          <div className={styles.filterModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.filterHeader}>
              <h3 className={styles.filterTitle}>
                {moderationModal.action === "kick" && `Đuổi ${moderationModal.member.displayName || moderationModal.member.username}`}
                {moderationModal.action === "ban" && `Cấm ${moderationModal.member.displayName || moderationModal.member.username}`}
                {moderationModal.action === "timeout" && `Tạm khóa ${moderationModal.member.displayName || moderationModal.member.username}`}
              </h3>
              <button
                type="button"
                className={styles.filterClose}
                onClick={closeModerationModal}
                aria-label="Đóng"
              >
                ×
              </button>
            </div>
            <div className={styles.filterBody}>
              <p className={styles.moderationDesc}>
                {moderationModal.action === "kick" && "Người này sẽ bị loại khỏi server nhưng có thể tham gia lại nếu được mời."}
                {moderationModal.action === "ban" && "Người này sẽ bị cấm vĩnh viễn và không thể tham gia lại server."}
                {moderationModal.action === "timeout" && "Người này sẽ bị tạm khóa và không thể gửi tin nhắn trong khoảng thời gian đã chọn."}
              </p>

              {/* Timeout duration selector */}
              {moderationModal.action === "timeout" && (
                <div className={styles.filterGroup}>
                  <div className={styles.filterLabel}>Thời gian tạm khóa</div>
                  <select
                    className={styles.filterSelect}
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
              <div className={styles.filterGroup}>
                <div className={styles.filterLabel}>Lý do (không bắt buộc)</div>
                <textarea
                  className={styles.reasonInput}
                  value={moderationReason}
                  onChange={(e) => setModerationReason(e.target.value)}
                  placeholder="Nhập lý do..."
                  rows={3}
                />
              </div>
            </div>
            <div className={styles.filterFooter}>
              <button
                type="button"
                className={styles.filterCancel}
                onClick={closeModerationModal}
                disabled={moderationLoading}
              >
                Hủy
              </button>
              <button
                type="button"
                className={moderationModal.action === "timeout" ? styles.filterApply : styles.transferConfirmBtn}
                onClick={executeModerationAction}
                disabled={moderationLoading}
              >
                {moderationLoading ? "Đang xử lý..." : (
                  moderationModal.action === "kick" ? "Đuổi" :
                  moderationModal.action === "ban" ? "Cấm" : "Tạm khóa"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {transferConfirmMember && (
        <div
          className={styles.filterOverlay}
          role="dialog"
          aria-modal
          aria-labelledby="transfer-title"
          onClick={() => !transferring && setTransferConfirmMember(null)}
        >
          <div className={styles.filterModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.filterHeader}>
              <h3 id="transfer-title" className={styles.filterTitle}>
                Chuyển quyền sở hữu
              </h3>
              <button
                type="button"
                className={styles.filterClose}
                onClick={() => setTransferConfirmMember(null)}
                aria-label="Đóng"
              >
                ×
              </button>
            </div>
            <div className={styles.filterBody}>
              <p className={styles.transferText}>
                Chuyển quyền sở hữu máy chủ cho <strong>{transferConfirmMember.displayName || transferConfirmMember.username}</strong>? Người này sẽ trở thành chủ máy chủ, bạn sẽ trở thành thành viên.
              </p>
            </div>
            <div className={styles.filterFooter}>
              <button
                type="button"
                className={styles.filterCancel}
                onClick={() => setTransferConfirmMember(null)}
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                className={styles.transferConfirmBtn}
                disabled={transferring}
                onClick={async () => {
                  if (!serverId || !transferConfirmMember) return;
                  setTransferring(true);
                  try {
                    await serversApi.transferServerOwnership(serverId, transferConfirmMember.userId);
                    setTransferConfirmMember(null);
                    onOwnershipTransferred?.();
                  } catch (err) {
                    console.error(err);
                    alert(err instanceof Error ? err.message : "Không chuyển được quyền sở hữu");
                  } finally {
                    setTransferring(false);
                  }
                }}
              >
                {transferring ? "Đang xử lý..." : "Chuyển quyền"}
              </button>
            </div>
          </div>
        </div>
      )}

      {profileMember && (
        <MemberProfilePopup
          member={profileMember}
          currentUserId={currentUserId}
          token={token}
          serverJoinDate={profileMember.joinedAt}
          onClose={() => setProfileMember(null)}
          onMessage={() => {
            if (onNavigateToDM) {
              onNavigateToDM(
                profileMember.userId,
                profileMember.displayName || profileMember.username,
                profileMember.username,
                profileMember.avatarUrl,
              );
            }
            setProfileMember(null);
          }}
        />
      )}

      {ignoreMember && (
        <IgnoreUserPopup
          displayName={ignoreMember.displayName || ignoreMember.username}
          userId={ignoreMember.userId}
          token={token ?? undefined}
          onClose={() => setIgnoreMember(null)}
          onConfirm={async () => {
            if (!token || !ignoreMember) return;
            try {
              await ignoreUser({ token, userId: ignoreMember.userId });
            } catch (err) {
              console.error("Ignore user failed", err);
            }
            setIgnoreMember(null);
          }}
          onBlock={async () => {
            if (!token) return;
            try {
              await blockUser({ token, userId: ignoreMember.userId });
              setMembers((prev) => prev.filter((m) => m.userId !== ignoreMember.userId));
            } catch (err) {
              console.error(err);
            }
            setIgnoreMember(null);
          }}
          onRestore={() => setIgnoreMember(null)}
        />
      )}
    </div>
  );
}
