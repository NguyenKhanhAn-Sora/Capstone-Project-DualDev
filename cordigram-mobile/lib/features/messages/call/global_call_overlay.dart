import 'package:flutter/material.dart';

import 'dm_call_manager.dart';
import '../services/voice_channel_session_controller.dart';

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
          animation: DmCallManager.instance,
          builder: (_, __) {
            final mgr = DmCallManager.instance;
            // When call is active and minimized, show draggable mini-call.
            if (mgr.active != null) {
              if (!mgr.isCallMinimized) return const SizedBox.shrink();
              return _MinimizedCallBubble(
                offset: mgr.miniCallOffset,
                title: mgr.active!.peerName,
                onOffsetChanged: mgr.updateMiniCallOffset,
                onRestore: mgr.restoreMinimizedCall,
                onHangup: () => mgr.hangupActive(),
              );
            }

            final incoming = mgr.incoming;
            if (incoming != null) {
              return Positioned.fill(
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
              );
            }

            final outgoing = mgr.outgoing;
            if (outgoing != null) {
              final statusText = switch (outgoing.status) {
                OutgoingCallStatus.calling => 'Đang gọi...',
                OutgoingCallStatus.rejected => 'Cuộc gọi bị từ chối',
                OutgoingCallStatus.noAnswer => 'Không có phản hồi',
              };
              return Positioned.fill(
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
              );
            }

            return const SizedBox.shrink();
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

class _MinimizedCallBubble extends StatelessWidget {
  const _MinimizedCallBubble({
    required this.offset,
    required this.title,
    required this.onOffsetChanged,
    required this.onRestore,
    required this.onHangup,
  });

  final Offset offset;
  final String title;
  final ValueChanged<Offset> onOffsetChanged;
  final VoidCallback onRestore;
  final VoidCallback onHangup;

  @override
  Widget build(BuildContext context) {
    return Positioned(
      left: offset.dx,
      top: offset.dy,
      child: GestureDetector(
        onPanUpdate: (details) {
          final media = MediaQuery.sizeOf(context);
          final nextX = (offset.dx + details.delta.dx).clamp(8.0, media.width - 220);
          final nextY = (offset.dy + details.delta.dy).clamp(8.0, media.height - 80);
          onOffsetChanged(Offset(nextX, nextY));
        },
        child: Material(
          color: const Color(0xDD0F1B37),
          borderRadius: BorderRadius.circular(14),
          child: Container(
            width: 210,
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: const Color(0xFF2C3A5A)),
            ),
            child: Row(
              children: [
                Expanded(
                  child: InkWell(
                    borderRadius: BorderRadius.circular(10),
                    onTap: onRestore,
                    child: Row(
                      children: [
                        const Icon(Icons.call_rounded, color: Colors.white, size: 18),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            title.isNotEmpty ? title : 'Cuộc gọi',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(width: 6),
                InkWell(
                  borderRadius: BorderRadius.circular(999),
                  onTap: onHangup,
                  child: const Padding(
                    padding: EdgeInsets.all(5),
                    child: Icon(Icons.call_end_rounded, color: Color(0xFFED4245), size: 18),
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
