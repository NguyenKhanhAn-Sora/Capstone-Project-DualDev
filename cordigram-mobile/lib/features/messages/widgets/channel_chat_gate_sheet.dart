import 'dart:async';

import 'package:flutter/material.dart';

import '../services/servers_service.dart';

/// Cổng chat trong kênh: cảnh báo tuổi + quy định + xác minh email/thời gian (cùng contract `GET access/my-status` với web).
/// Xác nhận tuổi ([acknowledge-age]) là **một lần cho cả server** — không cần lặp từng kênh.
Future<void> showChannelChatGateSheet(
  BuildContext context, {
  required String serverId,
  required String serverName,
  String? serverAvatarUrl,
  required VoidCallback onGateUpdated,
}) async {
  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: const Color(0xFF2b2d31),
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
    ),
    builder: (ctx) => _ChannelChatGateSheetBody(
      serverId: serverId,
      serverName: serverName,
      serverAvatarUrl: serverAvatarUrl,
      onGateUpdated: onGateUpdated,
    ),
  );
}

class _ChannelChatGateSheetBody extends StatefulWidget {
  const _ChannelChatGateSheetBody({
    required this.serverId,
    required this.serverName,
    this.serverAvatarUrl,
    required this.onGateUpdated,
  });

  final String serverId;
  final String serverName;
  final String? serverAvatarUrl;
  final VoidCallback onGateUpdated;

  @override
  State<_ChannelChatGateSheetBody> createState() =>
      _ChannelChatGateSheetBodyState();
}

class _ChannelChatGateSheetBodyState extends State<_ChannelChatGateSheetBody> {
  Map<String, dynamic>? _status;
  Map<String, dynamic>? _settings;
  bool _loading = true;
  String? _error;
  bool _rulesChecked = false;
  bool _submittingRules = false;
  bool _submittingAge = false;
  final _otpCtrl = TextEditingController();
  bool _otpSending = false;
  bool _otpVerifying = false;
  int _otpCooldown = 0;
  Timer? _cooldownTimer;
  Timer? _pollTimer;

  @override
  void initState() {
    super.initState();
    _otpCtrl.addListener(() => setState(() {}));
    unawaited(_loadAll());
    _pollTimer = Timer.periodic(const Duration(seconds: 5), (_) {
      if (mounted) unawaited(_refreshStatus(silent: true));
    });
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    _cooldownTimer?.cancel();
    _otpCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadAll() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final results = await Future.wait([
        ServersService.getMyAccessStatus(widget.serverId),
        ServersService.getServerAccessSettings(widget.serverId),
      ]);
      if (!mounted) return;
      setState(() {
        _status = Map<String, dynamic>.from(results[0] as Map);
        _settings = Map<String, dynamic>.from(results[1] as Map);
        _loading = false;
      });
      await _maybeCloseIfUnblocked();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Future<void> _refreshStatus({bool silent = false}) async {
    try {
      final s = await ServersService.getMyAccessStatus(widget.serverId);
      if (!mounted) return;
      setState(() => _status = Map<String, dynamic>.from(s));
      widget.onGateUpdated();
      await _maybeCloseIfUnblocked();
    } catch (_) {
      if (!silent && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Không tải được trạng thái máy chủ')),
        );
      }
    }
  }

  Future<void> _maybeCloseIfUnblocked() async {
    final s = _status;
    if (s == null) return;
    final blocked = s['chatViewBlocked'] == true;
    if (!blocked && mounted) {
      Navigator.of(context).pop();
    }
  }

  List<Map<String, dynamic>> _rulesList() {
    final raw = _settings?['rules'];
    if (raw is! List) return [];
    return raw
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .where((e) => (e['content'] ?? '').toString().trim().isNotEmpty)
        .toList();
  }

  bool _needsAgeAck() {
    final s = _status;
    if (s == null) return false;
    if (s['isAgeRestricted'] != true) return false;
    if (s['ageRestrictedAcknowledged'] == true) return false;
    final y = s['ageYears'];
    if (y is! num) return false;
    return y >= 18;
  }

  bool _needsRules() {
    final s = _status;
    if (s == null) return false;
    if (s['hasRules'] != true) return false;
    return s['acceptedRules'] != true;
  }

