import 'package:flutter/material.dart';

import '../config/app_theme.dart';
import 'messages_chrome_palette.dart';

extension AppThemeContext on BuildContext {
  AppSemanticColors get semantic =>
      Theme.of(this).extension<AppSemanticColors>() ??
      (Theme.of(this).brightness == Brightness.dark
          ? AppSemanticColors.dark
          : AppSemanticColors.light);

  MessagesChromePalette get chrome =>
      Theme.of(this).extension<MessagesChromeTheme>()?.palette ??
      MessagesChromePalette.fallback;

  Color get appBg => Theme.of(this).scaffoldBackgroundColor;
  Color get appText => semantic.text;
  Color get appTextMuted => semantic.textMuted;
  Color get appAccent => semantic.primary;
  Color get appOnAccent => Theme.of(this).colorScheme.onPrimary;
}
