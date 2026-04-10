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
}
