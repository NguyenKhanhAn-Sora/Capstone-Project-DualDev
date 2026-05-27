import 'dart:convert';

import 'package:flutter/material.dart';

import '../models/server_models.dart';
import '../models/server_role_models.dart';
import '../services/servers_service.dart';

/// Chặn spam đề cập — lưu vào `automod.mentionSpamFilter` trong `/safety-settings`.
class ServerAutomodScreen extends StatefulWidget {
  const ServerAutomodScreen({
    super.key,
    required this.serverId,
    required this.canManage,
  });

  final String serverId;
  final bool canManage;

  @override
  State<ServerAutomodScreen> createState() => _ServerAutomodScreenState();
}

class _ServerAutomodScreenState extends State<ServerAutomodScreen> {
  static const Color _bg = Color(0xFF08183A);
  static const Color _card = Color(0xFF0E1F45);

  Map<String, dynamic> _full = {};
  Map<String, dynamic> _msf = {};
  bool _loading = true;
  String? _error;
  final _limitCtrl = TextEditingController();
  final _durationCtrl = TextEditingController();
  final _notifCtrl = TextEditingController();
  List<ServerChannel> _channels = [];
  List<ServerRole> _roles = [];

  List<String> get _exemptRoleIds =>
      List<String>.from(_msf['exemptRoleIds'] ?? []);
  List<String> get _exemptChannelIds =>
      List<String>.from(_msf['exemptChannelIds'] ?? []);

