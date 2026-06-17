"use client";

import { useMemo, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import styles from "./checkout.module.css";
import { getAvailableUsers } from "@/lib/api";

type Tier = "basic" | "boost";
type Mode = "subscribe" | "gift";

const IcoClose = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

const IcoCheck = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

const IcoCheckLg = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

const IcoArrow = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
  </svg>
);

const IcoRocket = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M4.5 16.5c-1.5 1.5-2 4-2 4s2.5-.5 4-2l-.5-.5A1 1 0 0 0 4.5 16.5Z"/>
    <path d="M12 2c-3 0-6 3-6 6 0 1.8.8 3.4 2 4.5l3.5 3.5c1.1 1.2 2.7 2 4.5 2 3 0 6-3 6-6 0-4.4-3.6-10-10-10Z"/>
    <circle cx="16" cy="8" r="1.5" fill="currentColor" stroke="none"/>
  </svg>
);

const IcoStar = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" opacity="0.85"/>
  </svg>
);

export default function BoostCheckoutPage() {
  const t = useTranslations("ui");
  const router = useRouter();
  const sp = useSearchParams();
  const mode = (sp.get("mode") === "gift" ? "gift" : "subscribe") as Mode;

  const [tier, setTier] = useState<Tier>("boost");
  const [users, setUsers] = useState<any[]>([]);
  const [query, setQuery] = useState("");
  const [recipientUserId, setRecipientUserId] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== "gift") return;
    getAvailableUsers()
      .then((res) => setUsers(Array.isArray(res) ? res : []))
      .catch(() => setUsers([]));
  }, [mode]);

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const a = String(u?.username ?? "").toLowerCase();
      const b = String(u?.displayName ?? "").toLowerCase();
      return a.includes(q) || b.includes(q);
    });
  }, [users, query]);

  const canContinue = mode === "subscribe" ? true : Boolean(recipientUserId);

  return (
    <div className={styles.overlay}>
      <div className={styles.card}>
        {/* Header */}
        <div className={styles.headRow}>
          <h1 className={styles.title}>
            {mode === "gift" ? "Tặng Boost" : "Chọn gói Boost"}
          </h1>
          <button
            type="button"
            className={styles.close}
            onClick={() => router.push("/boost")}
            aria-label="Close"
          >
            <IcoClose />
          </button>
        </div>

        {/* Plan cards */}
        <div className={styles.grid}>
          {/* Premium Boost */}
          <button
            type="button"
            className={`${styles.planCard} ${tier === "boost" ? styles.planCardActive : ""}`}
            onClick={() => setTier("boost")}
          >
            {/* Header strip */}
            <div className={styles.planHeader}>
              <div className={`${styles.planIcon} ${styles.planIconBoost}`}>
                <IcoRocket />
              </div>
              <p className={styles.planName}>Boost</p>
              <div className={styles.planPriceWrap}>
                <span className={styles.planPriceAmount}>113.000đ</span>
                <span className={styles.planPricePeriod}>/ tháng</span>
              </div>
              {tier === "boost" ? (
                <span className={styles.planActiveCheck}><IcoCheckLg /></span>
              ) : (
                <span className={styles.planBadge}>Phổ biến</span>
              )}
            </div>
            <ul className={styles.list}>
              <li><span className={styles.listCheck}><IcoCheck /></span>Upload tối đa 600 MB (avatar, ảnh, tệp chat)</li>
              <li><span className={styles.listCheck}><IcoCheck /></span>Chia sẻ màn hình HD chất lượng cao</li>
              <li><span className={styles.listCheck}><IcoCheck /></span>Nâng cấp 2 máy chủ</li>
              <li><span className={styles.listCheck}><IcoCheck /></span>Dùng emoji + sticker cross-server</li>
              <li><span className={styles.listCheck}><IcoCheck /></span>Mở khóa giao diện tùy chỉnh</li>
            </ul>
          </button>

          {/* Basic */}
          <button
            type="button"
            className={`${styles.planCard} ${tier === "basic" ? styles.planCardActiveBasic : ""}`}
            onClick={() => setTier("basic")}
          >
            <div className={styles.planHeaderBasic}>
              <div className={`${styles.planIcon} ${styles.planIconBasic}`}>
                <IcoStar />
              </div>
              <p className={styles.planName}>Boost cơ bản</p>
              <div className={styles.planPriceWrap}>
                <span className={styles.planPriceAmount}>42.000đ</span>
                <span className={styles.planPricePeriod}>/ tháng</span>
              </div>
              {tier === "basic" && (
                <span className={styles.planActiveCheck}><IcoCheckLg /></span>
              )}
            </div>
            <ul className={styles.list}>
              <li><span className={styles.listCheck}><IcoCheck /></span>Upload tối đa 300 MB</li>
              <li><span className={styles.listCheck}><IcoCheck /></span>Dùng emoji cross-server</li>
              <li><span className={styles.listCheck}><IcoCheck /></span>Mở khóa giao diện tùy chỉnh</li>
            </ul>
          </button>
        </div>

        {/* Gift recipient selector */}
        {mode === "gift" ? (
          <div className={styles.giftRow}>
            <p className={styles.giftLabel}>Chọn người nhận</p>
            <input
              className={styles.input}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("boost.searchPlaceholder")}
            />
            <p className={styles.hint}>
              Chọn người nhận từ danh sách bạn đã nhắn tin / có sẵn.
            </p>
            <ul className={styles.userList}>
              {filteredUsers.map((u) => {
                const id = String(u?.userId ?? u?._id ?? "");
                const active = id && id === recipientUserId;
                const display = u?.displayName || u?.username || "User";
                const sub = u?.username ? `@${u.username}` : id;
                return (
                  <li key={id || sub}>
                    <button
                      type="button"
                      className={`${styles.userItem} ${active ? styles.userItemActive : ""}`}
                      onClick={() => setRecipientUserId(id || null)}
                    >
                      <span className={styles.userMeta}>
                        <span className={styles.userName}>{display}</span>
                        <span className={styles.userSub}>{sub}</span>
                      </span>
                      {active && (
                        <span className={styles.userCheckIcon}><IcoCheck /></span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {/* Footer actions */}
        <div className={styles.footer}>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={() => router.push("/boost")}
          >
            Quay lại
          </button>
          <button
            type="button"
            className={styles.btnPrimary}
            disabled={!canContinue}
            onClick={() => {
              const qs = new URLSearchParams();
              qs.set("mode", mode);
              qs.set("tier", tier);
              if (recipientUserId) qs.set("recipientUserId", recipientUserId);
              router.push(`/boost/billing?${qs.toString()}`);
            }}
          >
            Tiếp tục
            <IcoArrow />
          </button>
        </div>
      </div>
    </div>
  );
}
