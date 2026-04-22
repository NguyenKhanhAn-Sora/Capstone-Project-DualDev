import '../../../core/services/api_service.dart';
import '../../../core/services/auth_storage.dart';

class InboxService {
  InboxService._();

  static Map<String, String> get _authHeaders => {
    'Authorization': 'Bearer ${AuthStorage.accessToken ?? ''}',
  };

  static Future<int> getUnreadInboxCount() async {
    final unread = await ApiService.get(
      '/inbox/unread',
      extraHeaders: _authHeaders,
    );
    final mentions = await ApiService.get(
      '/inbox/mentions',
      extraHeaders: _authHeaders,
    );
    final forYou = await ApiService.get(
      '/inbox/for-you',
      extraHeaders: _authHeaders,
    );

    final unreadItems = (unread['items'] as List?) ?? const <dynamic>[];
    final mentionItems = (mentions['items'] as List?) ?? const <dynamic>[];
    final forYouItems = (forYou['items'] as List?) ?? const <dynamic>[];
    final unseenForYou = forYouItems.where((e) {
      if (e is! Map) return false;
      final seen = e['seen'];
      return seen != true;
    }).length;

    return unreadItems.length + mentionItems.length + unseenForYou;
  }
}
