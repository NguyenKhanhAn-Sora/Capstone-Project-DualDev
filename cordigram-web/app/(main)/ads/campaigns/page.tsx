"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { DateSelect } from "@/ui/date-select/date-select";
import { getAdsDashboard, type AdsDashboardCampaign, type AdsDashboardResponse } from "@/lib/api";
import styles from "./campaigns.module.css";

const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);

const integer = (value: number) => new Intl.NumberFormat("en-US").format(value);
const pct = (value: number) => `${value.toFixed(2)}%`;

const PAGE_SIZE = 10;

type CampaignStatus = "active" | "hidden" | "paused" | "canceled" | "completed";
type StatusFilterValue = "all" | CampaignStatus;
type SortKey = "newest" | "oldest" | "spent" | "ctr" | "impressions" | "clicks";
type SortDir = "asc" | "desc";

type FilterOption<T extends string> = { value: T; label: string };

function ChevronDownIcon() {
  return (
    <svg aria-hidden viewBox="0 0 20 20" fill="none" width="16" height="16">
      <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SortIcon({ dir }: { dir: SortDir | null }) {
  if (!dir) return (
    <svg aria-hidden viewBox="0 0 16 16" fill="none" width="12" height="12" style={{ opacity: 0.35 }}>
      <path d="M4 6l4-3 4 3M4 10l4 3 4-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
  return (
    <svg aria-hidden viewBox="0 0 16 16" fill="none" width="12" height="12">
      {dir === "asc"
        ? <path d="M4 10l4-5 4 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        : <path d="M4 6l4 5 4-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}

function FilterDropdown<T extends string>({
  ariaLabel, value, options, onChange,
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
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("touchstart", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("touchstart", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selected = options.find((o) => o.value === value) ?? options[0];

  return (
    <div className={styles.filterDropdown} ref={rootRef}>
      <button
        type="button"
        className={`${styles.filterDropdownButton} ${open ? styles.filterDropdownButtonOpen : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((p) => !p)}
      >
        <span className={styles.filterDropdownText}>{selected?.label ?? ""}</span>
        <span className={`${styles.filterDropdownChevron} ${open ? styles.filterDropdownChevronOpen : ""}`}>
          <ChevronDownIcon />
        </span>
      </button>
      {open ? (
        <div className={styles.filterDropdownMenu} role="listbox" aria-label={ariaLabel}>
          {options.map((item) => (
            <button
              key={item.value}
              type="button"
              role="option"
              aria-selected={item.value === value}
              className={`${styles.filterDropdownOption} ${item.value === value ? styles.filterDropdownOptionActive : ""}`}
              onClick={() => { onChange(item.value); setOpen(false); }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const STATUS_KEYS: CampaignStatus[] = ["active", "paused", "hidden", "canceled", "completed"];

function getStatusClass(status: string) {
  if (STATUS_KEYS.includes(status as CampaignStatus)) return styles[`status_${status}`] ?? "";
  return styles.status_paused;
}

export default function AdsCampaignsPage() {
  const canRender = useRequireAuth();
  const router = useRouter();
  const t = useTranslations("ads");

  const [dashboard, setDashboard] = useState<AdsDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("newest");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);

  const statusFilterOptions = useMemo<FilterOption<StatusFilterValue>[]>(
    () => [
      { value: "all",       label: t("campaigns.statusOptions.all") },
      { value: "active",    label: t("campaigns.statusOptions.active") },
      { value: "paused",    label: t("campaigns.statusOptions.paused") },
      { value: "hidden",    label: t("campaigns.statusOptions.hidden") },
      { value: "canceled",  label: t("campaigns.statusOptions.canceled") },
      { value: "completed", label: t("campaigns.statusOptions.completed") },
    ],
    [t],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const token =
      window.localStorage.getItem("accessToken") ||
      window.localStorage.getItem("token");
    if (!token) { setLoading(false); return; }

    let cancelled = false;
    setLoading(true);
    setError("");

    getAdsDashboard({ token })
      .then((result) => { if (!cancelled) setDashboard(result); })
      .catch((err) => {
        if (!cancelled) {
          setDashboard(null);
          setError(err instanceof Error ? err.message : t("campaigns.loadFailed"));
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [t]);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [searchQuery, statusFilter, dateFrom, dateTo, sortKey, sortDir]);

  const allCampaigns = useMemo(
    () => (dashboard?.campaigns ?? []).slice(),
    [dashboard],
  );

  const filteredCampaigns = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    const fromTime = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
    const toTime   = dateTo   ? new Date(`${dateTo}T23:59:59.999`).getTime() : null;

    const filtered = allCampaigns.filter((item) => {
      if (needle && !item.campaignName.toLowerCase().includes(needle)) return false;
      if (statusFilter !== "all" && item.status !== statusFilter) return false;

      // Fix: range overlap — campaign active period overlaps the selected date range
      if (fromTime !== null || toTime !== null) {
        const start = new Date(item.startsAt).getTime();
        const end   = new Date(item.expiresAt).getTime();
        if (fromTime !== null && end < fromTime) return false;
        if (toTime   !== null && start > toTime)  return false;
      }

      return true;
    });

    filtered.sort((a, b) => {
      let diff = 0;
      if (sortKey === "newest" || sortKey === "oldest") {
        diff = new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime();
        if (sortKey === "oldest") diff = -diff;
        // respect manual sortDir override
        if (sortDir === "asc" && sortKey !== "oldest") diff = -diff;
        if (sortDir === "desc" && sortKey === "oldest") diff = -diff;
        return diff;
      }
      if (sortKey === "spent")       diff = b.spent - a.spent;
      if (sortKey === "ctr")         diff = b.ctr - a.ctr;
      if (sortKey === "impressions") diff = b.impressions - a.impressions;
      if (sortKey === "clicks")      diff = b.clicks - a.clicks;
      return sortDir === "asc" ? -diff : diff;
    });

    return filtered;
  }, [allCampaigns, searchQuery, statusFilter, dateFrom, dateTo, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filteredCampaigns.length / PAGE_SIZE));
  const pagedCampaigns = useMemo(
    () => filteredCampaigns.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredCampaigns, page],
  );

  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    statusFilter !== "all" ||
    dateFrom !== "" ||
    dateTo !== "";

  const clearFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setDateFrom("");
    setDateTo("");
    setSortKey("newest");
    setSortDir("desc");
  };

  const handleColSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const colSortDir = (key: SortKey): SortDir | null =>
    sortKey === key ? sortDir : null;

  const renderBudgetBar = (item: AdsDashboardCampaign) => {
    const pctVal = item.budget > 0 ? Math.min((item.spent / item.budget) * 100, 100) : 0;
    const color = pctVal >= 90 ? "#ef4444" : pctVal >= 70 ? "#f59e0b" : "#22c55e";
    return (
      <div className={styles.spentCell}>
        <span className={styles.spentValue}>{money(item.spent)}</span>
        <div className={styles.budgetBar}>
          <div
            className={styles.budgetBarFill}
            style={{ width: `${pctVal}%`, background: color }}
          />
        </div>
        <span className={styles.budgetHint}>of {money(item.budget)}</span>
      </div>
    );
  };

  if (!canRender) return null;

  // ── Loading skeleton ──
  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.container}>
          <div className={styles.headerRow}>
            <div>
              <div className={`${styles.skeletonLine}`} style={{ width: 260, height: 36, borderRadius: 10 }} />
              <div className={`${styles.skeletonLine}`} style={{ width: 320, height: 16, marginTop: 10, borderRadius: 6 }} />
            </div>
            <div className={`${styles.skeletonLine}`} style={{ width: 140, height: 40, borderRadius: 12 }} />
          </div>
          <div className={`${styles.card} ${styles.skeletonCard}`} style={{ minHeight: 500 }} />
        </div>
      </div>
    );
  }

  // ── Error state ──
  if (error) {
    return (
      <div className={styles.page}>
        <div className={styles.container}>
          <div className={styles.headerRow}>
            <div>
              <h1 className={styles.title}>{t("campaigns.title")}</h1>
            </div>
            <button type="button" className={styles.secondaryBtn} onClick={() => router.push("/ads")}>
              {t("campaigns.backToDashboard")}
            </button>
          </div>
          <div className={styles.errorCard}>
            <p className={styles.errorText}>{error}</p>
            <button type="button" className={styles.secondaryBtn} onClick={() => window.location.reload()}>
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        {/* ── Header ── */}
        <div className={styles.headerRow}>
          <div>
            <h1 className={styles.title}>{t("campaigns.title")}</h1>
            <p className={styles.subtitle}>{t("campaigns.subtitle")}</p>
          </div>
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={() => router.push("/ads")}
          >
            {t("campaigns.backToDashboard")}
          </button>
        </div>

        <section className={styles.card}>
          {/* ── Filters ── */}
          <div className={styles.filterBar}>
            <div className={styles.searchRow}>
              <input
                className={`${styles.filterInput} ${styles.searchInput}`}
                type="search"
                placeholder={t("campaigns.searchPlaceholder")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <label className={styles.filterInlineField}>
                <span className={styles.filterInlineLabel}>{t("campaigns.statusLabel")}</span>
                <FilterDropdown
                  ariaLabel={t("campaigns.statusAriaLabel")}
                  value={statusFilter}
                  options={statusFilterOptions}
                  onChange={setStatusFilter}
                />
              </label>
            </div>

            <div className={styles.filtersRow}>
              <label className={styles.filterInlineField}>
                <span className={styles.filterInlineLabel}>{t("campaigns.fromDate")}</span>
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
                <span className={styles.filterInlineLabel}>{t("campaigns.toDate")}</span>
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
                {filteredCampaigns.length === 1
                  ? t("campaigns.resultCount", { count: filteredCampaigns.length })
                  : t("campaigns.resultCountPlural", { count: filteredCampaigns.length })}
              </span>

              <button
                type="button"
                className={styles.clearFilterBtn}
                onClick={clearFilters}
                disabled={!hasActiveFilters}
              >
                {t("campaigns.clear")}
              </button>
            </div>
          </div>

          {/* ── Table ── */}
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.thSortable} onClick={() => handleColSort("newest")}>
                    {t("table.campaign")}
                  </th>
                  <th>{t("table.status")}</th>
                  <th className={styles.thSortable} onClick={() => handleColSort("newest")}>
                    <span className={styles.thInner}>
                      {t("table.start")}
                      <SortIcon dir={sortKey === "newest" || sortKey === "oldest" ? sortDir : null} />
                    </span>
                  </th>
                  <th>{t("table.end")}</th>
                  <th className={styles.thSortable} onClick={() => handleColSort("spent")}>
                    <span className={styles.thInner}>
                      {t("table.spent")}
                      <SortIcon dir={colSortDir("spent")} />
                    </span>
                  </th>
                  <th className={styles.thSortable} onClick={() => handleColSort("impressions")}>
                    <span className={styles.thInner}>
                      {t("table.impressions")}
                      <SortIcon dir={colSortDir("impressions")} />
                    </span>
                  </th>
                  <th>Reach</th>
                  <th className={styles.thSortable} onClick={() => handleColSort("ctr")}>
                    <span className={styles.thInner}>
                      {t("table.ctr")}
                      <SortIcon dir={colSortDir("ctr")} />
                    </span>
                  </th>
                  <th className={styles.thSortable} onClick={() => handleColSort("clicks")}>
                    <span className={styles.thInner}>
                      {t("table.clicks")}
                      <SortIcon dir={colSortDir("clicks")} />
                    </span>
                  </th>
                  <th>Engagements</th>
                  <th>{t("table.action")}</th>
                </tr>
              </thead>
              <tbody>
                {pagedCampaigns.map((item) => (
                  <tr
                    key={item.id}
                    className={styles.tableRow}
                    onClick={() => router.push(`/ads/campaigns/${item.id}`)}
                  >
                    <td className={styles.campaignNameCell}>
                      <span className={styles.campaignName}>{item.campaignName}</span>
                    </td>
                    <td>
                      <span className={`${styles.status} ${getStatusClass(item.status)}`}>
                        {t(`status.${item.status as CampaignStatus}`)}
                      </span>
                      {item.status === "canceled" && item.adminCancelReason?.trim() ? (
                        <p className={styles.cancelReasonText}>
                          {t("campaigns.adminReason", { reason: item.adminCancelReason.trim() })}
                        </p>
                      ) : null}
                    </td>
                    <td className={styles.dateCell}>{new Date(item.startsAt).toLocaleDateString()}</td>
                    <td className={styles.dateCell}>{new Date(item.expiresAt).toLocaleDateString()}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      {renderBudgetBar(item)}
                    </td>
                    <td className={styles.numCell}>{integer(item.impressions)}</td>
                    <td className={styles.numCell}>{integer(item.reach)}</td>
                    <td className={styles.numCell}>{pct(item.ctr)}</td>
                    <td className={styles.numCell}>{integer(item.clicks)}</td>
                    <td className={styles.numCell}>{integer(item.engagements)}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className={styles.detailsBtn}
                        onClick={() => router.push(`/ads/campaigns/${item.id}`)}
                      >
                        {t("table.details")}
                      </button>
                    </td>
                  </tr>
                ))}

                {/* No campaigns at all */}
                {allCampaigns.length === 0 ? (
                  <tr>
                    <td colSpan={11} className={styles.emptyCell}>
                      <div className={styles.emptyTableState}>
                        <p className={styles.emptyTableTitle}>No ad campaigns yet</p>
                        <p className={styles.emptyTableHint}>Create your first ad to start reaching your audience.</p>
                        <button
                          type="button"
                          className={styles.createBtn}
                          onClick={() => router.push("/ads/create")}
                        >
                          Create first ad
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : null}

                {/* Has campaigns but filter yields nothing */}
                {allCampaigns.length > 0 && filteredCampaigns.length === 0 ? (
                  <tr>
                    <td colSpan={11} className={styles.emptyCell}>
                      {t("table.noMatch")}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          {/* ── Pagination ── */}
          {totalPages > 1 ? (
            <div className={styles.pagination}>
              <button
                type="button"
                className={styles.pageBtn}
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                ‹ Prev
              </button>

              <div className={styles.pageNumbers}>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((n) => n === 1 || n === totalPages || Math.abs(n - page) <= 1)
                  .reduce<(number | "…")[]>((acc, n, i, arr) => {
                    if (i > 0 && typeof arr[i - 1] === "number" && n - (arr[i - 1] as number) > 1) {
                      acc.push("…");
                    }
                    acc.push(n);
                    return acc;
                  }, [])
                  .map((item, i) =>
                    item === "…" ? (
                      <span key={`ellipsis-${i}`} className={styles.pageEllipsis}>…</span>
                    ) : (
                      <button
                        key={item}
                        type="button"
                        className={`${styles.pageBtn} ${page === item ? styles.pageBtnActive : ""}`}
                        onClick={() => setPage(item as number)}
                      >
                        {item}
                      </button>
                    ),
                  )}
              </div>

              <button
                type="button"
                className={styles.pageBtn}
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next ›
              </button>

              <span className={styles.pageInfo}>
                Page {page} of {totalPages} · {filteredCampaigns.length} campaigns
              </span>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
