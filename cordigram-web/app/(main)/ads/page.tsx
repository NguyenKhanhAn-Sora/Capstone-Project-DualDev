"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { getAdsDashboard, type AdsDashboardResponse } from "@/lib/api";
import styles from "./ads.module.css";

const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);

const integer = (value: number) => new Intl.NumberFormat("en-US").format(value);

const pct = (value: number) => `${value.toFixed(2)}%`;

type CampaignStatus = "active" | "hidden" | "paused" | "canceled" | "completed";

function EmptyMegaphoneIcon() {
  return (
    <svg
      aria-hidden
      width="72"
      height="72"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M4 12V9.5A1.5 1.5 0 0 1 5.5 8H9l7-3v14l-7-3H5.5A1.5 1.5 0 0 1 4 14.5V12Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M9 16.2 10.4 20H7.8L6.6 16"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M18.5 9.4c.9.7 1.5 1.8 1.5 3s-.6 2.3-1.5 3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function GoalIcon() {
  return (
    <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 5V3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function BudgetIcon() {
  return (
    <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none">
      <rect x="3.5" y="5" width="17" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3.5 9.5h17" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 14h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function CreativeIcon() {
  return (
    <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M12 3 14 8l5 2-5 2-2 5-2-5-5-2 5-2 2-5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M18 17.5 19 20l2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1 1-2.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

export default function AdsPage() {
  const canRender = useRequireAuth();
  const router = useRouter();
  const t = useTranslations("ads");
  const [dashboard, setDashboard] = useState<AdsDashboardResponse | null>(null);
  const [loadingDashboard, setLoadingDashboard] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const token =
      window.localStorage.getItem("accessToken") ||
      window.localStorage.getItem("token");

    if (!token) {
      setDashboard(null);
      setLoadingDashboard(false);
      return;
    }

    let cancelled = false;
    setLoadingDashboard(true);
    setLoadError("");

    getAdsDashboard({ token })
      .then((result) => {
        if (cancelled) return;
        setDashboard(result);
      })
      .catch((error) => {
        if (cancelled) return;
        setDashboard(null);
        setLoadError(error instanceof Error ? error.message : t("dashboard.loadFailed"));
      })
      .finally(() => {
        if (cancelled) return;
        setLoadingDashboard(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const hasCreatedAnyAd = (dashboard?.campaigns?.length ?? 0) > 0;

  const summary = useMemo(
    () =>
      dashboard?.summary ?? {
        totalBudget: 0,
        totalSpent: 0,
        impressions: 0,
        reach: 0,
        clicks: 0,
        views: 0,
        likes: 0,
        comments: 0,
        reposts: 0,
        engagements: 0,
        totalDwellMs: 0,
        dwellSamples: 0,
        activeCount: 0,
        ctr: 0,
        averageDwellMs: 0,
        engagementRate: 0,
      },
    [dashboard],
  );

  const trendData = dashboard?.trend ?? [];
  const campaigns = dashboard?.campaigns ?? [];
  const activeCampaignsPreview = useMemo(
    () =>
      campaigns
        .filter((item) => item.status === "active")
        .sort(
          (a, b) =>
            new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime(),
        )
        .slice(0, 5),
    [campaigns],
  );

  const maxTrendSpend = useMemo(
    () => Math.max(...trendData.map((item) => item.impressions), 1),
    [trendData],
  );

  if (!canRender) return null;
  if (loadingDashboard) {
    return (
      <div className={styles.page}>
        <div className={styles.backdropShape} aria-hidden />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.backdropShape} aria-hidden />

      {!hasCreatedAnyAd ? (
        <section className={styles.emptyWrap}>
          <div className={styles.emptyCard}>
            <div className={styles.emptyVisual}>
              <EmptyMegaphoneIcon />
            </div>
            <h2 className={styles.emptyTitle}>{t("empty.title")}</h2>
            {loadError ? <p className={styles.cardSubtitle}>{loadError}</p> : null}

            <div className={styles.emptyChecklist}>
              <div className={styles.checkItem}>
                <span className={styles.checkIcon}>
                  <GoalIcon />
                </span>
                <span>{t("empty.goal")}</span>
              </div>
              <div className={styles.checkItem}>
                <span className={styles.checkIcon}>
                  <BudgetIcon />
                </span>
                <span>{t("empty.budget")}</span>
              </div>
              <div className={styles.checkItem}>
                <span className={styles.checkIcon}>
                  <CreativeIcon />
                </span>
                <span>{t("empty.creative")}</span>
              </div>
            </div>

            <div className={styles.emptyActions}>
              <button
                type="button"
                className={styles.emptyCtaBtn}
                onClick={() => router.push("/ads/create")}
              >
                {t("empty.cta")}
              </button>
            </div>
          </div>
        </section>
      ) : (
        <>
          <section className={styles.dashboardTop}>
            <button
              type="button"
              className={`${styles.primaryBtn} ${styles.primaryBtnCompact}`}
              onClick={() => router.push("/ads/create")}
            >
              {t("dashboard.createNew")}
            </button>
          </section>

          <section className={styles.metricsGrid}>
            <article className={styles.metricCard}>
              <p className={styles.metricLabel}>{t("metrics.totalBudget")}</p>
              <p className={styles.metricValue}>{money(summary.totalBudget)}</p>
              <p className={styles.metricHint}>{t("metrics.spentHint", { value: money(summary.totalSpent) })}</p>
            </article>

            <article className={styles.metricCard}>
              <p className={styles.metricLabel}>{t("metrics.impressions")}</p>
              <p className={styles.metricValue}>{integer(summary.impressions)}</p>
              <p className={styles.metricHint}>{t("metrics.reachHint", { value: integer(summary.reach) })}</p>
            </article>

            <article className={styles.metricCard}>
              <p className={styles.metricLabel}>{t("metrics.averageCtr")}</p>
              <p className={styles.metricValue}>{pct(summary.ctr)}</p>
              <p className={styles.metricHint}>{t("metrics.clicksHint", { value: integer(summary.clicks) })}</p>
            </article>

            <article className={styles.metricCard}>
              <p className={styles.metricLabel}>{t("metrics.activeCampaigns")}</p>
              <p className={styles.metricValue}>{summary.activeCount}</p>
              <p className={styles.metricHint}>{t("metrics.liveCampaigns")}</p>
            </article>
          </section>

          <section className={styles.contentGrid}>
            <article className={styles.chartCard}>
              <div className={styles.cardHead}>
                <div>
                  <h3 className={styles.cardTitle}>{t("chart.title")}</h3>
                  <p className={styles.cardSubtitle}>
                    {t("chart.subtitle")}
                  </p>
                </div>
              </div>

              <div className={styles.chartBars}>
                {trendData.map((item) => (
                  <div key={item.day} className={styles.barCol}>
                    <div
                      className={styles.bar}
                      style={{
                        height: `${Math.max((item.impressions / maxTrendSpend) * 100, 8)}%`,
                      }}
                      title={`${item.day}: ${integer(item.impressions)} impressions - ${integer(item.clicks)} clicks`}
                    />
                    <span className={styles.barLabel}>{item.day.slice(5)}</span>
                  </div>
                ))}
              </div>
            </article>

            <article className={styles.tableCard}>
              <div className={styles.cardHead}>
                <div>
                  <h3 className={styles.cardTitle}>{t("table.title")}</h3>
                  <p className={styles.cardSubtitle}>
                    {t("table.subtitle")}
                  </p>
                </div>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() => router.push("/ads/campaigns")}
                >
                  {t("table.viewAll")}
                </button>
              </div>

              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>{t("table.campaign")}</th>
                      <th>{t("table.status")}</th>
                      <th>{t("table.spent")}</th>
                      <th>{t("table.impressions")}</th>
                      <th>{t("table.ctr")}</th>
                      <th>{t("table.clicks")}</th>
                      <th>{t("table.action")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeCampaignsPreview.map((item) => {
                      return (
                        <tr key={item.id}>
                          <td>{item.campaignName}</td>
                          <td>
                            <span
                              className={`${styles.status} ${styles[`status_${item.status === "active" ? "active" : item.status === "hidden" ? "hidden" : item.status === "canceled" ? "canceled" : "paused"}`]}`}
                            >
                              {t(`status.${item.status as CampaignStatus}`)}
                            </span>
                          </td>
                          <td>{money(item.spent)}</td>
                          <td>{integer(item.impressions)}</td>
                          <td>{pct(item.ctr)}</td>
                          <td>{integer(item.clicks)}</td>
                          <td>
                            <button
                              type="button"
                              className={styles.secondaryBtn}
                              onClick={() => router.push(`/ads/campaigns/${item.id}`)}
                            >
                              {t("table.details")}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {activeCampaignsPreview.length === 0 ? (
                      <tr>
                        <td colSpan={8}>{t("table.noActive")}</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </article>
          </section>
        </>
      )}
    </div>
  );
}
