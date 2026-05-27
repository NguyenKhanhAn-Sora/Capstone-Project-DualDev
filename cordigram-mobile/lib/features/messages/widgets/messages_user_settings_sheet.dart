import 'package:flutter/material.dart';

import '../services/direct_messages_service.dart';
import '../utils/dm_sidebar_prefs.dart';

/// Subset of web `MessagesUserSettingsModal` focused on DM privacy + messaging profile.
class MessagesUserSettingsSheet extends StatefulWidget {
  const MessagesUserSettingsSheet({
    super.key,
    required this.onSaved,
  });

  final VoidCallback onSaved;

  static Future<void> show(BuildContext context, {VoidCallback? onSaved}) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF0B1424),
      builder: (_) => MessagesUserSettingsSheet(
        onSaved: () => onSaved?.call(),
      ),
    );
  }

  @override
  State<MessagesUserSettingsSheet> createState() =>
      _MessagesUserSettingsSheetState();
}

class _MessagesUserSettingsSheetState extends State<MessagesUserSettingsSheet> {
  bool _loading = true;
  bool _saving = false;
  String _dmListFrom = 'everyone';
  String _dmCallFrom = 'everyone';
  DmSidebarPeersMode _peersMode = DmSidebarPeersMode.all;

  final _displayNameController = TextEditingController();
  final _usernameController = TextEditingController();
  final _bioController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _displayNameController.dispose();
    _usernameController.dispose();
    _bioController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final settings = await DirectMessagesService.getUserSettings();
      final profile = await DirectMessagesService.getMyMessagingProfile();
      final peersMode = await DmSidebarPrefs.getPeersMode();
      if (!mounted) return;
      setState(() {
        _dmListFrom = (settings['dmListFrom'] ?? 'everyone').toString();
        _dmCallFrom = (settings['dmCallFrom'] ?? 'everyone').toString();
        _peersMode = peersMode;
        _displayNameController.text =
            (profile['displayName'] ?? profile['name'] ?? '').toString();
        _usernameController.text =
            (profile['chatUsername'] ?? profile['username'] ?? '').toString();
        _bioController.text = (profile['bio'] ?? '').toString();
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _loading = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Không tải được cài đặt: $e')),
      );
    }
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      await DirectMessagesService.updateUserSettings(
        dmListFrom: _dmListFrom,
        dmCallFrom: _dmCallFrom,
      );
      await DmSidebarPrefs.setPeersMode(_peersMode);
      final displayName = _displayNameController.text.trim();
      final username = _usernameController.text.trim();
      final bio = _bioController.text.trim();
      await DirectMessagesService.updateMyMessagingProfile({
        if (displayName.isNotEmpty) 'displayName': displayName,
        if (username.isNotEmpty) 'chatUsername': username,
        'bio': bio,
      });
      if (!mounted) return;
      widget.onSaved();
      Navigator.of(context).pop();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Đã lưu cài đặt tin nhắn')),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Lưu thất bại: $e')),
      );
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: SafeArea(
        child: _loading
            ? const SizedBox(
                height: 220,
                child: Center(child: CircularProgressIndicator()),
              )
            : SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Row(
                      children: [
                        const Expanded(
                          child: Text(
                            'Cài đặt tin nhắn',
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: 17,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                        IconButton(
                          onPressed: () => Navigator.of(context).pop(),
                          icon: const Icon(Icons.close, color: Colors.white70),
                        ),
                      ],
                    ),
                    const Text(
                      'Hồ sơ trò chuyện',
                      style: TextStyle(
                        color: Color(0xFFAFC0E2),
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 8),
                    _field(_displayNameController, 'Tên hiển thị'),
                    const SizedBox(height: 8),
                    _field(_usernameController, 'Tên người dùng'),
                    const SizedBox(height: 8),
                    _field(_bioController, 'Tiểu sử', maxLines: 3),
                    const SizedBox(height: 16),
                    const Text(
                      'Danh sách DM',
                      style: TextStyle(
                        color: Color(0xFFAFC0E2),
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    RadioListTile<String>(
                      value: 'all',
                      groupValue: _peersMode == DmSidebarPeersMode.online
                          ? 'online'
                          : 'all',
                      title: const Text(
                        'Tất cả',
                        style: TextStyle(color: Colors.white),
                      ),
                      subtitle: const Text(
                        'Hiển thị mọi người bạn có thể nhắn',
                        style: TextStyle(color: Color(0xFF8A98B8), fontSize: 12),
                      ),
                      onChanged: _saving
                          ? null
                          : (_) => setState(
                              () => _peersMode = DmSidebarPeersMode.all,
                            ),
                    ),
                    RadioListTile<String>(
                      value: 'online',
                      groupValue: _peersMode == DmSidebarPeersMode.online
                          ? 'online'
                          : 'all',
                      title: const Text(
                        'Chỉ đang online',
                        style: TextStyle(color: Colors.white),
                      ),
                      onChanged: _saving
                          ? null
                          : (_) => setState(
                              () => _peersMode = DmSidebarPeersMode.online,
                            ),
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'Quyền riêng tư',
                      style: TextStyle(
                        color: Color(0xFFAFC0E2),
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    _privacyDropdown(
                      label: 'Ai có thể nhắn bạn',
                      value: _dmListFrom,
                      onChanged: (v) => setState(() => _dmListFrom = v!),
                    ),
                    _privacyDropdown(
                      label: 'Ai có thể gọi bạn',
                      value: _dmCallFrom,
                      onChanged: (v) => setState(() => _dmCallFrom = v!),
                    ),
                    const SizedBox(height: 16),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton(
                        onPressed: _saving ? null : _save,
                        child: _saving
                            ? const SizedBox(
                                width: 20,
                                height: 20,
                                child: CircularProgressIndicator(strokeWidth: 2),
                              )
                            : const Text('Lưu'),
                      ),
                    ),
                  ],
                ),
              ),
      ),
    );
  }

  Widget _field(
    TextEditingController controller,
    String label, {
    int maxLines = 1,
  }) {
    return TextField(
      controller: controller,
      maxLines: maxLines,
      style: const TextStyle(color: Colors.white),
      decoration: InputDecoration(
        labelText: label,
        labelStyle: const TextStyle(color: Color(0xFFAFC0E2)),
        filled: true,
        fillColor: const Color(0xFF1D2E52),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide.none,
        ),
      ),
    );
  }

  Widget _privacyDropdown({
    required String label,
    required String value,
    required ValueChanged<String?> onChanged,
  }) {
    return Padding(
      padding: const EdgeInsets.only(top: 4),
      child: DropdownButtonFormField<String>(
        value: value,
        dropdownColor: const Color(0xFF1D2E52),
        style: const TextStyle(color: Colors.white),
        decoration: InputDecoration(
          labelText: label,
          labelStyle: const TextStyle(color: Color(0xFFAFC0E2)),
          filled: true,
          fillColor: const Color(0xFF1D2E52),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: BorderSide.none,
          ),
        ),
        items: const [
          DropdownMenuItem(
            value: 'everyone',
            child: Text('Mọi người'),
          ),
          DropdownMenuItem(
            value: 'followers_only',
            child: Text('Chỉ người bạn theo dõi'),
          ),
        ],
        onChanged: _saving ? null : onChanged,
      ),
    );
  }
}
