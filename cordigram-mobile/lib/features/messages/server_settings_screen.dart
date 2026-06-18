import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/services/language_controller.dart';
import 'models/server_models.dart';
import 'server_settings/server_settings_ui.dart';
import 'services/messages_media_service.dart';
import 'services/servers_service.dart';

/// Hồ sơ máy chủ — cùng API web `ServerProfileSection` (PATCH `/servers/:id`).
class ServerSettingsScreen extends StatefulWidget {
  const ServerSettingsScreen({
    super.key,
    required this.serverId,
    required this.initialSummary,
    this.canManageSettings = true,
  });

  final String serverId;
  final ServerSummary initialSummary;
  final bool canManageSettings;

  @override
  State<ServerSettingsScreen> createState() => _ServerSettingsScreenState();
}

/// Mặc định nền biểu ngữ khi không có ảnh (đồng bộ web `DEFAULT_BANNER_COLOR`).
const String kDefaultBannerColor =
    'linear-gradient(180deg, #1f2127 0%, #090b10 100%)';

/// Màu preview gần đúng khi không có ảnh biểu ngữ (Flutter không vẽ CSS gradient).
const Color kBannerPreviewFallback = Color(0xFF1A1D24);

class _ServerSettingsScreenState extends State<ServerSettingsScreen> {
  final _nameCtrl = TextEditingController();
  final _descCtrl = TextEditingController();
  final List<TextEditingController> _traitEmojiCtrls = [];
  final List<TextEditingController> _traitTextCtrls = [];

  String _avatarUrl = '';
  String _bannerImageUrl = '';
  String _bannerColor = kDefaultBannerColor;

  bool _loading = true;
  bool _saving = false;
  bool _uploadingAvatar = false;
  bool _uploadingBanner = false;
  String? _loadError;
  Map<String, dynamic>? _stats;

  bool get _canEdit => widget.canManageSettings;

  String _t(String key, [Map<String, dynamic>? vars]) =>
      LanguageController.instance.t(key, vars);

  @override
  void initState() {
    super.initState();
    for (var i = 0; i < 5; i++) {
      _traitEmojiCtrls.add(TextEditingController(text: '🙂'));
      _traitTextCtrls.add(TextEditingController());
    }
    _bootstrap();
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _descCtrl.dispose();
    for (final c in _traitEmojiCtrls) {
      c.dispose();
    }
    for (final c in _traitTextCtrls) {
      c.dispose();
    }
    super.dispose();
  }

  void _syncBannerFromJson(Map<String, dynamic> json) {
    final explicit = json['bannerImageUrl']?.toString().trim() ?? '';
    if (explicit.isNotEmpty) {
      _bannerImageUrl = explicit;
    } else {
      final legacy = json['bannerUrl']?.toString().trim() ?? '';
      if (legacy.startsWith('http://') || legacy.startsWith('https://')) {
        _bannerImageUrl = legacy;
      } else {
        _bannerImageUrl = '';
      }
    }
    final bc = json['bannerColor']?.toString().trim() ?? '';
    _bannerColor = bc.isNotEmpty ? bc : kDefaultBannerColor;
  }

