import 'dart:async';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import 'call/dm_call_manager.dart';
import 'channel_chat_screen.dart';
import 'server_detail_screen.dart';
import 'server_list_controller.dart';
import 'message_chat_screen.dart';
import 'search/message_search_sheet.dart';
import 'services/servers_service.dart';
import 'voice_channel_room_screen.dart';
import 'messages_controller.dart';
import 'models/message_thread.dart';
import 'models/server_models.dart';
import 'services/direct_messages_service.dart';
import 'services/messages_media_service.dart';
import 'services/voice_channel_session_controller.dart';
import 'widgets/message_folder_dropdown.dart';
import 'widgets/messages_inbox_sheet.dart';
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
  final ServerListController _serverListController = ServerListController();
  bool _isFolderExpanded = false;
  bool _isServerMode = false;

  @override
  void initState() {
    super.initState();
    _messagesController.addListener(_onControllerChanged);
    _serverListController.addListener(_onControllerChanged);
    _messagesController.init();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _serverListController.loadServers();
    });
  }

  @override
  void dispose() {
    _messagesController.removeListener(_onControllerChanged);
    _serverListController.removeListener(_onControllerChanged);
    _messagesController.disposeController();
    _messagesController.dispose();
    _serverListController.dispose();
    _searchController.dispose();
    super.dispose();
  }

  void _onControllerChanged() {
    if (!mounted) return;
    setState(() {});
  }

  List<ServerSummary> get _filteredServers {
    final source = _serverListController.servers;
    final query = _searchController.text.trim().toLowerCase();
    return source.where((server) {
      if (query.isEmpty) return true;
      return server.name.toLowerCase().contains(query) ||
          (server.description ?? '').toLowerCase().contains(query);
    }).toList();
  }

  String get _headerTitle => _isServerMode ? _serverTitle : _dmTitle;

  List<String> get _quickMenuItems => [
    'Nâng cấp Boost',
    'Cài đặt',
    _isServerMode ? _dmTitle : _serverTitle,
  ];

  String get _voiceContextKey => _isServerMode ? 'server:lobby' : 'dm:lobby';

  bool get _hasServerVoice => VoiceChannelSessionController.instance.active;
  bool get _hasDmVoiceCall => DmCallManager.instance.active != null;

  bool get _globalMicMuted {
    if (_hasServerVoice) {
      return !VoiceChannelSessionController.instance.micEnabled;
    }
    if (_hasDmVoiceCall) {
      return !DmCallManager.instance.activeMicEnabled;
    }
    return _messagesController.voiceStateFor(_voiceContextKey).micMuted;
  }

  bool get _globalSoundMuted {
    if (_hasServerVoice) {
      return !VoiceChannelSessionController.instance.soundEnabled;
    }
    if (_hasDmVoiceCall) {
      return !DmCallManager.instance.activeSoundEnabled;
    }
    return _messagesController.voiceStateFor(_voiceContextKey).soundMuted;
  }

  Future<void> _toggleGlobalMic() async {
    if (_hasServerVoice) {
      await VoiceChannelSessionController.instance.toggleMic();
      return;
    }
    if (_hasDmVoiceCall) {
      await DmCallManager.instance.toggleActiveMic();
      return;
    }
    _messagesController.toggleMic(_voiceContextKey);
  }

  Future<void> _toggleGlobalSound() async {
    if (_hasServerVoice) {
      await VoiceChannelSessionController.instance.toggleSound();
      return;
    }
    if (_hasDmVoiceCall) {
      await DmCallManager.instance.toggleActiveSound();
      return;
    }
    _messagesController.toggleSound(_voiceContextKey);
  }

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
        if (_serverListController.servers.isEmpty && !_serverListController.loading) {
          _serverListController.loadServers();
        }
      } else if (shouldSwitchToDm) {
        _isServerMode = false;
        _searchController.clear();
      }
      _isFolderExpanded = false;
    });
  }

  Future<void> _openInboxSheet() async {
    await MessagesInboxSheet.show(
      context,
      onNavigateToChannel: (serverId, channelId) async {
        await _serverListController.loadServers();
        if (!mounted) return;
        ServerSummary? server;
        for (final s in _serverListController.servers) {
          if (s.id == serverId) {
            server = s;
            break;
          }
        }
        if (server == null) return;
        final ch = channelId.trim();
        await _openServer(
          server,
          initialTextChannelId: ch.isEmpty ? null : ch,
        );
      },
      onNavigateToDm: (userId, displayName, username, avatarUrl) {
        final thread = MessageThread(
          id: userId,
          name: displayName.trim().isNotEmpty ? displayName.trim() : username,
          lastMessage: '',
          lastActiveLabel: '',
          unreadCount: 0,
          avatarUrl: (avatarUrl != null && avatarUrl.trim().isNotEmpty)
              ? avatarUrl.trim()
              : null,
        );
        _openThread(thread);
        unawaited(_messagesController.refreshThreads());
      },
      onAcceptInvite: (serverId) async {
        await _serverListController.loadServers();
        if (!mounted) return;
        for (final s in _serverListController.servers) {
          if (s.id == serverId) {
            await _openServer(s);
            return;
          }
        }
      },
      onMarkSeen: () {
        unawaited(_messagesController.refreshInboxCount());
      },
    );
    if (mounted) await _messagesController.refreshInboxCount();
  }

  Future<void> _openServer(
    ServerSummary server, {
    String? initialTextChannelId,
  }) async {
    _serverListController.selectServer(server.id);
    final displayName = (_messagesController.myDisplayName ?? '').trim();
    final username = (_messagesController.myUsername ?? '').trim();
    final participantName = displayName.isNotEmpty
        ? displayName
        : (username.isNotEmpty ? username : 'Người dùng');
    final hubResult = await Navigator.of(context).push<dynamic>(
      MaterialPageRoute(
        builder: (_) => ServerDetailScreen(
          server: server,
          currentUserId: _messagesController.myUserId,
          participantName: participantName,
          initialTextChannelId: initialTextChannelId,
        ),
      ),
    );
    if (!mounted) return;
    if (hubResult == 'deleted' || hubResult == 'left') {
      unawaited(_serverListController.loadServers());
    }
  }

  Future<void> _createServerDialog() async {
    const templates = <Map<String, String>>[
      {'id': 'custom', 'label': 'Tuỳ chỉnh'},
      {'id': 'gaming', 'label': 'Gaming'},
      {'id': 'friends', 'label': 'Friends'},
      {'id': 'study-group', 'label': 'Study group'},
      {'id': 'school-club', 'label': 'School club'},
      {'id': 'local-community', 'label': 'Local community'},
      {'id': 'artists-creators', 'label': 'Artists & creators'},
    ];
    const purposes = <Map<String, String>>[
      {'id': 'club-community', 'label': 'CLB / Cộng đồng'},
      {'id': 'me-and-friends', 'label': 'Mình và bạn bè'},
    ];
    final nameController = TextEditingController();
    final descController = TextEditingController();
    final picker = ImagePicker();
    int step = 0;
    String selectedTemplate = 'custom';
    String selectedPurpose = 'me-and-friends';
    String? avatarUrl;
    bool creating = false;
    bool uploadingAvatar = false;
    String languageCode = 'vi';
    try {
      languageCode = await DirectMessagesService.getCurrentLanguageCode();
    } catch (_) {}

    await showDialog<void>(
      context: context,
      barrierDismissible: !creating,
      builder: (dialogContext) {
        return StatefulBuilder(
          builder: (context, setModalState) {
            Widget content;
            if (step == 0) {
              content = Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Chọn mẫu máy chủ',
                    style: TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w700,
                      fontSize: 16,
                    ),
                  ),
                  const SizedBox(height: 8),
                  ...templates.map((tpl) {
                    return RadioListTile<String>(
                      value: tpl['id']!,
                      groupValue: selectedTemplate,
                      onChanged: creating
                          ? null
                          : (v) {
                              if (v == null) return;
                              setModalState(() => selectedTemplate = v);
                            },
                      activeColor: const Color(0xFF2D7EFF),
                      title: Text(
                        tpl['label']!,
                        style: const TextStyle(color: Colors.white),
                      ),
                    );
                  }),
                ],
              );
            } else if (step == 1) {
              content = Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Mục đích máy chủ',
                    style: TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w700,
                      fontSize: 16,
                    ),
                  ),
                  const SizedBox(height: 8),
                  ...purposes.map((p) {
                    return RadioListTile<String>(
                      value: p['id']!,
                      groupValue: selectedPurpose,
                      onChanged: creating
                          ? null
                          : (v) {
                              if (v == null) return;
                              setModalState(() => selectedPurpose = v);
                            },
                      activeColor: const Color(0xFF2D7EFF),
                      title: Text(
                        p['label']!,
                        style: const TextStyle(color: Colors.white),
                      ),
                    );
                  }),
                ],
              );
            } else {
              content = Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  GestureDetector(
                    onTap: (creating || uploadingAvatar)
                        ? null
                        : () async {
                            final file = await picker.pickImage(
                              source: ImageSource.gallery,
                            );
                            if (file == null) return;
                            if (!context.mounted) return;
                            setModalState(() => uploadingAvatar = true);
                            try {
                              final upload = await MessagesMediaService.uploadFile(
                                filePath: file.path,
                                contentType: MessagesMediaService.resolveUploadContentType(
                                  filePath: file.path,
                                  hintedContentType: file.mimeType,
                                ),
                              );
                              final url = MessagesMediaService.pickDisplayUrl(upload);
                              if (url.isNotEmpty) {
                                setModalState(() => avatarUrl = url);
                              }
                            } catch (e) {
                              if (!context.mounted) return;
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(content: Text('Upload ảnh thất bại: $e')),
                              );
                            } finally {
                              if (context.mounted) {
                                setModalState(() => uploadingAvatar = false);
                              }
                            }
                          },
                    child: CircleAvatar(
                      radius: 34,
                      backgroundColor: const Color(0xFF1F2D4D),
                      backgroundImage: (avatarUrl ?? '').isNotEmpty
                          ? NetworkImage(avatarUrl!)
                          : null,
                      child: uploadingAvatar
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : ((avatarUrl ?? '').isEmpty
                                ? const Icon(
                                    Icons.add_a_photo_rounded,
                                    color: Colors.white,
                                  )
                                : null),
                    ),
                  ),
                  const SizedBox(height: 10),
                  TextField(
                    controller: nameController,
                    autofocus: true,
                    style: const TextStyle(color: Colors.white),
                    decoration: const InputDecoration(
                      labelText: 'Tên server',
                      labelStyle: TextStyle(color: Color(0xFFAFC0E2)),
                    ),
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    controller: descController,
                    style: const TextStyle(color: Colors.white),
                    decoration: const InputDecoration(
                      labelText: 'Mô tả (tuỳ chọn)',
                      labelStyle: TextStyle(color: Color(0xFFAFC0E2)),
                    ),
                  ),
                ],
              );
            }

            return AlertDialog(
              backgroundColor: const Color(0xFF0E2247),
              title: Text(
                step == 0
                    ? 'Tạo máy chủ'
                    : step == 1
                    ? 'Thiết lập mục đích'
                    : 'Tuỳ chỉnh máy chủ',
                style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700),
              ),
              content: SingleChildScrollView(child: content),
              actions: [
                TextButton(
                  onPressed: creating
                      ? null
                      : () {
                          if (step > 0) {
                            setModalState(() => step -= 1);
                            return;
                          }
                          Navigator.of(dialogContext).pop();
                        },
                  child: Text(step > 0 ? 'Quay lại' : 'Huỷ'),
                ),
                ElevatedButton(
                  onPressed: creating || uploadingAvatar
                      ? null
                      : () async {
                          if (step < 2) {
                            setModalState(() => step += 1);
                            return;
                          }
                          final name = nameController.text.trim();
                          if (name.isEmpty) return;
                          setModalState(() => creating = true);
                          try {
                            final created = await _serverListController.createServer(
                              name: name,
                              description: descController.text.trim(),
                              avatarUrl: avatarUrl,
                              template: selectedTemplate,
                              purpose: selectedPurpose,
                              language: languageCode,
                            );
                            if (!context.mounted) return;
                            Navigator.of(dialogContext).pop();
                            if (created != null) {
                              _openServer(created);
                            }
                          } catch (e) {
                            if (!context.mounted) return;
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text('Không tạo được server: $e'),
                              ),
                            );
                          } finally {
                            if (context.mounted) {
                              setModalState(() => creating = false);
                            }
                          }
                        },
                  child: creating
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : Text(step < 2 ? 'Tiếp tục' : 'Tạo'),
                ),
              ],
            );
          },
        );
      },
    );
    nameController.dispose();
    descController.dispose();
  }

  void _openThread(MessageThread thread) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) =>
            MessageChatScreen(thread: thread, controller: _messagesController),
      ),
    );
  }

  String _participantNameForVoice() {
    final displayName = (_messagesController.myDisplayName ?? '').trim();
    final username = (_messagesController.myUsername ?? '').trim();
    return displayName.isNotEmpty
        ? displayName
        : (username.isNotEmpty ? username : 'Người dùng');
  }

  Future<void> _openGlobalMessageSearch() async {
    if (_serverListController.servers.isEmpty) {
      await _serverListController.loadServers();
    }
    if (!mounted) return;
    final threads = _messagesController.threads;
    final servers = _serverListController.servers;
    Future<QuickSwitchServerData?> loadQuick(ServerSummary s) async {
      try {
        final ch = await ServersService.getServerChannels(s.id);
        final text = ch
            .where(
              (c) =>
                  c.isText &&
                  (c.category ?? '').trim().toLowerCase() != 'info',
            )
            .toList();
        final voice = ch.where((c) => c.isVoice).toList();
        return QuickSwitchServerData(
          id: s.id,
          name: s.name,
          textChannels: text,
          voiceChannels: voice,
        );
      } catch (_) {
        return null;
      }
    }

    final quick = (await Future.wait(servers.map(loadQuick)))
        .whereType<QuickSwitchServerData>()
        .toList();
    if (!mounted) return;
    await MessageSearchSheet.present(
      context,
      child: MessageSearchSheet.globalDm(
        dmPeers: threads,
        quickServers: quick,
        searchUiLanguage: _messagesController.languageCode,
        onOpenDm: _openThread,
        onOpenServerChannel: (serverId, channelId) async {
          ServerSummary? server;
          for (final s in servers) {
            if (s.id == serverId) {
              server = s;
              break;
            }
          }
          if (server == null || !mounted) return;
          final chosenServer = server;
          if (channelId == null || channelId.isEmpty) {
            await _openServer(chosenServer);
            return;
          }
          try {
            final channels =
                await ServersService.getServerChannels(chosenServer.id);
            ServerChannel? ch;
            for (final c in channels) {
              if (c.id == channelId) {
                ch = c;
                break;
              }
            }
            if (ch == null || !mounted) return;
            final chosenChannel = ch;
            final name = _participantNameForVoice();
            if (chosenChannel.isVoice) {
              await Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => VoiceChannelRoomScreen(
                    server: chosenServer,
                    channel: chosenChannel,
                    participantName: name,
                  ),
                ),
              );
            } else {
              await Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => ChannelChatScreen(
                    server: chosenServer,
                    channel: chosenChannel,
                    currentUserId: _messagesController.myUserId,
                    participantName: name,
                  ),
                ),
              );
            }
          } catch (_) {}
        },
      ),
    );
  }

  MessageThread _toServerThread(ServerSummary server) {
    return MessageThread(
      id: server.id,
      name: server.name,
      lastMessage: (server.description ?? '').trim(),
      lastActiveLabel: '',
      unreadCount: server.unreadCount,
      avatarUrl: (server.avatarUrl ?? '').trim().isEmpty ? null : server.avatarUrl,
      isOnline: true,
    );
  }

  Widget _buildServerModeBody(List<ServerSummary> servers) {
    if (_serverListController.loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_serverListController.error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: Text(
            _serverListController.error!,
            textAlign: TextAlign.center,
            style: const TextStyle(color: Color(0xFFAFC0E2)),
          ),
        ),
      );
    }
    if (servers.isEmpty) {
      return Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 6),
            child: SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: _createServerDialog,
                icon: const Icon(Icons.add_rounded),
                label: const Text('Tạo server mới'),
              ),
            ),
          ),
          const Expanded(
            child: Center(
              child: Text(
                'Bạn chưa tham gia server nào',
                style: TextStyle(
                  color: Color(0xFFAFC0E2),
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
          ),
        ],
      );
    }

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 8),
          child: Row(
            children: [
              _ServerCircleButton(
                icon: Icons.add_rounded,
                selected: false,
                onTap: _createServerDialog,
                tooltip: 'Tạo server',
              ),
              const SizedBox(width: 10),
              Expanded(
                child: SizedBox(
                  height: 56,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    itemCount: servers.length,
                    separatorBuilder: (_, __) => const SizedBox(width: 8),
                    itemBuilder: (context, index) {
                      final server = servers[index];
                      return _ServerCircleButton(
                        imageUrl: server.avatarUrl,
                        label: server.name,
                        unreadCount: server.unreadCount,
                        selected: _serverListController.selectedServerId == server.id,
                        onTap: () => _openServer(server),
                      );
                    },
                  ),
                ),
              ),
            ],
          ),
        ),
        const Divider(height: 1, color: _lineColor),
        Expanded(
          child: ListView.separated(
            itemCount: servers.length,
            separatorBuilder: (_, __) => const Divider(height: 1, color: _lineColor),
            itemBuilder: (context, index) {
              final server = servers[index];
              return MessageThreadTile(
                thread: _toServerThread(server),
                showActivityLabel: false,
                languageCode: _messagesController.languageCode,
                onTap: () => _openServer(server),
              );
            },
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final threads = _messagesController.threads;
    final servers = _filteredServers;

    return AnimatedBuilder(
      animation: Listenable.merge([
        VoiceChannelSessionController.instance,
        DmCallManager.instance,
      ]),
      builder: (context, _) => GestureDetector(
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
                    tooltip: 'Hộp thư',
                    onPressed: _openInboxSheet,
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
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 6, 12, 12),
              child: _isServerMode
                  ? TextField(
                      controller: _searchController,
                      onChanged: (_) => setState(() {}),
                      decoration: InputDecoration(
                        hintText: 'Tìm server...',
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
                    )
                  : TextField(
                      readOnly: true,
                      onTap: _openGlobalMessageSearch,
                      decoration: InputDecoration(
                        hintText: 'Tìm hoặc bắt đầu cuộc trò chuyện',
                        hintStyle: const TextStyle(
                          color: Color(0xFFAFC0E2),
                          fontSize: 13,
                        ),
                        prefixIcon: const Icon(
                          Icons.search_rounded,
                          color: Color(0xFFAFC0E2),
                          size: 22,
                        ),
                        isDense: true,
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 10,
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
                            color: Color(0xFFAFC0E2),
                            width: 1,
                          ),
                        ),
                      ),
                    ),
            ),
            const Divider(height: 1, thickness: 1, color: _lineColor),
            Expanded(
              child: _isServerMode
                  ? _buildServerModeBody(servers)
                  : _messagesController.loadingThreads
                  ? const Center(child: CircularProgressIndicator())
                  : (_messagesController.threadsError != null)
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
                onPressed: () => unawaited(_toggleGlobalMic()),
                iconSize: 16,
                padding: EdgeInsets.zero,
                constraints: const BoxConstraints.tightFor(
                  width: 26,
                  height: 26,
                ),
                icon: Icon(
                  _globalMicMuted
                      ? Icons.mic_off_rounded
                      : Icons.mic_none_rounded,
                  color: _globalMicMuted
                      ? const Color(0xFFFF5770)
                      : const Color(0xFFB4C2DE),
                ),
              ),
              IconButton(
                onPressed: () => unawaited(_toggleGlobalSound()),
                iconSize: 16,
                padding: EdgeInsets.zero,
                constraints: const BoxConstraints.tightFor(
                  width: 26,
                  height: 26,
                ),
                icon: Icon(
                  _globalSoundMuted
                      ? Icons.headset_off_rounded
                      : Icons.headset_rounded,
                  color: _globalSoundMuted
                      ? const Color(0xFFFF5770)
                      : const Color(0xFFB4C2DE),
                ),
              ),
            ],
          ),
        ),
      )),
    );
  }
}

