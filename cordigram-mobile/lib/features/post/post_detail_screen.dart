import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:http/http.dart' as http;
import 'package:image_picker/image_picker.dart';
import 'package:video_player/video_player.dart';
import 'package:flutter/gestures.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/services/api_service.dart';
import '../../core/services/auth_storage.dart';
import '../../core/widgets/comment_sheet_widgets.dart';
import '../profile/profile_screen.dart';
import '../report/report_comment_sheet.dart';
import '../report/report_post_sheet.dart';
import '../home/models/feed_post.dart';
import '../home/widgets/media_carousel.dart';
import '../home/services/post_interaction_service.dart';
import '../home/widgets/post_card.dart' show PostCard, PostMenuAction;
import 'utils/post_edit_utils.dart';

// ── Comment media data (mirrors web's CommentMedia + local XFile) ─────────────

class _CommentMediaData {
  const _CommentMediaData({
    required this.type,
    this.url,
    this.file,
    this.metadata,
  });

  /// 'image' or 'video'
  final String type;

  /// External URL — used for Giphy GIF / sticker (no upload needed).
  final String? url;

  /// Local file from image_picker — uploaded before the comment is submitted.
  final XFile? file;

  /// Extra metadata forwarded to the backend (provider, giphy id, kind).
  final Map<String, dynamic>? metadata;
}

/// Mirrors web's `replyTarget` state — tracks which comment is being replied to.
class _ReplyTarget {
  const _ReplyTarget({required this.id, this.username});
  final String id;
  final String? username;
}

// ── Models ────────────────────────────────────────────────────────────────────

class CommentLinkPreview {
  const CommentLinkPreview({
    required this.url,
    this.canonicalUrl,
    this.domain,
    this.siteName,
    this.title,
    this.description,
    this.image,
    this.favicon,
  });
  final String url;
  final String? canonicalUrl;
  final String? domain;
  final String? siteName;
  final String? title;
  final String? description;
  final String? image;
  final String? favicon;

  factory CommentLinkPreview.fromJson(Map<String, dynamic> j) =>
      CommentLinkPreview(
        url: (j['url'] as String?) ?? '',
        canonicalUrl: j['canonicalUrl'] as String?,
        domain: j['domain'] as String?,
        siteName: j['siteName'] as String?,
        title: j['title'] as String?,
        description: j['description'] as String?,
        image: j['image'] as String?,
        favicon: j['favicon'] as String?,
      );
}

class CommentAuthor {
  const CommentAuthor({
    this.id,
    this.displayName,
    this.username,
    this.avatarUrl,
    this.isCreatorVerified,
  });
  final String? id;
  final String? displayName;
  final String? username;
  final String? avatarUrl;
  final bool? isCreatorVerified;

  factory CommentAuthor.fromJson(Map<String, dynamic> j) => CommentAuthor(
    id: j['id'] as String?,
    displayName: j['displayName'] as String?,
    username: j['username'] as String?,
    avatarUrl: j['avatarUrl'] as String?,
    isCreatorVerified: j['isCreatorVerified'] as bool?,
  );
}

class CommentItem {
  CommentItem({
    required this.id,
    required this.content,
    this.author,
    this.authorId,
    this.authorIsCreatorVerified,
    this.createdAt,
    this.likesCount,
    this.repliesCount,
    this.parentId,
    this.pinnedAt,
    this.mediaUrl,
    this.mediaType,
    this.liked = false,
    this.linkPreviews = const [],
  });
  final String id;
  final String content;
  final CommentAuthor? author;
  final String? authorId;
  final bool? authorIsCreatorVerified;
  final String? createdAt;
  int? likesCount;
  final int? repliesCount;
  final String? parentId;
  String? pinnedAt;
  final String? mediaUrl;
  final String? mediaType;
  bool liked;
  final List<CommentLinkPreview> linkPreviews;

  factory CommentItem.fromJson(Map<String, dynamic> j) {
    final authorRaw = j['author'];
    final CommentAuthor? author = authorRaw is Map<String, dynamic>
        ? CommentAuthor.fromJson(authorRaw)
        : null;

    // Normalise media URL http→https
    String? mediaUrl =
        (j['media']?['url'] as String?) ??
        (j['media']?['secureUrl'] as String?);
    if (mediaUrl != null && mediaUrl.startsWith('http://')) {
      mediaUrl = 'https://${mediaUrl.substring(7)}';
    }

    return CommentItem(
      id: (j['id'] as String?) ?? '',
      content: (j['content'] as String?) ?? '',
      author: author,
      authorId: j['authorId'] as String?,
      authorIsCreatorVerified: j['authorIsCreatorVerified'] as bool?,
      createdAt: j['createdAt'] as String?,
      likesCount: (j['likesCount'] as num?)?.toInt(),
      repliesCount: (j['repliesCount'] as num?)?.toInt(),
      parentId: j['parentId'] as String?,
      pinnedAt: j['pinnedAt'] as String?,
      mediaUrl: mediaUrl,
      mediaType: j['media']?['type'] as String?,
      liked: (j['liked'] as bool?) ?? false,
      linkPreviews: () {
        final raw = j['linkPreviews'];
        if (raw is List) {
          return raw
              .whereType<Map<String, dynamic>>()
              .map(CommentLinkPreview.fromJson)
              .toList();
        }
        return <CommentLinkPreview>[];
      }(),
    );
  }

  String get displayUsername =>
      (author?.username?.isNotEmpty == true ? '@${author!.username}' : null) ??
      (author?.displayName?.isNotEmpty == true ? author!.displayName! : null) ??
      'User';
  String get displayAvatar => author?.avatarUrl ?? '';
  bool get isVerified =>
      (author?.isCreatorVerified ?? authorIsCreatorVerified) == true;
}

// ── PostDetailScreen ──────────────────────────────────────────────────────────

class PostDetailScreen extends StatefulWidget {
  const PostDetailScreen({
    super.key,
    required this.postId,
    this.initialState,
    this.viewerId,
  });

  /// The post ID to load.
  final String postId;

  /// Optional pre-loaded feed state (avoids a redundant API call when
  /// navigating from the feed).
  final FeedPostState? initialState;

  /// Viewer ID for isSelf detection (passed through to PostCard).
  final String? viewerId;

  @override
  State<PostDetailScreen> createState() => _PostDetailScreenState();
}

class _PostDetailScreenState extends State<PostDetailScreen> {
  // ── Post state ──────────────────────────────────────────────────────────────
  FeedPostState? _postState;
  bool _postLoading = true;
  String? _postError;

  // ── Comments state ──────────────────────────────────────────────────────────
  final List<CommentItem> _comments = [];
  int _commentPage = 1;
  static const int _commentPageSize = 20;
  bool _commentsLoading = false;
  bool _hasMoreComments = true;
  String? _commentsError;

  final ScrollController _scrollController = ScrollController();

  // ── Reply target (mirrors web replyTarget state) ──────────────────────────
  _ReplyTarget? _replyTarget;

  // ── GlobalKey map for all visible tiles (used to inject replies) ─────────
  final Map<String, GlobalKey<_CommentTileState>> _allTileKeys = {};

  // ── Polling (mirrors web COMMENT_POLL_INTERVAL = 4000ms) ─────────────────
  Timer? _pollTimer;
  static const Duration _kPollInterval = Duration(seconds: 4);

  // ── Viewer ID (own user — for comment menu own vs other detection) ─────────
  String? _viewerId;

  static Map<String, String> get _authHeader => {
    'Authorization': 'Bearer ${AuthStorage.accessToken}',
  };

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

  @override
  void initState() {
    super.initState();
    _viewerId = widget.viewerId; // use passed-in value immediately
    if (_viewerId == null) _fetchViewerId(); // fallback if not provided
    if (widget.initialState != null) {
      _postState = widget.initialState;
      _postLoading = false;
    } else {
      _loadPost();
    }
    _loadComments();
    _scrollController.addListener(_onScroll);
    _startPolling();
  }

  /// Fetch viewer ID from the API if not passed in (fallback).
  Future<void> _fetchViewerId() async {
    try {
      final data = await ApiService.get(
        '/profiles/me',
        extraHeaders: _authHeader,
      );
      if (!mounted) return;
      final id = (data['userId'] as String?) ?? (data['id'] as String?);
      if (id != null) setState(() => _viewerId = id);
    } catch (_) {
      // Non-critical — menu will still show, but defaults to "other" options
    }
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    _scrollController.dispose();
    super.dispose();
  }

  void _startPolling() {
    _pollTimer?.cancel();
    _pollTimer = Timer.periodic(_kPollInterval, (_) => _syncComments());
  }

  /// Silently refresh page-1 comments and merge liked/likesCount
  /// without disrupting the user's scroll position.
  Future<void> _syncComments() async {
    if (_comments.isEmpty) return;
    try {
      final data = await ApiService.get(
        '/posts/${widget.postId}/comments?page=1&limit=$_commentPageSize',
        extraHeaders: _authHeader,
      );
      if (!mounted) return;
      final rawItems = data['items'];
      final List<CommentItem> fresh = (rawItems is List)
          ? rawItems
                .whereType<Map<String, dynamic>>()
                .map(CommentItem.fromJson)
                .toList()
          : [];
      if (!mounted) return;
      setState(() {
        for (final c in _comments) {
          final updated = fresh.firstWhere(
            (f) => f.id == c.id,
            orElse: () => c,
          );
          if (updated.id == c.id) {
            c.likesCount = updated.likesCount;
            // Only sync liked from server if the comment has not been
            // optimistically toggled (i.e. server and local agree).
          }
        }
      });
    } catch (_) {
      // Silently ignore polling errors
    }
  }

  void _onScroll() {
    if (_scrollController.position.pixels >=
        _scrollController.position.maxScrollExtent - 300) {
      if (!_commentsLoading && _hasMoreComments) _loadComments();
    }
  }

  // ── Load post detail ────────────────────────────────────────────────────────

  Future<void> _loadPost() async {
    try {
      final data = await ApiService.get(
        '/posts/${widget.postId}',
        extraHeaders: _authHeader,
      );
      if (!mounted) return;
      final post = FeedPost.fromJson(data);
      setState(() {
        _postState = FeedPostState(post: post);
        _postLoading = false;
        _postError = null;
      });
    } catch (e) {
      if (!mounted) return;
      // If we already have initialState fall back to it silently
      if (_postState != null) {
        setState(() => _postLoading = false);
        return;
      }
      setState(() {
        _postError = e.toString();
        _postLoading = false;
      });
    }
  }

  // ── Load comments ───────────────────────────────────────────────────────────

