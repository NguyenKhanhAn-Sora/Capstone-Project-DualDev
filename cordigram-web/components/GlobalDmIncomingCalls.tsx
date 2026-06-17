"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { useDirectMessages } from "@/hooks/use-direct-messages";
import { isIceCandidateEvent, isIncomingRingEvent } from "@/lib/call-event-guards";
import { fetchCurrentProfile, type CurrentProfileResponse } from "@/lib/api";
import { ensureTabAccessToken, getTabAccessToken } from "@/lib/auth";
import {
  DM_CALL_INCOMING_EVENT,
  type DmCallIncomingDetail,
} from "@/lib/dm-call-session-sync";
import { getActiveDmCallPeerIds } from "@/lib/dm-call-active-peers";
import { getDMRoomName } from "@/lib/livekit-api";
import IncomingCallPopup from "@/components/IncomingCallPopup";

function isValidAvatarUrl(url: string | undefined): boolean {
  if (!url) return false;
  return url.startsWith("http://") || url.startsWith("https://");
}

type IncomingCallState = {
  from: string;
  type: "audio" | "video";
  callerInfo: {
    userId: string;
    username: string;
    displayName: string;
    avatar?: string;
  };
  status?: "incoming" | "cancelled";
};

/**
 * Subscribes to DM call socket events on non-/messages routes (social, home, etc.)
 * so incoming calls ring without opening Messages. /messages keeps its own hook instance.
 */
