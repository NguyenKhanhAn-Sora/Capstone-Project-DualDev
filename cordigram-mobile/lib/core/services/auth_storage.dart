import 'dart:convert';
import 'dart:math';
import 'package:shared_preferences/shared_preferences.dart';

class RecentAccountEntry {
  const RecentAccountEntry({
    required this.email,
    this.username,
    this.displayName,
    this.avatarUrl,
    required this.lastUsed,
  });

  final String email;
  final String? username;
  final String? displayName;
  final String? avatarUrl;
  final int lastUsed;

  String get label {
    final value = (displayName ?? username ?? email).trim();
    return value.isEmpty ? email : value;
  }

  Map<String, dynamic> toJson() => {
    'email': email,
    if (username != null) 'username': username,
    if (displayName != null) 'displayName': displayName,
    if (avatarUrl != null) 'avatarUrl': avatarUrl,
    'lastUsed': lastUsed,
  };

  static RecentAccountEntry? fromJson(dynamic source) {
    if (source is! Map) return null;
    final map = source.cast<String, dynamic>();
    final email = (map['email'] as String? ?? '').trim().toLowerCase();
    if (email.isEmpty) return null;
    final lastUsedRaw = map['lastUsed'];
    final parsedLastUsed = lastUsedRaw is int
        ? lastUsedRaw
        : int.tryParse(lastUsedRaw?.toString() ?? '');
    return RecentAccountEntry(
      email: email,
      username: (map['username'] as String?)?.trim(),
      displayName: (map['displayName'] as String?)?.trim(),
      avatarUrl: (map['avatarUrl'] as String?)?.trim(),
      lastUsed: parsedLastUsed ?? DateTime.now().millisecondsSinceEpoch,
    );
  }
}

/// Mirrors what cordigram-web stores in localStorage + cookies:
///   - accessToken  → localStorage key "accessToken"
///   - refreshToken → HttpOnly cookie "refresh_token" (we extract from Set-Cookie
///                    and persist it ourselves so mobile can call /auth/refresh)
///   - deviceId     → localStorage key "cordigramDeviceId"  (sent as x-device-id)
class AuthStorage {
  static const _keyAccessToken = 'access_token';
  static const _keyRefreshToken = 'refresh_token';
  static const _keyDeviceId = 'cordigram_device_id';
  static const _keyRecentAccounts = 'recent_accounts';
  static const _maxRecentAccounts = 6;

  static String? _accessToken;
  static String? _refreshToken;
  static String? _deviceId;

  static String? get accessToken => _accessToken;
  static String? get refreshToken => _refreshToken;
  static String? get deviceId => _deviceId;

  /// Returns true when the current access token is expired.
  ///
  /// This is intentionally used on app startup so users are not forced out
  /// mid-session the moment the token expires.
  static bool hasExpiredAccessToken({
    Duration clockSkew = const Duration(seconds: 30),
  }) {
    final token = _accessToken;
    if (token == null || token.isEmpty) return false;

    final exp = _extractJwtExp(token);
    if (exp == null) return false;

    final now = DateTime.now().toUtc().millisecondsSinceEpoch;
    final expMs = exp * 1000;
    return now >= (expMs - clockSkew.inMilliseconds);
  }

  /// Load all persisted values at app startup. Also generates deviceId if missing.
  static Future<void> loadAll() async {
    final prefs = await SharedPreferences.getInstance();
    _accessToken = prefs.getString(_keyAccessToken);
    _refreshToken = prefs.getString(_keyRefreshToken);
    final stored = prefs.getString(_keyDeviceId);
    if (stored != null) {
      _deviceId = stored;
    } else {
      _deviceId = _generateUuid();
      await prefs.setString(_keyDeviceId, _deviceId!);
    }
  }

