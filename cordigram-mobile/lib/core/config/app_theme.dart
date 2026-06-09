import 'package:flutter/material.dart';

import '../theme/app_radii.dart';
import '../theme/app_spacing.dart';
import '../theme/messages_chrome_palette.dart';

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

  /// Token UI từ palette Messages — đồng bộ web `applyAccentColor`.
  factory AppSemanticColors.fromPalette(MessagesChromePalette p) {
    return AppSemanticColors(
      panel: p.bg,
      panelMuted: p.surface,
      panelBorder: p.border,
      text: p.text,
      textMuted: p.textMuted,
      primary: p.accent,
      primarySoft: p.accentSoft,
      chatBubble: p.chatReceived,
      chatBubbleText: p.text,
    );
  }

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

/// Palette Messages trên [ThemeData.extensions] — dùng `context.chrome`.
class MessagesChromeTheme extends ThemeExtension<MessagesChromeTheme> {
  const MessagesChromeTheme(this.palette);

  final MessagesChromePalette palette;

  @override
  MessagesChromeTheme copyWith({MessagesChromePalette? palette}) {
    return MessagesChromeTheme(palette ?? this.palette);
  }

  @override
  MessagesChromeTheme lerp(ThemeExtension<MessagesChromeTheme>? other, double t) {
    if (other is! MessagesChromeTheme) return this;
    return MessagesChromeTheme(other.palette);
  }
}

class AppTheme {
  static const Color _seed = Color(0xFF3470A2);

