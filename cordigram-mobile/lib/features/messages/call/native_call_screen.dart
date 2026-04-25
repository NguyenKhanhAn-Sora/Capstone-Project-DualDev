import 'dart:async';
import 'dart:io' show Platform;

import 'package:flutter/material.dart';
import 'package:flutter_background/flutter_background.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart' as webrtc;
import 'package:livekit_client/livekit_client.dart';
import 'package:permission_handler/permission_handler.dart';

import '../message_home_screen.dart';
import 'calls_api_service.dart';
import 'dm_call_manager.dart';

/// Native Flutter call screen backed by the `livekit_client` SDK.
///
/// Keeps the user inside the Flutter app — no WebView, no browser session.
/// Interoperates with the web app (`cordigram-web`) because both clients
/// talk to the same LiveKit server against a deterministic DM room id.
class NativeCallScreen extends StatefulWidget {
  const NativeCallScreen({
    super.key,
    required this.session,
    required this.title,
    required this.onHangup,
    this.peerAvatarUrl,
  });

  final CallSession session;
  final String title;
  final String? peerAvatarUrl;

  /// Called exactly once when the user leaves the call (hangup, remote left,
  /// or fatal error). The parent should notify the peer over the signaling
  /// socket (`call-end`) inside this callback.
  final Future<void> Function() onHangup;

  @override
  State<NativeCallScreen> createState() => _NativeCallScreenState();
}

class _NativeCallScreenState extends State<NativeCallScreen> {
  // Grace window after `room.connect()` during which we ignore
  // `ParticipantDisconnected` events. This is specifically to survive the
  // brief disconnect ↔ reconnect cycle that web peers go through in React 18
  // StrictMode / slow networks when joining a LiveKit room.
  static const Duration _initialGrace = Duration(seconds: 5);
  // Once at least one remote has joined, any transient disconnect must
  // persist for this long before we actually treat the call as ended.
  static const Duration _remoteLeaveGrace = Duration(seconds: 3);

  Room? _room;
  EventsListener<RoomEvent>? _roomListener;
  bool _connecting = true;
  String? _fatalError;
  bool _micEnabled = true;
  bool _camEnabled = false;
  bool _screenShareEnabled = false;
  bool _screenShareBusy = false;
  bool _shownShareScopeHint = false;
  bool _isVideoCall = false;
  bool _frontCamera = true;
  bool _speakerOn = true;
  bool _hangupCalled = false;
  bool _isMinimizeNavigating = false;
  DateTime? _connectedAt;
  Timer? _remoteLeavePending;

  List<Participant> _participants = const [];
  VoidCallback? _mgrListener;

  @override
  void initState() {
    super.initState();
    _isVideoCall = widget.session.isVideo;
    _camEnabled = widget.session.isVideo;
    // Speaker control must match actual audio: start "on" for both voice and
    // video so the icon is not shown muted until the user taps mute.
    _speakerOn = true;
    _mgrListener = _onManagerChanged;
    DmCallManager.instance.addListener(_mgrListener!);
    _connect();
  }

  /// Listen for externally-driven call termination (peer socket `call-ended`
  /// / manager-level hangup). When the manager clears its active call, we
  /// must tear down the LiveKit room and pop this screen — otherwise the UI
  /// would linger after the other side ended the call.
  void _onManagerChanged() {
    if (!mounted || _hangupCalled) return;
    if (DmCallManager.instance.active == null) {
      _teardownAndPop();
    }
  }

