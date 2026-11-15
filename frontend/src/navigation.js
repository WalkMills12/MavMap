// In-app walking navigation: live location, best walking route (Google Routes API),
// turn-by-turn progress, re-routing when you stray, and arrival detection.
import { useCallback, useEffect, useRef, useState } from "react";
import { distanceMeters } from "./geo.js";

const ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
const FIELD_MASK = [
  "routes.duration",
  "routes.distanceMeters",
  "routes.polyline.encodedPolyline",
  "routes.legs.steps.distanceMeters",
  "routes.legs.steps.staticDuration",
  "routes.legs.steps.navigationInstruction",
].join(",");

// Tuned per travel mode: cars stop farther from the door and GPS drifts more at speed.
const MODE_SETTINGS = {
  WALK: { arriveM: 20, offRouteM: 30 },
  DRIVE: { arriveM: 45, offRouteM: 50 },
};
const REROUTE_COOLDOWN_MS = 20000; // don't ask Google for a new route more often than this
const SNAP_M = 20; // within this distance of the route, draw the dot on the route (like Google Maps)
const settingsFor = (mode) => MODE_SETTINGS[mode] || MODE_SETTINGS.WALK;

const secs = (s) => parseFloat(String(s ?? "0").replace("s", "")) || 0;

/** Decode a Google encoded polyline into [{lat, lng}]. */
export function decodePolyline(str) {
  const points = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < str.length) {
    for (const axis of [0, 1]) {
      let result = 0;
      let shift = 0;
      let b;
      do {
        b = str.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (axis === 0) lat += delta;
      else lng += delta;
    }
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

/** Best route from `from` to `to`. mode: "WALK" (sidewalks and campus paths) or "DRIVE" (roads). */
export async function fetchRoute(apiKey, from, to, mode = "WALK") {
  const res = await fetch(ROUTES_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": FIELD_MASK },
    body: JSON.stringify({
      origin: { location: { latLng: { latitude: from.lat, longitude: from.lng } } },
      destination: { location: { latLng: { latitude: to.lat, longitude: to.lng } } },
      travelMode: mode === "DRIVE" ? "DRIVE" : "WALK",
      // Full-detail line that follows every bend of the roads, sidewalks and campus paths.
      polylineQuality: "HIGH_QUALITY",
      languageCode: "en-US",
      units: "IMPERIAL",
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || `Routes API error ${res.status}`;
    if (/not been used|disabled|not enabled|PERMISSION_DENIED|API key/i.test(msg)) {
      throw new Error("Directions need the Routes API turned on for your Google Maps key (Google Cloud Console → APIs & Services → Library → Routes API).");
    }
    throw new Error(msg);
  }
  const route = data.routes?.[0];
  if (!route?.polyline?.encodedPolyline) {
    throw new Error(`Google couldn't find a ${mode === "DRIVE" ? "driving" : "walking"} route to this place.`);
  }
  const path = decodePolyline(route.polyline.encodedPolyline);

  // Distance along the path where each segment starts, for fast progress math.
  const cum = [0];
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + distanceMeters(path[i - 1], path[i]));
  const total = cum[cum.length - 1] || route.distanceMeters || 0;

  let acc = 0;
  const steps = (route.legs?.[0]?.steps || []).map((s) => {
    const len = s.distanceMeters || 0;
    acc += len;
    return {
      text: (s.navigationInstruction?.instructions || "Continue").replace(/\n+/g, ". "),
      maneuver: s.navigationInstruction?.maneuver || "STRAIGHT",
      distanceM: len,
      endAlongM: acc,
    };
  });
  // Scale step ends to the decoded path length so both use the same ruler.
  const scale = acc > 0 ? total / acc : 1;
  for (const s of steps) s.endAlongM *= scale;

  return { path, cum, totalM: total, durationS: secs(route.duration), steps, mode };
}

/** Kept for older callers: a walking route. */
export const fetchWalkingRoute = (apiKey, from, to) => fetchRoute(apiKey, from, to, "WALK");

/** Where a position sits relative to the route: distance off the line and distance traveled along it. */
function project(route, p) {
  const { path, cum } = route;
  const kx = 111320 * Math.cos((p.lat * Math.PI) / 180); // meters per degree of longitude here
  const ky = 110540;
  let best = { off: Infinity, along: 0 };
  for (let i = 1; i < path.length; i++) {
    const ax = (path[i - 1].lng - p.lng) * kx;
    const ay = (path[i - 1].lat - p.lat) * ky;
    const bx = (path[i].lng - p.lng) * kx;
    const by = (path[i].lat - p.lat) * ky;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
    const off = Math.hypot(ax + t * dx, ay + t * dy);
    if (off < best.off) best = { off, along: cum[i - 1] + t * Math.sqrt(len2) };
  }
  return best;
}

export function pointAlong(route, meters) {
  const { path, cum } = route;
  if (meters <= 0) return path[0];
  for (let i = 1; i < path.length; i++) {
    if (cum[i] >= meters) {
      const seg = cum[i] - cum[i - 1] || 1;
      const t = (meters - cum[i - 1]) / seg;
      return { lat: path[i - 1].lat + (path[i].lat - path[i - 1].lat) * t, lng: path[i - 1].lng + (path[i].lng - path[i - 1].lng) * t };
    }
  }
  return path[path.length - 1];
}

/** Direction of travel along the route at a given distance (for the heading arrow when snapped). */
function routeBearingAt(route, meters) {
  const a = pointAlong(route, Math.max(0, meters - 3));
  const b = pointAlong(route, Math.min(route.totalM, meters + 3));
  return a.lat === b.lat && a.lng === b.lng ? null : bearing(a, b);
}

/**
 * The position to draw: snapped onto the route when you're close to it, so the dot rides the path
 * instead of jittering beside it. Off the route, the raw GPS position is shown as-is.
 */
export function displayPosition(route, raw, progress) {
  if (!route || !progress) return { ...raw, snapped: false };
  const limit = Math.max(SNAP_M, Math.min(raw.acc || 0, 40));
  if (progress.off > limit) return { ...raw, snapped: false };
  const p = pointAlong(route, progress.along);
  return { ...raw, lat: p.lat, lng: p.lng, heading: routeBearingAt(route, progress.along) ?? raw.heading, snapped: true };
}

function bearing(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x = Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) - Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function progressFor(route, pos, dest) {
  const { arriveM } = settingsFor(route.mode);
  const { off, along } = project(route, pos);
  const remainingM = Math.max(0, route.totalM - along);
  let stepIdx = route.steps.findIndex((s) => s.endAlongM > along + 1);
  if (stepIdx < 0) stepIdx = route.steps.length - 1;
  const toNextM = Math.max(0, (route.steps[stepIdx]?.endAlongM ?? route.totalM) - along);
  const remainingS = route.totalM ? (route.durationS * remainingM) / route.totalM : 0;
  const arrived = distanceMeters(pos, dest) <= arriveM || remainingM <= arriveM * 0.75;
  return { off, along, remainingM, remainingS, stepIdx, toNextM, arrived };
}

function geoErrorMessage(err) {
  if (err?.code === 1) return "Location is blocked. Allow location for this site (lock icon in the address bar), then try again.";
  if (err?.code === 3) return "Getting your location took too long. Move somewhere with a clearer view of the sky and try again.";
  return "Couldn't get your location. Make sure location services are on, then try again.";
}

/**
 * Hook driving a navigation session.
 * nav: null | { dest, mode: "WALK"|"DRIVE", status: "locating"|"routing"|"navigating"|"arrived"|"error", error?, route?, progress? }
 * pos: null | { lat, lng, acc, heading }
 */
export function useNavigation(apiKey) {
  const [nav, setNav] = useState(null);
  const [pos, setPos] = useState(null);
  const navRef = useRef(null);
  const posRef = useRef(null);
  const watchRef = useRef(null);
  const routingRef = useRef(false);
  const lastRerouteRef = useRef(0);
  const wakeLockRef = useRef(null);

  const update = useCallback((next) => {
    navRef.current = typeof next === "function" ? next(navRef.current) : next;
    setNav(navRef.current);
  }, []);

  const requestRoute = useCallback(
    async (from) => {
      const current = navRef.current;
      if (!current || routingRef.current) return;
      routingRef.current = true;
      if (!current.route) update((n) => n && { ...n, status: "routing" });
      try {
        const route = await fetchRoute(apiKey, from, current.dest, current.mode);
        // Cancelled, or switched between walking and driving, meanwhile.
        if (navRef.current?.dest !== current.dest || navRef.current?.mode !== current.mode) return;
        const progress = progressFor(route, from, current.dest);
        update((n) => n && { ...n, route, progress, status: progress.arrived ? "arrived" : "navigating", error: null, rerouting: false });
      } catch (err) {
        if (navRef.current?.dest !== current.dest) return;
        // Keep following an existing route if only the re-route failed.
        update((n) => n && (n.route ? { ...n, rerouting: false } : { ...n, status: "error", error: err.message }));
      } finally {
        routingRef.current = false;
      }
    },
    [apiKey, update],
  );

  const handlePosition = useCallback(
    (p) => {
      const prev = posRef.current;
      let heading = Number.isFinite(p.heading) ? p.heading : prev?.heading ?? null;
      if (prev && distanceMeters(prev, p) > 3) heading = Number.isFinite(p.heading) ? p.heading : bearing(prev, p);
      const next = { lat: p.lat, lng: p.lng, acc: p.acc, heading };
      posRef.current = next; // raw GPS, used for heading and route math

      const n = navRef.current;
      if (!n || n.status === "error" || !n.route || n.status === "arrived") {
        setPos(next);
        if (n && !n.route && n.status !== "error") requestRoute(next);
        return;
      }
      const progress = progressFor(n.route, next, n.dest);
      const offRoute = progress.off > Math.max(settingsFor(n.mode).offRouteM, (p.acc || 0) * 1.2);
      setPos(displayPosition(n.route, next, progress)); // the dot rides the path when you're on it
      update((cur) => cur && { ...cur, progress, status: progress.arrived ? "arrived" : "navigating" });
      if (offRoute && !progress.arrived && Date.now() - lastRerouteRef.current > REROUTE_COOLDOWN_MS && (p.acc || 0) < 60) {
        lastRerouteRef.current = Date.now();
        update((cur) => cur && { ...cur, rerouting: true });
        requestRoute(next);
      }
    },
    [requestRoute, update],
  );

  const stopWatching = useCallback(() => {
    if (watchRef.current != null) navigator.geolocation?.clearWatch(watchRef.current);
    watchRef.current = null;
    wakeLockRef.current?.release?.().catch(() => {});
    wakeLockRef.current = null;
  }, []);

  const watch = useCallback(() => {
    if (!window.isSecureContext) {
      update((n) => n && { ...n, status: "error", error: "Browsers only share location on https:// sites or http://localhost. Open MavMap from one of those to navigate." });
      return;
    }
    if (!("geolocation" in navigator)) {
      update((n) => n && { ...n, status: "error", error: "This browser can't share your location." });
      return;
    }
    if (watchRef.current != null) return;
    watchRef.current = navigator.geolocation.watchPosition(
      (g) => handlePosition({ lat: g.coords.latitude, lng: g.coords.longitude, acc: g.coords.accuracy, heading: g.coords.heading }),
      (err) => {
        // Timeouts while already navigating just mean a missed update; keep going.
        if (navRef.current?.route && err.code !== 1) return;
        update((n) => n && { ...n, status: "error", error: geoErrorMessage(err) });
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 },
    );
    // Keep the phone screen on while navigating (where supported).
    navigator.wakeLock?.request?.("screen").then((lock) => (wakeLockRef.current = lock)).catch(() => {});
  }, [handlePosition, update]);

  const start = useCallback(
    (dest, mode = "WALK") => {
      stopWatching();
      posRef.current = null;
      setPos(null);
      lastRerouteRef.current = 0;
      update({ dest, mode, status: "locating" });
      watch();
    },
    [stopWatching, update, watch],
  );

  /** Switch between walking and driving without losing your location. */
  const setMode = useCallback(
    (mode) => {
      const n = navRef.current;
      if (!n || n.mode === mode) return;
      routingRef.current = false; // a walking request still in flight is ignored when it lands
      update({ dest: n.dest, mode, status: posRef.current ? "routing" : "locating" });
      if (posRef.current) requestRoute(posRef.current);
    },
    [requestRoute, update],
  );

  const stop = useCallback(() => {
    stopWatching();
    update(null);
    posRef.current = null;
    setPos(null);
  }, [stopWatching, update]);

  const retry = useCallback(() => {
    const n = navRef.current;
    if (n) start(n.dest, n.mode);
  }, [start]);

  useEffect(() => stopWatching, [stopWatching]);

  return { nav, pos, start, stop, retry, setMode };
}

/** One-off location fix (for "how long to my next class?"). Resolves { lat, lng, acc }. */
export function getCurrentLocation() {
  return new Promise((resolve, reject) => {
    if (!window.isSecureContext) return reject(new Error("Browsers only share location on https:// sites or http://localhost."));
    if (!("geolocation" in navigator)) return reject(new Error("This browser can't share your location."));
    navigator.geolocation.getCurrentPosition(
      (g) => resolve({ lat: g.coords.latitude, lng: g.coords.longitude, acc: g.coords.accuracy }),
      (err) => reject(new Error(geoErrorMessage(err))),
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 20000 },
    );
  });
}
