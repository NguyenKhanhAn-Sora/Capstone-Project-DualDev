import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/gestures.dart' show kPrimaryButton;
import 'package:flutter/material.dart';
import 'package:livekit_client/livekit_client.dart';

import 'dm_call_manager.dart';
import '../services/voice_channel_session_controller.dart';
import '../voice_channel_room_screen.dart';

/// Wraps the whole app (via `MaterialApp.builder`) so that incoming /
/// outgoing call popups are visible no matter which screen the user is on.
///
/// The native call screen itself is pushed onto the root navigator from
/// [DmCallManager], so it naturally renders above this overlay; this widget
/// only draws the ring / dialling cards.
class GlobalCallOverlay extends StatelessWidget {
  const GlobalCallOverlay({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        child,
        AnimatedBuilder(
          animation: Listenable.merge([
            DmCallManager.instance,
            VoiceChannelSessionController.instance,
          ]),
          builder: (context, __) {
            final mgr = DmCallManager.instance;
            final voice = VoiceChannelSessionController.instance;
            final dmFullCallUi =
                mgr.active != null && !mgr.isCallMinimized;
            final showVoicePip = voice.active &&
                voice.isVoiceUiMinimized &&
                !dmFullCallUi;

            final layers = <Widget>[];

            if (showVoicePip && voice.isVoiceTuckedToCorner) {
              layers.add(_VoiceDockedChip(
                offset: voice.voicePipOffset,
                session: voice,
                onOffsetChanged: voice.updateVoicePipOffset,
                onExpandFromCorner: voice.expandVoicePipFromCorner,
                onLeave: () => unawaited(voice.leave()),
              ));
            } else if (showVoicePip && !voice.isVoiceTuckedToCorner) {
              layers.add(_VoiceChannelMinimizedCard(
                offset: voice.voicePipOffset,
                session: voice,
                onOffsetChanged: voice.updateVoicePipOffset,
                onRestore: () => unawaited(_openVoiceRoomFromGlobalPip()),
                onLeave: () => unawaited(voice.leave()),
                onTuckToCorner: () {
                  final m = MediaQuery.sizeOf(context);
                  final p = MediaQuery.paddingOf(context);
                  const chip = _kDockedChipSize;
                  final ox =
                      (m.width - chip - 12).clamp(8.0, double.infinity);
                  final oy = (m.height - p.bottom - chip - 88)
                      .clamp(8.0 + p.top, double.infinity);
                  voice.tuckVoicePipToCorner(position: Offset(ox, oy));
                },
              ));
            }

            if (mgr.active != null) {
              if (!mgr.isCallMinimized) {
                if (layers.isEmpty) return const SizedBox.shrink();
                return Stack(fit: StackFit.expand, children: layers);
              }
              if (mgr.isMiniCallTuckedToCorner) {
                layers.add(_DockedMiniCallChip(
                  offset: mgr.miniCallOffset,
                  mgr: mgr,
                  onOffsetChanged: mgr.updateMiniCallOffset,
                  onExpandFromCorner: mgr.expandMiniCallFromCorner,
                  onHangup: () => mgr.hangupActive(),
                ));
              } else {
                layers.add(_MessengerMinimizedCallCard(
                  offset: mgr.miniCallOffset,
                  mgr: mgr,
                  onOffsetChanged: mgr.updateMiniCallOffset,
                  onRestore: mgr.restoreMinimizedCall,
                  onHangup: () => mgr.hangupActive(),
                  onTuckToCorner: () {
                    final m = MediaQuery.sizeOf(context);
                    final p = MediaQuery.paddingOf(context);
                    const chip = _kDockedChipSize;
                    final ox =
                        (m.width - chip - 12).clamp(8.0, double.infinity);
                    final oy = (m.height - p.bottom - chip - 88)
                        .clamp(8.0 + p.top, double.infinity);
                    mgr.tuckMiniCallToCorner(position: Offset(ox, oy));
                  },
                ));
              }
              return Stack(fit: StackFit.expand, children: layers);
            }

            final incoming = mgr.incoming;
            if (incoming != null) {
              return Stack(
                fit: StackFit.expand,
                children: [
                  ...layers,
                  Positioned.fill(
                    child: Material(
                      type: MaterialType.transparency,
                      child: _CallPopupCard(
                        title: incoming.callerName,
                        subtitle: incoming.video ? 'Video call' : 'Voice call',
                        statusText: 'Cuộc gọi đến',
                        avatarUrl: incoming.callerAvatarUrl,
                        acceptLabel: 'Chấp nhận',
                        rejectLabel: 'Từ chối',
                        onAccept: () => _acceptIncoming(context, mgr),
                        onReject: mgr.rejectIncoming,
                      ),
                    ),
                  ),
                ],
              );
            }

            final outgoing = mgr.outgoing;
            if (outgoing != null) {
              final statusText = switch (outgoing.status) {
                OutgoingCallStatus.calling => 'Đang gọi...',
                OutgoingCallStatus.rejected => 'Cuộc gọi bị từ chối',
                OutgoingCallStatus.noAnswer => 'Không có phản hồi',
              };
              return Stack(
                fit: StackFit.expand,
                children: [
                  ...layers,
                  Positioned.fill(
                    child: Material(
                      type: MaterialType.transparency,
                      child: _CallPopupCard(
                        title: outgoing.peerName,
                        subtitle: outgoing.video ? 'Video call' : 'Voice call',
                        statusText: statusText,
                        avatarUrl: outgoing.peerAvatarUrl,
                        acceptLabel: null,
                        rejectLabel: 'Hủy',
                        onAccept: null,
                        onReject: mgr.cancelOutgoing,
                      ),
                    ),
                  ),
                ],
              );
            }

            if (layers.isEmpty) return const SizedBox.shrink();
            return Stack(fit: StackFit.expand, children: layers);
          },
        ),
      ],
    );
  }

  Future<void> _acceptIncoming(BuildContext context, DmCallManager mgr) async {
    final voiceSession = VoiceChannelSessionController.instance;
    if (!voiceSession.active) {
      await mgr.acceptIncoming();
      return;
    }

    final leaveVoiceFirst = await showDialog<bool>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          backgroundColor: const Color(0xFF0E2247),
          title: const Text(
            'Đang ở kênh thoại server',
            style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700),
          ),
          content: Text(
            'Bạn đang trong kênh ${voiceSession.channelName ?? 'thoại'}. '
            'Bạn cần rời kênh thoại trước khi nhận cuộc gọi DM.',
            style: const TextStyle(color: Color(0xFFAFC0E2)),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(false),
              child: const Text('Từ chối'),
            ),
            FilledButton(
              onPressed: () => Navigator.of(dialogContext).pop(true),
              child: const Text('Rời kênh và nhận'),
            ),
          ],
        );
      },
    );

    if (leaveVoiceFirst == true) {
      await voiceSession.leave();
      await mgr.acceptIncoming();
      return;
    }
    mgr.rejectIncoming();
  }
}

