"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { getStoredAccessToken } from "@/lib/auth";
import { getLiveKitToken } from "@/lib/livekit-api";
import styles from "./call.module.css";

const CallRoom = dynamic(() => import("@/components/CallRoom"), {
  ssr: false,
});

export default function CallPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const roomName = searchParams.get("roomName");
  const participantName = searchParams.get("participantName");
  const isAudioOnly = searchParams.get("audioOnly") === "true";

  const [callToken, setCallToken] = useState<string>("");
  const [callServerUrl, setCallServerUrl] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initCall = async () => {
      if (!roomName || !participantName) {
        setError("Missing call parameters");
        setLoading(false);
        return;
      }

      try {
        const token = getStoredAccessToken();
        if (!token) {
          setError("Not authenticated");
          setLoading(false);
          return;
        }

        console.log("📞 [CALL PAGE] Initializing call for room:", roomName);

        const { token: livekitToken, url } = await getLiveKitToken(
          roomName,
          participantName,
          token,
        );

        console.log("✅ [CALL PAGE] Got LiveKit credentials");

        setCallToken(livekitToken);
        setCallServerUrl(url);
        setLoading(false);
      } catch (err) {
        console.error("❌ [CALL PAGE] Failed to init call:", err);
        setError("Failed to initialize call");
        setLoading(false);
      }
    };

    initCall();
  }, [roomName, participantName]);

  const handleDisconnect = useCallback(() => {
    console.log("📞 [CALL PAGE] User left call, closing window");
    // Close the tab/window
    window.close();

    // If window.close() doesn't work (some browsers block it), redirect
    setTimeout(() => {
      router.push("/messages");
    }, 100);
  }, [router]);

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
        <button onClick={() => window.close()} className={styles.closeButton}>
          Close Window
        </button>
      </div>
    );
  }

  if (!callToken || !callServerUrl) {
    return null;
  }

  return (
    <div className={styles.callPageContainer}>
      <CallRoom
        token={callToken}
        serverUrl={callServerUrl}
        onDisconnect={handleDisconnect}
        participantName={participantName || "User"}
        isAudioOnly={isAudioOnly}
      />
    </div>
  );
}
