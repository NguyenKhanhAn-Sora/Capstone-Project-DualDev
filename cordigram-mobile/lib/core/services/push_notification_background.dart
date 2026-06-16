import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import 'messages_push_handler.dart';
import 'social_push_handler.dart';

@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();

  final plugin = FlutterLocalNotificationsPlugin();
  const android = AndroidInitializationSettings(
    MessagesPushHandler.androidSmallIcon,
  );
  const ios = DarwinInitializationSettings();
  await plugin.initialize(
    const InitializationSettings(android: android, iOS: ios),
  );

  final androidPlugin = plugin.resolvePlatformSpecificImplementation<
      AndroidFlutterLocalNotificationsPlugin>();
  await androidPlugin?.createNotificationChannel(
    MessagesPushHandler.callsChannel,
  );
  await androidPlugin?.createNotificationChannel(
    MessagesPushHandler.messagesChannel,
  );
  await androidPlugin?.createNotificationChannel(
    SocialPushHandler.socialChannel,
  );

  final data = Map<String, dynamic>.from(message.data);

  if (MessagesPushHandler.isMessagesPush(data)) {
    await MessagesPushHandler.showBackgroundNotification(
      message: message,
      local: plugin,
    );
    return;
  }

  if (SocialPushHandler.isSocialPush(data)) {
    await SocialPushHandler.showBackgroundNotification(
      message: message,
      local: plugin,
    );
  }
}
