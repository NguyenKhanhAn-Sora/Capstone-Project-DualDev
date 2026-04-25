"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import styles from "./MessageSearchPanel.module.css";
import * as serversApi from "@/lib/servers-api";
import { searchDirectMessages } from "@/lib/api";
import { useLanguage, localeTagForLanguage } from "@/component/language-provider";
import { translateChannelName } from "@/lib/system-names";
import {
  parseMessageSearchQuery,
  parseMessageSearchQueryForDm,
  highlightTermsFromParsed,
  type ParsedMessageSearch,
} from "@/lib/message-search-query";

const RECENT_KEY = "cordigram.messageSearch.recentChannels";
const DEBOUNCE_MS = 300;

export type QuickSwitchServer = {
  _id: string;
  name: string;
  textChannels: Array<{ _id: string; name: string; type: string }>;
  voiceChannels: Array<{ _id: string; name: string; type: string }>;
};

export type DmPeer = {
  _id: string;
  displayName?: string;
  username?: string;
  avatarUrl?: string;
};

interface MessageSearchPanelProps {
  isOpen: boolean;
  onClose: () => void;
  mode: "server" | "dm";
  serverId?: string;
  serverName?: string;
  channelId?: string;
  channels?: Array<{ _id: string; name: string; type: string }>;
  members?: Array<{ userId: string; displayName?: string; username?: string; avatarUrl?: string }>;
  dmPartnerId?: string;
  dmPartnerName?: string;
  onResultClick?: (messageId: string, channelId?: string) => void;
  /** Friends / DM peers for @ quick switch */
  dmPeers?: DmPeer[];
  /** All servers with channel lists (cross-server # ! *) */
  serversForQuickSwitch?: QuickSwitchServer[];
  onQuickSwitchDm?: (userId: string) => void;
  onQuickSwitchChannel?: (serverId: string, channelId: string) => void;
  onQuickSwitchServer?: (serverId: string) => void;
  /**
   * DM: mở từ nút kính lúp trên header — chỉ tìm nội dung trong cuộc trò chuyện hiện tại,
   * không quick switch @/#/!/* và không parse from:/has: (query literal).
   */
  dmConversationOnlySearch?: boolean;
}

export type ParseQuickSwitchPrefixOpts = {
  /** false = @ # ! * không kích hoạt quick switch (coi như nội dung tìm). */
  enableQuickSwitch?: boolean;
  /** Chỉ khi enableQuickSwitch; mặc định true (server: false để bỏ *). */
  includeStarQuickSwitch?: boolean;
};

type RecentChannel = { channelId: string; channelName: string; serverName: string };

function loadRecent(serverId: string | undefined): RecentChannel[] {
  if (typeof window === "undefined" || !serverId) return [];
  try {
    const raw = localStorage.getItem(`${RECENT_KEY}.${serverId}`);
    if (!raw) return [];
    const arr = JSON.parse(raw) as RecentChannel[];
    return Array.isArray(arr) ? arr.slice(0, 8) : [];
  } catch {
    return [];
  }
}

