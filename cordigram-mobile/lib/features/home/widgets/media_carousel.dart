import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../models/feed_post.dart';

/// Carousel for a list of images/videos within a post card.
/// Shows one media item at a time with prev/next arrows and a counter badge.
/// Tapping the image opens a full-screen [_ImageViewerOverlay].
class MediaCarousel extends StatefulWidget {
  const MediaCarousel({super.key, required this.media});

  final List<FeedMedia> media;

  @override
  State<MediaCarousel> createState() => _MediaCarouselState();
}

class _MediaCarouselState extends State<MediaCarousel> {
  final PageController _pageController = PageController();
  int _currentIndex = 0;

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
    Navigator.of(
      context,
    ).push(_ImageViewerRoute(media: widget.media, initialIndex: startIndex));
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
                    child: _MediaItem(media: media[i]),
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
  _ImageViewerRoute({required this.media, required this.initialIndex})
    : super(fullscreenDialog: true);

  final List<FeedMedia> media;
  final int initialIndex;

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
      child: _ImageViewerOverlay(media: media, initialIndex: initialIndex),
    );
  }
}

class _ImageViewerOverlay extends StatefulWidget {
  const _ImageViewerOverlay({required this.media, required this.initialIndex});

  final List<FeedMedia> media;
  final int initialIndex;

  @override
  State<_ImageViewerOverlay> createState() => _ImageViewerOverlayState();
}

class _ImageViewerOverlayState extends State<_ImageViewerOverlay> {
  late int _index;
  late final PageController _pageController;
  // Track whether the current page is zoomed in — disables PageView swipe
  bool _isZoomed = false;

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
                    return GestureDetector(
                      // Stop tap from reaching the background GestureDetector
                      onTap: () {},
                      child: SafeArea(
                        child: Padding(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 24,
                            vertical: 24,
                          ),
                          child: Center(
                            child: ConstrainedBox(
                              constraints: const BoxConstraints(maxWidth: 980),
                              child: _ZoomableImage(
                                url: item.url,
                                onZoomChanged: (zoomed) {
                                  // Only update if this is the current visible page
                                  if (i == _index && zoomed != _isZoomed) {
                                    setState(() => _isZoomed = zoomed);
                                  }
                                },
                              ),
                            ),
                          ),
                        ),
                      ),
                    );
                  },
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
    return ClipRRect(
      borderRadius: BorderRadius.circular(16),
      child: InteractiveViewer(
        transformationController: _transformCtrl,
        minScale: 1.0,
        maxScale: 3.0,
        clipBehavior: Clip.none,
        onInteractionEnd: _onInteractionEnd,
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
  const _MediaItem({required this.media});
  final FeedMedia media;

  @override
  Widget build(BuildContext context) {
    // object-fit: contain — shows full image, letterboxed with dark background
    return Image.network(
      media.url,
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
