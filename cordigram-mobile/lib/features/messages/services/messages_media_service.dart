import '../../../core/services/api_service.dart';
import '../../../core/services/auth_storage.dart';

/// Mirrors web `uploadMedia` — `POST /posts/upload` with
/// `x-cordigram-upload-context: messages` (see `cordigram-web/lib/cordigram-upload-context.ts`).
class MessagesMediaService {
  MessagesMediaService._();
  static bool _boostStatusLoaded = false;
  static bool _boostActive = false;

  static const _messagesUploadHeader = {
    'x-cordigram-upload-context': 'messages',
  };

  static Map<String, String> get _authHeaders => {
    'Authorization': 'Bearer ${AuthStorage.accessToken ?? ''}',
  };

  static String pickDisplayUrl(Map<String, dynamic> json) {
    final secure = json['secureUrl']?.toString();
    if (secure != null && secure.isNotEmpty) return secure;
    final url = json['url']?.toString();
    if (url != null && url.isNotEmpty) return url;
    return '';
  }

  /// ImagePicker đôi khi trả `application/octet-stream` cho ảnh/video thật.
  /// Chuẩn hóa MIME theo extension để backend không reject sai loại file.
  static String resolveUploadContentType({
    required String filePath,
    String? hintedContentType,
  }) {
    final hinted = (hintedContentType ?? '').trim().toLowerCase();
    if (hinted.startsWith('image/') ||
        hinted.startsWith('video/') ||
        hinted.startsWith('audio/')) {
      return hinted;
    }

    final lower = filePath.toLowerCase();
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.gif')) return 'image/gif';
    if (lower.endsWith('.heic')) return 'image/heic';
    if (lower.endsWith('.heif')) return 'image/heif';
    if (lower.endsWith('.mp4')) return 'video/mp4';
    if (lower.endsWith('.mov')) return 'video/quicktime';
    if (lower.endsWith('.m4v')) return 'video/x-m4v';
    if (lower.endsWith('.webm')) return 'video/webm';
    if (lower.endsWith('.mp3')) return 'audio/mpeg';
    if (lower.endsWith('.m4a')) return 'audio/mp4';
    if (lower.endsWith('.aac')) return 'audio/aac';
    if (lower.endsWith('.wav')) return 'audio/wav';
    if (lower.endsWith('.ogg')) return 'audio/ogg';

    return 'application/octet-stream';
  }

  static Future<Map<String, dynamic>> uploadFile({
    required String filePath,
    required String contentType,
  }) async {
    return ApiService.postMultipart(
      '/posts/upload',
      fieldName: 'file',
      filePath: filePath,
      contentType: contentType,
      extraHeaders: {..._authHeaders, ..._messagesUploadHeader},
    );
  }

  static bool get isBoostMediaOptimizationEnabled => _boostActive;

  static Future<void> refreshBoostStatus() async {
    if (_boostStatusLoaded) return;
    _boostStatusLoaded = true;
    try {
      final json = await ApiService.get(
        '/users/boost-status',
        extraHeaders: _authHeaders,
      );
      final active = json['active'] == true;
      final accountBoost = json['accountBoost'] == true;
      final unlocked = json['unlocked'] == true;
      final tier = (json['tier'] ?? '').toString().trim().toLowerCase();
      _boostActive =
          active || accountBoost || unlocked || tier == 'basic' || tier == 'boost';
    } catch (_) {
      _boostActive = false;
    }
  }

  static String optimizeHeavyVideoUrl(String rawUrl) {
    final url = rawUrl.trim();
    if (!_boostActive || url.isEmpty) return url;
    if (!url.contains('/res.cloudinary.com/')) return url;
    if (url.contains('/upload/q_auto:eco,f_auto,vc_auto,w_960/')) return url;
    if (url.contains('/upload/')) {
      return url.replaceFirst(
        '/upload/',
        '/upload/q_auto:eco,f_auto,vc_auto,w_960/',
      );
    }
    return url;
  }

  /// Max size aligned with web UX (25MB).
  static int get maxUploadBytes => 25 * 1024 * 1024;
}
