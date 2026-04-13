"use client";

import React from "react";
import { useCallSound } from "@/hooks/use-call-sound";
import styles from "./IncomingCallPopup.module.css";
import { useLanguage } from "@/component/language-provider";

interface IncomingCallPopupProps {
  callerName: string;
  callerAvatar?: string;
  callType: "audio" | "video";
  onAccept: () => void;
  onReject: () => void;
  status?: "incoming" | "cancelled"; // ✅ Status for when caller cancels
}

export default function IncomingCallPopup({
  callerName,
  callerAvatar,
  callType,
  onAccept,
  onReject,
  status = "incoming",
}: IncomingCallPopupProps) {
  const { t } = useLanguage();
  const isCancelled = status === "cancelled";

  // ✅ Play incoming call ringtone (only when status is 'incoming')
  useCallSound("incoming", status === "incoming");

  return (
    <div className={styles.overlay}>
      <div className={styles.popup}>
        {/* Avatar */}
        <div className={styles.avatarWrapper}>
          {callerAvatar ? (
            <img
              src={callerAvatar}
              alt={callerName}
              className={styles.avatar}
            />
          ) : (
            <div className={styles.avatarPlaceholder}>
              {callerName.charAt(0).toUpperCase()}
            </div>
          )}
          {/* Pulsing animation - only show if not cancelled */}
          {!isCancelled && (
            <>
              <div className={styles.pulseRing}></div>
              <div
                className={styles.pulseRing}
                style={{ animationDelay: "1s" }}
              ></div>
            </>
          )}
        </div>

        {/* Caller info */}
        <h2 className={styles.callerName}>{callerName}</h2>
        {isCancelled ? (
          <p className={styles.callType} style={{ color: "#ed4245" }}>
            {t("chat.popups.incomingCall.canceled")}
          </p>
        ) : (
          <>
            <p className={styles.callType}>{t("chat.popups.incomingCall.incoming")}</p>
            <p className={styles.callTypeDetail}>
              {callType === "video"
                ? t("chat.popups.incomingCall.videoCall")
                : t("chat.popups.incomingCall.voiceCall")}
            </p>
          </>
        )}

        {/* Action buttons */}
        <div className={styles.actions}>
          {isCancelled ? (
            <button
              onClick={onReject}
              className={`${styles.button} ${styles.rejectButton}`}
              aria-label={t("chat.popups.incomingCall.closeAria")}
              style={{ width: "100%" }}
            >
              <span>{t("chat.popups.incomingCall.close")}</span>
            </button>
          ) : (
            <>
              <button
                onClick={onReject}
                className={`${styles.button} ${styles.rejectButton}`}
                aria-label={t("chat.popups.incomingCall.declineAria")}
              >
                <svg
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M23 1L1 23M1 1l22 22" />
                </svg>
                <span>{t("chat.popups.incomingCall.decline")}</span>
              </button>

              <button
                onClick={onAccept}
                className={`${styles.button} ${styles.acceptButton}`}
                aria-label={t("chat.popups.incomingCall.acceptAria")}
              >
                <svg
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" />
                </svg>
                <span>{t("chat.popups.incomingCall.accept")}</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
