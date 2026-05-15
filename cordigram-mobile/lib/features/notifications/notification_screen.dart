import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'dart:async';

import '../../core/config/app_theme.dart';
import '../../core/services/api_service.dart';
import '../post/post_detail_screen.dart';
import '../profile/profile_screen.dart';
import '../reels/reels_screen.dart';
import 'models/app_notification_item.dart';
import 'services/notification_realtime_service.dart';
import 'services/notification_service.dart';
import '../../core/services/language_controller.dart';

enum _NotificationTab { all, like, comment, mentions, follow, system }

extension _NotificationTabLabel on _NotificationTab {
  String get label {
    final lc = LanguageController.instance;
    switch (this) {
      case _NotificationTab.all:
        return lc.t('notifications.tabs.allActivity');
      case _NotificationTab.like:
        return lc.t('notifications.tabs.likes');
      case _NotificationTab.comment:
        return lc.t('notifications.tabs.comments');
      case _NotificationTab.mentions:
        return lc.t('notifications.tabs.mentions');
      case _NotificationTab.follow:
        return lc.t('notifications.tabs.followers');
      case _NotificationTab.system:
        return lc.t('notifications.tabs.system');
    }
  }
}

class NotificationScreen extends StatefulWidget {
  const NotificationScreen({super.key});

  @override
  State<NotificationScreen> createState() => _NotificationScreenState();
}

class _NotificationScreenState extends State<NotificationScreen> {
  static const Set<String> _systemTypes = {
    'login_alert',
    'post_moderation',
    'report',
    'system_notice',
  };

  List<AppNotificationItem> _items = const [];
  bool _loading = true;
  String? _error;
  _NotificationTab _activeTab = _NotificationTab.all;
  String? _pressedItemId;
  StreamSubscription<NotificationRealtimeEvent>? _notificationRtSub;
  StreamSubscription<NotificationStateEvent>? _notificationStateSub;
  StreamSubscription<NotificationDeletedEvent>? _notificationDeletedSub;

  bool _deleteMode = false;
  final Set<String> _selectedIds = {};

  static const Set<String> _realtimeNotificationTypes = {
    'post_like',
    'post_comment',
    'comment_like',
    'comment_reply',
    'post_mention',
    'follow',
    'login_alert',
    'post_moderation',
    'report',
    'system_notice',
  };

  AppSemanticColors get _tokens {
    final theme = Theme.of(context);
    return theme.extension<AppSemanticColors>() ??
        (theme.brightness == Brightness.dark
            ? AppSemanticColors.dark
            : AppSemanticColors.light);
  }

  @override
  void initState() {
    super.initState();
    _load(silent: true);
    _startNotificationRealtime();
  }

  @override
  void dispose() {
    _notificationRtSub?.cancel();
    _notificationStateSub?.cancel();
    _notificationDeletedSub?.cancel();
    super.dispose();
  }

  Future<void> _startNotificationRealtime() async {
    await NotificationRealtimeService.connect();
    _notificationRtSub?.cancel();
    _notificationRtSub = NotificationRealtimeService.events.listen((event) {
      if (!mounted) return;
      if (!_realtimeNotificationTypes.contains(event.notification.type)) {
        return;
      }

      setState(() {
        final idx = _items.indexWhere((n) => n.id == event.notification.id);
        if (idx >= 0) {
          final updated = List<AppNotificationItem>.from(_items);
          updated.removeAt(idx);
          updated.insert(0, event.notification);
          _items = updated;
          return;
        }

        _items = [event.notification, ..._items];
      });
    });

    _notificationStateSub?.cancel();
    _notificationStateSub = NotificationRealtimeService.stateEvents.listen((
      event,
    ) {
      if (!mounted) return;
      setState(() {
        _items = _items
            .map(
              (entry) => entry.id == event.id
                  ? (event.readAt == null
                        ? entry.copyWith(resetReadAt: true)
                        : entry.copyWith(readAt: event.readAt))
                  : entry,
            )
            .toList(growable: false);
      });
    });

    _notificationDeletedSub?.cancel();
    _notificationDeletedSub = NotificationRealtimeService.deletedEvents.listen((
      event,
    ) {
      if (!mounted) return;
      setState(() {
        _items = _items
            .where((entry) => entry.id != event.id)
            .toList(growable: false);
        _selectedIds.remove(event.id);
      });
    });
  }

  int _activityEpoch(AppNotificationItem item) {
    final activity = DateTime.tryParse(item.activityAt)?.millisecondsSinceEpoch;
    if (activity != null) return activity;
    final created = DateTime.tryParse(item.createdAt)?.millisecondsSinceEpoch;
    return created ?? 0;
  }

  List<AppNotificationItem> _mergeFetchedWithExisting(
    List<AppNotificationItem> fetched,
    List<AppNotificationItem> existing,
  ) {
    final mergedById = <String, AppNotificationItem>{};
    for (final item in existing) {
      if (item.id.isEmpty) continue;
      mergedById[item.id] = item;
    }
    for (final item in fetched) {
      if (item.id.isEmpty) continue;
      mergedById[item.id] = item;
    }
    final merged = mergedById.values.toList(growable: false);
    merged.sort((a, b) => _activityEpoch(b).compareTo(_activityEpoch(a)));
    return merged;
  }

