"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import { Categories, Theme } from "emoji-picker-react";
import { useLanguage } from "@/component/language-provider";
import styles from "./GiphyPicker.module.css";
import {
  searchGifs,
  getTrendingGifs,
  searchStickers,
  getTrendingStickers,
  type GiphyGif,
} from "@/lib/giphy-api";
import {
  getStickerPickerData,
  getEmojiPickerData,
  adminGetStickerPickerData,
  adminGetEmojiPickerData,
  type StickerPickerGroup,
  type StickerPickerSticker,
  type EmojiPickerGroup,
  type EmojiPickerEmoji,
} from "@/lib/servers-api";

function EmojiPickerMartLoading() {
  const { t } = useLanguage();
  return (
    <div className={styles.emojiPickerLoading}>{t("chat.mediaPicker.emojiMartLoading")}</div>
  );
}

const EmojiPicker = dynamic(() => import("emoji-picker-react"), {
  ssr: false,
  loading: EmojiPickerMartLoading,
});

const STICKER_FREQ_KEY = "cordigram_sticker_freq_v1";
const EMOJI_FREQ_KEY = "cordigram_emoji_freq_v1";
const GIF_FREQ_KEY = "cordigram_gif_freq_v1";

export type MediaPickerTab = "gif" | "sticker" | "emoji" | "kaomoji";

export type GiphyPickerSelection =
  | { source: "giphy"; gif: GiphyGif; mediaType: "gif" | "sticker" }
  | {
      source: "server";
      serverId: string;
      serverName: string;
      serverAvatarUrl: string | null;
      stickerId: string;
      imageUrl: string;
      name: string;
      /** GIF sticker từ máy chủ */
      animated?: boolean;
      addedBy: {
        displayName: string;
        username: string;
        avatarUrl: string;
      };
    }
  | { source: "unicode"; emoji: string }
  | { source: "kaomoji"; text: string }
  | {
      source: "serverEmoji";
      serverId: string;
      serverName: string;
      serverAvatarUrl: string | null;
      emojiId: string;
      imageUrl: string;
      name: string;
      addedBy: {
        displayName: string;
        username: string;
        avatarUrl: string;
      };
    };

type FreqStored = {
  n: number;
  type: "giphy" | "server";
  gifId?: string;
  title?: string;
  thumb?: string;
  serverId?: string;
  serverName?: string;
  serverAvatarUrl?: string | null;
  stickerId?: string;
  imageUrl?: string;
  name?: string;
  addedByDisplayName?: string;
  addedByUsername?: string;
  addedByAvatarUrl?: string;
  animated?: boolean;
};

type EmojiFreqStored = {
  n: number;
  type: "unicode" | "server";
  char?: string;
  serverId?: string;
  serverName?: string;
  serverAvatarUrl?: string | null;
  emojiId?: string;
  imageUrl?: string;
  name?: string;
  addedByDisplayName?: string;
  addedByUsername?: string;
  addedByAvatarUrl?: string;
};

type GifFreqStored = { n: number; id: string; title: string; thumb: string };

function readJsonMap<T>(key: string): Record<string, T> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return {};
    const p = JSON.parse(raw) as Record<string, T>;
    return p && typeof p === "object" ? p : {};
  } catch {
    return {};
  }
}

function writeJsonMap(key: string, m: Record<string, unknown>) {
  try {
    window.localStorage.setItem(key, JSON.stringify(m));
  } catch {
    /* ignore */
  }
}

function bumpStickerUsage(entry: FreqStored) {
  const key =
    entry.type === "giphy"
      ? `g:${entry.gifId}`
      : `s:${entry.serverId}:${entry.stickerId}`;
  const map = readJsonMap<FreqStored>(STICKER_FREQ_KEY);
  const prev = map[key];
  map[key] = { ...entry, n: (prev?.n ?? 0) + 1 };
  writeJsonMap(STICKER_FREQ_KEY, map);
}

function bumpEmojiFreq(entry: EmojiFreqStored) {
  const key =
    entry.type === "unicode"
      ? `u:${entry.char}`
      : `s:${entry.serverId}:${entry.emojiId}`;
  const map = readJsonMap<EmojiFreqStored>(EMOJI_FREQ_KEY);
  const prev = map[key];
  map[key] = { ...entry, n: (prev?.n ?? 0) + 1 };
  writeJsonMap(EMOJI_FREQ_KEY, map);
}

function bumpGifFreq(entry: GifFreqStored) {
  const map = readJsonMap<GifFreqStored>(GIF_FREQ_KEY);
  const prev = map[entry.id];
  map[entry.id] = { ...entry, n: (prev?.n ?? 0) + 1 };
  writeJsonMap(GIF_FREQ_KEY, map);
}

function buildFavoriteGifs(): GiphyGif[] {
  const map = readJsonMap<GifFreqStored>(GIF_FREQ_KEY);
  return Object.entries(map)
    .map(([, v]) => v)
    .filter((e) => e.n > 0 && e.id && e.thumb)
    .sort((a, b) => b.n - a.n)
    .slice(0, 24)
    .map((e) => {
      const thumb = e.thumb;
      return {
        id: e.id,
        title: e.title || "",
        images: {
          fixed_height: { url: thumb, width: "200", height: "200" },
          fixed_height_small: { url: thumb, width: "100", height: "100" },
          original: { url: thumb, width: "200", height: "200" },
          downsized: { url: thumb, width: "200", height: "200" },
        },
        url: "",
      } as GiphyGif;
    });
}

type HoverFooterState =
  | {
      kind: "server";
      imageUrl: string;
      label: string;
      serverName: string;
      serverAvatarUrl: string | null;
      addedByDisplayName: string;
      addedByAvatarUrl: string;
    }
  | null;

export type OwnedServerSummary = {
  id: string;
  name: string;
  avatarUrl?: string | null;
};

interface GiphyPickerProps {
  onSelect: (selection: GiphyPickerSelection) => void;
  onClose: () => void;
  initialTab?: MediaPickerTab;
  contextServerId?: string | null;
  /** Máy chủ do tài khoản hiện tại sở hữu — để hiện mục riêng + trạng thái trống. */
  ownedServers?: OwnedServerSummary[];
  /** Mở cài đặt máy chủ (tab Sticker). */
  onManageServerStickers?: (serverId: string) => void;
  /** Mở cài đặt máy chủ (tab Emoji). */
  onManageServerEmojis?: (serverId: string) => void;
  /** @deprecated dùng enableServerMedia */
  enableServerStickers?: boolean;
  enableServerMedia?: boolean;
  /**
   * Chế độ admin xem server: tải emoji/sticker qua endpoint admin (JWT admin),
   * không dùng danh sách server theo membership.
   */
  adminMediaPicker?: boolean;
}

