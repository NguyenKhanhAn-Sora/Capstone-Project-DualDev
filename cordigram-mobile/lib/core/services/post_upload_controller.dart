import 'dart:async';
import 'dart:io';
import 'package:flutter/foundation.dart';
import '../../features/post/create_post_service.dart';
import 'api_service.dart';

enum UploadMode { post, reel }

enum PublishMode { now, schedule }

enum UploadStatus { idle, uploading, done, error, cancelled }

class UploadMediaItem {
  const UploadMediaItem({
    required this.file,
    required this.isVideo,
    this.durationSec,
  });
  final File file;
  final bool isVideo;
  final double? durationSec;
}

class PostUploadPayload {
  const PostUploadPayload({
    required this.caption,
    required this.location,
    required this.audience,
    required this.allowComments,
    required this.allowDownload,
    required this.hideLikeCount,
    required this.hashtags,
    required this.mentions,
    this.scheduledAt,
  });
  final String caption;
  final String location;
  final String audience;
  final bool allowComments;
  final bool allowDownload;
  final bool hideLikeCount;
  final List<String> hashtags;
  final List<String> mentions;
  final String? scheduledAt;
}

class PostUploadController extends ChangeNotifier {
  PostUploadController._();
  static final instance = PostUploadController._();

  static const double _fileUploadWeight = 90.0;
  static const int _reelMaxDurationSec = 90;

  UploadStatus _status = UploadStatus.idle;
  UploadMode _mode = UploadMode.post;
  PublishMode _publishMode = PublishMode.now;
  double _progress = 0;
  int _totalFiles = 0;
  int _uploadedFiles = 0;
  String? _error;
  int _generation = 0;
  Timer? _hideTimer;

  String? _newPostId;

  UploadStatus get status => _status;
  UploadMode get mode => _mode;
  PublishMode get publishMode => _publishMode;
  double get progress => _progress;
  int get totalFiles => _totalFiles;
  int get uploadedFiles => _uploadedFiles;
  String? get error => _error;
  bool get isActive => _status == UploadStatus.uploading;

  /// ID of the newly published post. Only set when mode=post + publishMode=now.
  /// Consumers should call [clearNewPost] after reading.
  String? get newPostId => _newPostId;

  void clearNewPost() {
    _newPostId = null;
  }

  void startUpload({
    required UploadMode mode,
    required List<UploadMediaItem> mediaItems,
    required PostUploadPayload payload,
    required PublishMode publishMode,
  }) {
    _hideTimer?.cancel();
    _generation++;
    final gen = _generation;

    _mode = mode;
    _publishMode = publishMode;
    _status = UploadStatus.uploading;
    _progress = 0;
    _totalFiles = mediaItems.length;
    _uploadedFiles = 0;
    _error = null;
    _newPostId = null;
    notifyListeners();

    _runUpload(
      generation: gen,
      mode: mode,
      mediaItems: mediaItems,
      payload: payload,
    );
  }

