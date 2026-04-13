import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/services/api_service.dart';
import '../../core/services/auth_storage.dart';
import '../home/models/feed_post.dart';
import '../home/services/feed_service.dart';
import '../home/services/post_interaction_service.dart';
import '../home/widgets/post_card.dart' show PostCard, PostMenuAction;
import '../post/post_detail_screen.dart';
import '../post/utils/post_mute_overlay.dart';
import '../post/utils/repost_flow_utils.dart';
import '../profile/profile_screen.dart';
import '../reels/reels_screen.dart';
import '../report/report_post_sheet.dart';

class FollowingScreen extends StatefulWidget {
  const FollowingScreen({super.key});

  @override
  State<FollowingScreen> createState() => _FollowingScreenState();
}

class _FollowingScreenState extends State<FollowingScreen> {
  final List<FeedPostState> _items = [];
  final ScrollController _scrollController = ScrollController();
  final Set<String> _revealedReels = <String>{};
  final Map<String, int> _viewCooldownMap = <String, int>{};

  bool _loading = false;
  bool _initialLoad = true;
  bool _hasMore = true;
  int _page = 1;
  String? _error;
  String? _viewerId;

  static const int _kViewCooldownMs = 300000;

  @override
  void initState() {
    super.initState();
    _fetchViewerId();
    _loadFeed();
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
        extraHeaders: _authHeader,
      );
      if (!mounted) return;
      setState(() {
        _viewerId = (data['userId'] as String?) ?? (data['id'] as String?);
      });
    } catch (_) {}
  }

  Map<String, String> get _authHeader => {
    'Authorization': 'Bearer ${AuthStorage.accessToken}',
  };

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
      final allItems = await FeedService.fetchFeed(
        page: _page,
        scope: 'following',
        kinds: const ['post', 'reel'],
      );
      if (!mounted) return;

      final visibleItems = allItems.where((p) => !isAdLikeFeedPost(p)).toList();

      final expectedLimit = _page * FeedService.pageSize;

      setState(() {
        final existingIds = {for (final s in _items) s.post.id};
        final fresh = visibleItems.where((p) => !existingIds.contains(p.id));
        _items.addAll(fresh.map((p) => FeedPostState(post: p)));
        _page++;
        _hasMore = allItems.length >= expectedLimit;
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
        _error = 'Failed to load following feed.';
        _initialLoad = false;
      });
    } finally {
      if (!mounted) return;
      setState(() => _loading = false);
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
    } catch (_) {
      if (!mounted) return;
      setState(() => _items.add(state));
    }
  }

  Future<void> _onPostMenuAction(
    PostMenuAction action,
    FeedPostState state,
  ) async {
    final post = state.post;
    switch (action) {
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
            _items.removeWhere((s) => s.post.authorId == userId);
          });
          _showSnack('Account blocked');
        } catch (_) {
          _showSnack('Failed to block account', error: true);
        }
        return;
      case PostMenuAction.deletePost:
        final snapshot = state;
        setState(() => _items.removeWhere((s) => s.post.id == post.id));
        try {
          await PostInteractionService.deletePost(post.id);
          _showSnack('Post deleted');
        } catch (_) {
          if (!mounted) return;
          setState(() => _items.insert(0, snapshot));
          _showSnack('Failed to delete post', error: true);
        }
        return;
      case PostMenuAction.editPost:
      case PostMenuAction.editVisibility:
      case PostMenuAction.toggleComments:
      case PostMenuAction.toggleHideLike:
      case PostMenuAction.goToAdsPost:
      case PostMenuAction.detailAds:
        _showSnack('This action is not available in Following yet');
        return;
    }
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

  void _openAuthor(String authorId) {
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

  void _openReel(FeedPost reel) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => ReelsScreen(scope: 'following', initialReelId: reel.id),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_initialLoad && _loading) {
      return const Center(
        child: CircularProgressIndicator(color: Color(0xFF4AA3E4)),
      );
    }

    if (_error != null && _items.isEmpty) {
      return _FollowingErrorState(
        message: _error!,
        onRetry: () => _loadFeed(refresh: true),
      );
    }

    if (!_initialLoad && _items.isEmpty && !_loading) {
      return _FollowingEmptyState(onRefresh: () => _loadFeed(refresh: true));
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
            final revealed = _revealedReels.contains(state.post.id);
            return _ReelFeedCard(
              post: state.post,
              revealed: revealed,
              onReveal: () {
                setState(() => _revealedReels.add(state.post.id));
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
          );
        },
      ),
    );
  }
}

class _ReelFeedCard extends StatelessWidget {
  const _ReelFeedCard({
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

    final previewUrl = _previewUrl(media: media, revealed: revealed);

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
                        previewUrl,
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

class _FollowingErrorState extends StatelessWidget {
  const _FollowingErrorState({required this.message, required this.onRetry});

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

class _FollowingEmptyState extends StatelessWidget {
  const _FollowingEmptyState({required this.onRefresh});

  final Future<void> Function() onRefresh;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.people_outline, color: Colors.white54, size: 42),
            const SizedBox(height: 10),
            const Text(
              'No following posts yet',
              style: TextStyle(
                color: Colors.white,
                fontSize: 16,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 6),
            const Text(
              'Follow more creators to fill this feed.',
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.white70),
            ),
            const SizedBox(height: 14),
            ElevatedButton(onPressed: onRefresh, child: const Text('Refresh')),
          ],
        ),
      ),
    );
  }
}
