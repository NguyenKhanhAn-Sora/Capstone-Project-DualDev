"use client";

import React from "react";
import styles from "./ModeratorViewToggle.module.css";
import { useLanguage } from "@/component/language-provider";

interface ModeratorViewToggleProps {
  enabled: boolean;
  canEnable: boolean;
  onChange: (next: boolean) => void;
}

export default function ModeratorViewToggle({
  enabled,
  canEnable,
  onChange,
}: ModeratorViewToggleProps) {
  const { t } = useLanguage();
  return (
    <div className={styles.container}>
      <label className={styles.label}>
        <span className={styles.title}>{t("chat.serverMembers.moderatorViewTitle")}</span>
        <span className={styles.subtitle}>
          {t("chat.serverMembers.moderatorViewDesc")}
        </span>
      </label>
      <button
        type="button"
        className={`${styles.toggle} ${enabled ? styles.toggleOn : styles.toggleOff} ${
          !canEnable ? styles.toggleDisabled : ""
        }`}
        onClick={() => canEnable && onChange(!enabled)}
        disabled={!canEnable}
        aria-pressed={enabled}
      >
        <span className={styles.knob} />
      </button>
      {!canEnable && (
        <div className={styles.hint}>
          {t("chat.serverMembers.moderatorViewPermissionHint")}
        </div>
      )}
    </div>
  );
}

