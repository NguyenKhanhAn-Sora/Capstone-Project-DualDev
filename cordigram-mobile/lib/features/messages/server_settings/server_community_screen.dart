import 'package:flutter/material.dart';

import '../models/server_models.dart';
import '../services/servers_service.dart';
import 'server_settings_ui.dart';

/// GET `/servers/:id/community`, kích hoạt + tổng quan Community.
class ServerCommunityScreen extends StatefulWidget {
  const ServerCommunityScreen({
    super.key,
    required this.serverId,
    required this.isOwner,
  });

  final String serverId;
  final bool isOwner;

  @override
  State<ServerCommunityScreen> createState() => _ServerCommunityScreenState();
}

class _ServerCommunityScreenState extends State<ServerCommunityScreen> {
  Map<String, dynamic>? _data;
  List<ServerChannel> _channels = [];
  bool _loading = true;
  String? _error;
  bool _activating = false;
  bool _savingOverview = false;

  final _descCtrl = TextEditingController();
  String _primaryLanguage = 'vi';
  String? _rulesChannelId;

  @override
  void dispose() {
    _descCtrl.dispose();
    super.dispose();
  }

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
      final results = await Future.wait([
        ServersService.getCommunitySettings(widget.serverId),
        ServersService.getServerChannels(widget.serverId),
      ]);
      if (!mounted) return;
      final m = Map<String, dynamic>.from(results[0] as Map);
      setState(() {
        _data = m;
        _channels = results[1] as List<ServerChannel>;
        _descCtrl.text = (m['description'] ?? '').toString();
        _primaryLanguage =
            (m['primaryLanguage'] ?? 'vi').toString() == 'en' ? 'en' : 'vi';
        _rulesChannelId = m['rulesChannelId']?.toString();
      });
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _activate() async {
    if (!widget.isOwner) return;
    setState(() => _activating = true);
    try {
      await ServersService.activateCommunity(
        widget.serverId,
        body: {
          'createRulesChannel': true,
          'createUpdatesChannel': true,
        },
      );
      await _load();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Đã bật Community')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
      }
    } finally {
      if (mounted) setState(() => _activating = false);
    }
  }

  Future<void> _saveOverview() async {
    if (!widget.isOwner || _data?['enabled'] != true) return;
    setState(() => _savingOverview = true);
    try {
      await ServersService.updateCommunityOverview(
        widget.serverId,
        rulesChannelId: _rulesChannelId,
        primaryLanguage: _primaryLanguage,
        description: _descCtrl.text.trim(),
      );
      await _load();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Đã lưu tổng quan Community')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
      }
    } finally {
      if (mounted) setState(() => _savingOverview = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final ui = ServerSettingsUi.of(context);
    final pad = MediaQuery.paddingOf(context);
    final hPad = MediaQuery.sizeOf(context).width > 520 ? 24.0 : 14.0;
    final enabled = _data?['enabled'] == true;

    return Scaffold(
      backgroundColor: ui.bg,
      appBar: ui.buildAppBar(title: 'Cộng đồng'),
      body: _loading
          ? Center(child: CircularProgressIndicator(color: ui.accent))
          : _error != null
          ? Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text(
                  _error!,
                  textAlign: TextAlign.center,
                  style: TextStyle(color: ui.textMuted),
                ),
              ),
            )
          : ListView(
              padding: EdgeInsets.fromLTRB(hPad, 16, hPad, pad.bottom + 24),
              children: [
                Text(
                  enabled
                      ? 'Community đang bật trên máy chủ này.'
                      : 'Community chưa bật. Chủ máy chủ có thể kích hoạt để mở kênh quy định / cập nhật.',
                  style: TextStyle(
                    color: ui.textMuted,
                    height: 1.45,
                  ),
                ),
                if (!enabled && widget.isOwner) ...[
                  const SizedBox(height: 16),
                  FilledButton(
                    onPressed: _activating ? null : _activate,
                    style: FilledButton.styleFrom(
                      backgroundColor: ui.accent,
                      foregroundColor: ui.onAccent,
                    ),
                    child: _activating
                        ? SizedBox(
                            width: 22,
                            height: 22,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: ui.onAccent,
                            ),
                          )
                        : const Text('Kích hoạt Community'),
                  ),
                ],
                if (enabled) ...[
                  const SizedBox(height: 20),
                  Text(
                    'Tổng quan',
                    style: TextStyle(
                      color: ui.text,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 10),
                  TextField(
                    controller: _descCtrl,
                    enabled: widget.isOwner,
                    maxLines: 4,
                    style: TextStyle(color: ui.text),
                    decoration: ui.fieldDecoration(
                      labelText: 'Mô tả cộng đồng',
                    ),
                  ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<String>(
                    value: _primaryLanguage,
                    dropdownColor: ui.card,
                    style: TextStyle(color: ui.text),
                    decoration: ui.fieldDecoration(
                      labelText: 'Ngôn ngữ chính',
                    ),
                    items: [
                      DropdownMenuItem(
                        value: 'vi',
                        child: Text('Tiếng Việt', style: TextStyle(color: ui.text)),
                      ),
                      DropdownMenuItem(
                        value: 'en',
                        child: Text('English', style: TextStyle(color: ui.text)),
                      ),
                    ],
                    onChanged: widget.isOwner
                        ? (v) => setState(() => _primaryLanguage = v ?? 'vi')
                        : null,
                  ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<String>(
                    value: _rulesChannelId ?? '',
                    dropdownColor: ui.card,
                    style: TextStyle(color: ui.text),
                    decoration: ui.fieldDecoration(
                      labelText: 'Kênh quy định',
                    ),
                    items: [
                      DropdownMenuItem(
                        value: '',
                        child: Text('(Không chọn)', style: TextStyle(color: ui.text)),
                      ),
                      ..._channels
                          .where((c) => c.isText)
                          .map(
                            (c) => DropdownMenuItem(
                              value: c.id,
                              child: Text('#${c.name}', style: TextStyle(color: ui.text)),
                            ),
                          ),
                    ],
                    onChanged: widget.isOwner
                        ? (v) => setState(
                            () => _rulesChannelId = (v == null || v.isEmpty)
                                ? null
                                : v,
                          )
                        : null,
                  ),
                  if (_data?['updatesChannelId'] != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: Text(
                        'Kênh cập nhật: ${_data!['updatesChannelId']}',
                        style: TextStyle(color: ui.textMuted),
                      ),
                    ),
                  if (widget.isOwner) ...[
                    const SizedBox(height: 16),
                    FilledButton(
                      onPressed: _savingOverview ? null : _saveOverview,
                      style: FilledButton.styleFrom(
                        backgroundColor: ui.accent,
                        foregroundColor: ui.onAccent,
                      ),
                      child: _savingOverview
                          ? SizedBox(
                              width: 22,
                              height: 22,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: ui.onAccent,
                              ),
                            )
                          : const Text('Lưu tổng quan'),
                    ),
                  ],
                ],
              ],
            ),
    );
  }
}
