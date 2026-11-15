import { useCallback, useEffect, useRef, useState } from "react";
import { useSwipeDown } from "../useSwipeDown.js";
import { topInterests } from "../interests.js";

const DAY_OPTIONS = [
  { value: 1, label: "Today" },
  { value: 3, label: "Next 3 days" },
  { value: 7, label: "Next 7 days" },
  { value: 14, label: "Next 14 days" },
];

const THEME_OPTIONS = [
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
  { value: "system", label: "Match device" },
  { value: "odyssey", label: "⚡ The Odyssey" },
];

const TEXT_OPTIONS = [
  { value: "normal", label: "Normal" },
  { value: "large", label: "Large" },
  { value: "xlarge", label: "Extra large" },
];

const MAP_OPTIONS = [
  { value: "roadmap", label: "Street" },
  { value: "hybrid", label: "Satellite" },
  { value: "osm", label: "OpenStreetMap" },
];

function Segmented({ name, label, options, value, onChange }) {
  return (
    <div className="prefs-field" role="radiogroup" aria-label={label}>
      <span>{label}</span>
      <div className="prefs-seg">
        {options.map((o) => (
          <label key={o.value}>
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

/** A button that needs a second tap to confirm, for clearing data. */
function ConfirmButton({ label, confirmLabel, onConfirm }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      type="button"
      className={`prefs-reset${armed ? " is-armed" : ""}`}
      onClick={() => {
        if (armed) {
          onConfirm();
          setArmed(false);
        } else setArmed(true);
      }}
    >
      {armed ? confirmLabel : label}
    </button>
  );
}

export default function PreferencesMenu({
  prefs,
  onChange,
  onReset,
  trafficCount,
  onClearInterests,
  onClearFavorites,
  favoriteCount = 0,
  routesOn = false,
  onToggleRoutes,
  open: openProp, // optional: the app controls open/closed (phones keep one panel open at a time)
  onOpenChange,
}) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = useCallback(
    (v) => {
      const next = typeof v === "function" ? v(open) : v;
      setOpenState(next);
      onOpenChange?.(next);
    },
    [open, onOpenChange],
  );
  const panelRef = useRef(null);
  const closePanel = useCallback(() => setOpen(false), [setOpen]);
  useSwipeDown(panelRef, closePanel, open);
  const [, setVersion] = useState(0); // re-read learned interests after clearing
  const interests = open ? topInterests() : [];
  const rootRef = useRef(null);
  const buttonRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="prefs" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="prefs-btn"
        aria-expanded={open}
        aria-controls="prefs-panel"
        onClick={() => setOpen((o) => !o)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" />
          <circle cx="16" cy="6" r="2" />
          <circle cx="10" cy="12" r="2" />
          <circle cx="18" cy="18" r="2" />
        </svg>
        <span>Preferences</span>
      </button>

      {open && (
        <section ref={panelRef} className="prefs-panel" id="prefs-panel" role="dialog" aria-label="Preferences">
          <div className="sheet-handle" aria-hidden="true" />
          <h2 className="prefs-title">Preferences</h2>

          <fieldset className="prefs-group">
            <legend>Appearance</legend>
            <Segmented
              name="theme-pref"
              label="Theme"
              options={THEME_OPTIONS}
              value={prefs.theme}
              // The Odyssey's sea-chart map only exists in Street view, so switch to it.
              onChange={(v) => onChange(v === "odyssey" ? { theme: v, mapType: "roadmap" } : { theme: v })}
            />
            {prefs.theme === "odyssey" && (
              <p className="prefs-note">
                Sea-chart map, sword cursor and a stormy sky. The chart styling shows in Street view.
              </p>
            )}
            <Segmented name="text-pref" label="Text size" options={TEXT_OPTIONS} value={prefs.textSize} onChange={(v) => onChange({ textSize: v })} />
          </fieldset>

          <fieldset className="prefs-group">
            <legend>Map</legend>
            <Segmented name="maptype-pref" label="Map view" options={MAP_OPTIONS} value={prefs.mapType} onChange={(v) => onChange({ mapType: v })} />
            <label className="prefs-check">
              <input type="checkbox" checked={prefs.showOutlines} onChange={(e) => onChange({ showOutlines: e.target.checked })} />
              <span>
                Building highlights
                <small> · colored outlines by building type</small>
              </span>
            </label>
            <label className="prefs-check">
              <input type="checkbox" checked={prefs.showBuildingNames} onChange={(e) => onChange({ showBuildingNames: e.target.checked })} />
              <span>
                Building names on the map
                <small> · zoom in to see full names</small>
              </span>
            </label>
            <label className="prefs-check">
              <input type="checkbox" checked={routesOn} onChange={(e) => onToggleRoutes(e.target.checked)} />
              <span>
                Show MavMover shuttle routes
                <small> · off by default; pick single routes in the Transit tab</small>
              </span>
            </label>
            <label className="prefs-check">
              <input type="checkbox" checked={prefs.showTraffic} onChange={(e) => onChange({ showTraffic: e.target.checked })} />
              <span>
                Show event traffic heatmap
                {trafficCount != null && <small> · {trafficCount} busy spots in the next 3 hours</small>}
              </span>
            </label>
          </fieldset>

          <fieldset className="prefs-group">
            <legend>Side menu</legend>
            <label className="prefs-check">
              <input type="checkbox" checked={prefs.openMenuOnStart} onChange={(e) => onChange({ openMenuOnStart: e.target.checked })} />
              <span>Open the side menu when MavMap starts (computer only)</span>
            </label>
            <label className="prefs-field">
              <span>Start on</span>
              <select value={prefs.defaultTab} onChange={(e) => onChange({ defaultTab: e.target.value })}>
                <option value="directory">Directory</option>
                <option value="classes">Classes</option>
                <option value="events">Events</option>
                <option value="transit">Transit</option>
              </select>
            </label>
          </fieldset>

          <fieldset className="prefs-group">
            <legend>Events</legend>
            <label className="prefs-field">
              <span>Show events for</span>
              <select value={prefs.eventDays} onChange={(e) => onChange({ eventDays: Number(e.target.value) })}>
                {DAY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </fieldset>

          <fieldset className="prefs-group">
            <legend>Suggestions</legend>
            <label className="prefs-check">
              <input type="checkbox" checked={prefs.suggestions} onChange={(e) => onChange({ suggestions: e.target.checked })} />
              <span>
                Suggest new events when MavMap starts
                <small> · learns from events you save, add to your calendar or open</small>
              </span>
            </label>
            <p className="prefs-note">
              {interests.length
                ? `You seem to like: ${interests.join(", ")}.`
                : "Nothing learned yet. Save a few events and MavMap will start suggesting similar ones."}{" "}
              This stays in this browser and is never sent anywhere.
            </p>
            <div className="prefs-actions">
              <ConfirmButton
                label="Clear what MavMap learned"
                confirmLabel="Tap again to clear"
                onConfirm={() => {
                  onClearInterests();
                  setVersion((v) => v + 1);
                }}
              />
              <ConfirmButton
                label={`Clear saved items (${favoriteCount})`}
                confirmLabel="Tap again to clear"
                onConfirm={onClearFavorites}
              />
            </div>
          </fieldset>

          <div className="prefs-foot">
            <span>Saved in this browser.</span>
            <button type="button" className="prefs-reset" onClick={onReset}>
              Reset to defaults
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
