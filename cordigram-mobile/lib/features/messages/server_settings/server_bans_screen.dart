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
  List<Map<String, dynamic>> _restricted = [];
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
      final banned = await ServersService.getBannedUsers(widget.serverId);
      List<Map<String, dynamic>> restricted = [];
      if (widget.canUnban) {
        restricted = await ServersService.getMentionRestrictedMembers(
          widget.serverId,
        );
      }
      if (!mounted) return;
      setState(() {
        _rows = banned;
        _restricted = restricted;
      });
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

  Future<void> _unrestrict(String userId) async {
    try {
      await ServersService.unrestrictMember(widget.serverId, userId);
      await _load();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Đã gỡ hạn chế đề cập')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
      }
    }
  }

  Widget _userTile({
    required Map<String, dynamic> r,
    required String uid,
    required String name,
    required String subtitle,
    required VoidCallback? onAction,
    required String actionLabel,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: _card,
        borderRadius: BorderRadius.circular(12),
        child: ListTile(
          leading: CircleAvatar(
            backgroundColor: const Color(0xFF21345D),
            backgroundImage: (r['avatarUrl']?.toString().isNotEmpty == true)
                ? NetworkImage(r['avatarUrl'].toString())
                : null,
            child: r['avatarUrl'] == null
                ? Text(
                    name.isNotEmpty ? name[0].toUpperCase() : '?',
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
            subtitle,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(color: Color(0xFF8EA3CC), fontSize: 12),
          ),
          trailing: onAction == null
              ? null
              : TextButton(
                  onPressed: onAction,
                  child: Text(
                    actionLabel,
                    style: const TextStyle(color: Color(0xFF7FB6FF)),
                  ),
                ),
        ),
      ),
    );
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
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
          ? Center(child: Text(_error!))
          : ListView(
              padding: EdgeInsets.fromLTRB(hPad, 10, hPad, pad.bottom + 16),
              children: [
                TextField(
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
                const SizedBox(height: 16),
                const Text(
                  'Đã cấm',
                  style: TextStyle(
                    color: Color(0xFF8EA3CC),
                    fontWeight: FontWeight.w800,
                    fontSize: 12,
                    letterSpacing: 0.5,
                  ),
                ),
                const SizedBox(height: 8),
                if (_filtered.isEmpty)
                  const Text(
                    'Không có lệnh cấm',
                    style: TextStyle(color: Color(0xFF8EA3CC)),
                  )
                else
                  ..._filtered.map((r) {
                    final uid = (r['userId'] ?? '').toString();
                    final name = (r['displayName'] ?? r['username'] ?? uid).toString();
                    final reason = (r['reason'] ?? '').toString();
                    return _userTile(
                      r: r,
                      uid: uid,
                      name: name,
                      subtitle: reason.isEmpty ? '@${r['username']}' : reason,
                      onAction: widget.canUnban ? () => _unban(uid) : null,
                      actionLabel: 'Gỡ cấm',
                    );
                  }),
                if (widget.canUnban && _restricted.isNotEmpty) ...[
                  const SizedBox(height: 20),
                  const Text(
                    'Hạn chế đề cập',
                    style: TextStyle(
                      color: Color(0xFF8EA3CC),
                      fontWeight: FontWeight.w800,
                      fontSize: 12,
                      letterSpacing: 0.5,
                    ),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'Thành viên bị AutoMod hạn chế @ — có thể gỡ tại đây.',
                    style: TextStyle(color: Color(0xFF8EA3CC), fontSize: 13),
                  ),
                  const SizedBox(height: 8),
                  ..._restricted.map((r) {
                    final uid = (r['userId'] ?? '').toString();
                    final name = (r['displayName'] ?? r['username'] ?? uid).toString();
                    return _userTile(
                      r: r,
                      uid: uid,
                      name: name,
                      subtitle: 'Hạn chế đề cập',
                      onAction: () => _unrestrict(uid),
                      actionLabel: 'Gỡ hạn chế',
                    );
                  }),
                ],
              ],
            ),
    );
  }
}
