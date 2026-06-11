import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../core/services/language_controller.dart';
import '../../../core/theme/app_radii.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/widgets/app_button.dart';
import '../models/display_name_style.dart';
import 'display_name_styled_text.dart';

class DisplayNameStyleSheet extends StatefulWidget {
  const DisplayNameStyleSheet({
    super.key,
    required this.initial,
    required this.boostUnlocked,
    required this.onApply,
  });

  final DisplayNameStyle initial;
  final bool boostUnlocked;
  final ValueChanged<DisplayNameStyle> onApply;

  static Future<void> show(
    BuildContext context, {
    required DisplayNameStyle initial,
    required bool boostUnlocked,
    required ValueChanged<DisplayNameStyle> onApply,
  }) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => DisplayNameStyleSheet(
        initial: initial,
        boostUnlocked: boostUnlocked,
        onApply: onApply,
      ),
    );
  }

  @override
  State<DisplayNameStyleSheet> createState() => _DisplayNameStyleSheetState();
}

class _DisplayNameStyleSheetState extends State<DisplayNameStyleSheet> {
  late DisplayNameStyle _draft;
  late final TextEditingController _primaryHexCtrl;
  late final TextEditingController _accentHexCtrl;

  String _t(String key) => LanguageController.instance.t(key);

  @override
  void initState() {
    super.initState();
    _draft = widget.initial;
    _primaryHexCtrl = TextEditingController(text: _draft.primaryHex);
    _accentHexCtrl = TextEditingController(text: _draft.accentHex);
  }

