"use client";

import React from "react";
import styles from "./ServerPurposeSelector.module.css";
import { type ServerPurpose } from "@/lib/servers-api";
import { useLanguage } from "@/component/language-provider";

interface ServerPurposeSelectorProps {
  onSelectPurpose: (purpose: ServerPurpose) => void;
  onBack: () => void;
}

const ChevronRight = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

const purposes: Array<{ id: ServerPurpose; color: string; icon: React.ReactNode }> = [
  {
    id: "club-community",
    color: "#3b82f6",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
    ),
  },
  {
    id: "me-and-friends",
    color: "#ec4899",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
];

export default function ServerPurposeSelector({
  onSelectPurpose,
  onBack,
}: ServerPurposeSelectorProps) {
  const { t } = useLanguage();
  return (
    <div className={styles.container}>
      <h2 className={styles.title}>{t("chat.createServer.purpose.title")}</h2>
      <p className={styles.subtitle}>{t("chat.createServer.purpose.subtitle")}</p>

      <div className={styles.purposeList}>
        {purposes.map((purpose) => (
          <button
            key={purpose.id}
            className={styles.purposeButton}
            onClick={() => onSelectPurpose(purpose.id)}
          >
            <span
              className={styles.purposeIcon}
              style={{ color: purpose.color, background: `${purpose.color}1a` }}
            >
              {purpose.icon}
            </span>
            <span className={styles.purposeName}>
              {t(`chat.createServer.purpose.items.${purpose.id}`)}
            </span>
            <span className={styles.arrow}>
              <ChevronRight />
            </span>
          </button>
        ))}
      </div>

      <div className={styles.footer}>
        <p className={styles.footerText}>
          {t("chat.createServer.purpose.notSure")}{" "}
          <button className={styles.skipLink}>
            {t("chat.createServer.purpose.skip")}
          </button>
          .
        </p>
        <button className={styles.backButton} onClick={onBack}>
          {t("chat.common.back")}
        </button>
      </div>
    </div>
  );
}