  Future<void> _loadComments({bool refresh = false}) async {
    if (_commentsLoading) return;
    setState(() {
      _commentsLoading = true;
      _commentsError = null;
      if (refresh) {
        _comments.clear();
        _commentPage = 1;
        _hasMoreComments = true;
      }
    });

    try {
      final data = await ApiService.get(
        '/posts/${widget.postId}/comments?page=$_commentPage&limit=$_commentPageSize',
        extraHeaders: _authHeader,
      );
      if (!mounted) return;
      final rawItems = data['items'];
      final List<CommentItem> incoming = (rawItems is List)
          ? rawItems
                .whereType<Map<String, dynamic>>()
                .map(CommentItem.fromJson)
                .toList()
          : [];
      setState(() {
        _comments.addAll(incoming);
        _hasMoreComments = data['hasMore'] == true;
        _commentPage++;
        _commentsLoading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _commentsError = e.toString();
        _commentsLoading = false;
      });
    }
  }

  // ── Follow (optimistic) ────────────────────────────────────────────────────

  void _onFollow(String authorId, bool nextFollow) {
    if (_postState == null) return;
    final prev = _postState!.following;
    setState(() => _postState!.following = nextFollow);
    _callFollowApi(authorId, nextFollow, prev);
  }

  void _openUserProfile(String userId) {
    if (userId.isEmpty) return;
    Navigator.of(context).push(
      MaterialPageRoute<void>(builder: (_) => ProfileScreen(userId: userId)),
    );
  }

  Future<void> _callFollowApi(
    String authorId,
    bool nextFollow,
    bool prev,
  ) async {
    try {
      if (nextFollow) {
        await PostInteractionService.follow(authorId);
      } else {
        await PostInteractionService.unfollow(authorId);
      }
    } catch (_) {
      if (!mounted) return;
      setState(() => _postState!.following = prev);
    }
  }

  // ── Pin comment ───────────────────────────────────────────────────────────────

  void _onCommentPinToggled(String commentId, bool shouldPin) {
    setState(() {
      final now = DateTime.now().toIso8601String();
      for (final c in _comments) {
        if (c.id == commentId) {
          c.pinnedAt = shouldPin ? now : null;
        } else if (shouldPin) {
          c.pinnedAt = null;
        }
      }
      _comments.sort((a, b) {
        if (a.pinnedAt != null && b.pinnedAt == null) return -1;
        if (a.pinnedAt == null && b.pinnedAt != null) return 1;
        return 0;
      });
    });
  }

  // ── Like / Save (optimistic, same as HomeScreen) ────────────────────────────

  void _onLike() {
    if (_postState == null) return;
    final s = _postState!;
    final wasLiked = s.liked;
    final delta = wasLiked ? -1 : 1;
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
    _callLikeApi(wasLiked, delta, s);
  }

  Future<void> _callLikeApi(bool wasLiked, int delta, FeedPostState s) async {
    try {
      if (!wasLiked) {
        await ApiService.post(
          '/posts/${widget.postId}/like',
          extraHeaders: _authHeader,
        );
      } else {
        await ApiService.delete(
          '/posts/${widget.postId}/like',
          extraHeaders: _authHeader,
        );
      }
    } catch (_) {
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

  void _onSave() {
    if (_postState == null) return;
    final s = _postState!;
    final wasSaved = s.saved;
    final delta = wasSaved ? -1 : 1;
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
    _callSaveApi(wasSaved, delta, s);
  }

  Future<void> _callSaveApi(bool wasSaved, int delta, FeedPostState s) async {
    try {
      if (!wasSaved) {
        await PostInteractionService.save(widget.postId);
        _showSnack('Saved');
      } else {
        await PostInteractionService.unsave(widget.postId);
        _showSnack('Removed from saved');
      }
    } catch (_) {
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

  Future<void> _onPostMenuAction(
    PostMenuAction action,
    FeedPostState state,
  ) async {
    final post = state.post;

    switch (action) {
      case PostMenuAction.editPost:
        final updated = await showEditPostSheet(context, post: post);
        if (updated == null || !mounted) return;
        setState(() {
          _postState = state.copyWith(
            post: updated,
            liked: updated.liked ?? state.liked,
            saved: updated.saved ?? state.saved,
            following: updated.following ?? state.following,
            stats: updated.stats,
          );
        });
        _showSnack('Post updated');
        return;
      case PostMenuAction.editVisibility:
        final nextVisibility = await showEditVisibilitySheet(
          context,
          postId: post.id,
          currentVisibility: post.visibility ?? 'public',
        );
        if (nextVisibility == null || !mounted) return;
        setState(() {
          _postState = state.copyWith(
            post: post.copyWith(visibility: nextVisibility),
          );
        });
        _showSnack('Visibility updated');
        return;
      case PostMenuAction.toggleComments:
        final currentAllowed = post.allowComments != false;
        final nextAllowed = !currentAllowed;
        setState(() {
          _postState = state.copyWith(
            post: post.copyWith(allowComments: nextAllowed),
          );
        });
        try {
          await PostInteractionService.setAllowComments(post.id, nextAllowed);
          _showSnack(
            nextAllowed ? 'Comments turned on' : 'Comments turned off',
          );
        } catch (_) {
          if (!mounted) return;
          setState(() {
            _postState = state.copyWith(
              post: post.copyWith(allowComments: currentAllowed),
            );
          });
          _showSnack('Failed to update comments', error: true);
        }
        return;
      case PostMenuAction.toggleHideLike:
        final currentHidden = post.hideLikeCount == true;
        final nextHidden = !currentHidden;
        setState(() {
          _postState = state.copyWith(
            post: post.copyWith(hideLikeCount: nextHidden),
          );
        });
        try {
          await PostInteractionService.setHideLikeCount(post.id, nextHidden);
          _showSnack(nextHidden ? 'Like count hidden' : 'Like count visible');
        } catch (_) {
          if (!mounted) return;
          setState(() {
            _postState = state.copyWith(
              post: post.copyWith(hideLikeCount: currentHidden),
            );
          });
          _showSnack('Failed to update like visibility', error: true);
        }
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
        try {
          await PostInteractionService.deletePost(post.id);
          if (!mounted) return;
          Navigator.of(context).pop();
        } catch (_) {
          _showSnack('Failed to delete post', error: true);
        }
        return;
      case PostMenuAction.followToggle:
        final authorId = post.authorId;
        if (authorId == null || authorId.isEmpty) return;
        _onFollow(authorId, !state.following);
        return;
      case PostMenuAction.saveToggle:
        _onSave();
        return;
      case PostMenuAction.hidePost:
        try {
          await PostInteractionService.hide(post.id);
          if (!mounted) return;
          Navigator.of(context).pop();
        } catch (_) {
          _showSnack('Failed to hide post', error: true);
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
          Navigator.of(context).pop();
        } catch (_) {
          _showSnack('Failed to block account', error: true);
        }
        return;
    }
  }

  // ── Comment submit ────────────────────────────────────────────────────────

  Future<void> _onCommentSubmit({
    required String content,
    _CommentMediaData? media,
    String? parentId,
  }) async {
    final commentsLocked = _postState?.post.allowComments == false;
    if (commentsLocked) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Comments are turned off for this post'),
          backgroundColor: Color(0xFF1A2235),
        ),
      );
      return;
    }

    Map<String, dynamic>? mediaJson;
    if (media != null) {
      if (media.file != null) {
        // Upload file first, then include URL in the comment body
        final uploaded = await ApiService.postMultipart(
          '/posts/${widget.postId}/comments/upload',
          fieldName: 'file',
          filePath: media.file!.path,
          contentType:
              media.file!.mimeType ??
              (media.type == 'video' ? 'video/mp4' : 'image/jpeg'),
          extraHeaders: _authHeader,
        );
        mediaJson = {
          'type': media.type,
          'url': (uploaded['secureUrl'] ?? uploaded['url']) as String?,
        };
      } else {
        // GIF / sticker — pass Giphy URL directly, no upload
        mediaJson = {
          'type': media.type,
          'url': media.url,
          if (media.metadata != null) 'metadata': media.metadata,
        };
      }
    }

    final body = <String, dynamic>{
      if (content.isNotEmpty) 'content': content,
      if (mediaJson != null) 'media': mediaJson,
      if (parentId != null) 'parentId': parentId,
    };

    final result = await ApiService.post(
      '/posts/${widget.postId}/comments',
      body: body,
      extraHeaders: _authHeader,
    );

    final newComment = CommentItem.fromJson(result);
    if (!mounted) return;
    setState(() {
      // Only add root comments to the top-level list
      if (parentId == null) _comments.add(newComment);
      if (_postState != null) {
        _postState!.stats = FeedStats(
          hearts: _postState!.stats.hearts,
          comments: (_postState!.stats.comments + 1).clamp(0, 999999999),
          saves: _postState!.stats.saves,
          reposts: _postState!.stats.reposts,
          views: _postState!.stats.views,
          impressions: _postState!.stats.impressions,
        );
      }
      _replyTarget = null;
    });
    // Inject reply into the parent tile outside our setState to avoid
    // calling setState on a nested widget during our own setState.
    if (parentId != null) {
      _allTileKeys[parentId]?.currentState?.addReply(newComment);
    }
  }

  // ── Build ───────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final commentsLocked = _postState?.post.allowComments == false;

    return Scaffold(
      backgroundColor: const Color(0xFF0B1020),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0D1526),
        elevation: 0,
        scrolledUnderElevation: 0,
        surfaceTintColor: Colors.transparent,
        centerTitle: false,
        title: const Text(
          'Post',
          style: TextStyle(
            color: Color(0xFFE8ECF8),
            fontWeight: FontWeight.w700,
            fontSize: 17,
          ),
        ),
        leading: IconButton(
          icon: const Icon(
            Icons.arrow_back_ios_new_rounded,
            color: Color(0xFF7A8BB0),
            size: 20,
          ),
          onPressed: () => Navigator.of(context).pop(),
        ),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1),
          child: Container(
            height: 1,
            color: Colors.white.withValues(alpha: 0.07),
          ),
        ),
      ),
      body: Column(
        children: [
          Expanded(child: _buildBody()),
          if (commentsLocked)
            Container(
              width: double.infinity,
              color: const Color(0xFF0D1526),
              padding: EdgeInsets.fromLTRB(
                16,
                12,
                16,
                12 + MediaQuery.of(context).viewPadding.bottom,
              ),
              child: const Text(
                'Comments are turned off for this post.',
                style: TextStyle(color: Color(0xFF7A8BB0), fontSize: 13),
                textAlign: TextAlign.center,
              ),
            )
          else
            _CommentInputBar(
              onSubmit: _onCommentSubmit,
              replyTarget: _replyTarget,
              onCancelReply: () => setState(() => _replyTarget = null),
            ),
        ],
      ),
    );
  }

  Widget _buildBody() {
    if (_postLoading && _postState == null) {
      return const Center(
        child: CircularProgressIndicator(color: Color(0xFF4AA3E4)),
      );
    }
    if (_postError != null && _postState == null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(
                Icons.error_outline_rounded,
                size: 48,
                color: Color(0xFF4A5568),
              ),
              const SizedBox(height: 12),
              Text(
                _postError!,
                style: const TextStyle(color: Color(0xFF7A8BB0), fontSize: 14),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: _loadPost,
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF3470A2),
                ),
                child: const Text(
                  'Retry',
                  style: TextStyle(color: Colors.white),
                ),
              ),
            ],
          ),
        ),
      );
    }

    return RefreshIndicator(
      color: const Color(0xFF4AA3E4),
      backgroundColor: const Color(0xFF131929),
      onRefresh: () async {
        await Future.wait([_loadPost(), _loadComments(refresh: true)]);
      },
      child: CustomScrollView(
        controller: _scrollController,
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          // ── Post card ───────────────────────────────────────────────────────
          if (_postState != null)
            SliverToBoxAdapter(
              child: PostCard(
                state: _postState!,
                viewerId: _viewerId,
                fullWidth: true,
                detailMode: true,
                onLike: _onLike,
                onSave: _onSave,
                onFollow: _onFollow,
                onAuthorTap: _openUserProfile,
                onHide: () => Navigator.of(context).pop(),
                onView: () {}, // no-op — already viewed from feed
                onComment: null, // already on the detail page
                onMenuAction: _onPostMenuAction,
              ),
            ),

          // ── Comments divider ────────────────────────────────────────────────
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
              child: Row(
                children: [
                  const Text(
                    'Comments',
                    style: TextStyle(
                      color: Color(0xFFE8ECF8),
                      fontWeight: FontWeight.w700,
                      fontSize: 15,
                    ),
                  ),
                  if (_postState != null) ...[
                    const SizedBox(width: 6),
                    Text(
                      '${_postState!.stats.comments}',
                      style: const TextStyle(
                        color: Color(0xFF7A8BB0),
                        fontSize: 13,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),

          // ── Comment list ────────────────────────────────────────────────────
          if (_comments.isEmpty && !_commentsLoading)
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 20,
                  vertical: 32,
                ),
                child: Column(
                  children: const [
                    Icon(
                      Icons.chat_bubble_outline_rounded,
                      size: 40,
                      color: Color(0xFF4A5568),
                    ),
                    SizedBox(height: 10),
                    Text(
                      'No comments yet.',
                      style: TextStyle(color: Color(0xFF7A8BB0), fontSize: 14),
                    ),
                  ],
                ),
              ),
            )
          else
            SliverList(
              delegate: SliverChildBuilderDelegate((context, i) {
                final c = _comments[i];
                final tileKey = _allTileKeys.putIfAbsent(
                  c.id,
                  () => GlobalKey<_CommentTileState>(),
                );
                return _CommentTile(
                  key: tileKey,
                  comment: c,
                  postId: widget.postId,
                  authHeader: _authHeader,
                  allTileKeys: _allTileKeys,
                  viewerId: _viewerId,
                  postAuthorId: _postState?.post.authorId,
                  onDeleted: () => setState(
                    () => _comments.removeWhere((cm) => cm.id == c.id),
                  ),
                  onReply: (id, username) => setState(
                    () =>
                        _replyTarget = _ReplyTarget(id: id, username: username),
                  ),
                  onPinToggled: _onCommentPinToggled,
                );
              }, childCount: _comments.length),
            ),

          // ── Loading more ────────────────────────────────────────────────────
          if (_commentsLoading)
            const SliverToBoxAdapter(
              child: Padding(
                padding: EdgeInsets.symmetric(vertical: 20),
                child: Center(
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: Color(0xFF4AA3E4),
                  ),
                ),
              ),
            ),

          // ── Error inline ────────────────────────────────────────────────────
          if (_commentsError != null && _comments.isNotEmpty)
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        _commentsError!,
                        style: const TextStyle(
                          color: Color(0xFF7A8BB0),
                          fontSize: 13,
                        ),
                      ),
                    ),
                    TextButton(
                      onPressed: _loadComments,
                      child: const Text(
                        'Retry',
                        style: TextStyle(color: Color(0xFF4AA3E4)),
                      ),
                    ),
                  ],
                ),
              ),
            ),

          // ── End padding (accounts for Android nav bar) ──────────────────────
          SliverToBoxAdapter(
            child: SizedBox(
              height: 32 + MediaQuery.of(context).viewPadding.bottom,
            ),
          ),
        ],
      ),
    );
  }
}

