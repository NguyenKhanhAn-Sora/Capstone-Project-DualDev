import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../core/config/app_config.dart';
import '../models/server_models.dart';
import '../models/server_permissions.dart';
import '../services/channel_messages_service.dart';
import '../services/server_sidebar_prefs_store.dart';
import '../services/servers_service.dart';

/// Long-press channel actions (parity with web `ChannelContextMenu`).
class ChannelContextSheet {
  ChannelContextSheet._();

  static Future<void> show(
    BuildContext context, {
    required ServerSummary server,
    required ServerChannel channel,
    required String? categoryId,
    required String? userId,
    required CurrentUserServerPermissions permissions,
    required VoidCallback onChanged,
    /// Giống web: đóng menu rồi mở/focus kênh (chat hoặc thoại).
    VoidCallback? onInviteToChannel,
  }) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF0E1F45),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) => _ChannelContextBody(
        server: server,
        channel: channel,
        categoryId: categoryId,
        userId: userId,
        permissions: permissions,
        onChanged: onChanged,
        onInviteToChannel: onInviteToChannel,
      ),
    );
  }
}

class _ChannelContextBody extends StatefulWidget {
  const _ChannelContextBody({
    required this.server,
    required this.channel,
    required this.categoryId,
    required this.userId,
    required this.permissions,
    required this.onChanged,
    this.onInviteToChannel,
  });

  final ServerSummary server;
  final ServerChannel channel;
  final String? categoryId;
  final String? userId;
  final CurrentUserServerPermissions permissions;
  final VoidCallback onChanged;
  final VoidCallback? onInviteToChannel;

  @override
  State<_ChannelContextBody> createState() => _ChannelContextBodyState();
}

class _ChannelContextBodyState extends State<_ChannelContextBody> {
  bool _busy = false;
  bool _channelMuted = false;
  String _channelNotify = 'inherit_category';
  String _serverNotify = 'all';

