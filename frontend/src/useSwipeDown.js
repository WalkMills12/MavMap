import { useEffect } from "react";

const PHONE = "(max-width: 820px)";
const CLOSE_PX = 90; // drag this far down (or flick) to close

/**
 * Phones: drag a panel down to close it, like an iPhone sheet. The panel follows your finger;
 * let go past the threshold (or flick down) and onClose runs, otherwise it springs back.
 * Only starts when the panel's scrollable content is already at the top, so normal scrolling still works.
 */
export function useSwipeDown(ref, onClose, enabled = true) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled || !onClose) return;
    let startY = 0;
    let startX = 0;
    let startT = 0;
    let dy = 0;
    let dragging = false;
    let decided = false;

    const scrolledDown = (target) => {
      // Any scrollable area between the touch and the panel that isn't at its top blocks the swipe.
      for (let n = target; n && n !== el.parentElement; n = n.parentElement) {
        if (n.scrollTop > 0 && n.scrollHeight > n.clientHeight) return true;
        if (n === el) break;
      }
      return false;
    };

    const onStart = (e) => {
      if (!window.matchMedia(PHONE).matches || e.touches.length !== 1) return;
      if (e.target.closest?.("input, textarea, select, .swipe-track")) return;
      if (scrolledDown(e.target)) return;
      startY = e.touches[0].clientY;
      startX = e.touches[0].clientX;
      startT = Date.now();
      dy = 0;
      dragging = true;
      decided = false;
    };

    const onMove = (e) => {
      if (!dragging) return;
      const y = e.touches[0].clientY - startY;
      const x = e.touches[0].clientX - startX;
      if (!decided) {
        if (Math.abs(y) < 8 && Math.abs(x) < 8) return;
        decided = true;
        // Sideways or upward: not a close gesture.
        if (y <= 0 || Math.abs(x) > Math.abs(y)) {
          dragging = false;
          return;
        }
        el.style.transition = "none";
      }
      dy = Math.max(0, y);
      el.style.transform = `translateY(${dy}px)`;
      el.style.opacity = String(Math.max(0.4, 1 - dy / 500));
      if (e.cancelable) e.preventDefault(); // stop the page from scrolling while dragging the sheet
    };

    const onEnd = () => {
      if (!dragging) return;
      dragging = false;
      if (!decided) return;
      const fast = dy > 40 && dy / Math.max(1, Date.now() - startT) > 0.6;
      el.style.transition = "transform 0.2s ease, opacity 0.2s ease";
      if (dy > CLOSE_PX || fast) {
        el.style.transform = "translateY(100%)";
        el.style.opacity = "0";
        setTimeout(() => {
          el.style.transform = "";
          el.style.opacity = "";
          el.style.transition = "";
          onClose();
        }, 180);
      } else {
        el.style.transform = "";
        el.style.opacity = "";
        setTimeout(() => (el.style.transition = ""), 220);
      }
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [ref, onClose, enabled]);
}
