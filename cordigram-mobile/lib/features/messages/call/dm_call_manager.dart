import 'dart:async';

import 'package:flutter/material.dart';
import 'package:livekit_client/livekit_client.dart';
import 'package:permission_handler/permission_handler.dart';

import '../../../core/services/auth_storage.dart';
import '../services/channel_messages_realtime_service.dart';
import '../services/direct_messages_realtime_service.dart';
import '../services/direct_messages_service.dart';
import 'calls_api_service.dart';
import 'dm_call_session_sync.dart';
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
  StreamSubscription<DmCallSessionsSyncPayload>? _sessionsSyncSub;
  StreamSubscription<DmCallIncomingDismissEvent>? _incomingDismissSub;
  StreamSubscription<DmCallOutgoingAckEvent>? _outgoingAckSub;
  Timer? _callHeartbeatTimer;
  List<DmCallSessionSyncItem> _serverSessions = const [];
  bool _initialized = false;
  bool _callRouteOnStack = false;

  IncomingCallState? _incoming;
  final Map<String, OutgoingCallState> _outgoings = {};
  final Map<String, Timer> _outgoingTimers = {};
  final Map<String, Timer> _rejectedTimers = {};
  ActiveCallState? _active;
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
  VideoTrack? _minimizedLocalPipTrack;
  bool _minimizedRemoteMainIsScreenShare = false;
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
  ActiveCallState? get active => _active;
  bool get hasActiveCall => _active != null;
  List<DmCallSessionSyncItem> get serverCallSessions =>
      List<DmCallSessionSyncItem>.unmodifiable(_serverSessions);
  bool isPeerBusyOnServer(String peerUserId) =>
      isBusyWithPeer(_serverSessions, peerUserId);
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
  VideoTrack? get minimizedLocalPipTrack => _minimizedLocalPipTrack;
  bool get minimizedRemoteMainIsScreenShare => _minimizedRemoteMainIsScreenShare;
  DateTime? get activeCallStartedAt => _activeCallStartedAt;

  void setMinimizedPipVideoTracks({
    VideoTrack? remoteMain,
    VideoTrack? localPip,
    bool remoteMainIsScreenShare = false,
  }) {
    _minimizedRemoteMainTrack = remoteMain;
    _minimizedLocalPipTrack = localPip;
    _minimizedRemoteMainIsScreenShare = remoteMainIsScreenShare;
    if (_isCallMinimized) notifyListeners();
  }

  void clearMinimizedPipVideoTracks() {
    _minimizedRemoteMainTrack = null;
    _minimizedLocalPipTrack = null;
    _minimizedRemoteMainIsScreenShare = false;
  }

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
    _busySub = DirectMessagesRealtimeService.callBusy.listen(_onCallBusy);
    _serverSessions = DirectMessagesRealtimeService.lastCallSessionsSync.sessions;
    _sessionsSyncSub =
        DirectMessagesRealtimeService.callSessionsSync.listen(_onSessionsSync);
    _incomingDismissSub = DirectMessagesRealtimeService.callIncomingDismiss
        .listen(_onIncomingDismiss);
    _outgoingAckSub =
        DirectMessagesRealtimeService.callOutgoingAck.listen(_onOutgoingAck);
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
      ),
    );
  }

  Future<void> onAuthChanged() async {
    if (!_initialized) return;
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
    _active = null;
    _callRouteOnStack = false;
    _activeCallStartedAt = null;
    clearMinimizedPipVideoTracks();
    _isCallMinimized = false;
    _miniCallTuckedToCorner = false;
    _activeMicEnabled = true;
    _activeSoundEnabled = true;
    _setMicEnabledDelegate = null;
    _setSoundEnabledDelegate = null;
    _myName = null;
    _serverSessions = const [];
    _stopCallHeartbeat();
    notifyListeners();
    final token = AuthStorage.accessToken;
    if (token != null && token.isNotEmpty) {
      await DirectMessagesRealtimeService.connect();
      await ChannelMessagesRealtimeService.connect();
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
    _sessionsSyncSub?.cancel();
    _incomingDismissSub?.cancel();
    _outgoingAckSub?.cancel();
    _stopCallHeartbeat();
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
    if (_incoming != null) return;
    if (_active != null) {
      _showSnack('Bạn đang trong cuộc gọi. Hãy kết thúc trước khi gọi tiếp.');
      return;
    }
    if (_outgoings.containsKey(peerUserId)) return;
    if (_outgoings.isNotEmpty) {
      _showSnack('Bạn đang gọi người khác. Hãy hủy cuộc gọi đó trước.');
      return;
    }
    if (isBusyWithPeer(_serverSessions, peerUserId) &&
        !_outgoings.containsKey(peerUserId)) {
      _showSnack(
        'Cuộc gọi tới người này đang diễn ra trên thiết bị hoặc tab khác.',
      );
      return;
    }
    if (!canMobileInitiateCall(_serverSessions)) {
      _showSnack(
        'Bạn đang trong cuộc gọi khác trên thiết bị khác. Hãy kết thúc trước khi gọi tiếp.',
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
    _restartCallHeartbeat();
    notifyListeners();
  }

  void cancelOutgoingFor(String peerUserId) {
    if (!_outgoings.containsKey(peerUserId)) return;
    DirectMessagesRealtimeService.endCall(peerUserId);
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

    final alreadyConnected = _serverSessions.any(
      (s) =>
          s.phase == 'connected' &&
          s.peerId == inc.callerUserId,
    );
    if (alreadyConnected || _active != null) {
      _dismissIncomingForPeer(inc.callerUserId);
      notifyListeners();
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
    final callerId = inc.callerUserId;
    final alreadyConnected = _serverSessions.any(
      (s) => s.phase == 'connected' && s.peerId == callerId,
    );
    _dismissIncomingForPeer(callerId);
    if (alreadyConnected || _active != null) {
      notifyListeners();
      return;
    }
    DirectMessagesRealtimeService.rejectCall(callerId);
    notifyListeners();
  }

  /// Called by the native call screen when the user hangs up.
  Future<void> hangupActive() async {
    final act = _active;
    if (act == null) return;
    DirectMessagesRealtimeService.endCall(act.peerUserId);
    _active = null;
    _activeCallStartedAt = null;
    clearMinimizedPipVideoTracks();
    _isCallMinimized = false;
    _miniCallTuckedToCorner = false;
    _activeMicEnabled = true;
    _activeSoundEnabled = true;
    _setMicEnabledDelegate = null;
    _setSoundEnabledDelegate = null;
    _stopCallHeartbeat();
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
    if (_active == null || !_isCallMinimized) return;
    if (position != null) {
      _miniCallOffset = position;
    }
    _miniCallTuckedToCorner = true;
    notifyListeners();
  }

  /// Expands from corner chip back to the full mini call card.
  void expandMiniCallFromCorner() {
    if (_active == null || !_isCallMinimized || !_miniCallTuckedToCorner) {
      return;
    }
    _miniCallTuckedToCorner = false;
    notifyListeners();
  }

  void restoreMinimizedCall() {
    if (_active == null) return;
    clearMinimizedPipVideoTracks();
    _miniCallTuckedToCorner = false;
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

  void _onCallBusy(DmCallBusyEvent event) {
    final peerId = event.receiverId ?? event.peerId;
    if (peerId != null && peerId.isNotEmpty) {
      final out = _outgoings[peerId];
      if (out?.status == OutgoingCallStatus.calling &&
          event.code == 'already_in_call') {
        return;
      }
      if (_outgoings.containsKey(peerId)) {
        DirectMessagesRealtimeService.endCall(peerId);
        _cancelOutgoingFor(peerId, notify: false);
      }
    }
    final msg = event.code == 'peer_busy'
        ? 'Người nhận đang bận cuộc gọi khác.'
        : event.code == 'user_busy'
        ? 'Bạn đang trong cuộc gọi khác trên thiết bị khác. Hãy kết thúc trước khi gọi tiếp.'
        : 'Bạn đang gọi người này từ thiết bị hoặc cửa sổ khác. Hãy dùng phiên đó hoặc kết thúc cuộc gọi trước.';
    _showSnack(msg);
  }

  void _onOutgoingAck(DmCallOutgoingAckEvent event) {
    if (_outgoings.containsKey(event.peerId) || _active != null) return;
    _outgoings[event.peerId] = OutgoingCallState(
      peerUserId: event.peerId,
      peerName: event.peerId,
      peerAvatarUrl: null,
      video: event.type == 'video',
      myName: _resolveMyName(),
      status: OutgoingCallStatus.calling,
    );
    _outgoingTimers[event.peerId]?.cancel();
    _outgoingTimers[event.peerId] = Timer(_outgoingTimeout, () {
      if (_outgoings[event.peerId]?.status == OutgoingCallStatus.calling) {
        DirectMessagesRealtimeService.endCall(event.peerId);
        _updateOutgoingStatus(event.peerId, OutgoingCallStatus.noAnswer);
        _scheduleOutgoingDismiss(event.peerId);
      }
    });
    _restartCallHeartbeat();
    notifyListeners();
  }

  void _onIncomingDismiss(DmCallIncomingDismissEvent event) {
    _dismissIncomingForPeer(event.peerId);
    if (event.reason == 'rejected' ||
        event.reason == 'answered_elsewhere') {
      if (_outgoings.containsKey(event.peerId)) {
        _cancelOutgoingFor(event.peerId, notify: false);
      }
    }
    notifyListeners();
  }

  void _dismissIncomingForPeer(String peerId) {
    if (_incoming?.callerUserId != peerId) return;
    _incomingTimer?.cancel();
    _incoming = null;
  }

  void _onSessionsSync(DmCallSessionsSyncPayload payload) {
    _serverSessions = payload.sessions;
    for (final s in _serverSessions) {
      if (s.phase == 'connected') {
        _dismissIncomingForPeer(s.peerId);
      }
    }
    if (!canMobileInitiateCall(_serverSessions)) {
      for (final peerId in _outgoings.keys.toList()) {
        if (!isBusyWithPeer(_serverSessions, peerId)) {
          _cancelOutgoingFor(peerId, notify: false);
        }
      }
    }
    _restartCallHeartbeat();
    notifyListeners();
  }

  void _restartCallHeartbeat() {
    _stopCallHeartbeat();
    final peers = <String>{};
    if (_active != null) peers.add(_active!.peerUserId);
    for (final p in _outgoings.keys) {
      peers.add(p);
    }
    for (final s in _serverSessions) {
      peers.add(s.peerId);
    }
    if (peers.isEmpty) return;
    void tick() {
      for (final peerId in peers) {
        DirectMessagesRealtimeService.emitCallHeartbeat(peerId);
      }
    }

    tick();
    _callHeartbeatTimer = Timer.periodic(
      const Duration(seconds: 25),
      (_) => tick(),
    );
  }

  void _stopCallHeartbeat() {
    _callHeartbeatTimer?.cancel();
    _callHeartbeatTimer = null;
  }

  Future<void> _handleAnswer(DmCallEvent event) async {
    final out = _outgoings[event.fromUserId];
    if (out == null) return;
    if (_active != null || _callRouteOnStack) return;

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
    _startActiveCall(
      session: session,
      peerUserId: out.peerUserId,
      peerName: out.peerName,
      peerAvatarUrl: out.peerAvatarUrl,
      video: out.video,
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
    if (_active?.peerUserId == fromUserId) {
      _active = null;
      _activeCallStartedAt = null;
      _callRouteOnStack = false;
      clearMinimizedPipVideoTracks();
      _isCallMinimized = false;
      _miniCallTuckedToCorner = false;
      _activeMicEnabled = true;
      _activeSoundEnabled = true;
      _setMicEnabledDelegate = null;
      _setSoundEnabledDelegate = null;
      changed = true;
    }
    if (changed) {
      _restartCallHeartbeat();
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
  }) {
    _active = ActiveCallState(
      session: session,
      peerUserId: peerUserId,
      peerName: peerName,
      peerAvatarUrl: peerAvatarUrl,
      video: video,
    );
    _activeCallStartedAt = DateTime.now();
    _restartCallHeartbeat();
    clearMinimizedPipVideoTracks();
    _isCallMinimized = false;
    _miniCallTuckedToCorner = false;
    _activeMicEnabled = true;
    _activeSoundEnabled = true;
    notifyListeners();
    _pushCallScreen();
  }

  void _pushCallScreen() {
    if (_callRouteOnStack) return;
    final key = _navigatorKey;
    if (key == null) return;
    final navigator = key.currentState;
    if (navigator == null) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _pushCallScreen());
      return;
    }
    final act = _active;
    if (act == null) return;
    _callRouteOnStack = true;
    navigator
        .push<void>(
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
        )
        .whenComplete(() {
      _callRouteOnStack = false;
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
    if (notify) notifyListeners();
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
