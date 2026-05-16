import 'dart:async';
import 'dart:io';
import 'dart:typed_data';
import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';
import 'package:video_player/video_player.dart';
import '../models/feed_post.dart';
import '../../../core/services/language_controller.dart';
import '../../../core/services/video_volume_store.dart';

bool _isVideoMediaType(String type) {
  final normalized = type.trim().toLowerCase();
  return normalized == 'video' || normalized.startsWith('video/');
}

bool _isVideoMediaUrl(String url) {
  final raw = url.trim().toLowerCase();
  if (raw.isEmpty) return false;
  final withoutQuery = raw.split('?').first;
  return withoutQuery.endsWith('.mp4') ||
      withoutQuery.endsWith('.mov') ||
      withoutQuery.endsWith('.webm') ||
      withoutQuery.endsWith('.mkv') ||
      withoutQuery.endsWith('.avi') ||
      withoutQuery.endsWith('.m3u8');
}

bool _isVideoFeedMedia(FeedMedia media) {
  return _isVideoMediaType(media.type) || _isVideoMediaUrl(media.url);
}

/// Carousel for a list of images/videos within a post card.
/// Shows one media item at a time with prev/next arrows and a counter badge.
/// Tapping the image opens a full-screen [_ImageViewerOverlay].
class MediaCarousel extends StatefulWidget {
  const MediaCarousel({
    super.key,
    required this.media,
    this.allowDownload = false,
    this.playbackScopeKey,
    this.enableAutoPlayOnVisible = false,
    this.isParentVisible = false,
  });

  final List<FeedMedia> media;
  final bool allowDownload;
  final String? playbackScopeKey;
  final bool enableAutoPlayOnVisible;
  final bool isParentVisible;

  @override
  State<MediaCarousel> createState() => _MediaCarouselState();
}

class _MediaCarouselState extends State<MediaCarousel> {
  final PageController _pageController = PageController();
  int _currentIndex = 0;
  final Map<String, bool> _revealedMap = {};

  FeedMedia get _currentMedia => widget.media[_currentIndex];
  String get _currentMediaKey => _currentMedia.url;
  bool get _shouldRevealCurrent =>
      _revealedMap[_currentMediaKey] == true &&
      _currentMedia.isBlurredByModeration;
  bool get _showModerationRevealOverlay =>
      _currentMedia.isBlurredByModeration && !_shouldRevealCurrent;

  String _playbackKeyAt(int index) {
    final scope = (widget.playbackScopeKey?.trim().isNotEmpty ?? false)
        ? widget.playbackScopeKey!.trim()
        : 'global';
    return '$scope::$index::${widget.media[index].url}';
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  void _goTo(int index) {
    if (index < 0 || index >= widget.media.length) return;
    _pageController.animateToPage(
      index,
      duration: const Duration(milliseconds: 260),
      curve: Curves.easeInOut,
    );
  }

  void _openViewer(int startIndex) {
    Navigator.of(context).push(
      _ImageViewerRoute(
        media: widget.media,
        initialIndex: startIndex,
        allowDownload: widget.allowDownload,
        onDownloadRequested: _downloadOriginalMedia,
      ),
    );
  }

  Future<void> _showMediaActions(FeedMedia item) async {
    if (!widget.allowDownload) return;

    final action = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: const Color(0xFF141D30),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 36,
              height: 4,
              margin: const EdgeInsets.symmetric(vertical: 10),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.18),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            ListTile(
              leading: const Icon(
                Icons.download_rounded,
                color: Color(0xFF9BAECF),
              ),
              title: Text(
                LanguageController.instance.t('post.media.download'),
                style: const TextStyle(color: Color(0xFFD0D8EE)),
              ),
              onTap: () => Navigator.of(ctx).pop('download'),
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );

    if (!mounted || action != 'download') return;
    await _downloadOriginalMedia(item);
  }

