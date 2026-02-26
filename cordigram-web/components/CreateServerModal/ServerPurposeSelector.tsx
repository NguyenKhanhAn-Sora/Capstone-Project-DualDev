"use client";

import React from "react";
import styles from "./ServerPurposeSelector.module.css";
import { type ServerPurpose } from "@/lib/servers-api";

interface ServerPurposeSelectorProps {
  onSelectPurpose: (purpose: ServerPurpose) => void;
  onBack: () => void;
}

const purposes = [
  {
    id: "club-community" as ServerPurpose,
    name: "Dành cho một câu lạc bộ hoặc cộng đồng",
    icon: "🌍",
  },
  {
    id: "me-and-friends" as ServerPurpose,
    name: "Dành cho tôi và bạn bè tôi",
    icon: "👥",
  },
];

export default function ServerPurposeSelector({
  onSelectPurpose,
  onBack,
}: ServerPurposeSelectorProps) {
  return (
    <div className={styles.container}>
      <h2 className={styles.title}>Cho chúng tôi biết thêm về máy chủ của bạn</h2>
      <p className={styles.subtitle}>
        Để giúp bạn thiết lập, máy chủ mới của bạn chỉ dành cho một vài người
        bạn hay cho một cộng đồng lớn hơn?
      </p>

      <div className={styles.purposeList}>
        {purposes.map((purpose) => (
          <button
            key={purpose.id}
            className={styles.purposeButton}
            onClick={() => onSelectPurpose(purpose.id)}
          >
            <span className={styles.purposeIcon}>{purpose.icon}</span>
            <span className={styles.purposeName}>{purpose.name}</span>
            <span className={styles.arrow}>›</span>
          </button>
        ))}
      </div>

      <div className={styles.footer}>
        <p className={styles.footerText}>
          Bạn không chắc? Bạn có thể tạm thời{" "}
          <button className={styles.skipLink}>bỏ qua câu hỏi này</button>.
        </p>
        <button className={styles.backButton} onClick={onBack}>
          Trở lại
        </button>
      </div>
    </div>
  );
}
