import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';

import '../../../core/services/language_controller.dart';
import '../server_access_constants.dart';
import '../services/servers_service.dart';
import 'server_settings_ui.dart';

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
  bool _discoveryLoading = false;
  Map<String, dynamic>? _discovery;

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
    if (mounted) await _refreshDiscoveryIfNeeded();
  }

  Future<void> _refreshDiscoveryIfNeeded() async {
    if (_accessMode != 'discoverable') {
      if (mounted) setState(() => _discovery = null);
      return;
    }
    setState(() => _discoveryLoading = true);
    try {
      final d = await ServersService.getDiscoveryEligibility(widget.serverId);
      if (!mounted) return;
      setState(() => _discovery = d);
    } catch (_) {
      if (mounted) setState(() => _discovery = null);
    } finally {
      if (mounted) setState(() => _discoveryLoading = false);
    }
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  List<Map<String, dynamic>> _normalizeQuestions(
    List<Map<String, dynamic>> src,
  ) {
    return src
        .map((q) {
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
        })
        .where((q) => (q['title'] as String).isNotEmpty)
        .toList();
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
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(LanguageController.instance.t('server.access.changesSaved'))));
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

  Future<void> _editExistingRule(Map<String, dynamic> rule) async {
    if (!widget.canManage) return;
    final id = (rule['_id'] ?? rule['id'] ?? '').toString();
    if (id.isEmpty) return;
    final ctrl = TextEditingController(
      text: (rule['content'] ?? '').toString(),
    );
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) {
        final dui = ServerSettingsUi.of(c);
        return AlertDialog(
          backgroundColor: dui.card,
          title: Text(LanguageController.instance.t('server.access.editRule'), style: TextStyle(color: dui.text)),
          content: TextField(
            controller: ctrl,
            style: TextStyle(color: dui.text),
            maxLines: 4,
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(c, false), child: Text(LanguageController.instance.t('common.cancel'))),
            TextButton(
              onPressed: () => Navigator.pop(c, true),
              child: Text(LanguageController.instance.t('common.save')),
            ),
          ],
        );
      },
    );
    final content = ctrl.text.trim();
    ctrl.dispose();
    if (ok != true || content.isEmpty) return;
    try {
      await ServersService.patchAccessRule(widget.serverId, id, content);
      await _load();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
      }
    }
  }

  Future<void> _deleteExistingRule(Map<String, dynamic> rule) async {
    if (!widget.canManage) return;
    final id = (rule['_id'] ?? rule['id'] ?? '').toString();
    if (id.isEmpty) return;
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) {
        final dui = ServerSettingsUi.of(c);
        return AlertDialog(
          backgroundColor: dui.card,
          title: Text(LanguageController.instance.t('server.access.deleteRule'), style: TextStyle(color: dui.text)),
          actions: [
            TextButton(onPressed: () => Navigator.pop(c, false), child: Text(LanguageController.instance.t('common.cancel'))),
            TextButton(
              onPressed: () => Navigator.pop(c, true),
              child: Text('Xóa', style: TextStyle(color: dui.destructive)),
            ),
          ],
        );
      },
    );
    if (ok != true) return;
    try {
      await ServersService.deleteAccessRule(widget.serverId, id);
      await _load();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
      }
    }
  }

  Future<void> _openAddQuestionDialog({Map<String, dynamic>? existing}) async {
    if (!widget.canManage) return;
    final ui = ServerSettingsUi.of(context);
    final type = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: ui.card,
      builder: (ctx) {
        final bui = ServerSettingsUi.of(ctx);
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                title: Text(
                  'Câu trả lời ngắn',
                  style: TextStyle(color: bui.text),
                ),
                onTap: () => Navigator.pop(ctx, 'short'),
              ),
              ListTile(
                title: Text(
                  'Đoạn văn',
                  style: TextStyle(color: bui.text),
                ),
                onTap: () => Navigator.pop(ctx, 'paragraph'),
              ),
              ListTile(
                title: Text(
                  'Nhiều lựa chọn',
                  style: TextStyle(color: bui.text),
                ),
                onTap: () => Navigator.pop(ctx, 'multiple_choice'),
              ),
            ],
          ),
        );
      },
    );
    if (type == null || !mounted) return;

    final titleCtrl = TextEditingController(
      text: existing?['title']?.toString() ?? '',
    );
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
          builder: (ctx, setLocal) {
            final dui = ServerSettingsUi.of(ctx);
            return AlertDialog(
              backgroundColor: dui.card,
              title: Text(
                'Thêm/Sửa câu hỏi',
                style: TextStyle(color: dui.text),
              ),
              content: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    TextField(
                      controller: titleCtrl,
                      style: TextStyle(color: dui.text),
                      decoration: dui.fieldDecoration(
                        hintText: LanguageController.instance.t('server.access.questionHint'),
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
                                style: TextStyle(color: dui.text),
                                decoration: dui.fieldDecoration(
                                  hintText: LanguageController.instance.t('server.access.optionHint', {'index': (i + 1).toString()}),
                                ),
                              ),
                            ),
                            IconButton(
                              onPressed: () {
                                setLocal(() {
                                  opts.removeAt(i);
                                });
                              },
                              icon: Icon(
                                Icons.close,
                                color: dui.textMuted,
                              ),
                            ),
                          ],
                        ),
                      ],
                    TextButton(
                      onPressed: () => setLocal(() {
                        opts.add(TextEditingController());
                      }),
                      child: Text(LanguageController.instance.t('server.access.addOption')),
                    ),
                  ],
                ],
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(ctx, false),
                child: Text(LanguageController.instance.t('common.cancel')),
              ),
              FilledButton(
                onPressed: () => Navigator.pop(ctx, true),
                child: Text(LanguageController.instance.t('server.access.done')),
              ),
            ],
          );
          },
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
        'id':
            (existing?['id'] ??
                    DateTime.now().microsecondsSinceEpoch.toString())
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
            .map(
              (q) =>
                  q['id']?.toString() == existing['id']?.toString() ? row : q,
            )
            .toList();
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final ui = ServerSettingsUi.of(context);
    final pad = MediaQuery.paddingOf(context);
    final hPad = MediaQuery.sizeOf(context).width > 520 ? 24.0 : 14.0;
    final pendingRules = _pendingRuleAdds;

    return Scaffold(
      backgroundColor: ui.bg,
      appBar: ui.buildAppBar(
        title: LanguageController.instance.t('server.access.accessTitle'),
        actions: [
          TextButton(
            onPressed: widget.canManage && _dirty && !_saving ? _saveAll : null,
            child: _saving
                ? SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: ui.accent,
                    ),
                  )
                : Text(LanguageController.instance.t('common.save'), style: TextStyle(color: ui.accent)),
          ),
        ],
      ),
      body: _loading
          ? Center(child: CircularProgressIndicator(color: ui.accent))
          : _error != null
          ? Center(
              child: Text(_error!, style: TextStyle(color: ui.textMuted)),
            )
          : RefreshIndicator(
              onRefresh: _load,
              color: ui.accent,
              child: ListView(
                padding: EdgeInsets.fromLTRB(hPad, 12, hPad, pad.bottom + 24),
                children: [
                  _modeSection(ui),
                  _discoverySection(ui),
                  const SizedBox(height: 16),
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    tileColor: ui.card,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                    title: Text(
                      'Giới hạn độ tuổi (18+)',
                      style: TextStyle(color: ui.text),
                    ),
                    value: _isAgeRestricted,
                    onChanged: widget.canManage
                        ? (v) => setState(() => _isAgeRestricted = v)
                        : null,
                    activeThumbColor: ui.accent,
                  ),
                  const SizedBox(height: 12),
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    tileColor: ui.card,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                    title: Text(
                      'Bật quy định máy chủ',
                      style: TextStyle(color: ui.text),
                    ),
                    value: _hasRules,
                    onChanged: widget.canManage
                        ? (v) => setState(() => _hasRules = v)
                        : null,
                    activeThumbColor: ui.accent,
                  ),
                  const SizedBox(height: 12),
                  _sectionCard(
                    ui,
                    title: LanguageController.instance.t('server.access.rulesTitle'),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        if (_rules.isEmpty && pendingRules.isEmpty)
                          Text(
                            'Chưa có quy định.',
                            style: TextStyle(color: ui.textMuted),
                          ),
                        for (var i = 0; i < _rules.length; i++)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 8),
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Expanded(
                                  child: Text(
                                    '${i + 1}. ${(_rules[i]['content'] ?? '').toString()}',
                                    style: TextStyle(color: ui.textMuted),
                                  ),
                                ),
                                if (widget.canManage) ...[
                                  IconButton(
                                    icon: Icon(
                                      Icons.edit_outlined,
                                      color: ui.textMuted,
                                      size: 20,
                                    ),
                                    onPressed: () => _editExistingRule(_rules[i]),
                                  ),
                                  IconButton(
                                    icon: Icon(
                                      Icons.delete_outline,
                                      color: ui.destructive,
                                      size: 20,
                                    ),
                                    onPressed: () => _deleteExistingRule(_rules[i]),
                                  ),
                                ],
                              ],
                            ),
                          ),
                        for (var i = 0; i < pendingRules.length; i++)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 8),
                            child: Text(
                              '${_rules.length + i + 1}. ${pendingRules[i]} (chưa lưu)',
                              style: TextStyle(
                                color: ui.accent.withValues(alpha: 0.9),
                              ),
                            ),
                          ),
                        if (widget.canManage) ...[
                          const SizedBox(height: 10),
                          TextField(
                            controller: _ruleDraft,
                            style: TextStyle(color: ui.text),
                            decoration: ui.fieldDecoration(
                              hintText: LanguageController.instance.t('server.access.ruleHint'),
                            ),
                          ),
                          const SizedBox(height: 8),
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: _ruleTemplates
                                .map(
                                  (r) => ActionChip(
                                    label: Text(
                                      r,
                                      style: const TextStyle(fontSize: 12),
                                    ),
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
                              child: Text(LanguageController.instance.t('server.access.addRule')),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  _sectionCard(
                    ui,
                    title: 'Đơn đăng ký tham gia',
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        SwitchListTile(
                          contentPadding: EdgeInsets.zero,
                          title: Text(
                            'Bật đơn đăng ký',
                            style: TextStyle(color: ui.text),
                          ),
                          value: _joinEnabled,
                          onChanged: widget.canManage
                              ? (v) => setState(() => _joinEnabled = v)
                              : null,
                          activeThumbColor: ui.accent,
                        ),
                        const SizedBox(height: 8),
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: _questionTemplates
                              .map(
                                (q) => ActionChip(
                                  label: Text(
                                    q,
                                    style: const TextStyle(fontSize: 12),
                                  ),
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
                              color: ui.fieldFill,
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Row(
                              children: [
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        (q['title'] ?? '').toString(),
                                        style: TextStyle(color: ui.text),
                                      ),
                                      const SizedBox(height: 2),
                                      Text(
                                        (q['type'] ?? 'short').toString(),
                                        style: TextStyle(
                                          color: ui.textMuted,
                                          fontSize: 12,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                if (widget.canManage) ...[
                                  IconButton(
                                    onPressed: () =>
                                        _openAddQuestionDialog(existing: q),
                                    icon: Icon(
                                      Icons.edit,
                                      color: ui.textMuted,
                                    ),
                                  ),
                                  IconButton(
                                    onPressed: () => setState(() {
                                      _questions = _questions
                                          .where(
                                            (x) =>
                                                x['id']?.toString() !=
                                                q['id']?.toString(),
                                          )
                                          .toList();
                                    }),
                                    icon: const Icon(
                                      Icons.delete_outline,
                                      color: Colors.redAccent,
                                    ),
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
                            child: Text(LanguageController.instance.t('server.access.addQuestion')),
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

  Widget _discoverySection(ServerSettingsUi ui) {
    if (_accessMode != 'discoverable') return const SizedBox.shrink();
    if (_discoveryLoading) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 12),
        child: Center(
          child: SizedBox(
            width: 22,
            height: 22,
            child: CircularProgressIndicator(
              strokeWidth: 2,
              color: ui.accent,
            ),
          ),
        ),
      );
    }
    final d = _discovery;
    if (d == null) {
      return Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Text(
          'Không tải được điều kiện Khám phá.',
          style: TextStyle(color: Colors.red.shade200),
        ),
      );
    }
    final eligible = d['eligible'] == true;
    final checks = (d['checks'] is List) ? d['checks'] as List : const [];
    return _sectionCard(
      ui,
      title: 'Khám phá — điều kiện',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Ngưỡng thành viên / tuổi máy chủ đồng bộ với web '
            '(${ServerAccessConstants.discoveryMinEvaluateMembers}, '
            '${ServerAccessConstants.discoveryMinMembers} thành viên, '
            '${ServerAccessConstants.discoveryMinAgeMinutes} phút).',
            style: TextStyle(color: ui.textMuted, fontSize: 12),
          ),
          const SizedBox(height: 8),
          Text(
            eligible
                ? 'Hiện đạt đủ điều kiện tối thiểu (theo API).'
                : 'Chưa đạt đủ điều kiện.',
            style: TextStyle(
              color: eligible ? ui.accent : ui.destructive.withValues(alpha: 0.85),
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 12),
          for (final c in checks)
            if (c is Map) ...[
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(
                    c['passed'] == true
                        ? Icons.check_circle_rounded
                        : Icons.cancel_rounded,
                    color: c['passed'] == true ? ui.accent : ui.destructive,
                    size: 18,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          (c['label'] ?? '').toString(),
                          style: TextStyle(
                            color: ui.text,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          (c['description'] ?? '').toString(),
                          style: TextStyle(
                            color: ui.textMuted,
                            fontSize: 12,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
            ],
        ],
      ),
    );
  }

  Widget _modeSection(ServerSettingsUi ui) {
    Widget tile(String m, String title, String desc, IconData icon) {
      final sel = _accessMode == m;
      return Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: Material(
          color: ui.card,
          borderRadius: BorderRadius.circular(12),
          child: InkWell(
            borderRadius: BorderRadius.circular(12),
            onTap: widget.canManage
                ? () {
                    setState(() => _accessMode = m);
                    unawaited(_refreshDiscoveryIfNeeded());
                  }
                : null,
            child: Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: sel ? ui.accent : ui.border,
                  width: sel ? 2 : 1,
                ),
              ),
              child: Row(
                children: [
                  Icon(icon, color: ui.textMuted, size: 24),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          title,
                          style: TextStyle(
                            color: ui.text,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          desc,
                          style: TextStyle(
                            color: ui.textMuted,
                            fontSize: 13,
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (sel)
                    Icon(
                      Icons.check_circle_rounded,
                      color: ui.accent,
                    ),
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
        Text(
          'Cách tham gia',
          style: TextStyle(
            color: ui.text,
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
          'Gửi đơn và chờ duyệt.',
          Icons.assignment_outlined,
        ),
        tile(
          'discoverable',
          'Khám phá',
          'Có thể tìm thấy trên Khám phá nếu đủ điều kiện.',
          Icons.public_rounded,
        ),
      ],
    );
  }

  Widget _sectionCard(
    ServerSettingsUi ui, {
    required String title,
    required Widget child,
  }) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: ui.card,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: TextStyle(
              color: ui.text,
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
