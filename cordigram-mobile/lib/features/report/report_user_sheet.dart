import 'package:flutter/material.dart';
import '../../core/services/api_service.dart';
import '../../core/services/language_controller.dart';

class _UserReportCategory {
  const _UserReportCategory({
    required this.key,
    required this.label,
    required this.accent,
    required this.reasons,
  });

  final String key;
  final String label;
  final Color accent;
  final List<_UserReportReason> reasons;
}

class _UserReportReason {
  const _UserReportReason({required this.key, required this.label});

  final String key;
  final String label;
}

const List<_UserReportCategory> _kUserReportGroups = [
  _UserReportCategory(
    key: 'abuse',
    label: 'Harassment / Hate',
    accent: Color(0xFFF59E0B),
    reasons: [
      _UserReportReason(key: 'harassment', label: 'Harassment or bullying'),
      _UserReportReason(key: 'hate_speech', label: 'Hate speech or slurs'),
      _UserReportReason(
        key: 'offensive_discrimination',
        label: 'Offensive discrimination',
      ),
    ],
  ),
  _UserReportCategory(
    key: 'violence',
    label: 'Threats / Safety',
    accent: Color(0xFFEF4444),
    reasons: [
      _UserReportReason(
        key: 'violence_threats',
        label: 'Violence or physical threats',
      ),
      _UserReportReason(key: 'graphic_violence', label: 'Graphic violence'),
      _UserReportReason(key: 'self_harm', label: 'Encouraging self-harm'),
      _UserReportReason(key: 'extremism', label: 'Extremism or terrorism'),
    ],
  ),
  _UserReportCategory(
    key: 'misinfo',
    label: 'Impersonation / Misleading',
    accent: Color(0xFF22C55E),
    reasons: [
      _UserReportReason(
        key: 'impersonation',
        label: 'Pretending to be someone else',
      ),
      _UserReportReason(key: 'fake_news', label: 'Fake news or misinformation'),
    ],
  ),
  _UserReportCategory(
    key: 'spam',
    label: 'Spam / Scam',
    accent: Color(0xFF14B8A6),
    reasons: [
      _UserReportReason(key: 'spam', label: 'Spam or mass mentions'),
      _UserReportReason(key: 'financial_scam', label: 'Scam or fraud'),
      _UserReportReason(key: 'unsolicited_ads', label: 'Unwanted promotions'),
    ],
  ),
  _UserReportCategory(
    key: 'privacy',
    label: 'Privacy violation',
    accent: Color(0xFF06B6D4),
    reasons: [
      _UserReportReason(key: 'doxxing', label: 'Sharing private information'),
      _UserReportReason(
        key: 'nonconsensual_intimate',
        label: 'Non-consensual intimate content',
      ),
    ],
  ),
  _UserReportCategory(
    key: 'other',
    label: 'Other',
    accent: Color(0xFF94A3B8),
    reasons: [_UserReportReason(key: 'other', label: 'Other reason')],
  ),
];

Future<bool> showReportUserSheet(
  BuildContext context, {
  required String userId,
  required Map<String, String> authHeader,
}) async {
  final result = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _ReportUserSheet(userId: userId, authHeader: authHeader),
  );
  return result == true;
}

class _ReportUserSheet extends StatefulWidget {
  const _ReportUserSheet({required this.userId, required this.authHeader});

  final String userId;
  final Map<String, String> authHeader;

  @override
  State<_ReportUserSheet> createState() => _ReportUserSheetState();
}

