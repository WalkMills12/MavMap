import { useEffect } from "react";

// Odyssey theme: every click swings a bronze spear into the spot, with a golden swoosh and sparks.
const SPEAR_PX = 72; // drawn size of the swinging spear
const TIP = (2 / 32) * SPEAR_PX; // spear tip offset inside its 32×32 artwork
const PIVOT = (30 / 32) * SPEAR_PX; // butt of the shaft, where the hand "holds" it
const START_ANGLE = -70; // degrees the spear starts back from the strike
const MAX_ACTIVE = 6;

const SPEAR_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="${SPEAR_PX}" height="${SPEAR_PX}">
  <line x1="9" y1="9" x2="30" y2="30" stroke="#3b2412" stroke-width="3.6" stroke-linecap="round"/>
  <line x1="9" y1="9" x2="30" y2="30" stroke="#a8703a" stroke-width="1.8" stroke-linecap="round"/>
  <line x1="7" y1="11" x2="11" y2="7" stroke="#3b2412" stroke-width="2" stroke-linecap="round"/>
  <path d="M2 2 L13 6 L9 9 L6 13 Z" fill="#f0cf74" stroke="#3b2412" stroke-width="1" stroke-linejoin="round"/>
  <path d="M2 2 L9 9" stroke="#fff3c4" stroke-width="0.8" opacity="0.8"/>
</svg>`;

function pointOnArc(cx, cy, r, deg) {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

function strike(x, y, layer, reduceMotion) {
  const fx = document.createElement("div");
  fx.className = "spear-fx";
  fx.style.left = `${x}px`;
  fx.style.top = `${y}px`;

  if (!reduceMotion) {
    // Spear: positioned so its tip lands on the click, rotating around its butt.
    const spear = document.createElement("div");
    spear.className = "spear-fx-spear";
    spear.style.left = `${-TIP}px`;
    spear.style.top = `${-TIP}px`;
    spear.style.transformOrigin = `${PIVOT}px ${PIVOT}px`;
    spear.style.setProperty("--start", `${START_ANGLE}deg`);
    spear.innerHTML = SPEAR_SVG;
    fx.append(spear);

    // Swoosh: the arc the tip travels, drawn around the same pivot.
    const r = Math.hypot(PIVOT - TIP, PIVOT - TIP);
    const size = r * 2 + 20;
    const c = size / 2;
    const restDeg = 225; // tip direction (up-left) from the pivot at rest
    const [sx, sy] = pointOnArc(c, c, r, restDeg + START_ANGLE);
    const [ex, ey] = pointOnArc(c, c, r, restDeg);
    const swoosh = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    swoosh.setAttribute("class", "spear-fx-swoosh");
    swoosh.setAttribute("width", size);
    swoosh.setAttribute("height", size);
    const pivotX = PIVOT - TIP;
    swoosh.style.left = `${pivotX - c}px`;
    swoosh.style.top = `${pivotX - c}px`;
    swoosh.innerHTML = `
      <defs><linearGradient id="sw" x1="0" y1="1" x2="1" y2="0">
        <stop offset="0" stop-color="#f0cf74" stop-opacity="0"/>
        <stop offset="1" stop-color="#fff3c4" stop-opacity="0.95"/>
      </linearGradient></defs>
      <path d="M${sx} ${sy} A${r} ${r} 0 0 1 ${ex} ${ey}" fill="none" stroke="url(#sw)" stroke-width="5" stroke-linecap="round" pathLength="100"/>`;
    fx.append(swoosh);

    // Sparks fly from the tip when it lands.
    for (let i = 0; i < 12; i++) {
      const s = document.createElement("i");
      s.className = "spear-fx-spark";
      const angle = Math.random() * Math.PI * 2;
      const dist = 18 + Math.random() * 30;
      s.style.setProperty("--dx", `${Math.cos(angle) * dist}px`);
      s.style.setProperty("--dy", `${Math.sin(angle) * dist}px`);
      s.style.setProperty("--c", i % 4 === 0 ? "#bcd3ff" : i % 3 === 0 ? "#fff3c4" : "#f0cf74");
      fx.append(s);
    }
  }

  // Shockwave ring (the only effect when reduced motion is on).
  const ring = document.createElement("i");
  ring.className = "spear-fx-ring";
  fx.append(ring);

  layer.append(fx);
  setTimeout(() => fx.remove(), 900);
}

export default function OdysseyFx() {
  useEffect(() => {
    const layer = document.createElement("div");
    layer.className = "spear-fx-layer";
    layer.setAttribute("aria-hidden", "true");
    document.body.append(layer);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const onDown = (e) => {
      if (e.button !== 0) return;
      // Typing into a field shouldn't trigger a spear strike.
      if (e.target.closest?.("input:not([type=checkbox]):not([type=radio]), textarea, select")) return;
      while (layer.childElementCount >= MAX_ACTIVE) layer.firstChild.remove();
      strike(e.clientX, e.clientY, layer, reduceMotion);
    };

    // Capture phase so clicks on the Google map (which stops propagation) still swing the spear.
    window.addEventListener("pointerdown", onDown, true);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      layer.remove();
    };
  }, []);

  return null;
}
