import 'dart:async';

import 'package:audioplayers/audioplayers.dart';
import 'package:emoji_picker_flutter/emoji_picker_flutter.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path_provider/path_provider.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:record/record.dart';

import '../../../core/config/app_config.dart';
import 'models/channel_message.dart';
import 'models/message_reaction.dart';
import 'models/server_models.dart';
import 'pinned_messages_screen.dart';
import 'services/channel_messages_realtime_service.dart';
import 'services/channel_messages_service.dart';
import 'services/giphy_search_service.dart';
import 'services/messages_media_service.dart';
import 'services/polls_api_service.dart';
import 'services/server_media_service.dart';
import 'services/servers_service.dart';
import 'search/message_search_sheet.dart';
import 'widgets/channel_chat_gate_sheet.dart';
import 'widgets/chat_link_preview.dart';
import 'widgets/gif_toolbar_icon.dart';
import 'widgets/sticker_toolbar_icon.dart';
import 'widgets/channel_chat_expressions_host.dart';
import 'widgets/chat_expressions_menu.dart';
import 'widgets/chat_message_media_bubble.dart';
import 'widgets/chat_media_viewer.dart';
import 'widgets/messages_chrome_builder.dart';
import 'utils/chat_media_resolver.dart';
import '../../core/services/accent_color_controller.dart';
import '../../core/services/language_controller.dart';
import '../../core/theme/messages_chrome_palette.dart';

class ChannelChatScreen extends StatefulWidget {
  const ChannelChatScreen({
    super.key,
    required this.server,
    required this.channel,
    required this.currentUserId,
    this.participantName,
  });

  final ServerSummary server;
  final ServerChannel channel;
  final String? currentUserId;
  final String? participantName;

  @override
  State<ChannelChatScreen> createState() => _ChannelChatScreenState();
}

class _ChannelChatScreenState extends State<ChannelChatScreen> {
  MessagesChromePalette get _chrome => AccentColorController.instance.palette;

  String _t(String key, [Map<String, dynamic>? vars]) =>
      LanguageController.instance.tForServer(
        widget.server.primaryLanguage,
        key,
        vars,
      );

  static final RegExp _pollRegExp = RegExp(r'📊 \[Poll\]:\s*([a-fA-F0-9]{24})');
  static final RegExp _serverEmojiTokenRegExp = RegExp(
    r':([a-zA-Z0-9_]{1,80}):',
  );
  final TextEditingController _inputController = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  final Map<String, String> _serverEmojiMap = {};
  final Map<String, GlobalKey> _channelMessageKeys = {};
  String? _highlightChannelMessageId;

  GlobalKey _keyForChannelMessage(String id) =>
      _channelMessageKeys.putIfAbsent(id, () => GlobalKey());