  Future<void> _runUpload({
    required int generation,
    required UploadMode mode,
    required List<UploadMediaItem> mediaItems,
    required PostUploadPayload payload,
  }) async {
    bool isCurrent() => generation == _generation;

    try {
      final total = mediaItems.length;
      final uploadedMedia = <Map<String, dynamic>>[];

      for (int i = 0; i < total; i++) {
        if (!isCurrent()) return;

        final item = mediaItems[i];
        final fileSlice = _fileUploadWeight / total;
        final fileStart = (i / total) * _fileUploadWeight;
        final maxSim = fileStart + fileSlice * 0.88;

        _progress = fileStart;
        notifyListeners();

        // Smooth simulated progress (exponential ease-out, 7% of gap/tick)
        Timer? simTimer;
        simTimer = Timer.periodic(const Duration(milliseconds: 100), (_) {
          if (!isCurrent()) {
            simTimer?.cancel();
            return;
          }
          if (_progress >= maxSim) return;
          final remaining = maxSim - _progress;
          final step = (remaining * 0.07).clamp(0.15, remaining);
          _progress = (_progress + step).clamp(0.0, maxSim);
          notifyListeners();
        });

        UploadResult result;
        try {
          result = await CreatePostService.uploadMedia(item.file);
        } finally {
          simTimer.cancel();
        }

        if (!isCurrent()) return;

        final double? finalDuration = result.duration ?? item.durationSec;

        if (mode == UploadMode.reel) {
          if (finalDuration == null || finalDuration > _reelMaxDurationSec) {
            _status = UploadStatus.error;
            _error = finalDuration == null
                ? 'Missing video duration.'
                : 'Video exceeds ${_reelMaxDurationSec}s.';
            notifyListeners();
            _scheduleHide(generation, const Duration(seconds: 4));
            return;
          }
        }

        uploadedMedia.add({
          'type': item.isVideo ? 'video' : 'image',
          'url': result.url,
          'metadata': {
            'publicId': result.publicId,
            if (result.resourceType != null) 'resourceType': result.resourceType,
            if (result.format != null) 'format': result.format,
            if (result.width != null) 'width': result.width,
            if (result.height != null) 'height': result.height,
            if (result.bytes != null) 'bytes': result.bytes,
            if (finalDuration != null)
              'duration': (finalDuration * 100).round() / 100,
            if (result.folder != null) 'folder': result.folder,
            if (result.moderationDecision != null)
              'moderationDecision': result.moderationDecision,
            if (result.moderationProvider != null)
              'moderationProvider': result.moderationProvider,
          },
        });

        _progress = ((i + 1) / total) * _fileUploadWeight;
        _uploadedFiles = i + 1;
        notifyListeners();
      }

      if (!isCurrent()) return;

      // Post-creation phase (90 → 100%)
      if (mode == UploadMode.reel) {
        final reelMedia = uploadedMedia.first;
        final rawDur =
            (reelMedia['metadata'] as Map<String, dynamic>?)?['duration'];
        await CreatePostService.createReel(
          caption: payload.caption,
          location: payload.location,
          audience: payload.audience,
          allowComments: payload.allowComments,
          allowDownload: payload.allowDownload,
          hideLikeCount: payload.hideLikeCount,
          hashtags: payload.hashtags,
          mentions: payload.mentions,
          media: reelMedia,
          durationSeconds: rawDur is num ? rawDur.toDouble() : null,
          scheduledAt: payload.scheduledAt,
        );
      } else {
        final postId = await CreatePostService.createPost(
          caption: payload.caption,
          location: payload.location,
          audience: payload.audience,
          allowComments: payload.allowComments,
          allowDownload: payload.allowDownload,
          hideLikeCount: payload.hideLikeCount,
          hashtags: payload.hashtags,
          mentions: payload.mentions,
          media: uploadedMedia,
          scheduledAt: payload.scheduledAt,
        );

        // Store post ID so HomeScreen can inject it into the feed
        if (isCurrent() &&
            payload.scheduledAt == null &&
            postId != null) {
          _newPostId = postId;
        }
      }

      if (!isCurrent()) return;

      _progress = 100;
      _status = UploadStatus.done;
      notifyListeners();
      _scheduleHide(generation, const Duration(milliseconds: 2500));
    } catch (e) {
      if (!isCurrent()) return;
      _status = UploadStatus.error;
      _error = (e is ApiException) ? e.message : e.toString();
      notifyListeners();
      _scheduleHide(generation, const Duration(seconds: 4));
    }
  }

  void cancelUpload() {
    _generation++;
    _hideTimer?.cancel();
    _status = UploadStatus.cancelled;
    notifyListeners();
    _scheduleHide(_generation, const Duration(milliseconds: 1500));
  }

  void _scheduleHide(int generation, Duration delay) {
    _hideTimer?.cancel();
    _hideTimer = Timer(delay, () {
      if (generation != _generation) return;
      _status = UploadStatus.idle;
      _error = null;
      _progress = 0;
      notifyListeners();
    });
  }

  @override
  void dispose() {
    _hideTimer?.cancel();
    super.dispose();
  }
}
