import 'package:flutter/material.dart';

import 'models/server_role_models.dart';
import 'services/servers_service.dart';

/// Danh sách thành viên + kiểm duyệt (kick / ban / timeout) — cùng API web.
class ServerMembersScreen extends StatefulWidget {
  const ServerMembersScreen({
    super.key,
    required this.serverId,
    this.currentUserId,
  });

  final String serverId;
  final String? currentUserId;

  @override
  State<ServerMembersScreen> createState() => _ServerMembersScreenState();
}

class _ServerMembersScreenState extends State<ServerMembersScreen> {
  static const Color _bg = Color(0xFF08183A);
  static const Color _card = Color(0xFF0E1F45);

  MembersWithRolesResult? _data;
  bool _loading = true;
  String? _error;
  final _search = TextEditingController();

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final res = await ServersService.getServerMembersWithRoles(widget.serverId);
      if (!mounted) return;
      setState(() => _data = res);
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  List<MemberWithRolesRow> get _filtered {
    final d = _data;
    if (d == null) return [];
    final q = _search.text.trim().toLowerCase();
    if (q.isEmpty) return d.members;
    return d.members.where((m) {
      return m.displayName.toLowerCase().contains(q) ||
          m.username.toLowerCase().contains(q);
    }).toList();
  }

  bool _canModerate(MemberWithRolesRow m, MembersWithRolesResult ctx) {
    final uid = widget.currentUserId ?? '';
    if (uid.isEmpty) return false;
    if (m.userId == uid) return false;
    if (m.isOwner) return false;
    return ctx.canKick || ctx.canBan || ctx.canTimeout;
  }

