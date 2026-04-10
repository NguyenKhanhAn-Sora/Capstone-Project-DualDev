import 'dart:async';

import 'package:socket_io_client/socket_io_client.dart' as io;

import '../../../core/config/app_config.dart';
import '../../../core/services/auth_storage.dart';
import '../models/app_notification_item.dart';

class NotificationRealtimeEvent {
  const NotificationRealtimeEvent({
    required this.notification,
    required this.unreadCount,
  });

  final AppNotificationItem notification;
  final int unreadCount;
}

class NotificationSeenEvent {
  const NotificationSeenEvent({
    required this.lastSeenAt,
    required this.unreadCount,
  });

  final DateTime lastSeenAt;
  final int unreadCount;
}

class NotificationRealtimeService {
  NotificationRealtimeService._();

  static io.Socket? _socket;
  static String? _token;

  static final StreamController<NotificationRealtimeEvent> _controller =
      StreamController<NotificationRealtimeEvent>.broadcast();
  static final StreamController<NotificationSeenEvent> _seenController =
      StreamController<NotificationSeenEvent>.broadcast();

  static Stream<NotificationRealtimeEvent> get events => _controller.stream;
  static Stream<NotificationSeenEvent> get seenEvents => _seenController.stream;

  static Future<void> connect() async {
    final token = AuthStorage.accessToken;
    if (token == null || token.isEmpty) return;

    final alreadyConnected = _socket != null && _socket!.connected;
    if (alreadyConnected && _token == token) return;

    await disconnect();

    _token = token;
    final uri = '${AppConfig.apiBaseUrl}/notifications';

    final socket = io.io(uri, <String, dynamic>{
      'transports': ['websocket'],
      'autoConnect': false,
      'reconnection': true,
      'reconnectionAttempts': -1,
      'auth': {'token': token},
      'extraHeaders': {'Authorization': 'Bearer $token'},
    });

    socket.on('notification:new', (payload) {
      if (payload is! Map) return;
      final rawNotification = payload['notification'];
      if (rawNotification is! Map) return;

      final map = Map<String, dynamic>.from(rawNotification);
      final unreadCountRaw = payload['unreadCount'];
      final unreadCount = (unreadCountRaw is num) ? unreadCountRaw.toInt() : 0;

      try {
        final item = AppNotificationItem.fromJson(map);
        _controller.add(
          NotificationRealtimeEvent(
            notification: item,
            unreadCount: unreadCount,
          ),
        );
      } catch (_) {}
    });

    socket.on('notification:seen', (payload) {
      if (payload is! Map) return;
      final rawLastSeenAt = payload['lastSeenAt'];
      if (rawLastSeenAt is! String || rawLastSeenAt.isEmpty) return;
      final parsedLastSeenAt = DateTime.tryParse(rawLastSeenAt)?.toUtc();
      if (parsedLastSeenAt == null) return;
      final unreadCountRaw = payload['unreadCount'];
      final unreadCount = (unreadCountRaw is num) ? unreadCountRaw.toInt() : 0;

      _seenController.add(
        NotificationSeenEvent(
          lastSeenAt: parsedLastSeenAt,
          unreadCount: unreadCount,
        ),
      );
    });

    socket.connect();
    _socket = socket;
  }

  static Future<void> disconnect() async {
    final socket = _socket;
    if (socket != null) {
      socket.off('notification:new');
      socket.off('notification:seen');
      socket.disconnect();
      socket.dispose();
    }
    _socket = null;
    _token = null;
  }
}
