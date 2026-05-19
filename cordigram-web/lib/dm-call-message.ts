export type DmCallMedia = "audio" | "video";
export type DmCallLogStatus =
  | "missed"
  | "completed"
  | "declined"
  | "cancelled";

export interface DmCallMessageFields {
  callType: DmCallMedia;
  callStatus: DmCallLogStatus;
  callDurationSec: number | null;
  callInitiatorId: string;
}

function pickUserId(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null) {
    const v = value as Record<string, unknown>;
    return (
      (v._id as { toString?: () => string })?.toString?.() ??
      (v.id as string | undefined)?.toString?.() ??
      (v.userId as string | undefined)?.toString?.() ??
      ""
    );
  }
  return String(value);
}

/** Extract call card fields from a REST or socket DM payload. */
export function extractDmCallFields(
  msg: Record<string, unknown>,
): DmCallMessageFields | null {
  const type = (msg.type ?? msg.messageType) as string | undefined;
  if (type !== "call") return null;

  const callType: DmCallMedia =
    msg.callType === "video" ? "video" : "audio";
  const statusRaw = msg.callStatus as string | undefined;
  const callStatus: DmCallLogStatus =
    statusRaw === "completed" ||
    statusRaw === "declined" ||
    statusRaw === "cancelled"
      ? statusRaw
      : "missed";

  const durationRaw = msg.callDuration ?? msg.callDurationSec;
  const callDurationSec =
    typeof durationRaw === "number"
      ? durationRaw
      : durationRaw != null
        ? Number(durationRaw)
        : null;

  const initiator =
    pickUserId(msg.callInitiatorId) ||
    pickUserId(msg.senderId) ||
    pickUserId((msg as { sender?: unknown }).sender);

  return {
    callType,
    callStatus,
    callDurationSec:
      callDurationSec != null && !Number.isNaN(callDurationSec)
        ? callDurationSec
        : null,
    callInitiatorId: initiator,
  };
}
