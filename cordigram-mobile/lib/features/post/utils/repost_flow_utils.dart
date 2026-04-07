import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

class RepostQuoteInput {
  const RepostQuoteInput({
    required this.content,
    required this.visibility,
    required this.allowComments,
    required this.hideLikeCount,
    required this.location,
    required this.hashtags,
  });

  final String content;
  final String visibility;
  final bool allowComments;
  final bool hideLikeCount;
  final String location;
  final List<String> hashtags;
}

enum RepostFlowAction { quick, quote }

class RepostFlowSelection {
  const RepostFlowSelection.quick()
    : action = RepostFlowAction.quick,
      quoteInput = null;

  const RepostFlowSelection.quote(this.quoteInput)
    : action = RepostFlowAction.quote;

  final RepostFlowAction action;
  final RepostQuoteInput? quoteInput;
}

Future<RepostFlowSelection?> showRepostFlowSheet({
  required BuildContext context,
  required String label,
  required String kind,
  required bool initialAllowDownload,
}) async {
  final action = await showModalBottomSheet<_RepostIntent>(
    context: context,
    backgroundColor: const Color(0xFF0B1732),
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (_) => _RepostMenuSheet(label: '$label · $kind'),
  );

  if (action == null || action == _RepostIntent.cancel) return null;
  if (action == _RepostIntent.quick) {
    return const RepostFlowSelection.quick();
  }

  final quote = await showModalBottomSheet<RepostQuoteInput>(
    context: context,
    isScrollControlled: true,
    backgroundColor: const Color(0xFF0E1A35),
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (_) => _QuoteComposerSheet(
      label: '$label · $kind',
      initialAllowDownload: initialAllowDownload,
    ),
  );

  if (quote == null) return null;
  return RepostFlowSelection.quote(quote);
}

enum _RepostIntent { quick, quote, cancel }

