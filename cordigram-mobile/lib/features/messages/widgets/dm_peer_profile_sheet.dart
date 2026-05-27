import 'package:flutter/material.dart';

import '../services/direct_messages_service.dart';
import '../utils/messages_i18n.dart';
import '../utils/messages_ui.dart';

/// Peer profile panel — mirrors web DM profile sidebar (`fetchMessagingProfileByUserId`).
class DmPeerProfileSheet extends StatefulWidget {
  const DmPeerProfileSheet({
    super.key,
    required this.userId,
    required this.fallbackName,
    this.fallbackAvatarUrl,
  });

  final String userId;
  final String fallbackName;
  final String? fallbackAvatarUrl;

  static Future<void> show(
    BuildContext context, {
    required String userId,
    required String fallbackName,
    String? fallbackAvatarUrl,
  }) {
    return MessagesUi.showBottomSheet<void>(
      context,
      isScrollControlled: true,
      child: DmPeerProfileSheet(
        userId: userId,
        fallbackName: fallbackName,
        fallbackAvatarUrl: fallbackAvatarUrl,
      ),
    );
  }

  @override
  State<DmPeerProfileSheet> createState() => _DmPeerProfileSheetState();
}

class _DmPeerProfileSheetState extends State<DmPeerProfileSheet> {
  bool _loading = true;
  Map<String, dynamic>? _profile;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final data = await DirectMessagesService.getMessagingProfileByUserId(
        widget.userId,
      );
      if (!mounted) return;
      setState(() {
        _profile = data;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final displayName =
        (_profile?['displayName'] ?? widget.fallbackName).toString().trim();
    final username =
        (_profile?['chatUsername'] ?? _profile?['username'] ?? '').toString();
    final bio = (_profile?['bio'] ?? '').toString().trim();
    final avatar =
        (_profile?['avatarUrl'] ?? _profile?['avatar'] ?? widget.fallbackAvatarUrl)
            ?.toString();
    final memberSince = (_profile?['cordigramMemberSince'] ?? '').toString();
    final mutualCount = _profile?['mutualServerCount'];
    final letter = displayName.isNotEmpty
        ? displayName.substring(0, 1).toUpperCase()
        : 'U';

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
        child: _loading
            ? SizedBox(
                height: 160,
                child: Center(
                  child: CircularProgressIndicator(color: scheme.primary),
                ),
              )
            : Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  CircleAvatar(
                    radius: 42,
                    backgroundColor: scheme.surfaceContainerHighest,
                    backgroundImage:
                        (avatar != null && avatar.isNotEmpty)
                        ? NetworkImage(avatar)
                        : null,
                    child: (avatar == null || avatar.isEmpty)
                        ? Text(
                            letter,
                            style: TextStyle(
                              color: scheme.onSurface,
                              fontSize: 28,
                              fontWeight: FontWeight.w700,
                            ),
                          )
                        : null,
                  ),
                  const SizedBox(height: 12),
                  Text(
                    displayName,
                    style: TextStyle(
                      color: scheme.onSurface,
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  if (username.isNotEmpty)
                    Text(
                      '@$username',
                      style: TextStyle(
                        color: scheme.onSurfaceVariant,
                        fontSize: 13,
                      ),
                    ),
                  if (bio.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    Text(
                      bio,
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: scheme.onSurfaceVariant,
                        fontSize: 14,
                      ),
                    ),
                  ],
                  const SizedBox(height: 16),
                  _metaTile(
                    MessagesI18n.mutualServersLabel(),
                    mutualCount is num ? '${mutualCount.toInt()}' : '0',
                  ),
                  if (memberSince.isNotEmpty)
                    _metaTile(
                      MessagesI18n.memberSinceLabel(),
                      memberSince,
                    ),
                ],
              ),
      ),
    );
  }

  Widget _metaTile(String label, String value) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 12),
            ),
          ),
          Text(
            value,
            style: TextStyle(
              color: scheme.onSurface,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}
