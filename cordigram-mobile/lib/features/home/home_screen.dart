import 'dart:async';
import 'package:flutter/material.dart';
import '../../core/services/api_service.dart';
import '../../core/services/auth_storage.dart';
import '../auth/login_screen.dart';
import 'models/feed_post.dart';
import 'services/feed_service.dart';
import 'services/post_interaction_service.dart';
import 'widgets/post_card.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final List<FeedPostState> _states = [];
  final ScrollController _scrollController = ScrollController();

  bool _loading = false;
  bool _hasMore = true;
  bool _initialLoad = true;
  String? _error;
  int _page = 1;
  String? _viewerId;

  /// 5-second polling timer — refreshes stats for all visible posts
  Timer? _pollTimer;
  static const Duration _pollInterval = Duration(seconds: 5);

  /// Global per-post view cooldown — mirrors web's viewCooldownRef map.
  /// Stores the epoch-ms timestamp of the last recorded view per postId.
  final Map<String, int> _viewCooldownMap = {};
  // 5 minutes — same as web VIEW_COOLDOWN_MS = 300 000 ms
  static const int _kViewCooldownMs = 300000;

  @override
  void initState() {
    super.initState();
    _loadFeed();
    _fetchViewerId();
    _scrollController.addListener(_onScroll);
    _startPolling();
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    _scrollController.dispose();
    super.dispose();
  }

  // ── Polling ────────────────────────────────────────────────────────────

  /// Fetch current user’s profile to get viewerId (for isSelf detection).
  Future<void> _fetchViewerId() async {
    try {
      final data = await ApiService.get(
        '/profiles/me',
        extraHeaders: {'Authorization': 'Bearer ${AuthStorage.accessToken}'},
      );
      if (!mounted) return;
      final id = (data['userId'] as String?) ?? (data['id'] as String?);
      if (id != null) setState(() => _viewerId = id);
    } catch (_) {
      // Non-critical — fail silently; follow button just won’t hide for own posts
    }
  }

  void _startPolling() {
    _pollTimer?.cancel();
    _pollTimer = Timer.periodic(_pollInterval, (_) => _syncStats());
  }

  /// Fetches a fresh batch from the server and merges updated stats into the
  /// current list without disrupting the user's scroll position or local flags.
  Future<void> _syncStats() async {
    if (_states.isEmpty) return;
    try {
      // Use the same growing-limit strategy: fetch everything loaded so far
      final fresh = await FeedService.fetchFeed(page: _page - 1);
      final map = <String, FeedPost>{for (final p in fresh) p.id: p};
      if (!mounted) return;
      setState(() {
        for (final s in _states) {
          final updated = map[s.post.id];
          if (updated != null) s.syncFromServer(updated);
        }
      });
    } catch (_) {
      // Silently ignore polling errors
    }
  }

  // ── Infinite scroll ───────────────────────────────────────────────────────

  void _onScroll() {
    if (_scrollController.position.pixels >=
        _scrollController.position.maxScrollExtent - 300) {
      if (!_loading && _hasMore) _loadFeed();
    }
  }

  Future<void> _loadFeed({bool refresh = false}) async {
    if (_loading) return;
    setState(() {
      _loading = true;
      _error = null;
      if (refresh) {
        _states.clear();
        _page = 1;
        _hasMore = true;
        _initialLoad = true;
      }
    });
    try {
      // Mirror web: fetch limit=_page*pageSize from page 1 (no ?page= offset).
      // Then only add posts we don't already have (by ID) to avoid duplicates.
      final allPosts = await FeedService.fetchFeed(page: _page);
      final expectedLimit = _page * FeedService.pageSize;
      setState(() {
        final existingIds = {for (final s in _states) s.post.id};
        final newPosts = allPosts
            .where((p) => !existingIds.contains(p.id))
            .toList();
        _states.addAll(newPosts.map((p) => FeedPostState(post: p)));
        _page++;
        // hasMore: if the server returned as many as we asked for, assume more exist
        _hasMore = allPosts.length >= expectedLimit;
        _initialLoad = false;
      });
    } on ApiException catch (e) {
      setState(() {
        _error = e.message;
        _initialLoad = false;
      });
    } catch (_) {
      setState(() {
        _error = 'Failed to load feed. Please try again.';
        _initialLoad = false;
      });
    } finally {
      setState(() => _loading = false);
    }
  }

  // ── Like ──────────────────────────────────────────────────────────────────

  Future<void> _onLike(String postId) async {
    final idx = _states.indexWhere((s) => s.post.id == postId);
    if (idx < 0) return;
    final s = _states[idx];
    final wasLiked = s.liked;
    final delta = wasLiked ? -1 : 1;

    // Optimistic update
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

    try {
      if (!wasLiked) {
        await PostInteractionService.like(postId);
      } else {
        await PostInteractionService.unlike(postId);
      }
      // Sync from server after successful API call
      _syncStats();
    } catch (_) {
      // Roll back on failure
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
    }
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  Future<void> _onSave(String postId) async {
    final idx = _states.indexWhere((s) => s.post.id == postId);
    if (idx < 0) return;
    final s = _states[idx];
    final wasSaved = s.saved;
    final delta = wasSaved ? -1 : 1;

    // Optimistic update
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

    try {
      if (!wasSaved) {
        await PostInteractionService.save(postId);
      } else {
        await PostInteractionService.unsave(postId);
      }
    } catch (_) {
      // Roll back on failure
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
    }
  }

  // ── Hide ──────────────────────────────────────────────────────────────────

  Future<void> _onHide(String postId) async {
    // Remove from list immediately (optimistic, no rollback — mirrors web)
    setState(() => _states.removeWhere((s) => s.post.id == postId));
    try {
      await PostInteractionService.hide(postId);
    } catch (_) {
      // Silent failure — post stays hidden locally
    }
  }

  // ── View ──────────────────────────────────────────────────────────────────

  /// Called by PostCard after the 2-second dwell timer fires.
  /// Applies the global 5-minute cooldown (second layer, same as web) before
  /// hitting the API so that card-recreations don't bypass the cooldown.
  Future<void> _onView(String postId) async {
    final now = DateTime.now().millisecondsSinceEpoch;
    final last = _viewCooldownMap[postId] ?? 0;
    if (now - last < _kViewCooldownMs) return;
    // Optimistically mark to prevent concurrent duplicate calls
    _viewCooldownMap[postId] = now;
    try {
      await PostInteractionService.view(postId);
    } catch (_) {
      // Reset so the next scroll-in attempt can retry
      _viewCooldownMap.remove(postId);
    }
  }

  // ── Logout ────────────────────────────────────────────────────────────────

  Future<void> _logout() async {
    _pollTimer?.cancel();
    try {
      final refreshToken = AuthStorage.refreshToken;
      await ApiService.post(
        '/auth/logout',
        extraHeaders: refreshToken != null
            ? {'Cookie': 'refresh_token=$refreshToken'}
            : null,
      );
    } catch (_) {}
    await AuthStorage.clear();
    if (!mounted) return;
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const LoginScreen()),
      (_) => false,
    );
  }

  // ── Follow ──────────────────────────────────────────────────────────────────

  /// Optimistically toggles the follow state for all posts by [authorId],
  /// then calls the API. Rolls back on failure — mirrors web’s onFollow logic.
  Future<void> _onFollow(String authorId, bool nextFollow) async {
    setState(() {
      for (final s in _states) {
        if (s.post.authorId == authorId) s.following = nextFollow;
      }
    });
    try {
      if (nextFollow) {
        await PostInteractionService.follow(authorId);
      } else {
        await PostInteractionService.unfollow(authorId);
      }
    } catch (_) {
      if (!mounted) return;
      setState(() {
        for (final s in _states) {
          if (s.post.authorId == authorId) s.following = !nextFollow;
        }
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0B1020),
      appBar: _buildAppBar(),
      body: _buildBody(),
    );
  }

  PreferredSizeWidget _buildAppBar() {
    return AppBar(
      backgroundColor: const Color(0xFF0D1526),
      elevation: 0,
      scrolledUnderElevation: 0,
      surfaceTintColor: Colors.transparent,
      centerTitle: true,
      title: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Image.asset(
            'assets/images/cordigram-logo.png',
            height: 28,
            errorBuilder: (_, __, ___) => const SizedBox.shrink(),
          ),
          const SizedBox(width: 8),
          const Text(
            'Cordigram',
            style: TextStyle(
              color: Color(0xFFE8ECF8),
              fontWeight: FontWeight.w700,
              fontSize: 18,
            ),
          ),
        ],
      ),
      bottom: PreferredSize(
        preferredSize: const Size.fromHeight(1),
        child: Container(
          height: 1,
          color: Colors.white.withValues(alpha: 0.07),
        ),
      ),
      actions: [
        IconButton(
          icon: const Icon(Icons.logout_rounded, color: Color(0xFF7A8BB0)),
          tooltip: 'Logout',
          onPressed: _logout,
        ),
      ],
    );
  }

  Widget _buildBody() {
    if (_initialLoad && _loading) {
      return const Center(
        child: CircularProgressIndicator(color: Color(0xFF4AA3E4)),
      );
    }

    if (_initialLoad && _error != null) {
      return _ErrorState(
        message: _error!,
        onRetry: () => _loadFeed(refresh: true),
      );
    }

    if (!_initialLoad && _states.isEmpty && !_loading) {
      return _EmptyState(onRefresh: () => _loadFeed(refresh: true));
    }

    return RefreshIndicator(
      color: const Color(0xFF4AA3E4),
      backgroundColor: const Color(0xFF131929),
      onRefresh: () => _loadFeed(refresh: true),
      child: CustomScrollView(
        controller: _scrollController,
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          // Feed items
          SliverList(
            delegate: SliverChildBuilderDelegate(
              (context, index) => PostCard(
                state: _states[index],
                viewerId: _viewerId,
                onLike: () => _onLike(_states[index].post.id),
                onSave: () => _onSave(_states[index].post.id),
                onHide: () => _onHide(_states[index].post.id),
                onView: () => _onView(_states[index].post.id),
                onFollow: _onFollow,
              ),
              childCount: _states.length,
            ),
          ),
          // Loading indicator at end
          if (_loading && !_initialLoad)
            const SliverToBoxAdapter(
              child: Padding(
                padding: EdgeInsets.symmetric(vertical: 24),
                child: Center(
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: Color(0xFF4AA3E4),
                  ),
                ),
              ),
            ),
          // End of feed indicator
          if (!_hasMore && _states.isNotEmpty)
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 28),
                child: Column(
                  children: [
                    Container(
                      width: 32,
                      height: 1,
                      color: Colors.white.withValues(alpha: 0.12),
                    ),
                    const SizedBox(height: 12),
                    const Text(
                      "You've seen all the posts",
                      style: TextStyle(color: Color(0xFF7A8BB0), fontSize: 13),
                    ),
                  ],
                ),
              ),
            ),
          // Inline error after partial load
          if (_error != null && _states.isNotEmpty)
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: _InlineError(
                  message: _error!,
                  onRetry: () => _loadFeed(),
                ),
              ),
            ),
          // Bottom padding
          const SliverToBoxAdapter(child: SizedBox(height: 24)),
        ],
      ),
    );
  }
}

