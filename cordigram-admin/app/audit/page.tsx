"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./audit.module.css";
import { getApiBaseUrl } from "@/lib/api";

type AdminPayload = {
  roles?: string[];
  exp?: number;
};

const PAGE_SIZE = 20;

type SelectOption = {
  value: string;
  label: string;
};

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
    const json = JSON.parse(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/")),
    );
    return json as AdminPayload;
  } catch {
    return null;
  }
};

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString();
};

const formatRelativeTime = (value: string | null | undefined) => {
  if (!value) return "--";
  const date = new Date(value);
  const ts = date.getTime();
  if (Number.isNaN(ts)) return "--";
  const diff = Date.now() - ts;
  const mins = Math.max(0, Math.floor(diff / 60000));
  if (mins < 60) return `${mins} mins ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return `${days} days ago`;
};

const humanizeLabel = (value: string | null | undefined) => {
  const raw = (value || "").trim();
  if (!raw) return "--";
  return raw
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
};

function CustomSelect(props: {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
}) {
  const { value, options, onChange, ariaLabel } = props;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDocumentClick = (event: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", onDocumentClick);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onDocumentClick);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  const selected = options.find((item) => item.value === value) ?? options[0];

  return (
    <div className={`${styles.customSelect} ${open ? styles.customSelectOpen : ""}`} ref={rootRef}>
      <button
        type="button"
        className={styles.customSelectTrigger}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span>{selected?.label ?? ""}</span>
        <span className={styles.selectCaret} aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path
              d="M7 10l5 5 5-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>

      {open ? (
        <div className={styles.customSelectMenu} role="listbox" aria-label={ariaLabel}>
          {options.map((option) => {
            const isActive = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isActive}
                className={`${styles.customSelectOption} ${isActive ? styles.customSelectOptionActive : ""}`}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                {option.label}
              </button>
            );
          })}
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
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<AuditLogItem[]>([]);
  const [total, setTotal] = useState(0);

  const [typeFilter, setTypeFilter] = useState<"all" | "post" | "comment" | "user">("all");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [query, setQuery] = useState("");

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

  const loadLogs = useCallback(
    async (reset: boolean) => {
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
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error("Failed to load audit logs");
        }

        const payload = (await response.json()) as {
          items?: AuditLogItem[];
          total?: number;
          hasMore?: boolean;
        };

        const fetched = payload.items ?? [];
        setItems((prev) => {
          if (reset) return fetched;
          const seen = new Set(prev.map((item) => item.actionId));
          const appended = fetched.filter((item) => !seen.has(item.actionId));
          return [...prev, ...appended];
        });
        setTotal(typeof payload.total === "number" ? payload.total : 0);
        const nextHasMore = Boolean(payload.hasMore);
        const computedOffset = nextOffset + fetched.length;
        setHasMore(nextHasMore);
        setOffset(computedOffset);
        hasMoreRef.current = nextHasMore;
        offsetRef.current = computedOffset;
      } catch {
        setError("Could not load audit logs.");
        if (reset) {
          setItems([]);
          setTotal(0);
          setHasMore(false);
          setOffset(0);
          hasMoreRef.current = false;
          offsetRef.current = 0;
        }
      } finally {
        loadingRef.current = false;
        setLoading(false);
        setInitialized(true);
      }
    },
    [actionFilter, ready, typeFilter],
  );

  useEffect(() => {
    if (!ready) return;
    setItems([]);
    setTotal(0);
    setHasMore(true);
    setOffset(0);
    setInitialized(false);
    hasMoreRef.current = true;
    offsetRef.current = 0;
    void loadLogs(true);
  }, [ready, typeFilter, actionFilter, loadLogs]);

  useEffect(() => {
    if (!ready) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        if (!hasMoreRef.current || loadingRef.current) return;
        void loadLogs(false);
      },
      {
        root: null,
        rootMargin: "220px",
        threshold: 0,
      },
    );

    const node = listEndRef.current;
    if (node) observer.observe(node);

    return () => observer.disconnect();
  }, [loadLogs, ready]);

  const visibleItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return items;

    return items.filter((item) => {
      const actorText =
        item.actor.displayName || item.actor.username || item.actor.email || "";
      const targetText = `${item.target.ownerLabel} ${item.target.id}`;
      const detailText = `${item.detail.category} ${item.detail.reason} ${item.action.label}`;
      return `${actorText} ${targetText} ${detailText}`
        .toLowerCase()
        .includes(normalized);
    });
  }, [items, query]);

  const actionOptions = useMemo(() => {
    const set = new Set(items.map((item) => item.action.code));
    return ["all", ...Array.from(set)];
  }, [items]);

  const typeOptions = useMemo<SelectOption[]>(
    () => [
      { value: "all", label: "All target types" },
      { value: "post", label: "Post" },
      { value: "comment", label: "Comment" },
      { value: "user", label: "User" },
    ],
    [],
  );

  const actionSelectOptions = useMemo<SelectOption[]>(
    () => actionOptions.map((value) => ({ value, label: value === "all" ? "All actions" : humanizeLabel(value) })),
    [actionOptions],
  );

  if (!ready) return null;

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.topbar}>
          <div>
            <p className={styles.eyebrow}>Moderation Forensics</p>
            <h1 className={styles.title}>Audit Log</h1>
            <p className={styles.subtitle}>
              Full moderation audit trail with action details, strike effects, target ownership, and invalidation history.
            </p>
          </div>
        </header>

        <section className={styles.panel}>
          <div className={styles.controls}>
            <input
              className={styles.search}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search actor, target, id, reason, action"
            />
            <CustomSelect
              value={typeFilter}
              onChange={(value) => setTypeFilter(value as "all" | "post" | "comment" | "user")}
              ariaLabel="Filter by target type"
              options={typeOptions}
            />
            <CustomSelect
              value={actionFilter}
              onChange={setActionFilter}
              ariaLabel="Filter by action type"
              options={actionSelectOptions}
            />
          </div>

          <div className={styles.metaRow}>
            <span>Total: {total.toLocaleString()}</span>
          </div>

          {loading && !initialized ? <p className={styles.muted}>Loading audit logs...</p> : null}
          {error ? <p className={styles.error}>{error}</p> : null}

          {!loading && !error && visibleItems.length === 0 ? (
            <p className={styles.muted}>No audit logs found.</p>
          ) : null}

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Target</th>
                  <th>Reasoning</th>
                </tr>
              </thead>
              <tbody>
                {visibleItems.map((item) => {
                  const actorLabel =
                    item.actor.displayName ||
                    (item.actor.username ? `@${item.actor.username}` : null) ||
                    item.actor.email ||
                    "admin";
                  const invalidatedBy = item.invalidation.by
                    ? item.invalidation.by.displayName ||
                      (item.invalidation.by.username
                        ? `@${item.invalidation.by.username}`
                        : null) ||
                      item.invalidation.by.email ||
                      "--"
                    : "--";

                  return (
                    <tr key={item.actionId}>
                      <td>
                        <p className={styles.main}>{formatRelativeTime(item.occurredAt)}</p>
                        <p className={styles.sub}>{formatDateTime(item.occurredAt)}</p>
                      </td>
                      <td>
                        <p className={styles.main}>{actorLabel}</p>
                        <p className={styles.sub}>{item.actor.userId || "--"}</p>
                      </td>
                      <td>
                        <p className={styles.main}>{item.action.label}</p>
                        <p className={styles.sub}>
                          {item.action.strikeDelta == null
                            ? "Strike: n/a"
                            : `Strike: +${item.action.strikeDelta}`}
                        </p>
                      </td>
                      <td>
                        <p className={styles.main}>
                          {item.target.type} {item.target.ownerLabel}
                        </p>
                        <p className={styles.sub}>{item.target.id}</p>
                      </td>
                      <td>
                        <p className={styles.main}>
                          {humanizeLabel(item.detail.category)} / {humanizeLabel(item.detail.reason)}
                        </p>
                        <p className={styles.sub}>
                          Severity: {item.detail.severity || "n/a"} · Exp: {formatDateTime(item.detail.expiresAt)}
                        </p>
                        <p className={styles.sub}>{item.detail.note || "No note"}</p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div ref={listEndRef} className={styles.loadMoreZone}>
            {!initialized
              ? "Preparing logs..."
              : loading
                ? "Loading 20 more logs..."
                : hasMore
                  ? "Scroll to load more"
                  : "No more logs"}
          </div>
        </section>
      </div>
    </div>
  );
}
