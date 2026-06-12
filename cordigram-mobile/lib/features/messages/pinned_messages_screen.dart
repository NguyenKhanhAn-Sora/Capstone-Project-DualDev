import 'package:flutter/material.dart';

import '../../core/theme/messages_chrome_palette.dart';
import 'models/channel_message.dart';
import 'models/dm_message.dart';
import 'services/channel_messages_service.dart';
import 'services/direct_messages_service.dart';
import 'utils/messages_i18n.dart';
import 'widgets/messages_chrome_builder.dart';

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

  String _t(String key) => MessagesI18n.t(key);

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
      }
    } catch (e) {
      _error = e.toString();
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return MessagesChromeBuilder(
      builder: (context, chrome) => Scaffold(
        backgroundColor: chrome.bg,
        appBar: AppBar(
          backgroundColor: chrome.bg,
          foregroundColor: chrome.text,
          elevation: 0,
          title: Text(
            _t('chat.pinnedScreen.title'),
            style: TextStyle(color: chrome.text),
          ),
        ),
        body: _loading
            ? Center(
                child: CircularProgressIndicator(color: chrome.accent),
              )
            : _error != null
            ? Center(
                child: Text(
                  _error!,
                  style: TextStyle(color: chrome.textMuted),
                  textAlign: TextAlign.center,
                ),
              )
            : _rows.isEmpty
            ? Center(
                child: Text(
                  _t('chat.pinnedScreen.empty'),
                  style: TextStyle(color: chrome.textMuted),
                ),
              )
            : ListView.separated(
                itemCount: _rows.length,
                separatorBuilder: (_, __) =>
                    Divider(height: 1, color: chrome.border),
                itemBuilder: (context, index) {
                  final row = _rows[index];
                  return ListTile(
                    onTap: () => Navigator.of(context).pop(row.id),
                    leading: CircleAvatar(
                      radius: 18,
                      backgroundColor: chrome.surfaceMuted,
                      backgroundImage: _validUrl(row.senderAvatarUrl)
                          ? NetworkImage(row.senderAvatarUrl!)
                          : null,
                      child: !_validUrl(row.senderAvatarUrl)
                          ? Text(
                              _senderInitial(row.senderLabel),
                              style: TextStyle(
                                color: chrome.textMuted,
                                fontWeight: FontWeight.w700,
                              ),
                            )
                          : null,
                    ),
                    title: _buildPinnedContent(row, chrome),
                    subtitle: Text(
                      '${row.senderLabel} • ${_dateLabel(row.createdAt)}',
                      style: TextStyle(color: chrome.textMuted),
                    ),
                  );
                },
              ),
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

  Widget _buildPinnedContent(_PinnedRow row, MessagesChromePalette chrome) {
    final text = row.content.trim();
    if (text.isEmpty) {
      return Text(
        _t('chat.pinnedScreen.emptyMessage'),
        style: TextStyle(color: chrome.text),
      );
    }

    if (_inviteRegExp.hasMatch(text)) {
      return Text(
        _t('chat.pinnedScreen.serverInvite'),
        style: TextStyle(
          color: chrome.text,
          fontWeight: FontWeight.w600,
        ),
      );
    }

    if (_imageUrlRegExp.hasMatch(text)) {
      return ClipRRect(
        borderRadius: BorderRadius.circular(8),
        child: Image.network(
          text,
          height: 120,
          fit: BoxFit.cover,
        ),
      );
    }

    if (_videoUrlRegExp.hasMatch(text)) {
      return Text(
        '🎬 Video',
        style: TextStyle(color: chrome.text, fontWeight: FontWeight.w600),
      );
    }

    return Text(
      text,
      maxLines: 3,
      overflow: TextOverflow.ellipsis,
      style: TextStyle(color: chrome.text),
    );
  }
}

class _PinnedRow {
  const _PinnedRow({
    required this.id,
    required this.senderLabel,
    required this.senderAvatarUrl,
    required this.content,
    required this.createdAt,
  });

  final String id;
  final String senderLabel;
  final String? senderAvatarUrl;
  final String content;
  final DateTime createdAt;
}
