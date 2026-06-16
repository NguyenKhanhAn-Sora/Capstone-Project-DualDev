import 'dart:convert';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import '../../features/notifications/notification_screen.dart';
import '../../features/post/post_detail_screen.dart';
import '../../features/profile/profile_screen.dart';
import '../../features/reels/reels_screen.dart';
import 'cordigram_notification_sounds.dart';
import 'messages_push_handler.dart';
import 'notification_sound_config.dart';

/// Push routing for Social feed notifications only (follow, likes, comments, etc.).
/// Messages module pushes are handled by [MessagesPushHandler].
class SocialPushHandler {
  SocialPushHandler._();

  static const String androidSmallIcon = 'ic_stat_cordigram';
  static const String scope = 'social';

  static const AndroidNotificationChannel socialChannel =
      NotificationSoundConfig.socialChannel;

  static const Set<String> _socialTypes = {
    'follow',
    'post_like',
    'comment_like',
    'post_comment',
    'comment_reply',
    'post_mention',
    'login_alert',
    'post_moderation',
    'report',
    'system_notice',
  };

  static bool isSocialPush(Map<String, dynamic> data) {
    final pushScope = (data['scope'] ?? '').toString().toLowerCase();
    if (pushScope == scope) return true;
    if (pushScope == MessagesPushHandler.scope) return false;
    final type = (data['type'] ?? '').toString().toLowerCase();
    if (MessagesPushHandler.isMessagesPush(data)) return false;
    return _socialTypes.contains(type) ||
        (data['notificationId'] ?? '').toString().isNotEmpty;
  }

  static String dedupeKey(Map<String, dynamic> data) {
    final type = (data['type'] ?? '').toString();
    final id = (data['notificationId'] ?? '').toString();
    if (id.isEmpty) return '';
    return '$type:$id';
  }

  static Future<bool> handleForegroundMessage({
    required RemoteMessage message,
    required FlutterLocalNotificationsPlugin local,
    required bool Function(String id) shouldDedupe,
  }) async {
    final data = Map<String, dynamic>.from(message.data);
    if (!isSocialPush(data)) return false;

    final dedupeId = dedupeKey(data);
    if (dedupeId.isNotEmpty && shouldDedupe(dedupeId)) return true;

    final title = message.notification?.title ?? 'Cordigram';
    final body =
        message.notification?.body ?? 'You have a new notification.';

    await local.show(
      message.hashCode,
      title,
      body,
      NotificationDetails(
        android: NotificationSoundConfig.androidMessageDetails(
          channelId: socialChannel.id,
          channelName: socialChannel.name,
          channelDescription: socialChannel.description,
          category: AndroidNotificationCategory.social,
        ),
        iOS: NotificationSoundConfig.iosMessageDetails,
      ),
      payload: jsonEncode(data),
    );
    CordigramNotificationSounds.playMessage();
    return true;
  }

  static Future<void> showBackgroundNotification({
    required RemoteMessage message,
    required FlutterLocalNotificationsPlugin local,
  }) async {
    final data = Map<String, dynamic>.from(message.data);
    if (!isSocialPush(data)) return;

    final title = message.notification?.title ?? 'Cordigram';
    final body =
        message.notification?.body ?? 'You have a new notification.';

    await local.show(
      message.hashCode,
      title,
      body,
      NotificationDetails(
        android: NotificationSoundConfig.androidMessageDetails(
          channelId: socialChannel.id,
          channelName: socialChannel.name,
          channelDescription: socialChannel.description,
          category: AndroidNotificationCategory.social,
        ),
        iOS: NotificationSoundConfig.iosMessageDetails,
      ),
      payload: jsonEncode(data),
    );
  }

  static void navigateFromTap(
    NavigatorState navigator,
    Map<String, dynamic> data,
  ) {
    final type = (data['type'] as String?)?.trim().toLowerCase() ?? '';
    final actorId =
        ((data['actorId'] ?? data['userId']) as String?)?.trim() ?? '';
    final postId =
        ((data['postId'] ?? data['targetPostId']) as String?)?.trim() ?? '';
    final commentId = (data['commentId'] as String?)?.trim() ?? '';
    final postKind =
        ((data['postKind'] ?? data['post_kind']) as String?)
            ?.trim()
            .toLowerCase() ??
        'post';

    if (type == 'follow' && actorId.isNotEmpty) {
      navigator.push(
        MaterialPageRoute<void>(
          builder: (_) => ProfileScreen(userId: actorId),
        ),
      );
      return;
    }

    if (postId.isNotEmpty) {
      if (postKind == 'reel') {
        navigator.push(
          MaterialPageRoute<void>(
            builder: (_) => ReelsScreen(
              scope: 'all',
              initialReelId: postId,
              pinInitialReelToTop: true,
            ),
          ),
        );
        return;
      }

      navigator.push(
        MaterialPageRoute<void>(
          builder: (_) => PostDetailScreen(
            postId: postId,
            priorityCommentId: commentId.isNotEmpty ? commentId : null,
          ),
        ),
      );
      return;
    }

    navigator.push(
      MaterialPageRoute<void>(builder: (_) => const NotificationScreen()),
    );
  }
}
