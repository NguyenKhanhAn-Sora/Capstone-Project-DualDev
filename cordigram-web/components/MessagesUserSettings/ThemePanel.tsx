"use client";

import React from "react";
import styles from "./ThemePanel.module.css";
import ColorGrid, { type AccentOption } from "./ColorGrid";
import ColorPicker from "./ColorPicker";
import { useLanguage } from "@/component/language-provider";

type Props = {
  accentColor: string;
  options: AccentOption[];
  onSelectColor: (color: string) => void;
  /** Không có Boost — khóa toàn bộ màu chủ đề tùy chỉnh. */
  locked: boolean;
  /** Đang chọn nền có sẵn → không highlight ô màu chủ đề. */
  showAccentSelection: boolean;
};

export default function ThemePanel({
  accentColor,
  options,
  onSelectColor,
  locked,
  showAccentSelection,
}: Props) {
  const { t } = useLanguage();
  const body = (
    <>
      <div className={styles.header}>
        <div>
          <div className={styles.title}>{t("settings.themeColors.title")}</div>
          <div className={styles.hint}>{t("settings.themeColors.hint")}</div>
        </div>
      </div>

      <ColorGrid
        options={options}
        selectedColor={!locked && showAccentSelection ? accentColor : null}
        disabled={locked}
        showActiveState={!locked && showAccentSelection}
        onSelect={onSelectColor}
      />

      <ColorPicker
        value={accentColor}
        onChange={onSelectColor}
        disabled={locked}
      />
    </>
  );

  if (locked) {
    return (
      <div className={`${styles.panel} ${styles.panelLocked}`}>
        <div className={styles.panelLockedInner}>{body}</div>
        <div className={styles.panelLockOverlay} aria-hidden>
          <p className={styles.panelLockMessage}>{t("settings.themeColors.lockedHint")}</p>
        </div>
      </div>
    );
  }

  return <div className={styles.panel}>{body}</div>;
}
