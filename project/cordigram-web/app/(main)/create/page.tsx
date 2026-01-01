"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import EmojiPicker from "emoji-picker-react";
import styles from "./create.module.css";
import { useRequireAuth } from "@/hooks/use-require-auth";
import {
  createPost,
  createReel,
  searchProfiles,
  uploadPostMedia,
  type CreatePostRequest,
  type ProfileSearchItem,
} from "@/lib/api";

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

const audienceOptions = [
  { value: "public", label: "Public" },
  { value: "followers", label: "Friends / Following" },
  { value: "private", label: "Private" },
];

const REEL_MAX_DURATION_SECONDS = 90;
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
  const [mode, setMode] = useState<"post" | "reel">("post");
  const [step, setStep] = useState<Step>("select");
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [form, setForm] = useState<FormState>(initialForm);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string>("");
  const [geoStatus, setGeoStatus] = useState<GeoStatus>("idle");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    null
  );
  const [hashtagDraft, setHashtagDraft] = useState("");
  const [mentionDraft, setMentionDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string>("");
  const [submitSuccess, setSubmitSuccess] = useState<string>("");
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const captionRef = useRef<HTMLTextAreaElement | null>(null);
  const audienceRef = useRef<HTMLDivElement | null>(null);
  const emojiRef = useRef<HTMLDivElement | null>(null);

  const totalSizeLabel = useMemo(() => {
    if (!mediaItems.length) return "-";
    const mb =
      mediaItems.reduce((acc, item) => acc + item.file.size, 0) / 1024 / 1024;
    return `${mb.toFixed(1)} MB total`;
  }, [mediaItems]);

  const canAddMore = useMemo(
    () => (mode === "post" ? mediaItems.length < MAX_MEDIA_ITEMS : false),
    [mode, mediaItems.length]
  );

  const selectedAudience = useMemo(
    () =>
      audienceOptions.find((option) => option.value === form.audience) ||
      audienceOptions[0],
    [form.audience]
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!emojiRef.current) return;
      if (!emojiRef.current.contains(event.target as Node)) {
        setShowEmojiPicker(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowEmojiPicker(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
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
    setSubmitSuccess("");
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
      setError("Please select image or video files only.");
      return;
    }

    if (mode === "reel") {
      const videoFile = valid.find((file) => file.type.startsWith("video/"));
      if (!videoFile) {
        setError("Reels require a video file.");
        return;
      }
      const duration = await readVideoDuration(videoFile);
      if (duration !== null && duration > REEL_MAX_DURATION_SECONDS) {
        setError(
          `Reel video must be ${REEL_MAX_DURATION_SECONDS}s or shorter.`
        );
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
      setError(`You can attach up to ${MAX_MEDIA_ITEMS} files per post.`);
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
    event: React.ChangeEvent<HTMLTextAreaElement>
  ) => {
    const value = event.target.value;
    const caret = event.target.selectionStart ?? value.length;
    setForm((prev) => ({ ...prev, caption: value }));

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
        prev + 1 < mentionSuggestions.length ? prev + 1 : 0
      );
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!mentionSuggestions.length) return;
      setMentionHighlight((prev) =>
        prev - 1 >= 0 ? prev - 1 : mentionSuggestions.length - 1
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
    setStep("select");
    setSubmitError("");
    setSubmitSuccess("");
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

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError("");
    setSubmitSuccess("");

    if (!mediaItems.length) {
      setSubmitError(
        "Please choose at least one photo or video before publishing."
      );
      return;
    }

    if (mode === "reel") {
      const reel = mediaItems[0];
      if (mediaItems.length !== 1 || reel.kind !== "video") {
        setSubmitError("Reels require exactly one video file.");
        return;
      }
      if (reel.duration !== null && reel.duration > REEL_MAX_DURATION_SECONDS) {
        setSubmitError(
          `Video exceeds ${REEL_MAX_DURATION_SECONDS}s. Please trim it.`
        );
        return;
      }
    }

    const token =
      typeof window !== "undefined"
        ? localStorage.getItem("accessToken")
        : null;
    if (!token) {
      setSubmitError("Missing access token. Please log in again.");
      return;
    }

    const normalizedHashtags = Array.from(
      new Set((form.hashtags || []).map((t) => normalizeHashtag(t.toString())))
    ).filter(Boolean);

    const normalizedMentions = Array.from(
      new Set(
        [
          ...extractMentionsFromCaption(form.caption || ""),
          ...(form.mentions || []).map((t) =>
            t.toString().trim().replace(/^@/, "").toLowerCase()
          ),
        ].filter(Boolean)
      )
    );

    const scheduledAtIso =
      form.publishMode === "schedule" && form.scheduledAt
        ? new Date(form.scheduledAt).toISOString()
        : undefined;

    const basePayload = {
      content: form.caption || undefined,
      hashtags: normalizedHashtags,
      mentions: normalizedMentions,
      location: form.location.trim() || undefined,
      visibility: form.audience as "public" | "followers" | "private",
      allowComments: form.allowComments,
      allowDownload: form.allowDownload,
      hideLikeCount: form.hideLikeCount,
      scheduledAt: scheduledAtIso,
    };

    try {
      setSubmitting(true);
      const uploadedPayload: NonNullable<CreatePostRequest["media"]> = [];

      for (const item of mediaItems) {
        const upload = await uploadPostMedia({ token, file: item.file });
        const uploadedUrl = upload.secureUrl || upload.url;

        const uploadDurationRaw =
          typeof upload.duration === "number"
            ? upload.duration
            : typeof upload.duration === "string"
            ? Number(upload.duration)
            : null;

        const finalDuration =
          typeof uploadDurationRaw === "number" &&
          Number.isFinite(uploadDurationRaw)
            ? uploadDurationRaw
            : item.duration;

        if (
          mode === "reel" &&
          (finalDuration === null || finalDuration > REEL_MAX_DURATION_SECONDS)
        ) {
          setSubmitError(
            finalDuration === null
              ? "Missing video duration. Please re-upload your reel."
              : `Video exceeds ${REEL_MAX_DURATION_SECONDS}s. Please trim it.`
          );
          setSubmitting(false);
          return;
        }

        uploadedPayload.push({
          type: item.kind,
          url: uploadedUrl,
          metadata: {
            publicId: upload.publicId,
            folder: upload.folder,
            bytes: upload.bytes,
            resourceType: upload.resourceType,
            format: upload.format,
            width: upload.width,
            height: upload.height,
            duration:
              typeof finalDuration === "number"
                ? Math.round(finalDuration * 100) / 100
                : finalDuration,
          },
        });
      }

      if (mode === "reel") {
        const durationVal = uploadedPayload[0]?.metadata?.duration;
        await createReel({
          token,
          payload: {
            ...basePayload,
            media: uploadedPayload as Array<{
              type: "video";
              url: string;
              metadata?: Record<string, unknown> | null;
            }>,
            durationSeconds:
              typeof durationVal === "number" ? durationVal : undefined,
          },
        });
        resetSelection();
        setSubmitSuccess("Reel created successfully.");
      } else {
        await createPost({
          token,
          payload: { ...basePayload, media: uploadedPayload },
        });
        resetSelection();
        setSubmitSuccess("Post created successfully.");
      }
    } catch (err) {
      const message =
        typeof err === "object" && err && "message" in err
          ? (err as { message?: string }).message || "Request failed"
          : "Request failed";
      setSubmitError(message);
    } finally {
      setSubmitting(false);
    }
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
      fallback: string
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
      } catch (err) {
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
      isFallback: boolean
    ) => {
      const shouldRetry =
        !isFallback &&
        (err.code === err.TIMEOUT || err.code === err.POSITION_UNAVAILABLE);

      if (shouldRetry) {
        navigator.geolocation.getCurrentPosition(
          handleSuccess,
          (err2) => handleError(err2, true),
          // --------------------------------
          highOptions
        );
        return;
      }

      const friendly =
        err.code === err.PERMISSION_DENIED
          ? "You denied location access. Please allow it to autofill your place."
          : err.code === err.POSITION_UNAVAILABLE
          ? "We couldn’t get a location fix. Try again or check GPS/Wi‑Fi."
          : err.code === err.TIMEOUT
          ? "Location request took too long. Please retry."
          : "Could not fetch your location.";
      setGeoStatus(err.code === err.PERMISSION_DENIED ? "denied" : "error");
    };

    navigator.geolocation.getCurrentPosition(
      handleSuccess,
      (err) => handleError(err, false),
      highOptions
    );
  };

  const toggle = (
    key: keyof Pick<
      FormState,
      "allowComments" | "allowDownload" | "hideLikeCount"
    >
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
      hashtags: prev.hashtags.filter((t) => t !== tag),
    }));
  };

  const removeMention = (handle: string) => {
    const escaped = handle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    setForm((prev) => ({
      ...prev,
      mentions: prev.mentions.filter((t) => t !== handle),
      caption: prev.caption.replace(
        new RegExp(`@${escaped}(?![a-zA-Z0-9_.])`, "gi"),
        ""
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
        prev + 1 < locationSuggestions.length ? prev + 1 : 0
      );
    }
    if (e.key === "ArrowUp") {
      if (!locationSuggestions.length) return;
      e.preventDefault();
      setLocationOpen(true);
      setLocationHighlight((prev) =>
        prev - 1 >= 0 ? prev - 1 : locationSuggestions.length - 1
      );
    }
    if (e.key === "Escape") {
      setLocationOpen(false);
      setLocationHighlight(-1);
    }
  };

  const onScheduleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const onHashtagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
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
      setMentionError("You need to be logged in to search users.");
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
          setMentionError("User not found");
        }
      } catch (err) {
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
  }, [mentionDraft]);

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
        setLocationError("No suggestions found, try different keywords.");
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

  return (
    <div className={styles.screen}>
      <div className={styles.headerRow}>
        <div>
          <p className={styles.eyebrow}>
            Create {mode === "reel" ? "reel" : "post"}
          </p>
          <h1 className={styles.title}>
            {mode === "reel" ? "Share a short reel" : "Share genuine moments"}
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
              Post
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
              Reel
            </button>
          </div>
        </div>
        <div className={styles.stepper}>
          <div
            className={`${styles.step} ${
              step === "select" ? styles.stepActive : ""
            }`}
          >
            <span className={styles.stepNumber}>1</span>
            <div>
              <p className={styles.stepLabel}>Choose content</p>
            </div>
          </div>
          <div
            className={`${styles.step} ${
              step === "details" ? styles.stepActive : ""
            }`}
          >
            <span className={styles.stepNumber}>2</span>
            <div>
              <p className={styles.stepLabel}>Add details</p>
            </div>
          </div>
        </div>
      </div>

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
              <div className={styles.dropBadge}>Drag & drop or choose</div>
              <h2 className={styles.dropTitle}>
                {mode === "reel" ? "Add a reel video" : "Add a photo or video"}
              </h2>
              <p className={styles.dropText}>
                {mode === "reel"
                  ? "MP4 / MOV, vertical preferred (9:16), max 90s."
                  : "Supports .jpg, .png, .mp4, .mov. Up to 10 items."}
              </p>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={openFileDialog}
                >
                  Choose from device
                </button>
              </div>
              {error && <p className={styles.error}>{error}</p>}
            </div>
          </label>

          <div className={styles.tipsCard}>
            <p className={styles.tipsTitle}>Quick tips</p>
            <ul className={styles.tipsList}>
              {mode === "reel" ? (
                <>
                  <li>
                    Keep it under 90 seconds; 1080x1920 (9:16) looks best.
                  </li>
                  <li>Use .mp4 when possible for smoother playback.</li>
                  <li>
                    Hook viewers in the first 3 seconds with motion or text.
                  </li>
                  <li>Add captions; many viewers watch muted by default.</li>
                </>
              ) : (
                <>
                  <li>Maximum size: 30 GB, video duration: 60 minutes.</li>
                  <li>
                    Recommended: “.mp4”. Other major formats are supported.
                  </li>
                  <li>High-resolution recommended: 1080p, 1440p, 4K.</li>
                  <li>Recommended: 16:9 for landscape, 9:16 for vertical.</li>
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
                <p className={styles.cardEyebrow}>Selected content</p>
                <p className={styles.cardTitle}>
                  {mediaItems.length
                    ? `${mediaItems.length} item${
                        mediaItems.length > 1 ? "s" : ""
                      } selected`
                    : "No content chosen"}
                </p>
                <p className={styles.meta}>{totalSizeLabel}</p>
              </div>
              <div className={styles.cardActions}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={resetSelection}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={styles.primaryGhost}
                  onClick={openFileDialog}
                >
                  {mode === "reel" ? "Change file" : "Add more"}
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
                      <span className={styles.addTileText}>Add more</span>
                    </button>
                  ) : null}
                </div>
              ) : (
                <div className={styles.mediaPlaceholder}>No content yet</div>
              )}
            </div>
          </div>

          <div className={styles.formCard}>
            <div>
              <p className={styles.cardEyebrow}>
                {mode === "reel" ? "Reel details" : "Post details"}
              </p>
            </div>

            <div className={styles.formGroup}>
              <div className={styles.labelRow}>
                <label htmlFor="caption">Caption</label>
                <div className={styles.emojiWrap} ref={emojiRef}>
                  <button
                    type="button"
                    className={styles.emojiButton}
                    onClick={() => setShowEmojiPicker((prev) => !prev)}
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
                  {showEmojiPicker && (
                    <div className={styles.emojiPopover}>
                      <EmojiPicker
                        onEmojiClick={(emojiData) => {
                          insertEmoji(emojiData.emoji || "");
                          setShowEmojiPicker(false);
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
                <textarea
                  id="caption"
                  name="caption"
                  ref={captionRef}
                  placeholder="Type @ to tag friends..."
                  value={form.caption}
                  onChange={handleCaptionChange}
                  onKeyDown={onCaptionKeyDown}
                  onBlur={() => {
                    setTimeout(() => {
                      setMentionOpen(false);
                      setMentionHighlight(-1);
                      setActiveMentionRange(null);
                    }, 120);
                  }}
                  maxLength={2200}
                />
                <span className={styles.charCount}>
                  {form.caption.length}/2200
                </span>
                {mentionOpen && (
                  <div className={styles.mentionSuggestions}>
                    {mentionLoading && (
                      <div className={styles.mentionSuggestionMuted}>
                        Đang tìm người dùng...
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
                              {opt.followersCount.toLocaleString()} followers
                            </span>
                          )}
                        </button>
                      ))}
                  </div>
                )}
              </div>
              <p className={styles.helper}>
                Gõ @ để tag bạn bè trực tiếp trong caption.
              </p>
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
                <label>Hashtags #</label>
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
                        form.hashtags.length ? "Add hashtag" : "Example: travel"
                      }
                      value={hashtagDraft}
                      onChange={(e) =>
                        setHashtagDraft(normalizeHashtag(e.target.value))
                      }
                      onKeyDown={onHashtagKeyDown}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className={styles.rowGroup}>
              <div className={styles.formGroup}>
                <label htmlFor="location">Location</label>
                <div className={styles.locationCombo}>
                  <div className={styles.inputShell}>
                    <input
                      id="location"
                      name="location"
                      placeholder="Add a location (optional)"
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
                          Đang tìm kiếm...
                        </div>
                      )}
                      {!locationLoading && locationSuggestions.length === 0 && (
                        <div className={styles.locationSuggestionMuted}>
                          {locationError || "No suggestions found"}
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
                <label htmlFor="audience">Visibility</label>
                <div className={styles.dropdownShell} ref={audienceRef}>
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
                      aria-label="Select visibility"
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

            <div className={styles.switchGroup}>
              <label className={styles.switchRow}>
                <input
                  type="checkbox"
                  checked={form.allowComments}
                  onChange={() => toggle("allowComments")}
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
                  checked={form.allowDownload}
                  onChange={() => toggle("allowDownload")}
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
                  checked={form.hideLikeCount}
                  onChange={() => toggle("hideLikeCount")}
                />
                <div>
                  <p className={styles.switchTitle}>Hide like</p>
                  <p className={styles.switchHint}>
                    Viewers won’t see the number of likes on this post
                  </p>
                </div>
              </label>
            </div>

            <div className={styles.formGroup}>
              <label>Publish time</label>
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
                  <span>Post now</span>
                </label>
                <label className={styles.radioOption}>
                  <input
                    type="radio"
                    name="publishMode"
                    value="schedule"
                    checked={form.publishMode === "schedule"}
                    onChange={() =>
                      setForm((prev) => ({ ...prev, publishMode: "schedule" }))
                    }
                  />
                  <span>Schedule</span>
                </label>
                <span className={styles.helper}>
                  We will post automatically at your chosen time.
                </span>
              </div>

              {form.publishMode === "schedule" && (
                <div className={styles.inputShell}>
                  <input
                    type="datetime-local"
                    value={form.scheduledAt}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        scheduledAt: e.target.value,
                      }))
                    }
                    onKeyDown={onScheduleKeyDown}
                    min={new Date().toISOString().slice(0, 16)}
                  />
                </div>
              )}
            </div>

            <div className={styles.footerActions}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={resetSelection}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={styles.primaryButton}
                disabled={!mediaItems.length || submitting}
              >
                {submitting ? "Publishing..." : "Finish"}
              </button>
            </div>

            {(submitError || submitSuccess) && (
              <p
                className={submitError ? styles.error : styles.successMessage}
                role={submitError ? "alert" : "status"}
              >
                {submitError || submitSuccess}
              </p>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
