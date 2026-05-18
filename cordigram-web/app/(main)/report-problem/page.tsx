"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import styles from "./report-problem.module.css";
import {
  createReportProblem,
  type ApiError,
  type ReportProblemAttachment,
} from "@/lib/api";
import { useRequireAuth } from "@/hooks/use-require-auth";

export default function ReportProblemPage() {
  const canRender = useRequireAuth();
  const t = useTranslations("reportProblem");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<
    Array<{ id: string; file: File; previewUrl: string; isVideo: boolean }>
  >([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<ReportProblemAttachment[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => {
      files.forEach((entry) => URL.revokeObjectURL(entry.previewUrl));
    };
  }, [files]);

  if (!canRender) return null;

  const clearSelectedFiles = () => {
    files.forEach((entry) => URL.revokeObjectURL(entry.previewUrl));
    setFiles([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleFiles = (list: FileList | null) => {
    if (!list) return;
    const selected = Array.from(list);
    if (!selected.length) return;

    setFiles((prev) => {
      const availableSlots = Math.max(0, 5 - prev.length);
      if (!availableSlots) return prev;

      const nextEntries = selected.slice(0, availableSlots).map((file) => ({
        id: `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        previewUrl: URL.createObjectURL(file),
        isVideo: file.type.startsWith("video/"),
      }));

      return [...prev, ...nextEntries];
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleRemoveFile = (id: string) => {
    setFiles((prev) => {
      const target = prev.find((entry) => entry.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((entry) => entry.id !== id);
    });
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const trimmed = description.trim();
    if (!trimmed) {
      setError(t("errorEmpty"));
      return;
    }

    const token =
      typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
    if (!token) {
      setError(t("errorSignIn"));
      return;
    }

    setSubmitting(true);
    try {
      const res = await createReportProblem({
        token,
        description: trimmed,
        files: files.map((entry) => entry.file),
      });
      setSuccess(res.attachments ?? []);
      setDescription("");
      clearSelectedFiles();
    } catch (err) {
      const apiErr = err as ApiError | undefined;
      setError(apiErr?.message || t("errorFallback"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <div>
            <p className={styles.kicker}>{t("kicker")}</p>
            <h1 className={styles.title}>{t("title")}</h1>
            <p className={styles.subtitle}>{t("subtitle")}</p>
          </div>
        </div>

        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.label}>
            {t("descriptionLabel")}
            <textarea
              className={styles.textarea}
              rows={6}
              placeholder={t("descriptionPlaceholder")}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
            />
          </label>

          <div className={styles.row}>
            <label className={styles.label}>
              {t("attachmentsLabel")}
              <input
                ref={fileInputRef}
                className={styles.fileInput}
                type="file"
                multiple
                accept="image/*,video/*"
                onChange={(e) => handleFiles(e.target.files)}
              />
              <button
                type="button"
                className={styles.fileButton}
                onClick={() => fileInputRef.current?.click()}
              >
                {t("selectFiles")}
              </button>
            </label>
            <div className={styles.hint}>
              {files.length
                ? t("hintSelected", { count: files.length })
                : t("hint")}
            </div>
          </div>

          {files.length ? (
            <ul className={styles.previewGrid}>
              {files.map((entry) => (
                <li key={entry.id} className={styles.previewItem}>
                  {entry.isVideo ? (
                    <video
                      src={entry.previewUrl}
                      className={styles.previewMedia}
                      autoPlay
                      loop
                      muted
                      playsInline
                      preload="auto"
                      onLoadedMetadata={(event) => {
                        const video = event.currentTarget;
                        if (video.duration > 0.2) video.currentTime = 0.1;
                      }}
                    />
                  ) : (
                    <img
                      src={entry.previewUrl}
                      alt="Selected attachment preview"
                      className={styles.previewMedia}
                    />
                  )}
                  <button
                    type="button"
                    className={styles.removePreviewButton}
                    onClick={() => handleRemoveFile(entry.id)}
                    aria-label={t("removeFile")}
                    title={t("removeFile")}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {error ? <p className={styles.error}>{error}</p> : null}
          {success ? (
            <div className={styles.successBox}>
              <p className={styles.successTitle}>{t("successTitle")}</p>
              <p className={styles.successText}>{t("successText")}</p>
            </div>
          ) : null}

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => {
                setDescription("");
                clearSelectedFiles();
                setError(null);
                setSuccess(null);
              }}
              disabled={submitting}
            >
              {t("clear")}
            </button>
            <button
              type="submit"
              className={styles.primary}
              disabled={submitting}
            >
              {submitting ? t("sending") : t("send")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
