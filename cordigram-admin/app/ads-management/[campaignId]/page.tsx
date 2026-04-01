"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { getApiBaseUrl } from "@/lib/api";
import styles from "./campaign-detail.module.css";

type AdminPayload = {
  roles?: string[];
  exp?: number;
};

type CampaignStatus = "active" | "hidden" | "canceled" | "completed";

type AdminAdsCampaignDetail = {
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
  objective: string;
  adFormat: string;
  primaryText: string;
  headline: string;
  adDescription: string;
  destinationUrl: string;
  ctaLabel: string;
  interests: string[];
  targetLocation: string;
  targetAgeMin: number | null;
  targetAgeMax: number | null;
  mediaUrls: string[];
  boostPackageId: string;
  durationPackageId: string;
  durationDays: number;
  hiddenReason: string | null;
  adminCancelReason: string | null;
  post: {
    visibility: string;
    deleted: boolean;
  };
  metrics: {
    impressions: number;
    reach: number;
    clicks: number;
    ctrPct: number | null;
    views: number;
    likes: number;
    comments: number;
    reposts: number;
    engagements: number;
    avgDwellSeconds: number | null;
    totalDwellSeconds: number;
    dwellSamples: number;
    engagementRatePct: number | null;
  };
  actions: {
    canCancel: boolean;
    canReopen: boolean;
  };
};

type CancelReasonState = {
  open: boolean;
  campaignId: string;
  campaignName: string;
};

const decodeJwt = (token: string): AdminPayload | null => {
  try {
    const payload = token.split(".")[1];
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return json as AdminPayload;
  } catch {
    return null;
  }
};

const formatNumber = (value?: number | null) => {
  if (typeof value !== "number") return "--";
  return value.toLocaleString("vi-VN");
};

const formatPercent = (value?: number | null) => {
  if (typeof value !== "number") return "--";
  return `${value.toFixed(2)}%`;
};

