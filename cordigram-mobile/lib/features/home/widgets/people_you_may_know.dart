import 'dart:async';
import 'package:flutter/material.dart';
import '../../../core/services/api_service.dart';
import '../../../core/services/auth_storage.dart';

// ── Model ─────────────────────────────────────────────────────────────────────

class _SuggestionItem {
  final String userId;
  final String username;
  final String displayName;
  final String? avatarUrl;
  final String? reason;
  final bool isFollowingInitial;

  const _SuggestionItem({
    required this.userId,
    required this.username,
    required this.displayName,
    this.avatarUrl,
    this.reason,
    required this.isFollowingInitial,
  });

  factory _SuggestionItem.fromJson(Map<String, dynamic> j) {
    return _SuggestionItem(
      userId: j['userId'] as String? ?? '',
      username: j['username'] as String? ?? '',
      displayName: j['displayName'] as String? ?? '',
      avatarUrl: j['avatarUrl'] as String?,
      reason: j['reason'] as String?,
      isFollowingInitial: j['isFollowing'] as bool? ?? false,
    );
  }
}

// ── Constants ─────────────────────────────────────────────────────────────────

const int _kCollapsedLimit = 10;
const int _kExpandedLimit = 20;

// ── Widget ────────────────────────────────────────────────────────────────────

class PeopleYouMayKnow extends StatefulWidget {
  const PeopleYouMayKnow({super.key});

  @override
  State<PeopleYouMayKnow> createState() => _PeopleYouMayKnowState();
}

class _PeopleYouMayKnowState extends State<PeopleYouMayKnow> {
  List<_SuggestionItem> _items = [];
  bool _loading = false;
  String? _error;
  bool _expanded = false;
  bool _dismissed = false;

  /// Mirrors web: separate map tracks optimistic follow overrides.
  /// true  = user just followed, false = user just unfollowed.
  final Map<String, bool> _followOverrides = {};

  /// Tracks in-flight requests per userId (prevents double-tapping).
  final Set<String> _pending = {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  // ── Data loading — mirrors web load() callback ────────────────────────────

  Future<void> _load({int? limit}) async {
    final token = AuthStorage.accessToken;
    if (token == null) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final n = limit ?? _kCollapsedLimit;
      final data = await ApiService.get(
        '/users/suggestions?limit=$n',
        extraHeaders: {'Authorization': 'Bearer $token'},
      );
      if (!mounted) return;
      final rawList = data['items'] as List<dynamic>? ?? const [];
      setState(() {
        _items = rawList
            .map((e) => _SuggestionItem.fromJson(e as Map<String, dynamic>))
            .toList();
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'Failed to load suggestions';
        _items = [];
      });
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  // ── Expand / collapse — mirrors web onToggleExpanded ──────────────────────

  Future<void> _toggleExpanded() async {
    final next = !_expanded;
    setState(() => _expanded = next);
    await _load(limit: next ? _kExpandedLimit : _kCollapsedLimit);
  }

  // ── Follow toggle — mirrors web onToggleFollow with Set pattern ───────────

  Future<void> _toggleFollow(_SuggestionItem item) async {
    final token = AuthStorage.accessToken;
    if (token == null || _pending.contains(item.userId)) return;

    final currently = _effectiveFollowing(item);

    setState(() {
      _pending.add(item.userId);
      _followOverrides[item.userId] = !currently; // optimistic
    });

    try {
      if (currently) {
        await ApiService.delete(
          '/users/${item.userId}/follow',
          extraHeaders: {'Authorization': 'Bearer $token'},
        );
      } else {
        await ApiService.post(
          '/users/${item.userId}/follow',
          extraHeaders: {'Authorization': 'Bearer $token'},
        );
      }
    } catch (_) {
      if (!mounted) return;
      setState(() => _followOverrides.remove(item.userId)); // roll back
    } finally {
      if (mounted) setState(() => _pending.remove(item.userId));
    }
  }

  bool _effectiveFollowing(_SuggestionItem item) {
    return _followOverrides.containsKey(item.userId)
        ? _followOverrides[item.userId]!
        : item.isFollowingInitial;
  }

  // ── Build ─────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    if (_dismissed) return const SizedBox.shrink();
    if (!_loading && _items.isEmpty && _error == null) {
      return const SizedBox.shrink();
    }

    const bgPage = Color(0xFF0B1020);
    const bgCard = Color(0xFF131929);
    const textPrime = Color(0xFFE8ECF8);
    const textDim = Color(0xFF5A6B8A);
    const accent = Color(0xFF4AA3E4);
    const divColor = Color(0xFF1E2D48);

    return ColoredBox(
      color: bgPage,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          // ── Header ────────────────────────────────────────────────────────
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 8, 0),
            child: Row(
              children: [
                const Text(
                  'People you may know',
                  style: TextStyle(
                    color: textPrime,
                    fontSize: 14,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 0.2,
                  ),
                ),
                const Spacer(),
                IconButton(
                  onPressed: () => setState(() => _dismissed = true),
                  icon: const Icon(
                    Icons.close_rounded,
                    size: 18,
                    color: Color(0xFF5A6B8A),
                  ),
                  style: IconButton.styleFrom(
                    padding: EdgeInsets.zero,
                    minimumSize: const Size(32, 32),
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                ),
              ],
            ),
          ),

          // ── Error banner ─────────────────────────────────────────────────
          if (_error != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
              child: _ErrorBanner(
                message: _error!,
                onRetry: () => _load(
                  limit: _expanded ? _kExpandedLimit : _kCollapsedLimit,
                ),
              ),
            ),

          // ── Horizontal scroll strip ───────────────────────────────────────
          const SizedBox(height: 10),
          SizedBox(
            height: 186,
            child: _loading && _items.isEmpty
                ? const _SkeletonRow()
                : ListView.separated(
                    scrollDirection: Axis.horizontal,
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    itemCount: _items.length,
                    separatorBuilder: (_, __) => const SizedBox(width: 10),
                    itemBuilder: (_, i) {
                      final item = _items[i];
                      return _SuggestionCard(
                        item: item,
                        isFollowing: _effectiveFollowing(item),
                        isPending: _pending.contains(item.userId),
                        onFollow: () => _toggleFollow(item),
                        cardColor: bgCard,
                      );
                    },
                  ),
          ),

          // ── Bottom divider ─────────────────────────────────────────────────
          const SizedBox(height: 10),
          const Divider(height: 1, thickness: 1, color: divColor),
        ],
      ),
    );
  }
}

