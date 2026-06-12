import 'package:flutter/material.dart';

import '../theme/app_radii.dart';
import '../theme/app_spacing.dart';

enum AppButtonVariant { primary, secondary, outline, ghost }

/// Nút đồng bộ — chiều cao tối thiểu 48px, bo góc và trạng thái nhấn rõ.
class AppButton extends StatelessWidget {
  const AppButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.variant = AppButtonVariant.primary,
    this.icon,
    this.loading = false,
    this.expand = true,
  });

  final String label;
  final VoidCallback? onPressed;
  final AppButtonVariant variant;
  final Widget? icon;
  final bool loading;
  final bool expand;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final enabled = onPressed != null && !loading;
    final child = loading
        ? SizedBox(
            width: 22,
            height: 22,
            child: CircularProgressIndicator(
              strokeWidth: 2.5,
              valueColor: AlwaysStoppedAnimation(
                variant == AppButtonVariant.primary
                    ? scheme.onPrimary
                    : scheme.primary,
              ),
            ),
          )
        : (icon != null
            ? Row(
                mainAxisSize: MainAxisSize.min,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  icon!,
                  const SizedBox(width: AppSpacing.sm),
                  Text(label),
                ],
              )
            : Text(label));

    final minSize = Size(
      expand ? double.infinity : 0,
      AppSpacing.minTouchTarget,
    );

    final shape = RoundedRectangleBorder(borderRadius: AppRadii.lgAll);

    switch (variant) {
      case AppButtonVariant.primary:
        return FilledButton(
          onPressed: enabled ? onPressed : null,
          style: FilledButton.styleFrom(
            minimumSize: minSize,
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xl),
            shape: shape,
            textStyle: const TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w700,
            ),
          ),
          child: child,
        );
      case AppButtonVariant.secondary:
        return FilledButton.tonal(
          onPressed: enabled ? onPressed : null,
          style: FilledButton.styleFrom(
            minimumSize: minSize,
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xl),
            shape: shape,
            textStyle: const TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w600,
            ),
          ),
          child: child,
        );
      case AppButtonVariant.outline:
        return OutlinedButton(
          onPressed: enabled ? onPressed : null,
          style: OutlinedButton.styleFrom(
            minimumSize: minSize,
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xl),
            shape: shape,
            textStyle: const TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w600,
            ),
          ),
          child: child,
        );
      case AppButtonVariant.ghost:
        return TextButton(
          onPressed: enabled ? onPressed : null,
          style: TextButton.styleFrom(
            minimumSize: minSize,
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
            shape: shape,
            textStyle: const TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w600,
            ),
          ),
          child: child,
        );
    }
  }
}
