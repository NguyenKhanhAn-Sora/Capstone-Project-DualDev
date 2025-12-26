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

export type UserSettingsResponse = {
  theme: "light" | "dark";
};

export type RecentAccountResponse = {
  email: string;
  displayName?: string;
  username?: string;
  avatarUrl?: string;
  lastUsed?: string;
};

export type RecentAccountsPayload = {
  recentAccounts: RecentAccountResponse[];
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

export async function fetchUserSettings(opts: {
  token: string;
}): Promise<UserSettingsResponse> {
  const { token } = opts;
  return apiFetch<UserSettingsResponse>({
    path: "/users/settings",
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function updateUserSettings(opts: {
  token: string;
  theme?: "light" | "dark";
}): Promise<UserSettingsResponse> {
  const { token, theme } = opts;
  return apiFetch<UserSettingsResponse>({
    path: "/users/settings",
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ theme }),
  });
}

export async function fetchRecentAccounts(opts: {
  token: string;
}): Promise<RecentAccountsPayload> {
  const { token } = opts;
  return apiFetch<RecentAccountsPayload>({
    path: "/auth/recent-accounts",
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    credentials: "include",
  });
}

export async function upsertRecentAccount(opts: {
  token: string;
  payload: {
    email: string;
    displayName?: string;
    username?: string;
    avatarUrl?: string;
  };
}): Promise<RecentAccountsPayload> {
  const { token, payload } = opts;
  return apiFetch<RecentAccountsPayload>({
    path: "/auth/recent-accounts",
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    credentials: "include",
    body: JSON.stringify(payload),
  });
}

export async function removeRecentAccount(opts: {
  token: string;
  email: string;
}): Promise<RecentAccountsPayload> {
  const { token, email } = opts;
  return apiFetch<RecentAccountsPayload>({
    path: `/auth/recent-accounts/${encodeURIComponent(email)}`,
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    credentials: "include",
  });
}

export async function clearRecentAccounts(opts: {
  token: string;
}): Promise<RecentAccountsPayload> {
  const { token } = opts;
  return apiFetch<RecentAccountsPayload>({
    path: "/auth/recent-accounts",
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    credentials: "include",
  });
}

export async function requestPasswordReset(
  email: string
): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>({
    path: "/auth/password/forgot",
    method: "POST",
    body: JSON.stringify({ email }),
    credentials: "include",
  });
}

export async function verifyResetOtp(opts: {
  email: string;
  otp: string;
}): Promise<{ ok: true }> {
  const { email, otp } = opts;
  return apiFetch<{ ok: true }>({
    path: "/auth/password/verify",
    method: "POST",
    body: JSON.stringify({ email, otp }),
    credentials: "include",
  });
}

export async function resetPassword(opts: {
  email: string;
  otp: string;
  newPassword: string;
}): Promise<{ ok: true }> {
  const { email, otp, newPassword } = opts;
  return apiFetch<{ ok: true }>({
    path: "/auth/password/reset",
    method: "POST",
    body: JSON.stringify({ email, otp, newPassword }),
    credentials: "include",
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

export type ReportProblemAttachment = {
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

export type CreateReportProblemResponse = {
  id: string;
  reporterId: string;
  userId?: string;
  description: string;
  attachments: ReportProblemAttachment[];
  status: "open" | "in_progress" | "resolved";
  createdAt: string;
  updatedAt: string;
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

export type ProfileSearchItem = {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  followersCount: number;
};

export async function searchProfiles(opts: {
  token: string;
  query: string;
  limit?: number;
}): Promise<{ items: ProfileSearchItem[]; count: number }> {
  const { token, query, limit } = opts;
  const params = new URLSearchParams();
  params.set("q", query);
  if (limit) params.set("limit", String(limit));

  return apiFetch<{ items: ProfileSearchItem[]; count: number }>({
    path: `/profiles/search?${params.toString()}`,
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function createReportProblem(opts: {
  token: string;
  description: string;
  files?: File[];
}): Promise<CreateReportProblemResponse> {
  const { token, description, files } = opts;
  const url = `${apiBaseUrl}/reportproblem`;
  const form = new FormData();
  form.append("description", description.trim());
  (files ?? []).forEach((file) => form.append("files", file));

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
      retryAfterMs?: number;
    };
    throw {
      status: res.status,
      message: payload.message || "Request failed",
      data: payload,
    } satisfies ApiError;
  }

  return (await res.json()) as CreateReportProblemResponse;
}

export function getApiBaseUrl(): string {
  return apiBaseUrl;
}
