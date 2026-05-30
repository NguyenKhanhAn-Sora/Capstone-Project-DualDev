/**
 * Authoritative in-memory registry for 1:1 DM call signaling sessions.
 *
 * Rules:
 * - One active session per sorted user pair (no duplicate A↔B).
 * - Callee can only be in one active session at a time (ringing or connected).
 * - Initiator on mobile: at most one active session total.
 * - Initiator on web: multiple sessions allowed, but not duplicate peer.
 * - Stale sessions expire via heartbeat / ringing TTL (survives tab kill / network drop).
 */

export type CallClientPlatform = 'web' | 'mobile';
export type CallPhase = 'ringing' | 'connected';
export type CallBusyCode =
  | 'already_in_call'
  | 'peer_busy'
  | 'user_busy';

export type DmCallSessionRecord = {
  initiatorId: string;
  calleeId: string;
  type: 'audio' | 'video';
  phase: CallPhase;
  answeredAt?: number;
  logged: boolean;
  initiatorSocketId?: string;
  initiatorPlatform: CallClientPlatform;
  lastHeartbeatAt: number;
  createdAt: number;
};

export type DmCallSessionSnapshotItem = {
  peerId: string;
  role: 'initiator' | 'callee';
  phase: CallPhase;
  type: 'audio' | 'video';
};

export type DmCallSessionsSyncPayload = {
  sessions: DmCallSessionSnapshotItem[];
  at: number;
};

const RINGING_TTL_MS = 120_000;
const CONNECTED_HEARTBEAT_TTL_MS = 90_000;

export class DmCallSessionRegistry {
  private readonly sessions = new Map<string, DmCallSessionRecord>();

  pairKey(userA: string, userB: string): string {
    return [userA, userB].sort().join(':');
  }

  getPairSession(userA: string, userB: string): DmCallSessionRecord | undefined {
    this.pruneStale();
    return this.sessions.get(this.pairKey(userA, userB));
  }

  listSessionsForUser(userId: string): DmCallSessionRecord[] {
    this.pruneStale();
    const out: DmCallSessionRecord[] = [];
    for (const session of this.sessions.values()) {
      if (session.initiatorId === userId || session.calleeId === userId) {
        out.push(session);
      }
    }
    return out;
  }

  snapshotForUser(userId: string): DmCallSessionsSyncPayload {
    const sessions = this.listSessionsForUser(userId).map((s) =>
      this.toSnapshotItem(userId, s),
    );
    return { sessions, at: Date.now() };
  }

  private toSnapshotItem(
    userId: string,
    session: DmCallSessionRecord,
  ): DmCallSessionSnapshotItem {
    const isInitiator = session.initiatorId === userId;
    return {
      peerId: isInitiator ? session.calleeId : session.initiatorId,
      role: isInitiator ? 'initiator' : 'callee',
      phase: session.phase,
      type: session.type,
    };
  }

  validateInitiate(params: {
    initiatorId: string;
    calleeId: string;
    platform: CallClientPlatform;
  }):
    | { ok: true }
    | { ok: false; code: CallBusyCode; peerId?: string } {
    this.pruneStale();
    const { initiatorId, calleeId, platform } = params;

    const pair = this.getPairSession(initiatorId, calleeId);
    if (pair && !pair.logged) {
      return { ok: false, code: 'already_in_call', peerId: calleeId };
    }

    const initiatorSessions = this.listSessionsForUser(initiatorId);
    if (platform === 'mobile' && initiatorSessions.length > 0) {
      const first = initiatorSessions[0];
      const busyPeer =
        first.initiatorId === initiatorId ? first.calleeId : first.initiatorId;
      return { ok: false, code: 'user_busy', peerId: busyPeer };
    }

    const calleeSessions = this.listSessionsForUser(calleeId);
    if (calleeSessions.length > 0) {
      return { ok: false, code: 'peer_busy', peerId: calleeId };
    }

    return { ok: true };
  }

  createSession(params: {
    initiatorId: string;
    calleeId: string;
    type: 'audio' | 'video';
    initiatorSocketId?: string;
    platform: CallClientPlatform;
  }): DmCallSessionRecord {
    const now = Date.now();
    const session: DmCallSessionRecord = {
      initiatorId: params.initiatorId,
      calleeId: params.calleeId,
      type: params.type,
      phase: 'ringing',
      logged: false,
      initiatorSocketId: params.initiatorSocketId,
      initiatorPlatform: params.platform,
      lastHeartbeatAt: now,
      createdAt: now,
    };
    this.sessions.set(
      this.pairKey(params.initiatorId, params.calleeId),
      session,
    );
    return session;
  }

  /** Returns true only the first time the pair moves to connected. */
  tryMarkAnswered(userA: string, userB: string): boolean {
    const session = this.getPairSession(userA, userB);
    if (!session || session.logged || session.answeredAt) return false;
    session.phase = 'connected';
    session.answeredAt = Date.now();
    session.lastHeartbeatAt = Date.now();
    return true;
  }

  isAnswered(userA: string, userB: string): boolean {
    const session = this.getPairSession(userA, userB);
    return Boolean(session?.answeredAt && !session.logged);
  }

  touchHeartbeat(userA: string, userB: string): void {
    const session = this.getPairSession(userA, userB);
    if (!session || session.logged) return;
    session.lastHeartbeatAt = Date.now();
  }

  deletePair(userA: string, userB: string): DmCallSessionRecord | undefined {
    const key = this.pairKey(userA, userB);
    const session = this.sessions.get(key);
    this.sessions.delete(key);
    return session;
  }

  markLogged(userA: string, userB: string): void {
    const session = this.getPairSession(userA, userB);
    if (session) session.logged = true;
  }

  /** Unanswered rings where [userId] is the initiator (for disconnect cleanup). */
  listUnansweredRingsByInitiator(userId: string): DmCallSessionRecord[] {
    this.pruneStale();
    return this.listSessionsForUser(userId).filter(
      (s) => s.initiatorId === userId && !s.answeredAt && !s.logged,
    );
  }

  pruneStale(): void {
    const now = Date.now();
    for (const [key, session] of [...this.sessions.entries()]) {
      if (session.logged) {
        this.sessions.delete(key);
        continue;
      }
      const age = now - session.createdAt;
      const sinceHb = now - session.lastHeartbeatAt;
      if (session.phase === 'ringing' && age > RINGING_TTL_MS) {
        this.sessions.delete(key);
        continue;
      }
      if (
        session.phase === 'connected' &&
        sinceHb > CONNECTED_HEARTBEAT_TTL_MS
      ) {
        this.sessions.delete(key);
      }
    }
  }

  allSessions(): Iterable<DmCallSessionRecord> {
    this.pruneStale();
    return this.sessions.values();
  }
}
