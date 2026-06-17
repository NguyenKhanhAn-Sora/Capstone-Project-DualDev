import 'dart:async';

import 'package:socket_io_client/socket_io_client.dart' as io;

import '../../../core/config/app_config.dart';
import '../../../core/services/auth_storage.dart';
import '../../../core/services/language_controller.dart';
import '../../../core/services/theme_controller.dart';
import 'messages_media_service.dart';
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
    this.displayNameFontId,
    this.displayNameEffectId,
    this.displayNamePrimaryHex,
    this.displayNameAccentHex,
  });

  final String userId;
  final String? displayName;
  final String? username;
  final String? avatarUrl;
  final String? displayNameFontId;
  final String? displayNameEffectId;
  final String? displayNamePrimaryHex;
  final String? displayNameAccentHex;
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

class DmBlockUpdatedEvent {
  const DmBlockUpdatedEvent({
    required this.blocked,
    this.blockerId,
    this.peerId,
    this.direction,
  });

  final bool blocked;
  final String? blockerId;
  final String? peerId;
  final String? direction;
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

class DmCallSessionSyncItem {
  const DmCallSessionSyncItem({
    required this.callId,
    required this.peerId,
    required this.role,
    required this.state,
    required this.type,
    this.roomId,
  });

  final String callId;
  final String peerId;
  final String role; // caller | callee
  final String state;
  final String type; // audio | video
  final String? roomId;

  factory DmCallSessionSyncItem.fromJson(Map<String, dynamic> json) {
    return DmCallSessionSyncItem(
      callId: (json['callId'] ?? '').toString(),
      peerId: (json['peerId'] ?? '').toString(),
      role: (json['role'] ?? '').toString(),
      state: (json['state'] ?? '').toString(),
      type: (json['type'] ?? 'audio').toString(),
      roomId: json['roomId']?.toString(),
    );
  }
}

class DmCallMediaTransferredEvent {
  const DmCallMediaTransferredEvent({
    required this.peerId,
    this.callId,
    this.roomId,
    this.type,
  });

  final String peerId;
  final String? callId;
  final String? roomId;
  final String? type;
}

class DirectMessagesRealtimeService {
  DirectMessagesRealtimeService._();

  static io.Socket? _socket;
  static String? _token;

  static final StreamController<DmMessage> _newMessageController =
      StreamController<DmMessage>.broadcast();
  static final StreamController<DmUnreadCountEvent> _unreadController =
      StreamController<DmUnreadCountEvent>.broadcast();
  static final StreamController<DmBlockUpdatedEvent> _blockUpdatedController =
      StreamController<DmBlockUpdatedEvent>.broadcast();
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
  static final StreamController<List<DmCallSessionSyncItem>>
      _callSessionsSyncController =
      StreamController<List<DmCallSessionSyncItem>>.broadcast();
  static final StreamController<DmCallMediaTransferredEvent>
      _callMediaTransferredController =
      StreamController<DmCallMediaTransferredEvent>.broadcast();
  static final StreamController<Map<String, dynamic>> _messageDeletedController =
      StreamController<Map<String, dynamic>>.broadcast();
  static final StreamController<Map<String, dynamic>> _messagesReadController =
      StreamController<Map<String, dynamic>>.broadcast();
  static final StreamController<DmUserTypingEvent> _typingController =
      StreamController<DmUserTypingEvent>.broadcast();
  static final StreamController<DmProfileStyleUpdatedEvent>
  _profileStyleController =
      StreamController<DmProfileStyleUpdatedEvent>.broadcast();
  static final StreamController<Map<String, dynamic>> _userSettingsController =
      StreamController<Map<String, dynamic>>.broadcast();
  static final StreamController<Map<String, dynamic>> _boostEntitlementController =
      StreamController<Map<String, dynamic>>.broadcast();

  static Timer? _presencePingTimer;
  static final Set<String> _presencePeerIds = <String>{};

  static Stream<DmMessage> get newMessages => _newMessageController.stream;
  static Stream<DmUnreadCountEvent> get unreadCounts =>
      _unreadController.stream;
  static Stream<DmBlockUpdatedEvent> get blockUpdated =>
      _blockUpdatedController.stream;
  static Stream<PresenceState> get presences => _presenceController.stream;
  static Stream<Map<String, dynamic>> get reactions =>
      _reactionController.stream;
  static Stream<DmCallEvent> get callEvents => _callController.stream;
  static Stream<String> get callEnded => _callEndedController.stream;
  static Stream<DmCallBusyEvent> get callBusy => _callBusyController.stream;
  static Stream<DmCallIncomingDismissEvent> get callIncomingDismiss =>
      _callIncomingDismissController.stream;
  static Stream<List<DmCallSessionSyncItem>> get callSessionsSync =>
      _callSessionsSyncController.stream;
  static Stream<DmCallMediaTransferredEvent> get callMediaTransferred =>
      _callMediaTransferredController.stream;
  static Stream<Map<String, dynamic>> get messageDeleted =>
      _messageDeletedController.stream;
  static Stream<Map<String, dynamic>> get messagesRead =>
      _messagesReadController.stream;
  static Stream<DmUserTypingEvent> get userTyping => _typingController.stream;
  static Stream<DmProfileStyleUpdatedEvent> get profileStyleUpdated =>
      _profileStyleController.stream;
  static Stream<Map<String, dynamic>> get userSettingsUpdated =>
      _userSettingsController.stream;
  static Stream<Map<String, dynamic>> get boostEntitlementUpdated =>
      _boostEntitlementController.stream;

