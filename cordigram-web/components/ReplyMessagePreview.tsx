"use client";

import React from "react";
import styles from "./ReplyMessagePreview.module.css";

interface ReplyMessagePreviewProps {
  message: {
    id: string;
    text: string;
    senderDisplayName?: string;
    senderName?: string;
    messageType?: "text" | "gif" | "sticker" | "voice";
  };
  headerText?: string;
  onClose: () => void;
}

export default function ReplyMessagePreview({
  message,
  headerText,
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
          <span className={styles.label}>
            {headerText || "Đang trả lời"}
          </span>
          {!headerText && (message.senderDisplayName || message.senderName) && (
            <span className={styles.senderName}>
              {message.senderDisplayName || message.senderName}
            </span>
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
