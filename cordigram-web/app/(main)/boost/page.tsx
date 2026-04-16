"use client";

import { useRouter } from "next/navigation";
import styles from "./boost.module.css";
import { useMemo, useState } from "react";

export default function BoostPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"home" | "store" | "missions" | "shop">("store");

  const tabs = useMemo(
    () => [
      { id: "home" as const, label: "Trang chủ" },
      { id: "store" as const, label: "Cửa hàng" },
      { id: "missions" as const, label: "Nhiệm vụ" },
      { id: "shop" as const, label: "Cửa hàng" },
    ],
    [],
  );

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroTopNav}>
          <div className={styles.tabs}>
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`${styles.tab} ${tab === t.id ? styles.tabActive : ""}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={styles.smallPill}
            onClick={() => router.push("/boost/checkout?mode=gift")}
          >
            Tặng Boost
          </button>
        </div>

        <h1 className={styles.heroTitle}>MỞ KHÓA VÔ VÀN ĐẶC QUYỀN CÙNG BOOST</h1>
        <div className={styles.heroRow}>
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={() => router.push("/boost/checkout?mode=subscribe")}
          >
            Đăng ký
          </button>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={() => router.push("/boost/checkout?mode=gift")}
          >
            Tặng Boost
          </button>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Có gì mới</h2>
          <p className={styles.muted}>
            Kết hợp phông chữ, hiệu ứng và màu sắc để tạo một trải nghiệm nổi bật hơn.
          </p>
        </div>
      </section>
    </div>
  );
}

