import '../../../core/services/api_service.dart';
import '../../../core/services/auth_storage.dart';
import 'messages_boost_service.dart';

/// Mirrors web `uploadMedia` — `POST /posts/upload` with
/// `x-cordigram-upload-context: messages` (see `cordigram-web/lib/cordigram-upload-context.ts`).
class MessagesMediaService {
  MessagesMediaService._();
  static bool _boostStatusLoaded = false;
  static bool _boostActive = false;
  static int _maxUploadBytes = 100 * 1024 * 1024;

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

  static Future<void> refreshBoostStatus({bool force = false}) async {
    if (_boostStatusLoaded && !force) return;
    _boostStatusLoaded = true;
    final status = await MessagesBoostService.fetchStatus();
    _boostActive = status.isUnlocked;
    if (status.maxUploadBytes != null && status.maxUploadBytes! > 0) {
      _maxUploadBytes = status.maxUploadBytes!;
    } else {
      _maxUploadBytes = 100 * 1024 * 1024;
    }
  }

  static void applyBoostEntitlement({
    required bool active,
    int? maxUploadBytes,
  }) {
    _boostStatusLoaded = true;
    _boostActive = active;
    if (maxUploadBytes != null && maxUploadBytes > 0) {
      _maxUploadBytes = maxUploadBytes;
    }
  }

  /// Chat thumbnail — WebP/JPEG auto format, capped width (never use video transforms).
  static String optimizeChatImageUrl(String rawUrl) {
    var url = rawUrl.trim();
    if (url.isEmpty) return url;
    if (url.startsWith('http://')) {
      url = 'https://${url.substring(7)}';
    }
    if (!url.contains('/res.cloudinary.com/')) return url;
    const thumb = '/image/upload/q_auto,f_auto,w_480/';
    if (url.contains(thumb)) return url;
    if (url.contains('/image/upload/')) {
      return url.replaceFirst('/image/upload/', thumb);
    }
    // Legacy path without resource type — only optimize if not a video URL.
    if (url.contains('/video/upload')) return url;
    if (url.contains('/upload/') && !url.contains('vc_auto')) {
      return url.replaceFirst('/upload/', '/upload/q_auto,f_auto,w_480/');
    }
    return url;
  }

  /// Full-screen gallery image (slightly larger than bubble thumb).
  static String optimizeChatImageFullUrl(String rawUrl) {
    var url = rawUrl.trim();
    if (url.isEmpty) return url;
    if (url.startsWith('http://')) {
      url = 'https://${url.substring(7)}';
    }
    if (!url.contains('/res.cloudinary.com/')) return url;
    const full = '/image/upload/q_auto,f_auto,w_1280/';
    if (url.contains(full)) return url;
    if (url.contains('/image/upload/')) {
      return url.replaceFirst('/image/upload/', full);
    }
    if (url.contains('/video/upload')) return url;
    if (url.contains('/upload/') && !url.contains('vc_auto')) {
      return url.replaceFirst('/upload/', '/upload/q_auto,f_auto,w_1280/');
    }
    return url;
  }

  /// Video playback URL — boost may add codec/size transforms (images must not use this).
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

  /// Max upload size from Boost tier (100MB free / 300MB basic / 600MB boost).
  static int get maxUploadBytes => _maxUploadBytes;

  static String formatUploadLimitError() {
    final mb = (maxUploadBytes / (1024 * 1024)).round();
    if (mb <= 100) {
      return 'File vượt quá giới hạn 100MB. Nâng cấp Boost để tải lên tối đa 300MB hoặc 600MB.';
    }
    if (mb <= 300) {
      return 'File vượt quá giới hạn 300MB (Boost cơ bản). Nâng cấp lên gói Boost để tải lên tối đa 600MB.';
    }
    return 'File vượt quá giới hạn 600MB cho phép.';
  }
}
