import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:image_cropper/image_cropper.dart';
import 'package:image_picker/image_picker.dart';
import '../../core/services/auth_storage.dart';
import '../post/post_detail_screen.dart';
import '../report/report_user_sheet.dart';
import 'follow_list_sheet.dart';
import 'profile_item_viewer_screen.dart';
import 'models/profile_detail.dart';
import 'profile_edit_sheet.dart';
import 'services/profile_service.dart';

// ── Helpers ──────────────────────────────────────────────────────────────────

String _formatCount(int n) {
  if (n >= 1000000) {
    final v = (n / 1000000);
    return '${v % 1 == 0 ? v.toInt() : v.toStringAsFixed(1)}M';
  }
  if (n >= 1000) {
    final v = (n / 1000);
    return '${v % 1 == 0 ? v.toInt() : v.toStringAsFixed(1)}K';
  }
  return '$n';
}

String? _decodeViewerId() {
  final token = AuthStorage.accessToken;
  if (token == null) return null;
  try {
    final parts = token.split('.');
    if (parts.length < 2) return null;
    // Base64url → base64
    var payload = parts[1].replaceAll('-', '+').replaceAll('_', '/');
    while (payload.length % 4 != 0) {
      payload += '=';
    }
    final json = jsonDecode(utf8.decode(base64Decode(payload))) as Map;
    return (json['userId'] ?? json['sub']) as String?;
  } catch (_) {
    return null;
  }
}

bool _canView(String visibility, bool isOwner, bool isFollowing) {
  if (isOwner) return true;
  if (visibility == 'public') return true;
  if (visibility == 'followers') return isFollowing;
  return false; // private
}

String _visibilityBadge(String visibility) {
  if (visibility == 'private') return 'Private';
  if (visibility == 'followers') return 'Followers only';
  return '';
}

String _formatBirthdate(String? raw) {
  if (raw == null || raw.isEmpty) return '';
  try {
    final dt = DateTime.parse(raw);
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    return '${months[dt.month - 1]} ${dt.day}, ${dt.year}';
  } catch (_) {
    return raw;
  }
}

String _formatGender(String? g) {
  if (g == null) return '';
  switch (g) {
    case 'male':
      return 'Male';
    case 'female':
      return 'Female';
    case 'other':
      return 'Other';
    case 'prefer_not_to_say':
      return 'Prefer not to say';
    default:
      return g;
  }
}

