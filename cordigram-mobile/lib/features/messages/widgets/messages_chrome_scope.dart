import 'package:flutter/material.dart';

import '../../../core/config/app_theme.dart';
import '../../../core/services/accent_color_controller.dart';
import '../../../core/services/appearance_preset_controller.dart';
import '../../../core/services/language_controller.dart';
import '../../../core/services/messages_shell_theme_controller.dart';
import '../../../core/theme/messages_chrome_palette.dart';
import 'messages_galaxy_background.dart';

/// Theme Messages — chỉ subtree này; không đổi Social (feed, profile, …).
class MessagesChromeScope extends StatelessWidget {
  const MessagesChromeScope({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: Listenable.merge([
        AccentColorController.instance,
        MessagesShellThemeController.instance,
        AppearancePresetController.instance,
        LanguageController.instance,
      ]),
      builder: (context, _) {
        final palette = AccentColorController.instance.effectivePalette;
        // Material brightness theo nền thực tế — palette đã có text tương phản.
        final brightness = MessagesChromePalette.isLightSurface(palette.bg)
            ? Brightness.light
            : Brightness.dark;
        final theme = AppTheme.fromPalette(palette, brightness: brightness);
        final showGalaxy =
            MessagesShellThemeController.instance.theme ==
                MessagesShellTheme.galaxy &&
            AccentColorController.instance.isFollowingSocialAppearance;
        return Stack(
          fit: StackFit.expand,
          children: [
            if (showGalaxy) const MessagesGalaxyBackground(),
            Theme(
              data: theme,
              child: DefaultTextStyle(
                style: TextStyle(color: palette.text, fontSize: 14),
                child: IconTheme(
                  data: IconThemeData(color: palette.textMuted),
                  child: child,
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}