  /// Theme toàn app từ màu Messages (nền + accent + chữ tương phản).
  static ThemeData fromPalette(
    MessagesChromePalette palette, {
    required Brightness brightness,
  }) {
    final p = palette;
    final semantic = AppSemanticColors.fromPalette(p);

    final scheme = ColorScheme(
      brightness: brightness,
      primary: p.accent,
      onPrimary: p.onAccent,
      primaryContainer: p.accentSoft,
      onPrimaryContainer: p.text,
      secondary: p.accentHover,
      onSecondary: p.onAccent,
      surface: p.surface,
      onSurface: p.text,
      onSurfaceVariant: p.textMuted,
      surfaceContainerHighest: p.surfaceMuted,
      outline: p.border,
      outlineVariant: p.border.withValues(alpha: 0.6),
      error: const Color(0xFFE53935),
      onError: Colors.white,
    );

    final textTheme = TextTheme(
      displayLarge: TextStyle(color: p.text),
      displayMedium: TextStyle(color: p.text),
      displaySmall: TextStyle(color: p.text),
      headlineLarge: TextStyle(color: p.text),
      headlineMedium: TextStyle(color: p.text),
      headlineSmall: TextStyle(color: p.text),
      titleLarge: TextStyle(color: p.text, fontWeight: FontWeight.w700),
      titleMedium: TextStyle(color: p.text, fontWeight: FontWeight.w600),
      titleSmall: TextStyle(color: p.text, fontWeight: FontWeight.w600),
      bodyLarge: TextStyle(color: p.text),
      bodyMedium: TextStyle(color: p.text),
      bodySmall: TextStyle(color: p.textMuted),
      labelLarge: TextStyle(color: p.text),
      labelMedium: TextStyle(color: p.textMuted),
      labelSmall: TextStyle(color: p.textMuted),
    );

    return _baseTheme(scheme).copyWith(
      brightness: brightness,
      scaffoldBackgroundColor: p.bg,
      canvasColor: p.bg,
      cardColor: p.surface,
      dividerColor: p.border,
      iconTheme: IconThemeData(color: p.textMuted),
      primaryIconTheme: IconThemeData(color: p.text),
      textTheme: textTheme,
      primaryTextTheme: textTheme,
      appBarTheme: AppBarTheme(
        backgroundColor: p.bg,
        foregroundColor: p.text,
        elevation: 0,
        scrolledUnderElevation: 0,
        iconTheme: IconThemeData(color: p.text),
        titleTextStyle: TextStyle(
          color: p.text,
          fontSize: 18,
          fontWeight: FontWeight.w700,
        ),
      ),
      cardTheme: CardThemeData(
        color: p.surface,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: BorderSide(color: p.border.withValues(alpha: 0.5)),
        ),
      ),
      dividerTheme: DividerThemeData(color: p.border, thickness: 1),
      dialogTheme: DialogThemeData(
        backgroundColor: p.surface,
        surfaceTintColor: Colors.transparent,
        titleTextStyle: TextStyle(
          color: p.text,
          fontSize: 20,
          fontWeight: FontWeight.w700,
        ),
        contentTextStyle: TextStyle(color: p.textMuted, fontSize: 14),
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: p.surface,
        modalBackgroundColor: p.surface,
        surfaceTintColor: Colors.transparent,
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: p.surfaceMuted,
        contentTextStyle: TextStyle(color: p.text),
        actionTextColor: p.accent,
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: p.chatInput,
        hintStyle: TextStyle(color: p.textMuted),
        labelStyle: TextStyle(color: p.textMuted),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: p.border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: p.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: p.accent, width: 1.5),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: p.accent,
          foregroundColor: p.onAccent,
          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: p.accent,
          padding: EdgeInsets.zero,
          minimumSize: Size.zero,
          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: p.text,
          side: BorderSide(color: p.border),
          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
        ),
      ),
      floatingActionButtonTheme: FloatingActionButtonThemeData(
        backgroundColor: p.accent,
        foregroundColor: p.onAccent,
      ),
      chipTheme: ChipThemeData(
        backgroundColor: p.surfaceMuted,
        labelStyle: TextStyle(color: p.text),
        side: BorderSide(color: p.border),
      ),
      listTileTheme: const ListTileThemeData(
        contentPadding: EdgeInsets.zero,
        minLeadingWidth: 0,
        minVerticalPadding: 0,
        iconColor: null,
      ),
      bottomNavigationBarTheme: BottomNavigationBarThemeData(
        backgroundColor: p.bg,
        selectedItemColor: p.accent,
        unselectedItemColor: p.textMuted,
        type: BottomNavigationBarType.fixed,
        elevation: 0,
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: p.bg,
        indicatorColor: p.accentSoft,
        labelTextStyle: WidgetStateProperty.resolveWith((states) {
          final selected = states.contains(WidgetState.selected);
          return TextStyle(
            color: selected ? p.accent : p.textMuted,
            fontSize: 12,
          );
        }),
        iconTheme: WidgetStateProperty.resolveWith((states) {
          final selected = states.contains(WidgetState.selected);
          return IconThemeData(color: selected ? p.accent : p.textMuted);
        }),
      ),
      tabBarTheme: TabBarThemeData(
        labelColor: p.text,
        unselectedLabelColor: p.textMuted,
        indicatorColor: p.accent,
        dividerColor: p.border,
      ),
      progressIndicatorTheme: ProgressIndicatorThemeData(color: p.accent),
      switchTheme: SwitchThemeData(
        thumbColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) return p.onAccent;
          return p.textMuted;
        }),
        trackColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) return p.accent;
          return p.border;
        }),
      ),
      checkboxTheme: CheckboxThemeData(
        fillColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) return p.accent;
          return p.surfaceMuted;
        }),
        checkColor: WidgetStateProperty.all(p.onAccent),
        side: BorderSide(color: p.border),
      ),
      radioTheme: RadioThemeData(
        fillColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) return p.accent;
          return p.textMuted;
        }),
      ),
      popupMenuTheme: PopupMenuThemeData(
        color: p.surface,
        textStyle: TextStyle(color: p.text),
      ),
      drawerTheme: DrawerThemeData(backgroundColor: p.panelSidebar),
      extensions: <ThemeExtension<dynamic>>[
        semantic,
        MessagesChromeTheme(p),
      ],
    );
  }

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
    final inputShape = OutlineInputBorder(borderRadius: AppRadii.lgAll);
    final buttonShape = RoundedRectangleBorder(borderRadius: AppRadii.lgAll);

    return ThemeData(
      colorScheme: scheme,
      useMaterial3: true,
      textTheme: TextTheme(
        displaySmall: TextStyle(
          color: scheme.onSurface,
          fontWeight: FontWeight.w800,
          fontSize: 28,
          height: 1.15,
          letterSpacing: -0.4,
        ),
        headlineSmall: TextStyle(
          color: scheme.onSurface,
          fontWeight: FontWeight.w700,
          fontSize: 22,
          height: 1.2,
        ),
        titleLarge: TextStyle(
          color: scheme.onSurface,
          fontWeight: FontWeight.w700,
          fontSize: 18,
          height: 1.25,
        ),
        titleMedium: TextStyle(
          color: scheme.onSurface,
          fontWeight: FontWeight.w600,
          fontSize: 16,
          height: 1.3,
        ),
        bodyLarge: TextStyle(
          color: scheme.onSurface,
          fontSize: 16,
          height: 1.45,
        ),
        bodyMedium: TextStyle(
          color: scheme.onSurface,
          fontSize: 14,
          height: 1.45,
        ),
        bodySmall: TextStyle(
          color: scheme.onSurfaceVariant,
          fontSize: 13,
          height: 1.4,
        ),
        labelLarge: TextStyle(
          color: scheme.onSurface,
          fontWeight: FontWeight.w600,
          fontSize: 14,
        ),
        labelMedium: TextStyle(
          color: scheme.onSurfaceVariant,
          fontWeight: FontWeight.w600,
          fontSize: 12,
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: scheme.surfaceContainerHighest.withValues(alpha: 0.45),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.lg,
          vertical: AppSpacing.lg,
        ),
        border: inputShape,
        enabledBorder: inputShape.copyWith(
          borderSide: BorderSide(color: scheme.outline),
        ),
        focusedBorder: inputShape.copyWith(
          borderSide: BorderSide(color: scheme.primary, width: 1.5),
        ),
        errorBorder: inputShape.copyWith(
          borderSide: BorderSide(color: scheme.error),
        ),
        focusedErrorBorder: inputShape.copyWith(
          borderSide: BorderSide(color: scheme.error, width: 1.5),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size(64, AppSpacing.minTouchTarget),
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xl),
          shape: buttonShape,
          textStyle: const TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          minimumSize: const Size(64, AppSpacing.minTouchTarget),
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xl),
          shape: buttonShape,
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: const Size(64, AppSpacing.minTouchTarget),
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xl),
          shape: buttonShape,
          side: BorderSide(color: scheme.outline),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          minimumSize: const Size(48, AppSpacing.minTouchTarget),
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
          shape: buttonShape,
        ),
      ),
      iconButtonTheme: IconButtonThemeData(
        style: IconButton.styleFrom(
          minimumSize: const Size(AppSpacing.minTouchTarget, AppSpacing.minTouchTarget),
        ),
      ),
      floatingActionButtonTheme: FloatingActionButtonThemeData(
        shape: RoundedRectangleBorder(borderRadius: AppRadii.lgAll),
      ),
      cardTheme: CardThemeData(
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: AppRadii.mdAll,
          side: BorderSide(color: scheme.outline.withValues(alpha: 0.5)),
        ),
      ),
      listTileTheme: const ListTileThemeData(
        contentPadding: EdgeInsets.symmetric(
          horizontal: AppSpacing.lg,
          vertical: AppSpacing.sm,
        ),
        minVerticalPadding: AppSpacing.sm,
      ),
    );
  }
}
