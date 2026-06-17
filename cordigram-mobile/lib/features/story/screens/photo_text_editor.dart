import 'package:flutter/material.dart';
import '../../../core/services/language_controller.dart';

// ── Color palette (matches web OVERLAY_COLORS) ────────────────────────────────

const List<Color> kTextOverlayColors = [
  Color(0xFFFFFFFF),
  Color(0xFFFFEB3B),
  Color(0xFFFF4081),
  Color(0xFF00C853),
  Color(0xFF1877F2),
  Color(0xFFFF6D00),
  Color(0xFF000000),
  Color(0xFF9C6FD4),
  Color(0xFF00B4D8),
  Color(0xFFFF5722),
  Color(0xFF808080),
  Color(0xFFF44336),
];

// ── Data model ────────────────────────────────────────────────────────────────

class StoryTextLayer {
  StoryTextLayer({
    required this.id,
    required this.text,
    required this.color,
    required this.fontSize,
    required this.x,
    required this.y,
  });

  final String id;
  final String text;
  final Color color;
  final double fontSize; // px, 10–80
  final double x; // 0–100 %
  final double y; // 0–100 %

  StoryTextLayer copyWith({
    String? text,
    Color? color,
    double? fontSize,
    double? x,
    double? y,
  }) =>
      StoryTextLayer(
        id: id,
        text: text ?? this.text,
        color: color ?? this.color,
        fontSize: fontSize ?? this.fontSize,
        x: x ?? this.x,
        y: y ?? this.y,
      );

  /// Convert to API payload (fontSize as % of canvas height, x/y as percentages)
  Map<String, dynamic> toApiJson(double canvasHeight) => {
        'text': text,
        'color': '#${color.toARGB32().toRadixString(16).substring(2).toUpperCase()}',
        'fontSize': double.parse(
            ((fontSize / canvasHeight) * 100).toStringAsFixed(4)),
        'x': double.parse(x.toStringAsFixed(1)),
        'y': double.parse(y.toStringAsFixed(1)),
      };
}

// ── Main editor widget ────────────────────────────────────────────────────────

/// Wraps a photo preview child and renders text overlays on top.
/// Parent is responsible for all state (layers, selectedId, addTrigger).
class PhotoTextEditor extends StatefulWidget {
  const PhotoTextEditor({
    super.key,
    required this.photoChild,
    required this.layers,
    required this.onLayersChanged,
    this.addTrigger = 0,
    this.selectedId,
    required this.onSelectChanged,
    this.onInputModeChanged,
  });

  final Widget photoChild;
  final List<StoryTextLayer> layers;
  final void Function(List<StoryTextLayer>) onLayersChanged;
  final int addTrigger;
  final String? selectedId;
  final void Function(String?) onSelectChanged;
  /// Called whenever input mode enters (true) or exits (false)
  final void Function(bool)? onInputModeChanged;

  @override
  State<PhotoTextEditor> createState() => _PhotoTextEditorState();
}

class _PhotoTextEditorState extends State<PhotoTextEditor> {
  final TextEditingController _inputCtrl = TextEditingController();
  Color _inputColor = const Color(0xFFFFFFFF);
  double _inputFontSize = 28;
  int _prevTrigger = 0;
  OverlayEntry? _overlayEntry;

