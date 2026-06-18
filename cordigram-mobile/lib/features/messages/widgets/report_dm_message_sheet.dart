import 'package:flutter/material.dart';

import '../../../core/services/language_controller.dart';
import '../services/direct_messages_service.dart';

/// DM message report — aligned with web `ReportMessageDialog` reason keys.
Future<bool> showReportDmMessageSheet({
  required BuildContext context,
  required String messageId,
}) async {
  const reasons = <Map<String, String>>[
    {'key': 'spam', 'label': 'Spam'},
    {'key': 'harassment', 'label': 'Quấy rối'},
    {'key': 'inappropriate', 'label': 'Nội dung không phù hợp'},
    {'key': 'misinfo', 'label': 'Thông tin sai lệch'},
    {'key': 'scam', 'label': 'Lừa đảo'},
    {'key': 'other', 'label': 'Khác'},
  ];

  String? selected;
  final descriptionController = TextEditingController();

  final submitted = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    backgroundColor: const Color(0xFF0B1424),
    builder: (ctx) {
      return StatefulBuilder(
        builder: (context, setModalState) {
          return Padding(
            padding: EdgeInsets.only(
              bottom: MediaQuery.viewInsetsOf(context).bottom,
            ),
            child: SafeArea(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Row(
                      children: [
                        const Expanded(
                          child: Text(
                            'Báo cáo tin nhắn',
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: 17,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                        IconButton(
                          onPressed: () => Navigator.of(ctx).pop(false),
                          icon: const Icon(Icons.close, color: Colors.white70),
                        ),
                      ],
                    ),
                    const Text(
                      'Chọn lý do',
                      style: TextStyle(
                        color: Color(0xFFAFC0E2),
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: reasons.map((r) {
                        final label = r['label']!;
                        final picked = selected == label;
                        return FilterChip(
                          label: Text(label),
                          selected: picked,
                          onSelected: (_) {
                            setModalState(() => selected = label);
                          },
                          selectedColor: const Color(0xFF2D7EFF),
                          labelStyle: TextStyle(
                            color: picked ? Colors.white : const Color(0xFFC3D4F7),
                          ),
                          backgroundColor: const Color(0xFF1D2E52),
                        );
                      }).toList(),
                    ),
                    const SizedBox(height: 14),
                    const Text(
                      'Mô tả thêm (tuỳ chọn)',
                      style: TextStyle(
                        color: Color(0xFFAFC0E2),
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 8),
                    TextField(
                      controller: descriptionController,
                      maxLines: 3,
                      style: const TextStyle(color: Colors.white),
                      decoration: InputDecoration(
                        hintText: LanguageController.instance.t('messages.reportDescriptionHint'),
                        hintStyle: const TextStyle(color: Color(0xFF6B7FA8)),
                        filled: true,
                        fillColor: const Color(0xFF1D2E52),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(10),
                          borderSide: BorderSide.none,
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton(
                        onPressed: selected == null
                            ? null
                            : () async {
                                try {
                                  await DirectMessagesService.reportMessage(
                                    messageId,
                                    reason: selected!,
                                    description:
                                        descriptionController.text.trim().isEmpty
                                        ? null
                                        : descriptionController.text.trim(),
                                  );
                                  if (ctx.mounted) Navigator.of(ctx).pop(true);
                                } catch (e) {
                                  if (!ctx.mounted) return;
                                  ScaffoldMessenger.of(ctx).showSnackBar(
                                    SnackBar(content: Text(LanguageController.instance.t('messages.reportFailed'))),
                                  );
                                }
                              },
                        child: Text(LanguageController.instance.t('messages.sendReport')),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          );
        },
      );
    },
  );

  descriptionController.dispose();
  return submitted == true;
}
