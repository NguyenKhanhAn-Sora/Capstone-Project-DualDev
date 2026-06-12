import 'package:flutter/material.dart';

import '../models/channel_message.dart';
import '../models/dm_message.dart';
import '../services/messages_media_service.dart';
import '../utils/chat_media_resolver.dart';

/// Media item for full-screen chat gallery (DM + channel).
class ChatMediaItem {
  const ChatMediaItem({required this.url, required this.isVideo});
  final String url;
  final bool isVideo;
}

String normalizeChatMediaUrl(String url) =>
    url.startsWith('http://') ? 'https://${url.substring(7)}' : url;

List<ChatMediaItem> collectDmMedia(List<DmMessage> messages) {
  final items = <ChatMediaItem>[];
  final seen = <String>{};
  for (final m in messages) {
    final resolved = ChatMediaResolver.resolveContentText(
      content: m.content,
      attachments: m.attachments,
    );
    for (final raw in ChatMediaResolver.extractImageUrls(resolved)) {
      final url = normalizeChatMediaUrl(raw);
      if (url.isNotEmpty && seen.add(url)) {
        items.add(ChatMediaItem(url: url, isVideo: false));
      }
    }
    final video = ChatMediaResolver.extractVideoUrl(resolved);
    if (video != null) {
      final url = MessagesMediaService.optimizeHeavyVideoUrl(
        normalizeChatMediaUrl(video),
      );
      if (seen.add(url)) {
        items.add(ChatMediaItem(url: url, isVideo: true));
      }
    }
  }
  return items;
}

List<ChatMediaItem> collectChannelMedia(List<ChannelMessage> messages) {
  final items = <ChatMediaItem>[];
  final seen = <String>{};
  for (final m in messages) {
    final resolved = ChatMediaResolver.resolveContentText(
      content: m.content,
      attachments: m.attachments,
    );
    for (final raw in ChatMediaResolver.extractImageUrls(resolved)) {
      final url = normalizeChatMediaUrl(raw);
      if (url.isNotEmpty && seen.add(url)) {
        items.add(ChatMediaItem(url: url, isVideo: false));
      }
    }
    final video = ChatMediaResolver.extractVideoUrl(resolved);
    if (video != null) {
      final url = MessagesMediaService.optimizeHeavyVideoUrl(
        normalizeChatMediaUrl(video),
      );
      if (seen.add(url)) {
        items.add(ChatMediaItem(url: url, isVideo: true));
      }
    }
  }
  return items;
}

int indexOfChatMedia(List<ChatMediaItem> items, String url) {
  final normalized = normalizeChatMediaUrl(url);
  for (var i = 0; i < items.length; i++) {
    if (items[i].url == normalized) return i;
  }
  return 0;
}

void openChatMediaViewer(
  BuildContext context, {
  required List<ChatMediaItem> items,
  required int initialIndex,
}) {
  if (items.isEmpty) return;
  Navigator.of(context).push(
    PageRouteBuilder<void>(
      opaque: false,
      pageBuilder: (_, __, ___) => ChatMediaViewerScreen(
        items: items,
        initialIndex: initialIndex.clamp(0, items.length - 1),
      ),
      transitionsBuilder: (_, animation, __, child) => FadeTransition(
        opacity: animation,
        child: child,
      ),
    ),
  );
}

class ChatMediaViewerScreen extends StatefulWidget {
  const ChatMediaViewerScreen({
    super.key,
    required this.items,
    required this.initialIndex,
  });

  final List<ChatMediaItem> items;
  final int initialIndex;

  @override
  State<ChatMediaViewerScreen> createState() => _ChatMediaViewerScreenState();
}

class _ChatMediaViewerScreenState extends State<ChatMediaViewerScreen> {
  late final PageController _pageController;
  late int _currentIndex;
  bool _uiVisible = true;

