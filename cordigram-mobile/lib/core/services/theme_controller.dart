import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

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
  }

  Future<void> toggleGalaxy() async {
    await setGalaxyMode(!_isGalaxyMode);
  }
}
