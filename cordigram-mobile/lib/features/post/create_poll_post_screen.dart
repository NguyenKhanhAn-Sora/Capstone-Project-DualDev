import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:image_picker/image_picker.dart';
import '../../core/config/app_theme.dart';
import '../../core/services/api_service.dart';
import '../../core/services/auth_storage.dart';
import '../../core/services/language_controller.dart';
import '../messages/services/polls_api_service.dart';
import 'create_post_service.dart' show CreatePostService;

// ── Constants ─────────────────────────────────────────────────────────────────

const int _kMaxOptions = 10;
const int _kMinOptions = 2;

// ── Models ────────────────────────────────────────────────────────────────────

enum _Audience { public, followers, private }

extension _AudienceLabel on _Audience {
  String get label {
    final lc = LanguageController.instance;
    switch (this) {
      case _Audience.public:
        return lc.t('post.create.audiencePublic');
      case _Audience.followers:
        return lc.t('post.create.audienceFollowers');
      case _Audience.private:
        return lc.t('post.create.audiencePrivate');
    }
  }

  String get value {
    switch (this) {
      case _Audience.public:
        return 'public';
      case _Audience.followers:
        return 'followers';
      case _Audience.private:
        return 'private';
    }
  }

  IconData get icon {
    switch (this) {
      case _Audience.public:
        return Icons.public_rounded;
      case _Audience.followers:
        return Icons.people_outline_rounded;
      case _Audience.private:
        return Icons.lock_outline_rounded;
    }
  }
}

enum _PublishMode { now, schedule }

class _PollOptionItem {
  _PollOptionItem() : controller = TextEditingController();
  final TextEditingController controller;
  File? imageFile;

  void dispose() => controller.dispose();
}

class _MentionSuggestion {
  const _MentionSuggestion({
    required this.username,
    this.displayName,
    this.avatarUrl,
  });
  final String username;
  final String? displayName;
  final String? avatarUrl;

  factory _MentionSuggestion.fromJson(Map<String, dynamic> json) =>
      _MentionSuggestion(
        username: (json['username'] as String?) ?? '',
        displayName: json['displayName'] as String?,
        avatarUrl: json['avatarUrl'] as String?,
      );
}

class _LocationSuggestion {
  const _LocationSuggestion({required this.label});
  final String label;
}

// ── Screen ────────────────────────────────────────────────────────────────────

class CreatePollPostScreen extends StatefulWidget {
  const CreatePollPostScreen({
    super.key,
    this.onPostCreated,
    this.showHeader = true,
  });

  final VoidCallback? onPostCreated;
  final bool showHeader;

  @override
  State<CreatePollPostScreen> createState() => _CreatePollPostScreenState();
}

class _CreatePollPostScreenState extends State<CreatePollPostScreen> {
  // ── Question / caption ────────────────────────────────────────────────────
  final _questionCtrl = TextEditingController();
  final _questionFocus = FocusNode();
  final _scrollCtrl = ScrollController();
  final _picker = ImagePicker();

  // ── Poll options ──────────────────────────────────────────────────────────
  final List<_PollOptionItem> _options = [
    _PollOptionItem(),
    _PollOptionItem(),
  ];
  bool _allowMultiple = false;

  // ── Settings ──────────────────────────────────────────────────────────────
  _Audience _audience = _Audience.public;
  _PublishMode _publishMode = _PublishMode.now;
  bool _allowComments = true;
  bool _hideLikeCount = false;
  DateTime? _scheduledAtLocal;

  // ── Hashtags ──────────────────────────────────────────────────────────────
  final _hashtagCtrl = TextEditingController();
  final List<String> _hashtags = [];

  // ── Location search ───────────────────────────────────────────────────────
  final _locationCtrl = TextEditingController();
  List<_LocationSuggestion> _locationSuggestions = [];
  bool _locationLoading = false;
  bool _locationOpen = false;
  Timer? _locationDebounce;

  // ── Mention search ────────────────────────────────────────────────────────
  List<_MentionSuggestion> _mentionSuggestions = [];
  bool _mentionOpen = false;
  bool _mentionLoading = false;
  static final _mentionRegex = RegExp(r'@([a-zA-Z0-9_.]{0,30})$');

  // ── Submit ────────────────────────────────────────────────────────────────
  bool _submitting = false;
  String? _submitError;

  @override
  void dispose() {
    _locationDebounce?.cancel();
    _questionCtrl.dispose();
    _questionFocus.dispose();
    _locationCtrl.dispose();
    _hashtagCtrl.dispose();
    _scrollCtrl.dispose();
    for (final o in _options) {
      o.dispose();
    }
    super.dispose();
  }

