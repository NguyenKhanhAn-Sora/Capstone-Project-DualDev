"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./ConversationDetailsPanel.module.css";
import { useLanguage } from "@/component/language-provider";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DetailsPanelMessage {
  id: string;
  text: string;
  senderId: string;
  senderDisplayName?: string;
  senderName?: string;
  timestamp: Date | string;
  attachments?: string[];
}

export interface DetailsPanelFile {
  url: string;
  name: string;
  timestamp: Date | string;
}

export interface DetailsPanelPinnedItem {
  id: string;
  text: string;
  senderDisplayName?: string;
  senderName?: string;
  timestamp: Date | string;
}

export interface ConversationDetailsPanelProps {
  open: boolean;
  onClose: () => void;
  /** "dm" or "channel" */
  type: "dm" | "channel";
  name: string;
  avatarUrl?: string;
  /** All messages in the current conversation (for media/file scanning) */
  messages: DetailsPanelMessage[];
  /** Async loader for pinned messages */
  loadPinnedMessages: () => Promise<DetailsPanelPinnedItem[]>;
  /** Called when user clicks a search result or pinned message to jump to it */
  onJumpToMessage: (messageId: string) => void;
  /** Called when user clicks a media item → open full-screen viewer */
  onOpenMedia: (url: string) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const IMAGE_RE = /📷 \[Image\]: (https?:\/\/[^\s]+)/g;
const VIDEO_RE = /🎬 \[Video\]: (https?:\/\/[^\s]+)/g;
const PLAIN_IMG_RE = /^https?:\/\/[^\s]+\.(jpe?g|png|webp|gif)(\?[^\s]*)?$/i;
const PLAIN_VID_RE = /^https?:\/\/[^\s]+\.(mp4|webm|mov)(\?[^\s]*)?$/i;
const FILE_LINK_RE = /https?:\/\/[^\s]+\/[^\s/]+\.(pdf|doc[x]?|xls[x]?|ppt[x]?|zip|rar|7z|txt|csv)/gi;

function toHttps(url: string): string {
  return url.startsWith("http://") ? "https://" + url.slice(7) : url;
}

interface MediaItem {
  url: string;
  type: "image" | "video";
  timestamp: Date;
}

interface FileItem {
  url: string;
  name: string;
  timestamp: Date;
}

function extractMedia(messages: DetailsPanelMessage[]): MediaItem[] {
  const seen = new Set<string>();
  const items: MediaItem[] = [];

  for (const msg of messages) {
    const ts = msg.timestamp instanceof Date ? msg.timestamp : new Date(msg.timestamp);
    const text = msg.text || "";

    const push = (url: string, type: "image" | "video") => {
      const safe = toHttps(url.trim());
      if (!safe || seen.has(safe)) return;
      seen.add(safe);
      items.push({ url: safe, type, timestamp: ts });
    };

    for (const m of text.matchAll(IMAGE_RE)) push(m[1], "image");
    for (const m of text.matchAll(VIDEO_RE)) push(m[1], "video");

    const trimmed = text.trim();
    if (PLAIN_IMG_RE.test(trimmed)) push(trimmed, "image");
    else if (PLAIN_VID_RE.test(trimmed)) push(trimmed, "video");

    if (msg.attachments) {
      for (const att of msg.attachments) {
        const a = att.trim();
        if (!a) continue;
        if (PLAIN_VID_RE.test(a)) push(a, "video");
        else if (a.startsWith("http")) push(a, "image");
      }
    }
  }

  return items.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}

function extractFiles(messages: DetailsPanelMessage[]): FileItem[] {
  const seen = new Set<string>();
  const items: FileItem[] = [];

  for (const msg of messages) {
    const ts = msg.timestamp instanceof Date ? msg.timestamp : new Date(msg.timestamp);
    const text = msg.text || "";
    for (const m of text.matchAll(FILE_LINK_RE)) {
      const url = toHttps(m[0]);
      if (seen.has(url)) continue;
      seen.add(url);
      const name = decodeURIComponent(url.split("/").pop() || url);
      items.push({ url, name, timestamp: ts });
    }
    if (msg.attachments) {
      for (const att of msg.attachments) {
        const a = att.trim();
        if (!a || seen.has(a)) continue;
        if (FILE_LINK_RE.test(a)) {
          seen.add(a);
          const name = decodeURIComponent(a.split("/").pop() || a);
          items.push({ url: toHttps(a), name, timestamp: ts });
        }
      }
    }
  }

  return items.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}

function formatDate(date: Date, todayLabel: string, yesterdayLabel: string, lang: string): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  if (diff < 86400000) return todayLabel;
  if (diff < 172800000) return yesterdayLabel;
  const locale = lang === "vi" ? "vi-VN" : lang === "ja" ? "ja-JP" : lang === "zh" ? "zh-CN" : "en-US";
  return date.toLocaleDateString(locale);
}