  Future<void> _kick(MemberWithRolesRow m) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        backgroundColor: const Color(0xFF152A52),
        title: const Text('Đuổi thành viên?', style: TextStyle(color: Colors.white)),
        content: Text(
          '${m.displayName} sẽ bị đuổi khỏi máy chủ.',
          style: const TextStyle(color: Color(0xFFB8C8E8)),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Huỷ')),
          TextButton(
            onPressed: () => Navigator.pop(c, true),
            child: const Text('Đuổi', style: TextStyle(color: Color(0xFFFF6B7A))),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    try {
      await ServersService.kickMember(widget.serverId, m.userId);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Đã đuổi thành viên.')),
      );
      await _load();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
      }
    }
  }

  Future<void> _ban(MemberWithRolesRow m) async {
    final reasonCtrl = TextEditingController();
    final daysCtrl = TextEditingController(text: '0');
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        backgroundColor: const Color(0xFF152A52),
        title: const Text('Cấm thành viên', style: TextStyle(color: Colors.white)),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                m.displayName,
                style: const TextStyle(color: Color(0xFFB8C8E8)),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: reasonCtrl,
                style: const TextStyle(color: Colors.white),
                decoration: const InputDecoration(
                  labelText: 'Lý do (tuỳ chọn)',
                  labelStyle: TextStyle(color: Color(0xFF8EA3CC)),
                ),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: daysCtrl,
                keyboardType: TextInputType.number,
                style: const TextStyle(color: Colors.white),
                decoration: const InputDecoration(
                  labelText: 'Xóa tin nhắn (ngày, 0–7)',
                  labelStyle: TextStyle(color: Color(0xFF8EA3CC)),
                ),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Huỷ')),
          TextButton(
            onPressed: () => Navigator.pop(c, true),
            child: const Text('Cấm', style: TextStyle(color: Color(0xFFFF6B7A))),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) {
      reasonCtrl.dispose();
      daysCtrl.dispose();
      return;
    }
    var dd = int.tryParse(daysCtrl.text.trim()) ?? 0;
    if (dd < 0) dd = 0;
    if (dd > 7) dd = 7;
    try {
      await ServersService.banMember(
        widget.serverId,
        m.userId,
        reason: reasonCtrl.text.trim().isEmpty ? null : reasonCtrl.text.trim(),
        deleteMessageDays: dd > 0 ? dd : null,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Đã cấm thành viên.')),
      );
      await _load();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
      }
    } finally {
      reasonCtrl.dispose();
      daysCtrl.dispose();
    }
  }

  Future<void> _timeout(MemberWithRolesRow m) async {
    const options = <int, String>{
      60: '1 phút',
      300: '5 phút',
      3600: '1 giờ',
      86400: '1 ngày',
      604800: '7 ngày',
    };
    int? picked;
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: _card,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (c) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Padding(
              padding: EdgeInsets.all(16),
              child: Text(
                'Timeout',
                style: TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w800,
                  fontSize: 16,
                ),
              ),
            ),
            for (final e in options.entries)
              ListTile(
                title: Text(e.value, style: const TextStyle(color: Colors.white)),
                onTap: () {
                  picked = e.key;
                  Navigator.pop(c);
                },
              ),
          ],
        ),
      ),
    );
    final dur = picked;
    if (dur == null || !mounted) return;
    try {
      await ServersService.timeoutMember(widget.serverId, m.userId, dur);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Đã áp dụng timeout.')),
      );
      await _load();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
      }
    }
  }

  void _openActions(MemberWithRolesRow m, MembersWithRolesResult ctx) {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: _card,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (c) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: const EdgeInsets.all(16),
              child: Text(
                m.displayName,
                style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w700,
                  fontSize: 16,
                ),
              ),
            ),
            if (ctx.canKick)
              ListTile(
                leading: const Icon(Icons.exit_to_app_rounded, color: Color(0xFFFFB4B4)),
                title: const Text('Đuổi', style: TextStyle(color: Colors.white)),
                onTap: () {
                  Navigator.pop(c);
                  _kick(m);
                },
              ),
            if (ctx.canBan)
              ListTile(
                leading: const Icon(Icons.block_rounded, color: Color(0xFFFF8A8A)),
                title: const Text('Cấm', style: TextStyle(color: Colors.white)),
                onTap: () {
                  Navigator.pop(c);
                  _ban(m);
                },
              ),
            if (ctx.canTimeout)
              ListTile(
                leading: const Icon(Icons.timer_outlined, color: Color(0xFFFFD54F)),
                title: const Text('Timeout', style: TextStyle(color: Colors.white)),
                onTap: () {
                  Navigator.pop(c);
                  _timeout(m);
                },
              ),
            ListTile(
              title: const Text('Đóng', style: TextStyle(color: Color(0xFF8EA3CC))),
              onTap: () => Navigator.pop(c),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final pad = MediaQuery.paddingOf(context);
    final mq = MediaQuery.of(context);
    final horizontal = mq.size.width > 520 ? 24.0 : 14.0;

    return Scaffold(
      backgroundColor: _bg,
      appBar: AppBar(
        backgroundColor: _bg,
        title: const Text('Thành viên', style: TextStyle(fontWeight: FontWeight.w800)),
        actions: [
          IconButton(
            tooltip: 'Làm mới',
            onPressed: _loading ? null : _load,
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
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
                        const SizedBox(height: 16),
                        FilledButton(
                          onPressed: _load,
                          child: const Text('Thử lại'),
                        ),
                      ],
                    ),
                  ),
                )
              : Builder(
                  builder: (context) {
                    final ctx = _data!;
                    final rows = _filtered;
                    return Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Padding(
                          padding: EdgeInsets.fromLTRB(horizontal, 8, horizontal, 8),
                          child: TextField(
                            controller: _search,
                            onChanged: (_) => setState(() {}),
                            style: const TextStyle(color: Colors.white),
                            decoration: InputDecoration(
                              hintText: 'Tìm theo tên hoặc @username',
                              hintStyle: const TextStyle(color: Color(0xFF6B7A99)),
                              filled: true,
                              fillColor: _card,
                              border: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(12),
                                borderSide: BorderSide.none,
                              ),
                              prefixIcon: const Icon(Icons.search_rounded, color: Color(0xFF8EA3CC)),
                              contentPadding: const EdgeInsets.symmetric(
                                horizontal: 12,
                                vertical: 12,
                              ),
                            ),
                          ),
                        ),
                        Expanded(
                          child: rows.isEmpty
                              ? const Center(
                                  child: Text(
                                    'Không có thành viên khớp.',
                                    style: TextStyle(color: Color(0xFF8EA3CC)),
                                  ),
                                )
                              : ListView.builder(
                                  padding: EdgeInsets.fromLTRB(
                                    horizontal,
                                    0,
                                    horizontal,
                                    pad.bottom + 24,
                                  ),
                                  itemCount: rows.length,
                                  itemBuilder: (context, i) {
                                    final m = rows[i];
                                    final mod = _canModerate(m, ctx);
                                    return Padding(
                                      padding: const EdgeInsets.only(bottom: 8),
                                      child: Material(
                                        color: _card,
                                        borderRadius: BorderRadius.circular(12),
                                        child: InkWell(
                                          borderRadius: BorderRadius.circular(12),
                                          onTap: mod
                                              ? () => _openActions(m, ctx)
                                              : null,
                                          child: Padding(
                                            padding: const EdgeInsets.symmetric(
                                              horizontal: 12,
                                              vertical: 10,
                                            ),
                                            child: Row(
                                              children: [
                                                CircleAvatar(
                                                  radius: 22,
                                                  backgroundColor: const Color(0xFF21345D),
                                                  backgroundImage: m.avatarUrl.isNotEmpty
                                                      ? NetworkImage(m.avatarUrl)
                                                      : null,
                                                  child: m.avatarUrl.isEmpty
                                                      ? Text(
                                                          m.displayName.isNotEmpty
                                                              ? m.displayName[0].toUpperCase()
                                                              : '?',
                                                          style: const TextStyle(
                                                            color: Colors.white,
                                                            fontWeight: FontWeight.w700,
                                                          ),
                                                        )
                                                      : null,
                                                ),
                                                const SizedBox(width: 12),
                                                Expanded(
                                                  child: Column(
                                                    crossAxisAlignment:
                                                        CrossAxisAlignment.start,
                                                    children: [
                                                      Row(
                                                        children: [
                                                          Flexible(
                                                            child: Text(
                                                              m.displayName,
                                                              maxLines: 1,
                                                              overflow: TextOverflow.ellipsis,
                                                              style: const TextStyle(
                                                                color: Colors.white,
                                                                fontWeight: FontWeight.w700,
                                                              ),
                                                            ),
                                                          ),
                                                          if (m.isOwner) ...[
                                                            const SizedBox(width: 6),
                                                            Container(
                                                              padding:
                                                                  const EdgeInsets.symmetric(
                                                                horizontal: 6,
                                                                vertical: 2,
                                                              ),
                                                              decoration: BoxDecoration(
                                                                color: const Color(0xFF00C48C)
                                                                    .withOpacity(0.25),
                                                                borderRadius:
                                                                    BorderRadius.circular(6),
                                                              ),
                                                              child: const Text(
                                                                'Chủ',
                                                                style: TextStyle(
                                                                  fontSize: 10,
                                                                  fontWeight: FontWeight.w800,
                                                                  color: Color(0xFF00C48C),
                                                                ),
                                                              ),
                                                            ),
                                                          ],
                                                        ],
                                                      ),
                                                      const SizedBox(height: 2),
                                                      Text(
                                                        '@${m.username}',
                                                        style: const TextStyle(
                                                          fontSize: 13,
                                                          color: Color(0xFF8EA3CC),
                                                        ),
                                                      ),
                                                      if (m.serverMemberRole.isNotEmpty)
                                                        Padding(
                                                          padding: const EdgeInsets.only(top: 4),
                                                          child: Text(
                                                            m.serverMemberRole,
                                                            maxLines: 1,
                                                            overflow: TextOverflow.ellipsis,
                                                            style: const TextStyle(
                                                              fontSize: 12,
                                                              color: Color(0xFF7FB6FF),
                                                            ),
                                                          ),
                                                        ),
                                                    ],
                                                  ),
                                                ),
                                                if (mod)
                                                  const Icon(
                                                    Icons.more_horiz_rounded,
                                                    color: Color(0xFF8EA3CC),
                                                  ),
                                              ],
                                            ),
                                          ),
                                        ),
                                      ),
                                    );
                                  },
                                ),
                        ),
                      ],
                    );
                  },
                ),
    );
  }
}
