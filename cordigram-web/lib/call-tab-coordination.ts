/** Per-peer cross-tab lock: one tab per callee, multiple callees allowed. */

const LOCK_PREFIX = "cordigram-call-lock:";
const TAB_ID_KEY = "cordigram-call-tab-id";
const LOCK_TTL_MS = 15 * 60 * 1000;

export type OutboundCallLock = {
  tabId: string;
  peerId: string;
  at: number;
};

function lockStorageKey(peerId: string): string {
  return `${LOCK_PREFIX}${peerId}`;
}

function readLock(peerId: string): OutboundCallLock | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(lockStorageKey(peerId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OutboundCallLock;
    if (!parsed?.tabId || !parsed?.peerId || !parsed?.at) return null;
    if (Date.now() - parsed.at > LOCK_TTL_MS) {
      window.localStorage.removeItem(lockStorageKey(peerId));
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

/** False if another tab already owns an outbound call to this peer. */
export function tryAcquireOutboundCallLock(
  tabId: string,
  peerId: string,
): boolean {
  if (typeof window === "undefined") return true;
  const existing = readLock(peerId);
  if (existing && existing.tabId !== tabId) {
    return false;
  }
  try {
    window.localStorage.setItem(
      lockStorageKey(peerId),
      JSON.stringify({ tabId, peerId, at: Date.now() } satisfies OutboundCallLock),
    );
    return true;
  } catch {
    return true;
  }
}

export function hasOutboundCallLock(peerId: string): boolean {
  return Boolean(readLock(peerId));
}

export function ownsOutboundCallLock(tabId: string, peerId: string): boolean {
  const lock = readLock(peerId);
  return Boolean(
    lock && lock.tabId === tabId && String(lock.peerId) === String(peerId),
  );
}

export function releaseOutboundCallLock(tabId: string, peerId: string): void {
  if (typeof window === "undefined") return;
  const lock = readLock(peerId);
  if (lock?.tabId === tabId) {
    try {
      window.localStorage.removeItem(lockStorageKey(peerId));
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
    if (!e.key?.startsWith(LOCK_PREFIX) || !e.newValue) return;
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
