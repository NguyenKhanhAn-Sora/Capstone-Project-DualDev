import 'package:flutter/material.dart';

import '../../../core/services/api_service.dart';
import '../../notifications/services/notification_service.dart';

const List<Map<String, dynamic>> _muteOptions = [
  {'key': '5m', 'label': '5 minutes', 'ms': 5 * 60 * 1000},
  {'key': '10m', 'label': '10 minutes', 'ms': 10 * 60 * 1000},
  {'key': '15m', 'label': '15 minutes', 'ms': 15 * 60 * 1000},
  {'key': '30m', 'label': '30 minutes', 'ms': 30 * 60 * 1000},
  {'key': '1h', 'label': '1 hour', 'ms': 60 * 60 * 1000},
  {'key': '1d', 'label': '1 day', 'ms': 24 * 60 * 60 * 1000},
  {'key': 'until', 'label': 'Until I turn it back on', 'ms': null},
  {'key': 'custom', 'label': 'Choose date & time', 'ms': null},
];

Future<String?> _pickCustomDate(BuildContext context, String current) async {
  final now = DateTime.now();
  final initial = DateTime.tryParse(current) ?? now;
  final picked = await showDatePicker(
    context: context,
    initialDate: initial,
    firstDate: now,
    lastDate: now.add(const Duration(days: 3650)),
    builder: (ctx, child) => Theme(
      data: Theme.of(ctx).copyWith(
        colorScheme: const ColorScheme.dark(
          surface: Color(0xFF101A33),
          primary: Color(0xFF5E86C2),
          onSurface: Color(0xFFE8ECF8),
        ),
        dialogTheme: const DialogThemeData(backgroundColor: Color(0xFF101A33)),
      ),
      child: child!,
    ),
  );
  if (picked == null) return null;
  final y = picked.year.toString().padLeft(4, '0');
  final m = picked.month.toString().padLeft(2, '0');
  final d = picked.day.toString().padLeft(2, '0');
  return '$y-$m-$d';
}

Future<String?> _pickCustomTime(BuildContext context, String current) async {
  TimeOfDay initial = TimeOfDay.now();
  final pieces = current.split(':');
  if (pieces.length == 2) {
    final h = int.tryParse(pieces[0]);
    final m = int.tryParse(pieces[1]);
    if (h != null && m != null) initial = TimeOfDay(hour: h, minute: m);
  }
  final picked = await showTimePicker(
    context: context,
    initialTime: initial,
    builder: (ctx, child) => Theme(
      data: Theme.of(ctx).copyWith(
        colorScheme: const ColorScheme.dark(
          surface: Color(0xFF101A33),
          primary: Color(0xFF5E86C2),
          onSurface: Color(0xFFE8ECF8),
        ),
        dialogTheme: const DialogThemeData(backgroundColor: Color(0xFF101A33)),
      ),
      child: child!,
    ),
  );
  if (picked == null) return null;
  final h = picked.hour.toString().padLeft(2, '0');
  final m = picked.minute.toString().padLeft(2, '0');
  return '$h:$m';
}

String? _buildLocalDateTimeIso(String date, String time) {
  if (date.isEmpty || time.isEmpty) return null;
  final local = DateTime.tryParse('$date $time');
  return local?.toUtc().toIso8601String();
}

