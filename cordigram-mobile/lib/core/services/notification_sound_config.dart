import 'package:flutter_local_notifications/flutter_local_notifications.dart';

/// Shared notification sound assets + Android raw resource names.
class NotificationSoundConfig {
  NotificationSoundConfig._();

  static const String messageAsset =
      'Sounds/universfield-new-notification-040-493469.mp3';
  static const String incomingCallAsset = 'Sounds/incoming-call.mp3';
  static const String outgoingCallAsset = 'Sounds/outgoing-call.mp3';

  static const RawResourceAndroidNotificationSound androidMessageSound =
      RawResourceAndroidNotificationSound('cordigram_notify');
  static const RawResourceAndroidNotificationSound androidIncomingCallSound =
      RawResourceAndroidNotificationSound('cordigram_incoming_call');

  static const AndroidNotificationChannel messagesChannel =
      AndroidNotificationChannel(
        'cordigram_push_messages_v2',
        'Cordigram Messages',
        description: 'Direct messages, channel messages, mentions, events.',
        importance: Importance.high,
        playSound: true,
        sound: androidMessageSound,
      );

  static const AndroidNotificationChannel callsChannel =
      AndroidNotificationChannel(
        'cordigram_push_calls_v2',
        'Cordigram Calls',
        description: 'Incoming voice and video calls.',
        importance: Importance.max,
        playSound: true,
        sound: androidIncomingCallSound,
      );

  static const AndroidNotificationChannel socialChannel =
      AndroidNotificationChannel(
        'cordigram_push_high_v2',
        'Cordigram Push',
        description: 'Social notifications and account activity.',
        importance: Importance.max,
        playSound: true,
        sound: androidMessageSound,
      );

  static AndroidNotificationDetails androidMessageDetails({
    required String channelId,
    required String channelName,
    String? channelDescription,
    AndroidNotificationCategory? category,
  }) {
    return AndroidNotificationDetails(
      channelId,
      channelName,
      channelDescription: channelDescription,
      icon: 'ic_stat_cordigram',
      largeIcon: const DrawableResourceAndroidBitmap('cordigram_logo'),
      importance: Importance.max,
      priority: Priority.high,
      visibility: NotificationVisibility.public,
      playSound: true,
      sound: androidMessageSound,
      category: category ?? AndroidNotificationCategory.message,
    );
  }

  static AndroidNotificationDetails androidIncomingCallDetails({
    required String channelId,
    required String channelName,
    String? channelDescription,
  }) {
    return AndroidNotificationDetails(
      channelId,
      channelName,
      channelDescription: channelDescription,
      icon: 'ic_stat_cordigram',
      largeIcon: const DrawableResourceAndroidBitmap('cordigram_logo'),
      importance: Importance.max,
      priority: Priority.max,
      visibility: NotificationVisibility.public,
      playSound: true,
      sound: androidIncomingCallSound,
      category: AndroidNotificationCategory.call,
      fullScreenIntent: true,
    );
  }

  static const DarwinNotificationDetails iosMessageDetails =
      DarwinNotificationDetails(
        presentAlert: true,
        presentBadge: true,
        presentSound: true,
      );

  static const DarwinNotificationDetails iosIncomingCallDetails =
      DarwinNotificationDetails(
        presentAlert: true,
        presentBadge: true,
        presentSound: true,
        interruptionLevel: InterruptionLevel.timeSensitive,
      );
}
