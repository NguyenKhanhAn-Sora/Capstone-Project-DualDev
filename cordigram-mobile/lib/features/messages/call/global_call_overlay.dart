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
        // Own [Overlay] so PiP controls / platform video views are not built
        // under [MaterialApp.builder] where [Overlay.of] is unavailable.
        const Positioned.fill(child: _GlobalCallFloatingOverlay()),
      ],
    );
  }
}

/// Hosts call / voice PiP layers in a dedicated [Overlay] above routes.
class _GlobalCallFloatingOverlay extends StatefulWidget {
  const _GlobalCallFloatingOverlay();

  @override
  State<_GlobalCallFloatingOverlay> createState() =>
      _GlobalCallFloatingOverlayState();
}

class _GlobalCallFloatingOverlayState extends State<_GlobalCallFloatingOverlay> {
  late final OverlayEntry _entry;

  void _markEntryDirty() {
    _entry.markNeedsBuild();
  }

  @override
  void initState() {
    super.initState();
    _entry = OverlayEntry(builder: _buildLayers);
    DmCallManager.instance.addListener(_markEntryDirty);
    VoiceChannelSessionController.instance.addListener(_markEntryDirty);
  }

  @override
  void dispose() {
    DmCallManager.instance.removeListener(_markEntryDirty);
    VoiceChannelSessionController.instance.removeListener(_markEntryDirty);
    _entry.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Overlay(initialEntries: [_entry]);
  }

