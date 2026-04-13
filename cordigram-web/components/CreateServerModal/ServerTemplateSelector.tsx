"use client";

import React from "react";
import styles from "./ServerTemplateSelector.module.css";
import { type ServerTemplate } from "@/lib/servers-api";
import { useLanguage } from "@/component/language-provider";

interface ServerTemplateSelectorProps {
  onSelectTemplate: (template: ServerTemplate) => void;
}

const templates: Array<{ id: ServerTemplate; icon: string }> = [
  { id: "custom", icon: "🎨" },
  { id: "gaming", icon: "🎮" },
  { id: "friends", icon: "💕" },
  { id: "study-group", icon: "🍎" },
  { id: "school-club", icon: "📚" },
  { id: "local-community", icon: "🌿" },
  { id: "artists-creators", icon: "🎨" },
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
              <span className={styles.templateIcon}>{template.icon}</span>
              <span className={styles.templateName}>
                {t(`chat.createServer.template.items.${template.id}.name`)}
              </span>
              <span className={styles.arrow}>›</span>
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
