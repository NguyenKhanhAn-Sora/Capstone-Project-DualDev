import 'package:flutter/material.dart';

import '../messages_shell.dart';
import '../services/voice_channel_session_controller.dart';

/// Mở Messages từ Social (feed) — một scope chrome cho cả phiên Messages.
Route<T> messagesEntryRoute<T>(Widget child) {
  return MaterialPageRoute<T>(builder: (_) => child);
}

/// Sau khi server bị xóa: rời voice (nếu đang trong server đó) và về Messages home.
Future<void> exitMessagesAfterServerDeleted(String serverId) async {
  final session = VoiceChannelSessionController.instance;
  if (session.active && session.serverId == serverId) {
    try {
      await session.leave();
    } catch (_) {}
  }
  final nav = MessagesShell.navigatorKey.currentState;
  if (nav != null) {
    nav.popUntil((route) => route.isFirst);
  }
}

/// Push màn con trong Messages — phải gọi từ context bên trong [MessagesShell].
Route<T> messagesInnerRoute<T>(
  Widget child, {
  bool fullscreenDialog = false,
}) {
  return MaterialPageRoute<T>(
    fullscreenDialog: fullscreenDialog,
    builder: (_) => child,
  );
}

extension MessagesNavigatorContext on BuildContext {
  /// Navigator lồng trong Messages (kế thừa chrome). Fallback root nếu cần.
  NavigatorState get messagesNavigator =>
      MessagesShell.navigatorKey.currentState ?? Navigator.of(this);

  Future<T?> pushMessages<T extends Object?>(
    Widget page, {
    bool fullscreenDialog = false,
  }) {
    return messagesNavigator.push<T>(
      messagesInnerRoute<T>(page, fullscreenDialog: fullscreenDialog),
    );
  }
}
