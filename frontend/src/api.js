const API_BASE = import.meta.env.VITE_API_BASE ?? "";

async function request(path) {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Request failed: ${response.status}`);
  }
  return response.json();
}

export function fetchBuildings(query = "") {
  const params = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : "";
  return request(`/api/buildings${params}`);
}

export function fetchTransit() {
  return request("/api/transit");
}

export function fetchFaqs() {
  return request("/api/faqs");
}

export function fetchEvents(days = 1) {
  return request(`/api/events?days=${days}`);
}

export function fetchTraffic(windowHours = 3) {
  return request(`/api/traffic?window_hours=${windowHours}`);
}

export function appleMapsUrl({ lat, lng, name }) {
  const label = encodeURIComponent(name || "UTA Building");
  return `https://maps.apple.com/?daddr=${lat},${lng}&q=${label}&dirflg=w`;
}

export function googleMapsUrl({ lat, lng }) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking`;
}
/** Walking route; for a building (has an id) it ends at the nearest door / side, not the center. */
export function fetchWalkingRoute(from, to) {
  const p = new URLSearchParams({ from_lat: from.lat, from_lng: from.lng });
  if (to.id) p.set("building", to.id);
  else {
    p.set("to_lat", to.lat);
    p.set("to_lng", to.lng);
  }
  return request(`/api/route?${p}`);
}

export function fetchBuildingInfo(id) {
  return request(`/api/buildings/${encodeURIComponent(id)}/info`);
}
