import 'dart:convert';

import 'package:flutter/material.dart';

import '../services/servers_service.dart';

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
  static const List<String> _ruleTemplates = <String>[
    'Không spam hoặc quảng bá bản thân khi chưa được cho phép.',
    'Không có hành động bạo lực hoặc nội dung phản cảm.',
    'Giúp đảm bảo môi trường lành mạnh.',
    'Tôn trọng mọi thành viên trong máy chủ.',
  ];
  static const List<String> _questionTemplates = <String>[
    'Bạn tìm thấy chúng tôi bằng cách nào?',
    'Bạn có chơi trò chơi nào giống với chúng tôi không?',
    'Đâu là điểm độc nhất vô nhị của bạn?',
  ];

  bool _loading = true;
  bool _saving = false;
  String? _error;

  final _ruleDraft = TextEditingController();

  String _accessMode = 'invite_only';
  bool _isAgeRestricted = false;
  bool _hasRules = false;
  List<Map<String, dynamic>> _rules = <Map<String, dynamic>>[];
  bool _joinEnabled = false;
  List<Map<String, dynamic>> _questions = <Map<String, dynamic>>[];

  String _initialAccessMode = 'invite_only';
  bool _initialIsAgeRestricted = false;
  bool _initialHasRules = false;
  bool _initialJoinEnabled = false;
  List<Map<String, dynamic>> _initialQuestions = <Map<String, dynamic>>[];
  final List<String> _pendingRuleAdds = <String>[];

  @override
  void dispose() {
    _ruleDraft.dispose();
    super.dispose();
  }

  bool get _dirty {
    final q1 = jsonEncode(_normalizeQuestions(_questions));
    final q2 = jsonEncode(_normalizeQuestions(_initialQuestions));
    return _accessMode != _initialAccessMode ||
        _isAgeRestricted != _initialIsAgeRestricted ||
        _hasRules != _initialHasRules ||
        _joinEnabled != _initialJoinEnabled ||
        q1 != q2 ||
        _pendingRuleAdds.isNotEmpty;
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
      final rulesRaw = (a['rules'] is List)
          ? (a['rules'] as List)
              .whereType<Map>()
              .map((e) => Map<String, dynamic>.from(e))
              .toList()
          : <Map<String, dynamic>>[];
      final qRaw = (j['questions'] is List)
          ? (j['questions'] as List)
              .whereType<Map>()
              .map((e) => Map<String, dynamic>.from(e))
              .toList()
          : <Map<String, dynamic>>[];
      if (!mounted) return;
      setState(() {
        _accessMode = (a['accessMode'] ?? 'invite_only').toString();
        _isAgeRestricted = a['isAgeRestricted'] == true;
        _hasRules = a['hasRules'] == true;
        _rules = rulesRaw;
        _joinEnabled = j['enabled'] == true;
        _questions = qRaw;

        _initialAccessMode = _accessMode;
        _initialIsAgeRestricted = _isAgeRestricted;
        _initialHasRules = _hasRules;
        _initialJoinEnabled = _joinEnabled;
        _initialQuestions = _questions
            .map((e) => Map<String, dynamic>.from(e))
            .toList(growable: false);
        _pendingRuleAdds.clear();
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

  List<Map<String, dynamic>> _normalizeQuestions(List<Map<String, dynamic>> src) {
    return src.map((q) {
      final type = (q['type'] ?? 'short').toString();
      return {
        'id': (q['id'] ?? '').toString(),
        'title': (q['title'] ?? '').toString().trim(),
        'type': type == 'paragraph' || type == 'multiple_choice'
            ? type
            : 'short',
        'required': q['required'] != false,
        'options': type == 'multiple_choice'
            ? ((q['options'] is List)
                ? (q['options'] as List)
                    .map((e) => e.toString().trim())
                    .where((e) => e.isNotEmpty)
                    .toList()
                : <String>[])
            : <String>[],
      };
    }).where((q) => (q['title'] as String).isNotEmpty).toList();
  }

  Future<void> _saveAll() async {
    if (!widget.canManage || !_dirty || _saving) return;
    setState(() => _saving = true);
    try {
      await ServersService.patchServerAccessSettings(
        widget.serverId,
        accessMode: _accessMode,
        isAgeRestricted: _isAgeRestricted,
        hasRules: _hasRules,
      );
      await ServersService.patchJoinApplicationForm(widget.serverId, {
        'enabled': _joinEnabled,
        'questions': _normalizeQuestions(_questions),
      });
      for (final r in _pendingRuleAdds) {
        await ServersService.postAccessRule(widget.serverId, r);
      }
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Đã lưu thay đổi')),
      );
      await _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _addRuleLocally(String text) {
    final v = text.trim();
    if (v.isEmpty || !widget.canManage) return;
    setState(() {
      _pendingRuleAdds.add(v);
      _ruleDraft.clear();
    });
  }

  Future<void> _openAddQuestionDialog({Map<String, dynamic>? existing}) async {
    if (!widget.canManage) return;
    final type = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: _cardBg,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              title: const Text('Câu trả lời ngắn',
                  style: TextStyle(color: Colors.white)),
              onTap: () => Navigator.pop(ctx, 'short'),
            ),
            ListTile(
              title: const Text('Đoạn văn',
                  style: TextStyle(color: Colors.white)),
              onTap: () => Navigator.pop(ctx, 'paragraph'),
            ),
            ListTile(
              title: const Text('Nhiều lựa chọn',
                  style: TextStyle(color: Colors.white)),
              onTap: () => Navigator.pop(ctx, 'multiple_choice'),
            ),
          ],
        ),
      ),
    );
    if (type == null || !mounted) return;

    final titleCtrl = TextEditingController(text: existing?['title']?.toString() ?? '');
    final opts = <TextEditingController>[];
    final existingOpts = (existing?['options'] is List)
        ? (existing!['options'] as List).map((e) => e.toString()).toList()
        : <String>[];
    if (type == 'multiple_choice') {
      final initial = existingOpts.isEmpty ? <String>[''] : existingOpts;
      for (final o in initial) {
        opts.add(TextEditingController(text: o));
      }
    }

    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setLocal) => AlertDialog(
            backgroundColor: _cardBg,
            title: const Text('Thêm/Sửa câu hỏi',
                style: TextStyle(color: Colors.white)),
            content: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextField(
                    controller: titleCtrl,
                    style: const TextStyle(color: Colors.white),
                    decoration: const InputDecoration(
                      hintText: 'Nội dung câu hỏi',
                    ),
                  ),
                  if (type == 'multiple_choice') ...[
                    const SizedBox(height: 10),
                    for (var i = 0; i < opts.length; i++) ...[
                      Row(
                        children: [
                          Expanded(
                            child: TextField(
                              controller: opts[i],
                              style: const TextStyle(color: Colors.white),
                              decoration: InputDecoration(
                                hintText: 'Lựa chọn ${i + 1}',
                              ),
                            ),
                          ),
                          IconButton(
                            onPressed: () {
                              setLocal(() {
                                opts.removeAt(i);
                              });
                            },
                            icon: const Icon(Icons.close, color: Colors.white70),
                          ),
                        ],
                      ),
                    ],
                    TextButton(
                      onPressed: () => setLocal(() {
                        opts.add(TextEditingController());
                      }),
                      child: const Text('Thêm lựa chọn'),
                    ),
                  ],
                ],
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(ctx, false),
                child: const Text('Hủy'),
              ),
              FilledButton(
                onPressed: () => Navigator.pop(ctx, true),
                child: const Text('Xong'),
              ),
            ],
          ),
        );
      },
    );
    if (ok != true || !mounted) return;
    final title = titleCtrl.text.trim();
    if (title.isEmpty) return;
    final next = <String>[];
    for (final c in opts) {
      final t = c.text.trim();
      if (t.isNotEmpty) next.add(t);
    }
    if (type == 'multiple_choice' && next.isEmpty) return;

    setState(() {
      final row = <String, dynamic>{
        'id': (existing?['id'] ?? DateTime.now().microsecondsSinceEpoch.toString())
            .toString(),
        'title': title,
        'type': type,
        'required': true,
        'options': type == 'multiple_choice' ? next : <String>[],
      };
      if (existing == null) {
        _questions = [..._questions, row];
      } else {
        _questions = _questions
            .map((q) => q['id']?.toString() == existing['id']?.toString() ? row : q)
            .toList();
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final pad = MediaQuery.paddingOf(context);
    final hPad = MediaQuery.sizeOf(context).width > 520 ? 24.0 : 14.0;
    final allRules = [
      ..._rules.map((e) => (e['content'] ?? '').toString()).where((e) => e.isNotEmpty),
      ..._pendingRuleAdds,
    ];

    return Scaffold(
      backgroundColor: _bg,
      appBar: AppBar(
        backgroundColor: _bg,
        title: const Text('Truy cập', style: TextStyle(fontWeight: FontWeight.w800)),
        actions: [
          TextButton(
            onPressed: widget.canManage && _dirty && !_saving ? _saveAll : null,
            child: _saving
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text('Lưu'),
          ),
        ],
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
                      SwitchListTile(
                        contentPadding: EdgeInsets.zero,
                        tileColor: _cardBg,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        title: const Text('Giới hạn độ tuổi (18+)',
                            style: TextStyle(color: Colors.white)),
                        value: _isAgeRestricted,
                        onChanged: widget.canManage ? (v) => setState(() => _isAgeRestricted = v) : null,
                      ),
                      const SizedBox(height: 12),
                      SwitchListTile(
                        contentPadding: EdgeInsets.zero,
                        tileColor: _cardBg,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        title: const Text('Bật quy định máy chủ',
                            style: TextStyle(color: Colors.white)),
                        value: _hasRules,
                        onChanged: widget.canManage ? (v) => setState(() => _hasRules = v) : null,
                      ),
                      const SizedBox(height: 12),
                      _sectionCard(
                        title: 'Quy định',
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            if (allRules.isEmpty)
                              const Text('Chưa có quy định.',
                                  style: TextStyle(color: Color(0xFF8EA3CC))),
                            for (var i = 0; i < allRules.length; i++)
                              Padding(
                                padding: const EdgeInsets.only(bottom: 8),
                                child: Text('${i + 1}. ${allRules[i]}',
                                    style: const TextStyle(color: Colors.white70)),
                              ),
                            if (widget.canManage) ...[
                              const SizedBox(height: 10),
                              TextField(
                                controller: _ruleDraft,
                                style: const TextStyle(color: Colors.white),
                                decoration: const InputDecoration(hintText: 'Nhập nội dung quy định'),
                              ),
                              const SizedBox(height: 8),
                              Wrap(
                                spacing: 8,
                                runSpacing: 8,
                                children: _ruleTemplates
                                    .map(
                                      (r) => ActionChip(
                                        label: Text(r, style: const TextStyle(fontSize: 12)),
                                        onPressed: () => _addRuleLocally(r),
                                      ),
                                    )
                                    .toList(),
                              ),
                              const SizedBox(height: 8),
                              Align(
                                alignment: Alignment.centerRight,
                                child: FilledButton(
                                  onPressed: () => _addRuleLocally(_ruleDraft.text),
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
                              value: _joinEnabled,
                              onChanged: widget.canManage
                                  ? (v) => setState(() => _joinEnabled = v)
                                  : null,
                            ),
                            const SizedBox(height: 8),
                            Wrap(
                              spacing: 8,
                              runSpacing: 8,
                              children: _questionTemplates
                                  .map(
                                    (q) => ActionChip(
                                      label: Text(q, style: const TextStyle(fontSize: 12)),
                                      onPressed: widget.canManage
                                          ? () => setState(
                                                () => _questions = [
                                                  ..._questions,
                                                  {
                                                    'id': DateTime.now()
                                                        .microsecondsSinceEpoch
                                                        .toString(),
                                                    'title': q,
                                                    'type': 'short',
                                                    'required': true,
                                                    'options': <String>[],
                                                  },
                                                ],
                                              )
                                          : null,
                                    ),
                                  )
                                  .toList(),
                            ),
                            const SizedBox(height: 8),
                            for (final q in _questions) ...[
                              Container(
                                margin: const EdgeInsets.only(top: 8),
                                padding: const EdgeInsets.all(10),
                                decoration: BoxDecoration(
                                  color: const Color(0xFF152A52),
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                child: Row(
                                  children: [
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          Text(
                                            (q['title'] ?? '').toString(),
                                            style: const TextStyle(color: Colors.white),
                                          ),
                                          const SizedBox(height: 2),
                                          Text(
                                            (q['type'] ?? 'short').toString(),
                                            style: const TextStyle(
                                                color: Color(0xFF8EA3CC), fontSize: 12),
                                          ),
                                        ],
                                      ),
                                    ),
                                    if (widget.canManage) ...[
                                      IconButton(
                                        onPressed: () => _openAddQuestionDialog(existing: q),
                                        icon: const Icon(Icons.edit, color: Colors.white70),
                                      ),
                                      IconButton(
                                        onPressed: () => setState(() {
                                          _questions = _questions
                                              .where((x) =>
                                                  x['id']?.toString() != q['id']?.toString())
                                              .toList();
                                        }),
                                        icon: const Icon(Icons.delete_outline,
                                            color: Colors.redAccent),
                                      ),
                                    ],
                                  ],
                                ),
                              ),
                            ],
                            if (widget.canManage) ...[
                              const SizedBox(height: 8),
                              FilledButton(
                                onPressed: _openAddQuestionDialog,
                                child: const Text('+ Thêm câu hỏi'),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
    );
  }

  Widget _modeSection() {
    Widget tile(String m, String title, String desc, IconData icon) {
      final sel = _accessMode == m;
      return Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: Material(
          color: _cardBg,
          borderRadius: BorderRadius.circular(12),
          child: InkWell(
            borderRadius: BorderRadius.circular(12),
            onTap: widget.canManage ? () => setState(() => _accessMode = m) : null,
            child: Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: sel ? const Color(0xFF5865F2) : const Color(0xFF21345D),
                  width: sel ? 2 : 1,
                ),
              ),
              child: Row(
                children: [
                  Icon(icon, color: const Color(0xFF8EA3CC), size: 24),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(title,
                            style: const TextStyle(
                                color: Colors.white, fontWeight: FontWeight.w700)),
                        const SizedBox(height: 2),
                        Text(desc,
                            style: const TextStyle(
                                color: Color(0xFF8EA3CC), fontSize: 13)),
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
        const Text('Cách tham gia',
            style: TextStyle(
                color: Colors.white, fontWeight: FontWeight.w800, fontSize: 16)),
        const SizedBox(height: 10),
        tile('invite_only', 'Chỉ lời mời', 'Tham gia bằng link mời.',
            Icons.lock_outline_rounded),
        tile('apply', 'Đăng ký', 'Gửi đơn và chờ duyệt.',
            Icons.assignment_outlined),
        tile('discoverable', 'Khám phá',
            'Có thể tìm thấy trên Khám phá nếu đủ điều kiện.',
            Icons.public_rounded),
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
          Text(title,
              style: const TextStyle(
                  color: Colors.white, fontWeight: FontWeight.w800, fontSize: 15)),
          const SizedBox(height: 12),
          child,
        ],
      ),
    );
  }
}
