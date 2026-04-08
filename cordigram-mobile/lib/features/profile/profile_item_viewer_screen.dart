import 'dart:async';
import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:video_player/video_player.dart';
import '../../core/services/api_service.dart';
import '../../core/services/auth_storage.dart';
import '../home/models/feed_post.dart';
import '../home/services/post_interaction_service.dart';
import '../home/widgets/post_card.dart' show PostMenuAction;
import '../post/post_detail_screen.dart';
import '../post/utils/post_edit_utils.dart';
import '../post/utils/repost_flow_utils.dart';
import '../profile/profile_screen.dart';
import '../reels/reels_screen.dart' show ReelCommentSheet;
import '../report/report_post_sheet.dart';

Map<String, dynamic>? _asStringKeyMap(dynamic raw) {
  if (raw is Map<String, dynamic>) return raw;
  if (raw is Map) {
    return raw.map((k, v) => MapEntry(k.toString(), v));
  }
  return null;
}

String? _pickString(List<dynamic> values) {
  for (final v in values) {
    if (v is String) {
      final s = v.trim();
      if (s.isNotEmpty) return s;
    }
  }
  return null;
}

Map<String, dynamic> _normalizeItem(
  Map<String, dynamic> raw, {
  String? fallbackAuthorId,
  String? fallbackAuthorUsername,
  String? fallbackAuthorDisplayName,
  String? fallbackAuthorAvatarUrl,
}) {
  final item = Map<String, dynamic>.from(raw);

  final author = _asStringKeyMap(item['author']) ?? <String, dynamic>{};
  final repostOfAuthor =
      _asStringKeyMap(item['repostOfAuthor']) ?? <String, dynamic>{};
  final repostSourceProfile =
      _asStringKeyMap(item['repostSourceProfile']) ?? <String, dynamic>{};
  final repostedBy = _asStringKeyMap(item['repostedBy']) ?? <String, dynamic>{};

  author['id'] ??= _pickString([
    item['authorId'],
    item['userId'],
    repostedBy['id'],
    repostedBy['userId'],
    fallbackAuthorId,
  ]);
  author['username'] ??= _pickString([
    item['authorUsername'],
    item['username'],
    item['ownerUsername'],
    item['postedByUsername'],
    item['repostedByUsername'],
    repostedBy['username'],
    fallbackAuthorUsername,
  ]);
  author['displayName'] ??= _pickString([
    item['authorDisplayName'],
    item['displayName'],
    item['ownerDisplayName'],
    item['postedByDisplayName'],
    item['repostedByDisplayName'],
    repostedBy['displayName'],
    fallbackAuthorDisplayName,
  ]);
  author['avatarUrl'] ??= _pickString([
    item['authorAvatarUrl'],
    item['avatarUrl'],
    item['ownerAvatarUrl'],
    item['postedByAvatarUrl'],
    item['repostedByAvatarUrl'],
    repostedBy['avatarUrl'],
    fallbackAuthorAvatarUrl,
  ]);
  author['isCreatorVerified'] ??=
      item['authorIsCreatorVerified'] ?? item['isVerified'];

  item['author'] = author;
  item['authorId'] ??= author['id'];
  item['authorUsername'] ??= author['username'];
  item['authorDisplayName'] ??= author['displayName'];
  item['authorAvatarUrl'] ??= author['avatarUrl'];

  final repostOf = _pickString([item['repostOf']]);
  if (repostOf != null) {
    item['repostOf'] = repostOf;
    repostOfAuthor['id'] ??= _pickString([
      item['repostOfAuthorId'],
      repostSourceProfile['id'],
      repostSourceProfile['userId'],
      item['originAuthorId'],
    ]);
    repostOfAuthor['username'] ??= _pickString([
      item['repostOfAuthorUsername'],
      repostSourceProfile['username'],
      item['originAuthorUsername'],
      item['sourceAuthorUsername'],
    ]);
    repostOfAuthor['displayName'] ??= _pickString([
      item['repostOfAuthorDisplayName'],
      repostSourceProfile['displayName'],
      item['originAuthorDisplayName'],
      item['sourceAuthorDisplayName'],
    ]);
    repostOfAuthor['avatarUrl'] ??= _pickString([
      item['repostOfAuthorAvatarUrl'],
      repostSourceProfile['avatarUrl'],
      item['originAuthorAvatarUrl'],
      item['sourceAuthorAvatarUrl'],
    ]);

    if (repostOfAuthor.isNotEmpty) {
      item['repostOfAuthor'] = repostOfAuthor;
      item['repostOfAuthorId'] ??= repostOfAuthor['id'];
      item['repostOfAuthorUsername'] ??= repostOfAuthor['username'];
      item['repostOfAuthorDisplayName'] ??= repostOfAuthor['displayName'];
      item['repostOfAuthorAvatarUrl'] ??= repostOfAuthor['avatarUrl'];
    }
  }

  return item;
}

String _resolveRepostOriginName(Map<String, dynamic> item) {
  final repostOfAuthor = _asStringKeyMap(item['repostOfAuthor']);
  final resolved = _pickString([
    repostOfAuthor?['displayName'],
    item['repostOfAuthorDisplayName'],
    repostOfAuthor?['username'],
    item['repostOfAuthorUsername'],
  ]);
  if (resolved == null) {
    debugPrint(
      '[ProfileRepostOriginMissing] '
      'itemId=${item['id']} repostOf=${item['repostOf']} '
      'repostOfAuthorUsername=${item['repostOfAuthorUsername']} '
      'repostOfAuthorDisplayName=${item['repostOfAuthorDisplayName']} '
      'repostOfAuthorMap=${item['repostOfAuthor']}',
    );
  }
  return resolved ?? 'Original Author';
}

String _resolveRepostOriginId(Map<String, dynamic> item) {
  final repostOfAuthor = _asStringKeyMap(item['repostOfAuthor']);
  return _pickString([repostOfAuthor?['id'], item['repostOfAuthorId']]) ?? '';
}

FeedPostState? _toFeedPostState(
  Map<String, dynamic> raw, {
  String? fallbackAuthorId,
  String? fallbackAuthorUsername,
  String? fallbackAuthorDisplayName,
  String? fallbackAuthorAvatarUrl,
}) {
  try {
    final normalized = _normalizeItem(
      raw,
      fallbackAuthorId: fallbackAuthorId,
      fallbackAuthorUsername: fallbackAuthorUsername,
      fallbackAuthorDisplayName: fallbackAuthorDisplayName,
      fallbackAuthorAvatarUrl: fallbackAuthorAvatarUrl,
    );
    return FeedPostState(post: FeedPost.fromJson(normalized));
  } catch (_) {
    return null;
  }
}

int? _extractExpectedDurationMs(Map<String, dynamic> item) {
  final normalized = _normalizeItem(item);
  final raw = normalized['primaryVideoDurationMs'];
  int? ms;
  if (raw is num) {
    ms = raw.toInt();
  } else if (raw is String) {
    ms = int.tryParse(raw);
  }
  if (ms == null || ms <= 0) return null;
  // Defensive normalization: some payloads may provide seconds.
  return ms < 1000 ? ms * 1000 : ms;
}

class _AdCreativePreview {
  const _AdCreativePreview({
    required this.primaryText,
    required this.headline,
    required this.description,
    required this.destinationUrl,
    required this.cta,
  });

  final String primaryText;
  final String headline;
  final String description;
  final String? destinationUrl;
  final String cta;
}

bool _hasAdStructuredMarkers(String value) => RegExp(
  r'\[\[/?AD_(PRIMARY_TEXT|HEADLINE|DESCRIPTION|CTA|URL)\]\]',
  caseSensitive: false,
).hasMatch(value);

String _stripAdMarkup(String value) {
  if (value.trim().isEmpty) return '';
  return value
      .replaceAll(RegExp(r'\[\[/?AD_[A-Z_]+\]\]', caseSensitive: false), '')
      .replaceAll(RegExp(r'\n{3,}'), '\n\n')
      .trim();
}

_AdCreativePreview? _parseAdCreativePreview(String value) {
  final raw = value.replaceAll('\r', '').trim();
  if (raw.isEmpty) return null;

  String extractBlock(String name) {
    final pattern = RegExp(
      r'\[\[AD_' + name + r'\]\]([\s\S]*?)\[\[/AD_' + name + r'\]\]',
      caseSensitive: false,
    );
    final m = pattern.firstMatch(raw);
    if (m == null) return '';
    return (m.group(1) ?? '').replaceAll(RegExp(r'^\n+|\n+$'), '');
  }

  final pt = extractBlock('PRIMARY_TEXT').trim();
  final hl = extractBlock('HEADLINE').trim();
  final desc = extractBlock('DESCRIPTION').trim();
  final url = extractBlock('URL').trim();
  final cta = extractBlock('CTA').trim();

  if (pt.isNotEmpty || hl.isNotEmpty || desc.isNotEmpty || url.isNotEmpty) {
    return _AdCreativePreview(
      primaryText: pt,
      headline: hl,
      description: desc,
      destinationUrl: url.isNotEmpty ? url : null,
      cta: cta,
    );
  }

  final plain = _stripAdMarkup(raw);
  if (plain.isEmpty) return null;
  return _AdCreativePreview(
    primaryText: plain,
    headline: '',
    description: '',
    destinationUrl: null,
    cta: '',
  );
}

String _resolveAdDisplayText(String rawContent, _AdCreativePreview? creative) {
  if (creative != null && creative.primaryText.trim().isNotEmpty) {
    return creative.primaryText.trim();
  }
  return _stripAdMarkup(rawContent);
}

bool _isAdNormalizedItem(Map<String, dynamic> normalized) {
  final rawContent =
      (normalized['caption'] as String? ??
              normalized['content'] as String? ??
              '')
          .trim();
  final rawSource = (normalized['repostSourceContent'] as String? ?? '').trim();
  final kind = (normalized['kind'] as String? ?? '').toLowerCase();
  return normalized['sponsored'] == true ||
      kind == 'ad' ||
      _hasAdStructuredMarkers(rawContent) ||
      _hasAdStructuredMarkers(rawSource);
}

_AdCreativePreview? _resolveAdCreative(Map<String, dynamic> normalized) {
  final rawContent =
      (normalized['caption'] as String? ??
              normalized['content'] as String? ??
              '')
          .trim();
  final rawSource = (normalized['repostSourceContent'] as String? ?? '').trim();
  final source = _hasAdStructuredMarkers(rawSource) ? rawSource : rawContent;
  return _parseAdCreativePreview(source);
}

