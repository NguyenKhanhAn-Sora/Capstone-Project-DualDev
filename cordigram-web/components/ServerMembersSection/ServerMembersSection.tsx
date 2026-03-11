"use client";

import React, { useState, useEffect } from "react";
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

function joinMethodLabel(
  row: serversApi.ServerMemberRow,
): string {
  if (row.joinMethod === "owner") return "Chủ máy chủ";
  if (row.joinMethod === "invited" && row.invitedBy) {
    return `Mời bởi ${row.invitedBy.username}`;
  }
  return "Tham gia bằng URL";
}

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
  const [members, setMembers] = useState<serversApi.ServerMemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "joinedAt" | "joinedCordigramAt" | "joinMethod">("joinedAt");
  const [showInChannelList, setShowInChannelList] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [filterDays, setFilterDays] = useState<7 | 30 | null>(null);
  const [filterRole, setFilterRole] = useState<"all" | "mod" | "admin">("all");
  const [memberMenu, setMemberMenu] = useState<{ row: serversApi.ServerMemberRow; x: number; y: number } | null>(null);
  const [profileMember, setProfileMember] = useState<serversApi.ServerMemberRow | null>(null);
  const [ignoreMember, setIgnoreMember] = useState<serversApi.ServerMemberRow | null>(null);
  const [transferConfirmMember, setTransferConfirmMember] = useState<serversApi.ServerMemberRow | null>(null);
  const [transferring, setTransferring] = useState(false);

  useEffect(() => {
    if (!serverId || !isOwner) {
      setMembers([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    serversApi
      .getServerMembers(serverId)
      .then((list) => {
        if (!cancelled) setMembers(list);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Không tải được danh sách");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [serverId, isOwner]);

  const filtered = members.filter((m) => {
    const joinedDays = Math.floor(
      (Date.now() - new Date(m.joinedAt).getTime()) / 86400000,
    );

    if (filterDays === 7 && joinedDays < 7) return false;
    if (filterDays === 30 && joinedDays < 30) return false;

    if (filterRole === "mod" && m.role !== "moderator") return false;
    if (filterRole === "admin" && m.role !== "owner") return false;

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
      case "joinedCordigramAt":
        return new Date(b.joinedCordigramAt).getTime() - new Date(a.joinedCordigramAt).getTime();
      case "joinMethod":
        return joinMethodLabel(a).localeCompare(joinMethodLabel(b));
      default:
        return 0;
    }
  });

  if (!isOwner) {
    return (
      <div className={styles.wrapper}>
        <p className={styles.hint}>Chỉ chủ máy chủ mới có thể xem và quản lý thành viên.</p>
      </div>
    );
  }

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
          <option value="joinedCordigramAt">Cordigram</option>
          <option value="joinMethod">Cách gia nhập</option>
        </select>
        <button
          type="button"
          className={styles.btnSecondary}
          onClick={() => setFilterModalOpen(true)}
        >
          Lược bỏ
        </button>
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
                <th className={styles.th}>ĐÃ THAM GIA CORDIGRAM</th>
                <th className={`${styles.th} ${styles.thJoinMethod}`}>JOIN METHOD</th>
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
                      <span className={styles.displayName}>{row.displayName || row.username}</span>
                      <span className={styles.username}>{row.username}</span>
                    </div>
                  </td>
                  <td className={styles.td}>{formatDaysOrYears(row.joinedAt)}</td>
                  <td className={styles.td}>{formatDaysOrYears(row.joinedCordigramAt)}</td>
                  <td className={`${styles.td} ${styles.tdJoinMethod}`}>{joinMethodLabel(row)}</td>
                  <td className={styles.td}>{row.role === "owner" ? "Chủ" : row.role === "moderator" ? "Mod" : "Thành viên"}</td>
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
                <div className={styles.filterLabel}>Đồng thời bao gồm thành viên giữ các vai trò này</div>
                <select
                  className={styles.filterSelect}
                  value={filterRole}
                  onChange={(e) => setFilterRole(e.target.value as typeof filterRole)}
                >
                  <option value="all">Tất cả vai trò</option>
                  <option value="mod">Mod (quản lý server)</option>
                  <option value="admin">Quản trị viên</option>
                </select>
              </div>

              <p className={styles.filterHint}>
                Việc thanh lọc sẽ loại bỏ thành viên ít hoạt động trong khoảng thời gian đã chọn. Họ có thể vào lại máy chủ nếu được mời lại.
              </p>
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
                onClick={() => setFilterModalOpen(false)}
              >
                Lược bỏ
              </button>
            </div>
          </div>
        </div>
      )}

      {memberMenu && (
        <MemberContextMenu
          x={memberMenu.x}
          y={memberMenu.y}
          member={memberMenu.row}
          isServerOwner={isOwner}
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
            if (isOwner) {
              const name = memberMenu.row.displayName || memberMenu.row.username;
              alert(`Chỉ chủ server mới có thể đổi biệt danh cho thành viên. (Đổi biệt danh cho ${name} - tính năng sẽ được bổ sung.)`);
            }
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
          onTransferOwnership={
            isOwner && memberMenu.row.role !== "owner" && memberMenu.row.userId !== currentUserId
              ? () => {
                  setTransferConfirmMember(memberMenu.row);
                  setMemberMenu(null);
                }
              : undefined
          }
        />
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
          onConfirm={async (opts) => {
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
