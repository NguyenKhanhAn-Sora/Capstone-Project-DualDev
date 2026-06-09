import 'package:flutter/material.dart';

import '../services/giphy_search_service.dart';

/// Renders GIF/sticker from Giphy id — mirrors web `GiphyMessage`.
class DmGiphyMessage extends StatefulWidget {
  const DmGiphyMessage({
    super.key,
    required this.giphyId,
    this.maxWidth = 220,
    this.maxHeight = 180,
  });

  final String giphyId;
  final double maxWidth;
  final double maxHeight;

  @override
  State<DmGiphyMessage> createState() => _DmGiphyMessageState();
}

class _DmGiphyMessageState extends State<DmGiphyMessage> {
  String? _url;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didUpdateWidget(covariant DmGiphyMessage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.giphyId != widget.giphyId) _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _url = null;
    });
    final item = await GiphySearchService.getById(widget.giphyId);
    if (!mounted) return;
    setState(() {
      _url = item?.previewUrl;
      _loading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return SizedBox(
        width: widget.maxWidth,
        height: 80,
        child: const Center(
          child: SizedBox(
            width: 22,
            height: 22,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
        ),
      );
    }
    final url = _url ??
        (widget.giphyId.isNotEmpty
            ? 'https://media.giphy.com/media/${widget.giphyId}/giphy.gif'
            : '');
    if (url.isEmpty) {
      return const Text('👋', style: TextStyle(fontSize: 48));
    }
    return ClipRRect(
      borderRadius: BorderRadius.circular(8),
      child: Image.network(
        url,
        width: widget.maxWidth,
        height: widget.maxHeight,
        fit: BoxFit.cover,
        errorBuilder: (_, __, ___) =>
            const Text('GIF', style: TextStyle(color: Colors.white)),
      ),
    );
  }
}
