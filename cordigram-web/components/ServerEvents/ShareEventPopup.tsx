"use client";

import React, { useState } from "react";
import styles from "./ShareEventPopup.module.css";

interface ShareEventPopupProps {
  isOpen: boolean;
  onClose: () => void;
  shareLink: string;
}

export default function ShareEventPopup({
  isOpen,
  onClose,
  shareLink,
}: ShareEventPopupProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error(e);
    }
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Đóng">
          ×
        </button>
        <div className={styles.iconWrap}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        </div>
        <h2 className={styles.title}>Sẵn sàng. Giờ thì hãy chia sẻ sự kiện!</h2>
        <p className={styles.desc}>
          Sao chép liên kết sự kiện bên dưới để mời mọi người tham gia sự kiện của bạn. Liên kết
          này cũng sẽ là liên kết mời vào máy chủ.
        </p>
        <div className={styles.linkWrap}>
          <input
            type="text"
            className={styles.linkInput}
            readOnly
            value={shareLink}
          />
          <button
            type="button"
            className={`${styles.copyBtn} ${copied ? styles.copied : ""}`}
            onClick={handleCopy}
          >
            {copied ? "Đã sao chép" : "Sao chép"}
          </button>
        </div>
        <p className={styles.expireNote}>Link mời của bạn sẽ hết hạn sau 7 ngày.</p>
      </div>
    </div>
  );
}
