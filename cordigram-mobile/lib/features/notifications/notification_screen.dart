import 'package:flutter/material.dart';

import '../../core/services/api_service.dart';
import 'models/app_notification_item.dart';
import 'services/notification_service.dart';

enum _NotificationTab { all, like, comment, mentions, follow }

class NotificationScreen extends StatefulWidget {
  const NotificationScreen({super.key});

  @override
  State<NotificationScreen> createState() => _NotificationScreenState();
}

class _NotificationScreenState extends State<NotificationScreen> {
  List<AppNotificationItem> _items = const [];
  bool _loading = true;
  String? _error;
  _NotificationTab _activeTab = _NotificationTab.all;

  @override
  void initState() {
    super.initState();
    _load();
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
                        return Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 10,
                          ),
                          decoration: BoxDecoration(
                            color: item.isUnread
                                ? const Color(0xFF142847)
                                : const Color(0xFF111827),
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
                                backgroundImage: item.actor.avatarUrl.isNotEmpty
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
                                  crossAxisAlignment: CrossAxisAlignment.start,
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
                              if (item.isUnread)
                                Container(
                                  width: 10,
                                  height: 10,
                                  margin: const EdgeInsets.only(top: 6),
                                  decoration: const BoxDecoration(
                                    color: Color(0xFF4AA3E4),
                                    shape: BoxShape.circle,
                                  ),
                                ),
                            ],
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
