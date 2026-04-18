"use client";

import React, { useState, useMemo } from "react";
import styles from "./InviteToVoiceChannelPopup.module.css";
import type { Friend } from "@/lib/servers-api";
import { sendDirectMessage } from "@/lib/api";
import { useLanguage } from "@/component/language-provider";

interface InviteToVoiceChannelPopupProps {
  isOpen: boolean;
  onClose: () => void;
  serverId: string;
  serverName: string;
  channelId: string;
  channelName: string;
  /** Thành viên máy chủ (đã loại bản thân), từ getServerMembersWithRoles. */
  serverMembers: Friend[];
}

export default function InviteToVoiceChannelPopup({
  isOpen,
  onClose,
  serverId,
  serverName,
  channelId,
  channelName,
  serverMembers,
}: InviteToVoiceChannelPopupProps) {
  const { t } = useLanguage();
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set());

  const inviteLink =
    typeof window !== "undefined"
      ? `${window.location.origin}/invite/server/${serverId}/${channelId}`
      : "";

  const filteredMembers = useMemo(() => {
    if (!search.trim()) return serverMembers;
    const q = search.trim().toLowerCase();
    return serverMembers.filter(
      (m) =>
        (m.displayName || "").toLowerCase().includes(q) ||
        (m.username || "").toLowerCase().includes(q),
    );
  }, [serverMembers, search]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error(e);
    }
  };

  const handleInviteMember = async (member: Friend) => {
    setError(null);
    setSendingId(member._id);
    try {
      await sendDirectMessage(member._id, { content: inviteLink });
      setInvitedIds((prev) => new Set(prev).add(member._id));
    } catch (e) {
      setError(
        e instanceof Error ? e.message : t("chat.invite.errors.cannotSendInvite"),
      );
      console.error("Failed to send voice channel invite DM", e);
    } finally {
      setSendingId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal aria-labelledby="invite-voice-title">
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button type="button" className={styles.closeBtn} onClick={onClose} aria-label={t("settings.close")}>
          ×
        </button>
        <h2 id="invite-voice-title" className={styles.headerTitle}>
          {t("chat.inviteVoice.title", { serverName })}
        </h2>
        <p className={styles.headerSub}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" stroke="currentColor" strokeWidth="2" />
            <line x1="8" y1="23" x2="16" y2="23" stroke="currentColor" strokeWidth="2" />
          </svg>
          {t("chat.inviteVoice.sub", { channelName })}
        </p>

        {error && (
          <p className={styles.emptyFriends} style={{ color: "var(--color-danger, #e74c3c)", marginBottom: 8 }}>
            {error}
          </p>
        )}

        <div className={styles.searchWrap}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            className={styles.searchInput}
            placeholder={t("chat.inviteVoice.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className={styles.sectionLabel}>
          {t("chat.inviteVoice.sectionLabel")}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
        <div className={styles.friendList}>
          {filteredMembers.length === 0 ? (
            <p className={styles.emptyFriends}>
              {serverMembers.length === 0
                ? t("chat.inviteVoice.empty.noMembers")
                : t("chat.inviteVoice.empty.notFound")}
            </p>
          ) : (
            filteredMembers.map((member) => (
              <div key={member._id} className={styles.friendRow}>
                <div
                  className={styles.friendAvatar}
                  style={
                    member.avatarUrl && member.avatarUrl.startsWith("http")
                      ? { backgroundImage: `url(${member.avatarUrl})` }
                      : undefined
                  }
                >
                  {(!member.avatarUrl || !member.avatarUrl.startsWith("http")) &&
                    (member.displayName || member.username || "?").charAt(0).toUpperCase()}
                </div>
                <div className={styles.friendInfo}>
                  <div className={styles.friendDisplayName}>
                    {member.displayName || member.username || t("chat.common.user")}
                  </div>
                  <div className={styles.friendUsername}>{member.username}</div>
                </div>
                <button
                  type="button"
                  className={styles.inviteFriendBtn}
                  disabled={sendingId === member._id || invitedIds.has(member._id)}
                  onClick={() => handleInviteMember(member)}
                >
                  {invitedIds.has(member._id)
                    ? t("chat.invite.invited")
                    : sendingId === member._id
                      ? t("chat.popups.loading")
                      : t("chat.invite.invite")}
                </button>
              </div>
            ))
          )}
        </div>

        <div className={styles.dividerWrap}>
          <p className={styles.dividerText}>{t("chat.invite.orSendLink")}</p>
        </div>
        <div className={styles.linkWrap}>
          <input type="text" className={styles.linkInput} readOnly value={inviteLink} />
          <button
            type="button"
            className={`${styles.copyBtn} ${copied ? styles.copied : ""}`}
            onClick={handleCopy}
          >
            {copied ? t("chat.common.copied") : t("chat.common.copy")}
          </button>
        </div>
        <p className={styles.expireNote}>
          {t("chat.inviteVoice.expireNote")}
        </p>
      </div>
    </div>
  );
}
