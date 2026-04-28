import 'package:flutter/material.dart';

import 'channel_chat_screen.dart';
import 'models/server_models.dart';
import 'services/servers_service.dart';
import 'services/voice_channel_session_controller.dart';
import 'voice_channel_room_screen.dart';

class ServerDetailScreen extends StatefulWidget {
  const ServerDetailScreen({
    super.key,
    required this.server,
    required this.currentUserId,
    required this.participantName,
  });

  final ServerSummary server;
  final String? currentUserId;
  final String participantName;

  @override
  State<ServerDetailScreen> createState() => _ServerDetailScreenState();
}

class _ServerDetailScreenState extends State<ServerDetailScreen> {
  static const Color _pageColor = Color(0xFF08183A);
  static const Color _lineColor = Color(0xFF21345D);
  bool _loading = true;
  String? _error;
  List<ServerCategory> _categories = const [];
  List<ServerChannel> _textChannels = const [];
  List<ServerChannel> _voiceChannels = const [];
  String? _lastOpenedTextChannelId;

  @override
  void initState() {
    super.initState();
    _loadChannels();
  }

  Future<void> _loadChannels() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final results = await Future.wait([
        ServersService.getServerChannels(widget.server.id),
        ServersService.getServerCategories(widget.server.id),
      ]);
      final channels = results[0] as List<ServerChannel>;
      final categories = results[1] as List<ServerCategory>;
      if (!mounted) return;
      setState(() {
        _categories = categories;
        _textChannels = channels.where((e) => e.isText).toList();
        _voiceChannels = channels.where((e) => e.isVoice).toList();
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _openTextChannel(ServerChannel channel) {
    _lastOpenedTextChannelId = channel.id;
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => ChannelChatScreen(
          server: widget.server,
          channel: channel,
          currentUserId: widget.currentUserId,
          participantName: widget.participantName,
        ),
      ),
    );
  }

  Future<void> _openVoiceChannel(ServerChannel channel) async {
    final minimizedToChat = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => VoiceChannelRoomScreen(
          server: widget.server,
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
    if (_textChannels.isEmpty) return null;
    if ((_lastOpenedTextChannelId ?? '').isNotEmpty) {
      final matched = _textChannels.where((c) => c.id == _lastOpenedTextChannelId);
      if (matched.isNotEmpty) return matched.first;
    }
    final preferred = _textChannels.firstWhere(
      (channel) => channel.name.trim().toLowerCase() == 'general',
      orElse: () => _textChannels.first,
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
          title: Text(
            widget.server.name,
            style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
          ),
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
                        final catText = _textChannels
                            .where((c) => c.categoryId == cat.id)
                            .toList();
                        final catVoice = _voiceChannels
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
                              ),
                            ),
                            ...catVoice.map(
                              (channel) => _ChannelTile(
                                icon: Icons.volume_up_rounded,
                                title: channel.name,
                                subtitle: channel.description,
                                unreadCount: channel.unreadCount,
                                isPrivate: channel.isPrivate,
                                trailingText: 'Tham gia',
                                onTap: () => _openVoiceChannel(channel),
                              ),
                            ),
                            const Divider(height: 22, color: _lineColor),
                          ],
                        );
                      }),
                    if (_textChannels.where((c) => c.categoryId == null).isNotEmpty) ...[
                      const _SectionHeader(
                        icon: Icons.tag_rounded,
                        title: 'Kênh chat',
                      ),
                      ..._textChannels
                          .where((c) => c.categoryId == null)
                          .map(
                            (channel) => _ChannelTile(
                              icon: Icons.tag_rounded,
                              title: channel.name,
                              subtitle: channel.description,
                              unreadCount: channel.unreadCount,
                              isPrivate: channel.isPrivate,
                              onTap: () => _openTextChannel(channel),
                            ),
                          ),
                    ],
                    if (_voiceChannels.where((c) => c.categoryId == null).isNotEmpty) ...[
                      const Divider(height: 22, color: _lineColor),
                      const _SectionHeader(
                        icon: Icons.volume_up_rounded,
                        title: 'Kênh đàm thoại',
                      ),
                      ..._voiceChannels
                          .where((c) => c.categoryId == null)
                          .map(
                            (channel) => _ChannelTile(
                              icon: Icons.volume_up_rounded,
                              title: channel.name,
                              subtitle: channel.description,
                              unreadCount: channel.unreadCount,
                              isPrivate: channel.isPrivate,
                              trailingText: 'Tham gia',
                              onTap: () => _openVoiceChannel(channel),
                            ),
                          ),
                    ],
                    if (_textChannels.isEmpty && _voiceChannels.isEmpty)
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
    this.subtitle,
    this.trailingText,
    this.unreadCount = 0,
    this.isPrivate = false,
  });

  final IconData icon;
  final String title;
  final String? subtitle;
  final String? trailingText;
  final int unreadCount;
  final bool isPrivate;
  final VoidCallback onTap;

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
          : (trailingText == null
                ? const Icon(Icons.chevron_right_rounded, color: Color(0xFF7E8CA8))
                : Text(
                    trailingText!,
                    style: const TextStyle(
                      color: Color(0xFF7FB6FF),
                      fontWeight: FontWeight.w700,
                      fontSize: 12,
                    ),
                  )),
      onTap: onTap,
    );
  }
}
