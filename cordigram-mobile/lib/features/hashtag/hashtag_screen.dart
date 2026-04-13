import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../core/services/api_service.dart';
import '../../core/services/auth_storage.dart';
import '../home/models/feed_post.dart';
import '../home/services/post_interaction_service.dart';
import '../home/widgets/post_card.dart' show PostCard, PostMenuAction;
import '../post/post_detail_screen.dart';
import '../post/utils/post_edit_utils.dart';
import '../post/utils/post_mute_overlay.dart';
import '../post/utils/repost_flow_utils.dart';
import '../profile/profile_item_viewer_screen.dart';
import '../profile/profile_screen.dart';
import '../report/report_post_sheet.dart';
import 'services/hashtag_feed_service.dart';

class HashtagScreen extends StatefulWidget {
  const HashtagScreen({super.key, required this.tag});

  final String tag;

  @override
  State<HashtagScreen> createState() => _HashtagScreenState();
}

class _HashtagScreenState extends State<HashtagScreen> {
  final List<FeedPostState> _items = [];
  final ScrollController _scrollController = ScrollController();
  final Map<String, int> _viewCooldownMap = <String, int>{};
  final Set<String> _revealedReelPostIds = <String>{};

  bool _loading = false;
  bool _initialLoad = true;
  bool _hasMore = true;
  int _page = 1;
  String? _error;
  String? _viewerId;

  static const int _kViewCooldownMs = 300000;

  String get _normalizedTag =>
      widget.tag.replaceAll('#', '').trim().toLowerCase();

