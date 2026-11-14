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
