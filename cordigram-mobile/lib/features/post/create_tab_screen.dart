import 'package:flutter/material.dart';
import 'create_post_screen.dart';
import 'create_reel_screen.dart';

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
  late final TabController _tabCtrl;

  @override
  void initState() {
    super.initState();
    _tabCtrl = TabController(length: 2, vsync: this);
    _tabCtrl.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _tabCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0B1020),
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
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader() {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
      decoration: BoxDecoration(
        color: const Color(0xFF0D1526),
        border: Border(
          bottom: BorderSide(
            color: Colors.white.withValues(alpha: 0.07),
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
                      _tabCtrl.index == 0 ? 'Create post' : 'Create reel',
                      style: const TextStyle(
                        color: Color(0xFFE8ECF8),
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      _tabCtrl.index == 0
                          ? 'Share genuine moments'
                          : 'Share a short reel',
                      style: const TextStyle(
                        color: Color(0xFF7A8BB0),
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
              color: const Color(0xFF111827),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: const Color(0xFF1E2D48)),
            ),
            padding: const EdgeInsets.all(4),
            child: Row(
              children: [
                _PillTab(
                  label: 'Post',
                  icon: Icons.photo_library_outlined,
                  active: _tabCtrl.index == 0,
                  onTap: () => _tabCtrl.animateTo(0),
                ),
                _PillTab(
                  label: 'Reel',
                  icon: Icons.smart_display_outlined,
                  active: _tabCtrl.index == 1,
                  onTap: () => _tabCtrl.animateTo(1),
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
    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          curve: Curves.easeInOut,
          padding: const EdgeInsets.symmetric(vertical: 9),
          decoration: BoxDecoration(
            color: active ? const Color(0xFF1A3254) : Colors.transparent,
            borderRadius: BorderRadius.circular(9),
            border: active ? Border.all(color: const Color(0xFF2A4A7A)) : null,
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                icon,
                size: 15,
                color: active
                    ? const Color(0xFF4AA3E4)
                    : const Color(0xFF5A6B8A),
              ),
              const SizedBox(width: 6),
              Text(
                label,
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: active ? FontWeight.w700 : FontWeight.w400,
                  color: active
                      ? const Color(0xFF4AA3E4)
                      : const Color(0xFF5A6B8A),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