  Future<void> _load({bool silent = false}) async {
    final showLoading = !silent || _items.isEmpty;
    setState(() {
      _loading = showLoading;
      _error = null;
    });

    try {
      final fetched = await NotificationService.fetchNotifications();
      if (!mounted) return;
      setState(() {
        _items = _mergeFetchedWithExisting(fetched, _items);
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.message);
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = LanguageController.instance.t('notifications.loadError'));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  String? _priorityCommentIdForItem(AppNotificationItem item) {
    if (item.type == 'comment_like' || item.type == 'comment_reply') {
      return item.commentId;
    }
    if (item.type == 'post_mention' && item.mentionSource == 'comment') {
      return item.commentId;
    }
    return null;
  }

  Future<String?> _resolvePriorityCommentId(AppNotificationItem item) async {
    final rawCommentId = _priorityCommentIdForItem(item);
    final postId = item.postId;
    if (rawCommentId == null || rawCommentId.isEmpty) return null;
    if (postId == null || postId.isEmpty) return rawCommentId;

    try {
      final comment = await NotificationService.fetchCommentById(
        postId: postId,
        commentId: rawCommentId,
      );
      final root = comment['rootCommentId'] as String?;
      final parent = comment['parentId'] as String?;
      final id = comment['id'] as String?;
      return (root?.isNotEmpty == true)
          ? root
          : (parent?.isNotEmpty == true)
          ? parent
          : (id?.isNotEmpty == true)
          ? id
          : rawCommentId;
    } catch (_) {
      return rawCommentId;
    }
  }

  Future<void> _markReadOptimistic(AppNotificationItem item) async {
    if (!item.isUnread) return;
    final nowIso = DateTime.now().toUtc().toIso8601String();
    setState(() {
      _items = _items
          .map(
            (entry) =>
                entry.id == item.id ? entry.copyWith(readAt: nowIso) : entry,
          )
          .toList(growable: false);
    });
    try {
      await NotificationService.markRead(item.id);
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _items = _items
            .map(
              (entry) => entry.id == item.id
                  ? entry.copyWith(resetReadAt: true)
                  : entry,
            )
            .toList(growable: false);
      });
    }
  }

