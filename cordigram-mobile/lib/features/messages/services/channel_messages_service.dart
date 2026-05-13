import '../../../core/services/api_service.dart';
import '../../../core/services/auth_storage.dart';
import '../models/channel_message.dart';

class ChannelMessagesService {
  ChannelMessagesService._();

  static Map<String, String> get _authHeaders => {
    'Authorization': 'Bearer ${AuthStorage.accessToken ?? ''}',
  };

  static Future<Map<String, dynamic>> getChannelMessagesEnvelope(
    String channelId, {
    int limit = 30,
    int skip = 0,
  }) async {
    return ApiService.get(
      '/channels/$channelId/messages?limit=$limit&skip=$skip',
      extraHeaders: _authHeaders,
    );
  }

  static Future<List<ChannelMessage>> getChannelMessages(
    String channelId, {
    int limit = 30,
    int skip = 0,
  }) async {
    final res = await getChannelMessagesEnvelope(
      channelId,
      limit: limit,
      skip: skip,
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
    String content, {
    String type = 'text',
    String? giphyId,
    String? voiceUrl,
    int? voiceDuration,
    String? customStickerUrl,
    String? serverStickerId,
    String? serverStickerServerId,
    List<String>? attachments,
    String? replyTo,
  }) async {
    final res = await ApiService.post(
      '/channels/$channelId/messages',
      extraHeaders: _authHeaders,
      body: {
        'content': content,
        // Channel API uses `messageType` (not `type` like DM endpoint).
        'messageType': type,
        if ((giphyId ?? '').isNotEmpty) 'giphyId': giphyId,
        if ((customStickerUrl ?? '').isNotEmpty)
          'customStickerUrl': customStickerUrl,
        if ((serverStickerId ?? '').isNotEmpty) 'serverStickerId': serverStickerId,
        if ((serverStickerServerId ?? '').isNotEmpty)
          'serverStickerServerId': serverStickerServerId,
        if ((voiceUrl ?? '').isNotEmpty) 'voiceUrl': voiceUrl,
        if (voiceDuration != null) 'voiceDuration': voiceDuration,
        if ((attachments ?? const <String>[]).isNotEmpty)
          'attachments': attachments,
        if ((replyTo ?? '').isNotEmpty) 'replyTo': replyTo,
      },
    );
    final raw = res['message'] ?? res['data'] ?? res;
    if (raw is! Map) return null;
    return ChannelMessage.fromJson(Map<String, dynamic>.from(raw));
  }

  static Future<ChannelMessage?> sendWaveSticker(
    String channelId, {
    String? replyTo,
    String? giphyId,
  }) async {
    final res = await ApiService.post(
      '/channels/$channelId/messages/wave-sticker',
      extraHeaders: _authHeaders,
      body: <String, dynamic>{
        if ((replyTo ?? '').isNotEmpty) 'replyTo': replyTo,
        if ((giphyId ?? '').isNotEmpty) 'giphyId': giphyId,
      },
    );
    final raw = res['message'] ?? res['data'] ?? res;
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

  static Future<ChannelMessage?> togglePin({
    required String channelId,
    required String messageId,
  }) async {
    Map<String, dynamic> res;
    try {
      res = await ApiService.post(
        '/channels/$channelId/messages/$messageId/pin',
        extraHeaders: _authHeaders,
      );
    } catch (_) {
      // Backward-compatible fallback for deployments using an alternate pin route.
      res = await ApiService.post(
        '/channels/$channelId/messages/pin/$messageId',
        extraHeaders: _authHeaders,
      );
    }
    final raw = res['message'] ?? res['data'] ?? res;
    if (raw is! Map) return null;
    return ChannelMessage.fromJson(Map<String, dynamic>.from(raw));
  }

  static Future<List<ChannelMessage>> getPinnedMessages(String channelId) async {
    List<dynamic> list;
    try {
      list = await ApiService.getList(
        '/channels/$channelId/messages/pinned',
        extraHeaders: _authHeaders,
      );
    } catch (_) {
      list = await ApiService.getList(
        '/channels/$channelId/messages/pins',
        extraHeaders: _authHeaders,
      );
    }
    return list
        .whereType<Map>()
        .map((e) => ChannelMessage.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  static Future<void> deleteMessage({
    required String channelId,
    required String messageId,
    String deleteType = 'for-me',
  }) async {
    final path = deleteType == 'for-everyone'
        ? '/channels/$channelId/messages/$messageId/delete-for-everyone'
        : '/channels/$channelId/messages/$messageId/delete-for-me';
    await ApiService.post(
      path,
      extraHeaders: _authHeaders,
      body: const <String, dynamic>{},
    );
  }
}