  @override
  void dispose() {
    _primaryHexCtrl.dispose();
    _accentHexCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = Theme.of(context).colorScheme;
    final bottom = MediaQuery.paddingOf(context).bottom;
    final maxH = MediaQuery.sizeOf(context).height * 0.88;

    return Container(
      margin: const EdgeInsets.all(AppSpacing.md),
      constraints: BoxConstraints(maxHeight: maxH),
      padding: EdgeInsets.fromLTRB(
        AppSpacing.lg,
        AppSpacing.lg,
        AppSpacing.lg,
        AppSpacing.lg + bottom,
      ),
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: AppRadii.xlAll,
        border: Border.all(color: c.outline.withValues(alpha: 0.35)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  _t('chat.displayNameStyleModal.title'),
                  style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
                ),
              ),
              IconButton(
                onPressed: () => Navigator.pop(context),
                icon: const Icon(Icons.close_rounded),
                visualDensity: VisualDensity.compact,
              ),
            ],
          ),
          if (!widget.boostUnlocked) ...[
            Text(
              _t('chat.displayNameStyleModal.subtitleLocked'),
              style: TextStyle(color: c.onSurfaceVariant, fontSize: 13),
            ),
            const SizedBox(height: AppSpacing.sm),
          ],
          Flexible(
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(_t('chat.displayNameStyleModal.sectionFont'),
                      style: _labelStyle(c)),
                  const SizedBox(height: AppSpacing.sm),
                  _chipRow(
                    [
                      ('default', _t('chat.displayNameStyleModal.fontDefault')),
                      ('rounded', _t('chat.displayNameStyleModal.fontRounded')),
                      ('mono', _t('chat.displayNameStyleModal.fontMono')),
                    ],
                    _draft.fontId,
                    (v) => setState(() => _draft = _draft.copyWith(fontId: v)),
                  ),
                  const SizedBox(height: AppSpacing.md),
                  Text(_t('chat.displayNameStyleModal.sectionEffect'),
                      style: _labelStyle(c)),
                  const SizedBox(height: AppSpacing.sm),
                  _chipRow(
                    [
                      ('solid', _t('chat.displayNameStyleModal.effectSolid')),
                      ('gradient', _t('chat.displayNameStyleModal.effectGradient')),
                      ('neon', _t('chat.displayNameStyleModal.effectNeon')),
                    ],
                    _draft.effectId,
                    (v) => setState(() => _draft = _draft.copyWith(effectId: v)),
                  ),
                  const SizedBox(height: AppSpacing.md),
                  Text(_t('chat.displayNameStyleModal.sectionColor'),
                      style: _labelStyle(c)),
                  const SizedBox(height: AppSpacing.sm),
                  _colorRow(
                    label: _t('chat.displayNameStyleModal.colorPrimary'),
                    controller: _primaryHexCtrl,
                    onChanged: (hex) =>
                        setState(() => _draft = _draft.copyWith(primaryHex: hex)),
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  _colorRow(
                    label: _t('chat.displayNameStyleModal.colorAccent'),
                    controller: _accentHexCtrl,
                    onChanged: (hex) =>
                        setState(() => _draft = _draft.copyWith(accentHex: hex)),
                  ),
                  const SizedBox(height: AppSpacing.md),
                  Text(_t('chat.displayNameStyleModal.previewTitle'),
                      style: _labelStyle(c)),
                  const SizedBox(height: AppSpacing.sm),
                  Container(
                    padding: const EdgeInsets.all(AppSpacing.md),
                    decoration: BoxDecoration(
                      color: c.surfaceContainerHighest.withValues(alpha: 0.5),
                      borderRadius: AppRadii.mdAll,
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        DisplayNameStyledText(
                          text: 'Cordigram',
                          style: _draft,
                          fontSize: 22,
                        ),
                        const SizedBox(height: 4),
                        Text(
                          _t('chat.displayNameStyleModal.previewSub'),
                          style: TextStyle(color: c.onSurfaceVariant, fontSize: 12),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: AppSpacing.lg),
          Row(
            children: [
              Expanded(
                child: AppButton(
                  label: _t('chat.displayNameStyleModal.cancel'),
                  variant: AppButtonVariant.outline,
                  onPressed: () => Navigator.pop(context),
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: AppButton(
                  label: widget.boostUnlocked
                      ? _t('chat.displayNameStyleModal.apply')
                      : _t('chat.displayNameStyleModal.applyTry'),
                  onPressed: () {
                    widget.onApply(_draft);
                    Navigator.pop(context);
                  },
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  TextStyle _labelStyle(ColorScheme c) => TextStyle(
    color: c.onSurfaceVariant,
    fontSize: 11,
    fontWeight: FontWeight.w800,
    letterSpacing: 0.4,
  );

  Widget _chipRow(
    List<(String, String)> options,
    String selected,
    ValueChanged<String> onPick,
  ) {
    return Wrap(
      spacing: AppSpacing.sm,
      runSpacing: AppSpacing.sm,
      children: options.map((opt) {
        final active = opt.$1 == selected;
        return ChoiceChip(
          label: Text(opt.$2),
          selected: active,
          onSelected: (_) => onPick(opt.$1),
        );
      }).toList(),
    );
  }

  Widget _colorRow({
    required String label,
    required TextEditingController controller,
    required ValueChanged<String> onChanged,
  }) {
    final c = Theme.of(context).colorScheme;
    final swatchColor = DisplayNameStyle.colorFromHex(
      controller.text,
      fallback: c.onSurface,
    );

    return Row(
      children: [
        SizedBox(
          width: 72,
          child: Text(
            label,
            style: TextStyle(color: c.onSurfaceVariant, fontSize: 13),
          ),
        ),
        InkWell(
          onTap: () => _pickColor(controller.text, (hex) {
            controller.text = hex;
            onChanged(hex);
          }),
          borderRadius: AppRadii.smAll,
          child: Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: swatchColor,
              borderRadius: AppRadii.smAll,
              border: Border.all(color: c.outline.withValues(alpha: 0.5)),
            ),
          ),
        ),
        const SizedBox(width: AppSpacing.sm),
        Expanded(
          child: TextField(
            controller: controller,
            decoration: InputDecoration(
              isDense: true,
              contentPadding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.sm,
                vertical: AppSpacing.sm,
              ),
              border: OutlineInputBorder(borderRadius: AppRadii.smAll),
            ),
            style: const TextStyle(fontFamily: 'monospace', fontSize: 13),
            inputFormatters: [
              FilteringTextInputFormatter.allow(RegExp(r'[#0-9a-fA-F]')),
              LengthLimitingTextInputFormatter(7),
            ],
            onChanged: onChanged,
          ),
        ),
      ],
    );
  }

  Future<void> _pickColor(String currentHex, ValueChanged<String> onChanged) async {
    var hsv = HSVColor.fromColor(
      DisplayNameStyle.colorFromHex(currentHex, fallback: Colors.white),
    );

    final picked = await showDialog<HSVColor>(
      context: context,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            final preview = hsv.toColor();
            return AlertDialog(
              title: Text(_t('chat.displayNameStyleModal.sectionColor')),
              content: SizedBox(
                width: 280,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      height: 44,
                      decoration: BoxDecoration(
                        color: preview,
                        borderRadius: AppRadii.smAll,
                        border: Border.all(
                          color: Theme.of(context).colorScheme.outline,
                        ),
                      ),
                    ),
                    const SizedBox(height: AppSpacing.md),
                    _sliderRow(
                      label: 'H',
                      value: hsv.hue,
                      max: 360,
                      onChanged: (v) => setDialogState(() {
                        hsv = hsv.withHue(v);
                      }),
                    ),
                    _sliderRow(
                      label: 'S',
                      value: hsv.saturation,
                      max: 1,
                      onChanged: (v) => setDialogState(() {
                        hsv = hsv.withSaturation(v);
                      }),
                    ),
                    _sliderRow(
                      label: 'V',
                      value: hsv.value,
                      max: 1,
                      onChanged: (v) => setDialogState(() {
                        hsv = hsv.withValue(v);
                      }),
                    ),
                  ],
                ),
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(ctx),
                  child: Text(_t('chat.displayNameStyleModal.cancel')),
                ),
                FilledButton(
                  onPressed: () => Navigator.pop(ctx, hsv),
                  child: Text(_t('chat.displayNameStyleModal.apply')),
                ),
              ],
            );
          },
        );
      },
    );

    if (picked == null) return;
    final argb = picked.toColor().toARGB32();
    final hex = '#${(argb & 0xFFFFFF).toRadixString(16).padLeft(6, '0')}';
    onChanged(hex);
    setState(() {});
  }

  Widget _sliderRow({
    required String label,
    required double value,
    required double max,
    required ValueChanged<double> onChanged,
  }) {
    return Row(
      children: [
        SizedBox(
          width: 16,
          child: Text(label, style: const TextStyle(fontWeight: FontWeight.w700)),
        ),
        Expanded(
          child: Slider(
            value: value.clamp(0, max),
            max: max,
            onChanged: onChanged,
          ),
        ),
      ],
    );
  }
}