  Future<void> _scrollToChannelMessageId(String messageId) async {
    if (!mounted) return;
    setState(() => _highlightChannelMessageId = messageId);
    await Future<void>.delayed(const Duration(milliseconds: 80));
    if (!mounted) return;
    final ctx = _channelMessageKeys[messageId]?.currentContext;
    if (ctx != null) {
      await Scrollable.ensureVisible(
        ctx,
        duration: const Duration(milliseconds: 320),
        curve: Curves.easeOutCubic,
        alignment: 0.25,
      );
    } else if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(_t('messages.messageNotInSegment')),
          behavior: SnackBarBehavior.floating,
        ),
      );
    }
    await Future<void>.delayed(const Duration(seconds: 2));
    if (mounted && _highlightChannelMessageId == messageId) {
      setState(() => _highlightChannelMessageId = null);
    }
  }

  Future<void> _openChannelMessageSearch() async {
    await MessageSearchSheet.present(
      context,
      child: MessageSearchSheet.serverChannel(
        serverId: widget.server.id,
        serverName: widget.server.name,
        channelId: widget.channel.id,
        channelName: widget.channel.name,
        onPickMessage: (messageId, _) {
          _scrollToChannelMessageId(messageId);
        },
      ),
    );
  }

  List<ChannelMessage> _messages = const [];
  bool _loading = true;
  bool _sending = false;
  bool _chatBlocked = false;
  String? _chatBlockReason;
  String? _error;
  final Map<String, String> _nickByUserId = {};
  int _bootstrapGeneration = 0;
  final Set<String> _wavingWelcomeIds = {};
  ChannelMessage? _replyingTo;
  StreamSubscription<ChannelMessage>? _newMessageSub;
  StreamSubscription<ChannelMessage>? _messageUpdatedSub;
  StreamSubscription<Map<String, dynamic>>? _reactionSub;
  StreamSubscription<Map<String, dynamic>>? _deletedSub;
  StreamSubscription<Map<String, dynamic>>? _interactionSettingsSub;

  @override
  void initState() {
    super.initState();
    unawaited(MessagesMediaService.refreshBoostStatus());
    _bootstrap();
  }

  @override
  void dispose() {
    _newMessageSub?.cancel();
    _messageUpdatedSub?.cancel();
    _reactionSub?.cancel();
    _deletedSub?.cancel();
    _interactionSettingsSub?.cancel();
    ChannelMessagesRealtimeService.leaveChannel(widget.channel.id);
    _inputController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _bootstrap() async {
    final generation = ++_bootstrapGeneration;
    setState(() {
      _loading = true;
      _error = null;
      _messages = const [];
    });
    try {
      await ChannelMessagesRealtimeService.connect();
      ChannelMessagesRealtimeService.joinChannel(widget.channel.id);
      _newMessageSub?.cancel();
      _messageUpdatedSub?.cancel();
      _reactionSub?.cancel();
      _deletedSub?.cancel();
      _interactionSettingsSub?.cancel();
      _newMessageSub = ChannelMessagesRealtimeService.messages.listen((
        incoming,
      ) {
        if (!mounted || incoming.channelId != widget.channel.id) return;
        _insertChannelMessage(incoming);
      });
      _messageUpdatedSub =
          ChannelMessagesRealtimeService.messageUpdates.listen((updated) {
        if (!mounted || updated.channelId != widget.channel.id) return;
        final idx = _messages.indexWhere((m) => m.id == updated.id);
        if (idx == -1) return;
        setState(() {
          final copied = [..._messages];
          copied[idx] = updated;
          _messages = copied;
        });
      });
      _reactionSub = ChannelMessagesRealtimeService.reactions.listen((payload) {
        if (!mounted) return;
        final messageId = (payload['messageId'] ?? '').toString();
        if (messageId.isEmpty) return;
        final incomingRaw = payload['reactions'];
        if (incomingRaw is! List) return;
        final incomingReactions = incomingRaw
            .map((e) {
              if (e is MessageReaction) return e;
              if (e is Map) {
                return MessageReaction.fromJson(Map<String, dynamic>.from(e));
              }
              return null;
            })
            .whereType<MessageReaction>()
            .toList();
        final idx = _messages.indexWhere((m) => m.id == messageId);
        if (idx == -1) return;
        final curr = _messages[idx];
        final next = curr.copyWith(reactions: incomingReactions);
        final copied = [..._messages];
        copied[idx] = next;
        setState(() => _messages = copied);
      });
      _deletedSub = ChannelMessagesRealtimeService.deleted.listen((payload) {
        if (!mounted) return;
        _applyMessageDeleted(payload);
      });
      _interactionSettingsSub =
          ChannelMessagesRealtimeService.serverRealtime.listen((payload) {
        if (!mounted) return;
        if ((payload['event'] ?? '').toString() !=
            'interaction-settings-updated') {
          return;
        }
        if ((payload['serverId'] ?? '').toString() != widget.server.id) {
          return;
        }
        final enabled = payload['stickerReplyWelcomeEnabled'] != false;
        setState(() {
          _messages = _messages
              .map(
                (m) => m.type == 'welcome'
                    ? m.copyWith(stickerReplyWelcomeEnabled: enabled)
                    : m,
              )
              .toList();
        });
      });

      final envelope = await ChannelMessagesService.getChannelMessagesEnvelope(
        widget.channel.id,
        limit: 60,
        skip: 0,
      );
      if (!mounted || generation != _bootstrapGeneration) return;
      await _loadMemberNicknames();
      if (!mounted || generation != _bootstrapGeneration) return;
      final entries =
          (envelope['messages'] ?? envelope['items'] ?? envelope['data'])
              as List?;
      final loaded = _sortChannelMessagesAsc(
        (entries ?? const <dynamic>[])
            .whereType<Map>()
            .map((e) => ChannelMessage.fromJson(Map<String, dynamic>.from(e)))
            .toList(),
      );
      await ChannelMessagesService.markChannelRead(widget.channel.id);
      if (!mounted || generation != _bootstrapGeneration) return;
      setState(() {
        _messages = loaded;
        _chatBlocked = envelope['chatViewBlocked'] == true;
        _chatBlockReason = envelope['chatBlockReason']?.toString();
      });
      _scrollToBottom();
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  List<ChannelMessage> _sortChannelMessagesAsc(List<ChannelMessage> items) {
    final next = [...items];
    next.sort((a, b) => a.createdAt.compareTo(b.createdAt));
    return next;
  }

  void _insertChannelMessage(ChannelMessage incoming) {
    if (_messages.any((m) => m.id == incoming.id)) return;

    final me = (widget.currentUserId ?? '').trim();
    if (me.isNotEmpty && incoming.senderId == me) {
      final tempIdx = _messages.indexWhere(
        (m) =>
            m.id.startsWith('temp-') &&
            m.content.trim() == incoming.content.trim(),
      );
      if (tempIdx != -1) {
        setState(() {
          final copied = [..._messages];
          copied[tempIdx] = incoming;
          _messages = _sortChannelMessagesAsc(copied);
        });
        _scrollToBottom();
      }
      return;
    }

    setState(() {
      _messages = _sortChannelMessagesAsc([..._messages, incoming]);
    });
    _scrollToBottom();
  }

  Future<void> _loadMemberNicknames() async {
    try {
      final map = <String, String>{};
      final server = await ServersService.getServerById(widget.server.id);
      final members = server['members'];
      if (members is List) {
        for (final raw in members) {
          if (raw is! Map) continue;
          final uid = (raw['userId'] ?? raw['_id'] ?? '').toString();
          final nick = (raw['nickname'] ?? '').toString().trim();
          if (uid.isNotEmpty && nick.isNotEmpty) map[uid] = nick;
        }
      }
      if (map.isEmpty) {
        final withRoles = await ServersService.getServerMembersWithRoles(
          widget.server.id,
        );
        for (final m in withRoles.members) {
          final nick = (m.nickname ?? '').trim();
          if (m.userId.isNotEmpty && nick.isNotEmpty) {
            map[m.userId] = nick;
          }
        }
      }
      if (!mounted) return;
      setState(() => _nickByUserId
        ..clear()
        ..addAll(map));
    } catch (_) {}
  }

  String _displayNameFor(ChannelMessage msg) {
    final nick = _nickByUserId[msg.senderId]?.trim();
    if (nick != null && nick.isNotEmpty) return nick;
    final name = msg.senderName.trim();
    return name.isEmpty ? 'Thành viên' : name;
  }

  String _displayNameForSenderId(String senderId, {String? fallback}) {
    final nick = _nickByUserId[senderId]?.trim();
    if (nick != null && nick.isNotEmpty) return nick;
    final name = (fallback ?? '').trim();
    return name.isEmpty ? 'Thành viên' : name;
  }

  void _applyMessageDeleted(Map<String, dynamic> payload) {
    final channelId = (payload['channelId'] ?? '').toString();
    if (channelId.isNotEmpty && channelId != widget.channel.id) return;
    final messageId = (payload['messageId'] ?? '').toString();
    if (messageId.isEmpty) return;
    final deleteType = (payload['deleteType'] ?? '').toString();
    if (deleteType == 'for-everyone') {
      setState(() {
        final idx = _messages.indexWhere((m) => m.id == messageId);
        if (idx == -1) return;
        final curr = _messages[idx];
        if (curr.isDeletedForEveryone) return;
        final copied = [..._messages];
        copied[idx] = curr.copyWith(
          isDeletedForEveryone: true,
          content: '',
          attachments: const [],
          giphyId: null,
          customStickerUrl: null,
          voiceUrl: null,
          reactions: const [],
          deletedAt: DateTime.tryParse(
                (payload['deletedAt'] ?? '').toString(),
              )?.toLocal() ??
              DateTime.now(),
        );
        _messages = copied;
      });
      return;
    }
    setState(() {
      _messages = _messages.where((m) => m.id != messageId).toList();
    });
  }

  String _formatWelcomeTimestamp(DateTime at) {
    final now = DateTime.now();
    final diff = now.difference(at);
    if (diff.inSeconds < 45) return _t('messages.justNow');
    if (diff.inMinutes < 60) return _t('messages.minutesAgo', {'n': diff.inMinutes.toString()});
    if (diff.inHours < 24) return _t('messages.hoursAgo', {'n': diff.inHours.toString()});
    return '${at.day}/${at.month}/${at.year}';
  }

  String _blockedReasonLabel(String? reason) {
    switch (reason) {
      case 'rules':
        return _t('messages.blockedReasonRules');
      case 'application_pending':
        return _t('messages.blockedReasonApplicationPending');
      case 'application_rejected':
        return _t('messages.blockedReasonApplicationRejected');
      case 'verification':
        return _t('messages.blockedReasonVerification');
      case 'age_under_18':
        return _t('messages.blockedReasonAgeUnder18');
      case 'age_ack':
        return _t('messages.blockedReasonAgeAck');
      default:
        return '';
    }
  }

  Future<void> _reloadEnvelopeOnly() async {
    try {
      final envelope = await ChannelMessagesService.getChannelMessagesEnvelope(
        widget.channel.id,
        limit: 60,
        skip: 0,
      );
      final entries =
          (envelope['messages'] ?? envelope['items'] ?? envelope['data'])
              as List?;
      final loaded = (entries ?? const <dynamic>[])
          .whereType<Map>()
          .map((e) => ChannelMessage.fromJson(Map<String, dynamic>.from(e)))
          .toList();
      if (!mounted) return;
      setState(() {
        _messages = _sortChannelMessagesAsc(loaded);
        _chatBlocked = envelope['chatViewBlocked'] == true;
        _chatBlockReason = envelope['chatBlockReason']?.toString();
      });
      _scrollToBottom();
    } catch (_) {}
  }

  bool _canCompleteGateStepsInChannel() {
    final r = _chatBlockReason;
    return r == 'rules' || r == 'verification' || r == 'age_ack';
  }

  Future<void> _openChannelGateSheet() async {
    await showChannelChatGateSheet(
      context,
      serverId: widget.server.id,
      serverName: widget.server.name,
      serverAvatarUrl: widget.server.avatarUrl,
      onGateUpdated: () {
        unawaited(_reloadEnvelopeOnly());
      },
    );
  }

  Future<void> _sendWaveToWelcome(ChannelMessage welcomeMsg) async {
    if (_chatBlocked) return;
    if (!welcomeMsg.stickerReplyWelcomeEnabled ||
        welcomeMsg.welcomeWaveDismissedByMe) {
      return;
    }
    final me = widget.currentUserId ?? '';
    final isNewMember = me.isNotEmpty && welcomeMsg.senderId == me;
    setState(() => _wavingWelcomeIds.add(welcomeMsg.id));
    try {
      final sticker = await GiphySearchService.getRandomWaveSticker();
      final sent = await ChannelMessagesService.sendWaveSticker(
        widget.channel.id,
        replyTo: isNewMember ? null : welcomeMsg.id,
        giphyId: sticker?.id,
      );
      if (sent != null && mounted) {
        setState(() {
          var next = _messages;
          if (!next.any((m) => m.id == sent.id)) {
            next = [...next, sent];
          }
          if (!isNewMember) {
            next = next
                .map(
                  (m) => m.id == welcomeMsg.id
                      ? m.copyWith(welcomeWaveDismissedByMe: true)
                      : m,
                )
                .toList();
          }
          _messages = _sortChannelMessagesAsc(next);
        });
        _scrollToBottom();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(_t('messages.failedSend', {'error': e.toString()}))),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _wavingWelcomeIds.remove(welcomeMsg.id));
      }
    }
  }

  String _chatBlockedBannerText() {
    if (_canCompleteGateStepsInChannel()) {
      return _t('messages.blockedBannerGate');
    }
    final hint = _blockedReasonLabel(_chatBlockReason);
    if (hint.isNotEmpty) return hint;
    final r = _chatBlockReason;
    if (r != null && r.isNotEmpty) {
      return _t('messages.blockedBannerReason', {'reason': r});
    }
    return _t('messages.blockedBanner');
  }

  Widget _buildWelcomeSystemRow(ChannelMessage msg) {
    final displayName = _displayNameFor(msg);
    final waving = _wavingWelcomeIds.contains(msg.id);
    final showWave =
        msg.stickerReplyWelcomeEnabled && !msg.welcomeWaveDismissedByMe;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Align(
        alignment: Alignment.centerLeft,
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              '→',
              style: TextStyle(
                color: Color(0xFF3BA55D),
                fontSize: 20,
                height: 1.2,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  RichText(
                    text: TextSpan(
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 14,
                        height: 1.35,
                      ),
                      children: [
                        TextSpan(text: _t('messages.welcomeGreeting', {'name': displayName})),
                        TextSpan(
                          text: '  ${_formatWelcomeTimestamp(msg.createdAt)}',
                          style: const TextStyle(
                            color: Color(0xFF949BA4),
                            fontSize: 12,
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (showWave) ...[
                    const SizedBox(height: 8),
                    Material(
                      color: const Color(0xFF2B2D31),
                      borderRadius: BorderRadius.circular(8),
                      child: InkWell(
                        onTap: waving ? null : () => _sendWaveToWelcome(msg),
                        borderRadius: BorderRadius.circular(8),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 8,
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              if (waving) ...[
                                const SizedBox(
                                  width: 14,
                                  height: 14,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    color: Color(0xFF949BA4),
                                  ),
                                ),
                                const SizedBox(width: 8),
                              ],
                              Text(
                                waving
                                    ? _t('messages.waveSending')
                                    : _t('messages.waveButton', {'name': displayName}),
                                style: TextStyle(
                                  color: waving
                                      ? const Color(0xFF949BA4)
                                      : Colors.white,
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_scrollController.hasClients) return;
      _scrollController.animateTo(
        _scrollController.position.maxScrollExtent + 80,
        duration: const Duration(milliseconds: 220),
        curve: Curves.easeOut,
      );
    });
  }

  Future<void> _sendText() async {
    final text = _inputController.text.trim();
    if (text.isEmpty) return;
    await _sendChannelMessage(content: text, replyTo: _replyingTo?.id);
    if (mounted) _inputController.clear();
  }

  Future<void> _sendChannelMessage({
    required String content,
    String type = 'text',
    String? giphyId,
    String? customStickerUrl,
    String? serverStickerId,
    String? serverStickerServerId,
    String? voiceUrl,
    int? voiceDuration,
    List<String>? attachments,
    String? replyTo,
  }) async {
    if (content.trim().isEmpty || _sending || _chatBlocked) return;

    final trimmed = content.trim();
    final tempId = 'temp-${DateTime.now().millisecondsSinceEpoch}';
    final optimistic = ChannelMessage(
      id: tempId,
      channelId: widget.channel.id,
      senderId: widget.currentUserId ?? '',
      senderName: widget.participantName ?? 'Bạn',
      content: trimmed,
      createdAt: DateTime.now(),
      type: type,
      giphyId: giphyId,
      customStickerUrl: customStickerUrl,
      voiceUrl: voiceUrl,
      voiceDurationSec: voiceDuration,
      attachments: attachments ?? const [],
    );

    setState(() {
      _sending = true;
      _messages = _sortChannelMessagesAsc([..._messages, optimistic]);
    });
    _scrollToBottom();

    try {
      final sent = await ChannelMessagesService.sendChannelMessage(
        widget.channel.id,
        trimmed,
        type: type,
        giphyId: giphyId,
        customStickerUrl: customStickerUrl,
        serverStickerId: serverStickerId,
        serverStickerServerId: serverStickerServerId,
        voiceUrl: voiceUrl,
        voiceDuration: voiceDuration,
        attachments: attachments,
        replyTo: replyTo ?? _replyingTo?.id,
      );
      if (sent != null && mounted) {
        setState(() {
          final withoutTemp =
              _messages.where((m) => m.id != tempId).toList(growable: true);
          if (!withoutTemp.any((m) => m.id == sent.id)) {
            withoutTemp.add(sent);
          }
          _messages = _sortChannelMessagesAsc(withoutTemp);
          _replyingTo = null;
        });
        _scrollToBottom();
      }
      await ChannelMessagesService.markChannelRead(widget.channel.id);
    } catch (e) {
      if (mounted) {
        setState(() {
          _messages = _messages.where((m) => m.id != tempId).toList();
        });
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(_t('messages.failedSend', {'error': e.toString()}))));
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _sendContentMessage(String content) async {
    if (_chatBlocked) return;
    await _sendChannelMessage(content: content);
  }

  Future<void> _sendVoiceMessage(String url, int durationSec) async {
    if (_sending || _chatBlocked) return;
    setState(() => _sending = true);
    try {
      await _sendChannelMessage(
        content: _t('messages.voiceMessage'),
        type: 'voice',
        voiceUrl: url,
        voiceDuration: durationSec,
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(_t('messages.failedSendVoice', {'error': e.toString()}))),
      );
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _pickAndUploadMedia() async {
    if (_chatBlocked) return;
    await MessagesMediaService.refreshBoostStatus();
    final picked = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: const [
        'jpg',
        'jpeg',
        'png',
        'gif',
        'webp',
        'heic',
        'heif',
        'mp4',
        'mov',
        'm4v',
        'webm',
        'mp3',
        'm4a',
        'aac',
        'wav',
        'ogg',
      ],
      allowMultiple: true,
      withReadStream: false,
    );
    if (picked == null || picked.files.isEmpty) return;
    for (final file in picked.files) {
      final path = file.path;
      if (path == null || path.isEmpty) continue;
      if (!MessagesMediaService.isAllowedMessagingMediaPath(path)) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(MessagesMediaService.formatMediaTypeNotAllowedError()),
          ),
        );
        return;
      }
      final len = file.size;
      if (len > MessagesMediaService.maxUploadBytes) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(MessagesMediaService.formatUploadLimitError())),
        );
        return;
      }
    }
    if (!mounted) return;
    BuildContext? loaderCtx;
    showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (dialogCtx) {
        loaderCtx = dialogCtx;
        return const Center(child: CircularProgressIndicator());
      },
    );
    try {
      for (final file in picked.files) {
        final path = file.path;
        if (path == null || path.isEmpty) continue;
        final mime = MessagesMediaService.resolveUploadContentType(
          filePath: path,
        );
        if (!MessagesMediaService.isAllowedMessagingMediaType(mime)) {
          throw Exception(MessagesMediaService.formatMediaTypeNotAllowedError());
        }
        final upload = await MessagesMediaService.uploadFile(
          filePath: path,
          contentType: mime,
        );
        final url = MessagesMediaService.pickDisplayUrl(upload);
        if (url.isEmpty) continue;
        final rt = upload['resourceType']?.toString() ?? '';
        final isVideo =
            mime.startsWith('video/') || rt == 'video' || rt.contains('video');
        final isImage = mime.startsWith('image/') || rt == 'image';
        final isAudio = mime.startsWith('audio/');
        final String content;
        if (isVideo) {
          content = '🎬 [Video]: $url';
        } else if (isAudio) {
          content = '🎵 [Audio]: $url';
        } else if (isImage) {
          content = '📷 [Image]: $url';
        } else {
          throw Exception(MessagesMediaService.formatMediaTypeNotAllowedError());
        }
        await _sendChannelMessage(content: content, attachments: [url]);
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            MessagesMediaService.mapUploadErrorMessage(e.toString()),
          ),
        ),
      );
    } finally {
      final ctx = loaderCtx;
      if (ctx != null && ctx.mounted) {
        Navigator.of(ctx).pop();
      }
    }
  }

  void _showPlusSheet() {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: _chrome.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(14)),
      ),
      builder: (ctx) {
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                leading: const Icon(
                  Icons.upload_file_rounded,
                  color: Colors.white,
                ),
                title: Text(
                  _t('chat.composer.plusUploadFile'),
                  style: const TextStyle(color: Colors.white),
                ),
                onTap: () {
                  Navigator.pop(ctx);
                  _pickAndUploadMedia();
                },
              ),
              ListTile(
                leading: const Icon(Icons.poll_rounded, color: Colors.white),
                title: const Text(
                  'Create poll',
                  style: TextStyle(color: Colors.white),
                ),
                onTap: () {
                  Navigator.pop(ctx);
                  _showCreatePollDialog();
                },
              ),
            ],
          ),
        );
      },
    );
  }

  Future<void> _showCreatePollDialog() async {
    if (_chatBlocked) return;
    final questionCtrl = TextEditingController();
    final optionCtrls = <TextEditingController>[
      TextEditingController(),
      TextEditingController(),
    ];
    var durationHours = 24;
    var allowMulti = false;
    await showDialog<void>(
      context: context,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (_, setLocal) {
            return AlertDialog(
              backgroundColor: const Color(0xFF0A1737),
              title: Text(
                _t('messages.createPoll'),
                style: const TextStyle(color: Colors.white),
              ),
              content: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    TextField(
                      controller: questionCtrl,
                      style: const TextStyle(color: Colors.white),
                      decoration: InputDecoration(
                        labelText: _t('messages.pollQuestion'),
                        labelStyle: const TextStyle(color: Color(0xFFB6C2DC)),
                      ),
                    ),
                    ...List.generate(optionCtrls.length, (index) {
                      return TextField(
                        controller: optionCtrls[index],
                        style: const TextStyle(color: Colors.white),
                        decoration: InputDecoration(
                          labelText: _t('messages.pollOption', {'index': (index + 1).toString()}),
                          labelStyle: const TextStyle(color: Color(0xFFB6C2DC)),
                        ),
                      );
                    }),
                    Align(
                      alignment: Alignment.centerLeft,
                      child: TextButton.icon(
                        onPressed: optionCtrls.length >= 10
                            ? null
                            : () => setLocal(
                                () => optionCtrls.add(TextEditingController()),
                              ),
                        icon: const Icon(Icons.add),
                        label: Text(_t('messages.addOption')),
                      ),
                    ),
                    DropdownButtonFormField<int>(
                      initialValue: durationHours,
                      dropdownColor: const Color(0xFF0A1737),
                      style: const TextStyle(color: Colors.white),
                      items: const [1, 3, 6, 12, 24, 48, 72, 168]
                          .map(
                            (h) => DropdownMenuItem(
                              value: h,
                              child: Text(_t('messages.hours', {'h': h.toString()})),
                            ),
                          )
                          .toList(),
                      onChanged: (v) => setLocal(() => durationHours = v ?? 24),
                      decoration: InputDecoration(
                        labelText: _t('messages.pollDuration'),
                        labelStyle: const TextStyle(color: Color(0xFFB6C2DC)),
                      ),
                    ),
                    SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(
                        _t('messages.allowMultipleAnswers'),
                        style: const TextStyle(color: Colors.white70, fontSize: 14),
                      ),
                      value: allowMulti,
                      onChanged: (v) => setLocal(() => allowMulti = v),
                    ),
                  ],
                ),
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.of(ctx).pop(),
                  child: Text(_t('messages.cancel')),
                ),
                TextButton(
                  onPressed: () async {
                    final q = questionCtrl.text.trim();
                    final opts = optionCtrls
                        .map((e) => e.text.trim())
                        .where((e) => e.isNotEmpty)
                        .toList();
                    if (q.isEmpty) {
                      ScaffoldMessenger.of(ctx).showSnackBar(
                        const SnackBar(content: Text('Vui lòng nhập câu hỏi')),
                      );
                      return;
                    }
                    if (opts.length < 2) {
                      ScaffoldMessenger.of(ctx).showSnackBar(
                        const SnackBar(
                          content: Text('Cần ít nhất 2 phương án'),
                        ),
                      );
                      return;
                    }
                    Navigator.of(ctx).pop();
                    BuildContext? loaderCtx;
                    try {
                      if (!context.mounted) return;
                      showDialog<void>(
                        context: context,
                        barrierDismissible: false,
                        builder: (dialogCtx) {
                          loaderCtx = dialogCtx;
                          return const Center(
                            child: CircularProgressIndicator(),
                          );
                        },
                      );
                      final pollId = await PollsApiService.createPoll(
                        question: q,
                        options: opts,
                        durationHours: durationHours,
                        allowMultipleAnswers: allowMulti,
                      );
                      await _sendContentMessage('📊 [Poll]: $pollId');
                    } catch (e) {
                      if (context.mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(content: Text('$e')),
                        );
                      }
                    } finally {
                      final loader = loaderCtx;
                      if (loader != null && loader.mounted) {
                        Navigator.of(loader).pop();
                      }
                    }
                  },
                  child: Text(_t('messages.create')),
                ),
              ],
            );
          },
        );
      },
    );
    questionCtrl.dispose();
    for (final c in optionCtrls) {
      c.dispose();
    }
  }

  void _showUnicodeEmojiPicker() {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: _chrome.surface,
      builder: (ctx) {
        return SafeArea(
          child: SizedBox(
            height: 320,
            child: EmojiPicker(
              textEditingController: _inputController,
              onEmojiSelected: (_, __) {},
              config: Config(
                emojiViewConfig: EmojiViewConfig(
                  backgroundColor: _chrome.surface,
                ),
              ),
            ),
          ),
        );
      },
    );
  }

  Future<void> _openServerEmojiPicker() async {
    final groups = await ServerMediaService.getEmojiPickerGroups(
      contextServerId: widget.server.id,
    );
    if (!mounted) return;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: _chrome.surface,
      builder: (ctx) {
        return DraggableScrollableSheet(
          expand: false,
          initialChildSize: 0.62,
          minChildSize: 0.4,
          maxChildSize: 0.92,
          builder: (_, scrollController) {
            return ListView(
              controller: scrollController,
              padding: const EdgeInsets.all(12),
              children: [
                for (final group in groups) ...[
                  Text(
                    group.serverName,
                    style: const TextStyle(color: Colors.white70),
                  ),
                  const SizedBox(height: 6),
                  GridView.builder(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: group.emojis.length,
                    gridDelegate:
                        const SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: 6,
                          mainAxisSpacing: 6,
                          crossAxisSpacing: 6,
                        ),
                    itemBuilder: (_, index) {
                      final emoji = group.emojis[index];
                      return InkWell(
                        onTap: group.locked
                            ? null
                            : () {
                                _inputController.text += ':${emoji.name}:';
                                _inputController.selection =
                                    TextSelection.collapsed(
                                      offset: _inputController.text.length,
                                    );
                                _serverEmojiMap[emoji.name.toLowerCase()] =
                                    emoji.imageUrl;
                                Navigator.pop(ctx);
                              },
                        child: Opacity(
                          opacity: group.locked ? 0.45 : 1,
                          child: Image.network(
                            emoji.imageUrl,
                            width: 24,
                            height: 24,
                          ),
                        ),
                      );
                    },
                  ),
                  const SizedBox(height: 12),
                ],
              ],
            );
          },
        );
      },
    );
  }

  Future<void> _showEmojiPicker() async {
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: _chrome.surface,
      builder: (ctx) {
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                leading: const Icon(
                  Icons.tag_faces_rounded,
                  color: Colors.white,
                ),
                title: const Text(
                  'Unicode Emoji',
                  style: TextStyle(color: Colors.white),
                ),
                onTap: () {
                  Navigator.pop(ctx);
                  _showUnicodeEmojiPicker();
                },
              ),
              ListTile(
                leading: const Icon(
                  Icons.emoji_emotions_outlined,
                  color: Colors.white,
                ),
                title: const Text(
                  'Server Emoji',
                  style: TextStyle(color: Colors.white),
                ),
                onTap: () async {
                  Navigator.pop(ctx);
                  await _openServerEmojiPicker();
                },
              ),
            ],
          ),
        );
      },
    );
  }

  Future<void> _openGiphyPicker({required bool stickers}) async {
    if (_chatBlocked) return;
    if (AppConfig.giphyApiKey.isEmpty) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              _t('messages.giphyMissingKey'),
            ),
          ),
        );
      }
      return;
    }
    final searchCtrl = TextEditingController();
    List<GiphySearchItem> items = stickers
        ? await GiphySearchService.trendingStickers()
        : await GiphySearchService.trendingGifs();
    if (!mounted) return;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: _chrome.surface,
      builder: (ctx) {
        return DraggableScrollableSheet(
          expand: false,
          initialChildSize: 0.55,
          minChildSize: 0.35,
          maxChildSize: 0.92,
          builder: (context, scrollController) {
            return StatefulBuilder(
              builder: (context, setModal) {
                Future<void> runSearch() async {
                  final q = searchCtrl.text;
                  final next = stickers
                      ? await GiphySearchService.searchStickers(q)
                      : await GiphySearchService.searchGifs(q);
                  setModal(() => items = next);
                }

                return Column(
                  children: [
                    Padding(
                      padding: const EdgeInsets.fromLTRB(12, 10, 12, 6),
                      child: Row(
                        children: [
                          Expanded(
                            child: TextField(
                              controller: searchCtrl,
                              style: const TextStyle(color: Colors.white),
                              decoration: InputDecoration(
                                hintText: stickers
                                    ? _t('messages.searchStickerHint')
                                    : _t('messages.searchGifHint'),
                              ),
                              onSubmitted: (_) => runSearch(),
                            ),
                          ),
                          IconButton(
                            onPressed: runSearch,
                            icon: const Icon(Icons.search, color: Colors.white),
                          ),
                        ],
                      ),
                    ),
                    Expanded(
                      child: GridView.builder(
                        controller: scrollController,
                        padding: const EdgeInsets.all(8),
                        gridDelegate:
                            const SliverGridDelegateWithFixedCrossAxisCount(
                              crossAxisCount: 2,
                              childAspectRatio: 1.1,
                              crossAxisSpacing: 6,
                              mainAxisSpacing: 6,
                            ),
                        itemCount: items.length,
                        itemBuilder: (_, i) {
                          final g = items[i];
                          return InkWell(
                            onTap: () async {
                              Navigator.pop(ctx);
                              await _sendChannelMessage(
                                content: g.title.trim().isEmpty
                                    ? (stickers
                                          ? 'Sent a sticker'
                                          : 'Sent a GIF')
                                    : g.title.trim(),
                                type: stickers ? 'sticker' : 'gif',
                                giphyId: g.id,
                              );
                            },
                            child: ClipRRect(
                              borderRadius: BorderRadius.circular(8),
                              child: g.previewUrl.isEmpty
                                  ? Container(color: const Color(0xFF1F2D4D))
                                  : Image.network(
                                      g.previewUrl,
                                      fit: BoxFit.cover,
                                    ),
                            ),
                          );
                        },
                      ),
                    ),
                  ],
                );
              },
            );
          },
        );
      },
    );
    searchCtrl.dispose();
  }

  Future<void> _openServerStickerPicker() async {
    if (_chatBlocked) return;
    final groups = await ServerMediaService.getStickerPickerGroups(
      contextServerId: widget.server.id,
    );
    if (!mounted) return;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: _chrome.surface,
      builder: (ctx) {
        return DraggableScrollableSheet(
          expand: false,
          initialChildSize: 0.62,
          minChildSize: 0.4,
          maxChildSize: 0.92,
          builder: (_, scrollController) {
            return ListView(
              controller: scrollController,
              padding: const EdgeInsets.all(12),
              children: [
                for (final group in groups) ...[
                  Text(
                    group.serverName,
                    style: const TextStyle(color: Colors.white70),
                  ),
                  const SizedBox(height: 6),
                  GridView.builder(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: group.stickers.length,
                    gridDelegate:
                        const SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: 2,
                          mainAxisSpacing: 6,
                          crossAxisSpacing: 6,
                          childAspectRatio: 1.15,
                        ),
                    itemBuilder: (_, index) {
                      final sticker = group.stickers[index];
                      return InkWell(
                        onTap: group.locked
                            ? null
                            : () async {
                                Navigator.pop(ctx);
                                await _sendChannelMessage(
                                  content: '🎨 [Sticker]: ${sticker.imageUrl}',
                                  type: 'sticker',
                                  customStickerUrl: sticker.imageUrl,
                                  serverStickerId: sticker.id,
                                  serverStickerServerId: group.serverId,
                                );
                              },
                        child: Opacity(
                          opacity: group.locked ? 0.45 : 1,
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(8),
                            child: Image.network(
                              sticker.imageUrl,
                              fit: BoxFit.cover,
                            ),
                          ),
                        ),
                      );
                    },
                  ),
                  const SizedBox(height: 12),
                ],
              ],
            );
          },
        );
      },
    );
  }

  Future<void> _showStickerPickerMenu() async {
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: _chrome.surface,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const GifToolbarIcon(size: 22, color: Colors.white),
              title: const Text(
                'Giphy Sticker',
                style: TextStyle(color: Colors.white),
              ),
              onTap: () {
                Navigator.pop(ctx);
                _openGiphyPicker(stickers: true);
              },
            ),
            ListTile(
              leading: const StickerToolbarIcon(size: 22, color: Colors.white),
              title: const Text(
                'Server Sticker',
                style: TextStyle(color: Colors.white),
              ),
              onTap: () async {
                Navigator.pop(ctx);
                await _openServerStickerPicker();
              },
            ),
          ],
        ),
      ),
    );
  }

  void _openExpressionsHub(MessagesChromePalette chrome) {
    unawaited(
      ChatExpressionsMenu.show(
        context: context,
        chrome: chrome,
        host: ChannelChatExpressionsHost(
          inputController: _inputController,
          chrome: chrome,
          serverId: widget.server.id,
          serverEmojiMap: _serverEmojiMap,
          chatBlocked: _chatBlocked,
          onSendGiphy: (g, stickers) => _sendChannelMessage(
            content: g.title.trim().isEmpty
                ? (stickers ? 'Sent a sticker' : 'Sent a GIF')
                : g.title.trim(),
            type: stickers ? 'sticker' : 'gif',
            giphyId: g.id,
          ),
          onSendServerSticker: (sticker, group) => _sendChannelMessage(
            content: '🎨 [Sticker]: ${sticker.imageUrl}',
            type: 'sticker',
            customStickerUrl: sticker.imageUrl,
            serverStickerId: sticker.id,
            serverStickerServerId: group.serverId,
          ),
        ),
      ),
    );
  }

  Future<void> _showMessageActions(ChannelMessage message) async {
    final isMine = _isMine(message);
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: _chrome.surface,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 8),
            Text(
              _t('messages.messageActions'),
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w700,
                fontSize: 15,
              ),
            ),
            const SizedBox(height: 10),
            ListTile(
              leading: const Icon(Icons.reply_rounded, color: Colors.white),
              title: Text(
                _t('messages.replyAction'),
                style: const TextStyle(color: Colors.white),
              ),
              onTap: () {
                Navigator.of(ctx).pop();
                setState(() => _replyingTo = message);
              },
            ),
            ListTile(
              leading: const Icon(
                Icons.add_reaction_outlined,
                color: Colors.white,
              ),
              title: Text(
                _t('messages.pickEmoji'),
                style: const TextStyle(color: Colors.white),
              ),
              onTap: () {
                Navigator.of(ctx).pop();
                _showCustomReactionPicker(message);
              },
            ),
            ListTile(
              leading: const Icon(Icons.push_pin_outlined, color: Colors.white),
              title: Text(
                _t('messages.pinMessage'),
                style: const TextStyle(color: Colors.white),
              ),
              onTap: () async {
                Navigator.of(ctx).pop();
                await _togglePinMessage(message);
              },
            ),
            ListTile(
              leading: const Icon(
                Icons.delete_outline,
                color: Colors.redAccent,
              ),
              title: Text(
                _t('messages.deleteMsg'),
                style: const TextStyle(color: Colors.redAccent),
              ),
              onTap: () async {
                Navigator.of(ctx).pop();
                final deleteType = await showModalBottomSheet<String>(
                  context: context,
                  backgroundColor: _chrome.surface,
                  builder: (dCtx) {
                    return SafeArea(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          ListTile(
                            leading: const Icon(
                              Icons.delete_outline,
                              color: Colors.white,
                            ),
                            title: Text(
                              _t('messages.deleteForMe'),
                              style: const TextStyle(color: Colors.white),
                            ),
                            onTap: () => Navigator.of(dCtx).pop('for-me'),
                          ),
                          if (isMine)
                            ListTile(
                              leading: const Icon(
                                Icons.delete_forever_outlined,
                                color: Colors.redAccent,
                              ),
                              title: Text(
                                _t('messages.recallForAll'),
                                style: const TextStyle(color: Colors.redAccent),
                              ),
                              onTap: () =>
                                  Navigator.of(dCtx).pop('for-everyone'),
                            ),
                        ],
                      ),
                    );
                  },
                );
                if (deleteType == null) return;
                await _deleteChannelMessage(
                  messageId: message.id,
                  deleteType: deleteType,
                );
              },
            ),
            const SizedBox(height: 10),
          ],
        ),
      ),
    );
  }

  Future<void> _showCustomReactionPicker(ChannelMessage message) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: _chrome.surface,
      builder: (ctx) {
        return SizedBox(
          height: 360,
          child: EmojiPicker(
            onEmojiSelected: (_, emoji) async {
              Navigator.of(ctx).pop();
              await ChannelMessagesService.addReaction(
                channelId: widget.channel.id,
                messageId: message.id,
                emoji: emoji.emoji,
              );
            },
            config: Config(
              emojiViewConfig: EmojiViewConfig(
                backgroundColor: _chrome.surface,
              ),
              categoryViewConfig: CategoryViewConfig(
                backgroundColor: Color(0xFF121e36),
                iconColor: Color(0xFF8A98B8),
                iconColorSelected: Colors.white,
              ),
            ),
          ),
        );
      },
    );
  }

  Future<void> _deleteChannelMessage({
    required String messageId,
    required String deleteType,
  }) async {
    try {
      await ChannelMessagesService.deleteMessage(
        channelId: widget.channel.id,
        messageId: messageId,
        deleteType: deleteType,
      );
      if (!mounted) return;
      _applyMessageDeleted({
        'channelId': widget.channel.id,
        'messageId': messageId,
        'deleteType': deleteType,
        if (deleteType == 'for-everyone')
          'deletedAt': DateTime.now().toIso8601String(),
      });
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(_t('messages.cannotDeleteMessage'))));
    }
  }

  Future<void> _togglePinMessage(ChannelMessage message) async {
    try {
      final updated = await ChannelMessagesService.togglePin(
        channelId: widget.channel.id,
        messageId: message.id,
      );
      if (updated != null) {
        setState(() {
          final idx = _messages.indexWhere((m) => m.id == message.id);
          if (idx != -1) _messages[idx] = updated;
        });
      }
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(_t('messages.messagePinned')),
          action: SnackBarAction(
            label: _t('messages.viewAll'),
            onPressed: () async {
              final pickedId = await Navigator.of(context).push<String>(
                MaterialPageRoute(
                  builder: (_) => PinnedMessagesScreen.channel(
                    channelId: widget.channel.id,
                  ),
                ),
              );
              if (!mounted || pickedId == null || pickedId.isEmpty) return;
              await _scrollToChannelMessageId(pickedId);
            },
          ),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(_t('messages.cannotPinMessage'))));
    }
  }

  Future<void> _openVoiceRecorder() async {
    if (_chatBlocked) return;
    final status = await Permission.microphone.request();
    if (!status.isGranted) return;
    if (!mounted) return;
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: _chrome.surface,
      builder: (ctx) => _VoiceRecordPanel(onSend: _sendVoiceMessage),
    );
  }

  Widget _buildEmojiAwareText(String text) {
    final spans = <InlineSpan>[];
    var cursor = 0;
    for (final m in _serverEmojiTokenRegExp.allMatches(text)) {
      if (m.start > cursor) {
        spans.add(
          TextSpan(
            text: text.substring(cursor, m.start),
            style: const TextStyle(color: Colors.white),
          ),
        );
      }
      final key = (m.group(1) ?? '').toLowerCase();
      final img = _serverEmojiMap[key];
      if (img != null && img.isNotEmpty) {
        spans.add(
          WidgetSpan(
            alignment: PlaceholderAlignment.middle,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 1),
              child: Image.network(img, width: 20, height: 20),
            ),
          ),
        );
      } else {
        spans.add(
          TextSpan(
            text: m.group(0) ?? '',
            style: const TextStyle(color: Colors.white),
          ),
        );
      }
      cursor = m.end;
    }
    if (cursor < text.length) {
      spans.add(
        TextSpan(
          text: text.substring(cursor),
          style: const TextStyle(color: Colors.white),
        ),
      );
    }
    return RichText(text: TextSpan(children: spans));
  }

  Widget _buildMessageContent(ChannelMessage message) {
    if (message.isDeletedForEveryone) {
      final mine = _isMine(message);
      final label = mine
          ? 'Bạn đã xóa tin nhắn'
          : '${_displayNameFor(message)} đã xóa tin nhắn';
      return Text(
        label,
        style: TextStyle(
          color: Colors.white.withValues(alpha: 0.55),
          fontStyle: FontStyle.italic,
          fontSize: 13,
        ),
      );
    }
    final text = message.content.trim();
    if (message.type == 'gif' && (message.giphyId ?? '').isNotEmpty) {
      final gifUrl =
          'https://media.giphy.com/media/${message.giphyId}/giphy.gif';
      return ClipRRect(
        borderRadius: BorderRadius.circular(8),
        child: Image.network(
          gifUrl,
          width: 220,
          height: 160,
          fit: BoxFit.cover,
          errorBuilder: (_, __, ___) =>
              Text(text, style: const TextStyle(color: Colors.white)),
        ),
      );
    }
    if (message.type == 'sticker') {
      final direct = (message.customStickerUrl ?? '').trim();
      final fromContent = text.startsWith('🎨 [Sticker]:')
          ? text.replaceFirst('🎨 [Sticker]:', '').trim()
          : '';
      final fromAttach = message.attachments.isNotEmpty
          ? message.attachments.first
          : '';
      final url = direct.isNotEmpty
          ? direct
          : (fromContent.isNotEmpty ? fromContent : fromAttach);
      if (url.isNotEmpty) {
        return ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: Image.network(
            url,
            width: 180,
            height: 180,
            fit: BoxFit.cover,
            errorBuilder: (_, __, ___) =>
                Text(text, style: const TextStyle(color: Colors.white)),
          ),
        );
      }
    }
    if (message.type == 'voice' && (message.voiceUrl ?? '').trim().isNotEmpty) {
      return _VoiceMessageBubble(
        url: message.voiceUrl!.trim(),
        durationSec: message.voiceDurationSec,
      );
    }
    final mediaBubble = ChatMessageMediaBubble.fromContent(
      content: text,
      attachments: message.attachments,
      onTapImage: (url) {
        final items = collectChannelMedia(_messages);
        openChatMediaViewer(
          context,
          items: items,
          initialIndex: indexOfChatMedia(items, url),
        );
      },
      onTapVideo: () {
        final items = collectChannelMedia(_messages);
        final resolved = ChatMediaResolver.resolveContentText(
          content: text,
          attachments: message.attachments,
        );
        final video = ChatMediaResolver.extractVideoUrl(resolved);
        if (video == null || items.isEmpty) return;
        openChatMediaViewer(
          context,
          items: items,
          initialIndex: indexOfChatMedia(items, video),
        );
      },
    );
    if (mediaBubble != null) return mediaBubble;

    final pollMatch = _pollRegExp.firstMatch(text);
    if (pollMatch != null) {
      final pollId = pollMatch.group(1) ?? '';
      if (pollId.isNotEmpty) return _PollMessageCard(pollId: pollId);
    }
    if (text.startsWith('🎨 [Sticker]:') || text.startsWith('🎬 [GIF]:')) {
      final mediaUrl = text.substring(text.indexOf(':') + 1).trim();
      return ClipRRect(
        borderRadius: BorderRadius.circular(8),
        child: Image.network(
          mediaUrl,
          width: 180,
          height: 180,
          fit: BoxFit.cover,
        ),
      );
    }
    if (text.startsWith('🎤 [Voice]:')) {
      final raw = text.replaceFirst('🎤 [Voice]:', '').trim();
      final parts = raw.split('|');
      final url = parts.isNotEmpty ? parts[0].trim() : '';
      final duration = parts.length > 1 ? int.tryParse(parts[1]) : null;
      if (url.isNotEmpty) {
        return _VoiceMessageBubble(url: url, durationSec: duration);
      }
    }
    // Pre-fetched link previews (fetched server-side on send)
    if (message.linkPreviews.isNotEmpty) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          _buildEmojiAwareText(text),
          const SizedBox(height: 6),
          ChatLinkPreviewList(previews: message.linkPreviews),
        ],
      );
    }

    return _buildEmojiAwareText(text);
  }

  String _replyPreviewText(ChannelReplyMessage reply) {
    if ((reply.type ?? '') == 'voice') return _t('messages.voiceMessageContent');
    if (reply.content.trim().isEmpty) return _t('messages.message');
    return reply.content.trim();
  }

  bool _isMine(ChannelMessage msg) {
    final me = widget.currentUserId ?? '';
    return me.isNotEmpty && msg.senderId == me;
  }

  @override
  Widget build(BuildContext context) {
    return MessagesChromeBuilder(
      builder: (context, chrome) => Scaffold(
      backgroundColor: chrome.bg,
      appBar: AppBar(
        backgroundColor: chrome.bg,
        elevation: 0,
        titleSpacing: 0,
        actions: [
          IconButton(
            tooltip: _t('messages.searchMessages'),
            onPressed: _openChannelMessageSearch,
            icon: const Icon(Icons.search_rounded, color: Colors.white),
          ),
        ],
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '# ${widget.channel.name}',
              style: const TextStyle(
                color: Colors.white,
                fontSize: 16,
                fontWeight: FontWeight.w700,
              ),
            ),
            Text(
              widget.server.name,
              style: const TextStyle(
                color: Color(0xFF9EB3DA),
                fontSize: 11,
                fontWeight: FontWeight.w500,
              ),
            ),
          ],
        ),
      ),
      body: Column(
        children: [
          Divider(height: 1, color: chrome.border),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _error != null
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 24),
                      child: Text(
                        _error!,
                        textAlign: TextAlign.center,
                        style: const TextStyle(color: Color(0xFFAFC0E2)),
                      ),
                    ),
                  )
                : _messages.isEmpty
                ? Center(
                    child: Text(
                      _t('messages.noMessages'),
                      style: const TextStyle(
                        color: Color(0xFFAFC0E2),
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  )
                : ListView.builder(
                    controller: _scrollController,
                    padding: const EdgeInsets.fromLTRB(12, 14, 12, 22),
                    itemCount: _messages.length,
                    itemBuilder: (context, index) {
                      final msg = _messages[index];
                      if (msg.type == 'welcome') {
                        return KeyedSubtree(
                          key: _keyForChannelMessage(msg.id),
                          child: _buildWelcomeSystemRow(msg),
                        );
                      }
                      final mine = _isMine(msg);
                      final hi = _highlightChannelMessageId == msg.id;
                      return KeyedSubtree(
                        key: _keyForChannelMessage(msg.id),
                        child: Align(
                          alignment: mine
                              ? Alignment.centerRight
                              : Alignment.centerLeft,
                          child: AnimatedContainer(
                            duration: const Duration(milliseconds: 200),
                            decoration: hi
                                ? BoxDecoration(
                                    borderRadius: BorderRadius.circular(14),
                                    boxShadow: const [
                                      BoxShadow(
                                        color: Color(0x664A90E2),
                                        blurRadius: 12,
                                        spreadRadius: 1,
                                      ),
                                    ],
                                  )
                                : null,
                            child: GestureDetector(
                              onLongPress: () => _showMessageActions(msg),
                              child: Container(
                                margin: const EdgeInsets.only(bottom: 9),
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 12,
                                  vertical: 9,
                                ),
                                constraints: BoxConstraints(
                                  maxWidth:
                                      MediaQuery.sizeOf(context).width * 0.78,
                                ),
                                decoration: BoxDecoration(
                                  color: mine
                                      ? const Color(0xFF1D63E9)
                                      : const Color(0xFF112950),
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    if (!mine)
                                      Padding(
                                        padding: const EdgeInsets.only(
                                          bottom: 4,
                                        ),
                                        child: Text(

                                          _displayNameFor(msg),
                                          style: const TextStyle(
                                            color: Color(0xFFC3D4F7),
                                            fontSize: 11,
                                            fontWeight: FontWeight.w600,
                                          ),
                                        ),
                                      ),
                                    if (msg.replyTo != null)
                                      Container(
                                        width: double.infinity,
                                        margin: const EdgeInsets.only(
                                          bottom: 6,
                                        ),
                                        padding: const EdgeInsets.symmetric(
                                          horizontal: 8,
                                          vertical: 6,
                                        ),
                                        decoration: BoxDecoration(
                                          color: Colors.black.withValues(
                                            alpha: 0.14,
                                          ),
                                          borderRadius: BorderRadius.circular(
                                            8,
                                          ),
                                        ),
                                        child: Column(
                                          crossAxisAlignment:
                                              CrossAxisAlignment.start,
                                          children: [
                                            Text(
                                              msg.replyTo?.senderId != null &&
                                                      msg.replyTo!.senderId
                                                          .isNotEmpty
                                                  ? _displayNameForSenderId(
                                                      msg.replyTo!.senderId,
                                                      fallback: msg
                                                          .replyTo?.senderName,
                                                    )
                                                  : (msg
                                                            .replyTo
                                                            ?.senderName
                                                            ?.isNotEmpty ==
                                                        true
                                                    ? msg.replyTo!.senderName!
                                                    : 'Đang trả lời'),
                                              style: const TextStyle(
                                                color: Color(0xFFB6C2DC),
                                                fontSize: 11,
                                                fontWeight: FontWeight.w700,
                                              ),
                                            ),
                                            const SizedBox(height: 2),
                                            Text(
                                              _replyPreviewText(msg.replyTo!),
                                              maxLines: 1,
                                              overflow: TextOverflow.ellipsis,
                                              style: const TextStyle(
                                                color: Colors.white,
                                                fontSize: 12,
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                    _buildMessageContent(msg),
                                    if (msg.reactions.isNotEmpty) ...[
                                      const SizedBox(height: 6),
                                      Wrap(
                                        spacing: 6,
                                        runSpacing: 6,
                                        children: msg.reactions
                                            .where((e) => e.emoji.isNotEmpty)
                                            .map(
                                              (r) => Container(
                                                padding:
                                                    const EdgeInsets.symmetric(
                                                      horizontal: 7,
                                                      vertical: 3,
                                                    ),
                                                decoration: BoxDecoration(
                                                  color: Colors.black
                                                      .withValues(alpha: 0.16),
                                                  borderRadius:
                                                      BorderRadius.circular(10),
                                                ),
                                                child: Text(
                                                  '${r.emoji} ${r.count}',
                                                  style: const TextStyle(
                                                    color: Colors.white,
                                                    fontSize: 11,
                                                    fontWeight: FontWeight.w600,
                                                  ),
                                                ),
                                              ),
                                            )
                                            .toList(),
                                      ),
                                    ],
                                  ],
                                ),
                              ),
                            ),
                          ),
                        ),
                      );
                    },
                  ),
          ),
          if (_chatBlocked)
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 6),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: [
                      Expanded(
                        child: Text(
                          _chatBlockedBannerText(),
                          style: const TextStyle(
                            color: Color(0xFFFFB2BE),
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                      if (_canCompleteGateStepsInChannel()) ...[
                        const SizedBox(width: 10),
                        FilledButton(
                          onPressed: _openChannelGateSheet,
                          style: FilledButton.styleFrom(
                            backgroundColor: const Color(0xFF5865F2),
                            padding: const EdgeInsets.symmetric(
                              horizontal: 14,
                              vertical: 8,
                            ),
                            minimumSize: Size.zero,
                            tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                          ),
                          child: Text(_t('messages.done')),
                        ),
                      ],
                    ],
                  ),
                ],
              ),
            ),
          SafeArea(
            top: false,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (_replyingTo != null)
                  Container(
                    width: double.infinity,
                    margin: const EdgeInsets.fromLTRB(8, 4, 8, 0),
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 8,
                    ),
                    decoration: BoxDecoration(
                      color: const Color(0xFF17284A),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: const Color(0xFF3A4F77)),
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                _t('messages.replying'),
                                style: const TextStyle(
                                  color: Color(0xFFB6C2DC),
                                  fontSize: 11,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                _replyingTo!.content.isNotEmpty
                                    ? _replyingTo!.content
                                    : (_replyingTo!.type == 'voice'
                                          ? _t('messages.voiceMessageContent')
                                          : _t('messages.voiceMessage')),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 13,
                                ),
                              ),
                            ],
                          ),
                        ),
                        IconButton(
                          onPressed: () => setState(() => _replyingTo = null),
                          icon: const Icon(
                            Icons.close_rounded,
                            color: Colors.white70,
                          ),
                        ),
                      ],
                    ),
                  ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(8, 6, 8, 8),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      IconButton(
                        padding: EdgeInsets.zero,
                        constraints: const BoxConstraints(
                          minWidth: 36,
                          minHeight: 44,
                        ),
                        onPressed: _showPlusSheet,
                        icon: const Icon(
                          Icons.add,
                          color: Color(0xFFB6C2DC),
                          size: 26,
                        ),
                      ),
                      Expanded(
                        child: Container(
                          constraints: const BoxConstraints(minHeight: 44),
                          padding: const EdgeInsets.symmetric(horizontal: 4),
                          decoration: BoxDecoration(
                            color: const Color(0xFF2C3A5A),
                            borderRadius: BorderRadius.circular(22),
                          ),
                          child: TextField(
                            controller: _inputController,
                            minLines: 1,
                            maxLines: 6,
                            onSubmitted: (_) => _sendText(),
                            enabled: !_chatBlocked,
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 14,
                            ),
                            decoration: InputDecoration(
                              isDense: true,
                              contentPadding: const EdgeInsets.symmetric(
                                horizontal: 12,
                                vertical: 10,
                              ),
                              hintText: _chatBlocked
                                  ? _t('messages.channelRestricted')
                                  : _t('messages.chatHint', {'name': widget.channel.name}),
                              hintStyle: const TextStyle(
                                color: Color(0xFF8A98B8),
                                fontSize: 14,
                              ),
                              border: InputBorder.none,
                            ),
                          ),
                        ),
                      ),
                      IconButton(
                        padding: EdgeInsets.zero,
                        constraints: const BoxConstraints(
                          minWidth: 36,
                          minHeight: 44,
                        ),
                        onPressed: () => _openExpressionsHub(chrome),
                        icon: Icon(
                          Icons.mood_rounded,
                          color: chrome.textMuted,
                          size: 24,
                        ),
                      ),
                      IconButton(
                        padding: EdgeInsets.zero,
                        constraints: const BoxConstraints(
                          minWidth: 36,
                          minHeight: 44,
                        ),
                        onPressed: _openVoiceRecorder,
                        icon: const Icon(
                          Icons.mic_none_rounded,
                          color: Color(0xFFB6C2DC),
                          size: 24,
                        ),
                      ),
                      Padding(
                        padding: const EdgeInsets.only(left: 2, bottom: 2),
                        child: Material(
                          color: const Color(0xFF6C5CE7),
                          shape: const CircleBorder(),
                          child: InkWell(
                            customBorder: const CircleBorder(),
                            onTap: (!_chatBlocked && !_sending)
                                ? _sendText
                                : null,
                            child: Padding(
                              padding: const EdgeInsets.all(8),
                              child: _sending
                                  ? const SizedBox(
                                      width: 16,
                                      height: 16,
                                      child: CircularProgressIndicator(
                                        strokeWidth: 2,
                                      ),
                                    )
                                  : const Icon(
                                      Icons.send_rounded,
                                      size: 20,
                                      color: Colors.white,
                                    ),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    ),
    );
  }
}

