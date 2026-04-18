"use client";

import React from "react";
import styles from "./ThemePanel.module.css";
import modalStyles from "./MessagesUserSettingsModal.module.css";

export type AccentOption = {
  id: string;
  color: string;
  secondary?: string;
  label: string;
};

type Props = {
  options: AccentOption[];
  /** null = không highlight ô nào (đang dùng nền có sẵn). */
  selectedColor: string | null;
  disabled?: boolean;
  /** Khi false: không vẽ viền ✓ (chế độ đang dùng nền có sẵn). */
  showActiveState?: boolean;
  onSelect: (color: string) => void;
};

export default function ColorGrid({
  options,
  selectedColor,
  disabled,
  showActiveState = true,
  onSelect,
}: Props) {
  return (
    <div className={`${modalStyles.appearanceBgSwatches} ${disabled ? styles.lockedGrid : ""}`}>
      {options.map((option) => {
        const sel = selectedColor;
        const active =
          Boolean(showActiveState && sel) &&
          sel?.toUpperCase() === option.color.toUpperCase();
        return (
          <button
            key={option.id}
            type="button"
            className={`${modalStyles.appearanceBgSwatch} ${
              active ? modalStyles.appearanceBgSwatchActive : ""
            }`}
            title={option.label}
            disabled={disabled}
            aria-label={option.label}
            style={{
              background: option.secondary
                ? `linear-gradient(135deg, ${option.color}, ${option.secondary})`
                : option.color,
            }}
            onClick={() => onSelect(option.color)}
          >
            {active ? <span className={modalStyles.appearanceBgCustomIcon}>✓</span> : null}
          </button>
        );
      })}
    </div>
  );
}
