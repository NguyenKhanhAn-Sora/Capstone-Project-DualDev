import 'package:flutter/material.dart';
import '../../../core/services/auth_storage.dart';
import '../../../core/services/language_controller.dart';
import '../models/story_models.dart';
import '../services/story_service.dart';
import '../screens/story_viewer_screen.dart';
import '../screens/story_creator_screen.dart';

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
        // Use an opaque scaffold-colour backdrop on frame 0, then fade the
        // story creator in on top.  This prevents the home screen from showing
        // through during the entrance animation (Flutter only skips painting
        // covered routes AFTER the opaque transition completes, so a plain
        // FadeTransition from opacity-0 lets the home feed bleed through).
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
    _load(); // Refresh viewed state
  }

  @override
  Widget build(BuildContext context) {
    final t = LanguageController.instance.t;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final borderColor = isDark
        ? const Color(0xFF1E2D48)
        : const Color(0xFFE3EAF5);

    return Container(
      height: 108,
      decoration: BoxDecoration(
        border: Border(
          bottom: BorderSide(color: borderColor, width: 0.5),
        ),
      ),
      child: _loading
          ? _StoryBarSkeleton(isDark: isDark)
          : ListView.builder(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
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
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 72,
        margin: const EdgeInsets.only(right: 12),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            SizedBox(
              width: 62,
              height: 62,
              child: Stack(
                children: [
                  // Avatar
                  Container(
                    width: 62,
                    height: 62,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: isDark
                            ? const Color(0xFF1E2D48)
                            : const Color(0xFFE3EAF5),
                        width: 2,
                      ),
                    ),
                    child: ClipOval(
                      child: avatarUrl != null && avatarUrl!.isNotEmpty
                          ? Image.network(
                              avatarUrl!,
                              fit: BoxFit.cover,
                              errorBuilder: (_, __, ___) =>
                                  _AvatarPlaceholder(isDark: isDark),
                            )
                          : _AvatarPlaceholder(isDark: isDark),
                    ),
                  ),
                  // Plus badge
                  Positioned(
                    bottom: 0,
                    right: 0,
                    child: Container(
                      width: 22,
                      height: 22,
                      decoration: const BoxDecoration(
                        shape: BoxShape.circle,
                        gradient: LinearGradient(
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                          colors: [Color(0xFF4AA3E4), Color(0xFF7C3AED)],
                        ),
                      ),
                      child: const Icon(
                        Icons.add_rounded,
                        color: Colors.white,
                        size: 15,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 6),
            Text(
              label,
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w500,
                color: isDark
                    ? const Color(0xFFE8ECF8)
                    : const Color(0xFF0F1629),
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.center,
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

    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 72,
        margin: const EdgeInsets.only(right: 12),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 62,
              height: 62,
              padding: const EdgeInsets.all(2.5),
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: unviewed
                    ? const LinearGradient(
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                        colors: [Color(0xFF4AA3E4), Color(0xFF7C3AED)],
                      )
                    : null,
                color: unviewed
                    ? null
                    : (isDark
                        ? const Color(0xFF1E2D48)
                        : const Color(0xFFDDE4EF)),
              ),
              child: Container(
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: isDark
                        ? const Color(0xFF0F1829)
                        : Colors.white,
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
            const SizedBox(height: 6),
            Text(
              name,
              style: TextStyle(
                fontSize: 11,
                fontWeight: unviewed ? FontWeight.w600 : FontWeight.w400,
                color: isDark
                    ? (unviewed
                        ? const Color(0xFFE8ECF8)
                        : const Color(0xFF7A8BB0))
                    : (unviewed
                        ? const Color(0xFF0F1629)
                        : const Color(0xFF5B6378)),
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}

// ── Avatar placeholder ────────────────────────────────────────────────────────

class _AvatarPlaceholder extends StatelessWidget {
  const _AvatarPlaceholder({required this.isDark});
  final bool isDark;

  @override
  Widget build(BuildContext context) {
    return Container(
      color: isDark ? const Color(0xFF1E2D48) : const Color(0xFFE3EAF5),
      child: Icon(
        Icons.person_rounded,
        color: isDark ? const Color(0xFF4AA3E4) : const Color(0xFF2C6AA0),
        size: 28,
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
        final opacity = 0.3 + (_anim.value * 0.4);
        final base = widget.isDark
            ? const Color(0xFF1E2D48)
            : const Color(0xFFE3EAF5);
        return ListView.builder(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          itemCount: 6,
          itemBuilder: (_, i) => Container(
            width: 72,
            margin: const EdgeInsets.only(right: 12),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Container(
                  width: 62,
                  height: 62,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: base.withValues(alpha: opacity),
                  ),
                ),
                const SizedBox(height: 6),
                Container(
                  width: 44,
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