// ── Error banner ──────────────────────────────────────────────────────────────

class _ErrorBanner extends StatelessWidget {
  const _ErrorBanner({required this.message, required this.onRetry});
  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: const Color(0xFFE53935).withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
          color: const Color(0xFFE53935).withValues(alpha: 0.25),
        ),
      ),
      child: Row(
        children: [
          const Icon(
            Icons.error_outline_rounded,
            size: 15,
            color: Color(0xFFEF4444),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              message,
              style: TextStyle(
                color: Theme.of(context).colorScheme.onSurface,
                fontSize: 12,
              ),
            ),
          ),
          TextButton(
            onPressed: onRetry,
            style: TextButton.styleFrom(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              minimumSize: Size.zero,
              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
            ),
            child: const Text(
              'Retry',
              style: TextStyle(
                color: Color(0xFF4AA3E4),
                fontSize: 12,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Card ──────────────────────────────────────────────────────────────────────

class _SuggestionCard extends StatelessWidget {
  const _SuggestionCard({
    required this.item,
    required this.isFollowing,
    required this.isPending,
    required this.onFollow,
    required this.cardColor,
  });

  final _SuggestionItem item;
  final bool isFollowing;
  final bool isPending;
  final VoidCallback onFollow;
  final Color cardColor;

  @override
  Widget build(BuildContext context) {
    const textPrime = Color(0xFFE8ECF8);
    const textSub = Color(0xFF9BAECF);
    const borderCol = Color(0xFF1E2D48);

    final name = item.displayName.isNotEmpty ? item.displayName : item.username;
    final letter = name.trim().substring(0, 1).toUpperCase();

    return Container(
      width: 132,
      decoration: BoxDecoration(
        color: cardColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: borderCol, width: 1),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          _Avatar(avatarUrl: item.avatarUrl, letter: letter),
          const SizedBox(height: 8),
          Text(
            name,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: textPrime,
              fontSize: 12,
              fontWeight: FontWeight.w700,
              height: 1.3,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            '@${item.username}',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            textAlign: TextAlign.center,
            style: const TextStyle(color: textSub, fontSize: 10.5, height: 1.3),
          ),
          const Spacer(),
          _FollowButton(
            isFollowing: isFollowing,
            isPending: isPending,
            onTap: onFollow,
          ),
        ],
      ),
    );
  }
}

// ── Avatar ────────────────────────────────────────────────────────────────────

class _Avatar extends StatelessWidget {
  const _Avatar({required this.avatarUrl, required this.letter});
  final String? avatarUrl;
  final String letter;

  @override
  Widget build(BuildContext context) {
    if (avatarUrl != null && avatarUrl!.isNotEmpty) {
      return CircleAvatar(
        radius: 30,
        backgroundImage: NetworkImage(avatarUrl!),
        backgroundColor: const Color(0xFF233050),
        onBackgroundImageError: (_, __) {},
      );
    }
    return CircleAvatar(
      radius: 30,
      backgroundColor: const Color(0xFF3470A2),
      child: Text(
        letter,
        style: const TextStyle(
          color: Colors.white,
          fontSize: 20,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

// ── Follow button ─────────────────────────────────────────────────────────────

class _FollowButton extends StatelessWidget {
  const _FollowButton({
    required this.isFollowing,
    required this.isPending,
    required this.onTap,
  });
  final bool isFollowing;
  final bool isPending;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    if (isPending) {
      return SizedBox(
        height: 30,
        width: double.infinity,
        child: Center(
          child: SizedBox(
            width: 15,
            height: 15,
            child: CircularProgressIndicator(
              strokeWidth: 2,
              color: isFollowing
                  ? const Color(0xFF5A6B8A)
                  : const Color(0xFF4AA3E4),
            ),
          ),
        ),
      );
    }

    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        height: 30,
        width: double.infinity,
        decoration: BoxDecoration(
          color: isFollowing ? Colors.transparent : const Color(0xFF1A3254),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: isFollowing
                ? const Color(0xFF3A4D6A)
                : const Color(0xFF2A4A7A),
            width: 1,
          ),
        ),
        alignment: Alignment.center,
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          mainAxisSize: MainAxisSize.min,
          children: [
            if (!isFollowing) ...[
              const Icon(Icons.add, size: 12, color: Color(0xFF4AA3E4)),
              const SizedBox(width: 3),
            ],
            Text(
              isFollowing ? 'Following' : 'Follow',
              style: TextStyle(
                color: isFollowing
                    ? const Color(0xFF7A8BB0)
                    : const Color(0xFF4AA3E4),
                fontSize: 11,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Skeleton shimmer ──────────────────────────────────────────────────────────

class _SkeletonRow extends StatefulWidget {
  const _SkeletonRow();

  @override
  State<_SkeletonRow> createState() => _SkeletonRowState();
}

class _SkeletonRowState extends State<_SkeletonRow>
    with SingleTickerProviderStateMixin {
  late AnimationController _ctrl;
  late Animation<double> _anim;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1000),
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
        final shimmer = Color.lerp(
          const Color(0xFF1A2540),
          const Color(0xFF2A3A55),
          _anim.value,
        )!;
        final bright = Color.lerp(
          const Color(0xFF1E2D48),
          const Color(0xFF304060),
          _anim.value,
        )!;

        return ListView.separated(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 12),
          itemCount: 5,
          separatorBuilder: (_, __) => const SizedBox(width: 10),
          itemBuilder: (_, __) => Container(
            width: 132,
            decoration: BoxDecoration(
              color: shimmer,
              borderRadius: BorderRadius.circular(16),
            ),
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                CircleAvatar(radius: 30, backgroundColor: bright),
                const SizedBox(height: 8),
                _ShimmerBar(width: 80, height: 10, color: bright),
                const SizedBox(height: 5),
                _ShimmerBar(width: 60, height: 8, color: bright),
                const SizedBox(height: 4),
                _ShimmerBar(width: 70, height: 8, color: bright),
                const Spacer(),
                _ShimmerBar(
                  width: double.infinity,
                  height: 30,
                  color: bright,
                  radius: 8,
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _ShimmerBar extends StatelessWidget {
  const _ShimmerBar({
    required this.width,
    required this.height,
    required this.color,
    this.radius = 5,
  });
  final double width;
  final double height;
  final Color color;
  final double radius;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(radius),
      ),
    );
  }
}
