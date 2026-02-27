"use client";

import React from "react";
import styles from "./QuickReactionBar.module.css";

const MAIN_EMOTIONS = ["❤️", "😆", "😮", "😢", "😡", "👍"];

interface QuickReactionBarProps {
  onReactionSelect: (emoji: string) => void;
  onMoreClick: () => void;
  onReplyClick: () => void;
  onMenuClick: () => void;
  position?: { top?: number; bottom?: number; left?: number; right?: number };
}

export default function QuickReactionBar({
  onReactionSelect,
  onMoreClick,
  onReplyClick,
  onMenuClick,
  position,
}: QuickReactionBarProps) {
  return (
    <div className={styles.container} style={position}>
      <div className={styles.bar}>
        {/* Reactions */}
        <div className={styles.reactions}>
          {MAIN_EMOTIONS.map((emoji) => (
            <button
              key={emoji}
              className={styles.emojiButton}
              onClick={() => onReactionSelect(emoji)}
              title={`Bày tỏ cảm xúc ${emoji}`}
            >
              {emoji}
            </button>
          ))}
          <button
            className={styles.addButton}
            onClick={onMoreClick}
            title="Thêm cảm xúc"
          >
            +
          </button>
        </div>

        {/* Action buttons */}
        <div className={styles.actions}>
          <button
            className={styles.actionButton}
            onClick={onReplyClick}
            title="Trả lời"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M9 12L5 8M5 8L9 4M5 8H15C17.7614 8 20 10.2386 20 13V16"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button
            className={styles.actionButton}
            onClick={onMenuClick}
            title="Thêm"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <circle cx="12" cy="6" r="1.5" fill="currentColor" />
              <circle cx="12" cy="12" r="1.5" fill="currentColor" />
              <circle cx="12" cy="18" r="1.5" fill="currentColor" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
