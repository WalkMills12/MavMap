import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "mavmap.prefs.v1";

export const DEFAULT_PREFS = {
  theme: "dark", // "system" | "light" | "dark"
  textSize: "normal", // "normal" | "large" | "xlarge"
  mapType: "roadmap", // "roadmap" (street) | "hybrid" (satellite) | "osm" (OpenStreetMap)
  shownRoutes: [], // MavMover route ids shown on the map; none until the user picks some
  showOutlines: true, // colored building highlights (outlines) on the map
  showBuildingNames: true, // MavMap's bold building names on the map (Google's are hidden)
  suggestions: true, // learn from saved events and suggest new ones at startup
  showTraffic: true, // event-traffic heatmap on the map
  openMenuOnStart: true, // side menu open when MavMap loads (desktop only)
  defaultTab: "directory", // "directory" | "events"
  eventDays: 7, // how far ahead the Events tab looks: 1, 3, 7 or 14
  travelMode: "WALK", // "Get directions" default: "WALK" | "DRIVE" (the last one you picked)
};

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    // Older versions showed every bus route by default (showTransit/hiddenRoutes). Routes are now opt-in.
    delete saved.showTransit;
    delete saved.hiddenRoutes;
    // The "Calendar buttons" preference was removed: events always offer Google and Apple.
    delete saved.calendar;
    return { ...DEFAULT_PREFS, ...saved };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

/** Preferences saved in this browser. Returns [prefs, update(patch), reset()]. */
export function usePreferences() {
  const [prefs, setPrefs] = useState(load);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      // Private mode or blocked storage: preferences just won't persist.
    }
  }, [prefs]);

  const update = useCallback((patch) => setPrefs((p) => ({ ...p, ...patch })), []);
  const reset = useCallback(() => setPrefs({ ...DEFAULT_PREFS }), []);
  return [prefs, update, reset];
}
