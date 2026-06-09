import 'package:flutter/material.dart';

import '../../../core/theme/messages_chrome_palette.dart';

/// Thanh nhập tin Messenger-style: [+] · ô nhập rộng · biểu cảm · mic/gửi.
class ChatComposerBar extends StatelessWidget {
  const ChatComposerBar({
    super.key,
    required this.chrome,
    required this.controller,
    required this.focusNode,
    required this.hintText,
    required this.onAttach,
    required this.onExpressions,
    required this.onVoice,
    required this.onSend,
    this.enabled = true,
    this.replyBanner,
    this.sending = false,
  });

  final MessagesChromePalette chrome;
  final TextEditingController controller;
  final FocusNode focusNode;
  final String hintText;
  final VoidCallback onAttach;
  final VoidCallback onExpressions;
  final VoidCallback onVoice;
  final VoidCallback onSend;
  final bool enabled;
  final Widget? replyBanner;
  final bool sending;

  static const double _iconSlot = 40;

  @override
  Widget build(BuildContext context) {
    final bottomSafe = MediaQuery.viewInsetsOf(context).bottom > 0
        ? 0.0
        : MediaQuery.paddingOf(context).bottom;

    return Material(
      color: chrome.bg,
      child: Padding(
        padding: EdgeInsets.only(bottom: bottomSafe),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (replyBanner != null) replyBanner!,
            Padding(
              padding: const EdgeInsets.fromLTRB(6, 6, 6, 8),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  _iconBtn(
                    icon: Icons.add_rounded,
                    size: 26,
                    onPressed: enabled ? onAttach : null,
                  ),
                  Expanded(
                    child: Container(
                      constraints: const BoxConstraints(minHeight: 44),
                      decoration: BoxDecoration(
                        color: chrome.surfaceMuted,
                        borderRadius: BorderRadius.circular(22),
                      ),
                      child: TextField(
                        controller: controller,
                        focusNode: focusNode,
                        enabled: enabled,
                        minLines: 1,
                        maxLines: 6,
                        textInputAction: TextInputAction.send,
                        onSubmitted: enabled ? (_) => onSend() : null,
                        style: TextStyle(color: chrome.text, fontSize: 15),
                        decoration: InputDecoration(
                          isDense: true,
                          contentPadding: const EdgeInsets.symmetric(
                            horizontal: 14,
                            vertical: 11,
                          ),
                          hintText: hintText,
                          hintStyle: TextStyle(
                            color: chrome.textMuted,
                            fontSize: 15,
                          ),
                          border: InputBorder.none,
                        ),
                      ),
                    ),
                  ),
                  _iconBtn(
                    icon: Icons.mood_rounded,
                    size: 24,
                    onPressed: enabled ? onExpressions : null,
                  ),
                  ListenableBuilder(
                    listenable: controller,
                    builder: (context, _) {
                      final hasText = controller.text.trim().isNotEmpty;
                      if (hasText) {
                        return _sendBtn();
                      }
                      return _iconBtn(
                        icon: Icons.mic_none_rounded,
                        size: 24,
                        onPressed: enabled ? onVoice : null,
                      );
                    },
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _iconBtn({
    required IconData icon,
    required double size,
    VoidCallback? onPressed,
  }) {
    return SizedBox(
      width: _iconSlot,
      height: 44,
      child: IconButton(
        padding: EdgeInsets.zero,
        onPressed: onPressed,
        icon: Icon(icon, size: size, color: chrome.textMuted),
      ),
    );
  }

  Widget _sendBtn() {
    return SizedBox(
      width: _iconSlot,
      height: 44,
      child: Padding(
        padding: const EdgeInsets.only(bottom: 2),
        child: Material(
          color: chrome.accent,
          shape: const CircleBorder(),
          child: InkWell(
            customBorder: const CircleBorder(),
            onTap: (!enabled || sending) ? null : onSend,
            child: Padding(
              padding: const EdgeInsets.all(8),
              child: sending
                  ? SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: chrome.onAccent,
                      ),
                    )
                  : Icon(
                      Icons.send_rounded,
                      size: 20,
                      color: chrome.onAccent,
                    ),
            ),
          ),
        ),
      ),
    );
  }
}
