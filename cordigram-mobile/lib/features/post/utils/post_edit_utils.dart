import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import '../../../core/config/app_theme.dart';
import '../../../core/services/language_controller.dart';

import '../../home/models/feed_post.dart';
import '../../home/services/post_interaction_service.dart';
import '../../messages/services/polls_api_service.dart';

enum PostVisibilityOption { public, followers, private }

extension PostVisibilityOptionX on PostVisibilityOption {
  String get value {
    switch (this) {
      case PostVisibilityOption.public:
        return 'public';
      case PostVisibilityOption.followers:
        return 'followers';
      case PostVisibilityOption.private:
        return 'private';
    }
  }

  String get label {
    switch (this) {
      case PostVisibilityOption.public:
        return 'Public';
      case PostVisibilityOption.followers:
        return 'Followers only';
      case PostVisibilityOption.private:
        return 'Private';
    }
  }

  static PostVisibilityOption fromRaw(String? raw) {
    switch (raw) {
      case 'followers':
        return PostVisibilityOption.followers;
      case 'private':
        return PostVisibilityOption.private;
      default:
        return PostVisibilityOption.public;
    }
  }
}

Future<FeedPost?> showEditPostSheet(
  BuildContext context, {
  required FeedPost post,
  String entityLabel = 'post',
}) {
  return showModalBottomSheet<FeedPost>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Theme.of(context).colorScheme.surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
    ),
    builder: (_) => _EditPostSheet(post: post, entityLabel: entityLabel),
  );
}

Future<String?> showEditVisibilitySheet(
  BuildContext context, {
  required String postId,
  required String currentVisibility,
}) {
  return showModalBottomSheet<String>(
    context: context,
    backgroundColor: Theme.of(context).colorScheme.surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
    ),
    builder: (_) => _EditVisibilitySheet(
      postId: postId,
      currentVisibility: currentVisibility,
    ),
  );
}

class _EditPostSheet extends StatefulWidget {
  const _EditPostSheet({required this.post, required this.entityLabel});

  final FeedPost post;
  final String entityLabel;

  @override
  State<_EditPostSheet> createState() => _EditPostSheetState();
}

class _EditPostSheetState extends State<_EditPostSheet> {
  late final TextEditingController _captionCtrl;
  late final TextEditingController _locationCtrl;
  late final TextEditingController _hashtagsCtrl;
  late bool _allowComments;
  late bool _allowDownload;
  late bool _hideLikeCount;
  late bool _allowMultipleAnswers;

  // Poll option label controllers (only for poll posts)
  List<TextEditingController> _optionCtrls = [];

  List<_LocationSuggestion> _locationSuggestions = [];
  bool _locationLoading = false;
  bool _locationOpen = false;
  Timer? _locationDebounce;

  bool _saving = false;
  String? _error;

  bool get _isPoll => widget.post.pollId != null && widget.post.pollId!.isNotEmpty;

  @override
  void initState() {
    super.initState();
    _captionCtrl = TextEditingController(text: widget.post.content);
    _locationCtrl = TextEditingController(text: widget.post.location ?? '');
    _hashtagsCtrl = TextEditingController(
      text: widget.post.hashtags.map((e) => '#$e').join(' '),
    );
    _allowComments = widget.post.allowComments != false;
    _allowDownload = widget.post.allowDownload == true;
    _hideLikeCount = widget.post.hideLikeCount == true;
    _allowMultipleAnswers = widget.post.poll?.allowMultipleAnswers ?? false;

    if (_isPoll) {
      final options = widget.post.poll?.options ?? [];
      _optionCtrls = options.map((o) => TextEditingController(text: o)).toList();
    }
  }

  @override
  void dispose() {
    _locationDebounce?.cancel();
    _captionCtrl.dispose();
    _locationCtrl.dispose();
    _hashtagsCtrl.dispose();
    for (final c in _optionCtrls) {
      c.dispose();
    }
    super.dispose();
  }

  void _onLocationChanged(String query) {
    _locationDebounce?.cancel();
    if (query.trim().isEmpty) {
      setState(() {
        _locationSuggestions = [];
        _locationOpen = false;
        _locationLoading = false;
      });
      return;
    }
    setState(() => _locationLoading = true);
    _locationDebounce = Timer(const Duration(milliseconds: 350), () {
      _searchLocation(query);
    });
  }

