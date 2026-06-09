import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../services/messages_shell_theme_controller.dart';

/// Bảng màu Messages — port từ `applyAccentColor` trên web.
@immutable
class MessagesChromePalette {
  const MessagesChromePalette({
    required this.baseHex,
    required this.accent,
    required this.accentHover,
    required this.accentSoft,
    required this.bg,
    required this.surface,
    required this.surfaceMuted,
    required this.border,
    required this.text,
    required this.textMuted,
    required this.panelSidebar,
    required this.panelHover,
    required this.panelContext,
    required this.chatInput,
    required this.chatReceived,
    required this.onAccent,
  });

  static const String defaultHex = '#5865F2';

  final String baseHex;
  final Color accent;
  final Color accentHover;
  final Color accentSoft;
  final Color bg;
  final Color surface;
  final Color surfaceMuted;
  final Color border;
  final Color text;
  final Color textMuted;
  final Color panelSidebar;
  final Color panelHover;
  final Color panelContext;
  final Color chatInput;
  final Color chatReceived;
  final Color onAccent;

  static final MessagesChromePalette fallback =
      MessagesChromePalette.fromHex(defaultHex);

  /// Token galaxy — port `[data-appearance="galaxy"]` + `#cordigram-messages-root[data-messages-theme="galaxy"]`.
  static final MessagesChromePalette galaxy = MessagesChromePalette(
    baseHex: defaultHex,
    accent: const Color(0xFF5865F2),
    accentHover: const Color(0xFF4752C4),
    accentSoft: const Color(0x2E5865F2),
    bg: Colors.transparent,
    surface: const Color(0xC70C1220),
    surfaceMuted: const Color(0xD110182A),
    border: const Color(0xBF1F2A3D),
    text: const Color(0xFFE5E7EF),
    textMuted: const Color(0xFF98A3C7),
    panelSidebar: const Color(0xE02B2D31),
    panelHover: const Color(0xD935373C),
    panelContext: const Color(0xEB111214),
    chatInput: const Color(0xE0101828),
    chatReceived: const Color(0xD1182236),
    onAccent: Colors.white,
  );

  static String normalizeHex(String color) {
    final raw = color.trim();
    if (RegExp(r'^#[0-9A-Fa-f]{6}$').hasMatch(raw)) {
      return raw.toUpperCase();
    }
    return defaultHex;
  }

  static Color? hexToColor(String hex) {
    final clean = normalizeHex(hex).replaceFirst('#', '');
    final v = int.tryParse('FF$clean', radix: 16);
    return v == null ? null : Color(v);
  }

  factory MessagesChromePalette.fromHex(
    String color, {
    MessagesShellTheme? shellTheme,
  }) {
    final base = normalizeHex(color);
    final baseColor = hexToColor(base) ?? const Color(0xFF5865F2);

    final luminance = _getLuminance(baseColor);
    final isLightTone = luminance > 0.56;
    final veryLightSurface = isLightTone && luminance > 0.82;

    final accentUi = _clampAccentForUi(baseColor);
    final hover = _darken(accentUi, 10);
    final soft = accentUi.withValues(alpha: isLightTone ? 0.2 : 0.18);

    final bg = isLightTone ? _lighten(baseColor, 84) : _darken(baseColor, 80);
    final surface =
        isLightTone ? _lighten(baseColor, 91) : _darken(baseColor, 74);
    final surfaceMuted = veryLightSurface
        ? _darken(surface, 10)
        : isLightTone
        ? _lighten(baseColor, 87)
        : _darken(baseColor, 70);
    final border = isLightTone ? _darken(bg, 10) : _lighten(bg, 12);
    var text = isLightTone ? _darken(baseColor, 78) : const Color(0xFFF8FAFC);
    var textMuted =
        isLightTone ? _darken(baseColor, 48) : _lighten(baseColor, 38);

    // Web: shell sáng → chữ tối cố định (dù accent tối).
    if (shellTheme == MessagesShellTheme.galaxy) {
      return MessagesChromePalette.galaxy;
    }
    if (shellTheme == MessagesShellTheme.light) {
      text = const Color(0xFF0F1629);
      textMuted = const Color(0xFF5B6378);
    } else if (_getLuminance(surface) > 0.55) {
      // Màu chủ đề sáng trên shell tối — nền panel sáng, cần chữ tối.
      text = const Color(0xFF0F1629);
      textMuted = const Color(0xFF5B6378);
    }

    final panelSidebar =
        isLightTone ? _lighten(baseColor, 86) : _darken(baseColor, 76);
    final panelHover = veryLightSurface
        ? _darken(panelSidebar, 14)
        : isLightTone
        ? _darken(surface, 6)
        : _lighten(surface, 5);
    final panelContext = isLightTone ? _lighten(baseColor, 94) : _darken(bg, 10);
    final chatReceived =
        isLightTone ? _darken(surface, 3) : _lighten(surface, 2);
    final chatInput = isLightTone ? _darken(surface, 4) : _darken(bg, 6);
    final onAccent =
        _getLuminance(accentUi) > 0.45 ? const Color(0xFF0F1629) : Colors.white;

    return MessagesChromePalette(
      baseHex: base,
      accent: accentUi,
      accentHover: hover,
      accentSoft: soft,
      bg: bg,
      surface: surface,
      surfaceMuted: surfaceMuted,
      border: border,
      text: text,
      textMuted: textMuted,
      panelSidebar: panelSidebar,
      panelHover: panelHover,
      panelContext: panelContext,
      chatInput: chatInput,
      chatReceived: chatReceived,
      onAccent: onAccent,
    );
  }

  /// Nền/panel sáng → dùng chữ tối (parity web `useMessagesUiTone`).
  static bool isLightSurface(Color color) => _getLuminance(color) > 0.55;

  static double _getLuminance(Color color) {
    double channel(int v) {
      final c = v / 255;
      return c <= 0.03928 ? c / 12.92 : math.pow((c + 0.055) / 1.055, 2.4).toDouble();
    }

    final r = channel(color.red);
    final g = channel(color.green);
    final b = channel(color.blue);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  static Color _darken(Color color, int percent) {
    final factor = 1 - (percent.clamp(0, 100) / 100);
    return Color.fromARGB(
      color.alpha,
      (color.red * factor).round().clamp(0, 255),
      (color.green * factor).round().clamp(0, 255),
      (color.blue * factor).round().clamp(0, 255),
    );
  }

  static Color _lighten(Color color, int percent) {
    final ratio = percent.clamp(0, 100) / 100;
    int mix(int c) => (c + (255 - c) * ratio).round().clamp(0, 255);
    return Color.fromARGB(
      color.alpha,
      mix(color.red),
      mix(color.green),
      mix(color.blue),
    );
  }

  static Color _clampAccentForUi(Color color) {
    var c = color;
    var l = _getLuminance(c);
    var guard = 0;
    while (l > 0.4 && guard < 28) {
      c = _darken(c, 9);
      l = _getLuminance(c);
      guard++;
    }
    return c;
  }
}
