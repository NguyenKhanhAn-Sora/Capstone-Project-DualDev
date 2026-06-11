import 'dart:async';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../../../core/services/language_controller.dart';
import '../../../core/theme/app_radii.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_theme_context.dart';
import '../../../core/widgets/app_button.dart';
import '../models/display_name_style.dart';
import '../models/server_models.dart';
import '../models/server_role_models.dart';
import '../services/direct_messages_realtime_service.dart';
import '../services/direct_messages_service.dart';
import '../services/messages_media_service.dart';
import '../services/servers_service.dart';
import '../utils/messaging_profile_cover.dart';
import 'display_name_styled_text.dart';
import 'display_name_style_sheet.dart';
import 'messages_boost_store_screen.dart';

const _defaultAvatar =
    'https://res.cloudinary.com/doicocgeo/image/upload/v1765850274/user-avatar-default_gfx5bs.jpg';

const _bannerPresets = [
  '#5865f2',
  '#57f287',
  '#fee75c',
  '#eb459e',
  '#ed4245',
  '#111827',
];

/// Editor hồ sơ Messages — parity web `MessagesProfileEditor`.
class MessagesProfileEditor extends StatefulWidget {
  const MessagesProfileEditor({super.key});

  @override
  State<MessagesProfileEditor> createState() => _MessagesProfileEditorState();
}

class _MessagesProfileEditorState extends State<MessagesProfileEditor> {
  String _tab = 'main';
  bool _loading = true;
  bool _boostUnlocked = false;
  bool _saving = false;
  bool _uploadingAvatar = false;
  bool _uploadingBanner = false;

  final _displayNameCtrl = TextEditingController();
  final _usernameCtrl = TextEditingController();
  final _pronounsCtrl = TextEditingController();
  final _bioCtrl = TextEditingController();
  final _serverNickCtrl = TextEditingController();

  String _avatarUrl = _defaultAvatar;
  String? _bannerImageUrl;
  String _bannerSolidHex = MessagingProfileCover.defaultBannerHex;
  DisplayNameStyle _displayNameStyle = const DisplayNameStyle();
  final DisplayNameStyle _demoMainStyle = DisplayNameStyle.demo;

  List<ServerSummary> _servers = [];
  String? _serverId;
  String? _serverAvatarUrl;
  String? _serverBannerImageUrl;
  String _serverBannerSolidHex = MessagingProfileCover.defaultBannerHex;
  DisplayNameStyle _serverDisplayNameStyle = const DisplayNameStyle();
  final DisplayNameStyle _demoServerStyle = DisplayNameStyle.demo;

