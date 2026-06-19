import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../core/config/app_config.dart';
import '../../../core/services/language_controller.dart';
import '../models/server_models.dart';
import '../utils/messages_ui.dart';
import 'messages_chrome_builder.dart';
import '../services/servers_service.dart';

/// Mirrors cordigram-web `InviteToServerPopup`: copy link + mời bạn (follow/followers, trừ đã trong server).
class InviteToServerSheet extends StatefulWidget {
  const InviteToServerSheet({
    super.key,
    required this.server,
    this.canCreateInvite = true,
  });

  final ServerSummary server;
  final bool canCreateInvite;

  static Future<void> show(
    BuildContext context,
    ServerSummary server, {
    bool canCreateInvite = true,
  }) {
    return MessagesUi.showBottomSheet<void>(
      context,
      isScrollControlled: true,
      child: InviteToServerSheet(
        server: server,
        canCreateInvite: canCreateInvite,
      ),
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
  bool _inviteBlocked = false;

  String get _inviteLink =>
      '${AppConfig.webBaseUrl}/invite/server/${widget.server.id}';

  String get _noPermissionMessage =>
      _t('chat.inviteToServerSheet.noCreateInvitePermission');

  bool get _canInvite => widget.canCreateInvite && !_inviteBlocked;

  @override
  void initState() {
    super.initState();
    if (!widget.canCreateInvite) {
      _error = _noPermissionMessage;
    }
    _load();
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final permissionError =
        !widget.canCreateInvite ? _noPermissionMessage : null;
    setState(() {
      _loading = true;
      _error = permissionError;
    });
    try {
      final result =
          await ServersService.getServerInviteCandidates(widget.server.id);
      final rows = result.candidates
          .map((c) {
            final id = (c['_id'] ?? c['userId'] ?? '').toString();
            if (id.isEmpty) return null;
            return _InviteRow(
              userId: id,
              displayName: (c['displayName'] ?? c['username'] ?? '')
                  .toString(),
              username: (c['username'] ?? '').toString(),
              avatarUrl: c['avatarUrl']?.toString(),
            );
          })
          .whereType<_InviteRow>()
          .toList()
        ..sort(
          (a, b) => a.displayName.toLowerCase().compareTo(
                b.displayName.toLowerCase(),
              ),
        );
      if (!mounted) return;
      setState(() {
        _rows = rows;
        _invitedIds
          ..clear()
          ..addAll(result.invitedUserIds);
      });
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
    if (!_canInvite) {
      setState(() => _error = _noPermissionMessage);
      return;
    }
    await Clipboard.setData(ClipboardData(text: _inviteLink));
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(_t('chat.inviteToServerSheet.copiedToast'))),
    );
  }

  String _resolveInviteError(Object e) {
    var msg = e.toString().replaceFirst('ApiException: ', '').trim();
    if (msg.startsWith('{')) {
      try {
        final parsed = Map<String, dynamic>.from(
          jsonDecode(msg) as Map,
        );
        final raw = parsed['message'];
        if (raw is String) {
          msg = raw;
        } else if (raw is List && raw.isNotEmpty) {
          msg = raw.first.toString();
        }
      } catch (_) {}
    }
    if (msg.contains('quyền tạo lời mời') ||
        msg.contains('permission to create invite') ||
        msg.contains('create invite') ||
        msg.contains('招待を作成') ||
        msg.contains('创建邀请')) {
      return _noPermissionMessage;
    }
    return msg;
  }

  Future<void> _inviteFriend(_InviteRow row) async {
    if (!_canInvite || _invitedIds.contains(row.userId)) {
      if (!_canInvite) setState(() => _error = _noPermissionMessage);
      return;
    }
    setState(() {
      _error = null;
      _invitedIds.add(row.userId);
    });
    try {
      await ServersService.createServerInvite(widget.server.id, row.userId);
    } catch (e) {
      if (!mounted) return;
      final friendly = _resolveInviteError(e);
      setState(() {
        _invitedIds.remove(row.userId);
        _error = friendly;
        if (friendly == _noPermissionMessage) {
          _inviteBlocked = true;
        }
      });
    }
  }

  String _t(String key, [Map<String, dynamic>? vars]) =>
      LanguageController.instance.t(key, vars);

  List<_InviteRow> _filterRows(String query) {
    final q = query.trim().toLowerCase();
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
                  if (_canInvite)
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
                        : ValueListenableBuilder<TextEditingValue>(
                            valueListenable: _search,
                            builder: (context, value, _) {
                              final filtered = _filterRows(value.text);
                              if (filtered.isEmpty) {
                                return Center(
                                  child: Padding(
                                    padding: const EdgeInsets.all(24),
                                    child: Text(
                                      _rows.isEmpty
                                          ? _t('chat.inviteToServerSheet.errorLoad')
                                          : _t('chat.invite.empty.notFound'),
                                      textAlign: TextAlign.center,
                                      style: TextStyle(color: chrome.textMuted),
                                    ),
                                  ),
                                );
                              }
                              return ListView.builder(
                                itemCount: filtered.length,
                                padding: const EdgeInsets.fromLTRB(8, 0, 8, 16),
                                itemBuilder: (context, i) {
                                  final row = filtered[i];
                                  final invited = _invitedIds.contains(row.userId);
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
                                      onPressed: !_canInvite || invited
                                          ? null
                                          : () => _inviteFriend(row),
                                      child: Text(
                                        invited
                                            ? _t('chat.invite.invited')
                                            : _t('chat.inviteToServerSheet.invite'),
                                        style: TextStyle(color: chrome.accent),
                                      ),
                                    ),
                                  );
                                },
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
