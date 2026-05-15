"use client";

import Image from "next/image";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent,
} from "react";
import { useRouter } from "next/navigation";
import styles from "./search-overlay.module.css";
import {
  addSearchHistory,
  clearSearchHistory,
  deleteSearchHistoryItem,
  fetchSearchHistory,
  searchPosts,
  searchProfiles,
  searchSuggest,
  suggestHashtags,
  type FeedItem,
  type ProfileSearchItem,
  type SearchHistoryItem,
  type SearchSuggestionItem,
} from "@/lib/api";
import { getStoredAccessToken } from "@/lib/auth";
import { useTranslations } from "next-intl";

type Tab = "all" | "people" | "hashtags" | "posts" | "reels";

const DEFAULT_AVATAR_URL =
  "https://res.cloudinary.com/doicocgeo/image/upload/v1765850274/user-avatar-default_gfx5bs.jpg";

function IconClose() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M18 6 6 18M6 6l12 12"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconClear() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path
        d="M18 6 6 18M6 6l12 12"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M7 7h10M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10 11v7m4-7v7M6 7l1 14h10l1-14"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function HashTile() {
  return (
    <div className={styles.hashTile} aria-hidden>
      #
    </div>
  );
}

function PersonTile() {
  return (
    <div className={styles.personTile} aria-hidden>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.8" />
        <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </div>
  );
}

function QueryTile() {
  return (
    <div className={styles.queryTile} aria-hidden>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
        <path d="m16.5 16.5 3.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </div>
  );
}

function toCloudinaryVideoThumbnail(url: string): string {
  const raw = (url ?? "").trim();
  if (!raw) return "";

  const parts = raw.split("?");
  const base = parts[0];
  const query = parts[1];

  const lower = base.toLowerCase();
  const isVideoExt = /\.(mp4|mov|webm|mkv)$/i.test(lower);
  const hasUpload = base.includes("/upload/");
  if (!isVideoExt || !hasUpload) return "";

  // Cloudinary supports extracting video frame thumbnails via `so_0` and `.jpg`.
  const withFrame = base.replace("/upload/", "/upload/so_0/");
  const jpg = withFrame.replace(/\.(mp4|mov|webm|mkv)$/i, ".jpg");
  return query ? `${jpg}?${query}` : jpg;
}

function PostTile(props: {
  mediaUrl: string;
  mediaType?: "image" | "video" | "";
}) {
  const mediaUrl = (props.mediaUrl ?? "").trim();
  const isVideo = props.mediaType === "video";
  const src = isVideo
    ? toCloudinaryVideoThumbnail(mediaUrl) || ""
    : mediaUrl || "";

  return (
    <div className={styles.postTile} aria-hidden>
      {src ? (
        <Image
          src={src}
          alt=""
          width={56}
          height={56}
          className={styles.postThumb}
        />
      ) : (
        <div className={styles.postGlyph}>
          <span>▦</span>
        </div>
      )}
      {isVideo ? <div className={styles.postPlay}>▶</div> : null}
    </div>
  );
}

function isTypingTarget(el: EventTarget | null) {
  const node = el as HTMLElement | null;
  if (!node) return false;
  const tag = node.tagName?.toLowerCase();
  return tag === "input" || tag === "textarea" || node.isContentEditable;
}

