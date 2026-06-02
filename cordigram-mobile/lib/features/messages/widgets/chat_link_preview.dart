import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../models/dm_message.dart' show DmLinkPreview;

/// Renders a column of pre-fetched link preview cards for chat messages
/// (DM and channel). Data is fetched server-side when the message is sent.
class ChatLinkPreviewList extends StatelessWidget {
  const ChatLinkPreviewList({super.key, required this.previews});
  final List<DmLinkPreview> previews;

  @override
  Widget build(BuildContext context) {
    if (previews.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: previews
          .take(3)
          .map(
            (p) => Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: ChatLinkPreviewCard(preview: p),
            ),
          )
          .toList(),
    );
  }
}

class ChatLinkPreviewCard extends StatelessWidget {
  const ChatLinkPreviewCard({super.key, required this.preview});
  final DmLinkPreview preview;

  @override
  Widget build(BuildContext context) {
    final href = (preview.canonicalUrl?.trim().isNotEmpty == true
            ? preview.canonicalUrl
            : preview.url)
        ?.trim() ??
        '';
    if (href.isEmpty) return const SizedBox.shrink();

    final title = preview.title?.trim().isNotEmpty == true
        ? preview.title!
        : (preview.siteName?.trim().isNotEmpty == true
            ? preview.siteName!
            : preview.domain ?? '');
    final domain = preview.domain ??
        (() {
          try {
            return Uri.parse(href).host;
          } catch (_) {
            return '';
          }
        }());

    return GestureDetector(
      onTap: () async {
        final uri = Uri.tryParse(href);
        if (uri != null && await canLaunchUrl(uri)) {
          await launchUrl(uri, mode: LaunchMode.externalApplication);
        }
      },
      child: Container(
        constraints: const BoxConstraints(maxWidth: 320),
        decoration: BoxDecoration(
          color: const Color(0xFF1A2035),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: const Color(0xFF2D3A55), width: 1),
        ),
        clipBehavior: Clip.hardEdge,
        child: IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              SizedBox(
                width: 72,
                child: preview.image?.isNotEmpty == true
                    ? Image.network(
                        preview.image!,
                        width: 72,
                        fit: BoxFit.cover,
                        errorBuilder: (_, __, ___) =>
                            _FaviconFallback(favicon: preview.favicon),
                      )
                    : _FaviconFallback(favicon: preview.favicon),
              ),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 8,
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      if (title.isNotEmpty)
                        Text(
                          title,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: Color(0xFFE5E7EB),
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                            height: 1.2,
                          ),
                        ),
                      if (preview.description?.isNotEmpty == true) ...[
                        const SizedBox(height: 2),
                        Text(
                          preview.description!,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: Color(0xFF94A3B8),
                            fontSize: 11,
                            height: 1.3,
                          ),
                        ),
                      ],
                      if (domain.isNotEmpty) ...[
                        const SizedBox(height: 3),
                        Text(
                          domain,
                          style: const TextStyle(
                            color: Color(0xFF3D63DD),
                            fontSize: 11,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _FaviconFallback extends StatelessWidget {
  const _FaviconFallback({this.favicon});
  final String? favicon;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 72,
      color: const Color(0xFF111827),
      child: Center(
        child: favicon?.isNotEmpty == true
            ? Image.network(
                favicon!,
                width: 24,
                height: 24,
                fit: BoxFit.contain,
                errorBuilder: (_, __, ___) => const Icon(
                  Icons.link,
                  color: Color(0xFF4B5563),
                  size: 20,
                ),
              )
            : const Icon(
                Icons.link,
                color: Color(0xFF4B5563),
                size: 20,
              ),
      ),
    );
  }
}
