import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/services/api_service.dart';
import '../services/servers_service.dart';

enum _InviteCustomizeKind { cancelled, backToMessages, join }

class InviteCustomizeResult {
  const InviteCustomizeResult._({
    required this.kind,
    this.nicknameTrimmed = '',
    this.allowDirectMessages = true,
    this.showActivity = true,
  });

  final _InviteCustomizeKind kind;
  final String nicknameTrimmed;
  final bool allowDirectMessages;
  final bool showActivity;

  bool get wantsJoin => kind == _InviteCustomizeKind.join;
  bool get wantsBackToMessages => kind == _InviteCustomizeKind.backToMessages;

  factory InviteCustomizeResult.cancelled() =>
      const InviteCustomizeResult._(kind: _InviteCustomizeKind.cancelled);

  factory InviteCustomizeResult.backToMessages() =>
      const InviteCustomizeResult._(kind: _InviteCustomizeKind.backToMessages);

  factory InviteCustomizeResult.join({
    required String nicknameTrimmed,
    required bool allowDirectMessages,
    required bool showActivity,
  }) => InviteCustomizeResult._(
    kind: _InviteCustomizeKind.join,
    nicknameTrimmed: nicknameTrimmed,
    allowDirectMessages: allowDirectMessages,
    showActivity: showActivity,
  );
}

/// In-app server join aligned with cordigram-web invite / inbox flows and BE `POST /servers/:id/join`.
class ServerJoinFlow {
  ServerJoinFlow._();

