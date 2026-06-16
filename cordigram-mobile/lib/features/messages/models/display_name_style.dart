import 'package:flutter/material.dart';

const _defaultSolidPrimary = '#f2f3f5';
const _defaultAccent = '#5865f2';

class DisplayNameStyle {
  const DisplayNameStyle({
    this.fontId = 'default',
    this.effectId = 'solid',
    this.primaryHex = _defaultSolidPrimary,
    this.accentHex = _defaultAccent,
  });

  final String fontId;
  final String effectId;
  final String primaryHex;
  final String accentHex;

  static const demo = DisplayNameStyle(
    fontId: 'rounded',
    effectId: 'gradient',
    primaryHex: '#57f287',
    accentHex: '#5865f2',
  );

  factory DisplayNameStyle.fromProfile(Map<String, dynamic> json) {
    return DisplayNameStyle(
      fontId: (json['displayNameFontId'] ?? 'default').toString(),
      effectId: (json['displayNameEffectId'] ?? 'solid').toString(),
      primaryHex: (json['displayNamePrimaryHex'] ?? '#f2f3f5').toString(),
      accentHex: (json['displayNameAccentHex'] ?? '#5865f2').toString(),
    );
  }

  Map<String, dynamic> toPayload() => {
    'displayNameFontId': fontId,
    'displayNameEffectId': effectId,
    'displayNamePrimaryHex': primaryHex,
    'displayNameAccentHex': accentHex,
  };

  DisplayNameStyle copyWith({
    String? fontId,
    String? effectId,
    String? primaryHex,
    String? accentHex,
  }) {
    return DisplayNameStyle(
      fontId: fontId ?? this.fontId,
      effectId: effectId ?? this.effectId,
      primaryHex: primaryHex ?? this.primaryHex,
      accentHex: accentHex ?? this.accentHex,
    );
  }

  bool get hasOverride {
    if (fontId == 'mono' || fontId == 'rounded') return true;
    if (effectId == 'gradient' || effectId == 'neon') return true;
    final p = clampHex(primaryHex);
    final a = clampHex(accentHex);
    if (p != null && p != _defaultSolidPrimary) return true;
    if (a != null && a != _defaultAccent) return true;
    return false;
  }

  String? get fontFamily => switch (fontId) {
    'mono' => 'monospace',
    'rounded' => 'Roboto',
    _ => null,
  };

  Color get primaryColor => colorFromHex(primaryHex, fallback: const Color(0xFFF2F3F5));

  Color get accentColor => colorFromHex(accentHex, fallback: const Color(0xFF5865F2));

  TextStyle textStyle({double fontSize = 16, FontWeight weight = FontWeight.w800}) {
    return TextStyle(
      fontSize: fontSize,
      fontWeight: weight,
      fontFamily: fontFamily,
      color: primaryColor,
    );
  }

  static String? clampHex(String v) {
    final s = v.trim();
    if (RegExp(r'^#[0-9a-fA-F]{6}$').hasMatch(s)) return s.toLowerCase();
    return null;
  }

  static Color colorFromHex(String hex, {required Color fallback}) {
    final clamped = clampHex(hex);
    if (clamped == null) return fallback;
    final h = clamped.replaceFirst('#', '');
    return Color(int.parse('FF$h', radix: 16));
  }
}
