/**
 * Client-side DM call session sync (multi-tab / multi-device via server events).
 */

export type DmCallSyncState =
  | "idle"
  | "ringing"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "rejected"
  | "cancelled"
  | "ended"
  | "timeout"
  | "failed";

export interface DmCallSessionSyncItem {
  callId: string;
  peerId: string;
  role: "caller" | "callee";
  state: DmCallSyncState;
  type: "audio" | "video";
  roomId?: string;
}

export interface CallIncomingDismissEvent {
  peerId: string;
  callId?: string;
  reason: "answered_elsewhere" | "rejected_elsewhere" | "cancelled" | "ended";
}

export type DmClientPlatform = "web" | "mobile" | "mobile_browser";

export function detectDmClientPlatform(): DmClientPlatform {
  if (typeof window === "undefined") return "web";
  const ua = navigator.userAgent || "";
  const isMobileUa =
    /Android|iPhone|iPad|iPod|Mobile/i.test(ua) ||
    (navigator.maxTouchPoints > 1 && /Macintosh/i.test(ua));
  if (!isMobileUa) return "web";
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone ===
      true;
  return isStandalone ? "mobile" : "mobile_browser";
}

const HEARTBEAT_MS = 25_000;

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let activeCallId: string | null = null;

export function setActiveDmCallIdForHeartbeat(callId: string | null): void {
  activeCallId = callId;
  if (typeof window === "undefined") return;
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  if (!callId) return;
  heartbeatTimer = setInterval(() => {
    const socket = (window as any).__cordigramDmSocket as
      | { connected?: boolean; emit?: (e: string, p: unknown) => void }
      | undefined;
    if (socket?.connected && socket.emit) {
      socket.emit("call-heartbeat", { callId });
    }
  }, HEARTBEAT_MS);
}

export const DM_CALL_ANSWER_EVENT = "cordigram-dm-call-answer";
export const DM_CALL_INCOMING_EVENT = "cordigram-dm-call-incoming";

export type DmCallAnswerDetail = {
  from: string;
  sdpOffer?: { roomName?: string } | null;
  callId?: string;
  type?: "audio" | "video";
};

export function dispatchDmCallAnswer(detail: DmCallAnswerDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(DM_CALL_ANSWER_EVENT, { detail }),
  );
}

export type DmCallIncomingDetail = {
  from: string;
  type?: "audio" | "video";
  callerInfo?: {
    userId: string;
    username: string;
    displayName: string;
    avatar?: string;
  };
  callId?: string;
};

export function dispatchDmCallIncoming(detail: DmCallIncomingDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(DM_CALL_INCOMING_EVENT, { detail }),
  );
}

export function registerDmSocketForHeartbeat(
  socket: { connected?: boolean; emit: (e: string, p: unknown) => void } | null,
): void {
  if (typeof window === "undefined") return;
  (window as any).__cordigramDmSocket = socket;
}
