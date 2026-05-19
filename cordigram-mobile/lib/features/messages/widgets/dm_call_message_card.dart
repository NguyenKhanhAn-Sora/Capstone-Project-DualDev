import 'package:flutter/material.dart';

import '../models/dm_message.dart';
import '../utils/dm_call_message_utils.dart';

/// Call log card in DM thread (missed / completed voice or video).
class DmCallMessageCard extends StatelessWidget {
  const DmCallMessageCard({
    super.key,
    required this.message,
    required this.viewerId,
    required this.onCallBack,
    this.languageCode = 'vi',
  });

  final DmMessage message;
  final String? viewerId;
  final VoidCallback onCallBack;
  final String languageCode;

  bool get _isVideo => message.callType == 'video';

  bool get _isMissed => DmCallMessageUtils.isMissedStatus(message.callStatus);

  @override
  Widget build(BuildContext context) {
    final title = DmCallMessageUtils.callCardTitle(
      message,
      viewerId,
      languageCode: languageCode,
    );
    final subtitle = DmCallMessageUtils.callCardSubtitle(
      message,
      languageCode: languageCode,
    );
    final callBack = DmCallMessageUtils.callBackLabel(languageCode: languageCode);

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
                          title,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          subtitle,
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
                child: Text(
                  callBack,
                  style: const TextStyle(
                    fontWeight: FontWeight.w600,
                    fontSize: 14,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  IconData _icon() {
    if (_isVideo) {
      return _isMissed ? Icons.videocam_off_rounded : Icons.videocam_rounded;
    }
    return _isMissed ? Icons.phone_missed_rounded : Icons.phone_rounded;
  }
}
