import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:http/http.dart' as http;
import 'package:video_player/video_player.dart';
import 'dart:convert';
import '../../core/config/app_config.dart';
import '../../core/config/app_theme.dart';
import '../../core/services/api_service.dart';
import '../../core/services/auth_storage.dart';

// ── Attachment model ─────────────────────────────────────────────────────────

class _PickedFile {
  _PickedFile({required this.xFile});
  final XFile xFile;

  String get name => xFile.name;

  Future<int> get size async => (await xFile.readAsBytes()).length;
}

// ── Screen ───────────────────────────────────────────────────────────────────

class ReportProblemScreen extends StatefulWidget {
  const ReportProblemScreen({super.key});

  @override
  State<ReportProblemScreen> createState() => _ReportProblemScreenState();
}

class _ReportProblemScreenState extends State<ReportProblemScreen> {
  final _descController = TextEditingController();
  final _formKey = GlobalKey<FormState>();
  final _picker = ImagePicker();

  final List<_PickedFile> _files = [];
  bool _submitting = false;
  String? _error;
  bool _success = false;

  // cooldown
  int? _cooldownSec;
  Timer? _cooldownTimer;

  static const int _maxChars = 2000;
  static const int _maxFiles = 5;

  AppSemanticColors get _tokens {
    final theme = Theme.of(context);
    return theme.extension<AppSemanticColors>() ??
        (theme.brightness == Brightness.dark
            ? AppSemanticColors.dark
            : AppSemanticColors.light);
  }

  @override
  void dispose() {
    _descController.dispose();
    _cooldownTimer?.cancel();
    super.dispose();
  }

  // ── File picking ─────────────────────────────────────────────────────────

  Future<void> _pickFiles() async {
    final remaining = _maxFiles - _files.length;
    if (remaining <= 0) return;

    try {
      final picked = await _picker.pickMultipleMedia(limit: remaining);
      if (picked.isEmpty) return;
      setState(() {
        for (final f in picked) {
          if (_files.length < _maxFiles) {
            _files.add(_PickedFile(xFile: f));
          }
        }
      });
    } catch (_) {
      // Fallback: pick image only
      try {
        final img = await _picker.pickImage(source: ImageSource.gallery);
        if (img != null && _files.length < _maxFiles) {
          setState(() => _files.add(_PickedFile(xFile: img)));
        }
      } catch (_) {}
    }
  }