  Future<void> _bootstrap() async {
    _nameCtrl.text = widget.initialSummary.name;
    _descCtrl.text = widget.initialSummary.description ?? '';
    _avatarUrl = widget.initialSummary.avatarUrl ?? '';
    try {
      final raw = await ServersService.getServerById(widget.serverId);
      if (!mounted) return;
      Map<String, dynamic> doc = Map<String, dynamic>.from(raw);
      final inner = doc['server'] ?? doc['data'];
      if (inner is Map) {
        doc = Map<String, dynamic>.from(inner as Map);
      }
      _applyServerMap(doc);

      try {
        final st = await ServersService.getServerProfileStats(widget.serverId);
        if (mounted) setState(() => _stats = Map<String, dynamic>.from(st));
      } catch (_) {
        if (mounted) setState(() => _stats = null);
      }
    } catch (e) {
      if (mounted) setState(() => _loadError = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _applyServerMap(Map<String, dynamic> json) {
    _nameCtrl.text = (json['name'] ?? widget.initialSummary.name).toString();
    _descCtrl.text = json['description']?.toString() ?? '';
    _avatarUrl = json['avatarUrl']?.toString() ?? '';
    _syncBannerFromJson(json);
    final traits = json['profileTraits'];
    if (traits is List) {
      for (var i = 0; i < 5; i++) {
        if (i < traits.length && traits[i] is Map) {
          final m = Map<String, dynamic>.from(traits[i] as Map);
          _traitEmojiCtrls[i].text = (m['emoji'] ?? '🙂').toString();
          _traitTextCtrls[i].text = (m['text'] ?? '').toString();
        } else {
          _traitEmojiCtrls[i].text = '🙂';
          _traitTextCtrls[i].text = '';
        }
      }
    }
    setState(() {});
  }

  int get _traitsFilled {
    var n = 0;
    for (final c in _traitTextCtrls) {
      if (c.text.trim().isNotEmpty) n++;
    }
    return n;
  }

  List<Map<String, String>> _traitsPayload() {
    final out = <Map<String, String>>[];
    for (var i = 0; i < 5; i++) {
      final text = _traitTextCtrls[i].text.trim();
      if (text.isEmpty) continue;
      var emoji = _traitEmojiCtrls[i].text.trim();
      if (emoji.isEmpty) emoji = '🙂';
      out.add({'emoji': emoji, 'text': text});
    }
    return out.length > 5 ? out.sublist(0, 5) : out;
  }

  Future<void> _pickAvatar() async {
    if (!_canEdit || _uploadingAvatar) return;
    final picker = ImagePicker();
    final x = await picker.pickImage(source: ImageSource.gallery);
    if (x == null || !mounted) return;
    setState(() => _uploadingAvatar = true);
    try {
      final path = x.path;
      final ct = MessagesMediaService.resolveUploadContentType(
        filePath: path,
        hintedContentType: x.mimeType,
      );
      final up = await MessagesMediaService.uploadFile(
        filePath: path,
        contentType: ct,
      );
      final url = MessagesMediaService.pickDisplayUrl(up);
      if (url.isEmpty) throw Exception('Không lấy được URL sau khi tải lên');
      if (!mounted) return;
      setState(() => _avatarUrl = url);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(_t('server.iconUpdated'))),
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
      }
    } finally {
      if (mounted) setState(() => _uploadingAvatar = false);
    }
  }

  void _removeAvatar() {
    if (!_canEdit) return;
    setState(() => _avatarUrl = '');
  }

  Future<void> _pickBanner() async {
    if (!_canEdit || _uploadingBanner) return;
    final picker = ImagePicker();
    final x = await picker.pickImage(source: ImageSource.gallery);
    if (x == null || !mounted) return;
    setState(() => _uploadingBanner = true);
    try {
      final path = x.path;
      final ct = MessagesMediaService.resolveUploadContentType(
        filePath: path,
        hintedContentType: x.mimeType,
      );
      if (ct != 'image/jpeg' &&
          ct != 'image/png' &&
          ct != 'image/webp' &&
          ct != 'image/gif') {
        throw Exception('Chọn ảnh JPEG, PNG, WebP hoặc GIF');
      }
      final up = await MessagesMediaService.uploadFile(
        filePath: path,
        contentType: ct,
      );
      final url = MessagesMediaService.pickDisplayUrl(up);
      if (url.isEmpty) throw Exception('Không lấy được URL sau khi tải lên');
      if (!mounted) return;
      setState(() => _bannerImageUrl = url);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(_t('server.bannerSelected'))),
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
      }
    } finally {
      if (mounted) setState(() => _uploadingBanner = false);
    }
  }

  void _removeBanner() {
    if (!_canEdit || _bannerImageUrl.isEmpty) return;
    setState(() => _bannerImageUrl = '');
  }

  Future<void> _save() async {
    if (!_canEdit) return;
    final name = _nameCtrl.text.trim();
    if (name.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(_t('server.nameRequired'))),
      );
      return;
    }
    final img = _bannerImageUrl.trim();
    final color =
        _bannerColor.trim().isEmpty ? kDefaultBannerColor : _bannerColor.trim();
    final legacyBanner = img.isNotEmpty ? img : color;

    setState(() => _saving = true);
    try {
      final raw = await ServersService.updateServer(
        serverId: widget.serverId,
        name: name,
        description: _descCtrl.text.trim().isEmpty
            ? null
            : _descCtrl.text.trim(),
        avatarUrl: _avatarUrl.trim().isEmpty ? null : _avatarUrl.trim(),
        bannerUrl: legacyBanner,
        bannerImageUrl: img.isEmpty ? null : img,
        bannerColor: color,
        profileTraits: _traitsPayload(),
      );
      if (!mounted) return;
      Map<String, dynamic> m = Map<String, dynamic>.from(raw);
      final inner = m['server'] ?? m['data'];
      if (inner is Map) {
        m = Map<String, dynamic>.from(inner as Map);
      }
      final updated = ServerSummary.fromJson(m);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(_t('server.changesSaved'))),
      );
      Navigator.of(context).pop(updated);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(LanguageController.instance.t('server.settings.failedSave'))),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  InputDecoration _dec(ServerSettingsUi ui, String hint) =>
      ui.fieldDecoration(hintText: hint);

  String _formatStatDate(dynamic v) {
    if (v == null) return '—';
    final s = v.toString();
    try {
      final d = DateTime.parse(s).toLocal();
      return '${d.day}/${d.month}/${d.year}';
    } catch (_) {
      return s;
    }
  }

  Widget _primaryButton({
    required ServerSettingsUi ui,
    required String label,
    required VoidCallback? onPressed,
    bool loading = false,
  }) {
    return FilledButton(
      onPressed: loading ? null : onPressed,
      style: FilledButton.styleFrom(
        backgroundColor: ui.accent,
        foregroundColor: ui.onAccent,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      ),
      child: loading
          ? SizedBox(
              width: 20,
              height: 20,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                color: ui.onAccent,
              ),
            )
          : Text(label, textAlign: TextAlign.center),
    );
  }

  Widget _dangerButton({
    required ServerSettingsUi ui,
    required String label,
    required VoidCallback? onPressed,
  }) {
    return OutlinedButton(
      onPressed: onPressed,
      style: OutlinedButton.styleFrom(
        foregroundColor: ui.destructive,
        side: BorderSide(color: ui.destructive),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      ),
      child: Text(label, textAlign: TextAlign.center),
    );
  }

  Widget _sectionLabel(ServerSettingsUi ui, String t) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Text(
          t,
          style: TextStyle(
            color: ui.textMuted,
            fontWeight: FontWeight.w800,
            fontSize: 12,
            letterSpacing: 0.6,
          ),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final ui = ServerSettingsUi.of(context);
    final pad = MediaQuery.paddingOf(context);
    final w = MediaQuery.sizeOf(context).width;
    final hPad = w > 520 ? 24.0 : 16.0;

    return Scaffold(
      backgroundColor: ui.bg,
      appBar: ui.buildAppBar(
        title: 'Hồ sơ máy chủ',
        actions: [
          if (!_loading && _canEdit)
            TextButton(
              onPressed: _saving ? null : _save,
              child: _saving
                  ? SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: ui.accent,
                      ),
                    )
                  : Text(
                      'Lưu',
                      style: TextStyle(
                        color: ui.accent,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
            ),
        ],
      ),
      body: _loading
          ? Center(child: CircularProgressIndicator(color: ui.accent))
          : _loadError != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text(
                      _loadError!,
                      textAlign: TextAlign.center,
                      style: TextStyle(color: ui.textMuted),
                    ),
                  ),
                )
              : LayoutBuilder(
                  builder: (context, constraints) {
                    return ListView(
                      padding: EdgeInsets.fromLTRB(hPad, 12, hPad, pad.bottom + 32),
                      children: [
                        _previewCard(ui, w),
                        const SizedBox(height: 16),
                        if (_stats != null)
                          Container(
                            width: double.infinity,
                            padding: const EdgeInsets.all(14),
                            decoration: BoxDecoration(
                              color: ui.fieldFill,
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Text(
                              'Thành viên: ${_stats!['memberCount'] ?? 0} | '
                              'Ngày thành lập: ${_formatStatDate(_stats!['createdAt'])}',
                              style: TextStyle(
                                color: ui.textMuted,
                                fontSize: 13,
                              ),
                            ),
                          ),
                        if (_stats != null) const SizedBox(height: 16),
                        _sectionLabel(ui, 'TÊN'),
                        TextField(
                          controller: _nameCtrl,
                          readOnly: !_canEdit,
                          style: TextStyle(color: ui.text),
                          decoration: _dec(ui, 'Tên máy chủ'),
                          onChanged: (_) => setState(() {}),
                        ),
                        const SizedBox(height: 20),
                        _sectionLabel(ui, 'BIỂU TƯỢNG'),
                        LayoutBuilder(
                          builder: (context, c) {
                            final narrow = c.maxWidth < 360;
                            if (narrow) {
                              return Column(
                                crossAxisAlignment: CrossAxisAlignment.stretch,
                                children: [
                                  _primaryButton(
                                    ui: ui,
                                    label: LanguageController.instance.t('server.settings.changeIcon'),
                                    onPressed: _canEdit ? _pickAvatar : null,
                                    loading: _uploadingAvatar,
                                  ),
                                  const SizedBox(height: 10),
                                  _dangerButton(
                                    ui: ui,
                                    label: LanguageController.instance.t('server.settings.removeIcon'),
                                    onPressed: _canEdit && _avatarUrl.isNotEmpty
                                        ? _removeAvatar
                                        : null,
                                  ),
                                ],
                              );
                            }
                            return Row(
                              children: [
                                Expanded(
                                  child: _primaryButton(
                                    ui: ui,
                                    label: LanguageController.instance.t('server.settings.changeIcon'),
                                    onPressed: _canEdit ? _pickAvatar : null,
                                    loading: _uploadingAvatar,
                                  ),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: _dangerButton(
                                    ui: ui,
                                    label: LanguageController.instance.t('server.settings.removeIcon'),
                                    onPressed: _canEdit && _avatarUrl.isNotEmpty
                                        ? _removeAvatar
                                        : null,
                                  ),
                                ),
                              ],
                            );
                          },
                        ),
                        const SizedBox(height: 20),
                        _sectionLabel(ui, 'BIỂU NGỮ'),
                        Text(
                          'Chọn màu nền cho card (khám phá, lời mời, đơn đăng ký). '
                          'Có thể thêm ảnh — ảnh được tối ưu khi tải lên trên web.',
                          style: TextStyle(
                            color: ui.textMuted,
                            fontSize: 13,
                            height: 1.4,
                          ),
                        ),
                        const SizedBox(height: 12),
                        LayoutBuilder(
                          builder: (context, c) {
                            final narrow = c.maxWidth < 360;
                            if (narrow) {
                              return Column(
                                crossAxisAlignment: CrossAxisAlignment.stretch,
                                children: [
                                  _primaryButton(
                                    ui: ui,
                                    label: LanguageController.instance.t('server.settings.uploadBanner'),
                                    onPressed: _canEdit ? _pickBanner : null,
                                    loading: _uploadingBanner,
                                  ),
                                  const SizedBox(height: 10),
                                  _dangerButton(
                                    ui: ui,
                                    label: LanguageController.instance.t('server.settings.removeBanner'),
                                    onPressed: _canEdit &&
                                            _bannerImageUrl.isNotEmpty
                                        ? _removeBanner
                                        : null,
                                  ),
                                ],
                              );
                            }
                            return Row(
                              children: [
                                Expanded(
                                  child: _primaryButton(
                                    ui: ui,
                                    label: LanguageController.instance.t('server.settings.uploadBanner'),
                                    onPressed: _canEdit ? _pickBanner : null,
                                    loading: _uploadingBanner,
                                  ),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: _dangerButton(
                                    ui: ui,
                                    label: LanguageController.instance.t('server.settings.removeBanner'),
                                    onPressed: _canEdit &&
                                            _bannerImageUrl.isNotEmpty
                                        ? _removeBanner
                                        : null,
                                  ),
                                ),
                              ],
                            );
                          },
                        ),
                        const SizedBox(height: 8),
                        Text(
                          _bannerImageUrl.isEmpty
                              ? 'Nền mặc định từ máy chủ được giữ khi không có ảnh.'
                              : 'Ảnh biểu ngữ sẽ được lưu khi bạn nhấn Lưu.',
                          style: TextStyle(
                            color: ui.textMuted.withValues(alpha: 0.85),
                            fontSize: 12,
                          ),
                        ),
                        const SizedBox(height: 20),
                        Text(
                          'ĐẶC ĐIỂM',
                          style: TextStyle(
                            color: ui.textMuted,
                            fontWeight: FontWeight.w800,
                            fontSize: 12,
                            letterSpacing: 0.6,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          '$_traitsFilled/5 đặc điểm đã điền',
                          style: TextStyle(color: ui.textMuted, fontSize: 12),
                        ),
                        const SizedBox(height: 10),
                        for (var i = 0; i < 5; i++) ...[
                          Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              SizedBox(
                                width: w > 400 ? 56 : 48,
                                child: TextField(
                                  controller: _traitEmojiCtrls[i],
                                  readOnly: !_canEdit,
                                  maxLength: 8,
                                  style: TextStyle(color: ui.text),
                                  decoration: _dec(ui, '🙂').copyWith(counterText: ''),
                                  onChanged: (_) => setState(() {}),
                                ),
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: TextField(
                                  controller: _traitTextCtrls[i],
                                  readOnly: !_canEdit,
                                  style: TextStyle(color: ui.text),
                                  decoration: _dec(ui, 'Đặc điểm…'),
                                  onChanged: (_) => setState(() {}),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 8),
                        ],
                        const SizedBox(height: 12),
                        Text(
                          'MÔ TẢ',
                          style: TextStyle(
                            color: ui.textMuted,
                            fontWeight: FontWeight.w800,
                            fontSize: 12,
                            letterSpacing: 0.6,
                          ),
                        ),
                        const SizedBox(height: 8),
                        TextField(
                          controller: _descCtrl,
                          readOnly: !_canEdit,
                          minLines: 3,
                          maxLines: 8,
                          style: TextStyle(color: ui.text),
                          decoration: _dec(
                            ui,
                            'Hãy giới thiệu một chút về máy chủ này với thế giới.',
                          ),
                        ),
                        if (!_canEdit) ...[
                          const SizedBox(height: 20),
                          Text(
                            'Bạn không có quyền chỉnh sửa hồ sơ máy chủ.',
                            style: TextStyle(
                              color: ui.destructive.withValues(alpha: 0.85),
                              fontSize: 13,
                            ),
                          ),
                        ],
                      ],
                    );
                  },
                ),
    );
  }

  Widget _previewCard(ServerSettingsUi ui, double screenW) {
    final bannerUrl = _bannerImageUrl.trim();
    final avatarUrl = _avatarUrl.trim();
    final name = _nameCtrl.text.trim().isEmpty
        ? widget.initialSummary.name
        : _nameCtrl.text.trim();
    final desc = _descCtrl.text.trim();

    final bannerH = screenW > 600 ? 120.0 : 100.0;

    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: ui.fieldFill,
        borderRadius: BorderRadius.circular(14),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SizedBox(
            height: bannerH,
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                Positioned.fill(
                  child: bannerUrl.isNotEmpty
                      ? Image.network(
                          bannerUrl,
                          fit: BoxFit.cover,
                          errorBuilder: (_, __, ___) => Container(
                            color: kBannerPreviewFallback,
                            alignment: Alignment.center,
                            child: Icon(
                              Icons.image_not_supported_outlined,
                              color: ui.textMuted,
                            ),
                          ),
                        )
                      : Container(
                          color: kBannerPreviewFallback,
                          alignment: Alignment.center,
                          child: Icon(
                            Icons.image_outlined,
                            color: ui.textMuted.withValues(alpha: 0.6),
                            size: 40,
                          ),
                        ),
                ),
                Positioned(
                  left: 14,
                  bottom: -26,
                  child: CircleAvatar(
                    radius: 34,
                    backgroundColor: ui.fieldFill,
                    backgroundImage:
                        avatarUrl.isNotEmpty ? NetworkImage(avatarUrl) : null,
                    child: avatarUrl.isEmpty
                        ? Text(
                            name.isNotEmpty ? name[0].toUpperCase() : '?',
                            style: TextStyle(
                              color: ui.text,
                              fontWeight: FontWeight.w800,
                              fontSize: 22,
                            ),
                          )
                        : null,
                  ),
                ),
              ],
            ),
          ),
          SizedBox(height: bannerH > 110 ? 36 : 32),
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name,
                  style: TextStyle(
                    color: ui.text,
                    fontWeight: FontWeight.w800,
                    fontSize: 18,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  desc.isEmpty ? 'Chưa có mô tả' : desc,
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: desc.isEmpty
                        ? ui.textMuted.withValues(alpha: 0.85)
                        : ui.textMuted,
                    fontSize: 13,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
