import 'package:flutter/material.dart';

import 'models/server_role_models.dart';
import 'server_settings/role_edit_screen.dart';
import 'services/servers_service.dart';

/// Danh sách vai trò — GET `/servers/:id/roles`, tạo/sửa như web `RolesSection`.
class ServerRolesScreen extends StatefulWidget {
  const ServerRolesScreen({
    super.key,
    required this.serverId,
    required this.canManageRoles,
  });

  final String serverId;
  /// Chủ máy chủ hoặc có quản lý máy chủ (giống web RolesSection).
  final bool canManageRoles;

  @override
  State<ServerRolesScreen> createState() => _ServerRolesScreenState();
}

class _ServerRolesScreenState extends State<ServerRolesScreen> {
  static const Color _bg = Color(0xFF08183A);

  List<ServerRole> _roles = [];
  bool _loading = true;
  String? _error;

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
      final list = await ServersService.getRoles(widget.serverId);
      if (!mounted) return;
      setState(() => _roles = list);
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _createRole() async {
    if (!widget.canManageRoles) return;
    try {
      final r = await ServersService.createRole(
        serverId: widget.serverId,
        name: 'Vai trò mới',
      );
      if (!mounted) return;
      setState(() => _roles = [r, ..._roles]);
      await Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => RoleEditScreen(
            serverId: widget.serverId,
            initialRole: r,
            allRoles: _roles,
            isOwner: widget.canManageRoles,
          ),
        ),
      );
      await _load();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('$e')),
        );
      }
    }
  }

  Future<void> _openRole(ServerRole role) async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => RoleEditScreen(
          serverId: widget.serverId,
          initialRole: role,
          allRoles: _roles,
          isOwner: widget.canManageRoles,
        ),
      ),
    );
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    final pad = MediaQuery.paddingOf(context);
    final custom = _roles.where((r) => !r.isDefault).toList();
    ServerRole? def;
    for (final r in _roles) {
      if (r.isDefault) {
        def = r;
        break;
      }
    }

    return Scaffold(
      backgroundColor: _bg,
      appBar: AppBar(
        backgroundColor: _bg,
        title: const Text(
          'Vai trò',
          style: TextStyle(fontWeight: FontWeight.w800),
        ),
      ),
      floatingActionButton: widget.canManageRoles
          ? FloatingActionButton.extended(
              onPressed: _createRole,
              backgroundColor: const Color(0xFF5865F2),
              icon: const Icon(Icons.add_rounded),
              label: const Text('Tạo vai trò'),
            )
          : null,
      body: RefreshIndicator(
        onRefresh: _load,
        color: const Color(0xFF7FB6FF),
        child: _loading
            ? ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                children: const [
                  SizedBox(height: 120),
                  Center(child: CircularProgressIndicator()),
                ],
              )
            : _error != null
                ? ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: EdgeInsets.all(pad.bottom + 24),
                    children: [
                      Text(_error!, style: const TextStyle(color: Colors.white70)),
                      TextButton(onPressed: _load, child: const Text('Thử lại')),
                    ],
                  )
                : ListView(
                    padding: EdgeInsets.fromLTRB(16, 12, 16, pad.bottom + 88),
                    children: [
                      Container(
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: const Color(0xFF0E1F45),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'Quản lý thành viên',
                              style: TextStyle(
                                color: Colors.white,
                                fontSize: 17,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                            const SizedBox(height: 6),
                            const Text(
                              'Sử dụng vai trò để phân nhóm thành viên và chỉ định quyền của họ.',
                              style: TextStyle(color: Color(0xFF8EA3CC), fontSize: 13),
                            ),
                            if (widget.canManageRoles) ...[
                              const SizedBox(height: 10),
                              FilledButton(
                                onPressed: _createRole,
                                style: FilledButton.styleFrom(
                                  backgroundColor: const Color(0xFF5865F2),
                                ),
                                child: const Text('Tạo vai trò'),
                              ),
                            ],
                          ],
                        ),
                      ),
                      const SizedBox(height: 16),
                      ...custom.map(
                        (r) => _RoleRow(
                          name: r.name,
                          color: r.color,
                          onTap: () => _openRole(r),
                        ),
                      ),
                      if (def case final everyone?)
                        _RoleRow(
                          name: '@everyone',
                          color: everyone.color,
                          onTap: () => _openRole(everyone),
                        ),
                    ],
                  ),
      ),
    );
  }
}

class _RoleRow extends StatelessWidget {
  const _RoleRow({
    required this.name,
    required this.color,
    required this.onTap,
  });

  final String name;
  final String color;
  final VoidCallback onTap;

  Color _parse(String hex) {
    var h = hex.trim();
    if (h.startsWith('#')) h = h.substring(1);
    if (h.length == 6) {
      return Color(int.parse('FF$h', radix: 16));
    }
    return const Color(0xFF99AAB5);
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: const Color(0xFF0E1F45),
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
            child: Row(
              children: [
                Container(
                  width: 14,
                  height: 14,
                  decoration: BoxDecoration(
                    color: _parse(color),
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    name,
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w700,
                      fontSize: 16,
                    ),
                  ),
                ),
                const Icon(Icons.chevron_right_rounded, color: Color(0xFF7E8CA8)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
