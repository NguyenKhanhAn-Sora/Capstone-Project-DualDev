import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/config/app_config.dart';
import 'models/server_models.dart';
import 'services/servers_service.dart';

/// Tạo sự kiện — POST `/servers/:serverId/events` (cùng body như web `CreateEventWizard`).
class CreateServerEventScreen extends StatefulWidget {
  const CreateServerEventScreen({
    super.key,
    required this.serverId,
    required this.textChannels,
    required this.voiceChannels,
  });

  final String serverId;
  final List<ServerChannel> textChannels;
  final List<ServerChannel> voiceChannels;

  @override
  State<CreateServerEventScreen> createState() =>
      _CreateServerEventScreenState();
}

class _CreateServerEventScreenState extends State<CreateServerEventScreen> {
  static const Color _pageColor = Color(0xFF08183A);
  static const Color _fieldFill = Color(0xFF152A52);

  final PageController _pageCtrl = PageController();
  int _step = 0;

  String _locationType = 'voice';
  String _channelId = '';
  final _topicCtrl = TextEditingController();
  final _descCtrl = TextEditingController();
  final _coverCtrl = TextEditingController();

  DateTime _start = DateTime.now().add(const Duration(hours: 1));
  DateTime _end = DateTime.now().add(const Duration(hours: 2));
  String _frequency = 'none';

  bool _submitting = false;

  static const _freqLabels = <String, String>{
    'none': 'Không lặp lại',
    'weekly': 'Hàng tuần',
    'biweekly': 'Hai tuần một lần',
    'monthly': 'Hàng tháng',
    'yearly': 'Hàng năm',
  };

