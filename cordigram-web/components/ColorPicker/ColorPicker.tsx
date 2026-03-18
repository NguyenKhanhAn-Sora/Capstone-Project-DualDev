"use client";

import React from "react";
import styles from "./ColorPicker.module.css";

const PRESET_COLORS = [
  "#99AAB5", // Default gray
  "#1ABC9C", "#2ECC71", "#3498DB", "#9B59B6", "#E91E63",
  "#F1C40F", "#E67E22", "#E74C3C", "#95A5A6", "#607D8B",
  "#11806A", "#1F8B4C", "#206694", "#71368A", "#AD1457",
  "#C27C0E", "#A84300", "#992D22", "#979C9F", "#546E7A",
];

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  disabled?: boolean;
}

export default function ColorPicker({
  value,
  onChange,
  disabled = false,
}: ColorPickerProps) {
  return (
    <div className={styles.container}>
      <div className={styles.presetColors}>
        {/* Custom color input */}
        <div className={styles.customColorWrapper}>
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={styles.customColorInput}
            disabled={disabled}
          />
          <div
            className={styles.customColorPreview}
            style={{ backgroundColor: value }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.66 3.42a.996.996 0 01.71.29l2.92 2.92a.996.996 0 010 1.41l-2.34 2.34-4.24-4.24 2.34-2.34a.996.996 0 01.61-.38zm-3.75 4.1l4.24 4.24L9.9 20H5.66v-4.24l8.25-8.24z" />
            </svg>
          </div>
        </div>

        {/* Preset colors */}
        {PRESET_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            className={`${styles.colorBtn} ${value === color ? styles.colorBtnActive : ""}`}
            style={{ backgroundColor: color }}
            onClick={() => onChange(color)}
            disabled={disabled}
            aria-label={`Chọn màu ${color}`}
          >
            {value === color && (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
              </svg>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
