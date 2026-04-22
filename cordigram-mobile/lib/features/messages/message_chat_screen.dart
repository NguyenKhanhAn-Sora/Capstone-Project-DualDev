import 'dart:async';

import 'package:emoji_picker_flutter/emoji_picker_flutter.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path_provider/path_provider.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:record/record.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';

import '../../../core/config/app_config.dart';
import 'messages_controller.dart';
import 'services/direct_messages_realtime_service.dart';
import 'services/direct_messages_service.dart';
import 'models/dm_message.dart';
import 'models/message_thread.dart';
import 'services/dm_livekit_service.dart';
import 'services/giphy_search_service.dart';
import 'services/messages_media_service.dart';
import 'services/polls_api_service.dart';
import 'services/server_media_service.dart';
import '../../../core/services/auth_storage.dart';

class MessageChatScreen extends StatefulWidget {
  const MessageChatScreen({
    super.key,
    required this.thread,
    required this.controller,
  });

  final MessageThread thread;
  final MessagesController controller;

  @override
  State<MessageChatScreen> createState() => _MessageChatScreenState();
}

class _MessageChatScreenState extends State<MessageChatScreen> {
  static const Color _pageColor = Color(0xFF08183A);
  static final RegExp _inviteRegExp = RegExp(
    r'https?://(?:www\.)?cordigram\.com/invite/server/([a-fA-F0-9]{24})',
  );
  static final RegExp _serverEmojiTokenRegExp = RegExp(
    r':([a-zA-Z0-9_]{1,80}):',
  );
  static final RegExp _pollRegExp = RegExp(r'📊 \[Poll\]:\s*([a-fA-F0-9]{24})');
  final TextEditingController _inputController = TextEditingController();
  bool _loading = true;
  List<DmMessage> _messages = const [];
  Timer? _typingTimer;
  bool _typingOn = false;
  final Map<String, String> _serverEmojiMap = {};
  String _lang = 'vi';
  StreamSubscription<DmCallEvent>? _callSub;
  StreamSubscription<String>? _callEndSub;
  bool _showOutgoingCall = false;
  bool _outgoingVideo = false;
  String _outgoingStatus = 'calling';
  bool _showIncomingCall = false;
  String _incomingCallerName = '';
  String? _incomingCallerAvatar;
  bool _incomingVideo = false;
  Uri? _activeCallUri;
  String _activeCallTitle = 'Voice call';
  bool _callScreenOpen = false;

  @override
  void initState() {
    super.initState();
    widget.controller.addListener(_onControllerChanged);
    _inputController.addListener(_onInputChanged);
    _loadConversation();
    _loadLanguage();
    _bindCallRealtime();
    widget.controller.markConversationRead(widget.thread.id);
  }

  @override
  void dispose() {
    _typingTimer?.cancel();
    _callSub?.cancel();
    _callEndSub?.cancel();
    _flushTyping(false);
    _inputController.removeListener(_onInputChanged);
    widget.controller.removeListener(_onControllerChanged);
    _inputController.dispose();
    super.dispose();
  }

