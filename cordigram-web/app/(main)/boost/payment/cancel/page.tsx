"use client";

import { useRouter } from "next/navigation";
import styles from "@/app/(main)/ads/payment/payment-status.module.css";

export default function BoostPaymentCancelPage() {
  const router = useRouter();
  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Bạn đã hủy thanh toán</h1>
        <p className={styles.subtitle}>Bạn có thể thử lại bất cứ lúc nào.</p>
        <div className={styles.actions}>
          <button className={styles.secondaryBtn} type="button" onClick={() => router.push("/boost")}>
            Về trang Boost
          </button>
          <button className={styles.primaryBtn} type="button" onClick={() => router.push("/boost/checkout?mode=subscribe")}>
            Thử lại
          </button>
        </div>
      </div>
    </div>
  );
}

