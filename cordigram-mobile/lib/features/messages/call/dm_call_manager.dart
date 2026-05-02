import 'dart:async';

import 'package:flutter/material.dart';
import 'package:permission_handler/permission_handler.dart';

import '../../../core/services/auth_storage.dart';
import '../services/direct_messages_realtime_service.dart';
import '../services/direct_messages_service.dart';
import 'calls_api_service.dart';
import 'native_call_screen.dart';

/// App-wide call lifecycle manager for 1:1 direct-message calls.
///
/// Why this exists:
///   - The legacy logic only listened to `call-incoming` / `call-answer`
///     inside a single `MessageChatScreen` instance. If the user wasn't
///     already viewing that exact conversation, incoming rings were silently
///     dropped. This class listens once, globally, and drives the UI via a
///     [ChangeNotifier].
///   - It also owns outgoing-call timeouts, rejection auto-dismiss, and
///     interaction with the `CallsApiService` (single source of truth for
///     room + token), so screens only have to render state.
///
/// Web and backend are untouched; signaling is still Socket.IO
/// (`call-initiate` / `call-answer` / `call-rejected` / `call-ended`) and
/// media still rides on LiveKit, which means mobile ↔ web interop is free.
class DmCallManager extends ChangeNotifier {
  DmCallManager._();

  static final DmCallManager instance = DmCallManager._();

  static const Duration _outgoingTimeout = Duration(seconds: 40);
  static const Duration _incomingTimeout = Duration(seconds: 45);
  static const Duration _rejectedLinger = Duration(seconds: 2);
  static const String activeCallRouteName = '/dm-active-call';

  StreamSubscription<DmCallEvent>? _callSub;
  StreamSubscription<String>? _endedSub;
  bool _initialized = false;

  IncomingCallState? _incoming;
  OutgoingCallState? _outgoing;
  ActiveCallState? _active;
  Timer? _outgoingTimer;
  Timer? _incomingTimer;
  Timer? _rejectedTimer;
  bool _isCallMinimized = false;
  Offset _miniCallOffset = const Offset(16, 140);
  bool _activeMicEnabled = true;
  bool _activeSoundEnabled = true;
  Future<void> Function(bool enabled)? _setMicEnabledDelegate;
  Future<void> Function(bool enabled)? _setSoundEnabledDelegate;

  /// Cached display/username of the currently authenticated user. Fetched
  /// lazily (and after login via [onAuthChanged]) so we can pass a real
  /// `participantName` to LiveKit — otherwise the peer (web) sees a bland
  /// "Người dùng" label instead of the actual username.
  String? _myName;

  /// Navigator key used to push the native call screen from anywhere.
  GlobalKey<NavigatorState>? _navigatorKey;

  IncomingCallState? get incoming => _incoming;
  OutgoingCallState? get outgoing => _outgoing;
  ActiveCallState? get active => _active;
  bool get hasActiveCall => _active != null;
  bool get isCallMinimized => _isCallMinimized;
  Offset get miniCallOffset => _miniCallOffset;
  bool get activeMicEnabled => _activeMicEnabled;
  bool get activeSoundEnabled => _activeSoundEnabled;
  bool get hasBoundAudioControls =>
      _setMicEnabledDelegate != null && _setSoundEnabledDelegate != null;

  /// Display name for the signed-in user (for in-call self preview labels).
  String? get myDisplayName => _myName;

  /// Call once at app startup (after [AuthStorage.loadAll]) with the root
  /// navigator key. Safe to call multiple times — later calls are no-ops.
  Future<void> attach(GlobalKey<NavigatorState> navigatorKey) async {
    _navigatorKey = navigatorKey;
    if (_initialized) return;
    _initialized = true;

    // Socket is shared with DMs; `.connect()` is idempotent.
    await DirectMessagesRealtimeService.connect();
    _callSub = DirectMessagesRealtimeService.callEvents.listen(_onCallEvent);
    _endedSub =
        DirectMessagesRealtimeService.callEnded.listen(_onCallEnded);
    unawaited(_refreshMyName());
  }

