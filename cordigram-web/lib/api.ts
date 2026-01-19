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
  hideLikeCount?: boolean;
  serverId?: string;
  channelId?: string;
  repostOf?: string;
  scheduledAt?: string;
};

export type UpdatePostRequest = {
  content?: string;
  hashtags?: string[];
  mentions?: string[];
  topics?: string[];
  location?: string;
  visibility?: "public" | "followers" | "private";
  allowComments?: boolean;
  allowDownload?: boolean;
  hideLikeCount?: boolean;
};

export type CreatePostResponse = {
  kind: "post" | "reel";
  id: string;
  repostOf?: string | null;
  content: string;
  media: Array<{
    type: "image" | "video";
    url: string;
    metadata?: Record<string, unknown> | null;
  }>;
  hashtags: string[];
  mentions: string[];
  topics?: string[];
  location?: string | null;
  visibility: "public" | "followers" | "private";
  allowComments: boolean;
  allowDownload: boolean;
  hideLikeCount?: boolean;
  status: "published" | "scheduled";
  scheduledAt?: string | null;
  publishedAt?: string | null;
  stats: {
    hearts: number;
    comments: number;
    saves: number;
    reposts: number;
    shares?: number;
    impressions?: number;
    views?: number;
    hides?: number;
    reports?: number;
  };
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
  hideLikeCount?: boolean;
  hashtags?: string[];
  mentions?: string[];
  topics?: string[];
  location?: string;
  visibility?: "public" | "followers" | "private";
  allowComments?: boolean;
  allowDownload?: boolean;
  serverId?: string;
  channelId?: string;
  scheduledAt?: string;
  durationSeconds?: number;
};

export type FeedItem = CreatePostResponse & {
  spamScore?: number;
  qualityScore?: number;
  liked?: boolean;
  saved?: boolean;
  following?: boolean;
  reposted?: boolean;
  authorId?: string;
  authorUsername?: string;
  authorDisplayName?: string;
  authorAvatarUrl?: string;
  author?: {
    id?: string;
    username?: string;
    displayName?: string;
    avatarUrl?: string;
  };
  flags?: {
    liked?: boolean;
    saved?: boolean;
    following?: boolean;
    reposted?: boolean;
  };
};

export type UpdateVisibilityResponse = {
  visibility: "public" | "followers" | "private";
  updated?: boolean;
  unchanged?: boolean;
};

export async function updatePostVisibility(opts: {
  token: string;
  postId: string;
  visibility: "public" | "followers" | "private";
}): Promise<UpdateVisibilityResponse> {
  const { token, postId, visibility } = opts;
  return apiFetch<UpdateVisibilityResponse>({
    path: `/posts/${postId}/visibility`,
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ visibility }),
  });
}

export type CommentItem = {
  id: string;
  postId: string;
  authorId?: string;
  author?: {
    id?: string;
    displayName?: string;
    username?: string;
    avatarUrl?: string;
  };
  content: string;
  parentId: string | null;
  rootCommentId: string | null;
  createdAt?: string;
  updatedAt?: string;
  repliesCount?: number;
  likesCount?: number;
  liked?: boolean;
};

export type CommentListResponse = {
  page: number;
  limit: number;
  hasMore: boolean;
  items: CommentItem[];
  total?: number;
};

export type DeleteCommentResponse = {
  deleted: boolean;
  count?: number;
};

export type UpdateCommentResponse = CommentItem;

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

