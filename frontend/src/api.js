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

export function fetchEvents(days = 7) {
  return request(`/api/events?days=${days}&campus_only=true`);
}

export function fetchTraffic(windowHours = 3) {
  return request(`/api/traffic?window_hours=${windowHours}`);
}

export function fetchFootprints() {
  return request(`/api/footprints`);
}

export function appleMapsUrl({ lat, lng, name }) {
  const label = encodeURIComponent(name || "UTA Building");
  return `https://maps.apple.com/?daddr=${lat},${lng}&q=${label}&dirflg=w`;
}

export function googleMapsUrl({ lat, lng }) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking`;
}