  @override
  void initState() {
    super.initState();
    _currentIndex = widget.initialIndex;
    _pageController = PageController(initialPage: widget.initialIndex);
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  void _toggleUi() => setState(() => _uiVisible = !_uiVisible);

  @override
  Widget build(BuildContext context) {
    final item = widget.items[_currentIndex];
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          PageView.builder(
            controller: _pageController,
            itemCount: widget.items.length,
            onPageChanged: (i) => setState(() => _currentIndex = i),
            itemBuilder: (ctx, i) {
              final m = widget.items[i];
              return GestureDetector(
                onTap: _toggleUi,
                child: InteractiveViewer(
                  minScale: 0.5,
                  maxScale: 6.0,
                  child: Center(
                    child: m.isVideo
                        ? const _VideoThumbCard()
                        : Image.network(
                            MessagesMediaService.optimizeChatImageFullUrl(m.url),
                            fit: BoxFit.contain,
                            filterQuality: FilterQuality.medium,
                            loadingBuilder: (_, child, progress) {
                              if (progress == null) return child;
                              return const Center(
                                child: CircularProgressIndicator(
                                  color: Colors.white54,
                                ),
                              );
                            },
                            errorBuilder: (_, __, ___) => const Icon(
                              Icons.broken_image_rounded,
                              color: Colors.white38,
                              size: 64,
                            ),
                          ),
                  ),
                ),
              );
            },
          ),
          if (_uiVisible)
            Positioned(
              top: 0,
              left: 0,
              right: 0,
              child: Container(
                decoration: const BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [Colors.black87, Colors.transparent],
                  ),
                ),
                child: SafeArea(
                  bottom: false,
                  child: Row(
                    children: [
                      IconButton(
                        icon: const Icon(Icons.close, color: Colors.white),
                        onPressed: () => Navigator.of(context).pop(),
                      ),
                      const Spacer(),
                      Text(
                        '${_currentIndex + 1} / ${widget.items.length}',
                        style: const TextStyle(
                          color: Colors.white70,
                          fontSize: 14,
                        ),
                      ),
                      const SizedBox(width: 16),
                    ],
                  ),
                ),
              ),
            ),
          if (_uiVisible && widget.items.length > 1) ...[
            if (_currentIndex > 0)
              Positioned(
                left: 8,
                top: 0,
                bottom: 0,
                child: Center(
                  child: _NavArrow(
                    icon: Icons.chevron_left_rounded,
                    onTap: () => _pageController.previousPage(
                      duration: const Duration(milliseconds: 250),
                      curve: Curves.easeInOut,
                    ),
                  ),
                ),
              ),
            if (_currentIndex < widget.items.length - 1)
              Positioned(
                right: 8,
                top: 0,
                bottom: 0,
                child: Center(
                  child: _NavArrow(
                    icon: Icons.chevron_right_rounded,
                    onTap: () => _pageController.nextPage(
                      duration: const Duration(milliseconds: 250),
                      curve: Curves.easeInOut,
                    ),
                  ),
                ),
              ),
          ],
          if (_uiVisible)
            Positioned(
              bottom: 0,
              left: 0,
              right: 0,
              child: Container(
                decoration: const BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.bottomCenter,
                    end: Alignment.topCenter,
                    colors: [Colors.black87, Colors.transparent],
                  ),
                ),
                child: SafeArea(
                  top: false,
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 12,
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          item.isVideo
                              ? Icons.videocam_rounded
                              : Icons.photo_rounded,
                          color: Colors.white54,
                          size: 16,
                        ),
                        const SizedBox(width: 6),
                        Text(
                          item.isVideo ? 'Video' : 'Ảnh',
                          style: const TextStyle(
                            color: Colors.white54,
                            fontSize: 12,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _NavArrow extends StatelessWidget {
  const _NavArrow({required this.icon, required this.onTap});

  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 36,
        height: 36,
        decoration: const BoxDecoration(
          color: Colors.black54,
          shape: BoxShape.circle,
        ),
        child: Icon(icon, color: Colors.white, size: 22),
      ),
    );
  }
}

class _VideoThumbCard extends StatelessWidget {
  const _VideoThumbCard();

  @override
  Widget build(BuildContext context) {
    return const Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        SizedBox(
          width: 280,
          height: 200,
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: Color(0xFF1A2340),
              borderRadius: BorderRadius.all(Radius.circular(12)),
            ),
            child: Center(
              child: Icon(
                Icons.videocam_rounded,
                color: Colors.white54,
                size: 64,
              ),
            ),
          ),
        ),
        SizedBox(height: 12),
        Text(
          'Video không hỗ trợ xem trực tiếp',
          style: TextStyle(color: Colors.white70, fontSize: 12),
        ),
      ],
    );
  }
}
