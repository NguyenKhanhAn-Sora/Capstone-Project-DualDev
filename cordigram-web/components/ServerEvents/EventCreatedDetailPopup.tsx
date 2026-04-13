"use client";

import React, { useState, useEffect } from "react";
import styles from "./EventCreatedDetailPopup.module.css";
import type { ServerEvent } from "@/lib/servers-api";
import { useLanguage, localeTagForLanguage } from "@/component/language-provider";

function getMinsUntilStart(startAt: string): number {
  const start = new Date(startAt).getTime();
  const now = Date.now();
  return (start - now) / 60000;
}

interface EventCreatedDetailPopupProps {
  isOpen: boolean;
  onClose: () => void;
  event: ServerEvent;
  serverName: string;
  serverId?: string;
  shareLink: string;
  onCopyLink?: () => void;
  onStart?: () => void;
}

export default function EventCreatedDetailPopup({
  isOpen,
  onClose,
  event,
  serverName,
  shareLink,
  onCopyLink,
  onStart,
}: EventCreatedDetailPopupProps) {
  const { t, language } = useLanguage();
  const [minsLeft, setMinsLeft] = useState(() => getMinsUntilStart(event.startAt));
  const [interested, setInterested] = useState(false);
  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);

  const formatCountdown = (mins: number) => {
    if (mins < 0) return t("chat.popups.eventDetail.countdown.started");
    if (mins < 1) return t("chat.popups.eventDetail.countdown.seconds");
    const m = Math.floor(mins);
    if (m < 60) return t("chat.popups.eventDetail.countdown.minutes", { m });
    const h = Math.floor(m / 60);
    const left = m % 60;
    if (left === 0) return t("chat.popups.eventDetail.countdown.hours", { h });
    return t("chat.popups.eventDetail.countdown.hoursMinutes", { h, m: left });
  };

  const formatStartDate = (startAt: string) =>
    new Date(startAt).toLocaleDateString(localeTagForLanguage(language), {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });

  useEffect(() => {
    if (!isOpen) return;
    const tick = () => setMinsLeft(getMinsUntilStart(event.startAt));
    tick();
    const id = setInterval(tick, 10000);
    return () => clearInterval(id);
  }, [isOpen, event.startAt]);

  const isScheduled = event.status === "scheduled" || !event.status;
  const showStartButton = isScheduled && !!onStart;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      onCopyLink?.();
    } catch (e) {
      console.error(e);
    }
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal>
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
          <span className={styles.calendarIcon}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </span>
          <h2 className={styles.headerTitle}>{t("chat.popups.eventDetail.headerCount")}</h2>
          <button type="button" className={styles.createBtn} onClick={onClose}>
            {t("chat.popups.eventDetail.createAnother")}
          </button>
        </div>

        {event.coverImageUrl && (
          <img src={event.coverImageUrl} alt="" className={styles.banner} />
        )}
        {!event.coverImageUrl && <div className={styles.bannerPlaceholder} />}

        <div className={styles.meta}>
          <span className={styles.countdown}>
            {formatCountdown(minsLeft)}
          </span>
          <span className={styles.startDate}>{formatStartDate(event.startAt)}</span>
        </div>

        <h3 className={styles.title}>{event.topic}</h3>
        {event.description && (
          <p className={styles.desc}>{event.description}</p>
        )}

        <div className={styles.location}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          <span>
            {t("chat.popups.eventDetail.location", {
              serverName,
              channel:
                event.channelId && typeof event.channelId === "object" && "name" in event.channelId
                  ? t("chat.popups.eventDetail.locationChannel", {
                      name: String((event.channelId as { name: string }).name),
                    })
                  : "",
            })}
          </span>
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.copyBtn}
            onClick={handleCopy}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
            {copied ? t("chat.common.copied") : t("chat.popups.eventDetail.copyLink")}
          </button>
          <button
            type="button"
            className={`${styles.interestedBtn} ${interested ? styles.interestedActive : ""}`}
            onClick={() => setInterested((v) => !v)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            {t("chat.popups.eventDetail.interested")}
          </button>
          {showStartButton && (
            <button
              type="button"
              className={styles.startBtn}
              disabled={starting}
              onClick={async () => {
                setStarting(true);
                try {
                  await onStart?.();
                } finally {
                  setStarting(false);
                }
              }}
            >
              {starting ? t("chat.popups.eventDetail.starting") : t("chat.popups.eventDetail.start")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
