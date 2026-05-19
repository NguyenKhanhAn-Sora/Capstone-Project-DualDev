import 'package:flutter/material.dart';

import '../models/message_thread.dart';

class MessageThreadTile extends StatelessWidget {
  const MessageThreadTile({
    super.key,
    required this.thread,
    required this.onTap,
    this.showActivityLabel = true,
    this.languageCode = 'vi',
  });

  final MessageThread thread;
  final VoidCallback onTap;
  final bool showActivityLabel;
  final String languageCode;

  String get _unreadLabel {
    final n = thread.unreadCount;
    if (n <= 0) return '';
    if (n > 99) return '99+';
    return '$n';
  }

  @override
  Widget build(BuildContext context) {
    final onlineText = languageCode == 'en' ? 'Online' : 'Trực tuyến';
    final offlineText = languageCode == 'en' ? 'Offline' : 'Ngoại tuyến';
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
            backgroundColor: const Color(0xFFDDDDDD),
            backgroundImage: thread.avatarUrl != null
                ? NetworkImage(thread.avatarUrl!)
                : null,
            child: thread.avatarUrl == null
                ? Text(
                    nameLetter,
                    style: const TextStyle(
                      color: Color(0xFF1B2A4A),
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
                  color: const Color(0xFFFF2A45),
                  borderRadius: BorderRadius.circular(10),
                ),
                constraints: const BoxConstraints(minWidth: 16),
                alignment: Alignment.center,
                child: Text(
                  _unreadLabel,
                  style: const TextStyle(
                    color: Colors.white,
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
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w600,
                fontSize: 15,
              ),
            ),
          ),
          if (showActivityLabel && thread.lastActiveLabel.isNotEmpty)
            Text(
              thread.lastActiveLabel,
              style: const TextStyle(
                color: Color(0xFF7E8CA8),
                fontSize: 10,
                fontWeight: FontWeight.w500,
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
                      ? Colors.white.withValues(alpha: 0.85)
                      : const Color(0xFF7E8CA8),
                  fontWeight: thread.unreadCount > 0
                      ? FontWeight.w600
                      : FontWeight.w400,
                  fontSize: 12,
                ),
              )
            : Row(
                children: [
                  Icon(
                    Icons.circle,
                    size: 8,
                    color: thread.isOnline
                        ? const Color(0xFF31C56F)
                        : const Color(0xFF7E8CA8),
                  ),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      thread.isOnline ? onlineText : offlineText,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: Color(0xFF7E8CA8),
                        fontWeight: FontWeight.w400,
                        fontSize: 10,
                      ),
                    ),
                  ),
                ],
              ),
      ),
    );
  }
}