  Widget _buildLayers(BuildContext context) {
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
                        onAccept: () => _acceptIncomingDmCall(mgr),
                        onReject: mgr.rejectIncoming,
                      ),
                    ),
                  ),
                ],
              );
            }

            final outgoings = mgr.outgoings;
            if (outgoings.isNotEmpty) {
              return Stack(
                fit: StackFit.expand,
                children: [
                  ...layers,
                  Positioned.fill(
                    child: Material(
                      type: MaterialType.transparency,
                      child: Center(
                        child: SingleChildScrollView(
                          padding: const EdgeInsets.symmetric(vertical: 24),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              for (final outgoing in outgoings) ...[
                                _CallPopupCard(
                                  title: outgoing.peerName,
                                  subtitle: outgoing.video
                                      ? 'Video call'
                                      : 'Voice call',
                                  statusText: switch (outgoing.status) {
                                    OutgoingCallStatus.calling =>
                                      'Đang gọi...',
                                    OutgoingCallStatus.rejected =>
                                      'Cuộc gọi bị từ chối',
                                    OutgoingCallStatus.noAnswer =>
                                      'Không có phản hồi',
                                  },
                                  avatarUrl: outgoing.peerAvatarUrl,
                                  acceptLabel: null,
                                  rejectLabel: 'Hủy',
                                  onAccept: null,
                                  onReject: () => mgr.cancelOutgoingFor(
                                    outgoing.peerUserId,
                                  ),
                                ),
                                if (outgoing != outgoings.last)
                                  const SizedBox(height: 12),
                              ],
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
              );
            }

    if (layers.isEmpty) return const SizedBox.shrink();
    return Stack(fit: StackFit.expand, children: layers);
  }
}

Future<void> _acceptIncomingDmCall(DmCallManager mgr) async {
  final voiceSession = VoiceChannelSessionController.instance;
  if (!voiceSession.active) {
    await mgr.acceptIncoming();
    return;
  }

  final dialogContext = DmCallManager.instance.rootNavigatorState?.context;
  if (dialogContext == null) return;

  final leaveVoiceFirst = await showDialog<bool>(
    context: dialogContext,
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

/// Google Meet-style voice-channel PiP: portrait floating window with video.
const double _kVoicePipWidth = 200;
const double _kVoicePipHeight = 280;

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

/// Returns the best video track to feature in the minimized PiP window:
/// active speaker with video first, then any participant with video, or null.
VideoTrack? _voicePipMainVideo(List<Participant> participants) {
  for (final p in participants) {
    if (p.isSpeaking) {
      final t = _voicePipPickVideo(p);
      if (t != null) return t;
    }
  }
  for (final p in participants) {
    final t = _voicePipPickVideo(p);
    if (t != null) return t;
  }
  return null;
}

class _PipIconBtn extends StatelessWidget {
  const _PipIconBtn({
    required this.icon,
    required this.onTap,
    this.danger = false,
    this.tooltip,
  });
  final IconData icon;
  final VoidCallback onTap;
  final bool danger;
  final String? tooltip;

  @override
  Widget build(BuildContext context) {
    final bg = danger
        ? const Color(0xFFED4245).withValues(alpha: 0.85)
        : Colors.white.withValues(alpha: 0.18);
    final btn = GestureDetector(
      onTap: onTap,
      child: Container(
        width: 28,
        height: 28,
        decoration: BoxDecoration(color: bg, shape: BoxShape.circle),
        child: Icon(icon, color: Colors.white, size: 15),
      ),
    );
    if (tooltip != null) return Tooltip(message: tooltip!, child: btn);
    return btn;
  }
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
  @override
  Widget build(BuildContext context) {
    final v = widget.session;
    if (!v.active) return const SizedBox.shrink();

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
    final sorted = _voicePipSortedParticipants(v.participants);
    final mainVideo = _voicePipMainVideo(sorted);

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
          elevation: 14,
          shadowColor: Colors.black,
          borderRadius: BorderRadius.circular(18),
          clipBehavior: Clip.antiAlias,
          color: mainVideo != null ? Colors.black : const Color(0xFF1EB980),
          child: SizedBox(
            width: _kDockedChipSize,
            height: _kDockedChipSize,
            child: Stack(
              children: [
                if (mainVideo != null)
                  Positioned.fill(
                    child: _voiceChannelPipVideoTrack(mainVideo),
                  ),
                if (mainVideo != null)
                  Positioned.fill(
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.bottomCenter,
                          end: Alignment.topCenter,
                          colors: [
                            Colors.black.withValues(alpha: 0.55),
                            Colors.transparent,
                          ],
                        ),
                      ),
                    ),
                  ),
                Positioned.fill(
                  child: InkWell(
                    onTap: widget.onExpandFromCorner,
                    child: mainVideo == null
                        ? const Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(
                                Icons.keyboard_arrow_up_rounded,
                                color: Colors.white,
                                size: 28,
                              ),
                              Icon(
                                Icons.headset_mic_rounded,
                                color: Colors.white70,
                                size: 16,
                              ),
                            ],
                          )
                        : Align(
                            alignment: Alignment.bottomCenter,
                            child: Padding(
                              padding: const EdgeInsets.only(bottom: 5),
                              child: Icon(
                                Icons.keyboard_arrow_up_rounded,
                                color: Colors.white.withValues(alpha: 0.85),
                                size: 20,
                              ),
                            ),
                          ),
                  ),
                ),
                Positioned(
                  top: 2,
                  right: 2,
                  child: GestureDetector(
                    onTap: widget.onLeave,
                    child: Container(
                      width: 20,
                      height: 20,
                      decoration: BoxDecoration(
                        color: const Color(0xFFED4245).withValues(alpha: 0.85),
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(
                        Icons.close_rounded,
                        color: Colors.white,
                        size: 13,
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
    _clock = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _clock?.cancel();
    super.dispose();
  }

  String _fmtTime(DateTime? started) {
    if (started == null) return '00:00';
    final s = DateTime.now().difference(started).inSeconds.clamp(0, 359999);
    final m = s ~/ 60;
    return '${m.toString().padLeft(2, '0')}:${(s % 60).toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    final v = widget.session;
    if (!v.active) return const SizedBox.shrink();

    final media = MediaQuery.sizeOf(context);
    final pad = MediaQuery.paddingOf(context);
    final offset = widget.offset;
    const cardW = _kVoicePipWidth;
    const cardH = _kVoicePipHeight;

    final nextX = offset.dx.clamp(
      8.0,
      (media.width - cardW - 8).clamp(8.0, double.infinity),
    );
    final nextY = offset.dy.clamp(
      8.0 + pad.top,
      (media.height - cardH - pad.bottom - 8)
          .clamp(8.0 + pad.top, double.infinity),
    );

    final pipList = _voicePipSortedParticipants(v.participants);
    final mainVideo = _voicePipMainVideo(pipList);
    final title = (v.channelName ?? '').trim().isNotEmpty
        ? v.channelName!.trim()
        : 'Kênh thoại';
    final micOn = v.micEnabled;
    final count = pipList.length;

    return Positioned(
      left: nextX,
      top: nextY,
      child: Listener(
        onPointerMove: (PointerMoveEvent e) {
          if (e.buttons & kPrimaryButton != kPrimaryButton) return;
          final o = widget.session.voicePipOffset;
          final nx = (o.dx + e.delta.dx)
              .clamp(8.0, (media.width - cardW - 8).clamp(8.0, double.infinity));
          final ny = (o.dy + e.delta.dy).clamp(
            8.0 + pad.top,
            (media.height - cardH - pad.bottom - 8)
                .clamp(8.0 + pad.top, double.infinity),
          );
          widget.onOffsetChanged(Offset(nx, ny));
        },
        child: Material(
          elevation: 16,
          shadowColor: Colors.black87,
          borderRadius: BorderRadius.circular(20),
          clipBehavior: Clip.antiAlias,
          color: Colors.black,
          child: SizedBox(
            width: cardW,
            height: cardH,
            child: Stack(
              clipBehavior: Clip.hardEdge,
              children: [
                // ── Background: video or dark avatar placeholder ──
                Positioned.fill(
                  child: GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onTap: widget.onRestore,
                    child: mainVideo != null
                        ? _voiceChannelPipVideoTrack(mainVideo)
                        : Container(
                            color: const Color(0xFF0C1528),
                            alignment: Alignment.center,
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Container(
                                  width: 64,
                                  height: 64,
                                  decoration: BoxDecoration(
                                    color: const Color(0xFF1B2A4A),
                                    shape: BoxShape.circle,
                                    border: Border.all(
                                      color: const Color(0xFF1EB980),
                                      width: 2,
                                    ),
                                  ),
                                  child: const Icon(
                                    Icons.headset_mic_rounded,
                                    color: Colors.white54,
                                    size: 30,
                                  ),
                                ),
                                const SizedBox(height: 10),
                                Text(
                                  pipList.isEmpty
                                      ? 'Đang kết nối…'
                                      : '$count thành viên',
                                  style: const TextStyle(
                                    color: Color(0xFF8EA3CC),
                                    fontSize: 12,
                                    fontWeight: FontWeight.w500,
                                  ),
                                ),
                              ],
                            ),
                          ),
                  ),
                ),

                // ── Top gradient scrim ──
                Positioned(
                  top: 0,
                  left: 0,
                  right: 0,
                  height: 72,
                  child: IgnorePointer(
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topCenter,
                          end: Alignment.bottomCenter,
                          colors: [
                            Colors.black.withValues(alpha: 0.72),
                            Colors.transparent,
                          ],
                        ),
                      ),
                    ),
                  ),
                ),

                // ── Bottom gradient scrim ──
                Positioned(
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: 70,
                  child: IgnorePointer(
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.bottomCenter,
                          end: Alignment.topCenter,
                          colors: [
                            Colors.black.withValues(alpha: 0.72),
                            Colors.transparent,
                          ],
                        ),
                      ),
                    ),
                  ),
                ),

                // ── Header: channel name + controls ──
                Positioned(
                  top: 0,
                  left: 0,
                  right: 0,
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(10, 9, 8, 0),
                    child: Row(
                      children: [
                        const Icon(
                          Icons.headset_mic_rounded,
                          color: Colors.white,
                          size: 13,
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
                              shadows: [
                                Shadow(blurRadius: 4, color: Colors.black87),
                              ],
                            ),
                          ),
                        ),
                        const SizedBox(width: 4),
                        _PipIconBtn(
                          icon: Icons.open_in_new_rounded,
                          onTap: widget.onTuckToCorner,
                          tooltip: 'Thu nhỏ góc',
                        ),
                        const SizedBox(width: 4),
                        _PipIconBtn(
                          icon: Icons.logout_rounded,
                          onTap: widget.onLeave,
                          danger: true,
                          tooltip: 'Rời phòng',
                        ),
                      ],
                    ),
                  ),
                ),

                // ── Footer: timer + participants count + mic toggle ──
                Positioned(
                  bottom: 0,
                  left: 0,
                  right: 0,
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(10, 0, 10, 9),
                    child: Row(
                      children: [
                        // Timer
                        Text(
                          _fmtTime(v.voiceJoinedAt),
                          style: const TextStyle(
                            color: Colors.white70,
                            fontSize: 10,
                            fontWeight: FontWeight.w600,
                            shadows: [
                              Shadow(blurRadius: 4, color: Colors.black87),
                            ],
                          ),
                        ),
                        const SizedBox(width: 5),
                        // Participants
                        if (count > 0)
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 5, vertical: 2),
                            decoration: BoxDecoration(
                              color: Colors.black.withValues(alpha: 0.5),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                const Icon(Icons.group_rounded,
                                    size: 10, color: Colors.white70),
                                const SizedBox(width: 2),
                                Text(
                                  '$count',
                                  style: const TextStyle(
                                    color: Colors.white70,
                                    fontSize: 10,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        const Spacer(),
                        // Mic toggle
                        GestureDetector(
                          onTap: () => unawaited(v.toggleMic()),
                          child: Container(
                            width: 30,
                            height: 30,
                            decoration: BoxDecoration(
                              color: micOn
                                  ? Colors.white.withValues(alpha: 0.22)
                                  : const Color(0xFFED4245)
                                      .withValues(alpha: 0.85),
                              shape: BoxShape.circle,
                            ),
                            child: Icon(
                              micOn
                                  ? Icons.mic_rounded
                                  : Icons.mic_off_rounded,
                              color: Colors.white,
                              size: 16,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),

                // ── Speaking indicator ring (when someone is speaking) ──
                if (mainVideo != null && pipList.any((p) => p.isSpeaking))
                  Positioned.fill(
                    child: IgnorePointer(
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(
                            color: const Color(0xFF1EB980),
                            width: 2.5,
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
    _clock = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
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
    _clock = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
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
