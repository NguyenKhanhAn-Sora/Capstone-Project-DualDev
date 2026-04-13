"use client";

import React, { useState } from "react";
import styles from "./ReportMessageDialog.module.css";
import { useLanguage } from "@/component/language-provider";

interface ReportMessageDialogProps {
  onSubmit: (reason: string, description?: string) => void;
  onClose: () => void;
}

const REPORT_REASON_KEYS = [
  "spam",
  "harassment",
  "inappropriate",
  "misinfo",
  "scam",
  "other",
] as const;

export default function ReportMessageDialog({
  onSubmit,
  onClose,
}: ReportMessageDialogProps) {
  const { t } = useLanguage();
  const [selectedReason, setSelectedReason] = useState<string>("");
  const [description, setDescription] = useState("");

  const handleSubmit = () => {
    if (selectedReason) {
      onSubmit(selectedReason, description || undefined);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>{t("chat.reportMessage.title")}</h2>
          <button className={styles.closeButton} onClick={onClose}>
            ✕
          </button>
        </div>

        <div className={styles.content}>
          <div className={styles.section}>
            <label className={styles.label}>
              {t("chat.reportMessage.reasonLabel")}
            </label>
            <div className={styles.reasonList}>
              {REPORT_REASON_KEYS.map((key) => {
                const reason = t(`chat.reportMessage.reasons.${key}`);
                return (
                <button
                  key={key}
                  className={`${styles.reasonButton} ${
                    selectedReason === reason ? styles.selected : ""
                  }`}
                  onClick={() => setSelectedReason(reason)}
                >
                  {reason}
                </button>
              );
              })}
            </div>
          </div>

          <div className={styles.section}>
            <label className={styles.label}>
              {t("chat.reportMessage.descriptionLabel")}
            </label>
            <textarea
              className={styles.textarea}
              placeholder={t("chat.reportMessage.descriptionPlaceholder")}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
            />
          </div>
        </div>

        <div className={styles.footer}>
          <button className={styles.cancelButton} onClick={onClose}>
            {t("chat.common.cancel")}
          </button>
          <button
            className={styles.submitButton}
            onClick={handleSubmit}
            disabled={!selectedReason}
          >
            {t("chat.reportMessage.submit")}
          </button>
        </div>
      </div>
    </div>
  );
}
