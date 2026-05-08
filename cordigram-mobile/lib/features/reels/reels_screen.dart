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
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:video_player/video_player.dart';
import '../../core/config/app_theme.dart';
import '../../core/services/api_service.dart';
import '../../core/services/auth_storage.dart';
import '../../core/widgets/comment_sheet_widgets.dart';
import '../home/models/feed_post.dart';
import '../home/services/post_interaction_service.dart';
import '../home/widgets/post_card.dart' show PostMenuAction;
import '../profile/profile_screen.dart';
import '../post/post_detail_screen.dart' show CommentItem, CommentLinkPreview;
import '../post/utils/post_confirm_dialogs.dart';
import '../post/utils/post_edit_utils.dart';
import '../post/utils/likes_list_sheet.dart';
import '../post/utils/post_mute_overlay.dart';
import '../post/utils/repost_flow_utils.dart';
import '../report/report_comment_sheet.dart';
import '../report/report_post_sheet.dart';
import '../../core/services/language_controller.dart';

// ── Reels screen ──────────────────────────────────────────────────────────────

class ReelsScreen extends StatefulWidget {
  const ReelsScreen({
    super.key,
    this.scope = 'all',
    this.initialReelId,
    this.pinInitialReelToTop = false,
  });

  final String scope;
  final String? initialReelId;
  final bool pinInitialReelToTop;

  @override
  State<ReelsScreen> createState() => _ReelsScreenState();
}

class _ReelsScreenState extends State<ReelsScreen> {
  final List<FeedPostState> _reels = [];
  final Set<String> _revealedMediaPostIds = <String>{};

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
  bool _initialTargetHandled = false;

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
        ? _reels[index].post.media.first.displayUrl(
            revealed: _revealedMediaPostIds.contains(_reels[index].post.id),
          )
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

  bool _isBlurredMediaAt(int index) {
    if (index < 0 || index >= _reels.length) return false;
    final post = _reels[index].post;
    if (post.media.isEmpty) return false;
    final media = post.media.first;
    return media.isBlurredByModeration &&
        !_revealedMediaPostIds.contains(post.id);
  }

