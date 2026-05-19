"use client";

import { useEffect, useState } from "react";
import { getLuminance } from "@/component/theme-provider";
import { getMessagesShellTheme } from "@/lib/messages-shell-theme";

export type MessagesUiTone = "light" | "dark";

function readToneFromDom(): MessagesUiTone {
  if (typeof window === "undefined") return "dark";
  if (getMessagesShellTheme() === "light") return "light";

  const root = document.getElementById("cordigram-messages-root");
  if (!root) return "dark";

  const bg = getComputedStyle(root).getPropertyValue("--color-bg").trim();
  if (bg && /^#[0-9A-Fa-f]{6}$/i.test(bg)) {
    return getLuminance(bg) > 0.55 ? "light" : "dark";
  }

  return "dark";
}

/** Light shell or light accent chrome — for overlays (calls, modals) outside #cordigram-messages-root. */
export function useMessagesUiTone(): MessagesUiTone {
  const [tone, setTone] = useState<MessagesUiTone>("dark");

  useEffect(() => {
    const sync = () => setTone(readToneFromDom());
    sync();
    window.addEventListener("cordigram-messages-shell-theme", sync);
    window.addEventListener("cordigram-messages-chrome", sync);
    window.addEventListener("cordigram-chat-settings", sync);
    return () => {
      window.removeEventListener("cordigram-messages-shell-theme", sync);
      window.removeEventListener("cordigram-messages-chrome", sync);
      window.removeEventListener("cordigram-chat-settings", sync);
    };
  }, []);

  return tone;
}
