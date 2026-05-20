"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  uploadPostMedia,
  createPost,
  createReel,
  createPoll,
  fetchPostDetail,
  type CreatePostRequest,
  type FeedItem,
} from "@/lib/api";

const REEL_MAX_DURATION_SECONDS = 90;

// 0–90 % = file uploads, 90–100 % = server creates the post record
const FILE_UPLOAD_WEIGHT = 90;

export type UploadMediaItem = {
  file: File;
  kind: "image" | "video";
  duration: number | null;
};

export type UploadJobInput = {
  mode: "post" | "reel";
  mediaItems: UploadMediaItem[];
  payload: {
    content?: string;
    hashtags?: string[];
    mentions?: string[];
    location?: string;
    visibility?: "public" | "followers" | "private";
    allowComments?: boolean;
    allowDownload?: boolean;
    hideLikeCount?: boolean;
    scheduledAt?: string;
  };
  token: string;
  publishMode: "now" | "schedule";
};

export type PollOption = {
  text: string;
  imageFile: File | null;
};

export type PollUploadJobInput = {
  question: string;
  options: PollOption[];
  allowMultipleAnswers: boolean;
  payload: {
    content?: string;
    hashtags?: string[];
    mentions?: string[];
    location?: string;
    visibility?: "public" | "followers" | "private";
    allowComments?: boolean;
    hideLikeCount?: boolean;
    scheduledAt?: string;
  };
  token: string;
  publishMode: "now" | "schedule";
};

export type UploadStatus = "uploading" | "done" | "error" | "cancelled";

export type UploadState = {
  mode: "post" | "reel" | "poll";
  status: UploadStatus;
  progress: number;
  totalFiles: number;
  uploadedFiles: number;
  error?: string;
  publishMode: "now" | "schedule";
};

type PostUploadContextValue = {
  upload: UploadState | null;
  newPost: FeedItem | null;
  startUpload: (input: UploadJobInput) => void;
  startPollUpload: (input: PollUploadJobInput) => void;
  cancelUpload: () => void;
  clearNewPost: () => void;
};

const PostUploadContext = createContext<PostUploadContextValue | null>(null);

export function usePostUpload(): PostUploadContextValue {
  const ctx = useContext(PostUploadContext);
  if (!ctx) throw new Error("usePostUpload must be inside PostUploadProvider");
  return ctx;
}