  Future<void> _revealMediaAt(int index) async {
    if (index < 0 || index >= _reels.length) return;
    final post = _reels[index].post;
    if (post.media.isEmpty || !post.media.first.isBlurredByModeration) return;

    setState(() {
      _revealedMediaPostIds.add(post.id);
    });

    _controllers.remove(index)?.dispose();
    await _ensureControllerInitialized(index);
    if (!mounted) return;
    if (index == _currentPage) {
      _controllers[index]?.play();
    }
    setState(() {});
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
      final normalizedScope = widget.scope.trim().toLowerCase();
      final scopeQuery = normalizedScope == 'following'
          ? '&scope=following'
          : '';
      final rawList = await ApiService.getList(
        '/reels/feed?limit=$_kPageSize&page=$_page$scopeQuery',
        extraHeaders: _authHeader,
      );
      if (!mounted) return;

      final List<FeedPost> pageItems = rawList
          .whereType<Map<String, dynamic>>()
          .map(FeedPost.fromJson)
          .toList();
      final List<FeedPost> posts = pageItems
          .where((post) => !isAdLikeFeedPost(post))
          .toList();

      setState(() {
        _reels.addAll(posts.map((p) => FeedPostState(post: p)));
        _page++;
        _hasMore = pageItems.length >= _kPageSize;
        _loading = false;
      });

      _maybeJumpToInitialTarget();

      if (!_initialTargetHandled && widget.initialReelId != null && _hasMore) {
        await _loadReels();
        return;
      }

      // Initialize and play the first reel after initial load.
      if (_currentPage == 0 &&
          _reels.isNotEmpty &&
          widget.initialReelId == null &&
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

  void _maybeJumpToInitialTarget() {
    if (_initialTargetHandled) return;
    final targetId = widget.initialReelId;
    if (targetId == null || targetId.isEmpty) {
      _initialTargetHandled = true;
      return;
    }

    final targetIndex = _reels.indexWhere((s) => s.post.id == targetId);
    if (targetIndex < 0) {
      if (!_hasMore) {
        _initialTargetHandled = true;
      }
      return;
    }

    int playIndex = targetIndex;
    if (widget.pinInitialReelToTop && targetIndex > 0) {
      final target = _reels.removeAt(targetIndex);
      _reels.insert(0, target);
      for (final c in _controllers.values) {
        c.dispose();
      }
      _controllers.clear();
      playIndex = 0;
    }

    _initialTargetHandled = true;

    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (!mounted) return;
      _currentPage = playIndex;
      if (_pageController.hasClients) {
        _pageController.jumpToPage(playIndex);
      }
      _onPageChanged(playIndex);
    });
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
      _showSnack(LanguageController.instance.t('reels.snack.saved'));
    } else {
      _showSnack(LanguageController.instance.t('reels.snack.removedFromSaved'));
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
      _showSnack(LanguageController.instance.t('reels.snack.saveError'), error: true);
    });
  }

  String _resolveOriginalPostId(FeedPost post) {
    final repostOf = post.repostOf;
    if (repostOf != null && repostOf.isNotEmpty) return repostOf;
    return post.id;
  }

  void _incrementRepostStatById(String postId) {
    final idx = _reels.indexWhere((s) => s.post.id == postId);
    if (idx < 0) return;
    final s = _reels[idx];
    setState(() {
      s.stats = FeedStats(
        hearts: s.stats.hearts,
        comments: s.stats.comments,
        saves: s.stats.saves,
        reposts: (s.stats.reposts + 1).clamp(0, 999999999),
        views: s.stats.views,
        impressions: s.stats.impressions,
      );
    });
  }

  Future<void> _onRepost(int index) async {
    if (index >= _reels.length) return;
    final token = AuthStorage.accessToken;
    if (token == null) {
      _showSnack(LanguageController.instance.t('reels.snack.signInToRepost'), error: true);
      return;
    }

    final state = _reels[index];
    final post = state.post;
    final originalId = _resolveOriginalPostId(post);
    final targetId = post.id;

    final selection = await showRepostFlowSheet(
      context: context,
      label: '@${post.authorUsername ?? post.displayName}',
      kind: post.kind,
      initialAllowDownload: post.allowDownload == true,
    );
    if (selection == null) return;

    if (selection.action == RepostFlowAction.quick) {
      try {
        await PostInteractionService.quickRepost(originalId);
        _incrementRepostStatById(originalId);
        if (originalId != targetId) {
          _incrementRepostStatById(targetId);
          try {
            await PostInteractionService.repost(targetId);
          } catch (_) {}
        }
        _showSnack(LanguageController.instance.t('reels.snack.reposted'));
      } on ApiException catch (e) {
        try {
          await PostInteractionService.repost(originalId);
          _incrementRepostStatById(originalId);
          if (originalId != targetId) {
            _incrementRepostStatById(targetId);
            try {
              await PostInteractionService.repost(targetId);
            } catch (_) {}
          }
          _showSnack(LanguageController.instance.t('reels.snack.reposted'));
        } catch (_) {
          _showSnack(
            e.message.isNotEmpty ? e.message : LanguageController.instance.t('reels.snack.repostError'),
            error: true,
          );
        }
      } catch (_) {
        _showSnack(LanguageController.instance.t('reels.snack.repostError'), error: true);
      }
      return;
    }

    final input = selection.quoteInput;
    if (input == null) return;
    final payload = RepostQuotePayload(
      content: input.content,
      hashtags: input.hashtags,
      location: input.location,
      visibility: input.visibility,
      allowComments: input.allowComments,
      allowDownload: post.allowDownload == true,
      hideLikeCount: input.hideLikeCount,
    );

    try {
      await PostInteractionService.quoteRepost(
        originalPostId: originalId,
        payload: payload,
        kind: post.kind,
      );
      _incrementRepostStatById(originalId);
      if (originalId != targetId) {
        _incrementRepostStatById(targetId);
        try {
          await PostInteractionService.repost(targetId);
        } catch (_) {}
      }
      _showSnack(LanguageController.instance.t('reels.snack.repostedWithQuote'));
    } on ApiException catch (e) {
      _showSnack(
        e.message.isNotEmpty ? e.message : LanguageController.instance.t('reels.snack.repostWithQuoteError'),
        error: true,
      );
    } catch (_) {
      _showSnack(LanguageController.instance.t('reels.snack.repostWithQuoteError'), error: true);
    }
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
      _showSnack(LanguageController.instance.t('reels.snack.downloadDisabled'), error: true);
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

      _showSnack(LanguageController.instance.t('reels.snack.downloaded', {'path': file.path}));
    } catch (_) {
      _showSnack(LanguageController.instance.t('reels.snack.downloadError'), error: true);
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
        _showSnack(LanguageController.instance.t('reels.snack.reelUpdated'));
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
        _showSnack(LanguageController.instance.t('reels.snack.visibilityUpdated'));
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
            nextAllowed ? LanguageController.instance.t('reels.snack.commentsOn') : LanguageController.instance.t('reels.snack.commentsOff'),
          );
        } catch (_) {
          if (!mounted || index >= _reels.length) return;
          setState(() {
            _reels[index] = state.copyWith(
              post: reel.copyWith(allowComments: currentAllowed),
            );
          });
          _showSnack(LanguageController.instance.t('reels.snack.commentsError'), error: true);
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
          _showSnack(nextHidden ? LanguageController.instance.t('reels.snack.likeHidden') : LanguageController.instance.t('reels.snack.likeVisible'));
        } catch (_) {
          if (!mounted || index >= _reels.length) return;
          setState(() {
            _reels[index] = state.copyWith(
              post: reel.copyWith(hideLikeCount: currentHidden),
            );
          });
          _showSnack(LanguageController.instance.t('reels.snack.likeError'), error: true);
        }
        return;
      case PostMenuAction.copyLink:
        final link = PostInteractionService.reelPermalink(reel.id);
        await Clipboard.setData(ClipboardData(text: link));
        _showSnack(LanguageController.instance.t('reels.snack.linkCopied'));
        return;
      case PostMenuAction.muteNotifications:
        final muted = await showPostMuteOverlay(
          context,
          postId: reel.id,
          kindLabel: 'reel',
        );
        if (muted) _showSnack(LanguageController.instance.t('reels.snack.notificationsMuted'));
        return;
      case PostMenuAction.deletePost:
        final confirmed = await showPostConfirmDialog(
          context,
          title: LanguageController.instance.t('reels.deleteReel.title'),
          message: LanguageController.instance.t('common.cannotUndo'),
          confirmLabel: LanguageController.instance.t('common.delete'),
          danger: true,
        );
        if (confirmed != true) return;
        try {
          await PostInteractionService.deletePost(reel.id);
          _showSnack(LanguageController.instance.t('reels.snack.reelDeleted'));
          await _loadReels(refresh: true);
        } catch (_) {
          _showSnack(LanguageController.instance.t('reels.snack.deleteError'), error: true);
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
          _showSnack(LanguageController.instance.t('reels.snack.reelHidden'));
          await _loadReels(refresh: true);
        } catch (_) {
          _showSnack(LanguageController.instance.t('reels.snack.hideError'), error: true);
        }
        return;
      case PostMenuAction.reportPost:
        final token = AuthStorage.accessToken;
        if (token == null) {
          _showSnack(LanguageController.instance.t('reels.snack.signInFirst'), error: true);
          return;
        }
        final reported = await showReportPostSheet(
          context,
          postId: reel.id,
          authHeader: {'Authorization': 'Bearer $token'},
          subjectLabel: 'reel',
        );
        if (reported) _showSnack(LanguageController.instance.t('reels.reportSubmitted'));
        return;
      case PostMenuAction.blockAccount:
        final userId = reel.authorId ?? reel.author?.id;
        if (userId == null || userId.isEmpty) return;
        final username = reel.authorUsername ?? reel.author?.username ?? 'user';
        final confirmed = await showPostConfirmDialog(
          context,
          title: LanguageController.instance.t('reels.blockUserConfirm.title', {'username': username}),
          message: LanguageController.instance.t('reels.blockUserConfirm.message'),
          confirmLabel: LanguageController.instance.t('common.block'),
          danger: true,
        );
        if (confirmed != true) return;
        try {
          await PostInteractionService.blockUser(userId);
          _showSnack(LanguageController.instance.t('reels.snack.accountBlocked'));
          await _loadReels(refresh: true);
        } catch (_) {
          _showSnack(LanguageController.instance.t('reels.snack.blockError'), error: true);
        }
        return;
      case PostMenuAction.goToAdsPost:
      case PostMenuAction.detailAds:
        _showSnack(LanguageController.instance.t('reels.snack.adsNotAvailable'), error: true);
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
      _showSnack(LanguageController.instance.t('reels.commentsTurnedOff'));
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
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    if (_reels.isEmpty && _loading) {
      return Scaffold(
        backgroundColor: theme.scaffoldBackgroundColor,
        body: Center(child: CircularProgressIndicator(color: scheme.primary)),
      );
    }

    if (_reels.isEmpty && !_loading) {
      return Scaffold(
        backgroundColor: theme.scaffoldBackgroundColor,
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                Icons.smart_display_outlined,
                size: 56,
                color: scheme.onSurfaceVariant,
              ),
              const SizedBox(height: 12),
              Text(
                LanguageController.instance.t('reels.empty'),
                style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 16),
              ),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: () => _loadReels(refresh: true),
                style: ElevatedButton.styleFrom(
                  backgroundColor: scheme.primary,
                ),
                child: Text(
                  LanguageController.instance.t('common.refresh'),
                  style: const TextStyle(color: Colors.white),
                ),
              ),
            ],
          ),
        ),
      );
    }

    return Scaffold(
      backgroundColor: theme.scaffoldBackgroundColor,
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
              onRepost: () => _onRepost(index),
              onSave: () => _onSave(index),
              onComment: () => _openComments(index),
              onMuteToggle: _toggleMute,
              onFollow: () => _onFollow(index),
              onMenuAction: (action) => _onReelMenuAction(index, action),
              onDownloadReel: () => _downloadReelAt(index),
              showModerationRevealOverlay: _isBlurredMediaAt(index),
              onRevealMedia: () => _revealMediaAt(index),
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
    required this.onRepost,
    required this.onSave,
    required this.onComment,
    required this.onMuteToggle,
    required this.onFollow,
    required this.onMenuAction,
    required this.onDownloadReel,
    required this.showModerationRevealOverlay,
    required this.onRevealMedia,
  });

  final FeedPostState state;
  final VideoPlayerController? controller;
  final bool isCurrent;
  final bool muted;
  final String? viewerId;
  final VoidCallback onLike;
  final VoidCallback onRepost;
  final VoidCallback onSave;
  final VoidCallback onComment;
  final VoidCallback onMuteToggle;
  final VoidCallback onFollow;
  final Future<void> Function(PostMenuAction action) onMenuAction;
  final Future<void> Function() onDownloadReel;
  final bool showModerationRevealOverlay;
  final VoidCallback onRevealMedia;

  @override
  State<_ReelPage> createState() => _ReelPageState();
}

