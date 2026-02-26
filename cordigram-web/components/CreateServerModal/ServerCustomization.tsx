"use client";

import React, { useState, useRef, useEffect } from "react";
import styles from "./ServerCustomization.module.css";
import { uploadMedia } from "@/lib/api";

interface ServerCustomizationProps {
  onCreateServer: (name: string, avatarUrl?: string) => void;
  onBack: () => void;
  isCreating: boolean;
}

export default function ServerCustomization({
  onCreateServer,
  onBack,
  isCreating,
}: ServerCustomizationProps) {
  const [serverName, setServerName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [token, setToken] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Get token from localStorage
    const accessToken = localStorage.getItem("accessToken") || localStorage.getItem("token") || "";
    setToken(accessToken);
  }, []);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Vui lòng chọn file ảnh");
      return;
    }

    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      alert("Kích thước file không được vượt quá 5MB");
      return;
    }

    if (!token) {
      alert("Bạn cần đăng nhập để upload ảnh");
      return;
    }

    setUploading(true);
    try {
      // Fix: Pass token and file as object
      const result = await uploadMedia({ token, file });
      setAvatarUrl(result.url);
    } catch (error) {
      console.error("Failed to upload image:", error);
      alert("Không thể tải lên ảnh. Vui lòng thử lại.");
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = () => {
    if (!serverName.trim()) {
      alert("Vui lòng nhập tên máy chủ");
      return;
    }
    onCreateServer(serverName, avatarUrl || undefined);
  };

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>Tùy chỉnh máy chủ của bạn</h2>
      <p className={styles.subtitle}>
        Hãy cá nhân hóa máy chủ bằng cách đặt tên và thêm biểu tượng đại diện.
        Bạn có thể đổi bất cứ lúc nào.
      </p>

      <div className={styles.uploadSection}>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleImageUpload}
          accept="image/*"
          style={{ display: "none" }}
        />
        <button
          className={styles.uploadButton}
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt="Server avatar" className={styles.avatar} />
          ) : (
            <div className={styles.uploadPlaceholder}>
              <div className={styles.uploadIcon}>
                📷
                <div className={styles.plusIcon}>+</div>
              </div>
              <span className={styles.uploadText}>UPLOAD</span>
            </div>
          )}
        </button>
        {uploading && <p className={styles.uploadingText}>Đang tải lên...</p>}
      </div>

      <div className={styles.inputSection}>
        <label className={styles.label}>
          Tên máy chủ <span className={styles.required}>*</span>
        </label>
        <input
          type="text"
          className={styles.input}
          value={serverName}
          onChange={(e) => setServerName(e.target.value)}
          placeholder="Nhập tên máy chủ"
          maxLength={100}
        />
        <p className={styles.hint}>
          Khi tạo máy chủ, nghĩa là bạn đã đồng ý với{" "}
          <span className={styles.link}>Nguyên Tắc Cộng Đồng</span> của Discord.
        </p>
      </div>

      <div className={styles.footer}>
        <button className={styles.backButton} onClick={onBack} disabled={isCreating}>
          Trở lại
        </button>
        <button
          className={styles.createButton}
          onClick={handleSubmit}
          disabled={isCreating || !serverName.trim()}
        >
          {isCreating ? "Đang tạo..." : "Tạo"}
        </button>
      </div>
    </div>
  );
}
