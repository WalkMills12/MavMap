import { useEffect, useRef, useState } from "react";

const SNAPS = { half: 0.55, full: 0.92 }; // share of the map area's height

/**
 * Phone bottom sheet for Places / Events / Transit. Drag the handle (or tap it) to switch
 * between half and full height; drag it down to close and go back to the map.
 */
export default function MobileSheet({ open, title, onClose, children }) {
  const [snap, setSnap] = useState("half");
  const [dragPx, setDragPx] = useState(null); // live height while dragging
  const sheetRef = useRef(null);
  const drag = useRef(null);

  useEffect(() => {
    if (open) setSnap("half");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const parentH = () => sheetRef.current?.parentElement?.clientHeight || window.innerHeight;

  const onPointerDown = (e) => {
    drag.current = { y: e.clientY, h: sheetRef.current.getBoundingClientRect().height, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!drag.current) return;
    const dy = drag.current.y - e.clientY;
    if (Math.abs(dy) > 4) drag.current.moved = true;
    setDragPx(Math.max(80, Math.min(parentH() * SNAPS.full, drag.current.h + dy)));
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (!d.moved) {
      // A tap on the handle toggles half <-> full.
      setSnap((s) => (s === "half" ? "full" : "half"));
      setDragPx(null);
      return;
    }
    const share = (dragPx ?? d.h) / parentH();
    setDragPx(null);
    if (share < 0.3) onClose();
    else setSnap(share > (SNAPS.half + SNAPS.full) / 2 ? "full" : "half");
  };

  const style = dragPx != null ? { height: `${dragPx}px`, transition: "none" } : { height: `${SNAPS[snap] * 100}%` };

  return (
    <section ref={sheetRef} className={`mobile-sheet is-${snap}`} style={style} aria-label={title}>
      <div
        className="sheet-grab"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        role="button"
        tabIndex={0}
        aria-label={snap === "half" ? "Expand" : "Shrink"}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setSnap((s) => (s === "half" ? "full" : "half"));
          }
        }}
      >
        <span className="sheet-handle" aria-hidden="true" />
        <div className="sheet-head">
          <h2>{title}</h2>
          <button
            type="button"
            className="sheet-close"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
      </div>
      <div className="sheet-body">{children}</div>
    </section>
  );
}
