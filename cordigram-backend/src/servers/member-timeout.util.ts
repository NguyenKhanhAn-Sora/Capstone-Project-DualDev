export const MEMBER_TIMEOUT_BLOCKED_MESSAGE =
  'Bạn đang bị hạn chế và không thể gửi tin nhắn hoặc tham gia kênh thoại.';

export const MEMBER_TIMEOUT_VOICE_BLOCKED_MESSAGE =
  'Bạn đang bị hạn chế và không thể tham gia kênh thoại.';

export function parseTimeoutUntil(
  raw: Date | string | null | undefined,
): Date | null {
  if (!raw) return null;
  const d = raw instanceof Date ? raw : new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function isMemberTimedOut(member: {
  timeoutUntil?: Date | string | null;
}): boolean {
  const until = parseTimeoutUntil(member?.timeoutUntil ?? null);
  return until != null && until.getTime() > Date.now();
}

export function getMemberTimeoutRemainingSeconds(member: {
  timeoutUntil?: Date | string | null;
}): number {
  const until = parseTimeoutUntil(member?.timeoutUntil ?? null);
  if (!until) return 0;
  return Math.max(0, Math.ceil((until.getTime() - Date.now()) / 1000));
}
