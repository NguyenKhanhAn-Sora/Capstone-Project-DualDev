import 'package:flutter/material.dart';

import '../models/server_models.dart';
import '../models/server_role_models.dart';
import '../services/servers_service.dart';

/// Tin nhắn hệ thống + thông báo vai trò — GET/PATCH `/interaction-settings`.
class ServerInteractionScreen extends StatefulWidget {
  const ServerInteractionScreen({
    super.key,
    required this.serverId,
    required this.canManage,
  });

  final String serverId;
  final bool canManage;

  @override
  State<ServerInteractionScreen> createState() => _ServerInteractionScreenState();
}

class _ServerInteractionScreenState extends State<ServerInteractionScreen> {
  static const Color _bg = Color(0xFF08183A);
  static const Color _card = Color(0xFF0E1F45);

  Map<String, dynamic>? _settings;
  List<ServerChannel> _textChannels = [];
  List<Map<String, dynamic>> _roles = [];
  bool _loading = true;
  String? _error;

  final _notifTitle = TextEditingController();
  final _notifBody = TextEditingController();
  String _notifTarget = 'everyone';
  String? _notifRoleId;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _notifTitle.dispose();
    _notifBody.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final results = await Future.wait([
        ServersService.getInteractionSettings(widget.serverId),
        ServersService.getServerChannels(widget.serverId),
        ServersService.getRoles(widget.serverId),
      ]);
      if (!mounted) return;
      final s = results[0] as Map<String, dynamic>;
      final ch = results[1] as List<ServerChannel>;
      final roleList = results[2] as List<ServerRole>;
      final rs = roleList
          .map(
            (r) => <String, dynamic>{
              '_id': r.id,
              'name': r.name,
              'isDefault': r.isDefault,
            },
          )
          .toList();
      String? firstRoleId;
      for (final r in roleList) {
        if (!r.isDefault) {
          firstRoleId = r.id;
          break;
        }
      }
      setState(() {
        _settings = s;
        _textChannels = ch.where((c) => c.isText).toList();
        _roles = rs;
        _notifRoleId = firstRoleId;
      });
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  bool get _canEdit =>
      widget.canManage && (_settings?['canEdit'] == true);

