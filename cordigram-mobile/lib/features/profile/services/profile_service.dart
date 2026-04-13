import 'dart:convert';
import 'dart:typed_data';
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';
import '../../../core/config/app_config.dart';
import '../../../core/services/api_service.dart';
import '../../../core/services/auth_storage.dart';
import '../models/profile_detail.dart';

class ProfileService {
  static bool _isDeviceSessionRevoked(ApiException e) {
    return e.message.toLowerCase().contains('device session revoked');
  }

  /// Fetch profile detail by userId (MongoDB ObjectId string).
  static Future<ProfileDetail> fetchProfile(String userId) async {
    final token = AuthStorage.accessToken;
    if (token == null) throw const ApiException('Not authenticated');
    final data = await ApiService.get(
      '/profiles/${Uri.encodeComponent(userId)}',
      extraHeaders: {'Authorization': 'Bearer $token'},
    );
    return ProfileDetail.fromJson(data);
  }

  /// Fetch the current user's own profile via /profiles/me
  static Future<ProfileDetail> fetchMyProfile() async {
    final token = AuthStorage.accessToken;
    if (token == null) throw const ApiException('Not authenticated');
    final data = await ApiService.get(
      '/profiles/me',
      extraHeaders: {'Authorization': 'Bearer $token'},
    );
    // /profiles/me returns slightly different shape; normalise userId field
    final id = (data['userId'] as String?) ?? (data['id'] as String?) ?? '';
    if (!data.containsKey('userId')) data['userId'] = id;
    if (!data.containsKey('id')) data['id'] = id;
    return ProfileDetail.fromJson(data);
  }

  static Future<void> followUser(String userId) async {
    final token = AuthStorage.accessToken;
    if (token == null) throw const ApiException('Not authenticated');
    await ApiService.post(
      '/users/${Uri.encodeComponent(userId)}/follow',
      extraHeaders: {'Authorization': 'Bearer $token'},
    );
  }

  static Future<void> unfollowUser(String userId) async {
    final token = AuthStorage.accessToken;
    if (token == null) throw const ApiException('Not authenticated');
    await ApiService.delete(
      '/users/${Uri.encodeComponent(userId)}/follow',
      extraHeaders: {'Authorization': 'Bearer $token'},
    );
  }

  static Future<void> blockUser(String userId) async {
    final token = AuthStorage.accessToken;
    if (token == null) throw const ApiException('Not authenticated');
    await ApiService.post(
      '/users/${Uri.encodeComponent(userId)}/block',
      extraHeaders: {'Authorization': 'Bearer $token'},
    );
  }

  static Future<void> reportUser({
    required String userId,
    required String category,
    required String reason,
    String? note,
  }) async {
    final token = AuthStorage.accessToken;
    if (token == null) throw const ApiException('Not authenticated');
    await ApiService.post(
      '/report-users/${Uri.encodeComponent(userId)}',
      body: {
        'category': category,
        'reason': reason,
        if (note != null && note.trim().isNotEmpty) 'note': note.trim(),
      },
      extraHeaders: {'Authorization': 'Bearer $token'},
    );
  }

  /// Upload a new avatar (original + cropped bytes).
  static Future<Map<String, dynamic>> uploadAvatar({
    required Uint8List originalBytes,
    required String originalName,
    required Uint8List croppedBytes,
  }) async {
    final token = AuthStorage.accessToken;
    if (token == null) throw const ApiException('Not authenticated');
    final uri = Uri.parse('${AppConfig.apiBaseUrl}/profiles/avatar/upload');
    final request = http.MultipartRequest('POST', uri)
      ..headers['Authorization'] = 'Bearer $token'
      ..files.add(
        http.MultipartFile.fromBytes(
          'original',
          originalBytes,
          filename: originalName,
          contentType: MediaType('image', 'jpeg'),
        ),
      )
      ..files.add(
        http.MultipartFile.fromBytes(
          'cropped',
          croppedBytes,
          filename: 'avatar-cropped.jpg',
          contentType: MediaType('image', 'jpeg'),
        ),
      );
    final streamed = await request.send().timeout(const Duration(seconds: 60));
    final response = await http.Response.fromStream(streamed);
    if (response.statusCode >= 200 && response.statusCode < 300) {
      return jsonDecode(response.body) as Map<String, dynamic>;
    }
    throw ApiException('Avatar upload failed (${response.statusCode})');
  }

