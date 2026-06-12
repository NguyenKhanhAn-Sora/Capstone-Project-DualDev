const STORAGE_KEY = "cordigram-dm-active-call-peers";
/** Drop stale entries if a call tab was killed without cleanup. */
const ACTIVE_PEER_TTL_MS = 4 * 60 * 60 * 1000;

type StoredPeer = { peerId: string; updatedAt: number };

function readStoredPeers(): StoredPeer[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    const now = Date.now();
    const peers: StoredPeer[] = [];
    for (const item of parsed) {
      if (typeof item === "string" && item) {
        peers.push({ peerId: item, updatedAt: now });
        continue;
      }
      if (
        item &&
        typeof item === "object" &&
        typeof (item as StoredPeer).peerId === "string" &&
        (item as StoredPeer).peerId
      ) {
        const entry = item as StoredPeer;
        if (now - (entry.updatedAt || 0) <= ACTIVE_PEER_TTL_MS) {
          peers.push({
            peerId: entry.peerId,
            updatedAt: entry.updatedAt || now,
          });
        }
      }
    }
    return peers;
  } catch {
    return [];
  }
}

function writeStoredPeers(peers: StoredPeer[]): void {
  if (typeof window === "undefined") return;
  try {
    if (peers.length === 0) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(peers));
  } catch {
    // ignore quota / private mode
  }
}

function readPeerIds(): Set<string> {
  return new Set(readStoredPeers().map((p) => p.peerId));
}

export function getActiveDmCallPeerIds(): string[] {
  return [...readPeerIds()];
}

export function isInActiveDmCall(): boolean {
  return readPeerIds().size > 0;
}

export function addActiveDmCallPeer(peerId: string): void {
  if (!peerId) return;
  const now = Date.now();
  const peers = readStoredPeers().filter((p) => p.peerId !== peerId);
  peers.push({ peerId, updatedAt: now });
  writeStoredPeers(peers);
}

export function removeActiveDmCallPeer(peerId: string): void {
  if (!peerId) return;
  const peers = readStoredPeers().filter((p) => p.peerId !== peerId);
  writeStoredPeers(peers);
}

export function clearActiveDmCallPeers(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function touchActiveDmCallPeer(peerId: string): void {
  addActiveDmCallPeer(peerId);
}