  /// Explicit refresh when the auth token changes (login / logout) so the
  /// socket is reopened with the new bearer token.
  Future<void> onAuthChanged() async {
    if (!_initialized) return;
    await DirectMessagesRealtimeService.disconnect();
    _cancelTimers();
    _incoming = null;
    _outgoing = null;
    _active = null;
    _isCallMinimized = false;
    _activeMicEnabled = true;
    _activeSoundEnabled = true;
    _setMicEnabledDelegate = null;
    _setSoundEnabledDelegate = null;
    _myName = null;
    notifyListeners();
    final token = AuthStorage.accessToken;
    if (token != null && token.isNotEmpty) {
      await DirectMessagesRealtimeService.connect();
      unawaited(_refreshMyName());
    }
  }

  Future<void> _refreshMyName() async {
    try {
      final profile = await DirectMessagesService.getMyMessagingProfile();
      final display = (profile['displayName'] ?? '').toString().trim();
      final username = (profile['username'] ?? '').toString().trim();
      final pick = display.isNotEmpty
          ? display
          : (username.isNotEmpty ? username : null);
      if (pick != null) {
        _myName = pick;
      }
    } catch (_) {
      // Keep whatever we had cached; call flows will fall back gracefully.
    }
  }

  @override
  void dispose() {
    _cancelTimers();
    _callSub?.cancel();
    _endedSub?.cancel();
    super.dispose();
  }

  // ---------------------------------------------------------------------------
  // Public actions (invoked by UI)
  // ---------------------------------------------------------------------------

  /// Start an outbound call to [peerUserId]. Does nothing if a call is
  /// already active / ringing.
  Future<void> startCall({
    required String peerUserId,
    required String peerName,
    String? peerAvatarUrl,
    required bool video,
    String? myName,
  }) async {
    if (_active != null || _outgoing != null || _incoming != null) return;
    if ((AuthStorage.accessToken ?? '').isEmpty) {
      await AuthStorage.loadAll();
    }

    try {
      await _ensurePermissions(video: video);
    } catch (err) {
      _showSnack('$err');
      return;
    }

    // Make sure the socket is actually connected before we emit.
    await DirectMessagesRealtimeService.connect();

    // Refresh cached display name on-demand if we don't have one yet.
    if (_myName == null || _myName!.isEmpty) {
      await _refreshMyName();
    }
    final resolvedMyName = _resolveMyName(preferred: myName);

    DirectMessagesRealtimeService.initiateCall(
      receiverId: peerUserId,
      isVideo: video,
    );

    _outgoing = OutgoingCallState(
      peerUserId: peerUserId,
      peerName: peerName,
      peerAvatarUrl: peerAvatarUrl,
      video: video,
      myName: resolvedMyName,
      status: OutgoingCallStatus.calling,
    );
    _outgoingTimer?.cancel();
    _outgoingTimer = Timer(_outgoingTimeout, () {
      if (_outgoing?.status == OutgoingCallStatus.calling) {
        // Peer didn't pick up — tell them we're giving up, then close UI.
        DirectMessagesRealtimeService.endCall(peerUserId);
        _updateOutgoingStatus(OutgoingCallStatus.noAnswer);
        _scheduleOutgoingDismiss();
      }
    });
    notifyListeners();
  }

  /// User tapped "Cancel" on the outgoing popup.
  void cancelOutgoing() {
    final out = _outgoing;
    if (out == null) return;
    DirectMessagesRealtimeService.endCall(out.peerUserId);
    _cancelOutgoing();
  }

  /// User tapped "Accept" on the incoming popup.
  Future<void> acceptIncoming() async {
    final inc = _incoming;
    if (inc == null) return;
    try {
      await _ensurePermissions(video: inc.video);
    } catch (err) {
      _showSnack('$err');
      rejectIncoming();
      return;
    }

    if (_myName == null || _myName!.isEmpty) {
      await _refreshMyName();
    }
    final participantName = _resolveMyName(preferred: inc.myName);

    // Callee mints its own token + authoritative roomId via /livekit/*.
    // Then we relay that roomId to the caller in the `call-answer` payload
    // so both sides land in the same LiveKit room. (Room IDs are
    // deterministic from sorted user IDs.)
    final CallSession session;
    try {
      session = await CallsApiService.createDmCall(
        peerUserId: inc.callerUserId,
        participantName: participantName,
        video: inc.video,
      );
    } catch (err) {
      _showSnack('Không thể tham gia cuộc gọi: $err');
      rejectIncoming();
      return;
    }

    DirectMessagesRealtimeService.answerCall(inc.callerUserId, {
      'roomName': session.roomId,
    });

    _incomingTimer?.cancel();
    _incoming = null;
    _startActiveCall(
      session: session,
      peerUserId: inc.callerUserId,
      peerName: inc.callerName,
      peerAvatarUrl: inc.callerAvatarUrl,
      video: inc.video,
    );
  }

