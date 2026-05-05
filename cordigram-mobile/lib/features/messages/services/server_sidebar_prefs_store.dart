import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

/// Same storage key as web `sidebar-prefs.ts` for cross-device compatibility.
class ServerSidebarPrefsStore {
  ServerSidebarPrefsStore._();

  static const _storageKey = 'cordigram_sidebar_prefs_v1';

  static Future<Map<String, dynamic>> _loadRoot() async {
    final p = await SharedPreferences.getInstance();
    final raw = p.getString(_storageKey);
    if (raw == null || raw.isEmpty) {
      return <String, dynamic>{'byUser': <String, dynamic>{}};
    }
    try {
      final decoded = jsonDecode(raw);
      if (decoded is Map<String, dynamic>) return decoded;
      if (decoded is Map) {
        return Map<String, dynamic>.from(decoded);
      }
    } catch (_) {}
    return <String, dynamic>{'byUser': <String, dynamic>{}};
  }

  static Future<void> _saveRoot(Map<String, dynamic> root) async {
    final p = await SharedPreferences.getInstance();
    await p.setString(_storageKey, jsonEncode(root));
  }

  static Map<String, dynamic> _emptyServer() => <String, dynamic>{
        'channels': <String, dynamic>{},
        'categories': <String, dynamic>{},
      };

  static Future<Map<String, dynamic>> getServerPrefs(
    String userId,
    String serverId,
  ) async {
    final root = await _loadRoot();
    final byUser = root['byUser'];
    if (byUser is! Map) return _emptyServer();
    final userMap = Map<String, dynamic>.from(byUser);
    final servers = userMap[userId];
    if (servers is! Map) return _emptyServer();
    final s = servers[serverId];
    if (s is! Map) return _emptyServer();
    return Map<String, dynamic>.from(s);
  }

  static Future<void> _updateServerPrefs(
    String userId,
    String serverId,
    Map<String, dynamic> Function(Map<String, dynamic> prev) updater,
  ) async {
    final root = await _loadRoot();
    final byUser = Map<String, dynamic>.from(
      (root['byUser'] is Map) ? root['byUser'] as Map : <String, dynamic>{},
    );
    final servers = Map<String, dynamic>.from(
      (byUser[userId] is Map) ? byUser[userId] as Map : <String, dynamic>{},
    );
    final prev = await getServerPrefs(userId, serverId);
    servers[serverId] = updater(prev);
    byUser[userId] = servers;
    root['byUser'] = byUser;
    await _saveRoot(root);
  }

  static Future<void> setServerNotify(
    String userId,
    String serverId,
    String level, // all | mentions | none
  ) async {
    await _updateServerPrefs(userId, serverId, (s) {
      s['serverNotify'] = level;
      return s;
    });
  }

  static Future<void> setServerSuppressFlags(
    String userId,
    String serverId, {
    bool? suppressEveryoneHere,
    bool? suppressRoleMentions,
  }) async {
    await _updateServerPrefs(userId, serverId, (s) {
      if (suppressEveryoneHere != null) {
        s['suppressEveryoneHere'] = suppressEveryoneHere;
      }
      if (suppressRoleMentions != null) {
        s['suppressRoleMentions'] = suppressRoleMentions;
      }
      return s;
    });
  }

  static Future<void> setServerHideMutedChannels(
    String userId,
    String serverId,
    bool hide,
  ) async {
    await _updateServerPrefs(userId, serverId, (s) {
      s['hideMutedChannels'] = hide;
      return s;
    });
  }

  static Future<bool> hideMutedChannels(String userId, String serverId) async {
    final s = await getServerPrefs(userId, serverId);
    return s['hideMutedChannels'] == true;
  }

  static Future<String?> serverNotify(String userId, String serverId) async {
    final s = await getServerPrefs(userId, serverId);
    return s['serverNotify']?.toString();
  }

  static Future<void> setServerMute(
    String userId,
    String serverId,
    String? mutedUntilIso,
    bool mutedForever,
  ) async {
    await _updateServerPrefs(userId, serverId, (s) {
      s['serverMutedUntil'] = mutedUntilIso;
      s['serverMutedForever'] = mutedForever;
      return s;
    });
  }

  static Future<void> clearServerMute(String userId, String serverId) async {
    await setServerMute(userId, serverId, null, false);
  }

  static Future<void> setChannelMute(
    String userId,
    String serverId,
    String channelId,
    String? mutedUntilIso,
    bool mutedForever,
  ) async {
    await _updateServerPrefs(userId, serverId, (s) {
      final ch = Map<String, dynamic>.from(
        (s['channels'] is Map) ? s['channels'] as Map : <String, dynamic>{},
      );
      final prev = Map<String, dynamic>.from(
        (ch[channelId] is Map) ? ch[channelId] as Map : <String, dynamic>{},
      );
      prev['mutedUntil'] = mutedUntilIso;
      prev['mutedForever'] = mutedForever;
      ch[channelId] = prev;
      s['channels'] = ch;
      return s;
    });
  }

