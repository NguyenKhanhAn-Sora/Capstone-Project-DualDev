import 'package:flutter/material.dart';

const dmConversationCategoryKeys = [
  'customer',
  'family',
  'work',
  'friends',
  'reply_later',
  'colleague',
];

const dmCategoryColors = <String, Color>{
  'customer': Color(0xFFED4245),
  'family': Color(0xFFEB459E),
  'work': Color(0xFFFAA61A),
  'friends': Color(0xFFFEE75C),
  'reply_later': Color(0xFF57F287),
  'colleague': Color(0xFF5865F2),
};

Color? dmCategoryColor(String? category) {
  if (category == null || category.isEmpty) return null;
  return dmCategoryColors[category];
}

Widget dmCategoryMark(
  String? category, {
  double size = 14,
}) {
  final color = dmCategoryColor(category);
  if (color == null) return const SizedBox.shrink();
  return Icon(
    Icons.sell_rounded,
    size: size,
    color: color,
  );
}