Future<void> _openAdDestinationUrl(BuildContext context, String? rawUrl) async {
  final value = (rawUrl ?? '').trim();
  if (value.isEmpty) return;
  final normalized = value.startsWith('http://') || value.startsWith('https://')
      ? value
      : 'https://$value';
  final uri = Uri.tryParse(normalized);
  if (uri == null || uri.host.isEmpty) return;
  await launchUrl(uri, mode: LaunchMode.externalApplication);
}

// ── Entry point ───────────────────────────────────────────────────────────────

/// Full-screen horizontal swipe viewer for posts/reels shown in a profile tab.
/// Mirrors the web's "profile post nav" (up/down arrows) but as left/right swipe.
class ProfileItemViewerScreen extends StatefulWidget {
  const ProfileItemViewerScreen({
    super.key,
    required this.items,
    required this.initialIndex,
    this.viewerId,
    this.profileUsername,
    this.profileDisplayName,
    this.profileAvatarUrl,
    this.profileUserId,
  });

  /// All items in the current profile tab (posts / reels / saved / repost).
  final List<Map<String, dynamic>> items;

  /// The item that was tapped — used as the first page.
  final int initialIndex;

  final String? viewerId;
  final String? profileUsername;
  final String? profileDisplayName;
  final String? profileAvatarUrl;
  final String? profileUserId;

  @override
  State<ProfileItemViewerScreen> createState() =>
      _ProfileItemViewerScreenState();
}

class _ProfileItemViewerScreenState extends State<ProfileItemViewerScreen> {
  late final PageController _pageController;
  int _currentIndex = 0;

  /// Lazily-initialized video controllers keyed by item list index.
  final Map<int, VideoPlayerController> _controllers = {};

  static const Color _bg = Colors.black;

  @override
  void initState() {
    super.initState();
    _currentIndex = widget.initialIndex;
    _pageController = PageController(initialPage: widget.initialIndex);
    _initController(_currentIndex);
    _initController(_currentIndex + 1);
    if (_currentIndex > 0) _initController(_currentIndex - 1);
  }

  @override
  void dispose() {
    _pageController.dispose();
    for (final c in _controllers.values) {
      c.dispose();
    }
    super.dispose();
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  bool _isVideo(Map<String, dynamic> item) {
    final kind = (item['repostKind'] as String?) ?? (item['kind'] as String?);
    if (kind == 'reel') return true;
    final media = item['media'] as List?;
    if (media != null && media.isNotEmpty) {
      final first = media[0] as Map?;
      if (first != null && first['type'] == 'video') return true;
    }
    return false;
  }

  String? _videoUrl(Map<String, dynamic> item) {
    final media = item['media'] as List?;
    if (media != null && media.isNotEmpty) {
      final first = media[0] as Map?;
      return first?['url'] as String?;
    }
    return null;
  }

  // ── Controller lifecycle ───────────────────────────────────────────────────

  Future<void> _initController(int index) async {
    if (index < 0 || index >= widget.items.length) return;
    if (_controllers.containsKey(index)) return;
    if (!_isVideo(widget.items[index])) return;

    final url = _videoUrl(widget.items[index]);
    if (url == null || url.isEmpty) return;

    final ctrl = VideoPlayerController.networkUrl(Uri.parse(url));
    _controllers[index] = ctrl;

    try {
      await ctrl.initialize();
      if (!mounted) return;

      final nativeDurMs = ctrl.value.duration.inMilliseconds;
      final expectedMs = _extractExpectedDurationMs(widget.items[index]);
      final shouldPatch =
          expectedMs != null &&
          (nativeDurMs <= 0 ||
              nativeDurMs < 1000 ||
              nativeDurMs < (expectedMs * 0.2));

      if (shouldPatch) {
        ctrl.value = ctrl.value.copyWith(
          duration: Duration(milliseconds: expectedMs),
        );
      }

      if (kDebugMode) {
        final itemId = (widget.items[index]['id'] as String?) ?? '';
        debugPrint(
          '[ProfileReelDuration] id=$itemId '
          'native=${nativeDurMs}ms expected=${expectedMs}ms '
          'effective=${ctrl.value.duration.inMilliseconds}ms',
        );
      }

      ctrl.setLooping(true);
      if (index == _currentIndex) ctrl.play();
      if (mounted) setState(() {});
    } catch (_) {
      _controllers.remove(index)?.dispose();
    }
  }

  void _onPageChanged(int index) {
    _controllers[_currentIndex]?.pause();
    setState(() => _currentIndex = index);
    _controllers[index]?.play();

    _initController(index - 1);
    _initController(index + 1);

    // Dispose controllers that are more than 2 pages away.
    final toRemove = _controllers.keys
        .where((k) => (k - index).abs() > 2)
        .toList();
    for (final k in toRemove) {
      _controllers.remove(k)?.dispose();
    }
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        backgroundColor: _bg,
        extendBodyBehindAppBar: true,
        appBar: AppBar(
          backgroundColor: const Color(0xCC000000),
          elevation: 0,
          leading: IconButton(
            icon: const Icon(
              Icons.arrow_back_ios_new_rounded,
              color: Colors.white,
              size: 20,
            ),
            onPressed: () => Navigator.of(context).pop(),
          ),
          title: widget.profileUsername != null
              ? Text(
                  '@${widget.profileUsername}',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                  ),
                )
              : null,
          centerTitle: true,
          actions: [
            Padding(
              padding: const EdgeInsets.only(right: 16),
              child: Center(
                child: Text(
                  '${_currentIndex + 1} / ${widget.items.length}',
                  style: const TextStyle(
                    color: Color(0xFFAABBCC),
                    fontSize: 13,
                  ),
                ),
              ),
            ),
          ],
        ),
        body: PageView.builder(
          controller: _pageController,
          onPageChanged: _onPageChanged,
          itemCount: widget.items.length,
          itemBuilder: (context, index) => _ItemPage(
            key: ValueKey(index),
            item: widget.items[index],
            isActive: index == _currentIndex,
            controller: _controllers[index],
            viewerId: widget.viewerId,
            profileUsername: widget.profileUsername,
            profileDisplayName: widget.profileDisplayName,
            profileAvatarUrl: widget.profileAvatarUrl,
            profileUserId: widget.profileUserId,
          ),
        ),
      ),
    );
  }
}

// ── Vertical reel-only viewer (Profile nav -> Reels) ───────────────────────

class ProfileReelViewerScreen extends StatefulWidget {
  const ProfileReelViewerScreen({
    super.key,
    required this.items,
    required this.initialIndex,
    this.viewerId,
    this.profileUsername,
    this.profileDisplayName,
    this.profileAvatarUrl,
    this.profileUserId,
  });

  final List<Map<String, dynamic>> items;
  final int initialIndex;
  final String? viewerId;
  final String? profileUsername;
  final String? profileDisplayName;
  final String? profileAvatarUrl;
  final String? profileUserId;

  @override
  State<ProfileReelViewerScreen> createState() =>
      _ProfileReelViewerScreenState();
}

class _ProfileReelViewerScreenState extends State<ProfileReelViewerScreen> {
  late final PageController _pageController;
  int _currentIndex = 0;
  final Map<int, VideoPlayerController> _controllers = {};
  final Set<String> _revealedPostIds = <String>{};

  String _itemIdAt(int index) {
    if (index < 0 || index >= widget.items.length) return '';
    return (widget.items[index]['id'] as String?) ?? '';
  }

  Map<String, dynamic>? _mediaAt(int index) {
    if (index < 0 || index >= widget.items.length) return null;
    final media = widget.items[index]['media'] as List?;
    if (media == null || media.isEmpty) return null;
    return _asStringKeyMap(media.first);
  }

  bool _isBlurredMediaAt(int index) {
    final media = _mediaAt(index);
    if (media == null) return false;
    final meta = _asStringKeyMap(media['metadata']) ?? const {};
    final decision =
        _pickString([
          media['moderationDecision'],
          meta['moderationDecision'],
        ]) ??
        '';
    final original = _pickString([
      media['originalSecureUrl'],
      meta['originalSecureUrl'],
      media['originalUrl'],
      meta['originalUrl'],
    ]);
    final id = _itemIdAt(index);
    return decision.toLowerCase() == 'blur' &&
        original != null &&
        original.isNotEmpty &&
        !_revealedPostIds.contains(id);
  }

  @override
  void initState() {
    super.initState();
    _currentIndex = widget.initialIndex.clamp(0, widget.items.length - 1);
    _pageController = PageController(initialPage: _currentIndex);
    _initController(_currentIndex);
    _initController(_currentIndex + 1);
    if (_currentIndex > 0) _initController(_currentIndex - 1);
  }

  @override
  void dispose() {
    _pageController.dispose();
    for (final c in _controllers.values) {
      c.dispose();
    }
    super.dispose();
  }

  String? _videoUrl(Map<String, dynamic> item) {
    final media = item['media'] as List?;
    if (media != null && media.isNotEmpty) {
      final first = _asStringKeyMap(media[0]);
      if (first == null) return null;
      final id = (item['id'] as String?) ?? '';
      final meta = _asStringKeyMap(first['metadata']) ?? const {};
      final decision =
          _pickString([
            first['moderationDecision'],
            meta['moderationDecision'],
          ]) ??
          '';
      final original = _pickString([
        first['originalSecureUrl'],
        meta['originalSecureUrl'],
        first['originalUrl'],
        meta['originalUrl'],
      ]);
      if (decision.toLowerCase() == 'blur' &&
          original != null &&
          original.isNotEmpty &&
          _revealedPostIds.contains(id)) {
        return original.startsWith('http://')
            ? 'https://${original.substring(7)}'
            : original;
      }
      return first['url'] as String?;
    }
    return null;
  }

  Future<void> _revealMediaAt(int index) async {
    if (index < 0 || index >= widget.items.length) return;
    final id = _itemIdAt(index);
    if (id.isEmpty) return;
    setState(() {
      _revealedPostIds.add(id);
    });
    _controllers.remove(index)?.dispose();
    await _initController(index);
    if (!mounted) return;
    if (index == _currentIndex) {
      _controllers[index]?.play();
    }
    setState(() {});
  }

