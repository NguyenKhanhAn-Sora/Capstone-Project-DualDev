import { describe, it, expect } from "vitest";
import type { CallEvent } from "@/hooks/use-direct-messages";
import {
  isCallAnswerEvent,
  isCallRejectedEvent,
  isIceCandidateEvent,
  isIncomingRingEvent,
} from "./call-event-guards";

describe("call-event-guards", () => {
  it("treats ICE as neither incoming nor rejected", () => {
    const ice: CallEvent = {
      from: "u1",
      callSignal: "ice",
      candidate: {},
    };
    expect(isIceCandidateEvent(ice)).toBe(true);
    expect(isCallRejectedEvent(ice)).toBe(false);
    expect(isIncomingRingEvent(ice)).toBe(false);
  });

  it("rejects only on explicit signal (fixes false reject on ICE noise)", () => {
    const rejected: CallEvent = { from: "u1", callSignal: "rejected" };
    expect(isCallRejectedEvent(rejected)).toBe(true);
    expect(isIncomingRingEvent(rejected)).toBe(false);

    const legacyMinimal = { from: "u1" } as CallEvent;
    expect(isCallRejectedEvent(legacyMinimal)).toBe(false);
  });

  it("incoming ring requires callerInfo and not ice/rejected/answer", () => {
    const ring: CallEvent = {
      from: "u1",
      callSignal: "incoming",
      callerInfo: {
        userId: "u1",
        username: "a",
        displayName: "A",
      },
    };
    expect(isIncomingRingEvent(ring)).toBe(true);
  });

  it("answer with sdpOffer is detected", () => {
    const ans: CallEvent = {
      from: "u1",
      callSignal: "answer",
      sdpOffer: { roomName: "r" },
    };
    expect(isCallAnswerEvent(ans)).toBe(true);
  });
});
