import 'dart:async';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import 'call/dm_call_manager.dart';
import 'channel_chat_screen.dart';
import 'server_detail_screen.dart';
import 'server_list_controller.dart';
import 'message_chat_screen.dart';
import 'search/message_search_sheet.dart';
import 'services/channel_messages_realtime_service.dart';
import 'services/servers_service.dart';
import 'voice_channel_room_screen.dart';
import 'messages_controller.dart';
import 'models/message_thread.dart';
import 'models/server_models.dart';
import 'services/direct_messages_service.dart';
import 'services/messages_media_service.dart';
import 'services/voice_channel_session_controller.dart';
import 'widgets/display_name_styled_text.dart';
import 'widgets/message_folder_dropdown.dart';
import 'widgets/messages_inbox_sheet.dart';
import 'widgets/message_thread_tile.dart';
import 'widgets/dm_conversation_actions_sheet.dart';
import 'messages_settings_screen.dart';
import '../../core/services/accent_color_controller.dart';
import '../../core/services/appearance_preset_controller.dart';
import '../../core/services/language_controller.dart';
import '../../core/services/pending_messages_push_navigation.dart';
import 'utils/messages_navigator.dart';
import 'widgets/messages_boost_store_screen.dart';
import 'widgets/messages_chrome_builder.dart';

class MessageHomeScreen extends StatefulWidget {
  const MessageHomeScreen({super.key, this.initialThread});

  final MessageThread? initialThread;

  @override
  State<MessageHomeScreen> createState() => _MessageHomeScreenState();
}

class _MessageHomeScreenState extends State<MessageHomeScreen> {
  static const String _quickBoost = 'boost';
  static const String _quickSettings = 'settings';
  static const String _quickSwitch = 'switch';

  final TextEditingController _searchController = TextEditingController();
  final MessagesController _messagesController = MessagesController();
  final ServerListController _serverListController = ServerListController();
  StreamSubscription<Map<String, dynamic>>? _serverRealtimeSub;
  Timer? _serverRefreshDebounce;
  bool _isFolderExpanded = false;
  bool _isServerMode = false;

