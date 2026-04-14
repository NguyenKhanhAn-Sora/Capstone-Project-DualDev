"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import styles from "./MessageSearchPanel.module.css";
import * as serversApi from "@/lib/servers-api";
import { searchDirectMessages } from "@/lib/api";
import { useLanguage, localeTagForLanguage } from "@/component/language-provider";

interface MessageSearchPanelProps {
  isOpen: boolean;
  onClose: () => void;
  mode: "server" | "dm";
  serverId?: string;
  channelId?: string;
  channels?: Array<{ _id: string; name: string; type: string }>;
  members?: Array<{ userId: string; displayName?: string; username?: string; avatarUrl?: string }>;
  dmPartnerId?: string;
  dmPartnerName?: string;
  onResultClick?: (messageId: string, channelId?: string) => void;
}

function highlightText(text: string, query: string): React.ReactNode {
  if (!query || !query.trim()) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "gi");
  const parts = text.split(regex);
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase() ? (
      <span key={i} className={styles.highlight}>{part}</span>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    ),
  );
}

export default function MessageSearchPanel({
  isOpen,
  onClose,
  mode,
  serverId,
  channelId,
  channels = [],
  members = [],
  dmPartnerId,
  dmPartnerName,
  onResultClick,
}: MessageSearchPanelProps) {
  const { t, language } = useLanguage();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [offset, setOffset] = useState(0);
  const LIMIT = 25;

  const [filterChannelId, setFilterChannelId] = useState<string>("");
  const [filterSenderId, setFilterSenderId] = useState<string>("");
  const [filterBefore, setFilterBefore] = useState<string>("");
  const [filterAfter, setFilterAfter] = useState<string>("");
  const [filterHasFile, setFilterHasFile] = useState(false);
  const [showDateFilters, setShowDateFilters] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
    if (!isOpen) {
      setQuery("");
      setResults([]);
      setTotalCount(0);
      setHasSearched(false);
      setOffset(0);
      setFilterChannelId("");
      setFilterSenderId("");
      setFilterBefore("");
      setFilterAfter("");
      setFilterHasFile(false);
      setShowDateFilters(false);
    }
  }, [isOpen]);

  const doSearch = useCallback(
    async (q: string, currentOffset: number, append: boolean) => {
      if (!q.trim() && !filterChannelId && !filterSenderId && !filterHasFile) return;
      setLoading(true);
      try {
        if (mode === "server" && serverId) {
          const res = await serversApi.searchMessages({
            q: q.trim() || undefined,
            serverId,
            channelId: filterChannelId || channelId || undefined,
            senderId: filterSenderId || undefined,
            before: filterBefore || undefined,
            after: filterAfter || undefined,
            hasFile: filterHasFile || undefined,
            limit: LIMIT,
            offset: currentOffset,
          });
          if (append) {
            setResults((prev) => [...prev, ...res.results]);
          } else {
            setResults(res.results);
          }
          setTotalCount(res.totalCount);
        } else if (mode === "dm") {
          const token = localStorage.getItem("accessToken") || localStorage.getItem("token") || "";
          const res = await searchDirectMessages({
            token,
            q: q.trim() || undefined,
            userId: dmPartnerId || undefined,
            before: filterBefore || undefined,
            after: filterAfter || undefined,
            hasFile: filterHasFile || undefined,
            limit: LIMIT,
            offset: currentOffset,
          });
          if (append) {
            setResults((prev) => [...prev, ...res.results]);
          } else {
            setResults(res.results);
          }
          setTotalCount(res.totalCount);
        }
        setHasSearched(true);
      } catch (err) {
        console.error("Search error:", err);
      } finally {
        setLoading(false);
      }
    },
    [mode, serverId, channelId, filterChannelId, filterSenderId, filterBefore, filterAfter, filterHasFile, dmPartnerId],
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim() && !filterChannelId && !filterSenderId && !filterHasFile) {
      setResults([]);
      setTotalCount(0);
      setHasSearched(false);
      return;
    }
    debounceRef.current = setTimeout(() => {
      setOffset(0);
      doSearch(query, 0, false);
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, filterChannelId, filterSenderId, filterBefore, filterAfter, filterHasFile, doSearch]);

  const handleLoadMore = () => {
    const newOffset = offset + LIMIT;
    setOffset(newOffset);
    doSearch(query, newOffset, true);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  };

  const clearAllFilters = () => {
    setFilterChannelId("");
    setFilterSenderId("");
    setFilterBefore("");
    setFilterAfter("");
    setFilterHasFile(false);
    setShowDateFilters(false);
  };

  const hasActiveFilters = filterChannelId || filterSenderId || filterBefore || filterAfter || filterHasFile;

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
      if (diffDays < 7) return t("chat.popups.messageSearch.daysAgo", { n: diffDays });
      return d.toLocaleDateString(localeTagForLanguage(language));
    },
    [t, language],
  );

  if (!isOpen) return null;

  const panelContent = (
    <>
      <div className={styles.overlay} onClick={onClose} />
      <div className={styles.panel} onKeyDown={handleKeyDown}>
        <div className={styles.header}>
          <h3 className={styles.title}>
            <span className={styles.titleIcon}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </span>
            {t("chat.popups.messageSearch.title")}
          </h3>
          <button className={styles.closeBtn} onClick={onClose} title={t("chat.popups.closeAria")}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className={styles.searchSection}>
          <div className={styles.searchInputRow}>
            <span className={styles.searchIcon}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </span>
            <input
              ref={inputRef}
              className={styles.searchInput}
              type="text"
              placeholder={
                mode === "dm"
                  ? t("chat.popups.messageSearch.placeholderDm", {
                      name: dmPartnerName || "...",
                    })
                  : t("chat.popups.messageSearch.placeholderServer")
              }
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </div>

          <div className={styles.filters}>
            {mode === "server" && channels.length > 0 && (
              <select
                className={`${styles.filterChip} ${filterChannelId ? styles.filterChipActive : ""}`}
                value={filterChannelId}
                onChange={(e) => setFilterChannelId(e.target.value)}
              >
                <option value="">{t("chat.popups.messageSearch.allChannels")}</option>
                {channels.filter((c) => c.type === "text").map((ch) => (
                  <option key={ch._id} value={ch._id}>#{ch.name}</option>
                ))}
              </select>
            )}

            {mode === "server" && members.length > 0 && (
              <select
                className={`${styles.filterChip} ${filterSenderId ? styles.filterChipActive : ""}`}
                value={filterSenderId}
                onChange={(e) => setFilterSenderId(e.target.value)}
              >
                <option value="">{t("chat.popups.messageSearch.allUsers")}</option>
                {members.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.displayName || m.username || m.userId}
                  </option>
                ))}
              </select>
            )}

            <button
              className={`${styles.filterChip} ${filterHasFile ? styles.filterChipActive : ""}`}
              onClick={() => setFilterHasFile(!filterHasFile)}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
              {t("chat.popups.messageSearch.hasFile")}
            </button>

            <button
              className={`${styles.filterChip} ${showDateFilters ? styles.filterChipActive : ""}`}
              onClick={() => setShowDateFilters(!showDateFilters)}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              {t("chat.popups.messageSearch.time")}
            </button>
          </div>

          {showDateFilters && (
            <div className={styles.dateInputRow}>
              <input
                type="date"
                className={styles.dateInput}
                value={filterAfter}
                onChange={(e) => setFilterAfter(e.target.value)}
                placeholder={t("chat.popups.messageSearch.fromDate")}
                title={t("chat.popups.messageSearch.fromDate")}
              />
              <input
                type="date"
                className={styles.dateInput}
                value={filterBefore}
                onChange={(e) => setFilterBefore(e.target.value)}
                placeholder={t("chat.popups.messageSearch.toDate")}
                title={t("chat.popups.messageSearch.toDate")}
              />
            </div>
          )}
        </div>

        {hasSearched && (
          <div className={styles.resultsMeta}>
            <span>
              {totalCount > 0
                ? t("chat.popups.messageSearch.found", { count: totalCount })
                : t("chat.popups.messageSearch.none")}
            </span>
            {hasActiveFilters && (
              <button className={styles.clearFilters} onClick={clearAllFilters}>
                {t("chat.popups.messageSearch.clearFilters")}
              </button>
            )}
          </div>
        )}

        <div className={styles.results}>
          {loading && results.length === 0 ? (
            <div className={styles.loadingState}>
              <div className={styles.spinner} />
              <span>{t("chat.popups.messageSearch.searching")}</span>
            </div>
          ) : hasSearched && results.length === 0 ? (
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
          ) : (
            <>
              {results.map((msg: any) => {
                const sender = msg.senderId || {};
                const senderName = sender.displayName || sender.username || sender.email || "?";
                const avatarUrl = sender.avatarUrl;
                const channelInfo = typeof msg.channelId === "object" ? msg.channelId : null;

                return (
                  <div
                    key={msg._id}
                    className={styles.resultItem}
                    onClick={() => {
                      const chId = channelInfo?._id || msg.channelId;
                      onResultClick?.(msg._id, typeof chId === "string" ? chId : undefined);
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
                        <span className={styles.resultChannel}>#{channelInfo.name}</span>
                      )}
                    </div>
                    <div className={styles.resultContent}>
                      {highlightText(msg.content || "", query)}
                    </div>
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className={styles.resultAttachments}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                        </svg>
                        {t("chat.popups.messageSearch.attachments", { count: msg.attachments.length })}
                      </div>
                    )}
                  </div>
                );
              })}

              {results.length < totalCount && (
                <div className={styles.loadMore}>
                  <button
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
          )}
        </div>
      </div>
    </>
  );

  if (typeof window === "undefined") return null;
  return createPortal(panelContent, document.body);
}



