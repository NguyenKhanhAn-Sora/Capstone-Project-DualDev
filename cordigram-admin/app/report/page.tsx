"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import styles from "./report.module.css";
import { getApiBaseUrl } from "@/lib/api";

type AdminPayload = { roles?: string[]; exp?: number };

const decodeJwt = (token: string): AdminPayload | null => {
  try {
    const payload = token.split(".")[1];
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
  } catch { return null; }
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
    if (!token) { router.replace("/login"); return; }
    const payload = decodeJwt(token);
    const roles = payload?.roles || [];
    const exp = payload?.exp ? payload.exp * 1000 : 0;
    if (!roles.includes("admin") || (exp && Date.now() > exp)) {
      router.replace("/login"); return;
    }
    setReady(true);
  }, [router]);

  useEffect(() => {
    if (!ready || typeof window === "undefined") return;
    const token = localStorage.getItem("adminAccessToken") || "";
    if (!token) return;

    fetch(`${getApiBaseUrl()}/admin/stats`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setStats)
      .catch(() => setStats(null));
  }, [ready]);

  /* ---- Formatters ---- */
  const fmt = (v?: number) => typeof v === "number" ? v.toLocaleString() : "--";
  const fmtScore = (v?: number | null) => typeof v === "number" ? v.toFixed(1) : "--";
  const fmtDuration = (v?: number | null) => {
    if (typeof v !== "number" || !Number.isFinite(v)) return "--";
    const r = Math.max(0, Math.round(v));
    if (r < 60) return `${r}m`;
    const h = Math.floor(r / 60), m = r % 60;
    return m ? `${h}h ${m}m` : `${h}h`;
  };
  const fmtTime = (v?: string) => {
    if (!v) return "--";
    const d = Date.now() - new Date(v).getTime();
    if (Number.isNaN(d)) return "--";
    const mins = Math.max(0, Math.floor(d / 60000));
    if (mins < 60) return `${mins}m ago`;
    const h = Math.floor(mins / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  };

  /* ---- Score color ---- */
  const scoreClass = (score: number) => {
    if (score >= 7) return styles.scoreHigh;
    if (score >= 4) return styles.scoreMed;
    return styles.scoreLow;
  };

  /* ---- Filtering ---- */
  const reportQueue = stats?.reportQueue ?? [];
  const filteredQueue = useMemo(() => reportQueue.filter((r) => {
    if (typeFilter !== "all" && r.type !== typeFilter) return false;
    if (queueFilter === "high_priority") return r.severity === "high" || r.autoHiddenPendingReview || r.escalatedPriority;
    if (queueFilter === "auto_hidden") return r.autoHiddenPendingReview;
    if (queueFilter === "escalated") return r.escalatedPriority;
    if (queueFilter === "auto_hide_suggested") return r.autoHideSuggested;
    return true;
  }), [queueFilter, reportQueue, typeFilter]);

  const slaOk = typeof stats?.avgReportReviewMinutes === "number" &&
    typeof stats?.reviewSlaTargetMinutes === "number" &&
    stats.avgReportReviewMinutes <= stats.reviewSlaTargetMinutes;

  if (!ready) return null;

  return (
    <div className={styles.page}>
      <div className={styles.shell}>

        {/* ---- Header ---- */}
        <header className={styles.topbar}>
          <div>
            <h1 className={styles.title}>Report Center</h1>
            <p className={styles.subtitle}>
              Prioritized by risk score and unique reporters
            </p>
          </div>
          <div className={styles.topActions}>
            <Link href="/report/resolved" className={styles.ghostBtn}>
              Resolved reports
            </Link>
          </div>
        </header>

        {/* ---- KPI Strip ---- */}
        <section className={styles.kpiRow}>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Open Queue</span>
            <span className={styles.kpiValue}>{fmt(stats?.openReportsCount)}</span>
            <span className={styles.kpiNote}>Pending review</span>
          </div>
          <div className={`${styles.kpiCard} ${(stats?.highRiskReportsCount ?? 0) > 0 ? styles.kpiCardAlert : ""}`}>
            <span className={styles.kpiLabel}>High Risk</span>
            <span className={styles.kpiValue}>{fmt(stats?.highRiskReportsCount)}</span>
            <span className={`${styles.kpiNote} ${(stats?.highRiskReportsCount ?? 0) > 0 ? styles.kpiNoteAlert : styles.kpiNoteOk}`}>
              {(stats?.highRiskReportsCount ?? 0) > 0 ? "Needs attention" : "All clear"}
            </span>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Median Risk Score</span>
            <span className={styles.kpiValue}>{fmtScore(stats?.medianReportScore)}</span>
            <span className={styles.kpiNote}>Current queue</span>
          </div>
          <div className={`${styles.kpiCard} ${!slaOk && typeof stats?.avgReportReviewMinutes === "number" ? styles.kpiCardWarn : ""}`}>
            <span className={styles.kpiLabel}>Avg Review Time</span>
            <span className={styles.kpiValue}>{fmtDuration(stats?.avgReportReviewMinutes)}</span>
            <span className={`${styles.kpiNote} ${slaOk ? styles.kpiNoteOk : ""}`}>
              Target: {fmtDuration(stats?.reviewSlaTargetMinutes ?? 20)}
            </span>
          </div>
        </section>

        {/* ---- Queue Panel ---- */}
        <section className={styles.panel}>

          {/* Panel header + filters */}
          <div className={styles.panelTop}>
            <div className={styles.panelTitleRow}>
              <h2 className={styles.panelTitle}>Live Report Queue</h2>
              <span className={styles.queueCount}>
                {filteredQueue.length} / {reportQueue.length} reports
              </span>
            </div>

            {/* Type filters */}
            <div className={styles.filterGroup}>
              <span className={styles.filterLabel}>Type</span>
              <div className={styles.filterChips}>
                {(["all", "post", "comment", "user"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    className={`${styles.chip} ${typeFilter === v ? styles.chipActive : ""}`}
                    onClick={() => setTypeFilter(v)}
                  >
                    {v === "all" ? "All" : v === "post" ? "Posts" : v === "comment" ? "Comments" : "Users"}
                  </button>
                ))}
              </div>
            </div>

            {/* Priority filters */}
            <div className={styles.filterGroup}>
              <span className={styles.filterLabel}>Priority</span>
              <div className={styles.filterChips}>
                {(["all", "high_priority", "auto_hidden", "escalated", "auto_hide_suggested"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    className={`${styles.chip} ${queueFilter === v ? styles.chipActive : ""}`}
                    onClick={() => setQueueFilter(v)}
                  >
                    {v === "all" ? "All" : v === "high_priority" ? "High priority" : v === "auto_hidden" ? "Auto-hidden" : v === "escalated" ? "Escalated" : "Hide suggested"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Table header */}
          <div className={styles.tableHead}>
            <span>Report</span>
            <span className={styles.thCenter}>Risk Score</span>
            <span className={styles.thCenter}>Reporters</span>
            <span>Priority</span>
            <span></span>
          </div>

          {/* Table rows */}
          <div className={styles.tableBody}>
            {filteredQueue.length === 0 ? (
              <div className={styles.emptyState}>
                <svg viewBox="0 0 24 24" aria-hidden="true" width="28" height="28">
                  <path d="M9.75 12.75l1.5 1.5 3-3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M6 19h12a2 2 0 002-2V8.8a2 2 0 00-.66-1.48l-5-4.5A2 2 0 0013 3H6a2 2 0 00-2 2v12a2 2 0 002 2z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <p>No reports match the selected filters.</p>
              </div>
            ) : (
              filteredQueue.map((report, i) => (
                <div
                  className={styles.tableRow}
                  key={`${report.type}:${report.targetId}`}
                  style={{ animationDelay: `${i * 55}ms` }}
                >
                  {/* Report info */}
                  <div className={styles.reportCell}>
                    <span className={`${styles.typeTag} ${report.type === "user" ? styles.typeTagUser : report.type === "comment" ? styles.typeTagComment : ""}`}>
                      {report.type}
                    </span>
                    <div className={styles.reportInfo}>
                      <p className={styles.reportTitle}>
                        Reported for <strong>{report.topReason}</strong>
                        {report.otherReasonCount > 0 && (
                          <span className={styles.moreReasons}> +{report.otherReasonCount} more</span>
                        )}
                      </p>
                      <p className={styles.reportMeta}>
                        {report.categories.slice(0, 3).join(" · ")}
                        <span className={styles.reportTime}>{fmtTime(report.lastReportedAt)}</span>
                      </p>
                    </div>
                  </div>

                  {/* Risk score */}
                  <div className={`${styles.scoreCell} ${scoreClass(report.score)}`}>
                    {report.score.toFixed(1)}
                  </div>

                  {/* Reporters */}
                  <div className={styles.reportersCell}>
                    <span className={styles.reportersNum}>{report.uniqueReporters}</span>
                  </div>

                  {/* Priority flags */}
                  <div className={styles.priorityCell}>
                    {report.escalatedPriority && (
                      <span className={`${styles.flag} ${styles.flagEscalated}`}>Escalated</span>
                    )}
                    {report.autoHiddenPendingReview && (
                      <span className={`${styles.flag} ${styles.flagHidden}`}>Auto-hidden</span>
                    )}
                    {report.autoHideSuggested && !report.autoHiddenPendingReview && (
                      <span className={`${styles.flag} ${styles.flagSuggest}`}>Hide suggested</span>
                    )}
                    {!report.escalatedPriority && !report.autoHiddenPendingReview && !report.autoHideSuggested && (
                      <span className={`${styles.flag} ${
                        report.severity === "high" ? styles.flagHigh :
                        report.severity === "medium" ? styles.flagMed :
                        styles.flagLow
                      }`}>
                        {report.severity === "high" ? "High" : report.severity === "medium" ? "Review" : "Low"}
                      </span>
                    )}
                  </div>

                  {/* Action */}
                  <div className={styles.actionCell}>
                    <Link
                      href={`/report/review/${report.type}/${report.targetId}`}
                      className={styles.reviewBtn}
                    >
                      Review
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

      </div>
    </div>
  );
}
