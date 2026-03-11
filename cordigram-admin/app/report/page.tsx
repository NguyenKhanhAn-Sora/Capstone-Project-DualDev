"use client";

import { useEffect, useMemo, useState } from "react";
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
  const [typeFilter, setTypeFilter] = useState<"all" | "post" | "comment" | "user">("all");
  const [queueFilter, setQueueFilter] = useState<
    "all" | "high_priority" | "auto_hidden" | "escalated" | "auto_hide_suggested"
  >("all");
  const [stats, setStats] = useState<{
    openReportsCount: number;
    highRiskReportsCount: number;
    medianReportScore: number | null;
    avgReportReviewMinutes: number | null;
    reviewSlaTargetMinutes: number;
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
      autoHiddenPendingReview: boolean;
      escalatedPriority: boolean;
      lastReportedAt: string;
    }>;
  } | null>(null);

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
          avgReportReviewMinutes: number | null;
          reviewSlaTargetMinutes: number;
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
            autoHiddenPendingReview: boolean;
            escalatedPriority: boolean;
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

  const formatNumber = (value?: number) =>
    typeof value === "number" ? value.toLocaleString() : "--";

  const formatScore = (value?: number | null) =>
    typeof value === "number" ? value.toFixed(1) : "--";

  const formatDurationMinutes = (value?: number | null) => {
    if (typeof value !== "number" || !Number.isFinite(value)) return "--";
    const rounded = Math.max(0, Math.round(value));
    if (rounded < 60) return `${rounded}m`;
    const hours = Math.floor(rounded / 60);
    const mins = rounded % 60;
    if (!mins) return `${hours}h`;
    return `${hours}h ${mins}m`;
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
    autoHiddenPendingReview: boolean,
    escalatedPriority: boolean,
    severity: "low" | "medium" | "high",
  ) => {
    if (escalatedPriority) return "Escalated priority";
    if (autoHiddenPendingReview) return "Auto-hidden pending review";
    if (autoHideSuggested) return "Auto-hide suggested";
    if (severity === "high") return "High priority";
    if (severity === "medium") return "Review";
    return "Low priority";
  };

  const reportQueue = stats?.reportQueue ?? [];
  const filteredQueue = useMemo(() => {
    return reportQueue.filter((report) => {
      const typeMatched = typeFilter === "all" || report.type === typeFilter;
      if (!typeMatched) return false;

      if (queueFilter === "all") return true;
      if (queueFilter === "high_priority") {
        return (
          report.severity === "high" ||
          report.autoHiddenPendingReview ||
          report.escalatedPriority
        );
      }
      if (queueFilter === "auto_hidden") {
        return report.autoHiddenPendingReview;
      }
      if (queueFilter === "escalated") {
        return report.escalatedPriority;
      }
      if (queueFilter === "auto_hide_suggested") {
        return report.autoHideSuggested;
      }
      return true;
    });
  }, [queueFilter, reportQueue, typeFilter]);

  if (!ready) return null;

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
            <Link href="/report/resolved" className={styles.ghostButton}>
              Resolved reports
            </Link>
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
            <span className={styles.summaryValue}>
              {formatDurationMinutes(stats?.avgReportReviewMinutes)}
            </span>
            <span className={styles.summaryNote}>
              Target: {formatDurationMinutes(stats?.reviewSlaTargetMinutes ?? 20)}
            </span>
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
              <button
                className={`${styles.filterChip} ${
                  typeFilter === "all" ? styles.filterChipActive : ""
                }`}
                type="button"
                onClick={() => setTypeFilter("all")}
              >
                All types
              </button>
              <button
                className={`${styles.filterChip} ${
                  typeFilter === "post" ? styles.filterChipActive : ""
                }`}
                type="button"
                onClick={() => setTypeFilter("post")}
              >
                Posts
              </button>
              <button
                className={`${styles.filterChip} ${
                  typeFilter === "comment" ? styles.filterChipActive : ""
                }`}
                type="button"
                onClick={() => setTypeFilter("comment")}
              >
                Comments
              </button>
              <button
                className={`${styles.filterChip} ${
                  typeFilter === "user" ? styles.filterChipActive : ""
                }`}
                type="button"
                onClick={() => setTypeFilter("user")}
              >
                Users
              </button>
              <button
                className={`${styles.filterChip} ${
                  queueFilter === "all" ? styles.filterChipActive : ""
                }`}
                type="button"
                onClick={() => setQueueFilter("all")}
              >
                All priority
              </button>
              <button
                className={`${styles.filterChip} ${
                  queueFilter === "high_priority" ? styles.filterChipActive : ""
                }`}
                type="button"
                onClick={() => setQueueFilter("high_priority")}
              >
                High priority
              </button>
              <button
                className={`${styles.filterChip} ${
                  queueFilter === "auto_hidden" ? styles.filterChipActive : ""
                }`}
                type="button"
                onClick={() => setQueueFilter("auto_hidden")}
              >
                Auto-hidden
              </button>
              <button
                className={`${styles.filterChip} ${
                  queueFilter === "escalated" ? styles.filterChipActive : ""
                }`}
                type="button"
                onClick={() => setQueueFilter("escalated")}
              >
                Escalated
              </button>
              <button
                className={`${styles.filterChip} ${
                  queueFilter === "auto_hide_suggested"
                    ? styles.filterChipActive
                    : ""
                }`}
                type="button"
                onClick={() => setQueueFilter("auto_hide_suggested")}
              >
                Auto-hide suggested
              </button>
            </div>
          </div>

          <div className={styles.filterSummary}>
            Showing {filteredQueue.length} / {reportQueue.length} reports
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
            {filteredQueue.map((report, index) => (
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
                    report.escalatedPriority
                      ? styles.statusHigh
                      : report.autoHiddenPendingReview
                        ? styles.statusHigh
                        : report.autoHideSuggested
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
                    report.autoHiddenPendingReview,
                    report.escalatedPriority,
                    report.severity,
                  )}
                </div>
                <div className={styles.lastUpdate}>
                  {formatRelativeTime(report.lastReportedAt)}
                </div>
                <div className={styles.rowActions}>
                  {report.escalatedPriority ? (
                    <span className={styles.escalatedPill}>Escalated</span>
                  ) : null}
                  {report.autoHiddenPendingReview ? (
                    <span className={styles.alertPill}>Auto-hidden</span>
                  ) : null}
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
            {filteredQueue.length === 0 ? (
              <div className={styles.emptyState}>
                No reports match the selected filters.
              </div>
            ) : null}
          </div>
        </section>

      </div>
    </div>
  );
}