  String _verificationLevel() =>
      (_status?['verificationLevel'] ?? 'none').toString();

  Map<String, dynamic> _checks() {
    final c = _status?['verificationChecks'];
    if (c is Map) return Map<String, dynamic>.from(c);
    return {};
  }

  Map<String, dynamic> _wait() {
    final w = _status?['verificationWait'];
    if (w is Map) return Map<String, dynamic>.from(w);
    return {};
  }

  String? _fmtWait(dynamic sec) {
    if (sec == null) return null;
    final n = sec is num ? sec.toInt() : int.tryParse(sec.toString());
    if (n == null || n <= 0) return null;
    final m = n ~/ 60;
    final s = n % 60;
    return '${m.toString().padLeft(2, '0')}:${s.toString().padLeft(2, '0')}';
  }

  Future<void> _onAgeContinue() async {
    setState(() => _submittingAge = true);
    try {
      await ServersService.acknowledgeServerAgeRestriction(widget.serverId);
      if (!mounted) return;
      await _refreshStatus();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('$e')));
      }
    } finally {
      if (mounted) setState(() => _submittingAge = false);
    }
  }

  Future<void> _onAcceptRules() async {
    if (!_rulesChecked) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Vui lòng tick xác nhận đã đọc quy định')),
      );
      return;
    }
    setState(() => _submittingRules = true);
    try {
      await ServersService.acceptServerRules(widget.serverId);
      if (!mounted) return;
      await _refreshStatus();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('$e')));
      }
    } finally {
      if (mounted) setState(() => _submittingRules = false);
    }
  }

  Future<void> _requestOtp() async {
    setState(() => _otpSending = true);
    try {
      final res = await ServersService.requestServerEmailOtp(widget.serverId);
      final ok = res['ok'] == true;
      final retry = res['retryAfterSec'];
      if (!mounted) return;
      if (ok) {
        _startCooldown(60);
      } else if (retry is num && retry.toInt() > 0) {
        _startCooldown(retry.toInt());
      }
      await _refreshStatus();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('$e')));
      }
    } finally {
      if (mounted) setState(() => _otpSending = false);
    }
  }

  void _startCooldown(int sec) {
    _cooldownTimer?.cancel();
    setState(() => _otpCooldown = sec);
    _cooldownTimer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) {
        t.cancel();
        return;
      }
      setState(() {
        _otpCooldown -= 1;
        if (_otpCooldown <= 0) {
          _otpCooldown = 0;
          t.cancel();
        }
      });
    });
  }

  Future<void> _verifyOtp() async {
    final code = _otpCtrl.text.trim();
    if (code.length < 4) return;
    setState(() => _otpVerifying = true);
    try {
      await ServersService.verifyServerEmailOtp(widget.serverId, code);
      if (!mounted) return;
      _otpCtrl.clear();
      await _refreshStatus();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('$e')));
      }
    } finally {
      if (mounted) setState(() => _otpVerifying = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.paddingOf(context).bottom;
    final sheetH = MediaQuery.sizeOf(context).height * 0.92;
    if (_loading) {
      return SizedBox(
        height: sheetH,
        child: Center(
          child: CircularProgressIndicator(
            color: Theme.of(context).colorScheme.primary,
          ),
        ),
      );
    }
    if (_error != null) {
      return Padding(
        padding: EdgeInsets.fromLTRB(24, 24, 24, 24 + bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(_error!, style: const TextStyle(color: Color(0xFFFFB2BE))),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: () => unawaited(_loadAll()),
              child: const Text('Thử lại'),
            ),
          ],
        ),
      );
    }

    final listed = _rulesList();
    final lvl = _verificationLevel();
    final chk = _checks();
    final wait = _wait();
    final emailOk = chk['emailVerified'] == true;
    final accountOk = lvl == 'low' ? true : chk['accountOver5Min'] == true;
    final memberOk = lvl == 'high' ? chk['memberOver10Min'] == true : true;

    return SizedBox(
      height: sheetH,
      child: DraggableScrollableSheet(
        expand: false,
        initialChildSize: 1,
        minChildSize: 0.55,
        maxChildSize: 1,
        builder: (ctx, scroll) {
          return Column(
            children: [
              Center(
                child: Container(
                  margin: const EdgeInsets.only(top: 8),
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: const Color(0xFF4E5058),
                    borderRadius: BorderRadius.circular(999),
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 8, 8),
                child: Row(
                  children: [
                    if ((widget.serverAvatarUrl ?? '').trim().isNotEmpty)
                      ClipRRect(
                        borderRadius: BorderRadius.circular(10),
                        child: Image.network(
                          widget.serverAvatarUrl!.trim(),
                          width: 44,
                          height: 44,
                          fit: BoxFit.cover,
                          errorBuilder: (_, __, ___) =>
                              const SizedBox(width: 44, height: 44),
                        ),
                      ),
                    if ((widget.serverAvatarUrl ?? '').trim().isNotEmpty)
                      const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            widget.serverName,
                            style: const TextStyle(
                              color: Color(0xFFF2F3F5),
                              fontSize: 18,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          const SizedBox(height: 4),
                          const Text(
                            'Trước khi chat, hoàn thành các bước bên dưới (giống trên web). '
                            'Xác nhận cảnh báo tuổi chỉ cần một lần cho cả máy chủ.',
                            style: TextStyle(
                              color: Color(0xFFB5BAC1),
                              fontSize: 13,
                              height: 1.35,
                            ),
                          ),
                        ],
                      ),
                    ),
                    IconButton(
                      onPressed: () => Navigator.pop(context),
                      icon: const Icon(Icons.close, color: Colors.white70),
                    ),
                  ],
                ),
              ),
              const Divider(height: 1, color: Color(0xFF3F4147)),
              Expanded(
                child: ListView(
                  controller: scroll,
                  padding: EdgeInsets.fromLTRB(16, 12, 16, 16 + bottom),
                  children: [
                    if (_needsAgeAck()) ...[
                      _sectionTitle('Máy chủ giới hạn độ tuổi'),
                      const SizedBox(height: 8),
                      const Text(
                        'Máy chủ này có nội dung nhạy cảm / giới hạn độ tuổi. '
                        'Bấm Tiếp tục để xác nhận đã đọc cảnh báo (áp dụng mọi kênh trong server).',
                        style: TextStyle(
                          color: Color(0xFFB5BAC1),
                          fontSize: 14,
                          height: 1.4,
                        ),
                      ),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          Expanded(
                            child: OutlinedButton(
                              onPressed: _submittingAge
                                  ? null
                                  : () => Navigator.pop(context),
                              child: const Text('Quay lại'),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: FilledButton(
                              onPressed: _submittingAge ? null : _onAgeContinue,
                              child: _submittingAge
                                  ? const SizedBox(
                                      width: 20,
                                      height: 20,
                                      child: CircularProgressIndicator(
                                        strokeWidth: 2,
                                        color: Colors.white,
                                      ),
                                    )
                                  : const Text('Tiếp tục'),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 22),
                    ],
                    if (_status?['isAgeRestricted'] == true &&
                        (_status?['ageYears'] is num) &&
                        (_status!['ageYears'] as num) < 18) ...[
                      _sectionTitle('Giới hạn độ tuổi'),
                      const Padding(
                        padding: EdgeInsets.only(top: 8),
                        child: Text(
                          'Tài khoản chưa đủ 18 tuổi — không thể truy cập máy chủ này.',
                          style: TextStyle(color: Color(0xFFFFB2BE)),
                        ),
                      ),
                      const SizedBox(height: 22),
                    ],
                    if (_needsRules()) ...[
                      _sectionTitle('Đồng ý với quy định'),
                      const SizedBox(height: 8),
                      if (listed.isEmpty)
                        const Text(
                          'Bạn xác nhận đồng ý quy định máy chủ?',
                          style: TextStyle(color: Color(0xFFE6E6E6)),
                        )
                      else
                        ...listed.asMap().entries.map((e) {
                          final i = e.key + 1;
                          final content = (e.value['content'] ?? '').toString();
                          return Padding(
                            padding: const EdgeInsets.only(bottom: 10),
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  '$i.',
                                  style: const TextStyle(
                                    color: Color(0xFFF23BA9),
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: Text(
                                    content,
                                    style: const TextStyle(
                                      color: Color(0xFFE6E6E6),
                                      height: 1.4,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          );
                        }),
                      CheckboxListTile(
                        contentPadding: EdgeInsets.zero,
                        value: _rulesChecked,
                        onChanged: (v) =>
                            setState(() => _rulesChecked = v ?? false),
                        fillColor: WidgetStateProperty.resolveWith(
                          (s) => s.contains(WidgetState.selected)
                              ? const Color(0xFF5865F2)
                              : null,
                        ),
                        checkColor: Colors.white,
                        title: const Text(
                          'Tôi đã đọc và đồng ý với các quy định',
                          style: TextStyle(color: Color(0xFFE6E6E6)),
                        ),
                      ),
                      const SizedBox(height: 8),
                      SizedBox(
                        width: double.infinity,
                        child: FilledButton(
                          onPressed: _submittingRules
                              ? null
                              : () => _onAcceptRules(),
                          style: FilledButton.styleFrom(
                            backgroundColor: const Color(0xFF3ba55d),
                          ),
                          child: _submittingRules
                              ? const SizedBox(
                                  width: 22,
                                  height: 22,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    color: Colors.white,
                                  ),
                                )
                              : const Text('Gửi'),
                        ),
                      ),
                      const SizedBox(height: 22),
                    ],
                    if (lvl != 'none') ...[
                      _sectionTitle('Xác minh máy chủ'),
                      const SizedBox(height: 8),
                      _verifyRow('Xác minh email đăng ký', emailOk),
                      if (lvl == 'medium' || lvl == 'high')
                        _verifyRow(
                          'Tài khoản đã đăng ký trên 5 phút',
                          accountOk,
                          wait: _fmtWait(wait['waitAccountSec']),
                        ),
                      if (lvl == 'high')
                        _verifyRow(
                          'Đã là thành viên máy chủ trên 10 phút',
                          memberOk,
                          wait: _fmtWait(wait['waitMemberSec']),
                        ),
                      if (!emailOk) ...[
                        const SizedBox(height: 12),
                        const Text(
                          'Nhập mã gửi về email đã xác minh trên Cordigram:',
                          style: TextStyle(
                            color: Color(0xFFB5BAC1),
                            fontSize: 13,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Row(
                          children: [
                            Expanded(
                              child: TextField(
                                controller: _otpCtrl,
                                keyboardType: TextInputType.number,
                                style: const TextStyle(color: Colors.white),
                                decoration: const InputDecoration(
                                  hintText: 'Mã 6 số',
                                  hintStyle: TextStyle(
                                    color: Color(0xFF8A98B8),
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(width: 8),
                            FilledButton(
                              onPressed:
                                  (_otpVerifying ||
                                      _otpCtrl.text.trim().length < 4)
                                  ? null
                                  : _verifyOtp,
                              child: Text(_otpVerifying ? '...' : 'Xác minh'),
                            ),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Row(
                          children: [
                            TextButton(
                              onPressed: (_otpSending || _otpCooldown > 0)
                                  ? null
                                  : _requestOtp,
                              child: Text(
                                _otpCooldown > 0
                                    ? 'Gửi lại (${_otpCooldown}s)'
                                    : 'Gửi mã OTP',
                              ),
                            ),
                          ],
                        ),
                      ],
                      const SizedBox(height: 8),
                    ],
                  ],
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _sectionTitle(String t) => Text(
    t,
    style: const TextStyle(
      color: Color(0xFF949BA4),
      fontSize: 12,
      fontWeight: FontWeight.w700,
      letterSpacing: 0.6,
    ),
  );

  Widget _verifyRow(String label, bool ok, {String? wait}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            ok ? '✓' : '○',
            style: TextStyle(
              color: ok ? const Color(0xFF3ba55d) : const Color(0xFFB5BAC1),
              fontSize: 16,
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text.rich(
              TextSpan(
                style: const TextStyle(color: Color(0xFFDBDEE1), fontSize: 14),
                children: [
                  TextSpan(text: label),
                  if (wait != null && wait.isNotEmpty)
                    TextSpan(
                      text: '   · Còn ~$wait',
                      style: const TextStyle(color: Color(0xFF949BA4)),
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
