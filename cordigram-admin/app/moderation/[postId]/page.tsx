"use client";

import { useCallback, useEffect, useState } from "react";
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
    originalUrl: string | null;
    moderationDecision: "approve" | "blur" | "reject" | "unknown";
    moderationProvider: string | null;
    moderationReasons: string[];
    moderationScores: Record<string, number>;
  }>;
};

type MediaModerationActionResponse = {
  status: "ok";
  outcome: "media_blurred" | "post_removed";
  updatedMedia?: DetailResponse["media"][number];
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
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");
  const [actionPending, setActionPending] = useState<{
    index: number;
    decision: "blur" | "reject";
  } | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    index: number;
    decision: "blur" | "reject";
  } | null>(null);

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

  const loadDetail = useCallback(async () => {
    if (!ready || !postId || typeof window === "undefined") return;
    const token = localStorage.getItem("adminAccessToken") || "";
    if (!token) return;

    try {
      setLoading(true);
      setError("");

      const res = await fetch(`${getApiBaseUrl()}/admin/moderation/media/${postId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

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
  }, [ready, postId]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const executeMediaAction = async (
    mediaIndex: number,
    decision: "blur" | "reject",
  ) => {
    if (typeof window === "undefined") return;
    const token = localStorage.getItem("adminAccessToken") || "";
    if (!token) return;

    try {
      setActionError("");
      setActionSuccess("");
      setActionPending({ index: mediaIndex, decision });

      const res = await fetch(
        `${getApiBaseUrl()}/admin/moderation/media/${postId}/items/${mediaIndex}/action`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ decision }),
        },
      );

      if (!res.ok) {
        let message = `Failed to apply moderation action (${res.status})`;
        try {
          const payload = (await res.json()) as { message?: string | string[] };
          if (Array.isArray(payload.message)) {
            message = payload.message.join(". ");
          } else if (typeof payload.message === "string") {
            message = payload.message;
          }
        } catch {
          // Keep generic message when response is not JSON.
        }
        throw new Error(message);
      }

      const payload = (await res.json()) as MediaModerationActionResponse;
      if (payload.outcome === "post_removed") {
        setActionSuccess("Post has been removed successfully.");
        router.replace("/moderation");
        return;
      }

      if (payload.updatedMedia) {
        setDetail((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            media: prev.media.map((item) =>
              item.index === payload.updatedMedia?.index
                ? {
                    ...item,
                    ...payload.updatedMedia,
                  }
                : item,
            ),
          };
        });
        setActionSuccess(`Media #${mediaIndex + 1} has been blurred successfully.`);
      } else {
        await loadDetail();
        setActionSuccess("Moderation action applied successfully.");
      }
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to apply moderation action",
      );
    } finally {
      setActionPending(null);
    }
  };

  const applyMediaAction = (mediaIndex: number, decision: "blur" | "reject") => {
    setActionError("");
    setActionSuccess("");
    setConfirmAction({ index: mediaIndex, decision });
  };

  const formatDateTime = (value?: string | null) => {
    if (!value) return "--";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "--";
    return new Intl.DateTimeFormat("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(date);
  };

  const getDecisionClass = (
    decision: "approve" | "blur" | "reject" | "unknown",
  ) => {
    if (decision === "reject") return styles.badgeReject;
    if (decision === "blur") return styles.badgeBlur;
    if (decision === "approve") return styles.badgeApprove;
    return styles.badgeUnknown;
  };

  if (!ready) return null;

  const confirmTarget = confirmAction
    ? detail?.media.find((item) => item.index === confirmAction.index)
    : null;

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.topbar}>
          <div>
            <span className={styles.eyebrow}>Moderation Detail</span>
          </div>
          <Link href="/moderation" className={styles.backButton}>
            Back to queue
          </Link>
        </header>

        {loading ? <p className={styles.note}>Loading...</p> : null}
        {error ? <p className={styles.error}>{error}</p> : null}
        {actionError ? <p className={styles.error}>{actionError}</p> : null}
        {actionSuccess ? <p className={styles.success}>{actionSuccess}</p> : null}

        {detail ? (
          <>
            <section className={styles.heroCard}>
              <div className={styles.heroTop}>
                <div>
                  <h1 className={styles.title}>Post moderation detail</h1>
                  <p className={styles.postId}>Post ID: {detail.postId}</p>
                </div>
                <div className={styles.heroBadges}>
                  <span className={styles.kindPill}>{detail.kind.toUpperCase()}</span>
                  <span className={styles.visibilityPill}>{detail.visibility}</span>
                </div>
              </div>

              <div className={styles.metaGrid}>
                <article className={styles.metaCard}>
                  <span className={styles.metaLabel}>Author</span>
                  <span className={styles.metaValue}>
                    {detail.author.displayName || "Unknown"}
                  </span>
                  <span className={styles.metaSubValue}>
                    {detail.author.username ? `@${detail.author.username}` : "--"}
                  </span>
                </article>

                <article className={styles.metaCard}>
                  <span className={styles.metaLabel}>Created at</span>
                  <span className={styles.metaValue}>
                    {formatDateTime(detail.createdAt)}
                  </span>
                  <span className={styles.metaSubValue}>Local time</span>
                </article>

                <article className={styles.metaCard}>
                  <span className={styles.metaLabel}>Media count</span>
                  <span className={styles.metaValue}>{detail.media.length}</span>
                  <span className={styles.metaSubValue}>Attached media items</span>
                </article>
              </div>
            </section>

            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Media moderation detail</h2>
              <div className={styles.mediaGrid}>
                {detail.media.map((item) => (
                  <article className={styles.mediaCard} key={item.index}>
                    <div className={styles.mediaFrame}>
                      {item.type === "video" ? (
                        <video
                          className={styles.mediaPreview}
                          controls
                          preload="metadata"
                          src={item.originalUrl || item.url}
                        />
                      ) : (
                        // Show origin image directly in admin detail view.
                        <img
                          className={styles.mediaPreview}
                          src={item.originalUrl || item.url}
                          alt={`Post media ${item.index + 1}`}
                          loading="lazy"
                        />
                      )}
                    </div>

                    <div className={styles.mediaInfo}>
                      <div className={styles.mediaInfoTop}>
                        <p className={styles.mediaTitle}>
                          Media #{item.index + 1} · {item.type.toUpperCase()}
                        </p>
                        <span
                          className={`${styles.badge} ${getDecisionClass(item.moderationDecision)}`}
                        >
                          {item.moderationDecision.toUpperCase()}
                        </span>
                      </div>

                      <div className={styles.mediaMetaGrid}>
                        <div>
                          <p className={styles.metaKey}>Provider</p>
                          <p className={styles.metaText}>{item.moderationProvider || "--"}</p>
                        </div>
                        <div>
                          <p className={styles.metaKey}>Reason</p>
                          <p className={styles.metaText}>
                            {item.moderationReasons.length
                              ? item.moderationReasons.join(" · ")
                              : "--"}
                          </p>
                        </div>
                      </div>

                      <div>
                        <p className={styles.metaKey}>Scores</p>
                        <p className={styles.scoreText}>
                          {Object.keys(item.moderationScores).length
                            ? Object.entries(item.moderationScores)
                                .map(([k, v]) => `${k}: ${v.toFixed(2)}`)
                                .join(" · ")
                            : "--"}
                        </p>
                      </div>

                      <div className={styles.actionRow}>
                        <button
                          type="button"
                          className={`${styles.actionButton} ${styles.actionBlur} ${
                            item.moderationDecision === "blur" ? styles.actionDisabled : ""
                          }`}
                          disabled={
                            item.moderationDecision === "blur" ||
                            actionPending?.index === item.index
                          }
                          onClick={() => applyMediaAction(item.index, "blur")}
                        >
                          {actionPending?.index === item.index &&
                          actionPending?.decision === "blur"
                            ? "Blurring..."
                            : "Blur"}
                        </button>

                        <button
                          type="button"
                          className={`${styles.actionButton} ${styles.actionReject} ${
                            item.moderationDecision === "reject"
                              ? styles.actionDisabled
                              : ""
                          }`}
                          disabled={
                            item.moderationDecision === "reject" ||
                            actionPending?.index === item.index
                          }
                          onClick={() => applyMediaAction(item.index, "reject")}
                        >
                          {actionPending?.index === item.index &&
                          actionPending?.decision === "reject"
                            ? "Rejecting..."
                            : "Reject post"}
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </>
        ) : null}
      </div>

      {confirmAction ? (
        <div className={styles.overlay}>
          <div className={styles.confirmModal}>
            <h3 className={styles.confirmTitle}>Confirm moderation action</h3>
            <p className={styles.confirmText}>
              {confirmAction.decision === "reject"
                ? "Reject will remove the entire post, notify the author in realtime, and apply strike."
                : "Blur will update this media to blurred state on social feed and detail views."}
            </p>

            <div className={styles.confirmActions}>
              <button
                type="button"
                className={styles.confirmCancel}
                onClick={() => setConfirmAction(null)}
                disabled={Boolean(actionPending)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`${styles.confirmSubmit} ${
                  confirmAction.decision === "reject"
                    ? styles.confirmSubmitDanger
                    : styles.confirmSubmitWarn
                }`}
                disabled={Boolean(actionPending)}
                onClick={async () => {
                  const target = confirmAction;
                  setConfirmAction(null);
                  await executeMediaAction(target.index, target.decision);
                }}
              >
                Confirm {confirmAction.decision === "reject" ? "Reject" : "Blur"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
