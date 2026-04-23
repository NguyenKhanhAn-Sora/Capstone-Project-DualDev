"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { getStoredAccessToken, setStoredAccessToken } from "@/lib/auth";
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
  const embedded = searchParams.get("embedded") === "1";
  const tokenFromQuery = searchParams.get("accessToken");
  const lkTokenFromQuery = searchParams.get("lkToken");
  const lkUrlFromQuery = searchParams.get("lkUrl");
  const peerId = searchParams.get("peerId") || "";
  const publicLivekitUrl = (process.env.NEXT_PUBLIC_LIVEKIT_URL || "").trim();

  const channelRef = useRef<BroadcastChannel | null>(null);

  const [callToken, setCallToken] = useState<string>("");
  const [callServerUrl, setCallServerUrl] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ended, setEnded] = useState(false);

  useEffect(() => {
    const initCall = async () => {
      const lkToken = (lkTokenFromQuery || "").trim();
      const lkUrl = (lkUrlFromQuery || "").trim();

      // Mobile embedded mode should always prefer pre-issued LiveKit credentials
      // to avoid any dependency on browser auth state.
      if (embedded && lkToken) {
        const resolvedUrl = lkUrl || publicLivekitUrl;
        if (!resolvedUrl) {
          setError("Missing LiveKit URL");
          setLoading(false);
          return;
        }
        setCallToken(lkToken);
        setCallServerUrl(resolvedUrl);
        setLoading(false);
        return;
      }

      if (lkToken && lkUrl) {
        setCallToken(lkToken);
        setCallServerUrl(lkUrl);
        setLoading(false);
        return;
      }

      if (!roomName || !participantName) {
        setError("Missing call parameters");
        setLoading(false);
        return;
      }

      try {
        const queryTokenRaw = tokenFromQuery?.trim() ?? "";
        const queryToken = queryTokenRaw.replace(/^Bearer\s+/i, "");
        if (queryToken) {
          setStoredAccessToken(queryToken);
          try {
            window.localStorage.setItem("token", queryToken);
          } catch (_) {}
        }
        const token =
          queryToken ||
          getStoredAccessToken() ||
          (typeof window !== "undefined"
            ? window.localStorage.getItem("token")
            : null);
        if (!token) {
          setError("Not authenticated");
          setLoading(false);
          return;
        }


        const { token: livekitToken, url } = await getLiveKitToken(
          roomName,
          participantName,
          token,
        );


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
  }, [
    roomName,
    participantName,
    embedded,
    tokenFromQuery,
    lkTokenFromQuery,
    lkUrlFromQuery,
    publicLivekitUrl,
  ]);

  // Open a BroadcastChannel so we can talk to the main messages tab:
  //   - outgoing: tell it to emit `call-end` when the user hangs up
  //   - incoming: listen for `peer-ended` so we tear down LiveKit as soon
  //     as the peer (mobile / other web user) stops their call, instead of
  //     waiting for the LiveKit ParticipantDisconnected fallback.
  useEffect(() => {
    if (embedded || typeof window === "undefined" || !("BroadcastChannel" in window)) {
      return;
    }
    const channel = new BroadcastChannel("cordigram-call");
    channelRef.current = channel;
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; peerId?: string } | null;
      if (!data) return;
      if (
        data.type === "peer-ended" &&
        (!peerId || !data.peerId || data.peerId === peerId)
      ) {
        setEnded(true);
        setTimeout(() => {
          try {
            window.close();
          } catch (_) {}
        }, 50);
      }
    };
    channel.addEventListener("message", onMessage);
    return () => {
      channel.removeEventListener("message", onMessage);
      channel.close();
      channelRef.current = null;
    };
  }, [embedded, peerId]);

  const handleDisconnect = useCallback(() => {
    if (embedded) {
      setEnded(true);
      return;
    }
    // Signal the opener tab so it can emit `call-end` via its socket — this
    // is what makes the peer (especially the mobile app) tear down their
    // side immediately instead of waiting for LiveKit's fallback timeout.
    if (peerId && channelRef.current) {
      try {
        channelRef.current.postMessage({ type: "self-ended", peerId });
      } catch (_) {}
    }
    window.close();

    setTimeout(() => {
      router.push("/messages");
    }, 100);
  }, [embedded, router, peerId]);

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

  if (ended) {
    return (
      <div className={styles.loadingContainer}>
        <p className={styles.loadingText}>Call ended.</p>
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