  String get _uid => widget.userId ?? '';
  String get _sid => widget.server.id;
  String get _cid => widget.channel.id;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (_uid.isEmpty) return;
    final muted = await ServerSidebarPrefsStore.isChannelMuted(_uid, _sid, _cid);
    final eff = await ServerSidebarPrefsStore.effectiveNotifyLevel(
      _uid,
      _sid,
      _cid,
      widget.categoryId,
    );
    final prefs = await ServerSidebarPrefsStore.getServerPrefs(_uid, _sid);
    final ch = prefs['channels'];
    String mode = 'inherit_category';
    if (ch is Map && ch[_cid] is Map) {
      final n = (ch[_cid] as Map)['notify']?.toString();
      if (n != null && n.isNotEmpty) mode = n;
    }
    if (!mounted) return;
    setState(() {
      _channelMuted = muted;
      _channelNotify = mode;
      _serverNotify = prefs['serverNotify']?.toString() ?? 'all';
    });
  }

  Future<void> _markRead() async {
    setState(() => _busy = true);
    try {
      await ChannelMessagesService.markChannelRead(_cid);
      if (mounted) Navigator.pop(context);
      widget.onChanged();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Lỗi: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _inviteToChannel() {
    final cb = widget.onInviteToChannel;
    if (cb == null) return;
    Navigator.pop(context);
    WidgetsBinding.instance.addPostFrameCallback((_) => cb());
  }

  Future<void> _copyLink() async {
    final link =
        '${AppConfig.webBaseUrl}/invite/server/${widget.server.id}/${widget.channel.id}';
    await Clipboard.setData(ClipboardData(text: link));
    if (!mounted) return;
    Navigator.pop(context);
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Đã sao chép link kênh')),
    );
  }

  Future<void> _editName() async {
    final ctrl = TextEditingController(text: widget.channel.name);
    final ok = await showDialog<bool>(
      context: context,
      builder: (dCtx) => AlertDialog(
        backgroundColor: const Color(0xFF152A52),
        title: const Text('Đổi tên kênh', style: TextStyle(color: Colors.white)),
        content: TextField(
          controller: ctrl,
          style: const TextStyle(color: Colors.white),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dCtx, false), child: const Text('Huỷ')),
          TextButton(onPressed: () => Navigator.pop(dCtx, true), child: const Text('Lưu')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    final name = ctrl.text.trim();
    ctrl.dispose();
    if (name.isEmpty || name == widget.channel.name) return;
    setState(() => _busy = true);
    try {
      await ServersService.updateChannel(
        serverId: _sid,
        channelId: _cid,
        name: name,
      );
      if (mounted) Navigator.pop(context);
      widget.onChanged();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Không sửa được: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _delete() async {
    if (widget.channel.isDefault) return;
    final ok = await showDialog<bool>(
      context: context,
      builder: (dCtx) => AlertDialog(
        backgroundColor: const Color(0xFF152A52),
        title: const Text('Xóa kênh?', style: TextStyle(color: Colors.white)),
        content: Text(
          'Xóa #${widget.channel.name}? Không hoàn tác.',
          style: const TextStyle(color: Color(0xFFB8C8E8)),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dCtx, false), child: const Text('Huỷ')),
          TextButton(
            onPressed: () => Navigator.pop(dCtx, true),
            child: const Text('Xóa', style: TextStyle(color: Color(0xFFFF6B7A))),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => _busy = true);
    try {
      await ServersService.deleteChannel(serverId: _sid, channelId: _cid);
      if (mounted) Navigator.pop(context);
      widget.onChanged();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Không xóa được: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Widget _tile(String title, VoidCallback? onTap, {Color? color}) {
    return ListTile(
      title: Text(title, style: TextStyle(color: color ?? Colors.white, fontWeight: FontWeight.w600)),
      onTap: _busy ? null : onTap,
    );
  }

  @override
  Widget build(BuildContext context) {
    final canStruct = widget.permissions.canManageChannelsStructure;
    final uid = _uid;

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 10, 8, 0),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      '#${widget.channel.name}',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 17,
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
                  _tile('Đánh dấu đã đọc', _markRead),
                  if (widget.permissions.canCreateInvite &&
                      widget.onInviteToChannel != null)
                    _tile('Mời vào kênh', _inviteToChannel),
                  _tile('Sao chép link kênh', _copyLink),
                  if (uid.isNotEmpty)
                    ExpansionTile(
                      title: Text(
                        _channelMuted ? 'Bỏ tắt âm kênh' : 'Tắt âm kênh',
                        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
                      ),
                      iconColor: const Color(0xFF8EA3CC),
                      collapsedIconColor: const Color(0xFF8EA3CC),
                      children: _channelMuted
                          ? [
                              ListTile(
                                title: const Text('Bỏ tắt âm', style: TextStyle(color: Colors.white70)),
                                onTap: () async {
                                  await ServerSidebarPrefsStore.clearChannelMute(uid, _sid, _cid);
                                  await _load();
                                  widget.onChanged();
                                  if (mounted) setState(() {});
                                },
                              ),
                            ]
                          : ['15m', '1h', '3h', '8h', '24h', 'until'].map((k) {
                              final r = ServerSidebarPrefsStore.muteKeyToUntil(k);
                              return ListTile(
                                title: Text(k, style: const TextStyle(color: Colors.white70)),
                                onTap: () async {
                                  await ServerSidebarPrefsStore.setChannelMute(
                                    uid,
                                    _sid,
                                    _cid,
                                    r.mutedUntil,
                                    r.mutedForever,
                                  );
                                  await _load();
                                  widget.onChanged();
                                  if (mounted) setState(() {});
                                },
                              );
                            }).toList(),
                    ),
                  if (uid.isNotEmpty)
                    ExpansionTile(
                      title: const Text(
                        'Thông báo kênh',
                        style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
                      ),
                      subtitle: Text(
                        _channelNotify == 'inherit_category'
                            ? 'Theo máy chủ: ${ServerSidebarPrefsStore.notifyLabelForLevel(_serverNotify)}'
                            : ServerSidebarPrefsStore.notifyLabelForLevel(_channelNotify),
                        style: const TextStyle(color: Color(0xFF8EA3CC), fontSize: 12),
                      ),
                      iconColor: const Color(0xFF8EA3CC),
                      collapsedIconColor: const Color(0xFF8EA3CC),
                      children: [
                        RadioListTile<String>(
                          value: 'inherit_category',
                          groupValue: _channelNotify,
                          fillColor: WidgetStateProperty.resolveWith(
                            (s) => s.contains(WidgetState.selected)
                                ? const Color(0xFF00C48C)
                                : null,
                          ),
                          onChanged: (v) async {
                            if (v == null || uid.isEmpty) return;
                            await ServerSidebarPrefsStore.setChannelNotify(uid, _sid, _cid, v);
                            setState(() => _channelNotify = v);
                            widget.onChanged();
                          },
                          title: const Text('Theo máy chủ / danh mục', style: TextStyle(color: Colors.white70)),
                        ),
                        RadioListTile<String>(
                          value: 'all',
                          groupValue: _channelNotify,
                          fillColor: WidgetStateProperty.resolveWith(
                            (s) => s.contains(WidgetState.selected)
                                ? const Color(0xFF00C48C)
                                : null,
                          ),
                          onChanged: (v) async {
                            if (v == null || uid.isEmpty) return;
                            await ServerSidebarPrefsStore.setChannelNotify(uid, _sid, _cid, v);
                            setState(() => _channelNotify = v);
                            widget.onChanged();
                          },
                          title: const Text('Tất cả tin nhắn', style: TextStyle(color: Colors.white70)),
                        ),
                        RadioListTile<String>(
                          value: 'mentions',
                          groupValue: _channelNotify,
                          fillColor: WidgetStateProperty.resolveWith(
                            (s) => s.contains(WidgetState.selected)
                                ? const Color(0xFF00C48C)
                                : null,
                          ),
                          onChanged: (v) async {
                            if (v == null || uid.isEmpty) return;
                            await ServerSidebarPrefsStore.setChannelNotify(uid, _sid, _cid, v);
                            setState(() => _channelNotify = v);
                            widget.onChanged();
                          },
                          title: const Text('Chỉ @mentions', style: TextStyle(color: Colors.white70)),
                        ),
                        RadioListTile<String>(
                          value: 'none',
                          groupValue: _channelNotify,
                          fillColor: WidgetStateProperty.resolveWith(
                            (s) => s.contains(WidgetState.selected)
                                ? const Color(0xFF00C48C)
                                : null,
                          ),
                          onChanged: (v) async {
                            if (v == null || uid.isEmpty) return;
                            await ServerSidebarPrefsStore.setChannelNotify(uid, _sid, _cid, v);
                            setState(() => _channelNotify = v);
                            widget.onChanged();
                          },
                          title: const Text('Không có', style: TextStyle(color: Colors.white70)),
                        ),
                      ],
                    ),
                  if (canStruct) ...[
                    const Divider(color: Color(0xFF2A3F6A)),
                    _tile('Đổi tên kênh', _editName),
                    if (widget.channel.isDefault)
                      const ListTile(
                        title: Text(
                          'Không thể xóa kênh mặc định',
                          style: TextStyle(color: Color(0xFF8EA3CC)),
                        ),
                      )
                    else
                      _tile('Xóa kênh', _delete, color: const Color(0xFFFF8A8A)),
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
