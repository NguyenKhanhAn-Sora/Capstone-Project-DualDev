import 'package:flutter/material.dart';

import '../../../core/services/language_controller.dart';
import '../messages_controller.dart';
import '../models/message_thread.dart';
import '../utils/dm_conversation_categories.dart';
import '../utils/messages_i18n.dart';

const _categoryKeys = dmConversationCategoryKeys;

class DmConversationActionsSheet {
  DmConversationActionsSheet._();

  static Future<void> show(
    BuildContext context, {
    required MessageThread thread,
    required MessagesController controller,
  }) async {
    final t = LanguageController.instance.t;
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: const Color(0xFF0A1737),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(14)),
      ),
      builder: (ctx) {
        final muted = controller.isConversationMuted(thread.id);
        final blocked = controller.isUserBlocked(thread.id);
        return SafeArea(
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 14, 16, 8),
                  child: Text(
                    thread.name,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                ListTile(
                  title: Text(
                    t('chat.dmConversation.categorize'),
                    style: const TextStyle(color: Colors.white),
                  ),
                  trailing: const Icon(Icons.chevron_right, color: Colors.white54),
                  onTap: () async {
                    Navigator.of(ctx).pop();
                    await _showCategoryPicker(context, thread, controller);
                  },
                ),
                ListTile(
                  title: Text(
                    muted
                        ? MessagesI18n.dmUnmuteNotifications()
                        : t('chat.dmConversation.muteNotifications'),
                    style: const TextStyle(color: Colors.white),
                  ),
                  trailing: const Icon(Icons.chevron_right, color: Colors.white54),
                  onTap: () async {
                    Navigator.of(ctx).pop();
                    if (muted) {
                      controller.setConversationMuteDuration(
                        thread.id,
                        duration: null,
                        forever: false,
                      );
                    } else {
                      await _showMutePicker(context, thread, controller);
                    }
                  },
                ),
                if (thread.isFollowing)
                  ListTile(
                    title: Text(
                      t('chat.dmConversation.unfollow'),
                      style: const TextStyle(color: Colors.white),
                    ),
                    onTap: () async {
                      Navigator.of(ctx).pop();
                      try {
                        await controller.unfollowUser(thread.id);
                      } catch (_) {}
                    },
                  ),
                ListTile(
                  title: Text(
                    blocked
                        ? MessagesI18n.dmUnblock()
                        : MessagesI18n.dmBlock(),
                    style: TextStyle(
                      color: blocked ? Colors.white : const Color(0xFFED4245),
                    ),
                  ),
                  onTap: () async {
                    Navigator.of(ctx).pop();
                    try {
                      if (blocked) {
                        await controller.unblockUser(thread.id);
                      } else {
                        await controller.blockUser(thread.id);
                      }
                    } catch (_) {
                      if (context.mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(
                            content: Text(MessagesI18n.dmBlockUpdateError()),
                          ),
                        );
                      }
                    }
                  },
                ),
                const SizedBox(height: 8),
              ],
            ),
          ),
        );
      },
    );
  }

  static Future<void> _showMutePicker(
    BuildContext context,
    MessageThread thread,
    MessagesController controller,
  ) async {
    final t = LanguageController.instance.t;
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: const Color(0xFF0A1737),
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              title: Text(
                t('chat.dmConversation.mute1h'),
                style: const TextStyle(color: Colors.white),
              ),
              onTap: () {
                controller.setConversationMuteDuration(
                  thread.id,
                  duration: const Duration(hours: 1),
                );
                Navigator.of(ctx).pop();
              },
            ),
            ListTile(
              title: Text(
                t('chat.dmConversation.mute4h'),
                style: const TextStyle(color: Colors.white),
              ),
              onTap: () {
                controller.setConversationMuteDuration(
                  thread.id,
                  duration: const Duration(hours: 4),
                );
                Navigator.of(ctx).pop();
              },
            ),
            ListTile(
              title: Text(
                t('chat.dmConversation.muteUntil8am'),
                style: const TextStyle(color: Colors.white),
              ),
              onTap: () {
                final now = DateTime.now();
                var target = DateTime(now.year, now.month, now.day, 8);
                if (!target.isAfter(now)) {
                  target = target.add(const Duration(days: 1));
                }
                controller.setConversationMuteDuration(
                  thread.id,
                  duration: target.difference(now),
                );
                Navigator.of(ctx).pop();
              },
            ),
            ListTile(
              title: Text(
                MessagesI18n.dmMuteUntilForever(),
                style: const TextStyle(color: Colors.white),
              ),
              onTap: () {
                controller.setConversationMuteDuration(
                  thread.id,
                  forever: true,
                );
                Navigator.of(ctx).pop();
              },
            ),
          ],
        ),
      ),
    );
  }

  static Future<void> _showCategoryPicker(
    BuildContext context,
    MessageThread thread,
    MessagesController controller,
  ) async {
    final t = LanguageController.instance.t;
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: const Color(0xFF0A1737),
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (thread.category != null)
              ListTile(
                title: Text(
                  t('chat.dmConversation.clearCategory'),
                  style: const TextStyle(color: Colors.white70),
                ),
                onTap: () async {
                  await controller.setConversationCategory(thread.id, null);
                  if (ctx.mounted) Navigator.of(ctx).pop();
                },
              ),
            ..._categoryKeys.map((key) {
              final color = dmCategoryColors[key] ?? Colors.white;
              return ListTile(
                leading: Container(
                  width: 12,
                  height: 12,
                  decoration: BoxDecoration(
                    color: color,
                    borderRadius: BorderRadius.circular(3),
                  ),
                ),
                title: Text(
                  t('chat.dmConversation.categories.$key'),
                  style: const TextStyle(color: Colors.white),
                ),
                trailing: thread.category == key
                    ? const Icon(Icons.check, color: Colors.white, size: 18)
                    : null,
                onTap: () async {
                  await controller.setConversationCategory(thread.id, key);
                  if (ctx.mounted) Navigator.of(ctx).pop();
                },
              );
            }),
          ],
        ),
      ),
    );
  }
}
