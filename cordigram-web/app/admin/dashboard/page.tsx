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
    postsCreated: number;
    newUsers24h: number;
    newUsersPrev24h: number;
    newUsersDeltaPct: number | null;
    postsCreated7d: number;
    postsCreatedPrev7d: number;
    postsCreatedDeltaPct: number | null;
  } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = localStorage.getItem("adminAccessToken") || "";
    if (!token) {
      router.replace("/admin/login");
      return;
    }

    const payload = decodeJwt(token);
    const roles = payload?.roles || [];
    const exp = payload?.exp ? payload.exp * 1000 : 0;
    if (!roles.includes("admin") || (exp && Date.now() > exp)) {
      router.replace("/admin/login");
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
          postsCreated: number;
          newUsers24h: number;
          newUsersPrev24h: number;
          newUsersDeltaPct: number | null;
          postsCreated7d: number;
          postsCreatedPrev7d: number;
          postsCreatedDeltaPct: number | null;
        };
        setStats(payload);
      } catch (_err) {
        setStats(null);
      }
    };

    loadStats();
  }, [ready]);

  if (!ready) return null;

  const formatNumber = (value?: number) =>
    typeof value === "number" ? value.toLocaleString() : "--";

  const formatDelta = (value: number | null | undefined) => {
    if (typeof value !== "number") return "New";
    const sign = value >= 0 ? "+" : "";
    return `${sign}${value.toFixed(1)}%`;
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
            <p className={styles.subtitle}>
              Overview of platform health and safety signals.
            </p>
          </div>
          <div className={styles.topActions}>
            <span className={styles.syncBadge}>Synced 2 mins ago</span>
            <button className={styles.actionButton} type="button">
              Open Moderation Queue
            </button>
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
            <span className={styles.kpiLabel}>Posts Created</span>
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
            <span className={styles.kpiValue}>64</span>
            <span className={`${styles.kpiDelta} ${styles.kpiDeltaNegative}`}>
              +18%
            </span>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Active Calls</span>
            <span className={styles.kpiValue}>42</span>
            <span className={styles.kpiDelta}>Stable</span>
          </div>
        </section>

        <section className={styles.grid}>
          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <h2 className={styles.panelTitle}>Report Queue</h2>
              <Link href="/admin/reports" className={styles.panelAction}>
                View all
              </Link>
            </div>
            <div className={styles.queueList}>
              <div className={styles.queueItem}>
                <span className={styles.queueTitle}>
                  Post reported for harassment
                </span>
                <div className={styles.queueMeta}>
                  <span className={styles.tag}>Post</span>
                  <span className={styles.status}>New</span>
                  <span>Reported 12 mins ago</span>
                </div>
              </div>
              <div className={styles.queueItem}>
                <span className={styles.queueTitle}>
                  User flagged for impersonation
                </span>
                <div className={styles.queueMeta}>
                  <span className={styles.tag}>User</span>
                  <span className={styles.status}>Investigating</span>
                  <span>Reported 1 hour ago</span>
                </div>
              </div>
              <div className={styles.queueItem}>
                <span className={styles.queueTitle}>
                  Comment contains sensitive content
                </span>
                <div className={styles.queueMeta}>
                  <span className={styles.tag}>Comment</span>
                  <span className={styles.status}>New</span>
                  <span>Reported 2 hours ago</span>
                </div>
              </div>
            </div>
          </div>

          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <h2 className={styles.panelTitle}>Safety Alerts</h2>
              <Link href="/admin/alerts" className={styles.panelAction}>
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
              <Link href="/admin/system" className={styles.panelAction}>
                Details
              </Link>
            </div>
            <div className={styles.healthGrid}>
              <div className={styles.healthItem}>
                <span className={styles.healthLabel}>API</span>
                <span className={styles.healthValue}>Operational</span>
              </div>
              <div className={styles.healthItem}>
                <span className={styles.healthLabel}>Realtime</span>
                <span className={styles.healthValue}>Stable</span>
              </div>
              <div className={styles.healthItem}>
                <span className={styles.healthLabel}>Storage</span>
                <span className={styles.healthValue}>68% Used</span>
              </div>
            </div>
          </div>

          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <h2 className={styles.panelTitle}>Quick Actions</h2>
              <Link href="/admin/tools" className={styles.panelAction}>
                Open tools
              </Link>
            </div>
            <div className={styles.quickActions}>
              <div className={styles.quickCard}>
                <span className={styles.quickTitle}>Find User</span>
                <span className={styles.quickDesc}>
                  Locate a user to review profile or reports.
                </span>
                <Link href="/admin/users" className={styles.quickButton}>
                  Search
                </Link>
              </div>
              <div className={styles.quickCard}>
                <span className={styles.quickTitle}>Review Content</span>
                <span className={styles.quickDesc}>
                  Jump into the latest flagged posts.
                </span>
                <Link href="/admin/reports" className={styles.quickButton}>
                  Review
                </Link>
              </div>
              <div className={styles.quickCard}>
                <span className={styles.quickTitle}>Broadcast Notice</span>
                <span className={styles.quickDesc}>
                  Send a system notice to all users.
                </span>
                <Link
                  href="/admin/notifications"
                  className={styles.quickButton}
                >
                  Draft
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>Recent Admin Activity</h2>
            <Link href="/admin/audit" className={styles.panelAction}>
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
