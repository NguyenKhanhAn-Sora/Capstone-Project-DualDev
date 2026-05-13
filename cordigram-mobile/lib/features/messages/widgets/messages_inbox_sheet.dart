import 'dart:async';

import 'package:flutter/material.dart';

import '../models/inbox_models.dart';
import '../models/dm_message.dart';
import '../services/channel_messages_realtime_service.dart';
import '../services/channel_messages_service.dart';
import '../services/direct_messages_realtime_service.dart';
import '../services/direct_messages_service.dart';
import '../services/inbox_service.dart';
import '../services/servers_service.dart';
import 'server_join_flow.dart';

typedef InboxNavigateToChannel = Future<void> Function(
  String serverId,
  String channelId,
);
typedef InboxNavigateToDm = void Function(
  String userId,
  String displayName,
  String username,
  String? avatarUrl,
);
typedef InboxAcceptInvite = Future<void> Function(String serverId);

/// Full-screen modal aligned with web [MessagesInbox] + BE `/inbox/*`.
class MessagesInboxSheet extends StatefulWidget {
  const MessagesInboxSheet({
    super.key,
    required this.onNavigateToChannel,
    required this.onNavigateToDm,
    required this.onAcceptInvite,
    this.onMarkSeen,
    this.onClose,
  });

  final InboxNavigateToChannel onNavigateToChannel;
  final InboxNavigateToDm onNavigateToDm;
  final InboxAcceptInvite onAcceptInvite;
  final VoidCallback? onMarkSeen;
  final VoidCallback? onClose;

  static Future<void> show(
    BuildContext context, {
    required InboxNavigateToChannel onNavigateToChannel,
    required InboxNavigateToDm onNavigateToDm,
    required InboxAcceptInvite onAcceptInvite,
    VoidCallback? onMarkSeen,
  }) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => MessagesInboxSheet(
        onNavigateToChannel: onNavigateToChannel,
        onNavigateToDm: onNavigateToDm,
        onAcceptInvite: onAcceptInvite,
        onMarkSeen: onMarkSeen,
        onClose: () => Navigator.of(ctx).pop(),
      ),
    );
  }

  @override
  State<MessagesInboxSheet> createState() => _MessagesInboxSheetState();
}

enum _InboxTab { forYou, unread, mentions }

class _MessagesInboxSheetState extends State<MessagesInboxSheet> {
  static const Color _bg = Color(0xFF0C1B3A);
  static const Color _accent = Color(0xFF00C48C);

  _InboxTab _tab = _InboxTab.forYou;
  List<InboxForYouItem> _forYou = [];
  List<InboxUnreadItem> _unread = [];
  List<InboxMentionItem> _mentions = [];

  bool _loadingForYou = true;
  bool _loadingUnread = true;
  bool _loadingMentions = true;
  bool _markAllBusy = false;
  String? _loadError;

  StreamSubscription<Map<String, dynamic>>? _chNotifSub;
  StreamSubscription<DmMessage>? _dmMsgSub;
  Timer? _debounce;

  @override
  void initState() {
    super.initState();
    unawaited(_loadAll());
    _chNotifSub =
        ChannelMessagesRealtimeService.channelNotifications.listen(_onRealtime);
    _dmMsgSub = DirectMessagesRealtimeService.newMessages.listen((_) {
      _onRealtime(null);
    });
  }

