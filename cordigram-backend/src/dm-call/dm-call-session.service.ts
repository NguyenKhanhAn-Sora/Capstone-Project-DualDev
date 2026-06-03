import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'crypto';
import IORedis from 'ioredis';
import { RedisService } from '../redis/redis.service';
import {
  DM_CALL_CONNECTED_TTL_SEC,
  DM_CALL_RING_TTL_SEC,
  DmCallClientPlatform,
  DmCallInitiateOutcome,
  DmCallMediaType,
  DmCallSessionRecord,
  DmCallSessionSyncItem,
  DmCallState,
} from './dm-call.types';

const ACTIVE_STATES: DmCallState[] = [
  'ringing',
  'connecting',
  'connected',
  'reconnecting',
];

@Injectable()
export class DmCallSessionService implements OnModuleDestroy {
  private readonly logger = new Logger(DmCallSessionService.name);
  private readonly redis: IORedis | null;
  private readonly memorySessions = new Map<string, DmCallSessionRecord>();
  private readonly memoryUserCall = new Map<string, string>();
  private readonly ringTimers = new Map<string, NodeJS.Timeout>();
  /** Prevents duplicate Mongo call-log writes for the same callId. */
  private readonly persistedCallIds = new Set<string>();

  constructor(private readonly redisService: RedisService) {
    // Reuse the shared queue connection — avoids adding a new connection slot
    this.redis = process.env.REDIS_URL?.trim()
      ? redisService.queueConnection
      : null;
    if (!this.redis) {
      this.logger.warn(
        'REDIS_URL not set — DM call sessions are process-local only',
      );
    }
  }

  onModuleDestroy(): void {
    for (const t of this.ringTimers.values()) clearTimeout(t);
    this.ringTimers.clear();
    // Do NOT quit — connection is owned by RedisService
  }

  pairKey(userA: string, userB: string): string {
    return [userA, userB].sort().join(':');
  }

  private userKey(userId: string): string {
    return `user:${userId}`;
  }

  private callKey(callId: string): string {
    return `call:${callId}`;
  }

  private lockKey(userId: string): string {
    return `lock:user:${userId}`;
  }

  private serialize(session: DmCallSessionRecord): string {
    return JSON.stringify(session);
  }

