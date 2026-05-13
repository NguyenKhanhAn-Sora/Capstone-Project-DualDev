import 'dart:async';

import 'package:flutter/foundation.dart';

import 'models/dm_message.dart';
import 'models/message_reaction.dart';
import 'models/message_thread.dart';
import 'models/presence_state.dart';
import 'models/voice_control_state.dart';
import 'services/channel_messages_realtime_service.dart';
import 'services/direct_messages_realtime_service.dart';
import 'services/direct_messages_service.dart';
import 'services/inbox_service.dart';
import 'services/message_notification_sound.dart';
import 'services/messages_media_service.dart';

class MessagesController extends ChangeNotifier {
  final List<MessageThread> _threads = [];
  final Map<String, List<DmMessage>> _messagesByUser = {};
  final Map<String, VoiceControlState> _voiceByContext = {};
  final Map<String, DateTime?> _conversationMutedUntil = {};
  final Set<String> _conversationMutedForever = {};
  final Set<String> _blockedUsers = {};

  StreamSubscription<DmMessage>? _newMessageSub;
  StreamSubscription<DmUnreadCountEvent>? _unreadSub;
  StreamSubscription<PresenceState>? _presenceSub;
  StreamSubscription<Map<String, dynamic>>? _reactionSub;
  StreamSubscription<Map<String, dynamic>>? _deletedSub;
  StreamSubscription<Map<String, dynamic>>? _messagesReadSub;
  StreamSubscription<Map<String, dynamic>>? _channelInboxSub;
  Timer? _inboxPollTimer;

  bool _loadingThreads = false;
  int _totalUnread = 0;
  String? _threadsError;
  int _inboxUnreadCount = 0;
  String? _myUserId;
  String? _myDisplayName;
  String? _myUsername;
  String? _myAvatarUrl;
  bool _myOnline = true;
  String _languageCode = 'vi';

  List<MessageThread> get threads => List.unmodifiable(_threads);
  bool get loadingThreads => _loadingThreads;
  int get totalUnread => _totalUnread;
  String? get threadsError => _threadsError;
  int get inboxUnreadCount => _inboxUnreadCount;
  String? get myUserId => _myUserId;
  String? get myDisplayName => _myDisplayName;
  String? get myUsername => _myUsername;
  String? get myAvatarUrl => _myAvatarUrl;
  bool get myOnline => _myOnline;
  String get languageCode => _languageCode;

  /// Latest messages for a peer (same list as in-memory cache).
  List<DmMessage> liveMessages(String peerUserId) =>
      List<DmMessage>.from(_messagesByUser[peerUserId] ?? const <DmMessage>[]);

  Future<void> init() async {
    _myUserId = DirectMessagesService.currentUserId;
    await DirectMessagesRealtimeService.connect();
    await ChannelMessagesRealtimeService.connect();
    _channelInboxSub = ChannelMessagesRealtimeService.channelNotifications.listen(
      (_) => refreshInboxCount(),
    );
    _newMessageSub = DirectMessagesRealtimeService.newMessages.listen(
      _onNewMessage,
    );
    _unreadSub = DirectMessagesRealtimeService.unreadCounts.listen((e) {
      _totalUnread = e.totalUnread;
      notifyListeners();
    });
    _presenceSub = DirectMessagesRealtimeService.presences.listen(_onPresence);
    _reactionSub = DirectMessagesRealtimeService.reactions.listen(_onReactionEvent);
    _deletedSub = DirectMessagesRealtimeService.messageDeleted.listen(
      _onDeletedEvent,
    );
    _messagesReadSub = DirectMessagesRealtimeService.messagesRead.listen(
      _onMessagesReadEvent,
    );
    _startInboxPolling();
    await refreshInboxCount();
    await refreshMyIdentity();
    await refreshBlockedUsers();
    await refreshThreads();
  }

  Future<void> refreshMyIdentity() async {
    try {
      final data = await DirectMessagesService.getMyMessagingProfile();
      _languageCode = await DirectMessagesService.getCurrentLanguageCode();
      _myDisplayName =
          (data['displayName'] ?? data['name'] ?? '').toString().trim();
      _myUsername =
          (data['chatUsername'] ?? data['username'] ?? '').toString().trim();
      _myAvatarUrl = (data['avatarUrl'] ?? data['avatar'])?.toString();
      _myOnline = true;
      notifyListeners();
    } catch (_) {}
  }

