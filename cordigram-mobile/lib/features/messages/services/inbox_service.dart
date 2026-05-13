import '../../../core/services/api_service.dart';
import '../../../core/services/auth_storage.dart';
import '../models/inbox_models.dart';
import 'direct_messages_service.dart';

class InboxService {
  InboxService._();

  static Map<String, String> get _authHeaders => {
    'Authorization': 'Bearer ${AuthStorage.accessToken ?? ''}',
  };

  /// Accepts `{ items }`, `{ data: [] }`, or `{ data: { items } }` from proxies / older BE.
  static List<Map<String, dynamic>> _itemMaps(Map<String, dynamic> res) {
    dynamic raw = res['items'];
    if (raw is! List) {
      final data = res['data'];
      if (data is List) {
        raw = data;
      } else if (data is Map) {
        final inner = Map<String, dynamic>.from(data);
        raw = inner['items'] ?? inner['results'];
      }
    }
    if (raw is! List) return const [];
    final out = <Map<String, dynamic>>[];
    for (final e in raw) {
      if (e is Map) {
        out.add(Map<String, dynamic>.from(e));
      }
    }
    return out;
  }

  static Future<List<InboxForYouItem>> fetchForYou() async {
    final res = await ApiService.get('/inbox/for-you', extraHeaders: _authHeaders);
    return _itemMaps(res)
        .map(InboxForYouItem.fromJson)
        .toList();
  }

  static Future<List<InboxUnreadItem>> fetchUnread() async {
    final res = await ApiService.get('/inbox/unread', extraHeaders: _authHeaders);
    return _itemMaps(res)
        .map(InboxUnreadItem.fromJson)
        .where((item) {
          if (item is InboxUnreadDmItem) {
            return !DirectMessagesService.isConversationMuted(item.userId);
          }
          return true;
        })
        .toList();
  }

  static Future<List<InboxMentionItem>> fetchMentions() async {
    final res = await ApiService.get('/inbox/mentions', extraHeaders: _authHeaders);
    return _itemMaps(res)
        .map(InboxMentionItem.fromJson)
        .toList();
  }

  static Future<void> markSeen({
    required String sourceType,
    required String sourceId,
  }) async {
    await ApiService.post(
      '/inbox/seen',
      extraHeaders: _authHeaders,
      body: {'sourceType': sourceType, 'sourceId': sourceId},
    );
  }

  static Future<int> getUnreadInboxCount() async {
    final unread = await fetchUnread();
    final mentions = await fetchMentions();
    final forYou = await fetchForYou();

    final unseenForYou = forYou.where((e) {
      if (e is InboxEventItem) return e.seen != true;
      if (e is InboxServerInviteItem) return e.seen != true;
      if (e is InboxServerNotificationItem) return e.seen != true;
      return false;
    }).length;

    return unread.length + mentions.length + unseenForYou;
  }
}
