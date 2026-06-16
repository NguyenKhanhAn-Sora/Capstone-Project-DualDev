import 'dart:async';

import 'package:flutter/material.dart';

import '../../../core/services/language_controller.dart';
import '../models/inbox_models.dart';
import '../models/dm_message.dart';
import '../services/channel_messages_realtime_service.dart';
import '../services/channel_messages_service.dart';
import '../services/direct_messages_realtime_service.dart';
import '../services/direct_messages_service.dart';
import '../services/inbox_service.dart';
import '../services/servers_service.dart';
import '../../../core/theme/messages_chrome_palette.dart';
import 'messages_chrome_builder.dart';
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
  _InboxTab _tab = _InboxTab.forYou;

  String _t(String key, [Map<String, dynamic>? vars]) =>
      LanguageController.instance.t(key, vars);
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
      if (mounted) {
        setState(() {
          _loadingForYou = false;
          _loadingUnread = false;
          _loadingMentions = false;
        });
      }
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
    return n.isEmpty ? _t('chat.popups.inbox.serverFallback') : n;
  }

  String _resolveNotifTitle(String raw) {
    if (raw == '__SYS:adminView') {
      return _t('chat.popups.inbox.adminViewTitle');
    }
    if (raw.startsWith('__SYS:adminViewContent:')) {
      final s = raw.substring('__SYS:adminViewContent:'.length);
      return _t('chat.popups.inbox.adminViewContent', {'server': s});
    }
    if (raw == '__SYS:mentionSpamTitle') {
      return _t('chat.popups.inbox.mentionSpamTitle');
    }
    if (raw.startsWith('__SYS:mentionSpamWarning:')) {
      final s = raw.substring('__SYS:mentionSpamWarning:'.length);
      return _t('chat.popups.inbox.mentionSpamWarning', {'server': s});
    }
    if (raw == '__SYS:joinAppApprovedTitle') {
      return _t('chat.popups.inbox.joinAppApprovedTitle');
    }
    if (raw == '__SYS:joinAppApprovedContent') {
      return _t('chat.popups.inbox.joinAppApprovedContent');
    }
    if (raw == '__SYS:joinAppRejectedTitle') {
      return _t('chat.popups.inbox.joinAppRejectedTitle');
    }
    if (raw == '__SYS:joinAppRejectedContent') {
      return _t('chat.popups.inbox.joinAppRejectedContent');
    }
    if (raw == '__SYS:serverDeletedTitle') {
      return _t('chat.popups.inbox.serverDeletedTitle');
    }
    if (raw.startsWith('__SYS:serverDeletedContent:')) {
      try {
        final s = Uri.decodeComponent(
          raw.substring('__SYS:serverDeletedContent:'.length),
        );
        return _t('chat.popups.inbox.serverDeletedContent', {'server': s});
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
    if (diff.inMinutes < 60) {
      return _t('chat.popups.inbox.timeMinutes', {
        'n': '${diff.inMinutes.clamp(0, 59)}',
      });
    }
    if (diff.inHours < 24) {
      return _t('chat.popups.inbox.timeHours', {'n': '${diff.inHours}'});
    }
    if (diff.inDays < 28) {
      return _t('chat.popups.inbox.timeDays', {'n': '${diff.inDays}'});
    }
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
        SnackBar(content: Text('${_t('common.tryAgain')}: $e')),
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
        SnackBar(content: Text('${_t('common.tryAgain')}: $e')),
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
    return MessagesChromeBuilder(
      builder: (context, chrome) => Align(
        alignment: Alignment.bottomCenter,
        child: Material(
          color: chrome.bg,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
          child: SizedBox(
            height: h,
            child: Column(
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(12, 10, 8, 8),
                  child: Row(
                    children: [
                      Icon(
                        Icons.mail_outline_rounded,
                        color: chrome.text,
                        size: 22,
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          _t('chat.popups.inbox.title'),
                          style: TextStyle(
                            color: chrome.text,
                            fontSize: 18,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                      TextButton(
                        onPressed: _markAllBusy ? null : _markAllRead,
                        child: Text(
                          _markAllBusy
                              ? _t('chat.popups.inbox.markAllDoing')
                              : _t('chat.popups.inbox.markAll'),
                          style: TextStyle(
                            color: chrome.accent,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                      IconButton(
                        onPressed:
                            widget.onClose ?? () => Navigator.of(context).pop(),
                        icon: Icon(Icons.close_rounded, color: chrome.textMuted),
                      ),
                    ],
                  ),
                ),
                Row(
                  children: [
                    _tabBtn(chrome, _t('chat.popups.inbox.tabForYou'), _InboxTab.forYou),
                    _tabBtn(chrome, _t('chat.popups.inbox.tabUnread'), _InboxTab.unread),
                    _tabBtn(
                      chrome,
                      _t('chat.popups.inbox.tabMentions'),
                      _InboxTab.mentions,
                    ),
                  ],
                ),
                Divider(height: 1, color: chrome.border),
                if (_loadError != null)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text(
                          '${_t('chat.popups.inbox.loadError')}\n$_loadError',
                          style: TextStyle(
                            color: const Color(0xFFFF8A8A),
                            fontSize: 12,
                          ),
                        ),
                        TextButton(
                          onPressed: _loadAll,
                          child: Text(
                            _t('common.tryAgain'),
                            style: TextStyle(color: chrome.accent),
                          ),
                        ),
                      ],
                    ),
                  ),
                Expanded(child: _buildList(chrome)),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _tabBtn(MessagesChromePalette chrome, String label, _InboxTab t) {
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
                color: on ? chrome.accent : Colors.transparent,
                width: 2,
              ),
            ),
          ),
          child: Text(
            label,
            textAlign: TextAlign.center,
            style: TextStyle(
              color: on ? chrome.text : chrome.textMuted,
              fontWeight: on ? FontWeight.w700 : FontWeight.w500,
              fontSize: 13,
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildList(MessagesChromePalette chrome) {
    if (_loadError != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(
            _t('chat.popups.inbox.loadError'),
            textAlign: TextAlign.center,
            style: TextStyle(color: chrome.textMuted),
          ),
        ),
      );
    }
    switch (_tab) {
      case _InboxTab.forYou:
        if (_loadingForYou) {
          return Center(child: CircularProgressIndicator(color: chrome.accent));
        }
        if (_forYou.isEmpty) {
          return Center(
            child: Text(
              _t('chat.popups.inbox.emptyForYou'),
              textAlign: TextAlign.center,
              style: TextStyle(color: chrome.textMuted),
            ),
          );
        }
        return ListView.builder(
          padding: const EdgeInsets.only(bottom: 24),
          itemCount: _forYou.length,
          itemBuilder: (_, i) => _forYouTile(chrome, _forYou[i]),
        );
      case _InboxTab.unread:
        if (_loadingUnread) {
          return Center(child: CircularProgressIndicator(color: chrome.accent));
        }
        if (_unread.isEmpty) {
          return Center(
            child: Text(
              _t('chat.popups.inbox.emptyUnread'),
              textAlign: TextAlign.center,
              style: TextStyle(color: chrome.textMuted),
            ),
          );
        }
        return ListView.builder(
          padding: const EdgeInsets.only(bottom: 24),
          itemCount: _unread.length,
          itemBuilder: (_, i) => _unreadTile(chrome, _unread[i]),
        );
      case _InboxTab.mentions:
        if (_loadingMentions) {
          return Center(child: CircularProgressIndicator(color: chrome.accent));
        }
        if (_mentions.isEmpty) {
          return Center(
            child: Text(
              _t('chat.popups.inbox.emptyMentions'),
              textAlign: TextAlign.center,
              style: TextStyle(color: chrome.textMuted),
            ),
          );
        }
        return ListView.builder(
          padding: const EdgeInsets.only(bottom: 24),
          itemCount: _mentions.length,
          itemBuilder: (_, i) => _mentionTile(chrome, _mentions[i]),
        );
    }
  }

  TextStyle _titleStyle(MessagesChromePalette chrome) => TextStyle(
        color: chrome.text,
        fontWeight: FontWeight.w600,
      );

  TextStyle _subtitleStyle(MessagesChromePalette chrome) => TextStyle(
        color: chrome.textMuted,
        fontSize: 12,
      );

  Widget _forYouTile(MessagesChromePalette chrome, InboxForYouItem item) {
    if (item is InboxUnknownForYouItem) {
      final r = item.raw;
      final hint = (r['type'] ?? r['Type'] ?? '?').toString();
      return ListTile(
        leading: Icon(Icons.help_outline_rounded, color: chrome.accent),
        title: Text('($hint)', style: _titleStyle(chrome)),
        subtitle: Text(
          '${r['title'] ?? r['topic'] ?? ''}'.trim(),
          style: _subtitleStyle(chrome),
        ),
      );
    }
    if (item is InboxServerInviteItem) {
      return ListTile(
        leading: _avatar(
          chrome,
          url: item.serverAvatarUrl,
          letter: _letter(_serverLabel(item.serverName)),
          dot: item.seen != true,
        ),
        title: Text(
          _t('chat.popups.inbox.inviteTitle'),
          style: _titleStyle(chrome),
        ),
        subtitle: Text(
          _t('chat.popups.inbox.inviteMeta', {
            'inviter': item.inviterDisplay,
            'serverName': _serverLabel(item.serverName),
          }),
          style: _subtitleStyle(chrome),
        ),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            IconButton(
              onPressed: () => _acceptInvite(item),
              tooltip: _t('chat.popups.inbox.acceptInviteAria'),
              icon: Icon(Icons.check_circle_outline, color: chrome.accent),
            ),
            IconButton(
              onPressed: () => _declineInvite(item),
              tooltip: _t('chat.popups.inbox.declineInviteAria'),
              icon: Icon(Icons.close_rounded, color: const Color(0xFFFF6B7A)),
            ),
          ],
        ),
      );
    }
    if (item is InboxEventItem) {
      return ListTile(
        onTap: () => _onForYouTap(item),
        leading: _avatar(
          chrome,
          url: item.serverAvatarUrl,
          letter: _letter(_serverLabel(item.serverName)),
          dot: item.seen != true,
        ),
        title: Text(item.topic ?? '', style: _titleStyle(chrome)),
        subtitle: Text(
          '${_serverLabel(item.serverName)} · ${_timeAgo(item.startAt)}',
          style: _subtitleStyle(chrome),
        ),
      );
    }
    if (item is InboxServerNotificationItem) {
      return ListTile(
        onTap: () => _onForYouTap(item),
        leading: _avatar(
          chrome,
          url: item.serverAvatarUrl,
          letter: _letter(_serverLabel(item.serverName)),
          dot: item.seen != true,
        ),
        title: Text(_resolveNotifTitle(item.title), style: _titleStyle(chrome)),
        subtitle: Text(
          '${_resolveNotifTitle(item.content)}\n${_timeAgo(item.createdAt)}',
          style: _subtitleStyle(chrome),
        ),
      );
    }
    return const SizedBox.shrink();
  }

  Widget _unreadTile(MessagesChromePalette chrome, InboxUnreadItem u) {
    if (u is InboxUnreadDmItem) {
      return ListTile(
        onTap: () {
          widget.onClose?.call();
          widget.onNavigateToDm(u.userId, u.displayName, u.username, null);
        },
        leading: _avatar(
          chrome,
          letter: _letter(u.displayName.isNotEmpty ? u.displayName : u.username),
          dot: u.unreadCount > 0,
        ),
        title: Text(
          u.displayName.isNotEmpty ? u.displayName : u.username,
          style: _titleStyle(chrome),
        ),
        subtitle: Text(
          u.lastMessage.isNotEmpty
              ? u.lastMessage
              : _t('chat.popups.inbox.newMessageFallback'),
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: _subtitleStyle(chrome),
        ),
        trailing: Text(_timeAgo(u.lastMessageAt), style: _subtitleStyle(chrome)),
      );
    }
    if (u is InboxUnreadChannelItem) {
      return ListTile(
        onTap: () {
          widget.onClose?.call();
          unawaited(widget.onNavigateToChannel(u.serverId, u.channelId));
        },
        leading: _avatar(
          chrome,
          letter: _letter(_serverLabel(u.serverName)),
          dot: (u.unreadCount ?? 0) > 0,
        ),
        title: Text(
          '${_serverLabel(u.serverName)} · #${u.channelName}',
          style: _titleStyle(chrome),
        ),
        subtitle: Text(
          u.lastMessage.isNotEmpty
              ? u.lastMessage
              : _t('chat.popups.inbox.newMessageFallback'),
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: _subtitleStyle(chrome),
        ),
        trailing: Text(_timeAgo(u.lastMessageAt), style: _subtitleStyle(chrome)),
      );
    }
    return const SizedBox.shrink();
  }

  Widget _mentionTile(MessagesChromePalette chrome, InboxMentionItem m) {
    return ListTile(
      onTap: () => _onMentionTap(m),
      leading: _avatar(
        chrome,
        letter: _letter(_serverLabel(m.serverName)),
        dot: m.seen != true,
      ),
      title: Text(
        '${_serverLabel(m.serverName)} · #${m.channelName}',
        style: _titleStyle(chrome),
      ),
      subtitle: Text(
        '${m.actorName} ${_t('chat.popups.inbox.mentionYou')}'
            '${(m.excerpt ?? '').trim().isNotEmpty ? ' — ${m.excerpt!.trim()}' : ''}',
        maxLines: 3,
        overflow: TextOverflow.ellipsis,
        style: _subtitleStyle(chrome),
      ),
      trailing: Text(_timeAgo(m.createdAt), style: _subtitleStyle(chrome)),
    );
  }

  Widget _avatar(
    MessagesChromePalette chrome, {
    String? url,
    required String letter,
    bool dot = false,
  }) {
    return Stack(
      clipBehavior: Clip.none,
      children: [
        CircleAvatar(
          radius: 22,
          backgroundColor: chrome.surfaceMuted,
          backgroundImage: (url != null && url.isNotEmpty) ? NetworkImage(url) : null,
          child: (url == null || url.isEmpty)
              ? Text(
                  letter.toUpperCase(),
                  style: TextStyle(
                    color: chrome.text,
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