class _ReportUserSheetState extends State<_ReportUserSheet> {
  _UserReportCategory? _selectedCategory;
  _UserReportReason? _selectedReason;
  final _noteCtrl = TextEditingController();
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _noteCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_selectedCategory == null || _selectedReason == null || _submitting) {
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      await ApiService.post(
        '/report-users/${widget.userId}',
        body: {
          'category': _selectedCategory!.key,
          'reason': _selectedReason!.key,
          if (_noteCtrl.text.trim().isNotEmpty) 'note': _noteCtrl.text.trim(),
        },
        extraHeaders: widget.authHeader,
      );
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _submitting = false;
        _error = LanguageController.instance.t('report.submitError');
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottomPad =
        MediaQuery.of(context).viewInsets.bottom +
        MediaQuery.of(context).viewPadding.bottom;

    return Container(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.85,
      ),
      decoration: const BoxDecoration(
        color: Color(0xFF111827),
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Center(
            child: Container(
              margin: const EdgeInsets.only(top: 12, bottom: 4),
              width: 36,
              height: 4,
              decoration: BoxDecoration(
                color: const Color(0xFF374151),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            child: Row(
              children: [
                if (_selectedCategory != null)
                  GestureDetector(
                    onTap: () => setState(() {
                      _selectedCategory = null;
                      _selectedReason = null;
                    }),
                    child: const Padding(
                      padding: EdgeInsets.only(right: 10),
                      child: Icon(
                        Icons.arrow_back_ios_new_rounded,
                        size: 16,
                        color: Color(0xFF7A8BB0),
                      ),
                    ),
                  ),
                Text(
                  LanguageController.instance.t('report.title.user'),
                  style: const TextStyle(
                    color: Color(0xFFE8ECF8),
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const Spacer(),
                GestureDetector(
                  onTap: () => Navigator.of(context).pop(false),
                  child: const Icon(
                    Icons.close_rounded,
                    color: Color(0xFF7A8BB0),
                    size: 22,
                  ),
                ),
              ],
            ),
          ),
          const Divider(height: 1, color: Color(0xFF1F2A3D)),
          Flexible(
            child: SingleChildScrollView(
              padding: EdgeInsets.fromLTRB(16, 16, 16, 16 + bottomPad),
              child: _selectedCategory == null
                  ? _buildCategoryStep()
                  : _buildReasonStep(),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCategoryStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          LanguageController.instance.t('report.whatsTheIssue'),
          style: const TextStyle(
            color: Color(0xFFCDD5E0),
            fontSize: 14,
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 14),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: _kUserReportGroups.map((g) {
            return GestureDetector(
              onTap: () => setState(() {
                _selectedCategory = g;
                _selectedReason = null;
              }),
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 9,
                ),
                decoration: BoxDecoration(
                  color: g.accent.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(
                    color: g.accent.withValues(alpha: 0.4),
                    width: 1,
                  ),
                ),
                child: Text(
                  LanguageController.instance.t('report.categoryUser.${g.key}'),
                  style: const TextStyle(
                    color: Color(0xFFE8ECF8),
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            );
          }).toList(),
        ),
      ],
    );
  }

  Widget _buildReasonStep() {
    final cat = _selectedCategory!;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          LanguageController.instance.t('report.categoryUser.${cat.key}'),
          style: TextStyle(
            color: cat.accent,
            fontSize: 15,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 12),
        ...cat.reasons.map((reason) {
          final selected = _selectedReason?.key == reason.key;
          return GestureDetector(
            onTap: () => setState(() => _selectedReason = reason),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 150),
              margin: const EdgeInsets.only(bottom: 10),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
              decoration: BoxDecoration(
                color: selected
                    ? cat.accent.withValues(alpha: 0.15)
                    : const Color(0xFF0F172A),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(
                  color: selected
                      ? cat.accent.withValues(alpha: 0.7)
                      : const Color(0xFF1F2A3D),
                ),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      LanguageController.instance.t('report.reasonUser.${reason.key}'),
                      style: const TextStyle(
                        color: Color(0xFFE8ECF8),
                        fontSize: 14,
                      ),
                    ),
                  ),
                  Icon(
                    selected
                        ? Icons.radio_button_checked
                        : Icons.radio_button_off,
                    size: 18,
                    color: selected ? cat.accent : const Color(0xFF64748B),
                  ),
                ],
              ),
            ),
          );
        }),
        const SizedBox(height: 8),
        Text(
          LanguageController.instance.t('report.additionalDetails'),
          style: const TextStyle(
            color: Color(0xFF94A3B8),
            fontSize: 12,
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 8),
        TextField(
          controller: _noteCtrl,
          minLines: 3,
          maxLines: 5,
          style: const TextStyle(color: Color(0xFFE8ECF8), fontSize: 14),
          decoration: InputDecoration(
            hintText: LanguageController.instance.t('report.addMoreContext'),
            hintStyle: const TextStyle(color: Color(0xFF64748B), fontSize: 13),
            filled: true,
            fillColor: const Color(0xFF0F172A),
            contentPadding: const EdgeInsets.symmetric(
              horizontal: 12,
              vertical: 10,
            ),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: const BorderSide(color: Color(0xFF1F2A3D)),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: const BorderSide(color: Color(0xFF1F2A3D)),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: BorderSide(color: cat.accent),
            ),
          ),
        ),
        if (_error != null) ...[
          const SizedBox(height: 10),
          Text(
            _error!,
            style: const TextStyle(color: Color(0xFFF87171), fontSize: 12),
          ),
        ],
        const SizedBox(height: 14),
        SizedBox(
          width: double.infinity,
          child: ElevatedButton(
            onPressed: _submitting ? null : _submit,
            style: ElevatedButton.styleFrom(
              backgroundColor: cat.accent,
              foregroundColor: Colors.white,
              disabledBackgroundColor: const Color(0xFF334155),
              disabledForegroundColor: const Color(0xFF94A3B8),
              padding: const EdgeInsets.symmetric(vertical: 12),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(10),
              ),
            ),
            child: Text(LanguageController.instance.t(_submitting ? 'report.submitting' : 'report.submitReport')),
          ),
        ),
      ],
    );
  }
}
