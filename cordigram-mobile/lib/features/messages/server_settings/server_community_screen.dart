import 'package:flutter/material.dart';

import '../services/servers_service.dart';

/// GET `/servers/:id/community`, kích hoạt Community (chủ máy chủ).
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

  Map<String, dynamic>? _data;
  bool _loading = true;
  String? _error;
  bool _activating = false;

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
      final m = await ServersService.getCommunitySettings(widget.serverId);
      if (!mounted) return;
      setState(() => _data = Map<String, dynamic>.from(m));
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
                          : 'Community chưa bật. Chủ máy chủ có thể kích hoạt để mở kênh quy định / cập nhật (theo backend).',
                      style: const TextStyle(
                        color: Color(0xFF8EA3CC),
                        height: 1.45,
                      ),
                    ),
                    if (_data != null) ...[
                      const SizedBox(height: 12),
                      if (_data!['rulesChannelId'] != null)
                        Text(
                          'Kênh quy định: ${_data!['rulesChannelId']}',
                          style: const TextStyle(color: Color(0xFF8EA3CC)),
                        ),
                      if (_data!['updatesChannelId'] != null)
                        Padding(
                          padding: const EdgeInsets.only(top: 6),
                          child: Text(
                            'Kênh cập nhật: ${_data!['updatesChannelId']}',
                            style: const TextStyle(color: Color(0xFF8EA3CC)),
                          ),
                        ),
                    ],
                    if (!enabled && widget.isOwner) ...[
                      const SizedBox(height: 24),
                      FilledButton(
                        onPressed: _activating ? null : _activate,
                        style: FilledButton.styleFrom(
                          backgroundColor: const Color(0xFF5865F2),
                          minimumSize: const Size(double.infinity, 48),
                        ),
                        child: Text(_activating ? 'Đang kích hoạt…' : 'Kích hoạt Community'),
                      ),
                    ],
                  ],
                ),
    );
  }
}
