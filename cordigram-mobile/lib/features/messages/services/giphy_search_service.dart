import 'dart:convert';

import 'package:http/http.dart' as http;

import '../../../core/config/app_config.dart';

/// Minimal client for Giphy trending/search (same endpoints as `cordigram-web/lib/giphy-api.ts`).
class GiphySearchItem {
  const GiphySearchItem({
    required this.id,
    required this.title,
    required this.previewUrl,
  });

  final String id;
  final String title;
  final String previewUrl;
}

class GiphySearchService {
  GiphySearchService._();

  static const _base = 'https://api.giphy.com/v1';

  static Future<List<GiphySearchItem>> trendingGifs() async {
    return _fetchList(
      '$_base/gifs/trending?api_key=${AppConfig.giphyApiKey}&limit=24&rating=g',
    );
  }

  static Future<List<GiphySearchItem>> searchGifs(String query) async {
    final q = Uri.encodeQueryComponent(query.trim());
    if (q.isEmpty) return trendingGifs();
    return _fetchList(
      '$_base/gifs/search?api_key=${AppConfig.giphyApiKey}&q=$q&limit=24&rating=g&lang=en',
    );
  }

  static Future<List<GiphySearchItem>> trendingStickers() async {
    return _fetchList(
      '$_base/stickers/trending?api_key=${AppConfig.giphyApiKey}&limit=24&rating=g',
    );
  }

  static Future<List<GiphySearchItem>> searchStickers(String query) async {
    final q = Uri.encodeQueryComponent(query.trim());
    if (q.isEmpty) return trendingStickers();
    return _fetchList(
      '$_base/stickers/search?api_key=${AppConfig.giphyApiKey}&q=$q&limit=24&rating=g&lang=en',
    );
  }

  static Future<List<GiphySearchItem>> _fetchList(String url) async {
    if (AppConfig.giphyApiKey.isEmpty) return const [];
    final res = await http.get(Uri.parse(url));
    if (res.statusCode < 200 || res.statusCode >= 300) return const [];
    final map = jsonDecode(res.body);
    if (map is! Map<String, dynamic>) return const [];
    final data = map['data'];
    if (data is! List) return const [];
    final out = <GiphySearchItem>[];
    for (final item in data.whereType<Map>()) {
      final id = item['id']?.toString() ?? '';
      if (id.isEmpty) continue;
      final title = item['title']?.toString() ?? '';
      final images = item['images'];
      String preview = '';
      // Preview order aligned with web `GiphyGif` usage (`fixed_height` / `fixed_height_small` / `downsized`).
      if (images is Map) {
        for (final key in ['fixed_height', 'fixed_height_small', 'downsized']) {
          final block = images[key];
          if (block is Map && block['url'] != null) {
            preview = block['url'].toString();
            break;
          }
        }
      }
      out.add(GiphySearchItem(id: id, title: title, previewUrl: preview));
    }
    return out;
  }
}
