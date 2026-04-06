"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  getBannedUsers,
  unbanMember,
  getMentionRestrictedMembers,
  unrestrictMember,
  type BannedUser,
  type MentionRestrictedMember,
} from "@/lib/servers-api";
import styles from "./ServerBansSection.module.css";

interface ServerBansSectionProps {
  serverId: string;
  canManageBans: boolean;
}

export default function ServerBansSection({
  serverId,
  canManageBans,
}: ServerBansSectionProps) {
  const [bannedUsers, setBannedUsers] = useState<BannedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [confirmTarget, setConfirmTarget] = useState<BannedUser | null>(null);
  const [unbanLoading, setUnbanLoading] = useState(false);
  const [restricted, setRestricted] = useState<MentionRestrictedMember[]>([]);

  const loadRestricted = useCallback(async () => {
    if (!canManageBans) return;
    try {
      const data = await getMentionRestrictedMembers(serverId);
      setRestricted(data);
    } catch { /* */ }
  }, [serverId, canManageBans]);

  const handleUnrestrict = async (memberId: string) => {
    try {
      await unrestrictMember(serverId, memberId);
      setRestricted((prev) => prev.filter((r) => r.userId !== memberId));
    } catch { /* */ }
  };

  const loadBans = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getBannedUsers(serverId);
      setBannedUsers(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Không tải được danh sách chặn");
    } finally {
      setLoading(false);
    }
  }, [serverId]);

  useEffect(() => {
    loadBans();
    loadRestricted();
  }, [loadBans, loadRestricted]);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return bannedUsers;
    const q = searchQuery.toLowerCase().trim();
    return bannedUsers.filter(
      (u) =>
        u.username.toLowerCase().includes(q) ||
        u.displayName.toLowerCase().includes(q) ||
        u.userId.toLowerCase().includes(q),
    );
  }, [bannedUsers, searchQuery]);

  const handleUnban = async () => {
    if (!confirmTarget) return;
    try {
      setUnbanLoading(true);
      await unbanMember(serverId, confirmTarget.userId);
      setBannedUsers((prev) => prev.filter((u) => u.userId !== confirmTarget.userId));
      setConfirmTarget(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Gỡ lệnh cấm thất bại");
    } finally {
      setUnbanLoading(false);
    }
  };

  const getInitials = (name: string) =>
    name.charAt(0).toUpperCase();

  return (
    <div className={styles.wrapper}>
      <p className={styles.desc}>
        Cấm mặc định theo tài khoản và IP. Một người dùng có thể qua mặt lệnh cấm IP bằng
        cách sử dụng proxy. Việc qua mặt lệnh cấm sẽ rất khó thực hiện khi mở xác minh số
        điện thoại trong{" "}
        <span className={styles.descLink}>Kiểm duyệt</span>.
      </p>

      <div className={styles.toolbar}>
        <input
          className={styles.searchInput}
          type="text"
          placeholder="Tìm kiếm lệnh cấm theo ID người dùng hoặc Tên người dùng"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.preventDefault();
          }}
        />
        <button
          type="button"
          className={styles.searchBtn}
          onClick={() => {/* search is instant via filter */}}
        >
          Tìm kiếm
        </button>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.tableWrap}>
        {loading ? (
          <p className={styles.loading}>Đang tải danh sách...</p>
        ) : filtered.length === 0 ? (
          <div className={styles.emptyState}>
            <svg
              className={styles.emptyIcon}
              viewBox="0 0 120 120"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <rect
                x="30"
                y="35"
                width="60"
                height="40"
                rx="8"
                fill="currentColor"
                opacity="0.15"
              />
              <rect
                x="38"
                y="42"
                width="44"
                height="6"
                rx="3"
                fill="currentColor"
                opacity="0.25"
              />
              <rect
                x="38"
                y="54"
                width="30"
                height="6"
                rx="3"
                fill="currentColor"
                opacity="0.2"
              />
              <line
                x1="25"
                y1="95"
                x2="95"
                y2="25"
                stroke="currentColor"
                strokeWidth="4"
                strokeLinecap="round"
                opacity="0.3"
              />
            </svg>
            <h3 className={styles.emptyTitle}>KHÔNG CẤM</h3>
            <p className={styles.emptyDesc}>
              {searchQuery.trim()
                ? "Không tìm thấy người dùng bị cấm phù hợp với tìm kiếm của bạn."
                : "Bạn chưa cấm một ai cả... nhưng nếu và khi bắt buộc phải làm như vậy, đừng do dự!"}
            </p>
          </div>
        ) : (
          <>
            {filtered.map((user) => (
              <div key={user.userId} className={styles.banRow}>
                <div
                  className={styles.avatar}
                  style={
                    user.avatarUrl
                      ? { backgroundImage: `url(${user.avatarUrl})` }
                      : undefined
                  }
                >
                  {!user.avatarUrl && getInitials(user.displayName)}
                </div>
                <div className={styles.nameBlock}>
                  <span className={styles.displayName}>{user.displayName}</span>
                  <span className={styles.username}>@{user.username}</span>
                </div>
                {user.reason && (
                  <span className={styles.reason} title={user.reason}>
                    Lý do: {user.reason}
                  </span>
                )}
                {canManageBans && (
                  <button
                    type="button"
                    className={styles.unbanBtn}
                    onClick={() => setConfirmTarget(user)}
                  >
                    Gỡ lệnh cấm
                  </button>
                )}
              </div>
            ))}
            <p className={styles.resultCount}>
              Hiển thị {filtered.length} trên tổng số {bannedUsers.length} người dùng bị cấm
            </p>
          </>
        )}
      </div>

      {/* ── Restricted members from mention spam ── */}
      {canManageBans && (
        <div className={styles.restrictedSection}>
          <h4 className={styles.restrictedTitle}>Thành viên bị hạn chế (Spam đề cập)</h4>
          {restricted.length === 0 ? (
            <p className={styles.restrictedEmpty}>Không có thành viên nào bị hạn chế.</p>
          ) : (
            restricted.map((m) => (
              <div key={m.userId} className={styles.restrictedRow}>
                {m.avatarUrl ? (
                  <img src={m.avatarUrl} alt="" className={styles.restrictedAvatar} />
                ) : (
                  <div className={styles.restrictedAvatar}>
                    {(m.displayName || "?")[0].toUpperCase()}
                  </div>
                )}
                <div className={styles.restrictedInfo}>
                  <p className={styles.restrictedName}>{m.displayName}</p>
                  <p className={styles.restrictedMeta}>
                    {m.mentionRestricted && "Bị hạn chế gửi tin nhắn"}
                    {m.mentionBlockedUntil && (
                      <> · Chặn đề cập đến {new Date(m.mentionBlockedUntil).toLocaleString("vi-VN")}</>
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  className={styles.unrestrictBtn}
                  onClick={() => handleUnrestrict(m.userId)}
                >
                  Mở hạn chế
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {confirmTarget && (
        <div
          className={styles.confirmOverlay}
          onClick={() => !unbanLoading && setConfirmTarget(null)}
        >
          <div
            className={styles.confirmModal}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className={styles.confirmTitle}>Gỡ lệnh cấm</h3>
            <p className={styles.confirmText}>
              Bạn có chắc chắn muốn gỡ lệnh cấm cho{" "}
              <strong>{confirmTarget.displayName}</strong> (@{confirmTarget.username})? Người
              dùng này sẽ có thể tham gia lại máy chủ bằng lời mời mới.
            </p>
            <div className={styles.confirmFooter}>
              <button
                type="button"
                className={styles.confirmCancel}
                onClick={() => setConfirmTarget(null)}
                disabled={unbanLoading}
              >
                Hủy
              </button>
              <button
                type="button"
                className={styles.confirmSubmit}
                onClick={handleUnban}
                disabled={unbanLoading}
              >
                {unbanLoading ? "Đang gỡ..." : "Gỡ lệnh cấm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
