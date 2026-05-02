import 'api_service.dart';
import 'auth_storage.dart';

/// Keeps the persisted session usable across cold starts: refreshes an expired
/// access token using the stored refresh cookie value — without wiping the
/// session just because the JWT clock ran out (explicit logout still clears).
class SessionBootstrap {
  SessionBootstrap._();

  /// Call after [AuthStorage.loadAll]. Best-effort only; ignores failures.
  static Future<void> tryRefreshExpiredAccessToken() async {
    if (!AuthStorage.hasExpiredAccessToken()) return;
    final refresh = AuthStorage.refreshToken;
    if (refresh == null || refresh.isEmpty) return;
    try {
      final refreshed = await ApiService.postAuth(
        '/auth/refresh',
        extraHeaders: {'Cookie': 'refresh_token=$refresh'},
      );
      final token = refreshed.body['accessToken'] as String?;
      if (token == null || token.isEmpty) return;
      await AuthStorage.saveTokens(
        accessToken: token,
        refreshToken: refreshed.refreshToken ?? refresh,
      );
    } catch (_) {
      // Leave stored tokens; user can retry login or next launch may succeed.
    }
  }
}