  Future<void> _connect() async {
    try {
      final room = Room(
        roomOptions: RoomOptions(
          adaptiveStream: true,
          dynacast: true,
          defaultVideoPublishOptions: const VideoPublishOptions(
            simulcast: true,
          ),
          defaultAudioCaptureOptions: const AudioCaptureOptions(
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          ),
        ),
      );

      final listener = room.createListener()
        ..on<RoomDisconnectedEvent>((_) => _handleRemoteLeft())
        ..on<ParticipantConnectedEvent>((_) {
          _remoteLeavePending?.cancel();
          _remoteLeavePending = null;
          _refreshParticipants();
          unawaited(_applySpeakerState(_speakerOn));
        })
        ..on<ParticipantDisconnectedEvent>((event) {
          _refreshParticipants();
          if (room.remoteParticipants.isEmpty) {
            _scheduleRemoteLeaveIfPersistent(room);
          }
        })
        ..on<TrackSubscribedEvent>((_) => _refreshParticipants())
        ..on<TrackSubscribedEvent>((_) {
          unawaited(_applySpeakerState(_speakerOn));
        })
        ..on<TrackUnsubscribedEvent>((_) => _refreshParticipants())
        ..on<TrackMutedEvent>((_) => _refreshParticipants())
        ..on<TrackUnmutedEvent>((_) => _refreshParticipants())
        ..on<LocalTrackPublishedEvent>((_) => _refreshParticipants())
        ..on<LocalTrackUnpublishedEvent>((_) => _refreshParticipants());

      await room.connect(
        widget.session.serverUrl,
        widget.session.callToken,
        connectOptions: const ConnectOptions(autoSubscribe: true),
      );

      await room.localParticipant?.setMicrophoneEnabled(true);
      if (widget.session.isVideo) {
        await room.localParticipant?.setCameraEnabled(true);
      }

      try {
        await Hardware.instance.setSpeakerphoneOn(_speakerOn);
      } catch (_) {}
      await _applySpeakerState(_speakerOn);

      if (!mounted) {
        await room.disconnect();
        await listener.dispose();
        return;
      }

      setState(() {
        _room = room;
        _roomListener = listener;
        _connecting = false;
        _connectedAt = DateTime.now();
      });
      _refreshParticipants();
    } catch (err) {
      if (!mounted) return;
      setState(() {
        _connecting = false;
        _fatalError = 'Không thể kết nối cuộc gọi: $err';
      });
    }
  }

  void _refreshParticipants() {
    if (!mounted) return;
    final room = _room;
    if (room == null) return;
    final lp = room.localParticipant;
    final localSharing = lp != null &&
        lp.videoTrackPublications.any(
          (pub) => pub.source == TrackSource.screenShareVideo && !pub.muted,
        );
    setState(() {
      _participants = <Participant>[
        if (room.localParticipant != null) room.localParticipant!,
        ...room.remoteParticipants.values,
      ];
      _screenShareEnabled = localSharing;
    });
  }

  Future<void> _toggleMic() async {
    final lp = _room?.localParticipant;
    if (lp == null) return;
    final next = !_micEnabled;
    await lp.setMicrophoneEnabled(next);
    if (mounted) setState(() => _micEnabled = next);
  }

  /// Voice call: flip to a video call by enabling the camera.
  /// Video call: toggle local camera on/off.
  Future<void> _toggleCamera() async {
    final lp = _room?.localParticipant;
    if (lp == null) return;

    if (!_isVideoCall) {
      final cam = await Permission.camera.request();
      if (!cam.isGranted) {
        _showSnack('Cần cấp quyền camera để bật video');
        return;
      }
      try {
        await lp.setCameraEnabled(true);
        if (mounted) {
          setState(() {
            _isVideoCall = true;
            _camEnabled = true;
          });
        }
      } catch (err) {
        _showSnack('Không bật được camera: $err');
      }
      return;
    }

    final next = !_camEnabled;
    try {
      await lp.setCameraEnabled(next);
      if (mounted) setState(() => _camEnabled = next);
    } catch (_) {}
  }

  Future<void> _flipCamera() async {
    final lp = _room?.localParticipant;
    if (lp == null || !_camEnabled) return;
    final track = lp.videoTrackPublications
        .map((p) => p.track)
        .whereType<LocalVideoTrack>()
        .firstOrNull;
    if (track == null) return;
    try {
      // livekit_client 2.x: `setCameraPosition` is the public, cross-platform
      // way to flip between the front/back lens. Passing raw 'user' / 'environment'
      // strings to `switchCamera` (which expects a deviceId) is a no-op and was
      // the reason the flip button silently did nothing before.
      final next = _frontCamera ? CameraPosition.back : CameraPosition.front;
      await track.setCameraPosition(next);
      if (mounted) setState(() => _frontCamera = !_frontCamera);
    } catch (err) {
      _showSnack('Không đổi được camera: $err');
    }
  }

