"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getApiBaseUrl, getWebBaseUrl } from "@/lib/api";
import styles from "./creator-verification.module.css";

type AdminPayload = {
  roles?: string[];
  exp?: number;
};

type SelectOption = {
  value: string;
  label: string;
};

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
  } catch {
    return null;
  }
};

const formatDate = (value?: string | null) => {
  if (!value) return "--";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "--";
  return dt.toLocaleString();
};

const REQUIREMENT_LABELS: Record<string, string> = {
  account_age: "Account age",
  followers_count: "Followers",
  posts_count: "Posts",
  active_posting_days_30d: "Active posting days (30d)",
  engagement_per_post_30d: "Avg engagement per post (30d)",
  recent_violations_90d: "Recent violations (90d)",
  score: "Creator score",
};

const formatRequirement = (key: string) => REQUIREMENT_LABELS[key] ?? key;

function CustomSelect(props: {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
}) {
  const { value, options, onChange, ariaLabel } = props;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const onDocumentClick = (event: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", onDocumentClick);
    document.addEventListener("keydown", onEscape);

    return () => {
      document.removeEventListener("mousedown", onDocumentClick);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  const selected = options.find((item) => item.value === value) ?? options[0];

  return (
    <div className={`${styles.customSelect} ${open ? styles.customSelectOpen : ""}`} ref={rootRef}>
      <button
        type="button"
        className={styles.customSelectTrigger}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span>{selected?.label ?? ""}</span>
        <span className={styles.selectCaret} aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path
              d="M7 10l5 5 5-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>

      {open ? (
        <div className={styles.customSelectMenu} role="listbox" aria-label={ariaLabel}>
          {options.map((option) => {
            const isActive = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isActive}
                className={`${styles.customSelectOption} ${isActive ? styles.customSelectOptionActive : ""}`}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export default function CreatorVerificationAdminPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected">(
    "pending",
  );
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
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (!response.ok) {
        throw new Error("Failed to load verification requests");
      }

      const payload = (await response.json()) as {
        items?: VerificationItem[];
      };
      setItems(payload.items ?? []);
      setLastSyncedAt(new Date());
    } catch (_err) {
      setItems([]);
      setError("Unable to load creator verification requests.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!ready) return;
    void loadRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, filter, startDate, endDate, sortOrder]);

  const summary = useMemo(() => {
    const total = items.length;
    const eligible = items.filter((item) => item.eligibility.eligible).length;
    const flagged = items.filter(
      (item) => (item.eligibility.failedRequirements?.length ?? 0) > 0,
    ).length;
    const withNote = items.filter((item) => Boolean(item.requestNote?.trim())).length;
    return { total, eligible, flagged, withNote };
  }, [items]);

  const statusLabel =
    filter === "pending"
      ? "Awaiting review"
      : filter === "approved"
        ? "Approved"
        : "Rejected";

  const statusClassName =
    filter === "pending"
      ? styles.statusPending
      : filter === "approved"
        ? styles.statusApproved
        : styles.statusRejected;
  const webBaseUrl = getWebBaseUrl();
  const sortOptions = useMemo<SelectOption[]>(
    () => [
      { value: "desc", label: "Newest to oldest" },
      { value: "asc", label: "Oldest to newest" },
    ],
    [],
  );

  if (!ready) {
    return null;
  }

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <div className={styles.topbar}>
          <div className={styles.titleGroup}>
            <p className={styles.kicker}>Creator verification</p>
            <h1 className={styles.title}>Manual review queue</h1>
            <p className={styles.subtitle}>
              Review blue-check submissions, inspect eligibility evidence, and publish decisions with one click.
            </p>
          </div>
          <div className={styles.topActions}>
            <span className={`${styles.statusPill} ${statusClassName}`}>{statusLabel}</span>
            <button
              type="button"
              className={styles.refreshButton}
              onClick={() => void loadRequests()}
              disabled={loading}
            >
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>

        <section className={styles.summaryGrid}>
          <article className={styles.summaryCard}>
            <p className={styles.summaryLabel}>Items in view</p>
            <p className={styles.summaryValue}>{summary.total}</p>
            <p className={styles.summaryHint}>Filter: {filter}</p>
          </article>
          <article className={styles.summaryCard}>
            <p className={styles.summaryLabel}>Eligible</p>
            <p className={styles.summaryValue}>{summary.eligible}</p>
            <p className={styles.summaryHint}>Passed all checks</p>
          </article>
          <article className={styles.summaryCard}>
            <p className={styles.summaryLabel}>Flagged</p>
            <p className={styles.summaryValue}>{summary.flagged}</p>
            <p className={styles.summaryHint}>Failed a requirement</p>
          </article>
          <article className={styles.summaryCard}>
            <p className={styles.summaryLabel}>With note</p>
            <p className={styles.summaryValue}>{summary.withNote}</p>
            <p className={styles.summaryHint}>
              Sync: {lastSyncedAt ? lastSyncedAt.toLocaleTimeString() : "--"}
            </p>
          </article>
        </section>

        <section className={styles.panel}>
          <div className={styles.toolbar}>
            <button
              type="button"
              className={`${styles.filterButton} ${filter === "pending" ? styles.filterButtonActive : ""}`}
              onClick={() => setFilter("pending")}
            >
              Pending
            </button>
            <button
              type="button"
              className={`${styles.filterButton} ${filter === "approved" ? styles.filterButtonActive : ""}`}
              onClick={() => setFilter("approved")}
            >
              Approved
            </button>
            <button
              type="button"
              className={`${styles.filterButton} ${filter === "rejected" ? styles.filterButtonActive : ""}`}
              onClick={() => setFilter("rejected")}
            >
              Rejected
            </button>
          </div>

          <div className={styles.filterRow}>
            <label className={styles.fieldGroup}>
              <span className={styles.fieldLabel}>From date</span>
              <input
                type="date"
                className={styles.fieldInput}
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </label>

            <label className={styles.fieldGroup}>
              <span className={styles.fieldLabel}>To date</span>
              <input
                type="date"
                className={styles.fieldInput}
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </label>

            <label className={styles.fieldGroup}>
              <span className={styles.fieldLabel}>Sort</span>
              <CustomSelect
                value={sortOrder}
                options={sortOptions}
                onChange={(value) => setSortOrder(value as "desc" | "asc")}
                ariaLabel="Sort creator verification requests"
              />
            </label>
          </div>

          {error ? <p className={styles.error}>{error}</p> : null}

          {!loading && !items.length ? (
            <div className={styles.emptyCard}>No requests found for this filter.</div>
          ) : null}

          {items.length ? <div className={styles.list}>{items.map((item) => {
            const scorePercent =
              item.eligibility.minimumScore > 0
                ? Math.max(
                    0,
                    Math.min(
                      100,
                      Math.round((item.eligibility.score / item.eligibility.minimumScore) * 100),
                    ),
                  )
                : 0;

            return (
              <article key={item.id} className={styles.card}>
                <div className={styles.cardHeader}>
                  <div className={styles.userBlock}>
                    <p className={styles.userName}>{item.user.displayName || "Unknown user"}</p>
                    <p className={styles.userMeta}>
                      @{item.user.username || "unknown"} • {item.user.email || "no-email"}
                    </p>
                    {item.user.id ? (
                      <Link
                        href={`${webBaseUrl}/profile/${item.user.id}`}
                        className={styles.profileLink}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open profile
                      </Link>
                    ) : null}
                  </div>
                  <div className={styles.cardStatusWrap}>
                    <span
                      className={`${styles.status} ${
                        item.status === "pending"
                          ? styles.statusPending
                          : item.status === "approved"
                            ? styles.statusApproved
                            : styles.statusRejected
                      }`}
                    >
                      {item.status}
                    </span>
                    <span className={styles.timestamp}>Requested {formatDate(item.createdAt)}</span>
                  </div>
                </div>

                <div className={styles.metrics}>
                  <p>Followers: {item.user.followersCount}</p>
                  <p>Posts: {item.user.postsCount}</p>
                  <p>
                    Score: {item.eligibility.score}/{item.eligibility.minimumScore}
                  </p>
                </div>

                <div className={styles.scoreTrack}>
                  <div className={styles.scoreFill} style={{ width: `${scorePercent}%` }} />
                </div>

                <div className={styles.eligibilityGrid}>
                  <div className={styles.eligibilityItem}>
                    <span>Account age</span>
                    <strong>
                      {item.eligibility.accountAgeDays ?? 0} / {item.eligibility.minAccountAgeDays ?? "?"} days
                    </strong>
                  </div>
                  <div className={styles.eligibilityItem}>
                    <span>Followers</span>
                    <strong>
                      {item.eligibility.followersCount ?? item.user.followersCount ?? 0} / {item.eligibility.minFollowersCount ?? "?"}
                    </strong>
                  </div>
                  <div className={styles.eligibilityItem}>
                    <span>Posts</span>
                    <strong>
                      {item.eligibility.postsCount ?? item.user.postsCount ?? 0} / {item.eligibility.minPostsCount ?? "?"}
                    </strong>
                  </div>
                  <div className={styles.eligibilityItem}>
                    <span>Active days (30d)</span>
                    <strong>
                      {item.eligibility.activePostingDays30d ?? 0} / {item.eligibility.minActivePostingDays30d ?? "?"}
                    </strong>
                  </div>
                  <div className={styles.eligibilityItem}>
                    <span>Engagement/post (30d)</span>
                    <strong>
                      {item.eligibility.engagementPerPost30d ?? 0} / {item.eligibility.minEngagementPerPost30d ?? "?"}
                    </strong>
                  </div>
                  <div className={styles.eligibilityItem}>
                    <span>Violations (90d)</span>
                    <strong>
                      {item.eligibility.recentViolations90d ?? 0} / max {item.eligibility.maxRecentViolations90d ?? "?"}
                    </strong>
                  </div>
                </div>

                {item.eligibility.failedRequirements?.length ? (
                  <div className={styles.requirementsWrap}>
                    {item.eligibility.failedRequirements.map((req) => (
                      <span key={req} className={styles.requirementFail}>
                        Missing: {formatRequirement(req)}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className={styles.requirementsWrap}>
                    <span className={styles.requirementPass}>All requirements passed</span>
                  </div>
                )}

                {item.requestNote ? <p className={styles.note}>User note: {item.requestNote}</p> : null}

                {item.decisionReason ? (
                  <p className={styles.note}>Decision reason: {item.decisionReason}</p>
                ) : null}

                <div className={styles.cardFooter}>
                  {item.status === "pending" ? (
                    <p className={styles.hint}></p>
                  ) : (
                    <p className={styles.hint}>
                      Reviewed: {formatDate(item.reviewedAt)}
                      {item.cooldownUntil ? ` • Cooldown until ${formatDate(item.cooldownUntil)}` : ""}
                    </p>
                  )}
                  <Link href={`/creator-verification/${item.id}`} className={styles.detailButton}>
                    View detail
                  </Link>
                </div>
              </article>
            );
          })}</div> : null}
        </section>
      </div>
    </div>
  );
}
