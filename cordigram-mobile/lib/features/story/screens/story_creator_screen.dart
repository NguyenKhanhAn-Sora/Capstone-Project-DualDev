import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';
import 'package:video_player/video_player.dart';
import '../../../core/services/language_controller.dart';
import '../models/story_models.dart';
import '../services/story_service.dart';
import '../widgets/story_music_picker.dart';
import 'photo_text_editor.dart';
import 'story_music_editor.dart';
import 'story_success_screen.dart';

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

  String desc(String Function(String) t) {
    switch (this) {
      case _Vis.followers:
        return t('story.descFollowers');
      case _Vis.public:
        return t('story.descPublic');
      case _Vis.private:
        return t('story.descPrivate');
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

  // Music
  StoryMusic? _selectedMusic;

  // Photo text overlays
  List<StoryTextLayer> _textLayers = [];
  String? _textSelectedId;
  int _textAddTrigger = 0;
  bool _textInputActive = false;

  // Music sticker selection
  bool _musicStickerSelected = false;

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
    _textFocus.dispose();
    _videoCtrl?.dispose();
    super.dispose();
  }

  bool get _isText => _tabCtrl.index == 1;

  // ── Reset for new story ───────────────────────────────────────────────────

  void _resetForNewStory() {
    _videoCtrl?.dispose();
    _videoCtrl = null;
    _textCtrl.clear();
    setState(() {
      _step = 'select';
      _mediaStep = 'preview';
      _mediaFile = null;
      _mediaType = null;
      _mediaDurationMs = null;
      _trimStartMs = null;
      _trimEndMs = null;
      _trimStart = 0;
      _trimEnd = 1;
      _bgStyle = kStoryBgOptions[1];
      _selectedMusic = null;
      _textLayers = [];
      _textSelectedId = null;
      _textAddTrigger = 0;
      _textInputActive = false;
      _musicStickerSelected = false;
      _uploading = false;
      _uploadProgress = 0;
      _error = null;
    });
  }

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
    setState(() {
      _step = 'editor';
      _textInputActive = false;
      _musicStickerSelected = false;
      _textSelectedId = null;
    });

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

  // ── Tab switching with confirm ────────────────────────────────────────────

  Future<void> _switchTab(int target) async {
    if (_tabCtrl.index == target) return;

    final hasContent = _mediaFile != null ||
        _textCtrl.text.isNotEmpty ||
        _selectedMusic != null ||
        _textLayers.isNotEmpty;

    if (hasContent) {
      final t = LanguageController.instance.t;
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (_) => AlertDialog(
          backgroundColor: const Color(0xFF1A2435),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
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
      if (confirmed != true || !mounted) return;

      // Reset all story content before switching
      _videoCtrl?.dispose();
      _videoCtrl = null;
      _textCtrl.clear();
      setState(() {
        _mediaFile = null;
        _mediaType = null;
        _mediaDurationMs = null;
        _trimStartMs = null;
        _trimEndMs = null;
        _trimStart = 0;
        _trimEnd = 1;
        _selectedMusic = null;
        _textLayers = [];
        _textSelectedId = null;
        _textInputActive = false;
        _musicStickerSelected = false;
        _bgStyle = kStoryBgOptions[1];
        _videoReady = false;
      });
    }

    _tabCtrl.animateTo(target);
  }

  // ── Music ─────────────────────────────────────────────────────────────────

  void _showMusicPicker() {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    showStoryMusicPicker(
      context: context,
      selected: _selectedMusic,
      isDark: isDark,
      onResult: (music) {
        if (mounted) {
          setState(() {
            _selectedMusic = music;
            // Auto-select sticker so trim panel opens immediately
            _musicStickerSelected = music != null;
          });
        }
      },
    );
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  Future<void> _submit() async {
    // Capture before any await to satisfy BuildContext-across-async-gap lint.
    final double canvasH = MediaQuery.of(context).size.height;

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
          if (_selectedMusic != null) 'music': _selectedMusic!.toJson(),
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

        final overlaysPayload = type == 'image'
            ? _textLayers
                .where((l) => l.text.trim().isNotEmpty)
                .map((l) => l.toApiJson(canvasH))
                .toList()
            : [];

        body = {
          'type': 'media',
          'mediaType': type,
          'mediaUrl': url,
          if (dur != null) 'mediaDurationMs': dur,
          if (_trimStartMs != null) 'trimStartMs': _trimStartMs,
          if (_trimEndMs != null) 'trimEndMs': _trimEndMs,
          'visibility': _vis.key,
          if (_selectedMusic != null && _mediaType != 'video')
            'music': _selectedMusic!.toJson(),
          if (overlaysPayload.isNotEmpty) 'textOverlays': overlaysPayload,
        };
      }

      // If story has music, trim the audio clip now and replace the URL.
      // This uploads a short ~20s clip to Cloudinary so viewers load it fast.
      if (body['music'] != null) {
        final music = body['music'] as Map<String, dynamic>;
        final rawUrl = music['audioUrl'] as String? ?? '';
        final startSec = (music['startTime'] as num?)?.toInt() ?? 0;
        if (rawUrl.isNotEmpty) {
          setState(() => _uploadProgress = 80);
          try {
            final clippedUrl = await StoryService.trimAudio(
              audioUrl: rawUrl,
              startTime: startSec,
              duration: 20,
            );
            // Update body with trimmed URL and reset startTime to 0.
            body['music'] = {
              ...music,
              'audioUrl': clippedUrl,
              'startTime': 0,
            };
          } catch (_) {
            // Trim failed — fall back to original URL (slower but functional).
          }
        }
      }

      setState(() => _uploadProgress = 90);
      await StoryService.createStory(body);
      setState(() => _uploadProgress = 100);

      await Future.delayed(const Duration(milliseconds: 300));
      if (mounted) setState(() => _step = 'success');
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
    SystemChrome.setSystemUIOverlayStyle(
      _step == 'editor' ? SystemUiOverlayStyle.light : SystemUiOverlayStyle.dark,
    );
    final t = LanguageController.instance.t;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final bg = isDark ? const Color(0xFF0B1120) : const Color(0xFFF5F7FB);

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        if (_uploading) return;
        final nav = Navigator.of(context, rootNavigator: true);
        if (await _confirmDiscard()) {
          if (mounted) nav.pop();
        }
      },
      child: Scaffold(
        backgroundColor: _step == 'editor' ? Colors.black : bg,
        resizeToAvoidBottomInset: false,
        body: _step == 'editor'
            // Editor fills full screen — padding handled internally via
            // MediaQuery.of(context).padding.top / .bottom
            ? _buildEditorScreen(t, isDark)
            : SafeArea(
                child: _step == 'success'
                    ? StorySuccessScreen(
                        onGoHome: () =>
                            Navigator.of(context, rootNavigator: true).pop(true),
                        onPostAnother: _resetForNewStory,
                      )
                    : _buildSelectScreen(t, isDark),
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
                onTap: () => Navigator.of(context, rootNavigator: true).pop(),
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

        // Stack+Positioned: card1 anchored top, card2 anchored bottom → pixel-exact equal heights
        Expanded(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(24, 0, 24, 24),
            child: LayoutBuilder(
              builder: (context, constraints) {
                final cardHeight = (constraints.maxHeight - 12) / 2;
                return Stack(
                  children: [
                    Positioned(
                      top: 0,
                      left: 0,
                      right: 0,
                      height: cardHeight,
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
                    Positioned(
                      bottom: 0,
                      left: 0,
                      right: 0,
                      height: cardHeight,
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
                  ],
                );
              },
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

  static const double _kBottomBarH = 64.0;

  Widget _buildEditorScreen(
      String Function(String, [Map<String, dynamic>?]) t, bool isDark) {
    final topPad = MediaQuery.of(context).padding.top;
    final bottomPad = MediaQuery.of(context).padding.bottom;
    return Stack(
      fit: StackFit.expand,
      children: [
        // Full-screen canvas (image/text fills entire screen)
        Positioned.fill(
          child: _isText ? _buildTextPreview(t) : _buildMediaPreview(t, isDark),
        ),
        // Top gradient + back + tab switcher (hidden during text editing)
        if (!_textInputActive)
          Positioned(
            top: 0, left: 0, right: 0,
            child: _buildFloatingTopBar(t, topPad),
          ),
        // Right floating toolbar (hidden during text/music edit)
        if (!_textInputActive && !_musicStickerSelected && _textSelectedId == null)
          Positioned(
            top: topPad + 60,
            right: 12,
            child: _buildRightToolbar(t, isDark),
          ),
        // Music trim panel (when sticker is selected)
        if (_musicStickerSelected && _selectedMusic != null)
          Positioned(
            bottom: _kBottomBarH + bottomPad + 8,
            left: 12, right: 12,
            child: MusicTrimPanel(
              music: _selectedMusic!,
              isDark: isDark,
              onUpdate: (m) => setState(() => _selectedMusic = m),
              onDone: () => setState(() => _musicStickerSelected = false),
            ),
          ),
        // Text layer controls (when a text layer is selected, not in input mode)
        if (_textSelectedId != null && !_textInputActive)
          Positioned(
            bottom: _kBottomBarH + bottomPad + 8,
            left: 12, right: 12,
            child: Builder(builder: (_) {
              final idx = _textLayers.indexWhere((l) => l.id == _textSelectedId);
              if (idx < 0) return const SizedBox.shrink();
              final layer = _textLayers[idx];
              return TextLayerControls(
                layer: layer,
                isDark: isDark,
                onUpdate: (updated) => setState(() {
                  final copy = List<StoryTextLayer>.from(_textLayers);
                  copy[idx] = updated;
                  _textLayers = copy;
                }),
                onDelete: () => setState(() {
                  _textLayers = _textLayers.where((l) => l.id != _textSelectedId).toList();
                  _textSelectedId = null;
                }),
              );
            }),
          ),
        // Upload progress overlay
        if (_uploading)
          Positioned(
            bottom: _kBottomBarH + bottomPad,
            left: 0, right: 0,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (_error != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 6),
                      child: Text(_error!,
                          style: const TextStyle(color: Colors.redAccent, fontSize: 13)),
                    ),
                  LinearProgressIndicator(
                    value: _uploadProgress / 100,
                    backgroundColor: Colors.white24,
                    valueColor: const AlwaysStoppedAnimation(Color(0xFF4AA3E4)),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '${_uploadProgress.toInt()}%',
                    style: const TextStyle(color: Colors.white70, fontSize: 12),
                  ),
                ],
              ),
            ),
          ),
        // Bottom bar: visibility + post button
        Positioned(
          bottom: 0, left: 0, right: 0,
          child: _buildBottomPostBar(t, isDark, bottomPad),
        ),
      ],
    );
  }

  Widget _buildFloatingTopBar(
      String Function(String, [Map<String, dynamic>?]) t, double topPad) {
    return Container(
      padding: EdgeInsets.only(top: topPad, left: 12, right: 12, bottom: 10),
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0xBB000000), Colors.transparent],
        ),
      ),
      child: Row(
        children: [
          // Back/close
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
                color: Colors.black.withValues(alpha: 0.45),
                border: Border.all(color: Colors.white.withValues(alpha: 0.25)),
              ),
              child: const Icon(Icons.close_rounded, color: Colors.white, size: 18),
            ),
          ),
          // Tab switcher pill — custom buttons to intercept tap before switching
          Expanded(
            child: Center(
              child: Container(
                height: 34,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(17),
                  color: Colors.black.withValues(alpha: 0.45),
                  border: Border.all(color: Colors.white.withValues(alpha: 0.2)),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [0, 1].map((i) {
                    final active = _tabCtrl.index == i;
                    final label = i == 0 ? t('story.tabMedia') : t('story.tabText');
                    return GestureDetector(
                      onTap: () => _switchTab(i),
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 180),
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 7),
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(17),
                          color: active
                              ? Colors.white.withValues(alpha: 0.2)
                              : Colors.transparent,
                        ),
                        child: Text(
                          label,
                          style: TextStyle(
                            color: active ? Colors.white : Colors.white54,
                            fontWeight: FontWeight.w600,
                            fontSize: 12,
                          ),
                        ),
                      ),
                    );
                  }).toList(),
                ),
              ),
            ),
          ),
          const SizedBox(width: 36), // balance the back button
        ],
      ),
    );
  }

  Widget _buildRightToolbar(
      String Function(String, [Map<String, dynamic>?]) t, bool isDark) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        // Add text (image stories only)
        if (!_isText && _mediaType == 'image') ...[
          _ToolbarIconBtn(
            icon: Icons.text_fields_rounded,
            label: 'Chữ',
            onTap: () => setState(() => _textAddTrigger++),
          ),
          const SizedBox(height: 18),
        ],
        // Music (not for video)
        if (_mediaType != 'video') ...[
          _ToolbarIconBtn(
            icon: Icons.music_note_rounded,
            label: 'Nhạc',
            onTap: _showMusicPicker,
            active: _selectedMusic != null,
          ),
          const SizedBox(height: 18),
        ],
        // Background color (text stories)
        if (_isText) ...[
          _ToolbarIconBtn(
            icon: Icons.palette_outlined,
            label: 'Màu nền',
            onTap: () => _showBgPicker(isDark),
          ),
          const SizedBox(height: 18),
        ],
        // Change media
        if (!_isText && _mediaFile != null) ...[
          _ToolbarIconBtn(
            icon: Icons.swap_horiz_rounded,
            label: 'Đổi',
            onTap: () => _showMediaPicker(isDark),
          ),
          const SizedBox(height: 18),
        ],
        // Trim video
        if (_mediaType == 'video' && _mediaDurationMs != null) ...[
          _ToolbarIconBtn(
            icon: Icons.content_cut_rounded,
            label: 'Cắt',
            onTap: () => setState(() => _mediaStep = 'trim'),
            active: _mediaStep == 'trim',
          ),
          const SizedBox(height: 18),
        ],
      ],
    );
  }

  Widget _buildBottomPostBar(
      String Function(String, [Map<String, dynamic>?]) t, bool isDark, double bottomPad) {
    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Colors.transparent, Colors.black.withValues(alpha: 0.75)],
        ),
      ),
      padding: EdgeInsets.fromLTRB(16, 20, 16, 12 + bottomPad),
      child: Row(
        children: [
          // Visibility chip
          GestureDetector(
            onTap: () => _showVisibilityPicker(t, isDark),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(20),
                color: Colors.white.withValues(alpha: 0.1),
                border: Border.all(color: Colors.white.withValues(alpha: 0.22)),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(_vis.icon, color: Colors.white70, size: 13),
                  const SizedBox(width: 5),
                  Text(
                    _vis.label(t),
                    style: const TextStyle(
                        color: Colors.white70,
                        fontSize: 12,
                        fontWeight: FontWeight.w600),
                  ),
                  const SizedBox(width: 3),
                  const Icon(Icons.expand_more_rounded,
                      color: Colors.white54, size: 13),
                ],
              ),
            ),
          ),
          if (_error != null && !_uploading) ...[
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                _error!,
                style: const TextStyle(color: Colors.redAccent, fontSize: 11),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ] else
            const Spacer(),
          // Post button
          GestureDetector(
            onTap: _uploading ? null : _submit,
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 11),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(24),
                gradient: _uploading
                    ? null
                    : const LinearGradient(
                        colors: [Color(0xFF4AA3E4), Color(0xFF7C3AED)],
                      ),
                color: _uploading ? const Color(0xFF253347) : null,
              ),
              child: _uploading
                  ? const SizedBox(
                      width: 18, height: 18,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white),
                    )
                  : Text(
                      t('story.btnPost'),
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                        fontSize: 14,
                      ),
                    ),
            ),
          ),
        ],
      ),
    );
  }

  void _showBgPicker(bool isDark) {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Container(
        decoration: const BoxDecoration(
          color: Color(0xFF1A2435),
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Màu nền',
              style: TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w700,
                  fontSize: 16),
            ),
            const SizedBox(height: 14),
            Wrap(
              spacing: 10,
              runSpacing: 10,
              children: kStoryBgOptions.map((bg) {
                final active = _bgStyle == bg;
                return GestureDetector(
                  onTap: () {
                    setState(() => _bgStyle = bg);
                    Navigator.pop(ctx);
                  },
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 120),
                    width: 48,
                    height: 48,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: parseBackgroundGradient(bg),
                      border: active
                          ? Border.all(color: const Color(0xFF4AA3E4), width: 3)
                          : Border.all(
                              color: Colors.white.withValues(alpha: 0.2)),
                      boxShadow: active
                          ? [
                              BoxShadow(
                                color: const Color(0xFF4AA3E4)
                                    .withValues(alpha: 0.45),
                                blurRadius: 10,
                              )
                            ]
                          : null,
                    ),
                  ),
                );
              }).toList(),
            ),
          ],
        ),
      ),
    );
  }

  // ── Preview area (direct content, no outer box) ───────────────────────────

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
          // Music sticker (interactive)
          if (_selectedMusic != null)
            MusicStickerEditor(
              music: _selectedMusic!,
              isSelected: _musicStickerSelected,
              onTap: () => setState(() {
                _musicStickerSelected = !_musicStickerSelected;
              }),
              onUpdate: (m) => setState(() => _selectedMusic = m),
              onRemove: () => setState(() {
                _selectedMusic = null;
                _musicStickerSelected = false;
              }),
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

    return Stack(
      fit: StackFit.expand,
      children: [
        // Photo wrapped with text editor, video plain
        if (_mediaType == 'video')
          _buildVideoPreview(t, isDark)
        else
          PhotoTextEditor(
            photoChild: _buildImagePreview(t),
            layers: _textLayers,
            onLayersChanged: (layers) =>
                setState(() => _textLayers = layers),
            addTrigger: _textAddTrigger,
            selectedId: _textSelectedId,
            onSelectChanged: (id) => setState(() {
              _textSelectedId = id;
              if (id != null) _musicStickerSelected = false;
            }),
            onInputModeChanged: (active) =>
                setState(() => _textInputActive = active),
          ),

        // Music sticker for image stories (above photo+text layers)
        if (_mediaType == 'image' && _selectedMusic != null)
          MusicStickerEditor(
            music: _selectedMusic!,
            isSelected: _musicStickerSelected,
            onTap: () => setState(() {
              _musicStickerSelected = !_musicStickerSelected;
              if (_musicStickerSelected) _textSelectedId = null;
            }),
            onUpdate: (m) => setState(() => _selectedMusic = m),
            onRemove: () => setState(() {
              _selectedMusic = null;
              _musicStickerSelected = false;
            }),
          ),
      ],
    );
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
    return Image.file(_mediaFile!, fit: BoxFit.cover);
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

  void _showVisibilityPicker(
      String Function(String, [Map<String, dynamic>?]) t, bool isDark) {
    final bg = isDark ? const Color(0xFF1A2435) : Colors.white;
    final borderColor =
        isDark ? const Color(0xFF1E2D48) : const Color(0xFFE3EAF5);

    showDialog<void>(
      context: context,
      builder: (ctx) => Dialog(
        backgroundColor: Colors.transparent,
        insetPadding: const EdgeInsets.symmetric(horizontal: 28),
        child: Container(
          decoration: BoxDecoration(
            color: bg,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: borderColor),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Header
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 18, 16, 14),
                child: Row(
                  children: [
                    const Icon(Icons.remove_red_eye_outlined,
                        color: Color(0xFF4AA3E4), size: 18),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        t('story.labelVisibility'),
                        style: TextStyle(
                          color: isDark
                              ? Colors.white
                              : const Color(0xFF0F1629),
                          fontWeight: FontWeight.w700,
                          fontSize: 16,
                        ),
                      ),
                    ),
                    GestureDetector(
                      onTap: () => Navigator.pop(ctx),
                      child: const Icon(Icons.close_rounded,
                          color: Color(0xFF7A8BB0), size: 20),
                    ),
                  ],
                ),
              ),
              Divider(color: borderColor, height: 1),
              // Options
              ..._Vis.values.map((v) {
                final selected = _vis == v;
                return InkWell(
                  onTap: () {
                    setState(() => _vis = v);
                    Navigator.pop(ctx);
                  },
                  child: Container(
                    padding: const EdgeInsets.fromLTRB(20, 14, 20, 14),
                    decoration: BoxDecoration(
                      color: selected
                          ? const Color(0xFF4AA3E4).withValues(alpha: 0.07)
                          : Colors.transparent,
                      border: Border(
                        top: BorderSide(color: borderColor, width: 0.5),
                      ),
                    ),
                    child: Row(
                      children: [
                        Container(
                          width: 42,
                          height: 42,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            gradient: selected
                                ? const LinearGradient(
                                    colors: [
                                      Color(0xFF4AA3E4),
                                      Color(0xFF7C3AED),
                                    ],
                                  )
                                : null,
                            color: selected
                                ? null
                                : (isDark
                                    ? const Color(0xFF1E2D48)
                                    : const Color(0xFFEEF2FA)),
                          ),
                          child: Icon(v.icon,
                              size: 18,
                              color: selected
                                  ? Colors.white
                                  : const Color(0xFF7A8BB0)),
                        ),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                v.label(t),
                                style: TextStyle(
                                  color: isDark
                                      ? Colors.white
                                      : const Color(0xFF0F1629),
                                  fontWeight: FontWeight.w600,
                                  fontSize: 14,
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                v.desc(t),
                                style: const TextStyle(
                                  color: Color(0xFF7A8BB0),
                                  fontSize: 12,
                                ),
                              ),
                            ],
                          ),
                        ),
                        if (selected)
                          const Icon(Icons.check_circle_rounded,
                              color: Color(0xFF4AA3E4), size: 22),
                      ],
                    ),
                  ),
                );
              }),
              const SizedBox(height: 8),
            ],
          ),
        ),
      ),
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

// ── Floating toolbar icon button ──────────────────────────────────────────────

class _ToolbarIconBtn extends StatelessWidget {
  const _ToolbarIconBtn({
    required this.icon,
    required this.label,
    required this.onTap,
    this.active = false,
  });
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool active;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 46,
            height: 46,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: active
                  ? const Color(0xFF4AA3E4).withValues(alpha: 0.9)
                  : Colors.black.withValues(alpha: 0.5),
              border: Border.all(
                color: active
                    ? const Color(0xFF4AA3E4)
                    : Colors.white.withValues(alpha: 0.3),
                width: 1.5,
              ),
            ),
            child: Icon(icon, color: Colors.white, size: 21),
          ),
          const SizedBox(height: 3),
          Text(
            label,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 10,
              fontWeight: FontWeight.w600,
              shadows: [Shadow(color: Colors.black87, blurRadius: 6)],
            ),
          ),
        ],
      ),
    );
  }
}
