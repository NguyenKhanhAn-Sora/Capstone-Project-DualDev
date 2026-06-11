import { DmCallSessionService } from './dm-call-session.service';
import { RedisService } from '../redis/redis.service';

/** Minimal mock — REDIS_URL is not set in tests so redis is null (in-memory mode). */
const mockRedisService = { queueConnection: null, workerConnection: null } as unknown as RedisService;

describe('DmCallSessionService (in-memory)', () => {
  let service: DmCallSessionService;

  beforeEach(() => {
    service = new DmCallSessionService(mockRedisService);
  });

  it('blocks peer_busy when callee is in another call', async () => {
    const noop = () => undefined;

    const first = await service.tryInitiate({
      initiatorId: 'user-a',
      calleeId: 'user-b',
      type: 'audio',
      initiatorSocketId: 'sock-1',
      onRingTimeout: noop,
    });
    expect(first.ok).toBe(true);

    const second = await service.tryInitiate({
      initiatorId: 'user-c',
      calleeId: 'user-b',
      type: 'video',
      initiatorSocketId: 'sock-2',
      onRingTimeout: noop,
    });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.code).toBe('peer_busy');
  });

  it('allows same pair re-ring while still ringing', async () => {
    const noop = () => undefined;
    const a = await service.tryInitiate({
      initiatorId: 'user-a',
      calleeId: 'user-b',
      type: 'audio',
      initiatorSocketId: 'sock-1',
      onRingTimeout: noop,
    });
    const b = await service.tryInitiate({
      initiatorId: 'user-a',
      calleeId: 'user-b',
      type: 'audio',
      initiatorSocketId: 'sock-2',
      onRingTimeout: noop,
    });
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(a.callId).toBe(b.callId);
  });

  it('allows web caller to initiate with another peer while in call', async () => {
    const noop = () => undefined;
    const withB = await service.tryInitiate({
      initiatorId: 'user-a',
      calleeId: 'user-b',
      type: 'audio',
      initiatorSocketId: 'sock-1',
      platform: 'web',
      onRingTimeout: noop,
    });
    expect(withB.ok).toBe(true);

    const withC = await service.tryInitiate({
      initiatorId: 'user-a',
      calleeId: 'user-c',
      type: 'audio',
      initiatorSocketId: 'sock-2',
      platform: 'web',
      onRingTimeout: noop,
    });
    expect(withC.ok).toBe(true);
  });

  it('allows mobile caller to initiate with another peer while in call', async () => {
    const noop = () => undefined;
    const withB = await service.tryInitiate({
      initiatorId: 'user-a',
      calleeId: 'user-b',
      type: 'audio',
      initiatorSocketId: 'sock-1',
      platform: 'mobile',
      onRingTimeout: noop,
    });
    expect(withB.ok).toBe(true);

    const withC = await service.tryInitiate({
      initiatorId: 'user-a',
      calleeId: 'user-c',
      type: 'audio',
      initiatorSocketId: 'sock-2',
      platform: 'mobile',
      onRingTimeout: noop,
    });
    expect(withC.ok).toBe(true);
  });

  it('blocks duplicate pair when call is already connected', async () => {
    const noop = () => undefined;
    const first = await service.tryInitiate({
      initiatorId: 'user-a',
      calleeId: 'user-b',
      type: 'audio',
      initiatorSocketId: 'sock-1',
      platform: 'web',
      onRingTimeout: noop,
    });
    expect(first.ok).toBe(true);
    await service.markAnswered({
      userId: 'user-b',
      callerId: 'user-a',
      answeringSocketId: 'sock-callee',
    });

    const duplicate = await service.tryInitiate({
      initiatorId: 'user-a',
      calleeId: 'user-b',
      type: 'video',
      initiatorSocketId: 'sock-2',
      platform: 'web',
      onRingTimeout: noop,
    });
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) expect(duplicate.code).toBe('already_in_call');
  });
});
