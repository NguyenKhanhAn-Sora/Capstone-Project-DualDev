"use client";

import React, { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Cropper, { type Area } from "react-easy-crop";
import { getCroppedBlob, loadImage } from "@/lib/avatar-crop";
import styles from "./ProfileAvatarCropModal.module.css";
import { useLanguage } from "@/component/language-provider";

type Props = {
  open: boolean;
  imageSrc: string | null;
  sourceFile: File | null;
  onClose: () => void;
  onSubmit: (file: File) => Promise<void>;
};

async function getThumbDataUrl(
  imageSrc: string,
  croppedAreaPixels: Area,
): Promise<string> {
  const image = await loadImage(imageSrc);
  const canvas = document.createElement("canvas");
  canvas.width = croppedAreaPixels.width;
  canvas.height = croppedAreaPixels.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.drawImage(
    image,
    croppedAreaPixels.x,
    croppedAreaPixels.y,
    croppedAreaPixels.width,
    croppedAreaPixels.height,
    0,
    0,
    croppedAreaPixels.width,
    croppedAreaPixels.height,
  );
  return canvas.toDataURL("image/jpeg", 0.85);
}

export default function ProfileBannerCropModal({
  open,
  imageSrc,
  sourceFile,
  onClose,
  onSubmit,
}: Props) {
  const { t } = useLanguage();
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [thumb, setThumb] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
      setThumb(null);
      setError("");
      setSubmitting(false);
    }
  }, [open]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!open || !imageSrc || !croppedAreaPixels) return;
      try {
        const u = await getThumbDataUrl(imageSrc, croppedAreaPixels);
        if (!cancelled) setThumb(u);
      } catch {
        if (!cancelled) setThumb(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, imageSrc, croppedAreaPixels, crop, zoom]);

  const handleSave = useCallback(async () => {
    if (!imageSrc || !sourceFile || !croppedAreaPixels) {
      setError(t("chat.profileBannerCrop.errorNoCrop"));
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const croppedBlob = await getCroppedBlob(imageSrc, croppedAreaPixels);
      const out = new File([croppedBlob], `profile-banner-${Date.now()}.jpg`, {
        type: "image/jpeg",
      });
      await onSubmit(out);
      onClose();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : t("chat.profileBannerCrop.errorUpload"),
      );
    } finally {
      setSubmitting(false);
    }
  }, [imageSrc, sourceFile, croppedAreaPixels, onSubmit, onClose, t]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className={styles.overlay}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div
        className={styles.card}
        role="dialog"
        aria-modal="true"
        aria-labelledby="banner-crop-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className={styles.head}>
          <div>
            <h3 id="banner-crop-title">{t("chat.profileBannerCrop.title")}</h3>
            <p>{t("chat.profileBannerCrop.subtitle")}</p>
          </div>
          <button
            type="button"
            className={styles.close}
            aria-label={t("chat.profileBannerCrop.closeAria")}
            disabled={submitting}
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className={styles.body}>
          <div className={styles.cropWrap}>
            {imageSrc ? (
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={3}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_, pixels) => setCroppedAreaPixels(pixels)}
              />
            ) : null}
          </div>
          <div className={styles.side}>
            <div className={styles.thumb} style={{ borderRadius: 12 }}>
              {thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumb} alt="" style={{ objectFit: "cover" }} />
              ) : (
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    background: "#2b2d31",
                  }}
                />
              )}
            </div>
            <div className={styles.sliderRow}>
              <span>{t("chat.profileBannerCrop.zoomLabel")}</span>
              <input
                type="range"
                min={1}
                max={3}
                step={0.05}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
              />
            </div>
            {error ? <div className={styles.err}>{error}</div> : null}
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.btnGhost}
                disabled={submitting}
                onClick={onClose}
              >
                {t("chat.profileBannerCrop.cancel")}
              </button>
              <button
                type="button"
                className={styles.btnPrimary}
                disabled={submitting || !croppedAreaPixels}
                onClick={() => void handleSave()}
              >
                {submitting
                  ? t("chat.profileBannerCrop.saving")
                  : t("chat.profileBannerCrop.save")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

