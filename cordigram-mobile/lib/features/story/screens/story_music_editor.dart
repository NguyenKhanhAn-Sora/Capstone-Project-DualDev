import 'dart:async';
import 'dart:math' as math;
import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/material.dart';
import '../models/story_models.dart';
import '../widgets/story_music_picker.dart';

// ── Interactive music sticker editor (placed in preview Stack) ────────────────

class MusicStickerEditor extends StatefulWidget {
  const MusicStickerEditor({
    super.key,
    required this.music,
    required this.isSelected,
    required this.onTap,
    required this.onUpdate,
    required this.onRemove,
  });

  final StoryMusic music;
  final bool isSelected;
  final VoidCallback onTap;
  final void Function(StoryMusic) onUpdate;
  final VoidCallback onRemove;

  @override
  State<MusicStickerEditor> createState() => _MusicStickerEditorState();
}

class _MusicStickerEditorState extends State<MusicStickerEditor> {
  // Drag body
  Offset? _bodyStart;
  double _startX = 0, _startY = 0;

  // Drag handles
  Offset? _leftStart;
  double _leftStartX = 0, _leftStartW = 0;
  Offset? _rightStart;
  double _rightStartW = 0;

  // Measure the sticker's natural rendered width so handles track it.
  final _bodyKey = GlobalKey();
  double _renderedW = 0;
  double _containerW = 0;
  bool _hasSynced = false; // only auto-sync stickerWidth once per track

