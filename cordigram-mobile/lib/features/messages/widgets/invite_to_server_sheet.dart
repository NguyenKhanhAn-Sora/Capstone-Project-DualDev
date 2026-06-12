import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../core/config/app_config.dart';
import '../../../core/services/language_controller.dart';
import '../models/server_models.dart';
import '../utils/messages_ui.dart';
import 'messages_chrome_builder.dart';
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
    return MessagesUi.showBottomSheet<void>(
      context,
      isScrollControlled: true,
      child: InviteToServerSheet(server: server),
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
      SnackBar(content: Text(_t('chat.inviteToServerSheet.copiedToast'))),
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

  String _t(String key, [Map<String, dynamic>? vars]) =>
      LanguageController.instance.t(key, vars);

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
    return MessagesChromeBuilder(
      builder: (context, chrome) {
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
                      color: chrome.textMuted.withValues(alpha: 0.35),
                      borderRadius: BorderRadius.circular(999),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 16, 8, 0),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(
                            _t('chat.inviteToServerSheet.title', {
                              'serverName': widget.server.name,
                            }),
                            style: TextStyle(
                              color: chrome.text,
                              fontSize: 18,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                        IconButton(
                          onPressed: () => Navigator.pop(context),
                          icon: Icon(
                            Icons.close_rounded,
                            color: chrome.textMuted,
                          ),
                        ),
                      ],
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: Text(
                      _t('chat.inviteToServerSheet.description'),
                      style: TextStyle(color: chrome.textMuted, fontSize: 13),
                    ),
                  ),
                  const SizedBox(height: 12),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: OutlinedButton.icon(
                      onPressed: _copyLink,
                      icon: Icon(Icons.link_rounded, color: chrome.accent),
                      label: Text(
                        _t('chat.inviteToServerSheet.copyInviteLink'),
                        style: TextStyle(color: chrome.text),
                      ),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: chrome.text,
                        side: BorderSide(color: chrome.border),
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
                        style: TextStyle(color: chrome.accent, fontSize: 13),
                      ),
                    ),
                  ],
                  const SizedBox(height: 12),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: TextField(
                      controller: _search,
                      style: TextStyle(color: chrome.text),
                      decoration: InputDecoration(
                        hintText: _t('chat.inviteToServerSheet.searchPlaceholder'),
                        hintStyle: TextStyle(color: chrome.textMuted),
                        prefixIcon: Icon(
                          Icons.search_rounded,
                          color: chrome.textMuted,
                        ),
                        filled: true,
                        fillColor: chrome.chatInput,
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
                        ? Center(
                            child: CircularProgressIndicator(color: chrome.accent),
                          )
                        : _filtered.isEmpty
                        ? Center(
                            child: Padding(
                              padding: const EdgeInsets.all(24),
                              child: Text(
                                _t('chat.inviteToServerSheet.errorLoad'),
                                textAlign: TextAlign.center,
                                style: TextStyle(color: chrome.textMuted),
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
                                  backgroundColor: chrome.surfaceMuted,
                                  backgroundImage:
                                      (row.avatarUrl ?? '').startsWith('http')
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
                                  style: TextStyle(
                                    color: chrome.text,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                                subtitle: Text(
                                  row.username,
                                  style: TextStyle(color: chrome.textMuted),
                                ),
                                trailing: TextButton(
                                  onPressed: invited || sending
                                      ? null
                                      : () => _inviteFriend(row),
                                  child: sending
                                      ? SizedBox(
                                          width: 18,
                                          height: 18,
                                          child: CircularProgressIndicator(
                                            strokeWidth: 2,
                                            color: chrome.accent,
                                          ),
                                        )
                                      : Text(
                                          _t('chat.inviteToServerSheet.invite'),
                                          style: TextStyle(color: chrome.accent),
                                        ),
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
      },
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
