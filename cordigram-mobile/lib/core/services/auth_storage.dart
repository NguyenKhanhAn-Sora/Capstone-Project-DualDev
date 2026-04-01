import 'dart:math';
import 'package:shared_preferences/shared_preferences.dart';

/// Mirrors what cordigram-web stores in localStorage + cookies:
///   - accessToken  → localStorage key "accessToken"
///   - refreshToken → HttpOnly cookie "refresh_token" (we extract from Set-Cookie
///                    and persist it ourselves so mobile can call /auth/refresh)
///   - deviceId     → localStorage key "cordigramDeviceId"  (sent as x-device-id)
class AuthStorage {
  static const _keyAccessToken = 'access_token';
  static const _keyRefreshToken = 'refresh_token';
  static const _keyDeviceId = 'cordigram_device_id';

  static String? _accessToken;
  static String? _refreshToken;
  static String? _deviceId;

  static String? get accessToken => _accessToken;
  static String? get refreshToken => _refreshToken;
  static String? get deviceId => _deviceId;

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
