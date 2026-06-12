import 'package:flutter/material.dart';

import 'app_theme_context.dart';

/// Typography helpers — Display / Headline / Title / Body / Label.
abstract final class AppTypography {
  static TextStyle display(BuildContext context, {Color? color}) {
    final s = context.semantic;
    return Theme.of(context).textTheme.headlineMedium!.copyWith(
      color: color ?? s.text,
      fontWeight: FontWeight.w800,
      letterSpacing: -0.4,
      height: 1.15,
    );
  }

  static TextStyle headline(BuildContext context, {Color? color}) {
    final s = context.semantic;
    return Theme.of(context).textTheme.titleLarge!.copyWith(
      color: color ?? s.text,
      fontWeight: FontWeight.w700,
      height: 1.2,
    );
  }

  static TextStyle title(BuildContext context, {Color? color}) {
    final s = context.semantic;
    return Theme.of(context).textTheme.titleMedium!.copyWith(
      color: color ?? s.text,
      fontWeight: FontWeight.w600,
      height: 1.25,
    );
  }

  static TextStyle body(BuildContext context, {Color? color}) {
    final s = context.semantic;
    return Theme.of(context).textTheme.bodyMedium!.copyWith(
      color: color ?? s.text,
      fontWeight: FontWeight.w400,
      height: 1.45,
    );
  }

  static TextStyle bodyMuted(BuildContext context) {
    return body(context, color: context.semantic.textMuted);
  }

  static TextStyle label(BuildContext context, {Color? color}) {
    final s = context.semantic;
    return Theme.of(context).textTheme.labelMedium!.copyWith(
      color: color ?? s.textMuted,
      fontWeight: FontWeight.w600,
      letterSpacing: 0.2,
      height: 1.3,
    );
  }
}