Future<void> _openVoiceRoomFromGlobalPip() async {
  final v = VoiceChannelSessionController.instance;
  final server = v.joinedServerSummary;
  final channel = v.joinedChannelSnapshot;
  if (server == null || channel == null) return;
  final nav = DmCallManager.instance.rootNavigatorState;
  if (nav == null) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      unawaited(_openVoiceRoomFromGlobalPip());
    });
    return;
  }
  v.clearVoiceMinimized();
  await nav.push<bool>(
    MaterialPageRoute(
      fullscreenDialog: true,
      builder: (_) => VoiceChannelRoomScreen(
        server: server,
        channel: channel,
        participantName: v.joinedParticipantName.trim().isNotEmpty
            ? v.joinedParticipantName.trim()
            : 'Người dùng',
      ),
    ),
  );
}

/// Messenger-style floating PiP: rounded card, lime-tinted stage when remote
/// video is off, small local preview top-right, mic status bottom-right.
const double _kMinimizedCallWidth = 278;
const double _kMinimizedTopStripH = 30;
const double _kMinimizedBodyH = 150;
const double _kMinimizedCallTotalHeight =
    _kMinimizedTopStripH + _kMinimizedBodyH;

/// Small floating chip when the user tucks the mini call UI into a corner.
const double _kDockedChipSize = 56;

/// Vertical voice-channel PiP: narrow strip + scrollable participant list.
const double _kVoicePipWidth = 142;
const double _kVoicePipHeaderH = 32;
const double _kVoicePipFooterH = 38;

VideoTrack? _voicePipPickVideo(Participant p) {
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
  return screen ?? camera;
}

List<Participant> _voicePipSortedParticipants(List<Participant> raw) {
  final copy = List<Participant>.from(raw);
  copy.sort((a, b) {
    if (a is LocalParticipant && b is! LocalParticipant) return -1;
    if (b is LocalParticipant && a is! LocalParticipant) return 1;
    return 0;
  });
  return copy;
}

