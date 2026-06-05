"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./audit.module.css";
import { getApiBaseUrl } from "@/lib/api";

type AdminPayload = { roles?: string[]; exp?: number };
const PAGE_SIZE = 20;

type SelectOption = { value: string; label: string };

type AuditLogItem = {
  actionId: string;
  actor: {
    userId: string | null;
    displayName: string | null;
    username: string | null;
    email: string | null;
  };
  action: {
    code: string;
    label: string;
    strikeDelta: number | null;
  };
  target: {
    type: "post" | "comment" | "user";
    id: string;
    ownerLabel: string;
  };
  detail: {
    category: string;
    reason: string;
    severity: "low" | "medium" | "high" | null;
    note: string | null;
    expiresAt: string | null;
  };
  invalidation: {
    invalidated: boolean;
    at: string | null;
    reason: string | null;
    by: {
      userId: string | null;
      displayName: string | null;
      username: string | null;
      email: string | null;
    } | null;
  };
  occurredAt: string | null;
};

const decodeJwt = (token: string): AdminPayload | null => {
  try {
    const payload = token.split(".")[1];
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as AdminPayload;
  } catch { return null; }
};

const fmtRelative = (value: string | null | undefined) => {
  if (!value) return "--";
  const ts = new Date(value).getTime();
  if (Number.isNaN(ts)) return "--";
  const diff = Date.now() - ts;
  const mins = Math.max(0, Math.floor(diff / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

const fmtAbsolute = (value: string | null | undefined) => {
  if (!value) return "--";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "--";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(d);
};

const humanize = (value: string | null | undefined) => {
  const raw = (value || "").trim();
  if (!raw) return "--";
  return raw.replace(/[_-]+/g, " ").trim()
    .split(" ").map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(" ");
};

const getActorLabel = (actor: AuditLogItem["actor"]) =>
  actor.displayName || (actor.username ? `@${actor.username}` : actor.email || "admin");

const getActorInitial = (actor: AuditLogItem["actor"]) =>
  getActorLabel(actor).replace("@", "").charAt(0).toUpperCase();

const getActorSub = (actor: AuditLogItem["actor"]) =>
  actor.email || actor.userId?.slice(0, 10) + "…" || "--";

const getActionVariant = (code: string): string => {
  const c = code.toLowerCase();
  if (["violation", "suspend", "restrict", "remove", "reject", "ban", "delete", "blur"].some((k) => c.includes(k))) return "red";
  if (["warn", "mute", "limit"].some((k) => c.includes(k))) return "orange";
  if (["approve", "no_violation", "rollback", "reopen"].some((k) => c.includes(k))) return "green";
  if (["creator", "verification"].some((k) => c.includes(k))) return "blue";
  return "default";
};

const getSevVariant = (sev: string | null) => {
  if (sev === "high") return "sevHigh";
  if (sev === "medium") return "sevMed";
  if (sev === "low") return "sevLow";
  return "sevNa";
};

/* Dark dropdown select */
function CustomSelect({ value, options, onChange, ariaLabel }: {
  value: string; options: SelectOption[]; onChange: (v: string) => void; ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => { if (!rootRef.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onClick); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const selected = options.find((o) => o.value === value) ?? options[0];
  return (
    <div className={`${styles.select} ${open ? styles.selectOpen : ""}`} ref={rootRef}>
      <button type="button" className={styles.selectTrigger}
        aria-haspopup="listbox" aria-expanded={open} aria-label={ariaLabel}
        onClick={() => setOpen((p) => !p)}>
        <span>{selected?.label ?? ""}</span>
        <svg className={styles.selectCaret} viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7 10l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open ? (
        <div className={styles.selectMenu} role="listbox" aria-label={ariaLabel}>
          {options.map((opt) => (
            <button key={opt.value} type="button" role="option" aria-selected={opt.value === value}
              className={`${styles.selectOption} ${opt.value === value ? styles.selectOptionActive : ""}`}
              onClick={() => { onChange(opt.value); setOpen(false); }}>
              {opt.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function AuditLogPage() {
  const router = useRouter();
  const listEndRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);
  const hasMoreRef = useRef(true);
  const offsetRef = useRef(0);

  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<AuditLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [typeFilter, setTypeFilter] = useState<"all" | "post" | "comment" | "user">("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [query, setQuery] = useState("");

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

  const loadLogs = useCallback(async (reset: boolean) => {
    if (!ready || typeof window === "undefined") return;
    const token = localStorage.getItem("adminAccessToken") || "";
    if (!token) return;
    if (!reset && (loadingRef.current || !hasMoreRef.current)) return;
    try {
      loadingRef.current = true;
      setLoading(true);
      setError(null);
      const nextOffset = reset ? 0 : offsetRef.current;
      const params = new URLSearchParams();
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(nextOffset));
      if (typeFilter !== "all") params.set("type", typeFilter);
      if (actionFilter !== "all") params.set("action", actionFilter);
      const response = await fetch(`${getApiBaseUrl()}/admin/activity/logs?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Failed to load audit logs");
      const payload = (await response.json()) as { items?: AuditLogItem[]; total?: number; hasMore?: boolean };
      const fetched = payload.items ?? [];
      setItems((prev) => {
        if (reset) return fetched;
        const seen = new Set(prev.map((i) => i.actionId));
        return [...prev, ...fetched.filter((i) => !seen.has(i.actionId))];
      });
      setTotal(typeof payload.total === "number" ? payload.total : 0);
      const nextHasMore = Boolean(payload.hasMore);
      const computedOffset = nextOffset + fetched.length;
      setHasMore(nextHasMore);
      hasMoreRef.current = nextHasMore;
      offsetRef.current = computedOffset;
    } catch {
      setError("Could not load audit logs.");
      if (reset) { setItems([]); setTotal(0); setHasMore(false); hasMoreRef.current = false; offsetRef.current = 0; }
    } finally {
      loadingRef.current = false;
      setLoading(false);
      setInitialized(true);
    }
  }, [actionFilter, ready, typeFilter]);

  useEffect(() => {
    if (!ready) return;
    setItems([]); setTotal(0); setHasMore(true); setInitialized(false);
    hasMoreRef.current = true; offsetRef.current = 0;
    void loadLogs(true);
  }, [ready, typeFilter, actionFilter, loadLogs]);

  useEffect(() => {
    if (!ready) return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries[0]?.isIntersecting) return;
      if (!hasMoreRef.current || loadingRef.current) return;
      void loadLogs(false);
    }, { rootMargin: "220px", threshold: 0 });
    const node = listEndRef.current;
    if (node) observer.observe(node);
    return () => observer.disconnect();
  }, [loadLogs, ready]);

  const visibleItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      const text = [
        item.actor.displayName, item.actor.username, item.actor.email,
        item.target.ownerLabel, item.target.id,
        item.detail.category, item.detail.reason, item.action.label,
      ].join(" ").toLowerCase();
      return text.includes(q);
    });
  }, [items, query]);

  const actionSelectOptions = useMemo<SelectOption[]>(() => {
    const set = new Set(items.map((i) => i.action.code));
    return [
      { value: "all", label: "All actions" },
      ...Array.from(set).map((v) => ({ value: v, label: humanize(v) })),
    ];
  }, [items]);

  if (!ready) return null;

  const TYPE_CHIPS = [
    { value: "all",     label: "All" },
    { value: "post",    label: "Post" },
    { value: "comment", label: "Comment" },
    { value: "user",    label: "User" },
  ] as const;

  return (
    <div className={styles.page}>
      <div className={styles.shell}>

        {/* ---- Header ---- */}
        <header className={styles.topbar}>
          <div>
            <h1 className={styles.title}>Audit Log</h1>
            <p className={styles.subtitle}>Full moderation trail — actions, strikes, targets, and invalidations.</p>
          </div>
        </header>

        {/* ---- Panel ---- */}
        <section className={styles.panel}>

          {/* Controls */}
          <div className={styles.controlsRow}>
            {/* Search */}
            <div className={styles.searchWrap}>
              <svg className={styles.searchIcon} viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <circle cx="9" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.6" />
                <path d="M13.5 13.5L17 17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              <input className={styles.searchInput} value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="Search actor, target, reason, action…" />
            </div>

            {/* Type chips */}
            <div className={styles.filterGroup}>
              <span className={styles.filterLabel}>Type</span>
              <div className={styles.chips}>
                {TYPE_CHIPS.map(({ value, label }) => (
                  <button key={value} type="button"
                    className={`${styles.chip} ${typeFilter === value ? styles.chipActive : ""}`}
                    onClick={() => setTypeFilter(value)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Action select */}
            <div className={styles.actionSelectWrap}>
              <span className={styles.filterLabel}>Action</span>
              <CustomSelect value={actionFilter} onChange={setActionFilter}
                ariaLabel="Filter by action" options={actionSelectOptions} />
            </div>
          </div>

          {/* Count row */}
          <div className={styles.metaRow}>
            <span className={styles.totalNum}>{total.toLocaleString()}</span>
            <span className={styles.totalLabel}>total entries</span>
            {visibleItems.length !== items.length && (
              <span className={styles.filteredLabel}>· {visibleItems.length} shown</span>
            )}
          </div>

          {/* Column headers */}
          <div className={styles.tableHead}>
            <span>When</span>
            <span>Actor</span>
            <span>Action</span>
            <span>Target</span>
            <span>Reasoning</span>
          </div>

          {/* Error / empty */}
          {error ? (
            <div className={styles.emptyState}>
              <p style={{ color: "#fca5a5" }}>{error}</p>
            </div>
          ) : !initialized && loading ? (
            <div className={styles.emptyState}>
              <div className={styles.loader} />
              <p>Loading audit logs…</p>
            </div>
          ) : visibleItems.length === 0 ? (
            <div className={styles.emptyState}><p>No audit logs found.</p></div>
          ) : null}

          {/* Log rows */}
          <div className={styles.logList}>
            {visibleItems.map((item, idx) => {
              const actorLabel = getActorLabel(item.actor);
              const actorInitial = getActorInitial(item.actor);
              const actorSub = getActorSub(item.actor);
              const variant = getActionVariant(item.action.code);
              const sevVariant = getSevVariant(item.detail.severity);
              const hasStrike = item.action.strikeDelta != null && item.action.strikeDelta !== 0;
              const invalidatedByLabel = item.invalidation.by
                ? item.invalidation.by.displayName
                  || (item.invalidation.by.username ? `@${item.invalidation.by.username}` : null)
                  || item.invalidation.by.email || "admin"
                : null;

              return (
                <div key={item.actionId}
                  className={`${styles.logRow} ${item.invalidation.invalidated ? styles.logRowInvalidated : ""}`}
                  style={{ animationDelay: `${Math.min(idx, 15) * 30}ms` }}>

                  {/* When */}
                  <div className={styles.timeCell}>
                    <span className={styles.timeRelative}>{fmtRelative(item.occurredAt)}</span>
                    <span className={styles.timeAbsolute}>{fmtAbsolute(item.occurredAt)}</span>
                  </div>

                  {/* Actor */}
                  <div className={styles.actorCell}>
                    <div className={styles.actorAvatar}>{actorInitial}</div>
                    <div className={styles.actorInfo}>
                      <span className={styles.actorName}>{actorLabel}</span>
                      <span className={styles.actorSub} title={item.actor.email || item.actor.userId || ""}>{actorSub}</span>
                    </div>
                  </div>

                  {/* Action */}
                  <div className={styles.actionCell}>
                    <span className={`${styles.actionBadge} ${styles["action_" + variant]}`}>
                      {humanize(item.action.label)}
                    </span>
                    {hasStrike ? (
                      <span className={styles.strikeBadge}>
                        Strike {item.action.strikeDelta! > 0 ? "+" : ""}{item.action.strikeDelta}
                      </span>
                    ) : null}
                    {item.invalidation.invalidated ? (
                      <span className={styles.invalidatedBadge}>Invalidated</span>
                    ) : null}
                  </div>

                  {/* Target */}
                  <div className={styles.targetCell}>
                    <span className={`${styles.targetTypeBadge} ${styles["targetType_" + item.target.type]}`}>
                      {item.target.type.toUpperCase()}
                    </span>
                    <span className={styles.targetOwner}>{item.target.ownerLabel || "--"}</span>
                    <span className={styles.targetId} title={item.target.id}>
                      {item.target.id.slice(0, 8)}…
                    </span>
                  </div>

                  {/* Reasoning */}
                  <div className={styles.reasoningCell}>
                    <div className={styles.reasoningPath}>
                      <span className={styles.reasoningCategory}>{humanize(item.detail.category)}</span>
                      <svg viewBox="0 0 16 16" className={styles.reasoningArrow} aria-hidden="true">
                        <path d="M5 8h6M8 5l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <span className={styles.reasoningReason}>{humanize(item.detail.reason)}</span>
                    </div>
                    <div className={styles.reasoningMeta}>
                      {item.detail.severity ? (
                        <span className={`${styles.sevBadge} ${styles[sevVariant]}`}>
                          {item.detail.severity.toUpperCase()}
                        </span>
                      ) : null}
                      {item.detail.expiresAt ? (
                        <span className={styles.expiryTag} title={fmtAbsolute(item.detail.expiresAt)}>
                          Exp: {fmtRelative(item.detail.expiresAt)}
                        </span>
                      ) : null}
                    </div>
                    {item.detail.note ? (
                      <p className={styles.noteSnippet} title={item.detail.note}>
                        {item.detail.note.length > 80 ? item.detail.note.slice(0, 80) + "…" : item.detail.note}
                      </p>
                    ) : null}
                    {item.invalidation.invalidated && invalidatedByLabel ? (
                      <p className={styles.invalidatedNote}>
                        Invalidated by {invalidatedByLabel}
                        {item.invalidation.reason ? ` · ${item.invalidation.reason}` : ""}
                      </p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Infinite scroll sentinel */}
          <div ref={listEndRef} className={styles.loadMoreZone}>
            {!initialized ? (
              <span>Preparing logs…</span>
            ) : loading ? (
              <><div className={styles.loaderSm} /><span>Loading more…</span></>
            ) : hasMore ? (
              <span>Scroll to load more</span>
            ) : (
              <span>All {total.toLocaleString()} entries loaded</span>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
