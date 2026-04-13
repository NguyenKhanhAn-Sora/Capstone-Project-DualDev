import 'package:flutter/material.dart';

import '../../home/services/post_interaction_service.dart';
import '../../profile/profile_screen.dart';

class LikeUserItem {
  LikeUserItem({
    required this.userId,
    required this.username,
    required this.displayName,
    required this.avatarUrl,
    required this.isFollowing,
    this.isCreatorVerified = false,
  });

  factory LikeUserItem.fromJson(Map<String, dynamic> j) => LikeUserItem(
    userId: (j['userId'] as String?) ?? (j['id'] as String?) ?? '',
    username: (j['username'] as String?) ?? '',
    displayName: (j['displayName'] as String?) ?? '',
    avatarUrl: (j['avatarUrl'] as String?) ?? '',
    isFollowing: (j['isFollowing'] as bool?) ?? false,
    isCreatorVerified: (j['isCreatorVerified'] as bool?) ?? false,
  );

  final String userId;
  final String username;
  final String displayName;
  final String avatarUrl;
  bool isFollowing;
  final bool isCreatorVerified;
}

void showPostLikesSheet(
  BuildContext context, {
  required String postId,
  String? viewerId,
  String title = 'Likes',
}) {
  showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _LikesListSheet(
      title: title,
      viewerId: viewerId,
      loadPage: ({String? cursor}) => PostInteractionService.listPostLikes(
        postId,
        limit: 20,
        cursor: cursor,
      ),
      onOpenProfile: (userId) {
        Navigator.of(context).push(
          MaterialPageRoute<void>(
            builder: (_) => ProfileScreen(userId: userId),
          ),
        );
      },
    ),
  );
}

void showCommentLikesSheet(
  BuildContext context, {
  required String postId,
  required String commentId,
  String? viewerId,
  String title = 'Likes',
}) {
  showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _LikesListSheet(
      title: title,
      viewerId: viewerId,
      loadPage: ({String? cursor}) => PostInteractionService.listCommentLikes(
        postId: postId,
        commentId: commentId,
        limit: 20,
        cursor: cursor,
      ),
      onOpenProfile: (userId) {
        Navigator.of(context).push(
          MaterialPageRoute<void>(
            builder: (_) => ProfileScreen(userId: userId),
          ),
        );
      },
    ),
  );
}

class _LikesListSheet extends StatefulWidget {
  const _LikesListSheet({
    required this.title,
    required this.loadPage,
    required this.onOpenProfile,
    this.viewerId,
  });

  final String title;
  final String? viewerId;
  final Future<Map<String, dynamic>> Function({String? cursor}) loadPage;
  final void Function(String userId) onOpenProfile;

  @override
  State<_LikesListSheet> createState() => _LikesListSheetState();
}

class _LikesListSheetState extends State<_LikesListSheet> {
  static const _bg = Color(0xFF0F1829);
  static const _surface = Color(0xFF131F33);
  static const _border = Color(0xFF1E2D48);
  static const _textPrimary = Color(0xFFE8ECF8);
  static const _textSecondary = Color(0xFF7A8BB0);
  static const _accent = Color(0xFF4AA3E4);
  static const _defaultAvatar =
      'https://res.cloudinary.com/doicocgeo/image/upload/v1765850274/user-avatar-default_gfx5bs.jpg';

  final _searchCtrl = TextEditingController();
  final _scrollCtrl = ScrollController();
  final _pendingToggles = <String>{};

  List<LikeUserItem> _items = [];
  String? _nextCursor;
  bool _loading = false;
  bool _loadingMore = false;
  bool _loaded = false;
  String _error = '';

  @override
  void initState() {
    super.initState();
    _scrollCtrl.addListener(_onScroll);
    _loadFirstPage();
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    _scrollCtrl
      ..removeListener(_onScroll)
      ..dispose();
    super.dispose();
  }