  Future<void> _loadConversation() async {
    setState(() => _loading = true);
    try {
      await widget.controller.getConversation(widget.thread.id);
      if (!mounted) return;
      setState(() {
        _messages = widget.controller.liveMessages(widget.thread.id);
      });
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  Future<void> _loadLanguage() async {
    try {
      final code = await DirectMessagesService.getCurrentLanguageCode();
      if (!mounted) return;
      setState(() => _lang = code);
    } catch (_) {}
  }

  String _t(String key) {
    const vi = <String, String>{
      'poll.loading': 'Đang tải khảo sát...',
      'poll.selectOne': 'Chọn một phương án',
      'poll.selectMany': 'Chọn một hoặc nhiều phương án',
      'poll.showResults': 'Xem kết quả',
      'poll.vote': 'Bình chọn',
      'poll.voted': 'Đã bình chọn',
      'poll.votesHours': '{votes} lượt • còn {hours} giờ',
      'poll.voteError': 'Không gửi được bình chọn',
      'poll.createTitle': 'Tạo khảo sát',
      'poll.question': 'Câu hỏi',
      'poll.option': 'Phương án',
      'poll.addOption': 'Thêm phương án',
      'poll.duration': 'Thời hạn',
      'poll.multi': 'Cho phép chọn nhiều đáp án',
      'poll.cancel': 'Hủy',
      'poll.create': 'Tạo',
      'poll.needQuestion': 'Vui lòng nhập câu hỏi',
      'poll.need2Options': 'Cần ít nhất 2 phương án trả lời',
    };
    const en = <String, String>{
      'poll.loading': 'Loading poll...',
      'poll.selectOne': 'Choose one option',
      'poll.selectMany': 'Choose one or more options',
      'poll.showResults': 'Show results',
      'poll.vote': 'Vote',
      'poll.voted': 'Voted',
      'poll.votesHours': '{votes} votes • {hours} hours left',
      'poll.voteError': 'Failed to submit vote',
      'poll.createTitle': 'Create poll',
      'poll.question': 'Question',
      'poll.option': 'Option',
      'poll.addOption': 'Add option',
      'poll.duration': 'Duration',
      'poll.multi': 'Allow multiple answers',
      'poll.cancel': 'Cancel',
      'poll.create': 'Create',
      'poll.needQuestion': 'Please enter a question',
      'poll.need2Options': 'At least 2 options are required',
    };
    final dict = _lang == 'en' ? en : vi;
    return dict[key] ?? key;
  }

  String _tf(String key, Map<String, String> vars) {
    var v = _t(key);
    vars.forEach((k, value) {
      v = v.replaceAll('{$k}', value);
    });
    return v;
  }

  void _onControllerChanged() {
    if (!mounted) return;
    setState(() {
      _messages = widget.controller.liveMessages(widget.thread.id);
    });
  }

  void _onInputChanged() {
    setState(() {});
    final text = _inputController.text;
    if (text.isNotEmpty) {
      if (!_typingOn) {
        _typingOn = true;
        DirectMessagesRealtimeService.setTyping(
          toUserId: widget.thread.id,
          isTyping: true,
        );
      }
      _typingTimer?.cancel();
      _typingTimer = Timer(
        const Duration(seconds: 2),
        () => _flushTyping(false),
      );
    } else {
      _flushTyping(false);
    }
  }

  void _flushTyping(bool typing) {
    _typingTimer?.cancel();
    if (_typingOn != typing && typing == false) {
      DirectMessagesRealtimeService.setTyping(
        toUserId: widget.thread.id,
        isTyping: false,
      );
    }
    _typingOn = typing;
  }

  Future<void> _sendTextMessage() async {
    final text = _inputController.text.trim();
    if (text.isEmpty) return;
    _inputController.clear();
    _flushTyping(false);
    await widget.controller.sendTextMessage(
      userId: widget.thread.id,
      content: text,
    );
  }

  Future<void> _onStartCall({required bool video}) async {
    try {
      await _ensureCallPermissions(video: video);
      setState(() {
        _showOutgoingCall = true;
        _outgoingVideo = video;
        _outgoingStatus = 'calling';
      });
      DirectMessagesRealtimeService.initiateCall(
        receiverId: widget.thread.id,
        isVideo: video,
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
      setState(() {
        _showOutgoingCall = false;
      });
    }
  }

  void _bindCallRealtime() {
    _callSub = DirectMessagesRealtimeService.callEvents.listen((event) async {
      if (!mounted) return;
      if (event.signal == 'incoming' && event.fromUserId == widget.thread.id) {
        setState(() {
          _showIncomingCall = true;
          _incomingVideo = event.type == 'video';
          _incomingCallerName =
              (event.callerInfo?['displayName'] ??
                      event.callerInfo?['username'] ??
                      widget.thread.name)
                  .toString();
          _incomingCallerAvatar = event.callerInfo?['avatar']?.toString();
        });
      } else if (event.signal == 'answer' &&
          event.fromUserId == widget.thread.id) {
        final roomName = event.payload?['sdpOffer']?['roomName']?.toString();
        if (roomName != null &&
            roomName.isNotEmpty &&
            _activeCallUri == null) {
          await _openInAppCall(
            roomName: roomName,
            video: _outgoingVideo || event.type == 'video',
          );
        }
      } else if (event.signal == 'rejected' &&
          _showOutgoingCall &&
          event.fromUserId == widget.thread.id) {
        setState(() {
          _outgoingStatus = 'rejected';
        });
      }
    });

    _callEndSub = DirectMessagesRealtimeService.callEnded.listen((from) {
      if (!mounted || from != widget.thread.id) return;
      setState(() {
        _showIncomingCall = false;
        _showOutgoingCall = false;
        _activeCallUri = null;
        _callScreenOpen = false;
      });
    });
  }

  Future<void> _acceptIncomingCall() async {
    await _ensureCallPermissions(video: _incomingVideo);
    final roomName = await DmLiveKitService.getDmRoomName(widget.thread.id);
    DirectMessagesRealtimeService.answerCall(widget.thread.id, {
      'roomName': roomName,
    });
    await _openInAppCall(roomName: roomName, video: _incomingVideo);
  }

  void _rejectIncomingCall() {
    DirectMessagesRealtimeService.rejectCall(widget.thread.id);
    setState(() => _showIncomingCall = false);
  }

  Future<void> _openInAppCall({
    required String roomName,
    required bool video,
  }) async {
    if ((AuthStorage.accessToken ?? '').isEmpty) {
      await AuthStorage.loadAll();
    }
    final participantName = widget.controller.myUsername?.isNotEmpty == true
        ? widget.controller.myUsername!
        : (widget.controller.myDisplayName?.isNotEmpty == true
              ? widget.controller.myDisplayName!
              : 'Người dùng');
    final liveKit = await DmLiveKitService.getLiveKitToken(
      roomName: roomName,
      participantName: participantName,
    );
    final liveKitToken = liveKit['token'] ?? '';
    final liveKitUrl = liveKit['url'] ?? '';
    final uri = Uri.parse(
      '${AppConfig.webBaseUrl}/call?roomName=${Uri.encodeComponent(roomName)}'
      '&participantName=${Uri.encodeComponent(participantName)}'
      '&audioOnly=${!video}'
      '&embedded=1'
      '&lkToken=${Uri.encodeComponent(liveKitToken)}'
      '&lkUrl=${Uri.encodeComponent(liveKitUrl)}',
    );
    if (!mounted) return;
    setState(() {
      _showIncomingCall = false;
      _showOutgoingCall = false;
      _activeCallUri = uri;
      _activeCallTitle = video ? 'Video call' : 'Voice call';
    });
    _openDedicatedCallScreen();
  }

  Future<void> _openDedicatedCallScreen() async {
    if (_activeCallUri == null || _callScreenOpen || !mounted) return;
    setState(() => _callScreenOpen = true);
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => _DedicatedCallScreen(
          callUri: _activeCallUri!,
          title: _activeCallTitle,
          onHangup: () async {
            DirectMessagesRealtimeService.endCall(widget.thread.id);
            await Future<void>.delayed(const Duration(milliseconds: 120));
            if (!mounted) return;
            setState(() {
              _activeCallUri = null;
            });
          },
        ),
      ),
    );
    if (!mounted) return;
    setState(() => _callScreenOpen = false);
  }

  Future<void> _ensureCallPermissions({required bool video}) async {
    final mic = await Permission.microphone.request();
    if (!mic.isGranted) {
      throw Exception('Microphone permission is required for calls');
    }
    if (video) {
      final camera = await Permission.camera.request();
      if (!camera.isGranted) {
        throw Exception('Camera permission is required for video calls');
      }
    }
  }

  Future<void> _pickAndUploadMedia() async {
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
        final path = x.path;
        final mime = MessagesMediaService.resolveUploadContentType(
          filePath: path,
          hintedContentType: x.mimeType,
        );
        await widget.controller.sendUploadedImageOrVideo(
          peerUserId: widget.thread.id,
          filePath: path,
          mimeType: mime,
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('$e')));
      }
    } finally {
      if (mounted) Navigator.of(context).pop();
    }
  }

  Future<void> _showCreatePollDialog() async {
    final questionCtrl = TextEditingController();
    final optionCtrls = <TextEditingController>[
      TextEditingController(),
      TextEditingController(),
    ];
    var durationHours = 24;
    var allowMulti = false;
    var submitting = false;

    Future<void> submitPoll(StateSetter setLocal, BuildContext dialogCtx) async {
      final question = questionCtrl.text.trim();
      final validOptions = optionCtrls
          .map((e) => e.text.trim())
          .where((e) => e.isNotEmpty)
          .toList();

      if (question.isEmpty) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(_t('poll.needQuestion'))),
        );
        return;
      }
      if (validOptions.length < 2) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(_t('poll.need2Options'))),
        );
        return;
      }
      if (submitting) return;
      setLocal(() => submitting = true);

      Navigator.of(dialogCtx).pop();
      if (!mounted) return;
      showDialog<void>(
        context: context,
        barrierDismissible: false,
        builder: (_) => const Center(child: CircularProgressIndicator()),
      );

      try {
        final pollId = await PollsApiService.createPoll(
          question: question,
          options: validOptions,
          durationHours: durationHours,
          allowMultipleAnswers: allowMulti,
        );
        await widget.controller.sendPollCreatedMessage(
          peerUserId: widget.thread.id,
          pollId: pollId,
        );
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('$e')),
          );
        }
      } finally {
        if (mounted && Navigator.of(context).canPop()) {
          Navigator.of(context).pop();
        }
      }
    }

    if (!mounted) return;
    await showDialog<void>(
      context: context,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (dialogContext, setLocal) {
            return AlertDialog(
              backgroundColor: const Color(0xFF0A1737),
              title: Text(
                _t('poll.createTitle'),
                style: const TextStyle(color: Colors.white),
              ),
              content: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    TextField(
                      controller: questionCtrl,
                      maxLength: 300,
                      style: const TextStyle(color: Colors.white),
                      decoration: InputDecoration(
                        labelText: _t('poll.question'),
                        labelStyle: const TextStyle(color: Color(0xFFB6C2DC)),
                      ),
                    ),
                    ...List.generate(optionCtrls.length, (index) {
                      return Padding(
                        padding: const EdgeInsets.only(top: 6),
                        child: Row(
                          children: [
                            Expanded(
                              child: TextField(
                                controller: optionCtrls[index],
                                maxLength: 120,
                                style: const TextStyle(color: Colors.white),
                                decoration: InputDecoration(
                                  labelText: '${_t('poll.option')} ${index + 1}',
                                  labelStyle: const TextStyle(
                                    color: Color(0xFFB6C2DC),
                                  ),
                                ),
                              ),
                            ),
                            if (optionCtrls.length > 2)
                              IconButton(
                                onPressed: submitting
                                    ? null
                                    : () {
                                        setLocal(() {
                                          final ctrl = optionCtrls.removeAt(index);
                                          ctrl.dispose();
                                        });
                                      },
                                icon: const Icon(
                                  Icons.close_rounded,
                                  color: Color(0xFFB6C2DC),
                                ),
                              ),
                          ],
                        ),
                      );
                    }),
                    Align(
                      alignment: Alignment.centerLeft,
                      child: TextButton.icon(
                        onPressed: submitting || optionCtrls.length >= 10
                            ? null
                            : () {
                                setLocal(() {
                                  optionCtrls.add(TextEditingController());
                                });
                              },
                        icon: const Icon(Icons.add),
                        label: Text(_t('poll.addOption')),
                      ),
                    ),
                    DropdownButtonFormField<int>(
                      initialValue: durationHours,
                      dropdownColor: const Color(0xFF0A1737),
                      style: const TextStyle(color: Colors.white),
                      items: const [1, 3, 6, 12, 24, 48, 72, 168]
                          .map(
                            (h) => DropdownMenuItem<int>(
                              value: h,
                              child: Text('$h giờ'),
                            ),
                          )
                          .toList(),
                      onChanged: submitting
                          ? null
                          : (v) => setLocal(() => durationHours = v ?? 24),
                      decoration: InputDecoration(
                        labelText: _t('poll.duration'),
                        labelStyle: const TextStyle(color: Color(0xFFB6C2DC)),
                      ),
                    ),
                    SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(
                        _t('poll.multi'),
                        style: const TextStyle(color: Colors.white70, fontSize: 14),
                      ),
                      value: allowMulti,
                      onChanged: submitting
                          ? null
                          : (v) => setLocal(() => allowMulti = v),
                    ),
                  ],
                ),
              ),
              actions: [
                TextButton(
                  onPressed: submitting ? null : () => Navigator.of(ctx).pop(),
                  child: Text(_t('poll.cancel')),
                ),
                TextButton(
                  onPressed: submitting
                      ? null
                      : () => submitPoll(setLocal, dialogContext),
                  child: submitting
                      ? const SizedBox(
                          width: 14,
                          height: 14,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : Text(_t('poll.create')),
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
                leading: const Icon(
                  Icons.upload_file_rounded,
                  color: Colors.white,
                ),
                title: const Text(
                  'Upload file',
                  style: TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w600,
                  ),
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
                  style: TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w600,
                  ),
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

  /// Same role as web `GiphyPicker` emoji tab (`emoji-picker-react`): full grid + categories + search.
  void _showUnicodeEmojiPicker() {
    final viewH = (MediaQuery.sizeOf(context).height * 0.44).clamp(
      280.0,
      520.0,
    );
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF0B1424),
      builder: (ctx) {
        final emojiPickerHeight = viewH - 48;
        return SafeArea(
          child: SizedBox(
            height: viewH,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                SizedBox(
                  height: 44,
                  child: Row(
                    children: [
                      const SizedBox(width: 12),
                      const Text(
                        'Emoji',
                        style: TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w600,
                          fontSize: 16,
                        ),
                      ),
                      const Spacer(),
                      IconButton(
                        icon: const Icon(
                          Icons.close_rounded,
                          color: Colors.white70,
                        ),
                        onPressed: () => Navigator.pop(ctx),
                      ),
                    ],
                  ),
                ),
                Expanded(
                  child: EmojiPicker(
                    textEditingController: _inputController,
                    onEmojiSelected: (_, __) {},
                    config: Config(
                      height: emojiPickerHeight,
                      locale: const Locale('en'),
                      emojiViewConfig: const EmojiViewConfig(
                        backgroundColor: Color(0xFF0B1424),
                      ),
                      categoryViewConfig: const CategoryViewConfig(
                        initCategory: Category.SMILEYS,
                        backgroundColor: Color(0xFF121e36),
                        indicatorColor: Color(0xFF6C5CE7),
                        iconColor: Color(0xFF8A98B8),
                        iconColorSelected: Colors.white,
                        backspaceColor: Color(0xFFB6C2DC),
                        dividerColor: Color(0xFF233358),
                      ),
                      bottomActionBarConfig: const BottomActionBarConfig(
                        backgroundColor: Color(0xFF121e36),
                        buttonColor: Color(0xFF2C3A5A),
                        buttonIconColor: Colors.white,
                      ),
                      searchViewConfig: SearchViewConfig(
                        backgroundColor: const Color(0xFF121e36),
                        buttonIconColor: const Color(0xFFB6C2DC),
                        hintTextStyle: const TextStyle(
                          color: Color(0xFF8A98B8),
                        ),
                        inputTextStyle: const TextStyle(color: Colors.white),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
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

  Future<void> _openServerEmojiPicker() async {
    List<ServerEmojiGroup> groups;
    try {
      groups = await ServerMediaService.getEmojiPickerGroups();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('$e')));
      }
      return;
    }
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
                const Text(
                  'Server Emoji',
                  style: TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w700,
                    fontSize: 16,
                  ),
                ),
                const SizedBox(height: 8),
                for (final group in groups) ...[
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          group.serverName,
                          style: const TextStyle(
                            color: Colors.white70,
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                      if (group.locked)
                        const Icon(
                          Icons.lock_rounded,
                          color: Color(0xFF8A98B8),
                          size: 16,
                        ),
                    ],
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
                          child: Container(
                            decoration: BoxDecoration(
                              color: const Color(0xFF1F2D4D),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            alignment: Alignment.center,
                            child: Image.network(
                              emoji.imageUrl,
                              width: 24,
                              height: 24,
                              errorBuilder: (_, __, ___) => const Icon(
                                Icons.sentiment_satisfied_alt_rounded,
                                size: 16,
                                color: Color(0xFFB6C2DC),
                              ),
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

  Future<void> _openGiphyPicker({required bool stickers}) async {
    if (AppConfig.giphyApiKey.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Thiếu Giphy API key. Dán NEXT_PUBLIC_GIPHY_API_KEY vào assets/env/.env '
            '(cùng tên biến như cordigram-web), hoặc chạy với '
            '--dart-define=NEXT_PUBLIC_GIPHY_API_KEY=... / --dart-define=GIPHY_API_KEY=...',
          ),
        ),
      );
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
                                hintText: stickers
                                    ? 'Tìm sticker…'
                                    : 'Tìm GIF…',
                                hintStyle: const TextStyle(
                                  color: Color(0xFF8A98B8),
                                ),
                                filled: true,
                                fillColor: const Color(0xFF1F2D4D),
                                border: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(12),
                                  borderSide: BorderSide.none,
                                ),
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
                              await widget.controller.sendGiphyMessage(
                                peerUserId: widget.thread.id,
                                giphyId: g.id,
                                mediaType: stickers ? 'sticker' : 'gif',
                                title: g.title,
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
    List<ServerStickerGroup> groups;
    try {
      groups = await ServerMediaService.getStickerPickerGroups();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('$e')));
      }
      return;
    }
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
                const Text(
                  'Server Sticker',
                  style: TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w700,
                    fontSize: 16,
                  ),
                ),
                const SizedBox(height: 8),
                for (final group in groups) ...[
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          group.serverName,
                          style: const TextStyle(
                            color: Colors.white70,
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                      if (group.locked)
                        const Icon(
                          Icons.lock_rounded,
                          color: Color(0xFF8A98B8),
                          size: 16,
                        ),
                    ],
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
                                await widget.controller.sendTextMessage(
                                  userId: widget.thread.id,
                                  content: '🎨 [Sticker]: ${sticker.imageUrl}',
                                );
                              },
                        child: Opacity(
                          opacity: group.locked ? 0.45 : 1,
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(8),
                            child: Image.network(
                              sticker.imageUrl,
                              fit: BoxFit.cover,
                              errorBuilder: (_, __, ___) => Container(
                                color: const Color(0xFF1F2D4D),
                                alignment: Alignment.center,
                                child: const Icon(
                                  Icons.sticky_note_2_outlined,
                                  color: Color(0xFFB6C2DC),
                                ),
                              ),
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
      backgroundColor: const Color(0xFF0B1424),
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.gif_box_outlined, color: Colors.white),
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
              leading: const Icon(
                Icons.sticky_note_2_outlined,
                color: Colors.white,
              ),
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

  Future<void> _openVoiceRecorder() async {
    final status = await Permission.microphone.request();
    if (!status.isGranted) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Cần quyền microphone để ghi âm')),
      );
      return;
    }

    if (!mounted) return;
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: const Color(0xFF0B1424),
      builder: (ctx) => _VoiceRecordPanel(
        peerUserId: widget.thread.id,
        controller: widget.controller,
      ),
    );
  }

  Future<void> _showHamburgerMenu() async {
    await showDialog<void>(
      context: context,
      barrierColor: Colors.black.withValues(alpha: 0.2),
      builder: (dialogContext) {
        return Dialog(
          backgroundColor: Colors.transparent,
          insetPadding: const EdgeInsets.symmetric(horizontal: 16),
          child: Material(
            color: Colors.transparent,
            child: Container(
              width: 350,
              decoration: BoxDecoration(
                color: const Color(0xFF0A1737),
                border: Border.all(color: const Color(0xFF5D6B87)),
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 10,
                    ),
                    child: Container(
                      height: 34,
                      alignment: Alignment.centerLeft,
                      padding: const EdgeInsets.symmetric(horizontal: 14),
                      decoration: BoxDecoration(
                        color: const Color(0xFF1F2D4D),
                        borderRadius: BorderRadius.circular(18),
                      ),
                      child: const Text(
                        'Tìm kiếm cuộc trò chuyện',
                        style: TextStyle(
                          color: Color(0xFFD9E1F3),
                          fontSize: 14,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
                  ),
                  _MenuActionRow(
                    title: 'Tắt thông báo tin nhắn',
                    onTap: () {
                      Navigator.of(dialogContext).pop();
                      final muted = widget.controller.isConversationMuted(
                        widget.thread.id,
                      );
                      widget.controller.setConversationMuted(
                        widget.thread.id,
                        !muted,
                      );
                    },
                  ),
                  _MenuActionRow(
                    title: 'Chặn',
                    onTap: () {
                      Navigator.of(dialogContext).pop();
                      widget.controller.blockUser(widget.thread.id);
                    },
                  ),
                  _MenuActionRow(
                    title: 'Cảm xúc nhanh',
                    onTap: () {
                      Navigator.of(dialogContext).pop();
                      _showQuickReactionSheet();
                    },
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  Future<void> _showQuickReactionSheet() async {
    const reactions = ['👍', '❤️', '😂', '😮', '😢', '😡'];
    await showDialog<void>(
      context: context,
      barrierColor: Colors.black.withValues(alpha: 0.3),
      builder: (dialogContext) {
        return Dialog(
          backgroundColor: Colors.transparent,
          insetPadding: const EdgeInsets.symmetric(horizontal: 14),
          child: Container(
            width: 360,
            height: 420,
            decoration: BoxDecoration(
              color: const Color(0xFF0A1737),
              border: Border.all(color: const Color(0xFF5D6B87)),
            ),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Expanded(
                        child: Text(
                          'Cảm xúc nhanh',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 17,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                      InkWell(
                        onTap: () => Navigator.of(dialogContext).pop(),
                        child: const Icon(
                          Icons.close_rounded,
                          color: Color(0xFF32446D),
                          size: 26,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  Container(
                    height: 32,
                    decoration: BoxDecoration(
                      color: const Color(0xFF2A3859),
                      borderRadius: BorderRadius.circular(16),
                    ),
                  ),
                  const SizedBox(height: 14),
                  const Text(
                    'Icon Category',
                    style: TextStyle(
                      color: Color(0xFFD9E1F3),
                      fontSize: 14,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  const SizedBox(height: 10),
                  Expanded(
                    child: Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        border: Border.all(color: const Color(0xFF5D6B87)),
                      ),
                      child: GridView.builder(
                        itemCount: reactions.length,
                        gridDelegate:
                            const SliverGridDelegateWithFixedCrossAxisCount(
                              crossAxisCount: 5,
                              mainAxisSpacing: 8,
                              crossAxisSpacing: 8,
                            ),
                        itemBuilder: (context, index) {
                          final emoji = reactions[index];
                          return InkWell(
                            onTap: () async {
                              Navigator.of(dialogContext).pop();
                              if (_messages.isEmpty) return;
                              await widget.controller.addReaction(
                                messageId: _messages.last.id,
                                emoji: emoji,
                              );
                            },
                            child: Center(
                              child: Text(
                                emoji,
                                style: const TextStyle(fontSize: 24),
                              ),
                            ),
                          );
                        },
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  String _normalizedText(DmMessage message) {
    switch (message.type) {
      case 'gif':
        return message.content.isNotEmpty ? message.content : '🎬 GIF';
      case 'sticker':
        return message.content.isNotEmpty ? message.content : '🎨 Sticker';
      case 'voice':
        return message.content.isNotEmpty
            ? message.content
            : '🔊 Tin nhắn thoại';
      default:
        return message.content;
    }
  }

  String? _extractInviteUrl(String text) {
    final match = _inviteRegExp.firstMatch(text);
    return match?.group(0);
  }

  String? _extractInviteServerId(String text) {
    final match = _inviteRegExp.firstMatch(text);
    return match?.group(1);
  }

  Widget _buildEmojiAwareText(String text) {
    final spans = <InlineSpan>[];
    int cursor = 0;
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
              child: Image.network(
                img,
                width: 20,
                height: 20,
                errorBuilder: (_, __, ___) => Text(
                  m.group(0) ?? '',
                  style: const TextStyle(color: Colors.white),
                ),
              ),
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

  Widget _buildMessageContent(DmMessage message) {
    final text = _normalizedText(message).trim();
    final pollMatch = _pollRegExp.firstMatch(text);
    final inviteUrl = _extractInviteUrl(text);
    final inviteServerId = _extractInviteServerId(text);

    if (pollMatch != null) {
      final pollId = pollMatch.group(1) ?? '';
      if (pollId.isNotEmpty) {
        return _PollMessageCard(
          pollId: pollId,
          t: _t,
          tf: _tf,
        );
      }
    }

    if (text.startsWith('🎨 [Sticker]:')) {
      final stickerUrl = text.replaceFirst('🎨 [Sticker]:', '').trim();
      return ClipRRect(
        borderRadius: BorderRadius.circular(8),
        child: Image.network(
          stickerUrl,
          width: 180,
          height: 180,
          fit: BoxFit.cover,
          errorBuilder: (_, __, ___) =>
              Text(text, style: const TextStyle(color: Colors.white)),
        ),
      );
    }

    if (text.startsWith('📷 [Image]:') || text.startsWith('🎬 [Video]:')) {
      final mediaUrl = text.substring(text.indexOf(':') + 1).trim();
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

    if (inviteUrl != null && inviteServerId != null) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(inviteUrl, style: const TextStyle(color: Color(0xFF62B4FF))),
          const SizedBox(height: 6),
          _ServerInviteCard(inviteUrl: inviteUrl, serverId: inviteServerId),
        ],
      );
    }

    return _buildEmojiAwareText(text);
  }

  @override
  Widget build(BuildContext context) {
    final nameLetter = widget.thread.name.trim().isNotEmpty
        ? widget.thread.name.trim().substring(0, 1).toUpperCase()
        : 'U';
    final myId = widget.controller.myUserId;

    return Scaffold(
      backgroundColor: _pageColor,
      appBar: AppBar(
        backgroundColor: _pageColor,
        elevation: 0,
        scrolledUnderElevation: 0,
        surfaceTintColor: Colors.transparent,
        leadingWidth: 210,
        leading: InkWell(
          onTap: () => Navigator.of(context).pop(),
          child: Padding(
            padding: const EdgeInsets.only(left: 10),
            child: Row(
              children: [
                const Icon(
                  Icons.arrow_back_rounded,
                  color: Colors.white,
                  size: 18,
                ),
                const SizedBox(width: 8),
                Stack(
                  clipBehavior: Clip.none,
                  children: [
                    CircleAvatar(
                      radius: 10,
                      backgroundColor: const Color(0xFFDDDDDD),
                      child: Text(
                        nameLetter,
                        style: const TextStyle(
                          color: Color(0xFF1B2A4A),
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                    const Positioned(
                      right: -1,
                      bottom: -1,
                      child: Icon(
                        Icons.circle,
                        size: 7,
                        color: Color(0xFF31C56F),
                      ),
                    ),
                  ],
                ),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    widget.thread.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
        actions: [
          _TopActionIcon(
            icon: Icons.call_rounded,
            onTap: () => _onStartCall(video: false),
          ),
          _TopActionIcon(
            icon: Icons.videocam_rounded,
            onTap: () => _onStartCall(video: true),
          ),
          _TopActionIcon(icon: Icons.menu_rounded, onTap: _showHamburgerMenu),
          const SizedBox(width: 8),
        ],
      ),
      body: Stack(
        children: [
          Column(
            children: [
              if (_activeCallUri != null && !_callScreenOpen)
                Container(
                  color: const Color(0xFF101F43),
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  child: Row(
                    children: [
                      const Icon(Icons.call, color: Colors.white, size: 16),
                      const SizedBox(width: 8),
                      const Expanded(
                        child: Text(
                          'Cuộc gọi đang diễn ra',
                          style: TextStyle(color: Colors.white, fontSize: 12),
                        ),
                      ),
                      TextButton.icon(
                        onPressed: _openDedicatedCallScreen,
                        icon: const Icon(
                          Icons.arrow_forward_rounded,
                          size: 16,
                          color: Colors.white,
                        ),
                        label: const Text(
                          'Quay lại call',
                          style: TextStyle(color: Colors.white, fontSize: 12),
                        ),
                      ),
                    ],
                  ),
                ),
              const Divider(height: 1, color: Color(0xFF233358)),
              Expanded(
                child: _loading
                    ? const Center(child: CircularProgressIndicator())
                    : ListView.builder(
                    reverse: true,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 12,
                    ),
                    itemCount: _messages.length,
                    itemBuilder: (_, index) {
                      final message = _messages[_messages.length - 1 - index];
                      final isMine = myId != null
                          ? message.senderId == myId
                          : message.senderId != widget.thread.id;
                      return Align(
                        alignment: isMine
                            ? Alignment.centerRight
                            : Alignment.centerLeft,
                        child: Container(
                          margin: const EdgeInsets.symmetric(vertical: 4),
                          padding: const EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 8,
                          ),
                          constraints: BoxConstraints(
                            maxWidth: MediaQuery.sizeOf(context).width * 0.72,
                          ),
                          decoration: BoxDecoration(
                            color: isMine
                                ? const Color(0xFF2B3C66)
                                : const Color(0xFF1D2E52),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: _buildMessageContent(message),
                        ),
                      );
                    },
                      ),
              ),
            ],
          ),
          if (_showOutgoingCall)
            Positioned.fill(
              child: _CallOverlayCard(
                title: widget.thread.name,
                avatarUrl: widget.thread.avatarUrl,
                subtitle: _outgoingVideo ? 'Video call' : 'Voice call',
                statusText: _outgoingStatus == 'calling'
                    ? 'Calling...'
                    : (_outgoingStatus == 'rejected'
                          ? 'Call rejected'
                          : 'No answer'),
                acceptLabel: null,
                rejectLabel: 'Cancel',
                onAccept: null,
                onReject: () {
                  DirectMessagesRealtimeService.endCall(widget.thread.id);
                  setState(() => _showOutgoingCall = false);
                },
              ),
            ),
          if (_showIncomingCall)
            Positioned.fill(
              child: _CallOverlayCard(
                title: _incomingCallerName,
                avatarUrl: _incomingCallerAvatar,
                subtitle: _incomingVideo ? 'Video call' : 'Voice call',
                statusText: 'Incoming call',
                acceptLabel: 'Accept',
                rejectLabel: 'Decline',
                onAccept: _acceptIncomingCall,
                onReject: _rejectIncomingCall,
              ),
            ),
        ],
      ),
      bottomNavigationBar: SafeArea(
        top: false,
        child: Padding(
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
                          onSubmitted: (_) => _sendTextMessage(),
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
                            hintText: 'Send a message…',
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
                      constraints: const BoxConstraints(
                        minWidth: 40,
                        minHeight: 44,
                      ),
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
                      constraints: const BoxConstraints(
                        minWidth: 40,
                        minHeight: 44,
                      ),
                      onPressed: _showStickerPickerMenu,
                      icon: const Icon(
                        Icons.sticky_note_2_outlined,
                        color: Color(0xFFB6C2DC),
                        size: 22,
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.only(left: 2, bottom: 2),
                      child: ListenableBuilder(
                        listenable: _inputController,
                        builder: (_, __) {
                          final empty = _inputController.text.trim().isEmpty;
                          return Material(
                            color: const Color(0xFF6C5CE7),
                            shape: const CircleBorder(),
                            child: InkWell(
                              customBorder: const CircleBorder(),
                              onTap: empty ? null : _sendTextMessage,
                              child: Padding(
                                padding: const EdgeInsets.all(8),
                                child: Icon(
                                  Icons.send_rounded,
                                  size: 20,
                                  color: empty ? Colors.white24 : Colors.white,
                                ),
                              ),
                            ),
                          );
                        },
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _VoiceRecordPanel extends StatefulWidget {
  const _VoiceRecordPanel({required this.peerUserId, required this.controller});

  final String peerUserId;
  final MessagesController controller;

  @override
  State<_VoiceRecordPanel> createState() => _VoiceRecordPanelState();
}

class _DedicatedCallScreen extends StatefulWidget {
  const _DedicatedCallScreen({
    required this.callUri,
    required this.title,
    required this.onHangup,
  });

  final Uri callUri;
  final String title;
  final Future<void> Function() onHangup;

  @override
  State<_DedicatedCallScreen> createState() => _DedicatedCallScreenState();
}

class _DedicatedCallScreenState extends State<_DedicatedCallScreen> {
  late final WebViewController _controller;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(
        NavigationDelegate(
          onNavigationRequest: (request) {
            final uri = Uri.tryParse(request.url);
            final host = uri?.host.toLowerCase() ?? '';
            if (request.url == 'about:blank' ||
                host == 'cordigram.com' ||
                host == 'www.cordigram.com') {
              return NavigationDecision.navigate;
            }
            return NavigationDecision.prevent;
          },
          onPageFinished: (_) async {
            if (!mounted) return;
            setState(() => _loading = false);
          },
        ),
      )
      ..loadRequest(widget.callUri);

    final platformController = _controller.platform;
    if (platformController is AndroidWebViewController) {
      platformController.setMediaPlaybackRequiresUserGesture(false);
      platformController.setOnPlatformPermissionRequest((request) {
        request.grant();
      });
    }
  }

  Future<void> _hangup() async {
    try {
      await _controller.loadRequest(Uri.parse('about:blank'));
    } catch (_) {}
    await widget.onHangup();
    if (mounted) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: Stack(
          children: [
            Positioned.fill(child: WebViewWidget(controller: _controller)),
            Positioned(
              top: 8,
              left: 8,
              right: 8,
              child: Row(
                children: [
                  IconButton(
                    onPressed: () => Navigator.of(context).pop(),
                    icon: const Icon(Icons.arrow_back_rounded, color: Colors.white),
                    tooltip: 'Quay lại chat',
                  ),
                  Expanded(
                    child: Text(
                      widget.title,
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 17,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  IconButton(
                    onPressed: _hangup,
                    icon: const Icon(Icons.call_end_rounded, color: Colors.red),
                    tooltip: 'Kết thúc',
                  ),
                ],
              ),
            ),
            if (_loading)
              const Center(
                child: CircularProgressIndicator(color: Colors.white),
              ),
          ],
        ),
      ),
    );
  }
}

class _CallOverlayCard extends StatelessWidget {
  const _CallOverlayCard({
    required this.title,
    required this.subtitle,
    required this.statusText,
    required this.rejectLabel,
    required this.onReject,
    this.avatarUrl,
    this.acceptLabel,
    this.onAccept,
  });

  final String title;
  final String subtitle;
  final String statusText;
  final String rejectLabel;
  final VoidCallback onReject;
  final String? avatarUrl;
  final String? acceptLabel;
  final VoidCallback? onAccept;

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: const Color(0xB3000000),
      child: Center(
        child: Container(
          width: 320,
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            color: const Color(0xFF0F1B37),
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: const Color(0xFF2C3A5A)),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              CircleAvatar(
                radius: 34,
                backgroundColor: const Color(0xFFDDDDDD),
                backgroundImage: (avatarUrl ?? '').isNotEmpty
                    ? NetworkImage(avatarUrl!)
                    : null,
                child: (avatarUrl ?? '').isNotEmpty
                    ? null
                    : Text(
                        title.isNotEmpty
                            ? title.substring(0, 1).toUpperCase()
                            : '?',
                        style: const TextStyle(
                          color: Color(0xFF1B2A4A),
                          fontWeight: FontWeight.w700,
                          fontSize: 24,
                        ),
                      ),
              ),
              const SizedBox(height: 12),
              Text(
                title,
                style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w700,
                  fontSize: 18,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                subtitle,
                style: const TextStyle(color: Color(0xFFB6C2DC), fontSize: 13),
              ),
              const SizedBox(height: 4),
              Text(
                statusText,
                style: const TextStyle(color: Color(0xFF43B581), fontSize: 13),
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: FilledButton(
                      style: FilledButton.styleFrom(
                        backgroundColor: const Color(0xFFED4245),
                      ),
                      onPressed: onReject,
                      child: Text(rejectLabel),
                    ),
                  ),
                  if (onAccept != null && acceptLabel != null) ...[
                    const SizedBox(width: 10),
                    Expanded(
                      child: FilledButton(
                        style: FilledButton.styleFrom(
                          backgroundColor: const Color(0xFF43B581),
                        ),
                        onPressed: onAccept,
                        child: Text(acceptLabel!),
                      ),
                    ),
                  ],
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
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
    _sw.reset();
    _sw.start();
    _tick = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
    setState(() => _recording = true);
  }

  Future<void> _cancel() async {
    await _recorder.cancel();
    _sw.stop();
    _tick?.cancel();
    if (mounted) {
      setState(() => _recording = false);
      Navigator.of(context).pop();
    }
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
        await widget.controller.sendVoiceMessage(
          peerUserId: widget.peerUserId,
          filePath: path,
          mimeType: 'audio/mp4',
          durationSeconds: sec,
        );
      }
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('$e')));
      }
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

class _ServerInviteCard extends StatelessWidget {
  const _ServerInviteCard({required this.serverId, required this.inviteUrl});

  final String serverId;
  final String inviteUrl;

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<ServerInvitePreview?>(
      future: ServerMediaService.getServerInvitePreview(serverId),
      builder: (context, snapshot) {
        final server = snapshot.data;
        if (snapshot.connectionState != ConnectionState.done &&
            server == null) {
          return Container(
            width: 280,
            height: 88,
            decoration: BoxDecoration(
              color: const Color(0xFF2B2D31),
              borderRadius: BorderRadius.circular(8),
            ),
          );
        }
        if (server == null) return const SizedBox.shrink();

        final created = server.createdAt;
        final monthYear = 'thg ${created.month} ${created.year}';
        final bannerColor = (() {
          final raw = (server.bannerColor ?? '').trim();
          if (!raw.startsWith('#')) return const Color(0xFF4E8A13);
          final hex = raw.replaceFirst('#', '');
          final normalized = hex.length == 6 ? 'FF$hex' : hex;
          final parsed = int.tryParse(normalized, radix: 16);
          return parsed == null ? const Color(0xFF4E8A13) : Color(parsed);
        })();

        return Container(
          width: 300,
          decoration: BoxDecoration(
            color: const Color(0xFF2B2D31),
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: const Color(0xFF3F4147)),
          ),
          clipBehavior: Clip.antiAlias,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(height: 58, width: double.infinity, color: bannerColor),
              Padding(
                padding: const EdgeInsets.all(10),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        if ((server.avatarUrl ?? '').isNotEmpty)
                          ClipRRect(
                            borderRadius: BorderRadius.circular(10),
                            child: Image.network(
                              server.avatarUrl!,
                              width: 42,
                              height: 42,
                              fit: BoxFit.cover,
                            ),
                          )
                        else
                          Container(
                            width: 42,
                            height: 42,
                            alignment: Alignment.center,
                            decoration: BoxDecoration(
                              color: const Color(0xFF1E1F22),
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: Text(
                              server.name.isEmpty
                                  ? '?'
                                  : server.name.substring(0, 1).toUpperCase(),
                              style: const TextStyle(
                                color: Color(0xFFDBDEE1),
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                server.name,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  color: Color(0xFFF2F3F5),
                                  fontWeight: FontWeight.w700,
                                  fontSize: 15,
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                '${server.onlineCount} Trực tuyến   ${server.memberCount} thành viên',
                                style: const TextStyle(
                                  color: Color(0xFFB5BAC1),
                                  fontSize: 12,
                                ),
                              ),
                              Text(
                                'Thành lập từ $monthYear',
                                style: const TextStyle(
                                  color: Color(0xFF949BA4),
                                  fontSize: 11,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton(
                        style: FilledButton.styleFrom(
                          backgroundColor: const Color(0xFF248046),
                          foregroundColor: Colors.white,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(6),
                          ),
                        ),
                        onPressed: () async {
                          await launchUrl(Uri.parse(inviteUrl));
                        },
                        child: const Text('Đi tới Máy chủ'),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _PollMessageCard extends StatefulWidget {
  const _PollMessageCard({
    required this.pollId,
    required this.t,
    required this.tf,
  });

  final String pollId;
  final String Function(String key) t;
  final String Function(String key, Map<String, String> vars) tf;

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
    } catch (_) {
      if (!mounted) return;
      setState(() => _loadError = widget.t('poll.voteError'));
    }
  }

  void _toggleOption(int index) {
    if (_hasVoted || _pollData == null) return;
    final allowMultiple = _pollData!['allowMultipleAnswers'] == true;
    setState(() {
      if (allowMultiple) {
        if (_selectedOptions.contains(index)) {
          _selectedOptions = _selectedOptions.where((e) => e != index).toList();
        } else {
          _selectedOptions = <int>[..._selectedOptions, index];
        }
      } else {
        _selectedOptions = <int>[index];
      }
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
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(widget.t('poll.voteError'))),
      );
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
            _loadError ?? widget.t('poll.loading'),
            style: const TextStyle(color: Colors.white70),
          ),
          if (_loadError != null)
            TextButton(
              onPressed: _loadPoll,
              child: const Text('Retry'),
            ),
        ],
      );
    }

    final options = (data['options'] as List?)?.map((e) => '$e').toList() ?? [];
    final results =
        (data['results'] as List?)?.map((e) => Map<String, dynamic>.from(e as Map)).toList() ??
        const <Map<String, dynamic>>[];
    final allowMultiple = data['allowMultipleAnswers'] == true;
    final votes = (data['uniqueVoters'] ?? 0).toString();
    final hours = (data['hoursLeft'] ?? 0).toString();

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
          const SizedBox(height: 6),
          Text(
            allowMultiple ? widget.t('poll.selectMany') : widget.t('poll.selectOne'),
            style: const TextStyle(color: Color(0xFFB5BAC1), fontSize: 12),
          ),
          const SizedBox(height: 8),
          ...List.generate(options.length, (i) {
            if (!_showResults) {
              return InkWell(
                onTap: () => _toggleOption(i),
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
            }
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
                        style: const TextStyle(color: Color(0xFFB5BAC1), fontSize: 12),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(4),
                    child: LinearProgressIndicator(
                      value: (percentage / 100).clamp(0, 1),
                      minHeight: 6,
                      backgroundColor: const Color(0xFF1E1F22),
                      valueColor: const AlwaysStoppedAnimation(Color(0xFF6C5CE7)),
                    ),
                  ),
                ],
              ),
            );
          }),
          const Divider(color: Color(0xFF3F4147), height: 16),
          Row(
            children: [
              Expanded(
                child: Text(
                  widget.tf('poll.votesHours', {'votes': votes, 'hours': hours}),
                  style: const TextStyle(color: Color(0xFFB5BAC1), fontSize: 12),
                ),
              ),
              if (!_showResults)
                TextButton(
                  onPressed: () => setState(() => _showResults = true),
                  child: Text(widget.t('poll.showResults')),
                ),
              if (!_hasVoted && !_showResults)
                FilledButton(
                  onPressed: _selectedOptions.isEmpty || _submitting ? null : _vote,
                  child: Text(widget.t('poll.vote')),
                ),
              if (_hasVoted)
                Text(
                  '✓ ${widget.t('poll.voted')}',
                  style: const TextStyle(color: Color(0xFF31C56F), fontSize: 12),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _TopActionIcon extends StatelessWidget {
  const _TopActionIcon({required this.icon, required this.onTap});

  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(left: 4),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Container(
          width: 28,
          height: 28,
          decoration: const BoxDecoration(
            color: Color(0xFF243251),
            shape: BoxShape.circle,
          ),
          alignment: Alignment.center,
          child: Icon(icon, color: const Color(0xFFD0D8EA), size: 16),
        ),
      ),
    );
  }
}

class _MenuActionRow extends StatelessWidget {
  const _MenuActionRow({required this.title, required this.onTap});

  final String title;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Container(
        width: double.infinity,
        height: 52,
        alignment: Alignment.center,
        decoration: const BoxDecoration(
          border: Border(top: BorderSide(color: Color(0xFF5D6B87))),
        ),
        child: Text(
          title,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 17,
            fontWeight: FontWeight.w500,
          ),
        ),
      ),
    );
  }
}
