"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./date-select.module.css";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";

function CalendarIcon() {
  return (
    <svg
      aria-hidden
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

type DateSelectProps = {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  disabled?: boolean;
  maxDate?: Date;
  minYear?: number;
};

type PopoverPos = {
  left: number;
  top?: number;
  bottom?: number;
  width: number;
  maxHeight: number;
};

const YEAR_PAGE_SIZE = 10;

const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));

export function DateSelect({
  value,
  onChange,
  placeholder = "mm/dd/yyyy",
  disabled = false,
  maxDate,
  minYear = 1,
}: DateSelectProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  const [open, setOpen] = useState(false);
  const [view, setView] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [pos, setPos] = useState<PopoverPos | null>(null);

  const maxAllowed = useMemo(() => {
    const dt = maxDate ? new Date(maxDate) : new Date();
    dt.setHours(0, 0, 0, 0);
    return dt;
  }, [maxDate]);

  const selected = useMemo(() => {
    if (!value) return null;
    const parts = value.split("-");
    if (parts.length !== 3) return null;
    const year = Number(parts[0]);
    const month = Number(parts[1]);
    const day = Number(parts[2]);
    if (!year || !month || !day) return null;
    const dt = new Date(year, month - 1, day);
    if (Number.isNaN(dt.getTime())) return null;
    return dt;
  }, [value]);

  const maxYear = maxAllowed.getFullYear();

  const shiftYearBy = (delta: number) => {
    setView((prev) => {
      const nextYear = clamp(prev.getFullYear() + delta, minYear, maxYear);
      const maxMonth =
        nextYear === maxAllowed.getFullYear() ? maxAllowed.getMonth() : 11;
      const nextMonth = Math.min(prev.getMonth(), maxMonth);
      return new Date(nextYear, nextMonth, 1);
    });
  };

  const yearOptions = useMemo(() => {
    const viewYear = view.getFullYear();

    const lastStart = Math.max(minYear, maxYear - (YEAR_PAGE_SIZE - 1));
    const centeredStart = clamp(
      viewYear - Math.floor(YEAR_PAGE_SIZE / 2),
      minYear,
      lastStart,
    );

    const ys = Array.from({ length: YEAR_PAGE_SIZE })
      .map((_, i) => centeredStart + i)
      .filter((y) => y >= minYear && y <= maxYear);
    return ys.sort((a, b) => b - a);
  }, [view, minYear, maxYear]);

  const computePosition = () => {
    const btn = buttonRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();

    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const width = rect.width;
    const left = clamp(rect.left, 8, Math.max(8, vw - 8 - width));

    const gap = 10;
    const viewportMargin = 12;

    const spaceBelow = vh - rect.bottom - gap - viewportMargin;
    const spaceAbove = rect.top - gap - viewportMargin;

    // Rough "ideal" height for header + weekdays + 6 rows + footer.
    // If one side can fit it, prefer that side to avoid needing scroll.
    const idealHeight = 420;
    const canShowBelow = spaceBelow >= idealHeight;
    const canShowAbove = spaceAbove >= idealHeight;

    const placeBelow =
      canShowBelow || (!canShowAbove && spaceBelow >= spaceAbove);

    if (placeBelow) {
      const top = rect.bottom + gap;
      const maxHeight = Math.max(0, vh - top - viewportMargin);
      setPos({ left, top, width, maxHeight, bottom: undefined });
      return;
    }

    const maxHeight = Math.max(0, rect.top - gap - viewportMargin);
    const bottom = vh - rect.top + gap;
    setPos({ left, bottom, width, maxHeight, top: undefined });
  };

  useEffect(() => {
    if (!open) return;

    const base = selected ?? maxAllowed;
    setView(new Date(base.getFullYear(), base.getMonth(), 1));
    computePosition();

    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const root = rootRef.current;
      const target = e.target as Node;
      if (!root) return;
      if (root.contains(target)) return;
      // menu is in portal, so check it by attribute
      const el = (e.target as HTMLElement | null)?.closest?.(
        "[data-date-select-portal='true']",
      );
      if (el) return;
      setOpen(false);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    const onWindowChange = () => computePosition();

    document.addEventListener("mousedown", onPointerDown, true);
    document.addEventListener("touchstart", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onWindowChange);
    window.addEventListener("scroll", onWindowChange, true);

    return () => {
      document.removeEventListener("mousedown", onPointerDown, true);
      document.removeEventListener("touchstart", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onWindowChange);
      window.removeEventListener("scroll", onWindowChange, true);
    };
  }, [open, selected, maxAllowed]);

  const setValue = (next: string) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <div
      ref={rootRef}
      className={`${styles.root} ${open ? styles.rootOpen : ""}`}
    >
      <button
        ref={buttonRef}
        type="button"
        className={styles.button}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={selected ? styles.valueText : styles.valuePlaceholder}>
          {selected ? format(selected, "MM/dd/yyyy") : placeholder}
        </span>
        <span className={styles.icon} aria-hidden>
          <CalendarIcon />
        </span>
        <span className={styles.chevron} aria-hidden />
      </button>

      {open && pos
        ? createPortal(
            <div
              data-date-select-portal="true"
              className={styles.popover}
              role="dialog"
              style={{
                left: pos.left,
                top: pos.top,
                bottom: pos.bottom,
                width: pos.width,
                maxHeight: pos.maxHeight,
                overflow: "auto",
              }}
            >
              <div className={styles.header}>
                <button
                  type="button"
                  className={styles.navButton}
                  aria-label="Previous month"
                  onClick={() => setView((prev) => subMonths(prev, 1))}
                >
                  ‹
                </button>

                <div className={styles.headerControls}>
                  <select
                    className={styles.headerSelect}
                    value={view.getMonth()}
                    aria-label="Month"
                    onChange={(e) => {
                      const month = Number(e.target.value);
                      setView((prev) => {
                        const nextYear = prev.getFullYear();
                        const maxMonth =
                          nextYear === maxAllowed.getFullYear()
                            ? maxAllowed.getMonth()
                            : 11;
                        const nextMonth = Math.min(month, maxMonth);
                        return new Date(nextYear, nextMonth, 1);
                      });
                    }}
                  >
                    {Array.from({ length: 12 }).map((_, idx) => {
                      const maxMonth =
                        view.getFullYear() === maxAllowed.getFullYear()
                          ? maxAllowed.getMonth()
                          : 11;
                      const disabledMonth = idx > maxMonth;
                      return (
                        <option key={idx} value={idx} disabled={disabledMonth}>
                          {format(new Date(2000, idx, 1), "MMMM")}
                        </option>
                      );
                    })}
                  </select>
                  <select
                    className={styles.headerSelect}
                    value={view.getFullYear()}
                    aria-label="Year"
                    onChange={(e) => {
                      const nextYear = Number(e.target.value);
                      if (!Number.isFinite(nextYear)) return;
                      const clamped = Math.min(
                        Math.max(minYear, nextYear),
                        maxYear,
                      );
                      setView((prev) => {
                        const maxMonth =
                          clamped === maxAllowed.getFullYear()
                            ? maxAllowed.getMonth()
                            : 11;
                        const nextMonth = Math.min(prev.getMonth(), maxMonth);
                        return new Date(clamped, nextMonth, 1);
                      });
                    }}
                  >
                    {yearOptions.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  className={styles.navButton}
                  aria-label="Next month"
                  onClick={() => setView((prev) => addMonths(prev, 1))}
                  disabled={
                    startOfMonth(addMonths(view, 1)) > startOfMonth(maxAllowed)
                  }
                >
                  ›
                </button>
              </div>

              <div className={styles.weekdays} aria-hidden>
                {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
                  <div key={d} className={styles.weekday}>
                    {d}
                  </div>
                ))}
              </div>

              <div className={styles.grid}>
                {eachDayOfInterval({
                  start: startOfWeek(startOfMonth(view), { weekStartsOn: 0 }),
                  end: endOfWeek(endOfMonth(view), { weekStartsOn: 0 }),
                }).map((day) => {
                  const inMonth = isSameMonth(day, view);
                  const isSelected = selected && isSameDay(day, selected);
                  const isToday = isSameDay(day, new Date());
                  const isDisabled = day > maxAllowed;

                  return (
                    <button
                      key={day.toISOString()}
                      type="button"
                      className={`${styles.cell} ${
                        !inMonth ? styles.cellOutside : ""
                      } ${isSelected ? styles.cellSelected : ""} ${
                        isToday ? styles.cellToday : ""
                      } ${isDisabled ? styles.cellDisabled : ""}`}
                      disabled={isDisabled}
                      onClick={() => {
                        if (isDisabled) return;
                        setValue(format(day, "yyyy-MM-dd"));
                      }}
                    >
                      {day.getDate()}
                    </button>
                  );
                })}
              </div>

              <div className={styles.footer}>
                <button
                  type="button"
                  className={styles.footerButton}
                  onClick={() => setValue("")}
                >
                  Clear
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