  /// Remove avatar – resets to default.
  static Future<Map<String, dynamic>> removeAvatar() async {
    final token = AuthStorage.accessToken;
    if (token == null) throw const ApiException('Not authenticated');
    return ApiService.delete(
      '/profiles/avatar',
      extraHeaders: {'Authorization': 'Bearer $token'},
    );
  }

  /// Update own profile (PATCH /profiles/me).
  static Future<ProfileDetail> updateProfile(
    Map<String, dynamic> payload,
  ) async {
    final token = AuthStorage.accessToken;
    if (token == null) throw const ApiException('Not authenticated');
    final data = await ApiService.patch(
      '/profiles/me',
      body: payload,
      extraHeaders: {'Authorization': 'Bearer $token'},
    );
    return ProfileDetail.fromJson(data);
  }

  /// Fetch paginated followers list for a user.
  static Future<Map<String, dynamic>> fetchFollowers(
    String userId, {
    int limit = 20,
    String? cursor,
  }) async {
    final token = AuthStorage.accessToken;
    if (token == null) throw const ApiException('Not authenticated');
    final qs = <String, String>{'limit': '$limit'};
    if (cursor != null) qs['cursor'] = cursor;
    final query = Uri(queryParameters: qs).query;
    return ApiService.get(
      '/users/${Uri.encodeComponent(userId)}/followers?$query',
      extraHeaders: {'Authorization': 'Bearer $token'},
    );
  }

  /// Fetch paginated following list for a user.
  static Future<Map<String, dynamic>> fetchFollowing(
    String userId, {
    int limit = 20,
    String? cursor,
  }) async {
    final token = AuthStorage.accessToken;
    if (token == null) throw const ApiException('Not authenticated');
    final qs = <String, String>{'limit': '$limit'};
    if (cursor != null) qs['cursor'] = cursor;
    final query = Uri(queryParameters: qs).query;
    return ApiService.get(
      '/users/${Uri.encodeComponent(userId)}/following?$query',
      extraHeaders: {'Authorization': 'Bearer $token'},
    );
  }

  /// Fetch posts authored by a user (profile Posts tab).
  /// Excludes reposts (items where repostOf is set).
  static Future<List<Map<String, dynamic>>> fetchUserPosts(
    String userId, {
    int limit = 30,
  }) async {
    final token = AuthStorage.accessToken;
    if (token == null) throw const ApiException('Not authenticated');
    final list = await ApiService.getList(
      '/posts/user/${Uri.encodeComponent(userId)}?limit=$limit',
      extraHeaders: {'Authorization': 'Bearer $token'},
    );
    return list.whereType<Map<String, dynamic>>().toList();
  }

  /// Fetch reels authored by a user (profile Reels tab).
  static Future<List<Map<String, dynamic>>> fetchUserReels(
    String userId, {
    int limit = 30,
  }) async {
    final token = AuthStorage.accessToken;
    if (token == null) throw const ApiException('Not authenticated');
    final list = await ApiService.getList(
      '/reels/user/${Uri.encodeComponent(userId)}?limit=$limit',
      extraHeaders: {'Authorization': 'Bearer $token'},
    );
    return list.whereType<Map<String, dynamic>>().toList();
  }

  /// Fetch saved items for the authenticated user (profile Saved tab).
  static Future<List<Map<String, dynamic>>> fetchSavedItems({
    int limit = 60,
  }) async {
    final token = AuthStorage.accessToken;
    if (token == null) throw const ApiException('Not authenticated');
    final list = await ApiService.getList(
      '/posts/saved?limit=$limit',
      extraHeaders: {'Authorization': 'Bearer $token'},
    );
    return list.whereType<Map<String, dynamic>>().toList();
  }

