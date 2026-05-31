/** Canonical DM 1:1 call lifecycle states (server source of truth). */
export type DmCallState =
  | 'idle'
  | 'ringing'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'rejected'
  | 'cancelled'
  | 'ended'
  | 'timeout'
  | 'failed';

export type DmCallMediaType = 'audio' | 'video';

export type DmCallClientPlatform = 'web' | 'mobile' | 'mobile_browser';

export interface DmCallSessionRecord {
  callId: string;
  initiatorId: string;
  calleeId: string;
  type: DmCallMediaType;
  state: DmCallState;
  roomId?: string;
  answeredAt?: number;
  answeredBySocketId?: string;
  initiatorSocketId?: string;
  initiatorPlatform?: DmCallClientPlatform;
  createdAt: number;
  updatedAt: number;
  /** Prevents duplicate Mongo call-log writes. */
  logged: boolean;
  ringExpiresAt: number;
}

export type DmCallBusyCode =
  | 'already_in_call'
  | 'peer_busy'
  | 'user_busy';

export interface DmCallInitiateResult {
  ok: true;
  callId: string;
  session: DmCallSessionRecord;
}

export interface DmCallInitiateFailure {
  ok: false;
  code: DmCallBusyCode;
  peerId: string;
}

export type DmCallInitiateOutcome = DmCallInitiateResult | DmCallInitiateFailure;

/** Snapshot sent on connect (`call-sessions-sync`). */
export interface DmCallSessionSyncItem {
  callId: string;
  peerId: string;
  role: 'caller' | 'callee';
  state: DmCallState;
  type: DmCallMediaType;
  roomId?: string;
}

export const DM_CALL_RING_TTL_SEC = 90;
export const DM_CALL_CONNECTED_TTL_SEC = 6 * 60 * 60;
