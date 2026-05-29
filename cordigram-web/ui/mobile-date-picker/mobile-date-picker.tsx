"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { createPortal } from "react-dom";

type Props = {
  open: boolean;
  value: string; // "yyyy-MM-dd" hoặc ""
  onChange: (next: string) => void;
  onClose: () => void;
  maxDate?: Date;
  minYear?: number;
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAYS_SHORT = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const DAYS_FULL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function parseValue(value: string): Date | null {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d);
  return isNaN(dt.getTime()) ? null : dt;
}

function toIsoDate(dt: Date): string {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function buildCells(year: number, month: number): (number | null)[] {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = Array(firstDay).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  return cells;
}

export function MobileDatePicker({
  open,
  value,
  onChange,
  onClose,
  maxDate,
  minYear = 1900,
}: Props) {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const maxAllowed = useMemo(() => {
    const d = maxDate ? new Date(maxDate) : new Date(today);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [maxDate, today]);

  const maxYear = maxAllowed.getFullYear();

  const yearList = useMemo(() => {
    const years: number[] = [];
    for (let y = maxYear; y >= minYear; y--) years.push(y);
    return years;
  }, [maxYear, minYear]);

  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [tempSelected, setTempSelected] = useState<Date | null>(null);
  const [viewMode, setViewMode] = useState<"calendar" | "year">("calendar");
  const [mounted, setMounted] = useState(false);

  const yearScrollRef = useRef<HTMLDivElement | null>(null);
  const activeYearRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => { setMounted(true); }, []);

  // Sync khi picker mở
  useEffect(() => {
    if (!open) return;
    const base = parseValue(value) ?? today;
    setViewYear(base.getFullYear());
    setViewMonth(base.getMonth());
    setTempSelected(parseValue(value));
    setViewMode("calendar");
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll đến năm đang chọn khi mở year view
  useEffect(() => {
    if (viewMode !== "year") return;
    const id = window.requestAnimationFrame(() => {
      activeYearRef.current?.scrollIntoView({ block: "center", behavior: "instant" });
    });
    return () => window.cancelAnimationFrame(id);
  }, [viewMode]);

  if (!open || !mounted) return null;

  // ── Calendar view helpers ──────────────────────────────────────────────────

  const cells = buildCells(viewYear, viewMonth);

  const canGoPrev =
    viewYear > minYear || (viewYear === minYear && viewMonth > 0);

  const canGoNext = (() => {
    const nextM = viewMonth === 11 ? 0 : viewMonth + 1;
    const nextY = viewMonth === 11 ? viewYear + 1 : viewYear;
    const firstOfNext = new Date(nextY, nextM, 1);
    firstOfNext.setHours(0, 0, 0, 0);
    return firstOfNext <= new Date(maxAllowed.getFullYear(), maxAllowed.getMonth(), 1);
  })();

  const prevMonth = () => {
    if (!canGoPrev) return;
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  };

  const nextMonth = () => {
    if (!canGoNext) return;
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  };

  const handleDay = (day: number) => {
    const dt = new Date(viewYear, viewMonth, day);
    dt.setHours(0, 0, 0, 0);
    if (dt > maxAllowed) return;
    setTempSelected(dt);
  };

  const handleYearSelect = (year: number) => {
    setViewYear(year);
    // Clamp month nếu chọn năm hiện tại mà tháng vượt max
    if (year === maxAllowed.getFullYear() && viewMonth > maxAllowed.getMonth()) {
      setViewMonth(maxAllowed.getMonth());
    }
    setViewMode("calendar");
  };

  const handleOk = () => {
    if (!tempSelected) return;
    onChange(toIsoDate(tempSelected));
    onClose();
  };

  const headerLabel = tempSelected
    ? `${DAYS_FULL[tempSelected.getDay()]}, ${MONTHS[tempSelected.getMonth()].slice(0, 3)} ${tempSelected.getDate()}`
    : "—";

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center px-4"
      style={{ background: "rgba(15,23,42,0.5)" }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-[20px] w-full max-w-[340px] overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Blue header */}
        <div className="px-5 pt-5 pb-4" style={{ background: "#3470A2" }}>
          <p className="text-white/70 text-[11px] font-bold tracking-widest mb-1">SELECT DATE</p>
          <p className="text-white text-[26px] font-bold leading-tight">{headerLabel}</p>
        </div>

        {/* ── Month/Year nav bar ─────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 pt-3 pb-1">
          {viewMode === "calendar" ? (
            <>
              <button
                type="button"
                disabled={!canGoPrev}
                onClick={prevMonth}
                className="w-10 h-10 flex items-center justify-center rounded-full text-[#3470A2] text-[24px] font-bold disabled:opacity-30 active:bg-[#EAF3FA] transition-colors"
              >
                ‹
              </button>

              {/* Bấm vào đây để mở year picker */}
              <button
                type="button"
                onClick={() => setViewMode("year")}
                className="flex items-center gap-1 text-[14px] font-bold text-[#0F172A] hover:text-[#3470A2] transition-colors"
              >
                {MONTHS[viewMonth]} {viewYear}
                {/* chevron down */}
                <svg aria-hidden width={14} height={14} viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              <button
                type="button"
                disabled={!canGoNext}
                onClick={nextMonth}
                className="w-10 h-10 flex items-center justify-center rounded-full text-[#3470A2] text-[24px] font-bold disabled:opacity-30 active:bg-[#EAF3FA] transition-colors"
              >
                ›
              </button>
            </>
          ) : (
            /* Year mode title */
            <button
              type="button"
              onClick={() => setViewMode("calendar")}
              className="flex items-center gap-1 text-[14px] font-bold text-[#0F172A] hover:text-[#3470A2] transition-colors mx-auto"
            >
              Select year
              {/* chevron up */}
              <svg aria-hidden width={14} height={14} viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <polyline points="18 15 12 9 6 15" />
              </svg>
            </button>
          )}
        </div>

        {/* ── Calendar view ─────────────────────────────────────────────── */}
        {viewMode === "calendar" && (
          <>
            <div className="grid grid-cols-7 px-3 pb-1">
              {DAYS_SHORT.map((d) => (
                <span key={d} className="text-center text-[11px] font-bold text-[#94A3B8] py-1">
                  {d}
                </span>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-y-0.5 px-3 pb-3">
              {cells.map((day, idx) => {
                if (!day) return <span key={idx} />;
                const dt = new Date(viewYear, viewMonth, day);
                dt.setHours(0, 0, 0, 0);
                const isSelected =
                  !!tempSelected &&
                  tempSelected.getFullYear() === viewYear &&
                  tempSelected.getMonth() === viewMonth &&
                  tempSelected.getDate() === day;
                const isToday =
                  today.getFullYear() === viewYear &&
                  today.getMonth() === viewMonth &&
                  today.getDate() === day;
                const isDisabled = dt > maxAllowed;
                return (
                  <button
                    key={idx}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => handleDay(day)}
                    className={[
                      "w-9 h-9 mx-auto flex items-center justify-center rounded-full text-[13px] font-semibold transition-colors",
                      isSelected ? "text-white" : "",
                      isToday && !isSelected ? "border border-[#3470A2] text-[#3470A2]" : "",
                      !isSelected && !isToday ? "text-[#0F172A] hover:bg-[#EAF3FA]" : "",
                      isDisabled ? "opacity-25 cursor-not-allowed" : "",
                    ].join(" ")}
                    style={isSelected ? { background: "#3470A2" } : {}}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* ── Year picker view ──────────────────────────────────────────── */}
        {viewMode === "year" && (
          <div
            ref={yearScrollRef}
            className="grid grid-cols-3 gap-2 px-4 py-3 overflow-y-auto overscroll-contain"
            style={{ maxHeight: 252 }}
          >
            {yearList.map((year) => {
              const isActive = year === viewYear;
              return (
                <button
                  key={year}
                  type="button"
                  ref={isActive ? activeYearRef : undefined}
                  onClick={() => handleYearSelect(year)}
                  className={[
                    "h-9 rounded-full text-[13px] font-semibold transition-colors",
                    isActive
                      ? "text-white"
                      : "text-[#0F172A] hover:bg-[#EAF3FA]",
                  ].join(" ")}
                  style={isActive ? { background: "#3470A2" } : {}}
                >
                  {year}
                </button>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end gap-1 px-4 py-3 border-t border-[#F1F5F9]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-[#3470A2] font-semibold text-[14px] rounded-lg hover:bg-[#EAF3FA] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleOk}
            disabled={!tempSelected}
            className="px-4 py-2 text-[#3470A2] font-semibold text-[14px] rounded-lg hover:bg-[#EAF3FA] transition-colors disabled:opacity-30"
          >
            OK
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
