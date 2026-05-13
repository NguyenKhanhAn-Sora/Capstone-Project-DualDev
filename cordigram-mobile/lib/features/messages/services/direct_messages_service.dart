import 'dart:convert';

import '../../../core/services/api_service.dart';
import '../../../core/services/auth_storage.dart';
import '../models/dm_conversation.dart';
import '../models/dm_message.dart';

class DirectMessagesService {
  DirectMessagesService._();
  static final Map<String, DateTime?> _dmMutedUntil = {};
  static final Set<String> _dmMutedForever = {};

  static Future<Map<String, dynamic>> getMyMessagingProfile() async {
    try {
      return await ApiService.get(
        '/messaging-profiles/me',
        extraHeaders: _authHeaders,
      );
    } catch (_) {
      return ApiService.get('/profiles/me', extraHeaders: _authHeaders);
    }
  }

  static Map<String, String> get _authHeaders => {
    'Authorization': 'Bearer ${AuthStorage.accessToken ?? ''}',
  };

  static String? get currentUserId =>
      _extractUserIdFromToken(AuthStorage.accessToken);

  static Future<String> getCurrentLanguageCode() async {
    try {
      final res = await ApiService.get(
        '/users/settings',
        extraHeaders: _authHeaders,
      );
      final lang = (res['language'] ?? '').toString().toLowerCase();
      if (lang == 'vi' || lang == 'en' || lang == 'ja' || lang == 'zh') {
        return lang;
      }
    } catch (_) {}
    return 'vi';
  }