  Future<void> _onItemTap(AppNotificationItem item) async {
    if (_deleteMode) {
      setState(() {
        if (_selectedIds.contains(item.id)) {
          _selectedIds.remove(item.id);
        } else {
          _selectedIds.add(item.id);
        }
      });
      return;
    }

    if (item.type == 'system_notice' || item.type == 'report') {
      return;
    }

    await _markReadOptimistic(item);
    if (!mounted) return;

    if (item.type == 'follow' && item.actor.id.isNotEmpty) {
      await Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => ProfileScreen(userId: item.actor.id),
        ),
      );
      return;
    }

    if (item.postId == null || item.postId!.isEmpty) return;

    final postKind = item.postKind.trim().toLowerCase();
    if (postKind == 'reel') {
      await Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => ReelsScreen(
            scope: 'all',
            initialReelId: item.postId!,
            pinInitialReelToTop: true,
          ),
        ),
      );
      return;
    }

    final priorityCommentId = await _resolvePriorityCommentId(item);
    if (!mounted) return;
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => PostDetailScreen(
          postId: item.postId!,
          priorityCommentId: priorityCommentId,
        ),
      ),
    );
  }

  List<AppNotificationItem> get _filtered {
    bool allow(AppNotificationItem item) {
      switch (_activeTab) {
        case _NotificationTab.all:
          return true;
        case _NotificationTab.like:
          return item.type == 'post_like' || item.type == 'comment_like';
        case _NotificationTab.comment:
          return item.type == 'post_comment' || item.type == 'comment_reply';
        case _NotificationTab.mentions:
          return item.type == 'post_mention';
        case _NotificationTab.follow:
          return item.type == 'follow';
        case _NotificationTab.system:
          return _systemTypes.contains(item.type);
      }
    }

    return _items.where(allow).toList(growable: false);
  }

  String _relativeTime(String value) {
    final lc = LanguageController.instance;
    final dt = DateTime.tryParse(value)?.toLocal();
    if (dt == null) return '';
    final diff = DateTime.now().difference(dt);
    if (diff.inSeconds < 60) return lc.t('notifications.justNow');
    if (diff.inMinutes < 60) return lc.t('notifications.minAgo', {'n': diff.inMinutes.toString()});
    if (diff.inHours < 24) return lc.t('notifications.hoursAgo', {'n': diff.inHours.toString()});
    if (diff.inDays < 7) return lc.t('notifications.daysAgo', {'n': diff.inDays.toString()});
    final weeks = (diff.inDays / 7).floor();
    if (weeks < 5) return lc.t('notifications.weeksAgo', {'n': weeks.toString()});
    final months = (diff.inDays / 30).floor();
    if (months < 12) return lc.t('notifications.monthsAgo', {'n': months.toString()});
    final years = (diff.inDays / 365).floor();
    return lc.t('notifications.yearsAgo', {'n': years.toString()});
  }

  String _displayName(NotificationActor actor) {
    if (actor.username.trim().isNotEmpty) return '@${actor.username.trim()}';
    if (actor.displayName.trim().isNotEmpty) return actor.displayName.trim();
    return LanguageController.instance.t('notifications.someone');
  }

  String _message(AppNotificationItem item) {
    final lc = LanguageController.instance;
    final name = _displayName(item.actor);
    if (item.type == 'post_like') {
      final n = (item.likeCount - 1).clamp(0, 999);
      final target = item.postKind == 'reel' ? lc.t('notifications.targetReel') : lc.t('notifications.targetPost');
      return n > 0
          ? lc.t('notifications.msgPostLikeMultiple', {'name': name, 'n': n.toString(), 'target': target})
          : lc.t('notifications.msgPostLikeSingle', {'name': name, 'target': target});
    }
    if (item.type == 'post_comment') {
      final n = (item.commentCount - 1).clamp(0, 999);
      final target = item.postKind == 'reel' ? lc.t('notifications.targetReel') : lc.t('notifications.targetPost');
      return n > 0
          ? lc.t('notifications.msgPostCommentMultiple', {'name': name, 'n': n.toString(), 'target': target})
          : lc.t('notifications.msgPostCommentSingle', {'name': name, 'target': target});
    }
    if (item.type == 'comment_like') {
      final n = (item.likeCount - 1).clamp(0, 999);
      return n > 0
          ? lc.t('notifications.msgCommentLikeMultiple', {'name': name, 'n': n.toString()})
          : lc.t('notifications.msgCommentLikeSingle', {'name': name});
    }
    if (item.type == 'comment_reply') {
      final n = (item.commentCount - 1).clamp(0, 999);
      return n > 0
          ? lc.t('notifications.msgCommentReplyMultiple', {'name': name, 'n': n.toString()})
          : lc.t('notifications.msgCommentReplySingle', {'name': name});
    }
    if (item.type == 'post_mention') {
      final source = item.mentionSource == 'comment' ? lc.t('notifications.targetComment') : lc.t('notifications.targetPost');
      return lc.t('notifications.msgMention', {'name': name, 'target': source});
    }
    if (item.type == 'follow') {
      return lc.t('notifications.msgFollow', {'name': name});
    }
    if (item.type == 'login_alert') {
      return lc.t('notifications.msgLoginAlert');
    }
    if (item.type == 'post_moderation') {
      final target = item.postKind == 'reel' ? lc.t('notifications.targetReel') : lc.t('notifications.targetPost');
      if (item.moderationDecision == 'reject') {
        return lc.t('notifications.msgModerationRejected', {'target': target});
      }
      return lc.t('notifications.msgModerationPublished', {'target': target});
    }
    if (item.type == 'report') {
      if (item.reportAudience == 'offender') {
        return lc.t('notifications.msgReportOffender');
      }
      return item.reportOutcome == 'action_taken'
          ? lc.t('notifications.msgReportActionTaken')
          : lc.t('notifications.msgReportNoViolation');
    }
    if (item.type == 'system_notice') {
      final title = item.systemNoticeTitle?.trim() ?? '';
      final body = item.systemNoticeBody?.trim() ?? '';
      if (title.isEmpty) return body.isEmpty ? lc.t('notifications.msgSystemNotice') : body;
      return body.isEmpty ? title : '$title: $body';
    }
    return lc.t('notifications.msgNew');
  }

  IconData _iconFor(String type) {
    switch (type) {
      case 'post_like':
      case 'comment_like':
        return Icons.favorite_rounded;
      case 'post_comment':
      case 'comment_reply':
        return Icons.chat_bubble_rounded;
      case 'post_mention':
        return Icons.alternate_email_rounded;
      case 'follow':
        return Icons.person_add_alt_1_rounded;
      case 'login_alert':
        return Icons.security_rounded;
      case 'post_moderation':
        return Icons.gavel_rounded;
      case 'report':
        return Icons.report_problem_rounded;
      case 'system_notice':
        return Icons.campaign_rounded;
      default:
        return Icons.notifications_rounded;
    }
  }

  void _showSnack(String message, {bool error = false}) {
    if (!mounted) return;
    final scheme = Theme.of(context).colorScheme;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: error ? scheme.error : scheme.surfaceContainerHighest,
      ),
    );
  }

  bool _isMutedForItem(AppNotificationItem item) {
    if (item.postMutedIndefinitely == true) return true;
    final mutedUntil = item.postMutedUntil;
    if (mutedUntil == null || mutedUntil.isEmpty) return false;
    final dt = DateTime.tryParse(mutedUntil)?.toUtc();
    if (dt == null) return false;
    return dt.isAfter(DateTime.now().toUtc());
  }

  bool _canMuteItem(AppNotificationItem item) {
    if (item.postId == null || _isMutedForItem(item)) return false;
    if (item.postKind != 'post' && item.postKind != 'reel') return false;
    return item.isOwnPost != false;
  }

  String? _buildLocalDateTimeIso(String date, String time) {
    if (date.isEmpty || time.isEmpty) return null;
    final dt = DateTime.tryParse('${date}T$time:00');
    if (dt == null) return null;
    return dt.toUtc().toIso8601String();
  }

  Future<String?> _pickCustomDate(String current) async {
    final now = DateTime.now();
    final seed = DateTime.tryParse(current) ?? now;
    final picked = await showDatePicker(
      context: context,
      initialDate: seed,
      firstDate: DateTime(now.year, now.month, now.day),
      lastDate: DateTime(now.year + 2, 12, 31),
    );
    if (picked == null) return null;
    final y = picked.year.toString().padLeft(4, '0');
    final m = picked.month.toString().padLeft(2, '0');
    final d = picked.day.toString().padLeft(2, '0');
    return '$y-$m-$d';
  }

  Future<String?> _pickCustomTime(String current) async {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final now = DateTime.now();
    DateTime seed;
    if (current.isNotEmpty) {
      final parts = current.split(':');
      final h = parts.isNotEmpty
          ? int.tryParse(parts[0]) ?? now.hour
          : now.hour;
      final m = parts.length > 1
          ? int.tryParse(parts[1]) ?? now.minute
          : now.minute;
      seed = DateTime(now.year, now.month, now.day, h, m);
    } else {
      seed = now;
    }

    DateTime draft = seed;
    final picked = await showModalBottomSheet<DateTime>(
      context: context,
      backgroundColor: scheme.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => SafeArea(
        top: false,
        child: SizedBox(
          height: 320,
          child: Column(
            children: [
              Container(
                width: 36,
                height: 4,
                margin: const EdgeInsets.symmetric(vertical: 10),
                decoration: BoxDecoration(
                  color: scheme.onSurfaceVariant.withValues(alpha: 0.35),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                child: Row(
                  children: [
                    TextButton(
                      onPressed: () => Navigator.of(context).pop(),
                      child: Text(LanguageController.instance.t('notifications.cancel')),
                    ),
                    const Spacer(),
                    Text(
                      LanguageController.instance.t('notifications.muteSelectTime'),
                      style: TextStyle(
                        color: scheme.onSurface,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const Spacer(),
                    TextButton(
                      onPressed: () => Navigator.of(context).pop(draft),
                      child: Text(LanguageController.instance.t('notifications.done')),
                    ),
                  ],
                ),
              ),
              Divider(height: 1, color: scheme.outline.withValues(alpha: 0.8)),
              Expanded(
                child: CupertinoTheme(
                  data: CupertinoThemeData(brightness: theme.brightness),
                  child: CupertinoDatePicker(
                    mode: CupertinoDatePickerMode.time,
                    use24hFormat: true,
                    minuteInterval: 1,
                    initialDateTime: seed,
                    onDateTimeChanged: (value) {
                      draft = DateTime(
                        seed.year,
                        seed.month,
                        seed.day,
                        value.hour,
                        value.minute,
                      );
                    },
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );

    if (picked == null) return null;
    final h = picked.hour.toString().padLeft(2, '0');
    final m = picked.minute.toString().padLeft(2, '0');
    return '$h:$m';
  }

  Future<void> _toggleRead(AppNotificationItem item) async {
    final prev = item;
    final nowIso = DateTime.now().toUtc().toIso8601String();

    setState(() {
      _items = _items
          .map(
            (entry) => entry.id == item.id
                ? (item.isUnread
                      ? entry.copyWith(readAt: nowIso)
                      : entry.copyWith(resetReadAt: true))
                : entry,
          )
          .toList(growable: false);
    });

    try {
      if (item.isUnread) {
        await NotificationService.markRead(item.id);
      } else {
        await NotificationService.markUnread(item.id);
      }
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _items = _items
            .map((entry) => entry.id == item.id ? prev : entry)
            .toList(growable: false);
      });
      _showSnack(LanguageController.instance.t('notifications.updateError'), error: true);
    }
  }

  Future<void> _deleteItem(AppNotificationItem item) async {
    final prev = _items;
    setState(() {
      _items = _items
          .where((entry) => entry.id != item.id)
          .toList(growable: false);
    });
    try {
      await NotificationService.deleteNotification(item.id);
    } catch (_) {
      if (!mounted) return;
      setState(() => _items = prev);
      _showSnack(LanguageController.instance.t('notifications.deleteError'), error: true);
    }
  }

  // ── Filter sheet ────────────────────────────────────────────────────────────

  void _showFilterSheet() {
    final scheme = Theme.of(context).colorScheme;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: scheme.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) {
        return SafeArea(
          top: false,
          minimum: const EdgeInsets.fromLTRB(10, 0, 10, 8),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(height: 8),
              Container(
                width: 36,
                height: 4,
                decoration: BoxDecoration(
                  color: scheme.onSurfaceVariant.withValues(alpha: 0.35),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(height: 12),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 4),
                child: Text(
                  LanguageController.instance.t('notifications.filterTitle'),
                  style: TextStyle(
                    color: scheme.onSurface,
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              const SizedBox(height: 8),
              for (final tab in _NotificationTab.values)
                ListTile(
                  dense: true,
                  contentPadding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 0),
                  leading: Icon(
                    _tabIcon(tab),
                    size: 20,
                    color: _activeTab == tab
                        ? scheme.primary
                        : scheme.onSurfaceVariant,
                  ),
                  title: Text(
                    tab.label,
                    style: TextStyle(
                      color: _activeTab == tab
                          ? (isDark
                                ? _tokens.primarySoft
                                : scheme.primary)
                          : scheme.onSurface,
                      fontWeight: _activeTab == tab
                          ? FontWeight.w700
                          : FontWeight.w500,
                      fontSize: 14,
                    ),
                  ),
                  trailing: _activeTab == tab
                      ? Icon(Icons.check_rounded, color: scheme.primary, size: 20)
                      : null,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(10),
                  ),
                  tileColor: _activeTab == tab
                      ? scheme.primary.withValues(
                          alpha: isDark ? 0.18 : 0.08,
                        )
                      : null,
                  onTap: () {
                    setState(() => _activeTab = tab);
                    Navigator.pop(context);
                  },
                ),
              const SizedBox(height: 4),
            ],
          ),
        );
      },
    );
  }

  IconData _tabIcon(_NotificationTab tab) {
    switch (tab) {
      case _NotificationTab.all:
        return Icons.notifications_rounded;
      case _NotificationTab.like:
        return Icons.favorite_rounded;
      case _NotificationTab.comment:
        return Icons.chat_bubble_rounded;
      case _NotificationTab.mentions:
        return Icons.alternate_email_rounded;
      case _NotificationTab.follow:
        return Icons.person_add_alt_1_rounded;
      case _NotificationTab.system:
        return Icons.campaign_rounded;
    }
  }

  // ── Manage sheet ────────────────────────────────────────────────────────────

  void _showManageSheet() {
    final scheme = Theme.of(context).colorScheme;
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: scheme.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) {
        return SafeArea(
          top: false,
          minimum: const EdgeInsets.fromLTRB(10, 0, 10, 8),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(height: 8),
              Container(
                width: 36,
                height: 4,
                decoration: BoxDecoration(
                  color: scheme.onSurfaceVariant.withValues(alpha: 0.35),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(height: 8),
              ListTile(
                leading: Icon(
                  Icons.done_all_rounded,
                  color: scheme.onSurfaceVariant,
                ),
                title: Text(
                  LanguageController.instance.t('notifications.manageMarkAllRead'),
                  style: TextStyle(color: scheme.onSurface),
                ),
                onTap: () {
                  Navigator.pop(context);
                  _confirmMarkAllRead();
                },
              ),
              ListTile(
                leading: Icon(Icons.delete_outline_rounded, color: scheme.error),
                title: Text(
                  LanguageController.instance.t('notifications.manageDeleteAll'),
                  style: TextStyle(color: scheme.error),
                ),
                onTap: () {
                  Navigator.pop(context);
                  setState(() {
                    _deleteMode = true;
                    _selectedIds.clear();
                  });
                },
              ),
              const SizedBox(height: 8),
            ],
          ),
        );
      },
    );
  }

  // ── Mark all as read ────────────────────────────────────────────────────────

  void _confirmMarkAllRead() {
    final unreadCount = _items.where((n) => n.isUnread).length;
    if (unreadCount == 0) {
      _showSnack(LanguageController.instance.t('notifications.alreadyAllRead'));
      return;
    }
    final scheme = Theme.of(context).colorScheme;
    showDialog<void>(
      context: context,
      barrierColor: Colors.black.withValues(alpha: 0.5),
      builder: (dialogCtx) {
        bool saving = false;
        return StatefulBuilder(
          builder: (ctx, setDialogState) {
            return AlertDialog(
              backgroundColor: scheme.surface,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(18),
                side: BorderSide(color: scheme.outline.withValues(alpha: 0.7)),
              ),
              title: Text(
                LanguageController.instance.t('notifications.dialogMarkAllTitle'),
                style: TextStyle(
                  color: scheme.onSurface,
                  fontWeight: FontWeight.w800,
                ),
              ),
              content: Text(
                unreadCount == 1
                    ? LanguageController.instance.t('notifications.dialogMarkAllBodySingle')
                    : LanguageController.instance.t('notifications.dialogMarkAllBodyPlural', {'count': unreadCount.toString()}),
                style: TextStyle(color: scheme.onSurfaceVariant),
              ),
              actions: [
                TextButton(
                  onPressed: saving
                      ? null
                      : () => Navigator.pop(dialogCtx),
                  child: Text(LanguageController.instance.t('notifications.cancel')),
                ),
                FilledButton(
                  onPressed: saving
                      ? null
                      : () async {
                          setDialogState(() => saving = true);
                          try {
                            await NotificationService.markAllRead();
                            if (mounted) {
                              final nowIso =
                                  DateTime.now().toUtc().toIso8601String();
                              setState(() {
                                _items = _items
                                    .map(
                                      (entry) => entry.isUnread
                                          ? entry.copyWith(readAt: nowIso)
                                          : entry,
                                    )
                                    .toList(growable: false);
                              });
                              _showSnack(LanguageController.instance.t('notifications.dialogMarkAllSuccess'));
                            }
                            if (ctx.mounted) Navigator.pop(dialogCtx);
                          } catch (_) {
                            setDialogState(() => saving = false);
                            if (mounted) {
                              _showSnack(
                                LanguageController.instance.t('notifications.dialogMarkAllFailed'),
                                error: true,
                              );
                            }
                            if (ctx.mounted) Navigator.pop(dialogCtx);
                          }
                        },
                  child: Text(saving ? LanguageController.instance.t('notifications.dialogMarkAllMarking') : LanguageController.instance.t('notifications.dialogMarkAllConfirm')),
                ),
              ],
            );
          },
        );
      },
    );
  }

  // ── Bulk delete ─────────────────────────────────────────────────────────────

  void _confirmBulkDelete() {
    final count = _selectedIds.length;
    if (count == 0) return;
    final scheme = Theme.of(context).colorScheme;
    showDialog<void>(
      context: context,
      barrierColor: Colors.black.withValues(alpha: 0.5),
      builder: (dialogCtx) {
        bool deleting = false;
        return StatefulBuilder(
          builder: (ctx, setDialogState) {
            return AlertDialog(
              backgroundColor: scheme.surface,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(18),
                side: BorderSide(color: scheme.outline.withValues(alpha: 0.7)),
              ),
              title: Text(
                LanguageController.instance.t('notifications.dialogDeleteTitle'),
                style: TextStyle(
                  color: scheme.onSurface,
                  fontWeight: FontWeight.w800,
                ),
              ),
              content: Text(
                count == 1
                    ? LanguageController.instance.t('notifications.dialogDeleteBodySingle')
                    : LanguageController.instance.t('notifications.dialogDeleteBodyPlural', {'count': count.toString()}),
                style: TextStyle(color: scheme.onSurfaceVariant),
              ),
              actions: [
                TextButton(
                  onPressed: deleting
                      ? null
                      : () => Navigator.pop(dialogCtx),
                  child: Text(LanguageController.instance.t('notifications.cancel')),
                ),
                FilledButton(
                  style: FilledButton.styleFrom(
                    backgroundColor: scheme.error,
                    foregroundColor: scheme.onError,
                  ),
                  onPressed: deleting
                      ? null
                      : () async {
                          setDialogState(() => deleting = true);
                          final ids = Set<String>.from(_selectedIds);
                          try {
                            await Future.wait(
                              ids.map(
                                (id) => NotificationService.deleteNotification(
                                  id,
                                ).catchError((_) {}),
                              ),
                            );
                            if (mounted) {
                              setState(() {
                                _items = _items
                                    .where((n) => !ids.contains(n.id))
                                    .toList(growable: false);
                                _selectedIds.clear();
                                _deleteMode = false;
                              });
                              _showSnack(
                                count == 1
                                    ? LanguageController.instance.t('notifications.dialogDeleteSuccessSingle')
                                    : LanguageController.instance.t('notifications.dialogDeleteSuccessPlural', {'count': count.toString()}),
                              );
                            }
                            if (ctx.mounted) Navigator.pop(dialogCtx);
                          } catch (_) {
                            setDialogState(() => deleting = false);
                            if (mounted) {
                              _showSnack(LanguageController.instance.t('notifications.dialogDeleteFailed'), error: true);
                            }
                            if (ctx.mounted) Navigator.pop(dialogCtx);
                          }
                        },
                  child: Text(deleting ? LanguageController.instance.t('notifications.dialogDeleting') : LanguageController.instance.t('notifications.dialogDeleteBtnLabel')),
                ),
              ],
            );
          },
        );
      },
    );
  }

  // ── Per-item menu ───────────────────────────────────────────────────────────

  Future<void> _openItemMenu(AppNotificationItem item) async {
    final scheme = Theme.of(context).colorScheme;
    final action = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: scheme.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (_) => SafeArea(
        top: false,
        minimum: const EdgeInsets.fromLTRB(10, 0, 10, 8),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 8),
            Container(
              width: 36,
              height: 4,
              decoration: BoxDecoration(
                color: scheme.onSurfaceVariant.withValues(alpha: 0.35),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(height: 8),
            ListTile(
              leading: Icon(
                item.isUnread
                    ? Icons.mark_email_read_outlined
                    : Icons.mark_email_unread_outlined,
                color: scheme.onSurfaceVariant,
              ),
              title: Text(
                item.isUnread ? LanguageController.instance.t('notifications.menuMarkRead') : LanguageController.instance.t('notifications.menuMarkUnread'),
                style: TextStyle(color: scheme.onSurface),
              ),
              onTap: () => Navigator.pop(context, 'toggle-read'),
            ),
            if (_canMuteItem(item))
              ListTile(
                leading: Icon(
                  Icons.notifications_off_outlined,
                  color: scheme.onSurfaceVariant,
                ),
                title: Text(
                  item.postKind == 'reel' ? LanguageController.instance.t('notifications.menuMuteReel') : LanguageController.instance.t('notifications.menuMutePost'),
                  style: TextStyle(color: scheme.onSurface),
                ),
                onTap: () => Navigator.pop(context, 'mute'),
              ),
            ListTile(
              leading: Icon(Icons.delete_outline_rounded, color: scheme.error),
              title: Text(
                LanguageController.instance.t('notifications.menuDelete'),
                style: TextStyle(color: scheme.error),
              ),
              onTap: () => Navigator.pop(context, 'delete'),
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );

    if (!mounted || action == null) return;
    if (action == 'toggle-read') {
      await _toggleRead(item);
      return;
    }
    if (action == 'delete') {
      await _deleteItem(item);
      return;
    }
    if (action == 'mute') {
      await _openMuteOverlay(item);
    }
  }

  Future<void> _openMuteOverlay(AppNotificationItem item) async {
    if (item.postId == null) return;

    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final tokens = _tokens;
    final isDark = theme.brightness == Brightness.dark;

    final lc = LanguageController.instance;
    final options = <Map<String, dynamic>>[
      {'key': '5m', 'label': lc.t('settings.notifications.muteOptions.5m'), 'ms': 5 * 60 * 1000},
      {'key': '10m', 'label': lc.t('settings.notifications.muteOptions.10m'), 'ms': 10 * 60 * 1000},
      {'key': '15m', 'label': lc.t('settings.notifications.muteOptions.15m'), 'ms': 15 * 60 * 1000},
      {'key': '30m', 'label': lc.t('settings.notifications.muteOptions.30m'), 'ms': 30 * 60 * 1000},
      {'key': '1h', 'label': lc.t('settings.notifications.muteOptions.1h'), 'ms': 60 * 60 * 1000},
      {'key': '1d', 'label': lc.t('settings.notifications.muteOptions.1d'), 'ms': 24 * 60 * 60 * 1000},
      {'key': 'until', 'label': lc.t('settings.notifications.muteOptions.until'), 'ms': null},
      {'key': 'custom', 'label': lc.t('settings.notifications.muteOptions.custom'), 'ms': null},
    ];

    String selected = '5m';
    String customDate = '';
    String customTime = '';
    String? error;
    bool saving = false;

    await showDialog<void>(
      context: context,
      barrierColor: Colors.black.withValues(alpha: 0.55),
      builder: (dialogCtx) {
        return StatefulBuilder(
          builder: (ctx, setModalState) {
            return Dialog(
              backgroundColor: scheme.surface,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(18),
                side: BorderSide(color: scheme.outline.withValues(alpha: 0.7)),
              ),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                lc.t('notifications.muteTitle'),
                                style: TextStyle(
                                  color: scheme.onSurface,
                                  fontSize: 20,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                              const SizedBox(height: 6),
                              Text(
                                lc.t('notifications.muteSubtitle'),
                                style: TextStyle(
                                  color: scheme.onSurfaceVariant,
                                  fontSize: 14,
                                ),
                              ),
                            ],
                          ),
                        ),
                        IconButton(
                          onPressed: saving
                              ? null
                              : () => Navigator.of(dialogCtx).pop(),
                          icon: Icon(
                            Icons.close_rounded,
                            color: scheme.onSurfaceVariant,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    LayoutBuilder(
                      builder: (_, constraints) {
                        final itemWidth = (constraints.maxWidth - 8) / 2;
                        Widget buildOptionTile(
                          Map<String, dynamic> opt, {
                          double? width,
                        }) {
                          final key = opt['key'] as String;
                          final active = selected == key;
                          return GestureDetector(
                            onTap: saving
                                ? null
                                : () => setModalState(() {
                                    selected = key;
                                    error = null;
                                  }),
                            child: Container(
                              width: width,
                              padding: const EdgeInsets.symmetric(
                                horizontal: 12,
                                vertical: 12,
                              ),
                              decoration: BoxDecoration(
                                borderRadius: BorderRadius.circular(12),
                                border: Border.all(
                                  color: active
                                      ? scheme.primary.withValues(
                                          alpha: isDark ? 0.6 : 0.4,
                                        )
                                      : scheme.outline,
                                ),
                                color: active
                                    ? (isDark
                                          ? scheme.primary.withValues(
                                              alpha: 0.25,
                                            )
                                          : scheme.primaryContainer)
                                    : Colors.transparent,
                              ),
                              child: Text(
                                opt['label'] as String,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  color: active
                                      ? (isDark
                                            ? tokens.primarySoft
                                            : scheme.onPrimaryContainer)
                                      : scheme.onSurfaceVariant,
                                  fontWeight: FontWeight.w700,
                                  fontSize: 13,
                                ),
                              ),
                            ),
                          );
                        }

                        final quickOptions = options
                            .where((opt) {
                              final key = opt['key'] as String;
                              return key != 'until' && key != 'custom';
                            })
                            .toList(growable: false);
                        final finalRowOptions = options
                            .where((opt) {
                              final key = opt['key'] as String;
                              return key == 'until' || key == 'custom';
                            })
                            .toList(growable: false);

                        return Column(
                          children: [
                            Wrap(
                              spacing: 8,
                              runSpacing: 8,
                              children: quickOptions
                                  .map(
                                    (opt) =>
                                        buildOptionTile(opt, width: itemWidth),
                                  )
                                  .toList(growable: false),
                            ),
                            if (finalRowOptions.isNotEmpty) ...[
                              const SizedBox(height: 8),
                              Column(
                                children: [
                                  for (
                                    var i = 0;
                                    i < finalRowOptions.length;
                                    i++
                                  ) ...[
                                    if (i > 0) const SizedBox(height: 8),
                                    buildOptionTile(
                                      finalRowOptions[i],
                                      width: constraints.maxWidth,
                                    ),
                                  ],
                                ],
                              ),
                            ],
                          ],
                        );
                      },
                    ),
                    if (selected == 'custom') ...[
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          Expanded(
                            child: OutlinedButton.icon(
                              onPressed: saving
                                  ? null
                                  : () async {
                                      final next = await _pickCustomDate(
                                        customDate,
                                      );
                                      if (next == null) return;
                                      setModalState(() {
                                        customDate = next;
                                        error = null;
                                      });
                                    },
                              icon: const Icon(
                                Icons.calendar_today_outlined,
                                size: 16,
                              ),
                              label: Text(
                                customDate.isEmpty ? lc.t('notifications.muteSelectDate') : customDate,
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: OutlinedButton.icon(
                              onPressed: saving
                                  ? null
                                  : () async {
                                      final next = await _pickCustomTime(
                                        customTime,
                                      );
                                      if (next == null) return;
                                      setModalState(() {
                                        customTime = next;
                                        error = null;
                                      });
                                    },
                              icon: const Icon(
                                Icons.schedule_rounded,
                                size: 16,
                              ),
                              label: Text(
                                customTime.isEmpty ? lc.t('notifications.muteSelectTime') : customTime,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                    if (error != null) ...[
                      const SizedBox(height: 10),
                      Text(
                        error!,
                        style: TextStyle(color: scheme.error, fontSize: 13),
                      ),
                    ],
                    const SizedBox(height: 14),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.end,
                      children: [
                        TextButton(
                          onPressed: saving
                              ? null
                              : () => Navigator.of(dialogCtx).pop(),
                          child: Text(lc.t('notifications.cancel')),
                        ),
                        const SizedBox(width: 8),
                        FilledButton(
                          onPressed: saving
                              ? null
                              : () async {
                                  setModalState(() {
                                    saving = true;
                                    error = null;
                                  });
                                  try {
                                    String? mutedUntil;
                                    bool mutedIndefinitely = false;
                                    final selectedOpt = options.firstWhere(
                                      (o) => o['key'] == selected,
                                    );

                                    if (selected == 'until') {
                                      mutedIndefinitely = true;
                                    } else if (selected == 'custom') {
                                      final iso = _buildLocalDateTimeIso(
                                        customDate,
                                        customTime,
                                      );
                                      if (iso == null) {
                                        setModalState(() {
                                          saving = false;
                                          error = lc.t('notifications.muteErrorInvalidDateTime');
                                        });
                                        return;
                                      }
                                      final dt = DateTime.parse(iso);
                                      if (!dt.isAfter(DateTime.now().toUtc())) {
                                        setModalState(() {
                                          saving = false;
                                          error = lc.t('notifications.muteErrorFutureTime');
                                        });
                                        return;
                                      }
                                      mutedUntil = iso;
                                    } else {
                                      final ms = selectedOpt['ms'] as int?;
                                      if (ms != null) {
                                        mutedUntil = DateTime.now()
                                            .toUtc()
                                            .add(Duration(milliseconds: ms))
                                            .toIso8601String();
                                      } else {
                                        mutedIndefinitely = true;
                                      }
                                    }

                                    final res =
                                        await NotificationService.updatePostMute(
                                          postId: item.postId!,
                                          mutedUntil: mutedUntil,
                                          mutedIndefinitely: mutedIndefinitely,
                                        );

                                    final newMutedUntil =
                                        res['mutedUntil'] as String?;
                                    final newMutedIndef =
                                        res['mutedIndefinitely'] as bool? ??
                                        false;

                                    if (mounted) {
                                      setState(() {
                                        _items = _items
                                            .map(
                                              (entry) => entry.id == item.id
                                                  ? entry.copyWith(
                                                      postMutedUntil:
                                                          newMutedUntil,
                                                      postMutedIndefinitely:
                                                          newMutedIndef,
                                                    )
                                                  : entry,
                                            )
                                            .toList(growable: false);
                                      });
                                    }

                                    if (ctx.mounted) {
                                      Navigator.of(dialogCtx).pop();
                                    }
                                  } catch (e) {
                                    setModalState(() {
                                      saving = false;
                                      error = e is ApiException
                                          ? e.message
                                          : lc.t('notifications.updateError');
                                    });
                                  }
                                },
                          child: Text(saving ? lc.t('notifications.muteSaving') : lc.t('notifications.muteSave')),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }

  // ── Build ───────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final tokens = _tokens;
    final isDark = theme.brightness == Brightness.dark;
    final items = _filtered;

    return Scaffold(
      backgroundColor: theme.scaffoldBackgroundColor,
      appBar: AppBar(
        backgroundColor: scheme.surface,
        elevation: 0,
        iconTheme: IconThemeData(color: scheme.onSurface),
        title: _deleteMode
            ? Text(
                _selectedIds.isEmpty
                    ? LanguageController.instance.t('notifications.selectNotificationsBar')
                    : LanguageController.instance.t('notifications.selectedCountBar', {'count': _selectedIds.length.toString()}),
                style: TextStyle(
                  color: scheme.onSurface,
                  fontSize: 17,
                  fontWeight: FontWeight.w700,
                ),
              )
            : Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    LanguageController.instance.t('notifications.appBarTitle'),
                    style: TextStyle(
                      color: scheme.onSurface,
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
        actions: _deleteMode
            ? [
                if (_selectedIds.isNotEmpty)
                  TextButton(
                    onPressed: _confirmBulkDelete,
                    child: Text(
                      LanguageController.instance.t('notifications.deleteCountBtn', {'count': _selectedIds.length.toString()}),
                      style: TextStyle(
                        color: scheme.error,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                TextButton(
                  onPressed: () => setState(() {
                    _deleteMode = false;
                    _selectedIds.clear();
                  }),
                  child: Text(
                    LanguageController.instance.t('notifications.cancel'),
                    style: TextStyle(color: scheme.onSurfaceVariant),
                  ),
                ),
              ]
            : [
                IconButton(
                  onPressed: _showManageSheet,
                  icon: Icon(
                    Icons.tune_rounded,
                    color: scheme.onSurfaceVariant,
                  ),
                  tooltip: LanguageController.instance.t('notifications.manageTooltip'),
                ),
                IconButton(
                  onPressed: _load,
                  icon: Icon(
                    Icons.refresh_rounded,
                    color: isDark ? scheme.onSurfaceVariant : scheme.primary,
                  ),
                ),
              ],
      ),
      body: Column(
        children: [
          // ── Filter toolbar ──────────────────────────────────────────────────
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 8),
            child: GestureDetector(
              onTap: _deleteMode ? null : _showFilterSheet,
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 9,
                ),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(
                    color: scheme.outline.withValues(alpha: 0.9),
                  ),
                  color: isDark
                      ? scheme.surface
                      : scheme.surfaceContainerLowest,
                ),
                child: Row(
                  children: [
                    Icon(
                      _tabIcon(_activeTab),
                      size: 16,
                      color: scheme.primary,
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        _activeTab.label,
                        style: TextStyle(
                          color: scheme.onSurface,
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    Icon(
                      Icons.keyboard_arrow_down_rounded,
                      size: 18,
                      color: scheme.onSurfaceVariant,
                    ),
                  ],
                ),
              ),
            ),
          ),

          // ── Delete mode bar ─────────────────────────────────────────────────
          if (_deleteMode)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 7),
              decoration: BoxDecoration(
                color: scheme.error.withValues(alpha: isDark ? 0.12 : 0.07),
                border: Border(
                  bottom: BorderSide(
                    color: scheme.error.withValues(alpha: isDark ? 0.22 : 0.15),
                  ),
                ),
              ),
              child: Row(
                children: [
                  Icon(
                    Icons.check_box_outline_blank_rounded,
                    size: 16,
                    color: scheme.error.withValues(alpha: 0.7),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    _selectedIds.isEmpty
                        ? LanguageController.instance.t('notifications.tapToSelect')
                        : (_selectedIds.length == 1
                            ? LanguageController.instance.t('notifications.selectedItemBar', {'count': '1'})
                            : LanguageController.instance.t('notifications.selectedItemsBar', {'count': _selectedIds.length.toString()})),
                    style: TextStyle(
                      color: scheme.onSurfaceVariant,
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),

          Expanded(
            child: _loading
                ? Center(
                    child: CircularProgressIndicator(color: scheme.primary),
                  )
                : _error != null
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 24),
                      child: Text(
                        _error!,
                        textAlign: TextAlign.center,
                        style: TextStyle(color: scheme.error, fontSize: 14),
                      ),
                    ),
                  )
                : items.isEmpty
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 24),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            Icons.notifications_none_rounded,
                            color: scheme.onSurfaceVariant,
                            size: 54,
                          ),
                          const SizedBox(height: 12),
                          Text(
                            'Nothing here yet',
                            style: TextStyle(
                              color: scheme.onSurface,
                              fontSize: 16,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          const SizedBox(height: 6),
                          Text(
                            'When you get notifications, they will appear here.',
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              color: scheme.onSurfaceVariant,
                              fontSize: 13,
                            ),
                          ),
                        ],
                      ),
                    ),
                  )
                : RefreshIndicator(
                    onRefresh: _deleteMode ? () async {} : _load,
                    color: scheme.primary,
                    child: ListView.separated(
                      padding: const EdgeInsets.fromLTRB(12, 6, 12, 18),
                      itemCount: items.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 8),
                      itemBuilder: (_, i) {
                        final item = items[i];
                        final isSelected = _selectedIds.contains(item.id);
                        final baseColor = isSelected
                            ? scheme.primary.withValues(
                                alpha: isDark ? 0.2 : 0.1,
                              )
                            : item.isUnread
                            ? (isDark
                                  ? const Color(0xFF142847)
                                  : scheme.primary.withValues(alpha: 0.1))
                            : (isDark ? tokens.panel : scheme.surface);
                        final isPressed = _pressedItemId == item.id;

                        return GestureDetector(
                          behavior: HitTestBehavior.opaque,
                          onTap: () => _onItemTap(item),
                          onLongPressStart: _deleteMode
                              ? null
                              : (_) {
                                  if (!mounted) return;
                                  setState(() => _pressedItemId = item.id);
                                },
                          onLongPressCancel: _deleteMode
                              ? null
                              : () {
                                  if (!mounted) return;
                                  if (_pressedItemId == item.id) {
                                    setState(() => _pressedItemId = null);
                                  }
                                },
                          onLongPress: _deleteMode
                              ? null
                              : () async {
                                  await _openItemMenu(item);
                                  if (!mounted) return;
                                  if (_pressedItemId == item.id) {
                                    setState(() => _pressedItemId = null);
                                  }
                                },
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 12,
                              vertical: 10,
                            ),
                            decoration: BoxDecoration(
                              color: isPressed
                                  ? Color.alphaBlend(
                                      Colors.black.withValues(alpha: 0.16),
                                      baseColor,
                                    )
                                  : baseColor,
                              borderRadius: BorderRadius.circular(14),
                              border: Border.all(
                                color: isSelected
                                    ? scheme.primary.withValues(
                                        alpha: isDark ? 0.55 : 0.35,
                                      )
                                    : item.isUnread
                                    ? scheme.primary.withValues(
                                        alpha: isDark ? 0.65 : 0.4,
                                      )
                                    : scheme.outline,
                              ),
                            ),
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                CircleAvatar(
                                  radius: 22,
                                  backgroundColor:
                                      scheme.surfaceContainerHighest,
                                  backgroundImage:
                                      item.actor.avatarUrl.isNotEmpty
                                      ? NetworkImage(item.actor.avatarUrl)
                                      : null,
                                  child: item.actor.avatarUrl.isEmpty
                                      ? Icon(
                                          _iconFor(item.type),
                                          color: scheme.onSurfaceVariant,
                                          size: 20,
                                        )
                                      : null,
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        _message(item),
                                        style: TextStyle(
                                          color: scheme.onSurface,
                                          fontSize: 13.5,
                                          fontWeight: item.isUnread
                                              ? FontWeight.w700
                                              : FontWeight.w600,
                                        ),
                                      ),
                                      const SizedBox(height: 6),
                                      Text(
                                        _relativeTime(item.activityAt),
                                        style: TextStyle(
                                          color: scheme.onSurfaceVariant,
                                          fontSize: 12,
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                if (_deleteMode)
                                  Padding(
                                    padding: const EdgeInsets.only(left: 8),
                                    child: SizedBox(
                                      width: 22,
                                      height: 44,
                                      child: Center(
                                        child: Container(
                                          width: 22,
                                          height: 22,
                                          decoration: BoxDecoration(
                                            shape: BoxShape.circle,
                                            color: isSelected
                                                ? scheme.primary
                                                : Colors.transparent,
                                            border: Border.all(
                                              color: isSelected
                                                  ? scheme.primary
                                                  : scheme.outline,
                                              width: 2,
                                            ),
                                          ),
                                          child: isSelected
                                              ? Icon(
                                                  Icons.check_rounded,
                                                  color: scheme.onPrimary,
                                                  size: 14,
                                                )
                                              : null,
                                        ),
                                      ),
                                    ),
                                  )
                                else
                                  SizedBox(
                                    width: 16,
                                    height: 44,
                                    child: item.isUnread
                                        ? Align(
                                            alignment: Alignment.centerRight,
                                            child: Container(
                                              width: 10,
                                              height: 10,
                                              decoration: BoxDecoration(
                                                color: scheme.primary,
                                                shape: BoxShape.circle,
                                              ),
                                            ),
                                          )
                                        : null,
                                  ),
                              ],
                            ),
                          ),
                        );
                      },
                    ),
                  ),
          ),
        ],
      ),
    );
  }
}
