"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { io } from "socket.io-client";
import styles from "./dashboard.module.css";
import { getApiBaseUrl } from "@/lib/api";

type AdminPayload = {
  roles?: string[];
  exp?: number;
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

export default function AdminDashboardPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [quickActionToast, setQuickActionToast] = useState<string | null>(null);
  const [stats, setStats] = useState<{
    totalUsers: number;
    newUsers24h: number;
    newUsersPrev24h: number;
    newUsersDeltaPct: number | null;
    postsCreated7d: number;
    postsCreatedPrev7d: number;
    postsCreatedDeltaPct: number | null;
    storageUsedBytes: number;
    storageLimitBytes: number | null;
    storageUsedPct: number | null;
    realtimeRooms: number | null;
    realtimeParticipants: number | null;
    onlineUsersRealtime: number;
    onlineUsersPeakAllTime: number;
    apiStatus: "Operational" | "Degraded" | "Down";
    apiUptimeSeconds: number;
    openReportsCount: number;
    highRiskReportsCount: number;
    adsGrossRevenue30d?: number | null;
    adsSpend30d?: number | null;
    adsGrossRevenue24h?: number | null;
    adsSpend24h?: number | null;
    adsActiveCampaigns?: number | null;
    adsImpressions30d?: number | null;
    adsClicks30d?: number | null;
    adsCtr30dPct?: number | null;
    adsImpressions24h?: number | null;
    adsClicks24h?: number | null;
    adsCtr24hPct?: number | null;
    reportQueue: Array<{
      type: "post" | "comment" | "user";
      targetId: string;
      title: string;
      topCategory: string;
      totalReports: number;
      uniqueReporters: number;
      score: number;
      severity: "low" | "medium" | "high";
      autoHideSuggested: boolean;
      autoHiddenPendingReview?: boolean;
      escalatedPriority?: boolean;
      lastReportedAt: string;
    }>;
  } | null>(null);
  const [moderationItems, setModerationItems] = useState<
    Array<{
      postId: string;
      authorDisplayName: string | null;
      authorUsername: string | null;
      moderationDecision: "approve" | "blur" | "reject";
      reasons: string[];
      createdAt: string | null;
    }>
  >([]);
  const [recentActivities, setRecentActivities] = useState<
    Array<{
      actor: string;
      action: string;
      occurredAt: string | null;
    }>
  >([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = localStorage.getItem("adminAccessToken") || "";
    if (!token) {
      router.replace("/login");
      return;
    }

    const payload = decodeJwt(token);
    const roles = payload?.roles || [];
    const exp = payload?.exp ? payload.exp * 1000 : 0;
    if (!roles.includes("admin") || (exp && Date.now() > exp)) {
      router.replace("/login");
      return;
    }

    setReady(true);
  }, [router]);

  useEffect(() => {
    if (!ready || typeof window === "undefined") return;
    const token = localStorage.getItem("adminAccessToken") || "";
    if (!token) return;

    const loadStats = async () => {
      try {
        const response = await fetch(`${getApiBaseUrl()}/admin/stats`, {
          method: "GET",
          cache: "no-store",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error("Failed to load stats");
        const payload = await response.json();
        setStats(payload);
      } catch {
        // Keep previous snapshot on transient failures
      }
    };

    loadStats();
  }, [ready]);

  useEffect(() => {
    if (!ready || typeof window === "undefined") return;
    const token = localStorage.getItem("adminAccessToken") || "";
    if (!token) return;

    const socket = io(`${getApiBaseUrl()}/notifications`, {
      transports: ["websocket"],
      auth: { token },
    });

    socket.on(
      "system:online-stats",
      (payload: {
        onlineUsersRealtime?: number;
        onlineUsersPeakAllTime?: number;
      }) => {
        setStats((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            onlineUsersRealtime:
              typeof payload.onlineUsersRealtime === "number"
                ? payload.onlineUsersRealtime
                : prev.onlineUsersRealtime,
            onlineUsersPeakAllTime:
              typeof payload.onlineUsersPeakAllTime === "number"
                ? payload.onlineUsersPeakAllTime
                : prev.onlineUsersPeakAllTime,
          };
        });
      },
    );

    return () => { socket.disconnect(); };
  }, [ready]);

  useEffect(() => {
    if (!quickActionToast) return;
    const timer = window.setTimeout(() => setQuickActionToast(null), 2800);
    return () => window.clearTimeout(timer);
  }, [quickActionToast]);

  useEffect(() => {
    if (!ready || typeof window === "undefined") return;
    const token = localStorage.getItem("adminAccessToken") || "";
    if (!token) return;

    const loadModeration = async () => {
      try {
        const response = await fetch(`${getApiBaseUrl()}/admin/moderation/media`, {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error("Failed to load moderation queue");
        const payload = await response.json() as {
          items: Array<{
            postId: string;
            authorDisplayName: string | null;
            authorUsername: string | null;
            moderationDecision: "approve" | "blur" | "reject";
            reasons: string[];
            createdAt: string | null;
          }>;
        };
        setModerationItems((payload.items ?? []).slice(0, 4));
      } catch {
        setModerationItems([]);
      }
    };

    loadModeration();
  }, [ready]);

  useEffect(() => {
    if (!ready || typeof window === "undefined") return;
    const token = localStorage.getItem("adminAccessToken") || "";
    if (!token) return;

    const mapResolvedToActivity = (items: Array<{
      action: string;
      type: "post" | "comment" | "user";
      targetLabel: string;
      resolvedAt: string | null;
      moderatorDisplayName: string | null;
      moderatorUsername: string | null;
      moderatorEmail: string | null;
    }>) => {
      const actionMap: Record<string, string> = {
        no_violation: "Marked no violation for",
        remove_post: "Removed",
        restrict_post: "Restricted",
        delete_comment: "Deleted",
        warn: "Warned",
        mute_interaction: "Muted interactions for",
        suspend_user: "Suspended",
        limit_account: "Limited account",
        violation: "Applied violation to",
      };
      return items.slice(0, 5).map((item) => ({
        actor:
          item.moderatorDisplayName?.trim() ||
          (item.moderatorUsername?.trim()
            ? `@${item.moderatorUsername.trim()}`
            : item.moderatorEmail?.trim() || "admin"),
        action: `${actionMap[item.action] ?? "Updated"} ${item.type} ${item.targetLabel || item.type}`,
        occurredAt: item.resolvedAt ?? null,
      }));
    };

    const loadRecentActivity = async () => {
      try {
        const response = await fetch(`${getApiBaseUrl()}/admin/activity/recent?limit=5`, {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error("Failed");
        const payload = await response.json() as {
          items?: Array<{ actor: string; action: string; occurredAt: string | null }>;
        };

        let normalized = (payload.items ?? []).slice(0, 5).map((item) => ({
          actor: item.actor || "admin",
          action: item.action || "Updated moderation activity",
          occurredAt: item.occurredAt ?? null,
        }));

        if (normalized.length === 0) {
          const fallbackRes = await fetch(`${getApiBaseUrl()}/admin/reports-resolved?limit=5`, {
            method: "GET",
            headers: { Authorization: `Bearer ${token}` },
          });
          if (fallbackRes.ok) {
            const fallbackPayload = await fallbackRes.json() as {
              items?: Array<{
                action: string;
                type: "post" | "comment" | "user";
                targetLabel: string;
                resolvedAt: string | null;
                moderatorDisplayName: string | null;
                moderatorUsername: string | null;
                moderatorEmail: string | null;
              }>;
            };
            normalized = mapResolvedToActivity(fallbackPayload.items ?? []);
          }
        }

        setRecentActivities(normalized);
      } catch {
        setRecentActivities([]);
      }
    };

    loadRecentActivity();
  }, [ready]);

  if (!ready) return null;

  /* ---- Formatters ---- */
  const formatNumber = (value?: number) =>
    typeof value === "number" ? value.toLocaleString() : "--";

  const formatDelta = (value: number | null | undefined) => {
    if (typeof value !== "number") return "New";
    const sign = value >= 0 ? "+" : "";
    return `${sign}${value.toFixed(1)}%`;
  };

  const formatCurrencyCompact = (value?: number | null) => {
    if (typeof value !== "number") return "--";
    if (value >= 1_000_000)
      return `${(value / 1_000_000).toFixed(1)}M VND`;
    if (value >= 1_000)
      return `${(value / 1_000).toFixed(0)}K VND`;
    return `${Math.round(value)} VND`;
  };

  const formatPercentCompact = (value?: number | null) => {
    if (typeof value !== "number") return "--";
    return `${value.toFixed(2)}%`;
  };

  const formatStorageShort = (usedBytes?: number, usedPct?: number | null) => {
    if (typeof usedBytes !== "number") return "--";
    const gb = usedBytes / 1024 / 1024 / 1024;
    const pct = typeof usedPct === "number" ? ` (${usedPct.toFixed(0)}%)` : "";
    return `${gb.toFixed(1)} GB${pct}`;
  };

  const formatUptime = (seconds?: number) => {
    if (typeof seconds !== "number") return "--";
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  };

  const formatRelativeTime = (value?: string) => {
    if (!value) return "--";
    const diffMs = Date.now() - new Date(value).getTime();
    if (Number.isNaN(diffMs)) return "--";
    const mins = Math.max(0, Math.floor(diffMs / 60000));
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const getTodayLabel = () => {
    return new Date().toLocaleDateString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
  };

  /* ---- Derived values ---- */
  const isPostDeltaNegative =
    typeof stats?.postsCreatedDeltaPct === "number" &&
    stats.postsCreatedDeltaPct < 0;
  const isNewUsersDeltaNegative =
    typeof stats?.newUsersDeltaPct === "number" && stats.newUsersDeltaPct < 0;
  const reportQueue = stats?.reportQueue ?? [];

  const adsGrossRevenue =
    typeof stats?.adsGrossRevenue30d === "number"
      ? stats.adsGrossRevenue30d
      : stats?.adsGrossRevenue24h ?? null;

  const adsSpend =
    typeof stats?.adsSpend30d === "number"
      ? stats.adsSpend30d
      : stats?.adsSpend24h ?? null;

  const adsClicks =
    typeof stats?.adsClicks30d === "number"
      ? stats.adsClicks30d
      : stats?.adsClicks24h ?? null;

  const adsImpressions =
    typeof stats?.adsImpressions30d === "number"
      ? stats.adsImpressions30d
      : stats?.adsImpressions24h ?? null;

  const adsCtr =
    typeof stats?.adsCtr30dPct === "number"
      ? stats.adsCtr30dPct
      : typeof stats?.adsCtr24hPct === "number"
        ? stats.adsCtr24hPct
        : typeof adsClicks === "number" &&
            typeof adsImpressions === "number" &&
            adsImpressions > 0
          ? (adsClicks / adsImpressions) * 100
          : null;

  const apiStatusColor =
    stats?.apiStatus === "Operational"
      ? styles.healthOk
      : stats?.apiStatus === "Degraded"
        ? styles.healthWarn
        : styles.healthDown;

  const storageIsHigh =
    typeof stats?.storageUsedPct === "number" && stats.storageUsedPct >= 80;

  const getModerationDecisionClass = (decision: "approve" | "blur" | "reject") => {
    if (decision === "reject") return styles.tagReject;
    if (decision === "blur") return styles.tagBlur;
    return styles.tagApprove;
  };

  const getSeverityClass = (
    autoHideSuggested: boolean,
    severity: "low" | "medium" | "high",
  ) => {
    if (autoHideSuggested || severity === "high") return styles.statusHigh;
    if (severity === "medium") return styles.statusMedium;
    return styles.statusLow;
  };

  /* ---- Activity parser ---- */
  type ParsedActivity = {
    actionType: string;
    entity: string;
    target: string;
    strike: string | null;
    isRaw: boolean;
  };

  const parseActivity = (action: string): ParsedActivity => {
    // Raw API format: "Action: VIOLATION · Strike: +1 · Target: post @ttt (id: uuid)"
    if (action.startsWith("Action:")) {
      const typeMatch = action.match(/Action:\s*([^·\n]+)/);
      const strikeMatch = action.match(/Strike:\s*([^·\n]+)/);
      const targetMatch = action.match(/Target:\s*(\w+)\s+(@\S+)/);
      const strikeVal = strikeMatch ? strikeMatch[1].trim() : null;
      return {
        actionType: typeMatch ? typeMatch[1].trim() : action,
        entity: targetMatch ? targetMatch[1] : "",
        target: targetMatch ? targetMatch[2] : "",
        strike: strikeVal && strikeVal !== "+0" ? strikeVal : null,
        isRaw: true,
      };
    }
    // Pre-formatted: "Removed post @username"
    return { actionType: action, entity: "", target: "", strike: null, isRaw: false };
  };

  const getActionBadgeClass = (actionType: string) => {
    const t = actionType.toUpperCase();
    if (t.includes("VIOLATION") || t.includes("SUSPEND") || t.includes("REMOVE") || t.includes("DELETE") || t.includes("REJECT"))
      return styles.actBadgeRed;
    if (t.includes("CANCEL") || t.includes("WARN") || t.includes("MUTE") || t.includes("LIMIT") || t.includes("RESTRICT"))
      return styles.actBadgeOrange;
    if (t.includes("REOPEN") || t.includes("APPROVE") || t.includes("NO_VIOLATION") || t.includes("NO VIOLATION"))
      return styles.actBadgeGreen;
    return styles.actBadgeDefault;
  };

  const shortenActor = (actor: string) => {
    // Show only the part before @ for emails
    if (actor.includes("@")) return actor.split("@")[0];
    return actor.replace(/^@/, "");
  };

  const handleReviewContent = () => {
    const queue = stats?.reportQueue ?? [];
    if (!queue.length) {
      setQuickActionToast("No open reports to review right now.");
      return;
    }
    const severe = queue.filter(
      (r) =>
        r.autoHiddenPendingReview ||
        r.escalatedPriority ||
        r.autoHideSuggested ||
        r.severity === "high",
    );
    const candidates = severe.length ? severe : queue;
    const target = [...candidates].sort((a, b) => {
      const rank = (r: typeof a) =>
        r.autoHiddenPendingReview || r.escalatedPriority
          ? 0
          : r.autoHideSuggested
            ? 1
            : r.severity === "high"
              ? 2
              : 3;
      const diff = rank(a) - rank(b);
      if (diff !== 0) return diff;
      return new Date(b.lastReportedAt).getTime() - new Date(a.lastReportedAt).getTime();
    })[0];
    if (!target) {
      setQuickActionToast("No critical report found.");
      return;
    }
    router.push(`/report/review/${target.type}/${target.targetId}`);
  };

  return (
    <div className={styles.page}>
      <div className={styles.shell}>

        {/* ---- Header ---- */}
        <div className={styles.topbar}>
          <div className={styles.titleGroup}>
            <h1 className={styles.title}>Overview</h1>
            <span className={styles.dateLabel}>{getTodayLabel()}</span>
          </div>
          <div className={styles.headerActions}>
            <Link href="/content-moderation?tab=user" className={styles.headerBtn}>
              Find User
            </Link>
            <button
              type="button"
              className={`${styles.headerBtn} ${styles.headerBtnPrimary}`}
              onClick={handleReviewContent}
            >
              Review Reports
            </button>
            <Link href="/broadcast-notice" className={styles.headerBtn}>
              Broadcast
            </Link>
          </div>
        </div>

        {/* ---- KPI Row (5 cards) ---- */}
        <section className={styles.kpiGrid}>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Total Users</span>
            <span className={styles.kpiValue}>{formatNumber(stats?.totalUsers)}</span>
            <span className={styles.kpiDelta}>All time</span>
          </div>

          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>New Users</span>
            <span className={styles.kpiValue}>{formatNumber(stats?.newUsers24h)}</span>
            <span className={`${styles.kpiDelta} ${isNewUsersDeltaNegative ? styles.kpiDeltaNeg : styles.kpiDeltaPos}`}>
              {formatDelta(stats?.newUsersDeltaPct)} vs prev 24h
            </span>
          </div>

          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Posts (7 days)</span>
            <span className={styles.kpiValue}>{formatNumber(stats?.postsCreated7d)}</span>
            <span className={`${styles.kpiDelta} ${isPostDeltaNegative ? styles.kpiDeltaNeg : styles.kpiDeltaPos}`}>
              {formatDelta(stats?.postsCreatedDeltaPct)} vs prev 7d
            </span>
          </div>

          <div className={`${styles.kpiCard} ${styles.kpiCardLive}`}>
            <span className={styles.kpiLabel}>
              <span className={styles.liveDot} aria-hidden="true" />
              Online Now
            </span>
            <span className={styles.kpiValue}>{formatNumber(stats?.onlineUsersRealtime)}</span>
            <span className={styles.kpiDelta}>Live via websocket</span>
          </div>

          <div className={`${styles.kpiCard} ${reportQueue.length > 0 ? styles.kpiCardAlert : ""}`}>
            <span className={styles.kpiLabel}>Open Reports</span>
            <span className={styles.kpiValue}>{formatNumber(stats?.openReportsCount)}</span>
            <span className={`${styles.kpiDelta} ${(stats?.highRiskReportsCount ?? 0) > 0 ? styles.kpiDeltaNeg : ""}`}>
              {(stats?.highRiskReportsCount ?? 0) > 0
                ? `${stats?.highRiskReportsCount} high risk`
                : "No high-risk"}
            </span>
          </div>
        </section>

        {/* ---- Row 1: Report Queue (priority) + Auto Moderation ---- */}
        <section className={styles.grid62}>

          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <h2 className={styles.panelTitle}>Report Queue</h2>
              <Link href="/report" className={styles.panelAction}>View all</Link>
            </div>
            <div className={`${styles.queueList} ${reportQueue.length === 0 ? styles.queueListEmpty : ""}`}>
              {reportQueue.length === 0 ? (
                <div className={styles.emptyBox}>
                  <span className={styles.emptyIcon} aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <path d="M9.75 12.75l1.5 1.5 3-3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M6 19h12a2 2 0 002-2V8.8a2 2 0 00-.66-1.48l-5-4.5A2 2 0 0013 3H6a2 2 0 00-2 2v12a2 2 0 002 2z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <p className={styles.emptyText}>Report queue is clear.</p>
                </div>
              ) : (
                reportQueue.map((item) => (
                  <Link
                    href={`/report/review/${item.type}/${item.targetId}`}
                    className={styles.queueItem}
                    key={`${item.type}:${item.targetId}`}
                  >
                    <div className={styles.queueItemTop}>
                      <span className={styles.queueTitle}>{item.title}</span>
                      <span className={`${styles.severityBadge} ${getSeverityClass(item.autoHideSuggested, item.severity)}`}>
                        {item.autoHideSuggested ? "Auto-hide" : item.severity === "high" ? "High" : item.severity === "medium" ? "Medium" : "Low"}
                      </span>
                    </div>
                    <div className={styles.queueMeta}>
                      <span className={styles.tag}>
                        {item.type === "post" ? "Post" : item.type === "comment" ? "Comment" : "User"}
                      </span>
                      <span>{item.topCategory}</span>
                      <span>{item.uniqueReporters} reporter{item.uniqueReporters !== 1 ? "s" : ""}</span>
                      <span className={styles.queueTime}>{formatRelativeTime(item.lastReportedAt)}</span>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>

          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <h2 className={styles.panelTitle}>Auto Moderation</h2>
              <Link href="/moderation" className={styles.panelAction}>View all</Link>
            </div>
            <div className={styles.queueList}>
              {moderationItems.length === 0 ? (
                <p className={styles.emptyText}>No flagged media.</p>
              ) : (
                moderationItems.map((item) => (
                  <Link
                    href={`/moderation/${item.postId}`}
                    className={styles.queueItem}
                    key={item.postId}
                  >
                    <div className={styles.queueItemTop}>
                      <span className={styles.queueTitle}>
                        {item.authorDisplayName || "Unknown"}
                        {item.authorUsername ? ` (@${item.authorUsername})` : ""}
                      </span>
                      <span className={`${styles.tag} ${getModerationDecisionClass(item.moderationDecision)}`}>
                        {item.moderationDecision.toUpperCase()}
                      </span>
                    </div>
                    {item.reasons?.[0] ? (
                      <p className={styles.moderationReason}>{item.reasons[0]}</p>
                    ) : null}
                  </Link>
                ))
              )}
            </div>
          </div>
        </section>

        {/* ---- Row 2: Ads & Revenue + System Health ---- */}
        <section className={styles.grid55}>

          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <h2 className={styles.panelTitle}>Ads & Revenue</h2>
              <Link href="/ads-management" className={styles.panelAction}>Monitor</Link>
            </div>
            <div className={styles.adsGrid}>
              <div className={styles.adsCard}>
                <span className={styles.adsLabel}>Revenue (30d)</span>
                <span className={styles.adsValue}>{formatCurrencyCompact(adsGrossRevenue)}</span>
                <span className={styles.adsHint}>Gross ad charges</span>
              </div>
              <div className={styles.adsCard}>
                <span className={styles.adsLabel}>Spend (30d)</span>
                <span className={styles.adsValue}>{formatCurrencyCompact(adsSpend)}</span>
                <span className={styles.adsHint}>Campaign burn</span>
              </div>
              <div className={styles.adsCard}>
                <span className={styles.adsLabel}>Active Campaigns</span>
                <span className={styles.adsValue}>{formatNumber(stats?.adsActiveCampaigns ?? undefined)}</span>
                <span className={styles.adsHint}>Delivering now</span>
              </div>
              <div className={styles.adsCard}>
                <span className={styles.adsLabel}>CTR (30d)</span>
                <span className={styles.adsValue}>{formatPercentCompact(adsCtr)}</span>
                <span className={styles.adsHint}>
                  {typeof adsClicks === "number" && typeof adsImpressions === "number"
                    ? `${formatNumber(adsClicks)} clicks / ${formatNumber(adsImpressions)} impressions`
                    : "No telemetry yet"}
                </span>
              </div>
            </div>
          </div>

          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <h2 className={styles.panelTitle}>System Health</h2>
            </div>
            <div className={styles.healthList}>
              <div className={styles.healthRow}>
                <div className={styles.healthInfo}>
                  <span className={styles.healthLabel}>API</span>
                  <span className={`${styles.healthStatus} ${apiStatusColor}`}>
                    {stats?.apiStatus ?? "Unavailable"}
                  </span>
                </div>
                <span className={styles.healthMeta}>
                  Uptime {formatUptime(stats?.apiUptimeSeconds)}
                </span>
              </div>
              <div className={styles.healthRow}>
                <div className={styles.healthInfo}>
                  <span className={styles.healthLabel}>Realtime</span>
                  <span className={`${styles.healthStatus} ${styles.healthOk}`}>
                    {typeof stats?.realtimeRooms === "number" ? "Active" : "Unavailable"}
                  </span>
                </div>
                <span className={styles.healthMeta}>
                  {typeof stats?.realtimeRooms === "number" && typeof stats?.realtimeParticipants === "number"
                    ? `${stats.realtimeRooms} rooms · ${stats.realtimeParticipants} participants`
                    : "No data"}
                </span>
              </div>
              <div className={styles.healthRow}>
                <div className={styles.healthInfo}>
                  <span className={styles.healthLabel}>Storage</span>
                  <span className={`${styles.healthStatus} ${storageIsHigh ? styles.healthWarn : styles.healthOk}`}>
                    {storageIsHigh ? "High usage" : "Normal"}
                  </span>
                </div>
                <span className={styles.healthMeta}>
                  {formatStorageShort(stats?.storageUsedBytes, stats?.storageUsedPct)}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ---- Recent Activity ---- */}
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>Recent Admin Activity</h2>
            <Link href="/audit" className={styles.panelAction}>View full log</Link>
          </div>
          <div className={styles.activityTable}>
            {recentActivities.length === 0 ? (
              <p className={styles.emptyText}>No recent admin actions.</p>
            ) : (
              recentActivities.map((item, index) => {
                const parsed = parseActivity(item.action);
                return (
                  <div
                    className={styles.activityRow}
                    key={`${item.actor}-${item.occurredAt ?? index}`}
                  >
                    {/* Actor */}
                    <div className={styles.activityActorWrap}>
                      <span className={styles.activityAvatar}>
                        {(item.actor[0] || "A").toUpperCase()}
                      </span>
                      <span className={styles.activityActor} title={item.actor}>
                        {shortenActor(item.actor)}
                      </span>
                    </div>

                    {/* Action */}
                    <div className={styles.activityBody}>
                      <div className={styles.activityTop}>
                        <span className={`${styles.actBadge} ${getActionBadgeClass(parsed.actionType)}`}>
                          {parsed.actionType}
                        </span>
                        {parsed.strike ? (
                          <span className={styles.actStrike}>Strike {parsed.strike}</span>
                        ) : null}
                      </div>
                      {(parsed.entity || parsed.target) ? (
                        <p className={styles.activityTarget}>
                          {parsed.entity && <span className={styles.actEntity}>{parsed.entity}</span>}
                          {parsed.target && <span>{parsed.target}</span>}
                        </p>
                      ) : !parsed.isRaw ? (
                        <p className={styles.activityTarget}>{parsed.actionType}</p>
                      ) : null}
                    </div>

                    {/* Time */}
                    <span className={styles.activityTime}>
                      {formatRelativeTime(item.occurredAt ?? undefined)}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </section>

      </div>

      {quickActionToast ? (
        <div className={styles.toast} role="status">{quickActionToast}</div>
      ) : null}
    </div>
  );
}
