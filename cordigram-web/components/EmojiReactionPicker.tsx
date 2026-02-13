"use client";

import React, { useState, useEffect, useRef } from "react";
import styles from "./EmojiReactionPicker.module.css";

// Main 6 emotions
const MAIN_EMOTIONS = ["❤️", "😆", "😮", "😢", "😡", "👍"];

// Additional emojis organized by category
const EMOJI_CATEGORIES = {
  "Cảm xúc của bạn": ["❤️", "😆", "😮", "😢", "😡", "👍"],
  "Mặt cười và hình người": [
    "😀", "😃", "😄", "😁", "😅", "😂",
    "🤣", "😊", "😇", "🙂", "🙃", "😉",
    "😌", "😍", "🥰", "😘", "😗", "😙",
    "😚", "😋", "😛", "😝", "😜", "🤪"
  ],
  "Cảm xúc": [
    "🤔", "🤨", "😐", "😑", "😶", "🙄",
    "😏", "😣", "😥", "😮", "🤐", "😯",
    "😪", "😫", "😴", "😌", "😛", "😜",
    "😝", "🤤", "😒", "😓", "😔", "😕"
  ],
  "Trái tim": [
    "❤️", "🧡", "💛", "💚", "💙", "💜",
    "🖤", "🤍", "🤎", "💔", "❤️‍🔥", "❤️‍🩹",
    "💖", "💗", "💓", "💞", "💕", "💘"
  ],
  "Bàn tay": [
    "👍", "👎", "👌", "✌️", "🤞", "🤟",
    "🤘", "🤙", "👈", "👉", "👆", "👇",
    "☝️", "✋", "🤚", "🖐️", "🖖", "👋",
    "🤝", "👏", "🙌", "👐", "🤲", "🙏"
  ],
  "Động vật": [
    "🐶", "🐱", "🐭", "🐹", "🐰", "🦊",
    "🐻", "🐼", "🐨", "🐯", "🦁", "🐮",
    "🐷", "🐸", "🐵", "🐔", "🐧", "🐦"
  ],
  "Thức ăn": [
    "🍎", "🍊", "🍋", "🍌", "🍉", "🍇",
    "🍓", "🍒", "🍑", "🥝", "🍅", "🥥",
    "🥑", "🍆", "🌽", "🥕", "🥒", "🥦"
  ],
};

interface EmojiReactionPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
  position?: { top?: number; bottom?: number; left?: number; right?: number };
}

export default function EmojiReactionPicker({
  onSelect,
  onClose,
  position,
}: EmojiReactionPickerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        pickerRef.current &&
        !pickerRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  const handleEmojiSelect = (emoji: string) => {
    onSelect(emoji);
    onClose();
  };

  const getFilteredEmojis = () => {
    if (!searchQuery.trim()) {
      return activeCategory ? EMOJI_CATEGORIES[activeCategory] : [];
    }

    // Filter all emojis based on search
    const allEmojis = Object.values(EMOJI_CATEGORIES).flat();
    return allEmojis.filter((emoji) => emoji.includes(searchQuery));
  };

  const displayEmojis = activeCategory
    ? getFilteredEmojis()
    : MAIN_EMOTIONS;

  return (
    <div
      className={styles.overlay}
      style={position}
    >
      <div className={styles.picker} ref={pickerRef}>
        <div className={styles.header}>
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Tìm kiếm biểu tượng cảm xúc"
            className={styles.searchInput}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {!activeCategory && !searchQuery && (
          <div className={styles.mainEmotions}>
            <div className={styles.categoryTitle}>Cảm xúc của bạn</div>
            <div className={styles.customizeButton}>Tùy chỉnh</div>
          </div>
        )}

        <div className={styles.emojiGrid}>
          {displayEmojis.map((emoji, index) => (
            <button
              key={index}
              className={styles.emojiButton}
              onClick={() => handleEmojiSelect(emoji)}
            >
              {emoji}
            </button>
          ))}
        </div>

        {!searchQuery && (
          <div className={styles.categories}>
            {Object.keys(EMOJI_CATEGORIES).map((category) => (
              <button
                key={category}
                className={`${styles.categoryButton} ${
                  activeCategory === category ? styles.active : ""
                }`}
                onClick={() =>
                  setActiveCategory(
                    activeCategory === category ? null : category
                  )
                }
              >
                {category === "Cảm xúc của bạn" && "😊"}
                {category === "Mặt cười và hình người" && "😀"}
                {category === "Cảm xúc" && "😢"}
                {category === "Trái tim" && "❤️"}
                {category === "Bàn tay" && "👋"}
                {category === "Động vật" && "🐶"}
                {category === "Thức ăn" && "🍎"}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
