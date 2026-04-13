"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import * as serversApi from "@/lib/servers-api";
import { blockUser, ignoreUser } from "@/lib/api";
import MemberProfilePopup from "@/components/MemberProfilePopup/MemberProfilePopup";
import IgnoreUserPopup from "@/components/IgnoreUserPopup/IgnoreUserPopup";
import ModeratorViewToggle from "@/components/ModeratorViewToggle/ModeratorViewToggle";
import MemberDataGrid from "@/components/MemberDataGrid/MemberDataGrid";
import MemberDetailsPanel from "@/components/MemberDetailsPanel/MemberDetailsPanel";
import { useModeratorView } from "@/hooks/use-moderator-view";
import * as memberList from "@/lib/member-list-logic";
import type { ModeratorMemberRow } from "@/lib/mod-view-api";
import styles from "./ServerMembersSection.module.css";
import { useLanguage } from "@/component/language-provider";

interface ExtendedMember extends serversApi.MemberWithRoles {
  joinedCordigramAt?: string;
  invitedBy?: { id: string; username: string };
  role?: string;
}

function normalizeMemberRow(m: unknown): ExtendedMember {
  const rec = m as Record<string, unknown>;
  const isOwner = Boolean(rec.isOwner);
  const rawNick = typeof rec.nickname === "string" ? rec.nickname.trim() : "";
  const nickname = rawNick ? rawNick : null;
  const baseDisplayName = typeof rec.displayName === "string" ? rec.displayName : "";
  return {
    ...(m as unknown as ExtendedMember),
    nickname,
    displayName: nickname || baseDisplayName || (typeof rec.username === "string" ? rec.username : "?"),
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

export interface ServerMembersSectionProps {
  serverId: string;
  isOwner: boolean;
  currentUserId: string;
  token: string | null;
  onNavigateToDM?: (userId: string, displayName: string, username: string, avatarUrl?: string) => void;
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
  const { t } = useLanguage();
  const [members, setMembers] = useState<ExtendedMember[]>([]);
  const [permissions, setPermissions] = useState<{ canKick: boolean; canBan: boolean; canTimeout: boolean; isOwner: boolean }>({
    canKick: false, canBan: false, canTimeout: false, isOwner: false,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<memberList.SortKey>("joinedAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [listFilters, setListFilters] = useState<memberList.MemberListFilters>({ serverRole: "all", newAccountOnly: false, spamOnly: false });
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
  const [moderationModal, setModerationModal] = useState<{ action: "kick" | "ban" | "timeout" | null; member: ExtendedMember | null }>({ action: null, member: null });
  const [moderationReason, setModerationReason] = useState("");
  const [timeoutDuration, setTimeoutDuration] = useState(60);
  const [moderationLoading, setModerationLoading] = useState(false);

  const TIMEOUT_DURATIONS = useMemo(() => [
    { label: t("chat.serverMembers.timeout60s"), seconds: 60 },
    { label: t("chat.serverMembers.timeout5m"),  seconds: 5 * 60 },
    { label: t("chat.serverMembers.timeout10m"), seconds: 10 * 60 },
    { label: t("chat.serverMembers.timeout1h"),  seconds: 60 * 60 },
    { label: t("chat.serverMembers.timeout1d"),  seconds: 24 * 60 * 60 },
    { label: t("chat.serverMembers.timeout1w"),  seconds: 7 * 24 * 60 * 60 },
  ], [t]);

  const canEnableModView = permissions.isOwner || permissions.canKick;
  const moderatorView = useModeratorView({ serverId, canEnable: canEnableModView });

  const fetchMembers = useCallback(async () => {
    if (!serverId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await serversApi.getServerMembersWithRoles(serverId);
      setMembers(response.members.map((m) => normalizeMemberRow(m)));
      setPermissions(response.currentUserPermissions);
    } catch {
      try {
        const oldList = await serversApi.getServerMembers(serverId);
        const converted: ExtendedMember[] = oldList.map((m) =>
          normalizeMemberRow({
            userId: m.userId, displayName: m.displayName, username: m.username, avatarUrl: m.avatarUrl,
            joinedAt: m.joinedAt, joinedCordigramAt: m.joinedCordigramAt, joinMethod: m.joinMethod ?? "link",
            invitedBy: m.invitedBy, isOwner: m.role === "owner",
            serverMemberRole: m.role === "owner" ? "owner" : m.role === "moderator" ? "moderator" : "member",
            roles: [], highestRolePosition: 0, displayColor: "#99AAB5", role: m.role,
            accountCreatedAt: m.joinedCordigramAt ?? m.joinedAt,
            accountAgeDays: 0, messagesLast10Min: 0, messagesLast30d: 0, lastMessageAt: null, isOnline: false,
          }),
        );
        setMembers(converted);
        setPermissions({ canKick: isOwner, canBan: isOwner, canTimeout: isOwner, isOwner });
      } catch (fallbackErr) {
        setError(fallbackErr instanceof Error ? fallbackErr.message : t("chat.serverMembers.loadFail"));
      }
    } finally {
      setLoading(false);
    }
  }, [serverId, isOwner, t]);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  useEffect(() => {
    if (!filterModalOpen) return;
    if (!filterDays) { setPruneCount(null); setPruneError(null); return; }
    let cancelled = false;
    setPruneLoading(true);
    setPruneError(null);
    serversApi.getPruneCount({ serverId, days: filterDays, role: filterRole })
      .then((count) => { if (!cancelled) setPruneCount(count); })
      .catch((err) => { if (!cancelled) { setPruneCount(null); setPruneError(err instanceof Error ? err.message : t("chat.serverMembers.filterError")); } })
      .finally(() => { if (!cancelled) setPruneLoading(false); });
    return () => { cancelled = true; };
  }, [filterModalOpen, filterDays, filterRole, serverId, t]);

  const processedMembers = useMemo(() => {
    let list = memberList.filterMembersBySearch(members, search);
    list = memberList.filterMembersByAdvanced(list, listFilters);
    list = memberList.applyChannelListSidebar(list, showInChannelList);
    return memberList.sortMembers(list, sortBy, sortOrder);
  }, [members, search, listFilters, showInChannelList, sortBy, sortOrder]);

  const canAffectMember = (target: ExtendedMember): boolean => {
    if (target.userId === currentUserId) return false;
    if (target.isOwner) return false;
    if (permissions.isOwner) return true;
    const currentMember = members.find((m) => m.userId === currentUserId);
    if (!currentMember) return false;
    return currentMember.highestRolePosition > target.highestRolePosition;
  };

  const openModerationModal = (action: "kick" | "ban" | "timeout", member: ExtendedMember) => {
    setModerationModal({ action, member });
    setModerationReason("");
    setTimeoutDuration(TIMEOUT_DURATIONS[0].seconds);
    setMemberMenu(null);
  };

  const closeModerationModal = () => { setModerationModal({ action: null, member: null }); setModerationReason(""); };

  const executeModerationAction = async () => {
    if (!moderationModal.member || !moderationModal.action) return;
    setModerationLoading(true);
    try {
      const { member, action } = moderationModal;
      if (action === "kick") await serversApi.kickMember(serverId, member.userId, moderationReason || undefined);
      else if (action === "ban") await serversApi.banMember(serverId, member.userId, moderationReason || undefined);
      else await serversApi.timeoutMember(serverId, member.userId, timeoutDuration, moderationReason || undefined);
      await fetchMembers();
      closeModerationModal();
    } catch (err) {
      alert(err instanceof Error ? err.message : t("chat.serverMembers.moderateFail"));
    } finally {
      setModerationLoading(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === processedMembers.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(processedMembers.map((r) => r.userId)));
  };
  const toggleSelect = (userId: string) => {
    setSelectedIds((prev) => { const next = new Set(prev); if (next.has(userId)) next.delete(userId); else next.add(userId); return next; });
  };

  const renderRoleBadges = (member: ExtendedMember) => {
    if (member.roles && member.roles.length > 0) {
      return (
        <div className={styles.roleBadges}>
          {member.roles.map((role) => (
            <span key={role._id} className={styles.roleBadge} style={{ backgroundColor: role.color }} title={role.name}>{role.name}</span>
          ))}
        </div>
      );
    }
    if (member.isOwner) return <span className={styles.ownerBadge}>{t("chat.serverMembers.ownerBadge")}</span>;
    if (member.role === "moderator") return <span className={styles.modBadge}>{t("chat.serverMembers.modBadge")}</span>;
    return <span className={styles.memberBadge}>{t("chat.serverMembers.memberBadge")}</span>;
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.toggleRow}>
        <span className={styles.toggleLabel}>{t("chat.serverMembers.showInChannelLabel")}</span>
        <button type="button" role="switch" aria-checked={showInChannelList} className={styles.toggle} onClick={() => setShowInChannelList((v) => !v)}>
          <span className={styles.toggleTrack}><span className={styles.toggleThumb} data-on={showInChannelList} /></span>
        </button>
      </div>
      <p className={styles.desc}>{t("chat.serverMembers.showInChannelDesc")}</p>

      <h3 className={styles.sectionTitle}>{t("chat.serverMembers.searchResults")}</h3>
      <div className={styles.toolbar}>
        <input type="text" className={styles.search} placeholder={t("chat.serverMembers.searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className={styles.toolbarRight}>
          <button type="button" className={styles.sortButton} onClick={() => setSortMenuOpen((open) => !open)}>
            <span className={styles.sortButtonIcon} />
            <span>{t("chat.serverMembers.sortBtn")}</span>
          </button>
          {sortMenuOpen && (
            <div className={styles.sortMenu} role="menu">
              {[
                { key: "joinedAt-desc", label: t("chat.serverMembers.sortNewest"),  sk: "joinedAt" as const, so: "desc" as const },
                { key: "joinedAt-asc",  label: t("chat.serverMembers.sortOldest"),  sk: "joinedAt" as const, so: "asc"  as const },
                { key: "username-asc",  label: t("chat.serverMembers.sortUsername"),sk: "username" as const, so: "asc"  as const },
                { key: "activity-desc", label: t("chat.serverMembers.sortActivity"),sk: "activity" as const, so: "desc" as const },
              ].map((item) => (
                <button key={item.key} type="button"
                  className={`${styles.sortMenuItem} ${sortBy === item.sk && sortOrder === item.so ? styles.sortMenuItemActive : ""}`}
                  onClick={() => { setSortBy(item.sk); setSortOrder(item.so); setSortMenuOpen(false); }}
                >
                  <span>{item.label}</span>
                  <span className={`${styles.sortMenuDot} ${sortBy === item.sk && sortOrder === item.so ? styles.sortMenuDotActive : ""}`} />
                </button>
              ))}
              <div className={styles.sortMenuDivider} />
              <div className={styles.sortMenuLabel}>{t("chat.serverMembers.filterLabel")}</div>
              <button type="button" className={`${styles.sortMenuItem} ${listFilters.newAccountOnly ? styles.sortMenuItemActive : ""}`} onClick={() => setListFilters((f) => ({ ...f, newAccountOnly: !f.newAccountOnly }))}>
                <span>{t("chat.serverMembers.filterNewAccount")}</span>
                <span className={`${styles.sortMenuDot} ${listFilters.newAccountOnly ? styles.sortMenuDotActive : ""}`} />
              </button>
              <button type="button" className={`${styles.sortMenuItem} ${listFilters.spamOnly ? styles.sortMenuItemActive : ""}`} onClick={() => setListFilters((f) => ({ ...f, spamOnly: !f.spamOnly }))}>
                <span>{t("chat.serverMembers.filterSpam")}</span>
                <span className={`${styles.sortMenuDot} ${listFilters.spamOnly ? styles.sortMenuDotActive : ""}`} />
              </button>
              <div className={styles.sortMenuDivider} />
              <div className={styles.sortMenuLabel}>{t("chat.serverMembers.roleLabel")}</div>
              <div className={styles.sortMenuItem}>
                <select className={styles.sortSelect} value={listFilters.serverRole} title={t("chat.serverMembers.roleLabel")}
                  onChange={(e) => setListFilters((f) => ({ ...f, serverRole: e.target.value as memberList.MemberListFilters["serverRole"] }))}>
                  <option value="all">{t("chat.serverMembers.roleAll")}</option>
                  <option value="owner">{t("chat.serverMembers.roleOwner")}</option>
                  <option value="moderator">{t("chat.serverMembers.roleModerator")}</option>
                  <option value="member">{t("chat.serverMembers.roleMember")}</option>
                </select>
              </div>
            </div>
          )}
          {isOwner && (
            <button type="button" className={styles.btnSecondary} onClick={() => setFilterModalOpen(true)}>
              {t("chat.serverMembers.pruneBtn")}
            </button>
          )}
        </div>
      </div>

      {error && <p className={styles.error}>{error}</p>}
      {loading && <p className={styles.loading}>{t("chat.serverMembers.loading")}</p>}

      {!loading && !error && !moderatorView.enabled && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.thCheck}>
                  <input type="checkbox" checked={processedMembers.length > 0 && selectedIds.size === processedMembers.length} onChange={toggleSelectAll} aria-label={t("chat.serverMembers.colCheck")} />
                </th>
                <th className={styles.thName}>{t("chat.serverMembers.colName")}</th>
              </tr>
            </thead>
            <tbody>
              {processedMembers.map((row) => (
                <tr key={row.userId} className={styles.row}>
                  <td className={styles.tdCheck}>
                    <input type="checkbox" checked={selectedIds.has(row.userId)} onChange={() => toggleSelect(row.userId)} aria-label={`${t("chat.serverMembers.colCheck")} ${row.displayName || row.username}`} />
                  </td>
                  <td className={styles.tdName}>
                    <div className={styles.avatar} style={{ backgroundImage: row.avatarUrl ? `url(${row.avatarUrl})` : undefined, backgroundColor: !row.avatarUrl ? "#5865f2" : undefined }}>
                      {!row.avatarUrl && <span>{(row.displayName || row.username || "?").charAt(0).toUpperCase()}</span>}
                    </div>
                    <div className={styles.nameBlock}>
                      <span className={styles.displayName} style={{ color: row.displayColor || "#fff" }}>
                        {row.displayName || row.username}{row.isOwner && <span className={styles.ownerCrown}> 👑</span>}
                      </span>
                      <span className={styles.username}>{row.username}</span>
                    </div>
                    {!row.isOwner && (
                      <button type="button" className={styles.iconBtn} title={t("chat.serverMembers.memberOptions")} aria-label={t("chat.serverMembers.memberOptions")}
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); const rect = (e.currentTarget as HTMLElement).getBoundingClientRect(); setMemberMenu({ row, x: rect.left, y: rect.bottom + 4 }); }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                          <circle cx="12" cy="6" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="18" r="1.5" />
                        </svg>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className={styles.resultCount}>
            {t("chat.serverMembers.resultCount").replace("{n}", String(processedMembers.length))}
            {showInChannelList ? t("chat.serverMembers.resultCountCapped") : ""}
          </p>
        </div>
      )}

      {!loading && !error && moderatorView.enabled && (
        <div className={styles.modViewLayout}>
          <div className={styles.modViewGrid}>
            <MemberDataGrid rows={processedMembers.map(toModeratorGridRow)} loading={false} onRowClick={(r) => moderatorView.loadDetail(r.userId)} />
          </div>
          {(moderatorView.detail || moderatorView.detailLoading) && (
            <div className={styles.modViewPanel}>
              <MemberDetailsPanel detail={moderatorView.detail} loading={moderatorView.detailLoading} error={moderatorView.detailError} onClose={() => moderatorView.loadDetail("")} />
            </div>
          )}
        </div>
      )}

      <div className={styles.modViewToggleWrap}>
        <ModeratorViewToggle enabled={moderatorView.enabled} canEnable={moderatorView.canEnable} onChange={(next) => moderatorView.setEnabled(next)} />
      </div>

      {filterModalOpen && (
        <div className={styles.filterOverlay} role="dialog" aria-modal>
          <div className={styles.filterModal}>
            <div className={styles.filterHeader}>
              <h3 className={styles.filterTitle}>{t("chat.serverMembers.filterTitle")}</h3>
              <button type="button" className={styles.filterClose} onClick={() => setFilterModalOpen(false)} aria-label={t("chat.serverMembers.filterClose")}>×</button>
            </div>
            <div className={styles.filterBody}>
              <div className={styles.filterGroup}>
                <div className={styles.filterLabel}>{t("chat.serverMembers.filterLastSeen")}</div>
                <label className={styles.radioRow}><input type="radio" name="days" checked={filterDays === 7} onChange={() => setFilterDays(7)} /><span>{t("chat.serverMembers.filterDays7")}</span></label>
                <label className={styles.radioRow}><input type="radio" name="days" checked={filterDays === 30} onChange={() => setFilterDays(30)} /><span>{t("chat.serverMembers.filterDays30")}</span></label>
              </div>
              <div className={styles.filterGroup}>
                <div className={styles.filterLabel}>{t("chat.serverMembers.filterIncludeRole")}</div>
                <select className={styles.filterSelect} value={filterRole} onChange={(e) => setFilterRole(e.target.value as typeof filterRole)}>
                  <option value="all">{t("chat.serverMembers.filterRoleAll")}</option>
                  <option value="none">{t("chat.serverMembers.filterRoleNone")}</option>
                  <option value="member">{t("chat.serverMembers.filterRoleMember")}</option>
                  <option value="moderator">{t("chat.serverMembers.filterRoleMod")}</option>
                </select>
              </div>
              <p className={styles.filterHint}>{t("chat.serverMembers.filterHint")}</p>
              <div className={styles.filterHint} style={{ marginTop: -4 }}>
                {pruneError ? <span style={{ color: "#f23f43" }}>{pruneError}</span>
                  : pruneCount == null ? <span>{t("chat.serverMembers.filterSelectHint")}</span>
                  : <span>{t("chat.serverMembers.filterPreview").replace("{n}", String(pruneCount))}</span>}
              </div>
            </div>
            <div className={styles.filterFooter}>
              <button type="button" className={styles.filterCancel} onClick={() => setFilterModalOpen(false)}>{t("chat.serverMembers.filterCancel")}</button>
              <button type="button" className={styles.filterApply} disabled={!filterDays || pruneLoading || !pruneCount}
                onClick={async () => {
                  if (!filterDays) return;
                  setPruneError(null); setPruneLoading(true);
                  try {
                    const count = pruneCount ?? (await serversApi.getPruneCount({ serverId, days: filterDays, role: filterRole }));
                    if (count <= 0) { setPruneCount(0); return; }
                    const ok = window.confirm(t("chat.serverMembers.filterConfirm").replace("{n}", String(count)).replace("{days}", String(filterDays)));
                    if (!ok) return;
                    const removed = await serversApi.pruneMembers({ serverId, days: filterDays, role: filterRole });
                    await fetchMembers(); setFilterModalOpen(false); setPruneCount(null);
                    alert(t("chat.serverMembers.filterDone").replace("{n}", String(removed)));
                  } catch (err) {
                    setPruneError(err instanceof Error ? err.message : t("chat.serverMembers.filterError"));
                  } finally { setPruneLoading(false); }
                }}>
                {pruneLoading ? t("chat.serverMembers.filterApplying") : t("chat.serverMembers.filterApply")}
              </button>
            </div>
          </div>
        </div>
      )}

      {memberMenu && (
        <>
          <div className={styles.menuBackdrop} onClick={() => setMemberMenu(null)} />
          <div className={styles.simpleMenu} style={{ left: Math.min(memberMenu.x, typeof window !== "undefined" ? window.innerWidth - 200 : memberMenu.x), top: memberMenu.y }}>
            <button type="button" className={styles.simpleMenuItem} onClick={() => { setProfileMember(memberMenu.row); setMemberMenu(null); }}>
              {t("chat.serverMembers.menuProfile")}
            </button>
            <button type="button" className={styles.simpleMenuItem} onClick={() => { onNavigateToDM?.(memberMenu.row.userId, memberMenu.row.displayName || memberMenu.row.username, memberMenu.row.username, memberMenu.row.avatarUrl); setMemberMenu(null); }}>
              {t("chat.serverMembers.menuMessage")}
            </button>
            {canAffectMember(memberMenu.row) && (permissions.canTimeout || permissions.canKick || permissions.canBan) && (
              <>
                <div style={{ height: 1, background: "var(--color-panel-border)", margin: "6px 8px" }} />
                {permissions.canTimeout && (
                  <button type="button" className={styles.simpleMenuItem} style={{ color: "var(--color-panel-warning)" }} onClick={() => openModerationModal("timeout", memberMenu.row)}>
                    {t("chat.serverMembers.menuTimeout").replace("{name}", memberMenu.row.username)}
                  </button>
                )}
                {permissions.canKick && (
                  <button type="button" className={styles.simpleMenuItem} style={{ color: "var(--color-panel-danger)" }} onClick={() => openModerationModal("kick", memberMenu.row)}>
                    {t("chat.serverMembers.menuKick").replace("{name}", memberMenu.row.username)}
                  </button>
                )}
                {permissions.canBan && (
                  <button type="button" className={styles.simpleMenuItem} style={{ color: "var(--color-panel-danger)" }} onClick={() => openModerationModal("ban", memberMenu.row)}>
                    {t("chat.serverMembers.menuBan").replace("{name}", memberMenu.row.username)}
                  </button>
                )}
              </>
            )}
          </div>
        </>
      )}

      {moderationModal.action && moderationModal.member && (
        <div className={styles.filterOverlay} role="dialog" aria-modal onClick={closeModerationModal}>
          <div className={styles.filterModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.filterHeader}>
              <h3 className={styles.filterTitle}>
                {moderationModal.action === "kick" && t("chat.serverMembers.moderateKickTitle").replace("{name}", moderationModal.member.displayName || moderationModal.member.username)}
                {moderationModal.action === "ban"  && t("chat.serverMembers.moderateBanTitle").replace("{name}", moderationModal.member.displayName || moderationModal.member.username)}
                {moderationModal.action === "timeout" && t("chat.serverMembers.moderateTimeoutTitle").replace("{name}", moderationModal.member.displayName || moderationModal.member.username)}
              </h3>
              <button type="button" className={styles.filterClose} onClick={closeModerationModal} aria-label={t("chat.serverMembers.filterClose")}>×</button>
            </div>
            <div className={styles.filterBody}>
              <p className={styles.moderationDesc}>
                {moderationModal.action === "kick" && t("chat.serverMembers.kickDesc")}
                {moderationModal.action === "ban"  && t("chat.serverMembers.banDesc")}
                {moderationModal.action === "timeout" && t("chat.serverMembers.timeoutDesc")}
              </p>
              {moderationModal.action === "timeout" && (
                <div className={styles.filterGroup}>
                  <div className={styles.filterLabel}>{t("chat.serverMembers.timeoutDuration")}</div>
                  <select className={styles.filterSelect} value={timeoutDuration} onChange={(e) => setTimeoutDuration(Number(e.target.value))}>
                    {TIMEOUT_DURATIONS.map((opt) => <option key={opt.seconds} value={opt.seconds}>{opt.label}</option>)}
                  </select>
                </div>
              )}
              <div className={styles.filterGroup}>
                <div className={styles.filterLabel}>{t("chat.serverMembers.reason")}</div>
                <textarea className={styles.reasonInput} value={moderationReason} onChange={(e) => setModerationReason(e.target.value)} placeholder={t("chat.serverMembers.reasonPlaceholder")} rows={3} />
              </div>
            </div>
            <div className={styles.filterFooter}>
              <button type="button" className={styles.filterCancel} onClick={closeModerationModal} disabled={moderationLoading}>{t("chat.serverMembers.moderateCancel")}</button>
              <button type="button" className={moderationModal.action === "timeout" ? styles.filterApply : styles.transferConfirmBtn} onClick={executeModerationAction} disabled={moderationLoading}>
                {moderationLoading ? t("chat.serverMembers.moderateApplying") : (
                  moderationModal.action === "kick" ? t("chat.serverMembers.kick") :
                  moderationModal.action === "ban"  ? t("chat.serverMembers.ban") :
                  t("chat.serverMembers.timeout")
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {transferConfirmMember && (
        <div className={styles.filterOverlay} role="dialog" aria-modal aria-labelledby="transfer-title" onClick={() => !transferring && setTransferConfirmMember(null)}>
          <div className={styles.filterModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.filterHeader}>
              <h3 id="transfer-title" className={styles.filterTitle}>{t("chat.serverMembers.transferTitle")}</h3>
              <button type="button" className={styles.filterClose} onClick={() => setTransferConfirmMember(null)} aria-label={t("chat.serverMembers.filterClose")}>×</button>
            </div>
            <div className={styles.filterBody}>
              <p className={styles.transferText}>
                {t("chat.serverMembers.transferDesc").replace("{name}", transferConfirmMember.displayName || transferConfirmMember.username)}
              </p>
            </div>
            <div className={styles.filterFooter}>
              <button type="button" className={styles.filterCancel} onClick={() => setTransferConfirmMember(null)}>{t("chat.serverMembers.transferCancel")}</button>
              <button type="button" className={styles.transferConfirmBtn} disabled={transferring}
                onClick={async () => {
                  if (!serverId || !transferConfirmMember) return;
                  setTransferring(true);
                  try {
                    await serversApi.transferServerOwnership(serverId, transferConfirmMember.userId);
                    setTransferConfirmMember(null); onOwnershipTransferred?.();
                  } catch (err) {
                    alert(err instanceof Error ? err.message : t("chat.serverMembers.transferFail"));
                  } finally { setTransferring(false); }
                }}>
                {transferring ? t("chat.serverMembers.transferApplying") : t("chat.serverMembers.transferBtn")}
              </button>
            </div>
          </div>
        </div>
      )}

      {profileMember && (
        <MemberProfilePopup member={profileMember} currentUserId={currentUserId} token={token} serverJoinDate={profileMember.joinedAt} onClose={() => setProfileMember(null)}
          onMessage={() => { onNavigateToDM?.(profileMember.userId, profileMember.displayName || profileMember.username, profileMember.username, profileMember.avatarUrl); setProfileMember(null); }} />
      )}

      {ignoreMember && (
        <IgnoreUserPopup displayName={ignoreMember.displayName || ignoreMember.username} userId={ignoreMember.userId} token={token ?? undefined}
          onClose={() => setIgnoreMember(null)}
          onConfirm={async () => {
            if (!token || !ignoreMember) return;
            try { await ignoreUser({ token, userId: ignoreMember.userId }); } catch {}
            setIgnoreMember(null);
          }}
          onBlock={async () => {
            if (!token) return;
            try { await blockUser({ token, userId: ignoreMember.userId }); setMembers((prev) => prev.filter((m) => m.userId !== ignoreMember.userId)); } catch {}
            setIgnoreMember(null);
          }}
          onRestore={() => setIgnoreMember(null)}
        />
      )}
    </div>
  );
}
