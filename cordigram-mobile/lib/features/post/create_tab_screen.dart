import 'package:flutter/material.dart';
import 'create_post_screen.dart';
import 'create_reel_screen.dart';
import '../livestream/create_livestream_screen.dart';

/// Wrapper screen shown in the Create tab.
/// Provides a Post / Reel mode toggle at the top,
/// matching the web's create-page mode switch.
class CreateTabScreen extends StatefulWidget {
  const CreateTabScreen({super.key});

  @override
  State<CreateTabScreen> createState() => _CreateTabScreenState();
}

class _CreateTabScreenState extends State<CreateTabScreen>
    with SingleTickerProviderStateMixin {
  static const int _kTabCount = 3;
  late TabController _tabCtrl;

  void _handleTabChanged() {
    if (!mounted) return;
    setState(() {});
  }

  void _initController({int initialIndex = 0}) {
    _tabCtrl = TabController(
      length: _kTabCount,
      vsync: this,
      initialIndex: initialIndex.clamp(0, _kTabCount - 1),
    );
    _tabCtrl.addListener(_handleTabChanged);
  }

  void _ensureControllerLength() {
    if (_tabCtrl.length == _kTabCount) return;
    final nextIndex = _tabCtrl.index.clamp(0, _kTabCount - 1);
    _tabCtrl.removeListener(_handleTabChanged);
    _tabCtrl.dispose();
    _initController(initialIndex: nextIndex);
  }

  void _safeAnimateTo(int index) {
    _ensureControllerLength();
    if (index < 0 || index >= _tabCtrl.length) return;
    _tabCtrl.animateTo(index);
  }

  @override
  void initState() {
    super.initState();
    _initController();
  }

  @override
  void dispose() {
    _tabCtrl.removeListener(_handleTabChanged);
    _tabCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    _ensureControllerLength();
    final theme = Theme.of(context);
    return Scaffold(
      backgroundColor: theme.scaffoldBackgroundColor,
      body: SafeArea(
        child: Column(
          children: [
            _buildHeader(),
            Expanded(
              child: TabBarView(
                controller: _tabCtrl,
                physics: const NeverScrollableScrollPhysics(),
                children: [
                  CreatePostScreen(showHeader: false, onPostCreated: () {}),
                  CreateReelScreen(showHeader: false, onReelCreated: () {}),
                  CreateLivestreamScreen(
                    showHeader: false,
                    isActive: _tabCtrl.index == 2,
                    onLivestreamCreated: (_) {},
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader() {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
      decoration: BoxDecoration(
        color: scheme.surface,
        border: Border(
          bottom: BorderSide(
            color: scheme.outline.withValues(alpha: 0.4),
            width: 1,
          ),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _tabCtrl.index == 0
                          ? 'Create post'
                          : _tabCtrl.index == 1
                          ? 'Create reel'
                          : 'Create livestream',
                      style: TextStyle(
                        color: scheme.onSurface,
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      _tabCtrl.index == 0
                          ? 'Share genuine moments'
                          : _tabCtrl.index == 1
                          ? 'Share a short reel'
                          : 'Set up your livestream session',
                      style: TextStyle(
                        color: scheme.onSurfaceVariant,
                        fontSize: 13,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          // Pill-style mode toggle
          Container(
            decoration: BoxDecoration(
              color: scheme.surfaceContainerHighest,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: scheme.outline),
            ),
            padding: const EdgeInsets.all(4),
            child: Row(
              children: [
                _PillTab(
                  label: 'Post',
                  icon: Icons.photo_library_outlined,
                  active: _tabCtrl.index == 0,
                  onTap: () => _safeAnimateTo(0),
                ),
                _PillTab(
                  label: 'Reel',
                  icon: Icons.smart_display_outlined,
                  active: _tabCtrl.index == 1,
                  onTap: () => _safeAnimateTo(1),
                ),
                _PillTab(
                  label: 'Live',
                  icon: Icons.wifi_tethering_rounded,
                  active: _tabCtrl.index == 2,
                  onTap: () => _safeAnimateTo(2),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _PillTab extends StatelessWidget {
  const _PillTab({
    required this.label,
    required this.icon,
    required this.active,
    required this.onTap,
  });
  final String label;
  final IconData icon;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final isDark = theme.brightness == Brightness.dark;
    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          curve: Curves.easeInOut,
          padding: const EdgeInsets.symmetric(vertical: 9),
          decoration: BoxDecoration(
            color: active
                ? (isDark
                      ? scheme.primary.withValues(alpha: 0.26)
                      : scheme.primaryContainer)
                : Colors.transparent,
            borderRadius: BorderRadius.circular(9),
            border: active
                ? Border.all(
                    color: scheme.primary.withValues(
                      alpha: isDark ? 0.55 : 0.36,
                    ),
                  )
                : null,
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                icon,
                size: 15,
                color: active
                    ? (isDark ? scheme.primary : scheme.onPrimaryContainer)
                    : scheme.onSurfaceVariant,
              ),
              const SizedBox(width: 6),
              Text(
                label,
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: active ? FontWeight.w700 : FontWeight.w400,
                  color: active
                      ? (isDark ? scheme.primary : scheme.onPrimaryContainer)
                      : scheme.onSurfaceVariant,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
