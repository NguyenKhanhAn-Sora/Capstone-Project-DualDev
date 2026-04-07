import '../../../core/services/api_service.dart';
import '../../../core/services/auth_storage.dart';
import '../../home/models/feed_post.dart';

class HashtagFeedBundle {
  const HashtagFeedBundle({required this.posts, required this.reels});

  final List<FeedPost> posts;
  final List<FeedPost> reels;
}

class HashtagFeedService {
  static const int pageSize = 18;

  static Future<HashtagFeedBundle> fetchByTag({
    required String tag,
    int page = 1,
  }) async {
    final token = AuthStorage.accessToken;
    if (token == null) throw const ApiException('Not authenticated');

    final normalizedTag = tag.replaceAll('#', '').trim().toLowerCase();
    if (normalizedTag.isEmpty) {
      throw const ApiException('Invalid hashtag');
    }

    final limit = page * pageSize;
    final query = Uri(queryParameters: {'limit': limit.toString()}).query;
    final encoded = Uri.encodeComponent(normalizedTag);

    final postsRaw = await ApiService.getList(
      '/posts/hashtag/$encoded?$query',
      extraHeaders: {'Authorization': 'Bearer $token'},
    );

    final reelsRaw = await ApiService.getList(
      '/posts/hashtag/$encoded/reels?$query',
      extraHeaders: {'Authorization': 'Bearer $token'},
    );

    final posts = postsRaw
        .whereType<Map<String, dynamic>>()
        .map(FeedPost.fromJson)
        .where((item) => item.kind.toLowerCase() == 'post')
        .toList(growable: false);

    final reels = reelsRaw
        .whereType<Map<String, dynamic>>()
        .map(FeedPost.fromJson)
        .where((item) => item.kind.toLowerCase() == 'reel')
        .toList(growable: false);

    return HashtagFeedBundle(posts: posts, reels: reels);
  }
}
