import '../../../core/services/api_service.dart';
import '../../../core/services/auth_storage.dart';
import '../models/app_notification_item.dart';

class NotificationService {
  static Future<List<AppNotificationItem>> fetchNotifications({
    int limit = 50,
  }) async {
    final token = AuthStorage.accessToken;
    if (token == null) throw const ApiException('Not authenticated');

    final response = await ApiService.get(
      '/notifications?limit=$limit',
      extraHeaders: {'Authorization': 'Bearer $token'},
    );

    final rawItems = response['items'];
    if (rawItems is! List) return const [];

    return rawItems
        .whereType<Map<String, dynamic>>()
        .map(AppNotificationItem.fromJson)
        .toList(growable: false);
  }

  static Future<void> markRead(String notificationId) async {
    final token = AuthStorage.accessToken;
    if (token == null) throw const ApiException('Not authenticated');

    await ApiService.patch(
      '/notifications/$notificationId/read',
      extraHeaders: {'Authorization': 'Bearer $token'},
    );
  }

  static Future<void> markUnread(String notificationId) async {
    final token = AuthStorage.accessToken;
    if (token == null) throw const ApiException('Not authenticated');

    await ApiService.patch(
      '/notifications/$notificationId/unread',
      extraHeaders: {'Authorization': 'Bearer $token'},
    );
  }

  static Future<void> deleteNotification(String notificationId) async {
    final token = AuthStorage.accessToken;
    if (token == null) throw const ApiException('Not authenticated');

    await ApiService.delete(
      '/notifications/$notificationId',
      extraHeaders: {'Authorization': 'Bearer $token'},
    );
  }

  static Future<Map<String, dynamic>> fetchCommentById({
    required String postId,
    required String commentId,
  }) async {
    final token = AuthStorage.accessToken;
    if (token == null) throw const ApiException('Not authenticated');

    return ApiService.get(
      '/posts/$postId/comments/$commentId',
      extraHeaders: {'Authorization': 'Bearer $token'},
    );
  }

  static Future<Map<String, dynamic>> updatePostMute({
    required String postId,
    bool? enabled,
    String? mutedUntil,
    bool? mutedIndefinitely,
  }) async {
    final token = AuthStorage.accessToken;
    if (token == null) throw const ApiException('Not authenticated');

    return ApiService.patch(
      '/posts/$postId/notifications/mute',
      body: {
        if (enabled != null) 'enabled': enabled,
        if (mutedUntil != null) 'mutedUntil': mutedUntil,
        if (mutedIndefinitely != null) 'mutedIndefinitely': mutedIndefinitely,
      },
      extraHeaders: {'Authorization': 'Bearer $token'},
    );
  }
}
