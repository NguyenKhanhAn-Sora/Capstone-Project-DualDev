"use client";

import { useRouter } from "next/navigation";
import styles from "./boost.module.css";
import { useMemo, useState } from "react";

const IcoRocket = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M4.5 16.5c-1.5 1.5-2 4-2 4s2.5-.5 4-2l-.5-.5A1 1 0 0 0 4.5 16.5Z"/>
    <path d="M12 2c-3 0-6 3-6 6 0 1.8.8 3.4 2 4.5l3.5 3.5c1.1 1.2 2.7 2 4.5 2 3 0 6-3 6-6 0-4.4-3.6-10-10-10Z"/>
    <circle cx="16" cy="8" r="1.5" fill="currentColor" stroke="none"/>
  </svg>
);

const IcoStar = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/>
  </svg>
);

const IcoBolt = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
  </svg>
);

const IcoCloud = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
    <path d="M18 10a6 6 0 0 0-11.8-1.3A4 4 0 1 0 6 17h12a4 4 0 0 0 0-8"/>
  </svg>
);

const IcoScreen = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
  </svg>
);

const IcoEmoji = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="12" r="10"/><path d="M8 13s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>
  </svg>
);

const IcoPalette = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/>
    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125 0-.92.75-1.625 1.688-1.625H16c2.761 0 5-2.239 5-5 0-4.418-4.03-8-9-8z"/>
  </svg>
);

const IcoServer = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/>
    <line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/>
  </svg>
);

export default function BoostPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"home" | "store" | "missions" | "shop">("store");

  const tabs = useMemo(
    () => [
      { id: "home" as const,     label: "Trang chủ" },
      { id: "store" as const,    label: "Cửa hàng" },
      { id: "missions" as const, label: "Nhiệm vụ" },
      { id: "shop" as const,     label: "Cửa hàng" },
    ],
    [],
  );

  const perks = [
    { icon: <IcoCloud />,   text: "Upload 600 MB" },
    { icon: <IcoScreen />,  text: "Chia sẻ màn hình HD" },
    { icon: <IcoEmoji />,   text: "Emoji cross-server" },
    { icon: <IcoPalette />, text: "Giao diện tuỳ chỉnh" },
    { icon: <IcoServer />,  text: "Nâng cấp 2 máy chủ" },
    { icon: <IcoBolt />,    text: "Ưu tiên hỗ trợ" },
  ];

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        {/* Tab nav */}
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

        {/* Hero content */}
        <div className={styles.heroContent}>
          <div className={styles.heroLeft}>
            <div className={styles.heroBadge}>
              <span className={styles.heroBadgeDot} />
              Đặc quyền độc quyền
            </div>

            <h1 className={styles.heroTitle}>MỞ KHÓA VÔ VÀN ĐẶC QUYỀN CÙNG BOOST</h1>

            <p className={styles.heroSub}>
              Trải nghiệm không giới hạn — upload siêu tốc, emoji bất kỳ server,
              giao diện galaxy cá nhân hoá và hàng chục đặc quyền cao cấp khác.
            </p>

            <div className={styles.heroRow}>
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={() => router.push("/boost/checkout?mode=subscribe")}
              >
                <IcoRocket />
                Đăng ký ngay
              </button>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => router.push("/boost/checkout?mode=gift")}
              >
                <IcoStar />
                Tặng Boost
              </button>
            </div>
          </div>

          {/* Orbital visual */}
          <div className={styles.heroVisual}>
            <div className={styles.heroOrbit} />
            <div className={styles.heroOrbit2} />
            <div className={styles.heroIcon}>
              <IcoRocket />
            </div>
          </div>
        </div>

        {/* Perk pills */}
        <div className={styles.perksRow}>
          {perks.map((p) => (
            <span key={p.text} className={styles.perkPill}>
              <span className={styles.perkIcon}>{p.icon}</span>
              {p.text}
            </span>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <p className={styles.sectionHeading}>Có gì mới</p>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Tuỳ biến không giới hạn</h2>
          <p className={styles.muted}>
            Kết hợp phông chữ, hiệu ứng và màu sắc để tạo một trải nghiệm nổi bật hơn.
            Mở khoá theme galaxy độc quyền và tự do thiết lập bản sắc riêng trên mọi server.
          </p>
        </div>
      </section>
    </div>
  );
}
