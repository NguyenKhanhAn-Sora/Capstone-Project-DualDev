import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';
import '../config/app_config.dart';

class ApiException implements Exception {
  const ApiException(this.message, {this.retryAfterSec});
  final String message;
  final int? retryAfterSec;

  @override
  String toString() => message;
}

/// Result of an auth-tier POST that may include a refresh token via Set-Cookie.
class ApiAuthResult {
  const ApiAuthResult({required this.body, this.refreshToken});
  final Map<String, dynamic> body;

  /// Parsed from `Set-Cookie: refresh_token=<value>; ...`
  final String? refreshToken;
}

class ApiService {
  static final _client = http.Client();

  static Uri _uri(String path) => Uri.parse('${AppConfig.apiBaseUrl}$path');

  static Map<String, String> get _baseHeaders => {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  // ── POST with JSON body, returns decoded Map ──
  static Future<Map<String, dynamic>> post(
    String path, {
    Map<String, dynamic>? body,
    Map<String, String>? extraHeaders,
  }) async {
    final response = await _client
        .post(
          _uri(path),
          headers: {..._baseHeaders, ...?extraHeaders},
          body: body != null ? jsonEncode(body) : null,
        )
        .timeout(const Duration(seconds: 15));

    return _handleResponse(response);
  }

  /// Like [post] but also extracts the `refresh_token` from the Set-Cookie
  /// header — used for login and complete-profile endpoints.
  static Future<ApiAuthResult> postAuth(
    String path, {
    Map<String, dynamic>? body,
    Map<String, String>? extraHeaders,
  }) async {
    final response = await _client
        .post(
          _uri(path),
          headers: {..._baseHeaders, ...?extraHeaders},
          body: body != null ? jsonEncode(body) : null,
        )
        .timeout(const Duration(seconds: 15));

    final responseBody = _handleResponse(response);
    final refreshToken = _extractRefreshToken(response);
    return ApiAuthResult(body: responseBody, refreshToken: refreshToken);
  }

  // ── PATCH with JSON body, returns decoded Map ──
  static Future<Map<String, dynamic>> patch(
    String path, {
    Map<String, dynamic>? body,
    Map<String, String>? extraHeaders,
  }) async {
    final response = await _client
        .patch(
          _uri(path),
          headers: {..._baseHeaders, ...?extraHeaders},
          body: body != null ? jsonEncode(body) : null,
        )
        .timeout(const Duration(seconds: 15));

    return _handleResponse(response);
  }

  // ── DELETE, returns decoded Map ──
  static Future<Map<String, dynamic>> delete(
    String path, {
    Map<String, String>? extraHeaders,
  }) async {
    final response = await _client
        .delete(_uri(path), headers: {..._baseHeaders, ...?extraHeaders})
        .timeout(const Duration(seconds: 15));

    return _handleResponse(response);
  }

  // ── POST multipart/form-data, returns decoded Map ──
  static Future<Map<String, dynamic>> postMultipart(
    String path, {
    required String fieldName,
    required String filePath,
    required String contentType,
    Map<String, String>? extraHeaders,
  }) async {
    final uri = _uri(path);
    final request = http.MultipartRequest('POST', uri);
    if (extraHeaders != null) request.headers.addAll(extraHeaders);
    request.files.add(
      await http.MultipartFile.fromPath(
        fieldName,
        filePath,
        contentType: MediaType.parse(contentType),
      ),
    );
    final streamed = await _client
        .send(request)
        .timeout(const Duration(seconds: 60));
    final response = await http.Response.fromStream(streamed);
    return _handleResponse(response);
  }

  // ── GET, returns decoded Map ──
  static Future<Map<String, dynamic>> get(
    String path, {
    Map<String, String>? extraHeaders,
  }) async {
    final response = await _client
        .get(_uri(path), headers: {..._baseHeaders, ...?extraHeaders})
        .timeout(const Duration(seconds: 15));

    return _handleResponse(response);
  }

  // ── GET, returns decoded List (for array responses) ──
  static Future<List<dynamic>> getList(
    String path, {
    Map<String, String>? extraHeaders,
  }) async {
    final response = await _client
        .get(_uri(path), headers: {..._baseHeaders, ...?extraHeaders})
        .timeout(const Duration(seconds: 15));

    if (response.statusCode >= 200 && response.statusCode < 300) {
      if (response.body.isEmpty) return [];
      return jsonDecode(response.body) as List<dynamic>;
    }

    String message = 'Something went wrong';
    int? retryAfterSec;
    try {
      final json = jsonDecode(response.body) as Map<String, dynamic>;
      final msg = json['message'];
      if (msg is String) {
        message = msg;
      } else if (msg is List && msg.isNotEmpty) {
        message = msg.first.toString();
      }
      retryAfterSec = json['retryAfterSec'] as int?;
    } catch (_) {}
    throw ApiException(message, retryAfterSec: retryAfterSec);
  }

  static Map<String, dynamic> _handleResponse(http.Response response) {
    if (response.statusCode >= 200 && response.statusCode < 300) {
      if (response.body.isEmpty) return {};
      return jsonDecode(response.body) as Map<String, dynamic>;
    }

    // Parse error body
    String message = 'Something went wrong';
    int? retryAfterSec;
    try {
      final json = jsonDecode(response.body) as Map<String, dynamic>;
      // NestJS default error shape: { statusCode, message, error, retryAfterSec? }
      final msg = json['message'];
      if (msg is String) {
        message = msg;
      } else if (msg is List && msg.isNotEmpty) {
        message = msg.first.toString();
      }
      retryAfterSec = json['retryAfterSec'] as int?;
    } catch (_) {}

    throw ApiException(message, retryAfterSec: retryAfterSec);
  }

  /// Extracts the `refresh_token` cookie value from the Set-Cookie header.
  /// dart:io folds multiple Set-Cookie headers into one comma-separated string.
  /// JWT values never contain commas, so this regex is safe.
  static String? _extractRefreshToken(http.Response response) {
    final setCookie = response.headers['set-cookie'] ?? '';
    if (setCookie.isEmpty) return null;
    final match = RegExp(
      r'(?:^|,\s*)refresh_token=([^;,\s]+)',
    ).firstMatch(setCookie);
    return match?.group(1);
  }
}
