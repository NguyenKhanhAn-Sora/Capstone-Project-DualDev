import 'package:flutter/material.dart';

import '../../../core/services/language_controller.dart';
import '../../../core/theme/app_theme_context.dart';
import '../models/message_thread.dart';
import '../utils/dm_conversation_categories.dart';
import '../utils/messages_i18n.dart';

// ── Galaxy palette tokens ────────────────────────────────────────────────────
const _kCyan = Color(0xFF22D3EE);

class MessageThreadTile extends StatelessWidget {
  const MessageThreadTile({
    super.key,
    required this.thread,
    required this.onTap,
    this.onLongPress,
    this.showActivityLabel = true,
  });

  final MessageThread thread;
  final VoidCallback onTap;
  final VoidCallback? onLongPress;
  final bool showActivityLabel;

  String get _unreadLabel {
    final n = thread.unreadCount;
    if (n <= 0) return '';
    if (n > 99) return '99+';
    return '$n';
  }

  @override
  Widget build(BuildContext context) {
    final chrome = context.chrome;
    final isGalaxy = chrome.bg == Colors.transparent;

    return isGalaxy
        ? _GalaxyThreadTile(
            thread: thread,
            onTap: onTap,
            onLongPress: onLongPress,
            showActivityLabel: showActivityLabel,
            unreadLabel: _unreadLabel,
          )
        : _DefaultThreadTile(
            thread: thread,
            onTap: onTap,
            onLongPress: onLongPress,
            showActivityLabel: showActivityLabel,
            unreadLabel: _unreadLabel,
          );
  }
}

// ── Galaxy tile ───────────────────────────────────────────────────────────────

class _GalaxyThreadTile extends StatelessWidget {
  const _GalaxyThreadTile({
    required this.thread,
    required this.onTap,
    required this.onLongPress,
    required this.showActivityLabel,
    required this.unreadLabel,
  });

  final MessageThread thread;
  final VoidCallback onTap;
  final VoidCallback? onLongPress;
  final bool showActivityLabel;
  final String unreadLabel;

  @override
  Widget build(BuildContext context) {
    final t = LanguageController.instance.t;
    final onlineText  = t('chat.presence.online');
    final offlineText = t('chat.presence.offline');
    final presenceText = thread.presenceLabel.trim().isNotEmpty
        ? thread.presenceLabel
        : (thread.isOnline ? onlineText : offlineText);
    final nameLetter = thread.name.trim().isNotEmpty
        ? thread.name.trim().substring(0, 1).toUpperCase()
        : '?';
    final preview = MessagesI18n.localizeSidebarPreview(thread.lastMessage.trim());
    final hasPreview = preview.isNotEmpty;
    final hasUnread  = thread.unreadCount > 0;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        onLongPress: onLongPress,
        splashColor: const Color(0xFF22D3EE).withValues(alpha: 0.06),
        highlightColor: const Color(0xFF060C22).withValues(alpha: 0.55),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          child: Row(
            children: [
              // ── Avatar ─────────────────────────────────────────────────
              _GalaxyAvatar(
                avatarUrl: thread.avatarUrl,
                nameLetter: nameLetter,
                isOnline: thread.isOnline,
                hasUnread: hasUnread,
              ),
              const SizedBox(width: 12),
              // ── Content ────────────────────────────────────────────────
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            thread.name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              color: hasUnread
                                  ? const Color(0xFFE8F4FF)
                                  : const Color(0xFFCBDDF5),
                              fontSize: 14.5,
                              fontWeight: hasUnread
                                  ? FontWeight.w700
                                  : FontWeight.w600,
                              letterSpacing: 0.1,
                            ),
                          ),
                        ),
                        if (showActivityLabel && thread.lastActiveLabel.isNotEmpty)
                          Padding(
                            padding: const EdgeInsets.only(left: 6),
                            child: Text(
                              thread.lastActiveLabel,
                              style: const TextStyle(
                                color: Color(0xFF4A6A9E),
                                fontSize: 10.5,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: 3),
                    Row(
                      children: [
                        if (thread.category != null) ...[
                          dmCategoryMark(thread.category, size: 12),
                          const SizedBox(width: 4),
                        ],
                        Expanded(
                          child: hasPreview
                              ? Text(
                                  preview,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                    color: hasUnread
                                        ? const Color(0xFF9AB8DF)
                                        : const Color(0xFF4A6A9E),
                                    fontSize: 12,
                                    fontWeight: hasUnread
                                        ? FontWeight.w600
                                        : FontWeight.w400,
                                  ),
                                )
                              : Text(
                                  presenceText,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    color: Color(0xFF4A6A9E),
                                    fontSize: 12,
                                  ),
                                ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              // ── Unread badge ───────────────────────────────────────────
              if (hasUnread) _GalaxyUnreadBadge(label: unreadLabel),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Galaxy avatar with online glow ────────────────────────────────────────────

class _GalaxyAvatar extends StatelessWidget {
  const _GalaxyAvatar({
    required this.avatarUrl,
    required this.nameLetter,
    required this.isOnline,
    required this.hasUnread,
  });

  final String? avatarUrl;
  final String nameLetter;
  final bool isOnline;
  final bool hasUnread;

  @override
  Widget build(BuildContext context) {
    final ringColor = isOnline
        ? _kCyan.withValues(alpha: 0.70)
        : const Color(0xFF1E3A6E).withValues(alpha: 0.60);

    return Stack(
      clipBehavior: Clip.none,
      children: [
        // Glow halo for online
        if (isOnline)
          Positioned.fill(
            child: Container(
              margin: const EdgeInsets.all(-3),
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                boxShadow: [
                  BoxShadow(
                    color: _kCyan.withValues(alpha: 0.22),
                    blurRadius: 12,
                    spreadRadius: 2,
                  ),
                ],
              ),
            ),
          ),
        // Ring border
        Container(
          width: 50,
          height: 50,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            border: Border.all(color: ringColor, width: 1.6),
          ),
          child: ClipOval(
            child: avatarUrl != null
                ? Image.network(
                    avatarUrl!,
                    fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) =>
                        _AvatarPlaceholder(letter: nameLetter),
                  )
                : _AvatarPlaceholder(letter: nameLetter),
          ),
        ),
        // Online/offline dot
        Positioned(
          right: 0,
          bottom: 0,
          child: Container(
            width: 12,
            height: 12,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: isOnline ? _kCyan : const Color(0xFF2A3A52),
              border: Border.all(
                color: const Color(0xFF060C22),
                width: 2,
              ),
              boxShadow: isOnline
                  ? [
                      BoxShadow(
                        color: _kCyan.withValues(alpha: 0.55),
                        blurRadius: 6,
                      ),
                    ]
                  : null,
            ),
          ),
        ),
      ],
    );
  }
}

class _AvatarPlaceholder extends StatelessWidget {
  const _AvatarPlaceholder({required this.letter});
  final String letter;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF1A3060), Color(0xFF0A1628)],
        ),
      ),
      child: Center(
        child: Text(
          letter,
          style: const TextStyle(
            color: Color(0xFF7AB0E8),
            fontWeight: FontWeight.w700,
            fontSize: 17,
          ),
        ),
      ),
    );
  }
}

