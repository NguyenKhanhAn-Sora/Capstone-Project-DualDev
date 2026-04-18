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
  maxDate?: Date | null;
  minDate?: Date | null;
  minYear?: number;
};

type PopoverPos = {
  left: number;
  top?: number;
  bottom?: number;
  width: number;
  maxHeight: number;
};

const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));

export function DateSelect({
  value,
  onChange,
  placeholder = "mm/dd/yyyy",
  disabled = false,
  maxDate,
  minDate,
  minYear = 1900,
}: DateSelectProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const monthShellRef = useRef<HTMLDivElement | null>(null);
  const activeMonthRef = useRef<HTMLButtonElement | null>(null);
  const yearShellRef = useRef<HTMLDivElement | null>(null);
  const activeYearRef = useRef<HTMLButtonElement | null>(null);

  const [open, setOpen] = useState(false);
  const [monthMenuOpen, setMonthMenuOpen] = useState(false);
  const [yearMenuOpen, setYearMenuOpen] = useState(false);
  const [view, setView] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [pos, setPos] = useState<PopoverPos | null>(null);

  const monthMenuOpenRef = useRef(false);
  useEffect(() => {
    monthMenuOpenRef.current = monthMenuOpen;
  }, [monthMenuOpen]);

  const yearMenuOpenRef = useRef(false);
  useEffect(() => {
    yearMenuOpenRef.current = yearMenuOpen;
  }, [yearMenuOpen]);

  const maxAllowed = useMemo(() => {
    if (maxDate === null) return null;
    const dt = maxDate ? new Date(maxDate) : new Date();
    dt.setHours(0, 0, 0, 0);
    return dt;
  }, [maxDate]);

  const minAllowed = useMemo(() => {
    if (minDate === null) return null;
    if (!minDate) return null;
    const dt = new Date(minDate);
    dt.setHours(0, 0, 0, 0);
    return dt;
  }, [minDate]);

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

  const maxYear = maxAllowed
    ? maxAllowed.getFullYear()
    : new Date().getFullYear() + 20;
  const minYearBound = Math.max(
    minYear,
    minAllowed ? minAllowed.getFullYear() : minYear,
  );

  const yearOptions = useMemo(() => {
    const ys: number[] = [];
    for (let y = maxYear; y >= minYearBound; y--) ys.push(y);
    return ys;
  }, [minYearBound, maxYear]);

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

    setMonthMenuOpen(false);
    setYearMenuOpen(false);

    const base = selected ?? minAllowed ?? maxAllowed ?? new Date();
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
      if (e.key !== "Escape") return;
      if (monthMenuOpenRef.current) {
        setMonthMenuOpen(false);
        return;
      }
      if (yearMenuOpenRef.current) {
        setYearMenuOpen(false);
        return;
      }
      setOpen(false);
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
  }, [open, selected, maxAllowed, minAllowed]);

  useEffect(() => {
    if (!monthMenuOpen) return;
    const id = window.requestAnimationFrame(() => {
      activeMonthRef.current?.scrollIntoView({ block: "center" });
    });
    return () => window.cancelAnimationFrame(id);
  }, [monthMenuOpen, view]);

  useEffect(() => {
    if (!yearMenuOpen) return;
    const id = window.requestAnimationFrame(() => {
      activeYearRef.current?.scrollIntoView({ block: "center" });
    });
    return () => window.cancelAnimationFrame(id);
  }, [yearMenuOpen, view]);

  const setActiveYearEl = (el: HTMLButtonElement | null) => {
    activeYearRef.current = el;
  };

  const setActiveMonthEl = (el: HTMLButtonElement | null) => {
    activeMonthRef.current = el;
  };

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
              onMouseDownCapture={(e) => {
                if (!monthMenuOpen && !yearMenuOpen) return;
                const target = e.target as Node;
                const monthShell = monthShellRef.current;
                const yearShell = yearShellRef.current;
                if (monthShell && monthShell.contains(target)) return;
                if (yearShell && yearShell.contains(target)) return;
                setMonthMenuOpen(false);
                setYearMenuOpen(false);
              }}
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
                  disabled={
                    minAllowed
                      ? startOfMonth(subMonths(view, 1)) <
                        startOfMonth(minAllowed)
                      : false
                  }
                >
                  ‹
                </button>

                <div className={styles.headerControls}>
                  <div className={styles.monthShell} ref={monthShellRef}>
                    <button
                      type="button"
                      className={`${styles.headerSelect} ${styles.monthButton}`}
                      aria-label="Month"
                      aria-haspopup="listbox"
                      aria-expanded={monthMenuOpen}
                      onClick={() => {
                        setYearMenuOpen(false);
                        setMonthMenuOpen((v) => !v);
                      }}
                    >
                      <span>
                        {format(new Date(2000, view.getMonth(), 1), "MMMM")}
                      </span>
                      <span className={styles.monthChevron} aria-hidden />
                    </button>

                    {monthMenuOpen ? (
                      <div
                        className={styles.monthMenu}
                        role="listbox"
                        aria-label="Month"
                      >
                        {Array.from({ length: 12 }).map((_, idx) => {
                          const maxMonth =
                            maxAllowed &&
                            view.getFullYear() === maxAllowed.getFullYear()
                              ? maxAllowed.getMonth()
                              : 11;
                          const minMonth =
                            minAllowed &&
                            view.getFullYear() === minAllowed.getFullYear()
                              ? minAllowed.getMonth()
                              : 0;
                          const disabledMonth =
                            idx > maxMonth || idx < minMonth;
                          const active = idx === view.getMonth();
                          const label = format(new Date(2000, idx, 1), "MMMM");

                          return (
                            <button
                              key={idx}
                              type="button"
                              ref={active ? setActiveMonthEl : undefined}
                              className={`${styles.monthOption} ${
                                active ? styles.monthOptionActive : ""
                              }`}
                              role="option"
                              aria-selected={active}
                              disabled={disabledMonth}
                              onClick={() => {
                                if (disabledMonth) return;
                                setView((prev) => {
                                  const nextYear = prev.getFullYear();
                                  const nextMonth = Math.min(
                                    Math.max(idx, minMonth),
                                    maxMonth,
                                  );
                                  return new Date(nextYear, nextMonth, 1);
                                });
                                setMonthMenuOpen(false);
                              }}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>

                  <div className={styles.yearShell} ref={yearShellRef}>
                    <button
                      type="button"
                      className={`${styles.headerSelect} ${styles.yearButton}`}
                      aria-label="Year"
                      aria-haspopup="listbox"
                      aria-expanded={yearMenuOpen}
                      onClick={() => {
                        setMonthMenuOpen(false);
                        setYearMenuOpen((v) => !v);
                      }}
                    >
                      <span>{view.getFullYear()}</span>
                      <span className={styles.yearChevron} aria-hidden />
                    </button>

                    {yearMenuOpen ? (
                      <div
                        className={styles.yearMenu}
                        role="listbox"
                        aria-label="Year"
                      >
                        {yearOptions.map((y) => {
                          const active = y === view.getFullYear();
                          const disabledYear =
                            (minAllowed && y < minAllowed.getFullYear()) ||
                            (maxAllowed && y > maxAllowed.getFullYear());
                          return (
                            <button
                              key={y}
                              type="button"
                              ref={active ? setActiveYearEl : undefined}
                              className={`${styles.yearOption} ${
                                active ? styles.yearOptionActive : ""
                              }`}
                              role="option"
                              aria-selected={active}
                              disabled={disabledYear ?? undefined}
                              onClick={() => {
                                if (disabledYear) return;
                                const clamped = Math.min(
                                  Math.max(minYearBound, y),
                                  maxYear,
                                );
                                setView((prev) => {
                                  const maxMonth =
                                    maxAllowed &&
                                    clamped === maxAllowed.getFullYear()
                                      ? maxAllowed.getMonth()
                                      : 11;
                                  const minMonth =
                                    minAllowed &&
                                    clamped === minAllowed.getFullYear()
                                      ? minAllowed.getMonth()
                                      : 0;
                                  const nextMonth = Math.min(
                                    Math.max(prev.getMonth(), minMonth),
                                    maxMonth,
                                  );
                                  return new Date(clamped, nextMonth, 1);
                                });
                                setYearMenuOpen(false);
                              }}
                            >
                              {y}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                </div>

                <button
                  type="button"
                  className={styles.navButton}
                  aria-label="Next month"
                  onClick={() => setView((prev) => addMonths(prev, 1))}
                  disabled={
                    maxAllowed
                      ? startOfMonth(addMonths(view, 1)) >
                        startOfMonth(maxAllowed)
                      : false
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
                  const isDisabled =
                    (maxAllowed ? day > maxAllowed : false) ||
                    (minAllowed ? day < minAllowed : false);

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
