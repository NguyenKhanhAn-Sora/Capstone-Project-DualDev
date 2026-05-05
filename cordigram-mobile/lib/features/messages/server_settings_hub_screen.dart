import 'dart:async';

import 'package:flutter/material.dart';

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
import 'server_settings_screen.dart';
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
  static const Color _bg = Color(0xFF08183A);
  static const Color _card = Color(0xFF0E1F45);
  static const Color _line = Color(0xFF21345D);

  late ServerSummary _server;

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
    final nameCtrl = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        backgroundColor: const Color(0xFF152A52),
        title: Text(
          'Xóa “${_server.name}”?',
          style: const TextStyle(color: Colors.white),
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              'Hành động này không thể hoàn tác. Nhập đúng tên máy chủ để xác nhận.',
              style: TextStyle(color: Color(0xFFB8C8E8)),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: nameCtrl,
              style: const TextStyle(color: Colors.white),
              decoration: InputDecoration(
                hintText: 'Tên máy chủ',
                hintStyle: const TextStyle(color: Color(0xFF6B7A99)),
                filled: true,
                fillColor: Color(0xFF0E1F45),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(c, false),
            child: const Text('Huỷ'),
          ),
          TextButton(
            onPressed: () {
              if (nameCtrl.text.trim() == _server.name.trim()) {
                Navigator.pop(c, true);
              }
            },
            child: const Text('Xóa máy chủ', style: TextStyle(color: Color(0xFFFF6B7A))),
          ),
        ],
      ),
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
    final updated = await Navigator.of(context).push<ServerSummary?>(
      MaterialPageRoute(
        builder: (_) => ServerSettingsScreen(
          serverId: _server.id,
          initialSummary: _server,
          canManageSettings: canManage,
        ),
      ),
    );
    _setServer(updated);
  }

  void _push(Widget page) {
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => page));
  }

  Widget _sectionTitle(String t) => Padding(
        padding: const EdgeInsets.fromLTRB(4, 14, 4, 8),
        child: Text(
          t,
          style: const TextStyle(
            color: Color(0xFF8EA3CC),
            fontSize: 12,
            fontWeight: FontWeight.w800,
            letterSpacing: 0.6,
          ),
        ),
      );

  Widget _tile(
    String title,
    VoidCallback onTap, {
    bool danger = false,
    IconData icon = Icons.chevron_right_rounded,
  }) {
    return Material(
      color: _card,
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
                    color: danger ? const Color(0xFFFF8A8A) : Colors.white,
                    fontWeight: FontWeight.w600,
                    fontSize: 15,
                  ),
                ),
              ),
              Icon(icon, color: const Color(0xFF7E8CA8), size: 22),
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

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, result) {
        if (didPop) return;
        Navigator.of(context).pop(_server);
      },
      child: Scaffold(
      backgroundColor: _bg,
      appBar: AppBar(
        backgroundColor: _bg,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () => Navigator.of(context).pop(_server),
        ),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Cài đặt máy chủ',
              style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800),
            ),
            Text(
              _server.name.toUpperCase(),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontSize: 11,
                color: Color(0xFF8EA3CC),
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
          _sectionTitle('HỒ SƠ'),
          _tile('Hồ sơ máy chủ', _openProfile),
          const SizedBox(height: 8),
          _tile(
            'Tương tác',
            () => _push(
              ServerInteractionScreen(
                serverId: _server.id,
                canManage: canManageSettings,
              ),
            ),
          ),
          const Divider(height: 28, color: _line),
          _sectionTitle('BIỂU CẢM'),
          _tile(
            'Emoji máy chủ',
            () {
              if (!canExpr) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('Bạn không có quyền quản lý biểu cảm.'),
                  ),
                );
                return;
              }
              _push(ServerEmojiScreen(serverId: _server.id));
            },
          ),
          const SizedBox(height: 8),
          _tile(
            'Sticker máy chủ',
            () {
              if (!canExpr) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('Bạn không có quyền quản lý biểu cảm.'),
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
          const Divider(height: 28, color: _line),
          _sectionTitle('MỌI NGƯỜI'),
          _tile(
            'Thành viên',
            () => _push(
              ServerMembersScreen(
                serverId: _server.id,
                currentUserId: widget.currentUserId,
              ),
            ),
          ),
          const SizedBox(height: 8),
          _tile(
            'Vai trò',
            () => _push(
              ServerRolesScreen(
                serverId: _server.id,
                canManageRoles: canManageRoles,
              ),
            ),
          ),
          const SizedBox(height: 8),
          _tile(
            'Truy cập',
            () => _push(
              ServerAccessScreen(
                serverId: _server.id,
                canManage: canManageSettings,
              ),
            ),
          ),
          const Divider(height: 28, color: _line),
          _sectionTitle('KIỂM DUYỆT'),
          _tile(
            'Thiết lập an toàn',
            () => _push(
              ServerSafetyScreen(
                serverId: _server.id,
                canManage: canManageSettings,
              ),
            ),
          ),
          const SizedBox(height: 8),
          _tile(
            'Danh sách ban',
            () => _push(
              ServerBansScreen(
                serverId: _server.id,
                canUnban: canBan,
              ),
            ),
          ),
          const SizedBox(height: 8),
          _tile(
            'AutoMod',
            () => _push(
              ServerAutomodScreen(
                serverId: _server.id,
                canManage: canManageSettings,
              ),
            ),
          ),
          const Divider(height: 28, color: _line),
          _sectionTitle('CỘNG ĐỒNG'),
          _tile(
            'Cộng đồng',
            () => _push(
              ServerCommunityScreen(
                serverId: _server.id,
                isOwner: widget.isOwner,
              ),
            ),
          ),
          if (widget.isOwner) ...[
            const Divider(height: 28, color: _line),
            _sectionTitle('NGUY HIỂM'),
            _tile('Xóa máy chủ', _confirmDelete, danger: true),
          ],
        ],
      ),
    ),
    );
  }
}