Future<bool> showPostMuteOverlay(
  BuildContext context, {
  required String postId,
  required String kindLabel,
}) async {
  String selected = '5m';
  String customDate = '';
  String customTime = '';
  String? error;
  bool saving = false;
  bool didSave = false;

  await showDialog<void>(
    context: context,
    barrierColor: Colors.black.withValues(alpha: 0.55),
    builder: (dialogCtx) {
      return StatefulBuilder(
        builder: (ctx, setModalState) {
          return Dialog(
            backgroundColor: const Color(0xFF0E1730),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(18),
            ),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Mute this $kindLabel',
                              style: const TextStyle(
                                color: Color(0xFFE8ECF8),
                                fontSize: 20,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                            const SizedBox(height: 6),
                            const Text(
                              'Choose how long to pause notifications.',
                              style: TextStyle(
                                color: Color(0xFF9BAECF),
                                fontSize: 14,
                              ),
                            ),
                          ],
                        ),
                      ),
                      IconButton(
                        onPressed: saving
                            ? null
                            : () => Navigator.of(dialogCtx).pop(),
                        icon: const Icon(
                          Icons.close_rounded,
                          color: Color(0xFFD0D8EE),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  LayoutBuilder(
                    builder: (_, constraints) {
                      final itemWidth = (constraints.maxWidth - 8) / 2;

                      Widget buildOptionTile(
                        Map<String, dynamic> opt, {
                        double? width,
                      }) {
                        final key = opt['key'] as String;
                        final active = selected == key;
                        return GestureDetector(
                          onTap: saving
                              ? null
                              : () => setModalState(() {
                                  selected = key;
                                  error = null;
                                }),
                          child: Container(
                            width: width,
                            padding: const EdgeInsets.symmetric(
                              horizontal: 12,
                              vertical: 12,
                            ),
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(
                                color: active
                                    ? const Color(0xFF5E86C2)
                                    : const Color(0xFF233B63),
                              ),
                              color: active
                                  ? const Color(0xFF1B3558)
                                  : Colors.transparent,
                            ),
                            child: Text(
                              opt['label'] as String,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                color: active
                                    ? const Color(0xFFE8ECF8)
                                    : const Color(0xFF9BAECF),
                                fontWeight: FontWeight.w700,
                                fontSize: 13,
                              ),
                            ),
                          ),
                        );
                      }

                      final quickOptions = _muteOptions
                          .where((opt) {
                            final key = opt['key'] as String;
                            return key != 'until' && key != 'custom';
                          })
                          .toList(growable: false);
                      final endingOptions = _muteOptions
                          .where((opt) {
                            final key = opt['key'] as String;
                            return key == 'until' || key == 'custom';
                          })
                          .toList(growable: false);

                      return Column(
                        children: [
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: quickOptions
                                .map(
                                  (opt) =>
                                      buildOptionTile(opt, width: itemWidth),
                                )
                                .toList(growable: false),
                          ),
                          if (endingOptions.isNotEmpty) ...[
                            const SizedBox(height: 8),
                            Column(
                              children: [
                                for (
                                  var i = 0;
                                  i < endingOptions.length;
                                  i++
                                ) ...[
                                  if (i > 0) const SizedBox(height: 8),
                                  buildOptionTile(
                                    endingOptions[i],
                                    width: constraints.maxWidth,
                                  ),
                                ],
                              ],
                            ),
                          ],
                        ],
                      );
                    },
                  ),
                  if (selected == 'custom') ...[
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton.icon(
                            onPressed: saving
                                ? null
                                : () async {
                                    final next = await _pickCustomDate(
                                      context,
                                      customDate,
                                    );
                                    if (next == null) return;
                                    setModalState(() {
                                      customDate = next;
                                      error = null;
                                    });
                                  },
                            icon: const Icon(
                              Icons.calendar_today_outlined,
                              size: 16,
                            ),
                            label: Text(
                              customDate.isEmpty ? 'Select date' : customDate,
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: OutlinedButton.icon(
                            onPressed: saving
                                ? null
                                : () async {
                                    final next = await _pickCustomTime(
                                      context,
                                      customTime,
                                    );
                                    if (next == null) return;
                                    setModalState(() {
                                      customTime = next;
                                      error = null;
                                    });
                                  },
                            icon: const Icon(Icons.schedule_rounded, size: 16),
                            label: Text(
                              customTime.isEmpty ? 'Select time' : customTime,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                  if (error != null) ...[
                    const SizedBox(height: 10),
                    Text(
                      error!,
                      style: const TextStyle(
                        color: Color(0xFFF87171),
                        fontSize: 13,
                      ),
                    ),
                  ],
                  const SizedBox(height: 14),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      TextButton(
                        onPressed: saving
                            ? null
                            : () => Navigator.of(dialogCtx).pop(),
                        child: const Text('Cancel'),
                      ),
                      const SizedBox(width: 8),
                      FilledButton(
                        onPressed: saving
                            ? null
                            : () async {
                                setModalState(() {
                                  saving = true;
                                  error = null;
                                });
                                try {
                                  String? mutedUntil;
                                  bool mutedIndefinitely = false;
                                  final selectedOpt = _muteOptions.firstWhere(
                                    (opt) => opt['key'] == selected,
                                  );

                                  if (selected == 'until') {
                                    mutedIndefinitely = true;
                                  } else if (selected == 'custom') {
                                    final iso = _buildLocalDateTimeIso(
                                      customDate,
                                      customTime,
                                    );
                                    if (iso == null) {
                                      setModalState(() {
                                        saving = false;
                                        error =
                                            'Please select a valid date and time.';
                                      });
                                      return;
                                    }
                                    final dt = DateTime.parse(iso);
                                    if (!dt.isAfter(DateTime.now().toUtc())) {
                                      setModalState(() {
                                        saving = false;
                                        error = 'Please choose a future time.';
                                      });
                                      return;
                                    }
                                    mutedUntil = iso;
                                  } else {
                                    final ms = selectedOpt['ms'] as int?;
                                    if (ms != null) {
                                      mutedUntil = DateTime.now()
                                          .toUtc()
                                          .add(Duration(milliseconds: ms))
                                          .toIso8601String();
                                    } else {
                                      mutedIndefinitely = true;
                                    }
                                  }

                                  await NotificationService.updatePostMute(
                                    postId: postId,
                                    mutedUntil: mutedUntil,
                                    mutedIndefinitely: mutedIndefinitely,
                                  );
                                  didSave = true;
                                  if (ctx.mounted) {
                                    Navigator.of(dialogCtx).pop();
                                  }
                                } catch (e) {
                                  setModalState(() {
                                    saving = false;
                                    error = e is ApiException
                                        ? e.message
                                        : 'Failed to update notifications';
                                  });
                                }
                              },
                        child: Text(saving ? 'Saving...' : 'Save'),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          );
        },
      );
    },
  );

  return didSave;
}
