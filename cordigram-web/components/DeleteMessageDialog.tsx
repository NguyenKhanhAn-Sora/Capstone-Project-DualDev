"use client";

import React, { useState } from "react";
import styles from "./DeleteMessageDialog.module.css";
import { useLanguage } from "@/component/language-provider";

interface DeleteMessageDialogProps {
  onConfirm: (deleteType: "for-everyone" | "for-me") => void;
  onClose: () => void;
}

export default function DeleteMessageDialog({
  onConfirm,
  onClose,
}: DeleteMessageDialogProps) {
  const { t } = useLanguage();
  const [deleteType, setDeleteType] = useState<"for-everyone" | "for-me">(
    "for-everyone"
  );

  const handleConfirm = () => {
    onConfirm(deleteType);
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>
            {t("chat.deleteMessage.title")}
          </h2>
          <button className={styles.closeButton} onClick={onClose}>
            ✕
          </button>
        </div>

        <div className={styles.content}>
          <label className={styles.option}>
            <input
              type="radio"
              name="deleteType"
              value="for-everyone"
              checked={deleteType === "for-everyone"}
              onChange={() => setDeleteType("for-everyone")}
              className={styles.radio}
            />
            <div className={styles.optionContent}>
              <div className={styles.optionTitle}>
                {t("chat.deleteMessage.forEveryone.title")}
              </div>
              <div className={styles.optionDescription}>
                {t("chat.deleteMessage.forEveryone.desc")}
              </div>
            </div>
          </label>

          <label className={styles.option}>
            <input
              type="radio"
              name="deleteType"
              value="for-me"
              checked={deleteType === "for-me"}
              onChange={() => setDeleteType("for-me")}
              className={styles.radio}
            />
            <div className={styles.optionContent}>
              <div className={styles.optionTitle}>
                {t("chat.deleteMessage.forMe.title")}
              </div>
              <div className={styles.optionDescription}>
                {t("chat.deleteMessage.forMe.desc")}
              </div>
            </div>
          </label>
        </div>

        <div className={styles.footer}>
          <button className={styles.cancelButton} onClick={onClose}>
            {t("chat.common.cancel")}
          </button>
          <button className={styles.confirmButton} onClick={handleConfirm}>
            {t("chat.common.remove")}
          </button>
        </div>
      </div>
    </div>
  );
}