// ── Comment tile ──────────────────────────────────────────────────────────────

/// Mirrors web's `ReplyState` — per-comment lazy reply loading with
/// expand / collapse and page-by-page "Load more replies".
class _CommentTile extends StatefulWidget {
  const _CommentTile({
    super.key,
    required this.comment,
    required this.postId,
    required this.authHeader,
    required this.allTileKeys,
    this.viewerId,
    this.postAuthorId,
    this.onDeleted,
    this.onReply,
    this.onPinToggled,
    this.depth = 0,
  });
  final CommentItem comment;
  final String postId;
  final Map<String, String> authHeader;

  /// Shared map of all visible tile keys — used to inject new replies.
  final Map<String, GlobalKey<_CommentTileState>> allTileKeys;

  /// Viewer's user-id — used to determine own vs other's comment.
  final String? viewerId;

  /// Post author's user-id — for "Author" badge and pin option.
  final String? postAuthorId;

  /// Called after successful delete so the parent can remove this tile.
  final VoidCallback? onDeleted;

  /// Called when user taps Reply: receives (commentId, authorUsername?).
  final void Function(String id, String? username)? onReply;

  /// Called when pin state changes: (commentId, newPinnedState).
  final void Function(String commentId, bool pinned)? onPinToggled;

  /// 0 = root comment, 1+ = reply (one extra level of indent).
  final int depth;

  @override
  State<_CommentTile> createState() => _CommentTileState();
}

class _CommentTileState extends State<_CommentTile> {
  // ── Reply state (mirrors web ReplyState) ─────────────────────────────────
  List<CommentItem> _replies = [];
  int _replyPage = 1;
  bool _hasMore = false;
  bool _loading = false;
  bool _expanded = false;
  bool _textExpanded = false;
  String? _error;

  // ── Comment like state (optimistic) ──────────────────────────────────────
  late bool _liked;
  late int _likesCount;

  // ── Editable content (updated optimistically after edit) ─────────────────
  late String _content;

  // ── URL tap recognizers (disposed in dispose()) ───────────────────────────
  final List<TapGestureRecognizer> _urlRecognizers = [];

  static final _urlRegex = RegExp(
    "https?://[^\\s<>()\\[\\]{}\"']+",
    caseSensitive: false,
  );

  static String _stripTrailing(String url) =>
      url.replaceAll(RegExp(r'[),.;!?]+$'), '');

  List<InlineSpan> _buildContentSpans(String text) {
    for (final r in _urlRecognizers) r.dispose();
    _urlRecognizers.clear();
    const baseStyle = TextStyle(
      color: Color(0xFFCDD5E0),
      fontSize: 14,
      height: 1.45,
    );
    const urlStyle = TextStyle(
      color: Color(0xFF60A5FA),
      fontSize: 14,
      height: 1.45,
      decoration: TextDecoration.underline,
      decorationColor: Color(0xFF60A5FA),
    );
    final spans = <InlineSpan>[];
    int lastEnd = 0;
    for (final match in _urlRegex.allMatches(text)) {
      final rawUrl = match.group(0)!;
      final stripped = _stripTrailing(rawUrl);
      final trailingPunct = rawUrl.substring(stripped.length);
      if (match.start > lastEnd) {
        spans.add(
          TextSpan(
            text: text.substring(lastEnd, match.start),
            style: baseStyle,
          ),
        );
      }
      final rec = TapGestureRecognizer()
        ..onTap = () => launchUrl(
          Uri.parse(stripped),
          mode: LaunchMode.externalApplication,
        );
      _urlRecognizers.add(rec);
      spans.add(TextSpan(text: stripped, style: urlStyle, recognizer: rec));
      if (trailingPunct.isNotEmpty) {
        spans.add(TextSpan(text: trailingPunct, style: baseStyle));
      }
      lastEnd = match.end;
    }
    if (lastEnd < text.length) {
      spans.add(TextSpan(text: text.substring(lastEnd), style: baseStyle));
    }
    if (spans.isEmpty) {
      spans.add(TextSpan(text: text, style: baseStyle));
    }
    return spans;
  }

  @override
  void initState() {
    super.initState();
    _liked = widget.comment.liked;
    _likesCount = widget.comment.likesCount ?? 0;
    _content = widget.comment.content;
  }

  @override
  void dispose() {
    for (final r in _urlRecognizers) r.dispose();
    super.dispose();
  }

  // ── Long-press menu ───────────────────────────────────────────────────────

  bool get _isOwnComment {
    if (widget.viewerId == null) return false;
    return widget.comment.authorId == widget.viewerId ||
        widget.comment.author?.id == widget.viewerId;
  }

  bool get _isPostAuthorComment {
    if (widget.postAuthorId == null) return false;
    return widget.comment.authorId == widget.postAuthorId ||
        widget.comment.author?.id == widget.postAuthorId;
  }

  bool get _isPostOwner {
    if (widget.viewerId == null || widget.postAuthorId == null) return false;
    return widget.viewerId == widget.postAuthorId;
  }

  void _openCommentAuthorProfile() {
    final uid = (widget.comment.author?.id?.isNotEmpty == true)
        ? widget.comment.author!.id!
        : (widget.comment.authorId ?? '');
    if (uid.isEmpty) return;
    Navigator.of(
      context,
    ).push(MaterialPageRoute<void>(builder: (_) => ProfileScreen(userId: uid)));
  }

