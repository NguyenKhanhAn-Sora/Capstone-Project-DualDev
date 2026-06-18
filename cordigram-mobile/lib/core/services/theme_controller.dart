import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../features/messages/services/direct_messages_service.dart';
import 'auth_storage.dart';

class ThemeController extends ChangeNotifier {
  ThemeController._();

  static final ThemeController instance = ThemeController._();

  static const String _storageKey = 'app_theme_mode';
  static const String _galaxyKey = 'app_galaxy_mode';

  ThemeMode _themeMode = ThemeMode.dark;
  bool _isGalaxyMode = false;

  ThemeMode get themeMode => _themeMode;
  bool get isDarkMode => _themeMode == ThemeMode.dark;
  bool get isGalaxyMode => _isGalaxyMode;

  Future<void> load() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_storageKey);
    final galaxyOn = prefs.getBool(_galaxyKey) ?? false;

    if (galaxyOn) {
      _isGalaxyMode = true;
      _themeMode = ThemeMode.dark;
    } else if (raw == 'light') {
      _themeMode = ThemeMode.light;
    } else {
      _themeMode = ThemeMode.dark;
    }

    notifyListeners();

    try {
      final token = AuthStorage.accessToken;
      if (token != null && token.isNotEmpty) {
        final settings = await DirectMessagesService.getUserSettings();
        await applyFromServerSettings(settings, persistLocally: true);
      }
    } catch (_) {}
  }

  Future<void> applyFromServerSettings(
    Map<String, dynamic> settings, {
    bool persistLocally = false,
  }) async {
    final preset = (settings['appearancePreset'] ?? '').toString();
    final sync = settings['appearanceSync'] == true;
    final theme = (settings['theme'] ?? '').toString();

    if (preset == 'galaxy') {
      await _applyLocal(galaxy: true, mode: ThemeMode.dark, persist: persistLocally);
      return;
    }

    if (sync) {
      final brightness =
          WidgetsBinding.instance.platformDispatcher.platformBrightness;
      await _applyLocal(
        galaxy: false,
        mode: brightness == Brightness.dark ? ThemeMode.dark : ThemeMode.light,
        persist: persistLocally,
      );
      return;
    }

    if (theme == 'light') {
      await _applyLocal(galaxy: false, mode: ThemeMode.light, persist: persistLocally);
    } else if (theme == 'dark') {
      await _applyLocal(galaxy: false, mode: ThemeMode.dark, persist: persistLocally);
    }
  }

  Future<void> _applyLocal({
    required bool galaxy,
    required ThemeMode mode,
    required bool persist,
  }) async {
    final changed = _isGalaxyMode != galaxy || _themeMode != mode;
    if (!changed) return;
    _isGalaxyMode = galaxy;
    _themeMode = mode;
    notifyListeners();
    if (!persist) return;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_galaxyKey, galaxy);
    await prefs.setString(
      _storageKey,
      mode == ThemeMode.light ? 'light' : 'dark',
    );
  }

  Future<void> setThemeMode(ThemeMode mode) async {
    if (_themeMode == mode && !_isGalaxyMode) return;

    _themeMode = mode;
    _isGalaxyMode = false;
    notifyListeners();

    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      _storageKey,
      mode == ThemeMode.light ? 'light' : 'dark',
    );
    await prefs.setBool(_galaxyKey, false);

    try {
      final token = AuthStorage.accessToken;
      if (token != null && token.isNotEmpty) {
        await DirectMessagesService.updateUserSettings(
          theme: mode == ThemeMode.light ? 'light' : 'dark',
          appearancePreset: 'default',
          appearanceSync: false,
        );
      }
    } catch (_) {}
  }

  Future<void> toggle() async {
    await setThemeMode(isDarkMode ? ThemeMode.light : ThemeMode.dark);
  }

  Future<void> setGalaxyMode(bool enabled) async {
    if (_isGalaxyMode == enabled) return;

    _isGalaxyMode = enabled;
    if (enabled) _themeMode = ThemeMode.dark;
    notifyListeners();

    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_galaxyKey, enabled);

    try {
      final token = AuthStorage.accessToken;
      if (token != null && token.isNotEmpty) {
        await DirectMessagesService.updateUserSettings(
          theme: 'dark',
          appearancePreset: enabled ? 'galaxy' : 'default',
          appearanceSync: false,
        );
      }
    } catch (_) {}
  }

  Future<void> toggleGalaxy() async {
    await setGalaxyMode(!_isGalaxyMode);
  }
}
