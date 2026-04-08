class FeedMedia {
  const FeedMedia({
    required this.type,
    required this.url,
    this.originalUrl,
    this.originalSecureUrl,
    this.moderationDecision,
  });

  final String type; // "image" | "video"
  final String url;
  final String? originalUrl;
  final String? originalSecureUrl;
  final String? moderationDecision;

  bool get isBlurredByModeration {
    final decision = (moderationDecision ?? '').toLowerCase().trim();
    return decision == 'blur' &&
        ((originalSecureUrl?.isNotEmpty ?? false) ||
            (originalUrl?.isNotEmpty ?? false));
  }

  String get originalBestUrl {
    final secure = originalSecureUrl?.trim();
    if (secure != null && secure.isNotEmpty) {
      return secure.startsWith('http://')
          ? 'https://${secure.substring(7)}'
          : secure;
    }
    final raw = originalUrl?.trim();
    if (raw != null && raw.isNotEmpty) {
      return raw.startsWith('http://') ? 'https://${raw.substring(7)}' : raw;
    }
    return url;
  }

  String displayUrl({bool revealed = false}) {
    if (isBlurredByModeration && revealed) return originalBestUrl;
    return url;
  }

  factory FeedMedia.fromJson(Map<String, dynamic> json) {
    // Prefer secureUrl (HTTPS) — Cloudinary returns both url (HTTP) and
    // secureUrl (HTTPS). Android may block HTTP even with cleartext enabled.
    final raw =
        (json['secureUrl'] as String?)?.trim() ??
        (json['url'] as String?)?.trim() ??
        '';
    // Normalize any leftover http:// → https://
    final url = raw.startsWith('http://') ? 'https://${raw.substring(7)}' : raw;
    final metadata = json['metadata'] is Map<String, dynamic>
        ? json['metadata'] as Map<String, dynamic>
        : (json['metadata'] is Map
              ? (json['metadata'] as Map).map(
                  (k, v) => MapEntry(k.toString(), v),
                )
              : null);

    final originalSecureRaw =
        (json['originalSecureUrl'] as String?) ??
        (metadata?['originalSecureUrl'] as String?);
    final originalRaw =
        (json['originalUrl'] as String?) ??
        (metadata?['originalUrl'] as String?);
    final decisionRaw =
        (json['moderationDecision'] as String?) ??
        (metadata?['moderationDecision'] as String?);

    final originalSecure = originalSecureRaw?.trim();
    final original = originalRaw?.trim();

    return FeedMedia(
      type: (json['type'] as String?) ?? 'image',
      url: url,
      originalSecureUrl: (originalSecure != null && originalSecure.isNotEmpty)
          ? originalSecure
          : null,
      originalUrl: (original != null && original.isNotEmpty) ? original : null,
      moderationDecision: decisionRaw?.trim(),
    );
  }
}

class FeedStats {
  const FeedStats({
    required this.hearts,
    required this.comments,
    required this.saves,
    required this.reposts,
    this.views,
    this.impressions,
  });

  final int hearts;
  final int comments;
  final int saves;
  final int reposts;
  final int? views;
  final int? impressions;

  int get viewCount => views ?? impressions ?? 0;

  factory FeedStats.fromJson(Map<String, dynamic> json) => FeedStats(
    hearts: (json['hearts'] as num?)?.toInt() ?? 0,
    comments: (json['comments'] as num?)?.toInt() ?? 0,
    saves: (json['saves'] as num?)?.toInt() ?? 0,
    reposts: (json['reposts'] as num?)?.toInt() ?? 0,
    views: (json['views'] as num?)?.toInt(),
    impressions: (json['impressions'] as num?)?.toInt(),
  );
}

class FeedAuthor {
  const FeedAuthor({
    this.id,
    this.username,
    this.displayName,
    this.avatarUrl,
    this.isCreatorVerified,
  });

