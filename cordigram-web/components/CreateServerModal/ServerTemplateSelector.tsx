"use client";

import React from "react";
import styles from "./ServerTemplateSelector.module.css";
import { type ServerTemplate } from "@/lib/servers-api";
import { useLanguage } from "@/component/language-provider";

interface ServerTemplateSelectorProps {
  onSelectTemplate: (template: ServerTemplate) => void;
}

const ChevronRight = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

const templates: Array<{ id: ServerTemplate; color: string; icon: React.ReactNode }> = [
  {
    id: "custom",
    color: "#7c3aed",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
        <circle cx="8.5" cy="8.5" r="1" fill="currentColor" stroke="none" />
        <circle cx="12" cy="6.5" r="1" fill="currentColor" stroke="none" />
        <circle cx="15.5" cy="8.5" r="1" fill="currentColor" stroke="none" />
        <circle cx="15.5" cy="12" r="1" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    id: "gaming",
    color: "#22c55e",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="7" width="20" height="10" rx="4" />
        <path d="M6 12h4M8 10v4" />
        <circle cx="16" cy="11" r="0.75" fill="currentColor" stroke="none" />
        <circle cx="18" cy="13" r="0.75" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    id: "friends",
    color: "#f43f5e",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
    ),
  },
  {
    id: "study-group",
    color: "#f97316",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
      </svg>
    ),
  },
  {
    id: "school-club",
    color: "#3b82f6",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
        <path d="M6 12v5c3 3 9 3 12 0v-5" />
      </svg>
    ),
  },
  {
    id: "local-community",
    color: "#14b8a6",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z" />
        <circle cx="12" cy="10" r="3" />
      </svg>
    ),
  },
  {
    id: "artists-creators",
    color: "#eab308",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    ),
  },
];

export default function ServerTemplateSelector({
  onSelectTemplate,
}: ServerTemplateSelectorProps) {
  const { t } = useLanguage();
  return (
    <div className={styles.container}>
      <h2 className={styles.title}>{t("chat.createServer.template.title")}</h2>
      <p className={styles.subtitle}>
        {t("chat.createServer.template.subtitleLine1")}
        <br />
        {t("chat.createServer.template.subtitleLine2")}
      </p>

      <div className={styles.templateList}>
        {templates.map((template, index) => (
          <React.Fragment key={template.id}>
            {index === 1 && (
              <div className={styles.sectionLabel}>
                {t("chat.createServer.template.startFromTemplate")}
              </div>
            )}
            <button
              className={styles.templateButton}
              onClick={() => onSelectTemplate(template.id)}
            >
              <span
                className={styles.templateIcon}
                style={{ color: template.color, background: `${template.color}1a` }}
              >
                {template.icon}
              </span>
              <span className={styles.templateName}>
                {t(`chat.createServer.template.items.${template.id}.name`)}
              </span>
              <span className={styles.arrow}>
                <ChevronRight />
              </span>
            </button>
          </React.Fragment>
        ))}
      </div>

      <div className={styles.footer}>
        <p className={styles.footerQuestion}>
          {t("chat.createServer.template.haveInvite")}
        </p>
        <button className={styles.joinButton}>
          {t("chat.createServer.template.joinServer")}
        </button>
      </div>
    </div>
  );
}
