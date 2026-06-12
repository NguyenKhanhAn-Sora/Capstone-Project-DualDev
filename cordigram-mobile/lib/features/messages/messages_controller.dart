import 'dart:async';

import 'package:flutter/foundation.dart';

import 'models/display_name_style.dart';
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
import 'utils/dm_call_message_utils.dart';
import 'utils/dm_sidebar_prefs.dart';
import 'utils/messages_i18n.dart';
import '../../core/services/language_controller.dart';

class MessagesController extends ChangeNotifier {
  final List<MessageThread> _threads = [];
  final Map<String, List<DmMessage>> _messagesByUser = {};
  /// Peer → last activity (ms), giữ thứ tự đẩy lên đầu sau refresh (như web).
  final Map<String, int> _peerLastActivityMs = {};
  /// Hội thoại đã đánh dấu đọc — giữ badge 0 khi API chưa kịp cập nhật.
  final Set<String> _readPeers = {};
  String? _activeConversationPeerId;
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
  StreamSubscription<DmProfileStyleUpdatedEvent>? _profileStyleSub;
  StreamSubscription<Map<String, dynamic>>? _channelInboxSub;
  StreamSubscription<Map<String, dynamic>>? _inboxForYouSub;
  Timer? _inboxPollTimer;

  final Set<String> _followingUserIds = {};
  final Set<String> _conversationPeerIds = {};
  String _dmListFrom = 'everyone';
  String _dmCallFrom = 'everyone';
  DmSidebarPeersMode _dmSidebarPeersMode = DmSidebarPeersMode.all;

  bool _loadingThreads = false;
  int _totalUnread = 0;
  String? _threadsError;
  int _inboxUnreadCount = 0;
  String? _myUserId;
  String? _myDisplayName;
  String? _myUsername;
  String? _myAvatarUrl;
  DisplayNameStyle _myDisplayNameStyle = const DisplayNameStyle();
  bool _myOnline = true;
  String _languageCode = 'vi';

  List<MessageThread> get threads => List.unmodifiable(_threads);

  /// Sidebar list with web-equivalent filters (`dmListFrom`, online-only).
  List<MessageThread> get filteredThreads {
    var list = List<MessageThread>.from(_threads);
    if (_dmSidebarPeersMode == DmSidebarPeersMode.online) {
      list = list.where((t) => t.isOnline).toList();
    }
    if (_dmListFrom == 'followers_only') {
      list = list
          .where(
            (t) =>
                _followingUserIds.contains(t.id) ||
                _conversationPeerIds.contains(t.id),
          )
          .toList();
    }
    return list;
  }

  String get dmCallFrom => _dmCallFrom;