  Future<void> disposeController() async {
    await _newMessageSub?.cancel();
    await _unreadSub?.cancel();
    await _presenceSub?.cancel();
    await _reactionSub?.cancel();
    await _deletedSub?.cancel();
    await _messagesReadSub?.cancel();
    await _channelInboxSub?.cancel();
    _inboxPollTimer?.cancel();
    // Do not disconnect the shared DM socket here. [DmCallManager] needs it
    // app-wide for incoming calls while the user is on Home / social tabs.
    // Teardown happens on logout via [DmCallManager.onAuthChanged].
  }

  void _startInboxPolling() {
    _inboxPollTimer?.cancel();
    _inboxPollTimer = Timer.periodic(const Duration(seconds: 20), (_) {
      refreshInboxCount();
    });
  }

  Future<void> refreshInboxCount() async {
    try {
      _inboxUnreadCount = await InboxService.getUnreadInboxCount();
      notifyListeners();
    } catch (_) {}
  }

  Future<void> refreshThreads() async {
    _loadingThreads = true;
    _threadsError = null;
    _myUserId = DirectMessagesService.currentUserId;
    notifyListeners();
    try {
      var conversations = await DirectMessagesService.getDmSidebarThreads();
      if (conversations.isEmpty) {
        conversations =
            await DirectMessagesService.getFollowingAsConversations();
      }
      _threads
        ..clear()
        ..addAll(
          conversations.map(
            (c) => MessageThread(
              id: c.userId,
              name: c.title,
              lastMessage: c.lastMessage,
              lastActiveLabel: _formatRelative(c.lastMessageAt),
              unreadCount: c.unreadCount,
              avatarUrl: c.avatarUrl,
              isOnline: c.isOnline,
            ),
          ),
        );
      DirectMessagesRealtimeService.subscribePresence(
        _threads.map((e) => e.id).where((e) => e.isNotEmpty).toList(),
      );
      _totalUnread = _threads.fold<int>(0, (sum, e) => sum + e.unreadCount);
    } catch (e) {
      _threadsError = e.toString();
    } finally {
      _loadingThreads = false;
      notifyListeners();
    }
  }

  Future<List<DmMessage>> getConversation(String userId) async {
    final cached = _messagesByUser[userId];
    if (cached != null) return cached;
    final fetched = await DirectMessagesService.getConversationMessages(userId);
    _messagesByUser[userId] = fetched;
    return fetched;
  }

  void prependMessageToCache(String peerUserId, DmMessage message) {
    final list = _messagesByUser[peerUserId] ?? <DmMessage>[];
    if (list.any((m) => m.id == message.id)) return;
    list.add(message);
    _messagesByUser[peerUserId] = list;
    _patchThreadLastMessage(peerUserId, message.content);
    notifyListeners();
  }

  Future<void> markConversationRead(String userId) async {
    await DirectMessagesService.markConversationRead(userId);
    DirectMessagesRealtimeService.markAsRead(userId: userId);
    final idx = _threads.indexWhere((e) => e.id == userId);
    if (idx != -1) {
      _threads[idx] = MessageThread(
        id: _threads[idx].id,
        name: _threads[idx].name,
        lastMessage: _threads[idx].lastMessage,
        lastActiveLabel: _threads[idx].lastActiveLabel,
        unreadCount: 0,
        avatarUrl: _threads[idx].avatarUrl,
        isOnline: _threads[idx].isOnline,
        isPinned: _threads[idx].isPinned,
      );
      _totalUnread = _threads.fold<int>(0, (sum, e) => sum + e.unreadCount);
      notifyListeners();
    }
  }

  Future<DmMessage?> sendTextMessage({
    required String userId,
    required String content,
    String? replyTo,
  }) async {
    final sent = await DirectMessagesService.sendMessage(
      userId,
      content: content,
      replyTo: replyTo,
    );
    if (sent != null) {
      prependMessageToCache(userId, sent);
      MessageNotificationSound.play();
    }
    return sent;
  }

  Future<DmMessage?> sendGiphyMessage({
    required String peerUserId,
    required String giphyId,
    required String mediaType,
    String title = '',
    String? replyTo,
  }) async {
    final type = mediaType == 'sticker' ? 'sticker' : 'gif';
    final content = title.trim().isEmpty
        ? (type == 'sticker' ? 'Sent a sticker' : 'Sent a GIF')
        : title.trim();
    final sent = await DirectMessagesService.sendMessage(
      peerUserId,
      content: content,
      type: type,
      giphyId: giphyId,
      replyTo: replyTo,
    );
    if (sent != null) {
      prependMessageToCache(peerUserId, sent);
      MessageNotificationSound.play();
    }
    return sent;
  }