  static Future<List<DmConversation>> getConversations() async {
    List<dynamic> list;
    try {
      list = await ApiService.getList(
        '/direct-messages/conversations',
        extraHeaders: _authHeaders,
      );
    } catch (_) {
      final res = await ApiService.get(
        '/direct-messages/conversations',
        extraHeaders: _authHeaders,
      );
      list =
          (res['conversations'] ?? res['items'] ?? res['data']) as List? ??
          const <dynamic>[];
    }
    return list
        .whereType<Map>()
        .map((e) => DmConversation.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  static void setConversationMuted(
    String peerUserId, {
    Duration? duration,
    bool forever = false,
  }) {
    if (peerUserId.trim().isEmpty) return;
    if (forever) {
      _dmMutedForever.add(peerUserId);
      _dmMutedUntil.remove(peerUserId);
      return;
    }
    if (duration == null) {
      _dmMutedForever.remove(peerUserId);
      _dmMutedUntil.remove(peerUserId);
      return;
    }
    _dmMutedForever.remove(peerUserId);
    _dmMutedUntil[peerUserId] = DateTime.now().add(duration);
  }

  static bool isConversationMuted(String peerUserId) {
    if (_dmMutedForever.contains(peerUserId)) return true;
    final until = _dmMutedUntil[peerUserId];
    if (until == null) return false;
    if (DateTime.now().isAfter(until)) {
      _dmMutedUntil.remove(peerUserId);
      return false;
    }
    return true;
  }

  /// True when the user chose "until I turn notifications back on" (not a timed mute).
  static bool isConversationMutedForever(String peerUserId) {
    return _dmMutedForever.contains(peerUserId);
  }

  static Future<List<DmMessage>> getConversationMessages(
    String peerUserId, {
    int limit = 30,
    int skip = 0,
  }) async {
    List<dynamic> list;
    try {
      list = await ApiService.getList(
        '/direct-messages/conversation/$peerUserId?limit=$limit&skip=$skip',
        extraHeaders: _authHeaders,
      );
    } catch (_) {
      final res = await ApiService.get(
        '/direct-messages/conversation/$peerUserId?limit=$limit&skip=$skip',
        extraHeaders: _authHeaders,
      );
      list =
          (res['messages'] ?? res['items'] ?? res['data']) as List? ??
          const <dynamic>[];
    }
    return list
        .whereType<Map>()
        .map((e) => DmMessage.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  static Future<DmMessage?> sendMessage(
    String receiverId, {
    required String content,
    String type = 'text',
    String? voiceUrl,
    int? voiceDuration,
    List<String>? attachments,
    String? giphyId,
    String? replyTo,
  }) async {
    final res = await ApiService.post(
      '/direct-messages/$receiverId',
      extraHeaders: _authHeaders,
      body: {
        'content': content,
        'type': type,
        if (voiceUrl != null) 'voiceUrl': voiceUrl,
        if (voiceDuration != null) 'voiceDuration': voiceDuration,
        if (attachments != null && attachments.isNotEmpty)
          'attachments': attachments,
        if (giphyId != null && giphyId.isNotEmpty) 'giphyId': giphyId,
        if (replyTo != null && replyTo.isNotEmpty) 'replyTo': replyTo,
      },
    );
    final message = _pickMap(res, ['message', 'data']);
    if (message == null) return null;
    return DmMessage.fromJson(message);
  }

  static Future<void> markConversationRead(String peerUserId) async {
    await ApiService.post(
      '/direct-messages/conversation/$peerUserId/read',
      extraHeaders: _authHeaders,
    );
  }

  static Future<int> getUnreadCount() async {
    final res = await ApiService.get(
      '/direct-messages/unread/count',
      extraHeaders: _authHeaders,
    );
    final raw = res['unreadCount'] ?? res['count'] ?? res['totalUnread'] ?? 0;
    return raw is num ? raw.toInt() : 0;
  }

  static Future<void> addReaction(String messageId, String emoji) async {
    await ApiService.post(
      '/direct-messages/$messageId/reaction/$emoji',
      extraHeaders: _authHeaders,
    );
  }

  static Future<DmMessage?> togglePin(String messageId) async {
    Map<String, dynamic> res;
    try {
      res = await ApiService.post(
        '/direct-messages/$messageId/pin',
        extraHeaders: _authHeaders,
      );
    } catch (_) {
      // Backward-compatible fallback for deployments using a different route shape.
      res = await ApiService.post(
        '/direct-messages/pin/$messageId',
        extraHeaders: _authHeaders,
      );
    }
    final message = _pickMap(res, ['message', 'data']);
    final raw = message ?? res;
    return DmMessage.fromJson(Map<String, dynamic>.from(raw));
  }

  static Future<List<DmMessage>> getPinnedMessages(String peerUserId) async {
    List<dynamic> list;
    try {
      list = await ApiService.getList(
        '/direct-messages/pinned/$peerUserId',
        extraHeaders: _authHeaders,
      );
    } catch (_) {
      list = await ApiService.getList(
        '/direct-messages/pins/$peerUserId',
        extraHeaders: _authHeaders,
      );
    }
    return list
        .whereType<Map>()
        .map((e) => DmMessage.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  static Future<void> deleteMessage(
    String messageId, {
    String deleteType = 'for-me',
  }) async {
    await ApiService.delete(
      '/direct-messages/$messageId?deleteType=${Uri.encodeQueryComponent(deleteType)}',
      extraHeaders: _authHeaders,
    );
  }

  static Future<List<DmConversation>> searchConversations(String query) async {
    final encoded = Uri.encodeQueryComponent(query);
    final res = await ApiService.get(
      '/direct-messages/search?q=$encoded',
      extraHeaders: _authHeaders,
    );
    final list =
        (res['results'] ?? res['items'] ?? res['data']) as List? ??
        const <dynamic>[];
    return list
        .whereType<Map>()
        .map((e) => DmConversation.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  static Future<List<DmConversation>> getAvailableUsersAsConversations() async {
    final list = await ApiService.getList(
      '/direct-messages/available-users/list',
      extraHeaders: _authHeaders,
    );
    return list
        .whereType<Map>()
        .map((item) {
          final map = Map<String, dynamic>.from(item);
          final userId = (map['userId'] ?? map['_id'] ?? '').toString();
          final displayName = (map['displayName'] ?? '').toString();
          final username = (map['username'] ?? '').toString();
          return DmConversation(
            userId: userId,
            displayName: displayName,
            username: username,
            lastMessage: '',
            lastMessageAt: null,
            unreadCount: 0,
            avatarUrl: (map['avatar'] ?? map['avatarUrl'])?.toString(),
            isOnline: map['isOnline'] == true,
          );
        })
        .where((c) => c.userId.isNotEmpty)
        .toList();
  }

  static Future<Set<String>> getBlockedUserIds() async {
    List<dynamic> list;
    try {
      list = await ApiService.getList('/users/blocked', extraHeaders: _authHeaders);
    } catch (_) {
      final res = await ApiService.get('/users/blocked', extraHeaders: _authHeaders);
      list = (res['items'] ?? res['data'] ?? res['blocked'] ?? res['users']) as List? ??
          const <dynamic>[];
    }
    final out = <String>{};
    for (final item in list.whereType<Map>()) {
      final map = Map<String, dynamic>.from(item);
      final direct = (map['userId'] ?? map['blockedUserId'] ?? map['_id'] ?? '')
          .toString()
          .trim();
      if (direct.isNotEmpty) {
        out.add(direct);
        continue;
      }
      final blockedUser = map['blockedUser'];
      if (blockedUser is Map) {
        final id = (blockedUser['_id'] ?? blockedUser['userId'] ?? '')
            .toString()
            .trim();
        if (id.isNotEmpty) out.add(id);
      }
    }
    return out;
  }

  static Future<void> blockUser(String targetUserId) async {
    await ApiService.post(
      '/users/$targetUserId/block',
      extraHeaders: _authHeaders,
    );
  }

  static Future<void> unblockUser(String targetUserId) async {
    await ApiService.delete(
      '/users/$targetUserId/block',
      extraHeaders: _authHeaders,
    );
  }

  /// Mirrors web DM sidebar flow:
  /// - load available users (friend candidates)
  /// - load conversation list (unread + last message)
  /// - merge by userId
  static Future<List<DmConversation>> getDmSidebarThreads() async {
    final available = await getAvailableUsersAsConversations();
    final conversations = await getConversations();

    final byId = <String, DmConversation>{};

    for (final item in available) {
      byId[item.userId] = item;
    }

    for (final conv in conversations) {
      final existing = byId[conv.userId];
      if (existing == null) {
        byId[conv.userId] = conv;
        continue;
      }
      byId[conv.userId] = DmConversation(
        userId: conv.userId,
        displayName: conv.displayName.isNotEmpty
            ? conv.displayName
            : existing.displayName,
        username: conv.username.isNotEmpty ? conv.username : existing.username,
        lastMessage: conv.lastMessage,
        lastMessageAt: conv.lastMessageAt,
        unreadCount: conv.unreadCount,
        avatarUrl: conv.avatarUrl ?? existing.avatarUrl,
        isOnline: conv.isOnline || existing.isOnline,
      );
    }

    final merged = byId.values.toList();
    merged.sort((a, b) {
      final aHas = a.lastMessageAt != null;
      final bHas = b.lastMessageAt != null;
      if (aHas && bHas) {
        return b.lastMessageAt!.compareTo(a.lastMessageAt!);
      }
      if (aHas) return -1;
      if (bHas) return 1;
      return a.title.toLowerCase().compareTo(b.title.toLowerCase());
    });
    return merged;
  }

  static Future<List<DmConversation>> getFollowingAsConversations() async {
    final userId = _extractUserIdFromToken(AuthStorage.accessToken);
    if (userId == null || userId.isEmpty) return const <DmConversation>[];

    final res = await ApiService.get(
      '/users/$userId/following',
      extraHeaders: _authHeaders,
    );

    final list = (res['items'] is List)
        ? (res['items'] as List)
        : (res['data'] is List)
        ? (res['data'] as List)
        : const <dynamic>[];
    return list
        .whereType<Map>()
        .map((item) {
          final map = Map<String, dynamic>.from(item);
          return DmConversation(
            userId: (map['userId'] ?? map['_id'] ?? '').toString(),
            displayName: (map['displayName'] ?? '').toString(),
            username: (map['username'] ?? '').toString(),
            lastMessage: '',
            lastMessageAt: null,
            unreadCount: 0,
            avatarUrl: (map['avatarUrl'] ?? map['avatar'])?.toString(),
            isOnline: map['isOnline'] == true,
          );
        })
        .where((c) => c.userId.isNotEmpty)
        .toList();
  }

  /// Same shape as [getFollowingAsConversations] for `/users/:id/followers` (web invite popup).
  static Future<List<DmConversation>> getFollowersAsConversations() async {
    final userId = _extractUserIdFromToken(AuthStorage.accessToken);
    if (userId == null || userId.isEmpty) return const <DmConversation>[];

    final res = await ApiService.get(
      '/users/$userId/followers',
      extraHeaders: _authHeaders,
    );

    final list = (res['items'] is List)
        ? (res['items'] as List)
        : (res['data'] is List)
        ? (res['data'] as List)
        : const <dynamic>[];
    return list
        .whereType<Map>()
        .map((item) {
          final map = Map<String, dynamic>.from(item);
          return DmConversation(
            userId: (map['userId'] ?? map['_id'] ?? '').toString(),
            displayName: (map['displayName'] ?? '').toString(),
            username: (map['username'] ?? '').toString(),
            lastMessage: '',
            lastMessageAt: null,
            unreadCount: 0,
            avatarUrl: (map['avatarUrl'] ?? map['avatar'])?.toString(),
            isOnline: map['isOnline'] == true,
          );
        })
        .where((c) => c.userId.isNotEmpty)
        .toList();
  }

  static String? _extractUserIdFromToken(String? token) {
    if (token == null || token.isEmpty) return null;
    final parts = token.split('.');
    if (parts.length < 2) return null;
    try {
      final payload = utf8.decode(
        base64Url.decode(base64Url.normalize(parts[1])),
      );
      final json = jsonDecode(payload);
      if (json is! Map<String, dynamic>) return null;
      return (json['userId'] ?? json['sub'])?.toString();
    } catch (_) {
      return null;
    }
  }

  static Map<String, dynamic>? _pickMap(
    Map<String, dynamic> source,
    List<String> keys,
  ) {
    for (final key in keys) {
      final val = source[key];
      if (val is Map) return Map<String, dynamic>.from(val);
    }
    if (source['_id'] != null || source['id'] != null) {
      return source;
    }
    return null;
  }
}