  void _onRealtime(Map<String, dynamic>? data) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () {
      if (!mounted) return;
      unawaited(_refreshUnreadFromApi());
      if (data != null && data['isMention'] == true) {
        unawaited(_refreshMentionsFromApi());
      }
    });
  }

  Future<void> _loadAll() async {
    setState(() {
      _loadError = null;
      _loadingForYou = true;
      _loadingUnread = true;
      _loadingMentions = true;
    });
    try {
      final results = await Future.wait([
        InboxService.fetchForYou(),
        InboxService.fetchUnread(),
        InboxService.fetchMentions(),
      ]);
      if (!mounted) return;
      setState(() {
        _forYou = results[0] as List<InboxForYouItem>;
        _unread = results[1] as List<InboxUnreadItem>;
        _mentions = results[2] as List<InboxMentionItem>;
        _loadError = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loadError = e.toString();
        _forYou = const [];
        _unread = const [];
        _mentions = const [];
      });
    } finally {
      if (!mounted) return;
      setState(() {
        _loadingForYou = false;
        _loadingUnread = false;
        _loadingMentions = false;
      });
    }
  }

  Future<void> _refreshUnreadFromApi() async {
    try {
      final list = await InboxService.fetchUnread();
      if (!mounted) return;
      setState(() => _unread = list);
    } catch (_) {}
  }

  Future<void> _refreshMentionsFromApi() async {
    try {
      final list = await InboxService.fetchMentions();
      if (!mounted) return;
      setState(() {
        final map = {for (final m in _mentions) m.id: m};
        for (final m in list) {
          map[m.id] = m;
        }
        _mentions = map.values.toList();
      });
    } catch (_) {}
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _chNotifSub?.cancel();
    _dmMsgSub?.cancel();
    super.dispose();
  }

  String _serverLabel(String name) {
    final n = name.trim();
    return n.isEmpty ? 'Máy chủ' : n;
  }

  String _resolveNotifTitle(String raw) {
    if (raw == '__SYS:adminView') return 'Quản trị viên đang xem máy chủ';
    if (raw.startsWith('__SYS:adminViewContent:')) {
      final s = raw.substring('__SYS:adminViewContent:'.length);
      return 'Kiểm tra máy chủ "$s"';
    }
    if (raw == '__SYS:mentionSpamTitle') return 'Cảnh báo spam đề cập';
    if (raw.startsWith('__SYS:mentionSpamWarning:')) {
      final s = raw.substring('__SYS:mentionSpamWarning:'.length);
      return 'Spam đề cập trong "$s"';
    }
    if (raw == '__SYS:joinAppApprovedTitle') return 'Đơn đăng ký được chấp thuận';
    if (raw == '__SYS:joinAppApprovedContent') {
      return 'Bạn đã được chấp thuận tham gia máy chủ.';
    }
    if (raw == '__SYS:joinAppRejectedTitle') return 'Đơn đăng ký bị từ chối';
    if (raw == '__SYS:joinAppRejectedContent') {
      return 'Đơn đăng ký tham gia máy chủ đã bị từ chối.';
    }
    if (raw == '__SYS:serverDeletedTitle') return 'Máy chủ đã bị xóa';
    if (raw.startsWith('__SYS:serverDeletedContent:')) {
      try {
        final s = Uri.decodeComponent(raw.substring('__SYS:serverDeletedContent:'.length));
        return 'Máy chủ "$s" không còn.';
      } catch (_) {
        return raw;
      }
    }
    return raw;
  }

  String _timeAgo(String iso) {
    final d = DateTime.tryParse(iso);
    if (d == null) return '';
    final diff = DateTime.now().difference(d);
    if (diff.inMinutes < 60) return '${diff.inMinutes.clamp(0, 59)} phút';
    if (diff.inHours < 24) return '${diff.inHours} giờ';
    if (diff.inDays < 28) return '${diff.inDays} ngày';
    return '${d.day}/${d.month}';
  }

  Future<void> _markAllRead() async {
    if (_markAllBusy) return;
    setState(() => _markAllBusy = true);
    try {
      final futures = <Future<void>>[];
      for (final item in _forYou) {
        if (item is InboxEventItem && item.seen != true) {
          futures.add(InboxService.markSeen(sourceType: 'event', sourceId: item.id));
        } else if (item is InboxServerInviteItem && item.seen != true) {
          futures.add(
            InboxService.markSeen(sourceType: 'server_invite', sourceId: item.id),
          );
        } else if (item is InboxServerNotificationItem && item.seen != true) {
          futures.add(
            InboxService.markSeen(
              sourceType: 'server_notification',
              sourceId: item.id,
            ),
          );
        }
      }
      for (final m in _mentions) {
        futures.add(
          InboxService.markSeen(sourceType: 'channel_mention', sourceId: m.id),
        );
      }
      for (final u in _unread) {
        if (u is InboxUnreadDmItem) {
          futures.add(DirectMessagesService.markConversationRead(u.userId));
        } else if (u is InboxUnreadChannelItem) {
          futures.add(ChannelMessagesService.markChannelRead(u.channelId));
        }
      }
      await Future.wait<void>(
        futures.map(
          (f) => f.catchError((Object _, StackTrace __) {}),
        ),
      );
      await _loadAll();
      widget.onMarkSeen?.call();
    } finally {
      if (mounted) setState(() => _markAllBusy = false);
    }
  }

  String _letter(String s) {
    final t = s.trim();
    if (t.isEmpty) return '?';
    return t.substring(0, 1).toUpperCase();
  }

  Future<void> _onForYouTap(InboxForYouItem item) async {
    if (item is InboxServerInviteItem) return;
    if (item is InboxEventItem) {
      try {
        await InboxService.markSeen(sourceType: 'event', sourceId: item.id);
      } catch (_) {}
      widget.onMarkSeen?.call();
      widget.onClose?.call();
      await widget.onNavigateToChannel(item.serverId, '');
    } else if (item is InboxServerNotificationItem) {
      try {
        await InboxService.markSeen(
          sourceType: 'server_notification',
          sourceId: item.id,
        );
      } catch (_) {}
      widget.onMarkSeen?.call();
      widget.onClose?.call();
      await widget.onNavigateToChannel(item.serverId, '');
    }
  }

  Future<void> _acceptInvite(InboxServerInviteItem item) async {
    try {
      if (!mounted) return;
      final ok = await ServerJoinFlow.joinFromInvite(
        context,
        serverId: item.serverId,
        inboxInviteIdToAcceptAfterJoin: item.id,
        presentationServerName: item.serverName,
        presentationAvatarUrl: item.serverAvatarUrl,
        onOpenServerInApp: (sid, {channelId}) => widget.onAcceptInvite(sid),
      );
      if (!ok || !mounted) return;
      try {
        await InboxService.markSeen(sourceType: 'server_invite', sourceId: item.id);
      } catch (_) {}
      if (!mounted) return;
      setState(() => _forYou.removeWhere((e) => e is InboxServerInviteItem && (e).id == item.id));
      widget.onMarkSeen?.call();
      widget.onClose?.call();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Không chấp nhận được: $e')),
      );
    }
  }

  Future<void> _declineInvite(InboxServerInviteItem item) async {
    try {
      await ServersService.declineServerInvite(item.id);
      await InboxService.markSeen(sourceType: 'server_invite', sourceId: item.id);
      if (!mounted) return;
      setState(() => _forYou.removeWhere((e) => e is InboxServerInviteItem && (e).id == item.id));
      widget.onMarkSeen?.call();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Không từ chối được: $e')),
      );
    }
  }

  Future<void> _onMentionTap(InboxMentionItem item) async {
    try {
      await InboxService.markSeen(
        sourceType: 'channel_mention',
        sourceId: item.messageId.isNotEmpty ? item.messageId : item.id,
      );
    } catch (_) {}
    if (!mounted) return;
    setState(() => _mentions.removeWhere((m) => m.id == item.id));
    widget.onMarkSeen?.call();
    widget.onClose?.call();
    await widget.onNavigateToChannel(item.serverId, item.channelId);
  }

  @override
  Widget build(BuildContext context) {
    final screenH = MediaQuery.sizeOf(context).height;
    final h = (screenH > 0 ? screenH * 0.88 : 560.0).clamp(320.0, 920.0);
    final dark = ThemeData(
      brightness: Brightness.dark,
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(
        seedColor: _accent,
        brightness: Brightness.dark,
      ),
      scaffoldBackgroundColor: _bg,
      listTileTheme: const ListTileThemeData(
        textColor: Color(0xFFE8F5E0),
        iconColor: Color(0xFFE8F5E0),
        titleTextStyle: TextStyle(
          color: Color(0xFFE8F5E0),
          fontSize: 16,
          fontWeight: FontWeight.w600,
        ),
        subtitleTextStyle: TextStyle(
          color: Color(0xFF8EA3CC),
          fontSize: 13,
        ),
      ),
    );
    return Theme(
      data: dark,
      child: Align(
        alignment: Alignment.bottomCenter,
        child: Material(
          color: _bg,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
          child: SizedBox(
            height: h,
            child: Column(
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(12, 10, 8, 8),
                  child: Row(
                    children: [
                      const Icon(Icons.mail_outline_rounded, color: Colors.white, size: 22),
                      const SizedBox(width: 8),
                      const Expanded(
                        child: Text(
                          'Hộp thư',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 18,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                      TextButton(
                        onPressed: _markAllBusy ? null : _markAllRead,
                        child: Text(
                          _markAllBusy ? '…' : 'Đọc hết',
                          style: const TextStyle(color: _accent, fontWeight: FontWeight.w600),
                        ),
                      ),
                      IconButton(
                        onPressed: widget.onClose ?? () => Navigator.of(context).pop(),
                        icon: const Icon(Icons.close_rounded, color: Colors.white70),
                      ),
                    ],
                  ),
                ),
                Row(
                  children: [
                    _tabBtn('Dành cho bạn', _InboxTab.forYou),
                    _tabBtn('Chưa đọc', _InboxTab.unread),
                    _tabBtn('Đề cập', _InboxTab.mentions),
                  ],
                ),
                const Divider(height: 1, color: Color(0xFF21345D)),
                if (_loadError != null)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text(
                          'Không tải được hộp thư:\n$_loadError',
                          style: const TextStyle(color: Color(0xFFFF8A8A), fontSize: 12),
                        ),
                        TextButton(
                          onPressed: _loadAll,
                          child: const Text('Thử lại'),
                        ),
                      ],
                    ),
                  ),
                Expanded(child: _buildList()),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _tabBtn(String label, _InboxTab t) {
    final on = _tab == t;
    return Expanded(
      child: InkWell(
        onTap: () {
          setState(() => _tab = t);
          if (t == _InboxTab.mentions) {
            unawaited(_refreshMentionsFromApi());
          }
        },
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 12),
          decoration: BoxDecoration(
            border: Border(
              bottom: BorderSide(
                color: on ? _accent : Colors.transparent,
                width: 2,
              ),
            ),
          ),
          child: Text(
            label,
            textAlign: TextAlign.center,
            style: TextStyle(
              color: on ? Colors.white : const Color(0xFF8EA3CC),
              fontWeight: on ? FontWeight.w700 : FontWeight.w500,
              fontSize: 13,
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildList() {
    if (_loadError != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(
            'Nhấn "Thử lại" phía trên sau khi kiểm tra mạng và đăng nhập.',
            textAlign: TextAlign.center,
            style: TextStyle(color: Colors.white.withOpacity(0.72)),
          ),
        ),
      );
    }
    switch (_tab) {
      case _InboxTab.forYou:
        if (_loadingForYou) {
          return const Center(child: CircularProgressIndicator());
        }
        if (_forYou.isEmpty) {
          return const Center(
            child: Text('Không có mục nào', style: TextStyle(color: Color(0xFF8EA3CC))),
          );
        }
        return ListView.builder(
          padding: const EdgeInsets.only(bottom: 24),
          itemCount: _forYou.length,
          itemBuilder: (_, i) => _forYouTile(_forYou[i]),
        );
      case _InboxTab.unread:
        if (_loadingUnread) {
          return const Center(child: CircularProgressIndicator());
        }
        if (_unread.isEmpty) {
          return const Center(
            child: Text('Không có tin chưa đọc', style: TextStyle(color: Color(0xFF8EA3CC))),
          );
        }
        return ListView.builder(
          padding: const EdgeInsets.only(bottom: 24),
          itemCount: _unread.length,
          itemBuilder: (_, i) => _unreadTile(_unread[i]),
        );
      case _InboxTab.mentions:
        if (_loadingMentions) {
          return const Center(child: CircularProgressIndicator());
        }
        if (_mentions.isEmpty) {
          return const Center(
            child: Text('Không có đề cập', style: TextStyle(color: Color(0xFF8EA3CC))),
          );
        }
        return ListView.builder(
          padding: const EdgeInsets.only(bottom: 24),
          itemCount: _mentions.length,
          itemBuilder: (_, i) => _mentionTile(_mentions[i]),
        );
    }
  }

  Widget _forYouTile(InboxForYouItem item) {
    if (item is InboxUnknownForYouItem) {
      final r = item.raw;
      final hint = (r['type'] ?? r['Type'] ?? '?').toString();
      return ListTile(
        leading: const Icon(Icons.help_outline_rounded, color: Color(0xFFFFC107)),
        title: Text(
          'Mục hộp thư ($hint)',
          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
        ),
        subtitle: Text(
          '${r['title'] ?? r['topic'] ?? ''}'.trim().isNotEmpty
              ? '${r['title'] ?? r['topic']}'
              : 'Không nhận dạng được loại — kiểm tra phiên bản app/BE.',
          style: const TextStyle(color: Color(0xFF8EA3CC), fontSize: 12),
        ),
      );
    }
    if (item is InboxServerInviteItem) {
      return ListTile(
        leading: _avatar(
          url: item.serverAvatarUrl,
          letter: _letter(_serverLabel(item.serverName)),
          dot: item.seen != true,
        ),
        title: Text(
          'Lời mời vào ${_serverLabel(item.serverName)}',
          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
        ),
        subtitle: Text(
          'Từ ${item.inviterDisplay} · ${_timeAgo(item.createdAt)}',
          style: const TextStyle(color: Color(0xFF8EA3CC), fontSize: 12),
        ),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            IconButton(
              onPressed: () => _acceptInvite(item),
              icon: const Icon(Icons.check_circle_outline, color: _accent),
            ),
            IconButton(
              onPressed: () => _declineInvite(item),
              icon: const Icon(Icons.close_rounded, color: Color(0xFFFF6B7A)),
            ),
          ],
        ),
      );
    }
    if (item is InboxEventItem) {
      return ListTile(
        onTap: () => _onForYouTap(item),
        leading: _avatar(
          url: item.serverAvatarUrl,
          letter: _letter(_serverLabel(item.serverName)),
          dot: item.seen != true,
        ),
        title: Text(
          item.topic ?? 'Sự kiện',
          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
        ),
        subtitle: Text(
          '${_serverLabel(item.serverName)} · ${_timeAgo(item.startAt)}',
          style: const TextStyle(color: Color(0xFF8EA3CC), fontSize: 12),
        ),
      );
    }
    if (item is InboxServerNotificationItem) {
      return ListTile(
        onTap: () => _onForYouTap(item),
        leading: _avatar(
          url: item.serverAvatarUrl,
          letter: _letter(_serverLabel(item.serverName)),
          dot: item.seen != true,
        ),
        title: Text(
          _resolveNotifTitle(item.title),
          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
        ),
        subtitle: Text(
          '${_resolveNotifTitle(item.content)}\n${_timeAgo(item.createdAt)}',
          style: const TextStyle(color: Color(0xFF8EA3CC), fontSize: 12),
        ),
      );
    }
    return const SizedBox.shrink();
  }

  Widget _unreadTile(InboxUnreadItem u) {
    if (u is InboxUnreadDmItem) {
      return ListTile(
        onTap: () {
          widget.onClose?.call();
          widget.onNavigateToDm(u.userId, u.displayName, u.username, null);
        },
        leading: _avatar(
          letter: _letter(u.displayName.isNotEmpty ? u.displayName : u.username),
          dot: u.unreadCount > 0,
        ),
        title: Text(
          u.displayName.isNotEmpty ? u.displayName : u.username,
          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
        ),
        subtitle: Text(
          u.lastMessage.isNotEmpty ? u.lastMessage : 'Tin nhắn mới',
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(color: Color(0xFF8EA3CC), fontSize: 12),
        ),
        trailing: Text(
          _timeAgo(u.lastMessageAt),
          style: const TextStyle(color: Color(0xFF8EA3CC), fontSize: 11),
        ),
      );
    }
    if (u is InboxUnreadChannelItem) {
      return ListTile(
        onTap: () {
          widget.onClose?.call();
          unawaited(widget.onNavigateToChannel(u.serverId, u.channelId));
        },
        leading: _avatar(
          letter: _letter(_serverLabel(u.serverName)),
          dot: (u.unreadCount ?? 0) > 0,
        ),
        title: Text(
          '${_serverLabel(u.serverName)} · #${u.channelName}',
          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
        ),
        subtitle: Text(
          u.lastMessage.isNotEmpty ? u.lastMessage : 'Tin nhắn mới',
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(color: Color(0xFF8EA3CC), fontSize: 12),
        ),
        trailing: Text(
          _timeAgo(u.lastMessageAt),
          style: const TextStyle(color: Color(0xFF8EA3CC), fontSize: 11),
        ),
      );
    }
    return const SizedBox.shrink();
  }

  Widget _mentionTile(InboxMentionItem m) {
    return ListTile(
      onTap: () => _onMentionTap(m),
      leading: _avatar(
        letter: _letter(_serverLabel(m.serverName)),
        dot: m.seen != true,
      ),
      title: Text(
        '${_serverLabel(m.serverName)} · #${m.channelName}',
        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
      ),
      subtitle: Text(
        '${m.actorName} đã nhắc tới bạn'
            '${(m.excerpt ?? '').trim().isNotEmpty ? ' — ${m.excerpt!.trim()}' : ''}',
        maxLines: 3,
        overflow: TextOverflow.ellipsis,
        style: const TextStyle(color: Color(0xFF8EA3CC), fontSize: 12),
      ),
      trailing: Text(
        _timeAgo(m.createdAt),
        style: const TextStyle(color: Color(0xFF8EA3CC), fontSize: 11),
      ),
    );
  }

  Widget _avatar({String? url, required String letter, bool dot = false}) {
    return Stack(
      clipBehavior: Clip.none,
      children: [
        CircleAvatar(
          radius: 22,
          backgroundColor: const Color(0xFF1B2A4A),
          backgroundImage: (url != null && url.isNotEmpty) ? NetworkImage(url) : null,
          child: (url == null || url.isEmpty)
              ? Text(
                  letter.toUpperCase(),
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w800,
                  ),
                )
              : null,
        ),
        if (dot)
          const Positioned(
            right: -1,
            top: -1,
            child: CircleAvatar(radius: 5, backgroundColor: Color(0xFFFF2A45)),
          ),
      ],
    );
  }
}
