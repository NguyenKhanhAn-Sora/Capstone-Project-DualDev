"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getApiBaseUrl } from "@/lib/api";
import styles from "./report-problem.module.css";

type AdminPayload = {
  roles?: string[];
  exp?: number;
};

type ReportProblemItem = {
  id: string;
  reporterId: string;
  reporterDisplayName: string | null;
  reporterUsername: string | null;
  reporterEmail: string | null;
  description: string;
  attachments: Array<{
    url: string;
    secureUrl: string;
    resourceType: string;
    bytes: number;
    width?: number;
    height?: number;
    duration?: number;
    format?: string;
  }>;
  status: "open" | "in_progress" | "resolved";
  adminNote: string | null;
  handledBy: string | null;
  handledByDisplayName: string | null;
  handledByUsername: string | null;
  handledByEmail: string | null;
  handledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type ReportProblemResponse = {
  items: ReportProblemItem[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
};

const decodeJwt = (token: string): AdminPayload | null => {
  try {
    const payload = token.split(".")[1];
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return json as AdminPayload;
  } catch {
    return null;
  }
};

const formatDateTime = (value?: string | null) => {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return new Intl.DateTimeFormat("vi-VN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
};

const formatFileSize = (bytes?: number) => {
  if (typeof bytes !== "number" || bytes <= 0) return "--";
  const mb = bytes / 1024 / 1024;
  if (mb < 1) {
    return `${(bytes / 1024).toFixed(0)} KB`;
  }
  return `${mb.toFixed(1)} MB`;
};

const getStatusLabel = (status: ReportProblemItem["status"]) => {
  if (status === "in_progress") return "In progress";
  if (status === "resolved") return "Resolved";
  return "Open";
};

export default function ReportProblemAdminPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<ReportProblemItem[]>([]);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "in_progress" | "resolved">("all");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>({});
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [mediaOverlay, setMediaOverlay] = useState<{
    src: string;
    type: "image" | "video";
  } | null>(null);

  const refresh = useCallback(async () => {
    if (typeof window === "undefined") return;
    const token = localStorage.getItem("adminAccessToken") || "";
    if (!token) return;

    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams();
      query.set("limit", "50");
      if (statusFilter !== "all") query.set("status", statusFilter);
      if (searchQuery.trim()) query.set("q", searchQuery.trim());

      const response = await fetch(`${getApiBaseUrl()}/admin/report-problems?${query.toString()}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to load report problems");
      }

      const payload = (await response.json()) as ReportProblemResponse;
      setItems(payload.items ?? []);
      setTotal(payload.pagination?.total ?? 0);
      setDraftNotes((prev) => {
        const next = { ...prev };
        (payload.items ?? []).forEach((item) => {
          if (typeof next[item.id] === "undefined") {
            next[item.id] = item.adminNote ?? "";
          }
        });
        return next;
      });
    } catch (_err) {
      setItems([]);
      setTotal(0);
      setError("Cannot load report problems right now.");
    } finally {
      setLoading(false);
    }
  }, [searchQuery, statusFilter]);

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
    if (!ready) return;
    refresh();
  }, [ready, refresh]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearchQuery(searchInput);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (mediaOverlay) {
        setMediaOverlay(null);
        return;
      }
      if (activeNoteId) {
        setActiveNoteId(null);
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [activeNoteId, mediaOverlay]);

  const visibleItems = useMemo(() => items, [items]);

  const activeNoteItem = useMemo(
    () => (activeNoteId ? items.find((item) => item.id === activeNoteId) ?? null : null),
    [activeNoteId, items],
  );

  const updateStatus = async (
    item: ReportProblemItem,
    status: "open" | "in_progress" | "resolved",
    onDone?: () => void,
  ) => {
    if (typeof window === "undefined") return;
    const token = localStorage.getItem("adminAccessToken") || "";
    if (!token) {
      router.replace("/login");
      return;
    }

    setUpdatingId(item.id);
    setError(null);

    try {
      const response = await fetch(`${getApiBaseUrl()}/admin/report-problems/${item.id}/status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          status,
          adminNote: draftNotes[item.id] ?? "",
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to update status");
      }

      setItems((prev) =>
        prev.map((current) =>
          current.id === item.id
            ? {
                ...current,
                status,
                adminNote: (draftNotes[item.id] ?? "").trim() || null,
                handledAt: new Date().toISOString(),
              }
            : current,
        ),
      );
      setToast(`Updated report to ${getStatusLabel(status).toLowerCase()}.`);
      onDone?.();
    } catch (_err) {
      setError("Cannot update report status right now.");
    } finally {
      setUpdatingId(null);
    }
  };

  if (!ready) return null;

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.topbar}>
          <div className={styles.titleGroup}>
            <span className={styles.eyebrow}>Support</span>
            <h1 className={styles.title}>Report Problem</h1>
            <p className={styles.subtitle}>
              Review user-reported system issues, track progress, and mark fixes when completed.
            </p>
          </div>
          <div className={styles.topActions}>
            <Link href="/dashboard" className={styles.ghostButton}>
              Back to dashboard
            </Link>
            <button type="button" className={styles.primaryButton} onClick={() => refresh()} disabled={loading}>
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </header>

        <section className={styles.toolbar}>
          <div className={styles.filterGroup}>
            <button
              type="button"
              className={`${styles.filterChip} ${statusFilter === "all" ? styles.filterChipActive : ""}`}
              onClick={() => setStatusFilter("all")}
            >
              All
            </button>
            <button
              type="button"
              className={`${styles.filterChip} ${statusFilter === "open" ? styles.filterChipActive : ""}`}
              onClick={() => setStatusFilter("open")}
            >
              Open
            </button>
            <button
              type="button"
              className={`${styles.filterChip} ${statusFilter === "in_progress" ? styles.filterChipActive : ""}`}
              onClick={() => setStatusFilter("in_progress")}
            >
              In progress
            </button>
            <button
              type="button"
              className={`${styles.filterChip} ${statusFilter === "resolved" ? styles.filterChipActive : ""}`}
              onClick={() => setStatusFilter("resolved")}
            >
              Resolved
            </button>
          </div>

          <div className={styles.searchWrap}>
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search by description, username, email, or Problem ID"
              className={styles.searchInput}
            />
            <span className={styles.total}>Total: {total.toLocaleString()}</span>
          </div>
        </section>

        {error ? <p className={styles.error}>{error}</p> : null}

        <section className={styles.list}>
          {loading && visibleItems.length === 0 ? (
            <p className={styles.emptyState}>Loading reports...</p>
          ) : visibleItems.length === 0 ? (
            <p className={styles.emptyState}>No problem reports found for the current filter.</p>
          ) : (
            visibleItems.map((item) => {
              const isUpdating = updatingId === item.id;
              const noteValue = draftNotes[item.id] ?? item.adminNote ?? "";
              const reporterLabel =
                item.reporterUsername
                  ? `@${item.reporterUsername}`
                  : item.reporterDisplayName || item.reporterEmail || item.reporterId;

              return (
                <article key={item.id} className={styles.card}>
                  <div className={styles.cardHeader}>
                    <div className={styles.metaWrap}>
                      <span className={styles.reporter}>{reporterLabel}</span>
                      <div className={styles.metaLine}>
                        <span className={styles.metaPill}>Problem ID: {item.id}</span>
                        <span className={styles.metaPill}>Created: {formatDateTime(item.createdAt)}</span>
                      </div>
                    </div>
                    <span
                      className={`${styles.statusPill} ${
                        item.status === "resolved"
                          ? styles.statusResolved
                          : item.status === "in_progress"
                            ? styles.statusInProgress
                            : styles.statusOpen
                      }`}
                    >
                      {getStatusLabel(item.status)}
                    </span>
                  </div>

                  <p className={styles.description}>{item.description}</p>

                  {item.attachments.length ? (
                    <div className={styles.attachmentGrid}>
                      {item.attachments.map((attachment) => {
                        const src = attachment.secureUrl || attachment.url;
                        const isVideo = attachment.resourceType === "video";
                        const key = `${item.id}:${src}`;

                        return (
                          <button
                            key={key}
                            type="button"
                            className={styles.attachmentItem}
                            onClick={() =>
                              setMediaOverlay({
                                src,
                                type: isVideo ? "video" : "image",
                              })
                            }
                          >
                            {isVideo ? (
                              <video
                                src={src}
                                className={styles.attachmentPreview}
                                muted
                                playsInline
                                preload="metadata"
                              />
                            ) : (
                              <img src={src} alt="Report attachment" className={styles.attachmentPreview} />
                            )}
                            <span className={styles.attachmentMeta}>{formatFileSize(attachment.bytes)}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className={styles.noAttachment}>No attachments</p>
                  )}

                  <div className={styles.actions}>
                    <div className={styles.handledInfoWrap}>
                      <span className={styles.handledInfoPill}>
                        Handled at: {formatDateTime(item.handledAt || item.updatedAt)}
                      </span>
                      <span className={styles.handledInfoPill}>
                        Handler: {item.handledByUsername
                          ? `@${item.handledByUsername}`
                          : item.handledByDisplayName || item.handledByEmail || "admin"}
                      </span>
                    </div>
                    <div className={styles.buttonGroup}>
                      <button
                        type="button"
                        className={`${styles.noteIconButton} ${item.adminNote ? styles.noteIconButtonActive : ""}`}
                        onClick={() => setActiveNoteId(item.id)}
                        title="Open admin note"
                        aria-label="Open admin note"
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path
                            d="M7 4h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                          />
                          <path
                            d="M9 9h6M9 13h6M9 17h4"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                          />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        disabled={isUpdating || item.status === "open"}
                        onClick={() => updateStatus(item, "open")}
                      >
                        Reopen
                      </button>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        disabled={isUpdating || item.status === "in_progress"}
                        onClick={() => updateStatus(item, "in_progress")}
                      >
                        Mark in progress
                      </button>
                      <button
                        type="button"
                        className={styles.primaryAction}
                        disabled={isUpdating || item.status === "resolved"}
                        onClick={() => updateStatus(item, "resolved")}
                      >
                        {isUpdating ? "Updating..." : "Mark resolved"}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </section>
      </div>

      {activeNoteItem ? (
        <div
          className={styles.overlay}
          role="dialog"
          aria-modal="true"
          aria-label="Admin note dialog"
          onClick={() => setActiveNoteId(null)}
        >
          <div className={styles.modal} onClick={(event) => event.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Admin Note</h2>
              <button
                type="button"
                className={styles.modalClose}
                onClick={() => setActiveNoteId(null)}
                aria-label="Close note dialog"
              >
                ×
              </button>
            </div>
            <p className={styles.modalMeta}>Problem ID: {activeNoteItem.id}</p>
            <textarea
              className={styles.noteInput}
              rows={7}
              placeholder="Write update, root cause, or fix plan..."
              value={draftNotes[activeNoteItem.id] ?? activeNoteItem.adminNote ?? ""}
              onChange={(event) =>
                setDraftNotes((prev) => ({
                  ...prev,
                  [activeNoteItem.id]: event.target.value,
                }))
              }
              maxLength={1200}
            />
            <div className={styles.modalActions}>
              <button type="button" className={styles.secondaryButton} onClick={() => setActiveNoteId(null)}>
                Close
              </button>
              <button
                type="button"
                className={styles.primaryAction}
                disabled={updatingId === activeNoteItem.id}
                onClick={() =>
                  updateStatus(activeNoteItem, activeNoteItem.status, () => {
                    setActiveNoteId(null);
                    setToast("Admin note saved.");
                  })
                }
              >
                {updatingId === activeNoteItem.id ? "Saving..." : "Save note"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {mediaOverlay ? (
        <div
          className={styles.overlay}
          role="dialog"
          aria-modal="true"
          aria-label="Media preview"
          onClick={() => setMediaOverlay(null)}
        >
          <div className={styles.mediaModal} onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className={styles.modalClose}
              onClick={() => setMediaOverlay(null)}
              aria-label="Close media preview"
            >
              ×
            </button>
            {mediaOverlay.type === "video" ? (
              <video src={mediaOverlay.src} className={styles.mediaViewer} controls autoPlay />
            ) : (
              <img src={mediaOverlay.src} alt="Report attachment preview" className={styles.mediaViewer} />
            )}
          </div>
        </div>
      ) : null}

      {toast ? <div className={styles.toast}>{toast}</div> : null}
    </div>
  );
}
