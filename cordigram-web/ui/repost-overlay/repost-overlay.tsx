"use client";

import EmojiPicker from "emoji-picker-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./repost-overlay.module.css";

export type RepostTarget = {
  postId: string;
  label: string;
  kind: "post" | "reel";
  originalAllowDownload: boolean;
};

export type QuoteVisibility = "public" | "followers" | "private";

export type QuoteInput = {
  content: string;
  visibility: QuoteVisibility;
  allowComments: boolean;
  allowDownload: boolean;
  hideLikeCount: boolean;
  location: string;
  hashtags: string[];
};

type RepostOverlayProps = {
  target: RepostTarget | null;
  onRequestClose: () => void;
  onQuickRepost: (target: RepostTarget) => Promise<void> | void;
  onShareQuote: (
    target: RepostTarget,
    input: QuoteInput,
  ) => Promise<void> | void;
  quoteCharLimit?: number;
  animationMs?: number;
};

const normalizeHashtag = (value: string) =>
  value
    .replace(/^#/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "")
    .replace(/[^a-zA-Z0-9_]/g, "")
    .toLowerCase();

const cleanLocationLabel = (label: string) =>
  label
    .replace(/\b\d{4,6}\b/g, "")
    .replace(/,\s*,+/g, ", ")
    .replace(/\s{2,}/g, " ")
    .replace(/\s*,\s*$/g, "")
    .replace(/^\s*,\s*/g, "")
    .trim();

export default function RepostOverlay({
  target,
  onRequestClose,
  onQuickRepost,
  onShareQuote,
  quoteCharLimit = 500,
  animationMs = 200,
}: RepostOverlayProps) {
  const [closing, setClosing] = useState(false);
  const [view, setView] = useState<"sheet" | "quote">("sheet");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>("");

  const [content, setContent] = useState("");
  const [visibility, setVisibility] = useState<QuoteVisibility>("public");
  const [allowComments, setAllowComments] = useState(true);
  const [hideLikeCount, setHideLikeCount] = useState(false);
  const [location, setLocation] = useState("");
  const [locationQuery, setLocationQuery] = useState("");
  const [locationSuggestions, setLocationSuggestions] = useState<
    Array<{ label: string; lat: string; lon: string }>
  >([]);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [locationOpen, setLocationOpen] = useState(false);
  const [locationHighlight, setLocationHighlight] = useState(-1);
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [hashtagDraft, setHashtagDraft] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);

  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const locationOpenRef = useRef(false);
  const emojiRef = useRef<HTMLDivElement | null>(null);
  const captionRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  const resetState = () => {
    setClosing(false);
    setView("sheet");
    setSubmitting(false);
    setError("");
    setContent("");
    setVisibility("public");
    setAllowComments(true);
    setHideLikeCount(false);
    setLocation("");
    setLocationQuery("");
    setLocationSuggestions([]);
    setLocationLoading(false);
    setLocationError("");
    setLocationOpen(false);
    setLocationHighlight(-1);
    setHashtags([]);
    setHashtagDraft("");
    setEmojiOpen(false);
  };

  useEffect(() => {
    if (!target) return;
    resetState();
  }, [target?.postId]);

  const visibilityOptions = useMemo(
    () => [
      {
        value: "public" as const,
        title: "Public",
        description: "Anyone can view this repost",
      },
      {
        value: "followers" as const,
        title: "Followers",
        description: "Only followers can view this repost",
      },
      {
        value: "private" as const,
        title: "Private",
        description: "Only you can view this repost",
      },
    ],
    [],
  );

  const requestClose = useCallback(() => {
    if (!target) return;
    if (submitting) return;
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    setClosing(true);
    closeTimerRef.current = setTimeout(() => {
      onRequestClose();
      resetState();
    }, animationMs);
  }, [animationMs, onRequestClose, submitting, target]);

  useEffect(() => {
    if (!target || typeof document === "undefined") return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (locationOpenRef.current) {
        setLocationOpen(false);
        setLocationHighlight(-1);
        return;
      }
      if (emojiOpen) {
        setEmojiOpen(false);
        return;
      }
      requestClose();
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [emojiOpen, requestClose, target]);

  useEffect(() => {
    if (!emojiOpen || typeof document === "undefined") return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!emojiRef.current) return;
      if (!emojiRef.current.contains(event.target as Node)) {
        setEmojiOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [emojiOpen]);

  const insertEmoji = (emoji: string) => {
    const el = captionRef.current;
    const start = el?.selectionStart ?? (content || "").length;
    const end = el?.selectionEnd ?? start;

    setContent((prev) => {
      const value = prev || "";
      if (!el || typeof el.selectionStart !== "number") return value + emoji;
      return value.slice(0, start) + emoji + value.slice(end);
    });

    setTimeout(() => {
      if (!el) return;
      const caret = start + emoji.length;
      el.focus();
      el.setSelectionRange(caret, caret);
    }, 0);
  };

  useEffect(() => {
    locationOpenRef.current = locationOpen;
  }, [locationOpen]);

  const addHashtag = () => {
    const clean = normalizeHashtag(hashtagDraft);
    if (!clean) return;
    setHashtags((prev) =>
      prev.includes(clean) ? prev : [...prev, clean].slice(0, 12),
    );
    setHashtagDraft("");
  };

  useEffect(() => {
    if (!locationQuery.trim()) {
      setLocationSuggestions([]);
      setLocationOpen(false);
      setLocationHighlight(-1);
      setLocationError("");
      setLocationLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLocationLoading(true);
      setLocationError("");
      try {
        const url = new URL("https://nominatim.openstreetmap.org/search");
        url.searchParams.set("q", locationQuery);
        url.searchParams.set("format", "jsonv2");
        url.searchParams.set("addressdetails", "1");
        url.searchParams.set("limit", "8");
        url.searchParams.set("countrycodes", "vn");

        const res = await fetch(url.toString(), {
          headers: {
            Accept: "application/json",
            "Accept-Language": "vi",
          },
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("search failed");
        const data = await res.json();
        const mapped = Array.isArray(data)
          ? data.map((item: any) => ({
              label: cleanLocationLabel(item.display_name as string),
              lat: item.lat as string,
              lon: item.lon as string,
            }))
          : [];

        setLocationSuggestions(mapped);
        setLocationOpen(true);
        setLocationHighlight(mapped.length ? 0 : -1);
      } catch (err) {
        if (controller.signal.aborted) return;
        setLocationSuggestions([]);
        setLocationOpen(true);
        setLocationHighlight(-1);
        setLocationError("Không tìm thấy địa điểm phù hợp.");
      } finally {
        if (!controller.signal.aborted) setLocationLoading(false);
      }
    }, 350);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [locationQuery]);

  const selectLocation = (option: {
    label: string;
    lat: string;
    lon: string;
  }) => {
    setLocation(option.label);
    setLocationQuery(option.label);
    setLocationSuggestions([]);
    setLocationOpen(false);
    setLocationHighlight(-1);
    setLocationError("");
  };

  const onLocationChange = (value: string) => {
    setLocation(value);
    setLocationQuery(value);
  };

  const onLocationFocus = () => {
    if (locationSuggestions.length || locationError) {
      setLocationOpen(true);
      setLocationHighlight((prev) =>
        prev >= 0 ? prev : locationSuggestions.length ? 0 : -1,
      );
    }
  };

  const onLocationBlur = () => {
    window.setTimeout(() => {
      setLocationOpen(false);
      setLocationHighlight(-1);
    }, 120);
  };

  const onLocationKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      if (locationOpen) {
        event.preventDefault();
        event.stopPropagation();
      }
      setLocationOpen(false);
      setLocationHighlight(-1);
      return;
    }

    if (!locationOpen) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!locationSuggestions.length) return;
      setLocationHighlight((prev) =>
        prev + 1 < locationSuggestions.length ? prev + 1 : 0,
      );
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!locationSuggestions.length) return;
      setLocationHighlight((prev) =>
        prev - 1 >= 0 ? prev - 1 : locationSuggestions.length - 1,
      );
    }

    if (event.key === "Enter") {
      if (!locationSuggestions.length) return;
      event.preventDefault();
      const chosen = locationSuggestions[locationHighlight];
      if (chosen) selectLocation(chosen);
    }
  };

  const removeHashtag = (tag: string) => {
    setHashtags((prev) => prev.filter((t) => t !== tag));
  };

  const handleQuickRepost = async () => {
    if (!target || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      await onQuickRepost(target);
      requestClose();
    } catch (err) {
      const message =
        typeof err === "object" && err && "message" in err
          ? String((err as { message?: string }).message)
          : "Could not repost";
      setError(message || "Could not repost");
    } finally {
      setSubmitting(false);
    }
  };

  const handleShareQuote = async () => {
    if (!target || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const inheritedAllowDownload = Boolean(target.originalAllowDownload);
      await onShareQuote(target, {
        content,
        visibility,
        allowComments,
        allowDownload: inheritedAllowDownload,
        hideLikeCount,
        location,
        hashtags,
      });
      requestClose();
    } catch (err) {
      const message =
        typeof err === "object" && err && "message" in err
          ? String((err as { message?: string }).message)
          : "Could not repost";
      setError(message || "Could not repost");
    } finally {
      setSubmitting(false);
    }
  };

  if (!target) return null;

  const overlayClass = `${styles.modalOverlay} ${
    closing ? styles.modalOverlayClosing : styles.modalOverlayOpen
  }`;

  if (view === "quote") {
    return (
      <div
        className={overlayClass}
        role="dialog"
        aria-modal="true"
        onClick={requestClose}
      >
        <div
          className={`${styles.modalCard} ${styles.repostCard} ${
            closing ? styles.modalCardClosing : styles.modalCardOpen
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className={`${styles.modalHeader} ${styles.repostHeader}`}>
            <div>
              <h3 className={styles.modalTitle}>Quote</h3>
              <p className={styles.repostSub}>
                {`Quoting @${target.label}'s ${target.kind}`}
              </p>
            </div>
            <button
              className={styles.closeBtn}
              onClick={requestClose}
              aria-label="Close"
              type="button"
            >
              ×
            </button>
          </div>

          <div className={styles.repostNoteLabel}>
            <div className={styles.captionRow}>
              <label htmlFor="quoteCaption">Caption</label>
              <div className={styles.emojiWrap} ref={emojiRef}>
                <button
                  type="button"
                  className={styles.emojiButton}
                  onClick={() => setEmojiOpen((prev) => !prev)}
                  aria-label="Add emoji"
                >
                  <svg
                    aria-label="Emoji icon"
                    fill="currentColor"
                    height="20"
                    role="img"
                    viewBox="0 0 24 24"
                    width="20"
                  >
                    <title>Emoji icon</title>
                    <path d="M15.83 10.997a1.167 1.167 0 1 0 1.167 1.167 1.167 1.167 0 0 0-1.167-1.167Zm-6.5 1.167a1.167 1.167 0 1 0-1.166 1.167 1.167 1.167 0 0 0 1.166-1.167Zm5.163 3.24a3.406 3.406 0 0 1-4.982.007 1 1 0 1 0-1.557 1.256 5.397 5.397 0 0 0 8.09 0 1 1 0 0 0-1.55-1.263ZM12 .503a11.5 11.5 0 1 0 11.5 11.5A11.513 11.513 0 0 0 12 .503Zm0 21a9.5 9.5 0 1 1 9.5-9.5 9.51 9.51 0 0 1-9.5 9.5Z"></path>
                  </svg>
                </button>
                {emojiOpen ? (
                  <div className={styles.emojiPopover}>
                    <EmojiPicker
                      onEmojiClick={(emojiData) => {
                        insertEmoji(emojiData.emoji || "");
                      }}
                      searchDisabled={false}
                      skinTonesDisabled={false}
                      lazyLoadEmojis
                    />
                  </div>
                ) : null}
              </div>
            </div>
            <div className={styles.editTextareaShell}>
              <textarea
                id="quoteCaption"
                className={styles.repostTextarea}
                ref={captionRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                maxLength={quoteCharLimit}
                placeholder="Add your thoughts..."
              />
              <span className={styles.charCount}>
                {content.length}/{quoteCharLimit}
              </span>
            </div>
          </div>

          <div className={styles.editField}>
            <div className={styles.editLabelRow}>
              <span className={styles.editLabelText}>Hashtags #</span>
            </div>
            <div className={styles.chipShell}>
              <div className={styles.chips}>
                {hashtags.map((tag) => (
                  <span key={tag} className={styles.chip}>
                    #{tag}
                    <button
                      type="button"
                      onClick={() => removeHashtag(tag)}
                      aria-label={`Remove hashtag ${tag}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
                <input
                  className={styles.chipInput}
                  placeholder={
                    hashtags.length ? "Add hashtag" : "Example: travel"
                  }
                  value={hashtagDraft}
                  onChange={(e) =>
                    setHashtagDraft(normalizeHashtag(e.target.value))
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      addHashtag();
                    }
                  }}
                />
              </div>
            </div>
          </div>

          <div className={styles.editField}>
            <div className={styles.editLabelRow}>
              <span className={styles.editLabelText}>Location</span>
            </div>
            <div className={styles.locationCombo}>
              <input
                className={styles.editInput}
                placeholder="Add a place"
                value={location}
                onChange={(e) => onLocationChange(e.target.value)}
                onFocus={onLocationFocus}
                onBlur={onLocationBlur}
                onKeyDown={onLocationKeyDown}
              />
              {locationOpen ? (
                <div className={styles.locationDropdown} role="listbox">
                  {locationLoading ? (
                    <div className={styles.locationItem}>Searching...</div>
                  ) : null}
                  {!locationLoading && locationError ? (
                    <div className={styles.locationItem}>{locationError}</div>
                  ) : null}
                  {!locationLoading &&
                  !locationError &&
                  locationSuggestions.length === 0 ? (
                    <div className={styles.locationItem}>
                      Không có gợi ý nào.
                    </div>
                  ) : null}
                  {!locationLoading
                    ? locationSuggestions.map((opt, idx) => {
                        const active = idx === locationHighlight;
                        return (
                          <button
                            key={`${opt.label}-${opt.lat}-${opt.lon}`}
                            type="button"
                            className={`${styles.locationItem} ${
                              active ? styles.locationItemActive : ""
                            }`}
                            onMouseEnter={() => setLocationHighlight(idx)}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              selectLocation(opt);
                            }}
                          >
                            {opt.label}
                          </button>
                        );
                      })
                    : null}
                </div>
              ) : null}
            </div>
          </div>

          <div className={styles.editField}>
            <div className={styles.editLabelRow}>
              <span className={styles.editLabelText}>Visibility</span>
            </div>
            <div className={styles.visibilityList}>
              {visibilityOptions.map((opt) => {
                const active = visibility === opt.value;
                return (
                  <button
                    key={opt.value}
                    className={`${styles.visibilityOption} ${
                      active ? styles.visibilityOptionActive : ""
                    }`}
                    onClick={() => setVisibility(opt.value)}
                    type="button"
                  >
                    <span className={styles.visibilityRadio}>
                      {active ? "✓" : ""}
                    </span>
                    <span className={styles.visibilityCopy}>
                      <span className={styles.visibilityTitle}>
                        {opt.title}
                      </span>
                      <span className={styles.visibilityDesc}>
                        {opt.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className={styles.switchGroup}>
            <label className={styles.switchRow}>
              <input
                type="checkbox"
                checked={allowComments}
                onChange={() => setAllowComments((prev) => !prev)}
              />
              <div>
                <p className={styles.switchTitle}>Allow comments</p>
                <p className={styles.switchHint}>
                  People can reply to your quote
                </p>
              </div>
            </label>

            <label className={styles.switchRow}>
              <input
                type="checkbox"
                checked={Boolean(target.originalAllowDownload)}
                disabled
              />
              <div>
                <p className={styles.switchTitle}>Allow downloads</p>
                <p className={styles.switchHint}>
                  Inherited from the original post (can’t be changed)
                </p>
              </div>
            </label>

            <label className={styles.switchRow}>
              <input
                type="checkbox"
                checked={hideLikeCount}
                onChange={() => setHideLikeCount((prev) => !prev)}
              />
              <div>
                <p className={styles.switchTitle}>Hide like</p>
                <p className={styles.switchHint}>
                  Only you will see like counts on this quote
                </p>
              </div>
            </label>
          </div>

          {error ? <div className={styles.inlineError}>{error}</div> : null}

          <div className={styles.modalActions}>
            <button
              className={styles.modalSecondary}
              onClick={requestClose}
              disabled={submitting}
              type="button"
            >
              Cancel
            </button>
            <button
              className={styles.modalPrimary}
              onClick={handleShareQuote}
              disabled={submitting}
              type="button"
            >
              {submitting ? "Sharing..." : "Share quote"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={overlayClass}
      role="dialog"
      aria-modal="true"
      onClick={requestClose}
    >
      <div className={styles.repostSheet} onClick={(e) => e.stopPropagation()}>
        <div className={styles.repostSheetHeader}>
          <p className={styles.repostSheetTitle}>Repost</p>
          <p className={styles.repostSheetSubtitle}>
            {`@${target.label} · ${target.kind}`}
          </p>
        </div>
        <div className={styles.repostSheetList} role="menu">
          <button
            className={`${styles.repostSheetItem} ${styles.repostSheetPrimary}`}
            onClick={() => void handleQuickRepost()}
            disabled={submitting}
            type="button"
          >
            {submitting ? "Reposting..." : "Repost"}
          </button>
          <button
            className={styles.repostSheetItem}
            onClick={() => {
              setError("");
              setView("quote");
            }}
            disabled={submitting}
            type="button"
          >
            Quote
          </button>
          <button
            className={styles.repostSheetItem}
            onClick={requestClose}
            disabled={submitting}
            type="button"
          >
            Hủy
          </button>
        </div>
      </div>
    </div>
  );
}