  Future<void> _downloadOriginalMedia(FeedMedia item) async {
    try {
      final res = await http
          .get(Uri.parse(item.url))
          .timeout(const Duration(seconds: 30));
      if (res.statusCode < 200 || res.statusCode >= 300) {
        throw Exception('download failed');
      }

      final bytes = res.bodyBytes;
      final dir = await _resolveDownloadDirectory();
      final filename = _buildFilename(item, bytes);
      final file = File('${dir.path}${Platform.pathSeparator}$filename');
      await file.writeAsBytes(bytes, flush: true);

      if (!mounted) return;
      final lc = LanguageController.instance;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(lc.t('post.downloadSuccess', {'path': file.path})),
          backgroundColor: const Color(0xFF1A2235),
        ),
      );
    } catch (_) {
      if (!mounted) return;
      final lc = LanguageController.instance;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(lc.t('post.downloadFailed')),
          backgroundColor: const Color(0xFFB91C1C),
        ),
      );
    }
  }

  void _revealCurrentMedia() {
    setState(() {
      _revealedMap[_currentMediaKey] = true;
    });
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

  String _buildFilename(FeedMedia item, Uint8List bytes) {
    final uri = Uri.tryParse(item.url);
    final segment = uri?.pathSegments.isNotEmpty == true
        ? uri!.pathSegments.last
        : '';
    final fromUrl = segment.split('?').first.trim();

    final ext = _detectExtension(item, fromUrl, bytes);
    final ts = DateTime.now().millisecondsSinceEpoch;
    if (fromUrl.isNotEmpty && fromUrl.contains('.')) {
      return 'cordigram_$ts\_${fromUrl.replaceAll(RegExp(r"[^a-zA-Z0-9._-]"), "_")}';
    }
    return 'cordigram_$ts.$ext';
  }

  String _detectExtension(FeedMedia item, String fromUrl, Uint8List bytes) {
    final lower = fromUrl.toLowerCase();
    for (final ext in ['jpg', 'jpeg', 'png', 'webp', 'gif', 'mp4', 'mov']) {
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

    return item.type == 'video' ? 'mp4' : 'jpg';
  }

  @override
  Widget build(BuildContext context) {
    final media = widget.media;
    if (media.isEmpty) return const SizedBox.shrink();
    final isSingle = media.length == 1;

    // Mirror web: aspect-ratio 4/5, min-height 260, max-height 520
    return LayoutBuilder(
      builder: (context, constraints) {
        final w = constraints.maxWidth;
        final naturalH = w * 5 / 4;
        final h = naturalH.clamp(260.0, 520.0);
        return ClipRRect(
          borderRadius: BorderRadius.circular(12),
          child: Container(
            width: w,
            height: h,
            color: const Color(0xFF0B1020),
            child: Stack(
              children: [
                PageView.builder(
                  controller: _pageController,
                  itemCount: media.length,
                  onPageChanged: (i) => setState(() => _currentIndex = i),
                  itemBuilder: (_, i) => GestureDetector(
                    onTap: () => _openViewer(i),
                    onLongPress: () => _showMediaActions(media[i]),
                    child: _MediaItem(
                      media: media[i],
                      revealed: _revealedMap[media[i].url] == true,
                      playbackKey: _playbackKeyAt(i),
                      autoPlay:
                          widget.enableAutoPlayOnVisible &&
                          widget.isParentVisible &&
                          _currentIndex == i &&
                          i == 0 &&
                          _isVideoFeedMedia(media[i]),
                      allowDownload: widget.allowDownload,
                      qualities: media[i].qualities,
                      expectedDuration: media[i].metadataDurationSeconds,
                      onDownload: widget.allowDownload
                          ? () => _downloadOriginalMedia(media[i])
                          : null,
                      onFullscreen: () => _openViewer(i),
                    ),
                  ),
                ),
                if (_showModerationRevealOverlay)
                  Positioned.fill(
                    child: IgnorePointer(
                      ignoring: false,
                      child: Container(
                        color: Colors.black.withValues(alpha: 0.2),
                        alignment: Alignment.center,
                        child: Container(
                          margin: const EdgeInsets.symmetric(horizontal: 18),
                          padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
                          decoration: BoxDecoration(
                            color: const Color(
                              0xFF2A3345,
                            ).withValues(alpha: 0.92),
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
                                onPressed: _revealCurrentMedia,
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: const Color(0xFF0F1F3B),
                                  foregroundColor: Colors.white,
                                  elevation: 0,
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 14,
                                    vertical: 8,
                                  ),
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
                  ),
                // Prev button
                if (!isSingle && _currentIndex > 0)
                  _NavButton(
                    alignment: Alignment.centerLeft,
                    icon: Icons.chevron_left_rounded,
                    onTap: () => _goTo(_currentIndex - 1),
                  ),
                // Next button
                if (!isSingle && _currentIndex < media.length - 1)
                  _NavButton(
                    alignment: Alignment.centerRight,
                    icon: Icons.chevron_right_rounded,
                    onTap: () => _goTo(_currentIndex + 1),
                  ),
                // Counter badge — bottom-right (mirrors web .mediaCounter)
                if (!isSingle)
                  Positioned(
                    right: 12,
                    bottom: 12,
                    child: IgnorePointer(
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 10,
                          vertical: 4,
                        ),
                        decoration: BoxDecoration(
                          color: Colors.black.withValues(alpha: 0.55),
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Text(
                          '${_currentIndex + 1}/${media.length}',
                          style: const TextStyle(
                            color: Color(0xFFE5E7EB),
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        );
      },
    );
  }
}

// ── Image viewer overlay (full-screen modal) ──────────────────────────────────

/// A transparent [PageRoute] that renders the full-screen image viewer
/// directly over the page without any slide transition — mirrors the web's
/// `position: fixed; inset: 0; backdrop-filter: blur(6px)` overlay.
class _ImageViewerRoute extends PageRoute<void> {
  _ImageViewerRoute({
    required this.media,
    required this.initialIndex,
    required this.allowDownload,
    required this.onDownloadRequested,
  }) : super(fullscreenDialog: true);

  final List<FeedMedia> media;
  final int initialIndex;
  final bool allowDownload;
  final Future<void> Function(FeedMedia media) onDownloadRequested;

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
      child: _ImageViewerOverlay(
        media: media,
        initialIndex: initialIndex,
        allowDownload: allowDownload,
        onDownloadRequested: onDownloadRequested,
      ),
    );
  }
}

class _ImageViewerOverlay extends StatefulWidget {
  const _ImageViewerOverlay({
    required this.media,
    required this.initialIndex,
    required this.allowDownload,
    required this.onDownloadRequested,
  });

  final List<FeedMedia> media;
  final int initialIndex;
  final bool allowDownload;
  final Future<void> Function(FeedMedia media) onDownloadRequested;

  @override
  State<_ImageViewerOverlay> createState() => _ImageViewerOverlayState();
}

class _ImageViewerOverlayState extends State<_ImageViewerOverlay> {
  late int _index;
  late final PageController _pageController;
  // Track whether the current page is zoomed in — disables PageView swipe
  bool _isZoomed = false;
  final Map<String, bool> _revealedMap = {};

  FeedMedia get _currentMedia => widget.media[_index];
  String get _currentMediaKey => _currentMedia.url;
  bool get _shouldRevealCurrent =>
      _revealedMap[_currentMediaKey] == true &&
      _currentMedia.isBlurredByModeration;
  bool get _showModerationRevealOverlay =>
      _currentMedia.isBlurredByModeration && !_shouldRevealCurrent;

  String _playbackKeyAt(int index) {
    if (index < 0 || index >= widget.media.length) return 'viewer::invalid';
    return 'viewer::${widget.media[index].url}';
  }

  @override
  void initState() {
    super.initState();
    _index = widget.initialIndex;
    _pageController = PageController(initialPage: _index);

    // Lock to portrait+landscape but hide status bar for immersive feel
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
  }

  @override
  void dispose() {
    _pageController.dispose();
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    super.dispose();
  }

  void _close() => Navigator.of(context).pop();

  void _prev() {
    if (_index <= 0) return;
    _pageController.animateToPage(
      _index - 1,
      duration: const Duration(milliseconds: 220),
      curve: Curves.easeInOut,
    );
  }

  void _next() {
    if (_index >= widget.media.length - 1) return;
    _pageController.animateToPage(
      _index + 1,
      duration: const Duration(milliseconds: 220),
      curve: Curves.easeInOut,
    );
  }

  Future<void> _showOverlayMediaActions(FeedMedia item) async {
    if (!widget.allowDownload) return;

    final action = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: const Color(0xFF141D30),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 36,
              height: 4,
              margin: const EdgeInsets.symmetric(vertical: 10),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.18),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            ListTile(
              leading: const Icon(
                Icons.download_rounded,
                color: Color(0xFF9BAECF),
              ),
              title: Text(
                LanguageController.instance.t('post.media.download'),
                style: const TextStyle(color: Color(0xFFD0D8EE)),
              ),
              onTap: () => Navigator.of(ctx).pop('download'),
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );

    if (!mounted || action != 'download') return;
    await widget.onDownloadRequested(item);
  }

  void _revealCurrentMedia() {
    setState(() {
      _revealedMap[_currentMediaKey] = true;
    });
  }

  @override
  Widget build(BuildContext context) {
    final media = widget.media;
    final canNavigate = media.length > 1;

    return Material(
      color: Colors.transparent,
      child: GestureDetector(
        // Tap on background → close
        onTap: _close,
        child: Container(
          color: const Color(0xC7030712), // rgba(3, 7, 18, 0.78)
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 6, sigmaY: 6),
            child: Stack(
              children: [
                // ── Swipeable image pages ────────────────────────────────
                PageView.builder(
                  controller: _pageController,
                  // Disable page swiping while the image is zoomed in
                  physics: _isZoomed
                      ? const NeverScrollableScrollPhysics()
                      : const PageScrollPhysics(),
                  itemCount: media.length,
                  onPageChanged: (i) => setState(() {
                    _index = i;
                    _isZoomed = false; // reset zoom state on page change
                  }),
                  itemBuilder: (_, i) {
                    final item = media[i];
                    final mediaUrl = item.displayUrl(
                      revealed: _revealedMap[item.url] == true,
                    );
                    return GestureDetector(
                      // Stop tap from reaching the background GestureDetector
                      onTap: () {},
                      onLongPress: () => _showOverlayMediaActions(item),
                      child: SafeArea(
                        child: SizedBox.expand(
                          child: _isVideoFeedMedia(item)
                              ? _OverlayVideoPlayer(
                                  url: mediaUrl,
                                  playbackKey: _playbackKeyAt(i),
                                  allowDownload: widget.allowDownload,
                                  qualities: item.qualities,
                                  expectedDuration:
                                      item.metadataDurationSeconds,
                                  onDownload: widget.allowDownload
                                      ? () => widget.onDownloadRequested(item)
                                      : null,
                                )
                              : _ZoomableImage(
                                  url: mediaUrl,
                                  onZoomChanged: (zoomed) {
                                    // Only update if this is the current visible page
                                    if (i == _index && zoomed != _isZoomed) {
                                      setState(() => _isZoomed = zoomed);
                                    }
                                  },
                                ),
                        ),
                      ),
                    );
                  },
                ),
                if (_showModerationRevealOverlay)
                  Positioned.fill(
                    child: IgnorePointer(
                      ignoring: false,
                      child: Container(
                        color: Colors.black.withValues(alpha: 0.24),
                        alignment: Alignment.center,
                        child: Container(
                          margin: const EdgeInsets.symmetric(horizontal: 22),
                          padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
                          decoration: BoxDecoration(
                            color: const Color(
                              0xFF2A3345,
                            ).withValues(alpha: 0.92),
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
                                onPressed: _revealCurrentMedia,
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: const Color(0xFF0F1F3B),
                                  foregroundColor: Colors.white,
                                  elevation: 0,
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 14,
                                    vertical: 8,
                                  ),
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
                  ),

                // ── Close button — top-right ─────────────────────────────
                Positioned(
                  top: MediaQuery.of(context).padding.top + 12,
                  right: 18,
                  child: _OverlayIconButton(
                    onTap: _close,
                    child: const Text(
                      '×',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 26,
                        height: 1,
                      ),
                    ),
                  ),
                ),

                // ── Prev nav button ──────────────────────────────────────
                if (canNavigate && _index > 0)
                  Positioned(
                    left: 10,
                    top: 0,
                    bottom: 0,
                    child: Center(
                      child: _OverlayIconButton(
                        onTap: _prev,
                        child: const Icon(
                          Icons.chevron_left_rounded,
                          color: Colors.white,
                          size: 28,
                        ),
                      ),
                    ),
                  ),

                // ── Next nav button ──────────────────────────────────────
                if (canNavigate && _index < media.length - 1)
                  Positioned(
                    right: 10,
                    top: 0,
                    bottom: 0,
                    child: Center(
                      child: _OverlayIconButton(
                        onTap: _next,
                        child: const Icon(
                          Icons.chevron_right_rounded,
                          color: Colors.white,
                          size: 28,
                        ),
                      ),
                    ),
                  ),

                // ── Counter badge — bottom-center ────────────────────────
                if (canNavigate)
                  Positioned(
                    left: 0,
                    right: 0,
                    bottom: MediaQuery.of(context).padding.bottom + 20,
                    child: Center(
                      child: GestureDetector(
                        onTap: () {}, // stop propagation
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 8,
                          ),
                          decoration: BoxDecoration(
                            color: const Color(0xBF0F172A),
                            borderRadius: BorderRadius.circular(999),
                            border: Border.all(
                              color: Colors.white.withValues(alpha: 0.18),
                            ),
                          ),
                          child: Text(
                            '${_index + 1} / ${media.length}',
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
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

// ── Zoomable image (pinch-to-zoom, max 3×, min 1×) ───────────────────────────

class _ZoomableImage extends StatefulWidget {
  const _ZoomableImage({required this.url, required this.onZoomChanged});
  final String url;

  /// Called whenever the zoom state crosses the 1× boundary.
  final void Function(bool isZoomed) onZoomChanged;

  @override
  State<_ZoomableImage> createState() => _ZoomableImageState();
}

class _ZoomableImageState extends State<_ZoomableImage> {
  final TransformationController _transformCtrl = TransformationController();
  bool _zoomed = false;

  @override
  void dispose() {
    _transformCtrl.dispose();
    super.dispose();
  }

  void _onInteractionEnd(ScaleEndDetails details) {
    final scale = _transformCtrl.value.getMaxScaleOnAxis();
    final nowZoomed = scale > 1.01;
    if (nowZoomed != _zoomed) {
      _zoomed = nowZoomed;
      widget.onZoomChanged(_zoomed);
    }
    // Snap back to 1× if scale drifted below minimum
    if (scale < 1.0) {
      _transformCtrl.value = Matrix4.identity();
    }
  }

  @override
  Widget build(BuildContext context) {
    return InteractiveViewer(
      transformationController: _transformCtrl,
      minScale: 1.0,
      maxScale: 4.0,
      boundaryMargin: const EdgeInsets.all(320),
      clipBehavior: Clip.none,
      onInteractionEnd: _onInteractionEnd,
      child: SizedBox.expand(
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
            return const SizedBox(
              width: 80,
              height: 80,
              child: Center(
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

/// Circular button used inside the image viewer overlay.
/// Wraps a [GestureDetector] that stops tap propagation to the background.
class _OverlayIconButton extends StatelessWidget {
  const _OverlayIconButton({required this.onTap, required this.child});
  final VoidCallback onTap;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () {
        onTap();
      },
      behavior: HitTestBehavior.opaque,
      child: Container(
        width: 44,
        height: 44,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: const Color(0xBF0F172A),
          border: Border.all(color: Colors.white.withValues(alpha: 0.25)),
        ),
        child: Center(child: child),
      ),
    );
  }
}

class _MediaItem extends StatelessWidget {
  const _MediaItem({
    required this.media,
    required this.revealed,
    required this.playbackKey,
    required this.autoPlay,
    this.allowDownload = false,
    this.qualities,
    this.expectedDuration,
    this.onDownload,
    this.onFullscreen,
  });
  final FeedMedia media;
  final bool revealed;
  final String playbackKey;
  final bool autoPlay;
  final bool allowDownload;
  final List<VideoQuality>? qualities;
  final double? expectedDuration;
  final VoidCallback? onDownload;
  final VoidCallback? onFullscreen;

  @override
  Widget build(BuildContext context) {
    final url = media.displayUrl(revealed: revealed);
    if (_isVideoFeedMedia(media)) {
      return _InlineVideoPreview(
        url: url,
        playbackKey: playbackKey,
        autoPlay: autoPlay,
        allowDownload: allowDownload,
        qualities: qualities,
        expectedDuration: expectedDuration,
        onDownload: onDownload,
        onFullscreen: onFullscreen,
      );
    }

    // object-fit: contain — shows full image, letterboxed with dark background
    return Image.network(
      url,
      fit: BoxFit.contain,
      width: double.infinity,
      height: double.infinity,
      errorBuilder: (_, __, ___) => Container(
        color: const Color(0xFF1A2235),
        child: const Center(
          child: Icon(
            Icons.broken_image_outlined,
            color: Color(0xFF4A5568),
            size: 40,
          ),
        ),
      ),
      loadingBuilder: (_, child, progress) {
        if (progress == null) return child;
        return Container(
          color: const Color(0xFF1A2235),
          child: const Center(
            child: CircularProgressIndicator(
              strokeWidth: 2,
              color: Color(0xFF4AA3E4),
            ),
          ),
        );
      },
    );
  }
}

// ─── Shared constants ─────────────────────────────────────────────────────────

const _kPrimary = Color(0xFF4AA3E4);
const _kSpeeds = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];

String _fmtDuration(Duration d) {
  final h = d.inHours;
  final mm = d.inMinutes.remainder(60).toString().padLeft(2, '0');
  final ss = d.inSeconds.remainder(60).toString().padLeft(2, '0');
  return h > 0 ? '$h:$mm:$ss' : '$mm:$ss';
}

// ─── Inline video preview (feed card) ─────────────────────────────────────────

class _InlineVideoPreview extends StatefulWidget {
  const _InlineVideoPreview({
    required this.url,
    required this.playbackKey,
    required this.autoPlay,
    this.allowDownload = false,
    this.qualities,
    this.expectedDuration,
    this.onDownload,
    this.onFullscreen,
  });

  final String url;
  final String playbackKey;
  final bool autoPlay;
  final bool allowDownload;
  final List<VideoQuality>? qualities;
  final double? expectedDuration;
  final VoidCallback? onDownload;
  final VoidCallback? onFullscreen;

  @override
  State<_InlineVideoPreview> createState() => _InlineVideoPreviewState();
}

class _InlineVideoPreviewState extends State<_InlineVideoPreview> {
  VideoPlayerController? _controller;
  bool _initialized = false;
  bool _playing = false;
  bool _userPaused = false;

  // Quality switching
  VideoQuality? _selectedQuality;
  bool _qualityLoading = false;
  Duration? _seekAfterLoad;
  bool _resumeAfterQuality = false;

  // Controls visibility
  bool _showControls = true;
  Timer? _hideTimer;

  // Volume (mirrors global store)
  bool _muted = VideoVolumeStore.instance.muted;
  void Function()? _volumeUnsub;

  // Speed
  double _speed = 1.0;

  @override
  void initState() {
    super.initState();
    _volumeUnsub = VideoVolumeStore.instance.subscribe(_onVolumeChanged);
    _initController(widget.url);
  }

  void _onVolumeChanged() {
    if (!mounted) return;
    final store = VideoVolumeStore.instance;
    setState(() {
      _muted = store.muted;
    });
    _controller?.setVolume(store.muted ? 0.0 : store.volume);
  }

  Future<void> _initController(String url, {Duration? seekTo, bool resume = false}) async {
    final ctrl = VideoPlayerController.networkUrl(Uri.parse(url));
    _controller = ctrl;
    ctrl.addListener(_onVideoTick);

    await ctrl.initialize();
    if (!mounted || _controller != ctrl) {
      ctrl.removeListener(_onVideoTick);
      ctrl.dispose();
      return;
    }

    // Apply global volume
    final store = VideoVolumeStore.instance;
    await ctrl.setVolume(store.muted ? 0.0 : store.volume);

    // Restore playback position
    if (seekTo != null) {
      final maxMs = ctrl.value.duration.inMilliseconds;
      final ms = seekTo.inMilliseconds.clamp(0, maxMs);
      await ctrl.seekTo(Duration(milliseconds: ms));
    } else {
      final snapshot = _VideoPlaybackStore.read(widget.playbackKey);
      if (snapshot != null) {
        final maxMs = ctrl.value.duration.inMilliseconds;
        final ms = snapshot.position.inMilliseconds.clamp(0, maxMs);
        await ctrl.seekTo(Duration(milliseconds: ms));
        if (snapshot.wasPlaying) resume = true;
      }
    }

    final shouldPlay = resume || (widget.autoPlay && !_userPaused);
    if (shouldPlay) {
      await ctrl.play();
      await ctrl.setPlaybackSpeed(_speed);
    }

    setState(() {
      _initialized = true;
      _playing = ctrl.value.isPlaying;
    });
    _scheduleHide();
  }

  void _onVideoTick() {
    if (!mounted) return;
    final ctrl = _controller;
    if (ctrl == null) return;

    // Resolve quality-switch loading: wait until duration reaches expected
    if (_qualityLoading) {
      final exp = widget.expectedDuration;
      final durSec = ctrl.value.duration.inSeconds.toDouble();
      final ready = (exp == null || exp <= 0 || durSec >= exp * 0.9);
      if (ready) {
        if (_seekAfterLoad != null) {
          ctrl.seekTo(_seekAfterLoad!);
          _seekAfterLoad = null;
        }
        if (_resumeAfterQuality) {
          ctrl.play();
          _resumeAfterQuality = false;
        }
        setState(() => _qualityLoading = false);
      }
    }

    final nextPlaying = ctrl.value.isPlaying;
    if (nextPlaying != _playing) {
      setState(() => _playing = nextPlaying);
    } else {
      setState(() {});
    }
  }

  @override
  void didUpdateWidget(covariant _InlineVideoPreview oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.playbackKey != widget.playbackKey) _persistPlayback();

    if (oldWidget.autoPlay != widget.autoPlay) {
      final ctrl = _controller;
      if (!_initialized || ctrl == null) return;
      if (widget.autoPlay && !_userPaused) {
        ctrl.play();
      } else if (!widget.autoPlay) {
        ctrl.pause();
        _persistPlayback();
      }
    }
  }

  void _persistPlayback() {
    final ctrl = _controller;
    if (ctrl == null) return;
    _VideoPlaybackStore.write(
      widget.playbackKey,
      position: ctrl.value.position,
      wasPlaying: ctrl.value.isPlaying,
    );
  }

  void _scheduleHide() {
    _hideTimer?.cancel();
    _hideTimer = Timer(const Duration(seconds: 3), () {
      if (!mounted) return;
      if (_playing) setState(() => _showControls = false);
    });
  }

  void _revealControls() {
    setState(() => _showControls = true);
    _scheduleHide();
  }

  void _togglePlayPause() {
    final ctrl = _controller;
    if (!_initialized || ctrl == null) return;
    if (ctrl.value.isPlaying) {
      _userPaused = true;
      ctrl.pause();
      setState(() => _showControls = true);
      _hideTimer?.cancel();
    } else {
      _userPaused = false;
      ctrl.play();
      _revealControls();
    }
    _persistPlayback();
  }

  void _toggleMute() {
    final store = VideoVolumeStore.instance;
    store.setMuted(!store.muted);
  }

  Future<void> _switchQuality(VideoQuality? quality) async {
    final ctrl = _controller;
    if (ctrl == null) return;

    final savedPos = ctrl.value.position;
    final wasPlaying = ctrl.value.isPlaying;

    ctrl.removeListener(_onVideoTick);
    await ctrl.pause();
    await ctrl.dispose();
    _controller = null;

    setState(() {
      _selectedQuality = quality;
      _qualityLoading = true;
      _initialized = false;
    });

    _seekAfterLoad = savedPos;
    _resumeAfterQuality = wasPlaying;

    final nextUrl = quality?.url ?? widget.url;
    final newCtrl = VideoPlayerController.networkUrl(Uri.parse(nextUrl));
    _controller = newCtrl;
    newCtrl.addListener(_onVideoTick);

    await newCtrl.initialize();
    if (!mounted || _controller != newCtrl) {
      newCtrl.removeListener(_onVideoTick);
      newCtrl.dispose();
      return;
    }

    final store = VideoVolumeStore.instance;
    await newCtrl.setVolume(store.muted ? 0.0 : store.volume);
    await newCtrl.setPlaybackSpeed(_speed);

    setState(() => _initialized = true);

    // _onVideoTick will handle seek + resume + clear _qualityLoading
    // once duration is ready (>= expectedDuration * 0.9)
    final exp = widget.expectedDuration;
    final durSec = newCtrl.value.duration.inSeconds.toDouble();
    if (exp == null || exp <= 0 || durSec >= exp * 0.9) {
      if (_seekAfterLoad != null) {
        await newCtrl.seekTo(_seekAfterLoad!);
        _seekAfterLoad = null;
      }
      if (_resumeAfterQuality) {
        await newCtrl.play();
        _resumeAfterQuality = false;
      }
      setState(() => _qualityLoading = false);
    }
  }

  void _showSpeedSheet() {
    showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF141D30),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (_) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 36, height: 4,
              margin: const EdgeInsets.symmetric(vertical: 10),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.18),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Text(
                LanguageController.instance.t('video.speed'),
                style: const TextStyle(color: Color(0xFF9BAECF), fontSize: 12),
              ),
            ),
            Flexible(
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    ..._kSpeeds.map((s) => ListTile(
                      contentPadding: const EdgeInsets.symmetric(horizontal: 20),
                      title: Text(
                        '${s}x',
                        style: TextStyle(
                          color: s == _speed ? _kPrimary : const Color(0xFFD0D8EE),
                          fontWeight: s == _speed ? FontWeight.w600 : FontWeight.normal,
                        ),
                      ),
                      trailing: s == _speed
                          ? const Icon(Icons.check_rounded, color: _kPrimary, size: 18)
                          : null,
                      onTap: () {
                        Navigator.pop(context);
                        setState(() => _speed = s);
                        _controller?.setPlaybackSpeed(s);
                      },
                    )),
                    const SizedBox(height: 8),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _showQualitySheet() {
    final qualities = widget.qualities;
    if (qualities == null || qualities.isEmpty) return;
    showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF141D30),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (_) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 36, height: 4,
              margin: const EdgeInsets.symmetric(vertical: 10),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.18),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Text(
                LanguageController.instance.t('video.quality'),
                style: const TextStyle(color: Color(0xFF9BAECF), fontSize: 12),
              ),
            ),
            Flexible(
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    // Auto option
                    ListTile(
                      contentPadding: const EdgeInsets.symmetric(horizontal: 20),
                      title: Text(
                        'Auto',
                        style: TextStyle(
                          color: _selectedQuality == null ? _kPrimary : const Color(0xFFD0D8EE),
                          fontWeight: _selectedQuality == null ? FontWeight.w600 : FontWeight.normal,
                        ),
                      ),
                      trailing: _selectedQuality == null
                          ? const Icon(Icons.check_rounded, color: _kPrimary, size: 18)
                          : null,
                      onTap: () {
                        Navigator.pop(context);
                        _switchQuality(null);
                      },
                    ),
                    ...qualities.map((q) => ListTile(
                      contentPadding: const EdgeInsets.symmetric(horizontal: 20),
                      title: Text(
                        q.label,
                        style: TextStyle(
                          color: _selectedQuality?.label == q.label ? _kPrimary : const Color(0xFFD0D8EE),
                          fontWeight: _selectedQuality?.label == q.label ? FontWeight.w600 : FontWeight.normal,
                        ),
                      ),
                      trailing: _selectedQuality?.label == q.label
                          ? const Icon(Icons.check_rounded, color: _kPrimary, size: 18)
                          : null,
                      onTap: () {
                        Navigator.pop(context);
                        _switchQuality(q);
                      },
                    )),
                    const SizedBox(height: 8),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  void dispose() {
    _hideTimer?.cancel();
    _volumeUnsub?.call();
    _persistPlayback();
    _controller?.removeListener(_onVideoTick);
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ctrl = _controller;
    if (!_initialized || ctrl == null) {
      return Container(
        color: const Color(0xFF1A2235),
        child: const Center(
          child: CircularProgressIndicator(strokeWidth: 2, color: _kPrimary),
        ),
      );
    }

    final position = ctrl.value.position;
    final duration = ctrl.value.duration;
    final progress = duration.inMilliseconds > 0
        ? (position.inMilliseconds / duration.inMilliseconds).clamp(0.0, 1.0)
        : 0.0;
    final hasQualities = (widget.qualities?.isNotEmpty ?? false);
    final qualityLabel = _selectedQuality?.label ?? 'Auto';

    return GestureDetector(
      onTap: _revealControls,
      child: Stack(
        alignment: Alignment.center,
        children: [
          // Video
          SizedBox.expand(
            child: FittedBox(
              fit: BoxFit.contain,
              child: SizedBox(
                width: ctrl.value.size.width,
                height: ctrl.value.size.height,
                child: VideoPlayer(ctrl),
              ),
            ),
          ),

          // Bottom gradient
          Positioned.fill(
            child: IgnorePointer(
              child: Container(
                decoration: const BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [Colors.transparent, Colors.transparent, Color(0xAA000000)],
                    stops: [0.0, 0.5, 1.0],
                  ),
                ),
              ),
            ),
          ),

          // Quality loading spinner
          if (_qualityLoading)
            Container(
              color: Colors.black45,
              child: const Center(
                child: CircularProgressIndicator(strokeWidth: 3, color: _kPrimary),
              ),
            ),

          // Play/pause center button
          AnimatedOpacity(
            opacity: _showControls ? 1.0 : 0.0,
            duration: const Duration(milliseconds: 180),
            child: IgnorePointer(
              ignoring: !_showControls,
              child: GestureDetector(
                onTap: _togglePlayPause,
                child: Container(
                  width: 56, height: 56,
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.55),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    _playing ? Icons.pause_rounded : Icons.play_arrow_rounded,
                    color: Colors.white,
                    size: 34,
                  ),
                ),
              ),
            ),
          ),

          // Bottom controls — Positioned must be a direct child of Stack
          Positioned(
            left: 0, right: 0, bottom: 0,
            child: AnimatedOpacity(
              opacity: _showControls ? 1.0 : 0.0,
              duration: const Duration(milliseconds: 180),
              child: IgnorePointer(
                ignoring: !_showControls,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(8, 0, 8, 4),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      // Progress slider
                      SliderTheme(
                        data: SliderTheme.of(context).copyWith(
                          trackHeight: 3,
                          thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 6),
                          overlayShape: const RoundSliderOverlayShape(overlayRadius: 12),
                          activeTrackColor: _kPrimary,
                          inactiveTrackColor: Colors.white.withValues(alpha: 0.35),
                          thumbColor: _kPrimary,
                        ),
                        child: Slider(
                          value: progress,
                          onChanged: (v) {
                            final ms = (v * duration.inMilliseconds).round();
                            ctrl.seekTo(Duration(milliseconds: ms));
                          },
                        ),
                      ),

                      // Bottom bar
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 4),
                        child: Row(
                          children: [
                            // Time
                            Text(
                              '${_fmtDuration(position)} / ${_fmtDuration(duration)}',
                              style: const TextStyle(color: Colors.white, fontSize: 11),
                            ),
                            const Spacer(),

                            // Mute toggle
                            _IconBtn(
                              icon: _muted ? Icons.volume_off_rounded : Icons.volume_up_rounded,
                              onTap: _toggleMute,
                            ),

                            // Quality
                            if (hasQualities)
                              _TextBtn(label: qualityLabel, onTap: _showQualitySheet),

                            // Speed
                            _TextBtn(
                              label: _speed == _speed.truncateToDouble()
                                  ? '${_speed.toInt()}x'
                                  : '${_speed}x',
                              onTap: _showSpeedSheet,
                            ),

                            // Download
                            if (widget.allowDownload && widget.onDownload != null)
                              _IconBtn(icon: Icons.download_rounded, onTap: widget.onDownload!),

                            // Fullscreen
                            if (widget.onFullscreen != null)
                              _IconBtn(icon: Icons.fullscreen_rounded, onTap: widget.onFullscreen!),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// Small reusable icon button for control bar
class _IconBtn extends StatelessWidget {
  const _IconBtn({required this.icon, required this.onTap});
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => GestureDetector(
    onTap: onTap,
    child: Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
      child: Icon(icon, color: Colors.white, size: 20),
    ),
  );
}

// Small text button for speed/quality labels
class _TextBtn extends StatelessWidget {
  const _TextBtn({required this.label, required this.onTap});
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => GestureDetector(
    onTap: onTap,
    child: Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
      child: Text(
        label,
        style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w600),
      ),
    ),
  );
}

class _OverlayVideoPlayer extends StatefulWidget {
  const _OverlayVideoPlayer({
    required this.url,
    required this.playbackKey,
    this.allowDownload = false,
    this.qualities,
    this.expectedDuration,
    this.onDownload,
  });
  final String url;
  final String playbackKey;
  final bool allowDownload;
  final List<VideoQuality>? qualities;
  final double? expectedDuration;
  final VoidCallback? onDownload;

  @override
  State<_OverlayVideoPlayer> createState() => _OverlayVideoPlayerState();
}

class _OverlayVideoPlayerState extends State<_OverlayVideoPlayer> {
  VideoPlayerController? _controller;
  bool _initialized = false;
  bool _playing = false;

  VideoQuality? _selectedQuality;
  bool _qualityLoading = false;
  Duration? _seekAfterLoad;
  bool _resumeAfterQuality = false;

  bool _showControls = true;
  Timer? _hideTimer;

  bool _muted = VideoVolumeStore.instance.muted;
  void Function()? _volumeUnsub;
  double _speed = 1.0;

  @override
  void initState() {
    super.initState();
    _volumeUnsub = VideoVolumeStore.instance.subscribe(_onVolumeChanged);
    _initController(widget.url);
  }

  void _onVolumeChanged() {
    if (!mounted) return;
    final store = VideoVolumeStore.instance;
    setState(() => _muted = store.muted);
    _controller?.setVolume(store.muted ? 0.0 : store.volume);
  }

  Future<void> _initController(String url) async {
    final ctrl = VideoPlayerController.networkUrl(Uri.parse(url));
    _controller = ctrl;
    ctrl.addListener(_onVideoTick);

    await ctrl.initialize();
    if (!mounted || _controller != ctrl) {
      ctrl.removeListener(_onVideoTick);
      ctrl.dispose();
      return;
    }

    final store = VideoVolumeStore.instance;
    await ctrl.setVolume(store.muted ? 0.0 : store.volume);

    final snapshot = _VideoPlaybackStore.read(widget.playbackKey);
    if (snapshot != null) {
      final maxMs = ctrl.value.duration.inMilliseconds;
      final ms = snapshot.position.inMilliseconds.clamp(0, maxMs);
      await ctrl.seekTo(Duration(milliseconds: ms));
    }

    await ctrl.play();
    await ctrl.setPlaybackSpeed(_speed);

    setState(() {
      _initialized = true;
      _playing = ctrl.value.isPlaying;
    });
    _scheduleHide();
  }

  void _onVideoTick() {
    if (!mounted) return;
    final ctrl = _controller;
    if (ctrl == null) return;

    if (_qualityLoading) {
      final exp = widget.expectedDuration;
      final durSec = ctrl.value.duration.inSeconds.toDouble();
      final ready = (exp == null || exp <= 0 || durSec >= exp * 0.9);
      if (ready) {
        if (_seekAfterLoad != null) {
          ctrl.seekTo(_seekAfterLoad!);
          _seekAfterLoad = null;
        }
        if (_resumeAfterQuality) {
          ctrl.play();
          _resumeAfterQuality = false;
        }
        setState(() => _qualityLoading = false);
      }
    }

    final nextPlaying = ctrl.value.isPlaying;
    if (nextPlaying != _playing) {
      setState(() => _playing = nextPlaying);
    } else {
      setState(() {});
    }
  }

  void _scheduleHide() {
    _hideTimer?.cancel();
    _hideTimer = Timer(const Duration(seconds: 3), () {
      if (!mounted) return;
      if (_playing) setState(() => _showControls = false);
    });
  }

  void _revealControls() {
    setState(() => _showControls = true);
    _scheduleHide();
  }

  void _togglePlayPause() {
    final ctrl = _controller;
    if (!_initialized || ctrl == null) return;
    if (ctrl.value.isPlaying) {
      ctrl.pause();
      setState(() => _showControls = true);
      _hideTimer?.cancel();
    } else {
      ctrl.play();
      _revealControls();
    }
  }

  void _toggleMute() =>
      VideoVolumeStore.instance.setMuted(!VideoVolumeStore.instance.muted);

  Future<void> _switchQuality(VideoQuality? quality) async {
    final ctrl = _controller;
    if (ctrl == null) return;

    final savedPos = ctrl.value.position;
    final wasPlaying = ctrl.value.isPlaying;

    ctrl.removeListener(_onVideoTick);
    await ctrl.pause();
    await ctrl.dispose();
    _controller = null;

    setState(() {
      _selectedQuality = quality;
      _qualityLoading = true;
      _initialized = false;
    });

    _seekAfterLoad = savedPos;
    _resumeAfterQuality = wasPlaying;

    final nextUrl = quality?.url ?? widget.url;
    final newCtrl = VideoPlayerController.networkUrl(Uri.parse(nextUrl));
    _controller = newCtrl;
    newCtrl.addListener(_onVideoTick);

    await newCtrl.initialize();
    if (!mounted || _controller != newCtrl) {
      newCtrl.removeListener(_onVideoTick);
      newCtrl.dispose();
      return;
    }

    final store = VideoVolumeStore.instance;
    await newCtrl.setVolume(store.muted ? 0.0 : store.volume);
    await newCtrl.setPlaybackSpeed(_speed);

    setState(() => _initialized = true);

    final exp = widget.expectedDuration;
    final durSec = newCtrl.value.duration.inSeconds.toDouble();
    if (exp == null || exp <= 0 || durSec >= exp * 0.9) {
      if (_seekAfterLoad != null) {
        await newCtrl.seekTo(_seekAfterLoad!);
        _seekAfterLoad = null;
      }
      if (_resumeAfterQuality) {
        await newCtrl.play();
        _resumeAfterQuality = false;
      }
      setState(() => _qualityLoading = false);
    }
  }

  void _showSpeedSheet() {
    showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF141D30),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (_) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 36,
              height: 4,
              margin: const EdgeInsets.symmetric(vertical: 10),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.18),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Text(
                LanguageController.instance.t('video.speed'),
                style: const TextStyle(color: Color(0xFF9BAECF), fontSize: 12),
              ),
            ),
            Flexible(
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    ..._kSpeeds.map((s) => ListTile(
                          contentPadding: const EdgeInsets.symmetric(horizontal: 20),
                          title: Text(
                            '${s}x',
                            style: TextStyle(
                              color: s == _speed ? _kPrimary : const Color(0xFFD0D8EE),
                              fontWeight: s == _speed ? FontWeight.w600 : FontWeight.normal,
                            ),
                          ),
                          trailing: s == _speed
                              ? const Icon(Icons.check_rounded,
                                  color: _kPrimary, size: 18)
                              : null,
                          onTap: () {
                            Navigator.pop(context);
                            setState(() => _speed = s);
                            _controller?.setPlaybackSpeed(s);
                          },
                        )),
                    const SizedBox(height: 8),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _showQualitySheet() {
    final qualities = widget.qualities;
    if (qualities == null || qualities.isEmpty) return;
    showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF141D30),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (_) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 36,
              height: 4,
              margin: const EdgeInsets.symmetric(vertical: 10),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.18),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Text(
                LanguageController.instance.t('video.quality'),
                style: const TextStyle(color: Color(0xFF9BAECF), fontSize: 12),
              ),
            ),
            Flexible(
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    ListTile(
                      contentPadding: const EdgeInsets.symmetric(horizontal: 20),
                      title: Text(
                        'Auto',
                        style: TextStyle(
                          color: _selectedQuality == null
                              ? _kPrimary
                              : const Color(0xFFD0D8EE),
                          fontWeight: _selectedQuality == null
                              ? FontWeight.w600
                              : FontWeight.normal,
                        ),
                      ),
                      trailing: _selectedQuality == null
                          ? const Icon(Icons.check_rounded, color: _kPrimary, size: 18)
                          : null,
                      onTap: () {
                        Navigator.pop(context);
                        _switchQuality(null);
                      },
                    ),
                    ...qualities.map((q) => ListTile(
                          contentPadding: const EdgeInsets.symmetric(horizontal: 20),
                          title: Text(
                            q.label,
                            style: TextStyle(
                              color: _selectedQuality?.label == q.label
                                  ? _kPrimary
                                  : const Color(0xFFD0D8EE),
                              fontWeight: _selectedQuality?.label == q.label
                                  ? FontWeight.w600
                                  : FontWeight.normal,
                            ),
                          ),
                          trailing: _selectedQuality?.label == q.label
                              ? const Icon(Icons.check_rounded,
                                  color: _kPrimary, size: 18)
                              : null,
                          onTap: () {
                            Navigator.pop(context);
                            _switchQuality(q);
                          },
                        )),
                    const SizedBox(height: 8),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  void dispose() {
    _hideTimer?.cancel();
    _volumeUnsub?.call();
    final ctrl = _controller;
    if (ctrl != null) {
      _VideoPlaybackStore.write(
        widget.playbackKey,
        position: ctrl.value.position,
        wasPlaying: ctrl.value.isPlaying,
      );
    }
    _controller?.removeListener(_onVideoTick);
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ctrl = _controller;
    if (!_initialized || ctrl == null) {
      return const Center(
        child: CircularProgressIndicator(strokeWidth: 2, color: _kPrimary),
      );
    }

    final position = ctrl.value.position;
    final duration = ctrl.value.duration;
    final progress = duration.inMilliseconds > 0
        ? (position.inMilliseconds / duration.inMilliseconds).clamp(0.0, 1.0)
        : 0.0;
    final hasQualities = (widget.qualities?.isNotEmpty ?? false);
    final qualityLabel = _selectedQuality?.label ?? 'Auto';

    return GestureDetector(
      onTap: _revealControls,
      child: Stack(
        alignment: Alignment.center,
        children: [
          SizedBox.expand(
            child: FittedBox(
              fit: BoxFit.contain,
              child: SizedBox(
                width: ctrl.value.size.width,
                height: ctrl.value.size.height,
                child: VideoPlayer(ctrl),
              ),
            ),
          ),

          // Quality loading spinner
          if (_qualityLoading)
            Container(
              color: Colors.black45,
              child: const Center(
                child:
                    CircularProgressIndicator(strokeWidth: 3, color: _kPrimary),
              ),
            ),

          // Controls overlay
          AnimatedOpacity(
            opacity: _showControls ? 1.0 : 0.0,
            duration: const Duration(milliseconds: 180),
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
                    Center(
                      child: GestureDetector(
                        onTap: _togglePlayPause,
                        child: Container(
                          width: 62,
                          height: 62,
                          decoration: BoxDecoration(
                            color: Colors.black.withValues(alpha: 0.55),
                            shape: BoxShape.circle,
                          ),
                          child: Icon(
                            _playing
                                ? Icons.pause_rounded
                                : Icons.play_arrow_rounded,
                            color: Colors.white,
                            size: 38,
                          ),
                        ),
                      ),
                    ),
                    Positioned(
                      left: 0,
                      right: 0,
                      bottom: MediaQuery.of(context).padding.bottom + 18,
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            SliderTheme(
                              data: SliderTheme.of(context).copyWith(
                                trackHeight: 3,
                                thumbShape: const RoundSliderThumbShape(
                                    enabledThumbRadius: 7),
                                overlayShape: const RoundSliderOverlayShape(
                                    overlayRadius: 14),
                                activeTrackColor: _kPrimary,
                                inactiveTrackColor:
                                    Colors.white.withValues(alpha: 0.3),
                                thumbColor: _kPrimary,
                              ),
                              child: Slider(
                                value: progress,
                                onChanged: (v) {
                                  final ms =
                                      (v * duration.inMilliseconds).round();
                                  ctrl.seekTo(Duration(milliseconds: ms));
                                  setState(() => _showControls = true);
                                  _scheduleHide();
                                },
                              ),
                            ),
                            Padding(
                              padding:
                                  const EdgeInsets.symmetric(horizontal: 6),
                              child: Row(
                                children: [
                                  Text(
                                    '${_fmtDuration(position)} / ${_fmtDuration(duration)}',
                                    style: const TextStyle(
                                        color: Colors.white, fontSize: 12),
                                  ),
                                  const Spacer(),
                                  _IconBtn(
                                    icon: _muted
                                        ? Icons.volume_off_rounded
                                        : Icons.volume_up_rounded,
                                    onTap: _toggleMute,
                                  ),
                                  if (hasQualities)
                                    _TextBtn(
                                        label: qualityLabel,
                                        onTap: _showQualitySheet),
                                  _TextBtn(
                                    label: _speed == _speed.truncateToDouble()
                                        ? '${_speed.toInt()}x'
                                        : '${_speed}x',
                                    onTap: _showSpeedSheet,
                                  ),
                                  if (widget.allowDownload &&
                                      widget.onDownload != null)
                                    _IconBtn(
                                        icon: Icons.download_rounded,
                                        onTap: widget.onDownload!),
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

class _PlaybackSnapshot {
  const _PlaybackSnapshot({required this.position, required this.wasPlaying});
  final Duration position;
  final bool wasPlaying;
}

class _VideoPlaybackStore {
  static final Map<String, _PlaybackSnapshot> _byKey = {};

  static _PlaybackSnapshot? read(String key) => _byKey[key];

  static void write(
    String key, {
    required Duration position,
    required bool wasPlaying,
  }) {
    _byKey[key] = _PlaybackSnapshot(position: position, wasPlaying: wasPlaying);
  }
}

class _NavButton extends StatelessWidget {
  const _NavButton({
    required this.alignment,
    required this.icon,
    required this.onTap,
  });

  final Alignment alignment;
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: alignment,
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          margin: const EdgeInsets.symmetric(horizontal: 8),
          width: 36,
          height: 36,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: Colors.black.withValues(alpha: 0.35),
          ),
          child: Icon(icon, color: const Color(0xFFE5E7EB), size: 24),
        ),
      ),
    );
  }
}
