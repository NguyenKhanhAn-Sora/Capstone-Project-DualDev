"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getApiBaseUrl } from "@/lib/api";
import styles from "./report-problem.module.css";

type AdminPayload = { roles?: string[]; exp?: number };

type ReportProblemItem = {
  id: string;
  reporterId: string;
  reporterDisplayName: string | null;
  reporterUsername: string | null;
  reporterAvatarUrl: string | null;
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
  pagination: { total: number; limit: number; offset: number; hasMore: boolean };
};

const decodeJwt = (token: string): AdminPayload | null => {
  try {
    const payload = token.split(".")[1];
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as AdminPayload;
  } catch { return null; }
};

const formatDateTime = (value?: string | null) => {
  if (!value) return "--";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "--";
  return new Intl.DateTimeFormat("vi-VN", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(d);
};

const formatFileSize = (bytes?: number) => {
  if (typeof bytes !== "number" || bytes <= 0) return "--";
  const mb = bytes / 1024 / 1024;
  return mb < 1 ? `${(bytes / 1024).toFixed(0)} KB` : `${mb.toFixed(1)} MB`;
};

const getStatusLabel = (status: ReportProblemItem["status"]) => {
  if (status === "in_progress") return "In progress";
  if (status === "resolved") return "Resolved";
  return "Open";
};

const getInitial = (item: ReportProblemItem) =>
  (item.reporterDisplayName || item.reporterUsername || item.reporterEmail || "?")
    .replace("@", "")
    .charAt(0)
    .toUpperCase();

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
  const [mediaOverlay, setMediaOverlay] = useState<{ src: string; type: "image" | "video" } | null>(null);

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
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Failed to load");
      const payload = (await response.json()) as ReportProblemResponse;
      setItems(payload.items ?? []);
      setTotal(payload.pagination?.total ?? 0);
      setDraftNotes((prev) => {
        const next = { ...prev };
        (payload.items ?? []).forEach((item) => {
          if (typeof next[item.id] === "undefined") next[item.id] = item.adminNote ?? "";
        });
        return next;
      });
    } catch {
      setItems([]);
      setTotal(0);
      setError("Cannot load report problems right now.");
    } finally { setLoading(false); }
  }, [searchQuery, statusFilter]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = localStorage.getItem("adminAccessToken") || "";
    if (!token) { router.replace("/login"); return; }
    const payload = decodeJwt(token);
    const roles = payload?.roles || [];
    const exp = payload?.exp ? payload.exp * 1000 : 0;
    if (!roles.includes("admin") || (exp && Date.now() > exp)) { router.replace("/login"); return; }
    setReady(true);
  }, [router]);

  useEffect(() => { if (ready) refresh(); }, [ready, refresh]);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearchQuery(searchInput), 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (mediaOverlay) { setMediaOverlay(null); return; }
      if (activeNoteId) setActiveNoteId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeNoteId, mediaOverlay]);

  const visibleItems = useMemo(() => items, [items]);
  const activeNoteItem = useMemo(
    () => (activeNoteId ? items.find((i) => i.id === activeNoteId) ?? null : null),
    [activeNoteId, items],
  );

  const updateStatus = async (
    item: ReportProblemItem,
    status: "open" | "in_progress" | "resolved",
    onDone?: () => void,
  ) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("adminAccessToken") || "" : "";
    if (!token) { router.replace("/login"); return; }
    setUpdatingId(item.id);
    setError(null);
    try {
      const response = await fetch(`${getApiBaseUrl()}/admin/report-problems/${item.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status, adminNote: draftNotes[item.id] ?? "" }),
      });
      if (!response.ok) throw new Error("Failed to update status");
      setItems((prev) =>
        prev.map((cur) => cur.id === item.id
          ? { ...cur, status, adminNote: (draftNotes[item.id] ?? "").trim() || null, handledAt: new Date().toISOString() }
          : cur),
      );
      setToast(`Updated to ${getStatusLabel(status).toLowerCase()}.`);
      onDone?.();
    } catch {
      setError("Cannot update report status right now.");
    } finally { setUpdatingId(null); }
  };

  if (!ready) return null;

  const STATUS_FILTERS = [
    { value: "all",         label: "All" },
    { value: "open",        label: "Open" },
    { value: "in_progress", label: "In progress" },
    { value: "resolved",    label: "Resolved" },
  ] as const;

  return (
    <div className={styles.page}>
      <div className={styles.shell}>

        {/* ---- Header ---- */}
        <header className={styles.topbar}>
          <div>
            <h1 className={styles.title}>Report Problem</h1>
            <p className={styles.subtitle}>
              Review user-reported issues, track progress, and mark fixes when resolved.
            </p>
          </div>
          <div className={styles.topActions}>
            <Link href="/dashboard" className={styles.ghostBtn}>Back to dashboard</Link>
            <button type="button" className={styles.refreshBtn} onClick={() => refresh()} disabled={loading}>
              <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M17 10A7 7 0 1 1 10 3M17 3v4h-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {loading ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </header>

        {/* ---- Toolbar ---- */}
        <section className={styles.toolbar}>
          {/* Status filters */}
          <div className={styles.filterGroup}>
            <span className={styles.filterLabel}>Status</span>
            <div className={styles.chips}>
              {STATUS_FILTERS.map(({ value, label }) => (
                <button key={value} type="button"
                  className={`${styles.chip} ${statusFilter === value ? styles.chipActive : ""} ${
                    value === "open" && statusFilter === value ? styles.chipOpen :
                    value === "in_progress" && statusFilter === value ? styles.chipProgress :
                    value === "resolved" && statusFilter === value ? styles.chipResolved : ""
                  }`}
                  onClick={() => setStatusFilter(value)}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Search + count */}
          <div className={styles.searchWrap}>
            <svg className={styles.searchIcon} viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <circle cx="9" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.6" />
              <path d="M13.5 13.5L17 17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by description, @username or email…"
              className={styles.searchInput}
            />
            <span className={styles.totalBadge}>{total.toLocaleString()}</span>
          </div>
        </section>

        {error ? (
          <div className={styles.errorBanner}>
            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={styles.errorIcon}>
              <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.6" />
              <path d="M10 6v4M10 14h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            {error}
          </div>
        ) : null}

        {/* ---- Report cards ---- */}
        <section className={styles.list}>
          {loading && visibleItems.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.loader} />
              <p>Loading reports…</p>
            </div>
          ) : visibleItems.length === 0 ? (
            <div className={styles.emptyState}>
              <p>No problem reports found for the current filter.</p>
            </div>
          ) : (
            visibleItems.map((item, idx) => {
              const isUpdating = updatingId === item.id;
              const reporterLabel = item.reporterUsername
                ? `@${item.reporterUsername}`
                : item.reporterDisplayName || item.reporterEmail || item.reporterId;

              return (
                <article key={item.id} className={styles.card} style={{ animationDelay: `${idx * 40}ms` }}>

                  {/* Card header */}
                  <div className={styles.cardHeader}>
                    <div className={styles.reporterRow}>
                      <div className={styles.reporterAvatar}>
                        {item.reporterAvatarUrl ? (
                          <Image
                            src={item.reporterAvatarUrl}
                            alt={item.reporterDisplayName || item.reporterUsername || ""}
                            width={36}
                            height={36}
                            className={styles.reporterAvatarImg}
                            unoptimized
                          />
                        ) : (
                          getInitial(item)
                        )}
                      </div>
                      <div className={styles.reporterInfo}>
                        <span className={styles.reporterName}>{reporterLabel}</span>
                        <div className={styles.metaPills}>
                          <span className={styles.metaPill}>
                            <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className={styles.metaIcon}>
                              <rect x="2" y="3" width="12" height="10" rx="2" stroke="currentColor" strokeWidth="1.4" />
                              <path d="M2 7h12" stroke="currentColor" strokeWidth="1.4" />
                            </svg>
                            {formatDateTime(item.createdAt)}
                          </span>
                          <span className={styles.metaPill} title={item.id}>
                            ID: {item.id.slice(0, 8)}…
                          </span>
                          {item.attachments.length > 0 && (
                            <span className={styles.metaPill}>
                              {item.attachments.length} attachment{item.attachments.length > 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <span className={`${styles.statusPill} ${
                      item.status === "resolved" ? styles.statusResolved :
                      item.status === "in_progress" ? styles.statusProgress :
                      styles.statusOpen
                    }`}>
                      <span className={styles.statusDot} />
                      {getStatusLabel(item.status)}
                    </span>
                  </div>

                  {/* Description */}
                  <div className={styles.descriptionWrap}>
                    <p className={styles.description}>{item.description}</p>
                  </div>

                  {/* Attachments */}
                  {item.attachments.length > 0 ? (
                    <div className={styles.attachmentGrid}>
                      {item.attachments.map((att) => {
                        const src = att.secureUrl || att.url;
                        const isVideo = att.resourceType === "video";
                        return (
                          <button
                            key={`${item.id}:${src}`}
                            type="button"
                            className={styles.attachmentItem}
                            onClick={() => setMediaOverlay({ src, type: isVideo ? "video" : "image" })}
                          >
                            {isVideo ? (
                              <video src={src} className={styles.attachmentPreview} muted playsInline preload="metadata" />
                            ) : (
                              <img src={src} alt="Attachment" className={styles.attachmentPreview} />
                            )}
                            <div className={styles.attachmentMeta}>
                              <span>{isVideo ? "Video" : "Image"}</span>
                              <span>{formatFileSize(att.bytes)}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}

                  {/* Admin note preview */}
                  {item.adminNote ? (
                    <div className={styles.notePreview}>
                      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className={styles.notePreviewIcon}>
                        <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.3" />
                        <path d="M5 6h6M5 9h6M5 12h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                      </svg>
                      <span className={styles.notePreviewText}>{item.adminNote}</span>
                    </div>
                  ) : null}

                  {/* Footer */}
                  <div className={styles.cardFooter}>
                    <div className={styles.handledInfo}>
                      {item.handledAt || item.updatedAt ? (
                        <span className={styles.handledPill}>
                          Updated {formatDateTime(item.handledAt || item.updatedAt)}
                        </span>
                      ) : null}
                      {(item.handledByUsername || item.handledByDisplayName || item.handledByEmail) ? (
                        <span className={styles.handledPill}>
                          by {item.handledByUsername
                            ? `@${item.handledByUsername}`
                            : item.handledByDisplayName || item.handledByEmail}
                        </span>
                      ) : null}
                    </div>

                    <div className={styles.btnGroup}>
                      <button
                        type="button"
                        className={`${styles.noteBtn} ${item.adminNote ? styles.noteBtnActive : ""}`}
                        onClick={() => setActiveNoteId(item.id)}
                        title={item.adminNote ? "Edit admin note" : "Add admin note"}
                        aria-label="Open admin note"
                      >
                        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                          <path d="M5 4h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"
                            stroke="currentColor" strokeWidth="1.5" />
                          <path d="M7 8h6M7 11.5h6M7 15h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                        {item.adminNote ? "Edit note" : "Add note"}
                      </button>
                      <button type="button" className={styles.actionBtn}
                        disabled={isUpdating || item.status === "open"}
                        onClick={() => updateStatus(item, "open")}>
                        Reopen
                      </button>
                      <button type="button" className={styles.actionBtn}
                        disabled={isUpdating || item.status === "in_progress"}
                        onClick={() => updateStatus(item, "in_progress")}>
                        In progress
                      </button>
                      <button type="button" className={styles.resolveBtn}
                        disabled={isUpdating || item.status === "resolved"}
                        onClick={() => updateStatus(item, "resolved")}>
                        {isUpdating ? "Saving…" : "Mark resolved"}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </section>
      </div>

      {/* ---- Admin note modal ---- */}
      {activeNoteItem ? (
        <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Admin note"
          onClick={() => setActiveNoteId(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Admin Note</h2>
              <button type="button" className={styles.modalClose} onClick={() => setActiveNoteId(null)} aria-label="Close">
                <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path d="M5 5l10 10M15 5l-10 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <p className={styles.modalMeta}>
              Problem <span title={activeNoteItem.id}>ID: {activeNoteItem.id.slice(0, 12)}…</span>
              {" · "}
              <span className={`${styles.statusInline} ${
                activeNoteItem.status === "resolved" ? styles.statusResolved :
                activeNoteItem.status === "in_progress" ? styles.statusProgress :
                styles.statusOpen
              }`}>{getStatusLabel(activeNoteItem.status)}</span>
            </p>
            <textarea
              className={styles.noteInput}
              rows={7}
              placeholder="Write update, root cause, or fix plan…"
              value={draftNotes[activeNoteItem.id] ?? activeNoteItem.adminNote ?? ""}
              onChange={(e) => setDraftNotes((prev) => ({ ...prev, [activeNoteItem.id]: e.target.value }))}
              maxLength={1200}
            />
            <div className={styles.modalActions}>
              <button type="button" className={styles.actionBtn} onClick={() => setActiveNoteId(null)}>
                Cancel
              </button>
              <button type="button" className={styles.resolveBtn}
                disabled={updatingId === activeNoteItem.id}
                onClick={() => updateStatus(activeNoteItem, activeNoteItem.status, () => {
                  setActiveNoteId(null);
                  setToast("Admin note saved.");
                })}>
                {updatingId === activeNoteItem.id ? "Saving…" : "Save note"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ---- Media preview modal ---- */}
      {mediaOverlay ? (
        <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Media preview"
          onClick={() => setMediaOverlay(null)}>
          <div className={styles.mediaModal} onClick={(e) => e.stopPropagation()}>
            <button type="button" className={styles.modalClose} onClick={() => setMediaOverlay(null)} aria-label="Close">
              <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M5 5l10 10M15 5l-10 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
            {mediaOverlay.type === "video" ? (
              <video src={mediaOverlay.src} className={styles.mediaViewer} controls autoPlay />
            ) : (
              <img src={mediaOverlay.src} alt="Attachment preview" className={styles.mediaViewer} />
            )}
          </div>
        </div>
      ) : null}

      {/* ---- Toast ---- */}
      {toast ? <div className={styles.toast}>{toast}</div> : null}
    </div>
  );
}
