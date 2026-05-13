import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

/// Sticker composer icon — same paths as cordigram-web messages composer sticker button.
class StickerToolbarIcon extends StatelessWidget {
  const StickerToolbarIcon({super.key, this.size = 20, this.color});

  final double size;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final c = color ?? const Color(0xFFB6C2DC);
    return SvgPicture.asset(
      'assets/images/sticker_toolbar.svg',
      width: size,
      height: size,
      fit: BoxFit.contain,
      theme: SvgTheme(currentColor: c),
    );
  }
}
