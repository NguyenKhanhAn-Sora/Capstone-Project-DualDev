import 'package:flutter/material.dart';

import '../../core/services/api_service.dart';

class _ReportCategory {
  const _ReportCategory({
    required this.key,
    required this.label,
    required this.reasons,
  });

  final String key;
  final String label;
  final List<_ReportReason> reasons;
}

class _ReportReason {
  const _ReportReason({required this.key, required this.label});

  final String key;
  final String label;
}

const List<_ReportCategory> _kReportGroups = [
  _ReportCategory(
    key: 'abuse',
    label: 'Harassment / Hate speech',
    reasons: [
      _ReportReason(
        key: 'harassment',
        label: 'Targets an individual to harass',
      ),
      _ReportReason(key: 'hate_speech', label: 'Hate speech or discrimination'),
    ],
  ),
  _ReportCategory(
    key: 'violence',
    label: 'Violence / Threats',
    reasons: [
      _ReportReason(
        key: 'violence_threats',
        label: 'Threatens or promotes violence',
      ),
      _ReportReason(key: 'graphic_violence', label: 'Graphic violent imagery'),
    ],
  ),
  _ReportCategory(
    key: 'misinfo',
    label: 'Impersonation / Misinformation',
    reasons: [
      _ReportReason(key: 'fake_news', label: 'False or misleading information'),
      _ReportReason(
        key: 'impersonation',
        label: 'Impersonation of a person or organization',
      ),
    ],
  ),
  _ReportCategory(
    key: 'spam',
    label: 'Spam / Scam',
    reasons: [
      _ReportReason(key: 'spam', label: 'Spam or irrelevant content'),
      _ReportReason(key: 'financial_scam', label: 'Financial scam'),
    ],
  ),
  _ReportCategory(
    key: 'other',
    label: 'Other',
    reasons: [_ReportReason(key: 'other', label: 'Other reason')],
  ),
];

Future<bool> showReportPostSheet(
  BuildContext context, {
  required String postId,
  required Map<String, String> authHeader,
  String subjectLabel = 'post',
}) async {
  final result = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _ReportPostSheet(
      postId: postId,
      authHeader: authHeader,
      subjectLabel: subjectLabel,
    ),
  );

  return result == true;
}

class _ReportPostSheet extends StatefulWidget {
  const _ReportPostSheet({
    required this.postId,
    required this.authHeader,
    required this.subjectLabel,
  });

  final String postId;
  final Map<String, String> authHeader;
  final String subjectLabel;

  @override
  State<_ReportPostSheet> createState() => _ReportPostSheetState();
}

class _ReportPostSheetState extends State<_ReportPostSheet> {
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
    if (_selectedCategory == null || _selectedReason == null || _submitting) {
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      await ApiService.post(
        '/report-posts/${widget.postId}',
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
        _error = 'Failed to submit report. Please try again.';
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
                  'Report ${widget.subjectLabel}',
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
        const Text(
          "What's the issue?",
          style: TextStyle(
            color: Color(0xFFCDD5E0),
            fontSize: 14,
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 12),
        ..._kReportGroups.map(
          (g) => Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: InkWell(
              onTap: () => setState(() {
                _selectedCategory = g;
                _selectedReason = null;
              }),
              borderRadius: BorderRadius.circular(10),
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 12,
                ),
                decoration: BoxDecoration(
                  color: const Color(0xFF172138),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: const Color(0xFF26354F)),
                ),
                child: Text(
                  g.label,
                  style: const TextStyle(
                    color: Color(0xFFE8ECF8),
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildReasonStep() {
    final category = _selectedCategory!;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          category.label,
          style: const TextStyle(
            color: Color(0xFFE8ECF8),
            fontSize: 14,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 10),
        ...category.reasons.map(
          (reason) => RadioListTile<_ReportReason>(
            value: reason,
            groupValue: _selectedReason,
            contentPadding: EdgeInsets.zero,
            activeColor: const Color(0xFF4AA3E4),
            onChanged: (value) => setState(() => _selectedReason = value),
            title: Text(
              reason.label,
              style: const TextStyle(color: Color(0xFFCDD5E0), fontSize: 14),
            ),
          ),
        ),
        const SizedBox(height: 8),
        TextField(
          controller: _noteCtrl,
          minLines: 2,
          maxLines: 4,
          style: const TextStyle(color: Color(0xFFE8ECF8), fontSize: 14),
          decoration: InputDecoration(
            hintText: 'Additional note (optional)',
            hintStyle: const TextStyle(color: Color(0xFF7A8BB0)),
            filled: true,
            fillColor: const Color(0xFF172138),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: BorderSide.none,
            ),
          ),
        ),
        if (_error != null) ...[
          const SizedBox(height: 10),
          Text(
            _error!,
            style: const TextStyle(color: Color(0xFFEF4444), fontSize: 13),
          ),
        ],
        const SizedBox(height: 12),
        SizedBox(
          width: double.infinity,
          child: ElevatedButton(
            onPressed: _selectedReason == null || _submitting ? null : _submit,
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF2B74B0),
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(10),
              ),
              padding: const EdgeInsets.symmetric(vertical: 12),
            ),
            child: _submitting
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white,
                    ),
                  )
                : const Text('Submit report'),
          ),
        ),
      ],
    );
  }
}
