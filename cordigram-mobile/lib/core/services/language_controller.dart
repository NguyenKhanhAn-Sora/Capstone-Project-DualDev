import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'auth_storage.dart';
import 'api_service.dart';

class LanguageController extends ChangeNotifier {
  LanguageController._();

  static final LanguageController instance = LanguageController._();

  static const String _storageKey = 'cordigram-language';
  static const List<String> supported = ['vi', 'en', 'ja', 'zh'];

  static const Map<String, String> _localeNames = {
    'vi': 'vi-VN',
    'en': 'en-US',
    'ja': 'ja-JP',
    'zh': 'zh-CN',
  };

  String _lang = 'vi';
  Map<String, dynamic> _dict = {};
  Map<String, dynamic> _fallbackDict = {};

  String get language => _lang;

  String get localeName => _localeNames[_lang] ?? 'vi-VN';

  Future<void> load() async {
    final prefs = await SharedPreferences.getInstance();
    final cached = prefs.getString(_storageKey);
    final code = supported.contains(cached) ? cached! : 'vi';
    await _apply(code, saveToPrefs: false);

    // Sync from API in background
    try {
      final token = AuthStorage.accessToken;
      if (token != null) {
        final res = await ApiService.get(
          '/users/settings',
          extraHeaders: {'Authorization': 'Bearer $token'},
        );
        final serverLang = (res['language'] ?? '').toString().toLowerCase();
        if (supported.contains(serverLang) && serverLang != _lang) {
          await prefs.setString(_storageKey, serverLang);
          await _apply(serverLang, saveToPrefs: false);
        }
      }
    } catch (_) {}
  }

  Future<void> setLanguage(String code) async {
    if (!supported.contains(code) || code == _lang) return;
    await _apply(code, saveToPrefs: true);
    try {
      final token = AuthStorage.accessToken;
      if (token != null) {
        await ApiService.patch(
          '/users/settings',
          body: {'language': code},
          extraHeaders: {'Authorization': 'Bearer $token'},
        );
      }
    } catch (_) {}
  }

  Future<void> _apply(String code, {required bool saveToPrefs}) async {
    final raw = await rootBundle.loadString('assets/locales/$code.json');
    _dict = json.decode(raw) as Map<String, dynamic>;

    if (code != 'vi' && _fallbackDict.isEmpty) {
      final fallbackRaw = await rootBundle.loadString('assets/locales/vi.json');
      _fallbackDict = json.decode(fallbackRaw) as Map<String, dynamic>;
    } else if (code == 'vi') {
      _fallbackDict = _dict;
    }

    _lang = code;
    if (saveToPrefs) {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_storageKey, code);
    }
    notifyListeners();
  }

  String t(String key, [Map<String, dynamic>? vars]) {
    dynamic val = _getByPath(_dict, key);
    if (val == null && _fallbackDict.isNotEmpty) {
      val = _getByPath(_fallbackDict, key);
    }
    if (val is! String) return key;
    if (vars == null) return val;
    return vars.entries.fold<String>(
      val,
      (s, e) => s.replaceAll('{${e.key}}', '${e.value}'),
    );
  }

  dynamic _getByPath(Map<String, dynamic> map, String path) {
    final parts = path.split('.');
    dynamic current = map;
    for (final part in parts) {
      if (current is Map<String, dynamic>) {
        current = current[part];
      } else {
        return null;
      }
    }
    return current;
  }
}
