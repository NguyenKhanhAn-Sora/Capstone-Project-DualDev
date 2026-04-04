import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:image_picker/image_picker.dart';
import 'create_post_service.dart';
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
  bool _allowComments = true;
  bool _allowDownload = false;
  bool _hideLikeCount = false;
  final List<String> _hashtags = [];

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
      );

      if (!mounted) return;
      setState(() {
        _submitSuccess = 'Post created successfully!';
        _submitting = false;
      });
      _reset();
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

  void _reset() {
    _captionCtrl.clear();
    _locationCtrl.clear();
    _hashtagCtrl.clear();
    setState(() {
      _media.clear();
      _hashtags.clear();
      _audience = _Audience.public;
      _allowComments = true;
      _allowDownload = false;
      _hideLikeCount = false;
      _locationSuggestions = [];
      _locationOpen = false;
      _mentionSuggestions = [];
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
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        color: const Color(0xFF0D1526),
        border: Border(
          bottom: BorderSide(
            color: Colors.white.withValues(alpha: 0.07),
            width: 1,
          ),
        ),
      ),
      child: Row(
        children: [
          const Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Create post',
                  style: TextStyle(
                    color: Color(0xFFE8ECF8),
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                SizedBox(height: 2),
                Text(
                  'Share genuine moments',
                  style: TextStyle(color: Color(0xFF7A8BB0), fontSize: 13),
                ),
              ],
            ),
          ),
          if (_submitting)
            const SizedBox(
              width: 22,
              height: 22,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                color: Color(0xFF4AA3E4),
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
    return GestureDetector(
      onTap: () => _showMediaPicker(),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(vertical: 36),
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
                Icons.add_photo_alternate_outlined,
                color: Color(0xFF4AA3E4),
                size: 36,
              ),
            ),
            const SizedBox(height: 14),
            const Text(
              'Add a photo or video',
              style: TextStyle(
                color: Color(0xFFE8ECF8),
                fontSize: 16,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 6),
            const Text(
              'Supports .jpg, .png, .mp4, .mov · up to 10 files',
              style: TextStyle(color: Color(0xFF7A8BB0), fontSize: 13),
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
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: const Color(0xFF141D30),
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
                color: Colors.white.withValues(alpha: 0.18),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            ListTile(
              leading: const Icon(
                Icons.photo_library_outlined,
                color: Color(0xFF9BAECF),
              ),
              title: const Text(
                'Choose photos',
                style: TextStyle(color: Color(0xFFD0D8EE)),
              ),
              onTap: () {
                Navigator.pop(context);
                _pickImages();
              },
            ),
            ListTile(
              leading: const Icon(
                Icons.videocam_outlined,
                color: Color(0xFF9BAECF),
              ),
              title: const Text(
                'Choose video',
                style: TextStyle(color: Color(0xFFD0D8EE)),
              ),
              onTap: () {
                Navigator.pop(context);
                _pickVideo();
              },
            ),
            ListTile(
              leading: const Icon(
                Icons.camera_alt_outlined,
                color: Color(0xFF9BAECF),
              ),
              title: const Text(
                'Take photo',
                style: TextStyle(color: Color(0xFFD0D8EE)),
              ),
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
                        color: const Color(0xFF1A2540),
                        child: const Icon(
                          Icons.videocam_rounded,
                          color: Color(0xFF4AA3E4),
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
            focusNode: _captionFocus,
            onChanged: _onCaptionChanged,
            maxLines: 5,
            minLines: 3,
            maxLength: 2200,
            style: const TextStyle(color: Color(0xFFD0D8EE), fontSize: 14),
            decoration: InputDecoration(
              hintText: 'Write a caption…',
              hintStyle: const TextStyle(color: Color(0xFF475569)),
              border: InputBorder.none,
              contentPadding: const EdgeInsets.all(14),
              counterStyle: const TextStyle(
                color: Color(0xFF5A6B8A),
                fontSize: 11,
              ),
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
        itemCount: _locationSuggestions.length,
        itemBuilder: (_, i) {
          final s = _locationSuggestions[i];
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
                'Publish post',
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
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

class _HashtagChip extends StatelessWidget {
  const _HashtagChip({required this.tag, required this.onRemove});
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
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
        decoration: BoxDecoration(
          color: const Color(0xFF1A2540),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: const Color(0xFF2A3A5C)),
        ),
        child: Row(
          children: [
            Icon(icon, color: const Color(0xFF4AA3E4), size: 16),
            const SizedBox(width: 5),
            Text(
              label,
              style: const TextStyle(color: Color(0xFF9BAECF), fontSize: 12),
            ),
          ],
        ),
      ),
    );
  }
}
