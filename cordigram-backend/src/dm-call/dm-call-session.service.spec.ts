import { DmCallSessionService } from './dm-call-session.service';
describe('DmCallSessionService (in-memory)', () => {
  let service: DmCallSessionService;

  beforeEach(() => {
    service = new DmCallSessionService();
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
});