  @override
  void initState() {
    super.initState();
    _messagesController.addListener(_onControllerChanged);
    _serverListController.addListener(_onControllerChanged);
    _messagesController.init();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      await AppearancePresetController.instance.reload();
      await AccentColorController.instance.bindUser(_messagesController.myUserId);
      if (mounted) _serverListController.loadServers();
      if (mounted && widget.initialThread != null) {
        _openThread(widget.initialThread!);
      }
      await _consumePendingPushNavigation();
    });
    _serverRealtimeSub = ChannelMessagesRealtimeService.serverRealtime.listen(
      _onServerRealtimeEvent,
    );
  }

  @override
  void dispose() {
    _messagesController.removeListener(_onControllerChanged);
    _serverListController.removeListener(_onControllerChanged);
    _messagesController.disposeController();
    _messagesController.dispose();
    _serverRealtimeSub?.cancel();
    _serverRefreshDebounce?.cancel();
    _serverListController.dispose();
    _searchController.dispose();
    super.dispose();
  }

  void _onControllerChanged() {
    if (!mounted) return;
    setState(() {});
  }

  void _onServerRealtimeEvent(Map<String, dynamic> payload) {
    final event = (payload['event'] ?? '').toString();
    if (event == 'server-deleted') {
      final sid = (payload['serverId'] ?? '').toString();
      if (sid.isEmpty) return;
      final session = VoiceChannelSessionController.instance;
      if (session.active && session.serverId == sid) {
        unawaited(session.leave());
      }
      _scheduleServerListRefresh();
      final name = (payload['serverName'] ?? '').toString().trim();
      final label = name.isNotEmpty ? name : 'Server';
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              LanguageController.instance.t(
                'chat.popups.inbox.serverDeletedToast',
                {'server': label},
              ),
            ),
          ),
        );
        unawaited(_messagesController.refreshInboxCount());
      }
      return;
    }
    if (event != 'server-updated' && event != 'server-membership-updated') {
      return;
    }
    _scheduleServerListRefresh();
  }

  void _scheduleServerListRefresh() {
    _serverRefreshDebounce?.cancel();
    _serverRefreshDebounce = Timer(const Duration(milliseconds: 250), () {
      if (!mounted) return;
      _serverListController.loadServers();
    });
  }

  Future<void> _consumePendingPushNavigation() async {
    final pending = PendingMessagesPushNavigation.take();
    if (pending == null) return;
    final serverId = (pending['serverId'] ?? '').toString().trim();
    if (serverId.isEmpty) return;

    await _serverListController.loadServers();
    if (!mounted) return;

    ServerSummary? target;
    for (final s in _serverListController.servers) {
      if (s.id == serverId) {
        target = s;
        break;
      }
    }
    if (target == null) return;

    final channelId = (pending['channelId'] ?? '').toString().trim();
    await _openServer(
      target,
      initialTextChannelId: channelId.isEmpty ? null : channelId,
    );
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

  String _t(String key, [Map<String, dynamic>? vars]) =>
      LanguageController.instance.t(key, vars);

  String get _headerTitle => _isServerMode
      ? _t('chat.messagesPage.contextServer')
      : _t('chat.messagesPage.directMessages');

  List<({String id, String label})> get _quickMenuEntries => [
        (id: _quickBoost, label: _t('chat.messagesPage.boostUpgrade')),
        (id: _quickSettings, label: _t('chat.messagesPage.settingsTitle')),
        (
          id: _quickSwitch,
          label: _isServerMode
              ? _t('chat.messagesPage.contextDm')
              : _t('chat.messagesPage.contextServer'),
        ),
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

  void _onQuickMenuTap(String actionLabel) {
    String? action;
    for (final e in _quickMenuEntries) {
      if (e.label == actionLabel) {
        action = e.id;
        break;
      }
    }
    if (action == null) return;
    if (action == _quickSettings) {
      setState(() => _isFolderExpanded = false);
      unawaited(
        MessagesSettingsScreen.show(
          context,
          onSaved: () async {
            if (mounted) setState(() {});
            await _messagesController.refreshChatSettings();
            await _messagesController.refreshMyIdentity();
            await _messagesController.refreshThreads();
          },
        ),
      );
      return;
    }
    if (action == _quickBoost) {
      setState(() => _isFolderExpanded = false);
      unawaited(MessagesBoostStoreScreen.open(context));
      return;
    }
    final shouldSwitchToServer = action == _quickSwitch && !_isServerMode;
    final shouldSwitchToDm = action == _quickSwitch && _isServerMode;
    setState(() {
      if (shouldSwitchToServer) {
        _isServerMode = true;
        _searchController.clear();
        if (_serverListController.servers.isEmpty &&
            !_serverListController.loading) {
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
        await _openServer(server, initialTextChannelId: ch.isEmpty ? null : ch);
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
        await _messagesController.refreshMyIdentity();
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
        : (username.isNotEmpty ? username : LanguageController.instance.t('messages.call.user'));
    final hubResult = await context.pushMessages<dynamic>(
      ServerDetailScreen(
        server: server,
        currentUserId: _messagesController.myUserId,
        participantName: participantName,
        initialTextChannelId: initialTextChannelId,
      ),
    );
    if (!mounted) return;
    await _serverListController.loadServers();
    if (hubResult == 'left' ||
        hubResult == 'join_rejected' ||
        hubResult == 'apply_withdrawn') {
      // list already refreshed above
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
                                contentType:
                                    MessagesMediaService.resolveUploadContentType(
                                      filePath: file.path,
                                      hintedContentType: file.mimeType,
                                    ),
                              );
                              final url = MessagesMediaService.pickDisplayUrl(
                                upload,
                              );
                              if (url.isNotEmpty) {
                                setModalState(() => avatarUrl = url);
                              }
                            } catch (e) {
                              if (!context.mounted) return;
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(
                                  content: Text(LanguageController.instance.t('messages.imageUploadFailed', {'error': e.toString()})),
                                ),
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
                    decoration: InputDecoration(
                      labelText: LanguageController.instance.t('server.settings.serverNameLabel'),
                      labelStyle: const TextStyle(color: Color(0xFFAFC0E2)),
                    ),
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    controller: descController,
                    style: const TextStyle(color: Colors.white),
                    decoration: InputDecoration(
                      labelText: LanguageController.instance.t('server.settings.descriptionLabel'),
                      labelStyle: const TextStyle(color: Color(0xFFAFC0E2)),
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
                style: TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w700,
                ),
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
                            final created = await _serverListController
                                .createServer(
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
                                content: Text(LanguageController.instance.t('messages.failedCreateServer', {'error': e.toString()})),
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
    context.pushMessages(
      MessageChatScreen(
        thread: thread,
        controller: _messagesController,
        onOpenJoinedServer: (serverId, {channelId}) async {
          await _serverListController.loadServers();
          if (!mounted) return;
          for (final s in _serverListController.servers) {
            if (s.id == serverId) {
              final ch = (channelId ?? '').trim();
              await _openServer(
                s,
                initialTextChannelId: ch.isEmpty ? null : ch,
              );
              return;
            }
          }
        },
      ),
    );
  }

  String _participantNameForVoice() {
    final displayName = (_messagesController.myDisplayName ?? '').trim();
    final username = (_messagesController.myUsername ?? '').trim();
    return displayName.isNotEmpty
        ? displayName
        : (username.isNotEmpty ? username : LanguageController.instance.t('messages.call.user'));
  }

  Future<void> _openGlobalMessageSearch() async {
    if (_serverListController.servers.isEmpty) {
      await _serverListController.loadServers();
    }
    if (!mounted) return;
    final threads = _messagesController.filteredThreads;
    final servers = _serverListController.servers;
    Future<QuickSwitchServerData?> loadQuick(ServerSummary s) async {
      try {
        final ch = await ServersService.getServerChannels(s.id);
        final text = ch
            .where(
              (c) =>
                  c.isText && (c.category ?? '').trim().toLowerCase() != 'info',
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

    final quick = (await Future.wait(
      servers.map(loadQuick),
    )).whereType<QuickSwitchServerData>().toList();
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
            final channels = await ServersService.getServerChannels(
              chosenServer.id,
            );
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
              await context.pushMessages(
                VoiceChannelRoomScreen(
                  server: chosenServer,
                  channel: chosenChannel,
                  participantName: name,
                ),
              );
            } else {
              await context.pushMessages(
                ChannelChatScreen(
                  server: chosenServer,
                  channel: chosenChannel,
                  currentUserId: _messagesController.myUserId,
                  participantName: name,
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
      avatarUrl: (server.avatarUrl ?? '').trim().isEmpty
          ? null
          : server.avatarUrl,
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
                label: Text(LanguageController.instance.t('messages.createNewServer')),
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
                        selected:
                            _serverListController.selectedServerId == server.id,
                        onTap: () => _openServer(server),
                      );
                    },
                  ),
                ),
              ),
            ],
          ),
        ),
        Divider(
          height: 1,
          color: AccentColorController.instance.palette.border,
        ),
        Expanded(
          child: ListView.separated(
            itemCount: servers.length,
            separatorBuilder: (_, __) => Divider(
              height: 1,
              color: AccentColorController.instance.palette.border,
            ),
            itemBuilder: (context, index) {
              final server = servers[index];
              return MessageThreadTile(
                thread: _toServerThread(server),
                showActivityLabel: false,
                onTap: () => _openServer(server),
              );
            },
          ),
        ),
      ],
    );
  }

  // ── Galaxy helpers ─────────────────────────────────────────────────────────

  static const _kCyan   = Color(0xFF22D3EE);
  static const _kPurple = Color(0xFF7C3AED);

  PreferredSizeWidget _buildGalaxyAppBar() {
    return PreferredSize(
      preferredSize: const Size.fromHeight(53),
      child: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xFF03060F), Color(0xFF060C22)],
          ),
        ),
        child: SafeArea(
          bottom: false,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              SizedBox(
                height: 52,
                child: Row(
                  children: [
                    const Padding(
                      padding: EdgeInsets.only(left: 12),
                      child: SizedBox(
                        width: 26,
                        height: 26,
                        child: Image(
                          image: AssetImage('assets/images/cordigram-logo.png'),
                          fit: BoxFit.contain,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(child: _buildGalaxyTitleDropdown()),
                    Padding(
                      padding: const EdgeInsets.only(right: 12),
                      child: _buildGalaxyInboxBtn(),
                    ),
                  ],
                ),
              ),
              // Cyan→purple accent line
              Container(
                height: 1,
                decoration: const BoxDecoration(
                  gradient: LinearGradient(
                    colors: [
                      Colors.transparent,
                      _kPurple,
                      _kCyan,
                      Colors.transparent,
                    ],
                    stops: [0.0, 0.3, 0.7, 1.0],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildGalaxyTitleDropdown() {
    return GestureDetector(
      onTap: _toggleFolder,
      behavior: HitTestBehavior.opaque,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Flexible(
            child: Text(
              _headerTitle,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: Color(0xFFD8EAFF),
                fontSize: 15,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.4,
              ),
            ),
          ),
          const SizedBox(width: 4),
          AnimatedRotation(
            turns: _isFolderExpanded ? 0.25 : 0,
            duration: const Duration(milliseconds: 200),
            child: Container(
              width: 22,
              height: 22,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(6),
                color: const Color(0xFF0C1A2E),
                border: Border.all(
                  color: const Color(0xFF1E3A6E).withValues(alpha: 0.70),
                ),
              ),
              child: const Icon(
                Icons.arrow_forward_ios_rounded,
                size: 10,
                color: _kCyan,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildGalaxyInboxBtn() {
    return Stack(
      clipBehavior: Clip.none,
      children: [
        Material(
          color: Colors.transparent,
          borderRadius: BorderRadius.circular(10),
          child: InkWell(
            borderRadius: BorderRadius.circular(10),
            onTap: _openInboxSheet,
            child: Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(10),
                color: const Color(0xFF0C1A2E).withValues(alpha: 0.65),
                border: Border.all(
                  color: const Color(0xFF1E3A6E).withValues(alpha: 0.65),
                ),
              ),
              child: const Icon(
                Icons.mail_outline_rounded,
                size: 18,
                color: Color(0xFF8BB8E8),
              ),
            ),
          ),
        ),
        if (_messagesController.inboxUnreadCount > 0)
          Positioned(
            right: -3,
            top: -3,
            child: Container(
              width: 11,
              height: 11,
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [Color(0xFFEF4444), Color(0xFFFF6B6B)],
                ),
                shape: BoxShape.circle,
                border: Border.all(color: const Color(0xFF060C22), width: 1.5),
                boxShadow: [
                  BoxShadow(
                    color: const Color(0xFFEF4444).withValues(alpha: 0.50),
                    blurRadius: 6,
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }

  Widget _buildGalaxySearchBar() {
    return Container(
      margin: const EdgeInsets.fromLTRB(12, 8, 12, 12),
      height: 44,
      decoration: BoxDecoration(
        color: const Color(0xFF060E1E).withValues(alpha: 0.82),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: const Color(0xFF1E3A6E).withValues(alpha: 0.65),
        ),
        boxShadow: [
          BoxShadow(
            color: _kCyan.withValues(alpha: 0.04),
            blurRadius: 12,
          ),
        ],
      ),
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          splashColor: _kCyan.withValues(alpha: 0.05),
          onTap: _openGlobalMessageSearch,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14),
            child: Row(
              children: [
                const Icon(Icons.search_rounded, color: Color(0xFF3A6A9E), size: 20),
                const SizedBox(width: 10),
                Text(
                  _t('chat.messagesPage.searchPlaceholder'),
                  style: const TextStyle(
                    color: Color(0xFF364E6E),
                    fontSize: 13.5,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildGalaxyServerSearchBar() {
    return Container(
      margin: const EdgeInsets.fromLTRB(12, 8, 12, 12),
      decoration: BoxDecoration(
        color: const Color(0xFF060E1E).withValues(alpha: 0.82),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: const Color(0xFF1E3A6E).withValues(alpha: 0.65),
        ),
      ),
      child: TextField(
        controller: _searchController,
        onChanged: (_) => setState(() {}),
        style: const TextStyle(color: Color(0xFFD8EAFF), fontSize: 13.5),
        decoration: InputDecoration(
          hintText: _t('chat.popups.messageSearch.quickSwitchServers'),
          hintStyle: const TextStyle(color: Color(0xFF364E6E), fontSize: 13.5),
          prefixIcon: const Icon(Icons.search_rounded, color: Color(0xFF3A6A9E), size: 20),
          isDense: true,
          contentPadding: const EdgeInsets.symmetric(horizontal: 8, vertical: 12),
          border: InputBorder.none,
          enabledBorder: InputBorder.none,
          focusedBorder: InputBorder.none,
        ),
      ),
    );
  }

  Widget _buildGalaxyDivider() {
    return Container(
      height: 1,
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            Colors.transparent,
            const Color(0xFF1E3A6E).withValues(alpha: 0.65),
            Colors.transparent,
          ],
          stops: const [0.0, 0.5, 1.0],
        ),
      ),
    );
  }

  Widget _buildGalaxyEmptyState() {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 68,
            height: 68,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: const Color(0xFF060E1E),
              border: Border.all(
                color: const Color(0xFF1E3A6E).withValues(alpha: 0.65),
              ),
              boxShadow: [
                BoxShadow(
                  color: _kCyan.withValues(alpha: 0.10),
                  blurRadius: 22,
                  spreadRadius: 2,
                ),
              ],
            ),
            child: const Icon(
              Icons.chat_bubble_outline_rounded,
              color: Color(0xFF3A6A9E),
              size: 28,
            ),
          ),
          const SizedBox(height: 16),
          const Text(
            'No conversations yet',
            style: TextStyle(
              color: Color(0xFF4A6A9E),
              fontSize: 14,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 5),
          const Text(
            'Start a new conversation',
            style: TextStyle(color: Color(0xFF2A4060), fontSize: 12),
          ),
        ],
      ),
    );
  }

  Widget _buildGalaxyBottomBar() {
    final dn = (_messagesController.myDisplayName ?? '').trim();
    final un = (_messagesController.myUsername ?? '').trim();
    final displayText = dn.isNotEmpty
        ? dn
        : (un.isNotEmpty ? un : _t('chat.messagesPage.userFallback'));
    final letter = displayText.trim().isNotEmpty
        ? displayText.trim().substring(0, 1).toUpperCase()
        : 'U';
    final avatarUrl = _messagesController.myAvatarUrl;

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        // Gradient accent line
        Container(
          height: 1,
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              colors: [
                Colors.transparent,
                _kPurple,
                _kCyan,
                Colors.transparent,
              ],
              stops: [0.0, 0.3, 0.7, 1.0],
            ),
          ),
        ),
        Container(
          height: 52,
          padding: const EdgeInsets.symmetric(horizontal: 14),
          color: const Color(0xFF040810),
          child: Row(
            children: [
              // My avatar
              Stack(
                clipBehavior: Clip.none,
                children: [
                  Container(
                    width: 30,
                    height: 30,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: const Color(0xFF1E3A6E).withValues(alpha: 0.70),
                      ),
                    ),
                    child: ClipOval(
                      child: (avatarUrl ?? '').isNotEmpty
                          ? Image.network(
                              avatarUrl!,
                              fit: BoxFit.cover,
                              errorBuilder: (_, __, ___) =>
                                  _GalaxyBottomAvatar(letter: letter),
                            )
                          : _GalaxyBottomAvatar(letter: letter),
                    ),
                  ),
                  if (_messagesController.myOnline)
                    Positioned(
                      right: -1,
                      bottom: -1,
                      child: Container(
                        width: 9,
                        height: 9,
                        decoration: BoxDecoration(
                          color: _kCyan,
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: const Color(0xFF040810),
                            width: 1.5,
                          ),
                          boxShadow: [
                            BoxShadow(
                              color: _kCyan.withValues(alpha: 0.55),
                              blurRadius: 6,
                            ),
                          ],
                        ),
                      ),
                    ),
                ],
              ),
              const SizedBox(width: 8),
              // Name + username
              Expanded(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    DisplayNameStyledText(
                      text: displayText,
                      style: _messagesController.myDisplayNameStyle,
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      fallbackColor: const Color(0xFFD8EAFF),
                    ),
                    if (un.isNotEmpty)
                      Text(
                        un,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: Color(0xFF3A5A80),
                          fontSize: 10,
                          height: 1.2,
                        ),
                      ),
                  ],
                ),
              ),
              // Mic
              _GalaxyIconBtn(
                icon: _globalMicMuted
                    ? Icons.mic_off_rounded
                    : Icons.mic_none_rounded,
                muted: _globalMicMuted,
                onTap: () => unawaited(_toggleGlobalMic()),
              ),
              const SizedBox(width: 6),
              // Sound
              _GalaxyIconBtn(
                icon: _globalSoundMuted
                    ? Icons.headset_off_rounded
                    : Icons.headset_rounded,
                muted: _globalSoundMuted,
                onTap: () => unawaited(_toggleGlobalSound()),
              ),
            ],
          ),
        ),
      ],
    );
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final threads = _messagesController.filteredThreads;
    final servers = _filteredServers;

    return MessagesChromeBuilder(
      builder: (context, chrome) {
        final isGalaxy = chrome.bg == Colors.transparent;
        final muted = chrome.textMuted;
        final onSurface = chrome.text;
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
          backgroundColor: chrome.bg,
          appBar: isGalaxy
              ? _buildGalaxyAppBar()
              : AppBar(
                  backgroundColor: chrome.bg,
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
                            tooltip: _t('chat.messagesPage.inboxTitle'),
                            onPressed: _openInboxSheet,
                            constraints: const BoxConstraints.tightFor(
                              width: 30,
                              height: 30,
                            ),
                            padding: EdgeInsets.zero,
                            splashRadius: 18,
                            icon: Icon(
                              Icons.mail_outline_rounded,
                              size: 21,
                              color: onSurface,
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
                    items: _quickMenuEntries.map((e) => e.label).toList(),
                    onSelected: _onQuickMenuTap,
                  ),
                ),
              if (isGalaxy)
                _isServerMode
                    ? _buildGalaxyServerSearchBar()
                    : _buildGalaxySearchBar()
              else
                Padding(
                  padding: const EdgeInsets.fromLTRB(12, 6, 12, 12),
                  child: _isServerMode
                      ? TextField(
                          controller: _searchController,
                          onChanged: (_) => setState(() {}),
                          decoration: InputDecoration(
                            hintText: _t('chat.popups.messageSearch.quickSwitchServers'),
                            hintStyle: TextStyle(color: muted, fontSize: 13),
                            isDense: true,
                            contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(22),
                              borderSide: BorderSide(color: chrome.border, width: 1),
                            ),
                            enabledBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(22),
                              borderSide: BorderSide(color: chrome.border, width: 1),
                            ),
                            focusedBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(22),
                              borderSide: BorderSide(color: chrome.accent, width: 1.2),
                            ),
                          ),
                        )
                      : TextField(
                          readOnly: true,
                          onTap: _openGlobalMessageSearch,
                          decoration: InputDecoration(
                            hintText: _t('chat.messagesPage.searchPlaceholder'),
                            hintStyle: TextStyle(color: muted, fontSize: 13),
                            prefixIcon: Icon(Icons.search_rounded, color: muted, size: 22),
                            isDense: true,
                            contentPadding: const EdgeInsets.symmetric(horizontal: 8, vertical: 10),
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(22),
                              borderSide: BorderSide(color: chrome.border, width: 1),
                            ),
                            enabledBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(22),
                              borderSide: BorderSide(color: chrome.border, width: 1),
                            ),
                            focusedBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(22),
                              borderSide: BorderSide(color: chrome.border, width: 1),
                            ),
                          ),
                        ),
                ),
              isGalaxy
                  ? _buildGalaxyDivider()
                  : Divider(height: 1, thickness: 1, color: chrome.border),
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
                            style: TextStyle(color: muted),
                          ),
                        ),
                      )
                    : threads.isEmpty
                    ? (isGalaxy ? _buildGalaxyEmptyState() : Center(
                        child: Text(
                          'No conversations found',
                          style: TextStyle(color: muted, fontWeight: FontWeight.w500),
                        ),
                      ))
                    : ListView.separated(
                        itemCount: threads.length,
                        separatorBuilder: (_, __) => isGalaxy
                            ? _buildGalaxyDivider()
                            : Divider(height: 1, color: chrome.border),
                        itemBuilder: (context, index) {
                          final thread = threads[index];
                          return MessageThreadTile(
                            thread: thread,
                            showActivityLabel: !_isServerMode,
                            onTap: () => _openThread(thread),
                            onLongPress: _isServerMode
                                ? null
                                : () => DmConversationActionsSheet.show(
                                      context,
                                      thread: thread,
                                      controller: _messagesController,
                                    ),
                          );
                        },
                      ),
              ),
            ],
          ),
          bottomNavigationBar: isGalaxy
              ? _buildGalaxyBottomBar()
              : Container(
                  height: 42,
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  decoration: BoxDecoration(
                    color: chrome.panelSidebar,
                    border: Border(top: BorderSide(color: chrome.border)),
                  ),
                  child: Row(
                    children: [
                      Stack(
                        clipBehavior: Clip.none,
                        children: [
                          CircleAvatar(
                            radius: 10,
                            backgroundColor: chrome.surfaceMuted,
                            backgroundImage: (_messagesController.myAvatarUrl ?? '').isNotEmpty
                                ? NetworkImage(_messagesController.myAvatarUrl!)
                                : null,
                            child: (_messagesController.myAvatarUrl ?? '').isNotEmpty
                                ? null
                                : Text(
                                    ((_messagesController.myDisplayName ?? _messagesController.myUsername ?? 'U').trim().isNotEmpty
                                        ? (_messagesController.myDisplayName ?? _messagesController.myUsername ?? 'U').trim().substring(0, 1).toUpperCase()
                                        : 'U'),
                                    style: TextStyle(color: onSurface, fontSize: 11, fontWeight: FontWeight.w700),
                                  ),
                          ),
                          if (_messagesController.myOnline)
                            Positioned(
                              right: -1,
                              bottom: -1,
                              child: Container(
                                width: 8,
                                height: 8,
                                decoration: BoxDecoration(
                                  color: const Color(0xFF31C56F),
                                  shape: BoxShape.circle,
                                  border: Border.all(color: chrome.panelSidebar, width: 1.5),
                                ),
                              ),
                            ),
                        ],
                      ),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            DisplayNameStyledText(
                              text: () {
                                final dn = (_messagesController.myDisplayName ?? '').trim();
                                final un = (_messagesController.myUsername ?? '').trim();
                                if (dn.isNotEmpty) return dn;
                                if (un.isNotEmpty) return un;
                                return _t('chat.messagesPage.userFallback');
                              }(),
                              style: _messagesController.myDisplayNameStyle,
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              fallbackColor: onSurface,
                            ),
                            if ((_messagesController.myUsername ?? '').trim().isNotEmpty)
                              Text(
                                _messagesController.myUsername!.trim(),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(color: muted, fontSize: 9, height: 1.2),
                              ),
                          ],
                        ),
                      ),
                      const Spacer(),
                      IconButton(
                        onPressed: () => unawaited(_toggleGlobalMic()),
                        iconSize: 16,
                        padding: EdgeInsets.zero,
                        constraints: const BoxConstraints.tightFor(width: 26, height: 26),
                        icon: Icon(
                          _globalMicMuted ? Icons.mic_off_rounded : Icons.mic_none_rounded,
                          color: _globalMicMuted ? Theme.of(context).colorScheme.error : muted,
                        ),
                      ),
                      IconButton(
                        onPressed: () => unawaited(_toggleGlobalSound()),
                        iconSize: 16,
                        padding: EdgeInsets.zero,
                        constraints: const BoxConstraints.tightFor(width: 26, height: 26),
                        icon: Icon(
                          _globalSoundMuted ? Icons.headset_off_rounded : Icons.headset_rounded,
                          color: _globalSoundMuted ? Theme.of(context).colorScheme.error : muted,
                        ),
                      ),
                    ],
                  ),
                ),
        ),
      ),
    );
      },
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
    final scheme = Theme.of(context).colorScheme;
    final hasImage = (imageUrl ?? '').isNotEmpty;
    final letter = (label ?? '').trim().isNotEmpty ? (label!.trim().substring(0, 1).toUpperCase()) : '?';
    final onCircle = selected ? scheme.onPrimary : scheme.onSurface;
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
                color: selected ? scheme.primary : scheme.surfaceContainerHighest,
                shape: BoxShape.circle,
                border: Border.all(
                  color: selected ? scheme.onPrimary : scheme.outline,
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
                            style: TextStyle(
                              color: onCircle,
                              fontWeight: FontWeight.w700,
                              fontSize: 16,
                            ),
                          ),
                        ),
                      ),
                    )
                  : Center(
                      child: icon != null
                          ? Icon(icon, color: onCircle, size: 24)
                          : Text(
                              letter,
                              style: TextStyle(
                                color: onCircle,
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
                  color: scheme.error,
                  borderRadius: BorderRadius.circular(99),
                  border: Border.all(color: scheme.surface),
                ),
                child: Text(
                  unreadCount > 99 ? '99+' : '$unreadCount',
                  style: TextStyle(
                    color: scheme.onError,
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

// ── Galaxy bottom bar helpers ─────────────────────────────────────────────────

class _GalaxyBottomAvatar extends StatelessWidget {
  const _GalaxyBottomAvatar({required this.letter});
  final String letter;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF162A50), Color(0xFF0A1628)],
        ),
      ),
      child: Center(
        child: Text(
          letter,
          style: const TextStyle(
            color: Color(0xFF6A9ACA),
            fontWeight: FontWeight.w700,
            fontSize: 13,
          ),
        ),
      ),
    );
  }
}

class _GalaxyIconBtn extends StatelessWidget {
  const _GalaxyIconBtn({
    required this.icon,
    required this.muted,
    required this.onTap,
  });

  final IconData icon;
  final bool muted;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 30,
        height: 30,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(8),
          color: const Color(0xFF060E1E).withValues(alpha: 0.65),
          border: Border.all(
            color: const Color(0xFF1E3A6E).withValues(alpha: 0.55),
          ),
        ),
        child: Icon(
          icon,
          size: 15,
          color: muted ? const Color(0xFFEF4444) : const Color(0xFF7A99C8),
        ),
      ),
    );
  }
}
