"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import EmojiPicker from "emoji-picker-react";
import styles from "./create.module.css";
import { useRequireAuth } from "@/hooks/use-require-auth";
import LivestreamCreatePanel from "@/components/livestream/LivestreamCreatePanel";
import { DateSelect } from "@/ui/date-select/date-select";
import { TimeSelect } from "@/ui/time-select/time-select";
import {
  fetchCurrentProfile,
  searchProfiles,
  type ProfileSearchItem,
} from "@/lib/api";
import { useRouter, useSearchParams } from "next/navigation";
import {
  usePostUpload,
  type PollOption,
} from "@/context/post-upload-context";
import StoryCreator from "@/ui/story-creator/story-creator";
import { useTranslations } from "next-intl";

function LocationIcon() {
  return (
    <svg
      aria-hidden
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 21s-6-5.5-6-10a6 6 0 1 1 12 0c0 4.5-6 10-6 10Z" />
      <circle cx="12" cy="11" r="2.5" />
    </svg>
  );
}

function TabPostIcon() {
  return (
    <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none">
      <rect
        x="3"
        y="3"
        width="7"
        height="7"
        rx="1.6"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <rect
        x="14"
        y="3"
        width="7"
        height="7"
        rx="1.6"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <rect
        x="3"
        y="14"
        width="7"
        height="7"
        rx="1.6"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <rect
        x="14"
        y="14"
        width="7"
        height="7"
        rx="1.6"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function TabReelIcon() {
  return (
    <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M8.5 6.7c0-.8.9-1.3 1.6-.8l6 4.3c.6.4.6 1.3 0 1.7l-6 4.3c-.7.5-1.6 0-1.6-.8V6.7Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect
        x="3.5"
        y="3.5"
        width="17"
        height="17"
        rx="3"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function TabLivestreamIcon() {
  return (
    <svg
      aria-hidden
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8.8 9.2a4.4 4.4 0 0 0 0 5.6" />
      <path d="M15.2 9.2a4.4 4.4 0 0 1 0 5.6" />
      <path d="M6.1 6.6a8 8 0 0 0 0 10.8" />
      <path d="M17.9 6.6a8 8 0 0 1 0 10.8" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

function TabPollIcon() {
  return (
    <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <rect x="2" y="14" width="4" height="8" rx="1" />
      <rect x="10" y="8" width="4" height="14" rx="1" />
      <rect x="18" y="2" width="4" height="20" rx="1" />
    </svg>
  );
}

const MAX_POLL_OPTIONS = 10;
const MIN_POLL_OPTIONS = 2;

const REEL_MAX_DURATION_SECONDS = 180;
const REEL_MAX_BYTES = 50 * 1024 * 1024;
const POST_MAX_BYTES = 100 * 1024 * 1024;
const MAX_MEDIA_ITEMS = 10;

type Step = "select" | "details";

type GeoStatus = "idle" | "requesting" | "granted" | "denied" | "error";

type FormState = {
  caption: string;
  location: string;
  audience: string;
  allowComments: boolean;
  allowDownload: boolean;
  hideLikeCount: boolean;
  altText: string;
  publishMode: "now" | "schedule";
  scheduledAt: string;
  hashtags: string[];
  mentions: string[];
};

type MediaItem = {
  file: File;
  previewUrl: string;
  kind: "image" | "video";
  duration: number | null;
};

const normalizeHashtag = (value: string) =>
  value
    .replace(/^#/, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, "")
    .replace(/[^a-zA-Z0-9_]/g, "")
    .toLowerCase();

const formatLocalDate = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatLocalTime = (value: Date) => {
  const hours = String(value.getHours()).padStart(2, "0");
  const minutes = String(value.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
};

const splitSchedule = (value: string) => {
  if (!value) return { date: "", time: "" };
  const [date, time = ""] = value.split("T");
  return { date, time: time.slice(0, 5) };
};

const buildSchedule = (date: string, time: string) =>
  date && time ? `${date}T${time}` : "";

const clampTimeForDate = (date: string, time: string) => {
  if (!date) return time;
  const now = new Date();
  const today = formatLocalDate(now);
  if (date !== today) return time;
  const minTime = formatLocalTime(now);
  if (!time || time < minTime) return minTime;
  return time;
};

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

const initialForm: FormState = {
  caption: "",
  location: "",
  audience: "public",
  allowComments: true,
  allowDownload: false,
  hideLikeCount: false,
  altText: "",
  publishMode: "now",
  scheduledAt: "",
  hashtags: [],
  mentions: [],
};

export default function CreatePostPage() {
  const canRender = useRequireAuth();
  const router = useRouter();
  const { startUpload, startPollUpload } = usePostUpload();
  const t = useTranslations("create");
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<"post" | "reel" | "livestream" | "poll" | "story">(() => {
    const tab = searchParams?.get("tab");
    if (tab === "story" || tab === "reel" || tab === "livestream" || tab === "poll") return tab;
    return "post";
  });
  const [storyCreated, setStoryCreated] = useState(false);
  const [step, setStep] = useState<Step>("select");
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [form, setForm] = useState<FormState>(initialForm);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string>("");
  const [geoStatus, setGeoStatus] = useState<GeoStatus>("idle");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [hashtagDraft, setHashtagDraft] = useState("");
  const [mentionDraft, setMentionDraft] = useState("");
  const [submitError, setSubmitError] = useState<string>("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [audienceOpen, setAudienceOpen] = useState(false);
  const [locationInput, setLocationInput] = useState(initialForm.location);
  const [locationQuery, setLocationQuery] = useState("");
  const [locationSuggestions, setLocationSuggestions] = useState<
    Array<{ label: string; lat: string; lon: string }>
  >([]);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [locationOpen, setLocationOpen] = useState(false);
  const [locationHighlight, setLocationHighlight] = useState(-1);
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
  const [accountLimited, setAccountLimited] = useState<{
    active: boolean;
    until: string | null;
    indefinitely: boolean;
  }>({
    active: false,
    until: null,
    indefinitely: false,
  });
  const [confirmedMentions, setConfirmedMentions] = useState<Set<string>>(new Set());
  const captionOverlayRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const captionRef = useRef<HTMLTextAreaElement | null>(null);
  const audienceRef = useRef<HTMLDivElement | null>(null);
  const emojiRef = useRef<HTMLDivElement | null>(null);

  // Poll-specific state
  const [pollOptions, setPollOptions] = useState<PollOption[]>([
    { text: "", imageFile: null },
    { text: "", imageFile: null },
  ]);
  const [pollAllowMultiple, setPollAllowMultiple] = useState(false);
  const [pollSubmitError, setPollSubmitError] = useState("");
  const pollImageInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [pollOptionPreviews, setPollOptionPreviews] = useState<(string | null)[]>([null, null]);

  const audienceOptions = useMemo(
    () => [
      { value: "public", label: t("audiencePublic") },
      { value: "followers", label: t("audienceFollowers") },
      { value: "private", label: t("audiencePrivate") },
    ],
    [t],
  );

  const totalSizeLabel = useMemo(() => {
    if (!mediaItems.length) return "-";
    const mb =
      mediaItems.reduce((acc, item) => acc + item.file.size, 0) / 1024 / 1024;
    return `${mb.toFixed(1)} MB total`;
  }, [mediaItems]);

  const canAddMore = useMemo(
    () => (mode === "post" ? mediaItems.length < MAX_MEDIA_ITEMS : false),
    [mode, mediaItems.length],
  );

  const selectedAudience = useMemo(
    () =>
      audienceOptions.find((option) => option.value === form.audience) ||
      audienceOptions[0],
    [audienceOptions, form.audience],
  );

  const scheduleParts = useMemo(
    () => splitSchedule(form.scheduledAt),
    [form.scheduledAt],
  );
  const scheduledDate = scheduleParts.date;
  const scheduledTime = scheduleParts.time;

  useEffect(() => {
    if (!canRender || typeof window === "undefined") return;

    let cancelled = false;

    const loadAccountState = async () => {
      const token = localStorage.getItem("accessToken") || "";
      if (!token) {
        if (!cancelled) {
          setAccountLimited({ active: false, until: null, indefinitely: false });
        }
        return;
      }

      try {
        const me = await fetchCurrentProfile({ token });
        const isLimited =
          me.status === "pending" &&
          me.signupStage === "completed" &&
          (Boolean(me.accountLimitedIndefinitely) || Boolean(me.accountLimitedUntil));

        if (cancelled) return;
        setAccountLimited({
          active: isLimited,
          until: me.accountLimitedUntil ?? null,
          indefinitely: Boolean(me.accountLimitedIndefinitely),
        });
      } catch {
        if (!cancelled) {
          setAccountLimited({ active: false, until: null, indefinitely: false });
        }
      }
    };

    loadAccountState();

    return () => {
      cancelled = true;
    };
  }, [canRender]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!emojiRef.current) return;
      if (!emojiRef.current.contains(event.target as Node)) {
        setShowEmojiPicker(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const insertEmoji = (emoji: string) => {
    setForm((prev) => {
      const el = captionRef.current;
      const value = prev.caption || "";
      if (!el || typeof el.selectionStart !== "number") {
        return { ...prev, caption: value + emoji };
      }
      const start = el.selectionStart;
      const end = el.selectionEnd ?? start;
      const next = value.slice(0, start) + emoji + value.slice(end);
      setTimeout(() => {
        el.focus();
        const caret = start + emoji.length;
        el.setSelectionRange(caret, caret);
      }, 0);
      return { ...prev, caption: next };
    });
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!audienceRef.current) return;
      if (!audienceRef.current.contains(event.target as Node)) {
        setAudienceOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAudienceOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (mediaItems.length === 0 && step !== "select") {
      setStep("select");
    }
  }, [mediaItems.length, step]);

  const readVideoDuration = (file: File): Promise<number | null> => {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const videoEl = document.createElement("video");
      videoEl.preload = "metadata";
      videoEl.onloadedmetadata = () => {
        const durationSec = Number.isFinite(videoEl.duration)
          ? videoEl.duration
          : null;
        URL.revokeObjectURL(url);
        resolve(durationSec);
      };
      videoEl.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      videoEl.src = url;
    });
  };

  const addFiles = async (fileList: FileList | File[] | null | undefined) => {
    setSubmitError("");
    if (!fileList) return;
    const incoming = Array.from(fileList);
    if (!incoming.length) return;

    const valid = incoming.filter((file) => {
      const isImage = file.type.startsWith("image/");
      const isVideo = file.type.startsWith("video/");
      return isImage || isVideo;
    });

    if (!valid.length) {
      setError(t("errorInvalidFiles"));
      return;
    }

    if (mode === "reel") {
      const videoFile = valid.find((file) => file.type.startsWith("video/"));
      if (!videoFile) {
        setError(t("errorReelNoVideo"));
        return;
      }
      if (videoFile.size > REEL_MAX_BYTES) {
        setError(t("errorReelTooLarge"));
        return;
      }
      const duration = await readVideoDuration(videoFile);
      if (duration !== null && duration > REEL_MAX_DURATION_SECONDS) {
        setError(t("errorReelTooLong", { seconds: REEL_MAX_DURATION_SECONDS }));
        return;
      }

      const nextItem: MediaItem = {
        file: videoFile,
        previewUrl: URL.createObjectURL(videoFile),
        kind: "video",
        duration,
      };

      setMediaItems((prev) => {
        prev.forEach((item) => URL.revokeObjectURL(item.previewUrl));
        return [nextItem];
      });
      setStep("details");
      setError("");
      return;
    }

    const tooLargePostFile = valid.find((file) => file.size > POST_MAX_BYTES);
    if (tooLargePostFile) {
      setError(t("errorFileTooLarge"));
      return;
    }

    const newItems: MediaItem[] = [];
    for (const file of valid) {
      const remaining = MAX_MEDIA_ITEMS - (mediaItems.length + newItems.length);
      if (remaining <= 0) break;
      const kind: MediaItem["kind"] = file.type.startsWith("video/")
        ? "video"
        : "image";
      const duration = kind === "video" ? await readVideoDuration(file) : null;
      newItems.push({
        file,
        previewUrl: URL.createObjectURL(file),
        kind,
        duration,
      });
    }

    if (!newItems.length) {
      setError(t("errorTooManyFiles", { max: MAX_MEDIA_ITEMS }));
      return;
    }

    setMediaItems((prev) => [...prev, ...newItems]);
    setStep("details");
    setError("");
  };

  const onInputChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    await addFiles(event.target.files);
    event.target.value = "";
  };

  const onDrop = async (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragActive(false);
    await addFiles(event.dataTransfer.files);
  };

  const onDragOver = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragActive(true);
  };

  const onDragLeave = () => setDragActive(false);

  const openFileDialog = () => fileInputRef.current?.click();

  const handleCaptionChange = (
    event: React.ChangeEvent<HTMLTextAreaElement>,
  ) => {
    const value = event.target.value;
    const caret = event.target.selectionStart ?? value.length;
    setForm((prev) => ({ ...prev, caption: value }));
    // Remove any confirmed mention whose @handle no longer appears intact in the text
    setConfirmedMentions((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set<string>();
      for (const handle of prev) {
        if (new RegExp(`@${handle}(?=\\W|$)`, "i").test(value)) next.add(handle);
      }
      return next.size === prev.size ? prev : next;
    });

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

  const resetSelection = () => {
    setMediaItems((prev) => {
      prev.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      return [];
    });
    setForm(initialForm);
    setLocationInput(initialForm.location);
    setLocationQuery("");
    setLocationSuggestions([]);
    setLocationOpen(false);
    setLocationHighlight(-1);
    setLocationError("");
    setMentionSuggestions([]);
    setMentionOpen(false);
    setMentionLoading(false);
    setMentionError("");
    setMentionHighlight(-1);
    setActiveMentionRange(null);
    setConfirmedMentions(new Set());
    setStep("select");
    setSubmitError("");
    // Reset poll
    setPollOptions([{ text: "", imageFile: null }, { text: "", imageFile: null }]);
    setPollOptionPreviews([null, null]);
    setPollAllowMultiple(false);
    setPollSubmitError("");
  };

  const addPollOption = useCallback(() => {
    if (pollOptions.length >= MAX_POLL_OPTIONS) return;
    setPollOptions((prev) => [...prev, { text: "", imageFile: null }]);
    setPollOptionPreviews((prev) => [...prev, null]);
  }, [pollOptions.length]);

  const removePollOption = useCallback((idx: number) => {
    if (pollOptions.length <= MIN_POLL_OPTIONS) return;
    setPollOptions((prev) => prev.filter((_, i) => i !== idx));
    setPollOptionPreviews((prev) => {
      const next = [...prev];
      if (next[idx]) URL.revokeObjectURL(next[idx]!);
      return next.filter((_, i) => i !== idx);
    });
  }, [pollOptions.length]);

  const updatePollOptionText = useCallback((idx: number, text: string) => {
    setPollOptions((prev) => prev.map((o, i) => i === idx ? { ...o, text } : o));
  }, []);

  const handlePollOptionImage = useCallback((idx: number, file: File) => {
    const url = URL.createObjectURL(file);
    setPollOptions((prev) => prev.map((o, i) => i === idx ? { ...o, imageFile: file } : o));
    setPollOptionPreviews((prev) => {
      const next = [...prev];
      if (next[idx]) URL.revokeObjectURL(next[idx]!);
      next[idx] = url;
      return next;
    });
  }, []);

  const removePollOptionImage = useCallback((idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setPollOptions((prev) => prev.map((o, i) => i === idx ? { ...o, imageFile: null } : o));
    setPollOptionPreviews((prev) => {
      const next = [...prev];
      if (next[idx]) URL.revokeObjectURL(next[idx]!);
      next[idx] = null;
      return next;
    });
  }, []);

  const handlePollSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPollSubmitError("");

    const filledOptions = pollOptions.filter((o) => o.text.trim());
    if (filledOptions.length < MIN_POLL_OPTIONS) {
      setPollSubmitError(`Cần ít nhất ${MIN_POLL_OPTIONS} lựa chọn.`);
      return;
    }

    const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
    if (!token) { setPollSubmitError(t("errorMissingToken")); return; }

    const normalizedHashtags = Array.from(
      new Set((form.hashtags || []).map((tag) => normalizeHashtag(tag.toString()))),
    ).filter(Boolean);

    const normalizedMentions = Array.from(
      new Set([
        ...extractMentionsFromCaption(form.caption || ""),
        ...(form.mentions || []).map((m) => m.toString().trim().replace(/^@/, "").toLowerCase()),
      ].filter(Boolean)),
    );

    const scheduledAtIso =
      form.publishMode === "schedule" && form.scheduledAt
        ? new Date(form.scheduledAt).toISOString()
        : undefined;

    startPollUpload({
      question: form.caption.trim() || "Bình chọn",
      options: filledOptions,
      allowMultipleAnswers: pollAllowMultiple,
      payload: {
        content: form.caption || undefined,
        hashtags: normalizedHashtags,
        mentions: normalizedMentions,
        location: form.location.trim() || undefined,
        visibility: form.audience as "public" | "followers" | "private",
        allowComments: form.allowComments,
        hideLikeCount: form.hideLikeCount,
        scheduledAt: scheduledAtIso,
      },
      token,
      publishMode: form.publishMode,
    });

    resetSelection();
    router.push("/");
  };

  const removeMedia = (index: number) => {
    setMediaItems((prev) => {
      const next = [...prev];
      const [removed] = next.splice(index, 1);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return next;
    });
  };

  const handleAudienceSelect = (value: string) => {
    setForm((prev) => ({ ...prev, audience: value }));
    setAudienceOpen(false);
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError("");

    if (!mediaItems.length) {
      setSubmitError(t("errorNoMedia"));
      return;
    }

    if (mode === "reel") {
      const reel = mediaItems[0];
      if (mediaItems.length !== 1 || reel.kind !== "video") {
        setSubmitError(t("errorReelOneVideo"));
        return;
      }
      if (reel.duration !== null && reel.duration > REEL_MAX_DURATION_SECONDS) {
        setSubmitError(t("errorVideoExceedsLimit", { seconds: REEL_MAX_DURATION_SECONDS }));
        return;
      }
    }

    const token =
      typeof window !== "undefined"
        ? localStorage.getItem("accessToken")
        : null;
    if (!token) {
      setSubmitError(t("errorMissingToken"));
      return;
    }

    const normalizedHashtags = Array.from(
      new Set((form.hashtags || []).map((tag) => normalizeHashtag(tag.toString()))),
    ).filter(Boolean);

    const normalizedMentions = Array.from(
      new Set(
        [
          ...extractMentionsFromCaption(form.caption || ""),
          ...(form.mentions || []).map((tag) =>
            tag.toString().trim().replace(/^@/, "").toLowerCase(),
          ),
        ].filter(Boolean),
      ),
    );

    const scheduledAtIso =
      form.publishMode === "schedule" && form.scheduledAt
        ? new Date(form.scheduledAt).toISOString()
        : undefined;

    startUpload({
      mode: mode as "post" | "reel",
      mediaItems: mediaItems.map((item) => ({
        file: item.file,
        kind: item.kind,
        duration: item.duration,
      })),
      payload: {
        content: form.caption || undefined,
        hashtags: normalizedHashtags,
        mentions: normalizedMentions,
        location: form.location.trim() || undefined,
        visibility: form.audience as "public" | "followers" | "private",
        allowComments: form.allowComments,
        allowDownload: form.allowDownload,
        hideLikeCount: form.hideLikeCount,
        scheduledAt: scheduledAtIso,
      },
      token,
      publishMode: form.publishMode,
    });

    resetSelection();
    router.push("/");
  };

  const requestCurrentLocation = () => {
    if (typeof window === "undefined") return;
    if (!("geolocation" in navigator)) {
      setGeoStatus("error");
      return;
    }

    setGeoStatus("requesting");

    const highOptions: PositionOptions = {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 5000,
    };

    const resolveAddress = async (
      latitude: number,
      longitude: number,
      fallback: string,
    ) => {
      try {
        const url = new URL("https://nominatim.openstreetmap.org/reverse");
        url.searchParams.set("format", "jsonv2");
        url.searchParams.set("lat", latitude.toString());
        url.searchParams.set("lon", longitude.toString());
        url.searchParams.set("addressdetails", "1");
        url.searchParams.set("accept-language", "en");

        const res = await fetch(url.toString(), {
          headers: {
            Accept: "application/json",
          },
        });
        if (!res.ok) throw new Error("reverse geocode failed");
        const data = await res.json();
        const addr = data.display_name;
        const city =
          data?.address?.city || data?.address?.town || data?.address?.village;
        const road = data?.address?.road;
        const compact = [road, city].filter(Boolean).join(", ") || addr;
        const chosen = compact || fallback;
        setForm((prev) => ({ ...prev, location: chosen }));
      } catch {
        setForm((prev) => ({ ...prev, location: fallback }));
      }
    };

    const handleSuccess = (pos: GeolocationPosition) => {
      const { latitude, longitude } = pos.coords;
      setCoords({ lat: latitude, lng: longitude });
      setGeoStatus("granted");
      const pretty = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
      resolveAddress(latitude, longitude, pretty);
    };

    const handleError = (
      err: GeolocationPositionError,
      isFallback: boolean,
    ) => {
      const shouldRetry =
        !isFallback &&
        (err.code === err.TIMEOUT || err.code === err.POSITION_UNAVAILABLE);

      if (shouldRetry) {
        navigator.geolocation.getCurrentPosition(
          handleSuccess,
          (err2) => handleError(err2, true),
          highOptions,
        );
        return;
      }

      const friendly =
        err.code === err.PERMISSION_DENIED
          ? t("errorGeoDenied")
          : err.code === err.POSITION_UNAVAILABLE
            ? t("errorGeoUnavailable")
            : err.code === err.TIMEOUT
              ? t("errorGeoTimeout")
              : t("errorGeoFailed");
      setLocationError(friendly);
      setGeoStatus(err.code === err.PERMISSION_DENIED ? "denied" : "error");
    };

    navigator.geolocation.getCurrentPosition(
      handleSuccess,
      (err) => handleError(err, false),
      highOptions,
    );
  };

  const toggle = (
    key: keyof Pick<
      FormState,
      "allowComments" | "allowDownload" | "hideLikeCount"
    >,
  ) => {
    setForm((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const addHashtag = () => {
    const tag = normalizeHashtag(hashtagDraft);
    if (!tag) return;
    setForm((prev) => {
      if (prev.hashtags.includes(tag)) return prev;
      return { ...prev, hashtags: [...prev.hashtags, tag] };
    });
    setHashtagDraft("");
  };

  const removeHashtag = (tag: string) => {
    setForm((prev) => ({
      ...prev,
      hashtags: prev.hashtags.filter((h) => h !== tag),
    }));
  };

  const removeMention = (handle: string) => {
    const escaped = handle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    setForm((prev) => ({
      ...prev,
      mentions: prev.mentions.filter((h) => h !== handle),
      caption: prev.caption.replace(
        new RegExp(`@${escaped}(?![a-zA-Z0-9_.])`, "gi"),
        "",
      ),
    }));
  };

  const onLocationKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      if (locationOpen && locationHighlight >= 0) {
        e.preventDefault();
        e.stopPropagation();
        const chosen = locationSuggestions[locationHighlight];
        if (chosen) selectLocation(chosen);
        return;
      }
      e.preventDefault();
      e.stopPropagation();
    }
    if (e.key === "ArrowDown") {
      if (!locationSuggestions.length) return;
      e.preventDefault();
      setLocationOpen(true);
      setLocationHighlight((prev) =>
        prev + 1 < locationSuggestions.length ? prev + 1 : 0,
      );
    }
    if (e.key === "ArrowUp") {
      if (!locationSuggestions.length) return;
      e.preventDefault();
      setLocationOpen(true);
      setLocationHighlight((prev) =>
        prev - 1 >= 0 ? prev - 1 : locationSuggestions.length - 1,
      );
    }
    if (e.key === "Escape") {
      setLocationOpen(false);
      setLocationHighlight(-1);
    }
  };

  const onHashtagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Thêm hashtag khi nhấn Enter, Comma hoặc Space — giống mobile app
    if (e.key === "Enter" || e.key === "," || e.key === " ") {
      e.preventDefault();
      addHashtag();
    }
  };

  useEffect(() => {
    const cleaned = mentionDraft.trim().replace(/^@/, "");
    if (!cleaned) {
      setMentionSuggestions([]);
      setMentionOpen(false);
      setMentionHighlight(-1);
      setMentionError("");
      return;
    }

    const token =
      typeof window !== "undefined"
        ? localStorage.getItem("accessToken")
        : null;

    if (!token) {
      setMentionSuggestions([]);
      setMentionOpen(false);
      setMentionHighlight(-1);
      setMentionError(t("errorNotLoggedIn"));
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
        if (!res.items.length) {
          setMentionError(t("userNotFound"));
        }
      } catch {
        if (cancelled) return;
        setMentionSuggestions([]);
        setMentionOpen(false);
        setMentionHighlight(-1);
        setMentionError(t("userNotFound"));
      } finally {
        if (!cancelled) setMentionLoading(false);
      }
    }, 320);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [mentionDraft, t]);

  const selectMention = (opt: ProfileSearchItem) => {
    const handle = opt.username.toLowerCase();
    const caption = form.caption || "";
    const range = activeMentionRange ?? {
      start: caption.length,
      end: caption.length,
    };
    const before = caption.slice(0, range.start);
    const after = caption.slice(range.end);
    const insertion = `@${handle}`;
    const needsSpaceAfter = after.startsWith(" ") || after === "" ? "" : " ";
    const nextCaption = `${before}${insertion}${needsSpaceAfter}${after}`;
    const nextMentions = form.mentions.includes(handle)
      ? form.mentions
      : [...form.mentions, handle];

    setForm((prev) => ({
      ...prev,
      caption: nextCaption,
      mentions: nextMentions,
    }));

    setConfirmedMentions((prev) => new Set([...prev, handle]));
    setMentionDraft("");
    setMentionSuggestions([]);
    setMentionOpen(false);
    setMentionHighlight(-1);
    setActiveMentionRange(null);

    setTimeout(() => {
      const el = captionRef.current;
      if (!el) return;
      const caret = range.start + insertion.length + (needsSpaceAfter ? 1 : 0);
      el.focus();
      el.setSelectionRange(caret, caret);
    }, 0);
  };

  useEffect(() => {
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
        setLocationError(t("errorNoLocationSuggestions"));
      } finally {
        if (!controller.signal.aborted) setLocationLoading(false);
      }
    }, 350);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [locationQuery, t]);

  const selectLocation = (option: {
    label: string;
    lat: string;
    lon: string;
  }) => {
    setForm((prev) => ({ ...prev, location: option.label }));
    setLocationInput(option.label);
    setLocationQuery(option.label);
    setLocationSuggestions([]);
    setLocationOpen(false);
    setLocationHighlight(-1);
  };

  const onLocationChange = (value: string) => {
    setLocationInput(value);
    setForm((prev) => ({ ...prev, location: value }));
    setLocationQuery(value);
  };

  const onLocationBlur = () => {
    setTimeout(() => {
      setLocationOpen(false);
      setLocationHighlight(-1);
    }, 120);
  };

  const onLocationFocus = () => {
    if (locationSuggestions.length) {
      setLocationOpen(true);
    }
  };

  if (!canRender) return null;

  const renderHighlightedCaption = (text: string): React.ReactNode[] => {
    const nodes: React.ReactNode[] = [];
    const regex = /@(\w+)/g;
    let lastIdx = 0;
    let m: RegExpExecArray | null;
    let key = 0;
    while ((m = regex.exec(text)) !== null) {
      if (m.index > lastIdx) nodes.push(<span key={key++}>{text.slice(lastIdx, m.index)}</span>);
      const handle = m[1].toLowerCase();
      if (confirmedMentions.has(handle)) {
        nodes.push(<span key={key++} className={styles.captionMentionToken}>@{m[1]}</span>);
      } else {
        nodes.push(<span key={key++}>@{m[1]}</span>);
      }
      lastIdx = regex.lastIndex;
    }
    if (lastIdx < text.length) nodes.push(<span key={key++}>{text.slice(lastIdx)}</span>);
    if (text.endsWith("\n")) nodes.push(<span key={key++}>{"​"}</span>);
    return nodes;
  };

  const syncOverlayScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    if (captionOverlayRef.current) {
      captionOverlayRef.current.scrollTop = e.currentTarget.scrollTop;
    }
  };

  if (accountLimited.active) {
    const untilLabel = accountLimited.indefinitely
      ? t("limitUntilModerator")
      : accountLimited.until
        ? t("limitUntilDate", { date: new Date(accountLimited.until).toLocaleString() })
        : t("limitTemporarily");

    return (
      <div className={styles.screen}>
        <div className={styles.limitNotice}>
          <h1 className={styles.limitTitle}>{t("limitTitle")}</h1>
          <p className={styles.limitText}>
            {t("limitText", { untilLabel })}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.screen}>
      <div className={styles.headerRow}>
        <div>
          <p className={styles.eyebrow}>
            {mode === "reel" ? t("eyebrowReel") : mode === "livestream" ? t("eyebrowLivestream") : mode === "poll" ? "Tạo nội dung" : mode === "story" ? t("eyebrowStory") : t("eyebrowPost")}
          </p>
          <h1 className={styles.title}>
            {mode === "reel"
              ? t("titleReel")
              : mode === "livestream"
                ? t("titleLivestream")
                : mode === "poll"
                  ? "Cuộc bình chọn"
                  : mode === "story"
                    ? t("titleStory")
                    : t("titlePost")}
          </h1>
          <div className={styles.modeSwitch}>
            <button
              type="button"
              className={`${styles.modeButton} ${
                mode === "post" ? styles.modeButtonActive : ""
              }`}
              onClick={() => {
                setMode("post");
                setError("");
                resetSelection();
              }}
            >
              <span className={styles.modeButtonInner}>
                <TabPostIcon />
                <span>{t("tabPost")}</span>
              </span>
            </button>
            <button
              type="button"
              className={`${styles.modeButton} ${
                mode === "reel" ? styles.modeButtonActive : ""
              }`}
              onClick={() => {
                setMode("reel");
                setError("");
                resetSelection();
              }}
            >
              <span className={styles.modeButtonInner}>
                <TabReelIcon />
                <span>{t("tabReel")}</span>
              </span>
            </button>
            <button
              type="button"
              className={`${styles.modeButton} ${
                mode === "livestream" ? styles.modeButtonActive : ""
              }`}
              onClick={() => {
                setMode("livestream");
                setError("");
                resetSelection();
              }}
            >
              <span className={styles.modeButtonInner}>
                <TabLivestreamIcon />
                <span>{t("tabLivestream")}</span>
              </span>
            </button>
            <button
              type="button"
              className={`${styles.modeButton} ${
                mode === "poll" ? styles.modeButtonActive : ""
              }`}
              onClick={() => {
                setMode("poll");
                setError("");
                resetSelection();
              }}
            >
              <span className={styles.modeButtonInner}>
                <TabPollIcon />
                <span>Bình chọn</span>
              </span>
            </button>
            <button
              type="button"
              className={`${styles.modeButton} ${
                mode === "story" ? styles.modeButtonActive : ""
              }`}
              onClick={() => {
                setMode("story");
                setError("");
                resetSelection();
                setStoryCreated(false);
              }}
            >
              <span className={styles.modeButtonInner}>
                <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7"/>
                  <circle cx="12" cy="12" r="3.5" fill="currentColor"/>
                </svg>
                <span>{t("tabStory")}</span>
              </span>
            </button>
          </div>
        </div>
        {mode !== "livestream" && mode !== "poll" && mode !== "story" ? (
          <div className={styles.stepper}>
            <div
              className={`${styles.step} ${
                step === "select" ? styles.stepActive : ""
              }`}
            >
              <span className={styles.stepNumber}>1</span>
              <div>
                <p className={styles.stepLabel}>{t("stepChoose")}</p>
              </div>
            </div>
            <div
              className={`${styles.step} ${
                step === "details" ? styles.stepActive : ""
              }`}
            >
              <span className={styles.stepNumber}>2</span>
              <div>
                <p className={styles.stepLabel}>{t("stepDetails")}</p>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {mode === "story" ? (
        storyCreated ? (
          <div style={{ textAlign: "center", padding: "48px 24px" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>{t("storyPosted")}</div>
            <button
              style={{ background: "var(--color-primary,#6366f1)", color: "#fff", border: "none", borderRadius: 12, padding: "11px 28px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
              onClick={() => { setStoryCreated(false); setMode("story"); }}
            >
              {t("postAnother")}
            </button>
          </div>
        ) : (
          <StoryCreator
            token={typeof window !== "undefined" ? localStorage.getItem("accessToken") ?? "" : ""}
            onCreated={() => setStoryCreated(true)}
          />
        )
      ) : mode === "livestream" ? (
        <LivestreamCreatePanel />
      ) : mode === "poll" ? (
        <PollCreateForm
          form={form}
          setForm={setForm}
          pollOptions={pollOptions}
          pollOptionPreviews={pollOptionPreviews}
          pollAllowMultiple={pollAllowMultiple}
          setPollAllowMultiple={setPollAllowMultiple}
          pollSubmitError={pollSubmitError}
          pollImageInputRefs={pollImageInputRefs}
          audienceOptions={audienceOptions}
          selectedAudience={selectedAudience}
          audienceOpen={audienceOpen}
          setAudienceOpen={setAudienceOpen}
          audienceRef={audienceRef}
          locationInput={locationInput}
          setLocationInput={setLocationInput}
          locationQuery={locationQuery}
          setLocationQuery={setLocationQuery}
          locationSuggestions={locationSuggestions}
          locationLoading={locationLoading}
          locationOpen={locationOpen}
          setLocationOpen={setLocationOpen}
          locationHighlight={locationHighlight}
          setLocationHighlight={setLocationHighlight}
          locationError={locationError}
          hashtagDraft={hashtagDraft}
          setHashtagDraft={setHashtagDraft}
          mentionDraft={mentionDraft}
          setMentionDraft={setMentionDraft}
          mentionSuggestions={mentionSuggestions}
          mentionOpen={mentionOpen}
          mentionLoading={mentionLoading}
          mentionError={mentionError}
          mentionHighlight={mentionHighlight}
          setMentionHighlight={setMentionHighlight}
          activeMentionRange={activeMentionRange}
          showEmojiPicker={showEmojiPicker}
          setShowEmojiPicker={setShowEmojiPicker}
          emojiRef={emojiRef}
          captionRef={captionRef}
          scheduledDate={scheduledDate}
          scheduledTime={scheduledTime}
          addPollOption={addPollOption}
          removePollOption={removePollOption}
          updatePollOptionText={updatePollOptionText}
          handlePollOptionImage={handlePollOptionImage}
          removePollOptionImage={removePollOptionImage}
          handlePollSubmit={handlePollSubmit}
          onCancel={resetSelection}
          onAudienceSelect={handleAudienceSelect}
          onHashtagKey={onHashtagKeyDown}
          onMentionSelect={selectMention}
          confirmedMentions={confirmedMentions}
          captionOverlayRef={captionOverlayRef}
          renderHighlightedCaption={renderHighlightedCaption}
          syncOverlayScroll={syncOverlayScroll}
          onLocationSelect={selectLocation}
          onRequestLocation={requestCurrentLocation}
          onCaptionChange={handleCaptionChange}
          onCaptionKeyDown={onCaptionKeyDown}
          onEmojiSelect={insertEmoji}
          onScheduleDateChange={(d: Date | null) => {
            if (!d) {
              setForm((prev) => ({ ...prev, scheduledAt: "" }));
              return;
            }
            const dateStr = formatLocalDate(d);
            setForm((prev) => {
              const parts = splitSchedule(prev.scheduledAt);
              const nextTime = clampTimeForDate(
                dateStr,
                parts.time || formatLocalTime(new Date()),
              );
              return { ...prev, scheduledAt: buildSchedule(dateStr, nextTime) };
            });
          }}
          onScheduleTimeChange={(t2: string) =>
            setForm((prev) => {
              const parts = splitSchedule(prev.scheduledAt);
              if (!parts.date) return prev;
              const nextTime = clampTimeForDate(parts.date, t2);
              return { ...prev, scheduledAt: buildSchedule(parts.date, nextTime) };
            })
          }
          geoStatus={geoStatus}
        />
      ) : (
        <>
          <input
            ref={fileInputRef}
            id="fileInput"
            type="file"
            accept={mode === "reel" ? "video/*" : "image/*,video/*"}
            multiple={mode === "post"}
            className={styles.hiddenInput}
            onChange={onInputChange}
          />

          {step === "select" ? (
        <div className={styles.selectGrid}>
          <label
            className={`${styles.dropzone} ${
              dragActive ? styles.dropzoneActive : ""
            }`}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            htmlFor="fileInput"
          >
            <div className={styles.dropContent}>
              <div className={styles.dropBadge}>{t("dropBadge")}</div>
              <h2 className={styles.dropTitle}>
                {mode === "reel" ? t("dropTitleReel") : t("dropTitlePost")}
              </h2>
              <p className={styles.dropText}>
                {mode === "reel" ? t("dropTextReel") : t("dropTextPost")}
              </p>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={openFileDialog}
                >
                  {t("chooseFromDevice")}
                </button>
              </div>
              {error && <p className={styles.error}>{error}</p>}
            </div>
          </label>

          <div className={styles.tipsCard}>
            <p className={styles.tipsTitle}>{t("tipsTitle")}</p>
            <ul className={styles.tipsList}>
              {mode === "reel" ? (
                <>
                  <li>{t("tipsReel1")}</li>
                  <li>{t("tipsReel2")}</li>
                  <li>{t("tipsReel3")}</li>
                  <li>{t("tipsReel4")}</li>
                </>
              ) : (
                <>
                  <li>{t("tipsPost1")}</li>
                  <li>{t("tipsPost2")}</li>
                  <li>{t("tipsPost3")}</li>
                  <li>{t("tipsPost4")}</li>
                </>
              )}
            </ul>
            <div className={styles.palette}>
              <span />
              <span />
              <span />
            </div>
          </div>
        </div>
          ) : (
        <form className={styles.detailsGrid} onSubmit={handleSubmit}>
          <div className={styles.previewCard}>
            <div className={styles.cardHeader}>
              <div>
                <p className={styles.cardEyebrow}>{t("selectedContent")}</p>
                <p className={styles.cardTitle}>
                  {mediaItems.length
                    ? t("itemsSelected", { count: mediaItems.length })
                    : t("noContentChosen")}
                </p>
                <p className={styles.meta}>{totalSizeLabel}</p>
              </div>
              <div className={styles.cardActions}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={resetSelection}
                >
                  {t("cancel")}
                </button>
                <button
                  type="button"
                  className={styles.primaryGhost}
                  onClick={openFileDialog}
                >
                  {mode === "reel" ? t("changeFile") : t("addMore")}
                </button>
              </div>
            </div>

            <div className={styles.mediaFrame}>
              {mediaItems.length ? (
                <div
                  className={
                    mode === "reel"
                      ? styles.reelPreviewGrid
                      : styles.previewGrid
                  }
                >
                  {mediaItems.map((item, index) => (
                    <div
                      key={`${item.file.name}-${index}`}
                      className={`${styles.previewTile} ${
                        mode === "reel" ? styles.reelTile : ""
                      }`}
                    >
                      {mode === "post" ? (
                        <div className={styles.previewBadges}>
                          <span className={styles.previewBadge}>
                            {item.kind}
                          </span>
                          {item.kind === "video" && item.duration !== null ? (
                            <span className={styles.previewBadgeMuted}>
                              {item.duration.toFixed(1)}s
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                      <button
                        type="button"
                        className={styles.previewRemove}
                        onClick={() => removeMedia(index)}
                        aria-label={`Remove ${item.file.name}`}
                      >
                        ×
                      </button>
                      {item.kind === "video" ? (
                        <video
                          src={item.previewUrl}
                          controls
                          controlsList="nodownload noremoteplayback"
                          onContextMenu={(e) => e.preventDefault()}
                          className={`${styles.media} ${
                            mode === "reel" ? styles.reelMedia : ""
                          }`}
                        />
                      ) : (
                        <img
                          src={item.previewUrl}
                          alt="Preview"
                          className={`${styles.media} ${
                            mode === "reel" ? styles.reelMedia : ""
                          }`}
                        />
                      )}
                      {mode === "reel" && item.kind === "video" ? (
                        <div className={styles.reelCropHint}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <rect x="3" y="3" width="18" height="18" rx="2" />
                            <path d="M3 9h18M3 15h18" />
                          </svg>
                          {t("reelAutoCropHint")}
                        </div>
                      ) : null}
                      {mode === "post" ? (
                        <p className={styles.previewMeta}>
                          {item.file.name} ·{" "}
                          {(item.file.size / 1024 / 1024).toFixed(1)} MB
                        </p>
                      ) : null}
                    </div>
                  ))}
                  {canAddMore ? (
                    <button
                      type="button"
                      className={styles.addTile}
                      onClick={openFileDialog}
                    >
                      <span className={styles.addTileIcon}>+</span>
                      <span className={styles.addTileText}>{t("addMore")}</span>
                    </button>
                  ) : null}
                </div>
              ) : (
                <div className={styles.mediaPlaceholder}>{t("noContentYet")}</div>
              )}
            </div>
          </div>

          <div className={styles.formCard}>
            <div>
              <p className={styles.cardEyebrow}>
                {mode === "reel" ? t("reelDetails") : t("postDetails")}
              </p>
            </div>

            <div className={styles.formGroup}>
              <div className={styles.labelRow}>
                <label htmlFor="caption">{t("captionLabel")}</label>
                <div className={styles.emojiWrap} ref={emojiRef}>
                  <button
                    type="button"
                    className={styles.emojiButton}
                    onClick={() => setShowEmojiPicker((prev) => !prev)}
                    aria-label={t("addEmojiAria")}
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
                  {showEmojiPicker && (
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
                  )}
                </div>
              </div>
              <div
                className={`${styles.inputShell} ${styles.textareaShell} ${styles.mentionCombo}`}
              >
                <div className={styles.captionWrapper}>
                  {confirmedMentions.size > 0 && (
                    <div
                      ref={captionOverlayRef}
                      className={styles.captionHighlightOverlay}
                      aria-hidden
                    >
                      {renderHighlightedCaption(form.caption)}
                    </div>
                  )}
                  <textarea
                    id="caption"
                    name="caption"
                    ref={captionRef}
                    placeholder={t("captionPlaceholder")}
                    value={form.caption}
                    onChange={handleCaptionChange}
                    onKeyDown={onCaptionKeyDown}
                    onScroll={confirmedMentions.size > 0 ? syncOverlayScroll : undefined}
                    onBlur={() => {
                      setTimeout(() => {
                        setMentionOpen(false);
                        setMentionHighlight(-1);
                        setActiveMentionRange(null);
                      }, 120);
                    }}
                    maxLength={2200}
                    className={confirmedMentions.size > 0 ? styles.captionHighlightTextarea : undefined}
                  />
                </div>
                <span className={styles.charCount}>
                  {form.caption.length}/2200
                </span>
                {mentionOpen && (
                  <div className={styles.mentionSuggestions}>
                    {mentionLoading && (
                      <div className={styles.mentionSuggestionMuted}>
                        {t("searchingUsers")}
                      </div>
                    )}
                    {!mentionLoading &&
                      mentionSuggestions.length === 0 &&
                      mentionError && (
                        <div className={styles.mentionSuggestionMuted}>
                          {mentionError}
                        </div>
                      )}
                    {!mentionLoading &&
                      mentionSuggestions.map((opt, idx) => (
                        <button
                          type="button"
                          key={opt.id}
                          className={`${styles.mentionSuggestion} ${
                            idx === mentionHighlight
                              ? styles.mentionSuggestionActive
                              : ""
                          }`}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            selectMention(opt);
                          }}
                          onMouseEnter={() => setMentionHighlight(idx)}
                        >
                          <img
                            src={opt.avatarUrl}
                            alt=""
                            className={styles.mentionAvatar}
                          />
                          <div className={styles.mentionMeta}>
                            <span className={styles.mentionName}>
                              {opt.displayName}
                            </span>
                            <span className={styles.mentionUsername}>
                              @{opt.username}
                            </span>
                          </div>
                          {typeof opt.followersCount === "number" && (
                            <span className={styles.mentionStat}>
                              {t("followers", { count: opt.followersCount.toLocaleString() })}
                            </span>
                          )}
                        </button>
                      ))}
                  </div>
                )}
              </div>
              <p className={styles.helper}>{t("captionHelper")}</p>
              {form.mentions.length > 0 && (
                <div className={styles.chipShell}>
                  <div className={styles.chips}>
                    {form.mentions.map((handle) => (
                      <span key={handle} className={styles.chip}>
                        @{handle}
                        <button
                          type="button"
                          onClick={() => removeMention(handle)}
                          aria-label={`Remove tag ${handle}`}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className={styles.rowGroup}>
              <div className={styles.formGroup}>
                <label>{t("hashtagsLabel")}</label>
                <div className={styles.chipShell}>
                  <div className={styles.chips}>
                    {form.hashtags.map((tag) => (
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
                        form.hashtags.length ? t("addHashtag") : t("hashtagPlaceholder")
                      }
                      value={hashtagDraft}
                      onChange={(e) =>
                        setHashtagDraft(normalizeHashtag(e.target.value))
                      }
                      onKeyDown={onHashtagKeyDown}
                    />
                    {/* Mobile: nút + để thêm hashtag không cần nhấn Enter */}
                    <button
                      type="button"
                      className={styles.hashtagAddBtn}
                      onClick={addHashtag}
                      aria-label="Add hashtag"
                    >
                      +
                    </button>
                  </div>
                </div>
                <p className={styles.fieldHint}>{t("hashtagHint")}</p>
              </div>
            </div>

            <div className={styles.rowGroup}>
              <div className={styles.formGroup}>
                <label htmlFor="location">{t("locationLabel")}</label>
                <div className={styles.locationCombo}>
                  <div className={styles.inputShell}>
                    <input
                      id="location"
                      name="location"
                      placeholder={t("locationPlaceholder")}
                      value={locationInput}
                      onChange={(e) => onLocationChange(e.target.value)}
                      onKeyDown={onLocationKeyDown}
                      onBlur={onLocationBlur}
                      onFocus={onLocationFocus}
                    />
                    <button
                      type="button"
                      className={styles.ghostButton}
                      onClick={requestCurrentLocation}
                      disabled={geoStatus === "requesting"}
                    >
                      <LocationIcon />
                    </button>
                  </div>
                  {locationOpen && (
                    <div className={styles.locationSuggestions}>
                      {locationLoading && (
                        <div className={styles.locationSuggestionMuted}>
                          {t("searching")}
                        </div>
                      )}
                      {!locationLoading && locationSuggestions.length === 0 && (
                        <div className={styles.locationSuggestionMuted}>
                          {locationError || t("noSuggestions")}
                        </div>
                      )}
                      {!locationLoading &&
                        locationSuggestions.map((option, idx) => (
                          <button
                            type="button"
                            key={`${option.lat}-${option.lon}-${idx}`}
                            className={`${styles.locationSuggestion} ${
                              idx === locationHighlight
                                ? styles.locationSuggestionActive
                                : ""
                            }`}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              selectLocation(option);
                            }}
                            onMouseEnter={() => setLocationHighlight(idx)}
                          >
                            <span className={styles.locationSuggestionText}>
                              {option.label}
                            </span>
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="audience">{t("visibilityLabel")}</label>

                {/* Mobile: full-width radio cards giống Flutter */}
                <div className={styles.mobileAudienceList}>
                  {audienceOptions.map((option) => {
                    const isSelected = form.audience === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        className={`${styles.mobileAudienceCard} ${isSelected ? styles.mobileAudienceCardActive : ""}`}
                        onClick={() => handleAudienceSelect(option.value)}
                      >
                        <span className={styles.mobileAudienceIcon}>
                          {option.value === "public" ? (
                            <svg aria-hidden width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="10" />
                              <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10A15.3 15.3 0 0 1 12 2z" />
                            </svg>
                          ) : option.value === "followers" ? (
                            <svg aria-hidden width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="9" cy="7" r="4" />
                              <path d="M3 21v-2a7 7 0 0 1 7-7h4" />
                              <circle cx="19" cy="15" r="3" />
                              <path d="M19 12v6M16 15h6" />
                            </svg>
                          ) : (
                            <svg aria-hidden width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                              <rect x="3" y="11" width="18" height="11" rx="2" />
                              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                            </svg>
                          )}
                        </span>
                        <span className={styles.mobileAudienceLabel}>{option.label}</span>
                        {isSelected && (
                          <svg aria-hidden width={20} height={20} viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"
                            style={{ color: "var(--color-primary)", flexShrink: 0 }}>
                            <path d="M20 6 9 17l-5-5" />
                          </svg>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Desktop: dropdown (hidden on mobile) */}
                <div className={`${styles.dropdownShell} ${styles.desktopOnly}`} ref={audienceRef}>
                  <button
                    type="button"
                    id="audience"
                    className={`${styles.dropdownButton} ${
                      audienceOpen ? styles.dropdownButtonOpen : ""
                    }`}
                    aria-haspopup="listbox"
                    aria-expanded={audienceOpen}
                    onClick={() => setAudienceOpen((prev) => !prev)}
                  >
                    <div className={styles.dropdownText}>
                      <span className={styles.dropdownLabel}>
                        {selectedAudience.label}
                      </span>
                    </div>
                    <span
                      className={`${styles.dropdownChevron} ${
                        audienceOpen ? styles.dropdownChevronOpen : ""
                      }`}
                      aria-hidden
                    >
                      ▼
                    </span>
                  </button>
                  {audienceOpen && (
                    <div
                      className={styles.dropdownMenu}
                      role="listbox"
                      aria-label={t("visibilityAria")}
                    >
                      {audienceOptions.map((option) => (
                        <button
                          type="button"
                          key={option.value}
                          className={`${styles.dropdownOption} ${
                            form.audience === option.value
                              ? styles.dropdownOptionActive
                              : ""
                          }`}
                          role="option"
                          aria-selected={form.audience === option.value}
                          onClick={() => handleAudienceSelect(option.value)}
                        >
                          <span>{option.label}</span>
                          <span
                            className={`${styles.dropdownCheck} ${
                              form.audience === option.value
                                ? styles.dropdownCheckActive
                                : ""
                            }`}
                            aria-hidden
                          >
                            {form.audience === option.value ? "✓" : ""}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Toggle switches — iOS-style trên mobile */}
            <div className={styles.switchGroup}>
              <label className={styles.switchRow}>
                <input
                  type="checkbox"
                  checked={form.allowComments}
                  onChange={() => toggle("allowComments")}
                />
                <div>
                  <p className={styles.switchTitle}>{t("allowCommentsTitle")}</p>
                  <p className={styles.switchHint}>{t("allowCommentsHint")}</p>
                </div>
              </label>

              <label className={styles.switchRow}>
                <input
                  type="checkbox"
                  checked={form.allowDownload}
                  onChange={() => toggle("allowDownload")}
                />
                <div>
                  <p className={styles.switchTitle}>{t("allowDownloadsTitle")}</p>
                  <p className={styles.switchHint}>{t("allowDownloadsHint")}</p>
                </div>
              </label>

              <label className={styles.switchRow}>
                <input
                  type="checkbox"
                  checked={form.hideLikeCount}
                  onChange={() => toggle("hideLikeCount")}
                />
                <div>
                  <p className={styles.switchTitle}>{t("hideLikeTitle")}</p>
                  <p className={styles.switchHint}>{t("hideLikeHint")}</p>
                </div>
              </label>
            </div>

            <div className={styles.formGroup}>
              <label>{t("publishTimeLabel")}</label>
              <div className={styles.radioRow}>
                <label className={styles.radioOption}>
                  <input
                    type="radio"
                    name="publishMode"
                    value="now"
                    checked={form.publishMode === "now"}
                    onChange={() =>
                      setForm((prev) => ({ ...prev, publishMode: "now" }))
                    }
                  />
                  <span>{t("postNow")}</span>
                </label>
                <label className={styles.radioOption}>
                  <input
                    type="radio"
                    name="publishMode"
                    value="schedule"
                    checked={form.publishMode === "schedule"}
                    onChange={() =>
                      setForm((prev) => {
                        const now = new Date();
                        const parts = splitSchedule(prev.scheduledAt);
                        const nextDate = parts.date || formatLocalDate(now);
                        const nextTime = clampTimeForDate(
                          nextDate,
                          parts.time || formatLocalTime(now),
                        );
                        return {
                          ...prev,
                          publishMode: "schedule",
                          scheduledAt: buildSchedule(nextDate, nextTime),
                        };
                      })
                    }
                  />
                  <span>{t("schedule")}</span>
                </label>
                <span className={styles.helper}>{t("publishAutoHelper")}</span>
              </div>

              {form.publishMode === "schedule" && (
                <div className={styles.schedulerCard}>
                  <div className={styles.schedulerHeader}>
                    <div>
                      <p className={styles.schedulerLabel}>{t("schedulerLabel")}</p>
                      <p className={styles.schedulerTitle}>{t("chooseDatetime")}</p>
                    </div>
                  </div>

                  <div className={styles.schedulerGrid}>
                    <div className={styles.schedulerField}>
                      <label className={styles.schedulerFieldLabel}>{t("dateLabel")}</label>
                      <DateSelect
                        value={scheduledDate}
                        minDate={new Date()}
                        maxDate={null}
                        minYear={new Date().getFullYear()}
                        placeholder="mm/dd/yyyy"
                        onChange={(next) => {
                          if (!next) {
                            setForm((prev) => ({
                              ...prev,
                              scheduledAt: "",
                            }));
                            return;
                          }
                          setForm((prev) => {
                            const parts = splitSchedule(prev.scheduledAt);
                            const nextTime = clampTimeForDate(
                              next,
                              parts.time || formatLocalTime(new Date()),
                            );
                            return {
                              ...prev,
                              scheduledAt: buildSchedule(next, nextTime),
                            };
                          });
                        }}
                      />
                    </div>

                    <div className={styles.schedulerField}>
                      <label className={styles.schedulerFieldLabel}>{t("timeLabel")}</label>
                      <TimeSelect
                        value={scheduledTime}
                        selectedDate={scheduledDate}
                        minDateTime={new Date()}
                        disabled={!scheduledDate}
                        onChange={(next) => {
                          setForm((prev) => {
                            const parts = splitSchedule(prev.scheduledAt);
                            if (!parts.date) return prev;
                            const nextTime = clampTimeForDate(parts.date, next);
                            return {
                              ...prev,
                              scheduledAt: buildSchedule(parts.date, nextTime),
                            };
                          });
                        }}
                      />
                    </div>
                  </div>

                  <p className={styles.schedulerHint}>{t("schedulerHint")}</p>
                </div>
              )}
            </div>

            <div className={styles.footerActions}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={resetSelection}
              >
                {t("cancel")}
              </button>
              <button
                type="submit"
                className={styles.primaryButton}
                disabled={!mediaItems.length}
              >
                {t("finish")}
              </button>
            </div>

            {submitError && (
              <p className={styles.error} role="alert">
                {submitError}
              </p>
            )}
          </div>
        </form>
          )}
        </>
      )}
    </div>
  );
}

// ─── Poll Create Form component ────────────────────────────────────────────────
function PollCreateForm({
  form, setForm,
  pollOptions, pollOptionPreviews, pollAllowMultiple, setPollAllowMultiple,
  pollSubmitError, pollImageInputRefs,
  audienceOptions, selectedAudience, audienceOpen, setAudienceOpen, audienceRef,
  locationInput, setLocationInput, locationQuery, setLocationQuery,
  locationSuggestions, locationLoading, locationOpen, setLocationOpen,
  locationHighlight, setLocationHighlight, locationError,
  hashtagDraft, setHashtagDraft, mentionDraft, setMentionDraft,
  mentionSuggestions, mentionOpen, mentionLoading, mentionError, mentionHighlight, setMentionHighlight,
  activeMentionRange, showEmojiPicker, setShowEmojiPicker, emojiRef, captionRef,
  scheduledDate, scheduledTime,
  addPollOption, removePollOption, updatePollOptionText,
  handlePollOptionImage, removePollOptionImage, handlePollSubmit, onCancel,
  onAudienceSelect, onHashtagKey, onMentionSelect, onLocationSelect,
  onRequestLocation, onCaptionChange, onCaptionKeyDown, onEmojiSelect,
  onScheduleDateChange, onScheduleTimeChange, geoStatus,
  confirmedMentions, captionOverlayRef, renderHighlightedCaption, syncOverlayScroll,
}: any) {
  const t = useTranslations("create");
  const hasImages = pollOptionPreviews.some(Boolean);

  return (
    <form onSubmit={handlePollSubmit}>
      <div className={styles.pollGrid}>
        {/* LEFT: Post settings + Options */}
        <div style={{ display: "grid", gap: 16 }}>

          {/* Caption + Hashtag + Location + Visibility — single card */}
          <div className={styles.formCard}>
            <div>
              <p className={styles.cardEyebrow}>Câu hỏi &amp; Caption</p>
            </div>

            {/* Caption */}
            <div className={styles.formGroup}>
              <div className={styles.labelRow}>
                <label htmlFor="pollCaption">{t("captionLabel")}</label>
                <div className={styles.emojiWrap} ref={emojiRef}>
                  <button
                    type="button"
                    className={styles.emojiButton}
                    onClick={() => setShowEmojiPicker((p: boolean) => !p)}
                    aria-label={t("addEmojiAria")}
                  >
                    <svg aria-label="Emoji icon" fill="currentColor" height="20" role="img" viewBox="0 0 24 24" width="20">
                      <title>Emoji icon</title>
                      <path d="M15.83 10.997a1.167 1.167 0 1 0 1.167 1.167 1.167 1.167 0 0 0-1.167-1.167Zm-6.5 1.167a1.167 1.167 0 1 0-1.166 1.167 1.167 1.167 0 0 0 1.166-1.167Zm5.163 3.24a3.406 3.406 0 0 1-4.982.007 1 1 0 1 0-1.557 1.256 5.397 5.397 0 0 0 8.09 0 1 1 0 0 0-1.55-1.263ZM12 .503a11.5 11.5 0 1 0 11.5 11.5A11.513 11.513 0 0 0 12 .503Zm0 21a9.5 9.5 0 1 1 9.5-9.5 9.51 9.51 0 0 1-9.5 9.5Z" />
                    </svg>
                  </button>
                  {showEmojiPicker && (
                    <div className={styles.emojiPopover}>
                      <EmojiPicker
                        onEmojiClick={(emojiData) => { onEmojiSelect(emojiData.emoji || ""); }}
                        searchDisabled={false}
                        skinTonesDisabled={false}
                        lazyLoadEmojis
                      />
                    </div>
                  )}
                </div>
              </div>
              <div className={`${styles.inputShell} ${styles.textareaShell} ${styles.mentionCombo}`}>
                <div className={styles.captionWrapper}>
                  {confirmedMentions?.size > 0 && (
                    <div ref={captionOverlayRef} className={styles.captionHighlightOverlay} aria-hidden>
                      {renderHighlightedCaption?.(form.caption)}
                    </div>
                  )}
                  <textarea
                    id="pollCaption"
                    name="caption"
                    ref={captionRef}
                    placeholder="Đặt câu hỏi bình chọn… Nhập @ để gắn thẻ bạn bè"
                    value={form.caption}
                    onChange={onCaptionChange}
                    onKeyDown={onCaptionKeyDown}
                    onScroll={confirmedMentions?.size > 0 ? syncOverlayScroll : undefined}
                    onBlur={() => { setTimeout(() => setMentionHighlight(-1), 120); }}
                    maxLength={2200}
                    className={confirmedMentions?.size > 0 ? styles.captionHighlightTextarea : undefined}
                  />
                </div>
                <span className={styles.charCount}>{form.caption.length}/2200</span>
                {mentionOpen && (
                  <div className={styles.mentionSuggestions}>
                    {mentionLoading && <div className={styles.mentionSuggestionMuted}>{t("searchingUsers")}</div>}
                    {!mentionLoading && mentionSuggestions.length === 0 && mentionError && (
                      <div className={styles.mentionSuggestionMuted}>{mentionError}</div>
                    )}
                    {!mentionLoading && mentionSuggestions.map((opt: any, idx: number) => (
                      <button
                        type="button"
                        key={opt.id}
                        className={`${styles.mentionSuggestion} ${idx === mentionHighlight ? styles.mentionSuggestionActive : ""}`}
                        onMouseDown={(e) => { e.preventDefault(); onMentionSelect(opt); }}
                        onMouseEnter={() => setMentionHighlight(idx)}
                      >
                        <img src={opt.avatarUrl} alt="" className={styles.mentionAvatar} />
                        <div className={styles.mentionMeta}>
                          <span className={styles.mentionName}>{opt.displayName}</span>
                          <span className={styles.mentionUsername}>@{opt.username}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <p className={styles.helper}>{t("captionHelper")}</p>
            </div>

            {/* Hashtags */}
            <div className={styles.formGroup}>
              <label>{t("hashtagsLabel")}</label>
              <div className={styles.chipShell}>
                <div className={styles.chips}>
                  {form.hashtags.map((tag: string) => (
                    <span key={tag} className={styles.chip}>
                      #{tag}
                      <button
                        type="button"
                        className={styles.chipRemove}
                        onClick={() => setForm((p: any) => ({ ...p, hashtags: p.hashtags.filter((h: string) => h !== tag) }))}
                      >×</button>
                    </span>
                  ))}
                </div>
                <input
                  className={styles.chipInput}
                  placeholder="#hashtag"
                  value={hashtagDraft}
                  onChange={(e) => setHashtagDraft(e.target.value)}
                  onKeyDown={onHashtagKey}
                />
              </div>
              <p className={styles.fieldHint}>{t("hashtagHint")}</p>
            </div>

            {/* Location */}
            <div className={styles.formGroup}>
              <label>{t("locationLabel")}</label>
              <div className={styles.inputShell} style={{ position: "relative" }}>
                <input
                  className={styles.input}
                  placeholder={t("locationPlaceholder")}
                  value={locationInput}
                  onChange={(e) => { setLocationInput(e.target.value); setLocationQuery(e.target.value); }}
                  onFocus={() => setLocationOpen(true)}
                />
                <button type="button" className={styles.locationGeoBtn} onClick={onRequestLocation} aria-label="Lấy vị trí hiện tại">
                  <LocationIcon />
                </button>
                {locationOpen && locationSuggestions.length > 0 && (
                  <div className={styles.locationSuggestions}>
                    {locationSuggestions.map((s: any, i: number) => (
                      <button
                        key={s.label}
                        type="button"
                        className={`${styles.locationSuggestion} ${i === locationHighlight ? styles.locationSuggestionHighlighted : ""}`}
                        onMouseDown={(e) => { e.preventDefault(); onLocationSelect(s); }}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {locationError && <p className={styles.error}>{locationError}</p>}
            </div>

          {/* Visibility + toggles */}
            <div className={styles.formGroup}>
              <label htmlFor="pollAudience">{t("visibilityLabel")}</label>
              <div className={styles.dropdownShell} ref={audienceRef}>
                <button
                  type="button"
                  id="pollAudience"
                  className={`${styles.dropdownButton} ${audienceOpen ? styles.dropdownButtonOpen : ""}`}
                  aria-haspopup="listbox"
                  aria-expanded={audienceOpen}
                  onClick={() => setAudienceOpen((p: boolean) => !p)}
                >
                  <div className={styles.dropdownText}>
                    <span className={styles.dropdownLabel}>{selectedAudience?.label}</span>
                  </div>
                  <span className={`${styles.dropdownChevron} ${audienceOpen ? styles.dropdownChevronOpen : ""}`} aria-hidden>▼</span>
                </button>
                {audienceOpen && (
                  <div className={styles.dropdownMenu} role="listbox" aria-label={t("visibilityAria")}>
                    {audienceOptions.map((opt: any) => (
                      <button
                        key={opt.value}
                        type="button"
                        className={`${styles.dropdownOption} ${form.audience === opt.value ? styles.dropdownOptionActive : ""}`}
                        role="option"
                        aria-selected={form.audience === opt.value}
                        onClick={() => onAudienceSelect(opt.value)}
                      >
                        <span>{opt.label}</span>
                        <span className={`${styles.dropdownCheck} ${form.audience === opt.value ? styles.dropdownCheckActive : ""}`} aria-hidden>
                          {form.audience === opt.value ? "✓" : ""}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className={styles.switchGroup}>
              <label className={styles.switchRow}>
                <input
                  type="checkbox"
                  checked={form.allowComments}
                  onChange={() => setForm((p: any) => ({ ...p, allowComments: !p.allowComments }))}
                />
                <div>
                  <p className={styles.switchTitle}>{t("allowCommentsTitle")}</p>
                  <p className={styles.switchHint}>{t("allowCommentsHint")}</p>
                </div>
              </label>

              <label className={styles.switchRow}>
                <input
                  type="checkbox"
                  checked={form.hideLikeCount}
                  onChange={() => setForm((p: any) => ({ ...p, hideLikeCount: !p.hideLikeCount }))}
                />
                <div>
                  <p className={styles.switchTitle}>{t("hideLikeTitle")}</p>
                  <p className={styles.switchHint}>{t("hideLikeHint")}</p>
                </div>
              </label>

              <label className={styles.switchRow}>
                <input
                  type="checkbox"
                  checked={pollAllowMultiple}
                  onChange={(e) => setPollAllowMultiple(e.target.checked)}
                />
                <div>
                  <p className={styles.switchTitle}>Cho phép chọn nhiều</p>
                  <p className={styles.switchHint}>Người dùng có thể chọn nhiều lựa chọn cùng lúc</p>
                </div>
              </label>
            </div>

            <div className={styles.formGroup}>
              <label>{t("publishTimeLabel")}</label>
              <div className={styles.radioRow}>
                <label className={styles.radioOption}>
                  <input
                    type="radio"
                    name="pollPublishMode"
                    value="now"
                    checked={form.publishMode === "now"}
                    onChange={() => setForm((p: any) => ({ ...p, publishMode: "now" }))}
                  />
                  <span>{t("postNow")}</span>
                </label>
                <label className={styles.radioOption}>
                  <input
                    type="radio"
                    name="pollPublishMode"
                    value="schedule"
                    checked={form.publishMode === "schedule"}
                    onChange={() =>
                      setForm((prev: any) => {
                        const now = new Date();
                        const parts = splitSchedule(prev.scheduledAt);
                        const nextDate = parts.date || formatLocalDate(now);
                        const nextTime = clampTimeForDate(nextDate, parts.time || formatLocalTime(now));
                        return { ...prev, publishMode: "schedule", scheduledAt: buildSchedule(nextDate, nextTime) };
                      })
                    }
                  />
                  <span>{t("schedule")}</span>
                </label>
                <span className={styles.helper}>{t("publishAutoHelper")}</span>
              </div>

              {form.publishMode === "schedule" && (
                <div className={styles.schedulerCard}>
                  <div className={styles.schedulerHeader}>
                    <div>
                      <p className={styles.schedulerLabel}>{t("schedulerLabel")}</p>
                      <p className={styles.schedulerTitle}>{t("chooseDatetime")}</p>
                    </div>
                  </div>
                  <div className={styles.schedulerGrid}>
                    <div className={styles.schedulerField}>
                      <label className={styles.schedulerFieldLabel}>{t("dateLabel")}</label>
                      <DateSelect value={scheduledDate} minDate={new Date()} maxDate={null} minYear={new Date().getFullYear()} placeholder="mm/dd/yyyy" onChange={onScheduleDateChange} />
                    </div>
                    <div className={styles.schedulerField}>
                      <label className={styles.schedulerFieldLabel}>{t("timeLabel")}</label>
                      <TimeSelect value={scheduledTime} selectedDate={scheduledDate} minDateTime={new Date()} disabled={!scheduledDate} onChange={onScheduleTimeChange} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>{/* end formCard */}
        </div>{/* end left column */}

        {/* RIGHT: Options input + preview */}
        <div style={{ display: "grid", gap: 16 }}>

          {/* Options input */}
          <div className={styles.pollOptionsCard}>
            <p className={styles.pollSectionLabel}>Các lựa chọn <span style={{ fontWeight: 400, textTransform: "none", fontSize: 12 }}>({pollOptions.length}/{MAX_POLL_OPTIONS})</span></p>
            {pollOptions.map((opt: PollOption, idx: number) => (
              <div key={idx} className={styles.pollOptionRow}>
                <span className={styles.pollOptionIndex}>{idx + 1}</span>
                <input
                  className={styles.pollOptionInput}
                  placeholder={`Lựa chọn ${idx + 1}`}
                  value={opt.text}
                  maxLength={120}
                  onChange={(e) => updatePollOptionText(idx, e.target.value)}
                />
                <div className={styles.pollOptionActions}>
                  {/* Image picker */}
                  <div
                    className={styles.pollOptionThumbBtn}
                    onClick={() => pollImageInputRefs.current[idx]?.click()}
                    title="Thêm ảnh cho lựa chọn"
                  >
                    {pollOptionPreviews[idx] ? (
                      <>
                        <img src={pollOptionPreviews[idx]!} alt="" className={styles.pollOptionThumb} />
                      </>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <rect x="3" y="3" width="18" height="18" rx="3" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <polyline points="21,15 16,10 5,21" />
                      </svg>
                    )}
                  </div>
                  {pollOptionPreviews[idx] && (
                    <button type="button" className={styles.pollOptionRemoveBtn} onClick={(e) => removePollOptionImage(idx, e)} title="Xoá ảnh">
                      <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                        <line x1="1" y1="1" x2="11" y2="11" /><line x1="11" y1="1" x2="1" y2="11" />
                      </svg>
                    </button>
                  )}
                  {/* Hidden file input */}
                  <input
                    ref={(el) => { pollImageInputRefs.current[idx] = el; }}
                    type="file"
                    accept="image/*"
                    className={styles.pollImageInput}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePollOptionImage(idx, f); e.target.value = ""; }}
                  />
                  {/* Remove option */}
                  {pollOptions.length > MIN_POLL_OPTIONS && (
                    <button type="button" className={styles.pollOptionRemoveBtn} onClick={() => removePollOption(idx)} title="Xoá lựa chọn">
                      <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                        <line x1="1" y1="1" x2="11" y2="11" /><line x1="11" y1="1" x2="1" y2="11" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            ))}

            {pollOptions.length < MAX_POLL_OPTIONS && (
              <button type="button" className={styles.pollAddOptionBtn} onClick={addPollOption}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Thêm lựa chọn
              </button>
            )}

            {pollSubmitError && <p className={styles.error} role="alert">{pollSubmitError}</p>}
          </div>

          {/* Live Preview */}
          <div className={styles.pollPreviewCard}>
            <p className={styles.pollPreviewHeader}>Xem trước</p>
            <div className={styles.pollPreviewBody}>
              <p className={styles.pollPreviewQuestion}>
                {form.caption.trim() || "Câu hỏi của bạn…"}
              </p>
              {pollOptions.map((opt: PollOption, idx: number) => (
                <div key={idx} className={styles.pollPreviewOption}>
                  {hasImages && (
                    pollOptionPreviews[idx]
                      ? <img src={pollOptionPreviews[idx]!} alt="" className={styles.pollPreviewOptionThumb} />
                      : <div className={styles.pollPreviewOptionThumbEmpty} />
                  )}
                  {pollAllowMultiple
                    ? <span className={styles.pollPreviewOptionCheckbox} />
                    : <span className={styles.pollPreviewOptionRadio} />}
                  <span className={`${styles.pollPreviewOptionText} ${opt.text.trim() ? styles.pollPreviewOptionTextFilled : ""}`}>
                    {opt.text.trim() || `Lựa chọn ${idx + 1}`}
                  </span>
                </div>
              ))}
            </div>
            <div className={styles.pollPreviewFooter}>
              <span className={styles.pollLiveDot} />
              Kết thúc sau 24 giờ
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
            <button type="button" className={styles.secondaryButton} onClick={onCancel}>
              {t("cancel")}
            </button>
            <button
              type="submit"
              className={styles.primaryButton}
              disabled={pollOptions.filter((o: PollOption) => o.text.trim()).length < MIN_POLL_OPTIONS}
            >
              {t("finish")}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
