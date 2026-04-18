/**
 * Tùy chọn sidebar (tắt âm, thông báo, thu gọn danh mục) — lưu localStorage theo user + server.
 */

export type NotifyLevel = "all" | "mentions" | "none";
export type ChannelNotifyMode = "inherit_category" | NotifyLevel;
export type CategoryNotifyMode = "inherit_server" | NotifyLevel;

const STORAGE_KEY = "cordigram_sidebar_prefs_v1";

export type ChannelPref = {
  mutedUntil?: string | null;
  mutedForever?: boolean;
  notify?: ChannelNotifyMode;
};

export type CategoryPref = {
  mutedUntil?: string | null;
  mutedForever?: boolean;
  notify?: CategoryNotifyMode;
  /** Bật icon mũi tên thu gọn trên header */
  collapseUiEnabled?: boolean;
  /** Danh sách kênh đang thu gọn */
  collapsed?: boolean;
};

export type ServerSidebarPrefs = {
  serverNotify?: NotifyLevel;
  serverMutedUntil?: string | null;
  serverMutedForever?: boolean;
  /** Bỏ qua thông báo (âm thanh) khi tin chỉ gắn @everyone / @here — lưu localStorage. */
  suppressEveryoneHere?: boolean;
  /** Bỏ qua thông báo khi chỉ bị gắn theo @vai trò — lưu localStorage. */
  suppressRoleMentions?: boolean;
  /** Ẩn các kênh đang tắt âm trên sidebar — lưu localStorage theo máy chủ. */
  hideMutedChannels?: boolean;
  channels: Record<string, ChannelPref>;
  categories: Record<string, CategoryPref>;
  /** Đã bật chế độ thu gọn cho mọi danh mục (menu "Thu gọn tất cả") */
  collapseAllApplied?: boolean;
};

type RootPrefs = {
  byUser: Record<string, Record<string, ServerSidebarPrefs>>;
};

function emptyServer(): ServerSidebarPrefs {
  return { channels: {}, categories: {} };
}

export function loadRootPrefs(): RootPrefs {
  if (typeof window === "undefined") return { byUser: {} };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { byUser: {} };
    const p = JSON.parse(raw) as RootPrefs;
    if (!p?.byUser || typeof p.byUser !== "object") return { byUser: {} };
    return p;
  } catch {
    return { byUser: {} };
  }
}

function saveRootPrefs(root: RootPrefs) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(root));
  } catch {
    /* ignore quota */
  }
}

export function getServerPrefs(userId: string, serverId: string): ServerSidebarPrefs {
  const root = loadRootPrefs();
  return root.byUser[userId]?.[serverId] ?? emptyServer();
}

export function setServerNotify(userId: string, serverId: string, level: NotifyLevel) {
  updateServerPrefs(userId, serverId, (s) => ({ ...s, serverNotify: level }));
}

export function setServerSuppressFlags(
  userId: string,
  serverId: string,
  patch: { suppressEveryoneHere?: boolean; suppressRoleMentions?: boolean },
) {
  updateServerPrefs(userId, serverId, (s) => ({ ...s, ...patch }));
}

export function setServerHideMutedChannels(userId: string, serverId: string, hide: boolean) {
  updateServerPrefs(userId, serverId, (s) => ({ ...s, hideMutedChannels: hide }));
}

/** Mức thông báo hiệu lực cho một kênh (kế thừa category → server). */
export function getEffectiveNotifyLevel(
  sp: ServerSidebarPrefs,
  channelId: string,
  categoryId: string | null | undefined,
): NotifyLevel {
  const ch = sp.channels[channelId];
  const cn = ch?.notify;
  if (cn && cn !== "inherit_category") return cn;
  const cat = categoryId ? sp.categories[categoryId] : undefined;
  const catn = cat?.notify;
  if (catn && catn !== "inherit_server") return catn;
  return sp.serverNotify ?? "all";
}

/** Kênh hoặc danh mục chứa kênh đang tắt âm. */
export function isChannelOrCategoryMuted(
  sp: ServerSidebarPrefs,
  channelId: string,
  categoryId: string | null | undefined,
): boolean {
  if (isChannelMuted(sp.channels[channelId])) return true;
  if (categoryId && isCategoryMuted(sp.categories[categoryId])) return true;
  return false;
}

export function setServerMute(
  userId: string,
  serverId: string,
  mutedUntil: string | null,
  mutedForever: boolean,
) {
  updateServerPrefs(userId, serverId, (s) => ({
    ...s,
    serverMutedUntil: mutedUntil,
    serverMutedForever: mutedForever,
  }));
}

export function clearServerMute(userId: string, serverId: string) {
  updateServerPrefs(userId, serverId, (s) => ({
    ...s,
    serverMutedUntil: null,
    serverMutedForever: false,
  }));
}

export function updateServerPrefs(
  userId: string,
  serverId: string,
  updater: (prev: ServerSidebarPrefs) => ServerSidebarPrefs,
) {
  const root = loadRootPrefs();
  if (!root.byUser[userId]) root.byUser[userId] = {};
  const prev = root.byUser[userId][serverId] ?? emptyServer();
  root.byUser[userId][serverId] = updater(prev);
  saveRootPrefs(root);
}

export function setChannelMute(
  userId: string,
  serverId: string,
  channelId: string,
  mutedUntil: string | null,
  mutedForever: boolean,
) {
  updateServerPrefs(userId, serverId, (s) => ({
    ...s,
    channels: {
      ...s.channels,
      [channelId]: {
        ...s.channels[channelId],
        mutedUntil,
        mutedForever,
      },
    },
  }));
}

