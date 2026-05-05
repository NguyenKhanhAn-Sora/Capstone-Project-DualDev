import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../core/config/app_config.dart';
import '../models/server_models.dart';
import '../models/server_permissions.dart';
import '../services/channel_messages_service.dart';
import '../services/server_sidebar_prefs_store.dart';
import '../services/servers_service.dart';

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
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF0E1F45),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) => _ServerContextBody(
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
      const SnackBar(content: Text('Đã sao chép link mời vào máy chủ')),
    );
  }

  void _runAfterClose(VoidCallback? action) {
    if (action == null) return;
    Navigator.pop(context);
    WidgetsBinding.instance.addPostFrameCallback((_) => action());
  }

  Future<void> _createChannel(String type) async {
    final nameCtrl = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (dCtx) => AlertDialog(
        backgroundColor: const Color(0xFF152A52),
        title: Text(
          type == 'voice' ? 'Tạo kênh thoại' : 'Tạo kênh chat',
          style: const TextStyle(color: Colors.white),
        ),
        content: TextField(
          controller: nameCtrl,
          style: const TextStyle(color: Colors.white),
          decoration: const InputDecoration(
            hintText: 'Tên kênh',
            hintStyle: TextStyle(color: Color(0xFF8EA3CC)),
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dCtx, false), child: const Text('Huỷ')),
          TextButton(
            onPressed: () => Navigator.pop(dCtx, true),
            child: const Text('Tạo'),
          ),
        ],
      ),
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
          SnackBar(content: Text('Không tạo được kênh: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _createCategory() async {
    final nameCtrl = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (dCtx) => AlertDialog(
        backgroundColor: const Color(0xFF152A52),
        title: const Text('Tạo danh mục', style: TextStyle(color: Colors.white)),
        content: TextField(
          controller: nameCtrl,
          style: const TextStyle(color: Colors.white),
          decoration: const InputDecoration(
            hintText: 'Tên danh mục',
            hintStyle: TextStyle(color: Color(0xFF8EA3CC)),
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dCtx, false), child: const Text('Huỷ')),
          TextButton(onPressed: () => Navigator.pop(dCtx, true), child: const Text('Tạo')),
        ],
      ),
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
          SnackBar(content: Text('Không tạo được danh mục: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _leave() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (dCtx) => AlertDialog(
        backgroundColor: const Color(0xFF152A52),
        title: const Text('Rời máy chủ?', style: TextStyle(color: Colors.white)),
        content: Text(
          'Bạn sẽ rời ${widget.server.name}.',
          style: const TextStyle(color: Color(0xFFB8C8E8)),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dCtx, false), child: const Text('Huỷ')),
          TextButton(
            onPressed: () => Navigator.pop(dCtx, true),
            child: const Text('Rời', style: TextStyle(color: Color(0xFFFF6B7A))),
          ),
        ],
      ),
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
          SnackBar(content: Text('Không rời được: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Widget _tile(String title, VoidCallback? onTap, {Color? color}) {
    return ListTile(
      title: Text(title, style: TextStyle(color: color ?? Colors.white, fontWeight: FontWeight.w600)),
      trailing: const Icon(Icons.chevron_right_rounded, color: Color(0xFF7E8CA8)),
      onTap: _busy ? null : onTap,
    );
  }

  @override
  Widget build(BuildContext context) {
    final uid = _uid;
    final hasUser = uid.isNotEmpty;
    final p = _p;
    final manageAny = p.canManageServer || p.canManageChannels || p.canManageEvents;

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
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 18,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                  IconButton(
                    onPressed: _busy ? null : () => Navigator.pop(context),
                    icon: const Icon(Icons.close_rounded, color: Colors.white70),
                  ),
                ],
              ),
            ),
            if (_busy) const LinearProgressIndicator(minHeight: 2),
            Flexible(
              child: ListView(
                shrinkWrap: true,
                children: [
                  _tile('Đánh dấu đã đọc (tất cả kênh chat)', _markAllRead),
                  if (p.canCreateInvite) _tile('Sao chép link mời', _invite),
                  const Divider(color: Color(0xFF2A3F6A)),
                  if (hasUser)
                    ExpansionTile(
                      initiallyExpanded: false,
                      iconColor: const Color(0xFF8EA3CC),
                      collapsedIconColor: const Color(0xFF8EA3CC),
                      title: Text(
                        _serverMuted ? 'Bỏ tắt âm máy chủ' : 'Tắt âm máy chủ',
                        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
                      ),
                      children: _serverMuted
                          ? [
                              ListTile(
                                title: const Text('Bỏ tắt âm', style: TextStyle(color: Colors.white)),
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
                                '15m': '15 phút',
                                '1h': '1 giờ',
                                '3h': '3 giờ',
                                '8h': '8 giờ',
                                '24h': '24 giờ',
                                'until': 'Cho đến khi bật lại',
                              };
                              return ListTile(
                                title: Text(
                                  labels[k]!,
                                  style: const TextStyle(color: Colors.white70),
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
                      iconColor: const Color(0xFF8EA3CC),
                      collapsedIconColor: const Color(0xFF8EA3CC),
                      title: const Text(
                        'Thông báo máy chủ',
                        style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
                      ),
                      subtitle: Text(
                        ServerSidebarPrefsStore.notifyLabelForLevel(_notifyLevel ?? 'all'),
                        style: const TextStyle(color: Color(0xFF8EA3CC), fontSize: 12),
                      ),
                      children: [
                        for (final level in ['all', 'mentions', 'none'])
                          RadioListTile<String>(
                            value: level,
                            groupValue: _notifyLevel ?? 'all',
                            activeColor: const Color(0xFF00C48C),
                            title: Text(
                              ServerSidebarPrefsStore.notifyLabelForLevel(level),
                              style: const TextStyle(color: Colors.white70),
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
                          activeColor: const Color(0xFF00C48C),
                          title: const Text(
                            'Bỏ qua @everyone / @here',
                            style: TextStyle(color: Colors.white70, fontSize: 14),
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
                          activeColor: const Color(0xFF00C48C),
                          title: const Text(
                            'Bỏ qua @vai trò',
                            style: TextStyle(color: Colors.white70, fontSize: 14),
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
                      activeColor: const Color(0xFF00C48C),
                      title: const Text(
                        'Ẩn kênh đang tắt âm',
                        style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
                      ),
                      onChanged: (v) async {
                        await ServerSidebarPrefsStore.setServerHideMutedChannels(uid, _sid, v);
                        setState(() => _hideMuted = v);
                        widget.onServerChanged();
                      },
                    ),
                  if (manageAny) const Divider(color: Color(0xFF2A3F6A)),
                  if (p.canManageServer)
                    _tile(
                      'Cài đặt máy chủ',
                      () => _runAfterClose(widget.onOpenServerSettings),
                    ),
                  if (p.canManageChannels) ...[
                    _tile('Tạo kênh chat', () => _createChannel('text')),
                    _tile('Tạo kênh thoại', () => _createChannel('voice')),
                    _tile('Tạo danh mục', _createCategory),
                  ],
                  if (p.canManageEvents)
                    _tile(
                      'Tạo sự kiện',
                      () => _runAfterClose(widget.onOpenCreateEvent),
                    ),
                  if (!p.isOwner) ...[
                    const Divider(color: Color(0xFF2A3F6A)),
                    _tile('Rời máy chủ', _leave, color: const Color(0xFFFF8A8A)),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
