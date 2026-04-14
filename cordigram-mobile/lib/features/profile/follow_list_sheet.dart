import 'package:flutter/material.dart';
import '../../core/config/app_theme.dart';
import '../../core/services/auth_storage.dart';
import 'services/profile_service.dart';

// ── Model ────────────────────────────────────────────────────────────────────

class FollowListItem {
  FollowListItem({
    required this.userId,
    required this.username,
    required this.displayName,
    required this.avatarUrl,
    required this.isFollowing,
    this.isCreatorVerified = false,
  });

  factory FollowListItem.fromJson(Map<String, dynamic> j) => FollowListItem(
    userId: j['userId'] as String? ?? j['id'] as String? ?? '',
    username: j['username'] as String? ?? '',
    displayName: j['displayName'] as String? ?? '',
    avatarUrl: j['avatarUrl'] as String? ?? '',
    isFollowing: j['isFollowing'] as bool? ?? false,
    isCreatorVerified: j['isCreatorVerified'] as bool? ?? false,
  );

  final String userId;
  final String username;
  final String displayName;
  final String avatarUrl;
  bool isFollowing;
  final bool isCreatorVerified;
}

// ── Entry point ───────────────────────────────────────────────────────────────

enum FollowTab { followers, following }

/// Opens a modal bottom sheet with the follower / following list.
/// [onCountsChange] is called with delta values for followers/following count.
/// [onNavigateToProfile] is called when a user row is tapped; the caller
/// should push the profile screen for [userId].
void showFollowListSheet(
  BuildContext context, {
  required String ownerUserId,
  required String ownerUsername,
  required FollowTab initialTab,
  String? viewerId,
  void Function({int? followersDelta, int? followingDelta})? onCountsChange,
  void Function(String userId)? onNavigateToProfile,
}) {
  showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _FollowListSheet(
      ownerUserId: ownerUserId,
      ownerUsername: ownerUsername,
      initialTab: initialTab,
      viewerId: viewerId,
      onCountsChange: onCountsChange,
      onNavigateToProfile: onNavigateToProfile,
    ),
  );
}

// ── Sheet widget ─────────────────────────────────────────────────────────────

class _FollowListSheet extends StatefulWidget {
  const _FollowListSheet({
    required this.ownerUserId,
    required this.ownerUsername,
    required this.initialTab,
    this.viewerId,
    this.onCountsChange,
    this.onNavigateToProfile,
  });

  final String ownerUserId;
  final String ownerUsername;
  final FollowTab initialTab;
  final String? viewerId;
  final void Function({int? followersDelta, int? followingDelta})?
  onCountsChange;
  final void Function(String userId)? onNavigateToProfile;

  @override
  State<_FollowListSheet> createState() => _FollowListSheetState();
}

// ── Per-tab state ─────────────────────────────────────────────────────────────

class _TabData {
  _TabData();
  List<FollowListItem> items = [];
  String? nextCursor;
  bool loading = false;
  bool loadingMore = false;
  bool loaded = false;
  String error = '';
}