export async function updatePost(opts: {
  token: string;
  postId: string;
  payload: UpdatePostRequest;
}): Promise<FeedItem> {
  const { token, postId, payload } = opts;
  return apiFetch<FeedItem>({
    path: `/posts/${postId}`,
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
}

export async function deletePost(opts: {
  token: string;
  postId: string;
}): Promise<{ deleted: boolean }> {
  const { token, postId } = opts;
  return apiFetch<{ deleted: boolean }>({
    path: `/posts/${postId}`,
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
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

export async function fetchFeed(opts: {
  token: string;
  limit?: number;
}): Promise<FeedItem[]> {
  const { token, limit = 20 } = opts;
  const params = new URLSearchParams();
  params.set("limit", String(limit));

  return apiFetch<FeedItem[]>({
    path: `/posts/feed?${params.toString()}`,
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function fetchUserPosts(opts: {
  token: string;
  userId: string;
  limit?: number;
}): Promise<FeedItem[]> {
  const { token, userId, limit = 30 } = opts;
  const params = new URLSearchParams();
  if (limit) params.set("limit", String(limit));

  return apiFetch<FeedItem[]>({
    path: `/posts/user/${userId}?${params.toString()}`,
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function fetchUserReels(opts: {
  token: string;
  userId: string;
  limit?: number;
}): Promise<FeedItem[]> {
  const { token, userId, limit = 30 } = opts;
  const params = new URLSearchParams();
  if (limit) params.set("limit", String(limit));

  return apiFetch<FeedItem[]>({
    path: `/reels/user/${userId}?${params.toString()}`,
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function fetchSavedItems(opts: {
  token: string;
  limit?: number;
}): Promise<FeedItem[]> {
  const { token, limit = 30 } = opts;
  const params = new URLSearchParams();
  if (limit) params.set("limit", String(limit));

  return apiFetch<FeedItem[]>({
    path: `/posts/saved?${params.toString()}`,
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function fetchSavedReels(opts: {
  token: string;
  limit?: number;
}): Promise<FeedItem[]> {
  const { token, limit = 30 } = opts;
  const params = new URLSearchParams();
  if (limit) params.set("limit", String(limit));

  return apiFetch<FeedItem[]>({
    path: `/reels/saved?${params.toString()}`,
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function fetchReelsFeed(opts: {
  token: string;
  limit?: number;
  authorId?: string;
  includeOwned?: boolean;
}): Promise<FeedItem[]> {
  const { token, limit = 20, authorId, includeOwned } = opts;
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  if (authorId) params.set("authorId", authorId);
  if (includeOwned) params.set("includeOwned", "1");

  return apiFetch<FeedItem[]>({
    path: `/reels/feed?${params.toString()}`,
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function fetchPostDetail(opts: {
  token: string;
  postId: string;
}): Promise<FeedItem> {
  const { token, postId } = opts;
  return apiFetch<FeedItem>({
    path: `/posts/${postId}`,
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function fetchReelDetail(opts: {
  token: string;
  reelId: string;
}): Promise<FeedItem> {
  const { token, reelId } = opts;
  return apiFetch<FeedItem>({
    path: `/reels/${reelId}`,
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function fetchComments(opts: {
  token: string;
  postId: string;
  page?: number;
  limit?: number;
  parentId?: string;
}): Promise<CommentListResponse> {
  const { token, postId, page, limit, parentId } = opts;
  const params = new URLSearchParams();
  if (page) params.set("page", String(page));
  if (limit) params.set("limit", String(limit));
  if (parentId) params.set("parentId", parentId);

  const query = params.toString();

  return apiFetch<CommentListResponse>({
    path: `/posts/${postId}/comments${query ? `?${query}` : ""}`,
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function createComment(opts: {
  token: string;
  postId: string;
  content: string;
  parentId?: string;
}): Promise<CommentItem> {
  const { token, postId, content, parentId } = opts;
  return apiFetch<CommentItem>({
    path: `/posts/${postId}/comments`,
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(parentId ? { content, parentId } : { content }),
  });
}

export async function deleteComment(opts: {
  token: string;
  postId: string;
  commentId: string;
}): Promise<DeleteCommentResponse> {
  const { token, postId, commentId } = opts;
  return apiFetch<DeleteCommentResponse>({
    path: `/posts/${postId}/comments/${commentId}`,
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function updateComment(opts: {
  token: string;
  postId: string;
  commentId: string;
  content: string;
}): Promise<UpdateCommentResponse> {
  const { token, postId, commentId, content } = opts;
  return apiFetch<UpdateCommentResponse>({
    path: `/posts/${postId}/comments/${commentId}`,
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ content }),
  });
}

export async function likeComment(opts: {
  token: string;
  postId: string;
  commentId: string;
}): Promise<{ liked: boolean; likesCount: number; created?: boolean }> {
  const { token, postId, commentId } = opts;
  return apiFetch<{ liked: boolean; likesCount: number; created?: boolean }>({
    path: `/posts/${postId}/comments/${commentId}/like`,
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function unlikeComment(opts: {
  token: string;
  postId: string;
  commentId: string;
}): Promise<{ liked: boolean; likesCount: number }> {
  const { token, postId, commentId } = opts;
  return apiFetch<{ liked: boolean; likesCount: number }>({
    path: `/posts/${postId}/comments/${commentId}/like`,
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function likePost(opts: {
  token: string;
  postId: string;
}): Promise<{ liked: boolean; created?: boolean }> {
  const { token, postId } = opts;
  return apiFetch<{ liked: boolean; created?: boolean }>({
    path: `/posts/${postId}/like`,
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function unlikePost(opts: {
  token: string;
  postId: string;
}): Promise<{ liked: boolean }> {
  const { token, postId } = opts;
  return apiFetch<{ liked: boolean }>({
    path: `/posts/${postId}/like`,
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function savePost(opts: {
  token: string;
  postId: string;
}): Promise<{ saved: boolean; created?: boolean }> {
  const { token, postId } = opts;
  return apiFetch<{ saved: boolean; created?: boolean }>({
    path: `/posts/${postId}/save`,
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function unsavePost(opts: {
  token: string;
  postId: string;
}): Promise<{ saved: boolean }> {
  const { token, postId } = opts;
  return apiFetch<{ saved: boolean }>({
    path: `/posts/${postId}/save`,
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function sharePost(opts: {
  token: string;
  postId: string;
}): Promise<{ shared: boolean }> {
  const { token, postId } = opts;
  return apiFetch<{ shared: boolean }>({
    path: `/posts/${postId}/share`,
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function repostPost(opts: {
  token: string;
  postId: string;
}): Promise<{ reposted: boolean; created?: boolean }> {
  const { token, postId } = opts;
  return apiFetch<{ reposted: boolean; created?: boolean }>({
    path: `/posts/${postId}/repost`,
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function unrepostPost(opts: {
  token: string;
  postId: string;
}): Promise<{ reposted: boolean }> {
  const { token, postId } = opts;
  return apiFetch<{ reposted: boolean }>({
    path: `/posts/${postId}/repost`,
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function hidePost(opts: {
  token: string;
  postId: string;
}): Promise<{ hidden: boolean }> {
  const { token, postId } = opts;
  return apiFetch<{ hidden: boolean }>({
    path: `/posts/${postId}/hide`,
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

type ReportCategoryKey =
  | "abuse"
  | "violence"
  | "sensitive"
  | "misinfo"
  | "spam"
  | "ip"
  | "illegal"
  | "privacy"
  | "other";

export async function reportPost(opts: {
  token: string;
  postId: string;
  category: ReportCategoryKey;
  reason: string;
  note?: string;
}): Promise<{ reported: boolean }> {
  const { token, postId, category, reason, note } = opts;
  return apiFetch<{ reported: boolean }>({
    path: `/report-posts/${postId}`,
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ category, reason, note }),
  });
}

export async function reportComment(opts: {
  token: string;
  commentId: string;
  category: ReportCategoryKey;
  reason: string;
  note?: string;
}): Promise<{ reported: boolean }> {
  const { token, commentId, category, reason, note } = opts;
  return apiFetch<{ reported: boolean }>({
    path: `/report-comments/${commentId}`,
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ category, reason, note }),
  });
}

export async function viewPost(opts: {
  token: string;
  postId: string;
  durationMs?: number;
}): Promise<{ viewed: boolean }> {
  const { token, postId, durationMs } = opts;
  return apiFetch<{ viewed: boolean }>({
    path: `/posts/${postId}/view`,
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(
      typeof durationMs === "number" ? { durationMs } : { durationMs: null }
    ),
  });
}

export async function reportUser(opts: {
  token: string;
  userId: string;
  category: ReportCategoryKey;
  reason: string;
  note?: string;
}): Promise<{ reported: boolean }> {
  const { token, userId, category, reason, note } = opts;
  return apiFetch<{ reported: boolean }>({
    path: `/report-users/${userId}`,
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ category, reason, note }),
  });
}

export async function setPostAllowComments(opts: {
  token: string;
  postId: string;
  allowComments: boolean;
}): Promise<{ allowComments: boolean }> {
  const { token, postId, allowComments } = opts;
  return apiFetch<{ allowComments: boolean }>({
    path: `/posts/${postId}/allow-comments`,
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ allowComments }),
  });
}

export async function setPostHideLikeCount(opts: {
  token: string;
  postId: string;
  hideLikeCount: boolean;
}): Promise<{ hideLikeCount: boolean }> {
  const { token, postId, hideLikeCount } = opts;
  return apiFetch<{ hideLikeCount: boolean }>({
    path: `/posts/${postId}/hide-like-count`,
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ hideLikeCount }),
  });
}

export async function followUser(opts: {
  token: string;
  userId: string;
}): Promise<{ following: boolean }> {
  const { token, userId } = opts;
  return apiFetch<{ following: boolean }>({
    path: `/users/${userId}/follow`,
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function blockUser(opts: {
  token: string;
  userId: string;
}): Promise<{ blocked: boolean }> {
  const { token, userId } = opts;
  return apiFetch<{ blocked: boolean }>({
    path: `/users/${userId}/block`,
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function unblockUser(opts: {
  token: string;
  userId: string;
}): Promise<{ blocked: boolean }> {
  const { token, userId } = opts;
  return apiFetch<{ blocked: boolean }>({
    path: `/users/${userId}/block`,
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function unfollowUser(opts: {
  token: string;
  userId: string;
}): Promise<{ following: boolean }> {
  const { token, userId } = opts;
  return apiFetch<{ following: boolean }>({
    path: `/users/${userId}/follow`,
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export type CurrentProfileResponse = {
  userId?: string;
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

export type ProfileDetailResponse = {
  id: string;
  userId: string;
  displayName: string;
  username: string;
  avatarUrl: string;
  coverUrl?: string;
  bio?: string;
  location?: string;
  stats: {
    posts: number;
    reels: number;
    totalPosts: number;
    followers: number;
    following: number;
  };
  isFollowing?: boolean;
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

export async function fetchProfileDetail(opts: {
  token: string;
  id: string;
}): Promise<ProfileDetailResponse> {
  const { token, id } = opts;
  return apiFetch<ProfileDetailResponse>({
    path: `/profiles/${encodeURIComponent(id)}`,
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
