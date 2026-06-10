import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/config/app_config.dart';
import '../../core/services/language_controller.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/widgets/app_button.dart';
import '../../core/theme/app_theme_context.dart';
import 'models/server_models.dart';
import 'server_settings/server_settings_ui.dart';
import 'services/servers_service.dart';
import 'widgets/messages_chrome_builder.dart';

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

  String _t(String key, [Map<String, dynamic>? vars]) =>
      LanguageController.instance.t(key, vars);

  Map<String, String> get _freqLabels => {
        'none': _t('chat.createEvent.freqNone'),
        'weekly': _t('chat.createEvent.freqWeekly'),
        'biweekly': _t('chat.createEvent.freqBiweekly'),
        'monthly': _t('chat.createEvent.freqMonthly'),
        'yearly': _t('chat.createEvent.freqYearly'),
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
                ? _t('chat.createEvent.created')
                : _t('chat.createEvent.createdWithLink'),
          ),
        ),
      );
      Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(_t('chat.createEvent.errorCreate', {'error': '$e'})),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  InputDecoration _dec(BuildContext context, String hint) {
    final ui = ServerSettingsUi.of(context);
    return ui.fieldDecoration(hintText: hint);
  }

  @override
  Widget build(BuildContext context) {
    return MessagesChromeBuilder(
      builder: (context, chrome) {
        final ui = ServerSettingsUi(chrome);
        return Scaffold(
          backgroundColor: chrome.bg,
          appBar: ui.buildAppBar(title: _t('chat.createEvent.title')),
          body: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.lg,
                  AppSpacing.sm,
                  AppSpacing.lg,
                  AppSpacing.md,
                ),
                child: Row(
                  children: [
                    _stepChip(context, 0, _t('chat.createEvent.stepLocation')),
                    Icon(Icons.chevron_right, color: chrome.textMuted, size: 18),
                    _stepChip(context, 1, _t('chat.createEvent.stepDetails')),
                    Icon(Icons.chevron_right, color: chrome.textMuted, size: 18),
                    _stepChip(context, 2, _t('chat.createEvent.stepReview')),
                  ],
                ),
              ),
              Expanded(
                child: PageView(
                  controller: _pageCtrl,
                  physics: const NeverScrollableScrollPhysics(),
                  children: [
                    _buildStep1(context),
                    _buildStep2(context),
                    _buildStep3(context),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _stepChip(BuildContext context, int idx, String label) {
    final c = context.chrome;
    final on = _step == idx;
    return Expanded(
      child: Container(
        constraints: const BoxConstraints(minHeight: AppSpacing.touch),
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.sm,
          vertical: AppSpacing.sm,
        ),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: on ? c.surface : c.surfaceMuted,
          borderRadius: BorderRadius.circular(AppSpacing.sm),
          border: Border.all(
            color: on ? c.accent : c.border,
            width: on ? 1.5 : 1,
          ),
        ),
        child: Text(
          label,
          textAlign: TextAlign.center,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
            color: on ? c.text : c.textMuted,
            fontWeight: on ? FontWeight.w800 : FontWeight.w500,
            fontSize: 11,
            height: 1.2,
          ),
        ),
      ),
    );
  }

  Widget _buildStep1(BuildContext context) {
    final c = context.chrome;
    final list = _channelsForLocation;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text(
          _t('chat.createEvent.whereQuestion'),
          style: TextStyle(
            color: c.text,
            fontSize: 18,
            fontWeight: FontWeight.w800,
          ),
        ),
        const SizedBox(height: 12),
        RadioListTile<String>(
          value: 'voice',
          groupValue: _locationType,
          fillColor: WidgetStateProperty.resolveWith(
            (s) => s.contains(WidgetState.selected) ? c.accent : null,
          ),
          title: Text(
            _t('chat.createEvent.voiceChannel'),
            style: TextStyle(color: c.text, fontWeight: FontWeight.w600),
          ),
          subtitle: Text(
            _t('chat.createEvent.voiceChannelHint'),
            style: TextStyle(color: c.textMuted, fontSize: 12),
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
            (s) => s.contains(WidgetState.selected) ? c.accent : null,
          ),
          title: Text(
            _t('chat.createEvent.otherLocation'),
            style: TextStyle(color: c.text, fontWeight: FontWeight.w600),
          ),
          subtitle: Text(
            _t('chat.createEvent.otherLocationHint'),
            style: TextStyle(color: c.textMuted, fontSize: 12),
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
          Padding(
            padding: const EdgeInsets.only(top: 12),
            child: Text(
              _t('chat.createEvent.noChannels'),
              style: TextStyle(color: c.accent),
            ),
          )
        else ...[
          const SizedBox(height: 16),
          Text(
            _t('chat.createEvent.selectChannel'),
            style: TextStyle(
              color: c.textMuted,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 8),
          DropdownButtonFormField<String>(
            value: _channelId.isEmpty ? null : _channelId,
            dropdownColor: c.chatInput,
            decoration: _dec(context, _t('chat.createEvent.channelPlaceholder')),
            style: TextStyle(color: c.text),
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
        const SizedBox(height: AppSpacing.xxl),
        AppButton(
          label: _t('chat.createEvent.next'),
          onPressed: _canStep1
              ? () {
                  setState(() => _step = 1);
                  _pageCtrl.jumpToPage(1);
                }
              : null,
        ),
      ],
    );
  }

  Widget _buildStep2(BuildContext context) {
    final c = context.chrome;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        TextField(
          controller: _topicCtrl,
          style: TextStyle(color: c.text),
          decoration: _dec(context, _t('chat.createEvent.topicLabel')),
        ),
        const SizedBox(height: 12),
        Text(
          _t('chat.createEvent.start'),
          style: TextStyle(color: c.textMuted, fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: 6),
        Row(
          children: [
            Expanded(
              child: OutlinedButton(
                onPressed: () => _pickDate(forEnd: false),
                child: Text(
                  '${_start.year}-${_start.month.toString().padLeft(2, '0')}-${_start.day.toString().padLeft(2, '0')}',
                  style: TextStyle(color: c.text),
                ),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: OutlinedButton(
                onPressed: () => _pickTime(forEnd: false),
                child: Text(
                  '${_start.hour.toString().padLeft(2, '0')}:${_start.minute.toString().padLeft(2, '0')}',
                  style: TextStyle(color: c.text),
                ),
              ),
            ),
          ],
        ),
        if (_locationType == 'other') ...[
          const SizedBox(height: 16),
          Text(
            _t('chat.createEvent.end'),
            style: TextStyle(
              color: c.textMuted,
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
                    style: TextStyle(color: c.text),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: OutlinedButton(
                  onPressed: () => _pickTime(forEnd: true),
                  child: Text(
                    '${_end.hour.toString().padLeft(2, '0')}:${_end.minute.toString().padLeft(2, '0')}',
                    style: TextStyle(color: c.text),
                  ),
                ),
              ),
            ],
          ),
          if (!_endAfterStart)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(
                _t('chat.createEvent.endAfterStartError'),
                style: TextStyle(color: c.accent),
              ),
            ),
        ],
        const SizedBox(height: 16),
        DropdownButtonFormField<String>(
          value: _frequency,
          dropdownColor: c.chatInput,
          decoration: _dec(context, _t('chat.createEvent.frequency')),
          style: TextStyle(color: c.text),
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
          style: TextStyle(color: c.text),
          decoration: _dec(context, _t('chat.createEvent.descriptionOptional')),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _coverCtrl,
          style: TextStyle(color: c.text),
          decoration: _dec(context, _t('chat.createEvent.coverOptional')),
        ),
        const SizedBox(height: AppSpacing.xxl),
        Row(
          children: [
            Expanded(
              child: AppButton(
                label: _t('common.back'),
                onPressed: () {
                  setState(() => _step = 0);
                  _pageCtrl.jumpToPage(0);
                },
                variant: AppButtonVariant.ghost,
              ),
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: AppButton(
                label: _t('chat.createEvent.next'),
                onPressed: _canStep2
                    ? () {
                        setState(() => _step = 2);
                        _pageCtrl.jumpToPage(2);
                      }
                    : null,
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildStep3(BuildContext context) {
    final c = context.chrome;
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
          style: TextStyle(
            color: c.text,
            fontSize: 20,
            fontWeight: FontWeight.w800,
          ),
        ),
        const SizedBox(height: 12),
        Text(
          _t('chat.createEvent.reviewStart', {
            'time': '${_start.toLocal()}',
          }),
          style: TextStyle(color: c.textMuted),
        ),
        if (_locationType == 'other')
          Text(
            _t('chat.createEvent.reviewEnd', {'time': '${_end.toLocal()}'}),
            style: TextStyle(color: c.textMuted),
          ),
        const SizedBox(height: 8),
        Text(
          '${_locationType == 'voice' ? '🔊' : '#'} ${chName ?? '—'}',
          style: TextStyle(color: c.text.withValues(alpha: 0.85)),
        ),
        const SizedBox(height: 24),
        Text(
          _t('chat.createEvent.reviewNote'),
          style: TextStyle(color: c.textMuted, fontSize: 13),
        ),
        const SizedBox(height: AppSpacing.xxl),
        Row(
          children: [
            Expanded(
              child: AppButton(
                label: _t('common.back'),
                onPressed: () {
                  setState(() => _step = 1);
                  _pageCtrl.jumpToPage(1);
                },
                variant: AppButtonVariant.ghost,
              ),
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: AppButton(
                label: _t('chat.createEvent.submit'),
                onPressed: _submitting || !_canStep2 ? null : _submit,
                loading: _submitting,
              ),
            ),
          ],
        ),
      ],
    );
  }
}
