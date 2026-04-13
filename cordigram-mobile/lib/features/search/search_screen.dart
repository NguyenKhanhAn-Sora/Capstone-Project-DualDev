import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/services/auth_storage.dart';
import '../hashtag/hashtag_screen.dart';
import '../hashtag/services/hashtag_feed_service.dart';
import '../home/models/feed_post.dart';
import '../home/services/post_interaction_service.dart';
import '../home/widgets/post_card.dart' show PostCard, PostMenuAction;
import '../post/post_detail_screen.dart';
import '../post/utils/post_edit_utils.dart';
import '../post/utils/post_mute_overlay.dart';
import '../post/utils/repost_flow_utils.dart';
import '../profile/profile_screen.dart';
import '../reels/reels_screen.dart';
import '../report/report_post_sheet.dart';
import 'services/search_service.dart';

enum _SearchTab { all, people, hashtags, reels, posts }

class SearchScreen extends StatefulWidget {
  const SearchScreen({super.key});

  @override
  State<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends State<SearchScreen> {
  final TextEditingController _searchController = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  Timer? _debounce;

  _SearchTab _activeTab = _SearchTab.all;
  String _query = '';

  bool _loading = false;
  String? _error;

  List<SearchHistoryItem> _history = [];

  List<ProfileSearchItem> _people = [];
  List<HashtagSearchItem> _hashtagSuggest = [];
  List<HashtagSearchItem> _hashtags = [];
  int _hashtagsPage = 1;
  bool _hashtagsHasMore = false;

  final List<FeedPostState> _posts = [];
  int _postsPage = 1;
  bool _postsHasMore = false;

  List<FeedPost> _reels = [];
  int _reelsPage = 1;
  bool _reelsHasMore = false;

  List<FeedPostState> _allPreviewPosts = [];
  List<FeedPost> _allPreviewReels = [];

  static const int _kAllPreviewPostsLimit = 5;
  static const int _kAllPreviewReelsLimit = 6;

  final Map<String, int> _viewCooldownMap = <String, int>{};
  static const int _kViewCooldownMs = 300000;

  @override
  void initState() {
    super.initState();
    _loadHistory();
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _searchController.dispose();
    _scrollController.dispose();
    super.dispose();
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

  void _onScroll() {
    if (_query.isEmpty || _loading) return;
    if (_scrollController.position.pixels <
        _scrollController.position.maxScrollExtent - 220) {
      return;
    }

    if (_activeTab == _SearchTab.hashtags && _hashtagsHasMore) {
      _loadHashtagsMore();
    }
    if (_activeTab == _SearchTab.reels && _reelsHasMore) {
      _loadReelsMore();
    }
    if (_activeTab == _SearchTab.posts && _postsHasMore) {
      _loadPostsMore();
    }
  }

  Future<void> _loadHistory() async {
    try {
      final items = await SearchService.fetchHistory();
      if (!mounted) return;
      setState(() {
        _history = items;
      });
    } catch (_) {}
  }

  Future<void> _clearHistory() async {
    try {
      await SearchService.clearHistory();
      if (!mounted) return;
      setState(() => _history = []);
    } catch (_) {
      _showSnack('Unable to clear history', error: true);
    }
  }

  Future<void> _deleteHistoryItem(String id) async {
    try {
      await SearchService.deleteHistoryItem(id);
      if (!mounted) return;
      setState(() => _history.removeWhere((h) => h.id == id));
    } catch (_) {
      _showSnack('Unable to remove history item', error: true);
    }
  }

  void _onQueryChanged(String value) {
    _debounce?.cancel();
    setState(() {
      _query = value.trim();
      _error = null;
      if (_query.isEmpty) {
        _allPreviewPosts = [];
        _allPreviewReels = [];
      }
    });

    if (_query.isEmpty) {
      return;
    }

    _debounce = Timer(const Duration(milliseconds: 280), _runSearchInitial);
  }

  Future<void> _runSearchInitial() async {
    final q = _query;
    if (q.isEmpty) return;

    setState(() {
      _loading = true;
      _error = null;
      _hashtagsPage = 1;
      _postsPage = 1;
      _reelsPage = 1;
      _hashtags = [];
      _posts.clear();
      _reels = [];
      _allPreviewPosts = [];
      _allPreviewReels = [];
    });

    try {
      final peopleF = SearchService.searchProfiles(query: q, limit: 50);
      final suggestF = SearchService.suggestHashtags(query: q, limit: 10);
      final hashtagsF = SearchService.searchHashtags(
        query: q,
        limit: 20,
        page: 1,
      );
      final postsF = SearchService.searchPosts(
        query: q,
        kinds: const ['post'],
        limit: 20,
        page: 1,
      );
      final reelsF = SearchService.searchPosts(
        query: q,
        kinds: const ['reel'],
        limit: 24,
        page: 1,
      );

      final results = await Future.wait<dynamic>([
        peopleF,
        suggestF,
        hashtagsF,
        postsF,
        reelsF,
      ]);

      if (!mounted || q != _query) return;

      final people = results[0] as List<ProfileSearchItem>;
      final hashtagSuggest = results[1] as List<HashtagSearchItem>;
      final hashtagSearch =
          results[2] as ({List<HashtagSearchItem> items, bool hasMore});
      final postsPage = results[3] as SearchPostsPage;
      final reelsPage = results[4] as SearchPostsPage;
      final filteredInitialPosts = postsPage.items
          .where((p) => !isAdLikeFeedPost(p))
          .toList(growable: false);
      final filteredInitialReels = reelsPage.items
          .where((r) => !isAdLikeFeedPost(r))
          .toList(growable: false);

      setState(() {
        _people = people;
        _hashtagSuggest = hashtagSuggest;
        _hashtags = hashtagSearch.items;
        _hashtagsHasMore = hashtagSearch.hasMore;

        _posts
          ..clear()
          ..addAll(filteredInitialPosts.map((p) => FeedPostState(post: p)));
        _postsHasMore = postsPage.hasMore;

        _reels = filteredInitialReels;
        _reelsHasMore = reelsPage.hasMore;

        _allPreviewPosts = _posts
            .take(_kAllPreviewPostsLimit)
            .toList(growable: false);
        _allPreviewReels = _reels
            .take(_kAllPreviewReelsLimit)
            .toList(growable: false);
      });

      _loadRelatedHashtagPreview(
        query: q,
        hashtagSuggest: hashtagSuggest,
        hashtagSearch: hashtagSearch.items,
      );
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = 'Search failed';
      });
    } finally {
      if (!mounted) return;
      setState(() => _loading = false);
    }
  }

