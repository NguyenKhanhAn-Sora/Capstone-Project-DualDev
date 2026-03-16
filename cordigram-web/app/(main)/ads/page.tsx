"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { getMyAdsCreationStatus } from "@/lib/api";
import styles from "./ads.module.css";

type AdStatus = "active" | "draft" | "review" | "paused";

type AdCampaign = {
  id: string;
  name: string;
  status: AdStatus;
  budget: number;
  spent: number;
  impressions: number;
  clicks: number;
  conversions: number;
};

type DailyMetric = {
  day: string;
  spend: number;
  clicks: number;
};

const DEMO_CAMPAIGNS: AdCampaign[] = [
  {
    id: "ad-01",
    name: "Summer Combo 2026",
    status: "active",
    budget: 2500000,
    spent: 1240000,
    impressions: 35200,
    clicks: 1278,
    conversions: 102,
  },
  {
    id: "ad-02",
    name: "App Install - Students",
    status: "review",
    budget: 1800000,
    spent: 420000,
    impressions: 11300,
    clicks: 366,
    conversions: 38,
  },
  {
    id: "ad-03",
    name: "Retargeting 7 days",
    status: "paused",
    budget: 3000000,
    spent: 910000,
    impressions: 18900,
    clicks: 712,
    conversions: 59,
  },
];

const DEMO_TREND: DailyMetric[] = [
  { day: "Mon", spend: 180000, clicks: 155 },
  { day: "Tue", spend: 220000, clicks: 193 },
  { day: "Wed", spend: 200000, clicks: 174 },
  { day: "Thu", spend: 260000, clicks: 228 },
  { day: "Fri", spend: 240000, clicks: 216 },
  { day: "Sat", spend: 110000, clicks: 101 },
  { day: "Sun", spend: 30000, clicks: 28 },
];

const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);

const integer = (value: number) => new Intl.NumberFormat("en-US").format(value);

const pct = (value: number) => `${value.toFixed(2)}%`;

