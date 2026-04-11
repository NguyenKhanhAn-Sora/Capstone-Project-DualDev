"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./report-problem.module.css";
import {
  createReportProblem,
  type ApiError,
  type ReportProblemAttachment,
} from "@/lib/api";
import { useRequireAuth } from "@/hooks/use-require-auth";

export default function ReportProblemPage() {
  const canRender = useRequireAuth();
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<
    Array<{ id: string; file: File; previewUrl: string; isVideo: boolean }>
  >([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<ReportProblemAttachment[] | null>(
    null
  );
  const [cooldownMs, setCooldownMs] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (cooldownMs === null) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [cooldownMs]);

  useEffect(() => {
    return () => {
      files.forEach((entry) => URL.revokeObjectURL(entry.previewUrl));
    };
  }, [files]);

  const remainingMs =
    cooldownMs !== null ? Math.max(0, cooldownMs - tick * 1000) : 0;
  const remainingSec = Math.ceil(remainingMs / 1000);

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
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((entry) => entry.id !== id);
    });
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setCooldownMs(null);

    const trimmed = description.trim();
    if (!trimmed) {
      setError("Please describe the problem.");
      return;
    }

    const token =
      typeof window !== "undefined"
        ? localStorage.getItem("accessToken")
        : null;
    if (!token) {
      setError("You need to sign in to report a problem.");
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
      const retryAfter = (apiErr?.data as { retryAfterMs?: number } | undefined)
        ?.retryAfterMs;
      if (retryAfter && retryAfter > 0) {
        setCooldownMs(retryAfter);
        setError("Please wait before sending another report.");
        return;
      }
      setError(apiErr?.message || "Cannot send report now.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <div>
            <p className={styles.kicker}>Report</p>
            <h1 className={styles.title}>Tell us what went wrong</h1>
            <p className={styles.subtitle}>
              Describe the issue and attach screenshots or a short video.
            </p>
          </div>
        </div>

        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.label}>
            Description
            <textarea
              className={styles.textarea}
              rows={6}
              placeholder="Explain what happened, where it happened, and any steps to reproduce."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
            />
          </label>

          <div className={styles.row}>
            <label className={styles.label}>
              Attachments (optional)
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
                Select files
              </button>
            </label>
            <div className={styles.hint}>
              Up to 5 files · images or videos
              {files.length ? ` · ${files.length}/5 selected` : ""}
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
                        if (video.duration > 0.2) {
                          video.currentTime = 0.1;
                        }
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
                    aria-label="Remove selected file"
                    title="Remove"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {error ? <p className={styles.error}>{error}</p> : null}
          {cooldownMs !== null ? (
            <div className={styles.successBox}>
              <p className={styles.successTitle}>Cooldown</p>
              <p className={styles.successText}>
                You can send the next report in {remainingSec}s.
              </p>
            </div>
          ) : null}
          {success ? (
            <div className={styles.successBox}>
              <p className={styles.successTitle}>Report sent</p>
              <p className={styles.successText}>
                Thank you. Our team will review it soon.
              </p>
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
              Clear
            </button>
            <button
              type="submit"
              className={styles.primary}
              disabled={submitting || (cooldownMs !== null && remainingMs > 0)}
            >
              {submitting ? "Sending..." : "Send report"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