export default function SearchOverlay(props: {
  open: boolean;
  closing?: boolean;
  onClose: () => void;
}) {
  const { open, closing, onClose } = props;
  const t = useTranslations("search");
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [entered, setEntered] = useState(false);

  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState<string>("");
  const [history, setHistory] = useState<SearchHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [suggestItems, setSuggestItems] = useState<SearchSuggestionItem[]>([]);
  const [peopleItems, setPeopleItems] = useState<ProfileSearchItem[]>([]);
  const [hashtagItems, setHashtagItems] = useState<
    Array<{ id: string; name: string; usageCount: number }>
  >([]);
  const [postItems, setPostItems] = useState<FeedItem[]>([]);
  const [reelItems, setReelItems] = useState<FeedItem[]>([]);

  const normalized = useMemo(() => query.trim(), [query]);
  const cleanedForApi = useMemo(() => {
    if (!normalized) return "";
    if (normalized.startsWith("@")) return normalized.replace(/^@+/, "");
    if (normalized.startsWith("#")) return normalized.replace(/^#+/, "");
    return normalized;
  }, [normalized]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setEntered(false);
    const raf = window.requestAnimationFrame(() => setEntered(true));
    return () => window.cancelAnimationFrame(raf);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setError("");
    setLoading(false);
    setSuggestItems([]);
    setPeopleItems([]);
    setHashtagItems([]);
    setPostItems([]);
    setReelItems([]);
    setHistoryError("");

    const token = getStoredAccessToken();
    if (!token) {
      setHistory([]);
      return;
    }

    setHistoryLoading(true);
    fetchSearchHistory({ token })
      .then((res) => {
        setHistory(res.items ?? []);
      })
      .catch((err: any) => {
        setHistoryError(err?.message || t("recent.loadFailed"));
      })
      .finally(() => setHistoryLoading(false));

    setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        if (!isTypingTarget(e.target)) {
          e.preventDefault();
          inputRef.current?.focus();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;

    setError("");
    if (!normalized) {
      setLoading(false);
      setSuggestItems([]);
      setPeopleItems([]);
      setHashtagItems([]);
      setPostItems([]);
      setReelItems([]);
      return;
    }

    const token = getStoredAccessToken();
    if (!token) {
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");

      try {
        if (tab === "all") {
          const [s, p, r] = await Promise.all([
            searchSuggest({
              token,
              query: normalized,
              limit: 12,
              signal: controller.signal,
            }),
            searchPosts({
              token,
              query: normalized,
              limit: 6,
              page: 1,
              kinds: ["post"],
              signal: controller.signal,
            }),
            searchPosts({
              token,
              query: normalized,
              limit: 9,
              page: 1,
              kinds: ["reel"],
              signal: controller.signal,
            }),
          ]);
          setSuggestItems(s.items ?? []);
          setPostItems(p.items ?? []);
          setReelItems(r.items ?? []);
        } else if (tab === "people") {
          const res = await searchProfiles({
            token,
            query: cleanedForApi,
            limit: 15,
          });
          setPeopleItems(res.items ?? []);
        } else if (tab === "hashtags") {
          const res = await suggestHashtags({
            token,
            query: cleanedForApi,
            limit: 15,
            signal: controller.signal,
          });
          setHashtagItems(res.items ?? []);
        } else if (tab === "posts") {
          const res = await searchPosts({
            token,
            query: normalized,
            limit: 12,
            page: 1,
            kinds: ["post"],
            signal: controller.signal,
          });
          setPostItems(res.items ?? []);
        } else if (tab === "reels") {
          const res = await searchPosts({
            token,
            query: normalized,
            limit: 18,
            page: 1,
            kinds: ["reel"],
            signal: controller.signal,
          });
          setReelItems(res.items ?? []);
        }
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        setError(err?.message || t("status.searchFailed"));
      } finally {
        setLoading(false);
      }
    }, 220);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [open, normalized, tab, cleanedForApi]);

  const onPickHistory = async (item: SearchHistoryItem) => {
    if (item.kind === "profile" && item.refId) {
      setQuery("");
      router.push(`/profile/${encodeURIComponent(item.refId)}`);
      onClose();
      return;
    }
    if (item.kind === "hashtag" && item.refSlug) {
      setQuery("");
      router.push(`/hashtag/${encodeURIComponent(item.refSlug)}`);
      onClose();
      return;
    }
    if (item.kind === "post" && item.refId) {
      setQuery("");
      router.push(`/post/${encodeURIComponent(item.refId)}`);
      onClose();
      return;
    }

    if (item.kind === "reel" && item.refId) {
      setQuery("");
      router.push(`/reels/${encodeURIComponent(item.refId)}?single=1`);
      onClose();
      return;
    }

    // company/query: just restore query
    setQuery(item.label || "");
  };

  const addToHistory = async (
    payload: Parameters<typeof addSearchHistory>[0]["item"],
  ) => {
    const token = getStoredAccessToken();
    if (!token) return;
    try {
      const saved = await addSearchHistory({ token, item: payload });
      setHistory((prev) => {
        const next = [saved, ...prev.filter((x) => x.id !== saved.id)];
        return next.slice(0, 20);
      });
    } catch (_err) {}
  };

  const deleteHistory = async (id: string) => {
    const token = getStoredAccessToken();
    if (!token) return;
    setHistory((prev) => prev.filter((x) => x.id !== id));
    try {
      await deleteSearchHistoryItem({ token, id });
    } catch (_err) {
      // best-effort
    }
  };

  const clearAllHistory = async () => {
    const token = getStoredAccessToken();
    if (!token) return;
    setHistory([]);
    try {
      await clearSearchHistory({ token });
    } catch (_err) {}
  };

  const pickProfile = async (p: ProfileSearchItem) => {
    await addToHistory({
      kind: "profile",
      userId: p.userId,
      username: p.username,
      displayName: p.displayName,
      avatarUrl: p.avatarUrl,
    });
    setQuery("");
    router.push(`/profile/${encodeURIComponent(p.userId)}`);
    onClose();
  };

  const pickHashtag = async (tag: { name: string; usageCount?: number }) => {
    await addToHistory({ kind: "hashtag", tag: tag.name });
    setQuery("");
    router.push(`/hashtag/${encodeURIComponent(tag.name)}`);
    onClose();
  };

  const pickPost = async (post: FeedItem) => {
    const first = post.media?.[0];
    const mediaUrl = typeof first?.url === "string" ? first.url : "";
    const mediaType =
      first?.type === "video"
        ? "video"
        : first?.type === "image"
          ? "image"
          : "";
    await addToHistory({
      kind: "post",
      postId: post.id,
      content: post.content,
      mediaUrl,
      mediaType,
      authorUsername: post.authorUsername,
    });
    setQuery("");
    router.push(`/post/${encodeURIComponent(post.id)}`);
    onClose();
  };

  const pickReel = async (reel: FeedItem) => {
    const targetId = ((reel as any)?.repostOf as string) || reel.id;
    const first = reel.media?.[0];
    const mediaUrl = typeof first?.url === "string" ? first.url : "";
    const mediaType =
      first?.type === "video"
        ? "video"
        : first?.type === "image"
          ? "image"
          : "";
    await addToHistory({
      kind: "reel",
      postId: targetId,
      content: reel.content,
      mediaUrl,
      mediaType,
      authorUsername: reel.authorUsername,
    });
    setQuery("");
    router.push(`/reels/${encodeURIComponent(targetId)}?single=1`);
    onClose();
  };

  const groupedAll = useMemo(() => {
    const profiles = suggestItems.filter((x) => x.type === "profile") as Array<
      Extract<SearchSuggestionItem, { type: "profile" }>
    >;
    const hashtags = suggestItems.filter((x) => x.type === "hashtag") as Array<
      Extract<SearchSuggestionItem, { type: "hashtag" }>
    >;
    return { profiles, hashtags };
  }, [suggestItems]);

  const goSeeAll = (path: string) => {
    const q = normalized.trim();
    if (!q) {
      router.push(path);
      onClose();
      return;
    }
    router.push(`${path}?q=${encodeURIComponent(q)}`);
    onClose();
  };

  const handleReelEnter = (e: MouseEvent<HTMLVideoElement>) => {
    const el = e.currentTarget;
    el.currentTime = 0;
    void el.play().catch(() => undefined);
  };
  const handleReelLeave = (e: MouseEvent<HTMLVideoElement>) => {
    const el = e.currentTarget;
    el.pause();
    el.currentTime = 0;
  };

  const handleEnterToSearch = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    const trimmed = query.trim();
    if (!trimmed) return;
    e.preventDefault();
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
    onClose();
  };

  if (!open) return null;

  return (
    <div
      className={styles.backdrop}
      data-entered={entered ? "1" : "0"}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={styles.sheet}
        data-entered={entered ? "1" : "0"}
        data-closing={closing ? "1" : "0"}
      >
        <div className={styles.header}>
          <div className={styles.title}>{t("title")}</div>
          <button className={styles.close} onClick={onClose} aria-label={t("aria.close")}>
            <IconClose />
          </button>
        </div>

        <div className={styles.searchBar}>
          <div className={styles.inputWrap}>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleEnterToSearch}
              className={styles.input}
              placeholder={t("placeholder.all")}
              spellCheck={false}
            />
            {query.trim() ? (
              <button
                className={styles.clearInput}
                onClick={() => {
                  setQuery("");
                  setTimeout(() => inputRef.current?.focus(), 0);
                }}
                aria-label={t("aria.clearSearch")}
                type="button"
              >
                <IconClear />
              </button>
            ) : null}
          </div>
        </div>

        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${tab === "all" ? styles.tabActive : ""}`}
            onClick={() => setTab("all")}
          >
            {t("tabs.all")}
          </button>
          <button
            className={`${styles.tab} ${tab === "people" ? styles.tabActive : ""}`}
            onClick={() => setTab("people")}
          >
            {t("tabs.people")}
          </button>
          <button
            className={`${styles.tab} ${tab === "hashtags" ? styles.tabActive : ""}`}
            onClick={() => setTab("hashtags")}
          >
            {t("tabs.hashtags")}
          </button>
          <button
            className={`${styles.tab} ${tab === "posts" ? styles.tabActive : ""}`}
            onClick={() => setTab("posts")}
          >
            {t("tabs.posts")}
          </button>

          <button
            className={`${styles.tab} ${tab === "reels" ? styles.tabActive : ""}`}
            onClick={() => setTab("reels")}
          >
            {t("tabs.reels")}
          </button>
        </div>

        <div className={styles.body}>
          {!normalized ? (
            <>
              <div className={styles.sectionHeader}>
                <div className={styles.sectionTitle}>{t("recent.title")}</div>
                {history.length ? (
                  <button className={styles.ghostBtn} onClick={clearAllHistory}>
                    {t("recent.clearAll")}
                  </button>
                ) : null}
              </div>

              {historyLoading ? (
                <div className={styles.loading}>{t("recent.loading")}</div>
              ) : null}
              {historyError ? (
                <div className={styles.error}>{historyError}</div>
              ) : null}

              {!historyLoading && !historyError && !history.length ? (
                <div className={styles.muted}>{t("recent.empty")}</div>
              ) : null}

              {history.map((h) => (
                <div
                  key={h.id}
                  className={styles.row}
                  onClick={() => onPickHistory(h)}
                >
                  {h.kind === "hashtag" ? (
                    <HashTile />
                  ) : h.kind === "post" || h.kind === "reel" ? (
                    <PostTile
                      mediaUrl={h.imageUrl}
                      mediaType={h.mediaType || ""}
                    />
                  ) : h.kind === "profile" ? (
                    h.imageUrl ? (
                      <Image
                        src={h.imageUrl}
                        alt=""
                        width={48}
                        height={48}
                        className={styles.avatar}
                      />
                    ) : (
                      <PersonTile />
                    )
                  ) : (
                    <QueryTile />
                  )}

                  <div className={styles.meta}>
                    {h.kind === "post" || h.kind === "reel" ? (
                      <>
                        <div className={styles.postLabel}>
                          {(() => {
                            const raw = (h.label || "").trim();
                            const title =
                              raw === "Post" || raw === "Reel" ? "" : raw;
                            return title || t("noCaption");
                          })()}
                        </div>
                        <div className={styles.postSubtitle}>
                          {h.subtitle || ""}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className={styles.label}>{h.label}</div>
                        <div className={styles.subtitle}>{h.subtitle}</div>
                      </>
                    )}
                  </div>

                  <button
                    className={styles.delete}
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteHistory(h.id);
                    }}
                    aria-label={t("aria.remove")}
                  >
                    <IconTrash />
                  </button>
                </div>
              ))}
            </>
          ) : (
            <>
              {loading ? (
                <div className={styles.loading}>{t("status.searching")}</div>
              ) : null}
              {error ? <div className={styles.error}>{error}</div> : null}

              {tab === "all" ? (
                <>
                  {groupedAll.profiles.length ? (
                    <>
                      <div className={styles.sectionHeader}>
                        <div className={styles.sectionTitle}>{t("sections.people")}</div>
                        <button
                          type="button"
                          className={styles.ghostBtn}
                          onClick={() => goSeeAll("/search/people")}
                        >
                          {t("seeAll")}
                        </button>
                      </div>
                      {groupedAll.profiles.slice(0, 3).map((s) => (
                        <div
                          key={s.id}
                          className={styles.row}
                          onClick={() => pickProfile(s.data)}
                        >
                          <Image
                            src={s.imageUrl || DEFAULT_AVATAR_URL}
                            alt=""
                            width={42}
                            height={42}
                            className={styles.avatar}
                          />
                          <div className={styles.meta}>
                            <div className={styles.label}>{s.label}</div>
                            <div className={styles.subtitle}>{s.subtitle}</div>
                          </div>
                          <div />
                        </div>
                      ))}
                    </>
                  ) : null}

                  {groupedAll.hashtags.length ? (
                    <>
                      <div className={styles.sectionHeader}>
                        <div className={styles.sectionTitle}>{t("sections.hashtags")}</div>
                      </div>
                      {groupedAll.hashtags.slice(0, 3).map((s) => (
                        <div
                          key={s.id}
                          className={styles.row}
                          onClick={() =>
                            pickHashtag({
                              name: s.data.name,
                              usageCount: s.data.usageCount,
                            })
                          }
                        >
                          <HashTile />
                          <div className={styles.meta}>
                            <div className={styles.label}>{s.label}</div>
                            <div className={styles.subtitle}>{s.subtitle}</div>
                          </div>
                          <div />
                        </div>
                      ))}
                    </>
                  ) : null}

                  {postItems.length ? (
                    <>
                      <div className={styles.sectionHeader}>
                        <div className={styles.sectionTitle}>{t("sections.posts")}</div>
                        <button
                          type="button"
                          className={styles.ghostBtn}
                          onClick={() => goSeeAll("/search/post")}
                        >
                          {t("seeAll")}
                        </button>
                      </div>
                      {postItems.slice(0, 2).map((p) => (
                        <div
                          key={p.id}
                          className={styles.row}
                          onClick={() => pickPost(p)}
                        >
                          <PostTile
                            mediaUrl={p.media?.[0]?.url ?? ""}
                            mediaType={p.media?.[0]?.type ?? ""}
                          />
                          <div className={styles.meta}>
                            <div className={styles.postLabel}>
                              {(p.content || "").trim().slice(0, 90) ||
                                t("noCaption")}
                            </div>
                            <div className={styles.postSubtitle}>
                              {t("postBy", { author: p.authorUsername ? `@${p.authorUsername}` : t("unknown") })}
                            </div>
                          </div>
                          <div />
                        </div>
                      ))}
                    </>
                  ) : null}

                  {reelItems.length ? (
                    <>
                      <div className={styles.sectionHeader}>
                        <div className={styles.sectionTitle}>{t("sections.reels")}</div>
                        <button
                          type="button"
                          className={styles.ghostBtn}
                          onClick={() => goSeeAll("/search/reels")}
                        >
                          {t("seeAll")}
                        </button>
                      </div>
                      <div className={styles.reelsGrid}>
                        {reelItems.slice(0, 4).map((item) => {
                          const media = item.media?.[0];
                          if (!media) return null;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              className={styles.reelTile}
                              onClick={() => pickReel(item)}
                            >
                              <video
                                className={styles.reelTileMedia}
                                src={media.url}
                                muted
                                playsInline
                                preload="metadata"
                                onMouseEnter={handleReelEnter}
                                onMouseLeave={handleReelLeave}
                              />
                            </button>
                          );
                        })}
                      </div>
                    </>
                  ) : null}

                  {!loading &&
                  !error &&
                  !suggestItems.length &&
                  !postItems.length ? (
                    <div className={styles.muted}>{t("status.noResults")}</div>
                  ) : null}
                </>
              ) : null}

              {tab === "people" ? (
                <>
                  <div className={styles.sectionHeader}>
                    <div className={styles.sectionTitle}>{t("sections.people")}</div>
                    <button
                      type="button"
                      className={styles.ghostBtn}
                      onClick={() => goSeeAll("/search/people")}
                    >
                      {t("seeAll")}
                    </button>
                  </div>
                  {peopleItems.slice(0, 10).map((p) => (
                    <div
                      key={p.userId}
                      className={styles.row}
                      onClick={() => pickProfile(p)}
                    >
                      <Image
                        src={p.avatarUrl || DEFAULT_AVATAR_URL}
                        alt=""
                        width={42}
                        height={42}
                        className={styles.avatar}
                      />
                      <div className={styles.meta}>
                        <div className={styles.label}>{p.displayName}</div>
                        <div className={styles.subtitle}>@{p.username}</div>
                      </div>
                      <div />
                    </div>
                  ))}
                  {!loading && !error && !peopleItems.length ? (
                    <div className={styles.muted}>{t("status.noPeople")}</div>
                  ) : null}
                </>
              ) : null}

              {tab === "hashtags" ? (
                <>
                  {hashtagItems.map((tag) => (
                    <div
                      key={tag.id}
                      className={styles.row}
                      onClick={() => pickHashtag(tag)}
                    >
                      <HashTile />
                      <div className={styles.meta}>
                        <div className={styles.label}>#{tag.name}</div>
                        <div className={styles.subtitle}>
                          {t("usageCount", { count: tag.usageCount })}
                        </div>
                      </div>
                      <div />
                    </div>
                  ))}
                  {!loading && !error && !hashtagItems.length ? (
                    <div className={styles.muted}>{t("status.noHashtags")}</div>
                  ) : null}
                </>
              ) : null}

              {tab === "posts" ? (
                <>
                  <div className={styles.sectionHeader}>
                    <div className={styles.sectionTitle}>{t("sections.posts")}</div>
                    <button
                      type="button"
                      className={styles.ghostBtn}
                      onClick={() => goSeeAll("/search/post")}
                    >
                      {t("seeAll")}
                    </button>
                  </div>
                  {postItems.slice(0, 10).map((p) => (
                    <div
                      key={p.id}
                      className={styles.row}
                      onClick={() => pickPost(p)}
                    >
                      <PostTile
                        mediaUrl={p.media?.[0]?.url ?? ""}
                        mediaType={p.media?.[0]?.type ?? ""}
                      />
                      <div className={styles.meta}>
                        <div className={styles.postLabel}>
                          {(p.content || "").trim().slice(0, 90) ||
                            t("noCaption")}
                        </div>
                        <div className={styles.postSubtitle}>
                          {t("postBy", { author: p.authorUsername ? `@${p.authorUsername}` : t("unknown") })}
                        </div>
                      </div>
                      <div />
                    </div>
                  ))}
                  {!loading && !error && !postItems.length ? (
                    <div className={styles.muted}>{t("status.noPosts")}</div>
                  ) : null}
                </>
              ) : null}

              {tab === "reels" ? (
                <>
                  <div className={styles.sectionHeader}>
                    <div className={styles.sectionTitle}>{t("sections.reels")}</div>
                    <button
                      type="button"
                      className={styles.ghostBtn}
                      onClick={() => goSeeAll("/search/reels")}
                    >
                      {t("seeAll")}
                    </button>
                  </div>
                  {!loading && !error && !reelItems.length ? (
                    <div className={styles.muted}>{t("status.noReels")}</div>
                  ) : null}

                  {reelItems.length ? (
                    <div className={styles.reelsGrid}>
                      {reelItems.slice(0, 10).map((item) => {
                        const media = item.media?.[0];
                        if (!media) return null;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            className={styles.reelTile}
                            onClick={() => pickReel(item)}
                          >
                            <video
                              className={styles.reelTileMedia}
                              src={media.url}
                              muted
                              playsInline
                              preload="metadata"
                              onMouseEnter={handleReelEnter}
                              onMouseLeave={handleReelLeave}
                            />
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