const formatCurrency = (value?: number | null) => {
  if (typeof value !== "number") return "--";
  return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(Math.round(value))} VND`;
};

const formatDate = (value?: string | null) => {
  if (!value) return "--";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "--";
  return d.toLocaleString("vi-VN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const statusLabel: Record<CampaignStatus, string> = {
  active: "Active",
  hidden: "Hidden",
  canceled: "Canceled",
  completed: "Completed",
};

const hiddenReasonLabel = (reason?: string | null) => {
  if (!reason) return "Visible";
  if (reason === "paused") return "Paused";
  if (reason === "canceled") return "Canceled";
  if (reason === "expired") return "Expired";
  return reason;
};

const isVideoUrl = (url: string) => /(\.mp4|\.mov|\.webm|\.mkv)(\?|#|$)/i.test(url);

export default function AdminAdsCampaignDetailPage() {
  const router = useRouter();
  const params = useParams<{ campaignId: string }>();
  const campaignId = String(params?.campaignId ?? "");

  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<AdminAdsCampaignDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [cancelReasonInput, setCancelReasonInput] = useState("");
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [activeMediaIndex, setActiveMediaIndex] = useState<number | null>(null);
  const [reopenConfirmOpen, setReopenConfirmOpen] = useState(false);
  const [cancelReasonModal, setCancelReasonModal] = useState<CancelReasonState>({
    open: false,
    campaignId: "",
    campaignName: "",
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

  const loadDetail = useCallback(async () => {
    if (typeof window === "undefined") return;
    const token = localStorage.getItem("adminAccessToken") || "";
    if (!token || !campaignId) return;

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${getApiBaseUrl()}/admin/ads/campaigns/${campaignId}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to load campaign detail");
      }

      const payload = (await response.json()) as AdminAdsCampaignDetail;
      setDetail(payload);
    } catch {
      setError("Could not load campaign detail.");
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    if (!ready) return;
    void loadDetail();
  }, [ready, loadDetail]);

  const runAction = useCallback(
    async (action: "cancel_campaign" | "reopen_canceled_campaign", reason?: string) => {
      if (typeof window === "undefined") return;
      const token = localStorage.getItem("adminAccessToken") || "";
      if (!token || !campaignId) return;

      setActionLoading(true);
      setError(null);
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
          throw new Error("Failed to update campaign action");
        }

        await loadDetail();
      } catch {
        setError("Campaign action failed.");
      } finally {
        setActionLoading(false);
      }
    },
    [campaignId, loadDetail],
  );

  const confirmCancel = useCallback(async () => {
    const reason = cancelReasonInput.trim();
    if (!reason) return;

    await runAction("cancel_campaign", reason);
    setCancelReasonInput("");
    setCancelReasonModal({
      open: false,
      campaignId: "",
      campaignName: "",
    });
  }, [cancelReasonInput, runAction]);

  const copyDestinationUrl = useCallback(async () => {
    const raw = detail?.destinationUrl?.trim() ?? "";
    if (!raw) return;
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) return;

    try {
      await navigator.clipboard.writeText(raw);
      setCopiedUrl(true);
      window.setTimeout(() => setCopiedUrl(false), 1400);
    } catch {
      // Ignore clipboard failure to avoid interrupting admin flow.
    }
  }, [detail?.destinationUrl]);

  const mediaUrls = useMemo(() => (Array.isArray(detail?.mediaUrls) ? detail.mediaUrls : []), [detail]);
  const canRenderMedia = mediaUrls.length > 0;

  const activeMediaUrl =
    activeMediaIndex !== null && activeMediaIndex >= 0 && activeMediaIndex < mediaUrls.length
      ? mediaUrls[activeMediaIndex]
      : null;

  const canGoPrev = activeMediaIndex !== null && activeMediaIndex > 0;
  const canGoNext = activeMediaIndex !== null && activeMediaIndex < mediaUrls.length - 1;

  useEffect(() => {
    if (activeMediaIndex === null) return;
    if (activeMediaIndex < 0 || activeMediaIndex >= mediaUrls.length) {
      setActiveMediaIndex(null);
    }
  }, [activeMediaIndex, mediaUrls.length]);

  if (!ready) return null;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <Link href="/ads-management" className={styles.backLink}>
            Back to ads management
          </Link>
        </div>

        <h1>{detail?.campaignName || "Ads Campaign"}</h1>
        <p className={styles.subtitle}>
          Admin review detail with full campaign performance, creative data, targeting, and lifecycle actions.
        </p>

        {detail ? (
          <div className={styles.badgeRow}>
            <span className={`${styles.badge} ${styles[`status_${detail.status}`]}`}>{statusLabel[detail.status]}</span>
            <span className={styles.campaignIdBadge}>{detail.campaignId}</span>
          </div>
        ) : null}
      </header>

      {loading ? <p className={styles.loading}>Loading campaign detail...</p> : null}
      {error ? <p className={styles.error}>{error}</p> : null}

      {!loading && detail ? (
        <>
          <section className={styles.kpiGrid}>
            <article className={styles.kpiCard}><p>Budget</p><strong>{formatCurrency(detail.amountTotal)}</strong></article>
            <article className={styles.kpiCard}><p>Impressions</p><strong>{formatNumber(detail.metrics.impressions)}</strong></article>
            <article className={styles.kpiCard}><p>Reach</p><strong>{formatNumber(detail.metrics.reach)}</strong></article>
            <article className={styles.kpiCard}><p>Clicks</p><strong>{formatNumber(detail.metrics.clicks)}</strong></article>
            <article className={styles.kpiCard}><p>CTR</p><strong>{formatPercent(detail.metrics.ctrPct)}</strong></article>
            <article className={styles.kpiCard}><p>Engagement rate</p><strong>{formatPercent(detail.metrics.engagementRatePct)}</strong></article>
            <article className={styles.kpiCard}><p>Views</p><strong>{formatNumber(detail.metrics.views)}</strong></article>
            <article className={styles.kpiCard}><p>Likes</p><strong>{formatNumber(detail.metrics.likes)}</strong></article>
            <article className={styles.kpiCard}><p>Comments</p><strong>{formatNumber(detail.metrics.comments)}</strong></article>
            <article className={styles.kpiCard}><p>Reposts</p><strong>{formatNumber(detail.metrics.reposts)}</strong></article>
            <article className={styles.kpiCard}><p>Engagements</p><strong>{formatNumber(detail.metrics.engagements)}</strong></article>
            <article className={styles.kpiCard}><p>Avg dwell</p><strong>{formatNumber(detail.metrics.avgDwellSeconds)}s</strong></article>
          </section>

          <section className={styles.gridTwoCol}>
            <article className={styles.card}>
              <h2>Lifecycle and action</h2>
              <div className={styles.infoList}>
                <p><span>Start</span><strong>{formatDate(detail.startsAt)}</strong></p>
                <p><span>End</span><strong>{formatDate(detail.expiresAt)}</strong></p>
                <p><span>Hidden reason</span><strong>{hiddenReasonLabel(detail.hiddenReason)}</strong></p>
                <p><span>Admin cancel reason</span><strong>{detail.adminCancelReason || "--"}</strong></p>
                <p><span>Payment status</span><strong>{detail.paymentStatus || "--"}</strong></p>
                <p><span>Checkout status</span><strong>{detail.checkoutStatus || "--"}</strong></p>
              </div>

              <div className={styles.actions}>
                {detail.actions.canReopen ? (
                  <button
                    type="button"
                    className={styles.actionButton}
                    disabled={actionLoading}
                    onClick={() => setReopenConfirmOpen(true)}
                  >
                    {actionLoading ? "Updating..." : "Reopen campaign"}
                  </button>
                ) : null}

                {detail.actions.canCancel ? (
                  <button
                    type="button"
                    className={`${styles.actionButton} ${styles.actionDanger}`}
                    disabled={actionLoading}
                    onClick={() =>
                      setCancelReasonModal({
                        open: true,
                        campaignId: detail.campaignId,
                        campaignName: detail.campaignName,
                      })
                    }
                  >
                    Cancel campaign
                  </button>
                ) : null}
              </div>
            </article>

            <article className={styles.card}>
              <h2>Owner and targeting</h2>
              <div className={styles.infoList}>
                <p><span>Owner</span><strong>{detail.owner.displayName || detail.owner.username || "Unknown"}</strong></p>
                <p><span>Username</span><strong>@{detail.owner.username || "unknown"}</strong></p>
                <p><span>User ID</span><strong className={styles.code}>{detail.owner.userId}</strong></p>
                <p><span>Objective</span><strong>{detail.objective || "--"}</strong></p>
                <p><span>Ad format</span><strong>{detail.adFormat || "--"}</strong></p>
                <p><span>Location</span><strong>{detail.targetLocation || "--"}</strong></p>
                <p><span>Age range</span><strong>{detail.targetAgeMin ?? "--"} - {detail.targetAgeMax ?? "--"}</strong></p>
                <p><span>Interests</span><strong>{detail.interests.length ? detail.interests.join(", ") : "--"}</strong></p>
              </div>
            </article>
          </section>

          <section className={styles.card}>
            <h2>Creative detail</h2>
            <div className={styles.creativeBody}>
              <div className={styles.copyBlock}>
                <p className={styles.copyLabel}>Primary text</p>
                <p className={styles.copyValue}>{detail.primaryText || "--"}</p>
              </div>
              <div className={styles.copyBlock}>
                <p className={styles.copyLabel}>Headline</p>
                <p className={styles.copyValue}>{detail.headline || "--"}</p>
              </div>
              <div className={styles.copyBlock}>
                <p className={styles.copyLabel}>Description</p>
                <p className={styles.copyValue}>{detail.adDescription || "--"}</p>
              </div>
              <div className={styles.specGrid}>
                <div className={styles.specCard}>
                  <p className={styles.specLabel}>CTA</p>
                  <p className={styles.specValue}>{detail.ctaLabel || "--"}</p>
                </div>
                <div className={styles.specCard}>
                  <p className={styles.specLabel}>Destination URL</p>
                  <div className={styles.urlRow}>
                    <p className={`${styles.specValue} ${styles.code}`}>{detail.destinationUrl || "--"}</p>
                    <button
                      type="button"
                      className={styles.copyIconBtn}
                      onClick={() => void copyDestinationUrl()}
                      disabled={!detail.destinationUrl?.trim()}
                      aria-label="Copy destination URL"
                      title={copiedUrl ? "Copied" : "Copy URL"}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path
                          d="M8 8.5A2.5 2.5 0 0 1 10.5 6h8A2.5 2.5 0 0 1 21 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-8A2.5 2.5 0 0 1 8 17.5z"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                        />
                        <path
                          d="M16 6V5.5A2.5 2.5 0 0 0 13.5 3h-8A2.5 2.5 0 0 0 3 5.5v9A2.5 2.5 0 0 0 5.5 17H8"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
                <div className={styles.specCard}>
                  <p className={styles.specLabel}>Boost package</p>
                  <p className={styles.specValue}>{detail.boostPackageId || "--"}</p>
                </div>
                <div className={styles.specCard}>
                  <p className={styles.specLabel}>Duration days</p>
                  <p className={styles.specValue}>{formatNumber(detail.durationDays)}</p>
                </div>
              </div>
            </div>

            {canRenderMedia ? (
              <div className={styles.mediaGrid}>
                {mediaUrls.map((url, index) => (
                  <button
                    key={`${url}-${index}`}
                    type="button"
                    className={styles.mediaItem}
                    onClick={() => setActiveMediaIndex(index)}
                  >
                    {isVideoUrl(url) ? (
                      <video src={url} preload="metadata" muted />
                    ) : (
                      <img src={url} alt="Campaign creative" />
                    )}
                  </button>
                ))}
              </div>
            ) : null}
          </section>
        </>
      ) : null}

      {activeMediaUrl ? (
        <div className={styles.mediaOverlay} onClick={() => setActiveMediaIndex(null)}>
          <button
            type="button"
            className={styles.mediaClose}
            onClick={() => setActiveMediaIndex(null)}
            aria-label="Close media preview"
          />

          {canGoPrev ? (
            <button
              type="button"
              className={`${styles.mediaNav} ${styles.mediaNavLeft}`}
              onClick={(event) => {
                event.stopPropagation();
                setActiveMediaIndex((prev) => (typeof prev === "number" ? Math.max(prev - 1, 0) : 0));
              }}
              aria-label="Previous media"
            >
              {"<"}
            </button>
          ) : null}

          <div className={styles.mediaStage} onClick={(event) => event.stopPropagation()}>
            {isVideoUrl(activeMediaUrl) ? (
              <video className={styles.mediaContent} src={activeMediaUrl} controls autoPlay />
            ) : (
              <img className={styles.mediaContent} src={activeMediaUrl} alt="Campaign media full preview" />
            )}
          </div>

          {canGoNext ? (
            <button
              type="button"
              className={`${styles.mediaNav} ${styles.mediaNavRight}`}
              onClick={(event) => {
                event.stopPropagation();
                setActiveMediaIndex((prev) =>
                  typeof prev === "number" ? Math.min(prev + 1, mediaUrls.length - 1) : mediaUrls.length - 1,
                );
              }}
              aria-label="Next media"
            >
              {">"}
            </button>
          ) : null}

          <div className={styles.mediaCount}>
            {typeof activeMediaIndex === "number" ? activeMediaIndex + 1 : 1}/{mediaUrls.length}
          </div>
        </div>
      ) : null}

      {copiedUrl ? <div className={styles.copyToast}>URL copied</div> : null}

      {reopenConfirmOpen ? (
        <div
          className={styles.confirmOverlay}
          onClick={() => {
            if (actionLoading) return;
            setReopenConfirmOpen(false);
          }}
        >
          <div className={styles.confirmCard} onClick={(event) => event.stopPropagation()}>
            <p className={styles.confirmTitle}>Reopen ads campaign</p>
            <p className={styles.confirmText}>
              Confirm reopen for <strong>{detail?.campaignName || "Ads Campaign"}</strong>? This campaign will be active
              again, and the advertiser will receive realtime notification and email.
            </p>
            <div className={styles.confirmActions}>
              <button
                type="button"
                className={styles.confirmSecondary}
                onClick={() => setReopenConfirmOpen(false)}
                disabled={actionLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.confirmPrimary}
                onClick={async () => {
                  await runAction("reopen_canceled_campaign");
                  setReopenConfirmOpen(false);
                }}
                disabled={actionLoading}
              >
                {actionLoading ? "Reopening..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {cancelReasonModal.open ? (
        <div
          className={styles.confirmOverlay}
          onClick={() => {
            if (actionLoading) return;
            setCancelReasonInput("");
            setCancelReasonModal({ open: false, campaignId: "", campaignName: "" });
          }}
        >
          <div className={styles.confirmCard} onClick={(event) => event.stopPropagation()}>
            <p className={styles.confirmTitle}>Cancel ads campaign</p>
            <p className={styles.confirmText}>
              You are canceling <strong>{cancelReasonModal.campaignName || "Ads Campaign"}</strong>. Please provide a clear reason.
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
                  setCancelReasonModal({ open: false, campaignId: "", campaignName: "" });
                }}
                disabled={actionLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.confirmPrimary}
                onClick={() => void confirmCancel()}
                disabled={actionLoading || cancelReasonInput.trim().length === 0}
              >
                {actionLoading ? "Confirming..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
