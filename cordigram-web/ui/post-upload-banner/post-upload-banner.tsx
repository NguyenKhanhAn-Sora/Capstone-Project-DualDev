"use client";

import { usePostUpload } from "@/context/post-upload-context";
import styles from "./post-upload-banner.module.css";

export default function PostUploadBanner() {
  const { upload, cancelUpload } = usePostUpload();

  if (!upload) return null;

  const { status, progress, mode, uploadedFiles, totalFiles, error } = upload;
  const modeLabel = mode === "reel" ? "Reel" : "Post";

  let label: string;
  if (status === "uploading") {
    const fileHint =
      totalFiles > 1 ? ` · ${uploadedFiles}/${totalFiles} files` : "";
    label = `Uploading ${modeLabel.toLowerCase()}…${fileHint}`;
  } else if (status === "done") {
    label = `${modeLabel} published!`;
  } else if (status === "cancelled") {
    label = "Upload cancelled";
  } else {
    label = error || "Upload failed";
  }

  return (
    <div
      className={`${styles.banner} ${styles[status]}`}
      role="status"
      aria-live="polite"
    >
      <div className={styles.inner}>
        <span className={styles.iconWrap} aria-hidden>
          {status === "uploading" && <span className={styles.spinner} />}
          {status === "done" && (
            <span className={styles.checkIcon}>✓</span>
          )}
          {(status === "error" || status === "cancelled") && (
            <span className={styles.errorIcon}>✕</span>
          )}
        </span>

        <div className={styles.info}>
          <span className={styles.label}>{label}</span>
          {status === "uploading" && (
            <div className={styles.track} role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
              <div className={styles.bar} style={{ width: `${progress}%` }} />
            </div>
          )}
        </div>

        {status === "uploading" && (
          <button
            type="button"
            className={styles.cancelBtn}
            onClick={cancelUpload}
            aria-label="Cancel upload"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