// ── Screen ───────────────────────────────────────────────────────────────────

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key, required this.userId});

  final String userId;

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen>
    with TickerProviderStateMixin {
  ProfileDetail? _profile;
  bool _loading = true;
  String? _error;
  bool _blockedView = false;
  String _blockedMessage =
      'The link may be broken or the profile may have been removed.';
  bool _privateView = false;
  bool _followLoading = false;
  bool _bioExpanded = false;
  bool _avatarLoading = false;
  bool _isOwnerProfile = false;

  // ── Tab state ──────────────────────────────────────────────────────────────
  late TabController _tabController;
  static const List<String> _ownerTabKeys = [
    'posts',
    'reels',
    'saved',
    'repost',
  ];
  static const List<String> _viewerTabKeys = ['posts', 'reels', 'repost'];

  final Map<String, List<Map<String, dynamic>>> _tabItems = {
    'posts': [],
    'reels': [],
    'saved': [],
    'repost': [],
  };
  final Map<String, bool> _tabLoading = {
    'posts': false,
    'reels': false,
    'saved': false,
    'repost': false,
  };
  final Map<String, bool> _tabLoaded = {
    'posts': false,
    'reels': false,
    'saved': false,
    'repost': false,
  };
  final Map<String, String> _tabError = {
    'posts': '',
    'reels': '',
    'saved': '',
    'repost': '',
  };

  // repostOf postId -> resolved origin author fields
  final Map<String, Map<String, String?>> _repostOriginCache = {};

  late final String? _viewerId;

  static const Color _bg = Color(0xFF0B1020);
  static const Color _surface = Color(0xFF111827);
  static const Color _border = Color(0xFF1E2D48);
  static const Color _textPrimary = Color(0xFFE8ECF8);
  static const Color _textSecondary = Color(0xFF7A8BB0);
  static const Color _accent = Color(0xFF4AA3E4);
  static const Color _danger = Color(0xFFE53935);
  static const String _defaultAvatar =
      'https://res.cloudinary.com/doicocgeo/image/upload/v1765850274/user-avatar-default_gfx5bs.jpg';

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: _viewerTabKeys.length, vsync: this);
    _tabController.addListener(_onTabChanged);
    _viewerId = _decodeViewerId();
    _loadProfile();
  }

  List<String> get _visibleTabKeys =>
      _isOwnerProfile ? _ownerTabKeys : _viewerTabKeys;

  void _reconfigureTabs(bool isOwner) {
    final oldKeys = _visibleTabKeys;
    final oldIndex = _tabController.index.clamp(0, oldKeys.length - 1);
    final currentKey = oldKeys[oldIndex];

    _isOwnerProfile = isOwner;
    final newKeys = _visibleTabKeys;
    final nextIndex = newKeys.indexOf(currentKey);
    final initialIndex = nextIndex >= 0 ? nextIndex : 0;

    _tabController.removeListener(_onTabChanged);
    _tabController.dispose();
    _tabController = TabController(
      length: newKeys.length,
      vsync: this,
      initialIndex: initialIndex,
    );
    _tabController.addListener(_onTabChanged);
  }

  void _onTabChanged() {
    if (!_tabController.indexIsChanging) setState(() {});
  }

  @override
  void dispose() {
    _tabController.removeListener(_onTabChanged);
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _loadProfile() async {
    setState(() {
      _loading = true;
      _error = null;
      _blockedView = false;
      _privateView = false;
    });
    try {
      final data = await ProfileService.fetchProfile(widget.userId);
      if (!mounted) return;
      setState(() {
        _profile = data;
        _loading = false;
      });
      // Check profile-level visibility for non-owners non-followers
      final vis = data.visibility?.profile ?? 'public';
      final isOwner = _viewerId != null && data.userId == _viewerId;
      final isFollowing = data.isFollowing;
      if (_isOwnerProfile != isOwner) {
        _reconfigureTabs(isOwner);
      } else {
        _isOwnerProfile = isOwner;
      }
      if (!_canView(vis, isOwner, isFollowing)) {
        setState(() => _privateView = true);
      }
      // Prefetch tabs now that we have the userId
      _prefetchTab('posts');
      _prefetchTab('reels');
      _prefetchTab('repost');
      if (isOwner) _prefetchTab('saved');
    } catch (e) {
      if (!mounted) return;
      final msg = e.toString().toLowerCase();
      final isPrivate = msg.contains('private') || msg.contains('403');
      final isBlocked =
          msg.contains('block') ||
          msg.contains('423') ||
          msg.contains('unavailable') ||
          msg.contains('suspended') ||
          msg.contains('banned');
      if (isBlocked) {
        setState(() {
          _blockedView = true;
          _loading = false;
          if (msg.contains('unavailable') ||
              msg.contains('suspended') ||
              msg.contains('banned')) {
            _blockedMessage = 'This account is currently unavailable.';
          }
        });
      } else if (isPrivate) {
        setState(() {
          _privateView = true;
          _loading = false;
        });
      } else {
        setState(() {
          _error = e.toString().replaceFirst(RegExp(r'^.*?Exception: '), '');
          _loading = false;
        });
      }
    }
  }

  // ── Tab fetching ───────────────────────────────────────────────────────────

  bool _hasRepostOrigin(Map<String, dynamic> item) {
    final repostOf = item['repostOf'] as String?;
    if (repostOf == null || repostOf.isEmpty) return true;
    final username =
        (item['repostOfAuthorUsername'] as String?) ??
        ((item['repostOfAuthor'] as Map?)?['username'] as String?);
    final displayName =
        (item['repostOfAuthorDisplayName'] as String?) ??
        ((item['repostOfAuthor'] as Map?)?['displayName'] as String?);
    return (username != null && username.isNotEmpty) ||
        (displayName != null && displayName.isNotEmpty);
  }

  Future<Map<String, String?>> _resolveRepostOrigin(String repostOf) async {
    final cached = _repostOriginCache[repostOf];
    if (cached != null) return cached;

    try {
      final data = await ProfileService.fetchPostDetail(repostOf);
      final author = data['author'] as Map<String, dynamic>?;
      final repostOfAuthor = (data['repostOfAuthor'] as Map?)
          ?.cast<String, dynamic>();

      String? originId =
          (data['authorId'] as String?) ??
          (author?['id'] as String?) ??
          (data['repostOfAuthorId'] as String?) ??
          (repostOfAuthor?['id'] as String?);
      String? originUsername =
          (data['authorUsername'] as String?) ??
          (author?['username'] as String?) ??
          (data['repostOfAuthorUsername'] as String?) ??
          (repostOfAuthor?['username'] as String?);
      String? originDisplayName =
          (data['authorDisplayName'] as String?) ??
          (author?['displayName'] as String?) ??
          (data['repostOfAuthorDisplayName'] as String?) ??
          (repostOfAuthor?['displayName'] as String?);
      String? originAvatarUrl =
          (data['authorAvatarUrl'] as String?) ??
          (author?['avatarUrl'] as String?) ??
          (data['repostOfAuthorAvatarUrl'] as String?) ??
          (repostOfAuthor?['avatarUrl'] as String?);

      // Fallback: resolve username/displayName via profile endpoint by authorId.
      if ((originUsername == null || originUsername.isEmpty) &&
          (originDisplayName == null || originDisplayName.isEmpty) &&
          originId != null &&
          originId.isNotEmpty) {
        try {
          final profile = await ProfileService.fetchProfile(originId);
          originUsername = profile.username;
          originDisplayName = profile.displayName;
          originAvatarUrl = profile.avatarUrl;
        } catch (_) {
          // Keep origin fields as-is; caller will fall back to label.
        }
      }

      final resolved = <String, String?>{
        'id': originId,
        'username': originUsername,
        'displayName': originDisplayName,
        'avatarUrl': originAvatarUrl,
      };

      final hasName =
          (originUsername != null && originUsername.isNotEmpty) ||
          (originDisplayName != null && originDisplayName.isNotEmpty);
      // Cache only meaningful results; avoid pinning empty failures forever.
      if (hasName) {
        _repostOriginCache[repostOf] = resolved;
      }
      return resolved;
    } catch (_) {
      return <String, String?>{
        'id': repostOf,
        'username': null,
        'displayName': null,
        'avatarUrl': null,
      };
    }
  }

  Future<List<Map<String, dynamic>>> _hydrateRepostOrigins(
    List<Map<String, dynamic>> items,
  ) async {
    final needed = <String>{};
    for (final item in items) {
      final repostOf = item['repostOf'] as String?;
      if (repostOf != null && repostOf.isNotEmpty && !_hasRepostOrigin(item)) {
        needed.add(repostOf);
      }
    }

    if (needed.isNotEmpty) {
      await Future.wait(needed.map(_resolveRepostOrigin));
    }

    return items.map((raw) {
      final item = Map<String, dynamic>.from(raw);
      final repostOf = item['repostOf'] as String?;
      if (repostOf == null || repostOf.isEmpty) return item;
      final origin = _repostOriginCache[repostOf];
      if (origin == null) return item;

      item['repostOfAuthorId'] ??= origin['id'];
      item['repostOfAuthorUsername'] ??= origin['username'];
      item['repostOfAuthorDisplayName'] ??= origin['displayName'];
      item['repostOfAuthorAvatarUrl'] ??= origin['avatarUrl'];

      final repostOfAuthor =
          (item['repostOfAuthor'] as Map?)?.cast<String, dynamic>() ??
          <String, dynamic>{};
      repostOfAuthor['id'] ??= origin['id'];
      repostOfAuthor['username'] ??= origin['username'];
      repostOfAuthor['displayName'] ??= origin['displayName'];
      repostOfAuthor['avatarUrl'] ??= origin['avatarUrl'];
      item['repostOfAuthor'] = repostOfAuthor;

      return item;
    }).toList();
  }

  List<Map<String, dynamic>> _normalizeRepostOwner(
    List<Map<String, dynamic>> items,
  ) {
    final p = _profile;
    if (p == null) return items;
    return items.map((raw) {
      final item = Map<String, dynamic>.from(raw);
      item['authorId'] = p.userId;
      item['authorUsername'] = p.username;
      item['authorDisplayName'] = p.displayName;
      item['authorAvatarUrl'] = p.avatarUrl;
      final author =
          (item['author'] as Map?)?.cast<String, dynamic>() ??
          <String, dynamic>{};
      author['id'] = p.userId;
      author['username'] = p.username;
      author['displayName'] = p.displayName;
      author['avatarUrl'] = p.avatarUrl;
      author['isCreatorVerified'] = p.isCreatorVerified;
      item['author'] = author;
      return item;
    }).toList();
  }

  Future<void> _prefetchTab(String key) async {
    if (_tabLoading[key] == true || _tabLoaded[key] == true) return;
    final ownerId = _profile?.userId;
    if (ownerId == null) return;

    if (!mounted) return;
    setState(() => _tabLoading[key] = true);

    try {
      List<Map<String, dynamic>> items;

      if (key == 'posts') {
        final raw = await ProfileService.fetchUserPosts(ownerId, limit: 30);
        // Exclude reposts (items that have repostOf set)
        items = raw
            .where((m) => m['repostOf'] == null || m['repostOf'] == '')
            .toList();
      } else if (key == 'reels') {
        items = await ProfileService.fetchUserReels(ownerId, limit: 30);
      } else if (key == 'repost') {
        // Combine posts + reels, keep only items with repostOf
        final results = await Future.wait([
          ProfileService.fetchUserPosts(ownerId, limit: 60),
          ProfileService.fetchUserReels(ownerId, limit: 60),
        ]);
        final combined = [...results[0], ...results[1]];
        final seen = <String>{};
        final deduped = <Map<String, dynamic>>[];
        for (final item in combined) {
          final id = item['id'] as String? ?? '';
          if (id.isNotEmpty && seen.add(id)) deduped.add(item);
        }
        items = deduped
            .where((m) => m['repostOf'] != null && m['repostOf'] != '')
            .toList();
        items.sort((a, b) {
          final aT =
              DateTime.tryParse(
                a['createdAt'] as String? ?? '',
              )?.millisecondsSinceEpoch ??
              0;
          final bT =
              DateTime.tryParse(
                b['createdAt'] as String? ?? '',
              )?.millisecondsSinceEpoch ??
              0;
          return bT.compareTo(aT);
        });
      } else {
        // saved
        final raw = await ProfileService.fetchSavedItems(limit: 60);
        raw.sort((a, b) {
          final aT =
              DateTime.tryParse(
                a['createdAt'] as String? ?? '',
              )?.millisecondsSinceEpoch ??
              0;
          final bT =
              DateTime.tryParse(
                b['createdAt'] as String? ?? '',
              )?.millisecondsSinceEpoch ??
              0;
          return bT.compareTo(aT);
        });
        items = raw;
      }

      items = await _hydrateRepostOrigins(items);
      if (key == 'repost') {
        items = _normalizeRepostOwner(items);
      }

      if (!mounted) return;
      setState(() {
        _tabItems[key] = items;
        _tabLoaded[key] = true;
        _tabLoading[key] = false;
        _tabError[key] = '';
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _tabLoading[key] = false;
        _tabLoaded[key] = true;
        _tabError[key] = e.toString().replaceFirst(
          RegExp(r'^.*?Exception: '),
          '',
        );
      });
    }
  }

  // ── Tab item navigation ────────────────────────────────────────────────────

  void _navigateToItem(Map<String, dynamic> item, int index) {
    final key = _visibleTabKeys[_tabController.index];
    final items = _tabItems[key]!;

    // Only the dedicated Reels tab should open vertical reel-only navigation.
    if (key == 'reels') {
      final kind =
          (item['repostKind'] as String?) ?? (item['kind'] as String?) ?? '';
      final media =
          (item['media'] as List?)
              ?.whereType<Map<String, dynamic>>()
              .toList() ??
          [];
      final isReel =
          kind == 'reel' ||
          (media.isNotEmpty && media.first['type'] == 'video');

      if (isReel) {
        final reelItems = items.where((m) {
          final k =
              (m['repostKind'] as String?) ?? (m['kind'] as String?) ?? '';
          final med =
              (m['media'] as List?)
                  ?.whereType<Map<String, dynamic>>()
                  .toList() ??
              [];
          return k == 'reel' ||
              (med.isNotEmpty && med.first['type'] == 'video');
        }).toList();

        final reelIndex = reelItems.indexWhere((m) => m['id'] == item['id']);
        Navigator.of(context).push(
          MaterialPageRoute<void>(
            builder: (_) => ProfileReelViewerScreen(
              items: reelItems,
              initialIndex: reelIndex >= 0 ? reelIndex : 0,
              viewerId: _viewerId,
              profileUsername: _profile?.username,
              profileDisplayName: _profile?.displayName,
              profileAvatarUrl: _profile?.avatarUrl,
              profileUserId: _profile?.userId,
            ),
          ),
        );
        return;
      }
    }

    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => ProfileItemViewerScreen(
          items: items,
          initialIndex: index,
          viewerId: _viewerId,
          profileUsername: _profile?.username,
          profileDisplayName: _profile?.displayName,
          profileAvatarUrl: _profile?.avatarUrl,
          profileUserId: _profile?.userId,
        ),
      ),
    );
  }

  Future<void> _toggleFollow() async {
    final p = _profile;
    if (p == null || _followLoading) return;
    final nextFollow = !p.isFollowing;
    setState(() {
      _followLoading = true;
      p.isFollowing = nextFollow;
      p.stats.followers; // read before mutating
    });
    // optimistic update
    final newStats = ProfileStats(
      posts: p.stats.posts,
      reels: p.stats.reels,
      totalPosts: p.stats.totalPosts,
      followers: p.stats.followers + (nextFollow ? 1 : -1),
      following: p.stats.following,
    );
    setState(
      () => _profile = p.copyWith(isFollowing: nextFollow, stats: newStats),
    );
    try {
      if (nextFollow) {
        await ProfileService.followUser(p.userId);
      } else {
        await ProfileService.unfollowUser(p.userId);
      }
    } catch (e) {
      if (!mounted) return;
      // revert
      final revertStats = ProfileStats(
        posts: p.stats.posts,
        reels: p.stats.reels,
        totalPosts: p.stats.totalPosts,
        followers: p.stats.followers - (nextFollow ? 1 : -1),
        following: p.stats.following,
      );
      setState(() {
        _profile = p.copyWith(isFollowing: !nextFollow, stats: revertStats);
      });
      _showToast('Unable to update follow status');
    } finally {
      if (mounted) setState(() => _followLoading = false);
    }
  }

  void _showToast(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  void _openFollowSheet(ProfileDetail p, FollowTab tab) {
    showFollowListSheet(
      context,
      ownerUserId: p.userId,
      ownerUsername: p.username,
      initialTab: tab,
      viewerId: _decodeViewerId(),
      onCountsChange: ({int? followersDelta, int? followingDelta}) {
        setState(() {
          _profile = _profile?.copyWith(
            stats: ProfileStats(
              posts: (_profile?.stats.posts ?? 0),
              reels: (_profile?.stats.reels ?? 0),
              totalPosts: (_profile?.stats.totalPosts ?? 0),
              followers:
                  (_profile?.stats.followers ?? 0) + (followersDelta ?? 0),
              following:
                  (_profile?.stats.following ?? 0) + (followingDelta ?? 0),
            ),
          );
        });
      },
      onNavigateToProfile: (userId) {
        Navigator.of(context).push(
          MaterialPageRoute<void>(
            builder: (_) => ProfileScreen(userId: userId),
          ),
        );
      },
    );
  }

  void _showMoreMenu() {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: const Color(0xFF141D30),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 36,
              height: 4,
              margin: const EdgeInsets.only(top: 10, bottom: 16),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.18),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            _MoreMenuItem(
              icon: Icons.info_outline_rounded,
              label: 'About this user',
              onTap: () {
                Navigator.pop(context);
                _showAboutSheet();
              },
            ),
            _MoreMenuItem(
              icon: Icons.block_rounded,
              label: 'Block this user',
              onTap: () {
                Navigator.pop(context);
                _onBlockUser();
              },
            ),
            _MoreMenuItem(
              icon: Icons.flag_outlined,
              label: 'Report',
              onTap: () {
                Navigator.pop(context);
                _onReportUser();
              },
            ),
            _MoreMenuItem(
              icon: Icons.link_rounded,
              label: 'Copy link',
              onTap: () {
                Navigator.pop(context);
                _showToast('Link copied (coming soon)');
              },
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  Map<String, String>? _authHeader() {
    final token = AuthStorage.accessToken;
    if (token == null || token.isEmpty) return null;
    return {'Authorization': 'Bearer $token'};
  }

  Future<void> _onBlockUser() async {
    final p = _profile;
    if (p == null) return;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF111827),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        title: Text(
          'Block @${p.username}?',
          style: const TextStyle(color: Color(0xFFE8ECF8), fontSize: 16),
        ),
        content: const Text(
          'Blocking this user will hide their content from you.',
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

    if (confirmed != true || !mounted) return;

    try {
      await ProfileService.blockUser(p.userId);
      if (!mounted) return;
      setState(() {
        _blockedView = true;
        _profile = null;
      });
      _showToast('Blocked @${p.username}');
    } catch (e) {
      final msg = e.toString().replaceFirst(RegExp(r'^.*?Exception: '), '');
      _showToast(msg.isEmpty ? 'Unable to block user' : msg);
    }
  }

  Future<void> _onReportUser() async {
    final p = _profile;
    if (p == null) return;
    if (_viewerId != null && _viewerId == p.userId) {
      _showToast('You cannot report yourself');
      return;
    }
    final authHeader = _authHeader();
    if (authHeader == null) {
      _showToast('Session expired. Please sign in again.');
      return;
    }

    final reported = await showReportUserSheet(
      context,
      userId: p.userId,
      authHeader: authHeader,
    );
    if (reported && mounted) {
      _showToast('Report submitted');
    }
  }

  void _showAboutSheet() {
    final p = _profile;
    if (p == null) return;
    final isOwner = _viewerId != null && p.userId == _viewerId;
    final vis = p.visibility;
    final canAbout = _canView(vis?.about ?? 'public', isOwner, p.isFollowing);
    if (!canAbout) {
      _showToast(_visibilityRestriction(vis?.about, 'about section'));
      return;
    }
    _openAboutSheet(p, isOwner);
  }

  void _openAboutSheet(ProfileDetail p, bool isOwner) {
    final vis = p.visibility;
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: const Color(0xFF141D30),
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.55,
        minChildSize: 0.3,
        maxChildSize: 0.85,
        builder: (_, ctrl) => ListView(
          controller: ctrl,
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
          children: [
            Center(
              child: Container(
                width: 36,
                height: 4,
                margin: const EdgeInsets.only(top: 6, bottom: 16),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.18),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const Text(
              'About',
              style: TextStyle(
                color: _textPrimary,
                fontSize: 17,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 16),
            _AboutRow(
              icon: Icons.badge_outlined,
              label: 'Display name',
              value: p.displayName,
              muted: false,
            ),
            _AboutRow(
              icon: Icons.alternate_email_rounded,
              label: 'Username',
              value: '@${p.username}',
              muted: false,
            ),
            _buildAboutField(
              icon: Icons.location_on_outlined,
              label: 'Location',
              value: p.location,
              visibility: vis?.location,
              isOwner: isOwner,
              isFollowing: p.isFollowing,
            ),
            _buildAboutField(
              icon: Icons.business_center_outlined,
              label: 'Workplace',
              value: p.workplace?.companyName,
              visibility: vis?.workplace,
              isOwner: isOwner,
              isFollowing: p.isFollowing,
            ),
            _buildAboutField(
              icon: Icons.cake_outlined,
              label: 'Birthday',
              value: _formatBirthdate(p.birthdate),
              visibility: vis?.birthdate,
              isOwner: isOwner,
              isFollowing: p.isFollowing,
            ),
            _buildAboutField(
              icon: Icons.person_outline_rounded,
              label: 'Gender',
              value: _formatGender(p.gender),
              visibility: vis?.gender,
              isOwner: isOwner,
              isFollowing: p.isFollowing,
            ),
            const SizedBox(height: 16),
          ],
        ),
      ),
    );
  }

  Widget _buildAboutField({
    required IconData icon,
    required String label,
    required String? value,
    required String? visibility,
    required bool isOwner,
    required bool isFollowing,
  }) {
    final vis = visibility ?? 'public';
    final canSee = _canView(vis, isOwner, isFollowing);
    if (!canSee) {
      final badge = _visibilityBadge(vis);
      return _AboutRow(icon: icon, label: label, value: badge, muted: true);
    }
    final trimmed = value?.trim() ?? '';
    if (!isOwner && trimmed.isEmpty) {
      return const SizedBox.shrink();
    }
    if (trimmed.isEmpty) {
      return _AboutRow(icon: icon, label: label, value: '—', muted: true);
    }
    return _AboutRow(icon: icon, label: label, value: trimmed, muted: false);
  }

  String _visibilityRestriction(String? vis, String field) {
    if (vis == 'private') return 'This $field is private.';
    if (vis == 'followers') return 'This $field is visible to followers only.';
    return '$field is not available.';
  }

  @override
  Widget build(BuildContext context) {
    try {
      return Scaffold(backgroundColor: _bg, body: _buildBody());
    } catch (e) {
      return Scaffold(
        backgroundColor: _bg,
        body: _SpecialStateView(
          icon: Icons.error_outline_rounded,
          iconColor: _danger,
          title: 'Cannot render profile',
          body: e.toString(),
          buttonLabel: 'Retry',
          onButton: _loadProfile,
        ),
      );
    }
  }

  Widget _buildBody() {
    if (_loading) return _buildLoadingSkeleton();
    if (_blockedView) return _buildBlockedView();
    if (_privateView && _profile == null) return _buildPrivateView();
    if (_error != null && _profile == null) return _buildErrorView();

    if (_profile == null) {
      return _buildErrorView(
        message: 'Profile data is unavailable. Please try again.',
      );
    }

    final p = _profile as ProfileDetail;
    final isOwner = _viewerId != null && p.userId == _viewerId;
    final vis = p.visibility;

    // Profile-level private (we have data but visibility says private)
    if (_privateView && !isOwner) return _buildPrivateView();

    return CustomScrollView(
      slivers: [
        _buildSliverAppBar(p, isOwner),
        SliverToBoxAdapter(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _buildIdentitySection(p, isOwner),
              _buildStatsRow(p, isOwner, vis),
              _buildActionButtons(p, isOwner),
              if (_hasBio(p, isOwner, vis)) _buildBioSection(p, isOwner, vis),
              _buildInfoSection(p, isOwner, vis),
              const SizedBox(height: 12),
            ],
          ),
        ),
        SliverPersistentHeader(
          pinned: true,
          delegate: _ProfileTabBarDelegate(
            TabBar(
              controller: _tabController,
              labelColor: _accent,
              unselectedLabelColor: _textSecondary,
              indicatorColor: _accent,
              indicatorWeight: 2.5,
              labelStyle: const TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
              ),
              unselectedLabelStyle: const TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w400,
              ),
              tabs: [
                const Tab(text: 'Posts'),
                const Tab(text: 'Reels'),
                if (isOwner) const Tab(text: 'Saved'),
                const Tab(text: 'Repost'),
              ],
            ),
            backgroundColor: _bg,
            borderColor: _border,
          ),
        ),
        _buildActiveTabSliver(isOwner),
      ],
    );
  }

  Widget _buildActiveTabSliver(bool isOwner) {
    final key = _visibleTabKeys[_tabController.index];
    final items = _tabItems[key]!;
    final loading = _tabLoading[key]!;
    final loaded = _tabLoaded[key]!;
    final error = _tabError[key]!;

    const emptyTexts = {
      'posts': 'No posts yet.',
      'reels': 'No reels yet.',
      'saved': 'No saved items yet.',
      'repost': 'No reposts yet.',
    };

    const gridDelegate = SliverGridDelegateWithFixedCrossAxisCount(
      crossAxisCount: 3,
      mainAxisSpacing: 2,
      crossAxisSpacing: 2,
    );

    // Loading skeleton
    if (loading && !loaded) {
      return SliverGrid(
        gridDelegate: gridDelegate,
        delegate: SliverChildBuilderDelegate(
          (_, __) => const ColoredBox(color: Color(0xFF1A2740)),
          childCount: 9,
        ),
      );
    }

    // Error
    if (error.isNotEmpty) {
      return SliverToBoxAdapter(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 28, 20, 28),
          child: Text(
            error,
            style: const TextStyle(color: Color(0xFFE57373), fontSize: 14),
            textAlign: TextAlign.center,
          ),
        ),
      );
    }

    // Empty
    if (loaded && items.isEmpty) {
      return SliverToBoxAdapter(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 28, 20, 28),
          child: Text(
            emptyTexts[key] ?? 'Nothing here.',
            style: const TextStyle(color: Color(0xFF9BAECF), fontSize: 14),
            textAlign: TextAlign.center,
          ),
        ),
      );
    }

    // Not yet started
    if (!loading && !loaded) {
      return const SliverToBoxAdapter(child: SizedBox.shrink());
    }

    // Grid
    return SliverGrid(
      gridDelegate: gridDelegate,
      delegate: SliverChildBuilderDelegate(
        (context, i) => _GridTile(
          item: items[i],
          showRepostBadge: key == 'repost',
          onTap: () => _navigateToItem(items[i], i),
        ),
        childCount: items.length,
      ),
    );
  }

  // ── Sliver app bar with cover ─────────────────────────────────────────────

  Widget _buildSliverAppBar(ProfileDetail p, bool isOwner) {
    final hasCover = p.coverUrl != null && p.coverUrl!.isNotEmpty;
    return SliverAppBar(
      expandedHeight: hasCover ? 180 : 60,
      pinned: true,
      backgroundColor: const Color(0xFF0D1526),
      surfaceTintColor: Colors.transparent,
      flexibleSpace: hasCover
          ? FlexibleSpaceBar(
              background: Stack(
                fit: StackFit.expand,
                children: [
                  Image.network(
                    p.coverUrl!,
                    fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) =>
                        const ColoredBox(color: Color(0xFF0D1526)),
                  ),
                  Container(
                    decoration: const BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [Colors.transparent, Color(0xCC0B1020)],
                      ),
                    ),
                  ),
                ],
              ),
            )
          : null,
      leading: IconButton(
        icon: const Icon(
          Icons.arrow_back_ios_new_rounded,
          color: Color(0xFF9BAECF),
          size: 20,
        ),
        onPressed: () => Navigator.of(context).pop(),
      ),
      title: Text(
        '@${p.username}',
        style: const TextStyle(
          color: _textPrimary,
          fontWeight: FontWeight.w600,
          fontSize: 15,
        ),
      ),
      centerTitle: true,
      actions: [
        if (!isOwner)
          IconButton(
            icon: const Icon(
              Icons.more_vert_rounded,
              color: Color(0xFF9BAECF),
              size: 22,
            ),
            onPressed: _showMoreMenu,
          )
        else
          const SizedBox(width: 8),
      ],
    );
  }

  // ── Identity: avatar + name ───────────────────────────────────────────────

  Widget _buildIdentitySection(ProfileDetail p, bool isOwner) {
    final display = p.displayName.trim();
    final username = p.username.trim();
    final initialSource = display.isNotEmpty
        ? display
        : (username.isNotEmpty ? username : 'U');
    final initial = initialSource[0].toUpperCase();
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          // Avatar with gradient ring
          GestureDetector(
            onTap: () => isOwner ? _showAvatarMenu(p) : _viewFullAvatar(p),
            child: Stack(
              children: [
                Container(
                  padding: const EdgeInsets.all(3),
                  decoration: const BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: LinearGradient(
                      colors: [Color(0xFF7BD8FF), Color(0xFFCBA6FF)],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                  ),
                  child: CircleAvatar(
                    radius: 42,
                    backgroundColor: const Color(0xFF1A2A45),
                    backgroundImage: _resolveAvatar(p),
                    child: _resolveAvatar(p) == null
                        ? Text(
                            initial,
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 28,
                              fontWeight: FontWeight.w700,
                            ),
                          )
                        : null,
                  ),
                ),
                if (_avatarLoading)
                  Positioned.fill(
                    child: Container(
                      decoration: const BoxDecoration(
                        shape: BoxShape.circle,
                        color: Color(0x88000000),
                      ),
                      child: const Center(
                        child: SizedBox(
                          width: 24,
                          height: 24,
                          child: CircularProgressIndicator(
                            strokeWidth: 2.5,
                            color: Colors.white,
                          ),
                        ),
                      ),
                    ),
                  ),
                if (isOwner && !_avatarLoading)
                  Positioned(
                    bottom: 0,
                    right: 0,
                    child: Container(
                      width: 24,
                      height: 24,
                      decoration: const BoxDecoration(
                        shape: BoxShape.circle,
                        color: Color(0xFF2563EB),
                      ),
                      child: const Icon(
                        Icons.camera_alt_rounded,
                        size: 13,
                        color: Colors.white,
                      ),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        p.displayName,
                        style: const TextStyle(
                          color: _textPrimary,
                          fontSize: 20,
                          fontWeight: FontWeight.w700,
                        ),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    if (p.isCreatorVerified) ...[
                      const SizedBox(width: 5),
                      const Icon(
                        Icons.verified_rounded,
                        color: Color(0xFF4AA3E4),
                        size: 18,
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 2),
                Text(
                  '@${p.username}',
                  style: const TextStyle(color: _textSecondary, fontSize: 14),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  ImageProvider? _resolveAvatar(ProfileDetail p) {
    final url = p.avatarUrl.isNotEmpty ? p.avatarUrl : null;
    if (url == null) return null;
    return NetworkImage(url);
  }

  // ── Avatar action sheet ───────────────────────────────────────────────────

  bool _isDefaultAvatar(ProfileDetail p) {
    final url = p.avatarUrl.trim();
    return url.isEmpty || url == _defaultAvatar;
  }

  void _showAvatarMenu(ProfileDetail p) {
    final hasCustomAvatar = !_isDefaultAvatar(p);
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: const Color(0xFF141D30),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 36,
              height: 4,
              margin: const EdgeInsets.only(top: 10, bottom: 16),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.18),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            ListTile(
              leading: const Icon(
                Icons.person_outline_rounded,
                color: Color(0xFF9BAECF),
                size: 22,
              ),
              title: const Text(
                'View avatar',
                style: TextStyle(color: Color(0xFFD0D8EE), fontSize: 15),
              ),
              onTap: () {
                Navigator.pop(context);
                _viewFullAvatar(p);
              },
              dense: true,
              contentPadding: const EdgeInsets.symmetric(horizontal: 20),
            ),
            ListTile(
              leading: const Icon(
                Icons.photo_library_outlined,
                color: Color(0xFF9BAECF),
                size: 22,
              ),
              title: const Text(
                'Upload photo',
                style: TextStyle(color: Color(0xFFD0D8EE), fontSize: 15),
              ),
              onTap: () {
                Navigator.pop(context);
                _pickAndUploadAvatar();
              },
              dense: true,
              contentPadding: const EdgeInsets.symmetric(horizontal: 20),
            ),
            if (hasCustomAvatar)
              ListTile(
                leading: const Icon(
                  Icons.delete_outline_rounded,
                  color: Color(0xFFE53935),
                  size: 22,
                ),
                title: const Text(
                  'Remove current photo',
                  style: TextStyle(color: Color(0xFFE53935), fontSize: 15),
                ),
                onTap: () {
                  Navigator.pop(context);
                  _confirmRemoveAvatar();
                },
                dense: true,
                contentPadding: const EdgeInsets.symmetric(horizontal: 20),
              ),
            ListTile(
              leading: const Icon(
                Icons.close_rounded,
                color: Color(0xFF7A8BB0),
                size: 22,
              ),
              title: const Text(
                'Cancel',
                style: TextStyle(color: Color(0xFF7A8BB0), fontSize: 15),
              ),
              onTap: () => Navigator.pop(context),
              dense: true,
              contentPadding: const EdgeInsets.symmetric(horizontal: 20),
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  // ── Pick + crop + upload ──────────────────────────────────────────────────

  Future<void> _pickAndUploadAvatar() async {
    try {
      final picker = ImagePicker();
      final picked = await picker.pickImage(
        source: ImageSource.gallery,
        imageQuality: 90,
        maxWidth: 2048,
        maxHeight: 2048,
      );
      if (picked == null || !mounted) return;

      final cropped = await ImageCropper().cropImage(
        sourcePath: picked.path,
        aspectRatio: const CropAspectRatio(ratioX: 1, ratioY: 1),
        uiSettings: [
          AndroidUiSettings(
            toolbarTitle: 'Crop photo',
            toolbarColor: const Color(0xFF1F4F7A),
            toolbarWidgetColor: Colors.white,
            activeControlsWidgetColor: const Color(0xFF3470A2),
            initAspectRatio: CropAspectRatioPreset.square,
            lockAspectRatio: true,
          ),
          IOSUiSettings(
            title: 'Crop photo',
            aspectRatioLockEnabled: true,
            resetAspectRatioEnabled: false,
          ),
        ],
      );
      if (cropped == null || !mounted) return;

      final originalName = picked.path.split(Platform.pathSeparator).last;
      final originalBytes = await File(picked.path).readAsBytes();
      final croppedBytes = await File(cropped.path).readAsBytes();

      if (!mounted) return;
      setState(() => _avatarLoading = true);

      final res = await ProfileService.uploadAvatar(
        originalBytes: originalBytes,
        originalName: originalName,
        croppedBytes: croppedBytes,
      );

      if (!mounted) return;
      final newUrl = (res['avatarUrl'] as String?) ?? '';
      final newOriginalUrl = res['avatarOriginalUrl'] as String?;
      setState(() {
        _avatarLoading = false;
        _profile = _profile?.copyWith(
          avatarUrl: newUrl,
          avatarOriginalUrl: newOriginalUrl,
        );
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _avatarLoading = false);
      _showToast(
        'Failed to update avatar: ${e.toString().replaceFirst(RegExp(r'^.*?Exception: '), '')}',
      );
    }
  }

  // ── Remove avatar confirm ─────────────────────────────────────────────────

  Future<void> _confirmRemoveAvatar() async {
    final confirmed = await showDialog<bool>(
      context: context,
      barrierColor: Colors.black54,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF141D30),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        title: const Text(
          'Remove profile photo',
          style: TextStyle(color: Color(0xFFE8ECF8), fontSize: 16),
        ),
        content: const Text(
          'Are you sure you want to remove your current profile photo? It will be replaced with the default avatar.',
          style: TextStyle(color: Color(0xFF9BAECF), fontSize: 14),
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
              'Remove',
              style: TextStyle(color: Color(0xFFE53935)),
            ),
          ),
        ],
      ),
    );

    if (confirmed != true || !mounted) return;

    setState(() => _avatarLoading = true);
    try {
      final res = await ProfileService.removeAvatar();
      if (!mounted) return;
      final newUrl = (res['avatarUrl'] as String?) ?? _defaultAvatar;
      final newOriginalUrl = res['avatarOriginalUrl'] as String?;
      setState(() {
        _avatarLoading = false;
        _profile = _profile?.copyWith(
          avatarUrl: newUrl,
          avatarOriginalUrl: newOriginalUrl,
        );
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _avatarLoading = false);
      _showToast(
        'Failed to remove avatar: ${e.toString().replaceFirst(RegExp(r'^.*?Exception: '), '')}',
      );
    }
  }

  void _viewFullAvatar(ProfileDetail p) {
    // Prefer the original (uncropped) URL; fall back to avatarUrl or default
    final url = (p.avatarOriginalUrl?.isNotEmpty == true
        ? p.avatarOriginalUrl!
        : p.avatarUrl.isNotEmpty
        ? p.avatarUrl
        : _defaultAvatar);
    showDialog<void>(
      context: context,
      barrierColor: Colors.black87,
      builder: (_) => GestureDetector(
        onTap: () => Navigator.pop(context),
        child: Center(
          child: InteractiveViewer(
            child: Image.network(
              url,
              fit: BoxFit.contain,
              loadingBuilder: (_, child, progress) => progress == null
                  ? child
                  : const Center(
                      child: CircularProgressIndicator(
                        color: Color(0xFF4AA3E4),
                        strokeWidth: 2,
                      ),
                    ),
              errorBuilder: (_, __, ___) => const Icon(
                Icons.broken_image_outlined,
                color: Color(0xFF7A8BB0),
                size: 48,
              ),
            ),
          ),
        ),
      ),
    );
  }

  // ── Stats row ─────────────────────────────────────────────────────────────

  Widget _buildStatsRow(ProfileDetail p, bool isOwner, ProfileVisibility? vis) {
    final canFollowers = _canView(
      vis?.followers ?? 'public',
      isOwner,
      p.isFollowing,
    );
    final canFollowing = _canView(
      vis?.following ?? 'public',
      isOwner,
      p.isFollowing,
    );
    final totalPosts = p.stats.totalPosts > 0
        ? p.stats.totalPosts
        : p.stats.posts + p.stats.reels;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        children: [
          _StatCard(
            label: 'Posts',
            value: _formatCount(totalPosts),
            onTap: null,
          ),
          const SizedBox(width: 10),
          _StatCard(
            label: 'Followers',
            value: canFollowers ? _formatCount(p.stats.followers) : '—',
            onTap: canFollowers
                ? () => _openFollowSheet(p, FollowTab.followers)
                : () => _showToast(
                    _visibilityRestriction(vis?.followers, 'followers list'),
                  ),
            locked: !canFollowers,
          ),
          const SizedBox(width: 10),
          _StatCard(
            label: 'Following',
            value: canFollowing ? _formatCount(p.stats.following) : '—',
            onTap: canFollowing
                ? () => _openFollowSheet(p, FollowTab.following)
                : () => _showToast(
                    _visibilityRestriction(vis?.following, 'following list'),
                  ),
            locked: !canFollowing,
          ),
        ],
      ),
    );
  }

  // ── Action buttons ────────────────────────────────────────────────────────

  Widget _buildActionButtons(ProfileDetail p, bool isOwner) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 4),
      child: isOwner ? _buildOwnerActions(p) : _buildViewerActions(p),
    );
  }

  Widget _buildOwnerActions(ProfileDetail p) {
    return Row(
      children: [
        Expanded(
          flex: 3,
          child: _PrimaryButton(
            label: 'Edit profile',
            onTap: () {
              showProfileEditSheet(
                context,
                profile: p,
                onSaved: (updated) => setState(() => _profile = updated),
              );
            },
          ),
        ),
        const SizedBox(width: 8),
        _IconActionButton(
          icon: Icons.settings_outlined,
          onTap: () => _showToast('Settings coming soon'),
        ),
        const SizedBox(width: 8),
        _IconActionButton(
          icon: Icons.share_outlined,
          onTap: () => _showToast('Share coming soon'),
        ),
      ],
    );
  }

  Widget _buildViewerActions(ProfileDetail p) {
    return Row(
      children: [
        Expanded(
          flex: 3,
          child: _followLoading
              ? _PrimaryButton(
                  label: 'Updating...',
                  onTap: null,
                  ghost: p.isFollowing,
                  followStyle: true,
                )
              : _PrimaryButton(
                  label: p.isFollowing ? 'Following' : 'Follow',
                  onTap: _toggleFollow,
                  ghost: p.isFollowing,
                  followStyle: true,
                ),
        ),
        const SizedBox(width: 8),
        Expanded(
          flex: 2,
          child: _SecondaryButton(
            label: 'Message',
            onTap: () => _showToast('Messaging coming soon'),
          ),
        ),
        const SizedBox(width: 8),
        _IconActionButton(icon: Icons.more_horiz_rounded, onTap: _showMoreMenu),
      ],
    );
  }

  // ── Bio ───────────────────────────────────────────────────────────────────

  bool _hasBio(ProfileDetail p, bool isOwner, ProfileVisibility? vis) {
    final canBio = _canView(vis?.bio ?? 'public', isOwner, p.isFollowing);
    return canBio && (p.bio?.trim().isNotEmpty == true);
  }

  Widget _buildBioSection(
    ProfileDetail p,
    bool isOwner,
    ProfileVisibility? vis,
  ) {
    final bio = (p.bio ?? '').trim();
    if (bio.isEmpty) return const SizedBox.shrink();
    const maxLines = 4;
    final style = const TextStyle(
      color: Color(0xFFBCC8E0),
      fontSize: 14,
      height: 1.55,
    );

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            bio,
            style: style,
            maxLines: _bioExpanded ? null : maxLines,
            overflow: _bioExpanded
                ? TextOverflow.visible
                : TextOverflow.ellipsis,
          ),
          if (_needsBioExpand(bio))
            GestureDetector(
              onTap: () => setState(() => _bioExpanded = !_bioExpanded),
              child: Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text(
                  _bioExpanded ? 'See less' : 'See more',
                  style: const TextStyle(
                    color: _accent,
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  bool _needsBioExpand(String bio) {
    // Rough estimate: more than ~220 chars or multiple newlines
    return bio.length > 220 || bio.split('\n').length > 4;
  }

  // ── Info section ──────────────────────────────────────────────────────────

  Widget _buildInfoSection(
    ProfileDetail p,
    bool isOwner,
    ProfileVisibility? vis,
  ) {
    final rows = <Widget>[];

    // Location
    final canLocation = _canView(
      vis?.location ?? 'public',
      isOwner,
      p.isFollowing,
    );
    final locValue = canLocation ? (p.location?.trim() ?? '') : '';
    if ((isOwner && canLocation) ||
        (!isOwner && canLocation && locValue.isNotEmpty)) {
      rows.add(
        _InfoRow(
          icon: Icons.location_on_outlined,
          value: locValue.isEmpty ? null : locValue,
          muted: locValue.isEmpty,
          lockedBadge: !canLocation && !isOwner
              ? _visibilityBadge(vis?.location ?? 'public')
              : null,
        ),
      );
    }

    // Workplace
    final canWork = _canView(
      vis?.workplace ?? 'public',
      isOwner,
      p.isFollowing,
    );
    final workValue = canWork ? (p.workplace?.companyName.trim() ?? '') : '';
    if ((isOwner && canWork) || (!isOwner && canWork && workValue.isNotEmpty)) {
      rows.add(
        _InfoRow(
          icon: Icons.business_center_outlined,
          value: workValue.isEmpty ? null : workValue,
          muted: workValue.isEmpty,
          lockedBadge: !canWork && !isOwner
              ? _visibilityBadge(vis?.workplace ?? 'public')
              : null,
        ),
      );
    }

    // Birthday
    final canBirth = _canView(
      vis?.birthdate ?? 'public',
      isOwner,
      p.isFollowing,
    );
    final birthValue = canBirth ? _formatBirthdate(p.birthdate) : '';
    if ((isOwner && canBirth) ||
        (!isOwner && canBirth && birthValue.isNotEmpty)) {
      rows.add(
        _InfoRow(
          icon: Icons.cake_outlined,
          value: birthValue.isEmpty ? null : birthValue,
          muted: birthValue.isEmpty,
          lockedBadge: !canBirth && !isOwner
              ? _visibilityBadge(vis?.birthdate ?? 'public')
              : null,
        ),
      );
    }

    // Gender
    final canGender = _canView(vis?.gender ?? 'public', isOwner, p.isFollowing);
    final genderValue = canGender ? _formatGender(p.gender) : '';
    if ((isOwner && canGender) ||
        (!isOwner && canGender && genderValue.isNotEmpty)) {
      rows.add(
        _InfoRow(
          icon: Icons.person_outline_rounded,
          value: genderValue.isEmpty ? null : genderValue,
          muted: genderValue.isEmpty,
          lockedBadge: !canGender && !isOwner
              ? _visibilityBadge(vis?.gender ?? 'public')
              : null,
        ),
      );
    }

    if (rows.isEmpty) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
      child: Container(
        decoration: BoxDecoration(
          color: _surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: _border),
        ),
        child: Column(
          children: rows
              .asMap()
              .entries
              .map(
                (e) => Column(
                  children: [
                    e.value,
                    if (e.key < rows.length - 1)
                      const Divider(
                        height: 1,
                        color: Color(0xFF1A2740),
                        indent: 16,
                        endIndent: 16,
                      ),
                  ],
                ),
              )
              .toList(),
        ),
      ),
    );
  }

  // ── Loading skeleton ──────────────────────────────────────────────────────

  Widget _buildLoadingSkeleton() {
    return CustomScrollView(
      slivers: [
        const SliverAppBar(
          backgroundColor: Color(0xFF0D1526),
          pinned: true,
          leading: BackButton(color: Color(0xFF9BAECF)),
        ),
        SliverPadding(
          padding: const EdgeInsets.all(16),
          sliver: SliverList(
            delegate: SliverChildListDelegate([
              const _SkeletonBox(width: 84, height: 84, radius: 42),
              const SizedBox(height: 12),
              const _SkeletonBox(width: 160, height: 20, radius: 6),
              const SizedBox(height: 8),
              const _SkeletonBox(width: 100, height: 14, radius: 6),
              const SizedBox(height: 16),
              Row(
                children: const [
                  _SkeletonBox(width: 70, height: 50, radius: 8),
                  SizedBox(width: 10),
                  _SkeletonBox(width: 70, height: 50, radius: 8),
                  SizedBox(width: 10),
                  _SkeletonBox(width: 70, height: 50, radius: 8),
                ],
              ),
              const SizedBox(height: 16),
              const _SkeletonBox(width: double.infinity, height: 40, radius: 8),
              const SizedBox(height: 16),
              const _SkeletonBox(width: double.infinity, height: 70, radius: 8),
            ]),
          ),
        ),
      ],
    );
  }

  // ── Special views ─────────────────────────────────────────────────────────

  Widget _buildBlockedView() {
    return _SpecialStateView(
      icon: Icons.lock_outline_rounded,
      iconColor: const Color(0xFF7A8BB0),
      title: 'Profile is not available',
      body: _blockedMessage,
      buttonLabel: 'Go back',
      onButton: () => Navigator.of(context).pop(),
    );
  }

  Widget _buildPrivateView() {
    return _SpecialStateView(
      icon: Icons.lock_rounded,
      iconColor: _accent,
      title: 'This profile is private',
      body:
          'The owner has limited access to their profile. Follow requests may be required to view their content.',
      buttonLabel: 'Go back',
      onButton: () => Navigator.of(context).pop(),
    );
  }

  Widget _buildErrorView({String? message}) {
    return _SpecialStateView(
      icon: Icons.error_outline_rounded,
      iconColor: _danger,
      title: 'Unable to load profile',
      body: message ?? _error ?? 'Something went wrong',
      buttonLabel: 'Retry',
      onButton: _loadProfile,
    );
  }
}

// ── Sub-widgets ───────────────────────────────────────────────────────────────

class _StatCard extends StatelessWidget {
  const _StatCard({
    required this.label,
    required this.value,
    this.onTap,
    this.locked = false,
  });
  final String label;
  final String value;
  final VoidCallback? onTap;
  final bool locked;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 12),
          decoration: BoxDecoration(
            color: const Color(0xFF111827),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: const Color(0xFF1E2D48)),
          ),
          child: Column(
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    value,
                    style: const TextStyle(
                      color: Color(0xFFE8ECF8),
                      fontSize: 17,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  if (locked)
                    const Padding(
                      padding: EdgeInsets.only(left: 3),
                      child: Icon(
                        Icons.lock_outline_rounded,
                        size: 11,
                        color: Color(0xFF4A5568),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 2),
              Text(
                label,
                style: const TextStyle(color: Color(0xFF7A8BB0), fontSize: 11),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _PrimaryButton extends StatelessWidget {
  const _PrimaryButton({
    required this.label,
    required this.onTap,
    this.ghost = false,
    this.followStyle = false,
  });
  final String label;
  final VoidCallback? onTap;
  final bool ghost;
  final bool followStyle;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 11),
        decoration: BoxDecoration(
          color: ghost
              ? Colors.transparent
              : (followStyle
                    ? const Color(0xFF1F5FCC)
                    : const Color(0xFF2563EB)),
          gradient: (!ghost && followStyle)
              ? const LinearGradient(
                  colors: [Color(0xFF2F79F3), Color(0xFF1F5FCC)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                )
              : null,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: ghost
                ? const Color(0xFF2563EB)
                : (followStyle ? const Color(0xFF3A7DE0) : Colors.transparent),
          ),
        ),
        alignment: Alignment.center,
        child: Text(
          label,
          style: TextStyle(
            color: ghost ? const Color(0xFF4AA3E4) : Colors.white,
            fontSize: 14,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
    );
  }
}

class _SecondaryButton extends StatelessWidget {
  const _SecondaryButton({required this.label, required this.onTap});
  final String label;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 11),
        decoration: BoxDecoration(
          color: Colors.transparent,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: const Color(0xFF1E2D48)),
        ),
        alignment: Alignment.center,
        child: Text(
          label,
          style: const TextStyle(
            color: Color(0xFFD0D8EE),
            fontSize: 14,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
    );
  }
}

class _IconActionButton extends StatelessWidget {
  const _IconActionButton({required this.icon, required this.onTap});
  final IconData icon;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 40,
        height: 40,
        decoration: BoxDecoration(
          color: Colors.transparent,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: const Color(0xFF1E2D48)),
        ),
        child: Icon(icon, color: const Color(0xFF9BAECF), size: 20),
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({
    required this.icon,
    this.value,
    this.muted = false,
    this.lockedBadge,
  });
  final IconData icon;
  final String? value;
  final bool muted;
  final String? lockedBadge;

  @override
  Widget build(BuildContext context) {
    final display = lockedBadge ?? value ?? '—';
    final isMuted = muted || (lockedBadge != null);

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      child: Row(
        children: [
          Icon(icon, color: const Color(0xFF4A6080), size: 18),
          const SizedBox(width: 12),
          Expanded(
            child: Row(
              children: [
                Flexible(
                  child: Text(
                    display,
                    style: TextStyle(
                      color: isMuted
                          ? const Color(0xFF4A5568)
                          : const Color(0xFFBCC8E0),
                      fontSize: 14,
                    ),
                  ),
                ),
                if (lockedBadge != null) ...[
                  const SizedBox(width: 6),
                  const Icon(
                    Icons.lock_outline_rounded,
                    size: 12,
                    color: Color(0xFF4A5568),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _AboutRow extends StatelessWidget {
  const _AboutRow({
    required this.icon,
    required this.label,
    required this.value,
    required this.muted,
  });
  final IconData icon;
  final String label;
  final String value;
  final bool muted;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: const Color(0xFF4AA3E4)),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: const TextStyle(
                    color: Color(0xFF7A8BB0),
                    fontSize: 11,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  value,
                  style: TextStyle(
                    color: muted
                        ? const Color(0xFF4A5568)
                        : const Color(0xFFD0D8EE),
                    fontSize: 14,
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

class _MoreMenuItem extends StatelessWidget {
  const _MoreMenuItem({
    required this.icon,
    required this.label,
    required this.onTap,
  });
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: Icon(icon, color: const Color(0xFF9BAECF), size: 22),
      title: Text(
        label,
        style: const TextStyle(color: Color(0xFFD0D8EE), fontSize: 15),
      ),
      onTap: onTap,
      dense: true,
      contentPadding: const EdgeInsets.symmetric(horizontal: 20),
    );
  }
}

// ── Special state view ────────────────────────────────────────────────────────

class _SpecialStateView extends StatelessWidget {
  const _SpecialStateView({
    required this.icon,
    required this.iconColor,
    required this.title,
    required this.body,
    required this.buttonLabel,
    required this.onButton,
  });
  final IconData icon;
  final Color iconColor;
  final String title;
  final String body;
  final String buttonLabel;
  final VoidCallback onButton;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0B1020),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0D1526),
        elevation: 0,
        leading: IconButton(
          icon: const Icon(
            Icons.arrow_back_ios_new_rounded,
            color: Color(0xFF9BAECF),
            size: 20,
          ),
          onPressed: () => Navigator.of(context).pop(),
        ),
      ),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 68,
                height: 68,
                decoration: BoxDecoration(
                  color: iconColor.withValues(alpha: 0.12),
                  shape: BoxShape.circle,
                ),
                child: Icon(icon, color: iconColor, size: 32),
              ),
              const SizedBox(height: 20),
              Text(
                title,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: Color(0xFFE8ECF8),
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 10),
              Text(
                body,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: Color(0xFF7A8BB0),
                  fontSize: 14,
                  height: 1.5,
                ),
              ),
              const SizedBox(height: 28),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: onButton,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF1E2D48),
                    foregroundColor: const Color(0xFFE8ECF8),
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10),
                    ),
                    elevation: 0,
                  ),
                  child: Text(
                    buttonLabel,
                    style: const TextStyle(fontSize: 14),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Skeleton box ──────────────────────────────────────────────────────────────

class _SkeletonBox extends StatelessWidget {
  const _SkeletonBox({
    required this.width,
    required this.height,
    required this.radius,
  });
  final double width;
  final double height;
  final double radius;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width == double.infinity ? double.infinity : width,
      height: height,
      decoration: BoxDecoration(
        color: const Color(0xFF1A2740),
        borderRadius: BorderRadius.circular(radius),
      ),
    );
  }
}

