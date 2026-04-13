"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import styles from "./ProfileBannerColorPicker.module.css";
import { useLanguage } from "@/component/language-provider";

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const t = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(t)) return null;
  return {
    r: parseInt(t.slice(0, 2), 16),
    g: parseInt(t.slice(2, 4), 16),
    b: parseInt(t.slice(4, 6), 16),
  };
}

function rgbToHsv(
  r: number,
  g: number,
  b: number,
): { h: number; s: number; v: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d > 0.00001) {
    if (max === rn) h = 60 * (((gn - bn) / d) % 6);
    else if (max === gn) h = 60 * ((bn - rn) / d + 2);
    else h = 60 * ((rn - gn) / d + 4);
  }
  if (h < 0) h += 360;
  const s = max === 0 ? 0 : d / max;
  const v = max;
  return { h, s, v };
}

function hsvToHex(h: number, s: number, v: number): string {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (h < 60) [rp, gp, bp] = [c, x, 0];
  else if (h < 120) [rp, gp, bp] = [x, c, 0];
  else if (h < 180) [rp, gp, bp] = [0, c, x];
  else if (h < 240) [rp, gp, bp] = [0, x, c];
  else if (h < 300) [rp, gp, bp] = [x, 0, c];
  else [rp, gp, bp] = [c, 0, x];
  const r = Math.round((rp + m) * 255);
  const g = Math.round((gp + m) * 255);
  const b = Math.round((bp + m) * 255);
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

const PRESETS = ["#f2f3f5", "#94a3b8", "#eb459e", "#5865f2", "#57f287"];

type Props = {
  open: boolean;
  anchorRect: DOMRect | null;
  valueHex: string;
  onChange: (hex: string) => void;
  onClose: () => void;
};

export default function ProfileBannerColorPicker({
  open,
  anchorRect,
  valueHex,
  onChange,
  onClose,
}: Props) {
  const { t } = useLanguage();
  const svRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);
  const initial = useMemo(() => {
    const rgb = hexToRgb(valueHex) ?? hexToRgb("#5865f2")!;
    return rgbToHsv(rgb.r, rgb.g, rgb.b);
  }, [valueHex]);

  const [h, setH] = useState(initial.h);
  const [s, setS] = useState(initial.s);
  const [v, setV] = useState(initial.v);
  const dragging = useRef<"sv" | "hue" | null>(null);

  useEffect(() => {
    if (!open) return;
    const rgb = hexToRgb(valueHex) ?? hexToRgb("#5865f2")!;
    const next = rgbToHsv(rgb.r, rgb.g, rgb.b);
    queueMicrotask(() => {
      setH(next.h);
      setS(next.s);
      setV(next.v);
    });
  }, [open, valueHex]);

  const hex = useMemo(() => hsvToHex(h, s, v), [h, s, v]);
  const [hexTyping, setHexTyping] = useState(hex);
  const hexInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (document.activeElement === hexInputRef.current) return;
    queueMicrotask(() => setHexTyping(hex));
  }, [hex]);

  const commitHex = useCallback(
    (nextH: number, nextS: number, nextV: number) => {
      onChange(hsvToHex(nextH, nextS, nextV));
    },
    [onChange],
  );

  const readSv = useCallback(
    (clientX: number, clientY: number) => {
      const el = svRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
      const y = Math.max(0, Math.min(1, (clientY - r.top) / r.height));
      const nextS = x;
      const nextV = 1 - y;
      setS(nextS);
      setV(nextV);
      commitHex(h, nextS, nextV);
    },
    [h, commitHex],
  );

  const readHue = useCallback(
    (clientX: number) => {
      const el = hueRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const t = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
      const nextH = t * 360;
      setH(nextH);
      commitHex(nextH, s, v);
    },
    [s, v, commitHex],
  );

  useEffect(() => {
    if (!open) return;
    const onUp = () => {
      dragging.current = null;
    };
    const onMove = (e: PointerEvent) => {
      if (dragging.current === "sv") readSv(e.clientX, e.clientY);
      if (dragging.current === "hue") readHue(e.clientX);
    };
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointermove", onMove);
    return () => {
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointermove", onMove);
    };
  }, [open, readSv, readHue]);

  const onEyedropper = async () => {
    if (typeof window === "undefined") return;
    const ED = (window as unknown as { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper;
    if (!ED) return;
    try {
      const res = await new ED().open();
      if (res?.sRGBHex) {
        const normalized = res.sRGBHex.startsWith("#")
          ? res.sRGBHex
          : `#${res.sRGBHex}`;
        applyHexString(normalized);
      }
    } catch {
      /* user cancelled */
    }
  };

  const eyedropperSupported =
    typeof window !== "undefined" &&
    "EyeDropper" in window;

  const applyHexString = (raw: string) => {
    const t = raw.trim().replace(/^#/, "");
    if (!/^[0-9a-fA-F]{6}$/.test(t)) return;
    const full = `#${t.toLowerCase()}`;
    const rgb = hexToRgb(full);
    if (!rgb) return;
    const hv = rgbToHsv(rgb.r, rgb.g, rgb.b);
    setH(hv.h);
    setS(hv.s);
    setV(hv.v);
    onChange(full);
  };

  if (!open || typeof document === "undefined") return null;

  const top = anchorRect ? anchorRect.bottom + 6 : 80;
  const left = anchorRect
    ? Math.min(
        window.innerWidth - 292,
        Math.max(8, anchorRect.left - 40),
      )
    : 80;

  return createPortal(
    <>
      <div
        className={styles.backdrop}
        role="presentation"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      />
      <div
        className={styles.popover}
        style={{ top, left }}
        role="dialog"
        aria-label={t("chat.profileEditor.changeBannerColorAria")}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div
          ref={svRef}
          className={styles.sv}
          style={{ ["--hue" as string]: String(h) }}
          onPointerDown={(e) => {
            dragging.current = "sv";
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            readSv(e.clientX, e.clientY);
          }}
        >
          <div className={styles.svInner} />
          <div
            className={styles.svThumb}
            style={{
              left: `${s * 100}%`,
              top: `${(1 - v) * 100}%`,
            }}
          />
        </div>
        <div
          ref={hueRef}
          className={styles.hue}
          onPointerDown={(e) => {
            dragging.current = "hue";
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            readHue(e.clientX);
          }}
        >
          <div
            className={styles.hueThumb}
            style={{ left: `${(h / 360) * 100}%` }}
          />
        </div>
        <div className={styles.rowHex}>
          <input
            ref={hexInputRef}
            className={styles.hexInput}
            value={hexTyping}
            onChange={(e) => {
              let vIn = e.target.value;
              if (!vIn.startsWith("#")) vIn = `#${vIn}`;
              if (/^#[0-9a-fA-F]{0,6}$/.test(vIn)) {
                setHexTyping(vIn);
                if (/^#[0-9a-fA-F]{6}$/.test(vIn)) applyHexString(vIn);
              }
            }}
            onBlur={() => {
              if (/^#[0-9a-fA-F]{6}$/.test(hexTyping)) applyHexString(hexTyping);
              else setHexTyping(hex);
            }}
            spellCheck={false}
            aria-label={t("chat.profileBannerPicker.hexLabel")}
          />
          <button
            type="button"
            className={styles.eyedropper}
            title={t("chat.profileBannerPicker.eyedropperTitle")}
            disabled={!eyedropperSupported}
            onClick={() => void onEyedropper()}
          >
            💧
          </button>
        </div>
        <div className={styles.presets}>
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              className={`${styles.preset} ${p === hex ? styles.presetActive : ""}`}
              style={{ background: p }}
              aria-label={p}
              onClick={() => applyHexString(p)}
            />
          ))}
        </div>
      </div>
    </>,
    document.body,
  );
}
