"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import EmojiPicker from "emoji-picker-react";
import styles from "./create.module.css";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { createPost, createReel, uploadPostMedia } from "@/lib/api";

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

type Step = "select" | "details";

type GeoStatus = "idle" | "requesting" | "granted" | "denied" | "error";

type FormState = {
  caption: string;
  location: string;
  audience: string;
  allowComments: boolean;
  allowDownload: boolean;
  altText: string;
  publishMode: "now" | "schedule";
  scheduledAt: string;
  hashtags: string[];
  mentions: string[];
};

const initialForm: FormState = {
  caption: "",
  location: "",
  audience: "public",
  allowComments: true,
  allowDownload: false,
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
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(initialForm);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string>("");
  const [geoStatus, setGeoStatus] = useState<GeoStatus>("idle");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    null
  );
  const [isResolvingLocation, setIsResolvingLocation] = useState(false);
  const [hashtagDraft, setHashtagDraft] = useState("");
  const [mentionDraft, setMentionDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string>("");
  const [submitSuccess, setSubmitSuccess] = useState<string>("");
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [audienceOpen, setAudienceOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const captionRef = useRef<HTMLTextAreaElement | null>(null);
  const audienceRef = useRef<HTMLDivElement | null>(null);
  const emojiRef = useRef<HTMLDivElement | null>(null);

  const isVideo = useMemo(
    () => Boolean(selectedFile?.type.startsWith("video")),
    [selectedFile]
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
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

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

  const handleFileSelect = (file: File | undefined) => {
    if (!file) return;

    const isImage = file.type.startsWith("image/");
    const isVideoFile = file.type.startsWith("video/");

    if (!isImage && !isVideoFile) {
      setError("Please select an image or video.");
      return;
    }

    if (mode === "reel" && !isVideoFile) {
      setError("Reels require a video file.");
      return;
    }

    const url = URL.createObjectURL(file);

    if (isVideoFile) {
      const videoEl = document.createElement("video");
      videoEl.preload = "metadata";
      videoEl.onloadedmetadata = () => {
        const durationSec = videoEl.duration;
        if (mode === "reel" && durationSec > REEL_MAX_DURATION_SECONDS) {
          setError(
            `Reel video must be ${REEL_MAX_DURATION_SECONDS}s or shorter.`
          );
          URL.revokeObjectURL(url);
          setVideoDuration(null);
          return;
        }
        setVideoDuration(durationSec);
        setError("");
        setSelectedFile(file);
        setPreviewUrl(url);
        setStep("details");
      };
      videoEl.onerror = () => {
        setError("Could not read video metadata. Please try another file.");
        URL.revokeObjectURL(url);
      };
      videoEl.src = url;
      return;
    }

    setVideoDuration(null);
    setError("");
    setSelectedFile(file);
    setPreviewUrl(url);
    setStep("details");
  };

  const onInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    handleFileSelect(file);
  };

  const onDrop = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer.files?.[0];
    handleFileSelect(file);
  };

  const onDragOver = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragActive(true);
  };

  const onDragLeave = () => setDragActive(false);

  const openFileDialog = () => fileInputRef.current?.click();

  const resetSelection = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setVideoDuration(null);
    setForm(initialForm);
    setStep("select");
    setSubmitError("");
    setSubmitSuccess("");
  };

  const handleAudienceSelect = (value: string) => {
    setForm((prev) => ({ ...prev, audience: value }));
    setAudienceOpen(false);
  };

  const readableSize = useMemo(() => {
    if (!selectedFile) return "-";
    const sizeInMb = selectedFile.size / 1024 / 1024;
    return `${sizeInMb.toFixed(1)} MB`;
  }, [selectedFile]);

  if (!canRender) return null;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError("");
    setSubmitSuccess("");

    if (!selectedFile || !previewUrl) {
      setSubmitError("Please choose a photo or video before publishing.");
      return;
    }

    if (mode === "reel" && !isVideo) {
      setSubmitError("Reels require a video file.");
      return;
    }

    if (
      mode === "reel" &&
      videoDuration !== null &&
      videoDuration > REEL_MAX_DURATION_SECONDS
    ) {
      setSubmitError(
        `Video exceeds ${REEL_MAX_DURATION_SECONDS}s. Please trim it.`
      );
      return;
    }

    if (mode === "reel" && videoDuration === null) {
      setSubmitError(
        "We couldn't read the video duration. Please reselect the file."
      );
      return;
    }

    const token =
      typeof window !== "undefined"
        ? localStorage.getItem("accessToken")
        : null;
    if (!token) {
      setSubmitError("Missing access token. Please log in again.");
      return;
    }

    const mediaType: "image" | "video" =
      mode === "reel" ? "video" : isVideo ? "video" : "image";

    let uploadedUrl = "";
    let uploadedMeta: Record<string, unknown> | null = null;

    const normalizedHashtags = Array.from(
      new Set(
        (form.hashtags || []).map((t) =>
          t.toString().trim().replace(/^#/, "").toLowerCase()
        )
      )
    ).filter(Boolean);

    const normalizedMentions = Array.from(
      new Set(
        (form.mentions || []).map((t) =>
          t.toString().trim().replace(/^@/, "").toLowerCase()
        )
      )
    ).filter(Boolean);

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
      scheduledAt: scheduledAtIso,
    };

    try {
      setSubmitting(true);
      const upload = await uploadPostMedia({ token, file: selectedFile });
      uploadedUrl = upload.secureUrl || upload.url;
      const uploadDurationRaw =
        typeof upload.duration === "number"
          ? upload.duration
          : typeof upload.duration === "string"
          ? Number(upload.duration)
          : videoDuration;
      const uploadDuration =
        typeof uploadDurationRaw === "number" &&
        Number.isFinite(uploadDurationRaw)
          ? Math.round(uploadDurationRaw * 100) / 100
          : null;
      uploadedMeta = {
        publicId: upload.publicId,
        folder: upload.folder,
        bytes: upload.bytes,
        resourceType: upload.resourceType,
        format: upload.format,
        width: upload.width,
        height: upload.height,
        duration: uploadDuration,
      };

      const mediaPayload = [
        {
          type: mediaType,
          url: uploadedUrl,
          metadata: uploadedMeta,
        },
      ];

      if (mode === "reel") {
        if (uploadDuration === null || uploadDuration === undefined) {
          setSubmitError("Missing video duration. Please re-upload your reel.");
          return;
        }
        await createReel({
          token,
          payload: {
            ...basePayload,
            media: mediaPayload as Array<{
              type: "video";
              url: string;
              metadata?: Record<string, unknown> | null;
            }>,
            durationSeconds: uploadDuration,
          },
        });
        setSubmitSuccess("Reel created successfully.");
      } else {
        await createPost({
          token,
          payload: { ...basePayload, media: mediaPayload },
        });
        setSubmitSuccess("Post created successfully.");
      }
      resetSelection();
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

    const lowOptions: PositionOptions = {
      enableHighAccuracy: false,
      timeout: 12000,
      maximumAge: 60000,
    };

    const resolveAddress = async (
      latitude: number,
      longitude: number,
      fallback: string
    ) => {
      setIsResolvingLocation(true);
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
        const addr = data?.display_name as string | undefined;
        const city =
          data?.address?.city || data?.address?.town || data?.address?.village;
        const road = data?.address?.road;
        const compact = [road, city].filter(Boolean).join(", ") || addr;
        const chosen = compact || fallback;
        setForm((prev) => ({ ...prev, location: chosen }));
      } catch (err) {
        setForm((prev) => ({ ...prev, location: fallback }));
      } finally {
        setIsResolvingLocation(false);
      }
    };

    const handleSuccess = (pos: GeolocationPosition) => {
      const { latitude, longitude } = pos.coords;
      setCoords({ lat: latitude, lng: longitude });
      setGeoStatus("granted");
      const pretty = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
      resolveAddress(latitude, longitude, pretty).catch(() => {
        setForm((prev) => ({ ...prev, location: pretty }));
      });
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
          lowOptions
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
    key: keyof Pick<FormState, "allowComments" | "allowDownload">
  ) => {
    setForm((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const addHashtag = () => {
    const raw = hashtagDraft.trim().replace(/^#/, "");
    if (!raw) return;
    const tag = raw.toLowerCase();
    setForm((prev) => {
      if (prev.hashtags.includes(tag) || prev.hashtags.length >= 10)
        return prev;
      return { ...prev, hashtags: [...prev.hashtags, tag] };
    });
    setHashtagDraft("");
  };

  const addMention = () => {
    const raw = mentionDraft.trim().replace(/^@/, "");
    if (!raw) return;
    const handle = raw;
    setForm((prev) => {
      if (prev.mentions.includes(handle) || prev.mentions.length >= 10)
        return prev;
      return { ...prev, mentions: [...prev.mentions, handle] };
    });
    setMentionDraft("");
  };

  const removeHashtag = (tag: string) => {
    setForm((prev) => ({
      ...prev,
      hashtags: prev.hashtags.filter((t) => t !== tag),
    }));
  };

  const removeMention = (handle: string) => {
    setForm((prev) => ({
      ...prev,
      mentions: prev.mentions.filter((t) => t !== handle),
    }));
  };

  const onHashtagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addHashtag();
    }
  };

  const onMentionKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addMention();
    }
  };

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
                setVideoDuration(null);
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
                setVideoDuration(null);
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
                  : "Supports .jpg, .png, .mp4, .mov. Max size 200 MB."}
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
            <input
              ref={fileInputRef}
              id="fileInput"
              type="file"
              accept={mode === "reel" ? "video/*" : "image/*,video/*"}
              className={styles.hiddenInput}
              onChange={onInputChange}
            />
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
                <p className={styles.cardTitle}>{selectedFile?.name}</p>
                <p className={styles.meta}>
                  {selectedFile?.type} · {readableSize}
                  {isVideo && videoDuration !== null
                    ? ` · ${videoDuration.toFixed(1)}s`
                    : ""}
                </p>
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
                  Change file
                </button>
              </div>
            </div>

            <div className={styles.mediaFrame}>
              {previewUrl ? (
                isVideo ? (
                  <video src={previewUrl} controls className={styles.media} />
                ) : (
                  <img
                    src={previewUrl}
                    alt="Preview"
                    className={styles.media}
                  />
                )
              ) : (
                <div className={styles.mediaPlaceholder}>No content yet</div>
              )}
            </div>
            <input
              ref={fileInputRef}
              id="fileInput"
              type="file"
              accept={mode === "reel" ? "video/*" : "image/*,video/*"}
              className={styles.hiddenInput}
              onChange={onInputChange}
            />
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
                      aria-label="Biểu tượng cảm xúc"
                      fill="currentColor"
                      height="20"
                      role="img"
                      viewBox="0 0 24 24"
                      width="20"
                    >
                      <title>Biểu tượng cảm xúc</title>
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
              <div className={`${styles.inputShell} ${styles.textareaShell}`}>
                <textarea
                  id="caption"
                  name="caption"
                  ref={captionRef}
                  placeholder="Tell your story..."
                  value={form.caption}
                  onChange={(e) =>
                    setForm({ ...form, caption: e.target.value })
                  }
                  maxLength={2200}
                />
                <span className={styles.charCount}>
                  {form.caption.length}/2200
                </span>
              </div>
            </div>

            <div className={styles.rowGroup}>
              <div className={styles.formGroup}>
                <label>Hashtags</label>
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
                      onChange={(e) => setHashtagDraft(e.target.value)}
                      onKeyDown={onHashtagKeyDown}
                    />
                  </div>
                </div>
              </div>

              <div className={styles.formGroup}>
                <label>Tag @</label>
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
                    <input
                      className={styles.chipInput}
                      placeholder={
                        form.mentions.length
                          ? "Add @username"
                          : "Example: cordiuser"
                      }
                      value={mentionDraft}
                      onChange={(e) => setMentionDraft(e.target.value)}
                      onKeyDown={onMentionKeyDown}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className={styles.rowGroup}>
              <div className={styles.formGroup}>
                <label htmlFor="location">Location</label>
                <div className={styles.inputShell}>
                  <input
                    id="location"
                    name="location"
                    placeholder="Add a location (optional)"
                    value={form.location}
                    onChange={(e) =>
                      setForm({ ...form, location: e.target.value })
                    }
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
                disabled={!selectedFile || submitting}
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
