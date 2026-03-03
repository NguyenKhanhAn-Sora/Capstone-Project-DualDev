"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { getApiBaseUrl } from "@/lib/api";
import styles from "./detail.module.css";

type AdminPayload = {
  roles?: string[];
  exp?: number;
};

type DetailResponse = {
  postId: string;
  content: string;
  createdAt: string | null;
  visibility: string;
  kind: "post" | "reel";
  author: {
    displayName: string | null;
    username: string | null;
    avatarUrl: string | null;
  };
  media: Array<{
    index: number;
    type: "image" | "video";
    url: string;
    moderationDecision: "approve" | "blur" | "reject" | "unknown";
    moderationProvider: string | null;
    moderationReasons: string[];
    moderationScores: Record<string, number>;
  }>;
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

export default function ModerationDetailPage() {
  const params = useParams<{ postId: string }>();
  const postId = params?.postId || "";
  const router = useRouter();

  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [error, setError] = useState("");

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
    if (!ready || !postId || typeof window === "undefined") return;
    const token = localStorage.getItem("adminAccessToken") || "";
    if (!token) return;

    const load = async () => {
      try {
        setLoading(true);
        setError("");

        const res = await fetch(
          `${getApiBaseUrl()}/admin/moderation/media/${postId}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );

        if (!res.ok) {
          throw new Error("Failed to load moderation detail");
        }

        const payload = (await res.json()) as DetailResponse;
        setDetail(payload);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load moderation detail",
        );
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [ready, postId]);

  if (!ready) return null;

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.topbar}>
          <div>
            <span className={styles.eyebrow}>Moderation Detail</span>
            <h1 className={styles.title}>Post {postId}</h1>
          </div>
          <Link href="/moderation" className={styles.backButton}>
            Back to queue
          </Link>
        </header>

        {loading ? <p className={styles.note}>Loading...</p> : null}
        {error ? <p className={styles.error}>{error}</p> : null}

        {detail ? (
          <>
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Post summary</h2>
              <p className={styles.note}>
                Author: {detail.author.displayName || "Unknown"}
                {detail.author.username ? ` (@${detail.author.username})` : ""}
              </p>
              <p className={styles.note}>
                Kind: {detail.kind.toUpperCase()} · Visibility: {detail.visibility}
              </p>
              {detail.content ? <p className={styles.content}>{detail.content}</p> : null}
            </section>

            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Media moderation</h2>
              <div className={styles.list}>
                {detail.media.map((item) => (
                  <article className={styles.row} key={item.index}>
                    <div>
                      <p className={styles.mediaTitle}>
                        Media #{item.index + 1} · {item.type}
                      </p>
                      <p className={styles.note}>
                        Decision: {item.moderationDecision.toUpperCase()} · Provider: {item.moderationProvider || "--"}
                      </p>
                      {item.moderationReasons.length ? (
                        <p className={styles.note}>Reason: {item.moderationReasons[0]}</p>
                      ) : null}
                      <p className={styles.note}>
                        Scores: {Object.keys(item.moderationScores).length
                          ? Object.entries(item.moderationScores)
                              .map(([k, v]) => `${k}=${v.toFixed(2)}`)
                              .join(" · ")
                          : "--"}
                      </p>
                    </div>
                    {item.url ? (
                      <a className={styles.openLink} href={item.url} target="_blank" rel="noreferrer">
                        Open media
                      </a>
                    ) : null}
                  </article>
                ))}
              </div>
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}
