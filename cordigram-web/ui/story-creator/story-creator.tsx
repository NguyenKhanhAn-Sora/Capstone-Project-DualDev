"use client";

import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import EmojiPicker from "emoji-picker-react";
import { uploadStoryMedia, createStory, type StoryItem } from "@/lib/api";
import VideoTrimmer from "./video-trimmer";
import PhotoTextEditor, { type PhotoOverlay, OVERLAY_COLORS } from "./photo-text-editor";
import styles from "./story-creator.module.css";

/* ── Color extraction helpers ───────────────────────── */
function parseRgb(color: string): [number, number, number] {
  const m = color.match(/\d+/g);
  if (!m || m.length < 3) return [26, 26, 46];
  return [parseInt(m[0]), parseInt(m[1]), parseInt(m[2])];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if      (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else                h = ((r - g) / d + 4) / 6;
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

function extractDominantColor(img: HTMLImageElement): string {
  try {
    const canvas = document.createElement("canvas");
    const SIZE = 80;
    canvas.width = SIZE; canvas.height = SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "rgb(100,60,120)";
    ctx.drawImage(img, 0, 0, SIZE, SIZE);
    const data = ctx.getImageData(0, 0, SIZE, SIZE).data;
    let rW = 0, gW = 0, bW = 0, totalW = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
      if (a < 128) continue;
      const brightness = (r + g + b) / 3;
      if (brightness < 18 || brightness > 238) continue;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const sat = max === 0 ? 0 : (max - min) / max;
      if (sat < 0.12) continue;
      const w = sat * sat;
      rW += r * w; gW += g * w; bW += b * w; totalW += w;
    }
    if (totalW === 0) {
      let rs = 0, gs = 0, bs = 0, n = 0;
      for (let i = 0; i < data.length; i += 4) { rs += data[i]; gs += data[i + 1]; bs += data[i + 2]; n++; }
      if (n === 0) return "rgb(100,60,120)";
      return `rgb(${Math.round(rs / n)},${Math.round(gs / n)},${Math.round(bs / n)})`;
    }
    return `rgb(${Math.round(rW / totalW)},${Math.round(gW / totalW)},${Math.round(bW / totalW)})`;
  } catch {
    return "rgb(100,60,120)";
  }
}

function buildGradientBg(color: string): string {
  const [r, g, b] = parseRgb(color);
  const [h, s, l] = rgbToHsl(r, g, b);
  const s2     = Math.min(s + 15, 100);
  const lLight = Math.min(l + 30, 85);
  const lMid   = l;
  const lDark  = Math.max(l - 28, 6);
  return `linear-gradient(to bottom, hsl(${h},${s2}%,${lLight}%) 0%, hsl(${h},${s2}%,${lMid}%) 50%, hsl(${h},${s2}%,${lDark}%) 100%)`;
}

/* ── Background presets ─────────────────────────────── */
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

/* ── Icons ──────────────────────────────────────────── */
function IconFollowers() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="9" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M2 20c0-3.866 3.134-7 7-7s7 3.134 7 7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="18" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M16 20c0-2.5 1.5-4.5 4-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
function IconPublic() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9.25" stroke="currentColor" strokeWidth="1.7" />
      <ellipse cx="12" cy="12" rx="3.75" ry="9.25" stroke="currentColor" strokeWidth="1.7" />
      <path d="M3 9h18M3 15h18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
function IconPrivate() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M8 11V7a4 4 0 018 0v4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

const VISIBILITY_OPTIONS = [
  { value: "followers" as const, Icon: IconFollowers, tKey: "optFollowers" as const },
  { value: "public"    as const, Icon: IconPublic,    tKey: "optPublic"    as const },
  { value: "private"   as const, Icon: IconPrivate,   tKey: "optPrivate"   as const },
];

type VisibilityValue = "followers" | "public" | "private";
type Step = "select" | "media" | "text";
type MediaSubStep = "editor" | "preview";
type Props = { token: string; onCreated: (story: StoryItem) => void; };

/* ── Main component ─────────────────────────────────── */
export default function StoryCreator({ token, onCreated }: Props) {
  const t = useTranslations("storyCreator");

  /* state */
  const [step,             setStep]             = useState<Step>("select");
  const [mediaSubStep,     setMediaSubStep]     = useState<MediaSubStep>("editor");
  const [showDiscardModal, setShowDiscardModal] = useState(false);

  const [mediaFile,        setMediaFile]        = useState<File | null>(null);
  const [mediaPreviewUrl,  setMediaPreviewUrl]  = useState<string | null>(null);
  const [mediaType,        setMediaType]        = useState<"image" | "video">("image");
  const [videoDuration,    setVideoDuration]    = useState(0);
  const [trimStart,        setTrimStart]        = useState(0);
  const [trimEnd,          setTrimEnd]          = useState(0);

  const [photoRotation,    setPhotoRotation]    = useState(0);
  const [photoZoom,        setPhotoZoom]        = useState(2);
  const [photoOffsetX,     setPhotoOffsetX]     = useState(0);
  const [photoOffsetY,     setPhotoOffsetY]     = useState(0);
  const [dominantColor,    setDominantColor]    = useState("");
  const [isDraggingPhoto,  setIsDraggingPhoto]  = useState(false);
  const [photoOverlays,    setPhotoOverlays]    = useState<PhotoOverlay[]>([]);
  const [textSelectedId,   setTextSelectedId]   = useState<string | null>(null);
  const [textInputMode,    setTextInputMode]     = useState(false);
  const [textInputColor,   setTextInputColor]    = useState("#ffffff");
  const [textInputFontSize, setTextInputFontSize] = useState(28);

  const [bgStyle,          setBgStyle]          = useState(BG_OPTIONS[0].value);
  const [textContent,      setTextContent]      = useState("");
  const [visibility,       setVisibility]       = useState<VisibilityValue>("followers");
  const [visDropOpen,      setVisDropOpen]      = useState(false);
  const [uploading,        setUploading]        = useState(false);
  const [uploadProgress,   setUploadProgress]   = useState(0);
  const [error,            setError]            = useState("");
  const [emojiPickerOpen,  setEmojiPickerOpen]  = useState(false);
  const [addTextTrigger,   setAddTextTrigger]   = useState(0);

  /* refs */
  const fileInputRef        = useRef<HTMLInputElement>(null);
  const textEditRef         = useRef<HTMLDivElement>(null);
  const textWrapperRef      = useRef<HTMLDivElement>(null);
  const prevHtmlRef         = useRef<string>("");
  const savedRangeRef       = useRef<Range | null>(null);
  const scrollSnapRef       = useRef<number>(0);
  const emojiPickerRef      = useRef<HTMLDivElement>(null);
  const visDropRef          = useRef<HTMLDivElement>(null);
  const photoImgRef         = useRef<HTMLImageElement>(null);
  const photoCanvasRef      = useRef<HTMLDivElement>(null);
  const trimPreviewVideoRef = useRef<HTMLVideoElement>(null);
  const photoOffsetXRef     = useRef(0);
  const photoOffsetYRef     = useRef(0);
  const photoRotationRef    = useRef(0);
  const photoZoomRef        = useRef(2);
  const photoImgWrapperRef  = useRef<HTMLDivElement>(null);
  const zoomSliderRef       = useRef<HTMLInputElement>(null);
  const zoomLabelRef        = useRef<HTMLSpanElement>(null);
  const photoCanvasDimsRef  = useRef({ w: 240, h: 427 }); // last known editor canvas size

  /* keep offset/rotation/zoom refs in sync for drag closures */
  useEffect(() => { photoOffsetXRef.current = photoOffsetX; }, [photoOffsetX]);
  useEffect(() => { photoOffsetYRef.current = photoOffsetY; }, [photoOffsetY]);
  useEffect(() => { photoRotationRef.current = photoRotation; }, [photoRotation]);
  useEffect(() => { photoZoomRef.current = photoZoom; }, [photoZoom]);

  /* close vis dropdown on outside click */
  useEffect(() => {
    if (!visDropOpen) return;
    const handler = (e: MouseEvent) => {
      if (visDropRef.current && !visDropRef.current.contains(e.target as Node)) setVisDropOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [visDropOpen]);

  /* close emoji picker on outside click */
  useEffect(() => {
    if (!emojiPickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) setEmojiPickerOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [emojiPickerOpen]);

  /* extract dominant color whenever a new image URL is set */
  useEffect(() => {
    if (!mediaPreviewUrl || mediaType !== "image") return;
    setDominantColor("");
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload  = () => setDominantColor(extractDominantColor(img));
    img.onerror = () => setDominantColor("rgb(100,60,120)");
    img.src = mediaPreviewUrl;
  }, [mediaPreviewUrl, mediaType]);

  /* canvas background gradient */
  const canvasBgStyle = useMemo(
    () => dominantColor ? buildGradientBg(dominantColor) : "#0a0a1e",
    [dominantColor],
  );

  /* ── Text helpers ──────────────────────────────────── */
  const moveCursorToEnd = (el: HTMLDivElement) => {
    const range = document.createRange();
    const sel = window.getSelection();
    range.selectNodeContents(el); range.collapse(false);
    sel?.removeAllRanges(); sel?.addRange(range);
  };
  const saveCursorRange = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) savedRangeRef.current = sel.getRangeAt(0).cloneRange();
  };
  const insertEmojiAtCursor = (emoji: string) => {
    const el = textEditRef.current;
    const wrapper = textWrapperRef.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (savedRangeRef.current && sel) { sel.removeAllRanges(); sel.addRange(savedRangeRef.current); }
    const snapY = window.scrollY;
    document.execCommand("insertText", false, emoji);
    window.scrollTo({ top: snapY, behavior: "instant" });
    requestAnimationFrame(() => {
      if (wrapper && el.scrollHeight > wrapper.clientHeight) { el.innerHTML = prevHtmlRef.current; moveCursorToEnd(el); }
      else { prevHtmlRef.current = el.innerHTML; setTextContent(el.innerText); saveCursorRange(); }
      window.scrollTo({ top: snapY, behavior: "instant" });
    });
  };
  const handleTextInput = (e: React.FormEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const wrapper = textWrapperRef.current;
    if (!wrapper) return;
    const snapY = scrollSnapRef.current;
    requestAnimationFrame(() => {
      if (el.scrollHeight > wrapper.clientHeight) { el.innerHTML = prevHtmlRef.current; moveCursorToEnd(el); }
      else { prevHtmlRef.current = el.innerHTML; setTextContent(el.innerText); saveCursorRange(); }
      window.scrollTo({ top: snapY, behavior: "instant" });
    });
  };

  /* ── File handling ─────────────────────────────────── */
  const handleFileSelect = (file: File) => {
    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) { setError(t("errMediaType")); return; }
    const isVid = file.type.startsWith("video/");
    setMediaType(isVid ? "video" : "image");
    setMediaFile(file);
    const url = URL.createObjectURL(file);
    setMediaPreviewUrl(url);
    setError("");
    setPhotoRotation(0); setPhotoZoom(2);
    setPhotoOffsetX(0);  setPhotoOffsetY(0);
    setDominantColor(""); setIsDraggingPhoto(false);
    setTrimStart(0); setTrimEnd(0);
    setMediaSubStep("editor");
    if (isVid) {
      const vid = document.createElement("video");
      vid.src = url; vid.preload = "metadata";
      vid.onloadedmetadata = () => { setVideoDuration(vid.duration); setTrimEnd(vid.duration); vid.src = ""; };
    }
  };
  const handleFileDrop  = (e: React.DragEvent) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleFileSelect(f); };
  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); e.target.value = ""; };

  /* ── Select type ───────────────────────────────────── */
  const selectMedia = () => { setStep("media"); setTimeout(() => fileInputRef.current?.click(), 50); };
  const selectText  = () => setStep("text");

  /* ── Photo drag (repositioning) ────────────────────── */
  const handlePhotoDragStart = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDraggingPhoto(true);
    const startX = e.clientX, startY = e.clientY;
    const startOX = photoOffsetXRef.current, startOY = photoOffsetYRef.current;

    const onMove = (me: PointerEvent) => {
      const newX = startOX + me.clientX - startX;
      const newY = startOY + me.clientY - startY;
      // Update refs without triggering React re-render during drag
      photoOffsetXRef.current = newX;
      photoOffsetYRef.current = newY;
      // Apply transform directly to DOM — zero re-renders during drag
      if (photoImgWrapperRef.current) {
        photoImgWrapperRef.current.style.transform =
          `translate(${newX}px, ${newY}px) rotate(${photoRotationRef.current}deg) scale(${photoZoomRef.current / 2})`;
      }
    };

    const onUp = () => {
      // Commit final position to React state once (single re-render)
      setPhotoOffsetX(photoOffsetXRef.current);
      setPhotoOffsetY(photoOffsetYRef.current);
      setIsDraggingPhoto(false);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, []);

  /* ── Confirm photo edit → bake 9:16 with bg fill ───── */
  /* ── Confirm photo edit — just save canvas dims + go to preview, no baking ── */
  const confirmPhotoEdit = useCallback(() => {
    if (photoCanvasRef.current) {
      photoCanvasDimsRef.current = {
        w: photoCanvasRef.current.clientWidth,
        h: photoCanvasRef.current.clientHeight,
      };
    }
    setMediaSubStep("preview");
  }, []);

  /* ── Bake photo to 9:16 — only called at submit time ── */
  const bakePhotoForUpload = useCallback((): Promise<File> => {
    return new Promise((resolve) => {
      if (!mediaFile || !mediaPreviewUrl) { resolve(mediaFile!); return; }
      const img = new Image();
      img.onload = () => {
        const OUT_W = 1080, OUT_H = 1920;
        const bakeScale = OUT_W / photoCanvasDimsRef.current.w;
        const oc = document.createElement("canvas");
        oc.width = OUT_W; oc.height = OUT_H;
        const ctx = oc.getContext("2d")!;
        // Linear top→bottom gradient
        const bgColor = dominantColor || "rgb(10,10,30)";
        const [r0, g0, b0] = parseRgb(bgColor);
        const [h, s, l] = rgbToHsl(r0, g0, b0);
        const s2 = Math.min(s + 15, 100);
        const grad = ctx.createLinearGradient(0, 0, 0, OUT_H);
        grad.addColorStop(0,   `hsl(${h},${s2}%,${Math.min(l + 30, 85)}%)`);
        grad.addColorStop(0.5, `hsl(${h},${s2}%,${l}%)`);
        grad.addColorStop(1,   `hsl(${h},${s2}%,${Math.max(l - 28, 6)}%)`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, OUT_W, OUT_H);
        // Image
        const containScale = Math.min(OUT_W / img.naturalWidth, OUT_H / img.naturalHeight);
        ctx.save();
        ctx.translate(OUT_W / 2 + photoOffsetX * bakeScale, OUT_H / 2 + photoOffsetY * bakeScale);
        ctx.rotate((photoRotation * Math.PI) / 180);
        ctx.scale((photoZoom / 2) * containScale, (photoZoom / 2) * containScale);
        ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
        ctx.restore();
        oc.toBlob((blob) => {
          resolve(blob ? new File([blob], mediaFile.name, { type: "image/jpeg" }) : mediaFile);
        }, "image/jpeg", 0.92);
      };
      img.onerror = () => resolve(mediaFile);
      img.src = mediaPreviewUrl;
    });
  }, [mediaFile, mediaPreviewUrl, dominantColor, photoOffsetX, photoOffsetY, photoRotation, photoZoom]);

  /* ── Video trim confirm ────────────────────────────── */
  const confirmVideoTrim = (start: number, end: number) => { setTrimStart(start); setTrimEnd(end); setMediaSubStep("preview"); };

  /* ── Back / discard ────────────────────────────────── */
  const hasDraft = step === "media" ? !!mediaFile : step === "text" ? !!textContent.trim() : false;
  const handleBack = () => {
    if (step === "media" && mediaSubStep === "preview") { setMediaSubStep("editor"); return; }
    if (hasDraft) setShowDiscardModal(true); else goBack();
  };
  const goBack = () => {
    setStep("select"); setShowDiscardModal(false);
    setMediaFile(null);
    if (mediaPreviewUrl) URL.revokeObjectURL(mediaPreviewUrl);
    setMediaPreviewUrl(null);
    setTextContent("");
    if (textEditRef.current) textEditRef.current.innerHTML = "";
    prevHtmlRef.current = "";
    setError(""); setVisDropOpen(false); setEmojiPickerOpen(false);
    setPhotoRotation(0); setPhotoZoom(1);
    setPhotoOffsetX(0); setPhotoOffsetY(0);
    setDominantColor(""); setIsDraggingPhoto(false);
    setPhotoOverlays([]);
    setTextSelectedId(null); setTextInputMode(false);
    setTextInputColor("#ffffff"); setTextInputFontSize(28);
    setTrimStart(0); setTrimEnd(0);
    setMediaSubStep("editor"); setAddTextTrigger(0);
  };

  const handleTextSelectChange = useCallback((id: string | null) => {
    setTextSelectedId(id);
    if (id !== null) setTextInputMode(false);
  }, []);

  const handleTextInputModeToggle = useCallback((active: boolean) => {
    setTextInputMode(active);
    if (active) setTextSelectedId(null);
  }, []);

  /* ── Submit ────────────────────────────────────────── */
  const handleSubmit = async () => {
    setError("");
    if (step === "media") {
      if (!mediaFile) { setError(t("errMediaRequired")); return; }
      setUploading(true); setUploadProgress(0);
      try {
        const fileToUpload = mediaType === "image" ? await bakePhotoForUpload() : mediaFile;
        const uploaded = await uploadStoryMedia({ token, file: fileToUpload, onProgress: setUploadProgress });
        const isVideo = uploaded.type === "video";
        const trimStartMs = isVideo && trimStart > 0 ? Math.round(trimStart * 1000) : undefined;
        const trimEndMs   = isVideo && trimEnd   > 0 ? Math.round(trimEnd   * 1000) : undefined;
        const mediaDurationMs = isVideo && trimEnd > trimStart ? Math.round((trimEnd - trimStart) * 1000) : uploaded.mediaDurationMs;
        const canvasH = photoCanvasDimsRef.current.h || 450;
        const overlaysPayload = uploaded.type === "image"
          ? photoOverlays.filter((o) => o.text.trim()).map((o) => ({
              text: o.text, color: o.color,
              fontSize: parseFloat(((o.fontSize / canvasH) * 100).toFixed(4)),
              x: Math.round(o.x * 10) / 10, y: Math.round(o.y * 10) / 10,
            }))
          : [];
        const story = await createStory({ token, payload: { type: "media", mediaType: uploaded.type, mediaUrl: uploaded.url, mediaDurationMs, trimStartMs, trimEndMs, textOverlays: overlaysPayload, visibility } });
        onCreated(story); goBack();
      } catch (err: any) {
        setError(err?.message || t("errUploadFailed"));
      } finally { setUploading(false); setUploadProgress(0); }
    } else {
      const text = (textEditRef.current?.innerText ?? textContent).trim();
      if (!text) { setError(t("errTextRequired")); return; }
      setUploading(true);
      try {
        const story = await createStory({ token, payload: { type: "text", textContent: text, backgroundStyle: bgStyle, visibility } });
        onCreated(story); goBack();
      } catch (err: any) {
        setError(err?.message || t("errUploadFailed"));
      } finally { setUploading(false); }
    }
  };

  const selectedVis = VISIBILITY_OPTIONS.find((o) => o.value === visibility)!;

  /* ════════════════════════════════════════════════════
     JSX
  ════════════════════════════════════════════════════ */

  /* ── Select screen ─────────────────────────────────── */
  if (step === "select") {
    return (
      <div className={styles.selectScreen}>
        <div className={styles.selectHeader}>
          <h2 className={styles.selectTitle}>Create Story</h2>
          <p className={styles.selectSub}>Choose a format to get started</p>
        </div>
        <div className={styles.selectCards}>
          <button className={styles.selectCard} onClick={selectMedia}>
            <div className={styles.selectCardBg} style={{ background: "linear-gradient(160deg,#4361ee,#7b2ff7)" }}>
              <div className={styles.selectCardIcon}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                  <rect x="3" y="3" width="18" height="18" rx="3.5" stroke="#fff" strokeWidth="1.6" />
                  <circle cx="8.5" cy="8.5" r="1.5" fill="#fff" />
                  <path d="M21 15l-5-5L5 21" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <span className={styles.selectCardLabel}>{t("tabMedia")}</span>
            </div>
          </button>
          <button className={styles.selectCard} onClick={selectText}>
            <div className={styles.selectCardBg} style={{ background: "linear-gradient(160deg,#f953c6,#ff6b35)" }}>
              <div className={styles.selectCardIcon}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                  <path d="M4 7h16M12 7v10M8 17h8" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </div>
              <span className={styles.selectCardLabel}>{t("tabText")}</span>
            </div>
          </button>
        </div>
      </div>
    );
  }

  /* ── Discard modal ─────────────────────────────────── */
  const discardModal = showDiscardModal ? (
    <div className={styles.modalOverlay} onClick={() => setShowDiscardModal(false)}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalIcon}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M12 9v5M12 17.5h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          </svg>
        </div>
        <p className={styles.modalTitle}>{t("discardTitle")}</p>
        <p className={styles.modalBody}>{t("discardBody")}</p>
        <div className={styles.modalActions}>
          <button className={styles.modalCancel} onClick={() => setShowDiscardModal(false)}>{t("discardCancel")}</button>
          <button className={styles.modalConfirm} onClick={goBack}>{t("discardConfirm")}</button>
        </div>
      </div>
    </div>
  ) : null;

  /* ── Media editor: no file ─────────────────────────── */
  if (step === "media" && mediaSubStep === "editor" && !mediaFile) {
    return (
      <>
        <div className={styles.editorPlaceholder}>
          <div className={styles.editorPlaceholderInner}>
            <div className={styles.editorPlaceholderIcon}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.6" />
                <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" />
                <path d="M21 15l-5-5L5 21" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </div>
            <p className={styles.editorPlaceholderText}>{t("dropHint")}</p>
            <button className={styles.uploadBtn} onClick={() => fileInputRef.current?.click()}>{t("btnChooseFile")}</button>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*,video/*" style={{ display: "none" }} onChange={handleFileInput} />
        </div>
        {discardModal}
      </>
    );
  }

  /* ── Media editor: image with drag + dominant color ── */
  if (step === "media" && mediaSubStep === "editor" && mediaType === "image" && mediaPreviewUrl) {
    return (
      <>
        <div className={styles.editorRoot}>
          <div className={styles.editorHeader}>
            <button className={styles.editorBackBtn} onClick={handleBack} aria-label="Back">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M19 12H5M5 12l7-7M5 12l7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <span className={styles.editorTitle}>{t("editPhoto")}</span>
            <button className={styles.editorDoneBtn} onClick={confirmPhotoEdit}>{t("btnDone")}</button>
          </div>

          <div className={styles.editorMainRow}>
          {/* ── Draggable 9:16 canvas ── */}
          <div className={styles.photoEditorCanvasWrap}>
            <div
              ref={photoCanvasRef}
              className={styles.photoEditorCanvas}
              style={{ background: canvasBgStyle, cursor: isDraggingPhoto ? "grabbing" : "grab" }}
              onPointerDown={handlePhotoDragStart}
            >
              {/* image wrapper — translate/rotate/zoom applied here */}
              <div
                ref={photoImgWrapperRef}
                className={styles.photoEditorImgWrapper}
                style={{
                  transform: `translate(${photoOffsetX}px, ${photoOffsetY}px) rotate(${photoRotation}deg) scale(${photoZoom / 2})`,
                  transition: isDraggingPhoto ? "none" : "transform 0.22s ease",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  ref={photoImgRef}
                  src={mediaPreviewUrl}
                  alt="edit"
                  className={styles.photoEditorImg}
                  draggable={false}
                />
              </div>

              {/* Drag hint */}
              {!isDraggingPhoto && (
                <div className={styles.dragHint}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                    <path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M3 12h18M12 3v18"
                      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span>Drag to reposition</span>
                </div>
              )}

            </div>
          </div>

          <div className={styles.photoEditorSidePanel}>
          <div className={styles.photoEditorTools}>
            <div className={styles.photoToolGroup}>
              <span className={styles.photoToolLabel}>{t("labelRotate")}</span>
              <div className={styles.photoToolBtns}>
                <button className={styles.photoToolBtn} onClick={() => setPhotoRotation((r) => (r - 90 + 360) % 360)}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M3 12a9 9 0 1 0 9-9 9 9 0 0 0-6.36 2.64L3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                    <path d="M3 3v6h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                <span className={styles.photoToolValue}>{photoRotation}°</span>
                <button className={styles.photoToolBtn} onClick={() => setPhotoRotation((r) => (r + 90) % 360)}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M21 12a9 9 0 1 1-9-9 9 9 0 0 1 6.36 2.64L21 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                    <path d="M21 3v6h-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>
            </div>
            <div className={styles.photoToolGroup}>
              <span ref={zoomLabelRef} className={styles.photoToolLabel}>{t("labelZoom")} {photoZoom.toFixed(1)}x</span>
              <input
                ref={zoomSliderRef}
                type="range" min="1" max="10" step="0.1"
                defaultValue={photoZoom}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  photoZoomRef.current = val;
                  if (zoomLabelRef.current) zoomLabelRef.current.textContent = `${t("labelZoom")} ${val.toFixed(1)}x`;
                  if (photoImgWrapperRef.current) {
                    photoImgWrapperRef.current.style.transform =
                      `translate(${photoOffsetXRef.current}px, ${photoOffsetYRef.current}px) rotate(${photoRotationRef.current}deg) scale(${val / 2})`;
                  }
                }}
                onPointerUp={(e) => setPhotoZoom(Number((e.target as HTMLInputElement).value))}
                onKeyUp={(e) => setPhotoZoom(Number((e.target as HTMLInputElement).value))}
                className={styles.zoomSlider}
              />
            </div>
            <button
              className={styles.photoResetBtn}
              onClick={() => {
                setPhotoRotation(0);
                setPhotoZoom(2);
                setPhotoOffsetX(0);
                setPhotoOffsetY(0);
                if (zoomSliderRef.current) zoomSliderRef.current.value = "2";
                if (zoomLabelRef.current) zoomLabelRef.current.textContent = `${t("labelZoom")} 2.0x`;
                if (photoImgWrapperRef.current) {
                  photoImgWrapperRef.current.style.transform = `translate(0px, 0px) rotate(0deg) scale(1)`;
                }
              }}
            >
              {t("btnReset")}
            </button>
          </div>
          </div>{/* photoEditorSidePanel */}
          </div>{/* editorMainRow */}
        </div>
        <input ref={fileInputRef} type="file" accept="image/*,video/*" style={{ display: "none" }} onChange={handleFileInput} />
        {discardModal}
      </>
    );
  }

  /* ── Media editor: video trim ──────────────────────── */
  if (step === "media" && mediaSubStep === "editor" && mediaType === "video" && mediaPreviewUrl && videoDuration > 0) {
    return (
      <>
        <div className={styles.editorRoot}>
          <div className={styles.videoTrimPreview}>
            <video ref={trimPreviewVideoRef} src={mediaPreviewUrl} className={styles.videoTrimVideo}
              playsInline preload="auto" onLoadedMetadata={(e) => { e.currentTarget.currentTime = trimStart; }} />
          </div>
          <VideoTrimmer videoUrl={mediaPreviewUrl} duration={videoDuration}
            initialStartSec={trimStart} initialEndSec={trimEnd > 0 ? trimEnd : videoDuration}
            maxDurationSec={20} previewVideoRef={trimPreviewVideoRef}
            onConfirm={confirmVideoTrim} onCancel={handleBack} />
        </div>
        <input ref={fileInputRef} type="file" accept="image/*,video/*" style={{ display: "none" }} onChange={handleFileInput} />
        {discardModal}
      </>
    );
  }

  /* ── Editor loading fallback ───────────────────────── */
  if (step === "media" && mediaSubStep === "editor") {
    return (
      <>
        <div className={styles.editorPlaceholder}>
          <div className={styles.editorPlaceholderInner}>
            <p style={{ color: "var(--color-text-muted,#888)" }}>Loading…</p>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*,video/*" style={{ display: "none" }} onChange={handleFileInput} />
        </div>
        {discardModal}
      </>
    );
  }

  /* ── Creator screen ────────────────────────────────── */
  return (
    <>
      <div className={styles.creator}>
        <button className={styles.backBtn} onClick={handleBack} aria-label="Go back">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
            <path d="M19 12H5M5 12l7-7M5 12l7 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>{t("btnBack")}</span>
        </button>

        <div className={styles.mainArea}>
          {/* Preview column */}
          <div className={styles.previewColumn}>
            <div className={styles.previewGlowWrap}>
              <div
                className={styles.preview}
                style={step === "text" ? { background: bgStyle } : {}}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleFileDrop}
              >
                {step === "media" && mediaFile && mediaType === "image" && mediaPreviewUrl && (
                  <>
                    {/* background fill */}
                    <div className={styles.previewBgLayer} style={{ background: canvasBgStyle }} />
                    {/* positioned image — same transform as editor */}
                    <div
                      className={styles.previewImgPositioned}
                      style={{
                        transform: `translate(${photoOffsetX}px, ${photoOffsetY}px) rotate(${photoRotation}deg) scale(${photoZoom / 2})`,
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={mediaPreviewUrl} alt="preview" className={styles.previewContainImg} />
                    </div>
                    <PhotoTextEditor
                      overlays={photoOverlays}
                      onChange={setPhotoOverlays}
                      triggerAdd={addTextTrigger}
                      onSelectChange={handleTextSelectChange}
                      onInputModeToggle={handleTextInputModeToggle}
                      inputColor={textInputColor}
                      inputFontSize={textInputFontSize}
                    />
                  </>
                )}
                {step === "media" && mediaFile && mediaType === "video" && mediaPreviewUrl && (
                  <>
                    <TrimmedVideoPreview src={mediaPreviewUrl} trimStart={trimStart} trimEnd={trimEnd > 0 ? trimEnd : videoDuration} className={styles.previewVideo} />
                    {(trimStart > 0 || trimEnd < videoDuration) && (
                      <div className={styles.trimBadge}>{fmtSec(trimStart)} - {fmtSec(trimEnd)}</div>
                    )}
                  </>
                )}
                {step === "text" && (
                  <>
                    <div ref={textWrapperRef} className={styles.textEditWrapper} onClick={() => textEditRef.current?.focus()}>
                      <div
                        ref={textEditRef}
                        className={styles.previewTextEditable}
                        contentEditable suppressContentEditableWarning
                        data-placeholder={t("placeholderText")}
                        onInput={handleTextInput}
                        onKeyDown={(e) => {
                          scrollSnapRef.current = window.scrollY;
                          if (e.key === "Enter") { e.preventDefault(); document.execCommand("insertLineBreak"); window.scrollTo({ top: scrollSnapRef.current, behavior: "instant" }); }
                        }}
                        onKeyUp={saveCursorRange} onMouseUp={saveCursorRange} spellCheck={false}
                      />
                    </div>
                    <div className={styles.emojiZone} ref={emojiPickerRef}>
                      <button className={styles.emojiBtn} aria-label="Add emoji"
                        onMouseDown={(e) => { e.preventDefault(); saveCursorRange(); setEmojiPickerOpen((o) => !o); }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.8" />
                          <circle cx="9" cy="10.5" r="1.2" fill="currentColor" />
                          <circle cx="15" cy="10.5" r="1.2" fill="currentColor" />
                          <path d="M8.5 14.5c.8 1.5 6.2 1.5 7 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                        </svg>
                      </button>
                      {emojiPickerOpen && (
                        <div className={styles.emojiPickerWrap}>
                          <EmojiPicker onEmojiClick={(data) => insertEmojiAtCursor(data.emoji)} lazyLoadEmojis skinTonesDisabled={false} searchDisabled={false} height={320} width={210} />
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>

          </div>

          {/* Options panel */}
          <div className={styles.optionsSection}>
            {/* Action buttons — Edit, Add Text, Change Photo */}
            {step === "media" && (
              <div className={styles.optionCard}>
                <p className={styles.optionCardLabel}>Actions</p>
                <div className={styles.actionBtnsRow}>
                  <button className={styles.toolbarBtn} onClick={() => setMediaSubStep("editor")} title={mediaType === "image" ? t("btnEditPhoto") : t("btnEditVideo")}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <span>{mediaType === "image" ? t("btnEditPhoto") : t("btnEditVideo")}</span>
                  </button>
                  {mediaType === "image" && (
                    <button className={`${styles.toolbarBtn} ${styles.toolbarBtnAaWrap}`} onClick={() => setAddTextTrigger((n) => n + 1)} title="Add Text">
                      <span className={styles.toolbarBtnAa}>Aa</span>
                      <span>Add Text</span>
                    </button>
                  )}
                  <button className={styles.toolbarBtn} onClick={() => fileInputRef.current?.click()} title={mediaType === "image" ? t("btnChangePhoto") : t("btnChangeVideo")}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <span>{mediaType === "image" ? t("btnChangePhoto") : t("btnChangeVideo")}</span>
                  </button>
                </div>
              </div>
            )}

            {/* Text overlay controls — shown when an overlay is selected or in input mode */}
            {step === "media" && mediaType === "image" && (textSelectedId !== null || textInputMode) && (
              <div className={styles.optionCard}>
                <p className={styles.optionCardLabel}>{textInputMode ? "Thêm văn bản" : "Chỉnh văn bản"}</p>
                <div className={styles.textSwatches}>
                  {OVERLAY_COLORS.map((c) => {
                    const active = textSelectedId
                      ? photoOverlays.find((o) => o.id === textSelectedId)?.color === c
                      : textInputColor === c;
                    return (
                      <button
                        key={c}
                        className={`${styles.textSwatch} ${active ? styles.textSwatchActive : ""}`}
                        style={{ background: c }}
                        onClick={() => {
                          if (textSelectedId) {
                            setPhotoOverlays((prev) => prev.map((o) => o.id === textSelectedId ? { ...o, color: c } : o));
                          } else {
                            setTextInputColor(c);
                          }
                        }}
                      />
                    );
                  })}
                </div>
                <div className={styles.textSizeRow}>
                  <span className={styles.textSizeLabel}>A</span>
                  <input
                    type="range" min={12} max={80} step={1}
                    value={Math.round(
                      textSelectedId
                        ? (photoOverlays.find((o) => o.id === textSelectedId)?.fontSize ?? 28)
                        : textInputFontSize
                    )}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (textSelectedId) {
                        setPhotoOverlays((prev) => prev.map((o) => o.id === textSelectedId ? { ...o, fontSize: v } : o));
                      } else {
                        setTextInputFontSize(v);
                      }
                    }}
                    className={styles.textSizeSlider}
                  />
                  <span className={styles.textSizeLabelLg}>A</span>
                </div>
              </div>
            )}

            {step === "text" && (
              <div className={styles.optionCard}>
                <p className={styles.optionCardLabel}>{t("labelBackground")}</p>
                <div className={styles.bgStrip}>
                  {BG_OPTIONS.map((bg) => (
                    <button key={bg.id} className={`${styles.bgSwatch} ${bgStyle === bg.value ? styles.bgSwatchSelected : ""}`}
                      style={{ background: bg.value }} onClick={() => setBgStyle(bg.value)} title={bg.label} aria-label={bg.label} />
                  ))}
                </div>
              </div>
            )}

            <div className={styles.optionCard}>
              <p className={styles.optionCardLabel}>Visibility</p>
              <div className={styles.visWrapper} ref={visDropRef}>
                <button className={styles.visButton} onClick={() => setVisDropOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={visDropOpen}>
                  <span className={styles.visIcon}><selectedVis.Icon /></span>
                  <span>{t(selectedVis.tKey)}</span>
                  <svg className={`${styles.visChevron} ${visDropOpen ? styles.visChevronOpen : ""}`} width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                {visDropOpen && (
                  <div className={styles.visDropdown} role="listbox">
                    {VISIBILITY_OPTIONS.map((opt) => (
                      <button key={opt.value} className={`${styles.visOption} ${visibility === opt.value ? styles.visOptionActive : ""}`}
                        role="option" aria-selected={visibility === opt.value}
                        onClick={() => { setVisibility(opt.value); setVisDropOpen(false); }}>
                        <span className={styles.visOptionIcon}><opt.Icon /></span>
                        <span>{t(opt.tKey)}</span>
                        {visibility === opt.value && (
                          <svg className={styles.visCheck} width="14" height="14" viewBox="0 0 14 14" fill="none">
                            <path d="M2.5 7l3 3 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {uploading && (
              <div className={styles.progressCard}>
                <div className={styles.progressHeader}>
                  <span className={styles.progressLabel}>Uploading…</span>
                  <span className={styles.progressPct}>{uploadProgress}%</span>
                </div>
                <div className={styles.progressTrack}>
                  <div className={styles.progressBar} style={{ width: `${uploadProgress}%` }} />
                </div>
              </div>
            )}

            {error && (
              <div className={styles.errorCard}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.8" />
                  <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            <button className={styles.submitBtn} onClick={handleSubmit} disabled={uploading}>
              {uploading ? <span className={styles.submitBtnSpinner} /> : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
              <span>{uploading ? t("btnPosting") : t("btnPost")}</span>
            </button>
          </div>
        </div>
      </div>

      <input ref={fileInputRef} type="file" accept="image/*,video/*" style={{ display: "none" }} onChange={handleFileInput} />
      {discardModal}
    </>
  );
}

/* ── TrimmedVideoPreview ─────────────────────────────── */
function TrimmedVideoPreview({ src, trimStart, trimEnd, className }: { src: string; trimStart: number; trimEnd: number; className?: string; }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const vid = ref.current; if (!vid) return;
    const onCanPlay    = () => { if (vid.currentTime < trimStart || vid.currentTime > trimEnd) vid.currentTime = trimStart; vid.play().catch(() => {}); };
    const onTimeUpdate = () => { if (trimEnd > trimStart && vid.currentTime >= trimEnd) { vid.currentTime = trimStart; vid.play().catch(() => {}); } };
    vid.addEventListener("canplay", onCanPlay);
    vid.addEventListener("timeupdate", onTimeUpdate);
    if (vid.readyState >= 3) { vid.currentTime = trimStart; vid.play().catch(() => {}); }
    return () => { vid.removeEventListener("canplay", onCanPlay); vid.removeEventListener("timeupdate", onTimeUpdate); };
  }, [trimStart, trimEnd]);
  return <video ref={ref} src={src} className={className} muted playsInline preload="auto" />;
}

function fmtSec(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}
