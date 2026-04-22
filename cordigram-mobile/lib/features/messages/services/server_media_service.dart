import '../../../core/services/api_service.dart';
import '../../../core/services/auth_storage.dart';

class ServerInvitePreview {
  const ServerInvitePreview({
    required this.id,
    required this.name,
    required this.memberCount,
    required this.onlineCount,
    required this.createdAt,
    this.avatarUrl,
    this.bannerUrl,
    this.bannerImageUrl,
    this.bannerColor,
  });

  final String id;
  final String name;
  final int memberCount;
  final int onlineCount;
  final DateTime createdAt;
  final String? avatarUrl;
  final String? bannerUrl;
  final String? bannerImageUrl;
  final String? bannerColor;
}

class ServerStickerItem {
  const ServerStickerItem({
    required this.id,
    required this.imageUrl,
    required this.name,
    required this.animated,
  });

  final String id;
  final String imageUrl;
  final String name;
  final bool animated;
}

class ServerEmojiItem {
  const ServerEmojiItem({
    required this.id,
    required this.imageUrl,
    required this.name,
    required this.animated,
  });

  final String id;
  final String imageUrl;
  final String name;
  final bool animated;
}

class ServerStickerGroup {
  const ServerStickerGroup({
    required this.serverId,
    required this.serverName,
    required this.locked,
    required this.stickers,
    this.serverAvatarUrl,
  });

  final String serverId;
  final String serverName;
  final String? serverAvatarUrl;
  final bool locked;
  final List<ServerStickerItem> stickers;
}

class ServerEmojiGroup {
  const ServerEmojiGroup({
    required this.serverId,
    required this.serverName,
    required this.locked,
    required this.emojis,
    this.serverAvatarUrl,
  });

  final String serverId;
  final String serverName;
  final String? serverAvatarUrl;
  final bool locked;
  final List<ServerEmojiItem> emojis;
}

class ServerMediaService {
  ServerMediaService._();

  static final Map<String, ServerInvitePreview?> _inviteCache = {};

  static Map<String, String> get _authHeaders => {
    'Authorization': 'Bearer ${AuthStorage.accessToken ?? ''}',
  };

  static Future<ServerInvitePreview?> getServerInvitePreview(
    String serverId,
  ) async {
    final id = serverId.trim();
    if (id.isEmpty) return null;
    if (_inviteCache.containsKey(id)) return _inviteCache[id];
    final res = await ApiService.get(
      '/servers/embed-preview?id=${Uri.encodeQueryComponent(id)}',
      extraHeaders: _authHeaders,
    );
    final raw = res['server'];
    if (raw is! Map) {
      _inviteCache[id] = null;
      return null;
    }
    final map = Map<String, dynamic>.from(raw);
    final preview = ServerInvitePreview(
      id: id,
      name: (map['name'] ?? '').toString(),
      memberCount: (map['memberCount'] is num)
          ? (map['memberCount'] as num).toInt()
          : 0,
      onlineCount: (map['onlineCount'] is num)
          ? (map['onlineCount'] as num).toInt()
          : 0,
      createdAt:
          DateTime.tryParse(map['createdAt']?.toString() ?? '') ??
          DateTime.now(),
      avatarUrl: map['avatarUrl']?.toString(),
      bannerUrl: map['bannerUrl']?.toString(),
      bannerImageUrl: map['bannerImageUrl']?.toString(),
      bannerColor: map['bannerColor']?.toString(),
    );
    _inviteCache[id] = preview;
    return preview;
  }

  static Future<List<ServerStickerGroup>> getStickerPickerGroups({
    String? contextServerId,
  }) async {
    final qs = contextServerId == null || contextServerId.trim().isEmpty
        ? ''
        : '?contextServerId=${Uri.encodeQueryComponent(contextServerId.trim())}';
    final res = await ApiService.get(
      '/servers/sticker-picker$qs',
      extraHeaders: _authHeaders,
    );
    final raw = (res['groups'] as List?) ?? const <dynamic>[];
    return raw
        .whereType<Map>()
        .map((groupRaw) {
          final group = Map<String, dynamic>.from(groupRaw);
          final stickersRaw = (group['stickers'] as List?) ?? const <dynamic>[];
          final stickers = stickersRaw
              .whereType<Map>()
              .map((stRaw) {
                final st = Map<String, dynamic>.from(stRaw);
                return ServerStickerItem(
                  id: (st['id'] ?? '').toString(),
                  imageUrl: (st['imageUrl'] ?? '').toString(),
                  name: (st['name'] ?? '').toString(),
                  animated: st['animated'] == true,
                );
              })
              .where((x) => x.id.isNotEmpty && x.imageUrl.isNotEmpty)
              .toList();
          return ServerStickerGroup(
            serverId: (group['serverId'] ?? '').toString(),
            serverName: (group['serverName'] ?? '').toString(),
            serverAvatarUrl: group['serverAvatarUrl']?.toString(),
            locked: group['locked'] == true,
            stickers: stickers,
          );
        })
        .where((g) => g.serverId.isNotEmpty && g.stickers.isNotEmpty)
        .toList();
  }

  static Future<List<ServerEmojiGroup>> getEmojiPickerGroups({
    String? contextServerId,
  }) async {
    final qs = contextServerId == null || contextServerId.trim().isEmpty
        ? ''
        : '?contextServerId=${Uri.encodeQueryComponent(contextServerId.trim())}';
    final res = await ApiService.get(
      '/servers/emoji-picker$qs',
      extraHeaders: _authHeaders,
    );
    final raw = (res['groups'] as List?) ?? const <dynamic>[];
    return raw
        .whereType<Map>()
        .map((groupRaw) {
          final group = Map<String, dynamic>.from(groupRaw);
          final emojisRaw = (group['emojis'] as List?) ?? const <dynamic>[];
          final emojis = emojisRaw
              .whereType<Map>()
              .map((emRaw) {
                final em = Map<String, dynamic>.from(emRaw);
                return ServerEmojiItem(
                  id: (em['id'] ?? '').toString(),
                  imageUrl: (em['imageUrl'] ?? '').toString(),
                  name: (em['name'] ?? '').toString(),
                  animated: em['animated'] == true,
                );
              })
              .where((x) => x.id.isNotEmpty && x.imageUrl.isNotEmpty)
              .toList();
          return ServerEmojiGroup(
            serverId: (group['serverId'] ?? '').toString(),
            serverName: (group['serverName'] ?? '').toString(),
            serverAvatarUrl: group['serverAvatarUrl']?.toString(),
            locked: group['locked'] == true,
            emojis: emojis,
          );
        })
        .where((g) => g.serverId.isNotEmpty && g.emojis.isNotEmpty)
        .toList();
  }
}
