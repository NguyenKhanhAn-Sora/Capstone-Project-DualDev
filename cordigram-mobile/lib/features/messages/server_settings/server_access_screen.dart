import 'package:flutter/material.dart';

import '../services/servers_service.dart';

/// Chế độ tham gia, quy định, đơn đăng ký — đồng bộ web `ServerAccessSection`.
class ServerAccessScreen extends StatefulWidget {
  const ServerAccessScreen({
    super.key,
    required this.serverId,
    required this.canManage,
  });

  final String serverId;
  final bool canManage;

  @override
  State<ServerAccessScreen> createState() => _ServerAccessScreenState();
}

class _ServerAccessScreenState extends State<ServerAccessScreen> {
  static const Color _bg = Color(0xFF08183A);
  static const Color _cardBg = Color(0xFF0E1F45);

  Map<String, dynamic>? _access;
  Map<String, dynamic>? _joinForm;
  bool _loading = true;
  String? _error;
  final _ruleDraft = TextEditingController();

  @override
  void dispose() {
    _ruleDraft.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final a = await ServersService.getServerAccessSettings(widget.serverId);
      Map<String, dynamic> j;
      try {
        j = await ServersService.getJoinApplicationForm(widget.serverId);
      } catch (_) {
        j = {'enabled': false, 'questions': <dynamic>[]};
      }
      if (!mounted) return;
      setState(() {
        _access = Map<String, dynamic>.from(a);
        _joinForm = Map<String, dynamic>.from(j);
      });
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _setMode(String mode) async {
    if (!widget.canManage) return;
    try {
      await ServersService.patchServerAccessSettings(
        widget.serverId,
        accessMode: mode,
      );
      await _load();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
      }
    }
  }