  Future<void> _toggleSpeaker() async {
    final next = !_speakerOn;
    try {
      await Hardware.instance.setSpeakerphoneOn(next);
      await _applySpeakerState(next);
      if (mounted) setState(() => _speakerOn = next);
    } catch (_) {}
  }

  Future<void> _applySpeakerState(bool on) async {
    final room = _room;
    if (room == null) return;
    for (final remote in room.remoteParticipants.values) {
      for (final pub in remote.audioTrackPublications) {
        try {
          if (on) {
            await pub.enable();
          } else {
            await pub.disable();
          }
        } catch (_) {}
      }
    }
  }

  Future<bool> _ensureAndroidScreenShareForegroundService() async {
    if (!Platform.isAndroid) return true;
    try {
      final androidConfig = FlutterBackgroundAndroidConfig(
        notificationTitle: 'Cordigram đang chia sẻ màn hình',
        notificationText: 'Nhấn để quay lại cuộc gọi',
        notificationImportance: AndroidNotificationImportance.normal,
        notificationIcon: const AndroidResource(
          name: 'ic_launcher',
          defType: 'mipmap',
        ),
      );
      final initialized = await FlutterBackground.initialize(
        androidConfig: androidConfig,
      );
      if (!initialized) return false;
      return await FlutterBackground.enableBackgroundExecution();
    } catch (_) {
      return false;
    }
  }

  Future<void> _toggleScreenShare() async {
    final lp = _room?.localParticipant;
    if (lp == null || _screenShareBusy) return;
    final next = !_screenShareEnabled;
    if (mounted) {
      setState(() => _screenShareBusy = true);
    } else {
      _screenShareBusy = true;
    }
    try {
      // On Android, explicit capture permission preflight avoids native crashes
      // when user accepts the picker but projection session is not initialized.
      if (next && Platform.isAndroid) {
        if (!_shownShareScopeHint) {
          _shownShareScopeHint = true;
          _showSnack(
            'Trên mobile chỉ hỗ trợ chia sẻ màn hình/app, không hỗ trợ chia sẻ theo từng tab như web.',
          );
        }
        // API 34+: MediaProjection intent must run before the mediaProjection
        // foreground service starts, then LiveKit may begin capture (see
        // livekit/client-sdk-flutter#542).
        final allowed = await webrtc.Helper.requestCapturePermission();
        if (allowed != true) {
          _showSnack('Bạn chưa cấp quyền chia sẻ màn hình');
          return;
        }
        final fgReady = await _ensureAndroidScreenShareForegroundService();
        if (!fgReady) {
          _showSnack('Không thể khởi tạo foreground service cho chia sẻ màn hình');
          return;
        }
      }

      final dynamic dynLp = lp;
      await dynLp.setScreenShareEnabled(
        next,
        captureScreenAudio: false,
      );
      if (!next && Platform.isAndroid) {
        try {
          await FlutterBackground.disableBackgroundExecution();
        } catch (_) {}
      }
      if (mounted) setState(() => _screenShareEnabled = next);
    } catch (err) {
      _showSnack('Không chia sẻ màn hình được: $err');
    } finally {
      if (mounted) {
        setState(() => _screenShareBusy = false);
      } else {
        _screenShareBusy = false;
      }
    }
  }

  void _scheduleRemoteLeaveIfPersistent(Room room) {
    final connectedAt = _connectedAt;
    if (connectedAt != null &&
        DateTime.now().difference(connectedAt) < _initialGrace) {
      return;
    }
    _remoteLeavePending?.cancel();
    _remoteLeavePending = Timer(_remoteLeaveGrace, () {
      if (!mounted || _hangupCalled) return;
      if (room.remoteParticipants.isEmpty) {
        _handleRemoteLeft();
      }
    });
  }

  void _handleRemoteLeft() {
    if (!mounted || _hangupCalled) return;
    _hangup();
  }