  /// User tapped "Decline" on the incoming popup.
  void rejectIncoming() {
    final inc = _incoming;
    if (inc == null) return;
    DirectMessagesRealtimeService.rejectCall(inc.callerUserId);
    _incomingTimer?.cancel();
    _incoming = null;
    notifyListeners();
  }

  /// Called by the native call screen when the user hangs up.
  Future<void> hangupActive() async {
    final act = _active;
    if (act == null) return;
    DirectMessagesRealtimeService.endCall(act.peerUserId);
    _active = null;
    _isCallMinimized = false;
    _activeMicEnabled = true;
    _activeSoundEnabled = true;
    _setMicEnabledDelegate = null;
    _setSoundEnabledDelegate = null;
    notifyListeners();
  }

  void bindActiveAudioControls({
    required bool micEnabled,
    required bool soundEnabled,
    required Future<void> Function(bool enabled) onSetMicEnabled,
    required Future<void> Function(bool enabled) onSetSoundEnabled,
  }) {
    _activeMicEnabled = micEnabled;
    _activeSoundEnabled = soundEnabled;
    _setMicEnabledDelegate = onSetMicEnabled;
    _setSoundEnabledDelegate = onSetSoundEnabled;
    notifyListeners();
  }

  void unbindActiveAudioControls() {
    _setMicEnabledDelegate = null;
    _setSoundEnabledDelegate = null;
    _activeMicEnabled = true;
    _activeSoundEnabled = true;
    notifyListeners();
  }

  void updateActiveAudioState({bool? micEnabled, bool? soundEnabled}) {
    var changed = false;
    if (micEnabled != null && micEnabled != _activeMicEnabled) {
      _activeMicEnabled = micEnabled;
      changed = true;
    }
    if (soundEnabled != null && soundEnabled != _activeSoundEnabled) {
      _activeSoundEnabled = soundEnabled;
      changed = true;
    }
    if (changed) {
      notifyListeners();
    }
  }

  Future<void> toggleActiveMic() async {
    final setMic = _setMicEnabledDelegate;
    if (_active == null || setMic == null) return;
    final next = !_activeMicEnabled;
    await setMic(next);
    _activeMicEnabled = next;
    notifyListeners();
  }

  Future<void> toggleActiveSound() async {
    final setSound = _setSoundEnabledDelegate;
    if (_active == null || setSound == null) return;
    final next = !_activeSoundEnabled;
    await setSound(next);
    _activeSoundEnabled = next;
    notifyListeners();
  }

  void minimizeActiveCall() {
    if (_active == null || _isCallMinimized) return;
    _isCallMinimized = true;
    notifyListeners();
  }

  void updateMiniCallOffset(Offset offset) {
    _miniCallOffset = offset;
    notifyListeners();
  }

  void restoreMinimizedCall() {
    if (_active == null) return;
    _isCallMinimized = false;
    notifyListeners();
    final navigator = _navigatorKey?.currentState;
    if (navigator == null) return;
    var found = false;
    navigator.popUntil((route) {
      if (route.settings.name == activeCallRouteName) {
        found = true;
        return true;
      }
      return route.isFirst;
    });
    if (!found) {
      _pushCallScreen();
    }
  }

  // ---------------------------------------------------------------------------
  // Socket event handling
  // ---------------------------------------------------------------------------

  Future<void> _onCallEvent(DmCallEvent event) async {
    switch (event.signal) {
      case 'incoming':
        _handleIncoming(event);
        break;
      case 'answer':
        await _handleAnswer(event);
        break;
      case 'rejected':
        _handleRejected(event);
        break;
      default:
        break;
    }
  }

