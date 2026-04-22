import '../../../core/services/api_service.dart';
import '../../../core/services/auth_storage.dart';
import '../models/channel_message.dart';

class ChannelMessagesService {
  ChannelMessagesService._();

  static Map<String, String> get _authHeaders => {
    'Authorization': 'Bearer ${AuthStorage.accessToken ?? ''}',
  };

  static Future<List<ChannelMessage>> getChannelMessages(
    String channelId, {
    int limit = 30,
    int skip = 0,
  }) async {
    final res = await ApiService.get(
      '/channels/$channelId/messages?limit=$limit&skip=$skip',
      extraHeaders: _authHeaders,
    );
    final list = (res['messages'] ?? res['items'] ?? res['data']) as List?;
    final entries = list ?? const <dynamic>[];
    return entries
        .whereType<Map>()
        .map((e) => ChannelMessage.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  static Future<ChannelMessage?> sendChannelMessage(
    String channelId,
    String content,
  ) async {
    final res = await ApiService.post(
      '/channels/$channelId/messages',
      extraHeaders: _authHeaders,
      body: {'content': content},
    );
    final raw = res['message'] ?? res['data'];
    if (raw is! Map) return null;
    return ChannelMessage.fromJson(Map<String, dynamic>.from(raw));
  }

  static Future<void> markChannelRead(String channelId) async {
    await ApiService.post(
      '/channels/$channelId/messages/read',
      extraHeaders: _authHeaders,
    );
  }

  static Future<void> addReaction({
    required String channelId,
    required String messageId,
    required String emoji,
  }) async {
    await ApiService.post(
      '/channels/$channelId/messages/$messageId/reactions/$emoji',
      extraHeaders: _authHeaders,
    );
  }
}
