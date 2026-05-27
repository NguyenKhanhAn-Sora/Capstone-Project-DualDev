import 'package:shared_preferences/shared_preferences.dart';

import '../theme/messages_chrome_palette.dart';

/// Port `cordigram-web/lib/messages-appearance-chrome.ts` — lưu cục bộ theo user.
class MessagesAppearanceStorage {
  MessagesAppearanceStorage._();

  static const String defaultChromeHex = MessagesChromePalette.defaultHex;

  static const String _suffixUiChrome = 'messages-ui-chrome';
  static const String _suffixAppearanceSource = 'messages-appearance-source';
  static const String _suffixUnified = 'messages-chrome-unified-v3';

  static String _uidKey(String userId, String suffix) {
    final u = userId.trim();
    return u.isNotEmpty ? 'chat:$u:$suffix' : suffix;
  }

  static String uiChromeKey(String userId) => _uidKey(userId, _suffixUiChrome);

  static String appearanceSourceKey(String userId) =>
      _uidKey(userId, _suffixAppearanceSource);

  static String _unifiedFlagKey(String userId) => _uidKey(userId, _suffixUnified);

  static String normalizeHex(String color) =>
      MessagesChromePalette.normalizeHex(color);

  static Future<void> migrateOnce(String userId) async {
    final u = userId.trim();
    if (u.isEmpty) return;
    final prefs = await SharedPreferences.getInstance();
    if (prefs.getString(_unifiedFlagKey(u)) != null) return;

    final uiKey = uiChromeKey(u);
    var hex = prefs.getString(uiKey);

    if (hex == null || !RegExp(r'^#[0-9A-Fa-f]{6}$').hasMatch(hex)) {
      final legacyAccent = prefs.getString('messages_ui_chrome_hex');
      final legacySource = prefs.getString('messages_appearance_source');
      final legacyPreset = prefs.getString('messages_appearance_preset');
      final src = legacySource == 'accent' ? 'accent' : 'background';
      if (src == 'accent' && legacyAccent != null) {
        hex = legacyAccent;
      } else if (legacyPreset != null) {
        hex = _presetHex(legacyPreset);
      } else {
        hex = legacyAccent ?? defaultChromeHex;
      }
      if (legacySource != null) {
        await prefs.setString(appearanceSourceKey(u), src);
      }
    }

    await prefs.setString(uiKey, normalizeHex(hex!));
    await prefs.setString(_unifiedFlagKey(u), '1');
  }

  static String _presetHex(String preset) {
    const map = {
      'graphite': '#3A3D49',
      'charcoal': '#24262E',
      'indigo': '#111827',
      'default': defaultChromeHex,
    };
    return map[preset] ?? defaultChromeHex;
  }

  static Future<String> readChromeHex(String userId) async {
    final u = userId.trim();
    if (u.isEmpty) return defaultChromeHex;
    await migrateOnce(u);
    final prefs = await SharedPreferences.getInstance();
    return normalizeHex(
      prefs.getString(uiChromeKey(u)) ?? defaultChromeHex,
    );
  }

  static Future<String> readAppearanceSource(String userId) async {
    final u = userId.trim();
    if (u.isEmpty) return 'background';
    await migrateOnce(u);
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(appearanceSourceKey(u));
    return raw == 'accent' ? 'accent' : 'background';
  }

  static Future<void> persistChromeHex(String userId, String hex) async {
    final u = userId.trim();
    if (u.isEmpty) return;
    await migrateOnce(u);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(uiChromeKey(u), normalizeHex(hex));
  }

  static Future<void> persistAppearanceSource(
    String userId,
    String source,
  ) async {
    final u = userId.trim();
    if (u.isEmpty) return;
    await migrateOnce(u);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      appearanceSourceKey(u),
      source == 'accent' ? 'accent' : 'background',
    );
  }
}
