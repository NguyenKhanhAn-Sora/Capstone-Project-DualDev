"use client";

import styles from "./mute-picker-overlay.module.css";
import { DateSelect } from "@/ui/date-select/date-select";
import { TimeSelect } from "@/ui/time-select/time-select";

export type MuteOption = {
  key: string;
  label: string;
  ms: number | null;
};

type Props = {
  open: boolean;
  closing?: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  options: MuteOption[];
  selected: string;
  onSelect: (key: string) => void;
  customDate: string;
  onCustomDateChange: (value: string) => void;
  customTime: string;
  onCustomTimeChange: (value: string) => void;
  onSave: () => void;
  submitting?: boolean;
  error?: string;
  labelSave?: string;
  labelSaving?: string;
  labelDate?: string;
  labelTime?: string;
};

export const DEFAULT_MUTE_OPTIONS: MuteOption[] = [
  { key: "5m",    label: "5 minutes",            ms: 5 * 60 * 1000 },
  { key: "10m",   label: "10 minutes",           ms: 10 * 60 * 1000 },
  { key: "15m",   label: "15 minutes",           ms: 15 * 60 * 1000 },
  { key: "30m",   label: "30 minutes",           ms: 30 * 60 * 1000 },
  { key: "1h",    label: "1 hour",               ms: 60 * 60 * 1000 },
  { key: "1d",    label: "1 day",                ms: 24 * 60 * 60 * 1000 },
  { key: "until", label: "Until I turn it back on", ms: null },
  { key: "custom",label: "Choose date & time",   ms: null },
];

export default function MutePickerOverlay({
  open,
  closing = false,
  onClose,
  title = "Mute notifications",
  subtitle = "Choose how long to pause alerts for this post.",
  options,
  selected,
  onSelect,
  customDate,
  onCustomDateChange,
  customTime,
  onCustomTimeChange,
  onSave,
  submitting = false,
  error,
  labelSave = "Save",
  labelSaving = "Saving...",
  labelDate = "Date",
  labelTime = "Time",
}: Props) {
  if (!open) return null;

  return (
    <div
      className={`${styles.backdrop} ${closing ? styles.backdropClosing : ""}`}
      role="dialog"
      aria-modal="true"
      onClick={(e) => { e.stopPropagation(); onClose(); }}
    >
      <div
        className={`${styles.card} ${closing ? styles.cardClosing : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <div>
            <h3 className={styles.title}>{title}</h3>
            {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
          </div>
          <button className={styles.closeBtn} aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className={styles.optionGrid}>
          {options.map((opt) => (
            <button
              key={opt.key}
              type="button"
              className={`${styles.optionBtn} ${selected === opt.key ? styles.optionBtnActive : ""}`}
              onClick={() => onSelect(opt.key)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {selected === "custom" ? (
          <div className={styles.customRow}>
            <div className={styles.pickerGroup}>
              <span className={styles.pickerLabel}>{labelDate}</span>
              <DateSelect
                value={customDate}
                onChange={onCustomDateChange}
                minDate={new Date()}
                maxDate={null}
                placeholder="yyyy-mm-dd"
              />
            </div>
            <div className={styles.pickerGroup}>
              <span className={styles.pickerLabel}>{labelTime}</span>
              <TimeSelect
                value={customTime}
                onChange={onCustomTimeChange}
                selectedDate={customDate}
                minDateTime={new Date()}
                disabled={!customDate}
                placeholder="hh:mm"
              />
            </div>
          </div>
        ) : null}

        {error ? <div className={styles.error}>{error}</div> : null}

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.btnSave}
            onClick={onSave}
            disabled={submitting}
          >
            {submitting ? labelSaving : labelSave}
          </button>
        </div>
      </div>
    </div>
  );
}
