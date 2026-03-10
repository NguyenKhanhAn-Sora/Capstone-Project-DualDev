"use client";

import React, { useState, useMemo } from "react";
import styles from "../InviteToVoiceChannelPopup/InviteToVoiceChannelPopup.module.css";
import type { Friend } from "@/lib/servers-api";
import { createServerInvite } from "@/lib/servers-api";

interface InviteToServerPopupProps {
  isOpen: boolean;
  onClose: () => void;
  serverId: string;
  serverName: string;
  friends: Friend[];
  onInviteSent?: () => void;
}

export default function InviteToServerPopup({
  isOpen,
  onClose,
  serverId,
  serverName,
  friends,
  onInviteSent,
}: InviteToServerPopupProps) {
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Id những người đã được mời thành công trong phiên này (để hiển thị "Đã mời"). */
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set());

  const inviteLink =
    typeof window !== "undefined"
      ? `${window.location.origin}/invite/server/${serverId}`
      : "";

  const filteredFriends = useMemo(() => {
    if (!search.trim()) return friends;
    const q = search.trim().toLowerCase();
    return friends.filter(
      (f) =>
        (f.displayName || "").toLowerCase().includes(q) ||
        (f.username || "").toLowerCase().includes(q),
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

  const handleInviteFriend = async (friend: Friend) => {
    setError(null);
    setSendingId(friend._id);
    try {
      await createServerInvite(serverId, friend._id);
      setInvitedIds((prev) => new Set(prev).add(friend._id));
      onInviteSent?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không gửi được lời mời");
      console.error("Failed to send server invite", e);
    } finally {
      setSendingId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className={styles.overlay}
      onClick={onClose}
      role="dialog"
      aria-modal
      aria-labelledby="invite-server-title"
    >
      <div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className={styles.closeBtn}
          onClick={onClose}
          aria-label="Đóng"
        >
          ×
        </button>
        <h2 id="invite-server-title" className={styles.headerTitle}>
          Mời bạn bè vào Máy chủ của {serverName}
        </h2>
        <p className={styles.headerSub}>
          Người nhận sẽ đến # chung
        </p>
        {error && (
          <p style={{ color: "var(--color-danger, #f23f43)", marginBottom: 8, fontSize: 13 }}>
            {error}
          </p>
        )}

        <div className={styles.searchWrap}>
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
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
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
        <div className={styles.friendList}>
          {filteredFriends.length === 0 ? (
            <p className={styles.emptyFriends}>
              {friends.length === 0
                ? "Chưa có bạn bè để mời."
                : "Không tìm thấy bạn bè nào."}
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
                  {(!friend.avatarUrl ||
                    !friend.avatarUrl.startsWith("http")) &&
                    (friend.displayName || friend.username || "?")
                      .charAt(0)
                      .toUpperCase()}
                </div>
                <div className={styles.friendInfo}>
                  <div className={styles.friendDisplayName}>
                    {friend.displayName ||
                      friend.username ||
                      "Người dùng"}
                  </div>
                  <div className={styles.friendUsername}>
                    {friend.username}
                  </div>
                </div>
                <button
                  type="button"
                  className={styles.inviteFriendBtn}
                  onClick={() => handleInviteFriend(friend)}
                  disabled={sendingId === friend._id || invitedIds.has(friend._id)}
                >
                  {sendingId === friend._id
                    ? "Đang gửi…"
                    : invitedIds.has(friend._id)
                      ? "Đã mời"
                      : "Mời"}
                </button>
              </div>
            ))
          )}
        </div>

        <div className={styles.dividerWrap}>
          <p className={styles.dividerText}>
            Hoặc, gửi link mời cho họ
          </p>
        </div>
        <div className={styles.linkWrap}>
          <input
            type="text"
            className={styles.linkInput}
            readOnly
            value={inviteLink}
          />
          <button
            type="button"
            className={`${styles.copyBtn} ${
              copied ? styles.copied : ""
            }`}
            onClick={handleCopy}
          >
            {copied ? "Đã sao chép" : "Sao chép"}
          </button>
        </div>
        <p className={styles.expireNote}>
          Link mời của bạn sẽ hết hạn sau 7 ngày. Chỉnh sửa link mời.
        </p>
      </div>
    </div>
  );
}
