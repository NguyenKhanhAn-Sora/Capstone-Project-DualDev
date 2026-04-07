import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'dart:ui';
import 'package:flutter/foundation.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:http/http.dart' as http;
import 'package:image_picker/image_picker.dart';
import 'package:path_provider/path_provider.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:video_player/video_player.dart';
import '../../core/services/api_service.dart';
import '../../core/services/auth_storage.dart';
import '../../core/widgets/comment_sheet_widgets.dart';
import '../home/models/feed_post.dart';
import '../home/services/post_interaction_service.dart';
import '../home/widgets/post_card.dart' show PostMenuAction;
import '../profile/profile_screen.dart';
import '../post/post_detail_screen.dart' show CommentItem, CommentLinkPreview;
import '../post/utils/post_edit_utils.dart';
import '../report/report_comment_sheet.dart';
import '../report/report_post_sheet.dart';

// ── Reels screen ──────────────────────────────────────────────────────────────

class ReelsScreen extends StatefulWidget {
  const ReelsScreen({super.key});

  @override
  State<ReelsScreen> createState() => _ReelsScreenState();
}

class _ReelsScreenState extends State<ReelsScreen> {
  final List<FeedPostState> _reels = [];

  /// Map of page-index → VideoPlayerController (lazily initialized).
  final Map<int, VideoPlayerController> _controllers = {};

  final PageController _pageController = PageController();

  int _currentPage = 0;
  bool _loading = false;
  bool _hasMore = true;
  int _page = 1;
  static const int _kPageSize = 10;

  bool _muted = false;
  String? _viewerId;

  /// Per-reel view cooldown (reel id → last-viewed timestamp ms).
  final Map<String, int> _viewCooldown = {};
  static const int _kViewCooldownMs = 300000; // 5 min

  Timer? _viewTimer;

  static Map<String, String> get _authHeader => {
    'Authorization': 'Bearer ${AuthStorage.accessToken}',
  };

  void _showSnack(String message, {bool error = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: error
            ? const Color(0xFFB91C1C)
            : const Color(0xFF1A2235),
      ),
    );
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  @override
  void initState() {
    super.initState();
    _fetchViewerId();
    _loadReels();
  }

  @override
  void dispose() {
    _viewTimer?.cancel();
    _pageController.dispose();
    for (final c in _controllers.values) {
      c.dispose();
    }
    super.dispose();
  }

  // ── Viewer ID ──────────────────────────────────────────────────────────────

  Future<void> _fetchViewerId() async {
    try {
      final data = await ApiService.get(
        '/profiles/me',
        extraHeaders: _authHeader,
      );
      if (!mounted) return;
      final id = (data['userId'] as String?) ?? (data['id'] as String?);
      if (id != null) setState(() => _viewerId = id);
    } catch (_) {}
  }

  // ── Page change ────────────────────────────────────────────────────────────

  void _onPageChanged(int page) {
    // Pause previous reel.
    _controllers[_currentPage]?.pause();
    _viewTimer?.cancel();

    setState(() => _currentPage = page);

    // Play new reel (initialize if needed).
    _initAndPlay(page);

    // Schedule view tracking after 2-second dwell.
    _viewTimer = Timer(const Duration(seconds: 2), () {
      if (mounted && _currentPage == page) _trackView(page);
    });

    // Preload adjacent reels.
    _ensureControllerInitialized(page + 1);
    if (page > 0) _ensureControllerInitialized(page - 1);

    // Dispose controllers that are far away (keep ±2 window).
    _disposeDistantControllers(page);

    // Load more reels when near the end.
    if (page >= _reels.length - 3 && !_loading && _hasMore) _loadReels();
  }

  // ── Video controller helpers ───────────────────────────────────────────────

  Future<void> _initAndPlay(int index) async {
    await _ensureControllerInitialized(index);
    if (!mounted || _currentPage != index) return;
    _controllers[index]?.play();
    if (mounted) setState(() {});
  }

  Future<void> _ensureControllerInitialized(int index) async {
    if (index < 0 || index >= _reels.length) return;
    if (_controllers.containsKey(index)) return;

    final videoUrl = _reels[index].post.media.isNotEmpty
        ? _reels[index].post.media.first.url
        : null;
    if (videoUrl == null || videoUrl.isEmpty) return;

    final controller = VideoPlayerController.networkUrl(Uri.parse(videoUrl));
    _controllers[index] = controller;

    try {
      await controller.initialize();
      if (!mounted) return;

      // Fix: ExoPlayer sometimes reports a wrong tiny duration on initialization
      // (especially for network videos). The backend stores the authoritative
      // duration from Cloudinary metadata. Patch controller.value.duration so
      // that _updatePosition's clamp and seekTo() both work correctly.
      final backendDurMs = _reels[index].post.primaryVideoDurationMs;
      final nativeDurMs = controller.value.duration.inMilliseconds;

      int? normalizedBackendDurMs;
      if (backendDurMs != null && backendDurMs > 0) {
        // Defensive: if backend accidentally returns seconds instead of ms
        // (e.g. 26), normalize it to ms.
        normalizedBackendDurMs = backendDurMs < 1000
            ? backendDurMs * 1000
            : backendDurMs;
      }

      final shouldPatchWithBackend =
          normalizedBackendDurMs != null &&
          normalizedBackendDurMs > 0 &&
          (nativeDurMs <= 0 ||
              nativeDurMs < 1000 ||
              nativeDurMs < (normalizedBackendDurMs * 0.2));

      if (shouldPatchWithBackend) {
        controller.value = controller.value.copyWith(
          duration: Duration(milliseconds: normalizedBackendDurMs),
        );
      }

      if (kDebugMode) {
        debugPrint(
          '[ReelDuration] id=${_reels[index].post.id} '
          'native=${nativeDurMs}ms backendRaw=${backendDurMs}ms '
          'backendNorm=${normalizedBackendDurMs}ms '
          'effective=${controller.value.duration.inMilliseconds}ms',
        );
      }

      controller.setLooping(true);
      controller.setVolume(_muted ? 0.0 : 1.0);
      if (mounted) setState(() {});
    } catch (_) {
      _controllers.remove(index)?.dispose();
    }
  }

  void _disposeDistantControllers(int currentPage) {
    final toDispose = _controllers.keys
        .where((i) => (i - currentPage).abs() > 2)
        .toList();
    for (final i in toDispose) {
      _controllers.remove(i)?.dispose();
    }
  }

  // ── View tracking ──────────────────────────────────────────────────────────

  void _trackView(int page) {
    if (page >= _reels.length) return;
    final id = _reels[page].post.id;
    final now = DateTime.now().millisecondsSinceEpoch;
    final last = _viewCooldown[id] ?? 0;
    if (now - last < _kViewCooldownMs) return;
    _viewCooldown[id] = now;
    PostInteractionService.view(id).catchError((_) => _viewCooldown.remove(id));
  }

  // ── Load reels ─────────────────────────────────────────────────────────────

  Future<void> _loadReels({bool refresh = false}) async {
    if (_loading) return;
    setState(() {
      _loading = true;
      if (refresh) {
        _reels.clear();
        _page = 1;
        _hasMore = true;
        for (final c in _controllers.values) {
          c.dispose();
        }
        _controllers.clear();
        _currentPage = 0;
      }
    });

    try {
      final rawList = await ApiService.getList(
        '/reels/feed?limit=$_kPageSize&page=$_page',
        extraHeaders: _authHeader,
      );
      if (!mounted) return;

      final List<FeedPost> posts = rawList
          .whereType<Map<String, dynamic>>()
          .map(FeedPost.fromJson)
          .toList();

      setState(() {
        _reels.addAll(posts.map((p) => FeedPostState(post: p)));
        _page++;
        _hasMore = posts.length >= _kPageSize;
        _loading = false;
      });

      // Initialize and play the first reel after initial load.
      if (_currentPage == 0 &&
          _reels.isNotEmpty &&
          !_controllers.containsKey(0)) {
        await _initAndPlay(0);
        _ensureControllerInitialized(1);
        _viewTimer = Timer(const Duration(seconds: 2), () {
          if (mounted) _trackView(0);
        });
      }
    } catch (_) {
      if (!mounted) return;
      setState(() => _loading = false);
    }
  }

  // ── Interactions ───────────────────────────────────────────────────────────

  void _onLike(int index) {
    if (index >= _reels.length) return;
    final s = _reels[index];
    final wasLiked = s.liked;
    final delta = wasLiked ? -1 : 1;
    setState(() {
      s.liked = !wasLiked;
      s.stats = FeedStats(
        hearts: (s.stats.hearts + delta).clamp(0, 999999999),
        comments: s.stats.comments,
        saves: s.stats.saves,
        reposts: s.stats.reposts,
        views: s.stats.views,
        impressions: s.stats.impressions,
      );
    });
    final future = wasLiked
        ? PostInteractionService.unlike(s.post.id)
        : PostInteractionService.like(s.post.id);
    future.catchError((_) {
      if (!mounted) return;
      setState(() {
        s.liked = wasLiked;
        s.stats = FeedStats(
          hearts: (s.stats.hearts - delta).clamp(0, 999999999),
          comments: s.stats.comments,
          saves: s.stats.saves,
          reposts: s.stats.reposts,
          views: s.stats.views,
          impressions: s.stats.impressions,
        );
      });
    });
  }

  void _onSave(int index) {
    if (index >= _reels.length) return;
    final s = _reels[index];
    final wasSaved = s.saved;
    final delta = wasSaved ? -1 : 1;
    setState(() {
      s.saved = !wasSaved;
      s.stats = FeedStats(
        hearts: s.stats.hearts,
        comments: s.stats.comments,
        saves: (s.stats.saves + delta).clamp(0, 999999999),
        reposts: s.stats.reposts,
        views: s.stats.views,
        impressions: s.stats.impressions,
      );
    });
    final future = wasSaved
        ? PostInteractionService.unsave(s.post.id)
        : PostInteractionService.save(s.post.id);
    if (!wasSaved) {
      _showSnack('Saved');
    } else {
      _showSnack('Removed from saved');
    }
    future.catchError((_) {
      if (!mounted) return;
      setState(() {
        s.saved = wasSaved;
        s.stats = FeedStats(
          hearts: s.stats.hearts,
          comments: s.stats.comments,
          saves: (s.stats.saves - delta).clamp(0, 999999999),
          reposts: s.stats.reposts,
          views: s.stats.views,
          impressions: s.stats.impressions,
        );
      });
      _showSnack('Failed to update save', error: true);
    });
  }

  void _onFollow(int index) {
    if (index >= _reels.length) return;
    final s = _reels[index];
    final wasFollowing = s.following;
    final authorId = s.post.authorId ?? s.post.author?.id ?? '';
    if (authorId.isEmpty) return;
    final nextFollow = !wasFollowing;

    setState(() {
      for (final reelState in _reels) {
        final id = reelState.post.authorId ?? reelState.post.author?.id;
        if (id == authorId) reelState.following = nextFollow;
      }
    });

    final future = wasFollowing
        ? PostInteractionService.unfollow(authorId)
        : PostInteractionService.follow(authorId);
    future.catchError((_) {
      if (!mounted) return;
      setState(() {
        for (final reelState in _reels) {
          final id = reelState.post.authorId ?? reelState.post.author?.id;
          if (id == authorId) reelState.following = wasFollowing;
        }
      });
    });
  }

  Future<void> _downloadReelAt(int index) async {
    if (index < 0 || index >= _reels.length) return;
    final reel = _reels[index].post;
    if (reel.allowDownload != true || reel.media.isEmpty) {
      _showSnack('Download is disabled for this reel', error: true);
      return;
    }

    final media = reel.media.firstWhere(
      (m) => m.type == 'video',
      orElse: () => reel.media.first,
    );

    try {
      final res = await http
          .get(Uri.parse(media.url))
          .timeout(const Duration(seconds: 45));
      if (res.statusCode < 200 || res.statusCode >= 300) {
        throw Exception('download failed');
      }

      final bytes = res.bodyBytes;
      final dir = await _resolveDownloadDirectory();
      final filename = _buildFilename(media, bytes);
      final file = File('${dir.path}${Platform.pathSeparator}$filename');
      await file.writeAsBytes(bytes, flush: true);

      _showSnack('Downloaded: ${file.path}');
    } catch (_) {
      _showSnack('Failed to download reel', error: true);
    }
  }

  Future<Directory> _resolveDownloadDirectory() async {
    if (Platform.isAndroid) {
      final direct = Directory('/storage/emulated/0/Download');
      if (await direct.exists()) return direct;
    }

    final external = await getExternalStorageDirectory();
    if (external != null) return external;

    return getApplicationDocumentsDirectory();
  }

  String _buildFilename(FeedMedia media, Uint8List bytes) {
    final uri = Uri.tryParse(media.url);
    final segment = uri?.pathSegments.isNotEmpty == true
        ? uri!.pathSegments.last
        : '';
    final fromUrl = segment.split('?').first.trim();
    final ext = _detectExtension(media, fromUrl, bytes);
    final ts = DateTime.now().millisecondsSinceEpoch;
    if (fromUrl.isNotEmpty && fromUrl.contains('.')) {
      final safe = fromUrl.replaceAll(RegExp(r'[^a-zA-Z0-9._-]'), '_');
      return 'cordigram_reel_$ts\_$safe';
    }
    return 'cordigram_reel_$ts.$ext';
  }

