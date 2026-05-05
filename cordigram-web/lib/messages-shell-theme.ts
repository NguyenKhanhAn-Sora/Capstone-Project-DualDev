/**
 * Chế độ sáng/tối cho Messages.
 * - Không có override: follow theme Social (html data-theme).
 * - Có override "light" | "dark": tách riêng khỏi Social.
 */
const STORAGE_KEY = "cordigram:messages-shell-theme";
/** Preset nền sáng đã bỏ; một lần chuyển shell Messages sang tối cho user cũ. */
const MIGRATE_DROP_LIGHT_SHELL_KEY = "cordigram:messages-shell-no-light-preset-v1";

export type MessagesShellTheme = "light" | "dark";

function readSocialTheme(): MessagesShellTheme {
  if (typeof document === "undefined") return "dark";
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
  return readSocialTheme();
}

export function setMessagesShellTheme(mode: MessagesShellTheme): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, mode);
  window.dispatchEvent(new Event("cordigram-messages-shell-theme"));
}

export function clearMessagesShellThemeOverride(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event("cordigram-messages-shell-theme"));
}
