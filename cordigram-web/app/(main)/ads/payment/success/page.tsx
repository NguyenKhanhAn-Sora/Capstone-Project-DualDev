"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  getStripeCheckoutSessionStatus,
  type StripeCheckoutSessionStatus,
} from "@/lib/api";
import styles from "../payment-status.module.css";

export default function AdsPaymentSuccessPage() {
  const t = useTranslations("ads.payment.success");
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
      setError(t("missingSession"));
      setLoading(false);
      return;
    }

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const isPaymentFinalized = (result: StripeCheckoutSessionStatus) =>
      result.paymentStatus === "paid" ||
      result.paymentStatus === "no_payment_required" ||
      result.status === "complete";

    const fetchStatus = async (attempt: number) => {
      try {
        const result = await getStripeCheckoutSessionStatus({ token, sessionId });
        if (cancelled) return;

        setStatus(result);
        setError("");

        if (isPaymentFinalized(result) || attempt >= 6) {
          setLoading(false);
          return;
        }

        retryTimer = setTimeout(() => {
          void fetchStatus(attempt + 1);
        }, 2000);
      } catch (err) {
        if (cancelled) return;

        if (attempt < 3) {
          retryTimer = setTimeout(() => {
            void fetchStatus(attempt + 1);
          }, 2000);
          return;
        }

        setError(err instanceof Error ? err.message : t("loadFailed"));
        setLoading(false);
      }
    };

    void fetchStatus(0);

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [sessionId, t]);

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
            <span className={styles.successBadge}>{t("badge")}</span>
            <h1 className={styles.title}>{t("title")}</h1>
            <p className={styles.subtitle}>{t("subtitle")}</p>
          </div>
        </div>

        {loading ? <p className={styles.subtitle}>{t("loading")}</p> : null}
        {error ? <p className={styles.error}>{error}</p> : null}

        {status ? (
          <div className={styles.detailsCard}>
            <div className={styles.row}>
              <span className={styles.rowLabel}>{t("paymentId")}</span>
              <strong className={styles.rowValueIdentifier}>
                {status.paymentIntentId || status.id}
              </strong>
            </div>
            <div className={styles.row}>
              <span className={styles.rowLabel}>{t("paymentStatus")}</span>
              <strong className={styles.rowValueStatus}>{status.paymentStatus ?? "unknown"}</strong>
            </div>
            <div className={styles.row}>
              <span className={styles.rowLabel}>{t("amount")}</span>
              <strong className={styles.rowValueAmount}>
                {(status.amountTotal ?? 0).toLocaleString("vi-VN")} {String(status.currency ?? "").toUpperCase()}
              </strong>
            </div>
          </div>
        ) : null}

        <div className={styles.actions}>
          <Link className={styles.secondaryBtn} href="/ads/create">
            {t("backToCreate")}
          </Link>
          <Link className={styles.primaryBtn} href="/ads">
            {t("goToDashboard")}
          </Link>
        </div>
      </div>
    </div>
  );
}
