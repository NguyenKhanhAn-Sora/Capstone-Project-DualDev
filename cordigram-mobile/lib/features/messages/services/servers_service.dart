import '../../../core/services/api_service.dart';
import '../../../core/services/auth_storage.dart';
import '../models/server_models.dart';

class ServersService {
  ServersService._();

  static Map<String, String> get _authHeaders => {
    'Authorization': 'Bearer ${AuthStorage.accessToken ?? ''}',
  };

  static Future<List<ServerSummary>> getMyServers() async {
    final list = await _getListResponse(
      '/servers',
      preferredKeys: const ['servers', 'items', 'data'],
    );
    return list
        .whereType<Map>()
        .map((e) => ServerSummary.fromJson(Map<String, dynamic>.from(e)))
        .where((e) => e.id.isNotEmpty && e.name.isNotEmpty)
        .toList();
  }

  static Future<ServerSummary?> createServer({
    required String name,
    String? description,
    String? avatarUrl,
    String template = 'custom',
    String purpose = 'me-and-friends',
    String language = 'vi',
  }) async {
    final res = await ApiService.post(
      '/servers',
      extraHeaders: _authHeaders,
      body: {
        'name': name,
        if ((description ?? '').trim().isNotEmpty)
          'description': description!.trim(),
        if ((avatarUrl ?? '').trim().isNotEmpty) 'avatarUrl': avatarUrl!.trim(),
        'template': template,
        'purpose': purpose,
        'language': language,
      },
    );
    final raw = res['server'] ?? res['data'] ?? res;
    if (raw is! Map) return null;
    final server = ServerSummary.fromJson(Map<String, dynamic>.from(raw));
    if (server.id.isEmpty) return null;
    return server;
  }

  static Future<List<ServerChannel>> getServerChannels(String serverId) async {
    final list = await _getListResponse(
      '/servers/$serverId/channels',
      preferredKeys: const ['channels', 'items', 'data'],
    );
    final channels = list
        .whereType<Map>()
        .map((e) => ServerChannel.fromJson(Map<String, dynamic>.from(e)))
        .where((e) => e.id.isNotEmpty && e.name.isNotEmpty)
        .toList();
    channels.sort((a, b) => a.position.compareTo(b.position));
    return channels;
  }

  static Future<List<ServerCategory>> getServerCategories(String serverId) async {
    final list = await _getListResponse(
      '/servers/$serverId/channels/categories/list',
      preferredKeys: const ['categories', 'items', 'data'],
    );
    final categories = list
        .whereType<Map>()
        .map((e) => ServerCategory.fromJson(Map<String, dynamic>.from(e)))
        .where((e) => e.id.isNotEmpty && e.name.isNotEmpty)
        .toList();
    categories.sort((a, b) => a.position.compareTo(b.position));
    return categories;
  }

  static Future<List<dynamic>> _getListResponse(
    String path, {
    required List<String> preferredKeys,
  }) async {
    try {
      final res = await ApiService.get(path, extraHeaders: _authHeaders);
      for (final key in preferredKeys) {
        final candidate = res[key];
        if (candidate is List) return candidate;
      }
      return const <dynamic>[];
    } on TypeError {
      // Some backend endpoints return array JSON as root.
      return ApiService.getList(path, extraHeaders: _authHeaders);
    }
  }
}
