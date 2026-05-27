import 'package:flutter/material.dart';

import '../storage/messages_appearance_storage.dart';
import '../theme/messages_chrome_palette.dart';
import '../../features/messages/services/direct_messages_service.dart';
import 'messages_shell_theme_controller.dart';

export '../storage/messages_appearance_storage.dart' show MessagesAppearanceStorage;

/// Màu chrome Messages — cục bộ theo user (giống web), **không** đổi Social.
class AccentColorController extends ChangeNotifier {
  AccentColorController._();

  static final AccentColorController instance = AccentColorController._();

  /// Preset nền Messages (không có `default` trên UI — giống web).
  static const Map<String, String> presetHex = {
    'default': MessagesChromePalette.defaultHex,
    'graphite': '#3A3D49',
    'charcoal': '#24262E',
    'indigo': '#111827',
  };

  static const List<Map<String, dynamic>> accentOptions = [
    {'id': 'blurple', 'color': Color(0xFF5865F2), 'label': 'Blurple'},
    {'id': 'green', 'color': Color(0xFF57F287), 'label': 'Green'},
    {'id': 'yellow', 'color': Color(0xFFFEE75C), 'label': 'Yellow'},
    {'id': 'pink', 'color': Color(0xFFEB459E), 'label': 'Pink'},
    {'id': 'red', 'color': Color(0xFFED4245), 'label': 'Red'},
    {'id': 'orange', 'color': Color(0xFFF59E0B), 'label': 'Orange'},
    {'id': 'cyan', 'color': Color(0xFF22D3EE), 'label': 'Cyan'},
    {'id': 'violet', 'color': Color(0xFF8B5CF6), 'label': 'Violet'},
    {'id': 'neon-green', 'color': Color(0xFF39FF14), 'label': 'Neon Green'},
    {'id': 'neon-pink', 'color': Color(0xFFFF2BD6), 'label': 'Neon Pink'},
    {'id': 'neon-blue', 'color': Color(0xFF00E5FF), 'label': 'Neon Blue'},
    {
      'id': 'gradient1',
      'color': Color(0xFF7C3AED),
      'secondary': Color(0xFF22D3EE),
      'label': 'Gradient 1',
    },
    {
      'id': 'gradient2',
      'color': Color(0xFF2563EB),
      'secondary': Color(0xFFEC4899),
      'label': 'Gradient 2',
    },
    {
      'id': 'gradient3',
      'color': Color(0xFFF97316),
      'secondary': Color(0xFFEF4444),
      'label': 'Gradient 3',
    },
  ];

  String? _userId;
  String _chromeHex = MessagesChromePalette.defaultHex;
  String _source = 'background';
  String _preset = 'indigo';
  MessagesChromePalette _palette = MessagesChromePalette.fallback;

  String get chromeHex => _chromeHex;
  String get source => _source;
  String get preset => _preset;
  MessagesChromePalette get palette => _palette;

  /// Palette đã áp dụng theo shell + nguồn (port `resolveMessagesChromeApplyHex`).
  MessagesChromePalette get effectivePalette {
    final shell = MessagesShellThemeController.instance.theme;
    final hex = resolveApplyHex(shell);
    if (hex == null) {
      return MessagesChromePalette.fromHex(
        MessagesAppearanceStorage.defaultChromeHex,
        shellTheme: shell,
      );
    }
    return MessagesChromePalette.fromHex(hex, shellTheme: shell);
  }

  /// @deprecated — dùng [effectivePalette].
  Color get effectiveColor => effectivePalette.bg;

  String? get boundUserId => _userId;

  Future<void> load() async {
    await MessagesShellThemeController.instance.load();
    await bindUser(DirectMessagesService.currentUserId);
  }

  Future<void> bindUser(String? userId) async {
    _userId = userId?.trim();
    if (_userId == null || _userId!.isEmpty) {
      _rebuildPalette();
      notifyListeners();
      return;
    }
    await MessagesAppearanceStorage.migrateOnce(_userId!);
    _chromeHex = await MessagesAppearanceStorage.readChromeHex(_userId!);
    _source = await MessagesAppearanceStorage.readAppearanceSource(_userId!);
    _preset = _presetIdFromHex(_chromeHex);
    _rebuildPalette();
    notifyListeners();
  }

  /// Nếu mất Boost → về nền (giống web MessagesUserSettingsModal).
  Future<void> enforceBoostPolicy({required bool boostUnlocked}) async {
    if (boostUnlocked || _source != 'accent') return;
    await _setSource('background');
    if (_userId != null && _userId!.isNotEmpty) {
      await MessagesAppearanceStorage.persistAppearanceSource(_userId!, 'background');
    }
    notifyListeners();
  }

  /// Chọn preset nền — local only, không PATCH `appearancePreset` Social.
  Future<void> setPreset(String preset) async {
    if (!presetHex.containsKey(preset)) return;
    _preset = preset;
    _chromeHex = presetHex[preset] ?? MessagesChromePalette.defaultHex;
    await _setSource('background');
    await MessagesShellThemeController.instance.commitDark();
    await _persistChrome();
  }

  /// Màu chủ đề Boost — local only.
  Future<void> setAccentHex(String hex) async {
    _chromeHex = MessagesChromePalette.normalizeHex(hex);
    await _setSource('accent');
    await MessagesShellThemeController.instance.commitDark();
    await _persistChrome();
  }

  /// Port `resolveMessagesChromeApplyHex`.
  String? resolveApplyHex(MessagesShellTheme shell) {
    if (_source == 'accent') {
      return _chromeHex;
    }
    if (shell == MessagesShellTheme.light) {
      return null;
    }
    return _chromeHex;
  }

  String _presetIdFromHex(String hex) {
    final n = MessagesChromePalette.normalizeHex(hex);
    for (final e in presetHex.entries) {
      if (e.key == 'default') continue;
      if (MessagesChromePalette.normalizeHex(e.value) == n) {
        return e.key;
      }
    }
    return 'indigo';
  }

  Future<void> _setSource(String source) async {
    _source = source == 'accent' ? 'accent' : 'background';
    if (_userId != null && _userId!.isNotEmpty) {
      await MessagesAppearanceStorage.persistAppearanceSource(_userId!, _source);
    }
  }

  Future<void> _persistChrome() async {
    _rebuildPalette();
    notifyListeners();
    if (_userId != null && _userId!.isNotEmpty) {
      await MessagesAppearanceStorage.persistChromeHex(_userId!, _chromeHex);
    }
  }

  void _rebuildPalette() {
    _palette = effectivePalette;
  }

  static String hexFromColor(Color c) {
    return '#${c.toARGB32().toRadixString(16).toUpperCase().substring(2)}';
  }
}
