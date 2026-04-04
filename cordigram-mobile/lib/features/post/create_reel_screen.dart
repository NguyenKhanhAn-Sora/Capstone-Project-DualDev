import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:image_picker/image_picker.dart';
import 'package:video_player/video_player.dart';
import 'create_post_service.dart';
import '../../core/services/api_service.dart';
import '../../core/services/auth_storage.dart';

// ── Constants ────────────────────────────────────────────────────────────────

const _kReelMaxDurationSec = 90;
const _kReelMaxBytes = 50 * 1024 * 1024; // 50 MB

// ── Audience enum (reused from post) ─────────────────────────────────────────

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

// ── Screen ────────────────────────────────────────────────────────────────────

class CreateReelScreen extends StatefulWidget {
  const CreateReelScreen({
    super.key,
    this.onReelCreated,
    this.showHeader = true,
  });
  final VoidCallback? onReelCreated;

  /// Set to false when embedded inside CreateTabScreen.
  final bool showHeader;

  @override
  State<CreateReelScreen> createState() => _CreateReelScreenState();
}

class _CreateReelScreenState extends State<CreateReelScreen> {
  final _captionCtrl = TextEditingController();
  final _locationCtrl = TextEditingController();
  final _hashtagCtrl = TextEditingController();
  final _scrollCtrl = ScrollController();
  final _picker = ImagePicker();

  // selected video
  File? _videoFile;
  double? _videoDurationSec;
  int? _videoBytes;
  VideoPlayerController? _previewCtrl;

  // form state
  _Audience _audience = _Audience.public;
  bool _allowComments = true;
  bool _allowDownload = false;
  bool _hideLikeCount = false;
  final List<String> _hashtags = [];

  // submit
  bool _submitting = false;
  String? _submitError;
  String? _submitSuccess;

  // location search
  List<_LocationSuggestion> _locationSugs = [];
  bool _locationLoading = false;
  bool _locationOpen = false;
  Timer? _locationDebounce;

  // mention search
  List<_MentionSuggestion> _mentionSugs = [];
  bool _mentionOpen = false;
  bool _mentionLoading = false;
  static final _mentionRegex = RegExp(r'@([a-zA-Z0-9_.]{0,30})$');

  @override
  void dispose() {
    _locationDebounce?.cancel();
    _previewCtrl?.dispose();
    _captionCtrl.dispose();
    _locationCtrl.dispose();
    _hashtagCtrl.dispose();
    _scrollCtrl.dispose();
    super.dispose();
  }

  // ── Video picking ─────────────────────────────────────────────────────────

  Future<void> _pickVideo() async {
    final picked = await _picker.pickVideo(source: ImageSource.gallery);
    if (picked == null) return;
    await _processVideo(File(picked.path));
  }

  Future<void> _pickVideoFromCamera() async {
    final picked = await _picker.pickVideo(
      source: ImageSource.camera,
      maxDuration: const Duration(seconds: _kReelMaxDurationSec),
    );
    if (picked == null) return;
    await _processVideo(File(picked.path));
  }

  Future<void> _processVideo(File file) async {
    // 1. Check file size
    final bytes = await file.length();
    if (bytes > _kReelMaxBytes) {
      _showSnack(
        'File is too large. Reels must be 50 MB or smaller (current: ${(bytes / 1024 / 1024).toStringAsFixed(1)} MB).',
      );
      return;
    }

    // 2. Get duration via VideoPlayerController
    VideoPlayerController? tempCtrl;
    double? durationSec;
    try {
      tempCtrl = VideoPlayerController.file(file);
      await tempCtrl.initialize();
      final dur = tempCtrl.value.duration;
      durationSec = dur.inMilliseconds / 1000.0;
    } catch (_) {
      // If duration can't be read, allow but skip duration validation
    } finally {
      await tempCtrl?.dispose();
    }

    if (durationSec != null && durationSec > _kReelMaxDurationSec) {
      _showSnack(
        'Video is too long. Reels must be ${_kReelMaxDurationSec}s or shorter (current: ${durationSec.toStringAsFixed(1)}s).',
      );
      return;
    }

    // 3. Build preview controller
    await _previewCtrl?.dispose();
    final ctrl = VideoPlayerController.file(file);
    await ctrl.initialize();
    await ctrl.setLooping(true);

    setState(() {
      _videoFile = file;
      _videoDurationSec = durationSec;
      _videoBytes = bytes;
      _previewCtrl = ctrl;
      _submitError = null;
      _submitSuccess = null;
    });
  }

