import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/services/accent_color_controller.dart';
import '../../core/theme/app_theme_context.dart';
import '../../core/theme/messages_chrome_palette.dart';
import '../../core/services/language_controller.dart';
import '../profile/services/profile_service.dart';
import 'services/direct_messages_service.dart';
import 'services/messages_media_service.dart';
import 'utils/dm_sidebar_prefs.dart';
import 'utils/messages_navigator.dart';
import 'widgets/messages_boost_store_screen.dart';
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

  String _t(String key, [Map<String, dynamic>? vars]) =>
      LanguageController.instance.t(key, vars);

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
      await _syncFollowSocialShellIfNeeded();
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
        _error = '${_t('settings.failedToLoad')} $e';
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
      ).showSnackBar(SnackBar(content: Text('${_t('settings.errorSave')}: $e')));
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
      unawaited(_syncFollowSocialShellIfNeeded());
    }
  }

  /// Legacy default chrome → follow Social shell (light / dark / galaxy).
  Future<void> _syncFollowSocialShellIfNeeded() async {
    if (!AccentColorController.instance.isFollowingSocialAppearance) return;
    await MessagesShellThemeController.instance.clearOverride();
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
            ? _buildHub(context, hPad)
            : _buildDetail(context, hPad),
      ),
    ),
    );
  }

  Widget _buildHub(BuildContext context, double hPad) {
    final c = context.chrome;
    return ListView(
      padding: EdgeInsets.fromLTRB(
        hPad,
        8,
        hPad,
        MediaQuery.paddingOf(context).bottom + 24,
      ),
      children: [
        Text(
          _t('settings.hubHint'),
          style: TextStyle(color: c.textMuted, fontSize: 13, height: 1.45),
        ),
        const SizedBox(height: 16),
        Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: _hubTile(
            context,
            icon: Icons.rocket_launch_rounded,
            title: _t('chat.messagesPage.boostUpgrade'),
            subtitle: _t('chat.boostStore.app.heroSubtitle'),
            onTap: () => MessagesBoostStoreScreen.open(context),
          ),
        ),
        ..._sectionIds.map(
          (id) => Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: _hubTile(
              context,
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

  Widget _hubTile(
    BuildContext context, {
    required IconData icon,
    required String title,
    required String subtitle,
    required VoidCallback onTap,
  }) {
    final c = context.chrome;
    return Material(
      color: c.surface,
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
                  color: c.chatInput,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(icon, color: c.textMuted, size: 22),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: TextStyle(
                        color: c.text,
                        fontWeight: FontWeight.w600,
                        fontSize: 15,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      style: TextStyle(
                        color: c.textMuted,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
              Icon(
                Icons.chevron_right_rounded,
                color: c.textMuted.withValues(alpha: 0.85),
                size: 22,
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildDetail(BuildContext context, double hPad) {
    return SingleChildScrollView(
      padding: EdgeInsets.fromLTRB(
        hPad,
        4,
        hPad,
        MediaQuery.paddingOf(context).bottom + 24,
      ),
      child: _buildSectionContent(context, _detailSection!),
    );
  }

  Widget _buildSectionContent(BuildContext context, String section) {
    switch (section) {
      case 'general':
        return _buildGeneral(context);
      case 'privacy':
        return _buildPrivacy(context);
      case 'messages':
        return _buildMessages(context);
      case 'appearance':
        return _buildAppearance(context);
      case 'notifications':
        return _buildNotifications(context);
      case 'profile':
        return _buildProfile(context);
      default:
        return const SizedBox.shrink();
    }
  }

  Widget _buildGeneral(BuildContext context) {
    final lc = LanguageController.instance;
    final c = context.chrome;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _sectionTitle(context, _t('settings.general.dmDirectoryTitle')),
        _hint(context, _t('settings.general.dmDirectoryHint')),
        _cardWidget(context, [
          _radioRow(
            context,
            label: _t('settings.general.dmDirectoryAllFriends'),
            selected: _peersMode == DmSidebarPeersMode.all,
            onTap: () => setState(() {
              _peersMode = DmSidebarPeersMode.all;
              _dirty = true;
            }),
          ),
          Divider(height: 1, color: c.border),
          _radioRow(
            context,
            label: _t('settings.general.dmDirectoryOnlineFriends'),
            selected: _peersMode == DmSidebarPeersMode.online,
            onTap: () => setState(() {
              _peersMode = DmSidebarPeersMode.online;
              _dirty = true;
            }),
          ),
        ]),
        const SizedBox(height: 20),
        _sectionTitle(context, _t('settings.general.languageTitle')),
        _hint(context, _t('settings.general.languageHint')),
        _cardWidget(context, [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _t('settings.general.languageLabel'),
                  style: TextStyle(
                    color: c.text,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                const SizedBox(height: 8),
                _dropdown(
                  context,
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

  Widget _buildPrivacy(BuildContext context) {
    final c = context.chrome;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _hint(context, _t('settings.privacy.hint')),
        _cardWidget(context, [
          _switchRow(
            context,
            label: _t('settings.privacy.showMemberSince'),
            value: _showMemberSince,
            onChanged: (v) => setState(() {
              _showMemberSince = v;
              _dirty = true;
            }),
          ),
          Divider(height: 1, color: c.border),
          _switchRow(
            context,
            label: _t('settings.privacy.sharePresence'),
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

  Widget _buildMessages(BuildContext context) {
    final c = context.chrome;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _cardWidget(context, [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  _t('settings.messages.allowMessageLabel'),
                  style: TextStyle(color: c.textMuted, fontSize: 12),
                ),
                const SizedBox(height: 6),
                _dropdown(
                  context,
                  value: _dmListFrom,
                  items: {
                    'everyone': _t('settings.messages.everyone'),
                    'followers_only': _t('settings.messages.followersOnly'),
                  },
                  onChanged: (v) => setState(() {
                    _dmListFrom = v!;
                    _dirty = true;
                  }),
                ),
                const SizedBox(height: 16),
                Text(
                  _t('settings.messages.allowCallLabel'),
                  style: TextStyle(color: c.textMuted, fontSize: 12),
                ),
                const SizedBox(height: 6),
                _dropdown(
                  context,
                  value: _dmCallFrom,
                  items: {
                    'everyone': _t('settings.messages.everyone'),
                    'followers_only': _t('settings.messages.followersOnly'),
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
        _sectionTitle(context, _t('settings.messages.blockTitle')),
        _cardWidget(context, [
          InkWell(
            borderRadius: BorderRadius.circular(12),
            onTap: _blockedOpen
                ? () => setState(() => _blockedOpen = false)
                : _loadBlocked,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      _t('settings.messages.blockedList'),
                      style: TextStyle(
                        color: c.accent,
                        fontWeight: FontWeight.w600,
                        fontSize: 15,
                      ),
                    ),
                  ),
                  Icon(
                    _blockedOpen
                        ? Icons.expand_less_rounded
                        : Icons.chevron_right_rounded,
                    color: c.textMuted.withValues(alpha: 0.85),
                  ),
                ],
              ),
            ),
          ),
          if (_blockedOpen) ...[
            Divider(height: 1, color: c.border),
            if (_blockedLoading)
              Padding(
                padding: const EdgeInsets.all(16),
                child: Center(
                  child: CircularProgressIndicator(color: c.accent),
                ),
              )
            else if (_blocked.isEmpty)
              Padding(
                padding: const EdgeInsets.all(14),
                child: Text(
                  _t('settings.messages.empty'),
                  style: TextStyle(color: c.textMuted),
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
                    if (i > 0) Divider(height: 1, color: c.border),
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
                              style: TextStyle(color: c.text),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          TextButton(
                            onPressed: () => _unblock(id),
                            style: TextButton.styleFrom(
                              foregroundColor: c.accent,
                              padding: const EdgeInsets.symmetric(
                                horizontal: 10,
                              ),
                              minimumSize: Size.zero,
                              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                            ),
                            child: Text(_t('settings.messages.unblock')),
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

  Widget _buildAppearance(BuildContext context) {
    final presetEntries = AccentColorController.presetHex.entries
        .where((e) => e.key != 'default')
        .toList();
    final accents = AccentColorController.accentOptions;
    final chromeHex = AccentColorController.instance.chromeHex;

    final c = context.chrome;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _hint(context, _t('settings.appearance.mutualHint')),
        Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: Text(
            AccentColorController.instance.isFollowingSocialAppearance
                ? _t('settings.appearance.modeFollowSocial')
                : _appearanceSource == 'accent' && _boostUnlocked
                    ? _t('settings.appearance.modeAccent')
                    : _t('settings.appearance.modeBackground'),
            style: TextStyle(
              color: c.accent,
              fontSize: 12,
              fontWeight: FontWeight.w800,
              letterSpacing: 0.4,
            ),
          ),
        ),
        _sectionTitle(context, _t('settings.appearance.followSocialTitle')),
        _hint(context, _t('settings.appearance.followSocialHint')),
        _cardWidget(context, [
          Padding(
            padding: const EdgeInsets.all(12),
            child: _socialFollowSwatch(
              active: AccentColorController.instance.isFollowingSocialAppearance,
              onTap: () async {
                await AccentColorController.instance.resetToSocialAppearance();
                setState(() {
                  _syncAppearanceFromController();
                  _dirty = true;
                });
              },
            ),
          ),
        ]),
        const SizedBox(height: 20),
        _sectionTitle(context, _t('settings.appearanceBg.title')),
        _hint(context, _t('settings.appearanceBg.hintShort')),
        _cardWidget(context, [
          Padding(
            padding: const EdgeInsets.all(12),
            child: Wrap(
              spacing: 10,
              runSpacing: 10,
              children: presetEntries.map((entry) {
                final color =
                    MessagesChromePalette.hexToColor(entry.value) ??
                    const Color(0xFF111827);
                final shellCustom =
                    MessagesShellThemeController.instance.hasOverride;
                final active = _appearanceSource == 'background' &&
                    shellCustom &&
                    MessagesShellThemeController.instance.theme ==
                        MessagesShellTheme.dark &&
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
        _sectionTitle(context, _t('settings.themeColors.title')),
        if (!_boostUnlocked)
          _hint(context, _t('settings.themeColors.lockedHint')),
        _cardWidget(context, [
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
              _t('settings.appearance.currentColor', {'hex': chromeHex}),
              style: TextStyle(color: c.textMuted, fontSize: 12),
            ),
          ),
      ],
    );
  }

  Widget _socialFollowSwatch({
    required bool active,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 52,
        height: 52,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: active ? Colors.white : Colors.white24,
            width: active ? 2.5 : 1,
          ),
          gradient: const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              Color(0xFFF6F8FB),
              Color(0xFF0C1220),
              Color(0xFF2A1A5E),
              Color(0xFF5865F2),
            ],
            stops: [0, 0.42, 0.78, 1],
          ),
        ),
        child: active
            ? const Icon(Icons.sync_rounded, color: Colors.white, size: 22)
            : Icon(Icons.sync_rounded, color: Colors.white.withValues(alpha: 0.75), size: 20),
      ),
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

  Widget _buildNotifications(BuildContext context) {
    final c = context.chrome;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _cardWidget(context, [
          _switchRow(
            context,
            label: _t('settings.notifications.masterLabel'),
            subtitle: _t('settings.notifications.masterHint'),
            value: _notifEnabled,
            onChanged: (v) => setState(() {
              _notifEnabled = v;
              _dirty = true;
            }),
          ),
          Divider(height: 1, color: c.border),
          _switchRow(
            context,
            label: _t('settings.notifications.soundLabel'),
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

  Widget _buildProfile(BuildContext context) {
    final c = context.chrome;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _cardWidget(context, [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _fieldLabel(
                  context,
                  _t('chat.profileEditor.displayNameLabel').toUpperCase(),
                ),
                _textField(
                  context,
                  _displayNameCtrl,
                  _t('chat.profileEditor.displayNameLabel'),
                ),
                const SizedBox(height: 12),
                _fieldLabel(
                  context,
                  _t('chat.profileEditor.usernameLabel').toUpperCase(),
                ),
                _textField(
                  context,
                  _usernameCtrl,
                  _t('chat.profileEditor.usernameLabel'),
                ),
                const SizedBox(height: 12),
                _fieldLabel(
                  context,
                  _t('chat.profileEditor.pronounsLabel').toUpperCase(),
                ),
                _textField(
                  context,
                  _pronounsCtrl,
                  _t('chat.profileEditor.pronounsPlaceholder'),
                ),
                const SizedBox(height: 12),
                _fieldLabel(
                  context,
                  _t('chat.profileEditor.bioLabel').toUpperCase(),
                ),
                _hint(context, _t('chat.profileEditor.bioHint')),
                TextField(
                  controller: _bioCtrl,
                  maxLines: 4,
                  maxLength: 300,
                  style: TextStyle(color: c.text),
                  decoration: _inputDec(
                    context,
                    _t('chat.profileEditor.bioLabel'),
                  ),
                  onChanged: (_) => setState(() => _dirty = true),
                ),
              ],
            ),
          ),
        ]),
      ],
    );
  }

  Widget _radioRow(
    BuildContext context, {
    required String label,
    required bool selected,
    required VoidCallback onTap,
  }) {
    final c = context.chrome;
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
              color: selected ? c.accent : c.textMuted,
              size: 22,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                label,
                style: TextStyle(color: c.text, fontSize: 15),
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// Hàng công tắc: nhãn trên, switch căn phải — tránh overflow ngang.
  Widget _switchRow(
    BuildContext context, {
    required String label,
    String? subtitle,
    required bool value,
    required ValueChanged<bool> onChanged,
  }) {
    final c = context.chrome;
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
                  style: TextStyle(
                    color: c.text,
                    fontWeight: FontWeight.w500,
                    fontSize: 15,
                  ),
                ),
                if (subtitle != null) ...[
                  const SizedBox(height: 4),
                  Text(
                    subtitle,
                    style: TextStyle(
                      color: c.textMuted,
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
            activeTrackColor: c.accent,
            materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
          ),
        ],
      ),
    );
  }

  Widget _sectionTitle(BuildContext context, String text) {
    final c = context.chrome;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Text(
        text,
        style: TextStyle(
          color: c.textMuted,
          fontSize: 12,
          fontWeight: FontWeight.w800,
          letterSpacing: 0.5,
        ),
      ),
    );
  }

  Widget _hint(BuildContext context, String text) {
    final c = context.chrome;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Text(
        text,
        style: TextStyle(color: c.textMuted, fontSize: 13, height: 1.45),
      ),
    );
  }

  Widget _fieldLabel(BuildContext context, String text) {
    final c = context.chrome;
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Text(
        text,
        style: TextStyle(
          color: c.textMuted,
          fontSize: 11,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.5,
        ),
      ),
    );
  }

  Widget _cardWidget(BuildContext context, List<Widget> children) {
    final c = context.chrome;
    return Container(
      margin: const EdgeInsets.only(bottom: 4),
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: c.border),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: children,
      ),
    );
  }

  Widget _dropdown(
    BuildContext context, {
    required String value,
    required Map<String, String> items,
    required ValueChanged<String?> onChanged,
  }) {
    final c = context.chrome;
    return DropdownButtonFormField<String>(
      isExpanded: true,
      initialValue: value,
      dropdownColor: c.chatInput,
      style: TextStyle(color: c.text, fontSize: 15),
      decoration: InputDecoration(
        filled: true,
        fillColor: c.chatInput,
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

  Widget _textField(
    BuildContext context,
    TextEditingController ctrl,
    String hint,
  ) {
    return TextField(
      controller: ctrl,
      style: TextStyle(color: context.chrome.text),
      decoration: _inputDec(context, hint),
      onChanged: (_) => setState(() => _dirty = true),
    );
  }

  InputDecoration _inputDec(BuildContext context, String hint) {
    final c = context.chrome;
    return InputDecoration(
      hintText: hint,
      hintStyle: TextStyle(color: c.textMuted),
      filled: true,
      fillColor: c.chatInput,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide.none,
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
    );
  }
}
