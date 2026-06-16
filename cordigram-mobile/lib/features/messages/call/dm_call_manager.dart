import 'dart:async';

import 'package:flutter/material.dart';
import 'package:livekit_client/livekit_client.dart';
import 'package:permission_handler/permission_handler.dart';

import '../../../core/services/cordigram_notification_sounds.dart';
import '../../../core/services/auth_storage.dart';
import '../services/channel_messages_realtime_service.dart';
import '../services/direct_messages_realtime_service.dart';
import '../services/direct_messages_service.dart';
import 'calls_api_service.dart';
import '../services/voice_channel_session_controller.dart';
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
  StreamSubscription<DmCallBusyEvent>? _busySub;
  StreamSubscription<DmCallIncomingDismissEvent>? _dismissSub;
  StreamSubscription<List<DmCallSessionSyncItem>>? _sessionsSyncSub;
  StreamSubscription<DmCallMediaTransferredEvent>? _mediaTransferSub;
  Timer? _callHeartbeatTimer;
  final Map<String, String> _callIdsByPeer = {};
  List<DmCallSessionSyncItem> _lastSyncedSessions = const [];
  String? _focusedPeerUserId;
  bool _initialized = false;
  final Set<String> _openCallRoutes = {};

  IncomingCallState? _incoming;
  final Map<String, OutgoingCallState> _outgoings = {};
  final Map<String, Timer> _outgoingTimers = {};
  final Map<String, Timer> _rejectedTimers = {};
  final Map<String, ActiveCallState> _actives = {};
  Timer? _incomingTimer;
  bool _isCallMinimized = false;
  /// True = only the small corner chip is shown (full mini card hidden).
  bool _miniCallTuckedToCorner = false;
  Offset _miniCallOffset = const Offset(16, 140);
  bool _activeMicEnabled = true;
  bool _activeSoundEnabled = true;
  Future<void> Function(bool enabled)? _setMicEnabledDelegate;
  Future<void> Function(bool enabled)? _setSoundEnabledDelegate;

  /// Live tracks for the floating PiP while minimized (fed by [NativeCallScreen]).
  VideoTrack? _minimizedRemoteMainTrack;
  VideoTrack? _minimizedPipTrack;
  bool _minimizedRemoteMainIsScreenShare = false;
  bool _minimizedPipIsSharingPlaceholder = false;
  DateTime? _activeCallStartedAt;

  /// Cached display/username of the currently authenticated user. Fetched
  /// lazily (and after login via [onAuthChanged]) so we can pass a real
  /// `participantName` to LiveKit — otherwise the peer (web) sees a bland
  /// "Người dùng" label instead of the actual username.
  String? _myName;

  /// Navigator key used to push the native call screen from anywhere.
  GlobalKey<NavigatorState>? _navigatorKey;

  /// Root navigator from [attach] — use for [push]/[popUntil] when there is no
  /// suitable [BuildContext] under [MaterialApp.builder] (e.g. global overlays).
  NavigatorState? get rootNavigatorState => _navigatorKey?.currentState;

  IncomingCallState? get incoming => _incoming;
  OutgoingCallState? get outgoing =>
      _outgoings.isEmpty ? null : _outgoings.values.first;
  List<OutgoingCallState> get outgoings =>
      List<OutgoingCallState>.unmodifiable(_outgoings.values);
  ActiveCallState? get active {
    final focused = _focusedPeerUserId;
    if (focused != null && _actives.containsKey(focused)) {
      return _actives[focused];
    }
    return _actives.isEmpty ? null : _actives.values.first;
  }

  bool get hasActiveCall => _actives.isNotEmpty;

  bool isActiveCallForPeer(String peerUserId) =>
      _actives.containsKey(peerUserId);
  bool get isCallMinimized => _isCallMinimized;
  bool get isMiniCallTuckedToCorner => _miniCallTuckedToCorner;
  Offset get miniCallOffset => _miniCallOffset;
  bool get activeMicEnabled => _activeMicEnabled;
  bool get activeSoundEnabled => _activeSoundEnabled;
  bool get hasBoundAudioControls =>
      _setMicEnabledDelegate != null && _setSoundEnabledDelegate != null;

  /// Display name for the signed-in user (for in-call self preview labels).
  String? get myDisplayName => _myName;

  VideoTrack? get minimizedRemoteMainTrack => _minimizedRemoteMainTrack;
  VideoTrack? get minimizedPipTrack => _minimizedPipTrack;
  bool get minimizedRemoteMainIsScreenShare => _minimizedRemoteMainIsScreenShare;
  bool get minimizedPipIsSharingPlaceholder => _minimizedPipIsSharingPlaceholder;
  DateTime? get activeCallStartedAt => _activeCallStartedAt;

  void setMinimizedPipVideoTracks({
    VideoTrack? remoteMain,
    VideoTrack? pipTrack,
    bool remoteMainIsScreenShare = false,
    bool pipIsSharingPlaceholder = false,
  }) {
    _minimizedRemoteMainTrack = remoteMain;
    _minimizedPipTrack = pipTrack;
    _minimizedRemoteMainIsScreenShare = remoteMainIsScreenShare;
    _minimizedPipIsSharingPlaceholder = pipIsSharingPlaceholder;
    if (_isCallMinimized) notifyListeners();
  }

  void clearMinimizedPipVideoTracks() {
    _minimizedRemoteMainTrack = null;
    _minimizedPipTrack = null;
    _minimizedRemoteMainIsScreenShare = false;
    _minimizedPipIsSharingPlaceholder = false;
  }

  /// Call once at app startup (after [AuthStorage.loadAll]) with the root
  /// navigator key. Safe to call multiple times — later calls are no-ops.
  Future<void> attach(GlobalKey<NavigatorState> navigatorKey) async {
    _navigatorKey = navigatorKey;
    if (_initialized) return;
    _initialized = true;

    // Socket is shared with DMs; `.connect()` is idempotent.
    await DirectMessagesRealtimeService.connect();
    await _ensureCallEventSubscriptions();
    unawaited(_refreshMyName());
  }

  /// Explicit refresh when the auth token changes (login / logout) so the
  /// socket is reopened with the new bearer token.
  /// Shows incoming-call UI from an FCM tap when the app was backgrounded or
  /// killed; the socket may emit the same event shortly after — dedupe logic in
  /// [_handleIncoming] keeps the latest ring for that caller.
  void presentIncomingHintFromPush({
    required String callerUserId,
    String? displayName,
    String? username,
    String? avatarUrl,
    bool video = true,
    String? callId,
  }) {
    final dn = (displayName ?? '').trim();
    final un = (username ?? '').trim();
    _handleIncoming(
      DmCallEvent(
        fromUserId: callerUserId,
        signal: 'incoming',
        type: video ? 'video' : 'audio',
        callerInfo: <String, dynamic>{
          if (dn.isNotEmpty) 'displayName': dn,
          if (un.isNotEmpty) 'username': un,
          if (dn.isEmpty && un.isEmpty) 'username': 'Người dùng',
          if (avatarUrl != null && avatarUrl.trim().isNotEmpty)
            'avatar': avatarUrl.trim(),
        },
        payload: callId != null && callId.isNotEmpty
            ? <String, dynamic>{'callId': callId}
            : null,
      ),
    );
  }

  void _syncCallSounds() {
    if (_incoming != null) {
      unawaited(CordigramNotificationSounds.startIncomingCall());
      return;
    }
    final ringingOutgoing = _outgoings.values.any(
      (o) => o.status == OutgoingCallStatus.calling,
    );
    if (ringingOutgoing) {
      unawaited(CordigramNotificationSounds.startOutgoingCall());
    } else {
      unawaited(CordigramNotificationSounds.stopCallLoop());
    }
  }

  void _onIncomingDismiss(DmCallIncomingDismissEvent event) {
    if (_incoming?.callerUserId == event.peerId) {
      _incomingTimer?.cancel();
      _incoming = null;
      _syncCallSounds();
      notifyListeners();
    }
    // peerId is the remote party; only drop outbound if we were dialling them.
    final out = _outgoings[event.peerId];
    if (event.reason == 'answered_elsewhere' &&
        out != null &&
        out.status == OutgoingCallStatus.calling) {
      _cancelOutgoingFor(event.peerId);
    }
  }

  void _startCallHeartbeat(String? callId, String peerUserId) {
    if (callId != null && callId.isNotEmpty) {
      _callIdsByPeer[peerUserId] = callId;
    } else {
      _callIdsByPeer.remove(peerUserId);
    }
    _restartCallHeartbeatTimer();
  }

  void _restartCallHeartbeatTimer() {
    _callHeartbeatTimer?.cancel();
    _callHeartbeatTimer = null;
    if (_callIdsByPeer.isEmpty) return;
    void emitAll() {
      for (final id in _callIdsByPeer.values) {
        DirectMessagesRealtimeService.emitCallHeartbeat(id);
      }
    }

    emitAll();
    _callHeartbeatTimer = Timer.periodic(
      const Duration(seconds: 25),
      (_) => emitAll(),
    );
  }

  void _stopCallHeartbeatForPeer(String peerUserId) {
    _callIdsByPeer.remove(peerUserId);
    _restartCallHeartbeatTimer();
  }

  void _stopAllCallHeartbeats() {
    _callHeartbeatTimer?.cancel();
    _callHeartbeatTimer = null;
    _callIdsByPeer.clear();
  }

  Future<void> _ensureCallEventSubscriptions() async {
    if (_callSub == null) {
      _callSub = DirectMessagesRealtimeService.callEvents.listen(_onCallEvent);
    }
    if (_endedSub == null) {
      _endedSub =
          DirectMessagesRealtimeService.callEnded.listen(_onCallEnded);
    }
    if (_busySub == null) {
      _busySub = DirectMessagesRealtimeService.callBusy.listen(_onCallBusy);
    }
    if (_dismissSub == null) {
      _dismissSub = DirectMessagesRealtimeService.callIncomingDismiss
          .listen(_onIncomingDismiss);
    }
    if (_sessionsSyncSub == null) {
      _sessionsSyncSub = DirectMessagesRealtimeService.callSessionsSync
          .listen(_onCallSessionsSync);
    }
    if (_mediaTransferSub == null) {
      _mediaTransferSub = DirectMessagesRealtimeService.callMediaTransferred
          .listen(_onMediaTransferred);
    }
  }

  void _dismissActiveCallRoutes() {
    final navigator = _navigatorKey?.currentState;
    if (navigator != null) {
      navigator.popUntil((route) {
        final name = route.settings.name ?? '';
        return !name.startsWith(activeCallRouteName);
      });
    }
    _openCallRoutes.clear();
  }

  void _onCallSessionsSync(List<DmCallSessionSyncItem> sessions) {
    _lastSyncedSessions = sessions;
    const activeStates = {
      'ringing',
      'connecting',
      'connected',
      'reconnecting',
    };

    final ringingCalleePeers = sessions
        .where((s) => s.role == 'callee' && s.state == 'ringing')
        .map((s) => s.peerId)
        .toSet();
    if (_incoming != null &&
        !ringingCalleePeers.contains(_incoming!.callerUserId)) {
      _incomingTimer?.cancel();
      _incoming = null;
      _syncCallSounds();
    }

    var outgoingChanged = false;
    for (final peer in _outgoings.keys.toList()) {
      final hasSession = sessions.any(
        (s) =>
            s.peerId == peer &&
            (s.state == 'ringing' ||
                s.state == 'connected' ||
                s.state == 'connecting'),
      );
      if (!hasSession) {
        _cancelOutgoingFor(peer, notify: false);
        outgoingChanged = true;
      }
    }

    var activeChanged = false;
    for (final peer in _actives.keys.toList()) {
      DmCallSessionSyncItem? match;
      for (final session in sessions) {
        if (session.peerId == peer && activeStates.contains(session.state)) {
          match = session;
          break;
        }
      }
      if (match == null) {
        _stopCallHeartbeatForPeer(peer);
        _actives.remove(peer);
        _openCallRoutes.remove(peer);
        activeChanged = true;
        continue;
      }
      if (match.callId.isNotEmpty) {
        _startCallHeartbeat(match.callId, peer);
      }
    }

    if (_actives.isEmpty) {
      _focusedPeerUserId = null;
      _activeCallStartedAt = null;
      clearMinimizedPipVideoTracks();
      _isCallMinimized = false;
      _miniCallTuckedToCorner = false;
    } else if (_focusedPeerUserId == null ||
        !_actives.containsKey(_focusedPeerUserId)) {
      _focusedPeerUserId = _actives.keys.first;
      _activeCallStartedAt = _actives[_focusedPeerUserId!]?.startedAt;
    }

    if (outgoingChanged || activeChanged) {
      notifyListeners();
    } else if (_incoming == null && ringingCalleePeers.isEmpty) {
      // no-op
    }
  }

  Future<void> onAuthChanged() async {
    if (!_initialized) return;
    _stopAllCallHeartbeats();
    _dismissActiveCallRoutes();
    if (VoiceChannelSessionController.instance.active) {
      await VoiceChannelSessionController.instance.leave();
    }
    await _dismissSub?.cancel();
    _dismissSub = null;
    await _sessionsSyncSub?.cancel();
    _sessionsSyncSub = null;
    await _mediaTransferSub?.cancel();
    _mediaTransferSub = null;
    await _callSub?.cancel();
    _callSub = null;
    await _endedSub?.cancel();
    _endedSub = null;
    await _busySub?.cancel();
    _busySub = null;
    await DirectMessagesRealtimeService.disconnect();
    await ChannelMessagesRealtimeService.disconnect();
    _cancelTimers();
    _incoming = null;
    _outgoings.clear();
    for (final t in _outgoingTimers.values) {
      t.cancel();
    }
    _outgoingTimers.clear();
    for (final t in _rejectedTimers.values) {
      t.cancel();
    }
    _rejectedTimers.clear();
    _actives.clear();
    _focusedPeerUserId = null;
    _openCallRoutes.clear();
    _activeCallStartedAt = null;
    clearMinimizedPipVideoTracks();
    _isCallMinimized = false;
    _miniCallTuckedToCorner = false;
    _activeMicEnabled = true;
    _activeSoundEnabled = true;
    _setMicEnabledDelegate = null;
    _setSoundEnabledDelegate = null;
    _myName = null;
    unawaited(CordigramNotificationSounds.stopCallLoop());
    notifyListeners();
    final token = AuthStorage.accessToken;
    if (token != null && token.isNotEmpty) {
      await DirectMessagesRealtimeService.connect();
      await ChannelMessagesRealtimeService.connect();
      await _ensureCallEventSubscriptions();
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
    _busySub?.cancel();
    super.dispose();
  }

  // ---------------------------------------------------------------------------
  // Public actions (invoked by UI)
  // ---------------------------------------------------------------------------

  /// Continue an in-progress DM call on this device without ending it for the peer.
  Future<void> continueCallOnDevice(
    String peerUserId, {
    DmCallSessionSyncItem? session,
    String? peerName,
    String? peerAvatarUrl,
  }) async {
    final resolved = session ?? _findConnectedSession(peerUserId);
    final roomId = resolved?.roomId;
    if (roomId == null || roomId.isEmpty) {
      _showSnack('Không thể tiếp tục cuộc gọi trên thiết bị này.');
      return;
    }

    final video = (resolved?.type ?? 'audio') == 'video';
    try {
      await _ensurePermissions(video: video);
    } catch (err) {
      _showSnack('$err');
      return;
    }

    final claim = await DirectMessagesRealtimeService.claimCallMedia(peerUserId);
    final claimVideo = (claim['type'] ?? resolved?.type ?? 'audio').toString();
    final isVideo = claimVideo == 'video';
    final callId = (claim['callId'] ?? resolved?.callId ?? '').toString();

    if (_myName == null || _myName!.isEmpty) {
      await _refreshMyName();
    }
    final participantName = _resolveMyName();

    final CallSession callSession;
    try {
      callSession = await CallsApiService.joinCall(
        roomId: roomId,
        participantName: participantName,
        video: isVideo,
      );
    } catch (err) {
      _showSnack('Không mở được cuộc gọi: $err');
      return;
    }

    _incomingTimer?.cancel();
    _incoming = null;
    _outgoings.remove(peerUserId);
    _startActiveCall(
      session: callSession,
      peerUserId: peerUserId,
      peerName: peerName ?? peerUserId,
      peerAvatarUrl: peerAvatarUrl,
      video: isVideo,
      callId: callId.isEmpty ? null : callId,
    );
  }

  DmCallSessionSyncItem? _findConnectedSession(String peerUserId) {
    for (final session in _lastSyncedSessions) {
      if (session.peerId != peerUserId) continue;
      if (session.state == 'connected' ||
          session.state == 'connecting' ||
          session.state == 'reconnecting') {
        return session;
      }
    }
    return null;
  }

  /// Start an outbound call to [peerUserId]. Blocks only if already calling
  /// or in a call with the same peer.
  Future<void> startCall({
    required String peerUserId,
    required String peerName,
    String? peerAvatarUrl,
    required bool video,
    String? myName,
  }) async {
    if (_incoming != null) return;
    if (_outgoings.containsKey(peerUserId)) return;
    if (_actives.containsKey(peerUserId)) {
      _focusedPeerUserId = peerUserId;
      _pushCallScreen(peerUserId);
      notifyListeners();
      return;
    }
    final connected = _findConnectedSession(peerUserId);
    if (connected != null) {
      await continueCallOnDevice(
        peerUserId,
        session: connected,
        peerName: peerName,
        peerAvatarUrl: peerAvatarUrl,
      );
      return;
    }
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

    _outgoings[peerUserId] = OutgoingCallState(
      peerUserId: peerUserId,
      peerName: peerName,
      peerAvatarUrl: peerAvatarUrl,
      video: video,
      myName: resolvedMyName,
      status: OutgoingCallStatus.calling,
    );
    _outgoingTimers[peerUserId]?.cancel();
    _outgoingTimers[peerUserId] = Timer(_outgoingTimeout, () {
      final out = _outgoings[peerUserId];
      if (out?.status == OutgoingCallStatus.calling) {
        DirectMessagesRealtimeService.endCall(peerUserId);
        _updateOutgoingStatus(peerUserId, OutgoingCallStatus.noAnswer);
        _scheduleOutgoingDismiss(peerUserId);
      }
    });
    _syncCallSounds();
    notifyListeners();
  }

  void cancelOutgoingFor(String peerUserId) {
    if (!_outgoings.containsKey(peerUserId)) return;
    DirectMessagesRealtimeService.endCall(
      peerUserId,
      status: 'cancelled',
    );
    _cancelOutgoingFor(peerUserId);
  }

  /// User tapped "Cancel" on the outgoing popup (first / only entry).
  void cancelOutgoing() {
    if (_outgoings.isEmpty) return;
    cancelOutgoingFor(_outgoings.keys.first);
  }

  /// User tapped "Accept" on the incoming popup.
  Future<void> acceptIncoming() async {
    final inc = _incoming;
    if (inc == null) return;
    if (_actives.isNotEmpty && !_actives.containsKey(inc.callerUserId)) {
      rejectIncoming();
      return;
    }
    if (_actives.containsKey(inc.callerUserId)) {
      await continueCallOnDevice(
        inc.callerUserId,
        peerName: inc.callerName,
        peerAvatarUrl: inc.callerAvatarUrl,
      );
      return;
    }
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

    await DirectMessagesRealtimeService.claimCallMedia(inc.callerUserId);

    _incomingTimer?.cancel();
    _incoming = null;
    _syncCallSounds();
    _startActiveCall(
      session: session,
      peerUserId: inc.callerUserId,
      peerName: inc.callerName,
      peerAvatarUrl: inc.callerAvatarUrl,
      video: inc.video,
      callId: inc.callId,
    );
  }

  /// User tapped "Decline" on the incoming popup.
  void rejectIncoming() {
    final inc = _incoming;
    if (inc == null) return;
    DirectMessagesRealtimeService.rejectCall(inc.callerUserId);
    _incomingTimer?.cancel();
    _incoming = null;
    _syncCallSounds();
    notifyListeners();
  }

  /// Called by the native call screen when the user hangs up.
  Future<void> hangupActive([String? peerUserId]) async {
    final peer = peerUserId ??
        _focusedPeerUserId ??
        (_actives.isEmpty ? null : _actives.keys.first);
    if (peer == null || !_actives.containsKey(peer)) return;
    _stopCallHeartbeatForPeer(peer);
    final act = _actives[peer];
    final startedAt = act?.startedAt ?? _activeCallStartedAt;
    int? durationSec;
    if (startedAt != null) {
      durationSec = DateTime.now().difference(startedAt).inSeconds;
      if (durationSec < 1) durationSec = 1;
    }
    DirectMessagesRealtimeService.endCall(
      peer,
      status: 'completed',
      durationSec: durationSec,
    );
    _actives.remove(peer);
    _openCallRoutes.remove(peer);
    if (_focusedPeerUserId == peer) {
      _focusedPeerUserId =
          _actives.isEmpty ? null : _actives.keys.first;
      clearMinimizedPipVideoTracks();
      _isCallMinimized = false;
      _miniCallTuckedToCorner = false;
      _activeMicEnabled = true;
      _activeSoundEnabled = true;
      _setMicEnabledDelegate = null;
      _setSoundEnabledDelegate = null;
      _activeCallStartedAt = _focusedPeerUserId == null
          ? null
          : _actives[_focusedPeerUserId!]?.startedAt;
    }
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
    if (active == null || setMic == null) return;
    final next = !_activeMicEnabled;
    await setMic(next);
    _activeMicEnabled = next;
    notifyListeners();
  }

  Future<void> toggleActiveSound() async {
    final setSound = _setSoundEnabledDelegate;
    if (active == null || setSound == null) return;
    final next = !_activeSoundEnabled;
    await setSound(next);
    _activeSoundEnabled = next;
    notifyListeners();
  }

  void minimizeActiveCall() {
    if (active == null || _isCallMinimized) return;
    _isCallMinimized = true;
    _miniCallTuckedToCorner = false;
    notifyListeners();
  }

  void updateMiniCallOffset(Offset offset) {
    _miniCallOffset = offset;
    notifyListeners();
  }

  /// Collapses the mini call card into a small corner chip ([position] snaps
  /// the chip, e.g. bottom-right).
  void tuckMiniCallToCorner({Offset? position}) {
    if (active == null || !_isCallMinimized) return;
    if (position != null) {
      _miniCallOffset = position;
    }
    _miniCallTuckedToCorner = true;
    notifyListeners();
  }

  /// Expands from corner chip back to the full mini call card.
  void expandMiniCallFromCorner() {
    if (active == null || !_isCallMinimized || !_miniCallTuckedToCorner) {
      return;
    }
    _miniCallTuckedToCorner = false;
    notifyListeners();
  }

  void restoreMinimizedCall() {
    if (active == null) return;
    clearMinimizedPipVideoTracks();
    _miniCallTuckedToCorner = false;
    _isCallMinimized = false;
    notifyListeners();
    final navigator = _navigatorKey?.currentState;
    if (navigator == null) return;
    var found = false;
    navigator.popUntil((route) {
      final name = route.settings.name ?? '';
      if (name.startsWith(activeCallRouteName)) {
        found = true;
        return true;
      }
      return route.isFirst;
    });
    if (!found) {
      final peer = _focusedPeerUserId ?? active?.peerUserId;
      if (peer != null) {
        _pushCallScreen(peer);
      }
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
    if (_actives.isNotEmpty) {
      if (_actives.containsKey(event.fromUserId)) {
        return;
      }
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
    final callId = event.payload?['callId']?.toString();
    _incoming = IncomingCallState(
      callerUserId: event.fromUserId,
      callerName: (info['displayName'] ?? info['username'] ?? 'Người dùng')
          .toString(),
      callerAvatarUrl: info['avatar']?.toString(),
      video: event.type == 'video',
      myName: _resolveMyName(),
      callId: callId,
    );
    _incomingTimer = Timer(_incomingTimeout, () {
      if (_incoming != null) {
        DirectMessagesRealtimeService.rejectCall(_incoming!.callerUserId);
        _incoming = null;
        _syncCallSounds();
        notifyListeners();
      }
    });
    _syncCallSounds();
    notifyListeners();
  }

  void _onCallBusy(DmCallBusyEvent event) {
    final peerId = event.receiverId ?? event.peerId;
    if (peerId == null || peerId.isEmpty) return;
    if (!_outgoings.containsKey(peerId)) return;
    _cancelOutgoingFor(peerId);
    if (event.code == 'already_in_call') {
      final session = _findConnectedSession(peerId);
      if (session != null) {
        unawaited(continueCallOnDevice(peerId, session: session));
        return;
      }
      _showSnack(
        'Bạn đang gọi người này từ thiết bị hoặc cửa sổ khác. Hãy dùng phiên đó hoặc kết thúc cuộc gọi trước.',
      );
      return;
    }
    if (event.code == 'peer_busy') {
      _showSnack('Người dùng này đang bận cuộc gọi khác.');
      return;
    }
    if (event.code == 'blocked') {
      _showSnack('Không thể gọi người dùng này.');
      return;
    }
    _showSnack('Không thể bắt đầu cuộc gọi. Vui lòng thử lại.');
  }

  void _onMediaTransferred(DmCallMediaTransferredEvent event) {
    final peer = event.peerId;
    if (!_actives.containsKey(peer)) return;
    _stopCallHeartbeatForPeer(peer);
    _actives.remove(peer);
    _openCallRoutes.remove(peer);
    if (_focusedPeerUserId == peer) {
      _focusedPeerUserId =
          _actives.isEmpty ? null : _actives.keys.first;
      clearMinimizedPipVideoTracks();
      _isCallMinimized = false;
      _miniCallTuckedToCorner = false;
      _activeMicEnabled = true;
      _activeSoundEnabled = true;
      _setMicEnabledDelegate = null;
      _setSoundEnabledDelegate = null;
      _activeCallStartedAt = _focusedPeerUserId == null
          ? null
          : _actives[_focusedPeerUserId!]?.startedAt;
    }
    notifyListeners();
  }

  Future<void> _handleAnswer(DmCallEvent event) async {
    final out = _outgoings[event.fromUserId];
    if (out == null) return;
    if (_actives.containsKey(event.fromUserId)) return;

    final roomName = event.payload?['sdpOffer']?['roomName']?.toString();
    if (roomName == null || roomName.isEmpty) return;

    _outgoingTimers[event.fromUserId]?.cancel();

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
      _cancelOutgoingFor(event.fromUserId);
      return;
    }

    _outgoings.remove(event.fromUserId);
    final callId = event.payload?['callId']?.toString();
    await DirectMessagesRealtimeService.claimCallMedia(event.fromUserId);
    _syncCallSounds();
    _startActiveCall(
      session: session,
      peerUserId: out.peerUserId,
      peerName: out.peerName,
      peerAvatarUrl: out.peerAvatarUrl,
      video: out.video,
      callId: callId,
    );
  }

  void _handleRejected(DmCallEvent event) {
    if (!_outgoings.containsKey(event.fromUserId)) return;
    _outgoingTimers[event.fromUserId]?.cancel();
    _updateOutgoingStatus(event.fromUserId, OutgoingCallStatus.rejected);
    _scheduleOutgoingDismiss(event.fromUserId);
  }

  void _onCallEnded(String fromUserId) {
    var changed = false;
    if (_incoming?.callerUserId == fromUserId) {
      _incomingTimer?.cancel();
      _incoming = null;
      changed = true;
    }
    if (_outgoings.containsKey(fromUserId)) {
      _cancelOutgoingFor(fromUserId, notify: false);
      changed = true;
    }
    if (_actives.containsKey(fromUserId)) {
      _stopCallHeartbeatForPeer(fromUserId);
      _actives.remove(fromUserId);
      _openCallRoutes.remove(fromUserId);
      if (_focusedPeerUserId == fromUserId) {
        _focusedPeerUserId =
            _actives.isEmpty ? null : _actives.keys.first;
        clearMinimizedPipVideoTracks();
        _isCallMinimized = false;
        _miniCallTuckedToCorner = false;
        _activeMicEnabled = true;
        _activeSoundEnabled = true;
        _setMicEnabledDelegate = null;
        _setSoundEnabledDelegate = null;
        _activeCallStartedAt = _focusedPeerUserId == null
            ? null
            : _actives[_focusedPeerUserId!]?.startedAt;
      }
      changed = true;
    }
    if (changed) {
      _syncCallSounds();
      notifyListeners();
    }
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
    String? callId,
  }) {
    _focusedPeerUserId = peerUserId;
    final startedAt = DateTime.now();
    _actives[peerUserId] = ActiveCallState(
      session: session,
      peerUserId: peerUserId,
      peerName: peerName,
      peerAvatarUrl: peerAvatarUrl,
      video: video,
      startedAt: startedAt,
    );
    _activeCallStartedAt = startedAt;
    if (_actives.length == 1) {
      clearMinimizedPipVideoTracks();
      _isCallMinimized = false;
      _miniCallTuckedToCorner = false;
      _activeMicEnabled = true;
      _activeSoundEnabled = true;
    }
    notifyListeners();
    _startCallHeartbeat(callId, peerUserId);
    _pushCallScreen(peerUserId);
  }

  void _pushCallScreen(String peerUserId) {
    if (_openCallRoutes.contains(peerUserId)) return;
    final key = _navigatorKey;
    if (key == null) return;
    final navigator = key.currentState;
    if (navigator == null) {
      WidgetsBinding.instance.addPostFrameCallback(
        (_) => _pushCallScreen(peerUserId),
      );
      return;
    }
    final act = _actives[peerUserId];
    if (act == null) return;
    _focusedPeerUserId = peerUserId;
    _openCallRoutes.add(peerUserId);
    navigator
        .push<void>(
          MaterialPageRoute(
            settings: RouteSettings(
              name: '$activeCallRouteName/$peerUserId',
            ),
            fullscreenDialog: true,
            builder: (_) => NativeCallScreen(
              session: act.session,
              peerUserId: peerUserId,
              title: act.peerName.isNotEmpty ? act.peerName : 'Cuộc gọi',
              peerAvatarUrl: act.peerAvatarUrl,
              localDisplayName: _myName,
              onHangup: () => hangupActive(peerUserId),
            ),
          ),
        )
        .whenComplete(() {
      _openCallRoutes.remove(peerUserId);
    });
  }

  void _updateOutgoingStatus(String peerUserId, OutgoingCallStatus status) {
    final current = _outgoings[peerUserId];
    if (current == null) return;
    _outgoings[peerUserId] = current.copyWith(status: status);
    notifyListeners();
  }

  void _scheduleOutgoingDismiss(String peerUserId) {
    _rejectedTimers[peerUserId]?.cancel();
    _rejectedTimers[peerUserId] = Timer(_rejectedLinger, () {
      final cur = _outgoings[peerUserId];
      if (cur != null && cur.status != OutgoingCallStatus.calling) {
        _outgoings.remove(peerUserId);
        _rejectedTimers.remove(peerUserId);
        notifyListeners();
      }
    });
  }

  void _cancelOutgoingFor(String peerUserId, {bool notify = true}) {
    _outgoingTimers[peerUserId]?.cancel();
    _outgoingTimers.remove(peerUserId);
    _rejectedTimers[peerUserId]?.cancel();
    _rejectedTimers.remove(peerUserId);
    _outgoings.remove(peerUserId);
    if (notify) {
      _syncCallSounds();
      notifyListeners();
    }
  }

  void _cancelTimers() {
    for (final t in _outgoingTimers.values) {
      t.cancel();
    }
    _outgoingTimers.clear();
    for (final t in _rejectedTimers.values) {
      t.cancel();
    }
    _rejectedTimers.clear();
    _incomingTimer?.cancel();
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
    messenger?.showSnackBar(
      SnackBar(content: Text(message), duration: const Duration(seconds: 5)),
    );
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
    this.callId,
  });

  final String callerUserId;
  final String callerName;
  final String? callerAvatarUrl;
  final bool video;
  final String myName;
  final String? callId;
}

@immutable
class ActiveCallState {
  const ActiveCallState({
    required this.session,
    required this.peerUserId,
    required this.peerName,
    required this.peerAvatarUrl,
    required this.video,
    required this.startedAt,
  });

  final CallSession session;
  final String peerUserId;
  final String peerName;
  final String? peerAvatarUrl;
  final bool video;
  final DateTime startedAt;
}
