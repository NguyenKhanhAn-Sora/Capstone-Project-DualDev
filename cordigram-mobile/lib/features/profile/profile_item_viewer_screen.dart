import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:video_player/video_player.dart';
import '../post/post_detail_screen.dart';

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
  });

  /// All items in the current profile tab (posts / reels / saved / repost).
  final List<Map<String, dynamic>> items;

  /// The item that was tapped — used as the first page.
  final int initialIndex;

  final String? viewerId;
  final String? profileUsername;

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
          ),
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
  });

  final Map<String, dynamic> item;
  final bool isActive;
  final VideoPlayerController? controller;
  final String? viewerId;

  @override
  State<_ItemPage> createState() => _ItemPageState();
}

class _ItemPageState extends State<_ItemPage> {
  bool _showPauseIcon = false;
  Timer? _pauseIconTimer;

  @override
  void initState() {
    super.initState();
    widget.controller?.addListener(_onControllerUpdate);
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
    widget.controller?.removeListener(_onControllerUpdate);
    super.dispose();
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
    return _isVideo ? _buildVideoPage() : _buildImagePage();
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
    final url = _imageUrl;
    // Detect multiple media for swipe indicator
    final mediaList = widget.item['media'] as List?;
    final mediaCount = (mediaList?.length ?? 0);

    return Stack(
      fit: StackFit.expand,
      children: [
        const ColoredBox(color: Colors.black),

        // Image (centered, contain)
        if (url != null)
          Center(
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
          )
        else
          Center(
            child: Icon(
              Icons.image_not_supported_outlined,
              size: 56,
              color: Colors.white.withValues(alpha: 0.2),
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
                    '1/$mediaCount',
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
  });

  final Map<String, dynamic> item;
  final String? viewerId;
  final bool showViewFullPost;

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
    final stats = item['stats'] as Map?;
    final likes = stats?['hearts'] ?? stats?['likes'] ?? 0;
    final comments = stats?['comments'] ?? 0;
    final views = stats?['views'] ?? 0;
    final caption = (item['caption'] as String? ?? '').trim();
    final authorUsername =
        (item['authorUsername'] as String?) ??
        (item['author'] as Map?)?['username'] as String? ??
        '';
    final repostOf = item['repostOf'] as String?;
    final isRepost = repostOf != null && repostOf.isNotEmpty;
    final itemId = item['id'] as String? ?? '';

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
          if (authorUsername.isNotEmpty)
            Row(
              children: [
                if (isRepost) ...[
                  const Icon(Icons.repeat, color: Colors.white70, size: 14),
                  const SizedBox(width: 4),
                ],
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
              _StatChip(icon: Icons.favorite_rounded, count: _fmt(likes)),
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
