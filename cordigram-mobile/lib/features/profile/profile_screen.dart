import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:image_cropper/image_cropper.dart';
import 'package:image_picker/image_picker.dart';
import '../../core/services/auth_storage.dart';
import '../report/report_comment_sheet.dart';
import 'follow_list_sheet.dart';
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

class _ProfileScreenState extends State<ProfileScreen> {
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
    _viewerId = _decodeViewerId();
    _loadProfile();
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
      if (!_canView(vis, isOwner, isFollowing)) {
        setState(() => _privateView = true);
      }
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
    final p = _profile;
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
                _showToast('Block coming soon');
              },
            ),
            _MoreMenuItem(
              icon: Icons.flag_outlined,
              label: 'Report',
              onTap: () {
                Navigator.pop(context);
                _showToast('Report user coming soon');
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
    return Scaffold(backgroundColor: _bg, body: _buildBody());
  }

  Widget _buildBody() {
    if (_loading) return _buildLoadingSkeleton();
    if (_blockedView) return _buildBlockedView();
    if (_privateView && _profile == null) return _buildPrivateView();
    if (_error != null && _profile == null) return _buildErrorView();

    final p = _profile!;
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
              const SizedBox(height: 32),
            ],
          ),
        ),
      ],
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
    final initial =
        (p.displayName.isNotEmpty ? p.displayName[0] : p.username[0])
            .toUpperCase();
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
      child: isOwner ? _buildOwnerActions() : _buildViewerActions(p),
    );
  }

  Widget _buildOwnerActions() {
    return Row(
      children: [
        Expanded(
          flex: 3,
          child: _PrimaryButton(
            label: 'Edit profile',
            onTap: () {
              if (_profile == null) return;
              showProfileEditSheet(
                context,
                profile: _profile!,
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
                )
              : _PrimaryButton(
                  label: p.isFollowing ? 'Following' : 'Follow',
                  onTap: _toggleFollow,
                  ghost: p.isFollowing,
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
    final bio = p.bio!.trim();
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
    if (isOwner || canLocation) {
      rows.add(
        _InfoRow(
          icon: Icons.location_on_outlined,
          value: locValue.isEmpty
              ? (canLocation
                    ? null
                    : _visibilityBadge(vis?.location ?? 'public'))
              : locValue,
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
    if (isOwner || canWork) {
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
    if (isOwner || (canBirth && birthValue.isNotEmpty)) {
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
    if (isOwner || (canGender && genderValue.isNotEmpty)) {
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

  Widget _buildErrorView() {
    return _SpecialStateView(
      icon: Icons.error_outline_rounded,
      iconColor: _danger,
      title: 'Unable to load profile',
      body: _error ?? 'Something went wrong',
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
  });
  final String label;
  final VoidCallback? onTap;
  final bool ghost;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 11),
        decoration: BoxDecoration(
          color: ghost ? Colors.transparent : const Color(0xFF2563EB),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: ghost ? const Color(0xFF2563EB) : Colors.transparent,
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
