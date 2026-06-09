import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../core/config/app_config.dart';
import '../../../core/services/language_controller.dart';
import '../../../core/theme/app_theme_context.dart';
import '../models/server_models.dart';
import 'messages_chrome_builder.dart';
import '../models/server_permissions.dart';
import '../services/channel_messages_service.dart';
import '../services/server_sidebar_prefs_store.dart';
import '../services/servers_service.dart';
import '../utils/messages_ui.dart';

/// Mobile-optimized server menu (parity with web `ServerContextMenu`).
class ServerContextSheet {
  ServerContextSheet._();

  static Future<void> show(
    BuildContext context, {
    required ServerSummary server,
    required String? userId,
    required CurrentUserServerPermissions permissions,
    required List<ServerChannel> textChannels,
    required VoidCallback onServerChanged,
    required Future<void> Function() onLeaveSuccess,
    VoidCallback? onOpenServerSettings,
    VoidCallback? onOpenCreateEvent,
  }) {
    return MessagesUi.showBottomSheet<void>(
      context,
      isScrollControlled: true,
      child: _ServerContextBody(
        server: server,
        userId: userId,
        permissions: permissions,
        textChannels: textChannels,
        onServerChanged: onServerChanged,
        onLeaveSuccess: onLeaveSuccess,
        onOpenServerSettings: onOpenServerSettings,
        onOpenCreateEvent: onOpenCreateEvent,
      ),
    );
  }
}


class _ServerContextBody extends StatefulWidget {
  const _ServerContextBody({
    required this.server,
    required this.userId,
    required this.permissions,
    required this.textChannels,
    required this.onServerChanged,
    required this.onLeaveSuccess,
    this.onOpenServerSettings,
    this.onOpenCreateEvent,
  });

  final ServerSummary server;
  final String? userId;
  final CurrentUserServerPermissions permissions;
  final List<ServerChannel> textChannels;
  final VoidCallback onServerChanged;
  final Future<void> Function() onLeaveSuccess;
  final VoidCallback? onOpenServerSettings;
  final VoidCallback? onOpenCreateEvent;

  @override
  State<_ServerContextBody> createState() => _ServerContextBodyState();
}

class _ServerContextBodyState extends State<_ServerContextBody> {
  String? _notifyLevel;
  bool _hideMuted = false;
  bool _serverMuted = false;
  bool _suppressEveryone = false;
  bool _suppressRoles = false;
  bool _busy = false;

  String get _uid => widget.userId ?? '';
  String get _sid => widget.server.id;

  CurrentUserServerPermissions get _p => widget.permissions;

  String _t(String key, [Map<String, dynamic>? vars]) =>
      LanguageController.instance.t(key, vars);

  @override
  void initState() {
    super.initState();
    _loadPrefs();
  }

  Future<void> _loadPrefs() async {
    if (_uid.isEmpty) return;
    final n = await ServerSidebarPrefsStore.serverNotify(_uid, _sid);
    final h = await ServerSidebarPrefsStore.hideMutedChannels(_uid, _sid);
    final sm = await ServerSidebarPrefsStore.isServerMuted(_uid, _sid);
    final prefs = await ServerSidebarPrefsStore.getServerPrefs(_uid, _sid);
    if (!mounted) return;
    setState(() {
      _notifyLevel = n ?? 'all';
      _hideMuted = h;
      _serverMuted = sm;
      _suppressEveryone = prefs['suppressEveryoneHere'] == true;
      _suppressRoles = prefs['suppressRoleMentions'] == true;
    });
  }

  Future<void> _markAllRead() async {
    setState(() => _busy = true);
    try {
      for (final c in widget.textChannels) {
        try {
          await ChannelMessagesService.markChannelRead(c.id);
        } catch (_) {}
      }
      if (mounted) Navigator.pop(context);
      widget.onServerChanged();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _invite() async {
    final link = '${AppConfig.webBaseUrl}/invite/server/${widget.server.id}';
    await Clipboard.setData(ClipboardData(text: link));
    if (!mounted) return;
    Navigator.pop(context);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(_t('chat.serverContextMenu.copyInviteCopied'))),
    );
  }

