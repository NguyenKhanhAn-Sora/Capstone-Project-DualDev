"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getApiBaseUrl } from "@/lib/api";
import styles from "./moderation.module.css";

type AdminPayload = {
  roles?: string[];
  exp?: number;
};

type QueueItem = {
  postId: string;
  authorDisplayName: string | null;
  authorUsername: string | null;
  createdAt: string | null;
  visibility: string;
  kind: "post" | "reel";
  moderationDecision: "approve" | "blur" | "reject";
  moderationProvider: string | null;
  moderatedMediaCount: number;
  previewUrl: string | null;
  reasons: string[];
};

const decodeJwt = (token: string): AdminPayload | null => {
  try {
    const payload = token.split(".")[1];
    const json = JSON.parse(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/")),
    );
    return json as AdminPayload;
  } catch {
    return null;
  }
};

export default function ModerationQueuePage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [counts, setCounts] = useState({ approve: 0, blur: 0, reject: 0 });

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

  useEffect(() => {
    if (!ready || typeof window === "undefined") return;
    const token = localStorage.getItem("adminAccessToken") || "";
    if (!token) return;

    const load = async () => {
      try {
        setLoading(true);
        const res = await fetch(`${getApiBaseUrl()}/admin/moderation/media`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!res.ok) {
          throw new Error("Failed to load moderation queue");
        }

        const payload = (await res.json()) as {
          items: QueueItem[];
          counts: { approve: number; blur: number; reject: number };
        };

        setItems(Array.isArray(payload.items) ? payload.items : []);
        setCounts(payload.counts ?? { approve: 0, blur: 0, reject: 0 });
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [ready]);

  const total = useMemo(
    () => counts.approve + counts.blur + counts.reject,
    [counts],
  );

  const formatRelativeTime = (value?: string | null) => {
    if (!value) return "--";
    const diffMs = Date.now() - new Date(value).getTime();
    if (Number.isNaN(diffMs)) return "--";
    const mins = Math.max(0, Math.floor(diffMs / 60000));
    if (mins < 60) return `${mins} mins ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} hours ago`;
    const days = Math.floor(hours / 24);
    return `${days} days ago`;
  };

  if (!ready) return null;

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.topbar}>
          <div>
            <span className={styles.eyebrow}>Auto Moderation</span>
            <h1 className={styles.title}>Media Moderation Queue</h1>
          </div>
          <Link href="/dashboard" className={styles.backButton}>
            Back to dashboard
          </Link>
        </header>

        <section className={styles.summaryGrid}>
          <article className={styles.summaryCard}>
            <span className={styles.label}>Total</span>
            <span className={styles.value}>{total}</span>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.label}>Approved</span>
            <span className={styles.value}>{counts.approve}</span>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.label}>Blurred</span>
            <span className={styles.value}>{counts.blur}</span>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.label}>Rejected</span>
            <span className={styles.value}>{counts.reject}</span>
          </article>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>Recent moderated posts</h2>
          </div>

          {loading ? <p className={styles.empty}>Loading...</p> : null}

          {!loading && items.length === 0 ? (
            <p className={styles.empty}>No moderated media found.</p>
          ) : null}

          {!loading && items.length > 0 ? (
            <div className={styles.list}>
              {items.map((item) => (
                <article className={styles.row} key={item.postId}>
                  <div className={styles.rowMain}>
                    <span
                      className={`${styles.badge} ${
                        item.moderationDecision === "reject"
                          ? styles.badgeReject
                          : item.moderationDecision === "blur"
                            ? styles.badgeBlur
                            : styles.badgeApprove
                      }`}
                    >
                      {item.moderationDecision.toUpperCase()}
                    </span>
                    <div>
                      <p className={styles.rowTitle}>
                        {item.authorDisplayName || "Unknown"}
                        {item.authorUsername ? ` (@${item.authorUsername})` : ""}
                      </p>
                      <p className={styles.rowMeta}>
                        {item.kind.toUpperCase()} · {item.visibility} · {" "}
                        {item.moderatedMediaCount} media · {" "}
                        {formatRelativeTime(item.createdAt)}
                      </p>
                      {item.reasons?.[0] ? (
                        <p className={styles.reason}>{item.reasons[0]}</p>
                      ) : null}
                    </div>
                  </div>
                  <Link
                    href={`/moderation/${item.postId}`}
                    className={styles.detailButton}
                  >
                    View details
                  </Link>
                </article>
              ))}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
