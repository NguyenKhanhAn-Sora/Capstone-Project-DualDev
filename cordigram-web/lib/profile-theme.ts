import type { CSSProperties } from "react";

export const DEFAULT_PROFILE_THEME_PRIMARY = "#111214";
export const DEFAULT_PROFILE_THEME_ACCENT = "#5865f2";

export const PROFILE_THEME_PRESETS = [
  "#111214",
  "#1e1f22",
  "#2b2d31",
  "#5865f2",
  "#57f287",
  "#eb459e",
  "#ed4245",
  "#fee75c",
] as const;

export function normalizeProfileThemeHex(
  hex: string | null | undefined,
  fallback: string,
): string {
  const s = String(hex ?? "").trim();
  return /^#[0-9a-f]{6}$/i.test(s) ? s : fallback;
}

function hexLuminance(hex: string): number {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16) / 255;
  const g = parseInt(h.substring(2, 4), 16) / 255;
  const b = parseInt(h.substring(4, 6), 16) / 255;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

export function buildProfileCardThemeStyle(
  primary?: string | null,
  accent?: string | null,
): CSSProperties {
  const p = normalizeProfileThemeHex(primary, DEFAULT_PROFILE_THEME_PRIMARY);
  const a = normalizeProfileThemeHex(accent, DEFAULT_PROFILE_THEME_ACCENT);
  return {
    background: `radial-gradient(ellipse at 50% 0%, ${a}33 0%, transparent 52%), ${p}`,
  };
}

/** Card background + readable text/surface tokens for profile popups. */
export function buildProfileCardThemeVars(
  primary?: string | null,
  accent?: string | null,
): CSSProperties {
  const p = normalizeProfileThemeHex(primary, DEFAULT_PROFILE_THEME_PRIMARY);
  const a = normalizeProfileThemeHex(accent, DEFAULT_PROFILE_THEME_ACCENT);
  const isLight = hexLuminance(p) > 0.55;
  return {
    ...buildProfileCardThemeStyle(primary, accent),
    "--profile-theme-primary": p,
    "--profile-theme-accent": a,
    "--profile-theme-text": isLight ? "#0f1629" : "#eef1fb",
    "--profile-theme-text-muted": isLight ? "#5b6378" : "#8899bf",
    "--profile-theme-surface": isLight ? "rgba(15, 22, 41, 0.06)" : "rgba(255, 255, 255, 0.05)",
    "--profile-theme-border": isLight ? "rgba(15, 22, 41, 0.12)" : "rgba(255, 255, 255, 0.09)",
  } as CSSProperties;
}
