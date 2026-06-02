import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:url_launcher/url_launcher.dart';

import '../../../../core/config/app_config.dart';
import '../../../../core/services/auth_storage.dart';

class _PreviewData {
  const _PreviewData({
    required this.url,
    this.title,
    this.description,
    this.image,
    this.siteName,
    this.favicon,
  });

  final String url;
  final String? title;
  final String? description;
  final String? image;
  final String? siteName;
  final String? favicon;
}

// In-memory cache to avoid repeated backend calls in the same session
final _cache = <String, _PreviewData?>{};

Future<_PreviewData?> _fetchPreview(String url) async {
  if (_cache.containsKey(url)) return _cache[url];
  try {
    final token = AuthStorage.accessToken ?? '';
    final uri = Uri.parse(
      '${AppConfig.apiBaseUrl}/link-preview?url=${Uri.encodeQueryComponent(url)}',
    );
    final res = await http
        .get(uri, headers: {'Authorization': 'Bearer $token'})
        .timeout(const Duration(seconds: 7));
    if (res.statusCode != 200) {
      _cache[url] = null;
      return null;
    }
    final json = jsonDecode(res.body) as Map<String, dynamic>;
    final data = _PreviewData(
      url: url,
      title: json['title'] as String?,
      description: json['description'] as String?,
      image: json['image'] as String?,
      siteName: json['siteName'] as String?,
      favicon: json['favicon'] as String?,
    );
    _cache[url] = data;
    return data;
  } catch (_) {
    _cache[url] = null;
    return null;
  }
}

/// Extracts the first HTTP/HTTPS URL from [text], excluding media CDN URLs.
String? extractFirstUrl(String text) {
  final re = RegExp(
    r'https?://(?!res\.cloudinary\.com)[^\s<>"]+',
    caseSensitive: false,
  );
  final m = re.firstMatch(text);
  return m?.group(0);
}

/// A card that shows Open Graph / meta preview for a URL.
/// Renders nothing while loading and nothing on failure.
class LinkPreviewCard extends StatefulWidget {
  const LinkPreviewCard({super.key, required this.url});

  final String url;

  @override
  State<LinkPreviewCard> createState() => _LinkPreviewCardState();
}

class _LinkPreviewCardState extends State<LinkPreviewCard> {
  _PreviewData? _data;
  bool _resolved = false;

  @override
  void initState() {
    super.initState();
    if (_cache.containsKey(widget.url)) {
      _data = _cache[widget.url];
      _resolved = true;
    } else {
      _fetchPreview(widget.url).then((d) {
        if (mounted) setState(() { _data = d; _resolved = true; });
      });
    }
  }

  Future<void> _open() async {
    final uri = Uri.tryParse(widget.url);
    if (uri == null) return;
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!_resolved || _data == null) return const SizedBox.shrink();
    final d = _data!;
    if (d.title == null && d.description == null && d.image == null) {
      return const SizedBox.shrink();
    }

    return GestureDetector(
      onTap: _open,
      child: Container(
        margin: const EdgeInsets.only(top: 6),
        constraints: const BoxConstraints(maxWidth: 320),
        decoration: BoxDecoration(
          color: const Color(0xFF0E1E3F),
          borderRadius: BorderRadius.circular(8),
          border: Border(
            left: const BorderSide(color: Color(0xFF3D63DD), width: 3),
            top: BorderSide(color: Colors.white.withValues(alpha: 0.07), width: 1),
            right: BorderSide(color: Colors.white.withValues(alpha: 0.07), width: 1),
            bottom: BorderSide(color: Colors.white.withValues(alpha: 0.07), width: 1),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            if (d.image != null)
              ClipRRect(
                borderRadius: const BorderRadius.only(
                  topRight: Radius.circular(7),
                  topLeft: Radius.circular(4),
                ),
                child: Image.network(
                  d.image!,
                  width: double.infinity,
                  height: 140,
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => const SizedBox.shrink(),
                ),
              ),
            Padding(
              padding: const EdgeInsets.fromLTRB(10, 8, 10, 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  // Site name row
                  Row(
                    children: [
                      if (d.favicon != null)
                        Padding(
                          padding: const EdgeInsets.only(right: 5),
                          child: Image.network(
                            d.favicon!,
                            width: 13,
                            height: 13,
                            errorBuilder: (_, __, ___) => const SizedBox.shrink(),
                          ),
                        ),
                      Expanded(
                        child: Text(
                          (d.siteName ?? _hostnameOf(widget.url)).toUpperCase(),
                          style: const TextStyle(
                            color: Color(0xFF8A9DC0),
                            fontSize: 10,
                            letterSpacing: 0.5,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                  if (d.title != null) ...[
                    const SizedBox(height: 3),
                    Text(
                      d.title!,
                      style: const TextStyle(
                        color: Color(0xFFDDE1E9),
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                  if (d.description != null) ...[
                    const SizedBox(height: 2),
                    Text(
                      d.description!,
                      style: const TextStyle(
                        color: Color(0xFF8A9DC0),
                        fontSize: 11,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  static String _hostnameOf(String url) {
    try {
      return Uri.parse(url).host.replaceFirst(RegExp(r'^www\.'), '');
    } catch (_) {
      return url;
    }
  }
}
