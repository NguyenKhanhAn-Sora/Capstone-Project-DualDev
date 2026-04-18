"use client";

import React, { useEffect, useState } from "react";
import * as serversApi from "@/lib/servers-api";
import styles from "./ServerSafetySection.module.css";
import { useLanguage } from "@/component/language-provider";

interface Props {
  serverId: string;
  canManageSettings: boolean;
  initialTab?: "spam" | "automod";
}

export default function ServerSafetySection({ serverId, canManageSettings }: Props) {
  const { t } = useLanguage();
  const [settings, setSettings] = useState<serversApi.ServerSafetySettings | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [contentFilterExpanded, setContentFilterExpanded] = useState(false);

  useEffect(() => {
    serversApi.getServerSafetySettings(serverId).then(setSettings).catch(() => setSettings(null));
  }, [serverId]);

  const save = async (next: serversApi.ServerSafetySettings) => {
    setSettings(next);
    if (!canManageSettings) return;
    await serversApi.updateServerSafetySettings(serverId, next);
  };

  const setVerificationLevel = (value: serversApi.ServerVerificationLevel) => {
    if (!settings) return;
    save({ ...settings, spamProtection: { ...settings.spamProtection, verificationLevel: value } });
  };

  const setContentFilterLevel = (value: serversApi.ContentFilterLevel) => {
    if (!settings) return;
    save({ ...settings, contentFilter: { ...(settings.contentFilter || {}), level: value } });
  };

  if (!settings) return <div>{t("chat.serverSafety.loadError")}</div>;

  const VERIFICATION_OPTIONS = [
    { value: "none"   as const, accent: styles.accentNone,   title: t("chat.serverSafety.verifyNoneTitle"),   desc: t("chat.serverSafety.verifyNoneDesc")   },
    { value: "low"    as const, accent: styles.accentLow,    title: t("chat.serverSafety.verifyLowTitle"),    desc: t("chat.serverSafety.verifyLowDesc")    },
    { value: "medium" as const, accent: styles.accentMedium, title: t("chat.serverSafety.verifyMediumTitle"), desc: t("chat.serverSafety.verifyMediumDesc") },
    { value: "high"   as const, accent: styles.accentHigh,   title: t("chat.serverSafety.verifyHighTitle"),   desc: t("chat.serverSafety.verifyHighDesc")   },
  ];

  const CONTENT_FILTER_OPTIONS = [
    { value: "all_members"    as const, accent: styles.accentHigh,   title: t("chat.serverSafety.filterAllTitle"),    desc: t("chat.serverSafety.filterAllDesc")    },
    { value: "no_role_members"as const, accent: styles.accentMedium, title: t("chat.serverSafety.filterNoRoleTitle"), desc: t("chat.serverSafety.filterNoRoleDesc") },
    { value: "none"           as const, accent: styles.accentNone,   title: t("chat.serverSafety.filterNoneTitle"),   desc: t("chat.serverSafety.filterNoneDesc")   },
  ];

  const currentLevel = settings.spamProtection.verificationLevel ?? "none";
  const current = VERIFICATION_OPTIONS.find((o) => o.value === currentLevel) ?? VERIFICATION_OPTIONS[0];

  const currentFilterLevel = settings.contentFilter?.level ?? "none";
  const currentFilter = CONTENT_FILTER_OPTIONS.find((o) => o.value === currentFilterLevel) ?? CONTENT_FILTER_OPTIONS[2];

  return (
    <div className={styles.container}>
      <h3 className={styles.sectionTitle}>{t("chat.serverSafety.verifyTitle")}</h3>
      <p className={styles.sectionDesc}>
        {t("chat.serverSafety.verifyDesc")}{" "}
        <strong>{t("chat.serverSafety.verifyRecommend")}</strong>
      </p>

      <div className={styles.summary}>
        <span className={`${styles.summaryAccent} ${current.accent}`} />
        <div className={styles.summaryBody}>
          <p className={styles.summaryTitle}>{current.title}</p>
          <p className={styles.summaryDesc}>{current.desc}</p>
        </div>
        <button
          type="button"
          className={styles.changeBtn}
          disabled={!canManageSettings}
          onClick={() => setExpanded((v) => !v)}
        >
          {t("chat.serverSafety.changeBtn")}
        </button>
      </div>

      {expanded && (
        <div className={styles.radioList} role="radiogroup" aria-label={t("chat.serverSafety.verifyAriaLabel")}>
          {VERIFICATION_OPTIONS.map((opt) => (
            <label key={opt.value} className={styles.radioItem}>
              <span className={`${styles.accent} ${opt.accent}`} />
              <div className={styles.radioBody}>
                <p className={styles.radioTitle}>{opt.title}</p>
                <p className={styles.radioDesc}>{opt.desc}</p>
              </div>
              <input
                type="radio"
                name={`verification-${serverId}`}
                className={styles.radioInput}
                checked={currentLevel === opt.value}
                disabled={!canManageSettings}
                onChange={() => { setVerificationLevel(opt.value); setExpanded(false); }}
              />
            </label>
          ))}
        </div>
      )}

      <div className={styles.divider} />

      <h3 className={styles.sectionTitle}>{t("chat.serverSafety.contentFilterTitle")}</h3>
      <p className={styles.sectionDesc}>
        {t("chat.serverSafety.contentFilterDesc")}{" "}
        <a href="#" style={{ color: "#00a8fc", textDecoration: "none" }}>{t("chat.serverSafety.learnMore")}</a>
      </p>

      <div className={styles.summary}>
        <span className={`${styles.summaryAccent} ${currentFilter.accent}`} />
        <div className={styles.summaryBody}>
          <p className={styles.summaryTitle}>{currentFilter.title}</p>
          <p className={styles.summaryDesc}>{currentFilter.desc}</p>
        </div>
        <button
          type="button"
          className={styles.changeBtn}
          disabled={!canManageSettings}
          onClick={() => setContentFilterExpanded((v) => !v)}
        >
          {t("chat.serverSafety.changeBtn")}
        </button>
      </div>

      {contentFilterExpanded && (
        <div className={styles.radioList} role="radiogroup" aria-label={t("chat.serverSafety.contentFilterAriaLabel")}>
          {CONTENT_FILTER_OPTIONS.map((opt) => (
            <label key={opt.value} className={styles.radioItem}>
              <span className={`${styles.accent} ${opt.accent}`} />
              <div className={styles.radioBody}>
                <p className={styles.radioTitle}>{opt.title}</p>
                <p className={styles.radioDesc}>{opt.desc}</p>
              </div>
              <input
                type="radio"
                name={`content-filter-${serverId}`}
                className={styles.radioInput}
                checked={currentFilterLevel === opt.value}
                disabled={!canManageSettings}
                onChange={() => { setContentFilterLevel(opt.value); setContentFilterExpanded(false); }}
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
