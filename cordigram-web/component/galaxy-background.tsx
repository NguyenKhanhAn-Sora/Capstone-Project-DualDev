"use client";

import { useEffect, useRef } from "react";

interface Star {
  x: number;
  y: number;
  size: number;
  baseOpacity: number;
  twinkleSpeed: number;
  twinkleOffset: number;
  parallaxLayer: number;
  r: number;
  g: number;
  b: number;
}

const STAR_PALETTE: [number, number, number][] = [
  [255, 255, 255],
  [200, 220, 255],
  [255, 235, 200],
  [220, 200, 255],
  [180, 240, 255],
  [255, 200, 220],
];

function buildStars(count: number): Star[] {
  const stars: Star[] = [];
  for (let i = 0; i < count; i++) {
    const [r, g, b] = STAR_PALETTE[Math.floor(Math.random() * STAR_PALETTE.length)];
    stars.push({
      x: Math.random(),
      y: Math.random(),
      size: Math.pow(Math.random(), 2.2) * 2.8 + 0.25,
      baseOpacity: Math.random() * 0.55 + 0.35,
      twinkleSpeed: Math.random() * 0.022 + 0.004,
      twinkleOffset: Math.random() * Math.PI * 2,
      parallaxLayer: Math.random(),
      r, g, b,
    });
  }
  return stars;
}

interface Planet {
  nx: number;
  ny: number;
  radius: number;
  colorMain: [number, number, number];
  colorLight: [number, number, number];
  parallaxStrength: number;
  hasRing: boolean;
  ringTilt: number;
  glowRadius: number;
}

const PLANETS: Planet[] = [
  {
    nx: 0.86, ny: 0.09, radius: 42,
    colorMain: [72, 62, 210], colorLight: [130, 118, 255],
    parallaxStrength: 14, hasRing: false, ringTilt: 0, glowRadius: 100,
  },
  {
    nx: 0.05, ny: 0.72, radius: 26,
    colorMain: [196, 54, 138], colorLight: [238, 108, 178],
    parallaxStrength: 8, hasRing: false, ringTilt: 0, glowRadius: 65,
  },
  {
    nx: 0.64, ny: 0.035, radius: 18,
    colorMain: [18, 172, 196], colorLight: [76, 218, 238],
    parallaxStrength: 20, hasRing: true, ringTilt: 0.38, glowRadius: 50,
  },
  {
    nx: 0.42, ny: 0.90, radius: 13,
    colorMain: [214, 132, 24], colorLight: [255, 185, 70],
    parallaxStrength: 10, hasRing: false, ringTilt: 0, glowRadius: 38,
  },
];

interface Nebula {
  nx: number; ny: number;
  rx: number; ry: number;
  r1: number; g1: number; b1: number; a1: number;
  r2: number; g2: number; b2: number; a2: number;
  parallaxStrength: number;
}

const NEBULAE: Nebula[] = [
  { nx: 0.14, ny: 0.22, rx: 0.30, ry: 0.22, r1: 95, g1: 35, b1: 195, a1: 0.24, r2: 45, g2: 18, b2: 145, a2: 0.09, parallaxStrength: 5 },
  { nx: 0.80, ny: 0.52, rx: 0.26, ry: 0.24, r1: 215, g1: 55, b1: 158, a1: 0.20, r2: 155, g2: 38, b2: 195, a2: 0.08, parallaxStrength: 3 },
  { nx: 0.50, ny: 0.88, rx: 0.34, ry: 0.15, r1: 28, g1: 175, b1: 215, a1: 0.16, r2: 18, g2: 115, b2: 175, a2: 0.07, parallaxStrength: 4 },
  { nx: 0.28, ny: 0.58, rx: 0.22, ry: 0.19, r1: 55, g1: 195, b1: 135, a1: 0.14, r2: 35, g2: 145, b2: 95, a2: 0.06, parallaxStrength: 6 },
  { nx: 0.68, ny: 0.30, rx: 0.18, ry: 0.20, r1: 180, g1: 80, b1: 240, a1: 0.16, r2: 120, g2: 50, b2: 200, a2: 0.07, parallaxStrength: 4 },
];

