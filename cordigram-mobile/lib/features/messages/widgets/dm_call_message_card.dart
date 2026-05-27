import 'package:flutter/material.dart';

import '../models/dm_message.dart';
import '../utils/messages_i18n.dart';

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

  bool get _isMissed => MessagesI18n.isMissedCallStatus(message.callStatus);

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final title = MessagesI18n.callCardTitle(message, viewerId);
    final subtitle = MessagesI18n.callCardSubtitle(message, viewerId);
    final callBack = MessagesI18n.callBackLabel();

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
            color: scheme.primaryContainer.withValues(alpha: 0.55),
            border: Border.all(color: scheme.primary.withValues(alpha: 0.25)),
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
                      color: _isMissed ? scheme.error : scheme.primary,
                    ),
                    child: Icon(_icon(), color: scheme.onPrimary, size: 20),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          title,
                          style: TextStyle(
                            color: scheme.onSurface,
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          subtitle,
                          style: TextStyle(
                            color: scheme.onSurfaceVariant,
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
                  backgroundColor: scheme.primary,
                  foregroundColor: scheme.onPrimary,
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
