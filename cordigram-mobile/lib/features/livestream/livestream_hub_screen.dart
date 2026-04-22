import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:livekit_client/livekit_client.dart';

import '../../core/config/app_theme.dart';
import '../../core/services/api_service.dart';
import '../../core/services/auth_storage.dart';
import '../home/home_screen.dart';
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

class _LivestreamHubScreenState extends State<LivestreamHubScreen> {
  final _commentCtrl = TextEditingController();
  final _commentScrollCtrl = ScrollController();

  final List<_LiveComment> _comments = <_LiveComment>[];
  final Set<String> _seenCommentIds = <String>{};

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
  bool _startingHostMedia = false;
  bool _hostMediaStarted = false;
  bool _switchingCamera = false;
  bool _isFrontCamera = true;

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
    _bootstrap();
  }

  @override
  void dispose() {
    _commentCtrl.dispose();
    _commentScrollCtrl.dispose();
    _listTimer?.cancel();
    _streamRefreshTimer?.cancel();
    unawaited(_disposeRoom());
    super.dispose();
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

      _appendComment(
        _LiveComment(
          id: commentId.isEmpty ? _commentId() : commentId,
          author: author,
          text: text,
          isHost: isHost,
          avatarUrl: ((payload['avatarUrl'] as String?) ?? '').trim(),
        ),
      );
      return;
    }

    if (type == 'comment_history') {
      final list = payload['comments'];
      if (list is! List) return;
      for (final item in list.whereType<Map<String, dynamic>>()) {
        final text = ((item['text'] as String?) ?? '').trim();
        if (text.isEmpty) continue;

        _appendComment(
          _LiveComment(
            id: ((item['id'] as String?) ?? '').trim().isEmpty
                ? _commentId()
                : (item['id'] as String),
            author: ((item['authorHandle'] as String?) ?? 'Viewer').trim(),
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
          .map(
            (c) => <String, dynamic>{
              'id': c.id,
              'authorHandle': c.author,
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
    if (text.isEmpty || _sendingComment || !_roomConnected) return;

    final participant = _room?.localParticipant;
    if (participant == null) return;

    final id = _commentId();
    final draft = _LiveComment(
      id: id,
      author: _myParticipantName,
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
    final tokens = _tokens;
    final viewerCount = max(stream.viewerCount - 1, 0);

    return Scaffold(
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
                        style: TextStyle(color: tokens.text),
                        minLines: 1,
                        maxLines: 2,
                        textInputAction: TextInputAction.send,
                        onSubmitted: (_) => _sendComment(),
                        decoration: const InputDecoration(
                          hintText: 'Comment on this live...',
                          hintStyle: TextStyle(color: Colors.white70),
                          border: InputBorder.none,
                          contentPadding: EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 8,
                          ),
                        ),
                      ),
                    ),
                    IconButton(
                      onPressed: (_sendingComment || !_roomConnected)
                          ? null
                          : _sendComment,
                      icon: Icon(
                        Icons.send_rounded,
                        color: (_sendingComment || !_roomConnected)
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
          ],
        ),
      ),
    );
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

    return VideoTrackRenderer(track, fit: VideoViewFit.contain);
  }

  Widget _buildCommentOverlay() {
    if (_comments.isEmpty) {
      return const SizedBox.shrink();
    }

    final maxHeight = MediaQuery.of(context).size.height * 0.34;
    return ConstrainedBox(
      constraints: BoxConstraints(maxHeight: maxHeight),
      child: ListView.builder(
        controller: _commentScrollCtrl,
        padding: EdgeInsets.zero,
        reverse: true,
        itemCount: _comments.length,
        itemBuilder: (context, index) {
          final item = _comments[_comments.length - 1 - index];
          final avatarUrl = item.avatarUrl?.trim();
          final showAvatar = avatarUrl != null && avatarUrl.isNotEmpty;
          return Padding(
            padding: const EdgeInsets.only(bottom: 6),
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
                    backgroundImage: showAvatar
                        ? NetworkImage(avatarUrl)
                        : null,
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
                            style: const TextStyle(
                              color: Colors.white,
                              height: 1.25,
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

class _LiveComment {
  const _LiveComment({
    required this.id,
    required this.author,
    required this.text,
    required this.isHost,
    this.avatarUrl,
  });

  final String id;
  final String author;
  final String text;
  final bool isHost;
  final String? avatarUrl;
}
