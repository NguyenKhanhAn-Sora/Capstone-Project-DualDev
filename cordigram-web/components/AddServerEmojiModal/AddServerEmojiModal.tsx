"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import "react-easy-crop/react-easy-crop.css";
import styles from "./AddServerEmojiModal.module.css";
import * as serversApi from "@/lib/servers-api";
import { uploadMedia } from "@/lib/api";
import {
  compressImageBlobUnder,
  exportSquareCropPng,
  flipImageBlobUrl,
  rotateImage90CwBlobUrl,
} from "@/lib/getCroppedImageBlob";

const STATIC_MAX_BYTES = 256 * 1024;
const MAX_GIF_BYTES = 2 * 1024 * 1024;

function nameFromFile(f: File): string {
  const base = f.name.replace(/\.[^.]+$/i, "");
  const s = base
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  return (s || "emoji").slice(0, 80);
}

function isAnimatedEmoji(file: File): boolean {
  if (file.type === "image/gif") return true;
  return /\.gif$/i.test(file.name);
}

function sanitizeEmojiName(raw: string): string {
  return raw
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 80);
}

type Props = {
  isOpen: boolean;
  file: File | null;
  token: string;
  defaultServerId: string;
  onClose: () => void;
  onSuccess: () => void | Promise<void>;
};