  void _handleIncoming(DmCallEvent event) {
    if (_active != null) {
      // Busy — politely tell the caller we can't pick up.
      DirectMessagesRealtimeService.rejectCall(event.fromUserId);
      return;
    }
    // If we're already ringing the same person, just refresh; otherwise the
    // newer ring wins (matches web behavior).
    _incomingTimer?.cancel();
    final info = event.callerInfo ?? const <String, dynamic>{};
    // Kick off a best-effort profile refresh in the background so that by the
    // time the user picks up we have the real username to hand to LiveKit.
    if (_myName == null || _myName!.isEmpty) {
      unawaited(_refreshMyName());
    }
    _incoming = IncomingCallState(
      callerUserId: event.fromUserId,
      callerName: (info['displayName'] ?? info['username'] ?? 'Người dùng')
          .toString(),
      callerAvatarUrl: info['avatar']?.toString(),
      video: event.type == 'video',
      myName: _resolveMyName(),
    );
    _incomingTimer = Timer(_incomingTimeout, () {
      if (_incoming != null) {
        DirectMessagesRealtimeService.rejectCall(_incoming!.callerUserId);
        _incoming = null;
        notifyListeners();
      }
    });
    notifyListeners();
  }

  Future<void> _handleAnswer(DmCallEvent event) async {
    final out = _outgoing;
    if (out == null || out.peerUserId != event.fromUserId) return;
    if (_active != null) return;

    final roomName = event.payload?['sdpOffer']?['roomName']?.toString();
    if (roomName == null || roomName.isEmpty) return;

    _outgoingTimer?.cancel();

    if (_myName == null || _myName!.isEmpty) {
      await _refreshMyName();
    }
    final participantName = _resolveMyName(preferred: out.myName);

    final CallSession session;
    try {
      session = await CallsApiService.joinCall(
        roomId: roomName,
        participantName: participantName,
        video: out.video,
      );
    } catch (err) {
      _showSnack('Không mở được cuộc gọi: $err');
      _cancelOutgoing();
      return;
    }

    _outgoing = null;
    _startActiveCall(
      session: session,
      peerUserId: out.peerUserId,
      peerName: out.peerName,
      peerAvatarUrl: out.peerAvatarUrl,
      video: out.video,
    );
  }

  void _handleRejected(DmCallEvent event) {
    final out = _outgoing;
    if (out == null || out.peerUserId != event.fromUserId) return;
    _outgoingTimer?.cancel();
    _updateOutgoingStatus(OutgoingCallStatus.rejected);
    _scheduleOutgoingDismiss();
  }