class _ReelPageState extends State<_ReelPage> {
  bool _showPauseIcon = false;
  Timer? _pauseIconTimer;

  void _openUserProfile(String userId) {
    if (userId.isEmpty) return;
    Navigator.of(context).push(
      MaterialPageRoute<void>(builder: (_) => ProfileScreen(userId: userId)),
    );
  }

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
    final theme = Theme.of(context);
    final tokens =
        theme.extension<AppSemanticColors>() ??
        (theme.brightness == Brightness.dark
            ? AppSemanticColors.dark
            : AppSemanticColors.light);
    final isOwner =
        widget.viewerId != null &&
        widget.viewerId!.isNotEmpty &&
        (reel.authorId == widget.viewerId ||
            reel.author?.id == widget.viewerId);

    final entries = <({String id, String label, bool danger})>[];
    final canDownload = reel.allowDownload == true && reel.media.isNotEmpty;
    final lc = LanguageController.instance;
    if (isOwner) {
      entries.add((id: 'editReel', label: lc.t('reels.menu.editReel'), danger: false));
      entries.add((
        id: 'editVisibility',
        label: lc.t('reels.menu.editVisibility'),
        danger: false,
      ));
      entries.add((
        id: 'toggleComments',
        label: reel.allowComments == false
            ? lc.t('reels.menu.commentsOn')
            : lc.t('reels.menu.commentsOff'),
        danger: false,
      ));
      entries.add((
        id: 'toggleHideLike',
        label: reel.hideLikeCount == true ? lc.t('reels.menu.showLike') : lc.t('reels.menu.hideLike'),
        danger: false,
      ));
      entries.add((id: 'muteReel', label: lc.t('reels.menu.muteReel'), danger: false));
      if (canDownload) {
        entries.add((
          id: 'downloadReel',
          label: lc.t('reels.menu.download'),
          danger: false,
        ));
      }
      entries.add((id: 'copyLink', label: lc.t('reels.menu.copyLink'), danger: false));
      entries.add((id: 'deleteReel', label: lc.t('reels.menu.deleteReel'), danger: true));
    } else {
      if (canDownload) {
        entries.add((
          id: 'downloadReel',
          label: lc.t('reels.menu.download'),
          danger: false,
        ));
      }
      entries.add((id: 'copyLink', label: lc.t('reels.menu.copyLink'), danger: false));
      entries.add((
        id: 'followToggle',
        label: widget.state.following ? lc.t('reels.menu.unfollow') : lc.t('reels.menu.follow'),
        danger: false,
      ));
      entries.add((
        id: 'saveToggle',
        label: widget.state.saved ? lc.t('reels.menu.unsaveReel') : lc.t('reels.menu.saveReel'),
        danger: false,
      ));
      entries.add((id: 'hideReel', label: lc.t('reels.menu.hideReel'), danger: false));
      entries.add((id: 'reportReel', label: lc.t('reels.menu.report'), danger: false));
      entries.add((
        id: 'blockAccount',
        label: lc.t('reels.menu.blockAccount'),
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
      color: tokens.panel,
      surfaceTintColor: Colors.transparent,
      position: RelativeRect.fromRect(rect, Offset.zero & overlay.size),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(color: tokens.panelBorder),
      ),
      items: entries
          .map(
            (item) => PopupMenuItem<String>(
              value: item.id,
              child: Text(
                item.label,
                style: TextStyle(
                  color: item.danger ? theme.colorScheme.error : tokens.text,
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
      case 'muteReel':
        return widget.onMenuAction(PostMenuAction.muteNotifications);
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
    final repostAuthorId =
        reel.repostOfAuthor?.id ?? reel.repostOfAuthorId ?? '';

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

          if (widget.showModerationRevealOverlay)
            Positioned.fill(
              child: Container(
                color: Colors.black.withValues(alpha: 0.22),
                alignment: Alignment.center,
                child: Container(
                  margin: const EdgeInsets.symmetric(horizontal: 24),
                  padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
                  decoration: BoxDecoration(
                    color: const Color(0xFF2A3345).withValues(alpha: 0.92),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: Colors.white.withValues(alpha: 0.08),
                    ),
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        LanguageController.instance.t('post.media.blurredWarning'),
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          color: Color(0xFFE8ECF8),
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 10),
                      ElevatedButton(
                        onPressed: widget.onRevealMedia,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF0F1F3B),
                          foregroundColor: Colors.white,
                          elevation: 0,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(10),
                          ),
                        ),
                        child: Text(LanguageController.instance.t('common.viewImage')),
                      ),
                    ],
                  ),
                ),
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
                        child: Row(
                          children: [
                            Text(
                              LanguageController.instance.t('reels.repostedFrom'),
                              style: const TextStyle(
                                color: Color(0xFF9FB0CC),
                                fontSize: 12,
                                shadows: [
                                  Shadow(blurRadius: 4, color: Colors.black54),
                                ],
                              ),
                            ),
                            Expanded(
                              child: GestureDetector(
                                onTap: repostAuthorId.isNotEmpty
                                    ? () => _openUserProfile(repostAuthorId)
                                    : null,
                                child: Text(
                                  repostUsername != null &&
                                          repostUsername.isNotEmpty
                                      ? '@$repostUsername'
                                      : 'unknown',
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    color: Color(0xFFE8ECF8),
                                    fontSize: 12,
                                    fontWeight: FontWeight.w700,
                                    shadows: [
                                      Shadow(
                                        blurRadius: 4,
                                        color: Colors.black54,
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            ),
                          ],
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
                            widget.state.following ? LanguageController.instance.t('reels.following') : LanguageController.instance.t('reels.follow'),
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
                  onLongPress: () => showPostLikesSheet(
                    context,
                    postId: widget.state.post.id,
                    viewerId: widget.viewerId,
                  ),
                ),
                const SizedBox(height: 20),
                // Comment
                _ActionButton(
                  icon: Icons.mode_comment_outlined,
                  color: commentsLocked ? Colors.white54 : Colors.white,
                  label: commentsLocked
                      ? LanguageController.instance.t('reels.commentsOffLabel')
                      : _formatCount(widget.state.stats.comments),
                  onTap: commentsLocked ? () {} : widget.onComment,
                ),
                const SizedBox(height: 20),
                // Repost
                _ActionButton(
                  icon: Icons.repeat_rounded,
                  color: Colors.white,
                  label: _formatCount(widget.state.stats.reposts),
                  onTap: widget.onRepost,
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
    this.onLongPress,
  });

  final IconData icon;
  final Color color;
  final String label;
  final VoidCallback onTap;
  final VoidCallback? onLongPress;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      onLongPress: onLongPress,
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

const Set<String> _reelCommentVideoExtensions = {
  'mp4',
  'mov',
  'm4v',
  'webm',
  'mkv',
  'avi',
  '3gp',
  '3gpp',
};

const Map<String, String> _reelCommentMimeByExtension = {
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
  'png': 'image/png',
  'gif': 'image/gif',
  'webp': 'image/webp',
  'bmp': 'image/bmp',
  'heic': 'image/heic',
  'heif': 'image/heif',
  'mp4': 'video/mp4',
  'mov': 'video/quicktime',
  'm4v': 'video/x-m4v',
  'webm': 'video/webm',
  'mkv': 'video/x-matroska',
  'avi': 'video/x-msvideo',
  '3gp': 'video/3gpp',
  '3gpp': 'video/3gpp',
};

String _reelCommentFileExtension(String path) {
  final normalized = path.toLowerCase();
  final dot = normalized.lastIndexOf('.');
  if (dot < 0 || dot == normalized.length - 1) return '';
  return normalized.substring(dot + 1);
}

String _detectReelCommentMediaType(XFile file) {
  final mime = file.mimeType?.toLowerCase().trim();
  if (mime != null) {
    if (mime.startsWith('video/')) return 'video';
    if (mime.startsWith('image/')) return 'image';
  }
  return _reelCommentVideoExtensions.contains(
        _reelCommentFileExtension(file.path),
      )
      ? 'video'
      : 'image';
}

String _resolveReelCommentUploadContentType(XFile file, String mediaType) {
  final mime = file.mimeType?.toLowerCase().trim();
  if (mime != null &&
      (mime.startsWith('image/') || mime.startsWith('video/'))) {
    return mime;
  }
  final ext = _reelCommentFileExtension(file.path);
  final byExt = _reelCommentMimeByExtension[ext];
  if (byExt != null) return byExt;
  return mediaType == 'video' ? 'video/mp4' : 'image/jpeg';
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

  // ── User language (for translate comment feature) ─────────────────────────
  String _userLanguage = 'en';

  static Map<String, String> get _authHeader => {
    'Authorization': 'Bearer ${AuthStorage.accessToken}',
  };

  Future<void> _loadUserLanguage() async {
    final prefs = await SharedPreferences.getInstance();
    final cached = prefs.getString('cordigram-language');
    if (cached != null && mounted) setState(() => _userLanguage = cached);
    try {
      final data = await ApiService.get(
        '/users/settings',
        extraHeaders: _authHeader,
      );
      final raw = (data['language'] ?? '').toString().toLowerCase();
      const valid = {'vi', 'en', 'ja', 'zh'};
      final resolved = valid.contains(raw) ? raw : 'en';
      await prefs.setString('cordigram-language', resolved);
      if (mounted) setState(() => _userLanguage = resolved);
    } catch (_) {
      if (cached == null && mounted) setState(() => _userLanguage = 'en');
    }
  }

  @override
  void initState() {
    super.initState();
    _loadUserLanguage();
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
        SnackBar(
          content: Text(LanguageController.instance.t('reels.commentsTurnedOff')),
          backgroundColor: const Color(0xFF1A2235),
        ),
      );
      return;
    }

    Map<String, dynamic>? mediaJson;
    if (media != null) {
      if (media.file != null) {
        final uploadContentType = _resolveReelCommentUploadContentType(
          media.file!,
          media.type,
        );
        final uploaded = await ApiService.postMultipart(
          '/posts/${widget.postId}/comments/upload',
          fieldName: 'file',
          filePath: media.file!.path,
          contentType: uploadContentType,
          extraHeaders: _authHeader,
        );
        final uploadedUrl =
            ((uploaded['secureUrl'] ?? uploaded['url']) as String?)?.trim();
        if (uploadedUrl == null || uploadedUrl.isEmpty) {
          throw const ApiException('Upload failed: missing media URL');
        }
        mediaJson = {'type': media.type, 'url': uploadedUrl};
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
    final theme = Theme.of(context);
    final tokens =
        theme.extension<AppSemanticColors>() ??
        (theme.brightness == Brightness.dark
            ? AppSemanticColors.dark
            : AppSemanticColors.light);
    return DraggableScrollableSheet(
      initialChildSize: 0.75,
      minChildSize: 0.4,
      maxChildSize: 0.95,
      snap: true,
      builder: (context, sheetScrollController) {
        return Container(
          decoration: BoxDecoration(
            color: tokens.panel,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
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
                    color: tokens.textMuted.withValues(alpha: 0.5),
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
                    LanguageController.instance.t('reels.comments.title'),
                    style: TextStyle(
                      color: tokens.text,
                      fontWeight: FontWeight.w700,
                      fontSize: 15,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 10),
              Container(height: 1, color: tokens.panelBorder),

              // Comment list
              Expanded(
                child: _comments.isEmpty && !_loading
                    ? Center(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(
                              Icons.chat_bubble_outline_rounded,
                              size: 40,
                              color: tokens.textMuted,
                            ),
                            SizedBox(height: 10),
                            Text(
                              LanguageController.instance.t('reels.comments.empty'),
                              style: TextStyle(
                                color: tokens.textMuted,
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
                            return Padding(
                              padding: EdgeInsets.symmetric(vertical: 20),
                              child: Center(
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: tokens.primary,
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
                            userLanguage: _userLanguage,
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
                  color: tokens.panel,
                  padding: EdgeInsets.fromLTRB(
                    16,
                    12,
                    16,
                    12 + MediaQuery.of(context).viewPadding.bottom,
                  ),
                  child: Text(
                    LanguageController.instance.t('reels.commentsTurnedOff'),
                    style: TextStyle(color: tokens.textMuted, fontSize: 13),
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
    this.userLanguage = 'en',
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
  final String userLanguage;

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
  String? _translatedText;
  bool _isTranslating = false;
  final List<TapGestureRecognizer> _urlRecognizers = [];

  static final _urlRegex = RegExp(
    "https?://[^\\s<>()\\[\\]{}\"']+",
    caseSensitive: false,
  );
  static String _stripTrailing(String url) =>
      url.replaceAll(RegExp(r'[),.;!?]+$'), '');

  List<InlineSpan> _buildContentSpans(String text, Color textColor) {
    for (final r in _urlRecognizers) {
      r.dispose();
    }
    _urlRecognizers.clear();
    final baseStyle = TextStyle(
      color: textColor,
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
          content: Text(isPinned ? LanguageController.instance.t('reels.comments.unpinned') : LanguageController.instance.t('reels.comments.pinned')),
          backgroundColor: const Color(0xFF1A2235),
          duration: const Duration(seconds: 2),
        ),
      );
    } catch (_) {
      widget.onPinToggled?.call(widget.comment.id, isPinned);
    }
  }

  void _showCommentMenu() {
    final showTranslate =
        (widget.comment.lang != null &&
            widget.comment.lang != widget.userLanguage) ||
        _translatedText != null;
    final actions = <CommentSheetAction>[
      if (showTranslate)
        CommentSheetAction(
          icon: Icons.translate_rounded,
          label: _translatedText != null
              ? LanguageController.instance.t('reels.comments.hideTranslation')
              : LanguageController.instance.t('reels.comments.translate'),
          onTap: _translateComment,
        ),
      if (_isPostOwner && widget.depth == 0)
        CommentSheetAction(
          icon: Icons.push_pin_rounded,
          label: widget.comment.pinnedAt != null
              ? LanguageController.instance.t('reels.comments.unpin')
              : LanguageController.instance.t('reels.comments.pin'),
          onTap: _onPinComment,
        ),
      if (_isOwnComment) ...[
        CommentSheetAction(
          icon: Icons.edit_outlined,
          label: LanguageController.instance.t('reels.commentMenu.edit'),
          onTap: _onEditComment,
        ),
        CommentSheetAction(
          icon: Icons.delete_outline_rounded,
          label: LanguageController.instance.t('reels.commentMenu.delete'),
          onTap: _onDeleteComment,
          danger: true,
        ),
      ] else ...[
        CommentSheetAction(
          icon: Icons.flag_outlined,
          label: LanguageController.instance.t('reels.commentMenu.report'),
          onTap: _onReportComment,
        ),
        CommentSheetAction(
          icon: Icons.block_rounded,
          label: LanguageController.instance.t('reels.commentMenu.block'),
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
          if (mounted) setState(() { _content = newContent; _translatedText = null; });
        },
      ),
    );
  }

  Future<void> _onDeleteComment() async {
    final confirmed = await showPostConfirmDialog(
      context,
      title: LanguageController.instance.t('reels.deleteComment.title'),
      message: LanguageController.instance.t('reels.deleteComment.message'),
      confirmLabel: LanguageController.instance.t('common.delete'),
      danger: true,
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
        SnackBar(
          content: Text(LanguageController.instance.t('reels.commentDeleted')),
          backgroundColor: const Color(0xFF1A2235),
          duration: const Duration(seconds: 2),
        ),
      );
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(LanguageController.instance.t('reels.failedDeleteComment')),
          backgroundColor: const Color(0xFFEF4444),
          duration: const Duration(seconds: 2),
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
        SnackBar(
          content: Text(LanguageController.instance.t('reels.reportSubmitted')),
          backgroundColor: const Color(0xFF1A2235),
          duration: const Duration(seconds: 2),
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
    final confirmed = await showPostConfirmDialog(
      context,
      title: LanguageController.instance.t('reels.blockUserDialog.title', {'username': username}),
      message: LanguageController.instance.t('reels.blockUserDialog.message', {'username': username}),
      confirmLabel: LanguageController.instance.t('common.block'),
      danger: true,
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
          content: Text(LanguageController.instance.t('reels.blocked', {'username': username})),
          backgroundColor: const Color(0xFF1A2235),
          duration: const Duration(seconds: 2),
        ),
      );
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(LanguageController.instance.t('reels.failedBlockUser')),
          backgroundColor: const Color(0xFFEF4444),
          duration: const Duration(seconds: 2),
        ),
      );
    }
  }

  Future<void> _translateComment() async {
    if (_translatedText != null) {
      setState(() => _translatedText = null);
      return;
    }
    setState(() => _isTranslating = true);
    try {
      final data = await ApiService.post(
        '/posts/${widget.postId}/comments/${widget.comment.id}/translate'
        '?targetLang=${widget.userLanguage}',
        extraHeaders: widget.authHeader,
      );
      if (!mounted) return;
      setState(() {
        _translatedText = data['translatedText'] as String?;
        _isTranslating = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _isTranslating = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(LanguageController.instance.t('reels.failedTranslate')),
          backgroundColor: const Color(0xFFEF4444),
          duration: const Duration(seconds: 2),
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
    final theme = Theme.of(context);
    final tokens =
        theme.extension<AppSemanticColors>() ??
        (theme.brightness == Brightness.dark
            ? AppSemanticColors.dark
            : AppSemanticColors.light);
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
                                    style: TextStyle(
                                      color: tokens.text,
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
                                  Text(
                                    LanguageController.instance.t('reels.comments.pinnedBadge'),
                                    style: const TextStyle(
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
                            if (_isTranslating)
                              const Padding(
                                padding: EdgeInsets.symmetric(vertical: 4),
                                child: SizedBox(
                                  width: 14,
                                  height: 14,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 1.5,
                                    color: Color(0xFF4AA3E4),
                                  ),
                                ),
                              )
                            else if (_content.isNotEmpty)
                              LayoutBuilder(
                                builder: (context, constraints) {
                                  final displayText =
                                      _translatedText ?? _content;
                                  final tp = TextPainter(
                                    text: TextSpan(
                                      text: displayText,
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
                                            displayText,
                                            tokens.text,
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
                                                  ? LanguageController.instance.t('post.seeLess')
                                                  : LanguageController.instance.t('post.seeMore'),
                                              style: const TextStyle(
                                                color: Color(0xFF4AA3E4),
                                                fontSize: 13,
                                                fontWeight: FontWeight.w600,
                                              ),
                                            ),
                                          ),
                                        ),
                                      if (_translatedText != null)
                                        Padding(
                                          padding: const EdgeInsets.only(top: 3),
                                          child: Text(
                                            LanguageController.instance.t('reels.comments.translated'),
                                            style: const TextStyle(
                                              color: Color(0xFF7A8BB0),
                                              fontSize: 11,
                                              fontStyle: FontStyle.italic,
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
                                  behavior: HitTestBehavior.opaque,
                                  onLongPress: () => showCommentLikesSheet(
                                    context,
                                    postId: widget.postId,
                                    commentId: widget.comment.id,
                                    viewerId: widget.viewerId,
                                  ),
                                  child: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      _RIconLike(
                                        size: 18,
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
                                  child: Text(
                                    LanguageController.instance.t('reels.comments.reply'),
                                    style: const TextStyle(
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
                                            ? LanguageController.instance.t('reels.comments.hideReplies')
                                            : '${LanguageController.instance.t('reels.comments.viewReplies')}${displayReplyCount > 0 ? " ($displayReplyCount)" : ""}',
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
              userLanguage: widget.userLanguage,
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
                        : Text(
                            LanguageController.instance.t('reels.comments.loadMoreReplies'),
                            style: const TextStyle(
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
                    child: Text(
                      LanguageController.instance.t('common.retry'),
                      style: const TextStyle(
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
  static final RegExp _mentionCharRegex = RegExp(r'^[A-Za-z0-9_.]{0,30}$');

  final _textCtrl = TextEditingController();
  final _focusNode = FocusNode();
  _RCommentMediaData? _media;
  bool _sending = false;
  Timer? _mentionDebounce;
  bool _mentionOpen = false;
  bool _mentionLoading = false;
  List<_RCommentMentionSuggestion> _mentionSuggestions = [];
  _RMentionToken? _activeMentionToken;

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
    _mentionDebounce?.cancel();
    _textCtrl.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  void _onTextChanged(String value) {
    final token = _extractMentionToken(value);
    final query = token?.query ?? '';
    if (query.isEmpty) {
      _activeMentionToken = null;
      _clearMentionState();
      return;
    }
    _activeMentionToken = token;

    _mentionDebounce?.cancel();
    _mentionDebounce = Timer(const Duration(milliseconds: 250), () {
      _searchMentions(query);
    });

    if (!_mentionOpen) {
      setState(() {
        _mentionOpen = true;
        _mentionLoading = true;
      });
    }
  }

  void _clearMentionState() {
    _mentionDebounce?.cancel();
    if (!_mentionOpen && _mentionSuggestions.isEmpty && !_mentionLoading) {
      return;
    }
    setState(() {
      _mentionOpen = false;
      _mentionLoading = false;
      _mentionSuggestions = [];
    });
  }

  _RMentionToken? _extractMentionToken(String text) {
    final selection = _textCtrl.selection;
    var caret = selection.baseOffset;
    if (caret < 0 || caret > text.length) caret = text.length;

    final prefix = text.substring(0, caret);
    final atIndex = prefix.lastIndexOf('@');
    if (atIndex < 0) return null;

    if (atIndex > 0) {
      final prev = prefix[atIndex - 1];
      final isBoundary = RegExp(r'\s').hasMatch(prev);
      if (!isBoundary) return null;
    }

    final query = prefix.substring(atIndex + 1);
    if (!_mentionCharRegex.hasMatch(query)) return null;
    if (query.isEmpty)
      return _RMentionToken(start: atIndex, end: caret, query: '');

    return _RMentionToken(start: atIndex, end: caret, query: query);
  }

  Future<void> _searchMentions(String query) async {
    final token = AuthStorage.accessToken;
    if (token == null || query.trim().isEmpty) {
      if (mounted) _clearMentionState();
      return;
    }

    if (mounted) {
      setState(() {
        _mentionOpen = true;
        _mentionLoading = true;
      });
    }

    try {
      final result = await ApiService.get(
        '/profiles/search?q=${Uri.encodeQueryComponent(query)}&limit=6',
        extraHeaders: {'Authorization': 'Bearer $token'},
      );
      final items =
          (result['items'] as List?)
              ?.whereType<Map<String, dynamic>>()
              .map(_RCommentMentionSuggestion.fromJson)
              .toList() ??
          [];

      if (!mounted) return;
      setState(() {
        _mentionSuggestions = items;
        _mentionOpen = true;
        _mentionLoading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _mentionSuggestions = [];
        _mentionOpen = true;
        _mentionLoading = false;
      });
    }
  }

  void _insertMention(_RCommentMentionSuggestion suggestion) {
    final text = _textCtrl.text;
    final token = _activeMentionToken ?? _extractMentionToken(text);
    if (token == null) return;

    final before = text.substring(0, token.start);
    final after = text.substring(token.end);
    final inserted = '$before@${suggestion.username} $after';

    _textCtrl.value = TextEditingValue(
      text: inserted,
      selection: TextSelection.collapsed(
        offset: before.length + suggestion.username.length + 2,
      ),
    );

    setState(() {
      _mentionOpen = false;
      _mentionLoading = false;
      _mentionSuggestions = [];
    });
    _activeMentionToken = null;
  }

  Future<void> _pickMedia() async {
    final picker = ImagePicker();
    final picked = await picker.pickMedia();
    if (picked == null || !mounted) return;
    final mediaType = _detectReelCommentMediaType(picked);
    setState(() {
      _media = _RCommentMediaData(type: mediaType, file: picked);
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
        _mentionOpen = false;
        _mentionLoading = false;
        _mentionSuggestions = [];
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _sending = false);
      final theme = Theme.of(context);
      final tokens =
          theme.extension<AppSemanticColors>() ??
          (theme.brightness == Brightness.dark
              ? AppSemanticColors.dark
              : AppSemanticColors.light);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(LanguageController.instance.t('reels.failedPostComment', {'error': e.toString()})),
          backgroundColor: tokens.panelMuted,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final tokens =
        theme.extension<AppSemanticColors>() ??
        (theme.brightness == Brightness.dark
            ? AppSemanticColors.dark
            : AppSemanticColors.light);
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;
    final hasContent = _textCtrl.text.trim().isNotEmpty || _media != null;

    return Container(
      color: tokens.panel,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(height: 1, color: tokens.panelBorder),
          // Reply banner
          if (widget.replyTarget != null)
            Container(
              color: tokens.panelMuted,
              padding: const EdgeInsets.fromLTRB(14, 6, 8, 6),
              child: Row(
                children: [
                  Icon(Icons.reply_rounded, size: 14, color: tokens.primary),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      LanguageController.instance.t('reels.comments.replyingTo', {'username': widget.replyTarget!.username ?? 'user'}),
                      style: TextStyle(color: tokens.primary, fontSize: 12),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  GestureDetector(
                    onTap: widget.onCancelReply,
                    child: Padding(
                      padding: EdgeInsets.all(4),
                      child: Icon(
                        Icons.close_rounded,
                        size: 16,
                        color: tokens.textMuted,
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
          if (_mentionOpen)
            Container(
              margin: const EdgeInsets.fromLTRB(12, 6, 12, 0),
              decoration: BoxDecoration(
                color: tokens.panelMuted,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: tokens.panelBorder),
              ),
              child: _mentionLoading
                  ? Padding(
                      padding: EdgeInsets.all(12),
                      child: Row(
                        children: [
                          SizedBox(
                            width: 14,
                            height: 14,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: tokens.primary,
                            ),
                          ),
                          SizedBox(width: 10),
                          Text(
                            LanguageController.instance.t('reels.comments.searchingUsers'),
                            style: TextStyle(
                              color: tokens.textMuted,
                              fontSize: 12,
                            ),
                          ),
                        ],
                      ),
                    )
                  : _mentionSuggestions.isEmpty
                  ? Padding(
                      padding: EdgeInsets.all(12),
                      child: Text(
                        LanguageController.instance.t('reels.comments.noUsers'),
                        style: TextStyle(color: tokens.textMuted, fontSize: 12),
                      ),
                    )
                  : Column(
                      mainAxisSize: MainAxisSize.min,
                      children: _mentionSuggestions.map((s) {
                        return Material(
                          color: Colors.transparent,
                          child: InkWell(
                            onTap: () => _insertMention(s),
                            child: Padding(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 10,
                                vertical: 8,
                              ),
                              child: Row(
                                children: [
                                  CircleAvatar(
                                    radius: 14,
                                    backgroundColor: tokens.panel,
                                    backgroundImage:
                                        (s.avatarUrl != null &&
                                            s.avatarUrl!.isNotEmpty)
                                        ? NetworkImage(s.avatarUrl!)
                                        : null,
                                    child:
                                        (s.avatarUrl == null ||
                                            s.avatarUrl!.isEmpty)
                                        ? Icon(
                                            Icons.person,
                                            color: tokens.textMuted,
                                            size: 14,
                                          )
                                        : null,
                                  ),
                                  const SizedBox(width: 10),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          '@${s.username}',
                                          style: TextStyle(
                                            color: tokens.text,
                                            fontSize: 13,
                                            fontWeight: FontWeight.w600,
                                          ),
                                          overflow: TextOverflow.ellipsis,
                                        ),
                                        if ((s.displayName ?? '').isNotEmpty)
                                          Text(
                                            s.displayName!,
                                            style: TextStyle(
                                              color: tokens.textMuted,
                                              fontSize: 12,
                                            ),
                                            overflow: TextOverflow.ellipsis,
                                          ),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        );
                      }).toList(),
                    ),
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
                      color: tokens.panelMuted,
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: tokens.panelBorder),
                    ),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.center,
                      children: [
                        Expanded(
                          child: TextField(
                            controller: _textCtrl,
                            focusNode: _focusNode,
                            onChanged: (value) {
                              _onTextChanged(value);
                              setState(() {});
                            },
                            maxLines: 4,
                            minLines: 1,
                            style: TextStyle(color: tokens.text, fontSize: 14),
                            decoration: InputDecoration(
                              hintText: LanguageController.instance.t('reels.comments.placeholder'),
                              hintStyle: TextStyle(
                                color: tokens.textMuted,
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
                            icon: Icon(
                              Icons.image_outlined,
                              color: tokens.textMuted,
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
                                    color: tokens.primary,
                                    width: 1.2,
                                  ),
                                  borderRadius: BorderRadius.circular(3),
                                ),
                                child: Text(
                                  'GIF',
                                  style: TextStyle(
                                    color: tokens.primary,
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
                            icon: SvgPicture.string(
                              '''
<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <rect x="4" y="4" width="16" height="16" rx="4" stroke="currentColor" stroke-width="1.6" fill="none"/>
  <circle cx="10" cy="11" r="1" fill="currentColor"/>
  <circle cx="14" cy="11" r="1" fill="currentColor"/>
  <path d="M9 15c1.2 1 4.8 1 6 0" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/>
</svg>''',
                              width: 17,
                              height: 17,
                              colorFilter: ColorFilter.mode(
                                tokens.textMuted,
                                BlendMode.srcIn,
                              ),
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
                          ? tokens.primary
                          : tokens.panelMuted,
                    ),
                    child: _sending
                        ? Padding(
                            padding: EdgeInsets.all(10),
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: scheme.onPrimary,
                            ),
                          )
                        : Icon(
                            Icons.send_rounded,
                            color: hasContent
                                ? scheme.onPrimary
                                : tokens.textMuted,
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

class _RCommentMentionSuggestion {
  const _RCommentMentionSuggestion({
    required this.username,
    this.displayName,
    this.avatarUrl,
  });

  final String username;
  final String? displayName;
  final String? avatarUrl;

  static _RCommentMentionSuggestion fromJson(Map<String, dynamic> json) {
    return _RCommentMentionSuggestion(
      username: (json['username'] as String? ?? '').trim(),
      displayName: json['displayName'] as String?,
      avatarUrl: json['avatarUrl'] as String?,
    );
  }
}

class _RMentionToken {
  const _RMentionToken({
    required this.start,
    required this.end,
    required this.query,
  });

  final int start;
  final int end;
  final String query;
}

// ── Media preview chip ────────────────────────────────────────────────────────

class _RMediaPreview extends StatelessWidget {
  const _RMediaPreview({required this.media, required this.onRemove});
  final _RCommentMediaData media;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final tokens =
        theme.extension<AppSemanticColors>() ??
        (theme.brightness == Brightness.dark
            ? AppSemanticColors.dark
            : AppSemanticColors.light);
    Widget thumb;
    if (media.type == 'video') {
      thumb = Container(
        width: 80,
        height: 80,
        decoration: BoxDecoration(
          color: tokens.panelMuted,
          borderRadius: BorderRadius.circular(8),
        ),
        child: Center(
          child: Icon(
            Icons.play_circle_fill_rounded,
            color: tokens.primary,
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
              Container(width: 80, height: 80, color: tokens.panelMuted),
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
                    color: tokens.panel,
                    shape: BoxShape.circle,
                    border: Border.all(color: tokens.panelBorder),
                  ),
                  child: Icon(Icons.close, color: tokens.text, size: 12),
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
    final theme = Theme.of(context);
    final tokens =
        theme.extension<AppSemanticColors>() ??
        (theme.brightness == Brightness.dark
            ? AppSemanticColors.dark
            : AppSemanticColors.light);
    final lc = LanguageController.instance;
    final title = widget.mode == 'sticker' ? lc.t('reels.gif.stickers') : lc.t('reels.gif.gifs');
    return DraggableScrollableSheet(
      initialChildSize: 0.6,
      minChildSize: 0.4,
      maxChildSize: 0.92,
      snap: true,
      builder: (ctx, scrollCtrl) => Container(
        decoration: BoxDecoration(
          color: tokens.panel,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
        ),
        child: Column(
          children: [
            Container(
              margin: const EdgeInsets.only(top: 10, bottom: 4),
              width: 36,
              height: 4,
              decoration: BoxDecoration(
                color: tokens.textMuted.withValues(alpha: 0.5),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
              child: Row(
                children: [
                  Text(
                    title,
                    style: TextStyle(
                      color: tokens.text,
                      fontWeight: FontWeight.w700,
                      fontSize: 16,
                    ),
                  ),
                  const Spacer(),
                  Text(
                    'Powered by GIPHY',
                    style: TextStyle(color: tokens.textMuted, fontSize: 10),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
              child: TextField(
                controller: _searchCtrl,
                style: TextStyle(color: tokens.text, fontSize: 14),
                decoration: InputDecoration(
                  hintText: lc.t('reels.gif.search', {'title': title}),
                  hintStyle: TextStyle(color: tokens.textMuted),
                  prefixIcon: Icon(
                    Icons.search_rounded,
                    color: tokens.textMuted,
                    size: 20,
                  ),
                  filled: true,
                  fillColor: tokens.panelMuted,
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
                  ? Center(
                      child: CircularProgressIndicator(color: tokens.primary),
                    )
                  : _error != null
                  ? Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            _error!,
                            style: TextStyle(color: tokens.textMuted),
                          ),
                          const SizedBox(height: 8),
                          TextButton(
                            onPressed: () => _fetch(_searchCtrl.text),
                            child: Text(
                              lc.t('common.retry'),
                              style: TextStyle(color: tokens.primary),
                            ),
                          ),
                        ],
                      ),
                    )
                  : _items.isEmpty
                  ? Center(
                      child: Text(
                        lc.t('reels.gif.noResults'),
                        style: TextStyle(color: tokens.textMuted),
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
                                      color: tokens.panelMuted,
                                      child: Center(
                                        child: CircularProgressIndicator(
                                          strokeWidth: 1.5,
                                          color: tokens.primary,
                                        ),
                                      ),
                                    ),
                              errorBuilder: (_, __, ___) =>
                                  Container(color: tokens.panelMuted),
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
          Text(
            LanguageController.instance.t('reels.linkPreview.author'),
            style: const TextStyle(
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
        : preview.domain?.trim() ?? LanguageController.instance.t('reels.linkPreview.openLink');
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
  final lc = LanguageController.instance;
  try {
    final dt = DateTime.parse(iso).toLocal();
    final diff = DateTime.now().difference(dt);
    if (diff.isNegative) return lc.t('post.time.justNow');
    final mins = (diff.inSeconds / 60).round();
    if (mins < 1) return lc.t('post.time.justNow');
    if (mins < 2) return lc.t('post.time.minuteAgo', {'n': '1'});
    if (mins < 45) return lc.t('post.time.minutesAgo', {'n': '$mins'});
    if (mins < 90) return lc.t('post.time.aboutHourAgo');
    if (mins < 1440) return lc.t('post.time.hoursAgo', {'n': '${(mins / 60).round()}'});
    if (mins < 2520) return lc.t('post.time.dayAgo');
    if (mins < 43200) return lc.t('post.time.daysAgo', {'n': '${(mins / 1440).round()}'});
    if (mins < 86400) return lc.t('post.time.monthsAgo', {'n': '${(mins / 43200).round()}'});
    const int minsPerYear = 525960;
    if (mins < minsPerYear) return lc.t('post.time.monthsAgo', {'n': '${(mins / 43200).round()}'});
    final months = (mins / 43200).round();
    if (months < 15) return lc.t('post.time.aboutYearAgo');
    if (months < 21) return lc.t('post.time.overYearAgo');
    if (months < 24) return lc.t('post.time.almostTwoYearsAgo');
    final years = months ~/ 12;
    final rem = months % 12;
    if (rem < 3) return lc.t('post.time.aboutYearsAgo', {'n': '$years'});
    if (rem < 9) return lc.t('post.time.overYearsAgo', {'n': '$years'});
    return lc.t('post.time.almostYearsAgo', {'n': '${years + 1}'});
  } catch (_) {
    return '';
  }
}
