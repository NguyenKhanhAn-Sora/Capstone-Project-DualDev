import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';

/// Nền galaxy cho Messages — port `cordigram-web/component/galaxy-background.tsx`.
class MessagesGalaxyBackground extends StatefulWidget {
  const MessagesGalaxyBackground({super.key});

  @override
  State<MessagesGalaxyBackground> createState() =>
      _MessagesGalaxyBackgroundState();
}

class _MessagesGalaxyBackgroundState extends State<MessagesGalaxyBackground>
    with SingleTickerProviderStateMixin {
  late final Ticker _ticker;
  double _frame = 0;
  late final List<_Star> _stars;
  final math.Random _rng = math.Random(42);

  @override
  void initState() {
    super.initState();
    _stars = _buildStars(420);
    _ticker = createTicker((elapsed) {
      setState(() => _frame = elapsed.inMilliseconds / 16.0);
    })..start();
  }

  @override
  void dispose() {
    _ticker.dispose();
    super.dispose();
  }

  List<_Star> _buildStars(int count) {
    const palette = <List<int>>[
      [255, 255, 255],
      [200, 220, 255],
      [255, 235, 200],
      [220, 200, 255],
      [180, 240, 255],
      [255, 200, 220],
    ];
    return List.generate(count, (_) {
      final rgb = palette[_rng.nextInt(palette.length)];
      return _Star(
        x: _rng.nextDouble(),
        y: _rng.nextDouble(),
        size: math.pow(_rng.nextDouble(), 2.2) * 2.8 + 0.25,
        baseOpacity: _rng.nextDouble() * 0.55 + 0.35,
        twinkleSpeed: _rng.nextDouble() * 0.022 + 0.004,
        twinkleOffset: _rng.nextDouble() * math.pi * 2,
        parallaxLayer: _rng.nextDouble(),
        r: rgb[0],
        g: rgb[1],
        b: rgb[2],
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    return RepaintBoundary(
      child: CustomPaint(
        painter: _GalaxyPainter(frame: _frame, stars: _stars),
        size: Size.infinite,
      ),
    );
  }
}

class _Star {
  const _Star({
    required this.x,
    required this.y,
    required this.size,
    required this.baseOpacity,
    required this.twinkleSpeed,
    required this.twinkleOffset,
    required this.parallaxLayer,
    required this.r,
    required this.g,
    required this.b,
  });

  final double x;
  final double y;
  final double size;
  final double baseOpacity;
  final double twinkleSpeed;
  final double twinkleOffset;
  final double parallaxLayer;
  final int r;
  final int g;
  final int b;
}

class _GalaxyPainter extends CustomPainter {
  _GalaxyPainter({required this.frame, required this.stars});

  final double frame;
  final List<_Star> stars;

  static const _nebulae = <_Nebula>[
    _Nebula(0.14, 0.22, 0.30, 0.22, 95, 35, 195, 0.24, 45, 18, 145, 0.09, 5),
    _Nebula(0.80, 0.52, 0.26, 0.24, 215, 55, 158, 0.20, 155, 38, 195, 0.08, 3),
    _Nebula(0.50, 0.88, 0.34, 0.15, 28, 175, 215, 0.16, 18, 115, 175, 0.07, 4),
    _Nebula(0.28, 0.58, 0.22, 0.19, 55, 195, 135, 0.14, 35, 145, 95, 0.06, 6),
    _Nebula(0.68, 0.30, 0.18, 0.20, 180, 80, 240, 0.16, 120, 50, 200, 0.07, 4),
  ];

  static const _planets = <_Planet>[
    _Planet(0.86, 0.09, 42, 72, 62, 210, 130, 118, 255, 14, false, 0, 100),
    _Planet(0.05, 0.72, 26, 196, 54, 138, 238, 108, 178, 8, false, 0, 65),
    _Planet(0.64, 0.035, 18, 18, 172, 196, 76, 218, 238, 20, true, 0.38, 50),
    _Planet(0.42, 0.90, 13, 214, 132, 24, 255, 185, 70, 10, false, 0, 38),
  ];

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    if (w <= 0 || h <= 0) return;

    final bg = ui.Gradient.linear(
      Offset.zero,
      Offset(w * 0.7, h),
      const [
        Color(0xFF01030C),
        Color(0xFF02051A),
        Color(0xFF040218),
        Color(0xFF050312),
        Color(0xFF01020A),
      ],
      [0, 0.25, 0.55, 0.80, 1],
    );
    canvas.drawRect(Rect.fromLTWH(0, 0, w, h), Paint()..shader = bg);

    for (final neb in _nebulae) {
      final px = neb.nx * w;
      final py = neb.ny * h;
      final rx = neb.rx * w;
      final ry = neb.ry * h;
      final breathe = 1 + math.sin(frame * 0.003 + neb.nx * 9) * 0.045;
      final grad = ui.Gradient.radial(
        Offset(px, py),
        rx * breathe,
        [
          Color.fromRGBO(neb.r1, neb.g1, neb.b1, neb.a1),
          Color.fromRGBO(neb.r2, neb.g2, neb.b2, neb.a2),
          Color.fromRGBO(neb.r2, neb.g2, neb.b2, 0),
        ],
        [0, 0.42, 1],
      );
      canvas.save();
      canvas.translate(px, py);
      canvas.scale(1, ry / rx);
      canvas.drawCircle(
        Offset.zero,
        rx * breathe,
        Paint()..shader = grad,
      );
      canvas.restore();
    }

    for (final s in stars) {
      final sx = s.x * w;
      final sy = s.y * h;
      final twinkle =
          0.55 + math.sin(frame * s.twinkleSpeed + s.twinkleOffset) * 0.45;
      final alpha = s.baseOpacity * twinkle;

      if (s.size > 1.4) {
        final glowR = s.size * 4;
        final glow = ui.Gradient.radial(
          Offset(sx, sy),
          glowR,
          [
            Color.fromRGBO(s.r, s.g, s.b, alpha * 0.55),
            Color.fromRGBO(s.r, s.g, s.b, alpha * 0.15),
            Color.fromRGBO(s.r, s.g, s.b, 0),
          ],
          [0, 0.5, 1],
        );
        canvas.drawCircle(
          Offset(sx, sy),
          glowR,
          Paint()..shader = glow,
        );
      }

      canvas.drawCircle(
        Offset(sx, sy),
        s.size,
        Paint()..color = Color.fromRGBO(s.r, s.g, s.b, alpha),
      );
    }

    for (final p in _planets) {
      final px = p.nx * w;
      final py = p.ny * h;
      final glow = ui.Gradient.radial(
        Offset(px, py),
        p.glowRadius,
        [
          Color.fromRGBO(p.mr, p.mg, p.mb, 0.34),
          Color.fromRGBO(p.mr, p.mg, p.mb, 0.14),
          Color.fromRGBO(p.mr, p.mg, p.mb, 0),
        ],
        [0, 0.38, 1],
      );
      canvas.drawCircle(
        Offset(px, py),
        p.glowRadius,
        Paint()..shader = glow,
      );

      final body = ui.Gradient.radial(
        Offset(px - p.radius * 0.34, py - p.radius * 0.30),
        p.radius * 1.12,
        [
          Color.fromRGBO(p.lr, p.lg, p.lb, 1),
          Color.fromRGBO(p.mr, p.mg, p.mb, 1),
          Color.fromRGBO(
            (p.mr * 0.35).round(),
            (p.mg * 0.35).round(),
            (p.mb * 0.35).round(),
            1,
          ),
        ],
        [0, 0.38, 1],
      );
      canvas.drawCircle(
        Offset(px, py),
        p.radius,
        Paint()..shader = body,
      );

      if (p.hasRing) {
        canvas.save();
        canvas.translate(px, py);
        canvas.rotate(p.ringTilt);
        canvas.scale(1, 0.26);
        final ring = ui.Gradient.radial(
          Offset.zero,
          p.radius * 2.1,
          [
            Color.fromRGBO(p.lr, p.lg, p.lb, 0.55),
            Color.fromRGBO(p.lr, p.lg, p.lb, 0.28),
            Color.fromRGBO(p.lr, p.lg, p.lb, 0),
          ],
          [0, 0.45, 1],
        );
        final path = Path()
          ..addOval(Rect.fromCircle(center: Offset.zero, radius: p.radius * 2.1))
          ..addOval(Rect.fromCircle(center: Offset.zero, radius: p.radius * 1.08))
          ..fillType = PathFillType.evenOdd;
        canvas.drawPath(path, Paint()..shader = ring);
        canvas.restore();
      }
    }
  }

  @override
  bool shouldRepaint(covariant _GalaxyPainter oldDelegate) =>
      oldDelegate.frame != frame;
}

class _Nebula {
  const _Nebula(
    this.nx,
    this.ny,
    this.rx,
    this.ry,
    this.r1,
    this.g1,
    this.b1,
    this.a1,
    this.r2,
    this.g2,
    this.b2,
    this.a2,
    this.parallaxStrength,
  );

  final double nx;
  final double ny;
  final double rx;
  final double ry;
  final int r1;
  final int g1;
  final int b1;
  final double a1;
  final int r2;
  final int g2;
  final int b2;
  final double a2;
  final double parallaxStrength;
}

class _Planet {
  const _Planet(
    this.nx,
    this.ny,
    this.radius,
    this.mr,
    this.mg,
    this.mb,
    this.lr,
    this.lg,
    this.lb,
    this.parallaxStrength,
    this.hasRing,
    this.ringTilt,
    this.glowRadius,
  );

  final double nx;
  final double ny;
  final double radius;
  final int mr;
  final int mg;
  final int mb;
  final int lr;
  final int lg;
  final int lb;
  final double parallaxStrength;
  final bool hasRing;
  final double ringTilt;
  final double glowRadius;
}
