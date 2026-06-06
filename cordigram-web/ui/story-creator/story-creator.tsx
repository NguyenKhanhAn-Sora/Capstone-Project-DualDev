"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import EmojiPicker from "emoji-picker-react";
import { uploadStoryMedia, createStory, type StoryItem } from "@/lib/api";
import VideoTrimmer from "./video-trimmer";
import styles from "./story-creator.module.css";

const BG_OPTIONS = [
  { id: "galaxy1", value: "linear-gradient(135deg,#0f0c29,#302b63,#24243e)", label: "Galaxy" },
  { id: "galaxy2", value: "linear-gradient(135deg,#1a0533,#6d28d9,#0ea5e9)", label: "Nebula" },
  { id: "galaxy3", value: "linear-gradient(135deg,#0d1117,#1e3a5f,#8b5cf6)", label: "Deep Space" },
  { id: "galaxy4", value: "linear-gradient(135deg,#200122,#6f0000,#a21caf)", label: "Red Giant" },
  { id: "galaxy5", value: "linear-gradient(135deg,#0f2027,#203a43,#2c5364)", label: "Ocean Galaxy" },
  { id: "v1", value: "linear-gradient(135deg,#6366f1,#8b5cf6)", label: "Indigo" },
  { id: "v2", value: "linear-gradient(135deg,#ec4899,#f97316)", label: "Sunset" },
  { id: "v3", value: "linear-gradient(135deg,#06b6d4,#3b82f6)", label: "Ocean" },
  { id: "v4", value: "linear-gradient(135deg,#10b981,#6366f1)", label: "Aurora" },
  { id: "v5", value: "linear-gradient(135deg,#f59e0b,#ef4444)", label: "Fire" },
  { id: "v6", value: "linear-gradient(135deg,#f953c6,#b91d73)", label: "Cosmic Pink" },
  { id: "v7", value: "linear-gradient(135deg,#0052d4,#4364f7,#6fb1fc)", label: "Blue Midnight" },
  { id: "d1", value: "linear-gradient(135deg,#111827,#374151)", label: "Charcoal" },
  { id: "d2", value: "#e11d48", label: "Rose" },
  { id: "d3", value: "#7c3aed", label: "Violet" },
  { id: "d4", value: "#0891b2", label: "Teal" },
  { id: "d5", value: "#059669", label: "Emerald" },
];

function IconFollowers() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="9" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M2 20c0-3.866 3.134-7 7-7s7 3.134 7 7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="18" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M16 20c0-2.5 1.5-4.5 4-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function IconPublic() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9.25" stroke="currentColor" strokeWidth="1.7" />
      <ellipse cx="12" cy="12" rx="3.75" ry="9.25" stroke="currentColor" strokeWidth="1.7" />
      <path d="M3 9h18M3 15h18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function IconCloseFriends() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 3l2.39 4.84 5.34.78-3.87 3.77.91 5.32L12 15.27l-4.77 2.44.91-5.32L4.27 8.62l5.34-.78L12 3z"
        stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}

const VISIBILITY_OPTIONS = [
  { value: "followers" as const, Icon: IconFollowers, tKey: "optFollowers" as const },
  { value: "public" as const, Icon: IconPublic, tKey: "optPublic" as const },
  { value: "close_friends" as const, Icon: IconCloseFriends, tKey: "optCloseFriends" as const },
];

type VisibilityValue = "followers" | "public" | "close_friends";
type Step = "select" | "media" | "text";
type MediaSubStep = "editor" | "preview";

type Props = {
  token: string;
  onCreated: (story: StoryItem) => void;
};

