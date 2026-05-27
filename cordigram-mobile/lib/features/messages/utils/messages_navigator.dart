import 'package:flutter/material.dart';

import '../messages_shell.dart';

/// Mở Messages từ Social (feed) — một scope chrome cho cả phiên Messages.
Route<T> messagesEntryRoute<T>(Widget child) {
  return MaterialPageRoute<T>(builder: (_) => child);
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