  Future<DmMessage?> sendVoiceMessage({
    required String peerUserId,
    required String filePath,
    required String mimeType,
    required int durationSeconds,
    String? replyTo,
  }) async {
    final upload = await MessagesMediaService.uploadFile(
      filePath: filePath,
      contentType: mimeType,
    );
    final voiceUrl = MessagesMediaService.pickDisplayUrl(upload);
    if (voiceUrl.isEmpty) {
      throw Exception('Upload voice failed');
    }
    final sent = await DirectMessagesService.sendMessage(
      peerUserId,
      content: 'Tin nhắn thoại',
      type: 'voice',
      voiceUrl: voiceUrl,
      voiceDuration: durationSeconds,
      replyTo: replyTo,
    );
    if (sent != null) {
      prependMessageToCache(peerUserId, sent);
      MessageNotificationSound.play();
    }
    return sent;
  }

  Future<DmMessage?> sendUploadedImageOrVideo({
    required String peerUserId,
    required String filePath,
    required String mimeType,
    String? replyTo,
  }) async {
    final upload = await MessagesMediaService.uploadFile(
      filePath: filePath,
      contentType: mimeType,
    );
    final url = MessagesMediaService.pickDisplayUrl(upload);
    if (url.isEmpty) throw Exception('Upload failed');
    final rt = upload['resourceType']?.toString() ?? '';
    final isVideo =
        mimeType.startsWith('video/') || rt == 'video' || rt.contains('video');
    final content = isVideo ? '🎬 [Video]: $url' : '📷 [Image]: $url';
    final sent = await DirectMessagesService.sendMessage(
      peerUserId,
      content: content,
      attachments: [url],
      replyTo: replyTo,
    );
    if (sent != null) {
      prependMessageToCache(peerUserId, sent);
      MessageNotificationSound.play();
    }
    return sent;
  }

  Future<DmMessage?> sendPollCreatedMessage({
    required String peerUserId,
    required String pollId,
  }) async {
    final text = '📊 [Poll]: $pollId';
    final sent = await DirectMessagesService.sendMessage(
      peerUserId,
      content: text,
    );
    if (sent != null) {
      prependMessageToCache(peerUserId, sent);
      MessageNotificationSound.play();
    }
    return sent;
  }

  Future<void> addReaction({required String messageId, required String emoji}) {
    return DirectMessagesService.addReaction(messageId, emoji);
  }

  Future<void> deleteDmMessage({
    required String peerUserId,
    required String messageId,
    String deleteType = 'for-me',
  }) async {
    await DirectMessagesService.deleteMessage(messageId, deleteType: deleteType);
    final list = _messagesByUser[peerUserId];
    if (list == null || list.isEmpty) return;
    if (deleteType == 'for-everyone') {
      final idx = list.indexWhere((m) => m.id == messageId);
      if (idx != -1) {
        final old = list[idx];
        list[idx] = DmMessage(
          id: old.id,
          senderId: old.senderId,
          receiverId: old.receiverId,
          content: 'Tin nhắn đã được thu hồi',
          createdAt: old.createdAt,
          type: 'text',
          read: old.read,
          voiceUrl: null,
          voiceDurationSec: null,
          giphyId: null,
          replyTo: old.replyTo,
          attachments: const <String>[],
          reactions: const <MessageReaction>[],
          isPinned: old.isPinned,
          pinnedAt: old.pinnedAt,
          senderDisplayName: old.senderDisplayName,
          senderUsername: old.senderUsername,
          senderAvatarUrl: old.senderAvatarUrl,
          receiverDisplayName: old.receiverDisplayName,
          receiverUsername: old.receiverUsername,
          receiverAvatarUrl: old.receiverAvatarUrl,
        );
      }
    } else {
      list.removeWhere((m) => m.id == messageId);
    }
    _messagesByUser[peerUserId] = list;
    notifyListeners();
  }

