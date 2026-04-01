"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import * as serversApi from "@/lib/servers-api";
import { blockUser, ignoreUser } from "@/lib/api";
import MemberContextMenu from "@/components/MemberContextMenu/MemberContextMenu";
import MemberProfilePopup from "@/components/MemberProfilePopup/MemberProfilePopup";
import IgnoreUserPopup from "@/components/IgnoreUserPopup/IgnoreUserPopup";
import ModeratorViewToggle from "@/components/ModeratorViewToggle/ModeratorViewToggle";
import MemberDataGrid from "@/components/MemberDataGrid/MemberDataGrid";
import MemberDetailsPanel from "@/components/MemberDetailsPanel/MemberDetailsPanel";
import { useModeratorView } from "@/hooks/use-moderator-view";
import * as memberList from "@/lib/member-list-logic";
import type { ModeratorMemberRow } from "@/lib/mod-view-api";
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
  joinedCordigramAt?: string;
  invitedBy?: { id: string; username: string };
  role?: string;
}

function normalizeMemberRow(m: unknown): ExtendedMember {
  const rec = m as Record<string, unknown>;
  const isOwner = Boolean(rec.isOwner);
  return {
    ...(m as unknown as ExtendedMember),
    serverMemberRole: (rec.serverMemberRole as ExtendedMember["serverMemberRole"]) ?? (isOwner ? "owner" : "member"),
    accountCreatedAt: (rec.accountCreatedAt as string) ?? String(rec.joinedAt ?? ""),
    accountAgeDays: typeof rec.accountAgeDays === "number" ? rec.accountAgeDays : 0,
    messagesLast10Min: typeof rec.messagesLast10Min === "number" ? rec.messagesLast10Min : 0,
    messagesLast30d: typeof rec.messagesLast30d === "number" ? rec.messagesLast30d : 0,
    lastMessageAt: (rec.lastMessageAt as string | null) ?? null,
    isOnline: Boolean(rec.isOnline),
    joinMethod: (rec.joinMethod as serversApi.MemberWithRoles["joinMethod"]) ?? "link",
    invitedBy: rec.invitedBy as ExtendedMember["invitedBy"],
  } as ExtendedMember;
}

