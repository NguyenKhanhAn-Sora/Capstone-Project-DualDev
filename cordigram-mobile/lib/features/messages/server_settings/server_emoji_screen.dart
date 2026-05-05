import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../services/messages_media_service.dart';
import '../services/servers_service.dart';

class ServerEmojiScreen extends StatefulWidget {
  const ServerEmojiScreen({
    super.key,
    required this.serverId,
  });

  final String serverId;

  @override
  State<ServerEmojiScreen> createState() => _ServerEmojiScreenState();
}

class _ServerEmojiScreenState extends State<ServerEmojiScreen> {
  static const Color _bg = Color(0xFF08183A);
  static const Color _card = Color(0xFF0E1F45);

  int _max = 30;
  int _count = 0;
  List<Map<String, dynamic>> _emojis = [];
  bool _loading = true;
  String? _error;
  bool _adding = false;

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
      final m = await ServersService.getServerEmojisManage(widget.serverId);
      if (!mounted) return;
      final list = m['emojis'];
      setState(() {
        _max = (m['max'] is num) ? (m['max'] as num).toInt() : 30;
        _count = (m['count'] is num) ? (m['count'] as num).toInt() : 0;
        _emojis = list is List
            ? list.map((e) => Map<String, dynamic>.from(e as Map)).toList()
            : [];
      });
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _add() async {
    if (_count >= _max) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Đã đủ số lượng emoji')),
      );
      return;
    }
    final picker = ImagePicker();
    final x = await picker.pickImage(source: ImageSource.gallery);
    if (x == null) return;
    setState(() => _adding = true);
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
      final animated = ct == 'image/gif';
      await ServersService.addServerEmoji(
        widget.serverId,
        imageUrl: url,
        name: name.isNotEmpty ? name : 'emoji',
        animated: animated,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Đã thêm emoji')),
      );
      await _load();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
      }
    } finally {
      if (mounted) setState(() => _adding = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final pad = MediaQuery.paddingOf(context);
    final hPad = MediaQuery.sizeOf(context).width > 520 ? 24.0 : 14.0;
    final rem = (_max - _count).clamp(0, 999);

    return Scaffold(
      backgroundColor: _bg,
      appBar: AppBar(
        backgroundColor: _bg,
        title: const Text('Emoji máy chủ', style: TextStyle(fontWeight: FontWeight.w800)),
      ),
      floatingActionButton: _adding
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
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Padding(
                      padding: EdgeInsets.fromLTRB(hPad, 12, hPad, 8),
                      child: Text(
                        'Còn $rem / $_max chỗ. PNG, JPG, WebP, GIF.',
                        style: const TextStyle(color: Color(0xFF8EA3CC), fontSize: 13),
                      ),
                    ),
                    Expanded(
                      child: _emojis.isEmpty
                          ? const Center(
                              child: Text(
                                'Chưa có emoji tùy chỉnh',
                                style: TextStyle(color: Color(0xFF8EA3CC)),
                              ),
                            )
                          : GridView.builder(
                              padding: EdgeInsets.fromLTRB(
                                hPad,
                                0,
                                hPad,
                                pad.bottom + 80,
                              ),
                              gridDelegate:
                                  const SliverGridDelegateWithFixedCrossAxisCount(
                                crossAxisCount: 3,
                                mainAxisSpacing: 10,
                                crossAxisSpacing: 10,
                                childAspectRatio: 0.85,
                              ),
                              itemCount: _emojis.length,
                              itemBuilder: (context, i) {
                                final e = _emojis[i];
                                final url = e['imageUrl']?.toString() ?? '';
                                final name = e['name']?.toString() ?? '';
                                return Container(
                                  padding: const EdgeInsets.all(8),
                                  decoration: BoxDecoration(
                                    color: _card,
                                    borderRadius: BorderRadius.circular(10),
                                  ),
                                  child: Column(
                                    children: [
                                      Expanded(
                                        child: url.isNotEmpty
                                            ? Image.network(
                                                url,
                                                fit: BoxFit.contain,
                                                errorBuilder: (_, __, ___) =>
                                                    const Icon(Icons.broken_image),
                                              )
                                            : const SizedBox.shrink(),
                                      ),
                                      const SizedBox(height: 4),
                                      Text(
                                        name,
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: const TextStyle(
                                          color: Colors.white70,
                                          fontSize: 11,
                                        ),
                                      ),
                                    ],
                                  ),
                                );
                              },
                            ),
                    ),
                  ],
                ),
    );
  }
}