  static Future<void> clearChannelMute(
    String userId,
    String serverId,
    String channelId,
  ) async {
    await setChannelMute(userId, serverId, channelId, null, false);
  }

  static Future<void> setChannelNotify(
    String userId,
    String serverId,
    String channelId,
    String mode, // inherit_category | all | mentions | none
  ) async {
    await _updateServerPrefs(userId, serverId, (s) {
      final ch = Map<String, dynamic>.from(
        (s['channels'] is Map) ? s['channels'] as Map : <String, dynamic>{},
      );
      final prev = Map<String, dynamic>.from(
        (ch[channelId] is Map) ? ch[channelId] as Map : <String, dynamic>{},
      );
      prev['notify'] = mode;
      ch[channelId] = prev;
      s['channels'] = ch;
      return s;
    });
  }

  static Map<String, dynamic>? _channelPref(
    Map<String, dynamic> serverPrefs,
    String channelId,
  ) {
    final ch = serverPrefs['channels'];
    if (ch is! Map) return null;
    final m = ch[channelId];
    if (m is! Map) return null;
    return Map<String, dynamic>.from(m);
  }

  static Map<String, dynamic>? _categoryPref(
    Map<String, dynamic> serverPrefs,
    String? categoryId,
  ) {
    if (categoryId == null || categoryId.isEmpty) return null;
    final cat = serverPrefs['categories'];
    if (cat is! Map) return null;
    final m = cat[categoryId];
    if (m is! Map) return null;
    return Map<String, dynamic>.from(m);
  }

  static bool _isMutedMap(Map<String, dynamic>? pref) {
    if (pref == null) return false;
    if (pref['mutedForever'] == true) return true;
    final u = pref['mutedUntil']?.toString();
    if (u == null || u.isEmpty) return false;
    final t = DateTime.tryParse(u);
    if (t == null) return false;
    return t.isAfter(DateTime.now());
  }

  static Future<bool> isChannelOrCategoryMuted(
    String userId,
    String serverId,
    String channelId,
    String? categoryId,
  ) async {
    final s = await getServerPrefs(userId, serverId);
    if (_isMutedMap(_channelPref(s, channelId))) return true;
    if (_isMutedMap(_categoryPref(s, categoryId))) return true;
    return false;
  }

  static Future<bool> isServerMuted(String userId, String serverId) async {
    final s = await getServerPrefs(userId, serverId);
    if (s['serverMutedForever'] == true) return true;
    final u = s['serverMutedUntil']?.toString();
    if (u == null || u.isEmpty) return false;
    final t = DateTime.tryParse(u);
    if (t == null) return false;
    return t.isAfter(DateTime.now());
  }

  static Future<bool> isChannelMuted(
    String userId,
    String serverId,
    String channelId,
  ) async {
    final s = await getServerPrefs(userId, serverId);
    return _isMutedMap(_channelPref(s, channelId));
  }

  /// Effective notify: channel → category → server (same order as web).
  static Future<String> effectiveNotifyLevel(
    String userId,
    String serverId,
    String channelId,
    String? categoryId,
  ) async {
    final s = await getServerPrefs(userId, serverId);
    final ch = _channelPref(s, channelId);
    final cn = ch?['notify']?.toString();
    if (cn != null &&
        cn.isNotEmpty &&
        cn != 'inherit_category') {
      return cn;
    }
    final cat = _categoryPref(s, categoryId);
    final catn = cat?['notify']?.toString();
    if (catn != null &&
        catn.isNotEmpty &&
        catn != 'inherit_server') {
      return catn;
    }
    final sn = s['serverNotify']?.toString();
    if (sn == 'mentions') return 'mentions';
    if (sn == 'none') return 'none';
    return 'all';
  }

  static String notifyLabelForLevel(String level) {
    switch (level) {
      case 'mentions':
        return 'Chỉ @mentions';
      case 'none':
        return 'Không có';
      default:
        return 'Tất cả tin nhắn';
    }
  }

  static ({String? mutedUntil, bool mutedForever}) muteKeyToUntil(String key) {
    if (key == 'until') {
      return (mutedUntil: null, mutedForever: true);
    }
    final minutes = switch (key) {
      '15m' => 15,
      '1h' => 60,
      '3h' => 180,
      '8h' => 480,
      '24h' => 1440,
      _ => 15,
    };
    final until = DateTime.now().add(Duration(minutes: minutes));
    return (mutedUntil: until.toIso8601String(), mutedForever: false);
  }
}
