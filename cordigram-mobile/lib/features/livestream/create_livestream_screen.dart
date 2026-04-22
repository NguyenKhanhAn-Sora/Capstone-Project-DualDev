import 'dart:async';
import 'dart:convert';

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:permission_handler/permission_handler.dart';

import '../../core/config/app_theme.dart';
import '../../core/services/api_service.dart';
import '../../core/services/auth_storage.dart';
import 'livestream_create_service.dart';
import 'livestream_hub_screen.dart';
import 'livestream_pending_session.dart';

class CreateLivestreamScreen extends StatefulWidget {
  const CreateLivestreamScreen({
    super.key,
    this.onLivestreamCreated,
    this.showHeader = true,
    this.isActive = true,
  });

  final ValueChanged<LivestreamItem>? onLivestreamCreated;
  final bool showHeader;
  final bool isActive;

  @override
  State<CreateLivestreamScreen> createState() => _CreateLivestreamScreenState();
}

class _CreateLivestreamScreenState extends State<CreateLivestreamScreen> {
  final _titleCtrl = TextEditingController();
  final _descriptionCtrl = TextEditingController();
  final _pinnedCommentCtrl = TextEditingController();
  final _locationCtrl = TextEditingController();
  final _scrollCtrl = ScrollController();

  LivestreamVisibility _visibility = LivestreamVisibility.public;
  LivestreamLatencyMode _latencyMode = LivestreamLatencyMode.adaptive;
  LivestreamSourceMode _sourceMode = LivestreamSourceMode.camera;

  bool _submitting = false;
  String? _error;
  String? _success;

  bool _cameraLoading = false;
  String? _cameraError;
  List<CameraDescription> _cameraDevices = const [];
  CameraDescription? _selectedCamera;
  CameraController? _cameraCtrl;
  int _cameraInitSeq = 0;
  PermissionStatus _cameraPermission = PermissionStatus.denied;
  PermissionStatus _microphonePermission = PermissionStatus.denied;
  String? _permissionBusy;

  List<_LocationSuggestion> _locationSuggestions = [];
  bool _locationLoading = false;
  bool _locationOpen = false;
  Timer? _locationDebounce;

  List<_MentionSuggestion> _mentionSuggestions = [];
  bool _mentionOpen = false;
  bool _mentionLoading = false;

  static final _mentionRegex = RegExp(r'@([a-zA-Z0-9_.]{0,30})$');

  AppSemanticColors get _tokens {
    final theme = Theme.of(context);
    return theme.extension<AppSemanticColors>() ??
        (theme.brightness == Brightness.dark
            ? AppSemanticColors.dark
            : AppSemanticColors.light);
  }

