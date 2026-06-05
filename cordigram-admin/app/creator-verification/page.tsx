"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getApiBaseUrl } from "@/lib/api";
import { openAdminProfilePreview } from "@/lib/admin-profile-preview";
import styles from "./creator-verification.module.css";

type AdminPayload = { roles?: string[]; exp?: number };
type SelectOption = { value: string; label: string };

type VerificationItem = {
  id: string;
  status: "pending" | "approved" | "rejected";
  requestNote: string;
  decisionReason: string | null;
  reviewedAt: string | null;
  createdAt: string | null;
  cooldownUntil: string | null;
  eligibility: {
    score: number;
    minimumScore: number;
    accountAgeDays?: number;
    minAccountAgeDays?: number;
    followersCount?: number;
    minFollowersCount?: number;
    postsCount?: number;
    minPostsCount?: number;
    activePostingDays30d?: number;
    minActivePostingDays30d?: number;
    engagementPerPost30d?: number;
    minEngagementPerPost30d?: number;
    recentViolations90d?: number;
    maxRecentViolations90d?: number;
    failedRequirements?: string[];
    eligible?: boolean;
  };
  user: {
    id: string;
    email: string | null;
    displayName: string | null;
    username: string | null;
    followersCount: number;
    postsCount: number;
  };
};

const decodeJwt = (token: string): AdminPayload | null => {
  try {
    const payload = token.split(".")[1];
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
  } catch { return null; }
};

const fmtDate = (value?: string | null) => {
  if (!value) return "--";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "--";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(d);
};

const getInitial = (item: VerificationItem) =>
  (item.user.displayName || item.user.username || item.user.email || "?")
    .replace("@", "").charAt(0).toUpperCase();

/* Check each requirement from the failedRequirements array */
const isFailed = (key: string, failed: string[] | undefined) =>
  (failed ?? []).includes(key);

const ELIBILITY_ROWS = [
  { key: "account_age",             label: "Account age",           unit: "days",   isViolation: false },
  { key: "followers_count",         label: "Followers",             unit: "",       isViolation: false },
  { key: "posts_count",             label: "Posts",                 unit: "",       isViolation: false },
  { key: "active_posting_days_30d", label: "Active days (30d)",     unit: "days",   isViolation: false },
  { key: "engagement_per_post_30d", label: "Engagement / post",     unit: "",       isViolation: false },
  { key: "recent_violations_90d",   label: "Violations (90d)",      unit: "",       isViolation: true  },
] as const;

