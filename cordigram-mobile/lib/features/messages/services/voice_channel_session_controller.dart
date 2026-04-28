import 'dart:async';
import 'dart:io' show Platform;

import 'package:flutter/foundation.dart';
import 'package:flutter_background/flutter_background.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart' as webrtc;
import 'package:livekit_client/livekit_client.dart';

import '../models/server_models.dart';
import 'voice_livekit_service.dart';

class VoiceChannelSessionController extends ChangeNotifier {
  VoiceChannelSessionController._();

  static final VoiceChannelSessionController instance =
      VoiceChannelSessionController._();

  Room? _room;
  EventsListener<RoomEvent>? _listener;
  bool _connecting = false;
  String? _error;
  String? _serverId;
  String? _channelId;
  String? _serverName;
  String? _channelName;
  bool _micEnabled = true;
  bool _soundEnabled = true;
  bool _cameraEnabled = false;
  bool _screenShareEnabled = false;
  bool _screenShareBusy = false;
  List<Participant> _participants = const [];

  bool get connecting => _connecting;
  bool get active => _room != null;
  String? get error => _error;
  String? get serverId => _serverId;
  String? get channelId => _channelId;
  String? get serverName => _serverName;
  String? get channelName => _channelName;
  bool get micEnabled => _micEnabled;
  bool get soundEnabled => _soundEnabled;
  bool get cameraEnabled => _cameraEnabled;
  bool get screenShareEnabled => _screenShareEnabled;
  List<Participant> get participants => List.unmodifiable(_participants);

  bool isInChannel(String serverId, String channelId) =>
      _serverId == serverId && _channelId == channelId && _room != null;

  String get roomName {
    final sid = _serverId ?? '';
    final cid = _channelId ?? '';
    if (sid.isEmpty || cid.isEmpty) return '';
    return 'voice-$sid-$cid';
  }

  Future<void> join({
    required ServerSummary server,
    required ServerChannel channel,
    required String participantName,
  }) async {
    if (_connecting) return;
    if (isInChannel(server.id, channel.id)) return;
    if (_room != null) {
      await leave();
    }
    _connecting = true;
    _error = null;
    _serverId = server.id;
    _channelId = channel.id;
    _serverName = server.name;
    _channelName = channel.name;
    notifyListeners();
    try {
      final creds = await VoiceLivekitService.getTokenBundle(
        roomName: 'voice-${server.id}-${channel.id}',
        participantName: participantName,
      );
      final room = Room();
      final listener = room.createListener()
        ..on<ParticipantConnectedEvent>((_) => _refreshParticipants())
        ..on<ParticipantDisconnectedEvent>((_) => _refreshParticipants())
        ..on<TrackMutedEvent>((_) => _refreshParticipants())
        ..on<TrackUnmutedEvent>((_) => _refreshParticipants())
        ..on<LocalTrackPublishedEvent>((_) => _refreshParticipants())
        ..on<LocalTrackUnpublishedEvent>((_) => _refreshParticipants())
        ..on<TrackSubscribedEvent>((_) => _refreshParticipants())
        ..on<TrackUnsubscribedEvent>((_) => _refreshParticipants())
        ..on<RoomDisconnectedEvent>((_) {
          _error = 'Đã ngắt khỏi voice channel';
          _clearRoomOnly();
          notifyListeners();
        });
      await room.connect(
        creds['url']!,
        creds['token']!,
        connectOptions: const ConnectOptions(autoSubscribe: true),
      );
      await room.localParticipant?.setMicrophoneEnabled(true);
      _room = room;
      _listener = listener;
      _micEnabled = true;
      _soundEnabled = true;
      _cameraEnabled = false;
      _screenShareEnabled = false;
      _refreshParticipants();
    } catch (e) {
      _error = 'Không vào được voice channel: $e';
      await _disposeRoomResources();
    } finally {
      _connecting = false;
      notifyListeners();
    }
  }

  Future<void> leave() async {
    _error = null;
    _clearSessionMetadata();
    await _disposeRoomResources(disconnect: true);
    notifyListeners();
  }

