/** Cross-tab coordination so only one browser tab owns an outbound DM call. */

const LOCK_KEY = "cordigram-call-lock";
const TAB_ID_KEY = "cordigram-call-tab-id";
const LOCK_TTL_MS = 15 * 60 * 1000;

export type OutboundCallLock = {
  tabId: string;
  peerId: string;
  at: number;
};

function readLock(): OutboundCallLock | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LOCK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OutboundCallLock;
    if (!parsed?.tabId || !parsed?.peerId || !parsed?.at) return null;
    if (Date.now() - parsed.at > LOCK_TTL_MS) {
      window.localStorage.removeItem(LOCK_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Stable id for this browser tab (sessionStorage is per-tab). */
export function getCallTabId(): string {
  if (typeof window === "undefined") return "ssr";
  try {
    let id = window.sessionStorage.getItem(TAB_ID_KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      window.sessionStorage.setItem(TAB_ID_KEY, id);
    }
    return id;
  } catch {
    return `tab-${Date.now()}`;
  }
}

/** Returns false if another tab already owns an outbound call. */
export function tryAcquireOutboundCallLock(
  tabId: string,
  peerId: string,
): boolean {
  if (typeof window === "undefined") return true;
  const existing = readLock();
  if (existing && existing.tabId !== tabId) {
    return false;
  }
  try {
    window.localStorage.setItem(
      LOCK_KEY,
      JSON.stringify({ tabId, peerId, at: Date.now() } satisfies OutboundCallLock),
    );
    return true;
  } catch {
    return true;
  }
}

export function ownsOutboundCallLock(tabId: string, peerId: string): boolean {
  const lock = readLock();
  return Boolean(
    lock && lock.tabId === tabId && String(lock.peerId) === String(peerId),
  );
}

export function releaseOutboundCallLock(tabId: string): void {
  if (typeof window === "undefined") return;
  const lock = readLock();
  if (lock?.tabId === tabId) {
    try {
      window.localStorage.removeItem(LOCK_KEY);
    } catch {
      // ignore
    }
  }
}

export function subscribeOutboundCallLock(
  tabId: string,
  onForeignLock: (lock: OutboundCallLock) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: StorageEvent) => {
    if (e.key !== LOCK_KEY || !e.newValue) return;
    try {
      const lock = JSON.parse(e.newValue) as OutboundCallLock;
      if (lock.tabId !== tabId) onForeignLock(lock);
    } catch {
      // ignore
    }
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}
