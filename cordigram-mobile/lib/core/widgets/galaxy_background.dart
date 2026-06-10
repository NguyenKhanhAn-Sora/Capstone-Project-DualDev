import 'package:flutter/material.dart';

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
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 9),
    )..repeat(reverse: true);
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
        // Deep-space base gradient (static)
        const DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [Color(0xFF050814), Color(0xFF080E28), Color(0xFF050814)],
              stops: [0.0, 0.5, 1.0],
            ),
          ),
        ),
        // Animated nebula glows
        RepaintBoundary(
          child: reduceMotion
              ? const _NebulaLayer(t: 0.5)
              : AnimatedBuilder(
                  animation: _controller,
                  builder: (_, __) => _NebulaLayer(t: _controller.value),
                ),
        ),
        // Static deterministic star field
        const RepaintBoundary(
          child: CustomPaint(painter: _StarFieldPainter()),
        ),
        // App content
        widget.child,
      ],
    );
  }
}

// ── Nebula glow layer ─────────────────────────────────────────────────────────

class _NebulaLayer extends StatelessWidget {
  const _NebulaLayer({required this.t});

  final double t;

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size;
    return Stack(
      fit: StackFit.expand,
      children: [
        // Violet nebula — top-left
        Positioned(
          top: -140,
          left: -90,
          child: _Orb(
            size: 400,
            color: Color.fromRGBO(124, 58, 237, 0.18 + t * 0.12),
          ),
        ),
        // Cyan nebula — bottom-right
        Positioned(
          bottom: -100,
          right: -70,
          child: _Orb(
            size: 320,
            color: Color.fromRGBO(14, 165, 233, 0.14 + (1 - t) * 0.09),
          ),
        ),
        // Indigo accent glow — centre-right
        Positioned(
          top: size.height * 0.3,
          right: -120,
          child: _Orb(
            size: 280,
            color: Color.fromRGBO(99, 102, 241, 0.10 + t * 0.07),
          ),
        ),
        // Rose accent — lower-left
        Positioned(
          bottom: size.height * 0.15,
          left: -80,
          child: _Orb(
            size: 220,
            color: Color.fromRGBO(168, 85, 247, 0.08 + (1 - t) * 0.06),
          ),
        ),
      ],
    );
  }
}

class _Orb extends StatelessWidget {
  const _Orb({required this.size, required this.color});

  final double size;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: size,
      height: size,
      child: DecoratedBox(
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          gradient: RadialGradient(
            colors: [color, Colors.transparent],
            stops: const [0.0, 1.0],
          ),
        ),
      ),
    );
  }
}

// ── Star field ────────────────────────────────────────────────────────────────

class _StarFieldPainter extends CustomPainter {
  const _StarFieldPainter();

  // Deterministic star list — computed once at class-load, never randomised.
  static final List<_Star> _stars = List.generate(140, (i) {
    final x = ((i * 1234567 + 891234) % 100000) / 100000.0;
    final y = ((i * 2345678 + 123456) % 100000) / 100000.0;
    final radius = 0.5 + ((i * 765432) % 10000) / 10000.0 * 1.6;
    final opacity = 0.20 + ((i * 543210) % 10000) / 10000.0 * 0.60;
    return _Star(x: x, y: y, radius: radius, opacity: opacity);
  });

  @override
  void paint(Canvas canvas, Size size) {
    for (final s in _stars) {
      canvas.drawCircle(
        Offset(s.x * size.width, s.y * size.height),
        s.radius,
        Paint()
          ..color = Color.fromRGBO(255, 255, 255, s.opacity)
          ..style = PaintingStyle.fill,
      );
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter old) => false;
}

class _Star {
  const _Star({
    required this.x,
    required this.y,
    required this.radius,
    required this.opacity,
  });

  final double x;
  final double y;
  final double radius;
  final double opacity;
}
