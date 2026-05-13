import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:livekit_client/livekit_client.dart';

import '../../core/config/app_theme.dart';
import '../../core/services/api_service.dart';
import '../../core/services/auth_storage.dart';
import '../home/home_screen.dart';
import '../profile/profile_screen.dart';
import '../profile/services/profile_service.dart';
import '../report/report_user_sheet.dart';
import 'livestream_create_service.dart';
import 'livestream_pending_session.dart';

class LivestreamHubScreen extends StatefulWidget {
  const LivestreamHubScreen({
    super.key,
    this.initialStreamId,
    this.forceHost = false,
  });

  final String? initialStreamId;
  final bool forceHost;

  @override
  State<LivestreamHubScreen> createState() => _LivestreamHubScreenState();
}

class _LivestreamHubScreenState extends State<LivestreamHubScreen>
    with WidgetsBindingObserver {
  final _commentCtrl = TextEditingController();
  final _commentScrollCtrl = ScrollController();

  final List<_LiveComment> _comments = <_LiveComment>[];
  final Set<String> _seenCommentIds = <String>{};
  final Set<String> _hiddenCommentIds = <String>{};
  final Set<String> _blockedUserIds = <String>{};

  List<LivestreamItem> _liveItems = const [];
  LivestreamItem? _activeStream;

  Room? _room;
  EventsListener<RoomEvent>? _roomListener;
  Timer? _listTimer;
  Timer? _streamRefreshTimer;

  VideoTrack? _stageTrack;
  LocalVideoTrack? _localPublishedVideoTrack;

  bool _loadingList = false;
  bool _joining = false;
  bool _roomConnected = false;
  bool _sendingComment = false;
  bool _commentPaused = false;
  DateTime? _pausedUntil;
  int _pauseSecondsLeft = 0;
  Timer? _pauseTimer;
  bool _startingHostMedia = false;
  bool _hostMediaStarted = false;
  bool _switchingCamera = false;
  bool _isFrontCamera = true;
  // Set to true when the host's stream has been ended (via button, back, or app pause)
  // so that dispose() does not send a duplicate end request.
  bool _hostStreamEnded = false;
  // Set to true when a viewer's stream is disconnected by the host remotely.
  bool _streamEndedRemotely = false;
  // Set to true when the viewer/host leaves voluntarily so RoomDisconnectedEvent
  // does not mistakenly treat it as a remote end.
  bool _leftVoluntarily = false;
  // Tracks the host's current camera facing for viewer-side mirror correction.
  // Front camera streams are mirrored at hardware level; viewers must scaleX(-1)
  // to restore natural orientation. Back camera streams are not mirrored.
  bool _hostIsFrontCamera = true;

  String? _myUserId;
  String _myParticipantName = 'Viewer';
  String? _myAvatarUrl;
  String? _error;

  LivestreamRole _joinedRole = LivestreamRole.viewer;

  AppSemanticColors get _tokens {
    final theme = Theme.of(context);
    return theme.extension<AppSemanticColors>() ??
        (theme.brightness == Brightness.dark
            ? AppSemanticColors.dark
            : AppSemanticColors.light);
  }

  bool get _hostDirectMode {
    final initial = widget.initialStreamId?.trim();
    return widget.forceHost || (initial != null && initial.isNotEmpty);
  }

  bool get _isHostSession {
    if (widget.forceHost) return true;
    return _joinedRole == LivestreamRole.host;
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _bootstrap();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    // If host exits the screen without explicitly ending the live, end it now.
    if (_isHostSession && !_hostStreamEnded) {
      final streamId = _activeStream?.id;
      if (streamId != null && streamId.isNotEmpty) {
        _hostStreamEnded = true;
        unawaited(LivestreamCreateService.endLivestream(streamId));
      }
    }
    _commentCtrl.dispose();
    _commentScrollCtrl.dispose();
    _listTimer?.cancel();
    _streamRefreshTimer?.cancel();
    _pauseTimer?.cancel();
    unawaited(_disposeRoom());
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused &&
        _isHostSession &&
        !_hostStreamEnded) {
      final stream = _activeStream;
      if (stream != null) {
        _hostStreamEnded = true;
        unawaited(_endHostStreamAndNavigateHome(stream.id));
      }
    }
  }

  Future<void> _endHostStreamAndNavigateHome(String streamId) async {
    try {
      await LivestreamCreateService.endLivestream(streamId);
    } catch (_) {}
    await _disposeRoom();
    if (!mounted) return;
    Navigator.of(context, rootNavigator: true).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const HomeScreen()),
      (_) => false,
    );
  }

  Future<void> _bootstrap() async {
    await _loadMe();

    final initialStreamId = widget.initialStreamId?.trim();
    if (initialStreamId != null && initialStreamId.isNotEmpty) {
      await _openStream(initialStreamId, asHost: widget.forceHost);
      _startStreamRefreshTimer();
      return;
    }

    await _loadLiveList();
    _startListRefreshTimer();
  }

  Future<void> _loadMe() async {
    final token = AuthStorage.accessToken;
    if (token == null) return;

    try {
      final data = await ApiService.get(
        '/profiles/me',
        extraHeaders: {'Authorization': 'Bearer $token'},
      );
      final userId = (data['userId'] as String?) ?? (data['id'] as String?);
      final username = (data['username'] as String?)?.trim();
      final displayName = (data['displayName'] as String?)?.trim();

      if (!mounted) return;
      setState(() {
        _myUserId = userId;
        _myParticipantName = (username != null && username.isNotEmpty)
            ? username
            : (displayName != null && displayName.isNotEmpty)
            ? displayName
            : 'Viewer';
        final avatar = (data['avatarUrl'] as String?)?.trim();
        _myAvatarUrl = (avatar != null && avatar.isNotEmpty) ? avatar : null;
      });
    } catch (_) {
      // Keep default identity when profile request fails.
    }
  }

  void _startListRefreshTimer() {
    _listTimer?.cancel();
    _listTimer = Timer.periodic(const Duration(seconds: 8), (_) {
      if (_activeStream != null) return;
      unawaited(_loadLiveList());
    });
  }

  void _startStreamRefreshTimer() {
    _streamRefreshTimer?.cancel();
    _streamRefreshTimer = Timer.periodic(const Duration(seconds: 8), (_) {
      final streamId = _activeStream?.id;
      if (streamId == null || streamId.isEmpty) return;
      unawaited(_refreshActiveStream(streamId));
    });
  }

  Future<void> _loadLiveList() async {
    if (_loadingList) return;

    setState(() {
      _loadingList = true;
      _error = null;
    });

    try {
      final response = await LivestreamCreateService.listLiveLivestreams();
      if (!mounted) return;
      setState(() => _liveItems = response.items);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.message);
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = 'Unable to load livestreams right now.');
    } finally {
      if (mounted) {
        setState(() => _loadingList = false);
      }
    }
  }

  Future<void> _refreshActiveStream(String streamId) async {
    try {
      final stream = await LivestreamCreateService.getLivestreamById(streamId);
      if (!mounted) return;
      setState(() {
        _activeStream = stream;
      });
    } catch (_) {
      // Keep current snapshot if refresh fails.
    }
  }

  Future<void> _openStream(String streamId, {required bool asHost}) async {
    if (_joining) return;

    setState(() {
      _joining = true;
      _error = null;
    });

    await _disposeRoom();

    final maxAttempts = asHost ? 3 : 2;
    Object? lastError;

    for (var attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        var join = await LivestreamCreateService.joinLivestreamToken(
          streamId,
          asHost: asHost,
          participantName: _myParticipantName,
        );

        if (!asHost &&
            _myUserId != null &&
            join.stream.hostUserId == _myUserId) {
          join = await LivestreamCreateService.joinLivestreamToken(
            streamId,
            asHost: true,
            participantName: _myParticipantName,
          );
        }

        final room = Room();
        final listener = room.createListener();

        try {
          _attachRoomListeners(listener, room);
          await room.connect(join.url, join.token);
        } catch (_) {
          await listener.dispose();
          await room.dispose();
          rethrow;
        }

        if (!mounted) {
          await listener.dispose();
          await room.dispose();
          return;
        }

        setState(() {
          _room = room;
          _roomListener = listener;
          _activeStream = join.stream;
          _joinedRole = join.role;
          _roomConnected = true;
          _comments.clear();
          _seenCommentIds.clear();
          _stageTrack = null;
        });

        _pickStageTrack();

        if (_isHostSession) {
          await _startHostMediaIfNeeded();
        } else {
          await _requestCommentHistory();
        }

        _startStreamRefreshTimer();
        lastError = null;
        break;
      } catch (e) {
        lastError = e;
        if (attempt < maxAttempts) {
          await Future<void>.delayed(const Duration(milliseconds: 900));
        }
      }
    }

    if (lastError != null && mounted) {
      if (lastError is ApiException) {
        final apiError = lastError;
        setState(() => _error = apiError.message);
      } else {
        setState(() => _error = 'Unable to join livestream.');
      }
    }

    if (mounted) {
      setState(() => _joining = false);
    }
  }

  void _attachRoomListeners(EventsListener<RoomEvent> listener, Room room) {
    listener
      ..on<RoomDisconnectedEvent>((_) {
        if (!mounted) return;
        setState(() {
          _roomConnected = false;
          _stageTrack = null;
          if (!_isHostSession && !_leftVoluntarily) {
            _streamEndedRemotely = true;
          }
        });
      })
      ..on<ParticipantEvent>((_) {
        if (!mounted) return;
        _pickStageTrack();
      })
      ..on<DataReceivedEvent>(_handleDataReceivedEvent);

    room.addListener(_pickStageTrack);
  }

  Future<void> _disposeRoom() async {
    _streamRefreshTimer?.cancel();
    _streamRefreshTimer = null;

    final room = _room;
    final listener = _roomListener;

    _room = null;
    _roomListener = null;
    _stageTrack = null;
    _localPublishedVideoTrack = null;
    _hostMediaStarted = false;
    _switchingCamera = false;
    _isFrontCamera = true;
    _hostIsFrontCamera = true;

    if (room != null) {
      room.removeListener(_pickStageTrack);
    }

    if (listener != null) {
      await listener.dispose();
    }

    if (room != null) {
      try {
        await room.disconnect();
      } catch (_) {}
      await room.dispose();
    }
  }

  Future<void> _startHostMediaIfNeeded() async {
    if (_startingHostMedia || _hostMediaStarted) return;
    final room = _room;
    final stream = _activeStream;
    if (room == null || stream == null) return;

    setState(() {
      _startingHostMedia = true;
      _error = null;
    });

    try {
      final pending = LivestreamPendingSessionStore.getPending();
      final initialIsFront = pending?.isFrontCamera != false;

      // Microphone is optional; do not fail startup on it.
      try {
        await room.localParticipant?.setMicrophoneEnabled(true);
      } catch (_) {}

      final publication = await room.localParticipant?.setCameraEnabled(
        true,
        cameraCaptureOptions: CameraCaptureOptions(
          cameraPosition: initialIsFront
              ? CameraPosition.front
              : CameraPosition.back,
        ),
      );

      final publishedTrack = publication?.track;
      if (publishedTrack is LocalVideoTrack) {
        _localPublishedVideoTrack = publishedTrack;
      }

      _localPublishedVideoTrack ??= await _resolveLocalPublishedVideoTrack();
      if (_localPublishedVideoTrack == null) {
        throw const ApiException(
          'Host video track is not ready yet. Please retry.',
        );
      }

      _hostMediaStarted = true;
      _isFrontCamera = initialIsFront;
      LivestreamPendingSessionStore.clear();
      _pickStageTrack();
      unawaited(_broadcastCameraState(initialIsFront));
    } catch (e) {
      if (!mounted) return;
      setState(() {
        final message = e is ApiException
            ? e.message
            : e.toString().replaceFirst('Exception: ', '').trim();
        _error = message.isEmpty
            ? 'Unable to start camera source automatically. Open host menu to retry source setup.'
            : 'Unable to start camera source: $message';
      });
    } finally {
      if (mounted) {
        setState(() => _startingHostMedia = false);
      }
    }
  }

  Future<LocalVideoTrack?> _resolveLocalPublishedVideoTrack() async {
    final room = _room;
    if (room == null) return null;

    for (var i = 0; i < 20; i += 1) {
      final participant = room.localParticipant;
      final publications = participant?.videoTrackPublications ?? const [];
      for (final publication in publications) {
        final track = publication.track;
        if (track is LocalVideoTrack) {
          return track;
        }
      }
      await Future<void>.delayed(const Duration(milliseconds: 220));
    }

    return null;
  }

  Future<void> _broadcastCameraState(bool isFront) async {
    final participant = _room?.localParticipant;
    if (participant == null) return;
    try {
      await participant.publishData(
        utf8.encode(
          jsonEncode(<String, dynamic>{
            'type': 'camera_flip',
            'isFrontCamera': isFront,
          }),
        ),
        reliable: true,
      );
    } catch (_) {}
  }

  Future<void> _toggleHostCamera() async {
    if (!_isHostSession || _switchingCamera || _startingHostMedia) return;
    if (!_roomConnected || !_hostMediaStarted) return;

    final nextIsFront = !_isFrontCamera;

    setState(() {
      _switchingCamera = true;
      _error = null;
    });

    try {
      _localPublishedVideoTrack ??= await _resolveLocalPublishedVideoTrack();
      final localTrack = _localPublishedVideoTrack;
      if (localTrack == null) {
        throw const ApiException('Unable to switch camera right now.');
      }

      await localTrack.setCameraPosition(
        nextIsFront ? CameraPosition.front : CameraPosition.back,
      );

      if (!mounted) return;
      setState(() {
        _isFrontCamera = nextIsFront;
      });
      _pickStageTrack();
      unawaited(_broadcastCameraState(nextIsFront));
    } catch (e) {
      if (!mounted) return;
      final message = e is ApiException
          ? e.message
          : e.toString().replaceFirst('Exception: ', '').trim();
      setState(() {
        _error = message.isEmpty
            ? 'Unable to switch camera right now. Please try again.'
            : message;
      });
    } finally {
      if (mounted) {
        setState(() => _switchingCamera = false);
      }
    }
  }

  void _pickStageTrack() {
    final room = _room;
    if (room == null) return;

    VideoTrack? selected;

    if (_isHostSession && _localPublishedVideoTrack != null) {
      selected = _localPublishedVideoTrack;
    }

    selected ??= _findHostVideoTrack(room);
    selected ??= _findAnyRemoteTrack(room);

    if (!mounted) return;
    setState(() => _stageTrack = selected);
  }

  VideoTrack? _findHostVideoTrack(Room room) {
    RemoteParticipant? hostParticipant;

    for (final p in room.remoteParticipants.values) {
      if (p.identity.contains('-host-')) {
        hostParticipant = p;
        break;
      }
    }

    if (hostParticipant == null) return null;

    for (final publication in hostParticipant.videoTrackPublications) {
      if (!publication.isScreenShare) continue;
      final track = publication.track;
      if (track is VideoTrack) return track;
    }

    for (final publication in hostParticipant.videoTrackPublications) {
      final track = publication.track;
      if (track is VideoTrack) return track;
    }

    return null;
  }

  VideoTrack? _findAnyRemoteTrack(Room room) {
    for (final p in room.remoteParticipants.values) {
      for (final publication in p.videoTrackPublications) {
        final track = publication.track;
        if (track is VideoTrack) return track;
      }
    }
    return null;
  }

  void _handleDataReceivedEvent(DataReceivedEvent event) {
    Map<String, dynamic>? payload;

    try {
      payload = jsonDecode(utf8.decode(event.data)) as Map<String, dynamic>;
    } catch (_) {
      return;
    }

    final type = (payload['type'] as String?) ?? '';

    if (type == 'comment') {
      final text = ((payload['text'] as String?) ?? '').trim();
      if (text.isEmpty) return;

      final commentId = ((payload['commentId'] as String?) ?? '').trim();
      final participantName =
          event.participant?.name ?? event.participant?.identity;
      final author =
          ((payload['author'] as String?) ?? participantName ?? 'Viewer')
              .trim();
      final isHost =
          payload['isHost'] == true ||
          (event.participant?.identity.contains('-host-') ?? false);
      final authorId = ((payload['authorId'] as String?) ?? '').trim();

      _appendComment(
        _LiveComment(
          id: commentId.isEmpty ? _commentId() : commentId,
          author: author,
          authorId: authorId.isEmpty ? null : authorId,
          text: text,
          isHost: isHost,
          avatarUrl: ((payload['avatarUrl'] as String?) ?? '').trim(),
        ),
      );
      return;
    }

    if (type == 'comment_delete') {
      final commentId = (payload['commentId'] as String?) ?? '';
      if (commentId.isEmpty) return;
      if (!mounted) return;
      setState(() => _comments.removeWhere((c) => c.id == commentId));
      return;
    }

    if (type == 'comment_hide') {
      final commentId = (payload['commentId'] as String?) ?? '';
      final hiddenBy = (payload['hiddenBy'] as String?) ?? '';
      if (commentId.isEmpty) return;
      // only apply if this packet was sent by the same account
      if (_myUserId != null && hiddenBy == _myUserId) {
        if (!mounted) return;
        setState(() => _hiddenCommentIds.add(commentId));
      }
      return;
    }

    if (type == 'user_pause') {
      final userId = (payload['userId'] as String?) ?? '';
      final expiresAtRaw = (payload['expiresAt'] as String?) ?? '';
      if (userId.isEmpty || userId != _myUserId) return;
      final expiresAt = DateTime.tryParse(expiresAtRaw);
      if (expiresAt == null || expiresAt.isBefore(DateTime.now())) return;
      _startPauseCountdown(expiresAt);
      return;
    }

    if (type == 'pause_notice') {
      final noticeText = (payload['noticeText'] as String?) ?? '';
      if (noticeText.isEmpty) return;
      final noticeId = (payload['noticeId'] as String?) ?? 'sys-${DateTime.now().millisecondsSinceEpoch}';
      _appendComment(_LiveComment(id: noticeId, author: '', text: noticeText, isHost: false, isSystem: true));
      return;
    }

    if (type == 'comment_history') {
      final list = payload['comments'];
      if (list is! List) return;
      for (final item in list.whereType<Map<String, dynamic>>()) {
        final text = ((item['text'] as String?) ?? '').trim();
        if (text.isEmpty) continue;

        final itemAuthorId = ((item['authorId'] as String?) ?? '').trim();
        _appendComment(
          _LiveComment(
            id: ((item['id'] as String?) ?? '').trim().isEmpty
                ? _commentId()
                : (item['id'] as String),
            author: ((item['authorHandle'] as String?) ?? 'Viewer').trim(),
            authorId: itemAuthorId.isEmpty ? null : itemAuthorId,
            text: text,
            isHost: item['isHost'] == true,
            avatarUrl: ((item['avatarUrl'] as String?) ?? '').trim(),
          ),
        );
      }
      return;
    }

    if (type == 'comment_history_request') {
      if (!_isHostSession) return;
      final targetId = event.participant?.identity;
      if (targetId == null || targetId.isEmpty) return;
      unawaited(_sendCommentHistory(targetId));
      return;
    }

    if (type == 'camera_flip') {
      final isFront = payload['isFrontCamera'] == true;
      if (!mounted) return;
      setState(() => _hostIsFrontCamera = isFront);
      return;
    }

    if (type == 'meta_update') {
      final patch = payload['patch'];
      if (patch is! Map<String, dynamic>) return;

      final active = _activeStream;
      if (active == null) return;

      setState(() {
        _activeStream = active.copyWith(
          title: (patch['title'] as String?) ?? active.title,
          description: (patch['description'] as String?) ?? active.description,
          pinnedComment:
              (patch['pinnedComment'] as String?) ?? active.pinnedComment,
          location: (patch['location'] as String?) ?? active.location,
          latencyMode:
              _tryParseLatencyMode((patch['latencyMode'] as String?)) ??
              active.latencyMode,
        );
      });
    }
  }

  LivestreamLatencyMode? _tryParseLatencyMode(String? raw) {
    switch ((raw ?? '').toLowerCase()) {
      case 'adaptive':
        return LivestreamLatencyMode.adaptive;
      case 'balanced':
        return LivestreamLatencyMode.balanced;
      case 'low':
        return LivestreamLatencyMode.low;
      default:
        return null;
    }
  }

  void _appendComment(_LiveComment comment) {
    if (_seenCommentIds.contains(comment.id)) return;
    _seenCommentIds.add(comment.id);

    if (!mounted) return;
    setState(() {
      _comments.add(comment);
      if (_comments.length > 160) {
        _comments.removeRange(0, _comments.length - 160);
      }
    });
  }

  Future<void> _requestCommentHistory() async {
    final participant = _room?.localParticipant;
    if (participant == null) return;

    try {
      await participant.publishData(
        utf8.encode(
          jsonEncode(<String, dynamic>{'type': 'comment_history_request'}),
        ),
        reliable: true,
      );
    } catch (_) {}
  }

  Future<void> _sendCommentHistory(String participantIdentity) async {
    final participant = _room?.localParticipant;
    if (participant == null || _comments.isEmpty) return;

    final payload = <String, dynamic>{
      'type': 'comment_history',
      'comments': _comments
          .where((c) => !c.isSystem)
          .map(
            (c) => <String, dynamic>{
              'id': c.id,
              'authorHandle': c.author,
              'authorId': c.authorId ?? '',
              'isHost': c.isHost,
              'text': c.text,
              'avatarUrl': c.avatarUrl,
            },
          )
          .toList(),
    };

    try {
      await participant.publishData(
        utf8.encode(jsonEncode(payload)),
        reliable: true,
        destinationIdentities: <String>[participantIdentity],
      );
    } catch (_) {}
  }

  Future<void> _sendComment() async {
    final text = _commentCtrl.text.trim();
    if (text.isEmpty || _sendingComment || !_roomConnected || _commentPaused) return;

    final participant = _room?.localParticipant;
    if (participant == null) return;

    final id = _commentId();
    final draft = _LiveComment(
      id: id,
      author: _myParticipantName,
      authorId: _myUserId,
      text: text,
      isHost: _isHostSession,
      avatarUrl: _myAvatarUrl,
    );

    setState(() {
      _sendingComment = true;
      _commentCtrl.clear();
    });

    _appendComment(draft);

    try {
      await participant.publishData(
        utf8.encode(
          jsonEncode(<String, dynamic>{
            'type': 'comment',
            'commentId': id,
            'text': text,
            'author': draft.author,
            'authorId': _myUserId ?? '',
            'isHost': draft.isHost,
            'avatarUrl': draft.avatarUrl,
          }),
        ),
        reliable: true,
      );
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = 'Unable to send comment. Please try again.');
    } finally {
      if (mounted) {
        setState(() => _sendingComment = false);
      }
    }
  }

  String _commentId() =>
      '${DateTime.now().microsecondsSinceEpoch}-${Random().nextInt(999999)}';

  // ── Control packet helpers ──────────────────────────────────────────────────

  Future<void> _publishControlPacket(Map<String, dynamic> packet) async {
    final participant = _room?.localParticipant;
    if (participant == null) return;
    try {
      await participant.publishData(
        utf8.encode(jsonEncode(packet)),
        reliable: true,
      );
    } catch (_) {}
  }

  // ── Pause countdown ─────────────────────────────────────────────────────────

  void _startPauseCountdown(DateTime until) {
    _pauseTimer?.cancel();
    setState(() {
      _commentPaused = true;
      _pausedUntil = until;
    });
    _pauseTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) { _pauseTimer?.cancel(); return; }
      final deadline = _pausedUntil;
      if (deadline == null) { _pauseTimer?.cancel(); return; }
      final left = deadline.difference(DateTime.now()).inSeconds;
      if (left <= 0) {
        _pauseTimer?.cancel();
        setState(() { _commentPaused = false; _pausedUntil = null; _pauseSecondsLeft = 0; });
      } else {
        setState(() => _pauseSecondsLeft = left);
      }
    });
  }

  String _formatPauseDuration(int minutes) {
    if (minutes >= 1440) return '1 day';
    if (minutes >= 60) {
      final h = minutes ~/ 60;
      return '$h hour${h == 1 ? '' : 's'}';
    }
    return '$minutes minute${minutes == 1 ? '' : 's'}';
  }

  // ── Moderation actions ──────────────────────────────────────────────────────

  Future<void> _deleteComment(_LiveComment comment) async {
    setState(() => _comments.removeWhere((c) => c.id == comment.id));
    await _publishControlPacket({'type': 'comment_delete', 'commentId': comment.id});
    // sync to same-account sessions
    await _publishControlPacket({'type': 'comment_hide', 'commentId': comment.id, 'hiddenBy': _myUserId ?? ''});
  }

  Future<void> _hideComment(_LiveComment comment) async {
    setState(() => _hiddenCommentIds.add(comment.id));
    // sync hide to same-account sessions on other devices
    await _publishControlPacket({'type': 'comment_hide', 'commentId': comment.id, 'hiddenBy': _myUserId ?? ''});
  }

  Future<void> _muteUser(_LiveComment comment, int durationMinutes) async {
    final authorId = comment.authorId;
    if (authorId == null || authorId.isEmpty) return;
    final token = AuthStorage.accessToken;
    if (token == null) return;
    try {
      final resp = await ApiService.post(
        '/livestreams/mute-user',
        body: {'userId': authorId, 'durationMinutes': durationMinutes},
        extraHeaders: {'Authorization': 'Bearer $token'},
      );
      final expiresAt = resp['expiresAt'] as String?;
      await _publishControlPacket({
        'type': 'user_pause',
        'userId': authorId,
        'expiresAt': expiresAt ?? '',
      });
      // pause notice to all viewers
      final hostHandle = _myParticipantName.startsWith('@') ? _myParticipantName : '@$_myParticipantName';
      final targetHandle = comment.author.startsWith('@') ? comment.author : '@${comment.author}';
      final durationLabel = _formatPauseDuration(durationMinutes);
      final noticeId = 'pause-notice-${DateTime.now().millisecondsSinceEpoch}';
      final noticeText = '$hostHandle put $targetHandle on a $durationLabel timeout.';
      final sysComment = _LiveComment(id: noticeId, author: '', text: noticeText, isHost: false, isSystem: true);
      _appendComment(sysComment);
      await _publishControlPacket({'type': 'pause_notice', 'noticeId': noticeId, 'noticeText': noticeText});
    } catch (_) {
      if (mounted) setState(() => _error = 'Failed to pause user.');
    }
  }

  Future<void> _blockUserFromLive(_LiveComment comment) async {
    final authorId = comment.authorId;
    if (authorId == null || authorId.isEmpty) return;
    // Block the host → leave the stream
    final isHost = _activeStream?.hostUserId == authorId;
    try {
      await ProfileService.blockUser(authorId);
      if (isHost) {
        // kicked out — go home
        if (!mounted) return;
        setState(() => _leftVoluntarily = true);
        await _disposeRoom();
        if (!mounted) return;
        Navigator.of(context).pushAndRemoveUntil(
          MaterialPageRoute(builder: (_) => const HomeScreen()),
          (_) => false,
        );
        return;
      }
      setState(() => _blockedUserIds.add(authorId));
    } catch (_) {
      if (mounted) setState(() => _error = 'Failed to block user.');
    }
  }

  // ── Comment long-press menu ─────────────────────────────────────────────────

  void _showCommentMenu(BuildContext ctx, _LiveComment comment) {
    final isOwnComment = _myUserId != null && comment.authorId == _myUserId;
    if (isOwnComment || comment.isSystem) return;

    final token = AuthStorage.accessToken;
    final authHeader = token != null ? {'Authorization': 'Bearer $token'} : <String, String>{};

    showModalBottomSheet<void>(
      context: ctx,
      backgroundColor: Colors.transparent,
      builder: (_) => _CommentMenuSheet(
        comment: comment,
        isHostSession: _isHostSession,
        onGoToProfile: comment.authorId != null
            ? () {
                Navigator.of(ctx).pop();
                Navigator.of(ctx).push(MaterialPageRoute(
                  builder: (_) => ProfileScreen(userId: comment.authorId!),
                ));
              }
            : null,
        onHide: () {
          Navigator.of(ctx).pop();
          _hideComment(comment);
        },
        onDelete: _isHostSession
            ? () {
                Navigator.of(ctx).pop();
                _confirmDelete(ctx, comment);
              }
            : null,
        onReport: comment.authorId != null
            ? () async {
                Navigator.of(ctx).pop();
                await showReportUserSheet(ctx, userId: comment.authorId!, authHeader: authHeader);
              }
            : null,
        onPause: _isHostSession
            ? () {
                Navigator.of(ctx).pop();
                _showPauseSheet(ctx, comment);
              }
            : null,
        onBlock: () {
          Navigator.of(ctx).pop();
          _confirmBlock(ctx, comment);
        },
      ),
    );
  }

  void _confirmDelete(BuildContext ctx, _LiveComment comment) {
    showDialog<void>(
      context: ctx,
      builder: (_) => AlertDialog(
        title: const Text('Delete comment?'),
        content: const Text('This will remove the comment for all viewers and cannot be undone.'),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(), child: const Text('Cancel')),
          TextButton(
            onPressed: () { Navigator.of(ctx).pop(); unawaited(_deleteComment(comment)); },
            child: const Text('Delete', style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );
  }

  void _showPauseSheet(BuildContext ctx, _LiveComment comment) {
    const durations = [5, 10, 15, 30, 60, 1440];
    showModalBottomSheet<void>(
      context: ctx,
      backgroundColor: Colors.transparent,
      builder: (_) => _PauseDurationSheet(
        authorHandle: comment.author,
        durations: durations,
        formatDuration: _formatPauseDuration,
        onSelect: (minutes) {
          Navigator.of(ctx).pop();
          unawaited(_muteUser(comment, minutes));
        },
      ),
    );
  }

  void _confirmBlock(BuildContext ctx, _LiveComment comment) {
    showDialog<void>(
      context: ctx,
      builder: (_) => AlertDialog(
        title: Text('Block ${comment.author}?'),
        content: const Text('They will no longer be able to see your content or interact with you.'),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(), child: const Text('Cancel')),
          TextButton(
            onPressed: () { Navigator.of(ctx).pop(); unawaited(_blockUserFromLive(comment)); },
            child: const Text('Block', style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );
  }

  Future<void> _openHostMenu() async {
    final stream = _activeStream;
    if (stream == null) return;

    final titleCtrl = TextEditingController(text: stream.title);
    final descCtrl = TextEditingController(text: stream.description);
    final pinCtrl = TextEditingController(text: stream.pinnedComment);
    final locCtrl = TextEditingController(text: stream.location);

    LivestreamLatencyMode selectedLatency = stream.latencyMode;
    bool saving = false;
    var closedBySave = false;

    final updatedFromModal = await showModalBottomSheet<LivestreamItem>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) {
        final tokens = _tokens;
        return StatefulBuilder(
          builder: (context, setModalState) {
            return Padding(
              padding: EdgeInsets.only(
                left: 12,
                right: 12,
                bottom: MediaQuery.of(context).viewInsets.bottom + 12,
              ),
              child: Container(
                decoration: BoxDecoration(
                  color: tokens.panel,
                  borderRadius: BorderRadius.circular(18),
                  border: Border.all(color: tokens.panelBorder),
                ),
                padding: const EdgeInsets.fromLTRB(14, 14, 14, 14),
                child: SingleChildScrollView(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Text(
                            'Host controls',
                            style: TextStyle(
                              color: tokens.text,
                              fontSize: 16,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          const Spacer(),
                          IconButton(
                            onPressed: () => Navigator.of(context).pop(),
                            icon: const Icon(Icons.close_rounded),
                          ),
                        ],
                      ),
                      _menuField(
                        controller: titleCtrl,
                        label: 'Title',
                        maxLines: 2,
                      ),
                      const SizedBox(height: 10),
                      _menuField(
                        controller: descCtrl,
                        label: 'Description',
                        maxLines: 3,
                      ),
                      const SizedBox(height: 10),
                      _menuField(
                        controller: pinCtrl,
                        label: 'Pinned comment',
                        maxLines: 2,
                      ),
                      const SizedBox(height: 10),
                      _menuField(
                        controller: locCtrl,
                        label: 'Location',
                        maxLines: 1,
                      ),
                      const SizedBox(height: 12),
                      Text(
                        'Latency mode',
                        style: TextStyle(
                          color: tokens.text,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 8),
                      DropdownButtonFormField<LivestreamLatencyMode>(
                        initialValue: selectedLatency,
                        items: const [
                          DropdownMenuItem(
                            value: LivestreamLatencyMode.adaptive,
                            child: Text('Adaptive'),
                          ),
                          DropdownMenuItem(
                            value: LivestreamLatencyMode.balanced,
                            child: Text('Balanced'),
                          ),
                          DropdownMenuItem(
                            value: LivestreamLatencyMode.low,
                            child: Text('Low latency'),
                          ),
                        ],
                        onChanged: (next) {
                          if (next == null) return;
                          setModalState(() => selectedLatency = next);
                        },
                      ),
                      const SizedBox(height: 14),
                      Row(
                        children: [
                          Expanded(
                            child: OutlinedButton.icon(
                              onPressed: saving
                                  ? null
                                  : () async {
                                      setModalState(() => saving = true);
                                      try {
                                        final updated =
                                            await LivestreamCreateService.updateLivestream(
                                              stream.id,
                                              title: titleCtrl.text,
                                              description: descCtrl.text,
                                              pinnedComment: pinCtrl.text,
                                              location: locCtrl.text,
                                              latencyMode: selectedLatency,
                                            );
                                        if (!context.mounted) return;
                                        closedBySave = true;
                                        Navigator.of(context).pop(updated);
                                      } on ApiException catch (e) {
                                        if (!mounted) return;
                                        setState(() => _error = e.message);
                                      } catch (_) {
                                        if (!mounted) return;
                                        setState(
                                          () => _error =
                                              'Unable to update livestream settings.',
                                        );
                                      } finally {
                                        if (context.mounted && !closedBySave) {
                                          setModalState(() => saving = false);
                                        }
                                      }
                                    },
                              icon: const Icon(Icons.save_outlined),
                              label: Text(
                                saving ? 'Saving...' : 'Save changes',
                              ),
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: FilledButton.icon(
                              onPressed: saving
                                  ? null
                                  : () async {
                                      final ok = await _confirmEndLivestream();
                                      if (!ok) return;
                                      if (_hostDirectMode) return;
                                      if (!context.mounted) return;
                                      Navigator.of(context).pop();
                                    },
                              style: FilledButton.styleFrom(
                                backgroundColor: Colors.red.shade600,
                              ),
                              icon: const Icon(Icons.stop_circle_outlined),
                              label: const Text('End live'),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            );
          },
        );
      },
    );

    titleCtrl.dispose();
    descCtrl.dispose();
    pinCtrl.dispose();
    locCtrl.dispose();

    if (!mounted || updatedFromModal == null) return;
    setState(() => _activeStream = updatedFromModal);
    await _publishMetaUpdate(updatedFromModal);
  }

  Future<void> _publishMetaUpdate(LivestreamItem item) async {
    final participant = _room?.localParticipant;
    if (participant == null) return;

    final payload = <String, dynamic>{
      'type': 'meta_update',
      'patch': {
        'title': item.title,
        'description': item.description,
        'pinnedComment': item.pinnedComment,
        'location': item.location,
        'latencyMode': item.latencyMode.value,
      },
    };

    try {
      await participant.publishData(
        utf8.encode(jsonEncode(payload)),
        reliable: true,
      );
    } catch (_) {}
  }

  Widget _menuField({
    required TextEditingController controller,
    required String label,
    int maxLines = 1,
  }) {
    return TextField(
      controller: controller,
      maxLines: maxLines,
      decoration: InputDecoration(
        labelText: label,
        border: const OutlineInputBorder(),
      ),
    );
  }

  Future<bool> _confirmEndLivestream() async {
    final stream = _activeStream;
    if (stream == null) return false;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: const Text('End livestream?'),
          content: const Text(
            'This will stop the livestream for all viewers immediately.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.of(context).pop(true),
              style: FilledButton.styleFrom(
                backgroundColor: Colors.red.shade600,
              ),
              child: const Text('End live'),
            ),
          ],
        );
      },
    );

    if (confirmed != true) return false;

    _hostStreamEnded = true;
    try {
      await LivestreamCreateService.endLivestream(stream.id);
      if (!mounted) return false;

      await _disposeRoom();

      if (_hostDirectMode) {
        if (!mounted) return true;
        Navigator.of(context, rootNavigator: true).pushAndRemoveUntil(
          MaterialPageRoute(builder: (_) => const HomeScreen()),
          (_) => false,
        );
        return true;
      }

      setState(() {
        _activeStream = null;
        _stageTrack = null;
        _comments.clear();
        _seenCommentIds.clear();
      });

      await _loadLiveList();
      _startListRefreshTimer();

      return true;
    } on ApiException catch (e) {
      if (!mounted) return false;
      setState(() => _error = e.message);
      return false;
    } catch (_) {
      if (!mounted) return false;
      setState(() => _error = 'Unable to end livestream now.');
      return false;
    }
  }

  Future<void> _leaveStream() async {
    _leftVoluntarily = true;
    if (_hostDirectMode) {
      await _disposeRoom();
      if (!mounted) return;
      Navigator.of(context).pop();
      return;
    }

    await _disposeRoom();
    if (!mounted) return;

    setState(() {
      _activeStream = null;
      _joinedRole = LivestreamRole.viewer;
      _roomConnected = false;
      _comments.clear();
      _seenCommentIds.clear();
      _error = null;
    });

    await _loadLiveList();
    _startListRefreshTimer();
  }

  String _compactCount(int value) {
    if (value >= 1000000) {
      return '${(value / 1000000).toStringAsFixed(value % 1000000 == 0 ? 0 : 1)}M';
    }
    if (value >= 1000) {
      return '${(value / 1000).toStringAsFixed(value % 1000 == 0 ? 0 : 1)}K';
    }
    return '$value';
  }

  @override
  Widget build(BuildContext context) {
    final active = _activeStream;
    if (active == null) {
      if (_hostDirectMode) {
        return _buildHostConnectingScreen();
      }
      return _buildLiveListScreen();
    }

    return _buildActiveLivestreamScreen(active);
  }

  Widget _buildHostConnectingScreen() {
    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 22),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const CircularProgressIndicator(),
                const SizedBox(height: 18),
                const Text(
                  'Connecting to your livestream room...',
                  style: TextStyle(color: Colors.white, fontSize: 15),
                  textAlign: TextAlign.center,
                ),
                if (_error != null) ...[
                  const SizedBox(height: 10),
                  Text(
                    _error!,
                    style: TextStyle(color: Colors.red.shade300),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 10),
                  FilledButton.icon(
                    onPressed: _joining
                        ? null
                        : () {
                            final streamId = widget.initialStreamId?.trim();
                            if (streamId == null || streamId.isEmpty) return;
                            _openStream(streamId, asHost: true);
                          },
                    icon: const Icon(Icons.refresh_rounded),
                    label: const Text('Retry connect'),
                  ),
                ],
                const SizedBox(height: 10),
                TextButton(
                  onPressed: () => Navigator.of(context).pop(),
                  child: const Text('Back'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildLiveListScreen() {
    final tokens = _tokens;

    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      appBar: AppBar(
        title: const Text('Live now'),
        actions: [
          IconButton(
            onPressed: _loadingList ? null : _loadLiveList,
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      body: Column(
        children: [
          if (_error != null)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              margin: const EdgeInsets.fromLTRB(12, 10, 12, 0),
              decoration: BoxDecoration(
                color: Colors.red.withValues(alpha: 0.12),
                border: Border.all(color: Colors.red.withValues(alpha: 0.3)),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(
                _error!,
                style: TextStyle(color: Colors.red.shade300),
              ),
            ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: _loadLiveList,
              child: _loadingList && _liveItems.isEmpty
                  ? const Center(child: CircularProgressIndicator())
                  : _liveItems.isEmpty
                  ? ListView(
                      children: const [
                        SizedBox(height: 180),
                        Center(
                          child: Text('No livestream is active right now.'),
                        ),
                      ],
                    )
                  : ListView.separated(
                      padding: const EdgeInsets.fromLTRB(12, 12, 12, 16),
                      itemCount: _liveItems.length,
                      separatorBuilder: (_, _) => const SizedBox(height: 10),
                      itemBuilder: (_, index) {
                        final item = _liveItems[index];
                        final viewerCount = max(item.viewerCount - 1, 0);
                        final isMine =
                            _myUserId != null && item.hostUserId == _myUserId;

                        return InkWell(
                          borderRadius: BorderRadius.circular(14),
                          onTap: _joining
                              ? null
                              : () => _openStream(item.id, asHost: isMine),
                          child: Container(
                            decoration: BoxDecoration(
                              color: tokens.panel,
                              border: Border.all(color: tokens.panelBorder),
                              borderRadius: BorderRadius.circular(14),
                            ),
                            padding: const EdgeInsets.all(12),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    Container(
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 9,
                                        vertical: 4,
                                      ),
                                      decoration: BoxDecoration(
                                        color: Colors.red.shade600,
                                        borderRadius: BorderRadius.circular(
                                          999,
                                        ),
                                      ),
                                      child: const Text(
                                        'LIVE',
                                        style: TextStyle(
                                          color: Colors.white,
                                          fontWeight: FontWeight.w700,
                                          fontSize: 11,
                                        ),
                                      ),
                                    ),
                                    const SizedBox(width: 8),
                                    Icon(
                                      Icons.visibility_outlined,
                                      color: tokens.textMuted,
                                      size: 16,
                                    ),
                                    const SizedBox(width: 4),
                                    Text(
                                      _compactCount(viewerCount),
                                      style: TextStyle(color: tokens.textMuted),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 8),
                                Text(
                                  item.title,
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                    color: tokens.text,
                                    fontSize: 15,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                                const SizedBox(height: 6),
                                Text(
                                  '@${item.hostName}',
                                  style: TextStyle(
                                    color: tokens.textMuted,
                                    fontSize: 12.5,
                                  ),
                                ),
                                if (item.description.trim().isNotEmpty) ...[
                                  const SizedBox(height: 6),
                                  Text(
                                    item.description.trim(),
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(
                                      color: tokens.textMuted,
                                      fontSize: 12.5,
                                    ),
                                  ),
                                ],
                              ],
                            ),
                          ),
                        );
                      },
                    ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildActiveLivestreamScreen(LivestreamItem stream) {
    final viewerCount = max(stream.viewerCount - 1, 0);

    final scaffold = Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        bottom: false,
        child: Stack(
          children: [
            Positioned.fill(child: _buildStage()),
            Positioned(
              top: 10,
              left: 10,
              right: 10,
              child: Row(
                children: [
                  IconButton(
                    onPressed: _leaveStream,
                    icon: const Icon(
                      Icons.arrow_back_rounded,
                      color: Colors.white,
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 6,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.red.shade600,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Text(
                      'LIVE',
                      style: TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                        fontSize: 12,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 9,
                      vertical: 6,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.black.withValues(alpha: 0.45),
                      borderRadius: BorderRadius.circular(999),
                      border: Border.all(color: Colors.white24),
                    ),
                    child: Row(
                      children: [
                        const Icon(
                          Icons.visibility_outlined,
                          size: 14,
                          color: Colors.white,
                        ),
                        const SizedBox(width: 4),
                        Text(
                          _compactCount(viewerCount),
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const Spacer(),
                  if (_isHostSession)
                    Container(
                      margin: const EdgeInsets.only(right: 8),
                      decoration: BoxDecoration(
                        color: Colors.black.withValues(alpha: 0.42),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: IconButton(
                        onPressed:
                            (_switchingCamera ||
                                _startingHostMedia ||
                                !_hostMediaStarted)
                            ? null
                            : _toggleHostCamera,
                        tooltip: 'Flip camera',
                        icon: Icon(
                          Icons.flip_camera_android_rounded,
                          color: (_switchingCamera || !_hostMediaStarted)
                              ? Colors.white38
                              : Colors.white,
                        ),
                      ),
                    ),
                  if (_isHostSession)
                    Container(
                      decoration: BoxDecoration(
                        color: Colors.black.withValues(alpha: 0.42),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: IconButton(
                        onPressed: _openHostMenu,
                        icon: const Icon(
                          Icons.more_horiz_rounded,
                          color: Colors.white,
                        ),
                      ),
                    ),
                ],
              ),
            ),
            if (stream.pinnedComment.trim().isNotEmpty)
              Positioned(
                left: 14,
                right: 14,
                top: 64,
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 8,
                  ),
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.38),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: Colors.white24),
                  ),
                  child: Text(
                    'Pinned: ${stream.pinnedComment.trim()}',
                    style: const TextStyle(color: Colors.white, fontSize: 12.5),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ),
            Positioned(
              left: 12,
              right: 12,
              bottom: 82,
              child: _buildCommentOverlay(),
            ),
            if (_error != null)
              Positioned(
                left: 12,
                right: 12,
                bottom: 148,
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 8,
                  ),
                  decoration: BoxDecoration(
                    color: Colors.red.withValues(alpha: 0.2),
                    border: Border.all(
                      color: Colors.red.withValues(alpha: 0.4),
                    ),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Text(
                    _error!,
                    style: const TextStyle(color: Colors.white),
                  ),
                ),
              ),
            Positioned(
              left: 10,
              right: 10,
              bottom: 22,
              child: Container(
                decoration: BoxDecoration(
                  color: Colors.black.withValues(alpha: 0.45),
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(color: Colors.white24),
                ),
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                child: Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _commentCtrl,
                        enabled: !_commentPaused,
                        style: const TextStyle(color: Colors.white),
                        minLines: 1,
                        maxLines: 2,
                        textInputAction: TextInputAction.send,
                        onSubmitted: (_) => _sendComment(),
                        decoration: InputDecoration(
                          hintText: _commentPaused
                              ? 'Paused${_pauseSecondsLeft > 0 ? ' (${_pauseSecondsLeft}s)' : ''}…'
                              : 'Comment on this live...',
                          hintStyle: const TextStyle(color: Colors.white70),
                          border: InputBorder.none,
                          contentPadding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 8,
                          ),
                        ),
                      ),
                    ),
                    IconButton(
                      onPressed: (_sendingComment || !_roomConnected || _commentPaused)
                          ? null
                          : _sendComment,
                      icon: Icon(
                        Icons.send_rounded,
                        color: (_sendingComment || !_roomConnected || _commentPaused)
                            ? Colors.white30
                            : Colors.white,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            if (_joining || _startingHostMedia)
              const Positioned.fill(
                child: IgnorePointer(
                  child: ColoredBox(
                    color: Color(0x4D000000),
                    child: Center(child: CircularProgressIndicator()),
                  ),
                ),
              ),
            if (!_isHostSession && _streamEndedRemotely)
              Positioned.fill(
                child: Container(
                  color: Colors.black.withValues(alpha: 0.88),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(
                        Icons.videocam_off_rounded,
                        color: Colors.white54,
                        size: 64,
                      ),
                      const SizedBox(height: 16),
                      const Text(
                        'Livestream has ended',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 20,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 8),
                      const Text(
                        'The host has ended this livestream.',
                        style: TextStyle(color: Colors.white70, fontSize: 14),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 28),
                      FilledButton.icon(
                        onPressed: () {
                          Navigator.of(context, rootNavigator: true)
                              .pushAndRemoveUntil(
                            MaterialPageRoute(
                              builder: (_) => const HomeScreen(),
                            ),
                            (_) => false,
                          );
                        },
                        icon: const Icon(Icons.home_rounded),
                        label: const Text('Back to home'),
                      ),
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
    );

    if (_isHostSession) {
      return PopScope(
        canPop: false,
        onPopInvokedWithResult: (didPop, _) {
          if (didPop) return;
          if (_hostStreamEnded) {
            Navigator.of(context, rootNavigator: true).pushAndRemoveUntil(
              MaterialPageRoute(builder: (_) => const HomeScreen()),
              (_) => false,
            );
            return;
          }
          unawaited(_confirmEndLivestream());
        },
        child: scaffold,
      );
    }

    return scaffold;
  }

  Widget _buildStage() {
    final track = _stageTrack;
    if (track == null) {
      return Container(
        color: Colors.black,
        alignment: Alignment.center,
        child: const Text(
          'Waiting for live video...',
          style: TextStyle(color: Colors.white70),
        ),
      );
    }

    final renderer = VideoTrackRenderer(track, fit: VideoViewFit.contain);

    // For viewers watching a mobile host using the front camera, the published
    // stream is horizontally mirrored at the hardware level. Apply scaleX(-1)
    // to restore natural orientation. The host's own local view is handled
    // automatically by VideoTrackRenderer's mirrorMode.auto.
    if (!_isHostSession && _hostIsFrontCamera) {
      return Transform(
        alignment: Alignment.center,
        transform: Matrix4.diagonal3Values(-1, 1, 1),
        child: renderer,
      );
    }

    return renderer;
  }

  Widget _buildCommentOverlay() {
    final visible = _comments.where((c) =>
      !_hiddenCommentIds.contains(c.id) &&
      !(c.authorId != null && _blockedUserIds.contains(c.authorId)),
    ).toList();

    if (visible.isEmpty) return const SizedBox.shrink();

    final maxHeight = MediaQuery.of(context).size.height * 0.34;
    return ConstrainedBox(
      constraints: BoxConstraints(maxHeight: maxHeight),
      child: ListView.builder(
        controller: _commentScrollCtrl,
        padding: EdgeInsets.zero,
        reverse: true,
        itemCount: visible.length,
        itemBuilder: (context, index) {
          final item = visible[visible.length - 1 - index];

          // System message (pause notice etc.)
          if (item.isSystem) {
            return Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Container(
                decoration: BoxDecoration(
                  color: const Color(0xFF0EA5E9).withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: const Color(0xFF0EA5E9).withValues(alpha: 0.25)),
                ),
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                child: Text(
                  item.text,
                  style: const TextStyle(
                    color: Colors.white70,
                    fontSize: 12,
                    fontStyle: FontStyle.italic,
                    height: 1.4,
                  ),
                ),
              ),
            );
          }

          final isOwnComment = _myUserId != null && item.authorId == _myUserId;
          final avatarUrl = item.avatarUrl?.trim();
          final showAvatar = avatarUrl != null && avatarUrl.isNotEmpty;

          return Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: GestureDetector(
              onLongPress: isOwnComment ? null : () => _showCommentMenu(context, item),
              child: Container(
                decoration: BoxDecoration(
                  color: Colors.black.withValues(alpha: 0.38),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: Colors.white24),
                ),
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    CircleAvatar(
                      radius: 13,
                      backgroundColor: Colors.white24,
                      backgroundImage: showAvatar ? NetworkImage(avatarUrl) : null,
                      child: showAvatar
                          ? null
                          : Text(
                              _avatarInitial(item.author),
                              style: const TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.w700,
                                fontSize: 11,
                              ),
                            ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: RichText(
                        text: TextSpan(
                          children: [
                            TextSpan(
                              text: item.author,
                              style: const TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            if (item.isHost)
                              const WidgetSpan(
                                alignment: PlaceholderAlignment.middle,
                                child: Padding(
                                  padding: EdgeInsets.only(left: 4, right: 4),
                                  child: Icon(
                                    Icons.workspace_premium_rounded,
                                    size: 14,
                                    color: Color(0xFFFFD166),
                                  ),
                                ),
                              ),
                            TextSpan(
                              text: ' ${item.text}',
                              style: const TextStyle(color: Colors.white, height: 1.25),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  String _avatarInitial(String name) {
    final normalized = name.replaceAll('@', '').trim();
    if (normalized.isEmpty) return '?';
    return normalized.substring(0, 1).toUpperCase();
  }
}

// ── Comment menu bottom sheet ─────────────────────────────────────────────────

class _CommentMenuSheet extends StatelessWidget {
  const _CommentMenuSheet({
    required this.comment,
    required this.isHostSession,
    this.onGoToProfile,
    required this.onHide,
    this.onDelete,
    this.onReport,
    this.onPause,
    required this.onBlock,
  });

  final _LiveComment comment;
  final bool isHostSession;
  final VoidCallback? onGoToProfile;
  final VoidCallback onHide;
  final VoidCallback? onDelete;
  final VoidCallback? onReport;
  final VoidCallback? onPause;
  final VoidCallback onBlock;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: Color(0xFF1E2330),
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      padding: const EdgeInsets.fromLTRB(0, 8, 0, 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 36,
            height: 4,
            margin: const EdgeInsets.only(bottom: 12),
            decoration: BoxDecoration(
              color: Colors.white24,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 6),
            child: Text(
              comment.author,
              style: const TextStyle(color: Colors.white70, fontSize: 13),
            ),
          ),
          const Divider(color: Colors.white12, height: 1),
          if (onGoToProfile != null)
            _menuTile(Icons.person_outline_rounded, 'Go to profile', onGoToProfile!),
          _menuTile(Icons.visibility_off_outlined, 'Hide this comment', onHide),
          if (onDelete != null)
            _menuTile(Icons.delete_outline_rounded, 'Delete', onDelete!, danger: true),
          if (onDelete != null || onReport != null || onPause != null)
            const Divider(color: Colors.white12, height: 1),
          if (onReport != null)
            _menuTile(Icons.flag_outlined, 'Report this user', onReport!),
          if (onPause != null)
            _menuTile(Icons.pause_circle_outline_rounded, 'Put user in a paused state', onPause!),
          _menuTile(Icons.block_rounded, 'Block this user', onBlock, danger: true),
        ],
      ),
    );
  }

  Widget _menuTile(IconData icon, String label, VoidCallback onTap, {bool danger = false}) {
    final color = danger ? const Color(0xFFEF4444) : Colors.white;
    return ListTile(
      leading: Icon(icon, color: color, size: 22),
      title: Text(label, style: TextStyle(color: color, fontSize: 15)),
      onTap: onTap,
      dense: true,
    );
  }
}

// ── Pause duration sheet ──────────────────────────────────────────────────────

class _PauseDurationSheet extends StatelessWidget {
  const _PauseDurationSheet({
    required this.authorHandle,
    required this.durations,
    required this.formatDuration,
    required this.onSelect,
  });

  final String authorHandle;
  final List<int> durations;
  final String Function(int) formatDuration;
  final void Function(int) onSelect;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: Color(0xFF1E2330),
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      padding: const EdgeInsets.fromLTRB(0, 8, 0, 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 36,
            height: 4,
            margin: const EdgeInsets.only(bottom: 12),
            decoration: BoxDecoration(
              color: Colors.white24,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 6),
            child: Text(
              'Pause $authorHandle for…',
              style: const TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.w600),
            ),
          ),
          const Divider(color: Colors.white12, height: 1),
          ...durations.map(
            (d) => ListTile(
              title: Text(formatDuration(d), style: const TextStyle(color: Colors.white, fontSize: 15)),
              onTap: () => onSelect(d),
              dense: true,
            ),
          ),
        ],
      ),
    );
  }
}

// ── Comment model ─────────────────────────────────────────────────────────────

class _LiveComment {
  const _LiveComment({
    required this.id,
    required this.author,
    required this.text,
    required this.isHost,
    this.authorId,
    this.avatarUrl,
    this.isSystem = false,
  });

  final String id;
  final String author;
  final String? authorId;
  final String text;
  final bool isHost;
  final String? avatarUrl;
  final bool isSystem;
}
