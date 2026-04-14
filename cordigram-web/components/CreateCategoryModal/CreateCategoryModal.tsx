"use client";

import React, { useState, useEffect, useRef } from "react";
import styles from "./CreateCategoryModal.module.css";
import ChatEmojiPicker from "@/components/ChatEmojiPicker/ChatEmojiPicker";
import { useLanguage } from "@/component/language-provider";

interface CreateCategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateCategory: (name: string, isPrivate: boolean) => Promise<void>;
}

export default function CreateCategoryModal({
  isOpen,
  onClose,
  onCreateCategory,
}: CreateCategoryModalProps) {
  const { t } = useLanguage();
  const [name, setName] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setName("");
      setIsPrivate(false);
      setShowEmojiPicker(false);
    }
  }, [isOpen]);

  const insertText = (text: string) => {
    const input = inputRef.current;
    if (!input) return;
    const start = input.selectionStart ?? name.length;
    const end = input.selectionEnd ?? name.length;
    const newVal = name.slice(0, start) + text + name.slice(end);
    setName(newVal);
    setShowEmojiPicker(false);
    setTimeout(() => {
      input.focus();
      input.setSelectionRange(start + text.length, start + text.length);
    }, 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim() || t("chat.popups.createCategory.defaultName");
    setIsSubmitting(true);
    try {
      await onCreateCategory(trimmed, isPrivate);
      onClose();
    } catch (err) {
      console.error("Create category failed:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button type="button" className={styles.closeBtn} onClick={onClose} aria-label={t("chat.popups.closeAria")}>
          &times;
        </button>
        <form onSubmit={handleSubmit}>
          <h2 className={styles.title}>{t("chat.popups.createCategory.title")}</h2>

          <div className={styles.section}>
            <label className={styles.label}>{t("chat.popups.createCategory.nameLabel")}</label>
            <div className={styles.inputWrap}>
              <input
                ref={inputRef}
                type="text"
                className={styles.input}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("chat.popups.createCategory.placeholder")}
                maxLength={100}
                autoFocus
              />
              <div className={styles.emojiWrapper}>
                <button
                  type="button"
                  className={styles.emojiBtn}
                  onClick={() => setShowEmojiPicker((p) => !p)}
                  title={t("chat.popups.createChannel.emojiTitle")}
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
                <span className={styles.privateLabel}>{t("chat.popups.createCategory.privateLabel")}</span>
                <p className={styles.privateDesc}>
                  {t("chat.popups.createCategory.privateDesc")}
                </p>
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
            <button type="button" className={styles.cancelBtn} onClick={onClose}>{t("chat.common.cancel")}</button>
            <button type="submit" className={styles.submitBtn} disabled={isSubmitting}>
              {isSubmitting ? t("chat.popups.createCategory.creating") : t("chat.popups.createCategory.createBtn")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