/// Voice PiP lives in [MaterialApp.builder]'s [Stack], where the default
/// texture [VideoTrackRenderer] can show Android's red "No overlay /
/// RawTexture" debug strip. Platform views avoid that path.
Widget _voiceChannelPipVideoTrack(VideoTrack track) {
  final usePlatformView = !kIsWeb &&
      (defaultTargetPlatform == TargetPlatform.android ||
          defaultTargetPlatform == TargetPlatform.iOS);
  return VideoTrackRenderer(
    track,
    fit: VideoViewFit.cover,
    renderMode:
        usePlatformView ? VideoRenderMode.platformView : VideoRenderMode.texture,
    autoCenter: false,
  );
}

class _VoicePipParticipantRow extends StatelessWidget {
  const _VoicePipParticipantRow({required this.participant});

  final Participant participant;

  @override
  Widget build(BuildContext context) {
    final participantName = participant.name.trim();
    final name =
        participantName.isNotEmpty ? participantName : participant.identity;
    final displayName =
        participant is LocalParticipant ? '$name (Bạn)' : name;
    final initial =
        name.isNotEmpty ? name.substring(0, 1).toUpperCase() : '?';
    final videoTrack = _voicePipPickVideo(participant);
    final speaking = participant.isSpeaking;

    return SizedBox(
      height: 56,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: SizedBox(
              width: 48,
              height: 48,
              child: videoTrack != null
                  ? _voiceChannelPipVideoTrack(videoTrack)
                  : ColoredBox(
                      color: const Color(0xFF1B2A4A),
                      child: Center(
                        child: Text(
                          initial,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 18,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  displayName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: Color(0xFFE8F5E0),
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 2),
                Icon(
                  speaking ? Icons.graphic_eq_rounded : Icons.hearing_rounded,
                  size: 13,
                  color: speaking
                      ? const Color(0xFF00C48C)
                      : const Color(0xFF8EA3CC),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _VoiceDockedChip extends StatefulWidget {
  const _VoiceDockedChip({
    required this.offset,
    required this.session,
    required this.onOffsetChanged,
    required this.onExpandFromCorner,
    required this.onLeave,
  });

  final Offset offset;
  final VoiceChannelSessionController session;
  final ValueChanged<Offset> onOffsetChanged;
  final VoidCallback onExpandFromCorner;
  final VoidCallback onLeave;

  @override
  State<_VoiceDockedChip> createState() => _VoiceDockedChipState();
}

class _VoiceDockedChipState extends State<_VoiceDockedChip> {
  Timer? _clock;

  @override
  void initState() {
    super.initState();
    widget.session.addListener(_onSession);
    _clock = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  void _onSession() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    widget.session.removeListener(_onSession);
    _clock?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.session.active) return const SizedBox.shrink();

    final media = MediaQuery.sizeOf(context);
    final pad = MediaQuery.paddingOf(context);
    final offset = widget.offset;
    final nextX = offset.dx.clamp(
      8.0,
      (media.width - _kDockedChipSize - 8).clamp(8.0, double.infinity),
    );
    final nextY = offset.dy.clamp(
      8.0 + pad.top,
      (media.height - _kDockedChipSize - pad.bottom - 8)
          .clamp(8.0 + pad.top, double.infinity),
    );

    return Positioned(
      left: nextX,
      top: nextY,
      child: GestureDetector(
        onPanUpdate: (details) {
          final nx = (offset.dx + details.delta.dx).clamp(
            8.0,
            (media.width - _kDockedChipSize - 8).clamp(8.0, double.infinity),
          );
          final ny = (offset.dy + details.delta.dy).clamp(
            8.0 + pad.top,
            (media.height - _kDockedChipSize - pad.bottom - 8)
                .clamp(8.0 + pad.top, double.infinity),
          );
          widget.onOffsetChanged(Offset(nx, ny));
        },
        child: Material(
          elevation: 12,
          shadowColor: Colors.black54,
          borderRadius: BorderRadius.circular(18),
          clipBehavior: Clip.antiAlias,
          color: const Color(0xFF1EB980),
          child: SizedBox(
            width: _kDockedChipSize,
            height: _kDockedChipSize,
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                Positioned.fill(
                  child: InkWell(
                    onTap: widget.onExpandFromCorner,
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(
                          Icons.keyboard_arrow_up_rounded,
                          color: Colors.white,
                          size: 28,
                        ),
                        Icon(
                          Icons.headset_mic_rounded,
                          color: Colors.white.withValues(alpha: 0.85),
                          size: 16,
                        ),
                      ],
                    ),
                  ),
                ),
                Positioned(
                  top: 0,
                  right: 0,
                  child: Material(
                    color: Colors.black26,
                    borderRadius: const BorderRadius.only(
                      bottomLeft: Radius.circular(10),
                    ),
                    child: InkWell(
                      onTap: widget.onLeave,
                      child: const Padding(
                        padding: EdgeInsets.all(4),
                        child: Icon(
                          Icons.logout_rounded,
                          color: Colors.white,
                          size: 16,
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _VoiceChannelMinimizedCard extends StatefulWidget {
  const _VoiceChannelMinimizedCard({
    required this.offset,
    required this.session,
    required this.onOffsetChanged,
    required this.onRestore,
    required this.onLeave,
    required this.onTuckToCorner,
  });

  final Offset offset;
  final VoiceChannelSessionController session;
  final ValueChanged<Offset> onOffsetChanged;
  final VoidCallback onRestore;
  final VoidCallback onLeave;
  final VoidCallback onTuckToCorner;

  @override
  State<_VoiceChannelMinimizedCard> createState() =>
      _VoiceChannelMinimizedCardState();
}

class _VoiceChannelMinimizedCardState extends State<_VoiceChannelMinimizedCard> {
  Timer? _clock;

  @override
  void initState() {
    super.initState();
    widget.session.addListener(_onSession);
    _clock = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  void _onSession() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    widget.session.removeListener(_onSession);
    _clock?.cancel();
    super.dispose();
  }

  String _formatMmSs(DateTime? started) {
    if (started == null) return '00:00';
    final sec = DateTime.now().difference(started).inSeconds.clamp(0, 359999);
    final m = sec ~/ 60;
    final s = sec % 60;
    return '${m.toString().padLeft(2, '0')}:${s.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    final v = widget.session;
    if (!v.active) return const SizedBox.shrink();

    final media = MediaQuery.sizeOf(context);
    final pad = MediaQuery.paddingOf(context);
    final offset = widget.offset;
    final maxCardH = (media.height * 0.52 - pad.vertical).clamp(220.0, 480.0);
    final minCardH = 200.0;
    const rowH = 56.0;
    const sep = 5.0;
    const listPadV = 10.0;
    final pipList = _voicePipSortedParticipants(v.participants);
    final listContentH = pipList.isEmpty
        ? 72.0
        : pipList.length * rowH +
            (pipList.length - 1) * sep +
            listPadV * 2;
    final cardH =
        (_kVoicePipHeaderH + listContentH + _kVoicePipFooterH)
            .clamp(minCardH, maxCardH);

    final nextX = offset.dx.clamp(
      8.0,
      (media.width - _kVoicePipWidth - 8).clamp(8.0, double.infinity),
    );
    final nextY = offset.dy.clamp(
      8.0 + pad.top,
      (media.height - cardH - pad.bottom - 8)
          .clamp(8.0 + pad.top, double.infinity),
    );

    final title = (v.channelName ?? '').trim().isNotEmpty
        ? v.channelName!.trim()
        : 'Kênh thoại';
    final subtitle = (v.serverName ?? '').trim();
    final micOn = v.micEnabled;

    return Positioned(
      left: nextX,
      top: nextY,
      child: Listener(
        onPointerMove: (PointerMoveEvent e) {
          if (e.buttons & kPrimaryButton != kPrimaryButton) return;
          final o = widget.session.voicePipOffset;
          final nx = (o.dx + e.delta.dx).clamp(
            8.0,
            (media.width - _kVoicePipWidth - 8).clamp(8.0, double.infinity),
          );
          final ny = (o.dy + e.delta.dy).clamp(
            8.0 + pad.top,
            (media.height - cardH - pad.bottom - 8)
                .clamp(8.0 + pad.top, double.infinity),
          );
          widget.onOffsetChanged(Offset(nx, ny));
        },
        child: Material(
          elevation: 12,
          shadowColor: Colors.black54,
          borderRadius: BorderRadius.circular(22),
          clipBehavior: Clip.none,
          color: Colors.transparent,
          child: ClipRRect(
            borderRadius: BorderRadius.circular(22),
            clipBehavior: Clip.antiAlias,
            child: SizedBox(
              width: _kVoicePipWidth,
              height: cardH,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  ColoredBox(
                    color: const Color(0xFF1EB980),
                    child: SizedBox(
                      height: _kVoicePipHeaderH,
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 4),
                        child: Row(
                          children: [
                            const Icon(
                              Icons.headset_mic_rounded,
                              color: Colors.white,
                              size: 15,
                            ),
                            const SizedBox(width: 4),
                            Expanded(
                              child: Text(
                                title,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontWeight: FontWeight.w700,
                                  fontSize: 11,
                                ),
                              ),
                            ),
                            Tooltip(
                              message: 'Rời phòng',
                              child: Material(
                                color: Colors.transparent,
                                child: InkWell(
                                  onTap: widget.onLeave,
                                  borderRadius: BorderRadius.circular(999),
                                  child: const SizedBox(
                                    width: 26,
                                    height: 26,
                                    child: Icon(
                                      Icons.logout_rounded,
                                      color: Colors.white,
                                      size: 16,
                                    ),
                                  ),
                                ),
                              ),
                            ),
                            Tooltip(
                              message: 'Thu nhỏ góc',
                              child: Material(
                                color: Colors.white.withValues(alpha: 0.2),
                                borderRadius: BorderRadius.circular(999),
                                child: InkWell(
                                  onTap: widget.onTuckToCorner,
                                  borderRadius: BorderRadius.circular(999),
                                  child: const SizedBox(
                                    width: 26,
                                    height: 26,
                                    child: Icon(
                                      Icons.south_east_rounded,
                                      color: Colors.white,
                                      size: 15,
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                  Expanded(
                    child: GestureDetector(
                      behavior: HitTestBehavior.opaque,
                      onTap: widget.onRestore,
                      child: ColoredBox(
                        color: const Color(0xFF0C1528),
                        child: pipList.isEmpty
                            ? Center(
                                child: Padding(
                                  padding: const EdgeInsets.all(8),
                                  child: Text(
                                    subtitle.isNotEmpty
                                        ? subtitle
                                        : 'Đang chờ…',
                                    textAlign: TextAlign.center,
                                    maxLines: 3,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(
                                      color: Color(0xFF8EA3CC),
                                      fontSize: 11,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ),
                              )
                            : ListView.separated(
                                padding: const EdgeInsets.fromLTRB(
                                  8,
                                  10,
                                  8,
                                  10,
                                ),
                                itemCount: pipList.length,
                                separatorBuilder: (_, __) =>
                                    const SizedBox(height: sep),
                                itemBuilder: (_, i) {
                                  return _VoicePipParticipantRow(
                                    participant: pipList[i],
                                  );
                                },
                              ),
                      ),
                    ),
                  ),
                  ColoredBox(
                    color: const Color(0xFF121C30),
                    child: SizedBox(
                      height: _kVoicePipFooterH,
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 6),
                        child: Row(
                          children: [
                            Text(
                              _formatMmSs(v.voiceJoinedAt),
                              style: const TextStyle(
                                color: Color(0xFF6B7FA6),
                                fontSize: 10,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            const SizedBox(width: 6),
                            Expanded(
                              child: Text(
                                subtitle.isNotEmpty ? subtitle : 'Kênh thoại',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  color: Color(0xFF8EA3CC),
                                  fontSize: 10,
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                            ),
                            DecoratedBox(
                              decoration: BoxDecoration(
                                color: Colors.white.withValues(alpha: 0.12),
                                borderRadius: BorderRadius.circular(999),
                              ),
                              child: Padding(
                                padding: const EdgeInsets.all(4),
                                child: Icon(
                                  micOn
                                      ? Icons.mic_rounded
                                      : Icons.mic_off_rounded,
                                  size: 15,
                                  color: micOn
                                      ? const Color(0xFF1EB980)
                                      : const Color(0xFFFF5770),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
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

class _DockedMiniCallChip extends StatefulWidget {
  const _DockedMiniCallChip({
    required this.offset,
    required this.mgr,
    required this.onOffsetChanged,
    required this.onExpandFromCorner,
    required this.onHangup,
  });

  final Offset offset;
  final DmCallManager mgr;
  final ValueChanged<Offset> onOffsetChanged;
  final VoidCallback onExpandFromCorner;
  final VoidCallback onHangup;

  @override
  State<_DockedMiniCallChip> createState() => _DockedMiniCallChipState();
}

class _DockedMiniCallChipState extends State<_DockedMiniCallChip> {
  Timer? _clock;

  @override
  void initState() {
    super.initState();
    widget.mgr.addListener(_onMgr);
    _clock = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  void _onMgr() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    widget.mgr.removeListener(_onMgr);
    _clock?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.mgr.active == null) return const SizedBox.shrink();

    final media = MediaQuery.sizeOf(context);
    final pad = MediaQuery.paddingOf(context);
    final offset = widget.offset;
    final nextX = offset.dx.clamp(
      8.0,
      (media.width - _kDockedChipSize - 8).clamp(8.0, double.infinity),
    );
    final nextY = offset.dy.clamp(
      8.0 + pad.top,
      (media.height - _kDockedChipSize - pad.bottom - 8)
          .clamp(8.0 + pad.top, double.infinity),
    );

    final act = widget.mgr.active!;
    final isVideo = act.video;

    return Positioned(
      left: nextX,
      top: nextY,
      child: GestureDetector(
        onPanUpdate: (details) {
          final nx = (offset.dx + details.delta.dx).clamp(
            8.0,
            (media.width - _kDockedChipSize - 8).clamp(8.0, double.infinity),
          );
          final ny = (offset.dy + details.delta.dy).clamp(
            8.0 + pad.top,
            (media.height - _kDockedChipSize - pad.bottom - 8)
                .clamp(8.0 + pad.top, double.infinity),
          );
          widget.onOffsetChanged(Offset(nx, ny));
        },
        child: Material(
          elevation: 12,
          shadowColor: Colors.black54,
          borderRadius: BorderRadius.circular(18),
          clipBehavior: Clip.antiAlias,
          color: const Color(0xFF1EB980),
          child: SizedBox(
            width: _kDockedChipSize,
            height: _kDockedChipSize,
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                Positioned.fill(
                  child: InkWell(
                    onTap: widget.onExpandFromCorner,
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(
                          Icons.keyboard_arrow_up_rounded,
                          color: Colors.white,
                          size: 28,
                        ),
                        Icon(
                          isVideo
                              ? Icons.videocam_rounded
                              : Icons.call_rounded,
                          color: Colors.white.withValues(alpha: 0.85),
                          size: 16,
                        ),
                      ],
                    ),
                  ),
                ),
                Positioned(
                  top: 0,
                  right: 0,
                  child: Material(
                    color: Colors.black26,
                    borderRadius: const BorderRadius.only(
                      bottomLeft: Radius.circular(10),
                    ),
                    child: InkWell(
                      onTap: widget.onHangup,
                      child: const Padding(
                        padding: EdgeInsets.all(4),
                        child: Icon(
                          Icons.close_rounded,
                          color: Colors.white,
                          size: 16,
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _MessengerMinimizedCallCard extends StatefulWidget {
  const _MessengerMinimizedCallCard({
    required this.offset,
    required this.mgr,
    required this.onOffsetChanged,
    required this.onRestore,
    required this.onHangup,
    required this.onTuckToCorner,
  });

  final Offset offset;
  final DmCallManager mgr;
  final ValueChanged<Offset> onOffsetChanged;
  final VoidCallback onRestore;
  final VoidCallback onHangup;
  final VoidCallback onTuckToCorner;

  @override
  State<_MessengerMinimizedCallCard> createState() =>
      _MessengerMinimizedCallCardState();
}

class _MessengerMinimizedCallCardState extends State<_MessengerMinimizedCallCard> {
  Timer? _clock;

  @override
  void initState() {
    super.initState();
    widget.mgr.addListener(_onMgr);
    _clock = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  void _onMgr() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    widget.mgr.removeListener(_onMgr);
    _clock?.cancel();
    super.dispose();
  }

  String _formatMmSs(DateTime? started) {
    if (started == null) return '00:00';
    final sec = DateTime.now().difference(started).inSeconds.clamp(0, 359999);
    final m = sec ~/ 60;
    final s = sec % 60;
    return '${m.toString().padLeft(2, '0')}:${s.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    final act = widget.mgr.active;
    if (act == null) return const SizedBox.shrink();

    final media = MediaQuery.sizeOf(context);
    final pad = MediaQuery.paddingOf(context);
    final offset = widget.offset;
    final nextX = offset.dx.clamp(
      8.0,
      (media.width - _kMinimizedCallWidth - 8).clamp(8.0, double.infinity),
    );
    final nextY = offset.dy.clamp(
      8.0 + pad.top,
      (media.height - _kMinimizedCallTotalHeight - pad.bottom - 8)
          .clamp(8.0 + pad.top, double.infinity),
    );

    final title = act.peerName.isNotEmpty ? act.peerName : 'Cuộc gọi';
    final remoteTrack = widget.mgr.minimizedRemoteMainTrack;
    final localTrack = widget.mgr.minimizedLocalPipTrack;
    final remoteIsScreen = widget.mgr.minimizedRemoteMainIsScreenShare;
    final micOn = widget.mgr.activeMicEnabled;
    final isVideo = act.video;
    final avatarUrl = act.peerAvatarUrl;
    final myInitial = () {
      final n = (widget.mgr.myDisplayName ?? 'Bạn').trim();
      if (n.isEmpty) return 'B';
      return n.substring(0, 1).toUpperCase();
    }();

    return Positioned(
      left: nextX,
      top: nextY,
      child: GestureDetector(
        onPanUpdate: (details) {
          final nx = (offset.dx + details.delta.dx).clamp(
            8.0,
            (media.width - _kMinimizedCallWidth - 8).clamp(8.0, double.infinity),
          );
          final ny = (offset.dy + details.delta.dy).clamp(
            8.0 + pad.top,
            (media.height - _kMinimizedCallTotalHeight - pad.bottom - 8)
                .clamp(8.0 + pad.top, double.infinity),
          );
          widget.onOffsetChanged(Offset(nx, ny));
        },
        child: Material(
          elevation: 12,
          shadowColor: Colors.black54,
          borderRadius: BorderRadius.circular(22),
          clipBehavior: Clip.antiAlias,
          color: Colors.transparent,
          child: SizedBox(
            width: _kMinimizedCallWidth,
            height: _kMinimizedCallTotalHeight,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                ColoredBox(
                  color: const Color(0xFF1EB980),
                  child: SizedBox(
                    height: _kMinimizedTopStripH,
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 10),
                      child: Row(
                        children: [
                          Icon(
                            isVideo ? Icons.videocam_rounded : Icons.call_rounded,
                            color: Colors.white,
                            size: 18,
                          ),
                          const SizedBox(width: 6),
                          Expanded(
                            child: Text(
                              title,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.w700,
                                fontSize: 13,
                              ),
                            ),
                          ),
                          Material(
                            color: Colors.white.withValues(alpha: 0.22),
                            borderRadius: BorderRadius.circular(999),
                            child: InkWell(
                              onTap: widget.onTuckToCorner,
                              borderRadius: BorderRadius.circular(999),
                              child: const Padding(
                                padding: EdgeInsets.all(5),
                                child: Icon(
                                  Icons.south_east_rounded,
                                  color: Colors.white,
                                  size: 18,
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(width: 6),
                          Text(
                            _formatMmSs(widget.mgr.activeCallStartedAt),
                            style: const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.w600,
                              fontSize: 13,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
                Expanded(
                  child: Stack(
                    clipBehavior: Clip.hardEdge,
                    children: [
                      Positioned.fill(
                        child: GestureDetector(
                          behavior: HitTestBehavior.opaque,
                          onTap: widget.onRestore,
                          child: remoteTrack != null
                              ? ColoredBox(
                                  color: Colors.black,
                                  child: VideoTrackRenderer(
                                    remoteTrack,
                                    fit: remoteIsScreen
                                        ? VideoViewFit.contain
                                        : VideoViewFit.cover,
                                  ),
                                )
                              : Container(
                                  decoration: const BoxDecoration(
                                    gradient: LinearGradient(
                                      begin: Alignment.topLeft,
                                      end: Alignment.bottomRight,
                                      colors: [
                                        Color(0xFFE8F5A0),
                                        Color(0xFFC8E678),
                                        Color(0xFFB8DC6A),
                                      ],
                                    ),
                                  ),
                                  alignment: Alignment.center,
                                  child: CircleAvatar(
                                    radius: 44,
                                    backgroundColor: Colors.white,
                                    backgroundImage:
                                        (avatarUrl != null && avatarUrl.isNotEmpty)
                                            ? NetworkImage(avatarUrl)
                                            : null,
                                    child:
                                        (avatarUrl == null || avatarUrl.isEmpty)
                                            ? Text(
                                                title.isNotEmpty
                                                    ? title
                                                        .substring(0, 1)
                                                        .toUpperCase()
                                                    : '?',
                                                style: const TextStyle(
                                                  color: Color(0xFF2D5016),
                                                  fontWeight: FontWeight.w800,
                                                  fontSize: 36,
                                                ),
                                              )
                                            : null,
                                  ),
                                ),
                        ),
                      ),
                      if (isVideo)
                        Positioned(
                          top: 8,
                          right: 8,
                          width: 58,
                          height: 78,
                          child: Material(
                            elevation: 4,
                            borderRadius: BorderRadius.circular(10),
                            clipBehavior: Clip.antiAlias,
                            color: Colors.black,
                                    child: localTrack != null
                                ? VideoTrackRenderer(
                                    localTrack,
                                    fit: VideoViewFit.cover,
                                  )
                                : ColoredBox(
                                    color: const Color(0xFF0F1B37),
                                    child: Center(
                                      child: Text(
                                        myInitial,
                                        style: const TextStyle(
                                          color: Colors.white,
                                          fontWeight: FontWeight.w800,
                                          fontSize: 22,
                                        ),
                                      ),
                                    ),
                                  ),
                          ),
                        ),
                      Positioned(
                        right: 8,
                        bottom: 8,
                        child: DecoratedBox(
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.92),
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: Padding(
                            padding: const EdgeInsets.all(5),
                            child: Icon(
                              micOn ? Icons.mic_rounded : Icons.mic_off_rounded,
                              size: 18,
                              color: micOn
                                  ? const Color(0xFF1EB980)
                                  : const Color(0xFF555555),
                            ),
                          ),
                        ),
                      ),
                      Positioned(
                        left: 8,
                        bottom: 8,
                        child: Material(
                          color: const Color(0xFFED4245),
                          shape: const CircleBorder(),
                          child: InkWell(
                            customBorder: const CircleBorder(),
                            onTap: widget.onHangup,
                            child: const Padding(
                              padding: EdgeInsets.all(8),
                              child: Icon(
                                Icons.call_end_rounded,
                                color: Colors.white,
                                size: 20,
                              ),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _CallPopupCard extends StatelessWidget {
  const _CallPopupCard({
    required this.title,
    required this.subtitle,
    required this.statusText,
    required this.rejectLabel,
    required this.onReject,
    this.avatarUrl,
    this.acceptLabel,
    this.onAccept,
  });

  final String title;
  final String subtitle;
  final String statusText;
  final String rejectLabel;
  final VoidCallback onReject;
  final String? avatarUrl;
  final String? acceptLabel;
  final Future<void> Function()? onAccept;

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: const Color(0xB3000000),
      child: Center(
        child: Container(
          width: 320,
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            color: const Color(0xFF0F1B37),
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: const Color(0xFF2C3A5A)),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              CircleAvatar(
                radius: 34,
                backgroundColor: const Color(0xFFDDDDDD),
                backgroundImage: (avatarUrl ?? '').isNotEmpty
                    ? NetworkImage(avatarUrl!)
                    : null,
                child: (avatarUrl ?? '').isNotEmpty
                    ? null
                    : Text(
                        title.isNotEmpty
                            ? title.substring(0, 1).toUpperCase()
                            : '?',
                        style: const TextStyle(
                          color: Color(0xFF1B2A4A),
                          fontWeight: FontWeight.w700,
                          fontSize: 24,
                        ),
                      ),
              ),
              const SizedBox(height: 12),
              Text(
                title,
                style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w700,
                  fontSize: 18,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                subtitle,
                style: const TextStyle(color: Color(0xFFB6C2DC)),
              ),
              const SizedBox(height: 8),
              Text(
                statusText,
                style: const TextStyle(
                  color: Color(0xFF00C48C),
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 18),
              Row(
                children: [
                  if (acceptLabel != null && onAccept != null) ...[
                    Expanded(
                      child: FilledButton(
                        style: FilledButton.styleFrom(
                          backgroundColor: const Color(0xFF00C48C),
                          padding: const EdgeInsets.symmetric(vertical: 14),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(999),
                          ),
                        ),
                        onPressed: () => onAccept!(),
                        child: Text(acceptLabel!),
                      ),
                    ),
                    const SizedBox(width: 12),
                  ],
                  Expanded(
                    child: FilledButton(
                      style: FilledButton.styleFrom(
                        backgroundColor: const Color(0xFFED4245),
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(999),
                        ),
                      ),
                      onPressed: onReject,
                      child: Text(rejectLabel),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