export function clearChannelMute(userId: string, serverId: string, channelId: string) {
  updateServerPrefs(userId, serverId, (s) => ({
    ...s,
    channels: {
      ...s.channels,
      [channelId]: {
        ...s.channels[channelId],
        mutedUntil: null,
        mutedForever: false,
      },
    },
  }));
}

export function setChannelNotify(
  userId: string,
  serverId: string,
  channelId: string,
  notify: ChannelNotifyMode,
) {
  updateServerPrefs(userId, serverId, (s) => ({
    ...s,
    channels: {
      ...s.channels,
      [channelId]: { ...s.channels[channelId], notify },
    },
  }));
}

export function setCategoryMute(
  userId: string,
  serverId: string,
  categoryId: string,
  mutedUntil: string | null,
  mutedForever: boolean,
) {
  updateServerPrefs(userId, serverId, (s) => ({
    ...s,
    categories: {
      ...s.categories,
      [categoryId]: {
        ...s.categories[categoryId],
        mutedUntil,
        mutedForever,
      },
    },
  }));
}

export function clearCategoryMute(userId: string, serverId: string, categoryId: string) {
  updateServerPrefs(userId, serverId, (s) => ({
    ...s,
    categories: {
      ...s.categories,
      [categoryId]: {
        ...s.categories[categoryId],
        mutedUntil: null,
        mutedForever: false,
      },
    },
  }));
}

export function setCategoryNotify(
  userId: string,
  serverId: string,
  categoryId: string,
  notify: CategoryNotifyMode,
) {
  updateServerPrefs(userId, serverId, (s) => ({
    ...s,
    categories: {
      ...s.categories,
      [categoryId]: { ...s.categories[categoryId], notify },
    },
  }));
}

export function setCategoryCollapseUi(
  userId: string,
  serverId: string,
  categoryId: string,
  enabled: boolean,
) {
  updateServerPrefs(userId, serverId, (s) => ({
    ...s,
    categories: {
      ...s.categories,
      [categoryId]: {
        ...s.categories[categoryId],
        collapseUiEnabled: enabled,
        collapsed: enabled ? s.categories[categoryId]?.collapsed ?? false : false,
      },
    },
  }));
}

export function setCategoryCollapsed(
  userId: string,
  serverId: string,
  categoryId: string,
  collapsed: boolean,
) {
  updateServerPrefs(userId, serverId, (s) => ({
    ...s,
    categories: {
      ...s.categories,
      [categoryId]: {
        ...s.categories[categoryId],
        collapsed,
      },
    },
  }));
}

export function collapseAllCategories(
  userId: string,
  serverId: string,
  categoryIds: string[],
) {
  updateServerPrefs(userId, serverId, (s) => {
    const categories = { ...s.categories };
    for (const id of categoryIds) {
      categories[id] = {
        ...categories[id],
        collapseUiEnabled: true,
        collapsed: true,
      };
    }
    return { ...s, categories, collapseAllApplied: true };
  });
}

export function isChannelMuted(pref?: ChannelPref | null): boolean {
  if (!pref) return false;
  if (pref.mutedForever) return true;
  if (pref.mutedUntil) {
    const t = new Date(pref.mutedUntil).getTime();
    if (!Number.isNaN(t) && t > Date.now()) return true;
  }
  return false;
}

export function isCategoryMuted(pref?: CategoryPref | null): boolean {
  if (!pref) return false;
  if (pref.mutedForever) return true;
  if (pref.mutedUntil) {
    const t = new Date(pref.mutedUntil).getTime();
    if (!Number.isNaN(t) && t > Date.now()) return true;
  }
  return false;
}

export function isServerMuted(pref?: ServerSidebarPrefs | null): boolean {
  if (!pref) return false;
  if (pref.serverMutedForever) return true;
  if (pref.serverMutedUntil) {
    const t = new Date(pref.serverMutedUntil).getTime();
    if (!Number.isNaN(t) && t > Date.now()) return true;
  }
  return false;
}

export function notifyLabelChannel(
  mode: ChannelNotifyMode | undefined,
  categoryNotify: CategoryNotifyMode | undefined,
  serverNotify: NotifyLevel | undefined,
): string {
  const m = mode ?? "inherit_category";
  if (m === "inherit_category") {
    return notifyLabelCategory(categoryNotify, serverNotify);
  }
  if (m === "all") return "Tất cả các tin nhắn";
  if (m === "mentions") return "Chỉ @mentions";
  return "Không có";
}

export function notifyLabelCategory(
  mode: CategoryNotifyMode | undefined,
  serverNotify: NotifyLevel | undefined,
): string {
  const m = mode ?? "inherit_server";
  if (m === "inherit_server") {
    const s = serverNotify ?? "all";
    if (s === "all") return "Tất cả các tin nhắn";
    if (s === "mentions") return "Chỉ @mentions";
    return "Không có";
  }
  if (m === "all") return "Tất cả các tin nhắn";
  if (m === "mentions") return "Chỉ @mentions";
  return "Không có";
}

export function muteKeyToUntil(
  key: "15m" | "1h" | "3h" | "8h" | "24h" | "until",
): { mutedUntil: string | null; mutedForever: boolean } {
  if (key === "until") return { mutedUntil: null, mutedForever: true };
  const min =
    key === "15m"
      ? 15
      : key === "1h"
        ? 60
        : key === "3h"
          ? 180
          : key === "8h"
            ? 480
            : 1440;
  const d = new Date(Date.now() + min * 60 * 1000);
  return { mutedUntil: d.toISOString(), mutedForever: false };
}
