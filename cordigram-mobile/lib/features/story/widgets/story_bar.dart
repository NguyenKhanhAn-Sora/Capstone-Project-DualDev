import 'package:flutter/material.dart';
import '../../../core/services/auth_storage.dart';
import '../../../core/services/language_controller.dart';
import '../models/story_models.dart';
import '../services/story_service.dart';
import '../screens/story_viewer_screen.dart';
import '../screens/story_creator_screen.dart';

// Card dimensions — matches the web story card proportions.
const double _kCardW = 90.0;
const double _kCardH = 148.0;
const double _kRadius = 14.0;
const double _kAvatarSize = 36.0;
const double _kBarH = _kCardH + 28.0; // card + label below

class StoryBar extends StatefulWidget {
  const StoryBar({super.key, this.viewerId, this.avatarUrl});

  final String? viewerId;
  final String? avatarUrl;

  @override
  State<StoryBar> createState() => _StoryBarState();
}

class _StoryBarState extends State<StoryBar> {
  List<StoryFeedGroup> _groups = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (AuthStorage.accessToken == null) {
      if (mounted) setState(() => _loading = false);
      return;
    }
    try {
      final groups = await StoryService.fetchFeed();
      if (!mounted) return;
      setState(() {
        _groups = groups;
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _openCreator() async {
    await Navigator.of(context, rootNavigator: true).push(
      PageRouteBuilder<void>(
        pageBuilder: (_, __, ___) => const StoryCreatorScreen(),
        transitionsBuilder: (ctx, animation, __, child) {
          return Stack(
            fit: StackFit.expand,
            children: [
              ColoredBox(color: Theme.of(ctx).scaffoldBackgroundColor),
              FadeTransition(
                opacity: CurvedAnimation(
                    parent: animation, curve: Curves.easeIn),
                child: child,
              ),
            ],
          );
        },
        transitionDuration: const Duration(milliseconds: 220),
        opaque: true,
        barrierDismissible: false,
      ),
    );
    _load();
  }

  void _openViewer(int groupIndex) async {
    await Navigator.of(context, rootNavigator: true).push(
      MaterialPageRoute(
        builder: (_) => StoryViewerScreen(
          groups: _groups,
          initialGroupIndex: groupIndex,
          viewerId: widget.viewerId ?? '',
        ),
        fullscreenDialog: true,
      ),
    );
    _load();
  }

  @override
  Widget build(BuildContext context) {
    final t = LanguageController.instance.t;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final dividerColor = isDark
        ? const Color(0xFF1E2D48)
        : const Color(0xFFDDE4F0);

    return Container(
      height: _kBarH + 20, // extra vertical padding
      decoration: BoxDecoration(
        border: Border(
          bottom: BorderSide(color: dividerColor, width: 0.5),
        ),
      ),
      child: _loading
          ? _StoryBarSkeleton(isDark: isDark)
          : ListView.builder(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              itemCount: _groups.length + 1,
              itemBuilder: (context, index) {
                if (index == 0) {
                  return _AddStoryCard(
                    avatarUrl: widget.avatarUrl,
                    onTap: _openCreator,
                    label: t('story.addStory'),
                    isDark: isDark,
                  );
                }
                final group = _groups[index - 1];
                return _StoryCard(
                  group: group,
                  onTap: () => _openViewer(index - 1),
                  isDark: isDark,
                );
              },
            ),
    );
  }
}

// ── Shared card shell ─────────────────────────────────────────────────────────

/// Wraps any card content in the standard rounded + border shell.
class _CardShell extends StatelessWidget {
  const _CardShell({
    required this.child,
    required this.unviewed,
    required this.isDark,
  });

  final Widget child;
  final bool unviewed;
  final bool isDark;

  @override
  Widget build(BuildContext context) {
    // For unviewed stories: 2-px gradient border.
    // Implemented by wrapping in a gradient container and inset by 2 px.
    if (unviewed) {
      return Container(
        width: _kCardW,
        height: _kCardH,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(_kRadius),
          gradient: const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFF4AA3E4), Color(0xFF7C3AED)],
          ),
        ),
        padding: const EdgeInsets.all(2),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(_kRadius - 2),
          child: child,
        ),
      );
    }
    return Container(
      width: _kCardW,
      height: _kCardH,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(_kRadius),
        border: Border.all(
          color: isDark ? const Color(0xFF253347) : const Color(0xFFD4DCEC),
          width: 1,
        ),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(_kRadius - 1),
        child: child,
      ),
    );
  }
}

