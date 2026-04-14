"use client";

import React from "react";
import styles from "./ModeratorViewToggle.module.css";

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
  return (
    <div className={styles.container}>
      <label className={styles.label}>
        <span className={styles.title}>Chế độ hiển thị Mod</span>
        <span className={styles.subtitle}>
          Khi bật, danh sách thành viên sẽ hiển thị thêm cột thông tin cho kiểm duyệt viên.
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
          Chỉ chủ máy chủ hoặc thành viên có quyền quản lý thành viên mới bật được chế độ này.
        </div>
      )}
    </div>
  );
}