// ── Profile tab bar delegate (sticky) ─────────────────────────────────────────

class _ProfileTabBarDelegate extends SliverPersistentHeaderDelegate {
  const _ProfileTabBarDelegate(
    this._tabBar, {
    required this.backgroundColor,
    required this.borderColor,
  });

  final TabBar _tabBar;
  final Color backgroundColor;
  final Color borderColor;

  @override
  double get minExtent => _tabBar.preferredSize.height;

  @override
  double get maxExtent => _tabBar.preferredSize.height;

  @override
  Widget build(
    BuildContext context,
    double shrinkOffset,
    bool overlapsContent,
  ) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: backgroundColor,
        border: Border(bottom: BorderSide(color: borderColor, width: 0.5)),
      ),
      child: SizedBox(height: maxExtent, child: _tabBar),
    );
  }

  @override
  bool shouldRebuild(_ProfileTabBarDelegate oldDelegate) =>
      oldDelegate._tabBar != _tabBar;
}

// ── Profile tab content (grid) ────────────────────────────────────────────────

class _ProfileTabContent extends StatelessWidget {
  const _ProfileTabContent({
    required this.tabKey,
    required this.items,
    required this.loading,
    required this.loaded,
    required this.error,
    required this.emptyText,
    required this.onTap,
    this.isOwner = true,
  });