class _VoiceRecordPanel extends StatefulWidget {
  const _VoiceRecordPanel({required this.onSend});

  final Future<void> Function(String url, int durationSec) onSend;

  @override
  State<_VoiceRecordPanel> createState() => _VoiceRecordPanelState();
}

class _VoiceRecordPanelState extends State<_VoiceRecordPanel> {
  final AudioRecorder _recorder = AudioRecorder();
  bool _recording = false;
  bool _busy = false;
  final Stopwatch _sw = Stopwatch();
  Timer? _tick;

  @override
  void dispose() {
    _tick?.cancel();
    unawaited(_recorder.dispose());
    super.dispose();
  }

  Future<void> _start() async {
    if (!await _recorder.hasPermission()) return;
    final dir = await getTemporaryDirectory();
    final path =
        '${dir.path}/voice_${DateTime.now().millisecondsSinceEpoch}.m4a';
    await _recorder.start(
      const RecordConfig(encoder: AudioEncoder.aacLc),
      path: path,
    );
    _sw
      ..reset()
      ..start();
    _tick = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
    setState(() => _recording = true);
  }

  Future<void> _cancel() async {
    await _recorder.cancel();
    _sw.stop();
    _tick?.cancel();
    if (!mounted) return;
    setState(() => _recording = false);
    Navigator.of(context).pop();
  }

