"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import EmojiPicker from "emoji-picker-react";
import styles from "@/app/(main)/home-feed.module.css";
import {
  searchProfiles,
  updatePost,
  type FeedItem,
  type ProfileSearchItem,
} from "@/lib/api";

const IconClose = ({ size = 18 }: { size?: number }) => (
  <svg
    aria-hidden
    width={size}
    height={size}
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M6 6l12 12M18 6 6 18"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
    />
  </svg>
);

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

const extractMentionsFromCaption = (value: string) => {
  const handles = new Set<string>();
  const regex = /@([a-zA-Z0-9_.]{1,30})/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(value))) {
    handles.add(match[1].toLowerCase());
  }
  return Array.from(handles);
};

const findActiveMention = (value: string, caret: number) => {
  const beforeCaret = value.slice(0, caret);
  const match = /(^|[\s([{.,!?])@([a-zA-Z0-9_.]{0,30})$/i.exec(beforeCaret);
  if (!match) return null;
  const handle = match[2];
  const start = caret - handle.length - 1;
  return { handle, start, end: caret };
};

type PostEditOverlayProps = {
  open: boolean;
  post: FeedItem | null;
  token: string | null;
  onClose: () => void;
  onUpdated: (updated: FeedItem) => void;
};

export default function PostEditOverlay({
  open,
  post,
  token,
  onClose,
  onUpdated,
}: PostEditOverlayProps) {
  const [mounted, setMounted] = useState(false);
  const [editCaption, setEditCaption] = useState("");
  const editCaptionRef = useRef<HTMLTextAreaElement | null>(null);
  const editEmojiRef = useRef<HTMLDivElement | null>(null);
  const [editEmojiOpen, setEditEmojiOpen] = useState(false);
  const [editHashtags, setEditHashtags] = useState<string[]>([]);
  const [hashtagDraft, setHashtagDraft] = useState("");
  const [editMentions, setEditMentions] = useState<string[]>([]);
  const [mentionDraft, setMentionDraft] = useState("");
  const [mentionSuggestions, setMentionSuggestions] = useState<
    ProfileSearchItem[]
  >([]);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionLoading, setMentionLoading] = useState(false);
  const [mentionError, setMentionError] = useState("");
  const [mentionHighlight, setMentionHighlight] = useState(-1);
  const [activeMentionRange, setActiveMentionRange] = useState<{
    start: number;
    end: number;
  } | null>(null);
  const [editLocation, setEditLocation] = useState("");
  const [locationQuery, setLocationQuery] = useState("");
  const [locationSuggestions, setLocationSuggestions] = useState<
    Array<{ label: string; lat: string; lon: string }>
  >([]);
  const [locationOpen, setLocationOpen] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [locationHighlight, setLocationHighlight] = useState(-1);
  const [editAllowComments, setEditAllowComments] = useState(true);
  const [editAllowDownload, setEditAllowDownload] = useState(false);
  const [editHideLikeCount, setEditHideLikeCount] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [editSuccess, setEditSuccess] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  const resetEditState = useCallback(() => {
    if (!post) return;
    setEditCaption(post.content || "");
    setEditHashtags(post.hashtags || []);
    setHashtagDraft("");
    setEditMentions(post.mentions || []);
    setMentionDraft("");
    setMentionSuggestions([]);
    setMentionOpen(false);
    setMentionLoading(false);
    setMentionError("");
    setMentionHighlight(-1);
    setActiveMentionRange(null);
    setEditLocation(post.location || "");
    setLocationQuery(post.location || "");
    setLocationSuggestions([]);
    setLocationOpen(false);
    setLocationLoading(false);
    setLocationError("");
    setLocationHighlight(-1);
    setEditAllowComments(Boolean(post.allowComments));
    setEditAllowDownload(Boolean(post.allowDownload));
    setEditHideLikeCount(Boolean(post.hideLikeCount));
    setEditError("");
    setEditSuccess("");
  }, [post]);

  useEffect(() => {
    if (open) resetEditState();
  }, [open, resetEditState, post?.id]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!editEmojiRef.current) return;
      if (!editEmojiRef.current.contains(event.target as Node)) {
        setEditEmojiOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setEditEmojiOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!open) setEditEmojiOpen(false);
  }, [open]);

  const handleCaptionChange = (
    event: React.ChangeEvent<HTMLTextAreaElement>,
  ) => {
    const value = event.target.value;
    const caret = event.target.selectionStart ?? value.length;
    setEditCaption(value);

    const active = findActiveMention(value, caret);
    if (active) {
      setActiveMentionRange({ start: active.start, end: active.end });
      setMentionDraft(active.handle);
      setMentionOpen(true);
      setMentionError("");
      setMentionHighlight(0);
    } else {
      setActiveMentionRange(null);
      setMentionDraft("");
      setMentionSuggestions([]);
      setMentionOpen(false);
      setMentionHighlight(-1);
      setMentionError("");
    }
  };

  const insertEditEmoji = (emoji: string) => {
    const el = editCaptionRef.current;
    const caret = el?.selectionStart ?? editCaption.length;
    setEditCaption((prev) => {
      const value = prev || "";
      if (!el || typeof el.selectionStart !== "number") {
        return value + emoji;
      }
      const start = el.selectionStart;
      const end = el.selectionEnd ?? start;
      return value.slice(0, start) + emoji + value.slice(end);
    });

    setTimeout(() => {
      if (!el) return;
      const nextPos = caret + emoji.length;
      el.focus();
      el.setSelectionRange(nextPos, nextPos);
    }, 0);
  };

  const onCaptionKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!mentionOpen) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!mentionSuggestions.length) return;
      setMentionHighlight((prev) =>
        prev + 1 < mentionSuggestions.length ? prev + 1 : 0,
      );
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!mentionSuggestions.length) return;
      setMentionHighlight((prev) =>
        prev - 1 >= 0 ? prev - 1 : mentionSuggestions.length - 1,
      );
      return;
    }
    if (e.key === "Enter") {
      if (mentionSuggestions.length && mentionHighlight >= 0) {
        e.preventDefault();
        const opt = mentionSuggestions[mentionHighlight];
        if (opt) selectMention(opt);
      }
    }
    if (e.key === "Escape") {
      setMentionOpen(false);
      setMentionHighlight(-1);
      setActiveMentionRange(null);
    }
  };

  useEffect(() => {
    if (!open) return;
    const cleaned = mentionDraft.trim().replace(/^@/, "");
    if (!cleaned) {
      setMentionSuggestions([]);
      setMentionOpen(false);
      setMentionHighlight(-1);
      setMentionError("");
      return;
    }

    if (!token) {
      setMentionSuggestions([]);
      setMentionOpen(false);
      setMentionHighlight(-1);
      setMentionError("Sign in to mention users");
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setMentionLoading(true);
      setMentionError("");
      try {
        const res = await searchProfiles({
          token,
          query: cleaned,
          limit: 8,
        });
        if (cancelled) return;
        setMentionSuggestions(res.items);
        setMentionOpen(res.items.length > 0);
        setMentionHighlight(res.items.length ? 0 : -1);
        if (!res.items.length) setMentionError("User not found");
      } catch {
        if (cancelled) return;
        setMentionSuggestions([]);
        setMentionOpen(false);
        setMentionHighlight(-1);
        setMentionError("User not found");
      } finally {
        if (!cancelled) setMentionLoading(false);
      }
    }, 320);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, mentionDraft, token]);

  const selectMention = (opt: ProfileSearchItem) => {
    const handle = opt.username.toLowerCase();
    const caption = editCaption || "";
    const range = activeMentionRange ?? {
      start: caption.length,
      end: caption.length,
    };
    const before = caption.slice(0, range.start);
    const after = caption.slice(range.end);
    const insertion = `@${handle}`;
    const needsSpaceAfter = after.startsWith(" ") || after === "" ? "" : " ";
    const nextCaption = `${before}${insertion}${needsSpaceAfter}${after}`;
    const nextMentions = editMentions.includes(handle)
      ? editMentions
      : [...editMentions, handle];

    setEditCaption(nextCaption);
    setEditMentions(nextMentions);

    setMentionDraft("");
    setMentionSuggestions([]);
    setMentionOpen(false);
    setMentionHighlight(-1);
    setActiveMentionRange(null);

    setTimeout(() => {
      const el = editCaptionRef.current;
      if (!el) return;
      const caret = range.start + insertion.length + (needsSpaceAfter ? 1 : 0);
      el.focus?.();
      el.setSelectionRange?.(caret, caret);
    }, 0);
  };

  const addHashtag = () => {
    const cleaned = normalizeHashtag(hashtagDraft);
    if (!cleaned) return;
    if (editHashtags.includes(cleaned)) {
      setHashtagDraft("");
      return;
    }
    if (editHashtags.length >= 30) return;
    setEditHashtags((prev) => [...prev, cleaned]);
    setHashtagDraft("");
  };

  const removeHashtag = (tag: string) => {
    setEditHashtags((prev) => prev.filter((t) => t !== tag));
  };

  useEffect(() => {
    if (!open) return;
    if (!locationQuery.trim()) {
      setLocationSuggestions([]);
      setLocationOpen(false);
      setLocationHighlight(-1);
      setLocationError("");
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
        setLocationOpen(false);
        setLocationHighlight(-1);
        setLocationError("No suggestions found, try different keywords.");
      } finally {
        if (!controller.signal.aborted) setLocationLoading(false);
      }
    }, 350);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [open, locationQuery]);

  const pickLocation = (label: string) => {
    setEditLocation(label);
    setLocationQuery(label);
    setLocationSuggestions([]);
    setLocationOpen(false);
    setLocationHighlight(-1);
    setLocationError("");
  };

  const onLocationKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!locationSuggestions.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setLocationHighlight((prev) =>
        prev + 1 < locationSuggestions.length ? prev + 1 : 0,
      );
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setLocationHighlight((prev) =>
        prev - 1 >= 0 ? prev - 1 : locationSuggestions.length - 1,
      );
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const chosen = locationSuggestions[locationHighlight];
      if (chosen) pickLocation(chosen.label);
    }
  };

  const handleEditSubmit = async (event?: React.FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (!post) return;
    setEditError("");
    setEditSuccess("");

    if (!token) {
      setEditError("Please sign in to edit posts");
      return;
    }

    const normalizedHashtags = Array.from(
      new Set(editHashtags.map((t) => normalizeHashtag(t.toString()))),
    ).filter(Boolean);

    const normalizedMentions = Array.from(
      new Set(
        [
          ...extractMentionsFromCaption(editCaption || ""),
          ...editMentions.map((t) =>
            t.toString().trim().replace(/^@/, "").toLowerCase(),
          ),
        ].filter(Boolean),
      ),
    );

    const trimmedLocation = editLocation.trim();

    const payload = {
      content: editCaption || "",
      hashtags: normalizedHashtags,
      mentions: normalizedMentions,
      location: trimmedLocation || undefined,
      allowComments: editAllowComments,
      allowDownload: editAllowDownload,
      hideLikeCount: editHideLikeCount,
    } as const;

    try {
      setEditSaving(true);
      const updated = await updatePost({
        token,
        postId: post.id,
        payload,
      });
      onUpdated(updated);
      setEditSuccess("Post updated");
      onClose();
    } catch (err: any) {
      const message =
        (err && typeof err === "object" && "message" in err
          ? (err as { message?: string }).message
          : null) || "Failed to update post";
      setEditError(message);
    } finally {
      setEditSaving(false);
    }
  };

  if (!open || !post) return null;

  const editModal = (
    <div
      className={`${styles.modalOverlay} ${styles.modalOverlayOpen}`}
      role="dialog"
      aria-modal="true"
      onClick={() => !editSaving && onClose()}
    >
      <div
        className={`${styles.modalCard} ${styles.editCard}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.modalHeader}>
          <div>
            <h3 className={styles.modalTitle}>Edit post</h3>
          </div>
          <button
            className={styles.closeBtn}
            aria-label="Close"
            onClick={() => !editSaving && onClose()}
            type="button"
          >
            <IconClose size={18} />
          </button>
        </div>

        <form className={styles.editForm} onSubmit={handleEditSubmit}>
          <label className={styles.editLabel}>
            <div className={styles.editLabelRow}>
              <span className={styles.editLabelText}>Caption</span>
              <div className={styles.emojiWrap} ref={editEmojiRef}>
                <button
                  type="button"
                  className={styles.emojiButton}
                  onClick={() => setEditEmojiOpen((prev) => !prev)}
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
                {editEmojiOpen ? (
                  <div className={styles.emojiPopover}>
                    <EmojiPicker
                      onEmojiClick={(emojiData) => {
                        insertEditEmoji(emojiData.emoji || "");
                        setEditEmojiOpen(false);
                      }}
                      searchDisabled={false}
                      skinTonesDisabled={false}
                      lazyLoadEmojis
                    />
                  </div>
                ) : null}
              </div>
            </div>
            <div
              className={`${styles.editTextareaShell} ${styles.mentionCombo}`}
            >
              <textarea
                ref={editCaptionRef}
                className={styles.editTextarea}
                value={editCaption}
                onChange={handleCaptionChange}
                onKeyDown={onCaptionKeyDown}
                onBlur={() => {
                  setTimeout(() => {
                    setMentionOpen(false);
                    setMentionHighlight(-1);
                    setActiveMentionRange(null);
                  }, 120);
                }}
                rows={4}
                maxLength={2200}
                placeholder="Write something..."
              />
              <span className={styles.charCount}>
                {editCaption.length}/2200
              </span>
            </div>
          </label>

          {mentionOpen ? (
            <div className={styles.mentionDropdown}>
              {mentionLoading ? (
                <div className={styles.mentionItem}>Searching...</div>
              ) : null}
              {!mentionLoading && mentionSuggestions.length === 0 ? (
                <div className={styles.mentionItem}>
                  {mentionError || "No matches"}
                </div>
              ) : null}
              {mentionSuggestions.map((opt, idx) => {
                const active = idx === mentionHighlight;
                const avatarInitials = (opt.displayName || opt.username || "?")
                  .slice(0, 2)
                  .toUpperCase();
                return (
                  <button
                    type="button"
                    key={opt.id || opt.username}
                    className={`${styles.mentionItem} ${
                      active ? styles.mentionItemActive : ""
                    }`}
                    onClick={() => selectMention(opt)}
                  >
                    <span className={styles.mentionAvatar} aria-hidden>
                      {opt.avatarUrl ? (
                        <img
                          src={opt.avatarUrl}
                          alt={opt.displayName || opt.username}
                          className={styles.mentionAvatarImg}
                        />
                      ) : (
                        <span className={styles.mentionAvatarFallback}>
                          {avatarInitials}
                        </span>
                      )}
                    </span>
                    <span className={styles.mentionCopy}>
                      <span className={styles.mentionHandle}>
                        @{opt.username}
                      </span>
                      {opt.displayName ? (
                        <span className={styles.mentionName}>
                          {opt.displayName}
                        </span>
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}

          <div className={styles.editField}>
            <div className={styles.editLabelRow}>
              <span className={styles.editLabelText}>Hashtags</span>
            </div>
            <div className={styles.chipRow}>
              {editHashtags.map((tag) => (
                <span key={tag} className={styles.chip}>
                  #{tag}
                  <button
                    type="button"
                    className={styles.chipRemove}
                    onClick={() => removeHashtag(tag)}
                    aria-label={`Remove ${tag}`}
                  >
                    ×
                  </button>
                </span>
              ))}
              <input
                className={styles.editInput}
                placeholder="Add hashtag"
                value={hashtagDraft}
                onChange={(e) => setHashtagDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addHashtag();
                  }
                }}
              />
            </div>
          </div>

          <div className={styles.editField}>
            <div className={styles.editLabelRow}>
              <span className={styles.editLabelText}>Location</span>
            </div>
            <input
              className={styles.editInput}
              placeholder="Add a place"
              value={locationQuery}
              onChange={(e) => {
                setEditLocation(e.target.value);
                setLocationQuery(e.target.value);
              }}
              onFocus={() =>
                setLocationOpen(Boolean(locationSuggestions.length))
              }
              onKeyDown={onLocationKeyDown}
            />
            {locationOpen ? (
              <div className={styles.locationDropdown}>
                {locationLoading ? (
                  <div className={styles.locationItem}>Searching...</div>
                ) : null}
                {!locationLoading && locationSuggestions.length === 0 ? (
                  <div className={styles.locationItem}>
                    {locationError || "No suggestions"}
                  </div>
                ) : null}
                {locationSuggestions.map((opt, idx) => {
                  const active = idx === locationHighlight;
                  return (
                    <button
                      type="button"
                      key={`${opt.label}-${opt.lat}-${opt.lon}`}
                      className={`${styles.locationItem} ${
                        active ? styles.locationItemActive : ""
                      }`}
                      onClick={() => pickLocation(opt.label)}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>

          <div className={styles.switchGroup}>
            <label className={styles.switchRow}>
              <input
                type="checkbox"
                checked={editAllowComments}
                onChange={() => setEditAllowComments((prev) => !prev)}
              />
              <div>
                <p className={styles.switchTitle}>Allow comments</p>
                <p className={styles.switchHint}>
                  Enable to receive feedback from everyone
                </p>
              </div>
            </label>

            <label className={styles.switchRow}>
              <input
                type="checkbox"
                checked={editAllowDownload}
                onChange={() => setEditAllowDownload((prev) => !prev)}
              />
              <div>
                <p className={styles.switchTitle}>Allow downloads</p>
                <p className={styles.switchHint}>
                  Share the original file with people you trust
                </p>
              </div>
            </label>

            <label className={styles.switchRow}>
              <input
                type="checkbox"
                checked={editHideLikeCount}
                onChange={() => setEditHideLikeCount((prev) => !prev)}
              />
              <div>
                <p className={styles.switchTitle}>Hide like</p>
                <p className={styles.switchHint}>
                  Viewers won’t see the number of likes on this post
                </p>
              </div>
            </label>
          </div>

          {editError ? (
            <div className={styles.inlineError}>{editError}</div>
          ) : null}
          {editSuccess ? (
            <div className={styles.editSuccess}>{editSuccess}</div>
          ) : null}

          <div className={styles.modalActions}>
            <button
              type="button"
              className={styles.modalSecondary}
              onClick={() => !editSaving && onClose()}
              disabled={editSaving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={styles.modalPrimary}
              disabled={editSaving}
            >
              {editSaving ? "Saving..." : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  if (mounted && typeof document !== "undefined") {
    return createPortal(editModal, document.body);
  }

  return editModal;
}