  void _onScroll() {
    if (!_scrollCtrl.hasClients) return;
    final pos = _scrollCtrl.position;
    if (pos.pixels >= pos.maxScrollExtent - 280) {
      _loadMore();
    }
  }

  Future<void> _loadFirstPage() async {
    if (_loading) return;
    setState(() {
      _loading = true;
      _error = '';
    });
    try {
      final raw = await widget.loadPage();
      if (!mounted) return;
      final items = ((raw['items'] as List?) ?? const [])
          .whereType<Map>()
          .map((e) => LikeUserItem.fromJson(Map<String, dynamic>.from(e)))
          .where((e) => e.userId.isNotEmpty)
          .toList();
      setState(() {
        _items = items;
        _nextCursor = raw['nextCursor'] as String?;
        _loading = false;
        _loaded = true;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.toString().replaceFirst(RegExp(r'^.*?Exception: '), '');
      });
    }
  }

  Future<void> _loadMore() async {
    if (_loading || _loadingMore) return;
    final cursor = _nextCursor;
    if (cursor == null || cursor.isEmpty) return;
    setState(() => _loadingMore = true);
    try {
      final raw = await widget.loadPage(cursor: cursor);
      if (!mounted) return;
      final items = ((raw['items'] as List?) ?? const [])
          .whereType<Map>()
          .map((e) => LikeUserItem.fromJson(Map<String, dynamic>.from(e)))
          .where((e) => e.userId.isNotEmpty)
          .toList();
      setState(() {
        _items = [..._items, ...items];
        _nextCursor = raw['nextCursor'] as String?;
        _loadingMore = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _loadingMore = false);
    }
  }

  Future<void> _toggleFollow(LikeUserItem item) async {
    if (_pendingToggles.contains(item.userId)) return;
    if (widget.viewerId != null && widget.viewerId == item.userId) return;

    final next = !item.isFollowing;
    setState(() {
      _pendingToggles.add(item.userId);
      for (final u in _items) {
        if (u.userId == item.userId) u.isFollowing = next;
      }
    });

    try {
      if (next) {
        await PostInteractionService.follow(item.userId);
      } else {
        await PostInteractionService.unfollow(item.userId);
      }
    } catch (_) {
      if (!mounted) return;
      setState(() {
        for (final u in _items) {
          if (u.userId == item.userId) u.isFollowing = !next;
        }
      });
    } finally {
      if (!mounted) return;
      setState(() => _pendingToggles.remove(item.userId));
    }
  }

  List<LikeUserItem> get _filtered {
    final query = _searchCtrl.text.trim().toLowerCase();
    if (query.isEmpty) return _items;
    return _items.where((u) {
      return u.username.toLowerCase().contains(query) ||
          u.displayName.toLowerCase().contains(query);
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final h = MediaQuery.of(context).size.height;
    final list = _filtered;

    return Container(
      height: h * 0.82,
      decoration: const BoxDecoration(
        color: _bg,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: Column(
        children: [
          Container(
            height: 52,
            padding: const EdgeInsets.symmetric(horizontal: 14),
            decoration: const BoxDecoration(
              border: Border(bottom: BorderSide(color: _border)),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    widget.title,
                    style: const TextStyle(
                      color: _textPrimary,
                      fontSize: 20,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                GestureDetector(
                  onTap: () => Navigator.of(context).pop(),
                  child: Container(
                    width: 34,
                    height: 34,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: const Color(0xFF1A2740),
                      border: Border.all(
                        color: Colors.white.withValues(alpha: 0.12),
                      ),
                    ),
                    child: const Icon(
                      Icons.close_rounded,
                      size: 20,
                      color: _textPrimary,
                    ),
                  ),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 10),
            child: TextField(
              controller: _searchCtrl,
              onChanged: (_) => setState(() {}),
              style: const TextStyle(color: _textPrimary),
              decoration: InputDecoration(
                hintText: 'Search username',
                hintStyle: const TextStyle(color: _textSecondary),
                prefixIcon: const Icon(
                  Icons.search_rounded,
                  color: _textSecondary,
                ),
                filled: true,
                fillColor: _surface,
                contentPadding: const EdgeInsets.symmetric(vertical: 12),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: _border),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: _border),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: _accent, width: 1.1),
                ),
              ),
            ),
          ),
          Expanded(
            child: _loading && !_loaded
                ? const Center(child: CircularProgressIndicator(color: _accent))
                : _error.isNotEmpty
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 18),
                      child: Text(
                        _error,
                        textAlign: TextAlign.center,
                        style: const TextStyle(color: _textSecondary),
                      ),
                    ),
                  )
                : list.isEmpty
                ? const Center(
                    child: Text(
                      'No likes yet',
                      style: TextStyle(color: _textSecondary),
                    ),
                  )
                : ListView.separated(
                    controller: _scrollCtrl,
                    padding: const EdgeInsets.fromLTRB(10, 4, 10, 16),
                    itemCount: list.length + (_loadingMore ? 1 : 0),
                    separatorBuilder: (_, _) => Divider(
                      color: Colors.white.withValues(alpha: 0.06),
                      height: 1,
                    ),
                    itemBuilder: (context, index) {
                      if (index >= list.length) {
                        return const Padding(
                          padding: EdgeInsets.symmetric(vertical: 14),
                          child: Center(
                            child: SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: _accent,
                              ),
                            ),
                          ),
                        );
                      }
                      final item = list[index];
                      final isSelf =
                          widget.viewerId != null &&
                          widget.viewerId == item.userId;
                      final pending = _pendingToggles.contains(item.userId);

                      return ListTile(
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: 6,
                          vertical: 6,
                        ),
                        onTap: () {
                          Navigator.of(context).pop();
                          widget.onOpenProfile(item.userId);
                        },
                        leading: CircleAvatar(
                          radius: 22,
                          backgroundColor: const Color(0xFF1E2D48),
                          backgroundImage: NetworkImage(
                            item.avatarUrl.isNotEmpty
                                ? item.avatarUrl
                                : _defaultAvatar,
                          ),
                        ),
                        title: Text(
                          item.displayName.isNotEmpty
                              ? item.displayName
                              : item.username,
                          style: const TextStyle(
                            color: _textPrimary,
                            fontSize: 15,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        subtitle: Text(
                          '@${item.username}',
                          style: const TextStyle(
                            color: _textSecondary,
                            fontSize: 13,
                          ),
                        ),
                        trailing: isSelf
                            ? Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 12,
                                  vertical: 8,
                                ),
                                decoration: BoxDecoration(
                                  color: const Color(0xFF6EC1FF),
                                  borderRadius: BorderRadius.circular(999),
                                ),
                                child: const Text(
                                  'You',
                                  style: TextStyle(
                                    color: Color(0xFF082B44),
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                              )
                            : GestureDetector(
                                onTap: pending
                                    ? null
                                    : () => _toggleFollow(item),
                                child: AnimatedContainer(
                                  duration: const Duration(milliseconds: 180),
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 14,
                                    vertical: 8,
                                  ),
                                  decoration: BoxDecoration(
                                    color: item.isFollowing
                                        ? const Color(0xFF1E2D48)
                                        : const Color(0xFF6EC1FF),
                                    borderRadius: BorderRadius.circular(999),
                                  ),
                                  child: Text(
                                    pending
                                        ? '...'
                                        : (item.isFollowing
                                              ? 'Following'
                                              : 'Follow'),
                                    style: TextStyle(
                                      color: item.isFollowing
                                          ? _textPrimary
                                          : const Color(0xFF082B44),
                                      fontWeight: FontWeight.w700,
                                      fontSize: 13,
                                    ),
                                  ),
                                ),
                              ),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}
