const INTERACTION_MUTED_PATTERNS: RegExp[] = [
  /interaction(?:s)?\s+(?:are|is)?\s*temporarily\s*muted/i,
  /interaction(?:s)?\s+muted/i,
  /you\s+cannot\s+.*(like|repost|comment|create\s+posts\/reels)/i,
];

export const INTERACTION_MUTED_FALLBACK_MESSAGE =
  "Your interaction is muted right now. You cannot like or repost until moderation enables it again.";

const extractErrorMessage = (err: unknown): string => {
  if (!err || typeof err !== "object") return "";
  const maybeMessage = (err as { message?: unknown }).message;
  return typeof maybeMessage === "string" ? maybeMessage : "";
};

export const getInteractionMutedMessage = (err: unknown): string | null => {
  const message = extractErrorMessage(err).trim();
  if (!message) return null;
  return INTERACTION_MUTED_PATTERNS.some((pattern) => pattern.test(message))
    ? message
    : null;
};