// ── Add Story card ────────────────────────────────────────────────────────────

class _AddStoryCard extends StatelessWidget {
  const _AddStoryCard({
    required this.avatarUrl,
    required this.onTap,
    required this.label,
    required this.isDark,
  });

  final String? avatarUrl;
  final VoidCallback onTap;
  final String label;
  final bool isDark;

  @override
  Widget build(BuildContext context) {
    final bgColor = isDark ? const Color(0xFF131E2E) : const Color(0xFFF0F4FB);
    final textColor =
        isDark ? const Color(0xFFE8ECF8) : const Color(0xFF0F1629);

    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(right: 10),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Card body
            Container(
              width: _kCardW,
              height: _kCardH,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(_kRadius),
                border: Border.all(
                  color: isDark
                      ? const Color(0xFF253347)
                      : const Color(0xFFD4DCEC),
                  width: 1,
                ),
                color: bgColor,
              ),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(_kRadius - 1),
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    // Avatar as background (blurred / dimmed)
                    if (avatarUrl != null && avatarUrl!.isNotEmpty)
                      Opacity(
                        opacity: 0.18,
                        child: Image.network(
                          avatarUrl!,
                          fit: BoxFit.cover,
                          errorBuilder: (_, __, ___) =>
                              const SizedBox.shrink(),
                        ),
                      ),
                    // Center: avatar circle + plus badge
                    Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          // Avatar circle
                          Container(
                            width: 46,
                            height: 46,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              border: Border.all(
                                color: isDark
                                    ? const Color(0xFF2A3A52)
                                    : const Color(0xFFD4DCEC),
                                width: 1.5,
                              ),
                              color: isDark
                                  ? const Color(0xFF1E2D48)
                                  : const Color(0xFFE8EEF8),
                            ),
                            child: ClipOval(
                              child: avatarUrl != null && avatarUrl!.isNotEmpty
                                  ? Image.network(avatarUrl!, fit: BoxFit.cover,
                                      errorBuilder: (_, __, ___) =>
                                          _AvatarPlaceholder(isDark: isDark))
                                  : _AvatarPlaceholder(isDark: isDark),
                            ),
                          ),
                          const SizedBox(height: 10),
                          // Plus badge
                          Container(
                            width: 28,
                            height: 28,
                            decoration: const BoxDecoration(
                              shape: BoxShape.circle,
                              gradient: LinearGradient(
                                begin: Alignment.topLeft,
                                end: Alignment.bottomRight,
                                colors: [Color(0xFF4AA3E4), Color(0xFF7C3AED)],
                              ),
                            ),
                            child: const Icon(Icons.add_rounded,
                                color: Colors.white, size: 18),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 6),
            SizedBox(
              width: _kCardW,
              child: Text(
                label,
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w500,
                  color: textColor,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Story card ────────────────────────────────────────────────────────────────

class _StoryCard extends StatelessWidget {
  const _StoryCard({
    required this.group,
    required this.onTap,
    required this.isDark,
  });

  final StoryFeedGroup group;
  final VoidCallback onTap;
  final bool isDark;

  @override
  Widget build(BuildContext context) {
    final unviewed = group.hasUnviewed;
    final name = group.displayName.isNotEmpty
        ? group.displayName
        : '@${group.username}';

    // Pick best thumbnail from the group's stories
    final thumb = _thumbnail(group);

    final nameColor = isDark
        ? (unviewed ? const Color(0xFFE8ECF8) : const Color(0xFF7A8BB0))
        : (unviewed ? const Color(0xFF0F1629) : const Color(0xFF5B6378));

    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(right: 10),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _CardShell(
              unviewed: unviewed,
              isDark: isDark,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  // ── Thumbnail ──────────────────────────────────────────
                  if (thumb != null)
                    Image.network(
                      thumb,
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) =>
                          _GradientFill(style: _firstGradient(group)),
                    )
                  else
                    _GradientFill(style: _firstGradient(group)),

                  // ── Bottom gradient scrim + username inside card ───────
                  Positioned(
                    left: 0,
                    right: 0,
                    bottom: 0,
                    child: Container(
                      height: 48,
                      decoration: const BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.bottomCenter,
                          end: Alignment.topCenter,
                          colors: [Color(0xDD000000), Colors.transparent],
                        ),
                      ),
                      alignment: Alignment.bottomCenter,
                      padding: const EdgeInsets.only(
                          left: 5, right: 5, bottom: 6),
                      child: Text(
                        name,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 10,
                          fontWeight: FontWeight.w600,
                          shadows: [
                            Shadow(color: Colors.black54, blurRadius: 4),
                          ],
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        textAlign: TextAlign.center,
                      ),
                    ),
                  ),

                  // ── Avatar circle at top-center ────────────────────────
                  Positioned(
                    top: 8,
                    left: 0,
                    right: 0,
                    child: Center(
                      child: Container(
                        width: _kAvatarSize,
                        height: _kAvatarSize,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: Colors.white,
                            width: 2,
                          ),
                        ),
                        child: ClipOval(
                          child: group.avatarUrl.isNotEmpty
                              ? Image.network(
                                  group.avatarUrl,
                                  fit: BoxFit.cover,
                                  errorBuilder: (_, __, ___) =>
                                      _AvatarPlaceholder(isDark: isDark),
                                )
                              : _AvatarPlaceholder(isDark: isDark),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 6),
            SizedBox(
              width: _kCardW,
              child: Text(
                name,
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: unviewed ? FontWeight.w600 : FontWeight.w400,
                  color: nameColor,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// Returns the media URL of the latest story with an image, or null.
  String? _thumbnail(StoryFeedGroup g) {
    for (final s in g.stories.reversed) {
      if (s.mediaType == 'image' && s.mediaUrl != null) return s.mediaUrl;
    }
    return null;
  }

  /// Returns the background gradient style of the first text story, if any.
  String? _firstGradient(StoryFeedGroup g) {
    for (final s in g.stories) {
      if (s.backgroundStyle != null) return s.backgroundStyle;
    }
    return null;
  }
}

// ── Gradient fill fallback ────────────────────────────────────────────────────

class _GradientFill extends StatelessWidget {
  const _GradientFill({this.style});
  final String? style;

  @override
  Widget build(BuildContext context) {
    // Try to use the story's own gradient; fall back to the app default.
    final gradient = _parse(style) ??
        const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF1E3A5F), Color(0xFF2D1B69)],
        );
    return Container(
      decoration: BoxDecoration(gradient: gradient),
    );
  }

  static LinearGradient? _parse(String? css) {
    if (css == null || css.isEmpty) return null;
    try {
      final colorPattern = RegExp(r'#[0-9a-fA-F]{6}');
      final matches = colorPattern.allMatches(css).toList();
      if (matches.isEmpty) return null;
      final colors = matches.map((m) {
        final hex = m.group(0)!.replaceFirst('#', '');
        return Color(int.parse('FF$hex', radix: 16));
      }).toList();
      if (colors.length == 1) {
        return LinearGradient(colors: [colors[0], colors[0]]);
      }
      return LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: colors,
      );
    } catch (_) {
      return null;
    }
  }
}

// ── Avatar placeholder ────────────────────────────────────────────────────────

class _AvatarPlaceholder extends StatelessWidget {
  const _AvatarPlaceholder({required this.isDark});
  final bool isDark;