  private deserialize(raw: string): DmCallSessionRecord | null {
    try {
      const parsed = JSON.parse(raw) as DmCallSessionRecord;
      if (!parsed?.callId || !parsed.initiatorId || !parsed.calleeId) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  private async getSession(callId: string): Promise<DmCallSessionRecord | null> {
    if (this.redis) {
      const raw = await this.redis.get(this.callKey(callId));
      return raw ? this.deserialize(raw) : null;
    }
    return this.memorySessions.get(callId) ?? null;
  }

  private async getUserCallId(userId: string): Promise<string | null> {
    if (this.redis) {
      return (await this.redis.get(this.userKey(userId))) || null;
    }
    return this.memoryUserCall.get(userId) ?? null;
  }

  private async saveSession(session: DmCallSessionRecord): Promise<void> {
    session.updatedAt = Date.now();
    const ttl =
      session.state === 'connected' || session.state === 'connecting'
        ? DM_CALL_CONNECTED_TTL_SEC
        : DM_CALL_RING_TTL_SEC;

    if (this.redis) {
      const pipe = this.redis.pipeline();
      pipe.set(this.callKey(session.callId), this.serialize(session), 'EX', ttl);
      pipe.set(this.userKey(session.initiatorId), session.callId, 'EX', ttl);
      pipe.set(this.userKey(session.calleeId), session.callId, 'EX', ttl);
      pipe.set(
        this.lockKey(session.initiatorId),
        session.callId,
        'EX',
        ttl,
        'NX',
      );
      pipe.set(
        this.lockKey(session.calleeId),
        session.callId,
        'EX',
        ttl,
        'NX',
      );
      await pipe.exec();
    } else {
      this.memorySessions.set(session.callId, session);
      this.memoryUserCall.set(session.initiatorId, session.callId);
      this.memoryUserCall.set(session.calleeId, session.callId);
    }
  }

  private async deleteSession(session: DmCallSessionRecord): Promise<void> {
    const t = this.ringTimers.get(session.callId);
    if (t) {
      clearTimeout(t);
      this.ringTimers.delete(session.callId);
    }

    if (this.redis) {
      const pipe = this.redis.pipeline();
      pipe.del(this.callKey(session.callId));
      const initiatorCall = await this.redis.get(this.userKey(session.initiatorId));
      if (initiatorCall === session.callId) pipe.del(this.userKey(session.initiatorId));
      const calleeCall = await this.redis.get(this.userKey(session.calleeId));
      if (calleeCall === session.callId) pipe.del(this.userKey(session.calleeId));
      pipe.del(this.lockKey(session.initiatorId));
      pipe.del(this.lockKey(session.calleeId));
      await pipe.exec();
    } else {
      this.memorySessions.delete(session.callId);
      if (this.memoryUserCall.get(session.initiatorId) === session.callId) {
        this.memoryUserCall.delete(session.initiatorId);
      }
      if (this.memoryUserCall.get(session.calleeId) === session.callId) {
        this.memoryUserCall.delete(session.calleeId);
      }
    }
  }

  private scheduleRingTimeout(
    session: DmCallSessionRecord,
    onTimeout: (s: DmCallSessionRecord) => void,
  ): void {
    const existing = this.ringTimers.get(session.callId);
    if (existing) clearTimeout(existing);
    const delay = Math.max(1000, session.ringExpiresAt - Date.now());
    const timer = setTimeout(() => {
      void (async () => {
        const current = await this.getSession(session.callId);
        if (!current || current.logged) return;
        if (current.state !== 'ringing') return;
        current.state = 'timeout';
        await this.deleteSession(current);
        onTimeout(current);
      })();
    }, delay);
    this.ringTimers.set(session.callId, timer);
  }

  async getSessionsForUser(userId: string): Promise<DmCallSessionSyncItem[]> {
    const callId = await this.getUserCallId(userId);
    if (!callId) return [];
    const session = await this.getSession(callId);
    if (!session || !ACTIVE_STATES.includes(session.state)) return [];

    const peerId =
      session.initiatorId === userId ? session.calleeId : session.initiatorId;
    return [
      {
        callId: session.callId,
        peerId,
        role: session.initiatorId === userId ? 'caller' : 'callee',
        state: session.state,
        type: session.type,
        roomId: session.roomId,
      },
    ];
  }

  async getByPair(
    userA: string,
    userB: string,
  ): Promise<DmCallSessionRecord | null> {
    const callIdA = await this.getUserCallId(userA);
    const callIdB = await this.getUserCallId(userB);
    const callId = callIdA && callIdA === callIdB ? callIdA : callIdA ?? callIdB;
    if (!callId) return null;
    const session = await this.getSession(callId);
    if (!session) return null;
    const key = this.pairKey(userA, userB);
    if (this.pairKey(session.initiatorId, session.calleeId) !== key) return null;
    return session;
  }

  async tryInitiate(params: {
    initiatorId: string;
    calleeId: string;
    type: DmCallMediaType;
    initiatorSocketId: string;
    platform?: DmCallClientPlatform;
    onRingTimeout: (session: DmCallSessionRecord) => void;
  }): Promise<DmCallInitiateOutcome> {
    const { initiatorId, calleeId, type, initiatorSocketId, platform, onRingTimeout } =
      params;

    const calleeCallId = await this.getUserCallId(calleeId);
    if (calleeCallId) {
      const calleeSession = await this.getSession(calleeCallId);
      if (calleeSession && ACTIVE_STATES.includes(calleeSession.state)) {
        const calleePeer =
          calleeSession.initiatorId === calleeId
            ? calleeSession.calleeId
            : calleeSession.initiatorId;
        if (calleePeer !== initiatorId) {
          return { ok: false, code: 'peer_busy', peerId: calleeId };
        }
      }
    }

    const initiatorCallId = await this.getUserCallId(initiatorId);
    if (initiatorCallId) {
      const initiatorSession = await this.getSession(initiatorCallId);
      if (initiatorSession && ACTIVE_STATES.includes(initiatorSession.state)) {
        const samePair =
          this.pairKey(initiatorSession.initiatorId, initiatorSession.calleeId) ===
          this.pairKey(initiatorId, calleeId);
        if (samePair && initiatorSession.state === 'ringing') {
          initiatorSession.initiatorSocketId = initiatorSocketId;
          initiatorSession.initiatorPlatform = platform;
          initiatorSession.ringExpiresAt = Date.now() + DM_CALL_RING_TTL_SEC * 1000;
          await this.saveSession(initiatorSession);
          this.scheduleRingTimeout(initiatorSession, onRingTimeout);
          return { ok: true, callId: initiatorSession.callId, session: initiatorSession };
        }
        return { ok: false, code: 'already_in_call', peerId: calleeId };
      }
    }

    const now = Date.now();
    const session: DmCallSessionRecord = {
      callId: randomUUID(),
      initiatorId,
      calleeId,
      type,
      state: 'ringing',
      initiatorSocketId,
      initiatorPlatform: platform,
      createdAt: now,
      updatedAt: now,
      logged: false,
      ringExpiresAt: now + DM_CALL_RING_TTL_SEC * 1000,
    };

    await this.saveSession(session);
    this.scheduleRingTimeout(session, onRingTimeout);
    return { ok: true, callId: session.callId, session };
  }

  async markAnswered(params: {
    userId: string;
    callerId: string;
    answeringSocketId: string;
    roomId?: string;
  }): Promise<DmCallSessionRecord | null> {
    const session = await this.getByPair(params.userId, params.callerId);
    if (!session || session.logged) return null;
    if (session.answeredAt && session.state === 'connected') return session;
    session.state = 'connected';
    session.answeredAt = Date.now();
    session.answeredBySocketId = params.answeringSocketId;
    if (params.roomId) session.roomId = params.roomId;
    await this.saveSession(session);
    const t = this.ringTimers.get(session.callId);
    if (t) {
      clearTimeout(t);
      this.ringTimers.delete(session.callId);
    }
    return session;
  }

  wasCallLogPersisted(callId: string): boolean {
    return this.persistedCallIds.has(callId);
  }

  markCallLogPersisted(callId: string): void {
    this.persistedCallIds.add(callId);
  }

  async markEnded(params: {
    userId: string;
    peerId: string;
    explicitStatus?: 'missed' | 'completed' | 'declined' | 'cancelled';
  }): Promise<DmCallSessionRecord | null> {
    const session = await this.getByPair(params.userId, params.peerId);
    if (!session) return null;
    if (params.explicitStatus) {
      session.state =
        params.explicitStatus === 'missed'
          ? 'timeout'
          : (params.explicitStatus as DmCallState);
    } else if (session.answeredAt) {
      session.state = 'ended';
    } else if (params.userId === session.calleeId) {
      session.state = 'rejected';
    } else if (params.userId === session.initiatorId) {
      session.state = 'cancelled';
    } else {
      session.state = 'ended';
    }
    await this.deleteSession(session);
    return session;
  }

  async heartbeat(callId: string, userId: string): Promise<boolean> {
    const session = await this.getSession(callId);
    if (!session) return false;
    if (session.initiatorId !== userId && session.calleeId !== userId) return false;
    if (!ACTIVE_STATES.includes(session.state)) return false;
    await this.saveSession(session);
    return true;
  }

  async releaseUser(userId: string): Promise<void> {
    const callId = await this.getUserCallId(userId);
    if (!callId) return;
    const session = await this.getSession(callId);
    if (!session) return;
    if (!session.logged) {
      session.logged = true;
      session.state = 'disconnected';
    }
    await this.deleteSession(session);
  }

  async onInitiatorFullyOffline(
    initiatorId: string,
  ): Promise<DmCallSessionRecord[]> {
    const ended: DmCallSessionRecord[] = [];
    const callId = await this.getUserCallId(initiatorId);
    if (!callId) return ended;
    const session = await this.getSession(callId);
    if (
      !session ||
      session.initiatorId !== initiatorId ||
      session.answeredAt
    ) {
      return ended;
    }
    session.state = 'cancelled';
    await this.deleteSession(session);
    ended.push(session);
    return ended;
  }

  /**
   * Called when a user's last socket disconnects.
   * Handles ALL active sessions for this user — including connected/answered
   * calls and cases where the user was the callee (not the initiator).
   * Returns the peer ID and session if a connected call was cleaned up,
   * so the gateway can notify the peer.
   */
  async onUserFullyOffline(userId: string): Promise<{
    unansweredCancelled: DmCallSessionRecord[];
    connectedEnded: { session: DmCallSessionRecord; peerId: string } | null;
  }> {
    // Step 1: cancel any unanswered outgoing (initiator-only, no answeredAt).
    const unansweredCancelled = await this.onInitiatorFullyOffline(userId);

    // Step 2: check if a connected (answered) session still exists for this user.
    const callId = await this.getUserCallId(userId);
    if (!callId) {
      return { unansweredCancelled, connectedEnded: null };
    }
    const session = await this.getSession(callId);
    if (!session || !ACTIVE_STATES.includes(session.state)) {
      return { unansweredCancelled, connectedEnded: null };
    }

    // We have an active (likely connected/answered) session — clean it up.
    const peerId =
      session.initiatorId === userId ? session.calleeId : session.initiatorId;
    await this.deleteSession(session);
    return { unansweredCancelled, connectedEnded: { session, peerId } };
  }
}