function formatDateTime(d: Date | string, lang: string): string {
  const dt = d instanceof Date ? d : new Date(d);
  const locale = lang === "vi" ? "vi-VN" : lang === "ja" ? "ja-JP" : lang === "zh" ? "zh-CN" : "en-US";
  return dt.toLocaleString(locale, { dateStyle: "short", timeStyle: "short" });
}

function groupByDate<T extends { timestamp: Date }>(
  items: T[],
  labelFn: (d: Date) => string = (d) => d.toLocaleDateString(),
): Array<{ label: string; items: T[] }> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const label = labelFn(item.timestamp);
    const arr = map.get(label) ?? [];
    arr.push(item);
    map.set(label, arr);
  }
  return Array.from(map.entries()).map(([label, items]) => ({ label, items }));
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionToggle({
  label,
  open,
  onToggle,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button type="button" className={styles.sectionHeader} onClick={onToggle}>
      <span>{label}</span>
      <svg
        className={`${styles.sectionChevron} ${open ? styles.open : ""}`}
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const MEDIA_PAGE_SIZE = 18;
const FILE_PAGE_SIZE = 10;

export function ConversationDetailsPanel({
  open,
  onClose,
  name,
  avatarUrl,
  messages,
  loadPinnedMessages,
  onJumpToMessage,
  onOpenMedia,
}: ConversationDetailsPanelProps) {
  const { t, language } = useLanguage();
  const cd = (key: string, vars?: Record<string, string | number>) => {
    let s: string = (t as any)(`chat.conversationDetails.${key}`) ?? key;
    if (vars) Object.entries(vars).forEach(([k, v]) => { s = s.replace(`{${k}}`, String(v)); });
    return s;
  };

  // ── Section open states
  const [searchOpen, setSearchOpen] = useState(true);
  const [pinnedOpen, setPinnedOpen] = useState(true);
  const [mediaOpen, setMediaOpen] = useState(true);
  const [filesOpen, setFilesOpen] = useState(false);

  // ── Search
  const [searchQuery, setSearchQuery] = useState("");
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return messages
      .filter((m) => m.text && m.text.toLowerCase().includes(q))
      .slice(0, 20);
  }, [searchQuery, messages]);

  function highlightText(text: string, query: string): React.ReactNode {
    if (!query.trim()) return text;
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return text.slice(0, 80);
    const start = Math.max(0, idx - 20);
    const pre = text.slice(start, idx);
    const match = text.slice(idx, idx + query.length);
    const post = text.slice(idx + query.length, idx + query.length + 40);
    return (
      <>
        {start > 0 && "…"}
        {pre}
        <mark>{match}</mark>
        {post}
        {post.length === 40 && "…"}
      </>
    );
  }

  // ── Pinned messages
  const [pinnedItems, setPinnedItems] = useState<DetailsPanelPinnedItem[]>([]);
  const [pinnedLoading, setPinnedLoading] = useState(false);
  const pinnedLoadedRef = useRef(false);

  const fetchPinned = useCallback(async () => {
    if (pinnedLoadedRef.current) return;
    pinnedLoadedRef.current = true;
    setPinnedLoading(true);
    try {
      const items = await loadPinnedMessages();
      setPinnedItems(items);
    } catch {
      setPinnedItems([]);
    } finally {
      setPinnedLoading(false);
    }
  }, [loadPinnedMessages]);

  // Reset when conversation changes
  useEffect(() => {
    pinnedLoadedRef.current = false;
    setPinnedItems([]);
  }, [messages]);

  useEffect(() => {
    if (open && pinnedOpen) fetchPinned();
  }, [open, pinnedOpen, fetchPinned]);

  // ── Shared media
  const allMedia = useMemo(() => extractMedia(messages), [messages]);
  const [mediaPage, setMediaPage] = useState(1);
  const visibleMedia = allMedia.slice(0, mediaPage * MEDIA_PAGE_SIZE);
  const todayLabel = cd("today");
  const yesterdayLabel = cd("yesterday");
  const mediaGroups = useMemo(
    () => groupByDate(visibleMedia, (d) => formatDate(d, todayLabel, yesterdayLabel, language)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visibleMedia, todayLabel, yesterdayLabel, language],
  );

  // ── Shared files
  const [fileSearch, setFileSearch] = useState("");
  const allFiles = useMemo(() => extractFiles(messages), [messages]);
  const [filePage, setFilePage] = useState(1);
  const filteredFiles = useMemo(() => {
    const q = fileSearch.trim().toLowerCase();
    return q ? allFiles.filter((f) => f.name.toLowerCase().includes(q)) : allFiles;
  }, [allFiles, fileSearch]);
  const visibleFiles = filteredFiles.slice(0, filePage * FILE_PAGE_SIZE);

  // Reset pagination when conversation changes
  useEffect(() => {
    setMediaPage(1);
    setFilePage(1);
  }, [messages]);

  // ── Avatar
  const initials = name ? name.trim().charAt(0).toUpperCase() : "?";

  return (
    <aside className={`${styles.panel} ${open ? "" : styles.collapsed}`} aria-label={cd("title")}>
      {/* Header */}
      <div className={styles.panelHeader} style={{ position: "relative" }}>
        <button type="button" className={styles.panelCloseBtn} onClick={onClose} title={cd("close")}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div className={styles.avatarWrap}>
          {avatarUrl ? (
            <img src={toHttps(avatarUrl)} alt={name} className={styles.avatarImg} />
          ) : (
            <div className={styles.avatarFallback}>{initials}</div>
          )}
        </div>

        <p className={styles.panelName}>{name}</p>

        <span className={styles.encryptedBadge}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          {cd("encrypted")}
        </span>
      </div>

      {/* Scrollable body */}
      <div className={styles.panelBody}>

        {/* ── Search ── */}
        <div className={styles.section}>
          <SectionToggle label={cd("search")} open={searchOpen} onToggle={() => setSearchOpen((v) => !v)} />
          {searchOpen && (
            <div className={styles.sectionContent}>
              <div className={styles.searchInputWrap}>
                <svg className={styles.searchIcon} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  className={styles.searchInput}
                  placeholder={cd("searchPlaceholder")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              {searchQuery.trim() && (
                <div className={styles.searchResults}>
                  {searchResults.length === 0 ? (
                    <p className={styles.noResults}>{cd("noResults")}</p>
                  ) : (
                    searchResults.map((msg) => (
                      <div
                        key={msg.id}
                        className={styles.searchResultItem}
                        onClick={() => onJumpToMessage(msg.id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => e.key === "Enter" && onJumpToMessage(msg.id)}
                      >
                        <p className={styles.searchResultSender}>
                          {msg.senderDisplayName || msg.senderName || "Người dùng"}
                        </p>
                        <p className={styles.searchResultText}>
                          {highlightText(msg.text, searchQuery.trim())}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Pinned Messages ── */}
        <div className={styles.section}>
          <SectionToggle
            label={`${cd("pinnedMessages")}${pinnedItems.length > 0 ? ` (${pinnedItems.length})` : ""}`}
            open={pinnedOpen}
            onToggle={() => {
              setPinnedOpen((v) => !v);
              if (!pinnedOpen) fetchPinned();
            }}
          />
          {pinnedOpen && (
            <div className={styles.sectionContent}>
              {pinnedLoading ? (
                <div className={styles.spinner}><div className={styles.spinnerDot} /></div>
              ) : pinnedItems.length === 0 ? (
                <p className={styles.emptyNote}>{cd("noPinned")}</p>
              ) : (
                <div className={styles.pinnedList}>
                  {pinnedItems.map((item) => (
                    <div
                      key={item.id}
                      className={styles.pinnedItem}
                      onClick={() => onJumpToMessage(item.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === "Enter" && onJumpToMessage(item.id)}
                    >
                      <p className={styles.pinnedItemSender}>
                          {item.senderDisplayName || item.senderName || "—"}
                      </p>
                      <p className={styles.pinnedItemText}>{item.text.slice(0, 120)}</p>
                      <p className={styles.pinnedItemTime}>{formatDateTime(item.timestamp, language)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Shared Media ── */}
        <div className={styles.section}>
          <SectionToggle
            label={`${cd("sharedMedia")}${allMedia.length > 0 ? ` (${allMedia.length})` : ""}`}
            open={mediaOpen}
            onToggle={() => setMediaOpen((v) => !v)}
          />
          {mediaOpen && (
            <div className={styles.sectionContent}>
              {allMedia.length === 0 ? (
                <p className={styles.emptyNote}>{cd("noMedia")}</p>
              ) : (
                <>
                  <div className={styles.mediaGrid}>
                    {mediaGroups.map((group) => (
                      <React.Fragment key={group.label}>
                        <p className={styles.mediaDateLabel}>{group.label}</p>
                        {group.items.map((item, i) => (
                          <div
                            key={`${item.url}-${i}`}
                            className={styles.mediaThumbnail}
                            onClick={() => onOpenMedia(item.url)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => e.key === "Enter" && onOpenMedia(item.url)}
                            title={cd(item.type === "video" ? "sharedMedia" : "sharedMedia")}
                          >
                            {item.type === "image" ? (
                              <img src={item.url} alt="" loading="lazy" />
                            ) : (
                              <>
                                <img
                                  src={`${item.url.includes("/upload/") ? item.url.replace("/upload/", "/upload/so_0,w_200,h_200,c_fill/") : item.url}`}
                                  alt=""
                                  loading="lazy"
                                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                                />
                                <div className={styles.videoThumbBadge}>
                                  <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                                    <polygon points="5 3 19 12 5 21 5 3" />
                                  </svg>
                                </div>
                              </>
                            )}
                          </div>
                        ))}
                      </React.Fragment>
                    ))}
                  </div>

                  {visibleMedia.length < allMedia.length && (
                    <button
                      type="button"
                      className={styles.loadMoreBtn}
                      onClick={() => setMediaPage((p) => p + 1)}
                    >
                      {cd("loadMore", { n: allMedia.length - visibleMedia.length })}
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* ── Shared Files ── */}
        <div className={styles.section}>
          <SectionToggle
            label={`${cd("sharedFiles")}${allFiles.length > 0 ? ` (${allFiles.length})` : ""}`}
            open={filesOpen}
            onToggle={() => setFilesOpen((v) => !v)}
          />
          {filesOpen && (
            <div className={styles.sectionContent}>
              {allFiles.length > 0 && (
                <div className={`${styles.fileSearchWrap} ${styles.searchInputWrap}`}>
                  <svg className={styles.searchIcon} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <input
                    type="text"
                    className={styles.searchInput}
                    placeholder={cd("searchFiles")}
                    value={fileSearch}
                    onChange={(e) => setFileSearch(e.target.value)}
                  />
                </div>
              )}

              {filteredFiles.length === 0 ? (
                <p className={styles.emptyNote}>
                  {fileSearch.trim() ? cd("noFilesFound") : cd("noFiles")}
                </p>
              ) : (
                <div className={styles.fileList}>
                  {visibleFiles.map((file, i) => (
                    <div key={`${file.url}-${i}`} className={styles.fileItem}>
                      <svg className={styles.fileIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                      <div className={styles.fileInfo}>
                        <p className={styles.fileName}>{file.name}</p>
                        <p className={styles.fileDate}>{formatDateTime(file.timestamp, language)}</p>
                      </div>
                      <a
                        href={file.url}
                        download={file.name}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.fileDownloadBtn}
                        title={cd("download")}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="7 10 12 15 17 10" />
                          <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                      </a>
                    </div>
                  ))}

                  {visibleFiles.length < filteredFiles.length && (
                    <button
                      type="button"
                      className={styles.loadMoreBtn}
                      onClick={() => setFilePage((p) => p + 1)}
                    >
                      Xem thêm ({filteredFiles.length - visibleFiles.length} file còn lại)
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </aside>
  );
}
