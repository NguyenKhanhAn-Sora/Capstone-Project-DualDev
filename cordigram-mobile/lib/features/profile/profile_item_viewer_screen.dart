import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:video_player/video_player.dart';
import '../home/models/feed_post.dart';
import '../home/services/post_interaction_service.dart';
import '../post/post_detail_screen.dart';
import '../reels/reels_screen.dart' show ReelCommentSheet;

Map<String, dynamic>? _asStringKeyMap(dynamic raw) {
  if (raw is Map<String, dynamic>) return raw;
  if (raw is Map) {
    return raw.map((k, v) => MapEntry(k.toString(), v));
  }
  return null;
}

String? _pickString(List<dynamic> values) {
  for (final v in values) {
    if (v is String) {
      final s = v.trim();
      if (s.isNotEmpty) return s;
    }
  }
  return null;
}

Map<String, dynamic> _normalizeItem(
  Map<String, dynamic> raw, {
  String? fallbackAuthorId,
  String? fallbackAuthorUsername,
  String? fallbackAuthorDisplayName,
  String? fallbackAuthorAvatarUrl,
}) {
  final item = Map<String, dynamic>.from(raw);

  final author = _asStringKeyMap(item['author']) ?? <String, dynamic>{};
  final repostOfAuthor =
      _asStringKeyMap(item['repostOfAuthor']) ?? <String, dynamic>{};
  final repostSourceProfile =
      _asStringKeyMap(item['repostSourceProfile']) ?? <String, dynamic>{};
  final repostedBy = _asStringKeyMap(item['repostedBy']) ?? <String, dynamic>{};

  author['id'] ??= _pickString([
    item['authorId'],
    item['userId'],
    repostedBy['id'],
    repostedBy['userId'],
    fallbackAuthorId,
  ]);
  author['username'] ??= _pickString([
    item['authorUsername'],
    item['username'],
    item['ownerUsername'],
    item['postedByUsername'],
    item['repostedByUsername'],
    repostedBy['username'],
    fallbackAuthorUsername,
  ]);
  author['displayName'] ??= _pickString([
    item['authorDisplayName'],
    item['displayName'],
    item['ownerDisplayName'],
    item['postedByDisplayName'],
    item['repostedByDisplayName'],
    repostedBy['displayName'],
    fallbackAuthorDisplayName,
  ]);
  author['avatarUrl'] ??= _pickString([
    item['authorAvatarUrl'],
    item['avatarUrl'],
    item['ownerAvatarUrl'],
    item['postedByAvatarUrl'],
    item['repostedByAvatarUrl'],
    repostedBy['avatarUrl'],
    fallbackAuthorAvatarUrl,
  ]);
  author['isCreatorVerified'] ??=
      item['authorIsCreatorVerified'] ?? item['isVerified'];

  item['author'] = author;
  item['authorId'] ??= author['id'];
  item['authorUsername'] ??= author['username'];
  item['authorDisplayName'] ??= author['displayName'];
  item['authorAvatarUrl'] ??= author['avatarUrl'];

  final repostOf = _pickString([item['repostOf']]);
  if (repostOf != null) {
    item['repostOf'] = repostOf;
    repostOfAuthor['id'] ??= _pickString([
      item['repostOfAuthorId'],
      repostSourceProfile['id'],
      repostSourceProfile['userId'],
      item['originAuthorId'],
    ]);
    repostOfAuthor['username'] ??= _pickString([
      item['repostOfAuthorUsername'],
      repostSourceProfile['username'],
      item['originAuthorUsername'],
      item['sourceAuthorUsername'],
    ]);
    repostOfAuthor['displayName'] ??= _pickString([
      item['repostOfAuthorDisplayName'],
      repostSourceProfile['displayName'],
      item['originAuthorDisplayName'],
      item['sourceAuthorDisplayName'],
    ]);
    repostOfAuthor['avatarUrl'] ??= _pickString([
      item['repostOfAuthorAvatarUrl'],
      repostSourceProfile['avatarUrl'],
      item['originAuthorAvatarUrl'],
      item['sourceAuthorAvatarUrl'],
    ]);

    if (repostOfAuthor.isNotEmpty) {
      item['repostOfAuthor'] = repostOfAuthor;
      item['repostOfAuthorId'] ??= repostOfAuthor['id'];
      item['repostOfAuthorUsername'] ??= repostOfAuthor['username'];
      item['repostOfAuthorDisplayName'] ??= repostOfAuthor['displayName'];
      item['repostOfAuthorAvatarUrl'] ??= repostOfAuthor['avatarUrl'];
    }
  }

  return item;
}

String _resolveRepostOriginName(Map<String, dynamic> item) {
  final repostOfAuthor = _asStringKeyMap(item['repostOfAuthor']);
  final resolved = _pickString([
    repostOfAuthor?['displayName'],
    item['repostOfAuthorDisplayName'],
    repostOfAuthor?['username'],
    item['repostOfAuthorUsername'],
  ]);
  if (resolved == null) {
    debugPrint(
      '[ProfileRepostOriginMissing] '
      'itemId=${item['id']} repostOf=${item['repostOf']} '
      'repostOfAuthorUsername=${item['repostOfAuthorUsername']} '
      'repostOfAuthorDisplayName=${item['repostOfAuthorDisplayName']} '
      'repostOfAuthorMap=${item['repostOfAuthor']}',
    );
  }
  return resolved ?? 'Original Author';
}

