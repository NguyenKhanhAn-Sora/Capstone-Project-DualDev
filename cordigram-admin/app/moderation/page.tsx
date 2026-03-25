"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getApiBaseUrl } from "@/lib/api";
import styles from "./moderation.module.css";

type AdminPayload = {
  roles?: string[];
  exp?: number;
};

type QueueItem = {
  postId: string;
  authorDisplayName: string | null;
  authorUsername: string | null;
  createdAt: string | null;
  visibility: string;
  kind: "post" | "reel";
  moderationDecision: "approve" | "blur" | "reject";
  moderationProvider: string | null;
  moderatedMediaCount: number;
  previewUrl: string | null;
  reasons: string[];
};

type SelectOption = {
  value: string;
  label: string;
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
    <div
      className={`${styles.customSelect} ${open ? styles.customSelectOpen : ""}`}
      ref={rootRef}
    >
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
                className={`${styles.customSelectOption} ${
                  isActive ? styles.customSelectOptionActive : ""
                }`}
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

export default function ModerationQueuePage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [decisionFilter, setDecisionFilter] = useState<
    "all" | "approve" | "blur" | "reject"
  >("all");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [counts, setCounts] = useState({ approve: 0, blur: 0, reject: 0 });
  const [previousCounts, setPreviousCounts] = useState({
    approve: 0,
    blur: 0,
    reject: 0,
  });

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

    const load = async () => {
      try {
        setLoading(true);
        const res = await fetch(`${getApiBaseUrl()}/admin/moderation/media`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!res.ok) {
          throw new Error("Failed to load moderation queue");
        }

        const payload = (await res.json()) as {
          items: QueueItem[];
          counts: { approve: number; blur: number; reject: number };
          comparison?: {
            current?: { approve: number; blur: number; reject: number };
            previous?: { approve: number; blur: number; reject: number };
          };
        };

        setItems(Array.isArray(payload.items) ? payload.items : []);
        setCounts(payload.counts ?? { approve: 0, blur: 0, reject: 0 });
        setPreviousCounts(
          payload.comparison?.previous ?? { approve: 0, blur: 0, reject: 0 },
        );
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [ready]);

  const total = useMemo(
    () => counts.approve + counts.blur + counts.reject,
    [counts],
  );

  const previousTotal = useMemo(
    () => previousCounts.approve + previousCounts.blur + previousCounts.reject,
    [previousCounts],
  );

  const buildDelta = (current: number, previous: number) => {
    const delta = current - previous;
    const percent =
      previous === 0
        ? current === 0
          ? 0
          : 100
        : Math.abs((delta / previous) * 100);
    const direction: "up" | "down" | "flat" =
      delta > 0 ? "up" : delta < 0 ? "down" : "flat";

    return {
      delta,
      percent,
      direction,
    };
  };

  const totalDelta = buildDelta(total, previousTotal);
  const approveDelta = buildDelta(counts.approve, previousCounts.approve);
  const blurDelta = buildDelta(counts.blur, previousCounts.blur);
  const rejectDelta = buildDelta(counts.reject, previousCounts.reject);

  const formatDelta = (delta: { delta: number; percent: number }) => {
    const sign = delta.delta > 0 ? "+" : "";
    return `${sign}${delta.delta} (${sign}${delta.percent.toFixed(1)}%)`;
  };

  const formatDateTime = (value?: string | null) => {
    if (!value) return "--";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "--";

    return new Intl.DateTimeFormat("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  };

  const filteredItems = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return [...items]
      .filter((item) => {
        if (decisionFilter !== "all" && item.moderationDecision !== decisionFilter) {
          return false;
        }

        if (!normalizedSearch) {
          return true;
        }

        const postId = item.postId.toLowerCase();
        const username = (item.authorUsername ?? "").toLowerCase();
        return postId.includes(normalizedSearch) || username.includes(normalizedSearch);
      })
      .sort((a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return sortOrder === "oldest" ? aTime - bTime : bTime - aTime;
      });
  }, [decisionFilter, items, searchTerm, sortOrder]);

  if (!ready) return null;

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.topbar}>
          <div>
            <span className={styles.eyebrow}>Auto Moderation</span>
            <h1 className={styles.title}>Media Moderation Queue</h1>
          </div>
          <Link href="/dashboard" className={styles.backButton}>
            Back to dashboard
          </Link>
        </header>

        <section className={styles.summaryGrid}>
          <article className={styles.summaryCard}>
            <span className={styles.label}>Total (7 days)</span>
            <span className={styles.value}>{total}</span>
            <span
              className={`${styles.delta} ${
                totalDelta.direction === "up"
                  ? styles.deltaUp
                  : totalDelta.direction === "down"
                    ? styles.deltaDown
                    : styles.deltaFlat
              }`}
            >
              {formatDelta(totalDelta)}
            </span>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.label}>Approved (7 days)</span>
            <span className={styles.value}>{counts.approve}</span>
            <span
              className={`${styles.delta} ${
                approveDelta.direction === "up"
                  ? styles.deltaUp
                  : approveDelta.direction === "down"
                    ? styles.deltaDown
                    : styles.deltaFlat
              }`}
            >
              {formatDelta(approveDelta)}
            </span>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.label}>Blurred (7 days)</span>
            <span className={styles.value}>{counts.blur}</span>
            <span
              className={`${styles.delta} ${
                blurDelta.direction === "up"
                  ? styles.deltaUp
                  : blurDelta.direction === "down"
                    ? styles.deltaDown
                    : styles.deltaFlat
              }`}
            >
              {formatDelta(blurDelta)}
            </span>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.label}>Rejected (7 days)</span>
            <span className={styles.value}>{counts.reject}</span>
            <span
              className={`${styles.delta} ${
                rejectDelta.direction === "up"
                  ? styles.deltaUp
                  : rejectDelta.direction === "down"
                    ? styles.deltaDown
                    : styles.deltaFlat
              }`}
            >
              {formatDelta(rejectDelta)}
            </span>
          </article>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>Recent moderated posts</h2>
          </div>

          <div className={styles.filtersRow}>
            <label className={styles.filterField}>
              <span className={styles.filterLabel}>Search</span>
              <input
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Post ID, username"
                className={styles.filterInput}
              />
            </label>

            <label className={styles.filterField}>
              <span className={styles.filterLabel}>Type</span>
              <CustomSelect
                value={decisionFilter}
                onChange={(value) =>
                  setDecisionFilter(
                    value as "all" | "approve" | "blur" | "reject",
                  )
                }
                ariaLabel="Decision filter"
                options={[
                  { value: "all", label: "All" },
                  { value: "approve", label: "Approve" },
                  { value: "blur", label: "Blur" },
                  { value: "reject", label: "Reject" },
                ]}
              />
            </label>

            <label className={styles.filterField}>
              <span className={styles.filterLabel}>Sort</span>
              <CustomSelect
                value={sortOrder}
                onChange={(value) => setSortOrder(value as "newest" | "oldest")}
                ariaLabel="Sort order"
                options={[
                  { value: "newest", label: "Newest to oldest" },
                  { value: "oldest", label: "Oldest to newest" },
                ]}
              />
            </label>
          </div>

          {loading ? <p className={styles.empty}>Loading...</p> : null}

          {!loading && filteredItems.length === 0 ? (
            <p className={styles.empty}>No moderated media found.</p>
          ) : null}

          {!loading && filteredItems.length > 0 ? (
            <div className={styles.tableWrap}>
              <div className={`${styles.tableRow} ${styles.tableHead}`}>
                <span>Author</span>
                <span>Type</span>
                <span>Decision</span>
                <span>Media</span>
                <span>Time</span>
                <span>Reason</span>
                <span>Action</span>
              </div>

              <div className={styles.tableBody}>
                {filteredItems.map((item) => (
                  <article className={styles.tableRow} key={item.postId}>
                    <div className={styles.cellAuthor}>
                      <p className={styles.rowTitle}>
                        {item.authorDisplayName || "Unknown"}
                      </p>
                      <p className={styles.rowMeta}>
                        {item.authorUsername ? `@${item.authorUsername}` : "--"}
                      </p>
                    </div>

                    <div className={styles.cellType}>
                      <span className={styles.kindChip}>{item.kind.toUpperCase()}</span>
                     </div>

                    <div>
                      <span
                        className={`${styles.badge} ${
                          item.moderationDecision === "reject"
                            ? styles.badgeReject
                            : item.moderationDecision === "blur"
                              ? styles.badgeBlur
                              : styles.badgeApprove
                        }`}
                      >
                        {item.moderationDecision.toUpperCase()}
                      </span>
                    </div>

                    <div className={styles.metricText}>{item.moderatedMediaCount}</div>

                    <div className={styles.metricText}>
                      {formatDateTime(item.createdAt)}
                    </div>

                    <p className={styles.reasonText}>{item.reasons?.[0] || "--"}</p>

                    <Link
                      href={`/moderation/${item.postId}`}
                      className={styles.detailButton}
                    >
                      View details
                    </Link>
                  </article>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
