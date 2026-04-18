"use client";

import React from "react";
import { useCallSound } from "@/hooks/use-call-sound";
import styles from "./OutgoingCallPopup.module.css";
import { useLanguage } from "@/component/language-provider";

interface OutgoingCallPopupProps {
  receiverName: string;
  receiverAvatar?: string;
  callType: "audio" | "video";
  onCancel: () => void;
  status: "calling" | "rejected" | "no-answer";
}

export default function OutgoingCallPopup({
  receiverName,
  receiverAvatar,
  callType,
  onCancel,
  status,
}: OutgoingCallPopupProps) {
  const { t } = useLanguage();

  // ✅ Play outgoing call dialing tone (only when status is 'calling')
  useCallSound("outgoing", status === "calling");

  const getStatusText = () => {
    switch (status) {
      case "calling":
        return t("chat.popups.outgoingCall.calling");
      case "rejected":
        return t("chat.popups.outgoingCall.rejected", { name: receiverName });
      case "no-answer":
        return t("chat.popups.outgoingCall.noAnswer", { name: receiverName });
      default:
        return t("chat.popups.outgoingCall.calling");
    }
  };

  const getStatusColor = () => {
    return status === "calling" ? "#43b581" : "#ed4245";
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.popup}>
        <div className={styles.cardAccent} aria-hidden />
        {/* Avatar */}
        <div className={styles.avatarWrapper}>
          {receiverAvatar ? (
            <img
              src={receiverAvatar}
              alt={receiverName}
              className={styles.avatar}
            />
          ) : (
            <div className={styles.avatarPlaceholder}>
              {receiverName.charAt(0).toUpperCase()}
            </div>
          )}
          {/* Pulsing animation only when calling */}
          {status === "calling" && (
            <>
              <div className={styles.pulseRing}></div>
              <div
                className={styles.pulseRing}
                style={{ animationDelay: "1s" }}
              ></div>
            </>
          )}
        </div>

        {/* Receiver info */}
        <h2 className={styles.receiverName}>{receiverName}</h2>
        <span className={styles.kindPill}>
          {callType === "video"
            ? t("chat.popups.outgoingCall.videoCall")
            : t("chat.popups.outgoingCall.voiceCall")}
        </span>
        <p
          className={
            status === "calling" ? styles.statusCalling : styles.statusEnded
          }
          style={{ color: getStatusColor() }}
        >
          {getStatusText()}
        </p>

        {/* Cancel button */}
        <div className={styles.actions}>
          <button
            onClick={onCancel}
            className={`${styles.button} ${styles.cancelButton}`}
            aria-label={
              status === "calling"
                ? t("chat.popups.outgoingCall.cancelAria")
                : t("chat.popups.outgoingCall.closeAria")
            }
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
            <span>
              {status === "calling"
                ? t("chat.popups.outgoingCall.cancelCall")
                : t("chat.popups.outgoingCall.close")}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
