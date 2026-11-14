import { useEffect } from "react";

const TABS = [
  { id: "directory", label: "Directory" },
  { id: "events", label: "Events" },
  { id: "transit", label: "Transit" },
];

export default function SideMenu({ open, tab, onTabChange, onClose, counts = {}, children }) {
  // Escape closes the menu (only when focus is inside it, so it doesn't fight other popups).
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape" && e.target.closest?.(".side-menu")) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="side-scrim" onClick={onClose} aria-hidden="true" />
      <aside className="side-menu" id="side-menu" aria-label="Directory and events">
        <div className="side-head">
          <div className="side-tabs" role="tablist" aria-label="Side menu">
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
          <button type="button" className="side-close" onClick={onClose} aria-label="Close side menu">
            ×
          </button>
        </div>
        <div className="side-body" role="tabpanel" id={`side-panel-${tab}`} aria-labelledby={`side-tab-${tab}`}>
          {children}
        </div>
      </aside>
    </>
  );
}
