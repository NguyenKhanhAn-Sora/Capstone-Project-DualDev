import 'package:flutter/material.dart';

import 'message_chat_screen.dart';
import 'messages_controller.dart';
import 'models/message_thread.dart';
import 'widgets/message_folder_dropdown.dart';
import 'widgets/message_thread_tile.dart';

class MessageHomeScreen extends StatefulWidget {
  const MessageHomeScreen({super.key});

  @override
  State<MessageHomeScreen> createState() => _MessageHomeScreenState();
}

class _MessageHomeScreenState extends State<MessageHomeScreen> {
  static const String _dmTitle = 'Tin nhắn trực tiếp';
  static const String _serverTitle = 'Server';
  static const Color _pageColor = Color(0xFF08183A);
  static const Color _lineColor = Color(0xFF21345D);

  final TextEditingController _searchController = TextEditingController();
  final MessagesController _messagesController = MessagesController();
  bool _isFolderExpanded = false;
  bool _isServerMode = false;

  final List<MessageThread> _serverThreads = const [
    MessageThread(
      id: 's1',
      name: 'ServerName',
      lastMessage: '',
      lastActiveLabel: '',
      unreadCount: 2,
    ),
    MessageThread(
      id: 's2',
      name: 'ServerName',
      lastMessage: '',
      lastActiveLabel: '',
      unreadCount: 2,
    ),
    MessageThread(
      id: 's3',
      name: 'ServerName',
      lastMessage: '',
      lastActiveLabel: '',
      unreadCount: 2,
    ),
    MessageThread(
      id: 's4',
      name: 'ServerName',
      lastMessage: '',
      lastActiveLabel: '',
      unreadCount: 2,
    ),
    MessageThread(
      id: 's5',
      name: 'ServerName',
      lastMessage: '',
      lastActiveLabel: '',
      unreadCount: 2,
    ),
    MessageThread(
      id: 's6',
      name: 'ServerName',
      lastMessage: '',
      lastActiveLabel: '',
      unreadCount: 2,
    ),
    MessageThread(
      id: 's7',
      name: 'ServerName',
      lastMessage: '',
      lastActiveLabel: '',
      unreadCount: 2,
    ),
    MessageThread(
      id: 's8',
      name: 'ServerName',
      lastMessage: '',
      lastActiveLabel: '',
      unreadCount: 2,
    ),
  ];

  @override
  void initState() {
    super.initState();
    _messagesController.addListener(_onControllerChanged);
    _messagesController.init();
  }

  @override
  void dispose() {
    _messagesController.removeListener(_onControllerChanged);
    _messagesController.disposeController();
    _messagesController.dispose();
    _searchController.dispose();
    super.dispose();
  }

  void _onControllerChanged() {
    if (!mounted) return;
    setState(() {});
  }

  List<MessageThread> get _filteredThreads {
    final source = _isServerMode ? _serverThreads : _messagesController.threads;
    final query = _searchController.text.trim().toLowerCase();
    return source.where((thread) {
      if (query.isEmpty) return true;
      return thread.name.toLowerCase().contains(query) ||
          thread.lastMessage.toLowerCase().contains(query);
    }).toList();
  }

  String get _headerTitle => _isServerMode ? _serverTitle : _dmTitle;

  List<String> get _quickMenuItems => [
    'Nâng cấp Boost',
    'Cài đặt',
    _isServerMode ? _dmTitle : _serverTitle,
  ];

  String get _voiceContextKey => _isServerMode ? 'server:lobby' : 'dm:lobby';

  void _toggleFolder() {
    setState(() {
      _isFolderExpanded = !_isFolderExpanded;
    });
  }

  void _onQuickMenuTap(String action) {
    final shouldSwitchToServer = action == _serverTitle;
    final shouldSwitchToDm = action == _dmTitle;
    setState(() {
      if (shouldSwitchToServer) {
        _isServerMode = true;
        _searchController.clear();
      } else if (shouldSwitchToDm) {
        _isServerMode = false;
        _searchController.clear();
      }
      _isFolderExpanded = false;
    });
  }