export default function GlobalDmIncomingCalls() {
  const pathname = usePathname() ?? "";
  const isMessagesRoute = pathname.startsWith("/messages");
  const authOk = useRequireAuth({ skip: isMessagesRoute, guestAllowed: true });

  const [token, setToken] = useState<string>("");
  const [userId, setUserId] = useState<string>("");
  const [profile, setProfile] = useState<CurrentProfileResponse | null>(null);
  const [incomingCall, setIncomingCall] = useState<IncomingCallState | null>(null);
  const [acceptError, setAcceptError] = useState<string | null>(null);

  const currentUserIdRef = useRef<string>("");
  const openedAnswerPeersRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    currentUserIdRef.current = userId;
  }, [userId]);

  useEffect(() => {
    if (isMessagesRoute || !authOk) return;
    const t =
      typeof window !== "undefined"
        ? ensureTabAccessToken() || getTabAccessToken() || ""
        : "";
    setToken(t);
    if (!t) {
      setUserId("");
      setProfile(null);
      return;
    }
    try {
      const payload = JSON.parse(atob(t.split(".")[1]));
      setUserId(String(payload.userId || payload.sub || ""));
    } catch {
      setUserId("");
    }
    void fetchCurrentProfile({ token: t })
      .then((p) => setProfile(p))
      .catch(() => setProfile(null));
  }, [isMessagesRoute, authOk]);

  useEffect(() => {
    if (isMessagesRoute || !authOk) return;
    const sync = () => {
      const t = getTabAccessToken();
      if (!t) return;
      setToken(t);
      try {
        const payload = JSON.parse(atob(t.split(".")[1]));
        setUserId(String(payload.userId || payload.sub || ""));
      } catch {
        // ignore
      }
    };
    window.addEventListener("focus", sync);
    return () => window.removeEventListener("focus", sync);
  }, [isMessagesRoute, authOk]);

  const socketEnabled =
    !isMessagesRoute && authOk && Boolean(userId && token);

  const {
    callEvent,
    callEnded,
    callIncomingDismiss,
    answerCall,
    rejectCall,
    endCall,
  } = useDirectMessages({
    userId: userId || " ",
    token: token || " ",
    enabled: socketEnabled,
  });

  useEffect(() => {
    if (!callEvent) return;
    if (isIceCandidateEvent(callEvent)) return;

    if (isIncomingRingEvent(callEvent) && callEvent.callerInfo) {
      const ev = callEvent;
      if (
        currentUserIdRef.current &&
        String(ev.from) === String(currentUserIdRef.current)
      ) {
        return;
      }
      const activePeers = getActiveDmCallPeerIds();
      if (
        activePeers.length > 0 &&
        !activePeers.includes(String(ev.from))
      ) {
        rejectCall(ev.from);
        return;
      }
      if (activePeers.includes(String(ev.from))) {
        return;
      }
      setIncomingCall({
        from: ev.from,
        type: ev.type || "audio",
        callerInfo: ev.callerInfo!,
        status: "incoming",
      });
      return;
    }
  }, [callEvent, rejectCall]);

  useEffect(() => {
    const onIncoming = (e: Event) => {
      const detail = (e as CustomEvent<DmCallIncomingDetail>).detail;
      if (!detail?.from || !detail.callerInfo) return;
      if (
        currentUserIdRef.current &&
        String(detail.from) === String(currentUserIdRef.current)
      ) {
        return;
      }
      const activePeers = getActiveDmCallPeerIds();
      if (
        activePeers.length > 0 &&
        !activePeers.includes(String(detail.from))
      ) {
        rejectCall(detail.from);
        return;
      }
      if (activePeers.includes(String(detail.from))) {
        return;
      }
      setIncomingCall({
        from: detail.from,
        type: detail.type || "audio",
        callerInfo: detail.callerInfo,
        status: "incoming",
      });
    };
    window.addEventListener(DM_CALL_INCOMING_EVENT, onIncoming);
    return () => window.removeEventListener(DM_CALL_INCOMING_EVENT, onIncoming);
  }, [rejectCall]);

  useEffect(() => {
    if (!callIncomingDismiss?.peerId) return;
    setIncomingCall((prev) =>
      prev?.from === callIncomingDismiss.peerId ? null : prev,
    );
  }, [callIncomingDismiss]);

  useEffect(() => {
    if (!callEnded) return;
    setIncomingCall((prev) => {
      if (prev && prev.from === callEnded.from) {
        return { ...prev, status: "cancelled" };
      }
      return prev;
    });
    if (typeof window !== "undefined" && "BroadcastChannel" in window) {
      try {
        const channel = new BroadcastChannel("cordigram-call");
        channel.postMessage({ type: "peer-ended", peerId: callEnded.from });
        channel.close();
      } catch {
        // ignore
      }
    }
    const timer = window.setTimeout(() => {
      setIncomingCall((prev) => {
        if (
          prev &&
          prev.from === callEnded.from &&
          prev.status === "cancelled"
        ) {
          return null;
        }
        return prev;
      });
    }, 3000);
    return () => clearTimeout(timer);
  }, [callEnded]);

  useEffect(() => {
    if (typeof window === "undefined" || !("BroadcastChannel" in window)) {
      return;
    }
    const channel = new BroadcastChannel("cordigram-call");
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; peerId?: string } | null;
      if (!data || typeof data !== "object") return;
      if (data.type === "self-ended" && data.peerId) {
        endCall(data.peerId);
        setIncomingCall(null);
      }
    };
    channel.addEventListener("message", onMessage);
    return () => {
      channel.removeEventListener("message", onMessage);
      channel.close();
    };
  }, [endCall]);

  const buildCallUrl = useCallback(
    (peerId: string, roomName: string, type: "audio" | "video") => {
      const participantName =
        profile?.username || profile?.displayName || "Người dùng";
      const isAudioOnly = type === "audio";
      const callAuthToken = getTabAccessToken() || token;
      const qpToken = callAuthToken
        ? `&accessToken=${encodeURIComponent(callAuthToken)}`
        : "";
      return (
        `/call?roomName=${encodeURIComponent(roomName)}` +
        `&participantName=${encodeURIComponent(participantName)}` +
        `&audioOnly=${isAudioOnly}` +
        `&peerId=${encodeURIComponent(peerId)}` +
        qpToken
      );
    },
    [profile, token],
  );

  // Caller side: the peer answered. Open the /call tab so A also enters the
  // call. Because this runs from a socket event (no user gesture), the popup
  // may be blocked — then we show a "Join" button the user can click.
  useEffect(() => {
    if (!callEvent || callEvent.callSignal !== "answer") return;
    if (!callEvent.sdpOffer) return;
    const peerId = String(callEvent.from);
    if (
      currentUserIdRef.current &&
      peerId === String(currentUserIdRef.current)
    ) {
      return;
    }
    const roomName =
      typeof callEvent.sdpOffer === "object" &&
      callEvent.sdpOffer != null &&
      typeof (callEvent.sdpOffer as { roomName?: string }).roomName === "string"
        ? String((callEvent.sdpOffer as { roomName: string }).roomName)
        : "";
    if (!roomName) return;
    if (openedAnswerPeersRef.current.has(peerId)) return;

    const type: "audio" | "video" = callEvent.type === "video" ? "video" : "audio";
    const callUrl = buildCallUrl(peerId, roomName, type);
    const win = window.open(callUrl, "_blank", "noopener,noreferrer");
    if (!win) {
      // Popup blocked — navigate current tab (user was just browsing social).
      window.location.href = callUrl;
      return;
    }
    openedAnswerPeersRef.current.add(peerId);
    window.setTimeout(() => {
      openedAnswerPeersRef.current.delete(peerId);
    }, 15000);
  }, [callEvent, buildCallUrl]);

  const handleAcceptCall = useCallback(async () => {
    if (!incomingCall || !token || !profile) {
      setAcceptError("Không thể chấp nhận cuộc gọi");
      return;
    }
    setAcceptError(null);
    try {
      const { roomName } = await getDMRoomName(incomingCall.from, token);
      answerCall(incomingCall.from, { roomName });
      const participantName =
        profile.username || profile.displayName || "Người dùng";
      const isAudioOnly = incomingCall.type === "audio";
      const callUrl =
        `/call?roomName=${encodeURIComponent(roomName)}` +
        `&participantName=${encodeURIComponent(participantName)}` +
        `&audioOnly=${isAudioOnly}` +
        `&peerId=${encodeURIComponent(incomingCall.from)}` +
        `&accessToken=${encodeURIComponent(token)}`;
      setIncomingCall(null);
      const win = window.open(callUrl, "_blank", "noopener,noreferrer");
      if (!win) {
        window.location.href = callUrl;
      }
    } catch (e) {
      console.error("[GlobalDmIncomingCalls] accept failed", e);
      setAcceptError("Không thể chấp nhận cuộc gọi");
    }
  }, [incomingCall, token, profile, answerCall]);

  const handleRejectCall = useCallback(() => {
    if (!incomingCall) return;
    const peerId = incomingCall.from;
    setAcceptError(null);
    setIncomingCall(null);
    rejectCall(peerId);
  }, [incomingCall, rejectCall]);

  if (isMessagesRoute || !authOk || !socketEnabled) {
    return null;
  }

  const popup =
    incomingCall &&
    createPortal(
      <>
        <IncomingCallPopup
          callerName={
            incomingCall.callerInfo.displayName ||
            incomingCall.callerInfo.username
          }
          callerAvatar={
            isValidAvatarUrl(incomingCall.callerInfo.avatar)
              ? incomingCall.callerInfo.avatar
              : undefined
          }
          callType={incomingCall.type}
          onAccept={handleAcceptCall}
          onReject={handleRejectCall}
          status={incomingCall.status}
          lightBackdrop
        />
        {acceptError ? (
          <div
            style={{
              position: "fixed",
              bottom: 20,
              left: 20,
              background: "#ff6b6b",
              color: "white",
              padding: "12px 16px",
              borderRadius: 4,
              zIndex: 10001,
            }}
          >
            {acceptError}
          </div>
        ) : null}
      </>,
      document.body,
    );

  return <>{popup}</>;
}
