// Phone tab bar: Map · Places · Events · Transit.

const ICONS = {
  map: (
    <path d="M9 4 3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5L9 4Zm0 0v13.5m6-11v13.5" />
  ),
  directory: (
    <>
      <path d="M4 20V9l8-5 8 5v11" />
      <path d="M9 20v-6h6v6" />
    </>
  ),
  events: (
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  transit: (
    <>
      <rect x="5" y="3.5" width="14" height="14" rx="3" />
      <path d="M5 11h14M8.5 21l1.5-3.5M15.5 21 14 17.5" />
      <circle cx="9" cy="14.3" r="0.9" />
      <circle cx="15" cy="14.3" r="0.9" />
    </>
  ),
};

const TABS = [
  { id: "map", label: "Map" },
  { id: "directory", label: "Places" },
  { id: "events", label: "Events" },
  { id: "transit", label: "Transit" },
];

export default function BottomNav({ active, onSelect, counts = {} }) {
  return (
    <nav className="bottom-nav" aria-label="Sections">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`bottom-tab${active === t.id ? " is-active" : ""}`}
          aria-current={active === t.id ? "page" : undefined}
          onClick={() => onSelect(t.id)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            {ICONS[t.id]}
          </svg>
          <span>{t.label}</span>
          {counts[t.id] != null && t.id !== "map" && <span className="bottom-tab-count">{counts[t.id]}</span>}
        </button>
      ))}
    </nav>
  );
}