  /// Fetch a single post/reel detail by id.
  static Future<Map<String, dynamic>> fetchPostDetail(String postId) async {
    final token = AuthStorage.accessToken;
    if (token == null) throw const ApiException('Not authenticated');
    final data = await ApiService.get(
      '/posts/${Uri.encodeComponent(postId)}',
      extraHeaders: {'Authorization': 'Bearer $token'},
    );
    return data;
  }

  /// Check if a username is available.
  static Future<bool> checkUsername(
    String username, {
    String? excludeUserId,
  }) async {
    final token = AuthStorage.accessToken;
    if (token == null) throw const ApiException('Not authenticated');
    final qs = <String, String>{'username': username};
    if (excludeUserId != null) qs['excludeUserId'] = excludeUserId;
    final query = Uri(queryParameters: qs).query;
    final data = await ApiService.get(
      '/profiles/check-username?$query',
      extraHeaders: {'Authorization': 'Bearer $token'},
    );
    return data['available'] as bool? ?? false;
  }

  /// Step 1: verify password and request OTP to current email.
  static Future<Map<String, dynamic>> requestChangeEmailCurrentOtp({
    required String password,
  }) async {
    final token = AuthStorage.accessToken;
    if (token == null) throw const ApiException('Not authenticated');
    return ApiService.post(
      '/users/email-change/request-current-otp',
      body: {'password': password},
      extraHeaders: {'Authorization': 'Bearer $token'},
    );
  }

  /// Step 2: verify OTP sent to current email.
  static Future<Map<String, dynamic>> verifyChangeEmailCurrentOtp({
    required String code,
  }) async {
    final token = AuthStorage.accessToken;
    if (token == null) throw const ApiException('Not authenticated');
    return ApiService.post(
      '/users/email-change/verify-current-otp',
      body: {'code': code},
      extraHeaders: {'Authorization': 'Bearer $token'},
    );
  }

  /// Step 3: request OTP to new email.
  static Future<Map<String, dynamic>> requestChangeEmailNewOtp({
    required String newEmail,
  }) async {
    final token = AuthStorage.accessToken;
    if (token == null) throw const ApiException('Not authenticated');
    return ApiService.post(
      '/users/email-change/request-new-otp',
      body: {'newEmail': newEmail},
      extraHeaders: {'Authorization': 'Bearer $token'},
    );
  }

  /// Step 4: verify OTP from new email and complete email change.
  static Future<Map<String, dynamic>> verifyChangeEmailNewOtp({
    required String code,
  }) async {
    final token = AuthStorage.accessToken;
    if (token == null) throw const ApiException('Not authenticated');
    return ApiService.post(
      '/users/email-change/verify-new-otp',
      body: {'code': code},
      extraHeaders: {'Authorization': 'Bearer $token'},
    );
  }

  /// Fetch creator verification eligibility/status for current user.
  static Future<Map<String, dynamic>> fetchCreatorVerificationStatus() async {
    final token = AuthStorage.accessToken;
    if (token == null) throw const ApiException('Not authenticated');
    return ApiService.get(
      '/creator-verification/me',
      extraHeaders: {'Authorization': 'Bearer $token'},
    );
  }

  /// Submit creator verification request.
  static Future<Map<String, dynamic>> submitCreatorVerificationRequest({
    String? note,
  }) async {
    final token = AuthStorage.accessToken;
    if (token == null) throw const ApiException('Not authenticated');
    return ApiService.post(
      '/creator-verification/request',
      body: {'note': note},
      extraHeaders: {'Authorization': 'Bearer $token'},
    );
  }

  /// Request OTP for password change.
  static Future<Map<String, dynamic>> requestPasswordChangeOtp() async {
    final token = AuthStorage.accessToken;
    if (token == null) throw const ApiException('Not authenticated');
    return ApiService.post(
      '/users/password-change/request-otp',
      extraHeaders: {'Authorization': 'Bearer $token'},
    );
  }

