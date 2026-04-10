import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../core/services/api_service.dart';
import '../../core/services/auth_storage.dart';
import '../ads/ads_campaign_detail_screen.dart';
import '../ads/ads_entry_screen.dart';
import '../ads/ads_service.dart';
import '../auth/login_screen.dart';
import '../explore/explore_screen.dart';
import '../following/following_screen.dart';
import '../hashtag/hashtag_screen.dart';
import '../notifications/notification_screen.dart';
import '../post/create_tab_screen.dart';
import '../post/post_detail_screen.dart';
import '../post/utils/post_edit_utils.dart';
import '../post/utils/repost_flow_utils.dart';
import '../profile/profile_screen.dart';
import '../reels/reels_screen.dart';
import '../search/search_screen.dart';
import '../report/report_problem_screen.dart';
import '../report/report_post_sheet.dart';
import 'models/feed_post.dart';
import 'services/feed_service.dart';
import 'services/post_interaction_service.dart';
import 'widgets/post_card.dart';
import 'widgets/people_you_may_know.dart';

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
  final Map<String, String> _campaignIdByPromotedPostId = {};

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
      setState(() {
        _notifUnread =
            (res['unreadCount'] as int?) ?? (res['count'] as int?) ?? 0;
      });
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
      final visiblePosts = allPosts.where(_shouldShowInHomeFeed).toList();
      final expectedLimit = _page * FeedService.pageSize;
      setState(() {
        final existingIds = {for (final s in _states) s.post.id};
        final newPosts = visiblePosts
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

  bool _hasStructuredAdMarkers(String value) {
    return RegExp(
      r'\[\[AD_(PRIMARY_TEXT|HEADLINE|DESCRIPTION|CTA|URL)\]\]',
      caseSensitive: false,
    ).hasMatch(value);
  }

  bool _isAdsPost(FeedPost post) {
    return (post.sponsored == true) ||
        _hasStructuredAdMarkers(post.content) ||
        _hasStructuredAdMarkers(post.repostSourceContent ?? '');
  }

  bool _shouldShowInHomeFeed(FeedPost post) {
    if (!_isAdsPost(post)) return true;
    // Only render active ads in Home.
    return post.sponsored == true;
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
        _showSnack('Saved');
      } else {
        await PostInteractionService.unsave(postId);
        _showSnack('Removed from saved');
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
      _showSnack('Failed to update save', error: true);
    }
  }

  // ── Repost ───────────────────────────────────────────────────────────────

  String _resolveOriginalPostId(FeedPost post) {
    final repostOf = post.repostOf;
    if (repostOf != null && repostOf.isNotEmpty) return repostOf;
    return post.id;
  }

  void _incrementRepostStat(String postId) {
    final idx = _states.indexWhere((s) => s.post.id == postId);
    if (idx < 0) return;
    final s = _states[idx];
    setState(() {
      s.stats = FeedStats(
        hearts: s.stats.hearts,
        comments: s.stats.comments,
        saves: s.stats.saves,
        reposts: (s.stats.reposts + 1).clamp(0, 999999999),
        views: s.stats.views,
        impressions: s.stats.impressions,
      );
    });
  }

  Future<void> _handleQuickRepost(FeedPostState targetState) async {
    if (AuthStorage.accessToken == null) {
      _showSnack('Please sign in to repost', error: true);
      return;
    }

    final targetPost = targetState.post;
    final originalId = _resolveOriginalPostId(targetPost);
    final targetId = targetPost.id;

    try {
      await PostInteractionService.quickRepost(originalId);
      _incrementRepostStat(originalId);
      if (originalId != targetId) {
        _incrementRepostStat(targetId);
        try {
          await PostInteractionService.repost(targetId);
        } catch (_) {}
      }
      _showSnack('Reposted');
    } on ApiException catch (e) {
      // Compatibility fallback: some backends reject create-repost but support
      // interaction-style repost endpoint.
      try {
        await PostInteractionService.repost(originalId);
        _incrementRepostStat(originalId);
        if (originalId != targetId) {
          _incrementRepostStat(targetId);
          try {
            await PostInteractionService.repost(targetId);
          } catch (_) {}
        }
        _showSnack('Reposted');
      } catch (_) {
        _showSnack(
          e.message.isNotEmpty ? e.message : 'Failed to repost',
          error: true,
        );
      }
    } catch (_) {
      _showSnack('Failed to repost', error: true);
    }
  }

  Future<void> _handleQuoteRepost(
    FeedPostState targetState,
    RepostQuoteInput input,
  ) async {
    if (AuthStorage.accessToken == null) {
      _showSnack('Please sign in to repost', error: true);
      return;
    }

    final targetPost = targetState.post;
    final originalId = _resolveOriginalPostId(targetPost);
    final targetId = targetPost.id;

    final payload = RepostQuotePayload(
      content: input.content,
      hashtags: input.hashtags,
      location: input.location,
      visibility: input.visibility,
      allowComments: input.allowComments,
      allowDownload: targetPost.allowDownload == true,
      hideLikeCount: input.hideLikeCount,
    );

    try {
      await PostInteractionService.quoteRepost(
        originalPostId: originalId,
        payload: payload,
        kind: targetPost.kind,
      );
      _incrementRepostStat(originalId);
      if (originalId != targetId) {
        _incrementRepostStat(targetId);
        try {
          await PostInteractionService.repost(targetId);
        } catch (_) {}
      }
      _showSnack('Reposted with quote');
    } on ApiException catch (e) {
      _showSnack(
        e.message.isNotEmpty ? e.message : 'Failed to repost with quote',
        error: true,
      );
    } catch (_) {
      _showSnack('Failed to repost with quote', error: true);
    }
  }

  Future<void> _onRepost(FeedPostState state) async {
    if (AuthStorage.accessToken == null) {
      _showSnack('Please sign in to repost', error: true);
      return;
    }

    try {
      final label = '@${state.post.authorUsername ?? state.post.displayName}';
      final selection = await showRepostFlowSheet(
        context: context,
        label: label,
        kind: state.post.kind,
        initialAllowDownload: state.post.allowDownload == true,
      );
      if (selection == null) return;
      if (selection.action == RepostFlowAction.quick) {
        await _handleQuickRepost(state);
        return;
      }
      final quoteInput = selection.quoteInput;
      if (quoteInput == null) return;
      await _handleQuoteRepost(state, quoteInput);
    } catch (_) {
      _showSnack('Unable to open repost menu', error: true);
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

  FeedPostState? _findState(String postId) {
    final idx = _states.indexWhere((s) => s.post.id == postId);
    if (idx < 0) return null;
    return _states[idx];
  }

  void _replaceState(String postId, FeedPostState next) {
    final idx = _states.indexWhere((s) => s.post.id == postId);
    if (idx < 0) return;
    setState(() => _states[idx] = next);
  }

  void _showSnack(String message, {bool error = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: error
            ? const Color(0xFFB91C1C)
            : const Color(0xFF1A2235),
      ),
    );
  }

  Future<void> _onPostMenuAction(
    PostMenuAction action,
    FeedPostState state,
  ) async {
    final post = state.post;
    switch (action) {
      case PostMenuAction.editPost:
        final updated = await showEditPostSheet(context, post: post);
        if (updated == null) return;
        _replaceState(
          post.id,
          state.copyWith(
            post: updated,
            liked: updated.liked ?? state.liked,
            saved: updated.saved ?? state.saved,
            following: updated.following ?? state.following,
            stats: updated.stats,
          ),
        );
        _showSnack('Post updated');
        return;
      case PostMenuAction.editVisibility:
        final nextVisibility = await showEditVisibilitySheet(
          context,
          postId: post.id,
          currentVisibility: post.visibility ?? 'public',
        );
        if (nextVisibility == null) return;
        _replaceState(
          post.id,
          state.copyWith(post: post.copyWith(visibility: nextVisibility)),
        );
        _showSnack('Visibility updated');
        return;
      case PostMenuAction.toggleComments:
        final currentAllowed = post.allowComments != false;
        final nextAllowed = !currentAllowed;
        _replaceState(
          post.id,
          state.copyWith(post: post.copyWith(allowComments: nextAllowed)),
        );
        try {
          await PostInteractionService.setAllowComments(post.id, nextAllowed);
          _showSnack(
            nextAllowed ? 'Comments turned on' : 'Comments turned off',
          );
        } catch (_) {
          _replaceState(
            post.id,
            state.copyWith(post: post.copyWith(allowComments: currentAllowed)),
          );
          _showSnack('Failed to update comments', error: true);
        }
        return;
      case PostMenuAction.toggleHideLike:
        final currentHidden = post.hideLikeCount == true;
        final nextHidden = !currentHidden;
        _replaceState(
          post.id,
          state.copyWith(post: post.copyWith(hideLikeCount: nextHidden)),
        );
        try {
          await PostInteractionService.setHideLikeCount(post.id, nextHidden);
          _showSnack(nextHidden ? 'Like count hidden' : 'Like count visible');
        } catch (_) {
          _replaceState(
            post.id,
            state.copyWith(post: post.copyWith(hideLikeCount: currentHidden)),
          );
          _showSnack('Failed to update like visibility', error: true);
        }
        return;
      case PostMenuAction.goToAdsPost:
        _openPostDetail(state);
        return;
      case PostMenuAction.detailAds:
        await _openAdsDetailByPostId(post.id);
        return;
      case PostMenuAction.copyLink:
        final link = PostInteractionService.permalink(post.id);
        await Clipboard.setData(ClipboardData(text: link));
        _showSnack('Link copied');
        return;
      case PostMenuAction.deletePost:
        final confirmed = await showDialog<bool>(
          context: context,
          builder: (ctx) => AlertDialog(
            backgroundColor: const Color(0xFF111827),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
            title: const Text(
              'Delete post',
              style: TextStyle(color: Color(0xFFE8ECF8), fontSize: 16),
            ),
            content: const Text(
              'This action cannot be undone.',
              style: TextStyle(color: Color(0xFF7A8BB0), fontSize: 14),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(ctx, false),
                child: const Text(
                  'Cancel',
                  style: TextStyle(color: Color(0xFF7A8BB0)),
                ),
              ),
              TextButton(
                onPressed: () => Navigator.pop(ctx, true),
                child: const Text(
                  'Delete',
                  style: TextStyle(
                    color: Color(0xFFEF4444),
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
        );
        if (confirmed != true) return;

        final snapshot = _findState(post.id);
        setState(() => _states.removeWhere((s) => s.post.id == post.id));
        try {
          await PostInteractionService.deletePost(post.id);
          _showSnack('Post deleted');
        } catch (_) {
          if (snapshot != null) {
            setState(() => _states.insert(0, snapshot));
          }
          _showSnack('Failed to delete post', error: true);
        }
        return;
      case PostMenuAction.followToggle:
        final authorId = post.authorId;
        if (authorId == null || authorId.isEmpty) return;
        await _onFollow(authorId, !state.following);
        return;
      case PostMenuAction.saveToggle:
        await _onSave(post.id);
        return;
      case PostMenuAction.hidePost:
        await _onHide(post.id);
        _showSnack('Post hidden');
        return;
      case PostMenuAction.reportPost:
        final token = AuthStorage.accessToken;
        if (token == null) {
          _showSnack('Please sign in first', error: true);
          return;
        }
        final reported = await showReportPostSheet(
          context,
          postId: post.id,
          authHeader: {'Authorization': 'Bearer $token'},
        );
        if (reported) _showSnack('Report submitted');
        return;
      case PostMenuAction.blockAccount:
        final userId = post.authorId;
        if (userId == null || userId.isEmpty) return;
        final username =
            post.authorUsername ?? post.author?.username ?? post.displayName;
        final confirmed = await showDialog<bool>(
          context: context,
          builder: (ctx) => AlertDialog(
            backgroundColor: const Color(0xFF111827),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
            title: Text(
              'Block @$username?',
              style: const TextStyle(color: Color(0xFFE8ECF8), fontSize: 16),
            ),
            content: const Text(
              'You will no longer see posts from this account.',
              style: TextStyle(color: Color(0xFF7A8BB0), fontSize: 14),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(ctx, false),
                child: const Text(
                  'Cancel',
                  style: TextStyle(color: Color(0xFF7A8BB0)),
                ),
              ),
              TextButton(
                onPressed: () => Navigator.pop(ctx, true),
                child: const Text(
                  'Block',
                  style: TextStyle(
                    color: Color(0xFFEF4444),
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
        );
        if (confirmed != true) return;

        try {
          await PostInteractionService.blockUser(userId);
          if (!mounted) return;
          setState(() {
            _states.removeWhere((s) => s.post.authorId == userId);
          });
          _showSnack('Account blocked');
        } catch (_) {
          _showSnack('Failed to block account', error: true);
        }
        return;
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

  Future<void> _openAdsDetailByPostId(String postId) async {
    Future<String?> resolveCampaignId() async {
      if (_campaignIdByPromotedPostId.containsKey(postId)) {
        return _campaignIdByPromotedPostId[postId];
      }

      final data = await AdsService.getAdsDashboard();
      for (final campaign in data.campaigns) {
        final promotedPostId = campaign.promotedPostId.trim();
        final campaignId = campaign.id.trim();
        if (promotedPostId.isNotEmpty && campaignId.isNotEmpty) {
          _campaignIdByPromotedPostId[promotedPostId] = campaignId;
        }
      }

      return _campaignIdByPromotedPostId[postId];
    }

    try {
      final campaignId = await resolveCampaignId();
      if (!mounted) return;
      if (campaignId == null || campaignId.isEmpty) {
        _showSnack('Cannot find ads campaign detail for this ads', error: true);
        return;
      }

      Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => AdsCampaignDetailScreen(campaignId: campaignId),
        ),
      );
    } on ApiException catch (e) {
      _showSnack(e.message, error: true);
    } catch (_) {
      _showSnack('Failed to open ads detail', error: true);
    }
  }

  void _openUserProfile(String userId) {
    if (userId.isEmpty) return;
    Navigator.of(context).push(
      MaterialPageRoute<void>(builder: (_) => ProfileScreen(userId: userId)),
    );
  }

  void _openHashtag(String hashtag) {
    final normalized = hashtag.replaceAll('#', '').trim().toLowerCase();
    if (normalized.isEmpty) return;
    Navigator.of(context).push(
      MaterialPageRoute<void>(builder: (_) => HashtagScreen(tag: normalized)),
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
        onAds: () {
          Navigator.pop(ctx);
          Navigator.of(
            context,
          ).push(MaterialPageRoute(builder: (_) => const AdsEntryScreen()));
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
      title: Row(
        mainAxisSize: MainAxisSize.min,
        children: const [
          Image(
            image: AssetImage('assets/images/cordigram-logo.png'),
            width: 32,
            height: 32,
          ),
          SizedBox(width: 8),
          Text(
            'CORDIGRAM',
            style: TextStyle(
              color: Color(0xFFE8ECF8),
              fontWeight: FontWeight.w800,
              fontSize: 17,
              letterSpacing: 1.2,
            ),
          ),
        ],
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
          onPressed: () => Navigator.of(
            context,
          ).push(MaterialPageRoute(builder: (_) => const SearchScreen())),
        ),
        // Notifications with badge
        _NavBadgeButton(
          icon: Icons.notifications_outlined,
          iconSize: 27,
          count: _notifUnread,
          tooltip: 'Notifications',
          onTap: () async {
            await Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const NotificationScreen()),
            );
            _fetchUnreadCounts();
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
        const FollowingScreen(),
        const ExploreScreen(),
        const ReelsScreen(),
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
            delegate: SliverChildBuilderDelegate((context, index) {
              final itemState = _states[index];
              return PostCard(
                state: itemState,
                viewerId: _viewerId,
                useAdsMenuMode: true,
                onLike: () => _onLike(itemState.post.id),
                onSave: () => _onSave(itemState.post.id),
                onRepost: () => _onRepost(itemState),
                onHide: () => _onHide(itemState.post.id),
                onView: () => _onView(itemState.post.id),
                onFollow: _onFollow,
                onAuthorTap: _openUserProfile,
                onHashtagTap: _openHashtag,
                onComment: () => _openPostDetail(itemState),
                onMenuAction: _onPostMenuAction,
              );
            }, childCount: _states.length),
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
    required this.onAds,
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
  final VoidCallback onAds;

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
          _SheetItem(icon: Icons.campaign_outlined, label: 'Ads', onTap: onAds),
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

enum _RepostIntent { quick, quote, cancel }

class _RepostMenuSheet extends StatelessWidget {
  const _RepostMenuSheet({required this.label});
  final String label;

  @override
  Widget build(BuildContext context) {
    final dividerColor = Colors.white.withValues(alpha: 0.08);
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(10, 10, 10, 12),
        child: Container(
          decoration: BoxDecoration(
            color: const Color(0xFF0B1732),
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(height: 12),
              const Text(
                'Repost',
                style: TextStyle(
                  color: Color(0xFFE8ECF8),
                  fontWeight: FontWeight.w700,
                  fontSize: 29 / 2,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                label,
                style: const TextStyle(
                  color: Color(0xFF93A2C5),
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                ),
              ),
              const SizedBox(height: 12),
              Divider(height: 1, color: dividerColor),
              _RepostMenuButton(
                text: 'Repost',
                color: const Color(0xFF3AA6E5),
                onTap: () => Navigator.of(context).pop(_RepostIntent.quick),
              ),
              Divider(height: 1, color: dividerColor),
              _RepostMenuButton(
                text: 'Quote',
                onTap: () => Navigator.of(context).pop(_RepostIntent.quote),
              ),
              Divider(height: 1, color: dividerColor),
              _RepostMenuButton(
                text: 'Cancel',
                onTap: () => Navigator.of(context).pop(_RepostIntent.cancel),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _RepostMenuButton extends StatelessWidget {
  const _RepostMenuButton({
    required this.text,
    required this.onTap,
    this.color,
  });

  final String text;
  final VoidCallback onTap;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      child: TextButton(
        onPressed: onTap,
        style: TextButton.styleFrom(
          padding: const EdgeInsets.symmetric(vertical: 16),
          foregroundColor: color ?? const Color(0xFFE8ECF8),
          shape: const RoundedRectangleBorder(),
        ),
        child: Text(
          text,
          style: TextStyle(
            color: color ?? const Color(0xFFE8ECF8),
            fontSize: 18,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
    );
  }
}

class _QuoteRepostInput {
  const _QuoteRepostInput({
    required this.content,
    required this.visibility,
    required this.allowComments,
    required this.hideLikeCount,
    required this.location,
    required this.hashtags,
  });

  final String content;
  final String visibility;
  final bool allowComments;
  final bool hideLikeCount;
  final String location;
  final List<String> hashtags;
}

class _QuoteComposerSheet extends StatefulWidget {
  const _QuoteComposerSheet({
    required this.label,
    required this.initialAllowDownload,
  });

  final String label;
  final bool initialAllowDownload;

  @override
  State<_QuoteComposerSheet> createState() => _QuoteComposerSheetState();
}

class _QuoteComposerSheetState extends State<_QuoteComposerSheet> {
  final TextEditingController _contentCtrl = TextEditingController();
  final TextEditingController _hashtagsCtrl = TextEditingController();
  final TextEditingController _locationCtrl = TextEditingController();

  bool _allowComments = true;
  bool _hideLikeCount = false;
  String _visibility = 'public';

  @override
  void dispose() {
    _contentCtrl.dispose();
    _hashtagsCtrl.dispose();
    _locationCtrl.dispose();
    super.dispose();
  }

  List<String> _parseHashtags(String raw) {
    final items = raw
        .split(RegExp(r'[,\s]+'))
        .map((e) => e.trim().replaceFirst('#', ''))
        .where((e) => e.isNotEmpty)
        .map((e) => e.toLowerCase())
        .toSet()
        .toList();
    return items;
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;
    return SafeArea(
      top: false,
      child: Padding(
        padding: EdgeInsets.fromLTRB(14, 12, 14, 12 + bottomInset),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Quote repost',
                style: TextStyle(
                  color: Color(0xFFE8ECF8),
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                widget.label,
                style: const TextStyle(color: Color(0xFF93A2C5), fontSize: 12),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _contentCtrl,
                maxLines: 5,
                maxLength: 500,
                style: const TextStyle(color: Color(0xFFE8ECF8)),
                decoration: _sheetInputDecoration('Write your quote...'),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: _hashtagsCtrl,
                style: const TextStyle(color: Color(0xFFE8ECF8)),
                decoration: _sheetInputDecoration('Hashtags (comma separated)'),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: _locationCtrl,
                style: const TextStyle(color: Color(0xFFE8ECF8)),
                decoration: _sheetInputDecoration('Location (optional)'),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                value: _visibility,
                items: const [
                  DropdownMenuItem(value: 'public', child: Text('Public')),
                  DropdownMenuItem(
                    value: 'followers',
                    child: Text('Followers'),
                  ),
                  DropdownMenuItem(value: 'private', child: Text('Private')),
                ],
                dropdownColor: const Color(0xFF111C37),
                iconEnabledColor: const Color(0xFF9BAECF),
                style: const TextStyle(color: Color(0xFFE8ECF8), fontSize: 14),
                decoration: _sheetInputDecoration('Visibility'),
                onChanged: (v) {
                  if (v == null) return;
                  setState(() => _visibility = v);
                },
              ),
              const SizedBox(height: 8),
              SwitchListTile.adaptive(
                value: _allowComments,
                onChanged: (v) => setState(() => _allowComments = v),
                title: const Text(
                  'Allow comments',
                  style: TextStyle(color: Color(0xFFE8ECF8)),
                ),
                contentPadding: EdgeInsets.zero,
                activeColor: const Color(0xFF4AA3E4),
              ),
              SwitchListTile.adaptive(
                value: widget.initialAllowDownload,
                onChanged: null,
                title: const Text(
                  'Allow downloads (inherits original)',
                  style: TextStyle(color: Color(0xFF7A8BB0)),
                ),
                contentPadding: EdgeInsets.zero,
                activeColor: const Color(0xFF4AA3E4),
              ),
              SwitchListTile.adaptive(
                value: _hideLikeCount,
                onChanged: (v) => setState(() => _hideLikeCount = v),
                title: const Text(
                  'Hide like count',
                  style: TextStyle(color: Color(0xFFE8ECF8)),
                ),
                contentPadding: EdgeInsets.zero,
                activeColor: const Color(0xFF4AA3E4),
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => Navigator.of(context).pop(),
                      style: OutlinedButton.styleFrom(
                        side: BorderSide(
                          color: Colors.white.withValues(alpha: 0.18),
                        ),
                        foregroundColor: const Color(0xFFE8ECF8),
                        padding: const EdgeInsets.symmetric(vertical: 13),
                      ),
                      child: const Text('Cancel'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: ElevatedButton(
                      onPressed: () {
                        Navigator.of(context).pop(
                          _QuoteRepostInput(
                            content: _contentCtrl.text.trim(),
                            visibility: _visibility,
                            allowComments: _allowComments,
                            hideLikeCount: _hideLikeCount,
                            location: _locationCtrl.text.trim(),
                            hashtags: _parseHashtags(_hashtagsCtrl.text),
                          ),
                        );
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF4AA3E4),
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 13),
                      ),
                      child: const Text('Share quote'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  InputDecoration _sheetInputDecoration(String hint) {
    return InputDecoration(
      hintText: hint,
      hintStyle: const TextStyle(color: Color(0xFF6F82A8)),
      filled: true,
      fillColor: const Color(0xFF111C37),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: Colors.white.withValues(alpha: 0.08)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: Color(0xFF4AA3E4)),
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
