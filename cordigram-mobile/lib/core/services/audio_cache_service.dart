import 'dart:io';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';

/// Downloads story-music clips to the device temp directory and serves them
/// from there on subsequent plays. All public methods are safe to call
/// concurrently — duplicate downloads for the same URL are deduplicated.
class AudioCacheService {
  AudioCacheService._();
  static final instance = AudioCacheService._();

  // url → absolute local file path (populated lazily from disk)
  final Map<String, String> _index = {};
  // urls currently being fetched (deduplication)
  final Set<String> _inProgress = {};

  // ── Helpers ───────────────────────────────────────────────────────────────

  String _filename(String url) =>
      'sa_${url.hashCode.abs().toRadixString(16)}.m4a';

  Future<Directory> _dir() async {
    final tmp = await getTemporaryDirectory();
    final d = Directory('${tmp.path}/story_audio_cache');
    if (!d.existsSync()) await d.create(recursive: true);
    return d;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /// Returns the cached local path if available, otherwise null.
  /// Very fast — checks in-memory index first, then disk.
  Future<String?> getCached(String url) async {
    if (url.isEmpty) return null;
    if (_index.containsKey(url)) return _index[url];
    try {
      final file = File('${(await _dir()).path}/${_filename(url)}');
      if (file.existsSync() && file.lengthSync() > 0) {
        _index[url] = file.path;
        return file.path;
      }
    } catch (_) {}
    return null;
  }

  /// Downloads [url] to the cache directory and returns the local path.
  /// Returns null if the download fails.
  /// If a download for [url] is already in progress, waits for it to finish.
  Future<String?> fetchAndCache(String url) async {
    if (url.isEmpty) return null;

    final existing = await getCached(url);
    if (existing != null) return existing;

    // Wait for an in-progress download rather than duplicating it.
    if (_inProgress.contains(url)) {
      for (var i = 0; i < 30; i++) {
        await Future.delayed(const Duration(milliseconds: 200));
        final cached = await getCached(url);
        if (cached != null) return cached;
        if (!_inProgress.contains(url)) break;
      }
      return await getCached(url);
    }

    _inProgress.add(url);
    try {
      final dir = await _dir();
      final file = File('${dir.path}/${_filename(url)}');
      final response = await http.get(Uri.parse(url));
      if (response.statusCode == 200 && response.bodyBytes.isNotEmpty) {
        await file.writeAsBytes(response.bodyBytes, flush: true);
        _index[url] = file.path;
        return file.path;
      }
    } catch (_) {
      // Network error — caller falls back to URL streaming.
    } finally {
      _inProgress.remove(url);
    }
    return null;
  }

  /// Fire-and-forget background prefetch. Safe to call multiple times.
  void prefetch(String url) {
    if (url.isEmpty) return;
    if (_index.containsKey(url) || _inProgress.contains(url)) return;
    fetchAndCache(url).catchError((_) => null);
  }

  /// Delete cached files older than [maxAge] to free storage.
  /// Call once per session (e.g. on viewer open).
  Future<void> evictOld({Duration maxAge = const Duration(days: 2)}) async {
    try {
      final dir = await _dir();
      final cutoff = DateTime.now().subtract(maxAge);
      await for (final entity in dir.list()) {
        if (entity is File) {
          final stat = await entity.stat();
          if (stat.modified.isBefore(cutoff)) {
            await entity.delete().catchError((_) => entity);
          }
        }
      }
      _index.removeWhere((_, path) {
        return !File(path).existsSync();
      });
    } catch (_) {}
  }
}
