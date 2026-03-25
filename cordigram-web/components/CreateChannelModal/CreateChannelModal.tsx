"use client";

import React, { useState, useEffect, useRef } from "react";
import styles from "./CreateChannelModal.module.css";
import ChatEmojiPicker from "@/components/ChatEmojiPicker/ChatEmojiPicker";

export type ChannelTypeForCreate = "text" | "voice";

interface CreateChannelModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultType?: ChannelTypeForCreate;
  onCreateChannel: (name: string, type: "text" | "voice", isPrivate: boolean) => Promise<void>;
}

export default function CreateChannelModal({
  isOpen,
  onClose,
  defaultType = "text",
  onCreateChannel,
}: CreateChannelModalProps) {
  const [channelType, setChannelType] = useState<ChannelTypeForCreate>(defaultType);
  const [channelName, setChannelName] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setChannelType(defaultType);
      setChannelName("");
      setIsPrivate(false);
      setShowEmojiPicker(false);
    }
  }, [isOpen, defaultType]);

  const insertText = (text: string) => {
    const input = inputRef.current;
    if (!input) return;
    const start = input.selectionStart ?? channelName.length;
    const end = input.selectionEnd ?? channelName.length;
    const newVal = channelName.slice(0, start) + text + channelName.slice(end);
    setChannelName(newVal);
    setShowEmojiPicker(false);
    setTimeout(() => {
      input.focus();
      input.setSelectionRange(start + text.length, start + text.length);
    }, 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = channelName.trim().replace(/^#\s*/, "") || "kênh-mới";
    if (!name) return;
    setIsSubmitting(true);
    try {
      await onCreateChannel(name, channelType, isPrivate);
      onClose();
    } catch (err) {
      console.error("Create channel failed:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Đóng">
          &times;
        </button>
        <form onSubmit={handleSubmit}>
          <h2 className={styles.title}>Tạo kênh</h2>

          <div className={styles.section}>
            <label className={styles.sectionLabel}>Loại Kênh</label>
            <div className={styles.typeOptions}>
              <label className={styles.typeOption}>
                <input
                  type="radio"
                  name="channelType"
                  value="text"
                  checked={channelType === "text"}
                  onChange={() => setChannelType("text")}
                />
                <span className={styles.typeIcon}>#</span>
                <div>
                  <span className={styles.typeName}>Văn bản</span>
                  <p className={styles.typeDesc}>Gửi tin nhắn, hình ảnh, ảnh GIF, emoji, ý kiến, và chơi chữ</p>
                </div>
              </label>
              <label className={styles.typeOption}>
                <input
                  type="radio"
                  name="channelType"
                  value="voice"
                  checked={channelType === "voice"}
                  onChange={() => setChannelType("voice")}
                />
                <span className={styles.typeIconVoice}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="23" stroke="currentColor" strokeWidth="2" />
                    <line x1="8" y1="23" x2="16" y2="23" stroke="currentColor" strokeWidth="2" />
                  </svg>
                </span>
                <div>
                  <span className={styles.typeName}>Giọ ng nói</span>
                  <p className={styles.typeDesc}>Cùng gặp mặt bằng gọi thoại, video, và chia sẻ màn hình</p>
                </div>
              </label>
            </div>
          </div>

          <div className={styles.section}>
            <label className={styles.sectionLabel}>Tên kênh</label>
            <div className={styles.nameInputWrap}>
              <span className={styles.namePrefix}>#</span>
              <input
                ref={inputRef}
                type="text"
                className={styles.nameInput}
                value={channelName}
                onChange={(e) => setChannelName(e.target.value)}
                placeholder="kênh-mới"
                maxLength={100}
              />
              <div className={styles.emojiWrapper}>
                <button
                  type="button"
                  className={styles.emojiBtn}
                  onClick={() => setShowEmojiPicker((p) => !p)}
                  title="Thêm emoji / kaomoji"
                >
                  &#128522;
                </button>
                {showEmojiPicker && (
                  <ChatEmojiPicker
                    onSelect={insertText}
                    onClose={() => setShowEmojiPicker(false)}
                    position="bottom"
                  />
                )}
              </div>
            </div>
          </div>

          <div className={styles.section}>
            <div className={styles.privateRow}>
              <div>
                <span className={styles.privateLabel}>Kênh Riêng</span>
                <p className={styles.privateDesc}>Chỉ có thành viên và vai trò được chọn mới có thể nhìn thấy kênh này.</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={isPrivate}
                className={`${styles.toggle} ${isPrivate ? styles.toggleOn : ""}`}
                onClick={() => setIsPrivate((p) => !p)}
              >
                <span className={styles.toggleThumb} />
              </button>
            </div>
          </div>

          <div className={styles.footer}>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>Hủy bỏ</button>
            <button type="submit" className={styles.submitBtn} disabled={isSubmitting}>
              {isSubmitting ? "Đang tạo..." : "Tạo kênh"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
