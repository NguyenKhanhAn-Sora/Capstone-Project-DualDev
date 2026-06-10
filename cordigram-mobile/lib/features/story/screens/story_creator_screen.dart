import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';
import 'package:video_player/video_player.dart';
import '../../../core/services/language_controller.dart';
import '../models/story_models.dart';
import '../services/story_service.dart';

// ── Visibility option ─────────────────────────────────────────────────────────

enum _Vis { followers, public, private }

extension _VisExt on _Vis {
  String get key => name; // 'followers' | 'public' | 'private'
  IconData get icon {
    switch (this) {
      case _Vis.followers:
        return Icons.people_outline_rounded;
      case _Vis.public:
        return Icons.public_rounded;
      case _Vis.private:
        return Icons.lock_outline_rounded;
    }
  }

  String label(String Function(String) t) {
    switch (this) {
      case _Vis.followers:
        return t('story.optFollowers');
      case _Vis.public:
        return t('story.optPublic');
      case _Vis.private:
        return t('story.optPrivate');
    }
  }
}

// ── Main screen ───────────────────────────────────────────────────────────────

class StoryCreatorScreen extends StatefulWidget {
  const StoryCreatorScreen({super.key});

  @override
  State<StoryCreatorScreen> createState() => _StoryCreatorScreenState();
}

