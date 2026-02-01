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
  repostOf?: string | null;
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

export type CurrentProfileResponse = {
  userId?: string;
  id: string;
  displayName: string;
  username: string;
  avatarUrl: string;
};

export type UpdateAvatarResponse = {
  avatarUrl: string;
  avatarOriginalUrl: string;
  avatarPublicId: string;
  avatarOriginalPublicId: string;
};

export type UserSettingsResponse = {
  theme: "light" | "dark";
};

export type NotificationItem = {
  id: string;
  type: "post_like" | "post_comment" | "post_mention" | "follow";
  actor: {
    id: string;
    displayName: string;
    username: string;
    avatarUrl: string;
  };
  postId: string | null;
  postKind: "post" | "reel";
  likeCount: number;
  commentCount: number;
  mentionCount: number;
  mentionSource: "post" | "comment";
  readAt: string | null;
  createdAt: string;
  activityAt: string;
};

export type NotificationListResponse = {
  items: NotificationItem[];
};

export type NotificationUnreadCountResponse = {
  unreadCount: number;
};

export type NotificationReadAllResponse = {
  updated: number;
};

export type NotificationReadResponse = {
  updated: boolean;
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

export function getApiBaseUrl(): string {
  return apiBaseUrl;
}
