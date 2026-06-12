/**
 * Chế độ sáng/tối/galaxy cho Messages.
 * - Không có override: follow Social (html data-theme + data-appearance).
 * - Có override "light" | "dark": tách riêng khỏi Social.
 */
const STORAGE_KEY = "cordigram:messages-shell-theme";
/** Preset nền sáng đã bỏ; một lần chuyển shell Messages sang tối cho user cũ. */
const MIGRATE_DROP_LIGHT_SHELL_KEY = "cordigram:messages-shell-no-light-preset-v1";

export type MessagesShellTheme = "light" | "dark" | "galaxy";

function readSocialShellTheme(): MessagesShellTheme {
  if (typeof document === "undefined") return "dark";
  const appearance =
    document.documentElement.dataset.appearance ||
    document.body.dataset.appearance ||
    "";
  if (appearance === "galaxy") return "galaxy";
  const raw =
    document.documentElement.dataset.theme || document.body.dataset.theme || "";
  return raw === "light" ? "light" : "dark";
}

export function getMessagesShellTheme(): MessagesShellTheme {
  if (typeof window === "undefined") return "dark";
  if (!localStorage.getItem(MIGRATE_DROP_LIGHT_SHELL_KEY)) {
    localStorage.setItem(MIGRATE_DROP_LIGHT_SHELL_KEY, "1");
    if (localStorage.getItem(STORAGE_KEY) === "light") {
      localStorage.setItem(STORAGE_KEY, "dark");
      window.dispatchEvent(new Event("cordigram-messages-shell-theme"));
    }
  }
  const v = localStorage.getItem(STORAGE_KEY);
  if (v === "light" || v === "dark") return v;
  return readSocialShellTheme();
}

export function setMessagesShellTheme(mode: MessagesShellTheme): void {
  if (typeof window === "undefined") return;
  if (mode === "galaxy") return;
  localStorage.setItem(STORAGE_KEY, mode);
  window.dispatchEvent(new Event("cordigram-messages-shell-theme"));
}

export function hasMessagesShellThemeOverride(): boolean {
  if (typeof window === "undefined") return false;
  const v = localStorage.getItem(STORAGE_KEY);
  return v === "light" || v === "dark";
}

export function clearMessagesShellThemeOverride(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event("cordigram-messages-shell-theme"));
}
