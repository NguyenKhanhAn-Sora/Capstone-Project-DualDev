import { formatRelativeTime } from "@/lib/relative-time";
import type { PresenceStatus, UserPresence } from "@/hooks/use-direct-messages";

export function resolvePresenceStatus(
  entry: UserPresence | PresenceStatus | undefined,
): PresenceStatus | undefined {
  if (!entry) return undefined;
  if (typeof entry === "string") return entry;
  return entry.status;
}

export function resolvePresenceLastActiveAt(
  entry: UserPresence | PresenceStatus | undefined,
): string | null | undefined {
  if (!entry || typeof entry === "string") return undefined;
  return entry.lastActiveAt ?? null;
}

export function formatDmPresenceLabel(opts: {
  entry: UserPresence | PresenceStatus | undefined;
  t: (key: string, params?: Record<string, string>) => string;
  language: string;
  fallbackLastActiveAt?: string | null;
}): string {
  const status = resolvePresenceStatus(opts.entry);
  const lastActiveAt =
    resolvePresenceLastActiveAt(opts.entry) ?? opts.fallbackLastActiveAt ?? null;

  if (status === "online") return opts.t("chat.presence.online");
  if (status === "idle") return opts.t("chat.presence.idle");

  if (lastActiveAt) {
    const rel = formatRelativeTime(lastActiveAt, opts.language, {
      addSuffix: true,
    });
    if (rel) {
      return opts.t("chat.presence.offlineAgo", { time: rel });
    }
  }

  return opts.t("chat.presence.offline");
}
