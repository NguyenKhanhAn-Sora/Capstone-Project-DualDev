import '../../../core/services/api_service.dart';
import '../../../core/services/auth_storage.dart';
import '../../home/models/feed_post.dart';

class ProfileSearchItem {
  const ProfileSearchItem({
    required this.userId,
    required this.displayName,
    required this.username,
    required this.avatarUrl,
    required this.isCreatorVerified,
  });

  final String userId;
  final String displayName;
  final String username;
  final String avatarUrl;
  final bool isCreatorVerified;

  factory ProfileSearchItem.fromJson(Map<String, dynamic> json) {
    return ProfileSearchItem(
      userId: (json['userId'] as String?) ?? '',
      displayName: (json['displayName'] as String?) ?? 'Unknown',
      username: (json['username'] as String?) ?? '',
      avatarUrl: (json['avatarUrl'] as String?) ?? '',
      isCreatorVerified: (json['isCreatorVerified'] as bool?) ?? false,
    );
  }
}

class HashtagSearchItem {
  const HashtagSearchItem({
    required this.id,
    required this.name,
    required this.usageCount,
  });

  final String id;
  final String name;
  final int usageCount;

  factory HashtagSearchItem.fromJson(Map<String, dynamic> json) {
    return HashtagSearchItem(
      id: (json['id'] as String?) ?? '',
      name: (json['name'] as String?) ?? '',
      usageCount: (json['usageCount'] as num?)?.toInt() ?? 0,
    );
  }
}

class SearchPostsPage {
  const SearchPostsPage({
    required this.page,
    required this.limit,
    required this.hasMore,
    required this.items,
  });

  final int page;
  final int limit;
  final bool hasMore;
  final List<FeedPost> items;
}

enum SearchHistoryKind { profile, hashtag, post, reel, query }

class SearchHistoryItem {
  const SearchHistoryItem({
    required this.id,
    required this.kind,
    required this.key,
    required this.label,
    required this.subtitle,
    required this.imageUrl,
    required this.mediaType,
    required this.refId,
    required this.refSlug,
    this.lastUsedAt,
  });

  final String id;
  final SearchHistoryKind kind;
  final String key;
  final String label;
  final String subtitle;
  final String imageUrl;
  final String mediaType;
  final String refId;
  final String refSlug;
  final String? lastUsedAt;

  factory SearchHistoryItem.fromJson(Map<String, dynamic> json) {
    final rawKind = ((json['kind'] as String?) ?? 'query').toLowerCase();
    final kind = switch (rawKind) {
      'profile' => SearchHistoryKind.profile,
      'hashtag' => SearchHistoryKind.hashtag,
      'post' => SearchHistoryKind.post,
      'reel' => SearchHistoryKind.reel,
      _ => SearchHistoryKind.query,
    };

    return SearchHistoryItem(
      id: (json['id'] as String?) ?? '',
      kind: kind,
      key: (json['key'] as String?) ?? '',
      label: (json['label'] as String?) ?? '',
      subtitle: (json['subtitle'] as String?) ?? '',
      imageUrl: (json['imageUrl'] as String?) ?? '',
      mediaType: (json['mediaType'] as String?) ?? '',
      refId: (json['refId'] as String?) ?? '',
      refSlug: (json['refSlug'] as String?) ?? '',
      lastUsedAt: json['lastUsedAt'] as String?,
    );
  }
}

class SearchService {
  static String _tokenOrThrow() {
    final token = AuthStorage.accessToken;
    if (token == null || token.isEmpty) {
      throw const ApiException('Not authenticated');
    }
    return token;
  }

  static Map<String, String> _auth(String token) => {
    'Authorization': 'Bearer $token',
  };

  static Future<List<ProfileSearchItem>> searchProfiles({
    required String query,
    int limit = 50,
  }) async {
    final token = _tokenOrThrow();
    final params = Uri(
      queryParameters: {'q': query, 'limit': limit.toString()},
    );

    final res = await ApiService.get(
      '/profiles/search?${params.query}',
      extraHeaders: _auth(token),
    );

    final items = (res['items'] as List? ?? const [])
        .whereType<Map<String, dynamic>>()
        .map(ProfileSearchItem.fromJson)
        .toList(growable: false);
    return items;
  }

