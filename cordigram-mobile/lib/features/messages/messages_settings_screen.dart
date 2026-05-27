import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/services/accent_color_controller.dart';
import '../../core/theme/messages_chrome_palette.dart';
import '../../core/services/language_controller.dart';
import '../profile/services/profile_service.dart';
import 'services/direct_messages_service.dart';
import 'services/messages_media_service.dart';
import 'utils/dm_sidebar_prefs.dart';
import 'utils/messages_navigator.dart';
import 'widgets/messages_chrome_builder.dart';
import '../../core/services/messages_shell_theme_controller.dart';

/// Cài đặt Messages — 6 mục giống web, bố cục tối ưu cho mobile.
class MessagesSettingsScreen extends StatefulWidget {
  const MessagesSettingsScreen({super.key, this.initialSection = 'general'});

  final String initialSection;

  static Future<bool> show(
    BuildContext context, {
    String initialSection = 'general',
    VoidCallback? onSaved,
  }) async {
    final saved = await context.pushMessages<bool>(
      MessagesSettingsScreen(initialSection: initialSection),
      fullscreenDialog: true,
    );
    if (saved == true) onSaved?.call();
    return saved == true;
  }

  @override
  State<MessagesSettingsScreen> createState() => _MessagesSettingsScreenState();
}

class _MessagesSettingsScreenState extends State<MessagesSettingsScreen> {
  static const Color _bg = Color(0xFF08183A);
  static const Color _cardBg = Color(0xFF0E1F45);
  static const Color _border = Color(0xFF21345D);
  static const Color _textMuted = Color(0xFF8EA3CC);
  static const Color _accent = Color(0xFFEB459E);

  /// `null` = danh sách mục; khác = màn chi tiết mục đó.
  String? _detailSection;
  bool _dirty = false;

  DmSidebarPeersMode _peersMode = DmSidebarPeersMode.all;
  bool _showMemberSince = true;
  bool _sharePresence = true;
  String _dmListFrom = 'everyone';
  String _dmCallFrom = 'everyone';
  List<Map<String, dynamic>> _blocked = [];
  bool _blockedOpen = false;
  bool _blockedLoading = false;
  bool _notifEnabled = true;
  bool _soundEnabled = true;
  String _preset = 'indigo';
  String? _accentHex;
  String _appearanceSource = 'background';
  bool _boostUnlocked = false;

  final _displayNameCtrl = TextEditingController();
  final _usernameCtrl = TextEditingController();
  final _pronounsCtrl = TextEditingController();
  final _bioCtrl = TextEditingController();

  bool _loading = true;
  bool _saving = false;
  String? _error;

  static const _sectionIds = <String>[
    'general',
    'privacy',
    'messages',
    'appearance',
    'notifications',
    'profile',
  ];

  static IconData _sectionIcon(String id) => switch (id) {
    'general' => Icons.settings_rounded,
    'privacy' => Icons.lock_rounded,
    'messages' => Icons.chat_bubble_rounded,
    'appearance' => Icons.palette_rounded,
    'notifications' => Icons.notifications_rounded,
    _ => Icons.person_rounded,
  };

  String _t(String key) => LanguageController.instance.t(key);

  String _sectionLabel(String id) =>
      _t('settings.sections.$id');

  String _sectionSubtitle(String id) => switch (id) {
    'general' => '${_t('settings.general.dmDirectoryTitle')}, ${_t('settings.general.languageTitle')}',
    'privacy' => _t('settings.privacy.title'),
    'messages' => _t('settings.messages.title'),
    'appearance' => _t('settings.appearance.title'),
    'notifications' => _t('settings.notifications.title'),
    _ => _t('settings.profile.title'),
  };

  @override
  void initState() {
    super.initState();
    _detailSection =
        widget.initialSection == 'general' ? null : widget.initialSection;
    _load();
  }

