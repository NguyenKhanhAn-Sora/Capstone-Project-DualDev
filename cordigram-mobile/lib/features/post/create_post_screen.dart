import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:image_picker/image_picker.dart';
import 'create_post_service.dart';
import '../../core/config/app_theme.dart';
import '../../core/services/api_service.dart';
import '../../core/services/auth_storage.dart';

// ── Models ────────────────────────────────────────────────────────────────────

enum _Audience { public, followers, private }

extension _AudienceLabel on _Audience {
  String get label {
    switch (this) {
      case _Audience.public:
        return 'Public';
      case _Audience.followers:
        return 'Friends / Following';
      case _Audience.private:
        return 'Private';
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

class _MediaItem {
  _MediaItem({required this.file, required this.isVideo});
  final File file;
  final bool isVideo;
}

enum _PublishMode { now, schedule }

// ── Screen ────────────────────────────────────────────────────────────────────

class CreatePostScreen extends StatefulWidget {
  const CreatePostScreen({
    super.key,
    this.onPostCreated,
    this.showHeader = true,
  });

  /// Called after a successful post creation (e.g. to switch back to Home tab).
  final VoidCallback? onPostCreated;

  /// Set to false when embedded inside CreateTabScreen (which provides its own header).
  final bool showHeader;

  @override
  State<CreatePostScreen> createState() => _CreatePostScreenState();
}

class _CreatePostScreenState extends State<CreatePostScreen> {
  static const int _kMaxMedia = 10;

  final _captionCtrl = TextEditingController();
  final _locationCtrl = TextEditingController();
  final _hashtagCtrl = TextEditingController();
  final _captionFocus = FocusNode();
  final _scrollCtrl = ScrollController();
  final _picker = ImagePicker();

  final List<_MediaItem> _media = [];
  _Audience _audience = _Audience.public;
  _PublishMode _publishMode = _PublishMode.now;
  bool _allowComments = true;
  bool _allowDownload = false;
  bool _hideLikeCount = false;
  final List<String> _hashtags = [];
  DateTime? _scheduledAtLocal;

  bool _submitting = false;
  String? _submitError;
  String? _submitSuccess;

  // location search
  List<_LocationSuggestion> _locationSuggestions = [];
  bool _locationLoading = false;
  bool _locationOpen = false;
  Timer? _locationDebounce;

  // mention search
  List<_MentionSuggestion> _mentionSuggestions = [];
  bool _mentionOpen = false;
  bool _mentionLoading = false;

  static final _mentionRegex = RegExp(r'@([a-zA-Z0-9_.]{0,30})$');

  @override
  void dispose() {
    _locationDebounce?.cancel();
    _captionCtrl.dispose();
    _locationCtrl.dispose();
    _hashtagCtrl.dispose();
    _captionFocus.dispose();
    _scrollCtrl.dispose();
    super.dispose();
  }

  // ── Media picking ─────────────────────────────────────────────────────────

  Future<void> _pickImages() async {
    final remaining = _kMaxMedia - _media.length;
    if (remaining <= 0) {
      _showSnack('Maximum $_kMaxMedia files reached.');
      return;
    }
    final picked = await _picker.pickMultiImage(
      imageQuality: 85,
      limit: remaining,
    );
    if (picked.isEmpty) return;
    setState(() {
      for (final x in picked) {
        _media.add(_MediaItem(file: File(x.path), isVideo: false));
      }
    });
  }

  Future<void> _pickVideo() async {
    if (_media.length >= _kMaxMedia) {
      _showSnack('Maximum $_kMaxMedia files reached.');
      return;
    }
    final picked = await _picker.pickVideo(source: ImageSource.gallery);
    if (picked == null) return;
    setState(
      () => _media.add(_MediaItem(file: File(picked.path), isVideo: true)),
    );
  }

  Future<void> _pickFromCamera() async {
    if (_media.length >= _kMaxMedia) {
      _showSnack('Maximum $_kMaxMedia files reached.');
      return;
    }
    final picked = await _picker.pickImage(
      source: ImageSource.camera,
      imageQuality: 85,
    );
    if (picked == null) return;
    setState(
      () => _media.add(_MediaItem(file: File(picked.path), isVideo: false)),
    );
  }

  void _removeMedia(int index) {
    setState(() => _media.removeAt(index));
  }

  // ── Hashtags ──────────────────────────────────────────────────────────────

  void _addHashtag() {
    final raw = _hashtagCtrl.text.trim().replaceFirst('#', '');
    final tag = raw
        .toLowerCase()
        .replaceAll(RegExp(r'\s+'), '')
        .replaceAll(RegExp(r'[^a-zA-Z0-9_]'), '');
    if (tag.isEmpty || _hashtags.contains(tag)) {
      _hashtagCtrl.clear();
      return;
    }
    setState(() {
      _hashtags.add(tag);
      _hashtagCtrl.clear();
    });
  }

  // ── Mention autocomplete ──────────────────────────────────────────────────

  void _onCaptionChanged(String value) {
    final match = _mentionRegex.firstMatch(value);
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
    final text = _captionCtrl.text;
    final match = _mentionRegex.firstMatch(text);
    if (match == null) return;
    final before = text.substring(0, match.start);
    final after = text.substring(match.end);
    final inserted = '$before@${s.username} $after';
    _captionCtrl.value = TextEditingValue(
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

  // ── Location search ───────────────────────────────────────────────────────

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

  // ── Submit ────────────────────────────────────────────────────────────────

  Future<void> _submit() async {
    if (_media.isEmpty) {
      setState(
        () => _submitError =
            'Please choose at least one photo or video before publishing.',
      );
      return;
    }
    setState(() {
      _submitting = true;
      _submitError = null;
      _submitSuccess = null;
    });

    try {
      // Upload all media sequentially
      final uploadedMedia = <Map<String, dynamic>>[];
      for (final item in _media) {
        final result = await CreatePostService.uploadMedia(item.file);
        uploadedMedia.add({
          'type': item.isVideo ? 'video' : 'image',
          'url': result.url,
          'metadata': {
            'publicId': result.publicId,
            if (result.resourceType != null)
              'resourceType': result.resourceType,
            if (result.format != null) 'format': result.format,
            if (result.width != null) 'width': result.width,
            if (result.height != null) 'height': result.height,
            if (result.bytes != null) 'bytes': result.bytes,
            if (result.duration != null) 'duration': result.duration,
            if (result.folder != null) 'folder': result.folder,
            if (result.moderationDecision != null)
              'moderationDecision': result.moderationDecision,
            if (result.moderationProvider != null)
              'moderationProvider': result.moderationProvider,
          },
        });
      }

      // Extract @mentions from caption
      final mentionMatches = RegExp(
        r'@([a-zA-Z0-9_.]{1,30})',
      ).allMatches(_captionCtrl.text);
      final mentions = mentionMatches.map((m) => m.group(1)!).toSet().toList();

      String? scheduledAtIso;
      if (_publishMode == _PublishMode.schedule) {
        final selected = _scheduledAtLocal;
        if (selected == null) {
          throw const ApiException(
            'Please choose a date and time for scheduling.',
          );
        }
        if (!selected.isAfter(DateTime.now())) {
          throw const ApiException('Scheduled time must be later than now.');
        }
        scheduledAtIso = selected.toUtc().toIso8601String();
      }

      await CreatePostService.createPost(
        caption: _captionCtrl.text,
        location: _locationCtrl.text,
        audience: _audience.value,
        allowComments: _allowComments,
        allowDownload: _allowDownload,
        hideLikeCount: _hideLikeCount,
        hashtags: List<String>.from(_hashtags),
        mentions: mentions,
        media: uploadedMedia,
        scheduledAt: scheduledAtIso,
      );

      if (!mounted) return;
      final wasScheduled = _publishMode == _PublishMode.schedule;
      _resetToInitialState();
      _showSnack(
        wasScheduled
            ? 'Post scheduled successfully!'
            : 'Post created successfully!',
      );
      widget.onPostCreated?.call();
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _submitError = e.message;
        _submitting = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _submitError = e.toString();
        _submitting = false;
      });
    }
  }

  void _resetToInitialState() {
    _locationDebounce?.cancel();
    FocusScope.of(context).unfocus();

    if (_scrollCtrl.hasClients) {
      _scrollCtrl.jumpTo(0);
    }

    _captionCtrl.clear();
    _locationCtrl.clear();
    _hashtagCtrl.clear();

    setState(() {
      _submitting = false;
      _submitError = null;
      _submitSuccess = null;
      _media.clear();
      _hashtags.clear();
      _audience = _Audience.public;
      _publishMode = _PublishMode.now;
      _allowComments = true;
      _allowDownload = false;
      _hideLikeCount = false;
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

  DateTime _nextValidScheduleTime() {
    final now = DateTime.now();
    return now.add(const Duration(minutes: 1));
  }

  String _formatScheduleDate(DateTime value) {
    final y = value.year.toString();
    final m = value.month.toString().padLeft(2, '0');
    final d = value.day.toString().padLeft(2, '0');
    return '$d/$m/$y';
  }

  String _formatScheduleTime(DateTime value) {
    final h = value.hour.toString().padLeft(2, '0');
    final m = value.minute.toString().padLeft(2, '0');
    return '$h:$m';
  }

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
    var next = DateTime(
      picked.year,
      picked.month,
      picked.day,
      base.hour,
      base.minute,
    );
    if (!next.isAfter(DateTime.now())) {
      next = _nextValidScheduleTime();
    }
    setState(() => _scheduledAtLocal = next);
  }

  Future<void> _pickScheduleTime() async {
    if (_scheduledAtLocal == null) {
      setState(() => _scheduledAtLocal = _nextValidScheduleTime());
    }
    final seed = _scheduledAtLocal ?? _nextValidScheduleTime();
    DateTime draft = seed;

    final theme = Theme.of(context);
    final tokens =
        theme.extension<AppSemanticColors>() ??
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
                      child: const Text('Cancel'),
                    ),
                    const Spacer(),
                    Text(
                      'Select time',
                      style: TextStyle(
                        color: tokens.text,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const Spacer(),
                    TextButton(
                      onPressed: () => Navigator.of(context).pop(draft),
                      child: const Text('Done'),
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
    final next = DateTime(
      current.year,
      current.month,
      current.day,
      picked.hour,
      picked.minute,
    );
    if (!next.isAfter(DateTime.now())) {
      _showSnack('Please choose a future time.');
      return;
    }
    setState(() => _scheduledAtLocal = next);
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
                      _buildMediaSection(),
                      const SizedBox(height: 20),
                      _buildCaptionField(),
                      if (_mentionOpen) _buildMentionDropdown(),
                      const SizedBox(height: 16),
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
                      if (_submitError != null)
                        _buildErrorBanner(_submitError!),
                      if (_submitSuccess != null)
                        _buildSuccessBanner(_submitSuccess!),
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

  // ── Header ─────────────────────────────────────────────────────────────────

  Widget _buildHeader() {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        color: scheme.surface,
        border: Border(
          bottom: BorderSide(
            color: scheme.outline.withValues(alpha: 0.4),
            width: 1,
          ),
        ),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Create post',
                  style: TextStyle(
                    color: scheme.onSurface,
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                SizedBox(height: 2),
                Text(
                  'Share genuine moments',
                  style: TextStyle(
                    color: scheme.onSurfaceVariant,
                    fontSize: 13,
                  ),
                ),
              ],
            ),
          ),
          if (_submitting)
            SizedBox(
              width: 22,
              height: 22,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                color: scheme.primary,
              ),
            ),
        ],
      ),
    );
  }

  // ── Media section ─────────────────────────────────────────────────────────

  Widget _buildMediaSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _SectionLabel(text: 'Media'),
        const SizedBox(height: 10),
        if (_media.isEmpty) _buildDropzone() else _buildMediaGrid(),
        if (_media.isNotEmpty && _media.length < _kMaxMedia)
          Padding(
            padding: const EdgeInsets.only(top: 10),
            child: Row(
              children: [
                _AddMediaButton(
                  icon: Icons.photo_library_outlined,
                  label: 'Photos',
                  onTap: _pickImages,
                ),
                const SizedBox(width: 8),
                _AddMediaButton(
                  icon: Icons.videocam_outlined,
                  label: 'Video',
                  onTap: _pickVideo,
                ),
                const SizedBox(width: 8),
                _AddMediaButton(
                  icon: Icons.camera_alt_outlined,
                  label: 'Camera',
                  onTap: _pickFromCamera,
                ),
              ],
            ),
          ),
      ],
    );
  }

  Widget _buildDropzone() {
    final theme = Theme.of(context);
    final tokens =
        theme.extension<AppSemanticColors>() ??
        (theme.brightness == Brightness.dark
            ? AppSemanticColors.dark
            : AppSemanticColors.light);
    return GestureDetector(
      onTap: () => _showMediaPicker(),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(vertical: 36),
        decoration: BoxDecoration(
          color: tokens.panel,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: tokens.panelBorder, width: 1.5),
        ),
        child: Column(
          children: [
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: tokens.primary.withValues(alpha: 0.16),
                borderRadius: BorderRadius.circular(50),
              ),
              child: Icon(
                Icons.add_photo_alternate_outlined,
                color: tokens.primary,
                size: 36,
              ),
            ),
            const SizedBox(height: 14),
            Text(
              'Add a photo or video',
              style: TextStyle(
                color: tokens.text,
                fontSize: 16,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              'Supports .jpg, .png, .mp4, .mov · up to 10 files',
              style: TextStyle(color: tokens.textMuted, fontSize: 13),
            ),
            const SizedBox(height: 18),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                _OutlineButton(
                  icon: Icons.photo_library_outlined,
                  label: 'Photos',
                  onTap: _pickImages,
                ),
                const SizedBox(width: 8),
                _OutlineButton(
                  icon: Icons.videocam_outlined,
                  label: 'Video',
                  onTap: _pickVideo,
                ),
                const SizedBox(width: 8),
                _OutlineButton(
                  icon: Icons.camera_alt_outlined,
                  label: 'Camera',
                  onTap: _pickFromCamera,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  void _showMediaPicker() {
    final theme = Theme.of(context);
    final tokens =
        theme.extension<AppSemanticColors>() ??
        (theme.brightness == Brightness.dark
            ? AppSemanticColors.dark
            : AppSemanticColors.light);
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: tokens.panel,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
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
            ListTile(
              leading: Icon(
                Icons.photo_library_outlined,
                color: tokens.textMuted,
              ),
              title: Text(
                'Choose photos',
                style: TextStyle(color: tokens.text),
              ),
              onTap: () {
                Navigator.pop(context);
                _pickImages();
              },
            ),
            ListTile(
              leading: Icon(Icons.videocam_outlined, color: tokens.textMuted),
              title: Text('Choose video', style: TextStyle(color: tokens.text)),
              onTap: () {
                Navigator.pop(context);
                _pickVideo();
              },
            ),
            ListTile(
              leading: Icon(Icons.camera_alt_outlined, color: tokens.textMuted),
              title: Text('Take photo', style: TextStyle(color: tokens.text)),
              onTap: () {
                Navigator.pop(context);
                _pickFromCamera();
              },
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  Widget _buildMediaGrid() {
    final theme = Theme.of(context);
    final tokens =
        theme.extension<AppSemanticColors>() ??
        (theme.brightness == Brightness.dark
            ? AppSemanticColors.dark
            : AppSemanticColors.light);
    return SizedBox(
      height: 130,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: _media.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (context, index) {
          final item = _media[index];
          return Stack(
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(10),
                child: item.isVideo
                    ? Container(
                        width: 110,
                        height: 130,
                        color: tokens.panelMuted,
                        child: Icon(
                          Icons.videocam_rounded,
                          color: tokens.primary,
                          size: 40,
                        ),
                      )
                    : Image.file(
                        item.file,
                        width: 110,
                        height: 130,
                        fit: BoxFit.cover,
                      ),
              ),
              Positioned(
                top: 4,
                right: 4,
                child: GestureDetector(
                  onTap: () => _removeMedia(index),
                  child: Container(
                    decoration: const BoxDecoration(
                      color: Color(0xCC000000),
                      shape: BoxShape.circle,
                    ),
                    padding: const EdgeInsets.all(3),
                    child: const Icon(
                      Icons.close,
                      color: Colors.white,
                      size: 14,
                    ),
                  ),
                ),
              ),
              if (item.isVideo)
                const Positioned(
                  bottom: 6,
                  left: 6,
                  child: Icon(
                    Icons.play_circle_fill_rounded,
                    color: Colors.white70,
                    size: 22,
                  ),
                ),
            ],
          );
        },
      ),
    );
  }

  // ── Caption ───────────────────────────────────────────────────────────────

  Widget _buildCaptionField() {
    final theme = Theme.of(context);
    final tokens =
        theme.extension<AppSemanticColors>() ??
        (theme.brightness == Brightness.dark
            ? AppSemanticColors.dark
            : AppSemanticColors.light);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _SectionLabel(text: 'Caption'),
        const SizedBox(height: 8),
        Container(
          decoration: BoxDecoration(
            color: tokens.panel,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: tokens.panelBorder),
          ),
          child: TextField(
            controller: _captionCtrl,
            focusNode: _captionFocus,
            onChanged: _onCaptionChanged,
            maxLines: 5,
            minLines: 3,
            maxLength: 2200,
            style: TextStyle(color: tokens.text, fontSize: 14),
            decoration: InputDecoration(
              hintText: 'Write a caption…',
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
    final tokens =
        theme.extension<AppSemanticColors>() ??
        (theme.brightness == Brightness.dark
            ? AppSemanticColors.dark
            : AppSemanticColors.light);
    return Container(
      margin: const EdgeInsets.only(top: 4),
      decoration: BoxDecoration(
        color: tokens.panelMuted,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: tokens.panelBorder),
      ),
      child: _mentionLoading
          ? Padding(
              padding: EdgeInsets.all(12),
              child: Center(
                child: SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: tokens.primary,
                  ),
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

  // ── Location ──────────────────────────────────────────────────────────────

  Widget _buildLocationField() {
    final theme = Theme.of(context);
    final tokens =
        theme.extension<AppSemanticColors>() ??
        (theme.brightness == Brightness.dark
            ? AppSemanticColors.dark
            : AppSemanticColors.light);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _SectionLabel(text: 'Location'),
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
              hintText: 'Add a location…',
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
                      padding: EdgeInsets.all(12),
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
    final tokens =
        theme.extension<AppSemanticColors>() ??
        (theme.brightness == Brightness.dark
            ? AppSemanticColors.dark
            : AppSemanticColors.light);
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
    final tokens =
        theme.extension<AppSemanticColors>() ??
        (theme.brightness == Brightness.dark
            ? AppSemanticColors.dark
            : AppSemanticColors.light);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _SectionLabel(text: 'Hashtags'),
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
                    hintText: 'e.g. travel, photography',
                    hintStyle: TextStyle(color: tokens.textMuted),
                    border: InputBorder.none,
                    prefixText: '# ',
                    prefixStyle: TextStyle(
                      color: tokens.primary,
                      fontWeight: FontWeight.w600,
                    ),
                    contentPadding: EdgeInsets.symmetric(
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
    final tokens =
        theme.extension<AppSemanticColors>() ??
        (theme.brightness == Brightness.dark
            ? AppSemanticColors.dark
            : AppSemanticColors.light);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _SectionLabel(text: 'Audience'),
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

  Widget _buildPublishTimeSection() {
    final theme = Theme.of(context);
    final tokens =
        theme.extension<AppSemanticColors>() ??
        (theme.brightness == Brightness.dark
            ? AppSemanticColors.dark
            : AppSemanticColors.light);
    final scheduled = _scheduledAtLocal;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _SectionLabel(text: 'Publish time'),
        const SizedBox(height: 8),
        _PublishModeOption(
          title: 'Post now',
          subtitle: 'Publish immediately after you tap finish.',
          selected: _publishMode == _PublishMode.now,
          onTap: () => setState(() => _publishMode = _PublishMode.now),
        ),
        const SizedBox(height: 8),
        _PublishModeOption(
          title: 'Schedule',
          subtitle: 'Post automatically at your chosen time.',
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
                        label: 'Date',
                        value: scheduled == null
                            ? 'Select date'
                            : _formatScheduleDate(scheduled),
                        icon: Icons.calendar_today_outlined,
                        onTap: _pickScheduleDate,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: _ScheduleFieldButton(
                        label: 'Time',
                        value: scheduled == null
                            ? 'Select time'
                            : _formatScheduleTime(scheduled),
                        icon: Icons.schedule_rounded,
                        onTap: _pickScheduleTime,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  'Timezone: local device time',
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
    final tokens =
        theme.extension<AppSemanticColors>() ??
        (theme.brightness == Brightness.dark
            ? AppSemanticColors.dark
            : AppSemanticColors.light);
    return Container(
      decoration: BoxDecoration(
        color: tokens.panel,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: tokens.panelBorder),
      ),
      child: Column(
        children: [
          _ToggleRow(
            label: 'Allow comments',
            value: _allowComments,
            onChanged: (v) => setState(() => _allowComments = v),
            isTop: true,
          ),
          _ToggleRow(
            label: 'Allow download',
            value: _allowDownload,
            onChanged: (v) => setState(() => _allowDownload = v),
          ),
          _ToggleRow(
            label: 'Hide like count',
            value: _hideLikeCount,
            onChanged: (v) => setState(() => _hideLikeCount = v),
            isBottom: true,
          ),
        ],
      ),
    );
  }

  // ── Banners & submit button ───────────────────────────────────────────────

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

  Widget _buildSuccessBanner(String msg) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: const Color(0xFF052E16),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: const Color(0xFF14532D)),
      ),
      child: Row(
        children: [
          const Icon(
            Icons.check_circle_outline_rounded,
            color: Color(0xFF4ADE80),
            size: 18,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              msg,
              style: const TextStyle(color: Color(0xFF4ADE80), fontSize: 13),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSubmitButton() {
    final theme = Theme.of(context);
    final tokens =
        theme.extension<AppSemanticColors>() ??
        (theme.brightness == Brightness.dark
            ? AppSemanticColors.dark
            : AppSemanticColors.light);
    return SizedBox(
      width: double.infinity,
      child: ElevatedButton(
        onPressed: _submitting ? null : _submit,
        style: ElevatedButton.styleFrom(
          backgroundColor: tokens.primary,
          disabledBackgroundColor: tokens.primary.withValues(alpha: 0.45),
          foregroundColor: theme.colorScheme.onPrimary,
          padding: const EdgeInsets.symmetric(vertical: 15),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
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
            : Text(
                _publishMode == _PublishMode.schedule
                    ? 'Schedule post'
                    : 'Publish post',
                style: const TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                ),
              ),
      ),
    );
  }
}

// ── Search models ─────────────────────────────────────────────────────────────

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

class _MentionSuggestion {
  const _MentionSuggestion({
    required this.username,
    this.displayName,
    this.avatarUrl,
  });
  final String username;
  final String? displayName;
  final String? avatarUrl;

  static _MentionSuggestion fromJson(Map<String, dynamic> json) =>
      _MentionSuggestion(
        username: json['username'] as String? ?? '',
        displayName: json['displayName'] as String?,
        avatarUrl: json['avatarUrl'] as String?,
      );
}

// ── Sub-widgets ───────────────────────────────────────────────────────────────

class _SectionLabel extends StatelessWidget {
  const _SectionLabel({required this.text});
  final String text;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final tokens =
        theme.extension<AppSemanticColors>() ??
        (theme.brightness == Brightness.dark
            ? AppSemanticColors.dark
            : AppSemanticColors.light);

    return Text(
      text,
      style: TextStyle(
        color: tokens.textMuted,
        fontSize: 12,
        fontWeight: FontWeight.w600,
        letterSpacing: 0.5,
      ),
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
    final tokens =
        theme.extension<AppSemanticColors>() ??
        (theme.brightness == Brightness.dark
            ? AppSemanticColors.dark
            : AppSemanticColors.light);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: tokens.primary.withValues(alpha: 0.16),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: tokens.primary.withValues(alpha: 0.45)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text('#$tag', style: TextStyle(color: tokens.primary, fontSize: 12)),
          const SizedBox(width: 4),
          GestureDetector(
            onTap: onRemove,
            child: Icon(Icons.close, color: tokens.textMuted, size: 14),
          ),
        ],
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
    final tokens =
        theme.extension<AppSemanticColors>() ??
        (theme.brightness == Brightness.dark
            ? AppSemanticColors.dark
            : AppSemanticColors.light);

    return Container(
      decoration: BoxDecoration(
        border: Border(
          top: isTop ? BorderSide.none : BorderSide(color: tokens.panelBorder),
        ),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: TextStyle(color: tokens.text, fontSize: 14),
            ),
          ),
          Switch(
            value: value,
            onChanged: onChanged,
            activeThumbColor: tokens.primary,
            activeTrackColor: tokens.primary.withValues(alpha: 0.35),
            inactiveThumbColor: tokens.textMuted,
            inactiveTrackColor: tokens.panelBorder,
            materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
          ),
        ],
      ),
    );
  }
}

class _OutlineButton extends StatelessWidget {
  const _OutlineButton({
    required this.icon,
    required this.label,
    required this.onTap,
  });
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final tokens =
        theme.extension<AppSemanticColors>() ??
        (theme.brightness == Brightness.dark
            ? AppSemanticColors.dark
            : AppSemanticColors.light);

    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: tokens.panelBorder),
        ),
        child: Row(
          children: [
            Icon(icon, color: tokens.textMuted, size: 17),
            const SizedBox(width: 5),
            Text(
              label,
              style: TextStyle(color: tokens.textMuted, fontSize: 13),
            ),
          ],
        ),
      ),
    );
  }
}