  @override
  void initState() {
    super.initState();
    _titleCtrl.addListener(() => setState(() {}));
    _loadPermissionStatuses();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      unawaited(_onSourceModeChanged(LivestreamSourceMode.camera));
    });
  }

  @override
  void didUpdateWidget(covariant CreateLivestreamScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!oldWidget.isActive && widget.isActive) {
      _onTabBecameActive();
    }
  }

  @override
  void dispose() {
    _locationDebounce?.cancel();
    _titleCtrl.dispose();
    _descriptionCtrl.dispose();
    _pinnedCommentCtrl.dispose();
    _locationCtrl.dispose();
    _scrollCtrl.dispose();
    _cameraCtrl?.dispose();
    super.dispose();
  }

  String _permissionLabel(PermissionStatus status) {
    if (status.isGranted) return 'Granted';
    if (status.isPermanentlyDenied) return 'Blocked';
    if (status.isDenied) return 'Denied';
    if (status.isRestricted) return 'Restricted';
    return 'Unknown';
  }

  Future<void> _loadPermissionStatuses() async {
    final camera = await Permission.camera.status;
    final mic = await Permission.microphone.status;
    if (!mounted) return;
    setState(() {
      _cameraPermission = camera;
      _microphonePermission = mic;
    });
  }

  Future<void> _onTabBecameActive() async {
    await _loadPermissionStatuses();

    final shouldReRequestCamera =
        _sourceMode == LivestreamSourceMode.camera &&
        _cameraPermission.isDenied;
    final shouldReRequestMic = _microphonePermission.isDenied;

    if (shouldReRequestCamera) {
      await _requestCameraPermission();
    }

    if (shouldReRequestMic) {
      await _requestMicrophonePermission();
    }
  }

  Future<bool> _requestCameraPermission() async {
    setState(() => _permissionBusy = 'camera');
    try {
      final result = await Permission.camera.request();
      if (!mounted) return false;
      setState(() => _cameraPermission = result);
      if (result.isGranted) {
        return true;
      }

      setState(() {
        _cameraError = result.isPermanentlyDenied
            ? 'Camera permission is blocked. Open app settings to allow camera.'
            : 'Camera permission denied. Please allow camera access.';
      });
      return false;
    } finally {
      if (mounted) setState(() => _permissionBusy = null);
    }
  }

  Future<bool> _requestMicrophonePermission() async {
    setState(() => _permissionBusy = 'microphone');
    try {
      final result = await Permission.microphone.request();
      if (!mounted) return false;
      setState(() => _microphonePermission = result);
      if (result.isGranted) {
        return true;
      }

      setState(() {
        _error = result.isPermanentlyDenied
            ? 'Microphone permission is blocked. Open app settings to allow microphone.'
            : 'Microphone permission denied. Please allow microphone access.';
      });
      return false;
    } finally {
      if (mounted) setState(() => _permissionBusy = null);
    }
  }

  bool get _cameraReady {
    final c = _cameraCtrl;
    return c != null && c.value.isInitialized && !c.value.hasError;
  }

  bool get _createDisabled {
    if (_submitting) return true;
    if (_titleCtrl.text.trim().isEmpty) return true;
    if (_sourceMode == LivestreamSourceMode.camera && !_cameraReady) {
      return true;
    }
    return false;
  }

  int get _viewerDelaySeconds {
    switch (_latencyMode) {
      case LivestreamLatencyMode.adaptive:
        return 30;
      case LivestreamLatencyMode.balanced:
        return 15;
      case LivestreamLatencyMode.low:
        return 0;
    }
  }

  Future<void> _loadCameras() async {
    if (_cameraLoading) return;

    final granted = _cameraPermission.isGranted
        ? true
        : await _requestCameraPermission();
    if (!granted) return;

    setState(() {
      _cameraLoading = true;
      _cameraError = null;
    });

    try {
      final cams = await availableCameras();
      if (!mounted) return;
      setState(() {
        _cameraDevices = cams;
        _selectedCamera = _pickBestCamera(cams);
      });
      if (_selectedCamera != null) {
        await _initializeCamera(_selectedCamera!);
      }
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _cameraError =
            'Unable to access camera devices. Please check permission.';
      });
    } finally {
      if (mounted) {
        setState(() => _cameraLoading = false);
      }
    }
  }

  CameraDescription? _pickBestCamera(List<CameraDescription> cams) {
    if (cams.isEmpty) return null;
    for (final cam in cams) {
      if (cam.lensDirection == CameraLensDirection.front) return cam;
    }
    return cams.first;
  }

  Future<void> _initializeCamera(CameraDescription camera) async {
    final initSeq = ++_cameraInitSeq;
    final previous = _cameraCtrl;
    if (mounted) {
      setState(() {
        _cameraCtrl = null;
      });
    }
    await previous?.dispose();

    final controller = CameraController(
      camera,
      ResolutionPreset.max,
      enableAudio: true,
    );

    try {
      await controller.initialize();
      if (!mounted || initSeq != _cameraInitSeq) {
        await controller.dispose();
        return;
      }
      setState(() {
        _cameraCtrl = controller;
        _cameraError = null;
      });
    } catch (_) {
      await controller.dispose();
      if (!mounted || initSeq != _cameraInitSeq) return;
      setState(() {
        _cameraCtrl = null;
        _cameraError = 'Camera initialization failed. Try a different camera.';
      });
    }
  }

  Future<void> _releaseCameraPreview({bool clearSelection = false}) async {
    _cameraInitSeq += 1;
    final previous = _cameraCtrl;
    if (mounted) {
      setState(() {
        _cameraCtrl = null;
        if (clearSelection) {
          _selectedCamera = null;
        }
      });
    } else {
      _cameraCtrl = null;
      if (clearSelection) {
        _selectedCamera = null;
      }
    }
    await previous?.dispose();
  }

  Future<void> _onSourceModeChanged(LivestreamSourceMode mode) async {
    // Camera-only mode on mobile.
    mode = LivestreamSourceMode.camera;
    setState(() {
      _sourceMode = mode;
      _error = null;
      _success = null;
    });
    if (mode == LivestreamSourceMode.camera && !_cameraReady) {
      await _loadCameras();
      return;
    }
  }

  List<String> _extractMentions(String value) {
    final found = RegExp(r'@([a-zA-Z0-9_.]+)').allMatches(value);
    final unique = <String>{};
    for (final item in found) {
      final handle = (item.group(1) ?? '').trim().toLowerCase();
      if (handle.isNotEmpty) unique.add(handle);
    }
    return unique.toList();
  }

  void _onTitleChanged(String value) {
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
      if (!mounted) return;
      setState(() => _mentionLoading = false);
    }
  }

  void _insertMention(_MentionSuggestion suggestion) {
    final text = _titleCtrl.text;
    final match = _mentionRegex.firstMatch(text);
    if (match == null) return;
    final before = text.substring(0, match.start);
    final after = text.substring(match.end);
    final inserted = '$before@${suggestion.username} $after';
    _titleCtrl.value = TextEditingValue(
      text: inserted,
      selection: TextSelection.collapsed(
        offset: before.length + suggestion.username.length + 2,
      ),
    );
    setState(() {
      _mentionOpen = false;
      _mentionSuggestions = [];
    });
  }

  Future<void> _submit() async {
    final title = _titleCtrl.text.trim();
    if (title.isEmpty) {
      setState(() => _error = 'Title is required.');
      return;
    }

    if (_sourceMode == LivestreamSourceMode.camera && !_cameraReady) {
      setState(
        () => _error = 'Please enable camera before creating livestream.',
      );
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
      _success = null;
    });

    try {
      final stream = await LivestreamCreateService.createLivestream(
        title: title,
        description: _descriptionCtrl.text,
        pinnedComment: _pinnedCommentCtrl.text,
        location: _locationCtrl.text,
        visibility: _visibility,
        latencyMode: _latencyMode,
        mentions: _extractMentions(title),
      );

      LivestreamPendingSessionStore.setPending(
        PendingLivestreamSession(
          streamId: stream.id,
          title: stream.title,
          sourceMode: LivestreamSourceMode.camera,
          latencyMode: _latencyMode,
          viewerDelaySeconds: _viewerDelaySeconds,
          cameraDeviceName: _selectedCamera?.name,
          isFrontCamera:
              _selectedCamera?.lensDirection == CameraLensDirection.front,
        ),
      );

      // Free camera resources so LiveKit can publish host video without lockups.
      await _releaseCameraPreview();

      if (!mounted) return;
      setState(() {
        _success = 'Livestream created. Redirecting to your live room...';
      });
      widget.onLivestreamCreated?.call(stream);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Livestream created successfully')),
      );

      await Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) =>
              LivestreamHubScreen(initialStreamId: stream.id, forceHost: true),
        ),
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.message);
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = 'Failed to create livestream. Please try again.');
    } finally {
      if (mounted) {
        setState(() => _submitting = false);
      }
    }
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
      final response = await http
          .get(
            url,
            headers: {
              'Accept': 'application/json',
              'User-Agent': 'CordigramApp/1.0 (mobile; contact@cordigram.app)',
            },
          )
          .timeout(const Duration(seconds: 10));
      if (!mounted) return;
      if (response.statusCode != 200) {
        setState(() => _locationLoading = false);
        return;
      }

      final items = jsonDecode(response.body) as List;
      final next = items.whereType<Map<String, dynamic>>().map((item) {
        return _LocationSuggestion(
          label: _cleanLocation(item['display_name'] as String? ?? ''),
          lat: item['lat'] as String? ?? '',
          lon: item['lon'] as String? ?? '',
        );
      }).toList();

      setState(() {
        _locationSuggestions = next;
        _locationOpen = next.isNotEmpty;
        _locationLoading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _locationLoading = false);
    }
  }

  String _cleanLocation(String raw) {
    final value = raw.trim();
    if (value.length <= 120) return value;
    return '${value.substring(0, 117)}...';
  }

  @override
  Widget build(BuildContext context) {
    final tokens = _tokens;
    return GestureDetector(
      onTap: () => FocusScope.of(context).unfocus(),
      child: Scaffold(
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
        body: Column(
          children: [
            if (widget.showHeader) _buildStandaloneHeader(tokens),
            Expanded(
              child: SingleChildScrollView(
                controller: _scrollCtrl,
                padding: const EdgeInsets.fromLTRB(16, 14, 16, 28),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _buildSourceCard(tokens),
                    const SizedBox(height: 12),
                    _buildDetailsCard(tokens),
                    const SizedBox(height: 12),
                    _buildLatencyCard(tokens),
                    const SizedBox(height: 12),
                    _buildPermissionCard(tokens),
                    const SizedBox(height: 12),
                    if (_error != null)
                      Text(
                        _error!,
                        style: TextStyle(
                          color: Theme.of(context).colorScheme.error,
                        ),
                      ),
                    if (_success != null)
                      Text(
                        _success!,
                        style: TextStyle(color: Colors.green.shade600),
                      ),
                    const SizedBox(height: 10),
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton.icon(
                        onPressed: _createDisabled ? null : _submit,
                        icon: const Icon(Icons.wifi_tethering_rounded),
                        label: Text(
                          _submitting ? 'Creating...' : 'Create livestream',
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStandaloneHeader(AppSemanticColors tokens) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 10),
      decoration: BoxDecoration(
        color: tokens.panel,
        border: Border(bottom: BorderSide(color: tokens.panelBorder)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Create livestream',
            style: TextStyle(
              color: tokens.text,
              fontSize: 18,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            'Configure source and quality before going live',
            style: TextStyle(color: tokens.textMuted, fontSize: 13),
          ),
        ],
      ),
    );
  }

  Widget _buildSourceCard(AppSemanticColors tokens) {
    return _panel(
      tokens,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _sectionTitle(tokens, 'Livestream source'),
          const SizedBox(height: 8),
          Text(
            'Camera mode only. Livestream screen-share is disabled on mobile.',
            style: TextStyle(color: tokens.textMuted, fontSize: 12.5),
          ),
        ],
      ),
    );
  }

  Widget _buildDetailsCard(AppSemanticColors tokens) {
    return _panel(
      tokens,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _sectionTitle(tokens, 'Livestream details'),
          const SizedBox(height: 10),
          _inputField(
            controller: _titleCtrl,
            label: 'Title',
            hint: 'Write a livestream title and tag users with @username',
            onChanged: _onTitleChanged,
          ),
          if (_mentionOpen) _buildMentionDropdown(tokens),
          const SizedBox(height: 10),
          _inputField(
            controller: _descriptionCtrl,
            label: 'Description (optional)',
            hint: 'Share what this livestream is about',
            maxLines: 3,
          ),
          const SizedBox(height: 10),
          _inputField(
            controller: _pinnedCommentCtrl,
            label: 'Pinned comment (optional)',
            hint: 'Example: Ask your questions in chat',
          ),
          const SizedBox(height: 10),
          _inputField(
            controller: _locationCtrl,
            label: 'Location (optional)',
            hint: 'Add a location',
            onChanged: _onLocationChanged,
          ),
          if (_locationLoading)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(
                'Searching location...',
                style: TextStyle(color: tokens.textMuted, fontSize: 12),
              ),
            ),
          if (_locationOpen)
            Container(
              margin: const EdgeInsets.only(top: 8),
              decoration: BoxDecoration(
                color: tokens.panelMuted,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: tokens.panelBorder),
              ),
              child: Column(
                children: _locationSuggestions.map((item) {
                  return ListTile(
                    dense: true,
                    title: Text(
                      item.label,
                      style: TextStyle(color: tokens.text),
                    ),
                    onTap: () {
                      setState(() {
                        _locationCtrl.text = item.label;
                        _locationOpen = false;
                      });
                    },
                  );
                }).toList(),
              ),
            ),
          const SizedBox(height: 10),
          Text(
            'Visibility',
            style: TextStyle(
              color: tokens.text,
              fontWeight: FontWeight.w600,
              fontSize: 13,
            ),
          ),
          const SizedBox(height: 8),
          ...LivestreamVisibility.values.map(
            (visibility) => GestureDetector(
              onTap: () => setState(() => _visibility = visibility),
              child: Container(
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsets.symmetric(
                  horizontal: 14,
                  vertical: 12,
                ),
                decoration: BoxDecoration(
                  color: _visibility == visibility
                      ? tokens.primary.withValues(alpha: 0.16)
                      : tokens.panel,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: _visibility == visibility
                        ? tokens.primary
                        : tokens.panelBorder,
                  ),
                ),
                child: Row(
                  children: [
                    Icon(
                      _visibilityIcon(visibility),
                      color: _visibility == visibility
                          ? tokens.primary
                          : tokens.textMuted,
                      size: 20,
                    ),
                    const SizedBox(width: 12),
                    Text(
                      visibility.label,
                      style: TextStyle(
                        color: _visibility == visibility
                            ? tokens.text
                            : tokens.textMuted,
                        fontSize: 14,
                        fontWeight: _visibility == visibility
                            ? FontWeight.w600
                            : FontWeight.w400,
                      ),
                    ),
                    const Spacer(),
                    if (_visibility == visibility)
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
      ),
    );
  }

  Widget _buildLatencyCard(AppSemanticColors tokens) {
    return _panel(
      tokens,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _sectionTitle(tokens, 'Livestream quality & delay'),
          const SizedBox(height: 6),
          Text(
            'For mobile sharpness, quality-first modes allow more viewer delay.',
            style: TextStyle(color: tokens.textMuted, fontSize: 12.5),
          ),
          const SizedBox(height: 10),
          _latencyOption(
            tokens,
            mode: LivestreamLatencyMode.adaptive,
            title: 'Quality priority',
            note: 'Best sharpness, suitable for viewer delay around 30s.',
          ),
          const SizedBox(height: 8),
          _latencyOption(
            tokens,
            mode: LivestreamLatencyMode.balanced,
            title: 'Balanced quality',
            note: 'Good quality with lower delay around 15s.',
          ),
          const SizedBox(height: 8),
          _latencyOption(
            tokens,
            mode: LivestreamLatencyMode.low,
            title: 'Low latency',
            note: 'Minimum delay, quality may drop on unstable networks.',
          ),
        ],
      ),
    );
  }

  Widget _buildPermissionCard(AppSemanticColors tokens) {
    return _panel(
      tokens,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _sectionTitle(tokens, 'Permission setup'),
          const SizedBox(height: 8),
          _permissionRow(
            tokens,
            label: 'Microphone',
            value: _permissionLabel(_microphonePermission),
            granted: _microphonePermission.isGranted,
          ),
          const SizedBox(height: 8),
          OutlinedButton(
            onPressed: _permissionBusy == null
                ? _requestMicrophonePermission
                : null,
            child: Text(
              _permissionBusy == 'microphone'
                  ? 'Requesting...'
                  : 'Allow microphone',
            ),
          ),
          if (_sourceMode == LivestreamSourceMode.camera) ...[
            const SizedBox(height: 12),
            _permissionRow(
              tokens,
              label: 'Camera',
              value: _permissionLabel(_cameraPermission),
              granted: _cameraPermission.isGranted,
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: (_cameraLoading || _permissionBusy != null)
                        ? null
                        : _loadCameras,
                    icon: const Icon(Icons.camera_alt_outlined),
                    label: Text(
                      _cameraLoading ? 'Loading camera...' : 'Enable camera',
                    ),
                  ),
                ),
              ],
            ),
          ],
          if ((_sourceMode == LivestreamSourceMode.camera &&
                  _cameraPermission.isPermanentlyDenied) ||
              _microphonePermission.isPermanentlyDenied)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Align(
                alignment: Alignment.centerLeft,
                child: TextButton.icon(
                  onPressed: openAppSettings,
                  icon: const Icon(Icons.settings_outlined, size: 16),
                  label: const Text('Open app settings'),
                ),
              ),
            ),
          if (_sourceMode == LivestreamSourceMode.camera &&
              _cameraError != null)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(
                _cameraError!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ),
          if (_sourceMode == LivestreamSourceMode.camera &&
              _cameraDevices.isNotEmpty) ...[
            const SizedBox(height: 10),
            DropdownButtonFormField<CameraDescription>(
              initialValue: _selectedCamera,
              decoration: const InputDecoration(
                labelText: 'Camera source',
                border: OutlineInputBorder(),
                isDense: true,
              ),
              items: _cameraDevices.map((camera) {
                final lensLabel =
                    camera.lensDirection == CameraLensDirection.front
                    ? 'Front camera'
                    : camera.lensDirection == CameraLensDirection.back
                    ? 'Back camera'
                    : camera.name;
                return DropdownMenuItem<CameraDescription>(
                  value: camera,
                  child: Text(lensLabel),
                );
              }).toList(),
              onChanged: (next) async {
                if (next == null) return;
                setState(() => _selectedCamera = next);
                await _initializeCamera(next);
              },
            ),
          ],
          if (_sourceMode == LivestreamSourceMode.camera) ...[
            const SizedBox(height: 10),
            AspectRatio(
              aspectRatio: 9 / 16,
              child: ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: Container(
                  decoration: BoxDecoration(
                    color: tokens.panelMuted,
                    border: Border.all(color: tokens.panelBorder),
                  ),
                  child: _cameraReady
                      ? _buildCameraPreview()
                      : Center(
                          child: Text(
                            'Camera preview is not ready',
                            style: TextStyle(color: tokens.textMuted),
                          ),
                        ),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _permissionRow(
    AppSemanticColors tokens, {
    required String label,
    required String value,
    required bool granted,
  }) {
    return Row(
      children: [
        Text(
          label,
          style: TextStyle(color: tokens.text, fontWeight: FontWeight.w600),
        ),
        const Spacer(),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(999),
            color: granted
                ? Colors.green.withValues(alpha: 0.16)
                : Colors.red.withValues(alpha: 0.12),
            border: Border.all(
              color: granted
                  ? Colors.green.withValues(alpha: 0.5)
                  : Colors.red.withValues(alpha: 0.4),
            ),
          ),
          child: Text(
            value,
            style: TextStyle(
              color: granted ? Colors.green.shade300 : Colors.red.shade300,
              fontSize: 12,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildCameraPreview() {
    final controller = _cameraCtrl!;

    final rawSize = controller.value.previewSize;
    final previewContent = rawSize == null
        ? CameraPreview(controller)
        : FittedBox(
            fit: BoxFit.cover,
            child: SizedBox(
              width: rawSize.height,
              height: rawSize.width,
              child: CameraPreview(controller),
            ),
          );

    return ClipRect(child: previewContent);
  }

  Widget _latencyOption(
    AppSemanticColors tokens, {
    required LivestreamLatencyMode mode,
    required String title,
    required String note,
  }) {
    final active = _latencyMode == mode;
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: () => setState(() => _latencyMode = mode),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: active
              ? tokens.primarySoft.withValues(alpha: 0.22)
              : tokens.panelMuted,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: active ? tokens.primary : tokens.panelBorder,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              title,
              style: TextStyle(color: tokens.text, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 4),
            Text(
              note,
              style: TextStyle(color: tokens.textMuted, fontSize: 12.5),
            ),
          ],
        ),
      ),
    );
  }

  Widget _panel(AppSemanticColors tokens, {required Widget child}) {
    return Container(
      decoration: BoxDecoration(
        color: tokens.panel,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: tokens.panelBorder),
      ),
      padding: const EdgeInsets.all(12),
      child: child,
    );
  }

  Widget _sectionTitle(AppSemanticColors tokens, String text) {
    return Text(
      text,
      style: TextStyle(
        color: tokens.text,
        fontSize: 14.5,
        fontWeight: FontWeight.w700,
      ),
    );
  }

  Widget _inputField({
    required TextEditingController controller,
    required String label,
    required String hint,
    int maxLines = 1,
    ValueChanged<String>? onChanged,
  }) {
    return TextField(
      controller: controller,
      maxLines: maxLines,
      onChanged: onChanged,
      decoration: InputDecoration(
        labelText: label,
        hintText: hint,
        border: const OutlineInputBorder(),
        isDense: true,
      ),
    );
  }

  Widget _buildMentionDropdown(AppSemanticColors tokens) {
    return Container(
      margin: const EdgeInsets.only(top: 6),
      decoration: BoxDecoration(
        color: tokens.panelMuted,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: tokens.panelBorder),
      ),
      child: _mentionLoading
          ? Padding(
              padding: const EdgeInsets.all(12),
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
              itemBuilder: (_, index) {
                final suggestion = _mentionSuggestions[index];
                return InkWell(
                  onTap: () => _insertMention(suggestion),
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
                          backgroundImage: suggestion.avatarUrl != null
                              ? NetworkImage(suggestion.avatarUrl!)
                              : null,
                          child: suggestion.avatarUrl == null
                              ? Text(
                                  suggestion.username
                                      .substring(0, 1)
                                      .toUpperCase(),
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
                            if (suggestion.displayName != null)
                              Text(
                                suggestion.displayName!,
                                style: TextStyle(
                                  color: tokens.text,
                                  fontSize: 13,
                                ),
                              ),
                            Text(
                              '@${suggestion.username}',
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

  IconData _visibilityIcon(LivestreamVisibility visibility) {
    switch (visibility) {
      case LivestreamVisibility.public:
        return Icons.public_rounded;
      case LivestreamVisibility.followers:
        return Icons.people_outline_rounded;
      case LivestreamVisibility.private:
        return Icons.lock_outline_rounded;
    }
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
