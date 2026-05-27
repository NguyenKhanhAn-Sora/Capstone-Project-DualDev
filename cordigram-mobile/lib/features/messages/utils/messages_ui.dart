import 'package:flutter/material.dart';

import '../../../core/theme/messages_chrome_palette.dart';

/// Helpers cho UI Messages — bottom sheet / dialog kế thừa Theme trong shell.
class MessagesUi {
  MessagesUi._();

  /// Brightness Material phù hợp nền thực tế (tránh chữ sáng trên nền sáng).
  static Brightness themeBrightnessFor(MessagesChromePalette palette) {
    return MessagesChromePalette.isLightSurface(palette.bg)
        ? Brightness.light
        : Brightness.dark;
  }

  static Future<T?> showBottomSheet<T>(
    BuildContext context, {
    required Widget child,
    bool isScrollControlled = false,
    bool useRootNavigator = false,
  }) {
    final theme = Theme.of(context);
    return showModalBottomSheet<T>(
      context: context,
      isScrollControlled: isScrollControlled,
      useRootNavigator: useRootNavigator,
      backgroundColor: theme.colorScheme.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) => Theme(
        data: theme,
        child: DefaultTextStyle.merge(
          style: TextStyle(color: theme.colorScheme.onSurface),
          child: child,
        ),
      ),
    );
  }

  static Future<T?> showThemedDialog<T>(
    BuildContext context, {
    required WidgetBuilder builder,
    bool barrierDismissible = true,
  }) {
    final theme = Theme.of(context);
    return showDialog<T>(
      context: context,
      barrierDismissible: barrierDismissible,
      builder: (ctx) => Theme(data: theme, child: builder(ctx)),
    );
  }
}
