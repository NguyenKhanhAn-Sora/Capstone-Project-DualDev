import 'dart:math';

import 'package:cordigram_mobile/core/services/api_service.dart';
import 'package:flutter/material.dart';
import 'package:visibility_detector/visibility_detector.dart';

import '../home/models/feed_post.dart';
import '../post/post_detail_screen.dart';
import '../profile/profile_item_viewer_screen.dart';
import 'services/explore_service.dart';

class ExploreScreen extends StatefulWidget {
  const ExploreScreen({super.key});

  @override
  State<ExploreScreen> createState() => _ExploreScreenState();
}

class _ExploreScreenState extends State<ExploreScreen> {
  final List<FeedPost> _items = [];
  final ScrollController _scrollController = ScrollController();

  bool _loading = false;
  bool _initialLoading = true;
  bool _hasMore = true;
  String? _error;
  int _page = 1;

  final String _sessionId =
      '${DateTime.now().millisecondsSinceEpoch}-${Random().nextInt(1 << 32)}';
  final Set<String> _sentImpressions = <String>{};

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
    _loadPage(refresh: true);
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (_scrollController.position.pixels >=
        _scrollController.position.maxScrollExtent - 640) {
      if (!_loading && _hasMore) {
        _loadPage();
      }
    }
  }

  Future<void> _loadPage({bool refresh = false}) async {
    if (_loading) return;

    setState(() {
      _loading = true;
      _error = null;
      if (refresh) {
        _page = 1;
        _hasMore = true;
        _items.clear();
        _sentImpressions.clear();
        _initialLoading = true;
      }
    });

    try {
      final data = await ExploreService.fetchExploreFeed(page: _page);
      if (!mounted) return;

      setState(() {
        if (refresh) {
          _items
            ..clear()
            ..addAll(data);
        } else {
          final known = _items.map((e) => e.id).toSet();
          for (final item in data) {
            if (!known.contains(item.id)) {
              _items.add(item);
            }
          }
        }

        _hasMore = data.length >= ExploreService.pageSize;
        _page += 1;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.message);
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = 'Unable to load explore');
    } finally {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _initialLoading = false;
      });
    }
  }

  void _trackImpression(FeedPost item, int position) {
    if (_sentImpressions.contains(item.id)) return;
    _sentImpressions.add(item.id);
    ExploreService.recordImpression(
      postId: item.id,
      sessionId: _sessionId,
      position: position,
    );
  }

  bool _isReel(FeedPost item) => item.kind.toLowerCase() == 'reel';

  Map<String, dynamic> _toViewerItem(FeedPost post) {
    final author = post.author;
    return {
      'id': post.id,
      'kind': post.kind,
      'content': post.content,
      'media': post.media
          .map((m) => <String, dynamic>{'type': m.type, 'url': m.url})
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

  void _openItem(FeedPost item) {
    if (_isReel(item)) {
      final reels = _items.where(_isReel).toList(growable: false);
      final initialIndex = reels.indexWhere((r) => r.id == item.id);
      final reelMaps = reels.map(_toViewerItem).toList(growable: false);

      Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => ProfileReelViewerScreen(
            items: reelMaps,
            initialIndex: initialIndex >= 0 ? initialIndex : 0,
          ),
        ),
      );
      return;
    }

    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => PostDetailScreen(
          postId: item.id,
          initialState: FeedPostState(post: item),
        ),
      ),
    );
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

  int _indexOfShortestColumn(List<double> heights) {
    var minIndex = 0;
    var minHeight = heights[0];
    for (var i = 1; i < heights.length; i++) {
      if (heights[i] < minHeight) {
        minHeight = heights[i];
        minIndex = i;
      }
    }
    return minIndex;
  }

  Widget _buildTile(FeedPost item, int position, double tileHeight) {
    final media = item.media.isNotEmpty ? item.media.first : null;
    if (media == null) {
      return const SizedBox.shrink();
    }

    return SizedBox(
      height: tileHeight,
      child: VisibilityDetector(
        key: ValueKey('explore-tile-${item.id}'),
        onVisibilityChanged: (info) {
          if (info.visibleFraction >= 0.2) {
            _trackImpression(item, position);
          }
        },
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: () => _openItem(item),
            child: Stack(
              fit: StackFit.expand,
              children: [
                Image.network(
                  media.url,
                  fit: BoxFit.cover,
                  errorBuilder: (_, _, _) => const ColoredBox(
                    color: Color(0xFF1C2740),
                    child: Center(
                      child: Icon(
                        Icons.broken_image_outlined,
                        color: Color(0xFF7A8BB0),
                      ),
                    ),
                  ),
                ),
                Positioned(
                  left: 8,
                  bottom: 8,
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 5,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.black.withValues(alpha: 0.55),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(
                          Icons.remove_red_eye_outlined,
                          size: 14,
                          color: Colors.white,
                        ),
                        const SizedBox(width: 4),
                        Text(
                          _formatCount(item.stats.viewCount),
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                if (_isReel(item))
                  Positioned(
                    top: 8,
                    right: 8,
                    child: Container(
                      width: 26,
                      height: 26,
                      decoration: BoxDecoration(
                        color: Colors.black.withValues(alpha: 0.55),
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(
                        Icons.smart_display_outlined,
                        color: Colors.white,
                        size: 16,
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_initialLoading && _loading) {
      return const Center(
        child: CircularProgressIndicator(color: Color(0xFF4AA3E4)),
      );
    }

    if (_error != null && _items.isEmpty) {
      return _ExploreErrorState(
        message: _error!,
        onRetry: () => _loadPage(refresh: true),
      );
    }

    return RefreshIndicator(
      color: const Color(0xFF4AA3E4),
      backgroundColor: const Color(0xFF131929),
      onRefresh: () => _loadPage(refresh: true),
      child: CustomScrollView(
        controller: _scrollController,
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          if (_items.isEmpty && !_loading)
            SliverFillRemaining(
              hasScrollBody: false,
              child: Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(
                      Icons.grid_view_rounded,
                      size: 40,
                      color: Color(0xFF7A8BB0),
                    ),
                    const SizedBox(height: 10),
                    const Text(
                      'No explore posts yet',
                      style: TextStyle(color: Color(0xFFE8ECF8), fontSize: 15),
                    ),
                    const SizedBox(height: 6),
                    TextButton(
                      onPressed: () => _loadPage(refresh: true),
                      child: const Text('Refresh'),
                    ),
                  ],
                ),
              ),
            )
          else
            SliverPadding(
              padding: const EdgeInsets.only(top: 2),
              sliver: SliverToBoxAdapter(
                child: LayoutBuilder(
                  builder: (context, constraints) {
                    const columns = 3;
                    const gap = 2.0;
                    final totalGap = gap * (columns - 1);
                    final tileWidth =
                        (constraints.maxWidth - totalGap) / columns;

                    final columnHeights = List<double>.filled(columns, 0);
                    final columnTiles = List.generate(
                      columns,
                      (_) => <Widget>[],
                    );

                    for (var i = 0; i < _items.length; i++) {
                      final item = _items[i];
                      final isReel = _isReel(item);
                      final tileHeight = isReel
                          ? (tileWidth * 2) + gap
                          : tileWidth;
                      final col = _indexOfShortestColumn(columnHeights);

                      columnTiles[col].add(
                        Padding(
                          padding: const EdgeInsets.only(bottom: gap),
                          child: _buildTile(item, i, tileHeight),
                        ),
                      );
                      columnHeights[col] += tileHeight + gap;
                    }

                    return Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: List.generate(columns, (col) {
                        return Expanded(
                          child: Padding(
                            padding: EdgeInsets.only(
                              left: col == 0 ? 0 : gap / 2,
                              right: col == columns - 1 ? 0 : gap / 2,
                            ),
                            child: Column(children: columnTiles[col]),
                          ),
                        );
                      }),
                    );
                  },
                ),
              ),
            ),
          if (_loading && _items.isNotEmpty)
            const SliverToBoxAdapter(
              child: Padding(
                padding: EdgeInsets.symmetric(vertical: 18),
                child: Center(
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: Color(0xFF4AA3E4),
                  ),
                ),
              ),
            ),
          if (_error != null && _items.isNotEmpty)
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
                child: _ExploreInlineError(
                  message: _error!,
                  onRetry: _loadPage,
                ),
              ),
            ),
          if (!_hasMore && _items.isNotEmpty)
            const SliverToBoxAdapter(
              child: Padding(
                padding: EdgeInsets.symmetric(vertical: 20),
                child: Center(
                  child: Text(
                    "You've seen all explore posts",
                    style: TextStyle(color: Color(0xFF7A8BB0), fontSize: 12),
                  ),
                ),
              ),
            ),
          const SliverToBoxAdapter(child: SizedBox(height: 16)),
        ],
      ),
    );
  }
}

class _ExploreErrorState extends StatelessWidget {
  const _ExploreErrorState({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(
              Icons.error_outline_rounded,
              color: Color(0xFFEF4444),
              size: 34,
            ),
            const SizedBox(height: 10),
            Text(
              message,
              textAlign: TextAlign.center,
              style: const TextStyle(color: Color(0xFFE8ECF8)),
            ),
            const SizedBox(height: 12),
            ElevatedButton(onPressed: onRetry, child: const Text('Try again')),
          ],
        ),
      ),
    );
  }
}

class _ExploreInlineError extends StatelessWidget {
  const _ExploreInlineError({required this.message, required this.onRetry});

  final String message;
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF3A1B24),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFF5A2736)),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      child: Row(
        children: [
          const Icon(Icons.warning_amber_rounded, color: Color(0xFFFCA5A5)),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              message,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(color: Color(0xFFE8ECF8), fontSize: 12),
            ),
          ),
          const SizedBox(width: 8),
          TextButton(onPressed: onRetry, child: const Text('Retry')),
        ],
      ),
    );
  }
}