  void _removeFile(int index) {
    setState(() => _files.removeAt(index));
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  Future<void> _submit() async {
    setState(() {
      _error = null;
    });

    final description = _descController.text.trim();
    if (description.isEmpty) {
      setState(() => _error = 'Please describe the problem.');
      return;
    }

    final token = AuthStorage.accessToken;
    if (token == null) {
      setState(() => _error = 'You need to sign in to report a problem.');
      return;
    }

    setState(() => _submitting = true);

    try {
      final uri = Uri.parse('${AppConfig.apiBaseUrl}/reportproblem');
      final request = http.MultipartRequest('POST', uri)
        ..headers['Authorization'] = 'Bearer $token'
        ..fields['description'] = description;

      for (final f in _files) {
        final bytes = await f.xFile.readAsBytes();
        request.files.add(
          http.MultipartFile.fromBytes('files', bytes, filename: f.name),
        );
      }

      final streamed = await request.send().timeout(
        const Duration(seconds: 60),
      );
      final response = await http.Response.fromStream(streamed);

      if (response.statusCode >= 200 && response.statusCode < 300) {
        if (!mounted) return;
        setState(() {
          _success = true;
          _submitting = false;
          _descController.clear();
          _files.clear();
          _error = null;
        });
      } else {
        String message = 'Cannot send report now.';
        int? retryAfterMs;
        try {
          final json = jsonDecode(response.body) as Map<String, dynamic>;
          final msg = json['message'];
          if (msg is String) message = msg;
          retryAfterMs = json['retryAfterMs'] as int?;
        } catch (_) {}

        if (!mounted) return;
        if (retryAfterMs != null && retryAfterMs > 0) {
          _startCooldown(retryAfterMs);
          setState(() {
            _error = 'Please wait before sending another report.';
            _submitting = false;
          });
        } else {
          setState(() {
            _error = message;
            _submitting = false;
          });
        }
      }
    } on ApiException catch (e) {
      if (!mounted) return;
      if (e.retryAfterSec != null && e.retryAfterSec! > 0) {
        _startCooldown(e.retryAfterSec! * 1000);
        setState(() {
          _error = 'Please wait before sending another report.';
          _submitting = false;
        });
      } else {
        setState(() {
          _error = e.message;
          _submitting = false;
        });
      }
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'Cannot send report now. Please try again.';
        _submitting = false;
      });
    }
  }

  void _startCooldown(int retryAfterMs) {
    _cooldownTimer?.cancel();
    setState(() => _cooldownSec = (retryAfterMs / 1000).ceil());
    _cooldownTimer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) {
        t.cancel();
        return;
      }
      setState(() {
        if (_cooldownSec != null && _cooldownSec! > 1) {
          _cooldownSec = _cooldownSec! - 1;
        } else {
          _cooldownSec = null;
          t.cancel();
        }
      });
    });
  }

  void _clear() {
    setState(() {
      _descController.clear();
      _files.clear();
      _error = null;
      _success = false;
      _cooldownSec = null;
      _cooldownTimer?.cancel();
    });
  }

  // ── Build ─────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    return Scaffold(
      backgroundColor: theme.scaffoldBackgroundColor,
      appBar: AppBar(
        backgroundColor: scheme.surface,
        elevation: 0,
        scrolledUnderElevation: 0,
        surfaceTintColor: Colors.transparent,
        leading: IconButton(
          icon: Icon(
            Icons.arrow_back_ios_new_rounded,
            color: scheme.onSurfaceVariant,
            size: 20,
          ),
          onPressed: () => Navigator.of(context).pop(),
        ),
        title: Text(
          'Report a Problem',
          style: TextStyle(
            color: scheme.onSurface,
            fontWeight: FontWeight.w600,
            fontSize: 16,
          ),
        ),
        centerTitle: true,
      ),
      body: _success ? _buildSuccessView() : _buildForm(),
    );
  }

  // ── Success view ──────────────────────────────────────────────────────────

  Widget _buildSuccessView() {
    final tokens = _tokens;
    final scheme = Theme.of(context).colorScheme;
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 72,
              height: 72,
              decoration: BoxDecoration(
                color: scheme.primary.withValues(alpha: 0.14),
                shape: BoxShape.circle,
              ),
              child: Icon(Icons.check_rounded, color: scheme.primary, size: 38),
            ),
            const SizedBox(height: 20),
            Text(
              'Report sent',
              style: TextStyle(
                color: tokens.text,
                fontSize: 20,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 10),
            Text(
              'Thank you. Our team will review it soon.',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: tokens.textMuted,
                fontSize: 14,
                height: 1.5,
              ),
            ),
            const SizedBox(height: 32),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton(
                onPressed: _clear,
                style: OutlinedButton.styleFrom(
                  foregroundColor: scheme.primary,
                  side: BorderSide(color: tokens.panelBorder),
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(10),
                  ),
                ),
                child: const Text(
                  'Send another report',
                  style: TextStyle(fontSize: 14),
                ),
              ),
            ),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: TextButton(
                onPressed: () => Navigator.of(context).pop(),
                style: TextButton.styleFrom(
                  foregroundColor: tokens.textMuted,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
                child: const Text(
                  'Back to home',
                  style: TextStyle(fontSize: 14),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ── Form ──────────────────────────────────────────────────────────────────

  Widget _buildForm() {
    final theme = Theme.of(context);
    final tokens = _tokens;
    final scheme = theme.colorScheme;
    final descLen = _descController.text.length;
    final canSubmit = !_submitting && (_cooldownSec == null);

    return Form(
      key: _formKey,
      child: ListView(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 20),
        children: [
          // ── Header card ─────────────────────────────────────────────────
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: tokens.panel,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: tokens.panelBorder),
            ),
            child: Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: scheme.primary.withValues(alpha: 0.14),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(
                    Icons.flag_outlined,
                    color: scheme.primary,
                    size: 20,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Tell us what went wrong',
                        style: TextStyle(
                          color: tokens.text,
                          fontSize: 15,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        'Describe the issue and attach screenshots or a short video.',
                        style: TextStyle(
                          color: tokens.textMuted,
                          fontSize: 12,
                          height: 1.4,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(height: 20),

          // ── Description label ────────────────────────────────────────────
          const _FieldLabel(text: 'Description'),
          const SizedBox(height: 8),
          Stack(
            children: [
              TextField(
                controller: _descController,
                maxLines: 7,
                maxLength: _maxChars,
                buildCounter:
                    (
                      _, {
                      required currentLength,
                      required isFocused,
                      maxLength,
                    }) => const SizedBox.shrink(),
                onChanged: (_) => setState(() {}),
                style: TextStyle(color: tokens.text, fontSize: 14, height: 1.5),
                decoration: InputDecoration(
                  hintText:
                      'Explain what happened, where it happened, and any steps to reproduce.',
                  hintStyle: TextStyle(
                    color: tokens.textMuted,
                    fontSize: 14,
                    height: 1.5,
                  ),
                  filled: true,
                  fillColor: tokens.panel,
                  contentPadding: const EdgeInsets.fromLTRB(14, 14, 14, 36),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(10),
                    borderSide: BorderSide(color: tokens.panelBorder),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(10),
                    borderSide: BorderSide(color: tokens.panelBorder),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(10),
                    borderSide: BorderSide(color: scheme.primary),
                  ),
                ),
              ),
              // char counter
              Positioned(
                right: 12,
                bottom: 10,
                child: Text(
                  '$descLen / $_maxChars',
                  style: TextStyle(
                    color: descLen > _maxChars * 0.9
                        ? scheme.error
                        : tokens.textMuted,
                    fontSize: 11,
                  ),
                ),
              ),
            ],
          ),

          const SizedBox(height: 20),

          // ── Attachments ──────────────────────────────────────────────────
          Row(
            children: [
              const _FieldLabel(text: 'Attachments'),
              const Spacer(),
              Text(
                '${_files.length} / $_maxFiles',
                style: TextStyle(color: tokens.textMuted, fontSize: 12),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            'Up to 5 files · images or videos',
            style: TextStyle(color: tokens.textMuted, fontSize: 12),
          ),
          const SizedBox(height: 10),

          // Media preview grid
          if (_files.isNotEmpty) ...[
            Wrap(
              spacing: 10,
              runSpacing: 10,
              children: List.generate(
                _files.length,
                (i) => _AttachmentPreviewTile(
                  file: _files[i],
                  onRemove: () => _removeFile(i),
                ),
              ),
            ),
            const SizedBox(height: 8),
          ],

          // Add files button
          if (_files.length < _maxFiles)
            GestureDetector(
              onTap: _pickFiles,
              child: Container(
                height: 52,
                decoration: BoxDecoration(
                  color: tokens.panel,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(
                    color: tokens.panelBorder,
                    style: BorderStyle.solid,
                  ),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(
                      Icons.add_photo_alternate_outlined,
                      color: scheme.primary,
                      size: 20,
                    ),
                    const SizedBox(width: 8),
                    Text(
                      'Add images or videos',
                      style: TextStyle(
                        color: scheme.primary,
                        fontSize: 14,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ),
            ),

          const SizedBox(height: 20),

          // ── Error ──────────────────────────────────────────────────────
          if (_error != null)
            Container(
              margin: const EdgeInsets.only(bottom: 14),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: scheme.error.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: scheme.error.withValues(alpha: 0.32)),
              ),
              child: Row(
                children: [
                  Icon(
                    Icons.error_outline_rounded,
                    color: scheme.error,
                    size: 18,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      _error!,
                      style: TextStyle(color: scheme.error, fontSize: 13),
                    ),
                  ),
                ],
              ),
            ),

          // ── Cooldown notice ────────────────────────────────────────────
          if (_cooldownSec != null)
            Container(
              margin: const EdgeInsets.only(bottom: 14),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: scheme.primary.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(
                  color: scheme.primary.withValues(alpha: 0.24),
                ),
              ),
              child: Row(
                children: [
                  Icon(Icons.timer_outlined, color: scheme.primary, size: 18),
                  const SizedBox(width: 8),
                  Text(
                    'You can send the next report in ${_cooldownSec}s.',
                    style: TextStyle(color: tokens.textMuted, fontSize: 13),
                  ),
                ],
              ),
            ),

          // ── Actions ────────────────────────────────────────────────────
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: _submitting ? null : _clear,
                  style: OutlinedButton.styleFrom(
                    foregroundColor: tokens.textMuted,
                    side: BorderSide(color: tokens.panelBorder),
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10),
                    ),
                  ),
                  child: const Text('Clear', style: TextStyle(fontSize: 14)),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                flex: 2,
                child: ElevatedButton(
                  onPressed: canSubmit ? _submit : null,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: scheme.primary,
                    disabledBackgroundColor: scheme.primary.withValues(
                      alpha: 0.45,
                    ),
                    foregroundColor: Colors.white,
                    disabledForegroundColor: Colors.white70,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    elevation: 0,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10),
                    ),
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
                      : const Text(
                          'Send report',
                          style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                ),
              ),
            ],
          ),

          const SizedBox(height: 32),
        ],
      ),
    );
  }
}