FeedPostState? _toFeedPostState(
  Map<String, dynamic> raw, {
  String? fallbackAuthorId,
  String? fallbackAuthorUsername,
  String? fallbackAuthorDisplayName,
  String? fallbackAuthorAvatarUrl,
}) {
  try {
    final normalized = _normalizeItem(
      raw,
      fallbackAuthorId: fallbackAuthorId,
      fallbackAuthorUsername: fallbackAuthorUsername,
      fallbackAuthorDisplayName: fallbackAuthorDisplayName,
      fallbackAuthorAvatarUrl: fallbackAuthorAvatarUrl,
    );
    return FeedPostState(post: FeedPost.fromJson(normalized));
  } catch (_) {
    return null;
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

/// Full-screen horizontal swipe viewer for posts/reels shown in a profile tab.
/// Mirrors the web's "profile post nav" (up/down arrows) but as left/right swipe.
class ProfileItemViewerScreen extends StatefulWidget {
  const ProfileItemViewerScreen({
    super.key,
    required this.items,
    required this.initialIndex,
    this.viewerId,
    this.profileUsername,
    this.profileDisplayName,
    this.profileAvatarUrl,
    this.profileUserId,
  });

  /// All items in the current profile tab (posts / reels / saved / repost).
  final List<Map<String, dynamic>> items;

  /// The item that was tapped — used as the first page.
  final int initialIndex;

  final String? viewerId;
  final String? profileUsername;
  final String? profileDisplayName;
  final String? profileAvatarUrl;
  final String? profileUserId;

  @override
  State<ProfileItemViewerScreen> createState() =>
      _ProfileItemViewerScreenState();
}

class _ProfileItemViewerScreenState extends State<ProfileItemViewerScreen> {
  late final PageController _pageController;
  int _currentIndex = 0;

  /// Lazily-initialized video controllers keyed by item list index.
  final Map<int, VideoPlayerController> _controllers = {};

  static const Color _bg = Colors.black;

  @override
  void initState() {
    super.initState();
    _currentIndex = widget.initialIndex;
    _pageController = PageController(initialPage: widget.initialIndex);
    _initController(_currentIndex);
    _initController(_currentIndex + 1);
    if (_currentIndex > 0) _initController(_currentIndex - 1);
  }

  @override
  void dispose() {
    _pageController.dispose();
    for (final c in _controllers.values) {
      c.dispose();
    }
    super.dispose();
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  bool _isVideo(Map<String, dynamic> item) {
    final kind = (item['repostKind'] as String?) ?? (item['kind'] as String?);
    if (kind == 'reel') return true;
    final media = item['media'] as List?;
    if (media != null && media.isNotEmpty) {
      final first = media[0] as Map?;
      if (first != null && first['type'] == 'video') return true;
    }
    return false;
  }

  String? _videoUrl(Map<String, dynamic> item) {
    final media = item['media'] as List?;
    if (media != null && media.isNotEmpty) {
      final first = media[0] as Map?;
      return first?['url'] as String?;
    }
    return null;
  }

  // ── Controller lifecycle ───────────────────────────────────────────────────

  Future<void> _initController(int index) async {
    if (index < 0 || index >= widget.items.length) return;
    if (_controllers.containsKey(index)) return;
    if (!_isVideo(widget.items[index])) return;

    final url = _videoUrl(widget.items[index]);
    if (url == null || url.isEmpty) return;

    final ctrl = VideoPlayerController.networkUrl(Uri.parse(url));
    _controllers[index] = ctrl;

    try {
      await ctrl.initialize();
      if (!mounted) return;
      ctrl.setLooping(true);
      if (index == _currentIndex) ctrl.play();
      if (mounted) setState(() {});
    } catch (_) {
      _controllers.remove(index)?.dispose();
    }
  }

  void _onPageChanged(int index) {
    _controllers[_currentIndex]?.pause();
    setState(() => _currentIndex = index);
    _controllers[index]?.play();

    _initController(index - 1);
    _initController(index + 1);

    // Dispose controllers that are more than 2 pages away.
    final toRemove = _controllers.keys
        .where((k) => (k - index).abs() > 2)
        .toList();
    for (final k in toRemove) {
      _controllers.remove(k)?.dispose();
    }
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        backgroundColor: _bg,
        extendBodyBehindAppBar: true,
        appBar: AppBar(
          backgroundColor: const Color(0xCC000000),
          elevation: 0,
          leading: IconButton(
            icon: const Icon(
              Icons.arrow_back_ios_new_rounded,
              color: Colors.white,
              size: 20,
            ),
            onPressed: () => Navigator.of(context).pop(),
          ),
          title: widget.profileUsername != null
              ? Text(
                  '@${widget.profileUsername}',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                  ),
                )
              : null,
          centerTitle: true,
          actions: [
            Padding(
              padding: const EdgeInsets.only(right: 16),
              child: Center(
                child: Text(
                  '${_currentIndex + 1} / ${widget.items.length}',
                  style: const TextStyle(
                    color: Color(0xFFAABBCC),
                    fontSize: 13,
                  ),
                ),
              ),
            ),
          ],
        ),
        body: PageView.builder(
          controller: _pageController,
          onPageChanged: _onPageChanged,
          itemCount: widget.items.length,
          itemBuilder: (context, index) => _ItemPage(
            key: ValueKey(index),
            item: widget.items[index],
            isActive: index == _currentIndex,
            controller: _controllers[index],
            viewerId: widget.viewerId,
            profileUsername: widget.profileUsername,
            profileDisplayName: widget.profileDisplayName,
            profileAvatarUrl: widget.profileAvatarUrl,
            profileUserId: widget.profileUserId,
          ),
        ),
      ),
    );
  }
}

