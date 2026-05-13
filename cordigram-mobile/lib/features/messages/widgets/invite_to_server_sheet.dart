import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../core/config/app_config.dart';
import '../models/server_models.dart';
import '../services/direct_messages_service.dart';
import '../services/servers_service.dart';

Set<String> _memberUserIdsFromServerJson(Map<String, dynamic> server) {
  final out = <String>{};
  final members = server['members'];
  if (members is! List) return out;
  for (final m in members) {
    if (m is! Map) continue;
    final map = Map<String, dynamic>.from(m);
    final uid = map['userId'];
    if (uid is Map) {
      final id = uid['_id'] ?? uid['id'];
      if (id != null) out.add(id.toString());
    } else if (uid != null) {
      out.add(uid.toString());
    }
  }
  out.removeWhere((e) => e.trim().isEmpty);
  return out;
}

/// Mirrors cordigram-web `InviteToServerPopup`: copy link + mời bạn (follow/followers, trừ đã trong server).
class InviteToServerSheet extends StatefulWidget {
  const InviteToServerSheet({super.key, required this.server});

  final ServerSummary server;

  static Future<void> show(BuildContext context, ServerSummary server) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF0E2247),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) => InviteToServerSheet(server: server),
    );
  }

  @override
  State<InviteToServerSheet> createState() => _InviteToServerSheetState();
}

class _InviteToServerSheetState extends State<InviteToServerSheet> {
  final TextEditingController _search = TextEditingController();
  bool _loading = true;
  String? _error;
  List<_InviteRow> _rows = const [];
  final Set<String> _invitedIds = {};
  String? _sendingId;

  String get _inviteLink =>
      '${AppConfig.webBaseUrl}/invite/server/${widget.server.id}';

