import { fetchBlockedUsers, type CommentItem, type FeedItem, type ProfileSearchItem } from "@/lib/api";

const BLOCKED_USERS_STORAGE_KEY = "blockedUsers:v1";
const CACHE_TTL_MS = 60_000;

let blockedIdsCache: Set<string> | null = null;
let blockedIdsUpdatedAt = 0;
let blockedIdsRequest: Promise<Set<string>> | null = null;

const normalizeId = (value?: string | null) => {
  const next = (value || "").trim();
  return next || "";
};

const readBlockedIdsFromStorage = (): Set<string> => {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(BLOCKED_USERS_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as { ids?: unknown; updatedAt?: unknown };
    const ids = Array.isArray(parsed?.ids)
      ? parsed.ids
          .filter((item): item is string => typeof item === "string")
          .map((item) => normalizeId(item))
          .filter(Boolean)
      : [];
    const set = new Set(ids);
    blockedIdsUpdatedAt =
      typeof parsed?.updatedAt === "number" ? parsed.updatedAt : Date.now();
    return set;
  } catch {
    return new Set();
  }
};

const writeBlockedIdsToStorage = (ids: Set<string>) => {
  if (typeof window === "undefined") return;
  const payload = {
    ids: Array.from(ids),
    updatedAt: Date.now(),
  };
  try {
    window.localStorage.setItem(BLOCKED_USERS_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore storage failures
  }
};

const ensureBlockedIdsCache = () => {
  if (blockedIdsCache) return blockedIdsCache;
  blockedIdsCache = readBlockedIdsFromStorage();
  if (!blockedIdsUpdatedAt) blockedIdsUpdatedAt = Date.now();
  return blockedIdsCache;
};

export const getBlockedUserIdsSnapshot = (): Set<string> => {
  return new Set(ensureBlockedIdsCache());
};

export const refreshBlockedUserIds = async (
  token: string,
  opts?: { force?: boolean },
): Promise<Set<string>> => {
  const force = Boolean(opts?.force);
  const now = Date.now();
  const cache = ensureBlockedIdsCache();
  if (!force && now - blockedIdsUpdatedAt <= CACHE_TTL_MS) {
    return new Set(cache);
  }

  if (!force && blockedIdsRequest) {
    const shared = await blockedIdsRequest;
    return new Set(shared);
  }

  blockedIdsRequest = fetchBlockedUsers({ token, limit: 200 })
    .then((res) => {
      const next = new Set(
        (res?.items || [])
          .map((item) => normalizeId(item?.userId))
          .filter(Boolean),
      );
      blockedIdsCache = next;
      blockedIdsUpdatedAt = Date.now();
      writeBlockedIdsToStorage(next);
      return next;
    })
    .finally(() => {
      blockedIdsRequest = null;
    });

  const result = await blockedIdsRequest;
  return new Set(result);
};

export const addBlockedUserIdLocally = (userId?: string | null): Set<string> => {
  const id = normalizeId(userId);
  const next = ensureBlockedIdsCache();
  if (!id || next.has(id)) {
    return new Set(next);
  }
  next.add(id);
  blockedIdsUpdatedAt = Date.now();
  writeBlockedIdsToStorage(next);
  return new Set(next);
};

const resolveFeedAuthorId = (item: FeedItem) => {
  return normalizeId(item.authorId || item.author?.id);
};

const resolveCommentAuthorId = (item: CommentItem) => {
  return normalizeId(item.author?.id || item.authorId);
};

const resolveProfileItemUserId = (item: ProfileSearchItem) => {
  return normalizeId(item.userId || item.id);
};

export const filterFeedItemsByBlockedAuthors = (
  items: FeedItem[],
  blockedIds: Set<string>,
) => {
  if (!blockedIds.size) return items;
  return items.filter((item) => {
    const authorId = resolveFeedAuthorId(item);
    return !authorId || !blockedIds.has(authorId);
  });
};

export const filterCommentsByBlockedAuthors = (
  items: CommentItem[],
  blockedIds: Set<string>,
) => {
  if (!blockedIds.size) return items;
  return items.filter((item) => {
    const authorId = resolveCommentAuthorId(item);
    return !authorId || !blockedIds.has(authorId);
  });
};

export const filterProfilesByBlockedUsers = (
  items: ProfileSearchItem[],
  blockedIds: Set<string>,
) => {
  if (!blockedIds.size) return items;
  return items.filter((item) => {
    const userId = resolveProfileItemUserId(item);
    return !userId || !blockedIds.has(userId);
  });
};

export const isBlockedAuthorId = (
  authorId: string | undefined | null,
  blockedIds: Set<string>,
) => {
  if (!blockedIds.size) return false;
  const id = normalizeId(authorId);
  if (!id) return false;
  return blockedIds.has(id);
};
