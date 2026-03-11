"use client";

import React, { useState, useEffect } from "react";
import styles from "./MemberProfilePopup.module.css";
import type { ServerMemberRow } from "@/lib/servers-api";
import { checkFollowStatus, followUser, unfollowUser } from "@/lib/api";

export interface MemberProfilePopupProps {
  member: ServerMemberRow;
  currentUserId: string;
  token: string | null;
  serverJoinDate?: string;
  onClose: () => void;
  onMessage: () => void;
}

export default function MemberProfilePopup({
  member,
  currentUserId,
  token,
  serverJoinDate,
  onClose,
  onMessage,
}: MemberProfilePopupProps) {
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [checkingFollow, setCheckingFollow] = useState(true);
  const [activeTab, setActiveTab] = useState<"activity" | "followers">("activity");

  const isSelf = member.userId === currentUserId;

  useEffect(() => {
    if (!token || isSelf) {
      setCheckingFollow(false);
      return;
    }
    checkFollowStatus({ token, targetUserId: member.userId })
      .then((r) => {
        setIsFollowing(r.isFollowing);
      })
      .catch(() => {})
      .finally(() => setCheckingFollow(false));
  }, [token, member.userId, isSelf]);

  const handleFollowClick = async () => {
    if (!token || isSelf || followLoading) return;
    setFollowLoading(true);
    try {
      if (isFollowing) {
        await unfollowUser({ token, userId: member.userId });
        setIsFollowing(false);
      } else {
        await followUser({ token, userId: member.userId });
        setIsFollowing(true);
      }
    } catch {
      // ignore
    } finally {
      setFollowLoading(false);
    }
  };

  const displayName = member.displayName || member.username;
  const joinDate = serverJoinDate ? new Date(serverJoinDate).toLocaleDateString("vi-VN", { day: "numeric", month: "short", year: "numeric" }) : "";

  return (
    <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal aria-label="Hồ sơ thành viên">
      <div className={styles.popup} onClick={(e) => e.stopPropagation()}>
        <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Đóng">
          ×
        </button>

        <div className={styles.banner} />

        <div className={styles.avatarWrap}>
          <div
            className={styles.avatar}
            style={{
              backgroundImage: member.avatarUrl ? `url(${member.avatarUrl})` : undefined,
              backgroundColor: !member.avatarUrl ? "#5865f2" : undefined,
            }}
          >
            {!member.avatarUrl && <span>{(displayName || "?").charAt(0).toUpperCase()}</span>}
          </div>
        </div>

        <h2 className={styles.displayName}>{displayName}</h2>
        <p className={styles.username}>{member.username}</p>

        <div className={styles.actions}>
          {!isSelf && (
            <button
              type="button"
              className={isFollowing ? styles.btnFollowed : styles.btnFollow}
              onClick={handleFollowClick}
              disabled={followLoading || checkingFollow}
            >
              {checkingFollow ? "..." : followLoading ? "..." : isFollowing ? "Đã follow" : "Follow"}
            </button>
          )}
          <button type="button" className={styles.btnIcon} onClick={onMessage} title="Nhắn tin" aria-label="Nhắn tin">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </button>
          <button type="button" className={styles.btnIcon} aria-label="Tùy chọn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="6" r="1.5" />
              <circle cx="12" cy="12" r="1.5" />
              <circle cx="12" cy="18" r="1.5" />
            </svg>
          </button>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionLabel}>Gia Nhập Từ</div>
          <div className={styles.sectionRow}>
            <span className={styles.date}>{joinDate || "—"}</span>
            <span className={styles.serverIcon} aria-hidden>📋</span>
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionLabel}>Vai trò</div>
          <div className={styles.sectionRow}>
            <span>{member.role === "owner" ? "Chủ" : member.role === "moderator" ? "Mod" : "Thành viên"}</span>
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionLabel}>Ghi chú (chỉ hiển thị cho bạn)</div>
          <p className={styles.notesHint}>Nhấp để thêm ghi chú</p>
        </div>

        <div className={styles.tabs}>
          <button
            type="button"
            className={activeTab === "activity" ? styles.tabActive : styles.tab}
            onClick={() => setActiveTab("activity")}
          >
            Hoạt động
          </button>
          <button
            type="button"
            className={activeTab === "followers" ? styles.tabActive : styles.tab}
            onClick={() => setActiveTab("followers")}
          >
            Follower chung
          </button>
        </div>

        <div className={styles.tabContent}>
          {activeTab === "activity" && (
            <div className={styles.activityEmpty}>
              <p>{displayName} không có hoạt động nào để chia sẻ ở đây.</p>
              <p className={styles.activityHint}>Vẫn đang chờ xem họ sẽ chia sẻ nội dung gì tiếp theo - sao không phá vỡ bầu không khí ngại ngùng này nhỉ?</p>
              <button type="button" className={styles.btnMessage} onClick={onMessage}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                Nhắn tin
              </button>
            </div>
          )}
          {activeTab === "followers" && (
            <div className={styles.activityEmpty}>
              <p>Follower chung sẽ hiển thị tại đây.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
