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
  const deviceId =
    typeof window !== "undefined"
      ? window.localStorage.getItem("cordigramDeviceId")
      : null;
  const mergedHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    ...(headers || {}),
  } as Record<string, string>;
  if (deviceId && !mergedHeaders["x-device-id"]) {
    mergedHeaders["x-device-id"] = deviceId;
  }

  const res = await fetch(url, {
    ...rest,
    headers: mergedHeaders,
  });

  if (res.status === 401 && typeof window !== "undefined") {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const isLoginRequest = normalizedPath.startsWith("/auth/login");
    if (!isLoginRequest) {
      window.localStorage.removeItem("accessToken");
      window.location.href = "/login";
    }
  }

  if (!res.ok) {
    const payload: { message?: string } & Record<string, unknown> =
      await toJson<{ message?: string } & Record<string, unknown>>(res).catch(
        () => ({}) as { message?: string },
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
  moderationState?: "normal" | "restricted" | "hidden" | "removed";
  canRepost?: boolean;
  allowComments: boolean;
  allowDownload: boolean;
  hideLikeCount?: boolean;
  status: "published" | "scheduled";
  scheduledAt?: string | null;
  publishedAt?: string | null;
  notificationsMutedUntil?: string | null;
  notificationsMutedIndefinitely?: boolean;
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
  repostOfAuthorId?: string;
  repostOfAuthorDisplayName?: string;
  repostOfAuthorUsername?: string;
  repostOfAuthorAvatarUrl?: string;
  repostOfAuthor?: {
    id?: string;
    displayName?: string;
    username?: string;
    avatarUrl?: string;
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
  repostOf?: string | null;
  sponsored?: boolean;
  repostSourceContent?: string | null;
  repostSourceMedia?: Array<{
    type: "image" | "video";
    url: string;
    metadata?: Record<string, unknown> | null;
  }> | null;
  spamScore?: number;
  qualityScore?: number;
  liked?: boolean;
  saved?: boolean;
  following?: boolean;
  repostOfAuthorId?: string;
  repostOfAuthorDisplayName?: string;
  repostOfAuthorUsername?: string;
  repostOfAuthorAvatarUrl?: string;
  repostOfAuthor?: {
    id?: string;
    displayName?: string;
    username?: string;
    avatarUrl?: string;
  };
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

export type HiddenPostItem = FeedItem & {
  hiddenAt?: string | null;
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

export type CommentMedia = {
  type: "image" | "video";
  url: string;
  metadata?: Record<string, unknown> | null;
};

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
  media?: CommentMedia | null;
  mentions?: Array<
    | string
    | {
        userId?: string;
        username?: string;
      }
  >;
  parentId: string | null;
  rootCommentId: string | null;
  pinnedAt?: string | null;
  pinnedBy?: string | null;
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
  scope?: "all" | "following";
  kinds?: Array<"post" | "reel">;
}): Promise<FeedItem[]> {
  const { token, limit = 20, scope, kinds } = opts;
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  if (scope) params.set("scope", scope);
  if (kinds?.length) params.set("kinds", kinds.join(","));

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

export async function fetchPostsByHashtag(opts: {
  token: string;
  tag: string;
  limit?: number;
  page?: number;
}): Promise<FeedItem[]> {
  const { token, tag, limit = 30, page } = opts;
  const params = new URLSearchParams();
  if (limit) params.set("limit", String(limit));
  if (page) params.set("page", String(page));

  return apiFetch<FeedItem[]>({
    path: `/posts/hashtag/${encodeURIComponent(tag)}?${params.toString()}`,
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function fetchReelsByHashtag(opts: {
  token: string;
  tag: string;
  limit?: number;
  page?: number;
}): Promise<FeedItem[]> {
  const { token, tag, limit = 30, page } = opts;
  const params = new URLSearchParams();
  if (limit) params.set("limit", String(limit));
  if (page) params.set("page", String(page));

  return apiFetch<FeedItem[]>({
    path: `/posts/hashtag/${encodeURIComponent(tag)}/reels?${params.toString()}`,
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
  scope?: "all" | "following";
}): Promise<FeedItem[]> {
  const { token, limit = 20, authorId, includeOwned, scope } = opts;
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  if (authorId) params.set("authorId", authorId);
  if (includeOwned) params.set("includeOwned", "1");
  if (scope) params.set("scope", scope);

  return apiFetch<FeedItem[]>({
    path: `/reels/feed?${params.toString()}`,
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function fetchExploreFeed(opts: {
  token: string;
  limit?: number;
  page?: number;
  kinds?: Array<"post" | "reel">;
}): Promise<FeedItem[]> {
  const { token, limit = 30, page = 1, kinds } = opts;
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  params.set("page", String(page));
  if (kinds?.length) params.set("kinds", kinds.join(","));

  return apiFetch<FeedItem[]>({
    path: `/explore?${params.toString()}`,
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function recordExploreImpression(opts: {
  token: string;
  postId: string;
  sessionId: string;
  position?: number | null;
  source?: string;
}): Promise<{ impressed: boolean; created?: boolean }> {
  const { token, postId, sessionId, position, source } = opts;
  return apiFetch<{ impressed: boolean; created?: boolean }>({
    path: "/explore/impression",
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      postId,
      sessionId,
      position: typeof position === "number" ? position : null,
      source: source ?? "explore",
    }),
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
  content?: string;
  parentId?: string;
  mentions?: Array<
    | string
    | {
        userId?: string;
        username?: string;
      }
  >;
  media?: CommentMedia | null;
}): Promise<CommentItem> {
  const { token, postId, content, parentId, mentions, media } = opts;
  const payload: Record<string, unknown> = {};
  if (typeof content === "string") payload.content = content;
  if (mentions) payload.mentions = mentions;
  if (media !== undefined) payload.media = media;
  if (parentId) payload.parentId = parentId;
  return apiFetch<CommentItem>({
    path: `/posts/${postId}/comments`,
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
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
  content?: string;
  mentions?: Array<
    | string
    | {
        userId?: string;
        username?: string;
      }
  >;
  media?: CommentMedia | null;
}): Promise<UpdateCommentResponse> {
  const { token, postId, commentId, content, mentions, media } = opts;
  const payload: Record<string, unknown> = {};
  if (typeof content === "string") payload.content = content;
  if (mentions) payload.mentions = mentions;
  if (media !== undefined) payload.media = media;
  return apiFetch<UpdateCommentResponse>({
    path: `/posts/${postId}/comments/${commentId}`,
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
}

export async function pinComment(opts: {
  token: string;
  postId: string;
  commentId: string;
}): Promise<{ pinned: boolean }> {
  const { token, postId, commentId } = opts;
  return apiFetch<{ pinned: boolean }>({
    path: `/posts/${postId}/comments/${commentId}/pin`,
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function unpinComment(opts: {
  token: string;
  postId: string;
  commentId: string;
}): Promise<{ pinned: boolean }> {
  const { token, postId, commentId } = opts;
  return apiFetch<{ pinned: boolean }>({
    path: `/posts/${postId}/comments/${commentId}/pin`,
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
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

export async function unhidePost(opts: {
  token: string;
  postId: string;
}): Promise<{ hidden: boolean }> {
  const { token, postId } = opts;
  return apiFetch<{ hidden: boolean }>({
    path: `/posts/${postId}/hide`,
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export type HiddenPostsResponse = {
  items: HiddenPostItem[];
};

export async function fetchHiddenPosts(opts: {
  token: string;
  limit?: number;
}): Promise<HiddenPostsResponse> {
  const { token, limit } = opts;
  const query = new URLSearchParams();
  if (typeof limit === "number") {
    query.set("limit", String(limit));
  }
  const qs = query.toString();
  return apiFetch<HiddenPostsResponse>({
    path: `/posts/hidden${qs ? `?${qs}` : ""}`,
    method: "GET",
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
      typeof durationMs === "number" ? { durationMs } : { durationMs: null },
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

export type PostNotificationMuteResponse = {
  enabled: boolean;
  mutedUntil: string | null;
  mutedIndefinitely: boolean;
};

export async function updatePostNotificationMute(opts: {
  token: string;
  postId: string;
  enabled?: boolean;
  mutedUntil?: string | null;
  mutedIndefinitely?: boolean;
}): Promise<PostNotificationMuteResponse> {
  const { token, postId, enabled, mutedUntil, mutedIndefinitely } = opts;
  return apiFetch<PostNotificationMuteResponse>({
    path: `/posts/${postId}/notifications/mute`,
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ enabled, mutedUntil, mutedIndefinitely }),
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

/** Check if current user follows target user. Uses GET /users/:id/is-following */
export async function checkFollowStatus(opts: {
  token: string;
  targetUserId: string;
}): Promise<{ isFollowing: boolean }> {
  const { token, targetUserId } = opts;
  return apiFetch<{ isFollowing: boolean }>({
    path: `/users/${targetUserId}/is-following`,
    method: "GET",
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

/** Bỏ qua user: ẩn hồ sơ/tin nhắn và tắt thông báo từ họ (backend lọc tin nhắn của người bị bỏ qua). */
export async function ignoreUser(opts: {
  token: string;
  userId: string;
}): Promise<{ ignored: boolean }> {
  const { token, userId } = opts;
  return apiFetch<{ ignored: boolean }>({
    path: `/users/${userId}/ignore`,
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function unignoreUser(opts: {
  token: string;
  userId: string;
}): Promise<{ ignored: boolean }> {
  const { token, userId } = opts;
  return apiFetch<{ ignored: boolean }>({
    path: `/users/${userId}/ignore`,
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

/** Kiểm tra current user đã bỏ qua target user chưa. */
export async function checkIgnoreStatus(opts: {
  token: string;
  targetUserId: string;
}): Promise<{ isIgnored: boolean }> {
  const { token, targetUserId } = opts;
  return apiFetch<{ isIgnored: boolean }>({
    path: `/users/${targetUserId}/is-ignored`,
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export type BlockedUserItem = {
  userId: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  blockedAt?: string | null;
};

export type BlockedUsersResponse = {
  items: BlockedUserItem[];
};

export type ActivityType =
  | "post_like"
  | "comment_like"
  | "comment"
  | "repost"
  | "save"
  | "follow"
  | "report_post"
  | "report_user";

export type ActivityItem = {
  id: string;
  type: ActivityType;
  postId?: string | null;
  commentId?: string | null;
  targetUserId?: string | null;
  postKind?: "post" | "reel" | null;
  meta?: {
    postCaption?: string | null;
    postMediaUrl?: string | null;
    postAuthorId?: string | null;
    postAuthorDisplayName?: string | null;
    postAuthorUsername?: string | null;
    postAuthorAvatarUrl?: string | null;
    commentSnippet?: string | null;
    targetDisplayName?: string | null;
    targetUsername?: string | null;
    targetAvatarUrl?: string | null;
    reportCategory?: string | null;
    reportReason?: string | null;
  } | null;
  createdAt?: string | null;
};

export type ActivityLogResponse = {
  items: ActivityItem[];
  nextCursor: string | null;
};

export async function fetchBlockedUsers(opts: {
  token: string;
  limit?: number;
}): Promise<BlockedUsersResponse> {
  const { token, limit } = opts;
  const query = new URLSearchParams();
  if (typeof limit === "number") {
    query.set("limit", String(limit));
  }
  const qs = query.toString();
  return apiFetch<BlockedUsersResponse>({
    path: `/users/blocked${qs ? `?${qs}` : ""}`,
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function fetchActivityLog(opts: {
  token: string;
  limit?: number;
  cursor?: string | null;
  types?: ActivityType[];
}): Promise<ActivityLogResponse> {
  const { token, limit, cursor, types } = opts;
  const query = new URLSearchParams();
  if (typeof limit === "number") {
    query.set("limit", String(limit));
  }
  if (cursor) {
    query.set("cursor", cursor);
  }
  if (types?.length) {
    query.set("type", types.join(","));
  }
  const qs = query.toString();
  return apiFetch<ActivityLogResponse>({
    path: `/users/activity${qs ? `?${qs}` : ""}`,
    method: "GET",
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

export type FollowListItem = {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  isFollowing: boolean;
};

export type FollowListResponse = {
  items: FollowListItem[];
  nextCursor: string | null;
};

export type PostLikeItem = {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  isFollowing: boolean;
};

export type PostLikeListResponse = {
  items: PostLikeItem[];
  nextCursor: string | null;
};

export type CommentLikeItem = PostLikeItem;

export type CommentLikeListResponse = {
  items: CommentLikeItem[];
  nextCursor: string | null;
};

export type PeopleSuggestionItem = {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  reason: string;
  mutualCount?: number;
  isFollowing: boolean;
};

export type PeopleSuggestionsResponse = {
  items: PeopleSuggestionItem[];
};

export async function fetchPeopleSuggestions(opts: {
  token: string;
  limit?: number;
}): Promise<PeopleSuggestionsResponse> {
  const { token, limit } = opts;
  const query = new URLSearchParams();
  if (limit) query.set("limit", String(limit));
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiFetch<PeopleSuggestionsResponse>({
    path: `/users/suggestions${suffix}`,
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function fetchFollowers(opts: {
  token: string;
  userId: string;
  limit?: number;
  cursor?: string;
}): Promise<FollowListResponse> {
  const { token, userId, limit, cursor } = opts;
  const query = new URLSearchParams();
  if (limit) query.set("limit", String(limit));
  if (cursor) query.set("cursor", cursor);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiFetch<FollowListResponse>({
    path: `/users/${userId}/followers${suffix}`,
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function fetchFollowing(opts: {
  token: string;
  userId: string;
  limit?: number;
  cursor?: string;
}): Promise<FollowListResponse> {
  const { token, userId, limit, cursor } = opts;
  const query = new URLSearchParams();
  if (limit) query.set("limit", String(limit));
  if (cursor) query.set("cursor", cursor);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiFetch<FollowListResponse>({
    path: `/users/${userId}/following${suffix}`,
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function fetchPostLikes(opts: {
  token: string;
  postId: string;
  limit?: number;
  cursor?: string;
}): Promise<PostLikeListResponse> {
  const { token, postId, limit, cursor } = opts;
  const query = new URLSearchParams();
  if (limit) query.set("limit", String(limit));
  if (cursor) query.set("cursor", cursor);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiFetch<PostLikeListResponse>({
    path: `/posts/${postId}/likes${suffix}`,
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function fetchCommentLikes(opts: {
  token: string;
  postId: string;
  commentId: string;
  limit?: number;
  cursor?: string;
}): Promise<CommentLikeListResponse> {
  const { token, postId, commentId, limit, cursor } = opts;
  const query = new URLSearchParams();
  if (limit) query.set("limit", String(limit));
  if (cursor) query.set("cursor", cursor);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiFetch<CommentLikeListResponse>({
    path: `/posts/${postId}/comments/${commentId}/likes${suffix}`,
    method: "GET",
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
  status?: "active" | "pending" | "banned";
  signupStage?: "otp_pending" | "info_pending" | "completed";
  accountLimitedUntil?: string | null;
  accountLimitedIndefinitely?: boolean;
};

export type UpdateAvatarResponse = {
  avatarUrl: string;
  avatarOriginalUrl: string;
  avatarPublicId: string;
  avatarOriginalPublicId: string;
};

export type UserSettingsResponse = {
  theme: "light" | "dark";
  language?: "en" | "vi";
};

export type NotificationCategoryKey =
  | "follow"
  | "comment"
  | "like"
  | "mentions";

export type NotificationCategorySettings = {
  enabled: boolean;
  mutedUntil: string | null;
  mutedIndefinitely: boolean;
};

export type NotificationSettingsResponse = {
  enabled: boolean;
  mutedUntil: string | null;
  mutedIndefinitely: boolean;
  categories: Record<NotificationCategoryKey, NotificationCategorySettings>;
};

export type NotificationItem = {
  id: string;
  type:
    | "post_like"
    | "comment_like"
    | "comment_reply"
    | "post_comment"
    | "post_mention"
    | "follow"
    | "login_alert"
    | "post_moderation"
    | "report"
    | "system_notice";
  actor: {
    id: string;
    displayName: string;
    username: string;
    avatarUrl: string;
  };
  postId: string | null;
  commentId: string | null;
  postKind: "post" | "reel";
  isOwnPost?: boolean;
  postMutedUntil?: string | null;
  postMutedIndefinitely?: boolean;
  likeCount: number;
  commentCount: number;
  mentionCount: number;
  mentionSource: "post" | "comment";
  reportOutcome?: "no_violation" | "action_taken" | null;
  reportAudience?: "reporter" | "offender" | null;
  reportTargetType?: "post" | "comment" | "user" | null;
  reportAction?: string | null;
  reportTargetId?: string | null;
  reportSeverity?: "low" | "medium" | "high" | null;
  reportStrikeDelta?: number | null;
  reportStrikeTotal?: number | null;
  reportReason?: string | null;
  reportActionExpiresAt?: string | null;
  moderationDecision?: "approve" | "blur" | "reject" | null;
  moderationReasons?: string[];
  systemNoticeTitle?: string | null;
  systemNoticeBody?: string | null;
  systemNoticeLevel?: "info" | "warning" | "critical" | null;
  systemNoticeActionUrl?: string | null;
  readAt: string | null;
  createdAt: string;
  activityAt: string;
  deviceInfo?: string;
  deviceType?: string;
  os?: string;
  browser?: string;
  location?: string;
  ip?: string;
  deviceIdHash?: string;
  loginAt?: string | null;
};

export type NotificationListResponse = {
  items: NotificationItem[];
};

export type ViolationHistoryItem = {
  id: string;
  targetType: "post" | "comment" | "user";
  targetId: string;
  action: string;
  category: string;
  reason: string;
  severity: "low" | "medium" | "high" | null;
  strikeDelta: number;
  strikeTotalAfter: number;
  actionExpiresAt: string | null;
  previewText: string | null;
  previewMedia: { type: "image" | "video"; url: string } | null;
  relatedPostId: string | null;
  relatedPostPreview: {
    text: string | null;
    media: { type: "image" | "video"; url: string } | null;
  } | null;
  createdAt: string;
};

export type ViolationHistoryResponse = {
  currentStrikeTotal: number;
  items: ViolationHistoryItem[];
};

export type NotificationUnreadCountResponse = {
  unreadCount: number;
};

export type NotificationSeenAtResponse = {
  lastSeenAt: string | null;
};

export type NotificationReadAllResponse = {
  updated: number;
};

export type NotificationReadResponse = {
  updated: boolean;
};

export type NotificationUnreadResponse = {
  updated: boolean;
};

export type NotificationDeleteResponse = {
  deleted: boolean;
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

export async function uploadProfileAvatar(opts: {
  token: string;
  form: FormData;
}): Promise<UpdateAvatarResponse> {
  const { token, form } = opts;
  const res = await fetch(`${apiBaseUrl}/profiles/avatar/upload`, {
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
      message: payload.message || "Avatar upload failed",
      data: payload,
    } satisfies ApiError;
  }

  return (await res.json()) as UpdateAvatarResponse;
}

export async function resetProfileAvatar(opts: {
  token: string;
}): Promise<UpdateAvatarResponse> {
  const { token } = opts;
  return apiFetch<UpdateAvatarResponse>({
    path: "/profiles/avatar",
    method: "DELETE",
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
  language?: "en" | "vi";
}): Promise<UserSettingsResponse> {
  const { token, theme, language } = opts;
  return apiFetch<UserSettingsResponse>({
    path: "/users/settings",
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ theme, language }),
  });
}

export async function fetchNotificationSettings(opts: {
  token: string;
}): Promise<NotificationSettingsResponse> {
  const { token } = opts;
  return apiFetch<NotificationSettingsResponse>({
    path: "/users/notifications/settings",
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function updateNotificationSettings(opts: {
  token: string;
  category?: NotificationCategoryKey;
  enabled?: boolean;
  mutedUntil?: string | null;
  mutedIndefinitely?: boolean;
}): Promise<NotificationSettingsResponse> {
  const { token, category, enabled, mutedUntil, mutedIndefinitely } = opts;
  return apiFetch<NotificationSettingsResponse>({
    path: "/users/notifications/settings",
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      category,
      enabled,
      mutedUntil,
      mutedIndefinitely,
    }),
  });
}

export async function fetchViolationHistory(opts: {
  token: string;
  limit?: number;
}): Promise<ViolationHistoryResponse> {
  const { token, limit } = opts;
  const search = typeof limit === "number" ? `?limit=${limit}` : "";
  return apiFetch<ViolationHistoryResponse>({
    path: `/users/violations${search}`,
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export type ChangeEmailOtpResponse = {
  expiresSec: number;
};

export type ChangeEmailVerifyResponse = {
  verified?: boolean;
  updated?: boolean;
  email?: string;
  accessToken?: string;
};

export async function requestChangeEmailCurrentOtp(opts: {
  token: string;
  password: string;
}): Promise<ChangeEmailOtpResponse> {
  const { token, password } = opts;
  return apiFetch<ChangeEmailOtpResponse>({
    path: "/users/email-change/request-current-otp",
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ password }),
  });
}

export async function verifyChangeEmailCurrentOtp(opts: {
  token: string;
  code: string;
}): Promise<ChangeEmailVerifyResponse> {
  const { token, code } = opts;
  return apiFetch<ChangeEmailVerifyResponse>({
    path: "/users/email-change/verify-current-otp",
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ code }),
  });
}

export async function requestChangeEmailNewOtp(opts: {
  token: string;
  newEmail: string;
}): Promise<ChangeEmailOtpResponse> {
  const { token, newEmail } = opts;
  return apiFetch<ChangeEmailOtpResponse>({
    path: "/users/email-change/request-new-otp",
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ newEmail }),
  });
}

export async function verifyChangeEmailNewOtp(opts: {
  token: string;
  code: string;
}): Promise<ChangeEmailVerifyResponse> {
  const { token, code } = opts;
  return apiFetch<ChangeEmailVerifyResponse>({
    path: "/users/email-change/verify-new-otp",
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ code }),
  });
}

export async function fetchNotifications(opts: {
  token: string;
  limit?: number;
}): Promise<NotificationListResponse> {
  const { token, limit } = opts;
  const query = new URLSearchParams();
  if (limit) query.set("limit", String(limit));
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiFetch<NotificationListResponse>({
    path: `/notifications${suffix}`,
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function fetchNotificationUnreadCount(opts: {
  token: string;
}): Promise<NotificationUnreadCountResponse> {
  const { token } = opts;
  return apiFetch<NotificationUnreadCountResponse>({
    path: "/notifications/unread-count",
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function fetchNotificationSeenAt(opts: {
  token: string;
}): Promise<NotificationSeenAtResponse> {
  const { token } = opts;
  return apiFetch<NotificationSeenAtResponse>({
    path: "/notifications/seen-at",
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function updateNotificationSeenAt(opts: {
  token: string;
}): Promise<NotificationSeenAtResponse> {
  const { token } = opts;
  return apiFetch<NotificationSeenAtResponse>({
    path: "/notifications/seen-at",
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function markAllNotificationsRead(opts: {
  token: string;
}): Promise<NotificationReadAllResponse> {
  const { token } = opts;
  return apiFetch<NotificationReadAllResponse>({
    path: "/notifications/read-all",
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function markNotificationRead(opts: {
  token: string;
  notificationId: string;
}): Promise<NotificationReadResponse> {
  const { token, notificationId } = opts;
  return apiFetch<NotificationReadResponse>({
    path: `/notifications/${notificationId}/read`,
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function markNotificationUnread(opts: {
  token: string;
  notificationId: string;
}): Promise<NotificationUnreadResponse> {
  const { token, notificationId } = opts;
  return apiFetch<NotificationUnreadResponse>({
    path: `/notifications/${notificationId}/unread`,
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function deleteNotification(opts: {
  token: string;
  notificationId: string;
}): Promise<NotificationDeleteResponse> {
  const { token, notificationId } = opts;
  return apiFetch<NotificationDeleteResponse>({
    path: `/notifications/${notificationId}`,
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
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
  email: string,
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
  originalUrl?: string;
  originalSecureUrl?: string;
  publicId: string;
  resourceType: string;
  bytes: number;
  format?: string;
  width?: number;
  height?: number;
  duration?: number;
  moderationDecision?: "approve" | "blur" | "reject";
  moderationProvider?: string | null;
  moderationReasons?: string[];
  moderationScores?: Record<string, number>;
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

export async function uploadCommentMedia(opts: {
  token: string;
  postId: string;
  file: File;
}): Promise<UploadPostMediaResponse> {
  const { token, postId, file } = opts;
  const url = `${apiBaseUrl}/posts/${postId}/comments/upload`;
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

export type ProfileFieldVisibility = "public" | "followers" | "private";
export type ProfileVisibility = {
  gender: ProfileFieldVisibility;
  birthdate: ProfileFieldVisibility;
  location: ProfileFieldVisibility;
  workplace: ProfileFieldVisibility;
  bio: ProfileFieldVisibility;
  followers: ProfileFieldVisibility;
  following: ProfileFieldVisibility;
  about: ProfileFieldVisibility;
  profile: ProfileFieldVisibility;
};

export type ProfileDetailResponse = {
  id: string;
  userId: string;
  displayName: string;
  username: string;
  avatarUrl: string;
  avatarOriginalUrl?: string;
  coverUrl?: string;
  bio?: string;
  gender?: string;
  location?: string;
  workplace?: {
    companyId: string;
    companyName: string;
  };
  birthdate?: string;
  visibility?: ProfileVisibility;
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

export type UpdateMyProfilePayload = {
  displayName?: string;
  username?: string;
  bio?: string;
  location?: string;
  gender?: "male" | "female" | "other" | "prefer_not_to_say";
  birthdate?: string;
  workplaceName?: string;
  workplaceCompanyId?: string;
  genderVisibility?: ProfileFieldVisibility;
  birthdateVisibility?: ProfileFieldVisibility;
  locationVisibility?: ProfileFieldVisibility;
  workplaceVisibility?: ProfileFieldVisibility;
  bioVisibility?: ProfileFieldVisibility;
  followersVisibility?: ProfileFieldVisibility;
  followingVisibility?: ProfileFieldVisibility;
  aboutVisibility?: ProfileFieldVisibility;
  profileVisibility?: ProfileFieldVisibility;
};

export type RequestPasswordChangeOtpResponse = {
  expiresSec: number;
};

export type VerifyPasswordChangeOtpResponse = {
  verified: boolean;
};

export type ConfirmPasswordChangeResponse = {
  updated: boolean;
};

export type PasswordChangeStatusResponse = {
  lastChangedAt: string | null;
};

export type PasskeyStatusResponse = {
  hasPasskey: boolean;
  enabled: boolean;
};

export type PasskeyVerifyResponse = {
  verified: boolean;
  hasPasskey: boolean;
  currentPasskey?: string;
};

export type PasskeyConfirmResponse = {
  updated: boolean;
};

export type DeviceTrustStatusResponse = {
  trusted: boolean;
  hasPasskey: boolean;
  enabled: boolean;
};

export type PasskeyToggleResponse = {
  enabled: boolean;
};

export type VerifyDeviceTrustResponse = {
  trusted: boolean;
};

export type CompanySuggestItem = {
  id: string;
  name: string;
  memberCount: number;
};

export type HashtagSuggestItem = {
  id: string;
  name: string;
  usageCount: number;
  lastUsedAt?: string | null;
};

export async function suggestHashtags(opts: {
  token: string;
  query: string;
  limit?: number;
  signal?: AbortSignal;
}): Promise<{ items: HashtagSuggestItem[]; count: number }> {
  const { token, query, limit, signal } = opts;
  const params = new URLSearchParams();
  params.set("q", query);
  if (limit) params.set("limit", String(limit));

  return apiFetch<{ items: HashtagSuggestItem[]; count: number }>({
    path: `/hashtags/suggest?${params.toString()}`,
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    signal,
  });
}

export async function searchHashtags(opts: {
  token: string;
  query: string;
  limit?: number;
  page?: number;
  signal?: AbortSignal;
}): Promise<{ items: HashtagSuggestItem[]; count: number; hasMore: boolean }> {
  const { token, query, limit, page, signal } = opts;
  const params = new URLSearchParams();
  params.set("q", query);
  if (limit) params.set("limit", String(limit));
  if (page) params.set("page", String(page));

  return apiFetch<{
    items: HashtagSuggestItem[];
    count: number;
    hasMore: boolean;
  }>({
    path: `/hashtags/search?${params.toString()}`,
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    signal,
  });
}

export type SearchSuggestionItem =
  | {
      type: "profile";
      id: string;
      label: string;
      subtitle: string;
      imageUrl: string;
      data: ProfileSearchItem;
    }
  | {
      type: "hashtag";
      id: string;
      label: string;
      subtitle: string;
      imageUrl: string;
      data: HashtagSuggestItem;
    };

export async function searchSuggest(opts: {
  token: string;
  query: string;
  limit?: number;
  signal?: AbortSignal;
}): Promise<{ items: SearchSuggestionItem[]; count: number }> {
  const { token, query, limit, signal } = opts;
  const params = new URLSearchParams();
  params.set("q", query);
  if (limit) params.set("limit", String(limit));

  return apiFetch<{ items: SearchSuggestionItem[]; count: number }>({
    path: `/search/suggest?${params.toString()}`,
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    signal,
  });
}

export async function searchPosts(opts: {
  token: string;
  query: string;
  limit?: number;
  page?: number;
  kinds?: Array<"post" | "reel">;
  sort?: "relevance" | "trending";
  signal?: AbortSignal;
}): Promise<{
  page: number;
  limit: number;
  hasMore: boolean;
  items: FeedItem[];
}> {
  const { token, query, limit, page, kinds, sort, signal } = opts;
  const params = new URLSearchParams();
  params.set("q", query);
  if (limit) params.set("limit", String(limit));
  if (page) params.set("page", String(page));
  if (kinds?.length) params.set("kinds", kinds.join(","));
  if (sort) params.set("sort", sort);

  return apiFetch<{
    page: number;
    limit: number;
    hasMore: boolean;
    items: FeedItem[];
  }>({
    path: `/search/posts?${params.toString()}`,
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    signal,
  });
}

export type SearchHistoryItem = {
  id: string;
  kind: "profile" | "hashtag" | "post" | "reel" | "query";
  key: string;
  label: string;
  subtitle: string;
  imageUrl: string;
  mediaType?: "image" | "video" | "";
  refId: string;
  refSlug: string;
  lastUsedAt?: string | null;
};

export async function fetchSearchHistory(opts: {
  token: string;
  signal?: AbortSignal;
}): Promise<{ items: SearchHistoryItem[]; count: number }> {
  const { token, signal } = opts;
  return apiFetch<{ items: SearchHistoryItem[]; count: number }>({
    path: "/search/history",
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    signal,
  });
}

export async function addSearchHistory(opts: {
  token: string;
  item:
    | {
        kind: "profile";
        userId: string;
        username?: string;
        displayName?: string;
        avatarUrl?: string;
      }
    | { kind: "hashtag"; tag: string }
    | {
        kind: "post";
        postId: string;
        content?: string;
        mediaUrl?: string;
        mediaType?: "image" | "video" | "";
        authorUsername?: string;
      }
    | {
        kind: "reel";
        postId: string;
        content?: string;
        mediaUrl?: string;
        mediaType?: "image" | "video" | "";
        authorUsername?: string;
      }
    | { kind: "query"; query: string };
}): Promise<SearchHistoryItem> {
  const { token, item } = opts;
  return apiFetch<SearchHistoryItem>({
    path: "/search/history",
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(item),
  });
}

export async function deleteSearchHistoryItem(opts: {
  token: string;
  id: string;
}): Promise<{ deleted: boolean }> {
  const { token, id } = opts;
  return apiFetch<{ deleted: boolean }>({
    path: `/search/history/${encodeURIComponent(id)}`,
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function clearSearchHistory(opts: {
  token: string;
}): Promise<{ cleared: boolean }> {
  const { token } = opts;
  return apiFetch<{ cleared: boolean }>({
    path: "/search/history",
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function suggestCompanies(opts: {
  token: string;
  query: string;
  limit?: number;
  signal?: AbortSignal;
}): Promise<{ items: CompanySuggestItem[]; count: number }> {
  const { token, query, limit, signal } = opts;
  const params = new URLSearchParams();
  params.set("q", query);
  if (limit) params.set("limit", String(limit));

  return apiFetch<{ items: CompanySuggestItem[]; count: number }>({
    path: `/companies/suggest?${params.toString()}`,
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    signal,
  });
}

export async function updateMyProfile(opts: {
  token: string;
  payload: UpdateMyProfilePayload;
}): Promise<ProfileDetailResponse> {
  const { token, payload } = opts;
  return apiFetch<ProfileDetailResponse>({
    path: "/profiles/me",
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
}

export async function requestPasswordChangeOtp(opts: {
  token: string;
}): Promise<RequestPasswordChangeOtpResponse> {
  const { token } = opts;
  return apiFetch<RequestPasswordChangeOtpResponse>({
    path: "/users/password-change/request-otp",
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function verifyPasswordChangeOtp(opts: {
  token: string;
  code: string;
}): Promise<VerifyPasswordChangeOtpResponse> {
  const { token, code } = opts;
  return apiFetch<VerifyPasswordChangeOtpResponse>({
    path: "/users/password-change/verify-otp",
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ code }),
  });
}

export async function confirmPasswordChange(opts: {
  token: string;
  currentPassword: string;
  newPassword: string;
}): Promise<ConfirmPasswordChangeResponse> {
  const { token, currentPassword, newPassword } = opts;
  return apiFetch<ConfirmPasswordChangeResponse>({
    path: "/users/password-change/confirm",
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

export async function fetchPasswordChangeStatus(opts: {
  token: string;
}): Promise<PasswordChangeStatusResponse> {
  const { token } = opts;
  return apiFetch<PasswordChangeStatusResponse>({
    path: "/users/password-change/status",
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function fetchPasskeyStatus(opts: {
  token: string;
}): Promise<PasskeyStatusResponse> {
  const { token } = opts;
  return apiFetch<PasskeyStatusResponse>({
    path: "/users/passkey/status",
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export type TwoFactorStatusResponse = {
  enabled: boolean;
};

export async function fetchTwoFactorStatus(opts: {
  token: string;
}): Promise<TwoFactorStatusResponse> {
  const { token } = opts;
  return apiFetch<TwoFactorStatusResponse>({
    path: "/users/two-factor/status",
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function requestTwoFactorOtp(opts: {
  token: string;
  enable: boolean;
}): Promise<{ expiresSec: number }> {
  const { token, enable } = opts;
  return apiFetch<{ expiresSec: number }>({
    path: "/users/two-factor/request-otp",
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ enable }),
  });
}

export async function verifyTwoFactorOtp(opts: {
  token: string;
  code: string;
  enable: boolean;
}): Promise<{ enabled: boolean }> {
  const { token, code, enable } = opts;
  return apiFetch<{ enabled: boolean }>({
    path: "/users/two-factor/verify-otp",
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ code, enable }),
  });
}

export async function verifyTwoFactorLogin(opts: {
  token: string;
  code: string;
  trustDevice?: boolean;
}): Promise<{ accessToken: string }> {
  const { token, code, trustDevice } = opts;
  return apiFetch<{ accessToken: string }>({
    path: "/auth/two-factor/verify",
    method: "POST",
    body: JSON.stringify({ token, code, trustDevice }),
    credentials: "include",
  });
}

export async function resendTwoFactorLoginOtp(opts: {
  token: string;
}): Promise<{ expiresSec: number }> {
  const { token } = opts;
  return apiFetch<{ expiresSec: number }>({
    path: "/auth/two-factor/resend",
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export async function requestPasskeyOtp(opts: {
  token: string;
  password: string;
}): Promise<{ expiresSec: number }> {
  const { token, password } = opts;
  return apiFetch<{ expiresSec: number }>({
    path: "/users/passkey/request-otp",
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ password }),
  });
}

export async function verifyPasskeyOtp(opts: {
  token: string;
  code: string;
}): Promise<PasskeyVerifyResponse> {
  const { token, code } = opts;
  return apiFetch<PasskeyVerifyResponse>({
    path: "/users/passkey/verify-otp",
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ code }),
  });
}

export async function confirmPasskey(opts: {
  token: string;
  currentPasskey?: string;
  newPasskey: string;
}): Promise<PasskeyConfirmResponse> {
  const { token, currentPasskey, newPasskey } = opts;
  return apiFetch<PasskeyConfirmResponse>({
    path: "/users/passkey/confirm",
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ currentPasskey, newPasskey }),
  });
}

export async function togglePasskey(opts: {
  token: string;
  enabled: boolean;
}): Promise<PasskeyToggleResponse> {
  const { token, enabled } = opts;
  return apiFetch<PasskeyToggleResponse>({
    path: "/users/passkey/toggle",
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ enabled }),
  });
}

export async function fetchDeviceTrustStatus(opts: {
  token: string;
  deviceId: string;
}): Promise<DeviceTrustStatusResponse> {
  const { token, deviceId } = opts;
  const params = new URLSearchParams({ deviceId });
  return apiFetch<DeviceTrustStatusResponse>({
    path: `/users/device-trust/status?${params.toString()}`,
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function verifyDeviceTrust(opts: {
  token: string;
  deviceId: string;
  passkey: string;
}): Promise<VerifyDeviceTrustResponse> {
  const { token, deviceId, passkey } = opts;
  return apiFetch<VerifyDeviceTrustResponse>({
    path: "/users/device-trust/verify",
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ deviceId, passkey }),
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

// Chat-specific: get friends list
export async function getMyFriends(opts?: {
  token?: string;
  limit?: number;
  skip?: number;
}): Promise<any[]> {
  const token =
    opts?.token ||
    localStorage.getItem("accessToken") ||
    localStorage.getItem("token");
  const limit = opts?.limit || 50;
  const skip = opts?.skip || 0;

  return apiFetch<any[]>({
    path: `/follows/friends?limit=${limit}&skip=${skip}`,
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

// Chat-specific: get following list via follows endpoint
export async function getFollowing(opts?: {
  token?: string;
  userId?: string;
  limit?: number;
  skip?: number;
}): Promise<any[]> {
  const token =
    opts?.token ||
    localStorage.getItem("accessToken") ||
    localStorage.getItem("token");
  const limit = opts?.limit || 50;
  const skip = opts?.skip || 0;
  const path = opts?.userId
    ? `/follows/following/${opts.userId}?limit=${limit}&skip=${skip}`
    : `/follows/following?limit=${limit}&skip=${skip}`;

  return apiFetch<any[]>({
    path,
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export type ConversationListItem = {
  userId: string;
  username: string;
  avatar?: string;
  lastMessage?: string;
  lastMessageTime?: string;
  unreadCount: number;
};

export async function getConversationList(opts?: {
  token?: string;
}): Promise<ConversationListItem[]> {
  const token =
    opts?.token ||
    localStorage.getItem("accessToken") ||
    localStorage.getItem("token");
  const list = await apiFetch<any[]>({
    path: "/direct-messages/conversations",
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return (list || []).map((c: any) => ({
    userId: String(c.userId ?? c.user_id ?? ""),
    username: c.username ?? "",
    avatar: c.avatar,
    lastMessage: c.lastMessage,
    lastMessageTime: c.lastMessageTime,
    unreadCount: typeof c.unreadCount === "number" ? c.unreadCount : 0,
  }));
}

export async function getDirectMessages(
  userId: string,
  opts?: { token?: string; limit?: number; skip?: number },
): Promise<any[]> {
  const token =
    opts?.token ||
    localStorage.getItem("accessToken") ||
    localStorage.getItem("token");
  const limit = opts?.limit || 50;
  const skip = opts?.skip || 0;

  return apiFetch<any[]>({
    path: `/direct-messages/conversation/${userId}?limit=${limit}&skip=${skip}`,
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function sendDirectMessage(
  receiverId: string,
  opts: {
    token?: string;
    content?: string;
    attachments?: string[];
    type?: "text" | "gif" | "sticker" | "voice";
    giphyId?: string;
    voiceUrl?: string;
    voiceDuration?: number;
  },
): Promise<any> {
  const token =
    opts.token ||
    localStorage.getItem("accessToken") ||
    localStorage.getItem("token");

  return apiFetch<any>({
    path: `/direct-messages/${receiverId}`,
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      content: opts.content || "",
      attachments: opts.attachments || [],
      type: opts.type || "text",
      giphyId: opts.giphyId || undefined,
      voiceUrl: opts.voiceUrl || undefined,
      voiceDuration: opts.voiceDuration || undefined,
    }),
  });
}

export type LoginDeviceItem = {
  deviceIdHash: string;
  userAgent?: string;
  deviceInfo?: string;
  ip?: string;
  location?: string;
  deviceType?: string;
  os?: string;
  browser?: string;
  loginMethod?: string;
  firstSeenAt?: string | null;
  lastSeenAt?: string | null;
};

export type LoginDevicesResponse = {
  currentDeviceIdHash?: string;
  devices: LoginDeviceItem[];
};

export async function fetchLoginDevices(opts: {
  token: string;
  deviceId?: string | null;
}): Promise<LoginDevicesResponse> {
  const { token, deviceId } = opts;
  return apiFetch<LoginDevicesResponse>({
    path: "/users/login-devices",
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(deviceId ? { "x-device-id": deviceId } : {}),
    },
  });
}

export async function logoutLoginDevice(opts: {
  token: string;
  deviceIdHash: string;
}): Promise<{ loggedOut: boolean }> {
  const { token, deviceIdHash } = opts;
  return apiFetch<{ loggedOut: boolean }>({
    path: "/users/login-devices/logout",
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ deviceIdHash }),
  });
}

export async function logoutAllDevices(opts: {
  token: string;
  deviceId?: string | null;
}): Promise<{ loggedOut: boolean; currentDeviceIdHash?: string }> {
  const { token, deviceId } = opts;
  return apiFetch<{ loggedOut: boolean; currentDeviceIdHash?: string }>({
    path: "/users/login-devices/logout-all",
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(deviceId ? { "x-device-id": deviceId } : {}),
    },
  });
}
export async function getAvailableUsers(opts?: {
  token?: string;
}): Promise<any[]> {
  const token =
    opts?.token ||
    localStorage.getItem("accessToken") ||
    localStorage.getItem("token");

  return apiFetch<any[]>({
    path: `/direct-messages/available-users/list`,
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

// Upload media response type
export type UploadMediaResponse = {
  folder: string;
  url: string;
  secureUrl: string;
  publicId: string;
  resourceType: string; // 'image' or 'video'
  bytes: number;
  format?: string;
  width?: number;
  height?: number;
  duration?: number;
};

// Upload media (image/video) for messages
export async function uploadMedia(opts: {
  token: string;
  file: File;
}): Promise<UploadMediaResponse> {
  const { token, file } = opts;

  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${apiBaseUrl}/posts/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Failed to upload media");
  }

  return response.json();
}

// Upload multiple media files
export async function uploadMediaBatch(opts: {
  token: string;
  files: File[];
}): Promise<Array<UploadMediaResponse>> {
  const { token, files } = opts;

  const formData = new FormData();
  files.forEach((file) => {
    formData.append("files", file);
  });

  const response = await fetch(`${apiBaseUrl}/posts/upload/batch`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Failed to upload media");
  }

  return response.json();
}

// ==================== Polls API ====================

export interface Poll {
  _id: string;
  creatorId: {
    _id: string;
    username: string;
    displayName?: string;
    avatarUrl?: string;
  };
  question: string;
  options: string[];
  durationHours: number;
  allowMultipleAnswers: boolean;
  expiresAt: string;
  votes: Array<{
    userId: string;
    optionIndex: number;
    votedAt: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface PollResults {
  _id: string;
  question: string;
  options: string[];
  allowMultipleAnswers: boolean;
  results: Array<{
    option: string;
    voteCount: number;
    percentage: number;
  }>;
  totalVotes: number;
  uniqueVoters: number;
  expiresAt: string;
  hoursLeft: number;
  isExpired: boolean;
  creatorId: any;
}

export async function createPoll(opts: {
  token: string;
  question: string;
  options: string[];
  durationHours?: number;
  allowMultipleAnswers?: boolean;
}): Promise<Poll> {
  const { token, ...data } = opts;

  const response = await fetch(`${apiBaseUrl}/polls`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Failed to create poll");
  }

  return response.json();
}

export async function pinDirectMessage(
  messageId: string,
  opts?: { token?: string },
): Promise<any> {
  const token =
    opts?.token ||
    localStorage.getItem("accessToken") ||
    localStorage.getItem("token");

  return apiFetch<any>({
    path: `/direct-messages/${messageId}/pin`,
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function reportDirectMessage(
  messageId: string,
  reason: string,
  description?: string,
  opts?: { token?: string },
): Promise<any> {
  const token =
    opts?.token ||
    localStorage.getItem("accessToken") ||
    localStorage.getItem("token");

  return apiFetch<any>({
    path: `/direct-messages/${messageId}/report`,
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      reason,
      description: description || undefined,
    }),
  });
}

export async function deleteDirectMessage(
  messageId: string,
  deleteType: "for-everyone" | "for-me" = "for-me",
  opts?: { token?: string },
): Promise<any> {
  const token =
    opts?.token ||
    localStorage.getItem("accessToken") ||
    localStorage.getItem("token");

  return apiFetch<any>({
    path: `/direct-messages/${messageId}`,
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      deleteType,
    }),
  });
}

export async function addMessageReaction(
  messageId: string,
  emoji: string,
  opts?: { token?: string },
): Promise<any> {
  const token =
    opts?.token ||
    localStorage.getItem("accessToken") ||
    localStorage.getItem("token");

  return apiFetch<any>({
    path: `/direct-messages/${messageId}/reaction/${encodeURIComponent(emoji)}`,
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function getPinnedMessages(
  userId: string,
  opts?: { token?: string },
): Promise<any[]> {
  const token =
    opts?.token ||
    localStorage.getItem("accessToken") ||
    localStorage.getItem("token");

  return apiFetch<any[]>({
    path: `/direct-messages/pinned/${userId}`,
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function getPoll(opts: {
  token: string;
  pollId: string;
}): Promise<Poll> {
  const { token, pollId } = opts;

  const response = await fetch(`${apiBaseUrl}/polls/${pollId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Failed to get poll");
  }

  return response.json();
}

export async function votePoll(opts: {
  token: string;
  pollId: string;
  optionIndexes: number[];
}): Promise<Poll> {
  const { token, pollId, optionIndexes } = opts;

  const response = await fetch(`${apiBaseUrl}/polls/${pollId}/vote`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ optionIndexes }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Failed to vote");
  }

  return response.json();
}

export async function getPollResults(opts: {
  token: string;
  pollId: string;
}): Promise<PollResults> {
  const { token, pollId } = opts;

  const response = await fetch(`${apiBaseUrl}/polls/${pollId}/results`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Failed to get results");
  }

  return response.json();
}

export async function getMyVote(opts: {
  token: string;
  pollId: string;
}): Promise<number[]> {
  const { token, pollId } = opts;

  const response = await fetch(`${apiBaseUrl}/polls/${pollId}/my-vote`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Failed to get vote");
  }

  return response.json();
}

export type CreateStripeCheckoutSessionRequest = {
  actionType?: "campaign_create" | "campaign_upgrade";
  targetCampaignId?: string;
  amount: number;
  currency?: string;
  campaignName?: string;
  description?: string;
  objective?: string;
  adFormat?: string;
  boostPackageId: string;
  durationPackageId: string;
  promotedPostId?: string;
  primaryText?: string;
  headline?: string;
  adDescription?: string;
  destinationUrl?: string;
  cta?: string;
  interests?: string[];
  locationText?: string;
  ageMin?: number;
  ageMax?: number;
  placement?: string;
  mediaUrls?: string[];
};

export type StripeCheckoutSessionResponse = {
  id: string;
  paymentIntentId?: string | null;
  url: string | null;
  status: string | null;
  paymentStatus: string | null;
  amountTotal: number | null;
  currency: string | null;
};

export async function createStripeCheckoutSession(opts: {
  token: string;
  payload: CreateStripeCheckoutSessionRequest;
}): Promise<StripeCheckoutSessionResponse> {
  const { token, payload } = opts;
  return apiFetch<StripeCheckoutSessionResponse>({
    path: "/payments/checkout-session",
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
}

export type StripeCheckoutSessionStatus = {
  id: string;
  paymentIntentId?: string | null;
  status: string | null;
  paymentStatus: string | null;
  amountTotal: number | null;
  currency: string | null;
  customerEmail?: string | null;
  metadata?: Record<string, string>;
};

export async function getStripeCheckoutSessionStatus(opts: {
  token: string;
  sessionId: string;
}): Promise<StripeCheckoutSessionStatus> {
  const { token, sessionId } = opts;
  return apiFetch<StripeCheckoutSessionStatus>({
    path: `/payments/checkout-session/${encodeURIComponent(sessionId)}`,
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export type MyAdsCreationStatus = {
  hasCreatedAds: boolean;
  latestPaidAt?: string | null;
  latestPaymentId?: string | null;
};

export async function getMyAdsCreationStatus(opts: {
  token: string;
}): Promise<MyAdsCreationStatus> {
  const { token } = opts;
  return apiFetch<MyAdsCreationStatus>({
    path: '/payments/me/ads-created',
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export type AdsEventType = "impression" | "dwell" | "cta_click";

export async function trackAdsEvent(opts: {
  token: string;
  promotedPostId: string;
  renderedPostId?: string;
  eventType: AdsEventType;
  sessionId: string;
  durationMs?: number;
  source?: string;
}): Promise<{ tracked: boolean; deduped?: boolean }> {
  const {
    token,
    promotedPostId,
    renderedPostId,
    eventType,
    sessionId,
    durationMs,
    source,
  } = opts;

  return apiFetch<{ tracked: boolean; deduped?: boolean }>({
    path: "/payments/ads/track",
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      promotedPostId,
      renderedPostId,
      eventType,
      sessionId,
      durationMs: typeof durationMs === "number" ? durationMs : undefined,
      source: source ?? "home_feed",
    }),
  });
}

export type AdsDashboardCampaign = {
  id: string;
  promotedPostId: string;
  campaignName: string;
  status: "active" | "hidden" | "paused" | "canceled" | "completed";
  budget: number;
  spent: number;
  startsAt: string;
  expiresAt: string;
  impressions: number;
  reach: number;
  clicks: number;
  ctr: number;
  views: number;
  likes: number;
  comments: number;
  reposts: number;
  engagements: number;
  averageDwellMs: number;
  totalDwellMs: number;
  dwellSamples: number;
  engagementRate: number;
};

export type AdsDashboardSummary = {
  totalBudget: number;
  totalSpent: number;
  impressions: number;
  reach: number;
  clicks: number;
  views: number;
  likes: number;
  comments: number;
  reposts: number;
  engagements: number;
  totalDwellMs: number;
  dwellSamples: number;
  activeCount: number;
  ctr: number;
  averageDwellMs: number;
  engagementRate: number;
};

export type AdsDashboardResponse = {
  summary: AdsDashboardSummary;
  campaigns: AdsDashboardCampaign[];
  trend: Array<{
    day: string;
    impressions: number;
    clicks: number;
  }>;
};

export async function getAdsDashboard(opts: {
  token: string;
}): Promise<AdsDashboardResponse> {
  const { token } = opts;
  return apiFetch<AdsDashboardResponse>({
    path: "/payments/ads/dashboard",
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export type AdsCampaignDetail = AdsDashboardCampaign & {
  objective?: string;
  adFormat?: string;
  primaryText?: string;
  headline?: string;
  adDescription?: string;
  destinationUrl?: string;
  cta?: string;
  interests?: string[];
  locationText?: string;
  ageMin?: number | null;
  ageMax?: number | null;
  placement?: string;
  mediaUrls?: string[];
  boostPackageId?: string;
  durationPackageId?: string;
  durationDays?: number;
  boostWeight?: number;
  hiddenReason?: string | null;
  actions?: {
    canChangeBoost: boolean;
    canExtend: boolean;
    canPause: boolean;
    canResume: boolean;
    canCancel: boolean;
    requiresExtendBeforeResume?: boolean;
  };
};

export async function getAdsCampaignDetail(opts: {
  token: string;
  campaignId: string;
}): Promise<AdsCampaignDetail> {
  const { token, campaignId } = opts;
  return apiFetch<AdsCampaignDetail>({
    path: `/payments/ads/campaigns/${encodeURIComponent(campaignId)}`,
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export type AdsCampaignAction =
  | "change_boost"
  | "extend_days"
  | "pause_campaign"
  | "resume_campaign"
  | "cancel_campaign"
  | "update_details";

export async function performAdsCampaignAction(opts: {
  token: string;
  campaignId: string;
  action: AdsCampaignAction;
  boostPackageId?: string;
  extendDays?: number;
  campaignName?: string;
  objective?: string;
  adFormat?: string;
  primaryText?: string;
  headline?: string;
  adDescription?: string;
  destinationUrl?: string;
  cta?: string;
  interests?: string[];
  locationText?: string;
  ageMin?: number | null;
  ageMax?: number | null;
  placement?: string;
  mediaUrls?: string[];
}): Promise<AdsCampaignDetail> {
  const {
    token,
    campaignId,
    action,
    boostPackageId,
    extendDays,
    campaignName,
    objective,
    adFormat,
    primaryText,
    headline,
    adDescription,
    destinationUrl,
    cta,
    interests,
    locationText,
    ageMin,
    ageMax,
    placement,
    mediaUrls,
  } = opts;
  return apiFetch<AdsCampaignDetail>({
    path: `/payments/ads/campaigns/${encodeURIComponent(campaignId)}/action`,
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      action,
      boostPackageId,
      extendDays,
      campaignName,
      objective,
      adFormat,
      primaryText,
      headline,
      adDescription,
      destinationUrl,
      cta,
      interests,
      locationText,
      ageMin,
      ageMax,
      placement,
      mediaUrls,
    }),
  });
}

export function getApiBaseUrl(): string {
  return apiBaseUrl;
}
