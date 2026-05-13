import 'dart:async';

import 'package:flutter/material.dart';

import 'channel_chat_screen.dart';
import 'create_server_event_screen.dart';
import 'models/server_models.dart';
import 'models/server_permissions.dart';
import 'server_settings_hub_screen.dart';
import 'services/server_sidebar_prefs_store.dart';
import 'services/channel_messages_realtime_service.dart';
import 'services/servers_service.dart';
import 'services/voice_channel_session_controller.dart';
import 'voice_channel_room_screen.dart';
import 'server_join_applications_screen.dart';
import 'widgets/channel_context_sheet.dart';
import 'widgets/invite_to_server_sheet.dart';
import 'widgets/server_context_sheet.dart';

class ServerDetailScreen extends StatefulWidget {
  const ServerDetailScreen({
    super.key,
    required this.server,
    required this.currentUserId,
    required this.participantName,
    this.initialTextChannelId,
  });

  final ServerSummary server;
  final String? currentUserId;
  final String participantName;
  /// When set (e.g. from inbox), opens this text channel once after channels load.
  final String? initialTextChannelId;

  @override
  State<ServerDetailScreen> createState() => _ServerDetailScreenState();
}

class _ServerDetailScreenState extends State<ServerDetailScreen> {
  static const Color _pageColor = Color(0xFF08183A);
  static const Color _lineColor = Color(0xFF21345D);
  bool _loading = true;
  String? _error;
  List<ServerCategory> _categories = const [];
  /// Full list from API (server menu: đánh dấu đọc tất cả, v.v.).
  List<ServerChannel> _allTextChannels = const [];
  List<ServerChannel> _allVoiceChannels = const [];
  /// Sau lọc quyền kênh riêng + ẩn kênh tắt âm (prefs).
  List<ServerChannel> _displayTextChannels = const [];
  List<ServerChannel> _displayVoiceChannels = const [];
  CurrentUserServerPermissions _permissions =
      CurrentUserServerPermissions.memberFallback();
  /// Sau khi lưu hồ sơ từ hub / [ServerSettingsHubScreen], cập nhật AppBar.
  ServerSummary? _serverOverride;
  String? _lastOpenedTextChannelId;
  bool _openedInitialChannel = false;
  StreamSubscription<Map<String, dynamic>>? _serverRealtimeSub;
  bool _didAutoPopByRealtime = false;
  int _joinAppPendingCount = 0;

  ServerSummary get _effectiveServer =>
      _serverOverride ?? widget.server;

  @override
  void initState() {
    super.initState();
    _serverRealtimeSub = ChannelMessagesRealtimeService.serverRealtime.listen(
      _onServerRealtimeEvent,
    );
    _loadChannels();
  }

  @override
  void dispose() {
    _serverRealtimeSub?.cancel();
    super.dispose();
  }

  void _onServerRealtimeEvent(Map<String, dynamic> payload) {
    final sid = (payload['serverId'] ?? '').toString();
    if (sid.isEmpty || sid != widget.server.id) return;
    final event = (payload['event'] ?? '').toString();

    if (event == 'server-updated') {
      final rawServer = payload['server'];
      if (rawServer is Map) {
        final mapped = Map<String, dynamic>.from(rawServer);
        if (mounted) {
          setState(() {
            _serverOverride = ServerSummary(
              id: _effectiveServer.id,
              name: (mapped['name'] ?? _effectiveServer.name).toString(),
              description:
                  mapped['description']?.toString() ?? _effectiveServer.description,
              avatarUrl: mapped['avatarUrl']?.toString() ?? _effectiveServer.avatarUrl,
              memberCount: mapped['memberCount'] is num
                  ? (mapped['memberCount'] as num).toInt()
                  : _effectiveServer.memberCount,
              unreadCount: _effectiveServer.unreadCount,
              ownerId: _effectiveServer.ownerId,
              communityEnabled: _effectiveServer.communityEnabled,
            );
          });
        }
      }
      return;
    }

    if (event != 'server-membership-updated') return;
    final action = (payload['action'] ?? '').toString();
    final changedUserId = (payload['userId'] ?? '').toString();
    final myUserId = (widget.currentUserId ?? '').trim();

    // Nếu chính mình rời/bị kick khỏi server đang mở -> thoát màn ngay.
    if (myUserId.isNotEmpty &&
        changedUserId == myUserId &&
        action == 'left' &&
        !_didAutoPopByRealtime &&
        mounted) {
      _didAutoPopByRealtime = true;
      Navigator.of(context).pop('left');
      return;
    }

    // Thành viên join/leave trong server hiện tại -> refresh danh sách kênh/quyền.
    if (mounted) {
      _loadChannels();
    }
  }

