"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./community-discovery.module.css";
import { getApiBaseUrl } from "@/lib/api";

type AdminPayload = { roles?: string[]; exp?: number };

type ChannelInfo = { id: string; name: string; type: string };

type CategoryGroup = {
  categoryId: string;
  categoryName: string;
  channels: ChannelInfo[];
};

type SafetyInfo = {
  hasAutoMod: boolean;
  hasContentFilter: boolean;
  hasSafetyFullyConfigured: boolean;
  verificationLevel: string;
  contentFilterLevel: string;
  bannedWordsCount: number;
};

type CommunityServer = {
  id: string;
  name: string;
  description: string | null;
  avatarUrl: string | null;
  owner: { id: string; displayName: string | null; username: string | null };
  communityDiscoveryStatus?: "pending" | "approved" | "rejected" | "removed";
  memberCount: number;
  totalChannels: number;
  channelsByCategory: CategoryGroup[];
  uncategorizedChannels: ChannelInfo[];
  accessMode: string;
  communityActivatedAt: string | null;
  safety: SafetyInfo;
  hasAbnormalActivity: boolean;
  createdAt: string;
};

type HistoryItem = {
  _id: string;
  serverId: string;
  action: "approve" | "reject" | "remove" | "restore";
  note?: string | null;
  createdAt: string;
  serverSnapshot?: {
    name?: string;
    memberCount?: number;
    accessMode?: string;
    communityActivatedAt?: string | null;
  };
  serverDeleted?: boolean;
  deletedAt?: string | null;
  deletedBy?: { id: string; email?: string | null } | null;
  canRestoreServer?: boolean;
};

const decodeJwt = (token: string): AdminPayload | null => {
  try {
    const payload = token.split(".")[1];
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as AdminPayload;
  } catch { return null; }
};

const fmtDate = (value: string | null | undefined) => {
  if (!value) return "--";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "--";
  return d.toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
};

