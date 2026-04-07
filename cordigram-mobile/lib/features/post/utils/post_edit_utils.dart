import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

import '../../home/models/feed_post.dart';
import '../../home/services/post_interaction_service.dart';

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
}) {
  return showModalBottomSheet<FeedPost>(
    context: context,
    isScrollControlled: true,
    backgroundColor: const Color(0xFF10192C),
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
    ),
    builder: (_) => _EditPostSheet(post: post),
  );
}

Future<String?> showEditVisibilitySheet(
  BuildContext context, {
  required String postId,
  required String currentVisibility,
}) {
  return showModalBottomSheet<String>(
    context: context,
    backgroundColor: const Color(0xFF10192C),
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
  const _EditPostSheet({required this.post});

  final FeedPost post;

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
  List<_LocationSuggestion> _locationSuggestions = [];
  bool _locationLoading = false;
  bool _locationOpen = false;
  Timer? _locationDebounce;

  bool _saving = false;
  String? _error;

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
  }

  @override
  void dispose() {
    _locationDebounce?.cancel();
    _captionCtrl.dispose();
    _locationCtrl.dispose();
    _hashtagsCtrl.dispose();
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
          .get(
            url,
            headers: {
              'Accept': 'application/json',
              'User-Agent': 'CordigramApp/1.0 (mobile; contact@cordigram.app)',
            },
          )
          .timeout(const Duration(seconds: 10));
      if (!mounted) return;

      if (res.statusCode != 200) {
        setState(() => _locationLoading = false);
        return;
      }

      final items = jsonDecode(res.body) as List;
      final suggestions = items
          .whereType<Map<String, dynamic>>()
          .map(
            (item) => _LocationSuggestion(
              label: _cleanLocation(item['display_name'] as String? ?? ''),
              lat: item['lat'] as String? ?? '',
              lon: item['lon'] as String? ?? '',
            ),
          )
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

  List<String> _parseHashtags(String raw) {
    return raw
        .split(RegExp(r'[\s,]+'))
        .map((e) => e.trim().replaceFirst('#', ''))
        .where((e) => e.isNotEmpty)
        .toSet()
        .toList();
  }

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
      final updatedJson = await PostInteractionService.updatePost(
        widget.post.id,
        UpdatePostPayload(
          content: caption,
          location: location,
          hashtags: hashtags,
          allowComments: _allowComments,
          allowDownload: _allowDownload,
          hideLikeCount: _hideLikeCount,
        ),
      );
      if (!mounted) return;

      // PATCH response can be partial; keep existing identity/media metadata
      // and only overwrite fields that were edited or explicitly returned.
      final parsed = FeedPost.fromJson(updatedJson);
      final updated = widget.post.copyWith(
        content: caption,
        location: location,
        hashtags: hashtags,
        allowComments: _allowComments,
        allowDownload: _allowDownload,
        hideLikeCount: _hideLikeCount,
        visibility: parsed.visibility ?? widget.post.visibility,
      );
      Navigator.of(context).pop(updated);
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error = 'Failed to update post. Please try again.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottomPad =
        MediaQuery.of(context).viewInsets.bottom +
        MediaQuery.of(context).viewPadding.bottom;

    return Padding(
      padding: EdgeInsets.fromLTRB(16, 12, 16, 14 + bottomPad),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 36,
                height: 4,
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.2),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 14),
            const Text(
              'Edit post',
              style: TextStyle(
                color: Color(0xFFE8ECF8),
                fontSize: 17,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 14),
            _Field(
              controller: _captionCtrl,
              label: 'Caption',
              minLines: 3,
              maxLines: 7,
            ),
            const SizedBox(height: 10),
            _Field(
              controller: _locationCtrl,
              label: 'Location (optional)',
              onChanged: _onLocationChanged,
              prefixIcon: const Icon(
                Icons.place_outlined,
                color: Color(0xFF5A6B8A),
                size: 20,
              ),
              suffixIcon: _locationLoading
                  ? const Padding(
                      padding: EdgeInsets.all(12),
                      child: SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Color(0xFF4AA3E4),
                        ),
                      ),
                    )
                  : _locationCtrl.text.isNotEmpty
                  ? IconButton(
                      icon: const Icon(
                        Icons.close,
                        color: Color(0xFF5A6B8A),
                        size: 18,
                      ),
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
                margin: const EdgeInsets.only(top: 4),
                decoration: BoxDecoration(
                  color: const Color(0xFF1A2540),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: const Color(0xFF2A3A5C)),
                ),
                child: ListView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  itemCount: _locationSuggestions.length,
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
                          style: const TextStyle(
                            color: Color(0xFFD0D8EE),
                            fontSize: 13,
                          ),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    );
                  },
                ),
              ),
            const SizedBox(height: 10),
            _Field(
              controller: _hashtagsCtrl,
              label: 'Hashtags (e.g. #music #flutter)',
            ),
            const SizedBox(height: 12),
            _ToggleTile(
              title: 'Allow comments',
              value: _allowComments,
              onChanged: (v) => setState(() => _allowComments = v),
            ),
            _ToggleTile(
              title: 'Allow download',
              value: _allowDownload,
              onChanged: (v) => setState(() => _allowDownload = v),
            ),
            _ToggleTile(
              title: 'Hide like count',
              value: _hideLikeCount,
              onChanged: (v) => setState(() => _hideLikeCount = v),
            ),
            if (_error != null) ...[
              const SizedBox(height: 10),
              Text(
                _error!,
                style: const TextStyle(color: Color(0xFFEF4444), fontSize: 13),
              ),
            ],
            const SizedBox(height: 14),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _saving ? null : _submit,
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF2B74B0),
                  foregroundColor: Colors.white,
                  disabledBackgroundColor: const Color(
                    0xFF2B74B0,
                  ).withValues(alpha: 0.45),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(10),
                  ),
                  padding: const EdgeInsets.symmetric(vertical: 12),
                ),
                child: _saving
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Text('Save changes'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ToggleTile extends StatelessWidget {
  const _ToggleTile({
    required this.title,
    required this.value,
    required this.onChanged,
  });

  final String title;
  final bool value;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return SwitchListTile(
      contentPadding: EdgeInsets.zero,
      title: Text(
        title,
        style: const TextStyle(color: Color(0xFFCDD5E0), fontSize: 14),
      ),
      value: value,
      activeColor: const Color(0xFF4AA3E4),
      onChanged: onChanged,
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
    final bottomPad =
        MediaQuery.of(context).viewInsets.bottom +
        MediaQuery.of(context).viewPadding.bottom;

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
                color: Colors.white.withValues(alpha: 0.2),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const SizedBox(height: 14),
          const Text(
            'Edit visibility',
            style: TextStyle(
              color: Color(0xFFE8ECF8),
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
              activeColor: const Color(0xFF4AA3E4),
              onChanged: (value) {
                if (value == null) return;
                setState(() => _selected = value);
              },
              title: Text(
                option.label,
                style: const TextStyle(color: Color(0xFFCDD5E0), fontSize: 14),
              ),
            ),
          if (_error != null) ...[
            const SizedBox(height: 8),
            Text(
              _error!,
              style: const TextStyle(color: Color(0xFFEF4444), fontSize: 13),
            ),
          ],
          const SizedBox(height: 10),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: _saving ? null : _submit,
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF2B74B0),
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10),
                ),
                padding: const EdgeInsets.symmetric(vertical: 12),
              ),
              child: _saving
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Text('Save visibility'),
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
    return TextField(
      controller: controller,
      minLines: minLines,
      maxLines: maxLines,
      onChanged: onChanged,
      style: const TextStyle(color: Color(0xFFE8ECF8), fontSize: 14),
      decoration: InputDecoration(
        labelText: label,
        labelStyle: const TextStyle(color: Color(0xFF7A8BB0)),
        filled: true,
        fillColor: const Color(0xFF1A2235),
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
