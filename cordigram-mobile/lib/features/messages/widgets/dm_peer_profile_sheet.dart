import 'package:flutter/material.dart';

import '../../profile/profile_screen.dart';
import '../services/direct_messages_service.dart';
import '../utils/messages_i18n.dart';
import '../utils/messages_ui.dart';
import '../utils/profile_theme.dart';
import 'messages_chrome_builder.dart';

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

  void _openSocialProfile() {
    Navigator.of(context).pop();
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => ProfileScreen(userId: widget.userId),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return MessagesChromeBuilder(
      builder: (context, chrome) {
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
        final themePrimary = ProfileTheme.parseHex(
          _profile?['profileThemePrimaryHex']?.toString(),
          ProfileTheme.defaultPrimary,
        );
        final themeAccent = ProfileTheme.parseHex(
          _profile?['profileThemeAccentHex']?.toString(),
          ProfileTheme.defaultAccent,
        );
        final themeText = ProfileTheme.textOnBackground(themePrimary);
        final themeTextMuted = ProfileTheme.textMutedOnBackground(themePrimary);
        final letter = displayName.isNotEmpty
            ? displayName.substring(0, 1).toUpperCase()
            : 'U';

        return Container(
          decoration: ProfileTheme.cardDecoration(
            primary: themePrimary,
            accent: themeAccent,
          ).copyWith(
            borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
          ),
          child: SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
              child: _loading
                  ? SizedBox(
                      height: 160,
                      child: Center(
                        child: CircularProgressIndicator(color: chrome.accent),
                      ),
                    )
                  : Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        CircleAvatar(
                          radius: 42,
                          backgroundColor: chrome.surfaceMuted,
                          backgroundImage: (avatar != null && avatar.isNotEmpty)
                              ? NetworkImage(avatar)
                              : null,
                          child: (avatar == null || avatar.isEmpty)
                              ? Text(
                                  letter,
                                  style: TextStyle(
                                    color: chrome.text,
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
                            color: themeText,
                            fontSize: 18,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        if (username.isNotEmpty)
                          Text(
                            '@$username',
                            style: TextStyle(
                              color: themeTextMuted,
                              fontSize: 13,
                            ),
                          ),
                        if (bio.isNotEmpty) ...[
                          const SizedBox(height: 12),
                          Text(
                            bio,
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              color: themeTextMuted,
                              fontSize: 14,
                            ),
                          ),
                        ],
                        const SizedBox(height: 16),
                        _metaTile(
                          themePrimary,
                          themeAccent,
                          themeText,
                          themeTextMuted,
                          MessagesI18n.mutualServersLabel(),
                          mutualCount is num ? '${mutualCount.toInt()}' : '0',
                        ),
                        if (memberSince.isNotEmpty)
                          _metaTile(
                            themePrimary,
                            themeAccent,
                            themeText,
                            themeTextMuted,
                            MessagesI18n.memberSinceLabel(),
                            memberSince,
                          ),
                        const SizedBox(height: 16),
                        SizedBox(
                          width: double.infinity,
                          child: OutlinedButton(
                            onPressed: _openSocialProfile,
                            style: OutlinedButton.styleFrom(
                              foregroundColor: themeText,
                              side: BorderSide(
                                color: themeAccent.withValues(alpha: 0.45),
                              ),
                            ),
                            child: Text(MessagesI18n.viewSocialProfileLabel()),
                          ),
                        ),
                      ],
                    ),
            ),
          ),
        );
      },
    );
  }

  Widget _metaTile(
    Color themePrimary,
    Color themeAccent,
    Color themeText,
    Color themeTextMuted,
    String label,
    String value,
  ) {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: ProfileTheme.surfaceOnBackground(themePrimary),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
          color: themeAccent.withValues(alpha: 0.25),
        ),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: TextStyle(color: themeTextMuted, fontSize: 12),
            ),
          ),
          Text(
            value,
            style: TextStyle(
              color: themeText,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}