// ── Vertical reel-only viewer (Profile nav -> Reels) ───────────────────────

class ProfileReelViewerScreen extends StatefulWidget {
  const ProfileReelViewerScreen({
    super.key,
    required this.items,
    required this.initialIndex,
    this.viewerId,
    this.profileUsername,
    this.profileDisplayName,
    this.profileAvatarUrl,
    this.profileUserId,
  });

  final List<Map<String, dynamic>> items;
  final int initialIndex;
  final String? viewerId;
  final String? profileUsername;
  final String? profileDisplayName;
  final String? profileAvatarUrl;
  final String? profileUserId;

  @override
  State<ProfileReelViewerScreen> createState() =>
      _ProfileReelViewerScreenState();
}

class _ProfileReelViewerScreenState extends State<ProfileReelViewerScreen> {
  late final PageController _pageController;
  int _currentIndex = 0;
  final Map<int, VideoPlayerController> _controllers = {};

  @override
  void initState() {
    super.initState();
    _currentIndex = widget.initialIndex.clamp(0, widget.items.length - 1);
    _pageController = PageController(initialPage: _currentIndex);
    _initController(_currentIndex);
    _initController(_currentIndex + 1);
    if (_currentIndex > 0) _initController(_currentIndex - 1);
  }

  @override
  void dispose() {
    _pageController.dispose();
    for (final c in _controllers.values) {
      c.dispose();
    }
    super.dispose();
  }

  String? _videoUrl(Map<String, dynamic> item) {
    final media = item['media'] as List?;
    if (media != null && media.isNotEmpty) {
      final first = media[0] as Map?;
      return first?['url'] as String?;
    }
    return null;
  }

  Future<void> _initController(int index) async {
    if (index < 0 || index >= widget.items.length) return;
    if (_controllers.containsKey(index)) return;
    final url = _videoUrl(widget.items[index]);
    if (url == null || url.isEmpty) return;

    final ctrl = VideoPlayerController.networkUrl(Uri.parse(url));
    _controllers[index] = ctrl;
    try {
      await ctrl.initialize();
      if (!mounted) return;
      ctrl.setLooping(true);
      if (index == _currentIndex) ctrl.play();
      if (mounted) setState(() {});
    } catch (_) {
      _controllers.remove(index)?.dispose();
    }
  }

