import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'dart:async';

import '../../core/services/api_service.dart';
import 'models/app_notification_item.dart';
import 'services/notification_realtime_service.dart';
import 'services/notification_service.dart';

enum _NotificationTab { all, like, comment, mentions, follow, system }

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

  @override
  void initState() {
    super.initState();
    _load();
    _startNotificationRealtime();
  }

  @override
  void dispose() {
    _notificationRtSub?.cancel();
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
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final items = await NotificationService.fetchNotifications();
      if (!mounted) return;
      setState(() => _items = items);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.message);
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = 'Unable to load notifications.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
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
    final dt = DateTime.tryParse(value)?.toLocal();
    if (dt == null) return '';
    final diff = DateTime.now().difference(dt);
    if (diff.inSeconds < 60) return 'Just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes} min';
    if (diff.inHours < 24) return '${diff.inHours} hours';
    if (diff.inDays < 7) return '${diff.inDays} days';
    final weeks = (diff.inDays / 7).floor();
    if (weeks < 5) return '$weeks weeks';
    final months = (diff.inDays / 30).floor();
    if (months < 12) return '$months months';
    final years = (diff.inDays / 365).floor();
    return '$years years';
  }

  String _displayName(NotificationActor actor) {
    if (actor.username.trim().isNotEmpty) return '@${actor.username.trim()}';
    if (actor.displayName.trim().isNotEmpty) return actor.displayName.trim();
    return 'Someone';
  }

  String _message(AppNotificationItem item) {
    final name = _displayName(item.actor);
    if (item.type == 'post_like') {
      final n = (item.likeCount - 1).clamp(0, 999);
      final target = item.postKind == 'reel' ? 'reel' : 'post';
      return n > 0
          ? '$name and $n others liked your $target'
          : '$name liked your $target';
    }
    if (item.type == 'post_comment') {
      final n = (item.commentCount - 1).clamp(0, 999);
      final target = item.postKind == 'reel' ? 'reel' : 'post';
      return n > 0
          ? '$name and $n others commented on your $target'
          : '$name commented on your $target';
    }
    if (item.type == 'comment_like') {
      final n = (item.likeCount - 1).clamp(0, 999);
      return n > 0
          ? '$name and $n others liked your comment'
          : '$name liked your comment';
    }
    if (item.type == 'comment_reply') {
      final n = (item.commentCount - 1).clamp(0, 999);
      return n > 0
          ? '$name and $n others replied to your comment'
          : '$name replied to your comment';
    }
    if (item.type == 'post_mention') {
      final source = item.mentionSource == 'comment' ? 'comment' : 'post';
      return '$name mentioned you in a $source';
    }
    if (item.type == 'follow') {
      return '$name followed you';
    }
    if (item.type == 'login_alert') {
      return "You're signing in on a new device";
    }
    if (item.type == 'post_moderation') {
      final target = item.postKind == 'reel' ? 'reel' : 'post';
      if (item.moderationDecision == 'reject') {
        return 'Your $target was rejected. Please check Violation Center.';
      }
      return 'Your $target was published successfully.';
    }
    if (item.type == 'report') {
      if (item.reportAudience == 'offender') {
        return 'Action was taken on your content. Check Violation Center for details.';
      }
      return item.reportOutcome == 'action_taken'
          ? 'Thanks for your report. We reviewed and took action.'
          : 'Thanks for your report. We reviewed and found no violation.';
    }
    if (item.type == 'system_notice') {
      final title = item.systemNoticeTitle?.trim() ?? '';
      final body = item.systemNoticeBody?.trim() ?? '';
      if (title.isEmpty) return body.isEmpty ? 'System notice' : body;
      return body.isEmpty ? title : '$title: $body';
    }
    return 'New notification';
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

  Widget _buildTab({required _NotificationTab tab, required String label}) {
    final active = _activeTab == tab;
    return GestureDetector(
      onTap: () => setState(() => _activeTab = tab),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(999),
          border: Border.all(
            color: active ? const Color(0xFF5E86C2) : const Color(0xFF2A3A5C),
          ),
          color: active ? const Color(0xFF173154) : Colors.transparent,
        ),
        child: Text(
          label,
          style: TextStyle(
            color: active ? const Color(0xFFE8ECF8) : const Color(0xFF9BAECF),
            fontSize: 12,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
    );
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
    // Show mute unless backend explicitly marks this item as not the owner's.
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
      backgroundColor: const Color(0xFF0F172A),
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
                  color: Colors.white.withValues(alpha: 0.2),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                child: Row(
                  children: [
                    TextButton(
                      onPressed: () => Navigator.of(context).pop(),
                      child: const Text('Cancel'),
                    ),
                    const Spacer(),
                    const Text(
                      'Select time',
                      style: TextStyle(
                        color: Color(0xFFE8ECF8),
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const Spacer(),
                    TextButton(
                      onPressed: () => Navigator.of(context).pop(draft),
                      child: const Text('Done'),
                    ),
                  ],
                ),
              ),
              const Divider(height: 1, color: Color(0xFF1E2D48)),
              Expanded(
                child: CupertinoTheme(
                  data: const CupertinoThemeData(brightness: Brightness.dark),
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
      _showSnack('Unable to update notification.', error: true);
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
      _showSnack('Unable to delete notification.', error: true);
    }
  }

  Future<void> _openMuteOverlay(AppNotificationItem item) async {
    if (item.postId == null) return;

    const options = <Map<String, dynamic>>[
      {'key': '5m', 'label': '5 minutes', 'ms': 5 * 60 * 1000},
      {'key': '10m', 'label': '10 minutes', 'ms': 10 * 60 * 1000},
      {'key': '15m', 'label': '15 minutes', 'ms': 15 * 60 * 1000},
      {'key': '30m', 'label': '30 minutes', 'ms': 30 * 60 * 1000},
      {'key': '1h', 'label': '1 hour', 'ms': 60 * 60 * 1000},
      {'key': '1d', 'label': '1 day', 'ms': 24 * 60 * 60 * 1000},
      {'key': 'until', 'label': 'Until I turn it back on', 'ms': null},
      {'key': 'custom', 'label': 'Choose date & time', 'ms': null},
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
              backgroundColor: const Color(0xFF0E1730),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(18),
              ),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Mute notifications',
                                style: TextStyle(
                                  color: Color(0xFFE8ECF8),
                                  fontSize: 20,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                              SizedBox(height: 6),
                              Text(
                                'Choose how long to pause alerts for this post.',
                                style: TextStyle(
                                  color: Color(0xFF9BAECF),
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
                          icon: const Icon(
                            Icons.close_rounded,
                            color: Color(0xFFD0D8EE),
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
                                      ? const Color(0xFF5E86C2)
                                      : const Color(0xFF233B63),
                                ),
                                color: active
                                    ? const Color(0xFF1B3558)
                                    : Colors.transparent,
                              ),
                              child: Text(
                                opt['label'] as String,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  color: active
                                      ? const Color(0xFFE8ECF8)
                                      : const Color(0xFF9BAECF),
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
                                customDate.isEmpty ? 'Select date' : customDate,
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
                                customTime.isEmpty ? 'Select time' : customTime,
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
                        style: const TextStyle(
                          color: Color(0xFFF87171),
                          fontSize: 13,
                        ),
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
                          child: const Text('Cancel'),
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
                                          error =
                                              'Please select a valid date and time.';
                                        });
                                        return;
                                      }
                                      final dt = DateTime.parse(iso);
                                      if (!dt.isAfter(DateTime.now().toUtc())) {
                                        setModalState(() {
                                          saving = false;
                                          error =
                                              'Please choose a future time.';
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

                                    if (ctx.mounted)
                                      Navigator.of(dialogCtx).pop();
                                  } catch (e) {
                                    setModalState(() {
                                      saving = false;
                                      error = e is ApiException
                                          ? e.message
                                          : 'Failed to update notifications';
                                    });
                                  }
                                },
                          child: Text(saving ? 'Saving...' : 'Save'),
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

  Future<void> _openItemMenu(AppNotificationItem item) async {
    final action = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: const Color(0xFF101D35),
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
                color: Colors.white.withValues(alpha: 0.22),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(height: 8),
            ListTile(
              leading: Icon(
                item.isUnread
                    ? Icons.mark_email_read_outlined
                    : Icons.mark_email_unread_outlined,
                color: const Color(0xFF9BAECF),
              ),
              title: Text(
                item.isUnread ? 'Mark as read' : 'Mark as unread',
                style: const TextStyle(color: Color(0xFFD0D8EE)),
              ),
              onTap: () => Navigator.pop(context, 'toggle-read'),
            ),
            if (_canMuteItem(item))
              ListTile(
                leading: const Icon(
                  Icons.notifications_off_outlined,
                  color: Color(0xFF9BAECF),
                ),
                title: Text(
                  item.postKind == 'reel' ? 'Mute this reel' : 'Mute this post',
                  style: const TextStyle(color: Color(0xFFD0D8EE)),
                ),
                onTap: () => Navigator.pop(context, 'mute'),
              ),
            ListTile(
              leading: const Icon(
                Icons.delete_outline_rounded,
                color: Color(0xFFF87171),
              ),
              title: const Text(
                'Delete notification',
                style: TextStyle(color: Color(0xFFF87171)),
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

  @override
  Widget build(BuildContext context) {
    final items = _filtered;

    return Scaffold(
      backgroundColor: const Color(0xFF0B1020),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0D1526),
        elevation: 0,
        iconTheme: const IconThemeData(color: Color(0xFFE8ECF8)),
        title: const Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Notifications',
              style: TextStyle(
                color: Color(0xFFE8ECF8),
                fontSize: 18,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            onPressed: _load,
            icon: const Icon(Icons.refresh_rounded, color: Color(0xFF9BAECF)),
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 8),
            child: Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                _buildTab(tab: _NotificationTab.all, label: 'All activity'),
                _buildTab(tab: _NotificationTab.like, label: 'Likes'),
                _buildTab(tab: _NotificationTab.comment, label: 'Comments'),
                _buildTab(tab: _NotificationTab.mentions, label: 'Mentions'),
                _buildTab(tab: _NotificationTab.follow, label: 'Followers'),
                _buildTab(tab: _NotificationTab.system, label: 'System'),
              ],
            ),
          ),
          Expanded(
            child: _loading
                ? const Center(
                    child: CircularProgressIndicator(color: Color(0xFF4AA3E4)),
                  )
                : _error != null
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 24),
                      child: Text(
                        _error!,
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          color: Color(0xFFF87171),
                          fontSize: 14,
                        ),
                      ),
                    ),
                  )
                : items.isEmpty
                ? const Center(
                    child: Padding(
                      padding: EdgeInsets.symmetric(horizontal: 24),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            Icons.notifications_none_rounded,
                            color: Color(0xFF7A8BB0),
                            size: 54,
                          ),
                          SizedBox(height: 12),
                          Text(
                            'Nothing here yet',
                            style: TextStyle(
                              color: Color(0xFFE8ECF8),
                              fontSize: 16,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          SizedBox(height: 6),
                          Text(
                            'When you get notifications, they will appear here.',
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              color: Color(0xFF7A8BB0),
                              fontSize: 13,
                            ),
                          ),
                        ],
                      ),
                    ),
                  )
                : RefreshIndicator(
                    onRefresh: _load,
                    color: const Color(0xFF4AA3E4),
                    child: ListView.separated(
                      padding: const EdgeInsets.fromLTRB(12, 6, 12, 18),
                      itemCount: items.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 8),
                      itemBuilder: (_, i) {
                        final item = items[i];
                        final baseColor = item.isUnread
                            ? const Color(0xFF142847)
                            : const Color(0xFF111827);
                        final isPressed = _pressedItemId == item.id;

                        return GestureDetector(
                          behavior: HitTestBehavior.opaque,
                          onLongPressStart: (_) {
                            if (!mounted) return;
                            setState(() => _pressedItemId = item.id);
                          },
                          onLongPressCancel: () {
                            if (!mounted) return;
                            if (_pressedItemId == item.id) {
                              setState(() => _pressedItemId = null);
                            }
                          },
                          onLongPress: () async {
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
                                color: item.isUnread
                                    ? const Color(0xFF2E5384)
                                    : const Color(0xFF1E2D48),
                              ),
                            ),
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                CircleAvatar(
                                  radius: 22,
                                  backgroundColor: const Color(0xFF233050),
                                  backgroundImage:
                                      item.actor.avatarUrl.isNotEmpty
                                      ? NetworkImage(item.actor.avatarUrl)
                                      : null,
                                  child: item.actor.avatarUrl.isEmpty
                                      ? Icon(
                                          _iconFor(item.type),
                                          color: const Color(0xFF9BAECF),
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
                                          color: const Color(0xFFD0D8EE),
                                          fontSize: 13.5,
                                          fontWeight: item.isUnread
                                              ? FontWeight.w700
                                              : FontWeight.w600,
                                        ),
                                      ),
                                      const SizedBox(height: 6),
                                      Text(
                                        _relativeTime(item.activityAt),
                                        style: const TextStyle(
                                          color: Color(0xFF7A8BB0),
                                          fontSize: 12,
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                SizedBox(
                                  width: 16,
                                  height: 44,
                                  child: item.isUnread
                                      ? Align(
                                          alignment: Alignment.centerRight,
                                          child: Container(
                                            width: 10,
                                            height: 10,
                                            decoration: const BoxDecoration(
                                              color: Color(0xFF4AA3E4),
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
