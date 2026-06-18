import 'dart:convert';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import 'cordigram_notification_sounds.dart';
import 'notification_sound_config.dart';
import 'pending_messages_push_navigation.dart';
import '../../features/messages/call/dm_call_manager.dart';
import '../../features/messages/call/pending_dm_call_storage.dart';
import '../../features/messages/messages_shell.dart';
import '../../features/messages/models/message_thread.dart';
import '../../features/messages/services/direct_messages_realtime_service.dart';
import '../../features/messages/services/direct_messages_service.dart';
import '../../features/messages/utils/messages_navigator.dart';
import 'auth_storage.dart';

/// Push routing for Messages module only (calls, DM, mentions, events, role notices).
/// Social feed notifications stay in [SocialPushHandler].
class MessagesPushHandler {
  MessagesPushHandler._();

  static const String androidSmallIcon = 'ic_stat_cordigram';
  static const String scope = 'messages';

  static const AndroidNotificationChannel callsChannel =
      NotificationSoundConfig.callsChannel;
  static const AndroidNotificationChannel messagesChannel =
      NotificationSoundConfig.messagesChannel;

  static bool isMessagesPush(Map<String, dynamic> data) {
    final pushScope = (data['scope'] ?? '').toString().toLowerCase();
    if (pushScope == scope) return true;
    final type = (data['type'] ?? '').toString().toLowerCase();
    return type == 'dm_call_incoming' ||
        type == 'dm_call_dismiss' ||
        type == 'dm_message' ||
        type == 'direct_message' ||
        type == 'new_dm_message' ||
        type == 'channel_message' ||
        type == 'channel_mention' ||
        type == 'event' ||
        type == 'server_notification';
  }

  static bool isCallIncoming(String type) {
    return type == 'dm_call_incoming' ||
        type == 'dm_call' ||
        type == 'incoming_dm_call';
  }

  static bool isDmMessage(String type) {
    return type == 'dm_message' ||
        type == 'direct_message' ||
        type == 'new_dm_message';
  }

  static bool isChannelPush(String type) {
    return type == 'channel_message' || type == 'channel_mention';
  }

  static String dedupeKey(Map<String, dynamic> data) {
    final type = (data['type'] ?? '').toString();
    final id = (data['messageId'] ??
            data['_id'] ??
            data['callId'] ??
            '')
        .toString();
    if (id.isEmpty) return '';
    return '$type:$id';
  }

  static AndroidNotificationChannel channelForType(String type) {
    if (isCallIncoming(type)) return callsChannel;
    return messagesChannel;
  }

  static String titleForData(Map<String, dynamic> data) {
    final type = (data['type'] ?? '').toString().toLowerCase();
    if (isChannelPush(type)) {
      final sender = (data['senderName'] ?? 'Someone').toString();
      final channel = (data['channelName'] ?? 'general').toString();
      final server = (data['serverName'] ?? 'Server').toString();
      return '$sender (#$channel, $server)';
    }
    if (type == 'event') {
      return 'New event · ${(data['serverName'] ?? 'Server').toString()}';
    }
    if (type == 'server_notification') {
      return (data['serverName'] ?? 'Server').toString();
    }
    if (isDmMessage(type)) {
      return (data['senderName'] ?? 'New message').toString();
    }
    if (isCallIncoming(type)) {
      final video = _readCallVideoFlag(data);
      return video ? 'Incoming video call' : 'Incoming voice call';
    }
    return 'Cordigram';
  }

  static String bodyForData(Map<String, dynamic> data) {
    final type = (data['type'] ?? '').toString().toLowerCase();
    if (type == 'server_notification') {
      final title = (data['title'] ?? '').toString();
      final content = (data['content'] ?? '').toString();
      if (title.isNotEmpty && content.isNotEmpty) return '$title — $content';
      return title.isNotEmpty ? title : content;
    }
    if (isCallIncoming(type)) {
      final name = (data['callerName'] ?? data['callerDisplayName'] ?? 'Someone')
          .toString();
      final video = _readCallVideoFlag(data);
      return video ? '$name — video call' : '$name — voice call';
    }
    return (data['excerpt'] ??
            data['content'] ??
            data['topic'] ??
            'You have a new notification.')
        .toString();
  }

  static NotificationDetails detailsForType(String type) {
    if (isCallIncoming(type)) {
      final channel = callsChannel;
      return NotificationDetails(
        android: NotificationSoundConfig.androidIncomingCallDetails(
          channelId: channel.id,
          channelName: channel.name,
          channelDescription: channel.description,
        ),
        iOS: NotificationSoundConfig.iosIncomingCallDetails,
      );
    }
    final channel = messagesChannel;
    return NotificationDetails(
      android: NotificationSoundConfig.androidMessageDetails(
        channelId: channel.id,
        channelName: channel.name,
        channelDescription: channel.description,
      ),
      iOS: NotificationSoundConfig.iosMessageDetails,
    );
  }