  final String tabKey;
  final List<Map<String, dynamic>> items;
  final bool loading;
  final bool loaded;
  final String error;
  final String emptyText;
  final void Function(Map<String, dynamic>) onTap;
  final bool isOwner;

  // Helper: non-grid states wrapped in scrollable so NestedScrollView works
  Widget _centeredScrollable(Widget child) {
    return CustomScrollView(
      physics: const AlwaysScrollableScrollPhysics(),
      slivers: [
        SliverFillRemaining(hasScrollBody: false, child: Center(child: child)),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    // Saved tab: non-owners see lockout message
    if (tabKey == 'saved' && !isOwner) {
      return _centeredScrollable(
        const Padding(
          padding: EdgeInsets.all(32),
          child: Text(
            'You cannot view saved items here.',
            style: TextStyle(color: Color(0xFF9BAECF), fontSize: 14),
            textAlign: TextAlign.center,
          ),
        ),
      );
    }

    // Loading skeleton: 9 grey boxes
    if (loading && !loaded) {
      return GridView.builder(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: EdgeInsets.zero,
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 3,
          mainAxisSpacing: 2,
          crossAxisSpacing: 2,
        ),
        itemCount: 9,
        itemBuilder: (_, __) => const ColoredBox(color: Color(0xFF1A2740)),
      );
    }

    // Error
    if (error.isNotEmpty) {
      return _centeredScrollable(
        Padding(
          padding: const EdgeInsets.all(32),
          child: Text(
            error,
            style: const TextStyle(color: Color(0xFFE57373), fontSize: 14),
            textAlign: TextAlign.center,
          ),
        ),
      );
    }

    // Empty
    if (loaded && items.isEmpty) {
      return _centeredScrollable(
        Padding(
          padding: const EdgeInsets.all(32),
          child: Text(
            emptyText,
            style: const TextStyle(color: Color(0xFF9BAECF), fontSize: 14),
            textAlign: TextAlign.center,
          ),
        ),
      );
    }

    // Initial state (not yet loading, not yet loaded) → empty scrollable placeholder
    if (!loading && !loaded) {
      return CustomScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: const [SliverToBoxAdapter(child: SizedBox.shrink())],
      );
    }

    // Grid
    return GridView.builder(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: EdgeInsets.zero,
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 3,
        mainAxisSpacing: 2,
        crossAxisSpacing: 2,
      ),
      itemCount: items.length,
      itemBuilder: (context, i) => _GridTile(
        item: items[i],
        showRepostBadge: tabKey == 'repost',
        onTap: () => onTap(items[i]),
      ),
    );
  }
}