  /// Verify password-change OTP.
  static Future<Map<String, dynamic>> verifyPasswordChangeOtp({
    required String code,
  }) async {
    final token = AuthStorage.accessToken;
    if (token == null) throw const ApiException('Not authenticated');
    return ApiService.post(
      '/users/password-change/verify-otp',
      body: {'code': code},
      extraHeaders: {'Authorization': 'Bearer $token'},
    );
  }

  /// Confirm password change after OTP verification.
  static Future<Map<String, dynamic>> confirmPasswordChange({
    required String currentPassword,
    required String newPassword,
  }) async {
    final token = AuthStorage.accessToken;
    if (token == null) throw const ApiException('Not authenticated');
    return ApiService.post(
      '/users/password-change/confirm',
      body: {'currentPassword': currentPassword, 'newPassword': newPassword},
      extraHeaders: {'Authorization': 'Bearer $token'},
    );
  }

  /// Fetch last password change timestamp.
  static Future<Map<String, dynamic>> fetchPasswordChangeStatus() async {
    final token = AuthStorage.accessToken;
    if (token == null) throw const ApiException('Not authenticated');
    return ApiService.get(
      '/users/password-change/status',
      extraHeaders: {'Authorization': 'Bearer $token'},
    );
  }

  /// Fetch passkey status.
  static Future<Map<String, dynamic>> fetchPasskeyStatus() async {
    final token = AuthStorage.accessToken;
    if (token == null) throw const ApiException('Not authenticated');
    return ApiService.get(
      '/users/passkey/status',
      extraHeaders: {'Authorization': 'Bearer $token'},
    );
  }

  /// Request OTP for two-factor enable/disable.
  static Future<Map<String, dynamic>> requestTwoFactorOtp({
    required bool enable,
  }) async {
    final token = AuthStorage.accessToken;
    if (token == null) throw const ApiException('Not authenticated');
    return ApiService.post(
      '/users/two-factor/request-otp',
      body: {'enable': enable},
      extraHeaders: {'Authorization': 'Bearer $token'},
    );
  }

  /// Verify two-factor OTP and apply enable/disable.
  static Future<Map<String, dynamic>> verifyTwoFactorOtp({
    required String code,
    required bool enable,
  }) async {
    final token = AuthStorage.accessToken;
    if (token == null) throw const ApiException('Not authenticated');
    return ApiService.post(
      '/users/two-factor/verify-otp',
      body: {'code': code, 'enable': enable},
      extraHeaders: {'Authorization': 'Bearer $token'},
    );
  }

  /// Fetch current two-factor status.
  static Future<Map<String, dynamic>> fetchTwoFactorStatus() async {
    final token = AuthStorage.accessToken;
    if (token == null) throw const ApiException('Not authenticated');
    return ApiService.get(
      '/users/two-factor/status',
      extraHeaders: {'Authorization': 'Bearer $token'},
    );
  }

  /// Fetch notification settings for the current user.
  static Future<Map<String, dynamic>> fetchNotificationSettings() async {
    final token = AuthStorage.accessToken;
    if (token == null) throw const ApiException('Not authenticated');
    return ApiService.get(
      '/users/notifications/settings',
      extraHeaders: {'Authorization': 'Bearer $token'},
    );
  }

  /// Update notification settings for global or category level.
  static Future<Map<String, dynamic>> updateNotificationSettings({
    String? category,
    bool? enabled,
    String? mutedUntil,
    bool? mutedIndefinitely,
  }) async {
    final token = AuthStorage.accessToken;
    if (token == null) throw const ApiException('Not authenticated');
    return ApiService.patch(
      '/users/notifications/settings',
      body: {
        if (category != null && category.isNotEmpty) 'category': category,
        if (enabled != null) 'enabled': enabled,
        if (mutedUntil != null) 'mutedUntil': mutedUntil,
        if (mutedIndefinitely != null) 'mutedIndefinitely': mutedIndefinitely,
      },
      extraHeaders: {'Authorization': 'Bearer $token'},
    );
  }

