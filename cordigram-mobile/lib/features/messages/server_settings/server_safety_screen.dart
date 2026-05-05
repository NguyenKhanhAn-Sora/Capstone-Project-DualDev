import 'dart:convert';

import 'package:flutter/material.dart';

import '../services/servers_service.dart';

/// Mức xác minh + lọc nội dung nhạy cảm — PATCH `/safety-settings`.
class ServerSafetyScreen extends StatefulWidget {
  const ServerSafetyScreen({
    super.key,
    required this.serverId,
    required this.canManage,
  });

  final String serverId;
  final bool canManage;

  @override
  State<ServerSafetyScreen> createState() => _ServerSafetyScreenState();
}

class _ServerSafetyScreenState extends State<ServerSafetyScreen> {
  static const Color _bg = Color(0xFF08183A);
  static const Color _card = Color(0xFF0E1F45);

  Map<String, dynamic> _doc = {};
  bool _loading = true;
  String? _error;

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
      setState(() => _doc = Map<String, dynamic>.from(
            jsonDecode(jsonEncode(m)) as Map,
          ));
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _patch(Map<String, dynamic> patch) async {
    if (!widget.canManage) return;
    try {
      final saved =
          await ServersService.patchServerSafetySettings(widget.serverId, patch);
      if (!mounted) return;
      setState(() => _doc = Map<String, dynamic>.from(
            jsonDecode(jsonEncode(saved)) as Map,
          ));
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
      }
    }
  }

  String _verifyLevel() {
    final sp = _doc['spamProtection'];
    if (sp is Map && sp['verificationLevel'] != null) {
      return sp['verificationLevel'].toString();
    }
    return 'none';
  }

  String _filterLevel() {
    final cf = _doc['contentFilter'];
    if (cf is Map && cf['level'] != null) return cf['level'].toString();
    return 'none';
  }

  Future<void> _pickVerification(String level) async {
    final sp = Map<String, dynamic>.from(
      (_doc['spamProtection'] as Map?) ?? {},
    );
    sp['verificationLevel'] = level;
    await _patch({'spamProtection': sp});
  }

  Future<void> _pickFilter(String level) async {
    final cf = Map<String, dynamic>.from(
      (_doc['contentFilter'] as Map?) ?? {},
    );
    cf['level'] = level;
    await _patch({'contentFilter': cf});
  }

  @override
  Widget build(BuildContext context) {
    final pad = MediaQuery.paddingOf(context);
    final hPad = MediaQuery.sizeOf(context).width > 520 ? 24.0 : 14.0;

    const verifyOpts = <Map<String, String>>[
      {'id': 'none', 't': 'Không', 'd': 'Không yêu cầu thêm.'},
      {'id': 'low', 't': 'Thấp', 'd': 'Phải có email đã xác minh.'},
      {'id': 'medium', 't': 'Trung bình', 'd': 'Tài khoản đủ “tuổi”.'},
      {'id': 'high', 't': 'Cao', 'd': 'Đã là thành viên > 10 phút.'},
    ];

    const filterOpts = <Map<String, String>>[
      {'id': 'all_members', 't': 'Lọc mọi người', 'd': 'Quét media nhạy cảm cho mọi tin.'},
      {'id': 'no_role_members', 't': 'Người không vai trò', 'd': 'Chỉ lọc thành viên chỉ có @everyone.'},
      {'id': 'none', 't': 'Tắt', 'd': 'Không lọc tự động.'},
    ];

    return Scaffold(
      backgroundColor: _bg,
      appBar: AppBar(
        backgroundColor: _bg,
        title: const Text(
          'Thiết lập an toàn',
          style: TextStyle(fontWeight: FontWeight.w800),
        ),
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
                      _sectionTitle('Mức xác minh'),
                      _sectionBody(
                        'Áp dụng khi gửi tin / DM tùy cấu hình máy chủ.',
                      ),
                      ...verifyOpts.map((o) => _radioTile(
                            selected: _verifyLevel() == o['id'],
                            title: o['t'] ?? '',
                            subtitle: o['d'] ?? '',
                            onTap: widget.canManage
                                ? () => _pickVerification(o['id']!)
                                : null,
                          )),
                      const SizedBox(height: 20),
                      _sectionTitle('Lọc nội dung nhạy cảm'),
                      _sectionBody(
                        'Kiểm soát ảnh/video nhạy cảm trong kênh không giới hạn tuổi.',
                      ),
                      ...filterOpts.map((o) => _radioTile(
                            selected: _filterLevel() == o['id'],
                            title: o['t'] ?? '',
                            subtitle: o['d'] ?? '',
                            onTap:
                                widget.canManage ? () => _pickFilter(o['id']!) : null,
                          )),
                    ],
                  ),
                ),
    );
  }

  Widget _sectionTitle(String t) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Text(
          t,
          style: const TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.w800,
            fontSize: 16,
          ),
        ),
      );

  Widget _sectionBody(String t) => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: Text(
          t,
          style: const TextStyle(color: Color(0xFF8EA3CC), fontSize: 13, height: 1.4),
        ),
      );

  Widget _radioTile({
    required bool selected,
    required String title,
    required String subtitle,
    required VoidCallback? onTap,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: _card,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              children: [
                Icon(
                  selected
                      ? Icons.radio_button_checked_rounded
                      : Icons.radio_button_off_rounded,
                  color: selected
                      ? const Color(0xFF00C48C)
                      : const Color(0xFF6B7A99),
                ),
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
                        subtitle,
                        style: const TextStyle(
                          color: Color(0xFF8EA3CC),
                          fontSize: 12,
                          height: 1.35,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