// ── Field label ───────────────────────────────────────────────────────────────

class _FieldLabel extends StatelessWidget {
  const _FieldLabel({required this.text});
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
        fontSize: 13,
        fontWeight: FontWeight.w500,
      ),
    );
  }
}

// ── Attachment preview ────────────────────────────────────────────────────────

class _AttachmentPreviewTile extends StatefulWidget {
  const _AttachmentPreviewTile({required this.file, required this.onRemove});
  final _PickedFile file;
  final VoidCallback onRemove;

  @override
  State<_AttachmentPreviewTile> createState() => _AttachmentPreviewTileState();
}

class _AttachmentPreviewTileState extends State<_AttachmentPreviewTile> {
  VideoPlayerController? _videoController;
  bool _videoReady = false;

  _PickedFile get _file => widget.file;

  bool get _isVideo {
    final ext = _file.name.split('.').last.toLowerCase();
    return ['mp4', 'mov', 'avi', 'mkv', 'webm'].contains(ext);
  }

  @override
  void initState() {
    super.initState();
    if (_isVideo) {
      _videoController = VideoPlayerController.file(File(_file.xFile.path));
      _videoController!
          .initialize()
          .then((_) {
            if (!mounted) return;
            setState(() => _videoReady = true);
          })
          .catchError((_) {
            if (!mounted) return;
            setState(() => _videoReady = false);
          });
    }
  }