  /// Request passkey OTP (password confirmation step).
  static Future<Map<String, dynamic>> requestPasskeyOtp({
    required String password,
  }) async {
    final token = AuthStorage.accessToken;
    if (token == null) throw const ApiException('Not authenticated');
    return ApiService.post(
      '/users/passkey/request-otp',
      body: {'password': password},
      extraHeaders: {'Authorization': 'Bearer $token'},
    );
  }

  /// Verify passkey OTP.
  static Future<Map<String, dynamic>> verifyPasskeyOtp({
    required String code,
  }) async {
    final token = AuthStorage.accessToken;
    if (token == null) throw const ApiException('Not authenticated');
    return ApiService.post(
      '/users/passkey/verify-otp',
      body: {'code': code},
      extraHeaders: {'Authorization': 'Bearer $token'},
    );
  }

  /// Confirm passkey set/change.
  static Future<Map<String, dynamic>> confirmPasskey({
    String? currentPasskey,
    required String newPasskey,
  }) async {
    final token = AuthStorage.accessToken;
    if (token == null) throw const ApiException('Not authenticated');
    return ApiService.post(
      '/users/passkey/confirm',
      body: {'currentPasskey': currentPasskey, 'newPasskey': newPasskey},
      extraHeaders: {'Authorization': 'Bearer $token'},
    );
  }

  /// Enable/disable passkey verification.
  static Future<Map<String, dynamic>> togglePasskey({
    required bool enabled,
  }) async {
    final token = AuthStorage.accessToken;
    if (token == null) throw const ApiException('Not authenticated');
    return ApiService.post(
      '/users/passkey/toggle',
      body: {'enabled': enabled},
      extraHeaders: {'Authorization': 'Bearer $token'},
    );
  }

  /// Fetch login devices and current device hash.
  static Future<Map<String, dynamic>> fetchLoginDevices({
    String? deviceId,
  }) async {
    final token = AuthStorage.accessToken;
    if (token == null) throw const ApiException('Not authenticated');
    try {
      return await ApiService.get(
        '/users/login-devices',
        extraHeaders: {
          'Authorization': 'Bearer $token',
          if (deviceId != null && deviceId.isNotEmpty) 'x-device-id': deviceId,
        },
      );
    } on ApiException catch (e) {
      if (!_isDeviceSessionRevoked(e) || deviceId == null || deviceId.isEmpty) {
        rethrow;
      }
      // Fallback for stale device id: ask backend without x-device-id so
      // user can still inspect and clean up active sessions.
      return ApiService.get(
        '/users/login-devices',
        extraHeaders: {'Authorization': 'Bearer $token'},
      );
    }
  }

  /// Logout one device by deviceIdHash.
  static Future<Map<String, dynamic>> logoutLoginDevice({
    required String deviceIdHash,
  }) async {
    final token = AuthStorage.accessToken;
    if (token == null) throw const ApiException('Not authenticated');
    return ApiService.post(
      '/users/login-devices/logout',
      body: {'deviceIdHash': deviceIdHash},
      extraHeaders: {'Authorization': 'Bearer $token'},
    );
  }

  /// Logout all devices except current one.
  static Future<Map<String, dynamic>> logoutAllDevices({
    String? deviceId,
  }) async {
    final token = AuthStorage.accessToken;
    if (token == null) throw const ApiException('Not authenticated');
    try {
      return await ApiService.post(
        '/users/login-devices/logout-all',
        extraHeaders: {
          'Authorization': 'Bearer $token',
          if (deviceId != null && deviceId.isNotEmpty) 'x-device-id': deviceId,
        },
      );
    } on ApiException catch (e) {
      if (!_isDeviceSessionRevoked(e) || deviceId == null || deviceId.isEmpty) {
        rethrow;
      }
      return ApiService.post(
        '/users/login-devices/logout-all',
        extraHeaders: {'Authorization': 'Bearer $token'},
      );
    }
  }
}