  void _onCallEnded(String fromUserId) {
    var changed = false;
    if (_incoming?.callerUserId == fromUserId) {
      _incomingTimer?.cancel();
      _incoming = null;
      changed = true;
    }
    if (_outgoing?.peerUserId == fromUserId) {
      _cancelOutgoing(notify: false);
      changed = true;
    }
    if (_active?.peerUserId == fromUserId) {
      _active = null;
      _isCallMinimized = false;
      _activeMicEnabled = true;
      _activeSoundEnabled = true;
      _setMicEnabledDelegate = null;
      _setSoundEnabledDelegate = null;
      changed = true;
    }
    if (changed) notifyListeners();
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  void _startActiveCall({
    required CallSession session,
    required String peerUserId,
    required String peerName,
    required String? peerAvatarUrl,
    required bool video,
  }) {
    _active = ActiveCallState(
      session: session,
      peerUserId: peerUserId,
      peerName: peerName,
      peerAvatarUrl: peerAvatarUrl,
      video: video,
    );
    _isCallMinimized = false;
    _activeMicEnabled = true;
    _activeSoundEnabled = true;
    notifyListeners();
    _pushCallScreen();
  }

  void _pushCallScreen() {
    final key = _navigatorKey;
    if (key == null) return;
    final navigator = key.currentState;
    if (navigator == null) {
      // Navigator not yet mounted; retry on the next frame.
      WidgetsBinding.instance.addPostFrameCallback((_) => _pushCallScreen());
      return;
    }
    final act = _active;
    if (act == null) return;
    navigator.push<void>(
      MaterialPageRoute(
        settings: const RouteSettings(name: activeCallRouteName),
        fullscreenDialog: true,
        builder: (_) => NativeCallScreen(
          session: act.session,
          title: act.peerName.isNotEmpty ? act.peerName : 'Cuộc gọi',
          peerAvatarUrl: act.peerAvatarUrl,
          localDisplayName: _myName,
          onHangup: hangupActive,
        ),
      ),
    );
  }

  void _updateOutgoingStatus(OutgoingCallStatus status) {
    final current = _outgoing;
    if (current == null) return;
    _outgoing = current.copyWith(status: status);
    notifyListeners();
  }

  void _scheduleOutgoingDismiss() {
    _rejectedTimer?.cancel();
    _rejectedTimer = Timer(_rejectedLinger, () {
      if (_outgoing?.status != OutgoingCallStatus.calling) {
        _outgoing = null;
        notifyListeners();
      }
    });
  }

  void _cancelOutgoing({bool notify = true}) {
    _outgoingTimer?.cancel();
    _rejectedTimer?.cancel();
    _outgoing = null;
    if (notify) notifyListeners();
  }

  void _cancelTimers() {
    _outgoingTimer?.cancel();
    _incomingTimer?.cancel();
    _rejectedTimer?.cancel();
  }

  Future<void> _ensurePermissions({required bool video}) async {
    final mic = await Permission.microphone.request();
    if (!mic.isGranted) {
      throw Exception('Cần cấp quyền micro để thực hiện cuộc gọi');
    }
    if (video) {
      final cam = await Permission.camera.request();
      if (!cam.isGranted) {
        throw Exception('Cần cấp quyền camera cho video call');
      }
    }
  }

  void _showSnack(String message) {
    final ctx = _navigatorKey?.currentState?.overlay?.context;
    if (ctx == null) return;
    final messenger = ScaffoldMessenger.maybeOf(ctx);
    messenger?.showSnackBar(SnackBar(content: Text(message)));
  }

  /// Resolves the name we send to LiveKit as the `participantName`. Order of
  /// preference: explicit argument → cached profile name → short userId →
  /// literal "Người dùng" (only as a last resort, never happy to show this).
  String _resolveMyName({String? preferred}) {
    final p = preferred?.trim() ?? '';
    if (p.isNotEmpty && p != 'Người dùng') return p;
    final cached = _myName?.trim() ?? '';
    if (cached.isNotEmpty) return cached;
    final uid = DirectMessagesService.currentUserId;
    if (uid != null && uid.isNotEmpty) {
      return uid.length > 6 ? 'user-${uid.substring(uid.length - 6)}' : uid;
    }
    return 'Người dùng';
  }

  /// Best-effort user id lookup used by UI layers that want to filter.
  String? get myUserId => DirectMessagesService.currentUserId;
}

// ---------------------------------------------------------------------------
// State models
// ---------------------------------------------------------------------------

enum OutgoingCallStatus { calling, rejected, noAnswer }

@immutable
class OutgoingCallState {
  const OutgoingCallState({
    required this.peerUserId,
    required this.peerName,
    required this.peerAvatarUrl,
    required this.video,
    required this.myName,
    required this.status,
  });

  final String peerUserId;
  final String peerName;
  final String? peerAvatarUrl;
  final bool video;
  final String myName;
  final OutgoingCallStatus status;

  OutgoingCallState copyWith({OutgoingCallStatus? status}) => OutgoingCallState(
        peerUserId: peerUserId,
        peerName: peerName,
        peerAvatarUrl: peerAvatarUrl,
        video: video,
        myName: myName,
        status: status ?? this.status,
      );
}

@immutable
class IncomingCallState {
  const IncomingCallState({
    required this.callerUserId,
    required this.callerName,
    required this.callerAvatarUrl,
    required this.video,
    required this.myName,
  });

  final String callerUserId;
  final String callerName;
  final String? callerAvatarUrl;
  final bool video;
  final String myName;
}

@immutable
class ActiveCallState {
  const ActiveCallState({
    required this.session,
    required this.peerUserId,
    required this.peerName,
    required this.peerAvatarUrl,
    required this.video,
  });

  final CallSession session;
  final String peerUserId;
  final String peerName;
  final String? peerAvatarUrl;
  final bool video;
}
