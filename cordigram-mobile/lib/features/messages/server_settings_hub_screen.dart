import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/services/language_controller.dart';
import 'widgets/messages_chrome_builder.dart';
import 'models/server_models.dart';
import 'models/server_permissions.dart';
import 'server_members_screen.dart';
import 'server_roles_screen.dart';
import 'server_settings/server_access_screen.dart';
import 'server_settings/server_automod_screen.dart';
import 'server_settings/server_bans_screen.dart';
import 'server_settings/server_community_screen.dart';
import 'server_settings/server_emoji_screen.dart';
import 'server_settings/server_interaction_screen.dart';
import 'server_settings/server_safety_screen.dart';
import 'server_settings/server_sticker_screen.dart';
import 'server_settings/server_settings_ui.dart';
import 'server_settings_screen.dart';
import 'utils/messages_navigator.dart';
import 'services/servers_service.dart';

/// Trung tâm cài đặt máy chủ — cấu trúc nhóm giống web [ServerSettingsPanel].
class ServerSettingsHubScreen extends StatefulWidget {
  const ServerSettingsHubScreen({
    super.key,
    required this.server,
    required this.permissions,
    required this.currentUserId,
    required this.isOwner,
    this.communityEnabled = false,
  });

  final ServerSummary server;
  final CurrentUserServerPermissions permissions;
  final String? currentUserId;
  final bool isOwner;
  final bool communityEnabled;

  @override
  State<ServerSettingsHubScreen> createState() =>
      _ServerSettingsHubScreenState();
}

class _ServerSettingsHubScreenState extends State<ServerSettingsHubScreen> {
  late ServerSummary _server;

  String _t(String key, [Map<String, dynamic>? vars]) =>
      LanguageController.instance.t(key, vars);

  @override
  void initState() {
    super.initState();
    _server = widget.server;
    if (!_server.communityEnabled) {
      unawaited(_refreshCommunityIfNeeded());
    }
  }

  Future<void> _refreshCommunityIfNeeded() async {
    try {
      final doc = await ServersService.getServerById(_server.id);
      final raw = doc['server'] ?? doc['data'] ?? doc;
      if (raw is! Map || !mounted) return;
      final s = ServerSummary.fromJson(Map<String, dynamic>.from(raw));
      if (s.communityEnabled) setState(() => _server = s);
    } catch (_) {}
  }

  void _setServer(ServerSummary? s) {
    if (s != null) setState(() => _server = s);
  }