  Future<void> _patch(Map<String, dynamic> patch) async {
    if (!_canEdit) return;
    try {
      final next =
          await ServersService.patchInteractionSettings(widget.serverId, patch);
      if (!mounted) return;
      setState(() => _settings = next);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
      }
    }
  }

  Future<void> _sendRoleNotif() async {
    if (!_canEdit) return;
    final t = _notifTitle.text.trim();
    final c = _notifBody.text.trim();
    if (t.isEmpty || c.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Nhập tiêu đề và nội dung thông báo')),
      );
      return;
    }
    if (_notifTarget == 'role' &&
        (_notifRoleId == null || _notifRoleId!.isEmpty)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Chọn vai trò nhận thông báo')),
      );
      return;
    }
    try {
      await ServersService.postRoleNotification(
        widget.serverId,
        title: t,
        content: c,
        targetType: _notifTarget,
        roleId: _notifTarget == 'role' ? _notifRoleId : null,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Đã gửi thông báo')),
      );
      _notifTitle.clear();
      _notifBody.clear();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final pad = MediaQuery.paddingOf(context);
    final w = MediaQuery.sizeOf(context).width;
    final hPad = w > 520 ? 24.0 : 14.0;

    return Scaffold(
      backgroundColor: _bg,
      appBar: AppBar(
        backgroundColor: _bg,
        title: const Text('Tương tác', style: TextStyle(fontWeight: FontWeight.w800)),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text(_error!, textAlign: TextAlign.center),
                        TextButton(onPressed: _load, child: const Text('Thử lại')),
                      ],
                    ),
                  ),
                )
              : RefreshIndicator(
                  onRefresh: _load,
                  color: const Color(0xFF7FB6FF),
                  child: ListView(
                    padding: EdgeInsets.fromLTRB(hPad, 12, hPad, pad.bottom + 24),
                    children: [
                      Text(
                        widget.canManage
                            ? 'Chỉ chủ hoặc người có quyền Quản lý máy chủ mới đổi được các mục dưới (nếu API cho phép).'
                            : 'Bạn chỉ xem được cài đặt.',
                        style: const TextStyle(color: Color(0xFF8EA3CC), fontSize: 13),
                      ),
                      const SizedBox(height: 16),
                      _cardBlock(
                        title: 'Tin nhắn hệ thống',
                        child: Column(
                          children: [
                            SwitchListTile(
                              contentPadding: EdgeInsets.zero,
                              title: const Text('Bật tin nhắn hệ thống',
                                  style: TextStyle(color: Colors.white)),
                              value: _settings?['systemMessagesEnabled'] == true,
                              onChanged: _canEdit
                                  ? (v) => _patch({'systemMessagesEnabled': v})
                                  : null,
                              activeThumbColor: const Color(0xFF00C48C),
                            ),
                            SwitchListTile(
                              contentPadding: EdgeInsets.zero,
                              title: const Text('Chào mừng thành viên mới',
                                  style: TextStyle(color: Colors.white)),
                              value: _settings?['welcomeMessageEnabled'] == true,
                              onChanged: _canEdit
                                  ? (v) => _patch({'welcomeMessageEnabled': v})
                                  : null,
                              activeThumbColor: const Color(0xFF00C48C),
                            ),
                            SwitchListTile(
                              contentPadding: EdgeInsets.zero,
                              title: const Text('Trả lời chào mừng bằng sticker',
                                  style: TextStyle(color: Colors.white)),
                              value:
                                  _settings?['stickerReplyWelcomeEnabled'] == true,
                              onChanged: _canEdit
                                  ? (v) =>
                                      _patch({'stickerReplyWelcomeEnabled': v})
                                  : null,
                              activeThumbColor: const Color(0xFF00C48C),
                            ),
                            const SizedBox(height: 8),
                            Align(
                              alignment: Alignment.centerLeft,
                              child: Text(
                                'Kênh tin hệ thống',
                                style: TextStyle(
                                  color: Colors.white.withOpacity(0.85),
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                            const SizedBox(height: 6),
                            DropdownButtonFormField<String?>(
                              value: _effectiveChannelId(),
                              decoration: _dropdownDec(),
                              dropdownColor: _card,
                              style: const TextStyle(color: Colors.white),
                              items: [
                                const DropdownMenuItem<String?>(
                                  value: null,
                                  child: Text('— Chưa chọn —'),
                                ),
                                ..._textChannels.map(
                                  (c) => DropdownMenuItem<String?>(
                                    value: c.id,
                                    child: Text('#${c.name}', overflow: TextOverflow.ellipsis),
                                  ),
                                ),
                              ],
                              onChanged: _canEdit
                                  ? (v) => _patch({'systemChannelId': v})
                                  : null,
                            ),
                            const SizedBox(height: 12),
                            Align(
                              alignment: Alignment.centerLeft,
                              child: Text(
                                'Thông báo mặc định',
                                style: TextStyle(
                                  color: Colors.white.withOpacity(0.85),
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                            const SizedBox(height: 6),
                            DropdownButtonFormField<String>(
                              value: _settings?['defaultNotificationLevel']
                                          ?.toString() ==
                                      'mentions'
                                  ? 'mentions'
                                  : 'all',
                              decoration: _dropdownDec(),
                              dropdownColor: _card,
                              style: const TextStyle(color: Colors.white),
                              items: const [
                                DropdownMenuItem(
                                  value: 'all',
                                  child: Text('Tất cả tin nhắn'),
                                ),
                                DropdownMenuItem(
                                  value: 'mentions',
                                  child: Text('Chỉ khi được nhắc'),
                                ),
                              ],
                              onChanged: _canEdit
                                  ? (v) {
                                      if (v != null) {
                                        _patch({'defaultNotificationLevel': v});
                                      }
                                    }
                                  : null,
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 20),
                      _cardBlock(
                        title: 'Thông báo vai trò (tab Dành cho bạn)',
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            TextField(
                              controller: _notifTitle,
                              enabled: _canEdit,
                              style: const TextStyle(color: Colors.white),
                              decoration: _fieldDec('Tiêu đề'),
                            ),
                            const SizedBox(height: 10),
                            TextField(
                              controller: _notifBody,
                              enabled: _canEdit,
                              minLines: 2,
                              maxLines: 5,
                              style: const TextStyle(color: Colors.white),
                              decoration: _fieldDec('Nội dung'),
                            ),
                            const SizedBox(height: 12),
                            SegmentedButton<String>(
                              segments: const [
                                ButtonSegment(
                                  value: 'everyone',
                                  label: Text('Mọi người'),
                                ),
                                ButtonSegment(
                                  value: 'role',
                                  label: Text('Theo vai trò'),
                                ),
                              ],
                              selected: {_notifTarget},
                              onSelectionChanged: (s) {
                                if (!_canEdit) return;
                                setState(() => _notifTarget = s.first);
                              },
                            ),
                            if (_notifTarget == 'role') ...[
                              const SizedBox(height: 10),
                              DropdownButtonFormField<String>(
                                value: _notifRoleId,
                                decoration: _dropdownDec(),
                                dropdownColor: _card,
                                hint: const Text('Chọn vai trò',
                                    style: TextStyle(color: Color(0xFF8EA3CC))),
                                style: const TextStyle(color: Colors.white),
                                items: _roles
                                    .where((r) => r['isDefault'] != true)
                                    .map(
                                      (r) => DropdownMenuItem<String>(
                                        value: r['_id']?.toString(),
                                        child: Text(
                                          r['name']?.toString() ?? '',
                                          overflow: TextOverflow.ellipsis,
                                        ),
                                      ),
                                    )
                                    .toList(),
                                onChanged: _canEdit
                                    ? (v) => setState(() => _notifRoleId = v)
                                    : null,
                              ),
                            ],
                            const SizedBox(height: 14),
                            FilledButton(
                              onPressed: _canEdit ? _sendRoleNotif : null,
                              style: FilledButton.styleFrom(
                                backgroundColor: const Color(0xFF5865F2),
                              ),
                              child: const Text('Gửi thông báo'),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
    );
  }

  String? _effectiveChannelId() {
    final id = _settings?['systemChannelId']?.toString();
    if (id == null || id.isEmpty) return null;
    final exists = _textChannels.any((c) => c.id == id);
    return exists ? id : null;
  }

  InputDecoration _fieldDec(String h) => InputDecoration(
        hintText: h,
        hintStyle: const TextStyle(color: Color(0xFF6B7A99)),
        filled: true,
        fillColor: _card,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
      );

  InputDecoration _dropdownDec() => InputDecoration(
        filled: true,
        fillColor: _card,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
      );

  Widget _cardBlock({required String title, required Widget child}) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: _card,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w800,
              fontSize: 15,
            ),
          ),
          const SizedBox(height: 12),
          child,
        ],
      ),
    );
  }
}
