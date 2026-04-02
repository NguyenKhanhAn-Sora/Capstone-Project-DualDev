import '../../../core/services/api_service.dart';
import '../../../core/services/auth_storage.dart';

class PostInteractionService {
  static Map<String, String> get _authHeader => {
    'Authorization': 'Bearer ${AuthStorage.accessToken}',
  };

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