  void _removeVideo() {
    _previewCtrl?.dispose();
    setState(() {
      _videoFile = null;
      _videoDurationSec = null;
      _videoBytes = null;
      _previewCtrl = null;
    });
  }

  // ── Caption / mention ────────────────────────────────────────────────────

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
        _mentionSugs = [];
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
        _mentionSugs = items;
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
      _mentionSugs = [];
    });
  }

  // ── Location ─────────────────────────────────────────────────────────────

  void _onLocationChanged(String query) {
    _locationDebounce?.cancel();
    if (query.trim().isEmpty) {
      setState(() {
        _locationSugs = [];
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
      final sugs = items.whereType<Map<String, dynamic>>().map((item) {
        return _LocationSuggestion(
          label: _cleanLocation(item['display_name'] as String? ?? ''),
          lat: item['lat'] as String? ?? '',
          lon: item['lon'] as String? ?? '',
        );
      }).toList();
      setState(() {
        _locationSugs = sugs;
        _locationOpen = sugs.isNotEmpty;
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
      _locationSugs = [];
      _locationOpen = false;
    });
  }

  // ── Hashtags ─────────────────────────────────────────────────────────────

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

  // ── Submit ────────────────────────────────────────────────────────────────

  Future<void> _submit() async {
    if (_videoFile == null) {
      setState(() => _submitError = 'Please select a video before publishing.');
      return;
    }

    // Final duration guard
    if (_videoDurationSec != null &&
        _videoDurationSec! > _kReelMaxDurationSec) {
      setState(
        () => _submitError =
            'Video exceeds ${_kReelMaxDurationSec}s. Please trim it.',
      );
      return;
    }

    setState(() {
      _submitting = true;
      _submitError = null;
      _submitSuccess = null;
    });

    try {
      final upload = await CreatePostService.uploadMedia(_videoFile!);

      // Prefer duration from upload; fall back to local measurement
      double? finalDuration = upload.duration ?? _videoDurationSec;

      // Post-upload duration validation
      if (finalDuration != null && finalDuration > _kReelMaxDurationSec) {
        setState(() {
          _submitError =
              'Video exceeds ${_kReelMaxDurationSec}s. Please trim it.';
          _submitting = false;
        });
        return;
      }

      if (finalDuration == null) {
        setState(() {
          _submitError = 'Missing video duration. Please re-upload your reel.';
          _submitting = false;
        });
        return;
      }

      final mentionMatches = RegExp(
        r'@([a-zA-Z0-9_.]{1,30})',
      ).allMatches(_captionCtrl.text);
      final mentions = mentionMatches.map((m) => m.group(1)!).toSet().toList();

      final mediaPayload = <String, dynamic>{
        'type': 'video',
        'url': upload.url,
        'metadata': {
          'publicId': upload.publicId,
          if (upload.resourceType != null) 'resourceType': upload.resourceType,
          if (upload.format != null) 'format': upload.format,
          if (upload.width != null) 'width': upload.width,
          if (upload.height != null) 'height': upload.height,
          if (upload.bytes != null) 'bytes': upload.bytes,
          'duration': (finalDuration * 100).round() / 100,
          if (upload.folder != null) 'folder': upload.folder,
          if (upload.moderationDecision != null)
            'moderationDecision': upload.moderationDecision,
          if (upload.moderationProvider != null)
            'moderationProvider': upload.moderationProvider,
        },
      };

      await CreatePostService.createReel(
        caption: _captionCtrl.text,
        location: _locationCtrl.text,
        audience: _audience.value,
        allowComments: _allowComments,
        allowDownload: _allowDownload,
        hideLikeCount: _hideLikeCount,
        hashtags: List<String>.from(_hashtags),
        mentions: mentions,
        media: mediaPayload,
        durationSeconds: finalDuration,
      );

      if (!mounted) return;
      setState(() {
        _submitSuccess = 'Reel created successfully!';
        _submitting = false;
      });
      _reset();
      widget.onReelCreated?.call();
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

  void _reset() {
    _captionCtrl.clear();
    _locationCtrl.clear();
    _hashtagCtrl.clear();
    _previewCtrl?.dispose();
    setState(() {
      _videoFile = null;
      _videoDurationSec = null;
      _videoBytes = null;
      _previewCtrl = null;
      _hashtags.clear();
      _audience = _Audience.public;
      _allowComments = true;
      _allowDownload = false;
      _hideLikeCount = false;
      _locationSugs = [];
      _locationOpen = false;
      _mentionSugs = [];
      _mentionOpen = false;
    });
  }

  void _showSnack(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  // ── Build ─────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => FocusScope.of(context).unfocus(),
      child: Scaffold(
        backgroundColor: const Color(0xFF0B1020),
        body: SafeArea(
          child: SingleChildScrollView(
            controller: _scrollCtrl,
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _buildConstraintsBanner(),
                const SizedBox(height: 16),
                _buildVideoSection(),
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
                _buildToggles(),
                const SizedBox(height: 24),
                if (_submitError != null) _buildErrorBanner(_submitError!),
                if (_submitSuccess != null)
                  _buildSuccessBanner(_submitSuccess!),
                const SizedBox(height: 8),
                _buildSubmitButton(),
              ],
            ),
          ),
        ),
      ),
    );
  }

  // ── Constraints banner ────────────────────────────────────────────────────

  Widget _buildConstraintsBanner() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: const Color(0xFF0D1A30),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: const Color(0xFF1E3A5C)),
      ),
      child: Row(
        children: [
          const Icon(
            Icons.info_outline_rounded,
            color: Color(0xFF4AA3E4),
            size: 16,
          ),
          const SizedBox(width: 10),
          const Expanded(
            child: Text(
              'Video only · max 90 s · max 50 MB',
              style: TextStyle(color: Color(0xFF7A9EC8), fontSize: 12),
            ),
          ),
        ],
      ),
    );
  }

  // ── Video section ─────────────────────────────────────────────────────────

  Widget _buildVideoSection() {
    if (_videoFile == null) return _buildVideoPicker();
    return _buildVideoPreview();
  }

  Widget _buildVideoPicker() {
    return GestureDetector(
      onTap: _pickVideo,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(vertical: 40),
        decoration: BoxDecoration(
          color: const Color(0xFF111827),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: const Color(0xFF2A3A5C), width: 1.5),
        ),
        child: Column(
          children: [
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: const Color(0xFF1A2540),
                borderRadius: BorderRadius.circular(50),
              ),
              child: const Icon(
                Icons.videocam_outlined,
                color: Color(0xFF4AA3E4),
                size: 38,
              ),
            ),
            const SizedBox(height: 14),
            const Text(
              'Select a reel video',
              style: TextStyle(
                color: Color(0xFFE8ECF8),
                fontSize: 16,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 6),
            const Text(
              'MP4 / MOV / WEBM  ·  up to 90 s  ·  up to 50 MB',
              style: TextStyle(color: Color(0xFF7A8BB0), fontSize: 12),
            ),
            const SizedBox(height: 20),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                _OutlineBtn(
                  icon: Icons.video_library_outlined,
                  label: 'Gallery',
                  onTap: _pickVideo,
                ),
                const SizedBox(width: 8),
                _OutlineBtn(
                  icon: Icons.videocam_outlined,
                  label: 'Camera',
                  onTap: _pickVideoFromCamera,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildVideoPreview() {
    final ctrl = _previewCtrl;
    final durationLabel = _videoDurationSec != null
        ? '${_videoDurationSec!.toStringAsFixed(1)} s'
        : '—';
    final sizeLabel = _videoBytes != null
        ? '${(_videoBytes! / 1024 / 1024).toStringAsFixed(1)} MB'
        : '—';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _SectionLabel(text: 'Video'),
        const SizedBox(height: 8),
        Stack(
          children: [
            Container(
              decoration: BoxDecoration(
                color: const Color(0xFF0A0E1A),
                borderRadius: BorderRadius.circular(12),
              ),
              clipBehavior: Clip.antiAlias,
              child: AspectRatio(
                aspectRatio: 9 / 16,
                child: ctrl != null && ctrl.value.isInitialized
                    ? VideoPlayer(ctrl)
                    : const Center(
                        child: CircularProgressIndicator(
                          color: Color(0xFF4AA3E4),
                        ),
                      ),
              ),
            ),
            // Play/pause overlay
            Positioned.fill(
              child: GestureDetector(
                onTap: () {
                  if (ctrl == null) return;
                  setState(() {
                    ctrl.value.isPlaying ? ctrl.pause() : ctrl.play();
                  });
                },
                child: Container(color: Colors.transparent),
              ),
            ),
            // Play icon hint
            if (ctrl != null && !ctrl.value.isPlaying)
              const Positioned.fill(
                child: Center(
                  child: Icon(
                    Icons.play_circle_outline_rounded,
                    color: Colors.white70,
                    size: 56,
                  ),
                ),
              ),
            // remove button
            Positioned(
              top: 8,
              right: 8,
              child: GestureDetector(
                onTap: _removeVideo,
                child: Container(
                  padding: const EdgeInsets.all(5),
                  decoration: const BoxDecoration(
                    color: Color(0xCC000000),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Icons.close, color: Colors.white, size: 16),
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        // Meta row
        Row(
          children: [
            _MetaBadge(
              icon: Icons.schedule_rounded,
              label: durationLabel,
              warning:
                  _videoDurationSec != null &&
                  _videoDurationSec! > _kReelMaxDurationSec,
            ),
            const SizedBox(width: 8),
            _MetaBadge(
              icon: Icons.sd_storage_outlined,
              label: sizeLabel,
              warning: _videoBytes != null && _videoBytes! > _kReelMaxBytes,
            ),
            const Spacer(),
            TextButton.icon(
              onPressed: _pickVideo,
              icon: const Icon(
                Icons.swap_horiz_rounded,
                size: 16,
                color: Color(0xFF4AA3E4),
              ),
              label: const Text(
                'Change',
                style: TextStyle(color: Color(0xFF4AA3E4), fontSize: 13),
              ),
              style: TextButton.styleFrom(
                minimumSize: Size.zero,
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
            ),
          ],
        ),
      ],
    );
  }

  // ── Caption ───────────────────────────────────────────────────────────────

  Widget _buildCaptionField() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _SectionLabel(text: 'Caption'),
        const SizedBox(height: 8),
        Container(
          decoration: BoxDecoration(
            color: const Color(0xFF111827),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: const Color(0xFF2A3A5C)),
          ),
          child: TextField(
            controller: _captionCtrl,
            onChanged: _onCaptionChanged,
            maxLines: 4,
            minLines: 2,
            maxLength: 2200,
            style: const TextStyle(color: Color(0xFFD0D8EE), fontSize: 14),
            decoration: const InputDecoration(
              hintText: 'Write a caption…',
              hintStyle: TextStyle(color: Color(0xFF475569)),
              border: InputBorder.none,
              contentPadding: EdgeInsets.all(14),
              counterStyle: TextStyle(color: Color(0xFF5A6B8A), fontSize: 11),
            ),
          ),
        ),
      ],
    );
  }

  // ── Mention dropdown ──────────────────────────────────────────────────────

  Widget _buildMentionDropdown() {
    return Container(
      margin: const EdgeInsets.only(top: 4),
      decoration: BoxDecoration(
        color: const Color(0xFF1A2540),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: const Color(0xFF2A3A5C)),
      ),
      child: _mentionLoading
          ? const Padding(
              padding: EdgeInsets.all(12),
              child: Center(
                child: SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: Color(0xFF4AA3E4),
                  ),
                ),
              ),
            )
          : ListView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: _mentionSugs.length,
              itemBuilder: (_, i) {
                final s = _mentionSugs[i];
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
                          backgroundColor: const Color(0xFF233050),
                          backgroundImage: s.avatarUrl != null
                              ? NetworkImage(s.avatarUrl!)
                              : null,
                          child: s.avatarUrl == null
                              ? Text(
                                  s.username.substring(0, 1).toUpperCase(),
                                  style: const TextStyle(
                                    color: Colors.white,
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
                                style: const TextStyle(
                                  color: Color(0xFFE8ECF8),
                                  fontSize: 13,
                                ),
                              ),
                            Text(
                              '@${s.username}',
                              style: const TextStyle(
                                color: Color(0xFF7A8BB0),
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
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _SectionLabel(text: 'Location'),
        const SizedBox(height: 8),
        Container(
          decoration: BoxDecoration(
            color: const Color(0xFF111827),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: const Color(0xFF2A3A5C)),
          ),
          child: TextField(
            controller: _locationCtrl,
            onChanged: _onLocationChanged,
            style: const TextStyle(color: Color(0xFFD0D8EE), fontSize: 14),
            decoration: InputDecoration(
              hintText: 'Add a location…',
              hintStyle: const TextStyle(color: Color(0xFF475569)),
              border: InputBorder.none,
              contentPadding: const EdgeInsets.symmetric(
                horizontal: 14,
                vertical: 13,
              ),
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
                          _locationSugs = [];
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
    return Container(
      margin: const EdgeInsets.only(top: 4),
      decoration: BoxDecoration(
        color: const Color(0xFF1A2540),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: const Color(0xFF2A3A5C)),
      ),
      child: ListView.builder(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        itemCount: _locationSugs.length,
        itemBuilder: (_, i) {
          final s = _locationSugs[i];
          return InkWell(
            onTap: () => _selectLocation(s),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
              child: Row(
                children: [
                  const Icon(
                    Icons.place_outlined,
                    color: Color(0xFF9BAECF),
                    size: 16,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      s.label,
                      style: const TextStyle(
                        color: Color(0xFFD0D8EE),
                        fontSize: 13,
                      ),
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
                  color: const Color(0xFF111827),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: const Color(0xFF2A3A5C)),
                ),
                child: TextField(
                  controller: _hashtagCtrl,
                  onSubmitted: (_) => _addHashtag(),
                  textInputAction: TextInputAction.done,
                  style: const TextStyle(
                    color: Color(0xFFD0D8EE),
                    fontSize: 14,
                  ),
                  decoration: const InputDecoration(
                    hintText: 'e.g. travel, photography',
                    hintStyle: TextStyle(color: Color(0xFF475569)),
                    border: InputBorder.none,
                    prefixText: '# ',
                    prefixStyle: TextStyle(
                      color: Color(0xFF4AA3E4),
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
                  color: const Color(0xFF1A2540),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: const Color(0xFF2A3A5C)),
                ),
                child: const Icon(
                  Icons.add_rounded,
                  color: Color(0xFF4AA3E4),
                  size: 20,
                ),
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
                    (tag) => _HashChip(
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
                    ? const Color(0xFF1A3254)
                    : const Color(0xFF111827),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: _audience == a
                      ? const Color(0xFF3470A2)
                      : const Color(0xFF2A3A5C),
                ),
              ),
              child: Row(
                children: [
                  Icon(
                    a.icon,
                    color: _audience == a
                        ? const Color(0xFF4AA3E4)
                        : const Color(0xFF7A8BB0),
                    size: 20,
                  ),
                  const SizedBox(width: 12),
                  Text(
                    a.label,
                    style: TextStyle(
                      color: _audience == a
                          ? const Color(0xFFE8ECF8)
                          : const Color(0xFF9BAECF),
                      fontSize: 14,
                      fontWeight: _audience == a
                          ? FontWeight.w600
                          : FontWeight.w400,
                    ),
                  ),
                  const Spacer(),
                  if (_audience == a)
                    const Icon(
                      Icons.check_circle_rounded,
                      color: Color(0xFF4AA3E4),
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

  // ── Toggles ───────────────────────────────────────────────────────────────

  Widget _buildToggles() {
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF111827),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFF2A3A5C)),
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

  // ── Banners ───────────────────────────────────────────────────────────────

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
    return SizedBox(
      width: double.infinity,
      child: ElevatedButton(
        onPressed: _submitting ? null : _submit,
        style: ElevatedButton.styleFrom(
          backgroundColor: const Color(0xFF3470A2),
          disabledBackgroundColor: const Color(0xFF1E3A5F),
          foregroundColor: Colors.white,
          padding: const EdgeInsets.symmetric(vertical: 15),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
        child: _submitting
            ? const SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: Colors.white,
                ),
              )
            : const Text(
                'Publish reel',
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
              ),
      ),
    );
  }
}

// ── Helpers / models ──────────────────────────────────────────────────────────

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

class _SectionLabel extends StatelessWidget {
  const _SectionLabel({required this.text});
  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: const TextStyle(
        color: Color(0xFF9BAECF),
        fontSize: 12,
        fontWeight: FontWeight.w600,
        letterSpacing: 0.5,
      ),
    );
  }
}

class _MetaBadge extends StatelessWidget {
  const _MetaBadge({
    required this.icon,
    required this.label,
    this.warning = false,
  });
  final IconData icon;
  final String label;
  final bool warning;

  @override
  Widget build(BuildContext context) {
    final color = warning ? const Color(0xFFF87171) : const Color(0xFF7A8BB0);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, color: color, size: 13),
        const SizedBox(width: 4),
        Text(label, style: TextStyle(color: color, fontSize: 12)),
      ],
    );
  }
}

class _HashChip extends StatelessWidget {
  const _HashChip({required this.tag, required this.onRemove});
  final String tag;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: const Color(0xFF1A3254),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: const Color(0xFF2A4A7A)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            '#$tag',
            style: const TextStyle(color: Color(0xFF4AA3E4), fontSize: 12),
          ),
          const SizedBox(width: 4),
          GestureDetector(
            onTap: onRemove,
            child: const Icon(Icons.close, color: Color(0xFF7A8BB0), size: 14),
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
    return Container(
      decoration: BoxDecoration(
        border: Border(
          top: isTop
              ? BorderSide.none
              : const BorderSide(color: Color(0xFF1E2D48)),
        ),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: const TextStyle(color: Color(0xFFD0D8EE), fontSize: 14),
            ),
          ),
          Switch(
            value: value,
            onChanged: onChanged,
            activeThumbColor: const Color(0xFF4AA3E4),
            activeTrackColor: const Color(0xFF1A3254),
            inactiveThumbColor: const Color(0xFF5A6B8A),
            inactiveTrackColor: const Color(0xFF1E2D48),
            materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
          ),
        ],
      ),
    );
  }
}

class _OutlineBtn extends StatelessWidget {
  const _OutlineBtn({
    required this.icon,
    required this.label,
    required this.onTap,
  });
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: const Color(0xFF2A3A5C)),
        ),
        child: Row(
          children: [
            Icon(icon, color: const Color(0xFF9BAECF), size: 17),
            const SizedBox(width: 5),
            Text(
              label,
              style: const TextStyle(color: Color(0xFF9BAECF), fontSize: 13),
            ),
          ],
        ),
      ),
    );
  }
}
