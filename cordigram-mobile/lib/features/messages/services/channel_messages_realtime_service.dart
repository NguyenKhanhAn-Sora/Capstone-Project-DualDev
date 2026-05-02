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

  static final StreamController<ChannelMessage> _messagesController =
      StreamController<ChannelMessage>.broadcast();
  static final StreamController<Map<String, dynamic>> _reactionController =
      StreamController<Map<String, dynamic>>.broadcast();
  static final StreamController<Map<String, dynamic>> _deletedController =
      StreamController<Map<String, dynamic>>.broadcast();

  static Stream<ChannelMessage> get messages => _messagesController.stream;
  static Stream<Map<String, dynamic>> get reactions => _reactionController.stream;
  static Stream<Map<String, dynamic>> get deleted => _deletedController.stream;

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

    socket.connect();
    _socket = socket;
  }

  static void joinChannel(String channelId) {
    _socket?.emit('join-channel', {'channelId': channelId});
  }

  static void leaveChannel(String channelId) {
    _socket?.emit('leave-channel', {'channelId': channelId});
  }

  static Future<void> disconnect() async {
    final socket = _socket;
    if (socket != null) {
      socket.off('new-message');
      socket.off('reaction-updated');
      socket.off('message-deleted');
      socket.disconnect();
      socket.dispose();
    }
    _socket = null;
    _token = null;
  }
}
