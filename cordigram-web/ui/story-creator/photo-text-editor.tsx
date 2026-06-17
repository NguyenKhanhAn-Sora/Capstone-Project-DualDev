"use client";

import { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import styles from "./photo-text-editor.module.css";

export type PhotoOverlay = {
  id: string;
  text: string;
  color: string;
  fontSize: number;
  x: number;
  y: number;
};

export const OVERLAY_COLORS = [
  "#000000", "#1877f2", "#8b0000", "#e25c00", "#00b4d8", "#ffd700", "#808080",
  "#4caf50", "#e8e8e8", "#9c6fd4", "#ff4081", "#00c853", "#1a237e",
  "#ff6d00", "#f48fb1", "#ab47bc", "#f44336", "#6a1b9a", "#ffffff", "#ffeb3b",
  "#ff5722",
];

type Props = {
  overlays: PhotoOverlay[];
  onChange: (overlays: PhotoOverlay[]) => void;
  triggerAdd?: number;
  onSelectChange?: (id: string | null) => void;
  onInputModeToggle?: (active: boolean) => void;
  inputColor?: string;
  inputFontSize?: number;
};

export default function PhotoTextEditor({
  overlays, onChange, triggerAdd,
  onSelectChange, onInputModeToggle,
  inputColor = "#ffffff", inputFontSize = 28,
}: Props) {
  const t = useTranslations("ui");
  const [mode, setMode]             = useState<"idle" | "input">("idle");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId]   = useState<string | null>(null);

  const containerRef       = useRef<HTMLDivElement>(null);
  const inputRef           = useRef<HTMLDivElement>(null);
  const editRef            = useRef<HTMLDivElement>(null);
  const overlaysRef        = useRef(overlays);
  const prevTriggerRef     = useRef(0);
  const overlayElemsRef    = useRef<Map<string, HTMLDivElement>>(new Map());
  const prevEditContentRef  = useRef("");
  const prevInputContentRef = useRef("");
  const selectedIdRef       = useRef<string | null>(null);

  const [cSize, setCSize] = useState({ w: 337, h: 600 });
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setCSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => { overlaysRef.current = overlays; }, [overlays]);
  useEffect(() => {
    if (mode === "input") {
      const el = inputRef.current;
      if (!el) return;
      el.innerText = "";
      prevInputContentRef.current = "";
      el.focus();
    }
  }, [mode]);
  useEffect(() => {
    const el = editRef.current;
    if (!el || !editingId) return;
    const text = overlaysRef.current.find(o => o.id === editingId)?.text ?? "";
    el.innerText = text;
    prevEditContentRef.current = text;
    el.focus();
    try {
      const range = document.createRange();
      const sel = window.getSelection();
      range.selectNodeContents(el);
      range.collapse(false);
      sel?.removeAllRanges();
      sel?.addRange(range);
    } catch (_) {}
  }, [editingId]);

  // Trigger add-text from parent toolbar button
  useEffect(() => {
    if (triggerAdd !== undefined && triggerAdd > 0 && triggerAdd !== prevTriggerRef.current) {
      prevTriggerRef.current = triggerAdd;
      setMode("input");
      onInputModeToggle?.(true);
      onSelectChange?.(null);
    }
  }, [triggerAdd, onInputModeToggle, onSelectChange]);

  // ── helpers ──────────────────────────────────────────
  const selectOverlay = useCallback((id: string | null) => {
    selectedIdRef.current = id;
    setSelectedId(id);
    onSelectChange?.(id);
  }, [onSelectChange]);

  const enterInputMode = useCallback(() => {
    setMode("input");
    onInputModeToggle?.(true);
    selectOverlay(null);
  }, [onInputModeToggle, selectOverlay]);

  const exitInputMode = useCallback(() => {
    setMode("idle");
    onInputModeToggle?.(false);
  }, [onInputModeToggle]);

  const updateOverlay = useCallback(
    (id: string, patch: Partial<Omit<PhotoOverlay, "id">>) => {
      onChange(overlaysRef.current.map((o) => (o.id === id ? { ...o, ...patch } : o)));
    },
    [onChange],
  );

  const deleteOverlay = useCallback(
    (id: string) => {
      onChange(overlaysRef.current.filter((o) => o.id !== id));
      if (selectedIdRef.current === id) selectOverlay(null);
      setEditingId((e) => (e === id ? null : e));
    },
    [onChange, selectOverlay],
  );

  // ── add new overlay ───────────────────────────────────
  const confirmInput = () => {
    const text = (inputRef.current?.innerText ?? "").trim();
    if (text) {
      onChange([
        ...overlaysRef.current,
        { id: crypto.randomUUID(), text, color: inputColor, fontSize: inputFontSize, x: 50, y: 50 },
      ]);
    }
    exitInputMode();
  };

  // ── confirm inline edit ───────────────────────────────
  const confirmEdit = () => {
    if (editingId) {
      const text = (editRef.current?.innerText ?? "").trim();
      if (text) updateOverlay(editingId, { text });
      else deleteOverlay(editingId);
    }
    setEditingId(null);
  };

  // ── drag overlay ──────────────────────────────────────
  const onOverlayPointerDown = useCallback(
    (e: React.PointerEvent, id: string) => {
      if (editingId === id) return;
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      selectOverlay(id);

      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const ov = overlaysRef.current.find((o) => o.id === id)!;
      const startX = e.clientX, startY = e.clientY;
      const startOvX = ov.x, startOvY = ov.y;
      let moved = false;

      const onMove = (me: PointerEvent) => {
        const dx = ((me.clientX - startX) / rect.width) * 100;
        const dy = ((me.clientY - startY) / rect.height) * 100;
        moved = true;

        let newX = startOvX + dx;
        let newY = startOvY + dy;

        const elem = overlayElemsRef.current.get(id);
        if (elem && elem.offsetWidth > 0) {
          const halfWPct = (elem.offsetWidth  / 2 / rect.width)  * 100;
          const halfHPct = (elem.offsetHeight / 2 / rect.height) * 100;
          newX = Math.max(halfWPct, Math.min(100 - halfWPct, newX));
          newY = Math.max(halfHPct, Math.min(100 - halfHPct, newY));
        } else {
          newX = Math.max(5, Math.min(95, newX));
          newY = Math.max(5, Math.min(95, newY));
        }

        onChange(overlaysRef.current.map((o) => o.id === id ? { ...o, x: newX, y: newY } : o));
      };

      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        if (!moved) {
          setEditingId(id);
        }
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [editingId, onChange, selectOverlay],
  );

  // ── corner resize (3 corners except top-left) ────────
  const onCornerPointerDown = useCallback(
    (e: React.PointerEvent, id: string) => {
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);

      const container = containerRef.current;
      if (!container) return;
      const containerRect = container.getBoundingClientRect();
      const ov = overlaysRef.current.find((o) => o.id === id)!;
      const centerX = containerRect.left + (ov.x / 100) * containerRect.width;
      const centerY = containerRect.top  + (ov.y / 100) * containerRect.height;
      const startDist    = Math.hypot(e.clientX - centerX, e.clientY - centerY);
      const startFontSize = ov.fontSize;

      // Capture element size at drag start for max-scale calculation
      const elem      = overlayElemsRef.current.get(id);
      const startElemW = elem?.offsetWidth  ?? 60;
      const startElemH = elem?.offsetHeight ?? 28;
      const cW = container.clientWidth;
      const cH = container.clientHeight;
      const maxHalfW  = Math.min((ov.x / 100) * cW,       ((100 - ov.x) / 100) * cW);
      const maxHalfH  = Math.min((ov.y / 100) * cH,       ((100 - ov.y) / 100) * cH);
      const maxScale  = Math.min(
        startElemW > 0 ? (2 * maxHalfW) / startElemW : Infinity,
        startElemH > 0 ? (2 * maxHalfH) / startElemH : Infinity,
      );
      const maxFontSize = Math.max(startFontSize, startFontSize * maxScale);

      const onMove = (me: PointerEvent) => {
        const dist = Math.hypot(me.clientX - centerX, me.clientY - centerY);
        if (startDist === 0) return;
        const newSize = Math.max(12, Math.min(maxFontSize, startFontSize * (dist / startDist)));
        onChange(overlaysRef.current.map((o) => (o.id === id ? { ...o, fontSize: newSize } : o)));
      };

      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [onChange],
  );

  return (
    <div
      ref={containerRef}
      className={styles.editorLayer}
      onClick={(e) => {
        if (e.target === e.currentTarget) { selectOverlay(null); setEditingId(null); }
      }}
    >
      {/* ── Existing overlays ── */}
      {overlays.map((ov) => (
        <div
          key={ov.id}
          ref={(el) => { if (el) overlayElemsRef.current.set(ov.id, el); else overlayElemsRef.current.delete(ov.id); }}
          className={`${styles.overlay} ${selectedId === ov.id ? styles.overlaySelected : ""}`}
          style={{
            left: 0,
            top: 0,
            transform: `translate(calc(-50% + ${(ov.x / 100) * cSize.w}px), calc(-50% + ${(ov.y / 100) * cSize.h}px))`,
            maxWidth: Math.max(80, Math.round(2 * Math.min((ov.x / 100) * cSize.w, ((100 - ov.x) / 100) * cSize.w)) - 8),
          }}
          onPointerDown={(e) => onOverlayPointerDown(e, ov.id)}
        >
          {editingId === ov.id ? (
            <div
              ref={editRef}
              contentEditable
              suppressContentEditableWarning
              spellCheck={false}
              className={styles.overlayInput}
              onBlur={confirmEdit}
              onKeyDown={(e) => { if (e.key === "Enter" && e.shiftKey) { e.preventDefault(); confirmEdit(); } }}
              onInput={(e) => {
                const el = e.currentTarget;
                if (el.scrollHeight > el.clientHeight) {
                  el.innerText = prevEditContentRef.current;
                  // restore cursor to end
                  const range = document.createRange();
                  const sel = window.getSelection();
                  range.selectNodeContents(el);
                  range.collapse(false);
                  sel?.removeAllRanges();
                  sel?.addRange(range);
                } else {
                  prevEditContentRef.current = el.innerText;
                }
              }}
              style={{
                color: ov.color,
                fontSize: ov.fontSize,
                maxHeight: Math.max(40, Math.round(2 * Math.min((ov.y / 100) * cSize.h, ((100 - ov.y) / 100) * cSize.h)) - 8),
                overflow: "hidden",
              }}
            />
          ) : (
            <span className={styles.overlayText} style={{ color: ov.color, fontSize: ov.fontSize }}>
              {ov.text}
            </span>
          )}

          {selectedId === ov.id && editingId !== ov.id && (
            <>
              {/* Top-left: delete */}
              <button
                className={styles.deleteBtn}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); deleteOverlay(ov.id); }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
              </button>
              {/* Top-right: resize */}
              <div className={`${styles.cornerHandle} ${styles.cornerTR}`}
                onPointerDown={(e) => { e.stopPropagation(); onCornerPointerDown(e, ov.id); }} />
              {/* Bottom-left: resize */}
              <div className={`${styles.cornerHandle} ${styles.cornerBL}`}
                onPointerDown={(e) => { e.stopPropagation(); onCornerPointerDown(e, ov.id); }} />
              {/* Bottom-right: resize */}
              <div className={`${styles.cornerHandle} ${styles.cornerBR}`}
                onPointerDown={(e) => { e.stopPropagation(); onCornerPointerDown(e, ov.id); }} />
            </>
          )}
        </div>
      ))}

      {/* ── Input mode ── */}
      {mode === "input" && (
        <div className={styles.inputMode} onClick={(e) => e.stopPropagation()}>
          <div className={styles.inputBackdrop} />
          <div
            ref={inputRef}
            contentEditable
            suppressContentEditableWarning
            spellCheck={false}
            className={styles.inputTextarea}
            onKeyDown={(e) => { if (e.key === "Enter" && e.shiftKey) { e.preventDefault(); confirmInput(); } }}
            onInput={(e) => {
              const el = e.currentTarget;
              if (el.scrollHeight > el.clientHeight) {
                el.innerText = prevInputContentRef.current;
                const range = document.createRange();
                const sel = window.getSelection();
                range.selectNodeContents(el);
                range.collapse(false);
                sel?.removeAllRanges();
                sel?.addRange(range);
              } else {
                prevInputContentRef.current = el.innerText;
              }
            }}
            style={{
              color: inputColor,
              fontSize: inputFontSize,
              maxWidth: cSize.w - 32,
              maxHeight: cSize.h - 80,
              overflow: "hidden",
            }}
          />
          <button className={styles.inputDoneBtn} onClick={confirmInput} title={t("storyCreator.doneShiftEnter")}>Xong</button>
        </div>
      )}
    </div>
  );
}
