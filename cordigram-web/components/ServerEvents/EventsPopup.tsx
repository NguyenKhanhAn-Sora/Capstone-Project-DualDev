"use client";

import React, { useEffect, useState } from "react";
import styles from "./EventsPopup.module.css";
import * as serversApi from "@/lib/servers-api";
import { useLanguage, localeTagForLanguage } from "@/component/language-provider";

interface EventsPopupProps {
  isOpen: boolean;
  onClose: () => void;
  serverId: string | null;
  onOpenCreateWizard: () => void;
}

export default function EventsPopup({
  isOpen,
  onClose,
  serverId,
  onOpenCreateWizard,
}: EventsPopupProps) {
  const { t, language } = useLanguage();
  const [activeEvents, setActiveEvents] = useState<serversApi.ServerEvent[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<serversApi.ServerEvent[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !serverId) return;
    setLoading(true);
    serversApi
      .getServerEvents(serverId)
      .then(({ active, upcoming }) => {
        setActiveEvents(active);
        setUpcomingEvents(upcoming);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isOpen, serverId]);

  if (!isOpen) return null;

  const hasAny = activeEvents.length > 0 || upcomingEvents.length > 0;
  const displayEvents = [...activeEvents, ...upcomingEvents];

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className={styles.closeBtn}
          onClick={onClose}
          aria-label={t("chat.popups.closeAria")}
        >
          ×
        </button>
        <div className={styles.header}>
          <div className={styles.titleRow}>
            <span className={styles.calendarIcon}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </span>
            <h2 className={styles.title}>{t("chat.popups.events.title")}</h2>
          </div>
          <button
            type="button"
            className={styles.createBtn}
            onClick={() => {
              onClose();
              onOpenCreateWizard();
            }}
          >
            {t("chat.popups.events.create")}
          </button>
        </div>

        {loading ? (
          <p style={{ textAlign: "center", color: "#b5bac1" }}>{t("chat.popups.loading")}</p>
        ) : !hasAny ? (
          <>
            <div className={styles.emptyIconWrap}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <span className={styles.star}>✦</span>
              <span className={styles.starBlue}>✦</span>
            </div>
            <h3 className={styles.emptyTitle}>{t("chat.popups.events.emptyTitle")}</h3>
            <p className={styles.emptyDesc}>
              {t("chat.popups.events.emptyDesc")}
            </p>
            <p className={styles.emptyHint}>
              {t("chat.popups.events.emptyHint")}
            </p>
          </>
        ) : (
          <ul className={styles.eventList}>
            {displayEvents.map((ev) => (
              <li key={ev._id} className={styles.eventItem}>
                {ev.coverImageUrl ? (
                  <img src={ev.coverImageUrl} alt="" className={styles.eventCover} />
                ) : (
                  <div className={styles.eventCover} />
                )}
                <div className={styles.eventInfo}>
                  <h4>{ev.topic}</h4>
                  <p>
                    {new Date(ev.startAt).toLocaleString(localeTagForLanguage(language))}
                    {ev.channelId ? ` · ${ev.channelId.name}` : ""}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
