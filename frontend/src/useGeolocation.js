import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createGpsFilter } from "./gpsFilter.js";

const POLL_MS = 4000; // also ask for a fresh fix this often (see below)

/**
 * Live, smoothed device position while `enabled`.
 *
 * Returns { position, error, status, updatedAt, enableCompass } where position is
 * { lat, lng, accuracy (m), heading (deg|null) } and status is
 * "off" | "locating" | "ok" | "error".
 *
 * - Fixes go through a Kalman filter (gpsFilter.js): phones stop jittering, laptops stop jumping.
 * - watchPosition alone often goes quiet on laptops and some phones (it only fires when the OS
 *   decides the position changed), so we also poll getCurrentPosition.
 * - Heading comes from the GPS while walking, and from the phone's compass otherwise.
 *   iPhones only allow the compass after a tap, so call enableCompass() from a click handler.
 *
 * Browsers only allow location on https:// pages or http://localhost.
 */
export function useGeolocation(enabled) {
  const [position, setPosition] = useState(null);
  const [error, setError] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [compass, setCompass] = useState(null); // degrees clockwise from north
  const gpsHeading = useRef(null);
  const filterRef = useRef(null);

  useEffect(() => {
    if (!enabled) {
      setError(null);
      setPosition(null);
      filterRef.current = null;
      return;
    }
    if (!("geolocation" in navigator)) {
      setError("This browser can't share your location.");
      return;
    }
    if (!window.isSecureContext) {
      setError("Location needs a secure (https) page. See \"GPS on your phone\" in the README.");
      return;
    }
    setError(null);
    filterRef.current = createGpsFilter();

    const onFix = (p) => {
      const smoothed = filterRef.current?.({
        lat: p.coords.latitude,
        lng: p.coords.longitude,
        accuracy: p.coords.accuracy,
        timestamp: p.timestamp,
      });
      setUpdatedAt(Date.now());
      setError(null);
      const moving = Number.isFinite(p.coords.heading) && p.coords.speed > 0.5;
      if (moving) gpsHeading.current = p.coords.heading;
      else if (p.coords.speed === 0) gpsHeading.current = null;
      if (!smoothed) return; // dropped as an outlier
      setPosition((prev) => {
        if (prev && Math.abs(prev.lat - smoothed.lat) < 1e-7 && Math.abs(prev.lng - smoothed.lng) < 1e-7) return prev;
        return { ...smoothed, gpsHeading: gpsHeading.current };
      });
    };
    const onError = (err) => {
      if (err.code === err.PERMISSION_DENIED) {
        setError("Location is blocked. Allow location access for this site, then try again.");
      } else if (err.code === err.POSITION_UNAVAILABLE) {
        setError("Couldn't get your location. Check that location services (and Wi-Fi on laptops) are on.");
      }
      // TIMEOUT: keep the last position and try again on the next poll.
    };
    const opts = { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 };

    const watchId = navigator.geolocation.watchPosition(onFix, onError, opts);
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") navigator.geolocation.getCurrentPosition(onFix, onError, opts);
    }, POLL_MS);

    return () => {
      navigator.geolocation.clearWatch(watchId);
      clearInterval(poll);
    };
  }, [enabled]);

  // Phone compass, so the arrow points the way you're facing even when standing still.
  const [compassOn, setCompassOn] = useState(false);
  useEffect(() => {
    if (!enabled || !compassOn) return;
    let last = 0;
    const onOrient = (e) => {
      let deg = null;
      if (typeof e.webkitCompassHeading === "number") deg = e.webkitCompassHeading; // iPhone
      else if (e.absolute && typeof e.alpha === "number") deg = (360 - e.alpha) % 360; // Android
      if (deg == null) return;
      const now = performance.now();
      if (now - last < 150) return; // ~6 updates a second is plenty
      last = now;
      setCompass((prev) => (prev != null && Math.abs(((deg - prev + 540) % 360) - 180) < 3 ? prev : Math.round(deg)));
    };
    const evt = "ondeviceorientationabsolute" in window ? "deviceorientationabsolute" : "deviceorientation";
    window.addEventListener(evt, onOrient, true);
    return () => window.removeEventListener(evt, onOrient, true);
  }, [enabled, compassOn]);

  /** Call from a tap/click (iPhone asks for permission). Laptops simply have no compass. */
  const enableCompass = useCallback(async () => {
    try {
      const D = window.DeviceOrientationEvent;
      if (D && typeof D.requestPermission === "function") {
        const res = await D.requestPermission();
        if (res !== "granted") return;
      }
      setCompassOn(true);
    } catch {
      // No compass or permission refused: the GPS heading still works while walking.
    }
  }, []);

  const status = !enabled ? "off" : error ? "error" : position ? "ok" : "locating";
  const heading = position?.gpsHeading ?? compass;
  // Same object until something changes, so the map doesn't re-pan on every render.
  const out = useMemo(() => (enabled && position ? { ...position, heading } : null), [enabled, position, heading]);
  return {
    position: out,
    error,
    status,
    updatedAt: enabled ? updatedAt : null,
    enableCompass,
  };
}
