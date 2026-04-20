"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./community-discovery.module.css";
import { getApiBaseUrl } from "@/lib/api";

type AdminPayload = {
  roles?: string[];
  exp?: number;
};

type ChannelInfo = {
  id: string;
  name: string;
  type: string;
};

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
    const json = JSON.parse(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/")),
    );
    return json as AdminPayload;
  } catch {
    return null;
  }
};

const formatDate = (value: string | null | undefined) => {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
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
  const [historyActionFilter, setHistoryActionFilter] = useState<
    "all" | "approve" | "reject" | "remove" | "restore"
  >("all");
  const [historySearch, setHistorySearch] = useState("");
  const [historySort, setHistorySort] = useState<"action_desc" | "action_asc" | "activated_desc" | "activated_asc">("action_desc");
  const [historyDetail, setHistoryDetail] = useState<{
    serverId: string;
    serverName: string;
  } | null>(null);

  useEffect(() => {
    const token =
      typeof window !== "undefined"
        ? localStorage.getItem("adminAccessToken")
        : null;
    if (!token) {
      router.replace("/login");
      return;
    }
    const decoded = decodeJwt(token);
    if (!decoded?.roles?.includes("admin")) {
      router.replace("/login");
      return;
    }
    if (decoded.exp && decoded.exp * 1000 < Date.now()) {
      router.replace("/login");
      return;
    }

    // Tab 1: list only pending servers
    loadServers(token, "pending");
  }, [router]);

  // Auto-refresh counts/list so memberCount stays up to date
  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("adminAccessToken") : null;
    if (!token) return;
    const status = tab === "review" ? "pending" : tab === "remove" ? "approved" : "all";
    const t = setInterval(() => {
      if (tab === "history") return;
      void loadServers(token, status);
    }, 12000);
    return () => clearInterval(t);
  }, [tab]);

  const loadServers = async (
    token: string,
    status: "all" | "pending" | "approved" | "rejected" | "removed",
  ) => {
    setLoading(true);
    setError(null);
    try {
      const url = new URL(`${getApiBaseUrl()}/admin/community-discovery`);
      url.searchParams.set("status", status);
      if (search.trim()) url.searchParams.set("q", search.trim());
      if (sort) url.searchParams.set("sort", sort);
      const res = await fetch(
        url.toString(),
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: CommunityServer[] = await res.json();
      setServers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
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
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(t || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setHistoryItems(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      setHistoryError(e instanceof Error ? e.message : "Failed");
      setHistoryItems([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleJoinConfirm = () => {
    if (!joinConfirm) return;
    router.push(`/community-discovery/server-view/${joinConfirm.id}`);
    setJoinConfirm(null);
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
        try {
          const parsed = text ? JSON.parse(text) : null;
          msg = parsed?.message ? String(parsed.message) : msg;
        } catch {
          if (text) msg = text;
        }
        throw new Error(msg);
      }
      setServers((prev) =>
        prev.map((s) => (s.id === srv.id ? { ...s, communityDiscoveryStatus: status } : s)),
      );
      setToast({ type: "success", message: status === "approved" ? "Approved." : "Rejected." });
      // After review/reject, remove from review tab and keep in history.
      void loadServers(token, "pending");
    } catch (err) {
      setToast({ type: "error", message: err instanceof Error ? err.message : "Could not update." });
    } finally {
      setApprovalLoadingId((cur) => (cur === srv.id ? null : cur));
    }
  };

  const removeFromDiscovery = async (srv: CommunityServer) => {
    const token = localStorage.getItem("adminAccessToken") || "";
    if (!token) return;
    try {
      setApprovalLoadingId(srv.id);
      const res = await fetch(
        `${getApiBaseUrl()}/admin/community-discovery/${srv.id}/remove`,
        { method: "POST", headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `HTTP ${res.status}`);
      }
      setServers((prev) =>
        prev.map((s) => (s.id === srv.id ? { ...s, communityDiscoveryStatus: "removed" } : s)),
      );
      setToast({ type: "success", message: "Removed from Discovery." });
      // After removal, server returns to normal and leaves this tab.
      void loadServers(token, "approved");
    } catch (e) {
      setToast({ type: "error", message: e instanceof Error ? e.message : "Could not remove." });
    } finally {
      setApprovalLoadingId((cur) => (cur === srv.id ? null : cur));
    }
  };

  const restoreDiscovery = async (serverId: string) => {
    const token = localStorage.getItem("adminAccessToken") || "";
    if (!token) return;
    try {
      setApprovalLoadingId(serverId);
      const res = await fetch(
        `${getApiBaseUrl()}/admin/community-discovery/${serverId}/restore`,
        { method: "POST", headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `HTTP ${res.status}`);
      }
      setToast({ type: "success", message: "Discovery restored." });
      // refresh both servers and history snapshot
      await loadServers(token, "all");
      await loadHistory({ serverId });
    } catch (e) {
      setToast({ type: "error", message: e instanceof Error ? e.message : "Could not restore." });
    } finally {
      setApprovalLoadingId((cur) => (cur === serverId ? null : cur));
    }
  };

  const totalMembers = servers.reduce((s, srv) => s + srv.memberCount, 0);
  const fullyConfigured = servers.filter(
    (s) => s.safety.hasSafetyFullyConfigured,
  ).length;

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        {toast && (
          <div
            style={{
              position: "sticky",
              top: 12,
              zIndex: 50,
              display: "flex",
              justifyContent: "center",
            }}
          >
            <div
              role="status"
              style={{
                maxWidth: 820,
                width: "100%",
                borderRadius: 14,
                padding: "10px 12px",
                border: "1px solid var(--color-border)",
                background:
                  toast.type === "success"
                    ? "rgba(16, 185, 129, 0.12)"
                    : "rgba(220, 38, 38, 0.10)",
                color: toast.type === "success" ? "#047857" : "#b91c1c",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 700 }}>{toast.message}</span>
              <button
                type="button"
                className={styles.expandBtn}
                onClick={() => setToast(null)}
                style={{ padding: "4px 10px" }}
              >
                Close
              </button>
            </div>
          </div>
        )}
        <div className={styles.topbar}>
          <div>
            <p className={styles.eyebrow}>Admin</p>
            <h1 className={styles.title}>Community Discovery</h1>
            <p className={styles.subtitle}>
              Manage and review servers with Community enabled. Check details
              and join as an observer in read-only mode.
            </p>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            className={styles.expandBtn}
            onClick={() => {
              setTab("review");
              const token = localStorage.getItem("adminAccessToken") || "";
              if (token) void loadServers(token, "pending");
            }}
            style={tab === "review" ? { outline: "2px solid var(--color-primary)", outlineOffset: 2 } : undefined}
          >
            Review (Pending)
          </button>
          <button
            type="button"
            className={styles.expandBtn}
            onClick={() => {
              setTab("remove");
              const token = localStorage.getItem("adminAccessToken") || "";
              if (token) void loadServers(token, "approved");
            }}
            style={tab === "remove" ? { outline: "2px solid var(--color-primary)", outlineOffset: 2 } : undefined}
          >
            Remove from Discovery
          </button>
          <button
            type="button"
            className={styles.expandBtn}
            onClick={() => {
              setTab("history");
              void loadHistory();
            }}
            style={tab === "history" ? { outline: "2px solid var(--color-primary)", outlineOffset: 2 } : undefined}
          >
            History
          </button>
        </div>

        <div className={styles.statRow}>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{servers.length}</div>
            <div className={styles.statLabel}>Community Servers</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{totalMembers}</div>
            <div className={styles.statLabel}>Total Members</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{fullyConfigured}</div>
            <div className={styles.statLabel}>Safety Configured</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue}>
              {servers.filter((s) => s.safety.hasAutoMod).length}
            </div>
            <div className={styles.statLabel}>AutoMod Enabled</div>
          </div>
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.panel}>
          {(tab === "review" || tab === "remove") && (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by server name or ID..."
                style={{
                  flex: "1 1 260px",
                  minWidth: 220,
                  border: "1px solid var(--color-border)",
                  borderRadius: 10,
                  padding: "8px 10px",
                  background: "var(--color-surface)",
                  color: "var(--color-text)",
                  fontSize: 13,
                }}
              />
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as typeof sort)}
                style={{
                  border: "1px solid var(--color-border)",
                  borderRadius: 10,
                  padding: "8px 10px",
                  background: "var(--color-surface)",
                  color: "var(--color-text)",
                  fontSize: 13,
                }}
                title="Sort by time"
              >
                <option value="activated_desc">Activated: Newest</option>
                <option value="activated_asc">Activated: Oldest</option>
                <option value="created_desc">Created: Newest</option>
                <option value="created_asc">Created: Oldest</option>
              </select>
              <button
                type="button"
                className={styles.expandBtn}
                onClick={() => {
                  const token = localStorage.getItem("adminAccessToken") || "";
                  const status = tab === "review" ? "pending" : "approved";
                  if (token) void loadServers(token, status);
                }}
              >
                Search
              </button>
            </div>
          )}
          {loading ? (
            <div className={styles.emptyState}>Loading...</div>
          ) : servers.length === 0 ? (
            <div className={styles.emptyState}>
              {tab === "review"
                ? "No servers are pending review."
                : tab === "remove"
                  ? "No approved servers available for removal."
                  : "No data available."}
            </div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Server</th>
                    <th>Members</th>
                    <th>Channels</th>
                    <th>Safety</th>
                    <th>AutoMod</th>
                    <th>Activity</th>
                    <th>Activated</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {servers.map((srv) => (
                    <React.Fragment key={srv.id}>
                      <tr>
                        <td>
                          <div className={styles.serverName}>
                            {srv.avatarUrl ? (
                              <img
                                className={styles.serverAvatar}
                                src={srv.avatarUrl}
                                alt=""
                              />
                            ) : (
                              <div className={styles.serverAvatarPlaceholder}>
                                {srv.name.charAt(0).toUpperCase()}
                              </div>
                            )}
                            <div>
                              <p className={styles.main}>{srv.name}</p>
                              <p className={styles.sub}>
                                Owner: {srv.owner.displayName || srv.owner.username || "N/A"}
                              </p>
                              <p className={styles.sub}>Server ID: {srv.id}</p>
                              <p className={styles.sub}>
                                Mode: {srv.accessMode}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td>
                          <p className={styles.main}>{srv.memberCount}</p>
                        </td>
                        <td style={{display: "flex", alignItems: "center", gap: 10}}>
                          <p className={styles.main}>{srv.totalChannels}</p>
                          <button
                            type="button"
                            className={styles.expandBtn}
                            onClick={() =>
                              setExpandedId(
                                expandedId === srv.id ? null : srv.id,
                              )
                            }
                          >
                            {expandedId === srv.id ? "Hide" : "Details"}
                          </button>
                        </td>
                        <td>
                          {srv.safety.hasSafetyFullyConfigured ? (
                            <span className={styles.badgeOk}>Complete</span>
                          ) : (
                            <span className={styles.badgeWarn}>Incomplete</span>
                          )}
                          <p className={styles.sub}>
                            Verify: {srv.safety.verificationLevel}
                          </p>
                        </td>
                        <td>
                          {srv.safety.hasAutoMod ? (
                            <span className={styles.badgeOk}>Enabled</span>
                          ) : (
                            <span className={styles.badgeDanger}>Disabled</span>
                          )}
                          {srv.safety.bannedWordsCount > 0 && (
                            <p className={styles.sub}>
                              {srv.safety.bannedWordsCount} banned words
                            </p>
                          )}
                        </td>
                        <td>
                          {srv.hasAbnormalActivity ? (
                            <span className={styles.badgeDanger}>
                              Abnormal
                            </span>
                          ) : (
                            <span className={styles.badgeOk}>Normal</span>
                          )}
                        </td>
                        <td>
                          <p className={styles.sub}>
                            {formatDate(srv.communityActivatedAt)}
                          </p>
                        </td>
                        <td>

                          {tab === "review" && (
                            <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                                                        <button
                            type="button"
                            className={styles.joinBtn}
                            onClick={() => setJoinConfirm(srv)}
                          >
                            View
                          </button>
                              <button
                                type="button"
                                className={styles.expandBtn}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  void updateApproval(srv, "approved");
                                }}
                                disabled={srv.communityDiscoveryStatus === "approved"}
                                title="Approve to show in Discovery"
                              >
                                {approvalLoadingId === srv.id && srv.communityDiscoveryStatus !== "approved"
                                  ? "Processing..."
                                  : "Approve"}
                              </button>
                              <button
                                type="button"
                                className={styles.expandBtn}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  void updateApproval(srv, "rejected");
                                }}
                                disabled={srv.communityDiscoveryStatus === "rejected"}
                                title="Reject and keep hidden from Discovery"
                                style={{ color: "#b42318", borderColor: "rgba(180,35,24,0.25)" }}
                              >
                                {approvalLoadingId === srv.id && srv.communityDiscoveryStatus !== "rejected"
                                  ? "Processing..."
                                  : "Reject"}
                              </button>
                            </div>
                          )}

                          {tab === "remove" && (
                            <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <button
                                type="button"
                                className={styles.expandBtn}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  void removeFromDiscovery(srv);
                                }}
                                disabled={srv.communityDiscoveryStatus !== "approved"}
                                title={
                                  srv.communityDiscoveryStatus !== "approved"
                                    ? "Only approved servers can be removed"
                                    : "Remove from Discovery"
                                }
                                style={{ color: "#b42318", borderColor: "rgba(180,35,24,0.25)" }}
                              >
                                {approvalLoadingId === srv.id ? "Processing..." : "Remove"}
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                      {expandedId === srv.id && (
                        <tr>
                          <td colSpan={8}>
                            <div className={styles.channelDetail}>
                              {srv.uncategorizedChannels.length > 0 && (
                                <div className={styles.channelCategory}>
                                  <div className={styles.channelCategoryTitle}>
                                    Uncategorized
                                  </div>
                                  <ul className={styles.channelList}>
                                    {srv.uncategorizedChannels.map((ch) => (
                                      <li
                                        key={ch.id}
                                        className={styles.channelItem}
                                      >
                                        <span className={styles.channelIcon}>
                                          {ch.type === "voice" ? "🔊" : "#"}
                                        </span>
                                        {ch.name}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {srv.channelsByCategory.map((cat) => (
                                <div
                                  key={cat.categoryId}
                                  className={styles.channelCategory}
                                >
                                  <div className={styles.channelCategoryTitle}>
                                    {cat.categoryName} ({cat.channels.length})
                                  </div>
                                  <ul className={styles.channelList}>
                                    {cat.channels.map((ch) => (
                                      <li
                                        key={ch.id}
                                        className={styles.channelItem}
                                      >
                                        <span className={styles.channelIcon}>
                                          {ch.type === "voice" ? "🔊" : "#"}
                                        </span>
                                        {ch.name}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              ))}
                              {srv.channelsByCategory.length === 0 &&
                                srv.uncategorizedChannels.length === 0 && (
                                  <p className={styles.sub}>
                                    No channels.
                                  </p>
                                )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {tab === "history" && (
          <div className={styles.panel}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <input
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="Search by server name or ID..."
                style={{
                  flex: "1 1 260px",
                  minWidth: 220,
                  border: "1px solid var(--color-border)",
                  borderRadius: 10,
                  padding: "8px 10px",
                  background: "var(--color-surface)",
                  color: "var(--color-text)",
                  fontSize: 13,
                }}
              />
              <select
                value={historyActionFilter}
                onChange={(e) =>
                  setHistoryActionFilter(
                    e.target.value as typeof historyActionFilter
                  )
                }
                style={{
                  border: "1px solid var(--color-border)",
                  borderRadius: 10,
                  padding: "8px 10px",
                  background: "var(--color-surface)",
                  color: "var(--color-text)",
                  fontSize: 13,
                }}
                title="History filter"
              >
                <option value="all">All</option>
                <option value="approve">Approve</option>
                <option value="reject">Reject</option>
                <option value="remove">Remove from Discovery</option>
                <option value="restore">Restore</option>
              </select>
              <select
                value={historySort}
                onChange={(e) => setHistorySort(e.target.value as typeof historySort)}
                style={{
                  border: "1px solid var(--color-border)",
                  borderRadius: 10,
                  padding: "8px 10px",
                  background: "var(--color-surface)",
                  color: "var(--color-text)",
                  fontSize: 13,
                }}
                title="Sort by time"
              >
                <option value="action_desc">Action: Newest</option>
                <option value="action_asc">Action: Oldest</option>
                <option value="activated_desc">Activated: Newest</option>
                <option value="activated_asc">Activated: Oldest</option>
              </select>
              <button
                type="button"
                className={styles.expandBtn}
                onClick={() => void loadHistory()}
              >
                Search
              </button>
            </div>

            {historyLoading ? (
              <div className={styles.emptyState}>Loading history...</div>
            ) : historyError ? (
              <div className={styles.emptyState}>{historyError}</div>
            ) : historyItems.length === 0 ? (
              <div className={styles.emptyState}>No history yet.</div>
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
                      .filter((it: HistoryItem) => {
                        if (historyActionFilter !== "all" && it.action !== historyActionFilter) return false;
                        const name = String(it.serverSnapshot?.name || "").toLowerCase();
                        const id = String(it.serverId || "").toLowerCase();
                        const q = historySearch.trim().toLowerCase();
                        if (!q) return true;
                        return name.includes(q) || id.includes(q);
                      })
                      .map((it: HistoryItem) => (
                      <tr key={it._id}>
                        <td>
                          <p className={styles.main}>{it.serverSnapshot?.name || it.serverId}</p>
                          <p className={styles.sub}>Server ID: {it.serverId}</p>
                        </td>
                        <td>
                          {it.serverDeleted ? (
                            <div style={{ display: "grid", gap: 6 }}>
                              <span className={styles.badgeDanger}>
                                Server deleted
                              </span>
                              <span className={styles.sub}>
                                Deleted by: {it.deletedBy?.email || it.deletedBy?.id || "--"}
                              </span>
                              <button
                                type="button"
                                className={styles.expandBtn}
                                onClick={async () => {
                                  const token = localStorage.getItem("adminAccessToken") || "";
                                  if (!token) return;
                                  try {
                                    setApprovalLoadingId(String(it.serverId));
                                    const res = await fetch(
                                      `${getApiBaseUrl()}/admin/community-discovery/${encodeURIComponent(
                                        String(it.serverId),
                                      )}/restore-server`,
                                      {
                                        method: "POST",
                                        headers: { Authorization: `Bearer ${token}` },
                                      },
                                    );
                                    if (!res.ok) {
                                      const text = await res.text().catch(() => "");
                                      throw new Error(text || `HTTP ${res.status}`);
                                    }
                                    setToast({ type: "success", message: "Server restored." });
                                    await loadHistory();
                                  } catch (e) {
                                    const err = e as { message?: string } | null;
                                    setToast({ type: "error", message: err?.message || "Could not restore." });
                                  } finally {
                                    setApprovalLoadingId((cur) =>
                                      cur === String(it.serverId) ? null : cur,
                                    );
                                  }
                                }}
                                disabled={approvalLoadingId === String(it.serverId) || it.canRestoreServer === false}
                                title={
                                  it.canRestoreServer === false
                                    ? "Server was hard-deleted and cannot be restored."
                                    : undefined
                                }
                              >
                                {approvalLoadingId === String(it.serverId) ? "Processing..." : "Restore server"}
                              </button>
                            </div>
                          ) : (
                            <span className={styles.badgeOk} style={{ background: "rgba(99,102,241,0.12)", color: "#3730a3" }}>
                              {it.action === "approve"
                                ? "Approve"
                                : it.action === "reject"
                                  ? "Reject"
                                  : it.action === "remove"
                                    ? "Remove from Discovery"
                                    : "Restore"}
                            </span>
                          )}
                        </td>
                        <td className={styles.sub}>{formatDate(it.createdAt)}</td>
                        <td>
                          <button
                            type="button"
                            className={styles.expandBtn}
                            onClick={() => {
                              setHistoryDetail({
                                serverId: String(it.serverId),
                                serverName: it.serverSnapshot?.name || "Server",
                              });
                              void loadHistory({ serverId: String(it.serverId) });
                            }}
                          >
                            View details
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {historyDetail && (
          <div
            className={styles.modalOverlay}
            onClick={() => {
              setHistoryDetail(null);
              void loadHistory(); // back to global history
            }}
          >
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
              <h2 className={styles.modalTitle}>History — {historyDetail.serverName}</h2>
              <p className={styles.modalDesc}>
                Displays events: approve, reject, remove from Discovery, and restore.
              </p>

              <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
                <div className={styles.sub}>
                  <b>Server ID:</b> {historyDetail.serverId}
                </div>
                <div className={styles.sub}>
                  <b>Members:</b> {historyItems?.[0]?.serverSnapshot?.memberCount ?? "--"}
                </div>
                <div className={styles.sub}>
                  <b>Mode:</b> {historyItems?.[0]?.serverSnapshot?.accessMode ?? "--"}
                </div>
                <div className={styles.sub}>
                  <b>Community activated:</b>{" "}
                  {formatDate(historyItems?.[0]?.serverSnapshot?.communityActivatedAt ?? null)}
                </div>
              </div>
              <div style={{ maxHeight: 360, overflow: "auto", border: "1px solid var(--color-border)", borderRadius: 10 }}>
                <table className={styles.table} style={{ minWidth: 0 }}>
                  <thead>
                    <tr>
                      <th>Action</th>
                      <th>Time</th>
                      <th>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyItems.map((it: HistoryItem) => (
                      <tr key={it._id}>
                        <td className={styles.main}>
                          {it.action === "approve"
                            ? "Approve"
                            : it.action === "reject"
                              ? "Reject"
                              : it.action === "remove"
                                ? "Remove from Discovery"
                                : "Restore"}
                        </td>
                        <td className={styles.sub}>{formatDate(it.createdAt)}</td>
                        <td className={styles.sub}>{it.note || "--"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Restore button only if latest snapshot indicates removed */}
              {historyItems[0]?.action === "remove" && (
                <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end", gap: 10 }}>
                  <button
                    type="button"
                    className={styles.joinBtn}
                    onClick={() => void restoreDiscovery(historyDetail.serverId)}
                    disabled={approvalLoadingId === historyDetail.serverId}
                  >
                    {approvalLoadingId === historyDetail.serverId ? "Processing..." : "Restore Discovery"}
                  </button>
                </div>
              )}

              <div className={styles.modalActions}>
                <button
                  type="button"
                  className={styles.modalCancel}
                  onClick={() => {
                    setHistoryDetail(null);
                    void loadHistory();
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {joinConfirm && (
        <div
          className={styles.modalOverlay}
          onClick={() => setJoinConfirm(null)}
        >
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>View server</h2>
            <p className={styles.modalDesc}>
              You will open the internal viewer for &ldquo;{joinConfirm.name}&rdquo;
              (same admin portal, authenticated) in <strong>read-only</strong>
              mode: channel list and messages only, no chat or reactions. This
              does not open the user web app.
            </p>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.modalCancel}
                onClick={() => setJoinConfirm(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.modalConfirm}
                onClick={handleJoinConfirm}
              >
                Open view
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
