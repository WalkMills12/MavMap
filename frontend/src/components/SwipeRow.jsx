import { useCallback, useEffect, useRef, useState } from "react";

// A row of chips you can swipe sideways, with ‹ › arrow buttons that appear when there's more to see.
export default function SwipeRow({ className = "", label, children }) {
  const rowRef = useRef(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const update = useCallback(() => {
    const el = rowRef.current;
    if (!el) return;
    setEdges({
      left: el.scrollLeft > 4,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4,
    });
  }, []);

  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [update]);

  // Re-check when the chips change (counts, new categories).
  useEffect(update, [children, update]);

  const scrollBy = (dir) => {
    const el = rowRef.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.7, behavior: "smooth" });
  };

  return (
    <div className={`swipe-row${edges.left ? " has-left" : ""}${edges.right ? " has-right" : ""}`}>
      <button type="button" className="swipe-arrow swipe-arrow--left" onClick={() => scrollBy(-1)} aria-label="Scroll left" tabIndex={edges.left ? 0 : -1} hidden={!edges.left}>
        ‹
      </button>
      <div ref={rowRef} className={`swipe-track ${className}`} role="group" aria-label={label}>
        {children}
      </div>
      <button type="button" className="swipe-arrow swipe-arrow--right" onClick={() => scrollBy(1)} aria-label="Scroll right" tabIndex={edges.right ? 0 : -1} hidden={!edges.right}>
        ›
      </button>
    </div>
  );
}
