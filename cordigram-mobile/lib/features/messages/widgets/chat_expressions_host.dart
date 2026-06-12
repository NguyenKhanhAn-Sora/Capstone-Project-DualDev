import 'package:flutter/material.dart';

/// Cung cấp nội dung từng tab trong sheet Biểu cảm (DM / kênh).
abstract class ChatExpressionsHost {
  Widget buildUnicodeEmoji(BuildContext context, VoidCallback onBack);

  Widget buildServerEmoji(BuildContext context, VoidCallback onBack);

  Widget buildGiphy(
    BuildContext context,
    VoidCallback onBack, {
    required bool stickers,
  });

  Widget buildServerSticker(BuildContext context, VoidCallback onBack);

  void onKaomojiSelected(String text);
}
