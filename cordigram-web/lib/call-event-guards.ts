import type { CallEvent } from "@/hooks/use-direct-messages";

/** True only for explicit server `call-rejected` (not ICE, not empty heuristics). */
export function isCallRejectedEvent(e: CallEvent | null | undefined): boolean {
  return e?.callSignal === "rejected";
}

export function isIceCandidateEvent(e: CallEvent | null | undefined): boolean {
  return e?.callSignal === "ice";
}

/** Incoming ring notification (has caller profile). */
export function isIncomingRingEvent(e: CallEvent | null | undefined): boolean {
  if (!e?.from || !e.callerInfo) return false;
  if (
    e.callSignal === "ice" ||
    e.callSignal === "rejected" ||
    e.callSignal === "answer"
  ) {
    return false;
  }
  return true;
}

/** Callee answered — caller should open LiveKit tab. */
export function isCallAnswerEvent(e: CallEvent | null | undefined): boolean {
  if (!e || e.callSignal === "ice") return false;
  if (e.callSignal === "answer") return e.sdpOffer != null;
  // Legacy: answer carried sdpOffer/room payload without signal
  return e.sdpOffer != null;
}
