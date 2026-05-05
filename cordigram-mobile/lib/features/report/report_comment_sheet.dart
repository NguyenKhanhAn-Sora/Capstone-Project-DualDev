import 'package:flutter/material.dart';
import '../../core/config/app_theme.dart';
import '../../core/services/api_service.dart';
import '../../core/services/language_controller.dart';

// ── Report category / reason model ───────────────────────────────────────────

class _ReportCategory {
  const _ReportCategory({
    required this.key,
    required this.label,
    required this.accent,
    required this.reasons,
  });
  final String key;
  final String label;
  final Color accent;
  final List<_ReportReason> reasons;
}

class _ReportReason {
  const _ReportReason({required this.key, required this.label});
  final String key;
  final String label;
}

// Mirrors web REPORT_GROUPS
const List<_ReportCategory> _kReportGroups = [
  _ReportCategory(
    key: 'abuse',
    label: 'Harassment / Hate speech',
    accent: Color(0xFFF59E0B),
    reasons: [
      _ReportReason(
        key: 'harassment',
        label: 'Targets an individual to harass',
      ),
      _ReportReason(key: 'hate_speech', label: 'Hate speech or discrimination'),
      _ReportReason(
        key: 'offensive_discrimination',
        label: 'Attacks vulnerable groups',
      ),
    ],
  ),
  _ReportCategory(
    key: 'violence',
    label: 'Violence / Threats',
    accent: Color(0xFFEF4444),
    reasons: [
      _ReportReason(
        key: 'violence_threats',
        label: 'Threatens or promotes violence',
      ),
      _ReportReason(key: 'graphic_violence', label: 'Graphic violent imagery'),
      _ReportReason(key: 'extremism', label: 'Extremism or terrorism'),
      _ReportReason(key: 'self_harm', label: 'Self-harm or suicide'),
    ],
  ),
  _ReportCategory(
    key: 'sensitive',
    label: 'Sensitive content',
    accent: Color(0xFFA855F7),
    reasons: [
      _ReportReason(key: 'nudity', label: 'Nudity or adult content'),
      _ReportReason(key: 'minor_nudity', label: 'Minor safety risk'),
      _ReportReason(key: 'sexual_solicitation', label: 'Sexual solicitation'),
    ],
  ),
  _ReportCategory(
    key: 'misinfo',
    label: 'Impersonation / Misinformation',
    accent: Color(0xFF22C55E),
    reasons: [
      _ReportReason(key: 'fake_news', label: 'False or misleading information'),
      _ReportReason(
        key: 'impersonation',
        label: 'Impersonation of a person or org',
      ),
    ],
  ),
  _ReportCategory(
    key: 'spam',
    label: 'Spam / Scam',
    accent: Color(0xFF14B8A6),
    reasons: [
      _ReportReason(key: 'spam', label: 'Spam or irrelevant content'),
      _ReportReason(key: 'financial_scam', label: 'Financial scam'),
      _ReportReason(key: 'unsolicited_ads', label: 'Unwanted advertising'),
    ],
  ),
  _ReportCategory(
    key: 'ip',
    label: 'Intellectual property',
    accent: Color(0xFF3B82F6),
    reasons: [
      _ReportReason(key: 'copyright', label: 'Copyright infringement'),
      _ReportReason(key: 'trademark', label: 'Trademark violation'),
      _ReportReason(key: 'brand_impersonation', label: 'Brand impersonation'),
    ],
  ),
  _ReportCategory(
    key: 'illegal',
    label: 'Illegal activity',
    accent: Color(0xFFF97316),
    reasons: [
      _ReportReason(key: 'contraband', label: 'Contraband'),
      _ReportReason(key: 'illegal_transaction', label: 'Illegal transaction'),
    ],
  ),
  _ReportCategory(
    key: 'privacy',
    label: 'Privacy violation',
    accent: Color(0xFF06B6D4),
    reasons: [
      _ReportReason(key: 'doxxing', label: 'Doxxing private information'),
      _ReportReason(
        key: 'nonconsensual_intimate',
        label: 'Non-consensual intimate content',
      ),
    ],
  ),
  _ReportCategory(
    key: 'other',
    label: 'Other',
    accent: Color(0xFF94A3B8),
    reasons: [_ReportReason(key: 'other', label: 'Other reason')],
  ),
];

// ── Public helper ─────────────────────────────────────────────────────────────

/// Shows a multi-step bottom sheet to report a comment.
/// Returns `true` when the report was submitted successfully.
Future<bool> showReportCommentSheet(
  BuildContext context, {
  required String commentId,
  required Map<String, String> authHeader,
}) async {
  final result = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) =>
        _ReportCommentSheet(commentId: commentId, authHeader: authHeader),
  );
  return result == true;
}

// ── Sheet widget ──────────────────────────────────────────────────────────────

class _ReportCommentSheet extends StatefulWidget {
  const _ReportCommentSheet({
    required this.commentId,
    required this.authHeader,
  });
  final String commentId;
  final Map<String, String> authHeader;

  @override
  State<_ReportCommentSheet> createState() => _ReportCommentSheetState();
}

