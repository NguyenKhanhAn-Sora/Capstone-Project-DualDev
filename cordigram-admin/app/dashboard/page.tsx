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
    apiStatus: "Operational" | "Degraded" | "Down";
    apiUptimeSeconds: number;
    openReportsCount: number;
    highRiskReportsCount: number;
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
          apiStatus: "Operational" | "Degraded" | "Down";
          apiUptimeSeconds: number;
          openReportsCount: number;
          highRiskReportsCount: number;
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
            lastReportedAt: string;
          }>;
        };
        setStats(payload);
      } catch (_err) {
        setStats(null);
      }
    };

    loadStats();
  }, [ready]);

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

  if (!ready) return null;

  const formatNumber = (value?: number) =>
    typeof value === "number" ? value.toLocaleString() : "--";

  const formatDelta = (value: number | null | undefined) => {
    if (typeof value !== "number") return "New";
    const sign = value >= 0 ? "+" : "";
    return `${sign}${value.toFixed(1)}%`;
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

  const isPostDeltaNegative =
    typeof stats?.postsCreatedDeltaPct === "number" &&
    stats.postsCreatedDeltaPct < 0;
  const isNewUsersDeltaNegative =
    typeof stats?.newUsersDeltaPct === "number" && stats.newUsersDeltaPct < 0;

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
            <h2 className={styles.panelTitle}>Auto Moderation (Basic)</h2>
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
                    <span className={styles.tag}>
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
            <div className={styles.queueList}>
              {(stats?.reportQueue ?? []).map((item) => (
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
                        item.severity === "low" ? styles.statusLow : ""
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
              ))}
            </div>
          </div>

          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <h2 className={styles.panelTitle}>Safety Alerts</h2>
              <Link href="/alerts" className={styles.panelAction}>
                Review
              </Link>
            </div>
            <div className={styles.alerts}>
              <div className={styles.alertCard}>
                <span className={styles.alertTitle}>
                  Reports spike in #nightfeed
                </span>
                <span className={styles.alertNote}>
                  24 reports in the last hour. Consider manual review.
                </span>
              </div>
              <div className={styles.alertCard}>
                <span className={styles.alertTitle}>
                  High repeat offender detected
                </span>
                <span className={styles.alertNote}>
                  User has 5 reports in 24h across multiple posts.
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
              <Link href="/tools" className={styles.panelAction}>
                Open tools
              </Link>
            </div>
            <div className={styles.quickActions}>
              <div className={styles.quickCard}>
                <span className={styles.quickTitle}>Find User</span>
                <span className={styles.quickDesc}>
                  Locate a user to review profile or reports.
                </span>
                <Link href="/users" className={styles.quickButton}>
                  Search
                </Link>
              </div>
              <div className={styles.quickCard}>
                <span className={styles.quickTitle}>Review Content</span>
                <span className={styles.quickDesc}>
                  Jump into the latest flagged posts.
                </span>
                <Link href="/reports" className={styles.quickButton}>
                  Review
                </Link>
              </div>
              <div className={styles.quickCard}>
                <span className={styles.quickTitle}>Broadcast Notice</span>
                <span className={styles.quickDesc}>
                  Send a system notice to all users.
                </span>
                <Link href="/notifications" className={styles.quickButton}>
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
            <div className={styles.activityRow}>
              <span className={styles.activityActor}>superadmin</span>
              <span className={styles.activityAction}>
                Resolved report #1293 (post harassment)
              </span>
              <span>12 mins ago</span>
            </div>
            <div className={styles.activityRow}>
              <span className={styles.activityActor}>mod-ly</span>
              <span className={styles.activityAction}>
                Suspended user @riverlane for impersonation
              </span>
              <span>48 mins ago</span>
            </div>
            <div className={styles.activityRow}>
              <span className={styles.activityActor}>audit-bot</span>
              <span className={styles.activityAction}>
                Detected spike in report volume for reels
              </span>
              <span>2 hours ago</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
