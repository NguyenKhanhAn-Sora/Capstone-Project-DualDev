/** Server-driven DM call session snapshot (cross-device). */

export type CallSessionPhase = "ringing" | "connected";

export type CallSessionSyncItem = {
  peerId: string;
  role: "initiator" | "callee";
  phase: CallSessionPhase;
  type: "audio" | "video";
};

export type CallSessionsSyncPayload = {
  sessions: CallSessionSyncItem[];
  at: number;
};

export function parseCallSessionsSyncPayload(
  raw: unknown,
): CallSessionsSyncPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  const sessionsRaw = data.sessions;
  if (!Array.isArray(sessionsRaw)) return null;
  const sessions: CallSessionSyncItem[] = [];
  for (const item of sessionsRaw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const peerId = String(row.peerId ?? "").trim();
    if (!peerId) continue;
    const role = row.role === "callee" ? "callee" : "initiator";
    const phase = row.phase === "connected" ? "connected" : "ringing";
    const type = row.type === "audio" ? "audio" : "video";
    sessions.push({ peerId, role, phase, type });
  }
  return {
    sessions,
    at: typeof data.at === "number" ? data.at : Date.now(),
  };
}

/** True if this user already has an active session with [peerId]. */
export function isBusyWithPeer(
  sessions: CallSessionSyncItem[],
  peerId: string,
): boolean {
  const id = String(peerId);
  return sessions.some((s) => String(s.peerId) === id);
}

/** Web: may call multiple peers, but not the same peer twice. */
export function canWebInitiateToPeer(
  sessions: CallSessionSyncItem[],
  peerId: string,
): boolean {
  return !isBusyWithPeer(sessions, peerId);
}

/** Mobile: at most one active DM call session at a time. */
export function canMobileInitiate(sessions: CallSessionSyncItem[]): boolean {
  return sessions.length === 0;
}

export function isUserInAnyCall(sessions: CallSessionSyncItem[]): boolean {
  return sessions.length > 0;
}