  @override
  void initState() {
    super.initState();
    _search.addListener(() => setState(() {}));
    _load();
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final following =
          await DirectMessagesService.getFollowingAsConversations();
      final followers =
          await DirectMessagesService.getFollowersAsConversations();
      final serverMap = await ServersService.getServerById(widget.server.id);
      final memberIds = _memberUserIdsFromServerJson(serverMap);

      final byId = <String, _InviteRow>{};
      for (final conv in following) {
        final id = conv.userId;
        if (id.isEmpty || memberIds.contains(id)) continue;
        byId[id] = _InviteRow(
          userId: id,
          displayName: conv.displayName,
          username: conv.username,
          avatarUrl: conv.avatarUrl,
        );
      }
      for (final conv in followers) {
        final id = conv.userId;
        if (id.isEmpty || memberIds.contains(id)) continue;
        byId[id] ??= _InviteRow(
          userId: id,
          displayName: conv.displayName,
          username: conv.username,
          avatarUrl: conv.avatarUrl,
        );
      }
      final rows = byId.values.toList()
        ..sort(
          (a, b) => a.displayName.toLowerCase().compareTo(
                b.displayName.toLowerCase(),
              ),
        );
      if (!mounted) return;
      setState(() => _rows = rows);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _rows = const [];
      });
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _copyLink() async {
    await Clipboard.setData(ClipboardData(text: _inviteLink));
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Đã sao chép link mời')),
    );
  }

  Future<void> _inviteFriend(_InviteRow row) async {
    setState(() {
      _error = null;
      _sendingId = row.userId;
    });
    try {
      await ServersService.createServerInvite(widget.server.id, row.userId);
      try {
        await DirectMessagesService.sendMessage(
          row.userId,
          content: _inviteLink,
        );
      } catch (_) {}
      if (!mounted) return;
      setState(() => _invitedIds.add(row.userId));
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _sendingId = null);
    }
  }

  List<_InviteRow> get _filtered {
    final q = _search.text.trim().toLowerCase();
    if (q.isEmpty) return _rows;
    return _rows
        .where(
          (r) =>
              r.displayName.toLowerCase().contains(q) ||
              r.username.toLowerCase().contains(q),
        )
        .toList();
  }

  @override
  Widget build(BuildContext context) {
    final h = MediaQuery.sizeOf(context).height * 0.88;
    return SizedBox(
      height: h,
      child: SafeArea(
        child: Padding(
          padding: EdgeInsets.only(
            bottom: MediaQuery.viewInsetsOf(context).bottom,
          ),
          child: Column(
            children: [
              const SizedBox(height: 8),
            Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: Colors.white24,
                borderRadius: BorderRadius.circular(999),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 8, 0),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      'Mời vào ${widget.server.name}',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  IconButton(
                    onPressed: () => Navigator.pop(context),
                    icon: const Icon(Icons.close_rounded, color: Colors.white70),
                  ),
                ],
              ),
            ),
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 16),
              child: Text(
                'Gửi lời mời tới bạn bè (đang follow hoặc follow bạn) chưa tham gia máy chủ.',
                style: TextStyle(color: Color(0xFFAFC0E2), fontSize: 13),
              ),
            ),
            const SizedBox(height: 12),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: OutlinedButton.icon(
                onPressed: _copyLink,
                icon: const Icon(Icons.link_rounded, color: Color(0xFF8EB7FF)),
                label: const Text(
                  'Sao chép link mời',
                  style: TextStyle(color: Colors.white),
                ),
                style: OutlinedButton.styleFrom(
                  foregroundColor: Colors.white,
                  side: const BorderSide(color: Color(0xFF2D4578)),
                  minimumSize: const Size.fromHeight(44),
                ),
              ),
            ),
            if (_error != null) ...[
              const SizedBox(height: 8),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Text(
                  _error!,
                  style: const TextStyle(color: Color(0xFFFF6B6B), fontSize: 13),
                ),
              ),
            ],
            const SizedBox(height: 12),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: TextField(
                controller: _search,
                style: const TextStyle(color: Colors.white),
                decoration: InputDecoration(
                  hintText: 'Tìm theo tên hoặc username…',
                  hintStyle: const TextStyle(color: Color(0xFF8A98B8)),
                  prefixIcon: const Icon(Icons.search_rounded, color: Color(0xFF8A98B8)),
                  filled: true,
                  fillColor: const Color(0xFF13254A),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(10),
                    borderSide: BorderSide.none,
                  ),
                  isDense: true,
                ),
              ),
            ),
            const SizedBox(height: 8),
            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : _filtered.isEmpty
                  ? Center(
                      child: Padding(
                        padding: const EdgeInsets.all(24),
                        child: Text(
                          _rows.isEmpty
                              ? 'Không có bạn nào để mời (hoặc mọi người đã trong máy chủ).'
                              : 'Không tìm thấy người phù hợp.',
                          textAlign: TextAlign.center,
                          style: const TextStyle(color: Color(0xFFAFC0E2)),
                        ),
                      ),
                    )
                  : ListView.builder(
                      itemCount: _filtered.length,
                      padding: const EdgeInsets.fromLTRB(8, 0, 8, 16),
                      itemBuilder: (context, i) {
                        final row = _filtered[i];
                        final invited = _invitedIds.contains(row.userId);
                        final sending = _sendingId == row.userId;
                        return ListTile(
                          leading: CircleAvatar(
                            backgroundColor: const Color(0xFF1F2D4D),
                            backgroundImage: (row.avatarUrl ?? '').startsWith('http')
                                ? NetworkImage(row.avatarUrl!)
                                : null,
                            child: (row.avatarUrl ?? '').startsWith('http')
                                ? null
                                : Text(
                                    _initialLetter(
                                      row.displayName,
                                      row.username,
                                    ),
                                  ),
                          ),
                          title: Text(
                            row.displayName.isNotEmpty
                                ? row.displayName
                                : row.username,
                            style: const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          subtitle: Text(
                            row.username,
                            style: const TextStyle(color: Color(0xFFAFC0E2)),
                          ),
                          trailing: TextButton(
                            onPressed: invited || sending
                                ? null
                                : () => _inviteFriend(row),
                            child: sending
                                ? const SizedBox(
                                    width: 18,
                                    height: 18,
                                    child: CircularProgressIndicator(strokeWidth: 2),
                                  )
                                : Text(invited ? 'Đã mời' : 'Mời'),
                          ),
                        );
                      },
                    ),
            ),
          ],
          ),
        ),
      ),
    );
  }
}

class _InviteRow {
  const _InviteRow({
    required this.userId,
    required this.displayName,
    required this.username,
    this.avatarUrl,
  });

  final String userId;
  final String displayName;
  final String username;
  final String? avatarUrl;
}

String _initialLetter(String displayName, String username) {
  final s = displayName.trim().isNotEmpty ? displayName : username;
  final t = s.trim();
  if (t.isEmpty) return '?';
  return t[0].toUpperCase();
}
