import '../../../core/services/api_service.dart';
import '../../../core/services/auth_storage.dart';
import '../models/feed_post.dart';

class FeedService {
  static const int pageSize = 12;

  /// Proper offset-based pagination: sends limit=pageSize&page=N.
  /// Backend now has a large candidate pool (≥300) and supports per-page slicing,
  /// so this is safe and avoids refetching all previous items on every load-more.
  static Future<List<FeedPost>> fetchFeed({
    int page = 1,
    String scope = 'all',
    List<String> kinds = const ['post'],
  }) async {
    final token = AuthStorage.accessToken;
    if (token == null) throw const ApiException('Not authenticated');

    final normalizedKinds = kinds
        .map((k) => k.trim().toLowerCase())
        .where((k) => k == 'post' || k == 'reel')
        .toSet()
        .toList(growable: false);
    final normalizedScope = scope.trim().toLowerCase();

    final queryParams = <String, String>{
      'limit': pageSize.toString(),
      'kinds': normalizedKinds.isEmpty ? 'post' : normalizedKinds.join(','),
    };
    if (page > 1) queryParams['page'] = page.toString();
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