  @override
  void dispose() {
    _displayNameCtrl.dispose();
    _usernameCtrl.dispose();
    _pronounsCtrl.dispose();
    _bioCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final results = await Future.wait([
        DirectMessagesService.getUserSettings(),
        DirectMessagesService.getMyMessagingProfile(),
        DmSidebarPrefs.getPeersMode(),
      ]);
      if (!mounted) return;
      final settings = results[0] as Map<String, dynamic>;
      final profile = results[1] as Map<String, dynamic>;
      final peers = results[2] as DmSidebarPeersMode;

      _peersMode = peers;
      _showMemberSince = settings['showCordigramMemberSince'] != false;
      _sharePresence = settings['sharePresence'] != false;
      _dmListFrom = (settings['dmListFrom'] ?? 'everyone').toString();
      _dmCallFrom = (settings['dmCallFrom'] ?? 'everyone').toString();
      _notifEnabled = settings['notificationsEnabled'] != false;
      _soundEnabled = settings['chatSoundEnabled'] != false;
      await AccentColorController.instance.bindUser(
        DirectMessagesService.currentUserId,
      );
      await _refreshBoostStatus();
      await AccentColorController.instance.enforceBoostPolicy(
        boostUnlocked: _boostUnlocked,
      );
      _syncAppearanceFromController();
      _displayNameCtrl.text =
          (profile['displayName'] ?? profile['name'] ?? '').toString();
      _usernameCtrl.text =
          (profile['chatUsername'] ?? profile['username'] ?? '').toString();
      _pronounsCtrl.text = (profile['pronouns'] ?? '').toString();
      _bioCtrl.text = (profile['bio'] ?? '').toString();

      setState(() => _loading = false);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = 'Không tải được cài đặt: $e';
      });
    }
  }

  Future<void> _saveAll() async {
    setState(() => _saving = true);
    try {
      await DirectMessagesService.updateUserSettings(
        dmListFrom: _dmListFrom,
        dmCallFrom: _dmCallFrom,
        sharePresence: _sharePresence,
        chatSoundEnabled: _soundEnabled,
        showCordigramMemberSince: _showMemberSince,
      );
      await DmSidebarPrefs.setPeersMode(_peersMode);
      final dn = _displayNameCtrl.text.trim();
      final un = _usernameCtrl.text.trim();
      await DirectMessagesService.updateMyMessagingProfile({
        if (dn.isNotEmpty) 'displayName': dn,
        if (un.isNotEmpty) 'chatUsername': un,
        'bio': _bioCtrl.text.trim(),
        'pronouns': _pronounsCtrl.text.trim(),
      });
      if (!mounted) return;
      setState(() => _dirty = false);
      Navigator.of(context).pop(true);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Lưu thất bại: $e')));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _loadBlocked() async {
    setState(() {
      _blockedLoading = true;
      _blockedOpen = true;
    });
    try {
      final res = await ProfileService.fetchBlockedUsers(limit: 100);
      if (!mounted) return;
      final items = (res['items'] as List<dynamic>? ?? [])
          .whereType<Map>()
          .map((m) => Map<String, dynamic>.from(m))
          .toList();
      setState(() => _blocked = items);
    } catch (_) {
    } finally {
      if (mounted) setState(() => _blockedLoading = false);
    }
  }

  Future<void> _unblock(String userId) async {
    try {
      await ProfileService.unblockUser(userId: userId);
      setState(() => _blocked.removeWhere((b) {
        final id =
            (b['userId'] ?? b['_id'] ?? b['blockedUserId'] ?? '')
                .toString();
        return id == userId;
      }));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('$e')));
    }
  }

  void _openSection(String id) {
    setState(() => _detailSection = id);
    if (id == 'appearance') {
      unawaited(_refreshBoostStatus());
    }
  }

  void _syncAppearanceFromController() {
    final c = AccentColorController.instance;
    _preset = c.preset;
    _appearanceSource = c.source;
    _accentHex = c.source == 'accent' ? c.chromeHex : null;
  }

  Future<void> _refreshBoostStatus() async {
    await MessagesMediaService.refreshBoostStatus(force: true);
    if (!mounted) return;
    setState(() {
      _boostUnlocked = MessagesMediaService.isBoostMediaOptimizationEnabled;
    });
  }

  void _backToHub() => setState(() => _detailSection = null);

  double _horizontalPad(BuildContext context) {
    final w = MediaQuery.sizeOf(context).width;
    return w > 520 ? 24 : 14;
  }

  @override
  Widget build(BuildContext context) {
    final inHub = _detailSection == null;
    final hPad = _horizontalPad(context);

    return MessagesChromeBuilder(
      builder: (context, chrome) => PopScope(
      canPop: inHub,
      onPopInvokedWithResult: (didPop, _) {
        if (didPop) return;
        _backToHub();
      },
      child: Scaffold(
        backgroundColor: chrome.bg,
        appBar: AppBar(
          backgroundColor: chrome.bg,
          elevation: 0,
          scrolledUnderElevation: 0,
          leading: IconButton(
            icon: Icon(
              inHub ? Icons.close_rounded : Icons.arrow_back_rounded,
              color: chrome.text,
            ),
            onPressed: () {
              if (inHub) {
                Navigator.of(context).pop(false);
              } else {
                _backToHub();
              }
            },
          ),
          title: Text(
            inHub ? _t('home.menu.settings') : _sectionLabel(_detailSection!),
            style: TextStyle(
              fontSize: 17,
              fontWeight: FontWeight.w800,
              color: chrome.text,
            ),
          ),
          actions: [
            if (_saving)
              Padding(
                padding: const EdgeInsets.all(14),
                child: SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(strokeWidth: 2, color: chrome.accent),
                ),
              )
            else
              TextButton(
                onPressed: _saveAll,
                child: Text(
                  LanguageController.instance.t('common.save'),
                  style: TextStyle(
                    color: _dirty ? chrome.accent : chrome.textMuted,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
          ],
        ),
        body: _loading
            ? Center(child: CircularProgressIndicator(color: chrome.accent))
            : _error != null
            ? Center(
                child: Padding(
                  padding: EdgeInsets.all(hPad),
                  child: Text(
                    _error!,
                    textAlign: TextAlign.center,
                    style: TextStyle(color: chrome.textMuted),
                  ),
                ),
              )
            : inHub
            ? _buildHub(hPad)
            : _buildDetail(hPad),
      ),
    ),
    );
  }

  Widget _buildHub(double hPad) {
    return ListView(
      padding: EdgeInsets.fromLTRB(
        hPad,
        8,
        hPad,
        MediaQuery.paddingOf(context).bottom + 24,
      ),
      children: [
        const Text(
          'Tùy chỉnh tin nhắn, quyền riêng tư và giao diện. '
          'Cài đặt đồng bộ với web khi đăng nhập cùng tài khoản.',
          style: TextStyle(color: _textMuted, fontSize: 13, height: 1.45),
        ),
        const SizedBox(height: 16),
        ..._sectionIds.map(
          (id) => Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: _hubTile(
              icon: _sectionIcon(id),
              title: _sectionLabel(id),
              subtitle: _sectionSubtitle(id),
              onTap: () => _openSection(id),
            ),
          ),
        ),
      ],
    );
  }

  Widget _hubTile({
    required IconData icon,
    required String title,
    required String subtitle,
    required VoidCallback onTap,
  }) {
    return Material(
      color: _cardBg,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
          child: Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: const Color(0xFF152A52),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(icon, color: const Color(0xFFB8C8E8), size: 22),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w600,
                        fontSize: 15,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      style: const TextStyle(
                        color: _textMuted,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
              const Icon(
                Icons.chevron_right_rounded,
                color: Color(0xFF7E8CA8),
                size: 22,
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildDetail(double hPad) {
    return SingleChildScrollView(
      padding: EdgeInsets.fromLTRB(
        hPad,
        4,
        hPad,
        MediaQuery.paddingOf(context).bottom + 24,
      ),
      child: _buildSectionContent(_detailSection!),
    );
  }

  Widget _buildSectionContent(String section) {
    switch (section) {
      case 'general':
        return _buildGeneral();
      case 'privacy':
        return _buildPrivacy();
      case 'messages':
        return _buildMessages();
      case 'appearance':
        return _buildAppearance();
      case 'notifications':
        return _buildNotifications();
      case 'profile':
        return _buildProfile();
      default:
        return const SizedBox.shrink();
    }
  }

  Widget _buildGeneral() {
    final lc = LanguageController.instance;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _sectionTitle(_t('settings.general.dmDirectoryTitle')),
        _hint(_t('settings.general.dmDirectoryHint')),
        _cardWidget([
          _radioRow(
            label: _t('settings.general.dmDirectoryAllFriends'),
            selected: _peersMode == DmSidebarPeersMode.all,
            onTap: () => setState(() {
              _peersMode = DmSidebarPeersMode.all;
              _dirty = true;
            }),
          ),
          const Divider(height: 1, color: _border),
          _radioRow(
            label: _t('settings.general.dmDirectoryOnlineFriends'),
            selected: _peersMode == DmSidebarPeersMode.online,
            onTap: () => setState(() {
              _peersMode = DmSidebarPeersMode.online;
              _dirty = true;
            }),
          ),
        ]),
        const SizedBox(height: 20),
        _sectionTitle(_t('settings.general.languageTitle')),
        _hint(_t('settings.general.languageHint')),
        _cardWidget([
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _t('settings.general.languageLabel'),
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                const SizedBox(height: 8),
                _dropdown(
                  value: lc.language,
                  items: {
                    'vi': _t('settings.general.languageNames.vi'),
                    'en': _t('settings.general.languageNames.en'),
                    'ja': _t('settings.general.languageNames.ja'),
                    'zh': _t('settings.general.languageNames.zh'),
                  },
                  onChanged: (v) async {
                    if (v != null) {
                      await lc.setLanguage(v);
                      if (mounted) setState(() => _dirty = true);
                    }
                  },
                ),
              ],
            ),
          ),
        ]),
      ],
    );
  }

  Widget _buildPrivacy() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _hint(
          'Ẩn ngày tham gia Cordigram trên hồ sơ công khai. '
          'Tắt chia sẻ trạng thái online/idle/offline với người khác.',
        ),
        _cardWidget([
          _switchRow(
            label: 'Hiển thị ngày tham gia Cordigram',
            value: _showMemberSince,
            onChanged: (v) => setState(() {
              _showMemberSince = v;
              _dirty = true;
            }),
          ),
          const Divider(height: 1, color: _border),
          _switchRow(
            label: 'Chia sẻ trạng thái (online / chờ / offline)',
            value: _sharePresence,
            onChanged: (v) => setState(() {
              _sharePresence = v;
              _dirty = true;
            }),
          ),
        ]),
      ],
    );
  }

  Widget _buildMessages() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _cardWidget([
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text(
                  'Cho phép nhận tin',
                  style: TextStyle(color: _textMuted, fontSize: 12),
                ),
                const SizedBox(height: 6),
                _dropdown(
                  value: _dmListFrom,
                  items: const {
                    'everyone': 'Tất cả mọi người',
                    'followers_only': 'Chỉ người bạn theo dõi',
                  },
                  onChanged: (v) => setState(() {
                    _dmListFrom = v!;
                    _dirty = true;
                  }),
                ),
                const SizedBox(height: 16),
                const Text(
                  'Cho phép gọi điện',
                  style: TextStyle(color: _textMuted, fontSize: 12),
                ),
                const SizedBox(height: 6),
                _dropdown(
                  value: _dmCallFrom,
                  items: const {
                    'everyone': 'Tất cả mọi người',
                    'followers_only': 'Chỉ người bạn theo dõi',
                  },
                  onChanged: (v) => setState(() {
                    _dmCallFrom = v!;
                    _dirty = true;
                  }),
                ),
              ],
            ),
          ),
        ]),
        const SizedBox(height: 20),
        _sectionTitle('Chặn tin nhắn'),
        _cardWidget([
          InkWell(
            borderRadius: BorderRadius.circular(12),
            onTap: _blockedOpen
                ? () => setState(() => _blockedOpen = false)
                : _loadBlocked,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
              child: Row(
                children: [
                  const Expanded(
                    child: Text(
                      'Danh sách chặn',
                      style: TextStyle(
                        color: Color(0xFF6CB7EE),
                        fontWeight: FontWeight.w600,
                        fontSize: 15,
                      ),
                    ),
                  ),
                  Icon(
                    _blockedOpen
                        ? Icons.expand_less_rounded
                        : Icons.chevron_right_rounded,
                    color: const Color(0xFF7E8CA8),
                  ),
                ],
              ),
            ),
          ),
          if (_blockedOpen) ...[
            const Divider(height: 1, color: _border),
            if (_blockedLoading)
              const Padding(
                padding: EdgeInsets.all(16),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (_blocked.isEmpty)
              const Padding(
                padding: EdgeInsets.all(14),
                child: Text(
                  'Chưa chặn ai.',
                  style: TextStyle(color: _textMuted),
                ),
              )
            else
              ...List.generate(_blocked.length, (i) {
                final b = _blocked[i];
                final id =
                    (b['userId'] ?? b['_id'] ?? b['blockedUserId'] ?? '')
                        .toString();
                final name =
                    (b['displayName'] ?? b['username'] ?? id).toString();
                return Column(
                  children: [
                    if (i > 0) const Divider(height: 1, color: _border),
                    Padding(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 8,
                      ),
                      child: Row(
                        children: [
                          Expanded(
                            child: Text(
                              name,
                              style: const TextStyle(color: Colors.white),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          TextButton(
                            onPressed: () => _unblock(id),
                            style: TextButton.styleFrom(
                              foregroundColor: _accent,
                              padding: const EdgeInsets.symmetric(
                                horizontal: 10,
                              ),
                              minimumSize: Size.zero,
                              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                            ),
                            child: const Text('Bỏ chặn'),
                          ),
                        ],
                      ),
                    ),
                  ],
                );
              }),
          ],
        ]),
      ],
    );
  }

  Widget _buildAppearance() {
    final presetEntries = AccentColorController.presetHex.entries
        .where((e) => e.key != 'default')
        .toList();
    final accents = AccentColorController.accentOptions;
    final chromeHex = AccentColorController.instance.chromeHex;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _hint(_t('settings.appearance.mutualHint')),
        Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: Text(
            _appearanceSource == 'accent' && _boostUnlocked
                ? _t('settings.appearance.modeAccent')
                : _t('settings.appearance.modeBackground'),
            style: TextStyle(
              color: AccentColorController.instance.effectivePalette.accent,
              fontSize: 12,
              fontWeight: FontWeight.w800,
              letterSpacing: 0.4,
            ),
          ),
        ),
        _sectionTitle(_t('settings.appearanceBg.title')),
        _hint(_t('settings.appearanceBg.hintShort')),
        _cardWidget([
          Padding(
            padding: const EdgeInsets.all(12),
            child: Wrap(
              spacing: 10,
              runSpacing: 10,
              children: presetEntries.map((entry) {
                final color =
                    MessagesChromePalette.hexToColor(entry.value) ??
                    const Color(0xFF111827);
                final shellDark =
                    MessagesShellThemeController.instance.theme ==
                    MessagesShellTheme.dark;
                final active = _appearanceSource == 'background' &&
                    shellDark &&
                    MessagesChromePalette.normalizeHex(
                          AccentColorController.instance.chromeHex,
                        ) ==
                        MessagesChromePalette.normalizeHex(entry.value);
                return _colorSwatch(
                  color: color,
                  active: active,
                  size: 52,
                  onTap: () async {
                    await AccentColorController.instance.setPreset(entry.key);
                    setState(() {
                      _syncAppearanceFromController();
                      _dirty = true;
                    });
                  },
                );
              }).toList(),
            ),
          ),
        ]),
        const SizedBox(height: 20),
        _sectionTitle(_t('settings.themeColors.title')),
        if (!_boostUnlocked)
          _hint(_t('settings.themeColors.lockedHint')),
        _cardWidget([
          Padding(
            padding: const EdgeInsets.all(12),
            child: Opacity(
              opacity: _boostUnlocked ? 1 : 0.45,
              child: IgnorePointer(
                ignoring: !_boostUnlocked,
                child: Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: accents.map((opt) {
                    final primary = opt['color'] as Color;
                    final secondary = opt['secondary'] as Color?;
                    final hex = AccentColorController.hexFromColor(primary);
                    final active = _appearanceSource == 'accent' &&
                        MessagesChromePalette.normalizeHex(
                              _accentHex ?? '',
                            ) ==
                            MessagesChromePalette.normalizeHex(hex);
                    return _colorSwatch(
                      color: primary,
                      secondary: secondary,
                      active: active,
                      size: 42,
                      onTap: () async {
                        await AccentColorController.instance.setAccentHex(hex);
                        setState(() {
                          _syncAppearanceFromController();
                          _dirty = true;
                        });
                      },
                    );
                  }).toList(),
                ),
              ),
            ),
          ),
        ]),
        if (_boostUnlocked && _appearanceSource == 'accent')
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(
              'Màu hiện tại: $chromeHex',
              style: const TextStyle(color: _textMuted, fontSize: 12),
            ),
          ),
      ],
    );
  }

  Widget _colorSwatch({
    required Color color,
    Color? secondary,
    required bool active,
    required double size,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(size > 44 ? 10 : 8),
          border: Border.all(
            color: active ? Colors.white : Colors.transparent,
            width: 2.5,
          ),
          gradient: secondary != null
              ? LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [color, secondary],
                )
              : null,
          color: secondary == null ? color : null,
        ),
        child: active
            ? Icon(
                Icons.check_rounded,
                color: Colors.white,
                size: size > 44 ? 22 : 18,
              )
            : null,
      ),
    );
  }

  Widget _buildNotifications() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _cardWidget([
          _switchRow(
            label: 'Thông báo',
            subtitle:
                'Bật: thông báo bình thường. Tắt: tắt mọi thông báo (social + DM).',
            value: _notifEnabled,
            onChanged: (v) => setState(() {
              _notifEnabled = v;
              _dirty = true;
            }),
          ),
          const Divider(height: 1, color: _border),
          _switchRow(
            label: 'Âm thanh thông báo',
            subtitle: 'Tin nhắn và thông báo mới',
            value: _soundEnabled,
            onChanged: (v) => setState(() {
              _soundEnabled = v;
              _dirty = true;
            }),
          ),
        ]),
      ],
    );
  }

  Widget _buildProfile() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _cardWidget([
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _fieldLabel('TÊN HIỂN THỊ'),
                _textField(_displayNameCtrl, 'Tên hiển thị'),
                const SizedBox(height: 12),
                _fieldLabel('USERNAME'),
                _textField(_usernameCtrl, 'Username'),
                const SizedBox(height: 12),
                _fieldLabel('ĐẠI TỪ NHÂN XƯNG'),
                _textField(_pronounsCtrl, 'ví dụ: they/them'),
                const SizedBox(height: 12),
                _fieldLabel('TIỂU SỬ'),
                _hint(
                  'Có thể dùng markdown và liên kết.',
                ),
                TextField(
                  controller: _bioCtrl,
                  maxLines: 4,
                  maxLength: 300,
                  style: const TextStyle(color: Colors.white),
                  decoration: _inputDec('Tiểu sử'),
                  onChanged: (_) => setState(() => _dirty = true),
                ),
              ],
            ),
          ),
        ]),
      ],
    );
  }

  Widget _radioRow({
    required String label,
    required bool selected,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        child: Row(
          children: [
            Icon(
              selected
                  ? Icons.radio_button_checked_rounded
                  : Icons.radio_button_off_rounded,
              color: selected ? _accent : _textMuted,
              size: 22,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                label,
                style: const TextStyle(color: Colors.white, fontSize: 15),
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// Hàng công tắc: nhãn trên, switch căn phải — tránh overflow ngang.
  Widget _switchRow({
    required String label,
    String? subtitle,
    required bool value,
    required ValueChanged<bool> onChanged,
  }) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w500,
                    fontSize: 15,
                  ),
                ),
                if (subtitle != null) ...[
                  const SizedBox(height: 4),
                  Text(
                    subtitle,
                    style: const TextStyle(
                      color: _textMuted,
                      fontSize: 12,
                      height: 1.4,
                    ),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: 8),
          Switch(
            value: value,
            onChanged: onChanged,
            activeThumbColor: Colors.white,
            activeTrackColor: _accent,
            materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
          ),
        ],
      ),
    );
  }

  Widget _sectionTitle(String text) => Padding(
    padding: const EdgeInsets.only(bottom: 8),
    child: Text(
      text,
      style: const TextStyle(
        color: Color(0xFF8EA3CC),
        fontSize: 12,
        fontWeight: FontWeight.w800,
        letterSpacing: 0.5,
      ),
    ),
  );

  Widget _hint(String text) => Padding(
    padding: const EdgeInsets.only(bottom: 10),
    child: Text(
      text,
      style: const TextStyle(color: _textMuted, fontSize: 13, height: 1.45),
    ),
  );

  Widget _fieldLabel(String text) => Padding(
    padding: const EdgeInsets.only(bottom: 6),
    child: Text(
      text,
      style: const TextStyle(
        color: _textMuted,
        fontSize: 11,
        fontWeight: FontWeight.w700,
        letterSpacing: 0.5,
      ),
    ),
  );

  Widget _cardWidget(List<Widget> children) => Container(
    margin: const EdgeInsets.only(bottom: 4),
    decoration: BoxDecoration(
      color: _cardBg,
      borderRadius: BorderRadius.circular(12),
      border: Border.all(color: _border),
    ),
    child: Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: children,
    ),
  );

  Widget _dropdown({
    required String value,
    required Map<String, String> items,
    required ValueChanged<String?> onChanged,
  }) {
    return DropdownButtonFormField<String>(
      isExpanded: true,
      initialValue: value,
      dropdownColor: const Color(0xFF152A52),
      style: const TextStyle(color: Colors.white, fontSize: 15),
      decoration: InputDecoration(
        filled: true,
        fillColor: const Color(0xFF152A52),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide.none,
        ),
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      ),
      items: items.entries
          .map(
            (e) => DropdownMenuItem<String>(
              value: e.key,
              child: Text(e.value, overflow: TextOverflow.ellipsis),
            ),
          )
          .toList(),
      onChanged: onChanged,
    );
  }

  Widget _textField(TextEditingController ctrl, String hint) {
    return TextField(
      controller: ctrl,
      style: const TextStyle(color: Colors.white),
      decoration: _inputDec(hint),
      onChanged: (_) => setState(() => _dirty = true),
    );
  }

  InputDecoration _inputDec(String hint) => InputDecoration(
    hintText: hint,
    hintStyle: const TextStyle(color: _textMuted),
    filled: true,
    fillColor: const Color(0xFF152A52),
    border: OutlineInputBorder(
      borderRadius: BorderRadius.circular(10),
      borderSide: BorderSide.none,
    ),
    contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
  );
}
