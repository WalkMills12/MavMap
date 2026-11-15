// Photos for directory, search and event cards.
//
// Buildings: the backend looks up the building's Google Places photo (matched by place_id in
// data/buildings.json; see backend/scripts/find_place_ids.py) or uses an "image" override.
// Places without a trustworthy match get no photo, and the card shows a colored badge instead
// of a picture of the wrong building.
//
// Events: events.uta.edu (Localist) attaches a photo to every event.

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

const photoCache = new Map(); // `${id}:${width}` -> Promise<{url, author, authorUrl} | null>
const loaders = new Map(); // stable loader functions, so cards don't refetch on every render

function fetchBuildingPhoto(id, width) {
  const key = `${id}:${width}`;
  if (!photoCache.has(key)) {
    const p = fetch(`${API_BASE}/api/buildings/${encodeURIComponent(id)}/photo?w=${width}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => (d?.url ? { url: d.url, author: d.author || null, authorUrl: d.author_url || null } : null))
      .catch(() => null);
    photoCache.set(key, p);
  }
  return photoCache.get(key);
}

/** Lazy loader for a building's photo, or null when the building has none. */
export function buildingPhotoLoader(building, width = 640) {
  if (!building || (!building.place_id && !building.image)) return null;
  const key = `${building.id}:${width}`;
  if (!loaders.has(key)) loaders.set(key, () => fetchBuildingPhoto(building.id, width));
  return loaders.get(key);
}

export function eventPhotoUrl(event) {
  return event?.photo_url || null;
}