  Future<void> _confirmDelete() async {
    if (!widget.isOwner) return;
    final ui = ServerSettingsUi.of(context);
    final nameCtrl = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) {
        final dui = ServerSettingsUi.of(c);
        return AlertDialog(
          backgroundColor: dui.card,
          title: Text(
            'Xóa “${_server.name}”?',
            style: TextStyle(color: dui.text),
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Hành động này không thể hoàn tác. Nhập đúng tên máy chủ để xác nhận.',
                style: TextStyle(color: dui.textMuted),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: nameCtrl,
                style: TextStyle(color: dui.text),
                decoration: dui.fieldDecoration(hintText: LanguageController.instance.t('server.settings.serverNameHint')),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(c, false),
              child: Text(LanguageController.instance.t('common.cancel')),
            ),
            TextButton(
              onPressed: () {
                if (nameCtrl.text.trim() == _server.name.trim()) {
                  Navigator.pop(c, true);
                }
              },
              child: Text('Xóa máy chủ', style: TextStyle(color: ui.destructive)),
            ),
          ],
        );
      },
    );
    nameCtrl.dispose();
    if (ok != true || !mounted) return;
    try {
      await ServersService.deleteServer(_server.id);
      if (mounted) Navigator.of(context).pop('deleted');
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('$e')),
        );
      }
    }
  }

  Future<void> _openProfile() async {
    final canManage = widget.isOwner || widget.permissions.canManageServer;
    final updated = await context.pushMessages<ServerSummary?>(
      ServerSettingsScreen(
        serverId: _server.id,
        initialSummary: _server,
        canManageSettings: canManage,
      ),
    );
    _setServer(updated);
  }

  void _push(Widget page) {
    context.pushMessages(page);
  }

  Widget _sectionTitle(String label) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 14, 4, 8),
      child: Text(
        label,
        style: TextStyle(
          color: scheme.onSurfaceVariant,
          fontSize: 12,
          fontWeight: FontWeight.w800,
          letterSpacing: 0.6,
        ),
      ),
    );
  }

  Widget _tile(
    String title,
    VoidCallback onTap, {
    bool danger = false,
    IconData icon = Icons.chevron_right_rounded,
  }) {
    final scheme = Theme.of(context).colorScheme;
    return Material(
      color: scheme.surface,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  title,
                  style: TextStyle(
                    color: danger ? scheme.error : scheme.onSurface,
                    fontWeight: FontWeight.w600,
                    fontSize: 15,
                  ),
                ),
              ),
              Icon(icon, color: scheme.onSurfaceVariant, size: 22),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final mq = MediaQuery.of(context);
    final pad = mq.padding;
    final maxW = mq.size.width;
    final horizontal = maxW > 520 ? 24.0 : 14.0;

    final canExpr = widget.permissions.canManageExpressions ||
        widget.permissions.isOwner ||
        widget.permissions.canManageServer;

    final canManageSettings =
        widget.isOwner || widget.permissions.canManageServer;
    final canManageRoles = canManageSettings;
    final canBan = widget.permissions.canBan || widget.isOwner;

    return MessagesChromeBuilder(
      builder: (context, chrome) => PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, result) {
        if (didPop) return;
        Navigator.of(context).pop(_server);
      },
      child: Scaffold(
      backgroundColor: chrome.bg,
      appBar: AppBar(
        backgroundColor: chrome.bg,
        foregroundColor: chrome.text,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () => Navigator.of(context).pop(_server),
        ),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              _t('chat.serverSettings.ariaLabel'),
              style: TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w800,
                color: chrome.text,
              ),
            ),
            Text(
              _server.name.toUpperCase(),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 11,
                color: chrome.textMuted,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
      ),
      body: ListView(
        padding: EdgeInsets.fromLTRB(
          horizontal,
          8,
          horizontal,
          pad.bottom + 24,
        ),
        children: [
          _sectionTitle(_t('chat.serverSettings.sections.profile').toUpperCase()),
          _tile(_t('chat.serverSettings.sections.profile'), _openProfile),
          const SizedBox(height: 8),
          _tile(
            _t('chat.serverSettings.sections.interactions'),
            () => _push(
              ServerInteractionScreen(
                serverId: _server.id,
                canManage: canManageSettings,
              ),
            ),
          ),
          Divider(height: 28, color: Theme.of(context).dividerColor),
          _sectionTitle(_t('chat.serverSettings.groups.expressions')),
          _tile(
            _t('chat.serverSettings.sections.emoji'),
            () {
              if (!canExpr) {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text(LanguageController.instance.t('server.noPermissionManageEmoji')),
                  ),
                );
                return;
              }
              _push(ServerEmojiScreen(serverId: _server.id));
            },
          ),
          const SizedBox(height: 8),
          _tile(
            _t('chat.serverSettings.sections.sticker'),
            () {
              if (!canExpr) {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text(LanguageController.instance.t('server.noPermissionManageEmoji')),
                  ),
                );
                return;
              }
              _push(
                ServerStickerScreen(
                  serverId: _server.id,
                  isOwner: widget.isOwner,
                ),
              );
            },
          ),
          Divider(height: 28, color: Theme.of(context).dividerColor),
          _sectionTitle(_t('chat.serverSettings.groups.people')),
          _tile(
            _t('chat.serverSettings.sections.members'),
            () => _push(
              ServerMembersScreen(
                serverId: _server.id,
                currentUserId: widget.currentUserId,
                isOwner: widget.isOwner,
              ),
            ),
          ),
          const SizedBox(height: 8),
          _tile(
            _t('chat.serverSettings.sections.roles'),
            () => _push(
              ServerRolesScreen(
                serverId: _server.id,
                canManageRoles: canManageRoles,
              ),
            ),
          ),
          const SizedBox(height: 8),
          _tile(
            _t('chat.serverSettings.sections.access'),
            () => _push(
              ServerAccessScreen(
                serverId: _server.id,
                canManage: canManageSettings,
              ),
            ),
          ),
          Divider(height: 28, color: Theme.of(context).dividerColor),
          _sectionTitle(_t('chat.serverSettings.groups.moderation')),
          _tile(
            _t('chat.serverSettings.sections.safety'),
            () => _push(
              ServerSafetyScreen(
                serverId: _server.id,
                canManage: canManageSettings,
              ),
            ),
          ),
          const SizedBox(height: 8),
          _tile(
            _t('chat.serverSettings.sections.bans'),
            () => _push(
              ServerBansScreen(
                serverId: _server.id,
                canUnban: canBan,
              ),
            ),
          ),
          const SizedBox(height: 8),
          _tile(
            _t('chat.serverSettings.sections.automod'),
            () => _push(
              ServerAutomodScreen(
                serverId: _server.id,
                canManage: canManageSettings,
              ),
            ),
          ),
          Divider(height: 28, color: Theme.of(context).dividerColor),
          _sectionTitle('CỘNG ĐỒNG'),
          _tile(
            _server.communityEnabled ? 'Tổng quan Community' : 'Cộng đồng',
            () => _push(
              ServerCommunityScreen(
                serverId: _server.id,
                isOwner: widget.isOwner,
              ),
            ),
          ),
          if (widget.isOwner) ...[
            Divider(height: 28, color: Theme.of(context).dividerColor),
            _sectionTitle('NGUY HIỂM'),
            _tile('Xóa máy chủ', _confirmDelete, danger: true),
          ],
        ],
      ),
    ),
    ),
    );
  }
}