  Future<void> _searchLocation(String query) async {
    try {
      final url = Uri.parse(
        'https://nominatim.openstreetmap.org/search'
        '?q=${Uri.encodeQueryComponent(query)}'
        '&format=jsonv2&addressdetails=1&limit=6',
      );
      final res = await http
          .get(url, headers: {
            'Accept': 'application/json',
            'User-Agent': 'CordigramApp/1.0 (mobile; contact@cordigram.app)',
          })
          .timeout(const Duration(seconds: 10));
      if (!mounted) return;
      if (res.statusCode != 200) {
        setState(() => _locationLoading = false);
        return;
      }
      final items = jsonDecode(res.body) as List;
      final suggestions = items
          .whereType<Map<String, dynamic>>()
          .map((item) => _LocationSuggestion(
                label: _cleanLocation(item['display_name'] as String? ?? ''),
                lat: item['lat'] as String? ?? '',
                lon: item['lon'] as String? ?? '',
              ))
          .toList();
      setState(() {
        _locationSuggestions = suggestions;
        _locationOpen = suggestions.isNotEmpty;
        _locationLoading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _locationLoading = false);
    }
  }

  String _cleanLocation(String label) => label
      .replaceAll(RegExp(r'\b\d{4,6}\b'), '')
      .replaceAll(RegExp(r',\s*,+'), ', ')
      .replaceAll(RegExp(r'\s{2,}'), ' ')
      .replaceAll(RegExp(r'\s*,\s*$'), '')
      .trim();

  void _selectLocation(_LocationSuggestion s) {
    _locationCtrl.text = s.label;
    setState(() {
      _locationSuggestions = [];
      _locationOpen = false;
      _locationLoading = false;
    });
  }

  List<String> _parseHashtags(String raw) => raw
      .split(RegExp(r'[\s,]+'))
      .map((e) => e.trim().replaceFirst('#', ''))
      .where((e) => e.isNotEmpty)
      .toSet()
      .toList();

  Future<void> _submit() async {
    if (_saving) return;
    setState(() {
      _saving = true;
      _error = null;
    });

    final caption = _captionCtrl.text.trim();
    final location = _locationCtrl.text.trim();
    final hashtags = _parseHashtags(_hashtagsCtrl.text);

    try {
      // Update poll options + allowMultipleAnswers if this is a poll post
      if (_isPoll && widget.post.poll != null) {
        final newOptions = _optionCtrls.map((c) => c.text.trim()).toList();
        final optionsChanged = newOptions.join('|') !=
            (widget.post.poll!.options.join('|'));
        final multiChanged =
            _allowMultipleAnswers != widget.post.poll!.allowMultipleAnswers;
        if (optionsChanged || multiChanged) {
          await PollsApiService.updatePoll(
            pollId: widget.post.poll!.id,
            options: optionsChanged ? newOptions : null,
            allowMultipleAnswers: multiChanged ? _allowMultipleAnswers : null,
          );
        }
      }

      final updatedJson = await PostInteractionService.updatePost(
        widget.post.id,
        UpdatePostPayload(
          content: caption,
          location: location,
          hashtags: hashtags,
          allowComments: _allowComments,
          allowDownload: _isPoll ? null : _allowDownload,
          hideLikeCount: _hideLikeCount,
        ),
      );
      if (!mounted) return;

      final parsed = FeedPost.fromJson(updatedJson);
      final updated = widget.post.copyWith(
        content: caption,
        location: location,
        hashtags: hashtags,
        allowComments: _allowComments,
        allowDownload: _isPoll ? widget.post.allowDownload : _allowDownload,
        hideLikeCount: _hideLikeCount,
        visibility: parsed.visibility ?? widget.post.visibility,
      );
      Navigator.of(context).pop(updated);
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error = 'Failed to update. Please try again.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final tokens = theme.extension<AppSemanticColors>() ??
        (theme.brightness == Brightness.dark
            ? AppSemanticColors.dark
            : AppSemanticColors.light);
    final bottomPad = MediaQuery.of(context).viewInsets.bottom +
        MediaQuery.of(context).viewPadding.bottom;
    final lc = LanguageController.instance;

    return Padding(
      padding: EdgeInsets.fromLTRB(16, 12, 16, 14 + bottomPad),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Drag handle
            Center(
              child: Container(
                width: 36,
                height: 4,
                decoration: BoxDecoration(
                  color: tokens.textMuted.withValues(alpha: 0.28),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 14),
            Text(
              'Edit ${widget.entityLabel}',
              style: TextStyle(
                color: tokens.text,
                fontSize: 17,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 16),

            // ── Caption section ──────────────────────────────────────────────
            _SectionCard(
              tokens: tokens,
              label: lc.t('post.edit.caption'),
              child: _Field(
                controller: _captionCtrl,
                label: '',
                minLines: 3,
                maxLines: 7,
              ),
            ),
            const SizedBox(height: 10),

            // ── Location section ─────────────────────────────────────────────
            _SectionCard(
              tokens: tokens,
              label: lc.t('post.edit.location'),
              child: Column(
                children: [
                  _Field(
                    controller: _locationCtrl,
                    label: lc.t('post.edit.searchPlace'),
                    onChanged: _onLocationChanged,
                    prefixIcon: Icon(
                      Icons.place_outlined,
                      color: tokens.textMuted,
                      size: 20,
                    ),
                    suffixIcon: _locationLoading
                        ? Padding(
                            padding: const EdgeInsets.all(12),
                            child: SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: tokens.primary,
                              ),
                            ),
                          )
                        : _locationCtrl.text.isNotEmpty
                        ? IconButton(
                            icon: Icon(Icons.close, color: tokens.textMuted, size: 18),
                            onPressed: () {
                              _locationDebounce?.cancel();
                              _locationCtrl.clear();
                              setState(() {
                                _locationSuggestions = [];
                                _locationOpen = false;
                                _locationLoading = false;
                              });
                            },
                          )
                        : null,
                  ),
                  if (_locationOpen)
                    Container(
                      margin: const EdgeInsets.only(top: 6),
                      decoration: BoxDecoration(
                        color: tokens.panelMuted,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: tokens.panelBorder),
                      ),
                      child: ListView.separated(
                        shrinkWrap: true,
                        physics: const NeverScrollableScrollPhysics(),
                        itemCount: _locationSuggestions.length,
                        separatorBuilder: (_, __) => Divider(
                          height: 1,
                          color: tokens.panelBorder,
                        ),
                        itemBuilder: (_, i) {
                          final s = _locationSuggestions[i];
                          return InkWell(
                            onTap: () => _selectLocation(s),
                            child: Padding(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 12,
                                vertical: 10,
                              ),
                              child: Text(
                                s.label,
                                style: TextStyle(color: tokens.text, fontSize: 13),
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          );
                        },
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 10),

            // ── Hashtags section ─────────────────────────────────────────────
            _SectionCard(
              tokens: tokens,
              label: lc.t('post.edit.hashtags'),
              child: _Field(
                controller: _hashtagsCtrl,
                label: 'e.g. #music #flutter',
              ),
            ),
            const SizedBox(height: 10),

            // ── Poll options section (poll posts only) ───────────────────────
            if (_isPoll && _optionCtrls.isNotEmpty) ...[
              _SectionCard(
                tokens: tokens,
                label: lc.t('post.edit.pollOptions'),
                child: Column(
                  children: List.generate(_optionCtrls.length, (i) {
                    final imgUrl = (widget.post.poll?.hasImages == true &&
                            i < (widget.post.poll?.optionImages.length ?? 0))
                        ? widget.post.poll!.optionImages[i]
                        : '';
                    return Padding(
                      padding: EdgeInsets.only(
                        bottom: i < _optionCtrls.length - 1 ? 8 : 0,
                      ),
                      child: Row(
                        children: [
                          if (imgUrl.isNotEmpty) ...[
                            ClipRRect(
                              borderRadius: BorderRadius.circular(6),
                              child: Image.network(
                                imgUrl,
                                width: 38,
                                height: 38,
                                fit: BoxFit.cover,
                                errorBuilder: (_, __, ___) =>
                                    Container(
                                      width: 38,
                                      height: 38,
                                      decoration: BoxDecoration(
                                        color: tokens.panelMuted,
                                        borderRadius: BorderRadius.circular(6),
                                      ),
                                    ),
                              ),
                            ),
                            const SizedBox(width: 8),
                          ],
                          Expanded(
                            child: _Field(
                              controller: _optionCtrls[i],
                              label: lc.t('post.edit.pollOption').replaceAll('{n}', '${i + 1}'),
                            ),
                          ),
                        ],
                      ),
                    );
                  }),
                ),
              ),
              const SizedBox(height: 10),
            ],

            // ── Settings section ─────────────────────────────────────────────
            _SectionCard(
              tokens: tokens,
              label: lc.t('post.edit.settings'),
              child: Column(
                children: [
                  _ToggleTile(
                    title: lc.t('post.edit.allowComments'),
                    subtitle: lc.t('post.edit.allowCommentsSub'),
                    value: _allowComments,
                    onChanged: (v) => setState(() => _allowComments = v),
                    tokens: tokens,
                  ),
                  if (_isPoll) ...[
                    Divider(height: 1, color: tokens.panelBorder),
                    _ToggleTile(
                      title: lc.t('post.edit.allowMultipleAnswers'),
                      subtitle: lc.t('post.edit.allowMultipleAnswersSub'),
                      value: _allowMultipleAnswers,
                      onChanged: (v) =>
                          setState(() => _allowMultipleAnswers = v),
                      tokens: tokens,
                    ),
                  ] else ...[
                    Divider(height: 1, color: tokens.panelBorder),
                    _ToggleTile(
                      title: lc.t('post.edit.allowDownload'),
                      subtitle: lc.t('post.edit.allowDownloadSub'),
                      value: _allowDownload,
                      onChanged: (v) => setState(() => _allowDownload = v),
                      tokens: tokens,
                    ),
                  ],
                  Divider(height: 1, color: tokens.panelBorder),
                  _ToggleTile(
                    title: lc.t('post.edit.hideLikeCount'),
                    subtitle: lc.t('post.edit.hideLikeCountSub'),
                    value: _hideLikeCount,
                    onChanged: (v) => setState(() => _hideLikeCount = v),
                    tokens: tokens,
                  ),
                ],
              ),
            ),

            if (_error != null) ...[
              const SizedBox(height: 10),
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: theme.colorScheme.errorContainer,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  _error!,
                  style: TextStyle(
                    color: theme.colorScheme.onErrorContainer,
                    fontSize: 13,
                  ),
                ),
              ),
            ],

            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _saving ? null : _submit,
                style: ElevatedButton.styleFrom(
                  backgroundColor: tokens.primary,
                  foregroundColor: theme.colorScheme.onPrimary,
                  disabledBackgroundColor: tokens.primary.withValues(alpha: 0.45),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(10),
                  ),
                  padding: const EdgeInsets.symmetric(vertical: 13),
                ),
                child: _saving
                    ? SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: theme.colorScheme.onPrimary,
                        ),
                      )
                    : const Text(
                        'Save changes',
                        style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Labeled section container — gives each group a header + card background.
class _SectionCard extends StatelessWidget {
  const _SectionCard({
    required this.tokens,
    required this.label,
    required this.child,
  });

  final AppSemanticColors tokens;
  final String label;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(left: 2, bottom: 6),
          child: Text(
            label,
            style: TextStyle(
              color: tokens.textMuted,
              fontSize: 12,
              fontWeight: FontWeight.w600,
              letterSpacing: 0.4,
            ),
          ),
        ),
        Container(
          width: double.infinity,
          decoration: BoxDecoration(
            color: tokens.panelMuted,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: tokens.panelBorder),
          ),
          padding: const EdgeInsets.all(12),
          child: child,
        ),
      ],
    );
  }
}

class _ToggleTile extends StatelessWidget {
  const _ToggleTile({
    required this.title,
    this.subtitle,
    required this.value,
    required this.onChanged,
    required this.tokens,
  });