  Future<void> _loadChannels() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final channels = await ServersService.getServerChannels(widget.server.id);
      final categories =
          await ServersService.getServerCategories(widget.server.id);
      final perms = await ServersService.getCurrentUserPermissions(
        widget.server.id,
        ownerId: widget.server.ownerId,
        currentUserId: widget.currentUserId,
      );
      final uid = widget.currentUserId ?? '';
      var hideMuted = false;
      if (uid.isNotEmpty) {
        hideMuted =
            await ServerSidebarPrefsStore.hideMutedChannels(uid, widget.server.id);
      }
      final textAll = channels.where((e) => e.isText).toList();
      final voiceAll = channels.where((e) => e.isVoice).toList();
      final textDisplay =
          await _filterChannelsForDisplay(textAll, perms, hideMuted);
      final voiceDisplay =
          await _filterChannelsForDisplay(voiceAll, perms, hideMuted);
      if (!mounted) return;
      setState(() {
        _categories = categories;
        _allTextChannels = textAll;
        _allVoiceChannels = voiceAll;
        _displayTextChannels = textDisplay;
        _displayVoiceChannels = voiceDisplay;
        _permissions = perms;
      });
      unawaited(_refreshJoinApplicationsBadge());
      _maybeOpenInitialTextChannel();
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<List<ServerChannel>> _filterChannelsForDisplay(
    List<ServerChannel> list,
    CurrentUserServerPermissions perms,
    bool hideMuted,
  ) async {
    final uid = widget.currentUserId ?? '';
    final sid = widget.server.id;
    final out = <ServerChannel>[];
    for (final c in list) {
      if (c.isPrivate && !perms.canAccessPrivateChannel) continue;
      if (hideMuted && uid.isNotEmpty) {
        final muted = await ServerSidebarPrefsStore.isChannelOrCategoryMuted(
          uid,
          sid,
          c.id,
          c.categoryId,
        );
        if (muted) continue;
      }
      out.add(c);
    }
    return out;
  }

  Future<void> _refreshJoinApplicationsBadge() async {
    if (!_permissions.canManageJoinApplications) {
      if (mounted) setState(() => _joinAppPendingCount = 0);
      return;
    }
    try {
      final r = await ServersService.listJoinApplications(
        widget.server.id,
        'pending',
      );
      final owner = (widget.server.ownerId ?? '').trim();
      var n = 0;
      for (final e in r.items) {
        final uid = (e['userId'] ?? '').toString().trim();
        if (owner.isNotEmpty && uid == owner) continue;
        n++;
      }
      if (!mounted) return;
      setState(() => _joinAppPendingCount = n);
    } catch (_) {
      if (mounted) setState(() => _joinAppPendingCount = 0);
    }
  }

  Future<void> _openInviteSheet() async {
    if (!_permissions.canCreateInvite) return;
    await InviteToServerSheet.show(context, _effectiveServer);
  }

  Future<void> _openJoinApplications() async {
    if (!_permissions.canManageJoinApplications) return;
    await Navigator.of(context).push<void>(
      MaterialPageRoute(
        builder: (_) => ServerJoinApplicationsScreen(server: _effectiveServer),
      ),
    );
    if (mounted) await _refreshJoinApplicationsBadge();
  }

