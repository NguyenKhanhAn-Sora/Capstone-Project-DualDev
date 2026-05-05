import 'package:flutter/material.dart';

import '../services/servers_service.dart';

class ServerBansScreen extends StatefulWidget {
  const ServerBansScreen({
    super.key,
    required this.serverId,
    required this.canUnban,
  });

  final String serverId;
  final bool canUnban;

  @override
  State<ServerBansScreen> createState() => _ServerBansScreenState();
}

class _ServerBansScreenState extends State<ServerBansScreen> {
  static const Color _bg = Color(0xFF08183A);
  static const Color _card = Color(0xFF0E1F45);

  List<Map<String, dynamic>> _rows = [];
  bool _loading = true;
  String? _error;
  final _search = TextEditingController();

  @override
  void dispose() {
    _search.dispose();
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
      final list = await ServersService.getBannedUsers(widget.serverId);
      if (!mounted) return;
      setState(() => _rows = list);
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  List<Map<String, dynamic>> get _filtered {
    final q = _search.text.trim().toLowerCase();
    if (q.isEmpty) return _rows;
    return _rows.where((r) {
      final u = (r['username'] ?? '').toString().toLowerCase();
      final d = (r['displayName'] ?? '').toString().toLowerCase();
      final id = (r['userId'] ?? '').toString().toLowerCase();
      return u.contains(q) || d.contains(q) || id.contains(q);
    }).toList();
  }

  Future<void> _unban(String userId) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        backgroundColor: const Color(0xFF152A52),
        title: const Text('Gỡ cấm?', style: TextStyle(color: Colors.white)),
        content: const Text(
          'Người này có thể tham gia lại bằng lời mời.',
          style: TextStyle(color: Color(0xFFB8C8E8)),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Huỷ')),
          TextButton(
            onPressed: () => Navigator.pop(c, true),
            child: const Text('Gỡ cấm', style: TextStyle(color: Color(0xFF7FB6FF))),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    try {
      await ServersService.unbanMember(widget.serverId, userId);
      await _load();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Đã gỡ cấm')),
        );
      }
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
        title: const Text('Danh sách ban', style: TextStyle(fontWeight: FontWeight.w800)),
        actions: [
          IconButton(onPressed: _loading ? null : _load, icon: const Icon(Icons.refresh)),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: EdgeInsets.fromLTRB(hPad, 10, hPad, 8),
            child: TextField(
              controller: _search,
              onChanged: (_) => setState(() {}),
              style: const TextStyle(color: Colors.white),
              decoration: InputDecoration(
                hintText: 'Tìm theo tên hoặc user ID',
                hintStyle: const TextStyle(color: Color(0xFF6B7A99)),
                filled: true,
                fillColor: _card,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide.none,
                ),
                prefixIcon: const Icon(Icons.search, color: Color(0xFF8EA3CC)),
              ),
            ),
          ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _error != null
                    ? Center(child: Text(_error!))
                    : _filtered.isEmpty
                        ? const Center(
                            child: Text(
                              'Không có lệnh cấm',
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
                            itemCount: _filtered.length,
                            itemBuilder: (context, i) {
                              final r = _filtered[i];
                              final uid = (r['userId'] ?? '').toString();
                              final name =
                                  (r['displayName'] ?? r['username'] ?? uid)
                                      .toString();
                              final reason = (r['reason'] ?? '').toString();
                              return Padding(
                                padding: const EdgeInsets.only(bottom: 10),
                                child: Material(
                                  color: _card,
                                  borderRadius: BorderRadius.circular(12),
                                  child: ListTile(
                                    leading: CircleAvatar(
                                      backgroundColor: const Color(0xFF21345D),
                                      backgroundImage:
                                          (r['avatarUrl']?.toString().isNotEmpty ==
                                                  true)
                                              ? NetworkImage(
                                                  r['avatarUrl'].toString(),
                                                )
                                              : null,
                                      child: r['avatarUrl'] == null
                                          ? Text(
                                              name.isNotEmpty
                                                  ? name[0].toUpperCase()
                                                  : '?',
                                              style: const TextStyle(
                                                color: Colors.white,
                                                fontWeight: FontWeight.w700,
                                              ),
                                            )
                                          : null,
                                    ),
                                    title: Text(
                                      name,
                                      style: const TextStyle(
                                        color: Colors.white,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                    subtitle: Text(
                                      reason.isEmpty ? '@${r['username']}' : reason,
                                      maxLines: 2,
                                      overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(
                                        color: Color(0xFF8EA3CC),
                                        fontSize: 12,
                                      ),
                                    ),
                                    trailing: widget.canUnban
                                        ? TextButton(
                                            onPressed: () => _unban(uid),
                                            child: const Text(
                                              'Gỡ cấm',
                                              style: TextStyle(
                                                color: Color(0xFF7FB6FF),
                                              ),
                                            ),
                                          )
                                        : null,
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
