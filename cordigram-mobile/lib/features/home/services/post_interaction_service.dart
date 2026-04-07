import '../../../core/services/api_service.dart';
import '../../../core/services/auth_storage.dart';
import '../../../core/config/app_config.dart';

typedef PostVisibility = String;

class UpdatePostPayload {
  const UpdatePostPayload({
    this.content,
    this.hashtags,
    this.location,
    this.allowComments,
    this.allowDownload,
    this.hideLikeCount,
    this.visibility,
  });

  final String? content;
  final List<String>? hashtags;
  final String? location;
  final bool? allowComments;
  final bool? allowDownload;
  final bool? hideLikeCount;
  final PostVisibility? visibility;

  Map<String, dynamic> toJson() {
    return {
      if (content != null) 'content': content,
      if (hashtags != null) 'hashtags': hashtags,
      if (location != null) 'location': location,
      if (allowComments != null) 'allowComments': allowComments,
      if (allowDownload != null) 'allowDownload': allowDownload,
      if (hideLikeCount != null) 'hideLikeCount': hideLikeCount,
      if (visibility != null) 'visibility': visibility,
    };
  }
}

class PostInteractionService {
  static Map<String, String> get _authHeader => {
    'Authorization': 'Bearer ${AuthStorage.accessToken}',
  };

  static String permalink(String postId) =>
      '${AppConfig.webBaseUrl}/post/$postId';

  static String reelPermalink(String reelId) =>
      '${AppConfig.webBaseUrl}/reels/$reelId';

  // ── Like / Unlike ────────────────────────────────────────────────────────

  /// POST /posts/:id/like
  static Future<void> like(String postId) async {
    await ApiService.post('/posts/$postId/like', extraHeaders: _authHeader);
  }

  /// DELETE /posts/:id/like
  static Future<void> unlike(String postId) async {
    await ApiService.delete('/posts/$postId/like', extraHeaders: _authHeader);
  }

  // ── Save / Unsave ────────────────────────────────────────────────────────

  /// POST /posts/:id/save
  static Future<void> save(String postId) async {
    await ApiService.post('/posts/$postId/save', extraHeaders: _authHeader);
  }

  /// DELETE /posts/:id/save
  static Future<void> unsave(String postId) async {
    await ApiService.delete('/posts/$postId/save', extraHeaders: _authHeader);
  }

  // ── Hide ─────────────────────────────────────────────────────────────────

  /// POST /posts/:id/hide
  static Future<void> hide(String postId) async {
    await ApiService.post('/posts/$postId/hide', extraHeaders: _authHeader);
  }

  static Future<void> report(String postId) async {
    await ApiService.post('/posts/$postId/report', extraHeaders: _authHeader);
  }

  static Future<void> deletePost(String postId) async {
    await ApiService.delete('/posts/$postId', extraHeaders: _authHeader);
  }

  static Future<Map<String, dynamic>> updatePost(
    String postId,
    UpdatePostPayload payload,
  ) async {
    return ApiService.patch(
      '/posts/$postId',
      body: payload.toJson(),
      extraHeaders: _authHeader,
    );
  }

  static Future<Map<String, dynamic>> updateVisibility(
    String postId,
    PostVisibility visibility,
  ) async {
    return ApiService.patch(
      '/posts/$postId/visibility',
      body: {'visibility': visibility},
      extraHeaders: _authHeader,
    );
  }

  static Future<void> setAllowComments(
    String postId,
    bool allowComments,
  ) async {
    await ApiService.post(
      '/posts/$postId/allow-comments',
      body: {'allowComments': allowComments},
      extraHeaders: _authHeader,
    );
  }

  static Future<void> setHideLikeCount(
    String postId,
    bool hideLikeCount,
  ) async {
    await ApiService.post(
      '/posts/$postId/hide-like-count',
      body: {'hideLikeCount': hideLikeCount},
      extraHeaders: _authHeader,
    );
  }

  static Future<void> blockUser(String userId) async {
    await ApiService.post('/users/$userId/block', extraHeaders: _authHeader);
  }

  // ── View ─────────────────────────────────────────────────────────────────

  /// POST /posts/:id/view
  /// Increments the view counter server-side.
  /// [durationMs] is how long (ms) the post was visible; pass null if unknown.
  static Future<void> view(String postId, {int? durationMs}) async {
    await ApiService.post(
      '/posts/$postId/view',
      body: {'durationMs': durationMs},
      extraHeaders: _authHeader,
    );
  }

  // ── Follow / Unfollow ────────────────────────────────────────────────────

  /// POST /users/:userId/follow
  static Future<void> follow(String userId) async {
    await ApiService.post('/users/$userId/follow', extraHeaders: _authHeader);
  }

  /// DELETE /users/:userId/follow
  static Future<void> unfollow(String userId) async {
    await ApiService.delete('/users/$userId/follow', extraHeaders: _authHeader);
  }
}
