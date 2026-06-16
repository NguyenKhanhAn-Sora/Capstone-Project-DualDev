export const DM_CONVERSATION_CATEGORIES = [
  "customer",
  "family",
  "work",
  "friends",
  "reply_later",
  "colleague",
] as const;

export type DmConversationCategory =
  (typeof DM_CONVERSATION_CATEGORIES)[number];

export type DmConversationPreferences = {
  mutedUntil: string | null;
  mutedForever: boolean;
  category: DmConversationCategory | null;
};

export const DM_CATEGORY_COLORS: Record<DmConversationCategory, string> = {
  customer: "#ed4245",
  family: "#eb459e",
  work: "#faa61a",
  friends: "#fee75c",
  reply_later: "#57f287",
  colleague: "#5865f2",
};

export function emptyDmConversationPreferences(): DmConversationPreferences {
  return { mutedUntil: null, mutedForever: false, category: null };
}

export function parseDmConversationPreferences(
  raw: unknown,
): DmConversationPreferences {
  if (!raw || typeof raw !== "object") return emptyDmConversationPreferences();
  const p = raw as Record<string, unknown>;
  const categoryRaw = p.category;
  const category =
    typeof categoryRaw === "string" &&
    (DM_CONVERSATION_CATEGORIES as readonly string[]).includes(categoryRaw)
      ? (categoryRaw as DmConversationCategory)
      : null;
  return {
    mutedUntil:
      typeof p.mutedUntil === "string" && p.mutedUntil.trim()
        ? p.mutedUntil
        : null,
    mutedForever: p.mutedForever === true,
    category,
  };
}

export function isDmConversationMuted(
  pref?: DmConversationPreferences | null,
  now = Date.now(),
): boolean {
  if (!pref) return false;
  if (pref.mutedForever) return true;
  if (!pref.mutedUntil) return false;
  const until = new Date(pref.mutedUntil).getTime();
  return !Number.isNaN(until) && until > now;
}

export function computeMutePatch(
  option: "1h" | "4h" | "8am" | "forever" | "off",
): Pick<DmConversationPreferences, "mutedUntil" | "mutedForever"> {
  if (option === "off") {
    return { mutedUntil: null, mutedForever: false };
  }
  if (option === "forever") {
    return { mutedUntil: null, mutedForever: true };
  }
  const now = new Date();
  if (option === "1h") {
    return {
      mutedUntil: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
      mutedForever: false,
    };
  }
  if (option === "4h") {
    return {
      mutedUntil: new Date(now.getTime() + 4 * 60 * 60 * 1000).toISOString(),
      mutedForever: false,
    };
  }
  const target = new Date(now);
  target.setHours(8, 0, 0, 0);
  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1);
  }
  return { mutedUntil: target.toISOString(), mutedForever: false };
}
