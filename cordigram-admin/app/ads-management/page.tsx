"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getApiBaseUrl } from "@/lib/api";
import styles from "./ads-management.module.css";

type AdminPayload = {
  roles?: string[];
  exp?: number;
};

type CampaignStatus = "active" | "hidden" | "canceled" | "completed";

type AdsOverview = {
  adsGrossRevenue30d: number;
  adsSpend30d: number;
  adsActiveCampaigns: number;
  adsImpressions30d: number;
  adsClicks30d: number;
  adsCtr30dPct: number | null;
  totalCampaigns: number;
  pausedCampaigns: number;
  canceledCampaigns: number;
  completedCampaigns: number;
};

type AdsCampaignItem = {
  campaignId: string;
  promotedPostId: string;
  campaignName: string;
  status: CampaignStatus;
  owner: {
    userId: string;
    displayName: string | null;
    username: string | null;
    avatarUrl: string | null;
  };
  createdAt: string | null;
  startsAt: string | null;
  expiresAt: string | null;
  amountTotal: number;
  boostWeight: number;
  placement: string;
  paymentStatus: string | null;
  checkoutStatus: string | null;
  headline: string;
  primaryText: string;
  adDescription: string;
  ctaLabel: string;
  destinationUrl: string;
  post: {
    visibility: string;
    deleted: boolean;
  };
  metrics: {
    impressions: number;
    clicks: number;
    ctrPct: number | null;
    avgDwellSeconds: number | null;
  };
};

type CancelReasonState = {
  open: boolean;
  campaignId: string;
  campaignName: string;
};

type ReopenConfirmState = {
  open: boolean;
  campaignId: string;
  campaignName: string;
};

type SelectOption = {
  value: string;
  label: string;
};

const PAGE_SIZE = 30;

const decodeJwt = (token: string): AdminPayload | null => {
  try {
    const payload = token.split(".")[1];
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return json as AdminPayload;
  } catch {
    return null;
  }
};

