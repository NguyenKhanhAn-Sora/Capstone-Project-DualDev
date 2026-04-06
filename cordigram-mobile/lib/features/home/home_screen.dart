import 'dart:async';
import 'package:flutter/material.dart';
import '../../core/services/api_service.dart';
import '../../core/services/auth_storage.dart';
import '../auth/login_screen.dart';
import '../post/create_tab_screen.dart';
import '../post/post_detail_screen.dart';
import '../profile/profile_screen.dart';
import '../report/report_problem_screen.dart';
import 'models/feed_post.dart';
import 'services/feed_service.dart';
import 'services/post_interaction_service.dart';
import 'widgets/people_you_may_know.dart';
import 'widgets/post_card.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> with TickerProviderStateMixin {
  // ── Feed state ────────────────────────────────────────────────────────────
  final List<FeedPostState> _states = [];
  final ScrollController _scrollController = ScrollController();

  bool _loading = false;
  bool _hasMore = true;
  bool _initialLoad = true;
  String? _error;
  int _page = 1;
  String? _viewerId;

  // ── Tab navigation ────────────────────────────────────────────────────────
  late TabController _tabController;

  // ── Nav badges ────────────────────────────────────────────────────────────
  int _notifUnread = 0;
  int _dmUnread = 0;

  // ── Profile ───────────────────────────────────────────────────────────────
  String? _avatarUrl;
  String? _displayName;
  String? _username;

  // ── Polling ────────────────────────────────────────────────────────────────
  Timer? _pollTimer;
  static const Duration _pollInterval = Duration(seconds: 5);
  final Map<String, int> _viewCooldownMap = {};
  static const int _kViewCooldownMs = 300000;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 5, vsync: this);
    _loadFeed();
    _fetchProfile();
    _fetchUnreadCounts();
    _scrollController.addListener(_onScroll);
    _startPolling();
  }

  @override
  void dispose() {
    _tabController.dispose();
    _pollTimer?.cancel();
    _scrollController.dispose();
    super.dispose();
  }

  // ── Profile + viewerId fetch ──────────────────────────────────────────────

  Future<void> _fetchProfile() async {
    try {
      final data = await ApiService.get(
        '/profiles/me',
        extraHeaders: {'Authorization': 'Bearer ${AuthStorage.accessToken}'},
      );
      if (!mounted) return;
      setState(() {
        final id = (data['userId'] as String?) ?? (data['id'] as String?);
        if (id != null) _viewerId = id;
        _avatarUrl = data['avatarUrl'] as String?;
        _displayName = data['displayName'] as String?;
        _username = data['username'] as String?;
      });
    } catch (_) {}
  }

  // ── Unread counts ───────────────────────────────────────────────────────

  Future<void> _fetchUnreadCounts() async {
    final token = AuthStorage.accessToken;
    if (token == null) return;
    try {
      final res = await ApiService.get(
        '/notifications/unread-count',
        extraHeaders: {'Authorization': 'Bearer $token'},
      );
      if (!mounted) return;
      setState(() => _notifUnread = (res['count'] as int?) ?? 0);
    } catch (_) {}
    try {
      final res = await ApiService.get(
        '/direct-messages/unread/count',
        extraHeaders: {'Authorization': 'Bearer $token'},
      );
      if (!mounted) return;
      setState(() {
        _dmUnread = (res['totalUnread'] as int?) ?? (res['count'] as int?) ?? 0;
      });
    } catch (_) {}
  }

  // ── Polling ────────────────────────────────────────────────────────

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

  // ── Post detail navigation ────────────────────────────────────────────────

  void _openPostDetail(FeedPostState state) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => PostDetailScreen(
          postId: state.post.id,
          initialState: state,
          viewerId: _viewerId,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0B1020),
      appBar: _buildAppBar(),
      body: _buildBody(),
    );
  }

  // ── Profile menu ──────────────────────────────────────────────────────────

  void _showProfileMenu() {
    final letter = (_displayName ?? _username ?? 'U')
        .trim()
        .substring(0, 1)
        .toUpperCase();
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: const Color(0xFF141D30),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => _ProfileMenuSheet(
        avatarUrl: _avatarUrl,
        avatarLetter: letter,
        displayName: _displayName,
        username: _username != null ? '@$_username' : null,
        onLogout: () {
          Navigator.pop(ctx);
          _logout();
        },
        onProfile: () {
          Navigator.pop(ctx);
          if (_viewerId != null) {
            Navigator.of(context).push(
              MaterialPageRoute(
                builder: (_) => ProfileScreen(userId: _viewerId!),
              ),
            );
          }
        },
        onReportProblem: () {
          Navigator.pop(ctx);
          Navigator.of(context).push(
            MaterialPageRoute(builder: (_) => const ReportProblemScreen()),
          );
        },
      ),
    );
  }

  // ── Build ─────────────────────────────────────────────────────────────────

  PreferredSizeWidget _buildAppBar() {
    final letter = (_displayName ?? _username ?? 'U')
        .trim()
        .substring(0, 1)
        .toUpperCase();

    return AppBar(
      backgroundColor: const Color(0xFF0D1526),
      elevation: 0,
      scrolledUnderElevation: 0,
      surfaceTintColor: Colors.transparent,
      centerTitle: false,
      titleSpacing: 14,
      title: const Text(
        'CORDIGRAM',
        style: TextStyle(
          color: Color(0xFFE8ECF8),
          fontWeight: FontWeight.w800,
          fontSize: 17,
          letterSpacing: 1.2,
        ),
      ),
      actions: [
        // Search
        IconButton(
          icon: const Icon(
            Icons.search_rounded,
            color: Color(0xFF9BAECF),
            size: 27,
          ),
          tooltip: 'Search',
          onPressed: () => ScaffoldMessenger.of(
            context,
          ).showSnackBar(const SnackBar(content: Text('Search coming soon'))),
        ),
        // Notifications with badge
        _NavBadgeButton(
          icon: Icons.notifications_outlined,
          iconSize: 27,
          count: _notifUnread,
          tooltip: 'Notifications',
          onTap: () {
            setState(() => _notifUnread = 0);
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Notifications coming soon')),
            );
          },
        ),
        // Direct messages with badge
        _NavBadgeButton(
          icon: Icons.chat_bubble_outline_rounded,
          iconSize: 27,
          count: _dmUnread,
          tooltip: 'Messages',
          onTap: () => ScaffoldMessenger.of(
            context,
          ).showSnackBar(const SnackBar(content: Text('Messages coming soon'))),
        ),
        // Profile avatar
        GestureDetector(
          onTap: _showProfileMenu,
          child: Padding(
            padding: const EdgeInsets.only(left: 2, right: 12),
            child: _avatarUrl != null
                ? CircleAvatar(
                    radius: 16,
                    backgroundImage: NetworkImage(_avatarUrl!),
                    backgroundColor: const Color(0xFF233050),
                  )
                : CircleAvatar(
                    radius: 16,
                    backgroundColor: const Color(0xFF3470A2),
                    child: Text(
                      letter,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
          ),
        ),
      ],
      // ── Tab bar below the action row ──────────────────────────────────────
      bottom: PreferredSize(
        preferredSize: const Size.fromHeight(44),
        child: ColoredBox(
          color: const Color(0xFF0D1526),
          child: TabBar(
            controller: _tabController,
            isScrollable: false,
            labelColor: const Color(0xFFE8ECF8),
            unselectedLabelColor: const Color(0xFF5A6B8A),
            labelStyle: const TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w600,
            ),
            unselectedLabelStyle: const TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w400,
            ),
            labelPadding: const EdgeInsets.symmetric(horizontal: 4),
            indicatorColor: const Color(0xFF4AA3E4),
            indicatorWeight: 2.5,
            dividerColor: Color.fromRGBO(255, 255, 255, 0.07),
            tabs: const [
              Tab(icon: Icon(Icons.home_rounded, size: 26)),
              Tab(icon: Icon(Icons.how_to_reg_outlined, size: 26)),
              Tab(icon: Icon(Icons.explore_outlined, size: 26)),
              Tab(icon: Icon(Icons.smart_display_outlined, size: 26)),
              Tab(icon: Icon(Icons.add_box_outlined, size: 26)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildBody() {
    return TabBarView(
      controller: _tabController,
      physics: const NeverScrollableScrollPhysics(),
      children: [
        _buildFeedTab(),
        const _PlaceholderTab(label: 'Following'),
        const _PlaceholderTab(label: 'Explore'),
        const _PlaceholderTab(label: 'Reels'),
        const CreateTabScreen(),
      ],
    );
  }

  Widget _buildFeedTab() {
    if (_initialLoad && _loading) {
      return const Center(
        child: CircularProgressIndicator(color: Color(0xFF4AA3E4)),
      );
    }

    if (_error != null && _states.isEmpty) {
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
          // People you may know strip
          const SliverToBoxAdapter(child: PeopleYouMayKnow()),
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
                onComment: () => _openPostDetail(_states[index]),
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

// ── Nav badge icon button ─────────────────────────────────────────────────────

class _NavBadgeButton extends StatelessWidget {
  const _NavBadgeButton({
    required this.icon,
    required this.count,
    required this.onTap,
    this.tooltip = '',
    this.iconSize = 24,
  });
  final IconData icon;
  final int count;
  final VoidCallback onTap;
  final String tooltip;
  final double iconSize;

  @override
  Widget build(BuildContext context) {
    return IconButton(
      tooltip: tooltip,
      onPressed: onTap,
      icon: Stack(
        clipBehavior: Clip.none,
        children: [
          Icon(icon, color: const Color(0xFF9BAECF), size: iconSize),
          if (count > 0)
            Positioned(
              top: -4,
              right: -5,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                decoration: BoxDecoration(
                  color: const Color(0xFFE53935),
                  borderRadius: BorderRadius.circular(8),
                ),
                constraints: const BoxConstraints(minWidth: 16, minHeight: 14),
                child: Text(
                  count > 99 ? '99+' : '$count',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 9,
                    fontWeight: FontWeight.w700,
                    height: 1.2,
                  ),
                  textAlign: TextAlign.center,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

// ── Profile menu bottom sheet ─────────────────────────────────────────────────

class _ProfileMenuSheet extends StatelessWidget {
  const _ProfileMenuSheet({
    required this.avatarLetter,
    required this.onLogout,
    required this.onReportProblem,
    required this.onProfile,
    this.avatarUrl,
    this.displayName,
    this.username,
  });
  final String? avatarUrl;
  final String avatarLetter;
  final String? displayName;
  final String? username;
  final VoidCallback onLogout;
  final VoidCallback onReportProblem;
  final VoidCallback onProfile;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Handle bar
          Container(
            width: 36,
            height: 4,
            margin: const EdgeInsets.only(top: 10, bottom: 16),
            decoration: BoxDecoration(
              color: Color.fromRGBO(255, 255, 255, 0.18),
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          // Avatar + name header
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
            child: Row(
              children: [
                avatarUrl != null
                    ? CircleAvatar(
                        radius: 24,
                        backgroundImage: NetworkImage(avatarUrl!),
                        backgroundColor: const Color(0xFF233050),
                      )
                    : CircleAvatar(
                        radius: 24,
                        backgroundColor: const Color(0xFF3470A2),
                        child: Text(
                          avatarLetter,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 18,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                const SizedBox(width: 14),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (displayName != null)
                      Text(
                        displayName!,
                        style: const TextStyle(
                          color: Color(0xFFE8ECF8),
                          fontSize: 15,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    if (username != null)
                      Text(
                        username!,
                        style: const TextStyle(
                          color: Color(0xFF7A8BB0),
                          fontSize: 13,
                        ),
                      ),
                  ],
                ),
              ],
            ),
          ),
          const Divider(color: Color(0xFF1E2D48), height: 1),
          _SheetItem(
            icon: Icons.person_outline_rounded,
            label: 'Profile',
            onTap: onProfile,
          ),
          _SheetItem(
            icon: Icons.settings_outlined,
            label: 'Settings',
            onTap: () {
              Navigator.pop(context);
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Settings coming soon')),
              );
            },
          ),
          _SheetItem(
            icon: Icons.bookmark_border_rounded,
            label: 'Saved',
            onTap: () {
              Navigator.pop(context);
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Saved coming soon')),
              );
            },
          ),
          _SheetItem(
            icon: Icons.flag_outlined,
            label: 'Report a problem',
            onTap: onReportProblem,
          ),
          _SheetItem(
            icon: Icons.logout_rounded,
            label: 'Log out',
            labelColor: const Color(0xFFE53935),
            iconColor: const Color(0xFFE53935),
            onTap: onLogout,
          ),
          const SizedBox(height: 8),
        ],
      ),
    );
  }
}

class _SheetItem extends StatelessWidget {
  const _SheetItem({
    required this.icon,
    required this.label,
    required this.onTap,
    this.labelColor,
    this.iconColor,
  });
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final Color? labelColor;
  final Color? iconColor;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
        child: Row(
          children: [
            Icon(icon, color: iconColor ?? const Color(0xFF9BAECF), size: 22),
            const SizedBox(width: 16),
            Text(
              label,
              style: TextStyle(
                color: labelColor ?? const Color(0xFFD0D8EE),
                fontSize: 15,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Placeholder tab ───────────────────────────────────────────────────────────

class _PlaceholderTab extends StatelessWidget {
  const _PlaceholderTab({required this.label});
  final String label;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(
            Icons.construction_rounded,
            size: 48,
            color: Color(0xFF4A5568),
          ),
          const SizedBox(height: 12),
          Text(
            '$label coming soon',
            style: const TextStyle(color: Color(0xFF7A8BB0), fontSize: 15),
          ),
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