  Future<void> _openServerSheet() async {
    await ServerContextSheet.show(
      context,
      server: _effectiveServer,
      userId: widget.currentUserId,
      permissions: _permissions,
      textChannels: _allTextChannels,
      onServerChanged: () {
        if (mounted) _loadChannels();
      },
      onLeaveSuccess: () async {
        if (mounted) Navigator.of(context).pop('left');
      },
      onOpenServerSettings: () {
        if (!mounted) return;
        final oid = widget.server.ownerId;
        final uid = widget.currentUserId;
        final isOwner = oid != null &&
            oid.isNotEmpty &&
            uid != null &&
            uid.isNotEmpty &&
            oid == uid;
        Navigator.of(context).push<dynamic>(
          MaterialPageRoute(
            builder: (_) => ServerSettingsHubScreen(
              server: _effectiveServer,
              permissions: _permissions,
              currentUserId: widget.currentUserId,
              isOwner: isOwner,
              communityEnabled: _effectiveServer.communityEnabled,
            ),
          ),
        ).then((result) {
          if (!mounted) return;
          if (result == 'deleted') {
            Navigator.of(context).pop('deleted');
            return;
          }
          if (result is ServerSummary) {
            setState(() => _serverOverride = result);
          }
          _loadChannels();
        });
      },
      onOpenCreateEvent: () {
        if (!mounted) return;
        Navigator.of(context)
            .push<void>(
          MaterialPageRoute(
            builder: (_) => CreateServerEventScreen(
              serverId: widget.server.id,
              textChannels: _allTextChannels,
              voiceChannels: _allVoiceChannels,
            ),
          ),
        )
            .then((_) {
          if (mounted) _loadChannels();
        });
      },
    );
  }

  Future<void> _openChannelSheet(
    ServerChannel channel,
    String? categoryId,
  ) async {
    await ChannelContextSheet.show(
      context,
      server: _effectiveServer,
      channel: channel,
      categoryId: categoryId,
      userId: widget.currentUserId,
      permissions: _permissions,
      onChanged: () {
        if (mounted) _loadChannels();
      },
      onInviteToChannel: () {
        if (!mounted) return;
        if (channel.isText) {
          _openTextChannel(channel);
        } else if (channel.isVoice) {
          _openVoiceChannel(channel);
        }
      },
    );
  }