class _ReportCommentSheetState extends State<_ReportCommentSheet> {
  _ReportCategory? _selectedCategory;
  _ReportReason? _selectedReason;
  final _noteCtrl = TextEditingController();
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _noteCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_selectedCategory == null || _selectedReason == null) return;
    if (_submitting) return;
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      await ApiService.post(
        '/report-comments/${widget.commentId}',
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
    final theme = Theme.of(context);
    final tokens =
        theme.extension<AppSemanticColors>() ??
        (theme.brightness == Brightness.dark
            ? AppSemanticColors.dark
            : AppSemanticColors.light);
    final bottomPad =
        MediaQuery.of(context).viewInsets.bottom +
        MediaQuery.of(context).viewPadding.bottom;

    return Container(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.85,
      ),
      decoration: BoxDecoration(
        color: tokens.panel,
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Drag handle
          Center(
            child: Container(
              margin: const EdgeInsets.only(top: 12, bottom: 4),
              width: 36,
              height: 4,
              decoration: BoxDecoration(
                color: tokens.textMuted.withValues(alpha: 0.28),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          // Header row
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
                    child: Padding(
                      padding: const EdgeInsets.only(right: 10),
                      child: Icon(
                        Icons.arrow_back_ios_new_rounded,
                        size: 16,
                        color: tokens.textMuted,
                      ),
                    ),
                  ),
                Text(
                  LanguageController.instance.t('report.title.comment'),
                  style: TextStyle(
                    color: tokens.text,
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const Spacer(),
                GestureDetector(
                  onTap: () => Navigator.of(context).pop(false),
                  child: Icon(
                    Icons.close_rounded,
                    color: tokens.textMuted,
                    size: 22,
                  ),
                ),
              ],
            ),
          ),
          Divider(height: 1, color: tokens.panelBorder),
          // Scrollable body
          Flexible(
            child: SingleChildScrollView(
              padding: EdgeInsets.fromLTRB(16, 16, 16, 16 + bottomPad),
              child: _selectedCategory == null
                  ? _buildCategoryStep(tokens)
                  : _buildReasonStep(tokens, theme),
            ),
          ),
        ],
      ),
    );
  }

  // Step 1: Category selection
  Widget _buildCategoryStep(AppSemanticColors tokens) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          LanguageController.instance.t('report.whatsTheIssue'),
          style: TextStyle(
            color: tokens.text,
            fontSize: 14,
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 14),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: _kReportGroups.map((g) {
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
                  LanguageController.instance.t('report.category.${g.key}'),
                  style: TextStyle(
                    color: g.accent,
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

  // Step 2: Reason + optional note
  Widget _buildReasonStep(AppSemanticColors tokens, ThemeData theme) {
    final cat = _selectedCategory!;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Category label badge
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
          decoration: BoxDecoration(
            color: cat.accent.withValues(alpha: 0.14),
            borderRadius: BorderRadius.circular(6),
          ),
          child: Text(
            LanguageController.instance.t('report.category.${cat.key}'),
            style: TextStyle(
              color: cat.accent,
              fontSize: 12,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
        const SizedBox(height: 16),
        Text(
          LanguageController.instance.t('report.selectReason'),
          style: TextStyle(
            color: tokens.text,
            fontSize: 14,
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 8),
        ...cat.reasons.map((r) {
          final selected = _selectedReason?.key == r.key;
          return GestureDetector(
            onTap: () => setState(() => _selectedReason = r),
            child: Container(
              margin: const EdgeInsets.only(bottom: 6),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              decoration: BoxDecoration(
                color: selected
                    ? cat.accent.withValues(alpha: 0.15)
                    : tokens.panelMuted,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(
                  color: selected
                      ? cat.accent.withValues(alpha: 0.6)
                      : tokens.panelBorder,
                  width: 1,
                ),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      LanguageController.instance.t('report.reason.${r.key}'),
                      style: TextStyle(
                        color: selected ? cat.accent : tokens.text,
                        fontSize: 13,
                      ),
                    ),
                  ),
                  if (selected)
                    Icon(
                      Icons.check_circle_rounded,
                      size: 16,
                      color: cat.accent,
                    ),
                ],
              ),
            ),
          );
        }),
        // Note + submit (only after a reason is chosen)
        if (_selectedReason != null) ...[
          const SizedBox(height: 16),
          Text(
            LanguageController.instance.t('report.additionalNote'),
            style: TextStyle(
              color: tokens.text,
              fontSize: 14,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _noteCtrl,
            maxLines: 3,
            maxLength: 500,
            style: TextStyle(color: tokens.text, fontSize: 13),
            decoration: InputDecoration(
              hintText: LanguageController.instance.t('report.describeIssue'),
              hintStyle: TextStyle(color: tokens.textMuted),
              filled: true,
              fillColor: tokens.panelMuted,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
                borderSide: BorderSide(color: tokens.panelBorder),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
                borderSide: BorderSide(color: tokens.panelBorder),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
                borderSide: BorderSide(
                  color: cat.accent.withValues(alpha: 0.6),
                ),
              ),
              counterStyle: TextStyle(color: tokens.textMuted, fontSize: 11),
            ),
          ),
          const SizedBox(height: 14),
          if (_error != null) ...[
            Text(
              _error!,
              style: TextStyle(color: theme.colorScheme.error, fontSize: 13),
            ),
            const SizedBox(height: 10),
          ],
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: _submitting ? null : _submit,
              style: ElevatedButton.styleFrom(
                backgroundColor: tokens.primary,
                foregroundColor: theme.colorScheme.onPrimary,
                padding: const EdgeInsets.symmetric(vertical: 13),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(8),
                ),
              ),
              child: _submitting
                  ? SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: theme.colorScheme.onPrimary,
                      ),
                    )
                  : Text(
                      LanguageController.instance.t('report.submitReport'),
                      style: TextStyle(
                        color: theme.colorScheme.onPrimary,
                        fontWeight: FontWeight.w600,
                        fontSize: 14,
                      ),
                    ),
            ),
          ),
        ],
      ],
    );
  }
}
