import 'package:shared_preferences/shared_preferences.dart';

/// Mirrors web `cordigram-web/lib/messages-dm-sidebar-prefs.ts`.
enum DmSidebarPeersMode { all, online }

class DmSidebarPrefs {
  DmSidebarPrefs._();

  static const _key = 'cordigramDmSidebarPeers';

  static Future<DmSidebarPeersMode> getPeersMode() async {
    final prefs = await SharedPreferences.getInstance();
    final v = prefs.getString(_key);
    return v == 'online' ? DmSidebarPeersMode.online : DmSidebarPeersMode.all;
  }

  static Future<void> setPeersMode(DmSidebarPeersMode mode) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      _key,
      mode == DmSidebarPeersMode.online ? 'online' : 'all',
    );
  }
}