  void _onPageChanged(int index) {
    _controllers[_currentIndex]?.pause();
    setState(() => _currentIndex = index);
    _controllers[index]?.play();

    _initController(index - 1);
    _initController(index + 1);

    final toRemove = _controllers.keys
        .where((k) => (k - index).abs() > 2)
        .toList();
    for (final k in toRemove) {
      _controllers.remove(k)?.dispose();
    }
  }

  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        backgroundColor: Colors.black,
        body: Stack(
          children: [
            PageView.builder(
              controller: _pageController,
              scrollDirection: Axis.vertical,
              onPageChanged: _onPageChanged,
              itemCount: widget.items.length,
              itemBuilder: (context, index) => _ItemPage(
                key: ValueKey('reel-$index'),
                item: widget.items[index],
                isActive: index == _currentIndex,
                controller: _controllers[index],
                viewerId: widget.viewerId,
                forceReelUi: true,
                totalCount: widget.items.length,
                pageIndex: index,
                onBack: () => Navigator.of(context).pop(),
                profileUsername: widget.profileUsername,
                profileDisplayName: widget.profileDisplayName,
                profileAvatarUrl: widget.profileAvatarUrl,
                profileUserId: widget.profileUserId,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Single item page ──────────────────────────────────────────────────────────

class _ItemPage extends StatefulWidget {
  const _ItemPage({
    super.key,
    required this.item,
    required this.isActive,
    this.controller,
    this.viewerId,
    this.forceReelUi = false,
    this.totalCount = 0,
    this.pageIndex = 0,
    this.onBack,
    this.profileUsername,
    this.profileDisplayName,
    this.profileAvatarUrl,
    this.profileUserId,
  });

  final Map<String, dynamic> item;
  final bool isActive;
  final VideoPlayerController? controller;
  final String? viewerId;
  final bool forceReelUi;
  final int totalCount;
  final int pageIndex;
  final VoidCallback? onBack;
  final String? profileUsername;
  final String? profileDisplayName;
  final String? profileAvatarUrl;
  final String? profileUserId;

  @override
  State<_ItemPage> createState() => _ItemPageState();
}

class _ItemPageState extends State<_ItemPage> {
  bool _showPauseIcon = false;
  Timer? _pauseIconTimer;
  late final PageController _mediaPageController;
  int _mediaIndex = 0;

  bool _muted = false;
  bool _liked = false;
  bool _saved = false;
  bool _following = false;

  @override
  void initState() {
    super.initState();
    _mediaPageController = PageController();
    widget.controller?.addListener(_onControllerUpdate);
    _bootstrapReelState();
  }

  @override
  void didUpdateWidget(_ItemPage old) {
    super.didUpdateWidget(old);
    if (old.controller != widget.controller) {
      old.controller?.removeListener(_onControllerUpdate);
      widget.controller?.addListener(_onControllerUpdate);
    }
  }

  @override
  void dispose() {
    _pauseIconTimer?.cancel();
    _mediaPageController.dispose();
    widget.controller?.removeListener(_onControllerUpdate);
    super.dispose();
  }

  void _bootstrapReelState() {
    final normalized = _normalizeItem(
      widget.item,
      fallbackAuthorId: widget.profileUserId,
      fallbackAuthorUsername: widget.profileUsername,
      fallbackAuthorDisplayName: widget.profileDisplayName,
      fallbackAuthorAvatarUrl: widget.profileAvatarUrl,
    );
    final stats = normalized['stats'] as Map?;
    _liked =
        (normalized['liked'] as bool?) ??
        (normalized['isLiked'] as bool?) ??
        false;
    _saved =
        (normalized['saved'] as bool?) ??
        (normalized['isSaved'] as bool?) ??
        false;
    _following =
        (normalized['following'] as bool?) ??
        (normalized['isFollowingAuthor'] as bool?) ??
        false;
    if (stats != null) {
      _liked = _liked || ((stats['likedByMe'] as bool?) ?? false);
      _saved = _saved || ((stats['savedByMe'] as bool?) ?? false);
    }
  }

  void _onControllerUpdate() {
    if (mounted) setState(() {});
  }

  void _handleVideoTap() {
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

  bool get _isVideo {
    final kind =
        (widget.item['repostKind'] as String?) ??
        (widget.item['kind'] as String?);
    if (kind == 'reel') return true;
    final media = widget.item['media'] as List?;
    if (media != null && media.isNotEmpty) {
      final first = media[0] as Map?;
      if (first != null && first['type'] == 'video') return true;
    }
    return false;
  }

  String? get _imageUrl {
    final media = widget.item['media'] as List?;
    if (media != null && media.isNotEmpty) {
      final first = media[0] as Map?;
      if (first != null) {
        final thumb = first['thumbnailUrl'] as String?;
        if (thumb != null && thumb.isNotEmpty) return thumb;
        return first['url'] as String?;
      }
    }
    return widget.item['coverImage'] as String?;
  }

  @override
  Widget build(BuildContext context) {
    if (widget.forceReelUi) return _buildReelPage();
    return _isVideo ? _buildReelPage() : _buildImagePage();
  }

  List<Map<String, dynamic>> get _mediaItems =>
      (widget.item['media'] as List?)
          ?.whereType<Map<String, dynamic>>()
          .toList() ??
      [];

  String? _mediaDisplayUrl(int index) {
    if (index < 0 || index >= _mediaItems.length) return null;
    final m = _mediaItems[index];
    final type = (m['type'] as String?) ?? '';
    if (type == 'video') {
      final thumb = m['thumbnailUrl'] as String?;
      if (thumb != null && thumb.isNotEmpty) return thumb;
    }
    return m['url'] as String?;
  }

  int _asInt(dynamic v) {
    if (v is int) return v;
    if (v is double) return v.toInt();
    return int.tryParse(v?.toString() ?? '') ?? 0;
  }

  String _fmtCountInt(int n) {
    if (n >= 1000000) return '${(n / 1000000).toStringAsFixed(1)}M';
    if (n >= 1000) return '${(n / 1000).toStringAsFixed(1)}K';
    return '$n';
  }

  Future<void> _onLikeTap() async {
    final id = widget.item['id'] as String? ?? '';
    if (id.isEmpty) return;
    final before = _liked;
    setState(() => _liked = !before);
    try {
      if (before) {
        await PostInteractionService.unlike(id);
      } else {
        await PostInteractionService.like(id);
      }
    } catch (_) {
      if (!mounted) return;
      setState(() => _liked = before);
    }
  }

  Future<void> _onSaveTap() async {
    final id = widget.item['id'] as String? ?? '';
    if (id.isEmpty) return;
    final before = _saved;
    setState(() => _saved = !before);
    try {
      if (before) {
        await PostInteractionService.unsave(id);
      } else {
        await PostInteractionService.save(id);
      }
    } catch (_) {
      if (!mounted) return;
      setState(() => _saved = before);
    }
  }

  Future<void> _onFollowTap() async {
    final authorId =
        (widget.item['authorId'] as String?) ??
        ((widget.item['author'] as Map?)?['id'] as String?) ??
        '';
    if (authorId.isEmpty) return;
    final before = _following;
    setState(() => _following = !before);
    try {
      if (before) {
        await PostInteractionService.unfollow(authorId);
      } else {
        await PostInteractionService.follow(authorId);
      }
    } catch (_) {
      if (!mounted) return;
      setState(() => _following = before);
    }
  }

  void _openPostDetail() {
    final itemId = widget.item['id'] as String? ?? '';
    if (itemId.isEmpty) return;
    final initialState = _toFeedPostState(
      widget.item,
      fallbackAuthorId: widget.profileUserId,
      fallbackAuthorUsername: widget.profileUsername,
      fallbackAuthorDisplayName: widget.profileDisplayName,
      fallbackAuthorAvatarUrl: widget.profileAvatarUrl,
    );
    widget.controller?.pause();
    Navigator.of(context)
        .push(
          MaterialPageRoute<void>(
            builder: (_) => PostDetailScreen(
              postId: itemId,
              initialState: initialState,
              viewerId: widget.viewerId,
            ),
          ),
        )
        .then((_) {
          if (mounted && widget.isActive) widget.controller?.play();
        });
  }

  void _openReelCommentsSheet() {
    final itemId = widget.item['id'] as String? ?? '';
    if (itemId.isEmpty) return;
    widget.controller?.pause();

    final authorId =
        (widget.item['authorId'] as String?) ??
        ((widget.item['author'] as Map?)?['id'] as String?);

    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) {
        return ReelCommentSheet(
          postId: itemId,
          viewerId: widget.viewerId,
          postAuthorId: authorId,
          onCommentAdded: () {
            if (!mounted) return;
            final stats = widget.item['stats'] as Map<String, dynamic>?;
            if (stats == null) return;
            final curr = _asInt(stats['comments']);
            setState(() {
              stats['comments'] = (curr + 1).clamp(0, 999999999);
            });
          },
        );
      },
    ).then((_) {
      if (mounted && widget.isActive) widget.controller?.play();
    });
  }

  Widget _buildReelPage() {
    final normalized = _normalizeItem(
      widget.item,
      fallbackAuthorId: widget.profileUserId,
      fallbackAuthorUsername: widget.profileUsername,
      fallbackAuthorDisplayName: widget.profileDisplayName,
      fallbackAuthorAvatarUrl: widget.profileAvatarUrl,
    );
    final ctrl = widget.controller;
    final initialized = ctrl != null && ctrl.value.isInitialized;
    final stats = normalized['stats'] as Map?;
    final hearts = _asInt(stats?['hearts'] ?? stats?['likes']);
    final comments = _asInt(stats?['comments']);
    final saves = _asInt(stats?['saves']);
    final content =
        (normalized['caption'] as String? ??
                normalized['content'] as String? ??
                '')
            .trim();
    final author = _asStringKeyMap(normalized['author']);
    final displayName =
        (normalized['authorDisplayName'] as String?) ??
        (author?['displayName'] as String?) ??
        (author?['username'] as String?) ??
        'Unknown';
    final username =
        (normalized['authorUsername'] as String?) ??
        (author?['username'] as String?) ??
        '';
    final avatarUrl =
        (normalized['authorAvatarUrl'] as String?) ??
        (author?['avatarUrl'] as String?);
    final isVerified =
        (normalized['authorIsCreatorVerified'] as bool?) ??
        (author?['isCreatorVerified'] as bool?) ??
        false;
    final authorId =
        (normalized['authorId'] as String?) ?? (author?['id'] as String?) ?? '';
    final repostOf = normalized['repostOf'] as String?;
    final isRepost = repostOf != null && repostOf.isNotEmpty;
    final repostOriginName = _resolveRepostOriginName(normalized);
    final isOwn =
        widget.viewerId != null &&
        widget.viewerId!.isNotEmpty &&
        authorId == widget.viewerId;

    return GestureDetector(
      onTap: _handleVideoTap,
      behavior: HitTestBehavior.opaque,
      child: Stack(
        fit: StackFit.expand,
        children: [
          const ColoredBox(color: Colors.black),
          if (initialized)
            Center(
              child: AspectRatio(
                aspectRatio: ctrl.value.aspectRatio,
                child: VideoPlayer(ctrl),
              ),
            ),
          if (!initialized)
            Center(
              child: Icon(
                Icons.smart_display_outlined,
                size: 72,
                color: Colors.white.withValues(alpha: 0.12),
              ),
            ),
          if (ctrl != null && !initialized)
            const Center(
              child: CircularProgressIndicator(
                strokeWidth: 2,
                color: Colors.white54,
              ),
            ),
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
          Positioned(
            bottom: 0,
            left: 0,
            right: 0,
            height: 300,
            child: IgnorePointer(
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
          ),
          if (widget.forceReelUi)
            Positioned(
              top: 0,
              left: 0,
              right: 0,
              child: Container(
                padding: EdgeInsets.only(
                  top: MediaQuery.of(context).padding.top + 4,
                  bottom: 4,
                ),
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      Colors.black.withValues(alpha: 0.55),
                      Colors.transparent,
                    ],
                  ),
                ),
                child: Row(
                  children: [
                    IconButton(
                      icon: const Icon(
                        Icons.arrow_back_ios_new_rounded,
                        color: Colors.white,
                        size: 20,
                      ),
                      onPressed:
                          widget.onBack ?? () => Navigator.of(context).pop(),
                    ),
                    const Spacer(),
                    Text(
                      '${widget.pageIndex + 1} / ${widget.totalCount}',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 13,
                        fontWeight: FontWeight.w500,
                        shadows: [Shadow(blurRadius: 4, color: Colors.black54)],
                      ),
                    ),
                    const Spacer(),
                    _VolumeControl(
                      muted: _muted,
                      onToggle: () {
                        setState(() => _muted = !_muted);
                        ctrl?.setVolume(_muted ? 0.0 : 1.0);
                      },
                    ),
                    const SizedBox(width: 6),
                  ],
                ),
              ),
            )
          else
            Positioned(
              top: MediaQuery.of(context).padding.top + 12,
              left: 12,
              child: _VolumeControl(
                muted: _muted,
                onToggle: () {
                  setState(() => _muted = !_muted);
                  ctrl?.setVolume(_muted ? 0.0 : 1.0);
                },
              ),
            ),
          Positioned(
            bottom: 28 + MediaQuery.of(context).viewPadding.bottom,
            left: 16,
            right: 88,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                if (isRepost) ...[
                  Row(
                    children: [
                      const Icon(
                        Icons.repeat_rounded,
                        size: 14,
                        color: Color(0xFF7A8BB0),
                      ),
                      const SizedBox(width: 6),
                      Expanded(
                        child: RichText(
                          overflow: TextOverflow.ellipsis,
                          text: TextSpan(
                            style: const TextStyle(
                              color: Color(0xFF7A8BB0),
                              fontSize: 12,
                            ),
                            children: [
                              const TextSpan(text: 'Reposted from '),
                              TextSpan(
                                text: repostOriginName,
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                ],
                Row(
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: [
                    _AuthorAvatar(
                      avatarUrl: avatarUrl,
                      displayName: displayName,
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
                                  displayName,
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontWeight: FontWeight.w700,
                                    fontSize: 14,
                                  ),
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                              if (isVerified) ...[
                                const SizedBox(width: 4),
                                const Icon(
                                  Icons.verified_rounded,
                                  size: 14,
                                  color: Color(0xFF4AA3E4),
                                ),
                              ],
                            ],
                          ),
                          if (username.isNotEmpty)
                            Text(
                              '@$username',
                              style: const TextStyle(
                                color: Colors.white70,
                                fontSize: 12,
                              ),
                            ),
                        ],
                      ),
                    ),
                    if (!isOwn && authorId.isNotEmpty) ...[
                      const SizedBox(width: 8),
                      GestureDetector(
                        onTap: _onFollowTap,
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 14,
                            vertical: 6,
                          ),
                          decoration: BoxDecoration(
                            border: Border.all(
                              color: _following ? Colors.white54 : Colors.white,
                              width: 1.5,
                            ),
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: Text(
                            _following ? 'Following' : 'Follow',
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
                if (content.isNotEmpty) ...[
                  const SizedBox(height: 10),
                  _ExpandableCaption(text: content),
                ],
              ],
            ),
          ),
          Positioned(
            bottom: 28 + MediaQuery.of(context).viewPadding.bottom,
            right: 8,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                _ActionButton(
                  icon: _liked
                      ? Icons.favorite_rounded
                      : Icons.favorite_border_rounded,
                  color: _liked ? const Color(0xFFE53935) : Colors.white,
                  label: _fmtCountInt(hearts),
                  onTap: _onLikeTap,
                ),
                const SizedBox(height: 20),
                _ActionButton(
                  icon: Icons.chat_bubble_outline_rounded,
                  color: Colors.white,
                  label: _fmtCountInt(comments),
                  onTap: _openReelCommentsSheet,
                ),
                const SizedBox(height: 20),
                _ActionButton(
                  icon: _saved
                      ? Icons.bookmark_rounded
                      : Icons.bookmark_border_rounded,
                  color: _saved ? const Color(0xFF4AA3E4) : Colors.white,
                  label: _fmtCountInt(saves),
                  onTap: _onSaveTap,
                ),
                const SizedBox(height: 20),
              ],
            ),
          ),
          if (initialized)
            Positioned(
              bottom: 0,
              left: 0,
              right: 0,
              child: _VideoProgressBar(controller: ctrl),
            ),
        ],
      ),
    );
  }

  // ── Video page ─────────────────────────────────────────────────────────────

  Widget _buildVideoPage() {
    final ctrl = widget.controller;
    final initialized = ctrl != null && ctrl.value.isInitialized;

    return GestureDetector(
      onTap: _handleVideoTap,
      behavior: HitTestBehavior.opaque,
      child: Stack(
        fit: StackFit.expand,
        children: [
          const ColoredBox(color: Colors.black),

          // Video
          if (initialized)
            Center(
              child: AspectRatio(
                aspectRatio: ctrl.value.aspectRatio,
                child: VideoPlayer(ctrl),
              ),
            ),

          // Loading indicator
          if (!initialized)
            Center(
              child: Icon(
                Icons.smart_display_outlined,
                size: 72,
                color: Colors.white.withValues(alpha: 0.12),
              ),
            ),
          if (ctrl != null && !initialized)
            const Center(
              child: CircularProgressIndicator(
                strokeWidth: 2,
                color: Colors.white54,
              ),
            ),

          // Pause icon flash
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

          // Bottom gradient
          Positioned(
            bottom: 0,
            left: 0,
            right: 0,
            height: 280,
            child: IgnorePointer(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      Colors.transparent,
                      Colors.black.withValues(alpha: 0.88),
                    ],
                  ),
                ),
              ),
            ),
          ),

          // Progress bar
          if (initialized)
            Positioned(
              bottom: 0,
              left: 0,
              right: 0,
              height: 3,
              child: VideoProgressIndicator(
                ctrl,
                allowScrubbing: true,
                colors: const VideoProgressColors(
                  playedColor: Color(0xFF4AA3E4),
                  bufferedColor: Color(0x55FFFFFF),
                  backgroundColor: Color(0x33FFFFFF),
                ),
                padding: EdgeInsets.zero,
              ),
            ),

          // Bottom info
          Positioned(
            bottom: 6,
            left: 0,
            right: 0,
            child: _ItemInfoOverlay(
              item: widget.item,
              viewerId: widget.viewerId,
            ),
          ),
        ],
      ),
    );
  }

