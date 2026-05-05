import 'dart:async';

import 'package:socket_io_client/socket_io_client.dart' as io;

import '../../../core/config/app_config.dart';
import '../../../core/services/auth_storage.dart';
import '../models/dm_message.dart';
import '../models/presence_state.dart';

class DmUnreadCountEvent {
  const DmUnreadCountEvent({
    required this.totalUnread,
    required this.fromUserId,
    required this.conversationUnread,
  });

  final int totalUnread;
  final String? fromUserId;
  final int? conversationUnread;
}

class DmCallEvent {
  const DmCallEvent({
    required this.fromUserId,
    required this.signal,
    this.type,
    this.payload,
    this.callerInfo,
  });

  final String fromUserId;
  final String signal; // incoming | answer | rejected | ice
  final String? type; // audio | video
  final Map<String, dynamic>? payload;
  final Map<String, dynamic>? callerInfo;
}

class DirectMessagesRealtimeService {
  DirectMessagesRealtimeService._();

  static io.Socket? _socket;
  static String? _token;

  static final StreamController<DmMessage> _newMessageController =
      StreamController<DmMessage>.broadcast();
  static final StreamController<DmUnreadCountEvent> _unreadController =
      StreamController<DmUnreadCountEvent>.broadcast();
  static final StreamController<PresenceState> _presenceController =
      StreamController<PresenceState>.broadcast();
  static final StreamController<Map<String, dynamic>> _reactionController =
      StreamController<Map<String, dynamic>>.broadcast();
  static final StreamController<DmCallEvent> _callController =
      StreamController<DmCallEvent>.broadcast();
  static final StreamController<String> _callEndedController =
      StreamController<String>.broadcast();
  static final StreamController<Map<String, dynamic>> _messageDeletedController =
      StreamController<Map<String, dynamic>>.broadcast();
  static final StreamController<Map<String, dynamic>> _messagesReadController =
      StreamController<Map<String, dynamic>>.broadcast();

  static Stream<DmMessage> get newMessages => _newMessageController.stream;
  static Stream<DmUnreadCountEvent> get unreadCounts =>
      _unreadController.stream;
  static Stream<PresenceState> get presences => _presenceController.stream;
  static Stream<Map<String, dynamic>> get reactions =>
      _reactionController.stream;
  static Stream<DmCallEvent> get callEvents => _callController.stream;
  static Stream<String> get callEnded => _callEndedController.stream;
  static Stream<Map<String, dynamic>> get messageDeleted =>
      _messageDeletedController.stream;
  static Stream<Map<String, dynamic>> get messagesRead =>
      _messagesReadController.stream;