export default function CommunityDiscoveryPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"review" | "remove" | "history">("review");
  const [servers, setServers] = useState<CommunityServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"activated_desc" | "activated_asc" | "created_desc" | "created_asc">("activated_desc");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [joinConfirm, setJoinConfirm] = useState<CommunityServer | null>(null);
  const [approvalLoadingId, setApprovalLoadingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [historyActionFilter, setHistoryActionFilter] = useState<"all" | "approve" | "reject" | "remove" | "restore">("all");
  const [historySearch, setHistorySearch] = useState("");
  const [historySort, setHistorySort] = useState<"action_desc" | "action_asc" | "activated_desc" | "activated_asc">("action_desc");
  const [historyDetail, setHistoryDetail] = useState<{ serverId: string; serverName: string } | null>(null);

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("adminAccessToken") : null;
    if (!token) { router.replace("/login"); return; }
    const decoded = decodeJwt(token);
    if (!decoded?.roles?.includes("admin")) { router.replace("/login"); return; }
    if (decoded.exp && decoded.exp * 1000 < Date.now()) { router.replace("/login"); return; }
    void loadServers(token, "pending");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("adminAccessToken") : null;
    if (!token) return;
    const status = tab === "review" ? "pending" : tab === "remove" ? "approved" : "all";
    const t = setInterval(() => {
      if (tab === "history") return;
      void loadServers(token, status);
    }, 12000);
    return () => clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const loadServers = async (token: string, status: "all" | "pending" | "approved" | "rejected" | "removed") => {
    setLoading(true);
    setError(null);
    try {
      const url = new URL(`${getApiBaseUrl()}/admin/community-discovery`);
      url.searchParams.set("status", status);
      if (search.trim()) url.searchParams.set("q", search.trim());
      if (sort) url.searchParams.set("sort", sort);
      const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setServers(await res.json() as CommunityServer[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally { setLoading(false); }
  };

  const loadHistory = async (opts?: { serverId?: string }) => {
    const token = localStorage.getItem("adminAccessToken") || "";
    if (!token) return;
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const url = new URL(`${getApiBaseUrl()}/admin/community-discovery/history`);
      if (opts?.serverId) url.searchParams.set("serverId", opts.serverId);
      if (historySearch.trim()) url.searchParams.set("q", historySearch.trim());
      if (historySort) url.searchParams.set("sort", historySort);
      const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { const t = await res.text().catch(() => ""); throw new Error(t || `HTTP ${res.status}`); }
      const data = await res.json() as { items?: HistoryItem[] };
      setHistoryItems(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      setHistoryError(e instanceof Error ? e.message : "Failed");
      setHistoryItems([]);
    } finally { setHistoryLoading(false); }
  };

  const updateApproval = async (srv: CommunityServer, status: "approved" | "rejected") => {
    const token = localStorage.getItem("adminAccessToken") || "";
    if (!token) return;
    try {
      setApprovalLoadingId(srv.id);
      const res = await fetch(
        `${getApiBaseUrl()}/admin/community-discovery/${srv.id}/${status === "approved" ? "approve" : "reject"}`,
        { method: "POST", headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        let msg = `HTTP ${res.status}`;
        try { const p = text ? JSON.parse(text) : null; msg = p?.message ? String(p.message) : msg; } catch { if (text) msg = text; }
        throw new Error(msg);
      }
      setServers((prev) => prev.map((s) => (s.id === srv.id ? { ...s, communityDiscoveryStatus: status } : s)));
      showToast("success", status === "approved" ? "Approved." : "Rejected.");
      void loadServers(token, "pending");
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Could not update.");
    } finally { setApprovalLoadingId((c) => (c === srv.id ? null : c)); }
  };

  const removeFromDiscovery = async (srv: CommunityServer) => {
    const token = localStorage.getItem("adminAccessToken") || "";
    if (!token) return;
    try {
      setApprovalLoadingId(srv.id);
      const res = await fetch(`${getApiBaseUrl()}/admin/community-discovery/${srv.id}/remove`,
        { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { const text = await res.text().catch(() => ""); throw new Error(text || `HTTP ${res.status}`); }
      setServers((prev) => prev.map((s) => (s.id === srv.id ? { ...s, communityDiscoveryStatus: "removed" } : s)));
      showToast("success", "Removed from Discovery.");
      void loadServers(token, "approved");
    } catch (e) { showToast("error", e instanceof Error ? e.message : "Could not remove."); }
    finally { setApprovalLoadingId((c) => (c === srv.id ? null : c)); }
  };

  const restoreDiscovery = async (serverId: string) => {
    const token = localStorage.getItem("adminAccessToken") || "";
    if (!token) return;
    try {
      setApprovalLoadingId(serverId);
      const res = await fetch(`${getApiBaseUrl()}/admin/community-discovery/${serverId}/restore`,
        { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { const text = await res.text().catch(() => ""); throw new Error(text || `HTTP ${res.status}`); }
      showToast("success", "Discovery restored.");
      await loadServers(token, "all");
      await loadHistory({ serverId });
    } catch (e) { showToast("error", e instanceof Error ? e.message : "Could not restore."); }
    finally { setApprovalLoadingId((c) => (c === serverId ? null : c)); }
  };

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3500);
  };

  const totalMembers = servers.reduce((s, srv) => s + srv.memberCount, 0);
  const fullyConfigured = servers.filter((s) => s.safety.hasSafetyFullyConfigured).length;

  const TABS = [
    { value: "review",  label: "Review (Pending)" },
    { value: "remove",  label: "Remove from Discovery" },
    { value: "history", label: "History" },
  ] as const;

  const ACTION_BADGE: Record<HistoryItem["action"], string> = {
    approve: "Approve",
    reject:  "Reject",
    remove:  "Remove",
    restore: "Restore",
  };

  return (
    <div className={styles.page}>
      <div className={styles.shell}>

        {/* ── Toast ── */}
        {toast ? (
          <div className={styles.toastWrap}>
            <div className={`${styles.toast} ${toast.type === "success" ? styles.toastSuccess : styles.toastError}`}
              role="status">
              <span>{toast.message}</span>
              <button type="button" className={styles.toastClose} onClick={() => setToast(null)}>
                <svg viewBox="0 0 16 16" fill="none" aria-label="Close">
                  <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </div>
        ) : null}

        {/* ── Header ── */}
        <header className={styles.topbar}>
          <div>
            <h1 className={styles.title}>Community Discovery</h1>
            <p className={styles.subtitle}>
              Manage and review servers with Community enabled. Check details and join as an observer in read-only mode.
            </p>
          </div>
        </header>

        {/* ── Tab chips ── */}
        <div className={styles.tabRow}>
          {TABS.map(({ value, label }) => (
            <button key={value} type="button"
              className={`${styles.tab} ${tab === value ? styles.tabActive : ""} ${
                value === "review"  && tab === value ? styles.tabPending  :
                value === "remove"  && tab === value ? styles.tabRemove   :
                value === "history" && tab === value ? styles.tabHistory  : ""
              }`}
              onClick={() => {
                setTab(value);
                const token = localStorage.getItem("adminAccessToken") || "";
                if (value === "history") { void loadHistory(); }
                else if (token) { void loadServers(token, value === "review" ? "pending" : "approved"); }
              }}>
              {label}
            </button>
          ))}
        </div>

        {/* ── KPI strip ── */}
        <section className={styles.kpiRow}>
          <article className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Community servers</span>
            <span className={styles.kpiValue}>{servers.length}</span>
          </article>
          <article className={`${styles.kpiCard} ${styles.kpiMembers}`}>
            <span className={styles.kpiLabel}>Total members</span>
            <span className={styles.kpiValue}>{totalMembers}</span>
          </article>
          <article className={`${styles.kpiCard} ${styles.kpiSafety}`}>
            <span className={styles.kpiLabel}>Safety configured</span>
            <span className={styles.kpiValue}>{fullyConfigured}</span>
          </article>
          <article className={`${styles.kpiCard} ${styles.kpiAutomod}`}>
            <span className={styles.kpiLabel}>AutoMod enabled</span>
            <span className={styles.kpiValue}>{servers.filter((s) => s.safety.hasAutoMod).length}</span>
          </article>
        </section>

        {error ? <div className={styles.errorBanner}>{error}</div> : null}

        {/* ── Main panel: review / remove tabs ── */}
        {(tab === "review" || tab === "remove") ? (
          <section className={styles.panel}>
            {/* Controls */}
            <div className={styles.controlsRow}>
              <input
                className={styles.searchInput}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by server name or ID…"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const token = localStorage.getItem("adminAccessToken") || "";
                    if (token) void loadServers(token, tab === "review" ? "pending" : "approved");
                  }
                }}
              />
              <select className={styles.nativeSelect} value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} title="Sort">
                <option value="activated_desc">Activated: Newest</option>
                <option value="activated_asc">Activated: Oldest</option>
                <option value="created_desc">Created: Newest</option>
                <option value="created_asc">Created: Oldest</option>
              </select>
              <button type="button" className={styles.searchBtn}
                onClick={() => {
                  const token = localStorage.getItem("adminAccessToken") || "";
                  if (token) void loadServers(token, tab === "review" ? "pending" : "approved");
                }}>
                Search
              </button>
            </div>

            {loading ? (
              <div className={styles.emptyState}><div className={styles.loader} /><p>Loading servers…</p></div>
            ) : servers.length === 0 ? (
              <div className={styles.emptyState}>
                <p>{tab === "review" ? "No servers pending review." : "No approved servers available for removal."}</p>
              </div>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Server</th>
                      <th>Members · Channels</th>
                      <th>Safety</th>
                      <th>Activity</th>
                      <th>Activated</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {servers.map((srv) => (
                      <React.Fragment key={srv.id}>
                        <tr className={expandedId === srv.id ? styles.rowExpanded : ""}>
                          {/* Server */}
                          <td>
                            <div className={styles.serverCell}>
                              {srv.avatarUrl ? (
                                <img className={styles.serverAvatar} src={srv.avatarUrl} alt="" />
                              ) : (
                                <div className={styles.serverAvatarPlaceholder}>
                                  {srv.name.charAt(0).toUpperCase()}
                                </div>
                              )}
                              <div>
                                <p className={styles.serverName}>{srv.name}</p>
                                <p className={styles.serverMeta}>
                                  Owner: {srv.owner.displayName || srv.owner.username || "N/A"}
                                </p>
                                <p className={styles.serverMeta}>Mode: {srv.accessMode}</p>
                                <p className={`${styles.serverMeta} ${styles.serverId}`}>{srv.id}</p>
                              </div>
                            </div>
                          </td>

                          {/* Members · Channels */}
                          <td>
                            <div className={styles.statsCell}>
                              <span className={styles.statNum}>{srv.memberCount}</span>
                              <span className={styles.statHint}>members</span>
                              <span className={styles.statDivider}>·</span>
                              <span className={styles.statNum}>{srv.totalChannels}</span>
                              <span className={styles.statHint}>channels</span>
                              <button type="button" className={styles.detailsToggle}
                                onClick={() => setExpandedId(expandedId === srv.id ? null : srv.id)}>
                                {expandedId === srv.id ? "Hide" : "Details"}
                              </button>
                            </div>
                          </td>

                          {/* Safety (safety + automod merged) */}
                          <td>
                            <div className={styles.safetyCell}>
                              {srv.safety.hasSafetyFullyConfigured ? (
                                <span className={styles.badgeOk}>Complete</span>
                              ) : (
                                <span className={styles.badgeWarn}>Incomplete</span>
                              )}
                              {srv.safety.hasAutoMod ? (
                                <span className={styles.badgeOk}>AutoMod</span>
                              ) : (
                                <span className={styles.badgeDanger}>No AutoMod</span>
                              )}
                              <span className={styles.serverMeta}>Verify: {srv.safety.verificationLevel}</span>
                              {srv.safety.bannedWordsCount > 0 ? (
                                <span className={styles.serverMeta}>{srv.safety.bannedWordsCount} banned words</span>
                              ) : null}
                            </div>
                          </td>

                          {/* Activity */}
                          <td>
                            {srv.hasAbnormalActivity ? (
                              <span className={styles.badgeDanger}>Abnormal</span>
                            ) : (
                              <span className={styles.badgeOk}>Normal</span>
                            )}
                          </td>

                          {/* Activated */}
                          <td>
                            <span className={styles.serverMeta}>{fmtDate(srv.communityActivatedAt)}</span>
                          </td>

                          {/* Actions */}
                          <td>
                            <div className={styles.actionGroup}>
                              {tab === "review" ? (
                                <>
                                  <button type="button" className={styles.btnView} onClick={() => setJoinConfirm(srv)}>
                                    View
                                  </button>
                                  <button type="button" className={styles.btnApprove}
                                    disabled={approvalLoadingId === srv.id || srv.communityDiscoveryStatus === "approved"}
                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); void updateApproval(srv, "approved"); }}>
                                    {approvalLoadingId === srv.id ? "…" : "Approve"}
                                  </button>
                                  <button type="button" className={styles.btnReject}
                                    disabled={approvalLoadingId === srv.id || srv.communityDiscoveryStatus === "rejected"}
                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); void updateApproval(srv, "rejected"); }}>
                                    {approvalLoadingId === srv.id ? "…" : "Reject"}
                                  </button>
                                </>
                              ) : (
                                <button type="button" className={styles.btnReject}
                                  disabled={approvalLoadingId === srv.id || srv.communityDiscoveryStatus !== "approved"}
                                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); void removeFromDiscovery(srv); }}>
                                  {approvalLoadingId === srv.id ? "…" : "Remove"}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>

                        {/* Expanded channel detail */}
                        {expandedId === srv.id ? (
                          <tr>
                            <td colSpan={6} className={styles.expandedCell}>
                              <div className={styles.channelDetail}>
                                {srv.uncategorizedChannels.length > 0 ? (
                                  <div className={styles.channelGroup}>
                                    <div className={styles.channelGroupTitle}>Uncategorized</div>
                                    <ul className={styles.channelList}>
                                      {srv.uncategorizedChannels.map((ch) => (
                                        <li key={ch.id} className={styles.channelItem}>
                                          <span className={styles.channelIcon}>{ch.type === "voice" ? "♪" : "#"}</span>
                                          {ch.name}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                ) : null}
                                {srv.channelsByCategory.map((cat) => (
                                  <div key={cat.categoryId} className={styles.channelGroup}>
                                    <div className={styles.channelGroupTitle}>{cat.categoryName} ({cat.channels.length})</div>
                                    <ul className={styles.channelList}>
                                      {cat.channels.map((ch) => (
                                        <li key={ch.id} className={styles.channelItem}>
                                          <span className={styles.channelIcon}>{ch.type === "voice" ? "♪" : "#"}</span>
                                          {ch.name}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                ))}
                                {srv.channelsByCategory.length === 0 && srv.uncategorizedChannels.length === 0 ? (
                                  <p className={styles.serverMeta}>No channels available.</p>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ) : null}

        {/* ── History panel ── */}
        {tab === "history" ? (
          <section className={styles.panel}>
            <div className={styles.controlsRow}>
              <input className={styles.searchInput} value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="Search by server name or ID…"
                onKeyDown={(e) => { if (e.key === "Enter") void loadHistory(); }}
              />
              <select className={styles.nativeSelect} value={historyActionFilter}
                onChange={(e) => setHistoryActionFilter(e.target.value as typeof historyActionFilter)}
                title="Filter by action">
                <option value="all">All actions</option>
                <option value="approve">Approve</option>
                <option value="reject">Reject</option>
                <option value="remove">Remove</option>
                <option value="restore">Restore</option>
              </select>
              <select className={styles.nativeSelect} value={historySort}
                onChange={(e) => setHistorySort(e.target.value as typeof historySort)}
                title="Sort">
                <option value="action_desc">Action: Newest</option>
                <option value="action_asc">Action: Oldest</option>
                <option value="activated_desc">Activated: Newest</option>
                <option value="activated_asc">Activated: Oldest</option>
              </select>
              <button type="button" className={styles.searchBtn} onClick={() => void loadHistory()}>
                Search
              </button>
            </div>

            {historyLoading ? (
              <div className={styles.emptyState}><div className={styles.loader} /><p>Loading history…</p></div>
            ) : historyError ? (
              <div className={styles.errorBanner}>{historyError}</div>
            ) : historyItems.length === 0 ? (
              <div className={styles.emptyState}><p>No history yet.</p></div>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Server</th>
                      <th>Action</th>
                      <th>Time</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyItems
                      .filter((it) => {
                        if (historyActionFilter !== "all" && it.action !== historyActionFilter) return false;
                        const q = historySearch.trim().toLowerCase();
                        if (!q) return true;
                        return (
                          String(it.serverSnapshot?.name ?? "").toLowerCase().includes(q) ||
                          String(it.serverId ?? "").toLowerCase().includes(q)
                        );
                      })
                      .map((it) => (
                        <tr key={it._id}>
                          <td>
                            <p className={styles.serverName}>{it.serverSnapshot?.name || it.serverId}</p>
                            <p className={styles.serverId}>{it.serverId}</p>
                          </td>
                          <td>
                            {it.serverDeleted ? (
                              <div className={styles.deletedCell}>
                                <span className={styles.badgeDanger}>Server deleted</span>
                                <span className={styles.serverMeta}>By: {it.deletedBy?.email || it.deletedBy?.id || "--"}</span>
                                <button type="button" className={styles.btnApprove}
                                  disabled={approvalLoadingId === String(it.serverId) || it.canRestoreServer === false}
                                  title={it.canRestoreServer === false ? "Server was hard-deleted and cannot be restored." : undefined}
                                  onClick={async () => {
                                    const token = localStorage.getItem("adminAccessToken") || "";
                                    if (!token) return;
                                    try {
                                      setApprovalLoadingId(String(it.serverId));
                                      const res = await fetch(
                                        `${getApiBaseUrl()}/admin/community-discovery/${encodeURIComponent(String(it.serverId))}/restore-server`,
                                        { method: "POST", headers: { Authorization: `Bearer ${token}` } },
                                      );
                                      if (!res.ok) { const text = await res.text().catch(() => ""); throw new Error(text || `HTTP ${res.status}`); }
                                      showToast("success", "Server restored.");
                                      await loadHistory();
                                    } catch (e) {
                                      showToast("error", (e as { message?: string })?.message ?? "Could not restore.");
                                    } finally { setApprovalLoadingId((c) => (c === String(it.serverId) ? null : c)); }
                                  }}>
                                  {approvalLoadingId === String(it.serverId) ? "…" : "Restore server"}
                                </button>
                              </div>
                            ) : (
                              <span className={
                                it.action === "approve" ? styles.badgeOk :
                                it.action === "reject"  ? styles.badgeDanger :
                                it.action === "remove"  ? styles.badgeWarn :
                                styles.badgeIndigo
                              }>
                                {ACTION_BADGE[it.action]}
                              </span>
                            )}
                          </td>
                          <td><span className={styles.serverMeta}>{fmtDate(it.createdAt)}</span></td>
                          <td>
                            <button type="button" className={styles.detailsToggle}
                              onClick={() => {
                                setHistoryDetail({ serverId: String(it.serverId), serverName: it.serverSnapshot?.name || "Server" });
                                void loadHistory({ serverId: String(it.serverId) });
                              }}>
                              View details
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ) : null}

        {/* ── History detail modal ── */}
        {historyDetail ? (
          <div className={styles.modalOverlay} onClick={() => { setHistoryDetail(null); void loadHistory(); }}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
              <h2 className={styles.modalTitle}>History — {historyDetail.serverName}</h2>
              <p className={styles.modalDesc}>Events: approve, reject, remove, and restore.</p>
              <div className={styles.modalMeta}>
                <span><b>Server ID:</b> {historyDetail.serverId}</span>
                <span><b>Members:</b> {historyItems?.[0]?.serverSnapshot?.memberCount ?? "--"}</span>
                <span><b>Mode:</b> {historyItems?.[0]?.serverSnapshot?.accessMode ?? "--"}</span>
                <span><b>Community activated:</b> {fmtDate(historyItems?.[0]?.serverSnapshot?.communityActivatedAt ?? null)}</span>
              </div>
              <div className={styles.tableWrap} style={{ maxHeight: 320 }}>
                <table className={styles.table}>
                  <thead>
                    <tr><th>Action</th><th>Time</th><th>Note</th></tr>
                  </thead>
                  <tbody>
                    {historyItems.map((it) => (
                      <tr key={it._id}>
                        <td className={styles.serverName}>{ACTION_BADGE[it.action]}</td>
                        <td><span className={styles.serverMeta}>{fmtDate(it.createdAt)}</span></td>
                        <td><span className={styles.serverMeta}>{it.note || "--"}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {historyItems[0]?.action === "remove" ? (
                <div className={styles.modalRestoreRow}>
                  <button type="button" className={styles.btnView}
                    disabled={approvalLoadingId === historyDetail.serverId}
                    onClick={() => void restoreDiscovery(historyDetail.serverId)}>
                    {approvalLoadingId === historyDetail.serverId ? "Processing…" : "Restore Discovery"}
                  </button>
                </div>
              ) : null}
              <div className={styles.modalActions}>
                <button type="button" className={styles.modalCancel}
                  onClick={() => { setHistoryDetail(null); void loadHistory(); }}>
                  Close
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* ── Join confirm modal ── */}
      {joinConfirm ? (
        <div className={styles.modalOverlay} onClick={() => setJoinConfirm(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>View server</h2>
            <p className={styles.modalDesc}>
              You will open the internal viewer for &ldquo;{joinConfirm.name}&rdquo; in{" "}
              <strong>read-only</strong> mode — channel list and messages only, no chat or reactions.
            </p>
            <div className={styles.modalActions}>
              <button type="button" className={styles.modalCancel} onClick={() => setJoinConfirm(null)}>Cancel</button>
              <button type="button" className={styles.modalConfirm}
                onClick={() => { router.push(`/community-discovery/server-view/${joinConfirm.id}`); setJoinConfirm(null); }}>
                Open view
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