  // ── Image page ─────────────────────────────────────────────────────────────

  Widget _buildImagePage() {
    final mediaCount = _mediaItems.length;
    final hasMany = mediaCount > 1;

    return Stack(
      fit: StackFit.expand,
      children: [
        const ColoredBox(color: Colors.black),

        if (mediaCount > 0)
          PageView.builder(
            controller: _mediaPageController,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: mediaCount,
            onPageChanged: (i) => setState(() => _mediaIndex = i),
            itemBuilder: (context, i) {
              final url = _mediaDisplayUrl(i);
              if (url == null || url.isEmpty) {
                return Center(
                  child: Icon(
                    Icons.image_not_supported_outlined,
                    size: 56,
                    color: Colors.white.withValues(alpha: 0.2),
                  ),
                );
              }
              return Center(
                child: InteractiveViewer(
                  minScale: 0.8,
                  maxScale: 4.0,
                  child: Image.network(
                    url,
                    fit: BoxFit.contain,
                    loadingBuilder: (_, child, progress) => progress == null
                        ? child
                        : Center(
                            child: CircularProgressIndicator(
                              value: progress.expectedTotalBytes != null
                                  ? progress.cumulativeBytesLoaded /
                                        progress.expectedTotalBytes!
                                  : null,
                              strokeWidth: 2,
                              color: Colors.white54,
                            ),
                          ),
                    errorBuilder: (_, __, ___) => Center(
                      child: Icon(
                        Icons.broken_image_outlined,
                        size: 56,
                        color: Colors.white.withValues(alpha: 0.3),
                      ),
                    ),
                  ),
                ),
              );
            },
          )
        else if (_imageUrl != null)
          Center(
            child: InteractiveViewer(
              minScale: 0.8,
              maxScale: 4.0,
              child: Image.network(
                _imageUrl!,
                fit: BoxFit.contain,
                loadingBuilder: (_, child, progress) => progress == null
                    ? child
                    : Center(
                        child: CircularProgressIndicator(
                          value: progress.expectedTotalBytes != null
                              ? progress.cumulativeBytesLoaded /
                                    progress.expectedTotalBytes!
                              : null,
                          strokeWidth: 2,
                          color: Colors.white54,
                        ),
                      ),
                errorBuilder: (_, __, ___) => Center(
                  child: Icon(
                    Icons.broken_image_outlined,
                    size: 56,
                    color: Colors.white.withValues(alpha: 0.3),
                  ),
                ),
              ),
            ),
          )
        else
          Center(
            child: Icon(
              Icons.image_not_supported_outlined,
              size: 56,
              color: Colors.white.withValues(alpha: 0.2),
            ),
          ),

        if (hasMany)
          Positioned(
            left: 10,
            top: 0,
            bottom: 0,
            child: Center(
              child: IconButton(
                onPressed: _mediaIndex > 0
                    ? () {
                        _mediaPageController.previousPage(
                          duration: const Duration(milliseconds: 240),
                          curve: Curves.easeOut,
                        );
                      }
                    : null,
                icon: Icon(
                  Icons.chevron_left_rounded,
                  size: 34,
                  color: _mediaIndex > 0 ? Colors.white : Colors.white38,
                ),
              ),
            ),
          ),

        if (hasMany)
          Positioned(
            right: 10,
            top: 0,
            bottom: 0,
            child: Center(
              child: IconButton(
                onPressed: _mediaIndex < mediaCount - 1
                    ? () {
                        _mediaPageController.nextPage(
                          duration: const Duration(milliseconds: 240),
                          curve: Curves.easeOut,
                        );
                      }
                    : null,
                icon: Icon(
                  Icons.chevron_right_rounded,
                  size: 34,
                  color: _mediaIndex < mediaCount - 1
                      ? Colors.white
                      : Colors.white38,
                ),
              ),
            ),
          ),

        // Multiple media indicator (top center)
        if (mediaCount > 1)
          Positioned(
            top: kToolbarHeight + MediaQuery.of(context).padding.top + 8,
            left: 0,
            right: 0,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.55),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    '${_mediaIndex + 1}/$mediaCount',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),
          ),

        // Bottom gradient
        Positioned(
          bottom: 0,
          left: 0,
          right: 0,
          height: 260,
          child: IgnorePointer(
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
        ),

        // Bottom info + "View full post" button
        Positioned(
          bottom: 0,
          left: 0,
          right: 0,
          child: _ItemInfoOverlay(
            item: widget.item,
            viewerId: widget.viewerId,
            showViewFullPost: true,
            fallbackAuthorId: widget.profileUserId,
            fallbackAuthorUsername: widget.profileUsername,
            fallbackAuthorDisplayName: widget.profileDisplayName,
            fallbackAuthorAvatarUrl: widget.profileAvatarUrl,
          ),
        ),
      ],
    );
  }
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

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => setState(() => _expanded = !_expanded),
      child: Text(
        widget.text,
        maxLines: _expanded ? null : 3,
        overflow: _expanded ? TextOverflow.visible : TextOverflow.ellipsis,
        style: const TextStyle(
          color: Colors.white,
          fontSize: 13,
          height: 1.4,
          shadows: [Shadow(blurRadius: 4, color: Colors.black54)],
        ),
      ),
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

