import 'dart:async';

import 'package:audioplayers/audioplayers.dart';
import 'package:emoji_picker_flutter/emoji_picker_flutter.dart';
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
import 'search/message_search_sheet.dart';
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
  static const Color _pageColor = Color(0xFF08183A);
  static const Color _lineColor = Color(0xFF21345D);
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
        const SnackBar(
          content: Text('Tin nhắn không có trong đoạn đang tải'),
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
  ChannelMessage? _replyingTo;
  StreamSubscription<ChannelMessage>? _newMessageSub;
  StreamSubscription<Map<String, dynamic>>? _reactionSub;
  StreamSubscription<Map<String, dynamic>>? _deletedSub;

  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  @override
  void dispose() {
    _newMessageSub?.cancel();
    _reactionSub?.cancel();
    _deletedSub?.cancel();
    ChannelMessagesRealtimeService.leaveChannel(widget.channel.id);
    _inputController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _bootstrap() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await ChannelMessagesRealtimeService.connect();
      ChannelMessagesRealtimeService.joinChannel(widget.channel.id);
      _newMessageSub = ChannelMessagesRealtimeService.messages.listen((
        incoming,
      ) {
        if (!mounted || incoming.channelId != widget.channel.id) return;
        if (_messages.any((m) => m.id == incoming.id)) return;
        setState(() => _messages = [..._messages, incoming]);
        _scrollToBottom();
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
        final next = ChannelMessage(
          id: curr.id,
          channelId: curr.channelId,
          senderId: curr.senderId,
          senderName: curr.senderName,
          content: curr.content,
          createdAt: curr.createdAt,
          type: curr.type,
          voiceUrl: curr.voiceUrl,
          voiceDurationSec: curr.voiceDurationSec,
          giphyId: curr.giphyId,
          customStickerUrl: curr.customStickerUrl,
          attachments: curr.attachments,
          reactions: incomingReactions,
          isPinned: curr.isPinned,
          pinnedAt: curr.pinnedAt,
          replyTo: curr.replyTo,
        );
        final copied = [..._messages];
        copied[idx] = next;
        setState(() => _messages = copied);
      });
      _deletedSub = ChannelMessagesRealtimeService.deleted.listen((payload) {
        if (!mounted) return;
        final channelId = (payload['channelId'] ?? '').toString();
        if (channelId.isNotEmpty && channelId != widget.channel.id) return;
        final messageId = (payload['messageId'] ?? '').toString();
        if (messageId.isEmpty) return;
        setState(() {
          _messages = _messages.where((m) => m.id != messageId).toList();
        });
      });

      final envelope = await ChannelMessagesService.getChannelMessagesEnvelope(
        widget.channel.id,
        limit: 60,
        skip: 0,
      );
      final entries =
          (envelope['messages'] ?? envelope['items'] ?? envelope['data']) as List?;
      final loaded = (entries ?? const <dynamic>[])
          .whereType<Map>()
          .map((e) => ChannelMessage.fromJson(Map<String, dynamic>.from(e)))
          .toList();
      await ChannelMessagesService.markChannelRead(widget.channel.id);
      if (!mounted) return;
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
    setState(() => _sending = true);
    try {
      final sent = await ChannelMessagesService.sendChannelMessage(
        widget.channel.id,
        content.trim(),
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
          if (!_messages.any((m) => m.id == sent.id)) {
            _messages = [..._messages, sent];
          }
          _replyingTo = null;
        });
        _scrollToBottom();
      }
      await ChannelMessagesService.markChannelRead(widget.channel.id);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Không gửi được tin nhắn: $e')),
      );
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
        content: 'Tin nhắn thoại',
        type: 'voice',
        voiceUrl: url,
        voiceDuration: durationSec,
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Không gửi được voice message: $e')),
      );
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _pickAndUploadMedia() async {
    if (_chatBlocked) return;
    final picker = ImagePicker();
    final files = await picker.pickMultipleMedia();
    if (files.isEmpty) return;
    for (final x in files) {
      final len = await x.length();
      if (len > MessagesMediaService.maxUploadBytes) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('File quá lớn (tối đa 25MB)')),
        );
        return;
      }
    }
    if (!mounted) return;
    showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (_) => const Center(child: CircularProgressIndicator()),
    );
    try {
      for (final x in files) {
        final mime = MessagesMediaService.resolveUploadContentType(
          filePath: x.path,
          hintedContentType: x.mimeType,
        );
        final upload = await MessagesMediaService.uploadFile(
          filePath: x.path,
          contentType: mime,
        );
        final url = MessagesMediaService.pickDisplayUrl(upload);
        if (url.isEmpty) continue;
        final rt = upload['resourceType']?.toString() ?? '';
        final isVideo =
            mime.startsWith('video/') || rt == 'video' || rt.contains('video');
        final content = isVideo ? '🎬 [Video]: $url' : '📷 [Image]: $url';
        await _sendChannelMessage(
          content: content,
          attachments: [url],
        );
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    } finally {
      if (mounted) Navigator.of(context).pop();
    }
  }

  void _showPlusSheet() {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: const Color(0xFF0B1424),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(14)),
      ),
      builder: (ctx) {
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                leading: const Icon(Icons.upload_file_rounded, color: Colors.white),
                title: const Text('Upload file', style: TextStyle(color: Colors.white)),
                onTap: () {
                  Navigator.pop(ctx);
                  _pickAndUploadMedia();
                },
              ),
              ListTile(
                leading: const Icon(Icons.poll_rounded, color: Colors.white),
                title: const Text('Create poll', style: TextStyle(color: Colors.white)),
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
              title: const Text(
                'Tạo khảo sát',
                style: TextStyle(color: Colors.white),
              ),
              content: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    TextField(
                      controller: questionCtrl,
                      style: const TextStyle(color: Colors.white),
                      decoration: const InputDecoration(
                        labelText: 'Câu hỏi',
                        labelStyle: TextStyle(color: Color(0xFFB6C2DC)),
                      ),
                    ),
                    ...List.generate(optionCtrls.length, (index) {
                      return TextField(
                        controller: optionCtrls[index],
                        style: const TextStyle(color: Colors.white),
                        decoration: InputDecoration(
                          labelText: 'Phương án ${index + 1}',
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
                        label: const Text('Thêm phương án'),
                      ),
                    ),
                    DropdownButtonFormField<int>(
                      initialValue: durationHours,
                      dropdownColor: const Color(0xFF0A1737),
                      style: const TextStyle(color: Colors.white),
                      items: const [1, 3, 6, 12, 24, 48, 72, 168]
                          .map((h) => DropdownMenuItem(value: h, child: Text('$h giờ')))
                          .toList(),
                      onChanged: (v) => setLocal(() => durationHours = v ?? 24),
                      decoration: const InputDecoration(
                        labelText: 'Thời hạn',
                        labelStyle: TextStyle(color: Color(0xFFB6C2DC)),
                      ),
                    ),
                    SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      title: const Text(
                        'Cho phép chọn nhiều đáp án',
                        style: TextStyle(color: Colors.white70, fontSize: 14),
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
                  child: const Text('Hủy'),
                ),
                TextButton(
                  onPressed: () async {
                    final q = questionCtrl.text.trim();
                    final opts = optionCtrls
                        .map((e) => e.text.trim())
                        .where((e) => e.isNotEmpty)
                        .toList();
                    if (q.isEmpty || opts.length < 2) return;
                    Navigator.of(ctx).pop();
                    try {
                      if (!context.mounted) return;
                      showDialog<void>(
                        context: context,
                        barrierDismissible: false,
                        builder: (_) => const Center(
                          child: CircularProgressIndicator(),
                        ),
                      );
                      final pollId = await PollsApiService.createPoll(
                        question: q,
                        options: opts,
                        durationHours: durationHours,
                        allowMultipleAnswers: allowMulti,
                      );
                      await _sendContentMessage('📊 [Poll]: $pollId');
                    } finally {
                      if (context.mounted && Navigator.of(context).canPop()) {
                        Navigator.of(context).pop();
                      }
                    }
                  },
                  child: const Text('Tạo'),
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
      backgroundColor: const Color(0xFF0B1424),
      builder: (ctx) {
        return SafeArea(
          child: SizedBox(
            height: 320,
            child: EmojiPicker(
              textEditingController: _inputController,
              onEmojiSelected: (_, __) {},
              config: const Config(
                emojiViewConfig: EmojiViewConfig(
                  backgroundColor: Color(0xFF0B1424),
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
      backgroundColor: const Color(0xFF0B1424),
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
                  Text(group.serverName, style: const TextStyle(color: Colors.white70)),
                  const SizedBox(height: 6),
                  GridView.builder(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: group.emojis.length,
                    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
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
                                _inputController.selection = TextSelection.collapsed(
                                  offset: _inputController.text.length,
                                );
                                _serverEmojiMap[emoji.name.toLowerCase()] = emoji.imageUrl;
                                Navigator.pop(ctx);
                              },
                        child: Opacity(
                          opacity: group.locked ? 0.45 : 1,
                          child: Image.network(emoji.imageUrl, width: 24, height: 24),
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
      backgroundColor: const Color(0xFF0B1424),
      builder: (ctx) {
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                leading: const Icon(Icons.tag_faces_rounded, color: Colors.white),
                title: const Text('Unicode Emoji', style: TextStyle(color: Colors.white)),
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
                title: const Text('Server Emoji', style: TextStyle(color: Colors.white)),
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
          const SnackBar(
            content: Text(
              'Thiếu Giphy API key. Cấu hình GIPHY_API_KEY hoặc NEXT_PUBLIC_GIPHY_API_KEY.',
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
      backgroundColor: const Color(0xFF0B1424),
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
                                hintText: stickers ? 'Tìm sticker…' : 'Tìm GIF…',
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
                        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
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
                                    ? (stickers ? 'Sent a sticker' : 'Sent a GIF')
                                    : g.title.trim(),
                                type: stickers ? 'sticker' : 'gif',
                                giphyId: g.id,
                              );
                            },
                            child: ClipRRect(
                              borderRadius: BorderRadius.circular(8),
                              child: g.previewUrl.isEmpty
                                  ? Container(color: const Color(0xFF1F2D4D))
                                  : Image.network(g.previewUrl, fit: BoxFit.cover),
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
      backgroundColor: const Color(0xFF0B1424),
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
                  Text(group.serverName, style: const TextStyle(color: Colors.white70)),
                  const SizedBox(height: 6),
                  GridView.builder(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: group.stickers.length,
                    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
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
                            child: Image.network(sticker.imageUrl, fit: BoxFit.cover),
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
      backgroundColor: const Color(0xFF0B1424),
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.gif_box_outlined, color: Colors.white),
              title: const Text('Giphy Sticker', style: TextStyle(color: Colors.white)),
              onTap: () {
                Navigator.pop(ctx);
                _openGiphyPicker(stickers: true);
              },
            ),
            ListTile(
              leading: const Icon(Icons.sticky_note_2_outlined, color: Colors.white),
              title: const Text('Server Sticker', style: TextStyle(color: Colors.white)),
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

  Future<void> _showMessageActions(ChannelMessage message) async {
    final isMine = _isMine(message);
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: const Color(0xFF0B1424),
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 8),
            const Text(
              'Hành động tin nhắn',
              style: TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w700,
                fontSize: 15,
              ),
            ),
            const SizedBox(height: 10),
            ListTile(
              leading: const Icon(Icons.reply_rounded, color: Colors.white),
              title: const Text(
                'Trả lời tin nhắn',
                style: TextStyle(color: Colors.white),
              ),
              onTap: () {
                Navigator.of(ctx).pop();
                setState(() => _replyingTo = message);
              },
            ),
            ListTile(
              leading: const Icon(Icons.add_reaction_outlined, color: Colors.white),
              title: const Text(
                'Chọn emoji khác',
                style: TextStyle(color: Colors.white),
              ),
              onTap: () {
                Navigator.of(ctx).pop();
                _showCustomReactionPicker(message);
              },
            ),
            ListTile(
              leading: const Icon(Icons.push_pin_outlined, color: Colors.white),
              title: const Text(
                'Ghim tin nhắn',
                style: TextStyle(color: Colors.white),
              ),
              onTap: () async {
                Navigator.of(ctx).pop();
                await _togglePinMessage(message);
              },
            ),
            ListTile(
              leading: const Icon(Icons.delete_outline, color: Colors.redAccent),
              title: const Text(
                'Xóa tin nhắn',
                style: TextStyle(color: Colors.redAccent),
              ),
              onTap: () async {
                Navigator.of(ctx).pop();
                final deleteType = await showModalBottomSheet<String>(
                  context: context,
                  backgroundColor: const Color(0xFF0B1424),
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
                            title: const Text(
                              'Xóa ở phía tôi',
                              style: TextStyle(color: Colors.white),
                            ),
                            onTap: () => Navigator.of(dCtx).pop('for-me'),
                          ),
                          if (isMine)
                            ListTile(
                              leading: const Icon(
                                Icons.delete_forever_outlined,
                                color: Colors.redAccent,
                              ),
                              title: const Text(
                                'Thu hồi cho mọi người',
                                style: TextStyle(color: Colors.redAccent),
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
      backgroundColor: const Color(0xFF0B1424),
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
            config: const Config(
              emojiViewConfig: EmojiViewConfig(
                backgroundColor: Color(0xFF0B1424),
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
      setState(() {
        _messages = _messages.where((m) => m.id != messageId).toList();
      });
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Không thể xóa tin nhắn: $e')),
      );
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
          content: const Text('Bạn đã ghim tin nhắn'),
          action: SnackBarAction(
            label: 'Xem tất cả',
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
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Không thể ghim tin nhắn: $e')),
      );
    }
  }

  Future<void> _openVoiceRecorder() async {
    if (_chatBlocked) return;
    final status = await Permission.microphone.request();
    if (!status.isGranted) return;
    if (!mounted) return;
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: const Color(0xFF0B1424),
      builder: (ctx) => _VoiceRecordPanel(
        onSend: _sendVoiceMessage,
      ),
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
    final text = message.content.trim();
    if (message.type == 'gif' && (message.giphyId ?? '').isNotEmpty) {
      final gifUrl = 'https://media.giphy.com/media/${message.giphyId}/giphy.gif';
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
      final fromAttach = message.attachments.isNotEmpty ? message.attachments.first : '';
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
    if (message.attachments.isNotEmpty) {
      final mediaUrl = message.attachments.first;
      final lower = mediaUrl.toLowerCase();
      final looksLikeImage = lower.contains('.png') ||
          lower.contains('.jpg') ||
          lower.contains('.jpeg') ||
          lower.contains('.webp') ||
          lower.contains('.gif') ||
          lower.contains('/image/upload') ||
          lower.contains('/res.cloudinary.com/');
      if (looksLikeImage) {
        return ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: Image.network(
            mediaUrl,
            width: 220,
            height: 160,
            fit: BoxFit.cover,
            errorBuilder: (_, __, ___) =>
                Text(text, style: const TextStyle(color: Colors.white)),
          ),
        );
      }
    }
    if (text.startsWith('http://') || text.startsWith('https://')) {
      final lower = text.toLowerCase();
      final looksLikeImage = lower.contains('.png') ||
          lower.contains('.jpg') ||
          lower.contains('.jpeg') ||
          lower.contains('.webp') ||
          lower.contains('.gif') ||
          lower.contains('/image/upload') ||
          lower.contains('/res.cloudinary.com/');
      if (looksLikeImage) {
        return ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: Image.network(
            text,
            width: 220,
            height: 160,
            fit: BoxFit.cover,
            errorBuilder: (_, __, ___) =>
                Text(text, style: const TextStyle(color: Colors.white)),
          ),
        );
      }
    }
    final pollMatch = _pollRegExp.firstMatch(text);
    if (pollMatch != null) {
      final pollId = pollMatch.group(1) ?? '';
      if (pollId.isNotEmpty) return _PollMessageCard(pollId: pollId);
    }
    if (text.startsWith('🎨 [Sticker]:') || text.startsWith('🎬 [GIF]:')) {
      final mediaUrl = text.substring(text.indexOf(':') + 1).trim();
      return ClipRRect(
        borderRadius: BorderRadius.circular(8),
        child: Image.network(mediaUrl, width: 180, height: 180, fit: BoxFit.cover),
      );
    }
    if (text.startsWith('📷 [Image]:') || text.startsWith('🎬 [Video]:')) {
      final mediaUrl = text.substring(text.indexOf(':') + 1).trim();
      return ClipRRect(
        borderRadius: BorderRadius.circular(8),
        child: Image.network(mediaUrl, width: 220, height: 160, fit: BoxFit.cover),
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
    return _buildEmojiAwareText(text);
  }

  String _replyPreviewText(ChannelReplyMessage reply) {
    if ((reply.type ?? '') == 'voice') return '🔊 Tin nhắn thoại';
    if (reply.content.trim().isEmpty) return 'Tin nhắn';
    return reply.content.trim();
  }

  bool _isMine(ChannelMessage msg) {
    final me = widget.currentUserId ?? '';
    return me.isNotEmpty && msg.senderId == me;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _pageColor,
      appBar: AppBar(
        backgroundColor: _pageColor,
        elevation: 0,
        titleSpacing: 0,
        actions: [
          IconButton(
            tooltip: 'Tìm tin nhắn',
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
          const Divider(height: 1, color: _lineColor),
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
                ? const Center(
                    child: Text(
                      'Chưa có tin nhắn nào',
                      style: TextStyle(
                        color: Color(0xFFAFC0E2),
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  )
                : ListView.builder(
                    controller: _scrollController,
                    padding: const EdgeInsets.fromLTRB(12, 12, 12, 18),
                    itemCount: _messages.length,
                    itemBuilder: (context, index) {
                      final msg = _messages[index];
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
                              maxWidth: MediaQuery.sizeOf(context).width * 0.78,
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
                                  padding: const EdgeInsets.only(bottom: 4),
                                  child: Text(
                                    msg.senderName.isEmpty
                                        ? 'Thành viên'
                                        : msg.senderName,
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
                                  margin: const EdgeInsets.only(bottom: 6),
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 8,
                                    vertical: 6,
                                  ),
                                  decoration: BoxDecoration(
                                    color: Colors.black.withValues(alpha: 0.14),
                                    borderRadius: BorderRadius.circular(8),
                                  ),
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        msg.replyTo?.senderName?.isNotEmpty == true
                                            ? msg.replyTo!.senderName!
                                            : 'Đang trả lời',
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
                                          padding: const EdgeInsets.symmetric(
                                            horizontal: 7,
                                            vertical: 3,
                                          ),
                                          decoration: BoxDecoration(
                                            color: Colors.black.withValues(
                                              alpha: 0.16,
                                            ),
                                            borderRadius: BorderRadius.circular(
                                              10,
                                            ),
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
              child: Text(
                'Bạn chưa thể chat trong kênh này${(_chatBlockReason ?? '').isNotEmpty ? ' (${_chatBlockReason!})' : ''}.',
                style: const TextStyle(
                  color: Color(0xFFFFB2BE),
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
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
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
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
                              const Text(
                                'Đang trả lời',
                                style: TextStyle(
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
                                          ? '🔊 Tin nhắn thoại'
                                          : 'Tin nhắn'),
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
                          icon: const Icon(Icons.close_rounded, color: Colors.white70),
                        ),
                      ],
                    ),
                  ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(6, 4, 6, 6),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                IconButton(
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(minWidth: 40, minHeight: 44),
                  onPressed: _showPlusSheet,
                  icon: const Icon(Icons.add, color: Color(0xFFB6C2DC), size: 26),
                ),
                Expanded(
                  child: Container(
                    constraints: const BoxConstraints(minHeight: 44),
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    decoration: BoxDecoration(
                      color: const Color(0xFF2C3A5A),
                      borderRadius: BorderRadius.circular(22),
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          child: TextField(
                            controller: _inputController,
                            minLines: 1,
                            maxLines: 4,
                            onSubmitted: (_) => _sendText(),
                            enabled: !_chatBlocked,
                            style: const TextStyle(color: Colors.white, fontSize: 14),
                            decoration: InputDecoration(
                              isDense: true,
                              contentPadding: const EdgeInsets.symmetric(
                                horizontal: 12,
                                vertical: 10,
                              ),
                              hintText: _chatBlocked
                                  ? 'Kênh đang bị giới hạn chat'
                                  : 'Nhắn tin trong #${widget.channel.name}',
                              hintStyle: const TextStyle(
                                color: Color(0xFF8A98B8),
                                fontSize: 14,
                              ),
                              border: InputBorder.none,
                              suffixIcon: IconButton(
                                padding: const EdgeInsets.only(right: 4),
                                constraints: const BoxConstraints(),
                                icon: const Icon(
                                  Icons.tag_faces_rounded,
                                  color: Color(0xFFB6C2DC),
                                  size: 22,
                                ),
                                onPressed: _showEmojiPicker,
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      IconButton(
                        padding: EdgeInsets.zero,
                        constraints: const BoxConstraints(minWidth: 40, minHeight: 44),
                        onPressed: _openVoiceRecorder,
                        icon: const Icon(
                          Icons.mic_none_rounded,
                          color: Color(0xFFB6C2DC),
                          size: 24,
                        ),
                      ),
                      TextButton(
                        onPressed: () => _openGiphyPicker(stickers: false),
                        child: const Text(
                          'GIF',
                          style: TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w800,
                            fontSize: 13,
                          ),
                        ),
                      ),
                      IconButton(
                        padding: EdgeInsets.zero,
                        constraints: const BoxConstraints(minWidth: 40, minHeight: 44),
                        onPressed: _showStickerPickerMenu,
                        icon: const Icon(
                          Icons.sticky_note_2_outlined,
                          color: Color(0xFFB6C2DC),
                          size: 22,
                        ),
                      ),
                      Padding(
                        padding: const EdgeInsets.only(left: 2, bottom: 2),
                        child: Material(
                          color: const Color(0xFF6C5CE7),
                          shape: const CircleBorder(),
                          child: InkWell(
                            customBorder: const CircleBorder(),
                            onTap: (!_chatBlocked && !_sending) ? _sendText : null,
                            child: Padding(
                              padding: const EdgeInsets.all(8),
                              child: _sending
                                  ? const SizedBox(
                                      width: 16,
                                      height: 16,
                                      child: CircularProgressIndicator(strokeWidth: 2),
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
        ],
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
    final path = '${dir.path}/voice_${DateTime.now().millisecondsSinceEpoch}.m4a';
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
            _recording ? 'Đang ghi… ${secs}s' : 'Tin nhắn thoại',
            style: const TextStyle(color: Colors.white, fontSize: 16),
          ),
          const SizedBox(height: 16),
          if (!_recording)
            FilledButton.icon(
              onPressed: _busy ? null : _start,
              icon: const Icon(Icons.mic),
              label: const Text('Bắt đầu ghi'),
            )
          else
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [
                OutlinedButton(
                  onPressed: _busy ? null : _cancel,
                  child: const Text('Hủy'),
                ),
                FilledButton(
                  onPressed: _busy ? null : _send,
                  child: _busy
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Text('Gửi'),
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
                const Text(
                  'Tin nhắn thoại',
                  style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
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

  @override
  void initState() {
    super.initState();
    _loadPoll();
  }

  Future<void> _loadPoll() async {
    final rs = await PollsApiService.getPollResults(widget.pollId);
    final my = await PollsApiService.getMyVote(widget.pollId);
    if (!mounted) return;
    setState(() {
      _pollData = rs;
      _selectedOptions = my;
      _hasVoted = my.isNotEmpty;
      _showResults = my.isNotEmpty;
    });
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
      return const Text('Đang tải khảo sát...', style: TextStyle(color: Colors.white70));
    }
    final options = (data['options'] as List?)?.map((e) => '$e').toList() ?? [];
    final allowMultiple = data['allowMultipleAnswers'] == true;
    final results =
        (data['results'] as List?)?.map((e) => Map<String, dynamic>.from(e as Map)).toList() ??
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
              final percentage =
                  (i < results.length) ? ((results[i]['percentage'] as num?)?.toDouble() ?? 0) : 0;
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
                          style: const TextStyle(color: Color(0xFFB5BAC1), fontSize: 12),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    LinearProgressIndicator(
                      value: (percentage / 100).clamp(0, 1),
                      minHeight: 6,
                      backgroundColor: const Color(0xFF1E1F22),
                      valueColor: const AlwaysStoppedAnimation(Color(0xFF6C5CE7)),
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
                            _selectedOptions = _selectedOptions.where((e) => e != i).toList();
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
                      child: Text(options[i], style: const TextStyle(color: Colors.white)),
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
                  child: const Text('Xem kết quả'),
                ),
              if (!_hasVoted && !_showResults)
                FilledButton(
                  onPressed: _selectedOptions.isEmpty || _submitting ? null : _vote,
                  child: const Text('Bình chọn'),
                ),
            ],
          ),
        ],
      ),
    );
  }
}
