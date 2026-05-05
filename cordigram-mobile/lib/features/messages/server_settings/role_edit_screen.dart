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
                style: const TextStyle(color: Colors.white),
                decoration: _dec('Tên vai trò'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _colorCtrl,
                style: const TextStyle(color: Colors.white),
                decoration: _dec('Màu (#RRGGBB)'),
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
                          color: selected
                              ? Colors.white
                              : const Color(0xFF21345D),
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
                  color: const Color(0xFF0E1F45),
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
                          const Text(
                            'Preview vai trò',
                            style: TextStyle(color: Color(0xFF8EA3CC), fontSize: 12),
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
                title: const Text(
                  'Hiển thị vai trò riêng biệt',
                  style: TextStyle(color: Colors.white),
                ),
                activeThumbColor: const Color(0xFF00C48C),
              ),
              SwitchListTile(
                value: _mentionable,
                onChanged: widget.isOwner
                    ? (v) => setState(() => _mentionable = v)
                    : null,
                title: const Text(
                  'Cho phép @mention vai trò này',
                  style: TextStyle(color: Colors.white),
                ),
                subtitle: const Text(
                  'Thành viên có quyền mention sẽ có thể nhắc vai trò.',
                  style: TextStyle(color: Color(0xFF8EA3CC), fontSize: 12),
                ),
                activeThumbColor: const Color(0xFF00C48C),
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
                          backgroundColor: const Color(0xFF00C48C),
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
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
                child: TextField(
                  controller: _permSearchCtrl,
                  onChanged: (_) => setState(() {}),
                  style: const TextStyle(color: Colors.white),
                  decoration: _dec('Tìm quyền...'),
                ),
              ),
              if (!canEditPerms)
                const Padding(
                  padding: EdgeInsets.all(12),
                  child: Text(
                    'Chỉ chủ máy chủ chỉnh quyền chi tiết (giống web).',
                    style: TextStyle(color: Color(0xFF8EA3CC)),
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
                  iconColor: const Color(0xFF8EA3CC),
                  collapsedIconColor: const Color(0xFF8EA3CC),
                  title: Text(
                    sec.title,
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  children: filtered.map((item) {
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
                ),
            ],
          ),
          _loadingMembers
              ? const Center(child: CircularProgressIndicator())
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
                              style: const TextStyle(color: Colors.white),
                              decoration: _dec('Tìm thành viên...'),
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
                            style: const TextStyle(color: Colors.white),
                          ),
                          subtitle: Text(
                            '@${m.username}',
                            style: const TextStyle(color: Color(0xFF8EA3CC)),
                          ),
                          trailing: widget.isOwner && !widget.initialRole.isDefault
                              ? IconButton(
                                  onPressed: () => _toggleMember(m.userId, false),
                                  icon: const Icon(Icons.close, color: Colors.white70),
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
    final q = _searchCtrl.text.trim().toLowerCase();
    final filtered = widget.members.where((m) {
      if (q.isEmpty) return true;
      return m.displayName.toLowerCase().contains(q) ||
          m.username.toLowerCase().contains(q);
    }).toList();

    return Scaffold(
      backgroundColor: const Color(0xFF08183A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF08183A),
        title: const Text('Thêm thành viên'),
        actions: [
          TextButton(
            onPressed: _selected.isEmpty
                ? null
                : () => Navigator.of(context).pop(_selected.toList()),
            child: Text(
              'Thêm (${_selected.length})',
              style: const TextStyle(fontWeight: FontWeight.w700),
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
              style: const TextStyle(color: Colors.white),
              decoration: InputDecoration(
                hintText: 'Tìm kiếm thành viên',
                hintStyle: const TextStyle(color: Color(0xFF8EA3CC)),
                filled: true,
                fillColor: const Color(0xFF152A52),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(10),
                ),
              ),
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
                ? const Center(
                    child: Text(
                      'Không có thành viên phù hợp',
                      style: TextStyle(color: Color(0xFF8EA3CC)),
                    ),
                  )
                : ListView.separated(
                    itemCount: filtered.length,
                    separatorBuilder: (_, __) =>
                        const Divider(height: 1, color: Color(0xFF1C305A)),
                    itemBuilder: (context, index) {
                      final m = filtered[index];
                      final checked = _selected.contains(m.userId);
                      return ListTile(
                        title: Text(
                          m.displayName,
                          style: const TextStyle(color: Colors.white),
                        ),
                        subtitle: Text(
                          '@${m.username}',
                          style: const TextStyle(color: Color(0xFF8EA3CC)),
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
