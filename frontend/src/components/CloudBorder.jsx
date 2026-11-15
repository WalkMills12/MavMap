import { useEffect, useRef } from "react";

// Odyssey theme: a frame of soft, slowly drifting clouds around the edge of the map.
// Drawn on a canvas over the map that ignores the mouse, so the map stays fully usable.
const SPACING = 34; // px between cloud puffs along the edge
const DRIFT = 9; // px per second the clouds travel around the frame

function makePuffSprite(inner, outer) {
  const size = 128;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.55, outer);
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

export default function CloudBorder() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    if (!canvas || !host) return;
    const ctx = canvas.getContext("2d");
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Two layers: darker storm clouds behind, pale parchment-white clouds in front.
    const back = makePuffSprite("rgba(120,110,150,0.85)", "rgba(90,80,120,0.45)");
    const front = makePuffSprite("rgba(246,240,226,0.95)", "rgba(226,218,205,0.55)");
    let w = 0;
    let h = 0;
    let puffs = [];
    let raf = 0;
    let last = performance.now();

    // Map a distance along the frame's perimeter to a point on the edge, plus the inward direction.
    const onEdge = (s) => {
      const P = 2 * (w + h);
      s = ((s % P) + P) % P;
      if (s < w) return { x: s, y: 0, nx: 0, ny: 1 };
      s -= w;
      if (s < h) return { x: w, y: s, nx: -1, ny: 0 };
      s -= h;
      if (s < w) return { x: w - s, y: h, nx: 0, ny: -1 };
      s -= w;
      return { x: 0, y: h - s, nx: 1, ny: 0 };
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = host.clientWidth;
      h = host.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const P = 2 * (w + h);
      const count = Math.max(24, Math.round(P / SPACING));
      puffs = Array.from({ length: count * 2 }, (_, i) => ({
        s: (i % count) * (P / count) + Math.random() * SPACING,
        layer: i < count ? "back" : "front",
        r: (i < count ? 46 : 34) + Math.random() * 26,
        depth: Math.random() * 10, // how far the puff reaches into the map
        speed: DRIFT * (0.6 + Math.random() * 0.8),
        phase: Math.random() * Math.PI * 2,
      }));
      if (reduceMotion) draw(0, 0);
    };

    const draw = (dt, t) => {
      ctx.clearRect(0, 0, w, h);
      // A soft mist along the edges ties the puffs together.
      const mist = 28;
      const edges = [
        { rect: [0, 0, w, mist], from: [0, 0], to: [0, mist] }, // top
        { rect: [0, h - mist, w, mist], from: [0, h], to: [0, h - mist] }, // bottom
        { rect: [0, 0, mist, h], from: [0, 0], to: [mist, 0] }, // left
        { rect: [w - mist, 0, mist, h], from: [w, 0], to: [w - mist, 0] }, // right
      ];
      for (const { rect, from, to } of edges) {
        const grad = ctx.createLinearGradient(from[0], from[1], to[0], to[1]);
        grad.addColorStop(0, "rgba(236,228,214,0.55)");
        grad.addColorStop(1, "rgba(236,228,214,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(...rect);
      }
      for (const layer of ["back", "front"]) {
        const sprite = layer === "back" ? back : front;
        for (const p of puffs) {
          if (p.layer !== layer) continue;
          if (dt) p.s += p.speed * dt;
          const e = onEdge(p.s);
          const bob = Math.sin(t / 1600 + p.phase) * 4;
          const r = p.r + Math.sin(t / 2300 + p.phase * 2) * 4;
          // Center sits just outside the edge, so only the puffy inner half shows.
          const cx = e.x + e.nx * (p.depth - r * 0.3 + bob);
          const cy = e.y + e.ny * (p.depth - r * 0.3 + bob);
          ctx.globalAlpha = layer === "back" ? 0.55 : 0.85;
          ctx.drawImage(sprite, cx - r, cy - r, r * 2, r * 2);
        }
      }
      ctx.globalAlpha = 1;
    };

    const tick = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      draw(dt, now);
      raf = requestAnimationFrame(tick);
    };

    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();
    if (!reduceMotion) raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className="cloud-border" aria-hidden="true" />;
}