  Future<void> _initController(int index) async {
    if (index < 0 || index >= widget.items.length) return;
    if (_controllers.containsKey(index)) return;
    final url = _videoUrl(widget.items[index]);
    if (url == null || url.isEmpty) return;

    final ctrl = VideoPlayerController.networkUrl(Uri.parse(url));
    _controllers[index] = ctrl;
    try {
      await ctrl.initialize();
      if (!mounted) return;

      final nativeDurMs = ctrl.value.duration.inMilliseconds;
      final expectedMs = _extractExpectedDurationMs(widget.items[index]);
      final shouldPatch =
          expectedMs != null &&
          (nativeDurMs <= 0 ||
              nativeDurMs < 1000 ||
              nativeDurMs < (expectedMs * 0.2));

      if (shouldPatch) {
        ctrl.value = ctrl.value.copyWith(
          duration: Duration(milliseconds: expectedMs),
        );
      }

      if (kDebugMode) {
        final itemId = (widget.items[index]['id'] as String?) ?? '';
        debugPrint(
          '[ProfileReelDuration] id=$itemId '
          'native=${nativeDurMs}ms expected=${expectedMs}ms '
          'effective=${ctrl.value.duration.inMilliseconds}ms',
        );
      }

      ctrl.setLooping(true);
      if (index == _currentIndex) ctrl.play();
      if (mounted) setState(() {});
    } catch (_) {
      _controllers.remove(index)?.dispose();
    }
  }

