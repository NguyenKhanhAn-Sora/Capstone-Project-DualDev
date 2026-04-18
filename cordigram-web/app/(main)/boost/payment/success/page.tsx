"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import styles from "@/app/(main)/ads/payment/payment-status.module.css";
import { getStripeCheckoutSessionStatus } from "@/lib/api";
import { getStoredAccessToken } from "@/lib/auth";

type StatusState =
  | { state: "loading" }
  | { state: "error"; message: string }
  | {
      state: "done";
      tier: "basic" | "boost" | null;
      cycle: "monthly" | "yearly" | null;
      isGift: boolean;
    };

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function BoostPaymentSuccessPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const sessionId = sp.get("session_id");

  const [status, setStatus] = useState<StatusState>({ state: "loading" });

  useEffect(() => {
    if (!sessionId) {
      setStatus({ state: "error", message: "Thiếu session_id." });
      return;
    }

    let active = true;
    let tries = 0;

    const tick = async () => {
      tries += 1;
      try {
        const token = getStoredAccessToken();
        if (!token) {
          setStatus({ state: "error", message: "Bạn cần đăng nhập để xem trạng thái." });
          return;
        }
        const res = await getStripeCheckoutSessionStatus({ token, sessionId });
        const paid =
          (res as any)?.paymentStatus === "paid" || (res as any)?.status === "complete";
        const meta = (res as any)?.metadata ?? {};
        const actionType = (meta?.actionType || (res as any)?.actionType) as string | undefined;
        const tier = (meta?.boostTier as any) || null;
        const cycle = (meta?.billingCycle as any) || null;

        if (paid) {
          if (!active) return;
          setStatus({
            state: "done",
            tier: tier === "boost" || tier === "basic" ? tier : null,
            cycle: cycle === "yearly" || cycle === "monthly" ? cycle : null,
            isGift: actionType === "boost_gift",
          });
          return;
        }

        if (tries < 12) {
          setTimeout(tick, 1500);
        } else if (active) {
          setStatus({
            state: "error",
            message: "Thanh toán chưa hoàn tất. Vui lòng thử lại sau.",
          });
        }
      } catch (e: any) {
        if (!active) return;
        setStatus({ state: "error", message: e?.message || "Không thể kiểm tra trạng thái." });
      }
    };

    tick();
    return () => {
      active = false;
    };
  }, [sessionId]);

  const title = useMemo(() => {
    if (status.state === "done") {
      const plan = status.tier === "boost" ? "Boost" : status.tier === "basic" ? "Boost cơ bản" : "Boost";
      return status.isGift
        ? `Chúc mừng! Bạn đã tặng thành công gói ${plan}.`
        : `Chúc mừng! Bạn đã mở khóa thành công gói ${plan}.`;
    }
    if (status.state === "error") return "Có lỗi xảy ra";
    return "Đang xác nhận thanh toán...";
  }, [status]);

  const sub = useMemo(() => {
    if (status.state !== "done") return null;
    const cycle = status.cycle === "yearly" ? "theo năm" : status.cycle === "monthly" ? "theo tháng" : null;
    return cycle ? `Gói ${cycle} đã được kích hoạt realtime.` : "Gói đã được kích hoạt realtime.";
  }, [status]);

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.successHead}>
          <div className={styles.successIcon}>
            <CheckIcon />
          </div>
          <div>
            <span className={styles.successBadge}>BOOST</span>
            <h1 className={styles.title}>{title}</h1>
            {sub ? <p className={styles.subtitle}>{sub}</p> : null}
          </div>
        </div>

        {status.state === "error" ? <p className={styles.error}>{status.message}</p> : null}

        <div className={styles.actions}>
          <button className={styles.secondaryBtn} type="button" onClick={() => router.push("/boost")}>
            Về trang Boost
          </button>
          <button className={styles.primaryBtn} type="button" onClick={() => router.push("/messages")}>
            Quay lại Messages
          </button>
        </div>
      </div>
    </div>
  );
}

