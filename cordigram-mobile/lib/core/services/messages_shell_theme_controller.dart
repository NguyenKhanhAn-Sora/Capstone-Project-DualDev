import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'theme_controller.dart';

/// Port `cordigram-web/lib/messages-shell-theme.ts` — shell Messages tách Social.
enum MessagesShellTheme { light, dark }

class MessagesShellThemeController extends ChangeNotifier {
  MessagesShellThemeController._();

  static final MessagesShellThemeController instance =
      MessagesShellThemeController._();

  static const String _storageKey = 'cordigram:messages-shell-theme';
  static const String _migrateDropLightKey =
      'cordigram:messages-shell-no-light-preset-v1';

  MessagesShellTheme? _override;

  MessagesShellTheme get theme {
    final o = _override;
    if (o != null) return o;
    return ThemeController.instance.isDarkMode
        ? MessagesShellTheme.dark
        : MessagesShellTheme.light;
  }

  bool get hasOverride => _override != null;

  Future<void> load() async {
    final prefs = await SharedPreferences.getInstance();
    if (prefs.getString(_migrateDropLightKey) == null) {
      await prefs.setString(_migrateDropLightKey, '1');
      if (prefs.getString(_storageKey) == 'light') {
        await prefs.setString(_storageKey, 'dark');
      }
    }
    final raw = prefs.getString(_storageKey);
    if (raw == 'light') {
      _override = MessagesShellTheme.light;
    } else if (raw == 'dark') {
      _override = MessagesShellTheme.dark;
    } else {
      _override = null;
    }
    notifyListeners();
  }

  /// Chọn nền Messages → tách khỏi Social (web `commitMessagesShellTheme("dark")`).
  Future<void> commitDark() async {
    await _setOverride(MessagesShellTheme.dark);
  }

  Future<void> clearOverride() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_storageKey);
    _override = null;
    notifyListeners();
  }

  Future<void> _setOverride(MessagesShellTheme mode) async {
    _override = mode;
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      _storageKey,
      mode == MessagesShellTheme.light ? 'light' : 'dark',
    );
  }
}