  @override
  Widget build(BuildContext context) {
    return Container(
      color: isDark ? const Color(0xFF1E2D48) : const Color(0xFFDDE4F0),
      child: Icon(
        Icons.person_rounded,
        color: isDark ? const Color(0xFF4AA3E4) : const Color(0xFF2C6AA0),
        size: 20,
      ),
    );
  }
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

class _StoryBarSkeleton extends StatefulWidget {
  const _StoryBarSkeleton({required this.isDark});
  final bool isDark;

  @override
  State<_StoryBarSkeleton> createState() => _StoryBarSkeletonState();
}

class _StoryBarSkeletonState extends State<_StoryBarSkeleton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  late final Animation<double> _anim;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    )..repeat(reverse: true);
    _anim = CurvedAnimation(parent: _ctrl, curve: Curves.easeInOut);
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _anim,
      builder: (_, __) {
        final opacity = 0.25 + (_anim.value * 0.35);
        final base = widget.isDark
            ? const Color(0xFF1E2D48)
            : const Color(0xFFD4DCEC);
        return ListView.builder(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          itemCount: 5,
          itemBuilder: (_, i) => Container(
            margin: const EdgeInsets.only(right: 10),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: _kCardW,
                  height: _kCardH,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(_kRadius),
                    color: base.withValues(alpha: opacity),
                  ),
                ),
                const SizedBox(height: 6),
                Container(
                  width: 56,
                  height: 9,
                  decoration: BoxDecoration(
                    color: base.withValues(alpha: opacity),
                    borderRadius: BorderRadius.circular(4),
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
