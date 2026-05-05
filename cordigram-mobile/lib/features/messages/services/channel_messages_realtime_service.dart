import 'dart:async';

import 'package:socket_io_client/socket_io_client.dart' as io;

import '../../../core/config/app_config.dart';
import '../../../core/services/auth_storage.dart';
import '../models/channel_message.dart';
import '../models/message_reaction.dart';

class ChannelMessagesRealtimeService {
  ChannelMessagesRealtimeService._();

  static io.Socket? _socket;
  static String? _token;

  /// Channel rooms the client should stay subscribed to (re-joined after reconnect).
  static final Set<String> _joinedChannelIds = <String>{};

  static final StreamController<ChannelMessage> _messagesController =
      StreamController<ChannelMessage>.broadcast();
  static final StreamController<Map<String, dynamic>> _reactionController =
      StreamController<Map<String, dynamic>>.broadcast();
  static final StreamController<Map<String, dynamic>> _deletedController =
      StreamController<Map<String, dynamic>>.broadcast();
  static final StreamController<Map<String, dynamic>> _channelNotificationController =
      StreamController<Map<String, dynamic>>.broadcast();
  static final StreamController<Map<String, dynamic>> _serverRealtimeController =
      StreamController<Map<String, dynamic>>.broadcast();

  static Stream<ChannelMessage> get messages => _messagesController.stream;
  static Stream<Map<String, dynamic>> get reactions => _reactionController.stream;
  static Stream<Map<String, dynamic>> get deleted => _deletedController.stream;
  /// Per-user pushes from the gateway (mentions, inbox-related) without joining a channel room.
  static Stream<Map<String, dynamic>> get channelNotifications =>
      _channelNotificationController.stream;
  static Stream<Map<String, dynamic>> get serverRealtime =>
      _serverRealtimeController.stream;

  static Future<void> connect() async {
    final token = AuthStorage.accessToken;
    if (token == null || token.isEmpty) return;
    final alreadyConnected = _socket != null && _socket!.connected;
    if (alreadyConnected && _token == token) return;

    await disconnect();
    _token = token;
    final uri = '${AppConfig.apiBaseUrl}/channel-messages';
    final socket = io.io(uri, <String, dynamic>{
      'transports': ['websocket'],
      'autoConnect': false,
      'reconnection': true,
      'reconnectionAttempts': -1,
      'auth': {'token': token},
      'extraHeaders': {'Authorization': 'Bearer $token'},
    });

    socket.on('new-message', (payload) {
      if (payload is! Map) return;
      final raw = payload['message'] ?? payload;
      if (raw is! Map) return;
      _messagesController.add(
        ChannelMessage.fromJson(Map<String, dynamic>.from(raw)),
      );
    });

    socket.on('reaction-updated', (payload) {
      if (payload is! Map) return;
      final mapped = Map<String, dynamic>.from(payload);
      final reactionsRaw = mapped['reactions'];
      if (reactionsRaw is List) {
        mapped['reactions'] = reactionsRaw
            .whereType<Map>()
            .map((e) => MessageReaction.fromJson(Map<String, dynamic>.from(e)))
            .toList();
      }
      _reactionController.add(mapped);
    });

    socket.on('message-deleted', (payload) {
      if (payload is! Map) return;
      _deletedController.add(Map<String, dynamic>.from(payload));
    });

    socket.on('channel-notification', (payload) {
      if (payload is! Map) return;
      _channelNotificationController.add(Map<String, dynamic>.from(payload));
    });

    socket.on('server-updated', (payload) {
      if (payload is! Map) return;
      final mapped = Map<String, dynamic>.from(payload);
      mapped['event'] = 'server-updated';
      _serverRealtimeController.add(mapped);
    });

    socket.on('server-membership-updated', (payload) {
      if (payload is! Map) return;
      final mapped = Map<String, dynamic>.from(payload);
      mapped['event'] = 'server-membership-updated';
      _serverRealtimeController.add(mapped);
    });

    socket.on('connect', (_) {
      for (final id in _joinedChannelIds) {
        _emitJoinChannel(id);
      }
    });

    socket.connect();
    _socket = socket;
  }

  static void _emitJoinChannel(String channelId) {
    final s = _socket;
    if (s == null || !s.connected || channelId.isEmpty) return;
    s.emit('join-channel', {'channelId': channelId});
  }

  static void joinChannel(String channelId) {
    if (channelId.isEmpty) return;
    _joinedChannelIds.add(channelId);
    _emitJoinChannel(channelId);
  }

  static void leaveChannel(String channelId) {
    if (channelId.isEmpty) return;
    _joinedChannelIds.remove(channelId);
    final s = _socket;
    if (s != null && s.connected) {
      s.emit('leave-channel', {'channelId': channelId});
    }
  }

  static Future<void> disconnect() async {
    final socket = _socket;
    if (socket != null) {
      socket.off('new-message');
      socket.off('reaction-updated');
      socket.off('message-deleted');
      socket.off('channel-notification');
      socket.off('server-updated');
      socket.off('server-membership-updated');
      socket.off('connect');
      socket.disconnect();
      socket.dispose();
    }
    _socket = null;
    _token = null;
    _joinedChannelIds.clear();
  }
}