  Future<void> _send() async {
    if (!_recording || _busy) return;
    setState(() => _busy = true);
    try {
      final path = await _recorder.stop();
      _sw.stop();
      _tick?.cancel();
      final sec = _sw.elapsed.inSeconds.clamp(1, 600);
      if (path != null && path.isNotEmpty) {
        final upload = await MessagesMediaService.uploadFile(
          filePath: path,
          contentType: 'audio/mp4',
        );
        final url = MessagesMediaService.pickDisplayUrl(upload);
        if (url.isNotEmpty) {
          await widget.onSend(url, sec);
        }
      }
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final secs = _sw.elapsed.inSeconds;
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            _recording ? LanguageController.instance.t('messages.recordingStatus', {'s': secs.toString()}) : LanguageController.instance.t('messages.voiceMessage'),
            style: const TextStyle(color: Colors.white, fontSize: 16),
          ),
          const SizedBox(height: 16),
          if (!_recording)
            FilledButton.icon(
              onPressed: _busy ? null : _start,
              icon: const Icon(Icons.mic),
              label: Text(LanguageController.instance.t('messages.startRecording')),
            )
          else
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [
                OutlinedButton(
                  onPressed: _busy ? null : _cancel,
                  child: Text(LanguageController.instance.t('messages.cancel')),
                ),
                FilledButton(
                  onPressed: _busy ? null : _send,
                  child: _busy
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : Text(LanguageController.instance.t('messages.send')),
                ),
              ],
            ),
        ],
      ),
    );
  }
}

