"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./community-discovery.module.css";
import { getApiBaseUrl } from "@/lib/api";
import { getWebBaseUrl } from "@/lib/urls";

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
  return date.toLocaleDateString("vi-VN", {
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
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [joinConfirm, setJoinConfirm] = useState<CommunityServer | null>(null);
  const [approvalLoadingId, setApprovalLoadingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyItems, setHistoryItems] = useState<any[]>([]);
  const [historyActionFilter, setHistoryActionFilter] = useState<
    "all" | "approve" | "reject" | "remove" | "restore"
  >("all");
  const [historySearch, setHistorySearch] = useState("");
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

    // Tab 1: chỉ list các server đang chờ duyệt
    loadServers(token, "pending");
  }, [router]);

  // Auto-refresh counts/list so memberCount stays up to date
  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("adminAccessToken") : null;
    if (!token) return;
    const status = tab === "review" ? "pending" : tab === "remove" ? "approved" : "all";
    const t = setInterval(() => {
      if (tab === "history") return;
      void loadServers(token, status as any);
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
      const res = await fetch(
        `${getApiBaseUrl()}/admin/community-discovery?status=${encodeURIComponent(status)}`,
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
    const token = localStorage.getItem("adminAccessToken") || "";
    const adminReturnUrl = `${window.location.origin}/community-discovery`;
    const webUrl = `${getWebBaseUrl()}/messages?server=${joinConfirm.id}&from=admin&adminToken=${encodeURIComponent(token)}&returnUrl=${encodeURIComponent(adminReturnUrl)}`;
    window.open(webUrl, "_blank");
    setJoinConfirm(null);
  };

  const updateApproval = async (srv: CommunityServer, status: "approved" | "rejected") => {
    const token = localStorage.getItem("adminAccessToken") || "";
    if (!token) return;
    console.log("[CommunityDiscovery] updateApproval", { serverId: srv.id, status });
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
      setToast({ type: "success", message: status === "approved" ? "Đã chấp thuận." : "Đã từ chối." });
      // Tab 1 yêu cầu sau khi duyệt/từ chối thì biến mất khỏi tab 1 và chỉ còn ở lịch sử
      void loadServers(token, "pending");
    } catch (err) {
      setToast({ type: "error", message: err instanceof Error ? err.message : "Không cập nhật được" });
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
      setToast({ type: "success", message: "Đã gỡ khỏi discovery." });
      // Tab 2: sau khi gỡ, server quay về bình thường => biến mất khỏi danh sách gỡ
      void loadServers(token, "approved");
    } catch (e) {
      setToast({ type: "error", message: e instanceof Error ? e.message : "Không gỡ được" });
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
      setToast({ type: "success", message: "Đã khôi phục discovery." });
      // refresh both servers and history snapshot
      await loadServers(token, "all");
      await loadHistory({ serverId });
    } catch (e) {
      setToast({ type: "error", message: e instanceof Error ? e.message : "Không khôi phục được" });
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
                Đóng
              </button>
            </div>
          </div>
        )}
        <div className={styles.topbar}>
          <div>
            <p className={styles.eyebrow}>Admin</p>
            <h1 className={styles.title}>Community Discovery</h1>
            <p className={styles.subtitle}>
              Quản lý và duyệt các máy chủ đã kích hoạt Community. Kiểm tra
              thông tin chi tiết, tham gia xem với tư cách người quan sát.
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
            Duyệt (chờ duyệt)
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
            Gỡ khỏi discovery
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
            Lịch sử
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
          {loading ? (
            <div className={styles.emptyState}>Loading...</div>
          ) : servers.length === 0 ? (
            <div className={styles.emptyState}>
              {tab === "review"
                ? "Không có máy chủ nào đang chờ duyệt."
                : tab === "remove"
                  ? "Không có máy chủ nào đã duyệt để gỡ."
                  : "Không có dữ liệu."}
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
                              <p className={styles.sub}>
                                Mode: {srv.accessMode}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td>
                          <p className={styles.main}>{srv.memberCount}</p>
                        </td>
                        <td>
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
                            {expandedId === srv.id ? "Ẩn" : "Chi tiết"}
                          </button>
                        </td>
                        <td>
                          {srv.safety.hasSafetyFullyConfigured ? (
                            <span className={styles.badgeOk}>Đầy đủ</span>
                          ) : (
                            <span className={styles.badgeWarn}>Thiếu</span>
                          )}
                          <p className={styles.sub}>
                            Filter: {srv.safety.contentFilterLevel}
                          </p>
                          <p className={styles.sub}>
                            Verify: {srv.safety.verificationLevel}
                          </p>
                        </td>
                        <td>
                          {srv.safety.hasAutoMod ? (
                            <span className={styles.badgeOk}>Bật</span>
                          ) : (
                            <span className={styles.badgeDanger}>Tắt</span>
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
                              Bất thường
                            </span>
                          ) : (
                            <span className={styles.badgeOk}>Bình thường</span>
                          )}
                        </td>
                        <td>
                          <p className={styles.sub}>
                            {formatDate(srv.communityActivatedAt)}
                          </p>
                        </td>
                        <td>
                          <button
                            type="button"
                            className={styles.joinBtn}
                            onClick={() => setJoinConfirm(srv)}
                          >
                            Tham gia xem
                          </button>
                          {tab === "review" && (
                            <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <button
                                type="button"
                                className={styles.expandBtn}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  void updateApproval(srv, "approved");
                                }}
                                disabled={srv.communityDiscoveryStatus === "approved"}
                                title="Chấp thuận để hiển thị trong Khám phá"
                              >
                                {approvalLoadingId === srv.id && srv.communityDiscoveryStatus !== "approved"
                                  ? "Đang xử lý..."
                                  : "Chấp thuận"}
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
                                title="Từ chối — không hiển thị trong Khám phá"
                                style={{ color: "#b42318", borderColor: "rgba(180,35,24,0.25)" }}
                              >
                                {approvalLoadingId === srv.id && srv.communityDiscoveryStatus !== "rejected"
                                  ? "Đang xử lý..."
                                  : "Từ chối"}
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
                                    ? "Chỉ server đã chấp thuận mới được gỡ"
                                    : "Gỡ khỏi discovery"
                                }
                                style={{ color: "#b42318", borderColor: "rgba(180,35,24,0.25)" }}
                              >
                                {approvalLoadingId === srv.id ? "Đang xử lý..." : "Gỡ"}
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
                                    Không có danh mục
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
                                    Không có kênh nào.
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
                placeholder="Tìm theo tên server..."
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
                onChange={(e) => setHistoryActionFilter(e.target.value as any)}
                style={{
                  border: "1px solid var(--color-border)",
                  borderRadius: 10,
                  padding: "8px 10px",
                  background: "var(--color-surface)",
                  color: "var(--color-text)",
                  fontSize: 13,
                }}
                title="Bộ lọc lịch sử"
              >
                <option value="all">Tất cả</option>
                <option value="approve">Chấp thuận</option>
                <option value="reject">Từ chối</option>
                <option value="remove">Gỡ khỏi discovery</option>
                <option value="restore">Khôi phục</option>
              </select>
            </div>

            {historyLoading ? (
              <div className={styles.emptyState}>Loading history...</div>
            ) : historyError ? (
              <div className={styles.emptyState}>{historyError}</div>
            ) : historyItems.length === 0 ? (
              <div className={styles.emptyState}>Chưa có lịch sử.</div>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Server</th>
                      <th>Hành động</th>
                      <th>Thời gian</th>
                      <th>Chi tiết</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyItems
                      .filter((it: any) => {
                        if (historyActionFilter !== "all" && it.action !== historyActionFilter) return false;
                        const name = String(it.serverSnapshot?.name || "").toLowerCase();
                        const q = historySearch.trim().toLowerCase();
                        if (!q) return true;
                        return name.includes(q);
                      })
                      .map((it: any) => (
                      <tr key={it._id}>
                        <td>
                          <p className={styles.main}>{it.serverSnapshot?.name || it.serverId}</p>
                          <p className={styles.sub}>Server ID: {it.serverId}</p>
                        </td>
                        <td>
                          <span className={styles.badgeOk} style={{ background: "rgba(99,102,241,0.12)", color: "#3730a3" }}>
                            {it.action === "approve"
                              ? "Chấp thuận"
                              : it.action === "reject"
                                ? "Từ chối"
                                : it.action === "remove"
                                  ? "Gỡ khỏi discovery"
                                  : "Khôi phục"}
                          </span>
                        </td>
                        <td className={styles.sub}>{formatDate(it.createdAt)}</td>
                        <td>
                          <button
                            type="button"
                            className={styles.expandBtn}
                            onClick={() => {
                              setHistoryDetail({
                                serverId: String(it.serverId),
                                serverName: it.serverSnapshot?.name || "Máy chủ",
                              });
                              void loadHistory({ serverId: String(it.serverId) });
                            }}
                          >
                            Xem chi tiết
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
              <h2 className={styles.modalTitle}>Lịch sử — {historyDetail.serverName}</h2>
              <p className={styles.modalDesc}>
                Hiển thị các mốc: chấp thuận, từ chối, gỡ khỏi discovery và khôi phục.
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
                      <th>Hành động</th>
                      <th>Thời gian</th>
                      <th>Ghi chú</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyItems.map((it: any) => (
                      <tr key={it._id}>
                        <td className={styles.main}>
                          {it.action === "approve"
                            ? "Chấp thuận"
                            : it.action === "reject"
                              ? "Từ chối"
                              : it.action === "remove"
                                ? "Gỡ khỏi discovery"
                                : "Khôi phục"}
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
                    {approvalLoadingId === historyDetail.serverId ? "Đang xử lý..." : "Khôi phục discovery"}
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
                  Đóng
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
            <h2 className={styles.modalTitle}>Xem máy chủ</h2>
            <p className={styles.modalDesc}>
              Bạn sẽ mở máy chủ &ldquo;{joinConfirm.name}&rdquo; ở chế độ
              <strong> chỉ đọc</strong> để kiểm tra nội dung. Không ảnh hưởng
              gì đến máy chủ.
            </p>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.modalCancel}
                onClick={() => setJoinConfirm(null)}
              >
                Hủy
              </button>
              <button
                type="button"
                className={styles.modalConfirm}
                onClick={handleJoinConfirm}
              >
                Mở xem
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
