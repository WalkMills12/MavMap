import { useCallback, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "mavmap.favorites.v1";

// Saved events keep a copy of their details so they still show after they drop out of the feed window.
const EVENT_FIELDS = ["id", "title", "start", "end", "all_day", "location", "room", "address", "url", "types", "lat", "lng", "description", "photo_url", "ics_url"];

function snapshot(event) {
  return Object.fromEntries(EVENT_FIELDS.filter((k) => event[k] !== undefined).map((k) => [k, event[k]]));
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return { buildings: saved.buildings || [], events: saved.events || {} };
  } catch {
    return { buildings: [], events: {} };
  }
}

/** Favorite buildings (by id) and events (by id, with a snapshot), saved in this browser. */
export function useFavorites() {
  const [favs, setFavs] = useState(load);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(favs));
    } catch {
      // Storage blocked: favorites last for this visit only.
    }
  }, [favs]);

  const buildingIds = useMemo(() => new Set(favs.buildings), [favs.buildings]);
  const eventIds = useMemo(() => new Set(Object.keys(favs.events).map(Number)), [favs.events]);

  const toggleBuilding = useCallback((id) => {
    setFavs((f) => ({
      ...f,
      buildings: f.buildings.includes(id) ? f.buildings.filter((b) => b !== id) : [...f.buildings, id],
    }));
  }, []);

  /** Returns true if the event is now saved. */
  const toggleEvent = useCallback(
    (event) => {
      const willSave = !eventIds.has(event.id);
      setFavs((f) => {
        const events = { ...f.events };
        if (events[event.id]) delete events[event.id];
        else events[event.id] = snapshot(event);
        return { ...f, events };
      });
      return willSave;
    },
    [eventIds],
  );

  const clear = useCallback(() => setFavs({ buildings: [], events: {} }), []);

  return {
    buildingIds,
    eventIds,
    savedEvents: favs.events,
    toggleBuilding,
    toggleEvent,
    isBuildingFav: (id) => buildingIds.has(id),
    isEventFav: (id) => eventIds.has(id),
    clear,
  };
}
