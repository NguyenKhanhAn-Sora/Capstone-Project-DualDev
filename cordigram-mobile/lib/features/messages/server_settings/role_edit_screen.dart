import 'package:flutter/material.dart';

import '../models/server_role_models.dart';
import '../services/servers_service.dart';
import 'role_permission_sections.dart';
import 'server_settings_ui.dart';

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
  static const List<String> _presetColors = <String>[
    '#99AAB5',
    '#5865F2',
    '#57F287',
    '#FEE75C',
    '#EB459E',
    '#ED4245',
    '#F59E0B',
    '#3498DB',
    '#9B59B6',
    '#1ABC9C',
  ];

  late TabController _tab;
  late TextEditingController _nameCtrl;
  late TextEditingController _colorCtrl;
  late bool _displaySeparately;
  late bool _mentionable;
  late RolePermissions _perm;
  late List<String> _memberIds;
  late RolePermissions _initialPerm;
  late String _initialName;
  late String _initialColor;
  late bool _initialDisplaySeparately;
  late bool _initialMentionable;
  bool _saving = false;
  bool _deleting = false;
  List<MemberWithRolesRow> _allMembers = [];
  bool _loadingMembers = true;
  final TextEditingController _permSearchCtrl = TextEditingController();
  final TextEditingController _memberSearchCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _tab = TabController(length: 3, vsync: this);
    _nameCtrl = TextEditingController(text: widget.initialRole.name);
    _colorCtrl = TextEditingController(text: widget.initialRole.color);
    _displaySeparately = widget.initialRole.displaySeparately;
    _mentionable = widget.initialRole.mentionable;
    _perm = widget.initialRole.permissions.copy();
    _initialPerm = widget.initialRole.permissions.copy();
    _memberIds = List<String>.from(widget.initialRole.memberIds);
    _initialName = widget.initialRole.name;
    _initialColor = widget.initialRole.color;
    _initialDisplaySeparately = widget.initialRole.displaySeparately;
    _initialMentionable = widget.initialRole.mentionable;
    _loadMembers();
  }

  @override
  void dispose() {
    _tab.dispose();
    _nameCtrl.dispose();
    _colorCtrl.dispose();
    _permSearchCtrl.dispose();
    _memberSearchCtrl.dispose();
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

  Future<void> _addMembersBulk(List<String> userIds) async {
    if (userIds.isEmpty || !widget.isOwner || widget.initialRole.isDefault) return;
    setState(() => _saving = true);
    var added = 0;
    try {
      for (final userId in userIds) {
        await ServersService.addMemberToRole(
          serverId: widget.serverId,
          roleId: widget.initialRole.id,
          memberId: userId,
        );
        if (!_memberIds.contains(userId)) {
          _memberIds.add(userId);
          added += 1;
        }
      }
      await _loadMembers();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Đã thêm $added thành viên vào vai trò')),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('$e')),
      );
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _openAddMembersScreen(List<MemberWithRolesRow> available) async {
    if (!widget.isOwner || widget.initialRole.isDefault || _saving) return;
    final selected = await Navigator.of(context).push<List<String>>(
      MaterialPageRoute(
        builder: (_) => _RoleMemberPickerScreen(
          members: available,
        ),
      ),
    );
    if (selected == null || selected.isEmpty) return;
    await _addMembersBulk(selected);
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
        displaySeparately: _displaySeparately,
        mentionable: _mentionable,
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
      builder: (c) {
        final dui = ServerSettingsUi.of(c);
        return AlertDialog(
          backgroundColor: dui.card,
          title: Text('Xóa vai trò?', style: TextStyle(color: dui.text)),
          content: Text(
            'Xóa ${widget.initialRole.name}?',
            style: TextStyle(color: dui.textMuted),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Huỷ')),
            TextButton(
              onPressed: () => Navigator.pop(c, true),
              child: Text('Xóa', style: TextStyle(color: dui.destructive)),
            ),
          ],
        );
      },
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

  InputDecoration _dec(ServerSettingsUi ui, String h) =>
      ui.fieldDecoration(hintText: h);

  Color _parseHex(String hex) {
    var h = hex.trim();
    if (h.startsWith('#')) h = h.substring(1);
    if (h.length == 6) {
      final v = int.tryParse('FF$h', radix: 16);
      if (v != null) return Color(v);
    }
    return const Color(0xFF99AAB5);
  }

  bool get _displayDirty =>
      _nameCtrl.text.trim() != _initialName ||
      _colorCtrl.text.trim().toUpperCase() != _initialColor.toUpperCase() ||
      _displaySeparately != _initialDisplaySeparately ||
      _mentionable != _initialMentionable;

  bool get _permDirty =>
      _perm.toJson().toString() != _initialPerm.toJson().toString();

  void _resetDisplayChanges() {
    setState(() {
      _nameCtrl.text = _initialName;
      _colorCtrl.text = _initialColor;
      _displaySeparately = _initialDisplaySeparately;
      _mentionable = _initialMentionable;
    });
  }

  @override
  Widget build(BuildContext context) {
    final ui = ServerSettingsUi.of(context);
    final pad = MediaQuery.paddingOf(context);
    final canEditPerms = widget.isOwner;

    return Scaffold(
      backgroundColor: ui.bg,
      appBar: AppBar(
        backgroundColor: ui.bg,
        foregroundColor: ui.text,
        title: Text(
          widget.initialRole.isDefault
              ? '@everyone'
              : widget.initialRole.name,
          style: TextStyle(fontWeight: FontWeight.w800, color: ui.text),
        ),
        bottom: TabBar(
          controller: _tab,
          indicatorColor: ui.accent,
          labelColor: ui.text,
          unselectedLabelColor: ui.textMuted,
          labelStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
          tabs: [
            const Tab(text: 'Hiển thị'),
            const Tab(text: 'Quyền'),
            Tab(text: 'Quản lý thành viên (${_memberIds.length})'),
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
                style: TextStyle(color: ui.text),
                decoration: _dec(ui, 'Tên vai trò'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _colorCtrl,
                style: TextStyle(color: ui.text),
                decoration: _dec(ui, 'Màu (#RRGGBB)'),
              ),
              const SizedBox(height: 12),
              Wrap(
                spacing: 10,
                runSpacing: 10,
                children: _presetColors.map((c) {
                  final selected =
                      _colorCtrl.text.trim().toUpperCase() == c.toUpperCase();
                  return GestureDetector(
                    onTap: () => setState(() => _colorCtrl.text = c),
                    child: Container(
                      width: 30,
                      height: 30,
                      decoration: BoxDecoration(
                        color: _parseHex(c),
                        shape: BoxShape.circle,
                        border: Border.all(
                          color: selected ? ui.text : ui.border,
                          width: selected ? 2 : 1,
                        ),
                      ),
                    ),
                  );
                }).toList(),
              ),
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: ui.card,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: _parseHex(_colorCtrl.text.trim())),
                ),
                child: Row(
                  children: [
                    CircleAvatar(
                      radius: 18,
                      backgroundColor: _parseHex(_colorCtrl.text.trim()),
                      child: const Icon(Icons.person, color: Colors.white),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            _nameCtrl.text.trim().isEmpty
                                ? 'vai trò mới'
                                : _nameCtrl.text.trim(),
                            style: TextStyle(
                              color: _parseHex(_colorCtrl.text.trim()),
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          Text(
                            'Preview vai trò',
                            style: TextStyle(color: ui.textMuted, fontSize: 12),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 14),
              SwitchListTile(
                value: _displaySeparately,
                onChanged: widget.isOwner
                    ? (v) => setState(() => _displaySeparately = v)
                    : null,
                title: Text(
                  'Hiển thị vai trò riêng biệt',
                  style: TextStyle(color: ui.text),
                ),
                activeThumbColor: ui.accent,
              ),
              SwitchListTile(
                value: _mentionable,
                onChanged: widget.isOwner
                    ? (v) => setState(() => _mentionable = v)
                    : null,
                title: Text(
                  'Cho phép @mention vai trò này',
                  style: TextStyle(color: ui.text),
                ),
                subtitle: Text(
                  'Thành viên có quyền mention sẽ có thể nhắc vai trò.',
                  style: TextStyle(color: ui.textMuted, fontSize: 12),
                ),
                activeThumbColor: ui.accent,
              ),
              const SizedBox(height: 20),
              if (_displayDirty)
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: _saving ? null : _resetDisplayChanges,
                        child: const Text('Đặt lại'),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: FilledButton(
                        onPressed: _saving ? null : _saveDisplay,
                        style: FilledButton.styleFrom(
                          backgroundColor: ui.accent,
                          foregroundColor: ui.onAccent,
                          minimumSize: const Size(double.infinity, 48),
                        ),
                        child: _saving
                            ? const SizedBox(
                                width: 22,
                                height: 22,
                                child: CircularProgressIndicator(strokeWidth: 2),
                              )
                            : const Text('Lưu thay đổi'),
                      ),
                    ),
                  ],
                ),
              if (!widget.isOwner && !widget.initialRole.isDefault)
                Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: Text(
                    'Chỉ chủ máy chủ có thể chỉnh sửa vai trò tùy chỉnh.',
                    style: TextStyle(color: ui.textMuted),
                  ),
                ),
              if (widget.isOwner && !widget.initialRole.isDefault) ...[
                const SizedBox(height: 24),
                OutlinedButton(
                  onPressed: _deleting ? null : _deleteRole,
                  style: OutlinedButton.styleFrom(
                    foregroundColor: ui.destructive,
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
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
                child: TextField(
                  controller: _permSearchCtrl,
                  onChanged: (_) => setState(() {}),
                  style: const TextStyle(color: Colors.white),
                  decoration: _dec(ui, 'Tìm quyền...'),
                ),
              ),
              if (!canEditPerms)
                Padding(
                  padding: const EdgeInsets.all(12),
                  child: Text(
                    'Chỉ chủ máy chủ chỉnh quyền chi tiết (giống web).',
                    style: TextStyle(color: ui.textMuted),
                  ),
                ),
              ...kRolePermissionSections.map((sec) {
                final filtered = sec.items
                    .where(
                      (item) =>
                          _permSearchCtrl.text.trim().isEmpty ||
                          item.label.toLowerCase().contains(
                              _permSearchCtrl.text.trim().toLowerCase()),
                    )
                    .toList();
                if (filtered.isEmpty) return const SizedBox.shrink();
                return ExpansionTile(
                  tilePadding: const EdgeInsets.symmetric(horizontal: 8),
                  iconColor: ui.textMuted,
                  collapsedIconColor: ui.textMuted,
                  title: Text(
                    sec.title,
                    style: TextStyle(
                      color: ui.text,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  children: filtered.map((item) {
                    return SwitchListTile(
                      value: _perm[item.key],
                      onChanged: canEditPerms
                          ? (v) => setState(() => _perm[item.key] = v)
                          : null,
                      activeThumbColor: ui.accent,
                      title: Text(
                        item.label,
                        style: TextStyle(color: ui.textMuted),
                      ),
                      subtitle: item.warn
                          ? Text(
                              'Quyền nhạy cảm',
                              style: TextStyle(
                                color: ui.destructive.withValues(alpha: 0.8),
                                fontSize: 11,
                              ),
                            )
                          : null,
                    );
                  }).toList(),
                );
              }),
              if (_permDirty)
                Padding(
                  padding: const EdgeInsets.all(12),
                  child: Row(
                    children: [
                      Expanded(
                        child: OutlinedButton(
                          onPressed: _saving
                              ? null
                              : () => setState(() => _perm = _initialPerm.copy()),
                          child: const Text('Đặt lại'),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: FilledButton(
                          onPressed:
                              (!canEditPerms || _saving) ? null : _savePermissions,
                          style: FilledButton.styleFrom(
                            backgroundColor: ui.accent,
                            foregroundColor: ui.onAccent,
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
                ),
            ],
          ),
          _loadingMembers
              ? Center(child: CircularProgressIndicator(color: ui.accent))
              : Builder(
                  builder: (context) {
                    final query = _memberSearchCtrl.text.trim().toLowerCase();
                    final rows = _allMembers
                        .where((m) => !m.isOwner)
                        .where((m) {
                          if (query.isEmpty) return true;
                          return m.displayName.toLowerCase().contains(query) ||
                              m.username.toLowerCase().contains(query);
                        })
                        .toList();
                    final roleMembers =
                        rows.where((m) => _memberHasRole(m.userId)).toList();
                    final availableMembers =
                        rows.where((m) => !_memberHasRole(m.userId)).toList();
                    return ListView.builder(
                      padding: EdgeInsets.fromLTRB(8, 8, 8, pad.bottom + 80),
                      itemCount: roleMembers.length + 2,
                      itemBuilder: (context, i) {
                        if (i == 0) {
                          return Padding(
                            padding: const EdgeInsets.all(8),
                            child: TextField(
                              controller: _memberSearchCtrl,
                              onChanged: (_) => setState(() {}),
                              style: TextStyle(color: ui.text),
                              decoration: _dec(ui, 'Tìm thành viên...'),
                            ),
                          );
                        }
                        if (i == 1 && widget.isOwner && !widget.initialRole.isDefault) {
                          return Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 8),
                            child: FilledButton(
                              onPressed: _saving
                                  ? null
                                  : () => _openAddMembersScreen(availableMembers),
                              child: const Text('Thêm thành viên'),
                            ),
                          );
                        }
                        final idx = i - 2;
                        if (idx < 0 || idx >= roleMembers.length) {
                          return const SizedBox.shrink();
                        }
                        final m = roleMembers[idx];
                        return ListTile(
                          title: Text(
                            m.displayName,
                            style: TextStyle(color: ui.text),
                          ),
                          subtitle: Text(
                            '@${m.username}',
                            style: TextStyle(color: ui.textMuted),
                          ),
                          trailing: widget.isOwner && !widget.initialRole.isDefault
                              ? IconButton(
                                  onPressed: () => _toggleMember(m.userId, false),
                                  icon: Icon(Icons.close, color: ui.textMuted),
                                )
                              : null,
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

class _RoleMemberPickerScreen extends StatefulWidget {
  const _RoleMemberPickerScreen({required this.members});

  final List<MemberWithRolesRow> members;

  @override
  State<_RoleMemberPickerScreen> createState() => _RoleMemberPickerScreenState();
}

class _RoleMemberPickerScreenState extends State<_RoleMemberPickerScreen> {
  final TextEditingController _searchCtrl = TextEditingController();
  final Set<String> _selected = <String>{};
  bool _quickSelect = false;

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ui = ServerSettingsUi.of(context);
    final q = _searchCtrl.text.trim().toLowerCase();
    final filtered = widget.members.where((m) {
      if (q.isEmpty) return true;
      return m.displayName.toLowerCase().contains(q) ||
          m.username.toLowerCase().contains(q);
    }).toList();

    return Scaffold(
      backgroundColor: ui.bg,
      appBar: ui.buildAppBar(
        title: 'Thêm thành viên',
        actions: [
          TextButton(
            onPressed: _selected.isEmpty
                ? null
                : () => Navigator.of(context).pop(_selected.toList()),
            child: Text(
              'Thêm (${_selected.length})',
              style: TextStyle(fontWeight: FontWeight.w700, color: ui.accent),
            ),
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
            child: TextField(
              controller: _searchCtrl,
              onChanged: (_) => setState(() {}),
              style: TextStyle(color: ui.text),
              decoration: ui.fieldDecoration(hintText: 'Tìm kiếm thành viên'),
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Row(
              children: [
                OutlinedButton.icon(
                  onPressed: () => setState(() => _quickSelect = !_quickSelect),
                  icon: Icon(
                    _quickSelect ? Icons.check_circle : Icons.radio_button_unchecked,
                  ),
                  label: Text(_quickSelect ? 'Đang chọn nhanh' : 'Lựa chọn nhanh'),
                ),
                const SizedBox(width: 10),
                if (_quickSelect)
                  TextButton(
                    onPressed: _selected.isEmpty
                        ? null
                        : () => setState(() => _selected.clear()),
                    child: const Text('Bỏ chọn'),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          Expanded(
            child: filtered.isEmpty
                ? Center(
                    child: Text(
                      'Không có thành viên phù hợp',
                      style: TextStyle(color: ui.textMuted),
                    ),
                  )
                : ListView.separated(
                    itemCount: filtered.length,
                    separatorBuilder: (_, __) =>
                        Divider(height: 1, color: ui.divider),
                    itemBuilder: (context, index) {
                      final m = filtered[index];
                      final checked = _selected.contains(m.userId);
                      return ListTile(
                        title: Text(
                          m.displayName,
                          style: TextStyle(color: ui.text),
                        ),
                        subtitle: Text(
                          '@${m.username}',
                          style: TextStyle(color: ui.textMuted),
                        ),
                        trailing: _quickSelect
                            ? Checkbox(
                                value: checked,
                                onChanged: (_) => setState(() {
                                  if (checked) {
                                    _selected.remove(m.userId);
                                  } else {
                                    _selected.add(m.userId);
                                  }
                                }),
                              )
                            : null,
                        onTap: () {
                          if (_quickSelect) {
                            setState(() {
                              if (checked) {
                                _selected.remove(m.userId);
                              } else {
                                _selected.add(m.userId);
                              }
                            });
                            return;
                          }
                          Navigator.of(context).pop(<String>[m.userId]);
                        },
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}
