import { useEffect, useRef } from "react";

// Odyssey theme sword cursor.
// At rest the sword IS the operating system's cursor (a 32×32 image with its hotspot on the blade tip),
// so it tracks the mouse with zero lag and clicks land exactly on the tip.
// On click, an identical sword is shown at the same spot just long enough to swing, then removed —
// nothing stays behind.
const PX = 32; // cursor size; browsers reliably accept cursor images up to 32×32
const VIEW = "0.75 0.75 40 40"; // shifts the art so the tip lands exactly on pixel (1, 1)
const HOTSPOT = 1;
const PIVOT = (28 - 0.75) * (PX / 40); // the grip, which the swing rotates around
const TYPING = "input:not([type=checkbox]):not([type=radio]):not([type=range]), textarea";

const swordSvg = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEW}" width="${size}" height="${size}">
  <defs>
    <linearGradient id="b" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="0.5" stop-color="#d8dde6"/>
      <stop offset="1" stop-color="#9aa3b2"/>
    </linearGradient>
  </defs>
  <path d="M2 2 L7 3.4 L25.6 22.4 L22.4 25.6 L3.4 7 Z" fill="url(#b)" stroke="#1d2029" stroke-width="1.1" stroke-linejoin="round"/>
  <path d="M4.5 4.5 L23 23" stroke="#8a93a3" stroke-width="0.8" stroke-linecap="round"/>
  <path d="M18.5 29.5 L29.5 18.5" stroke="#3b2412" stroke-width="4.2" stroke-linecap="round"/>
  <path d="M18.5 29.5 L29.5 18.5" stroke="#e2b458" stroke-width="2.6" stroke-linecap="round"/>
  <path d="M25 25 L33 33" stroke="#2a170b" stroke-width="3.8" stroke-linecap="round"/>
  <path d="M25 25 L33 33" stroke="#7a4a22" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="1.2 1"/>
  <circle cx="34.8" cy="34.8" r="2.7" fill="#e2b458" stroke="#3b2412" stroke-width="1"/>
</svg>`;

/** Rasterize the sword to a PNG data URL (PNG cursors work in every desktop browser). */
function makeCursorPng() {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = PX;
      canvas.height = PX;
      canvas.getContext("2d").drawImage(img, 0, 0, PX, PX);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => resolve(null);
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(swordSvg(PX))}`;
  });
}

export default function SwordCursor() {
  const swingRef = useRef(null);

  useEffect(() => {
    // Only for a real mouse or pen; touch screens keep their normal behavior.
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    const root = document.documentElement;
    const swing = swingRef.current;
    const blade = swing.firstElementChild;
    blade.innerHTML = swordSvg(PX);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let cancelled = false;
    let swinging = false;

    makeCursorPng().then((png) => {
      if (cancelled || !png) return;
      root.style.setProperty("--sword-cursor", `url("${png}")`);
      root.classList.add("sword-cursor-on");
    });

    const place = (x, y) => {
      swing.style.transform = `translate3d(${x - HOTSPOT}px, ${y - HOTSPOT}px, 0)`;
    };

    const endSwing = () => {
      swinging = false;
      blade.classList.remove("is-swinging");
      swing.style.visibility = "hidden";
      root.classList.remove("sword-swinging");
    };

    const onDown = (e) => {
      if (e.button !== 0 || e.pointerType === "touch" || reduceMotion.matches) return;
      if (!root.classList.contains("sword-cursor-on")) return;
      if (e.target.closest?.(TYPING)) return;
      place(e.clientX, e.clientY);
      swing.style.visibility = "visible";
      root.classList.add("sword-swinging"); // hide the real cursor only while the copy swings
      blade.classList.remove("is-swinging");
      void blade.offsetWidth; // restart the animation on rapid clicks
      blade.classList.add("is-swinging");
      swinging = true;
    };

    const onMove = (e) => {
      if (swinging) place(e.clientX, e.clientY);
    };

    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("pointermove", onMove, true);
    blade.addEventListener("animationend", endSwing);
    window.addEventListener("blur", endSwing);

    return () => {
      cancelled = true;
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("pointermove", onMove, true);
      blade.removeEventListener("animationend", endSwing);
      window.removeEventListener("blur", endSwing);
      root.classList.remove("sword-cursor-on", "sword-swinging");
      root.style.removeProperty("--sword-cursor");
    };
  }, []);

  return (
    <div ref={swingRef} className="sword-swing" style={{ visibility: "hidden" }} aria-hidden="true">
      <div className="sword-swing-blade" style={{ transformOrigin: `${PIVOT}px ${PIVOT}px` }} />
    </div>
  );
}
