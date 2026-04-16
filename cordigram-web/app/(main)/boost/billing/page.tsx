"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import styles from "./billing.module.css";
import { createStripeCheckoutSession } from "@/lib/api";
import { getStoredAccessToken } from "@/lib/auth";

type Tier = "basic" | "boost";
type Cycle = "monthly" | "yearly";
type Mode = "subscribe" | "gift";

function formatVnd(value: number) {
  try {
    return value.toLocaleString("vi-VN") + "đ";
  } catch {
    return `${value}đ`;
  }
}

export default function BoostBillingPage() {
  const router = useRouter();
  const sp = useSearchParams();

  const mode = (sp.get("mode") === "gift" ? "gift" : "subscribe") as Mode;
  const tier = (sp.get("tier") === "basic" ? "basic" : "boost") as Tier;
  const recipientUserId = sp.get("recipientUserId");

  const [cycle, setCycle] = useState<Cycle>("monthly");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const monthly = tier === "boost" ? 113000 : 42000;
  const yearly = Math.round(monthly * 12 * (1 - 0.16));

  const title = useMemo(() => {
    const plan = tier === "boost" ? "Boost" : "Boost cơ bản";
    return mode === "gift" ? `Tặng ${plan}` : `Mua ${plan}`;
  }, [mode, tier]);

  const handlePay = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const token = getStoredAccessToken();
      if (!token) {
        setError("Bạn cần đăng nhập để thanh toán.");
        return;
      }
      const actionType = mode === "gift" ? "boost_gift" : "boost_subscribe";
      const res = await createStripeCheckoutSession({
        token,
        payload: {
          actionType,
          boostTier: tier,
          billingCycle: cycle,
          recipientUserId:
            mode === "gift" ? recipientUserId ?? undefined : undefined,
          currency: "vnd",
          // backend computes amountTotal for boost
        },
      });

      const url = (res as any)?.url;
      if (typeof url === "string" && url) {
        window.location.href = url;
        return;
      }
      setError("Không thể mở trang thanh toán. Vui lòng thử lại.");
    } catch (e: any) {
      setError(e?.message || "Thanh toán thất bại. Vui lòng thử lại.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.sub}>Chọn theo tháng hoặc theo năm.</p>

        {error ? <p className={styles.error}>{error}</p> : null}

        <div className={styles.grid}>
          <button
            type="button"
            className={`${styles.option} ${cycle === "monthly" ? styles.optionActive : ""}`}
            onClick={() => setCycle("monthly")}
          >
            <p className={styles.optTitle}>Theo tháng</p>
            <p className={styles.optPrice}>{formatVnd(monthly)} / tháng</p>
          </button>

          <button
            type="button"
            className={`${styles.option} ${cycle === "yearly" ? styles.optionActive : ""}`}
            onClick={() => setCycle("yearly")}
          >
            <p className={styles.optTitle}>Theo năm</p>
            <p className={styles.optPrice}>{formatVnd(yearly)} / năm</p>
          </button>
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={() => router.back()}
            disabled={submitting}
          >
            Quay lại
          </button>
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={handlePay}
            disabled={submitting}
          >
            {submitting ? "Đang chuyển tới thanh toán..." : "Chọn gói & Thanh toán"}
          </button>
        </div>
      </div>
    </div>
  );
}