  Future<void> _onPinComment() async {
    final isPinned = widget.comment.pinnedAt != null;
    widget.onPinToggled?.call(widget.comment.id, !isPinned);
    try {
      if (isPinned) {
        await ApiService.delete(
          '/posts/${widget.postId}/comments/${widget.comment.id}/pin',
          extraHeaders: widget.authHeader,
        );
      } else {
        await ApiService.post(
          '/posts/${widget.postId}/comments/${widget.comment.id}/pin',
          extraHeaders: widget.authHeader,
        );
      }
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(isPinned ? 'Comment unpinned' : 'Comment pinned'),
          backgroundColor: const Color(0xFF1A2235),
          duration: const Duration(seconds: 2),
        ),
      );
    } catch (_) {
      widget.onPinToggled?.call(widget.comment.id, isPinned); // rollback
    }
  }

  void _showCommentMenu() {
    final isReply = widget.depth > 0;
    final actions = <CommentSheetAction>[
      if (_isPostOwner && !isReply)
        CommentSheetAction(
          icon: Icons.push_pin_rounded,
          label: widget.comment.pinnedAt != null
              ? 'Unpin comment'
              : 'Pin comment',
          onTap: _onPinComment,
        ),
      if (_isOwnComment) ...[
        CommentSheetAction(
          icon: Icons.edit_outlined,
          label: 'Edit comment',
          onTap: _onEditComment,
        ),
        CommentSheetAction(
          icon: Icons.delete_outline_rounded,
          label: 'Delete comment',
          onTap: _onDeleteComment,
          danger: true,
        ),
      ] else ...[
        CommentSheetAction(
          icon: Icons.flag_outlined,
          label: 'Report comment',
          onTap: _onReportComment,
        ),
        CommentSheetAction(
          icon: Icons.block_rounded,
          label: 'Block this user',
          onTap: _onBlockUser,
          danger: true,
        ),
      ],
    ];

    showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (_) => CommentActionSheet(actions: actions),
    );
  }

  void _onEditComment() {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => EditCommentSheet(
        initialContent: _content,
        onSubmit: (newContent) async {
          await ApiService.patch(
            '/posts/${widget.postId}/comments/${widget.comment.id}',
            body: {'content': newContent},
            extraHeaders: widget.authHeader,
          );
          if (mounted) setState(() => _content = newContent);
        },
      ),
    );
  }

  Future<void> _onDeleteComment() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF111827),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        title: const Text(
          'Delete comment',
          style: TextStyle(color: Color(0xFFE8ECF8), fontSize: 16),
        ),
        content: const Text(
          'This will permanently delete your comment.',
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
    if (confirmed != true || !mounted) return;
    try {
      await ApiService.delete(
        '/posts/${widget.postId}/comments/${widget.comment.id}',
        extraHeaders: widget.authHeader,
      );
      if (!mounted) return;
      widget.onDeleted?.call();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Comment deleted'),
          backgroundColor: Color(0xFF1A2235),
          duration: Duration(seconds: 2),
        ),
      );
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Failed to delete comment'),
          backgroundColor: Color(0xFFEF4444),
          duration: Duration(seconds: 2),
        ),
      );
    }
  }

  void _onReportComment() {
    showReportCommentSheet(
      context,
      commentId: widget.comment.id,
      authHeader: widget.authHeader,
    ).then((reported) {
      if (!reported || !mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Report submitted'),
          backgroundColor: Color(0xFF1A2235),
          duration: Duration(seconds: 2),
        ),
      );
    });
  }

  Future<void> _onBlockUser() async {
    final userId = widget.comment.author?.id ?? widget.comment.authorId;
    final username =
        widget.comment.author?.username ??
        widget.comment.author?.displayName ??
        'this user';
    if (userId == null) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF111827),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        title: Text(
          'Block $username?',
          style: const TextStyle(color: Color(0xFFE8ECF8), fontSize: 16),
        ),
        content: Text(
          'Blocking @$username will hide their content from you.',
          style: const TextStyle(color: Color(0xFF7A8BB0), fontSize: 14),
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
    if (confirmed != true || !mounted) return;
    try {
      await ApiService.post(
        '/users/$userId/block',
        extraHeaders: widget.authHeader,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Blocked $username'),
          backgroundColor: const Color(0xFF1A2235),
          duration: const Duration(seconds: 2),
        ),
      );
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Failed to block user'),
          backgroundColor: Color(0xFFEF4444),
          duration: Duration(seconds: 2),
        ),
      );
    }
  }

  Future<void> _onLikeComment() async {
    final wasLiked = _liked;
    setState(() {
      _liked = !wasLiked;
      _likesCount = (_likesCount + (wasLiked ? -1 : 1)).clamp(0, 999999999);
    });
    try {
      if (!wasLiked) {
        await ApiService.post(
          '/posts/${widget.postId}/comments/${widget.comment.id}/like',
          extraHeaders: widget.authHeader,
        );
      } else {
        await ApiService.delete(
          '/posts/${widget.postId}/comments/${widget.comment.id}/like',
          extraHeaders: widget.authHeader,
        );
      }
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _liked = wasLiked;
        _likesCount = (_likesCount + (wasLiked ? 1 : -1)).clamp(0, 999999999);
      });
    }
  }

  // ── Load replies (mirrors web loadReplies) ────────────────────────────────
  Future<void> _loadReplies({int nextPage = 1}) async {
    if (_loading) return;
    setState(() {
      _loading = true;
      _expanded = true;
    });
    try {
      final data = await ApiService.get(
        '/posts/${widget.postId}/comments'
        '?page=$nextPage&limit=10&parentId=${widget.comment.id}',
        extraHeaders: widget.authHeader,
      );
      if (!mounted) return;
      final rawItems = data['items'];
      final List<CommentItem> incoming = (rawItems is List)
          ? rawItems
                .whereType<Map<String, dynamic>>()
                .map(CommentItem.fromJson)
                .toList()
          : [];
      setState(() {
        if (nextPage > 1) {
          _replies.addAll(incoming);
        } else {
          _replies = incoming;
        }
        _hasMore = data['hasMore'] == true;
        _replyPage = nextPage;
        _loading = false;
        _error = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.toString();
      });
    }
  }

  /// Inject a newly submitted reply into this tile's list optimistically.
  void addReply(CommentItem reply) {
    setState(() {
      _replies = [..._replies, reply];
      _expanded = true;
    });
  }

  // ── Toggle expand / collapse (mirrors web toggleRepliesVisibility) ────────
  void _toggleReplies() {
    final nextExpanded = !_expanded;
    setState(() => _expanded = nextExpanded);
    if (nextExpanded) {
      final replyCount = widget.comment.repliesCount ?? 0;
      final needsRefresh =
          _replies.isEmpty ||
          (!_loading && (replyCount > _replies.length || _hasMore));
      if (!_loading && needsRefresh) _loadReplies(nextPage: 1);
    }
  }

  @override
  Widget build(BuildContext context) {
    final comment = widget.comment;
    final isPinned = comment.pinnedAt != null;
    final isReply = widget.depth > 0;
    final replyCount = comment.repliesCount ?? 0;
    final displayReplyCount = _replies.length > replyCount
        ? _replies.length
        : replyCount;
    final shouldShowRepliesButton =
        _loading || _hasMore || replyCount > 0 || _replies.isNotEmpty;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // ── Comment body ────────────────────────────────────────────────────
        GestureDetector(
          onLongPress: _showCommentMenu,
          behavior: HitTestBehavior.opaque,
          child: Padding(
            padding: EdgeInsets.fromLTRB(isReply ? 44 : 12, 0, 12, 0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const _CommentDivider(),
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 10),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      GestureDetector(
                        onTap: _openCommentAuthorProfile,
                        child: _CommentAvatar(comment: comment),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            // Header: username + verified + pinned + time
                            Row(
                              children: [
                                GestureDetector(
                                  onTap: _openCommentAuthorProfile,
                                  child: Text(
                                    comment.displayUsername,
                                    style: const TextStyle(
                                      color: Color(0xFFE8ECF8),
                                      fontWeight: FontWeight.w700,
                                      fontSize: 13,
                                    ),
                                  ),
                                ),
                                if (comment.isVerified) ...[
                                  const SizedBox(width: 3),
                                  _MiniVerifiedBadge(),
                                ],
                                if (_isPostAuthorComment) ...[
                                  const SizedBox(width: 5),
                                  const _AuthorBadge(),
                                ],
                                const Spacer(),
                                if (isPinned) ...[
                                  const Icon(
                                    Icons.push_pin_rounded,
                                    size: 12,
                                    color: Color(0xFF7A8BB0),
                                  ),
                                  const SizedBox(width: 3),
                                  const Text(
                                    'Pinned',
                                    style: TextStyle(
                                      color: Color(0xFF7A8BB0),
                                      fontSize: 11,
                                    ),
                                  ),
                                  const SizedBox(width: 6),
                                ],
                                Text(
                                  _timeAgo(comment.createdAt),
                                  style: const TextStyle(
                                    color: Color(0xFF7A8BB0),
                                    fontSize: 11,
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 4),
                            // Content
                            if (_content.isNotEmpty)
                              LayoutBuilder(
                                builder: (context, constraints) {
                                  final tp = TextPainter(
                                    text: TextSpan(
                                      text: _content,
                                      style: const TextStyle(
                                        fontSize: 14,
                                        height: 1.45,
                                      ),
                                    ),
                                    textDirection: TextDirection.ltr,
                                    maxLines: 4,
                                  )..layout(maxWidth: constraints.maxWidth);
                                  final overflows = tp.didExceedMaxLines;
                                  return Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      RichText(
                                        text: TextSpan(
                                          children: _buildContentSpans(
                                            _content,
                                          ),
                                        ),
                                        maxLines: _textExpanded ? null : 4,
                                        overflow: _textExpanded
                                            ? TextOverflow.visible
                                            : TextOverflow.ellipsis,
                                      ),
                                      if (overflows || _textExpanded)
                                        GestureDetector(
                                          onTap: () => setState(
                                            () =>
                                                _textExpanded = !_textExpanded,
                                          ),
                                          child: Padding(
                                            padding: const EdgeInsets.only(
                                              top: 2,
                                            ),
                                            child: Text(
                                              _textExpanded
                                                  ? 'See less'
                                                  : 'See more',
                                              style: const TextStyle(
                                                color: Color(0xFF4AA3E4),
                                                fontSize: 13,
                                                fontWeight: FontWeight.w600,
                                              ),
                                            ),
                                          ),
                                        ),
                                    ],
                                  );
                                },
                              ),
                            // Media
                            if (comment.mediaUrl != null &&
                                comment.mediaUrl!.isNotEmpty) ...[
                              const SizedBox(height: 6),
                              _CommentMedia(
                                url: comment.mediaUrl!,
                                type: comment.mediaType ?? 'image',
                              ),
                            ],
                            // Link previews
                            if (widget.comment.linkPreviews.isNotEmpty) ...[
                              const SizedBox(height: 8),
                              _CommentLinkPreviewList(
                                previews: widget.comment.linkPreviews,
                              ),
                            ],
                            const SizedBox(height: 6),
                            // Footer: likes count + reply button
                            Row(
                              children: [
                                GestureDetector(
                                  onTap: _onLikeComment,
                                  child: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      _IconLike(
                                        size: 13,
                                        filled: _liked,
                                        color: _liked
                                            ? const Color(0xFF2b74b0)
                                            : const Color(0xFF7A8BB0),
                                      ),
                                      const SizedBox(width: 3),
                                      Text(
                                        '$_likesCount',
                                        style: TextStyle(
                                          color: _liked
                                              ? const Color(0xFF2b74b0)
                                              : const Color(0xFF7A8BB0),
                                          fontSize: 12,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                const SizedBox(width: 14),
                                GestureDetector(
                                  onTap: () => widget.onReply?.call(
                                    comment.id,
                                    comment.author?.username,
                                  ),
                                  child: const Text(
                                    'Reply',
                                    style: TextStyle(
                                      color: Color(0xFF7A8BB0),
                                      fontSize: 12,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                            // View / Hide replies toggle
                            if (shouldShowRepliesButton) ...[
                              const SizedBox(height: 7),
                              GestureDetector(
                                onTap: _loading ? null : _toggleReplies,
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Container(
                                      width: 20,
                                      height: 1,
                                      color: const Color(0xFF4A5568),
                                    ),
                                    const SizedBox(width: 7),
                                    if (_loading && _replies.isEmpty)
                                      const SizedBox(
                                        width: 12,
                                        height: 12,
                                        child: CircularProgressIndicator(
                                          strokeWidth: 1.5,
                                          color: Color(0xFF4AA3E4),
                                        ),
                                      )
                                    else
                                      Text(
                                        _expanded
                                            ? 'Hide replies'
                                            : 'View replies'
                                                  '${displayReplyCount > 0 ? " ($displayReplyCount)" : ""}',

                                        style: const TextStyle(
                                          color: Color(0xFF4AA3E4),
                                          fontSize: 12,
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                  ],
                                ),
                              ),
                            ],
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
        // ── Replies list (rendered when expanded) ───────────────────────────
        if (_expanded) ...[
          ..._replies.map((r) {
            final tileKey = widget.allTileKeys.putIfAbsent(
              r.id,
              () => GlobalKey<_CommentTileState>(),
            );
            return _CommentTile(
              key: tileKey,
              comment: r,
              postId: widget.postId,
              authHeader: widget.authHeader,
              depth: widget.depth + 1,
              allTileKeys: widget.allTileKeys,
              viewerId: widget.viewerId,
              postAuthorId: widget.postAuthorId,
              onDeleted: () =>
                  setState(() => _replies.removeWhere((rep) => rep.id == r.id)),
              onReply: widget.onReply,
              onPinToggled: widget.onPinToggled,
            );
          }),
          // "Load more replies" row
          if (_hasMore)
            Padding(
              padding: const EdgeInsets.fromLTRB(44, 2, 12, 6),
              child: GestureDetector(
                onTap: _loading
                    ? null
                    : () => _loadReplies(nextPage: _replyPage + 1),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 20,
                      height: 1,
                      color: const Color(0xFF4A5568),
                    ),
                    const SizedBox(width: 7),
                    _loading
                        ? const SizedBox(
                            width: 12,
                            height: 12,
                            child: CircularProgressIndicator(
                              strokeWidth: 1.5,
                              color: Color(0xFF4AA3E4),
                            ),
                          )
                        : const Text(
                            'Load more replies',
                            style: TextStyle(
                              color: Color(0xFF4AA3E4),
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                  ],
                ),
              ),
            ),
          // Loading indicator while paginating
          if (_loading && _replies.isNotEmpty)
            const Padding(
              padding: EdgeInsets.fromLTRB(44, 2, 12, 8),
              child: SizedBox(
                width: 14,
                height: 14,
                child: CircularProgressIndicator(
                  strokeWidth: 1.5,
                  color: Color(0xFF4AA3E4),
                ),
              ),
            ),
          // Error row
          if (_error != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(44, 2, 12, 6),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      _error!,
                      style: const TextStyle(
                        color: Color(0xFFEF4444),
                        fontSize: 11,
                      ),
                    ),
                  ),
                  GestureDetector(
                    onTap: () => _loadReplies(nextPage: 1),
                    child: const Text(
                      'Retry',
                      style: TextStyle(
                        color: Color(0xFF4AA3E4),
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
            ),
        ],
      ],
    );
  }

  static String _timeAgo(String? iso) {
    if (iso == null || iso.isEmpty) return '';
    try {
      final dt = DateTime.parse(iso).toLocal();
      final diff = DateTime.now().difference(dt);
      if (diff.isNegative) return 'just now';
      final mins = (diff.inSeconds / 60).round();
      if (mins < 1) return 'just now';
      if (mins < 2) return '1 minute ago';
      if (mins < 45) return '$mins minutes ago';
      if (mins < 90) return 'about 1 hour ago';
      if (mins < 1440) return 'about ${(mins / 60).round()} hours ago';
      if (mins < 2520) return '1 day ago';
      if (mins < 43200) return '${(mins / 1440).round()} days ago';
      if (mins < 86400) return 'about ${(mins / 43200).round()} months ago';
      const int minsPerYear = 525960;
      if (mins < minsPerYear) return '${(mins / 43200).round()} months ago';
      final months = (mins / 43200).round();
      if (months < 15) return 'about 1 year ago';
      if (months < 21) return 'over 1 year ago';
      if (months < 24) return 'almost 2 years ago';
      final years = months ~/ 12;
      final rem = months % 12;
      if (rem < 3) return 'about $years years ago';
      if (rem < 9) return 'over $years years ago';
      return 'almost ${years + 1} years ago';
    } catch (_) {
      return '';
    }
  }
}

class _CommentDivider extends StatelessWidget {
  const _CommentDivider();

  @override
  Widget build(BuildContext context) {
    return Divider(
      height: 1,
      thickness: 1,
      color: Colors.white.withValues(alpha: 0.06),
    );
  }
}

class _CommentAvatar extends StatelessWidget {
  const _CommentAvatar({required this.comment});
  final CommentItem comment;

  @override
  Widget build(BuildContext context) {
    final url = comment.displayAvatar;
    final initials =
        (comment.author?.displayName ?? comment.author?.username ?? '?')
            .isNotEmpty
        ? (comment.author?.displayName ?? comment.author?.username ?? '?')[0]
              .toUpperCase()
        : '?';

    if (url.isNotEmpty) {
      return ClipOval(
        child: Image.network(
          url,
          width: 34,
          height: 34,
          fit: BoxFit.cover,
          errorBuilder: (_, __, ___) => _Initials(initial: initials, size: 34),
        ),
      );
    }
    return _Initials(initial: initials, size: 34);
  }
}

class _Initials extends StatelessWidget {
  const _Initials({required this.initial, required this.size});
  final String initial;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: const BoxDecoration(
        shape: BoxShape.circle,
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF7C3AED), Color(0xFF22D3EE)],
        ),
      ),
      child: Center(
        child: Text(
          initial,
          style: TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.w700,
            fontSize: size * 0.38,
          ),
        ),
      ),
    );
  }
}

// ── Thumbs-up like icon (mirrors web's IconLike SVG) ─────────────────────────

class _IconLike extends StatelessWidget {
  const _IconLike({
    required this.size,
    required this.filled,
    required this.color,
  });
  final double size;
  final bool filled;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      size: Size(size, size),
      painter: _LikePainter(filled: filled, color: color),
    );
  }
}

class _LikePainter extends CustomPainter {
  const _LikePainter({required this.filled, required this.color});
  final bool filled;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final Paint stroke = Paint()
      ..color = color
      ..strokeWidth = size.width * 0.067
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;

    final Paint fill = Paint()
      ..color = color
      ..style = PaintingStyle.fill;

    final double w = size.width;
    final double h = size.height;

    // Scale from 24×24 viewBox
    final double sx = w / 24;
    final double sy = h / 24;

    // Thumb body path (matches web SVG)
    final Path body = Path()
      ..moveTo(6 * sx, 10 * sy)
      ..lineTo(9.2 * sx, 10 * sy)
      ..lineTo(9.2 * sx, 6.6 * sy)
      ..cubicTo(9.2 * sx, 5.47 * sy, 10.12 * sx, 4.5 * sy, 11.3 * sx, 4.5 * sy)
      ..cubicTo(
        11.76 * sx,
        4.5 * sy,
        12.21 * sx,
        4.66 * sy,
        12.57 * sx,
        4.95 * sy,
      )
      ..lineTo(12.79 * sx, 5.13 * sy)
      ..cubicTo(
        13.11 * sx,
        5.39 * sy,
        13.3 * sx,
        5.79 * sy,
        13.3 * sx,
        6.2 * sy,
      )
      ..lineTo(13.3 * sx, 10 * sy)
      ..lineTo(16.9 * sx, 10 * sy)
      ..cubicTo(
        17.9 * sx,
        10 * sy,
        18.7 * sx,
        10.78 * sy,
        18.87 * sx,
        11.65 * sy,
      )
      ..lineTo(17.87 * sx, 16.95 * sy)
      ..cubicTo(
        17.66 * sx,
        18 * sy,
        16.72 * sx,
        18.8 * sy,
        15.43 * sx,
        18.8 * sy,
      )
      // Was 20
      ..lineTo(8.2 * sx, 18.8 * sy)
      ..cubicTo(7.0 * sx, 18.8 * sy, 6 * sx, 17.8 * sy, 6 * sx, 17.6 * sy)
      ..close();

    // Base bar path
    final Path base = Path()
      ..moveTo(4 * sx, 10 * sy)
      ..lineTo(6 * sx, 10 * sy)
      ..lineTo(6 * sx, 20 * sy)
      ..lineTo(4 * sx, 20 * sy)
      ..cubicTo(3.45 * sx, 20 * sy, 3 * sx, 19.55 * sy, 3 * sx, 19 * sy)
      ..lineTo(3 * sx, 11 * sy)
      ..cubicTo(3 * sx, 10.45 * sy, 3.45 * sx, 10 * sy, 4 * sx, 10 * sy)
      ..close();

    if (filled) {
      canvas.drawPath(body, fill);
      canvas.drawPath(base, fill);
    }
    canvas.drawPath(body, stroke);
    canvas.drawPath(base, stroke);
  }

  @override
  bool shouldRepaint(_LikePainter old) =>
      old.filled != filled || old.color != color;
}

