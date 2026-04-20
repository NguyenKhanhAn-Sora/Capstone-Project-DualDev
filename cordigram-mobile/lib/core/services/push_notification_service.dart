import 'dart:async';
import 'dart:convert';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import 'api_service.dart';
import 'auth_storage.dart';
import '../../features/notifications/notification_screen.dart';
import '../../features/post/post_detail_screen.dart';
import '../../features/profile/profile_screen.dart';
import '../../features/reels/reels_screen.dart';

class PushNotificationService {
  PushNotificationService._();

  static const String _androidSmallIcon = 'ic_stat_cordigram';
  static const String _androidLargeIcon = 'cordigram_logo';

  static final FirebaseMessaging _messaging = FirebaseMessaging.instance;
  static final FlutterLocalNotificationsPlugin _local =
      FlutterLocalNotificationsPlugin();

  static bool _initialized = false;
  static GlobalKey<NavigatorState>? _navigatorKey;
  static Map<String, dynamic>? _pendingTapData;
  static bool _drainScheduled = false;

  static const AndroidNotificationChannel _highChannel =
      AndroidNotificationChannel(
        'cordigram_push_high',
        'Cordigram Push',
        description: 'High priority notifications for account activity.',
        importance: Importance.max,
      );

  static Future<void> initialize({
    required GlobalKey<NavigatorState> navigatorKey,
  }) async {
    _navigatorKey = navigatorKey;

    if (_initialized) return;

    await Firebase.initializeApp();

    await _local.initialize(
      const InitializationSettings(
        android: AndroidInitializationSettings(_androidSmallIcon),
      ),
      onDidReceiveNotificationResponse: (response) {
        final payload = response.payload;
        if (payload == null || payload.isEmpty) {
          _openNotifications();
          return;
        }
        try {
          final data = jsonDecode(payload) as Map<String, dynamic>;
          _handleTapData(data);
        } catch (_) {
          _openNotifications();
        }
      },
    );

    final androidLocal = _local
        .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin
        >();
    await androidLocal?.createNotificationChannel(_highChannel);

    await _messaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
      provisional: false,
      announcement: false,
      criticalAlert: false,
      carPlay: false,
    );

    FirebaseMessaging.onMessage.listen((message) async {
      final title = message.notification?.title ?? 'Cordigram';
      final body = message.notification?.body ?? 'You have a new notification.';

      await _local.show(
        message.hashCode,
        title,
        body,
        NotificationDetails(
          android: AndroidNotificationDetails(
            _highChannel.id,
            _highChannel.name,
            channelDescription: _highChannel.description,
            icon: _androidSmallIcon,
            largeIcon: DrawableResourceAndroidBitmap(_androidLargeIcon),
            importance: Importance.max,
            priority: Priority.high,
            visibility: NotificationVisibility.public,
          ),
        ),
        payload: jsonEncode(message.data),
      );
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

    final token = await _messaging.getToken();
    if (token != null && token.trim().isNotEmpty) {
      await _syncTokenWithBackend(token);
    }

    _initialized = true;
  }

  static Future<void> syncCurrentToken() async {
    final token = await _messaging.getToken();
    if (token == null || token.trim().isEmpty) return;
    await _syncTokenWithBackend(token);
  }

  static Future<void> _syncTokenWithBackend(String token) async {
    final accessToken = AuthStorage.accessToken;
    if (accessToken == null || accessToken.isEmpty) return;

    try {
      await ApiService.patch(
        '/users/push-token',
        body: {'token': token},
        extraHeaders: {'Authorization': 'Bearer $accessToken'},
      );
    } catch (_) {
      // Ignore sync failures and retry later on token refresh or next startup.
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

  static void _navigateFromTapData(
    NavigatorState navigator,
    Map<String, dynamic> data,
  ) {
    final type = (data['type'] as String?)?.trim() ?? '';
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
        MaterialPageRoute<void>(builder: (_) => ProfileScreen(userId: actorId)),
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

    _openNotifications();
  }

  static void _openNotifications() {
    final navigator = _navigatorKey?.currentState;
    if (navigator == null) {
      _pendingTapData = const <String, dynamic>{};
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _drainPendingTap();
      });
      return;
    }

    navigator.push(
      MaterialPageRoute<void>(builder: (_) => const NotificationScreen()),
    );
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

    if (pending.isEmpty) {
      _openNotifications();
      return;
    }

    _navigateFromTapData(navigator, pending);
  }
}
