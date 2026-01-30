"use client";

import styles from "./settings.module.css";
import { useRequireAuth } from "@/hooks/use-require-auth";

const SETTINGS_SECTIONS = [
  {
    key: "account",
    label: "Account",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-3.3 0-8 1.7-8 5v1h16v-1c0-3.3-4.7-5-8-5Z" />
      </svg>
    ),
  },
  {
    key: "profile",
    label: "Profile",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm0 5a3.2 3.2 0 1 1-3.2 3.2A3.2 3.2 0 0 1 12 7Zm0 12.2a7.8 7.8 0 0 1-6.2-3 6.6 6.6 0 0 1 12.4 0 7.8 7.8 0 0 1-6.2 3Z" />
      </svg>
    ),
  },
  {
    key: "privacy",
    label: "Privacy",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M17 9h-1V7a4 4 0 0 0-8 0v2H7a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2Zm-7-2a2 2 0 0 1 4 0v2h-4Z" />
      </svg>
    ),
  },
  {
    key: "notifications",
    label: "Notifications",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm6-6V11a6 6 0 0 0-5-5.91V4a1 1 0 1 0-2 0v1.09A6 6 0 0 0 6 11v5l-2 2v1h16v-1Z" />
      </svg>
    ),
  },
  {
    key: "security",
    label: "Security",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2 4 5v6c0 5 3.6 9.5 8 11 4.4-1.5 8-6 8-11V5Zm0 18c-3.1-1.2-6-4.9-6-9.1V6.4l6-2.1 6 2.1v4.5c0 4.2-2.9 7.9-6 9.1Z" />
      </svg>
    ),
  },
  {
    key: "content",
    label: "Content",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 3h12a2 2 0 0 1 2 2v16l-8-4-8 4V5a2 2 0 0 1 2-2Z" />
      </svg>
    ),
  },
  {
    key: "system",
    label: "System",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 7h10a2 2 0 0 0 4 0h2V5h-2a2 2 0 0 0-4 0H4Zm0 12h2a2 2 0 0 0 4 0h10v-2H10a2 2 0 0 0-4 0H4Z" />
      </svg>
    ),
  },
];

export default function SettingsPage() {
  const canRender = useRequireAuth();

  if (!canRender) return null;

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <header className={styles.header}>
          <div>
            <p className={styles.kicker}>Settings</p>
            <h1 className={styles.title}>Account & preferences</h1>
          </div>
        </header>

        <ul className={styles.list}>
          {SETTINGS_SECTIONS.map((section) => (
            <li key={section.key} className={styles.listItem}>
              <span className={styles.itemIcon} aria-hidden="true">
                {section.icon}
              </span>
              <span className={styles.itemLabel}>{section.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
