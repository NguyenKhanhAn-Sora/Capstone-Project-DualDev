"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { fetchUserSettings, updateUserSettings } from "@/lib/api";

export type ThemeMode = "light" | "dark";
export type AppearancePreset = "default" | "graphite" | "charcoal" | "indigo";
export type AccentPayload = { accentColor: string };

type ThemeContextValue = {
  theme: ThemeMode;
  setTheme: (mode: ThemeMode) => void;
  toggleTheme: () => void;
  appearancePreset: AppearancePreset;
  appearanceSync: boolean;
  setAppearancePreset: (preset: AppearancePreset) => void;
  setAppearanceSync: (enabled: boolean) => void;
  accentColor: string;
  setAccentColor: (color: string) => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const STORAGE_KEY = "ui-theme";
const APPEARANCE_PRESET_KEY = "ui-appearance-preset";
const APPEARANCE_SYNC_KEY = "ui-appearance-sync";
const ACCENT_COLOR_KEY = "accentColor";
const DEFAULT_ACCENT_COLOR = "#5865F2";

const ACCENT_OVERRIDE_KEYS = [
  "--accent-color",
  "--accent-hover",
  "--accent-active",
  "--accent-soft",
  "--color-bg",
  "--color-surface",
  "--color-surface-muted",
  "--color-border",
  "--color-text",
  "--color-text-muted",
  "--color-title-primary",
  "--color-panel-bg",
  "--color-panel-sidebar",
  "--color-panel-sidebar-border",
  "--color-panel-hover",
  "--color-panel-active",
  "--color-panel-text",
  "--color-panel-text-muted",
  "--color-panel-text-faint",
  "--color-panel-border",
  "--color-panel-deep",
  "--color-panel-deep-border",
  "--color-panel-context",
  "--color-chat-received",
  "--color-chat-received-hover",
  "--color-chat-modal",
  "--color-chat-modal-border",
  "--color-chat-input",
  "--color-chat-input-border",
  "--color-chat-hover",
  "--color-chat-text-strong",
  "--color-chat-text-secondary",
  "--color-chat-read",
  "--user-appearance-bg",
  "--color-on-accent",
  "--color-button-x",
  "--color-border-button-x",
] as const;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeHex(color: string): string {
  const raw = String(color || "").trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(raw)) return raw.toUpperCase();
  return "#5865F2";
}

function hexToRgb(color: string) {
  const hex = normalizeHex(color).slice(1);
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b]
    .map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0"))
    .join("")}`.toUpperCase();
}

function getLuminance(color: string): number {
  const { r, g, b } = hexToRgb(color);
  const [rs, gs, bs] = [r, g, b].map((value) => {
    const channel = value / 255;
    return channel <= 0.03928
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

export function darken(color: string, percent: number): string {
  const { r, g, b } = hexToRgb(color);
  const factor = 1 - clamp(percent, 0, 100) / 100;
  return rgbToHex(r * factor, g * factor, b * factor);
}

export function lighten(color: string, percent: number): string {
  const { r, g, b } = hexToRgb(color);
  const ratio = clamp(percent, 0, 100) / 100;
  return rgbToHex(
    r + (255 - r) * ratio,
    g + (255 - g) * ratio,
    b + (255 - b) * ratio,
  );
}

export function transparent(color: string, alpha: number): string {
  const { r, g, b } = hexToRgb(color);
  return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1)})`;
}

/**
 * Darkens a hex color until its luminance is at most `maxLuminance`, so text/icons
 * stay readable on very light chat backgrounds (e.g. role colors, display-name picks).
 */
export function ensureReadableForeground(
  color: string,
  options?: { maxLuminance?: number },
): string {
  const maxL = options?.maxLuminance ?? 0.55;
  let c = normalizeHex(color);
  let L = getLuminance(c);
  let guard = 0;
  while (L > maxL && guard < 28) {
    c = darken(c, 9);
    L = getLuminance(c);
    guard += 1;
  }
  return c;
}

/** Accent used for buttons, links, and primary chrome — never pure white. */
function clampAccentForUi(hex: string): string {
  return ensureReadableForeground(hex, { maxLuminance: 0.4 });
}

/**
 * Messages root: `messagesShellTheme === "light"` overrides some text tokens so a dark accent
 * still keeps body copy readable on the light shell stylesheet.
 */