// ── Grid tile ─────────────────────────────────────────────────────────────────

class _GridTile extends StatelessWidget {
  const _GridTile({
    required this.item,
    required this.onTap,
    this.showRepostBadge = false,
  });

  final Map<String, dynamic> item;
  final VoidCallback onTap;
  final bool showRepostBadge;

  /// Convert a Cloudinary video URL to a static thumbnail image URL.
  /// e.g. .../video/upload/v123/file.mp4 → .../video/upload/so_0/v123/file.jpg
  static String? _cloudinaryVideoThumb(String url) {
    const marker = '/video/upload/';
    final idx = url.indexOf(marker);
    if (idx == -1) return null;
    final before = url.substring(0, idx + marker.length);
    final after = url.substring(idx + marker.length);
    final dotIdx = after.lastIndexOf('.');
    final pathNoExt = dotIdx >= 0 ? after.substring(0, dotIdx) : after;
    return '${before}so_0/$pathNoExt.jpg';
  }

  String? _thumbnailUrl() {
    final media = item['media'] as List?;
    if (media != null && media.isNotEmpty) {
      final first = media[0] as Map?;
      if (first != null) {
        final thumb = first['thumbnailUrl'] as String?;
        if (thumb != null && thumb.isNotEmpty) return thumb;
        final url = first['url'] as String?;
        if (url == null) return null;
        // For video items, try to derive a static thumbnail from Cloudinary
        final type = first['type'] as String?;
        if (type == 'video') return _cloudinaryVideoThumb(url) ?? url;
        return url;
      }
    }
    final thumbnail = item['thumbnail'] as String?;
    if (thumbnail != null) return thumbnail;
    final coverImage = item['coverImage'] as String?;
    if (coverImage != null) return coverImage;
    return null;
  }