  bool canCallPeer(String peerUserId) {
    if (_dmCallFrom != 'followers_only') return true;
    return _followingUserIds.contains(peerUserId) ||
        _conversationPeerIds.contains(peerUserId);
  }
  bool get loadingThreads => _loadingThreads;
  int get totalUnread => _totalUnread;
  String? get threadsError => _threadsError;
  int get inboxUnreadCount => _inboxUnreadCount;
  String? get myUserId => _myUserId;
  String? get myDisplayName => _myDisplayName;
  String? get myUsername => _myUsername;
  String? get myAvatarUrl => _myAvatarUrl;
  DisplayNameStyle get myDisplayNameStyle => _myDisplayNameStyle;
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
      (payload) {
        MessageNotificationSound.play();
        refreshInboxCount();
      },
    );
    _inboxForYouSub = ChannelMessagesRealtimeService.inboxForYouItems.listen(
      (_) {
        MessageNotificationSound.play();
        refreshInboxCount();
      },
    );
    _newMessageSub = DirectMessagesRealtimeService.newMessages.listen(
      _onNewMessage,
    );
    _unreadSub = DirectMessagesRealtimeService.unreadCounts.listen(
      _onUnreadCount,
    );
    _presenceSub = DirectMessagesRealtimeService.presences.listen(_onPresence);
    _reactionSub = DirectMessagesRealtimeService.reactions.listen(_onReactionEvent);
    _deletedSub = DirectMessagesRealtimeService.messageDeleted.listen(
      _onDeletedEvent,
    );
    _messagesReadSub = DirectMessagesRealtimeService.messagesRead.listen(
      _onMessagesReadEvent,
    );
    _profileStyleSub =
        DirectMessagesRealtimeService.profileStyleUpdated.listen(
      _onProfileStyleUpdated,
    );
    _startInboxPolling();
    _languageCode = LanguageController.instance.language;
    LanguageController.instance.addListener(_onLanguageChanged);
    await DirectMessagesService.hydrateConversationMutes();
    await refreshInboxCount();
    await refreshMyIdentity();
    await refreshBlockedUsers();
    await refreshChatSettings();
    await refreshThreads();
  }

  void _onLanguageChanged() {
    final next = LanguageController.instance.language;
    if (_languageCode == next) return;
    _languageCode = next;
    _relocalizeThreads();
    notifyListeners();
  }

  void _relocalizeThreads() {
    if (_threads.isEmpty) return;
    for (var i = 0; i < _threads.length; i++) {
      final t = _threads[i];
      final msgs = _messagesByUser[t.id];
      final lastMsg = msgs != null && msgs.isNotEmpty ? msgs.last : null;
      final preview = lastMsg != null
          ? DmCallMessageUtils.threadPreviewForMessage(
              lastMsg,
              viewerId: _myUserId,
            )
          : MessagesI18n.localizeSidebarPreview(t.lastMessage);
      final activityMs = _peerLastActivityMs[t.id];
      final activityAt = activityMs != null
          ? DateTime.fromMillisecondsSinceEpoch(activityMs)
          : (lastMsg?.createdAt ?? t.lastSeenAt);
      _threads[i] = MessageThread(
        id: t.id,
        name: t.name,
        lastMessage: preview,
        lastActiveLabel: MessagesI18n.formatThreadTimeShort(activityAt),
        unreadCount: t.unreadCount,
        avatarUrl: t.avatarUrl,
        isOnline: t.isOnline,
        isPinned: t.isPinned,
        lastSeenAt: t.lastSeenAt,
        presenceLabel: MessagesI18n.presenceLabel(
          isOnline: t.isOnline,
          lastSeenAt: t.lastSeenAt,
        ),
      );
    }
  }

  Future<void> refreshChatSettings() async {
    try {
      final settings = await DirectMessagesService.getUserSettings();
      _dmListFrom = (settings['dmListFrom'] ?? 'everyone').toString();
      _dmCallFrom = (settings['dmCallFrom'] ?? 'everyone').toString();
      _myOnline = settings['sharePresence'] != false;
      _dmSidebarPeersMode = await DmSidebarPrefs.getPeersMode();
      final following = await DirectMessagesService.getFollowingAsConversations();
      _followingUserIds
        ..clear()
        ..addAll(following.map((c) => c.userId));
      notifyListeners();
    } catch (_) {}
  }

  void markIncomingMessagesRead({
    required String peerUserId,
    required List<String> messageIds,
  }) {
    if (messageIds.isEmpty) return;
    DirectMessagesRealtimeService.markMessageIdsAsRead(
      messageIds: messageIds,
      senderId: peerUserId,
    );
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
      _myDisplayNameStyle = DisplayNameStyle.fromProfile(data);
      notifyListeners();
    } catch (_) {}
  }

  Future<void> disposeController() async {
    LanguageController.instance.removeListener(_onLanguageChanged);
    await _newMessageSub?.cancel();
    await _unreadSub?.cancel();
    await _presenceSub?.cancel();
    await _reactionSub?.cancel();
    await _deletedSub?.cancel();
    await _messagesReadSub?.cancel();
    await _profileStyleSub?.cancel();
    await _channelInboxSub?.cancel();
    await _inboxForYouSub?.cancel();
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
      _conversationPeerIds
        ..clear()
        ..addAll(
          (await DirectMessagesService.getConversations()).map((c) => c.userId),
        );
      if (conversations.isEmpty) {
        conversations =
            await DirectMessagesService.getFollowingAsConversations();
      }
      final following = await DirectMessagesService.getFollowingAsConversations();
      _followingUserIds
        ..clear()
        ..addAll(following.map((c) => c.userId));
      for (final c in conversations) {
        final peerId = c.userId;
        if (c.lastMessageAt != null) {
          final ms = c.lastMessageAt!.millisecondsSinceEpoch;
          final prev = _peerLastActivityMs[peerId] ?? 0;
          if (ms > prev) _peerLastActivityMs[peerId] = ms;
        }
      }
      _threads
        ..clear()
        ..addAll(
          conversations.map(
            (c) => MessageThread(
              id: c.userId,
              name: c.title,
              lastMessage: MessagesI18n.previewForConversation(
                c,
                viewerId: _myUserId,
              ),
              lastActiveLabel: MessagesI18n.formatThreadTimeShort(c.lastMessageAt),
              unreadCount: _displayUnreadForPeer(c.userId, c.unreadCount),
              avatarUrl: c.avatarUrl,
              isOnline: c.isOnline,
              lastSeenAt: c.lastActiveAt,
              presenceLabel: MessagesI18n.presenceLabel(
                isOnline: c.isOnline,
                lastSeenAt: c.lastActiveAt,
              ),
            ),
          ),
        );
      _sortThreads();
      DirectMessagesRealtimeService.subscribePresence(
        _threads.map((e) => e.id).where((e) => e.isNotEmpty).toList(),
      );
      _recalcTotalUnread();
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
    _patchThreadLastMessage(
      peerUserId,
      DmCallMessageUtils.threadPreviewForMessage(
        message,
        viewerId: _myUserId,
        languageCode: _languageCode,
      ),
      activityAt: message.createdAt,
    );
    notifyListeners();
  }

  void setActiveConversationPeer(String? peerId) {
    final id = peerId?.trim();
    _activeConversationPeerId =
        (id == null || id.isEmpty) ? null : id;
    if (_activeConversationPeerId != null) {
      _readPeers.add(_activeConversationPeerId!);
      final idx = _threads.indexWhere(
        (e) => e.id == _activeConversationPeerId,
      );
      if (idx != -1) {
        final t = _threads[idx];
        _threads[idx] = MessageThread(
          id: t.id,
          name: t.name,
          lastMessage: t.lastMessage,
          lastActiveLabel: t.lastActiveLabel,
          unreadCount: 0,
          avatarUrl: t.avatarUrl,
          isOnline: t.isOnline,
          isPinned: t.isPinned,
          lastSeenAt: t.lastSeenAt,
          presenceLabel: t.presenceLabel,
        );
      }
      notifyListeners();
    }
  }

  Future<void> markConversationRead(String userId) async {
    final peerId = userId.trim();
    _readPeers.add(peerId);
    await DirectMessagesService.markConversationRead(peerId);
    DirectMessagesRealtimeService.markAsRead(userId: peerId);
    final idx = _threads.indexWhere((e) => e.id == peerId);
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
        lastSeenAt: _threads[idx].lastSeenAt,
        presenceLabel: _threads[idx].presenceLabel,
      );
      _recalcTotalUnread();
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
    if (deleteType == 'for-everyone') {
      DirectMessagesRealtimeService.emitDeleteMessage(
        messageId: messageId,
        receiverId: peerUserId,
        deleteType: deleteType,
      );
    }
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

  void _onProfileStyleUpdated(DmProfileStyleUpdatedEvent event) {
    final myId = _myUserId ?? DirectMessagesService.currentUserId;
    if (myId != null && event.userId == myId) {
      if (event.displayName != null) {
        _myDisplayName = event.displayName!.trim();
      }
      if (event.username != null) {
        _myUsername = event.username!.trim();
      }
      if (event.avatarUrl != null) {
        _myAvatarUrl = event.avatarUrl;
      }
      _myDisplayNameStyle = _myDisplayNameStyle.copyWith(
        fontId: event.displayNameFontId,
        effectId: event.displayNameEffectId,
        primaryHex: event.displayNamePrimaryHex,
        accentHex: event.displayNameAccentHex,
      );
    }

    final idx = _threads.indexWhere((t) => t.id == event.userId);
    if (idx != -1) {
      final t = _threads[idx];
      final name = (event.displayName ?? '').trim();
      _threads[idx] = MessageThread(
        id: t.id,
        name: name.isNotEmpty ? name : t.name,
        lastMessage: t.lastMessage,
        lastActiveLabel: t.lastActiveLabel,
        unreadCount: t.unreadCount,
        avatarUrl: event.avatarUrl ?? t.avatarUrl,
        isOnline: t.isOnline,
        isPinned: t.isPinned,
        lastSeenAt: t.lastSeenAt,
        presenceLabel: t.presenceLabel,
      );
    }
    for (final entry in _messagesByUser.entries) {
      final list = entry.value;
      for (var i = 0; i < list.length; i++) {
        final old = list[i];
        if (old.senderId != event.userId && old.receiverId != event.userId) {
          continue;
        }
        list[i] = DmMessage(
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
          reactions: old.reactions,
          isPinned: old.isPinned,
          pinnedAt: old.pinnedAt,
          senderDisplayName: old.senderId == event.userId
              ? (event.displayName ?? old.senderDisplayName)
              : old.senderDisplayName,
          senderUsername: old.senderId == event.userId
              ? (event.username ?? old.senderUsername)
              : old.senderUsername,
          senderAvatarUrl: old.senderId == event.userId
              ? (event.avatarUrl ?? old.senderAvatarUrl)
              : old.senderAvatarUrl,
          receiverDisplayName: old.receiverId == event.userId
              ? (event.displayName ?? old.receiverDisplayName)
              : old.receiverDisplayName,
          receiverUsername: old.receiverId == event.userId
              ? (event.username ?? old.receiverUsername)
              : old.receiverUsername,
          receiverAvatarUrl: old.receiverId == event.userId
              ? (event.avatarUrl ?? old.receiverAvatarUrl)
              : old.receiverAvatarUrl,
        );
      }
    }
    notifyListeners();
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

  int _displayUnreadForPeer(String peerId, int raw) {
    if (isConversationMuted(peerId)) return 0;
    if (_readPeers.contains(peerId) || _activeConversationPeerId == peerId) {
      return 0;
    }
    return raw.clamp(0, 999999);
  }

  void _recalcTotalUnread() {
    _totalUnread = _threads.fold<int>(0, (sum, e) => sum + e.unreadCount);
  }

  void _applyMuteToThreadUnread(String userId) {
    final idx = _threads.indexWhere((e) => e.id == userId);
    if (idx == -1) return;
    final t = _threads[idx];
    if (t.unreadCount == 0) return;
    _threads[idx] = MessageThread(
      id: t.id,
      name: t.name,
      lastMessage: t.lastMessage,
      lastActiveLabel: t.lastActiveLabel,
      unreadCount: 0,
      avatarUrl: t.avatarUrl,
      isOnline: t.isOnline,
      isPinned: t.isPinned,
      lastSeenAt: t.lastSeenAt,
      presenceLabel: t.presenceLabel,
    );
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
    if (isConversationMuted(userId)) {
      _applyMuteToThreadUnread(userId);
      _recalcTotalUnread();
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
    _bumpThreadToTop(
      peerId,
      lastMessage: DmCallMessageUtils.threadPreviewForMessage(
        message,
        viewerId: myId,
        languageCode: _languageCode,
      ),
      activityAt: message.createdAt,
    );
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
    final lastSeen =
        presence.lastActiveAt ?? current.lastSeenAt;
    final nextLabel = MessagesI18n.presenceLabel(
      isOnline: nextOnline,
      status: presence.status,
      lastSeenAt: lastSeen,
    );
    if (current.isOnline == nextOnline &&
        current.presenceLabel == nextLabel &&
        current.lastSeenAt == lastSeen) {
      return;
    }
    _threads[idx] = MessageThread(
      id: current.id,
      name: current.name,
      lastMessage: current.lastMessage,
      lastActiveLabel: current.lastActiveLabel,
      unreadCount: current.unreadCount,
      avatarUrl: current.avatarUrl,
      isOnline: nextOnline,
      isPinned: current.isPinned,
      lastSeenAt: lastSeen,
      presenceLabel: nextLabel,
    );
    notifyListeners();
  }

  void _patchThreadLastMessage(
    String userId,
    String lastMessage, {
    DateTime? activityAt,
  }) {
    _bumpThreadToTop(
      userId,
      lastMessage: lastMessage,
      activityAt: activityAt,
    );
  }

  void _onUnreadCount(DmUnreadCountEvent event) {
    final peerId = event.fromUserId?.trim();
    final convUnread = event.conversationUnread;
    if (peerId != null &&
        peerId.isNotEmpty &&
        convUnread != null) {
      if (convUnread <= 0) {
        _readPeers.add(peerId);
      } else if (!isConversationMuted(peerId)) {
        _readPeers.remove(peerId);
      }
      final displayUnread = _displayUnreadForPeer(peerId, convUnread);
      final idx = _threads.indexWhere((e) => e.id == peerId);
      if (idx != -1) {
        final t = _threads[idx];
        _threads[idx] = MessageThread(
          id: t.id,
          name: t.name,
          lastMessage: t.lastMessage,
          lastActiveLabel: t.lastActiveLabel,
          unreadCount: displayUnread,
          avatarUrl: t.avatarUrl,
          isOnline: t.isOnline,
          isPinned: t.isPinned,
          lastSeenAt: t.lastSeenAt,
          presenceLabel: t.presenceLabel,
        );
      }
    }
    _recalcTotalUnread();
    notifyListeners();
  }

  void _sortThreads() {
    _threads.sort((a, b) {
      if (a.isPinned != b.isPinned) {
        return a.isPinned ? -1 : 1;
      }
      final ta = _peerLastActivityMs[a.id] ?? 0;
      final tb = _peerLastActivityMs[b.id] ?? 0;
      if (tb != ta) return tb.compareTo(ta);
      return a.name.toLowerCase().compareTo(b.name.toLowerCase());
    });
  }

  /// Đẩy hội thoại lên đầu danh sách DM (sort theo hoạt động mới nhất).
  void _bumpThreadToTop(
    String userId, {
    required String lastMessage,
    DateTime? activityAt,
  }) {
    final at = activityAt ?? DateTime.now();
    final ms = at.millisecondsSinceEpoch;
    final prev = _peerLastActivityMs[userId] ?? 0;
    if (ms >= prev) _peerLastActivityMs[userId] = ms;

    final idx = _threads.indexWhere((e) => e.id == userId);
    if (idx == -1) {
      unawaited(refreshThreads());
      return;
    }
    final current = _threads[idx];
    _threads[idx] = MessageThread(
      id: current.id,
      name: current.name,
      lastMessage: lastMessage,
      lastActiveLabel: MessagesI18n.formatThreadTimeShort(at),
      unreadCount: current.unreadCount,
      avatarUrl: current.avatarUrl,
      isOnline: current.isOnline,
      isPinned: current.isPinned,
      lastSeenAt: current.lastSeenAt,
      presenceLabel: current.presenceLabel,
    );
    _sortThreads();
  }

}