class _MiniVerifiedBadge extends StatelessWidget {
  static const _svg =
      '<svg width="13" height="13" viewBox="0 0 20 20" fill="none" '
      'xmlns="http://www.w3.org/2000/svg">'
      '<defs><linearGradient id="vbm" x1="0" y1="0" x2="1" y2="1" '
      'gradientUnits="objectBoundingBox">'
      '<stop stop-color="#52B6FF"/>'
      '<stop offset="1" stop-color="#1570EF"/>'
      '</linearGradient></defs>'
      '<path d="M10 1.5 12 2.9 14.3 2.9 15.5 5 17.6 6.2 17.6 8.6 18.9 10.5 '
      '17.6 12.5 17.6 14.9 15.5 16.1 14.3 18.2 12 18.2 10 19.5 8 18.2 '
      '5.7 18.2 4.5 16.1 2.4 14.9 2.4 12.5 1.1 10.5 2.4 8.6 2.4 6.2 '
      '4.5 5 5.7 2.9 8 2.9Z" fill="url(#vbm)"/>'
      '<path d="M6.8 10.3 9.1 12.6 13.6 8.1" stroke="#fff" '
      'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>'
      '</svg>';

  @override
  Widget build(BuildContext context) {
    return SvgPicture.string(_svg, width: 13, height: 13);
  }
}

