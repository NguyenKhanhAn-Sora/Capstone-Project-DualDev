import 'dart:async';

import 'package:socket_io_client/socket_io_client.dart' as io;

import '../../../core/config/app_config.dart';
import '../../../core/services/auth_storage.dart';
import '../models/dm_message.dart';
import '../models/presence_state.dart';

class DmUserTypingEvent {
  const DmUserTypingEvent({
    required this.fromUserId,
    required this.username,
    required this.isTyping,
  });

  final String fromUserId;
  final String username;
  final bool isTyping;
}

class DmProfileStyleUpdatedEvent {
  const DmProfileStyleUpdatedEvent({
    required this.userId,
    this.displayName,
    this.username,
    this.avatarUrl,
  });

  final String userId;
  final String? displayName;
  final String? username;
  final String? avatarUrl;
}

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

class DmCallBusyEvent {
  const DmCallBusyEvent({
    required this.code,
    this.receiverId,
    this.peerId,
  });

  final String code; // already_in_call | peer_busy | user_busy
  final String? receiverId;
  final String? peerId;
}

class DmCallIncomingDismissEvent {
  const DmCallIncomingDismissEvent({
    required this.peerId,
    this.callId,
    this.reason = 'answered_elsewhere',
  });

  final String peerId;
  final String? callId;
  final String reason;
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
  static final StreamController<DmCallBusyEvent> _callBusyController =
      StreamController<DmCallBusyEvent>.broadcast();
  static final StreamController<DmCallIncomingDismissEvent>
      _callIncomingDismissController =
      StreamController<DmCallIncomingDismissEvent>.broadcast();
  static final StreamController<Map<String, dynamic>> _messageDeletedController =
      StreamController<Map<String, dynamic>>.broadcast();
  static final StreamController<Map<String, dynamic>> _messagesReadController =
      StreamController<Map<String, dynamic>>.broadcast();
  static final StreamController<DmUserTypingEvent> _typingController =
      StreamController<DmUserTypingEvent>.broadcast();
  static final StreamController<DmProfileStyleUpdatedEvent>
  _profileStyleController =
      StreamController<DmProfileStyleUpdatedEvent>.broadcast();

  static Timer? _presencePingTimer;

  static Stream<DmMessage> get newMessages => _newMessageController.stream;
  static Stream<DmUnreadCountEvent> get unreadCounts =>
      _unreadController.stream;
  static Stream<PresenceState> get presences => _presenceController.stream;
  static Stream<Map<String, dynamic>> get reactions =>
      _reactionController.stream;
  static Stream<DmCallEvent> get callEvents => _callController.stream;
  static Stream<String> get callEnded => _callEndedController.stream;
  static Stream<DmCallBusyEvent> get callBusy => _callBusyController.stream;
  static Stream<DmCallIncomingDismissEvent> get callIncomingDismiss =>
      _callIncomingDismissController.stream;
  static Stream<Map<String, dynamic>> get messageDeleted =>
      _messageDeletedController.stream;
  static Stream<Map<String, dynamic>> get messagesRead =>
      _messagesReadController.stream;
  static Stream<DmUserTypingEvent> get userTyping => _typingController.stream;
  static Stream<DmProfileStyleUpdatedEvent> get profileStyleUpdated =>
      _profileStyleController.stream;

