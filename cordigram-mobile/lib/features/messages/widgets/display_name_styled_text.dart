import 'package:flutter/material.dart';

import '../models/display_name_style.dart';

/// Renders messaging display names with gradient / neon / font overrides.
class DisplayNameStyledText extends StatelessWidget {
  const DisplayNameStyledText({
    super.key,
    required this.text,
    required this.style,
    this.fontSize = 16,
    this.fontWeight = FontWeight.w800,
    this.maxLines,
    this.overflow,
    this.fallbackColor,
  });

  final String text;
  final DisplayNameStyle style;
  final double fontSize;
  final FontWeight fontWeight;
  final int? maxLines;
  final TextOverflow? overflow;
  final Color? fallbackColor;

  @override
  Widget build(BuildContext context) {
    final base = TextStyle(
      fontSize: fontSize,
      fontWeight: fontWeight,
      height: 1.1,
      fontFamily: style.fontFamily,
    );

    if (!style.hasOverride) {
      return Text(
        text,
        maxLines: maxLines,
        overflow: overflow,
        style: base.copyWith(color: fallbackColor ?? style.primaryColor),
      );
    }

    if (style.effectId == 'gradient') {
      return ShaderMask(
        blendMode: BlendMode.srcIn,
        shaderCallback: (bounds) => LinearGradient(
          begin: Alignment.bottomCenter,
          end: Alignment.topCenter,
          colors: [style.primaryColor, style.accentColor],
        ).createShader(bounds),
        child: Text(
          text,
          maxLines: maxLines,
          overflow: overflow,
          style: base.copyWith(color: Colors.white),
        ),
      );
    }

    if (style.effectId == 'neon') {
      return Text(
        text,
        maxLines: maxLines,
        overflow: overflow,
        style: base.copyWith(
          color: style.primaryColor,
          shadows: [
            Shadow(color: style.accentColor, blurRadius: 10),
            Shadow(color: style.accentColor, blurRadius: 18),
          ],
        ),
      );
    }

    return Text(
      text,
      maxLines: maxLines,
      overflow: overflow,
      style: base.copyWith(color: style.primaryColor),
    );
  }
}