  /// Full hangup: user-initiated. Tears down LiveKit, notifies the peer via
  /// the manager (which emits `call-end` over the socket), then pops.
  Future<void> _hangup() async {
    if (_hangupCalled) return;
    // Mark via setState so the enclosing PopScope re-renders with
    // `canPop: true` BEFORE we call Navigator.pop. Otherwise
    // PopScope(canPop: false) silently vetoes the pop and the call screen
    // stays visible after pressing the end-call button.
    if (mounted) {
      setState(() {
        _hangupCalled = true;
      });
    } else {
      _hangupCalled = true;
    }
    _remoteLeavePending?.cancel();
    _remoteLeavePending = null;
    try {
      await _roomListener?.dispose();
    } catch (_) {}
    try {
      await _room?.disconnect();
    } catch (_) {}
    try {
      await widget.onHangup();
    } catch (_) {}
    _popSelf();
  }

  /// Externally-triggered teardown (peer ended the call via socket). We do
  /// NOT call `widget.onHangup` here — the manager already knows the call is
  /// over; we just close the LiveKit room + screen.
  Future<void> _teardownAndPop() async {
    if (_hangupCalled) return;
    if (mounted) {
      setState(() {
        _hangupCalled = true;
      });
    } else {
      _hangupCalled = true;
    }
    _remoteLeavePending?.cancel();
    _remoteLeavePending = null;
    try {
      await _roomListener?.dispose();
    } catch (_) {}
    try {
      await _room?.disconnect();
    } catch (_) {}
    _popSelf();
  }

  /// Close the call screen. Uses `pop` (not `maybePop`) so we force-dismiss
  /// even if some other layer has transiently vetoed pops.
  void _popSelf() {
    if (!mounted) return;
    final nav = Navigator.of(context);
    final route = ModalRoute.of(context);
    if (route != null) {
      // When this call screen is minimized, another route (messages) sits on top.
      // `Navigator.pop()` would close that top route instead of this one.
      // Remove this specific call route directly to avoid leaving a ghost call UI.
      nav.removeRoute(route);
      return;
    }
    if (nav.canPop()) {
      nav.pop();
    }
  }

  void _showSnack(String message) {
    if (!mounted) return;
    ScaffoldMessenger.maybeOf(context)?.showSnackBar(
      SnackBar(content: Text(message)),
    );
  }

  @override
  void dispose() {
    if (_mgrListener != null) {
      DmCallManager.instance.removeListener(_mgrListener!);
    }
    _remoteLeavePending?.cancel();
    _remoteLeavePending = null;
    if (!_hangupCalled) {
      _hangupCalled = true;
      unawaited(_roomListener?.dispose());
      unawaited(_room?.disconnect());
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      // Once hangup has been initiated the route MUST allow popping —
      // otherwise Navigator.pop is vetoed and the screen stays stuck on
      // the "in call" UI after the user taps the end button. While the
      // call is live we still block accidental back-swipes / system back
      // and route them through _hangup instead.
      canPop: _hangupCalled,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        await _hangup();
      },
      child: Scaffold(
        backgroundColor: Colors.black,
        body: SafeArea(
          child: Stack(
            children: [
              Positioned.fill(child: _buildBody()),
              Positioned(
                top: 8,
                left: 8,
                right: 8,
                child: _CallHeader(
                  title: widget.title,
                  onMinimize: _minimizeCall,
                ),
              ),
              if (_isVideoCall && _camEnabled && _room != null)
                Positioned(
                  top: 16,
                  right: 16,
                  child: _FlipCameraFab(onTap: _flipCamera),
                ),
              Positioned(
                left: 0,
                right: 0,
                bottom: 16,
                child: _CallControls(
                  isVideo: _isVideoCall,
                  micEnabled: _micEnabled,
                  camEnabled: _camEnabled,
                  screenShareEnabled: _screenShareEnabled,
                  speakerOn: _speakerOn,
                  onToggleMic: _toggleMic,
                  onToggleCamera: _toggleCamera,
                  onToggleScreenShare: _toggleScreenShare,
                  onToggleSpeaker: _toggleSpeaker,
                  onHangup: _hangup,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _minimizeCall() async {
    if (_hangupCalled || !mounted || _isMinimizeNavigating) return;
    final mgr = DmCallManager.instance;
    if (mgr.active == null) return;
    if (mgr.isCallMinimized) return;
    mgr.minimizeActiveCall();
    _isMinimizeNavigating = true;
    try {
      await Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => const MessageHomeScreen()),
      );
    } finally {
      _isMinimizeNavigating = false;
    }
  }

  Widget _buildBody() {
    if (_connecting) {
      return const Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            CircularProgressIndicator(color: Colors.white),
            SizedBox(height: 12),
            Text(
              'Đang kết nối cuộc gọi...',
              style: TextStyle(color: Colors.white),
            ),
          ],
        ),
      );
    }
    if (_fatalError != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(
                Icons.error_outline_rounded,
                color: Colors.redAccent,
                size: 48,
              ),
              const SizedBox(height: 12),
              Text(
                _fatalError!,
                style: const TextStyle(color: Colors.white),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: _hangup,
                child: const Text('Đóng'),
              ),
            ],
          ),
        ),
      );
    }

    if (!_isVideoCall) {
      return _AudioCallBody(
        title: widget.title,
        avatarUrl: widget.peerAvatarUrl,
        participants: _participants,
      );
    }

    return _VideoCallBody(
      participants: _participants,
      peerName: widget.title,
      localScreenSharing: _screenShareEnabled,
    );
  }
}

