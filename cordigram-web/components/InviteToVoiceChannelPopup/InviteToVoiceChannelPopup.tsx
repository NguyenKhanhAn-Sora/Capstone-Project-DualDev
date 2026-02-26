"use client";

import React, { useState, useMemo } from "react";
import styles from "./InviteToVoiceChannelPopup.module.css";
import type { Friend } from "@/lib/servers-api";

interface InviteToVoiceChannelPopupProps {
  isOpen: boolean;
  onClose: () => void;
  serverId: string;
  serverName: string;
  channelId: string;
  channelName: string;
  friends: Friend[];
}

export default function InviteToVoiceChannelPopup({
  isOpen,
  onClose,
  serverId,
  serverName,
  channelId,
  channelName,
  friends,
}: InviteToVoiceChannelPopupProps) {
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState(false);

  const inviteLink =
    typeof window !== "undefined"
      ? `${window.location.origin}/invite/server/${serverId}/${channelId}`
      : "";

  const filteredFriends = useMemo(() => {
    if (!search.trim()) return friends;
    const q = search.trim().toLowerCase();
    return friends.filter(
      (f) =>
        (f.displayName || "").toLowerCase().includes(q) ||
        (f.username || "").toLowerCase().includes(q)
    );
  }, [friends, search]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error(e);
    }
  };

  const handleInviteFriend = async () => {
    await handleCopy();
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal aria-labelledby="invite-voice-title">
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Đóng">
          ×
        </button>
        <h2 id="invite-voice-title" className={styles.headerTitle}>
          Mời bạn bè vào {serverName}
        </h2>
        <p className={styles.headerSub}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" stroke="currentColor" strokeWidth="2" />
            <line x1="8" y1="23" x2="16" y2="23" stroke="currentColor" strokeWidth="2" />
          </svg>
          Người nhận sẽ đến {channelName}
        </p>

        <div className={styles.searchWrap}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Tìm kiếm bạn bè"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className={styles.sectionLabel}>
          Mời Vào Máy Chủ
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
        <div className={styles.friendList}>
          {filteredFriends.length === 0 ? (
            <p className={styles.emptyFriends}>
              {friends.length === 0 ? "Chưa có bạn bè để mời." : "Không tìm thấy bạn bè nào."}
            </p>
          ) : (
            filteredFriends.map((friend) => (
              <div key={friend._id} className={styles.friendRow}>
                <div
                  className={styles.friendAvatar}
                  style={
                    friend.avatarUrl && friend.avatarUrl.startsWith("http")
                      ? { backgroundImage: `url(${friend.avatarUrl})` }
                      : undefined
                  }
                >
                  {(!friend.avatarUrl || !friend.avatarUrl.startsWith("http")) &&
                    (friend.displayName || friend.username || "?").charAt(0).toUpperCase()}
                </div>
                <div className={styles.friendInfo}>
                  <div className={styles.friendDisplayName}>
                    {friend.displayName || friend.username || "Người dùng"}
                  </div>
                  <div className={styles.friendUsername}>{friend.username}</div>
                </div>
                <button
                  type="button"
                  className={styles.inviteFriendBtn}
                  onClick={handleInviteFriend}
                >
                  Mời
                </button>
              </div>
            ))
          )}
        </div>

        <div className={styles.dividerWrap}>
          <p className={styles.dividerText}>Hoặc, gửi link mời cho họ</p>
        </div>
        <div className={styles.linkWrap}>
          <input type="text" className={styles.linkInput} readOnly value={inviteLink} />
          <button
            type="button"
            className={`${styles.copyBtn} ${copied ? styles.copied : ""}`}
            onClick={handleCopy}
          >
            {copied ? "Đã sao chép" : "Sao chép"}
          </button>
        </div>
        <p className={styles.expireNote}>
          Link mời dẫn thẳng vào kênh thoại này. Người chưa vào máy chủ sẽ thấy trang mời tham gia trước.
        </p>
      </div>
    </div>
  );
}
