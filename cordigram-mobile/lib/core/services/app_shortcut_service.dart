import 'package:flutter/material.dart';
import 'package:quick_actions/quick_actions.dart';

import '../services/auth_storage.dart';
import '../../features/messages/message_home_screen.dart';
import '../../features/notifications/notification_screen.dart';

class AppShortcutService {
  AppShortcutService._();

  static const String _notificationType = 'shortcut_notification';
  static const String _messageType = 'shortcut_message';

  static const QuickActions _quickActions = QuickActions();
  static GlobalKey<NavigatorState>? _navigatorKey;
  static String? _pendingType;
  static bool _initialized = false;

  static void initialize({
    required GlobalKey<NavigatorState> navigatorKey,
    required String language,
  }) {
    _navigatorKey = navigatorKey;

    if (!_initialized) {
      _initialized = true;
      _quickActions.initialize((shortcutType) {
        _pendingType = shortcutType;
        _scheduleDrain();
      });
    }

    _setShortcuts(language);
  }

  static Future<void> updateLanguage(String language) async {
    if (!_initialized) return;
    await _setShortcuts(language);
  }

  static Future<void> _setShortcuts(String language) async {
    final (notifLabel, msgLabel) = _getLabels(language);
    await _quickActions.setShortcutItems([
      ShortcutItem(
        type: _notificationType,
        localizedTitle: notifLabel,
        icon: 'ic_shortcut_notification',
      ),
      ShortcutItem(
        type: _messageType,
        localizedTitle: msgLabel,
        icon: 'ic_shortcut_message',
      ),
    ]);
  }

  static void _scheduleDrain() {
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      await Future<void>.delayed(const Duration(milliseconds: 300));
      _drain();
    });
  }

  static void _drain() {
    final type = _pendingType;
    if (type == null) return;

    final navigator = _navigatorKey?.currentState;
    if (navigator == null) {
      _scheduleDrain();
      return;
    }

    _pendingType = null;
    _navigate(navigator, type);
  }

  static void _navigate(NavigatorState navigator, String type) {
    if (AuthStorage.accessToken == null) return;

    if (type == _notificationType) {
      navigator.push(
        MaterialPageRoute<void>(builder: (_) => const NotificationScreen()),
      );
    } else if (type == _messageType) {
      navigator.push(
        MaterialPageRoute<void>(builder: (_) => const MessageHomeScreen()),
      );
    }
  }

  static (String, String) _getLabels(String lang) {
    return switch (lang) {
      'vi' => ('Thông báo', 'Tin nhắn'),
      'ja' => ('通知', 'メッセージ'),
      'zh' => ('通知', '消息'),
      _ => ('Notifications', 'Messages'),
    };
  }
}
