import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../services/messages_media_service.dart';
import '../services/servers_service.dart';

class ServerStickerScreen extends StatefulWidget {
  const ServerStickerScreen({
    super.key,
    required this.serverId,
    required this.isOwner,
  });

  final String serverId;
  final bool isOwner;

  @override
  State<ServerStickerScreen> createState() => _ServerStickerScreenState();
}

class _ServerStickerScreenState extends State<ServerStickerScreen> {
  static const Color _bg = Color(0xFF08183A);
  static const Color _card = Color(0xFF0E1F45);

  int _max = 15;
  int _count = 0;
  List<Map<String, dynamic>> _stickers = [];
  bool _loading = true;
  String? _error;
  bool _busy = false;

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
      final m = await ServersService.getServerStickersManage(widget.serverId);
      if (!mounted) return;
      final list = m['stickers'];
      setState(() {
        _max = (m['max'] is num) ? (m['max'] as num).toInt() : 15;
        _count = (m['count'] is num) ? (m['count'] as num).toInt() : 0;
        _stickers = list is List
            ? list.map((e) => Map<String, dynamic>.from(e as Map)).toList()
            : [];
      });
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _setBoost(String? tier) async {
    if (!widget.isOwner) return;
    setState(() => _busy = true);
    try {
      await ServersService.setServerStickerBoostTier(
        widget.serverId,
        tier: tier,
      );
      await _load();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Đã cập nhật Boost sticker')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _add() async {
    if (_count >= _max) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Đã đủ ô sticker')),
      );
      return;
    }
    final picker = ImagePicker();
    final x = await picker.pickImage(source: ImageSource.gallery);
    if (x == null) return;
    setState(() => _busy = true);
    try {
      final path = x.path;
      final ct = MessagesMediaService.resolveUploadContentType(
        filePath: path,
        hintedContentType: x.mimeType,
      );
      final up = await MessagesMediaService.uploadFile(
        filePath: path,
        contentType: ct,
      );
      final url = MessagesMediaService.pickDisplayUrl(up);
      if (url.isEmpty) throw Exception('Upload thất bại');
      final name = x.name.split('.').first.replaceAll(RegExp(r'[^a-zA-Z0-9_]'), '_');
      await ServersService.addServerSticker(
        widget.serverId,
        imageUrl: url,
        name: name.isNotEmpty ? name : 'sticker',
        animated: ct == 'image/gif',
      );
      if (!mounted) return;
      await _load();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final pad = MediaQuery.paddingOf(context);
    final hPad = MediaQuery.sizeOf(context).width > 520 ? 24.0 : 14.0;

    return Scaffold(
      backgroundColor: _bg,
      appBar: AppBar(
        backgroundColor: _bg,
        title: const Text('Sticker máy chủ', style: TextStyle(fontWeight: FontWeight.w800)),
      ),
      floatingActionButton: _busy
          ? null
          : FloatingActionButton.extended(
              onPressed: _add,
              backgroundColor: const Color(0xFF5865F2),
              icon: const Icon(Icons.add_photo_alternate_outlined),
              label: const Text('Tải lên'),
            ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!))
              : ListView(
                  padding: EdgeInsets.fromLTRB(hPad, 12, hPad, pad.bottom + 88),
                  children: [
                    if (widget.isOwner) ...[
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: const Color(0xFF2C1F4A),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'Boost sticker (chủ máy chủ)',
                              style: TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            const SizedBox(height: 8),
                            Wrap(
                              spacing: 8,
                              runSpacing: 8,
                              children: [
                                OutlinedButton(
                                  onPressed: _busy ? null : () => _setBoost('basic'),
                                  child: const Text('Mức cơ bản'),
                                ),
                                OutlinedButton(
                                  onPressed: _busy ? null : () => _setBoost('boost'),
                                  child: const Text('Boost đầy đủ'),
                                ),
                                OutlinedButton(
                                  onPressed: _busy ? null : () => _setBoost(null),
                                  child: const Text('Gỡ gán'),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 14),
                    ],
                    Text(
                      '$_count / $_max sticker',
                      style: const TextStyle(color: Color(0xFF8EA3CC)),
                    ),
                    const SizedBox(height: 12),
                    ..._stickers.map(
                      (s) => Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: Container(
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(
                            color: _card,
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Row(
                            children: [
                              ClipRRect(
                                borderRadius: BorderRadius.circular(8),
                                child: Image.network(
                                  s['imageUrl']?.toString() ?? '',
                                  width: 56,
                                  height: 56,
                                  fit: BoxFit.cover,
                                  errorBuilder: (_, __, ___) => const SizedBox(
                                    width: 56,
                                    height: 56,
                                    child: Icon(Icons.image_not_supported),
                                  ),
                                ),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      s['name']?.toString() ?? '',
                                      style: const TextStyle(
                                        color: Colors.white,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                    Text(
                                      (s['animated'] == true) ? 'GIF' : 'Tĩnh',
                                      style: const TextStyle(
                                        color: Color(0xFF8EA3CC),
                                        fontSize: 12,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
    );
  }
}
