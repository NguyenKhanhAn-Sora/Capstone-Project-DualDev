import 'dart:math' as math;
import 'package:flutter/material.dart';

// ── Star color palette (mirrors web version) ──────────────────────────────────
const _kStarColors = <Color>[
  Color(0xFFFFFFFF), // white
  Color(0xFFC8DCFF), // blue-white
  Color(0xFFFFEBC8), // warm white
  Color(0xFFDCC8FF), // purple-white
  Color(0xFFB4F0FF), // cyan-white
  Color(0xFFFFC8DC), // rose-white
];

// ── Data types ────────────────────────────────────────────────────────────────

class _NebulaData {
  const _NebulaData({
    required this.nx,
    required this.ny,
    required this.rx,
    required this.ry,
    required this.color1,
    required this.alpha1,
    required this.color2,
    required this.alpha2,
  });

  final double nx, ny, rx, ry;
  final Color color1;
  final double alpha1;
  final Color color2;
  final double alpha2;
}

class _PlanetData {
  const _PlanetData({
    required this.nx,
    required this.ny,
    required this.radius,
    required this.glowRadius,
    required this.colorMain,
    required this.colorLight,
    this.hasRing = false,
  });

  final double nx, ny, radius, glowRadius;
  final Color colorMain, colorLight;
  final bool hasRing;
}

class _StarData {
  const _StarData({
    required this.x,
    required this.y,
    required this.radius,
    required this.baseOpacity,
    required this.twinkleFreq,
    required this.twinklePhase,
    required this.color,
  });

  final double x, y, radius, baseOpacity, twinkleFreq, twinklePhase;
  final Color color;
}

// ── Scene definitions ─────────────────────────────────────────────────────────

// 5 nebulae: violet, rose-purple, cyan, teal-green, indigo
const _kNebulae = <_NebulaData>[
  _NebulaData(
    nx: 0.14, ny: 0.22, rx: 0.30, ry: 0.22,
    color1: Color(0xFF5F23C3), alpha1: 0.28,
    color2: Color(0xFF2D1291), alpha2: 0.11,
  ),
  _NebulaData(
    nx: 0.80, ny: 0.52, rx: 0.26, ry: 0.24,
    color1: Color(0xFFD73799), alpha1: 0.22,
    color2: Color(0xFF9B26C3), alpha2: 0.09,
  ),
  _NebulaData(
    nx: 0.50, ny: 0.88, rx: 0.34, ry: 0.15,
    color1: Color(0xFF1CAFD7), alpha1: 0.18,
    color2: Color(0xFF1273AF), alpha2: 0.08,
  ),
  _NebulaData(
    nx: 0.28, ny: 0.58, rx: 0.22, ry: 0.19,
    color1: Color(0xFF37C387), alpha1: 0.15,
    color2: Color(0xFF23915F), alpha2: 0.07,
  ),
  _NebulaData(
    nx: 0.68, ny: 0.30, rx: 0.18, ry: 0.20,
    color1: Color(0xFFB450F0), alpha1: 0.18,
    color2: Color(0xFF7832C8), alpha2: 0.08,
  ),
];

// 4 planets with 3D shading; third one has a ring
const _kPlanets = <_PlanetData>[
  _PlanetData(
    nx: 0.86, ny: 0.09, radius: 42, glowRadius: 100,
    colorMain: Color(0xFF483ED2), colorLight: Color(0xFF8276FF),
  ),
  _PlanetData(
    nx: 0.05, ny: 0.72, radius: 26, glowRadius: 65,
    colorMain: Color(0xFFC4368A), colorLight: Color(0xFFEE6CB2),
  ),
  _PlanetData(
    nx: 0.64, ny: 0.035, radius: 18, glowRadius: 50,
    colorMain: Color(0xFF12ACC4), colorLight: Color(0xFF4CDAEE),
    hasRing: true,
  ),
  _PlanetData(
    nx: 0.42, ny: 0.90, radius: 13, glowRadius: 38,
    colorMain: Color(0xFFD68418), colorLight: Color(0xFFFFB946),
  ),
];

// ── Widget ────────────────────────────────────────────────────────────────────

/// Animated deep-space background rendered behind every screen when galaxy
/// mode is active. Transparent scaffolds in [AppTheme.galaxy] let this layer
/// show through.
class GalaxyBackground extends StatefulWidget {
  const GalaxyBackground({super.key, required this.child});