  final String title;
  final String? subtitle;
  final bool value;
  final ValueChanged<bool> onChanged;
  final AppSemanticColors tokens;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    color: tokens.text,
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                if (subtitle != null)
                  Text(
                    subtitle!,
                    style: TextStyle(
                      color: tokens.textMuted,
                      fontSize: 12,
                    ),
                  ),
              ],
            ),
          ),
          Switch(
            value: value,
            onChanged: onChanged,
            activeThumbColor: tokens.primary,
          ),
        ],
      ),
    );
  }
}

class _EditVisibilitySheet extends StatefulWidget {
  const _EditVisibilitySheet({
    required this.postId,
    required this.currentVisibility,
  });

  final String postId;
  final String currentVisibility;

  @override
  State<_EditVisibilitySheet> createState() => _EditVisibilitySheetState();
}

class _EditVisibilitySheetState extends State<_EditVisibilitySheet> {
  late PostVisibilityOption _selected;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _selected = PostVisibilityOptionX.fromRaw(widget.currentVisibility);
  }

  Future<void> _submit() async {
    if (_saving) return;
    setState(() {
      _saving = true;
      _error = null;
    });

    try {
      await PostInteractionService.updateVisibility(
        widget.postId,
        _selected.value,
      );
      if (!mounted) return;
      Navigator.of(context).pop(_selected.value);
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error = 'Failed to update visibility. Please try again.';
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
    final lc = LanguageController.instance;

    return Padding(
      padding: EdgeInsets.fromLTRB(16, 12, 16, 14 + bottomPad),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Center(
            child: Container(
              width: 36,
              height: 4,
              decoration: BoxDecoration(
                color: tokens.textMuted.withValues(alpha: 0.28),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const SizedBox(height: 14),
          Text(
            'Edit visibility',
            style: TextStyle(
              color: tokens.text,
              fontSize: 17,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 10),
          for (final option in PostVisibilityOption.values)
            RadioListTile<PostVisibilityOption>(
              contentPadding: EdgeInsets.zero,
              value: option,
              groupValue: _selected,
              activeColor: tokens.primary,
              onChanged: (value) {
                if (value == null) return;
                setState(() => _selected = value);
              },
              title: Text(
                option.label,
                style: TextStyle(color: tokens.text, fontSize: 14),
              ),
            ),
          if (_error != null) ...[
            const SizedBox(height: 8),
            Text(
              _error!,
              style: TextStyle(color: theme.colorScheme.error, fontSize: 13),
            ),
          ],
          const SizedBox(height: 10),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: _saving ? null : _submit,
              style: ElevatedButton.styleFrom(
                backgroundColor: tokens.primary,
                foregroundColor: theme.colorScheme.onPrimary,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10),
                ),
                padding: const EdgeInsets.symmetric(vertical: 12),
              ),
              child: _saving
                  ? SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: theme.colorScheme.onPrimary,
                      ),
                    )
                  : Text(lc.t('post.edit.saveVisibility')),
            ),
          ),
        ],
      ),
    );
  }
}

