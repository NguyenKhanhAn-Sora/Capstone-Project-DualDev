import 'dart:convert';
import 'dart:typed_data';
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';
import '../../../core/config/app_config.dart';
import '../../../core/services/api_service.dart';
import '../../../core/services/auth_storage.dart';
import '../models/profile_detail.dart';

class ProfileService {
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
}
