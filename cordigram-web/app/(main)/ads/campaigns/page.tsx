"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { DateSelect } from "@/ui/date-select/date-select";
import { getAdsDashboard, type AdsDashboardResponse } from "@/lib/api";
import styles from "./campaigns.module.css";

const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);

const integer = (value: number) => new Intl.NumberFormat("en-US").format(value);
const pct = (value: number) => `${value.toFixed(2)}%`;

function statusLabel(status: "active" | "hidden" | "paused" | "canceled" | "completed") {
  if (status === "active") return "Active";
  if (status === "hidden") return "Hidden";
  if (status === "paused") return "Paused";
  if (status === "canceled") return "Canceled";
  return "Completed";
}

type FilterOption<T extends string> = {
  value: T;
  label: string;
};

function ChevronDownIcon() {
  return (
    <svg aria-hidden viewBox="0 0 20 20" fill="none">
      <path
        d="M5 7.5L10 12.5L15 7.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FilterDropdown<T extends string>({
  ariaLabel,
  value,
  options,
  onChange,
}: {
  ariaLabel: string;
  value: T;
  options: FilterOption<T>[];
  onChange: (next: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const root = rootRef.current;
      if (!root) return;
      if (root.contains(event.target as Node)) return;
      setOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown, true);
    document.addEventListener("touchstart", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("mousedown", onPointerDown, true);
      document.removeEventListener("touchstart", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const selected = options.find((item) => item.value === value) ?? options[0];

  return (
    <div className={styles.filterDropdown} ref={rootRef}>
      <button
        type="button"
        className={`${styles.filterDropdownButton} ${open ? styles.filterDropdownButtonOpen : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className={styles.filterDropdownText}>{selected?.label ?? ""}</span>
        <span className={`${styles.filterDropdownChevron} ${open ? styles.filterDropdownChevronOpen : ""}`}>
          <ChevronDownIcon />
        </span>
      </button>

      {open ? (
        <div className={styles.filterDropdownMenu} role="listbox" aria-label={ariaLabel}>
          {options.map((item) => {
            const active = item.value === value;
            return (
              <button
                key={item.value}
                type="button"
                role="option"
                aria-selected={active}
                className={`${styles.filterDropdownOption} ${active ? styles.filterDropdownOptionActive : ""}`}
                onClick={() => {
                  onChange(item.value);
                  setOpen(false);
                }}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

const STATUS_FILTER_OPTIONS: FilterOption<
  "all" | "active" | "hidden" | "canceled" | "completed"
>[] = [
  { value: "all", label: "All status" },
  { value: "active", label: "Active" },
  { value: "hidden", label: "Hidden" },
  { value: "canceled", label: "Canceled" },
  { value: "completed", label: "Completed" },
];

const SORT_OPTIONS: FilterOption<"newest" | "oldest" | "spent" | "ctr">[] = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "spent", label: "Highest spent" },
  { value: "ctr", label: "Highest CTR" },
];

export default function AdsCampaignsPage() {
  const canRender = useRequireAuth();
  const router = useRouter();
  const [dashboard, setDashboard] = useState<AdsDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "active" | "hidden" | "canceled" | "completed"
  >("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "spent" | "ctr">("newest");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const token =
      window.localStorage.getItem("accessToken") ||
      window.localStorage.getItem("token");

    if (!token) {
      setDashboard(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");

    getAdsDashboard({ token })
      .then((result) => {
        if (cancelled) return;
        setDashboard(result);
      })
      .catch((err) => {
        if (cancelled) return;
        setDashboard(null);
        setError(err instanceof Error ? err.message : "Failed to load campaigns.");
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const campaigns = useMemo(
    () =>
      (dashboard?.campaigns ?? []).slice().sort(
        (a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime(),
      ),
    [dashboard],
  );

  const stats = useMemo(() => {
    const total = campaigns.length;
    const active = campaigns.filter((item) => item.status === "active").length;
    const totalSpent = campaigns.reduce((sum, item) => sum + (item.spent || 0), 0);
    const totalImpressions = campaigns.reduce(
      (sum, item) => sum + (item.impressions || 0),
      0,
    );

    return {
      total,
      active,
      totalSpent,
      totalImpressions,
    };
  }, [campaigns]);

  const filteredCampaigns = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    const fromTime = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
    const toTime = dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : null;
    const rangeStart =
      fromTime !== null && toTime !== null ? Math.min(fromTime, toTime) : fromTime;
    const rangeEnd =
      fromTime !== null && toTime !== null ? Math.max(fromTime, toTime) : toTime;

    const filtered = campaigns.filter((item) => {
      if (needle && !item.campaignName.toLowerCase().includes(needle)) return false;
      if (statusFilter !== "all" && item.status !== statusFilter) return false;

      const startsAt = new Date(item.startsAt).getTime();
      if (rangeStart !== null && startsAt < rangeStart) return false;
      if (rangeEnd !== null && startsAt > rangeEnd) return false;

      return true;
    });

    filtered.sort((a, b) => {
      if (sortBy === "newest") {
        return new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime();
      }
      if (sortBy === "oldest") {
        return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
      }
      if (sortBy === "spent") {
        return b.spent - a.spent;
      }
      return b.ctr - a.ctr;
    });

    return filtered;
  }, [campaigns, searchQuery, statusFilter, dateFrom, dateTo, sortBy]);

  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    statusFilter !== "all" ||
    dateFrom !== "" ||
    dateTo !== "" ||
    sortBy !== "newest";

  const clearFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setDateFrom("");
    setDateTo("");
    setSortBy("newest");
  };

  if (!canRender) return null;

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.headerRow}>
          <div>
            <h1 className={styles.title}>All Ad Campaigns</h1>
            <p className={styles.subtitle}>Full history of your campaigns and performance.</p>
          </div>
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={() => router.push("/ads")}
          >
            Back to dashboard
          </button>
        </div>

        <section className={styles.card}>
          {loading ? <p className={styles.helper}>Loading campaigns...</p> : null}
          {!loading && error ? <p className={styles.helper}>{error}</p> : null}
          {!loading && !error ? (
            <>
              <div className={styles.filterBar}>
                <div className={styles.searchRow}>
                  <input
                    className={`${styles.filterInput} ${styles.searchInput}`}
                    type="search"
                    placeholder="Search campaign name..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />

                  <label className={styles.filterInlineField}>
                    <span className={styles.filterInlineLabel}>Status:</span>
                    <FilterDropdown
                      ariaLabel="Status filter"
                      value={statusFilter}
                      options={STATUS_FILTER_OPTIONS}
                      onChange={setStatusFilter}
                    />
                  </label>

                  <label className={styles.filterInlineField}>
                    <span className={styles.filterInlineLabel}>Sort by:</span>
                    <FilterDropdown
                      ariaLabel="Sort campaigns"
                      value={sortBy}
                      options={SORT_OPTIONS}
                      onChange={setSortBy}
                    />
                  </label>
                </div>

                <div className={styles.filtersRow}>
                  <label className={styles.filterInlineField}>
                    <span className={styles.filterInlineLabel}>From date:</span>
                    <span className={styles.dateSelectWrap}>
                      <DateSelect
                        value={dateFrom}
                        onChange={setDateFrom}
                        maxDate={dateTo ? new Date(`${dateTo}T00:00:00`) : null}
                        minDate={null}
                        minYear={2000}
                        placeholder="dd/mm/yyyy"
                      />
                    </span>
                  </label>

                  <label className={styles.filterInlineField}>
                    <span className={styles.filterInlineLabel}>To date:</span>
                    <span className={styles.dateSelectWrap}>
                      <DateSelect
                        value={dateTo}
                        onChange={setDateTo}
                        minDate={dateFrom ? new Date(`${dateFrom}T00:00:00`) : null}
                        maxDate={null}
                        minYear={2000}
                        placeholder="dd/mm/yyyy"
                      />
                    </span>
                  </label>

                  <span className={styles.filterCount}>
                    {filteredCampaigns.length} result{filteredCampaigns.length === 1 ? "" : "s"}
                  </span>

                  <button
                    type="button"
                    className={styles.clearFilterBtn}
                    onClick={clearFilters}
                    disabled={!hasActiveFilters}
                  >
                    Clear
                  </button>
                </div>
              </div>event dwell

              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Campaign</th>
                      <th>Status</th>
                      <th>Start</th>
                      <th>End</th>
                      <th>Spent</th>
                      <th>Impr.</th>
                      <th>CTR</th>
                      <th>Clicks</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCampaigns.map((item) => (
                      <tr key={item.id}>
                        <td>{item.campaignName}</td>
                        <td>
                          <span
                            className={`${styles.status} ${styles[`status_${item.status === "active" ? "active" : item.status === "hidden" ? "hidden" : item.status === "canceled" ? "canceled" : "paused"}`]}`}
                          >
                            {statusLabel(item.status)}
                          </span>
                        </td>
                        <td>{new Date(item.startsAt).toLocaleDateString()}</td>
                        <td>{new Date(item.expiresAt).toLocaleDateString()}</td>
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
                            Details
                          </button>
                        </td>
                      </tr>
                    ))}
                    {filteredCampaigns.length === 0 ? (
                      <tr>
                        <td colSpan={9}>No campaigns matched your filters.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </section>
      </div>
    </div>
  );
}
