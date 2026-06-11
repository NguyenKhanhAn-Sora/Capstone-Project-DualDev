/// Parity web `lib/user-profile-cover.ts` — `coverUrl` ảnh HTTPS hoặc SVG data URL.

abstract final class MessagingProfileCover {
  static const defaultBannerHex = '#5865f2';

  static ({String? bannerImageUrl, String bannerSolidHex}) parse(String? coverUrl) {
    final t = (coverUrl ?? '').trim();
    if (t.isEmpty) {
      return (bannerImageUrl: null, bannerSolidHex: defaultBannerHex);
    }
    if (RegExp(r'^https?://', caseSensitive: false).hasMatch(t)) {
      return (bannerImageUrl: t, bannerSolidHex: defaultBannerHex);
    }
    if (t.startsWith('data:image/svg+xml')) {
      final raw = t.contains(',') ? t.split(',').skip(1).join(',') : '';
      try {
        final decoded = raw.contains('%') ? Uri.decodeComponent(raw) : raw;
        final m = RegExp(r'fill="#([0-9a-fA-F]{6})"', caseSensitive: false)
            .firstMatch(decoded);
        if (m != null) {
          return (
            bannerImageUrl: null,
            bannerSolidHex: '#${m.group(1)!.toLowerCase()}',
          );
        }
      } catch (_) {}
    }
    return (bannerImageUrl: null, bannerSolidHex: defaultBannerHex);
  }

  static String buildForSave({
    required String? bannerImageUrl,
    required String bannerSolidHex,
  }) {
    final img = bannerImageUrl?.trim();
    if (img != null && img.isNotEmpty) return img;
    final safe = _sanitizeHex(bannerSolidHex).replaceFirst('#', '');
    final svg =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 240"><rect fill="#$safe" width="960" height="240"/></svg>';
    return 'data:image/svg+xml,${Uri.encodeComponent(svg)}';
  }

  static String _sanitizeHex(String hex) {
    var h = hex.replaceFirst('#', '').replaceAll(RegExp(r'[^0-9a-fA-F]'), '');
    if (h.length == 3) {
      h = h.split('').map((c) => c + c).join();
    }
    if (h.length < 6) h = (h + '000000').substring(0, 6);
    return '#${h.toLowerCase()}';
  }
}
