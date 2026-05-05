import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import 'models/server_models.dart';
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
  static const Color _pageColor = Color(0xFF08183A);
  static const Color _fieldFill = Color(0xFF152A52);

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
        const SnackBar(content: Text('Đã cập nhật biểu tượng (nhấn Lưu để gửi máy chủ)')),
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
        const SnackBar(content: Text('Đã chọn ảnh biểu ngữ (nhấn Lưu để gửi máy chủ)')),
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
        const SnackBar(content: Text('Tên máy chủ không được để trống')),
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
        const SnackBar(content: Text('Đã lưu thay đổi')),
      );
      Navigator.of(context).pop(updated);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Không lưu được: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  InputDecoration _dec(String hint) => InputDecoration(
        hintText: hint,
        hintStyle: const TextStyle(color: Color(0xFF8EA3CC)),
        filled: true,
        fillColor: _fieldFill,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
      );

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
    required String label,
    required VoidCallback? onPressed,
    bool loading = false,
  }) {
    return FilledButton(
      onPressed: loading ? null : onPressed,
      style: FilledButton.styleFrom(
        backgroundColor: const Color(0xFF5865F2),
        foregroundColor: Colors.white,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      ),
      child: loading
          ? const SizedBox(
              width: 20,
              height: 20,
              child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
            )
          : Text(label, textAlign: TextAlign.center),
    );
  }

  Widget _dangerButton({
    required String label,
    required VoidCallback? onPressed,
  }) {
    return OutlinedButton(
      onPressed: onPressed,
      style: OutlinedButton.styleFrom(
        foregroundColor: const Color(0xFFFF6B7A),
        side: const BorderSide(color: Color(0xFFFF6B7A)),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      ),
      child: Text(label, textAlign: TextAlign.center),
    );
  }

  Widget _sectionLabel(String t) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Text(
          t,
          style: const TextStyle(
            color: Color(0xFF8EA3CC),
            fontWeight: FontWeight.w800,
            fontSize: 12,
            letterSpacing: 0.6,
          ),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final pad = MediaQuery.paddingOf(context);
    final w = MediaQuery.sizeOf(context).width;
    final hPad = w > 520 ? 24.0 : 16.0;

    return Scaffold(
      backgroundColor: _pageColor,
      appBar: AppBar(
        backgroundColor: _pageColor,
        elevation: 0,
        title: const Text(
          'Hồ sơ máy chủ',
          style: TextStyle(fontWeight: FontWeight.w800),
        ),
        actions: [
          if (!_loading && _canEdit)
            TextButton(
              onPressed: _saving ? null : _save,
              child: _saving
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text(
                      'Lưu',
                      style: TextStyle(
                        color: Color(0xFF7FB6FF),
                        fontWeight: FontWeight.w800,
                      ),
                    ),
            ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _loadError != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text(
                      _loadError!,
                      textAlign: TextAlign.center,
                      style: const TextStyle(color: Color(0xFFAFC0E2)),
                    ),
                  ),
                )
              : LayoutBuilder(
                  builder: (context, constraints) {
                    return ListView(
                      padding: EdgeInsets.fromLTRB(hPad, 12, hPad, pad.bottom + 32),
                      children: [
                        _previewCard(w),
                        const SizedBox(height: 16),
                        if (_stats != null)
                          Container(
                            width: double.infinity,
                            padding: const EdgeInsets.all(14),
                            decoration: BoxDecoration(
                              color: _fieldFill,
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Text(
                              'Trực tuyến: ${_stats!['onlineCount'] ?? 0} | '
                              'Thành viên: ${_stats!['memberCount'] ?? 0} | '
                              'Ngày thành lập: ${_formatStatDate(_stats!['createdAt'])}',
                              style: const TextStyle(
                                color: Color(0xFF8EA3CC),
                                fontSize: 13,
                              ),
                            ),
                          ),
                        if (_stats != null) const SizedBox(height: 16),
                        _sectionLabel('TÊN'),
                        TextField(
                          controller: _nameCtrl,
                          readOnly: !_canEdit,
                          style: const TextStyle(color: Colors.white),
                          decoration: _dec('Tên máy chủ'),
                          onChanged: (_) => setState(() {}),
                        ),
                        const SizedBox(height: 20),
                        _sectionLabel('BIỂU TƯỢNG'),
                        LayoutBuilder(
                          builder: (context, c) {
                            final narrow = c.maxWidth < 360;
                            if (narrow) {
                              return Column(
                                crossAxisAlignment: CrossAxisAlignment.stretch,
                                children: [
                                  _primaryButton(
                                    label: 'Thay đổi biểu tượng máy chủ',
                                    onPressed: _canEdit ? _pickAvatar : null,
                                    loading: _uploadingAvatar,
                                  ),
                                  const SizedBox(height: 10),
                                  _dangerButton(
                                    label: 'Xóa biểu tượng',
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
                                    label: 'Thay đổi biểu tượng máy chủ',
                                    onPressed: _canEdit ? _pickAvatar : null,
                                    loading: _uploadingAvatar,
                                  ),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: _dangerButton(
                                    label: 'Xóa biểu tượng',
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
                        _sectionLabel('BIỂU NGỮ'),
                        const Text(
                          'Chọn màu nền cho card (khám phá, lời mời, đơn đăng ký). '
                          'Có thể thêm ảnh — ảnh được tối ưu khi tải lên trên web.',
                          style: TextStyle(color: Color(0xFF8EA3CC), fontSize: 13, height: 1.4),
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
                                    label: 'Tải ảnh biểu ngữ',
                                    onPressed: _canEdit ? _pickBanner : null,
                                    loading: _uploadingBanner,
                                  ),
                                  const SizedBox(height: 10),
                                  _dangerButton(
                                    label: 'Xóa ảnh biểu ngữ',
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
                                    label: 'Tải ảnh biểu ngữ',
                                    onPressed: _canEdit ? _pickBanner : null,
                                    loading: _uploadingBanner,
                                  ),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: _dangerButton(
                                    label: 'Xóa ảnh biểu ngữ',
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
                          style: const TextStyle(
                            color: Color(0xFF6B7A99),
                            fontSize: 12,
                          ),
                        ),
                        const SizedBox(height: 20),
                        const Text(
                          'ĐẶC ĐIỂM',
                          style: TextStyle(
                            color: Color(0xFF8EA3CC),
                            fontWeight: FontWeight.w800,
                            fontSize: 12,
                            letterSpacing: 0.6,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          '$_traitsFilled/5 đặc điểm đã điền',
                          style: const TextStyle(color: Color(0xFF8EA3CC), fontSize: 12),
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
                                  style: const TextStyle(color: Colors.white),
                                  decoration: _dec('🙂').copyWith(counterText: ''),
                                  onChanged: (_) => setState(() {}),
                                ),
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: TextField(
                                  controller: _traitTextCtrls[i],
                                  readOnly: !_canEdit,
                                  style: const TextStyle(color: Colors.white),
                                  decoration: _dec('Đặc điểm…'),
                                  onChanged: (_) => setState(() {}),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 8),
                        ],
                        const SizedBox(height: 12),
                        const Text(
                          'MÔ TẢ',
                          style: TextStyle(
                            color: Color(0xFF8EA3CC),
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
                          style: const TextStyle(color: Colors.white),
                          decoration: _dec(
                            'Hãy giới thiệu một chút về máy chủ này với thế giới.',
                          ),
                        ),
                        if (!_canEdit) ...[
                          const SizedBox(height: 20),
                          const Text(
                            'Bạn không có quyền chỉnh sửa hồ sơ máy chủ.',
                            style: TextStyle(color: Color(0xFFFFB4B4), fontSize: 13),
                          ),
                        ],
                      ],
                    );
                  },
                ),
    );
  }

  Widget _previewCard(double screenW) {
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
        color: _fieldFill,
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
                            color: const Color(0xFF1A2238),
                            alignment: Alignment.center,
                            child: const Icon(Icons.image_not_supported_outlined,
                                color: Color(0xFF8EA3CC)),
                          ),
                        )
                      : Container(
                          color: kBannerPreviewFallback,
                          alignment: Alignment.center,
                          child: const Icon(
                            Icons.image_outlined,
                            color: Color(0xFF4A5568),
                            size: 40,
                          ),
                        ),
                ),
                Positioned(
                  left: 14,
                  bottom: -26,
                  child: CircleAvatar(
                    radius: 34,
                    backgroundColor: const Color(0xFF152A52),
                    backgroundImage:
                        avatarUrl.isNotEmpty ? NetworkImage(avatarUrl) : null,
                    child: avatarUrl.isEmpty
                        ? Text(
                            name.isNotEmpty ? name[0].toUpperCase() : '?',
                            style: const TextStyle(
                              color: Colors.white,
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
                  style: const TextStyle(
                    color: Colors.white,
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
                        ? const Color(0xFF6B7A99)
                        : const Color(0xFFB8C8E8),
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