class _Field extends StatelessWidget {
  const _Field({
    required this.controller,
    required this.label,
    this.minLines,
    this.maxLines = 1,
    this.onChanged,
    this.prefixIcon,
    this.suffixIcon,
  });

  final TextEditingController controller;
  final String label;
  final int? minLines;
  final int maxLines;
  final ValueChanged<String>? onChanged;
  final Widget? prefixIcon;
  final Widget? suffixIcon;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final tokens =
        theme.extension<AppSemanticColors>() ??
        (theme.brightness == Brightness.dark
            ? AppSemanticColors.dark
            : AppSemanticColors.light);
    return TextField(
      controller: controller,
      minLines: minLines,
      maxLines: maxLines,
      onChanged: onChanged,
      style: TextStyle(color: tokens.text, fontSize: 14),
      decoration: InputDecoration(
        labelText: label,
        labelStyle: TextStyle(color: tokens.textMuted),
        filled: true,
        fillColor: tokens.panelMuted,
        prefixIcon: prefixIcon,
        suffixIcon: suffixIcon,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide.none,
        ),
      ),
    );
  }
}

class _LocationSuggestion {
  const _LocationSuggestion({
    required this.label,
    required this.lat,
    required this.lon,
  });

  final String label;
  final String lat;
  final String lon;
}
