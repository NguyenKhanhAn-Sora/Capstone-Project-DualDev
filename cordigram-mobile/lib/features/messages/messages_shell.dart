import 'package:flutter/material.dart';

import 'message_home_screen.dart';
import 'widgets/messages_chrome_scope.dart';

/// Cổng vào Messages từ Social — một [MessagesChromeScope] bọc toàn bộ stack
/// (giống `#cordigram-messages-root` trên web). Mọi push bên trong kế thừa theme + ngôn ngữ.
class MessagesShell extends StatelessWidget {
  const MessagesShell({super.key});

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
            builder: (_) => const MessageHomeScreen(),
          );
        },
      ),
    );
  }
}