class _StoryCreatorScreenState extends State<StoryCreatorScreen>
    with TickerProviderStateMixin {
  // Steps: 'select' → 'editor' → (done)
  String _step = 'select';
  String _mediaStep = 'preview'; // 'preview' | 'trim'

  // Media
  File? _mediaFile;
  String? _mediaType; // 'image' | 'video'
  int? _mediaDurationMs;
  int? _trimStartMs;
  int? _trimEndMs;

  // Text story
  final TextEditingController _textCtrl = TextEditingController();
  String _bgStyle = kStoryBgOptions[1];

  // Options
  _Vis _vis = _Vis.followers;
  bool _uploading = false;
  double _uploadProgress = 0;
  String? _error;

  // Video player (for preview)
  VideoPlayerController? _videoCtrl;
  bool _videoReady = false;

  // Tab: 0 = media, 1 = text
  late final TabController _tabCtrl;

  // Trim state
  double _trimStart = 0.0; // 0–1 fraction
  double _trimEnd = 1.0;

  @override
  void initState() {
    super.initState();
    _tabCtrl = TabController(length: 2, vsync: this);
    _tabCtrl.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _tabCtrl.dispose();
    _textCtrl.dispose();
    _videoCtrl?.dispose();
    super.dispose();
  }

  bool get _isText => _tabCtrl.index == 1;

  // ── Pick media ────────────────────────────────────────────────────────────

  Future<void> _pickImage() async {
    final picker = ImagePicker();
    final result = await picker.pickImage(source: ImageSource.gallery);
    if (result == null) return;
    _setMedia(File(result.path), 'image');
  }

  Future<void> _pickVideo() async {
    final picker = ImagePicker();
    final result = await picker.pickVideo(source: ImageSource.gallery);
    if (result == null) return;
    _setMedia(File(result.path), 'video');
  }

  Future<void> _setMedia(File file, String type) async {
    _videoCtrl?.dispose();
    _videoCtrl = null;
    _videoReady = false;
    _mediaFile = file;
    _mediaType = type;
    _trimStart = 0;
    _trimEnd = 1;
    _mediaDurationMs = null;
    _trimStartMs = null;
    _trimEndMs = null;
    setState(() => _step = 'editor');

    if (type == 'video') {
      final ctrl = VideoPlayerController.file(file);
      await ctrl.initialize();
      if (!mounted) {
        ctrl.dispose();
        return;
      }
      _videoCtrl = ctrl;
      _videoReady = true;
      _mediaDurationMs = ctrl.value.duration.inMilliseconds;
      await ctrl.setLooping(true);
      await ctrl.play();
      setState(() {});
    }
  }

  // ── Trim helpers ──────────────────────────────────────────────────────────

  void _applyTrim(double start, double end) {
    setState(() {
      _trimStart = start;
      _trimEnd = end;
      final ms = _mediaDurationMs ?? 0;
      _trimStartMs = (start * ms).round();
      _trimEndMs = (end * ms).round();
    });
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  Future<void> _submit() async {
    setState(() {
      _error = null;
      _uploading = true;
      _uploadProgress = 0;
    });

    try {
      Map<String, dynamic> body;

      if (_isText) {
        final text = _textCtrl.text.trim();
        if (text.isEmpty) {
          setState(() {
            _error = LanguageController.instance.t('story.errTextRequired');
            _uploading = false;
          });
          return;
        }
        body = {
          'type': 'text',
          'textContent': text,
          'backgroundStyle': _bgStyle,
          'visibility': _vis.key,
        };
      } else {
        if (_mediaFile == null) {
          setState(() {
            _error = LanguageController.instance.t('story.errMediaRequired');
            _uploading = false;
          });
          return;
        }
        // Upload file
        setState(() => _uploadProgress = 10);
        final uploadResult = await StoryService.uploadMedia(_mediaFile!);
        setState(() => _uploadProgress = 70);

        final url = uploadResult['url'] as String? ?? '';
        final type = uploadResult['type'] as String? ?? _mediaType ?? 'image';
        final dur = (uploadResult['mediaDurationMs'] as num?)?.toInt() ??
            _mediaDurationMs;

        body = {
          'type': 'media',
          'mediaType': type,
          'mediaUrl': url,
          if (dur != null) 'mediaDurationMs': dur,
          if (_trimStartMs != null) 'trimStartMs': _trimStartMs,
          if (_trimEndMs != null) 'trimEndMs': _trimEndMs,
          'visibility': _vis.key,
        };
      }

      setState(() => _uploadProgress = 85);
      await StoryService.createStory(body);
      setState(() => _uploadProgress = 100);

      await Future.delayed(const Duration(milliseconds: 300));
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = LanguageController.instance.t('story.errUploadFailed');
          _uploading = false;
          _uploadProgress = 0;
        });
      }
    }
  }

  // ── Discard dialog ────────────────────────────────────────────────────────

  Future<bool> _confirmDiscard() async {
    if (_step == 'select' && _mediaFile == null && _textCtrl.text.isEmpty) {
      return true;
    }
    final t = LanguageController.instance.t;
    final result = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: const Color(0xFF1A2435),
        shape:
            RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Text(t('story.discardTitle'),
            style: const TextStyle(color: Colors.white)),
        content: Text(t('story.discardBody'),
            style: const TextStyle(color: Color(0xFF7A8BB0))),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(t('story.discardCancel'),
                style: const TextStyle(color: Color(0xFF4AA3E4))),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: Text(t('story.discardConfirm'),
                style: const TextStyle(color: Colors.redAccent)),
          ),
        ],
      ),
    );
    return result ?? false;
  }

  // ── Build ─────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    SystemChrome.setSystemUIOverlayStyle(SystemUiOverlayStyle.dark);
    final t = LanguageController.instance.t;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final bg = isDark ? const Color(0xFF0B1120) : const Color(0xFFF5F7FB);

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        if (_uploading) return;
        final nav = Navigator.of(context);
        if (await _confirmDiscard()) {
          if (mounted) nav.pop();
        }
      },
      child: Scaffold(
        backgroundColor: bg,
        body: SafeArea(
          child: _step == 'select'
              ? _buildSelectScreen(t, isDark)
              : _buildEditorScreen(t, isDark),
        ),
      ),
    );
  }

  // ── Select screen ─────────────────────────────────────────────────────────

  Widget _buildSelectScreen(
      String Function(String, [Map<String, dynamic>?]) t, bool isDark) {
    return Column(
      children: [
        // Header
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
          child: Row(
            children: [
              GestureDetector(
                onTap: () => Navigator.of(context).pop(),
                child: Container(
                  width: 38,
                  height: 38,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: isDark
                        ? const Color(0xFF1E2D48)
                        : const Color(0xFFE3EAF5),
                  ),
                  child: Icon(Icons.close_rounded,
                      color: isDark
                          ? const Color(0xFFE8ECF8)
                          : const Color(0xFF0F1629),
                      size: 20),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      t('story.createStoryTitle'),
                      style: TextStyle(
                        color: isDark
                            ? const Color(0xFFE8ECF8)
                            : const Color(0xFF0F1629),
                        fontWeight: FontWeight.w700,
                        fontSize: 18,
                      ),
                    ),
                    Text(
                      t('story.createStorySub'),
                      style: const TextStyle(
                          color: Color(0xFF7A8BB0), fontSize: 13),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 24),

        // Format cards
        Expanded(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Column(
              children: [
                // Media card
                Expanded(
                  child: _FormatCard(
                    gradient: const LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [Color(0xFF4361EE), Color(0xFF7B2FF7)],
                    ),
                    icon: Icons.photo_library_outlined,
                    label: t('story.tabMedia'),
                    sub: t('story.dropHint'),
                    onTap: () => _showMediaPicker(isDark),
                    isDark: isDark,
                  ),
                ),
                const SizedBox(height: 12),
                // Text card
                Expanded(
                  child: _FormatCard(
                    gradient: const LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [Color(0xFFF953C6), Color(0xFFFF6B35)],
                    ),
                    icon: Icons.title_rounded,
                    label: t('story.tabText'),
                    sub: t('story.placeholderText'),
                    onTap: () {
                      _tabCtrl.index = 1;
                      setState(() => _step = 'editor');
                    },
                    isDark: isDark,
                  ),
                ),
                const SizedBox(height: 16),
              ],
            ),
          ),
        ),
      ],
    );
  }

  void _showMediaPicker(bool isDark) {
    final t = LanguageController.instance.t;
    showModalBottomSheet(
      context: context,
      backgroundColor:
          isDark ? const Color(0xFF1A2435) : Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 6),
            Container(
              width: 36, height: 4,
              decoration: BoxDecoration(
                  color: Colors.white24,
                  borderRadius: BorderRadius.circular(2)),
            ),
            const SizedBox(height: 12),
            ListTile(
              leading: Container(
                width: 40, height: 40,
                decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(10),
                    color: const Color(0xFF4AA3E4).withValues(alpha: 0.15)),
                child: const Icon(Icons.image_outlined,
                    color: Color(0xFF4AA3E4)),
              ),
              title: Text(t('story.btnChangePhoto'),
                  style: TextStyle(
                      color: isDark
                          ? Colors.white
                          : const Color(0xFF0F1629),
                      fontWeight: FontWeight.w600)),
              onTap: () {
                Navigator.pop(context);
                _pickImage();
              },
            ),
            ListTile(
              leading: Container(
                width: 40, height: 40,
                decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(10),
                    color: const Color(0xFF7C3AED).withValues(alpha: 0.15)),
                child: const Icon(Icons.videocam_outlined,
                    color: Color(0xFF7C3AED)),
              ),
              title: Text(t('story.btnChangeVideo'),
                  style: TextStyle(
                      color: isDark
                          ? Colors.white
                          : const Color(0xFF0F1629),
                      fontWeight: FontWeight.w600)),
              onTap: () {
                Navigator.pop(context);
                _pickVideo();
              },
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  // ── Editor screen ─────────────────────────────────────────────────────────

  Widget _buildEditorScreen(
      String Function(String, [Map<String, dynamic>?]) t, bool isDark) {
    return Column(
      children: [
        // Top bar
        _buildEditorTopBar(t, isDark),
        // Story preview
        Expanded(child: _buildPreview(t, isDark)),
        // Options panel
        _buildOptionsPanel(t, isDark),
      ],
    );
  }

  Widget _buildEditorTopBar(
      String Function(String, [Map<String, dynamic>?]) t, bool isDark) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      decoration: BoxDecoration(
        border: Border(
          bottom: BorderSide(
            color: isDark
                ? const Color(0xFF1E2D48)
                : const Color(0xFFE3EAF5),
            width: 0.5,
          ),
        ),
      ),
      child: Row(
        children: [
          // Back button
          GestureDetector(
            onTap: () async {
              if (await _confirmDiscard()) {
                if (mounted) setState(() => _step = 'select');
              }
            },
            child: Container(
              width: 36, height: 36,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: isDark
                    ? const Color(0xFF1E2D48)
                    : const Color(0xFFE3EAF5),
              ),
              child: Icon(Icons.arrow_back_rounded,
                  color: isDark
                      ? const Color(0xFFE8ECF8)
                      : const Color(0xFF0F1629),
                  size: 18),
            ),
          ),
          const SizedBox(width: 12),
          // Tabs
          Expanded(
            child: Container(
              height: 36,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(18),
                color: isDark
                    ? const Color(0xFF1E2D48)
                    : const Color(0xFFE3EAF5),
              ),
              child: TabBar(
                controller: _tabCtrl,
                indicator: BoxDecoration(
                  borderRadius: BorderRadius.circular(18),
                  gradient: const LinearGradient(
                    colors: [Color(0xFF4AA3E4), Color(0xFF7C3AED)],
                  ),
                ),
                indicatorSize: TabBarIndicatorSize.tab,
                dividerColor: Colors.transparent,
                labelColor: Colors.white,
                unselectedLabelColor: const Color(0xFF7A8BB0),
                labelStyle: const TextStyle(
                    fontWeight: FontWeight.w600, fontSize: 13),
                tabs: [
                  Tab(text: t('story.tabMedia')),
                  Tab(text: t('story.tabText')),
                ],
              ),
            ),
          ),
          const SizedBox(width: 12),
          // Share button
          GestureDetector(
            onTap: _uploading ? null : _submit,
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              padding: const EdgeInsets.symmetric(
                  horizontal: 16, vertical: 8),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(20),
                gradient: _uploading
                    ? null
                    : const LinearGradient(
                        colors: [Color(0xFF4AA3E4), Color(0xFF7C3AED)],
                      ),
                color: _uploading ? const Color(0xFF253347) : null,
              ),
              child: _uploading
                  ? const SizedBox(
                      width: 16, height: 16,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white),
                    )
                  : Text(
                      t('story.btnPost'),
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                        fontSize: 13,
                      ),
                    ),
            ),
          ),
        ],
      ),
    );
  }

  // ── Preview area ──────────────────────────────────────────────────────────

  Widget _buildPreview(
      String Function(String, [Map<String, dynamic>?]) t, bool isDark) {
    return Container(
      color: Colors.black,
      child: _isText
          ? _buildTextPreview(t)
          : _buildMediaPreview(t, isDark),
    );
  }

  Widget _buildTextPreview(
      String Function(String, [Map<String, dynamic>?]) t) {
    return Container(
      decoration: BoxDecoration(
        gradient: parseBackgroundGradient(_bgStyle),
      ),
      child: Stack(
        children: [
          Positioned.fill(
            child: GestureDetector(
              onTap: () => FocusScope.of(context).requestFocus(_textFocus),
              child: Center(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 32),
                  child: TextField(
                    controller: _textCtrl,
                    focusNode: _textFocus,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 26,
                      fontWeight: FontWeight.w700,
                      height: 1.35,
                    ),
                    textAlign: TextAlign.center,
                    maxLines: null,
                    decoration: InputDecoration(
                      border: InputBorder.none,
                      hintText: t('story.placeholderText'),
                      hintStyle: const TextStyle(
                          color: Colors.white54,
                          fontSize: 26,
                          fontWeight: FontWeight.w400),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  final FocusNode _textFocus = FocusNode();

  Widget _buildMediaPreview(
      String Function(String, [Map<String, dynamic>?]) t, bool isDark) {
    if (_mediaFile == null) {
      return _buildMediaPicker(t, isDark);
    }
    if (_mediaType == 'video') {
      return _buildVideoPreview(t, isDark);
    }
    return _buildImagePreview(t);
  }

  Widget _buildMediaPicker(
      String Function(String, [Map<String, dynamic>?]) t, bool isDark) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 72, height: 72,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(20),
              gradient: const LinearGradient(
                colors: [Color(0xFF4AA3E4), Color(0xFF7C3AED)],
              ),
            ),
            child: const Icon(Icons.add_photo_alternate_outlined,
                color: Colors.white, size: 36),
          ),
          const SizedBox(height: 16),
          Text(
            t('story.dropHint'),
            textAlign: TextAlign.center,
            style: const TextStyle(color: Colors.white54, fontSize: 14),
          ),
          const SizedBox(height: 20),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              _MediaPickBtn(
                icon: Icons.image_outlined,
                label: t('story.btnChangePhoto'),
                onTap: _pickImage,
                color: const Color(0xFF4AA3E4),
              ),
              const SizedBox(width: 12),
              _MediaPickBtn(
                icon: Icons.videocam_outlined,
                label: t('story.btnChangeVideo'),
                onTap: _pickVideo,
                color: const Color(0xFF7C3AED),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildImagePreview(
      String Function(String, [Map<String, dynamic>?]) t) {
    return Stack(
      fit: StackFit.expand,
      children: [
        Image.file(_mediaFile!, fit: BoxFit.contain),
      ],
    );
  }

  Widget _buildVideoPreview(
      String Function(String, [Map<String, dynamic>?]) t, bool isDark) {
    return Stack(
      fit: StackFit.expand,
      children: [
        if (_videoReady && _videoCtrl != null)
          Center(
            child: AspectRatio(
              aspectRatio: _videoCtrl!.value.aspectRatio,
              child: VideoPlayer(_videoCtrl!),
            ),
          )
        else
          const Center(
              child: CircularProgressIndicator(color: Color(0xFF4AA3E4))),

        // Trim overlay (shown when mediaStep == 'trim')
        if (_mediaStep == 'trim' &&
            _videoReady &&
            _videoCtrl != null &&
            _mediaDurationMs != null)
          Positioned(
            bottom: 0, left: 0, right: 0,
            child: _VideoTrimBar(
              durationMs: _mediaDurationMs!,
              trimStart: _trimStart,
              trimEnd: _trimEnd,
              videoCtrl: _videoCtrl!,
              onChanged: _applyTrim,
              onDone: () => setState(() => _mediaStep = 'preview'),
              isDark: isDark,
            ),
          ),
      ],
    );
  }

  // ── Options panel ─────────────────────────────────────────────────────────

  Widget _buildOptionsPanel(
      String Function(String, [Map<String, dynamic>?]) t, bool isDark) {
    final borderColor =
        isDark ? const Color(0xFF1E2D48) : const Color(0xFFE3EAF5);
    final bg =
        isDark ? const Color(0xFF0F1829) : Colors.white;

    return Container(
      decoration: BoxDecoration(
        color: bg,
        border: Border(top: BorderSide(color: borderColor, width: 0.5)),
      ),
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Text bg selector (only for text tab)
          if (_isText) _buildBgStrip(isDark),
          // Media action buttons
          if (!_isText && _mediaFile != null)
            _buildActionRow(t, isDark),

          const SizedBox(height: 10),

          // Visibility selector
          _buildVisibilityRow(t, isDark),

          // Error
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(_error!,
                  style: const TextStyle(
                      color: Colors.redAccent, fontSize: 13)),
            ),

          // Upload progress
          if (_uploading) ...[
            const SizedBox(height: 10),
            LinearProgressIndicator(
              value: _uploadProgress / 100,
              backgroundColor: borderColor,
              valueColor: const AlwaysStoppedAnimation(Color(0xFF4AA3E4)),
              borderRadius: BorderRadius.circular(4),
            ),
            const SizedBox(height: 4),
            Text(
              t('story.labelUploading'),
              style: const TextStyle(
                  color: Color(0xFF7A8BB0), fontSize: 12),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildBgStrip(bool isDark) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          LanguageController.instance.t('story.labelBackground'),
          style: TextStyle(
            color: isDark
                ? const Color(0xFF7A8BB0)
                : const Color(0xFF5B6378),
            fontSize: 12,
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 8),
        SizedBox(
          height: 38,
          child: ListView.builder(
            scrollDirection: Axis.horizontal,
            itemCount: kStoryBgOptions.length,
            itemBuilder: (_, i) {
              final bg = kStoryBgOptions[i];
              final active = _bgStyle == bg;
              return GestureDetector(
                onTap: () => setState(() => _bgStyle = bg),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 150),
                  width: 38, height: 38,
                  margin: const EdgeInsets.only(right: 8),
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: parseBackgroundGradient(bg),
                    border: active
                        ? Border.all(
                            color: const Color(0xFF4AA3E4), width: 2.5)
                        : null,
                    boxShadow: active
                        ? [
                            BoxShadow(
                              color: const Color(0xFF4AA3E4)
                                  .withValues(alpha: 0.4),
                              blurRadius: 8,
                            )
                          ]
                        : null,
                  ),
                ),
              );
            },
          ),
        ),
        const SizedBox(height: 10),
      ],
    );
  }

  Widget _buildActionRow(
      String Function(String, [Map<String, dynamic>?]) t, bool isDark) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: [
            // Change media
            _ActionChip(
              icon: _mediaType == 'image'
                  ? Icons.image_outlined
                  : Icons.videocam_outlined,
              label: _mediaType == 'image'
                  ? t('story.btnChangePhoto')
                  : t('story.btnChangeVideo'),
              onTap: () =>
                  _mediaType == 'image' ? _pickImage() : _pickVideo(),
              isDark: isDark,
            ),
            const SizedBox(width: 8),
            // Trim video
            if (_mediaType == 'video')
              _ActionChip(
                icon: Icons.content_cut_rounded,
                label: t('story.editVideo'),
                onTap: () => setState(() => _mediaStep = 'trim'),
                isDark: isDark,
                active: _mediaStep == 'trim',
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildVisibilityRow(
      String Function(String, [Map<String, dynamic>?]) t, bool isDark) {
    return Row(
      children: [
        Icon(Icons.remove_red_eye_outlined,
            color: isDark
                ? const Color(0xFF7A8BB0)
                : const Color(0xFF5B6378),
            size: 16),
        const SizedBox(width: 6),
        Text(
          t('story.labelVisibility'),
          style: TextStyle(
            color: isDark
                ? const Color(0xFF7A8BB0)
                : const Color(0xFF5B6378),
            fontSize: 13,
          ),
        ),
        const Spacer(),
        ..._Vis.values.map((v) {
          final active = _vis == v;
          return GestureDetector(
            onTap: () => setState(() => _vis = v),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 150),
              margin: const EdgeInsets.only(left: 6),
              padding: const EdgeInsets.symmetric(
                  horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(16),
                gradient: active
                    ? const LinearGradient(
                        colors: [Color(0xFF4AA3E4), Color(0xFF7C3AED)],
                      )
                    : null,
                color: active
                    ? null
                    : (isDark
                        ? const Color(0xFF1E2D48)
                        : const Color(0xFFE3EAF5)),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(v.icon,
                      size: 13,
                      color: active
                          ? Colors.white
                          : const Color(0xFF7A8BB0)),
                  const SizedBox(width: 4),
                  Text(
                    v.label(t),
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: active
                          ? Colors.white
                          : const Color(0xFF7A8BB0),
                    ),
                  ),
                ],
              ),
            ),
          );
        }),
      ],
    );
  }
}

