import 'package:flutter/material.dart';
import 'package:livekit_client/livekit_client.dart';

import 'models/server_models.dart';
import 'services/voice_channel_session_controller.dart';

class VoiceChannelRoomScreen extends StatefulWidget {
  const VoiceChannelRoomScreen({
    super.key,
    required this.server,
    required this.channel,
    required this.participantName,
  });

  final ServerSummary server;
  final ServerChannel channel;
  final String participantName;

  @override
  State<VoiceChannelRoomScreen> createState() => _VoiceChannelRoomScreenState();
}

class _VoiceChannelRoomScreenState extends State<VoiceChannelRoomScreen> {
  static const Color _pageColor = Colors.black;
  VoiceChannelSessionController get _session =>
      VoiceChannelSessionController.instance;

  @override
  void initState() {
    super.initState();
    _session.addListener(_onSessionChanged);
    _ensureJoined();
  }

  @override
  void dispose() {
    _session.removeListener(_onSessionChanged);
    super.dispose();
  }

  void _onSessionChanged() {
    if (!mounted) return;
    setState(() {});
  }

  Future<void> _ensureJoined() async {
    if (_session.isInChannel(widget.server.id, widget.channel.id)) return;
    await _session.join(
      server: widget.server,
      channel: widget.channel,
      participantName: widget.participantName,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _pageColor,
      appBar: AppBar(
        backgroundColor: _pageColor,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded, color: Colors.white),
          onPressed: () => Navigator.of(context).pop(true),
        ),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '🔊 ${widget.channel.name}',
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
            ),
            Text(
              widget.server.name,
              style: const TextStyle(
                fontSize: 11,
                color: Color(0xFF9AAFD5),
                fontWeight: FontWeight.w500,
              ),
            ),
          ],
        ),
      ),
      body: _session.connecting
          ? const Center(child: CircularProgressIndicator())
          : _session.error != null
          ? Center(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 24),
                child: Text(
                  _session.error!,
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Color(0xFFAFC0E2)),
                ),
              ),
            )
          : Stack(
              children: [
                Positioned.fill(
                  child: _VoiceParticipantGrid(
                    participants: _session.participants,
                  ),
                ),
                Positioned(
                  left: 12,
                  right: 12,
                  top: 10,
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 8,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.black.withValues(alpha: 0.44),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      '${_session.participants.length} thành viên trong kênh',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ),
                Positioned(
                  left: 12,
                  right: 12,
                  bottom: 12,
                  child: SafeArea(
                    top: false,
                    minimum: EdgeInsets.zero,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 10,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.black.withValues(alpha: 0.55),
                        borderRadius: BorderRadius.circular(30),
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                        children: [
                          _RoundControlButton(
                            icon: _session.micEnabled
                                ? Icons.mic_rounded
                                : Icons.mic_off_rounded,
                            color: _session.micEnabled
                                ? const Color(0x33FFFFFF)
                                : const Color(0xFFFF5770),
                            onTap: _session.toggleMic,
                          ),
                          _RoundControlButton(
                            icon: _session.soundEnabled
                                ? Icons.volume_up_rounded
                                : Icons.volume_off_rounded,
                            color: _session.soundEnabled
                                ? const Color(0x33FFFFFF)
                                : const Color(0xFFFF5770),
                            onTap: _session.toggleSound,
                          ),
                          _RoundControlButton(
                            icon: Icons.screen_share_rounded,
                            color: _session.screenShareEnabled
                                ? const Color(0xFF2D7EFF)
                                : const Color(0x33FFFFFF),
                            onTap: _session.toggleScreenShare,
                          ),
                          _RoundControlButton(
                            icon: _session.cameraEnabled
                                ? Icons.videocam_rounded
                                : Icons.videocam_off_rounded,
                            color: _session.cameraEnabled
                                ? const Color(0xFF2D7EFF)
                                : const Color(0x33FFFFFF),
                            onTap: _session.toggleCamera,
                          ),
                          _RoundControlButton(
                            icon: Icons.call_end_rounded,
                            color: const Color(0xFFED4245),
                            onTap: () async {
                              final navigator = Navigator.of(context);
                              await _session.leave();
                              if (mounted) navigator.pop();
                            },
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
}

class _VoiceParticipantGrid extends StatelessWidget {
  const _VoiceParticipantGrid({required this.participants});

  final List<Participant> participants;

  @override
  Widget build(BuildContext context) {
    if (participants.isEmpty) {
      return const Center(
        child: Text(
          'Đang chờ người tham gia...',
          style: TextStyle(color: Color(0xFFB6C2DC)),
        ),
      );
    }
    return GridView.builder(
      padding: const EdgeInsets.fromLTRB(10, 14, 10, 96),
      itemCount: participants.length,
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        mainAxisSpacing: 8,
        crossAxisSpacing: 8,
        childAspectRatio: 0.82,
      ),
      itemBuilder: (context, index) {
        final p = participants[index];
        return _VoiceParticipantTile(participant: p);
      },
    );
  }
}

class _VoiceParticipantTile extends StatelessWidget {
  const _VoiceParticipantTile({required this.participant});

  final Participant participant;

  VideoTrack? _pickVideoTrack(Participant p) {
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

  @override
  Widget build(BuildContext context) {
    final participantName = participant.name.trim();
    final name = participantName.isNotEmpty ? participantName : participant.identity;
    final displayName = participant is LocalParticipant ? '$name (Bạn)' : name;
    final initial = name.isNotEmpty ? name.substring(0, 1).toUpperCase() : '?';
    final videoTrack = _pickVideoTrack(participant);

    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF0F1B37),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFF2C3A5A)),
      ),
      clipBehavior: Clip.antiAlias,
      child: Stack(
        children: [
          Positioned.fill(
            child: videoTrack != null
                ? VideoTrackRenderer(videoTrack, fit: VideoViewFit.cover)
                : Center(
                    child: CircleAvatar(
                      radius: 30,
                      backgroundColor: const Color(0xFF1B2A4A),
                      child: Text(
                        initial,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 22,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ),
          ),
          Positioned(
            left: 8,
            right: 8,
            bottom: 8,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: Colors.black.withValues(alpha: 0.45),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      displayName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  const SizedBox(width: 6),
                  Icon(
                    participant.isSpeaking ? Icons.graphic_eq_rounded : Icons.hearing_rounded,
                    size: 14,
                    color: participant.isSpeaking
                        ? const Color(0xFF00C48C)
                        : const Color(0xFFB6C2DC),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _RoundControlButton extends StatelessWidget {
  const _RoundControlButton({
    required this.icon,
    required this.color,
    required this.onTap,
  });

  final IconData icon;
  final Color color;
  final Future<void> Function() onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: color,
      shape: const CircleBorder(),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: () => onTap(),
        child: SizedBox(
          width: 52,
          height: 52,
          child: Icon(icon, color: Colors.white, size: 23),
        ),
      ),
    );
  }
}