  String _detectExtension(FeedMedia media, String fromUrl, Uint8List bytes) {
    final lower = fromUrl.toLowerCase();
    for (final ext in ['mp4', 'mov', 'm4v', 'webm', 'jpg', 'jpeg', 'png']) {
      if (lower.endsWith('.$ext')) return ext;
    }
    if (bytes.length >= 12) {
      if (bytes[0] == 0x89 && bytes[1] == 0x50 && bytes[2] == 0x4E) {
        return 'png';
      }
      if (bytes[0] == 0xFF && bytes[1] == 0xD8) {
        return 'jpg';
      }
    }
    return media.type == 'video' ? 'mp4' : 'jpg';
  }

  Future<void> _onReelMenuAction(int index, PostMenuAction action) async {
    if (index < 0 || index >= _reels.length) return;
    final state = _reels[index];
    final reel = state.post;

    switch (action) {
      case PostMenuAction.editPost:
        final updated = await showEditPostSheet(
          context,
          post: reel,
          entityLabel: 'reel',
        );
        if (updated == null || !mounted || index >= _reels.length) return;
        setState(() {
          _reels[index] = state.copyWith(
            post: updated,
            liked: updated.liked ?? state.liked,
            saved: updated.saved ?? state.saved,
            following: updated.following ?? state.following,
            stats: updated.stats,
          );
        });
        _showSnack('Reel updated');
        return;
      case PostMenuAction.editVisibility:
        final nextVisibility = await showEditVisibilitySheet(
          context,
          postId: reel.id,
          currentVisibility: reel.visibility ?? 'public',
        );
        if (nextVisibility == null || !mounted || index >= _reels.length) {
          return;
        }
        setState(() {
          _reels[index] = state.copyWith(
            post: reel.copyWith(visibility: nextVisibility),
          );
        });
        _showSnack('Visibility updated');
        return;
      case PostMenuAction.toggleComments:
        final currentAllowed = reel.allowComments != false;
        final nextAllowed = !currentAllowed;
        setState(() {
          _reels[index] = state.copyWith(
            post: reel.copyWith(allowComments: nextAllowed),
          );
        });
        try {
          await PostInteractionService.setAllowComments(reel.id, nextAllowed);
          _showSnack(
            nextAllowed ? 'Comments turned on' : 'Comments turned off',
          );
        } catch (_) {
          if (!mounted || index >= _reels.length) return;
          setState(() {
            _reels[index] = state.copyWith(
              post: reel.copyWith(allowComments: currentAllowed),
            );
          });
          _showSnack('Failed to update comments', error: true);
        }
        return;
      case PostMenuAction.toggleHideLike:
        final currentHidden = reel.hideLikeCount == true;
        final nextHidden = !currentHidden;
        setState(() {
          _reels[index] = state.copyWith(
            post: reel.copyWith(hideLikeCount: nextHidden),
          );
        });
        try {
          await PostInteractionService.setHideLikeCount(reel.id, nextHidden);
          _showSnack(nextHidden ? 'Like count hidden' : 'Like count visible');
        } catch (_) {
          if (!mounted || index >= _reels.length) return;
          setState(() {
            _reels[index] = state.copyWith(
              post: reel.copyWith(hideLikeCount: currentHidden),
            );
          });
          _showSnack('Failed to update like visibility', error: true);
        }
        return;
      case PostMenuAction.copyLink:
        final link = PostInteractionService.reelPermalink(reel.id);
        await Clipboard.setData(ClipboardData(text: link));
        _showSnack('Link copied');
        return;
      case PostMenuAction.deletePost:
        final confirmed = await showDialog<bool>(
          context: context,
          builder: (ctx) => AlertDialog(
            backgroundColor: const Color(0xFF111827),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
            title: const Text(
              'Delete reel',
              style: TextStyle(color: Color(0xFFE8ECF8), fontSize: 16),
            ),
            content: const Text(
              'This action cannot be undone.',
              style: TextStyle(color: Color(0xFF7A8BB0), fontSize: 14),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(ctx, false),
                child: const Text(
                  'Cancel',
                  style: TextStyle(color: Color(0xFF7A8BB0)),
                ),
              ),
              TextButton(
                onPressed: () => Navigator.pop(ctx, true),
                child: const Text(
                  'Delete',
                  style: TextStyle(
                    color: Color(0xFFEF4444),
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
        );
        if (confirmed != true) return;
        try {
          await PostInteractionService.deletePost(reel.id);
          _showSnack('Reel deleted');
          await _loadReels(refresh: true);
        } catch (_) {
          _showSnack('Failed to delete reel', error: true);
        }
        return;
      case PostMenuAction.followToggle:
        _onFollow(index);
        return;
      case PostMenuAction.saveToggle:
        _onSave(index);
        return;
      case PostMenuAction.hidePost:
        try {
          await PostInteractionService.hide(reel.id);
          _showSnack('Reel hidden');
          await _loadReels(refresh: true);
        } catch (_) {
          _showSnack('Failed to hide reel', error: true);
        }
        return;
      case PostMenuAction.reportPost:
        final token = AuthStorage.accessToken;
        if (token == null) {
          _showSnack('Please sign in first', error: true);
          return;
        }
        final reported = await showReportPostSheet(
          context,
          postId: reel.id,
          authHeader: {'Authorization': 'Bearer $token'},
          subjectLabel: 'reel',
        );
        if (reported) _showSnack('Report submitted');
        return;
      case PostMenuAction.blockAccount:
        final userId = reel.authorId ?? reel.author?.id;
        if (userId == null || userId.isEmpty) return;
        final username = reel.authorUsername ?? reel.author?.username ?? 'user';
        final confirmed = await showDialog<bool>(
          context: context,
          builder: (ctx) => AlertDialog(
            backgroundColor: const Color(0xFF111827),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
            title: Text(
              'Block @$username?',
              style: const TextStyle(color: Color(0xFFE8ECF8), fontSize: 16),
            ),
            content: const Text(
              'You will no longer see reels from this account.',
              style: TextStyle(color: Color(0xFF7A8BB0), fontSize: 14),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(ctx, false),
                child: const Text(
                  'Cancel',
                  style: TextStyle(color: Color(0xFF7A8BB0)),
                ),
              ),
              TextButton(
                onPressed: () => Navigator.pop(ctx, true),
                child: const Text(
                  'Block',
                  style: TextStyle(
                    color: Color(0xFFEF4444),
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
        );
        if (confirmed != true) return;
        try {
          await PostInteractionService.blockUser(userId);
          _showSnack('Account blocked');
          await _loadReels(refresh: true);
        } catch (_) {
          _showSnack('Failed to block account', error: true);
        }
        return;
    }
  }

  void _toggleMute() {
    setState(() => _muted = !_muted);
    for (final c in _controllers.values) {
      c.setVolume(_muted ? 0.0 : 1.0);
    }
  }

  // ── Comments ───────────────────────────────────────────────────────────────

  void _openComments(int index) {
    if (index >= _reels.length) return;
    final s = _reels[index];
    final commentsLocked = s.post.allowComments == false;
    if (commentsLocked) {
      _showSnack('Comments are turned off for this reel');
      return;
    }
    _controllers[index]?.pause();

    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _ReelCommentSheet(
        postId: s.post.id,
        viewerId: _viewerId,
        postAuthorId: s.post.authorId ?? s.post.author?.id,
        allowComments: s.post.allowComments != false,
        onCommentAdded: () {
          if (!mounted) return;
          setState(() {
            s.stats = FeedStats(
              hearts: s.stats.hearts,
              comments: (s.stats.comments + 1).clamp(0, 999999999),
              saves: s.stats.saves,
              reposts: s.stats.reposts,
              views: s.stats.views,
              impressions: s.stats.impressions,
            );
          });
        },
      ),
    ).then((_) {
      if (mounted && _currentPage == index) _controllers[index]?.play();
    });
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    if (_reels.isEmpty && _loading) {
      return const Scaffold(
        backgroundColor: Color(0xFF0B1020),
        body: Center(
          child: CircularProgressIndicator(color: Color(0xFF4AA3E4)),
        ),
      );
    }

    if (_reels.isEmpty && !_loading) {
      return Scaffold(
        backgroundColor: const Color(0xFF0B1020),
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(
                Icons.smart_display_outlined,
                size: 56,
                color: Color(0xFF4A5568),
              ),
              const SizedBox(height: 12),
              const Text(
                'No reels yet',
                style: TextStyle(color: Color(0xFF7A8BB0), fontSize: 16),
              ),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: () => _loadReels(refresh: true),
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF3470A2),
                ),
                child: const Text(
                  'Refresh',
                  style: TextStyle(color: Colors.white),
                ),
              ),
            ],
          ),
        ),
      );
    }

    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          PageView.builder(
            controller: _pageController,
            scrollDirection: Axis.vertical,
            onPageChanged: _onPageChanged,
            itemCount: _reels.length,
            itemBuilder: (context, index) => _ReelPage(
              key: ValueKey(_reels[index].post.id),
              state: _reels[index],
              controller: _controllers[index],
              isCurrent: index == _currentPage,
              muted: _muted,
              viewerId: _viewerId,
              onLike: () => _onLike(index),
              onSave: () => _onSave(index),
              onComment: () => _openComments(index),
              onMuteToggle: _toggleMute,
              onFollow: () => _onFollow(index),
              onMenuAction: (action) => _onReelMenuAction(index, action),
              onDownloadReel: () => _downloadReelAt(index),
            ),
          ),
          // Loading indicator when fetching more reels.
          if (_loading && _reels.isNotEmpty)
            const Positioned(
              bottom: 80,
              left: 0,
              right: 0,
              child: Center(
                child: SizedBox(
                  width: 24,
                  height: 24,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: Colors.white54,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

// ── Single reel page ──────────────────────────────────────────────────────────

class _ReelPage extends StatefulWidget {
  const _ReelPage({
    super.key,
    required this.state,
    required this.controller,
    required this.isCurrent,
    required this.muted,
    required this.viewerId,
    required this.onLike,
    required this.onSave,
    required this.onComment,
    required this.onMuteToggle,
    required this.onFollow,
    required this.onMenuAction,
    required this.onDownloadReel,
  });

  final FeedPostState state;
  final VideoPlayerController? controller;
  final bool isCurrent;
  final bool muted;
  final String? viewerId;
  final VoidCallback onLike;
  final VoidCallback onSave;
  final VoidCallback onComment;
  final VoidCallback onMuteToggle;
  final VoidCallback onFollow;
  final Future<void> Function(PostMenuAction action) onMenuAction;
  final Future<void> Function() onDownloadReel;

  @override
  State<_ReelPage> createState() => _ReelPageState();
}

class _ReelPageState extends State<_ReelPage> {
  bool _showPauseIcon = false;
  Timer? _pauseIconTimer;

  @override
  void dispose() {
    _pauseIconTimer?.cancel();
    super.dispose();
  }

  void _handleTap() {
    final ctrl = widget.controller;
    if (ctrl == null || !ctrl.value.isInitialized) return;

    if (ctrl.value.isPlaying) {
      ctrl.pause();
      setState(() => _showPauseIcon = true);
      _pauseIconTimer?.cancel();
      _pauseIconTimer = Timer(const Duration(milliseconds: 900), () {
        if (mounted) setState(() => _showPauseIcon = false);
      });
    } else {
      ctrl.play();
      setState(() => _showPauseIcon = false);
    }
  }

  Future<void> _openReelMenu(BuildContext triggerContext) async {
    final reel = widget.state.post;
    final isOwner =
        widget.viewerId != null &&
        widget.viewerId!.isNotEmpty &&
        (reel.authorId == widget.viewerId ||
            reel.author?.id == widget.viewerId);

    final entries = <({String id, String label, bool danger})>[];
    final canDownload = reel.allowDownload == true && reel.media.isNotEmpty;
    if (isOwner) {
      entries.add((id: 'editReel', label: 'Edit reel', danger: false));
      entries.add((
        id: 'editVisibility',
        label: 'Edit visibility',
        danger: false,
      ));
      entries.add((
        id: 'toggleComments',
        label: reel.allowComments == false
            ? 'Turn on comments'
            : 'Turn off comments',
        danger: false,
      ));
      entries.add((
        id: 'toggleHideLike',
        label: reel.hideLikeCount == true ? 'Show like' : 'Hide like',
        danger: false,
      ));
      if (canDownload) {
        entries.add((
          id: 'downloadReel',
          label: 'Download this reel',
          danger: false,
        ));
      }
      entries.add((id: 'copyLink', label: 'Copy link', danger: false));
      entries.add((id: 'deleteReel', label: 'Delete reel', danger: true));
    } else {
      if (canDownload) {
        entries.add((
          id: 'downloadReel',
          label: 'Download this reel',
          danger: false,
        ));
      }
      entries.add((id: 'copyLink', label: 'Copy link', danger: false));
      entries.add((
        id: 'followToggle',
        label: widget.state.following ? 'Unfollow' : 'Follow',
        danger: false,
      ));
      entries.add((
        id: 'saveToggle',
        label: widget.state.saved ? 'Unsave this reel' : 'Save this reel',
        danger: false,
      ));
      entries.add((id: 'hideReel', label: 'Hide this reel', danger: false));
      entries.add((id: 'reportReel', label: 'Report', danger: false));
      entries.add((
        id: 'blockAccount',
        label: 'Block this account',
        danger: true,
      ));
    }

    final overlay =
        Overlay.of(triggerContext).context.findRenderObject() as RenderBox;
    final box = triggerContext.findRenderObject() as RenderBox;
    final rect = Rect.fromPoints(
      box.localToGlobal(Offset.zero, ancestor: overlay),
      box.localToGlobal(box.size.bottomRight(Offset.zero), ancestor: overlay),
    );

    final selected = await showMenu<String>(
      context: context,
      color: const Color(0xFF0E1730),
      surfaceTintColor: Colors.transparent,
      position: RelativeRect.fromRect(rect, Offset.zero & overlay.size),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(color: Colors.white.withValues(alpha: 0.08)),
      ),
      items: entries
          .map(
            (item) => PopupMenuItem<String>(
              value: item.id,
              child: Text(
                item.label,
                style: TextStyle(
                  color: item.danger
                      ? const Color(0xFFF87171)
                      : const Color(0xFFE5E7EB),
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          )
          .toList(),
    );

    if (!mounted || selected == null) return;
    switch (selected) {
      case 'editReel':
        return widget.onMenuAction(PostMenuAction.editPost);
      case 'editVisibility':
        return widget.onMenuAction(PostMenuAction.editVisibility);
      case 'toggleComments':
        return widget.onMenuAction(PostMenuAction.toggleComments);
      case 'toggleHideLike':
        return widget.onMenuAction(PostMenuAction.toggleHideLike);
      case 'copyLink':
        return widget.onMenuAction(PostMenuAction.copyLink);
      case 'downloadReel':
        return widget.onDownloadReel();
      case 'deleteReel':
        return widget.onMenuAction(PostMenuAction.deletePost);
      case 'followToggle':
        return widget.onMenuAction(PostMenuAction.followToggle);
      case 'saveToggle':
        return widget.onMenuAction(PostMenuAction.saveToggle);
      case 'hideReel':
        return widget.onMenuAction(PostMenuAction.hidePost);
      case 'reportReel':
        return widget.onMenuAction(PostMenuAction.reportPost);
      case 'blockAccount':
        return widget.onMenuAction(PostMenuAction.blockAccount);
    }
  }

  @override
  Widget build(BuildContext context) {
    final ctrl = widget.controller;
    final reel = widget.state.post;
    final isOwn =
        widget.viewerId != null &&
        widget.viewerId!.isNotEmpty &&
        (reel.authorId == widget.viewerId ||
            reel.author?.id == widget.viewerId);
    final authorId = reel.authorId ?? reel.author?.id ?? '';
    final hideLikesForViewer = (reel.hideLikeCount == true) && !isOwn;
    final commentsLocked = reel.allowComments == false;
    final repostUsername =
        reel.repostOfAuthor?.username ?? reel.repostOfAuthorUsername;

    return GestureDetector(
      onTap: _handleTap,
      behavior: HitTestBehavior.opaque,
      child: Stack(
        fit: StackFit.expand,
        children: [
          // ── Video background ────────────────────────────────────────────────
          const ColoredBox(color: Colors.black),
          if (ctrl != null && ctrl.value.isInitialized)
            Center(
              child: AspectRatio(
                aspectRatio: ctrl.value.aspectRatio,
                child: VideoPlayer(ctrl),
              ),
            ),

          // ── Initializing / empty state ──────────────────────────────────────
          if (ctrl == null || !ctrl.value.isInitialized)
            Center(
              child: Icon(
                Icons.smart_display_outlined,
                size: 72,
                color: Colors.white.withValues(alpha: 0.15),
              ),
            ),
          if (ctrl != null && !ctrl.value.isInitialized)
            const Center(
              child: CircularProgressIndicator(
                strokeWidth: 2,
                color: Colors.white54,
              ),
            ),

          // ── Pause icon flash ────────────────────────────────────────────────
          if (_showPauseIcon)
            Center(
              child: Container(
                padding: const EdgeInsets.all(18),
                decoration: BoxDecoration(
                  color: Colors.black.withValues(alpha: 0.45),
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.pause_rounded,
                  size: 48,
                  color: Colors.white,
                ),
              ),
            ),

          // ── Bottom gradient overlay ─────────────────────────────────────────
          Positioned(
            bottom: 0,
            left: 0,
            right: 0,
            height: 300,
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Colors.transparent,
                    Colors.black.withValues(alpha: 0.85),
                  ],
                ),
              ),
            ),
          ),

          // ── Bottom-left: author + caption ───────────────────────────────────
          Positioned(
            bottom: 28 + MediaQuery.of(context).viewPadding.bottom,
            left: 16,
            right: 88,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                if (reel.repostOf != null && reel.repostOf!.isNotEmpty) ...[
                  Row(
                    children: [
                      const Icon(
                        Icons.repeat_rounded,
                        size: 14,
                        color: Color(0xFF7A8BB0),
                      ),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          repostUsername != null && repostUsername.isNotEmpty
                              ? 'Reposted from @$repostUsername'
                              : 'Reposted',
                          style: const TextStyle(
                            color: Color(0xFF9FB0CC),
                            fontSize: 12,
                            shadows: [
                              Shadow(blurRadius: 4, color: Colors.black54),
                            ],
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                ],
                // Author row
                Row(
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: [
                    _AuthorAvatar(
                      avatarUrl: reel.avatarUrl,
                      displayName: reel.displayName,
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Row(
                            children: [
                              Flexible(
                                child: Text(
                                  reel.displayName,
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontWeight: FontWeight.w700,
                                    fontSize: 14,
                                  ),
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                              if (reel.isVerified) ...[
                                const SizedBox(width: 4),
                                const Icon(
                                  Icons.verified_rounded,
                                  size: 14,
                                  color: Color(0xFF4AA3E4),
                                ),
                              ],
                            ],
                          ),
                          if (reel.username.isNotEmpty)
                            Text(
                              reel.username,
                              style: const TextStyle(
                                color: Colors.white70,
                                fontSize: 12,
                              ),
                            ),
                        ],
                      ),
                    ),
                    // Follow button (only for other users' reels)
                    if (!isOwn && authorId.isNotEmpty) ...[
                      const SizedBox(width: 8),
                      GestureDetector(
                        onTap: widget.onFollow,
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 14,
                            vertical: 6,
                          ),
                          decoration: BoxDecoration(
                            border: Border.all(
                              color: widget.state.following
                                  ? Colors.white54
                                  : Colors.white,
                              width: 1.5,
                            ),
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: Text(
                            widget.state.following ? 'Following' : 'Follow',
                            style: const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.w600,
                              fontSize: 12,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ],
                ),

                // Caption
                if (reel.content.isNotEmpty) ...[
                  const SizedBox(height: 10),
                  _ExpandableCaption(text: reel.content),
                ],
                if (reel.location != null &&
                    reel.location!.trim().isNotEmpty) ...[
                  const SizedBox(height: 8),
                  GestureDetector(
                    onTap: () async {
                      final q = Uri.encodeQueryComponent(reel.location!.trim());
                      final uri = Uri.parse(
                        'https://www.google.com/maps/search/?api=1&query=$q',
                      );
                      await launchUrl(
                        uri,
                        mode: LaunchMode.externalApplication,
                      );
                    },
                    child: Row(
                      children: [
                        const Icon(
                          Icons.place_outlined,
                          size: 14,
                          color: Color(0xFF9FB0CC),
                        ),
                        const SizedBox(width: 4),
                        Expanded(
                          child: Text(
                            reel.location!,
                            style: const TextStyle(
                              color: Color(0xFFCDD5E0),
                              fontSize: 12,
                              shadows: [
                                Shadow(blurRadius: 4, color: Colors.black54),
                              ],
                            ),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
                if (reel.hashtags.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 6,
                    runSpacing: 4,
                    children: reel.hashtags.map((tag) {
                      final label = tag.startsWith('#') ? tag : '#$tag';
                      return Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 3,
                        ),
                        decoration: BoxDecoration(
                          color: const Color(
                            0xFF4AA3E4,
                          ).withValues(alpha: 0.18),
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Text(
                          label,
                          style: const TextStyle(
                            color: Color(0xFFE8F3FF),
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      );
                    }).toList(),
                  ),
                ],
              ],
            ),
          ),

          // ── Menu button (top-right) ───────────────────────────────────────
          Positioned(
            top: MediaQuery.of(context).padding.top + 12,
            right: 12,
            child: Builder(
              builder: (menuCtx) => GestureDetector(
                onTap: () => _openReelMenu(menuCtx),
                child: Container(
                  width: 34,
                  height: 34,
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.45),
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: Colors.white.withValues(alpha: 0.18),
                    ),
                  ),
                  child: const Icon(
                    Icons.more_horiz_rounded,
                    color: Colors.white,
                    size: 20,
                  ),
                ),
              ),
            ),
          ),

          // ── Right sidebar: action buttons ───────────────────────────────────
          Positioned(
            bottom: 28 + MediaQuery.of(context).viewPadding.bottom,
            right: 8,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                // Like
                _ActionButton(
                  icon: widget.state.liked
                      ? Icons.favorite_rounded
                      : Icons.favorite_border_rounded,
                  color: Colors.white,
                  label: hideLikesForViewer
                      ? ''
                      : _formatCount(widget.state.stats.hearts),
                  onTap: widget.onLike,
                ),
                const SizedBox(height: 20),
                // Comment
                _ActionButton(
                  icon: Icons.mode_comment_outlined,
                  color: commentsLocked ? Colors.white54 : Colors.white,
                  label: commentsLocked
                      ? 'Off'
                      : _formatCount(widget.state.stats.comments),
                  onTap: commentsLocked ? () {} : widget.onComment,
                ),
                const SizedBox(height: 20),
                // Save
                _ActionButton(
                  icon: widget.state.saved
                      ? Icons.bookmark_rounded
                      : Icons.bookmark_border_rounded,
                  color: Colors.white,
                  label: _formatCount(widget.state.stats.saves),
                  onTap: widget.onSave,
                ),
                const SizedBox(height: 20),
              ],
            ),
          ),

          // ── Volume control (top-left) ─────────────────────────────────────
          Positioned(
            top: MediaQuery.of(context).padding.top + 12,
            left: 12,
            child: _VolumeControl(
              muted: widget.muted,
              onToggle: widget.onMuteToggle,
            ),
          ),

          // ── Video progress bar (bottom edge) ────────────────────────────────
          if (ctrl != null)
            Positioned(
              bottom: 0,
              left: 0,
              right: 0,
              child: _VideoProgressBar(
                controller: ctrl,
                expectedDurationMs: reel.primaryVideoDurationMs,
              ),
            ),
        ],
      ),
    );
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

String _formatCount(int count) {
  if (count >= 1000000) return '${(count / 1000000).toStringAsFixed(1)}M';
  if (count >= 1000) return '${(count / 1000).toStringAsFixed(1)}K';
  return '$count';
}

class _AuthorAvatar extends StatelessWidget {
  const _AuthorAvatar({required this.avatarUrl, required this.displayName});

  final String? avatarUrl;
  final String displayName;

  @override
  Widget build(BuildContext context) {
    final initial = displayName.isNotEmpty
        ? displayName.substring(0, 1).toUpperCase()
        : 'U';
    return CircleAvatar(
      radius: 18,
      backgroundColor: const Color(0xFF1E2D48),
      backgroundImage: avatarUrl?.isNotEmpty == true
          ? NetworkImage(avatarUrl!)
          : null,
      child: avatarUrl?.isNotEmpty != true
          ? Text(
              initial,
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w700,
                fontSize: 13,
              ),
            )
          : null,
    );
  }
}

class _ExpandableCaption extends StatefulWidget {
  const _ExpandableCaption({required this.text});

  final String text;

  @override
  State<_ExpandableCaption> createState() => _ExpandableCaptionState();
}

class _ExpandableCaptionState extends State<_ExpandableCaption> {
  bool _expanded = false;

  static const _style = TextStyle(
    color: Colors.white,
    fontSize: 13,
    height: 1.4,
    shadows: [Shadow(blurRadius: 4, color: Colors.black54)],
  );
  static const _moreStyle = TextStyle(
    color: Colors.white70,
    fontSize: 13,
    fontWeight: FontWeight.w600,
    shadows: [Shadow(blurRadius: 4, color: Colors.black54)],
  );
  static const int _kMaxLines = 3;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final tp = TextPainter(
          text: TextSpan(text: widget.text, style: _style),
          textDirection: TextDirection.ltr,
          maxLines: _kMaxLines,
        )..layout(maxWidth: constraints.maxWidth);
        final overflows = tp.didExceedMaxLines;

        if (!overflows && !_expanded) {
          return Text(widget.text, style: _style);
        }

        if (_expanded) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(widget.text, style: _style),
              GestureDetector(
                onTap: () => setState(() => _expanded = false),
                child: const Padding(
                  padding: EdgeInsets.only(top: 3),
                  child: Text('see less', style: _moreStyle),
                ),
              ),
            ],
          );
        }

        // Overflows and collapsed
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              widget.text,
              style: _style,
              maxLines: _kMaxLines,
              overflow: TextOverflow.ellipsis,
            ),
            GestureDetector(
              onTap: () => setState(() => _expanded = true),
              child: const Padding(
                padding: EdgeInsets.only(top: 3),
                child: Text('see more', style: _moreStyle),
              ),
            ),
          ],
        );
      },
    );
  }
}