  /// [loaderDialogHolder][0] giữ context của route dialog loader — pop đúng overlay, tránh
  /// `Navigator.pop` mù + chồng dialog (gây crash `_dependents.isEmpty`).
  static void _openLoad(
    BuildContext context,
    List<BuildContext?> loaderDialogHolder,
  ) {
    if (!context.mounted) return;
    loaderDialogHolder[0] = null;
    showDialog<void>(
      context: context,
      useRootNavigator: true,
      barrierDismissible: false,
      builder: (dialogCtx) {
        loaderDialogHolder[0] = dialogCtx;
        return PopScope(
          canPop: false,
          child: Center(
            child: Card(
              color: const Color(0xFF1a1d21),
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: CircularProgressIndicator(
                  color: Theme.of(dialogCtx).colorScheme.primary,
                ),
              ),
            ),
          ),
        );
      },
    );
  }

  static void _closeLoad(List<BuildContext?> loaderDialogHolder) {
    final ctx = loaderDialogHolder[0];
    loaderDialogHolder[0] = null;
    if (ctx != null && ctx.mounted) {
      Navigator.of(ctx).pop();
    }
  }

  static List<Map<String, dynamic>> _coerceQuestions(dynamic raw) {
    if (raw is! List) return [];
    final out = <Map<String, dynamic>>[];
    for (final e in raw) {
      if (e is! Map) continue;
      final m = Map<String, dynamic>.from(e);
      final idRaw =
          (m['id'] ?? m['_id'] ?? m['questionId'])?.toString().trim() ?? '';
      if (idRaw.isNotEmpty) {
        m['id'] = idRaw;
      }
      final opts = m['options'];
      if (opts is! List || opts.isEmpty) {
        final alt = m['choices'] ?? m['option'];
        if (alt is List) {
          m['options'] = alt.map((x) => x.toString()).toList();
        }
      }
      out.add(m);
    }
    return out;
  }

  /// Gộp GET join-form + form trong access/settings (giống web: đủ câu khi một nguồn thiếu hoặc lệch id).
  static List<Map<String, dynamic>> _mergeQuestionLists(
    List<Map<String, dynamic>> apiQs,
    List<Map<String, dynamic>> embQs,
  ) {
    if (embQs.isEmpty) return apiQs;
    if (apiQs.isEmpty) return embQs;
    final byApiId = <String, Map<String, dynamic>>{};
    for (final q in apiQs) {
      final id = (q['id'] ?? '').toString().trim();
      if (id.isNotEmpty) {
        byApiId[id] = q;
      }
    }
    final merged = <Map<String, dynamic>>[];
    for (final e in embQs) {
      final id = (e['id'] ?? '').toString().trim();
      if (id.isNotEmpty && byApiId.containsKey(id)) {
        merged.add(Map<String, dynamic>.from(byApiId[id]!));
      } else {
        merged.add(Map<String, dynamic>.from(e));
      }
    }
    for (final q in apiQs) {
      final id = (q['id'] ?? '').toString().trim();
      if (id.isEmpty) continue;
      final exists = merged.any(
        (m) => (m['id'] ?? '').toString().trim() == id,
      );
      if (!exists) {
        merged.add(Map<String, dynamic>.from(q));
      }
    }
    return merged;
  }

  /// Ưu tiên GET `/access/join-form` (đủ câu hỏi, đã chuẩn hóa); fallback form nhúng trong `/access/settings`.
  static Future<Map<String, dynamic>> _loadJoinForm(
    String serverId,
    Map<String, dynamic> settings,
  ) async {
    Map<String, dynamic>? fromApi;
    try {
      final fetched = await ServersService.getJoinApplicationForm(serverId);
      final qs = _coerceQuestions(fetched['questions']);
      fromApi = {...Map<String, dynamic>.from(fetched), 'questions': qs};
    } catch (_) {
      fromApi = null;
    }
    final embeddedRaw = settings['joinApplicationForm'];
    Map<String, dynamic>? embedded;
    if (embeddedRaw is Map) {
      embedded = Map<String, dynamic>.from(embeddedRaw);
      embedded['questions'] = _coerceQuestions(embedded['questions']);
    }

    if (fromApi != null && embedded != null) {
      final apiList = <Map<String, dynamic>>[];
      final aq = fromApi['questions'];
      if (aq is List) {
        for (final e in aq) {
          if (e is Map) {
            apiList.add(Map<String, dynamic>.from(e));
          }
        }
      }
      final embList = <Map<String, dynamic>>[];
      final eq = embedded['questions'];
      if (eq is List) {
        for (final e in eq) {
          if (e is Map) {
            embList.add(Map<String, dynamic>.from(e));
          }
        }
      }
      final mergedQs = _mergeQuestionLists(apiList, embList);
      final embEnabled = embedded['enabled'] == true;
      final enabled = fromApi['enabled'] == true || embEnabled;
      return {'enabled': enabled, 'questions': mergedQs};
    }
    if (fromApi != null) {
      final embEnabled = embeddedRaw is Map && embeddedRaw['enabled'] == true;
      if (embEnabled && fromApi['enabled'] != true) {
        return {...fromApi, 'enabled': true};
      }
      return fromApi;
    }
    if (embedded != null) {
      return embedded;
    }
    return {'enabled': false, 'questions': <dynamic>[]};
  }

  static List<Map<String, dynamic>> _rulesList(Map<String, dynamic> settings) {
    final raw = settings['rules'];
    if (raw is! List) return [];
    return raw
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .where((e) => (e['content'] ?? '').toString().trim().isNotEmpty)
        .toList();
  }

  /// Full rules text (cordigram-web verification-style), then agree — not only a one-line confirm.
  /// Dùng lại từ màn kênh khi cần đồng ý quy định (POST accept-rules).
  static Future<bool?> showRulesAgreementDialog(
    BuildContext context,
    Map<String, dynamic> settings,
  ) async {
    final listed = _rulesList(settings);
    final fallback =
        'Bạn xác nhận đã đọc và đồng ý tuân thủ quy định của máy chủ này?';

    return showDialog<bool>(
      context: context,
      useRootNavigator: true,
      barrierDismissible: false,
      builder: (ctx) {
        return AlertDialog(
          backgroundColor: const Color(0xFF2b2d31),
          title: const Text(
            'Quy định máy chủ',
            style: TextStyle(color: Color(0xFFF2F3F5)),
          ),
          content: SizedBox(
            width: double.maxFinite,
            height: MediaQuery.sizeOf(ctx).height * 0.5,
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (listed.isEmpty)
                    Text(
                      fallback,
                      style: const TextStyle(
                        color: Color(0xFFB5BAC1),
                        height: 1.35,
                      ),
                    )
                  else
                    for (var i = 0; i < listed.length; i++) ...[
                      Text(
                        '${i + 1}.',
                        style: const TextStyle(
                          color: Color(0xFFF23BA9),
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 4),
                      SelectableText(
                        (listed[i]['content'] ?? '').toString(),
                        style: const TextStyle(
                          color: Color(0xFFE6E6E6),
                          height: 1.4,
                        ),
                      ),
                      const SizedBox(height: 14),
                    ],
                  const SizedBox(height: 8),
                  const Text(
                    'Nhấn Đồng ý để xác nhận bạn đã đọc và chấp nhận các quy định trên.',
                    style: TextStyle(color: Color(0xFF949BA4), fontSize: 12),
                  ),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Hủy'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Đồng ý'),
            ),
          ],
        );
      },
    );
  }

  static Future<Map<String, Map<String, String>>?> _collectApplicationAnswers(
    BuildContext context, {
    required List<Map<String, dynamic>> questions,
    required bool formEnabled,
    String? serverName,
    String? serverAvatarUrl,
  }) async {
    final textCtrls = List<TextEditingController>.generate(
      questions.length,
      (_) => TextEditingController(),
    );

    final result = await showModalBottomSheet<Map<String, Map<String, String>>>(
      context: context,
      useRootNavigator: true,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF2b2d31),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) {
        final mcPick = <int, String>{};
        final bottomInset = MediaQuery.paddingOf(ctx).bottom;
        final viewInsets = MediaQuery.viewInsetsOf(ctx).bottom;
        return Padding(
          padding: EdgeInsets.only(bottom: viewInsets),
          child: DraggableScrollableSheet(
            expand: false,
            initialChildSize: 0.92,
            minChildSize: 0.45,
            maxChildSize: 0.96,
            builder: (ctx, scrollCtrl) {
              final avatarUrl = (serverAvatarUrl ?? '').trim();
              return StatefulBuilder(
                builder: (ctx, setLocal) {
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const SizedBox(height: 8),
                      Center(
                        child: Container(
                          width: 40,
                          height: 4,
                          decoration: BoxDecoration(
                            color: const Color(0xFF4E5058),
                            borderRadius: BorderRadius.circular(999),
                          ),
                        ),
                      ),
                      Padding(
                        padding: const EdgeInsets.fromLTRB(16, 16, 8, 8),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            if (avatarUrl.isNotEmpty) ...[
                              ClipRRect(
                                borderRadius: BorderRadius.circular(10),
                                child: Image.network(
                                  avatarUrl,
                                  width: 44,
                                  height: 44,
                                  fit: BoxFit.cover,
                                  errorBuilder: (_, __, ___) =>
                                      const SizedBox(width: 44, height: 44),
                                ),
                              ),
                              const SizedBox(width: 12),
                            ],
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    'Trước khi trò chuyện',
                                    style: const TextStyle(
                                      color: Color(0xFFF2F3F5),
                                      fontSize: 20,
                                      fontWeight: FontWeight.w800,
                                    ),
                                  ),
                                  const SizedBox(height: 6),
                                  Text(
                                    formEnabled && questions.isEmpty
                                        ? 'Máy chủ chưa thêm câu hỏi. Bạn có thể gửi đơn trống.'
                                        : 'Hoàn thành các bước sau để gửi đơn đăng ký tham gia.',
                                    style: const TextStyle(
                                      color: Color(0xFFB5BAC1),
                                      fontSize: 14,
                                      height: 1.35,
                                    ),
                                  ),
                                  if ((serverName ?? '').trim().isNotEmpty) ...[
                                    const SizedBox(height: 10),
                                    Text(
                                      serverName!.trim(),
                                      style: const TextStyle(
                                        color: Color(0xFFE6E6E6),
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                  ],
                                ],
                              ),
                            ),
                            IconButton(
                              onPressed: () => Navigator.pop(ctx),
                              icon: const Icon(
                                Icons.close,
                                color: Colors.white70,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const Divider(height: 1, color: Color(0xFF3F4147)),
                      Expanded(
                        child: ListView(
                          controller: scrollCtrl,
                          physics: const AlwaysScrollableScrollPhysics(),
                          padding: EdgeInsets.fromLTRB(
                            16,
                            12,
                            16,
                            16 + bottomInset,
                          ),
                          children: [
                            const Text(
                              'Đơn đăng ký',
                              style: TextStyle(
                                color: Color(0xFF949BA4),
                                fontSize: 12,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            const SizedBox(height: 10),
                            if (questions.isEmpty)
                              const Padding(
                                padding: EdgeInsets.only(bottom: 12),
                                child: Text(
                                  'Không có câu hỏi nào để trả lời.',
                                  style: TextStyle(color: Color(0xFFB5BAC1)),
                                ),
                              ),
                            for (var qi = 0; qi < questions.length; qi++) ...[
                              Builder(
                                builder: (_) {
                                  final q = questions[qi];
                                  final id = (q['id'] ?? '').toString().trim();
                                  final title = (q['title'] ?? '')
                                      .toString()
                                      .trim();
                                  final type = (q['type'] ?? 'short')
                                      .toString();
                                  final req = q['required'] != false;
                                  if (id.isEmpty) {
                                    return Padding(
                                      padding: const EdgeInsets.only(
                                        bottom: 14,
                                      ),
                                      child: Text(
                                        title.isEmpty
                                            ? 'Câu hỏi cấu hình sai (thiếu id).'
                                            : title,
                                        style: const TextStyle(
                                          color: Color(0xFFFF6B6B),
                                        ),
                                      ),
                                    );
                                  }
                                  return Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Row(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          Expanded(
                                            child: Text(
                                              title.isEmpty
                                                  ? '(Không tiêu đề)'
                                                  : title,
                                              style: const TextStyle(
                                                color: Color(0xFFF2F3F5),
                                                fontWeight: FontWeight.w600,
                                              ),
                                            ),
                                          ),
                                          if (req)
                                            const Text(
                                              ' *',
                                              style: TextStyle(
                                                color: Color(0xFFF23BA9),
                                              ),
                                            ),
                                        ],
                                      ),
                                      const SizedBox(height: 8),
                                      if (type == 'multiple_choice')
                                        ...(() {
                                          final opts = (q['options'] is List)
                                              ? (q['options'] as List)
                                                    .map((e) => e.toString())
                                                    .where((e) => e.isNotEmpty)
                                                    .toList()
                                              : <String>[];
                                          if (opts.isEmpty) {
                                            return <Widget>[
                                              TextField(
                                                controller: textCtrls[qi],
                                                style: const TextStyle(
                                                  color: Colors.white,
                                                ),
                                                decoration: const InputDecoration(
                                                  hintText:
                                                      'Không có lựa chọn — trả lời ngắn…',
                                                  hintStyle: TextStyle(
                                                    color: Color(0xFF8A98B8),
                                                  ),
                                                ),
                                              ),
                                            ];
                                          }
                                          return [
                                            Theme(
                                              data: Theme.of(ctx).copyWith(
                                                radioTheme: RadioThemeData(
                                                  fillColor:
                                                      WidgetStateProperty.all(
                                                        const Color(0xFFF23BA9),
                                                      ),
                                                ),
                                              ),
                                              child: Column(
                                                children: opts
                                                    .map(
                                                      (
                                                        o,
                                                      ) => RadioListTile<String>(
                                                        dense: true,
                                                        contentPadding:
                                                            EdgeInsets.zero,
                                                        title: Text(
                                                          o,
                                                          style:
                                                              const TextStyle(
                                                                color: Color(
                                                                  0xFFE6E6E6,
                                                                ),
                                                                fontSize: 14,
                                                              ),
                                                        ),
                                                        value: o,
                                                        groupValue:
                                                            (mcPick[qi]
                                                                        ?.isNotEmpty ==
                                                                    true)
                                                                ? mcPick[qi]
                                                                : null,
                                                        onChanged: (v) =>
                                                            setLocal(
                                                              () =>
                                                                  mcPick[qi] =
                                                                      v ?? '',
                                                            ),
                                                      ),
                                                    )
                                                    .toList(),
                                              ),
                                            ),
                                          ];
                                        })()
                                      else ...[
                                        TextField(
                                          controller: textCtrls[qi],
                                          maxLines: type == 'paragraph' ? 5 : 1,
                                          style: const TextStyle(
                                            color: Colors.white,
                                          ),
                                          decoration: const InputDecoration(
                                            hintText: 'Trả lời…',
                                            hintStyle: TextStyle(
                                              color: Color(0xFF8A98B8),
                                            ),
                                          ),
                                        ),
                                      ],
                                      const SizedBox(height: 18),
                                    ],
                                  );
                                },
                              ),
                            ],
                          ],
                        ),
                      ),
                      Padding(
                        padding: EdgeInsets.fromLTRB(
                          16,
                          0,
                          16,
                          12 + bottomInset,
                        ),
                        child: FilledButton(
                          onPressed: () {
                            final out = <String, Map<String, String>>{};
                            for (var qi = 0; qi < questions.length; qi++) {
                              final q = questions[qi];
                              final id = (q['id'] ?? '').toString().trim();
                              if (id.isEmpty) continue;
                              final type = (q['type'] ?? 'short').toString();
                              if (type == 'multiple_choice' &&
                                  ((q['options'] is List) &&
                                      (q['options'] as List).isNotEmpty)) {
                                out[id] = {
                                  'selectedOption': mcPick[qi] ?? '',
                                };
                              } else if (type == 'multiple_choice') {
                                out[id] = {
                                  'text': textCtrls[qi].text,
                                };
                              } else {
                                out[id] = {
                                  'text': textCtrls[qi].text,
                                };
                              }
                            }
                            Navigator.pop(ctx, out);
                          },
                          child: const Text('Gửi đơn'),
                        ),
                      ),
                    ],
                  );
                },
              );
            },
          ),
        );
      },
    );

    for (final c in textCtrls) {
      c.dispose();
    }
    return result;
  }

  static List<Map<String, dynamic>> _applicationAnswersPayload(
    List<Map<String, dynamic>> questions,
    Map<String, Map<String, String>> answers,
  ) {
    return questions.map((q) {
      final id = (q['id'] ?? '').toString().trim();
      final type = (q['type'] ?? 'short').toString();
      final a = answers[id] ?? {};
      if (type == 'multiple_choice' &&
          ((q['options'] is List) && (q['options'] as List).isNotEmpty)) {
        return {
          'questionId': id,
          'selectedOption': (a['selectedOption'] ?? '').trim(),
        };
      }
      return {'questionId': id, 'text': (a['text'] ?? '').trim()};
    }).toList();
  }

  static void _validateRequiredAnswers(
    List<Map<String, dynamic>> questions,
    Map<String, Map<String, String>> answers,
  ) {
    for (final q in questions) {
      if (q['required'] == false) continue;
      final id = (q['id'] ?? '').toString().trim();
      if (id.isEmpty) {
        throw const ApiException(
          'Cấu hình đơn đăng ký không hợp lệ (thiếu id câu hỏi).',
        );
      }
      final type = (q['type'] ?? 'short').toString();
      if (type == 'multiple_choice' &&
          ((q['options'] is List) && (q['options'] as List).isNotEmpty)) {
        final opt = (answers[id]?['selectedOption'] ?? '').trim();
        if (opt.isEmpty) {
          throw const ApiException('Vui lòng trả lời tất cả câu hỏi bắt buộc');
        }
      } else {
        final t = (answers[id]?['text'] ?? '').trim();
        if (t.isEmpty) {
          throw const ApiException('Vui lòng trả lời tất cả câu hỏi bắt buộc');
        }
      }
    }
  }

  static Future<bool> _preflightAgeRestrictedServer(
    BuildContext context, {
    required bool isAgeRestricted,
    required String serverDisplayName,
  }) async {
    if (!isAgeRestricted) return true;
    final age = await ServersService.getMyAgeYearsFromProfile();
    if (!context.mounted) return false;
    if (age == null) {
      await showDialog<void>(
        context: context,
        useRootNavigator: true,
        builder: (ctx) => AlertDialog(
          backgroundColor: const Color(0xFF2b2d31),
          title: const Text(
            'Thông tin cần thiết',
            style: TextStyle(color: Color(0xFFF2F3F5)),
          ),
          content: Text(
            'Vui lòng cập nhật ngày sinh trong hồ sơ để tham gia máy chủ giới hạn độ tuổi '
            '(ví dụ máy chủ «$serverDisplayName»).',
            style: const TextStyle(color: Color(0xFFB5BAC1), height: 1.35),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Đã hiểu'),
            ),
          ],
        ),
      );
      return false;
    }
    if (age < 18) {
      await showDialog<void>(
        context: context,
        useRootNavigator: true,
        builder: (ctx) => AlertDialog(
          backgroundColor: const Color(0xFF2b2d31),
          title: const Text(
            'Không thể tham gia',
            style: TextStyle(color: Color(0xFFF2F3F5)),
          ),
          content: Text(
            'Bạn chưa đủ điều kiện về độ tuổi để tham gia máy chủ «$serverDisplayName» '
            '(yêu cầu từ đủ 18 tuổi).',
            style: const TextStyle(color: Color(0xFFB5BAC1), height: 1.35),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Đóng'),
            ),
          ],
        ),
      );
      return false;
    }
    final ok = await showDialog<bool>(
      context: context,
      useRootNavigator: true,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF2b2d31),
        title: const Text(
          'Máy chủ giới hạn độ tuổi',
          style: TextStyle(color: Color(0xFFF2F3F5)),
        ),
        content: Text(
          'Máy chủ «$serverDisplayName» có chứa nội dung nhạy cảm dán nhãn giới hạn độ tuổi. '
          'Bạn có muốn tiếp tục không?',
          style: const TextStyle(color: Color(0xFFB5BAC1), height: 1.35),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Quay lại'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Tiếp tục'),
          ),
        ],
      ),
    );
    return ok == true;
  }

  /// Giao diện giống trang invite web: biệt danh, toggle DM / hoạt động, nút Về tin nhắn / Chấp nhận.
  static Future<InviteCustomizeResult> _showInviteCustomizationSheet(
    BuildContext context, {
    required String presentationName,
    String? presentationAvatarUrl,
    int? memberCount,
    int? onlineCount,
  }) async {
    final defaultLabel = await ServersService.getMyDefaultDisplayLabel();
    final nickCtrl = TextEditingController();
    var allowDm = true;
    var showAct = true;
    var settingsOpen = true;
    try {
      final r = await showModalBottomSheet<InviteCustomizeResult>(
        context: context,
        useRootNavigator: true,
        isScrollControlled: true,
        backgroundColor: const Color(0xFF2b2d31),
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
        ),
        builder: (ctx) {
          final bottom = MediaQuery.paddingOf(ctx).bottom;
          final inset = MediaQuery.viewInsetsOf(ctx).bottom;
          return Padding(
            padding: EdgeInsets.only(bottom: inset),
            child: StatefulBuilder(
              builder: (ctx, setSt) {
                final displayAs = nickCtrl.text.trim().isEmpty
                    ? defaultLabel
                    : nickCtrl.text.trim();
                final statsLine = () {
                  final on = onlineCount;
                  final mem = memberCount;
                  if (on == null && mem == null) return '';
                  final a = on ?? 0;
                  final b = mem ?? 0;
                  return '$a đang trực tuyến   $b thành viên';
                }();

                return DraggableScrollableSheet(
                  expand: false,
                  initialChildSize: 0.88,
                  minChildSize: 0.45,
                  maxChildSize: 0.95,
                  builder: (ctx, scroll) {
                    return ListView(
                      controller: scroll,
                      padding: EdgeInsets.fromLTRB(16, 12, 16, 16 + bottom),
                      children: [
                        Center(
                          child: Container(
                            width: 40,
                            height: 4,
                            decoration: BoxDecoration(
                              color: const Color(0xFF4E5058),
                              borderRadius: BorderRadius.circular(999),
                            ),
                          ),
                        ),
                        const SizedBox(height: 12),
                        Text(
                          presentationName.trim().isEmpty
                              ? 'Máy chủ'
                              : presentationName.trim(),
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            color: Color(0xFFF2F3F5),
                            fontSize: 22,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        const SizedBox(height: 6),
                        const Text(
                          'Bạn được mời tham gia',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            color: Color(0xFFB5BAC1),
                            fontSize: 14,
                          ),
                        ),
                        const SizedBox(height: 14),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            if ((presentationAvatarUrl ?? '').trim().isNotEmpty)
                              ClipRRect(
                                borderRadius: BorderRadius.circular(40),
                                child: Image.network(
                                  (presentationAvatarUrl ?? '').trim(),
                                  width: 80,
                                  height: 80,
                                  fit: BoxFit.cover,
                                  errorBuilder: (_, __, ___) => Container(
                                    width: 80,
                                    height: 80,
                                    alignment: Alignment.center,
                                    decoration: const BoxDecoration(
                                      color: Color(0xFF1e1f22),
                                      shape: BoxShape.circle,
                                    ),
                                    child: const Icon(
                                      Icons.dns,
                                      color: Colors.white54,
                                      size: 40,
                                    ),
                                  ),
                                ),
                              )
                            else
                              Container(
                                width: 80,
                                height: 80,
                                alignment: Alignment.center,
                                decoration: const BoxDecoration(
                                  color: Color(0xFF1e1f22),
                                  shape: BoxShape.circle,
                                ),
                                child: Text(
                                  presentationName.trim().isEmpty
                                      ? '?'
                                      : presentationName
                                            .trim()
                                            .substring(0, 1)
                                            .toUpperCase(),
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 32,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                              ),
                          ],
                        ),
                        if (statsLine.isNotEmpty) ...[
                          const SizedBox(height: 12),
                          Text(
                            statsLine,
                            textAlign: TextAlign.center,
                            style: const TextStyle(
                              color: Color(0xFFB5BAC1),
                              fontSize: 13,
                            ),
                          ),
                        ],
                        const SizedBox(height: 18),
                        InkWell(
                          onTap: () =>
                              setSt(() => settingsOpen = !settingsOpen),
                          borderRadius: BorderRadius.circular(8),
                          child: Padding(
                            padding: const EdgeInsets.symmetric(vertical: 8),
                            child: Row(
                              children: [
                                const Icon(
                                  Icons.auto_awesome,
                                  color: Color(0xFFF2F3F5),
                                  size: 20,
                                ),
                                const SizedBox(width: 8),
                                const Expanded(
                                  child: Text(
                                    'Cài đặt máy chủ',
                                    style: TextStyle(
                                      color: Color(0xFFF2F3F5),
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ),
                                Text(
                                  'Bạn có thể tùy chỉnh bất cứ lúc nào',
                                  style: TextStyle(
                                    color: Colors.grey.shade500,
                                    fontSize: 11,
                                  ),
                                ),
                                Icon(
                                  settingsOpen
                                      ? Icons.expand_less
                                      : Icons.expand_more,
                                  color: Colors.white70,
                                ),
                              ],
                            ),
                          ),
                        ),
                        if (settingsOpen) ...[
                          const SizedBox(height: 8),
                          const Align(
                            alignment: Alignment.centerLeft,
                            child: Text(
                              'Bạn muốn mọi người gọi bạn là gì?',
                              style: TextStyle(
                                color: Color(0xFFB5BAC1),
                                fontSize: 12,
                              ),
                            ),
                          ),
                          const SizedBox(height: 6),
                          TextField(
                            controller: nickCtrl,
                            onChanged: (_) => setSt(() {}),
                            style: const TextStyle(color: Color(0xFFF2F3F5)),
                            decoration: InputDecoration(
                              hintText: defaultLabel,
                              hintStyle: const TextStyle(
                                color: Color(0xFF6d6f78),
                              ),
                              filled: true,
                              fillColor: const Color(0xFF1e1f22),
                              border: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(8),
                                borderSide: const BorderSide(
                                  color: Color(0xFF313338),
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(height: 14),
                          Row(
                            children: [
                              const Expanded(
                                child: Text(
                                  'Cho phép tin nhắn trực tiếp',
                                  style: TextStyle(
                                    color: Color(0xFFF2F3F5),
                                    fontSize: 14,
                                  ),
                                ),
                              ),
                              Switch(
                                value: allowDm,
                                onChanged: (v) => setSt(() => allowDm = v),
                              ),
                            ],
                          ),
                          Row(
                            children: [
                              const Expanded(
                                child: Text(
                                  'Hiển thị trạng thái hoạt động',
                                  style: TextStyle(
                                    color: Color(0xFFF2F3F5),
                                    fontSize: 14,
                                  ),
                                ),
                              ),
                              Switch(
                                value: showAct,
                                onChanged: (v) => setSt(() => showAct = v),
                              ),
                            ],
                          ),
                        ],
                        const SizedBox(height: 20),
                        SizedBox(
                          width: double.infinity,
                          child: FilledButton(
                            style: FilledButton.styleFrom(
                              backgroundColor: const Color(0xFF5865f2),
                              foregroundColor: Colors.white,
                              padding: const EdgeInsets.symmetric(vertical: 14),
                            ),
                            onPressed: () => Navigator.pop(
                              ctx,
                              InviteCustomizeResult.backToMessages(),
                            ),
                            child: const Text('Về trang Tin nhắn'),
                          ),
                        ),
                        const SizedBox(height: 10),
                        SizedBox(
                          width: double.infinity,
                          child: OutlinedButton(
                            style: OutlinedButton.styleFrom(
                              foregroundColor: const Color(0xFFF2F3F5),
                              side: const BorderSide(color: Color(0xFF4e5058)),
                              padding: const EdgeInsets.symmetric(vertical: 14),
                            ),
                            onPressed: () => Navigator.pop(
                              ctx,
                              InviteCustomizeResult.join(
                                nicknameTrimmed: nickCtrl.text,
                                allowDirectMessages: allowDm,
                                showActivity: showAct,
                              ),
                            ),
                            child: Text(
                              displayAs.isNotEmpty
                                  ? 'Chấp nhận với tên $displayAs'
                                  : 'Chấp nhận tham gia',
                            ),
                          ),
                        ),
                        TextButton(
                          onPressed: () => Navigator.pop(
                            ctx,
                            InviteCustomizeResult.cancelled(),
                          ),
                          child: const Text(
                            'Không, cảm ơn',
                            style: TextStyle(color: Color(0xFFB5BAC1)),
                          ),
                        ),
                      ],
                    );
                  },
                );
              },
            ),
          );
        },
      );
      return r ?? InviteCustomizeResult.cancelled();
    } finally {
      nickCtrl.dispose();
    }
  }

  static Future<void> _maybeAcknowledgeAgeAfterJoin(String serverId) async {
    try {
      await ServersService.acknowledgeServerAgeRestriction(serverId);
    } catch (_) {}
  }

  /// `true` when join / apply-submit / fallback completed; `false` when cancelled or failed.
  static Future<bool> joinFromInvite(
    BuildContext context, {
    required String serverId,
    String? webFallbackUrl,
    String? initialChannelId,
    Future<void> Function(String serverId, {String? channelId})?
    onOpenServerInApp,
    String? inboxInviteIdToAcceptAfterJoin,
    String? presentationServerName,
    String? presentationAvatarUrl,
    int? presentationMemberCount,
    int? presentationOnlineCount,
    VoidCallback? onNavigateToMessagesHome,
  }) async {
    if (!context.mounted) return false;
    final loaderDialogHolder = <BuildContext?>[null];
    void openLoad() => _openLoad(context, loaderDialogHolder);
    void closeLoad() => _closeLoad(loaderDialogHolder);

    openLoad();
    try {
      final mine = await ServersService.getMyServers();
      if (!context.mounted) return false;
      if (mine.any((s) => s.id == serverId)) {
        Map<String, dynamic> access = const {};
        try {
          access = await ServersService.getMyAccessStatus(serverId);
        } catch (_) {}
        if (!context.mounted) return false;
        closeLoad();

        final modeStr = (access['accessMode'] ?? 'invite_only').toString();
        final st = (access['status'] ?? '').toString();
        final pendingApply = modeStr == 'apply' && st == 'pending';
        final rejectedApply = modeStr == 'apply' && st == 'rejected';
        final needsRules =
            access['hasRules'] == true && access['acceptedRules'] != true;

        if (pendingApply) {
          await onOpenServerInApp?.call(serverId, channelId: initialChannelId);
          return true;
        }
        if (rejectedApply) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text(
                'Đơn đăng ký tham gia máy chủ của bạn đã bị từ chối.',
              ),
            ),
          );
          await onOpenServerInApp?.call(serverId, channelId: initialChannelId);
          return true;
        }

        if (needsRules) {
          final settingsExisting =
              await ServersService.getServerAccessSettings(serverId);
          if (!context.mounted) return false;
          final serverLabelRules =
              (presentationServerName ?? '').trim().isEmpty
              ? 'Máy chủ'
              : presentationServerName!.trim();
          final ageOk = await _preflightAgeRestrictedServer(
            context,
            isAgeRestricted: settingsExisting['isAgeRestricted'] == true,
            serverDisplayName: serverLabelRules,
          );
          if (!ageOk || !context.mounted) return false;
          final agreed =
              await showRulesAgreementDialog(context, settingsExisting);
          if (agreed != true || !context.mounted) return false;
          openLoad();
          if (!context.mounted) return false;
          try {
            await ServersService.acceptServerRules(serverId);
          } on ApiException catch (e) {
            closeLoad();
            if (context.mounted) {
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(content: Text(e.message)),
              );
            }
            return false;
          }
          closeLoad();
          if (!context.mounted) return false;
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Đã đồng ý quy định máy chủ.')),
          );
          await onOpenServerInApp?.call(serverId, channelId: initialChannelId);
          return true;
        }

        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Bạn đã là thành viên máy chủ này.')),
        );
        await onOpenServerInApp?.call(serverId, channelId: initialChannelId);
        return true;
      }

      final settings = await ServersService.getServerAccessSettings(serverId);
      final mode = (settings['accessMode'] ?? 'invite_only').toString();
      final hasRulesFlag = settings['hasRules'] == true;
      final isAgeRestricted = settings['isAgeRestricted'] == true;
      final joinForm = await _loadJoinForm(serverId, settings);
      final questions = _coerceQuestions(joinForm['questions']);
      final formEnabled = joinForm['enabled'] == true;

      closeLoad();
      if (!context.mounted) return false;

      final presentationName = (presentationServerName ?? '').trim().isEmpty
          ? 'Máy chủ'
          : presentationServerName!.trim();

      final ageOk = await _preflightAgeRestrictedServer(
        context,
        isAgeRestricted: isAgeRestricted,
        serverDisplayName: presentationName,
      );
      if (!ageOk || !context.mounted) return false;

      final customize = await _showInviteCustomizationSheet(
        context,
        presentationName: presentationName,
        presentationAvatarUrl: presentationAvatarUrl,
        memberCount: presentationMemberCount,
        onlineCount: presentationOnlineCount,
      );
      if (!context.mounted) return false;

      if (customize.wantsBackToMessages) {
        onNavigateToMessagesHome?.call();
        return false;
      }
      if (!customize.wantsJoin) {
        return false;
      }

      final String? joinNickname = customize.nicknameTrimmed.trim().isEmpty
          ? null
          : customize.nicknameTrimmed.trim();

      if (mode == 'apply') {
        if (hasRulesFlag) {
          final agreed = await showRulesAgreementDialog(context, settings);
          if (agreed != true || !context.mounted) return false;
        }
        Map<String, Map<String, String>>? answers;
        if (formEnabled) {
          for (final q in questions) {
            final qid = (q['id'] ?? '').toString().trim();
            if (qid.isEmpty) {
              if (context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text(
                      'Đơn đăng ký máy chủ không hợp lệ (thiếu id câu hỏi).',
                    ),
                  ),
                );
              }
              return false;
            }
          }
          answers = await _collectApplicationAnswers(
            context,
            questions: questions,
            formEnabled: formEnabled,
            serverName: presentationServerName,
            serverAvatarUrl: presentationAvatarUrl,
          );
          if (answers == null || !context.mounted) return false;
          if (questions.isNotEmpty) {
            try {
              _validateRequiredAnswers(questions, answers);
            } on ApiException catch (e) {
              if (context.mounted) {
                ScaffoldMessenger.of(
                  context,
                ).showSnackBar(SnackBar(content: Text(e.message)));
              }
              return false;
            }
          }
        }
        openLoad();
        if (!context.mounted) return false;
        try {
          final payload = (formEnabled && questions.isNotEmpty)
              ? _applicationAnswersPayload(questions, answers ?? {})
              : null;
          await ServersService.joinServer(
            serverId,
            rulesAccepted: hasRulesFlag ? true : null,
            nickname: joinNickname,
            applicationAnswers: payload,
          );
        } on ApiException catch (e) {
          closeLoad();
          if (context.mounted) {
            ScaffoldMessenger.of(
              context,
            ).showSnackBar(SnackBar(content: Text(e.message)));
          }
          return false;
        }
        if (inboxInviteIdToAcceptAfterJoin != null) {
          try {
            await ServersService.acceptServerInvite(
              inboxInviteIdToAcceptAfterJoin,
            );
          } catch (_) {}
        }
        if (isAgeRestricted) {
          await _maybeAcknowledgeAgeAfterJoin(serverId);
        }
        closeLoad();
        if (!context.mounted) return false;
        await onOpenServerInApp?.call(serverId, channelId: initialChannelId);
        return true;
      }

      if (hasRulesFlag) {
        final agreed = await showRulesAgreementDialog(context, settings);
        if (agreed != true || !context.mounted) return false;
      }

      openLoad();
      if (!context.mounted) return false;
      try {
        await ServersService.joinServer(
          serverId,
          nickname: joinNickname,
          rulesAccepted: hasRulesFlag ? true : null,
        );
      } on ApiException catch (e) {
        final msg = e.message;
        if (webFallbackUrl != null &&
            (msg.toLowerCase().contains('invite') ||
                msg.contains('lời mời') ||
                msg.contains('invite link'))) {
          closeLoad();
          final uri = Uri.parse(webFallbackUrl);
          if (await canLaunchUrl(uri)) {
            await launchUrl(uri, mode: LaunchMode.externalApplication);
          }
          return true;
        }
        closeLoad();
        if (context.mounted) {
          ScaffoldMessenger.of(
            context,
          ).showSnackBar(SnackBar(content: Text(msg)));
        }
        return false;
      }
      if (inboxInviteIdToAcceptAfterJoin != null) {
        try {
          await ServersService.acceptServerInvite(
            inboxInviteIdToAcceptAfterJoin,
          );
        } catch (_) {}
      }
      if (isAgeRestricted) {
        await _maybeAcknowledgeAgeAfterJoin(serverId);
      }
      closeLoad();
      if (!context.mounted) return false;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Đã tham gia máy chủ.')));
      await onOpenServerInApp?.call(serverId, channelId: initialChannelId);
      return true;
    } on ApiException catch (e) {
      closeLoad();
      if (context.mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(e.message)));
      }
      if (webFallbackUrl != null && context.mounted) {
        final uri = Uri.parse(webFallbackUrl);
        if (await canLaunchUrl(uri)) {
          await launchUrl(uri, mode: LaunchMode.externalApplication);
          return true;
        }
      }
      return false;
    } catch (e) {
      closeLoad();
      if (context.mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('$e')));
      }
      return false;
    }
  }
}