class _CallHeader extends StatelessWidget {
  const _CallHeader({required this.title, required this.onMinimize});

  final String title;
  final Future<void> Function() onMinimize;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        IconButton(
          onPressed: () => onMinimize(),
          icon: const Icon(Icons.open_in_full_rounded, color: Colors.white),
          tooltip: 'Thu nhỏ cuộc gọi',
        ),
        Expanded(
          child: Text(
            title,
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 17,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
        const SizedBox(width: 48),
      ],
    );
  }
}

class _VideoCallBody extends StatelessWidget {
  const _VideoCallBody({
    required this.participants,
    required this.peerName,
    required this.localScreenSharing,
  });

  final List<Participant> participants;
  final String peerName;
  final bool localScreenSharing;

  @override
  Widget build(BuildContext context) {
    if (localScreenSharing) {
      // Guard view while sharing from mobile:
      // avoid rendering the live call scene inside the same captured screen,
      // which creates the recursive "hall of mirrors" effect on remote clients.
      return const _LocalShareGuardView();
    }

    Participant? local;
    final remotes = <Participant>[];
    for (final p in participants) {
      if (p is LocalParticipant) {
        local = p;
      } else {
        remotes.add(p);
      }
    }

    final remote = remotes.isNotEmpty ? remotes.first : null;
    final remoteHasScreen = _ParticipantTile.hasScreenShare(remote);
    final localHasScreen = _ParticipantTile.hasScreenShare(local);
    final remoteHasCamera = _ParticipantTile.hasCamera(remote);

    final mainParticipant = remoteHasScreen
        ? remote
        : localHasScreen
            ? local
            : remoteHasCamera
                ? remote
                : (remote ?? local);
    final mainPrefersScreen =
        remoteHasScreen || (localHasScreen && !remoteHasScreen);

    final pipParticipant = mainParticipant == remote ? local : remote;
    final showPip = pipParticipant != null &&
        (_ParticipantTile.hasCamera(pipParticipant) ||
            (mainParticipant == local && remote != null));

    return Stack(
      children: [
        Positioned.fill(
          child: _ParticipantTile(
            participant: mainParticipant,
            fallbackName: remotes.isEmpty ? 'Bạn' : peerName,
            preferScreenShare: mainPrefersScreen,
          ),
        ),
        if (showPip)
          Positioned(
            top: 72,
            right: 16,
            width: 110,
            height: 160,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: _ParticipantTile(
                participant: pipParticipant,
                fallbackName: pipParticipant == local ? 'Bạn' : peerName,
                compact: true,
              ),
            ),
          ),
      ],
    );
  }
}

class _LocalShareGuardView extends StatelessWidget {
  const _LocalShareGuardView();