class _ActionButton extends StatelessWidget {
  const _ActionButton({
    required this.icon,
    required this.color,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final Color color;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, color: color, size: 30),
          if (label.isNotEmpty) ...[
            const SizedBox(height: 3),
            Text(
              label,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 12,
                fontWeight: FontWeight.w600,
                shadows: [Shadow(blurRadius: 4, color: Colors.black54)],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

// ── Volume control (top-left toggle) ─────────────────────────────────────────

class _VolumeControl extends StatelessWidget {
  const _VolumeControl({required this.muted, required this.onToggle});
  final bool muted;
  final VoidCallback onToggle;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onToggle,
      child: Container(
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(
          color: Colors.black.withValues(alpha: 0.45),
          shape: BoxShape.circle,
        ),
        child: Icon(
          muted ? Icons.volume_off_rounded : Icons.volume_up_rounded,
          color: Colors.white,
          size: 22,
        ),
      ),
    );
  }
}

// ── Seekable progress bar ─────────────────────────────────────────────────────

class _VideoProgressBar extends StatefulWidget {
  const _VideoProgressBar({required this.controller, this.expectedDurationMs});
  final VideoPlayerController controller;
  final int? expectedDurationMs;
  @override
  State<_VideoProgressBar> createState() => _VideoProgressBarState();
}

class _VideoProgressBarState extends State<_VideoProgressBar> {
  // Mirror of web's "timeupdate" listener: fires on every position tick
  void _onUpdate() {
    if (mounted) setState(() {});
  }

  @override
  void initState() {
    super.initState();
    widget.controller.addListener(_onUpdate);
  }

  @override
  void didUpdateWidget(_VideoProgressBar old) {
    super.didUpdateWidget(old);
    if (old.controller != widget.controller) {
      old.controller.removeListener(_onUpdate);
      widget.controller.addListener(_onUpdate);
    }
  }

  @override
  void dispose() {
    widget.controller.removeListener(_onUpdate);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final value = widget.controller.value;
    final posMs = value.position.inMilliseconds;
    final nativeDurMs = value.duration.inMilliseconds;

    int? expectedMs;
    if (widget.expectedDurationMs != null && widget.expectedDurationMs! > 0) {
      expectedMs = widget.expectedDurationMs! < 1000
          ? widget.expectedDurationMs! * 1000
          : widget.expectedDurationMs!;
    }

    var effectiveDurMs = nativeDurMs;
    if (expectedMs != null &&
        (effectiveDurMs <= 0 ||
            effectiveDurMs < 1000 ||
            effectiveDurMs < (expectedMs * 0.2) ||
            effectiveDurMs < posMs)) {
      effectiveDurMs = expectedMs;
    }

    // Mirror of web: `const percent = duration ? ... : 0`
    // Show thin placeholder until duration is known (equivalent to loadedmetadata)
    if (!value.isInitialized || effectiveDurMs <= 1000) {
      return Container(height: 3, color: Colors.white12);
    }

    final progress = (posMs / effectiveDurMs).clamp(0.0, 1.0);

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        SliderTheme(
          data: SliderTheme.of(context).copyWith(
            trackHeight: 2.5,
            thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 5),
            overlayShape: const RoundSliderOverlayShape(overlayRadius: 12),
            activeTrackColor: const Color(0xFF4AA3E4),
            inactiveTrackColor: Colors.white24,
            thumbColor: Colors.white,
            overlayColor: Colors.white24,
            trackShape: const RectangularSliderTrackShape(),
          ),
          child: Slider(
            value: progress,
            min: 0.0,
            max: 1.0,
            onChanged: (v) {
              final ms = (v * effectiveDurMs).round();
              widget.controller.seekTo(Duration(milliseconds: ms));
            },
          ),
        ),
      ],
    );
  }
}

