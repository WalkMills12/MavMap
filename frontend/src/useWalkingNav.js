import { useEffect, useRef, useState } from "react";
import { fetchWalkingRoute } from "./api.js";
import { decodePolyline, distanceMeters } from "./geo.js";

const REFETCH_AFTER_M = 25; // ask for a new route once you've walked this far
const MIN_GAP_MS = 8000; // never ask more often than this (each route request is billed)
const ARRIVED_M = 30;
const WALK_SPEED = 1.35; // m/s, for the straight-line fallback

/**
 * Turn a live position + destination into a walking route that keeps up as you move.
 * Returns { route: { path, distance_m, duration_s, approximate }, remaining_m, arrived }.
 */
export function useWalkingNav(position, target) {
  const [route, setRoute] = useState(null);
  const last = useRef({ at: 0, from: null });

  useEffect(() => {
    setRoute(null);
    last.current = { at: 0, from: null };
  }, [target?.id]);

  useEffect(() => {
    if (!position || !target) return;
    const { at, from } = last.current;
    const moved = from ? distanceMeters(from, position) : Infinity;
    if (moved < REFETCH_AFTER_M) return;
    if (Date.now() - at < MIN_GAP_MS) return;
    last.current = { at: Date.now(), from: position };

    let cancelled = false;
    fetchWalkingRoute(position, target)
      .then((r) => {
        if (cancelled || !r.polyline) return;
        const path = decodePolyline(r.polyline);
        const end = r.target_lat != null ? { lat: r.target_lat, lng: r.target_lng } : { lat: target.lat, lng: target.lng };
        // The path stops on the nearest walkway; add the last steps to the door.
        const extra = path.length ? distanceMeters(path[path.length - 1], end) : 0;
        setRoute({
          path,
          end,
          endKind: r.target_kind || "center",
          distance_m: r.distance_m + extra,
          duration_s: r.duration_s + extra / WALK_SPEED,
          approximate: false,
        });
      })
      .catch(() => {
        if (cancelled) return;
        // No route service (no key, or offline): straight line with a walking-time estimate.
        const d = distanceMeters(position, target) * 1.25;
        const end = { lat: target.lat, lng: target.lng };
        setRoute({ path: [position, end], end, endKind: "center", distance_m: d, duration_s: d / WALK_SPEED, approximate: true });
      });
    return () => {
      cancelled = true;
    };
  }, [position, target]);

  // Measure to the door we're routing to (falls back to the building center).
  const goal = route?.end || target;
  const remaining = position && goal ? distanceMeters(position, goal) : null;
  const atBuilding = position && target ? distanceMeters(position, target) <= ARRIVED_M : false;
  return { route, remaining_m: remaining, arrived: (remaining != null && remaining <= 20) || atBuilding };
}
