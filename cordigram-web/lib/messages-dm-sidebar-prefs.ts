const KEY = "cordigramDmSidebarPeers";

export type DmSidebarPeersMode = "all" | "online";

export function getDmSidebarPeersMode(): DmSidebarPeersMode {
  if (typeof window === "undefined") return "all";
  const v = window.localStorage.getItem(KEY);
  return v === "online" ? "online" : "all";
}

export function setDmSidebarPeersMode(mode: DmSidebarPeersMode): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, mode);
  window.dispatchEvent(new Event("cordigram-dm-sidebar-prefs"));
}
