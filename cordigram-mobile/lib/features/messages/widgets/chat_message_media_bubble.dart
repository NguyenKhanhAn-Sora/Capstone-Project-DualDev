import 'package:flutter/material.dart';

import '../utils/chat_media_resolver.dart';
import 'chat_message_image.dart';

/// Renders image grid or video thumb for a chat message (DM + channel).
class ChatMessageMediaBubble extends StatelessWidget {
  const ChatMessageMediaBubble({
    super.key,
    required this.imageUrls,
    this.videoUrl,
    this.onTapImage,
    this.onTapVideo,
  });

  final List<String> imageUrls;
  final String? videoUrl;
  final void Function(String url)? onTapImage;
  final VoidCallback? onTapVideo;

  static ChatMessageMediaBubble? fromContent({
    required String content,
    required List<String> attachments,
    void Function(String url)? onTapImage,
    VoidCallback? onTapVideo,
  }) {
    final resolved = ChatMediaResolver.resolveContentText(
      content: content,
      attachments: attachments,
    );
    final images = ChatMediaResolver.extractImageUrls(resolved);
    final video = ChatMediaResolver.extractVideoUrl(resolved);

    if (images.isEmpty && video == null) {
      // Legacy: attachment-only without prefix in content field.
      if (attachments.isNotEmpty) {
        final att = ChatMediaResolver.toHttps(attachments.first);
        if (ChatMediaResolver.looksLikeVideoUrl(att)) {
          return ChatMessageMediaBubble(
            imageUrls: const [],
            videoUrl: att,
            onTapVideo: onTapVideo,
          );
        }
        if (ChatMediaResolver.looksLikeImageUrl(att)) {
          return ChatMessageMediaBubble(
            imageUrls: [att],
            onTapImage: onTapImage,
          );
        }
      }
      return null;
    }

    if (images.isEmpty && video != null) {
      return ChatMessageMediaBubble(
        imageUrls: const [],
        videoUrl: video,
        onTapVideo: onTapVideo,
      );
    }

    return ChatMessageMediaBubble(
      imageUrls: images,
      videoUrl: video,
      onTapImage: onTapImage,
      onTapVideo: onTapVideo,
    );
  }

  @override
  Widget build(BuildContext context) {
    if (videoUrl != null && videoUrl!.isNotEmpty) {
      return ChatMessageImage(
        url: videoUrl!,
        onTap: onTapVideo,
        showPlayOverlay: true,
      );
    }

    if (imageUrls.isEmpty) return const SizedBox.shrink();

    if (imageUrls.length == 1) {
      return ChatMessageImage(
        url: imageUrls.first,
        onTap: onTapImage == null ? null : () => onTapImage!(imageUrls.first),
      );
    }

    final cols = imageUrls.length == 2 || imageUrls.length == 4 ? 2 : 3;
    final cellW = imageUrls.length <= 2 ? 108.0 : 72.0;
    final cellH = imageUrls.length <= 2 ? 81.0 : 72.0;

    return SizedBox(
      width: cols * cellW + (cols - 1) * 3,
      child: Wrap(
        spacing: 3,
        runSpacing: 3,
        children: [
          for (var i = 0; i < imageUrls.length; i++)
            ChatMessageImage(
              url: imageUrls[i],
              width: cellW,
              height: cellH,
              borderRadius: 6,
              onTap: onTapImage == null
                  ? null
                  : () => onTapImage!(imageUrls[i]),
            ),
        ],
      ),
    );
  }
}
