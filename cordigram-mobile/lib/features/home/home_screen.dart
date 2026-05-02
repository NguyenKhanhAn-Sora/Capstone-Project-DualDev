import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:livekit_client/livekit_client.dart';
import 'package:video_player/video_player.dart';
import '../../core/services/api_service.dart';
import '../../core/services/auth_storage.dart';
import '../../core/services/theme_controller.dart';
import '../ads/ads_campaign_detail_screen.dart';
import '../ads/ads_entry_screen.dart';
import '../ads/ads_service.dart';
import '../auth/login_screen.dart';
import '../explore/explore_screen.dart';
import '../following/following_screen.dart';
import '../hashtag/hashtag_screen.dart';
import '../livestream/livestream_create_service.dart';
import '../livestream/livestream_hub_screen.dart';
import '../messages/call/dm_call_manager.dart';
import '../messages/call/pending_dm_call_storage.dart';
import '../messages/message_home_screen.dart';
import '../messages/services/direct_messages_realtime_service.dart';
import '../notifications/services/notification_realtime_service.dart';
import '../notifications/notification_screen.dart';
import '../post/create_tab_screen.dart';
import '../post/post_detail_screen.dart';
import '../post/utils/post_edit_utils.dart';
import '../post/utils/post_confirm_dialogs.dart';
import '../post/utils/likes_list_sheet.dart';
import '../post/utils/post_mute_overlay.dart';
import '../post/utils/repost_flow_utils.dart';
import '../profile/profile_screen.dart';
import '../profile/services/profile_service.dart';
import '../reels/reels_screen.dart';
import '../search/search_screen.dart';
import '../report/report_problem_screen.dart';
import '../report/report_post_sheet.dart';
import '../settings/settings_screen.dart';
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
  late final AnimationController _topNavAnimController;
  late final Animation<double> _topNavVisibility;
  static const double _kTopNavContentHeight = kToolbarHeight + 44;
  static const double _kNavToggleTriggerDistance = 42;
  static const double _kBackToTopTriggerDistance = 140;
  bool _topNavTargetVisible = true;
  double _scrollTriggerAccumulated = 0;
  int _scrollTriggerDirection = 0;
  DateTime? _lastBackPressedAt;

  // ── Nav badges ────────────────────────────────────────────────────────────
  int _notifUnread = 0;
  int _dmUnread = 0;
  DateTime? _notificationSeenAt;

  // ── Profile ───────────────────────────────────────────────────────────────
  String? _avatarUrl;
  String? _displayName;
  String? _username;

  // ── Polling ────────────────────────────────────────────────────────────────
  Timer? _pollTimer;
  static const Duration _pollInterval = Duration(seconds: 5);
  StreamSubscription<NotificationRealtimeEvent>? _notificationRtSub;
  StreamSubscription<NotificationSeenEvent>? _notificationSeenSub;
  StreamSubscription<NotificationStateEvent>? _notificationStateSub;
  StreamSubscription<NotificationDeletedEvent>? _notificationDeletedSub;
  static const Set<String> _realtimeNotificationTypes = {
    'post_like',
    'post_comment',
    'comment_like',
    'comment_reply',
    'post_mention',
    'follow',
    'login_alert',
    'post_moderation',
    'report',
    'system_notice',
  };
  final Map<String, int> _viewCooldownMap = {};
  static const int _kViewCooldownMs = 300000;
  final Map<String, String> _campaignIdByPromotedPostId = {};
  Timer? _livePollTimer;
  static const Duration _livePollInterval = Duration(seconds: 8);
  List<LivestreamItem> _liveStreams = const [];
  bool _loadingLiveStreams = false;
  final Map<String, _LiveHostSnapshot> _liveHostProfiles = {};

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 5, vsync: this);
    _topNavAnimController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 220),
      value: 1,
    );
    _topNavVisibility = CurvedAnimation(
      parent: _topNavAnimController,
      curve: Curves.easeOutCubic,
      reverseCurve: Curves.easeInCubic,
    );
    _tabController.addListener(_onTabChanged);
    _loadFeed();
    _loadLiveStreams();
    _fetchProfile();
    _fetchUnreadCounts();
    _scrollController.addListener(_onScroll);
    _startPolling();
    _startLivePolling();
    _startNotificationRealtime();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      unawaited(_consumePendingDmCallFromPush());
    });
  }

  Future<void> _consumePendingDmCallFromPush() async {
    final data = await PendingDmCallStorage.take();
    if (data == null || !mounted) return;
    final rawId =
        data['callerUserId'] ??
        data['callerId'] ??
        data['fromUserId'] ??
        data['peerId'];
    final callerId = rawId?.toString().trim() ?? '';
    if (callerId.isEmpty) return;
    final token = AuthStorage.accessToken;
    if (token == null || token.isEmpty) return;
    var video = true;
    final v = data['video'] ?? data['isVideo'] ?? data['callType'];
    if (v != null) {
      final s = v.toString().toLowerCase().trim();
      if (s == 'audio' || s == 'voice' || s == 'false' || s == '0') {
        video = false;
      }
    }
    final name =
        (data['callerName'] ??
                data['callerDisplayName'] ??
                data['displayName'] ??
                '')
            .toString()
            .trim();
    final username =
        (data['callerUsername'] ?? data['username'] ?? '').toString().trim();
    final avatar =
        (data['callerAvatar'] ?? data['avatarUrl'] ?? data['avatar'] ?? '')
            .toString()
            .trim();
    await DirectMessagesRealtimeService.connect();
    if (!mounted) return;
    DmCallManager.instance.presentIncomingHintFromPush(
      callerUserId: callerId,
      displayName: name.isNotEmpty ? name : null,
      username: username.isNotEmpty ? username : null,
      avatarUrl: avatar.isNotEmpty ? avatar : null,
      video: video,
    );
  }

  @override
  void dispose() {
    _tabController.removeListener(_onTabChanged);
    _tabController.dispose();
    _topNavAnimController.dispose();
    _pollTimer?.cancel();
    _livePollTimer?.cancel();
    _notificationRtSub?.cancel();
    _notificationSeenSub?.cancel();
    _notificationStateSub?.cancel();
    _notificationDeletedSub?.cancel();
    NotificationRealtimeService.disconnect();
    _scrollController.dispose();
    super.dispose();
  }

  void _onTabChanged() {
    if (_tabController.indexIsChanging) return;
    _showTopNav();
    _scrollTriggerAccumulated = 0;
    _scrollTriggerDirection = 0;
  }

  Future<void> _goHomeOrScrollTop() async {
    _showTopNav();
    _scrollTriggerAccumulated = 0;
    _scrollTriggerDirection = 0;

    if (_tabController.index != 0) {
      _tabController.animateTo(0);
      return;
    }

    if (!_scrollController.hasClients) return;
    final offset = _scrollController.position.pixels;
    if (offset <= 0) return;

    await _scrollController.animateTo(
      0,
      duration: const Duration(milliseconds: 280),
      curve: Curves.easeOutCubic,
    );
  }

  void _onTopTabTap(int index) {
    if (index == 0) {
      unawaited(_goHomeOrScrollTop());
    }
  }

  void _showTopNav() {
    if (_topNavTargetVisible) return;
    _topNavTargetVisible = true;
    _topNavAnimController.animateTo(1);
  }

  void _hideTopNav() {
    if (!_topNavTargetVisible) return;
    _topNavTargetVisible = false;
    _topNavAnimController.animateTo(0);
  }

  void _handleScrollToggleByThreshold({
    required double delta,
    required ScrollMetrics metrics,
  }) {
    if (metrics.pixels <= 0) {
      _scrollTriggerAccumulated = 0;
      _scrollTriggerDirection = 0;
      _showTopNav();
      return;
    }

    if (delta == 0) return;
    final direction = delta > 0 ? 1 : -1;

    if (_scrollTriggerDirection != direction) {
      _scrollTriggerDirection = direction;
      _scrollTriggerAccumulated = 0;
    }

    _scrollTriggerAccumulated += delta.abs();
    if (_scrollTriggerAccumulated < _kNavToggleTriggerDistance) return;

    if (direction > 0) {
      _hideTopNav();
    } else {
      _showTopNav();
    }

    _scrollTriggerAccumulated = 0;
  }

  bool _onBodyScroll(ScrollNotification notification) {
    if (!mounted) return false;
    if (notification.metrics.axis != Axis.vertical) return false;

    if (notification is ScrollUpdateNotification) {
      final delta = notification.scrollDelta ?? 0;
      _handleScrollToggleByThreshold(
        delta: delta,
        metrics: notification.metrics,
      );
      return false;
    }

    if (notification is OverscrollNotification && notification.overscroll < 0) {
      _showTopNav();
    }

    return false;
  }

  Future<bool> _onWillPop() async {
    final currentTab = _tabController.index;

    // On any non-Home tab: back should return to Home tab first.
    if (currentTab != 0) {
      _tabController.animateTo(0);
      _showTopNav();
      _scrollTriggerAccumulated = 0;
      _scrollTriggerDirection = 0;
      return false;
    }

    // On Home: if user has scrolled down enough, back should scroll to top and refresh.
    if (currentTab == 0 &&
        _scrollController.hasClients &&
        _scrollController.position.pixels > _kBackToTopTriggerDistance) {
      _showTopNav();
      _scrollTriggerAccumulated = 0;
      _scrollTriggerDirection = 0;

      await _scrollController.animateTo(
        0,
        duration: const Duration(milliseconds: 260),
        curve: Curves.easeOutCubic,
      );

      if (mounted) {
        unawaited(_loadFeed(refresh: true));
      }
      return false;
    }

    // On Home root: require double back to exit to avoid accidental app close.
    final now = DateTime.now();
    final canExit =
        _lastBackPressedAt != null &&
        now.difference(_lastBackPressedAt!) <= const Duration(seconds: 2);
    if (canExit) return true;

    _lastBackPressedAt = now;
    if (mounted) {
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(
          const SnackBar(
            content: Text('Nhấn Back lần nữa để thoát ứng dụng'),
            duration: Duration(seconds: 2),
          ),
        );
    }
    return false;
  }

  Future<void> _startNotificationRealtime() async {
    await NotificationRealtimeService.connect();
    _notificationRtSub?.cancel();
    _notificationRtSub = NotificationRealtimeService.events.listen((event) {
      if (!mounted) return;
      if (!_realtimeNotificationTypes.contains(event.notification.type)) {
        return;
      }
      _applyRealtimeNotification(event);
    });

    _notificationSeenSub?.cancel();
    _notificationSeenSub = NotificationRealtimeService.seenEvents.listen((
      event,
    ) {
      if (!mounted) return;
      setState(() {
        _notificationSeenAt = event.lastSeenAt;
        _notifUnread = event.unreadCount;
      });
    });

    _notificationStateSub?.cancel();
    _notificationStateSub = NotificationRealtimeService.stateEvents.listen((
      event,
    ) {
      if (!mounted) return;
      setState(() {
        _notifUnread = event.unreadCount;
      });
    });

    _notificationDeletedSub?.cancel();
    _notificationDeletedSub = NotificationRealtimeService.deletedEvents.listen((
      event,
    ) {
      if (!mounted) return;
      setState(() {
        _notifUnread = event.unreadCount;
      });
    });
  }

  void _applyRealtimeNotification(NotificationRealtimeEvent event) {
    final activityAt =
        DateTime.tryParse(event.notification.activityAt)?.toUtc() ??
        DateTime.tryParse(event.notification.createdAt)?.toUtc();
    final seenAt = _notificationSeenAt;

    setState(() {
      if (seenAt == null) {
        _notifUnread = event.unreadCount > 0
            ? event.unreadCount
            : _notifUnread + 1;
        return;
      }

      final shouldCount = activityAt == null || activityAt.isAfter(seenAt);
      if (shouldCount) {
        _notifUnread += 1;
      }
    });
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

    await _refreshNotificationBadge(token);

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

  Future<void> _refreshNotificationBadge(String token) async {
    try {
      final seenRes = await ApiService.get(
        '/notifications/seen-at',
        extraHeaders: {'Authorization': 'Bearer $token'},
      );

      final rawSeenAt = seenRes['lastSeenAt'] as String?;
      final seenAt = (rawSeenAt == null || rawSeenAt.isEmpty)
          ? null
          : DateTime.tryParse(rawSeenAt)?.toUtc();

      if (seenAt == null) {
        final unreadRes = await ApiService.get(
          '/notifications/unread-count',
          extraHeaders: {'Authorization': 'Bearer $token'},
        );
        if (!mounted) return;
        setState(() {
          _notificationSeenAt = null;
          _notifUnread =
              (unreadRes['unreadCount'] as int?) ??
              (unreadRes['count'] as int?) ??
              0;
        });
        return;
      }

      final res = await ApiService.get(
        '/notifications?limit=50',
        extraHeaders: {'Authorization': 'Bearer $token'},
      );

      final items = res['items'];
      var count = 0;
      if (items is List) {
        for (final raw in items) {
          if (raw is! Map<String, dynamic>) continue;
          final activityAt =
              (raw['activityAt'] as String?) ?? (raw['createdAt'] as String?);
          final activity = activityAt == null
              ? null
              : DateTime.tryParse(activityAt)?.toUtc();
          if (activity != null && activity.isAfter(seenAt)) {
            count += 1;
          }
        }
      }

      if (!mounted) return;
      setState(() {
        _notificationSeenAt = seenAt;
        _notifUnread = count;
      });
    } catch (_) {}
  }

  Future<void> _openNotifications() async {
    final token = AuthStorage.accessToken;
    if (mounted) {
      setState(() {
        _notifUnread = 0;
        _notificationSeenAt = DateTime.now().toUtc();
      });
    }

    if (token != null) {
      try {
        await ApiService.post(
          '/notifications/seen-at',
          extraHeaders: {'Authorization': 'Bearer $token'},
        );
      } catch (_) {}
    }

    if (!mounted) return;
    await Navigator.of(
      context,
    ).push(MaterialPageRoute(builder: (_) => const NotificationScreen()));
    _fetchUnreadCounts();
  }

  // ── Polling ────────────────────────────────────────────────────────

  void _startPolling() {
    _pollTimer?.cancel();
    _pollTimer = Timer.periodic(_pollInterval, (_) {
      _syncStats();
      _fetchUnreadCounts();
    });
  }

  void _startLivePolling() {
    _livePollTimer?.cancel();
    _livePollTimer = Timer.periodic(_livePollInterval, (_) {
      unawaited(_loadLiveStreams(silent: true));
    });
  }

  Future<void> _loadLiveStreams({bool silent = false}) async {
    if (_loadingLiveStreams) return;

    if (!silent && mounted) {
      setState(() => _loadingLiveStreams = true);
    } else {
      _loadingLiveStreams = true;
    }

    try {
      final response = await LivestreamCreateService.listLiveLivestreams();
      final items = response.items.where((item) => item.isLive).toList()
        ..sort((a, b) {
          final aTime = a.startedAt?.millisecondsSinceEpoch ?? 0;
          final bTime = b.startedAt?.millisecondsSinceEpoch ?? 0;
          return bTime.compareTo(aTime);
        });

      if (!mounted) return;
      setState(() {
        _liveStreams = items;
      });
      unawaited(_ensureLiveHostProfiles(items));
    } catch (_) {
      if (!mounted) return;
      if (!silent) {
        setState(() {
          _liveStreams = const [];
          _liveHostProfiles.clear();
        });
      }
    } finally {
      if (mounted) {
        setState(() => _loadingLiveStreams = false);
      } else {
        _loadingLiveStreams = false;
      }
    }
  }

  Future<void> _refreshHome() async {
    await Future.wait([_loadFeed(refresh: true), _loadLiveStreams()]);
  }

  Future<void> _ensureLiveHostProfiles(List<LivestreamItem> streams) async {
    final pendingHostIds = streams.map((item) => item.hostUserId.trim()).where((
      id,
    ) {
      if (id.isEmpty) return false;
      final snapshot = _liveHostProfiles[id];
      return snapshot == null ||
          snapshot.username == null ||
          snapshot.avatarUrl == null;
    }).toSet();
    if (pendingHostIds.isEmpty) return;

    await Future.wait(
      pendingHostIds.map((hostId) async {
        try {
          final profile = await ProfileService.fetchProfile(hostId);
          final username = profile.username.trim();
          final displayName = profile.displayName.trim();
          final avatarUrl = profile.avatarUrl.trim();

          if (!mounted) return;
          setState(() {
            _liveHostProfiles[hostId] = _LiveHostSnapshot(
              username: username.isNotEmpty ? username : null,
              displayName: displayName.isNotEmpty ? displayName : null,
              avatarUrl: avatarUrl.isNotEmpty ? avatarUrl : null,
            );
          });
        } catch (_) {
          // Keep fallback data from livestream list when profile lookup fails.
        }
      }),
    );
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
      case PostMenuAction.muteNotifications:
        final label = post.kind.toLowerCase() == 'reel' ? 'reel' : 'post';
        final muted = await showPostMuteOverlay(
          context,
          postId: post.id,
          kindLabel: label,
        );
        if (muted) {
          _showSnack(
            label == 'reel'
                ? 'Reel notifications muted'
                : 'Post notifications muted',
          );
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
        final confirmed = await showPostConfirmDialog(
          context,
          title: 'Delete post',
          message: 'This action cannot be undone.',
          confirmLabel: 'Delete',
          danger: true,
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
        final confirmed = await showPostConfirmDialog(
          context,
          title: 'Block @$username?',
          message: 'You will no longer see posts from this account.',
          confirmLabel: 'Block',
          danger: true,
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

  Future<void> _endOwnedLivestreamsBeforeLogout() async {
    final token = AuthStorage.accessToken;
    if (token == null) return;

    try {
      var currentUserId = _viewerId;
      if (currentUserId == null || currentUserId.isEmpty) {
        final me = await ApiService.get(
          '/profiles/me',
          extraHeaders: {'Authorization': 'Bearer $token'},
        );
        currentUserId =
            (me['userId'] as String?) ?? (me['id'] as String?) ?? '';
      }
      if (currentUserId.isEmpty) return;

      final liveList = await LivestreamCreateService.listLiveLivestreams();
      final ownedLiveIds = liveList.items
          .where((item) => item.isLive && item.hostUserId == currentUserId)
          .map((item) => item.id)
          .where((id) => id.isNotEmpty)
          .toSet()
          .toList(growable: false);

      if (ownedLiveIds.isEmpty) return;

      await Future.wait(
        ownedLiveIds.map((streamId) async {
          try {
            await LivestreamCreateService.endLivestream(streamId);
          } catch (_) {
            // Best-effort cleanup before logout; continue with logout flow.
          }
        }),
      );
    } catch (_) {
      // Best-effort cleanup before logout; continue with logout flow.
    }
  }

  Future<void> _logout() async {
    _pollTimer?.cancel();
    _livePollTimer?.cancel();
    await _endOwnedLivestreamsBeforeLogout();
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
    // Tear down in-flight call state (active / ringing / outgoing) and
    // reset the call socket so the NEXT account that logs in on this
    // device doesn't inherit stale rings or auto-answer events from the
    // previous session.
    try {
      await DmCallManager.instance.onAuthChanged();
    } catch (_) {}
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

  Future<void> _openLivestreamFromHome(LivestreamItem stream) async {
    final isHost = _viewerId != null && stream.hostUserId == _viewerId;
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) =>
            LivestreamHubScreen(initialStreamId: stream.id, forceHost: isHost),
      ),
    );
    if (!mounted) return;
    unawaited(_loadLiveStreams(silent: true));
  }

  String _formatCompactCount(int value) {
    if (value >= 1000000) {
      final r = value / 1000000;
      return '${r.toStringAsFixed(r.truncateToDouble() == r ? 0 : 1)}M';
    }
    if (value >= 1000) {
      final r = value / 1000;
      return '${r.toStringAsFixed(r.truncateToDouble() == r ? 0 : 1)}K';
    }
    return '$value';
  }

  String _formatLiveStartedAgo(DateTime? startedAt) {
    if (startedAt == null) return 'just now';

    final diff = DateTime.now().difference(startedAt);
    if (diff.inMinutes < 1) return 'just now';
    if (diff.inHours < 1) {
      final m = diff.inMinutes;
      return '$m minute${m == 1 ? '' : 's'} ago';
    }
    if (diff.inDays < 1) {
      final h = diff.inHours;
      return '$h hour${h == 1 ? '' : 's'} ago';
    }
    final d = diff.inDays;
    return '$d day${d == 1 ? '' : 's'} ago';
  }

  Widget _buildLiveNowSection() {
    if (_liveStreams.isEmpty && !_loadingLiveStreams) {
      return const SizedBox.shrink();
    }

    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Padding(
            padding: EdgeInsets.only(left: 2, bottom: 10),
            child: Text(
              'Live now',
              style: TextStyle(
                color: Colors.white,
                fontSize: 16,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          if (_loadingLiveStreams && _liveStreams.isEmpty)
            Container(
              height: 110,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: const Color(0xFF131929),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
              ),
              child: const CircularProgressIndicator(
                strokeWidth: 2,
                color: Color(0xFF4AA3E4),
              ),
            )
          else
            Column(
              children: _liveStreams.map((stream) {
                final hostSnapshot = _liveHostProfiles[stream.hostUserId];
                final hostUsername =
                    hostSnapshot?.username?.trim() ??
                    stream.hostUsername?.trim();
                final hostAvatarUrl =
                    hostSnapshot?.avatarUrl ?? stream.hostAvatarUrl;
                final hostLabel =
                    (hostUsername != null && hostUsername.isNotEmpty)
                    ? '@$hostUsername'
                    : '@unknown';
                final avatarSeed = (hostUsername ?? stream.hostName).trim();
                final initial = avatarSeed.isNotEmpty
                    ? avatarSeed[0].toUpperCase()
                    : '?';
                final viewerCount = (stream.viewerCount - 1)
                    .clamp(0, 9999999)
                    .toInt();

                return Container(
                  key: ValueKey('live-${stream.id}'),
                  margin: const EdgeInsets.only(bottom: 12),
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(
                      color: Colors.white.withValues(alpha: 0.1),
                    ),
                    gradient: const LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [Color(0xFF162238), Color(0xFF101A2E)],
                    ),
                    boxShadow: const [
                      BoxShadow(
                        color: Color(0x33000000),
                        blurRadius: 18,
                        offset: Offset(0, 8),
                      ),
                    ],
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          hostAvatarUrl != null
                              ? CircleAvatar(
                                  radius: 19,
                                  backgroundImage: NetworkImage(hostAvatarUrl),
                                )
                              : Container(
                                  width: 38,
                                  height: 38,
                                  alignment: Alignment.center,
                                  decoration: const BoxDecoration(
                                    shape: BoxShape.circle,
                                    gradient: LinearGradient(
                                      colors: [
                                        Color(0xFF0EA5E9),
                                        Color(0xFFF43F5E),
                                      ],
                                    ),
                                  ),
                                  child: Text(
                                    initial,
                                    style: const TextStyle(
                                      color: Colors.white,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  hostLabel,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  'Went live ${_formatLiveStartedAgo(stream.startedAt)}',
                                  style: TextStyle(
                                    color: Colors.white.withValues(alpha: 0.65),
                                    fontSize: 12,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      InkWell(
                        borderRadius: BorderRadius.circular(12),
                        onTap: () => _openLivestreamFromHome(stream),
                        child: AspectRatio(
                          aspectRatio: 16 / 9,
                          child: Container(
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(12),
                              gradient: const LinearGradient(
                                begin: Alignment.topLeft,
                                end: Alignment.bottomRight,
                                colors: [Color(0xFF102243), Color(0xFF0B132A)],
                              ),
                            ),
                            child: Stack(
                              children: [
                                Positioned.fill(
                                  child: _LiveFeedPreview(
                                    streamId: stream.id,
                                    playbackUrl: stream.ivsPlaybackUrl,
                                  ),
                                ),
                                Positioned.fill(
                                  child: DecoratedBox(
                                    decoration: BoxDecoration(
                                      borderRadius: BorderRadius.circular(12),
                                      gradient: LinearGradient(
                                        begin: Alignment.topCenter,
                                        end: Alignment.bottomCenter,
                                        colors: [
                                          Colors.transparent,
                                          Colors.black.withValues(alpha: 0.65),
                                        ],
                                      ),
                                    ),
                                  ),
                                ),
                                Positioned(
                                  top: 10,
                                  left: 10,
                                  child: Container(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 8,
                                      vertical: 4,
                                    ),
                                    decoration: BoxDecoration(
                                      color: Colors.red.shade600,
                                      borderRadius: BorderRadius.circular(999),
                                    ),
                                    child: const Text(
                                      'LIVE',
                                      style: TextStyle(
                                        color: Colors.white,
                                        fontSize: 11,
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                  ),
                                ),
                                Positioned(
                                  left: 10,
                                  right: 10,
                                  bottom: 10,
                                  child: Row(
                                    children: [
                                      Expanded(
                                        child: Text(
                                          stream.title,
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                          style: const TextStyle(
                                            color: Colors.white,
                                            fontWeight: FontWeight.w700,
                                            fontSize: 14,
                                          ),
                                        ),
                                      ),
                                      const SizedBox(width: 8),
                                      const Icon(
                                        Icons.visibility_outlined,
                                        color: Colors.white,
                                        size: 16,
                                      ),
                                      const SizedBox(width: 4),
                                      Text(
                                        _formatCompactCount(viewerCount),
                                        style: const TextStyle(
                                          color: Colors.white,
                                          fontWeight: FontWeight.w600,
                                          fontSize: 12,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                );
              }).toList(),
            ),
        ],
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
    final topInset = MediaQuery.paddingOf(context).top;
    final fullTopNavHeight = topInset + _kTopNavContentHeight;
    final feedBody = NotificationListener<ScrollNotification>(
      onNotification: _onBodyScroll,
      child: _buildBody(),
    );
    final topNav = SizedBox(height: fullTopNavHeight, child: _buildAppBar());

    return WillPopScope(
      onWillPop: _onWillPop,
      child: Scaffold(
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
        body: AnimatedBuilder(
          animation: _topNavVisibility,
          builder: (context, _) {
            final value = _topNavVisibility.value;
            final hiddenDistance = (1 - value) * fullTopNavHeight;

            return Stack(
              children: [
                Positioned.fill(
                  child: Padding(
                    padding: EdgeInsets.only(top: fullTopNavHeight * value),
                    child: feedBody,
                  ),
                ),
                Positioned(
                  top: 0,
                  left: 0,
                  right: 0,
                  height: fullTopNavHeight,
                  child: IgnorePointer(
                    ignoring: value < 0.05,
                    child: ClipRect(
                      child: Transform.translate(
                        offset: Offset(0, -hiddenDistance),
                        child: topNav,
                      ),
                    ),
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }

  // ── Profile menu ──────────────────────────────────────────────────────────

  void _showProfileMenu() {
    final scheme = Theme.of(context).colorScheme;
    final letter = (_displayName ?? _username ?? 'U')
        .trim()
        .substring(0, 1)
        .toUpperCase();
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: scheme.surface,
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
        onSettings: () {
          Navigator.pop(ctx);
          Navigator.of(
            context,
          ).push(MaterialPageRoute(builder: (_) => const SettingsScreen()));
        },
        onSaved: () {
          Navigator.pop(ctx);
          if (_viewerId != null) {
            Navigator.of(context).push(
              MaterialPageRoute(
                builder: (_) =>
                    ProfileScreen(userId: _viewerId!, initialTabKey: 'saved'),
              ),
            );
          } else {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Text('Unable to open saved items right now'),
              ),
            );
          }
        },
        onToggleTheme: () {
          Navigator.pop(ctx);
          ThemeController.instance.toggle();
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
    final scheme = Theme.of(context).colorScheme;
    final letter = (_displayName ?? _username ?? 'U')
        .trim()
        .substring(0, 1)
        .toUpperCase();

    return AppBar(
      backgroundColor: scheme.surface,
      elevation: 0,
      scrolledUnderElevation: 0,
      surfaceTintColor: Colors.transparent,
      centerTitle: false,
      titleSpacing: 14,
      title: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: () => unawaited(_goHomeOrScrollTop()),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Image(
              image: AssetImage('assets/images/cordigram-logo.png'),
              width: 32,
              height: 32,
            ),
            const SizedBox(width: 8),
            Text(
              'CORDIGRAM',
              style: TextStyle(
                color: scheme.onSurface,
                fontWeight: FontWeight.w800,
                fontSize: 17,
                letterSpacing: 1.2,
              ),
            ),
          ],
        ),
      ),
      actions: [
        // Search
        IconButton(
          icon: Icon(
            Icons.search_rounded,
            color: scheme.onSurfaceVariant,
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
          onTap: _openNotifications,
        ),
        // Direct messages with badge
        _NavBadgeButton(
          icon: Icons.chat_bubble_outline_rounded,
          iconSize: 27,
          count: _dmUnread,
          tooltip: 'Messages',
          onTap: () => Navigator.of(
            context,
          ).push(MaterialPageRoute(builder: (_) => const MessageHomeScreen())),
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
                    backgroundColor: scheme.surfaceContainerHighest,
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
          color: scheme.surface,
          child: TabBar(
            controller: _tabController,
            onTap: _onTopTabTap,
            isScrollable: false,
            labelColor: scheme.onSurface,
            unselectedLabelColor: scheme.onSurfaceVariant,
            labelStyle: const TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w600,
            ),
            unselectedLabelStyle: const TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w400,
            ),
            labelPadding: const EdgeInsets.symmetric(horizontal: 4),
            indicatorColor: scheme.primary,
            indicatorWeight: 2.5,
            dividerColor: scheme.outline.withValues(alpha: 0.4),
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
      if (_liveStreams.isNotEmpty || _loadingLiveStreams) {
        return RefreshIndicator(
          color: const Color(0xFF4AA3E4),
          backgroundColor: const Color(0xFF131929),
          onRefresh: _refreshHome,
          child: CustomScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            slivers: [
              SliverToBoxAdapter(
                child: PeopleYouMayKnow(onOpenProfile: _openUserProfile),
              ),
              SliverToBoxAdapter(child: _buildLiveNowSection()),
              const SliverToBoxAdapter(child: SizedBox(height: 24)),
            ],
          ),
        );
      }
      return _EmptyState(onRefresh: () => _loadFeed(refresh: true));
    }

    final hasLiveSection = _liveStreams.isNotEmpty || _loadingLiveStreams;
    final liveInsertIndex = _states.isEmpty
        ? 0
        : (_states.length < 4 ? _states.length : 4);
    final sliverItemCount = _states.length + (hasLiveSection ? 1 : 0);

    return RefreshIndicator(
      color: const Color(0xFF4AA3E4),
      backgroundColor: const Color(0xFF131929),
      onRefresh: _refreshHome,
      child: CustomScrollView(
        controller: _scrollController,
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          // People you may know strip
          SliverToBoxAdapter(
            child: PeopleYouMayKnow(onOpenProfile: _openUserProfile),
          ),
          // Feed items
          SliverList(
            delegate: SliverChildBuilderDelegate((context, index) {
              if (hasLiveSection && index == liveInsertIndex) {
                return _buildLiveNowSection();
              }

              final postIndex = hasLiveSection && index > liveInsertIndex
                  ? index - 1
                  : index;
              final itemState = _states[postIndex];
              return PostCard(
                state: itemState,
                viewerId: _viewerId,
                useAdsMenuMode: true,
                onLike: () => _onLike(itemState.post.id),
                onLikeLongPress: () => showPostLikesSheet(
                  context,
                  postId: itemState.post.id,
                  viewerId: _viewerId,
                ),
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
            }, childCount: sliverItemCount),
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

class _LiveHostSnapshot {
  const _LiveHostSnapshot({this.username, this.displayName, this.avatarUrl});

  final String? username;
  final String? displayName;
  final String? avatarUrl;
}

class _LivePreviewPlayer extends StatefulWidget {
  const _LivePreviewPlayer({required this.playbackUrl});

  final String? playbackUrl;

  @override
  State<_LivePreviewPlayer> createState() => _LivePreviewPlayerState();
}

class _LivePreviewPlayerState extends State<_LivePreviewPlayer> {
  VideoPlayerController? _controller;
  bool _ready = false;

  @override
  void initState() {
    super.initState();
    _setup();
  }

  @override
  void didUpdateWidget(covariant _LivePreviewPlayer oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.playbackUrl != widget.playbackUrl) {
      _setup();
    }
  }

  Future<void> _setup() async {
    final old = _controller;
    _controller = null;
    _ready = false;
    if (mounted) setState(() {});
    await old?.dispose();

    final url = widget.playbackUrl?.trim();
    if (url == null || url.isEmpty) return;

    final uri = Uri.tryParse(url);
    if (uri == null || !(uri.isScheme('http') || uri.isScheme('https'))) {
      return;
    }

    try {
      final controller = VideoPlayerController.networkUrl(uri);
      await controller.initialize();
      await controller.setVolume(0);
      await controller.setLooping(true);
      await controller.play();

      if (!mounted) {
        await controller.dispose();
        return;
      }

      setState(() {
        _controller = controller;
        _ready = true;
      });
    } catch (_) {
      // Keep fallback background when preview stream is unavailable.
    }
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final controller = _controller;
    if (!_ready || controller == null || !controller.value.isInitialized) {
      return const DecoratedBox(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFF102243), Color(0xFF0B132A)],
          ),
        ),
      );
    }

    return ColoredBox(
      color: Colors.black,
      child: FittedBox(
        fit: BoxFit.contain,
        child: SizedBox(
          width: controller.value.size.width,
          height: controller.value.size.height,
          child: VideoPlayer(controller),
        ),
      ),
    );
  }
}

class _LiveFeedPreview extends StatelessWidget {
  const _LiveFeedPreview({required this.streamId, required this.playbackUrl});

  final String streamId;
  final String? playbackUrl;

  @override
  Widget build(BuildContext context) {
    final url = playbackUrl?.trim();
    if (url != null && url.isNotEmpty) {
      return _LivePreviewPlayer(playbackUrl: url);
    }
    return _LiveTrackPreview(streamId: streamId);
  }
}

class _LiveTrackPreview extends StatefulWidget {
  const _LiveTrackPreview({required this.streamId});

  final String streamId;

  @override
  State<_LiveTrackPreview> createState() => _LiveTrackPreviewState();
}

class _LiveTrackPreviewState extends State<_LiveTrackPreview> {
  Room? _room;
  EventsListener<RoomEvent>? _listener;
  VideoTrack? _track;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    unawaited(_connect());
  }

  @override
  void didUpdateWidget(covariant _LiveTrackPreview oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.streamId != widget.streamId) {
      unawaited(_disposeRoom());
      unawaited(_connect());
    }
  }

  @override
  void dispose() {
    unawaited(_disposeRoom());
    super.dispose();
  }

  Future<void> _connect() async {
    setState(() {
      _loading = true;
      _track = null;
    });

    try {
      final join = await LivestreamCreateService.joinLivestreamToken(
        widget.streamId,
        asHost: false,
        participantName:
            'home-preview-${DateTime.now().microsecondsSinceEpoch}',
      );

      final room = Room();
      final listener = room.createListener();
      listener
        ..on<ParticipantEvent>((_) => _pickTrack())
        ..on<RoomDisconnectedEvent>((_) {
          if (!mounted) return;
          setState(() {
            _track = null;
          });
        });
      room.addListener(_pickTrack);

      await room.connect(join.url, join.token);

      if (!mounted) {
        await listener.dispose();
        await room.dispose();
        return;
      }

      setState(() {
        _room = room;
        _listener = listener;
        _loading = false;
      });
      _pickTrack();
    } catch (_) {
      if (!mounted) return;
      setState(() => _loading = false);
    }
  }

  Future<void> _disposeRoom() async {
    final room = _room;
    final listener = _listener;
    _room = null;
    _listener = null;
    _track = null;

    if (room != null) {
      room.removeListener(_pickTrack);
    }

    if (listener != null) {
      await listener.dispose();
    }

    if (room != null) {
      try {
        await room.disconnect();
      } catch (_) {}
      await room.dispose();
    }
  }

  void _pickTrack() {
    final room = _room;
    if (room == null) return;

    VideoTrack? selected;
    RemoteParticipant? host;
    for (final participant in room.remoteParticipants.values) {
      if (participant.identity.contains('-host-')) {
        host = participant;
        break;
      }
    }

    if (host != null) {
      for (final pub in host.videoTrackPublications) {
        if (!pub.isScreenShare) continue;
        final track = pub.track;
        if (track is VideoTrack) {
          selected = track;
          break;
        }
      }
      if (selected == null) {
        for (final pub in host.videoTrackPublications) {
          final track = pub.track;
          if (track is VideoTrack) {
            selected = track;
            break;
          }
        }
      }
    }

    if (selected == null) {
      for (final participant in room.remoteParticipants.values) {
        for (final pub in participant.videoTrackPublications) {
          final track = pub.track;
          if (track is VideoTrack) {
            selected = track;
            break;
          }
        }
        if (selected != null) break;
      }
    }

    if (!mounted) return;
    setState(() => _track = selected);
  }

  @override
  Widget build(BuildContext context) {
    if (_track != null) {
      return VideoTrackRenderer(_track!, fit: VideoViewFit.contain);
    }
    if (_loading) {
      return const Center(
        child: SizedBox(
          width: 20,
          height: 20,
          child: CircularProgressIndicator(
            strokeWidth: 2,
            color: Color(0xFF4AA3E4),
          ),
        ),
      );
    }
    return const SizedBox.shrink();
  }
}

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
    final scheme = Theme.of(context).colorScheme;
    return IconButton(
      tooltip: tooltip,
      onPressed: onTap,
      icon: Stack(
        clipBehavior: Clip.none,
        children: [
          Icon(icon, color: scheme.onSurfaceVariant, size: iconSize),
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
    required this.onSaved,
    required this.onToggleTheme,
    required this.onSettings,
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
  final VoidCallback onSaved;
  final VoidCallback onToggleTheme;
  final VoidCallback onSettings;
  final VoidCallback onAds;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    return SafeArea(
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Handle bar
            Container(
              width: 36,
              height: 4,
              margin: const EdgeInsets.only(top: 10, bottom: 16),
              decoration: BoxDecoration(
                color: scheme.onSurfaceVariant.withValues(alpha: 0.35),
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
                          backgroundColor: scheme.surfaceContainerHighest,
                        )
                      : CircleAvatar(
                          radius: 24,
                          backgroundColor: scheme.primary,
                          child: Text(
                            avatarLetter,
                            style: TextStyle(
                              color: scheme.onPrimary,
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
                          style: TextStyle(
                            color: scheme.onSurface,
                            fontSize: 15,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      if (username != null)
                        Text(
                          username!,
                          style: TextStyle(
                            color: scheme.onSurfaceVariant,
                            fontSize: 13,
                          ),
                        ),
                    ],
                  ),
                ],
              ),
            ),
            Divider(color: scheme.outline, height: 1),
            _SheetItem(
              icon: Icons.person_outline_rounded,
              label: 'Profile',
              onTap: onProfile,
            ),
            _SheetItem(
              icon: Icons.settings_outlined,
              label: 'Settings',
              onTap: onSettings,
            ),
            _SheetItem(
              icon: Icons.bookmark_border_rounded,
              label: 'Saved',
              onTap: onSaved,
            ),
            AnimatedBuilder(
              animation: ThemeController.instance,
              builder: (_, __) {
                final isDark = ThemeController.instance.isDarkMode;
                return _SheetItem(
                  icon: isDark
                      ? Icons.light_mode_outlined
                      : Icons.dark_mode_outlined,
                  label: isDark
                      ? 'Switch to light mode'
                      : 'Switch to dark mode',
                  onTap: onToggleTheme,
                );
              },
            ),
            _SheetItem(
              icon: Icons.campaign_outlined,
              label: 'Ads',
              onTap: onAds,
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
    final scheme = Theme.of(context).colorScheme;
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
        child: Row(
          children: [
            Icon(icon, color: iconColor ?? scheme.onSurfaceVariant, size: 22),
            const SizedBox(width: 16),
            Text(
              label,
              style: TextStyle(
                color: labelColor ?? scheme.onSurface,
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
