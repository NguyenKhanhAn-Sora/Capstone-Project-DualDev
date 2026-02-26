"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import styles from "./report.module.css";
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

export default function ReportPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [stats, setStats] = useState<{
    openReportsCount: number;
    highRiskReportsCount: number;
    medianReportScore: number | null;
    reportQueue: Array<{
      type: "post" | "comment" | "user";
      targetId: string;
      title: string;
      topCategory: string;
      categories: string[];
      topReason: string;
      otherReasonCount: number;
      totalReports: number;
      uniqueReporters: number;
      score: number;
      severity: "low" | "medium" | "high";
      autoHideSuggested: boolean;
      lastReportedAt: string;
    }>;
  } | null>(null);

  const handleLogout = async () => {
    try {
      await fetch(`${getApiBaseUrl()}/auth/admin/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch (_err) {}

    if (typeof window !== "undefined") {
      localStorage.removeItem("adminAccessToken");
      localStorage.removeItem("adminRoles");
    }

    router.replace("/login");
  };

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
          openReportsCount: number;
          highRiskReportsCount: number;
          medianReportScore: number | null;
          reportQueue: Array<{
            type: "post" | "comment" | "user";
            targetId: string;
            title: string;
            topCategory: string;
            categories: string[];
            topReason: string;
            otherReasonCount: number;
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

  if (!ready) return null;

  const formatNumber = (value?: number) =>
    typeof value === "number" ? value.toLocaleString() : "--";

  const formatScore = (value?: number | null) =>
    typeof value === "number" ? value.toFixed(1) : "--";

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

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.topbar}>
          <div className={styles.titleGroup}>
            <span className={styles.eyebrow}>Moderation</span>
            <h1 className={styles.title}>Report Center</h1>
            <p className={styles.subtitle}>
              Prioritize reports by severity score and unique reporters.
            </p>
          </div>
          <div className={styles.topActions}>
            <Link href="/dashboard" className={styles.ghostButton}>
              Back to dashboard
            </Link>
            <button
              className={styles.ghostButton}
              type="button"
              onClick={handleLogout}
            >
              Sign out
            </button>
            <button className={styles.primaryButton} type="button">
              Open triage mode
            </button>
          </div>
        </header>

        <section className={styles.summaryGrid}>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Open queue</span>
            <span className={styles.summaryValue}>
              {formatNumber(stats?.openReportsCount)}
            </span>
            <span className={styles.summaryNote}>Live queue</span>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>High risk</span>
            <span className={styles.summaryValue}>
              {formatNumber(stats?.highRiskReportsCount)}
            </span>
            <span className={styles.summaryNote}>Auto-hide suggested</span>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Median score</span>
            <span className={styles.summaryValue}>
              {formatScore(stats?.medianReportScore)}
            </span>
            <span className={styles.summaryNote}>Current queue</span>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Avg time to review</span>
            <span className={styles.summaryValue}>14m</span>
            <span className={styles.summaryNote}>Target: 20m</span>
          </article>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2 className={styles.panelTitle}>Live report queue</h2>
              <p className={styles.panelSubtitle}>
                Sorted by severity score and latest activity.
              </p>
            </div>
            <div className={styles.filters}>
              <button className={styles.filterChip} type="button">
                All types
              </button>
              <button className={styles.filterChip} type="button">
                High priority
              </button>
              <button className={styles.filterChip} type="button">
                Auto-hide suggested
              </button>
            </div>
          </div>

          <div className={styles.tableHeader}>
            <span>Report</span>
            <span>Score</span>
            <span>Reporters</span>
            <span>Status</span>
            <span>Last update</span>
            <span></span>
          </div>

          <div className={styles.tableBody}>
            {(stats?.reportQueue ?? []).map((report, index) => (
              <div
                className={styles.tableRow}
                key={`${report.type}:${report.targetId}`}
                style={{ animationDelay: `${index * 70}ms` }}
              >
                <div className={styles.reportMain}>
                  <span className={styles.reportType}>
                    {report.type === "post"
                      ? "Post"
                      : report.type === "comment"
                        ? "Comment"
                        : "User"}
                  </span>
                  <div>
                    <p className={styles.reportTitle}>
                      {report.type === "post"
                        ? "Post"
                        : report.type === "comment"
                          ? "Comment"
                          : "User"}{" "}
                      reported for {report.topReason}
                      {report.otherReasonCount > 0
                        ? ` (+${report.otherReasonCount} other reasons)`
                        : ""}
                    </p>
                    <p className={styles.reportMeta}>
                      Categories: {report.categories.join(", ")}
                    </p>
                  </div>
                </div>
                <div className={styles.scorePill}>
                  {report.score.toFixed(1)}
                </div>
                <div className={styles.reporters}>{report.uniqueReporters}</div>
                <div
                  className={`${styles.statusPill} ${
                    report.autoHideSuggested
                      ? styles.statusHigh
                      : report.severity === "high"
                        ? styles.statusHigh
                        : report.severity === "medium"
                          ? styles.statusReview
                          : styles.statusLow
                  }`}
                >
                  {formatReportStatus(
                    report.autoHideSuggested,
                    report.severity,
                  )}
                </div>
                <div className={styles.lastUpdate}>
                  {formatRelativeTime(report.lastReportedAt)}
                </div>
                <div className={styles.rowActions}>
                  {report.autoHideSuggested ? (
                    <span className={styles.alertPill}>Auto-hide</span>
                  ) : null}
                  <Link
                    className={styles.inlineButton}
                    href={`/report/review/${report.type}/${report.targetId}`}
                  >
                    Review
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.grid}>
          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <h2 className={styles.panelTitle}>Policy cues</h2>
              <button className={styles.panelAction} type="button">
                Update rules
              </button>
            </div>
            <div className={styles.policyList}>
              <div className={styles.policyItem}>
                <span className={styles.policyBadge}>Severe</span>
                <div>
                  <p className={styles.policyTitle}>
                    Auto-hide for privacy, illegal, violence with 3+ reporters
                  </p>
                  <p className={styles.policyNote}>
                    Score threshold: 7.0 · Unique reporters: 3
                  </p>
                </div>
              </div>
              <div className={styles.policyItem}>
                <span className={styles.policyBadgeAlt}>Signals</span>
                <div>
                  <p className={styles.policyTitle}>
                    Weight reporters by account age + report frequency
                  </p>
                  <p className={styles.policyNote}>
                    Frequent reporters get diminishing weights.
                  </p>
                </div>
              </div>
              <div className={styles.policyItem}>
                <span className={styles.policyBadgeMuted}>Low risk</span>
                <div>
                  <p className={styles.policyTitle}>
                    Spam and IP reports remain visible but low priority
                  </p>
                  <p className={styles.policyNote}>
                    Queue order depends on severity score.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <h2 className={styles.panelTitle}>Team activity</h2>
              <button className={styles.panelAction} type="button">
                View log
              </button>
            </div>
            <div className={styles.activityList}>
              <div className={styles.activityItem}>
                <span className={styles.activityUser}>mod-linh</span>
                <span>Resolved report rp-1024 · Action: Warned</span>
                <span className={styles.activityTime}>8 mins ago</span>
              </div>
              <div className={styles.activityItem}>
                <span className={styles.activityUser}>superadmin</span>
                <span>Escalated user report ru-9011</span>
                <span className={styles.activityTime}>20 mins ago</span>
              </div>
              <div className={styles.activityItem}>
                <span className={styles.activityUser}>audit-bot</span>
                <span>Detected spike in spam reports</span>
                <span className={styles.activityTime}>1 hour ago</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