  Future<void> _toggleAge(bool v) async {
    if (!widget.canManage) return;
    try {
      await ServersService.patchServerAccessSettings(
        widget.serverId,
        isAgeRestricted: v,
      );
      await _load();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
      }
    }
  }

  Future<void> _toggleRules(bool v) async {
    if (!widget.canManage) return;
    try {
      await ServersService.patchServerAccessSettings(
        widget.serverId,
        hasRules: v,
      );
      await _load();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
      }
    }
  }

  Future<void> _addRule() async {
    final text = _ruleDraft.text.trim();
    if (text.isEmpty || !widget.canManage) return;
    try {
      await ServersService.postAccessRule(widget.serverId, text);
      _ruleDraft.clear();
      await _load();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Đã thêm quy định')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
      }
    }
  }

  Future<void> _setJoinEnabled(bool v) async {
    if (!widget.canManage) return;
    try {
      final next = await ServersService.patchJoinApplicationForm(
        widget.serverId,
        {'enabled': v},
      );
      if (!mounted) return;
      setState(() => _joinForm = Map<String, dynamic>.from(next));
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
        title: const Text('Truy cập', style: TextStyle(fontWeight: FontWeight.w800)),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!))
              : RefreshIndicator(
                  onRefresh: _load,
                  color: const Color(0xFF7FB6FF),
                  child: ListView(
                    padding: EdgeInsets.fromLTRB(hPad, 12, hPad, pad.bottom + 24),
                    children: [
                      _modeSection(),
                      const SizedBox(height: 16),
                      _sectionCard(
                        title: 'Khám phá máy chủ',
                        child: const Text(
                          'Điều kiện hiển thị trên Khám phá do backend kiểm tra (thành viên, tuổi máy chủ, v.v.).',
                          style: TextStyle(color: Color(0xFF8EA3CC), height: 1.4),
                        ),
                      ),
                      const SizedBox(height: 16),
                      SwitchListTile(
                        contentPadding: EdgeInsets.zero,
                        tileColor: _cardBg,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        title: const Text('Giới hạn độ tuổi (18+)',
                            style: TextStyle(color: Colors.white)),
                        subtitle: const Text(
                          'Chặn người dưới 18 tham gia (theo cài đặt backend).',
                          style: TextStyle(color: Color(0xFF8EA3CC), fontSize: 12),
                        ),
                        value: _access?['isAgeRestricted'] == true,
                        onChanged: widget.canManage ? _toggleAge : null,
                        activeThumbColor: const Color(0xFF00C48C),
                      ),
                      const SizedBox(height: 12),
                      SwitchListTile(
                        contentPadding: EdgeInsets.zero,
                        tileColor: _cardBg,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        title: const Text('Bật quy định máy chủ',
                            style: TextStyle(color: Colors.white)),
                        value: _access?['hasRules'] == true,
                        onChanged: widget.canManage ? _toggleRules : null,
                        activeThumbColor: const Color(0xFF00C48C),
                      ),
                      const SizedBox(height: 12),
                      _sectionCard(
                        title: 'Quy định',
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            ..._rulesList(),
                            if (widget.canManage) ...[
                              const SizedBox(height: 10),
                              TextField(
                                controller: _ruleDraft,
                                style: const TextStyle(color: Colors.white),
                                decoration: InputDecoration(
                                  hintText: 'Nội dung quy định mới',
                                  hintStyle: const TextStyle(color: Color(0xFF6B7A99)),
                                  filled: true,
                                  fillColor: const Color(0xFF152A52),
                                  border: OutlineInputBorder(
                                    borderRadius: BorderRadius.circular(10),
                                  ),
                                ),
                              ),
                              const SizedBox(height: 8),
                              Align(
                                alignment: Alignment.centerRight,
                                child: FilledButton(
                                  onPressed: _addRule,
                                  style: FilledButton.styleFrom(
                                    backgroundColor: const Color(0xFF5865F2),
                                  ),
                                  child: const Text('Thêm quy định'),
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                      const SizedBox(height: 16),
                      _sectionCard(
                        title: 'Đơn đăng ký tham gia',
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            SwitchListTile(
                              contentPadding: EdgeInsets.zero,
                              title: const Text('Bật đơn đăng ký',
                                  style: TextStyle(color: Colors.white)),
                              value: _joinForm?['enabled'] == true,
                              onChanged:
                                  widget.canManage ? (v) => _setJoinEnabled(v) : null,
                              activeThumbColor: const Color(0xFF00C48C),
                            ),
                            const SizedBox(height: 8),
                            Text(
                              'Câu hỏi (${_questions.length}/tối đa do backend):',
                              style: const TextStyle(
                                color: Color(0xFF8EA3CC),
                                fontSize: 13,
                              ),
                            ),
                            ..._questions.map(
                              (q) => Padding(
                                padding: const EdgeInsets.only(top: 8),
                                child: Container(
                                  width: double.infinity,
                                  padding: const EdgeInsets.all(10),
                                  decoration: BoxDecoration(
                                    color: const Color(0xFF152A52),
                                    borderRadius: BorderRadius.circular(8),
                                  ),
                                  child: Text(
                                    q,
                                    style: const TextStyle(color: Colors.white70),
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
    );
  }

  List<String> get _questions {
    final raw = _joinForm?['questions'];
    if (raw is! List) return [];
    final out = <String>[];
    for (final e in raw) {
      if (e is Map && e['title'] != null) {
        out.add(e['title'].toString());
      }
    }
    return out;
  }

  List<Widget> _rulesList() {
    final raw = _access?['rules'];
    if (raw is! List || raw.isEmpty) {
      return [
        const Text(
          'Chưa có quy định.',
          style: TextStyle(color: Color(0xFF8EA3CC)),
        ),
      ];
    }
    return raw.asMap().entries.map((e) {
      final content = e.value is Map
          ? (e.value as Map)['content']?.toString() ?? ''
          : e.value.toString();
      return Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 26,
              height: 26,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: const Color(0xFF5865F2).withOpacity(0.35),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                '${e.key + 1}',
                style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w800,
                  fontSize: 12,
                ),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                content,
                style: const TextStyle(color: Colors.white70, height: 1.35),
              ),
            ),
          ],
        ),
      );
    }).toList();
  }

  Widget _modeSection() {
    final mode = (_access?['accessMode'] ?? 'invite_only').toString();
    Widget tile(String m, String title, String desc, IconData icon) {
      final sel = mode == m;
      return Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: Material(
          color: _cardBg,
          borderRadius: BorderRadius.circular(12),
          child: InkWell(
            borderRadius: BorderRadius.circular(12),
            onTap: widget.canManage ? () => _setMode(m) : null,
            child: Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: sel
                      ? const Color(0xFF5865F2)
                      : const Color(0xFF21345D),
                  width: sel ? 2 : 1,
                ),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(icon, color: const Color(0xFF8EA3CC), size: 28),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          title,
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          desc,
                          style: const TextStyle(
                            color: Color(0xFF8EA3CC),
                            fontSize: 13,
                            height: 1.35,
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (sel)
                    const Icon(Icons.check_circle_rounded,
                        color: Color(0xFF00C48C)),
                ],
              ),
            ),
          ),
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Cách tham gia',
          style: TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.w800,
            fontSize: 16,
          ),
        ),
        const SizedBox(height: 10),
        tile(
          'invite_only',
          'Chỉ lời mời',
          'Tham gia bằng link mời.',
          Icons.lock_outline_rounded,
        ),
        tile(
          'apply',
          'Đăng ký',
          'Gửi đơn, chủ/phê duyệt mới vào được.',
          Icons.assignment_outlined,
        ),
        tile(
          'discoverable',
          'Khám phá',
          'Người chơi có thể tìm thấy máy chủ qua Khám phá (nếu đủ điều kiện).',
          Icons.public_rounded,
        ),
      ],
    );
  }

  Widget _sectionCard({required String title, required Widget child}) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: _cardBg,
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
