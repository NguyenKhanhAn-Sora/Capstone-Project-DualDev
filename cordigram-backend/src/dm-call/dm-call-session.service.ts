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

const MEDIA_ACTIVE_STATES: DmCallState[] = [
  'connecting',
  'connected',
  'reconnecting',
];

@Injectable()
export class DmCallSessionService implements OnModuleDestroy {
  private readonly logger = new Logger(DmCallSessionService.name);
  private readonly redis: IORedis | null;
  private readonly memorySessions = new Map<string, DmCallSessionRecord>();
  private readonly memoryPairCall = new Map<string, string>();
  private readonly memoryUserCalls = new Map<string, Set<string>>();
  private readonly ringTimers = new Map<string, NodeJS.Timeout>();
  /** Prevents duplicate Mongo call-log writes for the same callId. */
  private readonly persistedCallIds = new Set<string>();

  constructor(private readonly redisService: RedisService) {
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
  }

  pairKey(userA: string, userB: string): string {
    return [userA, userB].sort().join(':');
  }

  private pairCallKey(userA: string, userB: string): string {
    return `pair:${this.pairKey(userA, userB)}`;
  }

  private userCallsKey(userId: string): string {
    return `user:${userId}:calls`;
  }

  private callKey(callId: string): string {
    return `call:${callId}`;
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

  private async getUserCallIds(userId: string): Promise<string[]> {
    if (this.redis) {
      return (await this.redis.smembers(this.userCallsKey(userId))) || [];
    }
    return Array.from(this.memoryUserCalls.get(userId) ?? []);
  }

  private async getPairCallId(
    userA: string,
    userB: string,
  ): Promise<string | null> {
    const key = this.pairCallKey(userA, userB);
    if (this.redis) {
      return (await this.redis.get(key)) || null;
    }
    return this.memoryPairCall.get(this.pairKey(userA, userB)) ?? null;
  }

  private trackUserCall(userId: string, callId: string): void {
    const set = this.memoryUserCalls.get(userId) ?? new Set<string>();
    set.add(callId);
    this.memoryUserCalls.set(userId, set);
  }

  private untrackUserCall(userId: string, callId: string): void {
    const set = this.memoryUserCalls.get(userId);
    if (!set) return;
    set.delete(callId);
    if (set.size === 0) this.memoryUserCalls.delete(userId);
  }

  private async saveSession(session: DmCallSessionRecord): Promise<void> {
    session.updatedAt = Date.now();
    const ttl =
      session.state === 'connected' || session.state === 'connecting'
        ? DM_CALL_CONNECTED_TTL_SEC
        : DM_CALL_RING_TTL_SEC;
    const pairKey = this.pairKey(session.initiatorId, session.calleeId);

    if (this.redis) {
      const pipe = this.redis.pipeline();
      pipe.set(this.callKey(session.callId), this.serialize(session), 'EX', ttl);
      pipe.set(this.pairCallKey(session.initiatorId, session.calleeId), session.callId, 'EX', ttl);
      pipe.sadd(this.userCallsKey(session.initiatorId), session.callId);
      pipe.sadd(this.userCallsKey(session.calleeId), session.callId);
      pipe.expire(this.userCallsKey(session.initiatorId), ttl);
      pipe.expire(this.userCallsKey(session.calleeId), ttl);
      await pipe.exec();
    } else {
      this.memorySessions.set(session.callId, session);
      this.memoryPairCall.set(pairKey, session.callId);
      this.trackUserCall(session.initiatorId, session.callId);
      this.trackUserCall(session.calleeId, session.callId);
    }
  }

  private async deleteSession(session: DmCallSessionRecord): Promise<void> {
    const t = this.ringTimers.get(session.callId);
    if (t) {
      clearTimeout(t);
      this.ringTimers.delete(session.callId);
    }
    const pairKey = this.pairKey(session.initiatorId, session.calleeId);

    if (this.redis) {
      const pipe = this.redis.pipeline();
      pipe.del(this.callKey(session.callId));
      const pairCallId = await this.redis.get(
        this.pairCallKey(session.initiatorId, session.calleeId),
      );
      if (pairCallId === session.callId) {
        pipe.del(this.pairCallKey(session.initiatorId, session.calleeId));
      }
      pipe.srem(this.userCallsKey(session.initiatorId), session.callId);
      pipe.srem(this.userCallsKey(session.calleeId), session.callId);
      await pipe.exec();
    } else {
      this.memorySessions.delete(session.callId);
      if (this.memoryPairCall.get(pairKey) === session.callId) {
        this.memoryPairCall.delete(pairKey);
      }
      this.untrackUserCall(session.initiatorId, session.callId);
      this.untrackUserCall(session.calleeId, session.callId);
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

  async hasActiveSessionBetween(
    userA: string,
    userB: string,
  ): Promise<boolean> {
    const session = await this.getByPair(userA, userB);
    return Boolean(session && ACTIVE_STATES.includes(session.state));
  }

  async getSessionsForUser(userId: string): Promise<DmCallSessionSyncItem[]> {
    const callIds = await this.getUserCallIds(userId);
    const items: DmCallSessionSyncItem[] = [];
    for (const callId of callIds) {
      const session = await this.getSession(callId);
      if (!session || !ACTIVE_STATES.includes(session.state)) continue;
      const peerId =
        session.initiatorId === userId ? session.calleeId : session.initiatorId;
      items.push({
        callId: session.callId,
        peerId,
        role: session.initiatorId === userId ? 'caller' : 'callee',
        state: session.state,
        type: session.type,
        roomId: session.roomId,
      });
    }
    return items;
  }

  async getByPair(
    userA: string,
    userB: string,
  ): Promise<DmCallSessionRecord | null> {
    const callId = await this.getPairCallId(userA, userB);
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

    const existingPair = await this.getByPair(initiatorId, calleeId);
    if (existingPair && ACTIVE_STATES.includes(existingPair.state)) {
      if (
        existingPair.state === 'ringing' &&
        existingPair.initiatorId === initiatorId
      ) {
        existingPair.initiatorSocketId = initiatorSocketId;
        existingPair.initiatorPlatform = platform;
        existingPair.ringExpiresAt = Date.now() + DM_CALL_RING_TTL_SEC * 1000;
        await this.saveSession(existingPair);
        this.scheduleRingTimeout(existingPair, onRingTimeout);
        return { ok: true, callId: existingPair.callId, session: existingPair };
      }
      return { ok: false, code: 'already_in_call', peerId: calleeId };
    }

    const calleeCallIds = await this.getUserCallIds(calleeId);
    for (const callId of calleeCallIds) {
      const calleeSession = await this.getSession(callId);
      if (!calleeSession || !ACTIVE_STATES.includes(calleeSession.state)) continue;
      const calleePeer =
        calleeSession.initiatorId === calleeId
          ? calleeSession.calleeId
          : calleeSession.initiatorId;
      if (calleePeer !== initiatorId) {
        return { ok: false, code: 'peer_busy', peerId: calleeId };
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
    if (session.calleeId !== params.userId) return null;
    if (session.answeredAt && session.state === 'connected') return session;
    if (session.state !== 'ringing') return null;
    session.state = 'connected';
    session.answeredAt = Date.now();
    session.answeredBySocketId = params.answeringSocketId;
    session.calleeMediaSocketId = params.answeringSocketId;
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

  /**
   * Move LiveKit media ownership to another socket/device without ending the call.
   */
  async claimMedia(params: {
    userId: string;
    peerId: string;
    socketId: string;
  }): Promise<DmCallSessionRecord | null> {
    const session = await this.getByPair(params.userId, params.peerId);
    if (!session || session.logged) return null;
    if (!MEDIA_ACTIVE_STATES.includes(session.state)) return null;

    if (session.initiatorId === params.userId) {
      session.initiatorSocketId = params.socketId;
      session.initiatorMediaSocketId = params.socketId;
    } else if (session.calleeId === params.userId) {
      session.answeredBySocketId = params.socketId;
      session.calleeMediaSocketId = params.socketId;
    } else {
      return null;
    }

    await this.saveSession(session);
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
    const callIds = await this.getUserCallIds(userId);
    for (const callId of callIds) {
      const session = await this.getSession(callId);
      if (!session) continue;
      if (!session.logged) {
        session.logged = true;
        session.state = 'disconnected';
      }
      await this.deleteSession(session);
    }
  }

  async onInitiatorFullyOffline(
    initiatorId: string,
  ): Promise<DmCallSessionRecord[]> {
    const ended: DmCallSessionRecord[] = [];
    const callIds = await this.getUserCallIds(initiatorId);
    for (const callId of callIds) {
      const session = await this.getSession(callId);
      if (
        !session ||
        session.initiatorId !== initiatorId ||
        session.answeredAt
      ) {
        continue;
      }
      session.state = 'cancelled';
      await this.deleteSession(session);
      ended.push(session);
    }
    return ended;
  }
}
