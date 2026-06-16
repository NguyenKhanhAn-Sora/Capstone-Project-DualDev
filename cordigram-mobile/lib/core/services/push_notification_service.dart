import 'dart:async';
import 'dart:convert';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import 'api_service.dart';
import 'auth_storage.dart';
import 'messages_push_handler.dart';
import 'push_notification_background.dart';
import 'social_push_handler.dart';
import '../../features/messages/services/direct_messages_service.dart';

/// FCM entry point: token sync + delegates to Messages/Social handlers.
/// Social logic mirrors [/notifications] socket + FCM on backend.
/// Messages logic covers calls/DM/mentions/events/role notices only.
class PushNotificationService {
  PushNotificationService._();

  static final FirebaseMessaging _messaging = FirebaseMessaging.instance;
  static final FlutterLocalNotificationsPlugin _local =
      FlutterLocalNotificationsPlugin();

  static bool _initialized = false;
  static GlobalKey<NavigatorState>? _navigatorKey;
  static Map<String, dynamic>? _pendingTapData;
  static bool _drainScheduled = false;
  static const Duration _dedupeWindow = Duration(seconds: 8);
  static final Map<String, DateTime> _recentIds = {};

  static Future<void> initialize({
    required GlobalKey<NavigatorState> navigatorKey,
  }) async {
    _navigatorKey = navigatorKey;
    if (_initialized) return;

    await Firebase.initializeApp();
    FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
    await DirectMessagesService.hydrateConversationMutes();

    const iosSettings = DarwinInitializationSettings(
      requestAlertPermission: false,
      requestBadgePermission: false,
      requestSoundPermission: false,
    );

    await _local.initialize(
      const InitializationSettings(
        android: AndroidInitializationSettings(
          MessagesPushHandler.androidSmallIcon,
        ),
        iOS: iosSettings,
      ),
      onDidReceiveNotificationResponse: (response) {
        final payload = response.payload;
        if (payload == null || payload.isEmpty) {
          _openSocialNotifications();
          return;
        }
        try {
          _handleTapData(jsonDecode(payload) as Map<String, dynamic>);
        } catch (_) {
          _openSocialNotifications();
        }
      },
    );

    final androidLocal = _local
        .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin
        >();
    await androidLocal?.createNotificationChannel(
      SocialPushHandler.socialChannel,
    );
    await androidLocal?.createNotificationChannel(
      MessagesPushHandler.messagesChannel,
    );
    await androidLocal?.createNotificationChannel(
      MessagesPushHandler.callsChannel,
    );

    await _messaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
      provisional: false,
    );

    FirebaseMessaging.onMessage.listen((message) async {
      await _handleForegroundMessage(message);
    });

    FirebaseMessaging.onMessageOpenedApp.listen((message) {
      _handleTapData(message.data);
    });

    final initialMessage = await _messaging.getInitialMessage();
    if (initialMessage != null) {
      _handleTapData(initialMessage.data);
    }

    _messaging.onTokenRefresh.listen((token) {
      unawaited(_syncTokenWithBackend(token));
    });

    try {
      final token = await _messaging.getToken();
      if (token != null && token.trim().isNotEmpty) {
        await syncCurrentToken();
      }
    } catch (err) {
      if (kDebugMode) {
        debugPrint('[Push] getToken failed during init: $err');
      }
    }

    _initialized = true;
  }

  /// Registers the device FCM token with the backend. Retries when the device
  /// session is not ready yet (common right after login).
  static Future<bool> syncCurrentToken({int maxAttempts = 4}) async {
    for (var attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        final token = await _messaging
            .getToken()
            .timeout(const Duration(seconds: 8));
        if (token == null || token.trim().isEmpty) return false;
        await _syncTokenWithBackend(token);
        if (kDebugMode) {
          debugPrint('[Push] FCM token synced (attempt ${attempt + 1})');
        }
        return true;
      } catch (err) {
        if (kDebugMode) {
          debugPrint(
            '[Push] sync attempt ${attempt + 1}/$maxAttempts failed: $err',
          );
        }
        if (attempt < maxAttempts - 1) {
          await Future<void>.delayed(
            Duration(milliseconds: 350 * (attempt + 1)),
          );
        }
      }
    }
    return false;
  }

  static Future<void> clearTokenOnLogout() async {
    final accessToken = AuthStorage.accessToken;
    if (accessToken == null || accessToken.isEmpty) return;
    try {
      await ApiService.patch(
        '/users/push-token',
        body: {'token': null},
        extraHeaders: {'Authorization': 'Bearer $accessToken'},
      );
    } catch (_) {}
  }

  static Future<void> _syncTokenWithBackend(String token) async {
    final accessToken = AuthStorage.accessToken;
    if (accessToken == null || accessToken.isEmpty) {
      throw StateError('Missing access token');
    }
    final deviceId = AuthStorage.deviceId;
    if (deviceId == null || deviceId.isEmpty) {
      throw StateError('Missing device id');
    }
    await ApiService.patch(
      '/users/push-token',
      body: {'token': token},
      extraHeaders: {'Authorization': 'Bearer $accessToken'},
    );
  }

  static bool _shouldDedupe(String id) {
    final now = DateTime.now();
    _recentIds.removeWhere(
      (key, ts) => now.difference(ts) > _dedupeWindow,
    );
    if (_recentIds.containsKey(id)) return true;
    _recentIds[id] = now;
    return false;
  }

  static Future<void> _handleForegroundMessage(RemoteMessage message) async {
    final data = Map<String, dynamic>.from(message.data);

    if (MessagesPushHandler.isMessagesPush(data)) {
      await MessagesPushHandler.handleForegroundMessage(
        message: message,
        local: _local,
        shouldDedupe: _shouldDedupe,
      );
      return;
    }

    if (SocialPushHandler.isSocialPush(data)) {
      await SocialPushHandler.handleForegroundMessage(
        message: message,
        local: _local,
        shouldDedupe: _shouldDedupe,
      );
    }
  }

  static void _handleTapData(Map<String, dynamic> data) {
    _pendingTapData = Map<String, dynamic>.from(data);
    _scheduleDrainPendingTap();
  }

  static void _scheduleDrainPendingTap() {
    if (_drainScheduled) return;
    _drainScheduled = true;
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      await Future<void>.delayed(const Duration(milliseconds: 220));
      _drainScheduled = false;
      _drainPendingTap();
    });
  }

  static void _openSocialNotifications() {
    final navigator = _navigatorKey?.currentState;
    if (navigator == null) {
      _pendingTapData = const <String, dynamic>{};
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _drainPendingTap();
      });
      return;
    }
    SocialPushHandler.navigateFromTap(navigator, const {});
  }

  static void _drainPendingTap() {
    final navigator = _navigatorKey?.currentState;
    if (navigator == null) {
      if (_pendingTapData != null) _scheduleDrainPendingTap();
      return;
    }

    final pending = _pendingTapData;
    if (pending == null) return;
    _pendingTapData = null;

    if (MessagesPushHandler.isMessagesPush(pending)) {
      MessagesPushHandler.navigateFromTap(navigator, pending);
      return;
    }

    SocialPushHandler.navigateFromTap(navigator, pending);
  }
}