const formatCurrencyCompact = (value?: number | null) => {
  if (typeof value !== "number") return "--";
  return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(Math.round(value))} VND`;
};

const formatNumber = (value?: number | null) => {
  if (typeof value !== "number") return "--";
  return value.toLocaleString();
};

const formatPercentCompact = (value?: number | null) => {
  if (typeof value !== "number") return "--";
  return `${value.toFixed(2)}%`;
};

const formatDate = (value?: string | null) => {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString("vi-VN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
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

export default function AdsManagementPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [overview, setOverview] = useState<AdsOverview | null>(null);
  const [campaigns, setCampaigns] = useState<AdsCampaignItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<"all" | CampaignStatus>("all");
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [cancelReasonModal, setCancelReasonModal] = useState<CancelReasonState>({
    open: false,
    campaignId: "",
    campaignName: "",
  });
  const [reopenConfirmModal, setReopenConfirmModal] = useState<ReopenConfirmState>({
    open: false,
    campaignId: "",
    campaignName: "",
  });
  const [cancelReasonInput, setCancelReasonInput] = useState("");

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

  const loadOverview = useCallback(async () => {
    if (typeof window === "undefined") return;
    const token = localStorage.getItem("adminAccessToken") || "";
    if (!token) return;

    setLoadingOverview(true);
    try {
      const response = await fetch(`${getApiBaseUrl()}/admin/ads/overview`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to load ads overview");
      }

      const payload = (await response.json()) as AdsOverview;
      setOverview(payload);
    } catch {
      setOverview(null);
    } finally {
      setLoadingOverview(false);
    }
  }, []);

  const fetchCampaignsPage = useCallback(
    async (params: { offsetValue: number; reset: boolean }) => {
      if (typeof window === "undefined") return;
      const token = localStorage.getItem("adminAccessToken") || "";
      if (!token) return;

      const { offsetValue, reset } = params;
      setLoadingCampaigns(true);
      if (reset) {
        setListError(null);
      }

      try {
        const searchParams = new URLSearchParams();
        searchParams.set("limit", String(PAGE_SIZE));
        searchParams.set("offset", String(offsetValue));
        searchParams.set("status", statusFilter);
        if (query.trim()) {
          searchParams.set("q", query.trim());
        }

        const response = await fetch(
          `${getApiBaseUrl()}/admin/ads/campaigns?${searchParams.toString()}`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );

        if (!response.ok) {
          throw new Error("Failed to load ads campaigns");
        }

        const payload = (await response.json()) as {
          items?: AdsCampaignItem[];
          hasMore?: boolean;
        };

        const fetchedItems = Array.isArray(payload.items) ? payload.items : [];
        setCampaigns((prev) => (reset ? fetchedItems : [...prev, ...fetchedItems]));
        setOffset(offsetValue + fetchedItems.length);
        setHasMore(Boolean(payload.hasMore));
      } catch {
        setListError("Could not load ads campaigns.");
      } finally {
        setLoadingCampaigns(false);
      }
    },
    [query, statusFilter],
  );

  const reloadCampaigns = useCallback(async () => {
    setOffset(0);
    setHasMore(true);
    await fetchCampaignsPage({ offsetValue: 0, reset: true });
  }, [fetchCampaignsPage]);

  const loadMoreCampaigns = useCallback(async () => {
    if (loadingCampaigns || !hasMore) return;
    await fetchCampaignsPage({ offsetValue: offset, reset: false });
  }, [fetchCampaignsPage, hasMore, loadingCampaigns, offset]);

  useEffect(() => {
    if (!ready) return;
    void loadOverview();
  }, [ready, loadOverview]);

  useEffect(() => {
    if (!ready) return;
    void reloadCampaigns();
  }, [ready, reloadCampaigns]);

  const runAction = useCallback(
    async (
      campaignId: string,
      action: "cancel_campaign" | "reopen_canceled_campaign",
      reason?: string,
    ) => {
      if (typeof window === "undefined") return;
      const token = localStorage.getItem("adminAccessToken") || "";
      if (!token) return;

      setActionLoadingId(campaignId);
      try {
        const response = await fetch(`${getApiBaseUrl()}/admin/ads/campaigns/${campaignId}/action`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            action,
            reason: action === "cancel_campaign" ? reason?.trim() ?? "" : undefined,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to update campaign");
        }

        await Promise.all([loadOverview(), reloadCampaigns()]);
      } catch {
        setListError("Campaign action failed.");
      } finally {
        setActionLoadingId(null);
      }
    },
    [loadOverview, reloadCampaigns],
  );

  const confirmCancelWithReason = useCallback(async () => {
    const reason = cancelReasonInput.trim();
    if (!cancelReasonModal.campaignId || !reason) {
      return;
    }

    await runAction(cancelReasonModal.campaignId, "cancel_campaign", reason);
    setCancelReasonInput("");
    setCancelReasonModal({
      open: false,
      campaignId: "",
      campaignName: "",
    });
  }, [cancelReasonInput, cancelReasonModal.campaignId, runAction]);

  const confirmReopenCampaign = useCallback(async () => {
    if (!reopenConfirmModal.campaignId) {
      return;
    }

    await runAction(reopenConfirmModal.campaignId, "reopen_canceled_campaign");
    setReopenConfirmModal({
      open: false,
      campaignId: "",
      campaignName: "",
    });
  }, [reopenConfirmModal.campaignId, runAction]);

  const statusLabel = useMemo(
    () => ({
      active: "Active",
      hidden: "Hidden",
      canceled: "Canceled",
      completed: "Completed",
    }),
    [],
  );

  if (!ready) return null;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Ads Center</p>
          <h1>Ads Management</h1>
          <p className={styles.subtitle}>
            Dashboard and campaign list for monitoring ad performance and controlling ad delivery.
          </p>
        </div>
      </header>

      <section className={styles.kpis}>
        <article className={styles.kpiCard}>
          <p>Gross Revenue (30d)</p>
          <strong>{loadingOverview ? "..." : formatCurrencyCompact(overview?.adsGrossRevenue30d)}</strong>
        </article>
        <article className={styles.kpiCard}>
          <p>Active Campaigns</p>
          <strong>{loadingOverview ? "..." : formatNumber(overview?.adsActiveCampaigns)}</strong>
        </article>
        <article className={styles.kpiCard}>
          <p>CTR (30d)</p>
          <strong>{loadingOverview ? "..." : formatPercentCompact(overview?.adsCtr30dPct)}</strong>
        </article>
        <article className={styles.kpiCard}>
          <p>Total Campaigns</p>
          <strong>{loadingOverview ? "..." : formatNumber(overview?.totalCampaigns)}</strong>
        </article>
        <article className={styles.kpiCard}>
          <p>Hidden</p>
          <strong>{loadingOverview ? "..." : formatNumber(overview?.pausedCampaigns)}</strong>
        </article>
        <article className={styles.kpiCard}>
          <p>Completed</p>
          <strong>{loadingOverview ? "..." : formatNumber(overview?.completedCampaigns)}</strong>
        </article>
      </section>

      <section className={styles.toolbar}>
        <input
          className={styles.search}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by campaign, owner, promoted post, session..."
        />
        <div className={styles.filterItem}>
          <span className={styles.filterLabel}>Status:</span>
          <CustomSelect
            value={statusFilter}
            onChange={(value) => setStatusFilter(value as "all" | CampaignStatus)}
            ariaLabel="Ads campaign status filter"
            options={[
              { value: "all", label: "all status" },
              { value: "active", label: "active" },
              { value: "hidden", label: "hidden" },
              { value: "canceled", label: "canceled" },
              { value: "completed", label: "completed" },
            ]}
          />
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2>All Ads Campaigns</h2>
          <span>{formatNumber(campaigns.length)} loaded</span>
        </div>

        {listError ? <p className={styles.error}>{listError}</p> : null}

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Campaign</th>
                <th>Owner</th>
                <th>Status</th>
                <th>Schedule</th>
                <th>Spent</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((item) => (
                <tr key={item.campaignId}>
                  <td>
                    <p className={styles.mainText}>{item.campaignName || "Ads Campaign"}</p>
                    <p className={styles.codeText}>{item.campaignId}</p>
                  </td>
                  <td>
                    <p className={styles.mainText}>{item.owner.displayName || item.owner.username || "Unknown"}</p>
                    <p className={styles.subText}>@{item.owner.username || "unknown"}</p>
                    <p className={styles.codeText}>User: {item.owner.userId}</p>
                  </td>
                  <td>
                    <span className={`${styles.badge} ${styles[`status_${item.status}`]}`}>
                      {statusLabel[item.status]}
                    </span>
                  </td>
                  <td>
                    <p className={styles.subText}>Start: {formatDate(item.startsAt)}</p>
                    <p className={styles.subText}>End: {formatDate(item.expiresAt)}</p>
                  </td>
                  <td>
                    <p className={styles.mainText}>{formatCurrencyCompact(item.amountTotal)}</p>
                  </td>
                  <td>
                    <div className={styles.actions}>
                      <Link href={`/ads-management/${item.campaignId}`} className={styles.actionLink}>
                        Review content
                      </Link>
                      {item.status === "canceled" ? (
                        <button
                          type="button"
                          className={styles.actionButton}
                          disabled={actionLoadingId === item.campaignId}
                          onClick={() =>
                            setReopenConfirmModal({
                              open: true,
                              campaignId: item.campaignId,
                              campaignName: item.campaignName || "Ads Campaign",
                            })
                          }
                        >
                          Reopen
                        </button>
                      ) : null}
                      {item.status !== "canceled" && item.status !== "completed" ? (
                        <button
                          type="button"
                          className={`${styles.actionButton} ${styles.actionDanger}`}
                          disabled={actionLoadingId === item.campaignId}
                          onClick={() =>
                            setCancelReasonModal({
                              open: true,
                              campaignId: item.campaignId,
                              campaignName: item.campaignName || "Ads Campaign",
                            })
                          }
                        >
                          Cancel
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}

              {!loadingCampaigns && campaigns.length === 0 ? (
                <tr>
                  <td colSpan={6} className={styles.emptyCell}>
                    No ads campaigns found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className={styles.loadMoreWrap}>
          {hasMore ? (
            <button
              type="button"
              className={styles.loadMoreButton}
              onClick={() => void loadMoreCampaigns()}
              disabled={loadingCampaigns}
            >
              {loadingCampaigns ? "Loading..." : "Load more campaigns"}
            </button>
          ) : (
            <span className={styles.subText}>No more campaigns</span>
          )}
        </div>
      </section>

      {cancelReasonModal.open ? (
        <div
          className={styles.confirmOverlay}
          onClick={() => {
            if (actionLoadingId === cancelReasonModal.campaignId) return;
            setCancelReasonInput("");
            setCancelReasonModal({
              open: false,
              campaignId: "",
              campaignName: "",
            });
          }}
        >
          <div className={styles.confirmCard} onClick={(event) => event.stopPropagation()}>
            <p className={styles.confirmTitle}>Cancel ads campaign</p>
            <p className={styles.confirmText}>
              You are canceling <strong>{cancelReasonModal.campaignName}</strong>. Please provide a clear reason to send
              to the advertiser.
            </p>
            <textarea
              className={styles.reasonInput}
              placeholder="Enter cancellation reason"
              value={cancelReasonInput}
              onChange={(event) => setCancelReasonInput(event.target.value)}
              rows={4}
              maxLength={500}
            />
            <div className={styles.reasonMeta}>{cancelReasonInput.trim().length}/500 characters</div>
            <div className={styles.confirmActions}>
              <button
                type="button"
                className={styles.confirmSecondary}
                onClick={() => {
                  setCancelReasonInput("");
                  setCancelReasonModal({
                    open: false,
                    campaignId: "",
                    campaignName: "",
                  });
                }}
                disabled={actionLoadingId === cancelReasonModal.campaignId}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.confirmPrimary}
                onClick={() => void confirmCancelWithReason()}
                disabled={
                  actionLoadingId === cancelReasonModal.campaignId || cancelReasonInput.trim().length === 0
                }
              >
                {actionLoadingId === cancelReasonModal.campaignId ? "Confirming..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {reopenConfirmModal.open ? (
        <div
          className={styles.confirmOverlay}
          onClick={() => {
            if (actionLoadingId === reopenConfirmModal.campaignId) return;
            setReopenConfirmModal({
              open: false,
              campaignId: "",
              campaignName: "",
            });
          }}
        >
          <div className={styles.confirmCard} onClick={(event) => event.stopPropagation()}>
            <p className={styles.confirmTitle}>Reopen ads campaign</p>
            <p className={styles.confirmText}>
              Confirm reopen for <strong>{reopenConfirmModal.campaignName}</strong>? This campaign will be active again,
              and the advertiser will receive realtime notification and email.
            </p>
            <div className={styles.confirmActions}>
              <button
                type="button"
                className={styles.confirmSecondary}
                onClick={() =>
                  setReopenConfirmModal({
                    open: false,
                    campaignId: "",
                    campaignName: "",
                  })
                }
                disabled={actionLoadingId === reopenConfirmModal.campaignId}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.confirmPrimary}
                onClick={() => void confirmReopenCampaign()}
                disabled={actionLoadingId === reopenConfirmModal.campaignId}
              >
                {actionLoadingId === reopenConfirmModal.campaignId ? "Reopening..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