class _FollowListSheetState extends State<_FollowListSheet>
    with SingleTickerProviderStateMixin {
  late TabController _tabCtrl;
  final _followers = _TabData();
  final _following = _TabData();

  final _followersSearch = TextEditingController();
  final _followingSearch = TextEditingController();

  // Separate scroll controllers — sharing one between two ListViews in
  // TabBarView causes assertion failures when both are rendered.
  final _followersScroll = ScrollController();
  final _followingScroll = ScrollController();

  // Guards concurrent toggle calls for the same userId.
  // Without this, a quick double-tap reads the already-mutated isFollowing
  // value and immediately fires the reverse action (unfollow right after follow).
  final _pendingToggles = <String>{};

  AppSemanticColors get _tokens =>
      Theme.of(context).extension<AppSemanticColors>() ??
      (Theme.of(context).brightness == Brightness.dark
          ? AppSemanticColors.dark
          : AppSemanticColors.light);

  Color get _bg => _tokens.panel;
  Color get _surface => _tokens.panelMuted;
  Color get _border => _tokens.panelBorder;
  Color get _textPrimary => _tokens.text;
  Color get _textSecondary => _tokens.textMuted;
  Color get _accent => _tokens.primary;
  static const _defaultAvatar =
      'https://res.cloudinary.com/doicocgeo/image/upload/v1765850274/user-avatar-default_gfx5bs.jpg';

  @override
  void initState() {
    super.initState();
    final startIdx = widget.initialTab == FollowTab.followers ? 0 : 1;
    _tabCtrl = TabController(length: 2, vsync: this, initialIndex: startIdx);
    _tabCtrl.addListener(_onTabChanged);
    _loadFirstPage(
      widget.initialTab == FollowTab.followers
          ? FollowTab.followers
          : FollowTab.following,
    );
  }

  @override
  void dispose() {
    _tabCtrl.removeListener(_onTabChanged);
    _tabCtrl.dispose();
    _followersSearch.dispose();
    _followingSearch.dispose();
    _followersScroll.dispose();
    _followingScroll.dispose();
    super.dispose();
  }

  void _onTabChanged() {
    if (_tabCtrl.indexIsChanging) return;
    final tab = _tabCtrl.index == 0 ? FollowTab.followers : FollowTab.following;
    final data = tab == FollowTab.followers ? _followers : _following;
    if (!data.loaded && !data.loading) {
      _loadFirstPage(tab);
    }
    // Scroll to top of list when switching tabs (use the tab-specific controller)
    final sc = tab == FollowTab.followers ? _followersScroll : _followingScroll;
    if (sc.hasClients) {
      sc.jumpTo(0);
    }
    setState(() {});
  }

  // ── Data loading ────────────────────────────────────────────────────────────

  Future<void> _loadFirstPage(FollowTab tab) async {
    final data = tab == FollowTab.followers ? _followers : _following;
    if (data.loading) return;
    setState(() {
      data.loading = true;
      data.error = '';
    });
    try {
      final raw = tab == FollowTab.followers
          ? await ProfileService.fetchFollowers(widget.ownerUserId, limit: 20)
          : await ProfileService.fetchFollowing(widget.ownerUserId, limit: 20);
      if (!mounted) return;
      final items = (raw['items'] as List<dynamic>? ?? [])
          .map((e) => FollowListItem.fromJson(e as Map<String, dynamic>))
          .toList();
      setState(() {
        data.items = items;
        data.nextCursor = raw['nextCursor'] as String?;
        data.loading = false;
        data.loaded = true;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        data.loading = false;
        data.error = e.toString().replaceFirst(RegExp(r'^.*?Exception: '), '');
      });
    }
  }

  Future<void> _loadMore(FollowTab tab) async {
    final data = tab == FollowTab.followers ? _followers : _following;
    if (data.loading || data.loadingMore) return;
    if (data.nextCursor == null) return;
    setState(() => data.loadingMore = true);
    try {
      final raw = tab == FollowTab.followers
          ? await ProfileService.fetchFollowers(
              widget.ownerUserId,
              limit: 20,
              cursor: data.nextCursor,
            )
          : await ProfileService.fetchFollowing(
              widget.ownerUserId,
              limit: 20,
              cursor: data.nextCursor,
            );
      if (!mounted) return;
      final newItems = (raw['items'] as List<dynamic>? ?? [])
          .map((e) => FollowListItem.fromJson(e as Map<String, dynamic>))
          .toList();
      setState(() {
        data.items = [...data.items, ...newItems];
        data.nextCursor = raw['nextCursor'] as String?;
        data.loadingMore = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => data.loadingMore = false);
    }
  }

  // ── Follow toggle ───────────────────────────────────────────────────────────

  Future<void> _toggleFollow(FollowListItem item) async {
    // Guard: ignore tap if this userId already has an in-flight request.
    // Without this guard, a quick second tap reads the already-mutated
    // isFollowing value and fires the reverse action immediately.
    if (_pendingToggles.contains(item.userId)) return;
    if (AuthStorage.accessToken == null) return;
    if (widget.viewerId != null && item.userId == widget.viewerId) return;

    final next = !item.isFollowing;
    final isOwner =
        widget.viewerId != null && widget.viewerId == widget.ownerUserId;
    final followingDelta = isOwner ? (next ? 1 : -1) : 0;

    setState(() => _pendingToggles.add(item.userId));

    // Optimistic update in both lists
    _updateIsFollowing(item.userId, next);
    if (followingDelta != 0) {
      widget.onCountsChange?.call(followingDelta: followingDelta);
    }

    try {
      if (next) {
        await ProfileService.followUser(item.userId);
      } else {
        await ProfileService.unfollowUser(item.userId);
      }
    } catch (e) {
      if (!mounted) return;
      // Revert on failure
      _updateIsFollowing(item.userId, !next);
      if (followingDelta != 0) {
        widget.onCountsChange?.call(followingDelta: -followingDelta);
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            e.toString().replaceFirst(RegExp(r'^.*?Exception: '), ''),
          ),
        ),
      );
    } finally {
      if (mounted)
        setState(() => _pendingToggles.remove(item.userId));
      else
        _pendingToggles.remove(item.userId);
    }
  }

  void _updateIsFollowing(String userId, bool value) {
    setState(() {
      for (final item in _followers.items) {
        if (item.userId == userId) item.isFollowing = value;
      }
      for (final item in _following.items) {
        if (item.userId == userId) item.isFollowing = value;
      }
    });
  }

  // ── Filtered list ───────────────────────────────────────────────────────────

  List<FollowListItem> _filtered(FollowTab tab) {
    final data = tab == FollowTab.followers ? _followers : _following;
    final query =
        (tab == FollowTab.followers ? _followersSearch : _followingSearch).text
            .trim()
            .toLowerCase();
    if (query.isEmpty) return data.items;
    return data.items.where((u) {
      return u.username.toLowerCase().contains(query) ||
          u.displayName.toLowerCase().contains(query);
    }).toList();
  }

  // ── Build ───────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final screenH = MediaQuery.of(context).size.height;
    return Container(
      height: screenH * 0.82,
      decoration: BoxDecoration(
        color: _bg,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: Column(
        children: [
          _buildHandle(),
          _buildHeader(),
          _buildTabs(),
          _buildSearch(),
          Divider(color: _border, height: 1),
          Expanded(child: _buildTabView()),
        ],
      ),
    );
  }

  Widget _buildHandle() {
    return Padding(
      padding: const EdgeInsets.only(top: 10, bottom: 6),
      child: Center(
        child: Container(
          width: 40,
          height: 4,
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.18),
            borderRadius: BorderRadius.circular(2),
          ),
        ),
      ),
    );
  }

  Widget _buildHeader() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 4, 8, 8),
      child: Row(
        children: [
          Expanded(
            child: Text(
              '@${widget.ownerUsername}',
              style: TextStyle(
                color: _textPrimary,
                fontSize: 16,
                fontWeight: FontWeight.w700,
              ),
              overflow: TextOverflow.ellipsis,
            ),
          ),
          IconButton(
            onPressed: () => Navigator.of(context).pop(),
            icon: Icon(Icons.close_rounded, color: _textSecondary),
            tooltip: 'Close',
          ),
        ],
      ),
    );
  }

  Widget _buildTabs() {
    return TabBar(
      controller: _tabCtrl,
      labelColor: _textPrimary,
      unselectedLabelColor: _textSecondary,
      indicatorColor: _accent,
      indicatorSize: TabBarIndicatorSize.tab,
      labelStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
      unselectedLabelStyle: const TextStyle(
        fontSize: 14,
        fontWeight: FontWeight.w400,
      ),
      tabs: const [
        Tab(text: 'Followers'),
        Tab(text: 'Following'),
      ],
    );
  }

  Widget _buildSearch() {
    final tab = _tabCtrl.index == 0 ? FollowTab.followers : FollowTab.following;
    final ctrl = tab == FollowTab.followers
        ? _followersSearch
        : _followingSearch;
    final hint = tab == FollowTab.followers
        ? 'Search followers'
        : 'Search following';

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
      child: TextField(
        controller: ctrl,
        onChanged: (_) => setState(() {}),
        style: TextStyle(color: _textPrimary, fontSize: 14),
        decoration: InputDecoration(
          hintText: hint,
          hintStyle: TextStyle(color: _textSecondary.withValues(alpha: 0.6)),
          prefixIcon: Icon(
            Icons.search_rounded,
            color: _textSecondary,
            size: 20,
          ),
          suffixIcon: ctrl.text.isNotEmpty
              ? GestureDetector(
                  onTap: () {
                    ctrl.clear();
                    setState(() {});
                  },
                  child: Icon(
                    Icons.close_rounded,
                    color: _textSecondary,
                    size: 18,
                  ),
                )
              : null,
          filled: true,
          fillColor: _surface,
          isDense: true,
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 14,
            vertical: 11,
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(24),
            borderSide: BorderSide(color: _border),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(24),
            borderSide: BorderSide(color: _accent),
          ),
        ),
      ),
    );
  }

  Widget _buildTabView() {
    return TabBarView(
      controller: _tabCtrl,
      children: [
        _buildList(FollowTab.followers),
        _buildList(FollowTab.following),
      ],
    );
  }

  Widget _buildList(FollowTab tab) {
    final data = tab == FollowTab.followers ? _followers : _following;

    if (data.loading) {
      return Center(
        child: CircularProgressIndicator(color: _accent, strokeWidth: 2),
      );
    }

    if (data.error.isNotEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline, color: Color(0xFFE53935), size: 36),
            const SizedBox(height: 12),
            Text(
              data.error,
              style: TextStyle(color: _textSecondary, fontSize: 14),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            TextButton(
              onPressed: () => _loadFirstPage(tab),
              child: Text('Retry', style: TextStyle(color: _accent)),
            ),
          ],
        ),
      );
    }

    final items = _filtered(tab);

    if (items.isEmpty) {
      final searchActive =
          (tab == FollowTab.followers ? _followersSearch : _followingSearch)
              .text
              .trim()
              .isNotEmpty;
      return Center(
        child: Text(
          searchActive ? 'No matches found' : 'No users yet',
          style: TextStyle(color: _textSecondary, fontSize: 14),
        ),
      );
    }

    return NotificationListener<ScrollNotification>(
      onNotification: (notif) {
        if (notif is ScrollEndNotification &&
            notif.metrics.pixels >= notif.metrics.maxScrollExtent - 200) {
          _loadMore(tab);
        }
        return false;
      },
      child: ListView.builder(
        controller: tab == FollowTab.followers
            ? _followersScroll
            : _followingScroll,
        padding: EdgeInsets.only(
          bottom: MediaQuery.of(context).padding.bottom + 12,
        ),
        itemCount: items.length + (data.loadingMore ? 1 : 0),
        itemBuilder: (ctx, i) {
          if (i == items.length) {
            return Padding(
              padding: EdgeInsets.symmetric(vertical: 16),
              child: Center(
                child: CircularProgressIndicator(
                  color: _accent,
                  strokeWidth: 2,
                ),
              ),
            );
          }
          return _UserRow(
            item: items[i],
            viewerId: widget.viewerId,
            isPending: _pendingToggles.contains(items[i].userId),
            onToggleFollow: () => _toggleFollow(items[i]),
            onTap: widget.onNavigateToProfile != null
                ? () {
                    Navigator.of(context).pop();
                    widget.onNavigateToProfile!(items[i].userId);
                  }
                : null,
          );
        },
      ),
    );
  }
}

