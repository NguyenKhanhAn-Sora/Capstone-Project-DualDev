export interface ApiError<T = unknown> {
  status: number;
  message: string;
  data?: T;
}

interface FetchOptions extends RequestInit {
  path: string;
}

const DEFAULT_BASE_URL = "http://localhost:9999";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE?.replace(/\/$/, "") ?? DEFAULT_BASE_URL;

async function toJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) {
    return {} as T;
  }
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    throw {
      status: res.status,
      message: "Invalid JSON response",
    } satisfies ApiError;
  }
}

export async function apiFetch<T = unknown>(options: FetchOptions): Promise<T> {
  const { path, headers, ...rest } = options;
  const url = `${apiBaseUrl}${path.startsWith("/") ? "" : "/"}${path}`;

  const res = await fetch(url, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(headers || {}),
    },
  });

  if (!res.ok) {
    const payload: { message?: string } & Record<string, unknown> =
      await toJson<{ message?: string } & Record<string, unknown>>(res).catch(
        () => ({} as { message?: string })
      );
    throw {
      status: res.status,
      message: payload.message || "Request failed",
      data: payload,
    } satisfies ApiError;
  }

  return toJson<T>(res);
}

export type CreatePostRequest = {
  content?: string;
  media?: Array<{
    type: "image" | "video";
    url: string;
    metadata?: Record<string, unknown> | null;
  }>;
  hashtags?: string[];
  mentions?: string[];
  location?: string;
  visibility?: "public" | "followers" | "private";
  allowComments?: boolean;
  allowDownload?: boolean;
  serverId?: string;
  channelId?: string;
  repostOf?: string;
  scheduledAt?: string;
};

export type CreatePostResponse = {
  kind: "post" | "reel";
  id: string;
  content: string;
  media: Array<{
    type: "image" | "video";
    url: string;
    metadata?: Record<string, unknown> | null;
  }>;
  videoDurationSec?: number | null;
  hashtags: string[];
  mentions: string[];
  location?: string | null;
  visibility: "public" | "followers" | "private";
  allowComments: boolean;
  allowDownload: boolean;
  status: "published" | "scheduled";
  scheduledAt?: string | null;
  publishedAt?: string | null;
  stats: { hearts: number; comments: number; saves: number; reposts: number };
  repostOf?: string | null;
  serverId?: string | null;
  channelId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateReelRequest = {
  content?: string;
  media: Array<{
    type: "video";
    url: string;
    metadata?: Record<string, unknown> | null;
  }>;
  hashtags?: string[];
  mentions?: string[];
  location?: string;
  visibility?: "public" | "followers" | "private";
  allowComments?: boolean;
  allowDownload?: boolean;
  serverId?: string;
  channelId?: string;
  scheduledAt?: string;
  durationSeconds?: number;
};

export async function createPost(opts: {
  token: string;
  payload: CreatePostRequest;
}): Promise<CreatePostResponse> {
  const { token, payload } = opts;
  return apiFetch<CreatePostResponse>({
    path: "/posts",
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
}

export async function createReel(opts: {
  token: string;
  payload: CreateReelRequest;
}): Promise<CreatePostResponse> {
  const { token, payload } = opts;
  return apiFetch<CreatePostResponse>({
    path: "/reels",
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
}

export type CurrentProfileResponse = {
  id: string;
  displayName: string;
  username: string;
  avatarUrl: string;
};

export async function fetchCurrentProfile(opts: {
  token: string;
}): Promise<CurrentProfileResponse> {
  const { token } = opts;
  return apiFetch<CurrentProfileResponse>({
    path: "/profiles/me",
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export type UploadPostMediaResponse = {
  folder: string;
  url: string;
  secureUrl: string;
  publicId: string;
  resourceType: string;
  bytes: number;
  format?: string;
  width?: number;
  height?: number;
  duration?: number;
};

export async function uploadPostMedia(opts: {
  token: string;
  file: File;
}): Promise<UploadPostMediaResponse> {
  const { token, file } = opts;
  const url = `${apiBaseUrl}/posts/upload`;
  const form = new FormData();
  form.append("file", file);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: form,
  });

  if (!res.ok) {
    const payload = (await res.json().catch(() => ({}))) as {
      message?: string;
    };
    throw {
      status: res.status,
      message: payload.message || "Upload failed",
      data: payload,
    } satisfies ApiError;
  }

  return (await res.json()) as UploadPostMediaResponse;
}

export function getApiBaseUrl(): string {
  return apiBaseUrl;
}
