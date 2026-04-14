export type ChatGateBlockReason = 'verification' | 'age_under_18' | 'age_ack';

export type ServerVerificationLevel = 'none' | 'low' | 'medium' | 'high';

const FIVE_MIN_MS = 5 * 60 * 1000;
const TEN_MIN_MS = 10 * 60 * 1000;

export function normalizeServerVerificationLevel(
  raw: unknown,
): ServerVerificationLevel {
  if (raw === 'none' || raw === 'low' || raw === 'medium' || raw === 'high') {
    return raw;
  }
  return 'none';
}

export function computeVerificationChecks(input: {
  isVerified: boolean;
  accountCreatedAt: Date;
  memberJoinedAt: Date | null;
}): {
  emailVerified: boolean;
  accountOver5Min: boolean;
  memberOver10Min: boolean;
} {
  const accountAgeMs = Date.now() - input.accountCreatedAt.getTime();
  const memberTenureMs = input.memberJoinedAt
    ? Date.now() - input.memberJoinedAt.getTime()
    : 0;
  return {
    emailVerified: Boolean(input.isVerified),
    accountOver5Min: accountAgeMs >= FIVE_MIN_MS,
    memberOver10Min:
      Boolean(input.memberJoinedAt) && memberTenureMs >= TEN_MIN_MS,
  };
}

export function getVerificationWaitSeconds(input: {
  level: ServerVerificationLevel;
  isBypass: boolean;
  accountCreatedAt: Date;
  memberJoinedAt: Date | null;
}): { waitAccountSec: number | null; waitMemberSec: number | null } {
  if (input.isBypass || input.level === 'none') {
    return { waitAccountSec: null, waitMemberSec: null };
  }
  const accountAgeMs = Date.now() - input.accountCreatedAt.getTime();
  const memberTenureMs = input.memberJoinedAt
    ? Date.now() - input.memberJoinedAt.getTime()
    : 0;
  let waitAccountSec: number | null = null;
  let waitMemberSec: number | null = null;
  if (input.level === 'medium' || input.level === 'high') {
    if (accountAgeMs < FIVE_MIN_MS) {
      waitAccountSec = Math.max(
        0,
        Math.ceil((FIVE_MIN_MS - accountAgeMs) / 1000),
      );
    }
  }
  if (
    input.level === 'high' &&
    input.memberJoinedAt &&
    memberTenureMs < TEN_MIN_MS
  ) {
    waitMemberSec = Math.max(
      0,
      Math.ceil((TEN_MIN_MS - memberTenureMs) / 1000),
    );
  }
  return { waitAccountSec, waitMemberSec };
}

export function calcAgeFromBirthdate(
  birthdate: Date | null | undefined,
): number | null {
  if (!birthdate) return null;
  const now = new Date();
  let age = now.getFullYear() - birthdate.getFullYear();
  const m = now.getMonth() - birthdate.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birthdate.getDate())) age -= 1;
  return age;
}

export function passesVerificationLevels(input: {
  verificationLevel: ServerVerificationLevel;
  isVerified: boolean;
  accountCreatedAt: Date;
  memberJoinedAt: Date | null;
  isBypass: boolean;
}): boolean {
  if (input.isBypass) return true;
  const level = normalizeServerVerificationLevel(input.verificationLevel);
  if (level === 'none') return true;
  const accountAgeMs = Date.now() - input.accountCreatedAt.getTime();
  if (level === 'low') {
    return Boolean(input.isVerified);
  }
  if (level === 'medium') {
    return Boolean(input.isVerified) && accountAgeMs >= FIVE_MIN_MS;
  }
  if (level === 'high') {
    const joined = input.memberJoinedAt
      ? input.memberJoinedAt.getTime()
      : Date.now();
    const memberTenureMs = Date.now() - joined;
    return (
      Boolean(input.isVerified) &&
      accountAgeMs >= FIVE_MIN_MS &&
      memberTenureMs >= TEN_MIN_MS
    );
  }
  return true;
}

/**
 * Thứ tự: bypass → giới hạn độ tuổi → mức xác minh máy chủ.
 */
export function evaluateChannelChatGate(input: {
  isAgeRestricted: boolean;
  ageRestrictedAcknowledged: boolean;
  birthdate: Date | null | undefined;
  verificationLevel: ServerVerificationLevel;
  isVerified: boolean;
  accountCreatedAt: Date;
  memberJoinedAt: Date | null;
  isBypass: boolean;
}): { allowed: boolean; reason?: ChatGateBlockReason } {
  if (input.isBypass) return { allowed: true };

  if (input.isAgeRestricted) {
    const age = calcAgeFromBirthdate(input.birthdate);
    if (age == null || age < 18) {
      return { allowed: false, reason: 'age_under_18' };
    }
    if (!input.ageRestrictedAcknowledged) {
      return { allowed: false, reason: 'age_ack' };
    }
  }

  if (
    !passesVerificationLevels({
      verificationLevel: input.verificationLevel,
      isVerified: input.isVerified,
      accountCreatedAt: input.accountCreatedAt,
      memberJoinedAt: input.memberJoinedAt,
      isBypass: input.isBypass,
    })
  ) {
    return { allowed: false, reason: 'verification' };
  }

  return { allowed: true };
}
