import 'package:flutter/material.dart';

class ProfileTheme {
  ProfileTheme._();

  static const defaultPrimary = Color(0xFF111214);
  static const defaultAccent = Color(0xFF5865F2);

  static const presets = <Color>[
    Color(0xFF111214),
    Color(0xFF1E1F22),
    Color(0xFF2B2D31),
    Color(0xFF5865F2),
    Color(0xFF57F287),
    Color(0xFFEB459E),
    Color(0xFFED4245),
    Color(0xFFFEE75C),
  ];

  static Color parseHex(String? raw, Color fallback) {
    final s = (raw ?? '').trim();
    if (!RegExp(r'^#[0-9a-fA-F]{6}$').hasMatch(s)) return fallback;
    return Color(int.parse(s.substring(1), radix: 16) + 0xFF000000);
  }

  static String toHex(Color color) {
    final v = color.toARGB32() & 0xFFFFFF;
    return '#${v.toRadixString(16).padLeft(6, '0')}';
  }

  static BoxDecoration cardDecoration({Color? primary, Color? accent}) {
    final p = primary ?? defaultPrimary;
    final a = accent ?? defaultAccent;
    return BoxDecoration(
      gradient: RadialGradient(
        center: const Alignment(0, -0.85),
        radius: 1.2,
        colors: [a.withValues(alpha: 0.22), p],
      ),
      color: p,
    );
  }
}
