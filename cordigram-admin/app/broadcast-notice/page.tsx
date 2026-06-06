"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./broadcast-notice.module.css";
import { getApiBaseUrl } from "@/lib/api";

type AdminPayload = { roles?: string[]; exp?: number };
type NoticeLevel = "info" | "warning" | "critical";
type TargetMode = "all" | "include" | "exclude";

type UserSuggestionItem = {
  userId: string;
  username: string;
  displayName: string | null;
  email: string | null;
  avatarUrl: string | null;
};

type BroadcastHistoryItem = {
  id: string;
  title: string | null;
  body: string;
  level: NoticeLevel;
  actionUrl: string | null;
  targetMode: TargetMode;
  includeCount: number;
  excludeCount: number;
  targetUserCount: number;
  realtimeDeliveredCount: number;
  createdAt: string;
  scheduledAt: string | null;
  admin: {
    userId: string;
    displayName: string | null;
    username: string | null;
    email: string | null;
  };
};

type UndoState = { id: string; countdown: number };
type PrefillSource = { date: string };

const decodeJwt = (token: string): AdminPayload | null => {
  try {
    const p = token.split(".")[1];
    return JSON.parse(atob(p.replace(/-/g, "+").replace(/_/g, "/"))) as AdminPayload;
  } catch { return null; }
};

