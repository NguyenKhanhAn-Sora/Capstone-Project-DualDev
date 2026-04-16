"use client";

import React, { useRef } from "react";
import styles from "./ThemePanel.module.css";

type Props = {
  value: string;
  onChange: (color: string) => void;
};

export default function ColorPicker({ value, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className={styles.customWrap}>
      <button
        type="button"
        className={styles.customBtn}
        onClick={() => inputRef.current?.click()}
        title="Custom Color"
        aria-label="Custom Color"
      >
        +
      </button>
      <input
        ref={inputRef}
        type="color"
        value={value}
        style={{ position: "absolute", opacity: 0, pointerEvents: "none" }}
        onChange={(e) => onChange(e.target.value)}
      />
      <div className={styles.customLabel}>Custom Color</div>
    </div>
  );
}