  void _maybeOpenInitialTextChannel() {
    if (_openedInitialChannel) return;
    final want = widget.initialTextChannelId;
    if (want == null || want.isEmpty) return;
    ServerChannel? match;
    for (final c in _allTextChannels) {
      if (c.id == want) {
        match = c;
        break;
      }
    }
    if (match == null) return;
    _openedInitialChannel = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _openTextChannel(match!);
    });
  }

  void _openTextChannel(ServerChannel channel) {
    _lastOpenedTextChannelId = channel.id;
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => ChannelChatScreen(
          server: _effectiveServer,
          channel: channel,
          currentUserId: widget.currentUserId,
          participantName: widget.participantName,
        ),
      ),
    );
  }

  Future<void> _openVoiceChannel(ServerChannel channel) async {
    VoiceChannelSessionController.instance.clearVoiceMinimized();
    final minimizedToChat =
        await Navigator.of(context, rootNavigator: true).push<bool>(
      MaterialPageRoute(
        fullscreenDialog: true,
        builder: (_) => VoiceChannelRoomScreen(
          server: _effectiveServer,
          channel: channel,
          participantName: widget.participantName,
        ),
      ),
    );
    if (!mounted || minimizedToChat != true) return;
    final chatTarget = _pickChatChannelForQuickReturn();
    if (chatTarget != null) {
      _openTextChannel(chatTarget);
      return;
    }
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Server chưa có kênh chat để mở.'),
      ),
    );
  }

  ServerChannel? _pickChatChannelForQuickReturn() {
    if (_allTextChannels.isEmpty) return null;
    if ((_lastOpenedTextChannelId ?? '').isNotEmpty) {
      final matched =
          _allTextChannels.where((c) => c.id == _lastOpenedTextChannelId);
      if (matched.isNotEmpty) return matched.first;
    }
    final preferred = _allTextChannels.firstWhere(
      (channel) => channel.name.trim().toLowerCase() == 'general',
      orElse: () => _allTextChannels.first,
    );
    return preferred;
  }

  Future<void> _leaveVoiceIfInCurrentServer() async {
    final session = VoiceChannelSessionController.instance;
    if (!session.active) return;
    if (session.serverId != widget.server.id) return;
    await session.leave();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
        backgroundColor: _pageColor,
        appBar: AppBar(
          backgroundColor: _pageColor,
          elevation: 0,
          leading: IconButton(
            icon: const Icon(Icons.arrow_back_rounded),
            onPressed: () async {
              await _leaveVoiceIfInCurrentServer();
              if (!mounted) return;
              Navigator.of(context).pop();
            },
          ),
          title: GestureDetector(
            onLongPress: _openServerSheet,
            child: Text(
              _effectiveServer.name,
              style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
            ),
          ),
          actions: [
            IconButton(
              tooltip: 'Tùy chọn máy chủ',
              icon: const Icon(Icons.more_vert_rounded),
              onPressed: _openServerSheet,
            ),
            if (_permissions.canManageJoinApplications)
              IconButton(
                tooltip: 'Đơn tham gia / duyệt thành viên',
                onPressed: _openJoinApplications,
                icon: Stack(
                  clipBehavior: Clip.none,
                  children: [
                    const Icon(Icons.people_alt_outlined),
                    if (_joinAppPendingCount > 0)
                      const Positioned(
                        right: -2,
                        top: -2,
                        child: SizedBox(
                          width: 8,
                          height: 8,
                          child: DecoratedBox(
                            decoration: BoxDecoration(
                              color: Color(0xFFFF5C5C),
                              shape: BoxShape.circle,
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            if (_permissions.canCreateInvite)
              IconButton(
                tooltip: 'Mời vào máy chủ',
                icon: const Icon(Icons.person_add_alt_1_outlined),
                onPressed: _openInviteSheet,
              ),
          ],
        ),
        body: _loading
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
            : RefreshIndicator(
                onRefresh: _loadChannels,
                child: ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.fromLTRB(0, 6, 0, 20),
                  children: [
                    if (_categories.isNotEmpty)
                      ..._categories.map((cat) {
                        final catText = _displayTextChannels
                            .where((c) => c.categoryId == cat.id)
                            .toList();
                        final catVoice = _displayVoiceChannels
                            .where((c) => c.categoryId == cat.id)
                            .toList();
                        if (catText.isEmpty && catVoice.isEmpty) {
                          return const SizedBox.shrink();
                        }
                        return Column(
                          children: [
                            _SectionHeader(
                              icon: Icons.folder_open_rounded,
                              title: cat.name,
                            ),
                            ...catText.map(
                              (channel) => _ChannelTile(
                                icon: Icons.tag_rounded,
                                title: channel.name,
                                subtitle: channel.description,
                                unreadCount: channel.unreadCount,
                                isPrivate: channel.isPrivate,
                                onTap: () => _openTextChannel(channel),
                                onLongPress: () =>
                                    _openChannelSheet(channel, cat.id),
                              ),
                            ),
                            ...catVoice.map(
                              (channel) => _ChannelTile(
                                icon: Icons.volume_up_rounded,
                                title: channel.name,
                                subtitle: channel.description,
                                unreadCount: channel.unreadCount,
                                isPrivate: channel.isPrivate,
                                onTap: () => _openVoiceChannel(channel),
                                onLongPress: () =>
                                    _openChannelSheet(channel, cat.id),
                              ),
                            ),
                            const Divider(height: 22, color: _lineColor),
                          ],
                        );
                      }),
                    if (_displayTextChannels
                        .where((c) => c.categoryId == null)
                        .isNotEmpty) ...[
                      const _SectionHeader(
                        icon: Icons.tag_rounded,
                        title: 'Kênh chat',
                      ),
                      ..._displayTextChannels
                          .where((c) => c.categoryId == null)
                          .map(
                            (channel) => _ChannelTile(
                              icon: Icons.tag_rounded,
                              title: channel.name,
                              subtitle: channel.description,
                              unreadCount: channel.unreadCount,
                              isPrivate: channel.isPrivate,
                              onTap: () => _openTextChannel(channel),
                              onLongPress: () =>
                                  _openChannelSheet(channel, null),
                            ),
                          ),
                    ],
                    if (_displayVoiceChannels
                        .where((c) => c.categoryId == null)
                        .isNotEmpty) ...[
                      const Divider(height: 22, color: _lineColor),
                      const _SectionHeader(
                        icon: Icons.volume_up_rounded,
                        title: 'Kênh đàm thoại',
                      ),
                      ..._displayVoiceChannels
                          .where((c) => c.categoryId == null)
                          .map(
                            (channel) => _ChannelTile(
                              icon: Icons.volume_up_rounded,
                              title: channel.name,
                              subtitle: channel.description,
                              unreadCount: channel.unreadCount,
                              isPrivate: channel.isPrivate,
                              onTap: () => _openVoiceChannel(channel),
                              onLongPress: () =>
                                  _openChannelSheet(channel, null),
                            ),
                          ),
                    ],
                    if (_allTextChannels.isEmpty && _allVoiceChannels.isEmpty)
                      const Padding(
                        padding: EdgeInsets.only(top: 56),
                        child: Center(
                          child: Text(
                            'Server chưa có kênh nào.',
                            style: TextStyle(
                              color: Color(0xFFAFC0E2),
                              fontSize: 14,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
      );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.icon, required this.title});

  final IconData icon;
  final String title;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 10, 14, 6),
      child: Row(
        children: [
          Icon(icon, color: const Color(0xFFAFC0E2), size: 16),
          const SizedBox(width: 6),
          Text(
            title,
            style: const TextStyle(
              color: Color(0xFFAFC0E2),
              fontSize: 13,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

class _ChannelTile extends StatelessWidget {
  const _ChannelTile({
    required this.icon,
    required this.title,
    required this.onTap,
    this.onLongPress,
    this.subtitle,
    this.unreadCount = 0,
    this.isPrivate = false,
  });

  final IconData icon;
  final String title;
  final String? subtitle;
  final int unreadCount;
  final bool isPrivate;
  final VoidCallback onTap;
  final VoidCallback? onLongPress;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, color: const Color(0xFFC4D4F4)),
          if (isPrivate) ...[
            const SizedBox(width: 4),
            const Icon(Icons.lock_rounded, color: Color(0xFF8EA3CC), size: 14),
          ],
        ],
      ),
      title: Text(
        title,
        style: const TextStyle(
          color: Colors.white,
          fontWeight: FontWeight.w600,
          fontSize: 15,
        ),
      ),
      subtitle: (subtitle ?? '').trim().isEmpty
          ? null
          : Text(
              subtitle!.trim(),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(color: Color(0xFF8EA3CC), fontSize: 12),
            ),
      trailing: unreadCount > 0
          ? Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: const Color(0xFFFF2A45),
                borderRadius: BorderRadius.circular(99),
              ),
              child: Text(
                '$unreadCount',
                style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w700,
                  fontSize: 11,
                ),
              ),
            )
          : const Icon(Icons.chevron_right_rounded, color: Color(0xFF7E8CA8)),
      onTap: onTap,
      onLongPress: onLongPress,
    );
  }
}