  @override
  void didUpdateWidget(PhotoTextEditor oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.addTrigger != _prevTrigger && widget.addTrigger > 0) {
      _prevTrigger = widget.addTrigger;
      // Defer to post-frame to avoid setState during build
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        widget.onSelectChanged(null);
        _openInputOverlay();
      });
    }
  }

  @override
  void dispose() {
    _closeInputOverlay(notify: false);
    _inputCtrl.dispose();
    super.dispose();
  }

  String? _editingLayerId;

  void _openInputOverlay({StoryTextLayer? editing}) {
    if (_overlayEntry != null) return;
    _editingLayerId = editing?.id;
    if (editing != null) {
      _inputCtrl.text = editing.text;
      _inputColor = editing.color;
      _inputFontSize = editing.fontSize;
    } else {
      _inputCtrl.clear();
      _inputColor = const Color(0xFFFFFFFF);
      _inputFontSize = 28;
    }
    _overlayEntry = OverlayEntry(
      builder: (_) => Material(
        type: MaterialType.transparency,
        child: _TextInputOverlay(
          controller: _inputCtrl,
          color: _inputColor,
          fontSize: _inputFontSize,
          onConfirm: _confirmInput,
          onCancel: _cancelInput,
          onColorChanged: (c) {
            _inputColor = c;
            _overlayEntry?.markNeedsBuild();
          },
          onFontSizeChanged: (s) {
            _inputFontSize = s;
            _overlayEntry?.markNeedsBuild();
          },
        ),
      ),
    );
    Overlay.of(context, rootOverlay: true).insert(_overlayEntry!);
    widget.onInputModeChanged?.call(true);
  }

  void _closeInputOverlay({bool notify = true}) {
    _overlayEntry?.remove();
    _overlayEntry?.dispose();
    _overlayEntry = null;
    if (notify) widget.onInputModeChanged?.call(false);
  }

  void _confirmInput() {
    final text = _inputCtrl.text.trim();
    if (text.isNotEmpty) {
      if (_editingLayerId != null) {
        // Update existing layer
        final idx = widget.layers.indexWhere((l) => l.id == _editingLayerId);
        if (idx >= 0) {
          final updated = List<StoryTextLayer>.from(widget.layers);
          updated[idx] = updated[idx].copyWith(
            text: text,
            color: _inputColor,
            fontSize: _inputFontSize,
          );
          widget.onLayersChanged(updated);
        }
      } else {
        // Add new layer
        widget.onLayersChanged([
          ...widget.layers,
          StoryTextLayer(
            id: '${DateTime.now().microsecondsSinceEpoch}',
            text: text,
            color: _inputColor,
            fontSize: _inputFontSize,
            x: 50,
            y: 50,
          ),
        ]);
      }
    }
    _editingLayerId = null;
    _closeInputOverlay();
    _inputCtrl.clear();
    if (mounted) setState(() {});
  }

  void _cancelInput() {
    _editingLayerId = null;
    _closeInputOverlay();
    _inputCtrl.clear();
  }

  void _deleteLayer(String id) {
    widget.onLayersChanged(
        widget.layers.where((l) => l.id != id).toList());
    if (widget.selectedId == id) widget.onSelectChanged(null);
  }

  void _updateLayer(StoryTextLayer updated) {
    widget.onLayersChanged(
        widget.layers.map((l) => l.id == updated.id ? updated : l).toList());
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (ctx, constraints) {
        final size = Size(constraints.maxWidth, constraints.maxHeight);
        return GestureDetector(
          // Tap on background → deselect
          onTap: () {
            if (_overlayEntry == null && widget.selectedId != null) {
              widget.onSelectChanged(null);
            }
          },
          child: Stack(
            fit: StackFit.expand,
            children: [
              // The photo itself
              widget.photoChild,

              // Text layers
              for (final layer in widget.layers)
                _TextLayerItem(
                  key: ValueKey(layer.id),
                  layer: layer,
                  containerSize: size,
                  isSelected: widget.selectedId == layer.id,
                  onSelect: () => widget.onSelectChanged(layer.id),
                  onEdit: () => _openInputOverlay(editing: layer),
                  onUpdate: _updateLayer,
                  onDelete: () => _deleteLayer(layer.id),
                ),
              // Input overlay is rendered via Flutter Overlay (full-screen).
            ],
          ),
        );
      },
    );
  }
}

// ── Draggable text overlay item ───────────────────────────────────────────────

class _TextLayerItem extends StatefulWidget {
  const _TextLayerItem({
    super.key,
    required this.layer,
    required this.containerSize,
    required this.isSelected,
    required this.onSelect,
    required this.onEdit,
    required this.onUpdate,
    required this.onDelete,
  });

  final StoryTextLayer layer;
  final Size containerSize;
  final bool isSelected;
  final VoidCallback onSelect;
  final VoidCallback onEdit;
  final void Function(StoryTextLayer) onUpdate;
  final VoidCallback onDelete;

  @override
  State<_TextLayerItem> createState() => _TextLayerItemState();
}

class _TextLayerItemState extends State<_TextLayerItem> {
  Offset? _dragStartGlobal;
  double _startX = 0;
  double _startY = 0;