  void _runAfterClose(VoidCallback? action) {
    if (action == null) return;
    Navigator.pop(context);
    WidgetsBinding.instance.addPostFrameCallback((_) => action());
  }

  Future<void> _createChannel(String type) async {
    final nameCtrl = TextEditingController();
    final ok = await MessagesUi.showThemedDialog<bool>(
      context,
      builder: (dCtx) {
        final c = dCtx.chrome;
        return AlertDialog(
          backgroundColor: c.surface,
          title: Text(
            type == 'voice'
                ? _t('chat.sidebar.createVoiceChannel')
                : _t('chat.sidebar.createTextChannel'),
            style: TextStyle(color: c.text),
          ),
          content: TextField(
            controller: nameCtrl,
            style: TextStyle(color: c.text),
            decoration: InputDecoration(
              hintText: _t('chat.popups.createChannel.channelName'),
              hintStyle: TextStyle(color: c.textMuted),
              filled: true,
              fillColor: c.chatInput,
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dCtx, false),
              child: Text(_t('common.cancel'), style: TextStyle(color: c.textMuted)),
            ),
            TextButton(
              onPressed: () => Navigator.pop(dCtx, true),
              child: Text(_t('messages.create'), style: TextStyle(color: c.accent)),
            ),
          ],
        );
      },
    );
    if (ok != true || !mounted) return;
    final name = nameCtrl.text.trim();
    nameCtrl.dispose();
    if (name.isEmpty) return;
    setState(() => _busy = true);
    try {
      await ServersService.createChannel(
        serverId: _sid,
        name: name,
        type: type,
      );
      if (mounted) Navigator.pop(context);
      widget.onServerChanged();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              _t('chat.serverContextMenu.errorCreateChannel', {'error': '$e'}),
            ),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _createCategory() async {
    final nameCtrl = TextEditingController();
    final ok = await MessagesUi.showThemedDialog<bool>(
      context,
      builder: (dCtx) {
        final c = dCtx.chrome;
        return AlertDialog(
          backgroundColor: c.surface,
          title: Text(
            _t('chat.serverContextMenu.createCategoryTitle'),
            style: TextStyle(color: c.text),
          ),
          content: TextField(
            controller: nameCtrl,
            style: TextStyle(color: c.text),
            decoration: InputDecoration(
              hintText: _t('chat.serverContextMenu.categoryNamePlaceholder'),
              hintStyle: TextStyle(color: c.textMuted),
              filled: true,
              fillColor: c.chatInput,
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dCtx, false),
              child: Text(_t('common.cancel'), style: TextStyle(color: c.textMuted)),
            ),
            TextButton(
              onPressed: () => Navigator.pop(dCtx, true),
              child: Text(_t('messages.create'), style: TextStyle(color: c.accent)),
            ),
          ],
        );
      },
    );
    if (ok != true || !mounted) return;
    final name = nameCtrl.text.trim();
    nameCtrl.dispose();
    if (name.isEmpty) return;
    setState(() => _busy = true);
    try {
      await ServersService.createCategory(serverId: _sid, name: name);
      if (mounted) Navigator.pop(context);
      widget.onServerChanged();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              _t('chat.serverContextMenu.errorCreateCategory', {'error': '$e'}),
            ),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _leave() async {
    final ok = await MessagesUi.showThemedDialog<bool>(
      context,
      builder: (dCtx) {
        final c = dCtx.chrome;
        return AlertDialog(
          backgroundColor: c.surface,
          title: Text(
            _t('chat.serverContextMenu.leaveConfirmTitle'),
            style: TextStyle(color: c.text),
          ),
          content: Text(
            _t('chat.serverContextMenu.leaveConfirmBody', {
              'serverName': widget.server.name,
            }),
            style: TextStyle(color: c.textMuted),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dCtx, false),
              child: Text(_t('common.cancel'), style: TextStyle(color: c.textMuted)),
            ),
            TextButton(
              onPressed: () => Navigator.pop(dCtx, true),
              child: Text(
                _t('chat.serverContextMenu.leaveConfirmAction'),
                style: const TextStyle(color: Color(0xFFFF6B7A)),
              ),
            ),
          ],
        );
      },
    );
    if (ok != true || !mounted) return;
    setState(() => _busy = true);
    try {
      await ServersService.leaveServer(_sid);
      if (mounted) Navigator.pop(context);
      await widget.onLeaveSuccess();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              _t('chat.serverContextMenu.errorLeave', {'error': '$e'}),
            ),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Widget _tile(
    BuildContext context,
    String title,
    VoidCallback? onTap, {
    Color? color,
  }) {
    final c = context.chrome;
    return ListTile(
      title: Text(
        title,
        style: TextStyle(
          color: color ?? c.text,
          fontWeight: FontWeight.w600,
        ),
      ),
      trailing: Icon(Icons.chevron_right_rounded, color: c.accent),
      onTap: _busy ? null : onTap,
    );
  }

  static const Color _destructive = Color(0xFFFF8A8A);

  @override
  Widget build(BuildContext context) {
    return MessagesChromeBuilder(
      builder: (context, chrome) {
        final uid = _uid;
        final hasUser = uid.isNotEmpty;
        final p = _p;
        final manageAny =
            p.canManageServer || p.canManageChannels || p.canManageEvents;

        return SafeArea(
      child: Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.paddingOf(context).bottom + 8),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 8, 4),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      widget.server.name,
                      style: TextStyle(
                        color: chrome.text,
                        fontSize: 18,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                  IconButton(
                    onPressed: _busy ? null : () => Navigator.pop(context),
                    icon: Icon(Icons.close_rounded, color: chrome.textMuted),
                  ),
                ],
              ),
            ),
            if (_busy) LinearProgressIndicator(minHeight: 2, color: chrome.accent),
            Flexible(
              child: ListView(
                shrinkWrap: true,
                children: [
                  _tile(
                    context,
                    _t('chat.serverContextMenu.markAllChannelsRead'),
                    _markAllRead,
                  ),
                  if (p.canCreateInvite)
                    _tile(context, _t('common.copyLink'), _invite),
                  Divider(color: chrome.border),
                  if (hasUser)
                    ExpansionTile(
                      initiallyExpanded: false,
                      iconColor: chrome.textMuted,
                      collapsedIconColor: chrome.textMuted,
                      title: Text(
                        _serverMuted
                            ? _t('chat.serverContextMenu.unmuteServer')
                            : _t('chat.serverContextMenu.muteServer'),
                        style: TextStyle(
                          color: chrome.text,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      children: _serverMuted
                          ? [
                              ListTile(
                                title: Text(
                                  _t('chat.serverContextMenu.unmuteShort'),
                                  style: TextStyle(color: chrome.text),
                                ),
                                onTap: () async {
                                  await ServerSidebarPrefsStore.clearServerMute(uid, _sid);
                                  await _loadPrefs();
                                  widget.onServerChanged();
                                  if (mounted) setState(() {});
                                },
                              ),
                            ]
                          : ['15m', '1h', '3h', '8h', '24h', 'until'].map((k) {
                              final labels = {
                                '15m': _t('chat.serverContextMenu.muteFor15m'),
                                '1h': _t('chat.serverContextMenu.muteFor1h'),
                                '3h': _t('chat.serverContextMenu.muteFor3h'),
                                '8h': _t('chat.serverContextMenu.muteFor8h'),
                                '24h': _t('chat.serverContextMenu.muteFor24h'),
                                'until': _t(
                                  'chat.serverContextMenu.muteUntilReenable',
                                ),
                              };
                              return ListTile(
                                title: Text(
                                  labels[k]!,
                                  style: TextStyle(
                                    color: chrome.text.withValues(alpha: 0.85),
                                  ),
                                ),
                                onTap: () async {
                                  final r = ServerSidebarPrefsStore.muteKeyToUntil(k);
                                  await ServerSidebarPrefsStore.setServerMute(
                                    uid,
                                    _sid,
                                    r.mutedUntil,
                                    r.mutedForever,
                                  );
                                  await _loadPrefs();
                                  widget.onServerChanged();
                                  if (mounted) setState(() {});
                                },
                              );
                            }).toList(),
                    ),
                  if (hasUser)
                    ExpansionTile(
                      iconColor: chrome.textMuted,
                      collapsedIconColor: chrome.textMuted,
                      title: Text(
                        _t('chat.serverContextMenu.serverNotificationsTitle'),
                        style: TextStyle(
                          color: chrome.text,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      subtitle: Text(
                        ServerSidebarPrefsStore.notifyLabelForLevel(
                          _notifyLevel ?? 'all',
                        ),
                        style: TextStyle(color: chrome.textMuted, fontSize: 12),
                      ),
                      children: [
                        for (final level in ['all', 'mentions', 'none'])
                          RadioListTile<String>(
                            value: level,
                            groupValue: _notifyLevel ?? 'all',
                            activeColor: chrome.accent,
                            title: Text(
                              ServerSidebarPrefsStore.notifyLabelForLevel(level),
                              style: TextStyle(
                                color: chrome.text.withValues(alpha: 0.85),
                              ),
                            ),
                            onChanged: (v) async {
                              if (v == null) return;
                              await ServerSidebarPrefsStore.setServerNotify(uid, _sid, v);
                              setState(() => _notifyLevel = v);
                              widget.onServerChanged();
                            },
                          ),
                        SwitchListTile(
                          value: _suppressEveryone,
                          activeTrackColor: chrome.accent,
                          title: Text(
                            _t('chat.serverContextMenu.suppressEveryone'),
                            style: TextStyle(
                              color: chrome.text.withValues(alpha: 0.85),
                              fontSize: 14,
                            ),
                          ),
                          onChanged: (v) async {
                            await ServerSidebarPrefsStore.setServerSuppressFlags(
                              uid,
                              _sid,
                              suppressEveryoneHere: v,
                            );
                            setState(() => _suppressEveryone = v);
                            widget.onServerChanged();
                          },
                        ),
                        SwitchListTile(
                          value: _suppressRoles,
                          activeTrackColor: chrome.accent,
                          title: Text(
                            _t('chat.serverContextMenu.suppressRoles'),
                            style: TextStyle(
                              color: chrome.text.withValues(alpha: 0.85),
                              fontSize: 14,
                            ),
                          ),
                          onChanged: (v) async {
                            await ServerSidebarPrefsStore.setServerSuppressFlags(
                              uid,
                              _sid,
                              suppressRoleMentions: v,
                            );
                            setState(() => _suppressRoles = v);
                            widget.onServerChanged();
                          },
                        ),
                      ],
                    ),
                  if (hasUser)
                    SwitchListTile(
                      value: _hideMuted,
                      activeTrackColor: chrome.accent,
                      title: Text(
                        _t('chat.serverContextMenu.hideVoiceChannels'),
                        style: TextStyle(
                          color: chrome.text,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      onChanged: (v) async {
                        await ServerSidebarPrefsStore.setServerHideMutedChannels(uid, _sid, v);
                        setState(() => _hideMuted = v);
                        widget.onServerChanged();
                      },
                    ),
                  if (manageAny) Divider(color: chrome.border),
                  if (p.canManageServer)
                    _tile(
                      context,
                      _t('chat.serverContextMenu.serverSettings'),
                      () => _runAfterClose(widget.onOpenServerSettings),
                    ),
                  if (p.canManageChannels) ...[
                    _tile(
                      context,
                      _t('chat.sidebar.createTextChannel'),
                      () => _createChannel('text'),
                    ),
                    _tile(
                      context,
                      _t('chat.sidebar.createVoiceChannel'),
                      () => _createChannel('voice'),
                    ),
                    _tile(
                      context,
                      _t('chat.serverContextMenu.createCategory'),
                      _createCategory,
                    ),
                  ],
                  if (p.canManageEvents)
                    _tile(
                      context,
                      _t('chat.serverContextMenu.createEvent'),
                      () => _runAfterClose(widget.onOpenCreateEvent),
                    ),
                  if (!p.isOwner) ...[
                    Divider(color: chrome.border),
                    _tile(
                      context,
                      _t('chat.serverContextMenu.leaveServer'),
                      _leave,
                      color: _destructive,
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
      },
    );
  }
}