  final Widget child;

  @override
  State<GalaxyBackground> createState() => _GalaxyBackgroundState();
}

class _GalaxyBackgroundState extends State<GalaxyBackground>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    // 60-second loop; time = value * 60 (seconds) drives both nebula breathing
    // (period ~35 s) and per-star twinkling via individual sine frequencies.
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 60),
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final reduceMotion = MediaQuery.of(context).disableAnimations;
    return Stack(
      fit: StackFit.expand,
      children: [
        // ── Layer 1: Rich deep-space gradient (static) ──────────────────────
        const DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment(0.4, 1.0),
              colors: [
                Color(0xFF01030C),
                Color(0xFF02051A),
                Color(0xFF040218),
                Color(0xFF050312),
                Color(0xFF01020A),
              ],
              stops: [0.0, 0.25, 0.55, 0.80, 1.0],
            ),
          ),
        ),
        // ── Layers 2-4: Nebulae + planets + star field (single AnimatedBuilder)
        RepaintBoundary(
          child: reduceMotion
              ? CustomPaint(painter: _GalaxyPainter(time: 0))
              : AnimatedBuilder(
                  animation: _controller,
                  builder: (_, __) => CustomPaint(
                    painter: _GalaxyPainter(time: _controller.value * 60),
                  ),
                ),
        ),
        // ── Layer 5: App content ────────────────────────────────────────────
        widget.child,
      ],
    );
  }
}

// ── Painter ───────────────────────────────────────────────────────────────────

class _GalaxyPainter extends CustomPainter {
  _GalaxyPainter({required this.time});

  // Elapsed seconds (0–60, looping). Drives nebula breathing and twinkling.
  final double time;

  // Seeded PRNG — fixed seed gives same distribution every run, no visual patterns.
  static final List<_StarData> _stars = _buildStars(220);

  static List<_StarData> _buildStars(int count) {
    // Fixed seed → deterministic AND naturally scattered (no lattice artefacts).
    final rng = math.Random(42);
    return List.generate(count, (i) {
      final x = rng.nextDouble();
      final y = rng.nextDouble();
      final rawR = rng.nextDouble();
      final radius = 0.25 + math.pow(rawR, 2.2).toDouble() * 2.6;
      final baseOpacity = 0.35 + rng.nextDouble() * 0.55;
      // 0.05–0.33 cycles/s → periods 3–20 s — clearly visible twinkling
      final twinkleFreq = 0.05 + rng.nextDouble() * 0.28;
      final twinklePhase = rng.nextDouble() * math.pi * 2;
      return _StarData(
        x: x,
        y: y,
        radius: radius,
        baseOpacity: baseOpacity,
        twinkleFreq: twinkleFreq,
        twinklePhase: twinklePhase,
        color: _kStarColors[rng.nextInt(_kStarColors.length)],
      );
    });
  }

  @override
  void paint(Canvas canvas, Size size) {
    _paintNebulae(canvas, size);
    _paintPlanets(canvas, size);
    _paintStars(canvas, size);
  }

  // ── Nebulae ─────────────────────────────────────────────────────────────────

  void _paintNebulae(Canvas canvas, Size size) {
    for (final neb in _kNebulae) {
      // Slow breathing: ~35 s period, phase-shifted per nebula
      final breathe = 1.0 + math.sin(time * 0.18 + neb.nx * 9) * 0.045;
      final rx = neb.rx * size.width * breathe;
      final ry = neb.ry * size.height * breathe;
      final rect = Rect.fromCenter(
        center: Offset(neb.nx * size.width, neb.ny * size.height),
        width: rx * 2,
        height: ry * 2,
      );
      canvas.drawOval(
        rect,
        Paint()
          ..shader = RadialGradient(
            colors: [
              neb.color1.withValues(alpha: neb.alpha1),
              neb.color2.withValues(alpha: neb.alpha2),
              Colors.transparent,
            ],
            stops: const [0.0, 0.42, 1.0],
          ).createShader(rect),
      );
    }
  }

  // ── Planets ─────────────────────────────────────────────────────────────────

