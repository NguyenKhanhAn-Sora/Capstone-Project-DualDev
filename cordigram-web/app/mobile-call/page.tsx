"use client";

import { useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import styles from "../call/call.module.css";

const CallRoom = dynamic(() => import("@/components/CallRoom"), {
  ssr: false,
});

export default function MobileCallPage() {
  const [callToken, setCallToken] = useState<string>("");
  const [callServerUrl, setCallServerUrl] = useState<string>("");
  const [participantName, setParticipantName] = useState<string>("User");
  const [isAudioOnly, setIsAudioOnly] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ended, setEnded] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const lkToken = (params.get("lkToken") || "").trim();
    const lkUrl =
      (params.get("lkUrl") || "").trim() ||
      (process.env.NEXT_PUBLIC_LIVEKIT_URL || "").trim();
    const pName = (params.get("participantName") || "User").trim();
    const audioOnly = params.get("audioOnly") === "true";

    if (!lkToken || !lkUrl) {
      setError("Missing LiveKit parameters");
      setLoading(false);
      return;
    }

    setCallToken(lkToken);
    setCallServerUrl(lkUrl);
    setParticipantName(pName || "User");
    setIsAudioOnly(audioOnly);
    setLoading(false);
  }, []);

  const handleDisconnect = useCallback(() => {
    setEnded(true);
  }, []);

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner}></div>
        <p className={styles.loadingText}>Connecting to call...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.errorContainer}>
        <div className={styles.errorIcon}>⚠️</div>
        <h2 className={styles.errorTitle}>Call Error</h2>
        <p className={styles.errorMessage}>{error}</p>
      </div>
    );
  }

  if (ended) {
    return (
      <div className={styles.loadingContainer}>
        <p className={styles.loadingText}>Call ended.</p>
      </div>
    );
  }

  return (
    <div className={styles.callPageContainer}>
      <CallRoom
        token={callToken}
        serverUrl={callServerUrl}
        onDisconnect={handleDisconnect}
        participantName={participantName}
        isAudioOnly={isAudioOnly}
      />
    </div>
  );
}
