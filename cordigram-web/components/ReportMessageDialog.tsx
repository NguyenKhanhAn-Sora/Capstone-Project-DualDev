"use client";

import React, { useState } from "react";
import styles from "./ReportMessageDialog.module.css";

interface ReportMessageDialogProps {
  onSubmit: (reason: string, description?: string) => void;
  onClose: () => void;
}

const REPORT_REASONS = [
  "Spam",
  "Quấy rối",
  "Nội dung không phù hợp",
  "Thông tin sai lệch",
  "Lừa đảo",
  "Khác",
];

export default function ReportMessageDialog({
  onSubmit,
  onClose,
}: ReportMessageDialogProps) {
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
          <h2 className={styles.title}>Báo cáo tin nhắn</h2>
          <button className={styles.closeButton} onClick={onClose}>
            ✕
          </button>
        </div>

        <div className={styles.content}>
          <div className={styles.section}>
            <label className={styles.label}>Lý do báo cáo *</label>
            <div className={styles.reasonList}>
              {REPORT_REASONS.map((reason) => (
                <button
                  key={reason}
                  className={`${styles.reasonButton} ${
                    selectedReason === reason ? styles.selected : ""
                  }`}
                  onClick={() => setSelectedReason(reason)}
                >
                  {reason}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.section}>
            <label className={styles.label}>Mô tả chi tiết (tùy chọn)</label>
            <textarea
              className={styles.textarea}
              placeholder="Mô tả vấn đề bạn gặp phải..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
            />
          </div>
        </div>

        <div className={styles.footer}>
          <button className={styles.cancelButton} onClick={onClose}>
            Hủy
          </button>
          <button
            className={styles.submitButton}
            onClick={handleSubmit}
            disabled={!selectedReason}
          >
            Gửi báo cáo
          </button>
        </div>
      </div>
    </div>
  );
}