const fmt = (value: string | null | undefined) => {
  if (!value) return "--";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "--";
  return d.toLocaleString("vi-VN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
};

const levelLabel: Record<NoticeLevel, string> = { info: "Info", warning: "Warning", critical: "Critical" };
const targetModeLabel: Record<TargetMode, string> = { all: "All Users", include: "Include only", exclude: "Exclude list" };
const HISTORY_PAGE_SIZE = 20;
const UNDO_SECONDS = 30;

// ── Galaxy DateTime Picker ──────────────────────────────────
const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const DAY_NAMES = ["Mo","Tu","We","Th","Fr","Sa","Su"];

function parseDtLocal(v: string): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function GalaxyDateTimePicker({
  value,
  onChange,
  min,
  placeholder = "Pick date & time",
}: {
  value: string;
  onChange: (v: string) => void;
  min?: string;
  placeholder?: string;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);

  const init = parseDtLocal(value);
  const now = new Date();

  const [viewYear, setViewYear] = useState(init?.getFullYear() ?? now.getFullYear());
  const [viewMonth, setViewMonth] = useState(init?.getMonth() ?? now.getMonth());
  const [selYear, setSelYear] = useState<number | null>(init?.getFullYear() ?? null);
  const [selMonth, setSelMonth] = useState<number | null>(init?.getMonth() ?? null);
  const [selDay, setSelDay] = useState<number | null>(init?.getDate() ?? null);
  const [hour, setHour] = useState(init?.getHours() ?? 9);
  const [minute, setMinute] = useState(init?.getMinutes() ?? 0);

  useEffect(() => {
    const d = parseDtLocal(value);
    if (d) {
      setViewYear(d.getFullYear()); setViewMonth(d.getMonth());
      setSelYear(d.getFullYear()); setSelMonth(d.getMonth()); setSelDay(d.getDate());
      setHour(d.getHours()); setMinute(d.getMinutes());
    } else if (!value) {
      setSelYear(null); setSelMonth(null); setSelDay(null);
    }
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  // Build calendar cells
  const firstDow = new Date(viewYear, viewMonth, 1).getDay();
  const firstAdj = (firstDow + 6) % 7; // Mon = 0
  const daysInMo = new Date(viewYear, viewMonth + 1, 0).getDate();
  const daysInPrev = new Date(viewYear, viewMonth, 0).getDate();

  type Cell = { day: number; month: number; year: number; isOther: boolean };
  const cells: Cell[] = [];
  for (let i = firstAdj - 1; i >= 0; i--) {
    const m = viewMonth === 0 ? 11 : viewMonth - 1;
    const y = viewMonth === 0 ? viewYear - 1 : viewYear;
    cells.push({ day: daysInPrev - i, month: m, year: y, isOther: true });
  }
  for (let d = 1; d <= daysInMo; d++) {
    cells.push({ day: d, month: viewMonth, year: viewYear, isOther: false });
  }
  while (cells.length % 7 !== 0) {
    const idx = cells.length - firstAdj - daysInMo + 1;
    const m = viewMonth === 11 ? 0 : viewMonth + 1;
    const y = viewMonth === 11 ? viewYear + 1 : viewYear;
    cells.push({ day: idx, month: m, year: y, isOther: true });
  }

  const minDate = min ? parseDtLocal(min) : null;

  const isCellDisabled = (c: Cell) => {
    if (!minDate) return false;
    return new Date(c.year, c.month, c.day, 23, 59) < minDate;
  };
  const isCellSelected = (c: Cell) =>
    !c.isOther && c.day === selDay && c.month === selMonth && c.year === selYear;
  const isCellToday = (c: Cell) => {
    const t = new Date();
    return c.day === t.getDate() && c.month === t.getMonth() && c.year === t.getFullYear();
  };

  const selectCell = (c: Cell) => {
    if (isCellDisabled(c)) return;
    setSelDay(c.day); setSelMonth(c.month); setSelYear(c.year);
    if (c.isOther) { setViewYear(c.year); setViewMonth(c.month); }
    if (minDate) {
      const minD = new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate());
      const selD = new Date(c.year, c.month, c.day);
      if (+selD === +minD && (hour < minDate.getHours() || (hour === minDate.getHours() && minute < minDate.getMinutes()))) {
        setHour(minDate.getHours());
        setMinute(Math.min(minDate.getMinutes() + 5, 59));
      }
    }
  };

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  const adjHour = (d: number) => setHour(h => (h + d + 24) % 24);
  const adjMin = (d: number) => setMinute(m => (m + d + 60) % 60);

  const canConfirm = selDay !== null && selMonth !== null && selYear !== null;
  const buildIso = () =>
    `${selYear}-${String(selMonth! + 1).padStart(2, "0")}-${String(selDay!).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  const isTimeValid = () => {
    if (!canConfirm || !minDate) return true;
    return new Date(selYear!, selMonth!, selDay!, hour, minute) >= minDate;
  };

  const confirm = () => {
    if (!canConfirm || !isTimeValid()) return;
    onChange(buildIso());
    setOpen(false);
  };
  const clear = () => {
    onChange("");
    setSelDay(null); setSelMonth(null); setSelYear(null);
    setOpen(false);
  };

  const display = parseDtLocal(value);
  const displayStr = display
    ? display.toLocaleString("vi-VN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div className={styles.dtpWrap} ref={wrapRef}>
      <button
        type="button"
        className={`${styles.dtpTrigger}${open ? ` ${styles.dtpTriggerOpen}` : ""}`}
        onClick={() => setOpen(v => !v)}
      >
        <svg className={styles.dtpCalIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="3" y="4" width="18" height="18" rx="3" />
          <path d="M3 9h18M8 2v4M16 2v4" />
        </svg>
        <span className={displayStr ? styles.dtpTriggerValue : styles.dtpTriggerPlaceholder}>
          {displayStr ?? placeholder}
        </span>
        {value ? (
          <span
            className={styles.dtpClearInline}
            onClick={(e) => { e.stopPropagation(); clear(); }}
            role="button"
            aria-label="Clear"
          >×</span>
        ) : (
          <svg className={styles.dtpCaret} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M7 10l5 5 5-5" />
          </svg>
        )}
      </button>

      {open ? (
        <div className={styles.dtpDropdown}>
          {/* Month/Year navigation */}
          <div className={styles.dtpHeader}>
            <button type="button" className={styles.dtpNavBtn} onClick={prevMonth}>‹</button>
            <p className={styles.dtpMonthYear}>
              <strong>{MONTH_NAMES[viewMonth]}</strong>
              <span>{viewYear}</span>
            </p>
            <button type="button" className={styles.dtpNavBtn} onClick={nextMonth}>›</button>
          </div>

          {/* Weekday labels */}
          <div className={styles.dtpDayRow}>
            {DAY_NAMES.map((d) => <span key={d} className={styles.dtpDayName}>{d}</span>)}
          </div>

          {/* Day grid */}
          <div className={styles.dtpGrid}>
            {cells.map((cell, i) => (
              <button
                key={i}
                type="button"
                disabled={isCellDisabled(cell)}
                className={[
                  styles.dtpCell,
                  cell.isOther ? styles.dtpCellOther : "",
                  isCellDisabled(cell) ? styles.dtpCellDisabled : "",
                  isCellSelected(cell) ? styles.dtpCellSelected : "",
                  isCellToday(cell) && !isCellSelected(cell) ? styles.dtpCellToday : "",
                ].filter(Boolean).join(" ")}
                onClick={() => selectCell(cell)}
              >
                {cell.day}
              </button>
            ))}
          </div>

          <div className={styles.dtpDivider} />

          {/* Time picker */}
          <div className={styles.dtpTimePicker}>
            <span className={styles.dtpTimeLabel}>Time</span>
            <div className={styles.dtpTimeRow}>
              <div className={styles.dtpTimeUnit}>
                <button type="button" className={styles.dtpTimeBtn} onClick={() => adjHour(1)}>▲</button>
                <span className={styles.dtpTimeNum}>{String(hour).padStart(2, "0")}</span>
                <button type="button" className={styles.dtpTimeBtn} onClick={() => adjHour(-1)}>▼</button>
                <span className={styles.dtpTimeUnitLabel}>hr</span>
              </div>
              <span className={styles.dtpTimeSep}>:</span>
              <div className={styles.dtpTimeUnit}>
                <button type="button" className={styles.dtpTimeBtn} onClick={() => adjMin(5)}>▲</button>
                <span className={styles.dtpTimeNum}>{String(minute).padStart(2, "0")}</span>
                <button type="button" className={styles.dtpTimeBtn} onClick={() => adjMin(-5)}>▼</button>
                <span className={styles.dtpTimeUnitLabel}>min</span>
              </div>
            </div>
            {canConfirm && !isTimeValid() ? (
              <p className={styles.dtpTimeError}>Selected time is before the minimum allowed.</p>
            ) : null}
          </div>

          {/* Footer */}
          <div className={styles.dtpFooter}>
            <button type="button" className={styles.dtpClearBtn} onClick={clear}>Clear</button>
            <div className={styles.dtpFooterRight}>
              <button type="button" className={styles.dtpTodayBtn}
                onClick={() => { const t = new Date(); setViewYear(t.getFullYear()); setViewMonth(t.getMonth()); }}>
                Today
              </button>
              <button type="button" className={styles.dtpConfirmBtn}
                onClick={confirm} disabled={!canConfirm || !isTimeValid()}>
                Confirm
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ── Chip Tag Input ──────────────────────────────────────────
function ChipTagInput(props: {
  mode: "include" | "exclude";
  values: string[];
  onAdd: (v: string) => void;
  onRemove: (v: string) => void;
  suggestions: UserSuggestionItem[];
  suggestionOpen: boolean;
  loadingSuggestions: boolean;
  lookup: string;
  onLookupChange: (v: string) => void;
  onSuggestionClose: () => void;
}) {
  const { mode, values, onAdd, onRemove, suggestions, suggestionOpen, loadingSuggestions, lookup, onLookupChange, onSuggestionClose } = props;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!suggestionOpen) return;
    const h = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) onSuggestionClose();
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [suggestionOpen, onSuggestionClose]);

  const commit = () => {
    const v = lookup.trim();
    if (v) { onAdd(v); onLookupChange(""); }
  };

  return (
    <div className={styles.chipInputWrap} ref={wrapRef}>
      <div className={styles.chipArea} onClick={() => inputRef.current?.focus()}>
        {values.map((v) => (
          <span key={v} className={styles.userChip}>
            <span className={styles.chipLabel}>{v}</span>
            <button type="button" className={styles.chipRemove} onClick={(e) => { e.stopPropagation(); onRemove(v); }} aria-label={`Remove ${v}`}>×</button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          className={styles.chipInput}
          value={lookup}
          onChange={(e) => onLookupChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") { e.preventDefault(); commit(); }
            if (e.key === "Backspace" && lookup === "" && values.length > 0) onRemove(values[values.length - 1]);
            if (e.key === "Escape") onSuggestionClose();
          }}
          onBlur={() => window.setTimeout(() => { if (lookup.trim()) commit(); }, 150)}
          placeholder={values.length === 0 ? `Type username or ID, press Enter to add…` : "Add more…"}
        />
      </div>

      {suggestionOpen ? (
        <div className={styles.suggestionBox}>
          {loadingSuggestions ? (
            <p className={styles.suggestionHint}>Searching…</p>
          ) : suggestions.length === 0 ? (
            <p className={styles.suggestionHint}>No matching users</p>
          ) : (
            suggestions.map((item) => (
              <button
                key={`${item.userId}-${mode}`}
                type="button"
                className={styles.suggestionItem}
                onMouseDown={(e) => { e.preventDefault(); onAdd(item.username); onLookupChange(""); onSuggestionClose(); }}
              >
                <span className={styles.suggestionUserRow}>
                  {item.avatarUrl
                    ? <img src={item.avatarUrl} alt={item.username} className={styles.suggestionAvatar} />
                    : <span className={styles.suggestionAvatarFallback}>{item.username.charAt(0).toUpperCase()}</span>}
                  <span className={styles.suggestionUserText}>
                    <span>@{item.username}</span>
                    <small>{item.displayName || item.email || item.userId}</small>
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      ) : null}

      {values.length > 0 ? (
        <p className={styles.idCount}>
          {values.length} user{values.length > 1 ? "s" : ""} added
          <button type="button" className={styles.clearAllBtn} onClick={() => values.forEach(onRemove)}>Clear all</button>
        </p>
      ) : null}
    </div>
  );
}

// ── Main page ───────────────────────────────────────────────
export default function BroadcastNoticePage() {
  const router = useRouter();

  const [ready, setReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [hasMoreHistory, setHasMoreHistory] = useState(true);
  const [toast, setToast] = useState<{ msg: string; kind: "success" | "error" } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [level, setLevel] = useState<NoticeLevel>("info");
  const [actionUrl, setActionUrl] = useState("");
  const [targetMode, setTargetMode] = useState<TargetMode>("all");
  const [includeIds, setIncludeIds] = useState<string[]>([]);
  const [excludeIds, setExcludeIds] = useState<string[]>([]);
  const [includeLookup, setIncludeLookup] = useState("");
  const [excludeLookup, setExcludeLookup] = useState("");

  // Scheduled send
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");

  // Suggestions
  const [suggestions, setSuggestions] = useState<UserSuggestionItem[]>([]);
  const [suggestionMode, setSuggestionMode] = useState<"include" | "exclude" | null>(null);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  // History
  const [history, setHistory] = useState<BroadcastHistoryItem[]>([]);
  const [historyFilter, setHistoryFilter] = useState<"all" | NoticeLevel>("all");
  const [historyOffset, setHistoryOffset] = useState(0);

  // Confirmation dialog
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTyped, setConfirmTyped] = useState("");

  // Preview modal
  const [previewOpen, setPreviewOpen] = useState(false);

  // Undo after send
  const [undoState, setUndoState] = useState<UndoState | null>(null);
  const undoIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Resend pre-fill
  const [prefillSource, setPrefillSource] = useState<PrefillSource | null>(null);
  const composePanelRef = useRef<HTMLElement | null>(null);

  // Min datetime for schedule picker (now + 5 min)
  const minSchedule = useMemo(() => {
    const d = new Date(Date.now() + 5 * 60 * 1000);
    return d.toISOString().slice(0, 16);
  }, []);

  // ── Toast auto-dismiss ─────────────────────────────────
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(t);
  }, [toast]);

  // ── Cleanup undo interval on unmount ───────────────────
  useEffect(() => () => { if (undoIntervalRef.current) clearInterval(undoIntervalRef.current); }, []);

  // ── Auth guard ─────────────────────────────────────────
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

  // ── History ────────────────────────────────────────────
  const loadHistory = useCallback(async (offset: number, reset: boolean) => {
    const token = localStorage.getItem("adminAccessToken") || "";
    if (!token) return;
    try {
      setLoadingHistory(true);
      const params = new URLSearchParams({ limit: String(HISTORY_PAGE_SIZE), offset: String(offset) });
      const res = await fetch(`${getApiBaseUrl()}/admin/broadcast-notice/history?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { items?: BroadcastHistoryItem[]; hasMore?: boolean };
      const items = data.items ?? [];
      setHistory((prev) => (reset ? items : [...prev, ...items]));
      setHistoryOffset(offset + items.length);
      setHasMoreHistory(Boolean(data.hasMore));
    } catch { setHistory([]); }
    finally { setLoadingHistory(false); }
  }, []);

  useEffect(() => { if (ready) void loadHistory(0, true); }, [ready, loadHistory]);

  // ── Suggestions ────────────────────────────────────────
  useEffect(() => {
    if (!ready) return;
    const kw = (targetMode === "include" ? includeLookup : excludeLookup).trim();
    if (kw.length < 2) { setSuggestions([]); setSuggestionMode(null); return; }
    const token = localStorage.getItem("adminAccessToken") || "";
    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        setLoadingSuggestions(true);
        const res = await fetch(
          `${getApiBaseUrl()}/admin/broadcast-notice/users/suggest?${new URLSearchParams({ q: kw, limit: "8" })}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok) throw new Error();
        const data = (await res.json()) as { items?: UserSuggestionItem[] };
        if (!active) return;
        setSuggestions(data.items ?? []);
        setSuggestionMode(targetMode === "include" ? "include" : "exclude");
      } catch { if (!active) return; setSuggestions([]); setSuggestionMode(null); }
      finally { if (active) setLoadingSuggestions(false); }
    }, 220);
    return () => { active = false; window.clearTimeout(timer); };
  }, [excludeLookup, includeLookup, ready, targetMode]);

  // ── Chip helpers ───────────────────────────────────────
  const addToList = useCallback((v: string, list: "include" | "exclude") => {
    const val = v.trim();
    if (!val) return;
    const setter = list === "include" ? setIncludeIds : setExcludeIds;
    setter((prev) => prev.map((s) => s.toLowerCase()).includes(val.toLowerCase()) ? prev : [...prev, val]);
  }, []);

  const removeFromList = useCallback((v: string, list: "include" | "exclude") => {
    (list === "include" ? setIncludeIds : setExcludeIds)((prev) => prev.filter((s) => s !== v));
  }, []);

  // ── Validation ─────────────────────────────────────────
  const validationIssue = useMemo((): string | null => {
    if (!body.trim()) return "Message is required";
    if (body.trim().length > 2000) return "Message exceeds 2000 characters";
    if (title.trim().length > 120) return "Title exceeds 120 characters";
    if (actionUrl.trim() && !/^https?:\/\//i.test(actionUrl.trim())) return "Action URL must start with http:// or https://";
    if (scheduleEnabled && !scheduledAt) return "Select a scheduled send time";
    if (scheduleEnabled && new Date(scheduledAt) <= new Date()) return "Scheduled time must be in the future";
    if (targetMode === "include" && includeIds.length === 0) return "Add at least one user to the include list";
    if (targetMode === "exclude" && excludeIds.length === 0) return "Add at least one user to the exclude list";
    return null;
  }, [actionUrl, body, excludeIds, includeIds, scheduleEnabled, scheduledAt, targetMode, title]);

  const canSubmit = validationIssue === null;

  const filteredHistory = useMemo(() =>
    historyFilter === "all" ? history : history.filter((i) => i.level === historyFilter),
    [history, historyFilter]);

  const confirmKeyword = level === "critical" ? "SEND" : null;
  const confirmReady = confirmKeyword === null || confirmTyped.trim().toUpperCase() === confirmKeyword;

  // ── Undo countdown ─────────────────────────────────────
  const startUndo = useCallback((id: string) => {
    if (undoIntervalRef.current) clearInterval(undoIntervalRef.current);
    setUndoState({ id, countdown: UNDO_SECONDS });
    undoIntervalRef.current = setInterval(() => {
      setUndoState((prev) => {
        if (!prev) return null;
        if (prev.countdown <= 1) {
          clearInterval(undoIntervalRef.current!);
          return null;
        }
        return { ...prev, countdown: prev.countdown - 1 };
      });
    }, 1000);
  }, []);

  const handleUndo = useCallback(async () => {
    if (!undoState) return;
    if (undoIntervalRef.current) clearInterval(undoIntervalRef.current);
    const id = undoState.id;
    setUndoState(null);
    setCancelling(true);
    const token = localStorage.getItem("adminAccessToken") || "";
    try {
      const res = await fetch(`${getApiBaseUrl()}/admin/broadcast-notice/${id}/cancel`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      setToast({ kind: "success", msg: "Broadcast cancelled successfully." });
      await loadHistory(0, true);
    } catch {
      setToast({ kind: "error", msg: "Could not cancel — broadcast may have already been delivered." });
    } finally { setCancelling(false); }
  }, [undoState, loadHistory]);

  // ── Resend pre-fill ────────────────────────────────────
  const handleResend = useCallback((item: BroadcastHistoryItem) => {
    setTitle(item.title || "");
    setBody(item.body);
    setLevel(item.level);
    setActionUrl(item.actionUrl || "");
    setTargetMode("all"); // reset targeting; history doesn't store individual IDs
    setIncludeIds([]);
    setExcludeIds([]);
    setScheduleEnabled(false);
    setScheduledAt("");
    setPrefillSource({ date: fmt(item.createdAt) });
    composePanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const clearPrefill = () => {
    setTitle(""); setBody(""); setLevel("info");
    setActionUrl(""); setTargetMode("all");
    setIncludeIds([]); setExcludeIds([]);
    setScheduleEnabled(false); setScheduledAt("");
    setPrefillSource(null);
  };

  // ── Send ───────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const token = localStorage.getItem("adminAccessToken") || "";
    if (!token) return;
    try {
      setSubmitting(true);
      setError(null);
      setConfirmOpen(false);
      setConfirmTyped("");

      const res = await fetch(`${getApiBaseUrl()}/admin/broadcast-notice/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          level,
          actionUrl: actionUrl.trim() || null,
          targetMode,
          includeUserIds: targetMode === "include" ? includeIds : [],
          excludeUserIds: targetMode === "exclude" ? excludeIds : [],
          scheduledAt: scheduleEnabled && scheduledAt ? new Date(scheduledAt).toISOString() : null,
        }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string | string[] };
        throw new Error(Array.isArray(data.message) ? data.message.join("; ") : data.message || "Failed to send");
      }

      const data = (await res.json()) as { id?: string; targetUserCount: number; realtimeDeliveredCount: number };

      // Reset form
      setTitle(""); setBody(""); setLevel("info"); setActionUrl("");
      setTargetMode("all"); setIncludeIds([]); setExcludeIds([]);
      setScheduleEnabled(false); setScheduledAt("");
      setPrefillSource(null);

      if (scheduleEnabled) {
        setToast({ kind: "success", msg: `Broadcast scheduled for ${fmt(scheduledAt)}.` });
      } else {
        // Start undo countdown if we got a broadcast ID back
        if (data.id) startUndo(data.id);
        else setToast({ kind: "success", msg: `Broadcast sent · ${data.targetUserCount.toLocaleString()} targeted · ${data.realtimeDeliveredCount.toLocaleString()} delivered` });
      }

      await loadHistory(0, true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send broadcast");
    } finally { setSubmitting(false); }
  }, [title, body, level, actionUrl, targetMode, includeIds, excludeIds, scheduleEnabled, scheduledAt, startUndo, loadHistory]);

  if (!ready) return null;

  const undoPct = undoState ? (undoState.countdown / UNDO_SECONDS) * 100 : 0;

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        {/* ── Header ── */}
        <header className={styles.topbar}>
          <div>
            <p className={styles.eyebrow}>Global Communication</p>
            <h1 className={styles.title}>Broadcast Notice</h1>
            <p className={styles.subtitle}>Send a real-time system notice to all active users instantly.</p>
          </div>
        </header>

        {/* ── Compose panel ── */}
        <section className={styles.panel} ref={composePanelRef as React.RefObject<HTMLElement>}>
          {/* Pre-fill banner */}
          {prefillSource ? (
            <div className={styles.prefillBanner}>
              <span>Pre-filled from broadcast on {prefillSource.date}. Review and modify before sending.</span>
              <button type="button" className={styles.prefillClear} onClick={clearPrefill}>Clear form</button>
            </div>
          ) : null}

          <div className={styles.formGrid}>
            {/* Title */}
            <label className={styles.field}>
              <span className={styles.label}>Title (optional)</span>
              <input className={styles.input} value={title} onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Scheduled maintenance at 10:00 PM UTC" maxLength={120} />
              <span className={`${styles.counter} ${title.length > 100 ? styles.counterWarn : ""}`}>{title.length}/120</span>
            </label>

            {/* Severity */}
            <div className={styles.severityGroup}>
              <span className={styles.label}>Severity</span>
              <div className={styles.levelRow}>
                {(["info", "warning", "critical"] as NoticeLevel[]).map((item) => (
                  <button key={item} type="button"
                    className={`${styles.levelChip} ${styles[`level_${item}`]} ${level === item ? styles.levelChipActive : ""}`}
                    onClick={() => setLevel(item)}>
                    {levelLabel[item]}
                  </button>
                ))}
              </div>
            </div>

            {/* Message */}
            <label className={styles.fieldFull}>
              <span className={styles.label}>Message</span>
              <textarea className={styles.textarea} value={body} onChange={(e) => setBody(e.target.value)}
                placeholder="Write clear, concise instructions for all users." rows={5} maxLength={2000} />
              <span className={`${styles.counter} ${body.length > 1800 ? styles.counterWarn : ""}`}>{body.length}/2000</span>
            </label>

            {/* Action URL */}
            <label className={styles.fieldFull}>
              <span className={styles.label}>Action URL (optional)</span>
              <input className={styles.input} value={actionUrl} onChange={(e) => setActionUrl(e.target.value)}
                placeholder="https://status.example.com" maxLength={300} />
            </label>

            {/* Schedule */}
            <div className={styles.fieldFull}>
              <label className={styles.scheduleToggleRow}>
                <div
                  className={`${styles.toggleSwitch} ${scheduleEnabled ? styles.toggleSwitchOn : ""}`}
                  onClick={() => { setScheduleEnabled((v) => !v); if (scheduleEnabled) setScheduledAt(""); }}
                  role="switch"
                  aria-checked={scheduleEnabled}
                  tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && setScheduleEnabled((v) => !v)}
                >
                  <div className={styles.toggleKnob} />
                </div>
                <span className={styles.label} style={{ margin: 0, cursor: "pointer" }}>Schedule for later</span>
              </label>
              {scheduleEnabled ? (
                <GalaxyDateTimePicker
                  value={scheduledAt}
                  onChange={setScheduledAt}
                  min={minSchedule}
                  placeholder="Select date & time to schedule"
                />
              ) : null}
            </div>

            {/* Target audience */}
            <div className={styles.fieldFull}>
              <span className={styles.label}>Target audience</span>
              <div className={styles.targetGroup}>
                {(["all", "include", "exclude"] as const).map((item) => (
                  <button key={item} type="button"
                    className={`${styles.filterChip} ${targetMode === item ? styles.filterChipActive : ""}`}
                    onClick={() => setTargetMode(item)}>
                    {item === "all" ? "All Users" : item === "include" ? "Only Specific Users" : "All Except Specific Users"}
                  </button>
                ))}
              </div>
              {targetMode === "all" ? <p className={styles.targetHint}>⚠ This will reach every active user on the platform.</p> : null}
            </div>

            {/* Include users */}
            {targetMode === "include" ? (
              <div className={styles.fieldFull}>
                <span className={styles.label}>Include users</span>
                <ChipTagInput mode="include" values={includeIds}
                  onAdd={(v) => addToList(v, "include")} onRemove={(v) => removeFromList(v, "include")}
                  suggestions={suggestions} suggestionOpen={suggestionMode === "include"}
                  loadingSuggestions={loadingSuggestions} lookup={includeLookup}
                  onLookupChange={setIncludeLookup}
                  onSuggestionClose={() => { setSuggestionMode(null); setSuggestions([]); }} />
              </div>
            ) : null}

            {/* Exclude users */}
            {targetMode === "exclude" ? (
              <div className={styles.fieldFull}>
                <span className={styles.label}>Exclude users</span>
                <ChipTagInput mode="exclude" values={excludeIds}
                  onAdd={(v) => addToList(v, "exclude")} onRemove={(v) => removeFromList(v, "exclude")}
                  suggestions={suggestions} suggestionOpen={suggestionMode === "exclude"}
                  loadingSuggestions={loadingSuggestions} lookup={excludeLookup}
                  onLookupChange={setExcludeLookup}
                  onSuggestionClose={() => { setSuggestionMode(null); setSuggestions([]); }} />
              </div>
            ) : null}
          </div>

          {error ? <p className={styles.error}>{error}</p> : null}

          <div className={styles.actions}>
            {!canSubmit && validationIssue
              ? <span className={styles.validationHint}>{validationIssue}</span>
              : null}
            <button type="button"
              className={`${styles.sendButton} ${level === "critical" ? styles.sendButtonCritical : ""}`}
              onClick={() => { if (!canSubmit) return; setConfirmOpen(true); setConfirmTyped(""); }}
              disabled={!canSubmit || submitting}>
              {submitting ? "Sending…" : scheduleEnabled ? "Schedule Broadcast" : "Send Broadcast Now"}
            </button>
          </div>
        </section>

        {/* ── History panel ── */}
        <section className={styles.panel}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Broadcast History</h2>
            <div className={styles.historyFilters}>
              {(["all", "info", "warning", "critical"] as const).map((item) => (
                <button key={item} type="button"
                  className={`${styles.filterChip} ${historyFilter === item ? styles.filterChipActive : ""}`}
                  onClick={() => setHistoryFilter(item)}>
                  {item === "all" ? "All" : levelLabel[item]}
                </button>
              ))}
            </div>
          </div>

          {loadingHistory && history.length === 0 ? <p className={styles.muted}>Loading history…</p> : null}
          {!loadingHistory && filteredHistory.length === 0 ? <p className={styles.muted}>No broadcasts yet.</p> : null}

          <div className={styles.historyList}>
            {filteredHistory.map((item) => {
              const deliveryRate = item.targetUserCount > 0
                ? Math.round((item.realtimeDeliveredCount / item.targetUserCount) * 100) : null;
              const isScheduled = item.scheduledAt && new Date(item.scheduledAt) > new Date();

              return (
                <article key={item.id} className={`${styles.historyCard} ${styles[`card_${item.level}`]}`}>
                  <div className={styles.historyHeader}>
                    <div>
                      <p className={styles.historyTitle}>{item.title || "No title"}</p>
                      <p className={styles.historyMeta}>
                        {isScheduled
                          ? `Scheduled for ${fmt(item.scheduledAt)}`
                          : `Sent ${fmt(item.createdAt)}`}
                        {" · by "}{item.admin.displayName || item.admin.email || item.admin.userId}
                      </p>
                    </div>
                    <div className={styles.historyBadges}>
                      {isScheduled ? <span className={styles.scheduledBadge}>Scheduled</span> : null}
                      <span className={`${styles.badge} ${styles[`badge_${item.level}`]}`}>{levelLabel[item.level]}</span>
                    </div>
                  </div>

                  <p className={styles.historyBody}>{item.body}</p>

                  <div className={styles.historyFooter}>
                    <span className={styles.statPill}>Target <strong>{targetModeLabel[item.targetMode]}</strong></span>
                    <span className={styles.statPill}>Targeted <strong>{item.targetUserCount.toLocaleString()}</strong></span>
                    {!isScheduled ? (
                      <span className={`${styles.statPill} ${styles.statPillDelivered}`}>
                        Delivered <strong>{item.realtimeDeliveredCount.toLocaleString()}{deliveryRate !== null ? ` (${deliveryRate}%)` : ""}</strong>
                      </span>
                    ) : null}
                    {item.includeCount > 0 ? <span className={styles.statPill}>Include <strong>{item.includeCount.toLocaleString()}</strong></span> : null}
                    {item.excludeCount > 0 ? <span className={styles.statPill}>Exclude <strong>{item.excludeCount.toLocaleString()}</strong></span> : null}
                    {item.actionUrl ? (
                      <a href={item.actionUrl} target="_blank" rel="noreferrer" className={styles.historyActionUrl}>Action URL ↗</a>
                    ) : null}
                    <button type="button" className={styles.resendBtn} onClick={() => handleResend(item)}>
                      Resend
                    </button>
                  </div>
                </article>
              );
            })}
          </div>

          {hasMoreHistory && historyFilter === "all" ? (
            <div className={styles.loadMoreWrap}>
              <button type="button" className={styles.loadMoreButton}
                onClick={() => void loadHistory(historyOffset, false)} disabled={loadingHistory}>
                {loadingHistory ? "Loading…" : "Load more"}
              </button>
            </div>
          ) : null}
        </section>
      </div>

      {/* ── Preview modal ── */}
      {previewOpen ? (
        <div className={styles.confirmOverlay} onClick={() => setPreviewOpen(false)}>
          <div className={styles.previewCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.previewModalHeader}>
              <p className={styles.confirmTitle}>Notification Preview</p>
              <button type="button" className={styles.previewCloseBtn} onClick={() => setPreviewOpen(false)}>×</button>
            </div>

            {/* Push notification mock */}
            <div className={styles.previewSection}>
              <p className={styles.previewSectionLabel}>Push Notification</p>
              <div className={styles.pushMock}>
                <div className={styles.pushMockHeader}>
                  <div className={styles.pushMockAppRow}>
                    <span className={styles.pushMockIcon}>🔔</span>
                    <span className={styles.pushMockApp}>Cordigram</span>
                  </div>
                  <span className={styles.pushMockTime}>now</span>
                </div>
                <p className={styles.pushMockTitle}>{title.trim() || "(No title)"}</p>
                <p className={styles.pushMockBody}>{body.trim() || "(Empty message)"}</p>
              </div>
            </div>

            {/* In-app notification mock */}
            <div className={styles.previewSection}>
              <p className={styles.previewSectionLabel}>In-App Notification</p>
              <div className={`${styles.inAppMock} ${styles[`inApp_${level}`]}`}>
                <div className={`${styles.inAppDot} ${styles[`dot_${level}`]}`} />
                <div className={styles.inAppContent}>
                  <div className={styles.inAppTopRow}>
                    <span className={`${styles.badge} ${styles[`badge_${level}`]}`} style={{ fontSize: "9px" }}>
                      {levelLabel[level]}
                    </span>
                    {title.trim() ? <p className={styles.inAppTitle}>{title.trim()}</p> : null}
                  </div>
                  <p className={styles.inAppBody}>{body.trim() || "(Empty message)"}</p>
                  {actionUrl.trim() ? (
                    <p className={styles.inAppUrl}>🔗 {actionUrl.trim()}</p>
                  ) : null}
                </div>
              </div>
            </div>

            <p className={styles.previewNote}>
              This is a visual approximation. Actual appearance may vary by device and OS.
            </p>
          </div>
        </div>
      ) : null}

      {/* ── Confirm dialog ── */}
      {confirmOpen ? (
        <div className={styles.confirmOverlay} onClick={() => { if (submitting) return; setConfirmOpen(false); setConfirmTyped(""); }}>
          <div className={styles.confirmCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.confirmHeader}>
              <span className={`${styles.badge} ${styles[`badge_${level}`]}`}>{levelLabel[level]}</span>
              <p className={styles.confirmTitle}>
                {scheduleEnabled ? "Confirm scheduled broadcast" : "Confirm broadcast"}
              </p>
            </div>
            <div className={styles.confirmSummary}>
              <div className={styles.confirmRow}><span>Target</span><strong>{targetModeLabel[targetMode]}</strong></div>
              {targetMode === "include" ? <div className={styles.confirmRow}><span>Users</span><strong>{includeIds.length} selected</strong></div> : null}
              {targetMode === "exclude" ? <div className={styles.confirmRow}><span>Excluded</span><strong>{excludeIds.length} users</strong></div> : null}
              <div className={styles.confirmRow}><span>Severity</span><strong>{levelLabel[level]}</strong></div>
              {scheduleEnabled && scheduledAt
                ? <div className={styles.confirmRow}><span>Send at</span><strong>{new Date(scheduledAt).toLocaleString("vi-VN")}</strong></div>
                : null}
              {title.trim() ? <div className={styles.confirmRow}><span>Title</span><strong>{title.trim()}</strong></div> : null}
              <div className={styles.confirmMessage}><span>Message</span><p>{body.trim()}</p></div>
            </div>
            {level === "critical" ? (
              <div className={styles.confirmKeywordWrap}>
                <p className={styles.confirmKeywordHint}>Type <strong>SEND</strong> to confirm this critical broadcast</p>
                <input className={`${styles.input} ${styles.confirmKeywordInput}`} value={confirmTyped}
                  onChange={(e) => setConfirmTyped(e.target.value)} placeholder="SEND" autoFocus />
              </div>
            ) : null}
            <div className={styles.confirmActions}>
              <button type="button" className={styles.confirmSecondary}
                onClick={() => { setConfirmOpen(false); setConfirmTyped(""); }} disabled={submitting}>Cancel</button>
              <button type="button"
                className={`${styles.confirmPrimary} ${level === "critical" ? styles.confirmPrimaryCritical : ""}`}
                onClick={() => void handleSend()} disabled={submitting || !confirmReady}>
                {submitting ? "Sending…" : scheduleEnabled ? "Confirm Schedule" : "Confirm & Send"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Undo bar ── */}
      {undoState ? (
        <div className={styles.undoBar}>
          <svg className={styles.undoRing} viewBox="0 0 36 36" aria-hidden="true">
            <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(99,102,241,0.2)" strokeWidth="3" />
            <circle cx="18" cy="18" r="15" fill="none" stroke="#6366f1" strokeWidth="3"
              strokeDasharray={`${(2 * Math.PI * 15 * undoPct) / 100} 1000`}
              strokeLinecap="round"
              transform="rotate(-90 18 18)" />
          </svg>
          <span className={styles.undoCountdown}>{undoState.countdown}s</span>
          <p className={styles.undoMsg}>Broadcast sent successfully</p>
          <button type="button" className={styles.undoBtn}
            onClick={() => void handleUndo()} disabled={cancelling}>
            {cancelling ? "Cancelling…" : "Undo"}
          </button>
          <button type="button" className={styles.undoClose}
            onClick={() => { if (undoIntervalRef.current) clearInterval(undoIntervalRef.current); setUndoState(null); }}
            aria-label="Dismiss">×</button>
        </div>
      ) : null}

      {/* ── Toast ── */}
      {toast ? (
        <div className={`${styles.toast} ${toast.kind === "error" ? styles.toastError : ""}`}>{toast.msg}</div>
      ) : null}
    </div>
  );
}