  @override
  Widget build(BuildContext context) {
    return Container(
      color: Colors.black,
      child: SafeArea(
        minimum: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
        child: Center(
          child: SingleChildScrollView(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    Icons.screen_share_rounded,
                    color: Colors.white,
                    size: MediaQuery.sizeOf(context).shortestSide < 360 ? 44 : 54,
                  ),
                  const SizedBox(height: 14),
                  Text(
                    'Đang chia sẻ màn hình',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: MediaQuery.sizeOf(context).shortestSide < 360 ? 17 : 20,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Mở ứng dụng hoặc nội dung bạn muốn gửi. Khung cuộc gọi được ẩn để tránh hình lặp vô hạn khi đối phương xem.',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: const Color(0xFFB6C2DC),
                      fontSize: MediaQuery.sizeOf(context).shortestSide < 360 ? 13 : 14,
                      height: 1.35,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _AudioCallBody extends StatelessWidget {
  const _AudioCallBody({
    required this.title,
    required this.participants,
    this.avatarUrl,
  });

  final String title;
  final String? avatarUrl;
  final List<Participant> participants;

  @override
  Widget build(BuildContext context) {
    final connected = participants.any((p) => p is! LocalParticipant);
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          CircleAvatar(
            radius: 56,
            backgroundColor: const Color(0xFF1B2A4A),
            backgroundImage: (avatarUrl != null && avatarUrl!.isNotEmpty)
                ? NetworkImage(avatarUrl!)
                : null,
            child: (avatarUrl == null || avatarUrl!.isEmpty)
                ? Text(
                    title.isNotEmpty ? title.substring(0, 1).toUpperCase() : '?',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 40,
                      fontWeight: FontWeight.w700,
                    ),
                  )
                : null,
          ),
          const SizedBox(height: 18),
          Text(
            title,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 20,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            connected ? 'Đang trong cuộc gọi' : 'Đang kết nối...',
            style: const TextStyle(color: Color(0xFFB6C2DC)),
          ),
        ],
      ),
    );
  }
}

class _ParticipantTile extends StatelessWidget {
  const _ParticipantTile({
    required this.participant,
    required this.fallbackName,
    this.compact = false,
    this.preferScreenShare = false,
  });

  final Participant? participant;
  final String fallbackName;
  final bool compact;
  final bool preferScreenShare;

  static bool hasScreenShare(Participant? participant) {
    if (participant == null) return false;
    return participant.videoTrackPublications.any(
      (pub) => pub.source == TrackSource.screenShareVideo && !pub.muted,
    );
  }

  static bool hasCamera(Participant? participant) {
    if (participant == null) return false;
    return participant.videoTrackPublications.any(
      (pub) => pub.source == TrackSource.camera && !pub.muted,
    );
  }

  VideoTrack? _pickVideoTrack() {
    final p = participant;
    if (p == null) return null;
    VideoTrack? camera;
    VideoTrack? screen;
    for (final pub in p.videoTrackPublications) {
      final track = pub.track;
      if (track is! VideoTrack || pub.muted) continue;
      if (pub.source == TrackSource.screenShareVideo) {
        screen = track;
      } else if (pub.source == TrackSource.camera) {
        camera = track;
      }
    }
    return preferScreenShare ? (screen ?? camera) : (camera ?? screen);
  }

  @override
  Widget build(BuildContext context) {
    final track = _pickVideoTrack();
    if (track != null) {
      final isScreen = participant?.videoTrackPublications.any(
            (pub) => pub.track == track && pub.source == TrackSource.screenShareVideo,
          ) ==
          true;
      return Container(
        color: Colors.black,
        child: VideoTrackRenderer(
          track,
          fit: isScreen ? VideoViewFit.contain : VideoViewFit.cover,
        ),
      );
    }
    final name = participant?.name ?? participant?.identity ?? fallbackName;
    return Container(
      color: const Color(0xFF0F1B37),
      alignment: Alignment.center,
      child: CircleAvatar(
        radius: compact ? 24 : 44,
        backgroundColor: const Color(0xFF1B2A4A),
        child: Text(
          name.isNotEmpty ? name.substring(0, 1).toUpperCase() : '?',
          style: TextStyle(
            color: Colors.white,
            fontSize: compact ? 20 : 34,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
    );
  }
}

/// Exactly five controls, matching the web redesign:
///   - mic mute       (audio in)
///   - speaker mute   (audio out)
///   - screen share
///   - camera         (voice call → upgrade to video; video call → video on/off)
///   - end call
class _CallControls extends StatelessWidget {
  const _CallControls({
    required this.isVideo,
    required this.micEnabled,
    required this.camEnabled,
    required this.screenShareEnabled,
    required this.speakerOn,
    required this.onToggleMic,
    required this.onToggleCamera,
    required this.onToggleScreenShare,
    required this.onToggleSpeaker,
    required this.onHangup,
  });

  final bool isVideo;
  final bool micEnabled;
  final bool camEnabled;
  final bool screenShareEnabled;
  final bool speakerOn;
  final Future<void> Function() onToggleMic;
  final Future<void> Function() onToggleCamera;
  final Future<void> Function() onToggleScreenShare;
  final Future<void> Function() onToggleSpeaker;
  final Future<void> Function() onHangup;

  @override
  Widget build(BuildContext context) {
    final cameraIcon = !isVideo
        ? Icons.videocam_outlined
        : (camEnabled ? Icons.videocam_rounded : Icons.videocam_off_rounded);
    final cameraTooltip = !isVideo
        ? 'Bật video'
        : (camEnabled ? 'Tắt camera' : 'Bật camera');

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 12),
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.55),
        borderRadius: BorderRadius.circular(32),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        children: [
          _ControlButton(
            icon: micEnabled ? Icons.mic_rounded : Icons.mic_off_rounded,
            active: micEnabled,
            onTap: onToggleMic,
            tooltip: micEnabled ? 'Tắt micro' : 'Bật micro',
          ),
          _ControlButton(
            icon: speakerOn
                ? Icons.volume_up_rounded
                : Icons.volume_off_rounded,
            active: speakerOn,
            onTap: onToggleSpeaker,
            tooltip: speakerOn ? 'Tắt âm thanh' : 'Bật âm thanh',
          ),
          _ControlButton(
            icon: Icons.screen_share_rounded,
            active: screenShareEnabled,
            onTap: onToggleScreenShare,
            tooltip: screenShareEnabled
                ? 'Dừng chia sẻ màn hình'
                : 'Chia sẻ màn hình',
          ),
          _ControlButton(
            icon: cameraIcon,
            active: isVideo && camEnabled,
            onTap: onToggleCamera,
            tooltip: cameraTooltip,
          ),
          _ControlButton(
            icon: Icons.call_end_rounded,
            active: true,
            color: const Color(0xFFED4245),
            onTap: onHangup,
            tooltip: 'Kết thúc',
          ),
        ],
      ),
    );
  }
}

class _FlipCameraFab extends StatelessWidget {
  const _FlipCameraFab({required this.onTap});

  final Future<void> Function() onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.black.withValues(alpha: 0.45),
      shape: const CircleBorder(),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: () => onTap(),
        child: const Padding(
          padding: EdgeInsets.all(10),
          child: Icon(
            Icons.flip_camera_ios_rounded,
            color: Colors.white,
            size: 22,
          ),
        ),
      ),
    );
  }
}

class _ControlButton extends StatelessWidget {
  const _ControlButton({
    required this.icon,
    required this.active,
    required this.onTap,
    this.color,
    this.tooltip,
  });

  final IconData icon;
  final bool active;
  final Future<void> Function() onTap;
  final Color? color;
  final String? tooltip;

  @override
  Widget build(BuildContext context) {
    final bg = color ??
        (active ? const Color(0x33FFFFFF) : const Color(0x22FFFFFF));
    return Tooltip(
      message: tooltip ?? '',
      child: Material(
        color: bg,
        shape: const CircleBorder(),
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: () => onTap(),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Icon(icon, color: Colors.white, size: 26),
          ),
        ),
      ),
    );
  }
}

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull {
    final it = iterator;
    if (it.moveNext()) return it.current;
    return null;
  }
}
