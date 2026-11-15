import { useEffect } from "react";

// Floating slide-in panel (styled after Walker's "Upcoming events" panel): a pill button on the
// map opens it; it slides in from the left over the map with a kicker + title header and a ✕.
const TABS = [
  { id: "directory", label: "Directory", kicker: "On campus" },
  { id: "events", label: "Events", kicker: "Happening soon" },
  { id: "transit", label: "Transit", kicker: "MavMover shuttle" },
];

export default function SideMenu({ open, tab, onTabChange, onOpen, onClose, counts = {}, children }) {
  // Escape closes the panel (only when focus is inside it, so it doesn't fight other popups).
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape" && e.target.closest?.(".side-menu")) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const current = TABS.find((t) => t.id === tab) || TABS[0];

  return (
    <>
      {/* The one way into the panel: a "Directory" pill on the map (Events and Transit are tabs inside). */}
      {!open && (
        <button type="button" className="side-pill" onClick={onOpen} aria-expanded={false} aria-controls="side-menu">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
          Directory
          {counts.directory != null && <span className="side-pill-count">{counts.directory}</span>}
        </button>
      )}

      {open && <div className="side-scrim" onClick={onClose} aria-hidden="true" />}

      <aside
        className={`side-menu${open ? " open" : ""}`}
        id="side-menu"
        aria-label="Directory, events and transit"
        aria-hidden={!open}
        inert={!open}
      >
        <div className="side-head">
          <div className="side-title">
            <p className="side-kicker">{current.kicker}</p>
            <h2>{current.label}</h2>
          </div>
          <button type="button" className="side-close" onClick={onClose} aria-label="Close panel">
            ✕
          </button>
        </div>
        <div className="side-tabs" role="tablist" aria-label="Panel sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`side-tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`side-panel-${t.id}`}
              className="side-tab"
              onClick={() => onTabChange(t.id)}
            >
              {t.label}
              {counts[t.id] != null && <span className="side-tab-count">{counts[t.id]}</span>}
            </button>
          ))}
        </div>
        <div className="side-body" role="tabpanel" id={`side-panel-${tab}`} aria-labelledby={`side-tab-${tab}`}>
          {children}
        </div>
      </aside>
    </>
  );
}