// ── Unread badge ──────────────────────────────────────────────────────────────

class _GalaxyUnreadBadge extends StatelessWidget {
  const _GalaxyUnreadBadge({required this.label});
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF22D3EE), Color(0xFF3B7FE8)],
        ),
        borderRadius: BorderRadius.circular(99),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF22D3EE).withValues(alpha: 0.40),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      constraints: const BoxConstraints(minWidth: 20),
      alignment: Alignment.center,
      child: Text(
        label,
        style: const TextStyle(
          color: Colors.white,
          fontSize: 10,
          fontWeight: FontWeight.w800,
          height: 1,
        ),
      ),
    );
  }
}

// ── Default (non-galaxy) tile ─────────────────────────────────────────────────

class _DefaultThreadTile extends StatelessWidget {
  const _DefaultThreadTile({
    required this.thread,
    required this.onTap,
    required this.onLongPress,
    required this.showActivityLabel,
    required this.unreadLabel,
  });

  final MessageThread thread;
  final VoidCallback onTap;
  final VoidCallback? onLongPress;
  final bool showActivityLabel;
  final String unreadLabel;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final t = LanguageController.instance.t;
    final onlineText  = t('chat.presence.online');
    final offlineText = t('chat.presence.offline');
    final presenceText = thread.presenceLabel.trim().isNotEmpty
        ? thread.presenceLabel
        : (thread.isOnline ? onlineText : offlineText);
    final nameLetter = thread.name.trim().isNotEmpty
        ? thread.name.trim().substring(0, 1).toUpperCase()
        : '?';
    final preview = MessagesI18n.localizeSidebarPreview(thread.lastMessage.trim());
    final hasPreview = preview.isNotEmpty;

    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 2),
      onTap: onTap,
      onLongPress: onLongPress,
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
                  unreadLabel,
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
        child: Row(
          children: [
            if (thread.category != null) ...[
              dmCategoryMark(thread.category, size: 13),
              const SizedBox(width: 5),
            ],
            Expanded(
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
                        fontWeight: thread.unreadCount > 0
                            ? FontWeight.w600
                            : FontWeight.w400,
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
          ],
        ),
      ),
    );
  }
}