  static Future<void> connect() async {
    final token = AuthStorage.accessToken;
    if (token == null || token.isEmpty) return;
    final alreadyConnected = _socket != null && _socket!.connected;
    if (alreadyConnected && _token == token) return;

    await disconnect();
    _token = token;
    final uri = '${AppConfig.apiBaseUrl}/direct-messages';
    final socket = io.io(uri, <String, dynamic>{
      'transports': ['websocket', 'polling'],
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
    socket.on('call-busy', (payload) {
      if (payload is! Map) return;
      final data = Map<String, dynamic>.from(payload);
      _callBusyController.add(
        DmCallBusyEvent(
          code: (data['code'] ?? 'already_in_call').toString(),
          receiverId: data['receiverId']?.toString(),
          peerId: data['peerId']?.toString(),
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
    socket.on('call-incoming-dismiss', (payload) {
      if (payload is! Map) return;
      final data = Map<String, dynamic>.from(payload);
      final peerId = (data['peerId'] ?? '').toString();
      if (peerId.isEmpty) return;
      _callIncomingDismissController.add(
        DmCallIncomingDismissEvent(
          peerId: peerId,
          callId: data['callId']?.toString(),
          reason: (data['reason'] ?? 'answered_elsewhere').toString(),
        ),
      );
    });
    socket.on('message-deleted', (payload) {
      if (payload is! Map) return;
      _messageDeletedController.add(Map<String, dynamic>.from(payload));
    });
    socket.on('messages-read', (payload) {
      if (payload is! Map) return;
      _messagesReadController.add(Map<String, dynamic>.from(payload));
    });

    socket.on('user-typing', (payload) {
      if (payload is! Map) return;
      final fromUserId = (payload['fromUserId'] ?? '').toString();
      if (fromUserId.isEmpty) return;
      _typingController.add(
        DmUserTypingEvent(
          fromUserId: fromUserId,
          username: (payload['username'] ?? '').toString(),
          isTyping: payload['isTyping'] == true,
        ),
      );
    });

    socket.on('user-profile-style-updated', (payload) {
      if (payload is! Map) return;
      final userId = (payload['userId'] ?? payload['_id'] ?? '').toString();
      if (userId.isEmpty) return;
      _profileStyleController.add(
        DmProfileStyleUpdatedEvent(
          userId: userId,
          displayName: payload['displayName']?.toString(),
          username: payload['username']?.toString(),
          avatarUrl: (payload['avatarUrl'] ?? payload['avatar'])?.toString(),
        ),
      );
    });

    socket.on('connect', (_) => _startPresenceHeartbeat());
    socket.on('disconnect', (_) => _stopPresenceHeartbeat());

    socket.connect();
    _socket = socket;
    if (socket.connected) _startPresenceHeartbeat();
  }

  static void _startPresenceHeartbeat() {
    _stopPresenceHeartbeat();
    _emitPresencePing();
    _emitPresenceActivity();
    _presencePingTimer = Timer.periodic(
      const Duration(seconds: 25),
      (_) => _emitPresencePing(),
    );
  }

  static void _stopPresenceHeartbeat() {
    _presencePingTimer?.cancel();
    _presencePingTimer = null;
  }

  static void _emitPresencePing() {
    _socket?.emit('presence-ping');
  }

  static void _emitPresenceActivity() {
    _socket?.emit('presence-activity');
  }

  /// Call on user interaction while app is foregrounded (mirrors web mouse/click).
  static void notifyUserActivity() {
    if (_socket?.connected != true) return;
    _emitPresenceActivity();
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

  static void markMessageIdsAsRead({
    required List<String> messageIds,
    required String senderId,
  }) {
    if (messageIds.isEmpty) return;
    _socket?.emit('mark-as-read', {
      'messageIds': messageIds,
      'senderId': senderId,
    });
  }

  static void emitDeleteMessage({
    required String messageId,
    required String receiverId,
    String deleteType = 'for-everyone',
  }) {
    _socket?.emit('delete-message', {
      'messageId': messageId,
      'deleteType': deleteType,
      'receiverId': receiverId,
    });
  }

  static void initiateCall({
    required String receiverId,
    required bool isVideo,
  }) {
    _socket?.emit('call-initiate', {
      'receiverId': receiverId,
      'type': isVideo ? 'video' : 'audio',
      'clientPlatform': 'mobile',
    });
  }

  static void emitCallHeartbeat(String callId) {
    if (callId.isEmpty) return;
    _socket?.emit('call-heartbeat', {'callId': callId});
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
    _stopPresenceHeartbeat();
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
      socket.off('call-busy');
      socket.off('ice-candidate');
      socket.off('call-ended');
      socket.off('call-incoming-dismiss');
      socket.off('message-deleted');
      socket.off('messages-read');
      socket.disconnect();
      socket.dispose();
    }
    _socket = null;
    _token = null;
  }
}