  @override
  void dispose() {
    _limitCtrl.dispose();
    _durationCtrl.dispose();
    _notifCtrl.dispose();
    super.dispose();
  }

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
      final m = await ServersService.getServerSafetySettings(widget.serverId);
      if (!mounted) return;
      final doc = Map<String, dynamic>.from(
        jsonDecode(jsonEncode(m)) as Map,
      );
      final am = doc['automod'];
      Map<String, dynamic> msf = {};
      if (am is Map && am['mentionSpamFilter'] is Map) {
        msf = Map<String, dynamic>.from(am['mentionSpamFilter'] as Map);
      }
      msf = {
        'enabled': msf['enabled'] == true,
        'mentionLimit': (msf['mentionLimit'] is num)
            ? (msf['mentionLimit'] as num).toInt()
            : 20,
        'responses': Map<String, dynamic>.from(
          (msf['responses'] as Map?) ??
              {
                'blockMessage': true,
                'sendWarning': false,
                'restrictMember': false,
              },
        ),
        'customNotification': msf['customNotification']?.toString() ?? '',
        'blockDurationHours': (msf['blockDurationHours'] is num)
            ? (msf['blockDurationHours'] as num).toInt()
            : 8,
        'exemptRoleIds': List<String>.from(msf['exemptRoleIds'] ?? []),
        'exemptChannelIds': List<String>.from(msf['exemptChannelIds'] ?? []),
      };
      _limitCtrl.text = '${msf['mentionLimit']}';
      _durationCtrl.text = '${msf['blockDurationHours']}';
      _notifCtrl.text = msf['customNotification']?.toString() ?? '';
      final ch = await ServersService.getServerChannels(widget.serverId);
      final roles = await ServersService.getRoles(widget.serverId);
      if (!mounted) return;
      setState(() {
        _full = doc;
        _msf = msf;
        _channels = ch;
        _roles = roles;
      });
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _save() async {
    if (!widget.canManage) return;
    final lim = int.tryParse(_limitCtrl.text.trim()) ?? 20;
    final dur = int.tryParse(_durationCtrl.text.trim()) ?? 8;
    final merged = Map<String, dynamic>.from(_full);
    final am = Map<String, dynamic>.from((merged['automod'] as Map?) ?? {});
    am['mentionSpamFilter'] = {
      ..._msf,
      'mentionLimit': lim,
      'blockDurationHours': dur,
      'customNotification': _notifCtrl.text.trim(),
    };
    merged['automod'] = am;
    try {
      final saved =
          await ServersService.patchServerSafetySettings(widget.serverId, merged);
      if (!mounted) return;
      setState(() => _full = Map<String, dynamic>.from(
            jsonDecode(jsonEncode(saved)) as Map,
          ));
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Đã lưu AutoMod')),
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final pad = MediaQuery.paddingOf(context);
    final hPad = MediaQuery.sizeOf(context).width > 520 ? 24.0 : 14.0;

    return Scaffold(
      backgroundColor: _bg,
      appBar: AppBar(
        backgroundColor: _bg,
        title: const Text('AutoMod', style: TextStyle(fontWeight: FontWeight.w800)),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!))
              : ListView(
                  padding: EdgeInsets.fromLTRB(hPad, 12, hPad, pad.bottom + 24),
                  children: [
                    Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: _card,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Container(
                            width: 44,
                            height: 44,
                            decoration: const BoxDecoration(
                              color: Color(0xFF5865F2),
                              shape: BoxShape.circle,
                            ),
                            alignment: Alignment.center,
                            child: const Text(
                              '@',
                              style: TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.w900,
                                fontSize: 20,
                              ),
                            ),
                          ),
                          const SizedBox(width: 12),
                          const Expanded(
                            child: Text(
                              'Chặn spam đề cập — giới hạn số lần @ vai trò và người dùng trong một tin.',
                              style: TextStyle(
                                color: Color(0xFF8EA3CC),
                                height: 1.4,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),
                    SwitchListTile(
                      tileColor: _card,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                      title: const Text('Bật lọc',
                          style: TextStyle(color: Colors.white)),
                      value: _msf['enabled'] == true,
                      onChanged: widget.canManage
                          ? (v) => setState(() => _msf['enabled'] = v)
                          : null,
                      activeThumbColor: const Color(0xFF00C48C),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _limitCtrl,
                      enabled: widget.canManage,
                      keyboardType: TextInputType.number,
                      style: const TextStyle(color: Colors.white),
                      decoration: InputDecoration(
                        labelText: 'Giới hạn đề cập / tin',
                        labelStyle: const TextStyle(color: Color(0xFF8EA3CC)),
                        filled: true,
                        fillColor: _card,
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(10),
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),
                    const Text(
                      'Phản hồi',
                      style: TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    CheckboxListTile(
                      title: const Text('Chặn tin nhắn',
                          style: TextStyle(color: Colors.white)),
                      value: (_msf['responses'] as Map)['blockMessage'] == true,
                      onChanged: widget.canManage
                          ? (v) => setState(() {
                                final r = Map<String, dynamic>.from(
                                  _msf['responses'] as Map,
                                );
                                r['blockMessage'] = v ?? false;
                                _msf['responses'] = r;
                              })
                          : null,
                      activeColor: const Color(0xFF5865F2),
                    ),
                    CheckboxListTile(
                      title: const Text('Cảnh báo',
                          style: TextStyle(color: Colors.white)),
                      value: (_msf['responses'] as Map)['sendWarning'] == true,
                      onChanged: widget.canManage
                          ? (v) => setState(() {
                                final r = Map<String, dynamic>.from(
                                  _msf['responses'] as Map,
                                );
                                r['sendWarning'] = v ?? false;
                                _msf['responses'] = r;
                              })
                          : null,
                      activeColor: const Color(0xFF5865F2),
                    ),
                    CheckboxListTile(
                      title: const Text('Hạn chế thành viên',
                          style: TextStyle(color: Colors.white)),
                      value:
                          (_msf['responses'] as Map)['restrictMember'] == true,
                      onChanged: widget.canManage
                          ? (v) => setState(() {
                                final r = Map<String, dynamic>.from(
                                  _msf['responses'] as Map,
                                );
                                r['restrictMember'] = v ?? false;
                                _msf['responses'] = r;
                              })
                          : null,
                      activeColor: const Color(0xFF5865F2),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _durationCtrl,
                      enabled: widget.canManage,
                      keyboardType: TextInputType.number,
                      style: const TextStyle(color: Colors.white),
                      decoration: InputDecoration(
                        labelText: 'Thời gian hạn chế (giờ)',
                        labelStyle: const TextStyle(color: Color(0xFF8EA3CC)),
                        filled: true,
                        fillColor: _card,
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(10),
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _notifCtrl,
                      enabled: widget.canManage,
                      maxLines: 2,
                      style: const TextStyle(color: Colors.white),
                      decoration: InputDecoration(
                        labelText: 'Thông báo tùy chỉnh (tuỳ chọn)',
                        labelStyle: const TextStyle(color: Color(0xFF8EA3CC)),
                        filled: true,
                        fillColor: _card,
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(10),
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),
                    const Text(
                      'Miễn trừ',
                      style: TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: [
                        ..._exemptRoleIds.map((id) {
                          final name = _roles
                              .where((r) => r.id == id)
                              .map((r) => r.name)
                              .firstOrNull;
                          return Chip(
                            label: Text('@${name ?? id}'),
                            deleteIcon: widget.canManage
                                ? const Icon(Icons.close, size: 16)
                                : null,
                            onDeleted: widget.canManage
                                ? () => setState(() {
                                      _msf['exemptRoleIds'] = _exemptRoleIds
                                          .where((x) => x != id)
                                          .toList();
                                    })
                                : null,
                          );
                        }),
                        if (widget.canManage)
                          ActionChip(
                            label: const Text('+ Vai trò'),
                            onPressed: () async {
                              final picked = await showModalBottomSheet<String>(
                                context: context,
                                backgroundColor: _card,
                                builder: (ctx) => SafeArea(
                                  child: ListView(
                                    shrinkWrap: true,
                                    children: _roles
                                        .where((r) => !r.isDefault)
                                        .where((r) => !_exemptRoleIds.contains(r.id))
                                        .map(
                                          (r) => ListTile(
                                            title: Text(
                                              r.name,
                                              style: const TextStyle(
                                                color: Colors.white,
                                              ),
                                            ),
                                            onTap: () => Navigator.pop(ctx, r.id),
                                          ),
                                        )
                                        .toList(),
                                  ),
                                ),
                              );
                              if (picked == null) return;
                              setState(() {
                                _msf['exemptRoleIds'] = [
                                  ..._exemptRoleIds,
                                  picked,
                                ];
                              });
                            },
                          ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: [
                        ..._exemptChannelIds.map((id) {
                          final name = _channels
                              .where((c) => c.id == id)
                              .map((c) => c.name)
                              .firstOrNull;
                          return Chip(
                            label: Text('#${name ?? id}'),
                            deleteIcon: widget.canManage
                                ? const Icon(Icons.close, size: 16)
                                : null,
                            onDeleted: widget.canManage
                                ? () => setState(() {
                                      _msf['exemptChannelIds'] =
                                          _exemptChannelIds
                                              .where((x) => x != id)
                                              .toList();
                                    })
                                : null,
                          );
                        }),
                        if (widget.canManage)
                          ActionChip(
                            label: const Text('+ Kênh'),
                            onPressed: () async {
                              final picked = await showModalBottomSheet<String>(
                                context: context,
                                backgroundColor: _card,
                                builder: (ctx) => SafeArea(
                                  child: ListView(
                                    shrinkWrap: true,
                                    children: _channels
                                        .where((c) => !_exemptChannelIds.contains(c.id))
                                        .map(
                                          (c) => ListTile(
                                            title: Text(
                                              '#${c.name}',
                                              style: const TextStyle(
                                                color: Colors.white,
                                              ),
                                            ),
                                            onTap: () => Navigator.pop(ctx, c.id),
                                          ),
                                        )
                                        .toList(),
                                  ),
                                ),
                              );
                              if (picked == null) return;
                              setState(() {
                                _msf['exemptChannelIds'] = [
                                  ..._exemptChannelIds,
                                  picked,
                                ];
                              });
                            },
                          ),
                      ],
                    ),
                    const SizedBox(height: 20),
                    FilledButton(
                      onPressed: widget.canManage ? _save : null,
                      style: FilledButton.styleFrom(
                        backgroundColor: const Color(0xFF5865F2),
                        minimumSize: const Size(double.infinity, 48),
                      ),
                      child: const Text('Lưu cài đặt'),
                    ),
                  ],
                ),
    );
  }
}
