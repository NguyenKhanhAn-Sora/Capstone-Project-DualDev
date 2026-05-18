"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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

export default function AdsCampaignsPage() {
  const canRender = useRequireAuth();
  const router = useRouter();
  const t = useTranslations("ads");

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

  const statusFilterOptions = useMemo<FilterOption<"all" | "active" | "hidden" | "canceled" | "completed">[]>(
    () => [
      { value: "all", label: t("campaigns.statusOptions.all") },
      { value: "active", label: t("campaigns.statusOptions.active") },
      { value: "hidden", label: t("campaigns.statusOptions.hidden") },
      { value: "canceled", label: t("campaigns.statusOptions.canceled") },
      { value: "completed", label: t("campaigns.statusOptions.completed") },
    ],
    [t],
  );

  const sortOptions = useMemo<FilterOption<"newest" | "oldest" | "spent" | "ctr">[]>(
    () => [
      { value: "newest", label: t("campaigns.sortOptions.newest") },
      { value: "oldest", label: t("campaigns.sortOptions.oldest") },
      { value: "spent", label: t("campaigns.sortOptions.spent") },
      { value: "ctr", label: t("campaigns.sortOptions.ctr") },
    ],
    [t],
  );

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
        setError(err instanceof Error ? err.message : t("campaigns.loadFailed"));
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [t]);

  const campaigns = useMemo(
    () =>
      (dashboard?.campaigns ?? []).slice().sort(
        (a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime(),
      ),
    [dashboard],
  );

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

  const statusLabel = (status: "active" | "hidden" | "paused" | "canceled" | "completed") =>
    t(`status.${status}`);

  if (!canRender) return null;

  return (
    <div className={styles.page}>
      <div className={styles.container}>
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
          {loading ? <p className={styles.helper}>{t("campaigns.loading")}</p> : null}
          {!loading && error ? <p className={styles.helper}>{error}</p> : null}
          {!loading && !error ? (
            <>
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

                  <label className={styles.filterInlineField}>
                    <span className={styles.filterInlineLabel}>{t("campaigns.sortLabel")}</span>
                    <FilterDropdown
                      ariaLabel={t("campaigns.sortAriaLabel")}
                      value={sortBy}
                      options={sortOptions}
                      onChange={setSortBy}
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

              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>{t("table.campaign")}</th>
                      <th>{t("table.status")}</th>
                      <th>{t("table.start")}</th>
                      <th>{t("table.end")}</th>
                      <th>{t("table.spent")}</th>
                      <th>{t("table.impressions")}</th>
                      <th>{t("table.ctr")}</th>
                      <th>{t("table.clicks")}</th>
                      <th>{t("table.action")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCampaigns.map((item) => (
                      <tr key={item.id}>
                        <td>{item.campaignName}</td>
                        <td>
                          <span
                            className={`${styles.status} ${styles[`status_${item.status === "active" ? "active" : item.status === "hidden" ? "hidden" : item.status === "canceled" ? "canceled" : item.status === "completed" ? "completed" : "paused"}`]}`}
                          >
                            {statusLabel(item.status)}
                          </span>
                          {item.status === "canceled" && item.adminCancelReason?.trim() ? (
                            <p className={styles.cancelReasonText}>
                              {t("campaigns.adminReason", { reason: item.adminCancelReason.trim() })}
                            </p>
                          ) : null}
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
                            {t("table.details")}
                          </button>
                        </td>
                      </tr>
                    ))}
                    {filteredCampaigns.length === 0 ? (
                      <tr>
                        <td colSpan={9}>{t("table.noMatch")}</td>
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