  void _paintPlanets(Canvas canvas, Size size) {
    for (final p in _kPlanets) {
      final cx = p.nx * size.width;
      final cy = p.ny * size.height;
      final center = Offset(cx, cy);
      final r = p.radius;

      // Outer glow halo
      canvas.drawCircle(
        center,
        p.glowRadius,
        Paint()
          ..shader = RadialGradient(
            colors: [
              p.colorMain.withValues(alpha: 0.34),
              p.colorMain.withValues(alpha: 0.14),
              Colors.transparent,
            ],
            stops: const [0.0, 0.38, 1.0],
          ).createShader(
            Rect.fromCircle(center: center, radius: p.glowRadius),
          ),
      );

      // Planet body — offset radial gradient for 3D sphere shading
      canvas.drawCircle(
        center,
        r,
        Paint()
          ..shader = RadialGradient(
            center: const Alignment(-0.34, -0.30),
            radius: 1.12,
            colors: [
              p.colorLight,
              p.colorMain,
              Color.fromRGBO(
                (p.colorMain.r * 255.0 * 0.35).round().clamp(0, 255),
                (p.colorMain.g * 255.0 * 0.35).round().clamp(0, 255),
                (p.colorMain.b * 255.0 * 0.35).round().clamp(0, 255),
                1.0,
              ),
            ],
            stops: const [0.0, 0.38, 1.0],
          ).createShader(Rect.fromCircle(center: center, radius: r)),
      );

      // Atmospheric rim glow
      canvas.drawCircle(
        center,
        r * 1.08,
        Paint()
          ..shader = RadialGradient(
            colors: [
              Colors.transparent,
              Colors.transparent,
              p.colorLight.withValues(alpha: 0.18),
            ],
            stops: const [0.0, 0.65, 1.0],
          ).createShader(Rect.fromCircle(center: center, radius: r * 1.08)),
      );

      // Ring system (squash Y by 0.26 to make ellipse, then evenOdd donut)
      if (p.hasRing) {
        canvas.save();
        canvas.translate(cx, cy);
        canvas.scale(1.0, 0.26);
        final ringPath = Path()
          ..addOval(Rect.fromCircle(center: Offset.zero, radius: r * 2.1))
          ..addOval(Rect.fromCircle(center: Offset.zero, radius: r * 1.08));
        ringPath.fillType = PathFillType.evenOdd;
        canvas.drawPath(
          ringPath,
          Paint()
            ..shader = RadialGradient(
              colors: [
                p.colorLight.withValues(alpha: 0.55),
                p.colorLight.withValues(alpha: 0.28),
                Colors.transparent,
              ],
              stops: const [0.0, 0.45, 1.0],
            ).createShader(
              Rect.fromCircle(center: Offset.zero, radius: r * 2.1),
            ),
        );
        canvas.restore();
      }

      // Specular highlight — small bright spot at top-left
      final specCenter = Offset(cx - r * 0.30, cy - r * 0.24);
      canvas.drawCircle(
        specCenter,
        r * 0.38,
        Paint()
          ..shader = RadialGradient(
            colors: [
              Colors.white.withValues(alpha: 0.32),
              Colors.transparent,
            ],
          ).createShader(
            Rect.fromCircle(center: specCenter, radius: r * 0.38),
          ),
      );
    }
  }

  // ── Stars ────────────────────────────────────────────────────────────────────

  void _paintStars(Canvas canvas, Size size) {
    for (final s in _stars) {
      final twinkle =
          0.55 + math.sin(time * s.twinkleFreq * math.pi * 2 + s.twinklePhase) * 0.45;
      final alpha = (s.baseOpacity * twinkle).clamp(0.0, 1.0);
      final center = Offset(s.x * size.width, s.y * size.height);

      // Soft glow halo for larger stars
      if (s.radius > 1.6) {
        final glowR = s.radius * 3.5;
        canvas.drawCircle(
          center,
          glowR,
          Paint()
            ..shader = RadialGradient(
              colors: [
                s.color.withValues(alpha: alpha * 0.50),
                s.color.withValues(alpha: alpha * 0.12),
                Colors.transparent,
              ],
              stops: const [0.0, 0.5, 1.0],
            ).createShader(Rect.fromCircle(center: center, radius: glowR)),
        );
      }

      // Star core
      canvas.drawCircle(
        center,
        s.radius,
        Paint()..color = s.color.withValues(alpha: alpha),
      );
    }
  }

  @override
  bool shouldRepaint(covariant _GalaxyPainter old) => old.time != time;
}
