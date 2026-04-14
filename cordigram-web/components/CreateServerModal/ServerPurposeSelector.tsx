"use client";

import React from "react";
import styles from "./ServerPurposeSelector.module.css";
import { type ServerPurpose } from "@/lib/servers-api";
import { useLanguage } from "@/component/language-provider";

interface ServerPurposeSelectorProps {
  onSelectPurpose: (purpose: ServerPurpose) => void;
  onBack: () => void;
}

const purposes: Array<{ id: ServerPurpose; icon: string }> = [
  { id: "club-community", icon: "🌍" },
  { id: "me-and-friends", icon: "👥" },
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
            <span className={styles.purposeIcon}>{purpose.icon}</span>
            <span className={styles.purposeName}>
              {t(`chat.createServer.purpose.items.${purpose.id}`)}
            </span>
            <span className={styles.arrow}>›</span>
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
