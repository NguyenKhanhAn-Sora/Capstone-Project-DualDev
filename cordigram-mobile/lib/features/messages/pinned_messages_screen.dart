import 'package:flutter/material.dart';

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
                senderLabel: e.senderId,
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
                senderLabel: e.senderName,
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
                  title: Text(
                    row.content.isEmpty ? '(Tin nhắn trống)' : row.content,
                    style: const TextStyle(color: Colors.white),
                  ),
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
}

class _PinnedRow {
  const _PinnedRow({
    required this.id,
    required this.senderLabel,
    required this.content,
    required this.createdAt,
  });

  final String id;
  final String senderLabel;
  final String content;
  final DateTime createdAt;
}
