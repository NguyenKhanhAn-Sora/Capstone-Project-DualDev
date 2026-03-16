"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  getStripeCheckoutSessionStatus,
  type StripeCheckoutSessionStatus,
} from "@/lib/api";
import styles from "../payment-status.module.css";

export default function AdsPaymentSuccessPage() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id") || "";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<StripeCheckoutSessionStatus | null>(null);

  useEffect(() => {
    const token =
      typeof window !== "undefined"
        ? window.localStorage.getItem("accessToken") || window.localStorage.getItem("token")
        : null;

    if (!sessionId || !token) {
      setError("Missing payment session information.");
      setLoading(false);
      return;
    }

    getStripeCheckoutSessionStatus({ token, sessionId })
      .then((result) => {
        setStatus(result);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load payment status.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [sessionId]);

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.successHead}>
          <div className={styles.successIcon} aria-hidden>
            <svg viewBox="0 0 24 24" fill="none">
              <path
                d="M20 7L10 17L5 12"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div>
            <span className={styles.successBadge}>Payment successful</span>
            <h1 className={styles.title}>Payment Completed</h1>
            <p className={styles.subtitle}>
              Stripe checkout has returned successfully for your ads campaign.
            </p>
          </div>
        </div>

        {loading ? <p className={styles.subtitle}>Loading payment details...</p> : null}
        {error ? <p className={styles.error}>{error}</p> : null}

        {status ? (
          <div className={styles.detailsCard}>
            <div className={styles.row}>
              <span className={styles.rowLabel}>Payment ID</span>
              <strong className={styles.rowValueIdentifier}>
                {status.paymentIntentId || status.id}
              </strong>
            </div>
            <div className={styles.row}>
              <span className={styles.rowLabel}>Payment status</span>
              <strong className={styles.rowValueStatus}>{status.paymentStatus ?? "unknown"}</strong>
            </div>
            <div className={styles.row}>
              <span className={styles.rowLabel}>Amount</span>
              <strong className={styles.rowValueAmount}>
                {(status.amountTotal ?? 0).toLocaleString("vi-VN")} {String(status.currency ?? "").toUpperCase()}
              </strong>
            </div>
          </div>
        ) : null}

        <div className={styles.actions}>
          <Link className={styles.secondaryBtn} href="/ads/create">
            Back to create
          </Link>
          <Link className={styles.primaryBtn} href="/ads">
            Go to Ads dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
