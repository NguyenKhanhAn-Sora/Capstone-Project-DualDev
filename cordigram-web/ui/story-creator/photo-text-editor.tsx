"use client";

import { useState, useRef, useEffect, useCallback } from "react";
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
  const [mode, setMode]         = useState<"idle" | "input">("idle");
  const [inputText, setInputText] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [editText, setEditText]     = useState("");

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef     = useRef<HTMLTextAreaElement>(null);
  const editRef      = useRef<HTMLTextAreaElement>(null);
  const overlaysRef  = useRef(overlays);
  const prevTriggerRef = useRef(0);

  useEffect(() => { overlaysRef.current = overlays; }, [overlays]);
  useEffect(() => { if (mode === "input") inputRef.current?.focus(); }, [mode]);
  useEffect(() => { if (editingId) editRef.current?.focus(); }, [editingId]);

  // Trigger add-text from parent toolbar button
  useEffect(() => {
    if (triggerAdd !== undefined && triggerAdd > 0 && triggerAdd !== prevTriggerRef.current) {
      prevTriggerRef.current = triggerAdd;
      setInputText("");
      setMode("input");
      onInputModeToggle?.(true);
      onSelectChange?.(null);
    }
  }, [triggerAdd, onInputModeToggle, onSelectChange]);

  // ── helpers ──────────────────────────────────────────
  const selectOverlay = useCallback((id: string | null) => {
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
      setSelectedId((s) => { if (s === id) { onSelectChange?.(null); return null; } return s; });
      setEditingId((e) => (e === id ? null : e));
    },
    [onChange, onSelectChange],
  );

  // ── add new overlay ───────────────────────────────────
  const confirmInput = () => {
    const text = inputText.trim();
    if (text) {
      onChange([
        ...overlaysRef.current,
        { id: crypto.randomUUID(), text, color: inputColor, fontSize: inputFontSize, x: 50, y: 50 },
      ]);
    }
    setInputText("");
    exitInputMode();
  };

  // ── confirm inline edit ───────────────────────────────
  const confirmEdit = () => {
    if (editingId) {
      const text = editText.trim();
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
        onChange(
          overlaysRef.current.map((o) =>
            o.id === id
              ? { ...o, x: Math.max(5, Math.min(95, startOvX + dx)), y: Math.max(5, Math.min(95, startOvY + dy)) }
              : o,
          ),
        );
      };

      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        if (!moved) {
          setEditingId(id);
          setEditText(overlaysRef.current.find((o) => o.id === id)?.text ?? "");
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
      const startDist = Math.hypot(e.clientX - centerX, e.clientY - centerY);
      const startFontSize = ov.fontSize;

      const onMove = (me: PointerEvent) => {
        const dist = Math.hypot(me.clientX - centerX, me.clientY - centerY);
        if (startDist === 0) return;
        const newSize = Math.max(12, Math.min(120, startFontSize * (dist / startDist)));
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
          className={`${styles.overlay} ${selectedId === ov.id ? styles.overlaySelected : ""}`}
          style={{ left: `${ov.x}%`, top: `${ov.y}%` }}
          onPointerDown={(e) => onOverlayPointerDown(e, ov.id)}
        >
          {editingId === ov.id ? (
            <textarea
              ref={editRef}
              className={styles.overlayInput}
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onBlur={confirmEdit}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); confirmEdit(); } }}
              style={{ color: ov.color, fontSize: ov.fontSize }}
              rows={1}
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

      {/* ── Input mode: only textarea + done button stays in canvas ── */}
      {mode === "input" && (
        <div className={styles.inputMode} onClick={(e) => e.stopPropagation()}>
          <div className={styles.inputBackdrop} />
          <textarea
            ref={inputRef}
            className={styles.inputTextarea}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Nhập văn bản..."
            rows={3}
            style={{ color: inputColor, fontSize: inputFontSize }}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); confirmInput(); } }}
          />
          <button className={styles.inputDoneBtn} onClick={confirmInput}>Xong</button>
        </div>
      )}
    </div>
  );
}