// ── Format card ───────────────────────────────────────────────────────────────

class _FormatCard extends StatelessWidget {
  const _FormatCard({
    required this.gradient,
    required this.icon,
    required this.label,
    required this.sub,
    required this.onTap,
    required this.isDark,
  });

  final LinearGradient gradient;
  final IconData icon;
  final String label;
  final String sub;
  final VoidCallback onTap;
  final bool isDark;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(20),
          gradient: gradient,
          boxShadow: [
            BoxShadow(
              color: gradient.colors.first.withValues(alpha: 0.3),
              blurRadius: 16,
              offset: const Offset(0, 6),
            ),
          ],
        ),
        child: Stack(
          children: [
            // Subtle pattern
            Positioned(
              right: -20, top: -20,
              child: Container(
                width: 120, height: 120,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: Colors.white.withValues(alpha: 0.06),
                ),
              ),
            ),
            Positioned(
              right: 20, bottom: -30,
              child: Container(
                width: 90, height: 90,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: Colors.white.withValues(alpha: 0.04),
                ),
              ),
            ),
            // Content
            Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 52, height: 52,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(14),
                      color: Colors.white.withValues(alpha: 0.2),
                    ),
                    child:
                        Icon(icon, color: Colors.white, size: 28),
                  ),
                  const Spacer(),
                  Text(
                    label,
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w800,
                      fontSize: 22,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    sub,
                    style: TextStyle(
                      color: Colors.white.withValues(alpha: 0.7),
                      fontSize: 13,
                    ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
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

// ── Media pick button ─────────────────────────────────────────────────────────

class _MediaPickBtn extends StatelessWidget {
  const _MediaPickBtn({
    required this.icon,
    required this.label,
    required this.onTap,
    required this.color,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(14),
          color: color.withValues(alpha: 0.15),
          border: Border.all(color: color.withValues(alpha: 0.3)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, color: color, size: 20),
            const SizedBox(width: 8),
            Text(label,
                style: TextStyle(
                    color: color,
                    fontWeight: FontWeight.w600,
                    fontSize: 14)),
          ],
        ),
      ),
    );
  }
}

