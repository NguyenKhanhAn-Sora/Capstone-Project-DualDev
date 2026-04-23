import 'package:flutter/material.dart';

import 'dm_call_manager.dart';

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
            // When the native call screen is open we suppress the overlays
            // (the user is already inside a call view).
            if (mgr.active != null) return const SizedBox.shrink();

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
                    onAccept: () => mgr.acceptIncoming(),
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