  @override
  void initState() {
    super.initState();
    _fetchViewerId();
    _loadFeed(refresh: true);
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _fetchViewerId() async {
    try {
      final data = await ApiService.get(
        '/profiles/me',
        extraHeaders: {'Authorization': 'Bearer ${AuthStorage.accessToken}'},
      );
      if (!mounted) return;
      setState(() {
        _viewerId = (data['userId'] as String?) ?? (data['id'] as String?);
      });
    } catch (_) {}
  }

  void _onScroll() {
    if (_scrollController.position.pixels >=
        _scrollController.position.maxScrollExtent - 320) {
      if (!_loading && _hasMore) _loadFeed();
    }
  }

  Future<void> _loadFeed({bool refresh = false}) async {
    if (_loading) return;

    setState(() {
      _loading = true;
      _error = null;
      if (refresh) {
        _items.clear();
        _page = 1;
        _hasMore = true;
        _initialLoad = true;
      }
    });

    try {
      final bundle = await HashtagFeedService.fetchByTag(
        tag: _normalizedTag,
        page: _page,
      );
      if (!mounted) return;

      final merged = <FeedPost>[
        ...bundle.posts.where((p) => !isAdLikeFeedPost(p)),
        ...bundle.reels.where((r) => !isAdLikeFeedPost(r)),
      ];
      merged.sort((a, b) {
        final aTime = a.displayTimeMs;
        final bTime = b.displayTimeMs;
        return bTime.compareTo(aTime);
      });

      final expectedLimit = _page * HashtagFeedService.pageSize;

      setState(() {
        final existingIds = {for (final s in _items) s.post.id};
        final fresh = merged.where((p) => !existingIds.contains(p.id));
        _items.addAll(fresh.map((p) => FeedPostState(post: p)));
        _page++;
        _hasMore =
            bundle.posts.length >= expectedLimit ||
            bundle.reels.length >= expectedLimit;
        _initialLoad = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
        _initialLoad = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'Failed to load hashtag feed.';
        _initialLoad = false;
      });
    } finally {
      if (!mounted) return;
      setState(() => _loading = false);
    }
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

  String _resolveOriginalPostId(FeedPost post) {
    final repostOf = post.repostOf;
    if (repostOf != null && repostOf.isNotEmpty) return repostOf;
    return post.id;
  }

  void _incrementRepostStat(String postId) {
    final idx = _items.indexWhere((s) => s.post.id == postId);
    if (idx < 0) return;
    final s = _items[idx];
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

  Future<void> _onHide(FeedPostState state) async {
    setState(() => _items.remove(state));
    try {
      await PostInteractionService.hide(state.post.id);
      _showSnack('Post hidden');
    } catch (_) {
      if (!mounted) return;
      setState(() => _items.add(state));
      _showSnack('Failed to hide post', error: true);
    }
  }

  FeedPostState? _findState(String postId) {
    final idx = _items.indexWhere((s) => s.post.id == postId);
    if (idx < 0) return null;
    return _items[idx];
  }

  void _replaceState(String postId, FeedPostState next) {
    final idx = _items.indexWhere((s) => s.post.id == postId);
    if (idx < 0) return;
    setState(() => _items[idx] = next);
  }

  Future<void> _onFollow(String authorId, bool nextFollow) async {
    setState(() {
      for (final s in _items) {
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
        for (final s in _items) {
          if (s.post.authorId == authorId) s.following = !nextFollow;
        }
      });
    }
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
      case PostMenuAction.followToggle:
        final authorId = post.authorId;
        if (authorId == null || authorId.isEmpty) return;
        await _onFollow(authorId, !state.following);
        return;
      case PostMenuAction.saveToggle:
        await _onSave(state);
        return;
      case PostMenuAction.hidePost:
        await _onHide(state);
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
        setState(() => _items.removeWhere((s) => s.post.id == post.id));
        try {
          await PostInteractionService.deletePost(post.id);
          _showSnack('Post deleted');
        } catch (_) {
          if (!mounted) return;
          if (snapshot != null) {
            setState(() => _items.insert(0, snapshot));
          }
          _showSnack('Failed to delete post', error: true);
        }
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
            _items.removeWhere((s) => s.post.authorId == userId);
          });
          _showSnack('Account blocked');
        } catch (_) {
          _showSnack('Failed to block account', error: true);
        }
        return;
      case PostMenuAction.goToAdsPost:
        _openPostDetail(state);
        return;
      case PostMenuAction.detailAds:
        _showSnack('Ads detail is available from Home feed', error: true);
        return;
    }
  }

  void _openAuthor(String authorId) {
    if (authorId.isEmpty) return;
    Navigator.of(
      context,
    ).push(MaterialPageRoute(builder: (_) => ProfileScreen(userId: authorId)));
  }

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

  Map<String, dynamic> _toViewerItem(FeedPost post) {
    final author = post.author;
    return {
      'id': post.id,
      'kind': post.kind,
      'content': post.content,
      'media': post.media
          .map(
            (m) => <String, dynamic>{
              'type': m.type,
              'url': m.url,
              'originalUrl': m.originalUrl,
              'originalSecureUrl': m.originalSecureUrl,
              'moderationDecision': m.moderationDecision,
            },
          )
          .toList(),
      'hashtags': post.hashtags,
      'stats': {
        'hearts': post.stats.hearts,
        'comments': post.stats.comments,
        'saves': post.stats.saves,
        'reposts': post.stats.reposts,
        'views': post.stats.views,
        'impressions': post.stats.impressions,
      },
      'createdAt': post.createdAt,
      'scheduledAt': post.scheduledAt,
      'publishedAt': post.publishedAt,
      'location': post.location,
      'authorId': post.authorId,
      'authorUsername': post.authorUsername,
      'authorDisplayName': post.authorDisplayName,
      'authorAvatarUrl': post.authorAvatarUrl,
      'authorIsCreatorVerified':
          post.authorIsCreatorVerified ?? author?.isCreatorVerified,
      'author': {
        'id': author?.id ?? post.authorId,
        'username': author?.username ?? post.authorUsername,
        'displayName': author?.displayName ?? post.authorDisplayName,
        'avatarUrl': author?.avatarUrl ?? post.authorAvatarUrl,
        'isCreatorVerified':
            author?.isCreatorVerified ?? post.authorIsCreatorVerified,
      },
      'liked': post.liked,
      'saved': post.saved,
      'following': post.following,
      'repostOf': post.repostOf,
      'allowComments': post.allowComments,
      'allowDownload': post.allowDownload,
      'hideLikeCount': post.hideLikeCount,
      'visibility': post.visibility,
      'primaryVideoDurationMs': post.primaryVideoDurationMs,
      'repostOfAuthorId': post.repostOfAuthorId,
      'repostOfAuthorDisplayName': post.repostOfAuthorDisplayName,
      'repostOfAuthorUsername': post.repostOfAuthorUsername,
      'repostOfAuthorAvatarUrl': post.repostOfAuthorAvatarUrl,
      'repostOfAuthor': post.repostOfAuthor == null
          ? null
          : {
              'id': post.repostOfAuthor!.id,
              'username': post.repostOfAuthor!.username,
              'displayName': post.repostOfAuthor!.displayName,
              'avatarUrl': post.repostOfAuthor!.avatarUrl,
              'isCreatorVerified': post.repostOfAuthor!.isCreatorVerified,
            },
    };
  }

  void _openReel(FeedPost reel) {
    final reels = _items
        .map((s) => s.post)
        .where((p) => p.kind.toLowerCase() == 'reel')
        .toList(growable: false);
    final initialIndex = reels.indexWhere((r) => r.id == reel.id);
    final reelMaps = reels.map(_toViewerItem).toList(growable: false);

    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => ProfileReelViewerScreen(
          items: reelMaps,
          initialIndex: initialIndex >= 0 ? initialIndex : 0,
          viewerId: _viewerId,
        ),
      ),
    );
  }

  void _openHashtag(String tag) {
    final normalized = tag.replaceAll('#', '').trim().toLowerCase();
    if (normalized.isEmpty) return;
    if (normalized == _normalizedTag) return;
    Navigator.of(
      context,
    ).push(MaterialPageRoute(builder: (_) => HashtagScreen(tag: normalized)));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0B1020),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0B1020),
        elevation: 0,
        title: Text(
          '#$_normalizedTag',
          style: const TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_initialLoad && _loading) {
      return const Center(
        child: CircularProgressIndicator(color: Color(0xFF4AA3E4)),
      );
    }

    if (_error != null && _items.isEmpty) {
      return _HashtagErrorState(
        message: _error!,
        onRetry: () => _loadFeed(refresh: true),
      );
    }

    if (!_initialLoad && _items.isEmpty && !_loading) {
      return _HashtagEmptyState(
        tag: _normalizedTag,
        onRefresh: () => _loadFeed(refresh: true),
      );
    }

    return RefreshIndicator(
      color: const Color(0xFF4AA3E4),
      backgroundColor: const Color(0xFF131929),
      onRefresh: () => _loadFeed(refresh: true),
      child: ListView.builder(
        controller: _scrollController,
        physics: const AlwaysScrollableScrollPhysics(),
        itemCount: _items.length + (_hasMore ? 1 : 0),
        itemBuilder: (context, index) {
          if (index >= _items.length) {
            if (!_loading) _loadFeed();
            return const Padding(
              padding: EdgeInsets.symmetric(vertical: 16),
              child: Center(
                child: CircularProgressIndicator(color: Color(0xFF4AA3E4)),
              ),
            );
          }

          final state = _items[index];
          if (state.post.kind.toLowerCase() == 'reel') {
            final revealed = _revealedReelPostIds.contains(state.post.id);
            return _HashtagReelCard(
              post: state.post,
              revealed: revealed,
              onReveal: () {
                setState(() => _revealedReelPostIds.add(state.post.id));
              },
              onTap: () => _openReel(state.post),
            );
          }

          return PostCard(
            state: state,
            viewerId: _viewerId,
            onLike: () => _onLike(state),
            onSave: () => _onSave(state),
            onRepost: () => _onRepost(state),
            onHide: () => _onHide(state),
            onView: () => _trackView(state),
            onFollow: _onFollow,
            onAuthorTap: _openAuthor,
            onComment: () => _openPostDetail(state),
            onMenuAction: (action, postState) =>
                _onPostMenuAction(action, postState),
            onHashtagTap: _openHashtag,
          );
        },
      ),
    );
  }
}

