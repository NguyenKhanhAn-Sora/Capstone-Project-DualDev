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