class _VoiceMessageBubble extends StatefulWidget {
  const _VoiceMessageBubble({required this.url, this.durationSec});

  final String url;
  final int? durationSec;

  @override
  State<_VoiceMessageBubble> createState() => _VoiceMessageBubbleState();
}

class _VoiceMessageBubbleState extends State<_VoiceMessageBubble> {
  late final AudioPlayer _player = AudioPlayer();
  Duration _position = Duration.zero;
  Duration _duration = Duration.zero;
  bool _playing = false;

  @override
  void initState() {
    super.initState();
    _player.onPositionChanged.listen((p) {
      if (mounted) setState(() => _position = p);
    });
    _player.onDurationChanged.listen((d) {
      if (mounted) setState(() => _duration = d);
    });
    _player.onPlayerStateChanged.listen((s) {
      if (mounted) setState(() => _playing = s == PlayerState.playing);
    });
  }

  @override
  void dispose() {
    unawaited(_player.dispose());
    super.dispose();
  }

  String _formatDuration() {
    final fallback = widget.durationSec ?? 0;
    final raw = _duration.inSeconds > 0 ? _duration.inSeconds : fallback;
    final min = raw ~/ 60;
    final sec = raw % 60;
    return '${min.toString().padLeft(2, '0')}:${sec.toString().padLeft(2, '0')}';
  }