// ── Row widget ────────────────────────────────────────────────────────────────

class _UserRow extends StatelessWidget {
  const _UserRow({
    required this.item,
    required this.viewerId,
    required this.isPending,
    required this.onToggleFollow,
    this.onTap,
  });

  final FollowListItem item;
  final String? viewerId;
  final bool isPending;
  final VoidCallback onToggleFollow;
  final VoidCallback? onTap;

  static const _defaultAvatar =
      'https://res.cloudinary.com/doicocgeo/image/upload/v1765850274/user-avatar-default_gfx5bs.jpg';

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final tokens =
        theme.extension<AppSemanticColors>() ??
        (theme.brightness == Brightness.dark
            ? AppSemanticColors.dark
            : AppSemanticColors.light);
    final isSelf = viewerId != null && item.userId == viewerId;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        children: [
          // Avatar
          GestureDetector(
            onTap: onTap,
            child: CircleAvatar(
              radius: 22,
              backgroundColor: tokens.panelBorder,
              backgroundImage:
                  (item.avatarUrl.isNotEmpty
                          ? NetworkImage(item.avatarUrl)
                          : NetworkImage(_defaultAvatar))
                      as ImageProvider,
            ),
          ),
          const SizedBox(width: 12),
          // Identity
          Expanded(
            child: GestureDetector(
              onTap: onTap,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Flexible(
                        child: Text(
                          item.displayName.isNotEmpty
                              ? item.displayName
                              : item.username,
                          style: TextStyle(
                            color: tokens.text,
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      if (item.isCreatorVerified) ...[
                        const SizedBox(width: 4),
                        Icon(
                          Icons.verified_rounded,
                          color: tokens.primary,
                          size: 14,
                        ),
                      ],
                    ],
                  ),
                  const SizedBox(height: 2),
                  Text(
                    '@${item.username}',
                    style: TextStyle(color: tokens.textMuted, fontSize: 12),
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(width: 12),
          // Follow button
          if (!isSelf)
            _FollowButton(
              isFollowing: item.isFollowing,
              isPending: isPending,
              onTap: onToggleFollow,
            ),
          if (isSelf)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
              decoration: BoxDecoration(
                color: tokens.panelBorder,
                borderRadius: BorderRadius.circular(20),
              ),
              child: Text(
                'You',
                style: TextStyle(
                  color: tokens.textMuted,
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

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
    final theme = Theme.of(context);
    final tokens =
        theme.extension<AppSemanticColors>() ??
        (theme.brightness == Brightness.dark
            ? AppSemanticColors.dark
            : AppSemanticColors.light);
    return GestureDetector(
      onTap: isPending ? null : onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 7),
        decoration: BoxDecoration(
          color: isPending
              ? tokens.panelBorder
              : isFollowing
              ? Colors.transparent
              : tokens.primary,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: isPending
                ? tokens.panelBorder
                : isFollowing
                ? tokens.primary
                : Colors.transparent,
          ),
        ),
        child: isPending
            ? SizedBox(
                width: 48,
                child: Center(
                  child: SizedBox(
                    width: 14,
                    height: 14,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: tokens.primary,
                    ),
                  ),
                ),
              )
            : Text(
                isFollowing ? 'Following' : 'Follow',
                style: TextStyle(
                  color: isFollowing ? tokens.primary : Colors.white,
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                ),
              ),
      ),
    );
  }
}
