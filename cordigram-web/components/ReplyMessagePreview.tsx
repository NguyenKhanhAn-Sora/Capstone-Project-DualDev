"use client";

import React from "react";
import styles from "./ReplyMessagePreview.module.css";

interface ReplyMessagePreviewProps {
  message: {
    id: string;
    text: string;
    senderName?: string;
    messageType?: "text" | "gif" | "sticker" | "voice";
  };
  onClose: () => void;
}

export default function ReplyMessagePreview({
  message,
  onClose,
}: ReplyMessagePreviewProps) {
  const getPreviewText = () => {
    if (message.messageType === "gif") {
      return "GIF";
    }
    if (message.messageType === "sticker") {
      return "Sticker";
    }
    if (message.messageType === "voice") {
      return "Tin nhắn thoại";
    }
    return message.text.length > 100
      ? message.text.substring(0, 100) + "..."
      : message.text;
  };

  return (
    <div className={styles.container}>
      <div className={styles.replyLine} />
      <div className={styles.content}>
        <div className={styles.header}>
          <span className={styles.label}>Đang trả lời</span>
          {message.senderName && (
            <span className={styles.senderName}>{message.senderName}</span>
          )}
        </div>
        <div className={styles.previewText}>{getPreviewText()}</div>
      </div>
      <button className={styles.closeButton} onClick={onClose}>
        ✕
      </button>
    </div>
  );
}
