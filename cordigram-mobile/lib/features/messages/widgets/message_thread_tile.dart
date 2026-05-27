import 'package:flutter/material.dart';

import '../../../core/services/language_controller.dart';
import '../models/message_thread.dart';

class MessageThreadTile extends StatelessWidget {
  const MessageThreadTile({
    super.key,
    required this.thread,
    required this.onTap,
    this.showActivityLabel = true,
  });

  final MessageThread thread;
  final VoidCallback onTap;
  final bool showActivityLabel;

  String get _unreadLabel {
    final n = thread.unreadCount;
    if (n <= 0) return '';
    if (n > 99) return '99+';
    return '$n';
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final t = LanguageController.instance.t;
    final onlineText = t('chat.presence.online');
    final offlineText = t('chat.presence.offline');
    final presenceText = thread.presenceLabel.trim().isNotEmpty
        ? thread.presenceLabel
        : (thread.isOnline ? onlineText : offlineText);
    final nameLetter = thread.name.trim().isNotEmpty
        ? thread.name.trim().substring(0, 1).toUpperCase()
        : '?';
    final preview = thread.lastMessage.trim();
    final hasPreview = preview.isNotEmpty;

    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 2),
      onTap: onTap,
      leading: Stack(
        clipBehavior: Clip.none,
        children: [
          CircleAvatar(
            radius: 17,
            backgroundColor: scheme.surfaceContainerHighest,
            backgroundImage: thread.avatarUrl != null
                ? NetworkImage(thread.avatarUrl!)
                : null,
            child: thread.avatarUrl == null
                ? Text(
                    nameLetter,
                    style: TextStyle(
                      color: scheme.onSurface,
                      fontWeight: FontWeight.w700,
                    ),
                  )
                : null,
          ),
          if (thread.unreadCount > 0)
            Positioned(
              right: -2,
              bottom: 0,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                decoration: BoxDecoration(
                  color: scheme.error,
                  borderRadius: BorderRadius.circular(10),
                ),
                constraints: const BoxConstraints(minWidth: 16),
                alignment: Alignment.center,
                child: Text(
                  _unreadLabel,
                  style: TextStyle(
                    color: scheme.onError,
                    fontSize: 8,
                    fontWeight: FontWeight.w700,
                    height: 1.1,
                  ),
                ),
              ),
            ),
        ],
      ),
      title: Row(
        children: [
          Expanded(
            child: Text(
              thread.name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    color: scheme.onSurface,
                    fontSize: 15,
                  ),
            ),
          ),
          if (showActivityLabel && thread.lastActiveLabel.isNotEmpty)
            Text(
              thread.lastActiveLabel,
              style: Theme.of(context).textTheme.labelSmall?.copyWith(
                    color: scheme.onSurfaceVariant,
                    fontSize: 10,
                  ),
            ),
        ],
      ),
      subtitle: Padding(
        padding: const EdgeInsets.only(top: 1),
        child: hasPreview
            ? Text(
                preview,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: thread.unreadCount > 0
                      ? scheme.onSurface
                      : scheme.onSurfaceVariant,
                  fontSize: 12,
                  fontWeight:
                      thread.unreadCount > 0 ? FontWeight.w600 : FontWeight.w400,
                ),
              )
            : Text(
                presenceText,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: scheme.onSurfaceVariant,
                  fontSize: 12,
                ),
              ),
      ),
    );
  }
}