export default function GalaxyBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const mouseRef = useRef({ x: 0.5, y: 0.5 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = 0, h = 0;
    const stars = buildStars(520);
    let frame = 0;

    const resize = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    };
    resize();

    const draw = () => {
      frame++;
      ctx.clearRect(0, 0, w, h);

      // Deep space background
      const bg = ctx.createLinearGradient(0, 0, w * 0.7, h);
      bg.addColorStop(0, "#01030c");
      bg.addColorStop(0.25, "#02051a");
      bg.addColorStop(0.55, "#040218");
      bg.addColorStop(0.80, "#050312");
      bg.addColorStop(1, "#01020a");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      const mx = mouseRef.current.x - 0.5;
      const my = mouseRef.current.y - 0.5;

      // Nebulae
      for (const neb of NEBULAE) {
        const px = neb.nx * w + mx * neb.parallaxStrength * 2;
        const py = neb.ny * h + my * neb.parallaxStrength * 2;
        const rx = neb.rx * w;
        const ry = neb.ry * h;
        const breathe = 1 + Math.sin(frame * 0.003 + neb.nx * 9) * 0.045;

        ctx.save();
        ctx.translate(px, py);
        ctx.scale(1, ry / rx);
        const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, rx * breathe);
        grad.addColorStop(0, `rgba(${neb.r1},${neb.g1},${neb.b1},${neb.a1})`);
        grad.addColorStop(0.42, `rgba(${neb.r2},${neb.g2},${neb.b2},${neb.a2})`);
        grad.addColorStop(1, `rgba(${neb.r2},${neb.g2},${neb.b2},0)`);
        ctx.beginPath();
        ctx.arc(0, 0, rx * breathe, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.restore();
      }

      // Stars
      for (const s of stars) {
        const parallaxX = mx * s.parallaxLayer * 20;
        const parallaxY = my * s.parallaxLayer * 20;
        const sx = ((s.x * w + parallaxX) % w + w) % w;
        const sy = ((s.y * h + parallaxY) % h + h) % h;
        const twinkle = 0.55 + Math.sin(frame * s.twinkleSpeed + s.twinkleOffset) * 0.45;
        const alpha = s.baseOpacity * twinkle;

        if (s.size > 1.4) {
          const glowR = s.size * 4;
          const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, glowR);
          glow.addColorStop(0, `rgba(${s.r},${s.g},${s.b},${alpha * 0.55})`);
          glow.addColorStop(0.5, `rgba(${s.r},${s.g},${s.b},${alpha * 0.15})`);
          glow.addColorStop(1, `rgba(${s.r},${s.g},${s.b},0)`);
          ctx.beginPath();
          ctx.arc(sx, sy, glowR, 0, Math.PI * 2);
          ctx.fillStyle = glow;
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(sx, sy, s.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${s.r},${s.g},${s.b},${alpha})`;
        ctx.fill();
      }

      // Planets
      for (const p of PLANETS) {
        const px = p.nx * w + mx * p.parallaxStrength;
        const py = p.ny * h + my * p.parallaxStrength;
        const [mr, mg, mb] = p.colorMain;
        const [lr, lg, lb] = p.colorLight;

        // Glow halo
        const glowGrad = ctx.createRadialGradient(px, py, 0, px, py, p.glowRadius);
        glowGrad.addColorStop(0, `rgba(${mr},${mg},${mb},0.34)`);
        glowGrad.addColorStop(0.38, `rgba(${mr},${mg},${mb},0.14)`);
        glowGrad.addColorStop(1, `rgba(${mr},${mg},${mb},0)`);
        ctx.beginPath();
        ctx.arc(px, py, p.glowRadius, 0, Math.PI * 2);
        ctx.fillStyle = glowGrad;
        ctx.fill();

        // Planet body — 3D shading
        const bodyGrad = ctx.createRadialGradient(
          px - p.radius * 0.34, py - p.radius * 0.30, p.radius * 0.04,
          px + p.radius * 0.14, py + p.radius * 0.14, p.radius * 1.12
        );
        bodyGrad.addColorStop(0, `rgb(${lr},${lg},${lb})`);
        bodyGrad.addColorStop(0.38, `rgb(${mr},${mg},${mb})`);
        bodyGrad.addColorStop(1, `rgb(${Math.round(mr * 0.35)},${Math.round(mg * 0.35)},${Math.round(mb * 0.35)})`);
        ctx.beginPath();
        ctx.arc(px, py, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = bodyGrad;
        ctx.fill();

        // Atmospheric rim
        const rimGrad = ctx.createRadialGradient(px, py, p.radius * 0.7, px, py, p.radius * 1.08);
        rimGrad.addColorStop(0, `rgba(${lr},${lg},${lb},0)`);
        rimGrad.addColorStop(1, `rgba(${lr},${lg},${lb},0.18)`);
        ctx.beginPath();
        ctx.arc(px, py, p.radius * 1.08, 0, Math.PI * 2);
        ctx.fillStyle = rimGrad;
        ctx.fill();

        // Ring system
        if (p.hasRing) {
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(p.ringTilt);
          ctx.scale(1, 0.26);
          const ringGrad = ctx.createRadialGradient(0, 0, p.radius * 1.12, 0, 0, p.radius * 2.1);
          ringGrad.addColorStop(0, `rgba(${lr},${lg},${lb},0.55)`);
          ringGrad.addColorStop(0.45, `rgba(${lr},${lg},${lb},0.28)`);
          ringGrad.addColorStop(1, `rgba(${lr},${lg},${lb},0)`);
          ctx.beginPath();
          ctx.arc(0, 0, p.radius * 2.1, 0, Math.PI * 2);
          ctx.arc(0, 0, p.radius * 1.08, 0, Math.PI * 2, true);
          ctx.fillStyle = ringGrad;
          ctx.fill();
          ctx.restore();
        }

        // Specular highlight
        const specGrad = ctx.createRadialGradient(
          px - p.radius * 0.30, py - p.radius * 0.24, 0,
          px - p.radius * 0.30, py - p.radius * 0.24, p.radius * 0.38
        );
        specGrad.addColorStop(0, "rgba(255,255,255,0.32)");
        specGrad.addColorStop(1, "rgba(255,255,255,0)");
        ctx.beginPath();
        ctx.arc(px - p.radius * 0.30, py - p.radius * 0.24, p.radius * 0.38, 0, Math.PI * 2);
        ctx.fillStyle = specGrad;
        ctx.fill();
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    const onMouse = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX / w, y: e.clientY / h };
    };
    const onTouch = (e: TouchEvent) => {
      const t = e.touches[0];
      if (t) mouseRef.current = { x: t.clientX / w, y: t.clientY / h };
    };

    window.addEventListener("resize", resize);
    window.addEventListener("mousemove", onMouse, { passive: true });
    window.addEventListener("touchmove", onTouch, { passive: true });
    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMouse);
      window.removeEventListener("touchmove", onTouch);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100vh",
        zIndex: -1,
        pointerEvents: "none",
      }}
    />
  );
}
