"use client";

import React, { useState, useEffect } from "react";
import styles from "./MemberProfilePopup.module.css";
import type { ServerMemberRow, MemberWithRoles } from "@/lib/servers-api";
import { checkFollowStatus, followUser, unfollowUser } from "@/lib/api";
import { useLanguage, localeTagForLanguage } from "@/component/language-provider";

// Union type để hỗ trợ cả ServerMemberRow cũ và MemberWithRoles mới
type MemberData = ServerMemberRow | MemberWithRoles;

// Type guard để kiểm tra có phải MemberWithRoles không
function isMemberWithRoles(member: MemberData): member is MemberWithRoles {
  return 'roles' in member && Array.isArray((member as MemberWithRoles).roles);
}

// Helper function để tính màu contrast cho text trên background
function getContrastColor(hexColor: string): string {
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  // Calculate luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#000000' : '#ffffff';
}

export interface MemberProfilePopupProps {
  member: MemberData;
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
  const { t, language } = useLanguage();
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
  const avatarUrl =
    member.avatarUrl ||
    "https://res.cloudinary.com/doicocgeo/image/upload/v1765850274/user-avatar-default_gfx5bs.jpg";
  const joinDate = serverJoinDate
    ? new Date(serverJoinDate).toLocaleDateString(localeTagForLanguage(language), {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "";

  return (
    <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal aria-label={t("chat.popups.memberProfile.aria")}>
      <div className={styles.popup}>
      <div onClick={(e) => e.stopPropagation()}>
        <button type="button" className={styles.closeBtn} onClick={onClose} aria-label={t("chat.popups.closeAria")}>
          ×
        </button>

        <div className={styles.banner} />

        <div className={styles.avatarWrap}>
          <img className={styles.avatar} src={avatarUrl} alt="" />
        </div>

        {/* Tên hiển thị với màu theo role cao nhất */}
        <h2 
          className={styles.displayName}
          style={{ 
            color: isMemberWithRoles(member) ? member.displayColor : undefined 
          }}
        >
          {displayName}
          {isMemberWithRoles(member) && member.isOwner && (
            <span className={styles.ownerCrown}> 👑</span>
          )}
        </h2>
        <p className={styles.username}>{member.username}</p>

        <div className={styles.actions}>
          {!isSelf && (
            <button
              type="button"
              className={isFollowing ? styles.btnFollowed : styles.btnFollow}
              onClick={handleFollowClick}
              disabled={followLoading || checkingFollow}
            >
              {checkingFollow ? "..." : followLoading ? "..." : isFollowing ? t("chat.popups.memberProfile.following") : t("chat.popups.memberProfile.follow")}
            </button>
          )}
          <button type="button" className={styles.btnIcon} onClick={onMessage} title={t("chat.popups.memberProfile.message")} aria-label={t("chat.popups.memberProfile.messageAria")}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </button>
          <button type="button" className={styles.btnIcon} aria-label={t("chat.popups.memberProfile.optionsAria")}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="6" r="1.5" />
              <circle cx="12" cy="12" r="1.5" />
              <circle cx="12" cy="18" r="1.5" />
            </svg>
          </button>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionLabel}>{t("chat.popups.memberProfile.joinFrom")}</div>
          <div className={styles.sectionRow}>
            <span className={styles.date}>{joinDate || "—"}</span>
            <span className={styles.serverIcon} aria-hidden>📋</span>
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionLabel}>{t("chat.popups.memberProfile.roles")}</div>
          {/* Hiển thị role badges nếu có */}
          {isMemberWithRoles(member) && member.roles.length > 0 ? (
            <div className={styles.roleBadges}>
              {member.isOwner && (
                <span className={styles.roleBadgeOwner}>
                  <span className={styles.ownerIcon}>👑</span>
                  {t("chat.popups.memberProfile.ownerBadge")}
                </span>
              )}
              {member.roles.map((role) => (
                <span
                  key={role._id}
                  className={styles.roleBadge}
                  style={{ 
                    backgroundColor: role.color,
                    color: getContrastColor(role.color)
                  }}
                >
                  <span 
                    className={styles.roleDot} 
                    style={{ backgroundColor: role.color }}
                  />
                  {role.name}
                </span>
              ))}
            </div>
          ) : (
            <div className={styles.sectionRow}>
              <span>
                {'role' in member 
                  ? (member.role === "owner" ? t("chat.popups.memberProfile.owner") : member.role === "moderator" ? t("chat.popups.memberProfile.moderator") : t("chat.popups.memberProfile.member"))
                  : (member as MemberWithRoles).isOwner ? t("chat.popups.memberProfile.owner") : t("chat.popups.memberProfile.member")
                }
              </span>
            </div>
          )}
        </div>

        <div className={styles.section}>
          <div className={styles.sectionLabel}>{t("chat.popups.memberProfile.notes")}</div>
          <p className={styles.notesHint}>{t("chat.popups.memberProfile.notesHint")}</p>
        </div>

        <div className={styles.tabs}>
          <button
            type="button"
            className={activeTab === "activity" ? styles.tabActive : styles.tab}
            onClick={() => setActiveTab("activity")}
          >
            {t("chat.popups.memberProfile.tabActivity")}
          </button>
          <button
            type="button"
            className={activeTab === "followers" ? styles.tabActive : styles.tab}
            onClick={() => setActiveTab("followers")}
          >
            {t("chat.popups.memberProfile.tabFollowers")}
          </button>
        </div>

        <div className={styles.tabContent}>
          {activeTab === "activity" && (
            <div className={styles.activityEmpty}>
              <p>{t("chat.popups.memberProfile.activityEmpty", { name: displayName })}</p>
              <p className={styles.activityHint}>{t("chat.popups.memberProfile.activityHint")}</p>
              <button type="button" className={styles.btnMessage} onClick={onMessage}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                {t("chat.popups.memberProfile.message")}
              </button>
            </div>
          )}
          {activeTab === "followers" && (
            <div className={styles.activityEmpty}>
              <p>{t("chat.popups.memberProfile.followersEmpty")}</p>
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