  void _onReactionEvent(Map<String, dynamic> payload) {
    final messageId = payload['messageId']?.toString() ?? '';
    if (messageId.isEmpty) return;
    final reactionsRaw = payload['reactions'];
    if (reactionsRaw is! List) return;
    final reactions = reactionsRaw
        .whereType<Map>()
        .map((e) => MessageReaction.fromJson(Map<String, dynamic>.from(e)))
        .toList();
    var changed = false;
    for (final entry in _messagesByUser.entries) {
      final list = entry.value;
      final idx = list.indexWhere((m) => m.id == messageId);
      if (idx == -1) continue;
      final old = list[idx];
      list[idx] = DmMessage(
        id: old.id,
        senderId: old.senderId,
        receiverId: old.receiverId,
        content: old.content,
        createdAt: old.createdAt,
        type: old.type,
        read: old.read,
        voiceUrl: old.voiceUrl,
        voiceDurationSec: old.voiceDurationSec,
        giphyId: old.giphyId,
        replyTo: old.replyTo,
        attachments: old.attachments,
        reactions: reactions,
        isPinned: old.isPinned,
        pinnedAt: old.pinnedAt,
        senderDisplayName: old.senderDisplayName,
        senderUsername: old.senderUsername,
        senderAvatarUrl: old.senderAvatarUrl,
        receiverDisplayName: old.receiverDisplayName,
        receiverUsername: old.receiverUsername,
        receiverAvatarUrl: old.receiverAvatarUrl,
      );
      changed = true;
    }
    if (changed) notifyListeners();
  }

  void _onDeletedEvent(Map<String, dynamic> payload) {
    final messageId = payload['messageId']?.toString() ?? '';
    if (messageId.isEmpty) return;
    var changed = false;
    for (final entry in _messagesByUser.entries) {
      final list = entry.value;
      final idx = list.indexWhere((m) => m.id == messageId);
      if (idx == -1) continue;
      final old = list[idx];
      list[idx] = DmMessage(
        id: old.id,
        senderId: old.senderId,
        receiverId: old.receiverId,
        content: 'Tin nhắn đã được thu hồi',
        createdAt: old.createdAt,
        type: 'text',
        read: old.read,
        voiceUrl: null,
        voiceDurationSec: null,
        giphyId: null,
        replyTo: old.replyTo,
        attachments: const <String>[],
        reactions: const <MessageReaction>[],
        isPinned: old.isPinned,
        pinnedAt: old.pinnedAt,
        senderDisplayName: old.senderDisplayName,
        senderUsername: old.senderUsername,
        senderAvatarUrl: old.senderAvatarUrl,
        receiverDisplayName: old.receiverDisplayName,
        receiverUsername: old.receiverUsername,
        receiverAvatarUrl: old.receiverAvatarUrl,
      );
      changed = true;
    }
    if (changed) notifyListeners();
  }

  void _onMessagesReadEvent(Map<String, dynamic> payload) {
    final byUserId = payload['byUserId']?.toString() ?? '';
    if (byUserId.isEmpty) return;
    final all = payload['all'] == true;
    final idsRaw = payload['messageIds'];
    final ids = idsRaw is List
        ? idsRaw.map((e) => e.toString()).where((e) => e.isNotEmpty).toSet()
        : const <String>{};
    final myId = _myUserId ?? DirectMessagesService.currentUserId;
    var changed = false;
    for (final entry in _messagesByUser.entries) {
      if (entry.key != byUserId) continue;
      final list = entry.value;
      for (var i = 0; i < list.length; i++) {
        final old = list[i];
        if (old.senderId != myId || old.read) continue;
        if (!all && !ids.contains(old.id)) continue;
        list[i] = DmMessage(
          id: old.id,
          senderId: old.senderId,
          receiverId: old.receiverId,
          content: old.content,
          createdAt: old.createdAt,
          type: old.type,
          read: true,
          voiceUrl: old.voiceUrl,
          voiceDurationSec: old.voiceDurationSec,
          giphyId: old.giphyId,
          replyTo: old.replyTo,
          attachments: old.attachments,
          reactions: old.reactions,
          isPinned: old.isPinned,
          pinnedAt: old.pinnedAt,
          senderDisplayName: old.senderDisplayName,
          senderUsername: old.senderUsername,
          senderAvatarUrl: old.senderAvatarUrl,
          receiverDisplayName: old.receiverDisplayName,
          receiverUsername: old.receiverUsername,
          receiverAvatarUrl: old.receiverAvatarUrl,
        );
        changed = true;
      }
    }
    if (changed) notifyListeners();
  }

  bool isConversationMuted(String userId) {
    if (DirectMessagesService.isConversationMuted(userId)) return true;
    if (_conversationMutedForever.contains(userId)) return true;
    final until = _conversationMutedUntil[userId];
    if (until == null) return false;
    if (DateTime.now().isAfter(until)) {
      _conversationMutedUntil.remove(userId);
      return false;
    }
    return true;
  }

