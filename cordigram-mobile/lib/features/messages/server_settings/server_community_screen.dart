import 'package:flutter/material.dart';

import '../models/server_models.dart';
import '../services/servers_service.dart';

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
  static const Color _bg = Color(0xFF08183A);
  static const Color _card = Color(0xFF0E1F45);

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
    final pad = MediaQuery.paddingOf(context);
    final hPad = MediaQuery.sizeOf(context).width > 520 ? 24.0 : 14.0;
    final enabled = _data?['enabled'] == true;

    return Scaffold(
      backgroundColor: _bg,
      appBar: AppBar(
        backgroundColor: _bg,
        title: const Text(
          'Cộng đồng',
          style: TextStyle(fontWeight: FontWeight.w800),
        ),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
          ? Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text(_error!, textAlign: TextAlign.center),
              ),
            )
          : ListView(
              padding: EdgeInsets.fromLTRB(hPad, 16, hPad, pad.bottom + 24),
              children: [
                Text(
                  enabled
                      ? 'Community đang bật trên máy chủ này.'
                      : 'Community chưa bật. Chủ máy chủ có thể kích hoạt để mở kênh quy định / cập nhật.',
                  style: const TextStyle(
                    color: Color(0xFF8EA3CC),
                    height: 1.45,
                  ),
                ),
                if (!enabled && widget.isOwner) ...[
                  const SizedBox(height: 16),
                  FilledButton(
                    onPressed: _activating ? null : _activate,
                    child: _activating
                        ? const SizedBox(
                            width: 22,
                            height: 22,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Text('Kích hoạt Community'),
                  ),
                ],
                if (enabled) ...[
                  const SizedBox(height: 20),
                  const Text(
                    'Tổng quan',
                    style: TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 10),
                  TextField(
                    controller: _descCtrl,
                    enabled: widget.isOwner,
                    maxLines: 4,
                    style: const TextStyle(color: Colors.white),
                    decoration: InputDecoration(
                      labelText: 'Mô tả cộng đồng',
                      labelStyle: const TextStyle(color: Color(0xFF8EA3CC)),
                      filled: true,
                      fillColor: _card,
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(10),
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<String>(
                    value: _primaryLanguage,
                    dropdownColor: _card,
                    style: const TextStyle(color: Colors.white),
                    decoration: InputDecoration(
                      labelText: 'Ngôn ngữ chính',
                      labelStyle: const TextStyle(color: Color(0xFF8EA3CC)),
                      filled: true,
                      fillColor: _card,
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(10),
                      ),
                    ),
                    items: const [
                      DropdownMenuItem(value: 'vi', child: Text('Tiếng Việt')),
                      DropdownMenuItem(value: 'en', child: Text('English')),
                    ],
                    onChanged: widget.isOwner
                        ? (v) => setState(() => _primaryLanguage = v ?? 'vi')
                        : null,
                  ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<String>(
                    value: _rulesChannelId ?? '',
                    dropdownColor: _card,
                    style: const TextStyle(color: Colors.white),
                    decoration: InputDecoration(
                      labelText: 'Kênh quy định',
                      labelStyle: const TextStyle(color: Color(0xFF8EA3CC)),
                      filled: true,
                      fillColor: _card,
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(10),
                      ),
                    ),
                    items: [
                      const DropdownMenuItem(
                        value: '',
                        child: Text('(Không chọn)'),
                      ),
                      ..._channels
                          .where((c) => c.isText)
                          .map(
                            (c) => DropdownMenuItem(
                              value: c.id,
                              child: Text('#${c.name}'),
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
                        style: const TextStyle(color: Color(0xFF8EA3CC)),
                      ),
                    ),
                  if (widget.isOwner) ...[
                    const SizedBox(height: 16),
                    FilledButton(
                      onPressed: _savingOverview ? null : _saveOverview,
                      child: _savingOverview
                          ? const SizedBox(
                              width: 22,
                              height: 22,
                              child: CircularProgressIndicator(strokeWidth: 2),
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
