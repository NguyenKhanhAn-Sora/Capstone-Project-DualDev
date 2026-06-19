import 'dart:async';

import 'package:flutter/material.dart';

import '../../../core/services/language_controller.dart';
import '../services/channel_messages_realtime_service.dart';
import '../services/servers_service.dart';
import 'server_settings_ui.dart';

class ServerBansScreen extends StatefulWidget {
  const ServerBansScreen({
    super.key,
    required this.serverId,
    required this.canUnban,
  });

  final String serverId;
  final bool canUnban;

  @override
  State<ServerBansScreen> createState() => _ServerBansScreenState();
}

class _ServerBansScreenState extends State<ServerBansScreen> {
  List<Map<String, dynamic>> _rows = [];
  List<Map<String, dynamic>> _restricted = [];
  bool _loading = true;
  String? _error;
  final _search = TextEditingController();
  StreamSubscription<Map<String, dynamic>>? _realtimeSub;

  @override
  void dispose() {
    _realtimeSub?.cancel();
    _search.dispose();
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    _load();
    _realtimeSub = ChannelMessagesRealtimeService.serverRealtime.listen(
      _onServerRealtime,
    );
  }

  void _onServerRealtime(Map<String, dynamic> payload) {
    final event = (payload['event'] ?? '').toString();
    if (event != 'server-membership-updated' &&
        event != 'server-moderation-updated') {
      return;
    }
    final sid = (payload['serverId'] ?? '').toString();
    if (sid != widget.serverId) return;
    if (!mounted) return;
    unawaited(_load());
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final banned = await ServersService.getBannedUsers(widget.serverId);
      List<Map<String, dynamic>> restricted = [];
      if (widget.canUnban) {
        restricted = await ServersService.getMentionRestrictedMembers(
          widget.serverId,
        );
      }
      if (!mounted) return;
      setState(() {
        _rows = banned;
        _restricted = restricted;
      });
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  List<Map<String, dynamic>> get _filtered {
    final q = _search.text.trim().toLowerCase();
    if (q.isEmpty) return _rows;
    return _rows.where((r) {
      final u = (r['username'] ?? '').toString().toLowerCase();
      final d = (r['displayName'] ?? '').toString().toLowerCase();
      final id = (r['userId'] ?? '').toString().toLowerCase();
      return u.contains(q) || d.contains(q) || id.contains(q);
    }).toList();
  }

  Future<void> _unban(String userId) async {
    final ui = ServerSettingsUi.of(context);
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) {
        final dui = ServerSettingsUi.of(c);
        return AlertDialog(
          backgroundColor: dui.card,
          title: Text('Gỡ cấm?', style: TextStyle(color: dui.text)),
          content: Text(
            'Người này có thể tham gia lại bằng lời mời.',
            style: TextStyle(color: dui.textMuted),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(c, false), child: Text(LanguageController.instance.t('common.cancel'))),
            TextButton(
              onPressed: () => Navigator.pop(c, true),
              child: Text('Gỡ cấm', style: TextStyle(color: ui.accent)),
            ),
          ],
        );
      },
    );
    if (ok != true || !mounted) return;
    try {
      await ServersService.unbanMember(widget.serverId, userId);
      await _load();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(LanguageController.instance.t('server.bans.unbanned'))),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
      }
    }
  }

  Future<void> _unrestrict(String userId) async {
    try {
      await ServersService.unrestrictMember(widget.serverId, userId);
      await _load();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(LanguageController.instance.t('server.bans.mentionRestrictionRemoved'))),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
      }
    }
  }

  Widget _userTile(
    ServerSettingsUi ui, {
    required Map<String, dynamic> r,
    required String uid,
    required String name,
    required String subtitle,
    required VoidCallback? onAction,
    required String actionLabel,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: ui.card,
        borderRadius: BorderRadius.circular(12),
        child: ListTile(
          leading: CircleAvatar(
            backgroundColor: ui.fieldFill,
            backgroundImage: (r['avatarUrl']?.toString().isNotEmpty == true)
                ? NetworkImage(r['avatarUrl'].toString())
                : null,
            child: r['avatarUrl'] == null
                ? Text(
                    name.isNotEmpty ? name[0].toUpperCase() : '?',
                    style: TextStyle(
                      color: ui.text,
                      fontWeight: FontWeight.w700,
                    ),
                  )
                : null,
          ),
          title: Text(
            name,
            style: TextStyle(
              color: ui.text,
              fontWeight: FontWeight.w600,
            ),
          ),
          subtitle: Text(
            subtitle,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(color: ui.textMuted, fontSize: 12),
          ),
          trailing: onAction == null
              ? null
              : TextButton(
                  onPressed: onAction,
                  child: Text(
                    actionLabel,
                    style: TextStyle(color: ui.accent),
                  ),
                ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final ui = ServerSettingsUi.of(context);
    final pad = MediaQuery.paddingOf(context);
    final hPad = MediaQuery.sizeOf(context).width > 520 ? 24.0 : 14.0;

    return Scaffold(
      backgroundColor: ui.bg,
      appBar: ui.buildAppBar(
        title: 'Danh sách ban',
        actions: [
          IconButton(onPressed: _loading ? null : _load, icon: const Icon(Icons.refresh)),
        ],
      ),
      body: _loading
          ? Center(child: CircularProgressIndicator(color: ui.accent))
          : _error != null
          ? Center(
              child: Text(_error!, style: TextStyle(color: ui.textMuted)),
            )
          : ListView(
              padding: EdgeInsets.fromLTRB(hPad, 10, hPad, pad.bottom + 16),
              children: [
                TextField(
                  controller: _search,
                  onChanged: (_) => setState(() {}),
                  style: TextStyle(color: ui.text),
                  decoration: ui.fieldDecoration(
                    hintText: LanguageController.instance.t('server.bans.searchPlaceholder'),
                    prefixIcon: Icon(Icons.search, color: ui.textMuted),
                  ),
                ),
                const SizedBox(height: 16),
                Text(
                  'Đã cấm',
                  style: TextStyle(
                    color: ui.textMuted,
                    fontWeight: FontWeight.w800,
                    fontSize: 12,
                    letterSpacing: 0.5,
                  ),
                ),
                const SizedBox(height: 8),
                if (_filtered.isEmpty)
                  Text(
                    'Không có lệnh cấm',
                    style: TextStyle(color: ui.textMuted),
                  )
                else
                  ..._filtered.map((r) {
                    final uid = (r['userId'] ?? '').toString();
                    final name = (r['displayName'] ?? r['username'] ?? uid).toString();
                    final reason = (r['reason'] ?? '').toString();
                    return _userTile(
                      ui,
                      r: r,
                      uid: uid,
                      name: name,
                      subtitle: reason.isEmpty ? '@${r['username']}' : reason,
                      onAction: widget.canUnban ? () => _unban(uid) : null,
                      actionLabel: 'Gỡ cấm',
                    );
                  }),
                if (widget.canUnban && _restricted.isNotEmpty) ...[
                  const SizedBox(height: 20),
                  Text(
                    'Hạn chế đề cập',
                    style: TextStyle(
                      color: ui.textMuted,
                      fontWeight: FontWeight.w800,
                      fontSize: 12,
                      letterSpacing: 0.5,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Thành viên bị AutoMod hạn chế @ — có thể gỡ tại đây.',
                    style: TextStyle(color: ui.textMuted, fontSize: 13),
                  ),
                  const SizedBox(height: 8),
                  ..._restricted.map((r) {
                    final uid = (r['userId'] ?? '').toString();
                    final name = (r['displayName'] ?? r['username'] ?? uid).toString();
                    return _userTile(
                      ui,
                      r: r,
                      uid: uid,
                      name: name,
                      subtitle: 'Hạn chế đề cập',
                      onAction: () => _unrestrict(uid),
                      actionLabel: 'Gỡ hạn chế',
                    );
                  }),
                ],
              ],
            ),
    );
  }
}
