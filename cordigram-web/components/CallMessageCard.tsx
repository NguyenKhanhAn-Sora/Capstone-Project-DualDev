"use client";

import { useMemo } from "react";
import { useLanguage } from "@/component/language-provider";
import styles from "./CallMessageCard.module.css";

export type CallMessageMedia = "audio" | "video";
export type CallMessageStatus =
  | "missed"
  | "completed"
  | "declined"
  | "cancelled";

export interface CallMessageCardProps {
  callType: CallMessageMedia;
  callStatus: CallMessageStatus;
  callDurationSec?: number | null;
  /** User who started the call */
  callInitiatorId?: string | null;
  currentUserId?: string;
  timestamp: Date;
  onCallBack: () => void;
}

function formatDuration(
  sec: number,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  const s = Math.max(0, Math.floor(sec));
  if (s < 60) {
    return t("chat.callMessage.durationSeconds", { n: s });
  }
  const min = Math.floor(s / 60);
  const rem = s % 60;
  if (rem === 0) {
    return t("chat.callMessage.durationMinutes", { n: min });
  }
  return t("chat.callMessage.durationMinutesSeconds", { m: min, s: rem });
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function CallIcon({
  isVideo,
  isMissed,
}: {
  isVideo: boolean;
  isMissed: boolean;
}) {
  if (isVideo) {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        {isMissed ? (
          <path d="M17 10.5V7a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-3.5l4.74 2.37a.5.5 0 0 0 .76-.43V8.56a.5.5 0 0 0-.76-.43L17 10.5zM3 5.5 4.5 4 21 20.5 19.5 22 3 5.5z" />
        ) : (
          <path d="M17 10.5V7a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-3.5l4.74 2.37a.5.5 0 0 0 .76-.43V8.56a.5.5 0 0 0-.76-.43L17 10.5z" />
        )}
      </svg>
    );
  }

  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      {isMissed ? (
        <path d="M15.5 1h-7A2.5 2.5 0 0 0 6 3.5v17A2.5 2.5 0 0 0 8.5 23h7a2.5 2.5 0 0 0 2.5-2.5v-17A2.5 2.5 0 0 0 15.5 1zm-1 16h-5v-2h5v2zm0-4h-5v-2h5v2zm0-4h-5V7h5v2zM4.1 3.51 5.51 2.1 22 18.59 20.59 20 4.1 3.51z" />
      ) : (
        <path d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.01-.24c1.12.37 2.33.57 3.58.57a1 1 0 0 1 1 1V21a1 1 0 0 1-1 1C10.07 22 2 13.93 2 3a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.46.57 3.58a1 1 0 0 1-.25 1.01l-2.2 2.2z" />
      )}
    </svg>
  );
}

export function CallMessageCard({
  callType,
  callStatus,
  callDurationSec,
  callInitiatorId,
  currentUserId,
  timestamp,
  onCallBack,
}: CallMessageCardProps) {
  const { t } = useLanguage();

  const isMissed = callStatus === "missed" || callStatus === "declined";
  const isVideo = callType === "video";
  const isIncomingMissed =
    isMissed &&
    callInitiatorId &&
    currentUserId &&
    callInitiatorId !== currentUserId;

  const title = useMemo(() => {
    if (isMissed) {
      if (isIncomingMissed) {
        return isVideo
          ? t("chat.callMessage.missedVideo")
          : t("chat.callMessage.missedVoice");
      }
      return isVideo
        ? t("chat.callMessage.outgoingMissedVideo")
        : t("chat.callMessage.outgoingMissedVoice");
    }
    return isVideo
      ? t("chat.callMessage.completedVideo")
      : t("chat.callMessage.completedVoice");
  }, [isMissed, isIncomingMissed, isVideo, t]);

  const subtitle = useMemo(() => {
    if (callStatus === "completed" && callDurationSec != null) {
      return formatDuration(callDurationSec, t);
    }
    return formatTime(timestamp);
  }, [callDurationSec, callStatus, t, timestamp]);

  return (
    <div
      className={styles.card}
      role="button"
      tabIndex={0}
      onClick={onCallBack}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onCallBack();
        }
      }}
    >
      <div className={styles.topRow}>
        <div
          className={`${styles.iconCircle} ${isMissed ? styles.iconMissed : styles.iconOk}`}
        >
          <CallIcon isVideo={isVideo} isMissed={isMissed} />
        </div>
        <div className={styles.textCol}>
          <span className={styles.title}>{title}</span>
          <span className={styles.subtitle}>{subtitle}</span>
        </div>
      </div>
      <button
        type="button"
        className={styles.callBackBtn}
        onClick={(e) => {
          e.stopPropagation();
          onCallBack();
        }}
      >
        {t("chat.callMessage.callBack")}
      </button>
    </div>
  );
}