  @override
  void dispose() {
    _videoController?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final tokens =
        theme.extension<AppSemanticColors>() ??
        (theme.brightness == Brightness.dark
            ? AppSemanticColors.dark
            : AppSemanticColors.light);
    return SizedBox(
      width: 104,
      height: 104,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(10),
        child: Stack(
          fit: StackFit.expand,
          children: [
            Container(
              decoration: BoxDecoration(
                color: tokens.panel,
                border: Border.all(color: tokens.panelBorder),
                borderRadius: BorderRadius.circular(10),
              ),
              child: _isVideo ? _buildVideoPreview() : _buildImagePreview(),
            ),
            if (_isVideo)
              Center(
                child: Icon(
                  Icons.play_circle_fill_rounded,
                  color: tokens.text,
                  size: 34,
                ),
              ),
            Positioned(
              top: 6,
              right: 6,
              child: GestureDetector(
                onTap: widget.onRemove,
                child: Container(
                  width: 24,
                  height: 24,
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.5),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    Icons.close_rounded,
                    color: tokens.text,
                    size: 16,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildImagePreview() {
    final theme = Theme.of(context);
    final tokens =
        theme.extension<AppSemanticColors>() ??
        (theme.brightness == Brightness.dark
            ? AppSemanticColors.dark
            : AppSemanticColors.light);
    return Image.file(
      File(_file.xFile.path),
      fit: BoxFit.cover,
      errorBuilder: (_, __, ___) {
        return Center(
          child: Icon(
            Icons.broken_image_outlined,
            color: tokens.textMuted,
            size: 24,
          ),
        );
      },
    );
  }

  Widget _buildVideoPreview() {
    final theme = Theme.of(context);
    final tokens =
        theme.extension<AppSemanticColors>() ??
        (theme.brightness == Brightness.dark
            ? AppSemanticColors.dark
            : AppSemanticColors.light);
    if (_videoController != null && _videoReady) {
      return FittedBox(
        fit: BoxFit.cover,
        child: SizedBox(
          width: _videoController!.value.size.width,
          height: _videoController!.value.size.height,
          child: VideoPlayer(_videoController!),
        ),
      );
    }

    return Center(
      child: Icon(Icons.videocam_outlined, color: tokens.textMuted, size: 24),
    );
  }
}