// ── Local helpers mirroring post_detail_screen private types ──────────────────

class _RCommentMediaData {
  const _RCommentMediaData({
    required this.type,
    this.url,
    this.file,
    this.metadata,
  });
  final String type;
  final String? url;
  final XFile? file;
  final Map<String, dynamic>? metadata;
}

class _RReplyTarget {
  const _RReplyTarget({required this.id, this.username});
  final String id;
  final String? username;
}

/// Public wrapper so other screens can reuse the exact reels comment UI.
class ReelCommentSheet extends StatelessWidget {
  const ReelCommentSheet({
    super.key,
    required this.postId,
    this.viewerId,
    this.postAuthorId,
    this.allowComments = true,
    this.onCommentAdded,
  });

  final String postId;
  final String? viewerId;
  final String? postAuthorId;
  final bool allowComments;
  final VoidCallback? onCommentAdded;

  @override
  Widget build(BuildContext context) {
    return _ReelCommentSheet(
      postId: postId,
      viewerId: viewerId,
      postAuthorId: postAuthorId,
      allowComments: allowComments,
      onCommentAdded: onCommentAdded,
    );
  }
}

// ── Comment sheet ─────────────────────────────────────────────────────────────

class _ReelCommentSheet extends StatefulWidget {
  const _ReelCommentSheet({
    required this.postId,
    this.viewerId,
    this.postAuthorId,
    this.allowComments = true,
    this.onCommentAdded,
  });

  final String postId;
  final String? viewerId;
  final String? postAuthorId;
  final bool allowComments;
  final VoidCallback? onCommentAdded;

  @override
  State<_ReelCommentSheet> createState() => _ReelCommentSheetState();
}

class _ReelCommentSheetState extends State<_ReelCommentSheet> {
  final List<CommentItem> _comments = [];
  final ScrollController _scrollCtrl = ScrollController();
  final Map<String, GlobalKey<_RCommentTileState>> _allTileKeys = {};

  int _page = 1;
  static const int _kPageSize = 20;
  bool _loading = false;
  bool _hasMore = true;

  _RReplyTarget? _replyTarget;

  // ── Polling ────────────────────────────────────────────────────────────────
  Timer? _pollTimer;
  static const Duration _kPollInterval = Duration(seconds: 4);

  static Map<String, String> get _authHeader => {
    'Authorization': 'Bearer ${AuthStorage.accessToken}',
  };

  @override
  void initState() {
    super.initState();
    _loadComments();
    _scrollCtrl.addListener(_onScroll);
    _startPolling();
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    _scrollCtrl.dispose();
    super.dispose();
  }

  void _startPolling() {
    _pollTimer?.cancel();
    _pollTimer = Timer.periodic(_kPollInterval, (_) => _syncComments());
  }

  Future<void> _syncComments() async {
    if (_comments.isEmpty) return;
    try {
      final data = await ApiService.get(
        '/posts/${widget.postId}/comments?page=1&limit=$_kPageSize',
        extraHeaders: _authHeader,
      );
      if (!mounted) return;
      final rawItems = data['items'];
      final List<CommentItem> fresh = rawItems is List
          ? rawItems
                .whereType<Map<String, dynamic>>()
                .map(CommentItem.fromJson)
                .toList()
          : [];
      if (!mounted) return;
      setState(() {
        for (final c in _comments) {
          final updated = fresh.firstWhere(
            (f) => f.id == c.id,
            orElse: () => c,
          );
          if (updated.id == c.id) c.likesCount = updated.likesCount;
        }
      });
    } catch (_) {}
  }

  void _onScroll() {
    if (_scrollCtrl.position.pixels >=
        _scrollCtrl.position.maxScrollExtent - 300) {
      if (!_loading && _hasMore) _loadComments();
    }
  }

  Future<void> _loadComments({bool refresh = false}) async {
    if (_loading) return;
    setState(() {
      _loading = true;
      if (refresh) {
        _comments.clear();
        _page = 1;
        _hasMore = true;
      }
    });
    try {
      final data = await ApiService.get(
        '/posts/${widget.postId}/comments?page=$_page&limit=$_kPageSize',
        extraHeaders: _authHeader,
      );
      if (!mounted) return;
      final rawItems = data['items'];
      final List<CommentItem> incoming = rawItems is List
          ? rawItems
                .whereType<Map<String, dynamic>>()
                .map(CommentItem.fromJson)
                .toList()
          : [];
      setState(() {
        _comments.addAll(incoming);
        _hasMore = data['hasMore'] == true;
        _page++;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _loading = false);
    }
  }

  void _onCommentPinToggled(String commentId, bool shouldPin) {
    setState(() {
      final now = DateTime.now().toIso8601String();
      for (final c in _comments) {
        if (c.id == commentId) {
          c.pinnedAt = shouldPin ? now : null;
        } else if (shouldPin) {
          c.pinnedAt = null;
        }
      }
      _comments.sort((a, b) {
        if (a.pinnedAt != null && b.pinnedAt == null) return -1;
        if (a.pinnedAt == null && b.pinnedAt != null) return 1;
        return 0;
      });
    });
  }

  Future<void> _onCommentSubmit({
    required String content,
    _RCommentMediaData? media,
    String? parentId,
  }) async {
    if (!widget.allowComments) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Comments are turned off for this reel'),
          backgroundColor: Color(0xFF1A2235),
        ),
      );
      return;
    }

    Map<String, dynamic>? mediaJson;
    if (media != null) {
      if (media.file != null) {
        final uploaded = await ApiService.postMultipart(
          '/posts/${widget.postId}/comments/upload',
          fieldName: 'file',
          filePath: media.file!.path,
          contentType:
              media.file!.mimeType ??
              (media.type == 'video' ? 'video/mp4' : 'image/jpeg'),
          extraHeaders: _authHeader,
        );
        mediaJson = {
          'type': media.type,
          'url': (uploaded['secureUrl'] ?? uploaded['url']) as String?,
        };
      } else {
        mediaJson = {
          'type': media.type,
          'url': media.url,
          if (media.metadata != null) 'metadata': media.metadata,
        };
      }
    }
    final body = <String, dynamic>{
      if (content.isNotEmpty) 'content': content,
      if (mediaJson != null) 'media': mediaJson,
      if (parentId != null) 'parentId': parentId,
    };
    final result = await ApiService.post(
      '/posts/${widget.postId}/comments',
      body: body,
      extraHeaders: _authHeader,
    );
    final newComment = CommentItem.fromJson(result);
    if (!mounted) return;
    setState(() {
      if (parentId == null) _comments.add(newComment);
      _replyTarget = null;
    });
    if (parentId != null) {
      _allTileKeys[parentId]?.currentState?.addReply(newComment);
    }
    widget.onCommentAdded?.call();
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: 0.75,
      minChildSize: 0.4,
      maxChildSize: 0.95,
      snap: true,
      builder: (context, sheetScrollController) {
        return Container(
          decoration: const BoxDecoration(
            color: Color(0xFF111827),
            borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
          ),
          child: Column(
            children: [
              // Drag handle
              const SizedBox(height: 10),
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: const Color(0xFF3A4A66),
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 12),
              // Header
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    'Comments',
                    style: const TextStyle(
                      color: Color(0xFFE8ECF8),
                      fontWeight: FontWeight.w700,
                      fontSize: 15,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 10),
              Container(height: 1, color: Colors.white.withValues(alpha: 0.06)),

              // Comment list
              Expanded(
                child: _comments.isEmpty && !_loading
                    ? const Center(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(
                              Icons.chat_bubble_outline_rounded,
                              size: 40,
                              color: Color(0xFF4A5568),
                            ),
                            SizedBox(height: 10),
                            Text(
                              'No comments yet.',
                              style: TextStyle(
                                color: Color(0xFF7A8BB0),
                                fontSize: 14,
                              ),
                            ),
                          ],
                        ),
                      )
                    : ListView.builder(
                        controller: _scrollCtrl,
                        padding: const EdgeInsets.only(top: 4, bottom: 8),
                        itemCount: _comments.length + (_loading ? 1 : 0),
                        itemBuilder: (context, i) {
                          if (i == _comments.length) {
                            return const Padding(
                              padding: EdgeInsets.symmetric(vertical: 20),
                              child: Center(
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Color(0xFF4AA3E4),
                                ),
                              ),
                            );
                          }
                          final c = _comments[i];
                          final tileKey = _allTileKeys.putIfAbsent(
                            c.id,
                            () => GlobalKey<_RCommentTileState>(),
                          );
                          return _RCommentTile(
                            key: tileKey,
                            comment: c,
                            postId: widget.postId,
                            authHeader: _authHeader,
                            allTileKeys: _allTileKeys,
                            viewerId: widget.viewerId,
                            postAuthorId: widget.postAuthorId,
                            onDeleted: () => setState(
                              () =>
                                  _comments.removeWhere((cm) => cm.id == c.id),
                            ),
                            onReply: (id, username) => setState(
                              () => _replyTarget = _RReplyTarget(
                                id: id,
                                username: username,
                              ),
                            ),
                            onPinToggled: _onCommentPinToggled,
                          );
                        },
                      ),
              ),

              // Input bar
              if (widget.allowComments)
                _RCommentInputBar(
                  onSubmit: _onCommentSubmit,
                  replyTarget: _replyTarget,
                  onCancelReply: () => setState(() => _replyTarget = null),
                )
              else
                Container(
                  width: double.infinity,
                  color: const Color(0xFF0D1526),
                  padding: EdgeInsets.fromLTRB(
                    16,
                    12,
                    16,
                    12 + MediaQuery.of(context).viewPadding.bottom,
                  ),
                  child: const Text(
                    'Comments are turned off for this reel.',
                    style: TextStyle(color: Color(0xFF7A8BB0), fontSize: 13),
                    textAlign: TextAlign.center,
                  ),
                ),
            ],
          ),
        );
      },
    );
  }
}

// ── Comment tile ──────────────────────────────────────────────────────────────

class _RCommentTile extends StatefulWidget {
  const _RCommentTile({
    super.key,
    required this.comment,
    required this.postId,
    required this.authHeader,
    required this.allTileKeys,
    this.viewerId,
    this.postAuthorId,
    this.onDeleted,
    this.onReply,
    this.onPinToggled,
    this.depth = 0,
  });
  final CommentItem comment;
  final String postId;
  final Map<String, String> authHeader;
  final Map<String, GlobalKey<_RCommentTileState>> allTileKeys;
  final String? viewerId;
  final String? postAuthorId;
  final VoidCallback? onDeleted;
  final void Function(String id, String? username)? onReply;
  final void Function(String commentId, bool pinned)? onPinToggled;
  final int depth;

  @override
  State<_RCommentTile> createState() => _RCommentTileState();
}

class _RCommentTileState extends State<_RCommentTile> {
  List<CommentItem> _replies = [];
  int _replyPage = 1;
  bool _hasMore = false;
  bool _loading = false;
  bool _expanded = false;
  bool _textExpanded = false;
  String? _error;
  late bool _liked;
  late int _likesCount;
  late String _content;
  final List<TapGestureRecognizer> _urlRecognizers = [];

