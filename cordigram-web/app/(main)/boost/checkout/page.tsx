"use client";

import { useMemo, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import styles from "./checkout.module.css";
import { getAvailableUsers } from "@/lib/api";

type Tier = "basic" | "boost";
type Mode = "subscribe" | "gift";

export default function BoostCheckoutPage() {
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
            ×
          </button>
        </div>

        <div className={styles.grid}>
          <button
            type="button"
            className={`${styles.planCard} ${tier === "boost" ? styles.planCardActive : ""}`}
            onClick={() => setTier("boost")}
          >
            <p className={styles.planName}>Boost</p>
            <p className={styles.planPrice}>113.000đ / tháng</p>
            <ul className={styles.list}>
              <li>Upload tối đa 600MB (avatar, ảnh, tệp chat)</li>
              <li>Chia sẻ màn hình HD</li>
              <li>Nâng cấp 2 máy chủ</li>
              <li>Dùng emoji + sticker cross-server</li>
            </ul>
          </button>

          <button
            type="button"
            className={`${styles.planCard} ${tier === "basic" ? styles.planCardActive : ""}`}
            onClick={() => setTier("basic")}
          >
            <p className={styles.planName}>Boost cơ bản</p>
            <p className={styles.planPrice}>42.000đ / tháng</p>
            <ul className={styles.list}>
              <li>Upload tối đa 300MB</li>
              <li>Dùng emoji cross-server</li>
            </ul>
          </button>
        </div>

        {mode === "gift" ? (
          <div className={styles.giftRow}>
            <input
              className={styles.input}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm người nhận theo tên..."
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
                      <span>{active ? "✓" : ""}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

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
          </button>
        </div>
      </div>
    </div>
  );
}

