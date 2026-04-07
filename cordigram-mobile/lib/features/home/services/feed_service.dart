import '../../../core/services/api_service.dart';
import '../../../core/services/auth_storage.dart';
import '../models/feed_post.dart';

class FeedService {
  static const int pageSize = 12;

  /// Mirrors cordigram-web's load() strategy:
  /// always fetches from the beginning with limit = page * pageSize (no ?page= param).
  ///
  /// Why: the backend's candidateLimit = limit * 2. If limit is small and a
  /// ?page= offset is used, the candidate pool is exhausted early and the feed
  /// appears to end at 3-5 posts even when many more exist. The web avoids
  /// this by growing the limit on every "load more" call.
  static Future<List<FeedPost>> fetchFeed({
    int page = 1,
    String scope = 'all',
    List<String> kinds = const ['post'],
  }) async {
    final token = AuthStorage.accessToken;
    if (token == null) throw const ApiException('Not authenticated');

    final limit = page * pageSize;
    final normalizedKinds = kinds
        .map((k) => k.trim().toLowerCase())
        .where((k) => k == 'post' || k == 'reel')
        .toSet()
        .toList(growable: false);
    final normalizedScope = scope.trim().toLowerCase();

    final queryParams = <String, String>{
      'limit': limit.toString(),
      'kinds': normalizedKinds.isEmpty ? 'post' : normalizedKinds.join(','),
    };
    if (normalizedScope == 'following') {
      queryParams['scope'] = 'following';
    }

    final params = Uri(queryParameters: queryParams);

    final raw = await ApiService.getList(
      '/posts/feed?${params.query}',
      extraHeaders: {'Authorization': 'Bearer $token'},
    );

    final expectedKinds = normalizedKinds.isEmpty
        ? const {'post'}
        : normalizedKinds.toSet();

    return raw
        .whereType<Map<String, dynamic>>()
        .map(FeedPost.fromJson)
        .where((p) => expectedKinds.contains(p.kind.toLowerCase()))
        .toList();
  }
}
