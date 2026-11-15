import { useEffect, useRef } from "react";

// Odyssey theme: a sword replaces the mouse cursor and swings when you click.
// The sword IS the cursor (one element that follows the pointer), so a swing never leaves a copy behind.
const SIZE = 44; // rendered size in px (artwork is 40×40)
const SCALE = SIZE / 40;
const TIP = 2 * SCALE; // blade tip sits exactly on the pointer
const PIVOT = 28 * SCALE; // the grip, which the swing rotates around
const TYPING = "input:not([type=checkbox]):not([type=radio]):not([type=range]), textarea";

const SWORD_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="${SIZE}" height="${SIZE}" aria-hidden="true">
  <defs>
    <linearGradient id="sword-blade" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="0.5" stop-color="#d8dde6"/>
      <stop offset="1" stop-color="#9aa3b2"/>
    </linearGradient>
  </defs>
  <path d="M2 2 L7 3.4 L25.6 22.4 L22.4 25.6 L3.4 7 Z" fill="url(#sword-blade)" stroke="#2b2f3a" stroke-width="1" stroke-linejoin="round"/>
  <path d="M4.5 4.5 L23 23" stroke="#8a93a3" stroke-width="0.8" stroke-linecap="round"/>
  <path d="M18.5 29.5 L29.5 18.5" stroke="#3b2412" stroke-width="4.2" stroke-linecap="round"/>
  <path d="M18.5 29.5 L29.5 18.5" stroke="#e2b458" stroke-width="2.6" stroke-linecap="round"/>
  <path d="M25 25 L33 33" stroke="#2a170b" stroke-width="3.8" stroke-linecap="round"/>
  <path d="M25 25 L33 33" stroke="#7a4a22" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="1.2 1"/>
  <circle cx="34.8" cy="34.8" r="2.7" fill="#e2b458" stroke="#3b2412" stroke-width="1"/>
</svg>`;

export default function SwordCursor() {
  const outerRef = useRef(null);
  const bladeRef = useRef(null);

  useEffect(() => {
    // Only for a real mouse or pen; touch screens keep their normal behavior.
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    if (!finePointer.matches) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const outer = outerRef.current;
    const blade = bladeRef.current;
    blade.innerHTML = SWORD_SVG;
    document.documentElement.classList.add("sword-cursor-on");

    let x = -100;
    let y = -100;
    let frame = 0;
    const place = () => {
      frame = 0;
      outer.style.transform = `translate3d(${x - TIP}px, ${y - TIP}px, 0)`;
    };

    const onMove = (e) => {
      if (e.pointerType === "touch") return;
      x = e.clientX;
      y = e.clientY;
      // Over text fields the normal text cursor shows instead of the sword.
      outer.style.opacity = e.target.closest?.(TYPING) ? "0" : "1";
      if (!frame) frame = requestAnimationFrame(place);
    };

    const onDown = (e) => {
      if (e.button !== 0 || e.pointerType === "touch" || reduceMotion.matches) return;
      if (e.target.closest?.(TYPING)) return;
      // Restart the swing even if the previous one hasn't finished.
      blade.classList.remove("is-swinging");
      void blade.offsetWidth;
      blade.classList.add("is-swinging");
    };

    const onLeave = (e) => {
      if (!e.relatedTarget) outer.style.opacity = "0";
    };

    const onSwingEnd = () => blade.classList.remove("is-swinging");

    // Capture phase so the Google map (which stops some events) can't hide clicks or movement.
    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("pointerdown", onDown, true);
    document.addEventListener("mouseout", onLeave);
    blade.addEventListener("animationend", onSwingEnd);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("mouseout", onLeave);
      blade.removeEventListener("animationend", onSwingEnd);
      document.documentElement.classList.remove("sword-cursor-on");
    };
  }, []);

  return (
    <div ref={outerRef} className="sword-cursor" style={{ opacity: 0 }} aria-hidden="true">
      <div ref={bladeRef} className="sword-cursor-blade" style={{ transformOrigin: `${PIVOT}px ${PIVOT}px` }} />
    </div>
  );
}