function statusLabel(status: AdStatus) {
  if (status === "active") return "Active";
  if (status === "review") return "In Review";
  if (status === "paused") return "Paused";
  return "Draft";
}

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
  const [hasCreatedAnyAd, setHasCreatedAnyAd] = useState(false);
  const [loadingCreationStatus, setLoadingCreationStatus] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const token =
      window.localStorage.getItem("accessToken") ||
      window.localStorage.getItem("token");

    if (!token) {
      setHasCreatedAnyAd(false);
      setLoadingCreationStatus(false);
      return;
    }

    let cancelled = false;
    setLoadingCreationStatus(true);

    getMyAdsCreationStatus({ token })
      .then((result) => {
        if (cancelled) return;
        setHasCreatedAnyAd(result.hasCreatedAds === true);
      })
      .catch(() => {
        if (cancelled) return;
        setHasCreatedAnyAd(false);
      })
      .finally(() => {
        if (cancelled) return;
        setLoadingCreationStatus(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const summary = useMemo(() => {
    if (!hasCreatedAnyAd) {
      return {
        totalBudget: 0,
        totalSpent: 0,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        ctr: 0,
        cvr: 0,
        activeCount: 0,
      };
    }

    const totalBudget = DEMO_CAMPAIGNS.reduce((acc, item) => acc + item.budget, 0);
    const totalSpent = DEMO_CAMPAIGNS.reduce((acc, item) => acc + item.spent, 0);
    const impressions = DEMO_CAMPAIGNS.reduce((acc, item) => acc + item.impressions, 0);
    const clicks = DEMO_CAMPAIGNS.reduce((acc, item) => acc + item.clicks, 0);
    const conversions = DEMO_CAMPAIGNS.reduce((acc, item) => acc + item.conversions, 0);
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
    const cvr = clicks > 0 ? (conversions / clicks) * 100 : 0;
    const activeCount = DEMO_CAMPAIGNS.filter((item) => item.status === "active").length;

    return {
      totalBudget,
      totalSpent,
      impressions,
      clicks,
      conversions,
      ctr,
      cvr,
      activeCount,
    };
  }, [hasCreatedAnyAd]);

  const maxTrendSpend = useMemo(
    () => Math.max(...DEMO_TREND.map((item) => item.spend), 1),
    [],
  );

  if (!canRender) return null;
  if (loadingCreationStatus) {
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
            <h2 className={styles.emptyTitle}>No ads yet</h2>

            <div className={styles.emptyChecklist}>
              <div className={styles.checkItem}>
                <span className={styles.checkIcon}>
                  <GoalIcon />
                </span>
                <span>Goal: increase awareness or conversions</span>
              </div>
              <div className={styles.checkItem}>
                <span className={styles.checkIcon}>
                  <BudgetIcon />
                </span>
                <span>Budget and schedule planning</span>
              </div>
              <div className={styles.checkItem}>
                <span className={styles.checkIcon}>
                  <CreativeIcon />
                </span>
                <span>Content, media, and clear CTA</span>
              </div>
            </div>

            <div className={styles.emptyActions}>
              <button
                type="button"
                className={styles.emptyCtaBtn}
                onClick={() => router.push("/ads/create")}
              >
                Create your first ad
              </button>
            </div>
          </div>
        </section>
      ) : (
        <>
          <section className={styles.dashboardTop}>
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={() => router.push("/ads/create")}
            >
              Create new ad
            </button>
          </section>

          <section className={styles.metricsGrid}>
            <article className={styles.metricCard}>
              <p className={styles.metricLabel}>Total budget</p>
              <p className={styles.metricValue}>{money(summary.totalBudget)}</p>
              <p className={styles.metricHint}>Spent: {money(summary.totalSpent)}</p>
            </article>

            <article className={styles.metricCard}>
              <p className={styles.metricLabel}>Impressions</p>
              <p className={styles.metricValue}>{integer(summary.impressions)}</p>
              <p className={styles.metricHint}>Clicks: {integer(summary.clicks)}</p>
            </article>

            <article className={styles.metricCard}>
              <p className={styles.metricLabel}>Average CTR</p>
              <p className={styles.metricValue}>{pct(summary.ctr)}</p>
              <p className={styles.metricHint}>CVR: {pct(summary.cvr)}</p>
            </article>

            <article className={styles.metricCard}>
              <p className={styles.metricLabel}>Running campaigns</p>
              <p className={styles.metricValue}>{summary.activeCount}</p>
              <p className={styles.metricHint}>
                Total conversions: {integer(summary.conversions)}
              </p>
            </article>
          </section>

          <section className={styles.contentGrid}>
            <article className={styles.chartCard}>
              <div className={styles.cardHead}>
                <div>
                  <h3 className={styles.cardTitle}>7-day spend trend</h3>
                  <p className={styles.cardSubtitle}>
                    Track how your budget and clicks have changed recently.
                  </p>
                </div>
              </div>

              <div className={styles.chartBars}>
                {DEMO_TREND.map((item) => (
                  <div key={item.day} className={styles.barCol}>
                    <div
                      className={styles.bar}
                      style={{
                        height: `${Math.max((item.spend / maxTrendSpend) * 100, 8)}%`,
                      }}
                      title={`${item.day}: ${money(item.spend)} - ${integer(item.clicks)} clicks`}
                    />
                    <span className={styles.barLabel}>{item.day}</span>
                  </div>
                ))}
              </div>
            </article>

            <article className={styles.tableCard}>
              <div className={styles.cardHead}>
                <div>
                  <h3 className={styles.cardTitle}>Ad campaigns</h3>
                  <p className={styles.cardSubtitle}>
                    Quick view of campaign performance and status.
                  </p>
                </div>
              </div>

              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Campaign</th>
                      <th>Status</th>
                      <th>Spent</th>
                      <th>CTR</th>
                      <th>Clicks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {DEMO_CAMPAIGNS.map((item) => {
                      const adCtr = item.impressions > 0 ? (item.clicks / item.impressions) * 100 : 0;
                      return (
                        <tr key={item.id}>
                          <td>{item.name}</td>
                          <td>
                            <span className={`${styles.status} ${styles[`status_${item.status}`]}`}>
                              {statusLabel(item.status)}
                            </span>
                          </td>
                          <td>{money(item.spent)}</td>
                          <td>{pct(adCtr)}</td>
                          <td>{integer(item.clicks)}</td>
                        </tr>
                      );
                    })}
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
