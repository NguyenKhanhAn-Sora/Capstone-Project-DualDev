import 'package:flutter/foundation.dart';

import '../../../core/services/api_service.dart';
import '../../../core/services/auth_storage.dart';
import '../../home/models/feed_post.dart';

class ExploreService {
  static const int pageSize = 30;

  static Future<List<FeedPost>> fetchExploreFeed({
    int page = 1,
    int limit = pageSize,
    List<String> kinds = const ['post', 'reel'],
  }) async {
    final token = AuthStorage.accessToken;
    if (token == null) throw const ApiException('Not authenticated');

    final safePage = page < 1 ? 1 : page;
    final safeLimit = limit.clamp(1, 60);

    final params = Uri(
      queryParameters: {
        'page': '$safePage',
        'limit': '$safeLimit',
        if (kinds.isNotEmpty) 'kinds': kinds.join(','),
      },
    );

    final raw = await ApiService.getList(
      '/explore?${params.query}',
      extraHeaders: {'Authorization': 'Bearer $token'},
    );

    return raw
        .whereType<Map<String, dynamic>>()
        .map(FeedPost.fromJson)
        .toList();
  }

  static Future<void> recordImpression({
    required String postId,
    required String sessionId,
    int? position,
    String source = 'explore-grid-mobile',
  }) async {
    final token = AuthStorage.accessToken;
    if (token == null) return;

    try {
      await ApiService.post(
        '/explore/impression',
        body: {
          'postId': postId,
          'sessionId': sessionId,
          'position': position,
          'source': source,
        },
        extraHeaders: {'Authorization': 'Bearer $token'},
      );
    } catch (e) {
      if (kDebugMode) {
        debugPrint('recordImpression failed for $postId: $e');
      }
    }
  }
}