  final String? id;
  final String? username;
  final String? displayName;
  final String? avatarUrl;
  final bool? isCreatorVerified;

  factory FeedAuthor.fromJson(Map<String, dynamic> json) => FeedAuthor(
    id: json['id'] as String?,
    username: json['username'] as String?,
    displayName: json['displayName'] as String?,
    avatarUrl: json['avatarUrl'] as String?,
    isCreatorVerified: json['isCreatorVerified'] as bool?,
  );
}

class FeedPost {
  const FeedPost({
    required this.id,
    required this.kind,
    required this.content,
    required this.media,
    required this.hashtags,
    required this.stats,
    required this.createdAt,
    this.location,
    this.author,
    this.authorId,
    this.authorUsername,
    this.authorDisplayName,
    this.authorAvatarUrl,
    this.authorIsCreatorVerified,
    this.liked,
    this.saved,
    this.following,
    this.repostOf,
    this.hideLikeCount,
    this.allowComments,
    this.allowDownload,
    this.visibility,
    this.sponsored,
    this.repostOfAuthorId,
    this.repostOfAuthorDisplayName,
    this.repostOfAuthorUsername,
    this.repostOfAuthorAvatarUrl,
    this.repostOfAuthor,
    this.repostSourceContent,
    this.repostSourceMedia,
    this.primaryVideoDurationMs,
  });

  final String id;
  final String kind; // "post" | "reel"
  final String content;
  final List<FeedMedia> media;
  final List<String> hashtags;
  final FeedStats stats;
  final String createdAt;
  final String? location;
  final FeedAuthor? author;
  final String? authorId;
  final String? authorUsername;
  final String? authorDisplayName;
  final String? authorAvatarUrl;
  final bool? authorIsCreatorVerified;
  final bool? liked;
  final bool? saved;
  final bool? following;
  final String? repostOf;
  final bool? hideLikeCount;
  final bool? allowComments;
  final bool? allowDownload;
  final String? visibility;
  final bool? sponsored;
  final String? repostOfAuthorId;
  final String? repostOfAuthorDisplayName;
  final String? repostOfAuthorUsername;
  final String? repostOfAuthorAvatarUrl;
  final FeedAuthor? repostOfAuthor;
  final String? repostSourceContent;
  final List<FeedMedia>? repostSourceMedia;
  final int? primaryVideoDurationMs;

  FeedPost copyWith({
    String? id,
    String? kind,
    String? content,
    List<FeedMedia>? media,
    List<String>? hashtags,
    FeedStats? stats,
    String? createdAt,
    String? location,
    FeedAuthor? author,
    String? authorId,
    String? authorUsername,
    String? authorDisplayName,
    String? authorAvatarUrl,
    bool? authorIsCreatorVerified,
    bool? liked,
    bool? saved,
    bool? following,
    String? repostOf,
    bool? hideLikeCount,
    bool? allowComments,
    bool? allowDownload,
    String? visibility,
    bool? sponsored,
    String? repostOfAuthorId,
    String? repostOfAuthorDisplayName,
    String? repostOfAuthorUsername,
    String? repostOfAuthorAvatarUrl,
    FeedAuthor? repostOfAuthor,
    String? repostSourceContent,
    List<FeedMedia>? repostSourceMedia,
    int? primaryVideoDurationMs,
  }) {
    return FeedPost(
      id: id ?? this.id,
      kind: kind ?? this.kind,
      content: content ?? this.content,
      media: media ?? this.media,
      hashtags: hashtags ?? this.hashtags,
      stats: stats ?? this.stats,
      createdAt: createdAt ?? this.createdAt,
      location: location ?? this.location,
      author: author ?? this.author,
      authorId: authorId ?? this.authorId,
      authorUsername: authorUsername ?? this.authorUsername,
      authorDisplayName: authorDisplayName ?? this.authorDisplayName,
      authorAvatarUrl: authorAvatarUrl ?? this.authorAvatarUrl,
      authorIsCreatorVerified:
          authorIsCreatorVerified ?? this.authorIsCreatorVerified,
      liked: liked ?? this.liked,
      saved: saved ?? this.saved,
      following: following ?? this.following,
      repostOf: repostOf ?? this.repostOf,
      hideLikeCount: hideLikeCount ?? this.hideLikeCount,
      allowComments: allowComments ?? this.allowComments,
      allowDownload: allowDownload ?? this.allowDownload,
      visibility: visibility ?? this.visibility,
      sponsored: sponsored ?? this.sponsored,
      repostOfAuthorId: repostOfAuthorId ?? this.repostOfAuthorId,
      repostOfAuthorDisplayName:
          repostOfAuthorDisplayName ?? this.repostOfAuthorDisplayName,
      repostOfAuthorUsername:
          repostOfAuthorUsername ?? this.repostOfAuthorUsername,
      repostOfAuthorAvatarUrl:
          repostOfAuthorAvatarUrl ?? this.repostOfAuthorAvatarUrl,
      repostOfAuthor: repostOfAuthor ?? this.repostOfAuthor,
      repostSourceContent: repostSourceContent ?? this.repostSourceContent,
      repostSourceMedia: repostSourceMedia ?? this.repostSourceMedia,
      primaryVideoDurationMs:
          primaryVideoDurationMs ?? this.primaryVideoDurationMs,
    );
  }