class _ServerCircleButton extends StatelessWidget {
  const _ServerCircleButton({
    this.icon,
    this.imageUrl,
    this.label,
    this.tooltip,
    this.unreadCount = 0,
    required this.selected,
    required this.onTap,
  });

  final IconData? icon;
  final String? imageUrl;
  final String? label;
  final String? tooltip;
  final int unreadCount;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final hasImage = (imageUrl ?? '').isNotEmpty;
    final letter = (label ?? '').trim().isNotEmpty
        ? (label!.trim().substring(0, 1).toUpperCase())
        : '?';
    return Tooltip(
      message: tooltip ?? label ?? '',
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          InkWell(
            onTap: onTap,
            borderRadius: BorderRadius.circular(26),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 140),
              width: 52,
              height: 52,
              decoration: BoxDecoration(
                color: selected ? const Color(0xFF2D7EFF) : const Color(0xFF122A55),
                shape: BoxShape.circle,
                border: Border.all(
                  color: selected ? Colors.white : const Color(0xFF2A3F69),
                ),
              ),
              child: hasImage
                  ? ClipOval(
                      child: Image.network(
                        imageUrl!,
                        fit: BoxFit.cover,
                        errorBuilder: (_, __, ___) => Center(
                          child: Text(
                            letter,
                            style: const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.w700,
                              fontSize: 16,
                            ),
                          ),
                        ),
                      ),
                    )
                  : Center(
                      child: icon != null
                          ? Icon(icon, color: Colors.white, size: 24)
                          : Text(
                              letter,
                              style: const TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.w700,
                                fontSize: 16,
                              ),
                            ),
                    ),
            ),
          ),
          if (unreadCount > 0)
            Positioned(
              right: -3,
              top: -3,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                decoration: BoxDecoration(
                  color: const Color(0xFFFF2A45),
                  borderRadius: BorderRadius.circular(99),
                  border: Border.all(color: const Color(0xFF071531)),
                ),
                child: Text(
                  unreadCount > 99 ? '99+' : '$unreadCount',
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w700,
                    fontSize: 8,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
