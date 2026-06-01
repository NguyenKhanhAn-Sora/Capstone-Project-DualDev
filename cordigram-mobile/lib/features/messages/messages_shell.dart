import 'package:flutter/material.dart';

import 'message_home_screen.dart';
import 'models/message_thread.dart';
import 'widgets/messages_chrome_scope.dart';

/// Cổng vào Messages từ Social — một [MessagesChromeScope] bọc toàn bộ stack
/// (giống `#cordigram-messages-root` trên web). Mọi push bên trong kế thừa theme + ngôn ngữ.
class MessagesShell extends StatelessWidget {
  const MessagesShell({super.key, this.initialThread});

  /// Nếu được cung cấp, sẽ tự động mở chat với thread này sau khi vào màn hình.
  final MessageThread? initialThread;

  static final GlobalKey<NavigatorState> navigatorKey =
      GlobalKey<NavigatorState>();

  @override
  Widget build(BuildContext context) {
    return MessagesChromeScope(
      child: Navigator(
        key: navigatorKey,
        initialRoute: '/',
        onGenerateRoute: (settings) {
          return MaterialPageRoute<void>(
            settings: settings,
            builder: (_) => MessageHomeScreen(initialThread: initialThread),
          );
        },
      ),
    );
  }
}