  Future<void> _togglePlay() async {
    if (_playing) {
      await _player.pause();
      return;
    }
    await _player.play(UrlSource(widget.url));
  }

  @override
  Widget build(BuildContext context) {
    final total = _duration.inMilliseconds > 0
        ? _duration
        : Duration(seconds: widget.durationSec ?? 0);
    final progress = total.inMilliseconds <= 0
        ? 0.0
        : (_position.inMilliseconds / total.inMilliseconds).clamp(0.0, 1.0);
    return Container(
      width: 230,
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: const Color(0xFF26385F),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: const Color(0xFF5D6B87)),
      ),
      child: Row(
        children: [
          IconButton(
            onPressed: _togglePlay,
            icon: Icon(
              _playing ? Icons.pause_rounded : Icons.play_arrow_rounded,
              color: Colors.white,
            ),
          ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  LanguageController.instance.t('messages.voiceMessage'),
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 6),
                LinearProgressIndicator(
                  value: progress.toDouble(),
                  backgroundColor: const Color(0xFF1F2D4D),
                  valueColor: const AlwaysStoppedAnimation(Color(0xFF6C5CE7)),
                  minHeight: 4,
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Text(
            _formatDuration(),
            style: const TextStyle(color: Color(0xFFB6C2DC), fontSize: 12),
          ),
        ],
      ),
    );
  }
}

