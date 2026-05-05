import 'package:flutter/material.dart';

import '../models/server_role_models.dart';
import '../services/servers_service.dart';
import 'role_permission_sections.dart';

/// Chỉnh sửa vai trò: hiển thị / quyền / thành viên — logic theo web `RoleEditModal`.
class RoleEditScreen extends StatefulWidget {
  const RoleEditScreen({
    super.key,
    required this.serverId,
    required this.initialRole,
    required this.allRoles,
    required this.isOwner,
  });

  final String serverId;
  final ServerRole initialRole;
  final List<ServerRole> allRoles;
  final bool isOwner;

  @override
  State<RoleEditScreen> createState() => _RoleEditScreenState();
}

class _RoleEditScreenState extends State<RoleEditScreen>
    with SingleTickerProviderStateMixin {
  static const Color _bg = Color(0xFF08183A);

  late TabController _tab;
  late TextEditingController _nameCtrl;
  late TextEditingController _colorCtrl;
  late RolePermissions _perm;
  late List<String> _memberIds;
  bool _saving = false;
  bool _deleting = false;
  List<MemberWithRolesRow> _allMembers = [];
  bool _loadingMembers = true;

  @override
  void initState() {
    super.initState();
    _tab = TabController(length: 3, vsync: this);
    _nameCtrl = TextEditingController(text: widget.initialRole.name);
    _colorCtrl = TextEditingController(text: widget.initialRole.color);
    _perm = widget.initialRole.permissions.copy();
    _memberIds = List<String>.from(widget.initialRole.memberIds);
    _loadMembers();
  }

  @override
  void dispose() {
    _tab.dispose();
    _nameCtrl.dispose();
    _colorCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadMembers() async {
    setState(() => _loadingMembers = true);
    try {
      final res =
          await ServersService.getServerMembersWithRoles(widget.serverId);
      if (!mounted) return;
      setState(() => _allMembers = res.members);
    } catch (_) {
      if (mounted) setState(() => _allMembers = []);
    } finally {
      if (mounted) setState(() => _loadingMembers = false);
    }
  }

  bool _memberHasRole(String userId) => _memberIds.contains(userId);

  Future<void> _toggleMember(String userId, bool add) async {
    if (!widget.isOwner || widget.initialRole.isDefault) return;
    try {
      if (add) {
        await ServersService.addMemberToRole(
          serverId: widget.serverId,
          roleId: widget.initialRole.id,
          memberId: userId,
        );
      } else {
        await ServersService.removeMemberFromRole(
          serverId: widget.serverId,
          roleId: widget.initialRole.id,
          memberId: userId,
        );
      }
      setState(() {
        if (add) {
          if (!_memberIds.contains(userId)) _memberIds.add(userId);
        } else {
          _memberIds.remove(userId);
        }
      });
      await _loadMembers();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Đã cập nhật thành viên trong vai trò')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('$e')),
        );
      }
    }
  }

  Future<void> _saveDisplay() async {
    if (!widget.isOwner && widget.initialRole.isDefault) return;
    setState(() => _saving = true);
    try {
      await ServersService.updateRole(
        serverId: widget.serverId,
        roleId: widget.initialRole.id,
        name: _nameCtrl.text.trim(),
        color: _colorCtrl.text.trim(),
      );
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('$e')),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _savePermissions() async {
    if (!widget.isOwner) return;
    setState(() => _saving = true);
    try {
      await ServersService.updateRole(
        serverId: widget.serverId,
        roleId: widget.initialRole.id,
        permissions: _perm.toJson(),
      );
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('$e')),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _deleteRole() async {
    if (!widget.isOwner || widget.initialRole.isDefault) return;
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        backgroundColor: const Color(0xFF152A52),
        title: const Text('Xóa vai trò?', style: TextStyle(color: Colors.white)),
        content: Text(
          'Xóa ${widget.initialRole.name}?',
          style: const TextStyle(color: Color(0xFFB8C8E8)),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Huỷ')),
          TextButton(
            onPressed: () => Navigator.pop(c, true),
            child: const Text('Xóa', style: TextStyle(color: Color(0xFFFF6B7A))),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => _deleting = true);
    try {
      await ServersService.deleteRole(
        serverId: widget.serverId,
        roleId: widget.initialRole.id,
      );
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('$e')),
        );
      }
    } finally {
      if (mounted) setState(() => _deleting = false);
    }
  }

  InputDecoration _dec(String h) => InputDecoration(
        hintText: h,
        hintStyle: const TextStyle(color: Color(0xFF8EA3CC)),
        filled: true,
        fillColor: const Color(0xFF152A52),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
      );

  @override
  Widget build(BuildContext context) {
    final pad = MediaQuery.paddingOf(context);
    final canEditPerms = widget.isOwner;

    return Scaffold(
      backgroundColor: _bg,
      appBar: AppBar(
        backgroundColor: _bg,
        title: Text(
          widget.initialRole.isDefault
              ? '@everyone'
              : widget.initialRole.name,
          style: const TextStyle(fontWeight: FontWeight.w800),
        ),
        bottom: TabBar(
          controller: _tab,
          indicatorColor: const Color(0xFF7FB6FF),
          labelStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
          tabs: const [
            Tab(text: 'Hiển thị'),
            Tab(text: 'Quyền'),
            Tab(text: 'Thành viên'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tab,
        children: [
          ListView(
            padding: EdgeInsets.fromLTRB(16, 16, 16, pad.bottom + 24),
            children: [
              TextField(
                controller: _nameCtrl,
                enabled: !widget.initialRole.isDefault,
                style: const TextStyle(color: Colors.white),
                decoration: _dec('Tên vai trò'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _colorCtrl,
                style: const TextStyle(color: Colors.white),
                decoration: _dec('Màu (#RRGGBB)'),
              ),
              const SizedBox(height: 20),
              FilledButton(
                onPressed: _saving ? null : _saveDisplay,
                style: FilledButton.styleFrom(
                  backgroundColor: const Color(0xFF00C48C),
                  minimumSize: const Size(double.infinity, 48),
                ),
                child: _saving
                    ? const SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Text('Lưu'),
              ),
              if (!widget.isOwner && !widget.initialRole.isDefault)
                const Padding(
                  padding: EdgeInsets.only(top: 12),
                  child: Text(
                    'Chỉ chủ máy chủ có thể chỉnh sửa vai trò tùy chỉnh.',
                    style: TextStyle(color: Color(0xFF8EA3CC)),
                  ),
                ),
              if (widget.isOwner && !widget.initialRole.isDefault) ...[
                const SizedBox(height: 24),
                OutlinedButton(
                  onPressed: _deleting ? null : _deleteRole,
                  style: OutlinedButton.styleFrom(
                    foregroundColor: const Color(0xFFFF8A8A),
                    minimumSize: const Size(double.infinity, 48),
                  ),
                  child: Text(_deleting ? 'Đang xóa…' : 'Xóa vai trò'),
                ),
              ],
            ],
          ),
          ListView(
            padding: EdgeInsets.fromLTRB(8, 8, 8, pad.bottom + 80),
            children: [
              if (!canEditPerms)
                const Padding(
                  padding: EdgeInsets.all(12),
                  child: Text(
                    'Chỉ chủ máy chủ chỉnh quyền chi tiết (giống web).',
                    style: TextStyle(color: Color(0xFF8EA3CC)),
                  ),
                ),
              ...kRolePermissionSections.map((sec) {
                return ExpansionTile(
                  tilePadding: const EdgeInsets.symmetric(horizontal: 8),
                  iconColor: const Color(0xFF8EA3CC),
                  collapsedIconColor: const Color(0xFF8EA3CC),
                  title: Text(
                    sec.title,
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  children: sec.items.map((item) {
                    return SwitchListTile(
                      value: _perm[item.key],
                      onChanged: canEditPerms
                          ? (v) => setState(() => _perm[item.key] = v)
                          : null,
                      activeThumbColor: const Color(0xFF00C48C),
                      title: Text(
                        item.label,
                        style: const TextStyle(color: Colors.white70),
                      ),
                      subtitle: item.warn
                          ? const Text(
                              'Quyền nhạy cảm',
                              style: TextStyle(color: Color(0xFFFFB4B4), fontSize: 11),
                            )
                          : null,
                    );
                  }).toList(),
                );
              }),
              Padding(
                padding: const EdgeInsets.all(12),
                child: FilledButton(
                  onPressed:
                      (!canEditPerms || _saving) ? null : _savePermissions,
                  style: FilledButton.styleFrom(
                    backgroundColor: const Color(0xFF00C48C),
                    minimumSize: const Size(double.infinity, 48),
                  ),
                  child: _saving
                      ? const SizedBox(
                          width: 22,
                          height: 22,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Text('Lưu quyền'),
                ),
              ),
            ],
          ),
          _loadingMembers
              ? const Center(child: CircularProgressIndicator())
              : Builder(
                  builder: (context) {
                    final rows =
                        _allMembers.where((m) => !m.isOwner).toList();
                    return ListView.builder(
                      padding: EdgeInsets.fromLTRB(8, 8, 8, pad.bottom + 24),
                      itemCount: rows.length,
                      itemBuilder: (context, i) {
                        final m = rows[i];
                    final has = _memberHasRole(m.userId);
                    return SwitchListTile(
                      value: has,
                      onChanged: widget.isOwner &&
                              !widget.initialRole.isDefault
                          ? (v) => _toggleMember(m.userId, v)
                          : null,
                      activeThumbColor: const Color(0xFF00C48C),
                      title: Text(
                        m.displayName,
                        style: const TextStyle(color: Colors.white),
                      ),
                      subtitle: Text(
                        '@${m.username}',
                        style: const TextStyle(color: Color(0xFF8EA3CC)),
                      ),
                    );
                      },
                    );
                  },
                ),
        ],
      ),
    );
  }
}