  void _onPageChanged(int index) {
    _controllers[_currentIndex]?.pause();
    setState(() => _currentIndex = index);
    _controllers[index]?.play();

    _initController(index - 1);
    _initController(index + 1);

    final toRemove = _controllers.keys
        .where((k) => (k - index).abs() > 2)
        .toList();
    for (final k in toRemove) {
      _controllers.remove(k)?.dispose();
    }
  }

  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        backgroundColor: Colors.black,
        body: Stack(
          children: [
            PageView.builder(
              controller: _pageController,
              scrollDirection: Axis.vertical,
              onPageChanged: _onPageChanged,
              itemCount: widget.items.length,
              itemBuilder: (context, index) => _ItemPage(
                key: ValueKey('reel-$index'),
                item: widget.items[index],
                isActive: index == _currentIndex,
                controller: _controllers[index],
                viewerId: widget.viewerId,
                forceReelUi: true,
                totalCount: widget.items.length,
                pageIndex: index,
                onBack: () => Navigator.of(context).pop(),
                profileUsername: widget.profileUsername,
                profileDisplayName: widget.profileDisplayName,
                profileAvatarUrl: widget.profileAvatarUrl,
                profileUserId: widget.profileUserId,
                showModerationRevealOverlay: _isBlurredMediaAt(index),
                onRevealMedia: () => _revealMediaAt(index),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Single item page ──────────────────────────────────────────────────────────

class _ItemPage extends StatefulWidget {
  const _ItemPage({
    super.key,
    required this.item,
    required this.isActive,
    this.controller,
    this.viewerId,
    this.forceReelUi = false,
    this.totalCount = 0,
    this.pageIndex = 0,
    this.onBack,
    this.profileUsername,
    this.profileDisplayName,
    this.profileAvatarUrl,
    this.profileUserId,
    this.showModerationRevealOverlay = false,
    this.onRevealMedia,
  });

  final Map<String, dynamic> item;
  final bool isActive;
  final VideoPlayerController? controller;
  final String? viewerId;
  final bool forceReelUi;
  final int totalCount;
  final int pageIndex;
  final VoidCallback? onBack;
  final String? profileUsername;
  final String? profileDisplayName;
  final String? profileAvatarUrl;
  final String? profileUserId;
  final bool showModerationRevealOverlay;
  final VoidCallback? onRevealMedia;

  @override
  State<_ItemPage> createState() => _ItemPageState();
}

class _ItemPageState extends State<_ItemPage> {
  bool _showPauseIcon = false;
  Timer? _pauseIconTimer;
  late final PageController _mediaPageController;
  int _mediaIndex = 0;

  bool _muted = false;
  bool _liked = false;
  bool _saved = false;
  bool _following = false;
  final Map<String, bool> _revealedMediaKeys = {};

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

  void _openUserProfile(String userId) {
    if (userId.isEmpty) return;
    Navigator.of(context).push(
      MaterialPageRoute<void>(builder: (_) => ProfileScreen(userId: userId)),
    );
  }

  @override
  void initState() {
    super.initState();
    _mediaPageController = PageController();
    widget.controller?.addListener(_onControllerUpdate);
    _bootstrapReelState();
  }

  @override
  void didUpdateWidget(_ItemPage old) {
    super.didUpdateWidget(old);
    if (old.controller != widget.controller) {
      old.controller?.removeListener(_onControllerUpdate);
      widget.controller?.addListener(_onControllerUpdate);
    }
  }

  @override
  void dispose() {
    _pauseIconTimer?.cancel();
    _mediaPageController.dispose();
    widget.controller?.removeListener(_onControllerUpdate);
    super.dispose();
  }

  void _bootstrapReelState() {
    final normalized = _normalizeItem(
      widget.item,
      fallbackAuthorId: widget.profileUserId,
      fallbackAuthorUsername: widget.profileUsername,
      fallbackAuthorDisplayName: widget.profileDisplayName,
      fallbackAuthorAvatarUrl: widget.profileAvatarUrl,
    );
    final stats = normalized['stats'] as Map?;
    _liked =
        (normalized['liked'] as bool?) ??
        (normalized['isLiked'] as bool?) ??
        false;
    _saved =
        (normalized['saved'] as bool?) ??
        (normalized['isSaved'] as bool?) ??
        false;
    _following =
        (normalized['following'] as bool?) ??
        (normalized['isFollowingAuthor'] as bool?) ??
        false;
    if (stats != null) {
      _liked = _liked || ((stats['likedByMe'] as bool?) ?? false);
      _saved = _saved || ((stats['savedByMe'] as bool?) ?? false);
    }
  }

  void _onControllerUpdate() {
    if (mounted) setState(() {});
  }

  void _handleVideoTap() {
    final ctrl = widget.controller;
    if (ctrl == null || !ctrl.value.isInitialized) return;
    if (ctrl.value.isPlaying) {
      ctrl.pause();
      setState(() => _showPauseIcon = true);
      _pauseIconTimer?.cancel();
      _pauseIconTimer = Timer(const Duration(milliseconds: 900), () {
        if (mounted) setState(() => _showPauseIcon = false);
      });
    } else {
      ctrl.play();
      setState(() => _showPauseIcon = false);
    }
  }

  bool get _isVideo {
    final kind =
        (widget.item['repostKind'] as String?) ??
        (widget.item['kind'] as String?);
    if (kind == 'reel') return true;
    final media = widget.item['media'] as List?;
    if (media != null && media.isNotEmpty) {
      final first = media[0] as Map?;
      if (first != null && first['type'] == 'video') return true;
    }
    return false;
  }

  String? get _imageUrl {
    final media = widget.item['media'] as List?;
    if (media != null && media.isNotEmpty) {
      final first = media[0] as Map?;
      if (first != null) {
        final thumb = first['thumbnailUrl'] as String?;
        if (thumb != null && thumb.isNotEmpty) return thumb;
        return first['url'] as String?;
      }
    }
    return widget.item['coverImage'] as String?;
  }

  @override
  Widget build(BuildContext context) {
    if (widget.forceReelUi) return _buildReelPage();
    return _isVideo ? _buildReelPage() : _buildImagePage();
  }

  List<Map<String, dynamic>> get _mediaItems =>
      (widget.item['media'] as List?)
          ?.whereType<Map<String, dynamic>>()
          .toList() ??
      [];

  String? _mediaDisplayUrl(int index) {
    if (index < 0 || index >= _mediaItems.length) return null;
    final m = _mediaItems[index];
    final original = _mediaOriginalUrl(index);
    final shouldReveal =
        _revealedMediaKeys[_mediaRevealKey(index)] == true &&
        _isMediaBlurredByModeration(index);
    if (shouldReveal && original != null) {
      return original.startsWith('http://')
          ? 'https://${original.substring(7)}'
          : original;
    }
    final type = (m['type'] as String?) ?? '';
    if (type == 'video') {
      final thumb = m['thumbnailUrl'] as String?;
      if (thumb != null && thumb.isNotEmpty) return thumb;
    }
    return m['url'] as String?;
  }

  String _mediaRevealKey(int index) {
    if (index < 0 || index >= _mediaItems.length) return 'media-$index';
    final m = _mediaItems[index];
    return (m['url'] as String?) ?? 'media-$index';
  }

  String? _mediaOriginalUrl(int index) {
    if (index < 0 || index >= _mediaItems.length) return null;
    final m = _mediaItems[index];
    final meta = _asStringKeyMap(m['metadata']) ?? const {};
    return _pickString([
      m['originalSecureUrl'],
      meta['originalSecureUrl'],
      m['originalUrl'],
      meta['originalUrl'],
    ]);
  }

  bool _isMediaBlurredByModeration(int index) {
    if (index < 0 || index >= _mediaItems.length) return false;
    final m = _mediaItems[index];
    final meta = _asStringKeyMap(m['metadata']) ?? const {};
    final decision =
        _pickString([m['moderationDecision'], meta['moderationDecision']]) ??
        '';
    final original = _mediaOriginalUrl(index);
    return decision.toLowerCase() == 'blur' &&
        original != null &&
        original.isNotEmpty;
  }

  int _asInt(dynamic v) {
    if (v is int) return v;
    if (v is double) return v.toInt();
    return int.tryParse(v?.toString() ?? '') ?? 0;
  }

  bool _asBool(dynamic v) {
    if (v is bool) return v;
    if (v is num) return v != 0;
    final s = (v?.toString() ?? '').toLowerCase();
    return s == 'true' || s == '1';
  }

  String _fmtCountInt(int n) {
    if (n >= 1000000) return '${(n / 1000000).toStringAsFixed(1)}M';
    if (n >= 1000) return '${(n / 1000).toStringAsFixed(1)}K';
    return '$n';
  }

  Future<void> _onLikeTap() async {
    final id = widget.item['id'] as String? ?? '';
    if (id.isEmpty) return;
    final before = _liked;
    final stats = widget.item['stats'] as Map<String, dynamic>?;
    final prevHearts = _asInt(stats?['hearts'] ?? stats?['likes']);
    setState(() {
      _liked = !before;
      if (stats != null) {
        final next = (prevHearts + (before ? -1 : 1)).clamp(0, 999999999);
        stats['hearts'] = next;
        stats['likes'] = next;
      }
    });
    try {
      if (before) {
        await PostInteractionService.unlike(id);
      } else {
        await PostInteractionService.like(id);
      }
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _liked = before;
        if (stats != null) {
          stats['hearts'] = prevHearts;
          stats['likes'] = prevHearts;
        }
      });
    }
  }

  Future<void> _onSaveTap() async {
    final id = widget.item['id'] as String? ?? '';
    if (id.isEmpty) return;
    final before = _saved;
    final stats = widget.item['stats'] as Map<String, dynamic>?;
    final prevSaves = _asInt(stats?['saves']);
    setState(() {
      _saved = !before;
      if (stats != null) {
        stats['saves'] = (prevSaves + (before ? -1 : 1)).clamp(0, 999999999);
      }
    });
    try {
      if (before) {
        await PostInteractionService.unsave(id);
      } else {
        await PostInteractionService.save(id);
      }
      _showSnack(before ? 'Removed from saved' : 'Saved');
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _saved = before;
        if (stats != null) stats['saves'] = prevSaves;
      });
      _showSnack('Failed to update save', error: true);
    }
  }

  Future<void> _onFollowTap() async {
    final authorId =
        (widget.item['authorId'] as String?) ??
        ((widget.item['author'] as Map?)?['id'] as String?) ??
        '';
    if (authorId.isEmpty) return;
    final before = _following;
    setState(() => _following = !before);
    try {
      if (before) {
        await PostInteractionService.unfollow(authorId);
      } else {
        await PostInteractionService.follow(authorId);
      }
    } catch (_) {
      if (!mounted) return;
      setState(() => _following = before);
    }
  }

  String _resolveOriginalPostId(Map<String, dynamic> normalized, String id) {
    final repostOf = (normalized['repostOf'] as String?)?.trim();
    if (repostOf != null && repostOf.isNotEmpty) return repostOf;
    return id;
  }

  void _incrementRepostStat(dynamic statsRaw) {
    if (statsRaw is! Map) return;
    final stats = statsRaw.cast<String, dynamic>();
    final curr = _asInt(stats['reposts'] ?? stats['shares']);
    final next = (curr + 1).clamp(0, 999999999);
    setState(() {
      stats['reposts'] = next;
      stats['shares'] = next;
    });
  }

  Future<void> _onRepostTap() async {
    final token = AuthStorage.accessToken;
    if (token == null) {
      _showSnack('Please sign in to repost', error: true);
      return;
    }

    final normalized = _normalizeItem(
      widget.item,
      fallbackAuthorId: widget.profileUserId,
      fallbackAuthorUsername: widget.profileUsername,
      fallbackAuthorDisplayName: widget.profileDisplayName,
      fallbackAuthorAvatarUrl: widget.profileAvatarUrl,
    );
    final id = (normalized['id'] as String?)?.trim() ?? '';
    if (id.isEmpty) return;

    final kind =
        ((normalized['repostKind'] as String?) ??
                (normalized['kind'] as String?) ??
                'reel')
            .trim();
    final authorLabel =
        (normalized['authorUsername'] as String?) ??
        (normalized['authorDisplayName'] as String?) ??
        'user';
    final originalId = _resolveOriginalPostId(normalized, id);

    final selection = await showRepostFlowSheet(
      context: context,
      label: '@$authorLabel',
      kind: kind,
      initialAllowDownload: _asBool(normalized['allowDownload']),
    );
    if (selection == null) return;

    if (selection.action == RepostFlowAction.quick) {
      try {
        await PostInteractionService.quickRepost(originalId);
        _incrementRepostStat(normalized['stats']);
        _showSnack('Reposted');
      } on ApiException catch (e) {
        try {
          await PostInteractionService.repost(originalId);
          _incrementRepostStat(normalized['stats']);
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
      return;
    }

    final input = selection.quoteInput;
    if (input == null) return;

    final payload = RepostQuotePayload(
      content: input.content,
      hashtags: input.hashtags,
      location: input.location,
      visibility: input.visibility,
      allowComments: input.allowComments,
      allowDownload: _asBool(normalized['allowDownload']),
      hideLikeCount: input.hideLikeCount,
    );

    try {
      await PostInteractionService.quoteRepost(
        originalPostId: originalId,
        payload: payload,
        kind: kind,
      );
      _incrementRepostStat(normalized['stats']);
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

  Future<void> _downloadCurrentReel() async {
    final normalized = _normalizeItem(
      widget.item,
      fallbackAuthorId: widget.profileUserId,
      fallbackAuthorUsername: widget.profileUsername,
      fallbackAuthorDisplayName: widget.profileDisplayName,
      fallbackAuthorAvatarUrl: widget.profileAvatarUrl,
    );
    final allowDownload = _asBool(normalized['allowDownload']);
    final media = (normalized['media'] as List?)
        ?.whereType<Map<String, dynamic>>()
        .toList();

    if (!allowDownload || media == null || media.isEmpty) {
      _showSnack('Download is disabled for this reel', error: true);
      return;
    }

    final chosen = media.firstWhere(
      (m) => (m['type'] as String?) == 'video',
      orElse: () => media.first,
    );
    final url = (chosen['url'] as String?) ?? '';
    if (url.isEmpty) {
      _showSnack('Failed to download reel', error: true);
      return;
    }

    try {
      final res = await http
          .get(Uri.parse(url))
          .timeout(const Duration(seconds: 45));
      if (res.statusCode < 200 || res.statusCode >= 300) {
        throw Exception('download failed');
      }

      final bytes = res.bodyBytes;
      final dir = await _resolveDownloadDirectory();
      final filename = _buildFilename(url, chosen['type'] as String?, bytes);
      final file = File('${dir.path}${Platform.pathSeparator}$filename');
      await file.writeAsBytes(bytes, flush: true);
      _showSnack('Downloaded: ${file.path}');
    } catch (_) {
      _showSnack('Failed to download reel', error: true);
    }
  }

  Future<Directory> _resolveDownloadDirectory() async {
    if (Platform.isAndroid) {
      final direct = Directory('/storage/emulated/0/Download');
      if (await direct.exists()) return direct;
    }

    final external = await getExternalStorageDirectory();
    if (external != null) return external;
    return getApplicationDocumentsDirectory();
  }

  String _buildFilename(String url, String? type, Uint8List bytes) {
    final uri = Uri.tryParse(url);
    final segment = uri?.pathSegments.isNotEmpty == true
        ? uri!.pathSegments.last
        : '';
    final fromUrl = segment.split('?').first.trim();
    final ts = DateTime.now().millisecondsSinceEpoch;

    if (fromUrl.isNotEmpty && fromUrl.contains('.')) {
      final safe = fromUrl.replaceAll(RegExp(r'[^a-zA-Z0-9._-]'), '_');
      return 'cordigram_reel_$ts\_$safe';
    }

    String ext = type == 'video' ? 'mp4' : 'jpg';
    if (bytes.length >= 12) {
      if (bytes[0] == 0x89 && bytes[1] == 0x50 && bytes[2] == 0x4E) ext = 'png';
      if (bytes[0] == 0xFF && bytes[1] == 0xD8) ext = 'jpg';
    }
    return 'cordigram_reel_$ts.$ext';
  }

  Future<void> _onReelMenuAction(PostMenuAction action) async {
    final normalized = _normalizeItem(
      widget.item,
      fallbackAuthorId: widget.profileUserId,
      fallbackAuthorUsername: widget.profileUsername,
      fallbackAuthorDisplayName: widget.profileDisplayName,
      fallbackAuthorAvatarUrl: widget.profileAvatarUrl,
    );
    final id = (normalized['id'] as String?) ?? '';
    if (id.isEmpty) return;

    switch (action) {
      case PostMenuAction.editPost:
        final state = _toFeedPostState(
          normalized,
          fallbackAuthorId: widget.profileUserId,
          fallbackAuthorUsername: widget.profileUsername,
          fallbackAuthorDisplayName: widget.profileDisplayName,
          fallbackAuthorAvatarUrl: widget.profileAvatarUrl,
        );
        if (state == null) return;
        final updated = await showEditPostSheet(
          context,
          post: state.post,
          entityLabel: 'reel',
        );
        if (updated == null || !mounted) return;
        setState(() {
          widget.item['content'] = updated.content;
          widget.item['caption'] = updated.content;
          widget.item['location'] = updated.location;
          widget.item['hashtags'] = updated.hashtags;
          widget.item['allowComments'] = updated.allowComments;
          widget.item['allowDownload'] = updated.allowDownload;
          widget.item['hideLikeCount'] = updated.hideLikeCount;
          widget.item['visibility'] = updated.visibility;
        });
        _showSnack('Reel updated');
        return;
      case PostMenuAction.editVisibility:
        final currentVisibility =
            (normalized['visibility'] as String?) ?? 'public';
        final nextVisibility = await showEditVisibilitySheet(
          context,
          postId: id,
          currentVisibility: currentVisibility,
        );
        if (nextVisibility == null || !mounted) return;
        setState(() => widget.item['visibility'] = nextVisibility);
        _showSnack('Visibility updated');
        return;
      case PostMenuAction.toggleComments:
        final currentAllowed = !_asBool(normalized['allowComments'])
            ? false
            : true;
        final nextAllowed = !currentAllowed;
        setState(() => widget.item['allowComments'] = nextAllowed);
        try {
          await PostInteractionService.setAllowComments(id, nextAllowed);
          _showSnack(
            nextAllowed ? 'Comments turned on' : 'Comments turned off',
          );
        } catch (_) {
          if (!mounted) return;
          setState(() => widget.item['allowComments'] = currentAllowed);
          _showSnack('Failed to update comments', error: true);
        }
        return;
      case PostMenuAction.toggleHideLike:
        final currentHidden = _asBool(normalized['hideLikeCount']);
        final nextHidden = !currentHidden;
        setState(() => widget.item['hideLikeCount'] = nextHidden);
        try {
          await PostInteractionService.setHideLikeCount(id, nextHidden);
          _showSnack(nextHidden ? 'Like count hidden' : 'Like count visible');
        } catch (_) {
          if (!mounted) return;
          setState(() => widget.item['hideLikeCount'] = currentHidden);
          _showSnack('Failed to update like visibility', error: true);
        }
        return;
      case PostMenuAction.copyLink:
        await Clipboard.setData(
          ClipboardData(text: PostInteractionService.reelPermalink(id)),
        );
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
              'Delete reel',
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
          await PostInteractionService.deletePost(id);
          _showSnack('Reel deleted');
          if (mounted) {
            Navigator.of(context).pop({'deletedPostId': id});
          }
        } catch (_) {
          _showSnack('Failed to delete reel', error: true);
        }
        return;
      case PostMenuAction.followToggle:
        return _onFollowTap();
      case PostMenuAction.saveToggle:
        return _onSaveTap();
      case PostMenuAction.hidePost:
        try {
          await PostInteractionService.hide(id);
          _showSnack('Reel hidden');
          if (mounted) Navigator.of(context).pop();
        } catch (_) {
          _showSnack('Failed to hide reel', error: true);
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
          postId: id,
          authHeader: {'Authorization': 'Bearer $token'},
          subjectLabel: 'reel',
        );
        if (reported) _showSnack('Report submitted');
        return;
      case PostMenuAction.blockAccount:
        final author = _asStringKeyMap(normalized['author']);
        final userId =
            (normalized['authorId'] as String?) ?? (author?['id'] as String?);
        if (userId == null || userId.isEmpty) return;
        final username =
            (normalized['authorUsername'] as String?) ??
            (author?['username'] as String?) ??
            'user';
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
              'You will no longer see reels from this account.',
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
          _showSnack('Account blocked');
          if (mounted) Navigator.of(context).pop();
        } catch (_) {
          _showSnack('Failed to block account', error: true);
        }
        return;
      case PostMenuAction.goToAdsPost:
      case PostMenuAction.detailAds:
        _showSnack('Ads actions are only available in Home feed', error: true);
        return;
    }
  }

  Future<void> _openReelMenu(BuildContext triggerContext) async {
    final normalized = _normalizeItem(
      widget.item,
      fallbackAuthorId: widget.profileUserId,
      fallbackAuthorUsername: widget.profileUsername,
      fallbackAuthorDisplayName: widget.profileDisplayName,
      fallbackAuthorAvatarUrl: widget.profileAvatarUrl,
    );

    final author = _asStringKeyMap(normalized['author']);
    final authorId =
        (normalized['authorId'] as String?) ?? (author?['id'] as String?) ?? '';
    final isOwner =
        widget.viewerId != null &&
        widget.viewerId!.isNotEmpty &&
        authorId == widget.viewerId;

    final media = (normalized['media'] as List?)
        ?.whereType<Map<String, dynamic>>()
        .toList();
    final canDownload =
        _asBool(normalized['allowDownload']) &&
        media != null &&
        media.isNotEmpty;
    final allowComments = normalized['allowComments'] != false;
    final hideLike = _asBool(normalized['hideLikeCount']);

    final entries = <({String id, String label, bool danger})>[];
    if (isOwner) {
      entries.add((id: 'editReel', label: 'Edit reel', danger: false));
      entries.add((
        id: 'editVisibility',
        label: 'Edit visibility',
        danger: false,
      ));
      entries.add((
        id: 'toggleComments',
        label: allowComments ? 'Turn off comments' : 'Turn on comments',
        danger: false,
      ));
      entries.add((
        id: 'toggleHideLike',
        label: hideLike ? 'Show like' : 'Hide like',
        danger: false,
      ));
      if (canDownload) {
        entries.add((
          id: 'downloadReel',
          label: 'Download this reel',
          danger: false,
        ));
      }
      entries.add((id: 'copyLink', label: 'Copy link', danger: false));
      entries.add((id: 'deleteReel', label: 'Delete reel', danger: true));
    } else {
      if (canDownload) {
        entries.add((
          id: 'downloadReel',
          label: 'Download this reel',
          danger: false,
        ));
      }
      entries.add((id: 'copyLink', label: 'Copy link', danger: false));
      entries.add((
        id: 'followToggle',
        label: _following ? 'Unfollow' : 'Follow',
        danger: false,
      ));
      entries.add((
        id: 'saveToggle',
        label: _saved ? 'Unsave this reel' : 'Save this reel',
        danger: false,
      ));
      entries.add((id: 'hideReel', label: 'Hide this reel', danger: false));
      entries.add((id: 'reportReel', label: 'Report', danger: false));
      entries.add((
        id: 'blockAccount',
        label: 'Block this account',
        danger: true,
      ));
    }

    final overlay =
        Overlay.of(triggerContext).context.findRenderObject() as RenderBox;
    final box = triggerContext.findRenderObject() as RenderBox;
    final rect = Rect.fromPoints(
      box.localToGlobal(Offset.zero, ancestor: overlay),
      box.localToGlobal(box.size.bottomRight(Offset.zero), ancestor: overlay),
    );

    final selected = await showMenu<String>(
      context: context,
      color: const Color(0xFF0E1730),
      surfaceTintColor: Colors.transparent,
      position: RelativeRect.fromRect(rect, Offset.zero & overlay.size),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(color: Colors.white.withValues(alpha: 0.08)),
      ),
      items: entries
          .map(
            (item) => PopupMenuItem<String>(
              value: item.id,
              child: Text(
                item.label,
                style: TextStyle(
                  color: item.danger
                      ? const Color(0xFFF87171)
                      : const Color(0xFFE5E7EB),
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          )
          .toList(),
    );

    if (!mounted || selected == null) return;
    switch (selected) {
      case 'editReel':
        return _onReelMenuAction(PostMenuAction.editPost);
      case 'editVisibility':
        return _onReelMenuAction(PostMenuAction.editVisibility);
      case 'toggleComments':
        return _onReelMenuAction(PostMenuAction.toggleComments);
      case 'toggleHideLike':
        return _onReelMenuAction(PostMenuAction.toggleHideLike);
      case 'downloadReel':
        return _downloadCurrentReel();
      case 'copyLink':
        return _onReelMenuAction(PostMenuAction.copyLink);
      case 'deleteReel':
        return _onReelMenuAction(PostMenuAction.deletePost);
      case 'followToggle':
        return _onReelMenuAction(PostMenuAction.followToggle);
      case 'saveToggle':
        return _onReelMenuAction(PostMenuAction.saveToggle);
      case 'hideReel':
        return _onReelMenuAction(PostMenuAction.hidePost);
      case 'reportReel':
        return _onReelMenuAction(PostMenuAction.reportPost);
      case 'blockAccount':
        return _onReelMenuAction(PostMenuAction.blockAccount);
    }
  }

  void _openPostDetail() {
    final itemId = widget.item['id'] as String? ?? '';
    if (itemId.isEmpty) return;
    final initialState = _toFeedPostState(
      widget.item,
      fallbackAuthorId: widget.profileUserId,
      fallbackAuthorUsername: widget.profileUsername,
      fallbackAuthorDisplayName: widget.profileDisplayName,
      fallbackAuthorAvatarUrl: widget.profileAvatarUrl,
    );
    widget.controller?.pause();
    Navigator.of(context)
        .push(
          MaterialPageRoute<dynamic>(
            builder: (_) => PostDetailScreen(
              postId: itemId,
              initialState: initialState,
              viewerId: widget.viewerId,
            ),
          ),
        )
        .then((result) {
          if (!mounted) return;
          if (result is Map && result['deletedPostId'] is String) {
            Navigator.of(context).pop(result);
            return;
          }
          if (widget.isActive) widget.controller?.play();
        });
  }

  void _openReelCommentsSheet() {
    final itemId = widget.item['id'] as String? ?? '';
    if (itemId.isEmpty) return;
    widget.controller?.pause();

    final authorId =
        (widget.item['authorId'] as String?) ??
        ((widget.item['author'] as Map?)?['id'] as String?);
    final normalized = _normalizeItem(
      widget.item,
      fallbackAuthorId: widget.profileUserId,
      fallbackAuthorUsername: widget.profileUsername,
      fallbackAuthorDisplayName: widget.profileDisplayName,
      fallbackAuthorAvatarUrl: widget.profileAvatarUrl,
    );
    final commentsLocked = normalized['allowComments'] == false;
    if (commentsLocked) {
      _showSnack('Comments are turned off for this reel');
      return;
    }

    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) {
        return ReelCommentSheet(
          postId: itemId,
          viewerId: widget.viewerId,
          postAuthorId: authorId,
          allowComments: normalized['allowComments'] != false,
          onCommentAdded: () {
            if (!mounted) return;
            final stats = widget.item['stats'] as Map<String, dynamic>?;
            if (stats == null) return;
            final curr = _asInt(stats['comments']);
            setState(() {
              stats['comments'] = (curr + 1).clamp(0, 999999999);
            });
          },
        );
      },
    ).then((_) {
      if (mounted && widget.isActive) widget.controller?.play();
    });
  }

  Widget _buildReelPage() {
    final normalized = _normalizeItem(
      widget.item,
      fallbackAuthorId: widget.profileUserId,
      fallbackAuthorUsername: widget.profileUsername,
      fallbackAuthorDisplayName: widget.profileDisplayName,
      fallbackAuthorAvatarUrl: widget.profileAvatarUrl,
    );
    final ctrl = widget.controller;
    final initialized = ctrl != null && ctrl.value.isInitialized;
    final stats = normalized['stats'] as Map?;
    final hearts = _asInt(stats?['hearts'] ?? stats?['likes']);
    final comments = _asInt(stats?['comments']);
    final reposts = _asInt(stats?['reposts'] ?? stats?['shares']);
    final saves = _asInt(stats?['saves']);
    final rawContent =
        (normalized['caption'] as String? ??
                normalized['content'] as String? ??
                '')
            .trim();
    final isAdPost = _isAdNormalizedItem(normalized);
    final adCreative = isAdPost ? _resolveAdCreative(normalized) : null;
    final content = isAdPost
        ? _resolveAdDisplayText(rawContent, adCreative)
        : rawContent;
    final adHeadline = (adCreative?.headline ?? '').trim();
    final adDescription = (adCreative?.description ?? '').trim();
    final adCta = (adCreative?.cta ?? '').trim();
    final adUrl = (adCreative?.destinationUrl ?? '').trim();
    final author = _asStringKeyMap(normalized['author']);
    final displayName =
        (normalized['authorDisplayName'] as String?) ??
        (author?['displayName'] as String?) ??
        (author?['username'] as String?) ??
        'Unknown';
    final username =
        (normalized['authorUsername'] as String?) ??
        (author?['username'] as String?) ??
        '';
    final avatarUrl =
        (normalized['authorAvatarUrl'] as String?) ??
        (author?['avatarUrl'] as String?);
    final isVerified =
        (normalized['authorIsCreatorVerified'] as bool?) ??
        (author?['isCreatorVerified'] as bool?) ??
        false;
    final authorId =
        (normalized['authorId'] as String?) ?? (author?['id'] as String?) ?? '';
    final repostOf = normalized['repostOf'] as String?;
    final isRepost = repostOf != null && repostOf.isNotEmpty;
    final repostUsername =
        (normalized['repostOfAuthorUsername'] as String?) ??
        (_asStringKeyMap(normalized['repostOfAuthor'])?['username'] as String?);
    final repostAuthorId =
        _pickString([
          normalized['repostOfAuthorId'],
          _asStringKeyMap(normalized['repostOfAuthor'])?['id'],
        ]) ??
        '';
    final isOwn =
        widget.viewerId != null &&
        widget.viewerId!.isNotEmpty &&
        authorId == widget.viewerId;
    final hideLikesForViewer = _asBool(normalized['hideLikeCount']) && !isOwn;
    final commentsLocked = normalized['allowComments'] == false;
    final location = (normalized['location'] as String?)?.trim();
    final hashtags = ((normalized['hashtags'] as List?) ?? const [])
        .map((e) => e.toString().trim())
        .where((e) => e.isNotEmpty)
        .toList();

    return GestureDetector(
      onTap: _handleVideoTap,
      behavior: HitTestBehavior.opaque,
      child: Stack(
        fit: StackFit.expand,
        children: [
          const ColoredBox(color: Colors.black),
          if (initialized)
            Center(
              child: AspectRatio(
                aspectRatio: ctrl.value.aspectRatio,
                child: VideoPlayer(ctrl),
              ),
            ),
          if (!initialized)
            Center(
              child: Icon(
                Icons.smart_display_outlined,
                size: 72,
                color: Colors.white.withValues(alpha: 0.12),
              ),
            ),
          if (ctrl != null && !initialized)
            const Center(
              child: CircularProgressIndicator(
                strokeWidth: 2,
                color: Colors.white54,
              ),
            ),
          if (widget.showModerationRevealOverlay)
            Positioned.fill(
              child: Container(
                color: Colors.black.withValues(alpha: 0.22),
                alignment: Alignment.center,
                child: Container(
                  margin: const EdgeInsets.symmetric(horizontal: 24),
                  padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
                  decoration: BoxDecoration(
                    color: const Color(0xFF2A3345).withValues(alpha: 0.92),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: Colors.white.withValues(alpha: 0.08),
                    ),
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Text(
                        'This image has been blurred due to violation of our standards.',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          color: Color(0xFFE8ECF8),
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 10),
                      ElevatedButton(
                        onPressed: widget.onRevealMedia,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF0F1F3B),
                          foregroundColor: Colors.white,
                          elevation: 0,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(10),
                          ),
                        ),
                        child: const Text('View image'),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          if (_showPauseIcon)
            Center(
              child: Container(
                padding: const EdgeInsets.all(18),
                decoration: BoxDecoration(
                  color: Colors.black.withValues(alpha: 0.45),
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.pause_rounded,
                  size: 48,
                  color: Colors.white,
                ),
              ),
            ),
          Positioned(
            bottom: 0,
            left: 0,
            right: 0,
            height: 300,
            child: IgnorePointer(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      Colors.transparent,
                      Colors.black.withValues(alpha: 0.85),
                    ],
                  ),
                ),
              ),
            ),
          ),
          if (widget.forceReelUi)
            Positioned(
              top: 0,
              left: 0,
              right: 0,
              child: Container(
                padding: EdgeInsets.only(
                  top: MediaQuery.of(context).padding.top + 4,
                  bottom: 4,
                ),
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      Colors.black.withValues(alpha: 0.55),
                      Colors.transparent,
                    ],
                  ),
                ),
                child: Row(
                  children: [
                    IconButton(
                      icon: const Icon(
                        Icons.arrow_back_ios_new_rounded,
                        color: Colors.white,
                        size: 20,
                      ),
                      onPressed:
                          widget.onBack ?? () => Navigator.of(context).pop(),
                    ),
                    const Spacer(),
                    Text(
                      '${widget.pageIndex + 1} / ${widget.totalCount}',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 13,
                        fontWeight: FontWeight.w500,
                        shadows: [Shadow(blurRadius: 4, color: Colors.black54)],
                      ),
                    ),
                    const Spacer(),
                    _VolumeControl(
                      muted: _muted,
                      onToggle: () {
                        setState(() => _muted = !_muted);
                        ctrl?.setVolume(_muted ? 0.0 : 1.0);
                      },
                    ),
                    const SizedBox(width: 6),
                  ],
                ),
              ),
            )
          else
            Positioned(
              top: MediaQuery.of(context).padding.top + 12,
              left: 12,
              child: _VolumeControl(
                muted: _muted,
                onToggle: () {
                  setState(() => _muted = !_muted);
                  ctrl?.setVolume(_muted ? 0.0 : 1.0);
                },
              ),
            ),
          Positioned(
            bottom: 28 + MediaQuery.of(context).viewPadding.bottom,
            left: 16,
            right: 88,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                if (isRepost) ...[
                  Row(
                    children: [
                      const Icon(
                        Icons.repeat_rounded,
                        size: 14,
                        color: Color(0xFF7A8BB0),
                      ),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Row(
                          children: [
                            const Text(
                              'Reposted from ',
                              style: TextStyle(
                                color: Color(0xFF9FB0CC),
                                fontSize: 12,
                                shadows: [
                                  Shadow(blurRadius: 4, color: Colors.black54),
                                ],
                              ),
                            ),
                            Expanded(
                              child: GestureDetector(
                                onTap: repostAuthorId.isNotEmpty
                                    ? () => _openUserProfile(repostAuthorId)
                                    : null,
                                child: Text(
                                  repostUsername != null &&
                                          repostUsername.isNotEmpty
                                      ? '@$repostUsername'
                                      : 'unknown',
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 12,
                                    fontWeight: FontWeight.w700,
                                    shadows: [
                                      Shadow(
                                        blurRadius: 4,
                                        color: Colors.black54,
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                ],
                Row(
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: [
                    GestureDetector(
                      onTap: () => _openUserProfile(authorId),
                      child: _AuthorAvatar(
                        avatarUrl: avatarUrl,
                        displayName: displayName,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: GestureDetector(
                        onTap: () => _openUserProfile(authorId),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Row(
                              children: [
                                Flexible(
                                  child: Text(
                                    displayName,
                                    style: const TextStyle(
                                      color: Colors.white,
                                      fontWeight: FontWeight.w700,
                                      fontSize: 14,
                                    ),
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                                if (isVerified) ...[
                                  const SizedBox(width: 4),
                                  const Icon(
                                    Icons.verified_rounded,
                                    size: 14,
                                    color: Color(0xFF4AA3E4),
                                  ),
                                ],
                              ],
                            ),
                            if (username.isNotEmpty)
                              Text(
                                '@$username',
                                style: const TextStyle(
                                  color: Colors.white70,
                                  fontSize: 12,
                                ),
                              ),
                            if (isAdPost)
                              Container(
                                margin: const EdgeInsets.only(top: 4),
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 8,
                                  vertical: 2,
                                ),
                                decoration: BoxDecoration(
                                  color: const Color(
                                    0xFF1D4ED8,
                                  ).withValues(alpha: 0.28),
                                  borderRadius: BorderRadius.circular(999),
                                  border: Border.all(
                                    color: const Color(
                                      0xFF93C5FD,
                                    ).withValues(alpha: 0.4),
                                  ),
                                ),
                                child: const Text(
                                  'Sponsored',
                                  style: TextStyle(
                                    color: Color(0xFFDCEBFF),
                                    fontSize: 10,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ),
                    ),
                    if (!isOwn && authorId.isNotEmpty) ...[
                      const SizedBox(width: 8),
                      GestureDetector(
                        onTap: _onFollowTap,
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 14,
                            vertical: 6,
                          ),
                          decoration: BoxDecoration(
                            border: Border.all(
                              color: _following ? Colors.white54 : Colors.white,
                              width: 1.5,
                            ),
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: Text(
                            _following ? 'Following' : 'Follow',
                            style: const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.w600,
                              fontSize: 12,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
                if (content.isNotEmpty) ...[
                  const SizedBox(height: 10),
                  if (isAdPost && adHeadline.isNotEmpty) ...[
                    Text(
                      adHeadline,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: Color(0xFFEAF3FF),
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        shadows: [Shadow(blurRadius: 4, color: Colors.black54)],
                      ),
                    ),
                    const SizedBox(height: 6),
                  ],
                  _ExpandableCaption(text: content),
                  if (isAdPost && adDescription.isNotEmpty) ...[
                    const SizedBox(height: 6),
                    Text(
                      adDescription,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: Color(0xFFD1DDEF),
                        fontSize: 12,
                        height: 1.3,
                        shadows: [Shadow(blurRadius: 4, color: Colors.black54)],
                      ),
                    ),
                  ],
                  if (isAdPost && (adCta.isNotEmpty || adUrl.isNotEmpty)) ...[
                    const SizedBox(height: 8),
                    GestureDetector(
                      onTap: () => _openAdDestinationUrl(context, adUrl),
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 7,
                        ),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.92),
                          borderRadius: BorderRadius.circular(16),
                        ),
                        child: Text(
                          adCta.isNotEmpty ? adCta : 'Learn more',
                          style: const TextStyle(
                            color: Color(0xFF0F172A),
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ),
                  ],
                ],
                if (location != null && location.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  GestureDetector(
                    onTap: () async {
                      final q = Uri.encodeQueryComponent(location);
                      final uri = Uri.parse(
                        'https://www.google.com/maps/search/?api=1&query=$q',
                      );
                      await launchUrl(
                        uri,
                        mode: LaunchMode.externalApplication,
                      );
                    },
                    child: Row(
                      children: [
                        const Icon(
                          Icons.place_outlined,
                          size: 14,
                          color: Color(0xFF9FB0CC),
                        ),
                        const SizedBox(width: 4),
                        Expanded(
                          child: Text(
                            location,
                            style: const TextStyle(
                              color: Color(0xFFCDD5E0),
                              fontSize: 12,
                              shadows: [
                                Shadow(blurRadius: 4, color: Colors.black54),
                              ],
                            ),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
                if (hashtags.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 6,
                    runSpacing: 4,
                    children: hashtags.map((tag) {
                      final label = tag.startsWith('#') ? tag : '#$tag';
                      return Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 3,
                        ),
                        decoration: BoxDecoration(
                          color: const Color(
                            0xFF4AA3E4,
                          ).withValues(alpha: 0.18),
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Text(
                          label,
                          style: const TextStyle(
                            color: Color(0xFFE8F3FF),
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      );
                    }).toList(),
                  ),
                ],
              ],
            ),
          ),
          Positioned(
            top: widget.forceReelUi
                ? MediaQuery.of(context).padding.top + 56
                : MediaQuery.of(context).padding.top + 12,
            right: 12,
            child: Builder(
              builder: (menuCtx) => GestureDetector(
                onTap: () => _openReelMenu(menuCtx),
                child: Container(
                  width: 34,
                  height: 34,
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.45),
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: Colors.white.withValues(alpha: 0.18),
                    ),
                  ),
                  child: const Icon(
                    Icons.more_horiz_rounded,
                    color: Colors.white,
                    size: 20,
                  ),
                ),
              ),
            ),
          ),
          Positioned(
            bottom: 28 + MediaQuery.of(context).viewPadding.bottom,
            right: 8,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                _ActionButton(
                  icon: _liked
                      ? Icons.favorite_rounded
                      : Icons.favorite_border_rounded,
                  color: Colors.white,
                  label: hideLikesForViewer ? '' : _fmtCountInt(hearts),
                  onTap: _onLikeTap,
                ),
                const SizedBox(height: 20),
                _ActionButton(
                  icon: Icons.mode_comment_outlined,
                  color: commentsLocked ? Colors.white54 : Colors.white,
                  label: commentsLocked ? 'Off' : _fmtCountInt(comments),
                  onTap: commentsLocked ? () {} : _openReelCommentsSheet,
                ),
                const SizedBox(height: 20),
                _ActionButton(
                  icon: Icons.repeat_rounded,
                  color: Colors.white,
                  label: _fmtCountInt(reposts),
                  onTap: _onRepostTap,
                ),
                const SizedBox(height: 20),
                _ActionButton(
                  icon: _saved
                      ? Icons.bookmark_rounded
                      : Icons.bookmark_border_rounded,
                  color: Colors.white,
                  label: _fmtCountInt(saves),
                  onTap: _onSaveTap,
                ),
                const SizedBox(height: 20),
              ],
            ),
          ),
          if (initialized)
            Positioned(
              bottom: 0,
              left: 0,
              right: 0,
              child: _VideoProgressBar(
                controller: ctrl,
                expectedDurationMs: _extractExpectedDurationMs(normalized),
              ),
            ),
        ],
      ),
    );
  }

  // ── Video page ─────────────────────────────────────────────────────────────

  Widget _buildVideoPage() {
    final ctrl = widget.controller;
    final initialized = ctrl != null && ctrl.value.isInitialized;

    return GestureDetector(
      onTap: _handleVideoTap,
      behavior: HitTestBehavior.opaque,
      child: Stack(
        fit: StackFit.expand,
        children: [
          const ColoredBox(color: Colors.black),

          // Video
          if (initialized)
            Center(
              child: AspectRatio(
                aspectRatio: ctrl.value.aspectRatio,
                child: VideoPlayer(ctrl),
              ),
            ),

          // Loading indicator
          if (!initialized)
            Center(
              child: Icon(
                Icons.smart_display_outlined,
                size: 72,
                color: Colors.white.withValues(alpha: 0.12),
              ),
            ),
          if (ctrl != null && !initialized)
            const Center(
              child: CircularProgressIndicator(
                strokeWidth: 2,
                color: Colors.white54,
              ),
            ),

          // Pause icon flash
          if (_showPauseIcon)
            Center(
              child: Container(
                padding: const EdgeInsets.all(18),
                decoration: BoxDecoration(
                  color: Colors.black.withValues(alpha: 0.45),
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.pause_rounded,
                  size: 48,
                  color: Colors.white,
                ),
              ),
            ),

          // Bottom gradient
          Positioned(
            bottom: 0,
            left: 0,
            right: 0,
            height: 280,
            child: IgnorePointer(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      Colors.transparent,
                      Colors.black.withValues(alpha: 0.88),
                    ],
                  ),
                ),
              ),
            ),
          ),

          // Progress bar
          if (initialized)
            Positioned(
              bottom: 0,
              left: 0,
              right: 0,
              height: 3,
              child: VideoProgressIndicator(
                ctrl,
                allowScrubbing: true,
                colors: const VideoProgressColors(
                  playedColor: Color(0xFF4AA3E4),
                  bufferedColor: Color(0x55FFFFFF),
                  backgroundColor: Color(0x33FFFFFF),
                ),
                padding: EdgeInsets.zero,
              ),
            ),

          // Bottom info
          Positioned(
            bottom: 6,
            left: 0,
            right: 0,
            child: _ItemInfoOverlay(
              item: widget.item,
              viewerId: widget.viewerId,
            ),
          ),
        ],
      ),
    );
  }

  // ── Image page ─────────────────────────────────────────────────────────────

  Widget _buildImagePage() {
    final mediaCount = _mediaItems.length;
    final hasMany = mediaCount > 1;
    final currentIndex = mediaCount > 0 ? _mediaIndex : 0;
    final showRevealOverlay =
        _isMediaBlurredByModeration(currentIndex) &&
        !(_revealedMediaKeys[_mediaRevealKey(currentIndex)] == true);

    return Stack(
      fit: StackFit.expand,
      children: [
        const ColoredBox(color: Colors.black),

        if (mediaCount > 0)
          PageView.builder(
            controller: _mediaPageController,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: mediaCount,
            onPageChanged: (i) => setState(() => _mediaIndex = i),
            itemBuilder: (context, i) {
              final url = _mediaDisplayUrl(i);
              if (url == null || url.isEmpty) {
                return Center(
                  child: Icon(
                    Icons.image_not_supported_outlined,
                    size: 56,
                    color: Colors.white.withValues(alpha: 0.2),
                  ),
                );
              }
              return Stack(
                fit: StackFit.expand,
                children: [
                  Center(
                    child: InteractiveViewer(
                      minScale: 0.8,
                      maxScale: 4.0,
                      child: Image.network(
                        url,
                        fit: BoxFit.contain,
                        loadingBuilder: (_, child, progress) => progress == null
                            ? child
                            : Center(
                                child: CircularProgressIndicator(
                                  value: progress.expectedTotalBytes != null
                                      ? progress.cumulativeBytesLoaded /
                                            progress.expectedTotalBytes!
                                      : null,
                                  strokeWidth: 2,
                                  color: Colors.white54,
                                ),
                              ),
                        errorBuilder: (_, __, ___) => Center(
                          child: Icon(
                            Icons.broken_image_outlined,
                            size: 56,
                            color: Colors.white.withValues(alpha: 0.3),
                          ),
                        ),
                      ),
                    ),
                  ),
                  if (i == _mediaIndex && showRevealOverlay)
                    Positioned.fill(
                      child: Container(
                        color: Colors.black.withValues(alpha: 0.24),
                        alignment: Alignment.center,
                        child: Container(
                          margin: const EdgeInsets.symmetric(horizontal: 18),
                          padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
                          decoration: BoxDecoration(
                            color: const Color(
                              0xFF2A3345,
                            ).withValues(alpha: 0.92),
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(
                              color: Colors.white.withValues(alpha: 0.08),
                            ),
                          ),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Text(
                                'This image has been blurred due to violation of our standards.',
                                textAlign: TextAlign.center,
                                style: TextStyle(
                                  color: Color(0xFFE8ECF8),
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                              const SizedBox(height: 10),
                              ElevatedButton(
                                onPressed: () {
                                  setState(() {
                                    _revealedMediaKeys[_mediaRevealKey(i)] =
                                        true;
                                  });
                                },
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: const Color(0xFF0F1F3B),
                                  foregroundColor: Colors.white,
                                  elevation: 0,
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(10),
                                  ),
                                ),
                                child: const Text('View image'),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                ],
              );
            },
          )
        else if (_imageUrl != null)
          Center(
            child: InteractiveViewer(
              minScale: 0.8,
              maxScale: 4.0,
              child: Image.network(
                _imageUrl!,
                fit: BoxFit.contain,
                loadingBuilder: (_, child, progress) => progress == null
                    ? child
                    : Center(
                        child: CircularProgressIndicator(
                          value: progress.expectedTotalBytes != null
                              ? progress.cumulativeBytesLoaded /
                                    progress.expectedTotalBytes!
                              : null,
                          strokeWidth: 2,
                          color: Colors.white54,
                        ),
                      ),
                errorBuilder: (_, __, ___) => Center(
                  child: Icon(
                    Icons.broken_image_outlined,
                    size: 56,
                    color: Colors.white.withValues(alpha: 0.3),
                  ),
                ),
              ),
            ),
          )
        else
          Center(
            child: Icon(
              Icons.image_not_supported_outlined,
              size: 56,
              color: Colors.white.withValues(alpha: 0.2),
            ),
          ),

        if (hasMany)
          Positioned(
            left: 10,
            top: 0,
            bottom: 0,
            child: Center(
              child: IconButton(
                onPressed: _mediaIndex > 0
                    ? () {
                        _mediaPageController.previousPage(
                          duration: const Duration(milliseconds: 240),
                          curve: Curves.easeOut,
                        );
                      }
                    : null,
                icon: Icon(
                  Icons.chevron_left_rounded,
                  size: 34,
                  color: _mediaIndex > 0 ? Colors.white : Colors.white38,
                ),
              ),
            ),
          ),

        if (hasMany)
          Positioned(
            right: 10,
            top: 0,
            bottom: 0,
            child: Center(
              child: IconButton(
                onPressed: _mediaIndex < mediaCount - 1
                    ? () {
                        _mediaPageController.nextPage(
                          duration: const Duration(milliseconds: 240),
                          curve: Curves.easeOut,
                        );
                      }
                    : null,
                icon: Icon(
                  Icons.chevron_right_rounded,
                  size: 34,
                  color: _mediaIndex < mediaCount - 1
                      ? Colors.white
                      : Colors.white38,
                ),
              ),
            ),
          ),

        // Multiple media indicator (top center)
        if (mediaCount > 1)
          Positioned(
            top: kToolbarHeight + MediaQuery.of(context).padding.top + 8,
            left: 0,
            right: 0,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.55),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    '${_mediaIndex + 1}/$mediaCount',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),
          ),

        // Bottom gradient
        Positioned(
          bottom: 0,
          left: 0,
          right: 0,
          height: 260,
          child: IgnorePointer(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Colors.transparent,
                    Colors.black.withValues(alpha: 0.85),
                  ],
                ),
              ),
            ),
          ),
        ),

        // Bottom info + "View full post" button
        Positioned(
          bottom: 0,
          left: 0,
          right: 0,
          child: _ItemInfoOverlay(
            item: widget.item,
            viewerId: widget.viewerId,
            showViewFullPost: true,
            fallbackAuthorId: widget.profileUserId,
            fallbackAuthorUsername: widget.profileUsername,
            fallbackAuthorDisplayName: widget.profileDisplayName,
            fallbackAuthorAvatarUrl: widget.profileAvatarUrl,
          ),
        ),
      ],
    );
  }
}

class _AuthorAvatar extends StatelessWidget {
  const _AuthorAvatar({required this.avatarUrl, required this.displayName});

  final String? avatarUrl;
  final String displayName;

  @override
  Widget build(BuildContext context) {
    final initial = displayName.isNotEmpty
        ? displayName.substring(0, 1).toUpperCase()
        : 'U';
    return CircleAvatar(
      radius: 18,
      backgroundColor: const Color(0xFF1E2D48),
      backgroundImage: avatarUrl?.isNotEmpty == true
          ? NetworkImage(avatarUrl!)
          : null,
      child: avatarUrl?.isNotEmpty != true
          ? Text(
              initial,
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w700,
                fontSize: 13,
              ),
            )
          : null,
    );
  }
}

class _ExpandableCaption extends StatefulWidget {
  const _ExpandableCaption({required this.text});

  final String text;

  @override
  State<_ExpandableCaption> createState() => _ExpandableCaptionState();
}

class _ExpandableCaptionState extends State<_ExpandableCaption> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => setState(() => _expanded = !_expanded),
      child: Text(
        widget.text,
        maxLines: _expanded ? null : 3,
        overflow: _expanded ? TextOverflow.visible : TextOverflow.ellipsis,
        style: const TextStyle(
          color: Colors.white,
          fontSize: 13,
          height: 1.4,
          shadows: [Shadow(blurRadius: 4, color: Colors.black54)],
        ),
      ),
    );
  }
}

class _ActionButton extends StatelessWidget {
  const _ActionButton({
    required this.icon,
    required this.color,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final Color color;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, color: color, size: 30),
          if (label.isNotEmpty) ...[
            const SizedBox(height: 3),
            Text(
              label,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 12,
                fontWeight: FontWeight.w600,
                shadows: [Shadow(blurRadius: 4, color: Colors.black54)],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _VolumeControl extends StatelessWidget {
  const _VolumeControl({required this.muted, required this.onToggle});

  final bool muted;
  final VoidCallback onToggle;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onToggle,
      child: Container(
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(
          color: Colors.black.withValues(alpha: 0.45),
          shape: BoxShape.circle,
        ),
        child: Icon(
          muted ? Icons.volume_off_rounded : Icons.volume_up_rounded,
          color: Colors.white,
          size: 22,
        ),
      ),
    );
  }
}

class _VideoProgressBar extends StatefulWidget {
  const _VideoProgressBar({required this.controller, this.expectedDurationMs});

  final VideoPlayerController controller;
  final int? expectedDurationMs;

  @override
  State<_VideoProgressBar> createState() => _VideoProgressBarState();
}

class _VideoProgressBarState extends State<_VideoProgressBar> {
  void _onUpdate() {
    if (mounted) setState(() {});
  }

  @override
  void initState() {
    super.initState();
    widget.controller.addListener(_onUpdate);
  }

  @override
  void didUpdateWidget(_VideoProgressBar oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.controller != widget.controller) {
      oldWidget.controller.removeListener(_onUpdate);
      widget.controller.addListener(_onUpdate);
    }
  }

  @override
  void dispose() {
    widget.controller.removeListener(_onUpdate);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final value = widget.controller.value;
    final posMs = value.position.inMilliseconds;
    final nativeDurMs = value.duration.inMilliseconds;

    int? expectedMs;
    if (widget.expectedDurationMs != null && widget.expectedDurationMs! > 0) {
      expectedMs = widget.expectedDurationMs! < 1000
          ? widget.expectedDurationMs! * 1000
          : widget.expectedDurationMs!;
    }

    var effectiveDurMs = nativeDurMs;
    if (expectedMs != null &&
        (effectiveDurMs <= 0 ||
            effectiveDurMs < 1000 ||
            effectiveDurMs < (expectedMs * 0.2) ||
            effectiveDurMs < posMs)) {
      effectiveDurMs = expectedMs;
    }

    if (!value.isInitialized || effectiveDurMs <= 1000) {
      return Container(height: 3, color: Colors.white12);
    }

    final progress = (posMs / effectiveDurMs).clamp(0.0, 1.0);

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        SliderTheme(
          data: SliderTheme.of(context).copyWith(
            trackHeight: 2.5,
            thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 5),
            overlayShape: const RoundSliderOverlayShape(overlayRadius: 12),
            activeTrackColor: const Color(0xFF4AA3E4),
            inactiveTrackColor: Colors.white24,
            thumbColor: Colors.white,
            overlayColor: Colors.white24,
            trackShape: const RectangularSliderTrackShape(),
          ),
          child: Slider(
            value: progress,
            min: 0.0,
            max: 1.0,
            onChanged: (v) {
              final ms = (v * effectiveDurMs).round();
              widget.controller.seekTo(Duration(milliseconds: ms));
            },
          ),
        ),
      ],
    );
  }
}

