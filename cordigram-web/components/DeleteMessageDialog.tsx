"use client";

import React, { useState } from "react";
import styles from "./DeleteMessageDialog.module.css";

interface DeleteMessageDialogProps {
  onConfirm: (deleteType: "for-everyone" | "for-me") => void;
  onClose: () => void;
}

export default function DeleteMessageDialog({
  onConfirm,
  onClose,
}: DeleteMessageDialogProps) {
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
            Bạn muốn thu hồi tin nhắn này ở phía ai?
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
              <div className={styles.optionTitle}>Thu hồi với mọi người</div>
              <div className={styles.optionDescription}>
                Tin nhắn này sẽ bị thu hồi với mọi người trong đoạn chat. Những
                người khác có thể đã xem hoặc chuyển tiếp tin nhắn đó. Tin nhắn
                đã thu hồi vẫn có thể bị báo cáo.
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
              <div className={styles.optionTitle}>Thu hồi với bạn</div>
              <div className={styles.optionDescription}>
                Tin nhắn này sẽ bị gỡ khỏi thiết bị của bạn, nhưng vẫn hiển thị
                với các thành viên khác trong đoạn chat.
              </div>
            </div>
          </label>
        </div>

        <div className={styles.footer}>
          <button className={styles.cancelButton} onClick={onClose}>
            Hủy
          </button>
          <button className={styles.confirmButton} onClick={handleConfirm}>
            Gỡ
          </button>
        </div>
      </div>
    </div>
  );
}