class _VideoProgressBar extends StatefulWidget {
  const _VideoProgressBar({required this.controller});

  final VideoPlayerController controller;

  @override
  State<_VideoProgressBar> createState() => _VideoProgressBarState();
}

class _VideoProgressBarState extends State<_VideoProgressBar> {
  void _onUpdate() {
    if (mounted) setState(() {});
  }

  @override
  void initState() {
    super.initState();
    widget.controller.addListener(_onUpdate);
  }

  @override
  void didUpdateWidget(_VideoProgressBar oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.controller != widget.controller) {
      oldWidget.controller.removeListener(_onUpdate);
      widget.controller.addListener(_onUpdate);
    }
  }

  @override
  void dispose() {
    widget.controller.removeListener(_onUpdate);
    super.dispose();
  }

  static String _fmt(Duration d) {
    final mm = d.inMinutes.remainder(60).toString().padLeft(2, '0');
    final ss = d.inSeconds.remainder(60).toString().padLeft(2, '0');
    return '$mm:$ss';
  }

  @override
  Widget build(BuildContext context) {
    final value = widget.controller.value;
    final dur = value.duration;
    final pos = value.position;

    if (!value.isInitialized || dur.inMilliseconds <= 0) {
      return Container(height: 3, color: Colors.white12);
    }

    final progress = (pos.inMilliseconds / dur.inMilliseconds).clamp(0.0, 1.0);

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(14, 0, 14, 1),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                _fmt(pos),
                style: const TextStyle(
                  color: Colors.white70,
                  fontSize: 10,
                  shadows: [Shadow(blurRadius: 3, color: Colors.black)],
                ),
              ),
              Text(
                _fmt(dur),
                style: const TextStyle(
                  color: Colors.white70,
                  fontSize: 10,
                  shadows: [Shadow(blurRadius: 3, color: Colors.black)],
                ),
              ),
            ],
          ),
        ),
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
              final ms = (v * dur.inMilliseconds).round();
              widget.controller.seekTo(Duration(milliseconds: ms));
            },
          ),
        ),
      ],
    );
  }
}