  // ── Mention ───────────────────────────────────────────────────────────────

  void _onQuestionChanged(String text) {
    final match = _mentionRegex.firstMatch(text);
    if (match != null) {
      final query = match.group(1) ?? '';
      if (query.isNotEmpty) {
        _searchMentions(query);
        return;
      }
    }
    if (_mentionOpen) {
      setState(() {
        _mentionOpen = false;
        _mentionSuggestions = [];
      });
    }
  }

  Future<void> _searchMentions(String query) async {
    final token = AuthStorage.accessToken;
    if (token == null) return;
    setState(() => _mentionLoading = true);
    try {
      final res = await ApiService.get(
        '/profiles/search?q=${Uri.encodeQueryComponent(query)}&limit=6',
        extraHeaders: {'Authorization': 'Bearer $token'},
      );
      final items =
          (res['items'] as List?)
              ?.whereType<Map<String, dynamic>>()
              .map(_MentionSuggestion.fromJson)
              .toList() ??
          [];
      if (!mounted) return;
      setState(() {
        _mentionSuggestions = items;
        _mentionOpen = items.isNotEmpty;
        _mentionLoading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _mentionLoading = false);
    }
  }

  void _insertMention(_MentionSuggestion s) {
    final text = _questionCtrl.text;
    final match = _mentionRegex.firstMatch(text);
    if (match == null) return;
    final before = text.substring(0, match.start);
    final after = text.substring(match.end);
    final inserted = '$before@${s.username} $after';
    _questionCtrl.value = TextEditingValue(
      text: inserted,
      selection: TextSelection.collapsed(
        offset: before.length + s.username.length + 2,
      ),
    );
    setState(() {
      _mentionOpen = false;
      _mentionSuggestions = [];
    });
  }

  // ── Location ──────────────────────────────────────────────────────────────

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
                label: _cleanLocation(
                  item['display_name'] as String? ?? '',
                ),
              ))
          .toList();
      setState(() {
        _locationSuggestions = suggestions;
        _locationOpen = suggestions.isNotEmpty;
        _locationLoading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _locationLoading = false);
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
    });
  }

  // ── Options ───────────────────────────────────────────────────────────────

  void _addOption() {
    if (_options.length >= _kMaxOptions) return;
    setState(() => _options.add(_PollOptionItem()));
  }

  void _removeOption(int i) {
    if (_options.length <= _kMinOptions) return;
    setState(() {
      _options[i].dispose();
      _options.removeAt(i);
    });
  }

  Future<void> _pickOptionImage(int i) async {
    final xfile = await _picker.pickImage(source: ImageSource.gallery);
    if (xfile == null || !mounted) return;
    setState(() => _options[i].imageFile = File(xfile.path));
  }

  // ── Hashtags ──────────────────────────────────────────────────────────────

  void _addHashtag() {
    final raw = _hashtagCtrl.text.trim().replaceFirst('#', '');
    if (raw.isEmpty || _hashtags.contains(raw)) {
      _hashtagCtrl.clear();
      return;
    }
    setState(() {
      _hashtags.add(raw);
      _hashtagCtrl.clear();
    });
  }

  // ── Schedule ──────────────────────────────────────────────────────────────

  DateTime _nextValidScheduleTime() =>
      DateTime.now().add(const Duration(minutes: 1));

  String _formatScheduleDate(DateTime v) =>
      '${v.day.toString().padLeft(2, '0')}/${v.month.toString().padLeft(2, '0')}/${v.year}';

  String _formatScheduleTime(DateTime v) =>
      '${v.hour.toString().padLeft(2, '0')}:${v.minute.toString().padLeft(2, '0')}';

  Future<void> _pickScheduleDate() async {
    final seed = _scheduledAtLocal ?? _nextValidScheduleTime();
    final today = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: seed,
      firstDate: DateTime(today.year, today.month, today.day),
      lastDate: DateTime(today.year + 2, 12, 31),
    );
    if (picked == null || !mounted) return;
    final base = _scheduledAtLocal ?? _nextValidScheduleTime();
    var next = DateTime(picked.year, picked.month, picked.day, base.hour, base.minute);
    if (!next.isAfter(DateTime.now())) next = _nextValidScheduleTime();
    setState(() => _scheduledAtLocal = next);
  }

  Future<void> _pickScheduleTime() async {
    if (_scheduledAtLocal == null) {
      setState(() => _scheduledAtLocal = _nextValidScheduleTime());
    }
    final seed = _scheduledAtLocal ?? _nextValidScheduleTime();
    DateTime draft = seed;

    final theme = Theme.of(context);
    final tokens = theme.extension<AppSemanticColors>() ??
        (theme.brightness == Brightness.dark
            ? AppSemanticColors.dark
            : AppSemanticColors.light);

    final picked = await showModalBottomSheet<DateTime>(
      context: context,
      backgroundColor: tokens.panel,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => SafeArea(
        top: false,
        child: SizedBox(
          height: 320,
          child: Column(
            children: [
              Container(
                width: 36,
                height: 4,
                margin: const EdgeInsets.symmetric(vertical: 10),
                decoration: BoxDecoration(
                  color: tokens.textMuted.withValues(alpha: 0.28),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                child: Row(
                  children: [
                    TextButton(
                      onPressed: () => Navigator.of(context).pop(),
                      child: Text(LanguageController.instance.t('common.cancel')),
                    ),
                    const Spacer(),
                    Text(
                      LanguageController.instance.t('post.create.selectTimeTitle'),
                      style: TextStyle(
                        color: tokens.text,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const Spacer(),
                    TextButton(
                      onPressed: () => Navigator.of(context).pop(draft),
                      child: Text(LanguageController.instance.t('common.done')),
                    ),
                  ],
                ),
              ),
              Divider(height: 1, color: tokens.panelBorder),
              Expanded(
                child: CupertinoTheme(
                  data: CupertinoThemeData(brightness: theme.brightness),
                  child: CupertinoDatePicker(
                    mode: CupertinoDatePickerMode.time,
                    use24hFormat: true,
                    minuteInterval: 1,
                    initialDateTime: seed,
                    onDateTimeChanged: (value) {
                      draft = DateTime(
                        seed.year,
                        seed.month,
                        seed.day,
                        value.hour,
                        value.minute,
                      );
                    },
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
    if (picked == null || !mounted) return;
    final current = _scheduledAtLocal ?? _nextValidScheduleTime();
    final next = DateTime(current.year, current.month, current.day, picked.hour, picked.minute);
    if (!next.isAfter(DateTime.now())) {
      _showSnack(LanguageController.instance.t('post.create.futureTimeError'));
      return;
    }
    setState(() => _scheduledAtLocal = next);
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  Future<void> _submit() async {
    if (_submitting) return;

    final question = _questionCtrl.text.trim();
    if (question.isEmpty) {
      setState(() => _submitError = 'Please enter a poll question.');
      return;
    }
    final validOptions = _options.map((o) => o.controller.text.trim()).toList();
    if (validOptions.where((o) => o.isNotEmpty).length < _kMinOptions) {
      setState(() => _submitError = 'Please fill in at least $_kMinOptions options.');
      return;
    }

    if (_publishMode == _PublishMode.schedule) {
      final selected = _scheduledAtLocal;
      if (selected == null) {
        setState(() => _submitError = LanguageController.instance.t('post.create.chooseDateTimeError'));
        return;
      }
      if (!selected.isAfter(DateTime.now())) {
        setState(() => _submitError = LanguageController.instance.t('post.create.scheduledTimePastError'));
        return;
      }
    }

    setState(() {
      _submitting = true;
      _submitError = null;
    });

    try {
      final token = AuthStorage.accessToken ?? '';

      // Upload option images
      final optionImageUrls = <String>[];
      for (final opt in _options) {
        if (opt.imageFile != null) {
          final result = await CreatePostService.uploadMedia(opt.imageFile!);
          optionImageUrls.add(result.url.isNotEmpty ? result.url : '');
        } else {
          optionImageUrls.add('');
        }
      }

      // Create poll
      final pollId = await PollsApiService.createPoll(
        question: question,
        options: validOptions,
        durationHours: 24,
        allowMultipleAnswers: _allowMultiple,
      );

      // Extract mentions from question
      final mentions = RegExp(r'@([a-zA-Z0-9_.]{1,30})')
          .allMatches(question)
          .map((m) => m.group(1)!)
          .toSet()
          .toList();

      String? scheduledAtIso;
      if (_publishMode == _PublishMode.schedule && _scheduledAtLocal != null) {
        scheduledAtIso = _scheduledAtLocal!.toUtc().toIso8601String();
      }

      // Create post
      await ApiService.post(
        '/posts',
        extraHeaders: {'Authorization': 'Bearer $token'},
        body: {
          'kind': 'post',
          'content': question,
          'pollId': pollId,
          'visibility': _audience.value,
          'allowComments': _allowComments,
          'hideLikeCount': _hideLikeCount,
          'hashtags': _hashtags,
          'mentions': mentions,
          if (_locationCtrl.text.trim().isNotEmpty)
            'location': _locationCtrl.text.trim(),
          if (scheduledAtIso != null) 'scheduledAt': scheduledAtIso,
          if (optionImageUrls.any((u) => u.isNotEmpty))
            'optionImages': optionImageUrls,
        },
      );

      if (!mounted) return;
      _reset();
      widget.onPostCreated?.call();
    } catch (e) {
      if (mounted) {
        setState(() {
          _submitting = false;
          _submitError = e.toString();
        });
      }
    }
  }

  void _reset() {
    _locationDebounce?.cancel();
    FocusScope.of(context).unfocus();
    if (_scrollCtrl.hasClients) _scrollCtrl.jumpTo(0);

    _questionCtrl.clear();
    _locationCtrl.clear();
    _hashtagCtrl.clear();

    for (final o in _options) {
      o.dispose();
    }
    _options.clear();
    _options.addAll([_PollOptionItem(), _PollOptionItem()]);

    setState(() {
      _submitting = false;
      _submitError = null;
      _hashtags.clear();
      _audience = _Audience.public;
      _publishMode = _PublishMode.now;
      _allowComments = true;
      _hideLikeCount = false;
      _allowMultiple = false;
      _scheduledAtLocal = null;
      _locationSuggestions = [];
      _locationOpen = false;
      _locationLoading = false;
      _mentionSuggestions = [];
      _mentionOpen = false;
      _mentionLoading = false;
    });
  }

  void _showSnack(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  // ── Build ─────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return GestureDetector(
      onTap: () => FocusScope.of(context).unfocus(),
      child: Scaffold(
        backgroundColor: theme.scaffoldBackgroundColor,
        body: SafeArea(
          child: Column(
            children: [
              if (widget.showHeader) _buildHeader(),
              Expanded(
                child: SingleChildScrollView(
                  controller: _scrollCtrl,
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 32),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const SizedBox(height: 16),
                      _buildQuestionField(),
                      if (_mentionOpen) _buildMentionDropdown(),
                      const SizedBox(height: 16),
                      _buildOptionsSection(),
                      const SizedBox(height: 20),
                      _buildLocationField(),
                      if (_locationOpen) _buildLocationDropdown(),
                      const SizedBox(height: 16),
                      _buildHashtagSection(),
                      const SizedBox(height: 20),
                      _buildAudienceSelector(),
                      const SizedBox(height: 20),
                      _buildPublishTimeSection(),
                      const SizedBox(height: 20),
                      _buildToggles(),
                      const SizedBox(height: 24),
                      if (_submitError != null) _buildErrorBanner(_submitError!),
                      const SizedBox(height: 8),
                      _buildSubmitButton(),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  // ── Header ────────────────────────────────────────────────────────────────

  Widget _buildHeader() {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        color: scheme.surface,
        border: Border(
          bottom: BorderSide(color: scheme.outline.withValues(alpha: 0.4)),
        ),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Create poll post',
                  style: TextStyle(
                    color: scheme.onSurface,
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  'Ask your audience a question',
                  style: TextStyle(
                    color: scheme.onSurfaceVariant,
                    fontSize: 13,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // ── Question field ────────────────────────────────────────────────────────

  Widget _buildQuestionField() {
    final theme = Theme.of(context);
    final tokens = _tokens(theme);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _SectionLabel(text: 'Poll question'),
        const SizedBox(height: 8),
        Container(
          decoration: BoxDecoration(
            color: tokens.panel,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: tokens.panelBorder),
          ),
          child: TextField(
            controller: _questionCtrl,
            focusNode: _questionFocus,
            onChanged: _onQuestionChanged,
            maxLines: 4,
            minLines: 2,
            maxLength: 500,
            style: TextStyle(color: tokens.text, fontSize: 14),
            decoration: InputDecoration(
              hintText: LanguageController.instance.t('post.create.pollQuestionHint'),
              hintStyle: TextStyle(color: tokens.textMuted),
              border: InputBorder.none,
              contentPadding: const EdgeInsets.all(14),
              counterStyle: TextStyle(color: tokens.textMuted, fontSize: 11),
            ),
          ),
        ),
      ],
    );
  }

  // ── Mention dropdown ──────────────────────────────────────────────────────

  Widget _buildMentionDropdown() {
    final theme = Theme.of(context);
    final tokens = _tokens(theme);
    return Container(
      margin: const EdgeInsets.only(top: 4),
      decoration: BoxDecoration(
        color: tokens.panelMuted,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: tokens.panelBorder),
      ),
      child: _mentionLoading
          ? const Padding(
              padding: EdgeInsets.all(12),
              child: Center(
                child: SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              ),
            )
          : ListView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: _mentionSuggestions.length,
              itemBuilder: (_, i) {
                final s = _mentionSuggestions[i];
                return InkWell(
                  onTap: () => _insertMention(s),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 10,
                    ),
                    child: Row(
                      children: [
                        CircleAvatar(
                          radius: 16,
                          backgroundColor: tokens.panel,
                          backgroundImage: s.avatarUrl != null
                              ? NetworkImage(s.avatarUrl!)
                              : null,
                          child: s.avatarUrl == null
                              ? Text(
                                  s.username.substring(0, 1).toUpperCase(),
                                  style: TextStyle(
                                    color: tokens.text,
                                    fontSize: 12,
                                  ),
                                )
                              : null,
                        ),
                        const SizedBox(width: 10),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            if (s.displayName != null)
                              Text(
                                s.displayName!,
                                style: TextStyle(
                                  color: tokens.text,
                                  fontSize: 13,
                                ),
                              ),
                            Text(
                              '@${s.username}',
                              style: TextStyle(
                                color: tokens.textMuted,
                                fontSize: 12,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
    );
  }

  // ── Options section ───────────────────────────────────────────────────────

  Widget _buildOptionsSection() {
    final theme = Theme.of(context);
    final tokens = _tokens(theme);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _SectionLabel(text: 'Poll options'),
        const SizedBox(height: 8),
        ...List.generate(_options.length, (i) {
          final opt = _options[i];
          return Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: _OptionRow(
              index: i,
              controller: opt.controller,
              imageFile: opt.imageFile,
              canRemove: _options.length > _kMinOptions,
              onRemove: () => _removeOption(i),
              onPickImage: () => _pickOptionImage(i),
              onClearImage: () => setState(() => _options[i].imageFile = null),
              tokens: tokens,
            ),
          );
        }),
        if (_options.length < _kMaxOptions)
          GestureDetector(
            onTap: _addOption,
            child: Container(
              padding: const EdgeInsets.symmetric(vertical: 12),
              decoration: BoxDecoration(
                color: tokens.panelMuted,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: tokens.panelBorder,
                  style: BorderStyle.solid,
                ),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.add_rounded, color: tokens.primary, size: 18),
                  const SizedBox(width: 6),
                  Text(
                    'Add option',
                    style: TextStyle(
                      color: tokens.primary,
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }

  // ── Location ──────────────────────────────────────────────────────────────

  Widget _buildLocationField() {
    final theme = Theme.of(context);
    final tokens = _tokens(theme);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _SectionLabel(
          text: LanguageController.instance.t('post.create.locationLabel'),
        ),
        const SizedBox(height: 8),
        Container(
          decoration: BoxDecoration(
            color: tokens.panel,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: tokens.panelBorder),
          ),
          child: TextField(
            controller: _locationCtrl,
            onChanged: _onLocationChanged,
            style: TextStyle(color: tokens.text, fontSize: 14),
            decoration: InputDecoration(
              hintText: LanguageController.instance.t('post.create.locationHint'),
              hintStyle: TextStyle(color: tokens.textMuted),
              border: InputBorder.none,
              contentPadding: const EdgeInsets.symmetric(
                horizontal: 14,
                vertical: 13,
              ),
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
                      icon: Icon(
                        Icons.close,
                        color: tokens.textMuted,
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
          ),
        ),
      ],
    );
  }

  Widget _buildLocationDropdown() {
    final theme = Theme.of(context);
    final tokens = _tokens(theme);
    return Container(
      margin: const EdgeInsets.only(top: 4),
      decoration: BoxDecoration(
        color: tokens.panelMuted,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: tokens.panelBorder),
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
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
              child: Row(
                children: [
                  Icon(Icons.place_outlined, color: tokens.textMuted, size: 16),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      s.label,
                      style: TextStyle(color: tokens.text, fontSize: 13),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  // ── Hashtags ──────────────────────────────────────────────────────────────

  Widget _buildHashtagSection() {
    final theme = Theme.of(context);
    final tokens = _tokens(theme);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _SectionLabel(
          text: LanguageController.instance.t('post.create.hashtagLabel'),
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: Container(
                decoration: BoxDecoration(
                  color: tokens.panel,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: tokens.panelBorder),
                ),
                child: TextField(
                  controller: _hashtagCtrl,
                  onSubmitted: (_) => _addHashtag(),
                  textInputAction: TextInputAction.done,
                  style: TextStyle(color: tokens.text, fontSize: 14),
                  decoration: InputDecoration(
                    hintText: LanguageController.instance.t('post.create.hashtagHint'),
                    hintStyle: TextStyle(color: tokens.textMuted),
                    border: InputBorder.none,
                    prefixText: '# ',
                    prefixStyle: TextStyle(
                      color: tokens.primary,
                      fontWeight: FontWeight.w600,
                    ),
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 13,
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(width: 8),
            GestureDetector(
              onTap: _addHashtag,
              child: Container(
                padding: const EdgeInsets.all(13),
                decoration: BoxDecoration(
                  color: tokens.panelMuted,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: tokens.panelBorder),
                ),
                child: Icon(Icons.add_rounded, color: tokens.primary, size: 20),
              ),
            ),
          ],
        ),
        if (_hashtags.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 10),
            child: Wrap(
              spacing: 6,
              runSpacing: 6,
              children: _hashtags
                  .map(
                    (tag) => _HashtagChip(
                      tag: tag,
                      onRemove: () => setState(() => _hashtags.remove(tag)),
                    ),
                  )
                  .toList(),
            ),
          ),
      ],
    );
  }

  // ── Audience ──────────────────────────────────────────────────────────────

  Widget _buildAudienceSelector() {
    final theme = Theme.of(context);
    final tokens = _tokens(theme);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _SectionLabel(
          text: LanguageController.instance.t('post.create.audience'),
        ),
        const SizedBox(height: 8),
        ..._Audience.values.map(
          (a) => GestureDetector(
            onTap: () => setState(() => _audience = a),
            child: Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              decoration: BoxDecoration(
                color: _audience == a
                    ? tokens.primary.withValues(alpha: 0.16)
                    : tokens.panel,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: _audience == a ? tokens.primary : tokens.panelBorder,
                ),
              ),
              child: Row(
                children: [
                  Icon(
                    a.icon,
                    color: _audience == a ? tokens.primary : tokens.textMuted,
                    size: 20,
                  ),
                  const SizedBox(width: 12),
                  Text(
                    a.label,
                    style: TextStyle(
                      color: _audience == a ? tokens.text : tokens.textMuted,
                      fontSize: 14,
                      fontWeight: _audience == a
                          ? FontWeight.w600
                          : FontWeight.w400,
                    ),
                  ),
                  const Spacer(),
                  if (_audience == a)
                    Icon(
                      Icons.check_circle_rounded,
                      color: tokens.primary,
                      size: 18,
                    ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }

  // ── Publish time ──────────────────────────────────────────────────────────

  Widget _buildPublishTimeSection() {
    final theme = Theme.of(context);
    final tokens = _tokens(theme);
    final scheduled = _scheduledAtLocal;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _SectionLabel(
          text: LanguageController.instance.t('post.create.publishTime'),
        ),
        const SizedBox(height: 8),
        _PublishModeOption(
          title: LanguageController.instance.t('post.create.postNow'),
          subtitle: LanguageController.instance.t('post.create.postNowDescription'),
          selected: _publishMode == _PublishMode.now,
          onTap: () => setState(() => _publishMode = _PublishMode.now),
        ),
        const SizedBox(height: 8),
        _PublishModeOption(
          title: LanguageController.instance.t('post.create.schedule'),
          subtitle: LanguageController.instance.t('post.create.scheduleDescription'),
          selected: _publishMode == _PublishMode.schedule,
          onTap: () {
            setState(() {
              _publishMode = _PublishMode.schedule;
              _scheduledAtLocal ??= _nextValidScheduleTime();
            });
          },
        ),
        if (_publishMode == _PublishMode.schedule)
          Container(
            margin: const EdgeInsets.only(top: 10),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: tokens.panel,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: tokens.panelBorder),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: _ScheduleFieldButton(
                        label: LanguageController.instance.t('post.create.date'),
                        value: scheduled == null
                            ? LanguageController.instance.t('post.create.selectDate')
                            : _formatScheduleDate(scheduled),
                        icon: Icons.calendar_today_outlined,
                        onTap: _pickScheduleDate,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: _ScheduleFieldButton(
                        label: LanguageController.instance.t('post.create.time'),
                        value: scheduled == null
                            ? LanguageController.instance.t('post.create.selectTime')
                            : _formatScheduleTime(scheduled),
                        icon: Icons.schedule_rounded,
                        onTap: _pickScheduleTime,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  LanguageController.instance.t('post.create.timezone'),
                  style: TextStyle(color: tokens.textMuted, fontSize: 12),
                ),
              ],
            ),
          ),
      ],
    );
  }

  // ── Toggles ───────────────────────────────────────────────────────────────

  Widget _buildToggles() {
    final theme = Theme.of(context);
    final tokens = _tokens(theme);
    return Container(
      decoration: BoxDecoration(
        color: tokens.panel,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: tokens.panelBorder),
      ),
      child: Column(
        children: [
          _ToggleRow(
            label: LanguageController.instance.t('post.create.allowComments'),
            value: _allowComments,
            onChanged: (v) => setState(() => _allowComments = v),
            isTop: true,
          ),
          _ToggleRow(
            label: LanguageController.instance.t('post.create.allowMultipleAnswers'),
            value: _allowMultiple,
            onChanged: (v) => setState(() => _allowMultiple = v),
          ),
          _ToggleRow(
            label: LanguageController.instance.t('post.create.hideLikeCount'),
            value: _hideLikeCount,
            onChanged: (v) => setState(() => _hideLikeCount = v),
            isBottom: true,
          ),
        ],
      ),
    );
  }

  // ── Error banner & submit button ──────────────────────────────────────────

  Widget _buildErrorBanner(String msg) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: const Color(0xFF2D0E0E),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: const Color(0xFF7F1D1D)),
      ),
      child: Row(
        children: [
          const Icon(
            Icons.error_outline_rounded,
            color: Color(0xFFF87171),
            size: 18,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              msg,
              style: const TextStyle(color: Color(0xFFF87171), fontSize: 13),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSubmitButton() {
    final theme = Theme.of(context);
    final tokens = _tokens(theme);
    return SizedBox(
      width: double.infinity,
      child: ElevatedButton(
        onPressed: _submitting ? null : _submit,
        style: ElevatedButton.styleFrom(
          backgroundColor: tokens.primary,
          foregroundColor: theme.colorScheme.onPrimary,
          disabledBackgroundColor: tokens.primary.withValues(alpha: 0.45),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          padding: const EdgeInsets.symmetric(vertical: 14),
        ),
        child: _submitting
            ? SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: theme.colorScheme.onPrimary,
                ),
              )
            : const Text(
                'Post poll',
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
              ),
      ),
    );
  }

  AppSemanticColors _tokens(ThemeData theme) =>
      theme.extension<AppSemanticColors>() ??
      (theme.brightness == Brightness.dark
          ? AppSemanticColors.dark
          : AppSemanticColors.light);
}

// ── Shared sub-widgets ────────────────────────────────────────────────────────

class _SectionLabel extends StatelessWidget {
  const _SectionLabel({required this.text});
  final String text;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final tokens = theme.extension<AppSemanticColors>() ??
        (theme.brightness == Brightness.dark
            ? AppSemanticColors.dark
            : AppSemanticColors.light);
    return Text(
      text,
      style: TextStyle(
        color: tokens.text,
        fontSize: 13,
        fontWeight: FontWeight.w600,
      ),
    );
  }
}

class _OptionRow extends StatelessWidget {
  const _OptionRow({
    required this.index,
    required this.controller,
    this.imageFile,
    required this.canRemove,
    required this.onRemove,
    required this.onPickImage,
    required this.onClearImage,
    required this.tokens,
  });

  final int index;
  final TextEditingController controller;
  final File? imageFile;
  final bool canRemove;
  final VoidCallback onRemove;
  final VoidCallback onPickImage;
  final VoidCallback onClearImage;
  final AppSemanticColors tokens;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        GestureDetector(
          onTap: onPickImage,
          child: Container(
            width: 46,
            height: 46,
            decoration: BoxDecoration(
              color: tokens.panelMuted,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: tokens.panelBorder),
            ),
            clipBehavior: Clip.hardEdge,
            child: imageFile != null
                ? Stack(
                    children: [
                      Image.file(
                        imageFile!,
                        fit: BoxFit.cover,
                        width: 46,
                        height: 46,
                      ),
                      Positioned(
                        top: 2,
                        right: 2,
                        child: GestureDetector(
                          onTap: onClearImage,
                          child: Container(
                            decoration: const BoxDecoration(
                              color: Colors.black54,
                              shape: BoxShape.circle,
                            ),
                            padding: const EdgeInsets.all(3),
                            child: const Icon(
                              Icons.close,
                              size: 11,
                              color: Colors.white,
                            ),
                          ),
                        ),
                      ),
                    ],
                  )
                : Icon(
                    Icons.image_outlined,
                    size: 20,
                    color: tokens.textMuted,
                  ),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Container(
            decoration: BoxDecoration(
              color: tokens.panel,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: tokens.panelBorder),
            ),
            child: TextField(
              controller: controller,
              style: TextStyle(color: tokens.text, fontSize: 14),
              decoration: InputDecoration(
                hintText: LanguageController.instance.t('post.create.pollOptionHint').replaceAll('{n}', '${index + 1}'),
                hintStyle: TextStyle(color: tokens.textMuted),
                border: InputBorder.none,
                contentPadding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 11,
                ),
              ),
            ),
          ),
        ),
        if (canRemove) ...[
          const SizedBox(width: 6),
          GestureDetector(
            onTap: onRemove,
            child: Icon(
              Icons.remove_circle_outline,
              color: tokens.textMuted,
              size: 22,
            ),
          ),
        ],
      ],
    );
  }
}

class _HashtagChip extends StatelessWidget {
  const _HashtagChip({required this.tag, required this.onRemove});
  final String tag;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final tokens = theme.extension<AppSemanticColors>() ??
        (theme.brightness == Brightness.dark
            ? AppSemanticColors.dark
            : AppSemanticColors.light);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: tokens.primary.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: tokens.primary.withValues(alpha: 0.35),
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            '#$tag',
            style: TextStyle(
              color: tokens.primary,
              fontSize: 13,
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(width: 4),
          GestureDetector(
            onTap: onRemove,
            child: Icon(
              Icons.close_rounded,
              size: 14,
              color: tokens.primary,
            ),
          ),
        ],
      ),
    );
  }
}

class _PublishModeOption extends StatelessWidget {
  const _PublishModeOption({
    required this.title,
    required this.subtitle,
    required this.selected,
    required this.onTap,
  });

  final String title;
  final String subtitle;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final tokens = theme.extension<AppSemanticColors>() ??
        (theme.brightness == Brightness.dark
            ? AppSemanticColors.dark
            : AppSemanticColors.light);
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: selected ? tokens.primary.withValues(alpha: 0.14) : tokens.panel,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: selected ? tokens.primary : tokens.panelBorder,
          ),
        ),
        child: Row(
          children: [
            Icon(
              selected ? Icons.radio_button_checked : Icons.radio_button_unchecked,
              color: selected ? tokens.primary : tokens.textMuted,
              size: 20,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: TextStyle(
                      color: tokens.text,
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  Text(
                    subtitle,
                    style: TextStyle(
                      color: tokens.textMuted,
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ScheduleFieldButton extends StatelessWidget {
  const _ScheduleFieldButton({
    required this.label,
    required this.value,
    required this.icon,
    required this.onTap,
  });

  final String label;
  final String value;
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final tokens = theme.extension<AppSemanticColors>() ??
        (theme.brightness == Brightness.dark
            ? AppSemanticColors.dark
            : AppSemanticColors.light);
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: tokens.panelMuted,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: tokens.panelBorder),
        ),
        child: Row(
          children: [
            Icon(icon, color: tokens.primary, size: 16),
            const SizedBox(width: 8),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: TextStyle(color: tokens.textMuted, fontSize: 11),
                  ),
                  Text(
                    value,
                    style: TextStyle(
                      color: tokens.text,
                      fontSize: 13,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ToggleRow extends StatelessWidget {
  const _ToggleRow({
    required this.label,
    required this.value,
    required this.onChanged,
    this.isTop = false,
    this.isBottom = false,
  });

  final String label;
  final bool value;
  final ValueChanged<bool> onChanged;
  final bool isTop;
  final bool isBottom;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final tokens = theme.extension<AppSemanticColors>() ??
        (theme.brightness == Brightness.dark
            ? AppSemanticColors.dark
            : AppSemanticColors.light);
    return Column(
      children: [
        if (!isTop) Divider(height: 1, color: tokens.panelBorder),
        SwitchListTile(
          contentPadding: const EdgeInsets.symmetric(horizontal: 16),
          title: Text(
            label,
            style: TextStyle(color: tokens.text, fontSize: 14),
          ),
          value: value,
          activeThumbColor: tokens.primary,
          onChanged: onChanged,
        ),
      ],
    );
  }
}