// ── Action chip ───────────────────────────────────────────────────────────────

class _ActionChip extends StatelessWidget {
  const _ActionChip({
    required this.icon,
    required this.label,
    required this.onTap,
    required this.isDark,
    this.active = false,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool isDark;
  final bool active;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(20),
          gradient: active
              ? const LinearGradient(
                  colors: [Color(0xFF4AA3E4), Color(0xFF7C3AED)],
                )
              : null,
          color: active
              ? null
              : (isDark
                  ? const Color(0xFF1E2D48)
                  : const Color(0xFFE3EAF5)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon,
                size: 15,
                color: active ? Colors.white : const Color(0xFF7A8BB0)),
            const SizedBox(width: 6),
            Text(label,
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: active
                      ? Colors.white
                      : (isDark
                          ? const Color(0xFFE8ECF8)
                          : const Color(0xFF0F1629)),
                )),
          ],
        ),
      ),
    );
  }
}

// ── Video trim bar ────────────────────────────────────────────────────────────

class _VideoTrimBar extends StatefulWidget {
  const _VideoTrimBar({
    required this.durationMs,
    required this.trimStart,
    required this.trimEnd,
    required this.videoCtrl,
    required this.onChanged,
    required this.onDone,
    required this.isDark,
  });

  final int durationMs;
  final double trimStart;
  final double trimEnd;
  final VideoPlayerController videoCtrl;
  final void Function(double start, double end) onChanged;
  final VoidCallback onDone;
  final bool isDark;