  /// Returns display name: author.displayName > authorDisplayName > username > "Unknown"
  String get displayName {
    final name = author?.displayName ?? authorDisplayName;
    if (name != null && name.isNotEmpty) return name;
    final uname = author?.username ?? authorUsername;
    if (uname != null && uname.isNotEmpty) return uname;
    return 'Unknown';
  }

  String get username {
    final name = author?.username ?? authorUsername;
    if (name != null && name.isNotEmpty) return '@$name';
    return '';
  }

  String? get avatarUrl => author?.avatarUrl ?? authorAvatarUrl;
  bool get isVerified =>
      author?.isCreatorVerified ?? authorIsCreatorVerified ?? false;

  /// Display name of the original author for reposts.
  String get repostAuthorName {
    final name = repostOfAuthor?.displayName ?? repostOfAuthorDisplayName;
    if (name != null && name.isNotEmpty) return name;
    final uname = repostOfAuthor?.username ?? repostOfAuthorUsername;
    if (uname != null && uname.isNotEmpty) return uname;
    return 'Original Author';
  }

  factory FeedPost.fromJson(Map<String, dynamic> json) {
    final mediaRaw = json['media'];
    final List<FeedMedia> mediaList = (mediaRaw is List)
        ? mediaRaw
              .whereType<Map<String, dynamic>>()
              .map(FeedMedia.fromJson)
              .toList()
        : [];

    final hashtagsRaw = json['hashtags'];
    final List<String> hashtagsList = (hashtagsRaw is List)
        ? hashtagsRaw.whereType<String>().toList()
        : [];

    final statsRaw = json['stats'];
    final FeedStats stats = statsRaw is Map<String, dynamic>
        ? FeedStats.fromJson(statsRaw)
        : const FeedStats(hearts: 0, comments: 0, saves: 0, reposts: 0);

    final authorRaw = json['author'];
    final FeedAuthor? author = authorRaw is Map<String, dynamic>
        ? FeedAuthor.fromJson(authorRaw)
        : null;

    final repostOfAuthorRaw = json['repostOfAuthor'];
    final FeedAuthor? repostOfAuthor = repostOfAuthorRaw is Map<String, dynamic>
        ? FeedAuthor.fromJson(repostOfAuthorRaw)
        : null;

    final repostSourceMediaRaw = json['repostSourceMedia'];
    final List<FeedMedia>? repostSourceMedia = repostSourceMediaRaw is List
        ? repostSourceMediaRaw
              .whereType<Map<String, dynamic>>()
              .map(FeedMedia.fromJson)
              .toList()
        : null;

    // flags object may override top-level liked/saved
    final flagsRaw = json['flags'];
    bool? liked = json['liked'] as bool?;
    bool? saved = json['saved'] as bool?;
    if (flagsRaw is Map<String, dynamic>) {
      liked = (flagsRaw['liked'] as bool?) ?? liked;
      saved = (flagsRaw['saved'] as bool?) ?? saved;
    }

    return FeedPost(
      id: (json['id'] as String?) ?? '',
      kind: (json['kind'] as String?) ?? 'post',
      content: (json['content'] as String?) ?? '',
      media: mediaList,
      hashtags: hashtagsList,
      stats: stats,
      createdAt: (json['createdAt'] as String?) ?? '',
      location: json['location'] as String?,
      author: author,
      authorId: json['authorId'] as String?,
      authorUsername: json['authorUsername'] as String?,
      authorDisplayName: json['authorDisplayName'] as String?,
      authorAvatarUrl: json['authorAvatarUrl'] as String?,
      authorIsCreatorVerified: json['authorIsCreatorVerified'] as bool?,
      liked: liked,
      saved: saved,
      following: json['following'] as bool?,
      repostOf: json['repostOf'] as String?,
      hideLikeCount: json['hideLikeCount'] as bool?,
      allowComments: json['allowComments'] as bool?,
      allowDownload: json['allowDownload'] as bool?,
      visibility: json['visibility'] as String?,
      sponsored: json['sponsored'] as bool?,
      repostOfAuthorId: json['repostOfAuthorId'] as String?,
      repostOfAuthorDisplayName: json['repostOfAuthorDisplayName'] as String?,
      repostOfAuthorUsername: json['repostOfAuthorUsername'] as String?,
      repostOfAuthorAvatarUrl: json['repostOfAuthorAvatarUrl'] as String?,
      repostOfAuthor: repostOfAuthor,
      repostSourceContent: json['repostSourceContent'] as String?,
      repostSourceMedia: repostSourceMedia,
      primaryVideoDurationMs: (json['primaryVideoDurationMs'] as num?)?.toInt(),
    );
  }
}