  /// DM mute: "until I turn back on" (excludes timed mutes).
  bool isConversationMutedForever(String userId) {
    if (_conversationMutedForever.contains(userId)) return true;
    return DirectMessagesService.isConversationMutedForever(userId);
  }

  void setConversationMuteDuration(
    String userId, {
    Duration? duration,
    bool forever = false,
  }) {
    if (forever) {
      _conversationMutedForever.add(userId);
      _conversationMutedUntil.remove(userId);
      DirectMessagesService.setConversationMuted(userId, forever: true);
    } else if (duration == null) {
      _conversationMutedForever.remove(userId);
      _conversationMutedUntil.remove(userId);
      DirectMessagesService.setConversationMuted(userId, duration: null);
    } else {
      _conversationMutedForever.remove(userId);
      _conversationMutedUntil[userId] = DateTime.now().add(duration);
      DirectMessagesService.setConversationMuted(userId, duration: duration);
    }
    notifyListeners();
  }

  bool isUserBlocked(String userId) => _blockedUsers.contains(userId);

  Future<void> refreshBlockedUsers() async {
    try {
      final blocked = await DirectMessagesService.getBlockedUserIds();
      _blockedUsers
        ..clear()
        ..addAll(blocked);
      notifyListeners();
    } catch (_) {}
  }

  Future<void> blockUser(String userId) async {
    await DirectMessagesService.blockUser(userId);
    _blockedUsers.add(userId);
    notifyListeners();
  }

  Future<void> unblockUser(String userId) async {
    await DirectMessagesService.unblockUser(userId);
    _blockedUsers.remove(userId);
    notifyListeners();
  }

  VoiceControlState voiceStateFor(String contextKey) {
    return _voiceByContext[contextKey] ??
        VoiceControlState(
          contextKey: contextKey,
          micMuted: false,
          soundMuted: false,
        );
  }

  void toggleMic(String contextKey) {
    final current = voiceStateFor(contextKey);
    _voiceByContext[contextKey] = current.copyWith(micMuted: !current.micMuted);
    notifyListeners();
  }

  void toggleSound(String contextKey) {
    final current = voiceStateFor(contextKey);
    _voiceByContext[contextKey] = current.copyWith(
      soundMuted: !current.soundMuted,
    );
    notifyListeners();
  }

  void _onNewMessage(DmMessage message) {
    final myId = _myUserId ?? DirectMessagesService.currentUserId;
    if (myId == null || myId.isEmpty) return;
    final peerId = message.senderId == myId
        ? message.receiverId
        : message.senderId;
    if (peerId.isEmpty) return;
    if (_blockedUsers.contains(peerId)) return;

    final list = _messagesByUser[peerId] ?? <DmMessage>[];
    if (list.any((m) => m.id == message.id)) return;
    list.add(message);
    _messagesByUser[peerId] = list;
    _patchThreadLastMessage(peerId, message.content);
    // Mute affects alerts only; messages must still be received and shown.
    if (!isConversationMuted(peerId)) {
      MessageNotificationSound.play();
    }
    refreshInboxCount();
    notifyListeners();
  }

  void _onPresence(PresenceState presence) {
    final uid = presence.userId.trim();
    if (uid.isEmpty) return;
    final idx = _threads.indexWhere((e) => e.id == uid);
    if (idx == -1) return;
    final nextOnline = presence.status != PresenceStatus.offline;
    final current = _threads[idx];
    if (current.isOnline == nextOnline) return;
    _threads[idx] = MessageThread(
      id: current.id,
      name: current.name,
      lastMessage: current.lastMessage,
      lastActiveLabel: current.lastActiveLabel,
      unreadCount: current.unreadCount,
      avatarUrl: current.avatarUrl,
      isOnline: nextOnline,
      isPinned: current.isPinned,
    );
    notifyListeners();
  }

  void _patchThreadLastMessage(String userId, String lastMessage) {
    final idx = _threads.indexWhere((e) => e.id == userId);
    if (idx == -1) return;
    final current = _threads[idx];
    _threads[idx] = MessageThread(
      id: current.id,
      name: current.name,
      lastMessage: lastMessage,
      lastActiveLabel: 'now',
      unreadCount: current.unreadCount,
      avatarUrl: current.avatarUrl,
      isOnline: current.isOnline,
      isPinned: current.isPinned,
    );
  }

  String _formatRelative(DateTime? time) {
    if (time == null) return '';
    final diff = DateTime.now().difference(time);
    if (diff.inMinutes < 1) return 'now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m';
    if (diff.inHours < 24) return '${diff.inHours}h';
    return '${diff.inDays}d';
  }
}