  List<ServerChannel> get _channelsForLocation =>
      _locationType == 'voice' ? widget.voiceChannels : widget.textChannels;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _syncDefaultChannel());
  }

  void _syncDefaultChannel() {
    final list = _channelsForLocation;
    if (list.isEmpty) {
      setState(() => _channelId = '');
      return;
    }
    if (_channelId.isEmpty || !list.any((c) => c.id == _channelId)) {
      setState(() => _channelId = list.first.id);
    }
  }

  @override
  void dispose() {
    _pageCtrl.dispose();
    _topicCtrl.dispose();
    _descCtrl.dispose();
    _coverCtrl.dispose();
    super.dispose();
  }

  String _isoUtc(DateTime local) => local.toUtc().toIso8601String();

  bool get _endAfterStart =>
      _end.isAfter(_start);

  bool get _canStep1 {
    final list = _channelsForLocation;
    return list.isEmpty || _channelId.isNotEmpty;
  }

  bool get _canStep2 {
    if (_topicCtrl.text.trim().isEmpty) return false;
    if (_locationType == 'other') {
      if (!_endAfterStart) return false;
    }
    return true;
  }

  Future<void> _pickDate({required bool forEnd}) async {
    final initial = forEnd ? _end : _start;
    final d = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime.now().subtract(const Duration(days: 1)),
      lastDate: DateTime.now().add(const Duration(days: 365 * 2)),
    );
    if (d == null || !mounted) return;
    setState(() {
      if (forEnd) {
        _end = DateTime(d.year, d.month, d.day, _end.hour, _end.minute);
      } else {
        _start = DateTime(d.year, d.month, d.day, _start.hour, _start.minute);
      }
    });
  }

  Future<void> _pickTime({required bool forEnd}) async {
    final initial = forEnd ? _end : _start;
    final t = await showTimePicker(
      context: context,
      initialTime: TimeOfDay(hour: initial.hour, minute: initial.minute),
    );
    if (t == null || !mounted) return;
    setState(() {
      if (forEnd) {
        _end = DateTime(_end.year, _end.month, _end.day, t.hour, t.minute);
      } else {
        _start =
            DateTime(_start.year, _start.month, _start.day, t.hour, t.minute);
      }
    });
  }

  Future<void> _submit() async {
    if (!_canStep2 || _submitting) return;
    setState(() => _submitting = true);
    try {
      final raw = await ServersService.createServerEvent(
        serverId: widget.serverId,
        topic: _topicCtrl.text.trim(),
        startAt: _isoUtc(_start),
        frequency: _frequency,
        locationType: _locationType,
        endAt: _locationType == 'other' ? _isoUtc(_end) : null,
        channelId: _channelId.isEmpty ? null : _channelId,
        description:
            _descCtrl.text.trim().isEmpty ? null : _descCtrl.text.trim(),
        coverImageUrl:
            _coverCtrl.text.trim().isEmpty ? null : _coverCtrl.text.trim(),
      );
      if (!mounted) return;
      final id = (raw['_id'] ?? raw['id'] ?? '').toString();
      final share =
          '${AppConfig.webBaseUrl}/events/${widget.serverId}/$id';
      await Clipboard.setData(ClipboardData(text: share));
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            id.isEmpty
                ? 'Đã tạo sự kiện'
                : 'Đã tạo sự kiện — link đã sao chép',
          ),
        ),
      );
      Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Không tạo được: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  InputDecoration _dec(String hint) => InputDecoration(
        hintText: hint,
        hintStyle: const TextStyle(color: Color(0xFF8EA3CC)),
        filled: true,
        fillColor: _fieldFill,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
      );

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _pageColor,
      appBar: AppBar(
        backgroundColor: _pageColor,
        elevation: 0,
        title: const Text(
          'Tạo sự kiện',
          style: TextStyle(fontWeight: FontWeight.w700),
        ),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Row(
              children: [
                _stepChip(0, 'Vị trí'),
                const Icon(Icons.chevron_right, color: Color(0xFF5A6B8C)),
                _stepChip(1, 'Chi tiết'),
                const Icon(Icons.chevron_right, color: Color(0xFF5A6B8C)),
                _stepChip(2, 'Xem lại'),
              ],
            ),
          ),
          Expanded(
            child: PageView(
              controller: _pageCtrl,
              physics: const NeverScrollableScrollPhysics(),
              children: [
                _buildStep1(),
                _buildStep2(),
                _buildStep3(),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _stepChip(int idx, String label) {
    final on = _step == idx;
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 8),
        decoration: BoxDecoration(
          color: on ? const Color(0xFF1E3A6E) : const Color(0xFF121E38),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: on ? const Color(0xFF7FB6FF) : const Color(0xFF2A3F6A),
          ),
        ),
        child: Text(
          label,
          textAlign: TextAlign.center,
          style: TextStyle(
            color: on ? Colors.white : const Color(0xFF8EA3CC),
            fontWeight: on ? FontWeight.w800 : FontWeight.w500,
            fontSize: 12,
          ),
        ),
      ),
    );
  }

  Widget _buildStep1() {
    final list = _channelsForLocation;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text(
          'Sự kiện diễn ra ở đâu?',
          style: TextStyle(
            color: Colors.white,
            fontSize: 18,
            fontWeight: FontWeight.w800,
          ),
        ),
        const SizedBox(height: 12),
        RadioListTile<String>(
          value: 'voice',
          groupValue: _locationType,
          fillColor: WidgetStateProperty.resolveWith(
            (s) => s.contains(WidgetState.selected)
                ? const Color(0xFF00C48C)
                : null,
          ),
          title: const Text(
            'Kênh thoại',
            style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
          ),
          subtitle: const Text(
            'Gọi thoại, chia sẻ màn hình',
            style: TextStyle(color: Color(0xFF8EA3CC), fontSize: 12),
          ),
          onChanged: (v) {
            if (v == null) return;
            setState(() {
              _locationType = v;
              _channelId = '';
            });
            _syncDefaultChannel();
          },
        ),
        RadioListTile<String>(
          value: 'other',
          groupValue: _locationType,
          fillColor: WidgetStateProperty.resolveWith(
            (s) => s.contains(WidgetState.selected)
                ? const Color(0xFF00C48C)
                : null,
          ),
          title: const Text(
            'Một nơi khác',
            style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
          ),
          subtitle: const Text(
            'Kênh chat hoặc địa điểm khác (cần thời kết thúc)',
            style: TextStyle(color: Color(0xFF8EA3CC), fontSize: 12),
          ),
          onChanged: (v) {
            if (v == null) return;
            setState(() {
              _locationType = v;
              _channelId = '';
            });
            _syncDefaultChannel();
          },
        ),
        if (list.isEmpty)
          const Padding(
            padding: EdgeInsets.only(top: 12),
            child: Text(
              'Server chưa có kênh phù hợp. Hãy tạo kênh trong menu máy chủ.',
              style: TextStyle(color: Color(0xFFFFB4B4)),
            ),
          )
        else ...[
          const SizedBox(height: 16),
          const Text(
            'Chọn kênh',
            style: TextStyle(
              color: Color(0xFFAFC0E2),
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 8),
          DropdownButtonFormField<String>(
            value: _channelId.isEmpty ? null : _channelId,
            dropdownColor: const Color(0xFF152A52),
            decoration: _dec('Kênh'),
            style: const TextStyle(color: Colors.white),
            items: list
                .map(
                  (c) => DropdownMenuItem(
                    value: c.id,
                    child: Text(
                      c.isVoice ? '🔊 ${c.name}' : '# ${c.name}',
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                )
                .toList(),
            onChanged: (v) => setState(() => _channelId = v ?? ''),
          ),
        ],
        const SizedBox(height: 28),
        SizedBox(
          width: double.infinity,
          child: FilledButton(
            onPressed: _canStep1
                ? () {
                    setState(() => _step = 1);
                    _pageCtrl.jumpToPage(1);
                  }
                : null,
            style: FilledButton.styleFrom(
              backgroundColor: const Color(0xFF00C48C),
              padding: const EdgeInsets.symmetric(vertical: 14),
            ),
            child: const Text('Tiếp theo'),
          ),
        ),
      ],
    );
  }

  Widget _buildStep2() {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        TextField(
          controller: _topicCtrl,
          style: const TextStyle(color: Colors.white),
          decoration: _dec('Chủ đề sự kiện *'),
        ),
        const SizedBox(height: 12),
        const Text(
          'Bắt đầu',
          style: TextStyle(color: Color(0xFFAFC0E2), fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: 6),
        Row(
          children: [
            Expanded(
              child: OutlinedButton(
                onPressed: () => _pickDate(forEnd: false),
                child: Text(
                  '${_start.year}-${_start.month.toString().padLeft(2, '0')}-${_start.day.toString().padLeft(2, '0')}',
                  style: const TextStyle(color: Colors.white),
                ),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: OutlinedButton(
                onPressed: () => _pickTime(forEnd: false),
                child: Text(
                  '${_start.hour.toString().padLeft(2, '0')}:${_start.minute.toString().padLeft(2, '0')}',
                  style: const TextStyle(color: Colors.white),
                ),
              ),
            ),
          ],
        ),
        if (_locationType == 'other') ...[
          const SizedBox(height: 16),
          const Text(
            'Kết thúc',
            style: TextStyle(
              color: Color(0xFFAFC0E2),
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 6),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: () => _pickDate(forEnd: true),
                  child: Text(
                    '${_end.year}-${_end.month.toString().padLeft(2, '0')}-${_end.day.toString().padLeft(2, '0')}',
                    style: const TextStyle(color: Colors.white),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: OutlinedButton(
                  onPressed: () => _pickTime(forEnd: true),
                  child: Text(
                    '${_end.hour.toString().padLeft(2, '0')}:${_end.minute.toString().padLeft(2, '0')}',
                    style: const TextStyle(color: Colors.white),
                  ),
                ),
              ),
            ],
          ),
          if (!_endAfterStart)
            const Padding(
              padding: EdgeInsets.only(top: 8),
              child: Text(
                'Thời gian kết thúc phải sau thời gian bắt đầu.',
                style: TextStyle(color: Color(0xFFFF8A8A)),
              ),
            ),
        ],
        const SizedBox(height: 16),
        DropdownButtonFormField<String>(
          value: _frequency,
          dropdownColor: const Color(0xFF152A52),
          decoration: _dec('Tần suất'),
          style: const TextStyle(color: Colors.white),
          items: _freqLabels.entries
              .map(
                (e) => DropdownMenuItem(
                  value: e.key,
                  child: Text(e.value),
                ),
              )
              .toList(),
          onChanged: (v) => setState(() => _frequency = v ?? 'none'),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _descCtrl,
          minLines: 2,
          maxLines: 5,
          style: const TextStyle(color: Colors.white),
          decoration: _dec('Mô tả (tuỳ chọn)'),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _coverCtrl,
          style: const TextStyle(color: Colors.white),
          decoration: _dec('URL ảnh bìa (tuỳ chọn)'),
        ),
        const SizedBox(height: 24),
        Row(
          children: [
            TextButton(
              onPressed: () {
                setState(() => _step = 0);
                _pageCtrl.jumpToPage(0);
              },
              child: const Text('Quay lại'),
            ),
            const Spacer(),
            FilledButton(
              onPressed: _canStep2
                  ? () {
                      setState(() => _step = 2);
                      _pageCtrl.jumpToPage(2);
                    }
                  : null,
              style: FilledButton.styleFrom(
                backgroundColor: const Color(0xFF00C48C),
              ),
              child: const Text('Tiếp theo'),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildStep3() {
    final list = _channelsForLocation;
    String? chName;
    for (final c in list) {
      if (c.id == _channelId) {
        chName = c.name;
        break;
      }
    }

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text(
          _topicCtrl.text.trim().isEmpty ? '—' : _topicCtrl.text.trim(),
          style: const TextStyle(
            color: Colors.white,
            fontSize: 20,
            fontWeight: FontWeight.w800,
          ),
        ),
        const SizedBox(height: 12),
        Text(
          'Bắt đầu: ${_start.toLocal()}',
          style: const TextStyle(color: Color(0xFF8EA3CC)),
        ),
        if (_locationType == 'other')
          Text(
            'Kết thúc: ${_end.toLocal()}',
            style: const TextStyle(color: Color(0xFF8EA3CC)),
          ),
        const SizedBox(height: 8),
        Text(
          '${_locationType == 'voice' ? '🔊' : '#'} ${chName ?? '—'}',
          style: const TextStyle(color: Colors.white70),
        ),
        const SizedBox(height: 24),
        const Text(
          'Sự kiện sẽ được lên lịch theo API máy chủ (owner/moderator).',
          style: TextStyle(color: Color(0xFF8EA3CC), fontSize: 13),
        ),
        const SizedBox(height: 24),
        Row(
          children: [
            TextButton(
              onPressed: () {
                setState(() => _step = 1);
                _pageCtrl.jumpToPage(1);
              },
              child: const Text('Quay lại'),
            ),
            const Spacer(),
            FilledButton(
              onPressed: _submitting || !_canStep2 ? null : _submit,
              style: FilledButton.styleFrom(
                backgroundColor: const Color(0xFF00C48C),
                padding:
                    const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
              ),
              child: _submitting
                  ? const SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Text('Tạo sự kiện'),
            ),
          ],
        ),
      ],
    );
  }
}
