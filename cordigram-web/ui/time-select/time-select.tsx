"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./time-select.module.css";

type TimeSelectProps = {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  selectedDate?: string;
  minDateTime?: Date;
  placeholder?: string;
};

const formatLocalDate = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const padTime = (value: number | string) => String(value).padStart(2, "0");

const splitTime = (value: string) => {
  if (!value) return { hour: "", minute: "" };
  const [hour = "", minute = ""] = value.split(":");
  return { hour: hour.slice(0, 2), minute: minute.slice(0, 2) };
};

export function TimeSelect({
  value,
  onChange,
  disabled = false,
  selectedDate,
  minDateTime,
  placeholder = "hh:mm",
}: TimeSelectProps) {
  const [hourOpen, setHourOpen] = useState(false);
  const [minuteOpen, setMinuteOpen] = useState(false);
  const hourRef = useRef<HTMLDivElement | null>(null);
  const minuteRef = useRef<HTMLDivElement | null>(null);

  const { hour, minute } = useMemo(() => splitTime(value), [value]);

  const minTime = useMemo(() => {
    if (!selectedDate || !minDateTime) return null;
    const minDateStr = formatLocalDate(minDateTime);
    if (selectedDate !== minDateStr) return null;
    return {
      hour: minDateTime.getHours(),
      minute: minDateTime.getMinutes(),
    };
  }, [selectedDate, minDateTime]);

  useEffect(() => {
    if (!hourOpen && !minuteOpen) return;

    const handleOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (hourRef.current?.contains(target)) return;
      if (minuteRef.current?.contains(target)) return;
      setHourOpen(false);
      setMinuteOpen(false);
    };

    document.addEventListener("mousedown", handleOutside, true);
    document.addEventListener("touchstart", handleOutside, true);
    return () => {
      document.removeEventListener("mousedown", handleOutside, true);
      document.removeEventListener("touchstart", handleOutside, true);
    };
  }, [hourOpen, minuteOpen]);

  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);
  const minutes = useMemo(() => Array.from({ length: 60 }, (_, i) => i), []);

  const hourNumber = hour ? Number(hour) : null;
  const minuteNumber = minute ? Number(minute) : null;

  const isHourDisabled = (candidate: number) =>
    minTime ? candidate < minTime.hour : false;

  const isMinuteDisabled = (candidate: number) => {
    if (!minTime) return false;
    if (hourNumber === null) return false;
    if (hourNumber > minTime.hour) return false;
    if (hourNumber < minTime.hour) return true;
    return candidate < minTime.minute;
  };

  const handleHourSelect = (candidate: number) => {
    if (disabled || isHourDisabled(candidate)) return;
    let nextMinute = minuteNumber ?? 0;
    if (minTime && candidate === minTime.hour && nextMinute < minTime.minute) {
      nextMinute = minTime.minute;
    }
    onChange(`${padTime(candidate)}:${padTime(nextMinute)}`);
    setHourOpen(false);
  };

  const handleMinuteSelect = (candidate: number) => {
    if (disabled || isMinuteDisabled(candidate)) return;
    let nextHour = hourNumber ?? 0;
    if (minTime && nextHour < minTime.hour) {
      nextHour = minTime.hour;
    }
    if (minTime && nextHour === minTime.hour && candidate < minTime.minute) {
      return;
    }
    onChange(`${padTime(nextHour)}:${padTime(candidate)}`);
    setMinuteOpen(false);
  };

  return (
    <div className={styles.root}>
      <div className={styles.group} aria-label={placeholder}>
        <div className={styles.shell} ref={hourRef}>
          <button
            type="button"
            className={styles.selectButton}
            onClick={() => {
              if (disabled) return;
              setMinuteOpen(false);
              setHourOpen((prev) => !prev);
            }}
            aria-haspopup="listbox"
            aria-expanded={hourOpen}
            disabled={disabled}
          >
            <span className={hour ? styles.valueText : styles.placeholderText}>
              {hour || "HH"}
            </span>
            <span className={styles.chevron} aria-hidden />
          </button>
          {hourOpen ? (
            <div className={styles.menu} role="listbox" aria-label="Hour">
              {hours.map((candidate) => {
                const disabledOption = isHourDisabled(candidate);
                const active = candidate === hourNumber;
                return (
                  <button
                    key={candidate}
                    type="button"
                    className={`${styles.option} ${
                      active ? styles.optionActive : ""
                    }`}
                    disabled={disabledOption}
                    aria-selected={active}
                    onClick={() => handleHourSelect(candidate)}
                  >
                    {padTime(candidate)}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>

        <span className={styles.separator}>:</span>

        <div className={styles.shell} ref={minuteRef}>
          <button
            type="button"
            className={styles.selectButton}
            onClick={() => {
              if (disabled) return;
              setHourOpen(false);
              setMinuteOpen((prev) => !prev);
            }}
            aria-haspopup="listbox"
            aria-expanded={minuteOpen}
            disabled={disabled}
          >
            <span
              className={minute ? styles.valueText : styles.placeholderText}
            >
              {minute || "MM"}
            </span>
            <span className={styles.chevron} aria-hidden />
          </button>
          {minuteOpen ? (
            <div className={styles.menu} role="listbox" aria-label="Minute">
              {minutes.map((candidate) => {
                const disabledOption = isMinuteDisabled(candidate);
                const active = candidate === minuteNumber;
                return (
                  <button
                    key={candidate}
                    type="button"
                    className={`${styles.option} ${
                      active ? styles.optionActive : ""
                    }`}
                    disabled={disabledOption}
                    aria-selected={active}
                    onClick={() => handleMinuteSelect(candidate)}
                  >
                    {padTime(candidate)}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
