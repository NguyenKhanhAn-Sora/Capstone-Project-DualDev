import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';
import '../../core/config/app_config.dart';
import '../../core/services/api_service.dart';
import '../../core/services/auth_storage.dart';

class UploadResult {
  const UploadResult({
    required this.url,
    required this.publicId,
    this.resourceType,
    this.format,
    this.width,
    this.height,
    this.bytes,
    this.duration,
    this.folder,
    this.moderationDecision,
    this.moderationProvider,
  });

  final String url;
  final String publicId;
  final String? resourceType;
  final String? format;
  final int? width;
  final int? height;
  final int? bytes;
  final double? duration;
  final String? folder;
  final String? moderationDecision;
  final String? moderationProvider;

  static UploadResult fromJson(Map<String, dynamic> json) {
    double? dur;
    final rawDur = json['duration'];
    if (rawDur is num) dur = rawDur.toDouble();
    if (rawDur is String) dur = double.tryParse(rawDur);

    return UploadResult(
      url: (json['secureUrl'] as String?) ?? (json['url'] as String?) ?? '',
      publicId: (json['publicId'] as String?) ?? '',
      resourceType: json['resourceType'] as String?,
      format: json['format'] as String?,
      width: json['width'] as int?,
      height: json['height'] as int?,
      bytes: json['bytes'] as int?,
      duration: dur,
      folder: json['folder'] as String?,
      moderationDecision: json['moderationDecision'] as String?,
      moderationProvider: json['moderationProvider'] as String?,
    );
  }
}

class CreatePostService {
  static final _client = http.Client();
  static const _uploadPaths = ['/posts/upload', '/posts/media/upload'];

  /// Upload a single media file to Cloudinary via the backend.
  static Future<UploadResult> uploadMedia(File file) async {
    final token = AuthStorage.accessToken;
    if (token == null) throw const ApiException('Not authenticated');

    final mimeType = _mimeFromPath(file.path);
    final attemptedPaths = <String>[];

    for (final path in _uploadPaths) {
      attemptedPaths.add(path);
      final uri = Uri.parse('${AppConfig.apiBaseUrl}$path');
      final request = http.MultipartRequest('POST', uri)
        ..headers['Authorization'] = 'Bearer $token';

      request.files.add(
        await http.MultipartFile.fromPath(
          'file',
          file.path,
          contentType: MediaType.parse(mimeType),
        ),
      );

      final streamed = await _client
          .send(request)
          .timeout(const Duration(seconds: 120));
      final response = await http.Response.fromStream(streamed);

      if (response.statusCode >= 200 && response.statusCode < 300) {
        final json = jsonDecode(response.body) as Map<String, dynamic>;
        return UploadResult.fromJson(json);
      }

      // Try legacy path only when current path is not found.
      if (response.statusCode == 404 && path != _uploadPaths.last) {
        continue;
      }

      final serverMessage = _extractServerError(response.body);
      if (serverMessage != null && serverMessage.isNotEmpty) {
        throw ApiException(serverMessage);
      }

      throw ApiException('Upload failed (${response.statusCode}) on $path');
    }

    throw ApiException(
      'Upload endpoint not found on ${AppConfig.apiBaseUrl}. Tried: ${attemptedPaths.join(', ')}',
    );
  }

  static String? _extractServerError(String body) {
    if (body.isEmpty) return null;
    try {
      final decoded = jsonDecode(body);
      if (decoded is Map<String, dynamic>) {
        final message = decoded['message'];
        if (message is String && message.isNotEmpty) return message;
        if (message is List && message.isNotEmpty) {
          return message.first.toString();
        }
      }
    } catch (_) {
      return null;
    }
    return null;
  }

  /// Create a reel with an already-uploaded video URL.
  static Future<void> createReel({
    required String caption,
    required String location,
    required String audience,
    required bool allowComments,
    required bool allowDownload,
    required bool hideLikeCount,
    required List<String> hashtags,
    required List<String> mentions,
    required Map<String, dynamic> media,
    double? durationSeconds,
    String? scheduledAt,
  }) async {
    final token = AuthStorage.accessToken;
    if (token == null) throw const ApiException('Not authenticated');

    final body = <String, dynamic>{
      if (caption.isNotEmpty) 'content': caption,
      if (location.isNotEmpty) 'location': location,
      'visibility': audience,
      'allowComments': allowComments,
      'allowDownload': allowDownload,
      'hideLikeCount': hideLikeCount,
      if (hashtags.isNotEmpty) 'hashtags': hashtags,
      if (mentions.isNotEmpty) 'mentions': mentions,
      'media': [media],
      if (durationSeconds != null) 'durationSeconds': durationSeconds,
      if (scheduledAt != null) 'scheduledAt': scheduledAt,
    };

    await ApiService.post(
      '/reels',
      body: body,
      extraHeaders: {'Authorization': 'Bearer $token'},
    );
  }

  /// Create a post with already-uploaded media URLs.
  static Future<void> createPost({
    required String caption,
    required String location,
    required String audience,
    required bool allowComments,
    required bool allowDownload,
    required bool hideLikeCount,
    required List<String> hashtags,
    required List<String> mentions,
    required List<Map<String, dynamic>> media,
    String? scheduledAt,
  }) async {
    final token = AuthStorage.accessToken;
    if (token == null) throw const ApiException('Not authenticated');

    final body = <String, dynamic>{
      if (caption.isNotEmpty) 'content': caption,
      if (location.isNotEmpty) 'location': location,
      'visibility': audience,
      'allowComments': allowComments,
      'allowDownload': allowDownload,
      'hideLikeCount': hideLikeCount,
      if (hashtags.isNotEmpty) 'hashtags': hashtags,
      if (mentions.isNotEmpty) 'mentions': mentions,
      if (media.isNotEmpty) 'media': media,
      if (scheduledAt != null) 'scheduledAt': scheduledAt,
    };

    await ApiService.post(
      '/posts',
      body: body,
      extraHeaders: {'Authorization': 'Bearer $token'},
    );
  }

  static String _mimeFromPath(String path) {
    final ext = path.split('.').last.toLowerCase();
    switch (ext) {
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'png':
        return 'image/png';
      case 'gif':
        return 'image/gif';
      case 'webp':
        return 'image/webp';
      case 'mp4':
        return 'video/mp4';
      case 'mov':
        return 'video/quicktime';
      case 'avi':
        return 'video/x-msvideo';
      case 'webm':
        return 'video/webm';
      default:
        return 'application/octet-stream';
    }
  }
}
