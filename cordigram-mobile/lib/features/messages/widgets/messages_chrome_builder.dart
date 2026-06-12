import 'package:flutter/material.dart';

import '../../../core/services/accent_color_controller.dart';
import '../../../core/services/appearance_preset_controller.dart';
import '../../../core/services/language_controller.dart';
import '../../../core/services/messages_shell_theme_controller.dart';
import '../../../core/theme/app_theme_context.dart';
import '../../../core/theme/messages_chrome_palette.dart';

/// Rebuild khi chrome Messages đổi — chỉ dùng trong subtree [MessagesChromeScope].
class MessagesChromeBuilder extends StatelessWidget {
  const MessagesChromeBuilder({
    super.key,
    required this.builder,
  });

  final Widget Function(BuildContext context, MessagesChromePalette chrome)
  builder;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: Listenable.merge([
        AccentColorController.instance,
        MessagesShellThemeController.instance,
        AppearancePresetController.instance,
        LanguageController.instance,
      ]),
      builder: (context, _) => builder(context, context.chrome),
    );
  }
}