export default function GiphyPicker({
  onSelect,
  onClose,
  initialTab = "gif",
  contextServerId = null,
  ownedServers = [],
  onManageServerStickers,
  onManageServerEmojis,
  enableServerStickers,
  enableServerMedia,
  adminMediaPicker = false,
}: GiphyPickerProps) {
  const { t } = useLanguage();
  const serverMediaOn =
    enableServerMedia ?? enableServerStickers ?? true;

  const gifTiles = useMemo(
    () =>
      [
        {
          token: "favorites",
          label: t("chat.mediaPicker.gifCatFavorites"),
          hint: t("chat.mediaPicker.gifCatFavoritesHint"),
        },
        {
          token: "trending",
          label: t("chat.mediaPicker.gifCatTrending"),
          hint: t("chat.mediaPicker.gifCatTrendingHint"),
        },
        { token: "love", label: t("chat.mediaPicker.gifCatLove"), hint: "" },
        { token: "happy", label: t("chat.mediaPicker.gifCatHappy"), hint: "" },
        { token: "cry", label: t("chat.mediaPicker.gifCatCry"), hint: "" },
        {
          token: "thumbs up",
          label: t("chat.mediaPicker.gifCatThumbs"),
          hint: "",
        },
      ] as { token: string; label: string; hint: string }[],
    [t],
  );

  const kaomojiCategories = useMemo(
    () => [
      {
        label: t("chat.mediaPicker.kaomojiHappy"),
        items: ["(ﾉ◕ヮ◕)ﾉ*:･ﾟ✧", "(*^▽^*)", "(≧◡≦)", "ヽ(•‿•)ﾉ", "(*≧▽≦)"],
      },
      {
        label: t("chat.mediaPicker.kaomojiLove"),
        items: ["(♡˙︶˙♡)", "(ˆ ³ˆ)♥", "( ˘ ³˘)♥", "(｡♥‿♥｡)", "(づ｡◕‿‿◕｡)づ"],
      },
      {
        label: t("chat.mediaPicker.kaomojiSad"),
        items: ["(╥_╥)", "(T_T)", "ಥ_ಥ", "(｡•́︿•̀｡)", "(╯︵╰,)"],
      },
      {
        label: t("chat.mediaPicker.kaomojiFunny"),
        items: ["( ͡° ͜ʖ ͡°)", "¯\\_(ツ)_/¯", "ʕ•ᴥ•ʔ", "(งʼ̀-ʼ́)ง"],
      },
      {
        label: t("chat.mediaPicker.kaomojiGreet"),
        items: ["( ´ ▽ ` )ﾉ", "(*ﾟ▽ﾟ*)/", "ヾ(^∇^)", "o(^▽^)o"],
      },
    ],
    [t],
  );

  const emojiRailCategories = useMemo(
    () =>
      [
        {
          category: Categories.SMILEYS_PEOPLE,
          icon: "😀",
          title: t("chat.mediaPicker.railSmileys"),
        },
        {
          category: Categories.ANIMALS_NATURE,
          icon: "🐻",
          title: t("chat.mediaPicker.railNature"),
        },
        {
          category: Categories.FOOD_DRINK,
          icon: "🍕",
          title: t("chat.mediaPicker.railFood"),
        },
        {
          category: Categories.ACTIVITIES,
          icon: "⚽",
          title: t("chat.mediaPicker.railActivities"),
        },
        {
          category: Categories.TRAVEL_PLACES,
          icon: "🚗",
          title: t("chat.mediaPicker.railTravel"),
        },
        {
          category: Categories.OBJECTS,
          icon: "💡",
          title: t("chat.mediaPicker.railObjects"),
        },
        {
          category: Categories.SYMBOLS,
          icon: "❤️",
          title: t("chat.mediaPicker.railSymbols"),
        },
      ] as { category: Categories; icon: string; title: string }[],
    [t],
  );

  const emojiMartCategoryNames = useMemo(
    () => [
      { category: Categories.SUGGESTED, name: t("chat.mediaPicker.eprSuggested") },
      {
        category: Categories.SMILEYS_PEOPLE,
        name: t("chat.mediaPicker.railSmileys"),
      },
      {
        category: Categories.ANIMALS_NATURE,
        name: t("chat.mediaPicker.railNature"),
      },
      { category: Categories.FOOD_DRINK, name: t("chat.mediaPicker.railFood") },
      {
        category: Categories.ACTIVITIES,
        name: t("chat.mediaPicker.railActivities"),
      },
      {
        category: Categories.TRAVEL_PLACES,
        name: t("chat.mediaPicker.railTravel"),
      },
      { category: Categories.OBJECTS, name: t("chat.mediaPicker.railObjects") },
      { category: Categories.SYMBOLS, name: t("chat.mediaPicker.railSymbols") },
      { category: Categories.FLAGS, name: t("chat.mediaPicker.railFlags") },
    ],
    [t],
  );

  const [activeTab, setActiveTab] = useState<MediaPickerTab>(initialTab);
  const [searchQuery, setSearchQuery] = useState("");
  const [gifs, setGifs] = useState<GiphyGif[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stickerGroups, setStickerGroups] = useState<StickerPickerGroup[]>([]);
  const [emojiGroups, setEmojiGroups] = useState<EmojiPickerGroup[]>([]);
  const [stickerPickerLoading, setStickerPickerLoading] = useState(false);
  const [emojiPickerLoading, setEmojiPickerLoading] = useState(false);
  const [stickerPickerError, setStickerPickerError] = useState<string | null>(
    null,
  );
  const [emojiPickerError, setEmojiPickerError] = useState<string | null>(null);
  const [freqTick, setFreqTick] = useState(0);
  const [hoverFooter, setHoverFooter] = useState<HoverFooterState>(null);
  const [gifSubView, setGifSubView] = useState<"categories" | "results">(
    "categories",
  );
  const [gifBrowseToken, setGifBrowseToken] = useState<string | null>(null);
  const [activeRailId, setActiveRailId] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const emojiMartHostRef = useRef<HTMLDivElement>(null);

  const searching = searchQuery.trim().length > 0;

  const ownedIdSet = useMemo(
    () => new Set(ownedServers.map((s) => String(s.id))),
    [ownedServers],
  );

  const stickerGroupById = useMemo(() => {
    const m = new Map<string, StickerPickerGroup>();
    for (const g of stickerGroups) m.set(String(g.serverId), g);
    return m;
  }, [stickerGroups]);

  const emojiGroupById = useMemo(() => {
    const m = new Map<string, EmojiPickerGroup>();
    for (const g of emojiGroups) m.set(String(g.serverId), g);
    return m;
  }, [emojiGroups]);

  const ownedStickerRows = useMemo(
    () =>
      ownedServers.map((os) => ({
        ...os,
        id: String(os.id),
        group: stickerGroupById.get(String(os.id)) ?? null,
      })),
    [ownedServers, stickerGroupById],
  );

  const otherStickerGroups = useMemo(
    () => stickerGroups.filter((g) => !ownedIdSet.has(String(g.serverId))),
    [stickerGroups, ownedIdSet],
  );

  const ownedEmojiRows = useMemo(
    () =>
      ownedServers.map((os) => ({
        ...os,
        id: String(os.id),
        group: emojiGroupById.get(String(os.id)) ?? null,
      })),
    [ownedServers, emojiGroupById],
  );

  const otherEmojiGroups = useMemo(
    () => emojiGroups.filter((g) => !ownedIdSet.has(String(g.serverId))),
    [emojiGroups, ownedIdSet],
  );

  const canShowEmojiManageBtn =
    !!contextServerId &&
    ownedIdSet.has(String(contextServerId)) &&
    !!onManageServerEmojis;

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const scrollToSection = (id: string) => {
    setActiveRailId(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const scrollToEmojiCategory = (categoryKey: string) => {
    setActiveRailId(`emoji-cat-${categoryKey}`);
    const host = emojiMartHostRef.current;
    if (!host) return;
    const li = host.querySelector(
      `li[data-name="${categoryKey}"]`,
    ) as HTMLElement | null;
    li?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const loadStickerTrending = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await getTrendingStickers(30);
      setGifs(r.data);
    } catch (err) {
      console.error(err);
      setError(t("chat.mediaPicker.errTrendingStickers"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (activeTab !== "sticker") return;
    if (searching) return;
    loadStickerTrending();
  }, [activeTab, searching, loadStickerTrending]);

  useEffect(() => {
    if (activeTab !== "sticker" || !serverMediaOn) {
      setStickerGroups([]);
      setStickerPickerError(null);
      return;
    }
    let c = false;
    setStickerPickerLoading(true);
    setStickerPickerError(null);
    const sid = contextServerId || "";
    const adminTok =
      typeof window !== "undefined"
        ? localStorage.getItem("accessToken") || localStorage.getItem("token") || ""
        : "";
    const req =
      adminMediaPicker && sid && adminTok
        ? adminGetStickerPickerData(sid, adminTok)
        : getStickerPickerData(contextServerId || undefined);
    req
      .then((d) => {
        if (!c) setStickerGroups(d.groups || []);
      })
      .catch((e) => {
        console.error(e);
        if (!c) setStickerPickerError(t("chat.mediaPicker.errServerStickers"));
      })
      .finally(() => {
        if (!c) setStickerPickerLoading(false);
      });
    return () => {
      c = true;
    };
  }, [activeTab, serverMediaOn, contextServerId, adminMediaPicker, t]);

  useEffect(() => {
    if (activeTab !== "emoji" || !serverMediaOn) {
      setEmojiGroups([]);
      setEmojiPickerError(null);
      return;
    }
    let c = false;
    setEmojiPickerLoading(true);
    setEmojiPickerError(null);
    const sid = contextServerId || "";
    const adminTok =
      typeof window !== "undefined"
        ? localStorage.getItem("accessToken") || localStorage.getItem("token") || ""
        : "";
    const req =
      adminMediaPicker && sid && adminTok
        ? adminGetEmojiPickerData(sid, adminTok)
        : getEmojiPickerData(contextServerId || undefined);
    req
      .then((d) => {
        if (!c) setEmojiGroups(d.groups || []);
      })
      .catch((e) => {
        console.error(e);
        if (!c) setEmojiPickerError(t("chat.mediaPicker.errServerEmoji"));
      })
      .finally(() => {
        if (!c) setEmojiPickerLoading(false);
      });
    return () => {
      c = true;
    };
  }, [activeTab, serverMediaOn, contextServerId, adminMediaPicker, t]);

  useEffect(() => {
    if (activeTab !== "gif") return;
    if (searching) return;
    if (gifSubView !== "results" || !gifBrowseToken) {
      setGifs([]);
      setLoading(false);
      return;
    }
    let c = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        let data: GiphyGif[] = [];
        if (gifBrowseToken === "trending") {
          const r = await getTrendingGifs(30);
          data = r.data;
        } else if (gifBrowseToken === "favorites") {
          data = buildFavoriteGifs();
        } else {
          const r = await searchGifs(gifBrowseToken, 30);
          data = r.data;
        }
        if (!c) setGifs(data);
      } catch (err) {
        console.error(err);
        if (!c) setError(t("chat.mediaPicker.errLoadGif"));
      } finally {
        if (!c) setLoading(false);
      }
    })();
    return () => {
      c = true;
    };
  }, [activeTab, searching, gifSubView, gifBrowseToken, t]);

  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      if (activeTab === "gif") {
        if (!searchQuery.trim()) {
          setGifSubView("categories");
          setGifBrowseToken(null);
          setGifs([]);
          setLoading(false);
          setError(null);
          return;
        }
        setGifSubView("results");
        setLoading(true);
        setError(null);
        searchGifs(searchQuery.trim(), 30)
          .then((r) => setGifs(r.data))
          .catch(() => setError(t("chat.mediaPicker.errSearch")))
          .finally(() => setLoading(false));
        return;
      }
      if (activeTab === "sticker") {
        if (!searchQuery.trim()) {
          loadStickerTrending();
          return;
        }
        setLoading(true);
        setError(null);
        searchStickers(searchQuery.trim(), 30)
          .then((r) => setGifs(r.data))
          .catch(() => setError(t("chat.mediaPicker.errSearch")))
          .finally(() => setLoading(false));
      }
    }, 500);
    return () => clearTimeout(debounceTimer);
  }, [searchQuery, activeTab, loadStickerTrending, t]);

  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node))
        onClose();
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);

  const handleTabChange = (tab: MediaPickerTab) => {
    setActiveTab(tab);
    setSearchQuery("");
    setHoverFooter(null);
    setError(null);
    setGifs([]);
    setGifSubView("categories");
    setGifBrowseToken(null);
    setActiveRailId(null);
  };

  const handleGiphyClick = (gif: GiphyGif, media: "gif" | "sticker") => {
    if (media === "gif") {
      const thumb =
        gif.images?.fixed_height_small?.url || gif.images?.downsized?.url || "";
      bumpGifFreq({
        n: 0,
        id: gif.id,
        title: gif.title || "",
        thumb,
      });
    }
    if (media === "sticker") {
      bumpStickerUsage({
        n: 0,
        type: "giphy",
        gifId: gif.id,
        title: gif.title || "",
        thumb:
          gif.images?.fixed_height_small?.url || gif.images?.downsized?.url,
      });
      setFreqTick((x) => x + 1);
    }
    onSelect({ source: "giphy", gif, mediaType: media });
    onClose();
  };

  const handleServerStickerClick = (
    group: StickerPickerGroup,
    st: StickerPickerSticker,
  ) => {
    if (group.locked) return;
    bumpStickerUsage({
      n: 0,
      type: "server",
      serverId: group.serverId,
      serverName: group.serverName,
      serverAvatarUrl: group.serverAvatarUrl,
      stickerId: st.id,
      imageUrl: st.imageUrl,
      name: st.name || "",
      addedByDisplayName: st.addedBy.displayName,
      addedByUsername: st.addedBy.username,
      addedByAvatarUrl: st.addedBy.avatarUrl,
      animated: st.animated === true,
    });
    setFreqTick((x) => x + 1);
    onSelect({
      source: "server",
      serverId: group.serverId,
      serverName: group.serverName,
      serverAvatarUrl: group.serverAvatarUrl,
      stickerId: st.id,
      imageUrl: st.imageUrl,
      name: st.name || "",
      animated: st.animated === true,
      addedBy: st.addedBy,
    });
    onClose();
  };

  const handleServerEmojiClick = (group: EmojiPickerGroup, em: EmojiPickerEmoji) => {
    if (group.locked) return;
    const safeName = (em.name || "emoji").replace(/[^a-zA-Z0-9_]/g, "") || "emoji";
    bumpEmojiFreq({
      n: 0,
      type: "server",
      serverId: group.serverId,
      serverName: group.serverName,
      serverAvatarUrl: group.serverAvatarUrl,
      emojiId: em.id,
      imageUrl: em.imageUrl,
      name: safeName,
      addedByDisplayName: em.addedBy.displayName,
      addedByUsername: em.addedBy.username,
      addedByAvatarUrl: em.addedBy.avatarUrl,
    });
    setFreqTick((x) => x + 1);
    onSelect({
      source: "serverEmoji",
      serverId: group.serverId,
      serverName: group.serverName,
      serverAvatarUrl: group.serverAvatarUrl,
      emojiId: em.id,
      imageUrl: em.imageUrl,
      name: safeName,
      addedBy: em.addedBy,
    });
    onClose();
  };

  const freqStickerList = (() => {
    if (activeTab !== "sticker" || searching) return [];
    const map = readJsonMap<FreqStored>(STICKER_FREQ_KEY);
    return Object.entries(map)
      .map(([k, v]) => ({ k, ...v }))
      .filter((e) => e.n > 0)
      .sort((a, b) => b.n - a.n)
      .slice(0, 14);
  })();

  const freqEmojiList = (() => {
    if (activeTab !== "emoji" || searching) return [];
    const map = readJsonMap<EmojiFreqStored>(EMOJI_FREQ_KEY);
    return Object.entries(map)
      .map(([k, v]) => ({ k, ...v }))
      .filter((e) => e.n > 0)
      .sort((a, b) => b.n - a.n)
      .slice(0, 18);
  })();

  const renderFreqStickerTile = (e: FreqStored & { k: string }) => {
    if (e.type === "giphy" && e.gifId && e.thumb) {
      const thumb = e.thumb;
      const minimalGif: GiphyGif = {
        id: e.gifId,
        title: e.title || "",
        images: {
          fixed_height: { url: thumb, width: "200", height: "200" },
          fixed_height_small: { url: thumb, width: "100", height: "100" },
          original: { url: thumb, width: "200", height: "200" },
          downsized: { url: thumb, width: "200", height: "200" },
        },
        url: "",
      };
      return (
        <button
          key={e.k}
          type="button"
          className={styles.freqItem}
          onClick={() => handleGiphyClick(minimalGif, "sticker")}
        >
          <img src={thumb} alt="" loading="lazy" />
        </button>
      );
    }
    if (
      e.type === "server" &&
      e.serverId &&
      e.stickerId &&
      e.imageUrl &&
      e.serverName
    ) {
      const group: StickerPickerGroup = {
        serverId: e.serverId,
        serverName: e.serverName,
        serverAvatarUrl: e.serverAvatarUrl ?? null,
        locked:
          !!contextServerId && String(e.serverId) !== String(contextServerId),
        stickers: [],
      };
      const st: StickerPickerSticker = {
        id: e.stickerId,
        imageUrl: e.imageUrl,
        name: e.name || "",
        animated: e.animated === true,
        addedBy: {
          displayName: e.addedByDisplayName || "",
          username: e.addedByUsername || "",
          avatarUrl: e.addedByAvatarUrl || "",
        },
      };
      const locked = group.locked;
      return (
        <div key={e.k} className={styles.freqItemWrap}>
          <button
            type="button"
            className={`${styles.freqItem} ${locked ? styles.freqItemLocked : ""}`}
            aria-disabled={locked}
            onClick={() => !locked && handleServerStickerClick(group, st)}
            onMouseEnter={() =>
              setHoverFooter({
                kind: "server",
                imageUrl: st.imageUrl,
                label: st.name ? `:${st.name}:` : ":sticker:",
                serverName: group.serverName,
                serverAvatarUrl: group.serverAvatarUrl,
                addedByDisplayName:
                  st.addedBy.displayName ||
                  st.addedBy.username ||
                  t("chat.mediaPicker.memberFallback"),
                addedByAvatarUrl: st.addedBy.avatarUrl || "",
              })
            }
            onMouseLeave={() => setHoverFooter(null)}
          >
            <img src={st.imageUrl} alt="" loading="lazy" />
            {locked ? <span className={styles.smallLock}>🔒</span> : null}
          </button>
        </div>
      );
    }
    return null;
  };

  const renderFreqEmojiTile = (e: EmojiFreqStored & { k: string }) => {
    if (e.type === "unicode" && e.char) {
      return (
        <button
          key={e.k}
          type="button"
          className={styles.emojiFreqCell}
          onClick={() => {
            bumpEmojiFreq({ n: 0, type: "unicode", char: e.char });
            setFreqTick((x) => x + 1);
            onSelect({ source: "unicode", emoji: e.char! });
            onClose();
          }}
        >
          {e.char}
        </button>
      );
    }
    if (
      e.type === "server" &&
      e.serverId &&
      e.emojiId &&
      e.imageUrl &&
      e.serverName
    ) {
      const group: EmojiPickerGroup = {
        serverId: e.serverId,
        serverName: e.serverName,
        serverAvatarUrl: e.serverAvatarUrl ?? null,
        locked:
          !!contextServerId && String(e.serverId) !== String(contextServerId),
        emojis: [],
      };
      const em: EmojiPickerEmoji = {
        id: e.emojiId,
        imageUrl: e.imageUrl,
        name: e.name || "",
        addedBy: {
          displayName: e.addedByDisplayName || "",
          username: e.addedByUsername || "",
          avatarUrl: e.addedByAvatarUrl || "",
        },
      };
      const locked = group.locked;
      return (
        <button
          key={e.k}
          type="button"
          className={`${styles.emojiFreqCell} ${locked ? styles.emojiFreqCellLocked : ""}`}
          aria-disabled={locked}
          onClick={() => !locked && handleServerEmojiClick(group, em)}
          onMouseEnter={() =>
            setHoverFooter({
              kind: "server",
              imageUrl: em.imageUrl,
              label: em.name ? `:${em.name}:` : ":emoji:",
              serverName: group.serverName,
              serverAvatarUrl: group.serverAvatarUrl,
              addedByDisplayName:
                em.addedBy.displayName || em.addedBy.username || t("chat.mediaPicker.memberFallback"),
              addedByAvatarUrl: em.addedBy.avatarUrl || "",
            })
          }
          onMouseLeave={() => setHoverFooter(null)}
        >
          <img src={em.imageUrl} alt="" loading="lazy" />
          {locked ? <span className={styles.smallLock}>🔒</span> : null}
        </button>
      );
    }
    return null;
  };

  const stickerHasServerRail =
    ownedStickerRows.length > 0 || otherStickerGroups.length > 0;

  const stickerRail = activeTab === "sticker" && !searching && serverMediaOn && (
    <aside className={styles.rail} aria-label={t("chat.mediaPicker.railStickerAria")}>
      <button
        type="button"
        className={`${styles.railBtn} ${activeRailId === "sticker-section-freq" ? styles.railBtnActive : ""}`}
        title={t("chat.mediaPicker.railFreqTitle")}
        onClick={() => scrollToSection("sticker-section-freq")}
      >
        🕐
      </button>
      {stickerHasServerRail ? (
        <>
          {ownedStickerRows.map((row) => {
            const g = row.group;
            const locked = g?.locked ?? false;
            const avatar = g?.serverAvatarUrl ?? row.avatarUrl ?? null;
            const label = g?.serverName ?? row.name;
            return (
              <button
                key={`own-st-${row.id}`}
                type="button"
                className={`${styles.railBtn} ${activeRailId === `sticker-section-owned-${row.id}` ? styles.railBtnActive : ""}`}
                title={label}
                onClick={() => scrollToSection(`sticker-section-owned-${row.id}`)}
              >
                {avatar ? (
                  <img src={avatar} alt="" className={styles.railIconImg} />
                ) : (
                  <span className={styles.railIconPh}>
                    {(label || "?").slice(0, 1).toUpperCase()}
                  </span>
                )}
                {locked ? <span className={styles.railLock}>🔒</span> : null}
              </button>
            );
          })}
          {otherStickerGroups.map((g) => (
            <button
              key={g.serverId}
              type="button"
              className={`${styles.railBtn} ${activeRailId === `sticker-section-other-${g.serverId}` ? styles.railBtnActive : ""}`}
              title={g.serverName}
              onClick={() => scrollToSection(`sticker-section-other-${g.serverId}`)}
            >
              {g.serverAvatarUrl ? (
                <img src={g.serverAvatarUrl} alt="" className={styles.railIconImg} />
              ) : (
                <span className={styles.railIconPh}>
                  {(g.serverName || "?").slice(0, 1).toUpperCase()}
                </span>
              )}
              {g.locked ? <span className={styles.railLock}>🔒</span> : null}
            </button>
          ))}
          <div className={styles.railSep} role="separator" title="Giphy" />
        </>
      ) : null}
      <button
        type="button"
        className={`${styles.railBtn} ${activeRailId === "sticker-section-default" ? styles.railBtnActive : ""}`}
        title={t("chat.mediaPicker.railGiphyStickers")}
        onClick={() => scrollToSection("sticker-section-default")}
      >
        ✨
      </button>
    </aside>
  );

  const emojiHasServerRail =
    serverMediaOn &&
    (ownedEmojiRows.length > 0 || otherEmojiGroups.length > 0);

  const emojiRail = activeTab === "emoji" && !searching && (
    <aside className={styles.rail} aria-label={t("chat.mediaPicker.railEmojiAria")}>
      {freqEmojiList.length > 0 ? (
        <button
          type="button"
          className={`${styles.railBtn} ${activeRailId === "emoji-section-freq" ? styles.railBtnActive : ""}`}
          title={t("chat.mediaPicker.railFreqTitle")}
          onClick={() => scrollToSection("emoji-section-freq")}
        >
          🕐
        </button>
      ) : null}
      {emojiHasServerRail ? (
        <>
          {ownedEmojiRows.map((row) => {
            const g = row.group;
            const locked = g?.locked ?? false;
            const avatar = g?.serverAvatarUrl ?? row.avatarUrl ?? null;
            const label = g?.serverName ?? row.name;
            return (
              <button
                key={`own-em-${row.id}`}
                type="button"
                className={`${styles.railBtn} ${activeRailId === `emoji-section-owned-${row.id}` ? styles.railBtnActive : ""}`}
                title={label}
                onClick={() => scrollToSection(`emoji-section-owned-${row.id}`)}
              >
                {avatar ? (
                  <img src={avatar} alt="" className={styles.railIconImg} />
                ) : (
                  <span className={styles.railIconPh}>
                    {(label || "?").slice(0, 1).toUpperCase()}
                  </span>
                )}
                {locked ? <span className={styles.railLock}>🔒</span> : null}
              </button>
            );
          })}
          {otherEmojiGroups.map((g) => (
            <button
              key={g.serverId}
              type="button"
              className={`${styles.railBtn} ${activeRailId === `emoji-section-other-${g.serverId}` ? styles.railBtnActive : ""}`}
              title={g.serverName}
              onClick={() => scrollToSection(`emoji-section-other-${g.serverId}`)}
            >
              {g.serverAvatarUrl ? (
                <img src={g.serverAvatarUrl} alt="" className={styles.railIconImg} />
              ) : (
                <span className={styles.railIconPh}>
                  {(g.serverName || "?").slice(0, 1).toUpperCase()}
                </span>
              )}
              {g.locked ? <span className={styles.railLock}>🔒</span> : null}
            </button>
          ))}
          <div className={styles.railSep} role="separator" />
        </>
      ) : null}
      <button
        type="button"
        className={`${styles.railBtn} ${activeRailId === "emoji-section-default" ? styles.railBtnActive : ""}`}
        title={t("chat.mediaPicker.railDefaultEmoji")}
        onClick={() => scrollToSection("emoji-section-default")}
      >
        😀
      </button>
      {emojiRailCategories.map((c) => (
        <button
          key={c.category}
          type="button"
          className={`${styles.railBtn} ${activeRailId === `emoji-cat-${c.category}` ? styles.railBtnActive : ""}`}
          title={c.title}
          onClick={() => scrollToEmojiCategory(c.category)}
        >
          {c.icon}
        </button>
      ))}
    </aside>
  );

  const showSearch = activeTab !== "kaomoji";
  const showGiphyFooter = activeTab === "gif" || activeTab === "sticker";

  const stickerFooter =
    (activeTab === "sticker" || activeTab === "emoji") &&
    hoverFooter?.kind === "server" &&
    !searching;

  return (
    <div className={styles.overlay}>
      <div className={`${styles.picker} ${styles.pickerWide}`} ref={pickerRef}>
        <div className={styles.header}>
          <div className={styles.tabs}>
            {(
              [
                ["gif", t("chat.mediaPicker.tabGif")] as const,
                ["sticker", t("chat.mediaPicker.tabSticker")] as const,
                ["emoji", t("chat.mediaPicker.tabEmoji")] as const,
                ["kaomoji", t("chat.mediaPicker.tabKaomoji")] as const,
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`${styles.tab} ${activeTab === id ? styles.tabActive : ""}`}
                onClick={() => handleTabChange(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose}>
            ✕
          </button>
        </div>

        {showSearch && (
          <div className={styles.searchContainer}>
            {activeTab === "gif" &&
              gifSubView === "results" &&
              !searching &&
              gifBrowseToken && (
                <button
                  type="button"
                  className={styles.backToCats}
                  onClick={() => {
                    setGifSubView("categories");
                    setGifBrowseToken(null);
                    setGifs([]);
                  }}
                >
                  {t("chat.mediaPicker.backToCategories")}
                </button>
              )}
            <div
              className={
                activeTab === "emoji" && canShowEmojiManageBtn
                  ? styles.searchRowSplit
                  : styles.searchRow
              }
            >
              <input
                ref={searchInputRef}
                type="text"
                className={styles.searchInput}
                placeholder={
                  activeTab === "gif"
                    ? t("chat.mediaPicker.searchGifPlaceholder")
                    : activeTab === "sticker"
                      ? t("chat.mediaPicker.searchStickerPlaceholder")
                      : t("chat.mediaPicker.searchEmojiPlaceholder")
                }
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {activeTab === "emoji" && canShowEmojiManageBtn ? (
                <button
                  type="button"
                  className={styles.addEmojiBtn}
                  onClick={() => {
                    onManageServerEmojis!(String(contextServerId));
                    onClose();
                  }}
                >
                  {t("chat.mediaPicker.addEmoji")}
                </button>
              ) : null}
            </div>
          </div>
        )}

        <div
          className={styles.bodyRow}
          onMouseLeave={() =>
            (activeTab === "sticker" || activeTab === "emoji") &&
            setHoverFooter(null)
          }
        >
          {stickerRail}
          {emojiRail}

          <div className={styles.railMain}>
            <div className={styles.contentInner}>
              {activeTab === "gif" &&
                !searching &&
                gifSubView === "categories" && (
                  <div className={styles.gifCatGrid}>
                    {gifTiles.map((tile) => (
                      <button
                        key={tile.token}
                        type="button"
                        className={styles.gifCatTile}
                        onClick={() => {
                          setGifSubView("results");
                          setGifBrowseToken(
                            tile.token === "favorites"
                              ? "favorites"
                              : tile.token === "trending"
                                ? "trending"
                                : tile.token,
                          );
                        }}
                      >
                        <span className={styles.gifCatLabel}>{tile.label}</span>
                        {tile.hint ? (
                          <span className={styles.gifCatHint}>{tile.hint}</span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                )}

              {activeTab === "sticker" &&
                !searching &&
                serverMediaOn &&
                stickerPickerLoading && (
                  <p className={styles.inlineHint}>{t("chat.mediaPicker.loadingServerStickers")}</p>
                )}
              {activeTab === "sticker" &&
                !searching &&
                serverMediaOn &&
                stickerPickerError && (
                  <p className={styles.inlineWarn}>{stickerPickerError}</p>
                )}

              {activeTab === "sticker" && !searching && freqStickerList.length > 0 && (
                <section
                  className={styles.section}
                  id="sticker-section-freq"
                  key={`sf-${freqTick}`}
                >
                  <h3 className={styles.sectionTitle}>{t("chat.mediaPicker.sectionFreq")}</h3>
                  <div className={styles.freqGrid}>
                    {freqStickerList.map((row) => renderFreqStickerTile(row))}
                  </div>
                </section>
              )}

              {activeTab === "sticker" &&
                !searching &&
                serverMediaOn &&
                ownedStickerRows.map((row) => {
                  const g = row.group;
                  const displayName = g?.serverName ?? row.name;
                  const avatar = g?.serverAvatarUrl ?? row.avatarUrl ?? null;
                  const hasStickers = !!(g && g.stickers.length > 0);
                  if (!hasStickers) {
                    return (
                      <section
                        key={`own-st-${row.id}`}
                        id={`sticker-section-owned-${row.id}`}
                        className={styles.serverStickerSection}
                      >
                        <div className={styles.serverSectionHead}>
                          {avatar ? (
                            <img src={avatar} alt="" className={styles.serverSectionIcon} />
                          ) : (
                            <div className={styles.serverSectionIconPlaceholder}>
                              {(displayName || "?").slice(0, 1).toUpperCase()}
                            </div>
                          )}
                          <span className={styles.serverSectionName}>
                            {t("chat.mediaPicker.serverPossessive", { name: displayName })}
                          </span>
                        </div>
                        <div className={styles.ownerMediaEmpty}>
                          <div className={styles.ownerMediaEmptyIcon} aria-hidden>
                            🏷️
                          </div>
                          <p className={styles.ownerMediaEmptyText}>
                            {t("chat.mediaPicker.serverStickerEmpty")}
                          </p>
                          {onManageServerStickers ? (
                            <button
                              type="button"
                              className={styles.manageMediaBtn}
                              onClick={() => {
                                onManageServerStickers(row.id);
                                onClose();
                              }}
                            >
                              {t("chat.mediaPicker.manageStickers")}
                            </button>
                          ) : null}
                        </div>
                      </section>
                    );
                  }
                  const group = g as StickerPickerGroup;
                  return (
                    <section
                      key={`own-st-${row.id}`}
                      id={`sticker-section-owned-${row.id}`}
                      className={`${styles.serverStickerSection} ${group.locked ? styles.serverStickerSectionLocked : ""}`}
                    >
                      <div className={styles.serverSectionHead}>
                        {avatar ? (
                          <img src={avatar} alt="" className={styles.serverSectionIcon} />
                        ) : (
                          <div className={styles.serverSectionIconPlaceholder}>
                            {(displayName || "?").slice(0, 1).toUpperCase()}
                          </div>
                        )}
                        <span className={styles.serverSectionName}>
                          {t("chat.mediaPicker.serverPossessive", { name: displayName })}
                        </span>
                        {group.locked ? (
                          <span
                            className={styles.serverSectionBadge}
                            title={t("chat.mediaPicker.onlyThisServer")}
                          >
                            🔒
                          </span>
                        ) : null}
                      </div>
                      <div className={styles.serverStickerGridWrap}>
                        <div
                          className={`${styles.grid} ${styles.gridCompact} ${group.locked ? styles.stickerGridLockedTone : ""}`}
                        >
                          {group.stickers.map((st) => (
                            <button
                              key={st.id}
                              type="button"
                              className={`${styles.stickerCell} ${group.locked ? styles.stickerCellLocked : ""}`}
                              aria-disabled={group.locked}
                              onClick={() =>
                                !group.locked &&
                                handleServerStickerClick(group, st)
                              }
                              onMouseEnter={() =>
                                setHoverFooter({
                                  kind: "server",
                                  imageUrl: st.imageUrl,
                                  label: st.name
                                    ? `:${st.name}:`
                                    : ":sticker:",
                                  serverName: group.serverName,
                                  serverAvatarUrl: group.serverAvatarUrl,
                                  addedByDisplayName:
                                    st.addedBy.displayName ||
                                    st.addedBy.username ||
                                    t("chat.mediaPicker.memberFallback"),
                                  addedByAvatarUrl: st.addedBy.avatarUrl || "",
                                })
                              }
                              onMouseLeave={() => setHoverFooter(null)}
                            >
                              <img src={st.imageUrl} alt="" loading="lazy" />
                            </button>
                          ))}
                        </div>
                      </div>
                    </section>
                  );
                })}

              {activeTab === "sticker" &&
                !searching &&
                serverMediaOn &&
                otherStickerGroups.map((group) => (
                  <section
                    key={group.serverId}
                    id={`sticker-section-other-${group.serverId}`}
                    className={`${styles.serverStickerSection} ${group.locked ? styles.serverStickerSectionLocked : ""}`}
                  >
                    <div className={styles.serverSectionHead}>
                      {group.serverAvatarUrl ? (
                        <img
                          src={group.serverAvatarUrl}
                          alt=""
                          className={styles.serverSectionIcon}
                        />
                      ) : (
                        <div className={styles.serverSectionIconPlaceholder}>
                          {(group.serverName || "?").slice(0, 1).toUpperCase()}
                        </div>
                      )}
                      <span className={styles.serverSectionName}>
                        {group.serverName}
                      </span>
                      {group.locked ? (
                        <span
                          className={styles.serverSectionBadge}
                          title={t("chat.mediaPicker.onlyThisServer")}
                        >
                          🔒
                        </span>
                      ) : null}
                    </div>
                    <div className={styles.serverStickerGridWrap}>
                      <div
                        className={`${styles.grid} ${styles.gridCompact} ${group.locked ? styles.stickerGridLockedTone : ""}`}
                      >
                        {group.stickers.map((st) => (
                          <button
                            key={st.id}
                            type="button"
                            className={`${styles.stickerCell} ${group.locked ? styles.stickerCellLocked : ""}`}
                            aria-disabled={group.locked}
                            onClick={() =>
                              !group.locked &&
                              handleServerStickerClick(group, st)
                            }
                            onMouseEnter={() =>
                              setHoverFooter({
                                kind: "server",
                                imageUrl: st.imageUrl,
                                label: st.name
                                  ? `:${st.name}:`
                                  : ":sticker:",
                                serverName: group.serverName,
                                serverAvatarUrl: group.serverAvatarUrl,
                                addedByDisplayName:
                                  st.addedBy.displayName ||
                                  st.addedBy.username ||
                                  t("chat.mediaPicker.memberFallback"),
                                addedByAvatarUrl: st.addedBy.avatarUrl || "",
                              })
                            }
                            onMouseLeave={() => setHoverFooter(null)}
                          >
                            <img src={st.imageUrl} alt="" loading="lazy" />
                          </button>
                        ))}
                      </div>
                    </div>
                  </section>
                ))}

              {activeTab === "sticker" && !searching && (
                <section id="sticker-section-default">
                  <h3 className={styles.sectionTitleGiphy}>{t("chat.mediaPicker.defaultStickers")}</h3>
                </section>
              )}

              {activeTab === "emoji" &&
                !searching &&
                serverMediaOn &&
                emojiPickerLoading && (
                  <p className={styles.inlineHint}>{t("chat.mediaPicker.loadingServerEmoji")}</p>
                )}
              {activeTab === "emoji" &&
                !searching &&
                serverMediaOn &&
                emojiPickerError && (
                  <p className={styles.inlineWarn}>{emojiPickerError}</p>
                )}

              {activeTab === "emoji" && !searching && freqEmojiList.length > 0 && (
                <section
                  className={styles.section}
                  id="emoji-section-freq"
                  key={`ef-${freqTick}`}
                >
                  <h3 className={styles.sectionTitle}>{t("chat.mediaPicker.sectionFreq")}</h3>
                  <div className={styles.emojiFreqGrid}>
                    {freqEmojiList.map((row) => renderFreqEmojiTile(row))}
                  </div>
                </section>
              )}

              {activeTab === "emoji" &&
                !searching &&
                serverMediaOn &&
                ownedEmojiRows.map((row) => {
                  const g = row.group;
                  const displayName = g?.serverName ?? row.name;
                  const avatar = g?.serverAvatarUrl ?? row.avatarUrl ?? null;
                  const hasEmojis = !!(g && g.emojis.length > 0);
                  if (!hasEmojis) {
                    return (
                      <section
                        key={`own-em-${row.id}`}
                        id={`emoji-section-owned-${row.id}`}
                        className={styles.serverStickerSection}
                      >
                        <div className={styles.serverSectionHead}>
                          {avatar ? (
                            <img src={avatar} alt="" className={styles.serverSectionIcon} />
                          ) : (
                            <div className={styles.serverSectionIconPlaceholder}>
                              {(displayName || "?").slice(0, 1).toUpperCase()}
                            </div>
                          )}
                          <span className={styles.serverSectionName}>
                            {t("chat.mediaPicker.serverPossessive", { name: displayName })}
                          </span>
                        </div>
                        <div className={styles.ownerMediaEmpty}>
                          <div className={styles.ownerMediaEmptyIcon} aria-hidden>
                            😀
                          </div>
                          <p className={styles.ownerMediaEmptyText}>
                            {t("chat.mediaPicker.serverEmojiEmpty")}
                          </p>
                          {onManageServerEmojis ? (
                            <button
                              type="button"
                              className={styles.manageMediaBtn}
                              onClick={() => {
                                onManageServerEmojis(row.id);
                                onClose();
                              }}
                            >
                              {t("chat.mediaPicker.manageEmojis")}
                            </button>
                          ) : null}
                        </div>
                      </section>
                    );
                  }
                  const group = g as EmojiPickerGroup;
                  return (
                    <section
                      key={`own-em-${row.id}`}
                      id={`emoji-section-owned-${row.id}`}
                      className={`${styles.serverStickerSection} ${group.locked ? styles.serverStickerSectionLocked : ""}`}
                    >
                      <div className={styles.serverSectionHead}>
                        {avatar ? (
                          <img src={avatar} alt="" className={styles.serverSectionIcon} />
                        ) : (
                          <div className={styles.serverSectionIconPlaceholder}>
                            {(displayName || "?").slice(0, 1).toUpperCase()}
                          </div>
                        )}
                        <span className={styles.serverSectionName}>
                          {t("chat.mediaPicker.serverPossessive", { name: displayName })}
                        </span>
                        {group.locked ? (
                          <span className={styles.serverSectionBadge} title={t("chat.mediaPicker.lockedOtherServer")}>
                            🔒
                          </span>
                        ) : null}
                      </div>
                      <div className={styles.serverStickerGridWrap}>
                        {group.locked ? (
                          <div className={styles.lockOverlay} aria-hidden>
                            <span className={styles.lockIconLarge}>🔒</span>
                          </div>
                        ) : null}
                        <div
                          className={`${styles.emojiServerGrid} ${group.locked ? styles.gridLocked : ""}`}
                        >
                          {group.emojis.map((em) => (
                            <button
                              key={em.id}
                              type="button"
                              className={`${styles.emojiServerCell} ${group.locked ? styles.emojiServerCellLocked : ""}`}
                              aria-disabled={group.locked}
                              onClick={() =>
                                !group.locked && handleServerEmojiClick(group, em)
                              }
                              onMouseEnter={() =>
                                setHoverFooter({
                                  kind: "server",
                                  imageUrl: em.imageUrl,
                                  label: em.name ? `:${em.name}:` : ":emoji:",
                                  serverName: group.serverName,
                                  serverAvatarUrl: group.serverAvatarUrl,
                                  addedByDisplayName:
                                    em.addedBy.displayName ||
                                    em.addedBy.username ||
                                    t("chat.mediaPicker.memberFallback"),
                                  addedByAvatarUrl: em.addedBy.avatarUrl || "",
                                })
                              }
                              onMouseLeave={() => setHoverFooter(null)}
                            >
                              <img src={em.imageUrl} alt="" loading="lazy" />
                            </button>
                          ))}
                        </div>
                      </div>
                    </section>
                  );
                })}

              {activeTab === "emoji" &&
                !searching &&
                serverMediaOn &&
                otherEmojiGroups.map((group) => (
                  <section
                    key={group.serverId}
                    id={`emoji-section-other-${group.serverId}`}
                    className={`${styles.serverStickerSection} ${group.locked ? styles.serverStickerSectionLocked : ""}`}
                  >
                    <div className={styles.serverSectionHead}>
                      {group.serverAvatarUrl ? (
                        <img
                          src={group.serverAvatarUrl}
                          alt=""
                          className={styles.serverSectionIcon}
                        />
                      ) : (
                        <div className={styles.serverSectionIconPlaceholder}>
                          {(group.serverName || "?").slice(0, 1).toUpperCase()}
                        </div>
                      )}
                      <span className={styles.serverSectionName}>
                        {group.serverName}
                      </span>
                      {group.locked ? (
                        <span className={styles.serverSectionBadge} title={t("chat.mediaPicker.lockedOtherServer")}>
                          🔒
                        </span>
                      ) : null}
                    </div>
                    <div className={styles.serverStickerGridWrap}>
                      {group.locked ? (
                        <div className={styles.lockOverlay} aria-hidden>
                          <span className={styles.lockIconLarge}>🔒</span>
                        </div>
                      ) : null}
                      <div
                        className={`${styles.emojiServerGrid} ${group.locked ? styles.gridLocked : ""}`}
                      >
                        {group.emojis.map((em) => (
                          <button
                            key={em.id}
                            type="button"
                            className={`${styles.emojiServerCell} ${group.locked ? styles.emojiServerCellLocked : ""}`}
                            aria-disabled={group.locked}
                            onClick={() =>
                              !group.locked && handleServerEmojiClick(group, em)
                            }
                            onMouseEnter={() =>
                              setHoverFooter({
                                kind: "server",
                                imageUrl: em.imageUrl,
                                label: em.name ? `:${em.name}:` : ":emoji:",
                                serverName: group.serverName,
                                serverAvatarUrl: group.serverAvatarUrl,
                                addedByDisplayName:
                                  em.addedBy.displayName ||
                                  em.addedBy.username ||
                                  t("chat.mediaPicker.memberFallback"),
                                addedByAvatarUrl: em.addedBy.avatarUrl || "",
                              })
                            }
                            onMouseLeave={() => setHoverFooter(null)}
                          >
                            <img src={em.imageUrl} alt="" loading="lazy" />
                          </button>
                        ))}
                      </div>
                    </div>
                  </section>
                ))}

              {activeTab === "emoji" && !searching && (
                <section className={styles.emojiDefaultSection} id="emoji-section-default">
                  <div className={styles.emoji} ref={emojiMartHostRef}>
                    <h3 className={styles.emojiDefaultHeading}>{t("chat.mediaPicker.defaultEmoji")}</h3>
                    <div className={styles.emojiPickerSlot}>
                      <EmojiPicker
                        className="cordigram-default-emoji-epr"
                        style={{
                          width: "100%",
                          border: "none",
                          borderRadius: 0,
                          background: "transparent",
                          boxShadow: "none",
                        }}
                        onEmojiClick={(d: { emoji?: string }) => {
                          const ch = d?.emoji ?? "";
                          if (!ch) return;
                          bumpEmojiFreq({ n: 0, type: "unicode", char: ch });
                          setFreqTick((x) => x + 1);
                          onSelect({ source: "unicode", emoji: ch });
                          onClose();
                        }}
                        theme={Theme.DARK}
                        categories={emojiMartCategoryNames}
                        autoFocusSearch={false}
                        lazyLoadEmojis
                        searchDisabled
                        skinTonesDisabled
                        previewConfig={{ showPreview: false }}
                        height={340}
                        width="100%"
                      />
                    </div>
                  </div>
                </section>
              )}

              {activeTab === "kaomoji" && (
                <div className={styles.kaomojiPanel}>
                  {kaomojiCategories.map((cat) => (
                    <div key={cat.label} className={styles.kaoCategory}>
                      <div className={styles.kaoCategoryLabel}>{cat.label}</div>
                      <div className={styles.kaoGrid}>
                        {cat.items.map((k) => (
                          <button
                            key={k}
                            type="button"
                            className={styles.kaoItem}
                            onClick={() => {
                              onSelect({ source: "kaomoji", text: k });
                              onClose();
                            }}
                            title={k}
                          >
                            {k}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {(activeTab === "gif" &&
                (searching || gifSubView === "results")) ||
              activeTab === "sticker" ? (
                <>
                  {loading && (
                    <div className={styles.loading}>
                      <div className={styles.spinner} />
                      <p>{t("chat.mediaPicker.loading")}</p>
                    </div>
                  )}
                  {error && (
                    <div className={styles.error}>
                      <p>{error}</p>
                      <button
                        type="button"
                        onClick={() => setSearchQuery("")}
                      >
                        {t("chat.mediaPicker.retry")}
                      </button>
                    </div>
                  )}
                  {!loading && !error && gifs.length === 0 && activeTab === "gif" && gifSubView === "results" && gifBrowseToken === "favorites" && (
                    <div className={styles.empty}>
                      <p>{t("chat.mediaPicker.emptyFavoriteGifs")}</p>
                    </div>
                  )}
                  {!loading && !error && gifs.length === 0 && (activeTab === "sticker" || (activeTab === "gif" && (searching || gifSubView === "results")) && !(gifBrowseToken === "favorites")) && (
                    <div className={styles.empty}>
                      <p>{t("chat.mediaPicker.emptyNoResults")}</p>
                    </div>
                  )}
                  {!loading && !error && gifs.length > 0 && (
                    <div className={styles.grid}>
                      {gifs.map((gif) => (
                        <div
                          key={gif.id}
                          className={styles.gifItem}
                          onClick={() =>
                            handleGiphyClick(
                              gif,
                              activeTab === "gif" ? "gif" : "sticker",
                            )
                          }
                          role="button"
                          tabIndex={0}
                          onKeyDown={(ev) => {
                            if (ev.key === "Enter" || ev.key === " ")
                              handleGiphyClick(
                                gif,
                                activeTab === "gif" ? "gif" : "sticker",
                              );
                          }}
                        >
                          <img
                            src={gif.images.fixed_height_small.url}
                            alt={gif.title}
                            loading="lazy"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : null}
            </div>
          </div>
        </div>

        <div className={styles.footer}>
          {stickerFooter ? (
            <div className={styles.stickerMetaFooter}>
              <img
                src={hoverFooter!.imageUrl}
                alt=""
                className={styles.stickerMetaThumb}
              />
              <div className={styles.stickerMetaCenter}>
                <div className={styles.stickerMetaName}>{hoverFooter!.label}</div>
                <div className={styles.stickerMetaLine}>
                  <span className={styles.stickerMetaUploader}>
                    {hoverFooter!.addedByDisplayName}
                  </span>
                  <span className={styles.stickerMetaFrom}>
                    {t("chat.mediaPicker.hoverFrom", {
                      server: hoverFooter!.serverName,
                    })}
                  </span>
                </div>
              </div>
              <div className={styles.stickerMetaRight}>
                {hoverFooter!.addedByAvatarUrl ? (
                  <img
                    src={hoverFooter!.addedByAvatarUrl}
                    alt=""
                    className={styles.stickerMetaAvatar}
                  />
                ) : (
                  <div className={styles.stickerMetaAvatarPh} />
                )}
                {hoverFooter!.serverAvatarUrl ? (
                  <img
                    src={hoverFooter!.serverAvatarUrl}
                    alt=""
                    className={styles.stickerMetaServerIcon}
                  />
                ) : (
                  <div className={styles.stickerMetaServerPh}>
                    {hoverFooter!.serverName.slice(0, 1).toUpperCase()}
                  </div>
                )}
              </div>
            </div>
          ) : showGiphyFooter ? (
            <>
              <span>{t("chat.mediaPicker.poweredBy")}</span>
              <img
                src="https://developers.giphy.com/branch/master/static/attribution-mark-1a9925c1.png"
                alt="Giphy"
                className={styles.giphyLogo}
              />
            </>
          ) : (
            <span className={styles.footerMuted}>
              {activeTab === "kaomoji"
                ? t("chat.mediaPicker.footerKaomoji")
                : t("chat.mediaPicker.footerEmoji")}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