function toModeratorGridRow(m: ExtendedMember): ModeratorMemberRow {
  const flags: ModeratorMemberRow["flags"] = [];
  if (m.accountAgeDays < 7) flags.push("new-account");
  if (m.messagesLast10Min > 50) flags.push("spam");
  return {
    userId: m.userId,
    displayName: m.displayName,
    username: m.username,
    avatarUrl: m.avatarUrl ?? "",
    joinedAt: m.joinedAt,
    accountCreatedAt: m.accountCreatedAt,
    accountAgeDays: m.accountAgeDays,
    joinMethod: m.joinMethod ?? "link",
    invitedBy: m.invitedBy,
    roles: m.roles,
    flags,
  };
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
  const [sortBy, setSortBy] = useState<memberList.SortKey>("joinedAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [listFilters, setListFilters] = useState<memberList.MemberListFilters>({
    serverRole: "all",
    newAccountOnly: false,
    spamOnly: false,
  });
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

  // Moderator View state
  const canEnableModView = permissions.isOwner || permissions.canKick;
  const moderatorView = useModeratorView({
    serverId,
    canEnable: canEnableModView,
  });

  // Fetch members với role info
  const fetchMembers = useCallback(async () => {
    if (!serverId) return;

    setLoading(true);
    setError(null);

    try {
      // Sử dụng API mới trả về role info
      console.log("[ServerMembersSection] Calling NEW API: getServerMembersWithRoles");
      const response = await serversApi.getServerMembersWithRoles(serverId);
      // DEBUG: Log để kiểm tra displayColor
      console.log("[ServerMembersSection] ✅ NEW API Response:", {
        members: response.members.map(m => ({
          displayName: m.displayName,
          roles: m.roles,
          displayColor: m.displayColor,
        })),
        permissions: response.currentUserPermissions,
      });
      setMembers(response.members.map((m) => normalizeMemberRow(m)));
      setPermissions(response.currentUserPermissions);
    } catch (err) {
      // Fallback to old API nếu API mới fail
      console.error("[ServerMembersSection] ❌ NEW API FAILED:", err);
      console.log("[ServerMembersSection] Falling back to OLD API");
      try {
        const oldList = await serversApi.getServerMembers(serverId);
        console.log("[ServerMembersSection] OLD API Response:", oldList);
        // Convert sang ExtendedMember format
        const converted: ExtendedMember[] = oldList.map((m) =>
          normalizeMemberRow({
            userId: m.userId,
            displayName: m.displayName,
            username: m.username,
            avatarUrl: m.avatarUrl,
            joinedAt: m.joinedAt,
            joinedCordigramAt: m.joinedCordigramAt,
            joinMethod: m.joinMethod ?? "link",
            invitedBy: m.invitedBy,
            isOwner: m.role === "owner",
            serverMemberRole: m.role === "owner" ? "owner" : m.role === "moderator" ? "moderator" : "member",
            roles: [],
            highestRolePosition: 0,
            displayColor: "#99AAB5",
            role: m.role,
            accountCreatedAt: m.joinedCordigramAt ?? m.joinedAt,
            accountAgeDays: 0,
            messagesLast10Min: 0,
            messagesLast30d: 0,
            lastMessageAt: null,
            isOnline: false,
          }),
        );
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

  const processedMembers = useMemo(() => {
    let list = memberList.filterMembersBySearch(members, search);
    list = memberList.filterMembersByAdvanced(list, listFilters);
    list = memberList.applyChannelListSidebar(list, showInChannelList);
    return memberList.sortMembers(list, sortBy, sortOrder);
  }, [members, search, listFilters, showInChannelList, sortBy, sortOrder]);

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
    if (selectedIds.size === processedMembers.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(processedMembers.map((r) => r.userId)));
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
        Khi bật, chỉ hiển thị tối đa 50 thành viên: đang trực tuyến, tài khoản mới (&lt; 7 ngày), gia nhập gần đây hoặc có hoạt động tin nhắn trong 7 ngày — phù hợp hiển thị trong danh sách kênh.
      </p>

      <h3 className={styles.sectionTitle}>Kết quả tìm kiếm</h3>
      <div className={styles.toolbar}>
        <input
          type="text"
          className={styles.search}
          placeholder="Tìm theo username hoặc user ID (lọc ngay)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className={styles.toolbarRight}>
          <button
            type="button"
            className={styles.sortButton}
            onClick={() => setSortMenuOpen((open) => !open)}
          >
            <span className={styles.sortButtonIcon} />
            <span>Sắp xếp</span>
          </button>
          {sortMenuOpen && (
            <div className={styles.sortMenu} role="menu">
              <button
                type="button"
                className={`${styles.sortMenuItem} ${
                  sortBy === "joinedAt" && sortOrder === "desc" ? styles.sortMenuItemActive : ""
                }`}
                onClick={() => {
                  setSortBy("joinedAt");
                  setSortOrder("desc");
                  setSortMenuOpen(false);
                }}
              >
                <span>Gia nhập từ (mới nhất trước)</span>
                <span
                  className={`${styles.sortMenuDot} ${
                    sortBy === "joinedAt" && sortOrder === "desc" ? styles.sortMenuDotActive : ""
                  }`}
                />
              </button>
              <button
                type="button"
                className={`${styles.sortMenuItem} ${
                  sortBy === "joinedAt" && sortOrder === "asc" ? styles.sortMenuItemActive : ""
                }`}
                onClick={() => {
                  setSortBy("joinedAt");
                  setSortOrder("asc");
                  setSortMenuOpen(false);
                }}
              >
                <span>Gia nhập từ (lâu nhất trước)</span>
                <span
                  className={`${styles.sortMenuDot} ${
                    sortBy === "joinedAt" && sortOrder === "asc" ? styles.sortMenuDotActive : ""
                  }`}
                />
              </button>
              <button
                type="button"
                className={`${styles.sortMenuItem} ${
                  sortBy === "username" && sortOrder === "asc" ? styles.sortMenuItemActive : ""
                }`}
                onClick={() => {
                  setSortBy("username");
                  setSortOrder("asc");
                  setSortMenuOpen(false);
                }}
              >
                <span>Username (A → Z)</span>
                <span
                  className={`${styles.sortMenuDot} ${
                    sortBy === "username" && sortOrder === "asc" ? styles.sortMenuDotActive : ""
                  }`}
                />
              </button>
              <button
                type="button"
                className={`${styles.sortMenuItem} ${
                  sortBy === "activity" && sortOrder === "desc" ? styles.sortMenuItemActive : ""
                }`}
                onClick={() => {
                  setSortBy("activity");
                  setSortOrder("desc");
                  setSortMenuOpen(false);
                }}
              >
                <span>Hoạt động (nhiều → ít)</span>
                <span
                  className={`${styles.sortMenuDot} ${
                    sortBy === "activity" && sortOrder === "desc"
                      ? styles.sortMenuDotActive
                      : ""
                  }`}
                />
              </button>
              <div className={styles.sortMenuDivider} />
              <div className={styles.sortMenuLabel}>Lọc</div>
              <button
                type="button"
                className={`${styles.sortMenuItem} ${
                  listFilters.newAccountOnly ? styles.sortMenuItemActive : ""
                }`}
                onClick={() =>
                  setListFilters((f) => ({ ...f, newAccountOnly: !f.newAccountOnly }))
                }
              >
                <span>Tài khoản mới (&lt; 7 ngày)</span>
                <span
                  className={`${styles.sortMenuDot} ${
                    listFilters.newAccountOnly ? styles.sortMenuDotActive : ""
                  }`}
                />
              </button>
              <button
                type="button"
                className={`${styles.sortMenuItem} ${
                  listFilters.spamOnly ? styles.sortMenuItemActive : ""
                }`}
                onClick={() => setListFilters((f) => ({ ...f, spamOnly: !f.spamOnly }))}
              >
                <span>Spam (&gt; 50 tin / 10 phút)</span>
                <span
                  className={`${styles.sortMenuDot} ${
                    listFilters.spamOnly ? styles.sortMenuDotActive : ""
                  }`}
                />
              </button>
              <div className={styles.sortMenuDivider} />
              <div className={styles.sortMenuLabel}>Vai trò</div>
              <div className={styles.sortMenuItem}>
                <select
                  className={styles.sortSelect}
                  value={listFilters.serverRole}
                  onChange={(e) =>
                    setListFilters((f) => ({
                      ...f,
                      serverRole: e.target.value as memberList.MemberListFilters["serverRole"],
                    }))
                  }
                  title="Lọc vai trò"
                >
                  <option value="all">Mọi vai trò</option>
                  <option value="owner">Chủ</option>
                  <option value="moderator">Điều hành</option>
                  <option value="member">Thành viên</option>
                </select>
              </div>
            </div>
          )}
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
      </div>

      {error && <p className={styles.error}>{error}</p>}
      {loading && <p className={styles.loading}>Đang tải...</p>}

      {!loading && !error && !moderatorView.enabled && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.thCheck}>
                  <input
                    type="checkbox"
                    checked={processedMembers.length > 0 && selectedIds.size === processedMembers.length}
                    onChange={toggleSelectAll}
                    aria-label="Chọn tất cả"
                  />
                </th>
                <th className={styles.thName}>TÊN</th>
              </tr>
            </thead>
            <tbody>
              {processedMembers.map((row) => (
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
                      <span
                        className={styles.displayName}
                        style={{ color: row.displayColor || "#fff" }}
                      >
                        {row.displayName || row.username}
                        {row.isOwner && <span className={styles.ownerCrown}> 👑</span>}
                      </span>
                      <span className={styles.username}>{row.username}</span>
                    </div>
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
            Đang hiển thị {processedMembers.length} thành viên
            {showInChannelList ? " (tối đa 50 khi bật hiển thị trong kênh)" : ""}
          </p>
        </div>
      )}

      {!loading && !error && moderatorView.enabled && (
        <div className={styles.modViewLayout}>
          <div className={styles.modViewGrid}>
            <MemberDataGrid
              rows={processedMembers.map(toModeratorGridRow)}
              loading={false}
              onRowClick={(r) => moderatorView.loadDetail(r.userId)}
            />
          </div>
          {(moderatorView.detail || moderatorView.detailLoading) && (
            <div className={styles.modViewPanel}>
              <MemberDetailsPanel
                detail={moderatorView.detail}
                loading={moderatorView.detailLoading}
                error={moderatorView.detailError}
                onClose={() => moderatorView.loadDetail("")}
              />
            </div>
          )}
        </div>
      )}

      <div className={styles.modViewToggleWrap}>
        <ModeratorViewToggle
          enabled={moderatorView.enabled}
          canEnable={moderatorView.canEnable}
          onChange={(next) => moderatorView.setEnabled(next)}
        />
      </div>

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