// ── Error / Empty states ─────────────────────────────────────────────────────

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.message, required this.onRetry});
  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(
              Icons.wifi_off_rounded,
              size: 52,
              color: Color(0xFF4A5568),
            ),
            const SizedBox(height: 16),
            Text(
              message,
              style: const TextStyle(color: Color(0xFF7A8BB0), fontSize: 14),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 20),
            ElevatedButton(
              onPressed: onRetry,
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF3470A2),
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
                padding: const EdgeInsets.symmetric(
                  horizontal: 24,
                  vertical: 12,
                ),
              ),
              child: const Text(
                'Try again',
                style: TextStyle(fontWeight: FontWeight.w700),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({required this.onRefresh});
  final VoidCallback onRefresh;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(
              Icons.dynamic_feed_rounded,
              size: 52,
              color: Color(0xFF4A5568),
            ),
            const SizedBox(height: 16),
            const Text(
              'Your feed is empty.\nFollow people to see their posts here.',
              style: TextStyle(color: Color(0xFF7A8BB0), fontSize: 14),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 20),
            ElevatedButton(
              onPressed: onRefresh,
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF3470A2),
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
                padding: const EdgeInsets.symmetric(
                  horizontal: 24,
                  vertical: 12,
                ),
              ),
              child: const Text(
                'Refresh',
                style: TextStyle(fontWeight: FontWeight.w700),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _InlineError extends StatelessWidget {
  const _InlineError({required this.message, required this.onRetry});
  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFF131929),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: const Color(0xFFEF4444).withValues(alpha: 0.35),
        ),
      ),
      child: Row(
        children: [
          const Icon(
            Icons.error_outline_rounded,
            color: Color(0xFFEF4444),
            size: 18,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              message,
              style: const TextStyle(color: Color(0xFFE8ECF8), fontSize: 13),
            ),
          ),
          TextButton(
            onPressed: onRetry,
            child: const Text(
              'Retry',
              style: TextStyle(
                color: Color(0xFF4AA3E4),
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
