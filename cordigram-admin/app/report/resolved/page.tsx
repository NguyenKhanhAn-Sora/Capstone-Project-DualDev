"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "./resolved.module.css";
import { getApiBaseUrl } from "@/lib/api";

type AdminPayload = {
  roles?: string[];
  exp?: number;
};

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
    const json = JSON.parse(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/")),
    );
    return json as AdminPayload;
  } catch {
    return null;
  }
};

const formatAction = (value: string) =>
  value
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());

const formatReason = (value: string) => {
  const cleaned = value.replace(/[_-]+/g, " ").trim().toLowerCase();
  if (!cleaned) return "--";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
};

export default function ResolvedReportsPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submittingActionId, setSubmittingActionId] = useState<string | null>(null);
  const [items, setItems] = useState<ResolvedItem[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "post" | "comment" | "user">("all");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "penalty_active" | "rollbackable"
  >("all");

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

  const loadResolved = async () => {
    if (typeof window === "undefined") return;
    const token = localStorage.getItem("adminAccessToken") || "";
    if (!token) return;

    try {
      setLoading(true);
      const response = await fetch(`${getApiBaseUrl()}/admin/reports-resolved?limit=120`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to load resolved reports");
      }

      const payload = (await response.json()) as { items: ResolvedItem[] };
      setItems(payload.items ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!ready) return;
    loadResolved();
  }, [ready]);

  const filteredItems = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    return items.filter((item) => {
      const typeMatched = typeFilter === "all" || item.type === typeFilter;
      if (!typeMatched) return false;

      const searchMatched =
        !normalizedQuery ||
        item.targetId.toLowerCase().includes(normalizedQuery) ||
        item.targetLabel.toLowerCase().includes(normalizedQuery);
      if (!searchMatched) return false;

      if (statusFilter === "all") return true;
      if (statusFilter === "penalty_active") return item.penaltyActive;
      if (statusFilter === "rollbackable") return item.rollbackSupported;
      return true;
    });
  }, [items, searchQuery, statusFilter, typeFilter]);

  const formatTime = (value?: string | null) => {
    if (!value) return "--";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "--";
    return date.toLocaleString();
  };

  const handleRollback = async (actionId: string) => {
    if (typeof window === "undefined") return;
    const token = localStorage.getItem("adminAccessToken") || "";
    if (!token) return;

    try {
      setSubmittingActionId(actionId);
      const response = await fetch(
        `${getApiBaseUrl()}/admin/reports-resolved/${actionId}/rollback`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            note: "Rollback from resolved reports center after internal review/appeal",
          }),
        },
      );
      if (!response.ok) {
        throw new Error("Rollback failed");
      }
      setToast("Penalty rolled back successfully.");
      await loadResolved();
    } finally {
      setSubmittingActionId(null);
    }
  };

  const handleReopen = async (type: "post" | "comment" | "user", targetId: string) => {
    if (typeof window === "undefined") return;
    const token = localStorage.getItem("adminAccessToken") || "";
    if (!token) return;

    try {
      setSubmittingActionId(`${type}:${targetId}`);
      const response = await fetch(
        `${getApiBaseUrl()}/admin/reports/${type}/${targetId}/reopen`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            note: "Reopened from resolved reports center for re-review",
          }),
        },
      );
      if (!response.ok) {
        throw new Error("Reopen failed");
      }
      setToast("Case reopened. Redirecting to review...");
      router.push(`/report/review/${type}/${targetId}`);
    } finally {
      setSubmittingActionId(null);
    }
  };

  if (!ready) return null;

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.topbar}>
          <div>
            <span className={styles.eyebrow}>Moderation</span>
            <h1 className={styles.title}>Resolved Reports</h1>
            <p className={styles.subtitle}>
              Review previous decisions, rollback incorrect penalties, or reopen cases for deeper review.
            </p>
          </div>
          <div className={styles.actions}>
            <Link href="/report" className={styles.ghostButton}>
              Back to report center
            </Link>
          </div>
        </header>

        <section className={styles.panel}>
          <div className={styles.searchRow}>
            <input
              type="text"
              className={styles.searchInput}
              placeholder="Search by target ID or @username"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </div>

          <div className={styles.filters}>
            <button
              type="button"
              className={`${styles.filterChip} ${typeFilter === "all" ? styles.filterChipActive : ""}`}
              onClick={() => setTypeFilter("all")}
            >
              All types
            </button>
            <button
              type="button"
              className={`${styles.filterChip} ${typeFilter === "post" ? styles.filterChipActive : ""}`}
              onClick={() => setTypeFilter("post")}
            >
              Posts
            </button>
            <button
              type="button"
              className={`${styles.filterChip} ${typeFilter === "comment" ? styles.filterChipActive : ""}`}
              onClick={() => setTypeFilter("comment")}
            >
              Comments
            </button>
            <button
              type="button"
              className={`${styles.filterChip} ${typeFilter === "user" ? styles.filterChipActive : ""}`}
              onClick={() => setTypeFilter("user")}
            >
              Users
            </button>
            <button
              type="button"
              className={`${styles.filterChip} ${statusFilter === "all" ? styles.filterChipActive : ""}`}
              onClick={() => setStatusFilter("all")}
            >
              All status
            </button>
            <button
              type="button"
              className={`${styles.filterChip} ${statusFilter === "penalty_active" ? styles.filterChipActive : ""}`}
              onClick={() => setStatusFilter("penalty_active")}
            >
              Penalty active
            </button>
            <button
              type="button"
              className={`${styles.filterChip} ${statusFilter === "rollbackable" ? styles.filterChipActive : ""}`}
              onClick={() => setStatusFilter("rollbackable")}
            >
              Rollbackable
            </button>
          </div>

          <div className={styles.summary}>Showing {filteredItems.length} / {items.length} cases</div>

          <div className={styles.tableHeader}>
            <span>Type</span>
            <span>Target</span>
            <span>Decision</span>
            <span className={styles.centerHeader}>Moderator</span>
            <span className={styles.centerHeader}>Resolved at</span>
            <span className={styles.centerHeader}>Status</span>
            <span className={styles.centerHeader}>Actions</span>
          </div>

          <div className={styles.tableBody}>
            {loading ? <div className={styles.emptyState}>Loading resolved reports...</div> : null}
            {!loading && filteredItems.length === 0 ? (
              <div className={styles.emptyState}>No resolved reports match the current filters.</div>
            ) : null}
            {!loading
              ? filteredItems.map((item) => {
                  const rowKey = `${item.actionId}`;
                  const rowBusy =
                    submittingActionId === item.actionId ||
                    submittingActionId === `${item.type}:${item.targetId}`;

                  return (
                    <div className={styles.tableRow} key={rowKey}>
                      <div className={styles.typeCell}>
                        <span
                          className={`${styles.typeBadge} ${
                            item.type === "post"
                              ? styles.typeBadgePost
                              : item.type === "comment"
                                ? styles.typeBadgeComment
                                : styles.typeBadgeUser
                          }`}
                        >
                          {item.type.toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className={styles.targetTitle}>{item.targetLabel || "--"}</p>
                        <p className={styles.meta}>
                          {item.targetId}
                        </p>
                        <p className={styles.meta}>
                          Category: {formatReason(item.category)} · Reason: {formatReason(item.reason)}
                        </p>
                      </div>
                      <div>
                        <span className={styles.actionPill}>{formatAction(item.action)}</span>
                        <p className={styles.meta}>
                          Severity: {item.severity ? item.severity.toUpperCase() : "N/A"}
                        </p>
                        <p className={styles.meta}>{item.note?.trim() || "No note"}</p>
                      </div>
                      <div className={styles.centerCell}>
                        <p className={styles.targetTitle}>
                          {item.moderatorDisplayName ||
                            (item.moderatorUsername
                              ? `@${item.moderatorUsername}`
                              : item.moderatorEmail || "--")}
                        </p>
                      </div>
                      <div className={styles.centerCell}>
                        <p className={styles.targetTitle}>{formatTime(item.resolvedAt)}</p>
                        <p className={styles.meta}>
                          Expires: {item.expiresAt ? formatTime(item.expiresAt) : "--"}
                        </p>
                      </div>
                      <div className={styles.centerCell}>
                        {item.penaltyActive ? (
                          <span className={styles.statusHigh}>Penalty active</span>
                        ) : (
                          <span className={styles.statusLow}>Penalty inactive</span>
                        )}
                      </div>
                      <div className={`${styles.rowActions} ${styles.rowActionsCentered}`}>
                        <Link
                          href={`/report/review/${item.type}/${item.targetId}`}
                          className={styles.inlineButton}
                        >
                          Review
                        </Link>
                        <button
                          type="button"
                          className={styles.secondaryButton}
                          onClick={() => handleReopen(item.type, item.targetId)}
                          disabled={rowBusy}
                        >
                          Re-open
                        </button>
                        <button
                          type="button"
                          className={styles.warningButton}
                          onClick={() => handleRollback(item.actionId)}
                          disabled={rowBusy || !item.rollbackSupported}
                        >
                          Rollback
                        </button>
                      </div>
                    </div>
                  );
                })
              : null}
          </div>
        </section>
      </div>
      {toast ? <div className={styles.toast}>{toast}</div> : null}
    </div>
  );
}