  static Future<bool> handleForegroundMessage({
    required RemoteMessage message,
    required FlutterLocalNotificationsPlugin local,
    required bool Function(String id) shouldDedupe,
  }) async {
    final data = Map<String, dynamic>.from(message.data);
    if (!isMessagesPush(data)) return false;

    final type = (data['type'] ?? '').toString().toLowerCase();

    if (type == 'dm_call_dismiss') {
      final callId = (data['callId'] ?? '').toString();
      if (callId.isNotEmpty) {
        await local.cancel(callId.hashCode);
      }
      return true;
    }

    if (isCallIncoming(type)) {
      await routeIncomingCall(data);
      return true;
    }

    if (!DirectMessagesService.chatPushNotificationsEnabled) {
      return true;
    }

    if (isDmMessage(type)) {
      final peerId = _readDmPeerId(data);
      if (peerId.isNotEmpty &&
          DirectMessagesService.isConversationMuted(peerId)) {
        return true;
      }
    }

    final dedupeId = dedupeKey(data);
    if (dedupeId.isNotEmpty && shouldDedupe(dedupeId)) return true;

    final title = message.notification?.title ?? titleForData(data);
    final body = message.notification?.body ?? bodyForData(data);

    await local.show(
      message.hashCode,
      title,
      body,
      detailsForType(type),
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
    if (!isMessagesPush(data)) return;

    final type = (data['type'] ?? '').toString().toLowerCase();
    if (type == 'dm_call_dismiss') {
      final callId = (data['callId'] ?? '').toString();
      if (callId.isNotEmpty) await local.cancel(callId.hashCode);
      return;
    }

    if (!isCallIncoming(type)) {
      final pushEnabled =
          await DirectMessagesService.loadPersistedChatPushNotificationsEnabled();
      if (!pushEnabled) return;
    }

    final title = message.notification?.title ?? titleForData(data);
    final body = message.notification?.body ?? bodyForData(data);

    await local.show(
      message.hashCode,
      title,
      body,
      detailsForType(type),
      payload: jsonEncode(data),
    );
  }

  static Future<void> navigateFromTap(
    NavigatorState navigator,
    Map<String, dynamic> data,
  ) async {
    final type = (data['type'] as String?)?.trim().toLowerCase() ?? '';

    if (isCallIncoming(type)) {
      await routeIncomingCall(data);
      return;
    }

    if (isDmMessage(type)) {
      final peerId = _readDmPeerId(data);
      if (peerId.isEmpty) {
        navigator.push(messagesEntryRoute(const MessagesShell()));
        return;
      }
      final name =
          (data['senderName'] ?? data['senderDisplayName'] ?? peerId).toString();
      final username = (data['senderUsername'] ?? '').toString();
      final avatar = (data['senderAvatarUrl'] ?? '').toString();
      navigator.push(
        messagesEntryRoute(
          MessagesShell(
            initialThread: MessageThread(
              id: peerId,
              name: name.isNotEmpty ? name : username,
              lastMessage: '',
              lastActiveLabel: '',
              unreadCount: 1,
              avatarUrl: avatar.isNotEmpty ? avatar : null,
            ),
          ),
        ),
      );
      return;
    }

    if (isChannelPush(type)) {
      final serverId = (data['serverId'] ?? '').toString();
      final channelId = (data['channelId'] ?? '').toString();
      if (serverId.isEmpty) {
        navigator.push(messagesEntryRoute(const MessagesShell()));
        return;
      }
      PendingMessagesPushNavigation.set({
        'serverId': serverId,
        'channelId': channelId,
      });
      navigator.push(messagesEntryRoute(const MessagesShell()));
      return;
    }

    if (type == 'event' || type == 'server_notification') {
      final serverId = (data['serverId'] ?? '').toString();
      if (serverId.isEmpty) {
        navigator.push(messagesEntryRoute(const MessagesShell()));
        return;
      }
      PendingMessagesPushNavigation.set({
        'serverId': serverId,
        if (type == 'event') 'eventId': (data['_id'] ?? '').toString(),
        if (type == 'server_notification') 'inboxTab': 'for_you',
      });
      navigator.push(messagesEntryRoute(const MessagesShell()));
    }
  }

  static Future<void> routeIncomingCall(Map<String, dynamic> data) async {
    final token = AuthStorage.accessToken;
    if (token == null || token.isEmpty) {
      await PendingDmCallStorage.save(Map<String, dynamic>.from(data));
      return;
    }
    final callerId = _readCallerId(data);
    if (callerId.isEmpty) return;

    final video = _readCallVideoFlag(data);
    final name =
        (data['callerName'] ??
                data['callerDisplayName'] ??
                data['displayName'] ??
                '')
            .toString()
            .trim();
    final username =
        (data['callerUsername'] ?? data['username'] ?? '').toString().trim();
    final avatar =
        (data['callerAvatar'] ?? data['avatarUrl'] ?? data['avatar'] ?? '')
            .toString()
            .trim();
    await DirectMessagesRealtimeService.connect();
    final callId = (data['callId'] ?? '').toString().trim();
    DmCallManager.instance.presentIncomingHintFromPush(
      callerUserId: callerId,
      displayName: name.isNotEmpty ? name : null,
      username: username.isNotEmpty ? username : null,
      avatarUrl: avatar.isNotEmpty ? avatar : null,
      video: video,
      callId: callId.isNotEmpty ? callId : null,
    );
  }

  static String _readDmPeerId(Map<String, dynamic> data) {
    for (final key in <String>[
      'peerUserId',
      'senderUserId',
      'senderId',
      'fromUserId',
    ]) {
      final v = data[key];
      if (v == null) continue;
      final s = v.toString().trim();
      if (s.isNotEmpty) return s;
    }
    return '';
  }

  static String _readCallerId(Map<String, dynamic> data) {
    for (final key in <String>[
      'callerUserId',
      'callerId',
      'fromUserId',
      'peerId',
      'userId',
    ]) {
      final v = data[key];
      if (v == null) continue;
      final s = v.toString().trim();
      if (s.isNotEmpty) return s;
    }
    return '';
  }

  static bool _readCallVideoFlag(Map<String, dynamic> data) {
    final v = data['video'] ?? data['isVideo'] ?? data['callType'];
    if (v == null) return true;
    final s = v.toString().toLowerCase().trim();
    if (s == 'audio' || s == 'voice' || s == 'false' || s == '0') {
      return false;
    }
    return true;
  }
}
