import 'package:flutter/material.dart';

import '../theme/app_radii.dart';
import '../theme/app_spacing.dart';

/// Card nền surface — dùng cho form, danh sách, panel.
class AppSurfaceCard extends StatelessWidget {
  const AppSurfaceCard({
    super.key,
    required this.child,
    this.padding,
    this.margin,
  });

  final Widget child;
  final EdgeInsetsGeometry? padding;
  final EdgeInsetsGeometry? margin;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      width: double.infinity,
      margin: margin,
      padding: padding ?? const EdgeInsets.all(AppSpacing.xl),
      decoration: BoxDecoration(
        color: scheme.surface,
        borderRadius: AppRadii.xlAll,
        border: Border.all(
          color: scheme.outline.withValues(alpha: 0.55),
        ),
      ),
      child: child,
    );
  }
}