class _AuthorBadge extends StatelessWidget {
  const _AuthorBadge();

  // Crown SVG matching web PostView.tsx
  static const _svg =
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" '
      'xmlns="http://www.w3.org/2000/svg">'
      '<path d="M4 9l4 3 4-6 4 6 4-3-2 9H6l-2-9Z" '
      'stroke="#38bdf8" stroke-width="1.6" stroke-linejoin="round"/>'
      '<path d="M7 20h10" stroke="#38bdf8" stroke-width="1.6" '
      'stroke-linecap="round"/>'
      '</svg>';

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
      decoration: BoxDecoration(
        color: const Color(0xFF38BDF8).withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          SvgPicture.string(_svg, width: 11, height: 11),
          const SizedBox(width: 3),
          const Text(
            'Author',
            style: TextStyle(
              color: Color(0xFF38BDF8),
              fontSize: 11,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

// ── Comment link-preview cards (mirrors web commentLinkPreview* styles) ──────

class _CommentLinkPreviewList extends StatelessWidget {
  const _CommentLinkPreviewList({required this.previews});
  final List<CommentLinkPreview> previews;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: previews
          .take(3)
          .map(
            (p) => Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: _CommentLinkPreviewCard(preview: p),
            ),
          )
          .toList(),
    );
  }
}

class _CommentLinkPreviewCard extends StatelessWidget {
  const _CommentLinkPreviewCard({required this.preview});
  final CommentLinkPreview preview;

  @override
  Widget build(BuildContext context) {
    final href = preview.canonicalUrl?.trim().isNotEmpty == true
        ? preview.canonicalUrl!.trim()
        : preview.url.trim();
    final title = preview.title?.trim().isNotEmpty == true
        ? preview.title!.trim()
        : preview.siteName?.trim().isNotEmpty == true
        ? preview.siteName!.trim()
        : preview.domain?.trim() ?? 'Open link';
    final subtitle = preview.description?.trim().isNotEmpty == true
        ? preview.description!.trim()
        : preview.domain?.trim() ?? '';
    final domain =
        preview.domain ??
        (() {
          try {
            return Uri.parse(href).host;
          } catch (_) {
            return '';
          }
        }());

    return GestureDetector(
      onTap: () =>
          launchUrl(Uri.parse(href), mode: LaunchMode.externalApplication),
      child: Container(
        constraints: const BoxConstraints(maxWidth: 340),
        decoration: BoxDecoration(
          color: const Color(0xFFFFFFFF).withValues(alpha: 0.03),
          border: Border.all(
            color: const Color(0xFFFFFFFF).withValues(alpha: 0.12),
          ),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Thumbnail (88×88)
            ClipRRect(
              borderRadius: const BorderRadius.horizontal(
                left: Radius.circular(11),
              ),
              child: preview.image?.isNotEmpty == true
                  ? Image.network(
                      preview.image!,
                      width: 88,
                      height: 88,
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) =>
                          _LinkPreviewFallback(favicon: preview.favicon),
                    )
                  : _LinkPreviewFallback(favicon: preview.favicon),
            ),
            // Body
            Expanded(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(10, 8, 10, 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: Color(0xFFE5E7EB),
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        height: 1.35,
                      ),
                    ),
                    if (subtitle.isNotEmpty) ...[
                      const SizedBox(height: 3),
                      Text(
                        subtitle,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: Color(0xFF94A3B8),
                          fontSize: 12,
                          height: 1.35,
                        ),
                      ),
                    ],
                    const SizedBox(height: 4),
                    Text(
                      domain,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: Color(0xFF93C5FD),
                        fontSize: 11,
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
  }
}

class _LinkPreviewFallback extends StatelessWidget {
  const _LinkPreviewFallback({this.favicon});
  final String? favicon;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 88,
      height: 88,
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF111827), Color(0xFF1F2937)],
        ),
      ),
      alignment: Alignment.center,
      child: favicon?.isNotEmpty == true
          ? Image.network(
              favicon!,
              width: 24,
              height: 24,
              errorBuilder: (_, __, ___) =>
                  const Icon(Icons.link, color: Color(0xFF4A5568), size: 24),
            )
          : const Icon(Icons.link, color: Color(0xFF4A5568), size: 24),
    );
  }
}

class _CommentMedia extends StatefulWidget {
  const _CommentMedia({required this.url, required this.type});
  final String url;
  final String type;

  @override
  State<_CommentMedia> createState() => _CommentMediaState();
}

class _CommentMediaState extends State<_CommentMedia> {
  VideoPlayerController? _controller;
  bool _videoInitialized = false;

  bool get _isGiphy =>
      widget.type == 'gif' ||
      widget.type == 'sticker' ||
      widget.url.contains('giphy.com');

  @override
  void initState() {
    super.initState();
    if (widget.type == 'video') {
      _controller = VideoPlayerController.networkUrl(Uri.parse(widget.url))
        ..initialize().then((_) {
          if (mounted) setState(() => _videoInitialized = true);
        });
    }
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.type == 'video') {
      final aspectRatio = _videoInitialized
          ? _controller!.value.aspectRatio
          : 16 / 9;
      return GestureDetector(
        onTap: () => Navigator.of(
          context,
        ).push(_CommentVideoOverlayRoute(url: widget.url)),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 320, maxHeight: 280),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: AspectRatio(
              aspectRatio: aspectRatio,
              child: Stack(
                alignment: Alignment.center,
                children: [
                  if (_videoInitialized)
                    VideoPlayer(_controller!)
                  else
                    Container(color: const Color(0xFF0B1220)),
                  Container(
                    width: 48,
                    height: 48,
                    decoration: BoxDecoration(
                      color: Colors.black.withValues(alpha: 0.55),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(
                      Icons.play_arrow_rounded,
                      color: Colors.white,
                      size: 30,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    }

    final double maxW = _isGiphy ? 200 : 320;
    final double maxH = _isGiphy ? 180 : 280;
    final BoxFit fit = _isGiphy ? BoxFit.contain : BoxFit.cover;

    // GIF/sticker: no overlay (animated, not zoomable)
    if (_isGiphy) {
      return ConstrainedBox(
        constraints: BoxConstraints(maxWidth: maxW, maxHeight: maxH),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(12),
          child: Image.network(
            widget.url,
            fit: fit,
            errorBuilder: (_, __, ___) => const SizedBox.shrink(),
          ),
        ),
      );
    }

    // Image: tap opens fullscreen zoomable viewer
    return GestureDetector(
      onTap: () =>
          Navigator.of(context).push(_CommentImageViewerRoute(url: widget.url)),
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: maxW, maxHeight: maxH),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(12),
          child: Image.network(
            widget.url,
            fit: fit,
            errorBuilder: (_, __, ___) => const SizedBox.shrink(),
          ),
        ),
      ),
    );
  }
}

// ── Comment input bar ─────────────────────────────────────────────────────────

class _CommentInputBar extends StatefulWidget {
  const _CommentInputBar({
    required this.onSubmit,
    this.replyTarget,
    this.onCancelReply,
  });

  /// Parent provides upload + API logic; bar hands content, media, parentId.
  final Future<void> Function({
    required String content,
    _CommentMediaData? media,
    String? parentId,
  })
  onSubmit;

  /// When non-null, show "Replying to @username" banner.
  final _ReplyTarget? replyTarget;

  /// Called when user taps × on the reply banner.
  final VoidCallback? onCancelReply;

  @override
  State<_CommentInputBar> createState() => _CommentInputBarState();
}

class _CommentInputBarState extends State<_CommentInputBar> {
  final _textCtrl = TextEditingController();
  final _focusNode = FocusNode();
  _CommentMediaData? _media;
  bool _sending = false;

