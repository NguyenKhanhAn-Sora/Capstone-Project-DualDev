/// Resolves chat image/video URLs the same way as cordigram-web messages page.
class ChatMediaResolver {
  ChatMediaResolver._();

  static final RegExp _imageLineRe =
      RegExp(r'📷 \[Image\]: (https?://[^\s]+)', multiLine: true);
  static final RegExp _videoLineRe =
      RegExp(r'🎬 \[Video\]: (https?://[^\s]+)');
  static final RegExp _plainImageUrlRe = RegExp(
    r'^https?://[^\s]+\.(jpe?g|png|webp|gif)(\?[^\s]*)?$',
    caseSensitive: false,
  );
  static final RegExp _plainVideoUrlRe = RegExp(
    r'^https?://[^\s]+\.(mp4|webm|mov)(\?[^\s]*)?$',
    caseSensitive: false,
  );

  static String toHttps(String url) {
    final trimmed = url.trim();
    if (trimmed.startsWith('http://')) {
      return 'https://${trimmed.substring(7)}';
    }
    return trimmed;
  }

  /// Backward-compat: synthesize emoji-prefixed lines from [attachments] and bare URLs.
  static String resolveContentText({
    required String content,
    required List<String> attachments,
  }) {
    var text = content.trim();
    if (text.contains('http://res.cloudinary.com/')) {
      text = text.replaceAll('http://res.cloudinary.com/', 'https://res.cloudinary.com/');
    }

    if (attachments.isNotEmpty &&
        !text.contains('📷 [Image]:') &&
        !text.contains('🎬 [Video]:')) {
      final extra = <String>[];
      for (final att in attachments) {
        final safe = toHttps(att);
        if (safe.isEmpty) continue;
        if (_plainVideoUrlRe.hasMatch(safe)) {
          extra.add('🎬 [Video]: $safe');
        } else if (safe.startsWith('https://')) {
          extra.add('📷 [Image]: $safe');
        }
      }
      if (extra.isNotEmpty) {
        text = extra.join('\n');
      }
    }

    if (!text.contains('📷 [Image]:') && !text.contains('🎬 [Video]:')) {
      final trimmed = toHttps(text);
      if (_plainImageUrlRe.hasMatch(trimmed)) {
        text = '📷 [Image]: $trimmed';
      } else if (_plainVideoUrlRe.hasMatch(trimmed)) {
        text = '🎬 [Video]: $trimmed';
      }
    }

    return text;
  }

  static List<String> extractImageUrls(String resolvedText) {
    return _imageLineRe
        .allMatches(resolvedText)
        .map((m) => toHttps(m.group(1) ?? ''))
        .where((u) => u.isNotEmpty)
        .toList();
  }

  static String? extractVideoUrl(String resolvedText) {
    final m = _videoLineRe.firstMatch(resolvedText);
    if (m == null) return null;
    final url = toHttps(m.group(1) ?? '');
    return url.isEmpty ? null : url;
  }

  static bool looksLikeImageUrl(String url) {
    final lower = url.toLowerCase();
    return lower.contains('.png') ||
        lower.contains('.jpg') ||
        lower.contains('.jpeg') ||
        lower.contains('.webp') ||
        lower.contains('.gif') ||
        lower.contains('/image/upload') ||
        lower.contains('/res.cloudinary.com/');
  }

  static bool looksLikeVideoUrl(String url) {
    final lower = url.toLowerCase();
    return lower.contains('.mp4') ||
        lower.contains('.webm') ||
        lower.contains('.mov') ||
        lower.contains('/video/upload');
  }
}