  static final _urlRegex = RegExp(
    "https?://[^\\s<>()\\[\\]{}\"']+",
    caseSensitive: false,
  );
  static String _stripTrailing(String url) =>
      url.replaceAll(RegExp(r'[),.;!?]+$'), '');

  List<InlineSpan> _buildContentSpans(String text) {
    for (final r in _urlRecognizers) {
      r.dispose();
    }
    _urlRecognizers.clear();
    const baseStyle = TextStyle(
      color: Color(0xFFCDD5E0),
      fontSize: 14,
      height: 1.45,
    );
    const urlStyle = TextStyle(
      color: Color(0xFF60A5FA),
      fontSize: 14,
      height: 1.45,
      decoration: TextDecoration.underline,
      decorationColor: Color(0xFF60A5FA),
    );
    final spans = <InlineSpan>[];
    int lastEnd = 0;
    for (final match in _urlRegex.allMatches(text)) {
      final rawUrl = match.group(0)!;
      final stripped = _stripTrailing(rawUrl);
      final trailingPunct = rawUrl.substring(stripped.length);
      if (match.start > lastEnd) {
        spans.add(
          TextSpan(
            text: text.substring(lastEnd, match.start),
            style: baseStyle,
          ),
        );
      }
      final rec = TapGestureRecognizer()
        ..onTap = () => launchUrl(
          Uri.parse(stripped),
          mode: LaunchMode.externalApplication,
        );
      _urlRecognizers.add(rec);
      spans.add(TextSpan(text: stripped, style: urlStyle, recognizer: rec));
      if (trailingPunct.isNotEmpty) {
        spans.add(TextSpan(text: trailingPunct, style: baseStyle));
      }
      lastEnd = match.end;
    }
    if (lastEnd < text.length) {
      spans.add(TextSpan(text: text.substring(lastEnd), style: baseStyle));
    }
    if (spans.isEmpty) spans.add(TextSpan(text: text, style: baseStyle));
    return spans;
  }

  @override
  void initState() {
    super.initState();
    _liked = widget.comment.liked;
    _likesCount = widget.comment.likesCount ?? 0;
    _content = widget.comment.content;
  }

  @override
  void dispose() {
    for (final r in _urlRecognizers) {
      r.dispose();
    }
    super.dispose();
  }

  bool get _isOwnComment =>
      widget.viewerId != null &&
      (widget.comment.authorId == widget.viewerId ||
          widget.comment.author?.id == widget.viewerId);

  bool get _isPostAuthorComment =>
      widget.postAuthorId != null &&
      (widget.comment.authorId == widget.postAuthorId ||
          widget.comment.author?.id == widget.postAuthorId);

  bool get _isPostOwner =>
      widget.viewerId != null &&
      widget.postAuthorId != null &&
      widget.viewerId == widget.postAuthorId;

  void _openCommentAuthorProfile() {
    final uid = (widget.comment.author?.id?.isNotEmpty == true)
        ? widget.comment.author!.id!
        : (widget.comment.authorId ?? '');
    if (uid.isEmpty) return;
    Navigator.of(
      context,
    ).push(MaterialPageRoute<void>(builder: (_) => ProfileScreen(userId: uid)));
  }