  static const double _minW = 38.0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback(_measure);
  }

  @override
  void didUpdateWidget(MusicStickerEditor old) {
    super.didUpdateWidget(old);
    if (old.music.trackId != widget.music.trackId) {
      _hasSynced = false;
      _renderedW = 0;
    }
    WidgetsBinding.instance.addPostFrameCallback(_measure);
  }

  void _measure(_) {
    if (!mounted) return;
    final box = _bodyKey.currentContext?.findRenderObject() as RenderBox?;
    if (box == null) return;
    final w = box.size.width;
    if ((w - _renderedW).abs() < 1) return;
    setState(() => _renderedW = w);
    // On first render sync stickerWidth so the viewer uses the natural width.
    if (!_hasSynced && _containerW > 0) {
      _hasSynced = true;
      final pct = (w / _containerW * 100).clamp(20.0, 95.0);
      if ((pct - widget.music.stickerWidth).abs() > 0.5) {
        widget.onUpdate(widget.music.copyWith(stickerWidth: pct));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(builder: (ctx, constraints) {
      _containerW = constraints.maxWidth;
      final cw = constraints.maxWidth;
      final ch = constraints.maxHeight;
      final m = widget.music;
      final leftPx = (m.stickerX / 100) * cw;
      final topPx = (m.stickerY / 100) * ch;
      // widthPx = clip constraint when user resizes narrower than natural size.
      final widthPx = (m.stickerWidth / 100) * cw;
      // Visual right edge: use measured width once available.
      final visualW = _renderedW > 0 ? _renderedW : widthPx;

      return Stack(
        fit: StackFit.expand,
        clipBehavior: Clip.none,
        children: [
          // ── Sticker body (tap + drag) ──────────────────────────────
          Positioned(
            left: leftPx,
            top: topPx,
            // No fixed width — sticker sizes to its content naturally.
            // ConstrainedBox clips it when user resizes narrower.
            child: GestureDetector(
              key: _bodyKey,
              onTap: widget.onTap,
              onPanStart: (d) {
                _bodyStart = d.globalPosition;
                _startX = m.stickerX;
                _startY = m.stickerY;
              },
              onPanUpdate: (d) {
                if (_bodyStart == null) return;
                final dx = d.globalPosition.dx - _bodyStart!.dx;
                final dy = d.globalPosition.dy - _bodyStart!.dy;
                final wPct = (visualW / cw * 100).clamp(10.0, 100.0);
                widget.onUpdate(m.copyWith(
                  stickerX: (_startX + (dx / cw) * 100)
                      .clamp(0.0, 100.0 - wPct),
                  stickerY: (_startY + (dy / ch) * 100).clamp(0.0, 92.0),
                ));
              },
              onPanEnd: (_) => _bodyStart = null,
              child: ConstrainedBox(
                // Clips the sticker if user has resized it narrower than natural.
                constraints: BoxConstraints(maxWidth: widthPx),
                child: FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: Alignment.centerLeft,
                  child: Container(
                    decoration: widget.isSelected
                        ? BoxDecoration(
                            borderRadius: BorderRadius.circular(16),
                            border: Border.all(
                              color: const Color(0xFF4AA3E4),
                              width: 1.5,
                            ),
                          )
                        : null,
                    child: StoryMusicSticker(music: m),
                  ),
                ),
              ),
            ),
          ),

          // ── X remove button ────────────────────────────────────────
          if (widget.isSelected)
            Positioned(
              left: leftPx - 11,
              top: topPx - 11,
              child: GestureDetector(
                onTap: widget.onRemove,
                child: Container(
                  width: 22,
                  height: 22,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: Colors.black.withValues(alpha: 0.82),
                    border: Border.all(
                      color: Colors.white.withValues(alpha: 0.35),
                      width: 1,
                    ),
                  ),
                  child: const Icon(Icons.close_rounded,
                      color: Colors.white, size: 13),
                ),
              ),
            ),

          // ── Left resize handle ─────────────────────────────────────
          if (widget.isSelected)
            Positioned(
              left: leftPx - 8,
              top: topPx + 4,
              child: GestureDetector(
                onPanStart: (d) {
                  _leftStart = d.globalPosition;
                  _leftStartX = m.stickerX;
                  _leftStartW = m.stickerWidth;
                },
                onPanUpdate: (d) {
                  if (_leftStart == null) return;
                  final dx = d.globalPosition.dx - _leftStart!.dx;
                  final rightEdge = _leftStartX + _leftStartW;
                  final newX = (_leftStartX + (dx / cw) * 100)
                      .clamp(0.0, rightEdge - _minW);
                  widget.onUpdate(m.copyWith(
                    stickerX: newX,
                    stickerWidth: rightEdge - newX,
                  ));
                },
                onPanEnd: (_) => _leftStart = null,
                child: _ResizeHandle(isLeft: true),
              ),
            ),

          // ── Right resize handle ────────────────────────────────────
          if (widget.isSelected)
            Positioned(
              left: leftPx + visualW - 8,
              top: topPx + 4,
              child: GestureDetector(
                onPanStart: (d) {
                  _rightStart = d.globalPosition;
                  _rightStartW = m.stickerWidth;
                },
                onPanUpdate: (d) {
                  if (_rightStart == null) return;
                  final dx = d.globalPosition.dx - _rightStart!.dx;
                  widget.onUpdate(m.copyWith(
                    stickerWidth: (_rightStartW + (dx / cw) * 100)
                        .clamp(_minW, 100.0 - m.stickerX),
                  ));
                },
                onPanEnd: (_) => _rightStart = null,
                child: _ResizeHandle(isLeft: false),
              ),
            ),
        ],
      );
    });
  }
}

class _ResizeHandle extends StatelessWidget {
  const _ResizeHandle({required this.isLeft});
  final bool isLeft;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 16,
      height: 40,
      decoration: BoxDecoration(
        color: const Color(0xFF4AA3E4).withValues(alpha: 0.88),
        borderRadius: BorderRadius.only(
          topLeft: isLeft ? const Radius.circular(10) : Radius.zero,
          bottomLeft: isLeft ? const Radius.circular(10) : Radius.zero,
          topRight: isLeft ? Radius.zero : const Radius.circular(10),
          bottomRight: isLeft ? Radius.zero : const Radius.circular(10),
        ),
      ),
      child: Center(
        child: Container(
          width: 2,
          height: 18,
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.88),
            borderRadius: BorderRadius.circular(1),
          ),
        ),
      ),
    );
  }
}

