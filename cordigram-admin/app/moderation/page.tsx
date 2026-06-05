"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { getApiBaseUrl } from "@/lib/api";
import styles from "./moderation.module.css";

type AdminPayload = { roles?: string[]; exp?: number };

type QueueItem = {
  postId: string;
  authorDisplayName: string | null;
  authorUsername: string | null;
  authorAvatarUrl: string | null;
  createdAt: string | null;
  visibility: string;
  kind: "post" | "reel";
  moderationDecision: "approve" | "blur" | "reject";
  moderationProvider: string | null;
  moderatedMediaCount: number;
  previewUrl: string | null;
  reasons: string[];
};

type SelectOption = { value: string; label: string };

const decodeJwt = (token: string): AdminPayload | null => {
  try {
    const payload = token.split(".")[1];
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
  } catch { return null; }
};

/* Dark-themed dropdown select */
function CustomSelect({ value, options, onChange, ariaLabel }: {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selected = options.find((o) => o.value === value) ?? options[0];

  return (
    <div className={`${styles.select} ${open ? styles.selectOpen : ""}`} ref={rootRef}>
      <button
        type="button"
        className={styles.selectTrigger}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((p) => !p)}
      >
        <span>{selected?.label ?? ""}</span>
        <svg className={styles.selectCaret} viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7 10l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open ? (
        <div className={styles.selectMenu} role="listbox" aria-label={ariaLabel}>
          {options.map((opt) => {
            const active = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={active}
                className={`${styles.selectOption} ${active ? styles.selectOptionActive : ""}`}
                onClick={() => { onChange(opt.value); setOpen(false); }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/* Reason chip color by keyword */
const getReasonClass = (reason: string, s: typeof styles): string => {
  const r = reason.toLowerCase();
  if (["nudity", "violence", "self_harm", "extremism", "illegal", "minor"].some((k) => r.includes(k)))
    return s.reasonChipRed;
  if (["blur", "sensitive", "adult", "sexual"].some((k) => r.includes(k)))
    return s.reasonChipOrange;
  if (["spam", "misinfo", "impersonation", "fake"].some((k) => r.includes(k)))
    return s.reasonChipYellow;
  return s.reasonChipDefault;
};

export default function ModerationQueuePage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [decisionFilter, setDecisionFilter] = useState<"all" | "approve" | "blur" | "reject">("all");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [counts, setCounts] = useState({ approve: 0, blur: 0, reject: 0 });
  const [previousCounts, setPreviousCounts] = useState({ approve: 0, blur: 0, reject: 0 });

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

  useEffect(() => {
    if (!ready || typeof window === "undefined") return;
    const token = localStorage.getItem("adminAccessToken") || "";
    if (!token) return;
    const load = async () => {
      try {
        setLoading(true);
        const res = await fetch(`${getApiBaseUrl()}/admin/moderation/media`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error();
        const payload = (await res.json()) as {
          items: QueueItem[];
          counts: { approve: number; blur: number; reject: number };
          comparison?: {
            previous?: { approve: number; blur: number; reject: number };
          };
        };
        setItems(Array.isArray(payload.items) ? payload.items : []);
        setCounts(payload.counts ?? { approve: 0, blur: 0, reject: 0 });
        setPreviousCounts(payload.comparison?.previous ?? { approve: 0, blur: 0, reject: 0 });
      } finally { setLoading(false); }
    };
    load();
  }, [ready]);

  const total = useMemo(() => counts.approve + counts.blur + counts.reject, [counts]);
  const prevTotal = useMemo(() => previousCounts.approve + previousCounts.blur + previousCounts.reject, [previousCounts]);

  const buildDelta = (cur: number, prev: number) => {
    const d = cur - prev;
    const pct = prev === 0 ? (cur === 0 ? 0 : 100) : Math.abs((d / prev) * 100);
    return { delta: d, percent: pct, dir: d > 0 ? "up" : d < 0 ? "down" : "flat" as const };
  };

  const fmtDelta = (d: ReturnType<typeof buildDelta>, inverse = false) => {
    const sign = d.delta > 0 ? "+" : "";
    const cls = d.dir === "flat" ? styles.deltaFlat
      : (d.dir === "up") === !inverse ? styles.deltaGood : styles.deltaBad;
    return { text: `${sign}${d.delta} (${d.percent.toFixed(1)}%)`, cls };
  };

  const fmtTime = (v?: string | null) => {
    if (!v) return "--";
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return "--";
    return new Intl.DateTimeFormat("vi-VN", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: false,
    }).format(d);
  };

  const filteredItems = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return [...items]
      .filter((item) => {
        if (decisionFilter !== "all" && item.moderationDecision !== decisionFilter) return false;
        if (q && !item.postId.toLowerCase().includes(q) && !(item.authorUsername ?? "").toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => {
        const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return sortOrder === "oldest" ? at - bt : bt - at;
      });
  }, [decisionFilter, items, searchTerm, sortOrder]);

  const totalD   = buildDelta(total, prevTotal);
  const approveD = buildDelta(counts.approve, previousCounts.approve);
  const blurD    = buildDelta(counts.blur, previousCounts.blur);
  const rejectD  = buildDelta(counts.reject, previousCounts.reject);

  if (!ready) return null;

  const kpiCards = [
    { label: "Total moderated", value: total, d: fmtDelta(totalD), cls: "" },
    { label: "Approved",        value: counts.approve, d: fmtDelta(approveD, false), cls: styles.kpiApprove },
    { label: "Blurred",         value: counts.blur,    d: fmtDelta(blurD, true),    cls: styles.kpiBlur },
    { label: "Rejected",        value: counts.reject,  d: fmtDelta(rejectD, true),  cls: styles.kpiReject },
  ];

  return (
    <div className={styles.page}>
      <div className={styles.shell}>

        {/* ---- Header ---- */}
        <header className={styles.topbar}>
          <div>
            <h1 className={styles.title}>Auto Moderation</h1>
            <p className={styles.subtitle}>Media reviewed by AI — last 7 days</p>
          </div>
          <Link href="/dashboard" className={styles.ghostBtn}>Back to dashboard</Link>
        </header>

        {/* ---- KPI strip ---- */}
        <section className={styles.kpiRow}>
          {kpiCards.map((card) => (
            <article key={card.label} className={`${styles.kpiCard} ${card.cls}`}>
              <span className={styles.kpiLabel}>{card.label}</span>
              <span className={styles.kpiValue}>{card.value.toLocaleString()}</span>
              <span className={`${styles.delta} ${card.d.cls}`}>{card.d.text} vs prev 7d</span>
            </article>
          ))}
        </section>

        {/* ---- Table panel ---- */}
        <section className={styles.panel}>
          {/* Controls row */}
          <div className={styles.controlsRow}>
            {/* Search */}
            <div className={styles.searchWrap}>
              <svg className={styles.searchIcon} viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <circle cx="9" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.6" />
                <path d="M13.5 13.5L17 17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search post ID or @username…"
                className={styles.searchInput}
              />
            </div>

            {/* Decision chips */}
            <div className={styles.filterGroup}>
              <span className={styles.filterLabel}>Decision</span>
              <div className={styles.chips}>
                {(["all", "approve", "blur", "reject"] as const).map((v) => (
                  <button key={v} type="button"
                    className={`${styles.chip} ${decisionFilter === v ? styles.chipActive : ""} ${
                      v === "approve" && decisionFilter === v ? styles.chipApprove :
                      v === "blur"    && decisionFilter === v ? styles.chipBlur :
                      v === "reject"  && decisionFilter === v ? styles.chipReject : ""
                    }`}
                    onClick={() => setDecisionFilter(v)}>
                    {v === "all" ? "All" : v.charAt(0).toUpperCase() + v.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Sort */}
            <div className={styles.sortWrap}>
              <span className={styles.filterLabel}>Sort</span>
              <CustomSelect
                value={sortOrder}
                onChange={(v) => setSortOrder(v as "newest" | "oldest")}
                ariaLabel="Sort order"
                options={[
                  { value: "newest", label: "Newest first" },
                  { value: "oldest", label: "Oldest first" },
                ]}
              />
            </div>
          </div>

          {/* Count */}
          <div className={styles.countRow}>
            <span className={styles.countNum}>{filteredItems.length}</span>
            <span className={styles.countOf}>/ {items.length} posts</span>
          </div>

          {/* Table */}
          {loading ? (
            <div className={styles.emptyState}>
              <div className={styles.loader} />
              <p>Loading moderation queue…</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className={styles.emptyState}>
              <p>No posts match the current filters.</p>
            </div>
          ) : (
            <>
              <div className={styles.tableHead}>
                <span>Post / Author</span>
                <span>Decision</span>
                <span>Reasons</span>
                <span className={styles.thCenter}>Media</span>
                <span className={styles.thCenter}>Date</span>
                <span></span>
              </div>

              <div className={styles.tableBody}>
                {filteredItems.map((item, i) => (
                  <article className={styles.tableRow} key={item.postId} style={{ animationDelay: `${i * 35}ms` }}>

                    {/* Post / Author */}
                    <div className={styles.authorCell}>
                      <div className={styles.authorAvatar}>
                        {item.authorAvatarUrl ? (
                          <Image
                            src={item.authorAvatarUrl}
                            alt={item.authorDisplayName || item.authorUsername || ""}
                            width={40}
                            height={40}
                            className={styles.authorAvatarImg}
                            unoptimized
                          />
                        ) : (
                          (item.authorDisplayName || item.authorUsername || "?").charAt(0).toUpperCase()
                        )}
                      </div>
                      <div className={styles.authorInfo}>
                        <p className={styles.authorName}>{item.authorDisplayName || "--"}</p>
                        <p className={styles.authorMeta}>
                          {item.authorUsername ? `@${item.authorUsername}` : "--"}
                        </p>
                        <div className={styles.authorTags}>
                          <span className={`${styles.kindTag} ${item.kind === "reel" ? styles.kindTagReel : ""}`}>
                            {item.kind.toUpperCase()}
                          </span>
                          <span className={styles.visibilityTag}>{item.visibility}</span>
                        </div>
                      </div>
                    </div>

                    {/* Decision */}
                    <div className={styles.decisionCell}>
                      <span className={`${styles.decisionBadge} ${
                        item.moderationDecision === "reject" ? styles.decisionReject :
                        item.moderationDecision === "blur"   ? styles.decisionBlur :
                        styles.decisionApprove
                      }`}>
                        {item.moderationDecision.toUpperCase()}
                      </span>
                      {item.moderationProvider ? (
                        <span className={styles.providerTag}>{item.moderationProvider}</span>
                      ) : null}
                    </div>

                    {/* Reasons */}
                    <div className={styles.reasonsCell}>
                      {(item.reasons ?? []).length === 0 ? (
                        <span className={styles.reasonNone}>—</span>
                      ) : (
                        <>
                          {(item.reasons ?? []).slice(0, 4).map((r, idx) => (
                            <span key={idx} title={r} className={`${styles.reasonChip} ${getReasonClass(r, styles)}`}>
                              {r}
                            </span>
                          ))}
                          {(item.reasons ?? []).length > 4 ? (
                            <span className={styles.reasonMore}>+{item.reasons.length - 4}</span>
                          ) : null}
                        </>
                      )}
                    </div>

                    {/* Media count */}
                    <div className={styles.mediaCell}>
                      <span className={styles.mediaNum}>{item.moderatedMediaCount}</span>
                      <span className={styles.mediaUnit}>files</span>
                    </div>

                    {/* Date */}
                    <div className={styles.dateCell}>
                      {fmtTime(item.createdAt)}
                    </div>

                    {/* Action */}
                    <div className={styles.actionCell}>
                      <Link href={`/moderation/${item.postId}`} className={styles.viewBtn}>
                        View
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