export default function AddServerEmojiModal({
  isOpen,
  file,
  token,
  defaultServerId,
  onClose,
  onSuccess,
}: Props) {
  const blobUrlsRef = useRef<Set<string>>(new Set());
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [gif, setGif] = useState(false);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [emojiName, setEmojiName] = useState("");
  const [targets, setTargets] = useState<serversApi.EmojiUploadTarget[]>([]);
  const [targetsErr, setTargetsErr] = useState<string | null>(null);
  const [loadingTargets, setLoadingTargets] = useState(false);
  const [selectedServerId, setSelectedServerId] = useState(defaultServerId);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [busyTransform, setBusyTransform] = useState(false);

  const revokeAllBlobUrls = useCallback(() => {
    blobUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    blobUrlsRef.current.clear();
  }, []);

  const trackBlobUrl = useCallback((url: string) => {
    blobUrlsRef.current.add(url);
  }, []);

  const replaceImageSrc = useCallback((newUrl: string) => {
    setImageSrc((prev) => {
      if (prev && prev !== newUrl) {
        URL.revokeObjectURL(prev);
        blobUrlsRef.current.delete(prev);
      }
      blobUrlsRef.current.add(newUrl);
      return newUrl;
    });
  }, []);

  useEffect(() => {
    if (!isOpen || !file) {
      revokeAllBlobUrls();
      setImageSrc(null);
      setGif(false);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
      setPreviewUrl((p) => {
        if (p) URL.revokeObjectURL(p);
        return null;
      });
      setEmojiName("");
      setTargets([]);
      setTargetsErr(null);
      setFormErr(null);
      setDropdownOpen(false);
      setSubmitting(false);
      setBusyTransform(false);
      return;
    }

    revokeAllBlobUrls();
    const u = URL.createObjectURL(file);
    trackBlobUrl(u);
    setImageSrc(u);
    setGif(isAnimatedEmoji(file));
    setEmojiName(nameFromFile(file));
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    setFormErr(null);
    setSelectedServerId(defaultServerId);

    return () => {
      revokeAllBlobUrls();
      setPreviewUrl((p) => {
        if (p) URL.revokeObjectURL(p);
        return null;
      });
    };
  }, [isOpen, file, defaultServerId, trackBlobUrl, revokeAllBlobUrls]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoadingTargets(true);
    setTargetsErr(null);
    void serversApi
      .getEmojiUploadTargets()
      .then((res) => {
        if (cancelled) return;
        setTargets(res.targets);
        setSelectedServerId((cur) => {
          const ids = new Set(res.targets.map((t) => t.serverId));
          if (ids.has(cur)) return cur;
          const preferred = res.targets.find((t) => t.serverId === defaultServerId);
          return preferred?.serverId ?? res.targets[0]?.serverId ?? cur;
        });
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setTargetsErr(e instanceof Error ? e.message : "Không tải được máy chủ");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingTargets(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, defaultServerId]);

  useEffect(() => {
    if (!imageSrc || gif) {
      setPreviewUrl((p) => {
        if (p) URL.revokeObjectURL(p);
        return null;
      });
      return;
    }
    if (!croppedAreaPixels) return;

    let cancelled = false;
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          const b = await exportSquareCropPng(imageSrc, croppedAreaPixels);
          const u = URL.createObjectURL(b);
          if (cancelled) {
            URL.revokeObjectURL(u);
            return;
          }
          setPreviewUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return u;
          });
        } catch {
          if (!cancelled) {
            setPreviewUrl((prev) => {
              if (prev) URL.revokeObjectURL(prev);
              return null;
            });
          }
        }
      })();
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [imageSrc, croppedAreaPixels, gif]);

  const onCropComplete = useCallback((_: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  const resetEditor = useCallback(() => {
    if (!file) return;
    revokeAllBlobUrls();
    const u = URL.createObjectURL(file);
    trackBlobUrl(u);
    setImageSrc(u);
    setGif(isAnimatedEmoji(file));
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    setFormErr(null);
  }, [file, trackBlobUrl, revokeAllBlobUrls]);

  const handleRotate = useCallback(async () => {
    if (!imageSrc || gif || busyTransform) return;
    setBusyTransform(true);
    setFormErr(null);
    try {
      const { url } = await rotateImage90CwBlobUrl(imageSrc);
      replaceImageSrc(url);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
    } catch {
      setFormErr("Không xoay được ảnh.");
    } finally {
      setBusyTransform(false);
    }
  }, [imageSrc, gif, busyTransform, replaceImageSrc]);

  const handleFlipH = useCallback(async () => {
    if (!imageSrc || gif || busyTransform) return;
    setBusyTransform(true);
    setFormErr(null);
    try {
      const { url } = await flipImageBlobUrl(imageSrc, true);
      replaceImageSrc(url);
      setCroppedAreaPixels(null);
    } catch {
      setFormErr("Không lật được ảnh.");
    } finally {
      setBusyTransform(false);
    }
  }, [imageSrc, gif, busyTransform, replaceImageSrc]);

  const selected = targets.find((t) => t.serverId === selectedServerId);

  const gifTooBig = gif && file && file.size > MAX_GIF_BYTES;

  const nameOk = sanitizeEmojiName(emojiName).length > 0;
  const canSubmit =
    !submitting &&
    !loadingTargets &&
    !targetsErr &&
    nameOk &&
    selected &&
    selected.remaining > 0 &&
    !gifTooBig &&
    (gif ? !!imageSrc : !!croppedAreaPixels);

  const handleDone = async () => {
    if (!file || !selected || !canSubmit) return;
    const name = sanitizeEmojiName(emojiName);
    if (!name) {
      setFormErr("Nhập tên emoji (chữ, số, gạch dưới).");
      return;
    }

    setSubmitting(true);
    setFormErr(null);

    try {
      if (gif) {
        if (file.size > MAX_GIF_BYTES) {
          setFormErr("GIF không được vượt quá 2 MB.");
          setSubmitting(false);
          return;
        }
        const up = await uploadMedia({ token, file });
        const imageUrl = up.secureUrl || up.url;
        if (!imageUrl) throw new Error("Upload thất bại");
        await serversApi.addServerEmoji(selected.serverId, {
          imageUrl,
          name,
          animated: true,
        });
      } else {
        if (!imageSrc || !croppedAreaPixels) {
          setFormErr("Chọn vùng cắt cho emoji.");
          setSubmitting(false);
          return;
        }
        let blob = await exportSquareCropPng(imageSrc, croppedAreaPixels);
        blob = await compressImageBlobUnder(blob, STATIC_MAX_BYTES, "image/png");
        if (blob.size > STATIC_MAX_BYTES) {
          blob = await compressImageBlobUnder(blob, STATIC_MAX_BYTES, "image/webp");
        }
        if (blob.size > STATIC_MAX_BYTES) {
          setFormErr(
            "Emoji này quá lớn! Emoji phải nhỏ hơn 256 KB sau khi cắt và nén.",
          );
          setSubmitting(false);
          return;
        }
        const mime = blob.type || "image/png";
        const ext = mime.includes("webp") ? "webp" : "png";
        const outFile = new File([blob], `emoji.${ext}`, { type: mime });
        const up = await uploadMedia({ token, file: outFile });
        const imageUrl = up.secureUrl || up.url;
        if (!imageUrl) throw new Error("Upload thất bại");
        await serversApi.addServerEmoji(selected.serverId, {
          imageUrl,
          name,
          animated: false,
        });
      }
      await Promise.resolve(onSuccess());
      onClose();
    } catch (e: unknown) {
      setFormErr(e instanceof Error ? e.message : "Không hoàn tất được.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen || !file) return null;

  const previewForBoxes = gif ? imageSrc : previewUrl;

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-emoji-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
        <header className={styles.header}>
          <button
            type="button"
            className={styles.iconBtn}
            aria-label="Đóng"
            onClick={onClose}
          >
            ×
          </button>
          <h2 id="add-emoji-title" className={styles.title}>
            Thêm emoji
          </h2>
          <button
            type="button"
            className={styles.iconBtn}
            aria-label="Đặt lại"
            title="Đặt lại"
            onClick={resetEditor}
          >
            ↺
          </button>
        </header>

        <div className={styles.body}>
          <div className={styles.editor}>
            {gif ? (
              <div className={styles.gifPreview}>
                {imageSrc ? (
                  <img src={imageSrc} alt="" />
                ) : null}
              </div>
            ) : imageSrc ? (
              <div className={styles.cropWrap}>
                <Cropper
                  image={imageSrc}
                  crop={crop}
                  zoom={zoom}
                  aspect={1}
                  rotation={0}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={onCropComplete}
                  showGrid={false}
                  objectFit="contain"
                />
              </div>
            ) : null}

            <p className={styles.hint}>
              {gif
                ? "GIF sẽ được tải nguyên bản. Giới hạn 2 MB."
                : "Kéo hình ảnh để thay đổi vị trí"}
            </p>

            <div className={styles.toolbar}>
              <button
                type="button"
                className={styles.toolBtn}
                disabled={gif || busyTransform}
                title="Xoay 90°"
                aria-label="Xoay 90 độ"
                onClick={() => void handleRotate()}
              >
                ↻
              </button>
              <button
                type="button"
                className={styles.toolBtn}
                disabled={gif || busyTransform}
                title="Lật ngang"
                aria-label="Lật ngang"
                onClick={() => void handleFlipH()}
              >
                ⇄
              </button>
              <div className={styles.zoomWrap}>
                <span className={styles.zoomLabel} aria-hidden>
                  −
                </span>
                <input
                  className={styles.zoomSlider}
                  type="range"
                  min={1}
                  max={4}
                  step={0.05}
                  value={zoom}
                  disabled={gif}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  aria-label="Thu phóng"
                />
                <span className={styles.zoomLabel} aria-hidden>
                  +
                </span>
              </div>
            </div>
          </div>

          <aside className={styles.side}>
            <div>
              <p className={styles.sideTitle}>Xem trước</p>
              <div className={styles.previewRow}>
                <div className={styles.previewCtx}>
                  <span>6</span>
                  <div
                    className={`${styles.previewBox} ${styles.previewBoxSm}`}
                  >
                    {previewForBoxes ? (
                      <img src={previewForBoxes} alt="" />
                    ) : null}
                  </div>
                </div>
                <div className={styles.previewBox}>
                  {previewForBoxes ? (
                    <img src={previewForBoxes} alt="" />
                  ) : null}
                </div>
              </div>
            </div>

            <div>
              <label className={styles.fieldLabel} htmlFor="emoji-name-input">
                Tên emoji <span className={styles.required}>*</span>
              </label>
              <div className={styles.nameRow}>
                <input
                  id="emoji-name-input"
                  className={styles.nameInput}
                  value={emojiName}
                  onChange={(e) => setEmojiName(e.target.value)}
                  placeholder="ten_emoji"
                  autoComplete="off"
                />
                <button
                  type="button"
                  className={styles.nameClear}
                  aria-label="Xóa tên"
                  onClick={() => setEmojiName("")}
                >
                  ×
                </button>
              </div>
            </div>

            <div>
              <p className={styles.fieldLabel}>
                Tải lên <span className={styles.required}>*</span>
              </p>
              <div className={styles.selectWrap}>
                <button
                  type="button"
                  className={styles.selectBtn}
                  disabled={loadingTargets || !!targetsErr}
                  onClick={() => setDropdownOpen((o) => !o)}
                >
                  {selected ? (
                    <>
                      {selected.avatarUrl ? (
                        <img
                          src={selected.avatarUrl}
                          alt=""
                          className={styles.srvIcon}
                        />
                      ) : (
                        <span className={styles.srvPh}>
                          {(selected.name || "?").slice(0, 1).toUpperCase()}
                        </span>
                      )}
                      <span>{selected.name}</span>
                      <span className={styles.selectMeta}>
                        {selected.remaining} ô trống
                      </span>
                    </>
                  ) : (
                    <span>Chọn máy chủ</span>
                  )}
                  <span className={styles.selectChev}>▼</span>
                </button>
                {dropdownOpen && targets.length > 0 ? (
                  <div className={styles.dropdown}>
                    {targets.map((t) => (
                      <button
                        key={t.serverId}
                        type="button"
                        className={`${styles.dropdownItem} ${
                          t.serverId === selectedServerId
                            ? styles.dropdownItemActive
                            : ""
                        }`}
                        disabled={t.remaining <= 0}
                        onClick={() => {
                          setSelectedServerId(t.serverId);
                          setDropdownOpen(false);
                        }}
                      >
                        {t.avatarUrl ? (
                          <img
                            src={t.avatarUrl}
                            alt=""
                            className={styles.srvIcon}
                          />
                        ) : (
                          <span className={styles.srvPh}>
                            {(t.name || "?").slice(0, 1).toUpperCase()}
                          </span>
                        )}
                        <span>{t.name}</span>
                        <span className={styles.selectMeta}>
                          {t.remaining} ô trống
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            {targetsErr ? (
              <p className={styles.err}>{targetsErr}</p>
            ) : null}
            {gifTooBig ? (
              <p className={styles.err}>
                Emoji này quá lớn! GIF phải nhỏ hơn 2 MB.
              </p>
            ) : null}
            {selected && selected.remaining <= 0 ? (
              <p className={styles.err}>
                Máy chủ này đã hết chỗ emoji ({selected.max} tối đa).
              </p>
            ) : null}
            {formErr ? <p className={styles.err}>{formErr}</p> : null}

            <div className={styles.footer}>
              <button
                type="button"
                className={styles.doneBtn}
                disabled={!canSubmit}
                onClick={() => void handleDone()}
              >
                {submitting ? "Đang tải…" : "Hoàn tất"}
              </button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