// ── Waveform trim panel (shown in options area when sticker selected) ──────────

const int _kSegmentSec = 20;
const int _kNumBars = 60;

class MusicTrimPanel extends StatefulWidget {
  const MusicTrimPanel({
    super.key,
    required this.music,
    required this.isDark,
    required this.onUpdate,
    required this.onDone,
  });

  final StoryMusic music;
  final bool isDark;
  final void Function(StoryMusic) onUpdate;
  final VoidCallback onDone;

  @override
  State<MusicTrimPanel> createState() => _MusicTrimPanelState();
}

class _MusicTrimPanelState extends State<MusicTrimPanel> {
  late final List<double> _bars;
  final AudioPlayer _player = AudioPlayer();
  bool _isPlaying = false;
  Timer? _stopTimer;

  @override
  void initState() {
    super.initState();
    _bars = _genBars(widget.music.trackId);
    _player.onPlayerStateChanged.listen((s) {
      if (mounted) setState(() => _isPlaying = s == PlayerState.playing);
    });
    _player.onPlayerComplete.listen((_) {
      if (mounted) setState(() => _isPlaying = false);
    });
    // Pre-buffer audio so play starts instantly when user taps the button.
    if (widget.music.audioUrl.isNotEmpty) {
      _player
          .setSource(UrlSource(widget.music.audioUrl))
          .then((_) => _player.seek(Duration(seconds: widget.music.startTime)))
          .catchError((_) {});
    }
  }

  @override
  void dispose() {
    _stopTimer?.cancel();
    _player.stop(); // full stop + release on widget removal
    _player.dispose();
    super.dispose();
  }

  Future<void> _togglePlay() async {
    if (_isPlaying) {
      _stopTimer?.cancel();
      await _player.pause();
      return;
    }
    _stopTimer?.cancel();
    if (widget.music.audioUrl.isNotEmpty) {
      // Source already pre-buffered in initState; just seek + resume for
      // near-instant playback without re-fetching the stream.
      await _player.seek(Duration(seconds: widget.music.startTime));
      await _player.resume();
      _stopTimer = Timer(const Duration(seconds: _kSegmentSec), () async {
        await _player.pause();
      });
    }
  }

  static List<double> _genBars(String trackId) {
    final seed = trackId.codeUnits.fold<int>(0, (a, b) => a + b);
    final rng = math.Random(seed);
    return List.generate(_kNumBars, (_) => 0.25 + rng.nextDouble() * 0.75);
  }

  static String _fmt(int secs) {
    final m = secs ~/ 60;
    final s = (secs % 60).toString().padLeft(2, '0');
    return '$m:$s';
  }

  void _seek(double localX, double totalW) {
    if (totalW <= 0) return;
    final duration = widget.music.duration.clamp(1, 99999);
    final maxStart = (duration - _kSegmentSec).clamp(0, duration);
    final frac = (localX / totalW).clamp(0.0, 1.0);
    final halfFrac = _kSegmentSec / duration / 2;
    final raw = ((frac - halfFrac) * duration).round();
    final newStart = raw.clamp(0, maxStart);
    if (newStart != widget.music.startTime) {
      // Pause while scrubbing; source stays loaded for instant resume.
      if (_isPlaying) {
        _stopTimer?.cancel();
        _player.pause();
      }
      widget.onUpdate(widget.music.copyWith(startTime: newStart));
    }
  }