class _RepostMenuSheet extends StatelessWidget {
  const _RepostMenuSheet({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    final dividerColor = Colors.white.withValues(alpha: 0.08);
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(10, 10, 10, 12),
        child: Container(
          decoration: BoxDecoration(
            color: const Color(0xFF0B1732),
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(height: 12),
              const Text(
                'Repost',
                style: TextStyle(
                  color: Color(0xFFE8ECF8),
                  fontWeight: FontWeight.w700,
                  fontSize: 14,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                label,
                style: const TextStyle(
                  color: Color(0xFF93A2C5),
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                ),
              ),
              const SizedBox(height: 12),
              Divider(height: 1, color: dividerColor),
              _RepostMenuButton(
                text: 'Repost',
                color: const Color(0xFF3AA6E5),
                onTap: () => Navigator.of(context).pop(_RepostIntent.quick),
              ),
              Divider(height: 1, color: dividerColor),
              _RepostMenuButton(
                text: 'Quote',
                onTap: () => Navigator.of(context).pop(_RepostIntent.quote),
              ),
              Divider(height: 1, color: dividerColor),
              _RepostMenuButton(
                text: 'Cancel',
                onTap: () => Navigator.of(context).pop(_RepostIntent.cancel),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _RepostMenuButton extends StatelessWidget {
  const _RepostMenuButton({
    required this.text,
    required this.onTap,
    this.color,
  });

  final String text;
  final VoidCallback onTap;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      child: TextButton(
        onPressed: onTap,
        style: TextButton.styleFrom(
          padding: const EdgeInsets.symmetric(vertical: 16),
          foregroundColor: color ?? const Color(0xFFE8ECF8),
          shape: const RoundedRectangleBorder(),
        ),
        child: Text(
          text,
          style: TextStyle(
            color: color ?? const Color(0xFFE8ECF8),
            fontSize: 18,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
    );
  }
}

class _QuoteComposerSheet extends StatefulWidget {
  const _QuoteComposerSheet({
    required this.label,
    required this.initialAllowDownload,
  });

  final String label;
  final bool initialAllowDownload;

  @override
  State<_QuoteComposerSheet> createState() => _QuoteComposerSheetState();
}

class _QuoteComposerSheetState extends State<_QuoteComposerSheet> {
  final TextEditingController _contentCtrl = TextEditingController();
  final TextEditingController _hashtagsCtrl = TextEditingController();
  final TextEditingController _locationCtrl = TextEditingController();

  Timer? _debounce;
  bool _locationLoading = false;
  String _locationError = '';
  List<String> _locationOptions = const [];

  bool _allowComments = true;
  bool _hideLikeCount = false;
  String _visibility = 'public';

  @override
  void dispose() {
    _debounce?.cancel();
    _contentCtrl.dispose();
    _hashtagsCtrl.dispose();
    _locationCtrl.dispose();
    super.dispose();
  }

  List<String> _parseHashtags(String raw) {
    return raw
        .split(RegExp(r'[,\s]+'))
        .map((e) => e.trim().replaceFirst('#', ''))
        .where((e) => e.isNotEmpty)
        .map((e) => e.toLowerCase())
        .toSet()
        .toList();
  }

  String _cleanLocationLabel(String label) {
    return label
        .replaceAll(RegExp(r'\b\d{4,6}\b'), '')
        .replaceAll(RegExp(r',\s*,+'), ', ')
        .replaceAll(RegExp(r'\s{2,}'), ' ')
        .replaceAll(RegExp(r'\s*,\s*$'), '')
        .trim();
  }

  void _onLocationChanged(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () {
      _searchLocation(value);
    });
  }

  Future<void> _searchLocation(String query) async {
    final q = query.trim();
    if (q.isEmpty) {
      if (!mounted) return;
      setState(() {
        _locationLoading = false;
        _locationError = '';
        _locationOptions = const [];
      });
      return;
    }

    setState(() {
      _locationLoading = true;
      _locationError = '';
    });

    try {
      final uri = Uri.https('nominatim.openstreetmap.org', '/search', {
        'q': q,
        'format': 'jsonv2',
        'addressdetails': '1',
        'limit': '8',
        'countrycodes': 'vn',
      });

      final res = await http.get(
        uri,
        headers: const {'Accept': 'application/json', 'Accept-Language': 'vi'},
      );

      if (res.statusCode < 200 || res.statusCode >= 300) {
        throw Exception('location search failed');
      }

      final decoded = jsonDecode(res.body);
      final options = <String>[];
      if (decoded is List) {
        for (final row in decoded) {
          if (row is! Map) continue;
          final label = (row['display_name'] as String?)?.trim() ?? '';
          if (label.isEmpty) continue;
          options.add(_cleanLocationLabel(label));
        }
      }

      if (!mounted) return;
      setState(() {
        _locationLoading = false;
        _locationOptions = options;
        _locationError = options.isEmpty ? 'No suggestions found' : '';
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _locationLoading = false;
        _locationError = 'Unable to search location';
        _locationOptions = const [];
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;
    return SafeArea(
      top: false,
      child: Padding(
        padding: EdgeInsets.fromLTRB(14, 12, 14, 12 + bottomInset),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Quote repost',
                style: TextStyle(
                  color: Color(0xFFE8ECF8),
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                widget.label,
                style: const TextStyle(color: Color(0xFF93A2C5), fontSize: 12),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _contentCtrl,
                maxLines: 5,
                maxLength: 500,
                style: const TextStyle(color: Color(0xFFE8ECF8)),
                decoration: _inputDecoration('Write your quote...'),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: _hashtagsCtrl,
                style: const TextStyle(color: Color(0xFFE8ECF8)),
                decoration: _inputDecoration('Hashtags (comma separated)'),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: _locationCtrl,
                style: const TextStyle(color: Color(0xFFE8ECF8)),
                decoration: _inputDecoration('Location (optional)'),
                onChanged: _onLocationChanged,
              ),
              if (_locationLoading)
                const Padding(
                  padding: EdgeInsets.only(top: 8),
                  child: Text(
                    'Searching location...',
                    style: TextStyle(color: Color(0xFF7A8BB0), fontSize: 12),
                  ),
                ),
              if (!_locationLoading && _locationError.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(
                    _locationError,
                    style: const TextStyle(
                      color: Color(0xFFE57373),
                      fontSize: 12,
                    ),
                  ),
                ),
              if (_locationOptions.isNotEmpty)
                Container(
                  margin: const EdgeInsets.only(top: 8),
                  decoration: BoxDecoration(
                    color: const Color(0xFF111C37),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: Colors.white.withValues(alpha: 0.08),
                    ),
                  ),
                  constraints: const BoxConstraints(maxHeight: 180),
                  child: ListView.separated(
                    shrinkWrap: true,
                    itemCount: _locationOptions.length,
                    separatorBuilder: (_, __) => Divider(
                      height: 1,
                      color: Colors.white.withValues(alpha: 0.06),
                    ),
                    itemBuilder: (context, index) => InkWell(
                      onTap: () {
                        _locationCtrl.text = _locationOptions[index];
                        setState(() {
                          _locationOptions = const [];
                          _locationError = '';
                        });
                      },
                      child: Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 10,
                        ),
                        child: Text(
                          _locationOptions[index],
                          style: const TextStyle(
                            color: Color(0xFFE8ECF8),
                            fontSize: 13,
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                value: _visibility,
                items: const [
                  DropdownMenuItem(value: 'public', child: Text('Public')),
                  DropdownMenuItem(
                    value: 'followers',
                    child: Text('Followers'),
                  ),
                  DropdownMenuItem(value: 'private', child: Text('Private')),
                ],
                dropdownColor: const Color(0xFF111C37),
                iconEnabledColor: const Color(0xFF9BAECF),
                style: const TextStyle(color: Color(0xFFE8ECF8), fontSize: 14),
                decoration: _inputDecoration('Visibility'),
                onChanged: (v) {
                  if (v != null) setState(() => _visibility = v);
                },
              ),
              const SizedBox(height: 8),
              SwitchListTile.adaptive(
                value: _allowComments,
                onChanged: (v) => setState(() => _allowComments = v),
                title: const Text(
                  'Allow comments',
                  style: TextStyle(color: Color(0xFFE8ECF8)),
                ),
                contentPadding: EdgeInsets.zero,
                activeColor: const Color(0xFF4AA3E4),
              ),
              SwitchListTile.adaptive(
                value: widget.initialAllowDownload,
                onChanged: null,
                title: const Text(
                  'Allow downloads (inherits original)',
                  style: TextStyle(color: Color(0xFF7A8BB0)),
                ),
                contentPadding: EdgeInsets.zero,
                activeColor: const Color(0xFF4AA3E4),
              ),
              SwitchListTile.adaptive(
                value: _hideLikeCount,
                onChanged: (v) => setState(() => _hideLikeCount = v),
                title: const Text(
                  'Hide like count',
                  style: TextStyle(color: Color(0xFFE8ECF8)),
                ),
                contentPadding: EdgeInsets.zero,
                activeColor: const Color(0xFF4AA3E4),
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => Navigator.of(context).pop(),
                      style: OutlinedButton.styleFrom(
                        side: BorderSide(
                          color: Colors.white.withValues(alpha: 0.18),
                        ),
                        foregroundColor: const Color(0xFFE8ECF8),
                        padding: const EdgeInsets.symmetric(vertical: 13),
                      ),
                      child: const Text('Cancel'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: ElevatedButton(
                      onPressed: () {
                        Navigator.of(context).pop(
                          RepostQuoteInput(
                            content: _contentCtrl.text.trim(),
                            visibility: _visibility,
                            allowComments: _allowComments,
                            hideLikeCount: _hideLikeCount,
                            location: _locationCtrl.text.trim(),
                            hashtags: _parseHashtags(_hashtagsCtrl.text),
                          ),
                        );
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF4AA3E4),
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 13),
                      ),
                      child: const Text('Share quote'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  InputDecoration _inputDecoration(String hint) {
    return InputDecoration(
      hintText: hint,
      hintStyle: const TextStyle(color: Color(0xFF6F82A8)),
      filled: true,
      fillColor: const Color(0xFF111C37),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: Colors.white.withValues(alpha: 0.08)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: Color(0xFF4AA3E4)),
      ),
    );
  }
}