class _PollMessageCard extends StatefulWidget {
  const _PollMessageCard({required this.pollId});

  final String pollId;

  @override
  State<_PollMessageCard> createState() => _PollMessageCardState();
}

class _PollMessageCardState extends State<_PollMessageCard> {
  Map<String, dynamic>? _pollData;
  List<int> _selectedOptions = <int>[];
  bool _hasVoted = false;
  bool _showResults = false;
  bool _submitting = false;
  String? _loadError;

  @override
  void initState() {
    super.initState();
    _loadPoll();
  }

  Future<void> _loadPoll() async {
    try {
      final rs = await PollsApiService.getPollResults(widget.pollId);
      final my = await PollsApiService.getMyVote(widget.pollId);
      if (!mounted) return;
      setState(() {
        _pollData = rs;
        _selectedOptions = my;
        _hasVoted = my.isNotEmpty;
        _showResults = my.isNotEmpty;
        _loadError = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _loadError = '$e');
    }
  }

  Future<void> _vote() async {
    if (_pollData == null || _selectedOptions.isEmpty || _submitting) return;
    setState(() => _submitting = true);
    try {
      await PollsApiService.votePoll(
        pollId: widget.pollId,
        optionIndexes: _selectedOptions,
      );
      if (!mounted) return;
      setState(() {
        _hasVoted = true;
        _showResults = true;
      });
      await _loadPoll();
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final data = _pollData;
    if (data == null) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            _loadError ?? 'Đang tải khảo sát...',
            style: const TextStyle(color: Colors.white70),
          ),
          if (_loadError != null)
            TextButton(onPressed: _loadPoll, child: const Text('Thử lại')),
        ],
      );
    }
    final options = (data['options'] as List?)?.map((e) => '$e').toList() ?? [];
    final allowMultiple = data['allowMultipleAnswers'] == true;
    final results =
        (data['results'] as List?)
            ?.map((e) => Map<String, dynamic>.from(e as Map))
            .toList() ??
        const <Map<String, dynamic>>[];
    return Container(
      width: 280,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFF2B2D31),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: const Color(0xFF3F4147)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            (data['question'] ?? '').toString(),
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w700,
              fontSize: 14,
            ),
          ),
          const SizedBox(height: 8),
          ...List.generate(options.length, (i) {
            if (_showResults) {
              final percentage = (i < results.length)
                  ? ((results[i]['percentage'] as num?)?.toDouble() ?? 0)
                  : 0;
              return Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            options[i],
                            style: const TextStyle(color: Colors.white),
                          ),
                        ),
                        Text(
                          '${percentage.toStringAsFixed(0)}%',
                          style: const TextStyle(
                            color: Color(0xFFB5BAC1),
                            fontSize: 12,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    LinearProgressIndicator(
                      value: (percentage / 100).clamp(0, 1),
                      minHeight: 6,
                      backgroundColor: const Color(0xFF1E1F22),
                      valueColor: const AlwaysStoppedAnimation(
                        Color(0xFF6C5CE7),
                      ),
                    ),
                  ],
                ),
              );
            }
            return InkWell(
              onTap: _hasVoted
                  ? null
                  : () {
                      setState(() {
                        if (allowMultiple) {
                          if (_selectedOptions.contains(i)) {
                            _selectedOptions = _selectedOptions
                                .where((e) => e != i)
                                .toList();
                          } else {
                            _selectedOptions = [..._selectedOptions, i];
                          }
                        } else {
                          _selectedOptions = [i];
                        }
                      });
                    },
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 5),
                child: Row(
                  children: [
                    Icon(
                      _selectedOptions.contains(i)
                          ? Icons.radio_button_checked
                          : Icons.radio_button_unchecked,
                      size: 18,
                      color: _selectedOptions.contains(i)
                          ? const Color(0xFF6C5CE7)
                          : const Color(0xFFB5BAC1),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        options[i],
                        style: const TextStyle(color: Colors.white),
                      ),
                    ),
                  ],
                ),
              ),
            );
          }),
          const SizedBox(height: 10),
          Row(
            children: [
              if (!_showResults)
                TextButton(
                  onPressed: () => setState(() => _showResults = true),
                  child: Text(LanguageController.instance.t('messages.viewResults')),
                ),
              if (!_hasVoted && !_showResults)
                FilledButton(
                  onPressed: _selectedOptions.isEmpty || _submitting
                      ? null
                      : _vote,
                  child: Text(LanguageController.instance.t('messages.vote')),
                ),
            ],
          ),
        ],
      ),
    );
  }
}
