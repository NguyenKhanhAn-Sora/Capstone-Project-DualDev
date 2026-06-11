const STORAGE_KEY = "cordigram-dm-active-call-peers";

function readPeerIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === "string"));
  } catch {
    return new Set();
  }
}

function writePeerIds(peers: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...peers]));
  } catch {
    // ignore quota / private mode
  }
}

export function getActiveDmCallPeerIds(): string[] {
  return [...readPeerIds()];
}

export function isInActiveDmCall(): boolean {
  return readPeerIds().size > 0;
}

export function addActiveDmCallPeer(peerId: string): void {
  if (!peerId) return;
  const peers = readPeerIds();
  peers.add(peerId);
  writePeerIds(peers);
}

export function removeActiveDmCallPeer(peerId: string): void {
  if (!peerId) return;
  const peers = readPeerIds();
  peers.delete(peerId);
  writePeerIds(peers);
}

export function clearActiveDmCallPeers(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