  /// Local-only emit (e.g. after saving style in profile editor).
  static void emitLocalProfileStyleUpdated(DmProfileStyleUpdatedEvent event) {
    _profileStyleController.add(event);
  }

  static void _applyRemoteUserSettings(Map<String, dynamic> settings) {
    final lang = (settings['language'] ?? '').toString().toLowerCase();
    if (LanguageController.supported.contains(lang)) {
      unawaited(LanguageController.instance.applyRemoteLanguage(lang));
    }
    unawaited(ThemeController.instance.applyFromServerSettings(settings));
  }

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

    socket.on('dm-block-updated', (payload) {
      if (payload is! Map) return;
      _blockUpdatedController.add(
        DmBlockUpdatedEvent(
          blocked: payload['blocked'] == true,
          blockerId: payload['blockerId']?.toString(),
          peerId: payload['peerId']?.toString(),
          direction: payload['direction']?.toString(),
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
    socket.on('call-sessions-sync', (payload) {
      if (payload is! Map) return;
      final data = Map<String, dynamic>.from(payload);
      final raw = data['sessions'];
      if (raw is! List) return;
      final sessions = raw
          .whereType<Map>()
          .map((item) => DmCallSessionSyncItem.fromJson(
                Map<String, dynamic>.from(item),
              ))
          .toList(growable: false);
      _callSessionsSyncController.add(sessions);
    });
    socket.on('call-media-transferred', (payload) {
      if (payload is! Map) return;
      final data = Map<String, dynamic>.from(payload);
      final peerId = (data['peerId'] ?? '').toString();
      if (peerId.isEmpty) return;
      _callMediaTransferredController.add(
        DmCallMediaTransferredEvent(
          peerId: peerId,
          callId: data['callId']?.toString(),
          roomId: data['roomId']?.toString(),
          type: data['type']?.toString(),
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
          displayNameFontId: payload['displayNameFontId']?.toString(),
          displayNameEffectId: payload['displayNameEffectId']?.toString(),
          displayNamePrimaryHex: payload['displayNamePrimaryHex']?.toString(),
          displayNameAccentHex: payload['displayNameAccentHex']?.toString(),
        ),
      );
    });

    socket.on('user-settings-updated', (payload) {
      if (payload is! Map) return;
      final settings = Map<String, dynamic>.from(payload);
      _userSettingsController.add(settings);
      _applyRemoteUserSettings(settings);
    });

    socket.on('boost-entitlement-updated', (payload) {
      if (payload is! Map) return;
      final data = Map<String, dynamic>.from(payload);
      _boostEntitlementController.add(data);
      final limits = data['limits'];
      int? maxBytes;
      if (limits is Map) {
        final v = limits['maxUploadBytes'];
        if (v is num && v > 0) maxBytes = v.toInt();
      }
      MessagesMediaService.applyBoostEntitlement(
        active: data['active'] == true,
        maxUploadBytes: maxBytes,
      );
    });

    socket.on('connect', (_) {
      _startPresenceHeartbeat();
      _resubscribePresence();
    });
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

  static void _resubscribePresence() {
    if (_presencePeerIds.isEmpty || _socket == null) return;
    _socket!.emit('presence-subscribe', {
      'userIds': _presencePeerIds.toList(),
    });
  }

  static void subscribePresence(List<String> userIds) {
    if (userIds.isEmpty) return;
    _presencePeerIds.addAll(userIds.where((id) => id.isNotEmpty));
    if (_socket == null) return;
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

  static Future<Map<String, dynamic>> claimCallMedia(String peerId) async {
    final socket = _socket;
    if (socket == null || socket.connected != true || peerId.isEmpty) {
      return {'ok': false};
    }
    final completer = Completer<Map<String, dynamic>>();
    socket.emitWithAck('call-media-claim', {'peerId': peerId}, ack: (data) {
      if (data is Map) {
        completer.complete(Map<String, dynamic>.from(data));
      } else {
        completer.complete({'ok': false});
      }
    });
    try {
      return await completer.future.timeout(const Duration(seconds: 8));
    } catch (_) {
      return {'ok': false};
    }
  }

  static void answerCall(String callerId, Map<String, dynamic> sdpOffer) {
    _socket?.emit('call-answer', {'callerId': callerId, 'sdpOffer': sdpOffer});
  }

  static void rejectCall(String callerId) {
    _socket?.emit('call-reject', {'callerId': callerId});
  }

  static void endCall(
    String peerId, {
    String? status,
    int? durationSec,
  }) {
    final payload = <String, dynamic>{'peerId': peerId};
    if (status != null && status.isNotEmpty) {
      payload['status'] = status;
    }
    if (durationSec != null) {
      payload['durationSec'] = durationSec;
    }
    _socket?.emit('call-end', payload);
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
      socket.off('dm-block-updated');
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
      socket.off('call-sessions-sync');
      socket.off('call-media-transferred');
      socket.off('message-deleted');
      socket.off('messages-read');
      socket.off('user-typing');
      socket.off('user-profile-style-updated');
      socket.off('user-settings-updated');
      socket.off('boost-entitlement-updated');
      socket.off('connect');
      socket.off('disconnect');
      socket.disconnect();
      socket.dispose();
    }
    _socket = null;
    _token = null;
  }
}
