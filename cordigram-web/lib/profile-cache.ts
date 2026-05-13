import type { ProfileDetailResponse } from "./api";

const CACHE_KEY_PREFIX = "cordigram_profile_cache:";
const CACHE_INDEX_KEY = "cordigram_profile_cache_index";
const MAX_CACHED_PROFILES = 30;
// After 24h, stale data is too old to show while revalidating
const MAX_STALE_AGE_MS = 24 * 60 * 60 * 1000;

interface CacheEntry {
  data: ProfileDetailResponse;
  cachedAt: number;
}

function getCacheIndex(): string[] {
  try {
    const raw = localStorage.getItem(CACHE_INDEX_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function setCacheIndex(index: string[]) {
  try {
    localStorage.setItem(CACHE_INDEX_KEY, JSON.stringify(index));
  } catch {}
}

export function getCachedProfile(profileId: string): ProfileDetailResponse | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY_PREFIX + profileId);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry;
    if (Date.now() - entry.cachedAt > MAX_STALE_AGE_MS) {
      evictProfile(profileId);
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

export function setCachedProfile(profileId: string, data: ProfileDetailResponse) {
  try {
    const entry: CacheEntry = { data, cachedAt: Date.now() };
    localStorage.setItem(CACHE_KEY_PREFIX + profileId, JSON.stringify(entry));

    const index = getCacheIndex().filter((id) => id !== profileId);
    index.push(profileId);

    // Evict oldest entries if over limit
    while (index.length > MAX_CACHED_PROFILES) {
      const oldest = index.shift();
      if (oldest) {
        try {
          localStorage.removeItem(CACHE_KEY_PREFIX + oldest);
        } catch {}
      }
    }

    setCacheIndex(index);
  } catch {}
}

function evictProfile(profileId: string) {
  try {
    localStorage.removeItem(CACHE_KEY_PREFIX + profileId);
    const index = getCacheIndex().filter((id) => id !== profileId);
    setCacheIndex(index);
  } catch {}
}

export function invalidateCachedProfile(profileId: string) {
  evictProfile(profileId);
}