  @override
  State<_VideoTrimBar> createState() => _VideoTrimBarState();
}

class _VideoTrimBarState extends State<_VideoTrimBar> {
  late double _start;
  late double _end;

  @override
  void initState() {
    super.initState();
    _start = widget.trimStart;
    _end = widget.trimEnd;
  }

  String _fmt(double frac) {
    final ms = (frac * widget.durationMs).round();
    final s = ms ~/ 1000;
    final m = s ~/ 60;
    final sec = s % 60;
    return m > 0
        ? '$m:${sec.toString().padLeft(2, '0')}'
        : '${sec}s';
  }

  @override
  Widget build(BuildContext context) {
    final t = LanguageController.instance.t;
    return Container(
      color: Colors.black87,
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Title row
          Row(
            children: [
              Text(t('story.trimTitle'),
                  style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w700,
                      fontSize: 14)),
              const Spacer(),
              GestureDetector(
                onTap: () {
                  widget.onChanged(_start, _end);
                  widget.onDone();
                },
                child: Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 14, vertical: 6),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(14),
                    gradient: const LinearGradient(
                      colors: [Color(0xFF4AA3E4), Color(0xFF7C3AED)],
                    ),
                  ),
                  child: Text(t('story.trimConfirm'),
                      style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w600,
                          fontSize: 13)),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),

          // Range sliders
          RangeSlider(
            values: RangeValues(_start, _end),
            min: 0,
            max: 1,
            activeColor: const Color(0xFF4AA3E4),
            inactiveColor: const Color(0xFF253347),
            onChanged: (v) {
              setState(() {
                _start = v.start;
                _end = v.end;
              });
              final durationMs = widget.durationMs;
              widget.videoCtrl.seekTo(
                  Duration(milliseconds: (v.start * durationMs).round()));
            },
          ),

          // Time labels
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(_fmt(_start),
                  style: const TextStyle(
                      color: Color(0xFF4AA3E4),
                      fontSize: 12,
                      fontWeight: FontWeight.w600)),
              Text(
                '${t('story.trimTotal')}: ${_fmt(1)}',
                style: const TextStyle(
                    color: Color(0xFF7A8BB0), fontSize: 11),
              ),
              Text(_fmt(_end),
                  style: const TextStyle(
                      color: Color(0xFF4AA3E4),
                      fontSize: 12,
                      fontWeight: FontWeight.w600)),
            ],
          ),
        ],
      ),
    );
  }
}