// ── Bottom info overlay ───────────────────────────────────────────────────────

class _ItemInfoOverlay extends StatelessWidget {
  const _ItemInfoOverlay({
    required this.item,
    this.viewerId,
    this.showViewFullPost = false,
    this.fallbackAuthorId,
    this.fallbackAuthorUsername,
    this.fallbackAuthorDisplayName,
    this.fallbackAuthorAvatarUrl,
  });

  final Map<String, dynamic> item;
  final String? viewerId;
  final bool showViewFullPost;
  final String? fallbackAuthorId;
  final String? fallbackAuthorUsername;
  final String? fallbackAuthorDisplayName;
  final String? fallbackAuthorAvatarUrl;

  String _fmt(dynamic raw) {
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
    final normalized = _normalizeItem(
      item,
      fallbackAuthorId: fallbackAuthorId,
      fallbackAuthorUsername: fallbackAuthorUsername,
      fallbackAuthorDisplayName: fallbackAuthorDisplayName,
      fallbackAuthorAvatarUrl: fallbackAuthorAvatarUrl,
    );
    final stats = normalized['stats'] as Map?;
    final likes = stats?['hearts'] ?? stats?['likes'] ?? 0;
    final comments = stats?['comments'] ?? 0;
    final views = stats?['views'] ?? 0;
    final rawCaption =
        (normalized['caption'] as String? ??
                normalized['content'] as String? ??
                '')
            .trim();
    final isAdPost = _isAdNormalizedItem(normalized);
    final adCreative = isAdPost ? _resolveAdCreative(normalized) : null;
    final caption = isAdPost
        ? _resolveAdDisplayText(rawCaption, adCreative)
        : rawCaption;
    final adHeadline = (adCreative?.headline ?? '').trim();
    final adDescription = (adCreative?.description ?? '').trim();
    final adCta = (adCreative?.cta ?? '').trim();
    final adUrl = (adCreative?.destinationUrl ?? '').trim();
    final authorUsername =
        (normalized['authorUsername'] as String?) ??
        (normalized['author'] as Map?)?['username'] as String? ??
        '';
    final authorId =
        (normalized['authorId'] as String?) ??
        ((normalized['author'] as Map?)?['id'] as String?) ??
        '';
    final repostOf = normalized['repostOf'] as String?;
    final isRepost = repostOf != null && repostOf.isNotEmpty;
    final repostOriginName = _resolveRepostOriginName(normalized);
    final repostOriginId = _resolveRepostOriginId(normalized);
    final itemId = normalized['id'] as String? ?? '';
    final initialState = _toFeedPostState(
      normalized,
      fallbackAuthorId: fallbackAuthorId,
      fallbackAuthorUsername: fallbackAuthorUsername,
      fallbackAuthorDisplayName: fallbackAuthorDisplayName,
      fallbackAuthorAvatarUrl: fallbackAuthorAvatarUrl,
    );

    return Padding(
      padding: EdgeInsets.fromLTRB(
        14,
        0,
        14,
        MediaQuery.of(context).padding.bottom + 12,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          // Author
          if (isRepost)
            Row(
              children: [
                const Icon(Icons.repeat, color: Colors.white70, size: 14),
                const SizedBox(width: 4),
                Expanded(
                  child: Row(
                    children: [
                      const Text(
                        'Reposted from ',
                        style: TextStyle(color: Colors.white70, fontSize: 13),
                      ),
                      Expanded(
                        child: GestureDetector(
                          onTap: repostOriginId.isNotEmpty
                              ? () {
                                  Navigator.of(context).push(
                                    MaterialPageRoute<void>(
                                      builder: (_) =>
                                          ProfileScreen(userId: repostOriginId),
                                    ),
                                  );
                                }
                              : null,
                          child: Text(
                            repostOriginName,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 13,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),

          if (authorUsername.isNotEmpty)
            GestureDetector(
              onTap: authorId.isNotEmpty
                  ? () {
                      Navigator.of(context).push(
                        MaterialPageRoute<void>(
                          builder: (_) => ProfileScreen(userId: authorId),
                        ),
                      );
                    }
                  : null,
              child: Row(
                children: [
                  Text(
                    '@$authorUsername',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  if (isAdPost) ...[
                    const SizedBox(width: 6),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 7,
                        vertical: 2,
                      ),
                      decoration: BoxDecoration(
                        color: const Color(0xFF1D4ED8).withValues(alpha: 0.28),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: const Text(
                        'Sponsored',
                        style: TextStyle(
                          color: Color(0xFFDCEBFF),
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),

          if (isAdPost && adHeadline.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(
              adHeadline,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: Color(0xFFEAF3FF),
                fontSize: 13,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],

          if (caption.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(
              caption,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: Color(0xFFDDEEFF),
                fontSize: 13,
                height: 1.4,
              ),
            ),
          ],

          if (isAdPost && adDescription.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(
              adDescription,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(color: Color(0xFFC9D7ED), fontSize: 12),
            ),
          ],

          if (isAdPost && (adCta.isNotEmpty || adUrl.isNotEmpty)) ...[
            const SizedBox(height: 6),
            GestureDetector(
              onTap: () => _openAdDestinationUrl(context, adUrl),
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 5,
                ),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.9),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Text(
                  adCta.isNotEmpty ? adCta : 'Learn more',
                  style: const TextStyle(
                    color: Color(0xFF0F172A),
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ),
          ],

          const SizedBox(height: 8),

          // Stats row
          Row(
            children: [
              _StatChip(icon: Icons.thumb_up_alt_rounded, count: _fmt(likes)),
              const SizedBox(width: 14),
              _StatChip(icon: Icons.chat_bubble_rounded, count: _fmt(comments)),
              const SizedBox(width: 14),
              _StatChip(icon: Icons.visibility_rounded, count: _fmt(views)),
              const Spacer(),

              // "View full post" button
              if (showViewFullPost && itemId.isNotEmpty)
                GestureDetector(
                  onTap: () {
                    Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) => PostDetailScreen(
                          postId: itemId,
                          initialState: initialState,
                          viewerId: viewerId,
                        ),
                      ),
                    );
                  },
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 6,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(
                        color: Colors.white.withValues(alpha: 0.3),
                      ),
                    ),
                    child: const Text(
                      'View post',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _StatChip extends StatelessWidget {
  const _StatChip({required this.icon, required this.count});
  final IconData icon;
  final String count;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, color: Colors.white70, size: 14),
        const SizedBox(width: 3),
        Text(
          count,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 12,
            fontWeight: FontWeight.w600,
            shadows: [Shadow(blurRadius: 4, color: Colors.black54)],
          ),
        ),
      ],
    );
  }
}
