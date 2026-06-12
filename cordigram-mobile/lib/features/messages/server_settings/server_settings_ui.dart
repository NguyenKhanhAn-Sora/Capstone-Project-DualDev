import 'package:flutter/material.dart';

import '../../../core/theme/app_theme_context.dart';
import '../../../core/theme/messages_chrome_palette.dart';

/// Màu / decoration cho màn cài đặt máy chủ — dùng [MessagesChromePalette] thay màu cố định.
class ServerSettingsUi {
  ServerSettingsUi(this.chrome);

  final MessagesChromePalette chrome;

  static ServerSettingsUi of(BuildContext context) =>
      ServerSettingsUi(context.chrome);

  Color get bg => chrome.bg;
  Color get card => chrome.surface;
  Color get fieldFill => chrome.chatInput;
  Color get border => chrome.border;
  Color get text => chrome.text;
  Color get textMuted => chrome.textMuted;
  Color get accent => chrome.accent;
  Color get onAccent => chrome.onAccent;
  Color get divider => chrome.border;
  Color get destructive => const Color(0xFFFF6B7A);

  InputDecoration fieldDecoration({
    String? labelText,
    String? hintText,
    Widget? prefixIcon,
    EdgeInsetsGeometry? contentPadding,
  }) {
    return InputDecoration(
      filled: true,
      fillColor: fieldFill,
      labelText: labelText,
      hintText: hintText,
      prefixIcon: prefixIcon,
      contentPadding: contentPadding,
      labelStyle: TextStyle(color: textMuted),
      hintStyle: TextStyle(color: textMuted.withValues(alpha: 0.7)),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(color: border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(color: accent, width: 1.5),
      ),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(color: border),
      ),
    );
  }

  AppBar buildAppBar({required String title, List<Widget>? actions}) {
    return AppBar(
      backgroundColor: bg,
      foregroundColor: text,
      elevation: 0,
      scrolledUnderElevation: 0,
      surfaceTintColor: Colors.transparent,
      title: Text(title, style: TextStyle(fontWeight: FontWeight.w800, color: text)),
      actions: actions,
    );
  }
}
