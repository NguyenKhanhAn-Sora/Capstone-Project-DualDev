import 'package:flutter/material.dart';

import 'models/channel_message.dart';
import 'models/dm_message.dart';
import 'services/channel_messages_service.dart';
import 'services/direct_messages_service.dart';

class PinnedMessagesScreen extends StatefulWidget {
  const PinnedMessagesScreen.dm({
    super.key,
    required this.peerUserId,
  }) : channelId = null;

  const PinnedMessagesScreen.channel({
    super.key,
    required this.channelId,
  }) : peerUserId = null;

  final String? peerUserId;
  final String? channelId;

  @override
  State<PinnedMessagesScreen> createState() => _PinnedMessagesScreenState();
}

class _PinnedMessagesScreenState extends State<PinnedMessagesScreen> {
  static final RegExp _imageUrlRegExp = RegExp(
    r'^https?:\/\/.+\.(png|jpe?g|gif|webp)(\?.*)?$',
    caseSensitive: false,
  );
  static final RegExp _videoUrlRegExp = RegExp(
    r'^https?:\/\/.+\.(mp4|mov|webm|m4v)(\?.*)?$',
    caseSensitive: false,
  );
  static final RegExp _inviteRegExp = RegExp(
    r'https?:\/\/(?:www\.)?cordigram\.com\/invite\/server\/[a-fA-F0-9]{24}',
    caseSensitive: false,
  );
  bool _loading = true;
  String? _error;
  List<_PinnedRow> _rows = const <_PinnedRow>[];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      if (widget.peerUserId != null) {
        final rows = await DirectMessagesService.getPinnedMessages(
          widget.peerUserId!,
        );
        _rows = rows
            .map(
              (e) => _PinnedRow(
                id: e.id,
                senderLabel: _dmSenderLabel(e),
                senderAvatarUrl: _dmSenderAvatar(e),
                content: e.content,
                createdAt: e.createdAt,
              ),
            )
            .toList();
      } else if (widget.channelId != null) {
        final rows = await ChannelMessagesService.getPinnedMessages(
          widget.channelId!,
        );
        _rows = rows
            .map(
              (e) => _PinnedRow(
                id: e.id,
                senderLabel: _channelSenderLabel(e),
                senderAvatarUrl: e.senderAvatarUrl,
                content: e.content,
                createdAt: e.createdAt,
              ),
            )
            .toList();
      } else {
        _rows = const <_PinnedRow>[];
      }
    } catch (e) {
      _error = e.toString();
    } finally {
      if (mounted) {
        setState(() {
          _loading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: const Text('Tin nhắn đã ghim'),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
          ? Center(
              child: Text(
                _error!,
                style: const TextStyle(color: Colors.white70),
                textAlign: TextAlign.center,
              ),
            )
          : _rows.isEmpty
          ? const Center(
              child: Text(
                'Chưa có tin nhắn đã ghim',
                style: TextStyle(color: Colors.white70),
              ),
            )
          : ListView.separated(
              itemCount: _rows.length,
              separatorBuilder: (_, __) =>
                  const Divider(height: 1, color: Color(0xFF1D1D1D)),
              itemBuilder: (context, index) {
                final row = _rows[index];
                return ListTile(
                  onTap: () => Navigator.of(context).pop(row.id),
                  leading: CircleAvatar(
                    radius: 18,
                    backgroundColor: const Color(0xFF202225),
                    backgroundImage: _validUrl(row.senderAvatarUrl)
                        ? NetworkImage(row.senderAvatarUrl!)
                        : null,
                    child: !_validUrl(row.senderAvatarUrl)
                        ? Text(
                            _senderInitial(row.senderLabel),
                            style: const TextStyle(
                              color: Colors.white70,
                              fontWeight: FontWeight.w700,
                            ),
                          )
                        : null,
                  ),
                  title: _buildPinnedContent(row),
                  subtitle: Text(
                    '${row.senderLabel} • ${_dateLabel(row.createdAt)}',
                    style: const TextStyle(color: Colors.white54),
                  ),
                );
              },
            ),
    );
  }

  String _dateLabel(DateTime dt) {
    final d = dt.toLocal();
    return '${d.day}/${d.month}';
  }

  String _dmSenderLabel(DmMessage m) {
    final display = m.senderDisplayName?.trim();
    if (display != null && display.isNotEmpty) return display;
    final username = m.senderUsername?.trim();
    if (username != null && username.isNotEmpty) return username;
    return m.senderId;
  }

  String? _dmSenderAvatar(DmMessage m) {
    final avatar = m.senderAvatarUrl?.trim();
    if (avatar == null || avatar.isEmpty) return null;
    return avatar;
  }

  String _channelSenderLabel(ChannelMessage m) {
    final v = m.senderName.trim();
    if (v.isNotEmpty) return v;
    return m.senderId;
  }

  bool _validUrl(String? value) {
    final v = value?.trim();
    if (v == null || v.isEmpty) return false;
    return v.startsWith('http://') || v.startsWith('https://');
  }

  String _senderInitial(String value) {
    final v = value.trim();
    if (v.isEmpty) return '?';
    return v.substring(0, 1).toUpperCase();
  }

  Widget _buildPinnedContent(_PinnedRow row) {
    final text = row.content.trim();
    if (text.isEmpty) {
      return const Text('(Tin nhắn trống)', style: TextStyle(color: Colors.white));
    }

    if (_inviteRegExp.hasMatch(text)) {
      return const Text(
        'Lời mời vào máy chủ',
        style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
      );
    }

    if (_imageUrlRegExp.hasMatch(text)) {
      return ClipRRect(
        borderRadius: BorderRadius.circular(8),
        child: Image.network(
          text,
          height: 120,
          fit: BoxFit.cover,
          errorBuilder: (_, __, ___) =>
              const Text('Ảnh', style: TextStyle(color: Colors.white)),
        ),
      );
    }

    if (_videoUrlRegExp.hasMatch(text)) {
      return const Text(
        'Video',
        style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
      );
    }

    return Text(text, style: const TextStyle(color: Colors.white));
  }
}

class _PinnedRow {
  const _PinnedRow({
    required this.id,
    required this.senderLabel,
    this.senderAvatarUrl,
    required this.content,
    required this.createdAt,
  });

  final String id;
  final String senderLabel;
  final String? senderAvatarUrl;
  final String content;
  final DateTime createdAt;
}
