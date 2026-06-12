import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

/// Lưu trạng thái tắt thông báo DM theo user (local, giống web sidebar prefs).
class DmMutePrefsStore {
  DmMutePrefsStore._();

  static const _storageKey = 'cordigram_dm_mute_prefs_v1';

  static Future<Map<String, dynamic>> _loadRoot() async {
    final p = await SharedPreferences.getInstance();
    final raw = p.getString(_storageKey);
    if (raw == null || raw.isEmpty) {
      return <String, dynamic>{'byUser': <String, dynamic>{}};
    }
    try {
      final decoded = jsonDecode(raw);
      if (decoded is Map<String, dynamic>) return decoded;
      if (decoded is Map) return Map<String, dynamic>.from(decoded);
    } catch (_) {}
    return <String, dynamic>{'byUser': <String, dynamic>{}};
  }

  static Future<void> _saveRoot(Map<String, dynamic> root) async {
    final p = await SharedPreferences.getInstance();
    await p.setString(_storageKey, jsonEncode(root));
  }

  static Map<String, dynamic> _peersForUser(
    Map<String, dynamic> root,
    String userId,
  ) {
    final byUser = root['byUser'];
    if (byUser is! Map) return <String, dynamic>{};
    final userMap = Map<String, dynamic>.from(byUser);
    final peers = userMap[userId];
    if (peers is! Map) return <String, dynamic>{};
    return Map<String, dynamic>.from(peers);
  }

  static Future<
      ({
        Set<String> mutedForever,
        Map<String, DateTime?> mutedUntil,
      })> loadForUser(String userId) async {
    final forever = <String>{};
    final until = <String, DateTime?>{};
    if (userId.trim().isEmpty) {
      return (mutedForever: forever, mutedUntil: until);
    }

    final root = await _loadRoot();
    final peers = _peersForUser(root, userId);
    for (final entry in peers.entries) {
      final peerId = entry.key.trim();
      if (peerId.isEmpty) continue;
      final pref = entry.value;
      if (pref is! Map) continue;
      final m = Map<String, dynamic>.from(pref);
      if (m['mutedForever'] == true) {
        forever.add(peerId);
        continue;
      }
      final iso = m['mutedUntil']?.toString();
      if (iso == null || iso.isEmpty) continue;
      final t = DateTime.tryParse(iso);
      if (t != null && t.isAfter(DateTime.now())) {
        until[peerId] = t;
      }
    }
    return (mutedForever: forever, mutedUntil: until);
  }

  static Future<void> persistPeer({
    required String userId,
    required String peerUserId,
    String? mutedUntilIso,
    required bool mutedForever,
  }) async {
    if (userId.trim().isEmpty || peerUserId.trim().isEmpty) return;

    final root = await _loadRoot();
    final byUser = Map<String, dynamic>.from(
      (root['byUser'] is Map) ? root['byUser'] as Map : <String, dynamic>{},
    );
    final peers = Map<String, dynamic>.from(_peersForUser(root, userId));

    if (!mutedForever && (mutedUntilIso == null || mutedUntilIso.isEmpty)) {
      peers.remove(peerUserId);
    } else {
      peers[peerUserId] = <String, dynamic>{
        if (mutedForever) 'mutedForever': true,
        if (!mutedForever && mutedUntilIso != null) 'mutedUntil': mutedUntilIso,
      };
    }

    byUser[userId] = peers;
    root['byUser'] = byUser;
    await _saveRoot(root);
  }
}
