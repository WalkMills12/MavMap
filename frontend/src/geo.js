const EARTH_RADIUS_M = 6371000;

function toRad(degrees) {
  return (degrees * Math.PI) / 180;
}

/** Haversine distance in meters between two lat/lng points. */
export function distanceMeters(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** Events with geo within radiusMeters of a building, nearest first. */
export function nearbyEvents(building, events, radiusMeters = 250) {
  if (!building || !events?.length) return [];

  return events
    .filter((event) => event.lat != null && event.lng != null)
    .map((event) => ({
      event,
      distance: distanceMeters(building, { lat: event.lat, lng: event.lng }),
    }))
    .filter(({ distance }) => distance <= radiusMeters)
    .sort((a, b) => a.distance - b.distance)
    .map(({ event }) => event);
}

/** Decode a Google encoded polyline into [{ lat, lng }]. */
export function decodePolyline(encoded) {
  const points = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    for (const axis of ["lat", "lng"]) {
      let result = 0;
      let shift = 0;
      let b;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20 && index < encoded.length);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (axis === "lat") lat += delta;
      else lng += delta;
    }
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

/** "450 m" / "1.2 km" */
export function formatDistance(m) {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;
}

/** "6 min" (at least 1) */
export function formatMinutes(seconds) {
  return `${Math.max(1, Math.round(seconds / 60))} min`;
}

/**
 * Closest point on a path ([{lat,lng}]) to `p`, with its distance in meters.
 * Used to keep the "you are here" dot on the walking route when you're close to it.
 */
export function snapToPath(p, path) {
  if (!p || !path || path.length < 2) return null;
  const mLat = 111_320;
  const mLng = mLat * Math.cos((p.lat * Math.PI) / 180);
  let best = null;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const ax = (a.lng - p.lng) * mLng;
    const ay = (a.lat - p.lat) * mLat;
    const bx = (b.lng - p.lng) * mLng;
    const by = (b.lat - p.lat) * mLat;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
    const x = ax + t * dx;
    const y = ay + t * dy;
    const d = Math.hypot(x, y);
    if (!best || d < best.distance) {
      best = { lat: a.lat + t * (b.lat - a.lat), lng: a.lng + t * (b.lng - a.lng), distance: d };
    }
  }
  return best;
}
