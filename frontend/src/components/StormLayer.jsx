import { useEffect, useRef } from "react";

// Rain and lightning drawn on a canvas behind the top bar's content (Odyssey theme).
const FLASH_MS = 260;

function makeBolt(w, h) {
  // A jagged bolt from the top edge to the bottom, with one small fork.
  const pts = [];
  let x = w * (0.15 + Math.random() * 0.7);
  let y = 0;
  pts.push([x, y]);
  while (y < h) {
    y += h * (0.12 + Math.random() * 0.18);
    x += (Math.random() - 0.5) * 34;
    pts.push([x, Math.min(y, h)]);
  }
  const forkAt = pts[Math.max(1, Math.floor(pts.length / 2))];
  const fork = [forkAt, [forkAt[0] + (Math.random() > 0.5 ? 1 : -1) * (18 + Math.random() * 20), forkAt[1] + h * 0.3]];
  return { pts, fork };
}

export default function StormLayer() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    if (!canvas || !host) return;
    const ctx = canvas.getContext("2d");
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0;
    let h = 0;
    let drops = [];
    let raf = 0;
    let last = performance.now();
    let nextFlash = last + 1500 + Math.random() * 3000;
    let flash = null;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = host.clientWidth;
      h = host.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.round((w * h) / 900);
      drops = Array.from({ length: count }, () => ({
        x: Math.random() * (w + 60) - 30,
        y: Math.random() * h,
        len: 7 + Math.random() * 10,
        speed: 260 + Math.random() * 260, // px per second
        alpha: 0.18 + Math.random() * 0.3,
      }));
      if (reduceMotion) draw(0, performance.now());
    };

    const draw = (dt, now) => {
      ctx.clearRect(0, 0, w, h);

      // Lightning: a quick double flicker that lights the clouds, plus the bolt itself.
      if (flash) {
        const age = now - flash.start;
        if (age > FLASH_MS) {
          flash = null;
        } else {
          const flicker = age < 70 ? 1 : age < 120 ? 0.25 : age < 190 ? 0.8 : 0.3;
          ctx.fillStyle = `rgba(210, 222, 255, ${0.22 * flicker})`;
          ctx.fillRect(0, 0, w, h);
          ctx.save();
          ctx.shadowColor = "rgba(180, 205, 255, 0.95)";
          ctx.shadowBlur = 14;
          ctx.strokeStyle = `rgba(245, 248, 255, ${flicker})`;
          ctx.lineWidth = 2;
          ctx.lineJoin = "round";
          for (const line of [flash.bolt.pts, flash.bolt.fork]) {
            ctx.beginPath();
            line.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
            ctx.stroke();
          }
          ctx.restore();
        }
      }

      // Rain, blown slightly to the left.
      ctx.lineCap = "round";
      ctx.lineWidth = 1;
      for (const d of drops) {
        if (dt) {
          d.y += d.speed * dt;
          d.x -= d.speed * dt * 0.22;
          if (d.y > h + d.len) {
            d.y = -d.len;
            d.x = Math.random() * (w + 60) - 30;
          }
        }
        ctx.strokeStyle = `rgba(190, 205, 235, ${d.alpha})`;
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x + d.len * 0.22, d.y - d.len);
        ctx.stroke();
      }
    };

    const tick = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (now >= nextFlash) {
        flash = { start: now, bolt: makeBolt(w, h) };
        nextFlash = now + 3500 + Math.random() * 6500;
      }
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

  return <canvas ref={canvasRef} className="storm-layer" aria-hidden="true" />;
}