  void _openThread(MessageThread thread) {
    if (_isServerMode) return;
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) =>
            MessageChatScreen(thread: thread, controller: _messagesController),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final threads = _filteredThreads;

    return GestureDetector(
      onTap: () {
        if (_isFolderExpanded) {
          setState(() => _isFolderExpanded = false);
        }
        FocusScope.of(context).unfocus();
      },
      child: Scaffold(
        backgroundColor: _pageColor,
        appBar: AppBar(
          backgroundColor: _pageColor,
          elevation: 0,
          scrolledUnderElevation: 0,
          surfaceTintColor: Colors.transparent,
          toolbarHeight: 52,
          leadingWidth: 38,
          leading: const Padding(
            padding: EdgeInsets.only(left: 10),
            child: Align(
              alignment: Alignment.centerLeft,
              child: SizedBox(
                width: 22,
                height: 22,
                child: Image(
                  image: AssetImage('assets/images/cordigram-logo.png'),
                  fit: BoxFit.contain,
                ),
              ),
            ),
          ),
          titleSpacing: 2,
          title: MessageFolderDropdown(
            title: _headerTitle,
            isExpanded: _isFolderExpanded,
            onToggle: _toggleFolder,
          ),
          actions: [
            Padding(
              padding: const EdgeInsets.only(right: 10),
              child: Stack(
                clipBehavior: Clip.none,
                children: [
                  IconButton(
                    tooltip: 'Inbox',
                    onPressed: () async {
                      await _messagesController.refreshInboxCount();
                    },
                    constraints: const BoxConstraints.tightFor(
                      width: 30,
                      height: 30,
                    ),
                    padding: EdgeInsets.zero,
                    splashRadius: 18,
                    icon: const Icon(
                      Icons.mail_outline_rounded,
                      size: 21,
                      color: Colors.white,
                    ),
                  ),
                  if (_messagesController.inboxUnreadCount > 0)
                    Positioned(
                      right: -2,
                      top: -2,
                      child: Container(
                        width: 10,
                        height: 10,
                        decoration: const BoxDecoration(
                          color: Color(0xFFFF2A45),
                          shape: BoxShape.circle,
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
        body: Column(
          children: [
            if (_isFolderExpanded)
              Padding(
                padding: const EdgeInsets.fromLTRB(0, 0, 0, 8),
                child: MessageQuickMenuDropdown(
                  items: _quickMenuItems,
                  onSelected: _onQuickMenuTap,
                ),
              ),
            if (!_isServerMode)
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 6, 12, 12),
                child: TextField(
                  controller: _searchController,
                  onChanged: (_) => setState(() {}),
                  decoration: InputDecoration(
                    hintText: 'Tìm hoặc bắt đầu cuộc trò chuyện ....',
                    hintStyle: const TextStyle(
                      color: Color(0xFFAFC0E2),
                      fontSize: 13,
                    ),
                    isDense: true,
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 8,
                    ),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(22),
                      borderSide: const BorderSide(
                        color: Color(0xFFAFC0E2),
                        width: 1,
                      ),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(22),
                      borderSide: const BorderSide(
                        color: Color(0xFFAFC0E2),
                        width: 1,
                      ),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(22),
                      borderSide: const BorderSide(
                        color: Colors.white,
                        width: 1.2,
                      ),
                    ),
                  ),
                ),
              ),
            const Divider(height: 1, thickness: 1, color: _lineColor),
            Expanded(
              child: _messagesController.loadingThreads && !_isServerMode
                  ? const Center(child: CircularProgressIndicator())
                  : (!_isServerMode && _messagesController.threadsError != null)
                  ? Center(
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 20),
                        child: Text(
                          _messagesController.threadsError!,
                          textAlign: TextAlign.center,
                          style: const TextStyle(color: Color(0xFFAFC0E2)),
                        ),
                      ),
                    )
                  : threads.isEmpty
                  ? Center(
                      child: const Text(
                        'No conversations found',
                        style: TextStyle(
                          color: Color(0xFFAFC0E2),
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    )
                  : ListView.separated(
                      itemCount: threads.length,
                      separatorBuilder: (_, __) =>
                          const Divider(height: 1, color: _lineColor),
                      itemBuilder: (context, index) {
                        final thread = threads[index];
                        return MessageThreadTile(
                          thread: thread,
                          showActivityLabel: !_isServerMode,
                          languageCode: _messagesController.languageCode,
                          onTap: () => _openThread(thread),
                        );
                      },
                    ),
            ),
          ],
        ),
        bottomNavigationBar: Container(
          height: 42,
          padding: const EdgeInsets.symmetric(horizontal: 12),
          decoration: const BoxDecoration(
            color: _pageColor,
            border: Border(top: BorderSide(color: _lineColor)),
          ),
          child: Row(
            children: [
              CircleAvatar(
                radius: 10,
                backgroundColor: const Color(0xFFDDDDDD),
                backgroundImage: (_messagesController.myAvatarUrl ?? '').isNotEmpty
                    ? NetworkImage(_messagesController.myAvatarUrl!)
                    : null,
                child: (_messagesController.myAvatarUrl ?? '').isNotEmpty
                    ? null
                    : Text(
                        ((_messagesController.myDisplayName ??
                                    _messagesController.myUsername ??
                                    'U')
                                .trim()
                                .isNotEmpty
                            ? (_messagesController.myDisplayName ??
                                    _messagesController.myUsername ??
                                    'U')
                                .trim()
                                .substring(0, 1)
                                .toUpperCase()
                            : 'U'),
                        style: const TextStyle(
                          color: Color(0xFF1B2A4A),
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
              ),
              const SizedBox(width: 6),
              Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    (_messagesController.myUsername ?? '').isNotEmpty
                        ? _messagesController.myUsername!
                        : 'Username',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      height: 1.1,
                    ),
                  ),
                  Row(
                    children: [
                      Icon(
                        Icons.circle,
                        size: 7,
                        color: _messagesController.myOnline
                            ? const Color(0xFF31C56F)
                            : const Color(0xFF7E8CA8),
                      ),
                      const SizedBox(width: 4),
                      Text(
                        (_messagesController.myDisplayName ?? '').isNotEmpty
                            ? _messagesController.myDisplayName!
                            : 'DisplayName',
                        style: const TextStyle(
                          color: Color(0xFF9AAFD5),
                          fontSize: 9,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
              const Spacer(),
              IconButton(
                onPressed: () =>
                    _messagesController.toggleMic(_voiceContextKey),
                iconSize: 16,
                padding: EdgeInsets.zero,
                constraints: const BoxConstraints.tightFor(
                  width: 26,
                  height: 26,
                ),
                icon: Icon(
                  _messagesController.voiceStateFor(_voiceContextKey).micMuted
                      ? Icons.mic_off_rounded
                      : Icons.mic_none_rounded,
                  color:
                      _messagesController
                          .voiceStateFor(_voiceContextKey)
                          .micMuted
                      ? const Color(0xFFFF5770)
                      : const Color(0xFFB4C2DE),
                ),
              ),
              IconButton(
                onPressed: () =>
                    _messagesController.toggleSound(_voiceContextKey),
                iconSize: 16,
                padding: EdgeInsets.zero,
                constraints: const BoxConstraints.tightFor(
                  width: 26,
                  height: 26,
                ),
                icon: Icon(
                  _messagesController.voiceStateFor(_voiceContextKey).soundMuted
                      ? Icons.headset_off_rounded
                      : Icons.headset_rounded,
                  color:
                      _messagesController
                          .voiceStateFor(_voiceContextKey)
                          .soundMuted
                      ? const Color(0xFFFF5770)
                      : const Color(0xFFB4C2DE),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
