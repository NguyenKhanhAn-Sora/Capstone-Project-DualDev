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

class NotificationStateEvent {
  const NotificationStateEvent({
    required this.id,
    required this.readAt,
    required this.unreadCount,
  });

  final String id;
  final String? readAt;
  final int unreadCount;
}

class NotificationDeletedEvent {
  const NotificationDeletedEvent({required this.id, required this.unreadCount});

  final String id;
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
  static final StreamController<NotificationStateEvent> _stateController =
      StreamController<NotificationStateEvent>.broadcast();
  static final StreamController<NotificationDeletedEvent> _deletedController =
      StreamController<NotificationDeletedEvent>.broadcast();

  static Stream<NotificationRealtimeEvent> get events => _controller.stream;
  static Stream<NotificationSeenEvent> get seenEvents => _seenController.stream;
  static Stream<NotificationStateEvent> get stateEvents =>
      _stateController.stream;
  static Stream<NotificationDeletedEvent> get deletedEvents =>
      _deletedController.stream;

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

    socket.on('notification:state', (payload) {
      if (payload is! Map) return;
      final id = payload['id'];
      if (id is! String || id.isEmpty) return;
      final readAtRaw = payload['readAt'];
      final readAt = readAtRaw is String ? readAtRaw : null;
      final unreadCountRaw = payload['unreadCount'];
      final unreadCount = (unreadCountRaw is num) ? unreadCountRaw.toInt() : 0;

      _stateController.add(
        NotificationStateEvent(
          id: id,
          readAt: readAt,
          unreadCount: unreadCount,
        ),
      );
    });

    socket.on('notification:deleted', (payload) {
      if (payload is! Map) return;
      final id = payload['id'];
      if (id is! String || id.isEmpty) return;
      final unreadCountRaw = payload['unreadCount'];
      final unreadCount = (unreadCountRaw is num) ? unreadCountRaw.toInt() : 0;

      _deletedController.add(
        NotificationDeletedEvent(id: id, unreadCount: unreadCount),
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
      socket.off('notification:state');
      socket.off('notification:deleted');
      socket.disconnect();
      socket.dispose();
    }
    _socket = null;
    _token = null;
  }
}
