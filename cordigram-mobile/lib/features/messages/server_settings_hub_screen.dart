import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/services/language_controller.dart';
import '../../core/theme/messages_chrome_palette.dart';
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

/// Trung tam cai dat may chu — cau truc nhom giong web [ServerSettingsPanel].
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

    // Capture name up front so the dialog and API call always reference the
    // same value regardless of widget rebuilds during the async gap.
    final serverName = _server.name;
    final nameCtrl = TextEditingController();

    // useRootNavigator: false keeps the dialog on the Messages navigator,
    // avoiding the cross-navigator InheritedTheme.capture that showDialog
    // performs by default (useRootNavigator: true). That cross-navigator
    // capture can leave stale InheritedWidget dependencies which later trigger
    // the '_dependents.isEmpty' assertion during the multi-route popUntil that
    // exitMessagesAfterServerDeleted performs.
    final ok = await showDialog<bool>(
      context: context,
      useRootNavigator: false,
      builder: (c) {
        final dui = ServerSettingsUi.of(c);
        return AlertDialog(
          backgroundColor: dui.card,
          title: Text(
            _t('chat.popups.deleteServer.title', {'serverName': serverName}),
            style: TextStyle(color: dui.text),
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                _t('chat.popups.deleteServer.message', {'serverName': serverName}),
                style: TextStyle(color: dui.textMuted),
              ),
              const SizedBox(height: 16),
              Text(
                _t('chat.popups.deleteServer.confirmLabel').toUpperCase(),
                style: TextStyle(
                  color: dui.textMuted,
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.4,
                ),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: nameCtrl,
                style: TextStyle(color: dui.text),
                decoration: dui.fieldDecoration(hintText: serverName),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(c, false),
              child: Text(
                _t('common.cancel'),
                style: TextStyle(color: dui.textMuted),
              ),
            ),
            TextButton(
              onPressed: () {
                if (nameCtrl.text.trim() == serverName.trim()) {
                  Navigator.pop(c, true);
                }
              },
              child: Text(
                _t('chat.popups.deleteServer.deleteBtn'),
                style: const TextStyle(color: Color(0xFFFF6B7A)),
              ),
            ),
          ],
        );
      },
    );

    // Defer controller disposal so the dialog TextField can finish its own
    // dispose() (which calls removeListener) before the controller is torn
    // down — avoiding 'controller used after dispose' in debug builds.
    WidgetsBinding.instance.addPostFrameCallback((_) => nameCtrl.dispose());

    if (ok != true || !mounted) return;
    try {
      await ServersService.deleteServer(_server.id);
      // exitMessagesAfterServerDeleted uses a GlobalKey, not this.context,
      // so it is safe to call even when this widget has been deactivated by
      // a concurrent realtime server-deleted event handler.
      await exitMessagesAfterServerDeleted(_server.id);
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

  // _sectionTitle / _tile receive [chrome] from MessagesChromeBuilder so they
  // never call Theme.of(this.context). Calling Theme.of on the State's own
  // context registers the State element as a dependent of the Theme
  // InheritedElement. When popUntil removes multiple routes simultaneously
  // this mixed-scope dependency can race against notifyClients and trigger
  // the '_dependents.isEmpty': is not true assertion.
  Widget _sectionTitle(String label, MessagesChromePalette chrome) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 14, 4, 8),
      child: Text(
        label,
        style: TextStyle(
          color: chrome.textMuted,
          fontSize: 12,
          fontWeight: FontWeight.w800,
          letterSpacing: 0.6,
        ),
      ),
    );
  }

  Widget _tile(
    String title,
    VoidCallback onTap,
    MessagesChromePalette chrome, {
    bool danger = false,
    IconData icon = Icons.chevron_right_rounded,
  }) {
    return Material(
      color: chrome.surface,
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
                    color: danger ? const Color(0xFFFF6B7A) : chrome.text,
                    fontWeight: FontWeight.w600,
                    fontSize: 15,
                  ),
                ),
              ),
              Icon(icon, color: chrome.textMuted, size: 22),
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

    // All color/theme references inside the builder use `chrome` directly.
    // Only the ListenableBuilder's element inside MessagesChromeBuilder
    // registers as a Theme dependent — no State-level dependency that could
    // cause _dependents.isEmpty during multi-route popUntil.
    return MessagesChromeBuilder(
      builder: (context, chrome) {
        final dividerColor = chrome.border;
        return Scaffold(
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
              _sectionTitle(
                _t('chat.serverSettings.sections.profile').toUpperCase(),
                chrome,
              ),
              _tile(
                _t('chat.serverSettings.sections.profile'),
                _openProfile,
                chrome,
              ),
              const SizedBox(height: 8),
              _tile(
                _t('chat.serverSettings.sections.interactions'),
                () => _push(
                  ServerInteractionScreen(
                    serverId: _server.id,
                    canManage: canManageSettings,
                  ),
                ),
                chrome,
              ),
              Divider(height: 28, color: dividerColor),
              _sectionTitle(
                _t('chat.serverSettings.groups.expressions'),
                chrome,
              ),
              _tile(
                _t('chat.serverSettings.sections.emoji'),
                () {
                  if (!canExpr) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        content: Text(
                          _t('chat.serverSettings.noPermissionManageEmoji'),
                        ),
                      ),
                    );
                    return;
                  }
                  _push(ServerEmojiScreen(serverId: _server.id));
                },
                chrome,
              ),
              const SizedBox(height: 8),
              _tile(
                _t('chat.serverSettings.sections.sticker'),
                () {
                  if (!canExpr) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        content: Text(
                          _t('chat.serverSettings.noPermissionManageEmoji'),
                        ),
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
                chrome,
              ),
              Divider(height: 28, color: dividerColor),
              _sectionTitle(
                _t('chat.serverSettings.groups.people'),
                chrome,
              ),
              _tile(
                _t('chat.serverSettings.sections.members'),
                () => _push(
                  ServerMembersScreen(
                    serverId: _server.id,
                    currentUserId: widget.currentUserId,
                    isOwner: widget.isOwner,
                  ),
                ),
                chrome,
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
                chrome,
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
                chrome,
              ),
              Divider(height: 28, color: dividerColor),
              _sectionTitle(
                _t('chat.serverSettings.groups.moderation'),
                chrome,
              ),
              _tile(
                _t('chat.serverSettings.sections.safety'),
                () => _push(
                  ServerSafetyScreen(
                    serverId: _server.id,
                    canManage: canManageSettings,
                  ),
                ),
                chrome,
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
                chrome,
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
                chrome,
              ),
              Divider(height: 28, color: dividerColor),
              _sectionTitle(
                _t('chat.serverSettings.groups.community'),
                chrome,
              ),
              _tile(
                _server.communityEnabled
                    ? _t('chat.serverSettings.sections.community-overview')
                    : _t('chat.serverSettings.sections.community'),
                () => _push(
                  ServerCommunityScreen(
                    serverId: _server.id,
                    isOwner: widget.isOwner,
                  ),
                ),
                chrome,
              ),
              if (widget.isOwner) ...[
                Divider(height: 28, color: dividerColor),
                _sectionTitle(
                  _t('chat.serverSettings.groups.danger'),
                  chrome,
                ),
                _tile(
                  _t('chat.serverSettings.sections.delete-server'),
                  _confirmDelete,
                  chrome,
                  danger: true,
                ),
              ],
            ],
          ),
        );
      },
    );
  }
}