  Future<void> toggleMic() async {
    final lp = _room?.localParticipant;
    if (lp == null) return;
    final next = !_micEnabled;
    await lp.setMicrophoneEnabled(next);
    _micEnabled = next;
    notifyListeners();
  }

  Future<void> setMicEnabled(bool enabled) async {
    final lp = _room?.localParticipant;
    if (lp == null) return;
    await lp.setMicrophoneEnabled(enabled);
    _micEnabled = enabled;
    notifyListeners();
  }

  Future<void> toggleSound() async {
    final room = _room;
    if (room == null) return;
    final next = !_soundEnabled;
    for (final remote in room.remoteParticipants.values) {
      for (final pub in remote.audioTrackPublications) {
        try {
          if (next) {
            await pub.enable();
          } else {
            await pub.disable();
          }
        } catch (_) {}
      }
    }
    _soundEnabled = next;
    notifyListeners();
  }

  Future<void> toggleCamera() async {
    final lp = _room?.localParticipant;
    if (lp == null) return;
    final next = !_cameraEnabled;
    await lp.setCameraEnabled(next);
    _cameraEnabled = next;
    notifyListeners();
  }

  Future<void> toggleScreenShare() async {
    final lp = _room?.localParticipant;
    if (lp == null || _screenShareBusy) return;
    final next = !_screenShareEnabled;
    _screenShareBusy = true;
    _error = null;
    notifyListeners();
    try {
      if (next && Platform.isAndroid) {
        // Android MediaProjection can crash without explicit preflight.
        final allowed = await webrtc.Helper.requestCapturePermission();
        if (allowed != true) {
          _error = 'Bạn chưa cấp quyền chia sẻ màn hình';
          return;
        }
        final fgReady = await _ensureAndroidScreenShareForegroundService();
        if (!fgReady) {
          _error = 'Không thể khởi tạo foreground service cho chia sẻ màn hình';
          return;
        }
      }
      final dynamic dynLp = lp;
      await dynLp.setScreenShareEnabled(next, captureScreenAudio: false);
      _screenShareEnabled = next;
      if (!next && Platform.isAndroid) {
        try {
          await FlutterBackground.disableBackgroundExecution();
        } catch (_) {}
      }
    } catch (e) {
      _error = 'Không chia sẻ màn hình được: $e';
    } finally {
      _screenShareBusy = false;
      notifyListeners();
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

  Future<void> _disposeRoomResources({bool disconnect = false}) async {
    final listener = _listener;
    final room = _room;
    _listener = null;
    _room = null;
    _participants = const [];
    final hadScreenShare = _screenShareEnabled;
    _micEnabled = true;
    _soundEnabled = true;
    _cameraEnabled = false;
    _screenShareEnabled = false;
    _screenShareBusy = false;
    if (hadScreenShare && Platform.isAndroid) {
      try {
        await FlutterBackground.disableBackgroundExecution();
      } catch (_) {}
    }
    if (listener != null) {
      await listener.dispose();
    }
    if (disconnect && room != null) {
      await room.disconnect();
    }
  }

  void _clearRoomOnly() {
    _listener = null;
    _room = null;
    _participants = const [];
    _micEnabled = true;
    _soundEnabled = true;
    _cameraEnabled = false;
    _screenShareEnabled = false;
    _clearSessionMetadata();
  }

  void _clearSessionMetadata() {
    _serverId = null;
    _channelId = null;
    _serverName = null;
    _channelName = null;
  }

  void _refreshParticipants() {
    final room = _room;
    if (room == null) return;
    final lp = room.localParticipant;
    _participants = <Participant>[
      if (lp != null) lp,
      ...room.remoteParticipants.values,
    ];
    _micEnabled = lp?.isMicrophoneEnabled() ?? false;
    _cameraEnabled =
        lp?.videoTrackPublications.any((pub) => !pub.muted) ?? false;
    _screenShareEnabled = lp?.videoTrackPublications.any(
          (pub) => pub.source == TrackSource.screenShareVideo && !pub.muted,
        ) ??
        false;
    notifyListeners();
  }
}
