import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

/// GIF composer icon — same paths as cordigram-web messages composer GIF button (stroke "GIF").
class GifToolbarIcon extends StatelessWidget {
  const GifToolbarIcon({super.key, this.size = 18, this.color});

  final double size;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final c = color ?? const Color(0xFFB6C2DC);
    return SvgPicture.asset(
      'assets/images/gif_toolbar.svg',
      width: size,
      height: size,
      fit: BoxFit.contain,
      theme: SvgTheme(currentColor: c),
    );
  }
}
