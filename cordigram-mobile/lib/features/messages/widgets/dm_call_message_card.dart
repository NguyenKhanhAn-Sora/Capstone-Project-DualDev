import 'package:flutter/material.dart';

import '../models/dm_message.dart';

/// Call log card in DM thread (missed / completed voice or video).
class DmCallMessageCard extends StatelessWidget {
  const DmCallMessageCard({
    super.key,
    required this.message,
    required this.viewerId,
    required this.onCallBack,
  });

  final DmMessage message;
  final String? viewerId;
  final VoidCallback onCallBack;

  bool get _isVideo => message.callType == 'video';

  bool get _isMissed {
    final s = message.callStatus ?? 'missed';
    return s == 'missed' || s == 'declined';
  }

  bool get _isIncomingMissed => message.isMissedCallFor(viewerId);

  String _title() {
    if (_isMissed) {
      if (_isIncomingMissed) {
        return _isVideo ? 'Đã bỏ lỡ cuộc gọi video' : 'Đã bỏ lỡ cuộc gọi thoại';
      }
      return _isVideo ? 'Cuộc gọi video' : 'Cuộc gọi thoại';
    }
    return _isVideo ? 'Cuộc gọi video' : 'Cuộc gọi thoại';
  }

  String _subtitle() {
    if ((message.callStatus ?? '') == 'completed' &&
        message.callDurationSec != null) {
      final sec = message.callDurationSec!.clamp(0, 86400);
      if (sec < 60) return '$sec giây';
      final min = sec ~/ 60;
      final rem = sec % 60;
      if (rem == 0) return '$min phút';
      return '$min phút $rem giây';
    }
    final t = message.createdAt;
    final h = t.hour.toString().padLeft(2, '0');
    final m = t.minute.toString().padLeft(2, '0');
    return '$h:$m';
  }

  IconData _icon() {
    if (_isVideo) {
      return _isMissed ? Icons.videocam_off_rounded : Icons.videocam_rounded;
    }
    return _isMissed ? Icons.phone_missed_rounded : Icons.phone_rounded;
  }

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onCallBack,
        borderRadius: BorderRadius.circular(16),
        child: Ink(
          width: 248,
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            color: const Color(0x995B2D6E),
            border: Border.all(color: const Color(0x40C084FC)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: _isMissed
                          ? const Color(0xFFE53935)
                          : const Color(0xFF7C4DFF),
                    ),
                    child: Icon(_icon(), color: Colors.white, size: 20),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _title(),
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          _subtitle(),
                          style: TextStyle(
                            color: Colors.white.withValues(alpha: 0.65),
                            fontSize: 12,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              TextButton(
                onPressed: onCallBack,
                style: TextButton.styleFrom(
                  backgroundColor: const Color(0xFF6D3FA8),
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 10),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(10),
                  ),
                ),
                child: const Text(
                  'Gọi lại',
                  style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