/// Mutable state wrapper for a feed post — holds the post data plus the
/// local interaction flags (liked, saved) and the live stats.
/// Mirrors the `PostViewState` pattern used by cordigram-web.
class FeedPostState {
  FeedPostState({required this.post})
    : liked = post.liked ?? false,
      saved = post.saved ?? false,
      following = post.following ?? false,
      stats = post.stats;

  final FeedPost post;
  bool liked;
  bool saved;
  bool following;
  FeedStats stats;

  /// Apply a server-returned stats object while preserving local flag state.
  void syncFromServer(FeedPost updated) {
    stats = updated.stats;
    // Only override flags if the server echoes them back
    if (updated.liked != null) liked = updated.liked!;
    if (updated.saved != null) saved = updated.saved!;
  }

  FeedPostState copyWith({
    FeedPost? post,
    bool? liked,
    bool? saved,
    bool? following,
    FeedStats? stats,
  }) {
    final next = FeedPostState(post: post ?? this.post);
    next.liked = liked ?? this.liked;
    next.saved = saved ?? this.saved;
    next.following = following ?? this.following;
    next.stats = stats ?? this.stats;
    return next;
  }
}

final RegExp _adMarkerRegex = RegExp(
  r'\[\[AD_(PRIMARY_TEXT|HEADLINE|DESCRIPTION|CTA|URL)\]\]',
  caseSensitive: false,
);

bool isAdLikeFeedPost(FeedPost post) {
  if (post.kind.toLowerCase() == 'ad') return true;
  if (post.sponsored == true) return true;
  if (_adMarkerRegex.hasMatch(post.content)) return true;
  if (_adMarkerRegex.hasMatch(post.repostSourceContent ?? '')) return true;
  return false;
}