  Future<void> _onPinComment() async {
    final isPinned = widget.comment.pinnedAt != null;
    widget.onPinToggled?.call(widget.comment.id, !isPinned);
    try {
      if (isPinned) {
        await ApiService.delete(
          '/posts/${widget.postId}/comments/${widget.comment.id}/pin',
          extraHeaders: widget.authHeader,
        );
      } else {
        await ApiService.post(
          '/posts/${widget.postId}/comments/${widget.comment.id}/pin',
          extraHeaders: widget.authHeader,
        );
      }
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(isPinned ? 'Comment unpinned' : 'Comment pinned'),
          backgroundColor: const Color(0xFF1A2235),
          duration: const Duration(seconds: 2),
        ),
      );
    } catch (_) {
      widget.onPinToggled?.call(widget.comment.id, isPinned);
    }
  }

  void _showCommentMenu() {
    final actions = <CommentSheetAction>[
      if (_isPostOwner && widget.depth == 0)
        CommentSheetAction(
          icon: Icons.push_pin_rounded,
          label: widget.comment.pinnedAt != null
              ? 'Unpin comment'
              : 'Pin comment',
          onTap: _onPinComment,
        ),
      if (_isOwnComment) ...[
        CommentSheetAction(
          icon: Icons.edit_outlined,
          label: 'Edit comment',
          onTap: _onEditComment,
        ),
        CommentSheetAction(
          icon: Icons.delete_outline_rounded,
          label: 'Delete comment',
          onTap: _onDeleteComment,
          danger: true,
        ),
      ] else ...[
        CommentSheetAction(
          icon: Icons.flag_outlined,
          label: 'Report comment',
          onTap: _onReportComment,
        ),
        CommentSheetAction(
          icon: Icons.block_rounded,
          label: 'Block this user',
          onTap: _onBlockUser,
          danger: true,
        ),
      ],
    ];

    showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (_) => CommentActionSheet(actions: actions),
    );
  }

  void _onEditComment() {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => EditCommentSheet(
        initialContent: _content,
        onSubmit: (newContent) async {
          await ApiService.patch(
            '/posts/${widget.postId}/comments/${widget.comment.id}',
            body: {'content': newContent},
            extraHeaders: widget.authHeader,
          );
          if (mounted) setState(() => _content = newContent);
        },
      ),
    );
  }

  Future<void> _onDeleteComment() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF111827),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        title: const Text(
          'Delete comment',
          style: TextStyle(color: Color(0xFFE8ECF8), fontSize: 16),
        ),
        content: const Text(
          'This will permanently delete your comment.',
          style: TextStyle(color: Color(0xFF7A8BB0), fontSize: 14),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text(
              'Cancel',
              style: TextStyle(color: Color(0xFF7A8BB0)),
            ),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text(
              'Delete',
              style: TextStyle(
                color: Color(0xFFEF4444),
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    try {
      await ApiService.delete(
        '/posts/${widget.postId}/comments/${widget.comment.id}',
        extraHeaders: widget.authHeader,
      );
      if (!mounted) return;
      widget.onDeleted?.call();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Comment deleted'),
          backgroundColor: Color(0xFF1A2235),
          duration: Duration(seconds: 2),
        ),
      );
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Failed to delete comment'),
          backgroundColor: Color(0xFFEF4444),
          duration: Duration(seconds: 2),
        ),
      );
    }
  }

  void _onReportComment() {
    showReportCommentSheet(
      context,
      commentId: widget.comment.id,
      authHeader: widget.authHeader,
    ).then((reported) {
      if (!reported || !mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Report submitted'),
          backgroundColor: Color(0xFF1A2235),
          duration: Duration(seconds: 2),
        ),
      );
    });
  }

  Future<void> _onBlockUser() async {
    final userId = widget.comment.author?.id ?? widget.comment.authorId;
    final username =
        widget.comment.author?.username ??
        widget.comment.author?.displayName ??
        'this user';
    if (userId == null) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF111827),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        title: Text(
          'Block $username?',
          style: const TextStyle(color: Color(0xFFE8ECF8), fontSize: 16),
        ),
        content: Text(
          'Blocking @$username will hide their content from you.',
          style: const TextStyle(color: Color(0xFF7A8BB0), fontSize: 14),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text(
              'Cancel',
              style: TextStyle(color: Color(0xFF7A8BB0)),
            ),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text(
              'Block',
              style: TextStyle(
                color: Color(0xFFEF4444),
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    try {
      await ApiService.post(
        '/users/$userId/block',
        extraHeaders: widget.authHeader,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Blocked $username'),
          backgroundColor: const Color(0xFF1A2235),
          duration: const Duration(seconds: 2),
        ),
      );
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Failed to block user'),
          backgroundColor: Color(0xFFEF4444),
          duration: Duration(seconds: 2),
        ),
      );
    }
  }

  Future<void> _onLikeComment() async {
    final wasLiked = _liked;
    setState(() {
      _liked = !wasLiked;
      _likesCount = (_likesCount + (wasLiked ? -1 : 1)).clamp(0, 999999999);
    });
    try {
      if (!wasLiked) {
        await ApiService.post(
          '/posts/${widget.postId}/comments/${widget.comment.id}/like',
          extraHeaders: widget.authHeader,
        );
      } else {
        await ApiService.delete(
          '/posts/${widget.postId}/comments/${widget.comment.id}/like',
          extraHeaders: widget.authHeader,
        );
      }
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _liked = wasLiked;
        _likesCount = (_likesCount + (wasLiked ? 1 : -1)).clamp(0, 999999999);
      });
    }
  }

  Future<void> _loadReplies({int nextPage = 1}) async {
    if (_loading) return;
    setState(() {
      _loading = true;
      _expanded = true;
    });
    try {
      final data = await ApiService.get(
        '/posts/${widget.postId}/comments'
        '?page=$nextPage&limit=10&parentId=${widget.comment.id}',
        extraHeaders: widget.authHeader,
      );
      if (!mounted) return;
      final rawItems = data['items'];
      final List<CommentItem> incoming = rawItems is List
          ? rawItems
                .whereType<Map<String, dynamic>>()
                .map(CommentItem.fromJson)
                .toList()
          : [];
      setState(() {
        if (nextPage > 1) {
          _replies.addAll(incoming);
        } else {
          _replies = incoming;
        }
        _hasMore = data['hasMore'] == true;
        _replyPage = nextPage;
        _loading = false;
        _error = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.toString();
      });
    }
  }

  void addReply(CommentItem reply) {
    setState(() {
      _replies = [..._replies, reply];
      _expanded = true;
    });
  }

  void _toggleReplies() {
    final nextExpanded = !_expanded;
    setState(() => _expanded = nextExpanded);
    if (nextExpanded) {
      final replyCount = widget.comment.repliesCount ?? 0;
      final needsRefresh =
          _replies.isEmpty ||
          (!_loading && (replyCount > _replies.length || _hasMore));
      if (!_loading && needsRefresh) _loadReplies(nextPage: 1);
    }
  }

  @override
  Widget build(BuildContext context) {
    final comment = widget.comment;
    final isPinned = comment.pinnedAt != null;
    final isReply = widget.depth > 0;
    final replyCount = comment.repliesCount ?? 0;
    final displayReplyCount = _replies.length > replyCount
        ? _replies.length
        : replyCount;
    final shouldShowRepliesButton =
        _loading || _hasMore || replyCount > 0 || _replies.isNotEmpty;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        GestureDetector(
          onLongPress: _showCommentMenu,
          behavior: HitTestBehavior.opaque,
          child: Padding(
            padding: EdgeInsets.fromLTRB(isReply ? 44 : 12, 0, 12, 0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const _RCommentDivider(),
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 10),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      GestureDetector(
                        onTap: _openCommentAuthorProfile,
                        child: _RCommentAvatar(comment: comment),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            // Header row: name + badges + time
                            Row(
                              children: [
                                GestureDetector(
                                  onTap: _openCommentAuthorProfile,
                                  child: Text(
                                    comment.displayUsername,
                                    style: const TextStyle(
                                      color: Color(0xFFE8ECF8),
                                      fontWeight: FontWeight.w700,
                                      fontSize: 13,
                                    ),
                                  ),
                                ),
                                if (comment.isVerified) ...[
                                  const SizedBox(width: 3),
                                  _RMiniVerifiedBadge(),
                                ],
                                if (_isPostAuthorComment) ...[
                                  const SizedBox(width: 5),
                                  const _RAuthorBadge(),
                                ],
                                const Spacer(),
                                if (isPinned) ...[
                                  const Icon(
                                    Icons.push_pin_rounded,
                                    size: 12,
                                    color: Color(0xFF7A8BB0),
                                  ),
                                  const SizedBox(width: 3),
                                  const Text(
                                    'Pinned',
                                    style: TextStyle(
                                      color: Color(0xFF7A8BB0),
                                      fontSize: 11,
                                    ),
                                  ),
                                  const SizedBox(width: 6),
                                ],
                                Text(
                                  _rTimeAgo(comment.createdAt),
                                  style: const TextStyle(
                                    color: Color(0xFF7A8BB0),
                                    fontSize: 11,
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 4),
                            // Content
                            if (_content.isNotEmpty)
                              LayoutBuilder(
                                builder: (context, constraints) {
                                  final tp = TextPainter(
                                    text: TextSpan(
                                      text: _content,
                                      style: const TextStyle(
                                        fontSize: 14,
                                        height: 1.45,
                                      ),
                                    ),
                                    textDirection: TextDirection.ltr,
                                    maxLines: 4,
                                  )..layout(maxWidth: constraints.maxWidth);
                                  final overflows = tp.didExceedMaxLines;
                                  return Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      RichText(
                                        text: TextSpan(
                                          children: _buildContentSpans(
                                            _content,
                                          ),
                                        ),
                                        maxLines: _textExpanded ? null : 4,
                                        overflow: _textExpanded
                                            ? TextOverflow.visible
                                            : TextOverflow.ellipsis,
                                      ),
                                      if (overflows || _textExpanded)
                                        GestureDetector(
                                          onTap: () => setState(
                                            () =>
                                                _textExpanded = !_textExpanded,
                                          ),
                                          child: Padding(
                                            padding: const EdgeInsets.only(
                                              top: 2,
                                            ),
                                            child: Text(
                                              _textExpanded
                                                  ? 'See less'
                                                  : 'See more',
                                              style: const TextStyle(
                                                color: Color(0xFF4AA3E4),
                                                fontSize: 13,
                                                fontWeight: FontWeight.w600,
                                              ),
                                            ),
                                          ),
                                        ),
                                    ],
                                  );
                                },
                              ),
                            // Media
                            if (comment.mediaUrl != null &&
                                comment.mediaUrl!.isNotEmpty) ...[
                              const SizedBox(height: 6),
                              _RCommentMedia(
                                url: comment.mediaUrl!,
                                type: comment.mediaType ?? 'image',
                              ),
                            ],
                            // Link previews
                            if (comment.linkPreviews.isNotEmpty) ...[
                              const SizedBox(height: 8),
                              _RLinkPreviewList(previews: comment.linkPreviews),
                            ],
                            const SizedBox(height: 6),
                            // Footer: likes + reply
                            Row(
                              children: [
                                GestureDetector(
                                  onTap: _onLikeComment,
                                  child: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      _RIconLike(
                                        size: 16,
                                        filled: _liked,
                                        color: _liked
                                            ? const Color(0xFF2b74b0)
                                            : const Color(0xFF7A8BB0),
                                      ),
                                      const SizedBox(width: 3),
                                      Text(
                                        '$_likesCount',
                                        style: TextStyle(
                                          color: _liked
                                              ? const Color(0xFF2b74b0)
                                              : const Color(0xFF7A8BB0),
                                          fontSize: 12,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                const SizedBox(width: 14),
                                GestureDetector(
                                  onTap: () => widget.onReply?.call(
                                    comment.id,
                                    comment.author?.username,
                                  ),
                                  child: const Text(
                                    'Reply',
                                    style: TextStyle(
                                      color: Color(0xFF7A8BB0),
                                      fontSize: 12,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                            // Replies toggle
                            if (shouldShowRepliesButton) ...[
                              const SizedBox(height: 7),
                              GestureDetector(
                                onTap: _loading ? null : _toggleReplies,
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Container(
                                      width: 20,
                                      height: 1,
                                      color: const Color(0xFF4A5568),
                                    ),
                                    const SizedBox(width: 7),
                                    if (_loading && _replies.isEmpty)
                                      const SizedBox(
                                        width: 12,
                                        height: 12,
                                        child: CircularProgressIndicator(
                                          strokeWidth: 1.5,
                                          color: Color(0xFF4AA3E4),
                                        ),
                                      )
                                    else
                                      Text(
                                        _expanded
                                            ? 'Hide replies'
                                            : 'View replies'
                                                  '${displayReplyCount > 0 ? " ($displayReplyCount)" : ""}',
                                        style: const TextStyle(
                                          color: Color(0xFF4AA3E4),
                                          fontSize: 12,
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                  ],
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
        // Replies
        if (_expanded) ...[
          ..._replies.map((r) {
            final tileKey = widget.allTileKeys.putIfAbsent(
              r.id,
              () => GlobalKey<_RCommentTileState>(),
            );
            return _RCommentTile(
              key: tileKey,
              comment: r,
              postId: widget.postId,
              authHeader: widget.authHeader,
              depth: widget.depth + 1,
              allTileKeys: widget.allTileKeys,
              viewerId: widget.viewerId,
              postAuthorId: widget.postAuthorId,
              onDeleted: () =>
                  setState(() => _replies.removeWhere((rep) => rep.id == r.id)),
              onReply: widget.onReply,
              onPinToggled: widget.onPinToggled,
            );
          }),
          if (_hasMore)
            Padding(
              padding: const EdgeInsets.fromLTRB(44, 2, 12, 6),
              child: GestureDetector(
                onTap: _loading
                    ? null
                    : () => _loadReplies(nextPage: _replyPage + 1),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 20,
                      height: 1,
                      color: const Color(0xFF4A5568),
                    ),
                    const SizedBox(width: 7),
                    _loading
                        ? const SizedBox(
                            width: 12,
                            height: 12,
                            child: CircularProgressIndicator(
                              strokeWidth: 1.5,
                              color: Color(0xFF4AA3E4),
                            ),
                          )
                        : const Text(
                            'Load more replies',
                            style: TextStyle(
                              color: Color(0xFF4AA3E4),
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                  ],
                ),
              ),
            ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(44, 2, 12, 6),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      _error!,
                      style: const TextStyle(
                        color: Color(0xFFEF4444),
                        fontSize: 11,
                      ),
                    ),
                  ),
                  GestureDetector(
                    onTap: () => _loadReplies(nextPage: 1),
                    child: const Text(
                      'Retry',
                      style: TextStyle(
                        color: Color(0xFF4AA3E4),
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
            ),
        ],
      ],
    );
  }
}

// ── Comment input bar ─────────────────────────────────────────────────────────

class _RCommentInputBar extends StatefulWidget {
  const _RCommentInputBar({
    required this.onSubmit,
    this.replyTarget,
    this.onCancelReply,
  });

  final Future<void> Function({
    required String content,
    _RCommentMediaData? media,
    String? parentId,
  })
  onSubmit;
  final _RReplyTarget? replyTarget;
  final VoidCallback? onCancelReply;

  @override
  State<_RCommentInputBar> createState() => _RCommentInputBarState();
}

class _RCommentInputBarState extends State<_RCommentInputBar> {
  final _textCtrl = TextEditingController();
  final _focusNode = FocusNode();
  _RCommentMediaData? _media;
  bool _sending = false;

  @override
  void didUpdateWidget(_RCommentInputBar old) {
    super.didUpdateWidget(old);
    if (widget.replyTarget != null && old.replyTarget == null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _focusNode.requestFocus();
      });
    }
  }

  @override
  void dispose() {
    _textCtrl.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  Future<void> _pickMedia() async {
    final picker = ImagePicker();
    final picked = await picker.pickMedia();
    if (picked == null || !mounted) return;
    final isVideo =
        picked.mimeType?.startsWith('video/') == true ||
        picked.path.toLowerCase().endsWith('.mp4') ||
        picked.path.toLowerCase().endsWith('.mov');
    setState(() {
      _media = _RCommentMediaData(
        type: isVideo ? 'video' : 'image',
        file: picked,
      );
    });
  }

  Future<void> _openGiphy(String mode) async {
    final result = await showModalBottomSheet<_RCommentMediaData>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _RGiphyPickerSheet(mode: mode),
    );
    if (result != null && mounted) setState(() => _media = result);
  }

  Future<void> _send() async {
    final text = _textCtrl.text.trim();
    if (text.isEmpty && _media == null) return;
    if (_sending) return;
    setState(() => _sending = true);
    try {
      await widget.onSubmit(
        content: text,
        media: _media,
        parentId: widget.replyTarget?.id,
      );
      if (!mounted) return;
      _textCtrl.clear();
      setState(() {
        _media = null;
        _sending = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _sending = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Failed to post comment: $e'),
          backgroundColor: const Color(0xFF1A2235),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;
    final hasContent = _textCtrl.text.trim().isNotEmpty || _media != null;

    return Container(
      color: const Color(0xFF0D1526),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(height: 1, color: Colors.white.withValues(alpha: 0.07)),
          // Reply banner
          if (widget.replyTarget != null)
            Container(
              color: const Color(0xFF131929),
              padding: const EdgeInsets.fromLTRB(14, 6, 8, 6),
              child: Row(
                children: [
                  const Icon(
                    Icons.reply_rounded,
                    size: 14,
                    color: Color(0xFF4AA3E4),
                  ),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      'Replying to @${widget.replyTarget!.username ?? 'user'}',
                      style: const TextStyle(
                        color: Color(0xFF4AA3E4),
                        fontSize: 12,
                      ),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  GestureDetector(
                    onTap: widget.onCancelReply,
                    child: const Padding(
                      padding: EdgeInsets.all(4),
                      child: Icon(
                        Icons.close_rounded,
                        size: 16,
                        color: Color(0xFF7A8BB0),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          // Media preview
          if (_media != null)
            _RMediaPreview(
              media: _media!,
              onRemove: () => setState(() => _media = null),
            ),
          // Input row
          Padding(
            padding: EdgeInsets.fromLTRB(12, 8, 12, 8 + bottomInset),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                Expanded(
                  child: Container(
                    decoration: BoxDecoration(
                      color: const Color(0xFF1A2235),
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(
                        color: Colors.white.withValues(alpha: 0.08),
                      ),
                    ),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.center,
                      children: [
                        Expanded(
                          child: TextField(
                            controller: _textCtrl,
                            focusNode: _focusNode,
                            onChanged: (_) => setState(() {}),
                            maxLines: 4,
                            minLines: 1,
                            style: const TextStyle(
                              color: Color(0xFFE8ECF8),
                              fontSize: 14,
                            ),
                            decoration: const InputDecoration(
                              hintText: 'Write a comment…',
                              hintStyle: TextStyle(
                                color: Color(0xFF4A5568),
                                fontSize: 14,
                              ),
                              contentPadding: EdgeInsets.symmetric(
                                horizontal: 14,
                                vertical: 10,
                              ),
                              border: InputBorder.none,
                            ),
                          ),
                        ),
                        // Image / video picker
                        SizedBox(
                          width: 28,
                          height: 28,
                          child: IconButton(
                            icon: const Icon(
                              Icons.image_outlined,
                              color: Color(0xFF7A8BB0),
                              size: 17,
                            ),
                            onPressed: _sending ? null : _pickMedia,
                            padding: EdgeInsets.zero,
                          ),
                        ),
                        const SizedBox(width: 2),
                        // GIF button
                        GestureDetector(
                          onTap: _sending ? null : () => _openGiphy('gif'),
                          child: SizedBox(
                            width: 28,
                            height: 28,
                            child: Center(
                              child: Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 4,
                                  vertical: 2,
                                ),
                                decoration: BoxDecoration(
                                  border: Border.all(
                                    color: const Color(0xFF4AA3E4),
                                    width: 1.2,
                                  ),
                                  borderRadius: BorderRadius.circular(3),
                                ),
                                child: const Text(
                                  'GIF',
                                  style: TextStyle(
                                    color: Color(0xFF4AA3E4),
                                    fontSize: 9,
                                    fontWeight: FontWeight.w700,
                                    height: 1,
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 2),
                        // Sticker button
                        SizedBox(
                          width: 28,
                          height: 28,
                          child: IconButton(
                            icon: const Icon(
                              Icons.emoji_emotions_outlined,
                              color: Color(0xFF7A8BB0),
                              size: 17,
                            ),
                            onPressed: _sending
                                ? null
                                : () => _openGiphy('sticker'),
                            padding: EdgeInsets.zero,
                          ),
                        ),
                        const SizedBox(width: 6),
                      ],
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                // Send button
                GestureDetector(
                  onTap: (hasContent && !_sending) ? _send : null,
                  child: Container(
                    width: 38,
                    height: 38,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: hasContent && !_sending
                          ? const Color(0xFF3470A2)
                          : const Color(0xFF1A2235),
                    ),
                    child: _sending
                        ? const Padding(
                            padding: EdgeInsets.all(10),
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : Icon(
                            Icons.send_rounded,
                            color: hasContent
                                ? Colors.white
                                : const Color(0xFF4A5568),
                            size: 18,
                          ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ── Media preview chip ────────────────────────────────────────────────────────

class _RMediaPreview extends StatelessWidget {
  const _RMediaPreview({required this.media, required this.onRemove});
  final _RCommentMediaData media;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    Widget thumb;
    if (media.type == 'video') {
      thumb = Container(
        width: 80,
        height: 80,
        decoration: BoxDecoration(
          color: const Color(0xFF0B1220),
          borderRadius: BorderRadius.circular(8),
        ),
        child: const Center(
          child: Icon(
            Icons.play_circle_fill_rounded,
            color: Color(0xFF4AA3E4),
            size: 32,
          ),
        ),
      );
    } else if (media.file != null) {
      thumb = ClipRRect(
        borderRadius: BorderRadius.circular(8),
        child: Image.file(
          File(media.file!.path),
          width: 80,
          height: 80,
          fit: BoxFit.cover,
        ),
      );
    } else {
      thumb = ClipRRect(
        borderRadius: BorderRadius.circular(8),
        child: Image.network(
          media.url!,
          width: 80,
          height: 80,
          fit: BoxFit.cover,
          errorBuilder: (_, __, ___) =>
              Container(width: 80, height: 80, color: const Color(0xFF1A2235)),
        ),
      );
    }
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
      child: Align(
        alignment: Alignment.centerLeft,
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            thumb,
            Positioned(
              top: -4,
              right: -4,
              child: GestureDetector(
                onTap: onRemove,
                child: Container(
                  width: 20,
                  height: 20,
                  decoration: BoxDecoration(
                    color: const Color(0xFF0D1526),
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: Colors.white.withValues(alpha: 0.25),
                    ),
                  ),
                  child: const Icon(Icons.close, color: Colors.white, size: 12),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Giphy picker ──────────────────────────────────────────────────────────────

class _RGiphyPickerSheet extends StatefulWidget {
  const _RGiphyPickerSheet({required this.mode});
  final String mode;

  @override
  State<_RGiphyPickerSheet> createState() => _RGiphyPickerSheetState();
}

class _RGiphyPickerSheetState extends State<_RGiphyPickerSheet> {
  static const _apiKey = 'u6gyvFio1FZ5D8aWKIoX23QdSu61i73B';
  final _searchCtrl = TextEditingController();
  List<Map<String, dynamic>> _items = [];
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _fetch();
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _fetch([String? query]) async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final type = widget.mode == 'sticker' ? 'stickers' : 'gifs';
      final endpoint = (query?.trim().isNotEmpty == true)
          ? 'search'
          : 'trending';
      var url =
          'https://api.giphy.com/v1/$type/$endpoint?api_key=$_apiKey&limit=24&rating=g';
      if (query?.trim().isNotEmpty == true) {
        url += '&q=${Uri.encodeQueryComponent(query!.trim())}';
      }
      final res = await http.get(Uri.parse(url));
      if (!mounted) return;
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body) as Map<String, dynamic>;
        final items =
            (data['data'] as List?)?.cast<Map<String, dynamic>>() ?? [];
        setState(() {
          _items = items;
          _loading = false;
        });
      } else {
        setState(() {
          _loading = false;
          _error = 'Giphy error ${res.statusCode}';
        });
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.toString();
      });
    }
  }

  String _bestUrl(Map<String, dynamic> item) {
    final images = item['images'] as Map<String, dynamic>?;
    return ((images?['fixed_height_small'] as Map?)?['url'] as String?) ??
        ((images?['preview_gif'] as Map?)?['url'] as String?) ??
        ((images?['original'] as Map?)?['url'] as String?) ??
        '';
  }

  @override
  Widget build(BuildContext context) {
    final title = widget.mode == 'sticker' ? 'Stickers' : 'GIFs';
    return DraggableScrollableSheet(
      initialChildSize: 0.6,
      minChildSize: 0.4,
      maxChildSize: 0.92,
      snap: true,
      builder: (ctx, scrollCtrl) => Container(
        decoration: const BoxDecoration(
          color: Color(0xFF0D1526),
          borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
        ),
        child: Column(
          children: [
            Container(
              margin: const EdgeInsets.only(top: 10, bottom: 4),
              width: 36,
              height: 4,
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.2),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
              child: Row(
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      color: Color(0xFFE8ECF8),
                      fontWeight: FontWeight.w700,
                      fontSize: 16,
                    ),
                  ),
                  const Spacer(),
                  const Text(
                    'Powered by GIPHY',
                    style: TextStyle(color: Color(0xFF4A5568), fontSize: 10),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
              child: TextField(
                controller: _searchCtrl,
                style: const TextStyle(color: Color(0xFFE8ECF8), fontSize: 14),
                decoration: InputDecoration(
                  hintText: 'Search $title…',
                  hintStyle: const TextStyle(color: Color(0xFF4A5568)),
                  prefixIcon: const Icon(
                    Icons.search_rounded,
                    color: Color(0xFF7A8BB0),
                    size: 20,
                  ),
                  filled: true,
                  fillColor: const Color(0xFF1A2235),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide.none,
                  ),
                  contentPadding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 10,
                  ),
                ),
                textInputAction: TextInputAction.search,
                onSubmitted: _fetch,
              ),
            ),
            Expanded(
              child: _loading
                  ? const Center(
                      child: CircularProgressIndicator(
                        color: Color(0xFF4AA3E4),
                      ),
                    )
                  : _error != null
                  ? Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            _error!,
                            style: const TextStyle(color: Color(0xFF7A8BB0)),
                          ),
                          const SizedBox(height: 8),
                          TextButton(
                            onPressed: () => _fetch(_searchCtrl.text),
                            child: const Text(
                              'Retry',
                              style: TextStyle(color: Color(0xFF4AA3E4)),
                            ),
                          ),
                        ],
                      ),
                    )
                  : _items.isEmpty
                  ? const Center(
                      child: Text(
                        'No results',
                        style: TextStyle(color: Color(0xFF7A8BB0)),
                      ),
                    )
                  : GridView.builder(
                      controller: scrollCtrl,
                      padding: const EdgeInsets.fromLTRB(8, 0, 8, 20),
                      gridDelegate:
                          const SliverGridDelegateWithFixedCrossAxisCount(
                            crossAxisCount: 3,
                            crossAxisSpacing: 4,
                            mainAxisSpacing: 4,
                            childAspectRatio: 1,
                          ),
                      itemCount: _items.length,
                      itemBuilder: (_, i) {
                        final item = _items[i];
                        final url = _bestUrl(item);
                        final id = item['id'] as String? ?? '';
                        if (url.isEmpty) return const SizedBox.shrink();
                        return GestureDetector(
                          onTap: () => Navigator.of(ctx).pop(
                            _RCommentMediaData(
                              type: 'image',
                              url: url,
                              metadata: {
                                'provider': 'giphy',
                                'id': id,
                                if (widget.mode == 'gif') 'kind': 'gif',
                              },
                            ),
                          ),
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(6),
                            child: Image.network(
                              url,
                              fit: BoxFit.cover,
                              loadingBuilder: (_, child, progress) =>
                                  progress == null
                                  ? child
                                  : Container(
                                      color: const Color(0xFF1A2235),
                                      child: const Center(
                                        child: CircularProgressIndicator(
                                          strokeWidth: 1.5,
                                          color: Color(0xFF4AA3E4),
                                        ),
                                      ),
                                    ),
                              errorBuilder: (_, __, ___) =>
                                  Container(color: const Color(0xFF1A2235)),
                            ),
                          ),
                        );
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Comment media widget ──────────────────────────────────────────────────────

class _RCommentMedia extends StatefulWidget {
  const _RCommentMedia({required this.url, required this.type});
  final String url;
  final String type;

  @override
  State<_RCommentMedia> createState() => _RCommentMediaState();
}

class _RCommentMediaState extends State<_RCommentMedia> {
  VideoPlayerController? _controller;
  bool _videoInitialized = false;

  bool get _isGiphy =>
      widget.type == 'gif' ||
      widget.type == 'sticker' ||
      widget.url.contains('giphy.com');

  @override
  void initState() {
    super.initState();
    if (widget.type == 'video') {
      _controller = VideoPlayerController.networkUrl(Uri.parse(widget.url))
        ..initialize().then((_) {
          if (mounted) setState(() => _videoInitialized = true);
        });
    }
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.type == 'video') {
      final aspectRatio = _videoInitialized
          ? _controller!.value.aspectRatio
          : 16 / 9;
      return GestureDetector(
        onTap: () =>
            Navigator.of(context).push(_RVideoOverlayRoute(url: widget.url)),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 320, maxHeight: 280),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: AspectRatio(
              aspectRatio: aspectRatio,
              child: Stack(
                alignment: Alignment.center,
                children: [
                  if (_videoInitialized)
                    VideoPlayer(_controller!)
                  else
                    Container(color: const Color(0xFF0B1220)),
                  Container(
                    width: 48,
                    height: 48,
                    decoration: BoxDecoration(
                      color: Colors.black.withValues(alpha: 0.55),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(
                      Icons.play_arrow_rounded,
                      color: Colors.white,
                      size: 30,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    }
    if (_isGiphy) {
      return ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 200, maxHeight: 180),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(12),
          child: Image.network(
            widget.url,
            fit: BoxFit.contain,
            errorBuilder: (_, __, ___) => const SizedBox.shrink(),
          ),
        ),
      );
    }
    return GestureDetector(
      onTap: () =>
          Navigator.of(context).push(_RImageViewerRoute(url: widget.url)),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 320, maxHeight: 280),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(12),
          child: Image.network(
            widget.url,
            fit: BoxFit.cover,
            errorBuilder: (_, __, ___) => const SizedBox.shrink(),
          ),
        ),
      ),
    );
  }
}

// ── Image fullscreen viewer ───────────────────────────────────────────────────

class _RImageViewerRoute extends PageRoute<void> {
  _RImageViewerRoute({required this.url}) : super(fullscreenDialog: true);
  final String url;

  @override
  Color get barrierColor => Colors.transparent;
  @override
  bool get barrierDismissible => false;
  @override
  String? get barrierLabel => null;
  @override
  bool get maintainState => true;
  @override
  Duration get transitionDuration => const Duration(milliseconds: 180);

  @override
  Widget buildPage(
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
  ) {
    return FadeTransition(
      opacity: animation,
      child: _RImageViewer(url: url),
    );
  }
}

class _RImageViewer extends StatefulWidget {
  const _RImageViewer({required this.url});
  final String url;
  @override
  State<_RImageViewer> createState() => _RImageViewerState();
}

class _RImageViewerState extends State<_RImageViewer> {
  @override
  void initState() {
    super.initState();
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
  }

  @override
  void dispose() {
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: GestureDetector(
        onTap: () => Navigator.of(context).pop(),
        child: Container(
          color: const Color(0xC7030712),
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 6, sigmaY: 6),
            child: Stack(
              children: [
                Center(
                  child: GestureDetector(
                    onTap: () {},
                    child: SafeArea(
                      child: Padding(
                        padding: const EdgeInsets.all(24),
                        child: _RZoomableImage(url: widget.url),
                      ),
                    ),
                  ),
                ),
                Positioned(
                  top: MediaQuery.of(context).padding.top + 12,
                  right: 18,
                  child: GestureDetector(
                    onTap: () => Navigator.of(context).pop(),
                    child: Container(
                      width: 36,
                      height: 36,
                      decoration: BoxDecoration(
                        color: Colors.black.withValues(alpha: 0.55),
                        shape: BoxShape.circle,
                      ),
                      child: const Center(
                        child: Text(
                          '×',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 26,
                            height: 1,
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _RZoomableImage extends StatefulWidget {
  const _RZoomableImage({required this.url});
  final String url;
  @override
  State<_RZoomableImage> createState() => _RZoomableImageState();
}

class _RZoomableImageState extends State<_RZoomableImage> {
  final _transformCtrl = TransformationController();

  @override
  void dispose() {
    _transformCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(16),
      child: InteractiveViewer(
        transformationController: _transformCtrl,
        minScale: 1.0,
        maxScale: 4.0,
        clipBehavior: Clip.none,
        onInteractionEnd: (_) {
          if (_transformCtrl.value.getMaxScaleOnAxis() < 1.0) {
            _transformCtrl.value = Matrix4.identity();
          }
        },
        child: Image.network(
          widget.url,
          fit: BoxFit.contain,
          errorBuilder: (_, __, ___) => Container(
            color: const Color(0xFF1A2235),
            child: const Center(
              child: Icon(
                Icons.broken_image_outlined,
                color: Color(0xFF4A5568),
                size: 56,
              ),
            ),
          ),
          loadingBuilder: (_, child, progress) {
            if (progress == null) return child;
            return const Center(
              child: SizedBox(
                width: 48,
                height: 48,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: Color(0xFF4AA3E4),
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}

// ── Video fullscreen overlay ──────────────────────────────────────────────────

class _RVideoOverlayRoute extends PageRoute<void> {
  _RVideoOverlayRoute({required this.url}) : super(fullscreenDialog: true);
  final String url;

  @override
  Color get barrierColor => Colors.transparent;
  @override
  bool get barrierDismissible => false;
  @override
  String? get barrierLabel => null;
  @override
  bool get maintainState => true;
  @override
  Duration get transitionDuration => const Duration(milliseconds: 180);

  @override
  Widget buildPage(
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
  ) {
    return FadeTransition(
      opacity: animation,
      child: _RVideoOverlay(url: url),
    );
  }
}

class _RVideoOverlay extends StatefulWidget {
  const _RVideoOverlay({required this.url});
  final String url;
  @override
  State<_RVideoOverlay> createState() => _RVideoOverlayState();
}

class _RVideoOverlayState extends State<_RVideoOverlay> {
  late final VideoPlayerController _ctrl;
  bool _initialized = false;
  bool _showControls = true;
  Timer? _hideTimer;

  @override
  void initState() {
    super.initState();
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
    _ctrl = VideoPlayerController.networkUrl(Uri.parse(widget.url))
      ..initialize().then((_) {
        if (!mounted) return;
        setState(() => _initialized = true);
        _ctrl.play();
        _scheduleHideControls();
      });
    _ctrl.addListener(() {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _hideTimer?.cancel();
    _ctrl.dispose();
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    super.dispose();
  }

  void _scheduleHideControls() {
    _hideTimer?.cancel();
    _hideTimer = Timer(const Duration(seconds: 3), () {
      if (mounted && _ctrl.value.isPlaying) {
        setState(() => _showControls = false);
      }
    });
  }

  void _togglePlayPause() {
    setState(() => _showControls = true);
    if (_ctrl.value.isPlaying) {
      _ctrl.pause();
      _hideTimer?.cancel();
    } else {
      _ctrl.play();
      _scheduleHideControls();
    }
  }

  String _fmt(Duration d) {
    final mm = d.inMinutes.remainder(60).toString().padLeft(2, '0');
    final ss = d.inSeconds.remainder(60).toString().padLeft(2, '0');
    return '$mm:$ss';
  }

  @override
  Widget build(BuildContext context) {
    final position = _initialized ? _ctrl.value.position : Duration.zero;
    final duration = _initialized ? _ctrl.value.duration : Duration.zero;
    final progress = duration.inMilliseconds > 0
        ? position.inMilliseconds / duration.inMilliseconds
        : 0.0;

    return Material(
      color: Colors.black,
      child: Stack(
        children: [
          GestureDetector(
            onTap: () => setState(() => _showControls = !_showControls),
            child: Center(
              child: _initialized
                  ? AspectRatio(
                      aspectRatio: _ctrl.value.aspectRatio,
                      child: VideoPlayer(_ctrl),
                    )
                  : const CircularProgressIndicator(color: Color(0xFF4AA3E4)),
            ),
          ),
          AnimatedOpacity(
            opacity: _showControls ? 1.0 : 0.0,
            duration: const Duration(milliseconds: 200),
            child: IgnorePointer(
              ignoring: !_showControls,
              child: Container(
                decoration: const BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      Color(0xBF000000),
                      Colors.transparent,
                      Colors.transparent,
                      Color(0xBF000000),
                    ],
                    stops: [0.0, 0.25, 0.75, 1.0],
                  ),
                ),
                child: Stack(
                  children: [
                    Positioned(
                      top: MediaQuery.of(context).padding.top + 12,
                      right: 18,
                      child: GestureDetector(
                        onTap: () => Navigator.of(context).pop(),
                        child: Container(
                          width: 36,
                          height: 36,
                          decoration: BoxDecoration(
                            color: Colors.black.withValues(alpha: 0.55),
                            shape: BoxShape.circle,
                          ),
                          child: const Center(
                            child: Text(
                              '×',
                              style: TextStyle(
                                color: Colors.white,
                                fontSize: 26,
                                height: 1,
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                    Center(
                      child: GestureDetector(
                        onTap: _togglePlayPause,
                        child: Container(
                          width: 60,
                          height: 60,
                          decoration: BoxDecoration(
                            color: Colors.black.withValues(alpha: 0.55),
                            shape: BoxShape.circle,
                          ),
                          child: Icon(
                            _initialized && _ctrl.value.isPlaying
                                ? Icons.pause_rounded
                                : Icons.play_arrow_rounded,
                            color: Colors.white,
                            size: 36,
                          ),
                        ),
                      ),
                    ),
                    Positioned(
                      left: 0,
                      right: 0,
                      bottom: MediaQuery.of(context).padding.bottom + 16,
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            SliderTheme(
                              data: SliderTheme.of(context).copyWith(
                                trackHeight: 3,
                                thumbShape: const RoundSliderThumbShape(
                                  enabledThumbRadius: 7,
                                ),
                                overlayShape: const RoundSliderOverlayShape(
                                  overlayRadius: 14,
                                ),
                                activeTrackColor: const Color(0xFF4AA3E4),
                                inactiveTrackColor: Colors.white.withValues(
                                  alpha: 0.3,
                                ),
                                thumbColor: const Color(0xFF4AA3E4),
                              ),
                              child: Slider(
                                value: progress.clamp(0.0, 1.0),
                                onChanged: _initialized
                                    ? (v) {
                                        final ms = (v * duration.inMilliseconds)
                                            .round();
                                        _ctrl.seekTo(
                                          Duration(milliseconds: ms),
                                        );
                                        setState(() => _showControls = true);
                                        _scheduleHideControls();
                                      }
                                    : null,
                              ),
                            ),
                            Padding(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 6,
                              ),
                              child: Row(
                                mainAxisAlignment:
                                    MainAxisAlignment.spaceBetween,
                                children: [
                                  Text(
                                    _fmt(position),
                                    style: const TextStyle(
                                      color: Colors.white,
                                      fontSize: 12,
                                    ),
                                  ),
                                  Text(
                                    _fmt(duration),
                                    style: const TextStyle(
                                      color: Colors.white,
                                      fontSize: 12,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Small helper widgets ──────────────────────────────────────────────────────

class _RCommentDivider extends StatelessWidget {
  const _RCommentDivider();

  @override
  Widget build(BuildContext context) {
    return Divider(
      height: 1,
      thickness: 1,
      color: Colors.white.withValues(alpha: 0.06),
    );
  }
}

class _RCommentAvatar extends StatelessWidget {
  const _RCommentAvatar({required this.comment});
  final CommentItem comment;

  @override
  Widget build(BuildContext context) {
    final url = comment.displayAvatar;
    final initial =
        (comment.author?.displayName ?? comment.author?.username ?? '?')
            .isNotEmpty
        ? (comment.author?.displayName ?? comment.author?.username ?? '?')[0]
              .toUpperCase()
        : '?';
    if (url.isNotEmpty) {
      return ClipOval(
        child: Image.network(
          url,
          width: 34,
          height: 34,
          fit: BoxFit.cover,
          errorBuilder: (_, __, ___) => _RInitials(initial: initial, size: 34),
        ),
      );
    }
    return _RInitials(initial: initial, size: 34);
  }
}

class _RInitials extends StatelessWidget {
  const _RInitials({required this.initial, required this.size});
  final String initial;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: const BoxDecoration(
        shape: BoxShape.circle,
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF7C3AED), Color(0xFF22D3EE)],
        ),
      ),
      child: Center(
        child: Text(
          initial,
          style: TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.w700,
            fontSize: size * 0.38,
          ),
        ),
      ),
    );
  }
}

class _RIconLike extends StatelessWidget {
  const _RIconLike({
    required this.size,
    required this.filled,
    required this.color,
  });
  final double size;
  final bool filled;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      size: Size(size, size),
      painter: _RLikePainter(filled: filled, color: color),
    );
  }
}

class _RLikePainter extends CustomPainter {
  const _RLikePainter({required this.filled, required this.color});
  final bool filled;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final Paint stroke = Paint()
      ..color = color
      ..strokeWidth = size.width * 0.067
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    final Paint fill = Paint()
      ..color = color
      ..style = PaintingStyle.fill;
    final double w = size.width;
    final double h = size.height;
    final double sx = w / 24;
    final double sy = h / 24;
    final Path body = Path()
      ..moveTo(6 * sx, 10 * sy)
      ..lineTo(9.2 * sx, 10 * sy)
      ..lineTo(9.2 * sx, 6.6 * sy)
      ..cubicTo(9.2 * sx, 5.47 * sy, 10.12 * sx, 4.5 * sy, 11.3 * sx, 4.5 * sy)
      ..cubicTo(
        11.76 * sx,
        4.5 * sy,
        12.21 * sx,
        4.66 * sy,
        12.57 * sx,
        4.95 * sy,
      )
      ..lineTo(12.79 * sx, 5.13 * sy)
      ..cubicTo(
        13.11 * sx,
        5.39 * sy,
        13.3 * sx,
        5.79 * sy,
        13.3 * sx,
        6.2 * sy,
      )
      ..lineTo(13.3 * sx, 10 * sy)
      ..lineTo(16.9 * sx, 10 * sy)
      ..cubicTo(
        17.9 * sx,
        10 * sy,
        18.7 * sx,
        10.78 * sy,
        18.87 * sx,
        11.65 * sy,
      )
      ..lineTo(17.87 * sx, 16.95 * sy)
      ..cubicTo(
        17.66 * sx,
        18 * sy,
        16.72 * sx,
        18.8 * sy,
        15.43 * sx,
        18.8 * sy,
      )
      ..lineTo(8.2 * sx, 18.8 * sy)
      ..cubicTo(7.0 * sx, 18.8 * sy, 6 * sx, 17.8 * sy, 6 * sx, 17.6 * sy)
      ..close();
    final Path base = Path()
      ..moveTo(4 * sx, 10 * sy)
      ..lineTo(6 * sx, 10 * sy)
      ..lineTo(6 * sx, 20 * sy)
      ..lineTo(4 * sx, 20 * sy)
      ..cubicTo(3.45 * sx, 20 * sy, 3 * sx, 19.55 * sy, 3 * sx, 19 * sy)
      ..lineTo(3 * sx, 11 * sy)
      ..cubicTo(3 * sx, 10.45 * sy, 3.45 * sx, 10 * sy, 4 * sx, 10 * sy)
      ..close();
    if (filled) {
      canvas.drawPath(body, fill);
      canvas.drawPath(base, fill);
    }
    canvas.drawPath(body, stroke);
    canvas.drawPath(base, stroke);
  }

  @override
  bool shouldRepaint(_RLikePainter old) =>
      old.filled != filled || old.color != color;
}

class _RMiniVerifiedBadge extends StatelessWidget {
  static const _svg =
      '<svg width="13" height="13" viewBox="0 0 20 20" fill="none" '
      'xmlns="http://www.w3.org/2000/svg">'
      '<defs><linearGradient id="rvbm" x1="0" y1="0" x2="1" y2="1" '
      'gradientUnits="objectBoundingBox">'
      '<stop stop-color="#52B6FF"/>'
      '<stop offset="1" stop-color="#1570EF"/>'
      '</linearGradient></defs>'
      '<path d="M10 1.5 12 2.9 14.3 2.9 15.5 5 17.6 6.2 17.6 8.6 18.9 10.5 '
      '17.6 12.5 17.6 14.9 15.5 16.1 14.3 18.2 12 18.2 10 19.5 8 18.2 '
      '5.7 18.2 4.5 16.1 2.4 14.9 2.4 12.5 1.1 10.5 2.4 8.6 2.4 6.2 '
      '4.5 5 5.7 2.9 8 2.9Z" fill="url(#rvbm)"/>'
      '<path d="M6.8 10.3 9.1 12.6 13.6 8.1" stroke="#fff" '
      'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>'
      '</svg>';

  @override
  Widget build(BuildContext context) =>
      SvgPicture.string(_svg, width: 13, height: 13);
}

class _RAuthorBadge extends StatelessWidget {
  const _RAuthorBadge();

  static const _svg =
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" '
      'xmlns="http://www.w3.org/2000/svg">'
      '<path d="M4 9l4 3 4-6 4 6 4-3-2 9H6l-2-9Z" '
      'stroke="#38bdf8" stroke-width="1.6" stroke-linejoin="round"/>'
      '<path d="M7 20h10" stroke="#38bdf8" stroke-width="1.6" '
      'stroke-linecap="round"/>'
      '</svg>';

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
      decoration: BoxDecoration(
        color: const Color(0xFF38BDF8).withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          SvgPicture.string(_svg, width: 11, height: 11),
          const SizedBox(width: 3),
          const Text(
            'Author',
            style: TextStyle(
              color: Color(0xFF38BDF8),
              fontSize: 11,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

class _RLinkPreviewList extends StatelessWidget {
  const _RLinkPreviewList({required this.previews});
  final List<CommentLinkPreview> previews;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: previews
          .take(3)
          .map(
            (p) => Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: _RLinkPreviewCard(preview: p),
            ),
          )
          .toList(),
    );
  }
}

class _RLinkPreviewCard extends StatelessWidget {
  const _RLinkPreviewCard({required this.preview});
  final CommentLinkPreview preview;

  @override
  Widget build(BuildContext context) {
    final href = preview.canonicalUrl?.trim().isNotEmpty == true
        ? preview.canonicalUrl!.trim()
        : preview.url.trim();
    final title = preview.title?.trim().isNotEmpty == true
        ? preview.title!.trim()
        : preview.siteName?.trim().isNotEmpty == true
        ? preview.siteName!.trim()
        : preview.domain?.trim() ?? 'Open link';
    final subtitle = preview.description?.trim().isNotEmpty == true
        ? preview.description!.trim()
        : preview.domain?.trim() ?? '';
    final domain =
        preview.domain ??
        (() {
          try {
            return Uri.parse(href).host;
          } catch (_) {
            return '';
          }
        }());

    return GestureDetector(
      onTap: () =>
          launchUrl(Uri.parse(href), mode: LaunchMode.externalApplication),
      child: Container(
        constraints: const BoxConstraints(maxWidth: 340),
        decoration: BoxDecoration(
          color: const Color(0xFFFFFFFF).withValues(alpha: 0.03),
          border: Border.all(
            color: const Color(0xFFFFFFFF).withValues(alpha: 0.12),
          ),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ClipRRect(
              borderRadius: const BorderRadius.horizontal(
                left: Radius.circular(11),
              ),
              child: preview.image?.isNotEmpty == true
                  ? Image.network(
                      preview.image!,
                      width: 88,
                      height: 88,
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) =>
                          _RLinkPreviewFallback(favicon: preview.favicon),
                    )
                  : _RLinkPreviewFallback(favicon: preview.favicon),
            ),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(10, 8, 10, 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: Color(0xFFE5E7EB),
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        height: 1.35,
                      ),
                    ),
                    if (subtitle.isNotEmpty) ...[
                      const SizedBox(height: 3),
                      Text(
                        subtitle,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: Color(0xFF94A3B8),
                          fontSize: 12,
                          height: 1.35,
                        ),
                      ),
                    ],
                    const SizedBox(height: 4),
                    Text(
                      domain,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: Color(0xFF93C5FD),
                        fontSize: 11,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _RLinkPreviewFallback extends StatelessWidget {
  const _RLinkPreviewFallback({this.favicon});
  final String? favicon;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 88,
      height: 88,
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF111827), Color(0xFF1F2937)],
        ),
      ),
      alignment: Alignment.center,
      child: favicon?.isNotEmpty == true
          ? Image.network(
              favicon!,
              width: 24,
              height: 24,
              errorBuilder: (_, __, ___) =>
                  const Icon(Icons.link, color: Color(0xFF4A5568), size: 24),
            )
          : const Icon(Icons.link, color: Color(0xFF4A5568), size: 24),
    );
  }
}

// ── Time helper ───────────────────────────────────────────────────────────────

String _rTimeAgo(String? iso) {
  if (iso == null || iso.isEmpty) return '';
  try {
    final dt = DateTime.parse(iso).toLocal();
    final diff = DateTime.now().difference(dt);
    if (diff.isNegative) return 'just now';
    final mins = (diff.inSeconds / 60).round();
    if (mins < 1) return 'just now';
    if (mins < 2) return '1 minute ago';
    if (mins < 45) return '$mins minutes ago';
    if (mins < 90) return 'about 1 hour ago';
    if (mins < 1440) return 'about ${(mins / 60).round()} hours ago';
    if (mins < 2520) return '1 day ago';
    if (mins < 43200) return '${(mins / 1440).round()} days ago';
    if (mins < 86400) return 'about ${(mins / 43200).round()} months ago';
    const int minsPerYear = 525960;
    if (mins < minsPerYear) return '${(mins / 43200).round()} months ago';
    final months = (mins / 43200).round();
    if (months < 15) return 'about 1 year ago';
    if (months < 21) return 'over 1 year ago';
    if (months < 24) return 'almost 2 years ago';
    final years = months ~/ 12;
    final rem = months % 12;
    if (rem < 3) return 'about $years years ago';
    if (rem < 9) return 'over $years years ago';
    return 'almost ${years + 1} years ago';
  } catch (_) {
    return '';
  }
}
