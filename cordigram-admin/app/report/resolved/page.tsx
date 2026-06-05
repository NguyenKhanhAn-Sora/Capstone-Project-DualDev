"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "./resolved.module.css";
import { getApiBaseUrl } from "@/lib/api";

type AdminPayload = { roles?: string[]; exp?: number };

type ResolvedItem = {
  actionId: string;
  type: "post" | "comment" | "user";
  targetId: string;
  targetLabel: string;
  action: string;
  category: string;
  reason: string;
  severity: "low" | "medium" | "high" | null;
  note: string | null;
  expiresAt: string | null;
  resolvedAt: string | null;
  moderatorDisplayName: string | null;
  moderatorUsername: string | null;
  moderatorEmail: string | null;
  penaltyActive: boolean;
  rollbackSupported: boolean;
};

const decodeJwt = (token: string): AdminPayload | null => {
  try {
    const payload = token.split(".")[1];
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
  } catch { return null; }
};

const fmtKey = (v: string) =>
  v.replace(/[_-]+/g, " ").trim().replace(/\b\w/g, (c) => c.toUpperCase());

const fmtTime = (v?: string | null) => {
  if (!v) return "--";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "--";
  return d.toLocaleString();
};

const truncId = (id: string) => (id.length > 12 ? `${id.slice(0, 8)}…` : id);

const getModName = (item: ResolvedItem) =>
  item.moderatorDisplayName ||
  (item.moderatorUsername ? `@${item.moderatorUsername}` : item.moderatorEmail || "--");

const getModInitial = (item: ResolvedItem) =>
  getModName(item).replace("@", "").charAt(0).toUpperCase();

const getActionClass = (action: string, s: typeof styles): string => {
  if (["remove_post", "delete_comment", "suspend_user", "restrict_post"].some((k) => action.includes(k)))
    return s.actionPillRed;
  if (["warn", "mute_interaction", "limit_account"].some((k) => action.includes(k)))
    return s.actionPillOrange;
  if (action === "no_violation") return s.actionPillGreen;
  return s.actionPillDefault;
};

const getSevClass = (sev: string | null, s: typeof styles): string => {
  if (sev === "high") return s.sevHigh;
  if (sev === "medium") return s.sevMed;
  if (sev === "low") return s.sevLow;
  return s.sevNa;
};

