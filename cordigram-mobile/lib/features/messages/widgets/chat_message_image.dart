import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../services/messages_media_service.dart';

/// Cached chat bubble image with Cloudinary thumb transforms.
class ChatMessageImage extends StatelessWidget {
  const ChatMessageImage({
    super.key,
    required this.url,
    this.width = 220,
    this.height = 160,
    this.borderRadius = 8,
    this.onTap,
    this.showPlayOverlay = false,
  });

  final String url;
  final double width;
  final double height;
  final double borderRadius;
  final VoidCallback? onTap;
  final bool showPlayOverlay;

  @override
  Widget build(BuildContext context) {
    final displayUrl = MessagesMediaService.optimizeChatImageUrl(url);
    final dpr = MediaQuery.devicePixelRatioOf(context);
    final memW = (width * dpr).round().clamp(1, 2048);
    final memH = (height * dpr).round().clamp(1, 2048);

    Widget image = ClipRRect(
      borderRadius: BorderRadius.circular(borderRadius),
      child: CachedNetworkImage(
        imageUrl: displayUrl,
        width: width,
        height: height,
        fit: BoxFit.cover,
        memCacheWidth: memW,
        memCacheHeight: memH,
        fadeInDuration: const Duration(milliseconds: 150),
        placeholder: (_, __) => Container(
          width: width,
          height: height,
          color: const Color(0xFF1A2340),
          child: const Center(
            child: SizedBox(
              width: 22,
              height: 22,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                color: Colors.white38,
              ),
            ),
          ),
        ),
        errorWidget: (_, __, ___) => Container(
          width: width,
          height: height,
          color: const Color(0xFF1A2340),
          child: const Icon(
            Icons.broken_image_rounded,
            color: Colors.white54,
          ),
        ),
      ),
    );

    if (showPlayOverlay) {
      image = Stack(
        children: [
          image,
          Positioned.fill(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(borderRadius),
              child: Container(
                color: Colors.black26,
                child: const Center(
                  child: Icon(
                    Icons.play_circle_fill_rounded,
                    color: Colors.white,
                    size: 44,
                  ),
                ),
              ),
            ),
          ),
        ],
      );
    }

    if (onTap == null) return image;
    return GestureDetector(onTap: onTap, child: image);
  }
}
