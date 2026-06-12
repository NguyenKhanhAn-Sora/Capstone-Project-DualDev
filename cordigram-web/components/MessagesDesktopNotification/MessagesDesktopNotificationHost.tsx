"use client";

import React, { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./messages-desktop-notification.module.css";
import {
  MESSAGES_DESKTOP_NOTIFICATION_EVENT,
  type MessagesDesktopNotificationPayload,
} from "@/lib/messages-desktop-notifications";

const AUTO_DISMISS_MS = 9000;
const MAX_VISIBLE = 4;

type VisibleItem = MessagesDesktopNotificationPayload & {
  visibleAt: number;
};

function avatarFallbackChar(titleLine: string): string {
  const ch = titleLine.trim().charAt(0);
  return ch ? ch.toUpperCase() : "C";
}

export default function MessagesDesktopNotificationHost() {
  const [items, setItems] = useState<VisibleItem[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onNotify = (event: Event) => {
      const detail = (event as CustomEvent<MessagesDesktopNotificationPayload>)
        .detail;
      if (!detail?.id) return;
      setItems((prev) => {
        const withoutDup = prev.filter((item) => item.id !== detail.id);
        const next = [{ ...detail, visibleAt: Date.now() }, ...withoutDup];
        return next.slice(0, MAX_VISIBLE);
      });
      window.setTimeout(() => dismiss(detail.id), AUTO_DISMISS_MS);
    };

    window.addEventListener(MESSAGES_DESKTOP_NOTIFICATION_EVENT, onNotify);
    return () => {
      window.removeEventListener(MESSAGES_DESKTOP_NOTIFICATION_EVENT, onNotify);
    };
  }, [dismiss]);

  if (!mounted || typeof document === "undefined" || !items.length) {
    return null;
  }

  return createPortal(
    <div className={styles.stack} aria-live="polite">
      {items.map((item) => (
        <article key={item.id} className={styles.card}>
          <header className={styles.header}>
            <img
              src="/logo.png"
              alt=""
              className={styles.appIcon}
              aria-hidden
            />
            <span className={styles.appName}>Cordigram</span>
            <div className={styles.headerActions}>
              <button
                type="button"
                className={styles.iconBtn}
                aria-label="Dismiss"
                onClick={() => dismiss(item.id)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M18 6L6 18M6 6l12 12"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
          </header>
          <div
            className={styles.body}
            role="button"
            tabIndex={0}
            onClick={() => {
              item.onNavigate?.();
              dismiss(item.id);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                item.onNavigate?.();
                dismiss(item.id);
              }
            }}
          >
            {item.avatarUrl ? (
              <img
                src={item.avatarUrl}
                alt=""
                className={styles.avatar}
                aria-hidden
              />
            ) : (
              <div className={styles.avatarFallback} aria-hidden>
                {avatarFallbackChar(item.titleLine)}
              </div>
            )}
            <div className={styles.content}>
              <p className={styles.titleLine}>{item.titleLine}</p>
              <p className={styles.messageBody}>{item.body}</p>
            </div>
          </div>
        </article>
      ))}
    </div>,
    document.body,
  );
}
