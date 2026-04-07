import 'dart:async';
import 'dart:io';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:visibility_detector/visibility_detector.dart';
import '../models/feed_post.dart';
import '../../profile/profile_screen.dart';
import 'media_carousel.dart';

// ── Sponsored ad creative ────────────────────────────────────────────────────

class _SponsoredCreative {
  const _SponsoredCreative({
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

bool _hasStructuredMarkers(String value) => RegExp(
  r'\[\[AD_(PRIMARY_TEXT|HEADLINE|DESCRIPTION|CTA|URL)\]\]',
  caseSensitive: false,
).hasMatch(value);

_SponsoredCreative? _parseSponsoredCreative(String value) {
  final raw = value.replaceAll('\r', '').trim();
  if (raw.isEmpty) return null;

  String extractBlock(String name) {
    final pattern = RegExp(
      r'\[\[AD_' + name + r'\]\]([\s\S]*?)\[\[\/AD_' + name + r'\]\]',
      caseSensitive: false,
    );
    final m = pattern.firstMatch(raw);
    if (m == null) return '';
    return (m.group(1) ?? '').replaceAll(RegExp(r'^\n+|\n+$'), '');
  }

  final pt = extractBlock('PRIMARY_TEXT');
  final hl = extractBlock('HEADLINE');
  final desc = extractBlock('DESCRIPTION');
  final url = extractBlock('URL');
  final cta = extractBlock('CTA');

  if (pt.isNotEmpty ||
      hl.isNotEmpty ||
      desc.isNotEmpty ||
      url.isNotEmpty ||
      cta.isNotEmpty) {
    return _SponsoredCreative(
      primaryText: pt,
      headline: hl,
      description: desc,
      destinationUrl: url.isNotEmpty ? url : null,
      cta: cta,
    );
  }

  // Fallback: paragraph-based parsing
  final blocks = raw
      .split(RegExp(r'\n{2,}'))
      .map((b) => b.trim())
      .where((b) => b.isNotEmpty)
      .toList();
  if (blocks.isEmpty) return null;

  final primaryText = blocks[0];
  final details = blocks.length > 1
      ? blocks
            .sublist(1)
            .join('\n')
            .split('\n')
            .map((l) => l.trim())
            .where((l) => l.isNotEmpty)
            .toList()
      : <String>[];

  String? destinationUrl;
  int destinationIndex = -1;
  for (int i = details.length - 1; i >= 0; i--) {
    if (RegExp(r'^https?://', caseSensitive: false).hasMatch(details[i])) {
      destinationUrl = details[i];
      destinationIndex = i;
      break;
    }
  }

  final metaLines = <String>[];
  for (int i = 0; i < details.length; i++) {
    if (i != destinationIndex) metaLines.add(details[i]);
  }

  String ctaText = '';
  final metaWithoutCta = <String>[];
  for (final line in metaLines) {
    final m = RegExp(
      r'^cta\s*:\s*(.+)$',
      caseSensitive: false,
    ).firstMatch(line);
    if (m != null && ctaText.isEmpty) {
      ctaText = (m.group(1) ?? '').trim();
    } else {
      metaWithoutCta.add(line);
    }
  }

  return _SponsoredCreative(
    primaryText: primaryText,
    headline: metaWithoutCta.isNotEmpty ? metaWithoutCta[0] : '',
    description: metaWithoutCta.length > 1
        ? metaWithoutCta.sublist(1).join(' ')
        : '',
    destinationUrl: destinationUrl,
    cta: ctaText,
  );
}

// Mirror of web constants
// VIEW_DWELL_MS = 2000  — must be visible for 2 s before counting
// VIEW_COOLDOWN_MS = 300 000 — 5-min per-card cooldown (same as web)
const int _kDwellMs = 2000;
const int _kCardCooldownMs = 300000;

enum PostMenuAction {
  editPost,
  editVisibility,
  toggleComments,
  toggleHideLike,
  copyLink,
  deletePost,
  followToggle,
  saveToggle,
  hidePost,
  reportPost,
  blockAccount,
}

/// A single post card for the home feed.
/// Receives a [FeedPostState] and callbacks for interactions.
/// Uses [VisibilityDetector] (≥50 % visible) + a 2-second dwell timer
/// before firing [onView], mirroring the web's IntersectionObserver logic.
class PostCard extends StatefulWidget {
  const PostCard({
    super.key,
    required this.state,
    required this.onLike,
    required this.onSave,
    required this.onHide,
    required this.onView,
    this.onRepost,
    this.viewerId,
    this.onFollow,
    this.onAuthorTap,
    this.onHashtagTap,
    this.onComment,
    this.onMenuAction,
    this.fullWidth = false,
    this.detailMode = false,
  });

  final FeedPostState state;
  final VoidCallback onLike;
  final VoidCallback onSave;
  final VoidCallback onHide;
  final VoidCallback? onRepost;

  /// Called once the post has been continuously visible for ≥2 s AND the
  /// per-card 5-minute cooldown has elapsed.
  final VoidCallback onView;

  /// Current logged-in user’s ID — used to hide the Follow button on own posts.
  final String? viewerId;

  /// Called when the user taps Follow / Following on this card.
  final void Function(String authorId, bool nextFollow)? onFollow;

  /// Called when the user taps the post author's avatar/username.
  final void Function(String authorId)? onAuthorTap;

  /// Called when the user taps a hashtag chip.
  final void Function(String hashtag)? onHashtagTap;

  /// Called when the user taps the Comment button. If null the button is a
  /// no-op (e.g. when already on the post detail screen).
  final VoidCallback? onComment;

  /// Called when the user taps a more-menu action.
  final Future<void> Function(PostMenuAction action, FeedPostState state)?
  onMenuAction;

  /// When true the card renders edge-to-edge: no horizontal/vertical margin,
  /// no rounded corners, and no border — intended for the post detail screen.
  final bool fullWidth;

  /// When true (post detail screen): hides the X close button, hides the
  /// Like/Comment/Repost/Save action bar, and hides the reposts stat.
  final bool detailMode;

  @override
  State<PostCard> createState() => _PostCardState();
}

class _PostCardState extends State<PostCard> {
  Timer? _dwellTimer;
  // Per-card last-view epoch ms (resets if card is destroyed & recreated)
  int _lastViewAt = 0;

  /// Captured once at widget creation — mirrors web’s initialFollowingRef.
  late bool _initiallyFollowing;

  /// True after the user has tapped Follow/Following at least once
  /// — mirrors web’s followToggledRef so the button stays visible after
  /// the user follows someone.
  bool _followToggled = false;

  @override
  void initState() {
    super.initState();
    _initiallyFollowing = widget.state.following;
  }

  @override
  void dispose() {
    _dwellTimer?.cancel();
    super.dispose();
  }

  void _onVisibilityChanged(VisibilityInfo info) {
    if (info.visibleFraction >= 0.5) {
      // Skip if already within per-card cooldown
      final now = DateTime.now().millisecondsSinceEpoch;
      if (now - _lastViewAt < _kCardCooldownMs) return;
      if (_dwellTimer != null) return; // dwell already counting
      _dwellTimer = Timer(const Duration(milliseconds: _kDwellMs), () {
        _dwellTimer = null;
        _lastViewAt = DateTime.now().millisecondsSinceEpoch;
        widget.onView();
      });
    } else {
      // Scrolled away — cancel pending dwell
      _dwellTimer?.cancel();
      _dwellTimer = null;
    }
  }

  Future<void> _onMenuAction(PostMenuAction action) async {
    final handler = widget.onMenuAction;
    if (handler == null) return;
    await handler(action, widget.state);
  }

  Future<void> _openMoreMenu(BuildContext triggerContext) async {
    final isOwner =
        widget.viewerId != null &&
        widget.state.post.authorId != null &&
        widget.viewerId == widget.state.post.authorId;
    final post = widget.state.post;

    final entries = <({String id, String label, bool danger})>[];
    if (isOwner) {
      entries.add((id: 'editPost', label: 'Edit post', danger: false));
      entries.add((
        id: 'editVisibility',
        label: 'Edit visibility',
        danger: false,
      ));
      entries.add((
        id: 'toggleComments',
        label: post.allowComments == false
            ? 'Turn on comments'
            : 'Turn off comments',
        danger: false,
      ));
      entries.add((
        id: 'toggleHideLike',
        label: post.hideLikeCount == true ? 'Show like' : 'Hide like',
        danger: false,
      ));
      entries.add((id: 'copyLink', label: 'Copy link', danger: false));
      entries.add((id: 'deletePost', label: 'Delete post', danger: true));
    } else {
      entries.add((id: 'copyLink', label: 'Copy link', danger: false));
      entries.add((
        id: 'followToggle',
        label: widget.state.following ? 'Unfollow' : 'Follow',
        danger: false,
      ));
      entries.add((
        id: 'saveToggle',
        label: widget.state.saved ? 'Unsave this post' : 'Save this post',
        danger: false,
      ));
      entries.add((id: 'hidePost', label: 'Hide this post', danger: false));
      entries.add((id: 'reportPost', label: 'Report', danger: false));
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
      case 'editPost':
        return _onMenuAction(PostMenuAction.editPost);
      case 'editVisibility':
        return _onMenuAction(PostMenuAction.editVisibility);
      case 'toggleComments':
        return _onMenuAction(PostMenuAction.toggleComments);
      case 'toggleHideLike':
        return _onMenuAction(PostMenuAction.toggleHideLike);
      case 'copyLink':
        return _onMenuAction(PostMenuAction.copyLink);
      case 'deletePost':
        return _onMenuAction(PostMenuAction.deletePost);
      case 'followToggle':
        setState(() => _followToggled = true);
        return _onMenuAction(PostMenuAction.followToggle);
      case 'saveToggle':
        return _onMenuAction(PostMenuAction.saveToggle);
      case 'hidePost':
        return _onMenuAction(PostMenuAction.hidePost);
      case 'reportPost':
        return _onMenuAction(PostMenuAction.reportPost);
      case 'blockAccount':
        return _onMenuAction(PostMenuAction.blockAccount);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = widget.state;
    final post = state.post;

    // Compute isSelf and showInlineFollow, mirroring web’s logic
    final isSelf = widget.viewerId != null && widget.viewerId == post.authorId;
    final showInlineFollow =
        !isSelf &&
        post.authorId != null &&
        (!_initiallyFollowing || _followToggled || !state.following);

    // ── Sponsored/ad state ────────────────────────────────────────────────────
    final bool hasStructuredContent = _hasStructuredMarkers(post.content);
    final bool hasStructuredSource = _hasStructuredMarkers(
      post.repostSourceContent ?? '',
    );
    final bool isAdPost =
        (post.sponsored == true) || hasStructuredContent || hasStructuredSource;
    final bool isSponsoredRepost = post.repostOf != null && isAdPost;
    final _SponsoredCreative? creative = isAdPost
        ? (isSponsoredRepost && hasStructuredSource
              ? _parseSponsoredCreative(post.repostSourceContent!)
              : _parseSponsoredCreative(post.content))
        : null;
    final String renderedContent = (creative?.primaryText.isNotEmpty == true)
        ? creative!.primaryText
        : post.content;
    final bool isRepost = post.repostOf != null && !isAdPost;

    return VisibilityDetector(
      key: Key('post-view-${post.id}'),
      onVisibilityChanged: _onVisibilityChanged,
      child: Container(
        margin: widget.fullWidth
            ? EdgeInsets.zero
            : const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: const Color(0xFF131929),
          borderRadius: widget.fullWidth
              ? BorderRadius.zero
              : BorderRadius.circular(16),
          border: widget.fullWidth
              ? null
              : Border.all(
                  color: isAdPost
                      ? const Color(0xFF0EA5E9).withValues(alpha: 0.35)
                      : Colors.white.withValues(alpha: 0.06),
                ),
          boxShadow: widget.fullWidth
              ? null
              : isAdPost
              ? const [
                  BoxShadow(
                    color: Color(0x1F0EA5E9),
                    blurRadius: 22,
                    offset: Offset(0, 6),
                  ),
                ]
              : const [
                  BoxShadow(
                    color: Color(0x59000000),
                    blurRadius: 6,
                    offset: Offset(0, 2),
                  ),
                ],
        ),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (isRepost) ...[
                _RepostBanner(post: post),
                const SizedBox(height: 10),
              ],
              _PostHeader(
                post: post,
                onHide: widget.onHide,
                onOpenMenu: _openMoreMenu,
                showMenuButton: widget.onMenuAction != null,
                hideCloseButton: widget.detailMode,
                useUsername: widget.detailMode,
                isSponsored: isAdPost,
                isFollowing: state.following,
                showInlineFollow: showInlineFollow,
                onAuthorTap: widget.onAuthorTap,
                onFollow: showInlineFollow && post.authorId != null
                    ? (nextFollow) {
                        setState(() => _followToggled = true);
                        widget.onFollow?.call(post.authorId!, nextFollow);
                      }
                    : null,
              ),
              if (renderedContent.isNotEmpty) ...[
                const SizedBox(height: 10),
                _PostContent(content: renderedContent),
              ],
              if (post.location != null && post.location!.isNotEmpty) ...[
                const SizedBox(height: 8),
                _LocationChip(location: post.location!),
              ],
              if (post.hashtags.isNotEmpty) ...[
                const SizedBox(height: 8),
                _HashtagRow(
                  hashtags: post.hashtags,
                  onTap: widget.onHashtagTap,
                ),
              ],
              if (post.media.isNotEmpty) ...[
                const SizedBox(height: 12),
                MediaCarousel(
                  media: post.media,
                  allowDownload: post.allowDownload == true,
                ),
              ],
              if (isAdPost &&
                  creative != null &&
                  (creative.headline.isNotEmpty ||
                      creative.description.isNotEmpty ||
                      creative.destinationUrl != null)) ...[
                const SizedBox(height: 12),
                _AdCtaBanner(creative: creative),
              ],
              const SizedBox(height: 12),
              _StatsRow(
                state: state,
                viewerId: widget.viewerId,
                hideReposts: widget.detailMode,
                onLike: widget.detailMode ? widget.onLike : null,
              ),
              if (!widget.detailMode) ...[
                const SizedBox(height: 2),
                const _Divider(),
                _ActionBar(
                  state: state,
                  onLike: widget.onLike,
                  onSave: widget.onSave,
                  onRepost: widget.onRepost,
                  onComment: widget.onComment,
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

// ── Header ────────────────────────────────────────────────────────────────────

class _PostHeader extends StatelessWidget {
  const _PostHeader({
    required this.post,
    required this.onHide,
    required this.onOpenMenu,
    this.showMenuButton = true,
    this.hideCloseButton = false,
    this.useUsername = false,
    this.isSponsored = false,
    this.isFollowing = false,
    this.showInlineFollow = false,
    this.onFollow,
    this.onAuthorTap,
  });
  final FeedPost post;
  final VoidCallback onHide;
  final Future<void> Function(BuildContext triggerContext) onOpenMenu;
  final bool showMenuButton;
  final bool hideCloseButton;
  final bool useUsername;
  final bool isSponsored;
  final bool isFollowing;
  final bool showInlineFollow;
  final void Function(String authorId)? onAuthorTap;

  /// Called with `true` to follow, `false` to unfollow.
  final void Function(bool nextFollow)? onFollow;

  @override
  Widget build(BuildContext context) {
    final canOpenProfile =
        post.authorId != null &&
        post.authorId!.isNotEmpty &&
        onAuthorTap != null;

    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        GestureDetector(
          onTap: canOpenProfile
              ? () => onAuthorTap!.call(post.authorId!)
              : null,
          child: _Avatar(
            avatarUrl: post.avatarUrl,
            displayName: post.displayName,
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: GestureDetector(
            onTap: canOpenProfile
                ? () => onAuthorTap!.call(post.authorId!)
                : null,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        useUsername && post.username.isNotEmpty
                            ? post.username
                            : post.displayName,
                        style: const TextStyle(
                          color: Color(0xFFE8ECF8),
                          fontWeight: FontWeight.w700,
                          fontSize: 14,
                        ),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    if (post.isVerified) ...[
                      const SizedBox(width: 4),
                      const _VerifiedBadge(),
                    ],
                    if (showInlineFollow) ...[
                      const Text(
                        ' · ',
                        style: TextStyle(
                          color: Color(0xFF7A8BB0),
                          fontSize: 13,
                        ),
                      ),
                      GestureDetector(
                        onTap: () => onFollow?.call(!isFollowing),
                        child: Text(
                          isFollowing ? 'Following' : 'Follow',
                          style: TextStyle(
                            color: isFollowing
                                ? const Color(0xFF7A8BB0)
                                : const Color(0xFF4AA3E4),
                            fontWeight: FontWeight.w600,
                            fontSize: 13,
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 2),
                if (isSponsored)
                  Row(
                    children: [
                      if (post.username.isNotEmpty) ...[
                        Text(
                          '${post.username} · ',
                          style: const TextStyle(
                            color: Color(0xFF7A8BB0),
                            fontSize: 12,
                          ),
                        ),
                      ],
                      const Text(
                        'Sponsored',
                        style: TextStyle(
                          color: Color(0xFF4AA3E4),
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  )
                else
                  Text(
                    _timeAgo(post.createdAt),
                    style: const TextStyle(
                      color: Color(0xFF7A8BB0),
                      fontSize: 12,
                    ),
                  ),
              ],
            ),
          ),
        ),
        // 3-dot menu button (UI stub)
        if (showMenuButton)
          _HeaderIconBtn(
            icon: Icons.more_horiz_rounded,
            onTap: (ctx) => onOpenMenu(ctx),
          ),
        if (!hideCloseButton) ...[
          const SizedBox(width: 2),
          _HeaderIconBtn(icon: Icons.close_rounded, onTap: (_) => onHide()),
        ],
      ],
    );
  }

  /// Mirrors date-fns `formatDistanceToNow(date, { addSuffix: true })`.
  /// Thresholds are minute-based, same as the web feed.
  static String _timeAgo(String iso) {
    try {
      final dt = DateTime.parse(iso).toLocal();
      final diff = DateTime.now().difference(dt);
      if (diff.isNegative) return 'just now';

      final mins = (diff.inSeconds / 60).round();

      if (mins < 1) return 'just now';
      if (mins < 2) return '1 minute ago';
      if (mins < 45) return '$mins minutes ago';
      if (mins < 90) return 'about 1 hour ago';
      if (mins < 1440)
        return 'about ${(mins / 60).round()} hours ago'; // up to 24 h
      if (mins < 2520) return '1 day ago'; // 24 h – 42 h
      if (mins < 43200)
        return '${(mins / 1440).round()} days ago'; // up to 30 d
      if (mins < 86400)
        return 'about ${(mins / 43200).round()} months ago'; // 30–60 d

      // 60 d – 1 year  →  "X months ago"
      const int minsPerYear = 525960; // 365.25 * 24 * 60
      if (mins < minsPerYear) {
        return '${(mins / 43200).round()} months ago';
      }

      // ≥ 1 year
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

class _HeaderIconBtn extends StatelessWidget {
  const _HeaderIconBtn({required this.icon, required this.onTap});
  final IconData icon;
  final void Function(BuildContext triggerContext) onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => onTap(context),
      child: Padding(
        padding: const EdgeInsets.all(4),
        child: Icon(icon, color: const Color(0xFF7A8BB0), size: 18),
      ),
    );
  }
}

class _Avatar extends StatelessWidget {
  const _Avatar({this.avatarUrl, required this.displayName});
  final String? avatarUrl;
  final String displayName;

  @override
  Widget build(BuildContext context) {
    final initials = displayName.isNotEmpty
        ? displayName[0].toUpperCase()
        : '?';
    if (avatarUrl != null && avatarUrl!.isNotEmpty) {
      return ClipOval(
        child: Image.network(
          avatarUrl!,
          width: 42,
          height: 42,
          fit: BoxFit.cover,
          errorBuilder: (_, __, ___) => _InitialsAvatar(initials: initials),
        ),
      );
    }
    return _InitialsAvatar(initials: initials);
  }
}

class _InitialsAvatar extends StatelessWidget {
  const _InitialsAvatar({required this.initials});
  final String initials;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 42,
      height: 42,
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
          initials,
          style: const TextStyle(
            color: Color(0xFF0B1020),
            fontWeight: FontWeight.w700,
            fontSize: 16,
          ),
        ),
      ),
    );
  }
}

class _VerifiedBadge extends StatelessWidget {
  const _VerifiedBadge();

  /// Pre-baked SVG (badge shape + gradient + checkmark), matching cordigram-web
  /// exactly. Gradient: #52B6FF → #1570EF top-left to bottom-right.
  static const _svg =
      '<svg width="16" height="16" viewBox="0 0 20 20" '
      'fill="none" xmlns="http://www.w3.org/2000/svg">'
      '<defs>'
      '<linearGradient id="vbg" x1="0" y1="0" x2="1" y2="1" '
      'gradientUnits="objectBoundingBox">'
      '<stop stop-color="#52B6FF"/>'
      '<stop offset="1" stop-color="#1570EF"/>'
      '</linearGradient>'
      '</defs>'
      '<path d="M10 1.5 12 2.9 14.3 2.9 15.5 5 17.6 6.2 17.6 8.6 18.9 10.5 '
      '17.6 12.5 17.6 14.9 15.5 16.1 14.3 18.2 12 18.2 10 19.5 8 18.2 '
      '5.7 18.2 4.5 16.1 2.4 14.9 2.4 12.5 1.1 10.5 2.4 8.6 2.4 6.2 '
      '4.5 5 5.7 2.9 8 2.9Z" fill="url(#vbg)"/>'
      '<path d="M6.8 10.3 9.1 12.6 13.6 8.1" stroke="#fff" '
      'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>'
      '</svg>';

  @override
  Widget build(BuildContext context) {
    return SvgPicture.string(_svg, width: 16, height: 16);
  }
}

// ── Post text content with "See more" ────────────────────────────────────────

class _PostContent extends StatefulWidget {
  const _PostContent({required this.content});
  final String content;

  @override
  State<_PostContent> createState() => _PostContentState();
}

class _PostContentState extends State<_PostContent> {
  bool _expanded = false;
  static const int _maxLines = 3;

  final List<TapGestureRecognizer> _recognizers = [];

  static final _urlRegex = RegExp(
    "https?://[^\\s<>()\\[\\]{}\"']+",
    caseSensitive: false,
  );

  static String _stripTrailing(String url) =>
      url.replaceAll(RegExp(r'[),.;!?]+$'), '');

  List<InlineSpan> _buildSpans(String text) {
    for (final r in _recognizers) r.dispose();
    _recognizers.clear();
    const baseStyle = TextStyle(
      color: Color(0xFFE8ECF8),
      fontSize: 14,
      height: 1.55,
    );
    const urlStyle = TextStyle(
      color: Color(0xFF60A5FA),
      fontSize: 14,
      height: 1.55,
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
      _recognizers.add(rec);
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
  void dispose() {
    for (final r in _recognizers) r.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final text = widget.content;
    final needsCollapse = _needsCollapse(text);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        RichText(
          text: TextSpan(children: _buildSpans(text)),
          maxLines: _expanded ? null : _maxLines,
          overflow: _expanded ? TextOverflow.visible : TextOverflow.ellipsis,
        ),
        if (needsCollapse) ...[
          const SizedBox(height: 4),
          GestureDetector(
            onTap: () => setState(() => _expanded = !_expanded),
            child: Text(
              _expanded ? 'See less' : 'See more',
              style: const TextStyle(
                color: Color(0xFF4AA3E4),
                fontSize: 13,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ],
    );
  }

  bool _needsCollapse(String text) {
    final painter = TextPainter(
      text: TextSpan(
        text: text,
        style: const TextStyle(fontSize: 14, height: 1.55),
      ),
      maxLines: _maxLines,
      textDirection: TextDirection.ltr,
    )..layout(maxWidth: MediaQuery.of(context).size.width - 56);
    return painter.didExceedMaxLines;
  }
}

// ── Hashtag chips ─────────────────────────────────────────────────────────────

class _HashtagRow extends StatelessWidget {
  const _HashtagRow({required this.hashtags, this.onTap});
  final List<String> hashtags;
  final void Function(String hashtag)? onTap;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 6,
      runSpacing: 4,
      children: hashtags.map((tag) {
        final label = tag.startsWith('#') ? tag : '#$tag';
        final normalized = label.replaceFirst(RegExp(r'^#+'), '').trim();
        return GestureDetector(
          onTap: onTap != null && normalized.isNotEmpty
              ? () => onTap!(normalized)
              : null,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: const Color(0xFF4AA3E4).withValues(alpha: 0.16),
              borderRadius: BorderRadius.circular(999),
              border: Border.all(
                color: const Color(0xFF4AA3E4).withValues(alpha: 0.35),
              ),
            ),
            child: Text(
              label,
              style: const TextStyle(
                color: Color(0xFF4AA3E4),
                fontSize: 12,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        );
      }).toList(),
    );
  }
}

// ── Repost banner ─────────────────────────────────────────────────────────────────

class _RepostBanner extends StatelessWidget {
  const _RepostBanner({required this.post});
  final FeedPost post;

  @override
  Widget build(BuildContext context) {
    final repostAuthorId =
        post.repostOfAuthor?.id ?? post.repostOfAuthorId ?? '';

    return Row(
      children: [
        const Icon(Icons.repeat_rounded, size: 15, color: Color(0xFF7A8BB0)),
        const SizedBox(width: 6),
        Flexible(
          child: Row(
            children: [
              const Text(
                'Reposted from ',
                style: TextStyle(color: Color(0xFF7A8BB0), fontSize: 13),
              ),
              Expanded(
                child: GestureDetector(
                  onTap: repostAuthorId.isNotEmpty
                      ? () {
                          Navigator.of(context).push(
                            MaterialPageRoute<void>(
                              builder: (_) =>
                                  ProfileScreen(userId: repostAuthorId),
                            ),
                          );
                        }
                      : null,
                  child: Text(
                    post.repostAuthorName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: Color(0xFFE8ECF8),
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
    );
  }
}

// ── Location ──────────────────────────────────────────────────────────────────

class _LocationChip extends StatelessWidget {
  const _LocationChip({required this.location});
  final String location;

  Future<void> _openMaps() async {
    final encoded = Uri.encodeComponent(location);

    // On Android: try geo: URI first (opens Google Maps app if installed)
    // On iOS:     try comgooglemaps:// first
    // Fallback:   open in browser via maps.google.com
    if (Platform.isAndroid) {
      final geoUri = Uri.parse('geo:0,0?q=$encoded');
      if (await canLaunchUrl(geoUri)) {
        await launchUrl(geoUri, mode: LaunchMode.externalApplication);
        return;
      }
    } else if (Platform.isIOS) {
      final mapsAppUri = Uri.parse('comgooglemaps://?q=$encoded');
      if (await canLaunchUrl(mapsAppUri)) {
        await launchUrl(mapsAppUri, mode: LaunchMode.externalApplication);
        return;
      }
    }

    // Fallback: open in browser
    final webUri = Uri.parse('https://maps.google.com/?q=$encoded');
    await launchUrl(webUri, mode: LaunchMode.externalApplication);
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: _openMaps,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(
          color: const Color(0xFF4AA3E4).withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: const Color(0xFF4AA3E4).withValues(alpha: 0.25),
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(
              Icons.location_on_rounded,
              size: 13,
              color: Color(0xFF7A8BB0),
            ),
            const SizedBox(width: 5),
            Flexible(
              child: Text(
                location,
                style: const TextStyle(color: Color(0xFFE8ECF8), fontSize: 13),
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
// ── Ad CTA banner ─────────────────────────────────────────────────────────────────

class _AdCtaBanner extends StatelessWidget {
  const _AdCtaBanner({required this.creative});
  final _SponsoredCreative creative;

  Future<void> _openCta() async {
    final url = creative.destinationUrl;
    if (url == null) return;
    final uri = Uri.tryParse(url);
    if (uri == null) return;
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFF4AA3E4).withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: const Color(0xFF4AA3E4).withValues(alpha: 0.28),
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (creative.headline.isNotEmpty)
                  Text(
                    creative.headline,
                    style: const TextStyle(
                      color: Color(0xFFE8ECF8),
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                      height: 1.2,
                    ),
                  ),
                if (creative.description.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text(
                    creative.description,
                    style: const TextStyle(
                      color: Color(0xFF7A8BB0),
                      fontSize: 13,
                      height: 1.4,
                    ),
                  ),
                ],
              ],
            ),
          ),
          if (creative.destinationUrl != null) ...[
            const SizedBox(width: 12),
            GestureDetector(
              onTap: _openCta,
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 14,
                  vertical: 9,
                ),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [Color(0xFF0EA5E9), Color(0xFF22D3EE)],
                  ),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(
                    color: const Color(0xFF38BDF8).withValues(alpha: 0.45),
                  ),
                  boxShadow: const [
                    BoxShadow(
                      color: Color(0x2E0EA5E9),
                      blurRadius: 18,
                      offset: Offset(0, 8),
                    ),
                  ],
                ),
                child: Text(
                  creative.cta.isNotEmpty ? creative.cta : 'Shop Now',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
// ── Stats row ─────────────────────────────────────────────────────────────────

class _StatsRow extends StatelessWidget {
  const _StatsRow({
    required this.state,
    this.viewerId,
    this.hideReposts = false,
    this.onLike,
  });
  final FeedPostState state;
  final String? viewerId;
  final bool hideReposts;
  final VoidCallback? onLike;

  static String _fmt(int n) {
    if (n >= 1000000) return '${(n / 1000000).toStringAsFixed(1)}M';
    if (n >= 1000) return '${(n / 1000).toStringAsFixed(n >= 10000 ? 0 : 1)}K';
    return n.toString();
  }

  @override
  Widget build(BuildContext context) {
    final stats = state.stats;
    final isOwner =
        viewerId != null &&
        state.post.authorId != null &&
        viewerId == state.post.authorId;
    final hideLikes = (state.post.hideLikeCount ?? false) && !isOwner;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      decoration: BoxDecoration(
        color: const Color(0xFF1A2235),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        children: [
          // Left: like + comment
          Expanded(
            child: Row(
              children: [
                if (!hideLikes) ...[
                  GestureDetector(
                    onTap: onLike,
                    behavior: HitTestBehavior.opaque,
                    child: _StatChip(
                      iconWidget: _PostIconLike(
                        size: 15,
                        filled: state.liked,
                        color: state.liked
                            ? const Color(0xFF2b74b0)
                            : const Color(0xFF7A8BB0),
                      ),
                      iconColor: state.liked
                          ? const Color(0xFF2b74b0)
                          : const Color(0xFF7A8BB0),
                      value: _fmt(stats.hearts),
                    ),
                  ),
                  const SizedBox(width: 12),
                ],
                _StatChip(
                  icon: Icons.chat_bubble_outline_rounded,
                  iconColor: const Color(0xFF7A8BB0),
                  value: _fmt(stats.comments),
                ),
              ],
            ),
          ),
          // Right: views (+ reposts if not detail mode)
          Row(
            children: [
              _StatChip(
                icon: Icons.remove_red_eye_outlined,
                iconColor: const Color(0xFF7A8BB0),
                value: _fmt(stats.viewCount),
              ),
              if (!hideReposts) ...[
                const SizedBox(width: 12),
                _StatChip(
                  icon: Icons.repeat_rounded,
                  iconColor: const Color(0xFF7A8BB0),
                  value: _fmt(stats.reposts),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }
}

class _StatChip extends StatelessWidget {
  const _StatChip({
    this.icon,
    this.iconWidget,
    required this.iconColor,
    required this.value,
  });
  final IconData? icon;
  final Widget? iconWidget;
  final Color iconColor;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        iconWidget ?? Icon(icon!, size: 15, color: iconColor),
        const SizedBox(width: 4),
        Text(
          value,
          style: const TextStyle(
            color: Color(0xFF7A8BB0),
            fontSize: 13,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }
}

// ── Divider ───────────────────────────────────────────────────────────────────

class _Divider extends StatelessWidget {
  const _Divider();

  @override
  Widget build(BuildContext context) {
    return Divider(
      height: 1,
      thickness: 1,
      color: Colors.white.withValues(alpha: 0.06),
    );
  }
}

// ── Action bar ────────────────────────────────────────────────────────────────

class _ActionBar extends StatelessWidget {
  const _ActionBar({
    required this.state,
    required this.onLike,
    required this.onSave,
    this.onRepost,
    this.onComment,
  });
  final FeedPostState state;
  final VoidCallback onLike;
  final VoidCallback onSave;
  final VoidCallback? onRepost;
  final VoidCallback? onComment;

  @override
  Widget build(BuildContext context) {
    final commentsLocked = state.post.allowComments == false;

    return Padding(
      padding: const EdgeInsets.only(top: 4),
      child: Row(
        children: [
          Expanded(
            child: _ActionButton(
              iconWidget: _PostIconLike(
                size: 18,
                filled: state.liked,
                color: state.liked
                    ? const Color(0xFF2b74b0)
                    : const Color(0xFF7A8BB0),
              ),
              label: 'Like',
              color: state.liked
                  ? const Color(0xFF2b74b0)
                  : const Color(0xFF7A8BB0),
              onTap: onLike,
            ),
          ),
          Expanded(
            child: _ActionButton(
              icon: Icons.chat_bubble_outline_rounded,
              label: commentsLocked ? 'Comments off' : 'Comment',
              color: commentsLocked
                  ? const Color(0xFF5A6786)
                  : const Color(0xFF7A8BB0),
              onTap: commentsLocked ? () {} : (onComment ?? () {}),
            ),
          ),
          Expanded(
            child: _ActionButton(
              icon: Icons.repeat_rounded,
              label: 'Repost',
              color: const Color(0xFF7A8BB0),
              onTap:
                  onRepost ??
                  () {
                    ScaffoldMessenger.maybeOf(context)?.showSnackBar(
                      const SnackBar(
                        content: Text('Repost is not available right now'),
                        backgroundColor: Color(0xFFB91C1C),
                      ),
                    );
                  },
            ),
          ),
          Expanded(
            child: _ActionButton(
              icon: state.saved
                  ? Icons.bookmark_rounded
                  : Icons.bookmark_border_rounded,
              label: 'Save',
              color: state.saved
                  ? const Color(0xFF4AA3E4)
                  : const Color(0xFF7A8BB0),
              onTap: onSave,
            ),
          ),
        ],
      ),
    );
  }
}

class _ActionButton extends StatelessWidget {
  const _ActionButton({
    this.icon,
    this.iconWidget,
    required this.label,
    required this.color,
    required this.onTap,
  });

  final IconData? icon;
  final Widget? iconWidget;
  final String label;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            iconWidget ?? Icon(icon!, size: 18, color: color),
            const SizedBox(width: 5),
            Flexible(
              child: Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: color,
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Thumbs-up like icon (mirrors web's IconLike SVG) ─────────────────────────

class _PostIconLike extends StatelessWidget {
  const _PostIconLike({
    required this.size,
    required this.filled,
    required this.color,
  });
  final double size;
  final bool filled;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final String fill = filled ? 'currentColor' : 'none';
    final String svg =
        '''
<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <path d="M6 10h3.2V6.6a2.1 2.1 0 0 1 2.1-2.1c.46 0 .91.16 1.27.45l.22.18c.32.26.51.66.51 1.07V10h3.6a2 2 0 0 1 1.97 2.35l-1 5.3A2.2 2.2 0 0 1 15.43 20H8.2A2.2 2.2 0 0 1 6 17.8Z" stroke="currentColor" stroke-width="1.6" fill="$fill"/>
  <path d="M4 10h2v10H4a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Z" stroke="currentColor" stroke-width="1.6" fill="$fill"/>
</svg>''';
    return SvgPicture.string(
      svg,
      width: size,
      height: size,
      colorFilter: ColorFilter.mode(color, BlendMode.srcIn),
    );
  }
}
