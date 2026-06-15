import 'dart:io';
import '../../../core/services/api_service.dart';
import '../../../core/services/auth_storage.dart';
import '../models/story_models.dart';

class StoryService {
  static Map<String, String> get _auth =>
      {'Authorization': 'Bearer ${AuthStorage.accessToken ?? ''}'};

  // ── Feed ─────────────────────────────────────────────────────────────────

  static Future<List<StoryFeedGroup>> fetchFeed() async {
    final raw = await ApiService.getList('/stories/feed', extraHeaders: _auth);
    return raw
        .whereType<Map<String, dynamic>>()
        .map(StoryFeedGroup.fromJson)
        .toList();
  }

  static Future<List<StoryItem>> fetchMyStories() async {
    final raw = await ApiService.getList('/stories/my', extraHeaders: _auth);
    return raw
        .whereType<Map<String, dynamic>>()
        .map(StoryItem.fromJson)
        .toList();
  }

  // ── Upload & Create ──────────────────────────────────────────────────────

  /// Upload a media file and return { url, type, mediaDurationMs? }
  static Future<Map<String, dynamic>> uploadMedia(File file) async {
    final name = file.path.toLowerCase();
    final isVideo = name.endsWith('.mp4') ||
        name.endsWith('.mov') ||
        name.endsWith('.avi') ||
        name.endsWith('.webm');
    final contentType = isVideo ? 'video/mp4' : 'image/jpeg';
    final res = await ApiService.postMultipart(
      '/stories/upload',
      fieldName: 'file',
      filePath: file.path,
      contentType: contentType,
      extraHeaders: _auth,
    );
    return res;
  }

  /// Trims an external audio URL to [startTime, startTime+duration] seconds
  /// and uploads the clip to Cloudinary. Returns the clipped URL.
  static Future<String> trimAudio({
    required String audioUrl,
    required int startTime,
    int duration = 20,
  }) async {
    final res = await ApiService.post(
      '/stories/trim-audio',
      body: {
        'audioUrl': audioUrl,
        'startTime': startTime,
        'duration': duration,
      },
      extraHeaders: _auth,
    );
    return res['clippedUrl'] as String;
  }

  static Future<StoryItem> createStory(Map<String, dynamic> body) async {
    final res = await ApiService.post(
      '/stories',
      body: body,
      extraHeaders: _auth,
    );
    return StoryItem.fromJson(res);
  }

  // ── Interactions ─────────────────────────────────────────────────────────

  static Future<void> markViewed(String storyId) async {
    try {
      await ApiService.post(
        '/stories/$storyId/view',
        extraHeaders: _auth,
      );
    } catch (_) {}
  }

  static Future<void> deleteStory(String storyId) async {
    await ApiService.delete('/stories/$storyId', extraHeaders: _auth);
  }

  static Future<void> reactToStory(String storyId, String emoji) async {
    await ApiService.post(
      '/stories/$storyId/react',
      body: {'emoji': emoji},
      extraHeaders: _auth,
    );
  }

  static Future<void> removeReaction(String storyId) async {
    await ApiService.delete(
      '/stories/$storyId/react',
      extraHeaders: _auth,
    );
  }

  // ── Viewers ──────────────────────────────────────────────────────────────

  static Future<({List<StoryViewer> viewers, int totalViews})> getViewers(
      String storyId) async {
    final res = await ApiService.get(
      '/stories/$storyId/viewers',
      extraHeaders: _auth,
    );
    final rawList = res['viewers'];
    final viewers = rawList is List
        ? rawList
            .whereType<Map<String, dynamic>>()
            .map(StoryViewer.fromJson)
            .toList()
        : <StoryViewer>[];
    final total = (res['totalViews'] as num?)?.toInt() ?? viewers.length;
    return (viewers: viewers, totalViews: total);
  }

  // ── Visibility ───────────────────────────────────────────────────────────

  static Future<void> updateVisibility(
      String storyId, String visibility) async {
    await ApiService.patch(
      '/stories/$storyId/visibility',
      body: {'visibility': visibility},
      extraHeaders: _auth,
    );
  }
}