  /// Persist both tokens after login or signup completion.
  static Future<void> saveTokens({
    required String accessToken,
    String? refreshToken,
  }) async {
    _accessToken = accessToken;
    if (refreshToken != null) _refreshToken = refreshToken;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_keyAccessToken, accessToken);
    if (refreshToken != null) {
      await prefs.setString(_keyRefreshToken, refreshToken);
    }
  }

  /// Update only the access token (e.g. after a silent token refresh).
  static Future<void> saveAccessToken(String token) async {
    _accessToken = token;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_keyAccessToken, token);
  }

  // Keep for backward compatibility (called from signup_screen before this refactor)
  static Future<void> saveToken(String token) => saveAccessToken(token);

  /// Clear session on logout (keeps deviceId — same device across sessions).
  static Future<void> clear() async {
    _accessToken = null;
    _refreshToken = null;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_keyAccessToken);
    await prefs.remove(_keyRefreshToken);
  }

  static Future<List<RecentAccountEntry>> loadRecentAccounts() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_keyRecentAccounts);
    if (raw == null || raw.isEmpty) return const [];

    try {
      final decoded = jsonDecode(raw);
      if (decoded is! List) return const [];
      final items =
          decoded
              .map(RecentAccountEntry.fromJson)
              .whereType<RecentAccountEntry>()
              .toList(growable: false)
            ..sort((a, b) => b.lastUsed.compareTo(a.lastUsed));
      return items;
    } catch (_) {
      return const [];
    }
  }

  static Future<List<RecentAccountEntry>> upsertRecentAccount({
    required String email,
    String? username,
    String? displayName,
    String? avatarUrl,
  }) async {
    final normalizedEmail = email.trim().toLowerCase();
    if (normalizedEmail.isEmpty) {
      return loadRecentAccounts();
    }

    final current = await loadRecentAccounts();
    final filtered = current
        .where((item) => item.email != normalizedEmail)
        .toList(growable: true);

    filtered.insert(
      0,
      RecentAccountEntry(
        email: normalizedEmail,
        username: username,
        displayName: displayName,
        avatarUrl: avatarUrl,
        lastUsed: DateTime.now().millisecondsSinceEpoch,
      ),
    );

    final next = filtered.take(_maxRecentAccounts).toList(growable: false);
    await _saveRecentAccounts(next);
    return next;
  }

  static Future<List<RecentAccountEntry>> removeRecentAccount(
    String email,
  ) async {
    final normalizedEmail = email.trim().toLowerCase();
    final current = await loadRecentAccounts();
    final next = current
        .where((item) => item.email != normalizedEmail)
        .toList(growable: false);
    await _saveRecentAccounts(next);
    return next;
  }

  static Future<void> clearRecentAccounts() async {
    await _saveRecentAccounts(const []);
  }

  static Future<List<RecentAccountEntry>> replaceRecentAccounts(
    List<RecentAccountEntry> items,
  ) async {
    final next = [...items]..sort((a, b) => b.lastUsed.compareTo(a.lastUsed));
    final limited = next.take(_maxRecentAccounts).toList(growable: false);
    await _saveRecentAccounts(limited);
    return limited;
  }

  static Future<void> _saveRecentAccounts(
    List<RecentAccountEntry> items,
  ) async {
    final prefs = await SharedPreferences.getInstance();
    final encoded = jsonEncode(items.map((item) => item.toJson()).toList());
    await prefs.setString(_keyRecentAccounts, encoded);
  }

  static int? _extractJwtExp(String token) {
    try {
      final parts = token.split('.');
      if (parts.length != 3) return null;
      final normalized = base64Url.normalize(parts[1]);
      final payload = utf8.decode(base64Url.decode(normalized));
      final map = jsonDecode(payload);
      if (map is! Map) return null;
      final exp = map['exp'];
      if (exp is int) return exp;
      if (exp is num) return exp.toInt();
      return int.tryParse(exp?.toString() ?? '');
    } catch (_) {
      return null;
    }
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  static String _generateUuid() {
    final rng = Random.secure();
    final b = List<int>.generate(16, (_) => rng.nextInt(256));
    b[6] = (b[6] & 0x0f) | 0x40; // version 4
    b[8] = (b[8] & 0x3f) | 0x80; // variant
    final h = b.map((v) => v.toRadixString(16).padLeft(2, '0')).join();
    return '${h.substring(0, 8)}-${h.substring(8, 12)}-'
        '${h.substring(12, 16)}-${h.substring(16, 20)}-${h.substring(20)}';
  }
}
