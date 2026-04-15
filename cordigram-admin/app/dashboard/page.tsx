"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
      moderationDecision: 'approve' | 'blur' | 'reject';
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
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error("Failed to load stats");
        }

        const payload = (await response.json()) as {
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
        };
        setStats(payload);
      } catch (_err) {
        // Keep previous snapshot to avoid KPI flicker on transient failures.
      }
    };

    loadStats();
    const intervalId = window.setInterval(loadStats, 10000);
    return () => window.clearInterval(intervalId);
  }, [ready]);

  useEffect(() => {
    if (!quickActionToast) return;
    const timer = window.setTimeout(() => {
      setQuickActionToast(null);
    }, 2800);
    return () => window.clearTimeout(timer);
  }, [quickActionToast]);

  useEffect(() => {
    if (!ready || typeof window === 'undefined') return;
    const token = localStorage.getItem('adminAccessToken') || '';
    if (!token) return;

    const loadModeration = async () => {
      try {
        const response = await fetch(
          `${getApiBaseUrl()}/admin/moderation/media`,
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );

        if (!response.ok) {
          throw new Error('Failed to load moderation queue');
        }

        const payload = (await response.json()) as {
          items: Array<{
            postId: string;
            authorDisplayName: string | null;
            authorUsername: string | null;
            moderationDecision: 'approve' | 'blur' | 'reject';
            reasons: string[];
            createdAt: string | null;
          }>;
        };

        setModerationItems((payload.items ?? []).slice(0, 3));
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
        action: `${actionMap[item.action] ?? "Updated"} ${
          item.type
        } ${item.targetLabel || item.type}`,
        occurredAt: item.resolvedAt ?? null,
      }));
    };

    const loadRecentActivityFallback = async () => {
      const response = await fetch(`${getApiBaseUrl()}/admin/reports-resolved?limit=5`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to load fallback recent activity");
      }

      const payload = (await response.json()) as {
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

      return mapResolvedToActivity(payload.items ?? []);
    };

    const loadRecentActivity = async () => {
      try {
        const response = await fetch(
          `${getApiBaseUrl()}/admin/activity/recent?limit=5`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );

        if (!response.ok) {
          throw new Error("Failed to load recent activity");
        }

        const payload = (await response.json()) as {
          items?: Array<{
            actor: string;
            action: string;
            occurredAt: string | null;
          }>;
        };

        let normalized = (payload.items ?? []).slice(0, 5).map((item) => ({
          actor: item.actor || "admin",
          action: item.action || "Updated moderation activity",
          occurredAt: item.occurredAt ?? null,
        }));

        if (normalized.length === 0) {
          normalized = await loadRecentActivityFallback();
        }

        setRecentActivities(normalized);
      } catch {
        try {
          const fallback = await loadRecentActivityFallback();
          setRecentActivities(fallback);
        } catch {
          setRecentActivities([]);
        }
      }
    };

    loadRecentActivity();
  }, [ready]);

  if (!ready) return null;

  const formatNumber = (value?: number) =>
    typeof value === "number" ? value.toLocaleString() : "--";

  const formatDelta = (value: number | null | undefined) => {
    if (typeof value !== "number") return "New";
    const sign = value >= 0 ? "+" : "";
    return `${sign}${value.toFixed(1)}%`;
  };

  const formatCurrencyCompact = (value?: number | null) => {
    if (typeof value !== "number") return "--";
    return `${new Intl.NumberFormat("vi-VN", {
      maximumFractionDigits: 0,
    }).format(Math.round(value))} VND`;
  };

  const formatPercentCompact = (value?: number | null) => {
    if (typeof value !== "number") return "--";
    return `${value.toFixed(2)}%`;
  };

  const formatStorage = (
    usedBytes?: number,
    limitBytes?: number | null,
    usedPct?: number | null,
  ) => {
    if (typeof usedBytes !== "number") return "--";
    const gb = (value: number) => value / 1024 / 1024 / 1024;
    const usedLabel = `${gb(usedBytes).toFixed(1)} GB`;
    const limitLabel =
      typeof limitBytes === "number" ? `${gb(limitBytes).toFixed(1)} GB` : "--";
    const pctLabel =
      typeof usedPct === "number" ? `${usedPct.toFixed(0)}%` : "--";
    return `${usedLabel} / ${limitLabel} (${pctLabel})`;
  };

  const formatRealtime = (
    rooms?: number | null,
    participants?: number | null,
  ) => {
    if (typeof rooms !== "number" || typeof participants !== "number") {
      return "Unavailable";
    }
    return `${rooms} rooms / ${participants} participants`;
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

  const formatApiStatus = (
    status?: "Operational" | "Degraded" | "Down",
    uptimeSeconds?: number,
  ) => {
    if (!status) return "Unavailable";
    return `${status} · Uptime ${formatUptime(uptimeSeconds)}`;
  };

  const formatRelativeTime = (value?: string) => {
    if (!value) return "--";
    const diffMs = Date.now() - new Date(value).getTime();
    if (Number.isNaN(diffMs)) return "--";
    const mins = Math.max(0, Math.floor(diffMs / 60000));
    if (mins < 60) return `${mins} mins ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} hours ago`;
    const days = Math.floor(hours / 24);
    return `${days} days ago`;
  };

  const formatReportStatus = (
    autoHideSuggested: boolean,
    severity: "low" | "medium" | "high",
  ) => {
    if (autoHideSuggested) return "Auto-hide suggested";
    if (severity === "high") return "High priority";
    if (severity === "medium") return "Review";
    return "Low priority";
  };

  const getModerationDecisionClass = (
    decision: "approve" | "blur" | "reject",
  ) => {
    if (decision === "reject") return styles.tagReject;
    if (decision === "blur") return styles.tagBlur;
    return styles.tagApprove;
  };

  const getReportStatusClass = (
    autoHideSuggested: boolean,
    severity: "low" | "medium" | "high",
  ) => {
    if (autoHideSuggested || severity === "high") return styles.statusHigh;
    if (severity === "medium") return styles.statusMedium;
    return styles.statusLow;
  };

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

  const handleReviewContentQuickAction = () => {
    const queue = stats?.reportQueue ?? [];
    if (!queue.length) {
      setQuickActionToast("No open reports to review right now.");
      return;
    }

    const severeCandidates = queue.filter(
      (item) =>
        Boolean(item.autoHiddenPendingReview) ||
        Boolean(item.escalatedPriority) ||
        Boolean(item.autoHideSuggested) ||
        item.severity === "high",
    );

    if (!severeCandidates.length) {
      setQuickActionToast("No critical report found right now.");
      return;
    }

    const priorityRank = (item: {
      autoHiddenPendingReview?: boolean;
      escalatedPriority?: boolean;
      autoHideSuggested: boolean;
      severity: "low" | "medium" | "high";
    }) => {
      if (item.autoHiddenPendingReview || item.escalatedPriority) return 0;
      if (item.autoHideSuggested) return 1;
      if (item.severity === "high") return 2;
      return 3;
    };

    const target = [...severeCandidates].sort((a, b) => {
      const rankDiff = priorityRank(a) - priorityRank(b);
      if (rankDiff !== 0) return rankDiff;
      const aTime = new Date(a.lastReportedAt).getTime();
      const bTime = new Date(b.lastReportedAt).getTime();
      return bTime - aTime;
    })[0];

    if (!target) {
      setQuickActionToast("No critical report found right now.");
      return;
    }

    router.push(`/report/review/${target.type}/${target.targetId}`);
  };

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <div className={styles.topbar}>
          <div className={styles.titleGroup}>
            <span className={styles.eyebrow}>Admin Dashboard</span>
            <h1 className={styles.title}>Welcome back, Admin</h1>
          </div>
        </div>

        <section className={styles.kpiGrid}>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Total Users</span>
            <span className={styles.kpiValue}>
              {formatNumber(stats?.totalUsers)}
            </span>
            <span className={styles.kpiDelta}>All time</span>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>New Users (24h)</span>
            <span className={styles.kpiValue}>
              {formatNumber(stats?.newUsers24h)}
            </span>
            <span
              className={`${styles.kpiDelta} ${
                isNewUsersDeltaNegative ? styles.kpiDeltaNegative : ""
              }`}
            >
              {formatDelta(stats?.newUsersDeltaPct)}
            </span>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Posts Created (7 days)</span>
            <span className={styles.kpiValue}>
              {formatNumber(stats?.postsCreated7d)}
            </span>
            <span
              className={`${styles.kpiDelta} ${
                isPostDeltaNegative ? styles.kpiDeltaNegative : ""
              }`}
            >
              {formatDelta(stats?.postsCreatedDeltaPct)}
            </span>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Online Users (Realtime)</span>
            <span className={styles.kpiValue}>
              {formatNumber(stats?.onlineUsersRealtime)}
            </span>
            <span className={styles.kpiDelta}>Live sockets</span>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Open Reports</span>
            <span className={styles.kpiValue}>
              {formatNumber(stats?.openReportsCount)}
            </span>
            <span className={`${styles.kpiDelta} ${styles.kpiDeltaNegative}`}>
              High risk: {formatNumber(stats?.highRiskReportsCount)}
            </span>
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>Auto Moderation</h2>
            <Link href="/moderation" className={styles.panelAction}>
              Open details
            </Link>
          </div>
          <div className={styles.queueList}>
            {moderationItems.length === 0 ? (
              <p className={styles.emptyState}>No moderated media yet.</p>
            ) : (
              moderationItems.map((item) => (
                <div className={styles.queueItem} key={item.postId}>
                  <span className={styles.queueTitle}>
                    {item.authorDisplayName || 'Unknown'}
                    {item.authorUsername ? ` (@${item.authorUsername})` : ''}
                  </span>
                  <div className={styles.queueMeta}>
                    <span
                      className={`${styles.tag} ${getModerationDecisionClass(
                        item.moderationDecision,
                      )}`}
                    >
                      {item.moderationDecision.toUpperCase()}
                    </span>
                    {item.reasons?.[0] ? <span>{item.reasons[0]}</span> : null}
                    <Link
                      href={`/moderation/${item.postId}`}
                      className={styles.panelAction}
                    >
                      View
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className={styles.grid}>
          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <h2 className={styles.panelTitle}>Report Queue</h2>
              <Link href="/report" className={styles.panelAction}>
                View all
              </Link>
            </div>
            <div
              className={`${styles.queueList} ${
                reportQueue.length === 0 ? styles.queueListEmpty : ""
              }`}
            >
              {reportQueue.length === 0 ? (
                <div className={styles.reportQueueEmpty}>
                  <span className={styles.reportQueueEmptyIcon} aria-hidden="true">
                    <svg
                      viewBox="0 0 24 24"
                      focusable="false"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M9.75 12.75l1.5 1.5 3-3"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M6 19h12a2 2 0 002-2V8.8a2 2 0 00-.66-1.48l-5-4.5A2 2 0 0013 3H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  <p className={`${styles.emptyState} ${styles.reportQueueEmptyText}`}>
                    Report queue is clear. No reports need review right now.
                  </p>
                </div>
              ) : (
                reportQueue.map((item) => (
                  <div
                    className={styles.queueItem}
                    key={`${item.type}:${item.targetId}`}
                  >
                    <span className={styles.queueTitle}>{item.title}</span>
                    <div className={styles.queueMeta}>
                      <span className={styles.tag}>
                        {item.type === "post"
                          ? "Post"
                          : item.type === "comment"
                            ? "Comment"
                            : "User"}
                      </span>
                      <span
                        className={`${styles.status} ${
                          getReportStatusClass(
                            item.autoHideSuggested,
                            item.severity,
                          )
                        }`}
                      >
                        {formatReportStatus(
                          item.autoHideSuggested,
                          item.severity,
                        )}
                      </span>
                      <span>
                        Score {item.score.toFixed(1)} · {item.uniqueReporters}{" "}
                        reporters
                      </span>
                      <span>{formatRelativeTime(item.lastReportedAt)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <h2 className={styles.panelTitle}>Ads & Revenue</h2>
              <Link href="/ads-management" className={styles.panelAction}>
                Monitor
              </Link>
            </div>
            <div className={styles.adsMetricGrid}>
              <div className={styles.adsMetricCard}>
                <span className={styles.adsMetricLabel}>Gross Revenue (Last 30 Days)</span>
                <span className={styles.adsMetricValue}>{formatCurrencyCompact(adsGrossRevenue)}</span>
                <span className={styles.adsMetricHint}>All completed ad charges</span>
              </div>

              <div className={styles.adsMetricCard}>
                <span className={styles.adsMetricLabel}>Ad Spend (Last 30 Days)</span>
                <span className={styles.adsMetricValue}>{formatCurrencyCompact(adsSpend)}</span>
                <span className={styles.adsMetricHint}>Running campaign burn</span>
              </div>

              <div className={styles.adsMetricCard}>
                <span className={styles.adsMetricLabel}>Active Campaigns</span>
                <span className={styles.adsMetricValue}>{formatNumber(stats?.adsActiveCampaigns ?? undefined)}</span>
                <span className={styles.adsMetricHint}>Currently delivering</span>
              </div>

              <div className={styles.adsMetricCard}>
                <span className={styles.adsMetricLabel}>CTR (Last 30 Days)</span>
                <span className={styles.adsMetricValue}>{formatPercentCompact(adsCtr)}</span>
                <span className={styles.adsMetricHint}>
                  {typeof adsClicks === "number" && typeof adsImpressions === "number"
                    ? `${formatNumber(adsClicks)} clicks / ${formatNumber(adsImpressions)} impressions`
                    : "No campaign telemetry yet"}
                </span>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.grid}>
          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <h2 className={styles.panelTitle}>System Health</h2>
              <Link href="/system" className={styles.panelAction}>
                Details
              </Link>
            </div>
            <div className={styles.healthGrid}>
              <div className={styles.healthItem}>
                <span className={styles.healthLabel}>API</span>
                <span className={styles.healthValue}>
                  {formatApiStatus(stats?.apiStatus, stats?.apiUptimeSeconds)}
                </span>
              </div>
              <div className={styles.healthItem}>
                <span className={styles.healthLabel}>Realtime</span>
                <span className={styles.healthValue}>
                  {formatRealtime(
                    stats?.realtimeRooms,
                    stats?.realtimeParticipants,
                  )}
                </span>
              </div>
              <div className={styles.healthItem}>
                <span className={styles.healthLabel}>Storage</span>
                <span className={styles.healthValue}>
                  {formatStorage(
                    stats?.storageUsedBytes,
                    stats?.storageLimitBytes,
                    stats?.storageUsedPct,
                  )}
                </span>
              </div>
            </div>
          </div>

          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <h2 className={styles.panelTitle}>Quick Actions</h2>
            </div>
            <div className={styles.quickActions}>
              <div className={styles.quickCard}>
                <span className={styles.quickTitle}>Find User</span>
                <span className={styles.quickDesc}>
                  Locate a user to review profile or reports.
                </span>
                <Link href="/content-moderation?tab=user" className={styles.quickButton}>
                  Search
                </Link>
              </div>
              <div className={styles.quickCard}>
                <span className={styles.quickTitle}>Review Content</span>
                <span className={styles.quickDesc}>
                  Jump into the latest flagged posts.
                </span>
                <button
                  type="button"
                  className={styles.quickButton}
                  onClick={handleReviewContentQuickAction}
                >
                  Review
                </button>
              </div>
              <div className={styles.quickCard}>
                <span className={styles.quickTitle}>Broadcast Notice</span>
                <span className={styles.quickDesc}>
                  Send a system notice to all users.
                </span>
                <Link href="/broadcast-notice" className={styles.quickButton}>
                  Draft
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>Recent Admin Activity</h2>
            <Link href="/audit" className={styles.panelAction}>
              View logs
            </Link>
          </div>
          <div className={styles.activityTable}>
            {recentActivities.length === 0 ? (
              <div className={styles.activityRow}>
                <span className={styles.activityActor}>--</span>
                <span className={styles.activityAction}>No recent admin actions.</span>
                <span>--</span>
              </div>
            ) : (
              recentActivities.map((item, index) => (
                <div className={styles.activityRow} key={`${item.actor}-${item.occurredAt ?? index}`}>
                  <span className={styles.activityActor}>{item.actor}</span>
                  <span className={styles.activityAction}>{item.action}</span>
                  <span>{formatRelativeTime(item.occurredAt ?? undefined)}</span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
      {quickActionToast ? <div className={styles.quickToast}>{quickActionToast}</div> : null}
    </div>
  );
}
