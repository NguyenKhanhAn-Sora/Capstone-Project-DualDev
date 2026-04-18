"use client";

import React, { useState, useRef, useEffect } from "react";
import styles from "./ServerCustomization.module.css";
import { uploadMedia } from "@/lib/api";
import { useLanguage } from "@/component/language-provider";

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
  const { t } = useLanguage();
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
      alert(t("chat.createServer.customize.errors.imageOnly"));
      return;
    }

    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      alert(t("chat.createServer.customize.errors.maxSize5mb"));
      return;
    }

    if (!token) {
      alert(t("chat.createServer.customize.errors.loginRequired"));
      return;
    }

    setUploading(true);
    try {
      // Fix: Pass token and file as object
      const result = await uploadMedia({
        token,
        file,
        cordigramUploadContext: "messages",
      });
      setAvatarUrl(result.url);
    } catch (error) {
      console.error("Failed to upload image:", error);
      alert(t("chat.createServer.customize.errors.uploadFailed"));
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = () => {
    if (!serverName.trim()) {
      alert(t("chat.createServer.errors.nameRequired"));
      return;
    }
    onCreateServer(serverName, avatarUrl || undefined);
  };

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>{t("chat.createServer.customize.title")}</h2>
      <p className={styles.subtitle}>
        {t("chat.createServer.customize.subtitle")}
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
        {uploading && (
          <p className={styles.uploadingText}>{t("chat.common.uploading")}</p>
        )}
      </div>

      <div className={styles.inputSection}>
        <label className={styles.label}>
          {t("chat.createServer.customize.serverNameLabel")}{" "}
          <span className={styles.required}>*</span>
        </label>
        <input
          type="text"
          className={styles.input}
          value={serverName}
          onChange={(e) => setServerName(e.target.value)}
          placeholder={t("chat.createServer.customize.serverNamePlaceholder")}
          maxLength={100}
        />
        <p className={styles.hint}>
          {t("chat.createServer.customize.communityGuidelinesPrefix")}{" "}
          <span className={styles.link}>
            {t("chat.createServer.customize.communityGuidelinesLink")}
          </span>{" "}
          {t("chat.createServer.customize.communityGuidelinesSuffix")}
        </p>
      </div>

      <div className={styles.footer}>
        <button className={styles.backButton} onClick={onBack} disabled={isCreating}>
          {t("chat.common.back")}
        </button>
        <button
          className={styles.createButton}
          onClick={handleSubmit}
          disabled={isCreating || !serverName.trim()}
        >
          {isCreating ? t("chat.common.creating") : t("chat.common.create")}
        </button>
      </div>
    </div>
  );
}