class _HashtagReelCard extends StatelessWidget {
  const _HashtagReelCard({
    required this.post,
    required this.revealed,
    required this.onTap,
    required this.onReveal,
  });

  final FeedPost post;
  final bool revealed;
  final VoidCallback onTap;
  final VoidCallback onReveal;

  @override
  Widget build(BuildContext context) {
    final media = post.media.isNotEmpty ? post.media.first : null;
    if (media == null) return const SizedBox.shrink();

    final isBlurred = media.isBlurredByModeration && !revealed;
    final displayName =
        post.authorDisplayName ?? post.authorUsername ?? 'Unknown';
    final subtitle = '@${post.authorUsername ?? 'user'}';

    return Container(
      margin: const EdgeInsets.fromLTRB(12, 8, 12, 8),
      child: Material(
        color: const Color(0xFF0F172A),
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: onTap,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ClipRRect(
                borderRadius: const BorderRadius.vertical(
                  top: Radius.circular(16),
                ),
                child: AspectRatio(
                  aspectRatio: 9 / 14,
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      Image.network(
                        _previewUrl(media: media, revealed: revealed),
                        fit: BoxFit.cover,
                        errorBuilder: (_, _, _) =>
                            const ColoredBox(color: Color(0xFF1E293B)),
                      ),
                      Align(
                        alignment: Alignment.topRight,
                        child: Container(
                          margin: const EdgeInsets.all(10),
                          padding: const EdgeInsets.symmetric(
                            horizontal: 8,
                            vertical: 4,
                          ),
                          decoration: BoxDecoration(
                            color: Colors.black.withValues(alpha: 0.45),
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: const Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(
                                Icons.play_arrow_rounded,
                                color: Colors.white,
                                size: 14,
                              ),
                              SizedBox(width: 2),
                              Text(
                                'Reel',
                                style: TextStyle(
                                  color: Colors.white,
                                  fontSize: 11,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                      if (isBlurred)
                        Positioned.fill(
                          child: Container(
                            color: Colors.black.withValues(alpha: 0.45),
                            alignment: Alignment.center,
                            padding: const EdgeInsets.symmetric(horizontal: 20),
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                const Text(
                                  'This image has been blurred due to sensitive content.',
                                  textAlign: TextAlign.center,
                                  style: TextStyle(
                                    color: Colors.white,
                                    fontSize: 13,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                                const SizedBox(height: 10),
                                FilledButton.tonal(
                                  onPressed: onReveal,
                                  style: FilledButton.styleFrom(
                                    foregroundColor: Colors.white,
                                    backgroundColor: Colors.white.withValues(
                                      alpha: 0.18,
                                    ),
                                  ),
                                  child: const Text('View image'),
                                ),
                              ],
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
                child: Row(
                  children: [
                    CircleAvatar(
                      radius: 16,
                      backgroundColor: const Color(0xFF334155),
                      backgroundImage: (post.authorAvatarUrl ?? '').isNotEmpty
                          ? NetworkImage(post.authorAvatarUrl!)
                          : null,
                      child: (post.authorAvatarUrl ?? '').isNotEmpty
                          ? null
                          : Text(
                              (displayName.isNotEmpty ? displayName[0] : 'U')
                                  .toUpperCase(),
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
                            displayName,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 14,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            subtitle,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              color: Color(0xFF94A3B8),
                              fontSize: 12,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _previewUrl({required FeedMedia media, required bool revealed}) {
    final source = media.displayUrl(revealed: revealed);
    if (media.type.toLowerCase() != 'video') return source;
    return _cloudinaryVideoThumb(source) ?? source;
  }

  String? _cloudinaryVideoThumb(String url) {
    const marker = '/video/upload/';
    final idx = url.indexOf(marker);
    if (idx == -1) return null;
    final before = url.substring(0, idx + marker.length);
    final after = url.substring(idx + marker.length);
    final dotIdx = after.lastIndexOf('.');
    final pathNoExt = dotIdx >= 0 ? after.substring(0, dotIdx) : after;
    return '${before}so_0/$pathNoExt.jpg';
  }
}

class _HashtagErrorState extends StatelessWidget {
  const _HashtagErrorState({required this.message, required this.onRetry});

  final String message;
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline, color: Colors.white70, size: 36),
            const SizedBox(height: 10),
            Text(
              message,
              style: const TextStyle(color: Colors.white70),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 12),
            ElevatedButton(onPressed: onRetry, child: const Text('Retry')),
          ],
        ),
      ),
    );
  }
}

class _HashtagEmptyState extends StatelessWidget {
  const _HashtagEmptyState({required this.tag, required this.onRefresh});

  final String tag;
  final Future<void> Function() onRefresh;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.tag, color: Colors.white54, size: 42),
            const SizedBox(height: 10),
            Text(
              'No posts found for #$tag',
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 16,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 14),
            ElevatedButton(onPressed: onRefresh, child: const Text('Refresh')),
          ],
        ),
      ),
    );
  }
}
