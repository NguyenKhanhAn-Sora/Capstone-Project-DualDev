import 'package:flutter/material.dart';

import '../models/server_role_models.dart';
import '../services/servers_service.dart';

/// Nhật ký chỉnh sửa máy chủ — mirrors web `AuditLogSection`.
class ServerAuditLogScreen extends StatefulWidget {
  const ServerAuditLogScreen({super.key, required this.serverId});

  final String serverId;

  @override
  State<ServerAuditLogScreen> createState() => _ServerAuditLogScreenState();
}

class _ServerAuditLogScreenState extends State<ServerAuditLogScreen> {
  static const Color _bg = Color(0xFF08183A);
  static const Color _card = Color(0xFF0E1F45);

  static const _actions = <Map<String, String>>[
    {'value': '', 'label': 'Tất cả hành động'},
    {'value': 'server.update', 'label': 'Cập nhật máy chủ'},
    {'value': 'channel.create', 'label': 'Tạo kênh'},
    {'value': 'channel.update', 'label': 'Cập nhật kênh'},
    {'value': 'channel.delete', 'label': 'Xóa kênh'},
  ];

  List<Map<String, dynamic>> _rows = [];
  List<Map<String, dynamic>> _members = [];
  bool _loading = true;
  String? _error;
  String _action = '';
  String _actorUserId = '';

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
      final results = await Future.wait([
        ServersService.getServerAuditLogs(
          widget.serverId,
          action: _action.isEmpty ? null : _action,
          actorUserId: _actorUserId.isEmpty ? null : _actorUserId,
        ),
        ServersService.getServerMembersWithRoles(widget.serverId),
      ]);
      if (!mounted) return;
      setState(() {
        _rows = results[0] as List<Map<String, dynamic>>;
        final mwr = results[1];
        if (mwr is MembersWithRolesResult) {
          _members = mwr.members
              .map(
                (m) => {
                  'userId': m.userId,
                  'label': m.displayName.isNotEmpty ? m.displayName : m.username,
                },
              )
              .toList();
        }
      });
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
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
        title: const Text(
          'Nhật ký chỉnh sửa',
          style: TextStyle(fontWeight: FontWeight.w800),
        ),
        actions: [
          IconButton(
            onPressed: _loading ? null : _load,
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: EdgeInsets.fromLTRB(hPad, 10, hPad, 8),
            child: Row(
              children: [
                Expanded(
                  child: DropdownButtonFormField<String>(
                    value: _actorUserId.isEmpty ? '' : _actorUserId,
                    dropdownColor: _card,
                    style: const TextStyle(color: Colors.white, fontSize: 13),
                    decoration: InputDecoration(
                      filled: true,
                      fillColor: _card,
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(10),
                        borderSide: BorderSide.none,
                      ),
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 8,
                      ),
                    ),
                    items: [
                      const DropdownMenuItem(
                        value: '',
                        child: Text('Tất cả người dùng'),
                      ),
                      ..._members.map(
                        (m) => DropdownMenuItem(
                          value: m['userId']?.toString() ?? '',
                          child: Text(
                            m['label']?.toString() ?? '',
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ),
                    ],
                    onChanged: (v) {
                      setState(() => _actorUserId = v ?? '');
                      _load();
                    },
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: DropdownButtonFormField<String>(
                    value: _action,
                    dropdownColor: _card,
                    style: const TextStyle(color: Colors.white, fontSize: 13),
                    decoration: InputDecoration(
                      filled: true,
                      fillColor: _card,
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(10),
                        borderSide: BorderSide.none,
                      ),
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 8,
                      ),
                    ),
                    items: _actions
                        .map(
                          (a) => DropdownMenuItem(
                            value: a['value']!,
                            child: Text(
                              a['label']!,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        )
                        .toList(),
                    onChanged: (v) {
                      setState(() => _action = v ?? '');
                      _load();
                    },
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _error != null
                ? Center(child: Text(_error!))
                : _rows.isEmpty
                ? const Center(
                    child: Text(
                      'Không có bản ghi',
                      style: TextStyle(color: Color(0xFF8EA3CC)),
                    ),
                  )
                : ListView.builder(
                    padding: EdgeInsets.fromLTRB(
                      hPad,
                      0,
                      hPad,
                      pad.bottom + 16,
                    ),
                    itemCount: _rows.length,
                    itemBuilder: (context, i) {
                      final row = _rows[i];
                      final action = (row['action'] ?? '').toString();
                      final target = (row['targetName'] ?? '').toString();
                      final created = DateTime.tryParse(
                        row['createdAt']?.toString() ?? '',
                      );
                      final changes = row['changes'];
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: Material(
                          color: _card,
                          borderRadius: BorderRadius.circular(12),
                          child: Padding(
                            padding: const EdgeInsets.all(14),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  target.isEmpty ? action : '$action — $target',
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                                if (created != null)
                                  Padding(
                                    padding: const EdgeInsets.only(top: 4),
                                    child: Text(
                                      '${created.toLocal()}',
                                      style: const TextStyle(
                                        color: Color(0xFF8EA3CC),
                                        fontSize: 12,
                                      ),
                                    ),
                                  ),
                                if (changes is List)
                                  ...changes.whereType<Map>().map((c) {
                                    final field = c['field']?.toString() ?? '';
                                    final from = c['from']?.toString() ?? '';
                                    final to = c['to']?.toString() ?? '';
                                    return Padding(
                                      padding: const EdgeInsets.only(top: 6),
                                      child: Text(
                                        '$field: "$from" → "$to"',
                                        style: const TextStyle(
                                          color: Color(0xFFB8C8E8),
                                          fontSize: 13,
                                        ),
                                      ),
                                    );
                                  }),
                              ],
                            ),
                          ),
                        ),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}