class _AddMediaButton extends StatelessWidget {
  const _AddMediaButton({
    required this.icon,
    required this.label,
    required this.onTap,
  });
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final tokens =
        theme.extension<AppSemanticColors>() ??
        (theme.brightness == Brightness.dark
            ? AppSemanticColors.dark
            : AppSemanticColors.light);

    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
        decoration: BoxDecoration(
          color: tokens.panel,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: tokens.panelBorder),
        ),
        child: Row(
          children: [
            Icon(icon, color: tokens.primary, size: 16),
            const SizedBox(width: 5),
            Text(
              label,
              style: TextStyle(color: tokens.textMuted, fontSize: 12),
            ),
          ],
        ),
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
    final tokens =
        theme.extension<AppSemanticColors>() ??
        (theme.brightness == Brightness.dark
            ? AppSemanticColors.dark
            : AppSemanticColors.light);

    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: selected
              ? tokens.primary.withValues(alpha: 0.16)
              : tokens.panel,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: selected
                ? tokens.primary.withValues(alpha: 0.7)
                : tokens.panelBorder,
          ),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: TextStyle(
                      color: selected ? tokens.primary : tokens.text,
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    subtitle,
                    style: TextStyle(color: tokens.textMuted, fontSize: 12),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 10),
            Icon(
              selected
                  ? Icons.radio_button_checked_rounded
                  : Icons.radio_button_unchecked_rounded,
              color: selected
                  ? tokens.primary
                  : tokens.textMuted.withValues(alpha: 0.75),
              size: 19,
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
    final tokens =
        theme.extension<AppSemanticColors>() ??
        (theme.brightness == Brightness.dark
            ? AppSemanticColors.dark
            : AppSemanticColors.light);

    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: tokens.panel,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: tokens.panelBorder),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              style: TextStyle(
                color: tokens.textMuted,
                fontSize: 11,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 7),
            Row(
              children: [
                Icon(icon, color: tokens.primary, size: 16),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    value,
                    style: TextStyle(color: tokens.text, fontSize: 13),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