export default function ResolvedReportsPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [items, setItems] = useState<ResolvedItem[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "post" | "comment" | "user">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "penalty_active" | "rollbackable">("all");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = localStorage.getItem("adminAccessToken") || "";
    if (!token) { router.replace("/login"); return; }
    const payload = decodeJwt(token);
    const roles = payload?.roles || [];
    const exp = payload?.exp ? payload.exp * 1000 : 0;
    if (!roles.includes("admin") || (exp && Date.now() > exp)) {
      router.replace("/login"); return;
    }
    setReady(true);
  }, [router]);

  const loadResolved = async () => {
    if (typeof window === "undefined") return;
    const token = localStorage.getItem("adminAccessToken") || "";
    if (!token) return;
    try {
      setLoading(true);
      const r = await fetch(`${getApiBaseUrl()}/admin/reports-resolved?limit=120`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error();
      const payload = (await r.json()) as { items: ResolvedItem[] };
      setItems(payload.items ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (ready) loadResolved(); }, [ready]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return items.filter((item) => {
      if (typeFilter !== "all" && item.type !== typeFilter) return false;
      if (q && !item.targetId.toLowerCase().includes(q) && !item.targetLabel.toLowerCase().includes(q)) return false;
      if (statusFilter === "penalty_active") return item.penaltyActive;
      if (statusFilter === "rollbackable") return item.rollbackSupported;
      return true;
    });
  }, [items, searchQuery, statusFilter, typeFilter]);

  const handleRollback = async (actionId: string) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("adminAccessToken") || "" : "";
    if (!token) return;
    try {
      setSubmittingId(actionId);
      const r = await fetch(`${getApiBaseUrl()}/admin/reports-resolved/${actionId}/rollback`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ note: "Rollback from resolved reports center after internal review/appeal" }),
      });
      if (!r.ok) throw new Error();
      setToast("Penalty rolled back successfully.");
      await loadResolved();
    } finally { setSubmittingId(null); }
  };

  const handleReopen = async (type: "post" | "comment" | "user", targetId: string) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("adminAccessToken") || "" : "";
    if (!token) return;
    try {
      setSubmittingId(`${type}:${targetId}`);
      const r = await fetch(`${getApiBaseUrl()}/admin/reports/${type}/${targetId}/reopen`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ note: "Reopened from resolved reports center for re-review" }),
      });
      if (!r.ok) throw new Error();
      setToast("Case reopened. Redirecting to review...");
      router.push(`/report/review/${type}/${targetId}`);
    } finally { setSubmittingId(null); }
  };

  if (!ready) return null;

  return (
    <div className={styles.page}>
      <div className={styles.shell}>

        {/* ---- Header ---- */}
        <header className={styles.topbar}>
          <div>
            <h1 className={styles.title}>Resolved Reports</h1>
            <p className={styles.subtitle}>
              Review past decisions, rollback incorrect penalties, or reopen cases.
            </p>
          </div>
          <div className={styles.headerActions}>
            <Link href="/report" className={styles.ghostBtn}>
              Back to report center
            </Link>
          </div>
        </header>

        {/* ---- Queue panel ---- */}
        <section className={styles.panel}>

          {/* Search */}
          <div className={styles.searchRow}>
            <div className={styles.searchWrap}>
              <svg className={styles.searchIcon} viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <circle cx="9" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.6" />
                <path d="M13.5 13.5L17 17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              <input
                type="text"
                className={styles.searchInput}
                placeholder="Search by target ID or @username…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {/* Filters */}
          <div className={styles.filterSection}>
            <div className={styles.filterGroup}>
              <span className={styles.filterLabel}>Type</span>
              <div className={styles.filterChips}>
                {(["all", "post", "comment", "user"] as const).map((v) => (
                  <button key={v} type="button"
                    className={`${styles.chip} ${typeFilter === v ? styles.chipActive : ""}`}
                    onClick={() => setTypeFilter(v)}>
                    {v === "all" ? "All" : v === "post" ? "Posts" : v === "comment" ? "Comments" : "Users"}
                  </button>
                ))}
              </div>
            </div>
            <div className={styles.filterGroup}>
              <span className={styles.filterLabel}>Status</span>
              <div className={styles.filterChips}>
                {(["all", "penalty_active", "rollbackable"] as const).map((v) => (
                  <button key={v} type="button"
                    className={`${styles.chip} ${statusFilter === v ? styles.chipActive : ""}`}
                    onClick={() => setStatusFilter(v)}>
                    {v === "all" ? "All" : v === "penalty_active" ? "Penalty active" : "Rollbackable"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Count */}
          <div className={styles.countRow}>
            <span className={styles.countBadge}>{filteredItems.length}</span>
            <span className={styles.countOf}>/ {items.length} cases</span>
          </div>

          {/* Table */}
          <div className={styles.tableHead}>
            <span>Content</span>
            <span>Decision</span>
            <span>Resolved by</span>
            <span className={styles.thCenter}>Status</span>
            <span className={styles.thEnd}>Actions</span>
          </div>

          <div className={styles.tableBody}>
            {loading ? (
              <div className={styles.emptyState}>
                <div className={styles.loader} />
                <p>Loading resolved reports…</p>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className={styles.emptyState}>
                <p>No resolved reports match the current filters.</p>
              </div>
            ) : (
              filteredItems.map((item, i) => {
                const key = item.actionId;
                const busy =
                  submittingId === item.actionId ||
                  submittingId === `${item.type}:${item.targetId}`;
                const modName = getModName(item);

                return (
                  <div className={styles.tableRow} key={key} style={{ animationDelay: `${i * 40}ms` }}>

                    {/* Content */}
                    <div className={styles.contentCell}>
                      <span className={`${styles.typeTag}
                        ${item.type === "user" ? styles.typeTagUser : item.type === "comment" ? styles.typeTagComment : ""}`}>
                        {item.type}
                      </span>
                      <div className={styles.targetInfo}>
                        <p className={styles.targetLabel}>{item.targetLabel || "--"}</p>
                        <p className={styles.targetId}>{truncId(item.targetId)}</p>
                        <div className={styles.reasonRow}>
                          <span className={styles.reasonTag}>{fmtKey(item.category)}</span>
                          <span className={styles.reasonSep}>·</span>
                          <span className={styles.reasonText}>{fmtKey(item.reason)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Decision */}
                    <div className={styles.decisionCell}>
                      <span className={`${styles.actionPill} ${getActionClass(item.action, styles)}`}>
                        {fmtKey(item.action)}
                      </span>
                      {item.severity ? (
                        <span className={`${styles.sevBadge} ${getSevClass(item.severity, styles)}`}>
                          {item.severity.toUpperCase()}
                        </span>
                      ) : null}
                      {item.note?.trim() ? (
                        <p className={styles.noteSnippet} title={item.note.trim()}>
                          {item.note.trim().slice(0, 50)}{item.note.trim().length > 50 ? "…" : ""}
                        </p>
                      ) : null}
                    </div>

                    {/* Resolved by */}
                    <div className={styles.resolvedCell}>
                      <div className={styles.modRow}>
                        <div className={styles.modAvatar}>{getModInitial(item)}</div>
                        <div>
                          <p className={styles.modName}>{modName}</p>
                          <p className={styles.resolvedTime}>{fmtTime(item.resolvedAt)}</p>
                          {item.expiresAt ? (
                            <p className={styles.expiresTime}>Expires {fmtTime(item.expiresAt)}</p>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    {/* Status */}
                    <div className={styles.statusCell}>
                      {item.penaltyActive ? (
                        <span className={styles.statusActive}>Active</span>
                      ) : (
                        <span className={styles.statusInactive}>Inactive</span>
                      )}
                    </div>

                    {/* Actions */}
                    <div className={styles.actionsCell}>
                      <Link
                        href={`/report/review/${item.type}/${item.targetId}`}
                        className={styles.btnReview}
                      >
                        Review
                      </Link>
                      <button
                        type="button"
                        className={styles.btnReopen}
                        onClick={() => handleReopen(item.type, item.targetId)}
                        disabled={busy}
                      >
                        Re-open
                      </button>
                      <button
                        type="button"
                        className={styles.btnRollback}
                        onClick={() => handleRollback(item.actionId)}
                        disabled={busy || !item.rollbackSupported}
                      >
                        Rollback
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>

      {toast ? <div className={styles.toast}>{toast}</div> : null}
    </div>
  );
}