function saveRecent(serverId: string, entry: RecentChannel) {
  try {
    const prev = loadRecent(serverId);
    const next = [
      entry,
      ...prev.filter((p) => p.channelId !== entry.channelId),
    ].slice(0, 8);
    localStorage.setItem(`${RECENT_KEY}.${serverId}`, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

/** Discord-style: leading @ # ! * switches mode; rest is filter needle */
export function parseQuickSwitchPrefix(
  raw: string,
  opts?: ParseQuickSwitchPrefixOpts,
): {
  kind: "@" | "#" | "!" | "*" | null;
  needle: string;
} {
  if (opts?.enableQuickSwitch === false) {
    return { kind: null, needle: "" };
  }
  const includeStar = opts?.includeStarQuickSwitch !== false;
  const t = raw.trimStart();
  if (!t.length) return { kind: null, needle: "" };
  const c = t[0];
  if (c === "@") return { kind: "@", needle: t.slice(1).trimStart() };
  if (c === "#") return { kind: "#", needle: t.slice(1).trimStart() };
  if (c === "!") return { kind: "!", needle: t.slice(1).trimStart() };
  if (c === "*" && includeStar) return { kind: "*", needle: t.slice(1).trimStart() };
  return { kind: null, needle: "" };
}

function getFilterSuggestContext(
  q: string,
  parseOpts: ParseQuickSwitchPrefixOpts,
  suppressInlineFilterSuggest = false,
): { kind: "from" | "in"; needle: string } | null {
  if (parseQuickSwitchPrefix(q, parseOpts).kind) return null;
  if (suppressInlineFilterSuggest) return null;
  const trimmed = q.trimEnd();
  const fromM = /(?:^|\s)from:([^ \t]*)$/i.exec(trimmed);
  if (fromM) return { kind: "from", needle: fromM[1] };
  const inM = /(?:^|\s)in:([^ \t]*)$/i.exec(trimmed);
  if (inM) return { kind: "in", needle: inM[1] };
  return null;
}

function highlightContent(text: string, terms: string[]): React.ReactNode {
  if (!terms.length) return text;
  const escaped = terms
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .filter(Boolean);
  if (!escaped.length) return text;
  const regex = new RegExp(`(${escaped.join("|")})`, "gi");
  const parts = String(text).split(regex);
  return parts.map((part, i) =>
    terms.some((t) => t.toLowerCase() === part.toLowerCase()) ? (
      <span key={i} className={styles.highlight}>
        {part}
      </span>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    ),
  );
}

function matchesNeedle(needle: string, ...fields: (string | undefined)[]): boolean {
  const normalizeSearchText = (v: string) =>
    v
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[đĐ]/g, "d")
      .toLowerCase();
  const n = normalizeSearchText(needle.trim());
  if (!n) return true;
  return fields.some((f) => normalizeSearchText(f || "").includes(n));
}

export default function MessageSearchPanel({
  isOpen,
  onClose,
  mode,
  serverId,
  serverName,
  channelId,
  channels = [],
  members = [],
  dmPartnerId,
  dmPartnerName,
  onResultClick,
  dmPeers = [],
  serversForQuickSwitch = [],
  onQuickSwitchDm,
  onQuickSwitchChannel,
  onQuickSwitchServer,
  dmConversationOnlySearch = false,
}: MessageSearchPanelProps) {
  const { t, language } = useLanguage();
  const quickSwitchParseOpts = useMemo((): ParseQuickSwitchPrefixOpts => {
    if (mode === "dm" && dmConversationOnlySearch) {
      return { enableQuickSwitch: false };
    }
    if (mode === "server") {
      return { enableQuickSwitch: true, includeStarQuickSwitch: false };
    }
    return { enableQuickSwitch: true, includeStarQuickSwitch: true };
  }, [mode, dmConversationOnlySearch]);

  const suppressInlineFilterSuggest = mode === "dm" && dmConversationOnlySearch;

  const footerHint = useMemo(() => {
    if (mode === "dm" && dmConversationOnlySearch) {
      return { bodyKey: "proTipDmConversationOnly" as const, showKbds: false };
    }
    if (mode === "server") {
      return { bodyKey: "proTipBodyServer" as const, showKbds: true, showStar: false };
    }
    return { bodyKey: "proTipBody" as const, showKbds: true, showStar: true };
  }, [mode, dmConversationOnlySearch]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [lastParsed, setLastParsed] = useState<ParsedMessageSearch | null>(null);
  const [recent, setRecent] = useState<RecentChannel[]>([]);

  const LIMIT = 25;
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const textChannels = useMemo(
    () => channels.filter((c) => c.type === "text"),
    [channels],
  );

  const quickSwitch = useMemo(
    () => parseQuickSwitchPrefix(query, quickSwitchParseOpts),
    [query, quickSwitchParseOpts],
  );

  const dmMatches = useMemo(() => {
    if (quickSwitch.kind !== "@") return [];
    const n = quickSwitch.needle;
    return dmPeers
      .filter((p) =>
        matchesNeedle(n, p.displayName, p.username, p._id),
      )
      .slice(0, 40);
  }, [quickSwitch, dmPeers]);

  const textChannelMatches = useMemo(() => {
    if (quickSwitch.kind !== "#") return [];
    const n = quickSwitch.needle;
    const out: Array<{
      serverId: string;
      serverName: string;
      ch: { _id: string; name: string; type: string };
      displayName: string;
    }> = [];
    for (const s of serversForQuickSwitch) {
      for (const ch of s.textChannels || []) {
        if (!ch || ch.type !== "text") continue;
        const translated = translateChannelName(ch.name, language);
        if (matchesNeedle(n, ch.name, translated)) {
          out.push({ serverId: s._id, serverName: s.name, ch, displayName: translated });
        }
      }
    }
    return out.slice(0, 60);
  }, [quickSwitch, serversForQuickSwitch, language]);

  const voiceChannelMatches = useMemo(() => {
    if (quickSwitch.kind !== "!") return [];
    const n = quickSwitch.needle;
    const out: Array<{
      serverId: string;
      serverName: string;
      ch: { _id: string; name: string; type: string };
      displayName: string;
    }> = [];
    for (const s of serversForQuickSwitch) {
      for (const ch of s.voiceChannels || []) {
        if (!ch || ch.type !== "voice") continue;
        const translated = translateChannelName(ch.name, language);
        if (matchesNeedle(n, ch.name, translated)) {
          out.push({ serverId: s._id, serverName: s.name, ch, displayName: translated });
        }
      }
    }
    return out.slice(0, 60);
  }, [quickSwitch, serversForQuickSwitch, language]);

  const serverMatches = useMemo(() => {
    if (quickSwitch.kind !== "*") return [];
    const n = quickSwitch.needle;
    return serversForQuickSwitch
      .filter((s) => matchesNeedle(n, s.name))
      .slice(0, 40);
  }, [quickSwitch, serversForQuickSwitch]);

  useEffect(() => {
    if (isOpen && serverId) {
      setRecent(loadRecent(serverId));
    }
  }, [isOpen, serverId]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 80);
    }
    if (!isOpen) {
      setQuery("");
      setResults([]);
      setTotalCount(0);
      setHasSearched(false);
      setLastParsed(null);
    }
  }, [isOpen]);

  const suggestCtx = useMemo(
    () => getFilterSuggestContext(query, quickSwitchParseOpts, suppressInlineFilterSuggest),
    [query, quickSwitchParseOpts, suppressInlineFilterSuggest],
  );

  const filteredMembers = useMemo(() => {
    if (!suggestCtx || suggestCtx.kind !== "from") return [];
    const n = suggestCtx.needle.toLowerCase();
    return members.filter((m) => {
      const dn = (m.displayName || "").toLowerCase();
      const un = (m.username || "").toLowerCase();
      const id = m.userId.toLowerCase();
      if (!n) return true;
      return dn.includes(n) || un.includes(n) || id.includes(n);
    }).slice(0, 12);
  }, [suggestCtx, members]);

  const filteredChannels = useMemo(() => {
    if (!suggestCtx || suggestCtx.kind !== "in") return [];
    return textChannels.filter((ch) => {
      const translated = translateChannelName(ch.name, language);
      return matchesNeedle(suggestCtx.needle, ch.name, translated);
    }).slice(0, 12);
  }, [suggestCtx, textChannels, language]);

  const applySuggestionFromUser = (userId: string) => {
    const trimmed = query.trimEnd();
    const replaced = trimmed.replace(/(?:^|\s)from:[^ \t]*$/i, ` from:${userId}`);
    setQuery(replaced.startsWith(" ") ? replaced.trimStart() : replaced);
  };

  const applySuggestionInChannel = (name: string) => {
    const trimmed = query.trimEnd();
    const safe = name.includes(" ") ? `"${name}"` : name;
    const replaced = trimmed.replace(/(?:^|\s)in:[^ \t]*$/i, ` in:${safe}`);
    setQuery(replaced.startsWith(" ") ? replaced.trimStart() : replaced);
  };

  const doSearch = useCallback(
    async (q: string, currentOffset: number, append: boolean) => {
      if (parseQuickSwitchPrefix(q, quickSwitchParseOpts).kind) return;

      const parsedLocal =
        mode === "dm"
          ? dmConversationOnlySearch
            ? { text: q.trim(), filters: {} as ParsedMessageSearch["filters"] }
            : parseMessageSearchQueryForDm(q)
          : parseMessageSearchQuery(q);
      const hasSignal =
        mode === "dm" && dmConversationOnlySearch
          ? q.trim().length > 0
          : q.trim().length > 0 ||
            Boolean(parsedLocal.filters.from) ||
            Boolean(parsedLocal.filters.in) ||
            Boolean(parsedLocal.filters.has);

      if (!hasSignal) return;

      setLoading(true);
      try {
        if (mode === "server" && serverId) {
          const res = await serversApi.searchMessages({
            q: q.trim() || undefined,
            serverId,
            channelId: channelId || undefined,
            limit: LIMIT,
            offset: currentOffset,
            fuzzy: true,
            parseQuery: true,
          });
          if (append) {
            setResults((prev) => [...prev, ...res.results]);
          } else {
            setResults(res.results);
          }
          setTotalCount(res.totalCount);
          if (res.parsed) {
            setLastParsed({
              text: res.parsed.text,
              filters: res.parsed.filters,
            });
          } else {
            setLastParsed(parsedLocal);
          }
        } else if (mode === "dm") {
          const token =
            localStorage.getItem("accessToken") ||
            localStorage.getItem("token") ||
            "";
          const res = await searchDirectMessages({
            token,
            q: q.trim() || undefined,
            userId: dmPartnerId || undefined,
            limit: LIMIT,
            offset: currentOffset,
            fuzzy: true,
            parseQuery: !dmConversationOnlySearch,
          });
          if (append) {
            setResults((prev) => [...prev, ...res.results]);
          } else {
            setResults(res.results);
          }
          setTotalCount(res.totalCount);
          if (res.parsed) {
            setLastParsed({
              text: res.parsed.text,
              filters: res.parsed.filters,
            });
          } else {
            setLastParsed(parsedLocal);
          }
        }
        setHasSearched(true);
      } catch (err) {
        console.error("Search error:", err);
      } finally {
        setLoading(false);
      }
    },
    [
      mode,
      serverId,
      channelId,
      dmPartnerId,
      quickSwitchParseOpts,
      dmConversationOnlySearch,
    ],
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (parseQuickSwitchPrefix(query, quickSwitchParseOpts).kind) {
      setResults([]);
      setTotalCount(0);
      setHasSearched(false);
      setLastParsed(null);
      setLoading(false);
      return;
    }

    const parsedLocal =
      mode === "dm"
        ? dmConversationOnlySearch
          ? { text: query.trim(), filters: {} as ParsedMessageSearch["filters"] }
          : parseMessageSearchQueryForDm(query)
        : parseMessageSearchQuery(query);
    const hasSignal =
      mode === "dm" && dmConversationOnlySearch
        ? query.trim().length > 0
        : query.trim().length > 0 ||
          Boolean(parsedLocal.filters.from) ||
          Boolean(parsedLocal.filters.in) ||
          Boolean(parsedLocal.filters.has);

    if (!hasSignal) {
      setResults([]);
      setTotalCount(0);
      setHasSearched(false);
      setLastParsed(null);
      return;
    }

    debounceRef.current = setTimeout(() => {
      doSearch(query, 0, false);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, doSearch, mode, quickSwitchParseOpts, dmConversationOnlySearch]);

  const handleLoadMore = () => {
    doSearch(query, results.length, true);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  };

  const formatTime = useCallback(
    (dateStr: string) => {
      const d = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      if (diffDays === 0) {
        return t("chat.popups.messageSearch.todayAt", {
          time: `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`,
        });
      }
      if (diffDays === 1) return t("chat.popups.messageSearch.yesterday");
      if (diffDays < 7)
        return t("chat.popups.messageSearch.daysAgo", { n: diffDays });
      return d.toLocaleDateString(localeTagForLanguage(language));
    },
    [t, language],
  );

  const highlightTerms = useMemo(() => {
    if (lastParsed) return highlightTermsFromParsed(lastParsed);
    if (mode === "dm" && dmConversationOnlySearch) {
      return highlightTermsFromParsed({
        text: query.trim(),
        filters: {},
      });
    }
    return highlightTermsFromParsed(
      mode === "dm"
        ? parseMessageSearchQueryForDm(query)
        : parseMessageSearchQuery(query),
    );
  }, [lastParsed, query, mode, dmConversationOnlySearch]);

  const showQuickSwitch = Boolean(quickSwitch.kind);
  const showMessageToolbar = !showQuickSwitch;

  if (!isOpen) return null;

  const panelContent = (
    <>
      <div className={styles.overlay} onClick={onClose} />
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="message-search-title"
        onKeyDown={handleKeyDown}
      >
        <div className={styles.modalInner}>
          <div className={styles.heroRow}>
            <input
              id="message-search-title"
              ref={inputRef}
              className={styles.heroInput}
              type="text"
              placeholder={
                mode === "dm"
                  ? t("chat.popups.messageSearch.heroPlaceholderDm", {
                      name: dmPartnerName || "…",
                    })
                  : t("chat.popups.messageSearch.heroPlaceholder")
              }
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
            />
            <button
              type="button"
              className={styles.closeBtn}
              onClick={onClose}
              title={t("chat.popups.closeAria")}
              aria-label={t("chat.popups.closeAria")}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {showMessageToolbar &&
            suggestCtx &&
            mode === "server" &&
            suggestCtx.kind === "from" &&
            filteredMembers.length > 0 && (
              <div className={styles.suggestDropdown}>
                {filteredMembers.map((m) => (
                  <button
                    key={m.userId}
                    type="button"
                    className={styles.suggestItem}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => applySuggestionFromUser(m.userId)}
                  >
                    <span className={styles.suggestHash}>@</span>
                    <span className={styles.suggestMain}>
                      {m.displayName || m.username || m.userId}
                    </span>
                    <span className={styles.suggestMeta}>{m.userId}</span>
                  </button>
                ))}
              </div>
            )}

          {showMessageToolbar &&
            suggestCtx &&
            mode === "server" &&
            suggestCtx.kind === "in" &&
            filteredChannels.length > 0 && (
              <div className={styles.suggestDropdown}>
                {filteredChannels.map((ch) => (
                  <button
                    key={ch._id}
                    type="button"
                    className={styles.suggestItem}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => applySuggestionInChannel(ch.name)}
                  >
                    <span className={styles.suggestHash}>#</span>
                    <span className={styles.suggestMain}>
                      {translateChannelName(ch.name, language)}
                    </span>
                    <span className={styles.suggestMeta}>{serverName || ""}</span>
                  </button>
                ))}
              </div>
            )}

          {showMessageToolbar &&
            mode === "server" &&
            serverId &&
            recent.length > 0 &&
            !hasSearched && (
              <div className={styles.section}>
                <div className={styles.sectionTitle}>
                  {t("chat.popups.messageSearch.recentChannels")}
                </div>
                {recent.map((r) => (
                  <button
                    key={r.channelId}
                    type="button"
                    className={styles.sectionItem}
                    onClick={() => {
                      setQuery((q0) => {
                        const base = q0.trim();
                        const inPart = `in:${r.channelName}`;
                        return base ? `${base} ${inPart}` : inPart;
                      });
                    }}
                  >
                    <span className={styles.suggestHash}>#</span>
                    <span className={styles.suggestMain}>{r.channelName}</span>
                    <span className={styles.suggestMeta}>{r.serverName}</span>
                  </button>
                ))}
              </div>
            )}

          {showMessageToolbar &&
            mode === "server" &&
            textChannels.length > 0 &&
            !hasSearched && (
              <div className={styles.section}>
                <div className={styles.sectionTitle}>
                  {t("chat.popups.messageSearch.suggestions")}
                </div>
                {textChannels.slice(0, 6).map((ch) => (
                  <button
                    key={ch._id}
                    type="button"
                    className={styles.sectionItem}
                    onClick={() => {
                      setQuery((q0) => {
                        const base = q0.trim();
                        const inPart = `in:${ch.name}`;
                        return base ? `${base} ${inPart}` : inPart;
                      });
                    }}
                  >
                    <span className={styles.suggestHash}>#</span>
                    <span className={styles.suggestMain}>
                      {translateChannelName(ch.name, language)}
                    </span>
                    <span className={styles.suggestMeta}>{serverName || ""}</span>
                  </button>
                ))}
              </div>
            )}

          {showMessageToolbar && hasSearched && (
            <div className={styles.resultsMeta}>
              <span>
                {totalCount > 0
                  ? t("chat.popups.messageSearch.found", { count: totalCount })
                  : t("chat.popups.messageSearch.none")}
              </span>
            </div>
          )}

          <div className={styles.results}>
            {showQuickSwitch && quickSwitch.kind === "@" && (
              <>
                <div className={styles.quickSwitchSectionTitle}>
                  {t("chat.popups.messageSearch.quickSwitchDmUsers")}
                </div>
                {dmMatches.length === 0 ? (
                  <div className={styles.quickSwitchEmpty}>
                    {t("chat.popups.messageSearch.quickSwitchEmpty")}
                  </div>
                ) : (
                  dmMatches.map((p) => (
                    <button
                      key={p._id}
                      type="button"
                      className={styles.quickSwitchRow}
                      onClick={() => {
                        onQuickSwitchDm?.(p._id);
                      }}
                    >
                      {p.avatarUrl ? (
                        <img className={styles.quickSwitchAvatar} src={p.avatarUrl} alt="" />
                      ) : (
                        <div className={styles.quickSwitchAvatarPlaceholder}>
                          {(p.displayName || p.username || "?").charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span className={styles.quickSwitchMain}>
                        {p.displayName || p.username || p._id}
                      </span>
                      <span className={styles.quickSwitchMeta}>{p.username || p._id}</span>
                    </button>
                  ))
                )}
              </>
            )}

            {showQuickSwitch && quickSwitch.kind === "#" && (
              <>
                <div className={styles.quickSwitchSectionTitle}>
                  {t("chat.popups.messageSearch.quickSwitchTextChannels")}
                </div>
                {textChannelMatches.length === 0 ? (
                  <div className={styles.quickSwitchEmpty}>
                    {t("chat.popups.messageSearch.quickSwitchEmpty")}
                  </div>
                ) : (
                  textChannelMatches.map((row) => (
                    <button
                      key={`${row.serverId}-${row.ch._id}`}
                      type="button"
                      className={styles.quickSwitchRow}
                      onClick={() => {
                        onQuickSwitchChannel?.(row.serverId, row.ch._id);
                      }}
                    >
                      <span className={styles.quickSwitchGlyph}>#</span>
                      <span className={styles.quickSwitchMain}>{row.displayName}</span>
                      <span className={styles.quickSwitchMeta}>{row.serverName}</span>
                    </button>
                  ))
                )}
              </>
            )}

            {showQuickSwitch && quickSwitch.kind === "!" && (
              <>
                <div className={styles.quickSwitchSectionTitle}>
                  {t("chat.popups.messageSearch.quickSwitchVoiceChannels")}
                </div>
                {voiceChannelMatches.length === 0 ? (
                  <div className={styles.quickSwitchEmpty}>
                    {t("chat.popups.messageSearch.quickSwitchEmpty")}
                  </div>
                ) : (
                  voiceChannelMatches.map((row) => (
                    <button
                      key={`${row.serverId}-${row.ch._id}`}
                      type="button"
                      className={styles.quickSwitchRow}
                      onClick={() => {
                        onQuickSwitchChannel?.(row.serverId, row.ch._id);
                      }}
                    >
                      <span className={styles.quickSwitchGlyph} aria-hidden>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                          <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
                        </svg>
                      </span>
                      <span className={styles.quickSwitchMain}>{row.displayName}</span>
                      <span className={styles.quickSwitchMeta}>{row.serverName}</span>
                    </button>
                  ))
                )}
              </>
            )}

            {showQuickSwitch && quickSwitch.kind === "*" && (
              <>
                <div className={styles.quickSwitchSectionTitle}>
                  {t("chat.popups.messageSearch.quickSwitchServers")}
                </div>
                {serverMatches.length === 0 ? (
                  <div className={styles.quickSwitchEmpty}>
                    {t("chat.popups.messageSearch.quickSwitchEmpty")}
                  </div>
                ) : (
                  serverMatches.map((s) => (
                    <button
                      key={s._id}
                      type="button"
                      className={styles.quickSwitchRow}
                      onClick={() => {
                        onQuickSwitchServer?.(s._id);
                      }}
                    >
                      <span className={styles.quickSwitchGlyph} aria-hidden>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                          <rect x="3" y="3" width="8" height="8" rx="1" />
                          <rect x="13" y="3" width="8" height="8" rx="1" />
                          <rect x="3" y="13" width="8" height="8" rx="1" />
                          <rect x="13" y="13" width="8" height="8" rx="1" />
                        </svg>
                      </span>
                      <span className={styles.quickSwitchMain}>{s.name}</span>
                    </button>
                  ))
                )}
              </>
            )}

            {!showQuickSwitch && loading && results.length === 0 ? (
              <div className={styles.loadingState}>
                <div className={styles.spinner} />
                <span>{t("chat.popups.messageSearch.searching")}</span>
              </div>
            ) : !showQuickSwitch && hasSearched && results.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.4">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                </div>
                <div className={styles.emptyText}>{t("chat.popups.messageSearch.empty")}</div>
                <div className={styles.emptyHint}>{t("chat.popups.messageSearch.emptyHint")}</div>
              </div>
            ) : !showQuickSwitch ? (
              <>
                {results.map((msg: any) => {
                  const sender = msg.senderId || {};
                  const senderName =
                    sender.displayName || sender.username || sender.email || "?";
                  const avatarUrl = sender.avatarUrl;
                  const channelInfo =
                    typeof msg.channelId === "object" ? msg.channelId : null;

                  return (
                    <div
                      key={msg._id}
                      className={styles.resultItem}
                      onClick={() => {
                        const chId = channelInfo?._id || msg.channelId;
                        const cid =
                          typeof chId === "string"
                            ? chId
                            : chId?.toString?.() ?? undefined;
                        if (mode === "server" && serverId && cid && serverName) {
                          saveRecent(serverId, {
                            channelId: cid,
                            channelName: channelInfo?.name || "",
                            serverName,
                          });
                          setRecent(loadRecent(serverId));
                        }
                        onResultClick?.(
                          msg._id,
                          typeof cid === "string" ? cid : undefined,
                        );
                      }}
                    >
                      <div className={styles.resultHeader}>
                        {avatarUrl ? (
                          <img className={styles.resultAvatar} src={avatarUrl} alt="" />
                        ) : (
                          <div className={styles.resultAvatarPlaceholder}>
                            {senderName.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <span className={styles.resultSender}>{senderName}</span>
                        <span className={styles.resultTime}>{formatTime(msg.createdAt)}</span>
                        {channelInfo && (
                          <span className={styles.resultChannel}>
                            #{translateChannelName(channelInfo.name, language)}
                          </span>
                        )}
                      </div>
                      <div className={styles.resultContent}>
                        {highlightContent(msg.content || "", highlightTerms)}
                      </div>
                      {msg.attachments && msg.attachments.length > 0 && (
                        <div className={styles.resultAttachments}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                          </svg>
                          {t("chat.popups.messageSearch.attachments", {
                            count: msg.attachments.length,
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}

                {results.length < totalCount && (
                  <div className={styles.loadMore}>
                    <button
                      type="button"
                      className={styles.loadMoreBtn}
                      onClick={handleLoadMore}
                      disabled={loading}
                    >
                      {loading
                        ? t("chat.popups.messageSearch.loadingMore")
                        : t("chat.popups.messageSearch.loadMore", {
                            count: totalCount - results.length,
                          })}
                    </button>
                  </div>
                )}
              </>
            ) : null}
          </div>

          <div className={styles.footerTip}>
            <span className={styles.footerTipLabel}>
              {t("chat.popups.messageSearch.proTipLabel")}
            </span>
            <span className={styles.footerTipText}>
              {t(`chat.popups.messageSearch.${footerHint.bodyKey}`)}
            </span>
            {footerHint.showKbds ? (
              <span className={styles.kbdGroup}>
                <kbd className={styles.kbd}>@</kbd>
                <kbd className={styles.kbd}>#</kbd>
                <kbd className={styles.kbd}>!</kbd>
                {footerHint.showStar ? <kbd className={styles.kbd}>*</kbd> : null}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );

  if (typeof window === "undefined") return null;
  return createPortal(panelContent, document.body);
}
