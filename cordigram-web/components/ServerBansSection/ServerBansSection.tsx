"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { getBannedUsers, unbanMember, getMentionRestrictedMembers, unrestrictMember, type BannedUser, type MentionRestrictedMember } from "@/lib/servers-api";
import styles from "./ServerBansSection.module.css";
import { useLanguage } from "@/component/language-provider";

interface ServerBansSectionProps {
  serverId: string;
  canManageBans: boolean;
}

export default function ServerBansSection({ serverId, canManageBans }: ServerBansSectionProps) {
  const { t } = useLanguage();
  const [bannedUsers, setBannedUsers] = useState<BannedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [confirmTarget, setConfirmTarget] = useState<BannedUser | null>(null);
  const [unbanLoading, setUnbanLoading] = useState(false);
  const [restricted, setRestricted] = useState<MentionRestrictedMember[]>([]);

  const loadRestricted = useCallback(async () => {
    if (!canManageBans) return;
    try { const data = await getMentionRestrictedMembers(serverId); setRestricted(data); } catch { /* */ }
  }, [serverId, canManageBans]);

  const handleUnrestrict = async (memberId: string) => {
    try { await unrestrictMember(serverId, memberId); setRestricted((prev) => prev.filter((r) => r.userId !== memberId)); } catch { /* */ }
  };

  const loadBans = useCallback(async () => {
    try {
      setLoading(true); setError(null);
      const data = await getBannedUsers(serverId);
      setBannedUsers(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("chat.serverBans.loadFail"));
    } finally { setLoading(false); }
  }, [serverId, t]);

  useEffect(() => { loadBans(); loadRestricted(); }, [loadBans, loadRestricted]);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return bannedUsers;
    const q = searchQuery.toLowerCase().trim();
    return bannedUsers.filter((u) => u.username.toLowerCase().includes(q) || u.displayName.toLowerCase().includes(q) || u.userId.toLowerCase().includes(q));
  }, [bannedUsers, searchQuery]);

  const handleUnban = async () => {
    if (!confirmTarget) return;
    try {
      setUnbanLoading(true);
      await unbanMember(serverId, confirmTarget.userId);
      setBannedUsers((prev) => prev.filter((u) => u.userId !== confirmTarget.userId));
      setConfirmTarget(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("chat.serverBans.unbanFail"));
    } finally { setUnbanLoading(false); }
  };

  const getInitials = (name: string) => name.charAt(0).toUpperCase();

  return (
    <div className={styles.wrapper}>
      <p className={styles.desc}>
        {t("chat.serverBans.desc")}{" "}
        <span className={styles.descLink}>{t("chat.serverBans.moderation")}</span>.
      </p>

      <div className={styles.toolbar}>
        <input className={styles.searchInput} type="text" placeholder={t("chat.serverBans.searchPlaceholder")} value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }} />
        <button type="button" className={styles.searchBtn} onClick={() => {}}>
          {t("chat.serverBans.searchBtn")}
        </button>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.tableWrap}>
        {loading ? (
          <p className={styles.loading}>{t("chat.serverBans.loading")}</p>
        ) : filtered.length === 0 ? (
          <div className={styles.emptyState}>
            <svg className={styles.emptyIcon} viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="30" y="35" width="60" height="40" rx="8" fill="currentColor" opacity="0.15" />
              <rect x="38" y="42" width="44" height="6" rx="3" fill="currentColor" opacity="0.25" />
              <rect x="38" y="54" width="30" height="6" rx="3" fill="currentColor" opacity="0.2" />
              <line x1="25" y1="95" x2="95" y2="25" stroke="currentColor" strokeWidth="4" strokeLinecap="round" opacity="0.3" />
            </svg>
            <h3 className={styles.emptyTitle}>{t("chat.serverBans.noBansTitle")}</h3>
            <p className={styles.emptyDesc}>
              {searchQuery.trim() ? t("chat.serverBans.noBansSearch") : t("chat.serverBans.noBansDesc")}
            </p>
          </div>
        ) : (
          <>
            {filtered.map((user) => (
              <div key={user.userId} className={styles.banRow}>
                <div className={styles.avatar} style={user.avatarUrl ? { backgroundImage: `url(${user.avatarUrl})` } : undefined}>
                  {!user.avatarUrl && getInitials(user.displayName)}
                </div>
                <div className={styles.nameBlock}>
                  <span className={styles.displayName}>{user.displayName}</span>
                  <span className={styles.username}>@{user.username}</span>
                </div>
                {user.reason && <span className={styles.reason} title={user.reason}>{t("chat.serverBans.reason").replace("{reason}", user.reason)}</span>}
                {canManageBans && (
                  <button type="button" className={styles.unbanBtn} onClick={() => setConfirmTarget(user)}>{t("chat.serverBans.unbanBtn")}</button>
                )}
              </div>
            ))}
            <p className={styles.resultCount}>
              {t("chat.serverBans.resultCount").replace("{n}", String(filtered.length)).replace("{total}", String(bannedUsers.length))}
            </p>
          </>
        )}
      </div>

      {canManageBans && (
        <div className={styles.restrictedSection}>
          <h4 className={styles.restrictedTitle}>{t("chat.serverBans.restrictedTitle")}</h4>
          {restricted.length === 0 ? (
            <p className={styles.restrictedEmpty}>{t("chat.serverBans.restrictedEmpty")}</p>
          ) : restricted.map((m) => (
            <div key={m.userId} className={styles.restrictedRow}>
              {m.avatarUrl ? (
                <img src={m.avatarUrl} alt="" className={styles.restrictedAvatar} />
              ) : (
                <div className={styles.restrictedAvatar}>{(m.displayName || "?")[0].toUpperCase()}</div>
              )}
              <div className={styles.restrictedInfo}>
                <p className={styles.restrictedName}>{m.displayName}</p>
                <p className={styles.restrictedMeta}>
                  {m.mentionRestricted && t("chat.serverBans.restricted")}
                  {m.mentionBlockedUntil && <> · {t("chat.serverBans.mentionBlocked").replace("{date}", new Date(m.mentionBlockedUntil).toLocaleString())}</>}
                </p>
              </div>
              <button type="button" className={styles.unrestrictBtn} onClick={() => handleUnrestrict(m.userId)}>{t("chat.serverBans.unrestrictBtn")}</button>
            </div>
          ))}
        </div>
      )}

      {confirmTarget && (
        <div className={styles.confirmOverlay} onClick={() => !unbanLoading && setConfirmTarget(null)}>
          <div className={styles.confirmModal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.confirmTitle}>{t("chat.serverBans.confirmTitle")}</h3>
            <p className={styles.confirmText}>
              {t("chat.serverBans.confirmDesc").replace("{name}", confirmTarget.displayName).replace("{username}", confirmTarget.username)}
            </p>
            <div className={styles.confirmFooter}>
              <button type="button" className={styles.confirmCancel} onClick={() => setConfirmTarget(null)} disabled={unbanLoading}>{t("chat.serverBans.confirmCancel")}</button>
              <button type="button" className={styles.confirmSubmit} onClick={handleUnban} disabled={unbanLoading}>
                {unbanLoading ? t("chat.serverBans.confirming") : t("chat.serverBans.confirmSubmit")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