export default function StoryCreator({ token, onCreated }: Props) {
  const t = useTranslations("storyCreator");

  const [step, setStep] = useState<Step>("select");
  const [mediaSubStep, setMediaSubStep] = useState<MediaSubStep>("editor");
  const [showDiscardModal, setShowDiscardModal] = useState(false);

  // media
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<"image" | "video">("image");
  const [videoDuration, setVideoDuration] = useState(0);

  // video trim
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);

  // photo editor
  const [photoRotation, setPhotoRotation] = useState(0);
  const [photoZoom, setPhotoZoom] = useState(1);

  // text
  const [bgStyle, setBgStyle] = useState(BG_OPTIONS[0].value);
  const [textContent, setTextContent] = useState("");

  // shared
  const [visibility, setVisibility] = useState<VisibilityValue>("followers");
  const [visDropOpen, setVisDropOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState("");
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textEditRef = useRef<HTMLDivElement>(null);
  const textWrapperRef = useRef<HTMLDivElement>(null);
  const prevHtmlRef = useRef<string>("");
  const savedRangeRef = useRef<Range | null>(null);
  const scrollSnapRef = useRef<number>(0);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const visDropRef = useRef<HTMLDivElement>(null);
  const photoImgRef = useRef<HTMLImageElement>(null);
  const trimPreviewVideoRef = useRef<HTMLVideoElement>(null);

  // Close visibility dropdown on outside click
  useEffect(() => {
    if (!visDropOpen) return;
    const handler = (e: MouseEvent) => {
      if (visDropRef.current && !visDropRef.current.contains(e.target as Node)) {
        setVisDropOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [visDropOpen]);

  // Close emoji picker on outside click
  useEffect(() => {
    if (!emojiPickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) {
        setEmojiPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [emojiPickerOpen]);

  /* ── Helpers ─────────────────────────────────────── */

  const moveCursorToEnd = (el: HTMLDivElement) => {
    const range = document.createRange();
    const sel = window.getSelection();
    range.selectNodeContents(el);
    range.collapse(false);
    sel?.removeAllRanges();
    sel?.addRange(range);
  };

  const saveCursorRange = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      savedRangeRef.current = sel.getRangeAt(0).cloneRange();
    }
  };

  const insertEmojiAtCursor = (emoji: string) => {
    const el = textEditRef.current;
    const wrapper = textWrapperRef.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (savedRangeRef.current && sel) {
      sel.removeAllRanges();
      sel.addRange(savedRangeRef.current);
    }
    const snapY = window.scrollY;
    document.execCommand("insertText", false, emoji);
    window.scrollTo({ top: snapY, behavior: "instant" });
    requestAnimationFrame(() => {
      if (wrapper && el.scrollHeight > wrapper.clientHeight) {
        el.innerHTML = prevHtmlRef.current;
        moveCursorToEnd(el);
      } else {
        prevHtmlRef.current = el.innerHTML;
        setTextContent(el.innerText);
        saveCursorRange();
      }
      window.scrollTo({ top: snapY, behavior: "instant" });
    });
  };

  const handleTextInput = (e: React.FormEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const wrapper = textWrapperRef.current;
    if (!wrapper) return;
    const snapY = scrollSnapRef.current;
    requestAnimationFrame(() => {
      if (el.scrollHeight > wrapper.clientHeight) {
        el.innerHTML = prevHtmlRef.current;
        moveCursorToEnd(el);
      } else {
        prevHtmlRef.current = el.innerHTML;
        setTextContent(el.innerText);
        saveCursorRange();
      }
      window.scrollTo({ top: snapY, behavior: "instant" });
    });
  };

  /* ── File handling ───────────────────────────────── */

  const handleFileSelect = (file: File) => {
    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
      setError(t("errMediaType")); return;
    }
    const isVid = file.type.startsWith("video/");
    setMediaType(isVid ? "video" : "image");
    setMediaFile(file);
    const url = URL.createObjectURL(file);
    setMediaPreviewUrl(url);
    setError("");
    setPhotoRotation(0);
    setPhotoZoom(1);
    setTrimStart(0);
    setTrimEnd(0);
    setMediaSubStep("editor");

    if (isVid) {
      const vid = document.createElement("video");
      vid.src = url;
      vid.preload = "metadata";
      vid.onloadedmetadata = () => {
        setVideoDuration(vid.duration);
        setTrimEnd(vid.duration);
        vid.src = "";
      };
    }
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelect(file);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
    e.target.value = "";
  };

  /* ── Select type ─────────────────────────────────── */

  const selectMedia = () => {
    setStep("media");
    // Immediately open file picker
    setTimeout(() => fileInputRef.current?.click(), 50);
  };

  const selectText = () => {
    setStep("text");
  };

  /* ── Photo editor confirm ────────────────────────── */
  const confirmPhotoEdit = useCallback(async () => {
    if (!mediaPreviewUrl || !photoImgRef.current) { setMediaSubStep("preview"); return; }
    if (photoRotation === 0 && photoZoom === 1) { setMediaSubStep("preview"); return; }
    const img = photoImgRef.current;
    const isSwapped = photoRotation === 90 || photoRotation === 270;
    const cw = isSwapped ? img.naturalHeight : img.naturalWidth;
    const ch = isSwapped ? img.naturalWidth : img.naturalHeight;
    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d")!;
    ctx.translate(cw / 2, ch / 2);
    ctx.rotate((photoRotation * Math.PI) / 180);
    ctx.scale(photoZoom, photoZoom);
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    canvas.toBlob((blob) => {
      if (!blob) { setMediaSubStep("preview"); return; }
      const newFile = new File([blob], mediaFile?.name ?? "photo.jpg", { type: "image/jpeg" });
      const newUrl = URL.createObjectURL(newFile);
      URL.revokeObjectURL(mediaPreviewUrl);
      setMediaFile(newFile);
      setMediaPreviewUrl(newUrl);
      setPhotoRotation(0);
      setPhotoZoom(1);
      setMediaSubStep("preview");
    }, "image/jpeg", 0.92);
  }, [mediaPreviewUrl, photoRotation, photoZoom, mediaFile]);

  /* ── Video trim confirm ──────────────────────────── */
  const confirmVideoTrim = (start: number, end: number) => {
    setTrimStart(start);
    setTrimEnd(end);
    setMediaSubStep("preview");
  };

  /* ── Back / discard ──────────────────────────────── */

  const hasDraft = step === "media" ? !!mediaFile : step === "text" ? !!textContent.trim() : false;

  const handleBack = () => {
    if (step === "media" && mediaSubStep === "preview") {
      setMediaSubStep("editor");
      return;
    }
    if (hasDraft) {
      setShowDiscardModal(true);
    } else {
      goBack();
    }
  };

  const goBack = () => {
    setStep("select");
    setShowDiscardModal(false);
    setMediaFile(null);
    if (mediaPreviewUrl) URL.revokeObjectURL(mediaPreviewUrl);
    setMediaPreviewUrl(null);
    setTextContent("");
    if (textEditRef.current) textEditRef.current.innerHTML = "";
    prevHtmlRef.current = "";
    setError("");
    setVisDropOpen(false);
    setEmojiPickerOpen(false);
    setPhotoRotation(0);
    setPhotoZoom(1);
    setTrimStart(0);
    setTrimEnd(0);
    setMediaSubStep("editor");
  };

  /* ── Submit ──────────────────────────────────────── */

  const handleSubmit = async () => {
    setError("");
    if (step === "media") {
      if (!mediaFile) { setError(t("errMediaRequired")); return; }
      setUploading(true);
      setUploadProgress(0);
      try {
        const uploaded = await uploadStoryMedia({ token, file: mediaFile, onProgress: setUploadProgress });
        const isVideo = uploaded.type === "video";
        const trimStartMs = isVideo && trimStart > 0 ? Math.round(trimStart * 1000) : undefined;
        const trimEndMs = isVideo && trimEnd > 0 ? Math.round(trimEnd * 1000) : undefined;
        // mediaDurationMs = trimmed duration (what the viewer will actually play)
        const mediaDurationMs = isVideo && trimEnd > trimStart
          ? Math.round((trimEnd - trimStart) * 1000)
          : uploaded.mediaDurationMs;
        const story = await createStory({
          token,
          payload: { type: "media", mediaType: uploaded.type, mediaUrl: uploaded.url, mediaDurationMs, trimStartMs, trimEndMs, visibility },
        });
        onCreated(story);
        goBack();
      } catch (err: any) {
        setError(err?.message || t("errUploadFailed"));
      } finally {
        setUploading(false);
        setUploadProgress(0);
      }
    } else {
      const text = (textEditRef.current?.innerText ?? textContent).trim();
      if (!text) { setError(t("errTextRequired")); return; }
      setUploading(true);
      try {
        const story = await createStory({
          token,
          payload: { type: "text", textContent: text, backgroundStyle: bgStyle, visibility },
        });
        onCreated(story);
        goBack();
      } catch (err: any) {
        setError(err?.message || t("errUploadFailed"));
      } finally {
        setUploading(false);
      }
    }
  };

  const selectedVis = VISIBILITY_OPTIONS.find((o) => o.value === visibility)!;

  /* ── Selection screen ────────────────────────────── */

  if (step === "select") {
    return (
      <div className={styles.selectScreen}>
        <button className={styles.selectCard} onClick={selectMedia}>
          <div className={styles.selectCardBg} style={{ background: "linear-gradient(160deg,#4f8ef7,#a259f7)" }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="3" width="18" height="18" rx="3" stroke="#fff" strokeWidth="1.8" />
              <circle cx="8.5" cy="8.5" r="1.5" fill="#fff" />
              <path d="M21 15l-5-5L5 21" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </div>
          <span className={styles.selectCardLabel}>{t("tabMedia")}</span>
        </button>

        <button className={styles.selectCard} onClick={selectText}>
          <div className={styles.selectCardBg} style={{ background: "linear-gradient(160deg,#f953c6,#f97316)" }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
              <path d="M4 7h16M12 7v10M8 17h8" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </div>
          <span className={styles.selectCardLabel}>{t("tabText")}</span>
        </button>
      </div>
    );
  }

  /* ── Discard overlay — shared across all sub-steps ── */
  const discardModal = showDiscardModal ? (
    <div className={styles.modalOverlay} onClick={() => setShowDiscardModal(false)}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <p className={styles.modalTitle}>{t("discardTitle")}</p>
        <p className={styles.modalBody}>{t("discardBody")}</p>
        <div className={styles.modalActions}>
          <button className={styles.modalCancel} onClick={() => setShowDiscardModal(false)}>
            {t("discardCancel")}
          </button>
          <button className={styles.modalConfirm} onClick={goBack}>
            {t("discardConfirm")}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  /* ── Media editor sub-step ──────────────────────── */

  if (step === "media" && mediaSubStep === "editor") {
    if (!mediaFile) {
      return (
        <>
          <div className={styles.editorPlaceholder}>
            <div className={styles.editorPlaceholderInner}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.6" />
                <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" />
                <path d="M21 15l-5-5L5 21" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              <p>{t("dropHint")}</p>
              <button className={styles.uploadBtn} onClick={() => fileInputRef.current?.click()}>
                {t("btnChooseFile")}
              </button>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*,video/*" style={{ display: "none" }} onChange={handleFileInput} />
          </div>
          {discardModal}
        </>
      );
    }

    if (mediaType === "image" && mediaPreviewUrl) {
      return (
        <>
          <div className={styles.editorRoot}>
            <div className={styles.editorHeader}>
              <button className={styles.editorBackBtn} onClick={handleBack}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M19 12H5M5 12l7-7M5 12l7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <span className={styles.editorTitle}>{t("editPhoto")}</span>
              <button className={styles.editorDoneBtn} onClick={confirmPhotoEdit}>{t("btnDone")}</button>
            </div>

            <div className={styles.photoEditorCanvas}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={photoImgRef}
                src={mediaPreviewUrl}
                alt="edit"
                className={styles.photoEditorImg}
                style={{ transform: `rotate(${photoRotation}deg) scale(${photoZoom})`, transition: "transform 0.22s ease" }}
                draggable={false}
              />
            </div>

            <div className={styles.photoEditorTools}>
              <div className={styles.photoToolGroup}>
                <span className={styles.photoToolLabel}>{t("labelRotate")}</span>
                <div className={styles.photoToolBtns}>
                  <button className={styles.photoToolBtn} onClick={() => setPhotoRotation((r) => (r - 90 + 360) % 360)}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                      <path d="M3 12a9 9 0 1 0 9-9 9 9 0 0 0-6.36 2.64L3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                      <path d="M3 3v6h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                  <span className={styles.photoToolValue}>{photoRotation}°</span>
                  <button className={styles.photoToolBtn} onClick={() => setPhotoRotation((r) => (r + 90) % 360)}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                      <path d="M21 12a9 9 0 1 1-9-9 9 9 0 0 1 6.36 2.64L21 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                      <path d="M21 3v6h-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </div>
              </div>
              <div className={styles.photoToolGroup}>
                <span className={styles.photoToolLabel}>{t("labelZoom")} {photoZoom.toFixed(1)}×</span>
                <input type="range" min="1" max="3" step="0.05" value={photoZoom}
                  onChange={(e) => setPhotoZoom(Number(e.target.value))} className={styles.zoomSlider} />
              </div>
              <button className={styles.photoResetBtn} onClick={() => { setPhotoRotation(0); setPhotoZoom(1); }}>
                {t("btnReset")}
              </button>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*,video/*" style={{ display: "none" }} onChange={handleFileInput} />
          </div>
          {discardModal}
        </>
      );
    }

    if (mediaType === "video" && mediaPreviewUrl && videoDuration > 0) {
      return (
        <>
          <div className={styles.editorRoot}>
            <div className={styles.videoTrimPreview}>
              {/* controlled by VideoTrimmer via previewVideoRef */}
              <video
                ref={trimPreviewVideoRef}
                src={mediaPreviewUrl}
                className={styles.videoTrimVideo}
                playsInline
                preload="auto"
                onLoadedMetadata={(e) => {
                  e.currentTarget.currentTime = trimStart;
                }}
              />
            </div>
            <VideoTrimmer
              videoUrl={mediaPreviewUrl}
              duration={videoDuration}
              initialStartSec={trimStart}
              initialEndSec={trimEnd > 0 ? trimEnd : videoDuration}
              maxDurationSec={20}
              previewVideoRef={trimPreviewVideoRef}
              onConfirm={confirmVideoTrim}
              onCancel={handleBack}
            />
            <input ref={fileInputRef} type="file" accept="image/*,video/*" style={{ display: "none" }} onChange={handleFileInput} />
          </div>
          {discardModal}
        </>
      );
    }

    return (
      <>
        <div className={styles.editorPlaceholder}>
          <div className={styles.editorPlaceholderInner}>
            <p style={{ color: "var(--color-text-muted,#888)" }}>Đang tải...</p>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*,video/*" style={{ display: "none" }} onChange={handleFileInput} />
        </div>
        {discardModal}
      </>
    );
  }

  /* ── Creator screen (media preview or text) ──────── */

  return (
    <>
      <div className={styles.creator}>
        <button className={styles.backBtn} onClick={handleBack} aria-label="Quay lại">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M19 12H5M5 12l7-7M5 12l7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>{t("btnBack")}</span>
        </button>

        <div className={styles.mainArea}>
          <div
            className={styles.preview}
            style={step === "text" ? { background: bgStyle } : {}}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleFileDrop}
          >
            {step === "media" && mediaFile && mediaType === "image" && mediaPreviewUrl && (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={mediaPreviewUrl} alt="preview" className={styles.previewImg} />
                <button className={styles.changeMedia} onClick={() => setMediaSubStep("editor")}>
                  {t("btnEditPhoto")}
                </button>
                <button className={styles.changeMediaAlt} onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
                  {t("btnChangePhoto")}
                </button>
              </>
            )}

            {step === "media" && mediaFile && mediaType === "video" && mediaPreviewUrl && (
              <>
                <TrimmedVideoPreview
                  src={mediaPreviewUrl}
                  trimStart={trimStart}
                  trimEnd={trimEnd > 0 ? trimEnd : videoDuration}
                  className={styles.previewVideo}
                />
                {(trimStart > 0 || trimEnd < videoDuration) && (
                  <div className={styles.trimBadge}>
                    {fmtSec(trimStart)} – {fmtSec(trimEnd)}
                  </div>
                )}
                <button className={styles.changeMedia} onClick={() => setMediaSubStep("editor")}>
                  {t("btnEditVideo")}
                </button>
                <button className={styles.changeMediaAlt} onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
                  {t("btnChangeVideo")}
                </button>
              </>
            )}

            {step === "text" && (
              <>
                <div ref={textWrapperRef} className={styles.textEditWrapper} onClick={() => textEditRef.current?.focus()}>
                  <div
                    ref={textEditRef}
                    className={styles.previewTextEditable}
                    contentEditable
                    suppressContentEditableWarning
                    data-placeholder={t("placeholderText")}
                    onInput={handleTextInput}
                    onKeyDown={(e) => {
                      scrollSnapRef.current = window.scrollY;
                      if (e.key === "Enter") {
                        e.preventDefault();
                        document.execCommand("insertLineBreak");
                        window.scrollTo({ top: scrollSnapRef.current, behavior: "instant" });
                      }
                    }}
                    onKeyUp={saveCursorRange}
                    onMouseUp={saveCursorRange}
                    spellCheck={false}
                  />
                </div>

                <div className={styles.emojiZone} ref={emojiPickerRef}>
                  <button
                    className={styles.emojiBtn}
                    aria-label="Thêm emoji"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      saveCursorRange();
                      setEmojiPickerOpen((o) => !o);
                    }}
                  >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.8" />
                      <circle cx="9" cy="10.5" r="1.2" fill="currentColor" />
                      <circle cx="15" cy="10.5" r="1.2" fill="currentColor" />
                      <path d="M8.5 14.5c.8 1.5 6.2 1.5 7 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    </svg>
                  </button>
                  {emojiPickerOpen && (
                    <div className={styles.emojiPickerWrap}>
                      <EmojiPicker
                        onEmojiClick={(data) => insertEmojiAtCursor(data.emoji)}
                        lazyLoadEmojis
                        skinTonesDisabled={false}
                        searchDisabled={false}
                        height={320}
                        width={210}
                      />
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Options */}
          <div className={styles.optionsSection}>
            {step === "text" && (
              <div className={styles.optionRow}>
                <span className={styles.optionLabel}>{t("labelBackground")}</span>
                <div className={styles.bgPicker}>
                  {BG_OPTIONS.map((bg) => (
                    <div
                      key={bg.id}
                      className={`${styles.bgOption} ${bgStyle === bg.value ? styles.selected : ""}`}
                      style={{ background: bg.value }}
                      onClick={() => setBgStyle(bg.value)}
                      title={bg.label}
                    />
                  ))}
                </div>
              </div>
            )}

            <div className={styles.optionRow}>
              <span className={styles.optionLabel}>{t("labelAudience")}</span>
              <div className={styles.visWrapper} ref={visDropRef}>
                <button className={styles.visButton} onClick={() => setVisDropOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={visDropOpen}>
                  <span className={styles.visIcon}><selectedVis.Icon /></span>
                  <span>{t(selectedVis.tKey)}</span>
                  <svg className={`${styles.visChevron} ${visDropOpen ? styles.open : ""}`} width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                {visDropOpen && (
                  <div className={styles.visDropdown} role="listbox">
                    {VISIBILITY_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        className={`${styles.visOption} ${visibility === opt.value ? styles.visOptionActive : ""}`}
                        role="option"
                        aria-selected={visibility === opt.value}
                        onClick={() => { setVisibility(opt.value); setVisDropOpen(false); }}
                      >
                        <span className={styles.visOptionIcon}><opt.Icon /></span>
                        <span>{t(opt.tKey)}</span>
                        {visibility === opt.value && (
                          <svg className={styles.visCheck} width="14" height="14" viewBox="0 0 14 14" fill="none">
                            <path d="M2.5 7l3 3 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {uploading && (
              <div className={styles.progressWrap}>
                <div className={styles.progressBar} style={{ width: `${uploadProgress}%` }} />
              </div>
            )}

            {error && <div className={styles.error}>{error}</div>}

            <button className={styles.submitBtn} onClick={handleSubmit} disabled={uploading}>
              {uploading ? t("btnPosting") : t("btnPost")}
            </button>
          </div>
        </div>
      </div>

      <input ref={fileInputRef} type="file" accept="image/*,video/*" style={{ display: "none" }} onChange={handleFileInput} />

      {/* Discard confirm modal */}
      {discardModal}
    </>
  );
}

/* ── TrimmedVideoPreview ─────────────────────────────
   Plays only the [trimStart, trimEnd] window, looping. */
function TrimmedVideoPreview({
  src,
  trimStart,
  trimEnd,
  className,
}: {
  src: string;
  trimStart: number;
  trimEnd: number;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const vid = ref.current;
    if (!vid) return;

    // Seek to trimStart whenever src or trim bounds change
    const onCanPlay = () => {
      if (vid.currentTime < trimStart || vid.currentTime > trimEnd) {
        vid.currentTime = trimStart;
      }
      vid.play().catch(() => {});
    };

    const onTimeUpdate = () => {
      if (trimEnd > trimStart && vid.currentTime >= trimEnd) {
        vid.currentTime = trimStart;
        vid.play().catch(() => {});
      }
    };

    vid.addEventListener("canplay", onCanPlay);
    vid.addEventListener("timeupdate", onTimeUpdate);

    // If video is already ready, seek immediately
    if (vid.readyState >= 3) {
      vid.currentTime = trimStart;
      vid.play().catch(() => {});
    }

    return () => {
      vid.removeEventListener("canplay", onCanPlay);
      vid.removeEventListener("timeupdate", onTimeUpdate);
    };
  }, [trimStart, trimEnd]);

  return (
    <video
      ref={ref}
      src={src}
      className={className}
      muted
      playsInline
      preload="auto"
    />
  );
}

function fmtSec(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}
