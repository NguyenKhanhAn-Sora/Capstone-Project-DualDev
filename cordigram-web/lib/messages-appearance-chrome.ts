/**
 * Màu giao diện Messages: một giá trị chrome duy nhất (`messages-ui-chrome`).
 * Nguồn `background` | `accent` chỉ quyết chế độ UI (preset nền vs Boost); cả hai đều
 * áp cùng một lớp `applyAccentColor` lên `#cordigram-messages-root` (toàn bộ token nền + accent).
 */
import { applyAccentColor } from "@/component/theme-provider";
import type { MessagesShellTheme } from "@/lib/messages-shell-theme";
import { getMessagesShellTheme } from "@/lib/messages-shell-theme";

export const DEFAULT_MESSAGES_CHROME_HEX = "#5865F2";

const SUFFIX_LEGACY_ACCENT = "chat-accent-color";
const SUFFIX_ACCENT_CHROME = "messages-accent-chrome";
const SUFFIX_BG_TINT = "messages-bg-tint";
const SUFFIX_UI_CHROME = "messages-ui-chrome";
const SUFFIX_APPEARANCE_SOURCE = "messages-appearance-source";
const SUFFIX_CHROME_V2 = "messages-chrome-storage-v2";
const SUFFIX_CHROME_UNIFIED = "messages-chrome-unified-v3";

export type MessagesAppearanceSource = "background" | "accent";

function uidKey(userId: string, suffix: string): string {
  const u = String(userId || "").trim();
  return u ? `chat:${u}:${suffix}` : suffix;
}

export function messagesLegacyAccentStorageKey(userId: string): string {
  return uidKey(userId, SUFFIX_LEGACY_ACCENT);
}

function messagesAccentChromeStorageKey(userId: string): string {
  return uidKey(userId, SUFFIX_ACCENT_CHROME);
}

function messagesBgTintStorageKey(userId: string): string {
  return uidKey(userId, SUFFIX_BG_TINT);
}

export function messagesUiChromeStorageKey(userId: string): string {
  return uidKey(userId, SUFFIX_UI_CHROME);
}

export function messagesAppearanceSourceStorageKey(userId: string): string {
  return uidKey(userId, SUFFIX_APPEARANCE_SOURCE);
}

function chromeV2FlagKey(userId: string): string {
  return uidKey(userId, SUFFIX_CHROME_V2);
}

function chromeUnifiedFlagKey(userId: string): string {
  return uidKey(userId, SUFFIX_CHROME_UNIFIED);
}

export function normalizeMessagesChromeHex(color: string): string {
  const raw = String(color || "").trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(raw)) return raw.toUpperCase();
  return DEFAULT_MESSAGES_CHROME_HEX;
}

export function readMessagesAppearanceSource(userId: string): MessagesAppearanceSource {
  if (typeof window === "undefined") return "background";
  const raw = window.localStorage.getItem(messagesAppearanceSourceStorageKey(userId));
  return raw === "accent" ? "accent" : "background";
}

export function persistMessagesAppearanceSource(
  userId: string,
  src: MessagesAppearanceSource,
): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(messagesAppearanceSourceStorageKey(userId), src);
}

/**
 * Migrate: legacy + v2 (hai key) → một key `messages-ui-chrome`.
 */
export function migrateMessagesChromeStorageOnce(userId: string): void {
  if (typeof window === "undefined") return;
  const u = String(userId || "").trim();
  if (!u) return;
  if (window.localStorage.getItem(chromeUnifiedFlagKey(u))) return;

  const uiKey = messagesUiChromeStorageKey(u);
  let hex = window.localStorage.getItem(uiKey);

  if (!hex || !/^#[0-9A-Fa-f]{6}$/i.test(hex)) {
    const legacy = window.localStorage.getItem(messagesLegacyAccentStorageKey(u));
    const accent = window.localStorage.getItem(messagesAccentChromeStorageKey(u));
    const bg = window.localStorage.getItem(messagesBgTintStorageKey(u));
    const src = readMessagesAppearanceSource(u);
    if (src === "accent") {
      hex = accent || legacy || bg || DEFAULT_MESSAGES_CHROME_HEX;
    } else {
      hex = bg || legacy || accent || DEFAULT_MESSAGES_CHROME_HEX;
    }
    window.localStorage.setItem(uiKey, normalizeMessagesChromeHex(hex));
  }

  window.localStorage.removeItem(messagesAccentChromeStorageKey(u));
  window.localStorage.removeItem(messagesBgTintStorageKey(u));
  window.localStorage.removeItem(messagesLegacyAccentStorageKey(u));
  window.localStorage.removeItem(chromeV2FlagKey(u));
  window.localStorage.setItem(chromeUnifiedFlagKey(u), "1");
}

export function readMessagesChromeHex(userId: string): string {
  if (typeof window === "undefined") return DEFAULT_MESSAGES_CHROME_HEX;
  migrateMessagesChromeStorageOnce(userId);
  const v = window.localStorage.getItem(messagesUiChromeStorageKey(userId));
  return normalizeMessagesChromeHex(v || DEFAULT_MESSAGES_CHROME_HEX);
}

export function persistMessagesChromeHex(userId: string, hex: string): void {
  if (typeof window === "undefined") return;
  migrateMessagesChromeStorageOnce(userId);
  window.localStorage.setItem(
    messagesUiChromeStorageKey(userId),
    normalizeMessagesChromeHex(hex),
  );
}

/** Giao diện sáng + nguồn nền: bỏ tint inline. */
export function resolveMessagesChromeApplyHex(
  userId: string,
  messagesShellTheme: MessagesShellTheme,
): string | null {
  if (typeof window === "undefined") return DEFAULT_MESSAGES_CHROME_HEX;
  const u = String(userId || "").trim();
  if (!u) return DEFAULT_MESSAGES_CHROME_HEX;
  migrateMessagesChromeStorageOnce(u);

  const source = readMessagesAppearanceSource(u);
  const stored = readMessagesChromeHex(u);
  if (source === "accent") {
    return stored;
  }
  if (messagesShellTheme === "light") {
    return null;
  }
  return stored;
}

export function applyMessagesRootChromeFromStorage(
  root: HTMLElement | null,
  userId: string,
  messagesShellTheme: MessagesShellTheme,
): void {
  if (!root) return;
  migrateMessagesChromeStorageOnce(userId);
  const hex = resolveMessagesChromeApplyHex(userId, messagesShellTheme);
  if (hex === null) {
    applyAccentColor(DEFAULT_MESSAGES_CHROME_HEX, root, {
      messagesShellTheme,
    });
    return;
  }
  applyAccentColor(hex, root, {
    messagesShellTheme,
  });
}

export function dispatchMessagesChromeChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("cordigram-messages-chrome"));
}

export function flushMessagesChromeToRoot(userId: string): void {
  if (typeof window === "undefined") return;
  const root = document.getElementById("cordigram-messages-root");
  if (!root) {
    dispatchMessagesChromeChanged();
    return;
  }
  migrateMessagesChromeStorageOnce(userId);
  applyMessagesRootChromeFromStorage(root, userId, getMessagesShellTheme());
  dispatchMessagesChromeChanged();
}