  @override
  Widget build(BuildContext context) {
    final m = widget.music;
    final isDark = widget.isDark;
    final duration = m.duration.clamp(1, 99999);
    final start = m.startTime.clamp(0, (duration - _kSegmentSec).clamp(0, duration));
    final end = start + _kSegmentSec;
    final winL = start / duration;
    final winW = (_kSegmentSec / duration).clamp(0.0, 1.0);

    final textColor = isDark ? const Color(0xFFE8ECF8) : const Color(0xFF0F1629);

    return Padding(
      padding: const EdgeInsets.only(top: 4, bottom: 2),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              // Play / pause preview button
              GestureDetector(
                onTap: _togglePlay,
                child: Container(
                  width: 32,
                  height: 32,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: _isPlaying
                        ? const Color(0xFF4AA3E4).withValues(alpha: 0.15)
                        : const Color(0xFF4AA3E4).withValues(alpha: 0.10),
                    border: Border.all(
                      color: const Color(0xFF4AA3E4).withValues(alpha: 0.6),
                      width: 1.5,
                    ),
                  ),
                  child: Icon(
                    _isPlaying ? Icons.pause_rounded : Icons.play_arrow_rounded,
                    color: const Color(0xFF4AA3E4),
                    size: 18,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Text(
                'Chọn đoạn nhạc',
                style: TextStyle(
                  color: textColor,
                  fontWeight: FontWeight.w600,
                  fontSize: 13,
                ),
              ),
              const Spacer(),
              Text(
                '${_fmt(start)} – ${_fmt(end)}',
                style: const TextStyle(
                    color: Color(0xFF7A8BB0), fontSize: 12),
              ),
              const SizedBox(width: 8),
              GestureDetector(
                onTap: () {
                  _stopTimer?.cancel();
                  _player.pause();
                  widget.onDone();
                },
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                        colors: [Color(0xFF4AA3E4), Color(0xFF7C3AED)]),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Text(
                    'Xong',
                    style: TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                        fontSize: 12),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          LayoutBuilder(builder: (ctx, constraints) {
            final totalW = constraints.maxWidth;
            return GestureDetector(
              onPanStart: (d) => _seek(d.localPosition.dx, totalW),
              onPanUpdate: (d) => _seek(d.localPosition.dx, totalW),
              onTapDown: (d) => _seek(d.localPosition.dx, totalW),
              child: SizedBox(
                height: 50,
                width: totalW,
                child: CustomPaint(
                  painter: _WaveformPainter(
                    bars: _bars,
                    winL: winL,
                    winW: winW,
                    isDark: isDark,
                  ),
                ),
              ),
            );
          }),
        ],
      ),
    );
  }
}

class _WaveformPainter extends CustomPainter {
  const _WaveformPainter({
    required this.bars,
    required this.winL,
    required this.winW,
    required this.isDark,
  });

  final List<double> bars;
  final double winL;
  final double winW;
  final bool isDark;

  @override
  void paint(Canvas canvas, Size size) {
    final n = bars.length;
    if (n == 0) return;
    final bw = size.width / n;
    final maxH = size.height * 0.82;
    final midY = size.height / 2;
    final wl = winL * size.width;
    final wr = (winL + winW) * size.width;

    // Window fill
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTRB(wl, 2, wr, size.height - 2),
        const Radius.circular(4),
      ),
      Paint()..color = const Color(0xFF4AA3E4).withValues(alpha: 0.13),
    );

    final bg = Paint()
      ..strokeCap = StrokeCap.round
      ..color =
          (isDark ? Colors.white : const Color(0xFF0F1629)).withValues(alpha: 0.2);
    final active = Paint()
      ..strokeCap = StrokeCap.round
      ..color = const Color(0xFF4AA3E4);

    for (int i = 0; i < n; i++) {
      final cx = (i + 0.5) * bw;
      final h = bars[i] * maxH;
      final p = (cx >= wl && cx <= wr) ? active : bg;
      p.strokeWidth = (bw * 0.5).clamp(1.5, 4.0);
      canvas.drawLine(Offset(cx, midY - h / 2), Offset(cx, midY + h / 2), p);
    }

    // Window border lines
    final border = Paint()
      ..color = const Color(0xFF4AA3E4)
      ..strokeWidth = 2;
    canvas.drawLine(Offset(wl, 0), Offset(wl, size.height), border);
    canvas.drawLine(Offset(wr, 0), Offset(wr, size.height), border);
  }

  @override
  bool shouldRepaint(_WaveformPainter old) =>
      old.winL != winL || old.winW != winW || old.isDark != isDark;
}