  String _t(String key) => LanguageController.instance.t(key);

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _displayNameCtrl.dispose();
    _usernameCtrl.dispose();
    _pronounsCtrl.dispose();
    _bioCtrl.dispose();
    _serverNickCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      await MessagesMediaService.refreshBoostStatus(force: true);
      final profile = await DirectMessagesService.getMyMessagingProfile();
      final servers = await ServersService.getMyServers();
      if (!mounted) return;
      setState(() {
        _boostUnlocked = MessagesMediaService.isBoostMediaOptimizationEnabled;
        _displayNameCtrl.text =
            (profile['displayName'] ?? profile['name'] ?? '').toString();
        _usernameCtrl.text =
            (profile['chatUsername'] ?? profile['username'] ?? '').toString();
        _pronounsCtrl.text = (profile['pronouns'] ?? '').toString();
        _bioCtrl.text = (profile['bio'] ?? '').toString();
        _avatarUrl = (profile['avatarUrl'] ?? _defaultAvatar).toString();
        final cover = MessagingProfileCover.parse(profile['coverUrl']?.toString());
        _bannerImageUrl = cover.bannerImageUrl;
        _bannerSolidHex = cover.bannerSolidHex;
        _displayNameStyle = DisplayNameStyle.fromProfile(profile);
        _servers = servers;
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _loadServerProfile() async {
    final sid = _serverId;
    if (sid == null || sid.isEmpty) return;
    try {
      final members = await ServersService.getServerMembersWithRoles(sid);
      final myId = DirectMessagesService.currentUserId;
      MemberWithRolesRow? me;
      for (final m in members.members) {
        if (m.userId == myId) {
          me = m;
          break;
        }
      }
      final profile = await ServersService.getMyServerProfile(sid);
      if (!mounted) return;
      final cover = MessagingProfileCover.parse(profile['coverUrl']?.toString());
      setState(() {
        _serverNickCtrl.text = (me?.nickname ?? profile['nickname'] ?? '').toString();
        _serverAvatarUrl = profile['avatarUrl']?.toString();
        _serverBannerImageUrl = cover.bannerImageUrl;
        _serverBannerSolidHex = cover.bannerSolidHex;
        _serverDisplayNameStyle = DisplayNameStyle.fromProfile(profile);
      });
    } catch (_) {}
  }

  bool get _isServerTab => _tab == 'server';

  String get _effectiveAvatar =>
      _isServerTab && _serverId != null
          ? (_serverAvatarUrl ?? _defaultAvatar)
          : _avatarUrl;

  String? get _effectiveBannerImage =>
      _isServerTab && _serverId != null ? _serverBannerImageUrl : _bannerImageUrl;

  String get _effectiveBannerHex =>
      _isServerTab && _serverId != null ? _serverBannerSolidHex : _bannerSolidHex;

  DisplayNameStyle get _appliedNameStyle =>
      _isServerTab && _serverId != null ? _serverDisplayNameStyle : _displayNameStyle;

  DisplayNameStyle get _effectiveNameStyle => _boostUnlocked
      ? _appliedNameStyle
      : (_isServerTab ? _demoServerStyle : _demoMainStyle);

  String get _previewName {
    if (_isServerTab && _serverNickCtrl.text.trim().isNotEmpty) {
      return _serverNickCtrl.text.trim();
    }
    final dn = _displayNameCtrl.text.trim();
    return dn.isEmpty ? '—' : dn;
  }

  Future<void> _pickAvatar() async {
    if (_uploadingAvatar) return;
    final x = await ImagePicker().pickImage(source: ImageSource.gallery);
    if (x == null || !mounted) return;
    setState(() => _uploadingAvatar = true);
    try {
      if (_isServerTab && _serverId != null) {
        final res = await ServersService.uploadMyServerAvatar(
          _serverId!,
          x.path,
          contentType: x.mimeType,
        );
        setState(() => _serverAvatarUrl = res['avatarUrl']?.toString());
      } else {
        final res = await DirectMessagesService.uploadMessagingProfileAvatar(
          x.path,
          contentType: x.mimeType,
        );
        setState(() => _avatarUrl = (res['avatarUrl'] ?? _avatarUrl).toString());
      }
      _toast(_t('chat.profileEditor.updatedAvatar'));
    } catch (e) {
      _toast('$e');
    } finally {
      if (mounted) setState(() => _uploadingAvatar = false);
    }
  }

  Future<void> _removeAvatar() async {
    try {
      if (_isServerTab && _serverId != null) {
        await ServersService.resetMyServerAvatar(_serverId!);
        setState(() => _serverAvatarUrl = null);
      } else {
        final res = await DirectMessagesService.resetMessagingProfileAvatar();
        setState(() => _avatarUrl = (res['avatarUrl'] ?? _defaultAvatar).toString());
      }
      _toast(_t('chat.profileEditor.removeAvatarDone'));
    } catch (_) {
      _toast(_t('chat.profileEditor.errorRemoveAvatar'));
    }
  }

  Future<void> _pickBanner() async {
    if (_uploadingBanner) return;
    if (!_isServerTab && !_boostUnlocked) {
      _toast(_t('chat.profileEditor.boostRequiredBanner'));
      return;
    }
    final x = await ImagePicker().pickImage(source: ImageSource.gallery);
    if (x == null || !mounted) return;
    setState(() => _uploadingBanner = true);
    try {
      final ct = MessagesMediaService.resolveUploadContentType(
        filePath: x.path,
        hintedContentType: x.mimeType,
      );
      final up = await MessagesMediaService.uploadFile(
        filePath: x.path,
        contentType: ct,
      );
      final url = MessagesMediaService.pickDisplayUrl(up);
      if (url.isEmpty) throw Exception(_t('chat.profileEditor.errorGetUrl'));
      setState(() {
        if (_isServerTab && _serverId != null) {
          _serverBannerImageUrl = url;
        } else {
          _bannerImageUrl = url;
        }
      });
      _toast(_t('chat.profileEditor.updatedBanner'));
    } catch (e) {
      _toast(_t('chat.profileEditor.errorLoadBanner'));
    } finally {
      if (mounted) setState(() => _uploadingBanner = false);
    }
  }

  void _removeBanner() {
    setState(() {
      if (_isServerTab && _serverId != null) {
        _serverBannerImageUrl = null;
      } else {
        _bannerImageUrl = null;
      }
    });
  }

  void _setBannerColor(String hex) {
    setState(() {
      if (_isServerTab && _serverId != null) {
        _serverBannerSolidHex = hex;
        _serverBannerImageUrl = null;
      } else {
        _bannerSolidHex = hex;
        _bannerImageUrl = null;
      }
    });
  }

  Future<void> _saveMain() async {
    setState(() => _saving = true);
    try {
      final payload = <String, dynamic>{
        'displayName': _displayNameCtrl.text.trim(),
        'chatUsername': _usernameCtrl.text.trim().toLowerCase(),
        'bio': _bioCtrl.text.trim(),
        'pronouns': _pronounsCtrl.text.trim(),
        'coverUrl': MessagingProfileCover.buildForSave(
          bannerImageUrl: _bannerImageUrl,
          bannerSolidHex: _bannerSolidHex,
        ),
      };
      if (_boostUnlocked) {
        payload.addAll(_displayNameStyle.toPayload());
      }
      await DirectMessagesService.updateMyMessagingProfile(payload);
      _toast(_t('chat.profileEditor.savedProfile'));
    } catch (e) {
      _toast(_t('chat.profileEditor.errorSaveProfile'));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _saveServerProfile() async {
    final sid = _serverId;
    if (sid == null || sid.isEmpty) return;
    setState(() => _saving = true);
    try {
      await ServersService.updateMyServerProfile(sid, {
        'coverUrl': MessagingProfileCover.buildForSave(
          bannerImageUrl: _serverBannerImageUrl,
          bannerSolidHex: _serverBannerSolidHex,
        ),
        if (_boostUnlocked) ..._serverDisplayNameStyle.toPayload(),
      });
      _toast(_t('chat.profileEditor.savedProfile'));
    } catch (_) {
      _toast(_t('chat.profileEditor.errorSaveProfile'));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _saveServerNick() async {
    final sid = _serverId;
    if (sid == null || sid.isEmpty) return;
    setState(() => _saving = true);
    try {
      await ServersService.updateMyServerNickname(sid, _serverNickCtrl.text.trim());
      _toast(_t('chat.profileEditor.savedNick'));
    } catch (_) {
      _toast(_t('chat.profileEditor.errorSaveNick'));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _openNameStyle() {
    if (!_boostUnlocked) {
      MessagesBoostStoreScreen.open(context);
      return;
    }
    DisplayNameStyleSheet.show(
      context,
      initial: _appliedNameStyle,
      boostUnlocked: _boostUnlocked,
      onApply: (next) => unawaited(_applyDisplayNameStyle(next)),
    );
  }

  void _emitLocalDisplayNameStyle(DisplayNameStyle style) {
    final uid = DirectMessagesService.currentUserId;
    if (uid == null || uid.isEmpty || (_isServerTab && _serverId != null)) {
      return;
    }
    DirectMessagesRealtimeService.emitLocalProfileStyleUpdated(
      DmProfileStyleUpdatedEvent(
        userId: uid,
        displayName: _displayNameCtrl.text.trim(),
        username: _usernameCtrl.text.trim(),
        displayNameFontId: style.fontId,
        displayNameEffectId: style.effectId,
        displayNamePrimaryHex: style.primaryHex,
        displayNameAccentHex: style.accentHex,
      ),
    );
  }

  Future<void> _applyDisplayNameStyle(DisplayNameStyle next) async {
    if (!_boostUnlocked) return;

    final reverted = _appliedNameStyle;
    setState(() {
      if (_isServerTab && _serverId != null) {
        _serverDisplayNameStyle = next;
      } else {
        _displayNameStyle = next;
      }
    });
    _emitLocalDisplayNameStyle(next);

    try {
      if (_isServerTab && _serverId != null) {
        await ServersService.updateMyServerProfile(_serverId!, next.toPayload());
      } else {
        await DirectMessagesService.updateMyMessagingProfile(next.toPayload());
      }
      _toast(_t('chat.profileEditor.displayNameStyleApplied'));
    } catch (_) {
      setState(() {
        if (_isServerTab && _serverId != null) {
          _serverDisplayNameStyle = reverted;
        } else {
          _displayNameStyle = reverted;
        }
      });
      _emitLocalDisplayNameStyle(reverted);
      _toast(_t('chat.profileEditor.displayNameStyleError'));
    }
  }

  void _toast(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  @override
  Widget build(BuildContext context) {
    final c = context.chrome;
    if (_loading) {
      return Padding(
        padding: const EdgeInsets.all(AppSpacing.xl),
        child: Center(
          child: CircularProgressIndicator(color: c.accent),
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _tabChips(context),
        const SizedBox(height: AppSpacing.md),
        _boostPromo(context),
        const SizedBox(height: AppSpacing.md),
        _previewCard(context),
        const SizedBox(height: AppSpacing.lg),
        if (_isServerTab) ...[
          _sectionTitle(_t('chat.profileEditor.serverLabel')),
          _hint(_t('chat.profileEditor.serverHint')),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
            decoration: BoxDecoration(
              color: c.chatInput,
              borderRadius: AppRadii.mdAll,
            ),
            child: DropdownButtonHideUnderline(
              child: DropdownButton<String>(
                isExpanded: true,
                value: _serverId?.isNotEmpty == true ? _serverId : null,
                hint: Text(
                  _t('chat.profileEditor.selectServer'),
                  style: TextStyle(color: c.textMuted),
                ),
                items: _servers
                    .map(
                      (s) => DropdownMenuItem(
                        value: s.id,
                        child: Text(s.name),
                      ),
                    )
                    .toList(),
                onChanged: (v) {
                  setState(() => _serverId = v);
                  if (v != null) _loadServerProfile();
                },
              ),
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          _sectionTitle(_t('chat.profileEditor.serverNickLabel')),
          TextField(
            controller: _serverNickCtrl,
            enabled: _serverId != null,
            style: TextStyle(color: c.text),
            decoration: _inputDec(
              context,
              _t('chat.profileEditor.serverNickPlaceholder'),
            ),
          ),
          const SizedBox(height: AppSpacing.lg),
        ],
        _card(context, [
          if (!_isServerTab) ...[
            _labeledField(
              context,
              _t('chat.profileEditor.displayNameLabel'),
              _displayNameCtrl,
            ),
            const SizedBox(height: AppSpacing.md),
            _labeledField(
              context,
              _t('chat.profileEditor.usernameLabel'),
              _usernameCtrl,
            ),
            const SizedBox(height: AppSpacing.md),
          ],
          _labeledField(
            context,
            _t('chat.profileEditor.pronounsLabel'),
            _pronounsCtrl,
            hint: _t('chat.profileEditor.pronounsPlaceholder'),
          ),
          const SizedBox(height: AppSpacing.lg),
          _sectionTitle(_t('chat.profileEditor.avatarLabel')),
          Row(
            children: [
              Expanded(
                child: AppButton(
                  label: _t('chat.profileEditor.changeAvatar'),
                  loading: _uploadingAvatar,
                  onPressed: _uploadingAvatar ? null : _pickAvatar,
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: AppButton(
                  label: _t('chat.profileEditor.removeAvatar'),
                  variant: AppButtonVariant.secondary,
                  onPressed: _removeAvatar,
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.lg),
          _sectionTitle(_t('chat.profileEditor.bannerColorLabel')),
          _bannerSwatch(context),
          const SizedBox(height: AppSpacing.sm),
          Row(
            children: [
              Expanded(
                child: AppButton(
                  label: _t('chat.profileEditor.uploadBanner'),
                  loading: _uploadingBanner,
                  onPressed: _uploadingBanner ? null : _pickBanner,
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: AppButton(
                  label: _t('chat.profileEditor.removeBanner'),
                  variant: AppButtonVariant.secondary,
                  onPressed: (_effectiveBannerImage ?? '').isNotEmpty
                      ? _removeBanner
                      : null,
                ),
              ),
            ],
          ),
          if (!_isServerTab && !_boostUnlocked)
            Padding(
              padding: const EdgeInsets.only(top: AppSpacing.sm),
              child: Text(
                _t('chat.profileEditor.boostRequiredBanner'),
                style: TextStyle(color: c.textMuted, fontSize: 12),
              ),
            ),
          const SizedBox(height: AppSpacing.lg),
          AppButton(
            label: _t('chat.profileEditor.displayNameStyleOpen'),
            onPressed: _openNameStyle,
          ),
          if (!_isServerTab) ...[
            const SizedBox(height: AppSpacing.lg),
            _sectionTitle(_t('chat.profileEditor.bioLabel')),
            _hint(_t('chat.profileEditor.bioHint')),
            TextField(
              controller: _bioCtrl,
              maxLines: 4,
              maxLength: 300,
              style: TextStyle(color: c.text),
              decoration: _inputDec(context, _t('chat.profileEditor.bioLabel')),
            ),
          ],
        ]),
        const SizedBox(height: AppSpacing.lg),
        if (_isServerTab) ...[
          AppButton(
            label: _t('chat.profileEditor.saveServerProfile'),
            loading: _saving,
            onPressed: _serverId == null ? null : _saveServerProfile,
          ),
          const SizedBox(height: AppSpacing.sm),
          AppButton(
            label: _t('chat.profileEditor.saveServerNick'),
            variant: AppButtonVariant.secondary,
            loading: _saving,
            onPressed: _serverId == null ? null : _saveServerNick,
          ),
        ] else
          AppButton(
            label: _t('chat.profileEditor.saveMain'),
            loading: _saving,
            onPressed: _saveMain,
          ),
        const SizedBox(height: AppSpacing.md),
      ],
    );
  }

  Widget _tabChips(BuildContext context) {
    final c = context.chrome;
    Widget chip(String id, String label) {
      final active = _tab == id;
      return Expanded(
        child: Material(
          color: active ? c.accentSoft : c.surface,
          borderRadius: AppRadii.mdAll,
          child: InkWell(
            onTap: () => setState(() => _tab = id),
            borderRadius: AppRadii.mdAll,
            child: Container(
              padding: const EdgeInsets.symmetric(vertical: AppSpacing.md),
              alignment: Alignment.center,
              decoration: BoxDecoration(
                borderRadius: AppRadii.mdAll,
                border: Border.all(
                  color: active ? c.accent : c.border,
                  width: active ? 1.5 : 1,
                ),
              ),
              child: Text(
                label,
                style: TextStyle(
                  color: active ? c.accent : c.text,
                  fontWeight: FontWeight.w700,
                  fontSize: 13,
                ),
              ),
            ),
          ),
        ),
      );
    }

    return Row(
      children: [
        chip('main', _t('settings.profile.main')),
        const SizedBox(width: AppSpacing.sm),
        chip('server', _t('settings.profile.server')),
      ],
    );
  }

  Widget _boostPromo(BuildContext context) {
    final c = context.chrome;
    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: AppRadii.lgAll,
        border: Border.all(color: c.accent.withValues(alpha: 0.35)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            _boostUnlocked
                ? _t('chat.profileEditor.boostPromoTitleActive')
                : _t('chat.profileEditor.boostPromoTitleDemo'),
            style: TextStyle(
              color: c.text,
              fontWeight: FontWeight.w800,
              fontSize: 14,
            ),
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(
            _boostUnlocked
                ? _t('chat.profileEditor.boostPromoDescActive')
                : _t('chat.profileEditor.boostPromoDescDemo'),
            style: TextStyle(color: c.textMuted, fontSize: 12, height: 1.4),
          ),
          const SizedBox(height: AppSpacing.sm),
          AppButton(
            label: _boostUnlocked
                ? _t('chat.profileEditor.boostPromoCtaActive')
                : _t('chat.profileEditor.boostPromoCtaDemo'),
            variant: AppButtonVariant.outline,
            onPressed: _openNameStyle,
          ),
        ],
      ),
    );
  }

  Widget _previewCard(BuildContext context) {
    final c = context.chrome;
    final banner = _effectiveBannerImage;
    final bannerColor = _parseColor(_effectiveBannerHex);
    final un = _usernameCtrl.text.trim();
    final pr = _pronounsCtrl.text.trim();
    final sub = [if (un.isNotEmpty) un, if (pr.isNotEmpty) pr].join(' • ');

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _sectionTitle(_t('chat.profileEditor.previewTitle')),
        Container(
          decoration: BoxDecoration(
            color: c.surface,
            borderRadius: AppRadii.lgAll,
            border: Border.all(color: c.border),
          ),
          clipBehavior: Clip.antiAlias,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              SizedBox(
                height: 88,
                child: banner != null && banner.isNotEmpty
                    ? Image.network(banner, fit: BoxFit.cover)
                    : ColoredBox(color: bannerColor),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Transform.translate(
                      offset: const Offset(0, -18),
                      child: CircleAvatar(
                        radius: 28,
                        backgroundImage: NetworkImage(_effectiveAvatar),
                      ),
                    ),
                    const SizedBox(width: AppSpacing.sm),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          DisplayNameStyledText(
                            text: _previewName,
                            style: _effectiveNameStyle,
                            fontSize: 16,
                          ),
                          if (sub.isNotEmpty)
                            Text(
                              sub,
                              style: TextStyle(color: c.textMuted, fontSize: 12),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _bannerSwatch(BuildContext context) {
    final selected = _effectiveBannerHex.toLowerCase();
    return Wrap(
      spacing: AppSpacing.sm,
      runSpacing: AppSpacing.sm,
      children: _bannerPresets.map((hex) {
        final active = hex.toLowerCase() == selected &&
            (_effectiveBannerImage == null || _effectiveBannerImage!.isEmpty);
        return GestureDetector(
          onTap: () => _setBannerColor(hex),
          child: Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: _parseColor(hex),
              borderRadius: AppRadii.smAll,
              border: Border.all(
                color: active ? context.chrome.accent : Colors.transparent,
                width: 2.5,
              ),
            ),
          ),
        );
      }).toList(),
    );
  }

  Widget _card(BuildContext context, List<Widget> children) {
    final c = context.chrome;
    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: AppRadii.lgAll,
        border: Border.all(color: c.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: children,
      ),
    );
  }

  Widget _labeledField(
    BuildContext context,
    String label,
    TextEditingController ctrl, {
    String? hint,
    bool enabled = true,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _sectionTitle(label),
        TextField(
          controller: ctrl,
          enabled: enabled,
          style: TextStyle(color: context.chrome.text),
          decoration: _inputDec(context, hint ?? label),
        ),
      ],
    );
  }

  Widget _sectionTitle(String text) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: Text(
        text.toUpperCase(),
        style: TextStyle(
          color: context.chrome.textMuted,
          fontSize: 11,
          fontWeight: FontWeight.w800,
          letterSpacing: 0.4,
        ),
      ),
    );
  }

  Widget _hint(String text) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: Text(
        text,
        style: TextStyle(
          color: context.chrome.textMuted,
          fontSize: 12,
          height: 1.4,
        ),
      ),
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
        borderRadius: AppRadii.mdAll,
        borderSide: BorderSide.none,
      ),
      contentPadding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.md,
        vertical: AppSpacing.md,
      ),
    );
  }

  Color _parseColor(String hex) {
    final h = hex.replaceFirst('#', '');
    return Color(int.parse('FF$h', radix: 16));
  }
}