export type ApplyAccentColorOptions = {
  messagesShellTheme?: "light" | "dark";
};

export function applyAccentColor(
  color: string,
  target?: HTMLElement | null,
  options?: ApplyAccentColorOptions,
) {
  if (typeof document === "undefined") return;
  const base = normalizeHex(color);
  const el = target ?? null;
  if (base === DEFAULT_ACCENT_COLOR) {
    if (el) {
      const s = el.style;
      ACCENT_OVERRIDE_KEYS.forEach((key) => {
        s.removeProperty(key);
      });
      return;
    }
    const root = document.documentElement.style;
    const body = document.body.style;
    ACCENT_OVERRIDE_KEYS.forEach((key) => {
      root.removeProperty(key);
      body.removeProperty(key);
    });
    return;
  }
  const luminance = getLuminance(base);
  const isLightTone = luminance > 0.56;
  const veryLightSurface = isLightTone && luminance > 0.82;
  const accentUi = clampAccentForUi(base);
  const hover = darken(accentUi, 10);
  const active = darken(accentUi, 18);
  const soft = transparent(base, 0.18);
  const bgSoft = transparent(base, isLightTone ? 0.2 : 0.12);
  const bgGlow = transparent(lighten(base, isLightTone ? 2 : 12), isLightTone ? 0.16 : 0.22);

  const bg = isLightTone ? lighten(base, 84) : darken(base, 80);
  const surface = isLightTone ? lighten(base, 91) : darken(base, 74);
  const surfaceMuted = veryLightSurface
    ? darken(surface, 10)
    : isLightTone
      ? lighten(base, 87)
      : darken(base, 70);
  const border = isLightTone ? darken(bg, 10) : lighten(bg, 12);
  let text = isLightTone ? darken(base, 78) : "#F8FAFC";
  let textMuted = isLightTone ? darken(base, 48) : lighten(base, 38);
  let panelTextFaint = textMuted;
  if (el && options?.messagesShellTheme === "light") {
    text = "#0F1629";
    textMuted = "#5B6378";
    panelTextFaint = "#738AAB";
  }
  const panelBg = surface;
  const panelSidebar = isLightTone ? lighten(base, 86) : darken(base, 76);
  const panelHover = veryLightSurface
    ? darken(panelSidebar, 14)
    : isLightTone
      ? darken(surface, 6)
      : lighten(surface, 5);
  const panelActive = veryLightSurface
    ? darken(surface, 14)
    : isLightTone
      ? darken(surface, 10)
      : lighten(surface, 10);
  const panelDeep = isLightTone ? darken(surface, 4) : darken(bg, 8);
  const panelContext = isLightTone ? lighten(base, 94) : darken(bg, 10);
  const chatReceived = isLightTone ? darken(surface, 3) : lighten(surface, 2);
  const chatReceivedHover = veryLightSurface
    ? darken(surface, 12)
    : isLightTone
      ? darken(surface, 6)
      : lighten(surface, 6);
  const chatInput = isLightTone ? darken(surface, 4) : darken(bg, 6);
  const onAccent = getLuminance(accentUi) > 0.45 ? "#0f1629" : "#ffffff";
  const applyToStyle = (s: CSSStyleDeclaration) => {
    s.setProperty("--accent-color", accentUi);
    s.setProperty("--accent-hover", hover);
    s.setProperty("--accent-active", active);
    s.setProperty("--accent-soft", soft);
    s.setProperty("--color-bg", bg);
    s.setProperty("--color-surface", surface);
    s.setProperty("--color-surface-muted", surfaceMuted);
    s.setProperty("--color-border", border);
    s.setProperty("--color-text", text);
    s.setProperty("--color-text-muted", textMuted);
    s.setProperty("--color-title-primary", text);
    s.setProperty("--color-panel-bg", panelBg);
    s.setProperty("--color-panel-sidebar", panelSidebar);
    s.setProperty("--color-panel-sidebar-border", border);
    s.setProperty("--color-panel-hover", panelHover);
    s.setProperty("--color-panel-active", panelActive);
    s.setProperty("--color-panel-text", text);
    s.setProperty("--color-panel-text-muted", textMuted);
    s.setProperty("--color-panel-text-faint", panelTextFaint);
    s.setProperty("--color-panel-border", border);
    s.setProperty("--color-panel-deep", panelDeep);
    s.setProperty("--color-panel-deep-border", border);
    s.setProperty("--color-panel-context", panelContext);
    s.setProperty("--color-chat-received", chatReceived);
    s.setProperty("--color-chat-received-hover", chatReceivedHover);
    s.setProperty("--color-chat-modal", panelBg);
    s.setProperty("--color-chat-modal-border", border);
    s.setProperty("--color-chat-input", chatInput);
    s.setProperty("--color-chat-input-border", border);
    s.setProperty("--color-chat-hover", panelHover);
    s.setProperty(
      "--color-chat-text-strong",
      el && options?.messagesShellTheme === "light" ? "#111827" : text,
    );
    s.setProperty(
      "--color-chat-text-secondary",
      el && options?.messagesShellTheme === "light" ? "#5A6480" : textMuted,
    );
    s.setProperty("--color-chat-read", accentUi);
    s.setProperty("--color-on-accent", onAccent);
    if (el) {
      const panelL = getLuminance(panelBg);
      const buttonX = panelL > 0.55 ? "#1F2A3D" : "#FFFFFF";
      const buttonXBorder = panelL > 0.55 ? "#828B9A" : "#434F65";
      s.setProperty("--color-button-x", buttonX);
      s.setProperty("--color-border-button-x", buttonXBorder);
    }
    s.setProperty(
      "--user-appearance-bg",
      `radial-gradient(circle at 20% 10%, ${bgGlow}, transparent 32%), linear-gradient(${bgSoft}, ${bgSoft}), ${bg}`,
    );
  };

  if (el) {
    applyToStyle(el.style);
    return;
  }

  const root = document.documentElement.style;
  const body = document.body.style;
  applyToStyle(root);
  applyToStyle(body);
}