export function PostUploadProvider({ children }: { children: ReactNode }) {
  const [upload, setUpload] = useState<UploadState | null>(null);
  const [newPost, setNewPost] = useState<FeedItem | null>(null);
  const cancelledRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks the current simulated progress value so the interval and XHR
  // callbacks can read/write it without stale closures
  const simProgressRef = useRef(0);

  const startUpload = useCallback((input: UploadJobInput) => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    cancelledRef.current = false;

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setUpload({
      mode: input.mode,
      status: "uploading",
      progress: 0,
      totalFiles: input.mediaItems.length,
      uploadedFiles: 0,
      publishMode: input.publishMode,
    });
    setNewPost(null);
    simProgressRef.current = 0;

    (async () => {
      try {
        const uploadedPayload: NonNullable<CreatePostRequest["media"]> = [];
        const total = input.mediaItems.length;

        for (let i = 0; i < total; i++) {
          if (cancelledRef.current) return;

          const item = input.mediaItems[i];

          // Each file gets an equal slice of the 0-90 % range
          const fileSlice = FILE_UPLOAD_WEIGHT / total;
          const fileStart = (i / total) * FILE_UPLOAD_WEIGHT;
          // Simulation advances to 88 % of the file's share;
          // the remaining 12 % is reserved for the actual completion snap.
          const maxSim = fileStart + fileSlice * 0.88;

          simProgressRef.current = fileStart;

          // ── Smooth simulation interval ──────────────────────────────────
          // Fires every 100 ms. Each tick adds a portion of the remaining
          // gap (exponential ease-out) so it feels fast at first then slows
          // down as it nears the ceiling, signalling "almost done".
          const simInterval = setInterval(() => {
            if (cancelledRef.current) {
              clearInterval(simInterval);
              return;
            }
            const cur = simProgressRef.current;
            if (cur >= maxSim) return;
            const remaining = maxSim - cur;
            // 7 % of remaining gap per tick + 0.15 minimum so it never stalls
            const step = Math.max(remaining * 0.07, 0.15);
            const next = Math.min(cur + step, maxSim);
            simProgressRef.current = next;
            setUpload((prev) =>
              prev ? { ...prev, progress: Math.round(next) } : null,
            );
          }, 100);

          let uploaded: Awaited<ReturnType<typeof uploadPostMedia>>;
          try {
            uploaded = await uploadPostMedia({
              token: input.token,
              file: item.file,
              signal: abortController.signal,
            });
          } finally {
            // Always stop the simulation when the upload settles (success or error)
            clearInterval(simInterval);
          }

          if (cancelledRef.current) return;

          const rawDuration =
            typeof uploaded.duration === "number"
              ? uploaded.duration
              : typeof uploaded.duration === "string"
                ? Number(uploaded.duration)
                : null;

          const finalDuration =
            typeof rawDuration === "number" && Number.isFinite(rawDuration)
              ? rawDuration
              : item.duration;

          if (
            input.mode === "reel" &&
            (finalDuration === null || finalDuration > REEL_MAX_DURATION_SECONDS)
          ) {
            setUpload((prev) =>
              prev
                ? {
                    ...prev,
                    status: "error",
                    error:
                      finalDuration === null
                        ? "Missing video duration."
                        : `Video exceeds ${REEL_MAX_DURATION_SECONDS}s.`,
                  }
                : null,
            );
            hideTimerRef.current = setTimeout(() => setUpload(null), 4000);
            return;
          }

          uploadedPayload.push({
            type: item.kind,
            url: uploaded.secureUrl || uploaded.url,
            metadata: {
              publicId: uploaded.publicId,
              folder: uploaded.folder,
              bytes: uploaded.bytes,
              resourceType: uploaded.resourceType,
              format: uploaded.format,
              width: uploaded.width,
              height: uploaded.height,
              duration:
                typeof finalDuration === "number"
                  ? Math.round(finalDuration * 100) / 100
                  : finalDuration,
              moderationDecision: uploaded.moderationDecision,
              moderationProvider: uploaded.moderationProvider,
              moderationReasons: uploaded.moderationReasons,
              moderationScores: uploaded.moderationScores,
              originalUrl: uploaded.originalUrl,
              originalSecureUrl: uploaded.originalSecureUrl,
              qualities: uploaded.qualities ?? null,
            },
          });

          // Snap to the exact boundary for this completed file
          const uploadedFiles = i + 1;
          const snapped = Math.round((uploadedFiles / total) * FILE_UPLOAD_WEIGHT);
          simProgressRef.current = snapped;
          setUpload((prev) =>
            prev ? { ...prev, uploadedFiles, progress: snapped } : null,
          );
        }

        if (cancelledRef.current) return;

        // Post-creation phase (90 → 100 %)
        let result;
        if (input.mode === "reel") {
          const durationVal = uploadedPayload[0]?.metadata?.duration;
          result = await createReel({
            token: input.token,
            payload: {
              ...input.payload,
              media: uploadedPayload as Array<{
                type: "video";
                url: string;
                metadata?: Record<string, unknown> | null;
              }>,
              durationSeconds:
                typeof durationVal === "number" ? durationVal : undefined,
            },
          });
        } else {
          result = await createPost({
            token: input.token,
            payload: { ...input.payload, media: uploadedPayload },
          });
        }

        if (cancelledRef.current) return;

        setUpload((prev) =>
          prev ? { ...prev, progress: 100, status: "done" } : null,
        );

        if (input.publishMode === "now" && input.mode === "post") {
          try {
            const detail = await fetchPostDetail({
              token: input.token,
              postId: result.id,
            });
            if (!cancelledRef.current) setNewPost(detail);
          } catch {
            // silent: post appears on next feed refresh
          }
        }

        hideTimerRef.current = setTimeout(() => setUpload(null), 2500);
      } catch (err) {
        if (!cancelledRef.current) {
          const message =
            (err as { message?: string } | null)?.message ||
            "Could not publish. Please try again.";
          setUpload((prev) =>
            prev ? { ...prev, status: "error", error: message } : null,
          );
          hideTimerRef.current = setTimeout(() => setUpload(null), 4000);
        }
      }
    })();
  }, []);

  const startPollUpload = useCallback((input: PollUploadJobInput) => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    cancelledRef.current = false;

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    // Count files that actually have an image
    const imageOptions = input.options.filter((o) => o.imageFile !== null);
    const totalFiles = imageOptions.length;

    setUpload({
      mode: "poll",
      status: "uploading",
      progress: totalFiles === 0 ? 50 : 0,
      totalFiles,
      uploadedFiles: 0,
      publishMode: input.publishMode,
    });
    setNewPost(null);
    simProgressRef.current = totalFiles === 0 ? 50 : 0;

    (async () => {
      try {
        // Phase 1 (0–50%): upload option images
        const optionImages: (string | null)[] = input.options.map(() => null);

        if (totalFiles > 0) {
          let uploadedCount = 0;
          for (let i = 0; i < input.options.length; i++) {
            if (cancelledRef.current) return;
            const opt = input.options[i];
            if (!opt.imageFile) continue;

            const fileSlice = FILE_UPLOAD_WEIGHT * 0.5 / totalFiles;
            const fileStart = (uploadedCount / totalFiles) * FILE_UPLOAD_WEIGHT * 0.5;
            const maxSim = fileStart + fileSlice * 0.88;
            simProgressRef.current = fileStart;

            const simInterval = setInterval(() => {
              if (cancelledRef.current) { clearInterval(simInterval); return; }
              const cur = simProgressRef.current;
              if (cur >= maxSim) return;
              const next = Math.min(cur + Math.max((maxSim - cur) * 0.07, 0.15), maxSim);
              simProgressRef.current = next;
              setUpload((prev) => prev ? { ...prev, progress: Math.round(next) } : null);
            }, 100);

            let uploaded: Awaited<ReturnType<typeof uploadPostMedia>>;
            try {
              uploaded = await uploadPostMedia({
                token: input.token,
                file: opt.imageFile,
                signal: abortController.signal,
              });
            } finally {
              clearInterval(simInterval);
            }

            if (cancelledRef.current) return;
            optionImages[i] = uploaded.secureUrl || uploaded.url;
            uploadedCount++;
            const snapped = Math.round((uploadedCount / totalFiles) * FILE_UPLOAD_WEIGHT * 0.5);
            simProgressRef.current = snapped;
            setUpload((prev) => prev ? { ...prev, uploadedFiles: uploadedCount, progress: snapped } : null);
          }
        }

        if (cancelledRef.current) return;

        // Phase 2 (50–80%): create poll
        setUpload((prev) => prev ? { ...prev, progress: 55 } : null);
        const poll = await createPoll({
          token: input.token,
          question: input.question,
          options: input.options.map((o) => o.text),
          optionImages,
          durationHours: 24,
          allowMultipleAnswers: input.allowMultipleAnswers,
        });

        if (cancelledRef.current) return;

        // Phase 3 (80–100%): create post with pollId
        setUpload((prev) => prev ? { ...prev, progress: 80 } : null);
        const scheduledAtIso = input.publishMode === "schedule" && input.payload.scheduledAt
          ? input.payload.scheduledAt
          : undefined;

        const result = await createPost({
          token: input.token,
          payload: {
            ...input.payload,
            scheduledAt: scheduledAtIso,
            pollId: poll._id,
            media: [],
          },
        });

        if (cancelledRef.current) return;

        setUpload((prev) => prev ? { ...prev, progress: 100, status: "done" } : null);

        if (input.publishMode === "now") {
          try {
            const detail = await fetchPostDetail({ token: input.token, postId: result.id });
            if (!cancelledRef.current) setNewPost(detail);
          } catch {
            // silent — post appears on next feed refresh
          }
        }

        hideTimerRef.current = setTimeout(() => setUpload(null), 2500);
      } catch (err) {
        if (!cancelledRef.current) {
          const message = (err as { message?: string } | null)?.message || "Could not publish poll. Please try again.";
          setUpload((prev) => prev ? { ...prev, status: "error", error: message } : null);
          hideTimerRef.current = setTimeout(() => setUpload(null), 4000);
        }
      }
    })();
  }, []);

  const cancelUpload = useCallback(() => {
    cancelledRef.current = true;
    abortControllerRef.current?.abort();
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    setUpload((prev) => (prev ? { ...prev, status: "cancelled" } : null));
    hideTimerRef.current = setTimeout(() => setUpload(null), 1500);
  }, []);

  const clearNewPost = useCallback(() => {
    setNewPost(null);
  }, []);

  return (
    <PostUploadContext.Provider
      value={{ upload, newPost, startUpload, startPollUpload, cancelUpload, clearNewPost }}
    >
      {children}
    </PostUploadContext.Provider>
  );
}