// ── Bottom info overlay ───────────────────────────────────────────────────────

class _ItemInfoOverlay extends StatelessWidget {
  const _ItemInfoOverlay({
    required this.item,
    this.viewerId,
    this.showViewFullPost = false,
    this.fallbackAuthorId,
    this.fallbackAuthorUsername,
    this.fallbackAuthorDisplayName,
    this.fallbackAuthorAvatarUrl,
  });

  final Map<String, dynamic> item;
  final String? viewerId;
  final bool showViewFullPost;
  final String? fallbackAuthorId;
  final String? fallbackAuthorUsername;
  final String? fallbackAuthorDisplayName;
  final String? fallbackAuthorAvatarUrl;

  String _fmt(dynamic raw) {
    final n = (raw is int)
        ? raw
        : (raw is double)
        ? raw.toInt()
        : int.tryParse(raw?.toString() ?? '') ?? 0;
    if (n >= 1000000) return '${(n / 1000000).toStringAsFixed(1)}M';
    if (n >= 1000) return '${(n / 1000).toStringAsFixed(1)}K';
    return n.toString();
  }

  @override
  Widget build(BuildContext context) {
    final normalized = _normalizeItem(
      item,
      fallbackAuthorId: fallbackAuthorId,
      fallbackAuthorUsername: fallbackAuthorUsername,
      fallbackAuthorDisplayName: fallbackAuthorDisplayName,
      fallbackAuthorAvatarUrl: fallbackAuthorAvatarUrl,
    );
    final stats = normalized['stats'] as Map?;
    final likes = stats?['hearts'] ?? stats?['likes'] ?? 0;
    final comments = stats?['comments'] ?? 0;
    final views = stats?['views'] ?? 0;
    final caption =
        (normalized['caption'] as String? ??
                normalized['content'] as String? ??
                '')
            .trim();
    final authorUsername =
        (normalized['authorUsername'] as String?) ??
        (normalized['author'] as Map?)?['username'] as String? ??
        '';
    final repostOf = normalized['repostOf'] as String?;
    final isRepost = repostOf != null && repostOf.isNotEmpty;
    final repostOriginName = _resolveRepostOriginName(normalized);
    final itemId = normalized['id'] as String? ?? '';
    final initialState = _toFeedPostState(
      normalized,
      fallbackAuthorId: fallbackAuthorId,
      fallbackAuthorUsername: fallbackAuthorUsername,
      fallbackAuthorDisplayName: fallbackAuthorDisplayName,
      fallbackAuthorAvatarUrl: fallbackAuthorAvatarUrl,
    );

    return Padding(
      padding: EdgeInsets.fromLTRB(
        14,
        0,
        14,
        MediaQuery.of(context).padding.bottom + 12,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          // Author
          if (isRepost)
            Row(
              children: [
                const Icon(Icons.repeat, color: Colors.white70, size: 14),
                const SizedBox(width: 4),
                Expanded(
                  child: RichText(
                    overflow: TextOverflow.ellipsis,
                    text: TextSpan(
                      style: const TextStyle(
                        color: Colors.white70,
                        fontSize: 13,
                      ),
                      children: [
                        const TextSpan(text: 'Reposted from '),
                        TextSpan(
                          text: repostOriginName,
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),

          if (authorUsername.isNotEmpty)
            Row(
              children: [
                Text(
                  '@$authorUsername',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),

          if (caption.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(
              caption,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: Color(0xFFDDEEFF),
                fontSize: 13,
                height: 1.4,
              ),
            ),
          ],

          const SizedBox(height: 8),

          // Stats row
          Row(
            children: [
              _StatChip(icon: Icons.thumb_up_alt_rounded, count: _fmt(likes)),
              const SizedBox(width: 14),
              _StatChip(icon: Icons.chat_bubble_rounded, count: _fmt(comments)),
              const SizedBox(width: 14),
              _StatChip(icon: Icons.visibility_rounded, count: _fmt(views)),
              const Spacer(),

              // "View full post" button
              if (showViewFullPost && itemId.isNotEmpty)
                GestureDetector(
                  onTap: () {
                    Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) => PostDetailScreen(
                          postId: itemId,
                          initialState: initialState,
                          viewerId: viewerId,
                        ),
                      ),
                    );
                  },
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 6,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(
                        color: Colors.white.withValues(alpha: 0.3),
                      ),
                    ),
                    child: const Text(
                      'View post',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _StatChip extends StatelessWidget {
  const _StatChip({required this.icon, required this.count});
  final IconData icon;
  final String count;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, color: Colors.white70, size: 14),
        const SizedBox(width: 3),
        Text(
          count,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 12,
            fontWeight: FontWeight.w600,
            shadows: [Shadow(blurRadius: 4, color: Colors.black54)],
          ),
        ),
      ],
    );
  }
}
