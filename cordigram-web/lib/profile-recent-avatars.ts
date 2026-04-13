const STORAGE_KEY = "cordigramProfileRecentAvatars";
const MAX = 6;

export function getRecentProfileAvatars(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x): x is string => typeof x === "string" && /^https?:\/\//i.test(x))
      .slice(0, MAX);
  } catch {
    return [];
  }
}

export function pushRecentProfileAvatar(url: string): void {
  const u = url.trim();
  if (!u || !/^https?:\/\//i.test(u)) return;
  if (typeof window === "undefined") return;
  try {
    const prev = getRecentProfileAvatars().filter((x) => x !== u);
    const next = [u, ...prev].slice(0, MAX);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}