  static Future<void> connect() async {
    final token = AuthStorage.accessToken;
    if (token == null || token.isEmpty) return;
    final alreadyConnected = _socket != null && _socket!.connected;
    if (alreadyConnected && _token == token) return;

    await disconnect();
    _token = token;
    final uri = '${AppConfig.apiBaseUrl}/direct-messages';
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
      _newMessageController.add(
        DmMessage.fromJson(Map<String, dynamic>.from(raw)),
      );
    });

    socket.on('message-sent', (payload) {
      if (payload is! Map) return;
      final raw = payload['message'];
      if (raw is! Map) return;
      _newMessageController.add(
        DmMessage.fromJson(Map<String, dynamic>.from(raw)),
      );
    });

    socket.on('dm-unread-count', (payload) {
      if (payload is! Map) return;
      final total = payload['totalUnread'];
      final unread = payload['conversationUnread'];
      _unreadController.add(
        DmUnreadCountEvent(
          totalUnread: total is num ? total.toInt() : 0,
          fromUserId: payload['fromUserId']?.toString(),
          conversationUnread: unread is num ? unread.toInt() : null,
        ),
      );
    });

    socket.on('presence-updated', (payload) {
      if (payload is! Map) return;
      _presenceController.add(
        PresenceState.fromJson(Map<String, dynamic>.from(payload)),
      );
    });

    socket.on('presence-snapshot', (payload) {
      if (payload is! Map) return;
      final items = payload['items'];
      if (items is! List) return;
      for (final item in items.whereType<Map>()) {
        _presenceController.add(
          PresenceState.fromJson(Map<String, dynamic>.from(item)),
        );
      }
    });

    socket.on('reaction-added', _onReaction);
    socket.on('reaction-updated', _onReaction);

    socket.on('call-incoming', (payload) {
      if (payload is! Map) return;
      final data = Map<String, dynamic>.from(payload);
      _callController.add(
        DmCallEvent(
          fromUserId: (data['from'] ?? '').toString(),
          signal: 'incoming',
          type: data['type']?.toString(),
          callerInfo: data['callerInfo'] is Map
              ? Map<String, dynamic>.from(data['callerInfo'] as Map)
              : null,
          payload: data,
        ),
      );
    });
    socket.on('call-answer', (payload) {
      if (payload is! Map) return;
      final data = Map<String, dynamic>.from(payload);
      _callController.add(
        DmCallEvent(
          fromUserId: (data['from'] ?? '').toString(),
          signal: 'answer',
          payload: data,
        ),
      );
    });
    socket.on('call-rejected', (payload) {
      if (payload is! Map) return;
      final data = Map<String, dynamic>.from(payload);
      _callController.add(
        DmCallEvent(
          fromUserId: (data['from'] ?? '').toString(),
          signal: 'rejected',
          payload: data,
        ),
      );
    });
    socket.on('ice-candidate', (payload) {
      if (payload is! Map) return;
      final data = Map<String, dynamic>.from(payload);
      _callController.add(
        DmCallEvent(
          fromUserId: (data['from'] ?? '').toString(),
          signal: 'ice',
          payload: data,
        ),
      );
    });
    socket.on('call-ended', (payload) {
      if (payload is! Map) return;
      final data = Map<String, dynamic>.from(payload);
      _callEndedController.add((data['from'] ?? '').toString());
    });
    socket.on('message-deleted', (payload) {
      if (payload is! Map) return;
      _messageDeletedController.add(Map<String, dynamic>.from(payload));
    });
    socket.on('messages-read', (payload) {
      if (payload is! Map) return;
      _messagesReadController.add(Map<String, dynamic>.from(payload));
    });

    socket.connect();
    _socket = socket;
  }

  static void _onReaction(dynamic payload) {
    if (payload is! Map) return;
    _reactionController.add(Map<String, dynamic>.from(payload));
  }

  static void subscribePresence(List<String> userIds) {
    if (userIds.isEmpty || _socket == null) return;
    _socket!.emit('presence-subscribe', {'userIds': userIds});
  }

  static void setTyping({required String toUserId, required bool isTyping}) {
    _socket?.emit('typing', {'receiverId': toUserId, 'isTyping': isTyping});
  }

  static void markAsRead({required String userId}) {
    _socket?.emit('mark-all-as-read', {'senderId': userId});
  }

  static void initiateCall({
    required String receiverId,
    required bool isVideo,
  }) {
    _socket?.emit('call-initiate', {
      'receiverId': receiverId,
      'type': isVideo ? 'video' : 'audio',
    });
  }

  static void answerCall(String callerId, Map<String, dynamic> sdpOffer) {
    _socket?.emit('call-answer', {'callerId': callerId, 'sdpOffer': sdpOffer});
  }

  static void rejectCall(String callerId) {
    _socket?.emit('call-reject', {'callerId': callerId});
  }

  static void endCall(String peerId) {
    _socket?.emit('call-end', {'peerId': peerId});
  }

  static void sendCallSignal(String event, Map<String, dynamic> payload) {
    _socket?.emit(event, payload);
  }

  static Future<void> disconnect() async {
    final socket = _socket;
    if (socket != null) {
      socket.off('new-message');
      socket.off('message-sent');
      socket.off('dm-unread-count');
      socket.off('presence-updated');
      socket.off('presence-snapshot');
      socket.off('reaction-added');
      socket.off('reaction-updated');
      socket.off('call-incoming');
      socket.off('call-answer');
      socket.off('call-rejected');
      socket.off('ice-candidate');
      socket.off('call-ended');
      socket.off('message-deleted');
      socket.off('messages-read');
      socket.disconnect();
      socket.dispose();
    }
    _socket = null;
    _token = null;
  }
}
