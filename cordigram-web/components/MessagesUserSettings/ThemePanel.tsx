"use client";

import React from "react";
import styles from "./ThemePanel.module.css";
import ColorGrid, { type AccentOption } from "./ColorGrid";
import ColorPicker from "./ColorPicker";

type Props = {
  unlocked: boolean;
  accentColor: string;
  options: AccentOption[];
  onSelectColor: (color: string) => void;
  onPreview: () => void;
  onUnlock: () => void;
};

export default function ThemePanel({
  unlocked,
  accentColor,
  options,
  onSelectColor,
  onPreview,
  onUnlock,
}: Props) {
  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div>
          <div className={styles.title}>Màu Sắc Chủ Đề</div>
          <div className={styles.hint}>
            Mở khóa thêm nhiều chủ đề khác với <span className={styles.hintAccent}>Boost</span>.
          </div>
        </div>
        {!unlocked ? (
          <div className={styles.actions}>
            <button type="button" className={styles.ghostBtn} onClick={onPreview}>
              Xem Trước Chủ Đề
            </button>
            <button type="button" className={styles.primaryBtn} onClick={onUnlock}>
              Mở khóa với Boost
            </button>
          </div>
        ) : null}
      </div>

      <ColorGrid
        options={options}
        selectedColor={accentColor}
        disabled={!unlocked}
        onSelect={onSelectColor}
      />

      {unlocked ? <ColorPicker value={accentColor} onChange={onSelectColor} /> : null}
    </div>
  );
}
