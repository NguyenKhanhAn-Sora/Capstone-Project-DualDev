"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { useDirectMessages } from "@/hooks/use-direct-messages";
import { isIceCandidateEvent, isIncomingRingEvent } from "@/lib/call-event-guards";
import { fetchCurrentProfile, type CurrentProfileResponse } from "@/lib/api";
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

  useEffect(() => {
    currentUserIdRef.current = userId;
  }, [userId]);

  useEffect(() => {
    if (isMessagesRoute || !authOk) return;
    const t =
      typeof window !== "undefined"
        ? localStorage.getItem("accessToken") || localStorage.getItem("token") || ""
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

  const socketEnabled =
    !isMessagesRoute && authOk && Boolean(userId && token);

  const { callEvent, callEnded, answerCall, rejectCall, endCall } = useDirectMessages({
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
      setIncomingCall({
        from: ev.from,
        type: ev.type || "audio",
        callerInfo: ev.callerInfo!,
        status: "incoming",
      });
      return;
    }
  }, [callEvent]);

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
      window.open(callUrl, "_blank", "noopener,noreferrer");
      setIncomingCall(null);
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
