import 'dart:math' as math;
import 'package:flutter/material.dart';

// ── Success screen shown after a story is posted ──────────────────────────────

class StorySuccessScreen extends StatefulWidget {
  const StorySuccessScreen({
    super.key,
    required this.onPostAnother,
    required this.onGoHome,
  });

  final VoidCallback onPostAnother;
  final VoidCallback onGoHome;

  @override
  State<StorySuccessScreen> createState() => _StorySuccessScreenState();
}

class _StorySuccessScreenState extends State<StorySuccessScreen>
    with TickerProviderStateMixin {
  // Conic ring expansion
  late final AnimationController _ringCtrl;
  late final Animation<double> _ringScale;

  // Checkmark draw (starts after ring)
  late final AnimationController _checkCtrl;
  late final Animation<double> _checkProgress;

  // Pulsate after draw completes
  late final AnimationController _pulseCtrl;
  late final Animation<double> _pulseScale;

  // Floating sparks (6 colored dots)
  late final List<AnimationController> _sparkCtrs;

  // Title / button fade in
  late final AnimationController _fadeCtrl;
  late final Animation<double> _fadeAnim;

  // Twinkling stars
  late final AnimationController _twinkleCtrl;

  // Pre-generated star positions (static layer)
  late final List<_Star> _stars;

  static const _sparkDelays = [0, 400, 800, 1100, 600, 1400];
  static const _sparkDurations = [2000, 1700, 2200, 1900, 2100, 1600];
  static const _sparkColors = [
    Color(0xFFA78BFA),
    Color(0xFF60A5FA),
    Color(0xFFF472B6),
    Color(0xFF34D399),
    Color(0xFFFBBF24),
    Color(0xFFC084FC),
  ];
  // Position offsets from the ring center (100, 100)
  static const _sparkOffsets = [
    Offset(-50, -65),
    Offset(48, -72),
    Offset(-72, 12),
    Offset(70, 18),
    Offset(-28, 62),
    Offset(42, 58),
  ];

  @override
  void initState() {
    super.initState();

    final rng = math.Random(7);
    _stars = List.generate(90, (_) => _Star(
          x: rng.nextDouble(),
          y: rng.nextDouble(),
          radius: rng.nextDouble() * 1.6 + 0.3,
          opacity: rng.nextDouble() * 0.65 + 0.1,
          isTwinkling: rng.nextBool() && rng.nextBool(),
        ));

    // Ring expands with spring-like overshoot
    _ringCtrl = AnimationController(
        vsync: this, duration: const Duration(milliseconds: 600));
    _ringScale = Tween<double>(begin: 0, end: 1).animate(
      CurvedAnimation(
          parent: _ringCtrl,
          curve: const Cubic(0.34, 1.25, 0.64, 1)),
    );

    // Checkmark draw
    _checkCtrl = AnimationController(
        vsync: this, duration: const Duration(milliseconds: 500));
    _checkProgress = Tween<double>(begin: 0, end: 1).animate(
      CurvedAnimation(parent: _checkCtrl, curve: Curves.easeInOut),
    );

    // Pulsate infinitely
    _pulseCtrl = AnimationController(
        vsync: this, duration: const Duration(milliseconds: 2500))
      ..repeat(reverse: true);
    _pulseScale = Tween<double>(begin: 0.88, end: 1.0).animate(
      CurvedAnimation(parent: _pulseCtrl, curve: Curves.easeInOut),
    );

    // Sparks
    _sparkCtrs = List.generate(
      6,
      (i) => AnimationController(
          vsync: this, duration: Duration(milliseconds: _sparkDurations[i])),
    );

    // Fade-in for text + buttons
    _fadeCtrl = AnimationController(
        vsync: this, duration: const Duration(milliseconds: 700));
    _fadeAnim = Tween<double>(begin: 0, end: 1).animate(
      CurvedAnimation(parent: _fadeCtrl, curve: Curves.easeOut),
    );

    // Twinkle controller drives star opacity oscillation
    _twinkleCtrl = AnimationController(
        vsync: this, duration: const Duration(seconds: 3))
      ..repeat(reverse: true);

    // Sequence
    _ringCtrl.forward().then((_) {
      Future.delayed(const Duration(milliseconds: 350), () {
        if (mounted) _checkCtrl.forward();
      });
    });
    Future.delayed(const Duration(milliseconds: 750), () {
      if (mounted) _fadeCtrl.forward();
    });
    for (int i = 0; i < 6; i++) {
      Future.delayed(Duration(milliseconds: _sparkDelays[i]), () {
        if (mounted) _sparkCtrs[i].repeat();
      });
    }
  }

  @override
  void dispose() {
    _ringCtrl.dispose();
    _checkCtrl.dispose();
    _pulseCtrl.dispose();
    for (final c in _sparkCtrs) {
      c.dispose();
    }
    _fadeCtrl.dispose();
    _twinkleCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size;

    return Scaffold(
      backgroundColor: const Color(0xFF080512),
      body: Stack(
        children: [
          // ── Static + twinkling starfield ──────────────────────────
          AnimatedBuilder(
            animation: _twinkleCtrl,
            builder: (_, __) => CustomPaint(
              painter: _StarfieldPainter(
                  stars: _stars, twinkleT: _twinkleCtrl.value),
              size: size,
            ),
          ),

          // ── Purple/blue ambient glow ──────────────────────────────
          Container(
            decoration: const BoxDecoration(
              gradient: RadialGradient(
                center: Alignment(0.6, -0.3),
                radius: 1.2,
                colors: [Color(0x156366F1), Colors.transparent],
              ),
            ),
          ),
          Container(
            decoration: const BoxDecoration(
              gradient: RadialGradient(
                center: Alignment(-0.7, 0.8),
                radius: 0.9,
                colors: [Color(0x107C3AED), Colors.transparent],
              ),
            ),
          ),

          // ── Main content ──────────────────────────────────────────
          Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                // Checkmark ring + sparks
                SizedBox(
                  width: 200,
                  height: 200,
                  child: Stack(
                    alignment: Alignment.center,
                    children: [
                      // Floating sparks
                      ..._buildSparks(),

                      // Outer glow ring (conic gradient)
                      AnimatedBuilder(
                        animation: _ringScale,
                        builder: (_, __) => Transform.scale(
                          scale: _ringScale.value,
                          child: CustomPaint(
                            size: const Size(164, 164),
                            painter: _RingPainter(),
                          ),
                        ),
                      ),

                      // Inner dark circle
                      Container(
                        width: 144,
                        height: 144,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          gradient: const LinearGradient(
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight,
                            colors: [Color(0xFF1E1540), Color(0xFF2D1F5E)],
                          ),
                          boxShadow: [
                            BoxShadow(
                              color: const Color(0xFF6366F1)
                                  .withValues(alpha: 0.35),
                              blurRadius: 36,
                            ),
                          ],
                        ),
                      ),

                      // Animated checkmark
                      AnimatedBuilder(
                        animation:
                            Listenable.merge([_checkProgress, _pulseScale]),
                        builder: (_, __) => Transform.scale(
                          scale: _checkCtrl.isCompleted
                              ? _pulseScale.value
                              : 1.0,
                          child: CustomPaint(
                            size: const Size(60, 60),
                            painter: _CheckmarkPainter(
                                progress: _checkProgress.value),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),

                const SizedBox(height: 44),

                // Title + subtitle
                FadeTransition(
                  opacity: _fadeAnim,
                  child: Column(
                    children: [
                      ShaderMask(
                        shaderCallback: (b) => const LinearGradient(
                          colors: [
                            Color(0xFFE0D7FF),
                            Color(0xFFA78BFA),
                            Color(0xFF60A5FA),
                          ],
                        ).createShader(b),
                        child: const Text(
                          'Story đã được đăng!',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 24,
                            fontWeight: FontWeight.w800,
                            letterSpacing: -0.3,
                          ),
                        ),
                      ),
                      const SizedBox(height: 10),
                      const Text(
                        'Story của bạn đã được chia sẻ với mọi người',
                        style: TextStyle(
                          color: Color(0xFF94A3B8),
                          fontSize: 14,
                        ),
                      ),
                    ],
                  ),
                ),

                const SizedBox(height: 48),

                // Buttons
                FadeTransition(
                  opacity: _fadeAnim,
                  child: Column(
                    children: [
                      // Primary: post another
                      GestureDetector(
                        onTap: widget.onPostAnother,
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 36, vertical: 15),
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(32),
                            gradient: const LinearGradient(
                              colors: [Color(0xFF6366F1), Color(0xFF8B5CF6)],
                            ),
                            boxShadow: [
                              BoxShadow(
                                color: const Color(0xFF6366F1)
                                    .withValues(alpha: 0.45),
                                blurRadius: 24,
                              ),
                              BoxShadow(
                                color: const Color(0xFF8B5CF6)
                                    .withValues(alpha: 0.2),
                                blurRadius: 40,
                              ),
                            ],
                          ),
                          child: const Text(
                            'Đăng story khác',
                            style: TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.w700,
                              fontSize: 16,
                            ),
                          ),
                        ),
                      ),

                      const SizedBox(height: 18),

                      // Secondary: go home
                      GestureDetector(
                        onTap: widget.onGoHome,
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 32, vertical: 12),
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(24),
                            border: Border.all(
                                color: Colors.white.withValues(alpha: 0.15)),
                          ),
                          child: const Text(
                            'Về trang chủ',
                            style: TextStyle(
                              color: Color(0xFFCBD5E1),
                              fontWeight: FontWeight.w600,
                              fontSize: 15,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  List<Widget> _buildSparks() {
    return List.generate(6, (i) {
      return AnimatedBuilder(
        animation: _sparkCtrs[i],
        builder: (_, __) {
          final t = _sparkCtrs[i].value;
          final off = _sparkOffsets[i];
          final opacity = (1 - t).clamp(0.0, 1.0);
          return Positioned(
            left: 100 + off.dx - 2.5,
            top: 100 + off.dy - t * 52 - 2.5,
            child: Opacity(
              opacity: opacity,
              child: Container(
                width: 5,
                height: 5,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: _sparkColors[i],
                  boxShadow: [
                    BoxShadow(
                      color: _sparkColors[i].withValues(alpha: 0.8),
                      blurRadius: 6,
                    ),
                  ],
                ),
              ),
            ),
          );
        },
      );
    });
  }
}

// ── Star data ─────────────────────────────────────────────────────────────────

class _Star {
  const _Star({
    required this.x,
    required this.y,
    required this.radius,
    required this.opacity,
    required this.isTwinkling,
  });
  final double x, y, radius, opacity;
  final bool isTwinkling;
}

// ── Starfield painter ─────────────────────────────────────────────────────────

class _StarfieldPainter extends CustomPainter {
  const _StarfieldPainter({required this.stars, required this.twinkleT});
  final List<_Star> stars;
  final double twinkleT; // 0 → 1 oscillating

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint();
    for (final s in stars) {
      final opacity = s.isTwinkling
          ? (s.opacity * (0.3 + 0.7 * (0.5 + 0.5 * math.sin(twinkleT * math.pi))))
              .clamp(0.0, 1.0)
          : s.opacity;
      paint.color = Colors.white.withValues(alpha: opacity);
      canvas.drawCircle(
          Offset(s.x * size.width, s.y * size.height), s.radius, paint);
    }
  }

  @override
  bool shouldRepaint(_StarfieldPainter old) => old.twinkleT != twinkleT;
}

// ── Conic gradient ring ───────────────────────────────────────────────────────

class _RingPainter extends CustomPainter {
  const _RingPainter();

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = size.width / 2 - 3;

    final shader = SweepGradient(
      colors: const [
        Color(0xFF4F46E5),
        Color(0xFF7C3AED),
        Color(0xFFA855F7),
        Color(0xFFC084FC),
        Color(0xFF60A5FA),
        Color(0xFF4F46E5),
      ],
    ).createShader(Rect.fromCircle(center: center, radius: radius));

    canvas.drawCircle(
      center,
      radius,
      Paint()
        ..shader = shader
        ..style = PaintingStyle.stroke
        ..strokeWidth = 4.5
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 2),
    );
  }

  @override
  bool shouldRepaint(_RingPainter _) => false;
}

// ── Animated checkmark ────────────────────────────────────────────────────────

class _CheckmarkPainter extends CustomPainter {
  const _CheckmarkPainter({required this.progress});
  final double progress;

  @override
  void paint(Canvas canvas, Size size) {
    if (progress <= 0) return;

    final p1 = Offset(size.width * 0.18, size.height * 0.50);
    final p2 = Offset(size.width * 0.42, size.height * 0.73);
    final p3 = Offset(size.width * 0.80, size.height * 0.27);

    final seg1 = (p2 - p1).distance;
    final seg2 = (p3 - p2).distance;
    final total = seg1 + seg2;
    final drawn = progress * total;

    final path = Path()..moveTo(p1.dx, p1.dy);
    if (drawn <= seg1) {
      final t = drawn / seg1;
      path.lineTo(p1.dx + (p2.dx - p1.dx) * t, p1.dy + (p2.dy - p1.dy) * t);
    } else {
      final t2 = (drawn - seg1) / seg2;
      path.lineTo(p2.dx, p2.dy);
      path.lineTo(
          p2.dx + (p3.dx - p2.dx) * t2, p2.dy + (p3.dy - p2.dy) * t2);
    }

    canvas.drawPath(
      path,
      Paint()
        ..color = Colors.white
        ..strokeWidth = 3.5
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round
        ..style = PaintingStyle.stroke,
    );
  }

  @override
  bool shouldRepaint(_CheckmarkPainter old) => old.progress != progress;
}
