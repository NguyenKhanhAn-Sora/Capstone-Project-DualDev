"use client";

import React, { useState, useRef, useCallback } from "react";
import styles from "./EventImageEditor.module.css";
import { uploadMedia } from "@/lib/api";

interface EventImageEditorProps {
  isOpen: boolean;
  onClose: () => void;
  currentImageUrl: string | null;
  onConfirm: (imageUrl: string) => void;
}

export default function EventImageEditor({
  isOpen,
  onClose,
  currentImageUrl,
  onConfirm,
}: EventImageEditorProps) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentImageUrl);
  const [rotation, setRotation] = useState(0);
  const [scale, setScale] = useState(1);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f || !f.type.startsWith("image/")) return;
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
    setRotation(0);
    setScale(1);
  };

  const handleReset = useCallback(() => {
    if (previewUrl && previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(currentImageUrl);
    setRotation(0);
    setScale(1);
  }, [currentImageUrl, previewUrl]);

  const handleThamGia = async () => {
    const token = localStorage.getItem("accessToken") || localStorage.getItem("token") || "";
    if (!token) {
      alert("Bạn cần đăng nhập.");
      return;
    }
    if (file) {
      setUploading(true);
      try {
        const result = await uploadMedia({
          token,
          file,
          cordigramUploadContext: "messages",
        });
        onConfirm(result.url);
        onClose();
      } catch (err) {
        console.error(err);
        alert("Tải ảnh lên thất bại.");
      } finally {
        setUploading(false);
      }
      return;
    }
    if (currentImageUrl) {
      onConfirm(currentImageUrl);
      onClose();
      return;
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>Chỉnh sửa Hình ảnh</h2>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Đóng">
            ×
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={handleFileChange}
        />
        {!previewUrl ? (
          <div
            className={styles.previewWrap}
            style={{ cursor: "pointer" }}
            onClick={() => fileInputRef.current?.click()}
          >
            <span style={{ color: "#b5bac1" }}>Chọn ảnh</span>
          </div>
        ) : (
          <div className={styles.previewWrap}>
            <img
              src={previewUrl}
              alt="Preview"
              style={{
                transform: `rotate(${rotation}deg) scale(${scale})`,
              }}
            />
          </div>
        )}
        <div className={styles.controls}>
          <div className={styles.zoomSlider}>
            <span style={{ color: "#b5bac1", fontSize: "14px" }}>Zoom</span>
            <input
              type="range"
              min="0.5"
              max="2"
              step="0.1"
              value={scale}
              onChange={(e) => setScale(Number(e.target.value))}
            />
          </div>
          <button
            type="button"
            className={styles.rotateBtn}
            onClick={() => setRotation((r) => (r + 90) % 360)}
            title="Xoay ảnh"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 2v6h-6" />
              <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
              <path d="M3 22v-6h6" />
              <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
            </svg>
          </button>
        </div>
        <div className={styles.footer}>
          <button type="button" className={styles.resetBtn} onClick={handleReset}>
            Đặt lại
          </button>
          <div className={styles.footerRight}>
            <button type="button" className={styles.btnSecondary} onClick={onClose}>
              Hủy bỏ
            </button>
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={handleThamGia}
              disabled={uploading || (!file && !currentImageUrl)}
            >
              {uploading ? "Đang tải..." : "Tham Gia"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