  String _normalizeSearchToken(String input) {
    return input.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]'), '');
  }

  bool _isSimilarHashtag(String query, String tag) {
    final q = _normalizeSearchToken(query);
    final t = _normalizeSearchToken(tag);
    if (q.isEmpty || t.isEmpty) return false;
    if (t.contains(q) || q.contains(t)) return true;

    final words = query
        .toLowerCase()
        .split(RegExp(r'\s+'))
        .map(_normalizeSearchToken)
        .where((w) => w.length >= 3);
    return words.any(t.contains);
  }

  List<String> _collectRelatedHashtags({
    required String query,
    required List<HashtagSearchItem> hashtagSuggest,
    required List<HashtagSearchItem> hashtagSearch,
  }) {
    final q = query.replaceAll('#', '').trim().toLowerCase();
    if (q.isEmpty) return const [];

    final ordered = <String>[];
    final seen = <String>{};

    void addTag(String tag) {
      final t = tag.replaceAll('#', '').trim().toLowerCase();
      if (t.isEmpty || seen.contains(t)) return;
      seen.add(t);
      ordered.add(t);
    }

    addTag(q);
    for (final item in [...hashtagSuggest, ...hashtagSearch]) {
      if (_isSimilarHashtag(q, item.name)) {
        addTag(item.name);
      }
      if (ordered.length >= 4) break;
    }
    return ordered;
  }

  Future<void> _loadRelatedHashtagPreview({
    required String query,
    required List<HashtagSearchItem> hashtagSuggest,
    required List<HashtagSearchItem> hashtagSearch,
  }) async {
    if (_posts.length >= _kAllPreviewPostsLimit &&
        _reels.length >= _kAllPreviewReelsLimit) {
      return;
    }

    final tags = _collectRelatedHashtags(
      query: query,
      hashtagSuggest: hashtagSuggest,
      hashtagSearch: hashtagSearch,
    );
    if (tags.isEmpty) return;

    try {
      final bundles = await Future.wait(
        tags.map((tag) => HashtagFeedService.fetchByTag(tag: tag, page: 1)),
      );
      if (!mounted || _query != query) return;

      final postSeen = _posts.map((s) => s.post.id).toSet();
      final reelSeen = _reels.map((r) => r.id).toSet();

      final mergedPosts = List<FeedPostState>.from(_posts);
      final mergedReels = List<FeedPost>.from(_reels);

      for (final bundle in bundles) {
        for (final post in bundle.posts) {
          if (isAdLikeFeedPost(post)) continue;
          if (postSeen.add(post.id)) {
            mergedPosts.add(FeedPostState(post: post));
          }
        }
        for (final reel in bundle.reels) {
          if (isAdLikeFeedPost(reel)) continue;
          if (reelSeen.add(reel.id)) {
            mergedReels.add(reel);
          }
        }
      }

      if (!mounted || _query != query) return;
      setState(() {
        _allPreviewPosts = mergedPosts
            .take(_kAllPreviewPostsLimit)
            .toList(growable: false);
        _allPreviewReels = mergedReels
            .take(_kAllPreviewReelsLimit)
            .toList(growable: false);
      });
    } catch (_) {
      // Keep base search results if related hashtag fetch fails.
    }
  }

  Future<void> _loadHashtagsMore() async {
    if (_loading || !_hashtagsHasMore || _query.isEmpty) return;
    setState(() => _loading = true);
    try {
      final nextPage = _hashtagsPage + 1;
      final res = await SearchService.searchHashtags(
        query: _query,
        limit: 20,
        page: nextPage,
      );
      if (!mounted) return;
      setState(() {
        _hashtagsPage = nextPage;
        _hashtags.addAll(res.items);
        _hashtagsHasMore = res.hasMore;
      });
    } catch (_) {
      _showSnack('Unable to load more hashtags', error: true);
    } finally {
      if (!mounted) return;
      setState(() => _loading = false);
    }
  }

  Future<void> _loadPostsMore() async {
    if (_loading || !_postsHasMore || _query.isEmpty) return;
    setState(() => _loading = true);
    try {
      final nextPage = _postsPage + 1;
      final res = await SearchService.searchPosts(
        query: _query,
        kinds: const ['post'],
        limit: 20,
        page: nextPage,
      );
      final filteredPosts = res.items.where((p) => !isAdLikeFeedPost(p));
      if (!mounted) return;
      setState(() {
        _postsPage = nextPage;
        _posts.addAll(filteredPosts.map((p) => FeedPostState(post: p)));
        _postsHasMore = res.hasMore;
      });
    } catch (_) {
      _showSnack('Unable to load more posts', error: true);
    } finally {
      if (!mounted) return;
      setState(() => _loading = false);
    }
  }

  Future<void> _loadReelsMore() async {
    if (_loading || !_reelsHasMore || _query.isEmpty) return;
    setState(() => _loading = true);
    try {
      final nextPage = _reelsPage + 1;
      final res = await SearchService.searchPosts(
        query: _query,
        kinds: const ['reel'],
        limit: 24,
        page: nextPage,
      );
      final filteredReels = res.items
          .where((r) => !isAdLikeFeedPost(r))
          .toList(growable: false);
      if (!mounted) return;
      setState(() {
        _reelsPage = nextPage;
        _reels = [..._reels, ...filteredReels];
        _reelsHasMore = res.hasMore;
      });
    } catch (_) {
      _showSnack('Unable to load more reels', error: true);
    } finally {
      if (!mounted) return;
      setState(() => _loading = false);
    }
  }

  Future<void> _addQueryHistory() async {
    final q = _query.trim();
    if (q.isEmpty) return;
    try {
      await SearchService.addHistoryQuery(q);
    } catch (_) {}
  }

  void _openProfile(ProfileSearchItem profile) {
    SearchService.addHistoryProfile(profile).catchError((_) {});
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => ProfileScreen(userId: profile.userId)),
    );
  }

  void _openHashtag(String tag) {
    final normalized = tag.replaceAll('#', '').trim().toLowerCase();
    if (normalized.isEmpty) return;
    SearchService.addHistoryHashtag(normalized).catchError((_) {});
    Navigator.of(
      context,
    ).push(MaterialPageRoute(builder: (_) => HashtagScreen(tag: normalized)));
  }

  void _openPost(FeedPostState state) {
    SearchService.addHistoryPost(
      kind: 'post',
      post: state.post,
    ).catchError((_) {});
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) =>
            PostDetailScreen(postId: state.post.id, initialState: state),
      ),
    );
  }

  void _openReel(FeedPost reel) {
    SearchService.addHistoryPost(kind: 'reel', post: reel).catchError((_) {});
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => ReelsScreen(scope: 'all', initialReelId: reel.id),
      ),
    );
  }

  void _openHistory(SearchHistoryItem item) {
    switch (item.kind) {
      case SearchHistoryKind.profile:
        final userId = item.refId;
        if (userId.isEmpty) return;
        Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => ProfileScreen(userId: userId)),
        );
        return;
      case SearchHistoryKind.hashtag:
        final tag = item.refSlug.isNotEmpty
            ? item.refSlug
            : item.label.replaceAll('#', '');
        if (tag.isEmpty) return;
        Navigator.of(
          context,
        ).push(MaterialPageRoute(builder: (_) => HashtagScreen(tag: tag)));
        return;
      case SearchHistoryKind.post:
        if (item.refId.isEmpty) return;
        Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => PostDetailScreen(postId: item.refId),
          ),
        );
        return;
      case SearchHistoryKind.reel:
        if (item.refId.isEmpty) return;
        Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) =>
                ReelsScreen(scope: 'all', initialReelId: item.refId),
          ),
        );
        return;
      case SearchHistoryKind.query:
        final q = item.label.trim();
        if (q.isEmpty) return;
        _searchController.text = q;
        _onQueryChanged(q);
        return;
    }
  }

  Future<void> _onLike(FeedPostState state) async {
    final wasLiked = state.liked;
    final delta = wasLiked ? -1 : 1;
    setState(() {
      state.liked = !wasLiked;
      state.stats = FeedStats(
        hearts: (state.stats.hearts + delta).clamp(0, 999999999),
        comments: state.stats.comments,
        saves: state.stats.saves,
        reposts: state.stats.reposts,
        views: state.stats.views,
        impressions: state.stats.impressions,
      );
    });

    try {
      if (wasLiked) {
        await PostInteractionService.unlike(state.post.id);
      } else {
        await PostInteractionService.like(state.post.id);
      }
    } catch (_) {
      if (!mounted) return;
      setState(() {
        state.liked = wasLiked;
        state.stats = FeedStats(
          hearts: (state.stats.hearts - delta).clamp(0, 999999999),
          comments: state.stats.comments,
          saves: state.stats.saves,
          reposts: state.stats.reposts,
          views: state.stats.views,
          impressions: state.stats.impressions,
        );
      });
    }
  }

  Future<void> _onSave(FeedPostState state) async {
    final wasSaved = state.saved;
    setState(() => state.saved = !wasSaved);

    try {
      if (wasSaved) {
        await PostInteractionService.unsave(state.post.id);
      } else {
        await PostInteractionService.save(state.post.id);
      }
    } catch (_) {
      if (!mounted) return;
      setState(() => state.saved = wasSaved);
    }
  }

  Future<void> _onHide(FeedPostState state) async {
    setState(() => _posts.remove(state));
    try {
      await PostInteractionService.hide(state.post.id);
    } catch (_) {
      if (!mounted) return;
      setState(() => _posts.add(state));
    }
  }

  String _resolveOriginalPostId(FeedPost post) {
    final repostOf = post.repostOf;
    if (repostOf != null && repostOf.isNotEmpty) return repostOf;
    return post.id;
  }

  void _incrementRepostStat(String postId) {
    final idx = _posts.indexWhere((s) => s.post.id == postId);
    if (idx < 0) return;
    final s = _posts[idx];
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
    } catch (_) {
      _showSnack('Failed to repost', error: true);
    }
  }

  Future<void> _handleQuoteRepost(
    FeedPostState targetState,
    RepostQuoteInput input,
  ) async {
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
    } catch (_) {
      _showSnack('Failed to repost with quote', error: true);
    }
  }

  Future<void> _onRepost(FeedPostState state) async {
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

  FeedPostState? _findState(String postId) {
    final idx = _posts.indexWhere((s) => s.post.id == postId);
    if (idx < 0) return null;
    return _posts[idx];
  }

  void _replaceState(String postId, FeedPostState next) {
    final idx = _posts.indexWhere((s) => s.post.id == postId);
    if (idx < 0) return;
    setState(() => _posts[idx] = next);
  }

  Future<void> _onPostMenuAction(
    PostMenuAction action,
    FeedPostState state,
  ) async {
    final post = state.post;
    switch (action) {
      case PostMenuAction.editPost:
        final updated = await showEditPostSheet(
          context,
          post: post,
          entityLabel: post.kind == 'reel' ? 'reel' : 'post',
        );
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
        _openPost(state);
        return;
      case PostMenuAction.detailAds:
        _showSnack('Ads detail is available from Home feed', error: true);
        return;
      case PostMenuAction.followToggle:
        return;
      case PostMenuAction.saveToggle:
        await _onSave(state);
        return;
      case PostMenuAction.hidePost:
        await _onHide(state);
        _showSnack('Post hidden');
        return;
      case PostMenuAction.copyLink:
        final link = post.kind.toLowerCase() == 'reel'
            ? PostInteractionService.reelPermalink(post.id)
            : PostInteractionService.permalink(post.id);
        await Clipboard.setData(ClipboardData(text: link));
        _showSnack('Link copied');
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
      case PostMenuAction.deletePost:
        final confirmed = await showDialog<bool>(
          context: context,
          builder: (ctx) => AlertDialog(
            backgroundColor: const Color(0xFF111827),
            title: const Text(
              'Delete post',
              style: TextStyle(color: Colors.white),
            ),
            content: const Text(
              'This action cannot be undone.',
              style: TextStyle(color: Color(0xFF7A8BB0)),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(ctx, false),
                child: const Text('Cancel'),
              ),
              TextButton(
                onPressed: () => Navigator.pop(ctx, true),
                child: const Text(
                  'Delete',
                  style: TextStyle(color: Color(0xFFEF4444)),
                ),
              ),
            ],
          ),
        );
        if (confirmed != true) return;
        final snapshot = _findState(post.id);
        setState(() => _posts.removeWhere((s) => s.post.id == post.id));
        try {
          await PostInteractionService.deletePost(post.id);
          _showSnack('Post deleted');
        } catch (_) {
          if (!mounted) return;
          if (snapshot != null) setState(() => _posts.insert(0, snapshot));
          _showSnack('Failed to delete post', error: true);
        }
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
        try {
          await PostInteractionService.blockUser(userId);
          if (!mounted) return;
          setState(() {
            _posts.removeWhere((s) => s.post.authorId == userId);
            _reels.removeWhere((s) => s.authorId == userId);
            _people.removeWhere((s) => s.userId == userId);
          });
          _showSnack('Account blocked');
        } catch (_) {
          _showSnack('Failed to block account', error: true);
        }
        return;
    }
  }

  void _trackView(FeedPostState state) {
    final id = state.post.id;
    final now = DateTime.now().millisecondsSinceEpoch;
    final last = _viewCooldownMap[id] ?? 0;
    if (now - last < _kViewCooldownMs) return;
    _viewCooldownMap[id] = now;
    PostInteractionService.view(id).catchError((_) {
      _viewCooldownMap.remove(id);
    });
  }

  String _formatCount(int value) {
    if (value >= 1000000) {
      final n = (value / 1000000).toStringAsFixed(1);
      return n.endsWith('.0') ? '${n.substring(0, n.length - 2)}M' : '${n}M';
    }
    if (value >= 1000) {
      final n = (value / 1000).toStringAsFixed(1);
      return n.endsWith('.0') ? '${n.substring(0, n.length - 2)}K' : '${n}K';
    }
    return '$value';
  }

  String _videoThumb(String url) {
    const marker = '/video/upload/';
    final idx = url.indexOf(marker);
    if (idx == -1) return url;
    final before = url.substring(0, idx + marker.length);
    final after = url.substring(idx + marker.length);
    final dotIdx = after.lastIndexOf('.');
    final pathNoExt = dotIdx >= 0 ? after.substring(0, dotIdx) : after;
    return '${before}so_0/$pathNoExt.jpg';
  }

  Widget _buildTabs() {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          _tabBtn('All', _SearchTab.all),
          _tabBtn('People', _SearchTab.people),
          _tabBtn('Hashtags', _SearchTab.hashtags),
          _tabBtn('Reels', _SearchTab.reels),
          _tabBtn('Posts', _SearchTab.posts),
        ],
      ),
    );
  }

  Widget _tabBtn(String label, _SearchTab tab) {
    final active = _activeTab == tab;
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: ChoiceChip(
        showCheckmark: false,
        label: Text(label),
        selected: active,
        labelStyle: TextStyle(
          color: active ? Colors.white : const Color(0xFF9BAECF),
          fontWeight: FontWeight.w600,
        ),
        selectedColor: const Color(0xFF1F3B73),
        backgroundColor: const Color(0xFF111C33),
        onSelected: (_) => setState(() => _activeTab = tab),
      ),
    );
  }

  Widget _buildHistory() {
    if (_history.isEmpty) {
      return const Padding(
        padding: EdgeInsets.only(top: 20),
        child: Text(
          'No recent searches',
          style: TextStyle(color: Color(0xFF7A8BB0)),
        ),
      );
    }

    return Column(
      children: [
        Row(
          children: [
            const Text(
              'Recent',
              style: TextStyle(
                color: Colors.white,
                fontSize: 16,
                fontWeight: FontWeight.w700,
              ),
            ),
            const Spacer(),
            TextButton(
              onPressed: _clearHistory,
              child: const Text('Clear all'),
            ),
          ],
        ),
        ..._history.map((item) {
          return ListTile(
            onTap: () => _openHistory(item),
            leading: CircleAvatar(
              backgroundColor: const Color(0xFF1E293B),
              backgroundImage: item.imageUrl.isNotEmpty
                  ? NetworkImage(item.imageUrl)
                  : null,
              child: item.imageUrl.isEmpty
                  ? Icon(
                      item.kind == SearchHistoryKind.hashtag
                          ? Icons.tag
                          : item.kind == SearchHistoryKind.profile
                          ? Icons.person
                          : item.kind == SearchHistoryKind.reel
                          ? Icons.smart_display
                          : Icons.search,
                      color: Colors.white70,
                    )
                  : null,
            ),
            title: Text(
              item.label.isEmpty ? '(no caption)' : item.label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(color: Colors.white),
            ),
            subtitle: item.subtitle.isEmpty
                ? null
                : Text(
                    item.subtitle,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(color: Color(0xFF9BAECF)),
                  ),
            trailing: IconButton(
              icon: const Icon(Icons.close, color: Color(0xFF9BAECF), size: 18),
              onPressed: () => _deleteHistoryItem(item.id),
            ),
          );
        }),
      ],
    );
  }

  Widget _buildPeopleList(List<ProfileSearchItem> items, {int? take}) {
    final sliced = take == null
        ? items
        : items.take(take).toList(growable: false);
    if (sliced.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Padding(
          padding: EdgeInsets.symmetric(vertical: 8),
          child: Text(
            'People',
            style: TextStyle(
              color: Colors.white,
              fontSize: 16,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
        ...sliced.map(
          (p) => ListTile(
            onTap: () => _openProfile(p),
            leading: CircleAvatar(
              backgroundColor: const Color(0xFF334155),
              backgroundImage: p.avatarUrl.isNotEmpty
                  ? NetworkImage(p.avatarUrl)
                  : null,
              child: p.avatarUrl.isEmpty
                  ? Text(
                      (p.displayName.isNotEmpty ? p.displayName[0] : 'U')
                          .toUpperCase(),
                      style: const TextStyle(color: Colors.white),
                    )
                  : null,
            ),
            title: Text(
              p.displayName,
              style: const TextStyle(color: Colors.white),
            ),
            subtitle: Text(
              '@${p.username}',
              style: const TextStyle(color: Color(0xFF9BAECF)),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildHashtagList(List<HashtagSearchItem> items, {int? take}) {
    final sliced = take == null
        ? items
        : items.take(take).toList(growable: false);
    if (sliced.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Padding(
          padding: EdgeInsets.symmetric(vertical: 8),
          child: Text(
            'Hashtags',
            style: TextStyle(
              color: Colors.white,
              fontSize: 16,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
        ...sliced.map(
          (t) => ListTile(
            onTap: () => _openHashtag(t.name),
            leading: const CircleAvatar(
              backgroundColor: Color(0xFF1E293B),
              child: Text(
                '#',
                style: TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
            title: Text(
              '#${t.name}',
              style: const TextStyle(color: Colors.white),
            ),
            subtitle: Text(
              '${t.usageCount} posts',
              style: const TextStyle(color: Color(0xFF9BAECF)),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildReelGrid(List<FeedPost> items, {int? take}) {
    final sliced = take == null
        ? items
        : items.take(take).toList(growable: false);
    if (sliced.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Padding(
          padding: EdgeInsets.symmetric(vertical: 8),
          child: Text(
            'Reels',
            style: TextStyle(
              color: Colors.white,
              fontSize: 16,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
        GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 3,
            mainAxisSpacing: 8,
            crossAxisSpacing: 8,
            childAspectRatio: 0.62,
          ),
          itemCount: sliced.length,
          itemBuilder: (context, index) {
            final item = sliced[index];
            final media = item.media.isNotEmpty ? item.media.first : null;
            if (media == null) return const SizedBox.shrink();
            final source = media.type.toLowerCase() == 'video'
                ? _videoThumb(media.url)
                : media.url;
            return InkWell(
              onTap: () => _openReel(item),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    Image.network(
                      source,
                      fit: BoxFit.cover,
                      errorBuilder: (_, _, _) =>
                          const ColoredBox(color: Color(0xFF1E293B)),
                    ),
                    Positioned(
                      right: 6,
                      bottom: 6,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 6,
                          vertical: 3,
                        ),
                        decoration: BoxDecoration(
                          color: Colors.black.withValues(alpha: 0.45),
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(
                              Icons.visibility_outlined,
                              size: 11,
                              color: Colors.white,
                            ),
                            const SizedBox(width: 3),
                            Text(
                              _formatCount(item.stats.viewCount),
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 10,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        ),
      ],
    );
  }

  Widget _buildPostsList(List<FeedPostState> items, {int? take}) {
    final sliced = take == null
        ? items
        : items.take(take).toList(growable: false);
    if (sliced.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Padding(
          padding: EdgeInsets.symmetric(vertical: 8),
          child: Text(
            'Posts',
            style: TextStyle(
              color: Colors.white,
              fontSize: 16,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
        ...sliced.map(
          (state) => PostCard(
            state: state,
            onLike: () => _onLike(state),
            onSave: () => _onSave(state),
            onRepost: () => _onRepost(state),
            onHide: () => _onHide(state),
            onView: () => _trackView(state),
            onComment: () => _openPost(state),
            onAuthorTap: (id) {
              if (id.isEmpty) return;
              Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => ProfileScreen(userId: id)),
              );
            },
            onHashtagTap: _openHashtag,
            onMenuAction: (a, s) => _onPostMenuAction(a, s),
          ),
        ),
      ],
    );
  }

  Widget _buildResultsBody() {
    if (_query.isEmpty) {
      return _buildHistory();
    }

    if (_loading &&
        _people.isEmpty &&
        _posts.isEmpty &&
        _reels.isEmpty &&
        _hashtags.isEmpty) {
      return const Padding(
        padding: EdgeInsets.only(top: 20),
        child: Center(
          child: CircularProgressIndicator(color: Color(0xFF4AA3E4)),
        ),
      );
    }

    if (_error != null) {
      return Padding(
        padding: const EdgeInsets.only(top: 20),
        child: Text(_error!, style: const TextStyle(color: Color(0xFFFCA5A5))),
      );
    }

    if (_activeTab == _SearchTab.people) {
      return _buildPeopleList(_people);
    }
    if (_activeTab == _SearchTab.hashtags) {
      return Column(
        children: [
          _buildHashtagList(_hashtags),
          if (_hashtagsHasMore)
            TextButton(
              onPressed: _loadHashtagsMore,
              child: const Text('Load more'),
            ),
        ],
      );
    }
    if (_activeTab == _SearchTab.reels) {
      return Column(
        children: [
          _buildReelGrid(_reels),
          if (_reelsHasMore)
            TextButton(
              onPressed: _loadReelsMore,
              child: const Text('Load more'),
            ),
        ],
      );
    }
    if (_activeTab == _SearchTab.posts) {
      return Column(
        children: [
          _buildPostsList(_posts),
          if (_postsHasMore)
            TextButton(
              onPressed: _loadPostsMore,
              child: const Text('Load more'),
            ),
        ],
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildPeopleList(_people, take: 12),
        _buildHashtagList(_hashtagSuggest, take: 10),
        _buildPostsList(_allPreviewPosts, take: _kAllPreviewPostsLimit),
        _buildReelGrid(_allPreviewReels, take: _kAllPreviewReelsLimit),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0B1020),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0D1526),
        elevation: 0,
        iconTheme: const IconThemeData(color: Color(0xFF9BAECF)),
        title: const Text(
          'Search',
          style: TextStyle(
            color: Color(0xFFE8ECF8),
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 8),
            child: TextField(
              controller: _searchController,
              onChanged: _onQueryChanged,
              onSubmitted: (_) {
                _addQueryHistory();
                _runSearchInitial();
              },
              textInputAction: TextInputAction.search,
              style: const TextStyle(color: Colors.white),
              decoration: InputDecoration(
                hintText: 'Search people, #hashtags, posts, reels',
                hintStyle: const TextStyle(color: Color(0xFF9BAECF)),
                prefixIcon: const Icon(
                  Icons.search_rounded,
                  color: Color(0xFF9BAECF),
                ),
                suffixIcon: _searchController.text.trim().isNotEmpty
                    ? IconButton(
                        icon: const Icon(Icons.close, color: Color(0xFF9BAECF)),
                        onPressed: () {
                          _searchController.clear();
                          _onQueryChanged('');
                          setState(() {});
                        },
                      )
                    : null,
                filled: true,
                fillColor: const Color(0xFF111C33),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide.none,
                ),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: _buildTabs(),
          ),
          const SizedBox(height: 4),
          Expanded(
            child: SingleChildScrollView(
              controller: _scrollController,
              padding: const EdgeInsets.fromLTRB(12, 6, 12, 24),
              child: _buildResultsBody(),
            ),
          ),
        ],
      ),
    );
  }
}
