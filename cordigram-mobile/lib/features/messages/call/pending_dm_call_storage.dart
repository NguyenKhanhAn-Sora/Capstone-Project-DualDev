import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

/// Persists a DM call push payload when the user taps the notification before
/// tokens are ready (e.g. must log in). [HomeScreen] drains this once.
class PendingDmCallStorage {
  PendingDmCallStorage._();

  static const _key = 'pending_dm_call_push_v1';

  static Future<void> save(Map<String, dynamic> data) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key, jsonEncode(data));
  }

  static Future<Map<String, dynamic>?> take() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_key);
    if (raw == null || raw.isEmpty) return null;
    await prefs.remove(_key);
    try {
      final decoded = jsonDecode(raw);
      if (decoded is Map<String, dynamic>) return decoded;
      if (decoded is Map) return Map<String, dynamic>.from(decoded);
    } catch (_) {}
    return null;
  }
}
