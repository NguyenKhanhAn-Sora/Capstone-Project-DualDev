"use client";

import React, { useState, useMemo, useEffect } from "react";
import styles from "../InviteToVoiceChannelPopup/InviteToVoiceChannelPopup.module.css";
import type { Friend } from "@/lib/servers-api";
import { createServerInvite } from "@/lib/servers-api";
import { sendDirectMessage } from "@/lib/api";
import { useLanguage } from "@/component/language-provider";

interface InviteToServerPopupProps {
  isOpen: boolean;
  onClose: () => void;
  serverId: string;
  serverName: string;
  friends: Friend[];
  canCreateInvite?: boolean;
  onInviteSent?: () => void;
}

export default function InviteToServerPopup({
  isOpen,
  onClose,
  serverId,
  serverName,
  friends,
  canCreateInvite = false,
  onInviteSent,
}: InviteToServerPopupProps) {
  const { t } = useLanguage();
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** API từ chối quyền mời — ẩn link sao chép dù prop ban đầu có thể sai. */
  const [inviteBlocked, setInviteBlocked] = useState(false);
  /** Id những người đã được mời thành công trong phiên này (để hiển thị "Đã mời"). */
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set());

  const canInvite = canCreateInvite && !inviteBlocked;

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

  const noPermissionMessage = t("chat.invite.errors.noCreateInvitePermission");

  useEffect(() => {
    if (!isOpen) {
      setError(null);
      setInviteBlocked(false);
      setCopied(false);
      setInvitedIds(new Set());
      setSearch("");
      return;
    }
    setInviteBlocked(false);
    if (!canCreateInvite) {
      setError(noPermissionMessage);
    } else {
      setError(null);
    }
  }, [isOpen, canCreateInvite, noPermissionMessage]);

  const isPermissionDeniedMessage = (msg: string): boolean =>
    msg.includes("quyền tạo lời mời") ||
    msg.includes("permission to create invite") ||
    msg.includes("create invite") ||
    msg.includes("招待を作成") ||
    msg.includes("创建邀请");

  const resolveInviteError = (e: unknown): string => {
    let msg = e instanceof Error ? e.message : String(e ?? "");
    const trimmed = msg.trim();
    if (trimmed.startsWith("{")) {
      try {
        const parsed = JSON.parse(trimmed) as { message?: string | string[] };
        const raw = parsed.message;
        msg =
          typeof raw === "string"
            ? raw
            : Array.isArray(raw) && raw.length > 0
              ? String(raw[0])
              : trimmed;
      } catch {
        /* keep original */
      }
    }
    if (isPermissionDeniedMessage(msg)) {
      return noPermissionMessage;
    }
    return msg || t("chat.invite.errors.cannotSendInvite");
  };

  const handleCopy = async () => {
    if (!canInvite) {
      setError(noPermissionMessage);
      return;
    }
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error(e);
    }
  };

  const handleInviteFriend = async (friend: Friend) => {
    if (!canInvite) {
      setError(noPermissionMessage);
      return;
    }
    setError(null);
    setSendingId(friend._id);
    try {
      await createServerInvite(serverId, friend._id);
      try {
        await sendDirectMessage(friend._id, { content: inviteLink });
      } catch {
        // DM send failure is non-critical
      }
      setInvitedIds((prev) => new Set(prev).add(friend._id));
      onInviteSent?.();
    } catch (e) {
      const friendly = resolveInviteError(e);
      if (friendly === noPermissionMessage) {
        setInviteBlocked(true);
      }
      setError(friendly);
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
          aria-label={t("settings.close")}
        >
          ×
        </button>
        <h2 id="invite-server-title" className={styles.headerTitle}>
          {t("chat.inviteServer.title", { serverName })}
        </h2>
        <p className={styles.headerSub}>
          {t("chat.inviteServer.sub")}
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
            placeholder={t("chat.invite.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className={styles.sectionLabel}>
          {t("chat.invite.sectionLabel")}
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
                ? t("chat.invite.empty.noFriends")
                : t("chat.invite.empty.notFound")}
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
                      t("chat.common.user")}
                  </div>
                  <div className={styles.friendUsername}>
                    {friend.username}
                  </div>
                </div>
                <button
                  type="button"
                  className={styles.inviteFriendBtn}
                  onClick={() => handleInviteFriend(friend)}
                  disabled={!canInvite || sendingId === friend._id || invitedIds.has(friend._id)}
                >
                  {sendingId === friend._id
                    ? t("chat.common.sending")
                    : invitedIds.has(friend._id)
                      ? t("chat.invite.invited")
                      : t("chat.invite.invite")}
                </button>
              </div>
            ))
          )}
        </div>

        {canInvite && (
          <div className={styles.dividerWrap}>
            <p className={styles.dividerText}>
              {t("chat.invite.orSendLink")}
            </p>
          </div>
        )}
        {canInvite && (
          <>
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
                {copied ? t("chat.common.copied") : t("chat.common.copy")}
              </button>
            </div>
            <p className={styles.expireNote}>
              {t("chat.inviteServer.expireNote")}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
