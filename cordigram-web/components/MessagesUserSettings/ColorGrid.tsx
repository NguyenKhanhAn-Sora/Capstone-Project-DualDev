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
  selectedColor: string;
  disabled?: boolean;
  onSelect: (color: string) => void;
};

export default function ColorGrid({ options, selectedColor, disabled, onSelect }: Props) {
  return (
    <div className={`${modalStyles.appearanceBgSwatches} ${disabled ? styles.lockedGrid : ""}`}>
      {options.map((option) => {
        const active = selectedColor.toUpperCase() === option.color.toUpperCase();
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