/* Dark dropdown select */
function CustomSelect({ value, options, onChange, ariaLabel }: {
  value: string; options: SelectOption[]; onChange: (v: string) => void; ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => { if (!rootRef.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onClick); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const selected = options.find((o) => o.value === value) ?? options[0];
  return (
    <div className={`${styles.select} ${open ? styles.selectOpen : ""}`} ref={rootRef}>
      <button type="button" className={styles.selectTrigger}
        aria-haspopup="listbox" aria-expanded={open} aria-label={ariaLabel}
        onClick={() => setOpen((p) => !p)}>
        <span>{selected?.label ?? ""}</span>
        <svg className={styles.selectCaret} viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7 10l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open ? (
        <div className={styles.selectMenu} role="listbox" aria-label={ariaLabel}>
          {options.map((opt) => (
            <button key={opt.value} type="button" role="option" aria-selected={opt.value === value}
              className={`${styles.selectOption} ${opt.value === value ? styles.selectOptionActive : ""}`}
              onClick={() => { onChange(opt.value); setOpen(false); }}>
              {opt.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function CreatorVerificationAdminPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected">("pending");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const [items, setItems] = useState<VerificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  const token = useMemo(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("adminAccessToken") || "";
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!token) { router.replace("/login"); return; }
    const payload = decodeJwt(token);
    const roles = payload?.roles || [];
    const exp = payload?.exp ? payload.exp * 1000 : 0;
    if (!roles.includes("admin") || (exp && Date.now() > exp)) { router.replace("/login"); return; }
    setReady(true);
  }, [router, token]);

  const loadRequests = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("status", filter);
      params.set("limit", "60");
      params.set("sort", sortOrder);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      const response = await fetch(
        `${getApiBaseUrl()}/creator-verification/admin/requests?${params.toString()}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!response.ok) throw new Error("Failed to load");
      const payload = (await response.json()) as { items?: VerificationItem[] };
      setItems(payload.items ?? []);
      setLastSyncedAt(new Date());
    } catch {
      setItems([]);
      setError("Unable to load creator verification requests.");
    } finally { setLoading(false); }
  };

  useEffect(() => {
    if (!ready) return;
    void loadRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, filter, startDate, endDate, sortOrder]);

  const summary = useMemo(() => ({
    total: items.length,
    eligible: items.filter((i) => i.eligibility.eligible).length,
    flagged: items.filter((i) => (i.eligibility.failedRequirements?.length ?? 0) > 0).length,
    withNote: items.filter((i) => Boolean(i.requestNote?.trim())).length,
  }), [items]);

  const sortOptions = useMemo<SelectOption[]>(() => [
    { value: "desc", label: "Newest first" },
    { value: "asc",  label: "Oldest first" },
  ], []);

  if (!ready) return null;

  const STATUS_TABS = [
    { value: "pending",  label: "Pending" },
    { value: "approved", label: "Approved" },
    { value: "rejected", label: "Rejected" },
  ] as const;

  return (
    <div className={styles.page}>
      <div className={styles.shell}>

        {/* ---- Header ---- */}
        <header className={styles.topbar}>
          <div>
            <h1 className={styles.title}>Creator Verification</h1>
            <p className={styles.subtitle}>
              Review blue-check submissions, inspect eligibility evidence, and publish decisions.
            </p>
          </div>
          <button type="button" className={styles.refreshBtn}
            onClick={() => void loadRequests()} disabled={loading}>
            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M17 10A7 7 0 1 1 10 3M17 3v4h-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </header>

        {/* ---- KPI strip ---- */}
        <section className={styles.kpiRow}>
          <article className={styles.kpiCard}>
            <span className={styles.kpiLabel}>In view</span>
            <span className={styles.kpiValue}>{summary.total}</span>
            <span className={styles.kpiHint}>Filter: {filter}</span>
          </article>
          <article className={`${styles.kpiCard} ${styles.kpiEligible}`}>
            <span className={styles.kpiLabel}>Eligible</span>
            <span className={styles.kpiValue}>{summary.eligible}</span>
            <span className={styles.kpiHint}>Passed all checks</span>
          </article>
          <article className={`${styles.kpiCard} ${styles.kpiFlagged}`}>
            <span className={styles.kpiLabel}>Flagged</span>
            <span className={styles.kpiValue}>{summary.flagged}</span>
            <span className={styles.kpiHint}>Failed a requirement</span>
          </article>
          <article className={styles.kpiCard}>
            <span className={styles.kpiLabel}>With note</span>
            <span className={styles.kpiValue}>{summary.withNote}</span>
            <span className={styles.kpiHint}>
              {lastSyncedAt ? `Synced ${lastSyncedAt.toLocaleTimeString()}` : "Not synced"}
            </span>
          </article>
        </section>

        {/* ---- Panel ---- */}
        <section className={styles.panel}>

          {/* Status tabs + date filters */}
          <div className={styles.controlsRow}>
            <div className={styles.statusTabs}>
              {STATUS_TABS.map(({ value, label }) => (
                <button key={value} type="button"
                  className={`${styles.tab} ${filter === value ? styles.tabActive : ""} ${
                    value === "pending"  && filter === value ? styles.tabPending  :
                    value === "approved" && filter === value ? styles.tabApproved :
                    value === "rejected" && filter === value ? styles.tabRejected : ""
                  }`}
                  onClick={() => setFilter(value)}>
                  {label}
                </button>
              ))}
            </div>

            <div className={styles.dateFilters}>
              <div className={styles.dateField}>
                <label className={styles.fieldLabel} htmlFor="startDate">From</label>
                <input id="startDate" type="date" className={styles.dateInput}
                  value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div className={styles.dateField}>
                <label className={styles.fieldLabel} htmlFor="endDate">To</label>
                <input id="endDate" type="date" className={styles.dateInput}
                  value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
              <div className={styles.dateField}>
                <span className={styles.fieldLabel}>Sort</span>
                <CustomSelect value={sortOrder} options={sortOptions}
                  onChange={(v) => setSortOrder(v as "desc" | "asc")}
                  ariaLabel="Sort order" />
              </div>
            </div>
          </div>

          {error ? (
            <div className={styles.errorBanner}>{error}</div>
          ) : null}

          {loading && !items.length ? (
            <div className={styles.emptyState}>
              <div className={styles.loader} /><p>Loading requests…</p>
            </div>
          ) : !loading && !items.length ? (
            <div className={styles.emptyState}>
              <p>No {filter} requests found.</p>
            </div>
          ) : null}

          {/* ---- Verification cards ---- */}
          <div className={styles.list}>
            {items.map((item, idx) => {
              const failed = item.eligibility.failedRequirements ?? [];
              const scorePercent = item.eligibility.minimumScore > 0
                ? Math.max(0, Math.min(100, Math.round((item.eligibility.score / item.eligibility.minimumScore) * 100)))
                : 0;
              const scorePasses = item.eligibility.score >= item.eligibility.minimumScore;

              /* Build eligibility data per row */
              const eligData: { key: string; label: string; actual: number | string; min: string; pass: boolean }[] = [
                {
                  key: "account_age",
                  label: "Account age",
                  actual: `${item.eligibility.accountAgeDays ?? 0}d`,
                  min: `min ${item.eligibility.minAccountAgeDays ?? "?"}d`,
                  pass: !isFailed("account_age", failed),
                },
                {
                  key: "followers_count",
                  label: "Followers",
                  actual: item.eligibility.followersCount ?? item.user.followersCount ?? 0,
                  min: `min ${item.eligibility.minFollowersCount ?? "?"}`,
                  pass: !isFailed("followers_count", failed),
                },
                {
                  key: "posts_count",
                  label: "Posts",
                  actual: item.eligibility.postsCount ?? item.user.postsCount ?? 0,
                  min: `min ${item.eligibility.minPostsCount ?? "?"}`,
                  pass: !isFailed("posts_count", failed),
                },
                {
                  key: "active_posting_days_30d",
                  label: "Active days (30d)",
                  actual: `${item.eligibility.activePostingDays30d ?? 0}d`,
                  min: `min ${item.eligibility.minActivePostingDays30d ?? "?"}d`,
                  pass: !isFailed("active_posting_days_30d", failed),
                },
                {
                  key: "engagement_per_post_30d",
                  label: "Engagement / post",
                  actual: item.eligibility.engagementPerPost30d ?? 0,
                  min: `min ${item.eligibility.minEngagementPerPost30d ?? "?"}`,
                  pass: !isFailed("engagement_per_post_30d", failed),
                },
                {
                  key: "recent_violations_90d",
                  label: "Violations (90d)",
                  actual: item.eligibility.recentViolations90d ?? 0,
                  min: `max ${item.eligibility.maxRecentViolations90d ?? "?"}`,
                  pass: !isFailed("recent_violations_90d", failed),
                },
              ];

              return (
                <article key={item.id} className={styles.card} style={{ animationDelay: `${Math.min(idx, 12) * 40}ms` }}>

                  {/* Card header */}
                  <div className={styles.cardHeader}>
                    <div className={styles.userRow}>
                      <div className={styles.userAvatar}>{getInitial(item)}</div>
                      <div className={styles.userInfo}>
                        <span className={styles.userName}>{item.user.displayName || "Unknown user"}</span>
                        <span className={styles.userMeta}>
                          {item.user.username ? `@${item.user.username}` : ""}
                          {item.user.username && item.user.email ? " · " : ""}
                          {item.user.email || ""}
                        </span>
                        {item.user.id ? (
                          <button type="button" className={styles.profileLink}
                            onClick={async () => {
                              try { await openAdminProfilePreview(item.user.id); }
                              catch { setError("Unable to open profile preview."); }
                            }}>
                            <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                              <circle cx="8" cy="6" r="3" stroke="currentColor" strokeWidth="1.3" />
                              <path d="M2 13c0-3 2.5-5 6-5s6 2 6 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                            </svg>
                            Open profile
                          </button>
                        ) : null}
                      </div>
                    </div>

                    <div className={styles.cardMeta}>
                      <span className={`${styles.statusBadge} ${
                        item.status === "approved" ? styles.statusApproved :
                        item.status === "rejected" ? styles.statusRejected :
                        styles.statusPending
                      }`}>
                        <span className={styles.statusDot} />
                        {item.status.toUpperCase()}
                      </span>
                      <span className={styles.timestamp}>Requested {fmtDate(item.createdAt)}</span>
                    </div>
                  </div>

                  {/* Score bar */}
                  <div className={styles.scoreSection}>
                    <div className={styles.scoreHeader}>
                      <span className={styles.scoreLabel}>Creator score</span>
                      <span className={`${styles.scoreNum} ${scorePasses ? styles.scorePass : styles.scoreFail}`}>
                        {item.eligibility.score} / {item.eligibility.minimumScore}
                        <span className={styles.scorePct}> ({scorePercent}%)</span>
                      </span>
                    </div>
                    <div className={styles.scoreTrack}>
                      <div className={`${styles.scoreFill} ${scorePasses ? styles.scoreFillPass : styles.scoreFillFail}`}
                        style={{ width: `${scorePercent}%` }} />
                    </div>
                  </div>

                  {/* Eligibility grid */}
                  <div className={styles.eligibilityGrid}>
                    {eligData.map((row) => (
                      <div key={row.key} className={`${styles.eligCell} ${row.pass ? styles.eligPass : styles.eligFail}`}>
                        <span className={styles.eligLabel}>{row.label}</span>
                        <span className={styles.eligActual}>{String(row.actual)}</span>
                        <span className={styles.eligMin}>{row.min}</span>
                        <span className={styles.eligIcon} aria-hidden="true">
                          {row.pass ? (
                            <svg viewBox="0 0 16 16" fill="none">
                              <path d="M3 8l4 4 6-6" stroke="#4ade80" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          ) : (
                            <svg viewBox="0 0 16 16" fill="none">
                              <path d="M4 4l8 8M12 4l-8 8" stroke="#f87171" strokeWidth="1.8" strokeLinecap="round" />
                            </svg>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Requirement summary */}
                  <div className={styles.reqWrap}>
                    {failed.length === 0 ? (
                      <span className={styles.reqPass}>
                        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                          <path d="M3 8l4 4 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        All requirements passed
                      </span>
                    ) : (
                      failed.map((req) => (
                        <span key={req} className={styles.reqFail}>
                          <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                          </svg>
                          {req === "account_age" ? "Account age" :
                           req === "followers_count" ? "Followers" :
                           req === "posts_count" ? "Posts" :
                           req === "active_posting_days_30d" ? "Active days (30d)" :
                           req === "engagement_per_post_30d" ? "Avg engagement" :
                           req === "recent_violations_90d" ? "Violations" :
                           req === "score" ? "Creator score" : req}
                        </span>
                      ))
                    )}
                  </div>

                  {/* Notes */}
                  {item.requestNote ? (
                    <div className={styles.noteBox}>
                      <span className={styles.noteLabel}>User note</span>
                      <p className={styles.noteText}>{item.requestNote}</p>
                    </div>
                  ) : null}

                  {item.decisionReason ? (
                    <div className={styles.noteBox}>
                      <span className={styles.noteLabel}>Decision reason</span>
                      <p className={styles.noteText}>{item.decisionReason}</p>
                    </div>
                  ) : null}

                  {/* Footer */}
                  <div className={styles.cardFooter}>
                    <div className={styles.footerMeta}>
                      {item.reviewedAt ? (
                        <span className={styles.footerPill}>Reviewed {fmtDate(item.reviewedAt)}</span>
                      ) : null}
                      {item.cooldownUntil ? (
                        <span className={styles.footerPillWarn}>Cooldown until {fmtDate(item.cooldownUntil)}</span>
                      ) : null}
                    </div>
                    <Link href={`/creator-verification/${item.id}`} className={styles.detailBtn}>
                      View detail
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
