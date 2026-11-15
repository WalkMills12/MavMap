import { useEffect, useRef, useState } from "react";

const DURATION_MS = 900;
const ease = (t) => 1 - (1 - t) ** 3; // ease-out

/** Glide a {lat, lng, ...} point to each new target instead of jumping there. */
export function useAnimatedPosition(target) {
  const [shown, setShown] = useState(target);
  const fromRef = useRef(target);
  const shownRef = useRef(target);

  useEffect(() => {
    if (!target) {
      shownRef.current = null;
      setShown(null);
      return;
    }
    const from = shownRef.current;
    // First fix, or a huge jump (e.g. GPS just turned on): place it directly.
    if (!from || Math.abs(from.lat - target.lat) + Math.abs(from.lng - target.lng) > 0.01) {
      shownRef.current = target;
      setShown(target);
      return;
    }
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      shownRef.current = target;
      setShown(target);
      return;
    }
    fromRef.current = from;
    const start = performance.now();
    let raf;
    const step = (now) => {
      const t = Math.min(1, (now - start) / DURATION_MS);
      const k = ease(t);
      const next = {
        ...target,
        lat: fromRef.current.lat + (target.lat - fromRef.current.lat) * k,
        lng: fromRef.current.lng + (target.lng - fromRef.current.lng) * k,
      };
      shownRef.current = next;
      setShown(next);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);

  return shown;
}