  @override
  void didUpdateWidget(_CommentInputBar old) {
    super.didUpdateWidget(old);
    // Auto-focus text field when a reply target is newly set
    if (widget.replyTarget != null && old.replyTarget == null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _focusNode.requestFocus();
      });
    }
  }

  @override
  void dispose() {
    _textCtrl.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  Future<void> _pickMedia() async {
    final picker = ImagePicker();
    final picked = await picker.pickMedia();
    if (picked == null || !mounted) return;
    final isVideo =
        picked.mimeType?.startsWith('video/') == true ||
        picked.path.toLowerCase().endsWith('.mp4') ||
        picked.path.toLowerCase().endsWith('.mov');
    setState(() {
      _media = _CommentMediaData(
        type: isVideo ? 'video' : 'image',
        file: picked,
      );
    });
  }

  Future<void> _openGiphy(String mode) async {
    final result = await showModalBottomSheet<_CommentMediaData>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _GiphyPickerSheet(mode: mode),
    );
    if (result != null && mounted) setState(() => _media = result);
  }

  Future<void> _send() async {
    final text = _textCtrl.text.trim();
    if (text.isEmpty && _media == null) return;
    if (_sending) return;
    setState(() => _sending = true);
    try {
      await widget.onSubmit(
        content: text,
        media: _media,
        parentId: widget.replyTarget?.id,
      );
      if (!mounted) return;
      _textCtrl.clear();
      setState(() {
        _media = null;
        _sending = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _sending = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Failed to post comment: $e'),
          backgroundColor: const Color(0xFF1A2235),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.of(context).viewPadding.bottom;
    final hasContent = _textCtrl.text.trim().isNotEmpty || _media != null;

    return Container(
      color: const Color(0xFF0D1526),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Top divider
          Container(height: 1, color: Colors.white.withValues(alpha: 0.07)),
          // Reply banner
          if (widget.replyTarget != null)
            Container(
              color: const Color(0xFF131929),
              padding: const EdgeInsets.fromLTRB(14, 6, 8, 6),
              child: Row(
                children: [
                  const Icon(
                    Icons.reply_rounded,
                    size: 14,
                    color: Color(0xFF4AA3E4),
                  ),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      'Replying to @${widget.replyTarget!.username ?? 'user'}',
                      style: const TextStyle(
                        color: Color(0xFF4AA3E4),
                        fontSize: 12,
                      ),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  GestureDetector(
                    onTap: widget.onCancelReply,
                    child: const Padding(
                      padding: EdgeInsets.all(4),
                      child: Icon(
                        Icons.close_rounded,
                        size: 16,
                        color: Color(0xFF7A8BB0),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          // Media preview
          if (_media != null)
            _MediaPreview(
              media: _media!,
              onRemove: () => setState(() => _media = null),
            ),
          // Input row
          Padding(
            padding: EdgeInsets.fromLTRB(12, 8, 12, 8 + bottomInset),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                Expanded(
                  child: Container(
                    decoration: BoxDecoration(
                      color: const Color(0xFF1A2235),
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(
                        color: Colors.white.withValues(alpha: 0.08),
                      ),
                    ),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.center,
                      children: [
                        Expanded(
                          child: TextField(
                            controller: _textCtrl,
                            focusNode: _focusNode,
                            onChanged: (_) => setState(() {}),
                            maxLines: 4,
                            minLines: 1,
                            style: const TextStyle(
                              color: Color(0xFFE8ECF8),
                              fontSize: 14,
                            ),
                            decoration: const InputDecoration(
                              hintText: 'Write a comment…',
                              hintStyle: TextStyle(
                                color: Color(0xFF4A5568),
                                fontSize: 14,
                              ),
                              contentPadding: EdgeInsets.symmetric(
                                horizontal: 14,
                                vertical: 10,
                              ),
                              border: InputBorder.none,
                            ),
                          ),
                        ),
                        // Image / video picker
                        SizedBox(
                          width: 28,
                          height: 28,
                          child: IconButton(
                            icon: const Icon(
                              Icons.image_outlined,
                              color: Color(0xFF7A8BB0),
                              size: 17,
                            ),
                            onPressed: _sending ? null : _pickMedia,
                            padding: EdgeInsets.zero,
                          ),
                        ),
                        const SizedBox(width: 2),
                        // GIF button
                        GestureDetector(
                          onTap: _sending ? null : () => _openGiphy('gif'),
                          child: SizedBox(
                            width: 28,
                            height: 28,
                            child: Center(
                              child: Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 4,
                                  vertical: 2,
                                ),
                                decoration: BoxDecoration(
                                  border: Border.all(
                                    color: const Color(0xFF4AA3E4),
                                    width: 1.2,
                                  ),
                                  borderRadius: BorderRadius.circular(3),
                                ),
                                child: const Text(
                                  'GIF',
                                  style: TextStyle(
                                    color: Color(0xFF4AA3E4),
                                    fontSize: 9,
                                    fontWeight: FontWeight.w700,
                                    height: 1,
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 2),
                        // Sticker button
                        SizedBox(
                          width: 28,
                          height: 28,
                          child: IconButton(
                            icon: const Icon(
                              Icons.emoji_emotions_outlined,
                              color: Color(0xFF7A8BB0),
                              size: 17,
                            ),
                            onPressed: _sending
                                ? null
                                : () => _openGiphy('sticker'),
                            padding: EdgeInsets.zero,
                          ),
                        ),
                        const SizedBox(width: 6),
                      ],
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                // Send button
                GestureDetector(
                  onTap: (hasContent && !_sending) ? _send : null,
                  child: Container(
                    width: 38,
                    height: 38,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: hasContent && !_sending
                          ? const Color(0xFF3470A2)
                          : const Color(0xFF1A2235),
                    ),
                    child: _sending
                        ? const Padding(
                            padding: EdgeInsets.all(10),
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : Icon(
                            Icons.send_rounded,
                            color: hasContent
                                ? Colors.white
                                : const Color(0xFF4A5568),
                            size: 18,
                          ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ── Media preview chip in the input bar ───────────────────────────────────────

class _MediaPreview extends StatelessWidget {
  const _MediaPreview({required this.media, required this.onRemove});
  final _CommentMediaData media;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final bool isVideo = media.type == 'video';

    Widget thumb;
    if (isVideo) {
      // Video local file — show dark box + play icon (no thumbnail package)
      thumb = Container(
        width: 80,
        height: 80,
        decoration: BoxDecoration(
          color: const Color(0xFF0B1220),
          borderRadius: BorderRadius.circular(8),
        ),
        child: const Center(
          child: Icon(
            Icons.play_circle_fill_rounded,
            color: Color(0xFF4AA3E4),
            size: 32,
          ),
        ),
      );
    } else if (media.file != null) {
      thumb = ClipRRect(
        borderRadius: BorderRadius.circular(8),
        child: Image.file(
          File(media.file!.path),
          width: 80,
          height: 80,
          fit: BoxFit.cover,
        ),
      );
    } else {
      thumb = ClipRRect(
        borderRadius: BorderRadius.circular(8),
        child: Image.network(
          media.url!,
          width: 80,
          height: 80,
          fit: BoxFit.cover,
          errorBuilder: (_, __, ___) =>
              Container(width: 80, height: 80, color: const Color(0xFF1A2235)),
        ),
      );
    }

    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
      child: Align(
        alignment: Alignment.centerLeft,
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            thumb,
            Positioned(
              top: -4,
              right: -4,
              child: GestureDetector(
                onTap: onRemove,
                child: Container(
                  width: 20,
                  height: 20,
                  decoration: BoxDecoration(
                    color: const Color(0xFF0D1526),
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: Colors.white.withValues(alpha: 0.25),
                    ),
                  ),
                  child: const Icon(Icons.close, color: Colors.white, size: 12),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Comment image fullscreen viewer ──────────────────────────────────────────

class _CommentImageViewerRoute extends PageRoute<void> {
  _CommentImageViewerRoute({required this.url}) : super(fullscreenDialog: true);
  final String url;

  @override
  Color get barrierColor => Colors.transparent;
  @override
  bool get barrierDismissible => false;
  @override
  String? get barrierLabel => null;
  @override
  bool get maintainState => true;
  @override
  Duration get transitionDuration => const Duration(milliseconds: 180);

  @override
  Widget buildPage(
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
  ) {
    return FadeTransition(
      opacity: animation,
      child: _CommentImageViewerOverlay(url: url),
    );
  }
}

class _CommentImageViewerOverlay extends StatefulWidget {
  const _CommentImageViewerOverlay({required this.url});
  final String url;
  @override
  State<_CommentImageViewerOverlay> createState() =>
      _CommentImageViewerOverlayState();
}

class _CommentImageViewerOverlayState
    extends State<_CommentImageViewerOverlay> {
  @override
  void initState() {
    super.initState();
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
  }

  @override
  void dispose() {
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: GestureDetector(
        onTap: () => Navigator.of(context).pop(),
        child: Container(
          color: const Color(0xC7030712),
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 6, sigmaY: 6),
            child: Stack(
              children: [
                Center(
                  child: GestureDetector(
                    onTap: () {}, // stop propagation
                    child: SafeArea(
                      child: Padding(
                        padding: const EdgeInsets.all(24),
                        child: _CommentZoomableImage(url: widget.url),
                      ),
                    ),
                  ),
                ),
                Positioned(
                  top: MediaQuery.of(context).padding.top + 12,
                  right: 18,
                  child: GestureDetector(
                    onTap: () => Navigator.of(context).pop(),
                    child: Container(
                      width: 36,
                      height: 36,
                      decoration: BoxDecoration(
                        color: Colors.black.withValues(alpha: 0.55),
                        shape: BoxShape.circle,
                      ),
                      child: const Center(
                        child: Text(
                          '×',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 26,
                            height: 1,
                          ),
                        ),
                      ),
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
}

class _CommentZoomableImage extends StatefulWidget {
  const _CommentZoomableImage({required this.url});
  final String url;
  @override
  State<_CommentZoomableImage> createState() => _CommentZoomableImageState();
}

class _CommentZoomableImageState extends State<_CommentZoomableImage> {
  final TransformationController _transformCtrl = TransformationController();

  @override
  void dispose() {
    _transformCtrl.dispose();
    super.dispose();
  }

  void _onInteractionEnd(ScaleEndDetails _) {
    final scale = _transformCtrl.value.getMaxScaleOnAxis();
    if (scale < 1.0) _transformCtrl.value = Matrix4.identity();
  }

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(16),
      child: InteractiveViewer(
        transformationController: _transformCtrl,
        minScale: 1.0,
        maxScale: 4.0,
        clipBehavior: Clip.none,
        onInteractionEnd: _onInteractionEnd,
        child: Image.network(
          widget.url,
          fit: BoxFit.contain,
          errorBuilder: (_, __, ___) => Container(
            color: const Color(0xFF1A2235),
            child: const Center(
              child: Icon(
                Icons.broken_image_outlined,
                color: Color(0xFF4A5568),
                size: 56,
              ),
            ),
          ),
          loadingBuilder: (_, child, progress) {
            if (progress == null) return child;
            return const Center(
              child: SizedBox(
                width: 48,
                height: 48,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: Color(0xFF4AA3E4),
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}

// ── Comment video fullscreen overlay ─────────────────────────────────────────

class _CommentVideoOverlayRoute extends PageRoute<void> {
  _CommentVideoOverlayRoute({required this.url})
    : super(fullscreenDialog: true);
  final String url;

  @override
  Color get barrierColor => Colors.transparent;
  @override
  bool get barrierDismissible => false;
  @override
  String? get barrierLabel => null;
  @override
  bool get maintainState => true;
  @override
  Duration get transitionDuration => const Duration(milliseconds: 180);

  @override
  Widget buildPage(
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
  ) {
    return FadeTransition(
      opacity: animation,
      child: _CommentVideoOverlay(url: url),
    );
  }
}

class _CommentVideoOverlay extends StatefulWidget {
  const _CommentVideoOverlay({required this.url});
  final String url;
  @override
  State<_CommentVideoOverlay> createState() => _CommentVideoOverlayState();
}

class _CommentVideoOverlayState extends State<_CommentVideoOverlay> {
  late final VideoPlayerController _ctrl;
  bool _initialized = false;
  bool _showControls = true;
  Timer? _hideTimer;

  @override
  void initState() {
    super.initState();
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
    _ctrl = VideoPlayerController.networkUrl(Uri.parse(widget.url))
      ..initialize().then((_) {
        if (!mounted) return;
        setState(() => _initialized = true);
        _ctrl.play();
        _scheduleHideControls();
      });
    _ctrl.addListener(() {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _hideTimer?.cancel();
    _ctrl.dispose();
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    super.dispose();
  }

  void _scheduleHideControls() {
    _hideTimer?.cancel();
    _hideTimer = Timer(const Duration(seconds: 3), () {
      if (mounted && _ctrl.value.isPlaying) {
        setState(() => _showControls = false);
      }
    });
  }

  void _togglePlayPause() {
    setState(() => _showControls = true);
    if (_ctrl.value.isPlaying) {
      _ctrl.pause();
      _hideTimer?.cancel();
    } else {
      _ctrl.play();
      _scheduleHideControls();
    }
  }

  void _onTapVideo() {
    setState(() => _showControls = !_showControls);
    if (_showControls && _ctrl.value.isPlaying) _scheduleHideControls();
  }

  String _formatDuration(Duration d) {
    final mm = d.inMinutes.remainder(60).toString().padLeft(2, '0');
    final ss = d.inSeconds.remainder(60).toString().padLeft(2, '0');
    return '$mm:$ss';
  }

  @override
  Widget build(BuildContext context) {
    final position = _initialized ? _ctrl.value.position : Duration.zero;
    final duration = _initialized ? _ctrl.value.duration : Duration.zero;
    final progress = duration.inMilliseconds > 0
        ? position.inMilliseconds / duration.inMilliseconds
        : 0.0;

    return Material(
      color: Colors.black,
      child: Stack(
        children: [
          // ── Video ──────────────────────────────────────────────────────
          GestureDetector(
            onTap: _onTapVideo,
            child: Center(
              child: _initialized
                  ? AspectRatio(
                      aspectRatio: _ctrl.value.aspectRatio,
                      child: VideoPlayer(_ctrl),
                    )
                  : const CircularProgressIndicator(color: Color(0xFF4AA3E4)),
            ),
          ),

          // ── Controls overlay ───────────────────────────────────────────
          AnimatedOpacity(
            opacity: _showControls ? 1.0 : 0.0,
            duration: const Duration(milliseconds: 200),
            child: IgnorePointer(
              ignoring: !_showControls,
              child: Container(
                decoration: const BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      Color(0xBF000000),
                      Colors.transparent,
                      Colors.transparent,
                      Color(0xBF000000),
                    ],
                    stops: [0.0, 0.25, 0.75, 1.0],
                  ),
                ),
                child: Stack(
                  children: [
                    // Close button
                    Positioned(
                      top: MediaQuery.of(context).padding.top + 12,
                      right: 18,
                      child: GestureDetector(
                        onTap: () => Navigator.of(context).pop(),
                        child: Container(
                          width: 36,
                          height: 36,
                          decoration: BoxDecoration(
                            color: Colors.black.withValues(alpha: 0.55),
                            shape: BoxShape.circle,
                          ),
                          child: const Center(
                            child: Text(
                              '×',
                              style: TextStyle(
                                color: Colors.white,
                                fontSize: 26,
                                height: 1,
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                    // Centre play/pause
                    Center(
                      child: GestureDetector(
                        onTap: _togglePlayPause,
                        child: Container(
                          width: 60,
                          height: 60,
                          decoration: BoxDecoration(
                            color: Colors.black.withValues(alpha: 0.55),
                            shape: BoxShape.circle,
                          ),
                          child: Icon(
                            _initialized && _ctrl.value.isPlaying
                                ? Icons.pause_rounded
                                : Icons.play_arrow_rounded,
                            color: Colors.white,
                            size: 36,
                          ),
                        ),
                      ),
                    ),
                    // Bottom: progress bar + time
                    Positioned(
                      left: 0,
                      right: 0,
                      bottom: MediaQuery.of(context).padding.bottom + 16,
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            SliderTheme(
                              data: SliderTheme.of(context).copyWith(
                                trackHeight: 3,
                                thumbShape: const RoundSliderThumbShape(
                                  enabledThumbRadius: 7,
                                ),
                                overlayShape: const RoundSliderOverlayShape(
                                  overlayRadius: 14,
                                ),
                                activeTrackColor: const Color(0xFF4AA3E4),
                                inactiveTrackColor: Colors.white.withValues(
                                  alpha: 0.3,
                                ),
                                thumbColor: const Color(0xFF4AA3E4),
                              ),
                              child: Slider(
                                value: progress.clamp(0.0, 1.0),
                                onChanged: _initialized
                                    ? (v) {
                                        final ms = (v * duration.inMilliseconds)
                                            .round();
                                        _ctrl.seekTo(
                                          Duration(milliseconds: ms),
                                        );
                                        setState(() => _showControls = true);
                                        _scheduleHideControls();
                                      }
                                    : null,
                              ),
                            ),
                            Padding(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 6,
                              ),
                              child: Row(
                                mainAxisAlignment:
                                    MainAxisAlignment.spaceBetween,
                                children: [
                                  Text(
                                    _formatDuration(position),
                                    style: const TextStyle(
                                      color: Colors.white,
                                      fontSize: 12,
                                    ),
                                  ),
                                  Text(
                                    _formatDuration(duration),
                                    style: const TextStyle(
                                      color: Colors.white,
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
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Giphy picker bottom sheet ─────────────────────────────────────────────────

class _GiphyPickerSheet extends StatefulWidget {
  const _GiphyPickerSheet({required this.mode});

  /// 'gif' or 'sticker'
  final String mode;

  @override
  State<_GiphyPickerSheet> createState() => _GiphyPickerSheetState();
}

class _GiphyPickerSheetState extends State<_GiphyPickerSheet> {
  static const _apiKey = 'u6gyvFio1FZ5D8aWKIoX23QdSu61i73B';
  final _searchCtrl = TextEditingController();
  List<Map<String, dynamic>> _items = [];
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _fetch();
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _fetch([String? query]) async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final type = widget.mode == 'sticker' ? 'stickers' : 'gifs';
      final endpoint = (query?.trim().isNotEmpty == true)
          ? 'search'
          : 'trending';
      var url =
          'https://api.giphy.com/v1/$type/$endpoint'
          '?api_key=$_apiKey&limit=24&rating=g';
      if (query?.trim().isNotEmpty == true) {
        url += '&q=${Uri.encodeQueryComponent(query!.trim())}';
      }
      final res = await http.get(Uri.parse(url));
      if (!mounted) return;
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body) as Map<String, dynamic>;
        final items =
            (data['data'] as List?)?.cast<Map<String, dynamic>>() ?? [];
        setState(() {
          _items = items;
          _loading = false;
        });
      } else {
        setState(() {
          _loading = false;
          _error = 'Giphy error ${res.statusCode}';
        });
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.toString();
      });
    }
  }

  String _bestUrl(Map<String, dynamic> item) {
    final images = item['images'] as Map<String, dynamic>?;
    return ((images?['fixed_height_small'] as Map?)?['url'] as String?) ??
        ((images?['preview_gif'] as Map?)?['url'] as String?) ??
        ((images?['original'] as Map?)?['url'] as String?) ??
        '';
  }

  @override
  Widget build(BuildContext context) {
    final title = widget.mode == 'sticker' ? 'Stickers' : 'GIFs';
    return DraggableScrollableSheet(
      initialChildSize: 0.6,
      minChildSize: 0.4,
      maxChildSize: 0.92,
      snap: true,
      builder: (ctx, scrollCtrl) => Container(
        decoration: const BoxDecoration(
          color: Color(0xFF0D1526),
          borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
        ),
        child: Column(
          children: [
            // Handle
            Container(
              margin: const EdgeInsets.only(top: 10, bottom: 4),
              width: 36,
              height: 4,
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.2),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            // Header
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
              child: Row(
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      color: Color(0xFFE8ECF8),
                      fontWeight: FontWeight.w700,
                      fontSize: 16,
                    ),
                  ),
                  const Spacer(),
                  const Text(
                    'Powered by GIPHY',
                    style: TextStyle(color: Color(0xFF4A5568), fontSize: 10),
                  ),
                ],
              ),
            ),
            // Search
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
              child: TextField(
                controller: _searchCtrl,
                style: const TextStyle(color: Color(0xFFE8ECF8), fontSize: 14),
                decoration: InputDecoration(
                  hintText: 'Search $title…',
                  hintStyle: const TextStyle(color: Color(0xFF4A5568)),
                  prefixIcon: const Icon(
                    Icons.search_rounded,
                    color: Color(0xFF7A8BB0),
                    size: 20,
                  ),
                  filled: true,
                  fillColor: const Color(0xFF1A2235),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide.none,
                  ),
                  contentPadding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 10,
                  ),
                ),
                textInputAction: TextInputAction.search,
                onSubmitted: _fetch,
              ),
            ),
            // Grid
            Expanded(
              child: _loading
                  ? const Center(
                      child: CircularProgressIndicator(
                        color: Color(0xFF4AA3E4),
                      ),
                    )
                  : _error != null
                  ? Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            _error!,
                            style: const TextStyle(color: Color(0xFF7A8BB0)),
                          ),
                          const SizedBox(height: 8),
                          TextButton(
                            onPressed: () => _fetch(_searchCtrl.text),
                            child: const Text(
                              'Retry',
                              style: TextStyle(color: Color(0xFF4AA3E4)),
                            ),
                          ),
                        ],
                      ),
                    )
                  : _items.isEmpty
                  ? const Center(
                      child: Text(
                        'No results',
                        style: TextStyle(color: Color(0xFF7A8BB0)),
                      ),
                    )
                  : GridView.builder(
                      controller: scrollCtrl,
                      padding: const EdgeInsets.fromLTRB(8, 0, 8, 20),
                      gridDelegate:
                          const SliverGridDelegateWithFixedCrossAxisCount(
                            crossAxisCount: 3,
                            crossAxisSpacing: 4,
                            mainAxisSpacing: 4,
                            childAspectRatio: 1,
                          ),
                      itemCount: _items.length,
                      itemBuilder: (_, i) {
                        final item = _items[i];
                        final url = _bestUrl(item);
                        final id = item['id'] as String? ?? '';
                        if (url.isEmpty) return const SizedBox.shrink();
                        return GestureDetector(
                          onTap: () => Navigator.of(ctx).pop(
                            _CommentMediaData(
                              type: 'image',
                              url: url,
                              metadata: {
                                'provider': 'giphy',
                                'id': id,
                                if (widget.mode == 'gif') 'kind': 'gif',
                              },
                            ),
                          ),
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(6),
                            child: Image.network(
                              url,
                              fit: BoxFit.cover,
                              loadingBuilder: (_, child, progress) =>
                                  progress == null
                                  ? child
                                  : Container(
                                      color: const Color(0xFF1A2235),
                                      child: const Center(
                                        child: CircularProgressIndicator(
                                          strokeWidth: 1.5,
                                          color: Color(0xFF4AA3E4),
                                        ),
                                      ),
                                    ),
                              errorBuilder: (_, __, ___) =>
                                  Container(color: const Color(0xFF1A2235)),
                            ),
                          ),
                        );
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }
}
