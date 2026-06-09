import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Đọc preset giao diện Social (cùng key web `ui-appearance-preset`).
/// Chỉ đọc — Messages dùng để follow galaxy; không ghi để tránh ảnh hưởng Social.
class AppearancePresetController extends ChangeNotifier {
  AppearancePresetController._();

  static final AppearancePresetController instance =
      AppearancePresetController._();

  static const String storageKey = 'ui-appearance-preset';

  String _preset = 'default';

  String get preset => _preset;
  bool get isGalaxy => _preset == 'galaxy';

  Future<void> load() async {
    final prefs = await SharedPreferences.getInstance();
    _preset = prefs.getString(storageKey) ?? 'default';
    notifyListeners();
  }

  Future<void> reload() => load();
}