  static Future<List<HashtagSearchItem>> suggestHashtags({
    required String query,
    int limit = 10,
  }) async {
    final token = _tokenOrThrow();
    final params = Uri(
      queryParameters: {'q': query, 'limit': limit.toString()},
    );

    final res = await ApiService.get(
      '/hashtags/suggest?${params.query}',
      extraHeaders: _auth(token),
    );

    final items = (res['items'] as List? ?? const [])
        .whereType<Map<String, dynamic>>()
        .map(HashtagSearchItem.fromJson)
        .toList(growable: false);
    return items;
  }

  static Future<({List<HashtagSearchItem> items, bool hasMore})>
  searchHashtags({required String query, int limit = 20, int page = 1}) async {
    final token = _tokenOrThrow();
    final params = Uri(
      queryParameters: {
        'q': query,
        'limit': limit.toString(),
        'page': page.toString(),
      },
    );

    final res = await ApiService.get(
      '/hashtags/search?${params.query}',
      extraHeaders: _auth(token),
    );

    final items = (res['items'] as List? ?? const [])
        .whereType<Map<String, dynamic>>()
        .map(HashtagSearchItem.fromJson)
        .toList(growable: false);

    return (items: items, hasMore: (res['hasMore'] as bool?) ?? false);
  }

  static Future<SearchPostsPage> searchPosts({
    required String query,
    required List<String> kinds,
    int limit = 20,
    int page = 1,
    String sort = 'relevance',
  }) async {
    final token = _tokenOrThrow();
    final normalizedKinds = kinds
        .map((k) => k.trim().toLowerCase())
        .where((k) => k == 'post' || k == 'reel')
        .toSet()
        .toList(growable: false);

    final params = Uri(
      queryParameters: {
        'q': query,
        'limit': limit.toString(),
        'page': page.toString(),
        'kinds': normalizedKinds.join(','),
        'sort': sort,
      },
    );

    final res = await ApiService.get(
      '/search/posts?${params.query}',
      extraHeaders: _auth(token),
    );

    final items = (res['items'] as List? ?? const [])
        .whereType<Map<String, dynamic>>()
        .map(FeedPost.fromJson)
        .toList(growable: false);

    return SearchPostsPage(
      page: (res['page'] as num?)?.toInt() ?? page,
      limit: (res['limit'] as num?)?.toInt() ?? limit,
      hasMore: (res['hasMore'] as bool?) ?? false,
      items: items,
    );
  }

  static Future<List<SearchHistoryItem>> fetchHistory() async {
    final token = _tokenOrThrow();
    final res = await ApiService.get(
      '/search/history',
      extraHeaders: _auth(token),
    );
    final items = (res['items'] as List? ?? const [])
        .whereType<Map<String, dynamic>>()
        .map(SearchHistoryItem.fromJson)
        .toList(growable: false);
    return items;
  }

  static Future<void> clearHistory() async {
    final token = _tokenOrThrow();
    await ApiService.delete('/search/history', extraHeaders: _auth(token));
  }

  static Future<void> deleteHistoryItem(String id) async {
    final token = _tokenOrThrow();
    await ApiService.delete(
      '/search/history/${Uri.encodeComponent(id)}',
      extraHeaders: _auth(token),
    );
  }

  static Future<void> addHistoryQuery(String query) async {
    final token = _tokenOrThrow();
    await ApiService.post(
      '/search/history',
      body: {'kind': 'query', 'query': query},
      extraHeaders: _auth(token),
    );
  }

  static Future<void> addHistoryProfile(ProfileSearchItem item) async {
    final token = _tokenOrThrow();
    await ApiService.post(
      '/search/history',
      body: {
        'kind': 'profile',
        'userId': item.userId,
        'username': item.username,
        'displayName': item.displayName,
        'avatarUrl': item.avatarUrl,
      },
      extraHeaders: _auth(token),
    );
  }

  static Future<void> addHistoryHashtag(String tag) async {
    final token = _tokenOrThrow();
    await ApiService.post(
      '/search/history',
      body: {'kind': 'hashtag', 'tag': tag},
      extraHeaders: _auth(token),
    );
  }

  static Future<void> addHistoryPost({
    required String kind,
    required FeedPost post,
  }) async {
    final token = _tokenOrThrow();
    final first = post.media.isNotEmpty ? post.media.first : null;
    await ApiService.post(
      '/search/history',
      body: {
        'kind': kind,
        'postId': post.repostOf?.isNotEmpty == true ? post.repostOf : post.id,
        'content': post.content,
        'mediaUrl': first?.url ?? '',
        'mediaType': first?.type ?? '',
        'authorUsername': post.authorUsername ?? post.author?.username,
      },
      extraHeaders: _auth(token),
    );
  }
}