  bool _isVideo() {
    final kind = item['kind'] as String?;
    if (kind == 'reel') return true;
    final media = item['media'] as List?;
    if (media != null && media.isNotEmpty) {
      final first = media[0] as Map?;
      if (first != null && first['type'] == 'video') return true;
    }
    return false;
  }

  String _formatCount(dynamic raw) {
    final n = (raw is int)
        ? raw
        : (raw is double)
        ? raw.toInt()
        : int.tryParse(raw?.toString() ?? '') ?? 0;
    if (n >= 1000000) return '${(n / 1000000).toStringAsFixed(1)}M';
    if (n >= 1000) return '${(n / 1000).toStringAsFixed(1)}K';
    return n.toString();
  }

  @override
  Widget build(BuildContext context) {
    final thumb = _thumbnailUrl();
    final views = (item['stats'] as Map?)?['views'];
    final isVideo = _isVideo();

    return GestureDetector(
      onTap: onTap,
      child: Stack(
        fit: StackFit.expand,
        children: [
          // Thumbnail
          if (thumb != null)
            Image.network(
              thumb,
              fit: BoxFit.cover,
              errorBuilder: (_, __, ___) =>
                  const ColoredBox(color: Color(0xFF1A2740)),
            )
          else
            const ColoredBox(color: Color(0xFF1A2740)),

          // Video play indicator (top-right)
          if (isVideo)
            const Positioned(
              top: 6,
              right: 6,
              child: Icon(
                Icons.play_circle_filled,
                color: Colors.white70,
                size: 18,
              ),
            ),

          // Repost badge (top-left)
          if (showRepostBadge)
            const Positioned(
              top: 6,
              left: 6,
              child: Icon(Icons.repeat, color: Colors.white70, size: 16),
            ),

          // Views count (bottom-left)
          if (views != null)
            Positioned(
              bottom: 4,
              left: 4,
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.visibility, color: Colors.white, size: 12),
                  const SizedBox(width: 2),
                  Text(
                    _formatCount(views),
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      shadows: [Shadow(blurRadius: 3, color: Colors.black54)],
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
