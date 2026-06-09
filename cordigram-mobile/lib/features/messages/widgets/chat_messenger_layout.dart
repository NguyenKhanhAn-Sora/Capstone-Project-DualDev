import 'package:flutter/material.dart';

/// Layout chat kiểu Messenger: danh sách co giãn + composer cố định đáy (trên keyboard).
class ChatMessengerLayout extends StatefulWidget {
  const ChatMessengerLayout({
    super.key,
    this.appBar,
    required this.messageArea,
    required this.composer,
    this.onKeyboardVisible,
    this.backgroundColor,
  });

  final PreferredSizeWidget? appBar;
  final Widget messageArea;
  final Widget composer;
  final VoidCallback? onKeyboardVisible;
  final Color? backgroundColor;

  @override
  State<ChatMessengerLayout> createState() => _ChatMessengerLayoutState();
}

class _ChatMessengerLayoutState extends State<ChatMessengerLayout>
    with WidgetsBindingObserver {
  double _lastKeyboardInset = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeMetrics() {
    if (!mounted) return;
    final inset = MediaQuery.viewInsetsOf(context).bottom;
    final opening = inset > 0 && _lastKeyboardInset == 0;
    final closing = inset == 0 && _lastKeyboardInset > 0;
    _lastKeyboardInset = inset;
    if (opening || closing) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        widget.onKeyboardVisible?.call();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      resizeToAvoidBottomInset: true,
      backgroundColor: widget.backgroundColor,
      appBar: widget.appBar,
      body: SafeArea(
        top: false,
        bottom: false,
        child: Column(
          children: [
            Expanded(child: widget.messageArea),
            widget.composer,
          ],
        ),
      ),
    );
  }
}
