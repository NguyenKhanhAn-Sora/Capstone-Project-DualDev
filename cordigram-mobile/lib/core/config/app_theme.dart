import 'package:flutter/material.dart';

@immutable
class AppSemanticColors extends ThemeExtension<AppSemanticColors> {
  const AppSemanticColors({
    required this.panel,
    required this.panelMuted,
    required this.panelBorder,
    required this.text,
    required this.textMuted,
    required this.primary,
    required this.primarySoft,
    required this.chatBubble,
    required this.chatBubbleText,
  });

  final Color panel;
  final Color panelMuted;
  final Color panelBorder;
  final Color text;
  final Color textMuted;
  final Color primary;
  final Color primarySoft;
  final Color chatBubble;
  final Color chatBubbleText;

  static const AppSemanticColors dark = AppSemanticColors(
    panel: Color(0xFF0F1829),
    panelMuted: Color(0xFF131F33),
    panelBorder: Color(0xFF1E2D48),
    text: Color(0xFFE8ECF8),
    textMuted: Color(0xFF7A8BB0),
    primary: Color(0xFF559AC2),
    primarySoft: Color(0xFFA8D7FF),
    chatBubble: Color(0xFF2A313D),
    chatBubbleText: Color(0xFFFFFFFF),
  );

  static const AppSemanticColors light = AppSemanticColors(
    panel: Color(0xFFFFFFFF),
    panelMuted: Color(0xFFF5F7FB),
    panelBorder: Color(0xFFE3EAF5),
    text: Color(0xFF0F1629),
    textMuted: Color(0xFF5B6378),
    primary: Color(0xFF4AA3E4),
    primarySoft: Color(0xFFD9ECFF),
    chatBubble: Color(0xFFE5E5EA),
    chatBubbleText: Color(0xFF000000),
  );

  @override
  AppSemanticColors copyWith({
    Color? panel,
    Color? panelMuted,
    Color? panelBorder,
    Color? text,
    Color? textMuted,
    Color? primary,
    Color? primarySoft,
    Color? chatBubble,
    Color? chatBubbleText,
  }) {
    return AppSemanticColors(
      panel: panel ?? this.panel,
      panelMuted: panelMuted ?? this.panelMuted,
      panelBorder: panelBorder ?? this.panelBorder,
      text: text ?? this.text,
      textMuted: textMuted ?? this.textMuted,
      primary: primary ?? this.primary,
      primarySoft: primarySoft ?? this.primarySoft,
      chatBubble: chatBubble ?? this.chatBubble,
      chatBubbleText: chatBubbleText ?? this.chatBubbleText,
    );
  }

  @override
  AppSemanticColors lerp(ThemeExtension<AppSemanticColors>? other, double t) {
    if (other is! AppSemanticColors) {
      return this;
    }

    return AppSemanticColors(
      panel: Color.lerp(panel, other.panel, t) ?? panel,
      panelMuted: Color.lerp(panelMuted, other.panelMuted, t) ?? panelMuted,
      panelBorder: Color.lerp(panelBorder, other.panelBorder, t) ?? panelBorder,
      text: Color.lerp(text, other.text, t) ?? text,
      textMuted: Color.lerp(textMuted, other.textMuted, t) ?? textMuted,
      primary: Color.lerp(primary, other.primary, t) ?? primary,
      primarySoft: Color.lerp(primarySoft, other.primarySoft, t) ?? primarySoft,
      chatBubble: Color.lerp(chatBubble, other.chatBubble, t) ?? chatBubble,
      chatBubbleText:
          Color.lerp(chatBubbleText, other.chatBubbleText, t) ?? chatBubbleText,
    );
  }
}

class AppTheme {
  static const Color _seed = Color(0xFF3470A2);

  static ThemeData get dark {
    final scheme = const ColorScheme.dark(
      primary: Color(0xFF4AA3E4),
      onPrimary: Color(0xFF0B1020),
      secondary: Color(0xFF6CB7EE),
      onSecondary: Color(0xFF0B1020),
      surface: Color(0xFF131F33),
      onSurface: Color(0xFFE8ECF8),
      onSurfaceVariant: Color(0xFF7A8BB0),
      outline: Color(0xFF1E2D48),
      error: Color(0xFFE53935),
      onError: Colors.white,
    );

    return _baseTheme(scheme).copyWith(
      scaffoldBackgroundColor: const Color(0xFF0F1829),
      appBarTheme: const AppBarTheme(
        backgroundColor: Color(0xFF0F1829),
        foregroundColor: Color(0xFFE8ECF8),
      ),
      cardColor: const Color(0xFF131F33),
      dividerColor: const Color(0xFF1E2D48),
      extensions: const <ThemeExtension<dynamic>>[AppSemanticColors.dark],
    );
  }

  static ThemeData get light {
    final scheme =
        ColorScheme.fromSeed(
          seedColor: _seed,
          brightness: Brightness.light,
        ).copyWith(
          primary: const Color(0xFF2C6AA0),
          onPrimary: Colors.white,
          secondary: const Color(0xFF4A89BE),
          onSecondary: Colors.white,
          surface: const Color(0xFFFFFFFF),
          onSurface: const Color(0xFF102033),
          onSurfaceVariant: const Color(0xFF526174),
          outline: const Color(0xFFD3DEEA),
          error: const Color(0xFFB3261E),
          onError: Colors.white,
        );

    return _baseTheme(scheme).copyWith(
      scaffoldBackgroundColor: const Color(0xFFF3F7FC),
      appBarTheme: const AppBarTheme(
        backgroundColor: Color(0xFFF3F7FC),
        foregroundColor: Color(0xFF102033),
      ),
      cardColor: Colors.white,
      dividerColor: const Color(0xFFD3DEEA),
      extensions: const <ThemeExtension<dynamic>>[AppSemanticColors.light],
    );
  }

  static ThemeData _baseTheme(ColorScheme scheme) {
    return ThemeData(
      colorScheme: scheme,
      useMaterial3: true,
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          padding: EdgeInsets.zero,
          minimumSize: Size.zero,
          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
        ),
      ),
      listTileTheme: const ListTileThemeData(
        contentPadding: EdgeInsets.zero,
        minLeadingWidth: 0,
        minVerticalPadding: 0,
      ),
    );
  }
}