  // Measured size of the text box — used to clamp so box never exits preview
  final _contentKey = GlobalKey();
  Size _contentSize = Size.zero;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _measure());
  }

  @override
  void didUpdateWidget(_TextLayerItem oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.layer.text != widget.layer.text ||
        oldWidget.layer.fontSize != widget.layer.fontSize) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _measure());
    }
  }

  void _measure() {
    if (!mounted) return;
    final box =
        _contentKey.currentContext?.findRenderObject() as RenderBox?;
    if (box != null && box.hasSize) {
      setState(() => _contentSize = box.size);
    }
  }

  @override
  Widget build(BuildContext context) {
    final px = (widget.layer.x / 100) * widget.containerSize.width;
    final py = (widget.layer.y / 100) * widget.containerSize.height;

    // Clamp so the entire text box stays inside the preview
    final halfW = _contentSize == Size.zero
        ? 5.0
        : (_contentSize.width / 2 / widget.containerSize.width * 100)
            .clamp(5.0, 48.0);
    final halfH = _contentSize == Size.zero
        ? 5.0
        : (_contentSize.height / 2 / widget.containerSize.height * 100)
            .clamp(3.0, 45.0);

    return Positioned(
      left: px,
      top: py,
      child: FractionalTranslation(
        translation: const Offset(-0.5, -0.5),
        child: GestureDetector(
          onTap: () {
            if (widget.isSelected) {
              widget.onEdit();
            } else {
              widget.onSelect();
            }
          },
          onPanStart: (details) {
            widget.onSelect();
            _dragStartGlobal = details.globalPosition;
            _startX = widget.layer.x;
            _startY = widget.layer.y;
          },
          onPanUpdate: (details) {
            if (_dragStartGlobal == null) return;
            final totalDx =
                details.globalPosition.dx - _dragStartGlobal!.dx;
            final totalDy =
                details.globalPosition.dy - _dragStartGlobal!.dy;
            widget.onUpdate(widget.layer.copyWith(
              x: (_startX + (totalDx / widget.containerSize.width) * 100)
                  .clamp(halfW, 100.0 - halfW),
              y: (_startY + (totalDy / widget.containerSize.height) * 100)
                  .clamp(halfH, 100.0 - halfH),
            ));
          },
          onPanEnd: (_) => _dragStartGlobal = null,
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              Container(
                key: _contentKey,
                constraints: BoxConstraints(
                    maxWidth: widget.containerSize.width * 0.82),
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
                decoration: widget.isSelected
                    ? BoxDecoration(
                        borderRadius: BorderRadius.circular(5),
                        border: Border.all(
                          color: Colors.white.withValues(alpha: 0.65),
                          width: 1.5,
                        ),
                      )
                    : null,
                child: Text(
                  widget.layer.text,
                  style: TextStyle(
                    color: widget.layer.color,
                    fontSize: widget.layer.fontSize,
                    fontWeight: FontWeight.w700,
                    height: 1.25,
                    shadows: const [
                      Shadow(
                        color: Colors.black54,
                        blurRadius: 4,
                        offset: Offset(1, 1),
                      ),
                    ],
                  ),
                  textAlign: TextAlign.center,
                ),
              ),
              // Delete button — top-left when selected
              if (widget.isSelected)
                Positioned(
                  top: -12,
                  left: -12,
                  child: GestureDetector(
                    onTap: widget.onDelete,
                    behavior: HitTestBehavior.opaque,
                    child: Container(
                      width: 24,
                      height: 24,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: Colors.black.withValues(alpha: 0.80),
                        border: Border.all(
                          color: Colors.white.withValues(alpha: 0.35),
                          width: 1,
                        ),
                      ),
                      child: const Icon(Icons.close_rounded,
                          color: Colors.white, size: 14),
                    ),
                  ),
                ),
              // Edit button — top-right when selected
              if (widget.isSelected)
                Positioned(
                  top: -12,
                  right: -12,
                  child: GestureDetector(
                    onTap: widget.onEdit,
                    behavior: HitTestBehavior.opaque,
                    child: Container(
                      width: 24,
                      height: 24,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color:
                            const Color(0xFF4AA3E4).withValues(alpha: 0.90),
                        border: Border.all(
                          color: Colors.white.withValues(alpha: 0.5),
                          width: 1,
                        ),
                      ),
                      child: const Icon(Icons.edit_rounded,
                          color: Colors.white, size: 13),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Full-screen text input overlay ────────────────────────────────────────────

class _TextInputOverlay extends StatelessWidget {
  const _TextInputOverlay({
    required this.controller,
    required this.color,
    required this.fontSize,
    required this.onConfirm,
    required this.onCancel,
    required this.onColorChanged,
    required this.onFontSizeChanged,
  });

  final TextEditingController controller;
  final Color color;
  final double fontSize;
  final VoidCallback onConfirm;
  final VoidCallback onCancel;
  final void Function(Color) onColorChanged;
  final void Function(double) onFontSizeChanged;

  @override
  Widget build(BuildContext context) {
    final keyboardH = MediaQuery.of(context).viewInsets.bottom;
    final topPad = MediaQuery.of(context).padding.top;
    final bottomPad = MediaQuery.of(context).padding.bottom;

    // Bottom toolbar height: swatches(38) + gap(10) + slider(36) + vpad(24) = ~108
    const toolbarH = 108.0;

    return Container(
      color: Colors.black.withValues(alpha: 0.68),
      child: Stack(
        children: [
          // ── Text field — centered in the space between top bar and toolbar ──
          Positioned(
            top: topPad + 56, // below top action bar
            left: 28,
            right: 28,
            bottom: keyboardH + toolbarH + bottomPad,
            child: Center(
              child: TextField(
                controller: controller,
                autofocus: true,
                textAlign: TextAlign.center,
                maxLines: null,
                keyboardType: TextInputType.multiline,
                style: TextStyle(
                  color: color,
                  fontSize: fontSize,
                  fontWeight: FontWeight.w700,
                  height: 1.25,
                  shadows: const [
                    Shadow(color: Colors.black54, blurRadius: 4),
                  ],
                ),
                decoration: InputDecoration(
                  border: InputBorder.none,
                  hintText: 'Nhập nội dung...',
                  hintStyle: TextStyle(
                    color: Colors.white.withValues(alpha: 0.45),
                    fontSize: fontSize,
                    fontWeight: FontWeight.w400,
                  ),
                ),
              ),
            ),
          ),

          // ── Top action bar — fixed at top ──────────────────────────────────
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: SafeArea(
              bottom: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(8, 6, 12, 0),
                child: Row(
                  children: [
                    TextButton(
                      onPressed: onCancel,
                      child: const Text(
                        'Huỷ',
                        style: TextStyle(
                            color: Colors.white,
                            fontSize: 14,
                            fontWeight: FontWeight.w500),
                      ),
                    ),
                    const Spacer(),
                    GestureDetector(
                      onTap: onConfirm,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 20, vertical: 8),
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(20),
                          gradient: const LinearGradient(
                            colors: [Color(0xFF4AA3E4), Color(0xFF7C3AED)],
                          ),
                        ),
                        child: const Text(
                          'Xong',
                          style: TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w700,
                            fontSize: 14,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),

          // ── Bottom toolbar — fixed above keyboard ──────────────────────────
          Positioned(
            left: 0,
            right: 0,
            bottom: keyboardH,
            child: SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    // Color swatches
                    SizedBox(
                      height: 38,
                      child: ListView.separated(
                        scrollDirection: Axis.horizontal,
                        itemCount: kTextOverlayColors.length,
                        separatorBuilder: (_, __) =>
                            const SizedBox(width: 8),
                        itemBuilder: (_, i) {
                          final c = kTextOverlayColors[i];
                          final active = color == c;
                          return GestureDetector(
                            onTap: () => onColorChanged(c),
                            child: AnimatedContainer(
                              duration: const Duration(milliseconds: 120),
                              width: active ? 34 : 28,
                              height: active ? 34 : 28,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                color: c,
                                border: Border.all(
                                  color: active
                                      ? const Color(0xFF4AA3E4)
                                      : Colors.white.withValues(alpha: 0.45),
                                  width: active ? 2.5 : 1.5,
                                ),
                                boxShadow: active
                                    ? [
                                        BoxShadow(
                                          color: const Color(0xFF4AA3E4)
                                              .withValues(alpha: 0.55),
                                          blurRadius: 8,
                                        ),
                                      ]
                                    : null,
                              ),
                            ),
                          );
                        },
                      ),
                    ),

                    const SizedBox(height: 10),

                    // Font size slider
                    Row(
                      children: [
                        const Text(
                          'A',
                          style: TextStyle(
                              color: Colors.white,
                              fontSize: 12,
                              fontWeight: FontWeight.w600),
                        ),
                        Expanded(
                          child: SliderTheme(
                            data: SliderTheme.of(context).copyWith(
                              trackHeight: 3,
                              thumbShape: const RoundSliderThumbShape(
                                  enabledThumbRadius: 8),
                              overlayShape: const RoundSliderOverlayShape(
                                  overlayRadius: 16),
                              activeTrackColor: const Color(0xFF4AA3E4),
                              inactiveTrackColor:
                                  Colors.white.withValues(alpha: 0.25),
                              thumbColor: Colors.white,
                              overlayColor: const Color(0xFF4AA3E4)
                                  .withValues(alpha: 0.2),
                            ),
                            child: Slider(
                              value: fontSize.clamp(10.0, 80.0),
                              min: 10,
                              max: 80,
                              onChanged: onFontSizeChanged,
                            ),
                          ),
                        ),
                        const Text(
                          'A',
                          style: TextStyle(
                              color: Colors.white,
                              fontSize: 22,
                              fontWeight: FontWeight.w700),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Inline text controls (shown in options panel when layer is selected) ───────

/// Color swatches + font size slider for editing an already-placed text layer.
class TextLayerControls extends StatelessWidget {
  const TextLayerControls({
    super.key,
    required this.layer,
    required this.onUpdate,
    required this.onDelete,
    required this.isDark,
  });

  final StoryTextLayer layer;
  final void Function(StoryTextLayer) onUpdate;
  final VoidCallback onDelete;
  final bool isDark;

  @override
  Widget build(BuildContext context) {
    final labelColor = isDark ? const Color(0xFF7A8BB0) : const Color(0xFF5B6378);
    final bgColor = isDark ? const Color(0xFF1A2435) : const Color(0xFFF0F4FA);
    final borderColor =
        isDark ? const Color(0xFF1E2D48) : const Color(0xFFE3EAF5);

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        color: bgColor,
        border: Border.all(color: borderColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header row: label + delete button
          Row(
            children: [
              const Icon(Icons.text_fields_rounded,
                  size: 14, color: Color(0xFF4AA3E4)),
              const SizedBox(width: 6),
              Text(
                LanguageController.instance.t('story.editText'),
                style:
                    TextStyle(color: labelColor, fontSize: 12, fontWeight: FontWeight.w600),
              ),
              const Spacer(),
              GestureDetector(
                onTap: onDelete,
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(12),
                    color: Colors.red.withValues(alpha: 0.12),
                    border: Border.all(color: Colors.red.withValues(alpha: 0.3)),
                  ),
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.delete_outline_rounded,
                          size: 13, color: Colors.redAccent),
                      SizedBox(width: 4),
                      Text(
                        'Xoá',
                        style: TextStyle(
                            color: Colors.redAccent,
                            fontSize: 11,
                            fontWeight: FontWeight.w700),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),

          const SizedBox(height: 10),

          // Color swatches
          SizedBox(
            height: 32,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: kTextOverlayColors.length,
              separatorBuilder: (_, __) => const SizedBox(width: 7),
              itemBuilder: (_, i) {
                final c = kTextOverlayColors[i];
                final active = layer.color == c;
                return GestureDetector(
                  onTap: () => onUpdate(layer.copyWith(color: c)),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 120),
                    width: active ? 30 : 25,
                    height: active ? 30 : 25,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: c,
                      border: Border.all(
                        color: active
                            ? const Color(0xFF4AA3E4)
                            : Colors.grey.withValues(alpha: 0.45),
                        width: active ? 2.5 : 1.5,
                      ),
                      boxShadow: active
                          ? [
                              BoxShadow(
                                color: const Color(0xFF4AA3E4)
                                    .withValues(alpha: 0.45),
                                blurRadius: 6,
                              ),
                            ]
                          : null,
                    ),
                  ),
                );
              },
            ),
          ),

          const SizedBox(height: 8),

          // Font size slider
          Row(
            children: [
              Text('A',
                  style: TextStyle(
                      color: labelColor,
                      fontSize: 11,
                      fontWeight: FontWeight.w600)),
              Expanded(
                child: SliderTheme(
                  data: SliderTheme.of(context).copyWith(
                    trackHeight: 3,
                    thumbShape:
                        const RoundSliderThumbShape(enabledThumbRadius: 7),
                    overlayShape:
                        const RoundSliderOverlayShape(overlayRadius: 14),
                    activeTrackColor: const Color(0xFF4AA3E4),
                    inactiveTrackColor:
                        isDark ? const Color(0xFF1E2D48) : const Color(0xFFD8E0EE),
                    thumbColor: const Color(0xFF4AA3E4),
                    overlayColor:
                        const Color(0xFF4AA3E4).withValues(alpha: 0.18),
                  ),
                  child: Slider(
                    value: layer.fontSize.clamp(10.0, 80.0),
                    min: 10,
                    max: 80,
                    onChanged: (v) => onUpdate(layer.copyWith(fontSize: v)),
                  ),
                ),
              ),
              Text('A',
                  style: TextStyle(
                      color: isDark ? Colors.white : const Color(0xFF0F1629),
                      fontSize: 20,
                      fontWeight: FontWeight.w700)),
            ],
          ),
        ],
      ),
    );
  }
}
