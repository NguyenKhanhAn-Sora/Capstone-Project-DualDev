"use client";

import { appAlert, appConfirm, appPrompt } from "@/lib/app-dialog";
import React, { useState, useRef, useEffect } from "react";
import styles from "./ServerCustomization.module.css";
import { uploadMedia } from "@/lib/api";
import { useLanguage } from "@/component/language-provider";
import { useTranslations } from "next-intl";

interface ServerCustomizationProps {
  onCreateServer: (name: string, avatarUrl?: string) => void;
  onBack: () => void;
  isCreating: boolean;
}

const CameraIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
);

const PlusIcon = () => (
  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="6" y1="1" x2="6" y2="11" />
    <line x1="1" y1="6" x2="11" y2="6" />
  </svg>
);

export default function ServerCustomization({
  onCreateServer,
  onBack,
  isCreating,
}: ServerCustomizationProps) {
  const { t } = useLanguage();
  const tServer = useTranslations("server");
  const [serverName, setServerName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [token, setToken] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const accessToken = localStorage.getItem("accessToken") || localStorage.getItem("token") || "";
    setToken(accessToken);
  }, []);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      appAlert(t("chat.createServer.customize.errors.imageOnly"));
      return;
    }

    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      appAlert(t("chat.createServer.customize.errors.maxSize5mb"));
      return;
    }

    if (!token) {
      appAlert(t("chat.createServer.customize.errors.loginRequired"));
      return;
    }

    setUploading(true);
    try {
      const result = await uploadMedia({
        token,
        file,
        cordigramUploadContext: "messages",
      });
      setAvatarUrl(result.url);
    } catch (error) {
      console.error("Failed to upload image:", error);
      appAlert(t("chat.createServer.customize.errors.uploadFailed"));
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = () => {
    if (!serverName.trim()) {
      appAlert(t("chat.createServer.errors.nameRequired"));
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
            <img src={avatarUrl} alt={tServer("common.serverAvatar")} className={styles.avatar} />
          ) : (
            <div className={styles.uploadPlaceholder}>
              <span className={styles.uploadCameraIcon}>
                <CameraIcon />
              </span>
              <span className={styles.plusBadge}>
                <PlusIcon />
              </span>
              <span className={styles.uploadText}>UPLOAD</span>
            </div>
          )}
        </button>
        {uploading && (
          <div className={styles.uploadingWrap}>
            <svg className={styles.uploadingSpinner} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
            <p className={styles.uploadingText}>{t("chat.common.uploading")}</p>
          </div>
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
