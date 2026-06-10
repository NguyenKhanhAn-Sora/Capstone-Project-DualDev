import 'package:flutter/material.dart';

/// Hệ thống khoảng cách đồng bộ — `redesign-uiapp.md`.
abstract final class AppSpacing {
  static const double xs = 4;
  static const double sm = 8;
  static const double md = 12;
  static const double lg = 16;
  static const double xl = 20;
  static const double xxl = 24;
  static const double xxxl = 32;
  static const double huge = 40;
  static const double touch = 48;

  /// Chiều cao tối thiểu nút / vùng chạm (accessibility).
  static const double minTouchTarget = touch;

  static EdgeInsets screenPadding(BuildContext context) {
    final w = MediaQuery.sizeOf(context).width;
    final h = w > 600 ? xxl : lg;
    return EdgeInsets.symmetric(horizontal: h);
  }

  static double contentMaxWidth(BuildContext context) {
    final w = MediaQuery.sizeOf(context).width;
    if (w >= 840) return 520;
    if (w >= 600) return 480;
    return w;
  }
}