function applyTheme(mode: ThemeMode) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = mode;
  //cho thẻ html và body gán giá trị dataset.theme => data-theme = mode
  document.body.dataset.theme = mode;
}

function applyAppearancePreset(value: AppearancePreset) {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty(
    "--user-appearance-bg",
    "linear-gradient(transparent, transparent)",
  );
  document.body.style.setProperty(
    "--user-appearance-bg",
    "linear-gradient(transparent, transparent)",
  );
  if (!value || value === "default") {
    document.documentElement.removeAttribute("data-appearance");
    document.body.removeAttribute("data-appearance");
    return;
  }
  document.documentElement.dataset.appearance = value;
  document.body.dataset.appearance = value;
}

function pickInitialTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";
  // Khi mới vào trình duyệt thì hệ thống chưa thể lấy được theme ngay nên để mặc định là light
  //Do đó sẽ có một khoảng nhấp nháy hiển thị theme light trước khi hiển thị đúng theme của user chọn

  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;

  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  return prefersDark ? "dark" : "light";
  //Trường hợp user mới chưa chọn theme nào thì hệ thống sẽ lấy theo cài đặt của hệ điều hành
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(() => pickInitialTheme());
  const [appearancePreset, setAppearancePresetState] = useState<AppearancePreset>(
    () =>
      typeof window !== "undefined"
        ? ((localStorage.getItem(APPEARANCE_PRESET_KEY) as AppearancePreset | null) ??
          "default")
        : "default",
  );
  const [appearanceSync, setAppearanceSyncState] = useState<boolean>(() =>
    typeof window !== "undefined"
      ? localStorage.getItem(APPEARANCE_SYNC_KEY) === "1"
      : false,
  );
  const [accentColor, setAccentColorState] = useState<string>(() => {
    if (typeof window === "undefined") return DEFAULT_ACCENT_COLOR;
    try {
      const raw = localStorage.getItem(ACCENT_COLOR_KEY);
      if (!raw) return DEFAULT_ACCENT_COLOR;
      const parsed = JSON.parse(raw) as AccentPayload;
      return normalizeHex(parsed?.accentColor || DEFAULT_ACCENT_COLOR);
    } catch {
      return DEFAULT_ACCENT_COLOR;
    }
  });

  useEffect(() => {
    applyTheme(theme);
    if (typeof window !== "undefined") {
      //xét typeof window để xem có đang chạy trong môi trường browser hay không
      localStorage.setItem(STORAGE_KEY, theme);
    }
  }, [theme]);

  useEffect(() => {
    applyAppearancePreset(appearanceSync ? "default" : appearancePreset);
    if (typeof window !== "undefined") {
      localStorage.setItem(APPEARANCE_PRESET_KEY, appearancePreset);
      if (appearanceSync) localStorage.setItem(APPEARANCE_SYNC_KEY, "1");
      else localStorage.removeItem(APPEARANCE_SYNC_KEY);
    }
  }, [appearancePreset, appearanceSync]);

  useEffect(() => {
    applyAccentColor(accentColor);
    if (typeof window !== "undefined") {
      localStorage.setItem(
        ACCENT_COLOR_KEY,
        JSON.stringify({ accentColor: normalizeHex(accentColor) }),
      );
    }
  }, [accentColor]);

  useEffect(() => {
    let cancelled = false;
    let media: MediaQueryList | null = null;
    let onMediaChange: ((e: MediaQueryListEvent) => void) | null = null;
    const token =
      typeof window !== "undefined"
        ? localStorage.getItem("accessToken")
        : null;
    if (!token) return;

    const load = async () => {
      try {
        const res = await fetchUserSettings({ token });
        if (!cancelled) {
          const sync = res.appearanceSync === true;
          const nextPreset = res.appearancePreset ?? "default";
          setAppearanceSyncState(sync);
          setAppearancePresetState(nextPreset);
          if (sync && typeof window !== "undefined") {
            const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
            setThemeState(prefersDark ? "dark" : "light");
          } else if (res.theme === "light" || res.theme === "dark") {
            setThemeState(res.theme);
          }
        }
      } catch (_err) {}
    };

    load();
    if (typeof window !== "undefined") {
      media = window.matchMedia("(prefers-color-scheme: dark)");
      onMediaChange = (e: MediaQueryListEvent) => {
        if (!appearanceSync) return;
        setThemeState(e.matches ? "dark" : "light");
      };
      media.addEventListener("change", onMediaChange);
    }
    const onRefresh = () => {
      void load();
    };
    if (typeof window !== "undefined") {
      window.addEventListener("cordigram-chat-settings", onRefresh);
    }
    return () => {
      cancelled = true;
      if (media && onMediaChange) {
        media.removeEventListener("change", onMediaChange);
      }
      if (typeof window !== "undefined") {
        window.removeEventListener("cordigram-chat-settings", onRefresh);
      }
    };
  }, [appearanceSync]);

  const setTheme = (mode: ThemeMode) => {
    setThemeState(mode);

    const token =
      typeof window !== "undefined"
        ? localStorage.getItem("accessToken")
        : null;
    if (!token) return;

    void updateUserSettings({ token, theme: mode }).catch(() => undefined);
  };

  const setAppearancePreset = (preset: AppearancePreset) => {
    setAppearanceSyncState(false);
    setAppearancePresetState(preset);
    // Non-default presets are optimized for dark UI.
    if (preset === "default") {
      setTheme("light");
    } else {
      setTheme("dark");
    }
    const token =
      typeof window !== "undefined"
        ? localStorage.getItem("accessToken")
        : null;
    if (!token) return;
    void updateUserSettings({
      token,
      appearancePreset: preset,
      appearanceSync: false,
      theme: preset === "default" ? "light" : "dark",
    }).catch(() => undefined);
  };

  const setAppearanceSync = (enabled: boolean) => {
    setAppearanceSyncState(enabled);
    if (enabled && typeof window !== "undefined") {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      setThemeState(prefersDark ? "dark" : "light");
    }
    const token =
      typeof window !== "undefined"
        ? localStorage.getItem("accessToken")
        : null;
    if (!token) return;
    void updateUserSettings({ token, appearanceSync: enabled }).catch(
      () => undefined,
    );
  };

  const toggleTheme = () => setTheme(theme === "light" ? "dark" : "light");
  const setAccentColor = (color: string) => {
    setAccentColorState(normalizeHex(color));
  };

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      toggleTheme,
      appearancePreset,
      appearanceSync,
      setAppearancePreset,
      setAppearanceSync,
      accentColor,
      setAccentColor,
    }),
    [theme, appearancePreset, appearanceSync, accentColor],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}
 

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
